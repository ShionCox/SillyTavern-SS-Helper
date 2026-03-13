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
                schemaVersion: 1,
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
     * 更新 meta 中任意字段
     */
    async updateMeta(partial: Partial<Omit<DBMeta, 'chatKey'>>): Promise<void> {
        await db.meta.update(this.chatKey, partial);
    }
}
