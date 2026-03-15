import { Logger } from '../../../SDK/logger';
import type { WorldTemplate, TemplateTableDef } from '../template/types';
import type { TemplateManager } from '../template/template-manager';
import type { ChatStateManager } from './chat-state-manager';
import type { FactsManager } from './facts-manager';
import type { DBFact } from '../db/db';
import { DEFAULT_PROMPT_TRIM_BUDGET, type PromptTrimBudget } from '../types';

const logger = new Logger('PromptTrimmer');

export interface SchemaContextResult {
    /** 构建来源 */
    source: 'active_draft' | 'active_final' | 'base_schema' | 'fallback_prompt';
    /** schema 摘要文本 */
    schemaSummary: string;
    /** 数据快照文本 */
    dataSnapshot: string;
    /** 是否降级 */
    degraded: boolean;
    /** 降级原因 */
    degradeReason?: string;
}

/**
 * schemaContext 构建与 Prompt 裁剪
 *
 * 构建顺序（降级链）：
 * 1. 当前 active draft revision
 * 2. 当前 active final revision
 * 3. 当前聊天的基础表 schema
 * 4. 通用提取提示词
 *
 * 降级不阻断抽取
 */
export class PromptTrimmer {
    private chatKey: string;
    private templateManager: TemplateManager;
    private chatStateManager: ChatStateManager;
    private factsManager: FactsManager;

    constructor(
        chatKey: string,
        templateManager: TemplateManager,
        chatStateManager: ChatStateManager,
        factsManager: FactsManager,
    ) {
        this.chatKey = chatKey;
        this.templateManager = templateManager;
        this.chatStateManager = chatStateManager;
        this.factsManager = factsManager;
    }

    /**
     * 构建完整的 schemaContext（schema 摘要 + 数据快照）
     * @param mode 'extract' | 'summarize'
     * @param windowKeywords 当前窗口提取出的关键词
     */
    async buildSchemaContext(
        mode: 'extract' | 'summarize',
        windowKeywords: string[] = [],
    ): Promise<SchemaContextResult> {
        const budget = mode === 'extract'
            ? DEFAULT_PROMPT_TRIM_BUDGET.extract
            : DEFAULT_PROMPT_TRIM_BUDGET.summarize;

        // 降级链
        const template = await this.tryGetActiveTemplate();

        if (!template) {
            return {
                source: 'fallback_prompt',
                schemaSummary: '请以通用视角提取角色、关系、位置与状态。',
                dataSnapshot: '',
                degraded: true,
                degradeReason: '无活跃模板',
            };
        }

        const source = this.determineSource(template);

        try {
            const schemaSummary = this.buildSchemaSummary(template);
            const dataSnapshot = await this.buildDataSnapshot(template, budget, windowKeywords);

            return {
                source,
                schemaSummary,
                dataSnapshot,
                degraded: false,
            };
        } catch (e) {
            logger.warn('schemaContext 构建异常，降级到通用提示', e);
            return {
                source: 'fallback_prompt',
                schemaSummary: '请以通用视角提取角色、关系、位置与状态。',
                dataSnapshot: '',
                degraded: true,
                degradeReason: String(e),
            };
        }
    }

    /**
     * 尝试获取活跃模板，任何错误都不阻断
     */
    private async tryGetActiveTemplate(): Promise<WorldTemplate | null> {
        try {
            return await this.templateManager.getActiveTemplate();
        } catch (e) {
            logger.warn('获取活跃模板失败', e);
            return null;
        }
    }

    /**
     * 判断模板来源
     */
    private determineSource(template: WorldTemplate): SchemaContextResult['source'] {
        if (template.revisionState === 'draft') return 'active_draft';
        if (template.revisionState === 'final') return 'active_final';
        return 'base_schema';
    }

    /**
     * 构建 schema 摘要：表名 + 用途 + 主键 + 字段清单 + 规范摘要
     * 允许全量但压缩格式
     */
    private buildSchemaSummary(template: WorldTemplate): string {
        const tables = template.tables ?? [];
        if (tables.length === 0) {
            return '## 当前知识表结构\n- 当前模板未声明可用表结构';
        }

        const lines: string[] = ['## 当前知识表结构'];
        for (const table of tables) {
            const fieldList = table.fields.map(f => {
                const pk = f.isPrimaryKey ? '(PK)' : '';
                const tier = f.tier === 'extension' ? '[ext]' : '';
                return `${f.key}${pk}${tier}`;
            }).join(', ');

            lines.push(`### ${table.label} (${table.key})${table.isBase ? ' [基础表]' : ''}`);
            if (table.description) {
                lines.push(`  用途: ${table.description}`);
            }
            lines.push(`  字段: ${fieldList}`);
        }

        return lines.join('\n');
    }

    /**
     * 构建数据快照：裁剪后的表数据
     * 优先级：命中关键词 > 最近更新 > 基础表优先
     */
    private async buildDataSnapshot(
        template: WorldTemplate,
        budget: { maxTables: number; maxRowsPerTable: number; maxFieldsPerRow?: number },
        windowKeywords: string[],
    ): Promise<string> {
        const tables = template.tables ?? [];
        const tombstones = await this.chatStateManager.getRowTombstones();

        // 按优先级排序表
        const rankedTables = this.rankTables(tables, windowKeywords);
        const selectedTables = rankedTables.slice(0, budget.maxTables);

        const sections: string[] = [];

        for (const table of selectedTables) {
            const allFacts = await this.factsManager.query({
                type: table.key,
                limit: 200,
            });

            if (allFacts.length === 0) continue;

            // 按 entity.id 分组行
            const rowMap = new Map<string, DBFact[]>();
            for (const fact of allFacts) {
                const rowId = fact.entity?.id ?? '_';
                // 忽略 tombstone 行
                if (tombstones[table.key]?.[rowId]) continue;
                if (!rowMap.has(rowId)) rowMap.set(rowId, []);
                rowMap.get(rowId)!.push(fact);
            }

            // 按优先级排序行
            const rankedRows = this.rankRows([...rowMap.entries()], windowKeywords);
            const selectedRows = rankedRows.slice(0, budget.maxRowsPerTable);
            const maxFields = budget.maxFieldsPerRow ?? 6;

            const lines: string[] = [`### ${table.label} (${table.key})`];
            for (const [rowId, facts] of selectedRows) {
                const fieldValues = facts
                    .slice(0, maxFields)
                    .map(f => `${f.path ?? '?'}=${this.truncateValue(f.value)}`)
                    .join(', ');
                lines.push(`  - ${rowId}: ${fieldValues}`);
            }

            sections.push(lines.join('\n'));
        }

        return sections.length > 0
            ? `## 当前知识数据快照\n${sections.join('\n')}`
            : '';
    }

    /**
     * 按优先级排序表：基础表优先 + 关键词命中
     */
    private rankTables(tables: TemplateTableDef[], keywords: string[]): TemplateTableDef[] {
        return [...tables].sort((a, b) => {
            const scoreA = (a.isBase ? 10 : 0) + this.keywordScore(a.key + ' ' + (a.label ?? ''), keywords);
            const scoreB = (b.isBase ? 10 : 0) + this.keywordScore(b.key + ' ' + (b.label ?? ''), keywords);
            return scoreB - scoreA;
        });
    }

    /**
     * 按优先级排序行：关键词命中 + 最近更新
     */
    private rankRows(
        rows: Array<[string, DBFact[]]>,
        keywords: string[],
    ): Array<[string, DBFact[]]> {
        return [...rows].sort((a, b) => {
            const textA = a[0] + ' ' + a[1].map(f => String(f.value ?? '')).join(' ');
            const textB = b[0] + ' ' + b[1].map(f => String(f.value ?? '')).join(' ');
            const scoreA = this.keywordScore(textA, keywords) + this.recencyScore(a[1]);
            const scoreB = this.keywordScore(textB, keywords) + this.recencyScore(b[1]);
            return scoreB - scoreA;
        });
    }

    private keywordScore(text: string, keywords: string[]): number {
        if (!keywords.length) return 0;
        const lower = text.toLowerCase();
        return keywords.reduce((count, kw) => count + (lower.includes(kw.toLowerCase()) ? 1 : 0), 0);
    }

    private recencyScore(facts: DBFact[]): number {
        const maxTs = Math.max(0, ...facts.map(f => f.updatedAt ?? 0));
        const ageHours = (Date.now() - maxTs) / 3_600_000;
        return 1 / (1 + ageHours / 24);
    }

    private truncateValue(value: unknown): string {
        const str = typeof value === 'string' ? value : JSON.stringify(value ?? '');
        return str.length > 80 ? str.slice(0, 77) + '...' : str;
    }
}
