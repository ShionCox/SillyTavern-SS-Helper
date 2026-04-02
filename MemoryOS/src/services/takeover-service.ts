import {
    buildTakeoverBatches,
    buildTakeoverKnownContext,
    buildProgressSnapshot,
    buildTakeoverPlan,
    buildTakeoverPreviewEstimate,
    buildTakeoverStructuredTaskRequest,
    collectTakeoverSourceBundle,
    detectTakeoverNeeded,
    runTakeoverConsolidation,
    runTakeoverScheduler,
    assembleTakeoverBatchPromptAssembly,
} from '../memory-takeover';
import type { MemoryTakeoverKnownEntities } from '../memory-takeover/takeover-batch-runner';
import {
    clearMemoryTakeoverPreview,
    readMemoryOSChatState,
    loadMemoryTakeoverBatchResults,
    loadMemoryTakeoverPreview,
    readMemoryTakeoverPlan,
    saveMemoryTakeoverPreview,
    writeMemoryOSChatState,
    writeMemoryTakeoverPlan,
} from '../db/db';
import { readMemoryLLMApi } from '../memory-summary';
import { readMemoryOSSettings } from '../settings/store';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { MemoryLLMApi } from '../memory-summary';
import {
    applyContentLabSettings,
    DEFAULT_CONTENT_LAB_SETTINGS,
    normalizeContentLabSettings,
    type ContentLabSettings,
} from '../config/content-tag-registry';
import {
    buildFloorRecords,
    classifyFloorRecordsWithAI,
    sliceTakeoverMessages,
    type ContentPreviewSourceMode,
    type RawFloorRecord,
} from '../memory-takeover';
import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverCreateInput,
    MemoryTakeoverDetectionResult,
    MemoryTakeoverPayloadPreview,
    MemoryTakeoverPayloadPreviewBatch,
    MemoryTakeoverPlan,
    MemoryTakeoverPreviewEstimate,
    MemoryTakeoverProgressSnapshot,
} from '../types';

export type TakeoverKnownEntities = MemoryTakeoverKnownEntities;

/**
 * 功能：定义接管调度执行输入。
 */
export interface TakeoverSchedulerExecutionInput {
    currentFloorCount: number;
    takeoverId?: string;
    llm?: MemoryLLMApi | null;
    pluginId?: string;
    skipInitialWait?: boolean;
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
 * 功能：定义指定失败批次重试输入。
 */
export interface TakeoverRetryExecutionInput extends Omit<TakeoverSchedulerExecutionInput, 'takeoverId' | 'currentFloorCount'> {
    batchId?: string;
}

/**
 * 功能：定义内容实验室楼层预览输入。
 */
export interface ContentLabFloorPreviewInput {
    floor: number;
    previewSourceMode?: ContentPreviewSourceMode;
    llm?: MemoryLLMApi | null;
    pluginId?: string;
}

/**
 * 功能：定义内容实验室范围预览输入。
 */
export interface ContentLabRangePreviewInput {
    startFloor: number;
    endFloor: number;
    previewSourceMode?: ContentPreviewSourceMode;
    llm?: MemoryLLMApi | null;
    pluginId?: string;
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
     * 功能：读取内容实验室配置并同步到运行时。
     * @returns 当前配置。
     */
    async readContentLabSettings(): Promise<ContentLabSettings> {
        const stateRow = await readMemoryOSChatState(this.chatKey);
        const state = stateRow?.state && typeof stateRow.state === 'object'
            ? stateRow.state as Record<string, unknown>
            : {};
        const settings = normalizeContentLabSettings((state.contentLab ?? DEFAULT_CONTENT_LAB_SETTINGS) as Partial<ContentLabSettings>);
        return applyContentLabSettings(settings);
    }

    /**
     * 功能：保存内容实验室配置并同步到运行时。
     * @param patch 配置补丁。
     * @returns 保存后的配置。
     */
    async saveContentLabSettings(patch: Partial<ContentLabSettings>): Promise<ContentLabSettings> {
        const current = await this.readContentLabSettings();
        const merged = normalizeContentLabSettings({
            ...current,
            ...patch,
            tagRegistry: patch.tagRegistry ?? current.tagRegistry,
            unknownTagPolicy: patch.unknownTagPolicy ?? current.unknownTagPolicy,
            classifierToggles: patch.classifierToggles ?? current.classifierToggles,
            enableAIClassifier: patch.enableAIClassifier ?? current.enableAIClassifier,
        });
        const stateRow = await readMemoryOSChatState(this.chatKey);
        const state = stateRow?.state && typeof stateRow.state === 'object'
            ? stateRow.state as Record<string, unknown>
            : {};
        await writeMemoryOSChatState(this.chatKey, {
            ...state,
            contentLab: merged,
        });
        return applyContentLabSettings(merged);
    }

    /**
     * 功能：预览单层内容块拆分结果。
     * @param input 预览输入。
     * @returns 指定楼层的拆分结果。
     */
    async previewFloorContentBlocks(input: ContentLabFloorPreviewInput): Promise<RawFloorRecord> {
        const floor = Math.max(1, Math.trunc(Number(input.floor) || 0));
        if (!floor) {
            throw new Error('invalid_floor');
        }
        const records = await this.previewFloorRangeContentBlocks({
            startFloor: floor,
            endFloor: floor,
            previewSourceMode: input.previewSourceMode,
            llm: input.llm,
            pluginId: input.pluginId,
        });
        const record = records[0];
        if (!record) {
            throw new Error(`floor_not_found:${floor}`);
        }
        return record;
    }

    /**
     * 功能：预览指定范围的内容块拆分结果。
     * @param input 范围输入。
     * @returns 楼层记录列表。
     */
    async previewFloorRangeContentBlocks(input: ContentLabRangePreviewInput): Promise<RawFloorRecord[]> {
        const settings = await this.readContentLabSettings();
        const sourceBundle = collectTakeoverSourceBundle();
        const previewSourceMode: ContentPreviewSourceMode = input.previewSourceMode === 'raw_visible_text'
            ? 'raw_visible_text'
            : 'content';
        const range = {
            startFloor: Math.max(1, Math.trunc(Number(input.startFloor) || 1)),
            endFloor: Math.max(Math.trunc(Number(input.startFloor) || 1), Math.trunc(Number(input.endFloor) || Number(input.startFloor) || 1)),
        };
        const messages = sliceTakeoverMessages(sourceBundle, range);
        let records = buildFloorRecords(messages, previewSourceMode);
        if (settings.enableAIClassifier) {
            records = await classifyFloorRecordsWithAI({
                llm: input.llm ?? readMemoryLLMApi(),
                pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
                floorRecords: records,
            });
        }
        return records;
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
        await this.readContentLabSettings();
        const settings = readMemoryOSSettings();
        const sourceBundle = collectTakeoverSourceBundle();
        return buildTakeoverPreviewEstimate({
            chatKey: this.chatKey,
            chatId: this.chatKey,
            totalFloors: Math.max(1, sourceBundle.totalFloors),
            llm: readMemoryLLMApi(),
            pluginId: MEMORY_OS_PLUGIN_ID,
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
     * 功能：预览按当前配置实际会发送给 AI 的旧聊天内容。
     * @param config 接管配置。
     * @returns 实际送模内容预览。
     */
    async previewActualTakeoverPayload(
        config?: MemoryTakeoverCreateInput,
        existingKnownEntities: TakeoverKnownEntities = createEmptyTakeoverKnownEntities(),
    ): Promise<MemoryTakeoverPayloadPreview> {
        await this.readContentLabSettings();
        const settings = readMemoryOSSettings();
        const sourceBundle = collectTakeoverSourceBundle();
        const storedBatchResults = await loadMemoryTakeoverBatchResults(this.chatKey);
        const plan = buildTakeoverPlan({
            chatKey: this.chatKey,
            chatId: this.chatKey,
            takeoverId: `takeover:payload_preview:${this.chatKey}`,
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
        });
        const batches = buildTakeoverBatches({
            takeoverId: plan.takeoverId,
            range: plan.range,
            activeWindow: plan.activeWindow,
            batchSize: plan.batchSize,
        });
        const historyBatches = batches.filter((batch) => batch.category === 'history');
        const previewBatches: MemoryTakeoverPayloadPreviewBatch[] = [];

        for (const batch of batches) {
            const sourceMessages = sliceTakeoverMessages(sourceBundle, batch.range);
            const assembly = await assembleTakeoverBatchPromptAssembly({
                llm: readMemoryLLMApi(),
                pluginId: MEMORY_OS_PLUGIN_ID,
                messages: sourceMessages,
            });
            const requestPayload = batch.category === 'active'
                ? {
                    range: batch.range,
                    messages: assembly.extractionMessages,
                    hintContext: assembly.channels.hintText || undefined,
                }
                : {
                    batchId: batch.batchId,
                    batchCategory: batch.category,
                    range: batch.range,
                    knownContext: buildTakeoverKnownContext(
                        resolvePreviewKnownContextBatchResults(storedBatchResults, batch),
                        existingKnownEntities,
                    ),
                    messages: assembly.extractionMessages,
                    hintContext: assembly.channels.hintText || undefined,
                };
            const request = await buildTakeoverStructuredTaskRequest({
                systemSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_SYSTEM' : 'TAKEOVER_BATCH_SYSTEM',
                schemaSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_SCHEMA' : 'TAKEOVER_BATCH_SCHEMA',
                sampleSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_OUTPUT_SAMPLE' : 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
                payload: requestPayload,
            });
            const historyIndex = historyBatches.findIndex((item) => item.batchId === batch.batchId);
            previewBatches.push({
                batchId: batch.batchId,
                batchIndex: batch.batchIndex,
                category: batch.category,
                label: batch.category === 'active'
                    ? '最近快照'
                    : `第 ${Math.max(1, historyIndex + 1)} / ${Math.max(1, historyBatches.length || 1)} 批`,
                range: batch.range,
                sourceFloors: sourceMessages.map((message) => message.floor),
                sentFloors: assembly.extractionMessages.map((message) => message.floor),
                hintText: assembly.channels.hintText,
                excludedSummary: assembly.channels.excludedSummary,
                floorManifest: assembly.floorRecords,
                requestMessages: request.messages,
            });
        }

        return {
            mode: plan.mode,
            totalFloors: plan.totalFloors,
            range: plan.range,
            activeWindow: plan.activeWindow,
            batchSize: plan.batchSize,
            useActiveSnapshot: plan.useActiveSnapshot,
            activeSnapshotFloors: plan.activeSnapshotFloors,
            totalBatches: batches.length,
            batches: previewBatches,
        };
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
        await this.readContentLabSettings();
        await clearMemoryTakeoverPreview(this.chatKey);
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
        await this.readContentLabSettings();
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
     * 功能：从指定失败批次继续执行。
     * @param input 重试输入。
     * @returns 最新进度快照；没有计划时返回空。
     */
    async retryFailedBatch(input: TakeoverRetryExecutionInput): Promise<MemoryTakeoverProgressSnapshot | null> {
        await this.readContentLabSettings();
        const plan = await this.readPlan();
        if (!plan) {
            return null;
        }
        const requestedBatchId = String(input.batchId ?? '').trim() || String(plan.failedBatchIds[0] ?? '').trim();
        if (!requestedBatchId) {
            return this.resumeTakeover(input);
        }
        const nextPlan: MemoryTakeoverPlan = {
            ...plan,
            status: 'idle',
            pausedAt: undefined,
            requestedRetryBatchId: requestedBatchId,
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
        const preview = await loadMemoryTakeoverPreview(this.chatKey, 'runtime');
        const batchResults = await loadMemoryTakeoverBatchResults(this.chatKey);
        const consolidation = await this.runConsolidation({
            llm: input.llm ?? readMemoryLLMApi(),
            pluginId: input.pluginId ?? MEMORY_OS_PLUGIN_ID,
            takeoverId: plan.takeoverId,
            activeSnapshot: preview.activeSnapshot,
            batchResults,
        });
        await saveMemoryTakeoverPreview(this.chatKey, 'consolidation', consolidation, 'runtime');
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
            skipInitialWait: input.skipInitialWait,
            existingKnownEntities: input.existingKnownEntities,
            applyConsolidation: input.applyConsolidation,
        });
    }
}

/**
 * 功能：创建空的旧聊天接管已知实体集合。
 * @returns 空实体集合。
 */
function createEmptyTakeoverKnownEntities(): TakeoverKnownEntities {
    return {
        actors: [],
        organizations: [],
        cities: [],
        nations: [],
        locations: [],
        tasks: [],
        worldStates: [],
    };
}

/**
 * 功能：为预览中的历史批次筛选当前批次之前已累计的批次结果。
 * @param batchResults 已存储的批次结果。
 * @param currentBatch 当前预览批次。
 * @returns 可用于 knownContext 的前置批次结果。
 */
function resolvePreviewKnownContextBatchResults(
    batchResults: MemoryTakeoverBatchResult[],
    currentBatch: { range: { startFloor: number } },
): MemoryTakeoverBatchResult[] {
    const currentStartFloor = Math.max(1, Math.trunc(Number(currentBatch.range.startFloor) || 1));
    return [...(batchResults ?? [])]
        .filter((item: MemoryTakeoverBatchResult): boolean => {
            const endFloor = Math.max(0, Math.trunc(Number(item.sourceRange?.endFloor) || 0));
            return endFloor > 0 && endFloor < currentStartFloor;
        })
        .sort((left: MemoryTakeoverBatchResult, right: MemoryTakeoverBatchResult): number => {
            const leftEnd = Math.max(0, Math.trunc(Number(left.sourceRange?.endFloor) || 0));
            const rightEnd = Math.max(0, Math.trunc(Number(right.sourceRange?.endFloor) || 0));
            return leftEnd - rightEnd;
        });
}
