import { db, type DBSummary } from '../db/db';

/**
 * 摘要管理器 —— 负责短/中/长层级摘要的写入与查询
 * 支持 message / scene / arc 三种分层
 */
export class SummariesManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 插入或更新一条摘要
     * @returns summaryId
     */
    async upsert(summary: {
        summaryId?: string;
        level: "message" | "scene" | "arc";
        messageId?: string;
        title?: string;
        content: string;
        keywords?: string[];
        range?: { fromMessageId?: string; toMessageId?: string };
        source?: { extractor?: string; provider?: string };
    }): Promise<string> {
        const summaryId = summary.summaryId || crypto.randomUUID();
        const record: DBSummary = {
            summaryId,
            chatKey: this.chatKey,
            level: summary.level,
            title: summary.title,
            content: summary.content,
            keywords: summary.keywords,
            range: summary.range,
            createdAt: Date.now(),
            source: summary.source,
        };

        await db.summaries.put(record);
        return summaryId;
    }

    /**
     * 按条件查询摘要
     */
    async query(opts: {
        level?: string;
        sinceTs?: number;
        limit?: number;
    }): Promise<DBSummary[]> {
        if (opts.level) {
            return db.summaries
                .where('[chatKey+level+createdAt]')
                .between(
                    [this.chatKey, opts.level, opts.sinceTs ?? 0],
                    [this.chatKey, opts.level, Infinity]
                )
                .limit(opts.limit ?? 50)
                .toArray();
        }

        // 无 level 过滤：取最近创建的
        return db.summaries
            .where('[chatKey+level+createdAt]')
            .between(
                [this.chatKey, Dexie.minKey, opts.sinceTs ?? 0],
                [this.chatKey, Dexie.maxKey, Infinity]
            )
            .limit(opts.limit ?? 50)
            .toArray();
    }

    /**
     * 根据 summaryId 获取单条摘要
     */
    async getById(summaryId: string): Promise<DBSummary | undefined> {
        return db.summaries.get(summaryId);
    }
}

// 需要 Dexie 导入以使用 minKey/maxKey
import Dexie from 'dexie';
