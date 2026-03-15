import { z } from 'zod';
import type { ZodIssue, ZodType } from 'zod';

/**
 * 校验返回结果结构
 */
export interface ValidationResult<T = any> {
    valid: boolean;
    data?: T;
    errors: string[];
}

/**
 * 使用 Zod 强类型校验大模型返回的 JSON 对象
 * @param data 解析后的原始对象
 * @param schema Zod Schema 定义
 */
export function validateZodSchema<T>(data: any, schema: ZodType<T>): ValidationResult<T> {
    const result = schema.safeParse(data);

    if (result.success) {
        return { valid: true, data: result.data, errors: [] };
    } else {
        const errors = result.error.issues.map(
            (err: ZodIssue) => `字段 "${err.path.join('.')}" 校验失败: ${err.message}`
        );
        return { valid: false, errors };
    }
}

/**
 * 尝试从 LLM 混沌输出中提取最纯净的 JSON
 * 对于部分附带反思过程 `<think>` 或者包裹在 \`\`\`json 里面的格式，进行强力清洗
 */
export function parseJsonOutput(raw: string): { ok: boolean; data: any; error?: string } {
    if (!raw || typeof raw !== 'string') {
        return { ok: false, data: null, error: '返回内容为空或格式非字符串' };
    }

    let cleanStr = raw.trim();

    // 1. 尝试去除 DeepSeek / Claude 等喜欢附带的 <think> 标签内容
    cleanStr = cleanStr.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // 2. 尝试直接解析
    try {
        return { ok: true, data: JSON.parse(cleanStr) };
    } catch {
        // 继续尝试提取代码块中的 JSON
    }

    // 3. 尝试提取 ```json ... ``` 或 ``` ... ``` 块
    const jsonBlockMatch = cleanStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (jsonBlockMatch) {
        try {
            return { ok: true, data: JSON.parse(jsonBlockMatch[1].trim()) };
        } catch (e) {
            return { ok: false, data: null, error: `代码块中的 JSON 解析失败: ${(e as Error).message}` };
        }
    }

    // 4. 暴力搜索第一个 { 和最后一个 } 之间的内容
    const firstBrace = cleanStr.indexOf('{');
    const lastBrace = cleanStr.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
            const manualExtract = cleanStr.substring(firstBrace, lastBrace + 1);
            return { ok: true, data: JSON.parse(manualExtract) };
        } catch (e) {
            return { ok: false, data: null, error: `暴力括号提取 JSON 解析失败: ${(e as Error).message}` };
        }
    }

    return { ok: false, data: null, error: '无法从 LLM 输出中识别到有效的 JSON' };
}

// ==========================================
// 具体业务 Schema 定义 (由 Zod 驱动)
// ==========================================

export const TemplateEntitySchema = z.object({
    primaryKey: z.string().describe('该实体数据表的主键名称'),
    fields: z.array(z.string()).describe('允许提取的属性列表(字符串数组)'),
    indexes: z.array(z.string()).optional().describe('可选：建索引加快搜索的字段名'),
});

export const TemplateFactTypeSchema = z.object({
    type: z.string().describe('事实类型的名称 (例如 user_profile, relationship)'),
    pathPattern: z.string().describe('向统一状态树(StateManager)写值时的路径规则，可以使用 :id 等占位'),
    slots: z.array(z.string()).describe('该类型能够拥有的具体栏位名'),
    defaultInjection: z.string().optional().describe('默认往哪块区域注入（如 WORLD_STATE')
});

export const WorldTemplateSchema = z.object({
    templateId: z.string().describe('模板的唯一业务哈希。如果没法给就用 uuid'),
    name: z.string().describe('所提取这套字典模板的名字'),
    worldType: z.enum(['fantasy', 'urban', 'custom']).describe('世界风格定位，预置选择或 custom'),
    entities: z.record(z.string(), TemplateEntitySchema).describe('字典里包含的重要客观实体列表，如 Characters, Locations等'),
    factTypes: z.array(TemplateFactTypeSchema).optional().describe('基于实体的进一步状态树类型映射，大模型可选返回'),
    extractPolicies: z.record(z.string(), z.any()).describe('针对这个世界推荐的记忆提取抽取参数配置'),
    injectionLayout: z.record(z.string(), z.any()).describe('推荐该世界下的 Token 分区占用（可选）'),
});

// ==========================================
// AI 提议制 (Proposal) Schema 定义
// 用于 memory.extract, world.update, memory.summarize 等统一返回
// ==========================================

export const FactProposalSchema = z.object({
    factKey: z.string().optional().describe('事实对应的唯一主键 (更新时使用)'),
    type: z.string().describe('事实类型，必须符合 world_template 限定'),
    entity: z.object({ kind: z.string(), id: z.string() }).optional().describe('关联的具体实体标示'),
    path: z.string().optional().describe('如果这属于对象树的层级结构，描述其访问路径'),
    value: z.any().describe('具体事实的对象体或者文本值'),
    confidence: z.number().min(0).max(1).optional().describe('大模型对这该条提取的置信度 (0-1.0)')
});

export const PatchProposalSchema = z.object({
    op: z.enum(['add', 'replace', 'remove']).describe('操作模式(类似 json-patch)'),
    path: z.string().describe('操作状态树节点位置'),
    value: z.any().optional().describe('操作具体覆值 (remove 时为空)')
});

export const SummaryProposalSchema = z.object({
    level: z.enum(['message', 'scene', 'arc']).describe('摘要归档层级。短线推荐归档为 message 或 scene'),
    title: z.string().optional().describe('给摘要起的名字'),
    content: z.string().describe('摘要总结文本本体'),
    keywords: z.array(z.string()).optional().describe('提炼相关关键词组')
});

export const ProposalEnvelopeSchema = z.object({
    ok: z.boolean().describe('由于内部要求返回强 Json，如果发生拒绝则设置为 false'),
    proposal: z.object({
        facts: z.array(FactProposalSchema).optional().describe('事实写入的提议 (一般在 memory.extract 发生)'),
        patches: z.array(PatchProposalSchema).optional().describe('状态变量更改提议 (一般在 world.update 发生)'),
        summaries: z.array(SummaryProposalSchema).optional().describe('事件摘要化提议 (一般在 memory.summarize 发生)'),
        notes: z.string().optional().describe('随附说明，用于 AI 反思或者提示')
    }).describe('提交供 MemoryOS 四道闸门审批的提议内容'),
    confidence: z.number().min(0).max(1).describe('大模型对整体此提议判断的把握程度 (0~1)')
});
