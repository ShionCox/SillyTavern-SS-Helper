/**
 * 功能：TriviumDB 向量存储适配器占位。
 * 说明：预留接口，后续接入 TriviumDB 时实现。
 */

import type {
    VectorStoreAdapter,
    IndexedVectorDocument,
    VectorSearchQuery,
    VectorSearchHit,
} from '../../types/vector-search';

/**
 * 功能：TriviumDB 向量存储适配器（未实现）。
 */
export class TriviumDBAdapter implements VectorStoreAdapter {
    isAvailable(): boolean {
        return false;
    }

    async upsertDocuments(_docs: IndexedVectorDocument[]): Promise<void> {
        throw new Error('TriviumDB 适配器尚未实现');
    }

    async deleteByVectorDocIds(_ids: string[]): Promise<void> {
        throw new Error('TriviumDB 适配器尚未实现');
    }

    async deleteBySource(_sourceKind: string, _sourceIds: string[]): Promise<void> {
        throw new Error('TriviumDB 适配器尚未实现');
    }

    async search(_query: VectorSearchQuery): Promise<VectorSearchHit[]> {
        throw new Error('TriviumDB 适配器尚未实现');
    }

    async rebuildAll(_docs: IndexedVectorDocument[]): Promise<void> {
        throw new Error('TriviumDB 适配器尚未实现');
    }

    async clearByChat(_chatKey: string): Promise<void> {
        throw new Error('TriviumDB 适配器尚未实现');
    }
}
