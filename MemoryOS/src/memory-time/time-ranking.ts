/**
 * 功能：检索和注入时的时间加权计算。
 */

import type { RetrievalCandidate } from '../memory-retrieval/types';
import { projectMemorySemanticRecord } from '../core/memory-semantic';
import type { MemoryTimeContext, MemoryTimeIndex, PromptTimeMeta } from './time-types';

export type QueryTimeIntent =
    | 'none'
    | 'recent'
    | 'early'
    | 'final_outcome'
    | 'current_state';

export interface TemporalIntentBreakdown {
    intent: QueryTimeIntent;
    timeBoost: number;
    stateBoost: number;
    outcomeBoost: number;
    featureScore: number;
    temporalWeight: number;
    finalScore: number;
    explanation: string;
}

const RECENT_QUERY_KEYWORDS = [
    '最近', '刚刚', '刚才', '最新', '这几天', '方才', '眼下刚', '近日', '近来', '近期',
];

const EARLY_QUERY_KEYWORDS = [
    '最早', '当初', '一开始', '以前', '小时候', '当年', '曾经', '原本', '过去', '从前', '起初', '刚认识', '第一次',
];

const FINAL_OUTCOME_QUERY_KEYWORDS = [
    '最后', '最终', '后来', '结果如何', '最后怎么样', '结局', '收场', '下场', '到最后', '后来怎么样', '最终怎样', '最终结果',
];

const CURRENT_STATE_QUERY_KEYWORDS = [
    '现在', '当前', '目前', '眼下', '如今', '现在如何', '当前情况', '目前状态', '当前状态', '目前进展', '现在怎么样',
];

const OUTCOME_FIELD_KEYWORDS = ['result', 'outcome', 'resolution', 'resolved', 'completed', '结局', '结果', '收场', '最终', '后来'];
const STATE_FIELD_KEYWORDS = ['state', 'status', 'stage', 'phase', 'ongoing', 'current', 'latest', '状态', '阶段', '进展', '现状'];
const OUTCOME_TEXT_KEYWORDS = ['完成', '解决', '落幕', '收场', '结局', '结果', '最终', '后来', '已结束', 'resolved', 'completed', 'final'];
const STATE_TEXT_KEYWORDS = ['现在', '当前', '目前', 'ongoing', 'current', 'still', '现状', '状态', '进展'];

/**
 * 功能：判断查询是否偏近期。
 * @param query 查询文本。
 * @returns 是否偏近期。
 */
export function isRecentQuery(query: string): boolean {
    return resolveQueryTimeIntent(query) === 'recent';
}

/**
 * 功能：判断查询是否偏远期。
 * @param query 查询文本。
 * @returns 是否偏远期。
 */
export function isEarlyQuery(query: string): boolean {
    return resolveQueryTimeIntent(query) === 'early';
}

/**
 * 功能：统一解析查询的时间意图。
 * @param query 查询文本。
 * @returns 时间意图。
 */
export function resolveQueryTimeIntent(query: string): QueryTimeIntent {
    const text = normalizeText(query);
    if (!text) {
        return 'none';
    }
    if (FINAL_OUTCOME_QUERY_KEYWORDS.some((kw) => text.includes(kw))) {
        return 'final_outcome';
    }
    if (CURRENT_STATE_QUERY_KEYWORDS.some((kw) => text.includes(kw))) {
        return 'current_state';
    }
    if (RECENT_QUERY_KEYWORDS.some((kw) => text.includes(kw))) {
        return 'recent';
    }
    if (EARLY_QUERY_KEYWORDS.some((kw) => text.includes(kw))) {
        return 'early';
    }
    return 'none';
}

/**
 * 功能：为近期记忆计算增益。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 0~1 增益值。
 */
export function boostRecent(timeCtx: MemoryTimeContext, currentMaxFloor: number): number {
    const floor = timeCtx.sequenceTime.lastFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const recencyRatio = floor / maxFloor;
    return Math.min(1, recencyRatio * 0.8 + 0.1);
}

/**
 * 功能：为远期记忆计算增益。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 0~1 增益值。
 */
export function boostEarly(timeCtx: MemoryTimeContext, currentMaxFloor: number): number {
    const floor = timeCtx.sequenceTime.firstFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const earlyRatio = 1 - (floor / maxFloor);
    return Math.min(1, earlyRatio * 0.7 + 0.15);
}

/**
 * 功能：计算候选是否更像状态型条目。
 * @param candidate 检索候选。
 * @returns 0~1 加分。
 */
export function computeStateLikeBoost(candidate?: RetrievalCandidate | null): number {
    if (!candidate) {
        return 0;
    }
    const payload = toRecord(candidate.detailPayload);
    const fields = toRecord(payload.fields);
    const lifecycle = toRecord(payload.lifecycle);
    const schemaId = normalizeText(candidate.schemaId);
    const semantic = candidate.semantic ?? projectMemorySemanticRecord({
        entryType: candidate.schemaId,
        ongoing: candidate.ongoing,
        detailPayload: candidate.detailPayload,
    });
    let score = 0;

    if (semantic?.isOngoing === true) {
        score += 0.38;
    }
    if (semantic?.semanticKind === 'state' || semantic?.semanticKind === 'task_progress' || ['relationship', 'summary', 'location'].includes(schemaId)) {
        score += 0.18;
    }
    if (hasMeaningfulValue(semantic?.currentState) || hasMeaningfulValue(fields.status) || hasMeaningfulValue(fields.stage) || hasMeaningfulValue(payload.state) || hasMeaningfulValue(payload.status)) {
        score += 0.26;
    }
    if (hasMeaningfulValue(lifecycle.status) || hasMeaningfulValue(lifecycle.stage)) {
        score += 0.16;
    }
    if (containsAnyKeyword(candidate, STATE_TEXT_KEYWORDS) || containsAnyKeyword(payload, STATE_FIELD_KEYWORDS)) {
        score += 0.12;
    }
    return clamp01(score);
}

/**
 * 功能：计算候选是否更像结果型条目。
 * @param candidate 检索候选。
 * @returns 0~1 加分。
 */
export function computeOutcomeLikeBoost(candidate?: RetrievalCandidate | null): number {
    if (!candidate) {
        return 0;
    }
    const payload = toRecord(candidate.detailPayload);
    const fields = toRecord(payload.fields);
    const lifecycle = toRecord(payload.lifecycle);
    const schemaId = normalizeText(candidate.schemaId);
    const semantic = candidate.semantic ?? projectMemorySemanticRecord({
        entryType: candidate.schemaId,
        ongoing: candidate.ongoing,
        detailPayload: candidate.detailPayload,
    });
    let score = 0;

    if (semantic?.semanticKind === 'event' || semantic?.semanticKind === 'task_progress' || ['relationship', 'summary'].includes(schemaId)) {
        score += 0.18;
    }
    if (hasMeaningfulValue(semantic?.finalOutcome) || hasMeaningfulValue(fields.outcome) || hasMeaningfulValue(fields.result) || hasMeaningfulValue(fields.resolution)) {
        score += 0.34;
    }
    if (hasMeaningfulValue(payload.outcome) || hasMeaningfulValue(payload.result) || hasMeaningfulValue(payload.resolution)) {
        score += 0.24;
    }
    if (isCompletedLike(lifecycle.status) || isCompletedLike(fields.status) || isCompletedLike(payload.status)) {
        score += 0.22;
    }
    if (containsAnyKeyword(candidate, OUTCOME_TEXT_KEYWORDS) || containsAnyKeyword(payload, OUTCOME_FIELD_KEYWORDS)) {
        score += 0.12;
    }
    return clamp01(score);
}

/**
 * 功能：计算带意图的时间加权细节。
 * @param query 查询文本。
 * @param timeCtx 记忆时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @param candidate 可选候选。
 * @returns 时间意图细节。
 */
export function computeTemporalIntentBoost(
    query: string,
    timeCtx: MemoryTimeContext | undefined,
    currentMaxFloor: number,
    candidate?: RetrievalCandidate | null,
): TemporalIntentBreakdown {
    const intent = resolveQueryTimeIntent(query);
    const stateBoost = computeStateLikeBoost(candidate);
    const outcomeBoost = computeOutcomeLikeBoost(candidate);
    const timeBoost = timeCtx ? resolveIntentTimeBoost(intent, timeCtx, currentMaxFloor) : 0;
    const temporalWeight = resolveTemporalWeight(intent);
    const featureScore = resolveFeatureScore(intent, timeBoost, stateBoost, outcomeBoost);
    const baseFeature = timeBoost > 0 ? timeBoost : Math.max(stateBoost, outcomeBoost);
    const finalScore = temporalWeight > 0
        ? clamp01(baseFeature * (1 - temporalWeight) + featureScore * temporalWeight)
        : clamp01(baseFeature);
    return {
        intent,
        timeBoost: clamp01(timeBoost),
        stateBoost: clamp01(stateBoost),
        outcomeBoost: clamp01(outcomeBoost),
        featureScore: clamp01(featureScore),
        temporalWeight,
        finalScore,
        explanation: buildTemporalExplanation({
            intent,
            timeBoost,
            stateBoost,
            outcomeBoost,
            temporalWeight,
        }),
    };
}

/**
 * 功能：兼容旧接口，输出最终时间得分。
 * @param query 查询文本。
 * @param timeCtx 记忆时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @param candidate 可选候选。
 * @returns 时间得分。
 */
export function computeTimeBoost(
    query: string,
    timeCtx: MemoryTimeContext,
    currentMaxFloor: number,
    candidate?: RetrievalCandidate | null,
): number {
    return computeTemporalIntentBoost(query, timeCtx, currentMaxFloor, candidate).finalScore;
}

/**
 * 功能：构建时间解释文本。
 * @param input 解释输入。
 * @returns 解释文本。
 */
export function buildTemporalExplanation(input: {
    intent: QueryTimeIntent;
    timeBoost: number;
    stateBoost: number;
    outcomeBoost: number;
    temporalWeight: number;
}): string {
    if (input.intent === 'none') {
        return '未命中时间意图';
    }
    const parts = [`意图=${input.intent}`];
    if (input.timeBoost > 0) {
        parts.push(`time=${input.timeBoost.toFixed(3)}`);
    }
    if (input.stateBoost > 0) {
        parts.push(`state=${input.stateBoost.toFixed(3)}`);
    }
    if (input.outcomeBoost > 0) {
        parts.push(`outcome=${input.outcomeBoost.toFixed(3)}`);
    }
    if (input.temporalWeight > 0) {
        parts.push(`weight=${input.temporalWeight.toFixed(3)}`);
    }
    return parts.join(' / ');
}

/**
 * 功能：生成时间索引辅助字段。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间索引。
 */
export function buildTimeIndex(timeCtx: MemoryTimeContext, currentMaxFloor: number): MemoryTimeIndex {
    const sequenceOrder = timeCtx.sequenceTime.orderIndex;
    const floor = timeCtx.sequenceTime.lastFloor;
    const maxFloor = Math.max(1, currentMaxFloor);
    const ratio = floor / maxFloor;

    let recencyBucket: 'recent' | 'mid' | 'old';
    if (ratio >= 0.7) {
        recencyBucket = 'recent';
    } else if (ratio >= 0.3) {
        recencyBucket = 'mid';
    } else {
        recencyBucket = 'old';
    }

    const timeLabel = buildTimeLabel(timeCtx, currentMaxFloor);

    return {
        sequenceOrder,
        recencyBucket,
        timeLabel,
    };
}

/**
 * 功能：生成人类可读的时间标签。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间标签文本。
 */
export function buildTimeLabel(timeCtx: MemoryTimeContext, currentMaxFloor: number): string {
    if (timeCtx.mode === 'story_explicit') {
        const st = timeCtx.storyTime;
        if (st?.absoluteText) return st.absoluteText;
        if (st?.relativeText) return st.relativeText;
    }

    if (timeCtx.mode === 'story_inferred') {
        if (timeCtx.durationHint?.text) return `推断：${timeCtx.durationHint.text}`;
        if (timeCtx.storyTime?.relativeText) return `推断：${timeCtx.storyTime.relativeText}`;
    }

    const floorDiff = currentMaxFloor - timeCtx.sequenceTime.lastFloor;
    if (floorDiff <= 5) return '近期';
    if (floorDiff <= 20) return `较当前早约${floorDiff}层`;
    return `早期内容（约${floorDiff}层前）`;
}

/**
 * 功能：为提示词注入构建 AI 可读时间元信息。
 * @param timeCtx 时间上下文。
 * @param currentMaxFloor 当前最大楼层号。
 * @returns 时间注入元信息。
 */
export function buildPromptTimeMeta(timeCtx: MemoryTimeContext, currentMaxFloor: number): PromptTimeMeta {
    const resolvedCurrentMaxFloor = Math.max(currentMaxFloor, timeCtx.sequenceTime.lastFloor, timeCtx.sequenceTime.firstFloor);
    const timeLabelForPrompt = buildTimeLabel(timeCtx, resolvedCurrentMaxFloor);
    const timeSourceLabel = resolvePromptTimeSourceLabel(timeCtx);
    const timeConfidenceLabel = shouldRenderPromptTimeConfidence(timeCtx)
        ? resolvePromptTimeConfidenceLabel(timeCtx.confidence)
        : undefined;
    return {
        timeLabelForPrompt,
        timeSourceLabel,
        timeConfidenceLabel,
        sourceMode: resolvePromptTimeSourceMode(timeCtx),
    };
}

function resolveIntentTimeBoost(intent: QueryTimeIntent, timeCtx: MemoryTimeContext, currentMaxFloor: number): number {
    switch (intent) {
        case 'recent':
            return boostRecent(timeCtx, currentMaxFloor);
        case 'early':
            return boostEarly(timeCtx, currentMaxFloor);
        case 'current_state':
            return boostRecent(timeCtx, currentMaxFloor) * 0.85;
        case 'final_outcome':
            return boostRecent(timeCtx, currentMaxFloor) * 0.65;
        default:
            return 0;
    }
}

function resolveTemporalWeight(intent: QueryTimeIntent): number {
    switch (intent) {
        case 'recent':
        case 'early':
            return 0.1;
        case 'current_state':
            return 0.15;
        case 'final_outcome':
            return 0.16;
        default:
            return 0;
    }
}

function resolveFeatureScore(
    intent: QueryTimeIntent,
    timeBoost: number,
    stateBoost: number,
    outcomeBoost: number,
): number {
    switch (intent) {
        case 'recent':
        case 'early':
            return clamp01(timeBoost);
        case 'current_state':
            return clamp01(timeBoost * 0.5 + stateBoost * 0.5);
        case 'final_outcome':
            return clamp01(timeBoost * 0.35 + outcomeBoost * 0.65);
        default:
            return 0;
    }
}

function resolvePromptTimeSourceLabel(timeCtx: MemoryTimeContext): string {
    if (timeCtx.mode === 'story_explicit') {
        return '明确故事时间';
    }
    if (timeCtx.mode === 'story_inferred') {
        return '推断时间';
    }
    return '系统时序';
}

function resolvePromptTimeSourceMode(timeCtx: MemoryTimeContext): PromptTimeMeta['sourceMode'] {
    if (timeCtx.mode === 'story_explicit') {
        return 'explicit_story';
    }
    if (timeCtx.mode === 'story_inferred') {
        return 'inferred_story';
    }
    return 'sequence_fallback';
}

function shouldRenderPromptTimeConfidence(timeCtx: MemoryTimeContext): boolean {
    return timeCtx.mode === 'story_inferred' || Number(timeCtx.confidence ?? 0) < 0.6;
}

function resolvePromptTimeConfidenceLabel(confidence: number): string {
    const normalized = Number(confidence ?? 0);
    if (normalized >= 0.78) {
        return '高';
    }
    if (normalized >= 0.5) {
        return '中';
    }
    return '低';
}

function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(6))));
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function hasMeaningfulValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return true;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value);
    }
    if (Array.isArray(value)) {
        return value.length > 0;
    }
    if (value && typeof value === 'object') {
        return Object.keys(toRecord(value)).length > 0;
    }
    return normalizeText(value).length > 0;
}

function isCompletedLike(value: unknown): boolean {
    const text = normalizeText(value);
    return ['completed', 'resolved', 'finished', 'done', 'closed', '结束', '完成', '解决', '已完成', '已解决'].some((kw) => text.includes(kw));
}

function containsAnyKeyword(target: unknown, keywords: string[]): boolean {
    const text = flattenText(target);
    return keywords.some((keyword) => text.includes(normalizeText(keyword)));
}

function flattenText(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return normalizeText(value);
    }
    if (Array.isArray(value)) {
        return value.map((item) => flattenText(item)).join(' ');
    }
    if (typeof value === 'object') {
        return Object.entries(toRecord(value))
            .flatMap(([key, item]) => [normalizeText(key), flattenText(item)])
            .join(' ');
    }
    return '';
}
