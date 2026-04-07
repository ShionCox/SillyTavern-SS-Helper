import type { ColdStartDocument } from './bootstrap-types';

/**
 * 功能：对冷启动归并结果做轻量冲突清洗。
 * @param document 冷启动文档。
 * @returns 清洗后的文档。
 */
export function resolveBootstrapConflicts(document: ColdStartDocument): ColdStartDocument {
    return {
        ...document,
        relationships: document.relationships.filter((item, index, list) => {
            const key = `${item.sourceActorKey}:${item.targetActorKey}:${item.relationTag}`;
            return list.findIndex((candidate) => `${candidate.sourceActorKey}:${candidate.targetActorKey}:${candidate.relationTag}` === key) === index;
        }),
    };
}
