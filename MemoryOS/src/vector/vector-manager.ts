import { db, type DBMemoryCard, type DBMemoryCardEmbedding, type DBMemoryCardMeta, type DBVectorChunkMetadata } from '../db/db';
import { Logger } from '../../../SDK/logger';
import { runEmbed } from '../llm/memoryLlmBridge';

const logger = new Logger('VectorManager');

export interface VectorIndexStats {
    cardCount: number;
    embeddingCount: number;
    lastIndexedAt: number;
    lastEmbeddingModel: string | null;
}

export interface MemoryCardSearchHit {
    chunkId: string;
    cardId: string;
    content: string;
    score: number;
    metadata?: DBVectorChunkMetadata;
    createdAt?: number;
}

/**
 * 功能：将任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 去除多余空白后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：构建稳定的哈希文本。
 * @param value 原始文本。
 * @returns 哈希结果。
 */
function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：为卡片 embedding 生成稳定编号。
 * @param chatKey 聊天键。
 * @param cardId 记忆卡编号。
 * @param model 嵌入模型名。
 * @returns 稳定的 embedding 编号。
 */
function buildEmbeddingId(chatKey: string, cardId: string, model: string): string {
    return `memory_card_embedding:${hashText(`${normalizeText(chatKey)}::${normalizeText(cardId)}::${normalizeText(model)}`)}`;
}

/**
 * 功能：把记忆卡转换成兼容旧检索结果结构的 metadata。
 * @param card 记忆卡。
 * @returns 检索结果 metadata。
 */
function buildCardMetadata(card: DBMemoryCard): DBVectorChunkMetadata {
    return {
        index: 0,
        sourceRecordKey: card.sourceRecordKey ?? undefined,
        sourceRecordKind: card.sourceRecordKind,
        ownerActorKey: card.ownerActorKey ?? null,
        sourceScope: card.scope,
        memoryType: card.lane,
        memorySubtype: card.ttl,
        participantActorKeys: card.participantActorKeys,
        source: {
            kind: 'memory_card',
            reason: 'memory_card_embedding',
            viewHash: card.cardId,
            snapshotHash: card.sourceRecordKey ?? '',
            messageIds: [],
            mutationKinds: [],
            repairGeneration: 0,
            ts: Number(card.updatedAt ?? card.createdAt ?? Date.now()),
        },
    };
}

/**
 * 功能：计算余弦相似度。
 * @param left 向量 A。
 * @param right 向量 B。
 * @returns 相似度分数。
 */
function cosineSimilarity(left: number[], right: number[]): number {
    if (left.length !== right.length || left.length === 0) {
        return 0;
    }
    let dot = 0;
    let normLeft = 0;
    let normRight = 0;
    for (let index = 0; index < left.length; index += 1) {
        dot += left[index] * right[index];
        normLeft += left[index] * left[index];
        normRight += right[index] * right[index];
    }
    const denominator = Math.sqrt(normLeft) * Math.sqrt(normRight);
    return denominator > 0 ? dot / denominator : 0;
}

/**
 * 功能：更新当前会话的记忆卡索引元信息。
 * @param chatKey 聊天键。
 * @param model 嵌入模型名。
 * @returns 元信息记录。
 */
async function refreshMeta(chatKey: string): Promise<DBMemoryCardMeta> {
    const now = Date.now();
    const [activeCardCount, activeEmbeddingCount] = await Promise.all([
        db.memory_cards.where('[chatKey+status]').equals([chatKey, 'active']).count(),
        db.memory_card_embeddings.where('chatKey').equals(chatKey).count(),
    ]);
    const nextMeta: DBMemoryCardMeta = {
        metaKey: `memory_cards:${chatKey}`,
        chatKey,
        updatedAt: now,
        activeCardCount,
        activeEmbeddingCount,
        lastIndexedAt: now,
    };
    await db.memory_card_meta.put(nextMeta);
    return nextMeta;
}

/**
 * 功能：纯记忆卡向量索引管理器。
 *
 * 参数：
 *   chatKey (string)：当前聊天键。
 *
 * 返回：
 *   VectorManager：记忆卡 embedding 的写入、删除、查询与统计能力。
 */
export class VectorManager {
    private chatKey: string;
    private defaultTopK: number = 5;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 功能：为 active 记忆卡批量生成并写入 embedding。
     * @param cards 记忆卡列表。
     * @returns 成功写入 embedding 的卡片编号列表。
     */
    public async upsertMemoryCardEmbeddings(cards: DBMemoryCard[]): Promise<string[]> {
        const activeCards = cards.filter((card: DBMemoryCard): boolean => {
            return normalizeText(card.chatKey) === this.chatKey
                && card.status === 'active'
                && normalizeText(card.memoryText).length > 0;
        });
        const targetCardIds = activeCards.map((card: DBMemoryCard): string => card.cardId);
        if (targetCardIds.length <= 0) {
            await refreshMeta(this.chatKey);
            return [];
        }

        await db.memory_card_embeddings.where('cardId').anyOf(targetCardIds).delete();

        const embedResult = await runEmbed(
            activeCards.map((card: DBMemoryCard): string => card.memoryText),
            {
                chatKey: this.chatKey,
                showOverlay: false,
                maxLatencyMs: 15000,
            },
        );

        if (!embedResult?.ok || !Array.isArray(embedResult.vectors) || embedResult.vectors.length <= 0) {
            logger.warn(`记忆卡向量写入失败，chatKey=${this.chatKey}, cardCount=${activeCards.length}`);
            await refreshMeta(this.chatKey);
            return [];
        }

        const model = normalizeText(embedResult.model) || 'unknown';
        const now = Date.now();
        const vectors = Array.isArray(embedResult.vectors) ? embedResult.vectors : [];
        const embeddings: DBMemoryCardEmbedding[] = activeCards
            .slice(0, vectors.length)
            .map((card: DBMemoryCard, index: number): DBMemoryCardEmbedding => ({
                embeddingId: buildEmbeddingId(this.chatKey, card.cardId, model),
                cardId: card.cardId,
                chatKey: this.chatKey,
                vector: Array.isArray(vectors[index]) ? vectors[index] : [],
                model,
                createdAt: now,
            }))
            .filter((embedding: DBMemoryCardEmbedding): boolean => embedding.vector.length > 0);

        if (embeddings.length > 0) {
            await db.memory_card_embeddings.bulkPut(embeddings);
        }
        await refreshMeta(this.chatKey);
        return embeddings.map((item: DBMemoryCardEmbedding): string => item.cardId);
    }

    /**
     * 功能：删除指定记忆卡的 embedding。
     * @param cardIds 记忆卡编号列表。
     * @returns 实际删除的 embedding 数量。
     */
    public async deleteMemoryCardEmbeddings(cardIds: string[]): Promise<number> {
        const normalizedCardIds = Array.from(new Set(cardIds.map((item: string): string => normalizeText(item)).filter(Boolean)));
        if (normalizedCardIds.length <= 0) {
            return 0;
        }
        const existing = await db.memory_card_embeddings.where('cardId').anyOf(normalizedCardIds).toArray();
        await db.memory_card_embeddings.where('cardId').anyOf(normalizedCardIds).delete();
        await refreshMeta(this.chatKey);
        return existing.length;
    }

    /**
     * 功能：按语义相似度搜索 active 记忆卡。
     * @param query 查询文本。
     * @param topK 返回数量。
     * @param opts 额外过滤条件。
     * @returns 记忆卡命中列表。
     */
    public async search(
        query: string,
        topK: number = this.defaultTopK,
        opts: {
            lanes?: Array<string | null | undefined>;
            activeOnly?: boolean;
        } = {},
    ): Promise<MemoryCardSearchHit[]> {
        const normalizedQuery = normalizeText(query);
        if (!normalizedQuery || topK <= 0) {
            return [];
        }
        try {
            const embedResult = await runEmbed([normalizedQuery], {
                chatKey: this.chatKey,
                showOverlay: false,
                maxLatencyMs: 8000,
            });
            const queryVector = Array.isArray(embedResult?.vectors?.[0]) ? embedResult.vectors[0] : null;
            if (!embedResult?.ok || !queryVector) {
                return [];
            }

            const allowedLanes = Array.isArray(opts.lanes)
                ? new Set(opts.lanes.map((item: string | null | undefined): string => normalizeText(item).toLowerCase()).filter(Boolean))
                : null;
            const [embeddings, cards] = await Promise.all([
                db.memory_card_embeddings.where('chatKey').equals(this.chatKey).toArray(),
                db.memory_cards.where('[chatKey+status]').equals([this.chatKey, 'active']).toArray(),
            ]);
            if (embeddings.length <= 0 || cards.length <= 0) {
                return [];
            }

            const cardMap = new Map<string, DBMemoryCard>(cards.map((card: DBMemoryCard): [string, DBMemoryCard] => [card.cardId, card]));
            return embeddings
                .map((embedding: DBMemoryCardEmbedding): MemoryCardSearchHit | null => {
                    const card = cardMap.get(embedding.cardId);
                    if (!card || !Array.isArray(embedding.vector) || embedding.vector.length <= 0) {
                        return null;
                    }
                    if (allowedLanes && allowedLanes.size > 0) {
                        const lane = normalizeText(card.lane).toLowerCase();
                        if (!lane || !allowedLanes.has(lane)) {
                            return null;
                        }
                    }
                    return {
                        chunkId: card.cardId,
                        cardId: card.cardId,
                        content: card.memoryText,
                        score: cosineSimilarity(queryVector, embedding.vector),
                        metadata: buildCardMetadata(card),
                        createdAt: Number(card.updatedAt ?? card.createdAt ?? 0) || undefined,
                    };
                })
                .filter((item: MemoryCardSearchHit | null): item is MemoryCardSearchHit => item != null)
                .sort((left: MemoryCardSearchHit, right: MemoryCardSearchHit): number => right.score - left.score)
                .slice(0, topK);
        } catch (error) {
            logger.warn('记忆卡向量搜索失败，已静默降级', error);
            return [];
        }
    }

    /**
     * 功能：读取当前会话的记忆卡索引统计。
     * @returns 记忆卡口径的索引统计。
     */
    public async getIndexStats(): Promise<VectorIndexStats> {
        const [activeCardCount, activeEmbeddingCount, meta, latestEmbedding] = await Promise.all([
            db.memory_cards.where('[chatKey+status]').equals([this.chatKey, 'active']).count(),
            db.memory_card_embeddings.where('chatKey').equals(this.chatKey).count(),
            db.memory_card_meta.get(`memory_cards:${this.chatKey}`),
            db.memory_card_embeddings.where('chatKey').equals(this.chatKey).last(),
        ]);
        return {
            cardCount: Number(activeCardCount ?? 0),
            embeddingCount: Number(activeEmbeddingCount ?? 0),
            lastIndexedAt: Number(meta?.lastIndexedAt ?? 0),
            lastEmbeddingModel: normalizeText(latestEmbedding?.model) || null,
        };
    }

    /**
     * 功能：清空当前会话的向量相关数据。
     * @returns Promise<void>
     */
    public async clear(): Promise<void> {
        await Promise.all([
            db.memory_cards.where('chatKey').equals(this.chatKey).delete(),
            db.memory_card_embeddings.where('chatKey').equals(this.chatKey).delete(),
            db.memory_card_meta.where('chatKey').equals(this.chatKey).delete(),
        ]);
        logger.info(`已清空记忆卡向量索引，chatKey=${this.chatKey}`);
    }
}
