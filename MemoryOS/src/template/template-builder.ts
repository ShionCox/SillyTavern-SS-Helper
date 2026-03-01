import type { LLMSDK } from '../../../SDK/stx';
import type { WorldTemplate, WorldContextBundle } from './types';
import { TemplateManager } from './template-manager';
import { WorldInfoReader } from './worldinfo-reader';
import { MetaManager } from '../core/meta-manager';

/**
 * 世界模板构建器 —— 编排 `world.template.build` 任务
 * 职责：检测世界书变更 → 调用 LLM → 校验输出 → 存储模板 → 绑定 chatKey
 */
export class TemplateBuilder {
    private chatKey: string;
    private templateManager: TemplateManager;
    private worldInfoReader: WorldInfoReader;
    private metaManager: MetaManager;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
        this.templateManager = new TemplateManager(chatKey);
        this.worldInfoReader = new WorldInfoReader();
        this.metaManager = new MetaManager(chatKey);
    }

    /**
     * 检查并按需重建世界模板
     * 返回当前活跃的模板
     * @param bundle 世界上下文束
     * @param llmSdk LLM Hub 实例（可选，无则跳过 AI 生成）
     */
    async ensureTemplate(
        bundle: WorldContextBundle,
        llmSdk?: LLMSDK
    ): Promise<WorldTemplate | null> {
        // 1. 计算当前世界书 hash
        const currentHash = await this.worldInfoReader.computeHash(bundle.worldInfo);

        // 2. 检查是否已有匹配 hash 的模板
        const existing = await this.templateManager.findByWorldInfoHash(currentHash);
        if (existing) {
            // hash 一致，确保 meta 指向正确的模板
            await this.metaManager.setActiveTemplateId(existing.templateId);
            return existing;
        }

        // 3. Hash 不一致或不存在，需要重建
        if (!llmSdk) {
            console.warn('[TemplateBuilder] 无 LLM Hub 实例，无法生成世界模板');
            return null;
        }

        return this.buildFromLLM(bundle, currentHash, llmSdk);
    }

    /**
     * 通过 LLM 生成模板
     */
    private async buildFromLLM(
        bundle: WorldContextBundle,
        worldInfoHash: string,
        llmSdk: LLMSDK
    ): Promise<WorldTemplate | null> {
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
        const result = await llmSdk.runTask<any>({
            consumer: 'memory-os',
            task: 'world.template.build',
            input: {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3,
            },
            schema: TEMPLATE_SCHEMA,
            budget: { maxTokens: 4096, maxLatencyMs: 30000 },
        });

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
        await this.templateManager.save(template);
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
