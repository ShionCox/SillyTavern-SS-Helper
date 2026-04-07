export type PromptReferenceKind = 'chat' | 'dream' | 'entry' | 'relationship' | 'node' | 'summary';

export interface PromptAliasEntry {
    ref: string;
    value: string;
}

export interface PromptAliasSnapshot {
    chat: PromptAliasEntry[];
    dream: PromptAliasEntry[];
    entry: PromptAliasEntry[];
    relationship: PromptAliasEntry[];
    node: PromptAliasEntry[];
    summary: PromptAliasEntry[];
}

export interface PromptRecallHitDTO {
    entryRef: string;
    title: string;
    summary: string;
    score: number;
    actors?: string[];
    relationRefs?: string[];
    tags?: string[];
}

export interface PromptBridgeNodeDTO {
    nodeRef: string;
    label: string;
    nodeType: string;
    activation: number;
    novelty: number;
}

export interface PromptWaveHintDTO {
    waveType: 'recent' | 'mid' | 'deep';
    seedEntryRefs: string[];
    topNodeRefs: string[];
    candidateCount: number;
    truncated: boolean;
    baseReason: string[];
}

export interface PromptGraphSummaryItemDTO {
    ref: string;
    label: string;
    score?: number;
}

export interface DreamPromptDTO {
    runtime: {
        chatRef: string;
        dreamRef: string;
        triggerReason: string;
        executionMode?: 'manual_review' | 'silent';
        runProfile?: 'auto_light' | 'auto_review' | 'manual_deep';
        outputKind?: 'full' | 'light';
        promptInfo: {
            promptVersion: string;
            stylePreset: string;
            schemaVersion: string;
        };
        qualityConstraints: {
            maxHighlights: number;
            maxMutations: number;
            weakInferenceOnly: boolean;
            requireExplain: boolean;
            allowMutationOutput?: boolean;
            allowHighRiskMutationOutput?: boolean;
        };
    };
    recall: {
        recentHits: PromptRecallHitDTO[];
        midHits: PromptRecallHitDTO[];
        deepHits: PromptRecallHitDTO[];
    };
    diagnostics: {
        waveHints: PromptWaveHintDTO[];
        topBridgeNodes: PromptBridgeNodeDTO[];
    } | null;
    graphSummary: {
        topActors: PromptGraphSummaryItemDTO[];
        topTopics: PromptGraphSummaryItemDTO[];
        topEntries: PromptGraphSummaryItemDTO[];
    } | null;
}
