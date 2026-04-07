import { readMemoryOSSettings } from '../../settings/store';
import { logger } from '../../runtime/runtime-services';

export type MemoryDebugLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type MemoryDebugLogStage =
    | 'context'
    | 'seed'
    | 'graph'
    | 'coverage'
    | 'diversity'
    | 'injection'
    | 'workbench';

export interface MemoryDebugLogRecord {
    ts: number;
    level: MemoryDebugLogLevel;
    stage: MemoryDebugLogStage;
    title: string;
    message: string;
    payload?: Record<string, unknown>;
}

const TRACE_LIMIT: number = 120;
const stageLabelMap: Record<MemoryDebugLogStage, string> = {
    context: '情境判定',
    seed: '种子召回',
    graph: '图扩散',
    coverage: '补召回',
    diversity: '多样性裁剪',
    injection: '注入构建',
    workbench: '工作台',
};
const levelLabelMap: Record<MemoryDebugLogLevel, string> = {
    debug: '调试',
    info: '信息',
    warn: '警告',
    error: '错误',
};
const retrievalTraceStore: Map<string, MemoryDebugLogRecord[]> = new Map<string, MemoryDebugLogRecord[]>();

/**
 * 功能：标准化检索日志记录。
 * @param record 原始记录。
 * @returns 标准化后的记录。
 */
export function normalizeMemoryDebugRecord(record: MemoryDebugLogRecord): MemoryDebugLogRecord {
    return {
        ts: Math.max(0, Number(record.ts ?? Date.now()) || Date.now()),
        level: record.level,
        stage: record.stage,
        title: String(record.title ?? '').trim() || '未命名阶段',
        message: String(record.message ?? '').trim() || '无日志内容',
        payload: record.payload ? { ...record.payload } : undefined,
    };
}

/**
 * 功能：输出一条检索日志到控制台。
 * @param record 日志记录。
 * @returns 无返回值。
 */
export function logMemoryDebug(record: MemoryDebugLogRecord): void {
    const settings = readMemoryOSSettings();
    if (settings.retrievalLogEnabled === false) {
        return;
    }
    if (record.level === 'debug' && settings.retrievalLogLevel !== 'debug') {
        return;
    }
    const normalized = normalizeMemoryDebugRecord(record);
    const prefix = `[记忆召回][${stageLabelMap[normalized.stage]}][${levelLabelMap[normalized.level]}] ${normalized.message}`;
    if (normalized.level === 'error') {
        logger.error(prefix, normalized.payload ?? {});
        return;
    }
    if (normalized.level === 'warn') {
        logger.warn(prefix, normalized.payload ?? {});
        return;
    }
    if (normalized.level === 'debug') {
        logger.debug(prefix, normalized.payload ?? {});
        return;
    }
    logger.info(prefix, normalized.payload ?? {});
}

/**
 * 功能：把检索日志写入当前聊天的 trace 缓冲。
 * @param chatKey 聊天键。
 * @param record 日志记录。
 * @returns 无返回值。
 */
export function pushMemoryTrace(chatKey: string, record: MemoryDebugLogRecord): void {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return;
    }
    const settings = readMemoryOSSettings();
    if (settings.retrievalTracePanelEnabled === false) {
        return;
    }
    const normalized = normalizeMemoryDebugRecord(record);
    const nextRecords = [...(retrievalTraceStore.get(normalizedChatKey) ?? []), normalized].slice(-TRACE_LIMIT);
    retrievalTraceStore.set(normalizedChatKey, nextRecords);
}

/**
 * 功能：同时写入控制台与 trace 缓冲。
 * @param chatKey 聊天键。
 * @param record 日志记录。
 * @returns 标准化后的日志记录。
 */
export function recordMemoryDebug(chatKey: string | undefined, record: MemoryDebugLogRecord): MemoryDebugLogRecord {
    const normalized = normalizeMemoryDebugRecord(record);
    logMemoryDebug(normalized);
    if (chatKey) {
        pushMemoryTrace(chatKey, normalized);
    }
    return normalized;
}

/**
 * 功能：读取当前聊天最近一批检索 trace。
 * @param chatKey 聊天键。
 * @returns trace 列表。
 */
export function getMemoryTrace(chatKey: string): MemoryDebugLogRecord[] {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return [];
    }
    return (retrievalTraceStore.get(normalizedChatKey) ?? []).map((record: MemoryDebugLogRecord): MemoryDebugLogRecord => ({
        ...record,
        payload: record.payload ? { ...record.payload } : undefined,
    }));
}

/**
 * 功能：清空当前聊天的检索 trace。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
export function clearMemoryTrace(chatKey: string): void {
    const normalizedChatKey = String(chatKey ?? '').trim();
    if (!normalizedChatKey) {
        return;
    }
    retrievalTraceStore.delete(normalizedChatKey);
}
