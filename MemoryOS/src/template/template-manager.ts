import { db, type DBTemplate } from '../db/db';
import type { WorldTemplate } from './types';
import { Logger } from '../../../SDK/logger';

const logger = new Logger('TemplateManager');

/**
 * 世界模板管理器 —— 负责模板的增删查改与 per-chat 绑定
 * 现已支持基于 SillyTavern World Info 的动态嗅探机制
 */
export class TemplateManager {
    private chatKey: string;
    private activeWorldNames: string[] = [];
    private syncInterval: any;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        // 如果是在 SillyTavern 环境下运行，尝试注册事件钩子
        this.installSillyTavernHooks();
    }

    /**
     * 这里使用各种办法监听 ST 内部的环境字典变动
     */
    private installSillyTavernHooks() {
        // 由于 ST 中大部分变更依靠全局暴露或者 `eventSource`，我们需要用轮询或事件
        const globalST = window as any;
        if (globalST && globalST.eventSource && globalST.event_types) {
            globalST.eventSource.on(globalST.event_types.CHAT_CHANGED, () => {
                this.syncWorldInfoState();
            });
            logger.success('成功接管了 ST 的 CHAT_CHANGED 事件用于同步世界书');
        }

        // 由于很多情况没有稳定可钩取的世界书更换事件，起一个轻量兜底轮询
        this.syncInterval = setInterval(() => this.syncWorldInfoState(), 5000);
    }

    /**
     * 停止监听（析构用）
     */
    public destroy() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
    }

    /**
     * 同步当前选择的世界书缓存
     */
    public async syncWorldInfoState() {
        try {
            const globalST = window as any;
            if (!globalST) return;

            // 获取 ST 全局公开的 "已启用世界书名称数组"
            // (来自 G:\SillyTavern\public\scripts\world-info.js -> selected_world_info)
            const stSelectedWorldInfo = globalST.selected_world_info;

            if (!Array.isArray(stSelectedWorldInfo)) {
                return; // 有可能脚本没加载完
            }

            // 对比是否发生了字典变动
            const stNamesStr = JSON.stringify([...stSelectedWorldInfo].sort());
            const myNamesStr = JSON.stringify([...this.activeWorldNames].sort());

            if (stNamesStr !== myNamesStr) {
                logger.info(`发现世界书挂载集合发生变化: [${this.activeWorldNames.join(',')}] -> [${stSelectedWorldInfo.join(',')}]`);
                this.activeWorldNames = [...stSelectedWorldInfo];
                await this.onWorldInfoChanged();
            }

        } catch (e) {
            logger.error('尝试同步世界书状态时遇到错误', e);
        }
    }

    /**
     * 当包含的世界书名字改变时，我们需要进行一次字典内容的再收集
     * 并且提交给 LLMHub 重铸 Schema
     */
    private async onWorldInfoChanged() {
        if (this.activeWorldNames.length === 0) {
            logger.info('当前没有任何加载的世界书，世界数据体系暂时退化为默认提取 Schema');
            return;
        }

        // ===== Hash 检测：hash 一致则跳过不必要的模板重建 =====
        const currentHash = JSON.stringify([...this.activeWorldNames].sort());
        try {
            const existingBinding = await db.template_bindings.get(this.chatKey);
            if (existingBinding && existingBinding.worldInfoHash === currentHash) {
                logger.info('世界书 hash 与上次一致，跳过模板重建，保留现有 Schema。');
                return;
            }
        } catch (e) {
            // 查询失败不是致命错误，继续重建
            logger.warn('读取 template_bindings 时发生错误，将强制重建模板。', e);
        }

        const globalST = window as any;
        let bundledPrompt = '# 世界背景文献设定\n\n你可以根据这些设定，构建本次聊天专属的提取 Schema（比如赛博世界提取义体、奇幻世界提取神明等）。\n\n';

        for (const bookName of this.activeWorldNames) {
            try {
                if (typeof globalST.loadWorldInfo === 'function') {
                    const bookData = await globalST.loadWorldInfo(bookName);
                    if (bookData && bookData.entries) {
                        bundledPrompt += `## 世界书文献：${bookName}\n`;
                        const entries = Object.values(bookData.entries) as any[];
                        for (const entry of entries) {
                            const keys = (entry.key || []).join(', ');
                            if (keys && entry.content) {
                                bundledPrompt += `### 词条项：[${keys}]\n${entry.content}\n\n`;
                            }
                        }
                    }
                }
            } catch (err) {
                logger.warn(`尝试解包世界书 ${bookName} 失败：`, err);
            }
        }

        logger.info(`世界书重新封包完成，总字符长度：${bundledPrompt.length}`);

        // 尝试向 LLMHub 要 Schema
        if (globalST.STX && globalST.STX.llm) {
            logger.info(`开始调用 world.template.build 提取定制数据表...`);
            try {
                const response = await globalST.STX.llm.runTask({
                    consumer: 'memory_os',
                    task: 'world.template.build',
                    input: bundledPrompt
                });

                if (response.ok) {
                    logger.success(`成功拿到当前世界定制骨架！`, response.data);
                    if (response.data && response.data.templateId) {
                        response.data.worldInfoRef = { hash: currentHash };
                        const templateId = await this.save(response.data as WorldTemplate);

                        // 更新 template_bindings 记录这次 hash 与对应 templateId
                        await db.template_bindings.put({
                            bindingKey: this.chatKey,
                            chatKey: this.chatKey,
                            activeTemplateId: templateId,
                            worldInfoHash: currentHash,
                            boundAt: Date.now()
                        });

                        // 同步通知 STX.memory 更新当前的 activeTemplateId
                        if (globalST.STX?.memory?.setActiveTemplateId) {
                            await globalST.STX.memory.setActiveTemplateId(templateId);
                            logger.success(`已更新当前会话的 activeTemplateId = ${templateId}`);
                        }
                    }
                } else {
                    logger.warn(`世界模板构建失败：${response.error}`);
                }
            } catch (aiErr) {
                logger.error('获取世界模板 AI 出错：', aiErr);
            }
        } else {
            logger.warn(`未检测到 STX.llm，可能 LLMHub 尚未加载或者没有安装`);
        }
    }

    /**
     * 保存一个模板到 IndexedDB
     */
    async save(template: WorldTemplate): Promise<string> {
        const record: DBTemplate = {
            templateId: template.templateId,
            chatKey: this.chatKey,
            worldType: template.worldType,
            name: template.name,
            schema: template.entities,
            policies: template.extractPolicies,
            layout: template.injectionLayout,
            worldInfoRef: template.worldInfoRef,
            createdAt: template.createdAt || Date.now(),
        };
        await db.templates.put(record);
        return template.templateId;
    }

    /**
     * 通过 templateId 获取模板
     */
    async getById(templateId: string): Promise<WorldTemplate | null> {
        const record = await db.templates.get(templateId);
        if (!record) return null;
        return this.toWorldTemplate(record);
    }

    /**
     * 获取当前 chatKey 下的所有模板
     */
    async listByChatKey(): Promise<WorldTemplate[]> {
        const records = await db.templates
            .where('[chatKey+createdAt]')
            .between([this.chatKey, 0], [this.chatKey, Infinity])
            .toArray();
        return records.map(r => this.toWorldTemplate(r));
    }

    /**
     * 将 DBTemplate 映射为 WorldTemplate
     */
    private toWorldTemplate(record: DBTemplate): WorldTemplate {
        return {
            templateId: record.templateId,
            chatKey: record.chatKey,
            worldType: record.worldType as any,
            name: record.name,
            entities: record.schema || {},
            factTypes: [],
            extractPolicies: record.policies || {},
            injectionLayout: record.layout || {},
            worldInfoRef: record.worldInfoRef,
            createdAt: record.createdAt,
        };
    }
}
