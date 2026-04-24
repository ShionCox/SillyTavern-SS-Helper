import {
    getCurrentTavernCharacterEvent,
    getCurrentTavernUserSnapshotEvent,
    extractTavernMessageTextEvent,
    extractTavernMessageOriginalTextEvent,
    isTavernMessageHiddenEvent,
    getTavernRuntimeContextEvent,
    getTavernSemanticSnapshotEvent,
    stripRuntimePlaceholderArtifactsEvent,
} from '../../../SDK/tavern';
import type { MemoryTakeoverRange } from '../types';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：定义接管消息片段。
 */
export interface MemoryTakeoverMessageSlice {
    floor: number;
    sourceFloor: number;
    role: string;
    name: string;
    content: string;
    rawVisibleText?: string;
    contentSource?: string;
    rawVisibleTextSource?: string;
    /** 角色来源标记：记录 role 是由何种字段推导而来 */
    normalizedFrom?: string;
}

/**
 * 功能：定义接管源数据包。
 */
export interface MemoryTakeoverSourceBundle {
    characterCard: Record<string, unknown>;
    semanticSnapshot: Record<string, unknown>;
    userSnapshot: Record<string, unknown>;
    totalFloors: number;
    messages: MemoryTakeoverMessageSlice[];
}

/**
 * 功能：记录接管源收集时的跳过原因统计。
 */
interface MemoryTakeoverSkippedReasonStats {
    system_message: number;
    hidden_message: number;
    empty_after_normalize: number;
    unsupported_shape: number;
}

/**
 * 功能：归一化单条消息的 role。
 * @param record 原始消息对象。
 * @returns { role, normalizedFrom } 或 null（system 消息应跳过）。
 */
function normalizeTakeoverMessageRole(record: Record<string, unknown>): { role: string; normalizedFrom: string } | null {
    const explicitRole: string = String(record.role ?? '').trim().toLowerCase();
    if (explicitRole === 'user' || explicitRole === 'assistant') {
        return { role: explicitRole, normalizedFrom: 'explicit_role' };
    }
    if (explicitRole === 'system') {
        return null;
    }
    if (record.is_user === true || record.is_user === 1 || record.is_user === 'true') {
        return { role: 'user', normalizedFrom: 'is_user' };
    }
    const extraRecord = record.extra && typeof record.extra === 'object'
        ? record.extra as Record<string, unknown>
        : null;
    const extraType = String(extraRecord?.type ?? '').trim().toLowerCase();
    if (extraType === 'assistant_note' || extraType === 'narrator') {
        return null;
    }
    if (record.is_system === true || record.is_system === 1 || record.is_system === 'true') {
        if (typeof record.mes === 'string' && String(record.mes).trim()) {
            return { role: 'assistant', normalizedFrom: 'is_system_fallback_assistant' };
        }
        return null;
    }
    return { role: 'assistant', normalizedFrom: 'default_fallback' };
}

/**
 * 功能：从未知字段中提取当前楼层实际可见的原文，不做标准化清洗。
 * @param value 原始字段值。
 * @param sourcePrefix 当前来源前缀。
 * @returns 原始可见文本与来源；未命中时返回 null。
 */
function extractTakeoverVisibleTextFromValue(
    value: unknown,
    sourcePrefix: string,
): { text: string; source: string } | null {
    if (typeof value === 'string') {
        return {
            text: value,
            source: sourcePrefix,
        };
    }
    if (Array.isArray(value)) {
        const texts: string[] = value
            .map((item: unknown, index: number): string => {
                const result = extractTakeoverVisibleTextFromValue(item, `${sourcePrefix}[${index}]`);
                return result?.text ?? '';
            })
            .filter((item: string): boolean => item.length > 0);
        if (texts.length <= 0) {
            return null;
        }
        return {
            text: texts.join('\n'),
            source: sourcePrefix,
        };
    }
    if (!value || typeof value !== 'object') {
        return null;
    }

    const record = value as Record<string, unknown>;
    const directTextKeys = ['text', 'content', 'message', 'mes'] as const;
    for (const key of directTextKeys) {
        if (typeof record[key] === 'string') {
            return {
                text: record[key],
                source: `${sourcePrefix}.${key}`,
            };
        }
    }
    for (const key of directTextKeys) {
        if (record[key] != null) {
            const nestedResult = extractTakeoverVisibleTextFromValue(record[key], `${sourcePrefix}.${key}`);
            if (nestedResult) {
                return nestedResult;
            }
        }
    }
    return null;
}

/**
 * 功能：从对象路径中提取楼层显示文本，优先命中宿主已经处理好的 display_text。
 * @param value 原始字段值。
 * @param sourcePrefix 当前来源前缀。
 * @returns 显示文本与来源；未命中时返回 null。
 */
function extractTakeoverDisplayTextFromValue(
    value: unknown,
    sourcePrefix: string,
): { text: string; source: string } | null {
    if (typeof value === 'string') {
        const text = value.trim();
        if (!text) {
            return null;
        }
        return {
            text: value,
            source: sourcePrefix,
        };
    }
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const directDisplayKeys = ['display_text', 'displayText'] as const;
    for (const key of directDisplayKeys) {
        if (typeof record[key] === 'string' && String(record[key]).trim()) {
            return {
                text: String(record[key]),
                source: `${sourcePrefix}.${key}`,
            };
        }
    }
    const extraRecord = record.extra && typeof record.extra === 'object'
        ? record.extra as Record<string, unknown>
        : null;
    if (extraRecord) {
        for (const key of directDisplayKeys) {
            if (typeof extraRecord[key] === 'string' && String(extraRecord[key]).trim()) {
                return {
                    text: String(extraRecord[key]),
                    source: `${sourcePrefix}.extra.${key}`,
                };
            }
        }
    }
    return null;
}

/**
 * 功能：优先提取宿主实际显示在聊天楼层里的完整文本。
 * @param record 原始消息对象。
 * @returns 显示文本与来源；未命中时返回 null。
 */
function extractTakeoverDisplayedMessageText(record: Record<string, unknown>): { text: string; source: string } | null {
    const swipeId = Number(record.swipe_id ?? record.swipeId);
    const swipeInfo = record.swipe_info;
    if (Array.isArray(swipeInfo) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipeInfo.length) {
        const swipeInfoResult = extractTakeoverDisplayTextFromValue(swipeInfo[swipeId], `swipe_info[${swipeId}]`);
        if (swipeInfoResult) {
            return swipeInfoResult;
        }
    }

    const topLevelDisplayResult = extractTakeoverDisplayTextFromValue(record, 'message');
    if (topLevelDisplayResult) {
        return topLevelDisplayResult;
    }

    return null;
}

/**
 * 功能：提取接管链路实际用于处理的正文，优先选择更完整的可见文本。
 * @param record 原始消息对象。
 * @returns 正文、来源与结构提示。
 */
function extractTakeoverProcessingMessageText(record: Record<string, unknown>): {
    text: string;
    source: string;
    normalizedShapeHint?: string;
} {
    const displayedResult = extractTakeoverDisplayedMessageText(record);
    if (displayedResult) {
        return {
            text: stripRuntimePlaceholderArtifactsEvent(displayedResult.text),
            source: displayedResult.source,
            normalizedShapeHint: 'display_text',
        };
    }

    const swipeId = Number(record.swipe_id ?? record.swipeId);
    const swipes = record.swipes;
    if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
        const swipeResult = extractTakeoverVisibleTextFromValue(swipes[swipeId], `swipes[${swipeId}]`);
        if (swipeResult?.text.trim()) {
            return {
                text: stripRuntimePlaceholderArtifactsEvent(swipeResult.text),
                source: swipeResult.source,
                normalizedShapeHint: 'swipe_visible_text',
            };
        }
    }

    for (const key of ['content', 'text', 'message']) {
        const result = extractTakeoverVisibleTextFromValue(record[key], key);
        if (result?.text.trim()) {
            return {
                text: stripRuntimePlaceholderArtifactsEvent(result.text),
                source: result.source,
                normalizedShapeHint: `${key}_visible_text`,
            };
        }
    }

    const originalResult = extractTavernMessageOriginalTextEvent(record);
    if (originalResult.text.trim()) {
        return {
            text: stripRuntimePlaceholderArtifactsEvent(originalResult.text),
            source: originalResult.source,
            normalizedShapeHint: 'original_text',
        };
    }

    const mesResult = extractTakeoverVisibleTextFromValue(record.mes, 'mes');
    if (mesResult?.text.trim()) {
        return {
            text: stripRuntimePlaceholderArtifactsEvent(mesResult.text),
            source: mesResult.source,
            normalizedShapeHint: 'mes_visible_text',
        };
    }

    const extraction = extractTavernMessageTextEvent(record);
    return {
        text: String(extraction.text ?? ''),
        source: extraction.textSource,
        normalizedShapeHint: extraction.normalizedShapeHint,
    };
}

/**
 * 功能：尽量读取聊天消息中的楼层可见原文，不做标准化清洗。
 * @param record 原始消息对象。
 * @returns 原始可见文本与来源。
 */
function extractTakeoverRawVisibleMessageText(record: Record<string, unknown>): { text: string; source: string } {
    // 优先使用宿主已经生成的显示文本，确保记忆过滤器看到的是楼层真正展示的全文
    const displayedResult = extractTakeoverDisplayedMessageText(record);
    if (displayedResult) {
        return displayedResult;
    }

    const swipeId = Number(record.swipe_id ?? record.swipeId);
    const swipes = record.swipes;
    if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
        const swipeResult = extractTakeoverVisibleTextFromValue(swipes[swipeId], `swipes[${swipeId}]`);
        if (swipeResult) {
            return swipeResult;
        }
    }
    for (const key of ['content', 'text', 'message']) {
        const result = extractTakeoverVisibleTextFromValue(record[key], key);
        if (result) {
            return result;
        }
    }

    // 回退到 SDK 提供的原始文本提取（会还原被 SillyTavern 剥离的 reasoning 块）
    const originalResult = extractTavernMessageOriginalTextEvent(record);
    if (originalResult.text) {
        return originalResult;
    }

    const mesResult = extractTakeoverVisibleTextFromValue(record.mes, 'mes');
    if (mesResult) {
        return mesResult;
    }

    return { text: '', source: 'unavailable' };
}

/**
 * 功能：收集当前聊天可用的接管源数据。
 * @returns 接管源数据包。
 */
export function collectTakeoverSourceBundle(): MemoryTakeoverSourceBundle {
    const runtimeContext = getTavernRuntimeContextEvent();
    const rows: unknown[] = Array.isArray(runtimeContext?.chat) ? runtimeContext.chat : [];
    const skippedStats: MemoryTakeoverSkippedReasonStats = {
        system_message: 0,
        hidden_message: 0,
        empty_after_normalize: 0,
        unsupported_shape: 0,
    };
    let visibleFloor = 0;
    const messages: MemoryTakeoverMessageSlice[] = rows
        .map((row: unknown, index: number): MemoryTakeoverMessageSlice | null => {
            if (!row || typeof row !== 'object') {
                return null;
            }
            const record = row as Record<string, unknown>;
            if (isTavernMessageHiddenEvent(record)) {
                skippedStats.hidden_message += 1;
                return null;
            }
            const roleResult = normalizeTakeoverMessageRole(record);
            if (!roleResult) {
                skippedStats.system_message += 1;
                return null;
            }
            const extraction = extractTakeoverProcessingMessageText(record);
            const content: string = String(extraction.text ?? '').trim();
            const rawVisibleExtraction = extractTakeoverRawVisibleMessageText(record);
            if (!content) {
                if (extraction.normalizedShapeHint === 'unsupported_message_shape' || extraction.normalizedShapeHint === 'unsupported_swipe_shape') {
                    skippedStats.unsupported_shape += 1;
                } else {
                    skippedStats.empty_after_normalize += 1;
                }
                return null;
            }
            visibleFloor += 1;
            return {
                floor: visibleFloor,
                sourceFloor: index + 1,
                role: roleResult.role,
                name: String(record.name ?? record.display_name ?? '').trim(),
                content,
                rawVisibleText: rawVisibleExtraction.text,
                contentSource: extraction.source,
                rawVisibleTextSource: rawVisibleExtraction.source,
                normalizedFrom: roleResult.normalizedFrom,
            };
        })
        .filter((item: MemoryTakeoverMessageSlice | null): item is MemoryTakeoverMessageSlice => item !== null);

    const roleStats: Record<string, number> = {};
    for (const msg of messages) {
        roleStats[msg.role] = (roleStats[msg.role] || 0) + 1;
    }
    logger.info(`[takeover][source] 收集完成：总消息=${messages.length}，role分布=`, roleStats);

    logger.info('[takeover][source] 跳过统计=', skippedStats);
    return {
        characterCard: (getCurrentTavernCharacterEvent() ?? {}) as Record<string, unknown>,
        semanticSnapshot: (getTavernSemanticSnapshotEvent() ?? {}) as Record<string, unknown>,
        userSnapshot: (getCurrentTavernUserSnapshotEvent() ?? {}) as Record<string, unknown>,
        totalFloors: messages.length,
        messages,
    };
}

/**
 * 功能：按楼层范围切取消息。
 * @param bundle 接管源数据包。
 * @param range 楼层范围。
 * @returns 消息切片。
 */
export function sliceTakeoverMessages(
    bundle: MemoryTakeoverSourceBundle,
    range: MemoryTakeoverRange,
): MemoryTakeoverMessageSlice[] {
    return bundle.messages.filter((message: MemoryTakeoverMessageSlice): boolean => {
        return message.floor >= range.startFloor && message.floor <= range.endFloor;
    });
}
