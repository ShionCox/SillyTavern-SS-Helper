import type { EventEnvelope } from '../../../SDK/stx';
import { ChatStateManager } from '../core/chat-state-manager';
import { FactsManager } from '../core/facts-manager';
import type { LorebookEntryCandidate } from '../core/lorebook-relevance-gate';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import type {
    AdaptivePolicy,
    GroupMemoryState,
    LogicalChatView,
    LorebookGateDecision,
    MemoryLifecycleState,
    MemoryTuningProfile,
    PersonaMemoryProfile,
    RecallGateDecision,
    RecallCandidate,
    RecallPlan,
    RelationshipState,
} from '../types';
import { collectFactRecallCandidates } from './sources/fact-source';
import { collectLorebookRecallCandidates } from './sources/lorebook-source';
import { collectRecentRecallCandidates } from './sources/recent-source';
import { collectRelationshipRecallCandidates } from './sources/relationship-source';
import { collectStateRecallCandidates } from './sources/state-source';
import { collectSummaryRecallCandidates } from './sources/summary-source';
import {
    uniqueCandidates,
    type RecallSourceContext,
} from './sources/shared';
import { collectMemoryCardRecallCandidates } from './sources/memory-card-source';

type RecallAssemblerInput = {
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
    activeActorKey: string | null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
    personaProfile: PersonaMemoryProfile | null;
    tuningProfile: MemoryTuningProfile | null;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
    vectorGate?: RecallGateDecision | null;
};

export async function collectRecallCandidates(input: RecallAssemblerInput): Promise<RecallCandidate[]> {
    const context: RecallSourceContext = {
        chatKey: input.chatKey,
        plan: input.plan,
        query: input.query,
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
        vectorGate: input.vectorGate ?? null,
    };

    const batches = await Promise.all([
        collectRecentRecallCandidates(context),
        collectFactRecallCandidates(context),
        collectSummaryRecallCandidates(context),
        collectStateRecallCandidates(context),
        collectRelationshipRecallCandidates(context),
        collectLorebookRecallCandidates(context),
        context.vectorGate?.enabled === true ? collectMemoryCardRecallCandidates(context) : Promise.resolve([]),
    ]);

    return uniqueCandidates(batches.flat());
}
