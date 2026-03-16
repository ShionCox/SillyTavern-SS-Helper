import type { LLMRequest } from '../providers/types';
import { TaskRouter } from '../router/router';
import { BudgetManager } from '../budget/budget-manager';
import {
    parseJsonOutput,
    validateZodSchema,
    WorldTemplateSchema,
    ProposalEnvelopeSchema,
    normalizeProposalEnvelopeInput,
    normalizeWorldTemplateInput,
} from '../schema/validator';
import { ProfileManager } from '../profile/profile-manager';
import { inferReasonCode } from '../schema/error-codes';
import { RequestOrchestrator } from '../orchestrator/orchestrator';
import { DisplayController } from '../display/display-controller';
import { ConsumerRegistry } from '../registry/consumer-registry';
import { buildSdkChatKeyEvent } from '../../../SDK/tavern';
import type {
    LLMRunResult,
    LLMRunMeta,
    CapabilityKind,
    ConsumerRegistration,
    LLMInspectApi,
    OverlayPatch,
    RunTaskArgs,
    EmbedArgs,
    RerankArgs,
    RequestRecord,
    RequestEnqueueOptions,
    LLMRequestLogRequestSnapshot,
} from '../schema/types';
import type { ZodType } from 'zod';

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
    public inspect?: LLMInspectApi;

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
        this.orchestrator.setPendingDisplayCallback((record) => {
            this.displayController.openPendingOverlay(record);
        });
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

    private resolveTaskDescription(consumer: string, taskId: string, explicit?: string): string {
        const explicitText = String(explicit || '').trim();
        if (explicitText) {
            return explicitText;
        }
        const registered = this.registry.getTaskDescriptor(consumer, taskId)?.description;
        const registeredText = String(registered || '').trim();
        return registeredText || taskId;
    }

    private summarizeSchema(schema: unknown): string | undefined {
        if (!schema) return undefined;
        if (typeof schema === 'string') return schema;
        const value = schema as Record<string, unknown>;
        if (typeof value.description === 'string' && value.description.trim()) {
            return value.description.trim();
        }
        if (typeof value.name === 'string' && value.name.trim()) {
            return value.name.trim();
        }
        const ctorName = (schema as { constructor?: { name?: string } })?.constructor?.name;
        return ctorName && ctorName !== 'Object' ? ctorName : 'schema';
    }

    private buildRequestLogSnapshot(
        taskKind: CapabilityKind,
        taskDescription: string,
        args: RunTaskArgs | EmbedArgs | RerankArgs,
    ): LLMRequestLogRequestSnapshot {
        if (taskKind === 'embedding') {
            const embedArgs = args as EmbedArgs;
            return {
                taskKind,
                taskDescription,
                routeHint: embedArgs.routeHint,
                enqueue: embedArgs.enqueue,
                embeddingTexts: Array.isArray(embedArgs.texts) ? embedArgs.texts.slice() : [],
                metrics: { embeddingTextCount: Array.isArray(embedArgs.texts) ? embedArgs.texts.length : 0 },
            };
        }

        if (taskKind === 'rerank') {
            const rerankArgs = args as RerankArgs;
            return {
                taskKind,
                taskDescription,
                routeHint: rerankArgs.routeHint,
                enqueue: rerankArgs.enqueue,
                rerankQuery: rerankArgs.query,
                rerankDocs: Array.isArray(rerankArgs.docs) ? rerankArgs.docs.slice() : [],
                rerankTopK: rerankArgs.topK,
                metrics: { rerankDocCount: Array.isArray(rerankArgs.docs) ? rerankArgs.docs.length : 0 },
            };
        }

        const runArgs = args as RunTaskArgs;
        const messageCount = Array.isArray(runArgs.input?.messages) ? runArgs.input.messages.length : undefined;
        return {
            taskKind,
            taskDescription,
            routeHint: runArgs.routeHint,
            budget: runArgs.budget,
            enqueue: runArgs.enqueue,
            schemaSummary: this.summarizeSchema(runArgs.schema),
            generationInput: runArgs.input,
            metrics: { messageCount },
        };
    }

    /**
     * 执行 AI 任务。
     * 只等待 AI 结果返回，不等待展示关闭。
     */
    async runTask<T>(args: RunTaskArgs<T>): Promise<LLMRunResult<T>> {
        const taskKind: CapabilityKind = args.taskKind;
        const taskDescription = this.resolveTaskDescription(args.consumer, args.taskId, args.taskDescription);

        const record = this.orchestrator.enqueue<T>(
            args.consumer,
            args.taskId,
            taskKind,
            {
                ...args.enqueue,
                displayMode: args.enqueue?.displayMode || (taskKind === 'generation' ? 'fullscreen' : 'silent'),
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
            args,
        );
        record.taskDescription = taskDescription;
        record.chatKey = buildSdkChatKeyEvent();
        record.requestLogSnapshot = this.buildRequestLogSnapshot(taskKind, taskDescription, args);

        // 将执行参数附到 record 上供 executeCallback 使用
        return record.resultPromise;
    }

    /**
     * 向量化接口。
     * AI 结果返回时立即完成。
     */
    async embed(args: EmbedArgs): Promise<any> {
        const taskDescription = this.resolveTaskDescription(args.consumer, args.taskId, args.taskDescription);
        const record = this.orchestrator.enqueue(
            args.consumer,
            args.taskId,
            'embedding',
            {
                ...args.enqueue,
                displayMode: 'silent',
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
            args,
        );
        record.taskDescription = taskDescription;
        record.chatKey = buildSdkChatKeyEvent();
        record.requestLogSnapshot = this.buildRequestLogSnapshot('embedding', taskDescription, args);

        return record.resultPromise;
    }

    /**
     * 重排序接口。
     * AI 结果返回时立即完成。
     */
    async rerank(args: RerankArgs): Promise<any> {
        const taskDescription = this.resolveTaskDescription(args.consumer, args.taskId, args.taskDescription);
        const record = this.orchestrator.enqueue(
            args.consumer,
            args.taskId,
            'rerank',
            {
                ...args.enqueue,
                displayMode: 'silent',
                scope: args.enqueue?.scope || { pluginId: args.consumer },
            },
            args,
        );
        record.taskDescription = taskDescription;
        record.chatKey = buildSdkChatKeyEvent();
        record.requestLogSnapshot = this.buildRequestLogSnapshot('rerank', taskDescription, args);

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
        const args = record.requestArgs;
        if (!args) {
            return { ok: false, error: '请求参数缺失', reasonCode: 'unknown' };
        }

        switch (record.taskKind) {
            case 'generation':
                if (!this.isGenerationArgs(args)) {
                    return { ok: false, error: 'generation 请求参数不合法', reasonCode: 'unknown' };
                }
                return this.executeGeneration(args, record);
            case 'embedding':
                if (!this.isEmbedArgs(args)) {
                    return { ok: false, error: 'embedding 请求参数不合法', reasonCode: 'unknown' };
                }
                return this.executeEmbed(args, record);
            case 'rerank':
                if (!this.isRerankArgs(args)) {
                    return { ok: false, error: 'rerank 请求参数不合法', reasonCode: 'unknown' };
                }
                return this.executeRerank(args, record);
            default:
                return { ok: false, error: `未知任务类型: ${record.taskKind}`, reasonCode: 'unknown' };
        }
    }

    private hasBaseRequestArgs(args: unknown): args is { consumer: string; taskId: string } {
        if (!args || typeof args !== 'object') {
            return false;
        }

        const value = args as Record<string, unknown>;
        return typeof value.consumer === 'string' && typeof value.taskId === 'string';
    }

    private isGenerationArgs(args: unknown): args is RunTaskArgs {
        if (!this.hasBaseRequestArgs(args)) {
            return false;
        }

        const value = args as Record<string, unknown>;
        return typeof value.taskKind === 'string' && 'input' in value;
    }

    private isEmbedArgs(args: unknown): args is EmbedArgs {
        if (!this.hasBaseRequestArgs(args)) {
            return false;
        }

        const value = args as Record<string, unknown>;
        return Array.isArray(value.texts) && value.texts.every((text) => typeof text === 'string');
    }

    private isRerankArgs(args: unknown): args is RerankArgs {
        if (!this.hasBaseRequestArgs(args)) {
            return false;
        }

        const value = args as Record<string, unknown>;
        return typeof value.query === 'string'
            && Array.isArray(value.docs)
            && value.docs.every((doc) => typeof doc === 'string');
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
                    resourceId: args.routeHint.resource,
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

        const runtimeSchema = args.taskId === 'world.template.build'
            ? WorldTemplateSchema
            : (args.taskId === 'memory.extract' || args.taskId === 'world.update' || args.taskId === 'memory.summarize')
                ? ProposalEnvelopeSchema
                : args.schema;

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
            model: resolved.model,
            maxTokens: args.budget?.maxTokens ?? consumerBudget?.maxTokens ?? profile?.maxTokens ?? 2048,
            jsonMode: !!runtimeSchema || profile?.jsonMode === true,
            temperature: args.input?.temperature ?? profile?.temperature ?? 0.3,
        };

        const maxLatencyMs = args.budget?.maxLatencyMs ?? consumerBudget?.maxLatencyMs;

        // 主 Provider 尝试
        const primaryResult = await this.tryProvider(
            resolved.resourceId,
            llmReq,
            runtimeSchema,
            args.consumer,
            args.taskId,
            maxLatencyMs,
        );

        this.attachRecordDebug(record, primaryResult);

        if (primaryResult.ok) {
            const meta: LLMRunMeta = {
                requestId: record.requestId,
                resourceId: resolved.resourceId,
                model: resolved.model,
                capabilityKind: 'generation',
                queuedAt: record.queuedAt,
                startedAt: record.startedAt,
                finishedAt: Date.now(),
                latencyMs: Date.now() - (record.startedAt || record.queuedAt),
            };
            return { ok: true, data: primaryResult.data, meta };
        }

        // Fallback: 资源不可用
        if (resolved.fallbackResourceId) {
            const fallbackResult = await this.tryProvider(
                resolved.fallbackResourceId,
                llmReq,
                runtimeSchema,
                args.consumer,
                args.taskId,
                maxLatencyMs,
            );
            this.attachRecordDebug(record, fallbackResult);
            if (fallbackResult.ok) {
                const meta: LLMRunMeta = {
                    requestId: record.requestId,
                    resourceId: resolved.fallbackResourceId,
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
                error: `主备资源均失败: ${primaryResult.error} / ${fallbackResult.error}`,
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

    private attachRecordDebug(record: RequestRecord, result: {
        rawResponseText?: string;
        parsedResponse?: unknown;
        normalizedResponse?: unknown;
        validationErrors?: string[];
        error?: string;
        reasonCode?: string;
    }): void {
        const hasDebug = result.rawResponseText != null
            || result.parsedResponse !== undefined
            || result.normalizedResponse !== undefined
            || (Array.isArray(result.validationErrors) && result.validationErrors.length > 0)
            || result.error;
        if (!hasDebug) return;

        record.debug = {
            rawResponseText: result.rawResponseText,
            parsedResponse: result.parsedResponse,
            normalizedResponse: result.normalizedResponse,
            validationErrors: result.validationErrors,
            finalError: result.error,
            reasonCode: result.reasonCode,
        };
    }

    private async executeEmbed(args: EmbedArgs, record: RequestRecord): Promise<any> {
        let resolved;
        try {
            resolved = this.router.resolveRoute({
                consumer: args.consumer,
                taskKind: 'embedding',
                taskId: args.taskId,
                requiredCapabilities: ['embeddings'],
                routeHint: args.routeHint ? { resourceId: args.routeHint.resource, model: args.routeHint.model } : undefined,
            });
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }

        const provider = this.router.getProvider(resolved.resourceId);
        if (!provider?.embed) {
            return { ok: false, error: '当前资源不支持 embedding' };
        }

        try {
            const response = await provider.embed({ texts: args.texts, model: resolved.model });
            const meta: LLMRunMeta = {
                requestId: record.requestId,
                resourceId: resolved.resourceId,
                model: resolved.model,
                capabilityKind: 'embedding',
                queuedAt: record.queuedAt,
                startedAt: record.startedAt,
                finishedAt: Date.now(),
                latencyMs: Date.now() - (record.startedAt || record.queuedAt),
            };
            return { ok: true, vectors: response.embeddings, model: resolved.model, meta };
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
                requiredCapabilities: ['rerank'],
                routeHint: args.routeHint ? { resourceId: args.routeHint.resource, model: args.routeHint.model } : undefined,
            });
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }

        const provider = this.router.getProvider(resolved.resourceId);
        if (provider?.rerank) {
            try {
                const response = await provider.rerank({
                    query: args.query,
                    docs: args.docs,
                    topK: args.topK,
                    model: resolved.model,
                });
                const meta: LLMRunMeta = {
                    requestId: record.requestId,
                    resourceId: resolved.resourceId,
                    model: resolved.model,
                    capabilityKind: 'rerank',
                    queuedAt: record.queuedAt,
                    startedAt: record.startedAt,
                    finishedAt: Date.now(),
                    latencyMs: Date.now() - (record.startedAt || record.queuedAt),
                };
                return { ok: true, results: response.results, resource: resolved.resourceId, meta };
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
        return { ok: true, results: scored, resource: `${resolved.resourceId}:fallback`, fallbackUsed: true };
    }

    /** 尝试单个资源执行请求 */
    private async tryProvider(
        resourceId: string,
        req: LLMRequest,
        schema: ZodType<any> | undefined,
        consumer: string,
        taskId: string,
        maxLatencyMs?: number,
    ): Promise<{
        ok: boolean;
        data?: any;
        error?: string;
        retryable?: boolean;
        cost?: number;
        reasonCode?: string;
        rawResponseText?: string;
        parsedResponse?: unknown;
        normalizedResponse?: unknown;
        validationErrors?: string[];
    }> {
        try {
            const provider = this.router.getProvider(resourceId);
            if (!provider) {
                return { ok: false, error: `资源 "${resourceId}" 未找到`, retryable: false, reasonCode: 'provider_unavailable' };
            }

            const timeoutMs = Number(maxLatencyMs);
            const response = Number.isFinite(timeoutMs) && timeoutMs > 0
                ? await Promise.race([
                    provider.request(req),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`请求 Provider 超时 (>${timeoutMs}ms)`)), timeoutMs)),
                ])
                : await provider.request(req);

            const runtimeSchema = schema;

            if (runtimeSchema) {
                const parsed = parseJsonOutput(response.content);
                if (!parsed.ok) {
                    this.budgetManager.recordFailure(consumer);
                    return {
                        ok: false,
                        error: `JSON 解析失败: ${parsed.error}`,
                        retryable: true,
                        reasonCode: 'invalid_json',
                        rawResponseText: response.content,
                    };
                }

                const normalizedInput = taskId === 'memory.extract' || taskId === 'world.update' || taskId === 'memory.summarize'
                    ? normalizeProposalEnvelopeInput(parsed.data)
                    : taskId === 'world.template.build'
                        ? normalizeWorldTemplateInput(parsed.data)
                        : parsed.data;

                const validation = validateZodSchema(normalizedInput, runtimeSchema);
                if (!validation.valid) {
                    this.budgetManager.recordFailure(consumer);
                    return {
                        ok: false,
                        error: `Schema Zod 校验失败: ${validation.errors.join('; ')}`,
                        retryable: true,
                        reasonCode: 'schema_validation_failed',
                        rawResponseText: response.content,
                        parsedResponse: parsed.data,
                        normalizedResponse: normalizedInput,
                        validationErrors: validation.errors,
                    };
                }

                this.budgetManager.recordSuccess(consumer);
                return {
                    ok: true,
                    data: validation.data,
                    rawResponseText: response.content,
                    parsedResponse: parsed.data,
                    normalizedResponse: normalizedInput,
                };
            }

            this.budgetManager.recordSuccess(consumer);
            return { ok: true, data: response.content, rawResponseText: response.content };
        } catch (error) {
            this.budgetManager.recordFailure(consumer);
            const message = (error as Error).message;
            const reasonCode = inferReasonCode(message);
            const retryable = reasonCode === 'timeout' || reasonCode === 'rate_limited' || reasonCode === 'network_error';
            return { ok: false, error: message, retryable, reasonCode };
        }
    }

}
