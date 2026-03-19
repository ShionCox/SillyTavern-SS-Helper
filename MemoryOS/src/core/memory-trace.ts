import type {
    MemoryMainlineTraceEntry,
    MemoryMainlineTraceSnapshot,
    MemoryTraceContext,
    MemoryTraceSource,
    MemoryTraceStage,
} from '../types';

const DEFAULT_MAINLINE_TRACE_LIMIT = 12;

function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `trace:${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：创建一条统一的主链 trace 上下文。
 * @param input trace 基础字段。
 * @returns trace 上下文。
 */
export function createMemoryTraceContext(input: {
    chatKey: string;
    source: MemoryTraceSource;
    stage: MemoryTraceStage;
    sourceMessageId?: string;
    eventId?: string;
    requestId?: string;
    traceId?: string;
    ts?: number;
}): MemoryTraceContext {
    const ts = Number(input.ts ?? Date.now()) || Date.now();
    const seed = [
        String(input.traceId ?? '').trim(),
        String(input.chatKey ?? '').trim(),
        String(input.source ?? '').trim(),
        String(input.stage ?? '').trim(),
        String(input.sourceMessageId ?? '').trim(),
        String(input.eventId ?? '').trim(),
        String(input.requestId ?? '').trim(),
        String(ts),
    ].join('::');
    return {
        traceId: String(input.traceId ?? '').trim() || hashText(seed),
        chatKey: String(input.chatKey ?? '').trim(),
        sourceMessageId: String(input.sourceMessageId ?? '').trim() || undefined,
        eventId: String(input.eventId ?? '').trim() || undefined,
        requestId: String(input.requestId ?? '').trim() || undefined,
        source: input.source,
        stage: input.stage,
        ts,
    };
}

/**
 * 功能：在同一条 trace 上推进到新的 stage。
 * @param trace 原始 trace。
 * @param stage 新阶段。
 * @param source 新来源，默认沿用原值。
 * @returns 新 trace 上下文。
 */
export function advanceMemoryTraceContext(
    trace: MemoryTraceContext,
    stage: MemoryTraceStage,
    source: MemoryTraceSource = trace.source,
): MemoryTraceContext {
    return {
        ...trace,
        source,
        stage,
        ts: Date.now(),
    };
}

/**
 * 功能：把 trace 上下文包装成可写入快照的执行记录。
 * @param input 执行结果。
 * @returns trace 记录。
 */
export function buildMemoryMainlineTraceEntry(input: {
    trace: MemoryTraceContext;
    label: string;
    ok: boolean;
    detail?: Record<string, unknown>;
}): MemoryMainlineTraceEntry {
    return {
        ...input.trace,
        label: String(input.label ?? '').trim() || input.trace.stage,
        ok: input.ok === true,
        detail: input.detail ? { ...input.detail } : undefined,
    };
}

/**
 * 功能：归一化 trace 记录。
 * @param value 待归一化对象。
 * @returns 归一化后的记录，失败则返回 null。
 */
export function normalizeMemoryMainlineTraceEntry(value: unknown): MemoryMainlineTraceEntry | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const traceId = String(record.traceId ?? '').trim();
    const chatKey = String(record.chatKey ?? '').trim();
    const stage = String(record.stage ?? '').trim() as MemoryTraceStage;
    const source = String(record.source ?? '').trim() as MemoryTraceSource;
    if (!traceId || !chatKey || !stage || !source) {
        return null;
    }
    return {
        traceId,
        chatKey,
        sourceMessageId: String(record.sourceMessageId ?? '').trim() || undefined,
        eventId: String(record.eventId ?? '').trim() || undefined,
        requestId: String(record.requestId ?? '').trim() || undefined,
        source,
        stage,
        ts: Math.max(0, Number(record.ts ?? 0) || 0),
        ok: record.ok === true,
        label: String(record.label ?? stage).trim() || stage,
        detail: record.detail && typeof record.detail === 'object' ? { ...(record.detail as Record<string, unknown>) } : undefined,
    };
}

/**
 * 功能：归一化主链 trace 快照。
 * @param snapshot 原始快照。
 * @returns 可直接存储的快照。
 */
export function normalizeMemoryMainlineTraceSnapshot(snapshot?: MemoryMainlineTraceSnapshot | null): MemoryMainlineTraceSnapshot {
    const recentTraces = Array.isArray(snapshot?.recentTraces)
        ? snapshot!.recentTraces.map((item): MemoryMainlineTraceEntry | null => normalizeMemoryMainlineTraceEntry(item)).filter((item): item is MemoryMainlineTraceEntry => Boolean(item))
        : [];
    const normalizeByStage = (entry: MemoryMainlineTraceEntry | null | undefined, stage: MemoryTraceStage): MemoryMainlineTraceEntry | null => {
        if (entry && entry.stage === stage) {
            return entry;
        }
        return recentTraces.slice().reverse().find((item) => item.stage === stage) ?? null;
    };
    const lastTrace = normalizeMemoryMainlineTraceEntry(snapshot?.lastTrace ?? null);
    const lastSuccessTrace = normalizeMemoryMainlineTraceEntry(snapshot?.lastSuccessTrace ?? null)
        ?? recentTraces.slice().reverse().find((item) => item.ok) ?? null;
    return {
        lastTrace,
        lastSuccessTrace,
        recentTraces: recentTraces.slice(-DEFAULT_MAINLINE_TRACE_LIMIT),
        lastIngestTrace: normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastIngestTrace ?? null), 'memory_ingest_started'),
        lastAppendTrace: normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastAppendTrace ?? null), 'memory_event_appended'),
        lastTrustedWriteTrace: normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastTrustedWriteTrace ?? null), 'memory_trusted_write_finished')
            ?? normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastTrustedWriteTrace ?? null), 'memory_trusted_write_started'),
        lastRecallTrace: normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastRecallTrace ?? null), 'memory_recall_started')
            ?? normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastRecallTrace ?? null), 'memory_context_built'),
        lastPromptInjectionTrace: normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastPromptInjectionTrace ?? null), 'memory_prompt_insert_success')
            ?? normalizeByStage(normalizeMemoryMainlineTraceEntry(snapshot?.lastPromptInjectionTrace ?? null), 'memory_prompt_inserted'),
        lastUpdatedAt: Math.max(
            0,
            Number(snapshot?.lastUpdatedAt ?? 0) || 0,
            lastTrace?.ts ?? 0,
            lastSuccessTrace?.ts ?? 0,
        ),
    };
}

/**
 * 功能：将一条 trace 记录并入快照。
 * @param snapshot 现有快照。
 * @param entry 新 trace 记录。
 * @returns 更新后的快照。
 */
export function touchMemoryMainlineTraceSnapshot(
    snapshot: MemoryMainlineTraceSnapshot | null | undefined,
    entry: MemoryMainlineTraceEntry,
): MemoryMainlineTraceSnapshot {
    const base = normalizeMemoryMainlineTraceSnapshot(snapshot ?? null);
    const recentTraces = [...base.recentTraces, entry].slice(-DEFAULT_MAINLINE_TRACE_LIMIT);
    const next: MemoryMainlineTraceSnapshot = {
        ...base,
        lastTrace: entry,
        recentTraces,
        lastSuccessTrace: entry.ok ? entry : base.lastSuccessTrace,
        lastIngestTrace: entry.stage === 'memory_ingest_started' ? entry : base.lastIngestTrace,
        lastAppendTrace: entry.stage === 'memory_event_appended' ? entry : base.lastAppendTrace,
        lastTrustedWriteTrace: entry.stage === 'memory_trusted_write_finished' || entry.stage === 'memory_trusted_write_started'
            ? entry
            : base.lastTrustedWriteTrace,
        lastRecallTrace: entry.stage === 'memory_recall_started' || entry.stage === 'memory_context_built'
            ? entry
            : base.lastRecallTrace,
        lastPromptInjectionTrace: entry.stage === 'memory_prompt_insert_success' || entry.stage === 'memory_prompt_inserted'
            ? entry
            : base.lastPromptInjectionTrace,
        lastUpdatedAt: Math.max(base.lastUpdatedAt, entry.ts),
    };
    return next;
}

/**
 * 功能：把 trace 记录压缩成一条便于日志展示的摘要。
 * @param entry trace 记录。
 * @returns 单行摘要。
 */
export function summarizeMemoryMainlineTrace(entry: MemoryMainlineTraceEntry | MemoryTraceContext): string {
    const ok = 'ok' in entry ? (entry.ok ? 'ok' : 'failed') : 'ctx';
    const parts = [
        entry.stage,
        ok,
        entry.source,
        entry.traceId,
        entry.sourceMessageId ? `msg:${entry.sourceMessageId}` : '',
        entry.eventId ? `event:${entry.eventId}` : '',
        entry.requestId ? `req:${entry.requestId}` : '',
    ].filter(Boolean);
    return parts.join(' | ');
}
