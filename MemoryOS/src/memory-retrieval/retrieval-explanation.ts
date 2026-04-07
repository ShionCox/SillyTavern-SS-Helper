import type { RetrievalResultItem, RetrievalScoreBreakdown } from './types';
import type { RetrievalMode } from './retrieval-mode';
import { resolveSemanticKindLabel, resolveVisibilityScopeLabel } from '../core/memory-semantic';

/**
 * 功能：单条检索结果的人类可读解释。
 * 说明：后续 lexical / vector / hybrid 统一使用此结构输出解释。
 */
export interface RetrievalExplanation {
    /** 候选 ID */
    candidateId: string;
    /** 候选标题 */
    candidateTitle: string;
    /** 最终得分 */
    score: number;
    /** 来源标识 */
    source: 'lexical' | 'vector' | 'graph_expansion' | 'coverage_supplement';
    /** 得分分解描述 */
    scoreBreakdown: string;
    /** 命中原因摘要 */
    reasonSummary: string;
}

/**
 * 功能：批量检索结果的整体解释。
 */
export interface RetrievalExplanationBundle {
    /** 本次使用的检索模式 */
    retrievalMode: RetrievalMode;
    /** 主 provider 标识 */
    providerId: string;
    /** 结果总数 */
    totalCount: number;
    /** 各条目解释 */
    items: RetrievalExplanation[];
    /** 整体摘要 */
    overallSummary: string;
}

/**
 * 功能：为单条检索结果生成人类可读解释。
 * @param item 检索结果项。
 * @returns 解释条目。
 */
export function buildRetrievalExplanation(item: RetrievalResultItem): RetrievalExplanation {
    const breakdown = item.breakdown;
    const source = inferSource(breakdown);
    const scoreBreakdown = formatScoreBreakdown(breakdown);
    const reasonSummary = buildReasonSummary(item, source);

    return {
        candidateId: item.candidate.candidateId,
        candidateTitle: item.candidate.title ?? '未命名',
        score: item.score,
        source,
        scoreBreakdown,
        reasonSummary,
    };
}

/**
 * 功能：为整组检索结果生成解释包。
 * @param items 检索结果列表。
 * @param mode 检索模式。
 * @param providerId provider 标识。
 * @returns 解释包。
 */
export function buildRetrievalExplanationBundle(
    items: RetrievalResultItem[],
    mode: RetrievalMode,
    providerId: string,
): RetrievalExplanationBundle {
    const explanations = items.map(buildRetrievalExplanation);
    const lexicalCount = explanations.filter((e) => e.source === 'lexical').length;
    const vectorCount = explanations.filter((e) => e.source === 'vector').length;
    const graphCount = explanations.filter((e) => e.source === 'graph_expansion').length;
    const coverageCount = explanations.filter((e) => e.source === 'coverage_supplement').length;

    const parts: string[] = [`共 ${items.length} 条结果`];
    if (lexicalCount > 0) parts.push(`词法命中 ${lexicalCount}`);
    if (vectorCount > 0) parts.push(`向量命中 ${vectorCount}`);
    if (graphCount > 0) parts.push(`图扩展 ${graphCount}`);
    if (coverageCount > 0) parts.push(`补召回 ${coverageCount}`);

    return {
        retrievalMode: mode,
        providerId,
        totalCount: items.length,
        items: explanations,
        overallSummary: parts.join('，') + '。',
    };
}

/**
 * 功能：推断检索结果来源。
 */
function inferSource(breakdown: RetrievalScoreBreakdown): RetrievalExplanation['source'] {
    if ((breakdown.graphBoost ?? 0) > 0 && breakdown.bm25 === 0 && breakdown.ngram === 0) {
        return 'graph_expansion';
    }
    if (breakdown.bm25 > 0 || breakdown.ngram > 0 || breakdown.editDistance > 0) {
        return 'lexical';
    }
    return 'coverage_supplement';
}

/**
 * 功能：格式化得分分解。
 */
function formatScoreBreakdown(breakdown: RetrievalScoreBreakdown): string {
    const parts: string[] = [];
    if (breakdown.bm25 > 0) parts.push(`BM25=${breakdown.bm25.toFixed(3)}`);
    if (breakdown.ngram > 0) parts.push(`n-gram=${breakdown.ngram.toFixed(3)}`);
    if (breakdown.editDistance > 0) parts.push(`编辑距离=${breakdown.editDistance.toFixed(3)}`);
    if (breakdown.memoryWeight > 0) parts.push(`记忆度=${breakdown.memoryWeight.toFixed(3)}`);
    if ((breakdown.recencyWeight ?? 0) > 0) parts.push(`时效性=${(breakdown.recencyWeight ?? 0).toFixed(3)}`);
    if ((breakdown.graphBoost ?? 0) > 0) parts.push(`图扩展=${(breakdown.graphBoost ?? 0).toFixed(3)}`);
    if ((breakdown.timeBoost ?? 0) > 0) parts.push(`时间加权=${(breakdown.timeBoost ?? 0).toFixed(3)}`);
    if ((breakdown.stateBoost ?? 0) > 0) parts.push(`状态加权=${(breakdown.stateBoost ?? 0).toFixed(3)}`);
    if ((breakdown.outcomeBoost ?? 0) > 0) parts.push(`结果加权=${(breakdown.outcomeBoost ?? 0).toFixed(3)}`);
    if ((breakdown.temporalWeight ?? 0) > 0) parts.push(`时间权重=${(breakdown.temporalWeight ?? 0).toFixed(3)}`);
    if ((breakdown.diversityPenalty ?? 0) > 0) parts.push(`多样性惩罚=${(breakdown.diversityPenalty ?? 0).toFixed(3)}`);
    return parts.join(' | ') || '无具体分解';
}

/**
 * 功能：生成命中原因摘要。
 */
function buildReasonSummary(
    item: RetrievalResultItem,
    source: RetrievalExplanation['source'],
): string {
    const breakdown = item.breakdown;
    const semantic = item.candidate.semantic;
    const semanticReasons: string[] = [];
    if (item.candidate.forgettingTier === 'shadow_forgotten') {
        semanticReasons.push(item.candidate.shadowTriggered ? '影子遗忘被强相关问题唤起' : '影子遗忘候选');
        if ((item.candidate.shadowRecallPenalty ?? 0) > 0) {
            semanticReasons.push('已施加影子降权');
        }
    }
    const retentionReasons = resolveRetentionReasonLabels(item.candidate.retention?.explainReasonCodes);
    semanticReasons.push(...retentionReasons);
    if (semantic) {
        semanticReasons.push(`${resolveSemanticKindLabel(semantic.semanticKind)}语义`);
        semanticReasons.push(resolveVisibilityScopeLabel(semantic.visibilityScope));
        if (semantic.currentState && (breakdown.stateBoost ?? 0) > 0.2) {
            semanticReasons.push('当前状态匹配');
        }
        if (semantic.finalOutcome && (breakdown.outcomeBoost ?? 0) > 0.2) {
            semanticReasons.push('结果语义匹配');
        }
        if (semantic.goalOrObjective && item.candidate.schemaId === 'task') {
            semanticReasons.push('目标推进相关');
        }
    }
    switch (source) {
        case 'lexical': {
            const reasons: string[] = [...semanticReasons];
            if (breakdown.bm25 > 0.3) reasons.push('关键词高度匹配');
            else if (breakdown.bm25 > 0) reasons.push('关键词部分匹配');
            if (breakdown.ngram > 0.4) reasons.push('短语结构相似');
            if (breakdown.editDistance > 0.5) reasons.push('文本拼写接近');
            if (breakdown.memoryWeight > 0.5) reasons.push('记忆度较高');
            if ((breakdown.recencyWeight ?? 0) > 0.5) reasons.push('近期更新');
            if ((breakdown.timeBoost ?? 0) > 0.2) reasons.push('时间方向匹配');
            if ((breakdown.stateBoost ?? 0) > 0.2 && !semantic?.currentState) reasons.push('状态特征匹配');
            if ((breakdown.outcomeBoost ?? 0) > 0.2 && !semantic?.finalOutcome) reasons.push('结果特征匹配');
            return reasons.join('、') || '词法检索命中';
        }
        case 'vector':
            return [...semanticReasons, '语义向量相似度命中'].join('、');
        case 'graph_expansion':
            return [...semanticReasons, '通过图扩展从相关条目扩散命中'].join('、');
        case 'coverage_supplement':
            return [...semanticReasons, '补召回阶段补充命中'].join('、');
    }
}

function resolveRetentionReasonLabels(reasonCodes?: string[]): string[] {
    if (!Array.isArray(reasonCodes) || reasonCodes.length <= 0) {
        return [];
    }
    const mapping: Record<string, string> = {
        retention_stage_clear: '记忆阶段清晰',
        retention_stage_blur: '记忆阶段模糊',
        retention_stage_distorted: '记忆阶段失真',
        forgotten_level_active: '活跃记忆',
        forgotten_level_shadow_forgotten: '影子遗忘',
        forgotten_level_hard_forgotten: '硬遗忘',
        shadow_recall_triggered: '影子召回已触发',
        shadow_recall_penalized: '统一 retention 已降权',
        rehearsal_boosted: '复述增强',
        recency_weakened: '时效衰减',
        importance_high: '重要度较高',
        actor_memory_low: '角色记忆能力偏低',
        relation_sensitive: '关系敏感度较高',
        memory_percent_critical_low: '原始记忆度极低',
        memory_percent_low: '原始记忆度偏低',
    };
    return Array.from(new Set(
        reasonCodes
            .map((code: string): string => mapping[String(code ?? '').trim()] || '')
            .filter(Boolean)
            .slice(0, 4),
    ));
}
