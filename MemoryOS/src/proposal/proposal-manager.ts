import type { MemoryMutationDocument, MutationResult, MutationRequest, SchemaChangeProposal, DeferredSchemaHint, SummaryProposal } from './types';
import type { WorldTemplate } from '../template/types';
import { GateValidator } from './gate-validator';
import { SchemaGate } from '../core/schema-gate';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { AuditManager } from '../core/audit-manager';
import { MetaManager } from '../core/meta-manager';
import { TemplateManager } from '../template/template-manager';
import type { ChatStateManager } from '../core/chat-state-manager';
import { executeMemoryMutationPlan } from '../core/memory-mutation-executor';
import { planMemoryMutations, type MemoryMutationPlan, type PlannedSummaryMutation } from '../core/memory-mutation-planner';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { db, patchSdkChatShared } from '../db/db';
import { DEFAULT_CHANGE_BUDGET } from '../types';
import { advanceMemoryTraceContext, createMemoryTraceContext } from '../core/memory-trace';
import { logger } from '../runtime/runtime-services';

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：为缺少范围信息的摘要写入补齐当前可见窗口范围，避免不同轮次摘要误判为同一条。
 * @param summary 原始摘要写入。
 * @param visibleMessageIds 当前可见消息键列表。
 * @returns 补齐范围后的摘要写入。
 */
function ensureSummaryProposalRange(summary: SummaryProposal, visibleMessageIds: string[]): SummaryProposal {
    const normalizedVisibleMessageIds = Array.isArray(visibleMessageIds)
        ? visibleMessageIds.map((item: unknown): string => normalizeText(item)).filter(Boolean)
        : [];
    const fromMessageId = normalizeText(summary.range?.fromMessageId) || normalizedVisibleMessageIds[0] || undefined;
    const toMessageId = normalizeText(summary.range?.toMessageId) || normalizedVisibleMessageIds[normalizedVisibleMessageIds.length - 1] || undefined;
    if (!fromMessageId && !toMessageId) {
        return summary;
    }
    return {
        ...summary,
        range: {
            fromMessageId,
            toMessageId,
        },
    };
}

const SUMMARY_ACTION_LABEL_MAP: Record<string, string> = {
    ADD: '新增',
    UPDATE: '更新',
    MERGE: '合并',
    DELETE: '删除',
    INVALIDATE: '失效归档',
    NOOP: '跳过',
};

const SUMMARY_REASON_LABEL_MAP: Record<string, string> = {
    summary_add_new_record: '未命中旧摘要，直接新增',
    summary_explicit_target_missing: '指定目标不存在，改为新增',
    summary_update_existing_record: '命中旧摘要，直接更新',
    summary_merge_existing_record: '命中旧摘要，合并内容',
    summary_merge_no_change: '合并后无变化，跳过写入',
    summary_exact_duplicate: '与已有摘要完全重复，跳过写入',
    summary_delete_explicit_target: '按指定目标删除摘要',
    summary_delete_missing_target: '指定删除目标不存在，跳过写入',
    summary_invalidate_explicit_target: '按指定目标归档摘要',
    summary_invalidate_missing_target: '指定归档目标不存在，跳过写入',
    planner_keep_record_key: '沿用旧摘要键',
    planner_skip_direct_write: '规划阶段已判定无需直写',
};

/**
 * 功能：把摘要范围整理成便于日志排查的短文本。
 * @param summary 摘要写入。
 * @returns 范围文本。
 */
function formatSummaryRangeForLog(summary: SummaryProposal): string {
    const fromMessageId = normalizeText(summary.range?.fromMessageId);
    const toMessageId = normalizeText(summary.range?.toMessageId);
    if (!fromMessageId && !toMessageId) {
        return '未提供范围';
    }
    return `${fromMessageId || '?'} -> ${toMessageId || '?'}`;
}

/**
 * 功能：把摘要规划原因码转换为更直观的中文说明。
 * @param reasonCodes 原始原因码列表。
 * @returns 中文说明列表。
 */
function formatSummaryReasonLabels(reasonCodes: string[]): string[] {
    return reasonCodes.map((reasonCode: string): string => {
        return SUMMARY_REASON_LABEL_MAP[reasonCode] || reasonCode;
    });
}

/**
 * 功能：输出摘要规划日志，直观说明每条摘要为何新增、合并或跳过。
 * @param chatKey 当前聊天键。
 * @param consumerPluginId 调用方插件标识。
 * @param plan 摘要规划结果。
 * @returns 无返回值。
 */
function logSummaryMutationPlan(
    chatKey: string,
    consumerPluginId: string,
    plan: MemoryMutationPlan,
): void {
    if (!Array.isArray(plan.summaryMutations) || plan.summaryMutations.length <= 0) {
        return;
    }
    logger.info(`[摘要规划] chatKey=${chatKey}, consumer=${consumerPluginId}, count=${plan.summaryMutations.length}`);
    plan.summaryMutations.slice(0, 8).forEach((mutation: PlannedSummaryMutation, index: number): void => {
        const title = normalizeText(mutation.nextTitle ?? mutation.proposal.title) || '未命名摘要';
        const level = normalizeText(mutation.proposal.level) || 'summary';
        const action = SUMMARY_ACTION_LABEL_MAP[mutation.item.action] || mutation.item.action;
        const reasonLabels = formatSummaryReasonLabels(Array.isArray(mutation.item.reasonCodes) ? mutation.item.reasonCodes : []);
        const targetRecordKey = normalizeText(mutation.target?.summaryId ?? mutation.item.targetRecordKey) || '-';
        const existingRecordKeys = Array.isArray(mutation.item.existingRecordKeys) && mutation.item.existingRecordKeys.length > 0
            ? mutation.item.existingRecordKeys.join('|')
            : '-';
        logger.info(
            `[摘要规划#${index + 1}] level=${level}, action=${action}, title=${title}, range=${formatSummaryRangeForLog(mutation.proposal)}, target=${targetRecordKey}, existing=${existingRecordKeys}, reasons=${reasonLabels.join('；') || '无'}`,
        );
    });
    if (plan.summaryMutations.length > 8) {
        logger.info(`[摘要规划] 其余 ${plan.summaryMutations.length - 8} 条摘要规划已省略显示`);
    }
}

/**
 * 功能：为提议生成稳定的摘要记录 ID，避免重复写入时产生新的摘要键。
 * @param input 提议摘要的稳定特征。
 * @returns 可复用的稳定摘要 ID。
 */
export function buildStableSummaryId(input: {
    chatKey: string;
    consumerPluginId: string;
    level: string;
    title?: string;
    content: string;
    keywords?: string[];
    visibleMessageIds?: string[];
    viewHash?: string;
    ordinal?: number;
}): string {
    const visibleMessageIds = Array.isArray(input.visibleMessageIds)
        ? input.visibleMessageIds.map((item: unknown): string => normalizeText(item)).filter(Boolean)
        : [];
    const payload = [
        normalizeText(input.chatKey),
        normalizeText(input.consumerPluginId),
        normalizeText(input.level),
        visibleMessageIds[0] ?? '',
        visibleMessageIds[visibleMessageIds.length - 1] ?? '',
        normalizeText(input.viewHash),
        normalizeText(input.title),
        normalizeText(input.content),
        Array.isArray(input.keywords)
            ? input.keywords.map((item: unknown): string => normalizeText(item)).filter(Boolean).join('|')
            : '',
        String(Math.max(0, Number(input.ordinal ?? 0) || 0)),
    ].join('::');
    return `mutation_summary:${hashText(payload)}`;
}

/**
 * 功能：接收 AI 或外部插件的写入提议，并统一交给 gate、planner 和 executor 处理。
 */
export class MutationManager {
    private chatKey: string;
    private factsManager: FactsManager;
    private stateManager: StateManager;
    private summariesManager: SummariesManager;
    private auditManager: AuditManager;
    private metaManager: MetaManager;
    private templateManager: TemplateManager;
    private gateValidator: GateValidator;
    private schemaGate: SchemaGate | null;
    private chatStateManager: ChatStateManager | null;

    /** 被授权可以写入 facts / state 的插件列表。 */
    private allowedPlugins: string[] = [MEMORY_OS_PLUGIN_ID];

    constructor(chatKey: string, chatStateManager?: ChatStateManager) {
        this.chatKey = chatKey;
        this.factsManager = new FactsManager(chatKey);
        this.stateManager = new StateManager(chatKey);
        this.summariesManager = new SummariesManager(chatKey);
        this.auditManager = new AuditManager(chatKey);
        this.metaManager = new MetaManager(chatKey);
        this.templateManager = new TemplateManager(chatKey);
        this.gateValidator = new GateValidator(this.factsManager, this.stateManager);
        this.chatStateManager = chatStateManager ?? null;
        this.schemaGate = chatStateManager ? new SchemaGate(chatStateManager) : null;
    }

    /**
     * 功能：授予插件写入权限。
     * @param pluginId 插件标识。
     * @returns 无返回值。
     */
    grantPermission(pluginId: string): void {
        if (!this.allowedPlugins.includes(pluginId)) {
            this.allowedPlugins.push(pluginId);
        }
    }

    /**
     * 功能：撤销插件写入权限。
     * @param pluginId 插件标识。
     * @returns 无返回值。
     */
    revokePermission(pluginId: string): void {
        this.allowedPlugins = this.allowedPlugins.filter((id: string): boolean => id !== pluginId);
    }

    /**
     * 功能：处理 AI mutation 文档，并在四道 gate 校验通过后执行长期记忆 CRUD。
     * @param document mutation 文档。
     * @param consumerPluginId 调用方插件标识。
     * @returns mutation 处理结果。
     */
    async applyMutationDocument(
        document: MemoryMutationDocument,
        consumerPluginId: string,
    ): Promise<MutationResult> {
        const activeTemplateId = await this.metaManager.getActiveTemplateId();
        let activeTemplate: WorldTemplate | null = null;
        if (activeTemplateId) {
            activeTemplate = await this.templateManager.getById(activeTemplateId);
        }

        const gateResults = await this.gateValidator.validate(
            document,
            activeTemplate,
            consumerPluginId,
            this.allowedPlugins,
        );

        const failedGates = gateResults.filter((gate) => !gate.passed);
        if (failedGates.length > 0) {
            const reasons = failedGates.flatMap((gate) => gate.errors);
            await this.auditManager.log({
                action: 'mutation.rejected',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { document, reasons },
            });
            return {
                accepted: false,
                applied: { factKeys: [], statePaths: [], summaryIds: [] },
                rejectedReasons: reasons,
                gateResults,
            };
        }

        return this.applyMutationDocumentInternal(document, consumerPluginId, gateResults);
    }

    /**
     * 功能：把外部插件的 requestWrite 适配为统一 mutation 入口。
     * @param request 外部写入请求。
     * @returns mutation 处理结果。
     */
    async applyMutationRequest(request: MutationRequest): Promise<MutationResult> {
        const trace = request.trace ?? createMemoryTraceContext({
            chatKey: request.chatKey,
            source: 'trusted_write',
            stage: 'memory_trusted_write_started',
            requestId: request.reason,
        });
        if (this.chatStateManager) {
            await this.chatStateManager.recordMainlineTrace(
                trace,
                'memory_trusted_write_started',
                true,
                {
                    reason: request.reason,
                    pluginId: request.source.pluginId,
                },
            );
        }
        const document: MemoryMutationDocument = {
            ...request.mutations,
            confidence: 1.0,
        };
        const result = await this.applyMutationDocument(document, request.source.pluginId);
        if (this.chatStateManager) {
            await this.chatStateManager.recordMainlineTrace(
                advanceMemoryTraceContext(trace, 'memory_trusted_write_finished', 'trusted_write'),
                'memory_trusted_write_finished',
                result.accepted && result.rejectedReasons.length === 0,
                {
                    accepted: result.accepted,
                    appliedFactKeys: result.applied.factKeys.length,
                    appliedStatePaths: result.applied.statePaths.length,
                    appliedSummaryIds: result.applied.summaryIds.length,
                    rejectedReasons: result.rejectedReasons,
                },
            );
        }
        return result;
    }

    /**
     * 功能：执行经过 gate 校验后的 mutation 写入，并统一走 mutation planner / executor 主链。
     * @param document mutation 文档。
     * @param consumerPluginId 调用方插件标识。
     * @param gateResults gate 校验结果。
     * @returns mutation 处理结果。
     */
    private async applyMutationDocumentInternal(
        document: MemoryMutationDocument,
        consumerPluginId: string,
        gateResults: Array<{ passed: boolean; gate: string; errors: string[] }>,
    ): Promise<MutationResult> {
        const applied = {
            factKeys: [] as string[],
            statePaths: [] as string[],
            summaryIds: [] as string[],
            schemaChangesApplied: 0,
            schemaChangesDeferred: 0,
            entityResolutions: 0,
        };

        const { facts, patches, summaries, schemaChanges, entityResolutions } = document;
        const deferredHints: DeferredSchemaHint[] = [];
        const logicalView = this.chatStateManager
            ? await this.chatStateManager.getLogicalChatView()
            : null;
        const repairGeneration = this.chatStateManager
            ? await this.chatStateManager.getMutationRepairGeneration()
            : 0;
        const visibleMessageIds = Array.isArray(logicalView?.visibleMessages)
            ? logicalView!.visibleMessages
                .slice(Math.max(0, logicalView!.visibleMessages.length - 40))
                .map((item): string => normalizeText(item.messageId))
                .filter(Boolean)
            : [];
        const derivationSource = {
            kind: 'mutation_apply',
            reason: `consumer:${consumerPluginId}`,
            viewHash: normalizeText(logicalView?.viewHash),
            snapshotHash: normalizeText(logicalView?.snapshotHash),
            messageIds: visibleMessageIds,
            anchorMessageId: normalizeText(logicalView?.repairAnchorMessageId) || undefined,
            mutationKinds: Array.isArray(logicalView?.mutationKinds) ? logicalView.mutationKinds : [],
            repairGeneration,
            ts: Date.now(),
        };

        const factsHighDensity = (facts?.length ?? 0) > DEFAULT_CHANGE_BUDGET.maxFactEntityUpdates;

        let acceptedSchemaChanges: SchemaChangeProposal[] = [];
        if (schemaChanges && schemaChanges.length > 0 && this.schemaGate) {
            const activeTemplateId = await this.metaManager.getActiveTemplateId();
            let activeTemplate: WorldTemplate | null = null;
            if (activeTemplateId) {
                activeTemplate = await this.templateManager.getById(activeTemplateId);
            }

            const schemaGateResult = await this.schemaGate.validate(
                schemaChanges,
                activeTemplate,
                factsHighDensity,
            );

            if (schemaGateResult.errors.length > 0) {
                logger.warn(`Schema 闸门校验错误: ${schemaGateResult.errors.join('; ')}`);
            }

            acceptedSchemaChanges = schemaGateResult.accepted;
            applied.schemaChangesDeferred = schemaGateResult.deferred.length;

            for (const deferred of schemaGateResult.deferred) {
                deferredHints.push({
                    change: deferred,
                    deferredAt: Date.now(),
                    reason: factsHighDensity ? 'facts_high_density' : 'budget_exceeded',
                });
            }
        }

        const plannedFacts = Array.isArray(facts)
            ? facts.slice(0, DEFAULT_CHANGE_BUDGET.maxFactCellUpdates)
            : [];
        if (Array.isArray(facts) && facts.length > plannedFacts.length) {
            logger.info('facts 单轮提议已达到预算上限，剩余条目将被跳过');
        }
        const plannedPatches = Array.isArray(patches) ? patches.slice() : [];
        const plannedSummaries = Array.isArray(summaries)
            ? summaries.map((summary: SummaryProposal): SummaryProposal => ensureSummaryProposalRange(summary, visibleMessageIds))
            : [];

        const mutationPlan = await planMemoryMutations({
            chatKey: this.chatKey,
            consumerPluginId,
            source: derivationSource.kind,
            facts: plannedFacts,
            patches: plannedPatches,
            summaries: plannedSummaries,
            chatStateManager: this.chatStateManager,
        });
        logSummaryMutationPlan(this.chatKey, consumerPluginId, mutationPlan);
        const execution = await executeMemoryMutationPlan({
            chatKey: this.chatKey,
            consumerPluginId,
            envelopeConfidence: Number(document.confidence ?? 0) || 0,
            derivationSource,
            visibleMessageIds,
            plan: mutationPlan,
            factsManager: this.factsManager,
            stateManager: this.stateManager,
            summariesManager: this.summariesManager,
            chatStateManager: this.chatStateManager,
            buildSummaryId: ({ summary, ordinal, nextTitle, nextContent, nextKeywords }): string => buildStableSummaryId({
                chatKey: this.chatKey,
                consumerPluginId,
                level: summary.level,
                title: nextTitle,
                content: nextContent,
                keywords: nextKeywords,
                visibleMessageIds,
                viewHash: derivationSource.viewHash,
                ordinal,
            }),
        });
        applied.factKeys.push(...execution.applied.factKeys);
        applied.statePaths.push(...execution.applied.statePaths);
        applied.summaryIds.push(...execution.applied.summaryIds);

        if (this.chatStateManager) {
            await this.chatStateManager.setLastMutationPlan(execution.snapshot);
            const ingestHealth = await this.chatStateManager.getIngestHealth();
            await this.chatStateManager.recordIngestHealth({
                totalAttempts: ingestHealth.totalAttempts + mutationPlan.items.length,
                duplicateDrops: ingestHealth.duplicateDrops + mutationPlan.actionCounts.NOOP,
                lastWriteAt: execution.appliedItems > 0 ? Date.now() : ingestHealth.lastWriteAt,
            });
            if (execution.shouldRefreshRelationshipState) {
                await this.chatStateManager.recomputeRelationshipState();
            }
        }

        if (acceptedSchemaChanges.length > 0) {
            applied.schemaChangesApplied = acceptedSchemaChanges.length;
            await this.auditManager.log({
                action: 'schema.changes_applied',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { changes: acceptedSchemaChanges },
            });
        }

        if (entityResolutions && entityResolutions.length > 0) {
            applied.entityResolutions = entityResolutions.length;
            await this.auditManager.log({
                action: 'entity.resolution_suggested',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { resolutions: entityResolutions },
            });
        }

        await this.auditManager.log({
            action: 'mutation.applied',
            actor: { pluginId: consumerPluginId, mode: 'ai' },
            before: {},
            after: {
                applied,
                confidence: Number(document.confidence ?? 0) || 0,
                deferredSchemaHints: deferredHints.length,
                mutationPlan: execution.snapshot,
            },
        });

        if (deferredHints.length > 0) {
            await this.auditManager.log({
                action: 'schema.changes_deferred',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { hints: deferredHints },
            });
        }

        void this.updateSharedSignals();

        return {
            accepted: true,
            applied,
            rejectedReasons: [],
            gateResults,
            deferredSchemaHints: deferredHints.length > 0 ? deferredHints : undefined,
            mutationPlan: execution.snapshot,
        };
    }

    /**
     * 功能：统计当前 chatKey 下的事实和事件数量，并写回 shared.signals。
     * @returns 无返回值。
     */
    private async updateSharedSignals(): Promise<void> {
        try {
            const [factCount, eventCount, activeTemplateId] = await Promise.all([
                db.facts.where('chatKey').equals(this.chatKey).count(),
                db.events.where('chatKey').equals(this.chatKey).count(),
                this.metaManager.getActiveTemplateId(),
            ]);

            await patchSdkChatShared(this.chatKey, {
                signals: {
                    [MEMORY_OS_PLUGIN_ID]: {
                        activeTemplate: activeTemplateId,
                        lastSummaryAt: Date.now(),
                        factCount,
                        eventCount,
                    },
                },
            });
        } catch {
            // shared.signals 写回失败不应影响主流程。
        }
    }
}
