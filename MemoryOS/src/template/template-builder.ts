import type { WorldTemplate, WorldContextBundle } from './types';
import type { TemplateManager } from './template-manager';
import { WorldInfoReader } from './worldinfo-reader';
import { MetaManager } from '../core/meta-manager';
import { runGeneration, MEMORY_TASKS, checkAiModeGuard } from '../llm/memoryLlmBridge';
import type { MemoryAiTaskId } from '../llm/ai-health-types';
import { buildDisplayTables } from './table-derivation';

/**
 * 功能：负责根据世界书内容生成并保存模板。
 *
 * 参数：
 *   chatKey (string)：当前聊天键。
 *   templateManager (TemplateManager | undefined)：模板管理器实例。
 *
 * 返回：
 *   无。
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

    /**
     * 功能：在构造后注入模板管理器，避免循环依赖。
     * @param mgr 模板管理器实例
     * @returns 无返回值
     */
    setTemplateManager(mgr: TemplateManager): void {
        this.templateManager = mgr;
    }

    /**
     * 功能：获取模板管理器实例。
     * @returns 模板管理器实例
     */
    private getTemplateManager(): TemplateManager {
        if (this.templateManager) {
            return this.templateManager;
        }
        const { TemplateManager: TemplateManagerCtor } = require('./template-manager');
        this.templateManager = new TemplateManagerCtor(this.chatKey) as TemplateManager;
        return this.templateManager;
    }

    /**
     * 功能：在需要时生成或复用当前聊天的模板。
     * @param bundle 世界书上下文
     * @param forceRebuild 是否强制重建
     * @returns 当前可用模板
     */
    async ensureTemplate(
        bundle: WorldContextBundle,
        forceRebuild: boolean = false,
    ): Promise<WorldTemplate | null> {
        const currentHash = await this.worldInfoReader.computeHash(bundle.worldInfo);

        if (!forceRebuild) {
            const existing = await this.getTemplateManager().findByWorldInfoHash(currentHash);
            if (existing) {
                await this.metaManager.setActiveTemplateId(existing.templateId);
                return existing;
            }
        }

        return this.buildFromLLM(bundle, currentHash);
    }

    /**
     * 功能：调用 LLM 生成模板并补齐 v2 字段。
     * @param bundle 世界书上下文
     * @param worldInfoHash 当前世界书内容哈希
     * @returns 生成后的模板；失败时返回 null
     */
    private async buildFromLLM(
        bundle: WorldContextBundle,
        worldInfoHash: string,
    ): Promise<WorldTemplate | null> {
        const guard = checkAiModeGuard(MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId);
        if (guard) {
            return null;
        }

        const compressedWorldInfo = this.worldInfoReader.compressForPrompt(bundle.worldInfo);
        const systemPrompt = `你是一个世界观模板设计专家。请根据提供的世界观资料输出 MemoryOS 模板 JSON。
要求：
1. 只输出 JSON，不要附加解释。
2. 至少包含 templateId、worldType、name、entities、factTypes、extractPolicies、injectionLayout。
3. worldType 只能是 "fantasy"、"urban"、"custom" 之一。
4. entities 的每个键都是实体类型，值包含 primaryKey 与 fields 数组。
5. factTypes 的每项至少包含 type、pathPattern、slots。
6. 如果能推断出多表结构，请额外返回 tables、fieldSynonyms、tableSynonyms、templateFamilyId、revisionNo、revisionState、parentTemplateId、schemaFingerprint、lastTouchedAt、finalizedAt。`;
        const userPrompt = `世界观资料：
${compressedWorldInfo}

${bundle.characterCard ? `角色卡：${bundle.characterCard.name} - ${bundle.characterCard.desc}` : ''}

请生成结构化模板 JSON。`;

        const result = await runGeneration<any>(
            MEMORY_TASKS.TEMPLATE_BUILD,
            {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.3,
            },
            { maxTokens: 4096, maxLatencyMs: 0 },
            TEMPLATE_SCHEMA,
        );

        if (!result.ok) {
            console.error('[TemplateBuilder] LLM 生成模板失败:', result.error);
            return null;
        }

        const data = result.data ?? {};
        const templateId = String(data.templateId ?? crypto.randomUUID());
        const createdAt = Date.now();
        const entities = data.entities || {};
        const tables = buildDisplayTables(entities, data.tables || []);
        const revisionState = data.revisionState === 'draft' ? 'draft' : 'final';

        const template: WorldTemplate = {
            templateId,
            chatKey: this.chatKey,
            worldType: data.worldType || 'custom',
            name: data.name || '自动生成模板',
            entities,
            factTypes: data.factTypes || [],
            extractPolicies: data.extractPolicies || {},
            injectionLayout: data.injectionLayout || {},
            worldInfoRef: {
                book: bundle.worldInfo[0]?.book || 'unknown',
                hash: worldInfoHash,
            },
            createdAt,
            tables,
            fieldSynonyms: data.fieldSynonyms || {},
            tableSynonyms: data.tableSynonyms || {},
            templateFamilyId: data.templateFamilyId || templateId,
            revisionNo: typeof data.revisionNo === 'number' ? data.revisionNo : 1,
            revisionState,
            parentTemplateId: data.parentTemplateId ?? null,
            schemaFingerprint: data.schemaFingerprint || worldInfoHash,
            lastTouchedAt: typeof data.lastTouchedAt === 'number' ? data.lastTouchedAt : createdAt,
            finalizedAt: revisionState === 'draft'
                ? (typeof data.finalizedAt === 'number' ? data.finalizedAt : null)
                : (typeof data.finalizedAt === 'number' ? data.finalizedAt : createdAt),
        };

        await this.getTemplateManager().save(template);
        await this.metaManager.setActiveTemplateId(template.templateId);

        return template;
    }
}

/**
 * 功能：约束 LLM 模板输出的最小结构。
 * 参数：
 *   无。
 *
 * 返回：
 *   JSON Schema 对象。
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
        tables: { type: 'array' },
        fieldSynonyms: { type: 'object' },
        tableSynonyms: { type: 'object' },
        templateFamilyId: { type: 'string' },
        revisionNo: { type: 'number' },
        revisionState: { type: 'string' },
        parentTemplateId: { type: ['string', 'null'] },
        schemaFingerprint: { type: 'string' },
        lastTouchedAt: { type: 'number' },
        finalizedAt: { type: ['number', 'null'] },
    },
};
