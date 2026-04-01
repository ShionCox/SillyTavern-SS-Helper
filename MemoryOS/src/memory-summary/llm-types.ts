/**
 * 功能：定义 LLMHub 任务描述。
 */
export interface MemoryLLMTaskDescriptor {
    taskKey: string;
    taskKind: 'generation' | 'embedding' | 'rerank';
    requiredCapabilities: string[];
    maxTokens?: number;
    description: string;
    backgroundEligible: boolean;
}

/**
 * 功能：定义 LLMHub consumer 注册对象。
 */
export interface MemoryLLMConsumerRegistration {
    pluginId: string;
    displayName: string;
    registrationVersion: number;
    tasks: MemoryLLMTaskDescriptor[];
}

/**
 * 功能：定义 runTask 返回结构。
 */
export type MemoryLLMRunResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string; reasonCode?: string };

/**
 * 功能：定义 MemoryOS 使用的 LLMHub 接口。
 */
export interface MemoryLLMApi {
    registerConsumer: (registration: MemoryLLMConsumerRegistration) => void;
    runTask: <T>(args: {
        consumer: string;
        taskKey: string;
        taskDescription?: string;
        taskKind: 'generation';
        input: {
            messages: Array<{ role: 'system' | 'user'; content: string }>;
        };
        schema?: unknown;
        budget?: { maxLatencyMs?: number; maxTokens?: number; maxCost?: number };
        enqueue?: { displayMode?: 'fullscreen' | 'compact' | 'silent'; autoCloseMs?: number };
    }) => Promise<MemoryLLMRunResult<T>>;
}

/**
 * 功能：从全局对象读取 LLMHub SDK。
 * @returns LLMHub SDK，不可用时返回 null。
 */
export function readMemoryLLMApi(): MemoryLLMApi | null {
    const llm = (window as unknown as { STX?: { llm?: unknown } })?.STX?.llm;
    if (!llm || typeof llm !== 'object') {
        return null;
    }
    const llmRecord = llm as Record<string, unknown>;
    if (typeof llmRecord.registerConsumer !== 'function' || typeof llmRecord.runTask !== 'function') {
        return null;
    }
    return llm as MemoryLLMApi;
}

