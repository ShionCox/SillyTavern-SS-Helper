import { Logger } from '../../../SDK/logger';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { LLMSDK, LLMRunResult } from '../../../SDK/stx';
import type { MemoryAiTaskId, MemoryAiTaskRecord } from './ai-health-types';
import {
    setLlmHubMounted,
    setConsumerRegistered,
    markTaskRunning,
    recordTaskResult,
    isAiOperational,
} from './ai-health-center';

const logger = new Logger('MemoryLlmBridge');

export const MEMORY_TASKS = {
    SUMMARIZE: 'memory.summarize',
    EXTRACT: 'memory.extract',
    TEMPLATE_BUILD: 'world.template.build',
    VECTOR_EMBED: 'memory.vector.embed',
    SEARCH_RERANK: 'memory.search.rerank',
} as const;

export type BridgeInitStatus = 'registered' | 'already_registered' | 'unavailable' | 'unsupported';

type GenerationBudget = {
    maxTokens?: number;
    maxLatencyMs?: number;
    maxCost?: number;
};

type EmbedBudget = {
    maxLatencyMs?: number;
};

const REGISTERED_LLM_INSTANCES: WeakSet<object> = new WeakSet<object>();

/**
 * 功能：判断当前 STX.llm 是否具备注册 consumer 的能力。
 */
function isRegistrableLlm(value: unknown): value is LLMSDK {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return typeof (value as LLMSDK).registerConsumer === 'function';
}

/**
 * 功能：向当前 LLMHub 实例注册 MemoryOS consumer，并按实例去重。
 */
function ensureRegistered(llm: LLMSDK): BridgeInitStatus {
    const llmInstance = llm as unknown as object;
    if (REGISTERED_LLM_INSTANCES.has(llmInstance)) {
        return 'already_registered';
    }

    llm.registerConsumer({
        pluginId: MEMORY_OS_PLUGIN_ID,
        displayName: 'Memory OS',
        registrationVersion: 2,
        tasks: [
            {
                taskId: MEMORY_TASKS.SUMMARIZE,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '对话摘要生成',
                backgroundEligible: true,
                recommendedDisplay: 'compact',
            },
            {
                taskId: MEMORY_TASKS.EXTRACT,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '结构化记忆提取',
                backgroundEligible: true,
                recommendedDisplay: 'compact',
            },
            {
                taskId: MEMORY_TASKS.TEMPLATE_BUILD,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '世界模板构建',
                recommendedDisplay: 'compact',
            },
            {
                taskId: MEMORY_TASKS.VECTOR_EMBED,
                taskKind: 'embedding',
                requiredCapabilities: ['embeddings'],
                description: '文本向量化',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.SEARCH_RERANK,
                taskKind: 'rerank',
                requiredCapabilities: ['rerank'],
                description: '混合检索重排序',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
        ],
    });

    REGISTERED_LLM_INSTANCES.add(llmInstance);
    setConsumerRegistered(true);
    logger.info('已向 LLMHub 注册 MemoryOS 消费方（5 个任务）');
    return 'registered';
}

/**
 * 功能：尝试把 MemoryOS 注册到当前可用的 LLMHub 实例。
 */
export function initBridge(): BridgeInitStatus {
    const llm = (window as any).STX?.llm as unknown;
    if (!llm) {
        setLlmHubMounted(false);
        return 'unavailable';
    }
    setLlmHubMounted(true);
    if (!isRegistrableLlm(llm)) {
        return 'unsupported';
    }
    return ensureRegistered(llm);
}

/**
 * 功能：获取当前可用的 LLMHub SDK，并确保已完成注册。
 */
function getLlm(): LLMSDK | null {
    const llm = (window as any).STX?.llm as unknown;
    if (!isRegistrableLlm(llm)) {
        return null;
    }
    void ensureRegistered(llm);
    return llm;
}

// ── 内部辅助：记录任务结果到健康中心 ──

function buildSuccessRecord(taskId: MemoryAiTaskId, startTs: number, note?: string): MemoryAiTaskRecord {
    return { taskId, ts: Date.now(), ok: true, durationMs: Date.now() - startTs, note };
}

function buildFailureRecord(
    taskId: MemoryAiTaskId,
    startTs: number,
    error: string,
    reasonCode?: string,
): MemoryAiTaskRecord {
    return { taskId, ts: Date.now(), ok: false, durationMs: Date.now() - startTs, error, reasonCode };
}

/**
 * 功能：检查 AI 模式是否启用。用于主动 LLM 调用前的统一守卫。
 * 只读诊断和已有记忆读取不受此限制。
 */
export function checkAiModeGuard(taskId: MemoryAiTaskId): LLMRunResult<never> | null {
    if (isAiOperational()) {
        return null; // 放行
    }
    const error = 'AI 模式未启用或 LLMHub 不可用';
    recordTaskResult(buildFailureRecord(taskId, Date.now(), error, 'ai_mode_disabled'));
    return { ok: false, error, reasonCode: 'ai_mode_disabled' };
}

/**
 * 功能：执行 generation 类任务，带统一状态追踪。
 */
export async function runGeneration<T>(
    taskId: string,
    input: unknown,
    budget?: GenerationBudget,
    schema?: object,
): Promise<LLMRunResult<T>> {
    const tid = taskId as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const llm = getLlm();
    if (!llm) {
        const record = buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable');
        recordTaskResult(record);
        return { ok: false, error: 'LLMHub 未就绪', reasonCode: 'provider_unavailable' };
    }

    try {
        const result = await llm.runTask<T>({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId,
            taskKind: 'generation',
            input,
            schema,
            budget,
            enqueue: {
                displayMode: 'compact',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID },
            },
        });

        if (result.ok) {
            recordTaskResult(buildSuccessRecord(tid, startTs));
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result.error, result.reasonCode));
        }
        return result;
    } catch (e: any) {
        const error = String(e?.message || e);
        recordTaskResult(buildFailureRecord(tid, startTs, error, 'exception'));
        return { ok: false, error, reasonCode: 'exception' };
    }
}

/**
 * 功能：执行 embedding 类任务，带统一状态追踪。
 */
export async function runEmbed(
    texts: string[],
    budget?: EmbedBudget,
): Promise<unknown> {
    void budget;
    const tid = MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const llm = getLlm();
    if (!llm) {
        recordTaskResult(buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable'));
        return { ok: false, error: 'LLMHub 未就绪' };
    }

    try {
        const result = await llm.embed({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId: MEMORY_TASKS.VECTOR_EMBED,
            texts,
            enqueue: {
                displayMode: 'silent',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID },
            },
        });

        if (result?.ok !== false) {
            recordTaskResult(buildSuccessRecord(tid, startTs));
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result?.error || 'embed 失败', result?.reasonCode));
        }
        return result;
    } catch (e: any) {
        const error = String(e?.message || e);
        recordTaskResult(buildFailureRecord(tid, startTs, error, 'exception'));
        return { ok: false, error };
    }
}

/**
 * 功能：执行 rerank 类任务，带统一状态追踪。
 */
export async function runRerank(
    query: string,
    docs: string[],
    topK?: number,
): Promise<unknown> {
    const tid = MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const llm = getLlm();
    if (!llm) {
        recordTaskResult(buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable'));
        return { ok: false, error: 'LLMHub 未就绪' };
    }

    try {
        const result = await llm.rerank({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId: MEMORY_TASKS.SEARCH_RERANK,
            query,
            docs,
            topK,
            enqueue: {
                displayMode: 'silent',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID },
            },
        });

        if (result?.ok !== false) {
            recordTaskResult(buildSuccessRecord(tid, startTs));
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result?.error || 'rerank 失败', result?.reasonCode));
        }
        return result;
    } catch (e: any) {
        const error = String(e?.message || e);
        recordTaskResult(buildFailureRecord(tid, startTs, error, 'exception'));
        return { ok: false, error };
    }
}
