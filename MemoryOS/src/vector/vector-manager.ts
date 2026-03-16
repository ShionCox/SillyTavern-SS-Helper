import { db } from '../db/db';
import { Logger } from '../../../SDK/logger';
import { runEmbed } from '../llm/memoryLlmBridge';

const logger = new Logger('VectorManager');

const VECTOR_INDEX_IN_FLIGHT = new Map<string, Promise<string[]>>();

function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

function pickIndexSource(metadata?: Record<string, unknown>): Record<string, unknown> {
    const source = metadata?.source;
    if (!source || typeof source !== 'object') {
        return {};
    }
    return source as Record<string, unknown>;
}

function buildIndexTraceSummary(metadata?: Record<string, unknown>): string {
    const source = pickIndexSource(metadata);
    const kind = String(source.kind ?? metadata?.kind ?? 'unknown').trim() || 'unknown';
    const reason = String(source.reason ?? metadata?.reason ?? 'unknown').trim() || 'unknown';
    const viewHash = String(source.viewHash ?? '').trim();
    const snapshotHash = String(source.snapshotHash ?? '').trim();
    const anchorMessageId = String(source.anchorMessageId ?? '').trim();
    const repairGeneration = Number(source.repairGeneration ?? 0);
    const messageIds = Array.isArray(source.messageIds)
        ? source.messageIds.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
        : [];
    return [
        `kind=${kind}`,
        `reason=${reason}`,
        `viewHash=${viewHash || '-'}`,
        `snapshotHash=${snapshotHash || '-'}`,
        `anchor=${anchorMessageId || '-'}`,
        `messages=${messageIds.length}`,
        `repairGen=${repairGeneration}`,
    ].join(', ');
}

/** 简单的 UUID v4 生成（不依赖第三方包） */
function uuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

export interface VectorIndexStats {
    chunkCount: number;
    embeddingCount: number;
    lastIndexedAt: number;
    lastEmbeddingModel: string | null;
}

/**
 * 向量索引管理器 —— 负责文本块的切分、Embedding 生成与余弦相似度检索
 *
 * 整体策略：
 * 1. 待索引文本 → 切块 (chunk) → 调用 LLMHub rag.embed → 存入 vector_embeddings
 * 2. 查询时 → embed 查询串 → 计算余弦相似度 → 取 TopK 候选
 * 3. 若 LLMHub 不可用或超时 → 静默返回空结果（不报错）
 */
export class VectorManager {
    private chatKey: string;
    /** 每个文本块的最大字符数 */
    private chunkSize = 400;
    /** 每次检索的最大候选数量 */
    private defaultTopK = 5;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 功能：构建同内容索引请求的去重签名。
     * @param chunks 文本块列表。
     * @param bookId 来源 bookId。
     * @returns 去重签名。
     */
    private buildIndexSignature(chunks: string[], bookId?: string): string {
        const payload = `${this.chatKey}::${String(bookId ?? '')}::${chunks.join('\u241E')}`;
        let hash = 5381;
        for (let index = 0; index < payload.length; index += 1) {
            hash = ((hash << 5) + hash) ^ payload.charCodeAt(index);
        }
        return `vec_${(hash >>> 0).toString(16)}`;
    }

    /**
     * 功能：尝试复用已经存在的向量块，避免对完全相同内容重复发 embedding。
     * @param chunks 当前待索引的文本块列表。
     * @param bookId 来源 bookId。
     * @returns 若全部块都已存在则返回对应 chunkId 列表，否则返回 null。
     */
    private async tryReuseExistingChunkIds(chunks: string[], bookId?: string): Promise<string[] | null> {
        if (chunks.length === 0) {
            return [];
        }
        const existingRows = await db.vector_chunks.where('chatKey').equals(this.chatKey).toArray();
        const contentToChunkIds = new Map<string, string[]>();
        for (const row of existingRows) {
            if (String(row.bookId ?? '') !== String(bookId ?? '')) {
                continue;
            }
            const content = String(row.content ?? '');
            if (!content) {
                continue;
            }
            const currentIds = contentToChunkIds.get(content) || [];
            currentIds.push(String(row.chunkId ?? '').trim());
            contentToChunkIds.set(content, currentIds.filter(Boolean));
        }

        const reusedChunkIds: string[] = [];
        const localConsumedCount = new Map<string, number>();
        for (const chunk of chunks) {
            const candidates = contentToChunkIds.get(chunk) || [];
            const consumed = localConsumedCount.get(chunk) || 0;
            const nextChunkId = String(candidates[consumed] ?? '').trim();
            if (!nextChunkId) {
                return null;
            }
            reusedChunkIds.push(nextChunkId);
            localConsumedCount.set(chunk, consumed + 1);
        }
        return reusedChunkIds;
    }

    // ==========================================
    // 公共 API
    // ==========================================

    /**
     * 为一段文本建立向量索引，按块切分后批量 embed 并写入 IndexedDB
     * @param text 整段原文
     * @param bookId 可选的来源 bookId（用于后续按书检索）
     * @returns 写入的 chunkId 列表
     */
    public async indexText(text: string, bookId?: string, metadata?: Record<string, unknown>): Promise<string[]> {
        const chunks = this.splitIntoChunks(text, this.chunkSize);
        if (chunks.length === 0) return [];

        const traceSummary = buildIndexTraceSummary(metadata);
        const textHash = hashText(String(text ?? ''));
        const firstChunkHash = hashText(chunks[0] ?? '');
        logger.info(
            `向量索引请求进入：chatKey=${this.chatKey}, bookId=${bookId ?? '(无)'}, chunks=${chunks.length}, textLen=${String(text ?? '').length}, textHash=${textHash}, firstChunkHash=${firstChunkHash}, ${traceSummary}`,
        );

        const reusableChunkIds = await this.tryReuseExistingChunkIds(chunks, bookId);
        if (reusableChunkIds && reusableChunkIds.length === chunks.length) {
            logger.info(`检测到重复向量索引请求，直接复用已有向量块：${reusableChunkIds.length} 个，bookId=${bookId ?? '(无)'}, textHash=${textHash}, ${traceSummary}`);
            return reusableChunkIds;
        }

        const dedupeSignature = this.buildIndexSignature(chunks, bookId);
        const inFlightTask = VECTOR_INDEX_IN_FLIGHT.get(dedupeSignature);
        if (inFlightTask) {
            logger.info(`检测到并发重复向量索引请求，复用进行中的任务，bookId=${bookId ?? '(无)'}, signature=${dedupeSignature}, textHash=${textHash}, ${traceSummary}`);
            return inFlightTask;
        }

        logger.info(`开始向量索引：${chunks.length} 个文本块，bookId=${bookId ?? '(无)'}, signature=${dedupeSignature}, textHash=${textHash}, ${traceSummary}`);

        const task = (async (): Promise<string[]> => {
            const overlayDescription = bookId
                ? `正在写入向量索引：${bookId}`
                : '正在写入向量索引';
            const embedResult = await runEmbed(chunks, {
                maxLatencyMs: 15000,
                showOverlay: true,
                overlayDescription,
            }) as any;

            if (!embedResult?.ok || !Array.isArray(embedResult.vectors)) {
                logger.warn('embed 返回格式异常，向量索引跳过。');
                return [];
            }

            const chunkIds: string[] = [];
            const now = Date.now();

            for (let i = 0; i < chunks.length; i++) {
                const chunkId = uuid();
                const vector: number[] = embedResult.vectors[i] ?? [];

                // 写入 chunk 原文
                await db.vector_chunks.put({
                    chunkId,
                    chatKey: this.chatKey,
                    bookId,
                    content: chunks[i],
                    metadata: { index: i, ...(metadata ?? {}) },
                    createdAt: now,
                });

                // 写入对应 embedding
                await db.vector_embeddings.put({
                    embeddingId: uuid(),
                    chunkId,
                    chatKey: this.chatKey,
                    vector,
                    model: embedResult.model ?? 'unknown',
                    createdAt: now,
                });

                chunkIds.push(chunkId);
            }

            // 更新 vector_meta
            if (bookId) {
                const metaKey = `${this.chatKey}::${bookId}`;
                const existing = await db.vector_meta.get(metaKey);
                await db.vector_meta.put({
                    metaKey,
                    chatKey: this.chatKey,
                    bookId,
                    totalChunks: (existing?.totalChunks ?? 0) + chunkIds.length,
                    embeddingModel: embedResult.model ?? 'unknown',
                    lastIndexedAt: now,
                });
            }

            logger.success(`向量索引完成，写入 ${chunkIds.length} 个向量块，bookId=${bookId ?? '(无)'}, signature=${dedupeSignature}, textHash=${textHash}, ${traceSummary}`);
            return chunkIds;

        })().catch((e) => {
            logger.error(`向量索引失败，静默降级，bookId=${bookId ?? '(无)'}, signature=${dedupeSignature}, textHash=${textHash}, ${traceSummary}`, e);
            return [];
        }).finally((): void => {
            const currentTask = VECTOR_INDEX_IN_FLIGHT.get(dedupeSignature);
            if (currentTask === task) {
                VECTOR_INDEX_IN_FLIGHT.delete(dedupeSignature);
            }
        });

        VECTOR_INDEX_IN_FLIGHT.set(dedupeSignature, task);
        return task;
    }

    /**
     * 语义相似度检索 —— 向量召回
     * @param query 查询串
     * @param topK 最多返回条数（默认 5）
     * @returns 按相似度排序的文本块列表
     */
    public async search(query: string, topK = this.defaultTopK): Promise<Array<{ chunkId: string; content: string; score: number }>> {
        try {
            const embedResult = await runEmbed([query], { maxLatencyMs: 8000 }) as any;

            if (!embedResult?.ok || !Array.isArray(embedResult.vectors?.[0])) {
                return [];
            }

            const queryVec: number[] = embedResult.vectors[0];

            // 取出当前 chatKey 下所有向量 Embedding
            const allEmbeddings = await db.vector_embeddings
                .where('chatKey')
                .equals(this.chatKey)
                .toArray();

            if (allEmbeddings.length === 0) return [];

            // 计算余弦相似度并排序
            const scored = allEmbeddings.map(emb => ({
                chunkId: emb.chunkId,
                score: this.cosineSimilarity(queryVec, emb.vector)
            }));

            scored.sort((a, b) => b.score - a.score);
            const topHits = scored.slice(0, topK);

            // 批量查 chunk 原文
            const results: Array<{ chunkId: string; content: string; score: number }> = [];
            for (const hit of topHits) {
                const chunk = await db.vector_chunks.get(hit.chunkId);
                if (chunk) {
                    results.push({ chunkId: hit.chunkId, content: chunk.content, score: hit.score });
                }
            }

            return results;

        } catch (e) {
            logger.warn('向量检索失败，静默降级', e);
            return [];
        }
    }

    /**
     * 返回当前聊天的向量索引统计。
     */
    public async getIndexStats(): Promise<VectorIndexStats> {
        const [chunks, embeddings, metas] = await Promise.all([
            db.vector_chunks.where('chatKey').equals(this.chatKey).count(),
            db.vector_embeddings.where('chatKey').equals(this.chatKey).count(),
            db.vector_meta.where('chatKey').equals(this.chatKey).toArray(),
        ]);
        const lastMeta = metas.sort((left, right): number => Number(right.lastIndexedAt ?? 0) - Number(left.lastIndexedAt ?? 0))[0] ?? null;
        return {
            chunkCount: Number(chunks ?? 0),
            embeddingCount: Number(embeddings ?? 0),
            lastIndexedAt: Number(lastMeta?.lastIndexedAt ?? 0),
            lastEmbeddingModel: lastMeta?.embeddingModel ?? null,
        };
    }

    /**
     * 删除 chatKey 下的全部向量数据（清理用）
     */
    public async clear(): Promise<void> {
        await db.vector_chunks.where('chatKey').equals(this.chatKey).delete();
        await db.vector_embeddings.where('chatKey').equals(this.chatKey).delete();
        await db.vector_meta.where('chatKey').equals(this.chatKey).delete();
        logger.info('已清除当前会话的所有向量数据。');
    }

    // ==========================================
    // 私有工具方法
    // ==========================================

    /**
     * 余弦相似度计算
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        if (a.length !== b.length || a.length === 0) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    /**
     * 将长文本拆分为固定大小的块（按段落/句子边界优先切分）
     */
    private splitIntoChunks(text: string, maxLen: number): string[] {
        const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0);
        const chunks: string[] = [];
        let current = '';

        for (const para of paragraphs) {
            if ((current + '\n\n' + para).length <= maxLen) {
                current = current ? current + '\n\n' + para : para;
            } else {
                if (current) chunks.push(current.trim());
                // 如果单个段落本身超过 maxLen，按 maxLen 硬切
                if (para.length > maxLen) {
                    for (let i = 0; i < para.length; i += maxLen) {
                        chunks.push(para.slice(i, i + maxLen).trim());
                    }
                    current = '';
                } else {
                    current = para;
                }
            }
        }

        if (current) chunks.push(current.trim());
        return chunks.filter(c => c.length > 10);
    }
}
