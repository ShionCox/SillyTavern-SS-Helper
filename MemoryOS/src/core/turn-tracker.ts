import { logger } from '../runtime/runtime-services';
import { ChatStateManager } from './chat-state-manager';
import type {
    AssistantTurnTracker,
    LogicalChatView,
    TurnLifecycle,
    TurnRecord,
} from '../types';


interface ExtractionTriggerInput {
    lastExtractAssistantTurnCount: number;
    lastExtractWindowHash: string | undefined;
    currentWindowHash: string;
    interval: number;
    summaryEnabled: boolean;
    lastCommittedTurnCursor?: string;
    lastVisibleTurnSnapshotHash?: string;
}

/**
 * 功能：维护聊天楼层追踪状态，并支持逻辑视图语义楼层。
 * 参数：
 *   chatStateManager (ChatStateManager)：聊天状态管理器。
 * 返回：
 *   TurnTracker：楼层追踪器实例。
 */
export class TurnTracker {
    private readonly chatStateManager: ChatStateManager;
    private cachedTracker: AssistantTurnTracker | null = null;

    constructor(chatStateManager: ChatStateManager) {
        this.chatStateManager = chatStateManager;
    }

    /**
     * 功能：确保从聊天状态加载 tracker 缓存。
     * 参数：
     *   无。
     * 返回：
     *   Promise<AssistantTurnTracker>：当前 tracker。
     */
    private async ensureLoaded(): Promise<AssistantTurnTracker> {
        if (!this.cachedTracker) {
            this.cachedTracker = await this.chatStateManager.getAssistantTurnTracker();
        }
        return this.cachedTracker;
    }

    /**
     * 功能：根据逻辑消息视图重建语义楼层与生命周期索引。
     * 参数：
     *   view (LogicalChatView)：最新逻辑视图。
     * 返回：
     *   Promise<void>：异步完成。
     */
    async rebuildFromLogicalView(view: LogicalChatView): Promise<void> {
        const tracker = await this.ensureLoaded();
        const previousRecords = Array.isArray(tracker.turnRecords) ? tracker.turnRecords : [];
        const previousByKey = new Map<string, TurnRecord>();
        for (const record of previousRecords) {
            previousByKey.set(`${record.messageId}|${record.lifecycle}|${record.textSignature}`, record);
        }

        const branchRootIds = new Set(
            (view.branchRoots ?? []).map((node) => String(node.messageId ?? '').trim()).filter(Boolean),
        );
        const nextRecords: TurnRecord[] = [];
        const pushRecord = (
            messageId: string,
            kind: 'user' | 'assistant' | 'system',
            lifecycle: TurnLifecycle,
            textSignature: string,
            sourceEventId: string,
            createdAt: number,
            updatedAt: number,
        ): void => {
            const key = `${messageId}|${lifecycle}|${textSignature}`;
            const prev = previousByKey.get(key);
            const turnId = prev?.turnId ?? crypto.randomUUID();
            nextRecords.push({
                turnId,
                messageId,
                kind,
                lifecycle,
                chatKey: view.chatKey,
                sourceEventId,
                createdAt: prev?.createdAt ?? createdAt,
                updatedAt: updatedAt || Date.now(),
                textSignature,
            });
        };

        for (const node of view.visibleMessages) {
            const lifecycle: TurnLifecycle = branchRootIds.has(node.messageId) ? 'branch_root' : 'active';
            pushRecord(
                node.messageId,
                node.role,
                lifecycle,
                node.textSignature,
                node.messageId || '',
                node.createdAt || Date.now(),
                node.updatedAt || Date.now(),
            );
        }
        for (const node of view.supersededCandidates ?? []) {
            pushRecord(
                node.messageId,
                node.role,
                'swiped_out',
                node.textSignature,
                node.messageId || '',
                node.createdAt || Date.now(),
                node.updatedAt || Date.now(),
            );
        }
        for (const node of view.editedRevisions ?? []) {
            pushRecord(
                node.messageId,
                node.role,
                'edited',
                node.textSignature,
                node.messageId || '',
                node.createdAt || Date.now(),
                node.updatedAt || Date.now(),
            );
        }
        for (const node of view.deletedTurns ?? []) {
            pushRecord(
                node.messageId,
                node.role,
                'deleted',
                node.textSignature,
                node.messageId || '',
                node.createdAt || Date.now(),
                node.updatedAt || Date.now(),
            );
        }

        const activeAssistantTurnCount = view.visibleAssistantTurns.length;
        const lifecycleFingerprint = this.hashString(
            nextRecords
                .map((item: TurnRecord): string => `${item.messageId}|${item.lifecycle}|${item.textSignature}`)
                .join('\n'),
        );
        const lastCommittedTurnCursor = `${Date.now()}:${lifecycleFingerprint}`;
        tracker.turnRecords = nextRecords;
        tracker.activeAssistantTurnCount = activeAssistantTurnCount;
        tracker.lastViewHash = view.viewHash;
        tracker.lastVisibleTurnSnapshotHash = view.snapshotHash;
        tracker.lastCommittedTurnCursor = lastCommittedTurnCursor;
        await this.chatStateManager.setTurnLedger(nextRecords);
        await this.chatStateManager.updateAssistantTurnTracker(tracker);
        logger.info(`语义楼层已重建：activeAssistantTurnCount=${activeAssistantTurnCount}`);
    }

    /**
     * 功能：读取当前可见助手楼层计数。
     * 参数：
     *   无。
     * 返回：
     *   Promise<number>：当前可见助手楼层计数。
     */
    async getActiveAssistantTurnCount(): Promise<number> {
        const tracker = await this.ensureLoaded();
        return tracker.activeAssistantTurnCount;
    }

    /**
     * 功能：读取当前提取判定所需的游标快照。
     * 参数：
     *   无。
     * 返回：
     *   Promise<{ activeAssistantTurnCount: number; lastCommittedTurnCursor: string; lastVisibleTurnSnapshotHash: string; }>：游标快照。
     */
    async getExtractionSnapshot(): Promise<{
        activeAssistantTurnCount: number;
        lastCommittedTurnCursor: string;
        lastVisibleTurnSnapshotHash: string;
    }> {
        const tracker = await this.ensureLoaded();
        return {
            activeAssistantTurnCount: tracker.activeAssistantTurnCount,
            lastCommittedTurnCursor: tracker.lastCommittedTurnCursor,
            lastVisibleTurnSnapshotHash: tracker.lastVisibleTurnSnapshotHash,
        };
    }

    /**
     * 功能：按语义楼层与生命周期差异判断是否触发抽取。
     * 参数：
     *   input (ExtractionTriggerInput)：抽取判断输入。
     * 返回：
     *   Promise<boolean>：是否应触发抽取。
     */
    async shouldTriggerExtraction(input: ExtractionTriggerInput): Promise<boolean> {
        if (!input.summaryEnabled) {
            return false;
        }
        const snapshot = await this.getExtractionSnapshot();
        const delta = snapshot.activeAssistantTurnCount - input.lastExtractAssistantTurnCount;
        const hasLifecycleMutation = (
            (input.lastCommittedTurnCursor ?? '') !== (snapshot.lastCommittedTurnCursor ?? '')
            || (input.lastVisibleTurnSnapshotHash ?? '') !== (snapshot.lastVisibleTurnSnapshotHash ?? '')
        );
        if (snapshot.lastVisibleTurnSnapshotHash === (input.lastVisibleTurnSnapshotHash ?? '')) {
            if (input.lastExtractWindowHash === input.currentWindowHash) {
                return false;
            }
        }
        if (delta >= input.interval && input.lastExtractWindowHash !== input.currentWindowHash) {
            return true;
        }
        if (hasLifecycleMutation && snapshot.lastVisibleTurnSnapshotHash !== (input.lastVisibleTurnSnapshotHash ?? '')) {
            return true;
        }
        return false;
    }

    /**
     * 功能：使内部缓存失效。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    invalidateCache(): void {
        this.cachedTracker = null;
    }

    /**
     * 功能：计算轻量哈希值。
     * 参数：
     *   value (string)：输入文本。
     * 返回：
     *   string：哈希值。
     */
    private hashString(value: string): string {
        let hash = 5381;
        for (let index = 0; index < value.length; index += 1) {
            hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
        }
        return `h${(hash >>> 0).toString(16)}`;
    }
}
