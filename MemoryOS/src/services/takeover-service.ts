import {
    buildProgressSnapshot,
    buildTakeoverPlan,
    buildTakeoverPreviewEstimate,
    collectTakeoverSourceBundle,
    detectTakeoverNeeded,
    runTakeoverConsolidation,
    runTakeoverScheduler,
} from '../memory-takeover';
import {
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryTakeoverPlan,
    saveMemoryTakeoverPreview,
    writeMemoryTakeoverPlan,
} from '../db/db';
import { readMemoryLLMApi } from '../memory-summary';
import { readMemoryOSSettings } from '../settings/store';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { MemoryLLMApi } from '../memory-summary';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
    MemoryTakeoverPlan,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverProgressSnapshot,
} from '../types';

/**
 * 功能：定义旧聊天接管已知实体集合。
 */
export interface TakeoverKnownEntities {
    actors: Array<{ actorKey: string; displayName: string }>;
    organizations: Array<{ entityKey: string; displayName: string }>;
    cities: Array<{ entityKey: string; displayName: string }>;
    nations: Array<{ entityKey: string; displayName: string }>;
    locations: Array<{ entityKey: string; displayName: string }>;
    tasks: Array<{ entityKey: string; displayName: string }>;
    worldStates: Array<{ entityKey: string; displayName: string }>;
}

/**
 * 功能：定义接管调度执行输入。
 */
export interface TakeoverSchedulerExecutionInput {
    currentFloorCount: number;
    takeoverId?: string;
    llm?: MemoryLLMApi | null;
    pluginId?: string;
    existingKnownEntities: TakeoverKnownEntities;
    applyConsolidation: (result: MemoryTakeoverConsolidationResult) => Promise<void>;
}

/**
 * 功能：定义接管整合执行输入。
 */
export interface TakeoverConsolidationExecutionInput {
    llm?: MemoryLLMApi | null;
    pluginId?: string;
    applyConsolidation: (result: MemoryTakeoverConsolidationResult) => Promise<void>;
}

/**
 * 功能：统一承接旧聊天接管链路的纯业务编排。
 */
export class TakeoverService {
    private readonly chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
    }

    /**
     * 功能：检测是否需要触发旧聊天接管。
     * @param currentFloorCount 当前层数。
     * @param existingPlan 现有计划。
     * @returns 检测结果。
     */
    async detectNeeded(currentFloorCount: number, existingPlan: MemoryTakeoverPlan | null): Promise<MemoryTakeoverDetectionResult> {
        const settings = readMemoryOSSettings();
        return detectTakeoverNeeded({
            currentFloorCount,
            threshold: settings.takeoverDetectMinFloors,
            existingPlan,
        });
    }

    /**
     * 功能：预估接管计划。
     * @param config 接管配置。
     * @returns 预估结果。
     */
    async previewEstimate(config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverPreviewEstimate> {
        const settings = readMemoryOSSettings();
        const sourceBundle = collectTakeoverSourceBundle();
        return buildTakeoverPreviewEstimate({
            chatKey: this.chatKey,
            chatId: this.chatKey,
            totalFloors: Math.max(1, sourceBundle.totalFloors),
            defaults: {
                detectMinFloors: settings.takeoverDetectMinFloors,
                recentFloors: settings.takeoverDefaultRecentFloors,
                batchSize: settings.takeoverDefaultBatchSize,
                prioritizeRecent: settings.takeoverDefaultPrioritizeRecent,
                autoContinue: settings.takeoverDefaultAutoContinue,
                autoConsolidate: settings.takeoverDefaultAutoConsolidate,
                pauseOnError: settings.takeoverDefaultPauseOnError,
            },
            config,
            sourceBundle,
        });
    }

    /**
     * 功能：构建接管计划。
     * @param totalFloors 总楼层数。
     * @param detection 检测结果。
     * @param config 接管配置。
     * @returns 接管计划。
     */
    buildPlan(totalFloors: number, _detection: MemoryTakeoverDetectionResult, config?: MemoryTakeoverCreateInput): MemoryTakeoverPlan {
        const settings = readMemoryOSSettings();
        return buildTakeoverPlan({
            chatKey: this.chatKey,
            chatId: this.chatKey,
            takeoverId: `takeover:${this.chatKey}:${crypto.randomUUID()}`,
            totalFloors,
            defaults: {
                detectMinFloors: settings.takeoverDetectMinFloors,
                recentFloors: settings.takeoverDefaultRecentFloors,
                batchSize: settings.takeoverDefaultBatchSize,
                prioritizeRecent: settings.takeoverDefaultPrioritizeRecent,
                autoContinue: settings.takeoverDefaultAutoContinue,
                autoConsolidate: settings.takeoverDefaultAutoConsolidate,
                pauseOnError: settings.takeoverDefaultPauseOnError,
            },
            config,
        });
    }

    /**
     * 功能：运行接管调度器。
     * @param input 调度输入。
     * @returns 接管进度快照。
     */
    async runScheduler(input: Parameters<typeof runTakeoverScheduler>[0]): Promise<MemoryTakeoverProgressSnapshot> {
        return runTakeoverScheduler({
            ...input,
            llm: input.llm ?? readMemoryLLMApi(),
            pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
        });
    }

    /**
     * 功能：运行接管整合。
     * @param input 整合输入。
     * @returns 整合结果。
     */
    async runConsolidation(input: Parameters<typeof runTakeoverConsolidation>[0]): Promise<MemoryTakeoverConsolidationResult> {
        return runTakeoverConsolidation({
            ...input,
            llm: input.llm ?? readMemoryLLMApi(),
            pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
        });
    }

    /**
     * 功能：构建接管进度快照。
     * @param plan 可选计划。
     * @returns 进度快照。
     */
    async buildProgress(plan?: MemoryTakeoverPlan | null): Promise<MemoryTakeoverProgressSnapshot> {
        return buildProgressSnapshot(this.chatKey, plan ?? null);
    }

    /**
     * 功能：读取当前聊天的接管计划。
     * @returns 当前接管计划。
     */
    async readPlan(): Promise<MemoryTakeoverPlan | null> {
        return readMemoryTakeoverPlan(this.chatKey);
    }

    /**
     * 功能：创建并持久化接管计划。
     * @param currentFloorCount 当前楼层数。
     * @param config 接管配置。
     * @returns 最新进度快照。
     */
    async createPlanSnapshot(currentFloorCount: number, config?: MemoryTakeoverCreateInput): Promise<MemoryTakeoverProgressSnapshot> {
        const detection = await this.detectNeeded(currentFloorCount, await this.readPlan());
        const totalFloors = Math.max(detection.currentFloorCount, currentFloorCount);
        const plan = this.buildPlan(totalFloors, detection, config);
        await writeMemoryTakeoverPlan(this.chatKey, plan);
        return this.buildProgress(plan);
    }

    /**
     * 功能：启动接管任务，必要时自动创建计划。
     * @param input 调度输入。
     * @returns 最新进度快照。
     */
    async startTakeover(input: TakeoverSchedulerExecutionInput): Promise<MemoryTakeoverProgressSnapshot> {
        const existingPlan = await this.readPlan();
        if (existingPlan && (!input.takeoverId || existingPlan.takeoverId === input.takeoverId)) {
            return this.runPlan(existingPlan, input);
        }
        const snapshot = await this.createPlanSnapshot(input.currentFloorCount);
        if (!snapshot.plan) {
            return snapshot;
        }
        return this.runPlan(snapshot.plan, input);
    }

    /**
     * 功能：暂停当前接管计划。
     * @returns 最新进度快照。
     */
    async pauseTakeover(): Promise<MemoryTakeoverProgressSnapshot> {
        const plan = await this.readPlan();
        if (!plan) {
            return this.buildProgress(null);
        }
        const nextPlan: MemoryTakeoverPlan = {
            ...plan,
            status: 'paused',
            pausedAt: Date.now(),
            updatedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(this.chatKey, nextPlan);
        return this.buildProgress(nextPlan);
    }

    /**
     * 功能：恢复已暂停的接管计划并继续调度。
     * @param input 调度输入。
     * @returns 最新进度快照；没有计划时返回空。
     */
    async resumeTakeover(input: Omit<TakeoverSchedulerExecutionInput, 'takeoverId' | 'currentFloorCount'>): Promise<MemoryTakeoverProgressSnapshot | null> {
        const plan = await this.readPlan();
        if (!plan) {
            return null;
        }
        const nextPlan: MemoryTakeoverPlan = {
            ...plan,
            status: 'idle',
            pausedAt: undefined,
            updatedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(this.chatKey, nextPlan);
        return this.runPlan(nextPlan, input);
    }

    /**
     * 功能：执行已生成批次结果的最终整合，并更新计划状态。
     * @param input 整合输入。
     * @returns 最新进度快照；没有计划时返回空。
     */
    async runStoredConsolidation(input: TakeoverConsolidationExecutionInput): Promise<MemoryTakeoverProgressSnapshot | null> {
        const plan = await this.readPlan();
        if (!plan) {
            return null;
        }
        const preview = await loadMemoryTakeoverPreview(this.chatKey);
        const batchResults = await loadMemoryTakeoverBatchResults(this.chatKey);
        const consolidation = await this.runConsolidation({
            llm: input.llm ?? readMemoryLLMApi(),
            pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
            takeoverId: plan.takeoverId,
            activeSnapshot: preview.activeSnapshot,
            batchResults,
        });
        await saveMemoryTakeoverPreview(this.chatKey, 'consolidation', consolidation);
        await input.applyConsolidation(consolidation);
        const nextPlan: MemoryTakeoverPlan = {
            ...plan,
            status: 'completed',
            completedAt: Date.now(),
            updatedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(this.chatKey, nextPlan);
        return this.buildProgress(nextPlan);
    }

    /**
     * 功能：终止当前接管计划。
     * @returns 最新进度快照。
     */
    async abortTakeover(): Promise<MemoryTakeoverProgressSnapshot> {
        const plan = await this.readPlan();
        if (!plan) {
            return this.buildProgress();
        }
        const nextPlan: MemoryTakeoverPlan = {
            ...plan,
            status: 'failed',
            lastError: 'manual_abort',
            updatedAt: Date.now(),
        };
        await writeMemoryTakeoverPlan(this.chatKey, nextPlan);
        return this.buildProgress(nextPlan);
    }

    /**
     * 功能：基于指定计划执行调度。
     * @param plan 接管计划。
     * @param input 调度输入。
     * @returns 最新进度快照。
     */
    async runPlan(
        plan: MemoryTakeoverPlan,
        input: Omit<TakeoverSchedulerExecutionInput, 'currentFloorCount' | 'takeoverId'>,
    ): Promise<MemoryTakeoverProgressSnapshot> {
        return this.runScheduler({
            chatKey: this.chatKey,
            plan,
            llm: input.llm ?? readMemoryLLMApi(),
            pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
            existingKnownEntities: input.existingKnownEntities,
            applyConsolidation: input.applyConsolidation,
        });
    }
}
