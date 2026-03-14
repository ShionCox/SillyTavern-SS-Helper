import type { LLMRequest } from '../providers/types';
import { TaskRouter } from '../router/router';
import { BudgetManager } from '../budget/budget-manager';
import { parseJsonOutput, validateZodSchema, WorldTemplateSchema, ProposalEnvelopeSchema } from '../schema/validator';
import { ProfileManager } from '../profile/profile-manager';
import { inferReasonCode } from '../schema/error-codes';
import { RequestOrchestrator } from '../orchestrator/orchestrator';
import { DisplayController } from '../display/display-controller';
import { ConsumerRegistry } from '../registry/consumer-registry';
import type {
    LLMRunResult,
    LLMRunMeta,
    CapabilityKind,
    ConsumerRegistration,
    OverlayPatch,
    RunTaskArgs,
    EmbedArgs,
    RerankArgs,
    RequestRecord,
    RequestEnqueueOptions,
} from '../schema/types';
import type { z } from 'zod';

/**
 * LLMSDK 门面层
 * 整合四层架构：注册中心、路由、编排、展示。
 *
 * 异步接口：runTask, embed, rerank, waitForOverlayClose
 * 同步接口：registerConsumer, unregisterConsumer, updateOverlay, closeOverlay
 */
export class LLMSDKImpl {
    private router: TaskRouter;
    private budgetManager: BudgetManager;
    private profileManager: ProfileManager;
    private orchestrator: RequestOrchestrator;
    private displayController: DisplayController;
    private registry: ConsumerRegistry;
    private globalProfileId: string;

    constructor(
        router: TaskRouter,
        budgetManager: BudgetManager,
        orchestrator: RequestOrchestrator,
        displayController: DisplayController,
        registry: ConsumerRegistry,
    ) {
        this.router = router;
        this.budgetManager = budgetManager;
        this.profileManager = new ProfileManager();
        this.orchestrator = orchestrator;
        this.displayController = displayController;
        this.registry = registry;
        this.globalProfileId = 'balanced';

        // 连接编排器与展示控制器
        this.orchestrator.setExecuteCallback((record) => this.executeRequest(record));
        this.orchestrator.setDisplayCallback((record, result) => {
            this.displayController.createOverlay(record, result);
        });
        this.displayController.setNotifyOrchestratorClosed((requestId) => {
            this.orchestrator.notifyOverlayClosed(requestId);
        });
    }

    // ─── 同步命令式接口 ───

    /** 幂等 upsert 注册。同步返回，内部异步落盘。 */
    registerConsumer(registration: ConsumerRegistration): void {
        this.registry.registerConsumer(registration);
    }

    /** 注销消费方。同步返回。 */
    unregisterConsumer(pluginId: string, opts?: { keepPersistent?: boolean }): void {
        this.registry.unregisterConsumer(pluginId, opts);
    }

    /** 更新覆层。同步返回。 */
    updateOverlay(requestId: string, patch: OverlayPatch): void {
        this.displayController.updateOverlay(requestId, patch);
    }

    /** 关闭覆层。同步返回。 */
    closeOverlay(requestId: string, reason?: string): void {
        this.displayController.closeOverlay(requestId, reason);
    }

    // ─── 异步接口 ───

    setGlobalProfile(profileId: string): void {
        const profile = this.profileManager.get(profileId);
        if (!profile) {
            throw new Error(`Profile 不存在: ${profileId}`);
        }
        this.globalProfileId = profileId;
    }

    getGlobalProfile(): string {
        return this.globalProfileId;
    }

    /**
     * 执行 AI 任务。
     * 只等待 AI 结果返回，不等待展示关闭。
     */
    async runTask<T>(args: RunTaskArgs<T>): Promise<LLMRunResult<T>> {
        const taskKind: CapabilityKind = args.taskKind;

        const record = this.orchestrator.enqueue<T>(
            args.consumer,
            args.taskId,
            taskKind,
            {
                ...args.enqueue,
                displayMode: args.enqueue?.displayMode || (taskKind === 'generation' ? 'fullscreen' : 'silent'),
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
        );

        // 将执行参数附到 record 上供 executeCallback 使用
        (record as any)._args = args;

        return record.resultPromise;
    }

    /**
     * 向量化接口。
     * AI 结果返回时立即完成。
     */
    async embed(args: EmbedArgs): Promise<any> {
        const record = this.orchestrator.enqueue(
            args.consumer,
            args.taskId,
            'embedding',
            {
                ...args.enqueue,
                displayMode: 'silent',
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
        );

        (record as any)._args = args;

        return record.resultPromise;
    }

    /**
     * 重排序接口。
     * AI 结果返回时立即完成。
     */
    async rerank(args: RerankArgs): Promise<any> {
        const record = this.orchestrator.enqueue(
            args.consumer,
            args.taskId,
            'rerank',
            {
                ...args.enqueue,
                displayMode: 'silent',
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
        );

        (record as any)._args = args;

        return record.resultPromise;
    }

    /**
     * 等待展示关闭。
     */
    async waitForOverlayClose(requestId: string): Promise<void> {
        return this.orchestrator.waitForOverlayClose(requestId);
    }

    // ─── 编排器执行回调（内部） ───

    private async executeRequest(record: RequestRecord): Promise<LLMRunResult<any>> {
        const args = (record as any)._args;
        if (!args) {
            return { ok: false, error: '请求参数缺失', reasonCode: 'unknown' };
        }

        switch (record.taskKind) {
            case 'generation':
                return this.executeGeneration(args, record);
            case 'embedding':
                return this.executeEmbed(args, record);
            case 'rerank':
                return this.executeRerank(args, record);
            default:
                return { ok: false, error: `未知任务类型: ${record.taskKind}`, reasonCode: 'unknown' };
        }
    }

    private async executeGeneration(args: RunTaskArgs, record: RequestRecord): Promise<LLMRunResult<any>> {
        // 预算检查
        const budgetCheck = this.budgetManager.canRequest(args.consumer);
        if (!budgetCheck.allowed) {
            return {
                ok: false,
                error: budgetCheck.reason || '请求被限流/熔断',
                retryable: true,
                reasonCode: 'circuit_open',
            };
        }

        // 路由解析（新版）
        let resolved;
        try {
            resolved = this.router.resolveRoute({
                consumer: args.consumer,
                taskKind: 'generation',
                taskId: args.taskId,
                routeHint: args.routeHint ? {
                    providerId: args.routeHint.provider,
                    model: args.routeHint.model,
                    profileId: args.routeHint.profile,
                } : undefined,
            });
        } catch (error) {
            return {
                ok: false,
                error: (error as Error).message,
                retryable: false,
                reasonCode: 'provider_unavailable',
            };
        }

        const profileId = resolved.profileId || this.globalProfileId;
        const profile = this.profileManager.get(profileId);
        const consumerBudget = this.budgetManager.getConfig(args.consumer);

        const llmReq: LLMRequest = {
            messages: Array.isArray(args.input?.messages)
                ? args.input.messages
                : [
                    {
                        role: 'system',
                        content: args.input?.systemPrompt || '你是一个专业的数据提取助手，请输出 JSON 格式',
                    },
                    {
                        role: 'user',
                        content: typeof args.input === 'string' ? args.input : JSON.stringify(args.input),
                    },
                ],
            maxTokens: args.budget?.maxTokens ?? consumerBudget?.maxTokens ?? profile?.maxTokens ?? 2048,
            jsonMode: !!args.schema || profile?.jsonMode === true,
            temperature: args.input?.temperature ?? profile?.temperature ?? 0.3,
        };

        const maxLatencyMs = args.budget?.maxLatencyMs ?? consumerBudget?.maxLatencyMs;

        // 主 Provider 尝试
        const primaryResult = await this.tryProvider(
            resolved.providerId,
            llmReq,
            args.schema,
            args.consumer,
            args.taskId,
            maxLatencyMs,
        );

        if (primaryResult.ok) {
            const meta: LLMRunMeta = {
                requestId: record.requestId,
                providerId: resolved.providerId,
                model: resolved.model,
                capabilityKind: 'generation',
                queuedAt: record.queuedAt,
                startedAt: record.startedAt,
                finishedAt: Date.now(),
                latencyMs: Date.now() - (record.startedAt || record.queuedAt),
            };
            return { ok: true, data: primaryResult.data, meta };
        }

        // Fallback Provider
        if (resolved.fallbackProviderId) {
            const fallbackResult = await this.tryProvider(
                resolved.fallbackProviderId,
                llmReq,
                args.schema,
                args.consumer,
                args.taskId,
                maxLatencyMs,
            );
            if (fallbackResult.ok) {
                const meta: LLMRunMeta = {
                    requestId: record.requestId,
                    providerId: resolved.fallbackProviderId,
                    model: resolved.model,
                    capabilityKind: 'generation',
                    queuedAt: record.queuedAt,
                    startedAt: record.startedAt,
                    finishedAt: Date.now(),
                    latencyMs: Date.now() - (record.startedAt || record.queuedAt),
                    fallbackUsed: true,
                };
                return { ok: true, data: fallbackResult.data, meta };
            }
            return {
                ok: false,
                error: `主备 Provider 均失败: ${primaryResult.error} / ${fallbackResult.error}`,
                retryable: true,
                fallbackUsed: true,
                reasonCode: fallbackResult.reasonCode || primaryResult.reasonCode || 'unknown',
            };
        }

        return {
            ok: false,
            error: primaryResult.error || '未知错误',
            retryable: primaryResult.retryable,
            reasonCode: primaryResult.reasonCode,
        };
    }

    private async executeEmbed(args: EmbedArgs, record: RequestRecord): Promise<any> {
        let resolved;
        try {
            resolved = this.router.resolveRoute({
                consumer: args.consumer,
                taskKind: 'embedding',
                taskId: args.taskId,
                routeHint: args.routeHint ? { providerId: args.routeHint.provider, model: args.routeHint.model } : undefined,
            });
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }

        const provider = this.router.getProvider(resolved.providerId);
        if (!provider?.embed) {
            return { ok: false, error: '当前 Provider 不支持 embedding' };
        }

        try {
            const response = await provider.embed({ texts: args.texts });
            const meta: LLMRunMeta = {
                requestId: record.requestId,
                providerId: resolved.providerId,
                model: resolved.model,
                capabilityKind: 'embedding',
                queuedAt: record.queuedAt,
                startedAt: record.startedAt,
                finishedAt: Date.now(),
                latencyMs: Date.now() - (record.startedAt || record.queuedAt),
            };
            return { ok: true, vectors: response.embeddings, model: resolved.providerId, meta };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    private async executeRerank(args: RerankArgs, record: RequestRecord): Promise<any> {
        let resolved;
        try {
            resolved = this.router.resolveRoute({
                consumer: args.consumer,
                taskKind: 'rerank',
                taskId: args.taskId,
                routeHint: args.routeHint ? { providerId: args.routeHint.provider, model: args.routeHint.model } : undefined,
            });
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }

        const provider = this.router.getProvider(resolved.providerId);
        if (provider?.rerank) {
            try {
                const response = await provider.rerank({ query: args.query, docs: args.docs, topK: args.topK });
                const meta: LLMRunMeta = {
                    requestId: record.requestId,
                    providerId: resolved.providerId,
                    capabilityKind: 'rerank',
                    queuedAt: record.queuedAt,
                    startedAt: record.startedAt,
                    finishedAt: Date.now(),
                    latencyMs: Date.now() - (record.startedAt || record.queuedAt),
                };
                return { ok: true, results: response.results, provider: resolved.providerId, meta };
            } catch (error) {
                return { ok: false, error: (error as Error).message };
            }
        }

        // Provider 不支持 rerank：关键词覆盖率兜底
        const tokens = args.query
            .toLowerCase()
            .split(/[\s，。！？,.!?\n]+/)
            .map((token: string) => token.trim())
            .filter((token: string) => token.length > 1);

        const scored = args.docs.map((doc: string, index: number) => {
            const lower = doc.toLowerCase();
            let hit = 0;
            for (const token of tokens) {
                if (lower.includes(token)) hit += 1;
            }
            const score = tokens.length > 0 ? hit / tokens.length : 0;
            return { index, score, doc };
        });
        scored.sort((a, b) => b.score - a.score);
        return { ok: true, results: scored, provider: `${resolved.providerId}:fallback`, fallbackUsed: true };
    }

    /** 尝试单个 Provider 执行请求 */
    private async tryProvider(
        providerId: string,
        req: LLMRequest,
        schema: z.ZodType<any> | undefined,
        consumer: string,
        taskId: string,
        maxLatencyMs?: number,
    ): Promise<{ ok: boolean; data?: any; error?: string; retryable?: boolean; cost?: number; reasonCode?: string }> {
        try {
            const provider = this.router.getProvider(providerId);
            if (!provider) {
                return { ok: false, error: `Provider "${providerId}" 未找到`, retryable: false, reasonCode: 'provider_unavailable' };
            }

            const timeoutMs = maxLatencyMs ?? 30_000;
            const response = await Promise.race([
                provider.request(req),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`请求 Provider 超时 (>${timeoutMs}ms)`)), timeoutMs)),
            ]);

            let runtimeSchema = schema;
            if (taskId === 'world.template.build') {
                runtimeSchema = WorldTemplateSchema;
            } else if (taskId === 'memory.extract' || taskId === 'world.update' || taskId === 'memory.summarize') {
                runtimeSchema = ProposalEnvelopeSchema;
            }

            if (runtimeSchema) {
                const parsed = parseJsonOutput(response.content);
                if (!parsed.ok) {
                    this.budgetManager.recordFailure(consumer);
                    return { ok: false, error: `JSON 解析失败: ${parsed.error}`, retryable: true, reasonCode: 'invalid_json' };
                }

                const validation = validateZodSchema(parsed.data, runtimeSchema);
                if (!validation.valid) {
                    this.budgetManager.recordFailure(consumer);
                    return { ok: false, error: `Schema Zod 校验失败: ${validation.errors.join('; ')}`, retryable: true, reasonCode: 'schema_validation_failed' };
                }

                this.budgetManager.recordSuccess(consumer);
                return { ok: true, data: validation.data };
            }

            this.budgetManager.recordSuccess(consumer);
            return { ok: true, data: response.content };
        } catch (error) {
            this.budgetManager.recordFailure(consumer);
            const message = (error as Error).message;
            const reasonCode = inferReasonCode(message);
            const retryable = reasonCode === 'timeout' || reasonCode === 'rate_limited' || reasonCode === 'network_error';
            return { ok: false, error: message, retryable, reasonCode };
        }
    }

}

