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
import type { SummaryMutationDocument } from './mutation-types';
import type { MemoryLLMApi } from './llm-types';

/**
 * 功能：总结编排器依赖。
 */
export interface SummaryOrchestratorDependencies extends MutationApplyDependencies {
    listEntries(): Promise<MemoryEntry[]>;
    listRoleMemories(actorKey?: string): Promise<RoleEntryMemory[]>;
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
        worldProfileTexts,
        worldProfileBinding,
        enableEmbedding: input.enableEmbedding,
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
    const actorKeys = window.actorHints.length > 0 ? window.actorHints : ['user'];
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
    const promptPack = await loadPromptPackSections();
    const summarySchema = parseJsonSection(promptPack.SUMMARY_SCHEMA);
    const summarySystemPrompt = renderPromptTemplate(promptPack.SUMMARY_SYSTEM, {
        worldProfile: plannerResult.diagnostics.worldProfile,
    });
    const summaryUserPayload = buildStructuredTaskUserPayload(
        JSON.stringify(plannerResult.context, null, 2),
        JSON.stringify(summarySchema ?? {}, null, 2),
    );
    const result = await input.llm.runTask<SummaryMutationDocument>({
        consumer: input.pluginId,
        taskId: 'memory_summary_mutation',
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: summarySystemPrompt },
                { role: 'user', content: summaryUserPayload },
            ],
        },
        schema: summarySchema,
        budget: { maxLatencyMs: 10_000 },
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
