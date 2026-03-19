import { Logger } from '../../../SDK/logger';
import type {
    LLMSDK,
    LLMRunResult,
    LLMTaskLifecycleEvent,
    TaskPresentationConfig,
    TaskSurfaceMode,
    TaskVisualState,
} from '../../../SDK/stx';
import { enqueueTaskPresentation, finishTaskPresentation, updateTaskPresentation } from '../../../_Components/sharedTaskSurface';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type { MemoryAiTaskId, MemoryAiTaskRecord } from './ai-health-types';
import { resolveMemoryTaskPresentationConfig } from './task-presentation-settings';
import {
    setLlmHubMounted,
    setConsumerRegistered,
    markTaskRunning,
    recordTaskResult,
    isAiOperational,
} from './ai-health-center';

const logger = new Logger('MemoryLlmBridge');

export const MEMORY_TASKS = {
    COLDSTART_SUMMARIZE: 'memory.coldstart.summarize',
    SUMMARIZE: 'memory.summarize',
    EXTRACT: 'memory.extract',
    TEMPLATE_BUILD: 'world.template.build',
    VECTOR_EMBED: 'memory.vector.embed',
    SEARCH_RERANK: 'memory.search.rerank',
} as const;

export type BridgeInitStatus = 'registered' | 'already_registered' | 'unavailable' | 'unsupported';

export interface TaskPresentationOverride {
    surfaceMode?: TaskSurfaceMode;
    disableComposer?: boolean;
    showToast?: boolean;
    title?: string;
    subtitle?: string;
    description?: string;
    queueLabel?: string;
    dedupeVisualKey?: string;
    autoCloseMs?: number;
    errorHoldMs?: number;
}

type GenerationBudget = {
    maxTokens?: number;
    maxLatencyMs?: number;
    maxCost?: number;
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
};

type EmbedBudget = {
    maxLatencyMs?: number;
    showOverlay?: boolean;
    overlayDescription?: string;
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
};

type RerankBudget = {
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
};

type GenerationInputMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type GenerationInputPayload = {
    messages?: GenerationInputMessage[];
    systemPrompt?: string;
    temperature?: number;
    [key: string]: unknown;
};

const CHINESE_OUTPUT_INSTRUCTION = '所有自然语言输出都必须使用简体中文。除 JSON 键名、枚举值和必要的英文结构标识外，不要输出英文说明句子。';

export interface EmbedTaskResult {
    ok: boolean;
    vectors?: number[][];
    error?: string;
    model?: string;
    reasonCode?: string;
    meta?: {
        requestId?: string;
        resourceId?: string;
        model?: string;
    };
}

export interface RerankTaskResultItem {
    index: number;
    score: number;
    doc: string;
}

export interface RerankTaskResult {
    ok: boolean;
    results?: RerankTaskResultItem[];
    error?: string;
    resource?: string;
    fallbackUsed?: boolean;
    reasonCode?: string;
    meta?: {
        requestId?: string;
        resourceId?: string;
        model?: string;
    };
}

const REGISTERED_LLM_INSTANCES: WeakSet<object> = new WeakSet<object>();

/**
 * 功能：判断输入是否为可规范化的 generation 载荷。
 * @param value 待判断的值。
 * @returns 是否匹配 generation 载荷结构。
 */
function isGenerationInputPayload(value: unknown): value is GenerationInputPayload {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：把 generation 输入补上中文输出约束。
 * @param input 原始输入。
 * @returns 规范化后的输入。
 */
function normalizeGenerationInput(input: unknown): unknown {
    if (!isGenerationInputPayload(input)) {
        return input;
    }

    const normalized: GenerationInputPayload = { ...input };
    const normalizedMessages = Array.isArray(input.messages)
        ? input.messages.map((message: GenerationInputMessage): GenerationInputMessage => ({ ...message }))
        : null;

    if (normalizedMessages && normalizedMessages.length > 0) {
        const firstSystemIndex = normalizedMessages.findIndex((message: GenerationInputMessage): boolean => message.role === 'system');
        if (firstSystemIndex >= 0) {
            normalizedMessages[firstSystemIndex] = {
                ...normalizedMessages[firstSystemIndex],
                content: `${normalizedMessages[firstSystemIndex].content}\n${CHINESE_OUTPUT_INSTRUCTION}`,
            };
        } else {
            normalizedMessages.unshift({ role: 'system', content: CHINESE_OUTPUT_INSTRUCTION });
        }
        normalized.messages = normalizedMessages;
        return normalized;
    }

    const systemPrompt = String(input.systemPrompt || '').trim();
    normalized.systemPrompt = systemPrompt
        ? `${systemPrompt}\n${CHINESE_OUTPUT_INSTRUCTION}`
        : CHINESE_OUTPUT_INSTRUCTION;
    return normalized;
}

/**
 * 功能：判断当前 STX.llm 是否支持注册 consumer。
 * @param value 待判断的值。
 * @returns 是否为可注册的 LLM SDK。
 */
function isRegistrableLlm(value: unknown): value is LLMSDK {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return typeof (value as LLMSDK).registerConsumer === 'function';
}

/**
 * 功能：把任务标识转换为中文标题。
 * @param taskId 任务标识。
 * @returns 中文标题。
 */
function getDefaultTaskTitle(taskId: MemoryAiTaskId): string {
    switch (taskId) {
        case MEMORY_TASKS.COLDSTART_SUMMARIZE:
            return '冷启动摘要';
        case MEMORY_TASKS.SUMMARIZE:
            return '记忆摘要';
        case MEMORY_TASKS.EXTRACT:
            return '记忆提取';
        case MEMORY_TASKS.TEMPLATE_BUILD:
            return '世界模板构建';
        case MEMORY_TASKS.VECTOR_EMBED:
            return '向量处理';
        case MEMORY_TASKS.SEARCH_RERANK:
            return '记忆重排';
        default:
            return taskId;
    }
}

/**
 * 功能：构建运行中的任务说明。
 * @param taskId 任务标识。
 * @param taskDescription 调用端传入的任务描述。
 * @returns 中文说明。
 */
function getRunningDescription(taskId: MemoryAiTaskId, taskDescription?: string): string {
    const trimmed = String(taskDescription || '').trim();
    if (trimmed) {
        return trimmed;
    }
    switch (taskId) {
        case MEMORY_TASKS.COLDSTART_SUMMARIZE:
            return '正在生成冷启动角色卡与世界观总结。';
        case MEMORY_TASKS.SUMMARIZE:
            return '正在生成最近对话的摘要。';
        case MEMORY_TASKS.EXTRACT:
            return '正在抽取事实、关系和可写入的记忆。';
        case MEMORY_TASKS.TEMPLATE_BUILD:
            return '正在构建当前聊天可用的世界模板，请稍候。';
        case MEMORY_TASKS.VECTOR_EMBED:
            return '正在写入或查询向量索引。';
        case MEMORY_TASKS.SEARCH_RERANK:
            return '正在重排召回候选，准备更相关的记忆。';
        default:
            return 'AI 正在处理任务，请稍候。';
    }
}

/**
 * 功能：构建成功记录。
 * @param taskId 任务标识。
 * @param startTs 开始时间。
 * @param note 可选说明。
 * @returns 成功记录。
 */
function buildSuccessRecord(taskId: MemoryAiTaskId, startTs: number, note?: string): MemoryAiTaskRecord {
    return { taskId, ts: Date.now(), ok: true, durationMs: Date.now() - startTs, note };
}

/**
 * 功能：构建失败记录。
 * @param taskId 任务标识。
 * @param startTs 开始时间。
 * @param error 错误信息。
 * @param reasonCode 原因码。
 * @returns 失败记录。
 */
function buildFailureRecord(
    taskId: MemoryAiTaskId,
    startTs: number,
    error: string,
    reasonCode?: string,
): MemoryAiTaskRecord {
    return { taskId, ts: Date.now(), ok: false, durationMs: Date.now() - startTs, error, reasonCode };
}

/**
 * 功能：向当前 LLMHub 实例注册 MemoryOS consumer。
 * @param llm LLM SDK 实例。
 * @returns 注册结果。
 */
function ensureRegistered(llm: LLMSDK): BridgeInitStatus {
    const llmInstance = llm as unknown as object;
    if (REGISTERED_LLM_INSTANCES.has(llmInstance)) {
        return 'already_registered';
    }

    llm.registerConsumer({
        pluginId: MEMORY_OS_PLUGIN_ID,
        displayName: 'Memory OS',
        registrationVersion: 3,
        tasks: [
            {
                taskId: MEMORY_TASKS.COLDSTART_SUMMARIZE,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '冷启动角色卡与世界观总结',
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.SUMMARIZE,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '对话摘要生成',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.EXTRACT,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '结构化记忆提取',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.TEMPLATE_BUILD,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '世界模板构建',
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.VECTOR_EMBED,
                taskKind: 'embedding',
                requiredCapabilities: ['embeddings'],
                description: '文本向量处理',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
            {
                taskId: MEMORY_TASKS.SEARCH_RERANK,
                taskKind: 'rerank',
                requiredCapabilities: ['rerank'],
                description: '召回结果重排',
                backgroundEligible: true,
                recommendedDisplay: 'silent',
            },
        ],
    });

    REGISTERED_LLM_INSTANCES.add(llmInstance);
    setConsumerRegistered(true);
    logger.info('已向 LLMHub 注册 MemoryOS consumer');
    return 'registered';
}

/**
 * 功能：尝试把 MemoryOS 注册到当前可用的 LLMHub。
 * @returns 初始化结果。
 */
export function initBridge(): BridgeInitStatus {
    const llm = (window as unknown as { STX?: { llm?: unknown } }).STX?.llm as unknown;
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
 * 功能：获取可用的 LLM SDK，并确保已完成注册。
 * @returns SDK 实例或空值。
 */
function getLlm(): LLMSDK | null {
    const llm = (window as unknown as { STX?: { llm?: unknown } }).STX?.llm as unknown;
    if (!isRegistrableLlm(llm)) {
        return null;
    }
    void ensureRegistered(llm);
    return llm;
}

/**
 * 功能：创建统一任务展示配置。
 * @param taskId 任务标识。
 * @param override 展示覆盖项。
 * @param fallbackDescription 默认说明。
 * @returns 任务展示配置。
 */
function buildPresentationConfig(
    taskId: MemoryAiTaskId,
    override: TaskPresentationOverride | undefined,
    fallbackDescription: string,
): TaskPresentationConfig {
    return resolveMemoryTaskPresentationConfig({
        taskId,
        title: override?.title || getDefaultTaskTitle(taskId),
        subtitle: override?.subtitle,
        description: override?.description || fallbackDescription,
        queueLabel: override?.queueLabel || getDefaultTaskTitle(taskId),
        dedupeVisualKey: override?.dedupeVisualKey,
        surfaceMode: override?.surfaceMode,
        disableComposer: override?.disableComposer,
        showToast: override?.showToast,
        autoCloseMs: override?.autoCloseMs,
        errorHoldMs: override?.errorHoldMs,
        meta: {
            autoCloseMs: override?.autoCloseMs,
            errorHoldMs: override?.errorHoldMs,
        },
    });
}

/**
 * 功能：启动任务展示，并返回请求标识。
 * @param taskId 任务标识。
 * @param override 展示覆盖项。
 * @param fallbackDescription 默认说明。
 * @returns 请求标识；如果不需要展示则返回空值。
 */
function startTaskPresentation(
    taskId: MemoryAiTaskId,
    override: TaskPresentationOverride | undefined,
    fallbackDescription: string,
): string | null {
    const config = buildPresentationConfig(taskId, override, fallbackDescription);
    const shouldShow = config.surfaceMode !== 'toast_background' || config.showToast === true;
    if (!shouldShow) {
        return null;
    }
    return enqueueTaskPresentation({
        ...config,
        state: 'running',
    });
}

/**
 * 功能：更新任务展示内容。
 * @param requestId 请求标识。
 * @param patch 更新补丁。
 * @returns 无返回值。
 */
function patchTaskPresentation(
    requestId: string | null,
    patch: {
        title?: string;
        subtitle?: string;
        description?: string;
        source?: string;
        state?: TaskVisualState;
        progress?: number;
        queueLabel?: string;
        reason?: string;
        showToast?: boolean;
        disableComposer?: boolean;
        meta?: Record<string, unknown>;
    },
): void {
    if (!requestId) {
        return;
    }
    updateTaskPresentation(requestId, patch);
}

function formatLifecycleSource(event: LLMTaskLifecycleEvent): string | undefined {
    const resourceText = String(event.resourceId || '').trim();
    const modelText = String(event.model || '').trim();
    if (resourceText && modelText) {
        return `${resourceText} · ${modelText}`;
    }
    return resourceText || modelText || undefined;
}

function applyLifecyclePresentation(requestId: string | null, event: LLMTaskLifecycleEvent): void {
    if (!requestId) {
        return;
    }

    switch (event.stage) {
        case 'queued':
            patchTaskPresentation(requestId, {
                state: 'pending',
                subtitle: '已进入队列',
                description: event.message,
                progress: event.progress,
                meta: { lifecycleStage: event.stage, lifecycleTs: event.ts },
            });
            return;
        case 'running':
            patchTaskPresentation(requestId, {
                state: 'running',
                subtitle: '正在执行',
                description: event.message,
                progress: event.progress,
                meta: { lifecycleStage: event.stage, lifecycleTs: event.ts },
            });
            return;
        case 'route_resolved':
            patchTaskPresentation(requestId, {
                state: 'running',
                subtitle: '已选择模型',
                description: event.message,
                source: formatLifecycleSource(event),
                progress: event.progress,
                meta: {
                    lifecycleStage: event.stage,
                    lifecycleTs: event.ts,
                    resourceId: event.resourceId,
                    model: event.model,
                },
            });
            return;
        case 'provider_requesting':
            patchTaskPresentation(requestId, {
                state: event.taskKind === 'generation' ? 'streaming' : 'running',
                subtitle: event.fallbackUsed ? '备用资源处理中' : '模型处理中',
                description: event.message,
                source: formatLifecycleSource(event),
                progress: event.progress,
                meta: {
                    lifecycleStage: event.stage,
                    lifecycleTs: event.ts,
                    resourceId: event.resourceId,
                    model: event.model,
                    fallbackUsed: event.fallbackUsed,
                },
            });
            return;
        case 'fallback_started':
            patchTaskPresentation(requestId, {
                state: 'running',
                subtitle: '切换备用资源',
                description: event.message,
                source: formatLifecycleSource(event),
                progress: event.progress,
                meta: {
                    lifecycleStage: event.stage,
                    lifecycleTs: event.ts,
                    resourceId: event.resourceId,
                    model: event.model,
                    fallbackUsed: true,
                },
            });
            return;
        case 'completed':
            patchTaskPresentation(requestId, {
                source: formatLifecycleSource(event),
                progress: event.progress,
                reason: event.fallbackUsed ? 'fallback_completed' : 'completed',
                meta: {
                    lifecycleStage: event.stage,
                    lifecycleTs: event.ts,
                    resourceId: event.resourceId,
                    model: event.model,
                    fallbackUsed: event.fallbackUsed,
                },
            });
            return;
        case 'failed':
            patchTaskPresentation(requestId, {
                state: 'error',
                subtitle: '执行失败',
                description: event.error || event.message,
                source: formatLifecycleSource(event),
                reason: event.reasonCode || 'failed',
                meta: {
                    lifecycleStage: event.stage,
                    lifecycleTs: event.ts,
                    resourceId: event.resourceId,
                    model: event.model,
                    fallbackUsed: event.fallbackUsed,
                    reasonCode: event.reasonCode,
                },
            });
            return;
        default:
            return;
    }
}

/**
 * 功能：结束任务展示。
 * @param requestId 请求标识。
 * @param finalState 最终状态。
 * @param description 收尾说明。
 * @returns 无返回值。
 */
function endTaskPresentation(
    requestId: string | null,
    finalState: 'done' | 'error',
    description: string,
): void {
    if (!requestId) {
        return;
    }
    finishTaskPresentation(requestId, finalState, {
        description,
        state: finalState,
    });
}

/**
 * 功能：检查 AI 模式守卫。
 * @param taskId 任务标识。
 * @returns 若不可运行则返回失败结果，否则返回空值。
 */
export function checkAiModeGuard(taskId: MemoryAiTaskId): LLMRunResult<never> | null {
    if (isAiOperational()) {
        return null;
    }
    const error = 'AI 模式未启用或 LLMHub 不可用';
    recordTaskResult(buildFailureRecord(taskId, Date.now(), error, 'ai_mode_disabled'));
    return { ok: false, error, reasonCode: 'ai_mode_disabled' };
}

/**
 * 功能：执行 generation 任务，并接入统一任务展示。
 * @param taskId 任务标识。
 * @param input 输入载荷。
 * @param budget 预算与展示配置。
 * @param schema 可选模式约束。
 * @param taskDescription 自定义任务说明。
 * @returns generation 结果。
 */
export async function runGeneration<T>(
    taskId: string,
    input: unknown,
    budget?: GenerationBudget,
    schema?: object,
    taskDescription?: string,
): Promise<LLMRunResult<T>> {
    const tid = taskId as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const requestId = startTaskPresentation(
        tid,
        budget?.taskPresentation,
        getRunningDescription(tid, taskDescription),
    );

    const guardResult = checkAiModeGuard(tid);
    if (guardResult && !guardResult.ok) {
        logger.warn('[ColdStart][RunGenerationBlocked]', {
            taskId,
            reasonCode: guardResult.reasonCode,
            error: guardResult.error,
            hasTaskPresentation: Boolean(budget?.taskPresentation),
        });
        endTaskPresentation(requestId, 'error', guardResult.error || 'AI 模式未启用或 LLMHub 不可用');
        return guardResult;
    }

    const llm = getLlm();
    if (!llm) {
        const record = buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable');
        recordTaskResult(record);
        logger.warn('[ColdStart][RunGenerationUnavailable]', {
            taskId,
            reasonCode: 'provider_unavailable',
            hasTaskPresentation: Boolean(budget?.taskPresentation),
        });
        endTaskPresentation(requestId, 'error', 'LLMHub 未就绪');
        return { ok: false, error: 'LLMHub 未就绪', reasonCode: 'provider_unavailable' };
    }

    try {
        const normalizedInput = normalizeGenerationInput(input);
        const result = await llm.runTask<T>({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId,
            taskDescription: String(taskDescription || '').trim() || undefined,
            taskKind: 'generation',
            input: normalizedInput,
            schema,
            budget: {
                maxTokens: budget?.maxTokens,
                maxLatencyMs: budget?.maxLatencyMs,
                maxCost: budget?.maxCost,
            },
            enqueue: {
                displayMode: 'silent',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID, chatKey: budget?.chatKey },
            },
            onLifecycle: (event): void => {
                applyLifecyclePresentation(requestId, event);
            },
        });

        if (result.ok) {
            recordTaskResult(buildSuccessRecord(tid, startTs));
            patchTaskPresentation(requestId, {
                reason: 'success',
            });
            endTaskPresentation(requestId, 'done', '任务已完成。');
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result.error, result.reasonCode));
            endTaskPresentation(requestId, 'error', result.error || '任务失败');
        }
        return result;
    } catch (error: unknown) {
        const message = String((error as Error)?.message || error);
        recordTaskResult(buildFailureRecord(tid, startTs, message, 'exception'));
        endTaskPresentation(requestId, 'error', message);
        return { ok: false, error: message, reasonCode: 'exception' };
    }
}

/**
 * 功能：执行 embedding 任务，并按场景决定是否展示任务卡。
 * @param texts 待向量化文本。
 * @param budget 预算与展示配置。
 * @returns embedding 结果。
 */
export async function runEmbed(
    texts: string[],
    budget?: EmbedBudget,
): Promise<EmbedTaskResult> {
    const tid = MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const llm = getLlm();
    if (!llm) {
        recordTaskResult(buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable'));
        return { ok: false, error: 'LLMHub 未就绪', reasonCode: 'provider_unavailable' };
    }

    const shouldShowTask = texts.length > 1 || budget?.showOverlay === true || Boolean(budget?.taskPresentation);
    const requestId = shouldShowTask
        ? startTaskPresentation(
            tid,
            {
                ...budget?.taskPresentation,
                description: budget?.taskPresentation?.description || budget?.overlayDescription || (
                    texts.length > 1
                        ? `正在为 ${texts.length} 段文本写入向量索引。`
                        : '正在执行向量任务。'
                ),
                showToast: typeof budget?.taskPresentation?.showToast === 'boolean'
                    ? budget.taskPresentation.showToast
                    : texts.length > 1 || budget?.showOverlay === true,
                title: budget?.taskPresentation?.title || (texts.length > 1 ? '向量索引写入' : '向量处理'),
            },
            budget?.overlayDescription || getRunningDescription(tid),
        )
        : null;

    try {
        const result = await llm.embed({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId: MEMORY_TASKS.VECTOR_EMBED,
            taskDescription: texts.length > 1 ? `索引 ${texts.length} 段文本` : '向量查询',
            texts,
            enqueue: {
                displayMode: 'silent',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID, chatKey: budget?.chatKey },
            },
            onLifecycle: (event): void => {
                applyLifecyclePresentation(requestId, event);
            },
        });

        if (result?.ok !== false) {
            recordTaskResult(buildSuccessRecord(tid, startTs, texts.length > 1 ? `chunks=${texts.length}` : 'query'));
            endTaskPresentation(requestId, 'done', texts.length > 1 ? '向量索引已完成。' : '向量任务已完成。');
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result?.error || '向量任务失败', result?.reasonCode));
            endTaskPresentation(requestId, 'error', result?.error || '向量任务失败');
        }
        return result;
    } catch (error: unknown) {
        const message = String((error as Error)?.message || error);
        recordTaskResult(buildFailureRecord(tid, startTs, message, 'exception'));
        endTaskPresentation(requestId, 'error', message);
        return { ok: false, error: message, reasonCode: 'exception' };
    }
}

/**
 * 功能：执行 rerank 任务，并接入统一任务展示。
 * @param query 查询文本。
 * @param docs 候选文档。
 * @param topK 返回数量。
 * @param budget 展示配置。
 * @returns rerank 结果。
 */
export async function runRerank(
    query: string,
    docs: string[],
    topK?: number,
    budget?: RerankBudget,
): Promise<RerankTaskResult> {
    const tid = MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId;
    const startTs = Date.now();
    markTaskRunning(tid);

    const llm = getLlm();
    if (!llm) {
        recordTaskResult(buildFailureRecord(tid, startTs, 'LLMHub 未就绪', 'provider_unavailable'));
        return { ok: false, error: 'LLMHub 未就绪', reasonCode: 'provider_unavailable' };
    }

    const requestId = startTaskPresentation(
        tid,
        {
            title: budget?.taskPresentation?.title || '记忆重排',
            ...budget?.taskPresentation,
            description: budget?.taskPresentation?.description || `正在对 ${docs.length} 条候选记忆做重排。`,
        },
        getRunningDescription(tid),
    );

    try {
        const result = await llm.rerank({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId: MEMORY_TASKS.SEARCH_RERANK,
            taskDescription: `重排 ${docs.length} 条候选`,
            query,
            docs,
            topK,
            enqueue: {
                displayMode: 'silent',
                scope: { pluginId: MEMORY_OS_PLUGIN_ID, chatKey: budget?.chatKey },
            },
            onLifecycle: (event): void => {
                applyLifecyclePresentation(requestId, event);
            },
        });

        if (result?.ok !== false) {
            recordTaskResult(buildSuccessRecord(tid, startTs, `docs=${docs.length}`));
            endTaskPresentation(requestId, 'done', '记忆重排已完成。');
        } else {
            recordTaskResult(buildFailureRecord(tid, startTs, result?.error || '重排失败', result?.reasonCode));
            endTaskPresentation(requestId, 'error', result?.error || '重排失败');
        }
        return result;
    } catch (error: unknown) {
        const message = String((error as Error)?.message || error);
        recordTaskResult(buildFailureRecord(tid, startTs, message, 'exception'));
        endTaskPresentation(requestId, 'error', message);
        return { ok: false, error: message, reasonCode: 'exception' };
    }
}

export { enqueueTaskPresentation, updateTaskPresentation, finishTaskPresentation };
