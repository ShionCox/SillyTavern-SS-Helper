import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DreamLockService } from '../src/services/dream-lock-service';
import type { DreamLockRecord } from '../src/services/dream-lock-types';

function createStore() {
    let record: DreamLockRecord | null = null;
    return {
        async getDreamLockState(): Promise<DreamLockRecord | null> {
            return record;
        },
        async saveDreamLockState(next: DreamLockRecord): Promise<void> {
            record = next;
        },
        async deleteDreamLockState(): Promise<void> {
            record = null;
        },
        read(): DreamLockRecord | null {
            return record;
        },
    };
}

describe('DreamLockService', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('首次获取锁会写入持久记录', async () => {
        vi.setSystemTime(1000);
        const store = createStore();
        const service = new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        });

        const result = await service.tryAcquireLock({
            triggerSource: 'generation_ended',
            dreamId: 'dream:1',
            ttlMs: 5000,
        });

        expect(result.ok).toBe(true);
        expect(store.read()?.lockKey).toBe('dream_lock:chat:test');
        expect(store.read()?.holderId).toBe('holder:1');
        expect(store.read()?.expiresAt).toBe(6000);
    });

    it('已有未过期锁时会拒绝其他 holder 获取', async () => {
        vi.setSystemTime(1000);
        const store = createStore();
        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        }).tryAcquireLock({
            triggerSource: 'idle',
            dreamId: 'dream:1',
            ttlMs: 5000,
        });

        const result = await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:2',
            repository: store,
        }).tryAcquireLock({
            triggerSource: 'idle',
            dreamId: 'dream:2',
            ttlMs: 5000,
        });

        expect(result.ok).toBe(false);
        expect(result.reasonCode).toBe('lock_active');
        expect(store.read()?.holderId).toBe('holder:1');
    });

    it('锁过期后允许新 holder 回收并抢占', async () => {
        vi.setSystemTime(1000);
        const store = createStore();
        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        }).tryAcquireLock({
            triggerSource: 'idle',
            dreamId: 'dream:1',
            ttlMs: 1000,
        });

        vi.setSystemTime(3000);
        const result = await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:2',
            repository: store,
        }).tryAcquireLock({
            triggerSource: 'idle',
            dreamId: 'dream:2',
            ttlMs: 5000,
        });

        expect(result.ok).toBe(true);
        expect(result.reasonCode).toBe('lock_stale_recovered');
        expect(result.recoveredStaleLock).toBe(true);
        expect(store.read()?.holderId).toBe('holder:2');
    });

    it('非 holder 或 dreamId 不匹配时不会误释放锁', async () => {
        vi.setSystemTime(1000);
        const store = createStore();
        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        }).tryAcquireLock({
            triggerSource: 'generation_ended',
            dreamId: 'dream:1',
            ttlMs: 5000,
        });

        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:2',
            repository: store,
        }).releaseLock();
        expect(store.read()?.holderId).toBe('holder:1');

        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        }).releaseLock({ expectedDreamId: 'dream:other' });
        expect(store.read()?.dreamId).toBe('dream:1');

        await new DreamLockService({
            chatKey: 'chat:test',
            holderId: 'holder:1',
            repository: store,
        }).releaseLock({ expectedDreamId: 'dream:1' });
        expect(store.read()).toBeNull();
    });
});
