import { DreamSessionRepository } from '../services/dream-session-repository';
import type {
    DreamExecutionMode,
    DreamRunProfile,
    DreamSessionMetaRecord,
    DreamSessionOutputRecord,
    DreamSessionApprovalRecord,
    DreamSchedulerStateRecord,
    DreamTriggerReason,
    DreamSessionOutputKind,
    DreamApprovalStatus,
} from '../services/dream-types';
import type { DreamLockRecord } from '../services/dream-lock-types';

/**
 * 功能：前端展示专用的梦境 UI 阶段枚举。
 */
export type DreamUiPhase =
    | 'queued'
    | 'running'
    | 'recalling'
    | 'generating'
    | 'post_processing'
    | 'waiting_approval'
    | 'auto_applying'
    | 'completed'
    | 'failed'
    | 'rolled_back';

/**
 * 功能：统一的梦境 UI 状态快照，供所有前端组件消费。
 */
export interface DreamUiStateSnapshot {
    chatKey: string;

    activeTask: {
        exists: boolean;
        dreamId?: string;
        triggerReason?: DreamTriggerReason;
        executionMode?: DreamExecutionMode;
        runProfile?: DreamRunProfile;
        approvalStatus?: DreamApprovalStatus;
        outputKind?: DreamSessionOutputKind;
        phase?: DreamUiPhase;
        startedAt?: number;
        holderId?: string;
    };

    inbox: {
        pendingApprovalCount: number;
        pendingDreamIds: string[];
    };

    latestCompleted?: {
        dreamId: string;
        executionMode?: DreamExecutionMode;
        runProfile?: DreamRunProfile;
        outputKind?: DreamSessionOutputKind;
        completedAt?: number;
        summaryText?: string;
        highlightCount?: number;
        mutationCount?: number;
        maintenanceAppliedCount?: number;
    };

    latestFailed?: {
        dreamId: string;
        failedAt?: number;
        reason?: string;
    };

    latestRolledBack?: {
        dreamId: string;
        rolledBackAt?: number;
    };
}

/**
 * 功能：将数据层状态映射为前端展示 phase。
 */
function resolveUiPhase(
    meta: DreamSessionMetaRecord | null,
    approval: DreamSessionApprovalRecord | null,
    lock: DreamLockRecord | null,
    schedulerState: DreamSchedulerStateRecord | null,
): DreamUiPhase {
    if (meta?.status === 'failed') return 'failed';
    if (meta?.status === 'rolled_back') return 'rolled_back';
    if (approval?.status === 'pending') return 'waiting_approval';
    if (meta?.status === 'approved') return 'completed';
    if (meta?.status === 'generated') return 'completed';
    if (meta?.status === 'rejected') return 'completed';

    if (lock?.status === 'running') {
        if (meta?.status === 'running') return 'running';
        return 'generating';
    }
    if (schedulerState?.active) {
        if (schedulerState.activeDreamId) return 'running';
        return 'queued';
    }
    return 'completed';
}

/**
 * 功能：构建静默完成摘要文案。
 */
function buildCompletionSummary(
    output: DreamSessionOutputRecord | null,
    maintenanceAppliedCount: number,
    approval?: DreamSessionApprovalRecord | null,
): string {
    if (approval?.approvalMode === 'auto_silent') {
        if (maintenanceAppliedCount > 0) {
            return `静默整理完成：已自动应用 ${maintenanceAppliedCount} 条低风险维护`;
        }
        return '静默整理完成：仅完成后台整理';
    }
    if (!output) return '梦境已完成';
    const highlights = output.highlights ?? [];
    if (maintenanceAppliedCount > 0 && highlights.length === 0) {
        return `梦境已完成：自动应用了 ${maintenanceAppliedCount} 条低风险维护`;
    }
    if (highlights.length > 0) {
        return `梦境已完成：整理了 ${highlights.length} 条记忆联想`;
    }
    if (output.proposedMutations.length === 0 && maintenanceAppliedCount === 0) {
        return '梦境已完成：未发现可落地更新，仅完成后台整理';
    }
    return '梦境已完成';
}

/**
 * 功能：梦境 UI 状态聚合服务。
 * 从 scheduler / lock / session / approval 聚合为统一 UI snapshot。
 */
export class DreamUiStateService {
    private readonly chatKey: string;
    private readonly repository: DreamSessionRepository;
    private cachedSnapshot: DreamUiStateSnapshot | null = null;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = new DreamSessionRepository(this.chatKey);
    }

    /**
     * 功能：获取最新的 UI 状态快照。
     */
    async getSnapshot(): Promise<DreamUiStateSnapshot> {
        const [schedulerState, metas] = await Promise.all([
            this.repository.getDreamSchedulerState(),
            this.repository.listDreamSessionMetas(20),
        ]);

        const activeDreamId = schedulerState?.activeDreamId ?? '';
        let lockState: DreamLockRecord | null = null;
        if (activeDreamId) {
            const { buildDreamLockKey } = await import('../services/dream-lock-types');
            lockState = await this.repository.getDreamLockState(buildDreamLockKey(this.chatKey));
        }

        // 聚合待审批。
        const pendingMetas = metas.filter((m: DreamSessionMetaRecord): boolean => m.status === 'generated');
        const pendingDreamIds: string[] = [];
        for (const pm of pendingMetas) {
            const session = await this.repository.getDreamSessionById(pm.dreamId);
            if (session.approval?.status === 'pending') {
                pendingDreamIds.push(pm.dreamId);
            }
        }

        // 寻找活跃任务。
        const activeMeta = activeDreamId
            ? metas.find((m: DreamSessionMetaRecord): boolean => m.dreamId === activeDreamId) ?? null
            : (
                metas.find((m: DreamSessionMetaRecord): boolean => pendingDreamIds.includes(m.dreamId))
                ?? metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'running' || m.status === 'queued')
                ?? metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'failed')
                ?? metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'approved' || (m.status === 'generated' && !pendingDreamIds.includes(m.dreamId)))
                ?? null
            );
        const activeSession = activeMeta
            ? await this.repository.getDreamSessionById(activeMeta.dreamId)
            : null;

        // 最近完成。
        const completedMeta = metas.find((m: DreamSessionMetaRecord): boolean => m.status === 'approved' || (m.status === 'generated' && !pendingDreamIds.includes(m.dreamId)));
        let latestCompleted: DreamUiStateSnapshot['latestCompleted'] | undefined;
        if (completedMeta) {
            const completedSession = await this.repository.getDreamSessionById(completedMeta.dreamId);
            const maintenanceApplied = completedSession.maintenanceProposals.filter((p) => p.status === 'applied').length;
            latestCompleted = {
                dreamId: completedMeta.dreamId,
                executionMode: completedMeta.executionMode,
                runProfile: completedMeta.runProfile,
                outputKind: completedSession.output?.outputKind,
                completedAt: completedMeta.updatedAt,
                summaryText: buildCompletionSummary(completedSession.output ?? null, maintenanceApplied, completedSession.approval),
                highlightCount: completedSession.output?.highlights.length ?? 0,
                mutationCount: completedSession.output?.proposedMutations.length ?? 0,
                maintenanceAppliedCount: maintenanceApplied,
            };
        }

        // 最近失败。
        const failedMeta = metas.find((m) => m.status === 'failed');
        const latestFailed: DreamUiStateSnapshot['latestFailed'] | undefined = failedMeta
            ? { dreamId: failedMeta.dreamId, failedAt: failedMeta.updatedAt, reason: failedMeta.failureReason }
            : undefined;

        // 最近回滚。
        const rolledBackMeta = metas.find((m) => m.status === 'rolled_back');
        const latestRolledBack: DreamUiStateSnapshot['latestRolledBack'] | undefined = rolledBackMeta
            ? { dreamId: rolledBackMeta.dreamId, rolledBackAt: rolledBackMeta.updatedAt }
            : undefined;

        const phase = activeMeta
            ? resolveUiPhase(activeMeta, activeSession?.approval ?? null, lockState, schedulerState)
            : (schedulerState?.active ? 'queued' : 'completed');

        const snapshot: DreamUiStateSnapshot = {
            chatKey: this.chatKey,
            activeTask: {
                exists: Boolean(activeMeta) || Boolean(schedulerState?.active),
                dreamId: activeMeta?.dreamId ?? schedulerState?.activeDreamId,
                triggerReason: activeMeta?.triggerReason ?? schedulerState?.lastTriggerSource,
                executionMode: activeMeta?.executionMode,
                runProfile: activeMeta?.runProfile,
                approvalStatus: activeSession?.approval?.status,
                outputKind: activeSession?.output?.outputKind,
                phase,
                startedAt: activeMeta?.createdAt,
                holderId: schedulerState?.activeHolderId,
            },
            inbox: {
                pendingApprovalCount: pendingDreamIds.length,
                pendingDreamIds,
            },
            latestCompleted,
            latestFailed,
            latestRolledBack,
        };

        this.cachedSnapshot = snapshot;
        return snapshot;
    }

    /**
     * 功能：获取缓存的快照（避免频繁读库）。
     */
    getCachedSnapshot(): DreamUiStateSnapshot | null {
        return this.cachedSnapshot;
    }

    /**
     * 功能：清除缓存的快照。
     */
    invalidateCache(): void {
        this.cachedSnapshot = null;
    }
}
