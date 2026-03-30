/**
 * 功能：定义统一 staging repository 接口。
 * @template T staging 快照类型。
 */
export interface StagingRepository<T> {
    save(runId: string, payload: T): Promise<void>;
    load(runId: string): Promise<T | null>;
    append(runId: string, payload: Partial<T>): Promise<void>;
    clear(runId: string): Promise<void>;
}

/**
 * 功能：创建基于内存的统一 staging repository。
 * @template T staging 快照类型。
 * @returns repository 实例。
 */
export function createInMemoryStagingRepository<T extends object>(): StagingRepository<T> {
    const store = new Map<string, T>();
    return {
        async save(runId: string, payload: T): Promise<void> {
            store.set(runId, deepClone(payload));
        },
        async load(runId: string): Promise<T | null> {
            const snapshot = store.get(runId);
            return snapshot ? deepClone(snapshot) : null;
        },
        async append(runId: string, payload: Partial<T>): Promise<void> {
            const current = store.get(runId) ?? {} as T;
            store.set(runId, mergeRecord(current, payload));
        },
        async clear(runId: string): Promise<void> {
            store.delete(runId);
        },
    };
}

/**
 * 功能：深拷贝普通对象，避免 staging 外部引用被串改。
 * @template T 对象类型。
 * @param value 原始对象。
 * @returns 拷贝结果。
 */
function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 功能：合并普通对象，追加时保留旧快照中未被覆盖的字段。
 * @template T 对象类型。
 * @param current 当前快照。
 * @param patch 增量补丁。
 * @returns 合并后的快照。
 */
function mergeRecord<T extends object>(current: T, patch: Partial<T>): T {
    return Object.assign({}, deepClone(current), deepClone(patch)) as T;
}
