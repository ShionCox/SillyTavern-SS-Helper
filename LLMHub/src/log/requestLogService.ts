import {
    appendLlmRequestLog,
    clearLlmRequestLogs,
    queryLlmRequestLogs,
    trimLlmRequestLogs,
} from '../../../SDK/db';
import { Logger } from '../../../SDK/logger';
import type {
    LLMRequestLogEntry,
    LLMRequestLogQueryOptions,
    LLMRequestLogRequestSnapshot,
    LLMRequestLogResponseSnapshot,
    RequestRecord,
    RequestState,
} from '../schema/types';

const logger = new Logger('LLMHubRequestLogService');
const REQUEST_LOG_MAX_RECORDS = 2000;
const ARCHIVABLE_STATES = new Set<RequestState>(['completed', 'failed', 'cancelled', 'overlay_waiting']);
const FALLBACK_SOURCE_PLUGIN_ID = 'stx_llmhub';

function normalizeOptionalText(value: unknown): string | undefined {
    const normalized = String(value || '').trim();
    return normalized || undefined;
}

export class RequestLogService {
    async listLogs(opts?: LLMRequestLogQueryOptions): Promise<LLMRequestLogEntry[]> {
        const rows = await queryLlmRequestLogs(opts);
        return rows
            .map((row): LLMRequestLogEntry | null => {
                const payload = row.payload as Partial<LLMRequestLogEntry> | undefined;
                if (!payload?.requestId || !payload?.logId) {
                    return null;
                }
                return {
                    ...payload,
                    logId: payload.logId,
                    requestId: payload.requestId,
                    sourcePluginId: payload.sourcePluginId || row.sourcePluginId || row.consumer || FALLBACK_SOURCE_PLUGIN_ID,
                    consumer: payload.consumer || row.consumer,
                    taskId: payload.taskId || row.taskId,
                    taskKind: payload.taskKind || row.taskKind,
                    state: (payload.state || row.state) as RequestState,
                    chatKey: payload.chatKey || row.chatKey,
                    sessionId: payload.sessionId || row.sessionId,
                    queuedAt: Number(payload.queuedAt || row.queuedAt || 0),
                    startedAt: payload.startedAt || row.startedAt,
                    finishedAt: payload.finishedAt || row.finishedAt,
                    latencyMs: payload.latencyMs || row.latencyMs,
                    request: (payload.request || { taskKind: row.taskKind }) as LLMRequestLogRequestSnapshot,
                    response: (payload.response || {}) as LLMRequestLogResponseSnapshot,
                };
            })
            .filter((entry): entry is LLMRequestLogEntry => Boolean(entry));
    }

    async clearLogs(): Promise<number> {
        return clearLlmRequestLogs();
    }

    async archiveRecord(record: RequestRecord): Promise<void> {
        if (!ARCHIVABLE_STATES.has(record.state as RequestState)) {
            logger.info('[RequestLog][PersistSkip]', {
                requestId: record.requestId,
                consumer: record.consumer,
                taskId: record.taskId,
                state: record.state,
                reason: 'state_not_archivable',
            });
            return;
        }

        const sourcePluginId = normalizeOptionalText(record.scope?.pluginId) || normalizeOptionalText(record.consumer) || FALLBACK_SOURCE_PLUGIN_ID;
        const chatKey = normalizeOptionalText(record.chatKey);
        const sessionId = normalizeOptionalText(record.scope?.sessionId);
        const requestSnapshot = {
            ...(record.requestLogSnapshot || {
                taskKind: record.taskKind,
                taskDescription: record.taskDescription,
            }),
        } as LLMRequestLogRequestSnapshot;
        const responseSnapshot = this.buildLogResponseSnapshot(record);
        const latencyMs = record.finishedAt && record.startedAt ? Math.max(0, record.finishedAt - record.startedAt) : undefined;
        const logEntry: LLMRequestLogEntry = {
            logId: `${record.requestId}_${record.finishedAt || Date.now()}`,
            requestId: record.requestId,
            sourcePluginId,
            consumer: record.consumer,
            taskId: record.taskId,
            taskDescription: record.taskDescription,
            taskKind: record.taskKind,
            state: record.state as RequestState,
            chatKey,
            sessionId,
            queuedAt: record.queuedAt,
            startedAt: record.startedAt,
            finishedAt: record.finishedAt,
            latencyMs,
            request: requestSnapshot,
            response: responseSnapshot,
        };

        logger.info('[RequestLog][PersistStart]', {
            requestId: record.requestId,
            logId: logEntry.logId,
            sourcePluginId,
            consumer: record.consumer,
            taskId: record.taskId,
            state: record.state,
            chatKey: chatKey || '(none)',
            reasonCode: record.debug?.reasonCode,
        });

        try {
            await appendLlmRequestLog({
                logId: logEntry.logId,
                requestId: logEntry.requestId,
                sourcePluginId: logEntry.sourcePluginId,
                consumer: logEntry.consumer,
                taskId: logEntry.taskId,
                taskKind: logEntry.taskKind,
                state: logEntry.state,
                taskDescription: logEntry.taskDescription,
                chatKey: logEntry.chatKey,
                sessionId: logEntry.sessionId,
                reasonCode: logEntry.response?.reasonCode,
                queuedAt: logEntry.queuedAt,
                startedAt: logEntry.startedAt,
                finishedAt: logEntry.finishedAt,
                latencyMs: logEntry.latencyMs,
                payload: logEntry as unknown as Record<string, unknown>,
            });
            await trimLlmRequestLogs(REQUEST_LOG_MAX_RECORDS);
            logger.success('[RequestLog][PersistSuccess]', {
                requestId: record.requestId,
                logId: logEntry.logId,
                sourcePluginId,
                state: record.state,
                taskId: record.taskId,
            });
        } catch (error: unknown) {
            logger.error('[RequestLog][PersistFail]', {
                requestId: record.requestId,
                logId: logEntry.logId,
                sourcePluginId,
                state: record.state,
                taskId: record.taskId,
                error: String((error as Error)?.message || error),
            });
            throw error;
        }
    }

    private buildLogResponseSnapshot(record: RequestRecord): LLMRequestLogResponseSnapshot {
        const meta = record.meta
            ? {
                requestId: record.meta.requestId,
                resourceId: record.meta.resourceId,
                model: record.meta.model,
                capabilityKind: record.meta.capabilityKind,
                queuedAt: record.meta.queuedAt,
                startedAt: record.meta.startedAt,
                finishedAt: record.meta.finishedAt,
                latencyMs: record.meta.latencyMs,
                fallbackUsed: record.meta.fallbackUsed,
            }
            : undefined;

        return {
            meta,
            finalError: record.debug?.finalError,
            reasonCode: record.debug?.reasonCode,
            validationErrors: Array.isArray(record.debug?.validationErrors) ? record.debug?.validationErrors.slice(0, 50) : undefined,
            rawResponseText: record.debug?.rawResponseText,
            providerResponse: record.debug?.providerResponse,
            parsedResponse: record.debug?.parsedResponse,
            normalizedResponse: record.debug?.normalizedResponse,
        };
    }
}
