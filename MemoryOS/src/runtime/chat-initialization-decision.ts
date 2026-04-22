import { LEGACY_CHAT_MIN_FLOORS } from '../memory-takeover/takeover-detector';

export type MemoryChatInitializationAction = 'none' | 'takeover' | 'cold_start';

export interface MemoryChatInitializationDecisionInput {
    settingsEnabled: boolean;
    coldStartEnabled: boolean;
    takeoverEnabled: boolean;
    coldStartCompleted: boolean;
    coldStartSuppressed?: boolean;
    currentFloorCount: number;
    takeoverPlanStatus?: string;
    coldStartBusy?: boolean;
    takeoverBusy?: boolean;
}

export interface MemoryChatInitializationDecision {
    action: MemoryChatInitializationAction;
    reason: string;
}

const RECOVERABLE_TAKEOVER_STATUSES = new Set<string>([
    'running',
    'paused',
    'blocked_by_batch',
    'failed',
]);

/**
 * 功能：判断打开聊天时应进入冷启动、旧聊天接管，还是不弹窗。
 * @param input 当前聊天初始化状态。
 * @returns 初始化决策。
 */
export function resolveMemoryChatInitializationDecision(
    input: MemoryChatInitializationDecisionInput,
): MemoryChatInitializationDecision {
    if (!input.settingsEnabled) {
        return { action: 'none', reason: 'memory_disabled' };
    }
    if (input.coldStartCompleted) {
        return { action: 'none', reason: 'cold_start_completed' };
    }

    const planStatus = String(input.takeoverPlanStatus ?? '').trim();
    if (planStatus === 'completed' || planStatus === 'degraded') {
        return { action: 'none', reason: planStatus === 'degraded' ? 'takeover_degraded' : 'takeover_completed' };
    }

    const currentFloorCount = Math.max(0, Math.trunc(Number(input.currentFloorCount) || 0));
    const hasRecoverableTakeover = RECOVERABLE_TAKEOVER_STATUSES.has(planStatus);
    const isLegacyChat = currentFloorCount >= LEGACY_CHAT_MIN_FLOORS;
    if (hasRecoverableTakeover || isLegacyChat) {
        if (!input.takeoverEnabled) {
            return { action: 'none', reason: 'takeover_disabled' };
        }
        if (input.takeoverBusy) {
            return { action: 'none', reason: 'takeover_busy' };
        }
        return {
            action: 'takeover',
            reason: hasRecoverableTakeover ? 'recoverable_takeover_found' : 'legacy_chat_detected',
        };
    }

    if (input.coldStartSuppressed) {
        return { action: 'none', reason: 'cold_start_suppressed' };
    }
    if (!input.coldStartEnabled) {
        return { action: 'none', reason: 'cold_start_disabled' };
    }
    if (input.coldStartBusy) {
        return { action: 'none', reason: 'cold_start_busy' };
    }
    return { action: 'cold_start', reason: 'cold_start_needed' };
}
