import { readMemoryOSSettings } from '../settings/store';
import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamScheduleDecision,
    DreamSchedulerStateRecord,
    DreamTriggerReason,
} from './dream-types';

type DreamSchedulerJob = {
    chatKey: string;
    triggerSource: Exclude<DreamTriggerReason, 'manual'>;
    blockedBy?: string[];
    execute: () => Promise<{ ok: boolean; status?: string; reasonCode?: string }>;
};

const globalQueue: DreamSchedulerJob[] = [];
const queuedChatKeys = new Set<string>();
let activeChatKey = '';

function buildDateKey(ts: number): string {
    const date = new Date(ts);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 功能：第三阶段 dream scheduler。
 */
export class DreamSchedulerService {
    private readonly chatKey: string;
    private readonly repository: DreamSessionRepository;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = new DreamSessionRepository(this.chatKey);
    }

    async checkDreamTriggerEligibility(input: {
        triggerSource: Exclude<DreamTriggerReason, 'manual'>;
        blockedBy?: string[];
    }): Promise<DreamScheduleDecision> {
        const settings = readMemoryOSSettings();
        const blockedBy = [...(input.blockedBy ?? [])];
        if (!settings.dreamEnabled || !settings.dreamSchedulerEnabled) {
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
        const state = await repo.getDreamSchedulerState() ?? this.createDefaultState();
        await repo.saveDreamSchedulerState({
            ...state,
            active: true,
            queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
            lastTriggeredAt: Date.now(),
            lastTriggerSource: job.triggerSource,
            updatedAt: Date.now(),
        });
        try {
            const result = await job.execute();
            const now = Date.now();
            const dateKey = buildDateKey(now);
            const nextState = await repo.getDreamSchedulerState() ?? this.createDefaultState();
            await repo.saveDreamSchedulerState({
                ...nextState,
                active: false,
                queuedJobCount: queuedChatKeys.has(job.chatKey) ? 1 : 0,
                lastCompletedAt: now,
                dailyDateKey: nextState.dailyDateKey === dateKey ? dateKey : dateKey,
                dailyRunCount: nextState.dailyDateKey === dateKey ? nextState.dailyRunCount + (result.ok ? 1 : 0) : (result.ok ? 1 : 0),
                updatedAt: now,
            });
        } finally {
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

    private createDefaultState(): DreamSchedulerStateRecord {
        return {
            chatKey: this.chatKey,
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
