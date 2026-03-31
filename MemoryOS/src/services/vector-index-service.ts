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
 * 功能：对单个向量文档执行 embedding 编码并写入索引。
 */
async function encodeAndIndex(chatKey: string, doc: VectorDocument): Promise<void> {
    const embeddingService = getSharedEmbeddingService();
    const vectorStore = getSharedVectorStore();
    if (!embeddingService || !vectorStore) {
        return;
    }

    const settings = readMemoryOSSettings();
    const embeddingVersion = settings.vectorEmbeddingVersion || '1';

    const dbDoc = toDBDocument(doc, 'pending', embeddingVersion);
    await saveVectorDocuments(chatKey, [dbDoc]);

    const encodeResult = await embeddingService.encodeOne(doc.text);
    if (!encodeResult.ok) {
        dbDoc.embeddingStatus = 'failed';
        dbDoc.embeddingModel = encodeResult.model || embeddingService.getModelInfo().model;
        dbDoc.embeddingDim = 0;
        dbDoc.lastError = encodeResult.error;
        await saveVectorDocuments(chatKey, [dbDoc]);
        logger.warn(`[VectorIndex] embedding 编码失败 (${doc.vectorDocId}): ${encodeResult.error}`);
        return;
    }

    dbDoc.embeddingStatus = 'ready';
    dbDoc.embeddingModel = encodeResult.model;
    dbDoc.embeddingDim = encodeResult.dim;
    dbDoc.lastError = undefined;
    await saveVectorDocuments(chatKey, [dbDoc]);

    // 写入向量索引
    const modelInfo = embeddingService.getModelInfo();
    await vectorStore.upsertDocuments(chatKey, [{
        vectorDocId: doc.vectorDocId,
        chatKey,
        sourceKind: doc.sourceKind,
        sourceId: doc.sourceId,
        vector: encodeResult.vector,
        dim: encodeResult.dim,
    }], {
        model: modelInfo.model,
        version: modelInfo.version,
    });
}

/**
 * 功能：对多个向量文档批量执行 embedding 编码并写入索引。
 */
async function encodeBatchAndIndex(chatKey: string, docs: VectorDocument[]): Promise<void> {
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
    const batchResult = await embeddingService.encodeBatch(texts);

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
        await encodeAndIndex(chatKey, doc);
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
        await encodeAndIndex(chatKey, doc);
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
        await encodeAndIndex(chatKey, doc);
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
        await encodeAndIndex(chatKey, doc);
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
    const BATCH_SIZE = 20;
    let successCount = 0;

    for (let i = 0; i < allDocs.length; i += BATCH_SIZE) {
        const batch = allDocs.slice(i, i + BATCH_SIZE);
        try {
            await encodeBatchAndIndex(chatKey, batch);
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
