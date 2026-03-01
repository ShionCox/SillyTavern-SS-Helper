import { db, type DBEvent } from '../db/db';
import type { EventEnvelope } from '../../../SDK/stx';

/**
 * 事件流管理器 —— 负责事件的写入与查询
 * 所有插件行为都优先落入 events（append-only 流）
 */
export class EventsManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 追加一条事件到事件流
     * @returns 生成的 eventId
     */
    async append<T>(
        type: string,
        payload: T,
        meta?: { sourceMessageId?: string; sourcePlugin?: string }
    ): Promise<string> {
        const eventId = crypto.randomUUID();
        const ts = Date.now();

        const record: DBEvent = {
            eventId,
            chatKey: this.chatKey,
            ts,
            type,
            source: {
                pluginId: meta?.sourcePlugin || 'unknown',
                version: '1.0.0'
            },
            payload,
            refs: meta?.sourceMessageId ? { messageId: meta.sourceMessageId } : undefined,
        };

        await db.events.add(record);
        return eventId;
    }

    /**
     * 按条件查询事件流
     */
    async query(opts: {
        type?: string;
        sinceTs?: number;
        limit?: number;
    }): Promise<Array<EventEnvelope<any>>> {
        let collection = db.events
            .where('[chatKey+ts]')
            .between(
                [this.chatKey, opts.sinceTs ?? 0],
                [this.chatKey, Infinity]
            );

        if (opts.type) {
            // 如果指定了 type，使用更精确的复合索引
            collection = db.events
                .where('[chatKey+type+ts]')
                .between(
                    [this.chatKey, opts.type, opts.sinceTs ?? 0],
                    [this.chatKey, opts.type, Infinity]
                );
        }

        let results = await collection
            .limit(opts.limit ?? 100)
            .toArray();

        return results.map(r => ({
            id: r.eventId,
            ts: r.ts,
            chatKey: r.chatKey,
            source: r.source,
            type: r.type,
            payload: r.payload,
        }));
    }

    /**
     * 获取指定事件的详情
     */
    async getById(eventId: string): Promise<DBEvent | undefined> {
        return db.events.get(eventId);
    }

    /**
     * 获取事件总数（当前 chatKey 下）
     */
    async count(): Promise<number> {
        return db.events.where('chatKey').equals(this.chatKey).count();
    }
}
