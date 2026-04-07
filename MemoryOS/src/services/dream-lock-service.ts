import type { DreamTriggerReason } from './dream-types';
import type { DreamLockRecord } from './dream-lock-types';
import { buildDreamLockKey } from './dream-lock-types';
import { DreamLockRepository } from './dream-lock-repository';

export const DEFAULT_DREAM_LOCK_TTL_MS = 15 * 60 * 1000;

type DreamLockStore = {
    getDreamLockState: () => Promise<DreamLockRecord | null>;
    saveDreamLockState: (record: DreamLockRecord) => Promise<void>;
    deleteDreamLockState: () => Promise<void>;
};

export class DreamLockService {
    private readonly chatKey: string;
    private readonly holderId: string;
    private readonly repository: DreamLockStore;

    constructor(input: { chatKey: string; holderId: string; repository?: DreamLockStore }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.holderId = String(input.holderId ?? '').trim();
        this.repository = input.repository ?? new DreamLockRepository(this.chatKey);
    }

    async tryAcquireLock(input: {
        triggerSource: DreamTriggerReason;
        dreamId?: string;
        ttlMs?: number;
    }): Promise<{
        ok: boolean;
        reasonCode?: 'lock_active' | 'lock_stale_recovered';
        record?: DreamLockRecord;
        recoveredStaleLock?: boolean;
    }> {
        const now = Date.now();
        const ttlMs = Math.max(1000, Number(input.ttlMs ?? DEFAULT_DREAM_LOCK_TTL_MS) || DEFAULT_DREAM_LOCK_TTL_MS);
        const existing = await this.repository.getDreamLockState();
        const recoveredStaleLock = Boolean(existing && this.isLockExpired(existing, now));
        if (existing && !recoveredStaleLock && existing.holderId !== this.holderId) {
            return {
                ok: false,
                reasonCode: 'lock_active',
                record: existing,
            };
        }
        const record: DreamLockRecord = {
            lockKey: buildDreamLockKey(this.chatKey),
            chatKey: this.chatKey,
            holderId: this.holderId,
            status: 'running',
            acquiredAt: now,
            heartbeatAt: now,
            expiresAt: now + ttlMs,
            createdAt: recoveredStaleLock ? now : existing?.createdAt ?? now,
            updatedAt: now,
            triggerSource: input.triggerSource,
            dreamId: String(input.dreamId ?? existing?.dreamId ?? '').trim() || undefined,
        };
        await this.repository.saveDreamLockState(record);
        const confirmed = await this.repository.getDreamLockState();
        if (!confirmed || confirmed.holderId !== this.holderId || String(confirmed.dreamId ?? '') !== String(record.dreamId ?? '')) {
            return {
                ok: false,
                reasonCode: 'lock_active',
                record: confirmed ?? undefined,
            };
        }
        return {
            ok: true,
            reasonCode: recoveredStaleLock ? 'lock_stale_recovered' : undefined,
            record: confirmed,
            recoveredStaleLock,
        };
    }

    async refreshLock(ttlMs = DEFAULT_DREAM_LOCK_TTL_MS): Promise<void> {
        const existing = await this.repository.getDreamLockState();
        if (!existing || existing.holderId !== this.holderId) {
            return;
        }
        const now = Date.now();
        await this.repository.saveDreamLockState({
            ...existing,
            heartbeatAt: now,
            expiresAt: now + Math.max(1000, ttlMs),
            updatedAt: now,
        });
    }

    async releaseLock(input?: { expectedDreamId?: string }): Promise<void> {
        const existing = await this.repository.getDreamLockState();
        if (!existing) {
            return;
        }
        const expectedDreamId = String(input?.expectedDreamId ?? '').trim();
        if (existing.holderId !== this.holderId) {
            return;
        }
        if (expectedDreamId && String(existing.dreamId ?? '').trim() !== expectedDreamId) {
            return;
        }
        await this.repository.deleteDreamLockState();
    }

    async getActiveLock(): Promise<DreamLockRecord | null> {
        const existing = await this.repository.getDreamLockState();
        if (!existing || this.isLockExpired(existing)) {
            return null;
        }
        return existing;
    }

    isLockExpired(record: DreamLockRecord, now = Date.now()): boolean {
        return Number(record.expiresAt ?? 0) <= now;
    }
}
