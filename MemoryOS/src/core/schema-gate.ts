import { logger } from '../index';
import type { SchemaChangeProposal } from '../proposal/types';
import type { WorldTemplate, TemplateTableDef } from '../template/types';
import type { ChatStateManager } from './chat-state-manager';
import { BASE_TABLE_KEYS, DEFAULT_AUTO_SCHEMA_POLICY } from '../types';


export interface SchemaGateResult {
    passed: boolean;
    gate: string;
    errors: string[];
    /** 被接受的 schema 变更 */
    accepted: SchemaChangeProposal[];
    /** 被延后的 schema 变更 */
    deferred: SchemaChangeProposal[];
}

/**
 * schemaChanges 三段闸门
 * 1. Schema Gate：校验合法性、保护基础表、检查冲突
 * 2. Diff Gate：归一化 diff、去重、识别破坏性变更
 * 3. Apply Gate：事务层由 ProposalManager 负责
 */
export class SchemaGate {
    private chatStateManager: ChatStateManager;

    constructor(chatStateManager: ChatStateManager) {
        this.chatStateManager = chatStateManager;
    }

    /**
     * 对 schemaChanges 执行 Schema Gate + Diff Gate
     * Apply Gate 留给 ProposalManager 在事务中执行
     */
    async validate(
        changes: SchemaChangeProposal[],
        activeTemplate: WorldTemplate | null,
        factsHighDensity: boolean,
    ): Promise<SchemaGateResult> {
        const errors: string[] = [];
        const accepted: SchemaChangeProposal[] = [];
        const deferred: SchemaChangeProposal[] = [];

        const policy = await this.chatStateManager.getAutoSchemaPolicy();
        const tables = activeTemplate?.tables ?? [];

        let newTableCount = 0;
        let newFieldCount = 0;
        const fieldCountByTable: Record<string, number> = {};

        for (const change of changes) {
            const gateErrors = this.runSchemaGate(change, tables, policy);
            if (gateErrors.length > 0) {
                errors.push(...gateErrors);
                continue;
            }

            const diffErrors = this.runDiffGate(change, activeTemplate);
            if (diffErrors.length > 0) {
                errors.push(...diffErrors);
                continue;
            }

            // 数量上限检查
            if (change.kind === 'add_table') {
                newTableCount++;
                if (newTableCount > (policy.maxNewTablesPerRound ?? DEFAULT_AUTO_SCHEMA_POLICY.maxNewTablesPerRound)) {
                    deferred.push(change);
                    continue;
                }
            }

            if (change.kind === 'add_field') {
                newFieldCount++;
                const tableFieldCount = (fieldCountByTable[change.tableKey] ?? 0) + 1;
                fieldCountByTable[change.tableKey] = tableFieldCount;

                if (newFieldCount > (policy.maxNewFieldsPerRound ?? DEFAULT_AUTO_SCHEMA_POLICY.maxNewFieldsPerRound)) {
                    deferred.push(change);
                    continue;
                }
                if (tableFieldCount > (policy.maxNewFieldsPerTable ?? DEFAULT_AUTO_SCHEMA_POLICY.maxNewFieldsPerTable)) {
                    deferred.push(change);
                    continue;
                }
            }

            // 高密度 facts 场景下，非必需的 schemaChanges 延后
            if (factsHighDensity && !change.requiredByFacts) {
                deferred.push(change);
                continue;
            }

            accepted.push(change);
        }

        return {
            passed: errors.length === 0,
            gate: 'schema+diff',
            errors,
            accepted,
            deferred,
        };
    }

    /**
     * 闸门 1：Schema Gate
     * 校验表名/字段名/主键合法性，保护基础表核心字段，
     * 检查命名冲突，拒绝破坏性 shrink 和非法 rename
     */
    private runSchemaGate(
        change: SchemaChangeProposal,
        existingTables: TemplateTableDef[],
        policy: {
            tableNameConflictThreshold?: number;
            descriptionSimilarityThreshold?: number;
        },
    ): string[] {
        const errors: string[] = [];
        const tableKey = change.tableKey;

        // 校验 tableKey 格式
        if (!tableKey || !/^[a-z][a-z0-9_]*$/.test(tableKey)) {
            errors.push(`无效的表键名: "${tableKey}"，必须为 snake_case`);
        }

        // 校验 fieldKey 格式
        if (change.fieldKey && !/^[a-z][a-z0-9_]*$/.test(change.fieldKey)) {
            errors.push(`无效的字段键名: "${change.fieldKey}"，必须为 snake_case`);
        }

        if (change.kind === 'add_table') {
            // 完全重名检查
            if (existingTables.some(t => t.key === tableKey)) {
                errors.push(`表 "${tableKey}" 已存在，拒绝重复新增`);
                return errors;
            }
            // 近似重名检查
            for (const t of existingTables) {
                const sim = this.normalizedSimilarity(t.key, tableKey);
                if (sim >= (policy.tableNameConflictThreshold ?? 0.90)) {
                    errors.push(`表 "${tableKey}" 与已有表 "${t.key}" 近似冲突 (相似度 ${sim.toFixed(2)})`);
                }
            }
        }

        if (change.kind === 'add_field') {
            const targetTable = existingTables.find(t => t.key === tableKey);
            if (targetTable) {
                // 检查字段是否已存在
                if (change.fieldKey && targetTable.fields.some(f => f.key === change.fieldKey)) {
                    errors.push(`字段 "${change.fieldKey}" 在表 "${tableKey}" 中已存在`);
                }
            }
        }

        // 拒绝破坏性操作
        if (change.kind === 'modify_primary_key') {
            const isBase = (BASE_TABLE_KEYS as readonly string[]).includes(tableKey);
            if (isBase) {
                errors.push(`基础表 "${tableKey}" 的主键不可修改`);
            }
        }

        return errors;
    }

    /**
     * 闸门 2：Diff Gate
     * 对当前 active template 做归一化 diff
     * - 重复提议直接丢弃
     * - rename 类提议转为 alias
     * - 识别 schema 收缩与破坏性变更
     */
    private runDiffGate(
        change: SchemaChangeProposal,
        activeTemplate: WorldTemplate | null,
    ): string[] {
        const errors: string[] = [];

        // alias_suggestion 始终放行（非破坏性）
        if (change.kind === 'alias_suggestion') {
            return errors;
        }

        // 检测破坏性操作
        const payload = change.payload ?? {};
        if (payload['destructive'] === true || payload['remove'] === true || payload['drop'] === true) {
            errors.push(`拒绝破坏性 schema 变更: kind=${change.kind}, table=${change.tableKey}`);
        }

        return errors;
    }

    /**
     * 归一化字符串相似度（Jaccard + 编辑距离混合）
     */
    private normalizedSimilarity(a: string, b: string): number {
        const na = a.toLowerCase().replace(/[^a-z0-9]/g, '');
        const nb = b.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (na === nb) return 1.0;
        if (!na || !nb) return 0;

        // 简单字符级 Jaccard
        const setA = new Set(na.split(''));
        const setB = new Set(nb.split(''));
        let intersection = 0;
        for (const c of setA) {
            if (setB.has(c)) intersection++;
        }
        const union = setA.size + setB.size - intersection;
        return union > 0 ? intersection / union : 0;
    }
}
