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

// ─── Planner 轻量输入 ───────────────────────────────

/**
 * 功能：Planner 阶段轻量输入结构。
 * 仅包含事实帧、滚动摘要、信号包、候选卡片与类型许可表，
 * 禁止旧结构（recentSummaryDigest / candidateRecords / typeSchemas）直接透传。
 */
export interface LightweightPlannerInput {
    window: {
        fromTurn: number;
        toTurn: number;
        turnCount: number;
        windowFacts: string[];
    };
    rollingDigest: {
        summary: string;
        openThreads: string[];
        recentDecisions: string[];
    };
    signalPack: {
        candidateTypes: string[];
        focusPoints: string[];
        shouldUpdate: boolean;
    };
    candidateCards: Array<{
        id: string;
        type: string;
        brief: string;
        entities: string[];
        state: string;
    }>;
    allowedTypes: string[];
}

/** Planner 输入各字段硬限制。 */
const PLANNER_INPUT_LIMITS = {
    windowFactsMax: 12,
    rollingDigestSummaryMaxChars: 220,
    openThreadsMax: 5,
    openThreadMaxChars: 40,
    recentDecisionsMax: 3,
    focusPointsMax: 5,
    candidateTypesMax: 5,
    candidateCardsMax: 8,
    candidateCardBriefMaxChars: 60,
    /** 全量 JSON 序列化后的中文字符预算，超出后逐级裁剪。 */
    totalBudgetChars: 4500,
};

/**
 * 功能：从完整上下文构建 Planner 阶段的轻量输入。
 * 兼容层：无论上游传入的是旧结构还是新结构，统一转换为
 * windowFacts / rollingDigest / signalPack / candidateCards / allowedTypes，
 * 再施加硬限制后输出。
 * @param context 完整 mutation 上下文。
 * @returns 轻量 Planner 输入。
 */
export function buildLightweightPlannerInput(context: SummaryMutationContext): LightweightPlannerInput {
    const windowFacts = extractPlannerWindowFacts(context.window.summaryText);
    const rollingDigest = buildRollingDigest(context.recentSummaryDigest);
    const signalPack = buildSignalPack(context.detectedSignals, context.plannerHints);
    const candidateCards = buildPlannerCandidateCards(context.candidateRecords);
    const allowedTypes = context.typeSchemas
        .map((schema) => String(schema.schemaId ?? '').trim())
        .filter(Boolean);

    const input: LightweightPlannerInput = {
        window: {
            fromTurn: context.window.fromTurn,
            toTurn: context.window.toTurn,
            turnCount: Math.max(0, context.window.toTurn - context.window.fromTurn + 1),
            windowFacts,
        },
        rollingDigest,
        signalPack,
        candidateCards,
        allowedTypes,
    };

    return enforcePlannerBudget(input);
}

// ─── 轻量输入构建辅助函数 ────────────────────────────

/**
 * 功能：从窗口长文本中提取事实帧。
 * @param summaryText 窗口叙事文本。
 * @returns 事实列表（最多 windowFactsMax 条）。
 */
function extractPlannerWindowFacts(summaryText: string): string[] {
    const text = String(summaryText ?? '').trim();
    if (!text) return [];
    const sentences = text
        .split(/[。！？\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 4 && s.length <= 80);
    return sentences.slice(0, PLANNER_INPUT_LIMITS.windowFactsMax);
}

/**
 * 功能：从历史摘要数组构建单条滚动摘要。
 * 只读取最近一条已固化摘要，从中提炼 summary / openThreads / recentDecisions。
 * @param recentSummaryDigest 历史摘要数组。
 * @returns 滚动摘要。
 */
function buildRollingDigest(
    recentSummaryDigest: SummaryMutationContext['recentSummaryDigest'],
): LightweightPlannerInput['rollingDigest'] {
    if (recentSummaryDigest.length <= 0) {
        return { summary: '', openThreads: [], recentDecisions: [] };
    }
    const latest = recentSummaryDigest[0];
    const content = String(latest.content ?? '').trim();
    const maxChars = PLANNER_INPUT_LIMITS.rollingDigestSummaryMaxChars;
    const summary = content.length > maxChars ? content.slice(0, maxChars) + '…' : content;

    const sentences = content
        .split(/[。！？\n]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 4);

    const openThreadKeywords = ['未解决', '仍', '尚', '待', '还没', '悬而未决', '等待', '暂时', '不确定', '进行中'];
    const decisionKeywords = ['决定', '确认', '同意', '拒绝', '接受', '作废', '取消', '达成', '约定', '承诺'];

    const threadMaxChars = PLANNER_INPUT_LIMITS.openThreadMaxChars;
    const openThreads = sentences
        .filter((s) => openThreadKeywords.some((k) => s.includes(k)))
        .map((s) => s.length > threadMaxChars ? s.slice(0, threadMaxChars) + '…' : s)
        .slice(0, PLANNER_INPUT_LIMITS.openThreadsMax);

    const recentDecisions = sentences
        .filter((s) => decisionKeywords.some((k) => s.includes(k)))
        .map((s) => s.length > threadMaxChars ? s.slice(0, threadMaxChars) + '…' : s)
        .slice(0, PLANNER_INPUT_LIMITS.recentDecisionsMax);

    return { summary, openThreads, recentDecisions };
}

/**
 * 功能：合并 detectedSignals 与 plannerHints 为统一信号包。
 * @param detectedSignals 检测信号。
 * @param plannerHints 默认 planner 提示。
 * @returns 信号包。
 */
function buildSignalPack(
    detectedSignals: SummaryMutationContext['detectedSignals'],
    plannerHints: SummaryPlannerOutput,
): LightweightPlannerInput['signalPack'] {
    return {
        candidateTypes: detectedSignals.candidateTypes.slice(0, PLANNER_INPUT_LIMITS.candidateTypesMax),
        focusPoints: plannerHints.reasons.slice(0, PLANNER_INPUT_LIMITS.focusPointsMax),
        shouldUpdate: plannerHints.should_update,
    };
}

/**
 * 功能：将完整候选记录压缩为轻量候选卡片。
 * @param candidateRecords 完整候选记录。
 * @returns 候选卡片（最多 candidateCardsMax 条）。
 */
function buildPlannerCandidateCards(
    candidateRecords: SummaryCandidateRecord[],
): LightweightPlannerInput['candidateCards'] {
    const maxBrief = PLANNER_INPUT_LIMITS.candidateCardBriefMaxChars;
    return candidateRecords.slice(0, PLANNER_INPUT_LIMITS.candidateCardsMax).map((rec, idx) => {
        const brief = String(rec.summary ?? '').trim();
        return {
            id: rec.candidateId || `cand_${idx + 1}`,
            type: rec.targetKind,
            brief: brief.length > maxBrief ? brief.slice(0, maxBrief) + '…' : brief,
            entities: rec.entityKeys ?? [],
            state: rec.status ?? 'active',
        };
    });
}

/**
 * 功能：施加 Planner 输入总体积预算。
 * 超限时按优先级逐级裁剪：candidateCards 尾部 → recentDecisions → openThreads 尾部 → windowFacts 尾部。
 * @param input 待检查的轻量输入。
 * @returns 裁剪后的输入。
 */
function enforcePlannerBudget(input: LightweightPlannerInput): LightweightPlannerInput {
    const maxChars = PLANNER_INPUT_LIMITS.totalBudgetChars;
    let size = JSON.stringify(input).length;
    if (size <= maxChars) return input;

    while (input.candidateCards.length > 2 && size > maxChars) {
        input.candidateCards.pop();
        size = JSON.stringify(input).length;
    }
    if (size <= maxChars) return input;

    input.rollingDigest.recentDecisions = [];
    size = JSON.stringify(input).length;
    if (size <= maxChars) return input;

    while (input.rollingDigest.openThreads.length > 1 && size > maxChars) {
        input.rollingDigest.openThreads.pop();
        size = JSON.stringify(input).length;
    }
    if (size <= maxChars) return input;

    while (input.window.windowFacts.length > 3 && size > maxChars) {
        input.window.windowFacts.pop();
        size = JSON.stringify(input).length;
    }

    return input;
}
