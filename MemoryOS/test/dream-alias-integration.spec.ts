import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry } from '../src/types';
import type {
    DreamRollbackMetadataRecord,
    DreamSessionOutputRecord,
} from '../src/services/dream-types';

const savedOutputs: DreamSessionOutputRecord[] = [];
const savedRollbackMetadata: DreamRollbackMetadataRecord[] = [];

vi.mock('../src/services/dream-session-repository', () => {
    return {
        DreamSessionRepository: class {
            async saveDreamSessionMeta(): Promise<void> {}
            async saveDreamSessionRecall(): Promise<void> {}
            async saveDreamSessionOutput(record: DreamSessionOutputRecord): Promise<void> {
                savedOutputs.push(record);
            }
            async saveDreamSessionApproval(): Promise<void> {}
            async saveDreamRollbackSnapshot(): Promise<void> {}
            async saveDreamRollbackMetadata(record: DreamRollbackMetadataRecord): Promise<void> {
                savedRollbackMetadata.push(record);
            }
            async saveDreamDiagnostics(): Promise<void> {}
            async saveDreamGraphSnapshot(): Promise<void> {}
            async saveDreamQualityReport(): Promise<void> {}
        },
    };
});

vi.mock('../src/services/dream-wave-recall-service', () => {
    return {
        DreamWaveRecallService: class {
            async buildRecallBundle() {
                const candidate = {
                    candidateId: 'cand_1',
                    entryId: 'entry:source:1',
                    title: '林地守护',
                    summary: '在林地中休整。',
                    score: 0.91,
                    source: 'recent',
                    actorKeys: ['user', 'seraphina'],
                    relationKeys: ['relationship:1'],
                    tags: ['林地'],
                    baseScore: 0.8,
                    activationScore: 0.7,
                    noveltyScore: 0.5,
                    repetitionPenalty: 0.1,
                    finalScore: 0.82,
                    sourceNodeKeys: ['node:topic:forest'],
                    bridgeNodeKeys: ['node:actor:seraphina'],
                    reasonChain: ['recent resonance'],
                };
                return {
                    recall: {
                        recentHits: [candidate],
                        midHits: [],
                        deepHits: [],
                        fusedHits: [],
                        diagnostics: {
                            sourceQuery: 'forest',
                            totalCandidates: 1,
                            truncated: false,
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                    diagnostics: {
                        waveOutputs: [{
                            waveType: 'recent',
                            queryText: 'forest',
                            seedEntryIds: ['entry:source:1'],
                            activatedNodeKeys: ['node:topic:forest'],
                            candidates: [candidate],
                            diagnostics: {
                                candidateCount: 1,
                                truncated: false,
                                baseReason: ['recent resonance'],
                            },
                        }],
                        fusionResult: {
                            fusedCandidates: [candidate],
                            bridgeNodeKeys: ['node:actor:seraphina'],
                            rejectedCandidateIds: [],
                            diagnostics: {
                                duplicateDropped: 0,
                                boostedByNovelty: 1,
                                boostedByActivation: 1,
                                finalSelectedCount: 1,
                            },
                        },
                        createdAt: 1,
                        updatedAt: 1,
                    },
                    graphSnapshot: {
                        activatedNodes: [
                            {
                                nodeKey: 'node:topic:forest',
                                nodeType: 'topic',
                                label: 'forest',
                                activation: 0.9,
                                novelty: 0.3,
                                rarity: 0.1,
                                lastSeenAt: 1,
                                usageCount: 1,
                                chatKey: 'chat_1',
                            },
                            {
                                nodeKey: 'node:actor:seraphina',
                                nodeType: 'actor',
                                label: 'seraphina',
                                activation: 0.8,
                                novelty: 0.2,
                                rarity: 0.1,
                                lastSeenAt: 1,
                                usageCount: 1,
                                chatKey: 'chat_1',
                            },
                        ],
                        activatedEdges: [],
                        createdAt: 1,
                        updatedAt: 1,
                    },
                    candidateMap: new Map([['entry:source:1', candidate]]),
                };
            }
        },
    };
});

vi.mock('../src/services/dream-post-processing-service', () => {
    return {
        DreamPostProcessingService: class {
            async buildDreamMaintenanceProposals(): Promise<[]> {
                return [];
            }
        },
    };
});

vi.mock('../src/services/dream-maintenance-planner', () => {
    return {
        DreamMaintenancePlanner: class {
            async scheduleDreamMaintenance(): Promise<void> {}
            async mergeAppliedMaintenanceIntoRollback(): Promise<void> {}
            async applyDreamMaintenanceProposal(): Promise<never> {
                throw new Error('not implemented');
            }
        },
    };
});

vi.mock('../src/services/dream-quality-guard-service', () => {
    return {
        DreamQualityGuardService: class {
            async evaluateDreamQuality() {
                return null;
            }
            guardDreamMutations(input: { output: { proposedMutations: unknown[] } }) {
                return input.output.proposedMutations;
            }
        },
    };
});

vi.mock('../src/settings/store', async () => {
    const actual = await vi.importActual('../src/settings/store');
    return {
        ...actual,
        readMemoryOSSettings: () => ({
            ...(actual as any).DEFAULT_MEMORY_OS_SETTINGS,
            dreamEnabled: true,
            dreamRequireApproval: true,
            dreamDiagnosticsEnabled: true,
            dreamMaintenanceEnabled: false,
            dreamQualityGuardEnabled: false,
            dreamPromptRequireExplain: true,
            dreamPromptStrictJson: true,
            dreamPromptMaxHighlights: 4,
            dreamPromptMaxMutations: 8,
            dreamPromptWeakInferenceOnly: true,
            dreamContextMaxChars: 6000,
        }),
    };
});

import { DreamingService } from '../src/services/dreaming-service';

describe('DreamingService alias integration', () => {
    beforeEach(() => {
        savedOutputs.length = 0;
        savedRollbackMetadata.length = 0;
    });

    it('Dream prompt 使用短引用后，仍能解码并完成写回', async () => {
        const entries = new Map<string, MemoryEntry>([
            ['entry:source:1', {
                entryId: 'entry:source:1',
                chatKey: 'chat_1',
                title: '旧来源',
                entryType: 'event',
                category: '事件',
                tags: ['source'],
                summary: '旧来源摘要',
                detail: '',
                detailSchemaVersion: 1,
                detailPayload: {},
                sourceSummaryIds: [],
                createdAt: 1,
                updatedAt: 1,
            }],
        ]);

        const repository = {
            getEntry: vi.fn(async (entryId: string): Promise<MemoryEntry | null> => entries.get(entryId) ?? null),
            listRelationships: vi.fn(async () => []),
            listActorProfiles: vi.fn(async () => []),
            listCompareKeyIndexRecords: vi.fn(async () => []),
            getWorldProfileBinding: vi.fn(async () => null),
            putWorldProfileBinding: vi.fn(async (binding: Record<string, unknown>) => ({
                profileId: 'urban_modern',
                primaryProfile: binding.primaryProfile ?? 'urban_modern',
                secondaryProfiles: binding.secondaryProfiles ?? [],
                confidence: binding.confidence ?? 0,
                reasonCodes: binding.reasonCodes ?? [],
                detectedFrom: binding.detectedFrom ?? [],
                bindingMode: binding.bindingMode ?? 'auto',
                sourceHash: 'test-source-hash',
                createdAt: 1,
                updatedAt: 1,
            })),
            bindRoleToEntry: vi.fn(async () => ({})),
            appendMutationHistory: vi.fn(async () => undefined),
            ensureActorProfile: vi.fn(async () => ({})),
            applyLedgerMutationBatch: vi.fn(async () => ({
                createdEntryIds: ['entry:new:1'],
                updatedEntryIds: [],
                invalidatedEntryIds: [],
                deletedEntryIds: [],
                noopCount: 0,
                counts: {
                    input: 1,
                    add: 1,
                    update: 0,
                    merge: 0,
                    invalidate: 0,
                    delete: 0,
                    noop: 0,
                },
                decisions: [{
                    targetKind: 'event',
                    action: 'ADD',
                    title: '新事件',
                    matchMode: 'created',
                    entryId: 'entry:new:1',
                    reasonCodes: ['source:dream'],
                }],
                affectedRecords: [{
                    entryId: 'entry:new:1',
                    action: 'ADD',
                }],
                bindingResults: [],
                resolvedBindingResults: [],
                auditResults: [{
                    entryId: 'entry:new:1',
                    action: 'ADD',
                    written: true,
                }],
                historyWritten: true,
            })),
        } as any;

        const service = new DreamingService({
            chatKey: 'chat_1',
            repository,
            getLLM: () => ({
                registerConsumer: () => {},
                runTask: vi.fn(async (input) => {
                    const userPrompt = input.input.messages[1]?.content ?? '';
                    expect(userPrompt).toContain('"chatRef": "C1"');
                    expect(userPrompt).toContain('"entryRef": "E1"');
                    expect(userPrompt).not.toContain('entry:source:1');
                    return {
                        ok: true,
                        data: {
                            narrative: '梦里再次回到林地。',
                            highlights: ['林地休整再次被唤起'],
                            proposedMutations: [{
                                mutationId: 'mut_1',
                                mutationType: 'entry_create',
                                confidence: 0.83,
                                reason: '这段经历已经稳定成新的事件记忆。',
                                sourceWave: 'recent',
                                sourceEntryRefs: ['E1'],
                                preview: '新增林地事件',
                                payload: {
                                    title: '林地余温',
                                    entryType: 'event',
                                    summary: '在林地停驻后的余温仍在延续。',
                                },
                                explain: {
                                    sourceWave: 'recent',
                                    sourceEntryRefs: ['E1'],
                                    sourceNodeRefs: ['N1'],
                                    bridgeNodeRefs: ['N2'],
                                    explanationSteps: ['从林地停驻联想到持续的安稳感。'],
                                    confidenceBreakdown: {
                                        retrieval: 0.8,
                                        activation: 0.7,
                                        novelty: 0.5,
                                        repetitionPenalty: 0.1,
                                        final: 0.83,
                                    },
                                },
                            }],
                        },
                    };
                }),
            } as any),
            pluginId: 'MemoryOS',
            readRecentMessages: async () => [],
            openReviewDialog: async () => ({
                decision: 'approved',
                approvedMutationIds: ['mut_1'],
                rejectedMutationIds: [],
            }),
        });

        const result = await service.startDreamSession('manual');

        expect(result.ok).toBe(true);
        expect(result.status).toBe('approved');
        expect(savedOutputs[0]?.proposedMutations[0]?.sourceEntryIds).toEqual(['entry:source:1']);
        expect([
            'node:topic:forest',
            'node:actor:seraphina',
        ]).toContain(savedOutputs[0]?.proposedMutations[0]?.explain?.sourceNodeKeys[0]);
        expect([
            'node:topic:forest',
            'node:actor:seraphina',
        ]).toContain(savedOutputs[0]?.proposedMutations[0]?.explain?.bridgeNodeKeys[0]);
        expect(savedRollbackMetadata[0]?.applyResult?.appliedEntryMutationIds).toEqual(['mut_1']);
        expect(repository.applyLedgerMutationBatch).toHaveBeenCalledTimes(1);
    });
});
