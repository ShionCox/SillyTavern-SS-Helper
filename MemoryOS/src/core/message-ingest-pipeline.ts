import type { MessageIngestEventType } from './message-ingest-dedup';
import {
    buildRecordFilterAuditMetadata,
    filterRecordTextBySettings,
    normalizeRecordFilterSettings,
    type RecordFilterAuditMetadata,
    type RecordFilterDedupSource,
    type RecordFilterIngestHint,
    type RecordFilterResult,
    type RecordFilterSettings,
} from './record-filter';
import { normalizeIncomingMessageId, resolveMessageIngestDedupSource } from './message-ingest-dedup';

/**
 * 功能：定义消息写入前的标准化输入。
 */
export interface PrepareFilteredMessageIngestInput {
    eventType: MessageIngestEventType;
    rawText: string;
    messageId: unknown;
    ingestHint: RecordFilterIngestHint;
    normalizedFilterSettings: RecordFilterSettings;
}

/**
 * 功能：定义可直接落库的标准化消息载荷。
 */
export interface PreparedMessageIngestPayload {
    eventType: MessageIngestEventType;
    filteredText: string;
    normalizedMessageId: string;
    dedupSource: RecordFilterDedupSource;
    filterResult: RecordFilterResult;
    auditMetadata: RecordFilterAuditMetadata;
}

/**
 * 功能：定义消息准备阶段返回结果。
 */
export interface PreparedMessageIngestResult {
    accepted: boolean;
    payload: PreparedMessageIngestPayload | null;
    reasonCode: RecordFilterResult['reasonCode'];
}

/**
 * 功能：定义落库阶段输入。
 */
export interface PreparedMessageAppendInput {
    payload: PreparedMessageIngestPayload;
    sourcePlugin: string;
    sourceMessageId?: string;
}

/**
 * 功能：定义最小事件写入能力接口。
 */
export interface MessageEventAppendHost {
    events?: {
        append?: (
            type: MessageIngestEventType,
            payload: { text: string; audit: RecordFilterAuditMetadata },
            meta?: { sourceMessageId?: string; sourcePlugin?: string },
        ) => Promise<unknown>;
    };
}

/**
 * 功能：执行统一的消息过滤、审计和入库载荷准备。
 * @param input 标准化输入。
 * @returns 可落库载荷或丢弃结果。
 */
export function prepareFilteredMessageIngest(input: PrepareFilteredMessageIngestInput): PreparedMessageIngestResult {
    const filterResult = filterRecordTextBySettings(input.rawText, input.normalizedFilterSettings);
    const compactText = String(filterResult.filteredText ?? '').replace(/\s+/g, '');
    if (filterResult.dropped || compactText.length === 0) {
        return {
            accepted: false,
            payload: null,
            reasonCode: filterResult.reasonCode,
        };
    }

    const normalizedMessageId = normalizeIncomingMessageId(input.messageId, false);
    const dedupSource = resolveMessageIngestDedupSource(normalizedMessageId, filterResult.filteredText);
    const auditMetadata = buildRecordFilterAuditMetadata({
        rawText: input.rawText,
        filterResult,
        normalizedSettings: input.normalizedFilterSettings,
        ingestHint: input.ingestHint,
        dedupSource,
    });

    return {
        accepted: true,
        payload: {
            eventType: input.eventType,
            filteredText: filterResult.filteredText,
            normalizedMessageId,
            dedupSource,
            filterResult,
            auditMetadata,
        },
        reasonCode: filterResult.reasonCode,
    };
}

/**
 * 功能：将已准备好的消息载荷统一写入事件流。
 * @param host 事件写入宿主。
 * @param input 写入输入。
 * @returns 异步写入结果。
 */
export async function appendPreparedMessageEvent(
    host: MessageEventAppendHost,
    input: PreparedMessageAppendInput,
): Promise<void> {
    await host.events?.append?.(
        input.payload.eventType,
        {
            text: input.payload.filteredText,
            audit: input.payload.auditMetadata,
        },
        {
            sourcePlugin: input.sourcePlugin,
            sourceMessageId: input.sourceMessageId,
        },
    );
}

/**
 * 功能：读取并归一化记录过滤设置。
 * @param rawSettings 原始设置对象。
 * @returns 归一化后的设置。
 */
export function resolveNormalizedRecordFilterSettings(rawSettings: Record<string, unknown>): RecordFilterSettings {
    return normalizeRecordFilterSettings(rawSettings);
}
