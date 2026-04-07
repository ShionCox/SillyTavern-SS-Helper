import type {
    DreamApprovalStatus,
    DreamMaintenanceProposalRecord,
    DreamMaintenanceProposalStatus,
    DreamSessionRecord,
    DreamSessionStatus,
} from './dream-types';

type DreamMaintenanceSessionLike = Pick<DreamSessionRecord, 'meta' | 'approval'> | null | undefined;

function isClosedDreamSessionStatus(status: DreamSessionStatus | null | undefined): boolean {
    return status === 'rejected' || status === 'rolled_back' || status === 'failed';
}

function isClosedDreamApprovalStatus(status: DreamApprovalStatus | null | undefined): boolean {
    return status === 'rejected';
}

/**
 * 功能：判断当前梦境会话是否已经关闭维护动作入口。
 * 说明：整次梦境被拒绝、失败或回滚后，挂在其下的维护提案不应再继续显示为待处理。
 * @param session 梦境会话快照。
 * @returns 是否应视为维护已关闭。
 */
export function isDreamMaintenanceClosedSession(session: DreamMaintenanceSessionLike): boolean {
    if (!session) {
        return false;
    }
    return isClosedDreamSessionStatus(session.meta?.status) || isClosedDreamApprovalStatus(session.approval?.status);
}

/**
 * 功能：计算维护提案在当前会话状态下的有效展示状态。
 * @param proposal 维护提案。
 * @param session 梦境会话快照。
 * @returns 供 UI 使用的有效状态。
 */
export function resolveDreamMaintenanceEffectiveStatus(
    proposal: Pick<DreamMaintenanceProposalRecord, 'status'>,
    session?: DreamMaintenanceSessionLike,
): DreamMaintenanceProposalStatus {
    if (proposal.status !== 'pending') {
        return proposal.status;
    }
    return isDreamMaintenanceClosedSession(session) ? 'rejected' : 'pending';
}

/**
 * 功能：判断维护提案是否仍应计入“待处理”队列。
 * @param proposal 维护提案。
 * @param session 梦境会话快照。
 * @returns 是否仍为有效待处理项。
 */
export function isDreamMaintenancePending(
    proposal: Pick<DreamMaintenanceProposalRecord, 'status'>,
    session?: DreamMaintenanceSessionLike,
): boolean {
    return resolveDreamMaintenanceEffectiveStatus(proposal, session) === 'pending';
}
