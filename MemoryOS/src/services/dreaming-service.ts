import type { EntryRepository } from '../repository/entry-repository';
import type { MemoryLLMApi } from '../memory-summary';
import { readMemoryOSSettings } from '../settings/store';
import { DreamMaintenancePlanner } from './dream-maintenance-planner';
import { resolveDreamExecutionPlan, type ResolvedDreamExecutionPlan } from './dream-execution-mode';
import { DreamMutationApplier } from './dream-mutation-applier';
import { DreamPromptService } from './dream-prompt-service';
import { DreamPostProcessingService } from './dream-post-processing-service';
import { DreamQualityGuardService } from './dream-quality-guard-service';
import { DreamRecallDiagnosticsService } from './dream-recall-diagnostics-service';
import { DreamSessionRepository } from './dream-session-repository';
import { DreamWaveRecallService } from './dream-wave-recall-service';
import { applyWorldProfileFieldPolicy, buildWorldProfileFieldPolicy, type WorldProfileFieldPolicy } from './world-profile-field-policy';
import { buildWorldStrategyHintText, resolveChatWorldStrategy } from './world-strategy-service';
import {
    DREAM_PHASE1_MAX_MUTATION_COUNT,
    type DreamMaintenanceProposalRecord,
    type DreamMutationExplain,
    type DreamMutationType,
    type DreamMutationProposal,
    type DreamQualityReport,
    type DreamRecallCandidate,
    type DreamRecallSource,
    type DreamReviewDecision,
    type DreamSessionDiagnosticsRecord,
    type DreamSessionGraphSnapshotRecord,
    type DreamSessionMetaRecord,
    type DreamSessionOutputRecord,
    type DreamSessionRecallRecord,
    type DreamTriggerReason,
    type DreamExecutionMode,
} from './dream-types';

const runningChatKeys = new Set<string>();

/** 无候选命中时的默认 retrieval 分数 */
const FALLBACK_RETRIEVAL_SCORE = 0.45;
/** activation 在最终分数中的权重 */
const WEIGHT_ACTIVATION = 0.25;
/** novelty 在最终分数中的权重 */
const WEIGHT_NOVELTY = 0.2;
/** repetitionPenalty 在最终分数中的惩罚权重 */
const WEIGHT_REPETITION_PENALTY = 0.4;
/** 低风险自动应用的最低质量分数 */
const AUTO_APPLY_MIN_QUALITY_SCORE = 0.72;
/** 低风险自动应用的最低 confidence */
const AUTO_APPLY_MIN_CONFIDENCE = 0.75;
/** 严格 JSON Schema 下的空对象字符串 */
const EMPTY_JSON_OBJECT_TEXT = '{}';

type DreamStartResult = {
    ok: boolean;
    dreamId?: string;
    status?: 'generated' | 'approved' | 'rejected' | 'deferred' | 'failed';
    reasonCode?: string;
    errorMessage?: string;
};

export type DreamExecutionContext = {
    holderId?: string;
    executionMode?: DreamExecutionMode;
    resolvedPlan?: ResolvedDreamExecutionPlan;
    triggerSource?: DreamTriggerReason;
};

/**
 * 功能：Dream Pipeline v2 主服务。
 */
export class DreamingService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly dreamRepository: DreamSessionRepository;
    private readonly mutationApplier: DreamMutationApplier;
    private readonly diagnosticsService: DreamRecallDiagnosticsService;
    private readonly recallService: DreamWaveRecallService;
    private readonly postProcessingService: DreamPostProcessingService;
    private readonly maintenancePlanner: DreamMaintenancePlanner;
    private readonly promptService: DreamPromptService;
    private readonly qualityGuardService: DreamQualityGuardService;
    private readonly getLLM: () => MemoryLLMApi | null;
    private readonly pluginId: string;
    private readonly openReviewDialog: (input: {
        meta: { dreamId: string; triggerReason: string; createdAt: number };
        recall: DreamSessionRecallRecord;
        output: DreamSessionOutputRecord;
        maintenanceProposals: DreamMaintenanceProposalRecord[];
        diagnostics?: DreamSessionDiagnosticsRecord | null;
        graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
    }) => Promise<DreamReviewDecision>;

    constructor(input: {
        chatKey: string;
        repository: EntryRepository;
        getLLM: () => MemoryLLMApi | null;
        pluginId: string;
        readRecentMessages: () => Promise<Array<{ role?: string; content?: string; name?: string; turnIndex?: number }>>;
        openReviewDialog: (input: {
            meta: { dreamId: string; triggerReason: string; createdAt: number };
            recall: DreamSessionRecallRecord;
            output: DreamSessionOutputRecord;
            maintenanceProposals: DreamMaintenanceProposalRecord[];
            diagnostics?: DreamSessionDiagnosticsRecord | null;
            graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
        }) => Promise<DreamReviewDecision>;
    }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.repository = input.repository;
        this.dreamRepository = new DreamSessionRepository(this.chatKey);
        this.mutationApplier = new DreamMutationApplier(this.chatKey, this.repository);
        this.diagnosticsService = new DreamRecallDiagnosticsService(this.chatKey);
        this.recallService = new DreamWaveRecallService({
            chatKey: this.chatKey,
            repository: this.repository,
            readRecentMessages: input.readRecentMessages,
        });
        this.postProcessingService = new DreamPostProcessingService({
            chatKey: this.chatKey,
            repository: this.repository,
        });
        this.maintenancePlanner = new DreamMaintenancePlanner({
            chatKey: this.chatKey,
            repository: this.repository,
        });
        this.promptService = new DreamPromptService();
        this.qualityGuardService = new DreamQualityGuardService(this.chatKey);
        this.getLLM = input.getLLM;
        this.pluginId = input.pluginId;
        this.openReviewDialog = input.openReviewDialog;
    }

    async startDreamSession(reason: DreamTriggerReason, executionContext?: DreamExecutionContext): Promise<DreamStartResult> {
        const settings = readMemoryOSSettings();
        const plan = executionContext?.resolvedPlan ?? resolveDreamExecutionPlan({
            triggerReason: reason,
            settings,
            executionMode: executionContext?.executionMode,
        });
        if (!settings.dreamEnabled) {
            return {
                ok: false,
                reasonCode: 'dream_disabled',
                errorMessage: '当前已关闭梦境系统。',
            };
        }
        if (runningChatKeys.has(this.chatKey)) {
            return {
                ok: false,
                reasonCode: 'dream_running',
                errorMessage: '当前聊天已有梦境会话正在运行，请稍后再试。',
            };
        }
        const dreamId = `dream:${this.chatKey}:${crypto.randomUUID()}`;
        const now = Date.now();
        const meta: DreamSessionMetaRecord = {
            dreamId,
            chatKey: this.chatKey,
            status: 'running',
            triggerReason: reason,
            createdAt: now,
            updatedAt: now,
            settingsSnapshot: {
                retrievalMode: settings.retrievalMode,
                dreamContextMaxChars: settings.dreamContextMaxChars,
                dreamPromptVersion: settings.dreamPromptVersion,
                dreamPromptStylePreset: settings.dreamPromptStylePreset,
            },
            executionMode: plan.executionMode,
            runProfile: plan.runProfile,
        };
        let sessionPersisted = false;
        runningChatKeys.add(this.chatKey);
        await this.repository.appendMutationHistory({
            action: 'dream_session_started',
            payload: {
                dreamId,
                chatKey: this.chatKey,
                triggerReason: reason,
                holderId: executionContext?.holderId,
                executionMode: plan.executionMode,
                runProfile: plan.runProfile,
                contextTriggerSource: executionContext?.triggerSource,
            },
        });

        try {
            const recallBundle = await this.recallService.buildRecallBundle();
            const recallRecord: DreamSessionRecallRecord = {
                ...recallBundle.recall,
                dreamId,
                chatKey: this.chatKey,
            };

            const diagnosticsRecord = settings.dreamDiagnosticsEnabled
                ? {
                    ...recallBundle.diagnostics,
                    dreamId,
                    chatKey: this.chatKey,
                }
                : null;
            const graphSnapshotRecord = settings.dreamDiagnosticsEnabled && recallBundle.graphSnapshot
                ? {
                    ...recallBundle.graphSnapshot,
                    dreamId,
                    chatKey: this.chatKey,
                }
                : null;

            const output = await this.generateDreamOutput({
                dreamId,
                meta,
                recall: recallBundle.recall,
                diagnostics: recallBundle.diagnostics,
                graphSnapshot: graphSnapshotRecord,
                candidateMap: recallBundle.candidateMap,
                plan,
            });
            const maintenanceProposals = settings.dreamMaintenanceEnabled && plan.allowMaintenance
                ? await this.postProcessingService.buildDreamMaintenanceProposals({
                    dreamId,
                    recall: recallBundle.recall,
                    output,
                    candidateMap: recallBundle.candidateMap,
                    maxProposals: settings.dreamMaintenanceMaxProposalsPerRun,
                })
                : [];
            await this.maintenancePlanner.scheduleDreamMaintenance({
                proposals: maintenanceProposals,
            });
            const qualityReport = settings.dreamQualityGuardEnabled
                ? await this.qualityGuardService.evaluateDreamQuality({
                    dreamId,
                    output,
                    maintenanceProposals,
                    plan,
                })
                : null;
            if (qualityReport) {
                await this.dreamRepository.saveDreamQualityReport(qualityReport);
            }
            await this.dreamRepository.saveDreamSessionMeta({
                ...meta,
                status: 'generated',
                updatedAt: Date.now(),
            });
            sessionPersisted = true;
            await this.dreamRepository.saveDreamSessionRecall(recallRecord);
            await this.diagnosticsService.saveDiagnostics(diagnosticsRecord);
            await this.diagnosticsService.saveGraphSnapshot(graphSnapshotRecord);
            await this.dreamRepository.saveDreamSessionOutput(output);

            if (plan.runProfile === 'auto_review') {
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'pending',
                    approvedMutationIds: [],
                    rejectedMutationIds: qualityReport?.blockedMutationIds ?? [],
                    approvedMaintenanceProposalIds: [],
                    rejectedMaintenanceProposalIds: [],
                    approvalMode: 'deferred',
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                await this.repository.appendMutationHistory({
                    action: 'dream_session_auto_generated',
                    payload: {
                        dreamId,
                        triggerReason: reason,
                        executionMode: plan.executionMode,
                        runProfile: plan.runProfile,
                        maintenanceProposalCount: maintenanceProposals.length,
                        autoAppliedMaintenanceIds: [],
                    },
                });
                return { ok: true, dreamId, status: 'deferred' };
            }

            if (plan.runProfile === 'auto_light') {
                const autoAppliedMaintenance = await this.maybeAutoApplyLowRiskMaintenance({
                    dreamId,
                    proposals: maintenanceProposals,
                    qualityReport,
                    plan,
                });
                if (autoAppliedMaintenance.length > 0) {
                    await this.maintenancePlanner.mergeAppliedMaintenanceIntoRollback({
                        dreamId,
                        appliedProposals: autoAppliedMaintenance,
                    });
                }
                await this.rejectPendingMaintenanceProposals(maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
                    return !autoAppliedMaintenance.some((applied: DreamMaintenanceProposalRecord): boolean => applied.proposalId === proposal.proposalId);
                }));
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'approved',
                    approvedMutationIds: [],
                    rejectedMutationIds: output.proposedMutations.map((item: DreamMutationProposal): string => item.mutationId),
                    approvedMaintenanceProposalIds: autoAppliedMaintenance.map((item: DreamMaintenanceProposalRecord): string => item.proposalId),
                    rejectedMaintenanceProposalIds: maintenanceProposals
                        .map((item: DreamMaintenanceProposalRecord): string => item.proposalId)
                        .filter((proposalId: string): boolean => !autoAppliedMaintenance.some((item: DreamMaintenanceProposalRecord): boolean => item.proposalId === proposalId)),
                    approvalMode: 'auto_silent',
                    approvedAt: autoAppliedMaintenance.length > 0 ? Date.now() : undefined,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                await this.repository.appendMutationHistory({
                    action: 'dream_session_auto_light_generated',
                    payload: {
                        dreamId,
                        triggerReason: reason,
                        executionMode: plan.executionMode,
                        runProfile: plan.runProfile,
                        maintenanceProposalCount: maintenanceProposals.length,
                        autoAppliedMaintenanceIds: autoAppliedMaintenance.map((item: DreamMaintenanceProposalRecord): string => item.proposalId),
                    },
                });
                return { ok: true, dreamId, status: 'generated' };
            }

            const reviewResult = await this.openReviewDialog({
                meta: {
                    dreamId,
                    triggerReason: reason,
                    createdAt: meta.createdAt,
                },
                recall: recallRecord,
                output,
                maintenanceProposals,
                diagnostics: diagnosticsRecord,
                graphSnapshot: graphSnapshotRecord,
            });
            const review: DreamReviewDecision = {
                decision: reviewResult.decision,
                approvedMutationIds: Array.isArray(reviewResult.approvedMutationIds) ? reviewResult.approvedMutationIds : [],
                rejectedMutationIds: Array.isArray(reviewResult.rejectedMutationIds) ? reviewResult.rejectedMutationIds : [],
                approvedMaintenanceProposalIds: Array.isArray(reviewResult.approvedMaintenanceProposalIds) ? reviewResult.approvedMaintenanceProposalIds : [],
                rejectedMaintenanceProposalIds: Array.isArray(reviewResult.rejectedMaintenanceProposalIds) ? reviewResult.rejectedMaintenanceProposalIds : [],
            };

            if (review.decision === 'deferred') {
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'pending',
                    approvedMutationIds: review.approvedMutationIds,
                    rejectedMutationIds: review.rejectedMutationIds,
                    approvedMaintenanceProposalIds: review.approvedMaintenanceProposalIds,
                    rejectedMaintenanceProposalIds: review.rejectedMaintenanceProposalIds,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                await this.repository.appendMutationHistory({
                    action: 'dream_session_deferred',
                    payload: { dreamId },
                });
                return { ok: true, dreamId, status: 'deferred' };
            }

            if (review.decision === 'rejected' || (review.approvedMutationIds.length <= 0 && review.approvedMaintenanceProposalIds.length <= 0)) {
                await this.rejectPendingMaintenanceProposals(maintenanceProposals);
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'rejected',
                    approvedMutationIds: [],
                    rejectedMutationIds: output.proposedMutations.map((item: DreamMutationProposal): string => item.mutationId),
                    approvedMaintenanceProposalIds: [],
                    rejectedMaintenanceProposalIds: maintenanceProposals.map((item: DreamMaintenanceProposalRecord): string => item.proposalId),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                await this.dreamRepository.saveDreamSessionMeta({
                    ...meta,
                    status: 'rejected',
                    updatedAt: Date.now(),
                });
                await this.repository.appendMutationHistory({
                    action: 'dream_session_rejected',
                    payload: { dreamId },
                });
                return { ok: true, dreamId, status: 'rejected' };
            }

            const approvedMutations = output.proposedMutations.filter((mutation: DreamMutationProposal): boolean => {
                return review.approvedMutationIds.includes(mutation.mutationId);
            });
            const guardedMutations = qualityReport
                ? this.qualityGuardService.guardDreamMutations({
                    output: {
                        ...output,
                        proposedMutations: approvedMutations,
                    },
                    qualityReport,
                })
                : approvedMutations;
            const applyResult: {
                rollbackKey?: string;
                appliedMutationIds: string[];
                affectedEntryIds: string[];
                affectedRelationshipIds: string[];
            } = guardedMutations.length > 0
                ? await this.mutationApplier.applyDreamMutations({
                    dreamId,
                    mutations: guardedMutations,
                })
                : {
                    rollbackKey: '',
                    appliedMutationIds: [],
                    affectedEntryIds: [],
                    affectedRelationshipIds: [],
                };
            const selectedMaintenanceProposals = maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
                return review.approvedMaintenanceProposalIds.includes(proposal.proposalId);
            });
            const appliedMaintenance: DreamMaintenanceProposalRecord[] = [];
            for (const proposal of selectedMaintenanceProposals) {
                appliedMaintenance.push(await this.maintenancePlanner.applyDreamMaintenanceProposal(proposal));
            }
            await this.rejectPendingMaintenanceProposals(maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
                return proposal.status === 'pending' && !review.approvedMaintenanceProposalIds.includes(proposal.proposalId);
            }));
            if (appliedMaintenance.length > 0) {
                await this.maintenancePlanner.mergeAppliedMaintenanceIntoRollback({
                    dreamId,
                    appliedProposals: appliedMaintenance,
                });
            }
            await this.dreamRepository.saveDreamSessionApproval({
                dreamId,
                chatKey: this.chatKey,
                status: 'approved',
                approvedMutationIds: applyResult.appliedMutationIds,
                rejectedMutationIds: output.proposedMutations
                    .map((item: DreamMutationProposal): string => item.mutationId)
                    .filter((mutationId: string): boolean => !applyResult.appliedMutationIds.includes(mutationId)),
                approvedMaintenanceProposalIds: appliedMaintenance.map((item: DreamMaintenanceProposalRecord): string => item.proposalId),
                rejectedMaintenanceProposalIds: maintenanceProposals
                    .map((item: DreamMaintenanceProposalRecord): string => item.proposalId)
                    .filter((proposalId: string): boolean => !review.approvedMaintenanceProposalIds.includes(proposalId)),
                    rollbackKey: applyResult.rollbackKey || undefined,
                    approvalMode: 'interactive',
                    approvedAt: Date.now(),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            await this.dreamRepository.saveDreamSessionMeta({
                ...meta,
                status: 'approved',
                updatedAt: Date.now(),
            });
            return { ok: true, dreamId, status: 'approved' };
        } catch (error) {
            const message = String((error as Error)?.message ?? error).trim() || 'dream_failed';
            if (sessionPersisted) {
                await this.dreamRepository.saveDreamSessionMeta({
                    ...meta,
                    status: 'failed',
                    updatedAt: Date.now(),
                    failureReason: message,
                });
            } else if (typeof this.dreamRepository.deleteDreamSessionArtifacts === 'function') {
                await this.dreamRepository.deleteDreamSessionArtifacts(dreamId);
            }
            await this.repository.appendMutationHistory({
                action: 'dream_session_failed',
                payload: {
                    dreamId,
                    errorMessage: message,
                },
            });
            return {
                ok: false,
                dreamId,
                status: 'failed',
                reasonCode: 'dream_failed',
                errorMessage: message,
            };
        } finally {
            runningChatKeys.delete(this.chatKey);
        }
    }

    private async rejectPendingMaintenanceProposals(proposals: DreamMaintenanceProposalRecord[]): Promise<void> {
        const pendingProposals = proposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => proposal.status === 'pending');
        if (pendingProposals.length <= 0) {
            return;
        }
        const now = Date.now();
        await Promise.all(pendingProposals.map((proposal: DreamMaintenanceProposalRecord): Promise<void> => {
            return this.dreamRepository.saveDreamMaintenanceProposal({
                ...proposal,
                status: 'rejected',
                rejectedAt: proposal.rejectedAt ?? now,
                updatedAt: now,
            });
        }));
    }

    private async generateDreamOutput(input: {
        dreamId: string;
        meta: DreamSessionMetaRecord;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        diagnostics: Omit<DreamSessionDiagnosticsRecord, 'dreamId' | 'chatKey'>;
        graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
        candidateMap: Map<string, DreamRecallCandidate>;
        plan: ResolvedDreamExecutionPlan;
    }): Promise<DreamSessionOutputRecord> {
        const llm = this.getLLM();
        if (!llm) {
            throw new Error('当前未连接可用的 LLMHub 服务，无法执行梦境生成。');
        }
        const settings = readMemoryOSSettings();
        const worldStrategy = await resolveChatWorldStrategy({
            repository: this.repository,
            texts: [
                ...input.recall.fusedHits.slice(0, 10).map((item) => `${item.title} ${item.summary}`),
                ...input.recall.recentHits.slice(0, 6).map((item) => `${item.title} ${item.summary}`),
            ],
        });
        const promptBuildResult = this.promptService.buildDreamPrompt({
            meta: input.meta,
            recall: {
                ...input.recall,
                dreamId: input.dreamId,
                chatKey: this.chatKey,
            },
            diagnostics: {
                ...input.diagnostics,
                dreamId: input.dreamId,
                chatKey: this.chatKey,
            },
            graphSnapshot: input.graphSnapshot
                ? {
                    ...input.graphSnapshot,
                    dreamId: input.dreamId,
                    chatKey: this.chatKey,
                }
                : null,
            settings,
            candidateMap: input.candidateMap,
            worldStrategyHintText: buildWorldStrategyHintText(worldStrategy, 'dream'),
            plan: input.plan,
        });
        const worldProfileFieldPolicy = buildWorldProfileFieldPolicy(worldStrategy.explanation);
        const schema = {
            type: 'object',
            additionalProperties: false,
            required: ['narrative', 'highlights', 'proposedMutations'],
            properties: {
                narrative: { type: 'string' },
                highlights: { type: 'array', items: { type: 'string' } },
                proposedMutations: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['mutationId', 'mutationType', 'confidence', 'reason', 'sourceWave', 'sourceEntryRefs', 'preview', 'payload', 'explain'],
                        properties: {
                            mutationId: { type: 'string' },
                            mutationType: { type: 'string', enum: ['entry_create', 'entry_patch', 'relationship_patch'] },
                            confidence: { type: 'number' },
                            reason: { type: 'string' },
                            sourceWave: { type: 'string', enum: ['recent', 'mid', 'deep', 'fused'] },
                            sourceEntryRefs: { type: 'array', items: { type: 'string' } },
                            preview: { type: 'string' },
                            payload: this.buildDreamMutationPayloadSchema(),
                            explain: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['sourceWave', 'sourceEntryRefs', 'sourceNodeRefs', 'bridgeNodeRefs', 'explanationSteps', 'confidenceBreakdown'],
                                properties: {
                                    sourceWave: { type: 'string', enum: ['recent', 'mid', 'deep', 'fused'] },
                                    sourceEntryRefs: { type: 'array', items: { type: 'string' } },
                                    sourceNodeRefs: { type: 'array', items: { type: 'string' } },
                                    bridgeNodeRefs: { type: 'array', items: { type: 'string' } },
                                    explanationSteps: { type: 'array', items: { type: 'string' } },
                                    confidenceBreakdown: {
                                        type: 'object',
                                        additionalProperties: false,
                                        required: ['retrieval', 'activation', 'novelty', 'repetitionPenalty', 'final'],
                                        properties: {
                                            retrieval: { type: 'number' },
                                            activation: { type: 'number' },
                                            novelty: { type: 'number' },
                                            repetitionPenalty: { type: 'number' },
                                            final: { type: 'number' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };
        const result = await llm.runTask<{
            narrative?: string;
            highlights?: string[];
            proposedMutations?: Array<Record<string, unknown>>;
        }>({
            consumer: this.pluginId,
            taskKey: 'memory_dream_phase2',
            taskDescription: '梦境第二阶段结构化输出',
            taskKind: 'generation',
            input: {
                messages: promptBuildResult.messages,
            },
            schema,
            schemaCompat: settings.dreamPromptStrictJson
                ? {
                    strictAutofill: 'default',
                    onIncompatible: 'error',
                }
                : undefined,
            enqueue: {
                displayMode: 'compact',
            },
        });
        if (!result.ok) {
            throw new Error(String(result.error ?? result.reasonCode ?? 'dream_llm_failed'));
        }
        const normalized = this.normalizeDreamOutput(result.data, {
            candidateMap: input.candidateMap,
            entryRefToEntryId: promptBuildResult.promptContext.entryRefToEntryId,
            nodeRefToNodeKey: promptBuildResult.promptContext.nodeRefToNodeKey,
            candidateByEntryRef: promptBuildResult.promptContext.candidateByEntryRef,
            worldProfileFieldPolicy,
        });
        const plannedOutput = {
            ...normalized,
            highlights: normalized.highlights.slice(0, input.plan.maxHighlights),
            proposedMutations: input.plan.allowMutations
                ? normalized.proposedMutations.slice(0, input.plan.maxMutations)
                : [],
        };
        this.validateDreamOutput(plannedOutput, settings, input.plan);
        return {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            promptInfo: promptBuildResult.promptInfo,
            narrative: plannedOutput.narrative,
            highlights: plannedOutput.highlights,
            proposedMutations: plannedOutput.proposedMutations,
            outputKind: input.plan.outputKind,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    private buildDreamMutationPayloadSchema(): Record<string, unknown> {
        return {
            type: 'object',
            additionalProperties: false,
            required: [
                'entryId',
                'title',
                'entryType',
                'summary',
                'detail',
                'fieldsJson',
                'detailPayloadJson',
                'tags',
                'reasonCodes',
                'compareKey',
                'entityKey',
                'matchKeys',
                'actorBindings',
                'ongoing',
                'relationshipId',
                'sourceActorKey',
                'targetActorKey',
                'relationTag',
                'state',
                'trust',
                'affection',
                'tension',
                'participants',
            ],
            properties: {
                entryId: { type: 'string' },
                title: { type: 'string' },
                entryType: { type: 'string' },
                summary: { type: 'string' },
                detail: { type: 'string' },
                fieldsJson: { type: 'string' },
                detailPayloadJson: { type: 'string' },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                },
                reasonCodes: {
                    type: 'array',
                    items: { type: 'string' },
                },
                compareKey: { type: 'string' },
                entityKey: { type: 'string' },
                matchKeys: {
                    type: 'array',
                    items: { type: 'string' },
                },
                actorBindings: {
                    type: 'array',
                    items: { type: 'string' },
                },
                ongoing: { type: 'boolean' },
                relationshipId: { type: 'string' },
                sourceActorKey: { type: 'string' },
                targetActorKey: { type: 'string' },
                relationTag: { type: 'string' },
                state: { type: 'string' },
                trust: { type: 'number' },
                affection: { type: 'number' },
                tension: { type: 'number' },
                participants: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
        };
    }

    private normalizeDreamOutput(
        value: {
            narrative?: string;
            highlights?: string[];
            proposedMutations?: Array<Record<string, unknown>>;
        },
        promptContext: {
            candidateMap: Map<string, DreamRecallCandidate>;
            entryRefToEntryId: Map<string, string>;
            nodeRefToNodeKey: Map<string, string>;
            candidateByEntryRef: Map<string, DreamRecallCandidate>;
            worldProfileFieldPolicy: WorldProfileFieldPolicy | null;
        },
    ): {
        narrative: string;
        highlights: string[];
        proposedMutations: DreamMutationProposal[];
    } {
        const narrative = String(value?.narrative ?? '').trim() || '本轮梦境只感到记忆在回声中轻微震荡，没有形成足够稳定的新叙事。';
        const settings = readMemoryOSSettings();
        const highlights = Array.isArray(value?.highlights)
            ? Array.from(new Set(value.highlights.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean))).slice(0, settings.dreamPromptMaxHighlights)
            : [];
        const proposedMutations = (Array.isArray(value?.proposedMutations) ? value.proposedMutations : [])
            .map((item: Record<string, unknown>, index: number): DreamMutationProposal | null => {
                const mutationType = String(item.mutationType ?? '').trim();
                if (mutationType !== 'entry_create' && mutationType !== 'entry_patch' && mutationType !== 'relationship_patch') {
                    return null;
                }
                const sourceEntryIds = this.decodePromptEntryRefs(item.sourceEntryRefs ?? item.sourceEntryIds, promptContext.entryRefToEntryId);
                if (sourceEntryIds.length <= 0) {
                    return null;
                }
                const sourceWave = this.normalizeSourceWave(item.sourceWave);
                const normalizedPayload = this.normalizeDreamMutationPayload(
                    this.toRecord(item.payload),
                    mutationType,
                    promptContext.worldProfileFieldPolicy,
                );
                return {
                    mutationId: String(item.mutationId ?? '').trim() || `dream_mutation_${index + 1}`,
                    mutationType,
                    confidence: this.normalizeDreamMutationConfidence(item.confidence, normalizedPayload),
                    reason: String(item.reason ?? '').trim() || '模型未提供额外理由。',
                    sourceWave,
                    sourceEntryIds,
                    preview: String(item.preview ?? '').trim() || mutationType,
                    payload: normalizedPayload,
                    explain: this.normalizeMutationExplain(item.explain, {
                        sourceWave,
                        sourceEntryIds,
                        promptContext,
                    }),
                };
            })
            .filter((item: DreamMutationProposal | null): item is DreamMutationProposal => Boolean(item))
            .slice(0, Math.min(DREAM_PHASE1_MAX_MUTATION_COUNT, settings.dreamPromptMaxMutations));
        return {
            narrative,
            highlights,
            proposedMutations,
        };
    }

    private normalizeMutationExplain(
        value: unknown,
        fallback: {
            sourceWave: DreamRecallSource;
            sourceEntryIds: string[];
            promptContext: {
                candidateMap: Map<string, DreamRecallCandidate>;
                entryRefToEntryId: Map<string, string>;
                nodeRefToNodeKey: Map<string, string>;
                candidateByEntryRef: Map<string, DreamRecallCandidate>;
            };
        },
    ): DreamMutationExplain {
        const record = this.toRecord(value);
        const sourceCandidates = fallback.sourceEntryIds
            .map((entryId: string): DreamRecallCandidate | undefined => fallback.promptContext.candidateMap.get(entryId))
            .filter((item: DreamRecallCandidate | undefined): item is DreamRecallCandidate => Boolean(item));
        const sourceNodeKeys = Array.from(new Set(
            sourceCandidates.flatMap((candidate: DreamRecallCandidate): string[] => candidate.sourceNodeKeys),
        ));
        const bridgeNodeKeys = Array.from(new Set(
            sourceCandidates.flatMap((candidate: DreamRecallCandidate): string[] => candidate.bridgeNodeKeys),
        ));
        const retrievalScore = sourceCandidates.length > 0
            ? sourceCandidates.reduce((sum: number, candidate: DreamRecallCandidate): number => sum + candidate.baseScore, 0) / sourceCandidates.length
            : FALLBACK_RETRIEVAL_SCORE;
        const activationScore = sourceCandidates.length > 0
            ? sourceCandidates.reduce((sum: number, candidate: DreamRecallCandidate): number => sum + candidate.activationScore, 0) / sourceCandidates.length
            : 0;
        const noveltyScore = sourceCandidates.length > 0
            ? sourceCandidates.reduce((sum: number, candidate: DreamRecallCandidate): number => sum + candidate.noveltyScore, 0) / sourceCandidates.length
            : 0;
        const repetitionPenalty = sourceCandidates.length > 0
            ? sourceCandidates.reduce((sum: number, candidate: DreamRecallCandidate): number => sum + candidate.repetitionPenalty, 0) / sourceCandidates.length
            : 0;
        const finalScore = Math.max(0, Math.min(1, retrievalScore + activationScore * WEIGHT_ACTIVATION + noveltyScore * WEIGHT_NOVELTY - repetitionPenalty * WEIGHT_REPETITION_PENALTY));
        return {
            sourceWave: this.normalizeSourceWave(record.sourceWave || fallback.sourceWave),
            sourceEntryIds: this.decodePromptEntryRefs(record.sourceEntryRefs ?? record.sourceEntryIds, fallback.promptContext.entryRefToEntryId, fallback.sourceEntryIds),
            sourceNodeKeys: this.decodePromptNodeRefs(record.sourceNodeRefs ?? record.sourceNodeKeys, fallback.promptContext.nodeRefToNodeKey, sourceNodeKeys),
            bridgeNodeKeys: this.decodePromptNodeRefs(record.bridgeNodeRefs ?? record.bridgeNodeKeys, fallback.promptContext.nodeRefToNodeKey, bridgeNodeKeys),
            explanationSteps: Array.isArray(record.explanationSteps)
                ? record.explanationSteps.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean).slice(0, 6)
                : [
                    `从 ${fallback.sourceWave} 波段抽取 ${fallback.sourceEntryIds.length} 条来源记忆。`,
                    sourceNodeKeys.length > 0 ? `命中源节点 ${sourceNodeKeys.slice(0, 4).join('、')}。` : '未显式命中源节点，使用来源条目直接解释。',
                    bridgeNodeKeys.length > 0 ? `通过桥接节点 ${bridgeNodeKeys.slice(0, 4).join('、')} 形成联想。` : '未形成额外桥接节点，保守输出提案。',
                ],
            confidenceBreakdown: {
                retrieval: this.clampUnitInterval(this.toRecord(record.confidenceBreakdown).retrieval ?? retrievalScore),
                activation: this.clampUnitInterval(this.toRecord(record.confidenceBreakdown).activation ?? activationScore),
                novelty: this.clampUnitInterval(this.toRecord(record.confidenceBreakdown).novelty ?? noveltyScore),
                repetitionPenalty: this.clampUnitInterval(this.toRecord(record.confidenceBreakdown).repetitionPenalty ?? repetitionPenalty),
                final: this.clampUnitInterval(this.toRecord(record.confidenceBreakdown).final ?? finalScore),
            },
        };
    }

    /**
     * 功能：按世界画像策略规范化 dream mutation 载荷。
     * @param payload 原始载荷。
     * @param mutationType mutation 类型。
     * @param worldProfileFieldPolicy 世界画像字段策略。
     * @returns 归一化后的载荷。
     */
    private normalizeDreamMutationPayload(
        payload: Record<string, unknown>,
        mutationType: DreamMutationType,
        worldProfileFieldPolicy: WorldProfileFieldPolicy | null,
    ): Record<string, unknown> {
        const normalizedPayload: Record<string, unknown> = {
            ...payload,
            fieldsJson: this.normalizeJsonObjectText(payload.fieldsJson),
            detailPayloadJson: this.normalizeJsonObjectText(payload.detailPayloadJson),
            fields: {
                ...this.parseDreamJsonObjectField(payload.fieldsJson),
                ...this.toRecord(payload.fields),
            },
            detailPayload: {
                ...this.parseDreamJsonObjectField(payload.detailPayloadJson),
                ...this.toRecord(payload.detailPayload),
            },
        };
        if (mutationType === 'relationship_patch') {
            return normalizedPayload;
        }
        const entryType = this.normalizeText(normalizedPayload.entryType) || 'other';
        const detailPayload = {
            ...this.toRecord(normalizedPayload.detailPayload),
        };
        const baseFields = {
            ...this.toRecord(normalizedPayload.fields),
            ...this.toRecord(detailPayload.fields),
        };
        const fieldPolicy = applyWorldProfileFieldPolicy({
            schemaId: entryType,
            fields: baseFields,
            reasonCodes: [
                ...this.normalizeStringArray(normalizedPayload.reasonCodes),
                ...this.normalizeStringArray(detailPayload.reasonCodes),
            ],
            policy: worldProfileFieldPolicy,
        });
        return {
            ...normalizedPayload,
            entryType,
            fields: fieldPolicy.fields,
            reasonCodes: fieldPolicy.reasonCodes,
            detailPayload: {
                ...detailPayload,
                fields: fieldPolicy.fields,
                reasonCodes: fieldPolicy.reasonCodes,
                worldProfileGuard: {
                    profileId: worldProfileFieldPolicy?.profileId ?? '',
                    missingFields: fieldPolicy.missingFields,
                    suppressed: fieldPolicy.suppressed,
                    preferred: fieldPolicy.preferred,
                },
            },
        };
    }

    /**
     * 功能：根据世界画像守卫调整 mutation 置信度。
     * @param value 原始置信度。
     * @param payload 归一化后的载荷。
     * @returns 调整后的置信度。
     */
    private normalizeDreamMutationConfidence(value: unknown, payload: Record<string, unknown>): number {
        const detailPayload = this.toRecord(payload.detailPayload);
        const worldProfileGuard = this.toRecord(detailPayload.worldProfileGuard);
        const suppressed = Boolean(worldProfileGuard.suppressed);
        const normalized = this.clampUnitInterval(value);
        if (suppressed) {
            return Math.min(normalized, 0.74);
        }
        return normalized;
    }

    /**
     * 功能：将梦境输出中的 JSON 字符串字段解析为对象。
     * @param value 待解析的 JSON 字符串或对象。
     * @returns 解析后的普通对象；解析失败时返回空对象。
     */
    private parseDreamJsonObjectField(value: unknown): Record<string, unknown> {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return value as Record<string, unknown>;
        }
        const text = String(value ?? '').trim();
        if (!text) {
            return {};
        }
        try {
            const parsed = JSON.parse(text) as unknown;
            return this.toRecord(parsed);
        } catch {
            return {};
        }
    }

    /**
     * 功能：将任意输入规整为严格 JSON Schema 友好的对象字符串。
     * @param value 原始值。
     * @returns JSON 对象字符串；无效时返回空对象字符串。
     */
    private normalizeJsonObjectText(value: unknown): string {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed) {
                return trimmed;
            }
        }
        const record = this.parseDreamJsonObjectField(value);
        const keys = Object.keys(record);
        if (keys.length <= 0) {
            return EMPTY_JSON_OBJECT_TEXT;
        }
        return JSON.stringify(record);
    }

    private normalizeSourceWave(value: unknown): 'recent' | 'mid' | 'deep' | 'fused' {
        const normalized = String(value ?? '').trim();
        return normalized === 'recent' || normalized === 'mid' || normalized === 'deep' ? normalized : 'fused';
    }

    private decodePromptEntryRefs(
        value: unknown,
        entryRefToEntryId: Map<string, string>,
        fallback: string[] = [],
    ): string[] {
        if (!Array.isArray(value)) {
            return fallback;
        }
        const decoded = value.map((item: unknown): string => {
            const normalized = String(item ?? '').trim();
            if (!normalized) {
                return '';
            }
            return entryRefToEntryId.get(normalized) ?? normalized;
        }).filter(Boolean);
        return decoded.length > 0 ? Array.from(new Set(decoded)) : fallback;
    }

    private decodePromptNodeRefs(
        value: unknown,
        nodeRefToNodeKey: Map<string, string>,
        fallback: string[] = [],
    ): string[] {
        if (!Array.isArray(value)) {
            return fallback;
        }
        const decoded = value.map((item: unknown): string => {
            const normalized = String(item ?? '').trim();
            if (!normalized) {
                return '';
            }
            return nodeRefToNodeKey.get(normalized) ?? normalized;
        }).filter(Boolean);
        return decoded.length > 0 ? Array.from(new Set(decoded)) : fallback;
    }

    private clampUnitInterval(value: unknown): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0.5;
        }
        return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
    }

    /**
     * 功能：归一化普通文本。
     * @param value 原始值。
     * @returns 文本结果。
     */
    private normalizeText(value: unknown): string {
        return String(value ?? '').trim();
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：归一化字符串数组。
     * @param value 原始值。
     * @returns 字符串数组。
     */
    private normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return Array.from(new Set(value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean)));
    }

    private validateDreamOutput(
        output: {
            narrative: string;
            highlights: string[];
            proposedMutations: DreamMutationProposal[];
        },
        settings: ReturnType<typeof readMemoryOSSettings>,
        plan?: ResolvedDreamExecutionPlan,
    ): void {
        if (!String(output.narrative ?? '').trim()) {
            throw new Error('invalid_dream_output:narrative_missing');
        }
        if (!Array.isArray(output.highlights)) {
            throw new Error('invalid_dream_output:highlights_invalid');
        }
        if (!Array.isArray(output.proposedMutations)) {
            throw new Error('invalid_dream_output:mutations_invalid');
        }
        const maxHighlights = plan?.maxHighlights ?? settings.dreamPromptMaxHighlights;
        const maxMutations = plan?.maxMutations ?? settings.dreamPromptMaxMutations;
        if (output.highlights.length > maxHighlights) {
            throw new Error('invalid_dream_output:too_many_highlights');
        }
        if (output.proposedMutations.length > maxMutations) {
            throw new Error('invalid_dream_output:too_many_mutations');
        }
        for (const mutation of output.proposedMutations) {
            if (mutation.sourceEntryIds.length <= 0) {
                throw new Error(`invalid_dream_output:missing_source_entries:${mutation.mutationId}`);
            }
            if (settings.dreamPromptRequireExplain) {
                if (!mutation.explain || mutation.explain.sourceEntryIds.length <= 0 || mutation.explain.explanationSteps.length <= 0) {
                    throw new Error(`invalid_dream_output:missing_explain:${mutation.mutationId}`);
                }
            }
            if (mutation.confidence < 0 || mutation.confidence > 1) {
                throw new Error(`invalid_dream_output:confidence_out_of_range:${mutation.mutationId}`);
            }
        }
    }

    private async maybeAutoApplyLowRiskMaintenance(input: {
        dreamId: string;
        proposals: DreamMaintenanceProposalRecord[];
        qualityReport: DreamQualityReport | null;
        plan?: ResolvedDreamExecutionPlan;
    }): Promise<DreamMaintenanceProposalRecord[]> {
        const settings = readMemoryOSSettings();
        const allowAutoApply = input.plan?.allowAutoApplyLowRiskMaintenance ?? settings.dreamAutoApplyLowRiskMaintenance;
        if (!settings.dreamMaintenanceEnabled || !allowAutoApply) {
            return [];
        }
        if (input.qualityReport && input.qualityReport.qualityScore < AUTO_APPLY_MIN_QUALITY_SCORE) {
            return [];
        }
        const lowRisk = input.proposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
            return this.maintenancePlanner.canAutoApplyProposal(proposal, {
                plan: input.plan,
                minConfidence: AUTO_APPLY_MIN_CONFIDENCE,
            });
        });
        const applied: DreamMaintenanceProposalRecord[] = [];
        for (const proposal of lowRisk) {
            applied.push(await this.maintenancePlanner.applyDreamMaintenanceProposal(proposal));
        }
        return applied;
    }
}
