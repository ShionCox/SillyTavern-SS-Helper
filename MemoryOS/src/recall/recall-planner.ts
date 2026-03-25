import type {
    AdaptivePolicy,
    InjectionIntent,
    InjectionSectionName,
    GroupMemoryState,
    LogicalChatView,
    LorebookGateDecision,
    RecallCandidateSource,
    RecallPlan,
    PersonaMemoryProfile,
} from '../types';
import { normalizeMemoryText } from '../core/memory-intelligence';

type RecallPlannerInput = {
    intent: InjectionIntent;
    sections: InjectionSectionName[];
    sectionBudgets: Partial<Record<InjectionSectionName, number>>;
    maxTokens: number;
    policy: AdaptivePolicy;
    lorebookDecision: LorebookGateDecision;
    activeActorKey?: string | null;
    logicalView?: LogicalChatView | null;
    groupMemory?: GroupMemoryState | null;
    personaProfiles?: Record<string, PersonaMemoryProfile>;
};

const ROLEPLAY_BUDGET_SHARE = {
    global: 0.4,
    primaryActor: 0.45,
    secondaryActors: 0.15,
};

function normalizeActorKey(actorKey: string | null | undefined): string {
    return normalizeMemoryText(actorKey ?? '').toLowerCase();
}

function buildKnownActorKeys(input: RecallPlannerInput): Set<string> {
    const known = new Set<string>();
    (input.groupMemory?.lanes ?? []).forEach((lane): void => {
        const actorKey = normalizeActorKey(lane.actorKey);
        if (actorKey) {
            known.add(actorKey);
        }
    });
    Object.keys(input.personaProfiles ?? {}).forEach((actorKey: string): void => {
        const normalized = normalizeActorKey(actorKey);
        if (normalized) {
            known.add(normalized);
        }
    });
    const explicitActorKey = normalizeActorKey(input.activeActorKey);
    if (explicitActorKey) {
        known.add(explicitActorKey);
    }
    return known;
}

function extractVisibleSpeakerLabel(text: string): string {
    const match = normalizeMemoryText(text).match(/^([A-Za-z0-9_\u4e00-\u9fa5]{1,24})[:：]/);
    return normalizeMemoryText(match?.[1] ?? '');
}

function matchSpeakerToActorKey(label: string, input: RecallPlannerInput): string | null {
    const normalizedLabel = normalizeActorKey(label);
    if (!normalizedLabel) {
        return null;
    }
    for (const lane of input.groupMemory?.lanes ?? []) {
        const laneActorKey = normalizeActorKey(lane.actorKey);
        const laneDisplayName = normalizeActorKey(lane.displayName);
        if (normalizedLabel === laneActorKey || normalizedLabel === laneDisplayName) {
            return laneActorKey || lane.actorKey;
        }
    }
    for (const actorKey of Object.keys(input.personaProfiles ?? {})) {
        if (normalizedLabel === normalizeActorKey(actorKey)) {
            return normalizeActorKey(actorKey);
        }
    }
    return null;
}

function inferPrimaryActorKeyFromView(input: RecallPlannerInput): { actorKey: string | null; reasonCode: string } {
    const explicitActorKey = normalizeActorKey(input.activeActorKey);
    if (explicitActorKey) {
        return { actorKey: explicitActorKey, reasonCode: 'focus:explicit_active_actor' };
    }
    const recentMessages = Array.isArray(input.logicalView?.visibleMessages)
        ? [...input.logicalView!.visibleMessages].slice(-12).reverse()
        : [];
    for (const message of recentMessages) {
        const speakerLabel = extractVisibleSpeakerLabel(message.text);
        const matchedActorKey = matchSpeakerToActorKey(speakerLabel, input);
        if (matchedActorKey) {
            return { actorKey: matchedActorKey, reasonCode: 'focus:current_speaker' };
        }
    }
    const salienceTop1 = (input.groupMemory?.actorSalience ?? [])
        .slice()
        .sort((left, right): number => Number(right.score ?? 0) - Number(left.score ?? 0))
        .map((item) => normalizeActorKey(item.actorKey))
        .find((actorKey: string): boolean => Boolean(actorKey) && buildKnownActorKeys(input).has(actorKey)) ?? null;
    if (salienceTop1) {
        return { actorKey: salienceTop1, reasonCode: 'focus:salience_top1' };
    }
    return { actorKey: null, reasonCode: 'focus:no_primary_actor' };
}

function resolveRecallViewpoint(input: RecallPlannerInput): RecallPlan['viewpoint'] {
    const normalizedActorKey = String(input.activeActorKey ?? '').trim() || null;
    if (input.intent === 'roleplay') {
        const primary = inferPrimaryActorKeyFromView(input);
        if (primary.actorKey) {
            const knownActorKeys = buildKnownActorKeys(input);
            const secondaryActorKeys = (input.groupMemory?.actorSalience ?? [])
                .slice()
                .sort((left, right): number => Number(right.score ?? 0) - Number(left.score ?? 0))
                .map((item) => normalizeActorKey(item.actorKey))
                .filter((actorKey: string): boolean => Boolean(actorKey) && actorKey !== primary.actorKey && knownActorKeys.has(actorKey))
                .filter((actorKey: string, index: number, list: string[]): boolean => list.indexOf(actorKey) === index)
                .slice(0, 2);
            return {
                mode: 'actor_bounded',
                activeActorKey: primary.actorKey,
                allowSharedScene: true,
                allowWorldState: true,
                allowForeignPrivateMemory: false,
                focus: {
                    primaryActorKey: primary.actorKey,
                    secondaryActorKeys,
                    budgetShare: { ...ROLEPLAY_BUDGET_SHARE },
                    reasonCodes: [
                        primary.reasonCode,
                        ...(secondaryActorKeys.length > 0 ? ['focus:secondary_actor'] : []),
                    ],
                },
            };
        }
        return {
            mode: 'omniscient_director',
            activeActorKey: null,
            allowSharedScene: true,
            allowWorldState: true,
            allowForeignPrivateMemory: false,
            focus: {
                primaryActorKey: null,
                secondaryActorKeys: [],
                budgetShare: {
                    global: 1,
                    primaryActor: 0,
                    secondaryActors: 0,
                },
                reasonCodes: ['focus:no_primary_actor'],
            },
        };
    }
    return {
        mode: 'omniscient_director',
        activeActorKey: normalizedActorKey,
        allowSharedScene: true,
        allowWorldState: true,
        allowForeignPrivateMemory: false,
        focus: {
            primaryActorKey: null,
            secondaryActorKeys: [],
            budgetShare: {
                global: 1,
                primaryActor: 0,
                secondaryActors: 0,
            },
            reasonCodes: ['focus:director_view'],
        },
    };
}

const SOURCE_WEIGHT_PRESETS: Record<Exclude<InjectionIntent, 'auto'>, Record<RecallCandidateSource, number>> = {
    roleplay: {
        memory_card: 1,
        vector: 0.92,
        relationships: 0.82,
        events: 0.68,
        facts: 0.58,
        summaries: 0.52,
        state: 0.5,
        lorebook: 0.44,
    },
    setting_qa: {
        lorebook: 1,
        memory_card: 0.95,
        vector: 0.9,
        state: 0.82,
        facts: 0.6,
        summaries: 0.52,
        events: 0.4,
        relationships: 0.34,
    },
    tool_qa: {
        memory_card: 0.93,
        vector: 0.9,
        events: 0.72,
        summaries: 0.66,
        facts: 0.62,
        state: 0.58,
        relationships: 0.42,
        lorebook: 0.4,
    },
    story_continue: {
        events: 0.9,
        memory_card: 0.88,
        vector: 0.82,
        relationships: 0.76,
        summaries: 0.7,
        state: 0.58,
        facts: 0.56,
        lorebook: 0.32,
    },
};

const SOURCE_LIMIT_PRESETS: Record<Exclude<InjectionIntent, 'auto'>, Partial<Record<RecallCandidateSource, number>>> = {
    roleplay: {
        memory_card: 10,
        vector: 10,
        relationships: 6,
        events: 5,
        facts: 4,
        summaries: 4,
        state: 3,
        lorebook: 3,
    },
    setting_qa: {
        memory_card: 12,
        vector: 12,
        lorebook: 8,
        state: 8,
        facts: 5,
        summaries: 4,
        events: 3,
        relationships: 3,
    },
    tool_qa: {
        memory_card: 8,
        vector: 8,
        events: 4,
        summaries: 4,
        facts: 5,
        state: 3,
        relationships: 2,
        lorebook: 2,
    },
    story_continue: {
        memory_card: 9,
        vector: 9,
        events: 8,
        summaries: 6,
        relationships: 5,
        state: 4,
        facts: 4,
        lorebook: 2,
    },
};

function resolveSourceWeights(intent: InjectionIntent, lorebookDecision: LorebookGateDecision): Record<RecallCandidateSource, number> {
    const normalizedIntent: Exclude<InjectionIntent, 'auto'> = intent === 'auto' ? 'story_continue' : intent;
    const base = SOURCE_WEIGHT_PRESETS[normalizedIntent];
    const lorebookBias = lorebookDecision.mode === 'force_inject'
        ? 0.18
        : lorebookDecision.mode === 'soft_inject'
            ? 0.08
            : lorebookDecision.mode === 'summary_only'
                ? -0.04
                : -0.18;
    return {
        ...base,
        lorebook: Math.max(0, Math.min(1, base.lorebook + lorebookBias)),
        memory_card: Math.max(0, Math.min(1, base.memory_card + (lorebookDecision.conflictDetected ? -0.02 : 0))),
        vector: Math.max(0, Math.min(1, base.vector)),
    };
}

function resolveSectionWeights(sections: InjectionSectionName[], policy: AdaptivePolicy): Partial<Record<InjectionSectionName, number>> {
    const densityBias = Math.max(0.05, Math.min(0.16, Number(policy.contextMaxTokensShare ?? 0.55) * 0.18));
    return sections.reduce<Partial<Record<InjectionSectionName, number>>>((result, section, index) => {
        result[section] = Math.max(0.3, 1 - index * 0.08 + densityBias);
        return result;
    }, {});
}

export function planRecall(input: RecallPlannerInput): RecallPlan {
    const normalizedIntent: Exclude<InjectionIntent, 'auto'> = input.intent === 'auto' ? 'story_continue' : input.intent;
    const sourceLimits = SOURCE_LIMIT_PRESETS[normalizedIntent];
    const totalLimit = Object.values(sourceLimits).reduce((sum: number, value: number | undefined): number => sum + Number(value ?? 0), 0);
    const viewpoint = resolveRecallViewpoint(input);
    return {
        intent: input.intent,
        sections: [...input.sections],
        sectionBudgets: { ...input.sectionBudgets },
        maxTokens: input.maxTokens,
        sourceWeights: resolveSourceWeights(input.intent, input.lorebookDecision),
        sourceLimits: { ...sourceLimits },
        sectionWeights: resolveSectionWeights(input.sections, input.policy),
        coarseTopK: Math.max(12, totalLimit),
        fineTopK: Math.max(8, Math.min(totalLimit, 16)),
        viewpoint,
        reasonCodes: [
            `intent:${input.intent}`,
            `lorebook_mode:${input.lorebookDecision.mode}`,
            `vector_mode:${input.policy.vectorMode}`,
            'planner:card_first',
            `viewpoint:${viewpoint.mode}`,
            ...viewpoint.focus.reasonCodes,
            ...(input.intent === 'roleplay' && !String(input.activeActorKey ?? '').trim() ? ['viewpoint:fallback_global_missing_actor'] : []),
        ],
    };
}
