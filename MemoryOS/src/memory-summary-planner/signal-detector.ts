import { matchKeywordSignals, type KeywordMatchResult } from '../memory-keywords';

/**
 * 功能：总结窗口信号检测结果。
 */
export interface SummarySignalDetectionResult {
    candidateTypes: string[];
    intentHints: string[];
    keywordMatches: KeywordMatchResult[];
    actors: string[];
    topics: string[];
}

/**
 * 功能：总结窗口信号检测输入。
 */
export interface SummarySignalDetectionInput {
    windowSummaryText: string;
    actorHints?: string[];
}

/**
 * 功能：检测总结窗口中的候选类型与主题信号。
 * @param input 检测输入。
 * @returns 检测结果。
 */
export function detectSummarySignals(input: SummarySignalDetectionInput): SummarySignalDetectionResult {
    const sourceText = String(input.windowSummaryText ?? '').trim();
    const matches = matchKeywordSignals(sourceText);
    const candidateTypes = dedupe(
        matches.flatMap((match: KeywordMatchResult): string[] => match.candidateTypes),
    );
    const intentHints = dedupe(
        matches.flatMap((match: KeywordMatchResult): string[] => match.intentHints),
    );
    const topics = dedupe(
        matches.flatMap((match: KeywordMatchResult): string[] => match.matchedKeywords),
    ).slice(0, 12);
    const actors = dedupe((input.actorHints ?? []).map((actor: string): string => String(actor ?? '').trim())).slice(0, 8);
    return {
        candidateTypes,
        intentHints,
        keywordMatches: matches,
        actors,
        topics,
    };
}

/**
 * 功能：数组去重。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function dedupe(values: string[]): string[] {
    const merged: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

