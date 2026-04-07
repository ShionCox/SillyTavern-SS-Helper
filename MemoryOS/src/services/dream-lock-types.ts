import type { DreamTriggerReason } from './dream-types';

export type DreamLockStatus = 'running' | 'releasing';

export interface DreamLockRecord {
    lockKey: string;
    chatKey: string;
    holderId: string;
    status: DreamLockStatus;
    acquiredAt: number;
    heartbeatAt: number;
    expiresAt: number;
    createdAt: number;
    updatedAt: number;
    triggerSource?: DreamTriggerReason;
    dreamId?: string;
}

export function buildDreamLockKey(chatKey: string): string {
    return `dream_lock:${String(chatKey ?? '').trim()}`;
}
