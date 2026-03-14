import { db, type DBTemplate, type DBTemplateBinding } from '../db/db';
import type { WorldTemplate, WorldInfoEntry, WorldContextBundle } from './types';
import { Logger } from '../../../SDK/logger';
import { WorldInfoReader } from './worldinfo-reader';
import { MetaManager } from '../core/meta-manager';
import { TemplateBuilder } from './template-builder';

const logger = new Logger('TemplateManager');

/**
 * 世界模板管理器
 * 负责模板 CRUD、按世界书内容 hash 绑定模板、以及 activeTemplate 的切换与锁定。
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
     * 安装 SillyTavern 生命周期监听（仅主实例调用一次）。
     */
    public installSillyTavernHooks(): void {
        if (this.syncInterval) return; // 防止重复安装
        const globalST = window as any;
        if (globalST?.eventSource && globalST?.event_types) {
            globalST.eventSource.on(globalST.event_types.CHAT_CHANGED, () => {
                this.syncWorldInfoState().catch((error: unknown) => {
                    logger.warn('CHAT_CHANGED 同步世界书失败', error);
                });
            });
            logger.success('成功接管了 ST 的 CHAT_CHANGED 事件用于同步世界书');
        }

        // 轮询兜底：即使名称不变，也会检测内容 hash 是否变化。
        this.syncInterval = setInterval(() => {
            this.syncWorldInfoState().catch((error: unknown) => {
                logger.warn('定时同步世界书状态失败', error);
            });
        }, 5000);
    }

    /**
     * 停止监听（析构用）。
     */
    public destroy(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    /**
     * 同步当前聊天加载的世界书状态。
     * 无论书名是否变化，都会在 onWorldInfoChanged 内做内容级 hash 检测。
     */
    public async syncWorldInfoState(): Promise<void> {
        try {
            const globalST = window as any;
            const stSelectedWorldInfo = globalST?.selected_world_info;
            if (!Array.isArray(stSelectedWorldInfo)) {
                return;
            }

            const normalizedNames = [...stSelectedWorldInfo]
                .map((name: unknown) => String(name ?? '').trim())
                .filter(Boolean);

            const stNamesStr = JSON.stringify([...normalizedNames].sort());
            const myNamesStr = JSON.stringify([...this.activeWorldNames].sort());
            if (stNamesStr !== myNamesStr) {
                logger.info(`发现世界书挂载集合变化: [${this.activeWorldNames.join(',')}] -> [${normalizedNames.join(',')}]`);
            }

            this.activeWorldNames = normalizedNames;
            await this.onWorldInfoChanged(false);
        } catch (e) {
            logger.error('尝试同步世界书状态时遇到错误', e);
        }
    }

    /**
     * 强制重建模板（忽略 hash 命中缓存）。
     */
    public async forceRebuildFromWorldInfo(): Promise<string | null> {
        return this.onWorldInfoChanged(true);
    }

    /**
     * 获取当前聊天模板绑定信息。
     */
    public async getBinding(): Promise<DBTemplateBinding | null> {
        const binding = await db.template_bindings.get(this.chatKey);
        return binding ?? null;
    }

    /**
     * 设置模板锁定状态。
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
     * 手动切换 active template。
     * @param templateId 目标模板 ID
     * @param opts lock=true 时会锁定模板，后续世界书变化不自动重建
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
     * 按内容 hash 查找当前聊天已存在模板。
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
     * 保存一个模板到 IndexedDB。
     */
    public async save(template: WorldTemplate): Promise<string> {
        const worldInfoHash = template.worldInfoRef?.hash || '';
        const record: DBTemplate = {
            templateId: template.templateId,
            chatKey: this.chatKey,
            worldType: template.worldType,
            name: template.name,
            schema: template.entities,
            factTypes: template.factTypes || [],
            policies: template.extractPolicies,
            layout: template.injectionLayout,
            worldInfoHash,
            worldInfoRef: template.worldInfoRef,
            createdAt: template.createdAt || Date.now(),
        };
        await db.templates.put(record);
        return template.templateId;
    }

    /**
     * 通过 templateId 获取模板。
     */
    public async getById(templateId: string): Promise<WorldTemplate | null> {
        const record = await db.templates.get(templateId);
        if (!record) {
            return null;
        }
        return this.toWorldTemplate(record);
    }

    /**
     * 获取当前 active template。
     */
    public async getActiveTemplate(): Promise<WorldTemplate | null> {
        const activeTemplateId = await this.metaManager.getActiveTemplateId();
        if (!activeTemplateId) {
            return null;
        }
        return this.getById(activeTemplateId);
    }

    /**
     * 获取当前 chatKey 下的所有模板（按时间升序）。
     */
    public async listByChatKey(): Promise<WorldTemplate[]> {
        const records = await db.templates
            .where('[chatKey+createdAt]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .toArray();
        return records.map((record: DBTemplate) => this.toWorldTemplate(record));
    }

    /**
     * 当世界书变化时执行内容级 hash 检测并按需重建模板。
     * 模板构建统一委托给 TemplateBuilder（唯一权威实现），此处不再直接拼装 LLM 任务。
     * @param forceRebuild true 表示忽略 hash 缓存强制重建
     */
    private async onWorldInfoChanged(forceRebuild: boolean): Promise<string | null> {
        if (this.activeWorldNames.length === 0) {
            logger.info('当前未加载世界书，模板系统保持现状。');
            return null;
        }

        const worldInfoEntries = await this.collectWorldInfoEntries();
        if (worldInfoEntries.length === 0) {
            logger.warn('未读取到任何世界书词条，跳过模板重建。');
            return null;
        }

        const currentHash = await this.worldInfoReader.computeHash(worldInfoEntries);
        const existingBinding = await db.template_bindings.get(this.chatKey);

        if (!forceRebuild && existingBinding?.isLocked && existingBinding.activeTemplateId) {
            await this.metaManager.setActiveTemplateId(existingBinding.activeTemplateId);
            logger.info(`模板已锁定（${existingBinding.activeTemplateId}），跳过自动重建。`);
            return existingBinding.activeTemplateId;
        }

        if (!forceRebuild && existingBinding && existingBinding.worldInfoHash === currentHash && existingBinding.activeTemplateId) {
            await this.metaManager.setActiveTemplateId(existingBinding.activeTemplateId);
            logger.info('世界书内容 hash 未变化，复用现有模板。');
            return existingBinding.activeTemplateId;
        }

        // 委托给 TemplateBuilder 执行 LLM 构建
        const bundle: WorldContextBundle = {
            chatKey: this.chatKey,
            worldInfo: worldInfoEntries,
        };
        const template = await this.templateBuilder.ensureTemplate(bundle, forceRebuild);
        if (!template) {
            logger.warn('模板构建失败，保留当前有效模板。');
            return existingBinding?.activeTemplateId ?? null;
        }

        logger.success(`已更新当前会话模板：${template.templateId}`);
        return template.templateId;
    }

    /**
     * 读取当前激活世界书的全部词条，输出统一结构。
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
                        ? item.key.map((key: unknown) => String(key ?? '').trim()).filter(Boolean)
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
     * 将 DBTemplate 映射为 WorldTemplate。
     */
    private toWorldTemplate(record: DBTemplate): WorldTemplate {
        const worldInfoHash = record.worldInfoHash || record.worldInfoRef?.hash || '';
        return {
            templateId: record.templateId,
            chatKey: record.chatKey,
            worldType: record.worldType as 'fantasy' | 'urban' | 'custom',
            name: record.name,
            entities: record.schema || {},
            factTypes: record.factTypes || [],
            extractPolicies: record.policies || {},
            injectionLayout: record.layout || {},
            worldInfoRef: {
                book: record.worldInfoRef?.book || '',
                hash: worldInfoHash,
            },
            createdAt: record.createdAt,
        };
    }
}
