import type {
    AdaptivePolicy,
    InjectionIntent,
    InjectionSectionName,
    LorebookGateDecision,
    RecallCandidateSource,
    RecallPlan,
} from '../types';

type RecallPlannerInput = {
    intent: InjectionIntent;
    sections: InjectionSectionName[];
    sectionBudgets: Partial<Record<InjectionSectionName, number>>;
    maxTokens: number;
    policy: AdaptivePolicy;
    lorebookDecision: LorebookGateDecision;
};

const SOURCE_WEIGHT_PRESETS: Record<Exclude<InjectionIntent, 'auto'>, Record<RecallCandidateSource, number>> = {
    roleplay: {
        relationships: 1,
        events: 0.88,
        facts: 0.82,
        summaries: 0.72,
        state: 0.66,
        lorebook: 0.5,
        vector: 0.55,
    },
    setting_qa: {
        lorebook: 1,
        state: 0.92,
        facts: 0.82,
        summaries: 0.62,
        vector: 0.56,
        events: 0.32,
        relationships: 0.28,
    },
    tool_qa: {
        events: 1,
        summaries: 0.88,
        facts: 0.72,
        state: 0.52,
        vector: 0.48,
        relationships: 0.22,
        lorebook: 0.18,
    },
    story_continue: {
        events: 1,
        summaries: 0.9,
        relationships: 0.8,
        state: 0.66,
        facts: 0.58,
        vector: 0.5,
        lorebook: 0.28,
    },
};

const SOURCE_LIMIT_PRESETS: Record<Exclude<InjectionIntent, 'auto'>, Partial<Record<RecallCandidateSource, number>>> = {
    roleplay: {
        relationships: 8,
        events: 8,
        facts: 6,
        summaries: 6,
        state: 4,
        vector: 6,
        lorebook: 3,
    },
    setting_qa: {
        lorebook: 8,
        state: 8,
        facts: 6,
        summaries: 5,
        vector: 5,
        events: 2,
        relationships: 2,
    },
    tool_qa: {
        events: 6,
        summaries: 6,
        facts: 5,
        state: 3,
        vector: 4,
        relationships: 1,
        lorebook: 1,
    },
    story_continue: {
        events: 8,
        summaries: 7,
        relationships: 5,
        state: 5,
        facts: 4,
        vector: 5,
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
        vector: Math.max(0, Math.min(1, base.vector + (lorebookDecision.conflictDetected ? -0.05 : 0))),
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
        reasonCodes: [
            `intent:${input.intent}`,
            `lorebook_mode:${input.lorebookDecision.mode}`,
            `vector_mode:${input.policy.vectorMode}`,
        ],
    };
}