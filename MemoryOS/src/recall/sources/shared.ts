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
    MemoryLifecycleState,
    MemoryTuningProfile,
    PersonaMemoryProfile,
    RecallCandidate,
    RecallCandidateRecordKind,
    RecallCandidateSource,
    RecallPlan,
    RelationshipState,
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
};

export type SummaryRecord = {
    summaryId?: string;
    level?: string;
    title?: string;
    content?: string;
    encodeScore?: number;
    createdAt?: number;
};

export type RecallSourceContext = {
    chatKey: string;
    plan: RecallPlan;
    query: string;
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
    personaProfile: PersonaMemoryProfile | null;
    tuningProfile: MemoryTuningProfile | null;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
};

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
    const normalizedText = rawText.toLowerCase();
    const lifecycle = readLifecycle(context, params.recordKey);
    const relationshipScore = Number(params.relationshipScore ?? (lifecycle?.relationScope ? resolveRelationshipWeight(rawText, context.relationships, context.fallbackRelationshipWeight) : 0)) || 0;
    const emotionScore = Number(params.emotionScore ?? (lifecycle?.emotionTag || detectEmotionTag(rawText) ? 1 : 0)) || 0;
    const recencyWindowMs = Math.max(1, Number(params.recencyWindowDays ?? 30)) * 24 * 60 * 60 * 1000;
    const updatedAt = Number(params.updatedAt ?? 0) || Date.now();
    const recencyScore = clamp01(1 - ((Date.now() - updatedAt) / recencyWindowMs));
    const keywordScore = keywords.length > 0 ? countKeywordHit(normalizedText, keywords) / Math.max(1, keywords.length) : 0;
    const continuityScore = Number(params.continuityScore ?? (normalizeText(context.query) && normalizedText.includes(normalizeText(context.query).toLowerCase()) ? 1 : keywordScore > 0 ? 0.72 : 0.3)) || 0;
    const privacyPenalty = Number(params.privacyPenalty ?? (/秘密|隐私|private|secret/.test(rawText) ? 1 : 0)) || 0;
    const conflictPenalty = Number(params.conflictPenalty ?? (lifecycle?.stage === 'distorted' ? 0.5 : 0)) || 0;
    const vectorScore = Number(params.vectorScore ?? 0) || 0;
    const result = scoreRecallCandidate({
        text: rawText,
        keywords,
        confidence: clamp01(Number(params.confidence ?? 0.55)),
        recencyScore,
        lifecycle,
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
    return {
        candidateId: params.candidateId,
        recordKey: params.recordKey,
        recordKind: params.recordKind,
        source: params.source,
        sectionHint: params.sectionHint,
        title: normalizeText(params.title) || normalizeText(params.recordKey),
        rawText,
        renderedLine: formatLineByTone(rawText, result.tone),
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
        finalScore: result.score,
        tone: result.tone,
        selected: false,
        reasonCodes: Array.from(new Set([...(params.extraReasonCodes ?? []), ...stageReason, ...result.reasonCodes, `source:${params.source}`])),
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