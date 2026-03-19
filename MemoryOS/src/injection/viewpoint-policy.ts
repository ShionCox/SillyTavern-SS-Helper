import type { GroupMemoryState, LogicalChatView, PersonaMemoryProfile } from '../types';
import type { PreparedRecallContext } from './recall-context-builder';

/**
 * 功能：描述视角策略适配后的注入输入。
 * 参数：无。
 * 返回：视角策略输入。
 */
export interface ViewpointPolicyInput {
    activeActorKey: string | null;
    logicalView: LogicalChatView | null;
    groupMemory: GroupMemoryState | null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
}

/**
 * 功能：把召回上下文整理成计划器可直接消费的视角输入。
 * 参数：
 *   context：召回上下文。
 *   logicalView：逻辑视图。
 *   groupMemory：群组记忆。
 * 返回：视角策略输入。
 */
export function buildViewpointPolicyInput(
    context: PreparedRecallContext,
    logicalView: LogicalChatView | null,
    groupMemory: GroupMemoryState | null,
): ViewpointPolicyInput {
    return {
        activeActorKey: context.activeActorKey,
        logicalView,
        groupMemory,
        personaProfiles: context.personaProfiles,
    };
}
