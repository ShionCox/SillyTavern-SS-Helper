import type { EventEnvelope } from '../../../SDK/stx';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    ChatProfile,
    MemoryCardLane,
    InjectionIntent,
    InjectionSectionName,
    LogicalChatView,
    ManualOverrides,
    MaintenanceAdvice,
    MemoryQualityLevel,
    MemoryQualityScorecard,
    RecallGateDecision,
    RecallNeedKind,
    RetentionPolicy,
    StrategyDecision,
    VectorLifecycleState,
    VectorMode,
} from '../types';
import type { SummaryRuntimeSettings } from './summary-settings-store';
import {
    DEFAULT_ADAPTIVE_METRICS,
    DEFAULT_ADAPTIVE_POLICY,
    DEFAULT_CHAT_PROFILE,
    DEFAULT_MEMORY_QUALITY,
    DEFAULT_RETENTION_POLICY,
    DEFAULT_VECTOR_LIFECYCLE,
} from '../types';
import { MEMORY_OS_POLICY } from '../policy/memory-policy';

export interface StrategyInferenceInput {
    query?: string;
    events?: Array<EventEnvelope<unknown>>;
    metrics?: AdaptiveMetrics;
    profile?: ChatProfile;
    logicalView?: LogicalChatView | null;
}

export interface RecallNeedInput {
    query?: string;
    intent?: InjectionIntent;
    structuredCount?: number;
    coveredLanes?: MemoryCardLane[];
    recentEventCount?: number;
}

export interface RecallGateInput extends RecallNeedInput {
    policy: AdaptivePolicy;
    structuredEnough?: boolean;
    recentEventsEnough?: boolean;
    cacheHit?: boolean;
}

/**
 * 功能：将数值限制在给定区间内。
 * @param value 原始值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 截断后的数值。
 */
function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(max, Math.max(min, value));
}

function normalizeRatio(value: number): number {
    return clampNumber(value, 0, 1);
}

function normalizeRecallText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function dedupeMemoryCardLanes(lanes: MemoryCardLane[]): MemoryCardLane[] {
    return Array.from(new Set((Array.isArray(lanes) ? lanes : []).map((lane: MemoryCardLane): MemoryCardLane => lane))).filter(Boolean);
}

/**
 * 功能：判断当前 query 更像哪一类召回需求。
 * @param input 召回需求输入。
 * @returns 召回需求类型。
 */
export function classifyRecallNeed(input: RecallNeedInput): RecallNeedKind {
    const query = normalizeRecallText(input.query);
    if (!query) {
        return 'mixed';
    }
    if (/谁|是谁|身份|什么人|什么身份|哪位|介绍一下/.test(query)) {
        return 'identity_direct';
    }
    if (/关系|什么关系|和我|对我|对他的关系|对她的关系|你们之间/.test(query)) {
        return 'relationship_direct';
    }
    if (/规则|设定|规矩|限制|世界观|世界规则|法则|约束/.test(query)) {
        return 'rule_direct';
    }
    if (/现在|当前|此刻|在哪|在哪里|什么情况|局势|状态|处境|正在/.test(query)) {
        return 'state_direct';
    }
    if (/之前|过去|曾经|回忆|有没有提过|提到过|发生过什么|后来怎样|后面/.test(query)) {
        return /为什么|原因|怎么会|为何|因果|伏笔/.test(query) ? 'causal_trace' : 'historical_event';
    }
    if (/为什么|怎么会|原因|因果|伏笔|导致|突然这样/.test(query)) {
        return 'causal_trace';
    }
    if (/风格|语气|通常怎么说|怎么说话|习惯|偏好|会怎么做|一般会/.test(query)) {
        return 'style_inference';
    }
    if ((input.structuredCount ?? 0) > 0 && (input.coveredLanes ?? []).length > 1) {
        return 'mixed';
    }
    return 'ambiguous_recall';
}

/**
 * 功能：根据召回需求解析允许搜索的记忆卡层。
 * @param input 召回需求输入。
 * @returns 允许搜索的记忆卡层列表。
 */
export function resolveVectorRecallLanes(input: RecallNeedInput): MemoryCardLane[] {
    const need = classifyRecallNeed(input);
    if (need === 'identity_direct') {
        return ['identity'];
    }
    if (need === 'relationship_direct') {
        return ['relationship'];
    }
    if (need === 'rule_direct') {
        return ['rule'];
    }
    if (need === 'state_direct') {
        return ['state'];
    }
    if (need === 'style_inference') {
        return ['style'];
    }
    if (need === 'historical_event' || need === 'causal_trace') {
        return ['event', 'relationship', 'state'];
    }
    if (need === 'mixed') {
        return dedupeMemoryCardLanes([...(input.coveredLanes ?? []), 'event', 'style', 'relationship', 'state']);
    }
    return dedupeMemoryCardLanes([...(input.coveredLanes ?? []), 'event', 'style', 'relationship', 'state']);
}

/**
 * 功能：统一判断本轮是否允许触发向量召回。
 * @param input 召回门控输入。
 * @returns 门控结果。
 */
export function shouldRunVectorRecall(input: RecallGateInput): RecallGateDecision {
    const primaryNeed = classifyRecallNeed(input);
    const reasonCodes: string[] = [];
    const lanes = dedupeMemoryCardLanes(resolveVectorRecallLanes(input));
    if (input.policy.vectorEnabled !== true || input.policy.vectorMode === 'off') {
        reasonCodes.push(input.policy.vectorEnabled !== true ? 'vector_disabled' : `vector_mode:${input.policy.vectorMode}`);
        return { enabled: false, lanes, reasonCodes, primaryNeed, vectorMode: input.policy.vectorMode };
    }
    reasonCodes.push(`intent:${input.intent ?? 'auto'}`);
    if (input.structuredCount != null && input.structuredCount <= 0 && input.recentEventCount != null && input.recentEventCount <= 0) {
        reasonCodes.push('cheap_layer_empty');
    }
    reasonCodes.push(`recall_need:${primaryNeed}`);
    return { enabled: true, lanes, reasonCodes, primaryNeed, vectorMode: input.policy.vectorMode };
}

function scoreToLevel(totalScore: number): MemoryQualityLevel {
    if (totalScore >= 85) {
        return 'excellent';
    }
    if (totalScore >= 70) {
        return 'healthy';
    }
    if (totalScore >= 55) {
        return 'watch';
    }
    if (totalScore >= 40) {
        return 'poor';
    }
    return 'critical';
}

function pushReason(reasonCodes: string[], condition: boolean, reasonCode: string): void {
    if (condition && !reasonCodes.includes(reasonCode)) {
        reasonCodes.push(reasonCode);
    }
}

function averageWindow(values: number[]): number {
    if (!Array.isArray(values) || values.length === 0) {
        return 0;
    }
    return values.reduce((sum: number, value: number): number => sum + Number(value || 0), 0) / values.length;
}

function normalizeFreshness(lastSummaryAt: number, latestSignalAt: number): number {
    if (latestSignalAt <= 0) {
        return 1;
    }
    if (lastSummaryAt <= 0) {
        return 0;
    }
    const ageMs = Math.max(0, latestSignalAt - lastSummaryAt);
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    if (ageDays <= 3) {
        return 1;
    }
    if (ageDays >= 14) {
        return 0;
    }
    return normalizeRatio(1 - ((ageDays - 3) / 11));
}

export function inferVectorMode(
    profile: ChatProfile,
    metrics: AdaptiveMetrics,
    vectorLifecycle?: Partial<VectorLifecycleState> | null,
): {
    vectorMode: VectorMode;
    vectorSearchStride: number;
    rerankEnabled: boolean;
    reasonCodes: string[];
} {
    const normalizedProfile = {
        ...DEFAULT_CHAT_PROFILE,
        ...profile,
        vectorStrategy: {
            ...DEFAULT_CHAT_PROFILE.vectorStrategy,
            ...(profile.vectorStrategy ?? {}),
        },
    };
    const lifecycle = {
        ...DEFAULT_VECTOR_LIFECYCLE,
        ...(vectorLifecycle ?? {}),
    };
    const reasonCodes: string[] = [];
    const memoryCardCount = Math.max(0, Number(lifecycle.memoryCardCount ?? 0));
    const precisionWindow = Array.isArray(lifecycle.recentPrecisionWindow) ? lifecycle.recentPrecisionWindow : [];
    const retrievalPrecision = precisionWindow.length > 0
        ? averageWindow(precisionWindow)
        : normalizeRatio(Number(metrics.retrievalPrecision ?? metrics.retrievalHitRate ?? 0));
    const now = Date.now();
    const lastAccessAt = Number(lifecycle.lastAccessAt ?? metrics.lastVectorAccessAt ?? 0);
    const idleDays = lastAccessAt > 0 ? (now - lastAccessAt) / (24 * 60 * 60 * 1000) : Number.POSITIVE_INFINITY;
    const idleDecayDays = Math.max(1, Number(normalizedProfile.vectorStrategy.idleDecayDays ?? DEFAULT_CHAT_PROFILE.vectorStrategy.idleDecayDays));
    let vectorSearchStride = Math.max(1, Number(normalizedProfile.vectorStrategy.lowPrecisionSearchStride ?? DEFAULT_CHAT_PROFILE.vectorStrategy.lowPrecisionSearchStride));
    const indexReady = memoryCardCount > 0 || Number(lifecycle.lastIndexAt ?? 0) > 0;

    if (!normalizedProfile.vectorStrategy.enabled) {
        pushReason(reasonCodes, true, 'vector_disabled_by_profile');
        return { vectorMode: 'off', vectorSearchStride, rerankEnabled: false, reasonCodes };
    }

    if (!indexReady) {
        pushReason(reasonCodes, true, 'memory_card_index_unavailable');
        return { vectorMode: 'off', vectorSearchStride, rerankEnabled: false, reasonCodes };
    }
    pushReason(reasonCodes, true, memoryCardCount > 0 ? 'memory_card_index_ready' : 'vector_index_ready');

    if (retrievalPrecision < 0.1) {
        vectorSearchStride = 5;
        pushReason(reasonCodes, true, 'vector_force_stride_5');
    } else if (retrievalPrecision < 0.2) {
        pushReason(reasonCodes, true, 'vector_low_precision_stride');
    }

    if (idleDays > idleDecayDays || retrievalPrecision < 0.35) {
        pushReason(reasonCodes, idleDays > idleDecayDays, 'vector_idle_decay');
        pushReason(reasonCodes, idleDays > 30, 'vector_long_term_idle');
        pushReason(reasonCodes, retrievalPrecision < 0.35, 'vector_precision_mid');
        return { vectorMode: 'search', vectorSearchStride, rerankEnabled: false, reasonCodes };
    }

    pushReason(reasonCodes, true, 'vector_search_rerank_ready');
    return { vectorMode: 'search_rerank', vectorSearchStride, rerankEnabled: true, reasonCodes };
}

export function computeMemoryQualityScorecard(input: {
    metrics: AdaptiveMetrics;
    vectorLifecycle?: Partial<VectorLifecycleState> | null;
    latestSummaryAt?: number;
    latestSignalAt?: number;
}): MemoryQualityScorecard {
    const metrics = { ...DEFAULT_ADAPTIVE_METRICS, ...(input.metrics ?? {}) };
    const lifecycle = { ...DEFAULT_VECTOR_LIFECYCLE, ...(input.vectorLifecycle ?? {}) };
    const reasonCodes: string[] = [];
    const summaryFreshness = normalizeFreshness(
        Number(input.latestSummaryAt ?? 0),
        Math.max(Number(input.latestSignalAt ?? 0), Number(metrics.lastUpdatedAt ?? 0)),
    );
    const usefulSignals = (
        0.5 * normalizeRatio(metrics.summaryEffectiveness)
        + 0.3 * normalizeRatio(metrics.retrievalPrecision)
        + 0.2 * normalizeRatio(metrics.factsUpdateRate)
    );
    const tokenEfficiency = normalizeRatio(usefulSignals / Math.max(Number(metrics.promptInjectionTokenRatio ?? 0), 0.05));
    const duplicateScore = normalizeRatio(1 - Number(metrics.duplicateRate ?? 0));
    const retrievalScore = normalizeRatio(Number(metrics.retrievalPrecision ?? metrics.retrievalHitRate ?? 0));
    const extractScore = normalizeRatio(Number(metrics.extractAcceptance ?? 0));
    const orphanScore = normalizeRatio(1 - Number(metrics.orphanFactsRatio ?? 0));
    const schemaScore = normalizeRatio(Number(metrics.schemaHygiene ?? 0));
    const totalScore = Math.round((
        duplicateScore * 15
        + retrievalScore * 20
        + extractScore * 15
        + summaryFreshness * 15
        + tokenEfficiency * 15
        + orphanScore * 10
        + schemaScore * 10
    ));
    pushReason(reasonCodes, Number(metrics.duplicateRate ?? 0) >= 0.3, 'duplicate_rate_high');
    pushReason(reasonCodes, retrievalScore < 0.2, 'retrieval_precision_low');
    pushReason(reasonCodes, extractScore < 0.35, 'extract_acceptance_low');
    pushReason(reasonCodes, summaryFreshness < 0.45, 'summary_freshness_low');
    pushReason(reasonCodes, tokenEfficiency < 0.4, 'token_efficiency_low');
    pushReason(reasonCodes, Number(metrics.orphanFactsRatio ?? 0) >= 0.22, 'orphan_facts_high');
    pushReason(reasonCodes, schemaScore < 0.45, 'schema_hygiene_low');
    pushReason(reasonCodes, lifecycle.memoryCardCount <= 0 && lifecycle.vectorMode !== 'off', 'memory_card_embeddings_missing');
    return {
        totalScore,
        level: scoreToLevel(totalScore),
        dimensions: {
            duplicateRate: duplicateScore,
            retrievalPrecision: retrievalScore,
            extractAcceptance: extractScore,
            summaryFreshness,
            tokenEfficiency,
            orphanFactsRatio: orphanScore,
            schemaHygiene: schemaScore,
        },
        computedAt: Date.now(),
        reasonCodes,
    };
}

export function buildMaintenanceAdvice(input: {
    metrics: AdaptiveMetrics;
    quality?: MemoryQualityScorecard | null;
    vectorLifecycle?: Partial<VectorLifecycleState> | null;
    needsCompaction?: boolean;
}): MaintenanceAdvice[] {
    const metrics = { ...DEFAULT_ADAPTIVE_METRICS, ...(input.metrics ?? {}) };
    const quality = input.quality ? { ...DEFAULT_MEMORY_QUALITY, ...input.quality } : computeMemoryQualityScorecard({ metrics, vectorLifecycle: input.vectorLifecycle });
    const lifecycle = { ...DEFAULT_VECTOR_LIFECYCLE, ...(input.vectorLifecycle ?? {}) };
    const advice: MaintenanceAdvice[] = [];

    if (input.needsCompaction || Number(metrics.duplicateRate ?? 0) >= 0.3) {
        advice.push({
            action: 'compress',
            priority: Number(metrics.duplicateRate ?? 0) >= 0.45 ? 'high' : 'medium',
            reasonCodes: ['duplicate_rate_high'],
            title: '建议压缩旧记忆',
            detail: '当前聊天出现较高重复写入或已满足压缩条件，建议执行压缩以降低噪音。',
        });
    }
    if (quality.dimensions.summaryFreshness < 0.45 || Number(metrics.summaryEffectiveness ?? 0) < 0.35) {
        advice.push({
            action: 'rebuild_summary',
            priority: quality.dimensions.summaryFreshness < 0.25 ? 'high' : 'medium',
            reasonCodes: ['summary_freshness_low'],
            title: '建议重建摘要',
            detail: '摘要已明显陈旧或摘要效果偏低，建议重建摘要提高注入质量。',
        });
    }
    const vectorGrowth = Number(lifecycle.factCount ?? 0) + Number(lifecycle.summaryCount ?? 0);
    if ((vectorGrowth >= Math.max(1, Number(lifecycle.memoryCardCount ?? 0)) && Number(lifecycle.memoryCardCount ?? 0) === 0)
        || (Number(metrics.retrievalPrecision ?? 0) < 0.2 && vectorGrowth > 0)) {
        advice.push({
            action: 'memory_card_rebuild',
            priority: Number(lifecycle.memoryCardCount ?? 0) === 0 ? 'high' : 'medium',
            reasonCodes: ['memory_card_embeddings_missing'],
            title: '建议重建向量索引',
            detail: '聊天已达到向量启用条件，但当前向量覆盖不足或近期检索精度偏低，建议重建索引。',
        });
    }
    if (Number(metrics.orphanFactsRatio ?? 0) >= 0.22 || Number(metrics.schemaHygiene ?? 0) < 0.45) {
        advice.push({
            action: 'schema_cleanup',
            priority: Number(metrics.orphanFactsRatio ?? 0) >= 0.35 ? 'high' : 'medium',
            reasonCodes: ['schema_hygiene_low'],
            title: '建议整理 schema',
            detail: '存在较多孤儿事实或 schema 卫生度偏低，建议进行 schema 整理。',
        });
    }
    return advice;
}

/**
 * 功能：读取事件中的可分析文本。
 * @param event 事件对象。
 * @returns 归一化后的文本。
 */
export function readEventTextForStrategy(event: EventEnvelope<unknown>): string {
    const payload = event?.payload as
        | string
        | { text?: unknown; content?: unknown; message?: unknown; summary?: unknown }
        | null
        | undefined;
    if (typeof payload === 'string') {
        return payload.trim();
    }
    if (payload && typeof payload === 'object') {
        const candidates: unknown[] = [payload.text, payload.content, payload.message, payload.summary];
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim().length > 0) {
                return candidate.trim();
            }
        }
    }
    return '';
}

/**
 * 功能：从文本中提取轻量主题词集合。
 * @param text 输入文本。
 * @returns 主题词数组。
 */
export function extractTopicTerms(text: string): string[] {
    return Array.from(
        new Set(
            String(text ?? '')
                .toLowerCase()
                .split(/[\s,，。！？；、:：()\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
                .map((item: string): string => item.trim())
                .filter((item: string): boolean => item.length >= 2),
        ),
    ).slice(0, 12);
}

/**
 * 功能：根据最近事件窗口计算聊天动态指标。
 * @param events 最近事件列表。
 * @param previous 前一次指标，用于保留跨节点统计值。
 * @returns 动态指标结果。
 */
export function collectAdaptiveMetricsFromEvents(
    events: Array<EventEnvelope<unknown>>,
    previous?: AdaptiveMetrics,
    logicalView?: LogicalChatView | null,
): AdaptiveMetrics {
    const recentEvents = Array.isArray(events) ? events.slice(0, DEFAULT_ADAPTIVE_METRICS.windowSize) : [];
    const messageEvents = recentEvents.filter((event: EventEnvelope<unknown>): boolean => {
        return (
            event.type === 'chat.message.sent'
            || event.type === 'chat.message.received'
            || event.type === 'user_message_rendered'
            || event.type === 'assistant_message_rendered'
        );
    });
    const userEvents = messageEvents.filter((event: EventEnvelope<unknown>): boolean => {
        return event.type === 'chat.message.sent' || event.type === 'user_message_rendered';
    });
    const assistantEvents = messageEvents.filter((event: EventEnvelope<unknown>): boolean => {
        return event.type === 'chat.message.received' || event.type === 'assistant_message_rendered';
    });
    const messageLengths = messageEvents.map((event: EventEnvelope<unknown>): number => readEventTextForStrategy(event).length);
    const avgMessageLength = messageLengths.length > 0
        ? messageLengths.reduce((sum: number, length: number): number => sum + length, 0) / messageLengths.length
        : 0;
    const assistantLongMessageRatio = assistantEvents.length > 0
        ? assistantEvents.filter((event: EventEnvelope<unknown>): boolean => readEventTextForStrategy(event).length >= 280).length / assistantEvents.length
        : 0;
    const userInfoDensity = userEvents.length > 0
        ? userEvents.reduce((sum: number, event: EventEnvelope<unknown>): number => {
            const text = readEventTextForStrategy(event);
            const terms = extractTopicTerms(text);
            const density = text.length > 0 ? (terms.join('').length / Math.max(text.length, 1)) : 0;
            return sum + density;
        }, 0) / userEvents.length
        : 0;
    const userTopicWindows = userEvents.map((event: EventEnvelope<unknown>): string[] => extractTopicTerms(readEventTextForStrategy(event)));
    let repeatedTopicHits = 0;
    let repeatedTopicBase = 0;
    for (let index = 1; index < userTopicWindows.length; index += 1) {
        const previousTerms = new Set(userTopicWindows[index - 1]);
        const currentTerms = userTopicWindows[index];
        if (currentTerms.length === 0) {
            continue;
        }
        repeatedTopicBase += 1;
        if (currentTerms.some((term: string): boolean => previousTerms.has(term))) {
            repeatedTopicHits += 1;
        }
    }
    const repeatedTopicRate = repeatedTopicBase > 0 ? repeatedTopicHits / repeatedTopicBase : 0;
    const speakerMatches = recentEvents.reduce((speakerSet: Set<string>, event: EventEnvelope<unknown>): Set<string> => {
        const text = readEventTextForStrategy(event);
        const match = text.match(/^([A-Za-z\u4e00-\u9fff0-9_]{1,16})[:：]/);
        if (match?.[1]) {
            speakerSet.add(match[1].toLowerCase());
        }
        return speakerSet;
    }, new Set<string>());
    const visibleSpeakerMatches = Array.isArray(logicalView?.visibleMessages)
        ? logicalView!.visibleMessages
            .slice(Math.max(0, logicalView!.visibleMessages.length - DEFAULT_ADAPTIVE_METRICS.windowSize))
            .reduce((speakerSet: Set<string>, node): Set<string> => {
                const match = String(node.text ?? '').match(/^([A-Za-z\u4e00-\u9fff0-9_]{1,24})[:：]/);
                if (match?.[1]) {
                    speakerSet.add(String(match[1]).toLowerCase());
                }
                return speakerSet;
            }, new Set<string>())
        : new Set<string>();
    const branchPressure = Array.isArray(logicalView?.branchRoots) ? logicalView!.branchRoots.length : 0;
    const supersededPressure = Array.isArray(logicalView?.supersededCandidates) ? logicalView!.supersededCandidates.length : 0;
    const editedPressure = Array.isArray(logicalView?.editedRevisions) ? logicalView!.editedRevisions.length : 0;
    const deletedPressure = Array.isArray(logicalView?.deletedTurns) ? logicalView!.deletedTurns.length : 0;
    const mutationPenalty = Math.min(0.18, (branchPressure * 0.03) + (supersededPressure * 0.02) + (editedPressure * 0.015) + (deletedPressure * 0.02));
    const worldStateSignal = clampNumber(
        (
            Number(previous?.worldStateSignal ?? 0) * 0.4
            + (userEvents.some((event: EventEnvelope<unknown>): boolean => /设定|世界|规则|背景|地点|阵营|历史|年表/.test(readEventTextForStrategy(event))) ? 0.35 : 0)
            + (assistantEvents.some((event: EventEnvelope<unknown>): boolean => /设定|世界|规则|背景|地点|阵营|历史|年表/.test(readEventTextForStrategy(event))) ? 0.25 : 0)
        ),
        0,
        1,
    );

    return {
        ...DEFAULT_ADAPTIVE_METRICS,
        ...previous,
        windowSize: messageEvents.length || DEFAULT_ADAPTIVE_METRICS.windowSize,
        avgMessageLength,
        assistantLongMessageRatio,
        userInfoDensity,
        repeatedTopicRate,
        recentUserTurns: userEvents.length,
        recentAssistantTurns: assistantEvents.length,
        recentGroupSpeakerCount: Math.max(1, speakerMatches.size, visibleSpeakerMatches.size),
        worldStateSignal: clampNumber(worldStateSignal - mutationPenalty, 0, 1),
        lastUpdatedAt: Date.now(),
    };
}

/**
 * 功能：推断聊天画像。
 * @param input 推断所需输入。
 * @returns 推断后的聊天画像。
 */
export function inferChatProfile(input: StrategyInferenceInput): ChatProfile {
    const profile = { ...DEFAULT_CHAT_PROFILE, ...(input.profile ?? {}) };
    const metrics = { ...DEFAULT_ADAPTIVE_METRICS, ...(input.metrics ?? {}) };
    const events = Array.isArray(input.events) ? input.events : [];
    const logicalView = input.logicalView;
    const query = String(input.query ?? '').trim().toLowerCase();
    const namedSpeakerCount = Array.isArray(logicalView?.visibleMessages)
        ? logicalView!.visibleMessages
            .slice(Math.max(0, logicalView!.visibleMessages.length - 32))
            .reduce((speakerSet: Set<string>, node): Set<string> => {
                const match = String(node.text ?? '').match(/^([A-Za-z\u4e00-\u9fff0-9_]{1,24})[:：]/);
                if (match?.[1]) {
                    speakerSet.add(String(match[1]).toLowerCase());
                }
                return speakerSet;
            }, new Set<string>())
            .size
        : 0;
    const hasBranchMutation = Array.isArray(logicalView?.mutationKinds)
        ? logicalView!.mutationKinds.includes('chat_branched') || logicalView!.mutationKinds.includes('message_swiped')
        : false;

    const groupSignal = metrics.recentGroupSpeakerCount >= 3 || namedSpeakerCount >= 2 || events.some((event: EventEnvelope<unknown>): boolean => {
        return /群聊|大家|众人|队伍|队友|npc们/.test(readEventTextForStrategy(event));
    });
    const toolSignal = /怎么|如何|步骤|命令|配置|报错|为什么|修复|说明/.test(query);
    const worldbookSignal = metrics.worldStateSignal >= 0.45 || /设定|世界观|资料|百科|年表|势力|地图/.test(query);

    const nextChatType = toolSignal
        ? 'tool'
        : groupSignal
            ? 'group'
            : worldbookSignal
                ? 'worldbook'
                : profile.chatType;

    const nextStylePreference = toolSignal
        ? 'qa'
        : /跑团|检定|主持人|角色卡|dnd|coc/.test(query)
            ? 'trpg'
            : worldbookSignal
                ? 'info'
                : metrics.assistantLongMessageRatio >= 0.45
                    ? 'story'
                    : profile.stylePreference;

    const nextMemoryStrength = metrics.userInfoDensity >= 0.18 || metrics.worldStateSignal >= 0.5
        ? 'high'
        : metrics.avgMessageLength <= 90 && nextStylePreference === 'qa'
            ? 'low'
            : 'medium';

    const nextExtractStrategy = nextChatType === 'tool'
        ? 'facts_only'
        : nextChatType === 'worldbook' || nextStylePreference === 'trpg'
            ? 'facts_relations_world'
            : nextChatType === 'group'
                ? 'facts_relations'
                : profile.extractStrategy;

    const nextSummaryStrategy = nextStylePreference === 'qa'
        ? 'short'
        : nextChatType === 'worldbook'
            ? 'timeline'
            : nextStylePreference === 'story'
                ? 'layered'
                : profile.summaryStrategy;

    return {
        ...profile,
        chatType: nextChatType,
        stylePreference: nextStylePreference,
        memoryStrength: hasBranchMutation && nextStylePreference !== 'qa'
            ? (nextMemoryStrength === 'low' ? 'medium' : nextMemoryStrength)
            : nextMemoryStrength,
        extractStrategy: nextExtractStrategy,
        summaryStrategy: nextSummaryStrategy,
        vectorStrategy: {
            ...profile.vectorStrategy,
            enabled: nextChatType !== 'tool',
            chunkThreshold: nextChatType === 'tool' ? 360 : nextMemoryStrength === 'high' ? 180 : 260,
            rerankThreshold: nextStylePreference === 'qa' ? 8 : nextChatType === 'worldbook' ? 4 : 6,
        },
        deletionStrategy: profile.deletionStrategy,
    };
}

/**
 * 功能：根据画像与指标构建自适应策略。
 * @param profile 聊天画像。
 * @param metrics 动态指标。
 * @returns 可执行自适应策略。
 */
export function buildAdaptivePolicy(
    profile: ChatProfile,
    metrics: AdaptiveMetrics,
    vectorLifecycle?: Partial<VectorLifecycleState> | null,
    memoryQuality?: Partial<MemoryQualityScorecard> | null,
): AdaptivePolicy {
    let extractInterval = profile.memoryStrength === 'high'
        ? 8
        : profile.memoryStrength === 'low'
            ? 18
            : MEMORY_OS_POLICY.extract.defaultSummaryInterval;
    let extractWindowSize = profile.summaryStrategy === 'timeline'
        ? 56
        : profile.summaryStrategy === 'short'
            ? 24
            : MEMORY_OS_POLICY.extract.defaultSummaryWindowSize;
    let summaryEnabled = profile.stylePreference !== 'qa' || metrics.avgMessageLength >= 120;
    let entityResolutionLevel: AdaptivePolicy['entityResolutionLevel'] = profile.chatType === 'group' ? 'high' : 'medium';
    let speakerTrackingLevel: AdaptivePolicy['speakerTrackingLevel'] = profile.chatType === 'group' ? 'high' : 'medium';
    let worldStateWeight = profile.chatType === 'worldbook' ? 0.85 : profile.extractStrategy === 'facts_relations_world' ? 0.7 : 0.45;
    let contextMaxTokensShare = profile.stylePreference === 'qa' ? 0.35 : profile.chatType === 'worldbook' ? 0.7 : 0.55;
    let lorebookPolicyWeight = profile.chatType === 'worldbook' ? 0.85 : 0.55;
    let groupLaneBudgetShare = profile.chatType === 'group' ? 0.42 : 0.2;
    let actorSalienceTopK = profile.chatType === 'group' ? 4 : 2;
    let profileRefreshInterval = profile.memoryStrength === 'low' ? 12 : 6;
    let qualityRefreshInterval = profile.summaryStrategy === 'timeline' ? 10 : 12;
    const groupLaneEnabled = profile.chatType === 'group';

    if (metrics.userInfoDensity <= 0.08) {
        extractInterval += 6;
        extractWindowSize = Math.max(18, extractWindowSize - 12);
    }
    if (metrics.recentGroupSpeakerCount >= 3) {
        entityResolutionLevel = 'high';
        speakerTrackingLevel = 'high';
        worldStateWeight = Math.max(worldStateWeight, 0.55);
        groupLaneBudgetShare = Math.max(groupLaneBudgetShare, 0.45);
        actorSalienceTopK = Math.max(actorSalienceTopK, 5);
        profileRefreshInterval = Math.min(profileRefreshInterval, 6);
        qualityRefreshInterval = Math.min(qualityRefreshInterval, 10);
    }
    if (metrics.worldStateSignal >= 0.5) {
        worldStateWeight = Math.max(worldStateWeight, 0.8);
        contextMaxTokensShare = Math.max(contextMaxTokensShare, 0.65);
        lorebookPolicyWeight = Math.max(lorebookPolicyWeight, 0.75);
    }
    if (profile.stylePreference === 'qa' && metrics.avgMessageLength <= 100) {
        summaryEnabled = false;
        extractInterval = Math.max(extractInterval, 18);
        contextMaxTokensShare = Math.min(contextMaxTokensShare, 0.3);
        lorebookPolicyWeight = Math.min(lorebookPolicyWeight, 0.45);
    }

    const vectorDecision = inferVectorMode(profile, metrics, vectorLifecycle);
    const quality = memoryQuality
        ? { ...DEFAULT_MEMORY_QUALITY, ...memoryQuality }
        : computeMemoryQualityScorecard({ metrics, vectorLifecycle });

    return {
        ...DEFAULT_ADAPTIVE_POLICY,
        extractInterval: Math.max(4, Math.round(extractInterval)),
        extractWindowSize: Math.max(16, Math.round(extractWindowSize)),
        summaryEnabled,
        summaryMode: profile.summaryStrategy,
        entityResolutionLevel,
        speakerTrackingLevel,
        worldStateWeight: clampNumber(worldStateWeight, 0.1, 1),
        vectorEnabled: profile.vectorStrategy.enabled && vectorDecision.vectorMode !== 'off',
        vectorChunkThreshold: Math.max(120, Math.round(profile.vectorStrategy.chunkThreshold)),
        rerankThreshold: Math.max(2, Math.round(profile.vectorStrategy.rerankThreshold)),
        vectorMode: vectorDecision.vectorMode,
        vectorSearchStride: Math.max(1, Math.round(vectorDecision.vectorSearchStride)),
        rerankEnabled: vectorDecision.rerankEnabled && quality.dimensions.retrievalPrecision >= 0.35,
        vectorIdleDecayDays: Math.max(1, Math.round(profile.vectorStrategy.idleDecayDays)),
        contextMaxTokensShare: clampNumber(contextMaxTokensShare, 0.2, 0.8),
        lorebookPolicyWeight: clampNumber(lorebookPolicyWeight, 0.1, 1),
        groupLaneBudgetShare: clampNumber(groupLaneBudgetShare, 0.1, 0.8),
        actorSalienceTopK: Math.max(1, Math.min(8, Math.round(actorSalienceTopK))),
        profileRefreshInterval: Math.max(1, Math.round(profileRefreshInterval)),
        qualityRefreshInterval: Math.max(1, Math.round(qualityRefreshInterval)),
        groupLaneEnabled,
    };
}

/**
 * 功能：合并手动覆盖后的最终聊天画像。
 * @param profile 自动推断画像。
 * @param overrides 手动覆盖项。
 * @returns 最终生效画像。
 */
export function applyChatProfileOverrides(profile: ChatProfile, overrides?: ManualOverrides): ChatProfile {
    return {
        ...profile,
        ...(overrides?.chatProfile ?? {}),
        vectorStrategy: {
            ...profile.vectorStrategy,
            ...(overrides?.chatProfile?.vectorStrategy ?? {}),
        },
    };
}

/**
 * 功能：合并手动覆盖后的最终自适应策略。
 * @param policy 自动推断策略。
 * @param overrides 手动覆盖项。
 * @returns 最终生效策略。
 */
export function applyAdaptivePolicyOverrides(policy: AdaptivePolicy, overrides?: ManualOverrides): AdaptivePolicy {
    const nextPolicy: AdaptivePolicy = {
        ...policy,
        ...(overrides?.adaptivePolicy ?? {}),
    };
    return nextPolicy;
}

/**
 * 鍔熻兘锛氬皢鎽樿杩愯璁剧疆鏄犲皠鍒拌嚜閫傚簲绛栫暐銆?
 * @param policy 鍘熷鑷€傚簲绛栫暐銆?
 * @param runtime 鎽樿杩愯鏃惰涓哄弬鏁般€?
 * @returns 鏄犲皠鍚庣殑鑷€傚簲绛栫暐銆?
 */
export function applySummaryRuntimeSettings(policy: AdaptivePolicy, runtime: SummaryRuntimeSettings): AdaptivePolicy {
    return {
        ...policy,
        summaryEnabled: Boolean(runtime.summaryEnabled),
        extractInterval: Math.max(1, Math.round(runtime.processingIntervalTurns)),
        extractWindowSize: Math.max(1, Math.round(runtime.lookbackWindowTurns)),
        summaryMode: runtime.summaryMode,
    };
}

/**
 * 功能：合并手动覆盖后的最终保留策略。
 * @param policy 自动推断保留策略。
 * @param overrides 手动覆盖项。
 * @returns 最终生效保留策略。
 */
export function applyRetentionPolicyOverrides(policy: RetentionPolicy, overrides?: ManualOverrides): RetentionPolicy {
    return {
        ...policy,
        ...(overrides?.retentionPolicy ?? {}),
    };
}

/**
 * 功能：根据聊天画像、指标与查询判定本轮注入意图。
 * @param input 推断输入。
 * @returns 注入意图。
 */
export function decideInjectionIntent(input: StrategyInferenceInput): InjectionIntent {
    const query = String(input.query ?? '').trim().toLowerCase();
    const profile = { ...DEFAULT_CHAT_PROFILE, ...(input.profile ?? {}) };

    if (!query) {
        if (profile.stylePreference === 'qa') {
            return 'tool_qa';
        }
        if (profile.chatType === 'worldbook') {
            return 'setting_qa';
        }
        return 'story_continue';
    }
    if (isExplicitSettingQuestion(query)) {
        return 'setting_qa';
    }
    if (isExplicitToolQuestion(query)) {
        return 'tool_qa';
    }
    if (isExplicitStoryContinuation(query)) {
        return 'story_continue';
    }
    if (isExplicitRoleplayQuestion(query)) {
        return 'roleplay';
    }
    if (/设定|世界观|百科|背景|规则|资料|地点|阵营|历史|年表/.test(query)) {
        return 'setting_qa';
    }
    if (/怎么|如何|修复|命令|配置|步骤|报错|api|sdk|tsc/.test(query)) {
        return 'tool_qa';
    }
    if (/继续|续写|接着|然后|下一幕|下一段/.test(query)) {
        return 'story_continue';
    }
    if (/扮演|以.*口吻|角色|对话|人设|互动/.test(query)) {
        return 'roleplay';
    }
    if (profile.stylePreference === 'qa') {
        return 'tool_qa';
    }
    if (profile.chatType === 'worldbook') {
        return 'setting_qa';
    }
    if (profile.stylePreference === 'story' || profile.stylePreference === 'trpg') {
        return 'story_continue';
    }
    return 'auto';
}

/**
 * 功能：判断查询是否是明确的设定问答，优先走世界/地点/背景召回。
 * @param query 归一化后的用户查询。
 * @returns 命中时返回 `true`。
 */
function isExplicitSettingQuestion(query: string): boolean {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    const directKeywords = [
        '设定',
        '世界观',
        '背景',
        '规则',
        '资料',
        '地点',
        '地理',
        '历史',
        '百科',
        '是什么地方',
        '是什么',
        '在哪里',
        '位于',
        '哪个城市',
        '哪座城',
        '哪儿',
    ];
    if (directKeywords.some((keyword: string): boolean => normalized.includes(keyword))) {
        return true;
    }
    return /.+是(什么|啥).*(地方|地区|城市|国家|组织|人物|角色|设定)?/.test(normalized);
}

/**
 * 功能：判断查询是否是明确工具问答。
 * @param query 归一化后的用户查询。
 * @returns 命中时返回 `true`。
 */
function isExplicitToolQuestion(query: string): boolean {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    const keywords = ['怎么', '如何', '修复', '命令', '配置', '步骤', '报错', 'api', 'sdk', 'tsc'];
    return keywords.some((keyword: string): boolean => normalized.includes(keyword));
}

/**
 * 功能：判断查询是否是明确剧情续写请求。
 * @param query 归一化后的用户查询。
 * @returns 命中时返回 `true`。
 */
function isExplicitStoryContinuation(query: string): boolean {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    const keywords = ['继续', '续写', '接着', '然后', '下一章', '下一段'];
    return keywords.some((keyword: string): boolean => normalized.includes(keyword));
}

/**
 * 功能：判断查询是否是明确角色扮演/人物互动请求。
 * @param query 归一化后的用户查询。
 * @returns 命中时返回 `true`。
 */
function isExplicitRoleplayQuestion(query: string): boolean {
    const normalized = String(query ?? '').trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    const keywords = ['扮演', '角色', '对话', '人设', '互动'];
    return keywords.some((keyword: string): boolean => normalized.includes(keyword));
}

/**
 * 功能：根据意图选择默认注入区段。
 * @param intent 本轮注入意图。
 * @returns 区段数组。
 */
export function resolveIntentSections(intent: InjectionIntent): InjectionSectionName[] {
    if (intent === 'setting_qa') {
        return ['WORLD_STATE', 'FACTS'];
    }
    if (intent === 'story_continue') {
        return ['SUMMARY', 'LAST_SCENE', 'EVENTS'];
    }
    if (intent === 'roleplay') {
        return ['CHARACTER_FACTS', 'RELATIONSHIPS', 'LAST_SCENE'];
    }
    if (intent === 'tool_qa') {
        return ['SHORT_SUMMARY'];
    }
    return ['WORLD_STATE', 'FACTS', 'SUMMARY', 'EVENTS'];
}

/**
 * 功能：根据意图与策略分配区段预算。
 * @param intent 本轮意图。
 * @param sections 使用区段。
 * @param maxTokens 总预算。
 * @param policy 自适应策略。
 * @returns 预算映射。
 */
export function buildIntentBudgets(
    intent: InjectionIntent,
    sections: InjectionSectionName[],
    maxTokens: number,
    policy: AdaptivePolicy,
): Partial<Record<InjectionSectionName, number>> {
    const result: Partial<Record<InjectionSectionName, number>> = {};
    const baseRatios: Record<InjectionIntent, Partial<Record<InjectionSectionName, number>>> = {
        auto: { WORLD_STATE: 0.2, FACTS: 0.3, SUMMARY: 0.3, EVENTS: 0.2 },
        setting_qa: { WORLD_STATE: 0.45, FACTS: 0.55 },
        story_continue: { SUMMARY: 0.4, LAST_SCENE: 0.35, EVENTS: 0.25 },
        roleplay: { CHARACTER_FACTS: 0.4, RELATIONSHIPS: 0.3, LAST_SCENE: 0.3 },
        tool_qa: { SHORT_SUMMARY: 1 },
    };
    const ratios = baseRatios[intent] ?? baseRatios.auto;
    const effectiveTokens = Math.max(120, Math.floor(maxTokens * policy.contextMaxTokensShare));
    let allocated = 0;
    sections.forEach((section: InjectionSectionName, index: number): void => {
        const ratio = Number(ratios[section] ?? (1 / Math.max(sections.length, 1)));
        const budget = index === sections.length - 1
            ? Math.max(32, effectiveTokens - allocated)
            : Math.max(32, Math.floor(effectiveTokens * ratio));
        result[section] = budget;
        allocated += budget;
    });
    return result;
}

/**
 * 功能：构建最近一次策略决策结果。
 * @param intent 注入意图。
 * @param sectionsUsed 实际区段。
 * @param budgets 区段预算。
 * @param reasonCodes 原因代码。
 * @returns 决策结果对象。
 */
export function buildStrategyDecision(
    intent: InjectionIntent,
    sectionsUsed: InjectionSectionName[],
    budgets: Partial<Record<InjectionSectionName, number>>,
    reasonCodes: string[],
): StrategyDecision {
    return {
        intent,
        sectionsUsed,
        budgets,
        reasonCodes,
        generatedAt: Date.now(),
    };
}

/**
 * 功能：构建默认保留策略。
 * @param profile 聊天画像。
 * @returns 默认保留策略。
 */
export function buildRetentionPolicy(profile?: ChatProfile): RetentionPolicy {
    const normalizedProfile = { ...DEFAULT_CHAT_PROFILE, ...(profile ?? {}) };
    return {
        ...DEFAULT_RETENTION_POLICY,
        deletionStrategy: normalizedProfile.deletionStrategy,
        keepSummaryCount: normalizedProfile.summaryStrategy === 'timeline' ? 180 : normalizedProfile.summaryStrategy === 'short' ? 80 : 120,
        keepEventCount: normalizedProfile.memoryStrength === 'high' ? 1400 : normalizedProfile.memoryStrength === 'low' ? 600 : 1000,
        keepVectorDays: normalizedProfile.vectorStrategy.enabled ? 30 : 7,
    };
}
