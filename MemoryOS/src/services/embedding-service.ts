/**
 * 功能：Embedding 服务层，负责文本到向量的编码。
 * 说明：通过 LLMHub SDK 的 embed() 接口完成文本编码。
 */

import { logger } from '../runtime/runtime-services';

// ─── 类型 ──────────────────────────────

/** embedding 编码选项 */
export interface EmbeddingEncodeOptions {
    /** 模型提示 */
    model?: string;
    /** 资源提示 */
    resource?: string;
}

/** embedding 编码结果（单条） */
export interface EmbeddingEncodeResult {
    /** 是否成功 */
    ok: boolean;
    /** 向量值 */
    vector: number[];
    /** 维度 */
    dim: number;
    /** 实际使用的模型 */
    model: string;
    /** 错误信息（失败时） */
    error?: string;
}

/** embedding 模型信息 */
export interface EmbeddingModelInfo {
    /** 模型名称 */
    model: string;
    /** 版本（用设置版本标识） */
    version: string;
    /** 维度（0 表示未知，需运行时检测） */
    dim: number;
}

// ─── LLMHub embed 调用约定 ──────────────────────

interface LLMEmbedApi {
    embed: (args: {
        consumer: string;
        taskId: string;
        taskDescription?: string;
        texts: string[];
        routeHint?: { resource?: string; model?: string };
        enqueue?: { displayMode?: string };
    }) => Promise<{
        ok: boolean;
        vectors?: number[][];
        model?: string;
        error?: string;
    }>;
}

function readLLMEmbedApi(): LLMEmbedApi | null {
    const llm = (window as unknown as { STX?: { llm?: unknown } })?.STX?.llm;
    if (!llm || typeof llm !== 'object') {
        return null;
    }
    const record = llm as Record<string, unknown>;
    if (typeof record.embed !== 'function') {
        return null;
    }
    return llm as unknown as LLMEmbedApi;
}

// ─── 服务 ──────────────────────────────

const CONSUMER_ID = 'stx_memory_os';
const TASK_ID = 'memory_embedding';

/**
 * 功能：Embedding 编码服务。
 */
export class EmbeddingService {
    private cachedModel: string = '';
    private cachedDim: number = 0;
    private version: string = '1';

    /**
     * 功能：检查 embedding 能力是否可用。
     */
    isAvailable(): boolean {
        return readLLMEmbedApi() !== null;
    }

    /**
     * 功能：获取不可用原因。
     */
    getUnavailableReason(): string | null {
        if (this.isAvailable()) {
            return null;
        }
        return 'LLMHub embed 接口不可用，请确认已配置支持 embedding 的资源';
    }

    /**
     * 功能：获取当前模型信息。
     */
    getModelInfo(): EmbeddingModelInfo {
        return {
            model: this.cachedModel || 'unknown',
            version: this.version,
            dim: this.cachedDim,
        };
    }

    /**
     * 功能：设置版本标识（用于模型升级检测）。
     */
    setVersion(version: string): void {
        this.version = version;
    }

    /**
     * 功能：编码单条文本。
     * @param text 要编码的文本。
     * @param options 编码选项。
     * @returns 编码结果。
     */
    async encodeOne(text: string, options?: EmbeddingEncodeOptions): Promise<EmbeddingEncodeResult> {
        const results = await this.encodeBatch([text], options);
        return results[0];
    }

    /**
     * 功能：批量编码文本。
     * @param texts 文本数组。
     * @param options 编码选项。
     * @returns 编码结果数组。
     */
    async encodeBatch(texts: string[], options?: EmbeddingEncodeOptions): Promise<EmbeddingEncodeResult[]> {
        const api = readLLMEmbedApi();
        if (!api) {
            return texts.map(() => ({
                ok: false,
                vector: [],
                dim: 0,
                model: '',
                error: 'LLMHub embed 接口不可用',
            }));
        }

        const validTexts = texts.map((t) => String(t ?? '').trim() || ' ');

        try {
            const response = await api.embed({
                consumer: CONSUMER_ID,
                taskId: TASK_ID,
                taskDescription: '记忆向量编码',
                texts: validTexts,
                routeHint: options?.resource || options?.model
                    ? { resource: options.resource, model: options.model }
                    : undefined,
                enqueue: { displayMode: 'silent' },
            });

            if (!response.ok || !response.vectors || response.vectors.length !== validTexts.length) {
                const errorMsg = response.error || '向量编码返回异常';
                logger.warn(`[EmbeddingService] 批量编码失败: ${errorMsg}`);
                return texts.map(() => ({
                    ok: false,
                    vector: [],
                    dim: 0,
                    model: response.model || '',
                    error: errorMsg,
                }));
            }

            if (response.model) {
                this.cachedModel = response.model;
            }
            if (response.vectors.length > 0 && response.vectors[0].length > 0) {
                this.cachedDim = response.vectors[0].length;
            }

            return response.vectors.map((vector) => ({
                ok: true,
                vector,
                dim: vector.length,
                model: response.model || this.cachedModel,
            }));
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logger.error(`[EmbeddingService] 编码异常: ${errorMsg}`);
            return texts.map(() => ({
                ok: false,
                vector: [],
                dim: 0,
                model: '',
                error: errorMsg,
            }));
        }
    }
}
