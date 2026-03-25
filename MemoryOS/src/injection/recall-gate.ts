import type { EventEnvelope } from '../../../SDK/stx';
import type { ChatStateManager } from '../core/chat-state-manager';
import { classifyRecallNeed } from '../core/chat-strategy-engine';
import type { FactsManager } from '../core/facts-manager';
import type { LorebookEntryCandidate } from '../core/lorebook-relevance-gate';
import type { GroupMemoryState, InjectionIntent, LogicalChatView, LorebookGateDecision, MemoryCardLane, MemoryLifecycleState, MemoryTuningProfile, PersonaMemoryProfile, RecallCandidate, RecallGateDecision, RecallPlan, RelationshipState } from '../types';
import type { StateManager } from '../core/state-manager';
import type { SummariesManager } from '../core/summaries-manager';
import type { PreparedRecallContext } from './recall-context-builder';
import { collectRecallCandidates } from '../recall/recall-assembler';
import { normalizeText, extractKeywords } from '../recall/sources/shared';

/**
 * 功能：召回门控输入。
 * 参数：
 *   无。
 * 返回：
 *   无。
 */
export interface CheapRecallInput {
    chatKey: string;
    query: string;
    intent: InjectionIntent;
    plan: RecallPlan;
    recentEvents: Array<EventEnvelope<unknown>>;
    logicalView: LogicalChatView | null;
    groupMemory: GroupMemoryState | null;
    policy: import('../types').AdaptivePolicy;
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
    preparedContext: PreparedRecallContext;
    vectorGate?: RecallGateDecision | null;
}

/**
 * 功能：召回便宜层结果。
 * 参数：
 *   无。
 * 返回：
 *   无。
 */
export interface CheapRecallResult {
    candidates: RecallCandidate[];
    structuredCandidates: RecallCandidate[];
    recentEventCandidates: RecallCandidate[];
    visibleMessageWindow: string[];
    entityKeys: string[];
    primaryNeed: import('../types').RecallNeedKind;
    coveredLanes: MemoryCardLane[];
    structuredCount: number;
    recentEventCount: number;
    enough: boolean;
    isEnough: (intent: InjectionIntent) => boolean;
}

function dedupeLanes(lanes: MemoryCardLane[]): MemoryCardLane[] {
    return Array.from(new Set((Array.isArray(lanes) ? lanes : []).filter(Boolean)));
}

function dedupeStrings(values: string[]): string[] {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((item: string): string => normalizeText(item)).filter(Boolean)));
}

function mapNeedToLane(need: import('../types').RecallNeedKind): MemoryCardLane | null {
    if (need === 'identity_direct') return 'identity';
    if (need === 'relationship_direct') return 'relationship';
    if (need === 'rule_direct') return 'rule';
    if (need === 'state_direct') return 'state';
    if (need === 'style_inference') return 'style';
    if (need === 'historical_event' || need === 'causal_trace') return 'event';
    return null;
}

function inferLaneFromCandidate(candidate: RecallCandidate): MemoryCardLane {
    if (candidate.source === 'relationships') {
        return 'relationship';
    }
    if (candidate.source === 'state') {
        return 'state';
    }
    if (candidate.source === 'lorebook') {
        return 'rule';
    }
    if (candidate.source === 'events') {
        return 'event';
    }
    if (candidate.recordKind === 'summary') {
        return 'event';
    }
    return 'identity';
}

function isCheapEnough(input: CheapRecallResult, intent: InjectionIntent): boolean {
    if (intent === 'tool_qa') {
        return input.primaryNeed === 'rule_direct' && input.structuredCount > 0;
    }
    if (input.primaryNeed === 'identity_direct' || input.primaryNeed === 'relationship_direct' || input.primaryNeed === 'rule_direct' || input.primaryNeed === 'state_direct') {
        return input.coveredLanes.length > 0 && input.structuredCount > 0;
    }
    if (input.primaryNeed === 'style_inference') {
        return input.coveredLanes.includes('style') && input.structuredCount > 0;
    }
    if (input.primaryNeed === 'historical_event' || input.primaryNeed === 'causal_trace') {
        return input.recentEventCandidates.length > 0 || input.structuredCount >= 2;
    }
    if (input.primaryNeed === 'mixed') {
        return input.structuredCount >= 2 || input.recentEventCandidates.length >= 2;
    }
    return input.structuredCount >= 2 && input.coveredLanes.length > 0;
}

/**
 * 功能：汇总本轮便宜召回结果。
 * 参数：
 *   input：召回门控输入。
 * 返回：
 *   Promise<CheapRecallResult>：便宜召回结果。
 */
export async function collectCheapRecall(input: CheapRecallInput): Promise<CheapRecallResult> {
    const disabledGate: RecallGateDecision = {
        enabled: false,
        lanes: [],
        reasonCodes: ['cheap_layer_only'],
        primaryNeed: classifyRecallNeed({
            query: input.query,
            intent: input.intent,
            structuredCount: 0,
            coveredLanes: [],
            recentEventCount: input.recentEvents.length,
        }),
        vectorMode: input.policy.vectorMode,
    };
    const candidates = await collectRecallCandidates({
        chatKey: input.chatKey,
        plan: input.plan,
        query: input.preparedContext.recallQuery || input.query,
        recentEvents: input.recentEvents,
        logicalView: input.logicalView,
        groupMemory: input.groupMemory,
        policy: input.policy,
        lorebookDecision: input.lorebookDecision,
        lorebookEntries: input.lorebookEntries,
        factsManager: input.factsManager,
        stateManager: input.stateManager,
        summariesManager: input.summariesManager,
        chatStateManager: input.chatStateManager,
        lifecycleIndex: input.lifecycleIndex,
        activeActorKey: input.activeActorKey,
        personaProfiles: input.personaProfiles,
        personaProfile: input.personaProfile,
        tuningProfile: input.tuningProfile,
        relationships: input.relationships,
        fallbackRelationshipWeight: input.fallbackRelationshipWeight,
        vectorGate: disabledGate,
    });
    const visibleMessageWindow = (input.logicalView?.visibleMessages ?? [])
        .slice(-6)
        .map((item) => normalizeText(item.text))
        .filter(Boolean);
    const structuredCandidates = candidates.filter((candidate: RecallCandidate): boolean => candidate.source !== 'events');
    const recentEventCandidates = candidates.filter((candidate: RecallCandidate): boolean => candidate.source === 'events');
    const primaryNeed = classifyRecallNeed({
        query: input.query,
        intent: input.intent,
        structuredCount: structuredCandidates.length,
        coveredLanes: [],
        recentEventCount: recentEventCandidates.length,
    });
    const coveredLanes = dedupeLanes([
        mapNeedToLane(primaryNeed),
        ...structuredCandidates.map(inferLaneFromCandidate),
        ...recentEventCandidates.map(inferLaneFromCandidate),
    ].filter((item): item is MemoryCardLane => Boolean(item)));
    const entityKeys = dedupeStrings([
        input.preparedContext.activeActorKey,
        ...input.preparedContext.relationships.flatMap((item: RelationshipState): string[] => [
            item.actorKey,
            item.targetKey,
            ...(Array.isArray(item.participantKeys) ? item.participantKeys : []),
        ]),
        ...(Array.isArray(input.preparedContext.recallQueryTerms) ? input.preparedContext.recallQueryTerms : []),
        ...extractKeywords(input.preparedContext.recallQuery || input.query),
    ].filter((item: string | null | undefined): item is string => Boolean(item)));
    const cheapResult: CheapRecallResult = {
        candidates,
        structuredCandidates,
        recentEventCandidates,
        visibleMessageWindow,
        entityKeys,
        primaryNeed,
        coveredLanes,
        structuredCount: structuredCandidates.length,
        recentEventCount: recentEventCandidates.length,
        enough: false,
        isEnough: (intent: InjectionIntent): boolean => isCheapEnough(cheapResult, intent),
    };
    cheapResult.enough = cheapResult.isEnough(input.intent);
    return cheapResult;
}

/**
 * 功能：从门控结果中提炼应当参与向量召回的层。
 * 参数：
 *   cheap：便宜召回结果。
 *   gate：门控结果。
 * 返回：
 *   MemoryCardLane[]：允许参与向量召回的层。
 */
export function resolveRecallGateLanes(cheap: CheapRecallResult, gate: RecallGateDecision): MemoryCardLane[] {
    if (!gate.enabled) {
        return [];
    }
    if (gate.lanes.length > 0) {
        return dedupeLanes(gate.lanes);
    }
    return dedupeLanes([
        mapNeedToLane(cheap.primaryNeed),
        ...cheap.coveredLanes,
    ].filter((item): item is MemoryCardLane => Boolean(item)));
}
