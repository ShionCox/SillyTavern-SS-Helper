import type { LLMSDK } from '../../../SDK/stx';
import type { LLMRequest } from '../providers/types';
import { TaskRouter } from '../router/router';
import { BudgetManager } from '../budget/budget-manager';
import { parseJsonOutput, validateZodSchema, WorldTemplateSchema, ProposalEnvelopeSchema } from '../schema/validator';
import { ProfileManager } from '../profile/profile-manager';
import { inferReasonCode } from '../schema/error-codes';
import type { z } from 'zod';

type RunTaskFailure = {
    ok: false;
    error: string;
    retryable?: boolean;
    fallbackUsed?: boolean;
    reasonCode?: string;
};

/**
 * LLMSDK 门面层
 * 对外提供统一的任务调用能力，整合路由、预算、配置、校验、降级。
 */
export class LLMSDKImpl implements LLMSDK {
    private router: TaskRouter;
    private budgetManager: BudgetManager;
    private profileManager: ProfileManager;
    private globalProfileId: string;

    constructor(router: TaskRouter, budgetManager: BudgetManager) {
        this.router = router;
        this.budgetManager = budgetManager;
        this.profileManager = new ProfileManager();
        this.globalProfileId = 'balanced';
    }

    /**
     * 设置全局默认 profile。
     */
    setGlobalProfile(profileId: string): void {
        const profile = this.profileManager.get(profileId);
        if (!profile) {
            throw new Error(`Profile 不存在: ${profileId}`);
        }
        this.globalProfileId = profileId;
    }

    /**
     * 获取当前全局默认 profile。
     */
    getGlobalProfile(): string {
        return this.globalProfileId;
    }

    /**
     * 执行一个 AI 任务。
     */
    async runTask<T>(args: {
        consumer: string;
        task: string;
        input: any;
        schema?: z.ZodType<T> | any;
        routeHint?: { provider?: string; profile?: string };
        budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
    }): Promise<
        | { ok: true; data: T; meta: { provider: string; latencyMs: number; cost?: number } }
        | RunTaskFailure
    > {
        const budgetCheck = this.budgetManager.canRequest(args.consumer);
        if (!budgetCheck.allowed) {
            return {
                ok: false,
                error: budgetCheck.reason || '请求被限流/熔断',
                retryable: true,
                reasonCode: 'circuit_open',
            };
        }

        let resolved: ReturnType<TaskRouter['resolve']>;
        try {
            resolved = this.router.resolve(args.consumer, args.task, {
                providerId: args.routeHint?.provider,
            });
        } catch (error) {
            return {
                ok: false,
                error: (error as Error).message,
                retryable: false,
                reasonCode: 'provider_unavailable',
            };
        }

        const profileId = args.routeHint?.profile || resolved.profileId || this.globalProfileId;
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
        const startTs = Date.now();
        const primaryResult = await this.tryProvider(
            resolved.primary.id,
            llmReq,
            args.schema,
            args.consumer,
            args.task,
            maxLatencyMs
        );
        if (primaryResult.ok) {
            return {
                ok: true,
                data: primaryResult.data as T,
                meta: { provider: resolved.primary.id, latencyMs: Date.now() - startTs, cost: primaryResult.cost },
            };
        }

        if (resolved.fallback) {
            const fallbackStartTs = Date.now();
            const fallbackResult = await this.tryProvider(
                resolved.fallback.id,
                llmReq,
                args.schema,
                args.consumer,
                args.task,
                maxLatencyMs
            );
            if (fallbackResult.ok) {
                return {
                    ok: true,
                    data: fallbackResult.data as T,
                    meta: { provider: resolved.fallback.id, latencyMs: Date.now() - fallbackStartTs, cost: fallbackResult.cost },
                };
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

    /**
     * 尝试单个 Provider 执行请求。
     */
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

    /**
     * 向量化接口。
     */
    async embed(args: { consumer: string; texts: string[]; routeHint?: any }): Promise<any> {
        const { primary } = this.router.resolve(args.consumer, 'rag.embed', {
            providerId: args.routeHint?.provider,
        });
        if (!primary.embed) {
            return { ok: false, error: '当前 Provider 不支持 embedding' };
        }
        try {
            const response = await primary.embed({ texts: args.texts });
            return { ok: true, vectors: response.embeddings, model: primary.id };
        } catch (error) {
            return { ok: false, error: (error as Error).message };
        }
    }

    /**
     * 重排序接口（支持 provider 不具备 rerank 时的兜底算法）。
     */
    async rerank(args: { consumer: string; query: string; docs: string[]; routeHint?: any }): Promise<any> {
        const { primary } = this.router.resolve(args.consumer, 'rag.rerank', {
            providerId: args.routeHint?.provider,
        });
        if (primary.rerank) {
            try {
                const response = await primary.rerank({ query: args.query, docs: args.docs });
                return { ok: true, results: response.results, provider: primary.id };
            } catch (error) {
                return { ok: false, error: (error as Error).message };
            }
        }

        // Provider 不支持 rerank 时，使用关键词覆盖率兜底重排。
        const tokens = args.query
            .toLowerCase()
            .split(/[\s，。！？,.!?\n]+/)
            .map((token: string) => token.trim())
            .filter((token: string) => token.length > 1);

        const scored = args.docs.map((doc: string, index: number) => {
            const lower = doc.toLowerCase();
            let hit = 0;
            for (const token of tokens) {
                if (lower.includes(token)) {
                    hit += 1;
                }
            }
            const score = tokens.length > 0 ? hit / tokens.length : 0;
            return { index, score, doc };
        });
        scored.sort((a, b) => b.score - a.score);
        return { ok: true, results: scored, provider: `${primary.id}:fallback`, fallbackUsed: true };
    }
}

