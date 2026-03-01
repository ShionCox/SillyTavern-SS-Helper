import { db, type DBAudit } from '../db/db';

/**
 * 审计管理器 —— 负责操作审计与快照/回滚
 * 所有跨 store 的写操作都应有 audit 记录
 */
export class AuditManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 写入一条审计记录
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
     * 查询审计记录
     */
    async list(opts?: { sinceTs?: number; limit?: number }): Promise<DBAudit[]> {
        return db.audit
            .where('chatKey')
            .equals(this.chatKey)
            .filter(r => r.ts >= (opts?.sinceTs ?? 0))
            .limit(opts?.limit ?? 100)
            .toArray();
    }

    /**
     * 创建一个世界状态快照（保存到 audit，action 为 snapshot）
     * @returns 快照 auditId
     */
    async createSnapshot(note?: string): Promise<string> {
        // 收集当前 chatKey 下的所有核心数据
        const [facts, states, summaries] = await Promise.all([
            db.facts.where('chatKey').equals(this.chatKey).toArray(),
            db.world_state.where('[chatKey+path]').between([this.chatKey, ''], [this.chatKey, '\uffff']).toArray(),
            db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, '', 0], [this.chatKey, '\uffff', Infinity]).toArray(),
        ]);

        return this.log({
            action: 'snapshot',
            actor: { pluginId: 'memory-os', mode: 'manual' },
            before: {},
            after: { facts, states, summaries, note },
        });
    }

    /**
     * 从快照回滚
     * 将 facts、world_state、summaries 恢复到快照状态
     */
    async rollbackToSnapshot(snapshotId: string): Promise<void> {
        const snapshot = await db.audit.get(snapshotId);
        if (!snapshot || snapshot.action !== 'snapshot') {
            throw new Error(`快照 ${snapshotId} 不存在或类型不匹配`);
        }

        const data = snapshot.after;

        await db.transaction('rw', [db.facts, db.world_state, db.summaries], async () => {
            // 清理当前 chatKey 下的数据
            await db.facts.where('chatKey').equals(this.chatKey).delete();
            await db.world_state.where('[chatKey+path]').between([this.chatKey, ''], [this.chatKey, '\uffff']).delete();
            await db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, '', 0], [this.chatKey, '\uffff', Infinity]).delete();

            // 恢复快照数据
            if (data.facts?.length) await db.facts.bulkPut(data.facts);
            if (data.states?.length) await db.world_state.bulkPut(data.states);
            if (data.summaries?.length) await db.summaries.bulkPut(data.summaries);
        });
    }
}
