import type { MemoryEntry, SummaryEntryUpsert, WorldProfileBinding } from '../types';
import { detectWorldProfile, resolveWorldProfile, type WorldProfileDetectionResult } from '../memory-world-profile';
import { detectSummarySignals } from './signal-detector';
import { resolveCandidateTypes } from './candidate-type-resolver';
import { resolveSummaryTypeSchemas, type SummaryTypeSchema } from './schema-resolver';
import { resolveCandidateRecords, type SummaryCandidateRecord } from './candidate-record-resolver';
import {
    buildActiveKeywordSets as buildPlannerActiveKeywordSets,
    getDefaultNarrativeStyle as getDefaultPlannerNarrativeStyle,
    resolveNarrativeStyle as resolvePlannerNarrativeStyle,
    type ActiveKeywordSets as PlannerActiveKeywordSets,
    type NarrativeStyle,
    type ResolvedNarrativeStyle,
} from './planner-keywords';
import type { SummaryPlannerOutput } from '../memory-summary/mutation-types';
import type { PlannerFact, PlannerSignal, FragmentRepairMetadata, FragmentRepairDebugRow } from './fragment-types';
import { runFragmentRepairPipeline } from './planner-input-assembler';
import { buildFragmentRepairAuditRecord, formatAuditLog } from './memory-audit-logger';

/**
 * 功能：总结窗口信息。
 */
export interface SummaryWindowInput {
    fromTurn: number;
    toTurn: number;
    summaryText: string;
    /** 近景窗口文本，用于语境提示。 */
    recentContextText?: string;
}

/**
 * 功能：净化后的历史摘要结构。
 */
export interface NormalizedSummaryDigest {
    stableContext: string;
    taskState: string[];
    relationState: string[];
    unresolvedQuestions: string[];
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
    recentSummaries?: Array<{
        title: string;
        content: string;
        updatedAt: number;
        normalizedSummary?: NormalizedSummaryDigest;
    }>;
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
        recentContextText?: string;
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
        normalizedSummary: NormalizedSummaryDigest;
    }>;
    worldProfileBias: WorldProfileDetectionResult;
    narrativeStyle: ResolvedNarrativeStyle;
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
    const currentWindowDetection = detectWorldProfile({
        texts: dedupeStrings([
            input.window.summaryText,
            ...(input.recentSummaries ?? []).slice(0, 2).map((item) => String(item.content ?? '').trim()),
        ]),
    });
    const narrativeStyle = resolvePlannerNarrativeStyle({
        worldProfileBinding: input.worldProfileBinding,
        worldProfileDetection: currentWindowDetection,
        windowSummaryText: input.window.summaryText,
        recentSummaryTexts: (input.recentSummaries ?? []).map((item) => String(item.content ?? '').trim()),
    });
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
                ...(input.window.recentContextText ? { recentContextText: input.window.recentContextText } : {}),
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
                normalizedSummary: normalizeSummarySnapshot({
                    title: item.title,
                    content: item.content,
                    normalizedSummary: item.normalizedSummary,
                }),
            })),
            worldProfileBias: worldProfileDetection,
            narrativeStyle,
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
        evidenceSnippets: string[];
    };
    rollingDigest: NormalizedSummaryDigest;
    signalPack: {
        candidateTypes: string[];
        focusPoints: string[];
        evidenceSignals: string[];
        shouldUpdate: boolean;
    };
    candidateCards: Array<{
        id: string;
        type: string;
        brief: string;
        entities: string[];
        state: string;
        whyRelevant: string[];
    }>;
    allowedTypes: string[];
    /** 经残缺修复后的强事实列表（文本形式，供 Planner 消费）。 */
    repairedFacts: string[];
    /** 降级弱信号列表（文本形式）。 */
    signals: string[];
    /** Planner 端硬性约束提示。 */
    constraints: string[];
    /** 片段修复链路统计。 */
    repairMetadata: FragmentRepairMetadata;
}

/** Planner 输入各字段硬限制。 */
const PLANNER_INPUT_LIMITS = {
    windowFactsMax: 12,
    evidenceSnippetsMax: 3,
    evidenceSnippetMaxChars: 35,
    taskStateMax: 3,
    relationStateMax: 2,
    unresolvedQuestionsMax: 3,
    focusPointsMax: 4,
    evidenceSignalsMax: 6,
    candidateTypesMax: 5,
    candidateCardsMax: 8,
    candidateCardBriefMaxChars: 72,
    whyRelevantMax: 3,
    allowedTypesMax: 5,
    /** 全量 JSON 序列化后的中文字符预算，超出后逐级裁剪。 */
    totalBudgetChars: 8000,
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
    const activeKeywords = buildPlannerActiveKeywordSets(context.narrativeStyle);
    const windowSummary = analyzeWindowSummary(context.window.summaryText, context.detectedSignals.actors, activeKeywords);
    const rollingDigest = buildRollingDigest(context.recentSummaryDigest, windowSummary.windowFacts, context.narrativeStyle);
    const candidateCards = buildPlannerCandidateCards(
        context.candidateRecords,
        context.detectedSignals.actors,
        windowSummary.windowFacts,
    );
    const signalPack = buildSignalPack(
        context.detectedSignals,
        context.plannerHints,
        windowSummary.windowFacts,
        rollingDigest,
        candidateCards,
        activeKeywords,
    );
    const allowedTypes = buildAllowedTypes(
        context.detectedSignals.candidateTypes,
        candidateCards.map((card) => card.type),
        context.typeSchemas.map((schema) => String(schema.schemaId ?? '').trim()).filter(Boolean),
    );

    // ── 残缺片段修复链路 ──────────────────────────────
    const turnRange: [number, number] = [context.window.fromTurn, context.window.toTurn];
    const repairResult = runFragmentRepairPipeline(
        context.window.summaryText,
        context.detectedSignals.actors,
        turnRange,
    );
    // 审计日志（仅输出到控制台供调试）
    const auditRecord = buildFragmentRepairAuditRecord(repairResult.metadata, repairResult.debugRows);
    if (typeof console !== 'undefined' && auditRecord.rows.length > 0) {
        console.debug(formatAuditLog(auditRecord));
    }
    // 把修复后的 fact 文本合并进 windowFacts（去重）
    const repairedFactTexts = repairResult.facts.map((f) => f.text);
    const mergedWindowFacts = dedupeStrings([
        ...windowSummary.windowFacts,
        ...repairedFactTexts,
    ]).slice(0, PLANNER_INPUT_LIMITS.windowFactsMax);
    const signalTexts = repairResult.signals.map((s) => s.text);

    const input: LightweightPlannerInput = {
        window: {
            fromTurn: context.window.fromTurn,
            toTurn: context.window.toTurn,
            turnCount: Math.max(0, context.window.toTurn - context.window.fromTurn + 1),
            windowFacts: mergedWindowFacts,
            evidenceSnippets: windowSummary.evidenceSnippets,
        },
        rollingDigest,
        signalPack,
        candidateCards,
        allowedTypes,
        repairedFacts: repairedFactTexts.slice(0, PLANNER_INPUT_LIMITS.windowFactsMax),
        signals: signalTexts.slice(0, 6),
        constraints: [
            'signals 仅为弱提示，不可升级为确定事实。',
            '不得根据残缺片段脑补原文未提供的结论。',
            '信息不足时优先保守规划，而非大幅推进。',
            '同一事项同时存在 fact 与 signal 时，以 fact 为准。',
        ],
        repairMetadata: repairResult.metadata,
    };

    return enforcePlannerBudget(input);
}

// ─── 轻量输入构建辅助函数 ────────────────────────────

/**
 * 功能：归一化历史摘要，生成可复用状态块。
 * @param input 摘要输入。
 * @returns 净化结果。
 */
export function normalizeSummarySnapshot(input: {
    title?: string;
    content?: string;
    entryUpserts?: SummaryEntryUpsert[];
    normalizedSummary?: NormalizedSummaryDigest;
    narrativeStyle?: ResolvedNarrativeStyle;
}): NormalizedSummaryDigest {
    if (hasNormalizedSummaryContent(input.normalizedSummary)) {
        return sanitizeNormalizedSummary(input.normalizedSummary as NormalizedSummaryDigest);
    }
    const sourceSentences = splitChineseSentences([input.title, input.content].filter(Boolean).join('。'));
    const entrySentences = (input.entryUpserts ?? []).flatMap((item) => {
        const payload = normalizeRecord(item.detailPayload);
        const fields = normalizeRecord(payload.fields);
        return [
            item.summary,
            String(fields.state ?? ''),
            String(fields.status ?? ''),
            String(fields.objective ?? ''),
            String(fields.result ?? ''),
            String(payload.state ?? ''),
        ];
    }).map((item) => normalizeChineseText(item)).filter(Boolean);
    const sentences = dedupeStrings([...sourceSentences, ...entrySentences]);
    const activeKeywords = buildPlannerActiveKeywordSets(input.narrativeStyle ?? getDefaultPlannerNarrativeStyle());
    const taskState = collectDigestBucket(sentences, activeKeywords.taskStateKeywords, PLANNER_INPUT_LIMITS.taskStateMax, 'task');
    const relationState = collectDigestBucket(sentences, activeKeywords.relationStateKeywords, PLANNER_INPUT_LIMITS.relationStateMax, 'relation');
    const unresolvedQuestions = collectDigestBucket(sentences, activeKeywords.unresolvedKeywords, PLANNER_INPUT_LIMITS.unresolvedQuestionsMax, 'question');
    return sanitizeNormalizedSummary({
        stableContext: buildStableContext(sentences, taskState, relationState),
        taskState,
        relationState,
        unresolvedQuestions,
    });
}

/**
 * 功能：分析窗口文本，提取高信号事实与证据片段。
 * @param summaryText 窗口叙事文本。
 * @param actors 角色提示。
 * @returns 提纯后的窗口结果。
 */
function analyzeWindowSummary(summaryText: string, actors: string[], activeKeywords: PlannerActiveKeywordSets): {
    windowFacts: string[];
    evidenceSnippets: string[];
} {
    const sentences = splitChineseSentences(summaryText);
    const windowFacts = dedupeStrings(
        sentences
            .map((sentence) => ({ sentence, score: scoreFactSentence(sentence, activeKeywords.factPriorityRules) }))
            .filter((item) => item.score > 0)
            .sort((left, right) => right.score - left.score)
            .map((item) => rewriteFactSentence(item.sentence, actors, activeKeywords.factPriorityRules))
            .filter(Boolean),
    ).slice(0, PLANNER_INPUT_LIMITS.windowFactsMax);
    const evidenceSnippets = dedupeStrings(
        sentences
            .filter((sentence) => sentence.length >= 8 && sentence.length <= PLANNER_INPUT_LIMITS.evidenceSnippetMaxChars)
            .filter((sentence) => containsAny(sentence, activeKeywords.evidenceSnippetKeywords)),
    ).slice(0, PLANNER_INPUT_LIMITS.evidenceSnippetsMax);
    return { windowFacts, evidenceSnippets };
}

/**
 * 功能：从历史摘要数组构建滚动摘要状态块。
 * @param recentSummaryDigest 历史摘要数组。
 * @param windowFacts 当前窗口事实。
 * @returns 滚动摘要。
 */
function buildRollingDigest(
    recentSummaryDigest: SummaryMutationContext['recentSummaryDigest'],
    windowFacts: string[],
    narrativeStyle: ResolvedNarrativeStyle,
): LightweightPlannerInput['rollingDigest'] {
    if (recentSummaryDigest.length <= 0) {
        return normalizeSummarySnapshot({
            content: windowFacts.join('。'),
            narrativeStyle,
        });
    }
    return normalizeSummarySnapshot({
        title: recentSummaryDigest[0].title,
        content: recentSummaryDigest[0].content,
        normalizedSummary: recentSummaryDigest[0].normalizedSummary,
        narrativeStyle,
    });
}

/**
 * 功能：构建本地信号包。
 * @param detectedSignals 检测信号。
 * @param plannerHints 默认 planner 提示。
 * @param windowFacts 当前窗口事实。
 * @param rollingDigest 历史滚动摘要。
 * @param candidateCards 候选卡片。
 * @returns 信号包。
 */
function buildSignalPack(
    detectedSignals: SummaryMutationContext['detectedSignals'],
    plannerHints: SummaryPlannerOutput,
    windowFacts: string[],
    rollingDigest: LightweightPlannerInput['rollingDigest'],
    candidateCards: LightweightPlannerInput['candidateCards'],
    activeKeywords: PlannerActiveKeywordSets,
): LightweightPlannerInput['signalPack'] {
    const evidenceSignals = dedupeStrings(
        activeKeywords.evidenceSignalLabels
            .filter((item) => windowFacts.some((fact) => item.keywords.some((keyword) => fact.includes(keyword))))
            .map((item) => item.label),
    ).slice(0, PLANNER_INPUT_LIMITS.evidenceSignalsMax);
    const focusPoints = dedupeStrings([
        evidenceSignals.includes('确认任务推进') || rollingDigest.taskState.length > 0 ? '任务是否进入新的正式推进阶段' : '',
        evidenceSignals.includes('明确拒绝') ? '明确拒绝是否构成任务或关系状态变化' : '',
        evidenceSignals.includes('提出条件') || evidenceSignals.includes('要求补充信息') ? '新条件是否改变当前交涉边界' : '',
        rollingDigest.unresolvedQuestions.length > 0 ? '长期未决问题是否出现新的确认线索' : '',
        plannerHints.topics.length > 0 ? `当前主题是否继续聚焦${plannerHints.topics.slice(0, 2).join('、')}` : '',
    ]).slice(0, PLANNER_INPUT_LIMITS.focusPointsMax);
    const candidateTypes = dedupeStrings([
        ...candidateCards.map((card) => card.type),
        ...detectedSignals.candidateTypes,
        ...plannerHints.focus_types,
    ]).slice(0, PLANNER_INPUT_LIMITS.candidateTypesMax);
    return {
        candidateTypes,
        focusPoints,
        evidenceSignals,
        shouldUpdate: evidenceSignals.length > 0 || plannerHints.should_update,
    };
}

/**
 * 功能：将完整候选记录压缩为轻量候选卡片，并做代表性去重。
 * @param candidateRecords 完整候选记录。
 * @param actors 角色提示。
 * @param windowFacts 当前窗口事实。
 * @returns 候选卡片。
 */
function buildPlannerCandidateCards(
    candidateRecords: SummaryCandidateRecord[],
    actors: string[],
    windowFacts: string[],
): LightweightPlannerInput['candidateCards'] {
    const perTypeCount = new Map<string, number>();
    const cards: LightweightPlannerInput['candidateCards'] = [];
    for (const rec of candidateRecords) {
        const type = String(rec.targetKind ?? '').trim() || 'other';
        if ((perTypeCount.get(type) ?? 0) >= 2) {
            continue;
        }
        const brief = truncateChineseText(renderCandidateBrief(type, rec.title, rec.summary, rec.entityKeys ?? [], actors), PLANNER_INPUT_LIMITS.candidateCardBriefMaxChars);
        const whyRelevant = buildWhyRelevant(rec, windowFacts).slice(0, PLANNER_INPUT_LIMITS.whyRelevantMax);
        if (!brief || cards.some((card) => card.type === type && card.brief === brief)) {
            continue;
        }
        cards.push({
            id: rec.candidateId || `cand_${cards.length + 1}`,
            type,
            brief,
            entities: rec.entityKeys ?? [],
            state: rec.status ?? 'active',
            whyRelevant,
        });
        perTypeCount.set(type, (perTypeCount.get(type) ?? 0) + 1);
        if (cards.length >= PLANNER_INPUT_LIMITS.candidateCardsMax) {
            break;
        }
    }
    return cards;
}

/**
 * 功能：构建上下文裁剪后的 allowedTypes。
 * @param signalTypes 信号类型。
 * @param cardTypes 卡片类型。
 * @param schemaTypes Schema 类型。
 * @returns 裁剪结果。
 */
function buildAllowedTypes(signalTypes: string[], cardTypes: string[], schemaTypes: string[]): string[] {
    const signalSet = new Set(signalTypes);
    const cardSet = new Set(cardTypes);
    const ordered = [
        ...schemaTypes.filter((type) => signalSet.has(type) && cardSet.has(type)),
        ...schemaTypes.filter((type) => !signalSet.has(type) && cardSet.has(type)),
        ...schemaTypes.filter((type) => signalSet.has(type) && !cardSet.has(type)),
    ];
    if (ordered.length <= 0) {
        return schemaTypes.slice(0, PLANNER_INPUT_LIMITS.allowedTypesMax);
    }
    return dedupeStrings(ordered).slice(0, PLANNER_INPUT_LIMITS.allowedTypesMax);
}

/**
 * 功能：施加 Planner 输入总体积预算。
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
    while (input.window.evidenceSnippets.length > 1 && size > maxChars) {
        input.window.evidenceSnippets.pop();
        size = JSON.stringify(input).length;
    }
    while (input.rollingDigest.unresolvedQuestions.length > 1 && size > maxChars) {
        input.rollingDigest.unresolvedQuestions.pop();
        size = JSON.stringify(input).length;
    }
    while (input.window.windowFacts.length > 3 && size > maxChars) {
        input.window.windowFacts.pop();
        size = JSON.stringify(input).length;
    }
    return input;
}

/**
 * 功能：按句号等分隔中文句子。
 * @param text 原始文本。
 * @returns 句子列表。
 */
function splitChineseSentences(text: string): string[] {
    return String(text ?? '')
        .split(/[。！？\n]+/)
        .map((sentence) => normalizeChineseText(sentence))
        .filter((sentence) => sentence.length >= 4);
}

/**
 * 功能：按规则给句子打分，筛掉低信息量描写。
 * @param sentence 原句。
 * @returns 分数。
 */
function scoreFactSentence(sentence: string, factPriorityRules: Record<string, string[]>): number {
    const normalized = normalizeChineseText(sentence);
    let score = 0;
    for (const keywords of Object.values(factPriorityRules)) {
        if (keywords.some((keyword) => normalized.includes(keyword))) {
            score += 2;
        }
    }
    if (/[“”"'‘’：:]/u.test(normalized)) {
        score -= 1;
    }
    if (/低低笑|目光|空气|沉默|安静|危险的缝|异色瞳|残忍/u.test(normalized)) {
        score -= 2;
    }
    if (normalized.length < 6 || normalized.length > 80) {
        score -= 1;
    }
    return score;
}

/**
 * 功能：把原句重写成短事实。
 * @param sentence 原句。
 * @param actors 角色提示。
 * @returns 事实句。
 */
function rewriteFactSentence(sentence: string, actors: string[], factPriorityRules: Record<string, string[]>): string {
    const normalized = normalizeChineseText(sentence);
    const subject = resolveSentenceSubject(normalized, actors);
    if (containsAny(normalized, factPriorityRules.reject)) {
        return `${subject}拒绝${extractTailAfterKeyword(normalized, factPriorityRules.reject, '相关提议')}`;
    }
    if (containsAny(normalized, factPriorityRules.accept) && containsAny(normalized, factPriorityRules.transaction)) {
        return `${subject}收下定金，但未确认正式委托`;
    }
    if (containsAny(normalized, factPriorityRules.demand)) {
        return `${subject}要求${extractTailAfterKeyword(normalized, factPriorityRules.demand, '对方补充已知信息')}`;
    }
    if (containsAny(normalized, factPriorityRules.transaction)
        || containsAny(normalized, factPriorityRules.movement)
        || containsAny(normalized, factPriorityRules.relation)) {
        return `${subject}${extractTailAfterKeyword(normalized, [
            ...factPriorityRules.transaction,
            ...factPriorityRules.movement,
            ...factPriorityRules.relation,
        ], '出现新的状态变化')}`;
    }
    return truncateChineseText(normalized, 36);
}

/**
 * 功能：从句子中推断主语。
 * @param sentence 原句。
 * @param actors 角色提示。
 * @returns 主语。
 */
function resolveSentenceSubject(sentence: string, actors: string[]): string {
    const matchedActor = actors.find((actor) => actor && sentence.includes(actor));
    if (matchedActor) {
        return matchedActor;
    }
    const prefix = sentence.match(/^[^，,。；：:]{1,8}/u)?.[0] ?? '';
    if (prefix && prefix.length <= 6 && !containsAny(prefix, ['如果', '因为', '但是', '而且'])) {
        return prefix;
    }
    return '当前交涉';
}

/**
 * 功能：判断文本是否包含任一关键词。
 * @param text 文本。
 * @param keywords 关键词。
 * @returns 是否命中。
 */
function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
}

/**
 * 功能：提取关键词后的尾部片段。
 * @param sentence 原句。
 * @param keywords 关键词。
 * @param fallback 兜底文本。
 * @returns 尾部片段。
 */
function extractTailAfterKeyword(sentence: string, keywords: string[], fallback: string): string {
    for (const keyword of keywords) {
        const index = sentence.indexOf(keyword);
        if (index < 0) {
            continue;
        }
        const tail = normalizeChineseText(sentence.slice(index));
        return truncateChineseText(tail || fallback, 18);
    }
    return fallback;
}

/**
 * 功能：收集摘要状态桶。
 * @param sentences 原句列表。
 * @param keywords 关键词。
 * @param maxItems 最大条数。
 * @param mode 输出模式。
 * @returns 状态桶。
 */
function collectDigestBucket(
    sentences: string[],
    keywords: string[],
    maxItems: number,
    mode: 'task' | 'relation' | 'question',
): string[] {
    const results: string[] = [];
    for (const sentence of sentences) {
        if (!containsAny(sentence, keywords)) {
            continue;
        }
        const compact = toDigestSentence(sentence, mode);
        if (!compact || results.includes(compact)) {
            continue;
        }
        results.push(compact);
        if (results.length >= maxItems) {
            break;
        }
    }
    return results;
}

/**
 * 功能：把原句压缩成滚动摘要短句。
 * @param sentence 原句。
 * @param mode 输出模式。
 * @returns 压缩短句。
 */
function toDigestSentence(sentence: string, mode: 'task' | 'relation' | 'question'): string {
    const normalized = normalizeChineseText(sentence);
    if (mode === 'question') {
        const base = normalized.replace(/^(但|且|而且|目前|现在|仍然|依旧)/u, '');
        return truncateChineseText(base.endsWith('不明') || base.endsWith('不足') ? base : `${base}仍待确认`, 28);
    }
    return truncateChineseText(normalized, 28);
}

/**
 * 功能：构建稳定上下文短句。
 * @param sentences 原句列表。
 * @param taskState 任务状态。
 * @param relationState 关系状态。
 * @returns 稳定上下文。
 */
function buildStableContext(sentences: string[], taskState: string[], relationState: string[]): string {
    const strongSentence = sentences.find((sentence) => containsAny(sentence, ['委托', '任务', '交涉', '交易', '合作', '关系']));
    if (strongSentence) {
        return truncateChineseText(strongSentence, 40);
    }
    return truncateChineseText(`${taskState[0] || '当前主线仍在推进'}，${relationState[0] || '关系状态暂无明显变化'}。`, 42);
}

/**
 * 功能：判断净化摘要是否有实际内容。
 * @param summary 摘要。
 * @returns 是否有内容。
 */
function hasNormalizedSummaryContent(summary: NormalizedSummaryDigest | undefined | null): boolean {
    if (!summary) {
        return false;
    }
    return Boolean(
        String(summary.stableContext ?? '').trim()
        || (summary.taskState ?? []).length
        || (summary.relationState ?? []).length
        || (summary.unresolvedQuestions ?? []).length,
    );
}

/**
 * 功能：清洗净化摘要字段。
 * @param summary 原始摘要。
 * @returns 清洗后的摘要。
 */
function sanitizeNormalizedSummary(summary: NormalizedSummaryDigest): NormalizedSummaryDigest {
    return {
        stableContext: truncateChineseText(normalizeChineseText(summary.stableContext), 48),
        taskState: dedupeStrings((summary.taskState ?? []).map((item) => truncateChineseText(normalizeChineseText(item), 28))).slice(0, PLANNER_INPUT_LIMITS.taskStateMax),
        relationState: dedupeStrings((summary.relationState ?? []).map((item) => truncateChineseText(normalizeChineseText(item), 28))).slice(0, PLANNER_INPUT_LIMITS.relationStateMax),
        unresolvedQuestions: dedupeStrings((summary.unresolvedQuestions ?? []).map((item) => truncateChineseText(normalizeChineseText(item), 28))).slice(0, PLANNER_INPUT_LIMITS.unresolvedQuestionsMax),
    };
}

/**
 * 功能：渲染候选卡片摘要。
 * @param type 类型。
 * @param title 标题。
 * @param summary 摘要。
 * @param entities 实体。
 * @param actors 角色提示。
 * @returns 卡片摘要。
 */
function renderCandidateBrief(type: string, title: string, summary: string, entities: string[], actors: string[]): string {
    const shortSummary = truncateChineseText(normalizeChineseText(summary || title), 40);
    if (type === 'task') {
        return `任务：${normalizeChineseText(title) || shortSummary}；状态：${shortSummary}`;
    }
    if (type === 'relationship') {
        const source = entities[0] || actors[0] || normalizeChineseText(title) || '相关角色';
        const target = entities[1] || actors[1] || '对方';
        return `${source}对${target}：${shortSummary}`;
    }
    if (type === 'event' || type === 'actor_visible_event') {
        return `事件：${normalizeChineseText(title) || shortSummary}；结果：${shortSummary}`;
    }
    if (type === 'location' || type === 'scene_shared_state') {
        return `地点：${normalizeChineseText(title) || shortSummary}；作用：${shortSummary}`;
    }
    if (type === 'world_global_state') {
        return `世界状态：${shortSummary}`;
    }
    return `${normalizeChineseText(title) || type}：${shortSummary}`;
}

/**
 * 功能：构建候选卡片相关性说明。
 * @param rec 候选记录。
 * @param windowFacts 当前窗口事实。
 * @returns 相关性说明。
 */
function buildWhyRelevant(rec: SummaryCandidateRecord, windowFacts: string[]): string[] {
    const reasons: string[] = [];
    if ((rec.entityKeys ?? []).length > 0) {
        reasons.push('命中核心实体');
    }
    if (windowFacts.some((fact) => overlapsByKeyword(fact, rec.summary))) {
        reasons.push('与当前窗口事实直接呼应');
    }
    if (containsAny(rec.summary, ['委托', '任务', '主线', '关系', '拒绝', '条件'])) {
        reasons.push('命中当前主线或状态变化');
    }
    if (reasons.length <= 0) {
        reasons.push('作为当前类型的代表候选');
    }
    return dedupeStrings(reasons);
}

/**
 * 功能：按关键词粗略判断两段文本是否重叠。
 * @param left 左文本。
 * @param right 右文本。
 * @returns 是否重叠。
 */
function overlapsByKeyword(left: string, right: string): boolean {
    const keywords = ['委托', '定金', '拒绝', '条件', '关系', '戒备', '地点', '任务', '事件'];
    return keywords.some((keyword) => left.includes(keyword) && String(right ?? '').includes(keyword));
}

/**
 * 功能：归一化普通对象。
 * @param value 原始值。
 * @returns 对象结果。
 */
function normalizeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：归一化中文文本。
 * @param value 原始值。
 * @returns 文本。
 */
function normalizeChineseText(value: unknown): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[，,；;：:]+|[，,；;：:]+$/g, '')
        .trim();
}

/**
 * 功能：按长度裁剪中文文本。
 * @param text 原文。
 * @param maxLength 最大长度。
 * @returns 裁剪结果。
 */
function truncateChineseText(text: string, maxLength: number): string {
    const normalized = normalizeChineseText(text);
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength)}…`;
}
