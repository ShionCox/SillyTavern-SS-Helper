import { db, type DBTemplate, type DBTemplateBinding } from '../db/db';
import type { WorldTemplate, WorldInfoEntry, WorldContextBundle } from './types';
import { Logger } from '../../../SDK/logger';
import { WorldInfoReader } from './worldinfo-reader';
import { MetaManager } from '../core/meta-manager';
import { TemplateBuilder } from './template-builder';
import { buildDisplayTables } from './table-derivation';

const logger = new Logger('TemplateManager');

/**
 * 功能：管理模板的保存、切换与世界书同步。
 *
 * 参数：
 *   chatKey (string)：当前聊天键。
 *
 * 返回：
 *   无。
 */
export class TemplateManager {
    private chatKey: string;
    private activeWorldNames: string[] = [];
    private syncInterval: ReturnType<typeof setInterval> | null = null;
    private worldInfoReader: WorldInfoReader;
    private metaManager: MetaManager;
    private templateBuilder: TemplateBuilder;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        this.worldInfoReader = new WorldInfoReader();
        this.metaManager = new MetaManager(chatKey);
        this.templateBuilder = new TemplateBuilder(chatKey);
        this.templateBuilder.setTemplateManager(this);
    }

    /**
     * 功能：安装 SillyTavern 世界书同步钩子。
     * @returns 无返回值
     */
    public installSillyTavernHooks(): void {
        if (this.syncInterval) {
            return;
        }

        const globalST = window as any;
        if (globalST?.eventSource && globalST?.event_types) {
            globalST.eventSource.on(globalST.event_types.CHAT_CHANGED, (): void => {
                void this.syncWorldInfoState().catch((error: unknown): void => {
                    logger.warn('CHAT_CHANGED 同步世界书失败', error);
                });
            });
            logger.success('已接管 ST 的 CHAT_CHANGED 事件用于同步世界书');
        }

        this.syncInterval = setInterval((): void => {
            void this.syncWorldInfoState().catch((error: unknown): void => {
                logger.warn('定时同步世界书状态失败', error);
            });
        }, 5000);
    }

    /**
     * 功能：停止世界书同步钩子。
     * @returns 无返回值
     */
    public destroy(): void {
        if (!this.syncInterval) {
            return;
        }
        clearInterval(this.syncInterval);
        this.syncInterval = null;
    }

    /**
     * 功能：同步当前聊天挂载的世界书状态。
     * @returns 当前激活模板 ID；无变化时返回现有绑定
     */
    public async syncWorldInfoState(): Promise<void> {
        try {
            const globalST = window as any;
            const stSelectedWorldInfo = globalST?.selected_world_info;
            if (!Array.isArray(stSelectedWorldInfo)) {
                return;
            }

            const normalizedNames = [...stSelectedWorldInfo]
                .map((name: unknown): string => String(name ?? '').trim())
                .filter(Boolean);

            const stNamesStr = JSON.stringify([...normalizedNames].sort());
            const myNamesStr = JSON.stringify([...this.activeWorldNames].sort());
            if (stNamesStr !== myNamesStr) {
                logger.info(`发现世界书挂载集合变化 [${this.activeWorldNames.join(',')}] -> [${normalizedNames.join(',')}]`);
            }

            this.activeWorldNames = normalizedNames;
            await this.onWorldInfoChanged(false);
        } catch (error) {
            logger.error('同步世界书状态时遇到错误', error);
        }
    }

    /**
     * 功能：忽略缓存强制重建模板。
     * @returns 新模板 ID
     */
    public async forceRebuildFromWorldInfo(): Promise<string | null> {
        return this.onWorldInfoChanged(true);
    }

    /**
     * 功能：读取当前聊天的模板绑定信息。
     * @returns 绑定信息；不存在时返回 null
     */
    public async getBinding(): Promise<DBTemplateBinding | null> {
        const binding = await db.template_bindings.get(this.chatKey);
        return binding ?? null;
    }

    /**
     * 功能：设置模板锁定状态。
     * @param locked 是否锁定
     * @returns 无返回值
     */
    public async setTemplateLock(locked: boolean): Promise<void> {
        const existing = await db.template_bindings.get(this.chatKey);
        await db.template_bindings.put({
            bindingKey: this.chatKey,
            chatKey: this.chatKey,
            activeTemplateId: existing?.activeTemplateId || (await this.metaManager.getActiveTemplateId()) || '',
            worldInfoHash: existing?.worldInfoHash || '',
            isLocked: locked,
            boundAt: Date.now(),
        });
    }

    /**
     * 功能：手动切换当前激活模板。
     * @param templateId 目标模板 ID
     * @param opts 是否同时锁定
     * @returns 无返回值
     */
    public async setActiveTemplate(templateId: string, opts?: { lock?: boolean }): Promise<void> {
        const target = await this.getById(templateId);
        if (!target) {
            throw new Error(`模板不存在: ${templateId}`);
        }

        await this.metaManager.setActiveTemplateId(templateId);

        const existing = await db.template_bindings.get(this.chatKey);
        await db.template_bindings.put({
            bindingKey: this.chatKey,
            chatKey: this.chatKey,
            activeTemplateId: templateId,
            worldInfoHash: target.worldInfoRef?.hash || existing?.worldInfoHash || '',
            isLocked: opts?.lock ?? existing?.isLocked ?? false,
            boundAt: Date.now(),
        });
    }

    /**
     * 功能：按世界书哈希查找模板。
     * @param worldInfoHash 世界书内容哈希
     * @returns 命中的模板；不存在时返回 null
     */
    public async findByWorldInfoHash(worldInfoHash: string): Promise<WorldTemplate | null> {
        const record = await db.templates
            .where('[chatKey+worldInfoHash]')
            .equals([this.chatKey, worldInfoHash])
            .first();
        if (!record) {
            return null;
        }
        return this.toWorldTemplate(record);
    }

    /**
     * 功能：保存模板到 IndexedDB。
     * @param template 要保存的模板
     * @returns 模板 ID
     */
    public async save(template: WorldTemplate): Promise<string> {
        const worldInfoHash = template.worldInfoRef?.hash || '';
        const record: DBTemplate = {
            templateId: template.templateId,
            chatKey: this.chatKey,
            worldType: template.worldType,
            name: template.name,
            factTypes: template.factTypes || [],
            policies: template.extractPolicies,
            layout: template.injectionLayout,
            tables: template.tables,
            fieldSynonyms: template.fieldSynonyms || {},
            tableSynonyms: template.tableSynonyms || {},
            templateFamilyId: template.templateFamilyId,
            revisionNo: template.revisionNo,
            revisionState: template.revisionState,
            parentTemplateId: template.parentTemplateId ?? null,
            schemaFingerprint: template.schemaFingerprint,
            lastTouchedAt: template.lastTouchedAt,
            finalizedAt: template.finalizedAt ?? null,
            worldInfoHash,
            worldInfoRef: template.worldInfoRef,
            createdAt: template.createdAt || Date.now(),
        };
        await db.templates.put(record);
        return template.templateId;
    }

    /**
     * 功能：按模板 ID 读取模板。
     * @param templateId 模板 ID
     * @returns 模板对象；不存在时返回 null
     */
    public async getById(templateId: string): Promise<WorldTemplate | null> {
        const record = await db.templates.get(templateId);
        if (!record) {
            return null;
        }
        return this.toWorldTemplate(record);
    }

    /**
     * 功能：读取当前激活模板。
     * @returns 当前激活模板；不存在时返回 null
     */
    public async getActiveTemplate(): Promise<WorldTemplate | null> {
        const activeTemplateId = await this.metaManager.getActiveTemplateId();
        if (!activeTemplateId) {
            return null;
        }
        return this.getById(activeTemplateId);
    }

    /**
     * 功能：列出当前聊天下的所有模板。
     * @returns 模板数组
     */
    public async listByChatKey(): Promise<WorldTemplate[]> {
        const records = await db.templates
            .where('[chatKey+createdAt]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .toArray();
        return records.map((record: DBTemplate): WorldTemplate => this.toWorldTemplate(record));
    }

    /**
     * 功能：在世界书变化时判断是否需要重建模板。
     * @param forceRebuild 是否强制重建
     * @returns 新的模板 ID；无变化时返回现有绑定 ID
     */
    private async onWorldInfoChanged(forceRebuild: boolean): Promise<string | null> {
        if (this.activeWorldNames.length === 0) {
            logger.info('当前未加载世界书，模板系统保持现状');
            return null;
        }

        const worldInfoEntries = await this.collectWorldInfoEntries();
        if (worldInfoEntries.length === 0) {
            logger.warn('未读取到任何世界书词条，跳过模板重建');
            return null;
        }

        const currentHash = await this.worldInfoReader.computeHash(worldInfoEntries);
        const existingBinding = await db.template_bindings.get(this.chatKey);

        if (!forceRebuild && existingBinding?.isLocked && existingBinding.activeTemplateId) {
            await this.metaManager.setActiveTemplateId(existingBinding.activeTemplateId);
            logger.info(`模板已锁定（${existingBinding.activeTemplateId}），跳过自动重建`);
            return existingBinding.activeTemplateId;
        }

        if (!forceRebuild && existingBinding?.worldInfoHash === currentHash && existingBinding.activeTemplateId) {
            await this.metaManager.setActiveTemplateId(existingBinding.activeTemplateId);
            logger.info('世界书内容哈希未变化，复用现有模板');
            return existingBinding.activeTemplateId;
        }

        const bundle: WorldContextBundle = {
            chatKey: this.chatKey,
            worldInfo: worldInfoEntries,
        };
        const template = await this.templateBuilder.ensureTemplate(bundle, forceRebuild);
        if (!template) {
            logger.warn('模板构建失败，保留当前有效模板');
            return existingBinding?.activeTemplateId ?? null;
        }

        logger.success(`已更新当前会话模板：${template.templateId}`);
        return template.templateId;
    }

    /**
     * 功能：读取当前激活世界书的全部条目。
     * @returns 规范化后的世界书条目列表
     */
    private async collectWorldInfoEntries(): Promise<WorldInfoEntry[]> {
        const globalST = window as any;
        const entries: WorldInfoEntry[] = [];

        for (const bookName of this.activeWorldNames) {
            try {
                if (typeof globalST?.loadWorldInfo !== 'function') {
                    continue;
                }
                const bookData = await globalST.loadWorldInfo(bookName);
                const rawEntries = Object.values(bookData?.entries || {}) as Array<Record<string, any>>;
                for (const item of rawEntries) {
                    const keywords = Array.isArray(item.key)
                        ? item.key.map((key: unknown): string => String(key ?? '').trim()).filter(Boolean)
                        : [];
                    const content = String(item.content ?? '').trim();
                    if (!content) {
                        continue;
                    }
                    entries.push({
                        book: String(bookName),
                        entry: String(item.comment || keywords[0] || 'untitled'),
                        keywords,
                        content,
                    });
                }
            } catch (error) {
                logger.warn(`尝试解包世界书 ${bookName} 失败`, error);
            }
        }

        return entries;
    }

    /**
     * 功能：将数据库模板记录映射为运行时模板对象。
     * @param record 数据库模板记录
     * @returns 运行时模板对象
     */
    private toWorldTemplate(record: DBTemplate): WorldTemplate {
        const worldInfoHash = record.worldInfoHash || record.worldInfoRef?.hash || '';
        return {
            templateId: record.templateId,
            chatKey: record.chatKey,
            worldType: record.worldType as 'fantasy' | 'urban' | 'custom',
            name: record.name,
            factTypes: record.factTypes || [],
            extractPolicies: record.policies || {},
            injectionLayout: record.layout || {},
            worldInfoRef: {
                book: record.worldInfoRef?.book || '',
                hash: worldInfoHash,
            },
            createdAt: record.createdAt,
            tables: buildDisplayTables(record.tables || [], []),
            fieldSynonyms: record.fieldSynonyms || {},
            tableSynonyms: record.tableSynonyms || {},
            templateFamilyId: record.templateFamilyId,
            revisionNo: record.revisionNo,
            revisionState: record.revisionState,
            parentTemplateId: record.parentTemplateId ?? null,
            schemaFingerprint: record.schemaFingerprint,
            lastTouchedAt: record.lastTouchedAt,
            finalizedAt: record.finalizedAt ?? null,
        };
    }
}
