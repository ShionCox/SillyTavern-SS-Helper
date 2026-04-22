import type { MemoryEntry, RoleEntryMemory, SummarySnapshot, WorldProfileBinding } from '../types';
import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { normalizeMemoryPromptSchema } from '../memory-prompts/schema-normalizer';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import { buildSummaryMutationContext, buildLightweightPlannerInput } from '../memory-summary-planner';
import { applySummaryMutation, type MutationApplyDependencies } from './mutation-applier';
import { planSummaryMutationBatches } from './mutation-batch-planner';
import {
    appendSummaryMutationBatchResult,
    appendSummaryMutationStagingSnapshot,
    clearSummaryMutationStagingSnapshot,
    readSummaryMutationStagingSnapshot,
} from './mutation-staging-store';
import { finalizeSummaryMutationSnapshot } from './mutation-finalizer';
import { runSummaryMutationBatch } from './mutation-batch-runner';
import { validateSummaryPatch, normalizeSummaryPatch } from './mutation-patch-utils';
import { applyPatchDiffGuard } from './patch-diff-guard';
import {
    validateSummaryMutationDocument,
    type EditableFieldMap,
} from './mutation-validator';
import { buildSummaryWindow, type SummaryWindowMessage } from './summary-window';
import type { SummaryMutationDocument, SummaryPlannerOutput } from './mutation-types';
import type { MemoryLLMApi } from './llm-types';
import { normalizeNarrativeValueWithUserPlaceholder, resolveCurrentNarrativeUserName } from '../utils/narrative-user-name';
import { readMemoryOSSettings } from '../settings/store';
import { resolvePipelineBudgetPolicy } from '../pipeline/pipeline-budget';
import { readPipelineJobRecord, upsertPipelineJobRecord, updatePipelineJobPhase } from '../pipeline/pipeline-job-store';
import { assessBatchTime } from '../memory-time/batch-time-assessment';
import { enhanceMemoryTimeContextWithText, mapBatchToMemoryTimeContext } from '../memory-time/fallback-time-engine';
import { explainBatchAssessment, logTimeDebug } from '../memory-time/time-debug';
import { mergeStoryEventAnchors, resolveTimelineProfileEvolution } from '../memory-time/timeline-profile';
import type { BatchTimeAssessment, MemoryTimeContext, MemoryTimelineProfile } from '../memory-time/time-types';
import { SummaryPromptDTOService } from '../services/summary-prompt-dto-service';

/**
 * 功能：定义总结编排器依赖。
 */
export interface SummaryOrchestratorDependencies extends MutationApplyDependencies {
    listEntries(): Promise<MemoryEntry[]>;
    listRoleMemories(actorKey?: string): Promise<RoleEntryMemory[]>;
    listSummarySnapshots(limit?: number): Promise<SummarySnapshot[]>;
    getWorldProfileBinding(): Promise<WorldProfileBinding | null>;
    getTimelineProfile?(): Promise<MemoryTimelineProfile | null>;
    putTimelineProfile?(profile: MemoryTimelineProfile): Promise<unknown>;
    appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<unknown>;
}

/**
 * 功能：定义总结编排输入。
 */
export interface RunSummaryOrchestratorInput {
    dependencies: SummaryOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    chatKey?: string;
    messages: SummaryWindowMessage[];
    retrievalRulePack: 'native' | 'perocore' | 'hybrid';
}

/**
 * 功能：定义总结编排结果。
 */
export interface RunSummaryOrchestratorResult {
    snapshot: SummarySnapshot | null;
    diagnostics: {
        usedLLM: boolean;
        retrievalProviderId: string;
        matchedEntryIds: string[];
        worldProfile: string;
        reasonCode: string;
    };
}

/**
 * 功能：执行总结编排流程。
 * @param input 编排输入。
 * @returns 编排结果。
 */
export async function runSummaryOrchestrator(input: RunSummaryOrchestratorInput): Promise<RunSummaryOrchestratorResult> {
    const settings = readMemoryOSSettings();
    const budget = resolvePipelineBudgetPolicy(settings);
    const userDisplayName = resolveCurrentNarrativeUserName();
    const promptUserDisplayName = resolveSummaryPromptUserName(input.messages, userDisplayName);
    const userPlaceholder = '{{user}}';
    const summaryLanguageInstruction = '除 action、targetKind、candidateId、compareKey、reasonCodes 及各类键名外，所有自然语言内容必须使用简体中文。';

    await input.dependencies.appendMutationHistory({
        action: 'summary_started',
        payload: { messageCount: input.messages.length },
    });

    const window = buildSummaryWindow(input.messages);
    if (!window.summaryText.trim()) {
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: { reasonCode: 'empty_window' },
        });
        return {
            snapshot: null,
            diagnostics: {
                usedLLM: false,
                retrievalProviderId: 'none',
                matchedEntryIds: [],
                worldProfile: 'unknown',
                reasonCode: 'empty_window',
            },
        };
    }
    const windowBatchTimeAssessment = assessBatchTime({
        batchId: `summary_window:${String(input.chatKey ?? 'global')}:${window.fromTurn}:${window.toTurn}`,
        batchText: window.summaryText,
        startFloor: window.fromTurn,
        endFloor: window.toTurn,
    });
    const summaryTimeDigestBlock = buildSummaryTimeDigest(windowBatchTimeAssessment);

    const entries = await input.dependencies.listEntries();
    const roleMemories = await input.dependencies.listRoleMemories();
    const recentSummaries = await input.dependencies.listSummarySnapshots(4);
    const worldProfileBinding = await input.dependencies.getWorldProfileBinding();
    const memoryPercentByEntryId = buildEntryMemoryPercentMap(roleMemories);
    const worldProfileTexts = [
        window.summaryText,
        ...entries.slice(0, 40).map((entry: MemoryEntry): string => `${entry.title} ${entry.summary}`),
    ];

    const plannerResult = await buildSummaryMutationContext({
        task: 'memory_summary_mutation',
        schemaVersion: '1.0.0',
        window,
        actorHints: window.actorHints,
        entries,
        memoryPercentByEntryId,
        roleMemories,
        recentSummaries: recentSummaries.map((summary: SummarySnapshot) => ({
            title: summary.title,
            content: summary.content,
            updatedAt: summary.updatedAt,
            normalizedSummary: summary.normalizedSummary,
        })),
        worldProfileTexts,
        worldProfileBinding,
        rulePackMode: input.retrievalRulePack,
    });

    await input.dependencies.appendMutationHistory({
        action: 'candidate_types_resolved',
        payload: {
            candidateTypes: plannerResult.context.detectedSignals.candidateTypes,
            worldProfile: plannerResult.diagnostics.worldProfile,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'type_schemas_resolved',
        payload: {
            schemaIds: plannerResult.context.typeSchemas.map((schema): string => schema.schemaId),
            worldProfile: plannerResult.diagnostics.worldProfile,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'candidate_records_resolved',
        payload: {
            retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
            matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
            candidateCount: plannerResult.context.candidateRecords.length,
        },
    });

    if (!input.llm) {
        await input.dependencies.appendMutationHistory({
            action: 'summary_failed',
            payload: {
                reasonCode: 'llm_unavailable',
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        return buildSummaryFailureResult(plannerResult, 'llm_unavailable');
    }

    const summaryJobId = buildSummaryJobId(input.chatKey, plannerResult.context.window.fromTurn, plannerResult.context.window.toTurn);
    const existingStagingSnapshot = readSummaryMutationStagingSnapshot(summaryJobId);
    const promptPack = await loadPromptPackSections();
    let plannerDecision = existingStagingSnapshot?.plannerDecision;
    if (!plannerDecision) {
        const plannerSchema = normalizeMemoryPromptSchema('SUMMARY_PLANNER_SCHEMA', parseJsonSection(promptPack.SUMMARY_PLANNER_SCHEMA));
        const plannerSample = parseJsonSection(promptPack.SUMMARY_PLANNER_OUTPUT_SAMPLE);
        const plannerSystemPrompt = `${renderPromptTemplate(promptPack.SUMMARY_PLANNER_SYSTEM, {
            worldProfile: plannerResult.diagnostics.worldProfile,
            user: userPlaceholder,
            userDisplayName: userPlaceholder,
        })}\n\n${summaryTimeDigestBlock}\n\n${plannerResult.context.worldStrategyHints.join('\n\n')}\n\n所有指代主角、玩家或当前用户的自然语言字段，一律使用 \`${userPlaceholder}\`；不要展开为真实名字，也不要写成“用户”或“主角”。\n\n${summaryLanguageInstruction}`;
        const lightweightPlannerInput = normalizeNarrativeValueWithUserPlaceholder({
            ...buildLightweightPlannerInput(plannerResult.context),
            userPlaceholder,
        }, promptUserDisplayName);
        const plannerUserPayload = buildStructuredTaskUserPayload(
            JSON.stringify(lightweightPlannerInput, null, 2),
            JSON.stringify(plannerSchema ?? {}, null, 2),
            JSON.stringify(plannerSample ?? {}, null, 2),
        );
        const plannerLLMResult = await input.llm.runTask<SummaryPlannerOutput>({
            consumer: input.pluginId,
            taskKey: 'memory_summary_planner',
            taskDescription: '记忆总结第一阶段：候选规划',
            taskKind: 'generation',
            input: {
                messages: [
                    { role: 'system', content: plannerSystemPrompt },
                    { role: 'user', content: plannerUserPayload },
                ],
            },
            schema: plannerSchema,
            enqueue: { displayMode: 'compact' },
        });
        plannerDecision = normalizePlannerOutput(plannerLLMResult.ok ? plannerLLMResult.data : plannerResult.context.plannerHints);
        await input.dependencies.appendMutationHistory({
            action: 'summary_planner_resolved',
            payload: {
                shouldUpdate: plannerDecision.should_update,
                focusTypes: plannerDecision.focus_types,
                entities: plannerDecision.entities,
                topics: plannerDecision.topics,
                reasons: plannerDecision.reasons,
                narrativeStyle: plannerResult.context.narrativeStyle,
                userPlaceholder,
            },
        });
        appendSummaryMutationStagingSnapshot(summaryJobId, {
            plannerContext: plannerResult.context as unknown as Record<string, unknown>,
            plannerDiagnostics: {
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode: 'ok',
            },
            plannerDecision,
        });
    }

    const resolvedPlannerDecision: SummaryPlannerOutput = plannerDecision;
    const actorKeys = window.actorHints.length > 0 ? window.actorHints : ['user'];
    if (!resolvedPlannerDecision.should_update) {
        clearSummaryMutationStagingSnapshot(summaryJobId);
        const noopDocument: SummaryMutationDocument = {
            schemaVersion: '1.0.0',
            window: {
                fromTurn: plannerResult.context.window.fromTurn,
                toTurn: plannerResult.context.window.toTurn,
            },
            actions: [
                {
                    action: 'NOOP',
                    targetKind: resolvedPlannerDecision.focus_types[0] || 'other',
                    reason: resolvedPlannerDecision.reasons[0] || '当前区间没有稳定长期变更。',
                    confidence: 0.9,
                    reasonCodes: ['planner_noop'],
                },
            ],
        };
        await input.dependencies.appendMutationHistory({
            action: 'mutation_validated',
            payload: {
                actionCount: 1,
                plannerNoop: true,
                worldProfile: plannerResult.diagnostics.worldProfile,
            },
        });
        const snapshot = await applySummaryMutation({
            dependencies: input.dependencies,
            mutationDocument: noopDocument,
            candidateRecords: plannerResult.context.candidateRecords,
            actorKeys,
            userDisplayName,
            summaryTitle: '结构化回合总结',
            summaryContent: plannerResult.context.window.summaryText,
        });
        await input.dependencies.appendMutationHistory({
            action: 'mutation_applied',
            payload: {
                summaryId: snapshot.summaryId,
                actionCount: 1,
                plannerNoop: true,
            },
        });
        return {
            snapshot,
            diagnostics: {
                usedLLM: true,
                retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
                matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
                worldProfile: plannerResult.diagnostics.worldProfile,
                reasonCode: 'planner_noop',
            },
        };
    }

    const summarySchema = normalizeMemoryPromptSchema('SUMMARY_SCHEMA', parseJsonSection(promptPack.SUMMARY_SCHEMA));
    const summaryOutputSample = parseJsonSection(promptPack.SUMMARY_OUTPUT_SAMPLE);
    const patchModeInstruction = '本次输出为稀疏 patch 模式：payload 中只输出发生变化的字段，未变化字段不要出现。严禁在 payload 中重复旧 state 的完整内容。若某字段无变化，直接省略该字段。';
    const summarySystemPrompt = `${renderPromptTemplate(promptPack.SUMMARY_SYSTEM, {
        worldProfile: plannerResult.diagnostics.worldProfile,
        user: userPlaceholder,
        userDisplayName: userPlaceholder,
    })}\n\n${summaryTimeDigestBlock}\n\n${plannerResult.context.worldStrategyHints.join('\n\n')}\n\n所有指代主角、玩家或当前用户的自然语言字段，一律使用 \`${userPlaceholder}\`；不要展开为真实名字，也不要写成“用户”或“主角”。\n\n${patchModeInstruction}\n\n${summaryLanguageInstruction}`;
    const editableFieldMap = buildEditableFieldMap(plannerResult.context.typeSchemas);
    upsertPipelineJobRecord({
        jobId: summaryJobId,
        jobType: 'summary',
        status: 'running',
        phase: 'extract',
        sourceMeta: {
            fromTurn: plannerResult.context.window.fromTurn,
            toTurn: plannerResult.context.window.toTurn,
            candidateCount: plannerResult.context.candidateRecords.length,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    const batchPlans = existingStagingSnapshot?.batchPlans && existingStagingSnapshot.batchPlans.length > 0
        ? existingStagingSnapshot.batchPlans
        : planSummaryMutationBatches({
            plannerDecision: resolvedPlannerDecision,
            candidateRecords: plannerResult.context.candidateRecords.map((item) => ({
                candidateId: item.candidateId,
                targetKind: item.targetKind,
            })),
            budget,
            splitByActionType: settings.summarySplitByActionType,
        });
    if (!existingStagingSnapshot?.batchPlans || existingStagingSnapshot.batchPlans.length <= 0) {
        await input.dependencies.appendMutationHistory({
            action: 'summary_mutation_batches_planned',
            payload: {
                summaryJobId,
                batchCount: batchPlans.length,
                batches: batchPlans.map((item) => ({
                    batchId: item.batchId,
                    focusTypes: item.focusTypes,
                    candidateCount: item.candidateIds.length,
                    actionBudget: item.actionBudget,
                })),
            },
        });
        appendSummaryMutationStagingSnapshot(summaryJobId, {
            batchPlans,
        });
    }

    const resumedPlannerContext = (readSummaryMutationStagingSnapshot(summaryJobId)?.plannerContext ?? plannerResult.context) as typeof plannerResult.context;
    const resumedDiagnostics = readSummaryMutationStagingSnapshot(summaryJobId)?.plannerDiagnostics ?? {
        retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
        matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
        worldProfile: plannerResult.diagnostics.worldProfile,
        reasonCode: 'ok',
    };

    for (const batchPlan of batchPlans) {
        if (readSummaryMutationStagingSnapshot(summaryJobId)?.batchResults.some((item) => item.batchId === batchPlan.batchId)) {
            continue;
        }
        updatePipelineJobPhase(summaryJobId, 'reduce');
        const batchDecision: SummaryPlannerOutput = {
            ...resolvedPlannerDecision,
            focus_types: batchPlan.focusTypes,
        };
        const focusTypeSchemas = resumedPlannerContext.typeSchemas.filter(
            (schema) => batchPlan.focusTypes.length <= 0 || batchPlan.focusTypes.includes(schema.schemaId),
        );
        const activeTypeSchemas = focusTypeSchemas.length > 0 ? focusTypeSchemas : resumedPlannerContext.typeSchemas;
        const strictSummarySchema = buildStrictSummaryMutationSchema(summarySchema, activeTypeSchemas);
        const mutationContextResult = buildSlimMutationContext(
            resumedPlannerContext,
            batchDecision,
            settings.summarySecondStageRollingDigestMaxChars || budget.maxRollingDigestChars,
            settings.summarySecondStageCandidateSummaryMaxChars || budget.maxCandidateSummaryChars,
            batchPlan.candidateIds,
        );
        const summaryUserPayload = buildStructuredTaskUserPayload(
            JSON.stringify(normalizeNarrativeValueWithUserPlaceholder({ ...mutationContextResult.payload, userPlaceholder }, promptUserDisplayName), null, 2),
            JSON.stringify(strictSummarySchema ?? {}, null, 2),
            JSON.stringify(summaryOutputSample ?? {}, null, 2),
        );
        const batchResult = await runSummaryMutationBatch({
            llm: input.llm,
            pluginId: input.pluginId,
            taskDescription: `结构化变更生成（${batchPlan.batchId}）`,
            systemPrompt: summarySystemPrompt,
            userPayload: summaryUserPayload,
            schema: strictSummarySchema,
        });
        if (!batchResult.ok || !batchResult.data) {
            const reasonCode = batchResult.reasonCode || 'summary_llm_failed';
            await input.dependencies.appendMutationHistory({
                action: 'summary_failed',
                payload: {
                    reasonCode,
                    batchId: batchPlan.batchId,
                    worldProfile: resumedDiagnostics.worldProfile,
                },
            });
            markSummaryPipelineJobFailed(summaryJobId, reasonCode);
            return buildSummaryFailureResult(
                {
                    ...plannerResult,
                    diagnostics: resumedDiagnostics,
                },
                reasonCode,
            );
        }
        const decodedDocument = decodeSummaryPromptDocument(batchResult.data, mutationContextResult);
        const trimmedDocument = trimMutationDocumentActions(decodedDocument, batchPlan.actionBudget);

        // 稀疏 patch 校验：确保 LLM 输出为有效 patch，而非完整 state 副本
        const patchValidation = validateSummaryPatch(trimmedDocument.actions);
        if (patchValidation.warnings.length > 0) {
            await input.dependencies.appendMutationHistory({
                action: 'patch_validation_warnings',
                payload: {
                    batchId: batchPlan.batchId,
                    warnings: patchValidation.warnings,
                },
            });
        }
        // 规范化 patch 动作（去除无效字段）
        trimmedDocument.actions = normalizeSummaryPatch(trimmedDocument.actions);
        const diffGuardResult = await applyPatchDiffGuard(
            trimmedDocument,
            plannerResult.context.candidateRecords,
            input.dependencies.getEntry,
        );
        trimmedDocument.actions = diffGuardResult.document.actions;
        if (diffGuardResult.diagnostics.some((item) => item.removedPaths.length > 0 || item.downgradedToNoop)) {
            await input.dependencies.appendMutationHistory({
                action: 'patch_diff_guard_applied',
                payload: {
                    batchId: batchPlan.batchId,
                    diagnostics: diffGuardResult.diagnostics,
                },
            });
        }

        const validation = validateSummaryMutationDocument(trimmedDocument, editableFieldMap);
        if (!validation.valid || !validation.document) {
            const reasonCode = `validation_failed:${validation.errors.join(',') || 'unknown'}`;
            await input.dependencies.appendMutationHistory({
                action: 'summary_failed',
                payload: {
                    reasonCode,
                    batchId: batchPlan.batchId,
                    validationErrors: validation.errors,
                    worldProfile: resumedDiagnostics.worldProfile,
                },
            });
            markSummaryPipelineJobFailed(summaryJobId, reasonCode);
            return buildSummaryFailureResult({
                ...plannerResult,
                diagnostics: resumedDiagnostics,
            }, reasonCode);
        }
        appendSummaryMutationBatchResult({
            summaryJobId,
            batchId: batchPlan.batchId,
            focusTypes: batchPlan.focusTypes,
            mutationDocument: validation.document,
        });
    }

    const stagingSnapshot = readSummaryMutationStagingSnapshot(summaryJobId);
    if (!stagingSnapshot || stagingSnapshot.batchResults.length <= 0) {
        clearSummaryMutationStagingSnapshot(summaryJobId);
        markSummaryPipelineJobFailed(summaryJobId, 'empty_mutation_batches');
        return buildSummaryFailureResult({
            ...plannerResult,
            diagnostics: resumedDiagnostics,
        }, 'empty_mutation_batches');
    }

    updatePipelineJobPhase(summaryJobId, 'apply');
    const finalMutationDocument = finalizeSummaryMutationSnapshot(stagingSnapshot);

    // ── 为总结批次生成时间评估 ──
    const summaryBatchTimeAssessment = {
        ...windowBatchTimeAssessment,
        batchId: summaryJobId,
        floorRange: {
            startFloor: finalMutationDocument.window.fromTurn,
            endFloor: finalMutationDocument.window.toTurn,
        },
    };
    finalMutationDocument.batchTimeAssessment = summaryBatchTimeAssessment;

    // 为每个 action 补充时间上下文
    const summaryTimeCtx = mapBatchToMemoryTimeContext({
        assessment: summaryBatchTimeAssessment,
        firstFloor: finalMutationDocument.window.fromTurn,
        lastFloor: finalMutationDocument.window.toTurn,
        source: 'summary_batch',
        sourceText: `${resumedPlannerContext.window.summaryText}\n${resumedPlannerContext.window.recentContextText ?? ''}`,
    });
    for (const action of finalMutationDocument.actions) {
        if (!action.timeContext) {
            action.timeContext = enhanceSummaryActionTimeContext(summaryTimeCtx, action);
        }
    }
    logTimeDebug('summary_batch_time_assessment', {
        summaryJobId,
        mode: summaryTimeCtx.mode,
        confidence: summaryBatchTimeAssessment.confidence,
        explicitMentions: summaryBatchTimeAssessment.explicitMentions,
    });
    if (input.dependencies.putTimelineProfile) {
        const existingTimelineProfile = input.dependencies.getTimelineProfile
            ? await input.dependencies.getTimelineProfile()
            : null;
        const timelineEvolution = resolveTimelineProfileEvolution({
            texts: [
                resumedPlannerContext.window.summaryText,
                resumedPlannerContext.window.recentContextText ?? '',
            ],
            anchorFloor: finalMutationDocument.window.toTurn,
            existingProfile: existingTimelineProfile,
        });
        if (timelineEvolution.shouldPersist) {
            timelineEvolution.profile.currentStoryDayIndex = summaryTimeCtx.storyTime?.storyDayIndex ?? timelineEvolution.profile.currentStoryDayIndex;
            timelineEvolution.profile.eventAnchors = mergeStoryEventAnchors(
                timelineEvolution.profile.eventAnchors ?? [],
                summaryBatchTimeAssessment.eventAnchors ?? [],
            );
            await input.dependencies.putTimelineProfile(timelineEvolution.profile);
            await input.dependencies.appendMutationHistory({
                action: 'timeline_profile_updated',
                payload: {
                    source: 'summary_batch',
                    reason: timelineEvolution.reason,
                    mode: timelineEvolution.profile.mode,
                    calendarKind: timelineEvolution.profile.calendarKind,
                    confidence: timelineEvolution.profile.confidence,
                    anchorTimeText: timelineEvolution.profile.anchorTimeText,
                    version: timelineEvolution.profile.version,
                },
            });
        }
    }

    await input.dependencies.appendMutationHistory({
        action: 'mutation_validated',
        payload: {
            actionCount: finalMutationDocument.actions.length,
            batchCount: stagingSnapshot.batchResults.length,
            plannerDecision: resolvedPlannerDecision,
            worldProfile: resumedDiagnostics.worldProfile,
        },
    });

    const snapshot = await applySummaryMutation({
        dependencies: input.dependencies,
        mutationDocument: finalMutationDocument,
        candidateRecords: resumedPlannerContext.candidateRecords,
        actorKeys,
        userDisplayName,
        summaryTitle: '结构化回合总结',
        summaryContent: resumedPlannerContext.window.summaryText,
    });
    await input.dependencies.appendMutationHistory({
        action: 'mutation_applied',
        payload: {
            summaryId: snapshot.summaryId,
            actionCount: finalMutationDocument.actions.length,
            batchCount: stagingSnapshot.batchResults.length,
        },
    });
    upsertPipelineJobRecord({
        jobId: summaryJobId,
        jobType: 'summary',
        status: 'completed',
        phase: 'apply',
        sourceMeta: {
            actionCount: finalMutationDocument.actions.length,
            batchCount: stagingSnapshot.batchResults.length,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    clearSummaryMutationStagingSnapshot(summaryJobId);
    return {
        snapshot,
        diagnostics: {
            usedLLM: true,
            retrievalProviderId: resumedDiagnostics.retrievalProviderId,
            matchedEntryIds: resumedDiagnostics.matchedEntryIds,
            worldProfile: resumedDiagnostics.worldProfile,
            reasonCode: 'ok',
        },
    };
}

/**
 * 功能：构建总结任务标识，确保同一窗口失败后可从断点继续。
 * @param chatKey 聊天键。
 * @param fromTurn 起始楼层。
 * @param toTurn 结束楼层。
 * @returns 总结任务标识。
 */
function buildSummaryJobId(chatKey: string | undefined, fromTurn: number, toTurn: number): string {
    const normalizedChatKey = String(chatKey ?? '').trim() || 'global';
    return `summary:${normalizedChatKey}:${fromTurn}:${toTurn}`;
}

/**
 * 功能：把总结流水线任务标记为失败。
 * @param summaryJobId 总结任务标识。
 * @param reasonCode 失败原因码。
 * @returns 无返回值。
 */
function markSummaryPipelineJobFailed(summaryJobId: string, reasonCode: string): void {
    const current = readPipelineJobRecord(summaryJobId);
    if (!current) {
        return;
    }
    upsertPipelineJobRecord({
        ...current,
        status: 'failed',
        errorCode: reasonCode,
        errorMessage: reasonCode,
    });
}

/**
 * 功能：构建总结失败结果。
 * @param plannerResult planner 结果。
 * @param reasonCode 原因码。
 * @returns 失败结果。
 */
function buildSummaryFailureResult(
    plannerResult: Awaited<ReturnType<typeof buildSummaryMutationContext>>,
    reasonCode: string,
): RunSummaryOrchestratorResult {
    return {
        snapshot: null,
        diagnostics: {
            usedLLM: false,
            retrievalProviderId: plannerResult.diagnostics.retrievalProviderId,
            matchedEntryIds: plannerResult.diagnostics.matchedEntryIds,
            worldProfile: plannerResult.diagnostics.worldProfile,
            reasonCode,
        },
    };
}

/**
 * 功能：构建精简的 mutation 上下文（稀疏 patch 模式）。
 *
 * 新架构要求：
 * - 只提供与本次更新高度相关的上下文
 * - 不携带完整旧状态副本
 * - 标明 patch 语义，提供字段级约束
 * - 不为模型制造"重写整个对象"的暗示
 *
 * @param context 完整上下文。
 * @param plannerDecision planner 输出。
 * @param rollingDigestMaxChars 滚动摘要上限。
 * @param candidateSummaryMaxChars 候选摘要上限。
 * @param candidateIds 候选标识过滤列表。
 * @returns 精简后的上下文。
 */
function buildSlimMutationContext(
    context: import('../memory-summary-planner').SummaryMutationContext,
    plannerDecision: SummaryPlannerOutput,
    rollingDigestMaxChars: number,
    candidateSummaryMaxChars: number,
    candidateIds?: string[],
): {
    payload: Record<string, unknown>;
    candidateRefToCandidateId: Map<string, string>;
} {
    const focusTypes = plannerDecision.focus_types;
    const filteredTypeSchemas = focusTypes.length > 0
        ? context.typeSchemas.filter((schema) => focusTypes.includes(schema.schemaId))
        : context.typeSchemas;
    const activeTypeSchemas = filteredTypeSchemas.length > 0 ? filteredTypeSchemas : context.typeSchemas;
    const candidateIdSet = new Set((candidateIds ?? []).filter(Boolean));
    const activeCandidates = candidateIdSet.size > 0
        ? context.candidateRecords.filter((candidate) => candidateIdSet.has(candidate.candidateId))
        : context.candidateRecords;
    const promptDtoService = new SummaryPromptDTOService();
    const candidatePromptResult = promptDtoService.build({
        candidates: activeCandidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            entryId: candidate.recordId,
            targetKind: candidate.targetKind,
            title: candidate.title,
            summary: truncateTextForContext(candidate.summary ?? '', candidateSummaryMaxChars),
            compareKey: candidate.compareKey,
        })),
    });
    const slimCandidates = candidatePromptResult.candidates.map((candidate) => ({
        candidateId: candidate.candidateRef,
        entryRef: candidate.entryRef,
        targetKind: candidate.targetKind,
        compareKey: candidate.compareKey,
        title: candidate.title,
        summary: candidate.summary,
        status: activeCandidates.find((item) => item.candidateId === candidatePromptResult.candidateRefToCandidateId.get(candidate.candidateRef))?.status ?? 'active',
    }));
    const rollingDigest = context.recentSummaryDigest.length > 0
        ? context.recentSummaryDigest
            .map((digest) => `[${digest.title}] ${truncateTextForContext(digest.content, rollingDigestMaxChars)}`)
            .join(' | ')
        : '';
    return {
        payload: {
            task: context.task,
            schemaVersion: context.schemaVersion,
            window: {
                fromTurn: context.window.fromTurn,
                toTurn: context.window.toTurn,
                windowFacts: extractWindowFacts(context.window.summaryText),
                ...(context.window.recentContextText ? { recentContext: extractWindowFacts(context.window.recentContextText).slice(0, 8) } : {}),
            },
            detectedSignals: context.detectedSignals,
            plannerDecision,
            rollingDigest,
            typeSchemas: activeTypeSchemas,
            candidateRecords: slimCandidates,
            promptReferenceRules: {
                candidateRefPrefix: 'S',
                entryRefPrefix: 'E',
                requirement: '引用已有候选时只使用 candidateId 中提供的短别名，不要输出真实 candidateId 或 entryId。',
            },
            rules: context.rules,
            patchMode: {
                enabled: true,
                description: '本次输出为稀疏 patch 模式，仅输出变化字段。',
                constraints: [
                    '只输出发生变化的字段，未变化字段不要出现在 payload 中。',
                    '严禁返回完整旧 state 副本。',
                    '数组字段如需变更请输出完整新数组。',
                    '嵌套 fields 对象中只输出变化的子字段。',
                    '若无实质变更，使用 action=NOOP。',
                    '若引用已有候选，candidateId 只能填写当前上下文中的短别名。',
                ],
            },
        },
        candidateRefToCandidateId: candidatePromptResult.candidateRefToCandidateId,
    };
}

function decodeSummaryPromptDocument(
    document: SummaryMutationDocument,
    context: {
        candidateRefToCandidateId: Map<string, string>;
    },
): SummaryMutationDocument {
    return {
        ...document,
        actions: Array.isArray(document.actions)
            ? document.actions.map((action: SummaryMutationDocument['actions'][number]): SummaryMutationDocument['actions'][number] => ({
                ...action,
                candidateId: decodeSummaryCandidateRef(action.candidateId, context.candidateRefToCandidateId),
            }))
            : [],
    };
}

function decodeSummaryCandidateRef(
    value: string | undefined,
    candidateRefToCandidateId: Map<string, string>,
): string | undefined {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return undefined;
    }
    return candidateRefToCandidateId.get(normalized) ?? normalized;
}

/**
 * 功能：提取窗口事实句。
 * @param summaryText 窗口总结文本。
 * @returns 事实句列表。
 */
function extractWindowFacts(summaryText: string): string[] {
    const text = String(summaryText ?? '').trim();
    if (!text) {
        return [];
    }
    return text
        .split(/[。！？\n]+/)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 4)
        .slice(0, 30);
}

/**
 * 功能：裁剪上下文文本。
 * @param text 原始文本。
 * @param maxLength 最大长度。
 * @returns 裁剪后的文本。
 */
function truncateTextForContext(text: string, maxLength: number): string {
    const normalized = String(text ?? '').trim();
    if (!Number.isFinite(maxLength) || maxLength <= 0 || normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength).trim()}…`;
}

/**
 * 功能：规范化 planner 输出。
 * @param value 原始输出。
 * @returns 规范化后的 planner 输出。
 */
function normalizePlannerOutput(value: unknown): SummaryPlannerOutput {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    return {
        should_update: source.should_update === true,
        focus_types: normalizeStringArray(source.focus_types),
        entities: normalizeStringArray(source.entities),
        topics: normalizeStringArray(source.topics),
        reasons: normalizeStringArray(source.reasons),
    };
}

/**
 * 功能：规范化字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: string[] = [];
    for (const item of value) {
        const normalized = String(item ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：为总结送模推断当前用户名，优先读取消息上的 user.name。
 * @param messages 当前窗口消息。
 * @param fallbackUserName 兜底用户名。
 * @returns 用于送模脱敏的用户名。
 */
function resolveSummaryPromptUserName(
    messages: SummaryWindowMessage[],
    fallbackUserName: string,
): string {
    const matchedUserName = [...messages]
        .reverse()
        .find((item: SummaryWindowMessage): boolean => String(item.role ?? '').trim() === 'user');
    const promptUserName = String((matchedUserName as { name?: string } | undefined)?.name ?? '').trim();
    return promptUserName || fallbackUserName;
}

/**
 * 功能：构建 entryId 到 memoryPercent 的映射。
 * @param memories 角色记忆列表。
 * @returns 映射表。
 */
function buildEntryMemoryPercentMap(memories: RoleEntryMemory[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const memory of memories) {
        const current = map.get(memory.entryId) ?? 0;
        if (memory.memoryPercent > current) {
            map.set(memory.entryId, memory.memoryPercent);
        }
    }
    return map;
}

/**
 * 功能：构建可编辑字段映射。
 * @param typeSchemas 类型 schema 列表。
 * @returns 可编辑字段映射。
 */
function buildEditableFieldMap(typeSchemas: Array<{ schemaId: string; editableFields: string[] }>): EditableFieldMap {
    const map: EditableFieldMap = new Map();
    for (const schema of typeSchemas) {
        map.set(schema.schemaId, new Set(schema.editableFields));
    }
    map.set('relationship', new Set([
        'relationshipId',
        'sourceActorKey',
        'targetActorKey',
        'relationTag',
        'state',
        'summary',
        'trust',
        'affection',
        'tension',
        'participants',
        'fields.sourceActorKey',
        'fields.targetActorKey',
        'fields.relationTag',
        'fields.state',
    ]));
    return map;
}

/**
 * 功能：为总结提示词构建批次时间摘要块。
 * @param assessment 批次时间评估。
 * @returns 多行摘要文本。
 */
function buildSummaryTimeDigest(assessment: BatchTimeAssessment): string {
    const lines: string[] = ['本批时间评估：'];
    lines.push(`- 时间模式：${resolveSummaryTimeModeLabel(assessment)}`);
    lines.push(`- 可能经历时间：${resolveSummaryElapsedLabel(assessment)}`);
    lines.push(`- 明确时间词：${assessment.explicitMentions.length > 0 ? assessment.explicitMentions.join('、') : '未检测到'}`);
    lines.push(`- 场景推进：${assessment.sceneTransitions.length > 0 ? assessment.sceneTransitions.join(' -> ') : '未检测到明显场景推进'}`);
    lines.push(`- 判断说明：${explainBatchAssessment(assessment).replace(/\n+/g, '；')}`);
    lines.push('请在抽取事件、关系、状态变化时显式参考以上时间推进，不要把不同时间层的事实混成同一时点。');
    return lines.join('\n');
}

/**
 * 功能：解析总结阶段的时间模式标签。
 * @param assessment 批次时间评估。
 * @returns 中文标签。
 */
function resolveSummaryTimeModeLabel(assessment: BatchTimeAssessment): string {
    if (assessment.explicitMentions.length > 0) {
        return '明确故事时间';
    }
    if (assessment.inferredElapsed?.text) {
        return '推断时间推进';
    }
    return '系统时序为主';
}

/**
 * 功能：解析总结阶段的持续时间标签。
 * @param assessment 批次时间评估。
 * @returns 中文标签。
 */
function resolveSummaryElapsedLabel(assessment: BatchTimeAssessment): string {
    return String(assessment.inferredElapsed?.text ?? '').trim() || '未识别到明确时长，按系统时序理解';
}

/**
 * 功能：从 section 中解析 JSON。
 * @param section 原始 section 文本。
 * @returns JSON 对象。
 */
function parseJsonSection(section: string): unknown {
    const source = String(section ?? '').trim();
    if (!source) {
        return null;
    }
    const fenced = source.match(/```json[\s\S]*?```/i);
    const jsonText = fenced
        ? fenced[0].replace(/```json/i, '').replace(/```/g, '').trim()
        : source;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * 功能：构建严格 mutation schema（稀疏 patch 模式）。
 *
 * 新架构要求：
 * - 顶层字段均可选（支持稀疏 patch）
 * - 未变化字段不出现在输出中
 * - 数组字段支持替换策略
 * - 明确禁止模型返回完整旧状态拷贝
 *
 * @param baseSchema 基础 schema。
 * @param typeSchemas 类型 schema 列表。
 * @returns 严格 schema。
 */
function buildStrictSummaryMutationSchema(
    baseSchema: unknown,
    typeSchemas: Array<{ schemaId: string; editableFields: string[] }>,
): unknown {
    if (!baseSchema || typeof baseSchema !== 'object' || Array.isArray(baseSchema)) {
        return baseSchema;
    }
    const cloned = deepCloneRecord(baseSchema as Record<string, unknown>);
    const actionsRecord = readNestedRecord(cloned, ['properties', 'actions']);
    if (actionsRecord) {
        actionsRecord.items = buildStrictActionItemsSchema(typeSchemas);
    }
    cloned.required = ['schemaVersion', 'window', 'actions'];
    cloned.additionalProperties = false;
    return cloned;
}

/**
 * 功能：构建 action items schema。
 * @param typeSchemas 类型 schema 列表。
 * @returns items schema。
 */
function buildStrictActionItemsSchema(
    typeSchemas: Array<{ schemaId: string; editableFields: string[] }>,
): Record<string, unknown> {
    const targetKinds = Array.from(new Set([
        ...typeSchemas.map((item) => String(item.schemaId ?? '').trim()).filter(Boolean),
        'relationship',
    ]));
    const mergedEditableFields = Array.from(new Set([
        ...typeSchemas.flatMap((item) => item.editableFields ?? []),
        'relationshipId',
        'sourceActorKey',
        'targetActorKey',
        'relationTag',
        'state',
        'summary',
        'trust',
        'affection',
        'tension',
        'participants',
        'fields.sourceActorKey',
        'fields.targetActorKey',
        'fields.relationTag',
        'fields.state',
    ]));
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            action: {
                type: 'string',
                enum: ['ADD', 'MERGE', 'UPDATE', 'INVALIDATE', 'DELETE', 'NOOP'],
            },
            targetKind: {
                type: 'string',
                enum: targetKinds.length > 0 ? targetKinds : ['other'],
            },
            candidateId: { type: 'string' },
            compareKey: { type: 'string' },
            payload: buildStrictMutationPayloadSchema(mergedEditableFields, false),
            reasonCodes: {
                type: 'array',
                items: { type: 'string' },
            },
        },
        required: ['action', 'targetKind'],
    };
}

/**
 * 功能：构建 payload schema（稀疏 patch 模式，所有字段均可选）。
 *
 * 新架构要求 payload 为真正的 sparse patch：
 * - 所有字段默认可选
 * - 未变化字段不需要出现
 * - 嵌套对象支持递归 patch
 *
 * @param editableFields 可编辑字段列表。
 * @param requireAll 是否要求所有字段必填（默认 false，仅兼容模式为 true）。
 * @returns payload schema。
 */
function buildStrictMutationPayloadSchema(editableFields: string[], requireAll: boolean): Record<string, unknown> {
    const rootFieldKeys = new Set<string>();
    const nestedFieldKeys = new Set<string>();
    for (const fieldPath of editableFields) {
        const normalized = String(fieldPath ?? '').trim();
        if (!normalized) {
            continue;
        }
        if (normalized.startsWith('fields.')) {
            const nestedKey = normalized.slice('fields.'.length).trim();
            if (nestedKey) {
                nestedFieldKeys.add(nestedKey);
            }
            continue;
        }
        rootFieldKeys.add(normalized);
    }

    const properties: Record<string, unknown> = {};
    Array.from(rootFieldKeys).sort().forEach((key: string): void => {
        properties[key] = buildLooseFieldSchema(key, false);
    });

    if (nestedFieldKeys.size > 0) {
        const fieldProperties: Record<string, unknown> = {};
        Array.from(nestedFieldKeys).sort().forEach((key: string): void => {
            fieldProperties[key] = buildLooseFieldSchema(key, true);
        });
        properties.fields = {
            type: 'object',
            additionalProperties: false,
            properties: fieldProperties,
            required: requireAll ? Object.keys(fieldProperties) : [],
        };
    }

    return {
        type: 'object',
        additionalProperties: false,
        properties,
        required: requireAll ? Object.keys(properties) : [],
    };
}

/**
 * 功能：按字段生成宽松但封闭的字段 schema。
 * @param key 字段名。
 * @param isNested 是否为嵌套字段。
 * @returns 字段 schema。
 */
function buildLooseFieldSchema(key: string, isNested: boolean): Record<string, unknown> {
    const normalizedKey = String(key ?? '').trim();
    if (normalizedKey === 'relationTag') {
        return {
            type: 'string',
            enum: ['亲人', '朋友', '盟友', '恋人', '暧昧', '师徒', '上下级', '竞争者', '情敌', '宿敌', '陌生人'],
        };
    }
    if (normalizedKey === 'status') {
        return {
            type: 'string',
            enum: ['active', 'resolved', 'outdated', 'speculative', 'invalidated'],
        };
    }
    if (normalizedKey === 'stage') {
        return {
            type: 'string',
            enum: ['ongoing', 'completed', 'planned', 'abandoned', 'unknown'],
        };
    }
    if (BOOLEAN_FIELD_KEYS.has(normalizedKey)) {
        return { type: 'string', enum: ['true', 'false'] };
    }
    if (NUMBER_FIELD_KEYS.has(normalizedKey)) {
        return { type: 'number' };
    }
    if (ARRAY_FIELD_KEYS.has(normalizedKey)) {
        return {
            type: 'array',
            items: { type: 'string' },
        };
    }
    if (!isNested && normalizedKey === 'fields') {
        return {
            type: 'object',
            additionalProperties: false,
            properties: {},
        };
    }
    return { type: 'string' };
}

/**
 * 功能：深拷贝普通对象。
 * @param value 原始对象。
 * @returns 深拷贝结果。
 */
function deepCloneRecord<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 功能：读取嵌套对象。
 * @param source 源对象。
 * @param path 路径。
 * @returns 命中的对象。
 */
function readNestedRecord(source: Record<string, unknown>, path: string[]): Record<string, unknown> | null {
    let cursor: unknown = source;
    for (const step of path) {
        if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
            return null;
        }
        cursor = (cursor as Record<string, unknown>)[step];
    }
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
        return null;
    }
    return cursor as Record<string, unknown>;
}

/**
 * 功能：限制单批动作数量。
 * @param document mutation 文档。
 * @param maxActions 最大动作数。
 * @returns 裁剪后的文档。
 */
function trimMutationDocumentActions(document: SummaryMutationDocument, maxActions: number): SummaryMutationDocument {
    if (!Number.isFinite(maxActions) || maxActions <= 0 || document.actions.length <= maxActions) {
        return document;
    }
    return {
        ...document,
        actions: document.actions.slice(0, maxActions),
    };
}

function enhanceSummaryActionTimeContext(baseTimeContext: MemoryTimeContext, action: SummaryMutationDocument['actions'][number]): MemoryTimeContext {
    const payload = toRecord(action.newRecord ?? action.patch ?? action.payload);
    const fields = toRecord(payload.fields);
    const fragments = [
        action.title,
        action.reason,
        payload.title,
        payload.summary,
        payload.detail,
        payload.summaryAppend,
        fields.summary,
        fields.detail,
        fields.currentState,
        fields.outcome,
    ]
        .map((item: unknown): string => String(item ?? '').trim())
        .filter(Boolean);
    if (fragments.length <= 0) {
        return baseTimeContext;
    }
    return enhanceMemoryTimeContextWithText({
        timeContext: baseTimeContext,
        text: fragments.join(' '),
        sourceFloor: baseTimeContext.sequenceTime.firstFloor,
    });
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

const NUMBER_FIELD_KEYS: Set<string> = new Set([
    'importance',
    'trust',
    'affection',
    'tension',
    'unresolvedConflict',
    'certainty',
]);

const ARRAY_FIELD_KEYS: Set<string> = new Set([
    'tags',
    'participants',
    'milestones',
    'aliases',
    'identityFacts',
    'originFacts',
    'traits',
]);

const BOOLEAN_FIELD_KEYS: Set<string> = new Set([
    'isActive',
    'isResolved',
    'isPublic',
    'isSecret',
    'confirmed',
]);
