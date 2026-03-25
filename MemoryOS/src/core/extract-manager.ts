import { logger } from '../index';
import type { MemorySDK } from '../../../SDK/stx';
import { MEMORY_TASKS, checkAiModeGuard } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import type { EventsManager } from './events-manager';
import type { TemplateManager } from '../template/template-manager';
import type { TurnTracker } from './turn-tracker';
import type { ChatStateManager } from './chat-state-manager';
import { MetaManager } from './meta-manager';
import { IngestPlanner } from './ingest-planner';
import { IngestExecutor } from './ingest-executor';
import { IngestCommitter } from './ingest-committer';

/**
 * 功能：统一记忆抽取入口编排器，只负责串联 planner / executor / committer 与并发去重。
 */
export class ExtractManager {
    private readonly chatKey: string;
    private readonly eventsManager: EventsManager;
    private readonly metaManager: MetaManager;
    private readonly chatStateManager: ChatStateManager | null;
    private readonly duplicateWindowMs: number = 8000;
    private readonly specialTriggerTypes: Set<string> = new Set([
        'memory.template.changed',
        'world.template.changed',
        'combat.end',
        'combat.round.end',
    ]);
    private extractionFlight: Promise<void> | null = null;
    private extractionFlightWindowHash: string = '';
    private lastSettledWindowHash: string = '';
    private lastSettledAt: number = 0;
    private readonly planner: IngestPlanner;
    private readonly executor: IngestExecutor;
    private readonly committer: IngestCommitter;

    constructor(
        chatKey: string,
        events: EventsManager,
        templateMgr: TemplateManager,
        turnTracker?: TurnTracker,
        chatStateManager?: ChatStateManager,
    ) {
        this.chatKey = chatKey;
        this.eventsManager = events;
        this.metaManager = new MetaManager(chatKey);
        const normalizedTurnTracker = turnTracker ?? null;
        this.chatStateManager = chatStateManager ?? null;
        this.planner = new IngestPlanner({
            chatKey: this.chatKey,
            specialTriggerTypes: this.specialTriggerTypes,
            turnTracker: normalizedTurnTracker,
            chatStateManager: this.chatStateManager,
            metaManager: this.metaManager,
        });
        this.executor = new IngestExecutor(templateMgr);
        this.committer = new IngestCommitter({
            chatKey: this.chatKey,
            chatStateManager: this.chatStateManager,
            metaManager: this.metaManager,
            turnTracker: normalizedTurnTracker,
        });
    }

    /**
     * 功能：按自适应策略触发一轮统一记忆摄取。
     * @returns 无返回值。
     */
    public async kickOffExtraction(): Promise<void> {
        return this.runUnifiedIngest();
    }

    /**
     * 功能：执行统一 ingest 主流程（facade 编排）。
     * @returns 无返回值。
     */
    private async runUnifiedIngest(): Promise<void> {
        logger.info(`开始评估统一记忆摄取触发条件，chatKey=${this.chatKey}`);
        const ingestGuard = checkAiModeGuard(MEMORY_TASKS.INGEST as MemoryAiTaskId);
        if (ingestGuard) {
            logger.info(`统一记忆摄取跳过：AI 守卫未通过，chatKey=${this.chatKey}`);
            return;
        }

        const memory = this.getWindowMemory();
        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            logger.info(`统一记忆摄取跳过：聊天已归档，chatKey=${this.chatKey}`);
            return;
        }

        const recentEvents = await this.eventsManager.query({ limit: 120 });
        const logicalView = this.chatStateManager
            ? await this.chatStateManager.getLogicalChatView()
            : null;
        if (!logicalView || logicalView.visibleMessages.length === 0) {
            logger.info(`统一记忆摄取跳过：当前没有可消费楼层，chatKey=${this.chatKey}`);
            return;
        }

        const meta = await this.metaManager.getMeta();
        const buildResult = await this.planner.buildPlan({
            recentEvents,
            logicalView,
            meta: meta ?? null,
        });
        if (!buildResult.plan) {
            logger.info(`统一记忆摄取跳过：未达到增量触发阈值，chatKey=${this.chatKey}, assistantTurns=${buildResult.currentAssistantTurnCount}`);
            return;
        }
        const plan = buildResult.plan;

        if (this.extractionFlight && this.extractionFlightWindowHash === plan.selection.windowHash) {
            logger.info(`统一记忆摄取跳过：相同增量窗口已在处理中，chatKey=${this.chatKey}, windowHash=${plan.selection.windowHash}`);
            await this.extractionFlight;
            return;
        }
        if (
            this.lastSettledWindowHash === plan.selection.windowHash
            && Date.now() - this.lastSettledAt <= this.duplicateWindowMs
        ) {
            logger.info(`统一记忆摄取跳过：相同增量窗口刚处理完成，chatKey=${this.chatKey}, windowHash=${plan.selection.windowHash}`);
            return;
        }

        logger.info(`触发统一记忆摄取，chatKey=${this.chatKey}, pendingAssistantTurns=${plan.selection.pendingAssistantTurns}, repair=${plan.selection.repairTriggered}`);
        let currentExtractionPromise: Promise<void> | null = null;
        let shouldSettleWindow = false;
        const extractionPromise = (async (): Promise<void> => {
            try {
                const commitResult = plan.processingDecision.level === 'none'
                    ? await this.committer.commitSkipped({ plan, logicalView })
                    : await this.committer.commitExecution({
                        plan,
                        execution: await this.executor.execute({
                            plan,
                            memory,
                        }),
                        memory,
                        logicalView,
                        meta: meta ?? null,
                    });
                shouldSettleWindow = commitResult.shouldSettleWindow;
            } catch (error) {
                logger.error('统一记忆摄取流程执行失败', error);
            } finally {
                await this.committer.finalize({
                    plan,
                    recentEvents,
                    logicalView,
                });
                if (shouldSettleWindow) {
                    this.lastSettledWindowHash = plan.selection.windowHash;
                    this.lastSettledAt = Date.now();
                }
                if (currentExtractionPromise && this.extractionFlight === currentExtractionPromise) {
                    this.extractionFlight = null;
                    this.extractionFlightWindowHash = '';
                }
            }
        })();

        currentExtractionPromise = extractionPromise;
        this.extractionFlight = extractionPromise;
        this.extractionFlightWindowHash = plan.selection.windowHash;
        await extractionPromise;
    }

    /**
     * 功能：读取窗口中的 MemorySDK 实例。
     * @returns MemorySDK；不存在时返回 `null`。
     */
    private getWindowMemory(): MemorySDK | null {
        const globalRef = window as typeof window & {
            STX?: { memory?: MemorySDK };
        };
        return globalRef.STX?.memory ?? null;
    }
}
