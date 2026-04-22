import type {
    DBActorMemoryProfile,
    DBAudit,
    DBChatPluginRecord,
    DBChatPluginState,
    DBEvent,
    DBMemoryEntry,
    DBMemoryEntryAuditRecord,
    DBMemoryEntryType,
    DBMemoryMutationHistory,
    DBMemoryRelationship,
    DBMeta,
    DBRoleEntryMemory,
    DBSummarySnapshot,
    DBTemplate,
    DBWorldProfileBinding,
    MemoryChatDatabaseSnapshot,
} from './db';

export type MemoryDatabaseSnapshotSourceKind = 'database_snapshot' | 'prompt_test_bundle' | 'unknown';

export interface MemoryDatabaseSnapshotCollectionInspection {
    key: keyof Pick<
        MemoryChatDatabaseSnapshot,
        | 'events'
        | 'templates'
        | 'audit'
        | 'memoryMutationHistory'
        | 'memoryEntryAuditRecords'
        | 'memoryEntries'
        | 'memoryEntryTypes'
        | 'actorMemoryProfiles'
        | 'roleEntryMemory'
        | 'memoryRelationships'
        | 'summarySnapshots'
        | 'worldProfileBindings'
        | 'pluginRecords'
    >;
    label: string;
    count: number;
    present: boolean;
    required: boolean;
}

export interface MemoryDatabaseSnapshotVectorInspection {
    vectorDocuments: number;
    vectorIndex: number;
    vectorRecallStats: number;
    total: number;
}

export interface MemoryDatabaseSnapshotInspectionReport {
    valid: boolean;
    sourceKind: MemoryDatabaseSnapshotSourceKind;
    chatKey: string;
    generatedAt?: number;
    exportedAt?: number;
    missingFields: string[];
    invalidRecordCount: number;
    collectionCounts: MemoryDatabaseSnapshotCollectionInspection[];
    vectorCounts: MemoryDatabaseSnapshotVectorInspection;
    warnings: string[];
    database: MemoryChatDatabaseSnapshot | null;
}

interface SnapshotCollectionConfig {
    key: MemoryDatabaseSnapshotCollectionInspection['key'];
    label: string;
    required: boolean;
}

const COLLECTION_CONFIGS: SnapshotCollectionConfig[] = [
    { key: 'events', label: '事件记录', required: true },
    { key: 'templates', label: '模板记录', required: true },
    { key: 'audit', label: '审计记录', required: true },
    { key: 'memoryMutationHistory', label: '变更历史', required: true },
    { key: 'memoryEntryAuditRecords', label: '词条审计', required: true },
    { key: 'memoryEntries', label: '记忆词条', required: true },
    { key: 'memoryEntryTypes', label: '词条类型', required: true },
    { key: 'actorMemoryProfiles', label: '角色档案', required: true },
    { key: 'roleEntryMemory', label: '角色绑定', required: true },
    { key: 'memoryRelationships', label: '角色关系', required: true },
    { key: 'summarySnapshots', label: '总结快照', required: true },
    { key: 'worldProfileBindings', label: '世界画像', required: true },
    { key: 'pluginRecords', label: '插件记录', required: true },
];

const VECTOR_COLLECTIONS: Record<keyof MemoryDatabaseSnapshotVectorInspection, string> = {
    vectorDocuments: 'vector_documents',
    vectorIndex: 'vector_index',
    vectorRecallStats: 'vector_recall_stats',
    total: '',
};

/**
 * 功能：检查未知 JSON 是否为可读取的 MemoryOS 导出数据库。
 * @param raw 原始 JSON 对象。
 * @returns 数据库完整性检查报告。
 */
export function inspectMemoryDatabaseSnapshot(raw: unknown): MemoryDatabaseSnapshotInspectionReport {
    const unwrapped = unwrapSnapshotContainer(raw);
    const sourceKind = resolveSnapshotSourceKind(raw, unwrapped);
    const missingFields: string[] = [];
    const warnings: string[] = [];
    const database = normalizeMemoryDatabaseSnapshot(unwrapped, missingFields);
    if (!database) {
        return {
            valid: false,
            sourceKind,
            chatKey: '',
            missingFields: ['chatKey', 'database'],
            invalidRecordCount: 0,
            collectionCounts: [],
            vectorCounts: {
                vectorDocuments: 0,
                vectorIndex: 0,
                vectorRecallStats: 0,
                total: 0,
            },
            warnings: ['未识别到可用的 MemoryOS 数据库快照。'],
            database: null,
        };
    }

    const collectionCounts = buildCollectionInspection(unwrapped, database);
    const invalidRecordCount = countInvalidRecords(database);
    const vectorCounts = countVectorCollections(database.pluginRecords);
    const exportedAt = readNumericField(raw, 'exportedAt');
    if (vectorCounts.total <= 0) {
        warnings.push('未在插件记录中检测到向量文档、向量索引或向量召回统计。');
    }
    if (invalidRecordCount > 0) {
        warnings.push(`发现 ${invalidRecordCount} 条无法识别为对象的记录。`);
    }
    if (missingFields.length > 0) {
        warnings.push(`缺少 ${missingFields.length} 个导出字段。`);
    }

    return {
        valid: missingFields.length <= 0,
        sourceKind,
        chatKey: database.chatKey,
        generatedAt: database.generatedAt,
        exportedAt,
        missingFields,
        invalidRecordCount,
        collectionCounts,
        vectorCounts,
        warnings,
        database,
    };
}

/**
 * 功能：从外层包装中取出数据库快照主体。
 * @param raw 原始 JSON 对象。
 * @returns 可能的数据库快照对象。
 */
function unwrapSnapshotContainer(raw: unknown): unknown {
    const record = toRecord(raw);
    if (Object.keys(record).length <= 0) {
        return raw;
    }
    const payload = toRecord(record.payload);
    if (Object.keys(payload).length > 0) {
        return unwrapSnapshotContainer(payload);
    }
    const bundle = toRecord(record.bundle);
    if (Object.keys(bundle).length > 0) {
        return unwrapSnapshotContainer(bundle);
    }
    const database = toRecord(record.database);
    if (Object.keys(database).length > 0) {
        return database;
    }
    return raw;
}

/**
 * 功能：判断导出 JSON 的来源形态。
 * @param raw 原始 JSON 对象。
 * @param unwrapped 解包后的对象。
 * @returns 来源形态。
 */
function resolveSnapshotSourceKind(raw: unknown, unwrapped: unknown): MemoryDatabaseSnapshotSourceKind {
    const record = toRecord(raw);
    const unwrappedRecord = toRecord(unwrapped);
    if (Object.keys(toRecord(record.database)).length > 0 || Object.keys(toRecord(toRecord(record.payload).database)).length > 0) {
        return 'prompt_test_bundle';
    }
    if (typeof unwrappedRecord.chatKey === 'string') {
        return 'database_snapshot';
    }
    return 'unknown';
}

/**
 * 功能：归一化数据库快照结构，并记录缺失字段。
 * @param value 候选快照对象。
 * @param missingFields 缺失字段输出数组。
 * @returns 归一化快照；无法识别时返回 null。
 */
function normalizeMemoryDatabaseSnapshot(value: unknown, missingFields: string[]): MemoryChatDatabaseSnapshot | null {
    const record = toRecord(value);
    const chatKey = String(record.chatKey ?? '').trim();
    if (!chatKey) {
        return null;
    }
    for (const config of COLLECTION_CONFIGS) {
        if (!Array.isArray(record[config.key])) {
            missingFields.push(config.key);
        }
    }
    if (!Object.prototype.hasOwnProperty.call(record, 'meta')) {
        missingFields.push('meta');
    }
    if (!Object.prototype.hasOwnProperty.call(record, 'pluginState')) {
        missingFields.push('pluginState');
    }

    return {
        chatKey,
        generatedAt: readNumericField(record, 'generatedAt') ?? Date.now(),
        events: readArrayField<DBEvent>(record, 'events'),
        templates: readArrayField<DBTemplate>(record, 'templates'),
        audit: readArrayField<DBAudit>(record, 'audit'),
        meta: toNullableRecord<DBMeta>(record.meta),
        memoryMutationHistory: readArrayField<DBMemoryMutationHistory>(record, 'memoryMutationHistory'),
        memoryEntryAuditRecords: readArrayField<DBMemoryEntryAuditRecord>(record, 'memoryEntryAuditRecords'),
        memoryEntries: readArrayField<DBMemoryEntry>(record, 'memoryEntries'),
        memoryEntryTypes: readArrayField<DBMemoryEntryType>(record, 'memoryEntryTypes'),
        actorMemoryProfiles: readArrayField<DBActorMemoryProfile>(record, 'actorMemoryProfiles'),
        roleEntryMemory: readArrayField<DBRoleEntryMemory>(record, 'roleEntryMemory'),
        memoryRelationships: readArrayField<DBMemoryRelationship>(record, 'memoryRelationships'),
        summarySnapshots: readArrayField<DBSummarySnapshot>(record, 'summarySnapshots'),
        worldProfileBindings: readArrayField<DBWorldProfileBinding>(record, 'worldProfileBindings'),
        pluginState: toNullableRecord<DBChatPluginState>(record.pluginState),
        pluginRecords: readArrayField<DBChatPluginRecord>(record, 'pluginRecords'),
    };
}

/**
 * 功能：构建集合检查结果。
 * @param source 原始快照对象。
 * @param database 归一化快照。
 * @returns 集合检查列表。
 */
function buildCollectionInspection(
    source: unknown,
    database: MemoryChatDatabaseSnapshot,
): MemoryDatabaseSnapshotCollectionInspection[] {
    const record = toRecord(source);
    return COLLECTION_CONFIGS.map((config: SnapshotCollectionConfig): MemoryDatabaseSnapshotCollectionInspection => {
        const values = database[config.key];
        return {
            key: config.key,
            label: config.label,
            count: Array.isArray(values) ? values.length : 0,
            present: Array.isArray(record[config.key]),
            required: config.required,
        };
    });
}

/**
 * 功能：统计插件记录中的向量集合数量。
 * @param pluginRecords 插件记录。
 * @returns 向量集合统计。
 */
function countVectorCollections(pluginRecords: DBChatPluginRecord[]): MemoryDatabaseSnapshotVectorInspection {
    const vectorDocuments = countPluginCollection(pluginRecords, VECTOR_COLLECTIONS.vectorDocuments);
    const vectorIndex = countPluginCollection(pluginRecords, VECTOR_COLLECTIONS.vectorIndex);
    const vectorRecallStats = countPluginCollection(pluginRecords, VECTOR_COLLECTIONS.vectorRecallStats);
    return {
        vectorDocuments,
        vectorIndex,
        vectorRecallStats,
        total: vectorDocuments + vectorIndex + vectorRecallStats,
    };
}

/**
 * 功能：统计指定插件集合记录数。
 * @param pluginRecords 插件记录。
 * @param collection 集合名。
 * @returns 记录数。
 */
function countPluginCollection(pluginRecords: DBChatPluginRecord[], collection: string): number {
    return pluginRecords.filter((row: DBChatPluginRecord): boolean => String(row.collection ?? '').trim() === collection).length;
}

/**
 * 功能：统计快照中不是对象的记录数量。
 * @param database 归一化快照。
 * @returns 异常记录数量。
 */
function countInvalidRecords(database: MemoryChatDatabaseSnapshot): number {
    let count = 0;
    for (const config of COLLECTION_CONFIGS) {
        const rows = database[config.key] as unknown[];
        count += rows.filter((row: unknown): boolean => !isRecord(row)).length;
    }
    return count;
}

/**
 * 功能：读取数组字段。
 * @param record 来源对象。
 * @param key 字段名。
 * @returns 数组字段。
 */
function readArrayField<TValue>(record: Record<string, unknown>, key: string): TValue[] {
    const value = record[key];
    return Array.isArray(value) ? value as TValue[] : [];
}

/**
 * 功能：读取数字字段。
 * @param value 来源对象。
 * @param key 字段名。
 * @returns 数字值；不存在或非法时返回 undefined。
 */
function readNumericField(value: unknown, key: string): number | undefined {
    const record = toRecord(value);
    const numericValue = Number(record[key]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return undefined;
    }
    return Math.trunc(numericValue);
}

/**
 * 功能：把未知值转为可空对象。
 * @param value 原始值。
 * @returns 对象或 null。
 */
function toNullableRecord<TValue>(value: unknown): TValue | null {
    return isRecord(value) ? value as TValue : null;
}

/**
 * 功能：判断值是否为普通对象。
 * @param value 原始值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：把未知值转为普通对象。
 * @param value 原始值。
 * @returns 对象；无法转换时返回空对象。
 */
function toRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {};
}
