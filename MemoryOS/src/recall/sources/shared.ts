import type { EventEnvelope } from '../../../../SDK/stx';
import { ChatStateManager } from '../../core/chat-state-manager';
import { FactsManager } from '../../core/facts-manager';
import {
    clamp01,
    detectEmotionTag,
    scoreRecallCandidate,
} from '../../core/memory-intelligence';
import type { LorebookEntryCandidate } from '../../core/lorebook-relevance-gate';
import { StateManager } from '../../core/state-manager';
import { SummariesManager } from '../../core/summaries-manager';
import type {
    AdaptivePolicy,
    GroupMemoryState,
    InjectionSectionName,
    InjectedMemoryTone,
    LogicalChatView,
    LorebookGateDecision,
    MemoryPrivacyClass,
    MemoryActorRetentionState,
    MemoryLifecycleState,
    MemorySourceScope,
    MemorySubtype,
    MemoryType,
    MemoryTuningProfile,
    PersonaMemoryProfile,
    RecallGateDecision,
    RecallCandidate,
    RecallCandidateRecordKind,
    RecallCandidateSource,
    RecallActorFocusTier,
    RecallViewpointReason,
    RecallPlan,
    RelationshipState,
    RecallVisibilityPool,
} from '../../types';

export { clamp01 };

export type FactRecord = {
    factKey?: string;
    type?: string;
    path?: string;
    value?: unknown;
    entity?: {
        kind?: string;
        id?: string;
    };
    confidence?: number;
    encodeScore?: number;
    updatedAt?: number;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    sourceScope?: MemorySourceScope;
    ownerActorKey?: string | null;
};

export type SummaryRecord = {
    summaryId?: string;
    level?: string;
    title?: string;
    content?: string;
    encodeScore?: number;
    createdAt?: number;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    sourceScope?: MemorySourceScope;
    ownerActorKey?: string | null;
};

export type RecallSourceContext = {
    chatKey: string;
    plan: RecallPlan;
    query: string;
    vectorGate?: RecallGateDecision | null;
    recentEvents: Array<EventEnvelope<unknown>>;
    logicalView: LogicalChatView | null;
    groupMemory: GroupMemoryState | null;
    policy: AdaptivePolicy;
    lorebookDecision: LorebookGateDecision;
    lorebookEntries: LorebookEntryCandidate[];
    factsManager: FactsManager;
    stateManager: StateManager;
    summariesManager: SummariesManager;
    chatStateManager: ChatStateManager | null;
    lifecycleIndex: Map<string, MemoryLifecycleState>;
    activeActorKey: string | null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
    personaProfile: PersonaMemoryProfile | null;
    tuningProfile: MemoryTuningProfile | null;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
};

type CandidateVisibilityInput = {
    recordKey: string;
    recordKind: RecallCandidateRecordKind;
    source: RecallCandidateSource;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    sourceScope?: MemorySourceScope;
    ownerActorKey?: string | null;
    participantActorKeys?: string[];
};

export type CandidateVisibilityClassification = {
    privacyClass: MemoryPrivacyClass;
    viewpointReason: RecallViewpointReason;
    visibilityPool: RecallVisibilityPool;
    actorFocusTier: RecallActorFocusTier;
    actorVisibilityScore: number;
    actorForgetProbability?: number;
    actorForgotten?: boolean;
    actorRetentionBias?: number;
    reasonCodes: string[];
};

const DIRECT_SHARED_SUBTYPES: Set<string> = new Set<string>(['current_scene', 'current_conflict', 'global_rule', 'world_history']);
const DIRECT_PRIVATE_SUBTYPES: Set<string> = new Set<string>(['secret', 'promise', 'emotion_imprint', 'bond', 'identity']);
const PRIVATE_PREF_SCOPE: Set<string> = new Set<string>(['self', 'target']);
const SHARED_SCOPE: Set<string> = new Set<string>(['group', 'world', 'system']);

export function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value == null) {
        return '';
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

export function extractKeywords(query: string): string[] {
    return Array.from(
        new Set(
            normalizeText(query)
                .toLowerCase()
                .split(/[\s,，。！？；:：()\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
                .map((item: string): string => item.trim())
                .filter((item: string): boolean => item.length >= 2),
        ),
    ).slice(0, 12);
}

const ENTITY_QUERY_STOPWORDS: Set<string> = new Set<string>([
    '什么',
    '是什么',
    '设定',
    '定义',
    '含义',
    '背景',
    '来历',
    '用途',
    '作用',
    '位置',
    '地点',
    '概况',
    '信息',
    '介绍',
    '一下',
    '说明',
    '请问',
    '告诉我',
    '关于',
    '哪里',
    '在哪',
    '在哪儿',
]);

/**
 * 功能：清理实体问句中包裹目标词的常见虚词与问句尾巴。
 * @param value 原始片段。
 * @returns 清理后的实体候选文本。
 */
function trimEntityFocusTerm(value: string): string {
    return normalizeText(value)
        .toLowerCase()
        .replace(/^[“"'《【\[(]+/, '')
        .replace(/[”"'》】\])]+$/g, '')
        .replace(/^(请问|告诉我|我想知道|想知道|关于|介绍一下|介绍|说明一下|说明)+/g, '')
        .replace(/(的)?(设定|定义|含义|背景|来历|用途|作用|位置|地点|概况|信息|情况)$/g, '')
        .replace(/(是什么|是啥|在哪里|在哪儿|在哪|位于哪里|有什么|叫什么|怎么样|呢|呀|啊|吧)+$/g, '')
        .replace(/^[的是关于]+/g, '')
        .replace(/[的是呢呀啊吧]+$/g, '')
        .trim();
}

/**
 * 功能：从名词问句里提取更适合做精确匹配的实体词。
 * @param query 用户查询。
 * @returns 实体词列表。
 */
export function extractEntityFocusTerms(query: string): string[] {
    const normalizedQuery = normalizeText(query).toLowerCase();
    if (!normalizedQuery) {
        return [];
    }
    const candidates = new Set<string>();
    const pushTerm = (value: string): void => {
        const trimmedValue = trimEntityFocusTerm(value);
        if (!trimmedValue || trimmedValue.length < 2 || ENTITY_QUERY_STOPWORDS.has(trimmedValue)) {
            return;
        }
        candidates.add(trimmedValue);
    };

    pushTerm(normalizedQuery);

    const patterns: RegExp[] = [
        /^什么是(.+)$/,
        /^(.+?)是什么(?:地方|东西|意思|设定|规则|情况)?$/,
        /^(.+?)的?(?:设定|定义|含义|背景|来历|用途|作用|位置|地点|概况|信息|情况)是什么$/,
        /^介绍(?:一下)?(.+)$/,
        /^说明(?:一下)?(.+)$/,
        /^关于(.+?)(?:的?(?:设定|定义|含义|背景|来历|用途|作用|位置|地点|概况|信息|情况))?$/,
        /^(.+?)(?:在哪里|在哪儿|在哪|位于哪里)$/,
    ];
    patterns.forEach((pattern: RegExp): void => {
        const matched = normalizedQuery.match(pattern);
        if (!matched?.[1]) {
            return;
        }
        pushTerm(matched[1]);
    });

    return Array.from(candidates)
        .filter((value: string): boolean => value.length >= 2 && !ENTITY_QUERY_STOPWORDS.has(value))
        .sort((left: string, right: string): number => right.length - left.length)
        .slice(0, 6);
}

/**
 * 功能：计算实体词在候选标题与正文中的精确命中加权。
 * @param query 用户查询。
 * @param title 候选标题。
 * @param rawText 候选正文。
 * @returns 命中加权结果。
 */
export function computeExactEntityMatchScore(
    query: string,
    title: string,
    rawText: string,
): {
    score: number;
    reasonCodes: string[];
} {
    const entityTerms = extractEntityFocusTerms(query);
    if (entityTerms.length <= 0) {
        return { score: 0, reasonCodes: [] };
    }
    const normalizedTitle = normalizeText(title).toLowerCase();
    const normalizedRawText = normalizeText(rawText).toLowerCase();
    const titleHitCount = entityTerms.filter((term: string): boolean => normalizedTitle.includes(term)).length;
    const bodyHitCount = entityTerms.filter((term: string): boolean => normalizedRawText.includes(term)).length;
    if (titleHitCount <= 0 && bodyHitCount <= 0) {
        return { score: 0, reasonCodes: [] };
    }
    const titleHitScore = titleHitCount > 0 ? (titleHitCount / entityTerms.length) * 0.22 : 0;
    const bodyHitScore = bodyHitCount > 0 ? (bodyHitCount / entityTerms.length) * 0.14 : 0;
    const reasonCodes: string[] = [];
    if (titleHitCount > 0) {
        reasonCodes.push('entity_title_exact_match');
    }
    if (bodyHitCount > 0) {
        reasonCodes.push('entity_exact_match');
    }
    return {
        score: clamp01(titleHitScore + bodyHitScore),
        reasonCodes,
    };
}

export function countKeywordHit(text: string, keywords: string[]): number {
    if (keywords.length <= 0) {
        return 0;
    }
    return keywords.reduce((count: number, keyword: string): number => count + (text.includes(keyword) ? 1 : 0), 0);
}

export function formatLineByTone(line: string, tone: InjectedMemoryTone): string {
    if (tone === 'possible_misremember') {
        return `- 也许记错了：${line}`;
    }
    if (tone === 'blurred_recall') {
        return `- 依稀记得：${line}`;
    }
    if (tone === 'clear_recall') {
        return `- 清晰回忆：${line}`;
    }
    return `- ${line}`;
}

export function resolveRelationshipWeight(text: string, relationships: RelationshipState[], fallbackWeight: number): number {
    const normalizedText = normalizeText(text).toLowerCase();
    let bestWeight = 0;
    relationships.forEach((item: RelationshipState): void => {
        const participantKeys = Array.isArray(item.participantKeys) ? item.participantKeys : [item.actorKey, item.targetKey];
        const fragments = Array.isArray(item.sharedFragments) ? item.sharedFragments : [];
        const matchedByParticipant = participantKeys.some((key: string): boolean => {
            const token = normalizeText(key).toLowerCase();
            return token.length >= 2 && normalizedText.includes(token);
        });
        const matchedByFragment = fragments.some((fragment: string): boolean => {
            const token = normalizeText(fragment).toLowerCase();
            return token.length >= 2 && normalizedText.includes(token.slice(0, Math.min(24, token.length)));
        });
        if (!matchedByParticipant && !matchedByFragment) {
            return;
        }
        const weight = clamp01(
            item.familiarity * 0.14
            + item.trust * 0.22
            + item.affection * 0.22
            + item.respect * 0.14
            + item.dependency * 0.12
            + item.unresolvedConflict * 0.16,
        );
        bestWeight = Math.max(bestWeight, weight);
    });
    return bestWeight > 0 ? bestWeight : fallbackWeight * 0.45;
}

export function readLifecycle(context: RecallSourceContext, recordKey: string): MemoryLifecycleState | null {
    return context.lifecycleIndex.get(recordKey) ?? null;
}

/**
 * 功能：读取指定角色对某条记录的保留状态。
 * 参数：
 *   context：召回上下文。
 *   recordKey：记录键。
 *   actorKey：角色键。
 * 返回：
 *   MemoryActorRetentionState | null：角色保留状态。
 */
export function readActorRetention(context: RecallSourceContext, recordKey: string, actorKey: string): MemoryActorRetentionState | null {
    const normalizedActorKey = normalizeText(actorKey);
    if (!normalizedActorKey) {
        return null;
    }
    const lifecycle = readLifecycle(context, recordKey);
    if (!lifecycle) {
        return null;
    }
    const mappedRetention = lifecycle.perActorMetrics?.[normalizedActorKey] ?? null;
    if (mappedRetention) {
        return mappedRetention;
    }
    if (normalizeText(lifecycle.ownerActorKey) !== normalizedActorKey) {
        return null;
    }
    return {
        actorKey: normalizedActorKey,
        stage: lifecycle.stage,
        forgetProbability: clamp01(Number(lifecycle.forgetProbability ?? 0)),
        forgotten: lifecycle.forgotten === true,
        forgottenAt: lifecycle.forgottenAt,
        forgottenReasonCodes: Array.isArray(lifecycle.forgottenReasonCodes) ? [...lifecycle.forgottenReasonCodes] : [],
        rehearsalCount: Math.max(0, Number(lifecycle.rehearsalCount ?? 0) || 0),
        lastRecalledAt: Math.max(0, Number(lifecycle.lastRecalledAt ?? 0) || 0),
        retentionBias: 0,
        confidence: clamp01(1 - Number(lifecycle.forgetProbability ?? 0)),
        updatedAt: Math.max(0, Number(lifecycle.updatedAt ?? 0) || 0),
    };
}

/**
 * 功能：判断候选是否符合当前视角。
 * 参数：
 *   context：召回上下文。
 *   params：候选基础参数。
 *   lifecycle：候选生命周期。
 * 返回：
 *   CandidateVisibilityClassification：可见性分类结果。
 */
/**
 * 功能：先按内容语义给记忆贴上共享 / 私人 / 上下文标签。
 * 参数：
 *   context：召回上下文。
 *   params：候选基础参数。
 *   lifecycle：候选生命周期。
 * 返回：
 *   CandidateVisibilityClassification：可见性分类结果。
 */
export function classifyMemoryPrivacy(
    _context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
): CandidateVisibilityClassification {
    const memoryType = normalizeText(params.memoryType ?? lifecycle?.memoryType ?? '').toLowerCase();
    const memorySubtype = normalizeText(params.memorySubtype ?? lifecycle?.memorySubtype ?? '').toLowerCase();
    const sourceScope = normalizeText(params.sourceScope ?? lifecycle?.sourceScope ?? '').toLowerCase();
    const ownerActorKey = normalizeText(params.ownerActorKey ?? lifecycle?.ownerActorKey ?? '');
    const isRelationshipSignal = params.recordKind === 'relationship' || params.source === 'relationships';
    const isEventSignal = params.recordKind === 'event' || params.source === 'events';
    const sharedSourceHint = params.source === 'lorebook' || params.source === 'state' || params.source === 'summaries';

    if (
        memoryType === 'world'
        || DIRECT_SHARED_SUBTYPES.has(memorySubtype)
        || (isEventSignal && !ownerActorKey)
        || (params.source === 'state' && !ownerActorKey)
        || (params.source === 'lorebook' && !ownerActorKey)
        || (params.source === 'summaries' && !ownerActorKey && !DIRECT_PRIVATE_SUBTYPES.has(memorySubtype))
        || (sharedSourceHint && SHARED_SCOPE.has(sourceScope) && !ownerActorKey)
    ) {
        return {
            privacyClass: 'shared',
            viewpointReason: 'shared',
            visibilityPool: 'global',
            actorFocusTier: 'shared',
            actorVisibilityScore: 0.7,
            reasonCodes: ['privacy:shared_direct'],
        };
    }

    if (
        DIRECT_PRIVATE_SUBTYPES.has(memorySubtype)
        || (memorySubtype === 'preference' && !SHARED_SCOPE.has(sourceScope))
    ) {
        return {
            privacyClass: 'private',
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            reasonCodes: ['privacy:private_direct'],
        };
    }

    if (SHARED_SCOPE.has(sourceScope) && !ownerActorKey) {
        return {
            privacyClass: 'shared',
            viewpointReason: 'shared',
            visibilityPool: 'global',
            actorFocusTier: 'shared',
            actorVisibilityScore: 0.7,
            reasonCodes: ['privacy:shared_scope'],
        };
    }

    if (PRIVATE_PREF_SCOPE.has(sourceScope)) {
        return {
            privacyClass: 'private',
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            reasonCodes: ['privacy:private_scope'],
        };
    }

    if (ownerActorKey) {
        return {
            privacyClass: 'contextual',
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            reasonCodes: ['privacy:owner_context'],
        };
    }

    if (isRelationshipSignal) {
        return {
            privacyClass: 'contextual',
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            reasonCodes: ['privacy:relationship_context'],
        };
    }

    return {
        privacyClass: 'contextual',
        viewpointReason: 'foreign_private_suppressed',
        visibilityPool: 'blocked',
        actorFocusTier: 'blocked',
        actorVisibilityScore: 0,
        reasonCodes: ['privacy:contextual'],
    };
}

function resolveFocusActorTier(
    context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
    privacy: CandidateVisibilityClassification,
): RecallActorFocusTier {
    if (privacy.privacyClass === 'private') {
        return 'blocked';
    }
    if (context.plan.viewpoint.mode === 'omniscient_director') {
        return privacy.visibilityPool === 'global' ? 'shared' : 'blocked';
    }
    if (privacy.visibilityPool === 'global') {
        return 'shared';
    }
    const focus = context.plan.viewpoint.focus;
    const primaryActorKey = normalizeText(focus.primaryActorKey ?? '');
    const secondaryActorKeys = new Set((focus.secondaryActorKeys ?? []).map((actorKey: string): string => normalizeText(actorKey)));
    const ownerActorKey = normalizeText(params.ownerActorKey ?? lifecycle?.ownerActorKey ?? '');
    const participantActorKeys = new Set((params.participantActorKeys ?? []).map((actorKey: string): string => normalizeText(actorKey)).filter(Boolean));
    const isRelationshipSignal = params.recordKind === 'relationship' || params.source === 'relationships';
    if (primaryActorKey) {
        if (ownerActorKey && ownerActorKey === primaryActorKey) {
            return 'primary';
        }
        if (isRelationshipSignal && participantActorKeys.has(primaryActorKey)) {
            return 'primary';
        }
    }
    if (ownerActorKey && secondaryActorKeys.has(ownerActorKey)) {
        return 'secondary';
    }
    if (isRelationshipSignal) {
        for (const actorKey of participantActorKeys) {
            if (secondaryActorKeys.has(actorKey)) {
                return 'secondary';
            }
        }
    }
    if (primaryActorKey && ownerActorKey && ownerActorKey === primaryActorKey) {
        return 'primary';
    }
    return 'blocked';
}

/**
 * 功能：在内容语义基础上结合当前视角，决定可见池与角色边界。
 * 参数：
 *   context：召回上下文。
 *   params：候选基础参数。
 *   lifecycle：候选生命周期。
 *   privacy：内容语义分类结果。
 * 返回：
 *   CandidateVisibilityClassification：最终可见性分类。
 */
export function resolveViewpointVisibility(
    context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
    privacy: CandidateVisibilityClassification,
): CandidateVisibilityClassification {
    const activeActorKey = normalizeText(context.activeActorKey ?? context.plan.viewpoint.activeActorKey ?? '');
    const hasActiveActorKey = Boolean(activeActorKey);
    const ownerActorKey = normalizeText(params.ownerActorKey ?? lifecycle?.ownerActorKey ?? '');
    const actorRetention = hasActiveActorKey ? readActorRetention(context, params.recordKey, activeActorKey) : null;
    const actorForgetProbability = clamp01(Number(actorRetention?.forgetProbability ?? lifecycle?.forgetProbability ?? 0));
    const actorForgotten = actorRetention?.forgotten === true || lifecycle?.forgotten === true;
    const actorRetentionBias = Number(actorRetention?.retentionBias ?? 0) || 0;
    const ownsMemory = hasActiveActorKey && ownerActorKey && ownerActorKey === activeActorKey;
    const retainedForActor = Boolean(actorRetention && !actorRetention.forgotten);
    const actorFocusTier = resolveFocusActorTier(context, params, lifecycle, privacy);

    if (actorForgotten) {
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            actorForgetProbability,
            actorForgotten: true,
            actorRetentionBias,
            reasonCodes: [...privacy.reasonCodes, 'viewpoint:foreign_private_suppressed', 'blocked:actor_forgotten', 'foreign_private_memory_suppressed'],
        };
    }

    if (context.plan.viewpoint.mode === 'omniscient_director') {
        if (privacy.privacyClass === 'shared') {
            return {
                privacyClass: privacy.privacyClass,
                viewpointReason: 'shared',
                visibilityPool: 'global',
                actorFocusTier: 'shared',
                actorVisibilityScore: 0.7,
                actorForgetProbability,
                actorForgotten: false,
                actorRetentionBias,
                reasonCodes: [...privacy.reasonCodes, 'viewpoint:shared', 'pool:global'],
            };
        }
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: 'foreign_private_suppressed',
            visibilityPool: 'blocked',
            actorFocusTier: 'blocked',
            actorVisibilityScore: 0,
            actorForgetProbability,
            actorForgotten: false,
            actorRetentionBias,
            reasonCodes: [...privacy.reasonCodes, 'viewpoint:foreign_private_suppressed', 'blocked:foreign_private', 'foreign_private_memory_suppressed'],
        };
    }

    if (privacy.privacyClass === 'shared') {
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: 'shared',
            visibilityPool: 'global',
            actorFocusTier: 'shared',
            actorVisibilityScore: 0.7,
            actorForgetProbability,
            actorForgotten: false,
            actorRetentionBias,
            reasonCodes: [...privacy.reasonCodes, 'viewpoint:shared', 'pool:global', 'focus:shared'],
        };
    }
    if (actorFocusTier === 'primary' && hasActiveActorKey) {
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: ownsMemory ? 'owned_by_actor' : 'retained_for_actor',
            visibilityPool: 'actor',
            actorFocusTier: 'primary',
            actorVisibilityScore: 1,
            actorForgetProbability,
            actorForgotten: false,
            actorRetentionBias,
            reasonCodes: [
                ...privacy.reasonCodes,
                ownsMemory ? 'viewpoint:owned_by_actor' : 'viewpoint:retained_for_actor',
                'pool:actor',
                'focus:primary_actor',
                ...(ownsMemory ? ['visibility:self_owner'] : ['visibility:actor_retained']),
            ],
        };
    }
    if (actorFocusTier === 'secondary') {
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: 'retained_for_actor',
            visibilityPool: 'actor',
            actorFocusTier: 'secondary',
            actorVisibilityScore: 0.86,
            actorForgetProbability,
            actorForgotten: false,
            actorRetentionBias,
            reasonCodes: [...privacy.reasonCodes, 'viewpoint:retained_for_actor', 'pool:actor', 'focus:secondary_actor', 'visibility:actor_retained'],
        };
    }
    if (retainedForActor) {
        return {
            privacyClass: privacy.privacyClass,
            viewpointReason: 'retained_for_actor',
            visibilityPool: 'actor',
            actorFocusTier: 'primary',
            actorVisibilityScore: 0.86,
            actorForgetProbability,
            actorForgotten: false,
            actorRetentionBias,
            reasonCodes: [...privacy.reasonCodes, 'viewpoint:retained_for_actor', 'pool:actor', 'focus:primary_actor', 'visibility:actor_retained'],
        };
    }
    return {
        privacyClass: privacy.privacyClass,
        viewpointReason: 'foreign_private_suppressed',
        visibilityPool: 'blocked',
        actorFocusTier: 'blocked',
        actorVisibilityScore: 0,
        actorForgetProbability,
        actorForgotten: false,
        actorRetentionBias,
        reasonCodes: [...privacy.reasonCodes, 'viewpoint:foreign_private_suppressed', 'blocked:foreign_private', 'foreign_private_memory_suppressed'],
    };
}

export function classifyCandidateVisibility(
    context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
): CandidateVisibilityClassification {
    return resolveViewpointVisibility(
        context,
        params,
        lifecycle,
        classifyMemoryPrivacy(context, params, lifecycle),
    );
}

/**
 * 功能：计算候选的角色可见性分。
 * 参数：
 *   context：召回上下文。
 *   params：候选基础参数。
 *   lifecycle：候选生命周期。
 * 返回：
 *   number：可见性分。
 */
export function computeActorVisibilityScore(
    context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
): number {
    return classifyCandidateVisibility(context, params, lifecycle).actorVisibilityScore;
}

/**
 * 功能：判断候选是否允许进入当前视角。
 * 参数：
 *   context：召回上下文。
 *   params：候选基础参数。
 *   lifecycle：候选生命周期。
 * 返回：
 *   boolean：是否允许进入召回流程。
 */
export function shouldIncludeCandidateForViewpoint(
    context: RecallSourceContext,
    params: CandidateVisibilityInput,
    lifecycle: MemoryLifecycleState | null,
): boolean {
    return classifyCandidateVisibility(context, params, lifecycle).visibilityPool !== 'blocked';
}

export function isCharacterFact(fact: FactRecord): boolean {
    const entityKind = normalizeText(fact.entity?.kind).toLowerCase();
    const path = normalizeText(fact.path).toLowerCase();
    return /character|persona|npc|player|role|人物|角色/.test(entityKind)
        || /persona|profile|trait|identity|name|status|人设|性格|身份|名字/.test(path);
}

export function isRelationshipFact(fact: FactRecord): boolean {
    const typeText = normalizeText(fact.type).toLowerCase();
    const pathText = normalizeText(fact.path).toLowerCase();
    return /relationship|relation|bond|ally|enemy|friend|关系|阵营|同伴|敌对/.test(`${typeText} ${pathText}`);
}

export async function loadFacts(context: RecallSourceContext): Promise<FactRecord[]> {
    const facts = await context.factsManager.query({ limit: 160 }) as FactRecord[];
    if (!context.chatStateManager) {
        return facts;
    }
    const filtered = await Promise.all(
        facts.map(async (fact: FactRecord): Promise<FactRecord | null> => {
            const factKey = normalizeText(fact.factKey);
            if (factKey && await context.chatStateManager!.isFactArchived(factKey)) {
                return null;
            }
            return fact;
        }),
    );
    return filtered.filter((item: FactRecord | null): item is FactRecord => item != null);
}

export async function loadRecentSummaries(context: RecallSourceContext): Promise<SummaryRecord[]> {
    const [arc, scene, message] = await Promise.all([
        context.summariesManager.query({ level: 'arc', limit: 12 }),
        context.summariesManager.query({ level: 'scene', limit: 16 }),
        context.summariesManager.query({ level: 'message', limit: 16 }),
    ]) as [SummaryRecord[], SummaryRecord[], SummaryRecord[]];
    const summaries = [...arc, ...scene, ...message];
    if (!context.chatStateManager) {
        return summaries;
    }
    const filtered = await Promise.all(
        summaries.map(async (summary: SummaryRecord): Promise<SummaryRecord | null> => {
            const summaryId = normalizeText(summary.summaryId);
            if (summaryId && await context.chatStateManager!.isSummaryArchived(summaryId)) {
                return null;
            }
            return summary;
        }),
    );
    return filtered.filter((item: SummaryRecord | null): item is SummaryRecord => item != null);
}

export function readEventPayloadText(payload: unknown): string {
    if (typeof payload === 'string') {
        return normalizeText(payload);
    }
    if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        return normalizeText(record.text ?? record.content ?? record.message ?? record.summary ?? JSON.stringify(record));
    }
    return '';
}

export function readSourceLimit(context: RecallSourceContext, source: RecallCandidateSource, fallback: number): number {
    return Math.max(0, Number(context.plan.sourceLimits[source] ?? fallback));
}

export function buildScoredCandidate(context: RecallSourceContext, params: {
    candidateId: string;
    recordKey: string;
    recordKind: RecallCandidateRecordKind;
    source: RecallCandidateSource;
    sectionHint: InjectionSectionName | null;
    title: string;
    rawText: string;
    confidence: number;
    updatedAt: number;
    memoryType?: MemoryType;
    memorySubtype?: MemorySubtype;
    sourceScope?: MemorySourceScope;
    ownerActorKey?: string | null;
    participantActorKeys?: string[];
    continuityScore?: number;
    relationshipScore?: number;
    emotionScore?: number;
    conflictPenalty?: number;
    privacyPenalty?: number;
    vectorScore?: number;
    recencyWindowDays?: number;
    extraReasonCodes?: string[];
}): RecallCandidate | null {
    const rawText = normalizeText(params.rawText);
    if (!rawText) {
        return null;
    }
    const keywords = extractKeywords(context.query);
    const entityMatch = computeExactEntityMatchScore(context.query, String(params.title ?? ''), rawText);
    const normalizedText = rawText.toLowerCase();
    const lifecycle = readLifecycle(context, params.recordKey);
    const visibility = classifyCandidateVisibility(context, {
        recordKey: params.recordKey,
        recordKind: params.recordKind,
        source: params.source,
        memoryType: params.memoryType ?? lifecycle?.memoryType,
        memorySubtype: params.memorySubtype ?? lifecycle?.memorySubtype,
        sourceScope: params.sourceScope ?? lifecycle?.sourceScope,
        ownerActorKey: params.ownerActorKey ?? lifecycle?.ownerActorKey ?? null,
        participantActorKeys: params.participantActorKeys ?? [],
    }, lifecycle);
    const relationshipScore = Number(params.relationshipScore ?? (lifecycle?.relationScope ? resolveRelationshipWeight(rawText, context.relationships, context.fallbackRelationshipWeight) : 0)) || 0;
    const emotionScore = Number(params.emotionScore ?? (lifecycle?.emotionTag || detectEmotionTag(rawText) ? 1 : 0)) || 0;
    const recencyWindowMs = Math.max(1, Number(params.recencyWindowDays ?? 30)) * 24 * 60 * 60 * 1000;
    const updatedAt = Number(params.updatedAt ?? 0) || Date.now();
    const recencyScore = clamp01(1 - ((Date.now() - updatedAt) / recencyWindowMs));
    const keywordScore = keywords.length > 0 ? countKeywordHit(normalizedText, keywords) / Math.max(1, keywords.length) : 0;
    const continuityScore = Math.max(
        Number(params.continuityScore ?? (normalizeText(context.query) && normalizedText.includes(normalizeText(context.query).toLowerCase()) ? 1 : keywordScore > 0 ? 0.72 : 0.3)) || 0,
        entityMatch.score > 0 ? 0.7 + entityMatch.score * 0.25 : 0,
    );
    const privacyPenalty = Number(params.privacyPenalty ?? (/秘密|隐私|private|secret/.test(rawText) ? 1 : 0)) || 0;
    const conflictPenalty = Number(params.conflictPenalty ?? (lifecycle?.stage === 'distorted' ? 0.5 : 0)) || 0;
    const vectorScore = Number(params.vectorScore ?? 0) || 0;
    const actorForgetProbability = visibility.actorForgetProbability ?? lifecycle?.forgetProbability ?? 0;
    const result = scoreRecallCandidate({
        text: rawText,
        keywords,
        confidence: clamp01(Number(params.confidence ?? 0.55)),
        recencyScore,
        lifecycle,
        actorVisibilityScore: visibility.actorVisibilityScore,
        actorForgetProbability,
        actorForgotten: visibility.actorForgotten === true,
        actorRetentionBias: visibility.actorRetentionBias,
        profile: context.personaProfile ?? {
            profileVersion: 'persona.v1',
            totalCapacity: 0.6,
            eventMemory: 0.6,
            factMemory: 0.6,
            emotionalBias: 0.5,
            relationshipSensitivity: 0.5,
            forgettingSpeed: 0.45,
            distortionTendency: 0.2,
            selfNarrativeBias: 0.5,
            privacyGuard: 0.45,
            allowDistortion: false,
            derivedFrom: [],
            updatedAt: 0,
        },
        relationshipWeight: relationshipScore,
        emotionWeight: emotionScore,
        continuityWeight: continuityScore,
        privacyPenalty,
        conflictPenalty,
        tuning: context.tuningProfile,
    });
    const stageReason = lifecycle?.stage ? [`stage:${lifecycle.stage}`] : [];
    const visibilityReasonCodes = Array.from(new Set([
        `viewpoint:${visibility.viewpointReason}`,
        ...visibility.reasonCodes,
        ...(visibility.visibilityPool === 'actor' ? [`visibility_score:${visibility.actorVisibilityScore.toFixed(2)}`] : []),
        ...(actorForgetProbability >= 0.75 ? ['actor_forget_risk'] : []),
    ]));
    const tone = visibility.actorForgotten || actorForgetProbability >= 0.75
        ? 'possible_misremember'
        : result.tone;
    const boostedFinalScore = clamp01(
        (visibility.visibilityPool === 'blocked' ? Math.max(0, result.score * 0.12) : result.score)
        + entityMatch.score,
    );
    return {
        candidateId: params.candidateId,
        recordKey: params.recordKey,
        recordKind: params.recordKind,
        source: params.source,
        sectionHint: params.sectionHint,
        title: normalizeText(params.title) || normalizeText(params.recordKey),
        rawText,
        renderedLine: formatLineByTone(rawText, tone),
        confidence: clamp01(Number(params.confidence ?? 0.55)),
        updatedAt,
        keywordScore,
        vectorScore,
        recencyScore,
        continuityScore,
        relationshipScore,
        emotionScore,
        conflictPenalty,
        privacyPenalty,
        visibilityPool: visibility.visibilityPool,
        privacyClass: visibility.privacyClass,
        viewpointReason: visibility.viewpointReason,
        actorFocusTier: visibility.actorFocusTier,
        actorVisibilityScore: visibility.actorVisibilityScore,
        actorForgetProbability,
        actorForgotten: visibility.actorForgotten === true,
        actorRetentionBias: visibility.actorRetentionBias,
        ownerActorKey: normalizeText(params.ownerActorKey ?? lifecycle?.ownerActorKey ?? '') || null,
        participantActorKeys: Array.from(new Set((params.participantActorKeys ?? []).map((item: string): string => normalizeText(item)).filter(Boolean))),
        finalScore: boostedFinalScore,
        tone,
        selected: false,
        reasonCodes: Array.from(new Set([...(params.extraReasonCodes ?? []), ...stageReason, ...visibilityReasonCodes, ...entityMatch.reasonCodes, ...result.reasonCodes, `source:${params.source}`])),
    };
}

export function uniqueCandidates(candidates: Array<RecallCandidate | null>): RecallCandidate[] {
    const seen = new Set<string>();
    return candidates.reduce<RecallCandidate[]>((result: RecallCandidate[], candidate: RecallCandidate | null): RecallCandidate[] => {
        if (!candidate) {
            return result;
        }
        const uniqueKey = `${candidate.candidateId}::${candidate.sectionHint ?? 'NONE'}`;
        if (seen.has(uniqueKey)) {
            return result;
        }
        seen.add(uniqueKey);
        result.push(candidate);
        return result;
    }, []);
}
