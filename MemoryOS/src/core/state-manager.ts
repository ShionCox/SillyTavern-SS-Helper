import { db, type DBWorldState } from '../db/db';

/**
 * 世界状态管理器 —— 物化视图层
 * world_state 可以由 facts/events 重建，这里是快速缓存视图
 */
export class StateManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 构造 stateKey
     */
    private buildStateKey(path: string): string {
        return `${this.chatKey}::${path}`;
    }

    /**
     * 读取指定路径的世界状态
     */
    async get(path: string): Promise<any | null> {
        const stateKey = this.buildStateKey(path);
        const record = await db.world_state.get(stateKey);
        return record?.value ?? null;
    }

    /**
     * 写入/覆盖指定路径的世界状态
     */
    async set(path: string, value: any, meta?: { sourceEventId?: string }): Promise<void> {
        const stateKey = this.buildStateKey(path);
        const record: DBWorldState = {
            stateKey,
            chatKey: this.chatKey,
            path,
            value,
            sourceEventId: meta?.sourceEventId,
            updatedAt: Date.now(),
        };
        await db.world_state.put(record);
    }

    /**
     * 批量 JSON Patch 式更新
     */
    async patch(
        patches: Array<{ op: "add" | "replace" | "remove"; path: string; value?: any }>,
        meta?: any
    ): Promise<void> {
        await db.transaction('rw', db.world_state, async () => {
            for (const p of patches) {
                if (p.op === 'remove') {
                    await db.world_state.delete(this.buildStateKey(p.path));
                } else {
                    // add 和 replace 均为 put
                    await this.set(p.path, p.value, meta);
                }
            }
        });
    }

    /**
     * 按 path 前缀查询（取某实体树）
     */
    async query(prefix: string): Promise<Record<string, any>> {
        const records = await db.world_state
            .where('[chatKey+path]')
            .between(
                [this.chatKey, prefix],
                [this.chatKey, prefix + '\uffff']
            )
            .toArray();

        const result: Record<string, any> = {};
        for (const r of records) {
            result[r.path] = r.value;
        }
        return result;
    }
}
