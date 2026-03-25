import { logger } from '../index';
import type { MemorySDK, ProposalResult } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { runGeneration } from '../llm/memoryLlmBridge';
import {
    buildMemorySummarySaveSystemPrompt,
    buildUnifiedIngestTaskPrompt,
} from '../llm/skills';
import type { MemoryProposalDocument, SummaryProposal } from '../proposal/types';
import type { TemplateManager } from '../template/template-manager';
import { buildAiJsonPromptBundle } from './ai-json-builder';
import { applyAiJsonOutput, validateAiJsonOutput } from './ai-json-system';
import type { MemoryProcessingLevel, PostGenerationGateDecision, SummaryExecutionTier } from '../types';
import type { IngestExecutionResult, IngestPlan, ProposalTask, SchemaContextPayload } from './ingest-types';

const MEMORY_PROPOSAL_NAMESPACE_KEYS = ['memory_proposal'] as const;

type ProposalTaskRunResult = {
    result: ProposalResult | null;
    proposalDocument: MemoryProposalDocument | null;
    error?: string;
};

/**
 * 功能：统一封装 ingest 执行层，负责 prompt 构建、模型执行、结果解析与提案落地。
 */
export class IngestExecutor {
    private readonly templateManager: TemplateManager;

    constructor(templateManager: TemplateManager) {
        this.templateManager = templateManager;
    }

    /**
     * 功能：执行单轮 ingest 计划并返回标准执行结果。
     * @param input 执行输入。
     * @returns 执行摘要。
     */
    public async execute(input: {
        plan: IngestPlan;
        memory: MemorySDK | null;
    }): Promise<IngestExecutionResult> {
        if (!input.memory?.proposal?.processProposal) {
            logger.warn('memory.ingest 跳过执行：窗口中没有可用的提案写入接口');
            return {
                proposalResult: null,
                proposalDocument: null,
                accepted: false,
                factsApplied: 0,
                patchesApplied: 0,
                summariesApplied: 0,
                reasonCodes: ['task_request_failed'],
            };
        }

        const schemaContext = await this.buildSchemaContext(input.memory);
        const systemPrompt = this.buildUnifiedIngestPrompt(
            input.plan.lorebookDecision.mode,
            input.plan.lorebookDecision.shouldExtractWorldFacts,
            input.plan.postGate,
            input.plan.processingDecision.summaryTier,
            input.plan.processingDecision.extractScope,
        );
        const runResult = await this.runProposalTask(
            'memory.ingest',
            input.plan.taskDescription,
            systemPrompt,
            input.plan.compressedWindowText,
            schemaContext,
            input.plan.promptBudget,
            {
                fromMessageId: input.plan.selection.fromMessageId,
                toMessageId: input.plan.selection.toMessageId,
            },
            input.memory,
        );
        const proposalResult = runResult.result;
        const factsApplied = Number(proposalResult?.applied?.factKeys?.length ?? 0);
        const patchesApplied = Number(proposalResult?.applied?.statePaths?.length ?? 0);
        const summariesApplied = Number(proposalResult?.applied?.summaryIds?.length ?? 0);
        const reasonCodes: string[] = [];
        if (runResult.error) {
            reasonCodes.push('task_request_failed');
        }
        if (!runResult.proposalDocument) {
            reasonCodes.push('task_payload_invalid');
        }

        return {
            proposalResult,
            proposalDocument: runResult.proposalDocument,
            accepted: Boolean(proposalResult?.accepted),
            factsApplied,
            patchesApplied,
            summariesApplied,
            reasonCodes,
        };
    }

    /**
     * 功能：构建统一记忆摄取提示词。
     * @param lorebookMode 当前世界书裁决模式。
     * @param allowWorldFacts 是否允许抽取世界事实。
     * @param postGate 生成后 gate 结果。
     * @param summaryTier 摘要档位。
     * @param scope 抽取档位。
     * @returns 任务提示词。
     */
    private buildUnifiedIngestPrompt(
        lorebookMode: string,
        allowWorldFacts: boolean,
        postGate: PostGenerationGateDecision,
        summaryTier: SummaryExecutionTier,
        scope: MemoryProcessingLevel,
    ): string {
        const promptBundle = buildAiJsonPromptBundle({
            mode: 'init',
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
        });
        const basePrompt = buildUnifiedIngestTaskPrompt(
            lorebookMode,
            allowWorldFacts,
            postGate,
            summaryTier,
            scope,
            buildMemorySummarySaveSystemPrompt(),
        );
        return [
            basePrompt,
            '请严格按统一 JSON 结构输出。',
            '',
            '命名空间说明：',
            promptBundle.systemInstructions,
            '',
            '使用方法：',
            promptBundle.usageGuide,
            '',
            '填写示例：',
            promptBundle.exampleJson,
        ].join('\n');
    }

    /**
     * 功能：构建抽取失败后的紧凑重试提示词，降低 JSON 截断概率。
     * @param basePrompt 原始提示词。
     * @param task 当前任务。
     * @returns 重试提示词。
     */
    private buildCompactRetryPrompt(basePrompt: string, task: ProposalTask): string {
        if (task === 'memory.ingest') {
            return [
                basePrompt,
                '上一轮因为 JSON 无法解析而失败；本轮必须优先保证 JSON 完整闭合。',
                '如果信息很多，宁可少写也不要写断。',
                '严格限制：facts 最多 10 条，patches 最多 6 条。',
                '只返回单个完整 JSON 对象，不要输出 Markdown 或额外解释。',
            ].join('\n');
        }
        return [
            basePrompt,
            '上一轮因为 JSON 无法解析而失败。',
            '本次只返回一个完整闭合 JSON 对象，不要附加解释。',
        ].join('\n');
    }

    /**
     * 功能：构建抽取任务所需的 schema 上下文。
     * @param memory 当前 MemorySDK。
     * @returns schema 上下文。
     */
    private async buildSchemaContext(memory: MemorySDK | null): Promise<SchemaContextPayload> {
        const activeTemplateId = await memory?.getActiveTemplateId?.();
        if (!activeTemplateId) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        const currentTemplate = await this.templateManager.getById(activeTemplateId);
        if (!currentTemplate) {
            return '请以通用视角提取角色、关系、位置与状态。';
        }
        return {
            tables: currentTemplate.tables,
            factTypes: currentTemplate.factTypes,
            patchSchemas: currentTemplate.patchSchemas,
            extractPolicies: currentTemplate.extractPolicies,
        };
    }

    /**
     * 功能：归一化统一摄取返回的提案文档。
     * @param payload 原始提案载荷。
     * @param rangeFallback 摘要缺失范围时使用的回填范围。
     * @returns 归一化后的提案文档。
     */
    private buildMemoryProposalDocumentFromAiJsonPayload(
        payload: unknown,
        rangeFallback?: { fromMessageId?: string; toMessageId?: string },
        schemaContext?: Record<string, unknown>,
    ): MemoryProposalDocument | null {
        const validated = validateAiJsonOutput({
            mode: 'init',
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
            payload,
            context: schemaContext,
        });
        if (!validated.ok || !validated.payload) {
            return null;
        }

        const applied = applyAiJsonOutput({
            document: {},
            payload: validated.payload,
            namespaceKeys: [...MEMORY_PROPOSAL_NAMESPACE_KEYS],
        });
        const proposalRecord = applied.document.memory_proposal;
        if (!proposalRecord || typeof proposalRecord !== 'object' || Array.isArray(proposalRecord)) {
            return null;
        }

        const proposal = proposalRecord as Record<string, unknown>;
        const summaries = Array.isArray(proposal.summaries)
            ? proposal.summaries
                .filter((summary: SummaryProposal | null | undefined): summary is SummaryProposal => {
                    return Boolean(summary && typeof summary === 'object' && String(summary.content ?? '').trim());
                })
                .map((summary: SummaryProposal): SummaryProposal => {
                    const normalizedRange = summary.range?.fromMessageId || summary.range?.toMessageId
                        ? {
                            fromMessageId: String(summary.range?.fromMessageId ?? '').trim() || rangeFallback?.fromMessageId,
                            toMessageId: String(summary.range?.toMessageId ?? '').trim() || rangeFallback?.toMessageId,
                        }
                        : rangeFallback
                            ? {
                                fromMessageId: rangeFallback.fromMessageId,
                                toMessageId: rangeFallback.toMessageId,
                            }
                            : undefined;
                    return {
                        ...summary,
                        content: String(summary.content ?? '').trim(),
                        range: normalizedRange,
                    };
                })
            : [];
        return {
            facts: Array.isArray(proposal.facts) ? proposal.facts : [],
            patches: Array.isArray(proposal.patches) ? proposal.patches : [],
            summaries,
            notes: typeof proposal.notes === 'string' ? proposal.notes : undefined,
            schemaChanges: Array.isArray(proposal.schemaChanges) ? proposal.schemaChanges : [],
            entityResolutions: Array.isArray(proposal.entityResolutions) ? proposal.entityResolutions : [],
            confidence: Number(proposal.confidence ?? 0) || 0,
        };
    }

    /**
     * 功能：压缩提案文档日志摘要，便于快速判断是否进入落库链路。
     * @param document 提案文档。
     * @returns 日志摘要对象。
     */
    private summarizeMemoryProposalDocumentForLog(document: MemoryProposalDocument | null | undefined): {
        facts: number;
        patches: number;
        summaries: number;
        confidence: number;
        summaryRanges: string[];
    } {
        const summaries = Array.isArray(document?.summaries) ? document.summaries : [];
        return {
            facts: Array.isArray(document?.facts) ? document.facts.length : 0,
            patches: Array.isArray(document?.patches) ? document.patches.length : 0,
            summaries: summaries.length,
            confidence: Number(document?.confidence ?? 0) || 0,
            summaryRanges: summaries.slice(0, 4).map((summary: SummaryProposal): string => {
                const level = String(summary.level ?? 'summary').trim() || 'summary';
                const fromMessageId = String(summary.range?.fromMessageId ?? '').trim() || '?';
                const toMessageId = String(summary.range?.toMessageId ?? '').trim() || '?';
                return `${level}:${fromMessageId}->${toMessageId}`;
            }),
        };
    }

    /**
     * 功能：执行单个提案任务并提交落地。
     * @param task 任务名。
     * @param taskDescription 任务描述。
     * @param systemPrompt 系统提示词。
     * @param eventsText 事件窗口文本。
     * @param schemaContext schema 上下文。
     * @param budget 预算配置。
     * @param rangeFallback 摘要范围回填。
     * @param memory 当前 memory 实例。
     * @returns 提案任务执行结果。
     */
    private async runProposalTask(
        task: ProposalTask,
        taskDescription: string,
        systemPrompt: string,
        eventsText: string,
        schemaContext: SchemaContextPayload,
        budget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        rangeFallback: { fromMessageId?: string; toMessageId?: string } | undefined,
        memory: MemorySDK,
    ): Promise<ProposalTaskRunResult> {
        const executeAttempt = async (
            prompt: string,
            attemptBudget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        ) => {
            return runGeneration<unknown>(
                task,
                {
                    systemPrompt: prompt,
                    events: eventsText,
                    schemaContext: typeof schemaContext === 'string'
                        ? schemaContext
                        : JSON.stringify(schemaContext, null, 2),
                },
                attemptBudget,
                undefined,
                taskDescription,
            );
        };

        let response: any = await executeAttempt(systemPrompt, budget);
        if (!response.ok && response.reasonCode === 'invalid_json') {
            const retryBudget = {
                maxTokens: Math.min(3200, Math.max(Number(budget.maxTokens ?? 0) + 400, 2200)),
                maxLatencyMs: budget.maxLatencyMs,
                maxCost: Math.max(Number(budget.maxCost ?? 0), task === 'memory.ingest' ? 0.5 : 0.25),
            };
            logger.warn(`${task} 返回无效 JSON，启用紧凑模式重试一次`);
            response = await executeAttempt(this.buildCompactRetryPrompt(systemPrompt, task), retryBudget);
        }
        if (!response.ok) {
            const failedResponse = response as { ok: false; error?: string; reasonCode?: string };
            logger.warn(`${task} 请求失败：${failedResponse.error || 'unknown'} (${failedResponse.reasonCode || 'unknown'})`);
            return {
                result: null,
                proposalDocument: null,
                error: failedResponse.error,
            };
        }

        const proposalDocument = task === 'memory.ingest'
            ? this.buildMemoryProposalDocumentFromAiJsonPayload(
                response.data,
                rangeFallback,
                typeof schemaContext === 'string' ? undefined : schemaContext,
            )
            : null;
        logger.info(`${task} 返回提案摘要：${JSON.stringify(this.summarizeMemoryProposalDocumentForLog(proposalDocument))}`);
        if (!proposalDocument) {
            logger.warn(`${task} 返回结构无效，跳过落地`);
            return {
                result: null,
                proposalDocument: null,
            };
        }

        const result = await memory.proposal.processProposal(proposalDocument, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被拒绝：${result.rejectedReasons.join('; ')}`);
        }
        return {
            result,
            proposalDocument,
        };
    }
}
