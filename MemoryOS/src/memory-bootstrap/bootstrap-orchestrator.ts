import type { ApplyLedgerMutationBatchResult, EnsureActorProfileInput, LedgerMutation, LedgerMutationBatchContext, MemoryEntry } from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import type { ColdStartCandidate, ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { parseColdStartDocument } from './bootstrap-parser';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';
import { segmentColdStartSourceBundle } from './bootstrap-source-segmenter';
import { runBootstrapPhase } from './bootstrap-phase-runner';
import { reduceBootstrapDocuments } from './bootstrap-reducer';
import { resolveBootstrapConflicts } from './bootstrap-conflict-resolver';
import { finalizeBootstrapDocument } from './bootstrap-finalizer';
import {
    normalizeNarrativeValue,
    normalizeUserNarrativeText,
    resolveCurrentNarrativeUserName,
} from '../utils/narrative-user-name';
import { readMemoryOSSettings } from '../settings/store';
import { upsertPipelineJobRecord, updatePipelineJobPhase } from '../pipeline/pipeline-job-store';
import {
    appendBootstrapStagingSnapshot,
    loadBootstrapStagingSnapshot,
    clearBootstrapStagingSnapshot,
    saveBootstrapStagingSnapshot,
} from './bootstrap-staging-store';
import { resolveTimelineProfileEvolution } from '../memory-time/timeline-profile';
import { buildSequenceTime } from '../memory-time/sequence-time';
import { logTimeDebug } from '../memory-time/time-debug';
import type { MemoryTimeContext, MemoryTimelineProfile } from '../memory-time/time-types';
import { enhanceMemoryTimeContextWithText } from '../memory-time/fallback-time-engine';
import { extractPreferredStoryTimeText, extractStoryTimeDescriptor } from '../memory-time/story-time-parser';
import { buildWorldStrategyHintText, resolveChatWorldStrategy } from '../services/world-strategy-service';

/**
 * 功能：定义冷启动编排依赖。
 */
export interface BootstrapOrchestratorDependencies {
    ensureActorProfile(input: EnsureActorProfileInput): Promise<unknown>;
    applyLedgerMutationBatch(mutations: LedgerMutation[], context: LedgerMutationBatchContext): Promise<ApplyLedgerMutationBatchResult>;
    putWorldProfileBinding(input: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
        detectedFrom: string[];
    }): Promise<unknown>;
    getTimelineProfile?(): Promise<MemoryTimelineProfile | null>;
    putTimelineProfile?(profile: MemoryTimelineProfile): Promise<unknown>;
    appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<unknown>;
}

/**
 * 功能：定义冷启动编排输入。
 */
export interface RunBootstrapOrchestratorInput {
    dependencies: BootstrapOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    sourceBundle: ColdStartSourceBundle;
    runId?: string;
}

/**
 * 功能：定义冷启动编排结果。
 */
export interface RunBootstrapOrchestratorResult {
    runId: string;
    ok: boolean;
    reasonCode: string;
    errorMessage?: string;
    candidates?: ColdStartCandidate[];
    document?: ColdStartDocument;
    worldProfile?: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
    timelineProfile?: MemoryTimelineProfile;
}

/**
 * 功能：执行冷启动编排（四阶段架构）。
 *
 * 新架构阶段：
 * Phase 1（LLM）：核心实体与角色抽取 — identity, actorCards, entityCards, worldBase
 * Phase 2（LLM）：关系与状态转移抽取 — relationships, memoryRecords
 * Phase 3（代码）：bootstrap candidates 应用 — reduce, conflict resolve, finalize, validate
 * Phase 4（代码）：一致性修正 — 空引用修复、重复合并、不合法状态归一
 *
 * 每阶段输出可观测、可追踪、可局部重试。
 *
 * @param input 编排输入。
 * @returns 编排结果。
 */
export async function runBootstrapOrchestrator(input: RunBootstrapOrchestratorInput): Promise<RunBootstrapOrchestratorResult> {
    const settings = readMemoryOSSettings();
    const userDisplayName = resolveCurrentNarrativeUserName(input.sourceBundle.user.userName);
    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    const bootstrapWorldStrategy = await resolveChatWorldStrategy({
        texts: sourceTexts,
    });
    const bootstrapWorldHintText = buildWorldStrategyHintText(bootstrapWorldStrategy, 'bootstrap');
    const runId = String(input.runId ?? '').trim() || `bootstrap:${Date.now()}`;
    const existingSnapshot = await loadBootstrapStagingSnapshot(runId);
    const isResuming = Boolean(existingSnapshot && existingSnapshot.status !== 'completed');
    await input.dependencies.appendMutationHistory({
        action: isResuming ? 'cold_start_resumed' : 'cold_start_started',
        payload: {
            reason: input.sourceBundle.reason,
            sourceTextCount: sourceTexts.length,
            architecture: 'phase_4',
            runId,
        },
    });
    upsertPipelineJobRecord({
        jobId: runId,
        jobType: 'cold_start',
        status: 'running',
        phase: 'extract',
        sourceMeta: {
            sourceTextCount: sourceTexts.length,
            reason: input.sourceBundle.reason,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    if (!isResuming) {
        await clearBootstrapStagingSnapshot(runId);
        await saveBootstrapStagingSnapshot(runId, {
            runId,
            status: 'running',
            coreDocument: null,
            stateDocument: null,
            reducedDocument: null,
            finalizedDocument: null,
        });
    } else {
        await appendBootstrapStagingSnapshot(runId, {
            status: 'running',
        });
    }
    if (!input.llm) {
        await appendBootstrapStagingSnapshot(runId, {
            status: 'failed',
        });
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'llm_unavailable' },
        });
        return {
            runId,
            ok: false,
            reasonCode: 'llm_unavailable',
            errorMessage: '当前未连接可用的 LLMHub 服务。',
        };
    }

    // ── Phase 1：核心实体与角色抽取 ──────────────────
    const segments = segmentColdStartSourceBundle(input.sourceBundle);
    const limitedPhase1Payload = limitBootstrapPhasePayload(segments.phase1, settings.bootstrapCorePhaseMaxItems);
    const limitedPhase2Payload = limitBootstrapPhasePayload(segments.phase2, settings.bootstrapStatePhaseMaxItems);
    const actorKeyHints = buildBootstrapActorKeyHints();
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_started',
        payload: { phase: 'phase1', description: '核心实体与角色抽取' },
    });
    updatePipelineJobPhase(runId, 'extract');
    const phase1Result = existingSnapshot?.coreDocument
        ? { ok: true, data: existingSnapshot.coreDocument, reasonCode: 'resumed_from_phase1' }
        : await runBootstrapPhase({
            llm: input.llm,
            pluginId: input.pluginId,
            userDisplayName,
            phaseName: 'phase1',
            payload: {
                sourceBundle: limitedPhase1Payload,
                actorKeyHints,
                userPlaceholder: '{{user}}',
            },
            extraSystemInstruction: bootstrapWorldHintText,
        });
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_completed',
        payload: { phase: 'phase1', ok: phase1Result.ok, reasonCode: phase1Result.reasonCode },
    });
    const phase1Document = parseColdStartDocument(phase1Result.data);
    if (!existingSnapshot?.coreDocument) {
        await appendBootstrapStagingSnapshot(runId, {
            coreDocument: phase1Document,
        });
    }

    // ── Phase 2：关系与状态转移抽取 ──────────────────
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_started',
        payload: { phase: 'phase2', description: '关系与状态转移抽取' },
    });
    const phase2Result = existingSnapshot?.stateDocument
        ? { ok: true, data: existingSnapshot.stateDocument, reasonCode: 'resumed_from_phase2' }
        : await runBootstrapPhase({
            llm: input.llm,
            pluginId: input.pluginId,
            userDisplayName,
            phaseName: 'phase2',
            payload: {
                sourceBundle: limitedPhase2Payload,
                actorKeyHints,
                userPlaceholder: '{{user}}',
            },
            extraSystemInstruction: bootstrapWorldHintText,
        });
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_completed',
        payload: { phase: 'phase2', ok: phase2Result.ok, reasonCode: phase2Result.reasonCode },
    });
    const phase2Document = parseColdStartDocument(phase2Result.data);
    if (!existingSnapshot?.stateDocument) {
        await appendBootstrapStagingSnapshot(runId, {
            stateDocument: phase2Document,
        });
    }

    if (!phase1Result.ok || !phase2Result.ok) {
        const reasonCode = phase1Result.reasonCode || phase2Result.reasonCode || 'cold_start_failed';
        const failedPhase = !phase1Result.ok ? 'phase1' : 'phase2';
        await appendBootstrapStagingSnapshot(runId, {
            status: 'failed',
            failedPhase,
        });
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode, failedPhase },
        });
        return {
            runId,
            ok: false,
            reasonCode,
            errorMessage: reasonCode,
        };
    }

    // ── Phase 3：bootstrap candidates 代码应用 ──────────────────
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_started',
        payload: { phase: 'phase3', description: 'bootstrap candidates 去重、合并、校验' },
    });
    updatePipelineJobPhase(runId, 'reduce');
    const normalizedDocument = existingSnapshot?.reducedDocument
        ?? (() => {
            const reduced = reduceBootstrapDocuments([
                phase1Document,
                phase2Document,
            ].filter(Boolean) as ColdStartDocument[]);
            if (!reduced) {
                return null;
            }
            return normalizeColdStartNarrativeDocument(resolveBootstrapConflicts(reduced), userDisplayName);
        })();
    if (!normalizedDocument) {
        await appendBootstrapStagingSnapshot(runId, {
            status: 'failed',
            failedPhase: 'phase3',
        });
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'invalid_cold_start_document', failedPhase: 'phase3' },
        });
        return {
            runId,
            ok: false,
            reasonCode: 'invalid_cold_start_document',
            errorMessage: '冷启动返回内容无法通过结构校验。',
        };
    }
    if (!existingSnapshot?.reducedDocument) {
        await appendBootstrapStagingSnapshot(runId, {
            reducedDocument: normalizedDocument,
        });
    }
    const finalized = finalizeBootstrapDocument(normalizedDocument, input.sourceBundle);
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_completed',
        payload: {
            phase: 'phase3',
            ok: finalized.candidates.length > 0,
            candidateCount: finalized.candidates.length,
            actorCardCount: normalizedDocument.actorCards.length,
            relationshipCount: normalizedDocument.relationships.length,
        },
    });

    if (finalized.candidates.length <= 0) {
        await appendBootstrapStagingSnapshot(runId, {
            status: 'failed',
            failedPhase: 'phase3',
        });
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'empty_cold_start_candidates', failedPhase: 'phase3' },
        });
        return {
            runId,
            ok: false,
            reasonCode: 'empty_cold_start_candidates',
            errorMessage: '冷启动没有提取出可确认的候选记忆。',
        };
    }

    // ── Phase 4：一致性修正 ──────────────────
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_started',
        payload: { phase: 'phase4', description: '一致性修正与校验' },
    });
    updatePipelineJobPhase(runId, 'apply');
    const actorCardValidation = validateRelationshipActorCards(normalizedDocument, input.sourceBundle);
    const reconcileResult = existingSnapshot?.finalizedDocument
        ? {
            document: existingSnapshot.finalizedDocument,
            fixCount: 0,
        }
        : reconcileBootstrapDocument(normalizedDocument);
    if (!existingSnapshot?.finalizedDocument) {
        await appendBootstrapStagingSnapshot(runId, {
            finalizedDocument: reconcileResult.document,
        });
    }
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_phase_completed',
        payload: {
            phase: 'phase4',
            ok: actorCardValidation.ok,
            missingActorKeys: actorCardValidation.missingActorKeys,
            reconcileFixCount: reconcileResult.fixCount,
        },
    });

    if (!actorCardValidation.ok) {
        await appendBootstrapStagingSnapshot(runId, {
            status: 'failed',
            failedPhase: 'phase4',
        });
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: {
                reasonCode: 'relationship_actor_card_missing',
                missingActorKeys: actorCardValidation.missingActorKeys,
                failedPhase: 'phase4',
            },
        });
        return {
            runId,
            ok: false,
            reasonCode: 'relationship_actor_card_missing',
            errorMessage: '冷启动关系中引用了未创建角色卡的对象。',
        };
    }

    await appendBootstrapStagingSnapshot(runId, {
        status: 'completed',
        failedPhase: undefined,
    });

    return {
        runId,
        ok: true,
        reasonCode: 'ok',
        candidates: finalized.candidates,
        document: reconcileResult.document,
        worldProfile: finalized.worldProfile,
    };
}

/**
 * 功能：确认并应用冷启动候选到记忆库。
 * @param input 应用输入。
 * @returns 世界画像结果。
 */
export async function applyBootstrapCandidates(input: {
    dependencies: BootstrapOrchestratorDependencies;
    document: ColdStartDocument;
    sourceBundle: ColdStartSourceBundle;
    selectedCandidates: ColdStartCandidate[];
}): Promise<{
    worldProfile: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
    timelineProfile: MemoryTimelineProfile;
}> {
    const userDisplayName = resolveCurrentNarrativeUserName(input.sourceBundle.user.userName);
    const normalizedDocument = normalizeColdStartNarrativeDocument(input.document, userDisplayName);
    const actorDisplayNameMap = buildBootstrapActorDisplayNameMap(normalizedDocument, input.sourceBundle, userDisplayName);
    const normalizedSelectedCandidates = input.selectedCandidates.map((candidate: ColdStartCandidate): ColdStartCandidate => normalizeColdStartCandidate(candidate, userDisplayName));
    const selectedIds = new Set(normalizedSelectedCandidates.map((candidate: ColdStartCandidate): string => candidate.id));
    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    const existingTimelineProfile = input.dependencies.getTimelineProfile
        ? await input.dependencies.getTimelineProfile()
        : null;
    const timelineProfile = resolveColdStartTimelineProfile(sourceTexts, existingTimelineProfile);

    for (const candidate of normalizedSelectedCandidates) {
        for (const actorKey of candidate.actorBindings ?? []) {
            await input.dependencies.ensureActorProfile({
                actorKey,
                displayName: resolveBootstrapActorDisplayName(actorKey, actorDisplayNameMap),
                displayNameSource: 'bootstrap',
            });
        }
    }
    await input.dependencies.applyLedgerMutationBatch(
        normalizedSelectedCandidates.map((candidate: ColdStartCandidate): LedgerMutation => ({
            targetKind: candidate.entryType,
            action: 'ADD',
            title: candidate.title,
            summary: candidate.summary,
            detailPayload: candidate.detailPayload,
            tags: candidate.tags,
            actorBindings: candidate.actorBindings,
            timeContext: buildColdStartCandidateTimeContext(candidate, timelineProfile),
            reasonCodes: ['cold_start_candidate_confirmed', candidate.type],
            sourceContext: {
                candidateId: candidate.id,
                confidence: candidate.confidence,
                entityKeys: candidate.entityKeys,
            },
        })),
        {
            chatKey: 'bootstrap',
            source: 'cold_start',
            sourceLabel: '冷启动候选确认',
            bootstrapRunId: `bootstrap:${Date.now()}`,
            allowCreate: true,
            allowInvalidate: false,
        },
    );

    const worldProfile = resolveBootstrapWorldProfile(normalizedDocument, input.sourceBundle);
    await input.dependencies.putWorldProfileBinding({
        primaryProfile: worldProfile.primaryProfile,
        secondaryProfiles: worldProfile.secondaryProfiles,
        confidence: worldProfile.confidence,
        reasonCodes: worldProfile.reasonCodes,
        detectedFrom: sourceTexts.slice(0, 24),
    });
    await input.dependencies.appendMutationHistory({
        action: 'world_profile_bound',
        payload: {
            primaryProfile: worldProfile.primaryProfile,
            secondaryProfiles: worldProfile.secondaryProfiles,
            confidence: worldProfile.confidence,
            reasonCodes: worldProfile.reasonCodes,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_succeeded',
        payload: {
            actorKey: normalizedDocument.identity.actorKey,
            userDisplayName,
            worldProfile,
            selectedCandidateCount: input.selectedCandidates.length,
            selectedCandidateIds: [...selectedIds],
            worldBaseCount: normalizedDocument.worldBase.length,
            relationshipCount: normalizedDocument.relationships.length,
            memoryRecordCount: normalizedDocument.memoryRecords.length,
            entityCardCount: countEntityCards(normalizedDocument.entityCards),
        },
    });

    // ── 时间画像检测 / 兜底写入 ──
    logTimeDebug('cold_start_timeline_profile', {
        mode: timelineProfile.mode,
        calendarKind: timelineProfile.calendarKind,
        anchorTimeText: timelineProfile.anchorTimeText,
        confidence: timelineProfile.confidence,
        signalCount: timelineProfile.signals?.length ?? 0,
    });
    if (input.dependencies.putTimelineProfile) {
        await input.dependencies.putTimelineProfile(timelineProfile);
    }
    await input.dependencies.appendMutationHistory({
        action: 'timeline_profile_detected',
        payload: {
            mode: timelineProfile.mode,
            calendarKind: timelineProfile.calendarKind,
            anchorTimeText: timelineProfile.anchorTimeText,
            confidence: timelineProfile.confidence,
        },
    });

    return { worldProfile, timelineProfile };
}

/**
 * 功能：解析冷启动应写入的时间画像；检测不到时间体系时显式落为 sequence_only。
 * @param sourceTexts 冷启动来源文本。
 * @param existingProfile 已有时间画像。
 * @returns 冷启动时间画像。
 */
function resolveColdStartTimelineProfile(
    sourceTexts: string[],
    existingProfile?: MemoryTimelineProfile | null,
): MemoryTimelineProfile {
    return resolveTimelineProfileEvolution({
        texts: sourceTexts,
        anchorFloor: 0,
        existingProfile,
    }).profile;
}

/**
 * 功能：为冷启动确认候选生成基础时间上下文。
 * @param candidate 候选记忆。
 * @param timelineProfile 当前冷启动时间画像。
 * @param index 候选顺序。
 * @returns 基础时间上下文。
 */
function buildColdStartCandidateTimeContext(
    candidate: ColdStartCandidate,
    timelineProfile: MemoryTimelineProfile,
): MemoryTimeContext {
    const anchorText = resolveColdStartCandidateAnchorText(candidate);
    const sourceText = anchorText || `${candidate.title || ''} ${candidate.summary || ''}`;
    const descriptor = extractStoryTimeDescriptor({
        text: sourceText,
        fallbackStoryDayIndex: timelineProfile.currentStoryDayIndex,
    });
    const preferredText = extractPreferredStoryTimeText(sourceText);
    const hasExplicitAnchor = Boolean(preferredText.absoluteText || (anchorText && timelineProfile.mode === 'explicit_world_time'));
    const hasInferredAnchor = Boolean(preferredText.relativeText || (anchorText && timelineProfile.mode === 'implicit_world_time'));
    const baseContext: MemoryTimeContext = {
        mode: hasExplicitAnchor
            ? 'story_explicit'
            : hasInferredAnchor
                ? 'story_inferred'
                : 'sequence_fallback',
        storyTime: sourceText ? {
            calendarKind: timelineProfile.calendarKind,
            normalized: descriptor.partOfDay ? { partOfDay: descriptor.partOfDay } : undefined,
            ...(preferredText.absoluteText ? { absoluteText: preferredText.absoluteText } : {}),
            ...(preferredText.relativeText ? { relativeText: preferredText.relativeText } : {}),
            storyDayIndex: descriptor.storyDayIndex ?? timelineProfile.currentStoryDayIndex,
            anchorEventId: descriptor.eventAnchors[0]?.eventId,
            anchorEventLabel: descriptor.anchorEventLabel,
            anchorRelation: descriptor.anchorRelation,
            relativePhaseLabel: descriptor.relativePhaseLabel,
        } : undefined,
        sequenceTime: buildSequenceTime(0, 0, `cold_start:${candidate.id}`),
        source: 'cold_start',
        confidence: Math.max(0.3, Math.min(0.95, Number(candidate.confidence) || timelineProfile.confidence || 0.3)),
    };
    return enhanceMemoryTimeContextWithText({
        timeContext: baseContext,
        text: sourceText,
    });
}

/**
 * 功能：为冷启动候选提取可用的基础时间锚文本。
 * @param candidate 冷启动候选。
 * @returns 时间锚文本。
 */
function resolveColdStartCandidateAnchorText(candidate: ColdStartCandidate): string | undefined {
    const sourceExcerpt = candidate.sourceRefs
        .map((item) => String(item.excerpt ?? '').trim())
        .find(Boolean);
    if (candidate.type === 'timeline_fact' || candidate.type === 'initial_state') {
        return sourceExcerpt || String(candidate.summary ?? '').trim() || undefined;
    }
    return sourceExcerpt || undefined;
}

/**
 * 功能：限制冷启动阶段输入中的数组规模，避免单轮抽取过大。
 * @param payload 原始阶段输入。
 * @param maxItems 最大保留项数。
 * @returns 裁剪后的阶段输入。
 */
function limitBootstrapPhasePayload(payload: Record<string, unknown>, maxItems: number): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return {};
    }
    const limit = Math.max(1, Math.trunc(Number(maxItems) || 24));
    const nextPayload = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const sourceBundle = nextPayload.sourceBundle;
    if (!sourceBundle || typeof sourceBundle !== 'object' || Array.isArray(sourceBundle)) {
        return nextPayload;
    }
    const sourceBundleRecord = sourceBundle as Record<string, unknown>;
    const worldbooks = sourceBundleRecord.worldbooks;
    if (worldbooks && typeof worldbooks === 'object' && !Array.isArray(worldbooks)) {
        const worldbooksRecord = worldbooks as Record<string, unknown>;
        if (Array.isArray(worldbooksRecord.entries)) {
            worldbooksRecord.entries = worldbooksRecord.entries.slice(0, limit);
        }
    }
    if (Array.isArray(sourceBundleRecord.recentEvents)) {
        sourceBundleRecord.recentEvents = sourceBundleRecord.recentEvents.slice(0, limit);
    }
    return nextPayload;
}

/**
 * 功能：构建冷启动 actorKey 提示。
 * @returns actorKey 提示。
 */
function buildBootstrapActorKeyHints(): {
    currentUser: {
        actorKey: string;
        displayName: string;
        note: string;
    };
} {
    return {
        currentUser: {
            actorKey: 'user',
            displayName: '{{user}}',
            note: '当关系对象是当前用户时，必须固定使用 actorKey `user`；所有自然语言字段一律使用 `{{user}}`，不要展开为真实名字。',
        },
    };
}

/**
 * 功能：构建角色显示名映射。
 * @param parsed 冷启动文档。
 * @param sourceBundle 冷启动源数据。
 * @param userDisplayName 当前用户显示名。
 * @returns 显示名映射。
 */
function buildBootstrapActorDisplayNameMap(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
    userDisplayName?: string,
): Map<string, string> {
    const displayNameMap = new Map<string, string>();
    displayNameMap.set(normalizeActorKey(parsed.identity.actorKey), String(parsed.identity.displayName ?? '').trim() || parsed.identity.actorKey);
    for (const actorCard of parsed.actorCards) {
        const actorKey = normalizeActorKey(actorCard.actorKey);
        const displayName = String(actorCard.displayName ?? '').trim();
        if (actorKey && displayName) {
            displayNameMap.set(actorKey, displayName);
        }
    }
    displayNameMap.set('user', resolveCurrentNarrativeUserName(userDisplayName || sourceBundle.user.userName));
    return displayNameMap;
}

/**
 * 功能：规范化冷启动文档中的自然语言用户称呼。
 * @param document 冷启动文档。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的文档。
 */
function normalizeColdStartNarrativeDocument(document: ColdStartDocument, userDisplayName: string): ColdStartDocument {
    return {
        ...document,
        identity: normalizeNarrativeValue(document.identity, userDisplayName),
        actorCards: document.actorCards.map((item) => normalizeNarrativeValue(item, userDisplayName)),
        entityCards: document.entityCards ? normalizeEntityCardsNarrative(document.entityCards, userDisplayName) : undefined,
        worldBase: document.worldBase.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
        relationships: document.relationships.map((entry) => ({
            ...entry,
            state: normalizeUserNarrativeText(entry.state, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
        memoryRecords: document.memoryRecords.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
    };
}

/**
 * 功能：规范化冷启动候选中的自然语言用户称呼。
 * @param candidate 冷启动候选。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的候选。
 */
function normalizeColdStartCandidate(candidate: ColdStartCandidate, userDisplayName: string): ColdStartCandidate {
    return {
        ...candidate,
        title: normalizeUserNarrativeText(candidate.title, userDisplayName),
        summary: normalizeUserNarrativeText(candidate.summary, userDisplayName),
        reason: normalizeUserNarrativeText(candidate.reason, userDisplayName),
        detailPayload: candidate.detailPayload ? normalizeNarrativeValue(candidate.detailPayload, userDisplayName) : undefined,
        sourceRefs: candidate.sourceRefs.map((item) => ({
            ...item,
            excerpt: item.excerpt ? normalizeUserNarrativeText(item.excerpt, userDisplayName) : item.excerpt,
        })),
    };
}

/**
 * 功能：校验关系引用的非用户角色是否都有角色卡。
 * @param parsed 冷启动文档。
 * @param sourceBundle 冷启动源数据。
 * @returns 校验结果。
 */
function validateRelationshipActorCards(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
): { ok: boolean; missingActorKeys: string[] } {
    const mainActorKey = normalizeActorKey(parsed.identity.actorKey);
    const actorCardKeys = new Set(
        parsed.actorCards
            .map((item): string => normalizeActorKey(item.actorKey))
            .filter(Boolean),
    );
    const requiredActorKeys = new Set<string>();

    for (const relation of parsed.relationships) {
        const normalizedRelation = normalizeBootstrapRelationship(relation, parsed.identity.actorKey, sourceBundle);
        for (const actorKey of collectRelationshipActorKeys(normalizedRelation)) {
            const normalizedActorKey = normalizeActorKey(actorKey);
            if (!normalizedActorKey || normalizedActorKey === 'user' || normalizedActorKey === mainActorKey) {
                continue;
            }
            requiredActorKeys.add(normalizedActorKey);
        }
    }

    const missingActorKeys = [...requiredActorKeys].filter((actorKey: string): boolean => !actorCardKeys.has(actorKey));
    return {
        ok: missingActorKeys.length === 0,
        missingActorKeys,
    };
}

/**
 * 功能：归一化冷启动关系中的角色键。
 * @param relation 原始关系。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据。
 * @returns 归一化后的关系。
 */
function normalizeBootstrapRelationship(
    relation: ColdStartDocument['relationships'][number],
    mainActorKey: string,
    sourceBundle: ColdStartSourceBundle,
): ColdStartDocument['relationships'][number] {
    const sourceActorKey = normalizeBootstrapActorKey(relation.sourceActorKey, mainActorKey, sourceBundle);
    const targetActorKey = normalizeBootstrapActorKey(relation.targetActorKey, mainActorKey, sourceBundle);
    return {
        ...relation,
        sourceActorKey,
        targetActorKey,
        participants: dedupeStrings([
            sourceActorKey,
            targetActorKey,
            ...relation.participants.map((actorKey: string): string => normalizeBootstrapActorKey(actorKey, mainActorKey, sourceBundle)),
        ]),
    };
}

/**
 * 功能：收集关系中的角色键。
 * @param relation 归一化后的关系。
 * @returns 角色键列表。
 */
function collectRelationshipActorKeys(relation: ColdStartDocument['relationships'][number]): string[] {
    return dedupeStrings([
        relation.sourceActorKey,
        relation.targetActorKey,
        ...relation.participants,
    ]);
}

/**
 * 功能：解析角色显示名。
 * @param actorKey 角色键。
 * @param displayNameMap 显示名映射。
 * @returns 显示名。
 */
function resolveBootstrapActorDisplayName(actorKey: string, displayNameMap: Map<string, string>): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    return displayNameMap.get(normalizedActorKey) || actorKey;
}

/**
 * 功能：归一化冷启动中的角色键。
 * @param actorKey 原始角色键。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据。
 * @returns 归一化后的角色键。
 */
function normalizeBootstrapActorKey(actorKey: string, mainActorKey: string, sourceBundle: ColdStartSourceBundle): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    const normalizedMainActorKey = normalizeActorKey(mainActorKey);
    if (!normalizedActorKey) {
        return '';
    }
    if (normalizedActorKey === normalizedMainActorKey) {
        return normalizedMainActorKey;
    }
    const normalizedUserName = normalizeActorKey(sourceBundle.user.userName);
    if (
        normalizedActorKey === 'user'
        || normalizedActorKey === normalizedUserName
        || normalizedActorKey === 'player'
        || normalizedActorKey === 'mc'
        || normalizedActorKey.startsWith('user_')
        || normalizedActorKey.startsWith('player_')
    ) {
        return 'user';
    }
    return normalizedActorKey;
}

/**
 * 功能：规范化角色键文本。
 * @param value 原始值。
 * @returns 角色键。
 */
function normalizeActorKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * 功能：收集冷启动来源文本。
 * @param sourceBundle 冷启动源数据。
 * @returns 来源文本列表。
 */
function collectBundleSourceTexts(sourceBundle: ColdStartSourceBundle): string[] {
    return dedupeStrings([
        sourceBundle.reason,
        sourceBundle.characterCard.name,
        sourceBundle.characterCard.description,
        sourceBundle.characterCard.personality,
        sourceBundle.characterCard.scenario,
        sourceBundle.characterCard.firstMessage,
        sourceBundle.characterCard.messageExample,
        sourceBundle.characterCard.creatorNotes,
        ...sourceBundle.characterCard.tags,
        sourceBundle.semantic.systemPrompt,
        sourceBundle.semantic.firstMessage,
        sourceBundle.semantic.authorNote,
        sourceBundle.semantic.jailbreak,
        sourceBundle.semantic.instruct,
        ...sourceBundle.semantic.activeLorebooks,
        sourceBundle.user.userName,
        sourceBundle.user.counterpartName,
        sourceBundle.user.personaDescription,
        sourceBundle.user.metadataPersona,
        sourceBundle.worldbooks.mainBook,
        ...sourceBundle.worldbooks.extraBooks,
        ...sourceBundle.worldbooks.activeBooks,
        ...sourceBundle.worldbooks.entries.map((entry): string => `${entry.entry} ${entry.content}`),
        ...sourceBundle.recentEvents,
    ]);
}

/**
 * 功能：规范化实体卡片中的自然语言用户称呼。
 * @param entityCards 实体卡片集合。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的实体卡片集合。
 */
function normalizeEntityCardsNarrative(
    entityCards: ColdStartDocument['entityCards'],
    userDisplayName: string,
): ColdStartDocument['entityCards'] {
    if (!entityCards) return undefined;
    const normalizeList = (list: NonNullable<ColdStartDocument['entityCards']>[keyof NonNullable<ColdStartDocument['entityCards']>] = []) => {
        return list.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        }));
    };
    return {
        organizations: normalizeList(entityCards.organizations),
        cities: normalizeList(entityCards.cities),
        nations: normalizeList(entityCards.nations),
        locations: normalizeList(entityCards.locations),
    };
}

/**
 * 功能：统计实体卡片总数。
 * @param entityCards 实体卡片集合。
 * @returns 总数。
 */
function countEntityCards(entityCards?: ColdStartDocument['entityCards']): number {
    if (!entityCards) return 0;
    return (entityCards.organizations?.length ?? 0)
        + (entityCards.cities?.length ?? 0)
        + (entityCards.nations?.length ?? 0)
        + (entityCards.locations?.length ?? 0);
}

/**
 * 功能：Phase 4 一致性修正 — 对冷启动文档做轻量一致性修复。
 *
 * 修复项：
 * - 空引用修复：移除引用不存在角色的关系
 * - 重复实体名合并：按 compareKey 去重
 * - 不合法状态值归一：清理空字符串字段
 * - 缺失依赖补齐：确保每条关系的 participants 完整
 *
 * @param document 冷启动文档。
 * @returns 修复后的文档与修复计数。
 */
function reconcileBootstrapDocument(document: ColdStartDocument): {
    document: ColdStartDocument;
    fixCount: number;
} {
    let fixCount = 0;
    const mainActorKey = normalizeActorKey(document.identity.actorKey);
    const knownActorKeys = new Set<string>();
    knownActorKeys.add(mainActorKey);
    knownActorKeys.add('user');
    for (const actorCard of document.actorCards) {
        const actorKey = normalizeActorKey(actorCard.actorKey);
        if (actorKey) {
            knownActorKeys.add(actorKey);
        }
    }

    // 修复 1：移除引用不存在角色的关系
    const validRelationships = document.relationships.filter((relation) => {
        const sourceKey = normalizeActorKey(relation.sourceActorKey);
        const targetKey = normalizeActorKey(relation.targetActorKey);
        if (!sourceKey || !targetKey) {
            fixCount++;
            return false;
        }
        if (!knownActorKeys.has(sourceKey) && !knownActorKeys.has(targetKey)) {
            fixCount++;
            return false;
        }
        return true;
    });

    // 修复 2：确保 participants 完整
    const reconciledRelationships = validRelationships.map((relation) => {
        const participants = dedupeStrings([
            relation.sourceActorKey,
            relation.targetActorKey,
            ...relation.participants,
        ]);
        if (participants.length !== relation.participants.length) {
            fixCount++;
        }
        return { ...relation, participants };
    });

    // 修复 3：清理空字符串字段
    const reconciledActorCards = document.actorCards.map((card) => {
        const displayName = String(card.displayName ?? '').trim();
        if (!displayName && card.actorKey) {
            fixCount++;
            return { ...card, displayName: card.actorKey };
        }
        return card;
    });

    // 修复 4：去重 memoryRecords
    const seenMemKeys = new Set<string>();
    const reconciledMemoryRecords = document.memoryRecords.filter((record) => {
        const key = `${record.schemaId}:${record.title}`;
        if (seenMemKeys.has(key)) {
            fixCount++;
            return false;
        }
        seenMemKeys.add(key);
        return true;
    });

    return {
        document: {
            ...document,
            actorCards: reconciledActorCards,
            relationships: reconciledRelationships,
            memoryRecords: reconciledMemoryRecords,
        },
        fixCount,
    };
}

/**
 * 功能：去重字符串数组。
 * @param values 原始数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
