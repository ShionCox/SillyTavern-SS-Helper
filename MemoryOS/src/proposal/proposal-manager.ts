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
import { normalizeWorldStatePatchValue } from '../core/world-state-patch-normalizer';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { db, patchSdkChatShared } from '../db/db';
import type { MemoryCandidate } from '../types';
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
 * 提议写入管理器 —— 接收 AI 或外部插件的提议，经闸门后落盘
 * v2: 支持 schemaChanges 三段闸门与变更预算
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

    /** 被授权可以写入 facts/state 的插件列表 */
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
     * 授权一个插件写入权限
     */
    grantPermission(pluginId: string): void {
        if (!this.allowedPlugins.includes(pluginId)) {
            this.allowedPlugins.push(pluginId);
        }
    }

    /**
     * 撤销插件写入权限
     */
    revokePermission(pluginId: string): void {
        this.allowedPlugins = this.allowedPlugins.filter(id => id !== pluginId);
    }

    /**
     * 处理 AI 提议（来自 memory.extract / world.update 等任务）
     */
    async processProposal(
        envelope: ProposalEnvelope,
        consumerPluginId: string
    ): Promise<ProposalResult> {
        // 获取当前活跃模板
        const activeTemplateId = await this.metaManager.getActiveTemplateId();
        let activeTemplate: WorldTemplate | null = null;
        if (activeTemplateId) {
            activeTemplate = await this.templateManager.getById(activeTemplateId);
        }

        // 四道闸门校验（前三道）
        const gateResults = await this.gateValidator.validate(
            envelope,
            activeTemplate,
            consumerPluginId,
            this.allowedPlugins
        );

        // 检查是否有闸门未通过
        const failedGates = gateResults.filter(g => !g.passed);
        if (failedGates.length > 0) {
            const reasons = failedGates.flatMap(g => g.errors);

            // 闸门 4：审计记录（即使被拒绝也要记录）
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

        // 校验全部通过 → 落盘
        return this.applyProposal(envelope, consumerPluginId, gateResults);
    }

    /**
     * 处理外部插件的写入请求（requestWrite）
     */
    async processWriteRequest(request: WriteRequest): Promise<ProposalResult> {
        const envelope: ProposalEnvelope = {
            ok: true,
            proposal: request.proposal,
            confidence: 1.0, // 外部插件提交的视为确定性数据
        };

        return this.processProposal(envelope, request.source.pluginId);
    }

    /**
     * 执行实际的落盘操作
     * v2: 在同一事务中处理 facts + schemaChanges，支持变更预算
     */
    private async applyProposal(
        envelope: ProposalEnvelope,
        consumerPluginId: string,
        gateResults: Array<{ passed: boolean; gate: string; errors: string[] }>
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
            mutationKinds: Array.isArray(logicalView?.mutationKinds) ? logicalView!.mutationKinds : [],
            repairGeneration,
            ts: Date.now(),
        };

        // 判断 facts 密度
        const factsHighDensity = (facts?.length ?? 0) > DEFAULT_CHANGE_BUDGET.maxFactEntityUpdates;

        // schemaChanges 三段闸门（Schema Gate + Diff Gate）
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

            // 延后的 changes 记入审计
            for (const deferred of schemaGateResult.deferred) {
                deferredHints.push({
                    change: deferred,
                    deferredAt: Date.now(),
                    reason: factsHighDensity ? 'facts_high_density' : 'budget_exceeded',
                });
            }
        }

        // 写入 facts（受变更预算限制）
        let factCellUpdates = 0;
        const factEntityIds = new Set<string>();
        const scoredCandidates: MemoryCandidate[] = [];
        let shouldRefreshRelationshipState = false;

        if (facts) {
            for (const f of facts) {
                if (!f) continue;

                // 变更预算检查
                if (factCellUpdates >= DEFAULT_CHANGE_BUDGET.maxFactCellUpdates) {
                    logger.info('facts 单元格更新达到预算上限，跳过剩余');
                    break;
                }
                if (f.entity?.id) {
                    factEntityIds.add(`${f.entity.kind}:${f.entity.id}`);
                    if (factEntityIds.size > DEFAULT_CHANGE_BUDGET.maxFactEntityUpdates) {
                        logger.info('facts 实体行更新达到预算上限，跳过剩余');
                        break;
                    }
                }

                let factCandidate: MemoryCandidate | null = null;
                if (this.chatStateManager) {
                    factCandidate = await this.chatStateManager.buildMemoryCandidate({
                        candidateId: crypto.randomUUID(),
                        kind: /relationship|relation|bond|trust|affection|conflict|关系|好感|信任|矛盾/.test(
                            `${normalizeText(f.type)} ${normalizeText(f.path)} ${normalizeText(JSON.stringify(f.value ?? ''))}`,
                        )
                            ? 'relationship'
                            : 'fact',
                        source: consumerPluginId,
                        summary: `${normalizeText(f.type)} ${normalizeText(f.path)} ${normalizeText(JSON.stringify(f.value ?? ''))}`.trim(),
                        payload: {
                            type: f.type,
                            entity: f.entity,
                            path: f.path,
                            value: f.value,
                            confidence: f.confidence,
                            sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? '',
                        },
                        extractedAt: Date.now(),
                        sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? undefined,
                    });
                    scoredCandidates.push(factCandidate);
                    if (!factCandidate.encoding.accepted) {
                        continue;
                    }
                }

                const factKey = await this.factsManager.upsert({
                    factKey: f.factKey,
                    type: f.type,
                    entity: f.entity,
                    path: f.path,
                    value: f.value,
                    confidence: f.confidence,
                    provenance: {
                        extractor: 'ai',
                        provider: consumerPluginId,
                        pluginId: consumerPluginId,
                        source: derivationSource,
                    },
                });
                applied.factKeys.push(factKey);
                factCellUpdates++;
                if (factCandidate && this.chatStateManager) {
                    factCandidate.resolvedRecordKey = factKey;
                    await this.chatStateManager.applyEncodingToRecord(factKey, 'fact', factCandidate.encoding);
                    shouldRefreshRelationshipState = shouldRefreshRelationshipState
                        || factCandidate.kind === 'relationship'
                        || Boolean(factCandidate.encoding.relationScope);
                }
            }
        }

        // 写入 patches (world_state)
        if (patches) {
            for (const p of patches) {
                if (!p) continue;
                const normalizedPatchValue = p.op === 'remove'
                    ? p.value
                    : normalizeWorldStatePatchValue(p.path, p.value);
                let stateCandidate: MemoryCandidate | null = null;
                if (this.chatStateManager) {
                    stateCandidate = await this.chatStateManager.buildMemoryCandidate({
                        candidateId: crypto.randomUUID(),
                        kind: 'state',
                        source: consumerPluginId,
                        summary: `${normalizeText(p.path)} ${normalizeText(JSON.stringify(normalizedPatchValue ?? ''))}`.trim(),
                        payload: {
                            op: p.op,
                            path: p.path,
                            value: normalizedPatchValue,
                            confidence: envelope.confidence,
                            sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? '',
                        },
                        extractedAt: Date.now(),
                        sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? undefined,
                    });
                    scoredCandidates.push(stateCandidate);
                    if (!stateCandidate.encoding.accepted) {
                        continue;
                    }
                }
                if (p.op === 'remove') {
                    await this.stateManager.patch([{ op: 'remove', path: p.path }]);
                } else {
                    await this.stateManager.set(p.path, normalizedPatchValue);
                }
                applied.statePaths.push(p.path);
                if (stateCandidate && this.chatStateManager) {
                    stateCandidate.resolvedRecordKey = p.path;
                    await this.chatStateManager.applyEncodingToRecord(p.path, 'state', stateCandidate.encoding);
                }
            }
        }

        // 写入 summaries
        if (summaries) {
            for (const [summaryIndex, s] of summaries.entries()) {
                if (!s) continue;
                let summaryCandidate: MemoryCandidate | null = null;
                if (this.chatStateManager) {
                    summaryCandidate = await this.chatStateManager.buildMemoryCandidate({
                        candidateId: crypto.randomUUID(),
                        kind: 'summary',
                        source: consumerPluginId,
                        summary: `${normalizeText(s.title)} ${normalizeText(s.content)}`.trim(),
                        payload: {
                            level: s.level,
                            title: s.title,
                            content: s.content,
                            keywords: s.keywords,
                            confidence: envelope.confidence,
                            sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? '',
                        },
                        extractedAt: Date.now(),
                        sourceEventId: visibleMessageIds[visibleMessageIds.length - 1] ?? undefined,
                    });
                    scoredCandidates.push(summaryCandidate);
                    if (!summaryCandidate.encoding.accepted) {
                        continue;
                    }
                }
                const summaryId = buildStableProposalSummaryId({
                    chatKey: this.chatKey,
                    consumerPluginId,
                    level: s.level,
                    title: s.title,
                    content: s.content,
                    keywords: s.keywords,
                    visibleMessageIds,
                    viewHash: derivationSource.viewHash,
                    ordinal: summaryIndex,
                });
                const persistedSummaryId = await this.summariesManager.upsert({
                    summaryId,
                    level: s.level,
                    title: s.title,
                    content: s.content,
                    keywords: s.keywords,
                    range: {
                        fromMessageId: visibleMessageIds[0] ?? undefined,
                        toMessageId: visibleMessageIds[visibleMessageIds.length - 1] ?? undefined,
                    },
                    source: {
                        extractor: 'ai',
                        provider: consumerPluginId,
                        provenance: {
                            extractor: 'ai',
                            provider: consumerPluginId,
                            pluginId: consumerPluginId,
                            source: derivationSource,
                        },
                    },
                });
                applied.summaryIds.push(persistedSummaryId);
                if (summaryCandidate && this.chatStateManager) {
                    summaryCandidate.resolvedRecordKey = persistedSummaryId;
                    await this.chatStateManager.applyEncodingToRecord(persistedSummaryId, 'summary', summaryCandidate.encoding);
                }
            }
        }

        if (this.chatStateManager && scoredCandidates.length > 0) {
            await this.chatStateManager.recordMemoryCandidates(scoredCandidates);
            if (shouldRefreshRelationshipState) {
                await this.chatStateManager.recomputeRelationshipState();
            }
        }

        // Apply Gate: schemaChanges 落盘（仅记录审计，模板修订由外部管理）
        if (acceptedSchemaChanges.length > 0) {
            applied.schemaChangesApplied = acceptedSchemaChanges.length;

            await this.auditManager.log({
                action: 'schema.changes_applied',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { changes: acceptedSchemaChanges },
            });
        }

        // entityResolutions 记录（v1 只记录建议，不自动 merge）
        if (entityResolutions && entityResolutions.length > 0) {
            applied.entityResolutions = entityResolutions.length;

            await this.auditManager.log({
                action: 'entity.resolution_suggested',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { resolutions: entityResolutions },
            });
        }

        // 闸门 4：审计记录（成功落盘）
        await this.auditManager.log({
            action: 'proposal.applied',
            actor: { pluginId: consumerPluginId, mode: 'ai' },
            before: {},
            after: { applied, confidence: envelope.confidence, deferredSchemaHints: deferredHints.length },
        });

        // 延后 schema 建议写入审计
        if (deferredHints.length > 0) {
            await this.auditManager.log({
                action: 'schema.changes_deferred',
                actor: { pluginId: consumerPluginId, mode: 'ai' },
                before: {},
                after: { hints: deferredHints },
            });
        }

        // 更新 shared.signals
        void this.updateSharedSignals();

        return {
            accepted: true,
            applied,
            rejectedReasons: [],
            gateResults,
            deferredSchemaHints: deferredHints.length > 0 ? deferredHints : undefined,
        };
    }

    /**
     * 统计当前 chatKey 下的事实/事件数量，写入 shared.signals
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
            // signal 更新失败不应影响主流程
        }
    }
}
