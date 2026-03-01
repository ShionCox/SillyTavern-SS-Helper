import { db, type DBFact } from '../db/db';

/**
 * 事实管理器 —— 负责结构化事实的增删改查
 * 事实可覆盖更新（同 factKey 覆盖），但每次操作都应记入 audit
 */
export class FactsManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 生成稳定的 factKey
     * 格式: ${chatKey}::${type}::${entityKind}:${entityId}::${path}
     */
    private buildFactKey(fact: {
        type: string;
        entity?: { kind: string; id: string };
        path?: string;
    }): string {
        const entityPart = fact.entity
            ? `${fact.entity.kind}:${fact.entity.id}`
            : '_';
        const pathPart = fact.path || '_';
        return `${this.chatKey}::${fact.type}::${entityPart}::${pathPart}`;
    }

    /**
     * 插入或更新事实
     * @returns factKey
     */
    async upsert(fact: {
        factKey?: string;
        type: string;
        entity?: { kind: string; id: string };
        path?: string;
        value: any;
        confidence?: number;
        provenance?: any;
    }): Promise<string> {
        const factKey = fact.factKey || this.buildFactKey(fact);
        const record: DBFact = {
            factKey,
            chatKey: this.chatKey,
            type: fact.type,
            entity: fact.entity,
            path: fact.path,
            value: fact.value,
            confidence: fact.confidence,
            provenance: fact.provenance,
            updatedAt: Date.now(),
        };

        await db.facts.put(record);
        return factKey;
    }

    /**
     * 根据 factKey 获取单条事实
     */
    async get(factKey: string): Promise<DBFact | null> {
        const result = await db.facts.get(factKey);
        return result ?? null;
    }

    /**
     * 按条件查询事实
     */
    async query(opts: {
        type?: string;
        entity?: { kind: string; id: string };
        pathPrefix?: string;
        limit?: number;
    }): Promise<DBFact[]> {
        // 按 entity 查询（最精准）
        if (opts.entity) {
            return db.facts
                .where('[chatKey+entity.kind+entity.id]')
                .equals([this.chatKey, opts.entity.kind, opts.entity.id])
                .limit(opts.limit ?? 100)
                .toArray();
        }

        // 按 type 查询
        if (opts.type) {
            return db.facts
                .where('[chatKey+type]')
                .equals([this.chatKey, opts.type])
                .limit(opts.limit ?? 100)
                .toArray();
        }

        // 按 path 前缀查询
        if (opts.pathPrefix) {
            return db.facts
                .where('[chatKey+path]')
                .between(
                    [this.chatKey, opts.pathPrefix],
                    [this.chatKey, opts.pathPrefix + '\uffff']
                )
                .limit(opts.limit ?? 100)
                .toArray();
        }

        // 无过滤：返回最近更新的
        return db.facts
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .reverse()
            .limit(opts.limit ?? 100)
            .toArray();
    }

    /**
     * 删除指定事实
     */
    async remove(factKey: string): Promise<void> {
        await db.facts.delete(factKey);
    }
}
