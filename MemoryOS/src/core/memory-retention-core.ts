import type { RetentionStage, RetentionState } from '../memory-retention/retention-types';
import { readMemoryOSSettings } from '../settings/store';
import type { MemorySemanticProjection } from './memory-semantic';

export type MemoryForgottenLevel = 'active' | 'shadow_forgotten' | 'hard_forgotten';

export interface MemoryRetentionProjection {
    retentionScore: number;
    retrievalWeight: number;
    promptRenderStage: RetentionStage;
    forgottenLevel: MemoryForgottenLevel;
    shadowTriggered: boolean;
    canRecall: boolean;
    shadowRecallPenalty: number;
    shadowConfidencePenalty: number;
    rawMemoryPercent: number;
    effectiveMemoryPercent: number;
    explainReasonCodes: string[];
    distortionTemplateId?: string;
}

export interface MemoryRetentionCoreInput {
    forgotten?: unknown;
    memoryPercent?: unknown;
    importance?: unknown;
    rehearsalCount?: unknown;
    recencyHours?: unknown;
    actorMemoryStat?: unknown;
    relationSensitivity?: unknown;
    title?: unknown;
    summary?: unknown;
    compareKey?: unknown;
    aliasTexts?: unknown;
    actorKeys?: unknown;
    relationKeys?: unknown;
    participantActorKeys?: unknown;
    locationKey?: unknown;
    worldKeys?: unknown;
    semantic?: MemorySemanticProjection;
    query?: unknown;
}

/**
 * 功能：统一投影读侧共享的 retention core。
 * @param input retention 输入。
 * @returns 统一 retention 投影。
 */
export function projectMemoryRetentionCore(input: MemoryRetentionCoreInput): MemoryRetentionProjection {
    const settings = readMemoryOSSettings();
    const rawMemoryPercent = clampPercent(input.memoryPercent);
    const isForgottenPersisted = input.forgotten === true;
    const hasRecallAnchors = resolveRecallAnchorCount(input) > 0;
    const shadowTriggered = isForgottenPersisted && hasRecallAnchors
        ? shouldTriggerShadowRecallByInput(input.query, input)
        : false;
    const forgottenLevel: MemoryForgottenLevel = !isForgottenPersisted
        ? 'active'
        : hasRecallAnchors
            ? 'shadow_forgotten'
            : 'hard_forgotten';

    const importance = clampPercent(input.importance ?? rawMemoryPercent);
    const rehearsalCount = Math.max(0, Math.floor(Number(input.rehearsalCount ?? 0) || 0));
    const actorMemoryStat = clampPercent(input.actorMemoryStat ?? rawMemoryPercent);
    const relationSensitivity = clampPercent(input.relationSensitivity ?? 50);
    const recencyHours = clampPositiveNumber(input.recencyHours ?? 24 * 30);
    const recencyScore = recencyHours <= 0 ? 100 : Math.max(0, 100 - Math.min(100, recencyHours / 6));
    const rehearsalScore = Math.min(100, rehearsalCount * 12);
    const retentionScore = clampPercent(
        (rawMemoryPercent * 0.32)
        + (importance * 0.22)
        + (actorMemoryStat * 0.18)
        + (relationSensitivity * 0.12)
        + (rehearsalScore * 0.1)
        + (recencyScore * 0.06),
    );
    const basePromptRenderStage = resolvePromptRenderStage(
        retentionScore,
        settings.retentionDistortedThreshold,
        settings.retentionBlurThreshold,
    );
    const shadowHeavy = rawMemoryPercent <= settings.retentionDistortedThreshold;
    const shadowRecallPenalty = forgottenLevel !== 'shadow_forgotten'
        ? 0
        : shadowHeavy
            ? settings.retentionShadowRetrievalPenaltyHeavy
            : settings.retentionShadowRetrievalPenaltyMild;
    const shadowConfidencePenalty = forgottenLevel !== 'shadow_forgotten'
        ? 0
        : shadowHeavy
            ? settings.retentionShadowConfidencePenaltyHeavy
            : settings.retentionShadowConfidencePenaltyMild;
    const promptRenderStage = applyForgottenStageFloor(basePromptRenderStage, forgottenLevel, shadowHeavy);
    const canRecall = forgottenLevel === 'active' || (forgottenLevel === 'shadow_forgotten' && shadowTriggered);
    const retrievalWeight = resolveRetrievalWeight({
        forgottenLevel,
        shadowTriggered,
        retentionScore,
        shadowRecallPenalty,
    });
    const effectiveMemoryPercent = clampPercent(Math.round(retrievalWeight * 100));
    const explainReasonCodes = buildExplainReasonCodes({
        forgottenLevel,
        shadowTriggered,
        promptRenderStage,
        rawMemoryPercent,
        importance,
        rehearsalCount,
        recencyHours,
        actorMemoryStat,
        relationSensitivity,
        shadowRecallPenalty,
    });

    return {
        retentionScore,
        retrievalWeight,
        promptRenderStage,
        forgottenLevel,
        shadowTriggered,
        canRecall,
        shadowRecallPenalty,
        shadowConfidencePenalty,
        rawMemoryPercent,
        effectiveMemoryPercent,
        explainReasonCodes,
        distortionTemplateId: promptRenderStage === 'distorted'
            ? resolveDistortionTemplateId(relationSensitivity, importance)
            : undefined,
    };
}

/**
 * 功能：兼容旧 retention state 输出。
 * @param projection retention 投影。
 * @param input 原始输入。
 * @returns 兼容 retention state。
 */
export function buildRetentionStateFromProjection(
    projection: MemoryRetentionProjection,
    input: Pick<MemoryRetentionCoreInput, 'rehearsalCount'>,
): RetentionState {
    return {
        stage: projection.promptRenderStage,
        score: projection.retentionScore,
        forgetProbability: clamp01(1 - projection.retrievalWeight),
        rehearsalCount: Math.max(0, Math.floor(Number(input.rehearsalCount ?? 0) || 0)),
        reasonCodes: projection.explainReasonCodes,
        distortionTemplateId: projection.distortionTemplateId,
    };
}

/**
 * 功能：兼容旧影子召回判定。
 * @param query 查询文本。
 * @param candidate 候选信息。
 * @returns 是否被强相关问题唤起。
 */
export function shouldTriggerShadowRecallByInput(
    query: unknown,
    candidate: Pick<MemoryRetentionCoreInput, 'title' | 'summary' | 'compareKey' | 'aliasTexts' | 'actorKeys' | 'relationKeys' | 'participantActorKeys' | 'locationKey' | 'worldKeys' | 'semantic'>,
): boolean {
    const normalizedQuery = normalizeText(query).toLowerCase();
    if (!normalizedQuery) {
        return false;
    }

    const directAnchors = [
        candidate.title,
        candidate.compareKey,
        candidate.locationKey,
        candidate.semantic?.goalOrObjective,
        candidate.semantic?.finalOutcome,
        candidate.semantic?.currentState,
        ...toStringArray(candidate.aliasTexts),
        ...toStringArray(candidate.actorKeys),
        ...toStringArray(candidate.relationKeys),
        ...toStringArray(candidate.participantActorKeys),
        ...toStringArray(candidate.worldKeys),
    ]
        .map((item: unknown): string => normalizeText(item).toLowerCase())
        .filter((item: string): boolean => item.length >= 2);

    if (directAnchors.some((anchor: string): boolean => normalizedQuery.includes(anchor))) {
        return true;
    }

    const compactQuery = normalizedQuery.replace(/\s+/g, '');
    if (compactQuery.length >= 4 && directAnchors.some((anchor: string): boolean => anchor.includes(compactQuery))) {
        return true;
    }

    const summary = normalizeText(candidate.summary).toLowerCase();
    if (summary.length >= 8 && compactQuery.length >= 4 && (summary.includes(compactQuery) || compactQuery.includes(summary.slice(0, Math.min(summary.length, 12))))) {
        return true;
    }

    const queryTokens = splitLooseTokens(normalizedQuery);
    if (queryTokens.length <= 0) {
        return false;
    }
    const anchorTokenHits = queryTokens.filter((token: string): boolean => {
        return directAnchors.some((anchor: string): boolean => anchor.includes(token));
    });
    return anchorTokenHits.length >= 2;
}

function resolveRetrievalWeight(input: {
    forgottenLevel: MemoryForgottenLevel;
    shadowTriggered: boolean;
    retentionScore: number;
    shadowRecallPenalty: number;
}): number {
    if (input.forgottenLevel === 'hard_forgotten') {
        return 0;
    }
    if (input.forgottenLevel === 'shadow_forgotten' && !input.shadowTriggered) {
        return 0;
    }
    const base = clamp01(input.retentionScore / 100);
    if (input.forgottenLevel !== 'shadow_forgotten') {
        return base;
    }
    return clamp01(base * (1 - input.shadowRecallPenalty));
}

function applyForgottenStageFloor(
    stage: RetentionStage,
    forgottenLevel: MemoryForgottenLevel,
    shadowHeavy: boolean,
): RetentionStage {
    if (forgottenLevel === 'hard_forgotten') {
        return 'distorted';
    }
    if (forgottenLevel === 'shadow_forgotten' && shadowHeavy) {
        return 'distorted';
    }
    if (forgottenLevel === 'shadow_forgotten' && stage === 'clear') {
        return 'blur';
    }
    return stage;
}

function resolvePromptRenderStage(score: number, distortedThreshold: number, blurThreshold: number): RetentionStage {
    if (score <= distortedThreshold) {
        return 'distorted';
    }
    if (score <= blurThreshold) {
        return 'blur';
    }
    return 'clear';
}

function buildExplainReasonCodes(input: {
    forgottenLevel: MemoryForgottenLevel;
    shadowTriggered: boolean;
    promptRenderStage: RetentionStage;
    rawMemoryPercent: number;
    importance: number;
    rehearsalCount: number;
    recencyHours: number;
    actorMemoryStat: number;
    relationSensitivity: number;
    shadowRecallPenalty: number;
}): string[] {
    const result: string[] = [];
    result.push(`retention_stage_${input.promptRenderStage}`);
    result.push(`forgotten_level_${input.forgottenLevel}`);
    if (input.shadowTriggered) {
        result.push('shadow_recall_triggered');
    }
    if (input.forgottenLevel === 'shadow_forgotten' && input.shadowRecallPenalty > 0) {
        result.push('shadow_recall_penalized');
    }
    if (input.rehearsalCount >= 3) {
        result.push('rehearsal_boosted');
    }
    if (input.recencyHours >= 24 * 14) {
        result.push('recency_weakened');
    }
    if (input.importance >= 75) {
        result.push('importance_high');
    }
    if (input.actorMemoryStat <= 35) {
        result.push('actor_memory_low');
    }
    if (input.relationSensitivity >= 75) {
        result.push('relation_sensitive');
    }
    if (input.rawMemoryPercent <= 12) {
        result.push('memory_percent_critical_low');
    } else if (input.rawMemoryPercent <= 35) {
        result.push('memory_percent_low');
    }
    return result;
}

function resolveRecallAnchorCount(input: MemoryRetentionCoreInput): number {
    const anchors = [
        input.title,
        input.summary,
        input.compareKey,
        input.locationKey,
        input.semantic?.currentState,
        input.semantic?.finalOutcome,
        input.semantic?.goalOrObjective,
        ...toStringArray(input.aliasTexts),
        ...toStringArray(input.actorKeys),
        ...toStringArray(input.relationKeys),
        ...toStringArray(input.participantActorKeys),
        ...toStringArray(input.worldKeys),
    ];
    return anchors.map((item: unknown): string => normalizeText(item)).filter(Boolean).length;
}

function resolveDistortionTemplateId(relationSensitivity: number, importance: number): string {
    if (relationSensitivity >= 70) {
        return 'relationship_attitude_shift';
    }
    if (importance >= 70) {
        return 'critical_fact_fragmented';
    }
    return 'generic_memory_drift';
}

function splitLooseTokens(value: string): string[] {
    return Array.from(new Set(
        String(value ?? '')
            .split(/[\s,，。！？；：、"'“”‘’()（）【】\[\]\-_/]+/)
            .map((item: string): string => item.trim().toLowerCase())
            .filter((item: string): boolean => item.length >= 2),
    ));
}

function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): string => normalizeText(item)).filter(Boolean);
}

function clampPercent(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function clampPositiveNumber(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return 0;
    }
    return numeric;
}

function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}
