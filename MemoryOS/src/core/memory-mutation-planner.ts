import Dexie from 'dexie';
import { db, type DBFact, type DBSummary, type DBWorldState } from '../db/db';
import type { FactProposal, PatchProposal, SummaryProposal } from '../proposal/types';
import type { ChatStateManager } from './chat-state-manager';
import {
    DEFAULT_MEMORY_MUTATION_ACTION_COUNTS,
    type MemoryMutationAction,
    type MemoryMutationActionCounts,
    type MemoryMutationPlanItem,
    type MemoryMutationPlanSnapshot,
} from '../types';
import {
    mergeMutationValues,
    normalizeFactMutationRecord,
    normalizeMutationText,
    normalizeStateMutationRecord,
    normalizeSummaryMutationRecord,
    shouldInvalidateMutationValue,
    stableSerializeMutationValue,
} from './memory-record-normalizer';

/**
 * 功能：描述 planner 输出的事实变更动作。
 * @param item 面向界面的规划项。
 * @param proposal 原始事实提议。
 * @param target 规划命中的旧事实。
 * @param nextValue 最终准备写入的新值。
 * @returns 事实变更规划结果。
 */
export interface PlannedFactMutation {
    item: MemoryMutationPlanItem;
    proposal: FactProposal;
    target: DBFact | null;
    nextValue: unknown;
}

/**
 * 功能：描述 planner 输出的摘要变更动作。
 * @param item 面向界面的规划项。
 * @param proposal 原始摘要提议。
 * @param target 规划命中的旧摘要。
 * @param nextTitle 最终准备写入的新标题。
 * @param nextContent 最终准备写入的新内容。
 * @param nextKeywords 最终准备写入的新关键词。
 * @returns 摘要变更规划结果。
 */
export interface PlannedSummaryMutation {
    item: MemoryMutationPlanItem;
    proposal: SummaryProposal;
    target: DBSummary | null;
    nextTitle?: string;
    nextContent: string;
    nextKeywords?: string[];
}

/**
 * 功能：描述 planner 输出的世界状态变更动作。
 * @param item 面向界面的规划项。
 * @param proposal 原始世界状态提议。
 * @param target 规划命中的旧世界状态。
 * @param nextValue 最终准备写入的新值。
 * @returns 世界状态变更规划结果。
 */
export interface PlannedStateMutation {
    item: MemoryMutationPlanItem;
    proposal: PatchProposal;
    target: DBWorldState | null;
    nextValue: unknown;
}

/**
 * 功能：描述一整轮 mutation planner 的完整结果。
 * @param source 触发来源。
 * @param consumerPluginId 触发插件标识。
 * @param generatedAt 规划时间。
 * @param actionCounts 各动作数量。
 * @param items 面向界面的规划项。
 * @param factMutations 事实规划结果。
 * @param summaryMutations 摘要规划结果。
 * @param stateMutations 世界状态规划结果。
 * @returns planner 结果。
 */
export interface MemoryMutationPlan {
    source: string;
    consumerPluginId: string;
    generatedAt: number;
    actionCounts: MemoryMutationActionCounts;
    items: MemoryMutationPlanItem[];
    factMutations: PlannedFactMutation[];
    summaryMutations: PlannedSummaryMutation[];
    stateMutations: PlannedStateMutation[];
}

/**
 * 功能：planner 的输入参数。
 * @param chatKey 当前聊天键。
 * @param consumerPluginId 触发插件标识。
 * @param source 触发来源。
 * @param facts 原始事实提议列表。
 * @param patches 原始世界状态提议列表。
 * @param summaries 原始摘要提议列表。
 * @param chatStateManager 聊天状态管理器。
 * @returns planner 输入对象。
 */
export interface MemoryMutationPlannerInput {
    chatKey: string;
    consumerPluginId: string;
    source: string;
    facts?: FactProposal[];
    patches?: PatchProposal[];
    summaries?: SummaryProposal[];
    chatStateManager?: ChatStateManager | null;
}

/**
 * 功能：克隆一份动作计数对象，避免默认对象被共享修改。
 * @returns 空的动作计数对象。
 */
function cloneActionCounts(): MemoryMutationActionCounts {
    return {
        ...DEFAULT_MEMORY_MUTATION_ACTION_COUNTS,
    };
}

/**
 * 功能：为 planner 记录一条规划项并累计动作数量。
 * @param actionCounts 动作计数对象。
 * @param items 规划项列表。
 * @param item 新规划项。
 * @returns 写入后的规划项。
 */
function pushPlanItem(
    actionCounts: MemoryMutationActionCounts,
    items: MemoryMutationPlanItem[],
    item: MemoryMutationPlanItem,
): MemoryMutationPlanItem {
    actionCounts[item.action] += 1;
    items.push(item);
    return item;
}

/**
 * 功能：判断摘要关键词是否存在可合并的新信息。
 * @param currentKeywords 旧关键词。
 * @param nextKeywords 新关键词。
 * @returns 合并后的关键词和是否发生变化。
 */
function mergeSummaryKeywords(currentKeywords: string[] | undefined, nextKeywords: string[] | undefined): {
    merged: string[] | undefined;
    changed: boolean;
} {
    const existing = Array.isArray(currentKeywords)
        ? currentKeywords.map((item: string): string => normalizeMutationText(item)).filter(Boolean)
        : [];
    const incoming = Array.isArray(nextKeywords)
        ? nextKeywords.map((item: string): string => normalizeMutationText(item)).filter(Boolean)
        : [];
    const merged = Array.from(new Set([...existing, ...incoming]));
    return {
        merged: merged.length > 0 ? merged : undefined,
        changed: stableSerializeMutationValue(existing) !== stableSerializeMutationValue(merged),
    };
}

/**
 * 功能：从聊天状态中读取软删除索引，供 planner 过滤旧记录。
 * @param chatStateManager 聊天状态管理器。
 * @returns 软删除索引集合。
 */
async function readArchivedSets(chatStateManager?: ChatStateManager | null): Promise<{
    factKeys: Set<string>;
    summaryIds: Set<string>;
    statePaths: Set<string>;
}> {
    const archives = chatStateManager ? await chatStateManager.getRetentionArchives() : null;
    return {
        factKeys: new Set(Array.isArray(archives?.archivedFactKeys) ? archives!.archivedFactKeys.map((item: string): string => normalizeMutationText(item)).filter(Boolean) : []),
        summaryIds: new Set(Array.isArray(archives?.archivedSummaryIds) ? archives!.archivedSummaryIds.map((item: string): string => normalizeMutationText(item)).filter(Boolean) : []),
        statePaths: new Set(Array.isArray(archives?.archivedStatePaths) ? archives!.archivedStatePaths.map((item: string): string => normalizeMutationText(item)).filter(Boolean) : []),
    };
}

/**
 * 功能：加载当前聊天下仍然活跃的事实、摘要和世界状态。
 * @param chatKey 当前聊天键。
 * @param chatStateManager 聊天状态管理器。
 * @returns 已过滤软删除记录的上下文数据。
 */
async function loadPlannerRecords(chatKey: string, chatStateManager?: ChatStateManager | null): Promise<{
    facts: DBFact[];
    summaries: DBSummary[];
    states: DBWorldState[];
}> {
    const archived = await readArchivedSets(chatStateManager);
    const [facts, summaries, states] = await Promise.all([
        db.facts.where('[chatKey+updatedAt]').between([chatKey, Dexie.minKey], [chatKey, Dexie.maxKey]).reverse().toArray(),
        db.summaries.where('[chatKey+level+createdAt]').between([chatKey, Dexie.minKey, Dexie.minKey], [chatKey, Dexie.maxKey, Dexie.maxKey]).reverse().toArray(),
        db.world_state.where('[chatKey+path]').between([chatKey, ''], [chatKey, '\uffff']).toArray(),
    ]);
    return {
        facts: facts.filter((item: DBFact): boolean => !archived.factKeys.has(normalizeMutationText(item.factKey))),
        summaries: summaries.filter((item: DBSummary): boolean => !archived.summaryIds.has(normalizeMutationText(item.summaryId))),
        states: states.filter((item: DBWorldState): boolean => !archived.statePaths.has(normalizeMutationText(item.path))),
    };
}

/**
 * 功能：判断旧事实是否与新提议属于同一条逻辑记录。
 * @param fact 旧事实。
 * @param compareKey 新提议的比较键。
 * @returns 是否属于同一逻辑记录。
 */
function matchesFactCompareKey(fact: DBFact, compareKey: string): boolean {
    return normalizeFactMutationRecord({
        factKey: fact.factKey,
        type: fact.type,
        entity: fact.entity,
        path: fact.path,
        value: fact.value,
        confidence: fact.confidence,
    }).compareKey === compareKey;
}

/**
 * 功能：判断旧摘要是否与新提议属于同一条逻辑记录。
 * @param summary 旧摘要。
 * @param compareKey 新提议的比较键。
 * @returns 是否属于同一逻辑记录。
 */
function matchesSummaryCompareKey(summary: DBSummary, compareKey: string): boolean {
    return normalizeSummaryMutationRecord({
        level: summary.level,
        title: summary.title,
        content: summary.content,
        keywords: summary.keywords,
    }).compareKey === compareKey;
}

/**
 * 功能：判断旧世界状态是否与新提议属于同一路径记录。
 * @param state 旧世界状态。
 * @param compareKey 新提议的比较键。
 * @returns 是否属于同一路径记录。
 */
function matchesStateCompareKey(state: DBWorldState, compareKey: string): boolean {
    return normalizeStateMutationRecord({
        op: 'replace',
        path: state.path,
        value: state.value,
    }).compareKey === compareKey;
}

/**
 * 功能：把提议里显式指定的记录键规整出来。
 * @param value 候选记录键。
 * @returns 规整后的记录键；若为空则返回空串。
 */
function normalizeTargetRecordKey(value: unknown): string {
    return normalizeMutationText(value);
}

/**
 * 功能：为事实提议规划 CRUD 动作。
 * @param fact 事实提议。
 * @param existingFacts 当前聊天中的活跃事实。
 * @param actionCounts 动作计数对象。
 * @param items 规划项列表。
 * @returns 事实规划结果。
 */
function planFactMutation(
    fact: FactProposal,
    existingFacts: DBFact[],
    actionCounts: MemoryMutationActionCounts,
    items: MemoryMutationPlanItem[],
): PlannedFactMutation {
    const normalized = normalizeFactMutationRecord(fact);
    const explicitTargetRecordKey = normalizeTargetRecordKey(fact.targetRecordKey ?? fact.factKey);
    const actionHint = normalizeMutationText(fact.action).toLowerCase() || 'auto';
    const matches = explicitTargetRecordKey
        ? existingFacts.filter((item: DBFact): boolean => normalizeMutationText(item.factKey) === explicitTargetRecordKey)
        : existingFacts.filter((item: DBFact): boolean => matchesFactCompareKey(item, normalized.compareKey));
    const exactMatch = matches.find((item: DBFact): boolean => stableSerializeMutationValue(item.value) === normalized.valueSignature) ?? null;
    const target = exactMatch ?? matches[0] ?? null;
    let action: MemoryMutationAction = 'ADD';
    let nextValue: unknown = fact.value;
    const reasonCodes: string[] = [];

    if (actionHint === 'delete') {
        if (target) {
            action = 'DELETE';
            nextValue = target.value;
            reasonCodes.push('fact_delete_explicit_target');
        } else {
            action = 'NOOP';
            reasonCodes.push('fact_delete_missing_target', 'planner_skip_direct_write');
        }
    } else if (actionHint === 'invalidate') {
        if (target) {
            action = 'INVALIDATE';
            nextValue = target.value;
            reasonCodes.push('fact_invalidate_explicit_target');
        } else {
            action = 'NOOP';
            reasonCodes.push('fact_invalidate_missing_target', 'planner_skip_direct_write');
        }
    } else if (exactMatch) {
        action = 'NOOP';
        nextValue = exactMatch.value;
        reasonCodes.push('fact_exact_duplicate', 'planner_skip_direct_write');
    } else if (target) {
        const mergedValue = mergeMutationValues(target.value, fact.value);
        const targetSignature = stableSerializeMutationValue(target.value);
        const incomingSignature = stableSerializeMutationValue(fact.value);
        const mergedSignature = stableSerializeMutationValue(mergedValue);
        if (mergedSignature === targetSignature) {
            action = 'NOOP';
            nextValue = target.value;
            reasonCodes.push('fact_merge_no_change', 'planner_skip_direct_write');
        } else if (mergedSignature !== targetSignature && mergedSignature !== incomingSignature) {
            action = 'MERGE';
            nextValue = mergedValue;
            reasonCodes.push('fact_merge_existing_record', 'planner_keep_record_key');
        } else if (shouldInvalidateMutationValue(target.value, fact.value)) {
            action = 'INVALIDATE';
            nextValue = fact.value;
            reasonCodes.push('fact_conflict_replace', 'planner_keep_record_key');
        } else {
            action = 'UPDATE';
            nextValue = fact.value;
            reasonCodes.push('fact_update_existing_record', 'planner_keep_record_key');
        }
    } else {
        reasonCodes.push(explicitTargetRecordKey ? 'fact_explicit_target_missing' : 'fact_add_new_record');
    }

    const item = pushPlanItem(actionCounts, items, {
        itemId: crypto.randomUUID(),
        targetKind: 'fact',
        action,
        title: normalized.title,
        compareKey: normalized.compareKey,
        normalizedText: normalized.normalizedText,
        targetRecordKey: normalizeMutationText(target?.factKey) || undefined,
        existingRecordKeys: matches.map((item: DBFact): string => normalizeMutationText(item.factKey)).filter(Boolean),
        reasonCodes,
    });

    return {
        item,
        proposal: fact,
        target,
        nextValue,
    };
}

/**
 * 功能：为摘要提议规划 CRUD 动作。
 * @param summary 摘要提议。
 * @param existingSummaries 当前聊天中的活跃摘要。
 * @param actionCounts 动作计数对象。
 * @param items 规划项列表。
 * @returns 摘要规划结果。
 */
function planSummaryMutation(
    summary: SummaryProposal,
    existingSummaries: DBSummary[],
    actionCounts: MemoryMutationActionCounts,
    items: MemoryMutationPlanItem[],
): PlannedSummaryMutation {
    const normalized = normalizeSummaryMutationRecord(summary);
    const explicitTargetRecordKey = normalizeTargetRecordKey(summary.targetRecordKey ?? summary.summaryId);
    const actionHint = normalizeMutationText(summary.action).toLowerCase() || 'auto';
    const matches = explicitTargetRecordKey
        ? existingSummaries.filter((item: DBSummary): boolean => normalizeMutationText(item.summaryId) === explicitTargetRecordKey)
        : existingSummaries.filter((item: DBSummary): boolean => matchesSummaryCompareKey(item, normalized.compareKey));
    const exactMatch = matches.find((item: DBSummary): boolean => normalizeSummaryMutationRecord({
        level: item.level,
        title: item.title,
        content: item.content,
        keywords: item.keywords,
    }).contentSignature === normalized.contentSignature) ?? null;
    const target = exactMatch ?? matches[0] ?? null;
    let action: MemoryMutationAction = 'ADD';
    let nextTitle = normalizeMutationText(summary.title) || undefined;
    let nextContent = normalizeMutationText(summary.content);
    let nextKeywords = Array.isArray(summary.keywords)
        ? summary.keywords.map((item: string): string => normalizeMutationText(item)).filter(Boolean)
        : undefined;
    const reasonCodes: string[] = [];

    if (actionHint === 'delete') {
        if (target) {
            action = 'DELETE';
            nextTitle = target.title;
            nextContent = target.content;
            nextKeywords = target.keywords;
            reasonCodes.push('summary_delete_explicit_target');
        } else {
            action = 'NOOP';
            reasonCodes.push('summary_delete_missing_target', 'planner_skip_direct_write');
        }
    } else if (actionHint === 'invalidate') {
        if (target) {
            action = 'INVALIDATE';
            nextTitle = target.title;
            nextContent = target.content;
            nextKeywords = target.keywords;
            reasonCodes.push('summary_invalidate_explicit_target');
        } else {
            action = 'NOOP';
            reasonCodes.push('summary_invalidate_missing_target', 'planner_skip_direct_write');
        }
    } else if (exactMatch) {
        action = 'NOOP';
        nextTitle = exactMatch.title;
        nextContent = exactMatch.content;
        nextKeywords = exactMatch.keywords;
        reasonCodes.push('summary_exact_duplicate', 'planner_skip_direct_write');
    } else if (target) {
        const mergedContentValue = mergeMutationValues(target.content, summary.content);
        const mergedContent = normalizeMutationText(mergedContentValue);
        const mergedKeywords = mergeSummaryKeywords(target.keywords, summary.keywords);
        const titleChanged = normalizeMutationText(target.title) !== normalizeMutationText(nextTitle);
        const contentChanged = normalizeMutationText(target.content) !== mergedContent;
        if (!titleChanged && !contentChanged && !mergedKeywords.changed) {
            action = 'NOOP';
            nextTitle = target.title;
            nextContent = target.content;
            nextKeywords = target.keywords;
            reasonCodes.push('summary_merge_no_change', 'planner_skip_direct_write');
        } else if (mergedContent !== normalizeMutationText(summary.content) || mergedKeywords.changed) {
            action = 'MERGE';
            nextTitle = nextTitle || target.title;
            nextContent = mergedContent || normalizeMutationText(summary.content);
            nextKeywords = mergedKeywords.merged;
            reasonCodes.push('summary_merge_existing_record', 'planner_keep_record_key');
        } else {
            action = 'UPDATE';
            reasonCodes.push('summary_update_existing_record', 'planner_keep_record_key');
        }
    } else {
        reasonCodes.push(explicitTargetRecordKey ? 'summary_explicit_target_missing' : 'summary_add_new_record');
    }

    const item = pushPlanItem(actionCounts, items, {
        itemId: crypto.randomUUID(),
        targetKind: 'summary',
        action,
        title: normalized.title,
        compareKey: normalized.compareKey,
        normalizedText: normalized.normalizedText,
        targetRecordKey: normalizeMutationText(target?.summaryId) || undefined,
        existingRecordKeys: matches.map((item: DBSummary): string => normalizeMutationText(item.summaryId)).filter(Boolean),
        reasonCodes,
    });

    return {
        item,
        proposal: summary,
        target,
        nextTitle,
        nextContent,
        nextKeywords,
    };
}

/**
 * 功能：为世界状态提议规划 CRUD 动作。
 * @param patch 世界状态提议。
 * @param existingStates 当前聊天中的活跃世界状态。
 * @param actionCounts 动作计数对象。
 * @param items 规划项列表。
 * @returns 世界状态规划结果。
 */
function planStateMutation(
    patch: PatchProposal,
    existingStates: DBWorldState[],
    actionCounts: MemoryMutationActionCounts,
    items: MemoryMutationPlanItem[],
): PlannedStateMutation {
    const normalized = normalizeStateMutationRecord(patch);
    const matches = existingStates.filter((item: DBWorldState): boolean => matchesStateCompareKey(item, normalized.compareKey));
    const target = matches[0] ?? null;
    let action: MemoryMutationAction = 'ADD';
    let nextValue: unknown = patch.value;
    const reasonCodes: string[] = [];

    if (patch.op === 'remove') {
        if (!target) {
            action = 'NOOP';
            reasonCodes.push('state_remove_missing', 'planner_skip_direct_write');
        } else {
            action = 'DELETE';
            reasonCodes.push('state_remove_existing');
        }
    } else if (!target) {
        action = 'ADD';
        reasonCodes.push('state_add_new_path');
    } else {
        const targetSignature = stableSerializeMutationValue(target.value);
        const incomingSignature = stableSerializeMutationValue(patch.value);
        const mergedValue = mergeMutationValues(target.value, patch.value);
        const mergedSignature = stableSerializeMutationValue(mergedValue);
        if (targetSignature === incomingSignature) {
            action = 'NOOP';
            nextValue = target.value;
            reasonCodes.push('state_exact_duplicate', 'planner_skip_direct_write');
        } else if (mergedSignature !== targetSignature && mergedSignature !== incomingSignature) {
            action = 'MERGE';
            nextValue = mergedValue;
            reasonCodes.push('state_merge_existing_path');
        } else {
            action = 'UPDATE';
            nextValue = patch.value;
            reasonCodes.push('state_update_existing_path');
        }
    }

    const item = pushPlanItem(actionCounts, items, {
        itemId: crypto.randomUUID(),
        targetKind: 'state',
        action,
        title: normalized.title,
        compareKey: normalized.compareKey,
        normalizedText: normalized.normalizedText,
        targetRecordKey: normalizeMutationText(target?.stateKey) || undefined,
        existingRecordKeys: matches.map((item: DBWorldState): string => normalizeMutationText(item.stateKey)).filter(Boolean),
        reasonCodes,
    });

    return {
        item,
        proposal: patch,
        target,
        nextValue,
    };
}

/**
 * 功能：执行一轮规则化的长期记忆 mutation planning。
 * @param input planner 输入参数。
 * @returns 完整的 mutation planner 结果。
 */
export async function planMemoryMutations(input: MemoryMutationPlannerInput): Promise<MemoryMutationPlan> {
    const { facts, summaries, states } = await loadPlannerRecords(input.chatKey, input.chatStateManager);
    const actionCounts = cloneActionCounts();
    const items: MemoryMutationPlanItem[] = [];
    const factMutations = (Array.isArray(input.facts) ? input.facts : [])
        .filter((item: FactProposal | null | undefined): item is FactProposal => Boolean(item))
        .map((fact: FactProposal): PlannedFactMutation => planFactMutation(fact, facts, actionCounts, items));
    const summaryMutations = (Array.isArray(input.summaries) ? input.summaries : [])
        .filter((item: SummaryProposal | null | undefined): item is SummaryProposal => Boolean(item))
        .map((summary: SummaryProposal): PlannedSummaryMutation => planSummaryMutation(summary, summaries, actionCounts, items));
    const stateMutations = (Array.isArray(input.patches) ? input.patches : [])
        .filter((item: PatchProposal | null | undefined): item is PatchProposal => Boolean(item))
        .map((patch: PatchProposal): PlannedStateMutation => planStateMutation(patch, states, actionCounts, items));
    return {
        source: normalizeMutationText(input.source) || 'proposal_manager',
        consumerPluginId: normalizeMutationText(input.consumerPluginId) || 'unknown_plugin',
        generatedAt: Date.now(),
        actionCounts,
        items,
        factMutations,
        summaryMutations,
        stateMutations,
    };
}

/**
 * 功能：把 planner 结果压缩为适合写入聊天状态与 UI 的快照。
 * @param plan planner 结果。
 * @param appliedItems 最终真正执行的条数。
 * @returns 适合持久化的 planner 快照。
 */
export function buildMemoryMutationPlanSnapshot(plan: MemoryMutationPlan, appliedItems: number): MemoryMutationPlanSnapshot {
    return {
        source: plan.source,
        consumerPluginId: plan.consumerPluginId,
        generatedAt: plan.generatedAt,
        totalItems: plan.items.length,
        appliedItems: Math.max(0, Number(appliedItems ?? 0) || 0),
        actionCounts: {
            ...plan.actionCounts,
        },
        items: plan.items.slice(0, 16).map((item: MemoryMutationPlanItem): MemoryMutationPlanItem => ({
            ...item,
            existingRecordKeys: Array.isArray(item.existingRecordKeys) ? item.existingRecordKeys.slice(0, 6) : [],
            reasonCodes: Array.isArray(item.reasonCodes) ? item.reasonCodes.slice(0, 6) : [],
        })),
    };
}
