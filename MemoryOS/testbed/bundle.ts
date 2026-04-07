import type { MemoryChatDatabaseSnapshot, MemoryPromptTestBundle } from '../src/db/db';
import { normalizeExactReplayBaseline } from './parity';

/**
 * 功能：定义测试包归一化参数。
 */
export interface NormalizePromptTestBundleOptions {
    fallbackQuery?: string;
    fallbackSourceMessageId?: string;
    fallbackSettings?: Record<string, unknown>;
}

/**
 * 功能：判断输入是否为普通对象。
 * @param value 原始输入。
 * @returns 是否为对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：归一化对象字段为字符串数组。
 * @param value 原始输入。
 * @returns 字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of value) {
        const normalized = String(row ?? '').trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：判断对象是否近似数据库快照结构。
 * @param value 原始输入。
 * @returns 是否满足快照基础结构。
 */
export function isDatabaseSnapshotLike(value: unknown): value is MemoryChatDatabaseSnapshot {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.chatKey === 'string'
        && Array.isArray(value.events)
        && Array.isArray(value.memoryEntries)
        && Array.isArray(value.summarySnapshots)
        && Array.isArray(value.roleEntryMemory);
}

/**
 * 功能：将未知对象归一化为数据库快照。
 * @param value 原始输入。
 * @param fallbackChatKey 兜底 chatKey。
 * @returns 归一化快照，无效时返回 null。
 */
function normalizeDatabaseSnapshot(
    value: unknown,
    fallbackChatKey: string,
): MemoryChatDatabaseSnapshot | null {
    if (!isDatabaseSnapshotLike(value)) {
        return null;
    }
    return {
        chatKey: String(value.chatKey ?? fallbackChatKey).trim() || fallbackChatKey,
        generatedAt: Number(value.generatedAt ?? Date.now()) || Date.now(),
        events: Array.isArray(value.events) ? value.events : [],
        templates: Array.isArray(value.templates) ? value.templates : [],
        audit: Array.isArray(value.audit) ? value.audit : [],
        meta: (isRecord(value.meta) ? value.meta : null) as MemoryChatDatabaseSnapshot['meta'],
        memoryMutationHistory: Array.isArray(value.memoryMutationHistory) ? value.memoryMutationHistory : [],
        memoryEntries: Array.isArray(value.memoryEntries) ? value.memoryEntries : [],
        memoryEntryTypes: Array.isArray(value.memoryEntryTypes) ? value.memoryEntryTypes : [],
        actorMemoryProfiles: Array.isArray(value.actorMemoryProfiles) ? value.actorMemoryProfiles : [],
        roleEntryMemory: Array.isArray(value.roleEntryMemory) ? value.roleEntryMemory : [],
        summarySnapshots: Array.isArray(value.summarySnapshots) ? value.summarySnapshots : [],
        worldProfileBindings: Array.isArray(value.worldProfileBindings) ? value.worldProfileBindings : [],
        pluginState: (isRecord(value.pluginState) ? value.pluginState : null) as MemoryChatDatabaseSnapshot['pluginState'],
        pluginRecords: Array.isArray(value.pluginRecords) ? value.pluginRecords : [],
    };
}

/**
 * 功能：检测测试包模式。
 * @param bundle 测试包对象。
 * @returns 模式标记。
 */
export function detectPromptTestBundleMode(bundle: MemoryPromptTestBundle): 'exact_replay' | 'simulated_prompt' {
    return bundle.captureMeta?.mode === 'exact_replay' ? 'exact_replay' : 'simulated_prompt';
}

/**
 * 功能：把任意 JSON 形态归一化为统一测试包。
 * @param raw 原始输入。
 * @param options 归一化参数。
 * @returns 测试包对象，失败时返回 null。
 */
export function normalizePromptTestBundleFromUnknown(
    raw: unknown,
    options: NormalizePromptTestBundleOptions = {},
): MemoryPromptTestBundle | null {
    if (!isRecord(raw)) {
        return null;
    }
    const wrapped = isRecord(raw.payload)
        ? raw.payload
        : (isRecord(raw.bundle) ? raw.bundle : raw);
    const fallbackChatKey = `memory_test::${Date.now()}`;
    const database = normalizeDatabaseSnapshot(
        wrapped.database
        ?? wrapped.snapshot
        ?? wrapped.data
        ?? wrapped,
        fallbackChatKey,
    );
    if (!database) {
        return null;
    }
    const promptFixture = Array.isArray(wrapped.promptFixture)
        ? wrapped.promptFixture as Array<Record<string, unknown>>
        : [];
    const mode: 'exact_replay' | 'simulated_prompt' = String((wrapped.captureMeta as Record<string, unknown> | undefined)?.mode ?? '').trim() === 'exact_replay'
        ? 'exact_replay'
        : 'simulated_prompt';
    const captureMeta = {
        mode,
        capturedAt: Number((wrapped.captureMeta as Record<string, unknown> | undefined)?.capturedAt ?? 0) || undefined,
        source: String((wrapped.captureMeta as Record<string, unknown> | undefined)?.source ?? '').trim() || undefined,
        note: String((wrapped.captureMeta as Record<string, unknown> | undefined)?.note ?? '').trim() || undefined,
    } satisfies MemoryPromptTestBundle['captureMeta'];
    const runResult = isRecord(wrapped.runResult) ? wrapped.runResult : undefined;
    const normalizedParityBaseline = normalizeExactReplayBaseline(
        wrapped.parityBaseline
        ?? runResult?.parityBaseline
        ?? runResult,
    );
    const settings = isRecord(wrapped.settings)
        ? wrapped.settings
        : (options.fallbackSettings ?? {});
    return {
        version: '1.0.0',
        exportedAt: Number(wrapped.exportedAt ?? raw.exportedAt ?? Date.now()) || Date.now(),
        sourceChatKey: String(wrapped.sourceChatKey ?? raw.sourceChatKey ?? database.chatKey ?? fallbackChatKey).trim() || fallbackChatKey,
        database,
        promptFixture,
        query: String(wrapped.query ?? raw.query ?? options.fallbackQuery ?? '').trim(),
        sourceMessageId: String(
            wrapped.sourceMessageId
            ?? raw.sourceMessageId
            ?? options.fallbackSourceMessageId
            ?? '',
        ).trim() || undefined,
        settings,
        captureMeta,
        expectation: isRecord(wrapped.expectation)
            ? {
                shouldInject: wrapped.expectation.shouldInject === true,
                requiredKeywords: normalizeStringArray(wrapped.expectation.requiredKeywords),
            }
            : undefined,
        parityBaseline: normalizedParityBaseline ?? undefined,
        runResult,
    };
}
