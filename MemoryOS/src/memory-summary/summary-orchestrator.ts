import type { MemoryEntry, RoleEntryMemory, SummarySnapshot, WorldProfileBinding } from '../types';
import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import { buildSummaryMutationContext } from '../memory-summary-planner';
import { applySummaryMutation, type MutationApplyDependencies } from './mutation-applier';
import {
    validateSummaryMutationDocument,
    type EditableFieldMap,
} from './mutation-validator';
import { buildSummaryWindow, type SummaryWindowMessage } from './summary-window';
import type { SummaryMutationDocument, SummaryPlannerOutput } from './mutation-types';
import type { MemoryLLMApi } from './llm-types';

/**
 * 功能：总结编排器依赖。
 */
export interface SummaryOrchestratorDependencies extends MutationApplyDependencies {
    listEntries(): Promise<MemoryEntry[]>;
    listRoleMemories(actorKey?: string): Promise<RoleEntryMemory[]>;
    listSummarySnapshots(limit?: number): Promise<SummarySnapshot[]>;
    getWorldProfileBinding(): Promise<WorldProfileBinding | null>;
    appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<unknown>;
}

/**
 * 功能：总结编排输入。
 */
export interface RunSummaryOrchestratorInput {
    dependencies: SummaryOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    messages: SummaryWindowMessage[];
    enableEmbedding: boolean;
    retrievalRulePack: 'native' | 'perocore' | 'hybrid';
}

/**
 * 功能：总结编排结果。
 */
export interface RunSummaryOrchestratorResult {
    snapshot: SummarySnapshot | null;
    diagnostics: {
        usedLLM: boolean;
        retrievalProviderId: string;
        matchedEntryIds: string[];
        worldProfile: string;
        reasonCode: string;
    };
}

/**
 * 功能：执行总结编排流程。
 * @param input 编排输入。
 * @returns 编排结果。
 */
export async function runSummaryOrchestrator(input: RunSummaryOrchestratorInput): Promise<RunSummaryOrchestratorResult> {
    const summaryLanguageInstruction = '除 action、targetKind、candidateId、compareKey、reasonCodes 及各类键名外，所有自然语言内容必须使用简体中文。';
    await input.dependencies.appendMutationHistory({
        action: 'summary_started',
        payload: { messageCount: input.messages.length },
    });
    const window = buildSummaryWindow(input.messages);
    if (!window.summaryText.trim()) {
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: { reasonCode: 'empty_window' },
        });
        return {
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: 'none',
                matchedEntryIds: [],
                worldProfile: 'unknown',
                reasonCode: 'empty_window',
            },
        };
    }
    const entries = await input.dependencies.listEntries();
    const roleMemories = await input.dependencies.listRoleMemories();
    const recentSummaries = await input.dependencies.listSummarySnapshots(4);
    const worldProfileBinding = await input.dependencies.getWorldProfileBinding();
    const memoryPercentByEntryId = buildEntryMemoryPercentMap(roleMemories);
    const worldProfileTexts = [
        window.summaryText,
        ...entries.slice(0, 40).map((entry: MemoryEntry): string => `${entry.title} ${entry.summary}`),
    ];
    const plannerResult = await buildSummaryMutationContext({
        task: 'memory_summary_mutation',
        schemaVersion: '1.0.0',
        window,
        actorHints: window.actorHints,
        entries,
        memoryPercentByEntryId,
        recentSummaries: recentSummaries.map((summary: SummarySnapshot) => ({
            title: summary.title,
            content: summary.content,
            updatedAt: summary.updatedAt,
        })),
        worldProfileTexts,
        worldProfileBinding,
        enableEmbedding: input.enableEmbedding,
        rulePackMode: input.retrievalRulePack,
    });
    await input.dependencies.appendMutationHistory({
        action: 'candidate_types_resolved',
        payload: {
            candidateTypes: plannerResult.context.detectedSignals.candidateTypes,
            worldProfile: plannerResult.diagnostics.worldProfile,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'type_schemas_resolved',
        payload: {
            schemaIds: plannerResult.context.typeSchemas.map((schema): string => schema.schemaId),
            worldProfile: plannerResult.diagnostics.worldProfile,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'candidate_records_resolved',
        payload: {
            retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
            matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
            candidateCount: plannerResult.context.candidateRecords.length,
        },
    });
    if (!input.llm) {
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: {
                reasonCode: 'llm_unavailable',
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        return {
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode: 'llm_unavailable',
            },
        };
    }
    const plannerPromptPack = await loadPromptPackSections();
    const plannerSchema = parseJsonSection(plannerPromptPack.SUMMARY_PLANNER_SCHEMA);
    const plannerSample = parseJsonSection(plannerPromptPack.SUMMARY_PLANNER_OUTPUT_SAMPLE);
    const plannerSystemPrompt = `${plannerPromptPack.SUMMARY_PLANNER_SYSTEM}\n\n${summaryLanguageInstruction}`;
    const plannerUserPayload = buildStructuredTaskUserPayload(
        JSON.stringify(plannerResult.context, null, 2),
        JSON.stringify(plannerSchema ?? {}, null, 2),
        JSON.stringify(plannerSample ?? {}, null, 2),
    );
    const plannerLLMResult = await input.llm.runTask<SummaryPlannerOutput>({
        consumer: input.pluginId,
        taskId: 'memory_summary_planner',
        taskDescription: 'AI总结规划',
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: plannerSystemPrompt },
                { role: 'user', content: plannerUserPayload },
            ],
        },
        schema: plannerSchema,
        enqueue: { displayMode: 'compact' },
    });
    const plannerDecision = normalizePlannerOutput(plannerLLMResult.ok ? plannerLLMResult.data : plannerResult.context.plannerHints);
    await input.dependencies.appendMutationHistory({
        action: 'summary_planner_resolved',
        payload: {
            shouldUpdate: plannerDecision.should_update,
            focusTypes: plannerDecision.focus_types,
            entities: plannerDecision.entities,
            topics: plannerDecision.topics,
            reasons: plannerDecision.reasons,
        },
    });
    const actorKeys = window.actorHints.length > 0 ? window.actorHints : ['user'];
    if (!plannerDecision.should_update) {
        const noopDocument: SummaryMutationDocument = {
            schemaVersion: '1.0.0',
            window: {
                fromTurn: plannerResult.context.window.fromTurn,
                toTurn: plannerResult.context.window.toTurn,
            },
            actions: [
                {
                    action: 'NOOP',
                    targetKind: plannerDecision.focus_types[0] || 'other',
                    reason: plannerDecision.reasons[0] || '当前区间没有稳定长期变更。',
                    confidence: 0.9,
                    reasonCodes: ['planner_noop'],
                },
            ],
        };
        await input.dependencies.appendMutationHistory({
            action: 'mutation_validated',
            payload: {
                actionCount: 1,
                plannerNoop: true,
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        const snapshot = await applySummaryMutation({
            dependencies: input.dependencies,
            mutationDocument: noopDocument,
            candidateRecords: plannerResult.context.candidateRecords,
            actorKeys,
            summaryTitle: '结构化回合总结',
            summaryContent: plannerResult.context.window.summaryText,
        });
        await input.dependencies.appendMutationHistory({
            action: 'mutation_applied',
            payload: {
                summaryId: snapshot.summaryId,
                actionCount: 1,
                plannerNoop: true,
            },
        });
        return {
            snapshot,
            diagnostics: {
                usedLLM: true,
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode: 'planner_noop',
            },
        };
    }
    const promptPack = plannerPromptPack;
    const summarySchema = parseJsonSection(promptPack.SUMMARY_SCHEMA);
    const strictSummarySchema = buildStrictSummaryMutationSchema(summarySchema, plannerResult.context.typeSchemas);
    const summaryOutputSample = parseJsonSection(promptPack.SUMMARY_OUTPUT_SAMPLE);
    const summarySystemPrompt = `${renderPromptTemplate(promptPack.SUMMARY_SYSTEM, {
        worldProfile: plannerResult.diagnostics.worldProfile,
    })}\n\n${summaryLanguageInstruction}`;
    const mutationContext = {
        ...plannerResult.context,
        plannerDecision,
    };
    const summaryUserPayload = buildStructuredTaskUserPayload(
        JSON.stringify(mutationContext, null, 2),
        JSON.stringify(strictSummarySchema ?? {}, null, 2),
        JSON.stringify(summaryOutputSample ?? {}, null, 2),
    );
    const result = await input.llm.runTask<SummaryMutationDocument>({
        consumer: input.pluginId,
        taskId: 'memory_summary_mutation',
        taskDescription: 'AI总结',
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: summarySystemPrompt },
                { role: 'user', content: summaryUserPayload },
            ],
        },
        schema: strictSummarySchema,
        enqueue: { displayMode: 'compact' },
    });

    if (!result.ok) {
        const reasonCode = result.reasonCode || 'summary_llm_failed';
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: {
                reasonCode,
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        return {
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode,
            },
        };
    }

    const editableFieldMap = buildEditableFieldMap(plannerResult.context.typeSchemas);
    const validation = validateSummaryMutationDocument(result.data, editableFieldMap);
    if (!validation.valid || !validation.document) {
        const reasonCode = `validation_failed:${validation.errors.join(',') || 'unknown'}`;
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: {
                reasonCode,
                validationErrors: validation.errors,
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        return {
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode,
            },
        };
    }
    await input.dependencies.appendMutationHistory({
        action: 'mutation_validated',
        payload: {
            actionCount: validation.document.actions.length,
            plannerDecision,
            worldProfile: plannerResult.diagnostics.worldProfile,
        },
    });
    const snapshot = await applySummaryMutation({
        dependencies: input.dependencies,
        mutationDocument: validation.document,
        candidateRecords: plannerResult.context.candidateRecords,
        actorKeys,
        summaryTitle: '结构化回合总结',
        summaryContent: plannerResult.context.window.summaryText,
    });
    await input.dependencies.appendMutationHistory({
        action: 'mutation_applied',
        payload: {
            summaryId: snapshot.summaryId,
            actionCount: validation.document.actions.length,
        },
    });
    return {
        snapshot,
        diagnostics: {
            usedLLM: true,
            retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
            matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
            worldProfile: plannerResult.diagnostics.worldProfile,
            reasonCode: 'ok',
        },
    };
}

/**
 * 功能：归一化 Planner 输出。
 * @param value 原始值。
 * @returns 归一化结果。
 */
function normalizePlannerOutput(value: unknown): SummaryPlannerOutput {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    return {
        should_update: source.should_update === true,
        focus_types: normalizeStringArray(source.focus_types),
        entities: normalizeStringArray(source.entities),
        topics: normalizeStringArray(source.topics),
        reasons: normalizeStringArray(source.reasons),
    };
}

/**
 * 功能：归一化字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: string[] = [];
    for (const item of value) {
        const normalized = String(item ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：构建 entryId -> memoryPercent 映射。
 * @param memories 角色记忆列表。
 * @returns 映射表。
 */
function buildEntryMemoryPercentMap(memories: RoleEntryMemory[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const memory of memories) {
        const current = map.get(memory.entryId) ?? 0;
        if (memory.memoryPercent > current) {
            map.set(memory.entryId, memory.memoryPercent);
        }
    }
    return map;
}

/**
 * 功能：构建字段白名单映射。
 * @param typeSchemas 类型白名单列表。
 * @returns 白名单映射。
 */
function buildEditableFieldMap(typeSchemas: Array<{ schemaId: string; editableFields: string[] }>): EditableFieldMap {
    const map: EditableFieldMap = new Map();
    for (const schema of typeSchemas) {
        map.set(schema.schemaId, new Set(schema.editableFields));
    }
    return map;
}

/**
 * 功能：从 prompt section 中提取 JSON 对象。
 * @param section section 原文。
 * @returns 解析后的 JSON。
 */
function parseJsonSection(section: string): unknown {
    const source = String(section ?? '').trim();
    if (!source) {
        return null;
    }
    const fenced = source.match(/```json[\s\S]*?```/i);
    const jsonText = fenced
        ? fenced[0].replace(/```json/i, '').replace(/```/g, '').trim()
        : source;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * 功能：为总结第二阶段构建兼容严格 json_schema 的 mutation schema。
 * @param baseSchema Prompt 中的基础 schema。
 * @param typeSchemas 当前轮次的可写字段白名单。
 * @returns 严格化后的 schema。
 */
function buildStrictSummaryMutationSchema(
    baseSchema: unknown,
    typeSchemas: Array<{ schemaId: string; editableFields: string[] }>,
): unknown {
    if (!baseSchema || typeof baseSchema !== 'object' || Array.isArray(baseSchema)) {
        return baseSchema;
    }
    const cloned = deepCloneRecord(baseSchema as Record<string, unknown>);
    const actionsRecord = readNestedRecord(cloned, ['properties', 'actions']);
    if (actionsRecord) {
        actionsRecord.items = buildStrictActionItemsSchema(typeSchemas);
    }
    ensureStrictRequired(cloned);
    return cloned;
}

/**
 * 功能：根据 targetKind 构建联动的严格 action schema。
 * @param typeSchemas 当前轮次的类型白名单。
 * @returns actions.items schema。
 */
function buildStrictActionItemsSchema(
    typeSchemas: Array<{ schemaId: string; editableFields: string[] }>,
): Record<string, unknown> {
    const branches: Record<string, unknown>[] = [];
    const targetKinds = Array.from(new Set(
        typeSchemas
            .map((typeSchema): string => String(typeSchema.schemaId ?? '').trim())
            .filter(Boolean),
    ));

    for (const typeSchema of typeSchemas) {
        const targetKind = String(typeSchema.schemaId ?? '').trim();
        if (!targetKind) {
            continue;
        }
        const payloadSchema = buildStrictMutationPayloadSchema(typeSchema.editableFields);
        for (const action of ['ADD', 'MERGE', 'UPDATE', 'INVALIDATE']) {
            branches.push(buildStrictActionBranch(action, targetKind, payloadSchema));
        }
        branches.push(buildStrictActionBranch('DELETE', targetKind, buildEmptyObjectSchema()));
        branches.push(buildStrictActionBranch('NOOP', targetKind, buildEmptyObjectSchema()));
    }

    if (branches.length <= 0) {
        return {
            type: 'object',
            additionalProperties: false,
            properties: {},
            required: [],
        };
    }

    return {
        oneOf: branches,
    };
}

/**
 * 功能：根据单个类型的可写字段构建严格 payload schema。
 * @param editableFields 当前类型允许写入的字段。
 * @returns payload schema。
 */
function buildStrictMutationPayloadSchema(editableFields: string[]): Record<string, unknown> {
    const rootFieldKeys = new Set<string>();
    const nestedFieldKeys = new Set<string>();
    for (const fieldPath of editableFields) {
        const normalized = String(fieldPath ?? '').trim();
        if (!normalized) {
            continue;
        }
        if (normalized.startsWith('fields.')) {
            const nestedKey = normalized.slice('fields.'.length).trim();
            if (nestedKey) {
                nestedFieldKeys.add(nestedKey);
            }
            continue;
        }
        rootFieldKeys.add(normalized);
    }

    const properties: Record<string, unknown> = {};
    Array.from(rootFieldKeys).sort().forEach((key: string): void => {
        properties[key] = buildLooseFieldSchema(key, false);
    });

    if (nestedFieldKeys.size > 0) {
        const fieldProperties: Record<string, unknown> = {};
        const fieldRequiredKeys: string[] = [];
        Array.from(nestedFieldKeys).sort().forEach((key: string): void => {
            fieldProperties[key] = buildLooseFieldSchema(key, true);
            fieldRequiredKeys.push(key);
        });
        properties.fields = {
            type: 'object',
            additionalProperties: false,
            properties: fieldProperties,
            required: fieldRequiredKeys,
        };
    }

    return {
        type: 'object',
        additionalProperties: false,
        properties,
        required: Object.keys(properties),
    };
}

/**
 * 功能：构建单个 action 分支 schema。
 * @param action 动作名称。
 * @param targetKind 目标类型。
 * @param payloadSchema 该类型专属 payload schema。
 * @returns 分支 schema。
 */
function buildStrictActionBranch(
    action: string,
    targetKind: string,
    payloadSchema: Record<string, unknown>,
): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            action: {
                type: 'string',
                enum: [action],
            },
            targetKind: {
                type: 'string',
                enum: [targetKind],
            },
            candidateId: { type: 'string' },
            compareKey: { type: 'string' },
            payload: payloadSchema,
            reasonCodes: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: ['action', 'targetKind', 'candidateId', 'compareKey', 'payload', 'reasonCodes'],
    };
}

/**
 * 功能：构建空对象 schema。
 * @returns 空对象 schema。
 */
function buildEmptyObjectSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
    };
}

/**
 * 功能：按字段名生成宽松但严格封闭的字段 schema。
 * @param key 字段名。
 * @param isNested 是否为 fields 下的子字段。
 * @returns 单字段 schema。
 */
function buildLooseFieldSchema(key: string, isNested: boolean): Record<string, unknown> {
    const normalizedKey = String(key ?? '').trim();
    if (normalizedKey === 'relationTag') {
        return {
            type: 'string',
            enum: ['亲人', '朋友', '盟友', '恋人', '暧昧', '师徒', '上下级', '竞争者', '情敌', '宿敌', '陌生人'],
        };
    }
    if (NUMBER_FIELD_KEYS.has(normalizedKey)) {
        return { type: 'number' };
    }
    if (ARRAY_FIELD_KEYS.has(normalizedKey)) {
        return {
            type: 'array',
            items: { type: 'string' },
        };
    }
    if (!isNested && normalizedKey === 'fields') {
        return {
            type: 'object',
            additionalProperties: false,
            properties: {},
        };
    }
    return { type: 'string' };
}

/**
 * 功能：深拷贝普通对象，避免修改原始 schema。
 * @param value 原始对象。
 * @returns 深拷贝结果。
 */
function deepCloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 功能：读取对象上的嵌套普通对象。
 * @param source 源对象。
 * @param path 嵌套路径。
 * @returns 命中的对象；不存在时返回 null。
 */
function readNestedRecord(source: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
    let cursor: unknown = source;
    for (const step of path) {
        if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
            return null;
        }
        cursor = (cursor as Record<string, unknown>)[step];
    }
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return null;
    }
    return cursor as Record<string, unknown>;
}

/**
 * 功能：递归确保所有带 properties 的 object schema 都有完整的 required 数组。
 * @param node 当前 schema 节点。
 */
function ensureStrictRequired(node: unknown): void {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        return;
    }
    const record = node as Record<string, unknown>;
    const properties = record.properties;
    if (properties && typeof properties === 'object' && !Array.isArray(properties)) {
        const allKeys = Object.keys(properties as Record<string, unknown>);
        record.required = allKeys;
        record.additionalProperties = false;
        for (const value of Object.values(properties as Record<string, unknown>)) {
            ensureStrictRequired(value);
        }
    }
    if (record.items && typeof record.items === 'object') {
        ensureStrictRequired(record.items);
    }
    if (Array.isArray(record.oneOf)) {
        record.oneOf.forEach((item: unknown): void => ensureStrictRequired(item));
    }
    if (Array.isArray(record.anyOf)) {
        record.anyOf.forEach((item: unknown): void => ensureStrictRequired(item));
    }
    if (Array.isArray(record.allOf)) {
        record.allOf.forEach((item: unknown): void => ensureStrictRequired(item));
    }
}

const NUMBER_FIELD_KEYS: Set<string> = new Set([
    'importance',
    'trust',
    'affection',
    'tension',
    'unresolvedConflict',
    'certainty',
]);

const ARRAY_FIELD_KEYS: Set<string> = new Set([
    'tags',
    'participants',
    'milestones',
    'aliases',
    'identityFacts',
    'originFacts',
    'traits',
]);
