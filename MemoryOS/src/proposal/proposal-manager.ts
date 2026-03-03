import type { ProposalEnvelope, ProposalResult, WriteRequest } from './types';
import type { WorldTemplate } from '../template/types';
import { GateValidator } from './gate-validator';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { AuditManager } from '../core/audit-manager';
import { MetaManager } from '../core/meta-manager';
import { TemplateManager } from '../template/template-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * 提议写入管理器 —— 接收 AI 或外部插件的提议，经四道闸门后落盘
 * 这是写入数据的唯一合法入口（AI 模式下）
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

    /** 被授权可以写入 facts/state 的插件列表 */
    private allowedPlugins: string[] = [MEMORY_OS_PLUGIN_ID];

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        this.factsManager = new FactsManager(chatKey);
        this.stateManager = new StateManager(chatKey);
        this.summariesManager = new SummariesManager(chatKey);
        this.auditManager = new AuditManager(chatKey);
        this.metaManager = new MetaManager(chatKey);
        this.templateManager = new TemplateManager(chatKey);
        this.gateValidator = new GateValidator(this.factsManager, this.stateManager);
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
        };

        const { facts, patches, summaries } = envelope.proposal;

        // 写入 facts
        if (facts) {
            for (const f of facts) {
                if (!f) continue;
                const factKey = await this.factsManager.upsert({
                    factKey: f.factKey,
                    type: f.type,
                    entity: f.entity,
                    path: f.path,
                    value: f.value,
                    confidence: f.confidence,
                    provenance: { extractor: 'ai', pluginId: consumerPluginId },
                });
                applied.factKeys.push(factKey);
            }
        }

        // 写入 patches (world_state)
        if (patches) {
            for (const p of patches) {
                if (!p) continue;
                if (p.op === 'remove') {
                    await this.stateManager.set(p.path, null);
                } else {
                    await this.stateManager.set(p.path, p.value);
                }
                applied.statePaths.push(p.path);
            }
        }

        // 写入 summaries
        if (summaries) {
            for (const s of summaries) {
                if (!s) continue;
                const summaryId = await this.summariesManager.upsert({
                    level: s.level,
                    title: s.title,
                    content: s.content,
                    keywords: s.keywords,
                    source: { extractor: 'ai', provider: consumerPluginId },
                });
                applied.summaryIds.push(summaryId);
            }
        }

        // 闸门 4：审计记录（成功落盘）
        await this.auditManager.log({
            action: 'proposal.applied',
            actor: { pluginId: consumerPluginId, mode: 'ai' },
            before: {},
            after: { applied, confidence: envelope.confidence },
        });

        return {
            accepted: true,
            applied,
            rejectedReasons: [],
            gateResults,
        };
    }
}
