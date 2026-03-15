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

type GenerationInputMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type GenerationInputPayload = {
    messages?: GenerationInputMessage[];
    systemPrompt?: string;
    temperature?: number;
    [key: string]: unknown;
};

const MEMORY_AI_OVERLAY_ROOT_ID = 'stx-memoryos-ai-pending-overlay';
const MEMORY_AI_OVERLAY_STYLE_ID = 'stx-memoryos-ai-pending-overlay-style';
const CHINESE_OUTPUT_INSTRUCTION = '所有可读的自然语言内容必须使用简体中文输出。仅保留 schema 规定的 JSON 键名、枚举值、字段路径和英文结构标识，不要输出英文说明句子。';
const MEMORY_AI_OVERLAY_TRANSITION_MS = 260;
let memoryAiOverlayDepth = 0;
let memoryAiOverlayHideTimer: number | null = null;

export interface EmbedTaskResult {
    ok: boolean;
    vectors?: number[][];
    error?: string;
    model?: string;
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
    meta?: {
        requestId?: string;
        resourceId?: string;
        model?: string;
    };
}

const REGISTERED_LLM_INSTANCES: WeakSet<object> = new WeakSet<object>();

function ensureAiOverlayStyle(): void {
    if (typeof document === 'undefined' || document.getElementById(MEMORY_AI_OVERLAY_STYLE_ID)) {
        return;
    }
    const styleEl = document.createElement('style');
    styleEl.id = MEMORY_AI_OVERLAY_STYLE_ID;
    styleEl.textContent = `
        #${MEMORY_AI_OVERLAY_ROOT_ID} {
            position: fixed;
            inset: 0;
            z-index: 100001;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: rgba(8, 10, 16, 0.72);
            backdrop-filter: blur(12px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity ${MEMORY_AI_OVERLAY_TRANSITION_MS}ms ease, visibility 0s linear ${MEMORY_AI_OVERLAY_TRANSITION_MS}ms;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID}.is-mounted {
            visibility: visible;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID}.is-visible {
            opacity: 1;
            pointer-events: auto;
            transition: opacity ${MEMORY_AI_OVERLAY_TRANSITION_MS}ms ease;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-card {
            width: min(720px, 100%);
            max-width: 100%;
            border-radius: 18px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: linear-gradient(180deg, rgba(28, 32, 44, 0.98), rgba(16, 18, 28, 0.98));
            box-shadow: 0 24px 72px rgba(0, 0, 0, 0.38);
            color: var(--SmartThemeBodyColor, #f5f5f5);
            overflow: hidden;
            opacity: 0;
            transform: translateY(26px) scale(0.985);
            transition: opacity ${MEMORY_AI_OVERLAY_TRANSITION_MS}ms ease, transform ${MEMORY_AI_OVERLAY_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID}.is-visible .stx-memory-ai-overlay-card {
            opacity: 1;
            transform: translateY(0) scale(1);
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 18px 20px 14px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-title {
            font-size: 18px;
            font-weight: 700;
            line-height: 1.35;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            border-radius: 999px;
            background: rgba(197, 160, 89, 0.18);
            color: #e7c46f;
            font-size: 12px;
            font-weight: 700;
            white-space: nowrap;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-body {
            display: flex;
            flex-direction: column;
            gap: 14px;
            padding: 18px 20px 22px;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-desc {
            font-size: 13px;
            line-height: 1.65;
            opacity: 0.84;
            white-space: pre-wrap;
            word-break: break-word;
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-progress {
            position: relative;
            width: 100%;
            height: 6px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.08);
        }

        #${MEMORY_AI_OVERLAY_ROOT_ID} .stx-memory-ai-overlay-progress::after {
            content: '';
            position: absolute;
            inset: 0;
            width: 36%;
            border-radius: inherit;
            background: linear-gradient(90deg, rgba(197,160,89,0.2), rgba(197,160,89,0.95), rgba(197,160,89,0.2));
            animation: stx-memory-ai-overlay-loading 1.2s ease-in-out infinite;
        }

        @keyframes stx-memory-ai-overlay-loading {
            0% { transform: translateX(-120%); }
            100% { transform: translateX(280%); }
        }
    `;
    document.head.appendChild(styleEl);
}

function ensureAiOverlayRoot(): HTMLElement | null {
    if (typeof document === 'undefined') {
        return null;
    }
    ensureAiOverlayStyle();
    let root = document.getElementById(MEMORY_AI_OVERLAY_ROOT_ID) as HTMLElement | null;
    if (!root) {
        root = document.createElement('div');
        root.id = MEMORY_AI_OVERLAY_ROOT_ID;
        root.setAttribute('aria-hidden', 'true');
        root.innerHTML = `
            <div class="stx-memory-ai-overlay-card">
                <div class="stx-memory-ai-overlay-head">
                    <div class="stx-memory-ai-overlay-title">AI 正在处理中…</div>
                    <div class="stx-memory-ai-overlay-badge">请稍候</div>
                </div>
                <div class="stx-memory-ai-overlay-body">
                    <div class="stx-memory-ai-overlay-progress"></div>
                    <div class="stx-memory-ai-overlay-desc" data-memory-ai-overlay-desc>正在整理上下文并调用模型，请稍等片刻。</div>
                </div>
            </div>
        `;
        document.body.appendChild(root);
    }
    return root;
}

function showAiPendingOverlay(taskId: string, taskDescription?: string): void {
    const root = ensureAiOverlayRoot();
    if (!root) return;
    if (memoryAiOverlayHideTimer !== null) {
        window.clearTimeout(memoryAiOverlayHideTimer);
        memoryAiOverlayHideTimer = null;
    }
    memoryAiOverlayDepth += 1;
    const titleEl = root.querySelector('.stx-memory-ai-overlay-title') as HTMLElement | null;
    const descEl = root.querySelector('[data-memory-ai-overlay-desc]') as HTMLElement | null;
    const taskLabel = String(taskDescription || taskId || '').trim() || taskId;
    if (titleEl) {
        titleEl.textContent = `${taskLabel} · AI 正在处理中…`;
    }
    if (descEl) {
        descEl.textContent = `正在执行任务：${taskLabel}\n任务标识：${taskId}\n请稍候，AI 正在处理中。`;
    }
    root.classList.add('is-mounted');
    root.setAttribute('aria-hidden', 'false');
    requestAnimationFrame((): void => {
        root.classList.add('is-visible');
    });
}

function hideAiPendingOverlay(): void {
    if (memoryAiOverlayDepth > 0) {
        memoryAiOverlayDepth -= 1;
    }
    if (memoryAiOverlayDepth > 0) {
        return;
    }
    const root = typeof document !== 'undefined'
        ? document.getElementById(MEMORY_AI_OVERLAY_ROOT_ID) as HTMLElement | null
        : null;
    if (root) {
        root.classList.remove('is-visible');
        root.setAttribute('aria-hidden', 'true');
        memoryAiOverlayHideTimer = window.setTimeout((): void => {
            root.classList.remove('is-mounted');
            memoryAiOverlayHideTimer = null;
        }, MEMORY_AI_OVERLAY_TRANSITION_MS);
    }
}

function isGenerationInputPayload(value: unknown): value is GenerationInputPayload {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeGenerationInput(input: unknown): unknown {
    if (!isGenerationInputPayload(input)) {
        return input;
    }

    const normalized: GenerationInputPayload = { ...input };
    const normalizedMessages = Array.isArray(input.messages)
        ? input.messages.map((message: GenerationInputMessage) => ({ ...message }))
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
                recommendedDisplay: 'fullscreen',
            },
            {
                taskId: MEMORY_TASKS.EXTRACT,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '结构化记忆提取',
                backgroundEligible: true,
                recommendedDisplay: 'fullscreen',
            },
            {
                taskId: MEMORY_TASKS.TEMPLATE_BUILD,
                taskKind: 'generation',
                requiredCapabilities: ['chat', 'json'],
                description: '世界模板构建',
                recommendedDisplay: 'fullscreen',
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
    taskDescription?: string,
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
        const normalizedInput = normalizeGenerationInput(input);
        const description = String(taskDescription || '').trim();
        showAiPendingOverlay(taskId, description);
        const result = await llm.runTask<T>({
            consumer: MEMORY_OS_PLUGIN_ID,
            taskId,
            taskDescription: description || undefined,
            taskKind: 'generation',
            input: normalizedInput,
            schema,
            budget,
            enqueue: {
                displayMode: 'silent',
                blockNextUntilOverlayClose: false,
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
    } finally {
        hideAiPendingOverlay();
    }
}

/**
 * 功能：执行 embedding 类任务，带统一状态追踪。
 */
export async function runEmbed(
    texts: string[],
    budget?: EmbedBudget,
): Promise<EmbedTaskResult> {
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
): Promise<RerankTaskResult> {
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
