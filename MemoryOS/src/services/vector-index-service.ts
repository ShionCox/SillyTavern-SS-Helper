/**
 * 功能：向量索引服务。
 * 说明：负责写链路自动索引、全量重建、增量刷新、失效清理、模型升级等。
 *       当 vectorAutoIndexOnWrite 开启时，entry/relationship/actor/summary 变更后
 *       自动触发向量文档构造 + embedding 编码 + 索引更新。
 */

import type { VectorDocument, DBMemoryVectorDocument, EmbeddingStatus } from '../types/vector-document';
import type { MemoryEntry, ActorMemoryProfile, MemoryRelationshipRecord, SummarySnapshot } from '../types';
import {
    buildEntryDocument,
    buildRelationshipDocument,
    buildActorDocument,
    buildSummaryDocument,
} from './vector-document-builder';
import {
    saveVectorDocuments,
    loadVectorDocuments,
    deleteVectorDocumentsBySource,
    clearAllVectorDataForChat,
} from '../db/vector-db';
import { readMemoryOSSettings } from '../settings/store';
import { logger } from '../runtime/runtime-services';
import {
    getSharedEmbeddingService,
    getSharedVectorStore,
    isVectorRuntimeReady,
} from '../runtime/vector-runtime';

const AUTO_INDEX_BATCH_SIZE = 20;
const AUTO_INDEX_DEBOUNCE_MS = 120;

interface AutoIndexWaiter {
    vectorDocId: string;
    resolve: () => void;
}

interface AutoIndexQueueState {
    docs: Map<string, VectorDocument>;
    activeDocIds: Set<string>;
    waiters: AutoIndexWaiter[];
    timer: ReturnType<typeof setTimeout> | null;
    flushing: boolean;
}

interface VectorBatchDisplayContext {
    currentBatch: number;
    totalBatches: number;
}

/**
 * 功能：检查是否应执行自动索引。
 */
function shouldAutoIndex(): boolean {
    if (!isVectorRuntimeReady()) {
        return false;
    }
    const settings = readMemoryOSSettings();
    if (!settings.vectorAutoIndexOnWrite) {
        return false;
    }
    return true;
}

/**
 * 功能：将 VectorDocument 转为持久化格式。
 */
function toDBDocument(doc: VectorDocument, embeddingStatus: EmbeddingStatus, embeddingVersion: string): DBMemoryVectorDocument {
    return {
        vectorDocId: doc.vectorDocId,
        chatKey: doc.chatKey,
        sourceKind: doc.sourceKind,
        sourceId: doc.sourceId,
        schemaId: doc.schemaId ?? '',
        title: doc.title,
        text: doc.text,
        compareKey: doc.compareKey,
        actorKeys: doc.actorKeys ?? [],
        relationKeys: doc.relationKeys ?? [],
        worldKeys: doc.worldKeys ?? [],
        locationKey: doc.locationKey,
        embeddingStatus,
        embeddingVersion,
        embeddingModel: undefined,
        embeddingDim: undefined,
        lastError: undefined,
        updatedAt: doc.updatedAt,
    };
}

/**
 * 功能：对多个向量文档批量执行 embedding 编码并写入索引。
 */
async function encodeBatchAndIndex(
    chatKey: string,
    docs: VectorDocument[],
    batchDisplay?: VectorBatchDisplayContext,
): Promise<void> {
    const embeddingService = getSharedEmbeddingService();
    const vectorStore = getSharedVectorStore();
    if (!embeddingService || !vectorStore || docs.length === 0) {
        return;
    }

    const settings = readMemoryOSSettings();
    const embeddingVersion = settings.vectorEmbeddingVersion || '1';

    const dbDocs = docs.map((d) => toDBDocument(d, 'pending', embeddingVersion));
    await saveVectorDocuments(chatKey, dbDocs);

    const texts = docs.map((d) => d.text);
    const taskDescription = batchDisplay && batchDisplay.totalBatches > 1
        ? `记忆向量编码（${batchDisplay.currentBatch}/${batchDisplay.totalBatches}）`
        : '记忆向量编码';
    const batchResult = await embeddingService.encodeBatch(texts, {
        taskDescription,
        enqueue: {
            displayMode: 'compact',
            autoCloseMs: 2200,
            replacePendingByKey: `memory_embedding_batch::${chatKey}`,
        },
    });

    const modelInfo = embeddingService.getModelInfo();
    const indexDocs: Array<{ vectorDocId: string; chatKey: string; sourceKind: string; sourceId: string; vector: number[]; dim: number }> = [];

    for (let i = 0; i < docs.length; i++) {
        const result = batchResult[i];
        if (result && result.ok) {
            dbDocs[i].embeddingStatus = 'ready';
            dbDocs[i].embeddingModel = result.model;
            dbDocs[i].embeddingDim = result.dim;
            dbDocs[i].lastError = undefined;
            indexDocs.push({
                vectorDocId: docs[i].vectorDocId,
                chatKey,
                sourceKind: docs[i].sourceKind,
                sourceId: docs[i].sourceId,
                vector: result.vector,
                dim: result.dim,
            });
        } else {
            dbDocs[i].embeddingStatus = 'failed';
            dbDocs[i].embeddingModel = result?.model || embeddingService.getModelInfo().model;
            dbDocs[i].embeddingDim = 0;
            dbDocs[i].lastError = result?.error ?? 'unknown';
            logger.warn(`[VectorIndex] 批量 embedding 编码失败 (${docs[i].vectorDocId}): ${result?.error ?? 'unknown'}`);
        }
    }

    // 更新文档状态
    await saveVectorDocuments(chatKey, dbDocs);

    // 写入向量索引
    if (indexDocs.length > 0) {
        await vectorStore.upsertDocuments(chatKey, indexDocs, {
            model: modelInfo.model,
            version: modelInfo.version,
        });
    }
}

const autoIndexQueues = new Map<string, AutoIndexQueueState>();

/**
 * 功能：读取或创建指定聊天的自动索引队列。
 * @param chatKey 聊天键。
 * @returns 自动索引队列状态。
 */
function ensureAutoIndexQueue(chatKey: string): AutoIndexQueueState {
    const existing = autoIndexQueues.get(chatKey);
    if (existing) {
        return existing;
    }
    const created: AutoIndexQueueState = {
        docs: new Map<string, VectorDocument>(),
        activeDocIds: new Set<string>(),
        waiters: [],
        timer: null,
        flushing: false,
    };
    autoIndexQueues.set(chatKey, created);
    return created;
}

/**
 * 功能：在批次处理后尝试结清等待中的调用方。
 * @param state 队列状态。
 */
function settleAutoIndexWaiters(state: AutoIndexQueueState): void {
    if (state.waiters.length === 0) {
        return;
    }
    const pendingWaiters: AutoIndexWaiter[] = [];
    for (const waiter of state.waiters) {
        if (state.docs.has(waiter.vectorDocId) || state.activeDocIds.has(waiter.vectorDocId)) {
            pendingWaiters.push(waiter);
            continue;
        }
        waiter.resolve();
    }
    state.waiters = pendingWaiters;
}

/**
 * 功能：在队列空闲时释放聊天级自动索引状态。
 * @param chatKey 聊天键。
 * @param state 队列状态。
 */
function cleanupAutoIndexQueue(chatKey: string, state: AutoIndexQueueState): void {
    if (state.docs.size > 0 || state.activeDocIds.size > 0 || state.timer || state.flushing || state.waiters.length > 0) {
        return;
    }
    autoIndexQueues.delete(chatKey);
}

/**
 * 功能：刷新指定聊天的自动索引批处理队列。
 * @param chatKey 聊天键。
 * @returns 异步完成。
 */
async function flushAutoIndexQueue(chatKey: string): Promise<void> {
    const state = ensureAutoIndexQueue(chatKey);
    if (state.flushing) {
        return;
    }

    state.flushing = true;
    if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
    }

    try {
        while (state.docs.size > 0) {
            const roundDocs: VectorDocument[] = Array.from(state.docs.values());
            const totalBatches = Math.max(1, Math.ceil(roundDocs.length / AUTO_INDEX_BATCH_SIZE));
            for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
                const batch: VectorDocument[] = roundDocs.slice(
                    batchIndex * AUTO_INDEX_BATCH_SIZE,
                    (batchIndex + 1) * AUTO_INDEX_BATCH_SIZE,
                );
                const batchDocIds = batch.map((doc) => doc.vectorDocId);
                for (const vectorDocId of batchDocIds) {
                    state.docs.delete(vectorDocId);
                    state.activeDocIds.add(vectorDocId);
                }

                try {
                    await encodeBatchAndIndex(chatKey, batch, {
                        currentBatch: batchIndex + 1,
                        totalBatches,
                    });
                } catch (error) {
                    logger.warn(`[VectorIndex] 自动索引批处理失败 (chat=${chatKey}, batch=${batchDocIds.length})`, error);
                } finally {
                    for (const vectorDocId of batchDocIds) {
                        state.activeDocIds.delete(vectorDocId);
                    }
                    settleAutoIndexWaiters(state);
                }
            }
        }
    } finally {
        state.flushing = false;
        settleAutoIndexWaiters(state);
        cleanupAutoIndexQueue(chatKey, state);
    }
}

/**
 * 功能：把单个向量文档加入自动索引批处理队列。
 * @param chatKey 聊天键。
 * @param doc 向量文档。
 * @returns 当前文档被批处理完成时结束。
 */
function enqueueAutoIndexDocument(chatKey: string, doc: VectorDocument): Promise<void> {
    const state = ensureAutoIndexQueue(chatKey);
    state.docs.set(doc.vectorDocId, doc);

    const donePromise = new Promise<void>((resolve) => {
        state.waiters.push({
            vectorDocId: doc.vectorDocId,
            resolve,
        });
    });

    if (state.docs.size >= AUTO_INDEX_BATCH_SIZE) {
        if (state.timer) {
            clearTimeout(state.timer);
            state.timer = null;
        }
        void flushAutoIndexQueue(chatKey);
        return donePromise;
    }

    if (!state.timer) {
        state.timer = setTimeout((): void => {
            state.timer = null;
            void flushAutoIndexQueue(chatKey);
        }, AUTO_INDEX_DEBOUNCE_MS);
    }

    return donePromise;
}

// ─── 增量刷新（写链路钩子） ──────────────────────────────

/**
 * 功能：entry 保存后自动索引。
 * @param chatKey 聊天键。
 * @param entry 保存后的条目。
 */
export async function onEntrySaved(chatKey: string, entry: MemoryEntry): Promise<void> {
    if (!shouldAutoIndex()) {
        return;
    }
    try {
        const doc = buildEntryDocument(entry);
        await enqueueAutoIndexDocument(chatKey, doc);
    } catch (error) {
        logger.warn(`[VectorIndex] entry 自动索引失败 (${entry.entryId})`, error);
    }
}

/**
 * 功能：entry 删除后清理向量数据。
 * @param chatKey 聊天键。
 * @param entryId 条目 ID。
 */
export async function onEntryDeleted(chatKey: string, entryId: string): Promise<void> {
    if (!isVectorRuntimeReady()) {
        return;
    }
    try {
        const vectorStore = getSharedVectorStore();
        await deleteVectorDocumentsBySource(chatKey, 'entry', [entryId]);
        await vectorStore?.deleteBySource(chatKey, 'entry', [entryId]);
    } catch (error) {
        logger.warn(`[VectorIndex] entry 向量清理失败 (${entryId})`, error);
    }
}

/**
 * 功能：relationship 保存后自动索引。
 * @param chatKey 聊天键。
 * @param rel 保存后的关系记录。
 */
export async function onRelationshipSaved(chatKey: string, rel: MemoryRelationshipRecord): Promise<void> {
    if (!shouldAutoIndex()) {
        return;
    }
    try {
        const doc = buildRelationshipDocument(rel);
        await enqueueAutoIndexDocument(chatKey, doc);
    } catch (error) {
        logger.warn(`[VectorIndex] relationship 自动索引失败 (${rel.relationshipId})`, error);
    }
}

/**
 * 功能：actor 保存后自动索引。
 * @param chatKey 聊天键。
 * @param actor 保存后的角色画像。
 */
export async function onActorSaved(chatKey: string, actor: ActorMemoryProfile): Promise<void> {
    if (!shouldAutoIndex()) {
        return;
    }
    try {
        const doc = buildActorDocument(actor);
        await enqueueAutoIndexDocument(chatKey, doc);
    } catch (error) {
        logger.warn(`[VectorIndex] actor 自动索引失败 (${actor.actorKey})`, error);
    }
}

/**
 * 功能：summary 保存后自动索引。
 * @param chatKey 聊天键。
 * @param snapshot 保存后的总结快照。
 */
export async function onSummarySaved(chatKey: string, snapshot: SummarySnapshot): Promise<void> {
    if (!shouldAutoIndex()) {
        return;
    }
    try {
        const doc = buildSummaryDocument(snapshot);
        await enqueueAutoIndexDocument(chatKey, doc);
    } catch (error) {
        logger.warn(`[VectorIndex] summary 自动索引失败 (${snapshot.summaryId})`, error);
    }
}

// ─── 全量重建 ──────────────────────────────

/**
 * 功能：重建指定聊天的全部向量文档（不含 embedding 编码）。
 * @param chatKey 聊天键。
 * @param data 全部主表数据。
 * @returns 构建的向量文档数量。
 */
export async function rebuildAllVectorDocuments(
    chatKey: string,
    data: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
        actors: ActorMemoryProfile[];
        summaries: SummarySnapshot[];
    },
): Promise<number> {
    const settings = readMemoryOSSettings();
    const embeddingVersion = settings.vectorEmbeddingVersion || '1';

    const allDocs: VectorDocument[] = [
        ...data.entries.map(buildEntryDocument),
        ...data.relationships.map(buildRelationshipDocument),
        ...data.actors.map(buildActorDocument),
        ...data.summaries.map(buildSummaryDocument),
    ];

    // 清空旧的向量文档
    await clearAllVectorDataForChat(chatKey);
    const vectorStore = getSharedVectorStore();
    await vectorStore?.clearByChat(chatKey);

    if (allDocs.length === 0) {
        logger.info(`[VectorIndex] 重建完成，无向量文档 (chat=${chatKey})`);
        return 0;
    }

    // 保存全部文档（pending 状态）
    const dbDocs = allDocs.map((d) => toDBDocument(d, 'pending', embeddingVersion));
    await saveVectorDocuments(chatKey, dbDocs);

    logger.info(`[VectorIndex] 已重建 ${allDocs.length} 个向量文档 (chat=${chatKey})`);
    return allDocs.length;
}

/**
 * 功能：重建指定聊天的全部向量索引（含 embedding 编码）。
 * @param chatKey 聊天键。
 * @param data 全部主表数据。
 * @returns 成功编码的向量文档数量。
 */
export async function rebuildAllEmbeddings(
    chatKey: string,
    data: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
        actors: ActorMemoryProfile[];
        summaries: SummarySnapshot[];
    },
): Promise<number> {
    if (!isVectorRuntimeReady()) {
        logger.warn('[VectorIndex] 向量运行时未就绪，无法重建索引');
        return 0;
    }

    const embeddingService = getSharedEmbeddingService();
    if (!embeddingService || !embeddingService.isAvailable()) {
        logger.warn('[VectorIndex] embedding 服务不可用，无法重建索引');
        return 0;
    }

    // 先重建文档
    await rebuildAllVectorDocuments(chatKey, data);

    // 加载文档并批量编码
    const docs = await loadVectorDocuments(chatKey);
    if (docs.length === 0) {
        return 0;
    }

    const allDocs: VectorDocument[] = docs.map((d) => ({
        vectorDocId: d.vectorDocId,
        sourceKind: d.sourceKind as VectorDocument['sourceKind'],
        sourceId: d.sourceId,
        chatKey: d.chatKey,
        schemaId: d.schemaId,
        title: d.title,
        text: d.text,
        compareKey: d.compareKey,
        actorKeys: d.actorKeys ?? [],
        relationKeys: d.relationKeys ?? [],
        worldKeys: d.worldKeys ?? [],
        locationKey: d.locationKey,
        updatedAt: d.updatedAt,
    }));

    // 分批编码（每批 20 条防止超时）
    let successCount = 0;
    const totalBatches = Math.max(1, Math.ceil(allDocs.length / AUTO_INDEX_BATCH_SIZE));

    for (let i = 0; i < allDocs.length; i += AUTO_INDEX_BATCH_SIZE) {
        const batch = allDocs.slice(i, i + AUTO_INDEX_BATCH_SIZE);
        try {
            await encodeBatchAndIndex(chatKey, batch, {
                currentBatch: Math.floor(i / AUTO_INDEX_BATCH_SIZE) + 1,
                totalBatches,
            });
            successCount += batch.length;
        } catch (error) {
            logger.warn(`[VectorIndex] 批量重建编码失败 (batch ${i}-${i + batch.length})`, error);
        }
    }

    logger.info(`[VectorIndex] 全量重建完成: ${successCount}/${allDocs.length} (chat=${chatKey})`);
    return successCount;
}

// ─── 模型升级 ──────────────────────────────

/**
 * 功能：检查并执行模型版本升级。
 * 说明：当 embeddingVersion 设置发生变化时，标记旧向量为 stale → 重跑 embedding → 覆盖新索引。
 * @param chatKey 聊天键。
 * @param data 全部主表数据。
 * @returns 重编码的向量文档数量。
 */
export async function upgradeEmbeddingModel(
    chatKey: string,
    data: {
        entries: MemoryEntry[];
        relationships: MemoryRelationshipRecord[];
        actors: ActorMemoryProfile[];
        summaries: SummarySnapshot[];
    },
): Promise<number> {
    return rebuildAllEmbeddings(chatKey, data);
}
