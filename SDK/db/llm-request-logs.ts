import { db } from './database';
import type { DBLlmRequestLog } from './database';
import { Logger } from '../logger';

const logger = new Logger('SDK-LlmRequestLogs');

export interface AppendLlmRequestLogInput {
    logId: string;
    llmTaskId: string;
    requestId: string;
    sourcePluginId: string;
    consumer: string;
    taskKey: string;
    taskKind: string;
    state: string;
    taskDescription?: string;
    attemptIndex: number;
    attemptTag: string;
    attemptOutcome: string;
    isFinalAttempt: boolean;
    chatKey?: string;
    sessionId?: string;
    reasonCode?: string;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    payload: Record<string, unknown>;
}

export interface QueryLlmRequestLogsOptions {
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
    state?: string | 'all';
    search?: string;
    fromTs?: number;
    toTs?: number;
    sourcePluginId?: string;
}

function buildSearchCorpus(row: DBLlmRequestLog): string {
    return [
        row.logId,
        row.requestId,
        row.llmTaskId,
        row.sourcePluginId,
        row.consumer,
        row.taskKey,
        row.taskKind,
        row.state,
        row.taskDescription,
        row.attemptIndex,
        row.attemptTag,
        row.attemptOutcome,
        row.isFinalAttempt,
        row.chatKey,
        row.sessionId,
        row.reasonCode,
        JSON.stringify(row.payload || {}),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

export async function appendLlmRequestLog(input: AppendLlmRequestLogInput): Promise<void> {
    const now = Date.now();
    const row: DBLlmRequestLog = {
        logId: input.logId,
        llmTaskId: input.llmTaskId,
        requestId: input.requestId,
        sourcePluginId: input.sourcePluginId,
        consumer: input.consumer,
        taskKey: input.taskKey,
        taskKind: input.taskKind,
        state: input.state,
        taskDescription: input.taskDescription,
        attemptIndex: input.attemptIndex,
        attemptTag: input.attemptTag,
        attemptOutcome: input.attemptOutcome,
        isFinalAttempt: input.isFinalAttempt,
        chatKey: String(input.chatKey || '').trim() || undefined,
        sessionId: String(input.sessionId || '').trim() || undefined,
        reasonCode: String(input.reasonCode || '').trim() || undefined,
        sortTs: Number(input.finishedAt ?? input.startedAt ?? input.queuedAt ?? now),
        queuedAt: Number(input.queuedAt || now),
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        latencyMs: input.latencyMs,
        payload: input.payload,
        createdAt: now,
        updatedAt: now,
    };

    await db.llm_request_logs.put(row);
    logger.info('[LlmRequestLogs][Append]', {
        logId: row.logId,
        requestId: row.requestId,
        llmTaskId: row.llmTaskId,
        sourcePluginId: row.sourcePluginId,
        taskKey: row.taskKey,
        state: row.state,
        sortTs: row.sortTs,
    });
}

export async function queryLlmRequestLogs(opts?: QueryLlmRequestLogsOptions): Promise<DBLlmRequestLog[]> {
    const order = opts?.order ?? 'desc';
    const fromTs = opts?.fromTs ?? 0;
    const toTs = opts?.toTs ?? Infinity;

    let rows = await db.llm_request_logs.toArray();
    rows = rows.filter((row: DBLlmRequestLog): boolean => row.sortTs >= fromTs && row.sortTs <= toTs);

    const stateFilter = String(opts?.state || 'all').trim();
    if (stateFilter && stateFilter !== 'all') {
        rows = rows.filter((row: DBLlmRequestLog): boolean => row.state === stateFilter);
    }

    const sourcePluginId = String(opts?.sourcePluginId || '').trim();
    if (sourcePluginId) {
        rows = rows.filter((row: DBLlmRequestLog): boolean => row.sourcePluginId === sourcePluginId);
    }

    const searchTerm = String(opts?.search || '').trim().toLowerCase();
    if (searchTerm) {
        rows = rows.filter((row: DBLlmRequestLog): boolean => buildSearchCorpus(row).includes(searchTerm));
    }

    rows.sort((left: DBLlmRequestLog, right: DBLlmRequestLog): number => {
        return order === 'asc' ? left.sortTs - right.sortTs : right.sortTs - left.sortTs;
    });

    const offset = Math.max(0, Number(opts?.offset || 0));
    const limit = Math.max(0, Number(opts?.limit || 0));
    if (offset > 0) {
        rows = rows.slice(offset);
    }
    if (limit > 0) {
        rows = rows.slice(0, limit);
    }

    logger.info('[LlmRequestLogs][Query]', {
        count: rows.length,
        state: stateFilter || 'all',
        sourcePluginId,
        order,
        fromTs,
        toTs,
        offset,
        limit,
        sample: rows.slice(0, 5).map((row: DBLlmRequestLog) => ({
            logId: row.logId,
            requestId: row.requestId,
            llmTaskId: row.llmTaskId,
            sourcePluginId: row.sourcePluginId,
            taskKey: row.taskKey,
            state: row.state,
        })),
    });

    return rows;
}

export async function clearLlmRequestLogs(): Promise<number> {
    const count = await db.llm_request_logs.count();
    await db.llm_request_logs.clear();
    logger.info('[LlmRequestLogs][ClearAll]', { cleared: count });
    return count;
}

export async function trimLlmRequestLogs(maxRecords: number): Promise<number> {
    const safeLimit = Math.max(0, Math.floor(maxRecords));
    if (safeLimit <= 0) {
        return clearLlmRequestLogs();
    }

    const all = await db.llm_request_logs.toArray();
    if (all.length <= safeLimit) {
        return 0;
    }

    all.sort((left: DBLlmRequestLog, right: DBLlmRequestLog): number => right.sortTs - left.sortTs);
    const toDelete = all.slice(safeLimit).map((row: DBLlmRequestLog) => row.logId);
    if (toDelete.length <= 0) {
        return 0;
    }

    await db.llm_request_logs.bulkDelete(toDelete);
    logger.info('[LlmRequestLogs][Trim]', { maxRecords: safeLimit, deleted: toDelete.length });
    return toDelete.length;
}
