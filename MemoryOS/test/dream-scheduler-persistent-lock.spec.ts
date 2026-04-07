import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DreamSchedulerStateRecord } from '../src/services/dream-types';

const states = new Map<string, DreamSchedulerStateRecord>();
let executionLockActive = false;
let activeLockVisible = false;

vi.mock('../src/settings/store', async () => {
    const actual = await vi.importActual('../src/settings/store');
    return {
        ...actual,
        readMemoryOSSettings: () => ({
            ...(actual as any).DEFAULT_MEMORY_OS_SETTINGS,
            enabled: true,
            dreamEnabled: true,
            dreamAutoTriggerEnabled: true,
            dreamSchedulerEnabled: true,
            dreamSchedulerCooldownMinutes: 1,
            dreamSchedulerDailyMaxRuns: 3,
            dreamSchedulerAllowGenerationEndedTrigger: true,
            dreamSchedulerAllowIdleTrigger: true,
            dreamExecutionMode: 'manual_review',
        }),
    };
});

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            private readonly chatKey: string;

            constructor(chatKey: string) {
                this.chatKey = String(chatKey ?? '').trim();
            }

            async getDreamSchedulerState(): Promise<DreamSchedulerStateRecord | null> {
                return states.get(this.chatKey) ?? null;
            }

            async saveDreamSchedulerState(record: DreamSchedulerStateRecord): Promise<void> {
                states.set(this.chatKey, record);
            }
        },
    };
});

vi.mock('../src/services/dream-lock-service', () => {
    return {
        DEFAULT_DREAM_LOCK_TTL_MS: 15 * 60 * 1000,
        DreamLockService: class {
            private readonly chatKey: string;
            private readonly holderId: string;

            constructor(input: { chatKey: string; holderId: string }) {
                this.chatKey = input.chatKey;
                this.holderId = input.holderId;
            }

            async getActiveLock(): Promise<Record<string, unknown> | null> {
                return activeLockVisible
                    ? { chatKey: this.chatKey, holderId: 'other-holder', expiresAt: Date.now() + 1000 }
                    : null;
            }

            async tryAcquireLock(): Promise<{
                ok: boolean;
                reasonCode?: 'lock_active';
                record?: { dreamId: string };
            }> {
                if (executionLockActive) {
                    return { ok: false, reasonCode: 'lock_active' };
                }
                executionLockActive = true;
                return {
                    ok: true,
                    record: { dreamId: `dream_run:${this.chatKey}:${this.holderId}` },
                };
            }

            async releaseLock(): Promise<void> {
                executionLockActive = false;
            }
        },
    };
});

import { DreamSchedulerService } from '../src/services/dream-scheduler-service';

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let index = 0; index < 20; index += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error('waitFor timeout');
}

describe('DreamSchedulerService persistent lock', () => {
    beforeEach(() => {
        states.clear();
        executionLockActive = false;
        activeLockVisible = false;
    });

    it('eligibility 阶段会优先被持久锁拦截', async () => {
        activeLockVisible = true;
        const scheduler = new DreamSchedulerService('chat:locked', 'holder:test');

        const decision = await scheduler.checkDreamTriggerEligibility({
            triggerSource: 'generation_ended',
        });

        expect(decision.shouldTrigger).toBe(false);
        expect(decision.blockedBy).toContain('lock_active');
        expect(states.get('chat:locked')?.lastBlockedByLockAt).toBeTypeOf('number');
    });

    it('执行前第二次抢锁失败时不会执行 job', async () => {
        executionLockActive = true;
        const scheduler = new DreamSchedulerService('chat:race', 'holder:test');
        const execute = vi.fn(async () => ({ ok: true, status: 'deferred' }));

        const decision = await scheduler.enqueueDreamJob({
            chatKey: 'chat:race',
            triggerSource: 'generation_ended',
            execute,
        });
        await waitFor(() => states.get('chat:race')?.lastBlockedReasonCodes?.includes('lock_active') === true);

        expect(decision.shouldTrigger).toBe(true);
        expect(execute).not.toHaveBeenCalled();
        expect(states.get('chat:race')?.active).toBe(false);
    });

    it('只有成功执行才增加 dailyRunCount，失败只记录 lastFailedAt', async () => {
        const successScheduler = new DreamSchedulerService('chat:success', 'holder:success');
        await successScheduler.enqueueDreamJob({
            chatKey: 'chat:success',
            triggerSource: 'generation_ended',
            execute: async () => ({ ok: true, status: 'deferred' }),
        });
        await waitFor(() => states.get('chat:success')?.lastSuccessAt !== undefined);

        const failedScheduler = new DreamSchedulerService('chat:failed', 'holder:failed');
        await failedScheduler.enqueueDreamJob({
            chatKey: 'chat:failed',
            triggerSource: 'generation_ended',
            execute: async () => ({ ok: false, status: 'failed', reasonCode: 'dream_failed' }),
        });
        await waitFor(() => states.get('chat:failed')?.lastFailedAt !== undefined);

        expect(states.get('chat:success')?.dailyRunCount).toBe(1);
        expect(states.get('chat:success')?.lastFailedAt).toBeUndefined();
        expect(states.get('chat:failed')?.dailyRunCount).toBe(0);
        expect(states.get('chat:failed')?.lastSuccessAt).toBeUndefined();
    });
});
