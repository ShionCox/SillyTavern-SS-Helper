import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readMemoryLLMApi } from './llm-types';
import type { MemoryLLMApi, MemoryLLMRoutePreview } from './llm-types';

export type MemoryLlmTaskStatus = {
    available: boolean;
    model: string;
    resourceLabel: string;
    blockedReason: string;
};

export type MemoryLlmDependencyStatus = {
    connected: boolean;
    currentModel: string;
    summary: MemoryLlmTaskStatus;
    dream: MemoryLlmTaskStatus;
    takeover: MemoryLlmTaskStatus;
    coldStart: MemoryLlmTaskStatus;
};

/**
 * 功能：构建不可用的 LLM 任务状态。
 * @param reason 不可用原因。
 * @returns 任务状态。
 */
function buildUnavailableTaskStatus(reason: string): MemoryLlmTaskStatus {
    return {
        available: false,
        model: '',
        resourceLabel: '',
        blockedReason: reason,
    };
}

/**
 * 功能：把 LLMHub 路由预览转换为设置页状态。
 * @param preview 路由预览结果。
 * @returns 任务状态。
 */
function buildTaskStatusFromPreview(preview: MemoryLLMRoutePreview): MemoryLlmTaskStatus {
    return {
        available: preview.available,
        model: String(preview.model ?? '').trim(),
        resourceLabel: String(preview.resourceLabel ?? preview.resourceId ?? '').trim(),
        blockedReason: String(preview.blockedReason ?? '').trim(),
    };
}

/**
 * 功能：预览指定 MemoryOS LLM 任务的路由状态。
 * @param llm LLMHub SDK。
 * @param taskKey 任务键。
 * @returns 任务状态。
 */
async function previewGenerationTask(llm: MemoryLLMApi, taskKey: string): Promise<MemoryLlmTaskStatus> {
    const previewRoute = llm.inspect?.previewRoute;
    if (!previewRoute) {
        return {
            available: true,
            model: '',
            resourceLabel: '',
            blockedReason: '',
        };
    }
    const preview = await previewRoute({
        consumer: MEMORY_OS_PLUGIN_ID,
        taskKind: 'generation',
        taskKey,
        requiredCapabilities: ['chat', 'json'],
    });
    return buildTaskStatusFromPreview(preview);
}

/**
 * 功能：读取 MemoryOS 依赖 LLMHub 的生产可用性快照。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   LLMHub 连接状态、当前模型和核心任务可用性。
 */
export async function readMemoryLlmDependencyStatus(): Promise<MemoryLlmDependencyStatus> {
    const llm = readMemoryLLMApi();
    if (!llm) {
        const unavailable = buildUnavailableTaskStatus('未检测到 LLMHub SDK');
        return {
            connected: false,
            currentModel: '',
            summary: unavailable,
            dream: unavailable,
            takeover: unavailable,
            coldStart: unavailable,
        };
    }

    const [summary, dream, takeover, coldStart] = await Promise.all([
        previewGenerationTask(llm, 'memory_summary_mutation'),
        previewGenerationTask(llm, 'memory_dream_phase1'),
        previewGenerationTask(llm, 'memory_takeover_batch'),
        previewGenerationTask(llm, 'memory_cold_start_core'),
    ]);
    const currentModel = summary.model || dream.model || takeover.model || coldStart.model;

    return {
        connected: true,
        currentModel,
        summary,
        dream,
        takeover,
        coldStart,
    };
}

/**
 * 功能：判断 MemoryOS 当前是否可以发起 LLM 任务。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   是否已连接 LLMHub。
 */
export function hasMemoryLlmRuntime(): boolean {
    return readMemoryLLMApi() !== null;
}
