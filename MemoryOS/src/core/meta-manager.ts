import { db, patchSdkChatShared, type DBMeta } from '../db/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';

/**
 * Meta 管理器 —— 管理每个 chatKey 的元数据
 * 包括 schema 版本、压缩时间戳、活跃模板 ID 等
 */
export class MetaManager {
    private chatKey: string;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 确保当前 chat 的 meta 记录存在（首次访问时初始化）
     */
    async ensureInit(): Promise<void> {
        const existing = await db.meta.get(this.chatKey);
        if (!existing) {
            const initial: DBMeta = {
                chatKey: this.chatKey,
                schemaVersion: 2,
                memoryMigrationStage: 'legacy_compatible',
            };
            await db.meta.add(initial);
        }
    }

    /**
     * 获取当前活跃的模板 ID
     */
    async getActiveTemplateId(): Promise<string | null> {
        const meta = await db.meta.get(this.chatKey);
        return meta?.activeTemplateId ?? null;
    }

    /**
     * 设置当前活跃模板 ID
     */
    async setActiveTemplateId(templateId: string): Promise<void> {
        await db.meta.update(this.chatKey, { activeTemplateId: templateId });
        void patchSdkChatShared(this.chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: { activeTemplate: templateId },
            },
        });
    }

    /**
     * 获取完整的 meta 记录
     */
    async getMeta(): Promise<DBMeta | undefined> {
        return db.meta.get(this.chatKey);
    }

    /**
     * 功能：记录画像与质量诊断最近一次按助手楼层触发的刷新游标。
     * @param payload 刷新游标。
     * @returns 无返回值。
     */
    async markRefreshCheckpoints(payload: {
        profileAssistantTurnCount?: number;
        qualityAssistantTurnCount?: number;
    }): Promise<void> {
        const update: Record<string, unknown> = {};
        if (payload.profileAssistantTurnCount !== undefined) {
            update.lastProfileRefreshAssistantTurnCount = payload.profileAssistantTurnCount;
        }
        if (payload.qualityAssistantTurnCount !== undefined) {
            update.lastQualityRefreshAssistantTurnCount = payload.qualityAssistantTurnCount;
        }
        if (Object.keys(update).length === 0) {
            return;
        }
        await db.meta.update(this.chatKey, update);
    }

    /**
     * 功能：记录最近一次抽取执行状态。
     * @param payload 抽取状态信息。
     * @returns 无返回值。
     */
    async markLastExtract(payload: {
        ts: number;
        eventCount: number;
        userMsgCount: number;
        windowHash: string;
        activeAssistantTurnCount?: number;
        lastCommittedTurnCursor?: string;
        lastVisibleTurnSnapshotHash?: string;
    }): Promise<void> {
        const update: Record<string, unknown> = {
            lastExtractTs: payload.ts,
            lastExtractEventCount: payload.eventCount,
            lastExtractUserMsgCount: payload.userMsgCount,
            lastExtractWindowHash: payload.windowHash,
        };
        if (payload.activeAssistantTurnCount !== undefined) {
            update.lastExtractAssistantTurnCount = payload.activeAssistantTurnCount;
        }
        if (payload.lastCommittedTurnCursor !== undefined) {
            update.lastCommittedTurnCursor = payload.lastCommittedTurnCursor;
        }
        if (payload.lastVisibleTurnSnapshotHash !== undefined) {
            update.lastVisibleTurnSnapshotHash = payload.lastVisibleTurnSnapshotHash;
        }
        await db.meta.update(this.chatKey, update);
    }
}
