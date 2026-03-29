import {
    getCurrentTavernCharacterEvent,
    getCurrentTavernUserSnapshotEvent,
    extractTavernMessageTextEvent,
    getTavernRuntimeContextEvent,
    getTavernSemanticSnapshotEvent,
} from '../../../SDK/tavern';
import type { MemoryTakeoverRange } from '../types';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：定义接管消息片段。
 */
export interface MemoryTakeoverMessageSlice {
    floor: number;
    role: string;
    name: string;
    content: string;
    contentSource?: string;
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
 * 功能：收集当前聊天可用的接管源数据。
 * @returns 接管源数据包。
 */
export function collectTakeoverSourceBundle(): MemoryTakeoverSourceBundle {
    const runtimeContext = getTavernRuntimeContextEvent();
    const rows: unknown[] = Array.isArray(runtimeContext?.chat) ? runtimeContext.chat : [];
    const skippedStats: MemoryTakeoverSkippedReasonStats = {
        system_message: 0,
        empty_after_normalize: 0,
        unsupported_shape: 0,
    };
    const messages: MemoryTakeoverMessageSlice[] = rows
        .map((row: unknown, index: number): MemoryTakeoverMessageSlice | null => {
            if (!row || typeof row !== 'object') {
                return null;
            }
            const record = row as Record<string, unknown>;
            const roleResult = normalizeTakeoverMessageRole(record);
            if (!roleResult) {
                skippedStats.system_message += 1;
                return null;
            }
            const extraction = extractTavernMessageTextEvent(record);
            const content: string = String(extraction.text ?? '').trim();
            if (!content) {
                if (extraction.normalizedShapeHint === 'unsupported_message_shape' || extraction.normalizedShapeHint === 'unsupported_swipe_shape') {
                    skippedStats.unsupported_shape += 1;
                } else {
                    skippedStats.empty_after_normalize += 1;
                }
                return null;
            }
            return {
                floor: index + 1,
                role: roleResult.role,
                name: String(record.name ?? record.display_name ?? '').trim(),
                content,
                contentSource: extraction.textSource,
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
