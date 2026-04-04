import type { EntryRepository } from '../repository/entry-repository';
import type { MemoryLLMApi } from '../memory-summary';
import { readMemoryOSSettings } from '../settings/store';
import { DreamMaintenancePlanner } from './dream-maintenance-planner';
import { DreamMutationApplier } from './dream-mutation-applier';
import { DreamPostProcessingService } from './dream-post-processing-service';
import { DreamQualityGuardService } from './dream-quality-guard-service';
import { DreamRecallDiagnosticsService } from './dream-recall-diagnostics-service';
import { DreamSessionRepository } from './dream-session-repository';
import { DreamWaveRecallService, type DreamWaveRecallBuildResult } from './dream-wave-recall-service';
import {
    DREAM_PHASE1_MAX_MUTATION_COUNT,
    type DreamMaintenanceProposalRecord,
    type DreamMutationExplain,
    type DreamMutationProposal,
    type DreamQualityReport,
    type DreamRecallCandidate,
    type DreamRecallHit,
    type DreamReviewDecision,
    type DreamSessionDiagnosticsRecord,
    type DreamSessionGraphSnapshotRecord,
    type DreamSessionMetaRecord,
    type DreamSessionOutputRecord,
    type DreamSessionRecallRecord,
    type DreamTriggerReason,
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

type DreamStartResult = {
    ok: boolean;
    dreamId?: string;
    status?: 'generated' | 'approved' | 'rejected' | 'deferred' | 'failed';
    reasonCode?: string;
    errorMessage?: string;
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
    private readonly qualityGuardService: DreamQualityGuardService;
    private readonly getLLM: () => MemoryLLMApi | null;
    private readonly pluginId: string;
    private readonly openReviewDialog: (input: {
        meta: { dreamId: string; triggerReason: string; createdAt: number };
        recall: DreamSessionRecallRecord;
        output: DreamSessionOutputRecord;
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
        this.qualityGuardService = new DreamQualityGuardService(this.chatKey);
        this.getLLM = input.getLLM;
        this.pluginId = input.pluginId;
        this.openReviewDialog = input.openReviewDialog;
    }

    async startDreamSession(reason: DreamTriggerReason): Promise<DreamStartResult> {
        const settings = readMemoryOSSettings();
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
                contextMaxTokens: settings.contextMaxTokens,
                retrievalMode: settings.retrievalMode,
                dreamContextMaxChars: settings.dreamContextMaxChars,
            },
        };
        runningChatKeys.add(this.chatKey);
        await this.dreamRepository.saveDreamSessionMeta(meta);
        await this.repository.appendMutationHistory({
            action: 'dream_session_started',
            payload: {
                dreamId,
                chatKey: this.chatKey,
                triggerReason: reason,
            },
        });

        try {
            const recallBundle = await this.recallService.buildRecallBundle();
            const recallRecord: DreamSessionRecallRecord = {
                ...recallBundle.recall,
                dreamId,
                chatKey: this.chatKey,
            };
            await this.dreamRepository.saveDreamSessionRecall(recallRecord);

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
            await this.diagnosticsService.saveDiagnostics(diagnosticsRecord);
            await this.diagnosticsService.saveGraphSnapshot(graphSnapshotRecord);

            const output = await this.generateDreamOutput({
                dreamId,
                recall: recallBundle.recall,
                diagnostics: recallBundle.diagnostics,
                candidateMap: recallBundle.candidateMap,
            });
            const maintenanceProposals = settings.dreamMaintenanceEnabled
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
                })
                : null;
            if (qualityReport) {
                await this.dreamRepository.saveDreamQualityReport(qualityReport);
            }
            await this.dreamRepository.saveDreamSessionOutput(output);
            await this.dreamRepository.saveDreamSessionMeta({
                ...meta,
                status: 'generated',
                updatedAt: Date.now(),
            });

            if (reason !== 'manual') {
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'pending',
                    approvedMutationIds: [],
                    rejectedMutationIds: qualityReport?.blockedMutationIds ?? [],
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                const autoAppliedMaintenance = await this.maybeAutoApplyLowRiskMaintenance({
                    dreamId,
                    proposals: maintenanceProposals,
                    qualityReport,
                });
                if (autoAppliedMaintenance.length > 0) {
                    await this.maintenancePlanner.mergeAppliedMaintenanceIntoRollback({
                        dreamId,
                        appliedProposals: autoAppliedMaintenance,
                    });
                }
                await this.repository.appendMutationHistory({
                    action: 'dream_session_auto_generated',
                    payload: {
                        dreamId,
                        triggerReason: reason,
                        maintenanceProposalCount: maintenanceProposals.length,
                        autoAppliedMaintenanceIds: autoAppliedMaintenance.map((item: DreamMaintenanceProposalRecord): string => item.proposalId),
                    },
                });
                return { ok: true, dreamId, status: 'deferred' };
            }

            const review = await this.openReviewDialog({
                meta: {
                    dreamId,
                    triggerReason: reason,
                    createdAt: meta.createdAt,
                },
                recall: recallRecord,
                output,
                diagnostics: diagnosticsRecord,
                graphSnapshot: graphSnapshotRecord,
            });

            if (review.decision === 'deferred') {
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'pending',
                    approvedMutationIds: review.approvedMutationIds,
                    rejectedMutationIds: review.rejectedMutationIds,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
                await this.repository.appendMutationHistory({
                    action: 'dream_session_deferred',
                    payload: { dreamId },
                });
                return { ok: true, dreamId, status: 'deferred' };
            }

            if (review.decision === 'rejected' || review.approvedMutationIds.length <= 0) {
                await this.dreamRepository.saveDreamSessionApproval({
                    dreamId,
                    chatKey: this.chatKey,
                    status: 'rejected',
                    approvedMutationIds: [],
                    rejectedMutationIds: output.proposedMutations.map((item: DreamMutationProposal): string => item.mutationId),
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
            const applyResult = await this.mutationApplier.applyDreamMutations({
                dreamId,
                mutations: guardedMutations,
            });
            const autoAppliedMaintenance = await this.maybeAutoApplyLowRiskMaintenance({
                dreamId,
                proposals: maintenanceProposals,
                qualityReport,
            });
            if (autoAppliedMaintenance.length > 0) {
                await this.maintenancePlanner.mergeAppliedMaintenanceIntoRollback({
                    dreamId,
                    appliedProposals: autoAppliedMaintenance,
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
                rollbackKey: applyResult.rollbackKey,
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
            await this.dreamRepository.saveDreamSessionMeta({
                ...meta,
                status: 'failed',
                updatedAt: Date.now(),
                failureReason: message,
            });
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

    buildDreamPrompt(input: {
        dreamId: string;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        diagnostics: Omit<DreamSessionDiagnosticsRecord, 'dreamId' | 'chatKey'>;
    }): Array<{ role: 'system' | 'user'; content: string }> {
        const settings = readMemoryOSSettings();
        const renderWave = (title: string, hits: DreamRecallHit[]): string => {
            if (hits.length <= 0) {
                return `=== ${title} ===\n暂无命中`;
            }
            return [
                `=== ${title} ===`,
                ...hits.map((hit: DreamRecallHit, index: number): string => {
                    return [
                        `#${index + 1}`,
                        `entryId: ${hit.entryId}`,
                        `score: ${Number(hit.score ?? 0).toFixed(3)}`,
                        `title: ${hit.title}`,
                        `summary: ${hit.summary}`,
                        `actorKeys: ${hit.actorKeys.join(', ') || '无'}`,
                        `relationKeys: ${hit.relationKeys.join(', ') || '无'}`,
                        `tags: ${hit.tags.join(', ') || '无'}`,
                    ].join('\n');
                }),
            ].join('\n\n');
        };
        const diagnosticsText = input.diagnostics.waveOutputs.map((wave) => {
            return [
                `wave=${wave.waveType}`,
                `seeds=${wave.seedEntryIds.join(', ') || '无'}`,
                `activated=${wave.activatedNodeKeys.slice(0, 8).join(', ') || '无'}`,
                `reason=${wave.diagnostics.baseReason.join(' / ') || '无'}`,
            ].join('\n');
        }).join('\n\n');
        const dreamTreeContext = [
            renderWave('近期碎片 recent', input.recall.recentHits),
            renderWave('中期回音 mid', input.recall.midHits),
            renderWave('深层回声 deep', input.recall.deepHits),
            `=== 诊断桥接 ===\n${diagnosticsText || '无诊断信息'}`,
        ].join('\n\n').slice(0, settings.dreamContextMaxChars);
        return [
            {
                role: 'system',
                content: [
                    '你是 MemoryOS 的梦境整理助手。',
                    '你的任务是根据 DreamWave 第二阶段的 recent / mid / deep 分层召回、图桥节点和融合诊断，生成一段梦境叙事、若干发现摘要，以及供人工审批的记忆修改提案。',
                    '约束：',
                    '1. 只能输出 JSON。',
                    '2. 不允许删除记忆。',
                    '3. 不允许伪造硬事实，推断类内容必须明确写在 reason、preview 与 explain 中。',
                    '4. proposedMutations 最多 8 条。',
                    '5. 每条 mutation 必须包含 sourceEntryIds 与 explain。',
                    '6. explain 中必须包含 sourceWave、sourceEntryIds、sourceNodeKeys、bridgeNodeKeys、explanationSteps、confidenceBreakdown。',
                    '7. 自然语言字段必须使用简体中文。',
                ].join('\n'),
            },
            {
                role: 'user',
                content: [
                    `dreamId: ${input.dreamId}`,
                    '请把这些近期碎片、中期回音、深层回声与图桥节点编织成一段梦境，再产出可审批的结构化提案：',
                    dreamTreeContext || '当前没有可用召回记忆，请返回平稳的空提案。',
                ].join('\n\n'),
            },
        ];
    }

    private async generateDreamOutput(input: {
        dreamId: string;
        recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
        diagnostics: Omit<DreamSessionDiagnosticsRecord, 'dreamId' | 'chatKey'>;
        candidateMap: Map<string, DreamRecallCandidate>;
    }): Promise<DreamSessionOutputRecord> {
        const llm = this.getLLM();
        if (!llm) {
            throw new Error('当前未连接可用的 LLMHub 服务，无法执行梦境生成。');
        }
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
                        required: ['mutationId', 'mutationType', 'confidence', 'reason', 'sourceWave', 'sourceEntryIds', 'preview', 'payload', 'explain'],
                        properties: {
                            mutationId: { type: 'string' },
                            mutationType: { type: 'string', enum: ['entry_create', 'entry_patch', 'relationship_patch'] },
                            confidence: { type: 'number' },
                            reason: { type: 'string' },
                            sourceWave: { type: 'string', enum: ['recent', 'mid', 'deep', 'fused'] },
                            sourceEntryIds: { type: 'array', items: { type: 'string' } },
                            preview: { type: 'string' },
                            payload: { type: 'object' },
                            explain: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['sourceWave', 'sourceEntryIds', 'sourceNodeKeys', 'bridgeNodeKeys', 'explanationSteps', 'confidenceBreakdown'],
                                properties: {
                                    sourceWave: { type: 'string', enum: ['recent', 'mid', 'deep', 'fused'] },
                                    sourceEntryIds: { type: 'array', items: { type: 'string' } },
                                    sourceNodeKeys: { type: 'array', items: { type: 'string' } },
                                    bridgeNodeKeys: { type: 'array', items: { type: 'string' } },
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
                messages: this.buildDreamPrompt(input),
            },
            schema,
            enqueue: {
                displayMode: 'compact',
            },
        });
        if (!result.ok) {
            throw new Error(String(result.error ?? result.reasonCode ?? 'dream_llm_failed'));
        }
        const normalized = this.normalizeDreamOutput(result.data, input.candidateMap);
        return {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            narrative: normalized.narrative,
            highlights: normalized.highlights,
            proposedMutations: normalized.proposedMutations,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    private normalizeDreamOutput(
        value: {
            narrative?: string;
            highlights?: string[];
            proposedMutations?: Array<Record<string, unknown>>;
        },
        candidateMap: Map<string, DreamRecallCandidate>,
    ): {
        narrative: string;
        highlights: string[];
        proposedMutations: DreamMutationProposal[];
    } {
        const narrative = String(value?.narrative ?? '').trim() || '本轮梦境只感到记忆在回声中轻微震荡，没有形成足够稳定的新叙事。';
        const highlights = Array.isArray(value?.highlights)
            ? value.highlights.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean).slice(0, 8)
            : [];
        const proposedMutations = (Array.isArray(value?.proposedMutations) ? value.proposedMutations : [])
            .map((item: Record<string, unknown>, index: number): DreamMutationProposal | null => {
                const mutationType = String(item.mutationType ?? '').trim();
                if (mutationType !== 'entry_create' && mutationType !== 'entry_patch' && mutationType !== 'relationship_patch') {
                    return null;
                }
                const sourceEntryIds = Array.isArray(item.sourceEntryIds)
                    ? item.sourceEntryIds.map((entryId: unknown): string => String(entryId ?? '').trim()).filter(Boolean)
                    : [];
                if (sourceEntryIds.length <= 0) {
                    return null;
                }
                const sourceWave = this.normalizeSourceWave(item.sourceWave);
                return {
                    mutationId: String(item.mutationId ?? '').trim() || `dream_mutation_${index + 1}`,
                    mutationType,
                    confidence: this.clampUnitInterval(item.confidence),
                    reason: String(item.reason ?? '').trim() || '模型未提供额外理由。',
                    sourceWave,
                    sourceEntryIds,
                    preview: String(item.preview ?? '').trim() || mutationType,
                    payload: this.toRecord(item.payload),
                    explain: this.normalizeMutationExplain(item.explain, {
                        sourceWave,
                        sourceEntryIds,
                        candidateMap,
                    }),
                };
            })
            .filter((item: DreamMutationProposal | null): item is DreamMutationProposal => Boolean(item))
            .slice(0, DREAM_PHASE1_MAX_MUTATION_COUNT);
        return {
            narrative,
            highlights,
            proposedMutations,
        };
    }

    private normalizeMutationExplain(
        value: unknown,
        fallback: {
            sourceWave: DreamRecallHit['source'];
            sourceEntryIds: string[];
            candidateMap: Map<string, DreamRecallCandidate>;
        },
    ): DreamMutationExplain {
        const record = this.toRecord(value);
        const sourceCandidates = fallback.sourceEntryIds
            .map((entryId: string): DreamRecallCandidate | undefined => fallback.candidateMap.get(entryId))
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
            sourceEntryIds: Array.isArray(record.sourceEntryIds)
                ? record.sourceEntryIds.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
                : fallback.sourceEntryIds,
            sourceNodeKeys: Array.isArray(record.sourceNodeKeys)
                ? record.sourceNodeKeys.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
                : sourceNodeKeys,
            bridgeNodeKeys: Array.isArray(record.bridgeNodeKeys)
                ? record.bridgeNodeKeys.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
                : bridgeNodeKeys,
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

    private normalizeSourceWave(value: unknown): 'recent' | 'mid' | 'deep' | 'fused' {
        const normalized = String(value ?? '').trim();
        return normalized === 'recent' || normalized === 'mid' || normalized === 'deep' ? normalized : 'fused';
    }

    private clampUnitInterval(value: unknown): number {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return 0.5;
        }
        return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
    }

    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    private async maybeAutoApplyLowRiskMaintenance(input: {
        dreamId: string;
        proposals: DreamMaintenanceProposalRecord[];
        qualityReport: DreamQualityReport | null;
    }): Promise<DreamMaintenanceProposalRecord[]> {
        const settings = readMemoryOSSettings();
        if (!settings.dreamMaintenanceEnabled || !settings.dreamAutoApplyLowRiskMaintenance) {
            return [];
        }
        if (input.qualityReport && input.qualityReport.qualityScore < AUTO_APPLY_MIN_QUALITY_SCORE) {
            return [];
        }
        const lowRisk = input.proposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
            return proposal.confidence >= AUTO_APPLY_MIN_CONFIDENCE
                && proposal.proposalType !== 'memory_compression';
        });
        const applied: DreamMaintenanceProposalRecord[] = [];
        for (const proposal of lowRisk) {
            applied.push(await this.maintenancePlanner.applyDreamMaintenanceProposal(proposal));
        }
        return applied;
    }
}
