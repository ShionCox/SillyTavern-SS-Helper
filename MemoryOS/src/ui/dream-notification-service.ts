import { logger, toast } from '../runtime/runtime-services';
import type { DreamUiStateSnapshot } from './dream-ui-state-service';

/**
 * 功能：梦境通知去重记录。
 */
interface DreamNotificationMemory {
    lastNotifiedCompletedDreamId: string;
    lastNotifiedPendingDreamId: string;
    lastNotifiedFailedDreamId: string;
}

/**
 * 功能：梦境轻通知与去重服务。
 * 根据 DreamUiStateSnapshot 决定是否弹出轻量通知，避免同一次 dream 重复通知。
 */
export class DreamNotificationService {
    private memory: DreamNotificationMemory = {
        lastNotifiedCompletedDreamId: '',
        lastNotifiedPendingDreamId: '',
        lastNotifiedFailedDreamId: '',
    };

    /**
     * 功能：检查 snapshot 并在必要时发出通知。
     * @param snapshot 当前 UI 状态快照。
     */
    evaluate(snapshot: DreamUiStateSnapshot): void {
        this.checkSilentCompletion(snapshot);
        this.checkPendingApproval(snapshot);
        this.checkFailure(snapshot);
    }

    /**
     * 功能：静默完成通知。
     */
    private checkSilentCompletion(snapshot: DreamUiStateSnapshot): void {
        const completed = snapshot.latestCompleted;
        if (!completed) return;
        if (completed.dreamId === this.memory.lastNotifiedCompletedDreamId) return;
        // 静默模式（auto_light）使用轻 toast，手动深梦境不用 toast（用户已交互过）
        if (completed.runProfile === 'manual_deep') {
            this.memory.lastNotifiedCompletedDreamId = completed.dreamId;
            return;
        }
        this.memory.lastNotifiedCompletedDreamId = completed.dreamId;
        const text = completed.summaryText || '梦境已完成';
        if (completed.runProfile === 'auto_light') {
            toast.info(text, '梦境系统', { timeOut: 5000 });
            logger.info('[DreamNotification] 静默完成通知', text);
        } else if (completed.runProfile === 'auto_review') {
            // auto_review 完成但不在 pending 说明已被处理
            toast.info(text, '梦境系统', { timeOut: 5000 });
            logger.info('[DreamNotification] 自动审批完成通知', text);
        }
    }

    /**
     * 功能：待审批提醒通知。
     */
    private checkPendingApproval(snapshot: DreamUiStateSnapshot): void {
        const { pendingApprovalCount, pendingDreamIds } = snapshot.inbox;
        if (pendingApprovalCount <= 0) return;
        const latestPendingId = pendingDreamIds[0] ?? '';
        if (!latestPendingId) return;
        if (latestPendingId === this.memory.lastNotifiedPendingDreamId) return;
        this.memory.lastNotifiedPendingDreamId = latestPendingId;
        const text = pendingApprovalCount === 1
            ? '有 1 条梦境结果待审核'
            : `有 ${pendingApprovalCount} 条梦境结果待审核`;
        toast.info(text, '梦境系统', { timeOut: 6000 });
        logger.info('[DreamNotification] 待审批提醒', text);
    }

    /**
     * 功能：失败通知。
     */
    private checkFailure(snapshot: DreamUiStateSnapshot): void {
        const failed = snapshot.latestFailed;
        if (!failed) return;
        if (failed.dreamId === this.memory.lastNotifiedFailedDreamId) return;
        this.memory.lastNotifiedFailedDreamId = failed.dreamId;
        const reason = failed.reason ? `：${failed.reason}` : '';
        toast.error(`梦境执行失败${reason}`, '梦境系统', { timeOut: 6000 });
        logger.warn('[DreamNotification] 失败通知', failed.dreamId, failed.reason);
    }

    /**
     * 功能：重置通知记录（用于聊天切换等场景）。
     */
    reset(): void {
        this.memory = {
            lastNotifiedCompletedDreamId: '',
            lastNotifiedPendingDreamId: '',
            lastNotifiedFailedDreamId: '',
        };
    }
}
