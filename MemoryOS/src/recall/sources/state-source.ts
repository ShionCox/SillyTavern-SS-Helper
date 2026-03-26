import type { RecallCandidate } from '../../types';
import {
    buildScoredCandidate,
    extractEntityFocusTerms,
    normalizeText,
    readSourceLimit,
    stringifyValue,
    type RecallSourceContext,
} from './shared';

type StateRawEntry = {
    path: string;
    value: unknown;
    text: string;
};

/**
 * 功能：判断世界状态条目是否与当前查询有显式实体命中。
 * @param query 用户查询。
 * @param entry 世界状态条目。
 * @returns 命中时返回 `true`。
 */
function isStateEntryEntityMatched(query: string, entry: StateRawEntry): boolean {
    const terms = extractEntityFocusTerms(query);
    if (terms.length <= 0) {
        return false;
    }
    const normalized = normalizeText(`${entry.path} ${entry.text}`).toLowerCase();
    return terms.some((term: string): boolean => normalized.includes(term.toLowerCase()));
}

/**
 * 功能：按“实体命中优先 + 其余补位”整理世界状态候选顺序。
 * @param query 用户查询。
 * @param entries 世界状态原始条目。
 * @returns 重排后的候选顺序。
 */
function reorderStateEntriesByQuery(query: string, entries: StateRawEntry[]): StateRawEntry[] {
    const matched: StateRawEntry[] = [];
    const rest: StateRawEntry[] = [];
    entries.forEach((entry: StateRawEntry): void => {
        if (isStateEntryEntityMatched(query, entry)) {
            matched.push(entry);
        } else {
            rest.push(entry);
        }
    });
    return [...matched, ...rest];
}

/**
 * 功能：收集世界状态召回候选，避免在评分前过早截断。
 * @param context 召回上下文。
 * @returns 世界状态候选列表。
 */
export async function collectStateRecallCandidates(context: RecallSourceContext): Promise<RecallCandidate[]> {
    if (!context.plan.sections.includes('WORLD_STATE')) {
        return [];
    }
    const states = await context.stateManager.query('') as Record<string, unknown>;
    const sourceLimit = readSourceLimit(context, 'state', 6);
    const allEntries: StateRawEntry[] = Object.entries(states).map(([path, value]: [string, unknown]): StateRawEntry => {
        const text = `${path}: ${stringifyValue(value)}`;
        return { path, value, text };
    });
    const orderedEntries = reorderStateEntriesByQuery(context.query, allEntries);
    const limitedEntries = orderedEntries.slice(0, Math.max(sourceLimit * 8, sourceLimit + 6));
    return limitedEntries
        .map((entry: StateRawEntry): RecallCandidate | null => buildScoredCandidate(context, {
            candidateId: `state:${entry.path}`,
            recordKey: entry.path,
            recordKind: 'state',
            source: 'state',
            sectionHint: 'WORLD_STATE',
            title: entry.path,
            rawText: entry.text,
            confidence: 0.58,
            updatedAt: Date.now(),
            memoryType: 'world',
            sourceScope: 'world',
        }))
        .filter((item: RecallCandidate | null): item is RecallCandidate => item != null);
}
