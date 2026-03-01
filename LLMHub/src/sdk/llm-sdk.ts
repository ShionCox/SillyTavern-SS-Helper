import type { LLMSDK } from '../../../SDK/stx';
import type { LLMRequest } from '../providers/types';
import { TaskRouter } from '../router/router';
import { BudgetManager } from '../budget/budget-manager';
import { parseJsonOutput, validateZodSchema, WorldTemplateSchema, ProposalEnvelopeSchema } from '../schema/validator';
import type { z } from 'zod';

/**
 * LLMSDK 门面层 —— 对外接口一致的 AI 能力调用中心
 * 整合路由、预算、校验、重试和回退
 */
export class LLMSDKImpl implements LLMSDK {
    private router: TaskRouter;
    private budgetManager: BudgetManager;

    constructor(router: TaskRouter, budgetManager: BudgetManager) {
        this.router = router;
        this.budgetManager = budgetManager;
    }

    /**
     * 执行一个 AI 任务
     */
    async runTask<T>(args: {
        consumer: string;
        task: string;
        input: any;
        schema?: z.ZodType<T> | any; // 支持传入 Zod Schema 参数
        routeHint?: { provider?: string; profile?: string };
        budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
    }): Promise<
        | { ok: true; data: T; meta: { provider: string; latencyMs: number; cost?: number } }
        | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean }
    > {
        // 1. 检查预算/熔断
        const budgetCheck = this.budgetManager.canRequest(args.consumer);
        if (!budgetCheck.allowed) {
            return { ok: false, error: budgetCheck.reason || '请求被限流/熔断', retryable: true };
        }

        // 2. 路由解析
        let resolved;
        try {
            resolved = this.router.resolve(args.consumer, args.task);
        } catch (e) {
            return { ok: false, error: (e as Error).message, retryable: false };
        }

        const { primary, fallback } = resolved;

        // 3. 构造 LLM 请求
        const llmReq: LLMRequest = {
            messages: Array.isArray(args.input.messages) ? args.input.messages : [
                { role: 'system', content: args.input.systemPrompt || '你是一个专业的数据提取助手，请输出 JSON 格式' },
                { role: 'user', content: typeof args.input === 'string' ? args.input : JSON.stringify(args.input) },
            ],
            maxTokens: args.budget?.maxTokens ?? 2048,
            jsonMode: !!args.schema,
            temperature: args.input.temperature ?? 0.3,
        };

        // 执行请求（主 provider -> 备用 provider）
        const startTs = Date.now();

        // 尝试主 Provider
        const result = await this.tryProvider(primary.id, llmReq, args.schema, args.consumer, args.task, args.budget?.maxLatencyMs);
        if (result.ok) {
            return {
                ok: true,
                data: result.data as T,
                meta: { provider: primary.id, latencyMs: Date.now() - startTs, cost: result.cost },
            };
        }

        // 主 Provider 失败，尝试备用
        if (fallback) {
            const fallbackStartTs = Date.now();
            const fallbackResult = await this.tryProvider(fallback.id, llmReq, args.schema, args.consumer, args.task, args.budget?.maxLatencyMs);
            if (fallbackResult.ok) {
                return {
                    ok: true,
                    data: fallbackResult.data as T,
                    meta: { provider: fallback.id, latencyMs: Date.now() - fallbackStartTs, cost: fallbackResult.cost },
                };
            }
            return { ok: false, error: `主备 Provider 均失败: ${result.error} / ${fallbackResult.error}`, retryable: true, fallbackUsed: true };
        }

        return { ok: false, error: result.error || '未知错误', retryable: result.retryable };
    }

    /**
     * 尝试单个 Provider 执行请求
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
            const providers = this.router.getAllProviders();
            const provider = providers.find(p => p.id === providerId);
            if (!provider) {
                return { ok: false, error: `Provider "${providerId}" 未找到`, retryable: false, reasonCode: 'provider_not_found' };
            }

            // 超时控制
            const timeoutMs = maxLatencyMs ?? 30_000;
            const responsePromise = provider.request(req);

            // 构建一个超时触发器
            const timeoutPromise = new Promise<{ isTimeout: true }>((_, reject) =>
                setTimeout(() => reject(new Error(`请求 Provider超时 (>${timeoutMs}ms)`)), timeoutMs)
            );

            // 让两个进行赛跑，如果在超时前 responsePromise 返回，那么获得真实 response
            const response = await Promise.race([responsePromise, timeoutPromise]) as any;

            // Schema 校验：根据 taskId 自动绑定对应 Zod 防线
            let runtimeSchema = schema;
            if (taskId === 'world.template.build') {
                runtimeSchema = WorldTemplateSchema;
            } else if (
                taskId === 'memory.extract' ||
                taskId === 'world.update' ||
                taskId === 'memory.summarize'
            ) {
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
                    return { ok: false, error: `Schema Zod 校验失败: ${validation.errors.join('; ')}`, retryable: true, reasonCode: 'invalid_schema' };
                }

                this.budgetManager.recordSuccess(consumer);
                return { ok: true, data: validation.data };
            }

            // 不需要 Schema 校验，直接返回
            this.budgetManager.recordSuccess(consumer);
            return { ok: true, data: response.content };

        } catch (e) {
            this.budgetManager.recordFailure(consumer);
            const errorMsg = (e as Error).message;
            // 标准化 reasonCode（依照构建计划 §20.3）
            let reasonCode: string;
            if (errorMsg.includes('超时') || errorMsg.includes('timeout')) {
                reasonCode = 'timeout';
            } else if (errorMsg.includes('rate') || errorMsg.includes('429') || errorMsg.includes('限流')) {
                reasonCode = 'rate_limited';
            } else if (errorMsg.includes('auth') || errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('key')) {
                reasonCode = 'auth_failed';
            } else if (errorMsg.includes('JSON') || errorMsg.includes('json')) {
                reasonCode = 'invalid_json';
            } else {
                reasonCode = 'unknown';
            }
            const retryable = reasonCode === 'timeout' || reasonCode === 'rate_limited';
            return { ok: false, error: errorMsg, retryable, reasonCode };
        }
    }

    /**
     * 向量化接口
     */
    async embed(args: { consumer: string; texts: string[]; routeHint?: any }): Promise<any> {
        const { primary } = this.router.resolve(args.consumer, 'rag.embed');
        if (!primary.embed) {
            return { ok: false, error: '当前 Provider 不支持 embedding' };
        }
        return primary.embed({ texts: args.texts });
    }

    /**
     * 重排序接口
     */
    async rerank(args: { consumer: string; query: string; docs: string[]; routeHint?: any }): Promise<any> {
        const { primary } = this.router.resolve(args.consumer, 'rag.rerank');
        if (!primary.rerank) {
            return { ok: false, error: '当前 Provider 不支持 rerank' };
        }
        return primary.rerank({ query: args.query, docs: args.docs });
    }
}
