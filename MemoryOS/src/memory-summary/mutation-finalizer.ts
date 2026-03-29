import type { SummaryMutationDocument, SummaryMutationAction } from './mutation-types';
import type { SummaryMutationStagingSnapshot } from './mutation-staging-store';

/**
 * 功能：合并多个 mutation 批次文档。
 * @param snapshot 暂存快照。
 * @returns 合并后的 mutation 文档。
 */
export function finalizeSummaryMutationSnapshot(snapshot: SummaryMutationStagingSnapshot): SummaryMutationDocument {
    const actions: SummaryMutationAction[] = [];
    let fromTurn = 0;
    let toTurn = 0;
    for (const batch of snapshot.batchResults) {
        fromTurn = fromTurn === 0 ? batch.mutationDocument.window.fromTurn : Math.min(fromTurn, batch.mutationDocument.window.fromTurn);
        toTurn = Math.max(toTurn, batch.mutationDocument.window.toTurn);
        actions.push(...batch.mutationDocument.actions);
    }
    return {
        schemaVersion: snapshot.batchResults[0]?.mutationDocument.schemaVersion || '1.0.0',
        window: {
            fromTurn,
            toTurn,
        },
        actions: dedupeMutationActions(actions),
    };
}

/**
 * 功能：去重 mutation 动作。
 * @param actions 原始动作列表。
 * @returns 去重后的动作列表。
 */
function dedupeMutationActions(actions: SummaryMutationAction[]): SummaryMutationAction[] {
    const result: SummaryMutationAction[] = [];
    const seen = new Set<string>();
    for (const action of actions) {
        const key = JSON.stringify([
            action.action,
            action.targetKind,
            action.candidateId,
            action.compareKey,
            action.targetId,
            action.payload ?? action.patch ?? action.newRecord ?? {},
        ]);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(action);
    }
    return result;
}
