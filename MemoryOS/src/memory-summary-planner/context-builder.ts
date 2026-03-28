import type { MemoryEntry, WorldProfileBinding } from '../types';
import { detectWorldProfile, resolveWorldProfile, type WorldProfileDetectionResult } from '../memory-world-profile';
import { detectSummarySignals } from './signal-detector';
import { resolveCandidateTypes } from './candidate-type-resolver';
import { resolveSummaryTypeSchemas, type SummaryTypeSchema } from './schema-resolver';
import { resolveCandidateRecords, type SummaryCandidateRecord } from './candidate-record-resolver';
import type { SummaryPlannerOutput } from '../memory-summary/mutation-types';

/**
 * 功能：总结窗口信息。
 */
export interface SummaryWindowInput {
    fromTurn: number;
    toTurn: number;
    summaryText: string;
}

/**
 * 功能：总结上下文构建输入。
 */
export interface BuildSummaryContextInput {
    task: string;
    schemaVersion: string;
    window: SummaryWindowInput;
    actorHints: string[];
    entries: MemoryEntry[];
    memoryPercentByEntryId?: Map<string, number>;
    worldProfileTexts: string[];
    worldProfileBinding?: WorldProfileBinding | null;
    recentSummaries?: Array<{ title: string; content: string; updatedAt: number }>;
    enableEmbedding?: boolean;
    rulePackMode?: 'native' | 'perocore' | 'hybrid';
}

/**
 * 功能：总结上下文对象。
 */
export interface SummaryMutationContext {
    task: string;
    schemaVersion: string;
    window: {
        fromTurn: number;
        toTurn: number;
        summaryText: string;
    };
    detectedSignals: {
        candidateTypes: string[];
        actors: string[];
        topics: string[];
    };
    plannerHints: SummaryPlannerOutput;
    recentSummaryDigest: Array<{
        title: string;
        content: string;
        updatedAt: number;
    }>;
    worldProfileBias: WorldProfileDetectionResult;
    typeSchemas: SummaryTypeSchema[];
    candidateRecords: SummaryCandidateRecord[];
    rules: {
        mustReferenceCandidateWhenPossible: boolean;
        mustUseAllowedFieldsOnly: boolean;
        mustPreferUpdateOverDuplicate: boolean;
        mustReturnJsonOnly: boolean;
    };
}

/**
 * 功能：构建总结 mutation 上下文。
 * @param input 构建输入。
 * @returns mutation 上下文与链路诊断信息。
 */
export async function buildSummaryMutationContext(input: BuildSummaryContextInput): Promise<{
    context: SummaryMutationContext;
    diagnostics: {
        retrievalProviderId: string;
        matchedEntryIds: string[];
        worldProfile: string;
    };
}> {
    const worldProfileDetection = resolveWorldProfileDetection(input);
    const resolvedWorldProfile = resolveWorldProfile(worldProfileDetection);
    const signalResult = detectSummarySignals({
        windowSummaryText: input.window.summaryText,
        actorHints: input.actorHints,
    });
    const candidateTypes = resolveCandidateTypes({
        detectedTypes: signalResult.candidateTypes,
        worldProfile: resolvedWorldProfile,
    });
    const typeSchemas = resolveSummaryTypeSchemas(candidateTypes, resolvedWorldProfile.mergedFieldExtensions);
    const candidateResolveResult = await resolveCandidateRecords({
        query: input.window.summaryText,
        candidateTypes,
        entries: input.entries,
        memoryPercentByEntryId: input.memoryPercentByEntryId,
        enableEmbedding: input.enableEmbedding,
        rulePackMode: input.rulePackMode,
        maxCandidatesHardCap: 12,
        candidateTextBudgetChars: 1800,
    });

    return {
        context: {
            task: input.task,
            schemaVersion: input.schemaVersion,
            window: {
                fromTurn: input.window.fromTurn,
                toTurn: input.window.toTurn,
                summaryText: input.window.summaryText,
            },
            detectedSignals: {
                candidateTypes,
                actors: signalResult.actors,
                topics: signalResult.topics,
            },
            plannerHints: {
                should_update: candidateTypes.length > 0 || signalResult.topics.length > 0,
                focus_types: candidateTypes,
                entities: signalResult.actors,
                topics: signalResult.topics,
                reasons: buildPlannerHintReasons(candidateTypes, signalResult.topics),
            },
            recentSummaryDigest: (input.recentSummaries ?? []).slice(0, 4).map((item) => ({
                title: String(item.title ?? '').trim(),
                content: String(item.content ?? '').trim(),
                updatedAt: Number(item.updatedAt ?? 0) || 0,
            })),
            worldProfileBias: worldProfileDetection,
            typeSchemas,
            candidateRecords: candidateResolveResult.candidates,
            rules: {
                mustReferenceCandidateWhenPossible: true,
                mustUseAllowedFieldsOnly: true,
                mustPreferUpdateOverDuplicate: true,
                mustReturnJsonOnly: true,
            },
        },
        diagnostics: {
            retrievalProviderId: candidateResolveResult.providerId,
            matchedEntryIds: candidateResolveResult.matchedEntryIds,
            worldProfile: resolvedWorldProfile.primary.worldProfileId,
        },
    };
}

/**
 * 功能：构建 Planner 默认理由提示。
 * @param candidateTypes 检测到的候选类型。
 * @param topics 检测到的主题。
 * @returns 理由列表。
 */
function buildPlannerHintReasons(candidateTypes: string[], topics: string[]): string[] {
    const reasons: string[] = [];
    if (candidateTypes.length > 0) {
        reasons.push(`检测到可更新的记忆类型：${candidateTypes.join('、')}。`);
    }
    if (topics.length > 0) {
        reasons.push(`当前区间主题集中在：${topics.join('、')}。`);
    }
    if (reasons.length <= 0) {
        reasons.push('当前区间以低信息量交流为主，可能无需更新长期记忆。');
    }
    return reasons;
}

/**
 * 功能：解析总结阶段 world profile 检测结果。
 * @param input 构建输入。
 * @returns 检测结果。
 */
function resolveWorldProfileDetection(input: BuildSummaryContextInput): WorldProfileDetectionResult {
    const binding = input.worldProfileBinding;
    if (binding?.primaryProfile) {
        return {
            primaryProfile: binding.primaryProfile,
            secondaryProfiles: binding.secondaryProfiles ?? [],
            confidence: binding.confidence ?? 0.7,
            reasonCodes: dedupeStrings([
                ...(binding.reasonCodes ?? []),
                'source:world_profile_binding',
            ]),
        };
    }
    return detectWorldProfile({
        texts: input.worldProfileTexts,
    });
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
