import type {
    MemoryTakeoverActiveSnapshot,
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';

/**
 * 功能：执行最终整合。
 * @param input 整合输入。
 * @returns 整合结果。
 */
export async function runTakeoverConsolidation(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    takeoverId: string;
    activeSnapshot: MemoryTakeoverActiveSnapshot | null;
    batchResults: MemoryTakeoverBatchResult[];
}): Promise<MemoryTakeoverConsolidationResult> {
    const dedupedFacts: MemoryTakeoverStableFact[] = dedupeFacts(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts));
    const actorCards: MemoryTakeoverActorCardCandidate[] = mergeActorCards(
        input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverActorCardCandidate[] => item.actorCards ?? []),
    );
    const relationState = collapseRelations(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationTransition[] => item.relationTransitions));
    const taskState = collapseTasks(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverTaskTransition[] => item.taskTransitions));
    const worldState = collapseWorldState(input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverWorldStateChange[] => item.worldStateChanges));
    const fallback: MemoryTakeoverConsolidationResult = {
        takeoverId: input.takeoverId,
        chapterDigestIndex: input.batchResults.map((item: MemoryTakeoverBatchResult) => ({
            batchId: item.batchId,
            range: item.sourceRange,
            summary: item.summary,
            tags: item.chapterTags,
        })),
        actorCards,
        longTermFacts: dedupedFacts,
        relationState,
        taskState,
        worldState,
        activeSnapshot: input.activeSnapshot,
        dedupeStats: {
            totalFacts: input.batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts).length,
            dedupedFacts: dedupedFacts.length,
            relationUpdates: relationState.length,
            taskUpdates: taskState.length,
            worldUpdates: Object.keys(worldState).length,
        },
        conflictStats: {
            unresolvedFacts: 0,
            unresolvedRelations: 0,
            unresolvedTasks: 0,
            unresolvedWorldStates: 0,
        },
        generatedAt: Date.now(),
    };
    const structured = await runTakeoverStructuredTask<MemoryTakeoverConsolidationResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskId: 'memory_takeover_consolidation',
        taskDescription: `旧聊天处理：整理前面结果（${Math.max(0, input.batchResults.length)}批）`,
        systemSection: 'TAKEOVER_CONSOLIDATION_SYSTEM',
        schemaSection: 'TAKEOVER_CONSOLIDATION_SCHEMA',
        sampleSection: 'TAKEOVER_CONSOLIDATION_OUTPUT_SAMPLE',
        payload: {
            takeoverId: input.takeoverId,
            activeSnapshot: input.activeSnapshot,
            batchResults: input.batchResults,
        },
    });
    return structured
        ? {
            ...fallback,
            ...structured,
            actorCards: mergeActorCards(structured.actorCards ?? fallback.actorCards),
            takeoverId: input.takeoverId,
            activeSnapshot: structured.activeSnapshot ?? input.activeSnapshot,
            generatedAt: Date.now(),
        }
        : fallback;
}

/**
 * 功能：合并旧聊天批次识别出的角色卡候选。
 * @param actorCards 原始角色卡候选。
 * @returns 合并后的角色卡列表。
 */
function mergeActorCards(actorCards: MemoryTakeoverActorCardCandidate[]): MemoryTakeoverActorCardCandidate[] {
    const map = new Map<string, MemoryTakeoverActorCardCandidate>();
    for (const actorCard of actorCards) {
        const actorKey = String(actorCard.actorKey ?? '').trim().toLowerCase();
        const displayName = String(actorCard.displayName ?? '').trim();
        if (!actorKey || actorKey === 'user' || !displayName) {
            continue;
        }
        const existing = map.get(actorKey);
        map.set(actorKey, {
            actorKey,
            displayName,
            aliases: dedupeStringValues([...(existing?.aliases ?? []), ...(actorCard.aliases ?? [])]),
            identityFacts: dedupeStringValues([...(existing?.identityFacts ?? []), ...(actorCard.identityFacts ?? [])]),
            originFacts: dedupeStringValues([...(existing?.originFacts ?? []), ...(actorCard.originFacts ?? [])]),
            traits: dedupeStringValues([...(existing?.traits ?? []), ...(actorCard.traits ?? [])]),
        });
    }
    return Array.from(map.values());
}

/**
 * 功能：去重字符串列表。
 * @param values 原始列表。
 * @returns 去重后的字符串列表。
 */
function dedupeStringValues(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (!normalized || result.includes(normalized)) {
            continue;
        }
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：去重稳定事实。
 * @param facts 事实列表。
 * @returns 去重后的事实。
 */
function dedupeFacts(facts: MemoryTakeoverStableFact[]): MemoryTakeoverStableFact[] {
    const map = new Map<string, MemoryTakeoverStableFact>();
    for (const fact of facts) {
        const key = `${fact.type}::${fact.subject}::${fact.predicate}::${fact.value}`;
        const existing = map.get(key);
        if (!existing || Number(fact.confidence || 0) >= Number(existing.confidence || 0)) {
            map.set(key, fact);
        }
    }
    return Array.from(map.values());
}

/**
 * 功能：汇总关系状态。
 * @param transitions 关系变化列表。
 * @returns 汇总后的关系状态。
 */
function collapseRelations(transitions: MemoryTakeoverRelationTransition[]): Array<{ target: string; state: string; reason: string }> {
    const map = new Map<string, { target: string; state: string; reason: string }>();
    for (const transition of transitions) {
        map.set(transition.target, {
            target: transition.target,
            state: transition.to,
            reason: transition.reason,
        });
    }
    return Array.from(map.values());
}

/**
 * 功能：汇总任务状态。
 * @param transitions 任务变化列表。
 * @returns 汇总后的任务状态。
 */
function collapseTasks(transitions: MemoryTakeoverTaskTransition[]): Array<{ task: string; state: string }> {
    const map = new Map<string, { task: string; state: string }>();
    for (const transition of transitions) {
        map.set(transition.task, {
            task: transition.task,
            state: transition.to,
        });
    }
    return Array.from(map.values());
}

/**
 * 功能：汇总世界状态。
 * @param changes 世界状态变化列表。
 * @returns 汇总后的世界状态。
 */
function collapseWorldState(changes: MemoryTakeoverWorldStateChange[]): Record<string, string> {
    const result: Record<string, string> = {};
    for (const change of changes) {
        result[change.key] = change.value;
    }
    return result;
}
