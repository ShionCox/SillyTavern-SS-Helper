import { db, clearChatData, type DBAudit } from '../db/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * 功能：审计管理器，负责审计日志、快照与回滚。
 */
export class AuditManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 功能：写入一条审计记录。
     * @param entry 审计内容。
     * @returns 审计记录 ID。
     */
    async log(entry: {
        action: string;
        actor: { pluginId: string; mode: string };
        before: any;
        after: any;
        refs?: any;
    }): Promise<string> {
        const auditId = crypto.randomUUID();
        const record: DBAudit = {
            auditId,
            chatKey: this.chatKey,
            ts: Date.now(),
            action: entry.action,
            actor: entry.actor,
            before: entry.before,
            after: entry.after,
            refs: entry.refs,
        };
        await db.audit.add(record);
        return auditId;
    }

    /**
     * 功能：查询审计记录。
     * @param opts 查询参数。
     * @returns 审计记录数组。
     */
    async list(opts?: { sinceTs?: number; limit?: number }): Promise<DBAudit[]> {
        return db.audit
            .where('chatKey')
            .equals(this.chatKey)
            .filter((record: DBAudit) => record.ts >= (opts?.sinceTs ?? 0))
            .limit(opts?.limit ?? 100)
            .toArray();
    }

    /**
     * 功能：创建全量核心 store 快照。
     * @param note 快照备注。
     * @returns 快照 ID。
     */
    async createSnapshot(note?: string): Promise<string> {
        const [events, facts, states, summaries, templates, meta, binding, worldInfoCache, vectorChunks, vectorEmbeddings, vectorMeta] = await Promise.all([
            db.events.where('chatKey').equals(this.chatKey).toArray(),
            db.facts.where('chatKey').equals(this.chatKey).toArray(),
            db.world_state.where('[chatKey+path]').between([this.chatKey, ''], [this.chatKey, '\uffff']).toArray(),
            db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, '', 0], [this.chatKey, '\uffff', Infinity]).toArray(),
            db.templates.where('[chatKey+createdAt]').between([this.chatKey, 0], [this.chatKey, Infinity]).toArray(),
            db.meta.get(this.chatKey),
            db.template_bindings.get(this.chatKey),
            db.worldinfo_cache.where('chatKey').equals(this.chatKey).toArray(),
            db.vector_chunks.where('chatKey').equals(this.chatKey).toArray(),
            db.vector_embeddings.where('chatKey').equals(this.chatKey).toArray(),
            db.vector_meta.where('chatKey').equals(this.chatKey).toArray(),
        ]);

        return this.log({
            action: 'snapshot',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: {},
            after: {
                snapshotVersion: 3,
                note,
                chatKey: this.chatKey,
                events,
                facts,
                states,
                summaries,
                templates,
                meta,
                binding,
                worldInfoCache,
                vectorChunks,
                vectorEmbeddings,
                vectorMeta,
            },
        });
    }

    /**
     * 功能：从快照恢复全量核心 store。
     * @param snapshotId 快照 ID。
     * @returns 无返回值。
     */
    async rollbackToSnapshot(snapshotId: string): Promise<void> {
        const snapshot = await db.audit.get(snapshotId);
        if (!snapshot || snapshot.action !== 'snapshot') {
            throw new Error(`快照 ${snapshotId} 不存在或类型不匹配`);
        }

        const data = snapshot.after || {};
        const events = Array.isArray(data.events) ? data.events : [];
        const facts = Array.isArray(data.facts) ? data.facts : [];
        const states = Array.isArray(data.states) ? data.states : [];
        const summaries = Array.isArray(data.summaries) ? data.summaries : [];
        const templates = Array.isArray(data.templates) ? data.templates : [];
        const meta = data.meta || null;
        const binding = data.binding || null;
        const worldInfoCache = Array.isArray(data.worldInfoCache) ? data.worldInfoCache : [];
        const vectorChunks = Array.isArray(data.vectorChunks) ? data.vectorChunks : [];
        const vectorEmbeddings = Array.isArray(data.vectorEmbeddings) ? data.vectorEmbeddings : [];
        const vectorMeta = Array.isArray(data.vectorMeta) ? data.vectorMeta : [];

        await clearChatData(this.chatKey, { includeAudit: false });

        await db.transaction(
            'rw',
            [
                db.events,
                db.facts,
                db.world_state,
                db.summaries,
                db.templates,
                db.meta,
                db.template_bindings,
                db.worldinfo_cache,
                db.vector_chunks,
                db.vector_embeddings,
                db.vector_meta,
            ],
            async () => {
                if (events.length) {
                    await db.events.bulkPut(events.map((event: any) => ({ ...event, chatKey: this.chatKey })));
                }
                if (facts.length) {
                    await db.facts.bulkPut(facts.map((fact: any) => ({ ...fact, chatKey: this.chatKey })));
                }
                if (states.length) {
                    await db.world_state.bulkPut(states.map((state: any) => ({ ...state, chatKey: this.chatKey })));
                }
                if (summaries.length) {
                    await db.summaries.bulkPut(summaries.map((summary: any) => ({ ...summary, chatKey: this.chatKey })));
                }
                if (templates.length) {
                    await db.templates.bulkPut(templates.map((template: any) => ({ ...template, chatKey: this.chatKey })));
                }
                if (meta) {
                    await db.meta.put({ ...meta, chatKey: this.chatKey });
                }
                if (binding) {
                    await db.template_bindings.put({
                        ...binding,
                        bindingKey: this.chatKey,
                        chatKey: this.chatKey,
                    });
                }
                if (worldInfoCache.length) {
                    await db.worldinfo_cache.bulkPut(worldInfoCache.map((item: any) => ({
                        ...item,
                        chatKey: this.chatKey,
                        cacheKey: `${this.chatKey}::${String(item.bookName ?? '')}`,
                    })));
                }
                if (vectorChunks.length) {
                    await db.vector_chunks.bulkPut(vectorChunks.map((item: any) => ({
                        ...item,
                        chatKey: this.chatKey,
                    })));
                }
                if (vectorEmbeddings.length) {
                    await db.vector_embeddings.bulkPut(vectorEmbeddings.map((item: any) => ({
                        ...item,
                        chatKey: this.chatKey,
                    })));
                }
                if (vectorMeta.length) {
                    await db.vector_meta.bulkPut(vectorMeta.map((item: any) => ({
                        ...item,
                        chatKey: this.chatKey,
                        metaKey: `${this.chatKey}::${String(item.bookId ?? '')}`,
                    })));
                }
            }
        );

        await this.log({
            action: 'rollback',
            actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
            before: { snapshotId },
            after: { restoredFrom: snapshotId },
        });
    }
}
