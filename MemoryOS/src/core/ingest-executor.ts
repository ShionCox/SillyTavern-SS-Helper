import { logger } from '../runtime/runtime-services';
import type { MemorySDK } from '../../../SDK/stx';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { runGeneration } from '../llm/memoryLlmBridge';
import {
    buildMemorySummarySaveSystemPrompt,
    buildUnifiedIngestTaskPrompt,
} from '../llm/skills';
import type { MemoryMutationDocument, MutationResult, SummaryProposal } from '../proposal/types';
import type { TemplateManager } from '../template/template-manager';
import { buildAiJsonPromptBundle } from './ai-json-builder';
import { validateAiJsonOutput } from './ai-json-system';
import type { MemoryProcessingLevel, PostGenerationGateDecision, SummaryExecutionTier } from '../types';
import type { IngestExecutionResult, IngestPlan, IngestTask, SchemaContextPayload } from './ingest-types';
import { MEMORY_OS_POLICY } from '../policy/memory-policy';

const MEMORY_UPDATE_NAMESPACE_KEYS = ['memory_facts', 'world_state', 'memory_summaries', 'schema_changes', 'entity_resolutions'] as const;

type IngestTaskRunResult = {
    result: MutationResult | null;
    mutationDocument: MemoryMutationDocument | null;
    error?: string;
};

/**
 * 功能：统一封装 ingest 执行层，负责 prompt 构建、模型执行、结果解析与写入落地。
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
        if (!(input.memory as any)?.mutation?.applyMutationDocument) {
            logger.warn('memory.ingest 跳过执行：窗口中没有可用的 mutation 写入接口');
            return {
                mutationResult: null,
                mutationDocument: null,
                accepted: false,
                factsApplied: 0,
                patchesApplied: 0,
                summariesApplied: 0,
                reasonCodes: ['task_request_failed'],
            };
        }

        const memory = input.memory as MemorySDK;
        const schemaContext = await this.buildSchemaContext(memory);
        const systemPrompt = this.buildUnifiedIngestPrompt(
            input.plan.lorebookDecision.mode,
            input.plan.lorebookDecision.shouldExtractWorldFacts,
            input.plan.postGate,
            input.plan.processingDecision.summaryTier,
            input.plan.processingDecision.extractScope,
        );
        const runResult = await this.runIngestTask(
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
            memory,
        );
        const mutationResult = runResult.result;
        const factsApplied = Number(mutationResult?.applied?.factKeys?.length ?? 0);
        const patchesApplied = Number(mutationResult?.applied?.statePaths?.length ?? 0);
        const summariesApplied = Number(mutationResult?.applied?.summaryIds?.length ?? 0);
        const reasonCodes: string[] = [];
        if (runResult.error) {
            reasonCodes.push('task_request_failed');
        }
        if (!runResult.mutationDocument) {
            reasonCodes.push('task_payload_invalid');
        }

        return {
            mutationResult,
            mutationDocument: runResult.mutationDocument,
            accepted: Boolean(mutationResult?.accepted),
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
            mode: 'update',
            namespaceKeys: [...MEMORY_UPDATE_NAMESPACE_KEYS],
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
    private buildCompactRetryPrompt(basePrompt: string, task: IngestTask): string {
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
     * 功能：归一化统一摄取返回的 mutation 文档。
     * @param payload 原始 mutation 载荷。
     * @param rangeFallback 摘要缺失范围时使用的回填范围。
     * @returns 归一化后的 mutation 文档。
     */
    private buildMemoryMutationDocumentFromAiJsonPayload(
        payload: unknown,
        rangeFallback?: { fromMessageId?: string; toMessageId?: string },
        schemaContext?: Record<string, unknown>,
    ): MemoryMutationDocument | null {
        const validated = validateAiJsonOutput({
            mode: 'update',
            namespaceKeys: [...MEMORY_UPDATE_NAMESPACE_KEYS],
            payload,
            context: schemaContext,
        });
        if (!validated.ok || !validated.payload) {
            return null;
        }

        const facts: unknown[] = [];
        const patches: unknown[] = [];
        const summaries: SummaryProposal[] = [];
        const schemaChanges: unknown[] = [];
        const entityResolutions: unknown[] = [];
        validated.payload.updates.forEach((update: any): void => {
            const namespaceKey = String(update.namespaceKey ?? '').trim();
            const op = String(update.op ?? '').trim();
            if (namespaceKey === 'memory_facts') {
                if (op === 'upsert_item' && update.item) {
                    facts.push(update.item);
                }
                return;
            }
            if (namespaceKey === 'world_state') {
                if (op === 'upsert_item' && update.item) {
                    patches.push(update.item);
                }
                if (op === 'remove_item') {
                    patches.push({
                        op: 'remove',
                        path: String(update.itemPrimaryKeyValue ?? '').trim(),
                    });
                }
                return;
            }
            if (namespaceKey === 'memory_summaries') {
                if (op === 'upsert_item' && update.item && typeof update.item === 'object') {
                    const summary = update.item as SummaryProposal;
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
                    summaries.push({
                        ...summary,
                        content: String(summary.content ?? '').trim(),
                        range: normalizedRange,
                    });
                }
                if (op === 'remove_item') {
                    summaries.push({
                        level: 'scene',
                        summaryId: String(update.itemPrimaryKeyValue ?? '').trim(),
                        action: 'delete',
                        content: '',
                    });
                }
                return;
            }
            if (namespaceKey === 'schema_changes') {
                if (op === 'upsert_item' && update.item) {
                    schemaChanges.push(update.item);
                }
                return;
            }
            if (namespaceKey === 'entity_resolutions' && op === 'upsert_item' && update.item) {
                entityResolutions.push(update.item);
            }
        });
        return {
            facts: facts as any[],
            patches: patches as any[],
            summaries,
            schemaChanges: schemaChanges as any[],
            entityResolutions: entityResolutions as any[],
            confidence: 1,
        };
    }

    /**
     * 功能：压缩 mutation 文档日志摘要，便于快速判断是否进入落库链路。
     * @param document mutation 文档。
     * @returns 日志摘要对象。
     */
    private summarizeMemoryMutationDocumentForLog(document: MemoryMutationDocument | null | undefined): {
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
     * 功能：执行单个 ingest 任务并提交落地。
     * @param task 任务名。
     * @param taskDescription 任务描述。
     * @param systemPrompt 系统提示词。
     * @param eventsText 事件窗口文本。
     * @param schemaContext schema 上下文。
     * @param budget 预算配置。
     * @param rangeFallback 摘要范围回填。
     * @param memory 当前 memory 实例。
     * @returns ingest 任务执行结果。
     */
    private async runIngestTask(
        task: IngestTask,
        taskDescription: string,
        systemPrompt: string,
        eventsText: string,
        schemaContext: SchemaContextPayload,
        budget: { maxTokens: number; maxLatencyMs: number; maxCost: number },
        rangeFallback: { fromMessageId?: string; toMessageId?: string } | undefined,
        memory: MemorySDK,
    ): Promise<IngestTaskRunResult> {
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
            const retryPolicy = MEMORY_OS_POLICY.budget.invalidJsonRetry;
            const retryBudget = {
                maxTokens: Math.min(
                    retryPolicy.maxTokens,
                    Math.max(Number(budget.maxTokens ?? 0) + retryPolicy.tokenIncrement, retryPolicy.minTokens),
                ),
                maxLatencyMs: budget.maxLatencyMs,
                maxCost: Math.max(Number(budget.maxCost ?? 0), retryPolicy.memoryIngestMinCost),
            };
            logger.warn(`${task} 返回无效 JSON，启用紧凑模式重试一次`);
            response = await executeAttempt(this.buildCompactRetryPrompt(systemPrompt, task), retryBudget);
        }
        if (!response.ok) {
            const failedResponse = response as { ok: false; error?: string; reasonCode?: string };
            logger.warn(`${task} 请求失败：${failedResponse.error || 'unknown'} (${failedResponse.reasonCode || 'unknown'})`);
            return {
                result: null,
                mutationDocument: null,
                error: failedResponse.error,
            };
        }

        const mutationDocument = task === 'memory.ingest'
            ? this.buildMemoryMutationDocumentFromAiJsonPayload(
                response.data,
                rangeFallback,
                typeof schemaContext === 'string' ? undefined : schemaContext,
            )
            : null;
        logger.info(`${task} 返回 mutation 摘要：${JSON.stringify(this.summarizeMemoryMutationDocumentForLog(mutationDocument))}`);
        if (!mutationDocument) {
            logger.warn(`${task} 返回结构无效，跳过落地`);
            return {
                result: null,
                mutationDocument: null,
            };
        }

        const result = await (memory as any).mutation.applyMutationDocument(mutationDocument, MEMORY_OS_PLUGIN_ID);
        if (result.accepted) {
            logger.success(`${task} 通过：facts=${result.applied.factKeys.length}, patches=${result.applied.statePaths.length}, summaries=${result.applied.summaryIds.length}`);
        } else {
            logger.warn(`${task} 被拒绝：${result.rejectedReasons.join('; ')}`);
        }
        return {
            result,
            mutationDocument,
        };
    }
}
