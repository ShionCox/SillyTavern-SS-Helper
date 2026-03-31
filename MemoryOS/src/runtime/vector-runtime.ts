/**
 * 功能：向量系统运行时初始化模块。
 * 说明：集中管理 HybridRetrievalService 的创建、注入与全局检索服务单例。
 *       在 MemoryOS 运行时启动后调用 initVectorRuntime() 完成组装。
 */

import { MemoryRetrievalService } from '../services/memory-retrieval-service';
import { HybridRetrievalService } from '../services/hybrid-retrieval-service';
import { EmbeddingService } from '../services/embedding-service';
import { VectorStoreAdapterService } from '../services/vector-store-adapter';
import { VectorDocumentBuilder } from '../services/vector-document-builder';
import { logger } from './runtime-services';
import { readMemoryOSSettings, subscribeMemoryOSSettings, type MemoryOSSettings } from '../settings/store';

// ─── 全局单例 ──────────────────────────────

let sharedRetrievalService: MemoryRetrievalService | null = null;
let sharedHybridService: HybridRetrievalService | null = null;
let sharedEmbeddingService: EmbeddingService | null = null;
let sharedVectorStore: VectorStoreAdapterService | null = null;
let sharedDocumentBuilder: VectorDocumentBuilder | null = null;
let vectorRuntimeInitialized = false;
let unsubscribeVectorSettings: (() => void) | null = null;

/**
 * 功能：获取全局共享的 MemoryRetrievalService 单例。
 * 说明：所有需要检索服务的模块应通过此函数获取，避免各自创建独立实例。
 */
export function getSharedRetrievalService(): MemoryRetrievalService {
    if (!sharedRetrievalService) {
        sharedRetrievalService = new MemoryRetrievalService();
    }
    return sharedRetrievalService;
}

/**
 * 功能：获取全局共享的 HybridRetrievalService。
 */
export function getSharedHybridService(): HybridRetrievalService | null {
    return sharedHybridService;
}

/**
 * 功能：获取全局共享的 EmbeddingService。
 */
export function getSharedEmbeddingService(): EmbeddingService | null {
    return sharedEmbeddingService;
}

/**
 * 功能：获取全局共享的 VectorStoreAdapterService。
 */
export function getSharedVectorStore(): VectorStoreAdapterService | null {
    return sharedVectorStore;
}

/**
 * 功能：获取全局共享的 VectorDocumentBuilder。
 */
export function getSharedDocumentBuilder(): VectorDocumentBuilder | null {
    return sharedDocumentBuilder;
}

/**
 * 功能：向量运行时是否已完成初始化。
 */
export function isVectorRuntimeReady(): boolean {
    return vectorRuntimeInitialized;
}

/**
 * 功能：初始化向量系统运行时。
 * 说明：创建 EmbeddingService、VectorStoreAdapterService、VectorDocumentBuilder、
 *       HybridRetrievalService，并注入到共享的 MemoryRetrievalService 单例。
 *       应在 MemoryOS 构造函数中调用一次。
 */
export function initVectorRuntime(): void {
    if (vectorRuntimeInitialized) {
        return;
    }

    try {
        const settings = readMemoryOSSettings();
        sharedEmbeddingService = new EmbeddingService();
        sharedEmbeddingService.setVersion(settings.vectorEmbeddingVersion || '1');
        sharedVectorStore = new VectorStoreAdapterService();
        sharedDocumentBuilder = new VectorDocumentBuilder();

        sharedHybridService = new HybridRetrievalService({
            embeddingService: sharedEmbeddingService,
            vectorStore: sharedVectorStore,
            strategyRouterConfig: {
                enabled: settings.vectorEnableStrategyRouting,
                rerankEnabled: settings.vectorEnableRerank,
                fastCandidateWindow: settings.vectorTopK,
                fastFinalTopK: Math.min(settings.vectorTopK, settings.vectorFinalTopK),
                deepCandidateWindow: settings.vectorDeepWindow,
                deepFinalTopK: settings.vectorFinalTopK,
            },
        });

        const retrieval = getSharedRetrievalService();
        retrieval.setHybridService(sharedHybridService);
        unsubscribeVectorSettings = subscribeMemoryOSSettings((nextSettings: MemoryOSSettings): void => {
            sharedEmbeddingService?.setVersion(nextSettings.vectorEmbeddingVersion || '1');
        });

        vectorRuntimeInitialized = true;
        logger.info('[VectorRuntime] 向量系统运行时初始化完成');
    } catch (error) {
        logger.warn('[VectorRuntime] 向量系统运行时初始化失败', error);
    }
}
