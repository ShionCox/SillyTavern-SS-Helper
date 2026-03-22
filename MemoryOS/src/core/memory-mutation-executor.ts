import { db, type DBDerivationSource, type DBFact, type DBSummary, type DBWorldState } from '../db/db';
import type { FactProposal, SummaryProposal } from '../proposal/types';
import { normalizeWorldStatePatchValue } from './world-state-patch-normalizer';
import { buildMemorySummaryEnvelope } from './memory-summary-envelope';
import { deleteMemoryCardsBySource, runWithMemoryCardVectorBatch, saveMemoryCardsFromEnvelope, saveMemoryCardsFromFactRecord } from './memory-card-store';
import { buildMemoryCardDraftsFromFact, formatFactMemoryTextForDisplay, formatSummaryMemoryText } from './memory-card-text';
import type { ChatStateManager } from './chat-state-manager';
import { FactsManager } from './facts-manager';
import { StateManager } from './state-manager';
import { SummariesManager } from './summaries-manager';
import { MemoryMutationHistoryManager } from './memory-mutation-history';
import type { MemoryMutationPlan, PlannedFactMutation, PlannedStateMutation, PlannedSummaryMutation } from './memory-mutation-planner';
import { buildMemoryMutationPlanSnapshot } from './memory-mutation-planner';
import type { MemoryCandidate, MemoryMutationHistoryAction, MemoryMutationHistoryEntry, MemoryMutationTargetKind } from '../types';
import type { MemoryMutationPlanSnapshot } from '../types';
import type { MemoryCardDraft } from '../../../SDK/stx';

/**
 * 功能：描述 mutation executor 的依赖输入。
 * @param consumerPluginId 触发插件标识。
 * @param envelopeConfidence 原始提议整体置信度。
 * @param derivationSource 本轮写入的来源追踪。
 * @param visibleMessageIds 本轮可见消息键列表。
 * @param plan planner 产出的动作计划。
 * @param factsManager 事实管理器。
 * @param stateManager 世界状态管理器。
 * @param summariesManager 摘要管理器。
 * @param chatStateManager 聊天状态管理器。
 * @param buildSummaryId 为新增摘要生成稳定 ID 的回调。
 * @returns executor 输入对象。
 */
export interface MemoryMutationExecutorInput {
    chatKey: string;
    consumerPluginId: string;
    envelopeConfidence: number;
    derivationSource: DBDerivationSource;
    visibleMessageIds: string[];
    plan: MemoryMutationPlan;
    factsManager: FactsManager;
    stateManager: StateManager;
    summariesManager: SummariesManager;
    chatStateManager?: ChatStateManager | null;
    buildSummaryId: (input: {
        summary: SummaryProposal;
        ordinal: number;
        nextTitle?: string;
        nextContent: string;
        nextKeywords?: string[];
    }) => string;
}

/**
 * 功能：描述 mutation executor 的执行结果。
 * @param applied 真正落库的记录键集合。
 * @param appliedItems 真正执行的动作条数。
 * @param shouldRefreshRelationshipState 是否需要刷新关系状态。
 * @param snapshot 供 UI 和状态持久化使用的规划快照。
 * @returns executor 输出结果。
 */
export interface MemoryMutationExecutionResult {
    applied: {
        factKeys: string[];
        statePaths: string[];
        summaryIds: string[];
    };
    appliedItems: number;
    shouldRefreshRelationshipState: boolean;
    snapshot: MemoryMutationPlanSnapshot;
}

/**
 * 功能：判断一条事实提议是否应走关系记忆编码。
 * @param mutation 事实规划结果。
 * @returns 是否按 relationship 候选处理。
 */
function isRelationshipFactMutation(mutation: PlannedFactMutation): boolean {
    const text = [
        String(mutation.proposal.type ?? ''),
        String(mutation.proposal.path ?? ''),
        JSON.stringify(mutation.nextValue ?? ''),
    ].join(' ');
    return /relationship|relation|bond|trust|affection|conflict|关系|好感|信任|矛盾/.test(text);
}

/**
 * 功能：构建事实写入前的记忆候选，供生命周期编码和严格向量链使用。
 * @param mutation 事实规划结果。
 * @param input executor 输入。
 * @returns 事实候选；若没有聊天状态管理器则返回 null。
 */
async function buildFactCandidate(
    mutation: PlannedFactMutation,
    input: MemoryMutationExecutorInput,
): Promise<MemoryCandidate | null> {
    if (!input.chatStateManager) {
        return null;
    }
    const syntheticFact: DBFact = {
        factKey: mutation.target?.factKey ?? mutation.proposal.factKey ?? crypto.randomUUID(),
        chatKey: input.chatKey,
        type: mutation.proposal.type,
        entity: mutation.proposal.entity,
        path: mutation.proposal.path,
        value: mutation.nextValue,
        confidence: mutation.proposal.confidence,
        provenance: {
            extractor: 'ai',
            provider: input.consumerPluginId,
            pluginId: input.consumerPluginId,
            source: input.derivationSource,
        },
        updatedAt: Date.now(),
    };
    return input.chatStateManager.buildMemoryCandidate({
        candidateId: crypto.randomUUID(),
        kind: isRelationshipFactMutation(mutation) ? 'relationship' : 'fact',
        source: input.consumerPluginId,
        summary: buildMemoryCardDraftsFromFact(syntheticFact).map((item: MemoryCardDraft): string => item.memoryText).join('\n') || formatFactMemoryTextForDisplay(syntheticFact),
        payload: {
            type: mutation.proposal.type,
            entity: mutation.proposal.entity,
            path: mutation.proposal.path,
            value: mutation.nextValue,
            confidence: mutation.proposal.confidence,
            sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? '',
        },
        extractedAt: Date.now(),
        sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? undefined,
    });
}

/**
 * 功能：构建摘要写入前的记忆候选，供生命周期编码和严格向量链使用。
 * @param mutation 摘要规划结果。
 * @param input executor 输入。
 * @returns 摘要候选；若没有聊天状态管理器则返回 null。
 */
async function buildSummaryCandidate(
    mutation: PlannedSummaryMutation,
    input: MemoryMutationExecutorInput,
): Promise<MemoryCandidate | null> {
    if (!input.chatStateManager) {
        return null;
    }
    return input.chatStateManager.buildMemoryCandidate({
        candidateId: crypto.randomUUID(),
        kind: 'summary',
        source: input.consumerPluginId,
        summary: formatSummaryMemoryText({
            summaryId: mutation.target?.summaryId ?? mutation.proposal.summaryId ?? crypto.randomUUID(),
            chatKey: input.chatKey,
            level: mutation.proposal.level,
            title: mutation.nextTitle,
            content: mutation.nextContent,
            keywords: mutation.nextKeywords,
            createdAt: Date.now(),
        }),
        payload: {
            level: mutation.proposal.level,
            title: mutation.nextTitle,
            content: mutation.nextContent,
            keywords: mutation.nextKeywords,
            memoryCards: mutation.proposal.memoryCards ?? [],
            confidence: input.envelopeConfidence,
            sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? '',
        },
        extractedAt: Date.now(),
        sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? undefined,
    });
}

/**
 * 功能：构建世界状态写入前的记忆候选，供生命周期编码使用。
 * @param mutation 世界状态规划结果。
 * @param normalizedValue 归一化后的世界状态值。
 * @param input executor 输入。
 * @returns 世界状态候选；若没有聊天状态管理器则返回 null。
 */
async function buildStateCandidate(
    mutation: PlannedStateMutation,
    normalizedValue: unknown,
    input: MemoryMutationExecutorInput,
): Promise<MemoryCandidate | null> {
    if (!input.chatStateManager) {
        return null;
    }
    return input.chatStateManager.buildMemoryCandidate({
        candidateId: crypto.randomUUID(),
        kind: 'state',
        source: input.consumerPluginId,
        summary: `${String(mutation.proposal.path ?? '').trim()} ${JSON.stringify(normalizedValue ?? '')}`.trim(),
        payload: {
            op: mutation.proposal.op,
            path: mutation.proposal.path,
            value: normalizedValue,
            confidence: input.envelopeConfidence,
            sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? '',
        },
        extractedAt: Date.now(),
        sourceEventId: input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? undefined,
    });
}

/**
 * 功能：复制事实记录的历史快照。
 * @param record 事实记录。
 * @returns 历史快照。
 */
function snapshotFactRecord(record: DBFact | null): unknown {
    return record ? { ...record } : null;
}

/**
 * 功能：复制摘要记录的历史快照。
 * @param record 摘要记录。
 * @returns 历史快照。
 */
function snapshotSummaryRecord(record: DBSummary | null): unknown {
    return record ? { ...record } : null;
}

/**
 * 功能：复制世界状态记录的历史快照。
 * @param record 世界状态记录。
 * @returns 历史快照。
 */
function snapshotStateRecord(record: DBWorldState | null): unknown {
    return record ? { ...record } : null;
}

/**
 * 功能：把一条已执行的 mutation 写入历史表。
 * @param historyManager 历史管理器。
 * @param input 执行输入。
 * @param mutation mutation 结果。
 * @param before 执行前快照。
 * @param after 执行后快照。
 * @param targetRecordKey 目标记录键。
 * @param targetKind 目标类型。
 */
async function appendMutationHistory(
    historyManager: MemoryMutationHistoryManager,
    input: MemoryMutationExecutorInput,
    mutation: PlannedFactMutation | PlannedSummaryMutation | PlannedStateMutation,
    before: unknown,
    after: unknown,
    targetRecordKey: string | undefined,
    targetKind: MemoryMutationTargetKind,
): Promise<void> {
    if (mutation.item.action === 'NOOP') {
        return;
    }
    await historyManager.append({
        source: input.plan.source,
        consumerPluginId: input.consumerPluginId,
        targetKind,
        action: mutation.item.action as MemoryMutationHistoryAction,
        title: mutation.item.title,
        compareKey: mutation.item.compareKey,
        targetRecordKey,
        existingRecordKeys: mutation.item.existingRecordKeys,
        reasonCodes: mutation.item.reasonCodes,
        before,
        after,
        visibleMessageIds: input.visibleMessageIds,
        derivation: input.derivationSource,
    });
}

/**
 * 功能：执行单条事实变更动作。
 * @param mutation 事实规划结果。
 * @param input executor 输入。
 * @returns 是否实际执行写入，以及是否需要刷新关系状态。
 */
async function executeFactMutation(
    mutation: PlannedFactMutation,
    input: MemoryMutationExecutorInput,
    historyManager: MemoryMutationHistoryManager,
): Promise<{ applied: boolean; factKey?: string; refreshRelationshipState: boolean }> {
    if (mutation.item.action === 'NOOP') {
        return { applied: false, refreshRelationshipState: false };
    }
    const beforeRecord = snapshotFactRecord(mutation.target);
    const shouldRetainVector = mutation.item.action !== 'DELETE' && mutation.item.action !== 'INVALIDATE';
    const candidate = shouldRetainVector ? await buildFactCandidate(mutation, input) : null;
    if (candidate && !candidate.encoding.accepted) {
        return { applied: false, refreshRelationshipState: false };
    }

    if (mutation.item.action === 'DELETE') {
        const factKey = mutation.target?.factKey ?? mutation.proposal.factKey ?? mutation.item.targetRecordKey;
        if (!factKey) {
            return { applied: false, refreshRelationshipState: false };
        }
        mutation.item.targetRecordKey = factKey;
        if (input.chatStateManager) {
            await input.chatStateManager.archiveFactKeys([factKey]);
        }
        await deleteMemoryCardsBySource(input.chatKey, factKey);
        await db.facts.delete(factKey);
        await appendMutationHistory(historyManager, input, mutation, beforeRecord, null, factKey, 'fact');
        return { applied: true, factKey, refreshRelationshipState: false };
    }

    if (mutation.item.action === 'INVALIDATE') {
        const factKey = mutation.target?.factKey ?? mutation.proposal.factKey ?? mutation.item.targetRecordKey;
        if (!factKey) {
            return { applied: false, refreshRelationshipState: false };
        }
        mutation.item.targetRecordKey = factKey;
        await input.factsManager.upsert({
            factKey,
            type: mutation.proposal.type,
            entity: mutation.proposal.entity,
            path: mutation.proposal.path,
            value: mutation.nextValue,
            confidence: mutation.proposal.confidence,
            provenance: {
                extractor: 'ai',
                provider: input.consumerPluginId,
                pluginId: input.consumerPluginId,
                source: input.derivationSource,
            },
        });
        await db.facts.update(factKey, {
            forgotten: true,
            forgottenAt: Date.now(),
            forgottenReasonCodes: Array.from(new Set([...(mutation.target?.forgottenReasonCodes ?? []), ...mutation.item.reasonCodes, 'manual_invalidate'])),
        } as Partial<DBFact>);
        if (input.chatStateManager) {
            await input.chatStateManager.archiveFactKeys([factKey]);
        }
        await deleteMemoryCardsBySource(input.chatKey, factKey);
        const persistedFact = await input.factsManager.get(factKey);
        await appendMutationHistory(historyManager, input, mutation, beforeRecord, snapshotFactRecord(persistedFact), factKey, 'fact');
        return {
            applied: true,
            factKey,
            refreshRelationshipState: false,
        };
    }

    const factKey = await input.factsManager.upsert({
        factKey: mutation.target?.factKey ?? mutation.proposal.factKey,
        type: mutation.proposal.type,
        entity: mutation.proposal.entity,
        path: mutation.proposal.path,
        value: mutation.nextValue,
        confidence: mutation.proposal.confidence,
        provenance: {
            extractor: 'ai',
            provider: input.consumerPluginId,
            pluginId: input.consumerPluginId,
            source: input.derivationSource,
        },
    });
    mutation.item.targetRecordKey = factKey;
    const persistedFact = await input.factsManager.get(factKey);
    if (persistedFact) {
        await saveMemoryCardsFromFactRecord(input.chatKey, persistedFact);
    }
    if (candidate && input.chatStateManager) {
        candidate.resolvedRecordKey = factKey;
        await input.chatStateManager.applyEncodingToRecord(factKey, 'fact', candidate.encoding);
    }
    await appendMutationHistory(historyManager, input, mutation, beforeRecord, snapshotFactRecord(persistedFact), factKey, 'fact');
    return {
        applied: true,
        factKey,
        refreshRelationshipState: Boolean(candidate && (
            candidate.kind === 'relationship'
            || Boolean(candidate.encoding.relationScope)
        )),
    };
}

/**
 * 功能：执行单条摘要变更动作。
 * @param mutation 摘要规划结果。
 * @param ordinal 本轮摘要序号。
 * @param input executor 输入。
 * @returns 是否实际执行写入。
 */
async function executeSummaryMutation(
    mutation: PlannedSummaryMutation,
    ordinal: number,
    input: MemoryMutationExecutorInput,
    historyManager: MemoryMutationHistoryManager,
): Promise<{ applied: boolean; summaryId?: string }> {
    if (mutation.item.action === 'NOOP' || !String(mutation.nextContent ?? '').trim()) {
        return { applied: false };
    }
    const beforeRecord = snapshotSummaryRecord(mutation.target);
    const shouldRetainVector = mutation.item.action !== 'DELETE' && mutation.item.action !== 'INVALIDATE';
    const candidate = shouldRetainVector ? await buildSummaryCandidate(mutation, input) : null;
    if (candidate && !candidate.encoding.accepted) {
        return { applied: false };
    }
    const summaryRange = {
        fromMessageId: mutation.proposal.range?.fromMessageId ?? input.visibleMessageIds[0] ?? undefined,
        toMessageId: mutation.proposal.range?.toMessageId ?? input.visibleMessageIds[input.visibleMessageIds.length - 1] ?? undefined,
    };
    if (mutation.item.action === 'DELETE') {
        const summaryId = mutation.target?.summaryId ?? mutation.proposal.summaryId ?? mutation.item.targetRecordKey;
        if (!summaryId) {
            return { applied: false };
        }
        mutation.item.targetRecordKey = summaryId;
        if (input.chatStateManager) {
            await input.chatStateManager.archiveSummaryIds([summaryId]);
        }
        await db.summaries.delete(summaryId);
        await appendMutationHistory(historyManager, input, mutation, beforeRecord, null, summaryId, 'summary');
        return { applied: true, summaryId };
    }
    if (mutation.item.action === 'INVALIDATE') {
        const summaryId = mutation.target?.summaryId ?? mutation.proposal.summaryId ?? mutation.item.targetRecordKey;
        if (!summaryId) {
            return { applied: false };
        }
        mutation.item.targetRecordKey = summaryId;
        await input.summariesManager.upsert({
            summaryId,
            level: mutation.proposal.level,
            title: mutation.nextTitle,
            content: mutation.nextContent,
            keywords: mutation.nextKeywords,
            range: summaryRange,
            source: {
                extractor: 'ai',
                provider: input.consumerPluginId,
                provenance: {
                    extractor: 'ai',
                    provider: input.consumerPluginId,
                    pluginId: input.consumerPluginId,
                    source: input.derivationSource,
                    memorySummaryEnvelope: buildMemorySummaryEnvelope({
                        summaryId,
                        chatKey: input.chatKey,
                        level: mutation.proposal.level,
                        title: mutation.nextTitle,
                        content: mutation.nextContent,
                        keywords: mutation.nextKeywords,
                        createdAt: Date.now(),
                    }, mutation.proposal.memoryCards ?? []),
                },
            },
        });
        await db.summaries.update(summaryId, {
            forgotten: true,
            forgottenAt: Date.now(),
            forgottenReasonCodes: Array.from(new Set([...(mutation.target?.forgottenReasonCodes ?? []), ...mutation.item.reasonCodes, 'manual_invalidate'])),
        } as Partial<DBSummary>);
        if (input.chatStateManager) {
            await input.chatStateManager.archiveSummaryIds([summaryId]);
        }
        const persistedSummary = await input.summariesManager.getById(summaryId);
        await appendMutationHistory(historyManager, input, mutation, beforeRecord, snapshotSummaryRecord(persistedSummary ?? null), summaryId, 'summary');
        return {
            applied: true,
            summaryId,
        };
    }

    const summaryId = mutation.target?.summaryId
        || input.buildSummaryId({
            summary: mutation.proposal,
            ordinal,
            nextTitle: mutation.nextTitle,
            nextContent: mutation.nextContent,
            nextKeywords: mutation.nextKeywords,
        });
    const persistedSummaryId = await input.summariesManager.upsert({
        summaryId,
        level: mutation.proposal.level,
        title: mutation.nextTitle,
        content: mutation.nextContent,
        keywords: mutation.nextKeywords,
        range: summaryRange,
        source: {
            extractor: 'ai',
            provider: input.consumerPluginId,
            provenance: {
                extractor: 'ai',
                provider: input.consumerPluginId,
                pluginId: input.consumerPluginId,
                source: input.derivationSource,
                memorySummaryEnvelope: buildMemorySummaryEnvelope({
                    summaryId,
                    chatKey: input.chatKey,
                    level: mutation.proposal.level,
                    title: mutation.nextTitle,
                    content: mutation.nextContent,
                    keywords: mutation.nextKeywords,
                    createdAt: Date.now(),
                }, mutation.proposal.memoryCards ?? []),
            },
        },
    });
    mutation.item.targetRecordKey = persistedSummaryId;
    await saveMemoryCardsFromEnvelope(
        input.chatKey,
        persistedSummaryId,
        'summary',
        buildMemorySummaryEnvelope({
            summaryId: persistedSummaryId,
            chatKey: input.chatKey,
            level: mutation.proposal.level,
            title: mutation.nextTitle,
            content: mutation.nextContent,
            keywords: mutation.nextKeywords,
            createdAt: Date.now(),
        }, mutation.proposal.memoryCards ?? []),
    );
    if (candidate && input.chatStateManager) {
        candidate.resolvedRecordKey = persistedSummaryId;
        await input.chatStateManager.applyEncodingToRecord(persistedSummaryId, 'summary', candidate.encoding);
    }
    const persistedSummary = await input.summariesManager.getById(persistedSummaryId);
    await appendMutationHistory(historyManager, input, mutation, beforeRecord, snapshotSummaryRecord(persistedSummary ?? null), persistedSummaryId, 'summary');
    return {
        applied: true,
        summaryId: persistedSummaryId,
    };
}

/**
 * 功能：执行单条世界状态变更动作。
 * @param mutation 世界状态规划结果。
 * @param input executor 输入。
 * @returns 是否实际执行写入。
 */
async function executeStateMutation(
    mutation: PlannedStateMutation,
    input: MemoryMutationExecutorInput,
    historyManager: MemoryMutationHistoryManager,
): Promise<{ applied: boolean; path?: string }> {
    if (mutation.item.action === 'NOOP') {
        return { applied: false };
    }
    const beforeRecord = snapshotStateRecord(mutation.target);
    if (mutation.item.action === 'DELETE') {
        await input.stateManager.patch([{ op: 'remove', path: mutation.proposal.path }]);
        mutation.item.targetRecordKey = mutation.proposal.path;
        await appendMutationHistory(
            historyManager,
            input,
            mutation,
            beforeRecord,
            {
                path: mutation.proposal.path,
                deleted: true,
            },
            mutation.proposal.path,
            'state',
        );
        return {
            applied: true,
            path: mutation.proposal.path,
        };
    }
    const normalizedValue = normalizeWorldStatePatchValue(mutation.proposal.path, mutation.nextValue);
    const candidate = await buildStateCandidate(mutation, normalizedValue, input);
    if (candidate && !candidate.encoding.accepted) {
        return { applied: false };
    }
    await input.stateManager.set(mutation.proposal.path, normalizedValue);
    mutation.item.targetRecordKey = mutation.proposal.path;
    if (candidate && input.chatStateManager) {
        candidate.resolvedRecordKey = mutation.proposal.path;
        await input.chatStateManager.applyEncodingToRecord(mutation.proposal.path, 'state', candidate.encoding);
    }
    const persistedState = await db.world_state.get(`${input.chatKey}::${mutation.proposal.path}`);
    await appendMutationHistory(historyManager, input, mutation, beforeRecord, snapshotStateRecord(persistedState ?? null), mutation.proposal.path, 'state');
    return {
        applied: true,
        path: mutation.proposal.path,
    };
}

/**
 * 功能：根据 planner 结果执行长期记忆 CRUD 动作。
 * @param input executor 输入。
 * @returns 执行结果汇总。
 */
export async function executeMemoryMutationPlan(input: MemoryMutationExecutorInput): Promise<MemoryMutationExecutionResult> {
    return runWithMemoryCardVectorBatch(input.chatKey, async (): Promise<MemoryMutationExecutionResult> => {
        const historyManager = new MemoryMutationHistoryManager(input.chatKey);
        const applied = {
            factKeys: [] as string[],
            statePaths: [] as string[],
            summaryIds: [] as string[],
        };
        let appliedItems = 0;
        let shouldRefreshRelationshipState = false;

        for (const mutation of input.plan.factMutations) {
            const result = await executeFactMutation(mutation, input, historyManager);
            if (!result.applied || !result.factKey) {
                continue;
            }
            applied.factKeys.push(result.factKey);
            appliedItems += 1;
            shouldRefreshRelationshipState = shouldRefreshRelationshipState || result.refreshRelationshipState;
        }

        for (const [index, mutation] of input.plan.summaryMutations.entries()) {
            const result = await executeSummaryMutation(mutation, index, input, historyManager);
            if (!result.applied || !result.summaryId) {
                continue;
            }
            applied.summaryIds.push(result.summaryId);
            appliedItems += 1;
        }

        for (const mutation of input.plan.stateMutations) {
            const result = await executeStateMutation(mutation, input, historyManager);
            if (!result.applied || !result.path) {
                continue;
            }
            applied.statePaths.push(result.path);
            appliedItems += 1;
        }

        const snapshot = buildMemoryMutationPlanSnapshot(input.plan, appliedItems);
        return {
            applied,
            appliedItems,
            shouldRefreshRelationshipState,
            snapshot,
        };
    });
}
