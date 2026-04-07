import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    DreamMaintenanceProposalRecord,
    DreamSessionApprovalRecord,
    DreamSessionMetaRecord,
    DreamSessionOutputRecord,
} from '../src/services/dream-types';

const savedMetas: DreamSessionMetaRecord[] = [];
const savedOutputs: DreamSessionOutputRecord[] = [];
const savedApprovals: DreamSessionApprovalRecord[] = [];
const savedMaintenance: DreamMaintenanceProposalRecord[] = [];
const appliedMaintenance: DreamMaintenanceProposalRecord[] = [];
let dreamExecutionMode: 'manual_review' | 'silent' = 'manual_review';

function createMaintenanceProposal(): DreamMaintenanceProposalRecord {
    return {
        proposalId: 'proposal:summary',
        dreamId: 'dream:test',
        chatKey: 'chat:test',
        proposalType: 'summary_candidate_promotion',
        status: 'pending',
        confidence: 0.92,
        reason: '低风险总结候选',
        sourceEntryIds: ['entry:source'],
        sourceNodeKeys: [],
        preview: '总结候选',
        payload: {
            candidateTitle: '梦境洞察',
            candidateSummary: '梦境轻整理候选。',
        },
        createdAt: 1,
        updatedAt: 1,
    };
}

vi.mock('../src/settings/store', async () => {
    const actual = await vi.importActual('../src/settings/store');
    return {
        ...actual,
        readMemoryOSSettings: () => ({
            ...(actual as any).DEFAULT_MEMORY_OS_SETTINGS,
            dreamEnabled: true,
            dreamExecutionMode,
            dreamDiagnosticsEnabled: true,
            dreamMaintenanceEnabled: true,
            dreamQualityGuardEnabled: true,
            dreamPromptStrictJson: false,
            dreamPromptRequireExplain: true,
            dreamPromptMaxHighlights: 4,
            dreamPromptMaxMutations: 8,
            dreamContextMaxChars: 4000,
        }),
    };
});

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            async saveDreamSessionMeta(record: DreamSessionMetaRecord): Promise<void> {
                savedMetas.push(record);
            }
            async saveDreamSessionRecall(): Promise<void> {}
            async saveDreamSessionOutput(record: DreamSessionOutputRecord): Promise<void> {
                savedOutputs.push(record);
            }
            async saveDreamSessionApproval(record: DreamSessionApprovalRecord): Promise<void> {
                savedApprovals.push(record);
            }
            async saveDreamMaintenanceProposal(record: DreamMaintenanceProposalRecord): Promise<void> {
                savedMaintenance.push(record);
            }
            async saveDreamQualityReport(): Promise<void> {}
            async deleteDreamSessionArtifacts(): Promise<void> {}
            async listDreamSessionOutputs(): Promise<DreamSessionOutputRecord[]> {
                return [];
            }
            async getDreamSessionById(): Promise<any> {
                return { rollbackMetadata: null };
            }
            async saveDreamRollbackMetadata(): Promise<void> {}
        },
    };
});

vi.mock('../src/services/dream-wave-recall-service', () => {
    return {
        DreamWaveRecallService: class {
            async buildRecallBundle() {
                const candidate = {
                    candidateId: 'candidate:1',
                    entryId: 'entry:source',
                    title: '来源',
                    summary: '来源摘要',
                    score: 0.9,
                    source: 'recent',
                    actorKeys: [],
                    relationKeys: [],
                    tags: [],
                    baseScore: 0.8,
                    activationScore: 0.2,
                    noveltyScore: 0.2,
                    repetitionPenalty: 0,
                    finalScore: 0.9,
                    sourceNodeKeys: [],
                    bridgeNodeKeys: [],
                    reasonChain: [],
                };
                return {
                    recall: {
                        recentHits: [candidate],
                        midHits: [],
                        deepHits: [],
                        fusedHits: [candidate],
                        diagnostics: {
                            sourceQuery: 'test',
                            totalCandidates: 1,
                            truncated: false,
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                    diagnostics: {
                        waveOutputs: [],
                        fusionResult: {
                            fusedCandidates: [candidate],
                            bridgeNodeKeys: [],
                            rejectedCandidateIds: [],
                            diagnostics: {
                                duplicateDropped: 0,
                                boostedByNovelty: 0,
                                boostedByActivation: 0,
                                finalSelectedCount: 1,
                            },
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                    graphSnapshot: null,
                    candidateMap: new Map([['entry:source', candidate]]),
                };
            }
        },
    };
});

vi.mock('../src/services/dream-prompt-service', () => {
    return {
        DreamPromptService: class {
            buildDreamPrompt(input: any) {
                return {
                    messages: [{ role: 'user', content: input.plan?.runProfile ?? 'manual_deep' }],
                    promptText: 'prompt',
                    promptInfo: {
                        promptVersion: 'test',
                        stylePreset: 'reflective',
                        schemaVersion: 'dream-output.v1',
                    },
                    promptContext: {
                        entryRefToEntryId: new Map([['E1', 'entry:source']]),
                        nodeRefToNodeKey: new Map(),
                        relationshipRefToRelationshipKey: new Map(),
                        candidateByEntryRef: new Map(),
                    },
                };
            }
        },
    };
});

vi.mock('../src/services/world-strategy-service', () => ({
    resolveChatWorldStrategy: async () => ({ explanation: null }),
    buildWorldStrategyHintText: () => '',
}));

vi.mock('../src/services/world-profile-field-policy', () => ({
    buildWorldProfileFieldPolicy: () => null,
    applyWorldProfileFieldPolicy: (input: any) => ({
        fields: input.fields,
        reasonCodes: input.reasonCodes,
        missingFields: [],
        suppressed: false,
        preferred: [],
    }),
}));

vi.mock('../src/services/dream-post-processing-service', () => {
    return {
        DreamPostProcessingService: class {
            async buildDreamMaintenanceProposals(): Promise<DreamMaintenanceProposalRecord[]> {
                return [createMaintenanceProposal()];
            }
        },
    };
});

vi.mock('../src/services/dream-maintenance-planner', () => {
    return {
        DreamMaintenancePlanner: class {
            async scheduleDreamMaintenance(input: { proposals: DreamMaintenanceProposalRecord[] }): Promise<DreamMaintenanceProposalRecord[]> {
                return input.proposals;
            }
            canAutoApplyProposal(proposal: DreamMaintenanceProposalRecord): boolean {
                return proposal.proposalType === 'summary_candidate_promotion' && proposal.confidence >= 0.8;
            }
            async applyDreamMaintenanceProposal(proposal: DreamMaintenanceProposalRecord): Promise<DreamMaintenanceProposalRecord> {
                const applied = { ...proposal, status: 'applied' as const };
                appliedMaintenance.push(applied);
                return applied;
            }
            async mergeAppliedMaintenanceIntoRollback(): Promise<void> {}
        },
    };
});

vi.mock('../src/services/dream-quality-guard-service', () => {
    return {
        DreamQualityGuardService: class {
            async evaluateDreamQuality(input: { dreamId: string }) {
                return {
                    dreamId: input.dreamId,
                    chatKey: 'chat:test',
                    qualityScore: 0.95,
                    warnings: [],
                    blockedMutationIds: [],
                    forcedReviewMutationIds: [],
                    createdAt: 1,
                    updatedAt: 1,
                };
            }
            guardDreamMutations(input: { output: DreamSessionOutputRecord }) {
                return input.output.proposedMutations;
            }
        },
    };
});

vi.mock('../src/services/dream-mutation-applier', () => {
    return {
        DreamMutationApplier: class {
            async applyDreamMutations() {
                return {
                    rollbackKey: 'rollback:test',
                    appliedMutationIds: ['mutation:1'],
                    affectedEntryIds: ['entry:new'],
                    affectedRelationshipIds: [],
                };
            }
        },
    };
});

vi.mock('../src/services/dream-recall-diagnostics-service', () => {
    return {
        DreamRecallDiagnosticsService: class {
            async saveDiagnostics(): Promise<void> {}
            async saveGraphSnapshot(): Promise<void> {}
        },
    };
});

import { DreamingService } from '../src/services/dreaming-service';

function createService(openReviewDialog = vi.fn(async () => ({
    decision: 'approved' as const,
    approvedMutationIds: ['mutation:1'],
    rejectedMutationIds: [],
    approvedMaintenanceProposalIds: [],
    rejectedMaintenanceProposalIds: [],
}))) {
    return {
        service: new DreamingService({
            chatKey: 'chat:test',
            repository: {
                appendMutationHistory: vi.fn(async () => undefined),
                getEntry: vi.fn(async () => null),
                listRelationships: vi.fn(async () => []),
                saveEntry: vi.fn(async (entry: any) => ({ ...entry, entryId: entry.entryId ?? 'entry:saved' })),
                saveRelationship: vi.fn(async () => undefined),
            } as any,
            getLLM: () => ({
                registerConsumer: () => {},
                runTask: vi.fn(async () => ({
                    ok: true,
                    data: {
                        narrative: '梦境叙事。',
                        highlights: ['发现一', '发现二', '发现三'],
                        proposedMutations: [{
                            mutationId: 'mutation:1',
                            mutationType: 'entry_create',
                            confidence: 0.9,
                            reason: '证据充分。',
                            sourceWave: 'recent',
                            sourceEntryRefs: ['E1'],
                            preview: '新增事件',
                            payload: {
                                title: '新事件',
                                entryType: 'event',
                                summary: '新事件摘要。',
                            },
                            explain: {
                                sourceWave: 'recent',
                                sourceEntryRefs: ['E1'],
                                sourceNodeRefs: [],
                                bridgeNodeRefs: [],
                                explanationSteps: ['来自来源。'],
                                confidenceBreakdown: {
                                    retrieval: 0.8,
                                    activation: 0.2,
                                    novelty: 0.2,
                                    repetitionPenalty: 0,
                                    final: 0.9,
                                },
                            },
                        }],
                    },
                })),
            } as any),
            pluginId: 'MemoryOS',
            readRecentMessages: async () => [],
            openReviewDialog,
        }),
        openReviewDialog,
    };
}

describe('DreamingService mode routing', () => {
    beforeEach(() => {
        savedMetas.length = 0;
        savedOutputs.length = 0;
        savedApprovals.length = 0;
        savedMaintenance.length = 0;
        appliedMaintenance.length = 0;
        dreamExecutionMode = 'manual_review';
    });

    it('silent 设置下手动 dream 仍走 manual_deep 并打开审批', async () => {
        dreamExecutionMode = 'silent';
        const { service, openReviewDialog } = createService();

        const result = await service.startDreamSession('manual');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('approved');
        expect(savedMetas[0]?.runProfile).toBe('manual_deep');
        expect(savedOutputs[0]?.proposedMutations).toHaveLength(1);
        expect(openReviewDialog).toHaveBeenCalledTimes(1);
        expect(savedApprovals[savedApprovals.length - 1]?.approvalMode).toBe('interactive');
    });

    it('auto + manual_review 会保存 pending 且不弹审批', async () => {
        const { service, openReviewDialog } = createService();

        const result = await service.startDreamSession('generation_ended');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('deferred');
        expect(savedMetas[0]?.runProfile).toBe('auto_review');
        expect(savedApprovals[0]?.status).toBe('pending');
        expect(savedApprovals[0]?.approvalMode).toBe('deferred');
        expect(openReviewDialog).not.toHaveBeenCalled();
    });

    it('auto + silent 会进入 auto_light，清空 mutation 并自动应用低风险 maintenance', async () => {
        dreamExecutionMode = 'silent';
        const { service, openReviewDialog } = createService();

        const result = await service.startDreamSession('idle');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('generated');
        expect(savedMetas[0]?.runProfile).toBe('auto_light');
        expect(savedOutputs[0]?.outputKind).toBe('light');
        expect(savedOutputs[0]?.proposedMutations).toHaveLength(0);
        expect(savedApprovals[0]?.approvalMode).toBe('auto_silent');
        expect(appliedMaintenance).toHaveLength(1);
        expect(openReviewDialog).not.toHaveBeenCalled();
    });
});
