import type { ColdStartDocument, ColdStartEntityCardEntry, ColdStartRelationshipEntry } from './bootstrap-types';

/**
 * 功能：合并多个冷启动阶段文档。
 * @param documents 阶段文档列表。
 * @returns 合并后的文档。
 */
export function reduceBootstrapDocuments(documents: ColdStartDocument[]): ColdStartDocument | null {
    const validDocuments = documents.filter(Boolean);
    if (validDocuments.length <= 0) {
        return null;
    }
    const base = validDocuments[0];
    return {
        schemaVersion: base.schemaVersion,
        identity: base.identity,
        actorCards: dedupeActorCards(validDocuments.flatMap((item: ColdStartDocument) => item.actorCards ?? [])),
        entityCards: mergeEntityCards(validDocuments.map((item: ColdStartDocument) => item.entityCards)),
        worldProfileDetection: validDocuments.map((item: ColdStartDocument) => item.worldProfileDetection).find(Boolean),
        worldBase: dedupeByKey(validDocuments.flatMap((item: ColdStartDocument) => item.worldBase ?? []), (item) => `${item.schemaId}:${item.title}`),
        relationships: dedupeByKey(validDocuments.flatMap((item: ColdStartDocument) => item.relationships ?? []), (item: ColdStartRelationshipEntry) => `${item.sourceActorKey}:${item.targetActorKey}:${item.relationTag}`),
        memoryRecords: dedupeByKey(validDocuments.flatMap((item: ColdStartDocument) => item.memoryRecords ?? []), (item) => `${item.schemaId}:${item.title}`),
    };
}

/**
 * 功能：去重角色卡片。
 * @param actorCards 原始角色卡片。
 * @returns 去重后的角色卡片。
 */
function dedupeActorCards(actorCards: ColdStartDocument['actorCards']): ColdStartDocument['actorCards'] {
    return dedupeByKey(actorCards, (item) => item.actorKey);
}

/**
 * 功能：合并实体卡片集合。
 * @param entityCardsList 实体卡片集合列表。
 * @returns 合并后的实体卡片集合。
 */
function mergeEntityCards(entityCardsList: Array<ColdStartDocument['entityCards'] | undefined>): ColdStartDocument['entityCards'] {
    const organizations = dedupeByKey(entityCardsList.flatMap((item) => item?.organizations ?? []), resolveEntityKey);
    const cities = dedupeByKey(entityCardsList.flatMap((item) => item?.cities ?? []), resolveEntityKey);
    const nations = dedupeByKey(entityCardsList.flatMap((item) => item?.nations ?? []), resolveEntityKey);
    const locations = dedupeByKey(entityCardsList.flatMap((item) => item?.locations ?? []), resolveEntityKey);
    if (organizations.length <= 0 && cities.length <= 0 && nations.length <= 0 && locations.length <= 0) {
        return undefined;
    }
    return { organizations, cities, nations, locations };
}

/**
 * 功能：解析实体唯一键。
 * @param entity 实体卡片。
 * @returns 实体唯一键。
 */
function resolveEntityKey(entity: ColdStartEntityCardEntry): string {
    return String(entity.compareKey ?? `${entity.entityType}:${entity.title}`);
}

/**
 * 功能：按唯一键去重。
 * @param items 原始列表。
 * @param keyResolver 唯一键解析器。
 * @returns 去重后的列表。
 */
function dedupeByKey<T>(items: T[], keyResolver: (item: T) => string): T[] {
    const map = new Map<string, T>();
    for (const item of items) {
        const key = keyResolver(item);
        if (!key) {
            continue;
        }
        map.set(key, item);
    }
    return [...map.values()];
}
