import {
    getCurrentTavernCharacterEvent,
    getCurrentTavernUserSnapshotEvent,
    getTavernRuntimeContextEvent,
    getTavernSemanticSnapshotEvent,
} from '../../../SDK/tavern';
import type { MemoryTakeoverRange } from '../types';

/**
 * 功能：定义接管消息片段。
 */
export interface MemoryTakeoverMessageSlice {
    floor: number;
    role: string;
    name: string;
    content: string;
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
 * 功能：收集当前聊天可用的接管源数据。
 * @returns 接管源数据包。
 */
export function collectTakeoverSourceBundle(): MemoryTakeoverSourceBundle {
    const runtimeContext = getTavernRuntimeContextEvent();
    const rows: unknown[] = Array.isArray(runtimeContext?.chat) ? runtimeContext.chat : [];
    const messages: MemoryTakeoverMessageSlice[] = rows
        .map((row: unknown, index: number): MemoryTakeoverMessageSlice | null => {
            if (!row || typeof row !== 'object') {
                return null;
            }
            const record = row as Record<string, unknown>;
            const content: string = String(record.mes ?? record.content ?? record.text ?? '').trim();
            if (!content) {
                return null;
            }
            const explicitRole: string = String(record.role ?? '').trim().toLowerCase();
            const role: string = explicitRole === 'user' || explicitRole === 'assistant' || explicitRole === 'system'
                ? explicitRole
                : (record.is_user === true ? 'user' : (record.is_system === true ? 'system' : 'assistant'));
            if (role === 'system') {
                return null;
            }
            return {
                floor: index + 1,
                role,
                name: String(record.name ?? record.display_name ?? '').trim(),
                content,
            };
        })
        .filter((item: MemoryTakeoverMessageSlice | null): item is MemoryTakeoverMessageSlice => item !== null);

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
