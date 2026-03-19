import type { ProposalEnvelope, ProposalResult, WriteRequest, SchemaChangeProposal, DeferredSchemaHint } from './types';
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
import { planMemoryMutations } from '../core/memory-mutation-planner';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { db, patchSdkChatShared } from '../db/db';
import { DEFAULT_CHANGE_BUDGET } from '../types';
import { Logger } from '../../../SDK/logger';

const logger = new Logger('ProposalManager');

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
 * 功能：为提议生成稳定的摘要记录 ID，避免重复写入时产生新的摘要键。
 * @param input 提议摘要的稳定特征。
 * @returns 可复用的稳定摘要 ID。
 */
export function buildStableProposalSummaryId(input: {
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
    return `proposal_summary:${hashText(payload)}`;
}

/**
 * 功能：接收 AI 或外部插件的写入提议，并统一交给 gate、planner 和 executor 处理。
 */
export class ProposalManager {
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
     * 功能：处理 AI 提议，并在四道 gate 校验通过后执行长期记忆 CRUD。
     * @param envelope 提议信封。
     * @param consumerPluginId 调用方插件标识。
     * @returns 提议处理结果。
     */
    async processProposal(
        envelope: ProposalEnvelope,
        consumerPluginId: string,
    ): Promise<ProposalResult> {
        const activeTemplateId = await this.metaManager.getActiveTemplateId();
        let activeTemplate: WorldTemplate | null = null;
        if (activeTemplateId) {
            activeTemplate = await this.templateManager.getById(activeTemplateId);
        }

        const gateResults = await this.gateValidator.validate(
            envelope,
            activeTemplate,
            consumerPluginId,
            this.allowedPlugins,
        );

        const failedGates = gateResults.filter((gate) => !gate.passed);
        if (failedGates.length > 0) {
            const reasons = failedGates.flatMap((gate) => gate.errors);
            await this.auditManager.log({
                action: 'proposal.rejected',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { envelope, reasons },
            });
            return {
                accepted: false,
                applied: { factKeys: [], statePaths: [], summaryIds: [] },
                rejectedReasons: reasons,
                gateResults,
            };
        }

        return this.applyProposal(envelope, consumerPluginId, gateResults);
    }

    /**
     * 功能：把外部插件的 requestWrite 适配为统一 proposal 入口。
     * @param request 外部写入请求。
     * @returns 提议处理结果。
     */
    async processWriteRequest(request: WriteRequest): Promise<ProposalResult> {
        const envelope: ProposalEnvelope = {
            ok: true,
            proposal: request.proposal,
            confidence: 1.0,
        };
        return this.processProposal(envelope, request.source.pluginId);
    }

    /**
     * 功能：执行经过 gate 校验后的提议写入，并统一走 mutation planner / executor 主链。
     * @param envelope 提议信封。
     * @param consumerPluginId 调用方插件标识。
     * @param gateResults gate 校验结果。
     * @returns 提议处理结果。
     */
    private async applyProposal(
        envelope: ProposalEnvelope,
        consumerPluginId: string,
        gateResults: Array<{ passed: boolean; gate: string; errors: string[] }>,
    ): Promise<ProposalResult> {
        const applied = {
            factKeys: [] as string[],
            statePaths: [] as string[],
            summaryIds: [] as string[],
            schemaChangesApplied: 0,
            schemaChangesDeferred: 0,
            entityResolutions: 0,
        };

        const { facts, patches, summaries, schemaChanges, entityResolutions } = envelope.proposal;
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
            kind: 'proposal_apply',
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
        const plannedSummaries = Array.isArray(summaries) ? summaries.slice() : [];

        const mutationPlan = await planMemoryMutations({
            chatKey: this.chatKey,
            consumerPluginId,
            source: derivationSource.kind,
            facts: plannedFacts,
            patches: plannedPatches,
            summaries: plannedSummaries,
            chatStateManager: this.chatStateManager,
        });
        const execution = await executeMemoryMutationPlan({
            chatKey: this.chatKey,
            consumerPluginId,
            envelopeConfidence: envelope.confidence,
            derivationSource,
            visibleMessageIds,
            plan: mutationPlan,
            factsManager: this.factsManager,
            stateManager: this.stateManager,
            summariesManager: this.summariesManager,
            chatStateManager: this.chatStateManager,
            buildSummaryId: ({ summary, ordinal, nextTitle, nextContent, nextKeywords }): string => buildStableProposalSummaryId({
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
            action: 'proposal.applied',
            actor: { pluginId: consumerPluginId, mode: 'ai' },
            before: {},
            after: {
                applied,
                confidence: envelope.confidence,
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
