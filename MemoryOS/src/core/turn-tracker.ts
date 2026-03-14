import { Logger } from '../../../SDK/logger';
import { ChatStateManager } from './chat-state-manager';
import { TRACKER_LRU_LIMIT } from '../types';
import type { AssistantTurnTracker } from '../types';

const logger = new Logger('TurnTracker');

export interface TurnCountInput {
    eventType: string;
    messageId?: string;
    textContent: string;
    isSystemMessage: boolean;
    ingestHint: 'normal' | 'bootstrap' | 'backfill';
}

/**
 * 助手楼层计数器
 * 负责"角色完整回复楼"的计数与去重，不跨聊天共享
 */
export class TurnTracker {
    private chatStateManager: ChatStateManager;
    private cachedTracker: AssistantTurnTracker | null = null;

    constructor(chatStateManager: ChatStateManager) {
        this.chatStateManager = chatStateManager;
    }

    /**
     * 加载 tracker 缓存
     */
    private async ensureLoaded(): Promise<AssistantTurnTracker> {
        if (!this.cachedTracker) {
            this.cachedTracker = await this.chatStateManager.getAssistantTurnTracker();
        }
        return this.cachedTracker;
    }

    /**
     * 尝试将一个消息事件计为 1 楼
     * 只有同时满足所有条件才计 1 楼
     * @returns true 表示成功计入 1 楼，false 表示跳过
     */
    async tryCountTurn(input: TurnCountInput): Promise<boolean> {
        // 条件1: 事件类型必须是角色回复
        if (input.eventType !== 'chat.message.received') {
            return false;
        }

        // 条件2: 非系统消息
        if (input.isSystemMessage) {
            return false;
        }

        // 条件3: 文本有效
        const trimmed = String(input.textContent ?? '').replace(/\s+/g, '').trim();
        if (!trimmed) {
            return false;
        }

        // 条件4: ingestHint = normal
        if (input.ingestHint !== 'normal') {
            return false;
        }

        // 条件5: 去重检查
        const tracker = await this.ensureLoaded();
        const msgId = input.messageId?.trim() ?? '';
        const textSig = this.computeTextSignature(input.textContent);

        if (msgId && tracker.countedAssistantMessageIds.includes(msgId)) {
            logger.info(`消息 ID ${msgId} 已计入楼层，跳过重复计数`);
            return false;
        }

        if (!msgId && textSig && tracker.recentAssistantTurnSignatures.includes(textSig)) {
            logger.info('文本签名已计入楼层，跳过重复计数');
            return false;
        }

        // 计入 1 楼
        tracker.assistantTurnCount += 1;

        if (msgId) {
            tracker.countedAssistantMessageIds.push(msgId);
        }
        if (textSig) {
            tracker.recentAssistantTurnSignatures.push(textSig);
        }

        // LRU 淘汰
        if (tracker.countedAssistantMessageIds.length > TRACKER_LRU_LIMIT) {
            tracker.countedAssistantMessageIds = tracker.countedAssistantMessageIds.slice(-TRACKER_LRU_LIMIT);
        }
        if (tracker.recentAssistantTurnSignatures.length > TRACKER_LRU_LIMIT) {
            tracker.recentAssistantTurnSignatures = tracker.recentAssistantTurnSignatures.slice(-TRACKER_LRU_LIMIT);
        }

        // 标记 dirty，由 ChatStateManager 节流写回
        await this.chatStateManager.updateAssistantTurnTracker(tracker);

        logger.info(`楼层计数 +1，当前助手楼层数: ${tracker.assistantTurnCount}`);
        return true;
    }

    /**
     * 获取当前助手楼层数
     */
    async getAssistantTurnCount(): Promise<number> {
        const tracker = await this.ensureLoaded();
        return tracker.assistantTurnCount;
    }

    /**
     * 检查是否应该触发提取
     * @param lastExtractAssistantTurnCount 上次提取时的楼层数
     * @param lastExtractWindowHash 上次提取时的窗口哈希
     * @param currentWindowHash 当前窗口哈希
     * @param interval 触发间隔（楼数）
     * @param summaryEnabled AI 总结是否启用
     */
    async shouldTriggerExtraction(
        lastExtractAssistantTurnCount: number,
        lastExtractWindowHash: string | undefined,
        currentWindowHash: string,
        interval: number,
        summaryEnabled: boolean,
    ): Promise<boolean> {
        if (!summaryEnabled) return false;

        const currentCount = await this.getAssistantTurnCount();
        const delta = currentCount - lastExtractAssistantTurnCount;
        if (delta < interval) return false;

        if (lastExtractWindowHash === currentWindowHash) return false;

        return true;
    }

    /**
     * 使缓存失效（切换聊天时调用）
     */
    invalidateCache(): void {
        this.cachedTracker = null;
    }

    /**
     * 计算文本签名用于去重
     */
    private computeTextSignature(text: string): string {
        return String(text || '').replace(/\s+/g, ' ').trim();
    }
}
