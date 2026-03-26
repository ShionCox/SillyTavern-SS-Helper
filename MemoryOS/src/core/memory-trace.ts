/**
 * 功能：定义主链追踪来源。
 */
export type MemoryTraceSource = 'prompt_injection' | 'event_ingest' | 'runtime';

/**
 * 功能：定义主链追踪阶段。
 */
export type MemoryTraceStage =
    | 'memory_recall_started'
    | 'memory_context_built'
    | 'memory_prompt_inserted'
    | 'memory_prompt_insert_success'
    | 'memory_ingest_started'
    | 'memory_event_appended';

/**
 * 功能：定义追踪上下文。
 */
export interface MemoryTraceContext {
    traceId: string;
    chatKey: string;
    sourceMessageId?: string;
    eventId?: string;
    requestId?: string;
    source: MemoryTraceSource;
    stage: MemoryTraceStage;
    ts: number;
}

/**
 * 功能：定义主链追踪记录。
 */
export interface MemoryMainlineTraceEntry extends MemoryTraceContext {
    ok: boolean;
    label: string;
    detail?: Record<string, unknown>;
}

/**
 * 功能：定义主链追踪快照。
 */
export interface MemoryMainlineTraceSnapshot {
    lastTrace: MemoryMainlineTraceEntry | null;
    lastSuccessTrace: MemoryMainlineTraceEntry | null;
    recentTraces: MemoryMainlineTraceEntry[];
    lastIngestTrace: MemoryMainlineTraceEntry | null;
    lastAppendTrace: MemoryMainlineTraceEntry | null;
    lastRecallTrace: MemoryMainlineTraceEntry | null;
    lastPromptInjectionTrace: MemoryMainlineTraceEntry | null;
    lastUpdatedAt: number;
}

const DEFAULT_MAINLINE_TRACE_LIMIT = 12;

/**
 * 功能：计算文本哈希。
 * @param value 原始文本。
 * @returns 哈希文本。
 */
function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `trace:${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：创建追踪上下文。
 * @param input 上下文参数。
 * @returns 追踪上下文。
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
 * 功能：推进追踪阶段。
 * @param trace 原追踪上下文。
 * @param stage 新阶段。
 * @param source 新来源。
 * @returns 新追踪上下文。
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
 * 功能：构建追踪记录。
 * @param input 记录入参。
 * @returns 追踪记录。
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
 * 功能：标准化追踪记录。
 * @param value 原始值。
 * @returns 标准化结果。
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
 * 功能：标准化追踪快照。
 * @param snapshot 原快照。
 * @returns 标准化快照。
 */
export function normalizeMemoryMainlineTraceSnapshot(snapshot?: MemoryMainlineTraceSnapshot | null): MemoryMainlineTraceSnapshot {
    const recentTraces = Array.isArray(snapshot?.recentTraces)
        ? snapshot.recentTraces
            .map((item: MemoryMainlineTraceEntry): MemoryMainlineTraceEntry | null => normalizeMemoryMainlineTraceEntry(item))
            .filter((item: MemoryMainlineTraceEntry | null): item is MemoryMainlineTraceEntry => Boolean(item))
        : [];
    const lastTrace = normalizeMemoryMainlineTraceEntry(snapshot?.lastTrace ?? null);
    const lastSuccessTrace = normalizeMemoryMainlineTraceEntry(snapshot?.lastSuccessTrace ?? null)
        ?? recentTraces.slice().reverse().find((item: MemoryMainlineTraceEntry): boolean => item.ok) ?? null;
    return {
        lastTrace,
        lastSuccessTrace,
        recentTraces: recentTraces.slice(-DEFAULT_MAINLINE_TRACE_LIMIT),
        lastIngestTrace: recentTraces.slice().reverse().find((item: MemoryMainlineTraceEntry): boolean => item.stage === 'memory_ingest_started') ?? null,
        lastAppendTrace: recentTraces.slice().reverse().find((item: MemoryMainlineTraceEntry): boolean => item.stage === 'memory_event_appended') ?? null,
        lastRecallTrace: recentTraces.slice().reverse().find((item: MemoryMainlineTraceEntry): boolean => item.stage === 'memory_recall_started' || item.stage === 'memory_context_built') ?? null,
        lastPromptInjectionTrace: recentTraces.slice().reverse().find((item: MemoryMainlineTraceEntry): boolean => item.stage === 'memory_prompt_insert_success' || item.stage === 'memory_prompt_inserted') ?? null,
        lastUpdatedAt: Math.max(0, Number(snapshot?.lastUpdatedAt ?? 0) || 0, lastTrace?.ts ?? 0, lastSuccessTrace?.ts ?? 0),
    };
}

/**
 * 功能：写入一条追踪记录到快照。
 * @param snapshot 原快照。
 * @param entry 新记录。
 * @returns 更新后的快照。
 */
export function touchMemoryMainlineTraceSnapshot(
    snapshot: MemoryMainlineTraceSnapshot | null | undefined,
    entry: MemoryMainlineTraceEntry,
): MemoryMainlineTraceSnapshot {
    const base = normalizeMemoryMainlineTraceSnapshot(snapshot ?? null);
    const recentTraces = [...base.recentTraces, entry].slice(-DEFAULT_MAINLINE_TRACE_LIMIT);
    return {
        ...base,
        lastTrace: entry,
        recentTraces,
        lastSuccessTrace: entry.ok ? entry : base.lastSuccessTrace,
        lastIngestTrace: entry.stage === 'memory_ingest_started' ? entry : base.lastIngestTrace,
        lastAppendTrace: entry.stage === 'memory_event_appended' ? entry : base.lastAppendTrace,
        lastRecallTrace: entry.stage === 'memory_recall_started' || entry.stage === 'memory_context_built' ? entry : base.lastRecallTrace,
        lastPromptInjectionTrace: entry.stage === 'memory_prompt_insert_success' || entry.stage === 'memory_prompt_inserted' ? entry : base.lastPromptInjectionTrace,
        lastUpdatedAt: Math.max(base.lastUpdatedAt, entry.ts),
    };
}

/**
 * 功能：格式化追踪摘要文本。
 * @param entry 追踪记录。
 * @returns 摘要文本。
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
