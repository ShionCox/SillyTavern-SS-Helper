import type { WorldTemplate, WorldContextBundle } from './types';
import type { TemplateManager } from './template-manager';
import { WorldInfoReader } from './worldinfo-reader';
import { MetaManager } from '../core/meta-manager';
import { runGeneration, MEMORY_TASKS, checkAiModeGuard } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';

/**
 * 世界模板构建器 —— 唯一权威的 `world.template.build` 任务编排入口
 * 职责：检测世界书变更 → 调用 LLM → 校验输出 → 存储模板 → 绑定 chatKey
 * TemplateManager 不再直接拼装 LLM 任务，统一委托到这里。
 */
export class TemplateBuilder {
    private chatKey: string;
    private templateManager: TemplateManager | null;
    private worldInfoReader: WorldInfoReader;
    private metaManager: MetaManager;

    constructor(chatKey: string, templateManager?: TemplateManager) {
        this.chatKey = chatKey;
        this.templateManager = templateManager ?? null;
        this.worldInfoReader = new WorldInfoReader();
        this.metaManager = new MetaManager(chatKey);
    }

    /** 供 TemplateManager 在构造后注入自身引用，打破循环依赖 */
    setTemplateManager(mgr: TemplateManager): void {
        this.templateManager = mgr;
    }

    /** 获取 TemplateManager 实例（懒加载兜底） */
    private getTemplateManager(): TemplateManager {
        if (this.templateManager) return this.templateManager;
        // 延迟导入避免循环依赖
        const { TemplateManager: TM } = require('./template-manager');
        this.templateManager = new TM(this.chatKey) as TemplateManager;
        return this.templateManager;
    }

    /**
     * 检查并按需重建世界模板
     * 返回当前活跃的模板
     * @param bundle 世界上下文束
     * @param forceRebuild 是否强制重建（忽略 hash 缓存）
     */
    async ensureTemplate(
        bundle: WorldContextBundle,
        forceRebuild = false,
    ): Promise<WorldTemplate | null> {
        // 1. 计算当前世界书 hash
        const currentHash = await this.worldInfoReader.computeHash(bundle.worldInfo);

        // 2. 检查是否已有匹配 hash 的模板（非强制重建时）
        if (!forceRebuild) {
            const existing = await this.getTemplateManager().findByWorldInfoHash(currentHash);
            if (existing) {
                await this.metaManager.setActiveTemplateId(existing.templateId);
                return existing;
            }
        }

        // 3. Hash 不一致或不存在或强制，需要重建
        return this.buildFromLLM(bundle, currentHash);
    }

    /**
     * 通过 LLM 生成模板
     */
    private async buildFromLLM(
        bundle: WorldContextBundle,
        worldInfoHash: string,
    ): Promise<WorldTemplate | null> {
        // AI 模式守卫
        const guard = checkAiModeGuard(MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId);
        if (guard) {
            return null;
        }

        const compressedWorldInfo = this.worldInfoReader.compressForPrompt(bundle.worldInfo);

        // 构造 Prompt
        const systemPrompt = `你是一个世界设定分析专家。根据提供的世界观资料，生成一个结构化的世界模板 JSON。
要求：
1. 输出纯 JSON，不含任何解释文字
2. 必须包含字段：templateId, worldType, name, entities, factTypes, extractPolicies, injectionLayout
3. worldType 必须是 "fantasy", "urban", "custom" 之一
4. entities 是一个对象，每个 key 是实体类型名称，value 包含 primaryKey 和 fields 数组
5. factTypes 是一个数组，每项包含 type, pathPattern, slots
6. 根据世界观类型智能选择合适的实体和事实类型`;

        const userPrompt = `世界观资料：
${compressedWorldInfo}

${bundle.characterCard ? `角色卡：${bundle.characterCard.name} - ${bundle.characterCard.desc}` : ''}

请分析以上世界观，生成世界模板 JSON。`;

        // 调用 LLM Hub
        const result = await runGeneration<any>(
            MEMORY_TASKS.TEMPLATE_BUILD,
            {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3,
            },
            { maxTokens: 4096, maxLatencyMs: 30000 },
            TEMPLATE_SCHEMA,
        );

        if (!result.ok) {
            console.error('[TemplateBuilder] LLM 生成模板失败:', result.error);
            return null;
        }

        // 4. 构造 WorldTemplate 对象
        const data = result.data;
        const template: WorldTemplate = {
            templateId: data.templateId || crypto.randomUUID(),
            chatKey: this.chatKey,
            worldType: data.worldType || 'custom',
            name: data.name || '自动生成模板',
            entities: data.entities || {},
            factTypes: data.factTypes || [],
            extractPolicies: data.extractPolicies || {},
            injectionLayout: data.injectionLayout || {},
            worldInfoRef: { book: bundle.worldInfo[0]?.book || 'unknown', hash: worldInfoHash },
            createdAt: Date.now(),
        };

        // 5. 保存并绑定
        await this.getTemplateManager().save(template);
        await this.metaManager.setActiveTemplateId(template.templateId);

        return template;
    }
}

/**
 * 模板输出 Schema（用于 LLM Hub 的 schema 校验）
 */
const TEMPLATE_SCHEMA = {
    type: 'object',
    required: ['worldType', 'name', 'entities', 'factTypes'],
    properties: {
        templateId: { type: 'string' },
        worldType: { type: 'string' },
        name: { type: 'string' },
        entities: { type: 'object' },
        factTypes: { type: 'array' },
        extractPolicies: { type: 'object' },
        injectionLayout: { type: 'object' },
    },
};
