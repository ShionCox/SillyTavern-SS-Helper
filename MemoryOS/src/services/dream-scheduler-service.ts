import { readMemoryOSSettings } from '../settings/store';
import { DEFAULT_DREAM_LOCK_TTL_MS, DreamLockService } from './dream-lock-service';
import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamExecutionMode,
    DreamScheduleDecision,
    DreamSchedulerStateRecord,
    DreamTriggerReason,
} from './dream-types';

type DreamSchedulerJob = {
    chatKey: string;
    triggerSource: Exclude<DreamTriggerReason, 'manual'>;
    blockedBy?: string[];
    execute: (context: {
        holderId: string;
        executionMode: DreamExecutionMode;
        triggerSource: Exclude<DreamTriggerReason, 'manual'>;
        dreamId: string;
    }) => Promise<{ ok: boolean; dreamId?: string; status?: string; reasonCode?: string }>;
};

const globalQueue: DreamSchedulerJob[] = [];
const queuedChatKeys = new Set<string>();
let activeChatKey = '';
const DREAM_HEAVY_SCAN_THROTTLE_MS = 10 * 60 * 1000;

function buildDateKey(ts: number): string {
    const date = new Date(ts);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function createDreamSchedulerHolderId(): string {
    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `dream_scheduler:${randomId}`;
}

/**
 * 功能：创建调度器预分配的真实梦境会话 ID。
 * @param chatKey 当前聊天键。
 * @returns 梦境会话 ID。
 */
function createScheduledDreamId(chatKey: string): string {
    const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return `dream:${chatKey}:${randomId}`;
}

/**
 * 功能：第三阶段 dream scheduler。
 */
export class DreamSchedulerService {
    private readonly chatKey: string;
    private readonly repository: DreamSessionRepository;
    private readonly holderId: string;

    constructor(chatKey: string, holderId = createDreamSchedulerHolderId()) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = new DreamSessionRepository(this.chatKey);
        this.holderId = String(holderId ?? '').trim() || createDreamSchedulerHolderId();
    }

    async checkDreamTriggerEligibility(input: {
        triggerSource: Exclude<DreamTriggerReason, 'manual'>;
        blockedBy?: string[];
    }): Promise<DreamScheduleDecision> {
        const settings = readMemoryOSSettings();
        const blockedBy = [...(input.blockedBy ?? [])];
        if (!settings.enabled || !settings.dreamEnabled || !settings.dreamAutoTriggerEnabled || !settings.dreamSchedulerEnabled) {
            blockedBy.push('scheduler_disabled');
        }
        if (input.triggerSource === 'generation_ended' && !settings.dreamSchedulerAllowGenerationEndedTrigger) {
            blockedBy.push('generation_trigger_disabled');
        }
        if (input.triggerSource === 'idle' && !settings.dreamSchedulerAllowIdleTrigger) {
            blockedBy.push('idle_trigger_disabled');
        }
        const currentState = await this.readState();
        const now = Date.now();
        const cooldownMs = Math.max(1, settings.dreamSchedulerCooldownMinutes) * 60 * 1000;
        if (currentState.lastTriggeredAt && now - currentState.lastTriggeredAt < cooldownMs) {
            blockedBy.push('cooldown_active');
        }
        const dateKey = buildDateKey(now);
        if (currentState.dailyDateKey === dateKey && currentState.dailyRunCount >= settings.dreamSchedulerDailyMaxRuns) {
            blockedBy.push('daily_max_reached');
        }
        if (activeChatKey && activeChatKey !== this.chatKey) {
            blockedBy.push('global_active_dream');
        }
        if (queuedChatKeys.has(this.chatKey)) {
            blockedBy.push('already_queued');
        }
        const lockService = new DreamLockService({ chatKey: this.chatKey, holderId: this.holderId });
        const activeLock = await lockService.getActiveLock();
        if (activeLock) {
            blockedBy.push('lock_active');
        }
        if (
            blockedBy.length <= 0
            && currentState.lastEligibilityHeavyScanAt
            && now - currentState.lastEligibilityHeavyScanAt < DREAM_HEAVY_SCAN_THROTTLE_MS
        ) {
            blockedBy.push('heavy_scan_throttled');
        }

        const decision: DreamScheduleDecision = {
            shouldTrigger: blockedBy.length <= 0,
            reasonCodes: blockedBy.length <= 0 ? ['scheduler_ready'] : [],
            triggerSource: input.triggerSource,
            blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
            suggestedDelayMs: blockedBy.includes('cooldown_active') ? cooldownMs : undefined,
        };
        await this.saveState({
            ...currentState,
            lastDecision: decision,
            lastBlockedByLockAt: blockedBy.includes('lock_active') ? now : currentState.lastBlockedByLockAt,
            lastBlockedReasonCodes: blockedBy.length > 0 ? blockedBy : currentState.lastBlockedReasonCodes,
            lastEligibilityHeavyScanAt: blockedBy.length <= 0 ? now : currentState.lastEligibilityHeavyScanAt,
            queuedJobCount: queuedChatKeys.has(this.chatKey) ? 1 : 0,
            active: activeChatKey === this.chatKey,
            updatedAt: Date.now(),
        });
        return decision;
    }

    async enqueueDreamJob(input: DreamSchedulerJob): Promise<DreamScheduleDecision> {
        const decision = await this.checkDreamTriggerEligibility({
            triggerSource: input.triggerSource,
            blockedBy: input.blockedBy,
        });
        if (!decision.shouldTrigger) {
            return decision;
        }
        globalQueue.push(input);
        queuedChatKeys.add(input.chatKey);
        await this.saveState({
            ...(await this.readState()),
            queuedJobCount: 1,
            active: activeChatKey === this.chatKey,
            lastDecision: decision,
            updatedAt: Date.now(),
        });
        void this.processQueue();
        return decision;
    }

    async getSchedulerState(): Promise<DreamSchedulerStateRecord> {
        return this.readState();
    }

    private async processQueue(): Promise<void> {
        if (activeChatKey) {
            return;
        }
        const job = globalQueue.shift();
        if (!job) {
            return;
        }
        queuedChatKeys.delete(job.chatKey);
        activeChatKey = job.chatKey;
        const repo = new DreamSessionRepository(job.chatKey);
        const state = await repo.getDreamSchedulerState() ?? this.createDefaultState(job.chatKey);
        const lockService = new DreamLockService({ chatKey: job.chatKey, holderId: this.holderId });
        const scheduledDreamId = createScheduledDreamId(job.chatKey);
        const lockResult = await lockService.tryAcquireLock({
            triggerSource: job.triggerSource,
            dreamId: scheduledDreamId,
            ttlMs: DEFAULT_DREAM_LOCK_TTL_MS,
        });
        const lockDecision: DreamScheduleDecision = {
            shouldTrigger: lockResult.ok,
            reasonCodes: lockResult.ok
                ? [lockResult.recoveredStaleLock ? 'lock_stale_recovered' : 'lock_acquired']
                : [],
            triggerSource: job.triggerSource,
            blockedBy: lockResult.ok ? undefined : [lockResult.reasonCode ?? 'lock_active'],
        };
        if (!lockResult.ok) {
            const now = Date.now();
            await repo.saveDreamSchedulerState({
                ...state,
                active: false,
                queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
                lastDecision: lockDecision,
                lastBlockedByLockAt: now,
                lastBlockedReasonCodes: lockDecision.blockedBy,
                activeDreamId: undefined,
                activeHolderId: undefined,
                updatedAt: now,
            });
            activeChatKey = '';
            if (globalQueue.length > 0) {
                void this.processQueue();
            }
            return;
        }
        const activeDreamId = lockResult.record?.dreamId ?? scheduledDreamId;
        const executionMode = readMemoryOSSettings().dreamExecutionMode;
        const startedAt = Date.now();
        await repo.saveDreamSchedulerState({
            ...state,
            active: true,
            queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
            lastTriggeredAt: startedAt,
            lastTriggerSource: job.triggerSource,
            lastAttemptAt: startedAt,
            lastLockAcquireAt: startedAt,
            activeDreamId,
            activeHolderId: this.holderId,
            lastDecision: lockDecision,
            updatedAt: startedAt,
        });
        try {
            const result = await job.execute({
                holderId: this.holderId,
                executionMode,
                triggerSource: job.triggerSource,
                dreamId: activeDreamId,
            });
            const resultDreamId = String(result.dreamId ?? '').trim();
            const now = Date.now();
            const dateKey = buildDateKey(now);
            const nextState = await repo.getDreamSchedulerState() ?? this.createDefaultState(job.chatKey);
            await repo.saveDreamSchedulerState({
                ...nextState,
                active: false,
                queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
                lastCompletedAt: now,
                lastSuccessAt: result.ok ? now : nextState.lastSuccessAt,
                lastFailedAt: result.ok ? nextState.lastFailedAt : now,
                lastBlockedReasonCodes: resultDreamId && resultDreamId !== activeDreamId
                    ? ['dream_id_mismatch']
                    : nextState.lastBlockedReasonCodes,
                dailyDateKey: nextState.dailyDateKey === dateKey ? dateKey : dateKey,
                dailyRunCount: nextState.dailyDateKey === dateKey ? nextState.dailyRunCount + (result.ok ? 1 : 0) : (result.ok ? 1 : 0),
                activeDreamId: undefined,
                activeHolderId: undefined,
                updatedAt: now,
            });
        } catch {
            const now = Date.now();
            const nextState = await repo.getDreamSchedulerState() ?? this.createDefaultState(job.chatKey);
            await repo.saveDreamSchedulerState({
                ...nextState,
                active: false,
                queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
                lastCompletedAt: now,
                lastFailedAt: now,
                activeDreamId: undefined,
                activeHolderId: undefined,
                updatedAt: now,
            });
        } finally {
            await lockService.releaseLock();
            const releaseAt = Date.now();
            const nextState = await repo.getDreamSchedulerState() ?? this.createDefaultState(job.chatKey);
            await repo.saveDreamSchedulerState({
                ...nextState,
                active: false,
                queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
                activeDreamId: undefined,
                activeHolderId: undefined,
                lastLockReleaseAt: releaseAt,
                updatedAt: releaseAt,
            });
            activeChatKey = '';
            if (globalQueue.length > 0) {
                void this.processQueue();
            }
        }
    }

    private async readState(): Promise<DreamSchedulerStateRecord> {
        return (await this.repository.getDreamSchedulerState()) ?? this.createDefaultState();
    }

    private async saveState(record: DreamSchedulerStateRecord): Promise<void> {
        await this.repository.saveDreamSchedulerState(record);
    }

    private createDefaultState(chatKey = this.chatKey): DreamSchedulerStateRecord {
        return {
            chatKey,
            dailyRunCount: 0,
            dailyDateKey: buildDateKey(Date.now()),
            queuedJobCount: 0,
            active: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }
}

export function initializeDreamScheduler(chatKey: string): DreamSchedulerService {
    return new DreamSchedulerService(chatKey);
}
