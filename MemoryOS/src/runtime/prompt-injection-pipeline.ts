import { createMemoryTraceContext } from '../core/memory-trace';
import { getTavernPromptMessageTextEvent, type SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import type { PromptAssemblySnapshot } from '../types';
import { filterMemoryMessages, getMemoryFilterSettings } from '../memory-filter';

export interface BaseInjectionDiagnosticsSnapshot {
    enabled: boolean;
    inserted: boolean;
    skippedReason: string | null;
    preset: string;
    aggressiveness: string;
    forceDynamicFloor: boolean;
    selectedOptions: string[];
    candidateCounts: {
        total: number;
        pretrimDropped: number;
        budgetDropped: number;
    };
    layerBudgets: Array<Record<string, unknown>>;
    finalTextLength: number;
    finalTokenRatio: number;
    insertedIndex: number;
    generatedAt: number;
}

export interface PromptInjectionPipelineLogEntry {
    stage: string;
    status: 'ok' | 'failed';
    reasonCodes: string[];
    summary: string;
    details?: Record<string, unknown>;
}

export interface PromptInjectionPipelineResult {
    query: string;
    sourceMessageId?: string;
    baseDiagnostics: BaseInjectionDiagnosticsSnapshot;
    injectionResult: {
        shouldInject: boolean;
        inserted: boolean;
        insertIndex: number;
        promptLength: number;
        insertedLength: number;
        trace?: { stage?: string; label?: string; traceId?: string } | null;
    };
    latestExplanation: Record<string, unknown> | null;
    finalPromptMessages: SdkTavernPromptMessageEvent[];
    finalPromptText: string;
    logs: PromptInjectionPipelineLogEntry[];
}

type PromptInjectResult = {
    shouldInject: boolean;
    inserted: boolean;
    insertIndex: number;
    promptLength: number;
    insertedLength: number;
    trace?: { stage?: string; label?: string; traceId?: string } | null;
};

type PipelineSettings = {
    injectionPromptEnabled?: boolean;
    injectionPreviewEnabled?: boolean;
};

type PipelineMemoryLike = {
    getChatKey?: () => string;
    unifiedMemory?: {
        prompts?: {
            preview?: (args: { query: string; promptMessages: SdkTavernPromptMessageEvent[] }) => Promise<PromptAssemblySnapshot>;
            inject?: (args: {
                promptMessages: SdkTavernPromptMessageEvent[];
                source?: string;
                sourceMessageId?: string;
                snapshot: PromptAssemblySnapshot;
                trace: Record<string, unknown>;
            }) => Promise<PromptInjectResult>;
        };
    };
};

/**
 * 功能：基于本次 Prompt 组装快照生成召回说明。
 * @param snapshot Prompt 组装快照
 * @returns 召回说明对象
 */
function buildLatestExplanationFromSnapshot(snapshot: PromptAssemblySnapshot | null): Record<string, unknown> | null {
    if (!snapshot) {
        return null;
    }
    return {
        generatedAt: Date.now(),
        query: String(snapshot.query ?? ''),
        matchedActorKeys: snapshot.matchedActorKeys ?? [],
        matchedEntryIds: snapshot.matchedEntryIds ?? [],
        reasonCodes: snapshot.reasonCodes ?? [],
        source: 'unified_memory',
        retrievalProviderId: snapshot.diagnostics?.providerId,
        retrievalRulePack: snapshot.diagnostics?.rulePackMode,
        contextRoute: snapshot.diagnostics?.contextRoute ?? null,
        matchedRules: snapshot.diagnostics?.contextRoute?.matchedRules ?? [],
        subQueries: snapshot.diagnostics?.contextRoute?.subQueries ?? [],
        routeReasons: snapshot.diagnostics?.contextRoute?.reasons ?? [],
        traceRecords: snapshot.diagnostics?.traceRecords ?? [],
    };
}

/**
 * 功能：从 prompt 中提取最后一条用户消息。
 * @param promptMessages prompt 消息数组。
 * @returns 用户消息。
 */
function findLatestPromptUserMessage(
    promptMessages: SdkTavernPromptMessageEvent[],
): SdkTavernPromptMessageEvent | undefined {
    return [...promptMessages]
        .reverse()
        .find((item: SdkTavernPromptMessageEvent): boolean => {
            return String(item?.role ?? '').trim().toLowerCase() === 'user' || item?.is_user === true;
        });
}

/**
 * 功能：解析本轮查询文本。
 * @param input 流水线输入。
 * @param latestUserMessage 最后一条用户消息。
 * @returns 查询文本。
 */
function resolvePromptReadyQuery(
    input: { query?: string },
    latestUserMessage: SdkTavernPromptMessageEvent | undefined,
): string {
    const explicitQuery = String(input.query ?? '').trim();
    if (explicitQuery) {
        return explicitQuery;
    }
    return String(getTavernPromptMessageTextEvent(latestUserMessage)).trim();
}

/**
 * 功能：返回“未执行注入”时的默认注入结果。
 * @returns 默认注入结果。
 */
function buildSkippedInjectionResult(): PromptInjectResult {
    return {
        shouldInject: false,
        inserted: false,
        insertIndex: -1,
        promptLength: 0,
        insertedLength: 0,
        trace: null,
    };
}

/**
 * 功能：执行统一 prompt 注入链路。
 * @param input 流水线输入。
 * @returns 注入结果。
 */
export async function runPromptReadyInjectionPipeline(input: {
    memory: PipelineMemoryLike;
    promptMessages: SdkTavernPromptMessageEvent[];
    promptTargetDiagnostics?: {
        selectedPath: string;
        allPaths: string[];
    };
    readSettings: () => PipelineSettings;
    query?: string;
    sourceMessageId?: string;
    source?: string;
    currentChatKey?: string;
}): Promise<PromptInjectionPipelineResult> {
    const logs: PromptInjectionPipelineLogEntry[] = [];
    const promptMessages = input.promptMessages;
    const settings = input.readSettings();
    const injectionPromptEnabled = settings.injectionPromptEnabled !== false;
    const injectionPreviewEnabled = settings.injectionPreviewEnabled !== false;
    const latestUserMessage = findLatestPromptUserMessage(promptMessages);
    const latestUserRecord = (latestUserMessage || {}) as Record<string, unknown>;
    const rawQuery = resolvePromptReadyQuery(input, latestUserMessage);
    const filteredQuery = filterMemoryMessages([{ role: 'user', content: rawQuery, floor: 1 }], getMemoryFilterSettings(), { scope: 'promptInjection' });
    const filteredQueryText = filteredQuery.messagesForMemory.map((message) => String(message.content ?? '').trim()).filter(Boolean).join('\n\n');
    const query = filteredQuery.enabled ? filteredQueryText : rawQuery;
    const sourceMessageId = String(
        input.sourceMessageId
        ?? latestUserRecord.mes_id
        ?? latestUserRecord.message_id
        ?? latestUserRecord.id
        ?? '',
    ).trim() || undefined;

    if ((input.promptTargetDiagnostics?.allPaths.length ?? 0) > 1) {
        logs.push({
            stage: 'prompt_target',
            status: 'ok',
            reasonCodes: ['multiple_prompt_targets_detected'],
            summary: '检测到多个 prompt 数组目标，本次已记录实际选用路径。',
            details: {
                selectedPath: input.promptTargetDiagnostics?.selectedPath ?? '',
                allPaths: input.promptTargetDiagnostics?.allPaths ?? [],
            },
        });
    }

    const promptTrace = createMemoryTraceContext({
        chatKey: String(input.memory?.getChatKey?.() ?? input.currentChatKey ?? '').trim() || 'unknown',
        source: 'prompt_injection',
        stage: 'memory_recall_started',
        sourceMessageId,
        requestId: query || undefined,
    });

    const snapshot = injectionPreviewEnabled && input.memory?.unifiedMemory?.prompts?.preview
        ? await input.memory.unifiedMemory.prompts.preview({
            query,
            promptMessages,
        })
        : null;

    const baseDiagnostics: BaseInjectionDiagnosticsSnapshot = {
        enabled: injectionPreviewEnabled,
        inserted: Boolean(snapshot?.systemText),
        skippedReason: injectionPreviewEnabled ? (snapshot?.systemText ? null : 'empty_content') : 'preview_disabled',
        preset: 'balanced_enhanced',
        aggressiveness: 'balanced',
        forceDynamicFloor: true,
        selectedOptions: ['world_setting', 'character_setting', 'relationship_state', 'current_scene', 'recent_plot'],
        candidateCounts: {
            total: Number(snapshot?.systemEntryIds?.length ?? 0),
            pretrimDropped: 0,
            budgetDropped: 0,
        },
        layerBudgets: [],
        finalTextLength: String(snapshot?.systemText ?? '').length,
        finalTokenRatio: 0,
        insertedIndex: -1,
        generatedAt: Date.now(),
    };

    logs.push({
        stage: 'system_base',
        status: snapshot?.systemText ? 'ok' : 'failed',
        reasonCodes: snapshot?.systemText ? ['system_base_present'] : [injectionPreviewEnabled ? 'empty_content' : 'preview_disabled'],
        summary: snapshot?.systemText
            ? '世界基础设定已进入 system 预览'
            : (injectionPreviewEnabled ? '世界基础设定为空' : '注入预览已禁用'),
        details: {
            entryCount: Number(snapshot?.systemEntryIds?.length ?? 0),
            matchedEntryIds: snapshot?.systemEntryIds ?? [],
        },
    });

    const injectionResult = injectionPromptEnabled && snapshot && input.memory?.unifiedMemory?.prompts?.inject
        ? await input.memory.unifiedMemory.prompts.inject({
            promptMessages,
            source: input.source,
            sourceMessageId,
            snapshot: snapshot,
            trace: promptTrace as unknown as Record<string, unknown>,
        })
        : buildSkippedInjectionResult();

    const latestExplanation = buildLatestExplanationFromSnapshot(snapshot);

    logs.push({
        stage: 'role_memory',
        status: injectionResult.inserted ? 'ok' : 'failed',
        reasonCodes: injectionResult.inserted
            ? ['inserted']
            : [injectionPromptEnabled ? 'not_inserted' : 'prompt_injection_disabled'],
        summary: injectionResult.inserted
            ? '统一记忆块已插入 system'
            : (injectionPromptEnabled ? '统一记忆块未插入' : '主注入已禁用'),
        details: {
            shouldInject: Boolean(injectionResult.shouldInject),
            insertIndex: Number(injectionResult.insertIndex ?? -1),
            insertedLength: Number(injectionResult.insertedLength ?? 0),
            trace: injectionResult.trace ?? null,
            matchedActorKeys: snapshot?.matchedActorKeys ?? [],
            matchedEntryIds: snapshot?.matchedEntryIds ?? [],
        },
    });

    return {
        query,
        sourceMessageId,
        baseDiagnostics,
        injectionResult,
        latestExplanation: latestExplanation ?? null,
        finalPromptMessages: promptMessages,
        finalPromptText: promptMessages
            .map((item: SdkTavernPromptMessageEvent): string => getTavernPromptMessageTextEvent(item))
            .join('\n'),
        logs,
    };
}
