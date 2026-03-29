import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';

/**
 * 功能：定义接管结构化任务的真实请求体。
 */
export interface TakeoverStructuredTaskRequest {
    messages: Array<{ role: 'system' | 'user'; content: string }>;
    schema: unknown;
}

/**
 * 功能：从 Prompt section 中解析 JSON。
 * @param section section 文本。
 * @returns JSON 数据。
 */
export function parseTakeoverJsonSection(section: string): unknown {
    const source: string = String(section ?? '').trim();
    if (!source) {
        return null;
    }
    const fenced = source.match(/```json[\s\S]*?```/i);
    const jsonText = fenced
        ? fenced[0].replace(/```json/i, '').replace(/```/g, '').trim()
        : source;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * 功能：构建角色卡候选的结构化 schema。
 * @returns 角色卡候选 schema。
 */
function buildActorCardArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: ['actorKey', 'displayName', 'aliases', 'identityFacts', 'originFacts', 'traits'],
            additionalProperties: false,
            properties: {
                actorKey: { type: 'string' },
                displayName: { type: 'string' },
                aliases: {
                    type: 'array',
                    items: { type: 'string' },
                },
                identityFacts: {
                    type: 'array',
                    items: { type: 'string' },
                },
                originFacts: {
                    type: 'array',
                    items: { type: 'string' },
                },
                traits: {
                    type: 'array',
                    items: { type: 'string' },
                },
            },
        },
    };
}

/**
 * 功能：为旧聊天批处理与整合任务补充角色卡字段。
 * @param sectionName schema 对应的 section 名称。
 * @param schema 原始 schema。
 * @returns 增强后的 schema。
 */
function enrichTakeoverSchema(sectionName: string, schema: unknown): unknown {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return schema;
    }
    const nextSchema = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
    const properties = nextSchema.properties && typeof nextSchema.properties === 'object'
        ? nextSchema.properties as Record<string, unknown>
        : {};
    const required = Array.isArray(nextSchema.required)
        ? [...nextSchema.required as string[]]
        : [];

    if (sectionName === 'TAKEOVER_BATCH_SCHEMA') {
        properties.actorCards = buildActorCardArraySchema();
        if (!required.includes('actorCards')) {
            required.splice(3, 0, 'actorCards');
        }
    }

    if (sectionName === 'TAKEOVER_CONSOLIDATION_SCHEMA') {
        properties.actorCards = buildActorCardArraySchema();
        if (!required.includes('actorCards')) {
            required.splice(1, 0, 'actorCards');
        }
    }

    nextSchema.properties = properties;
    nextSchema.required = required;
    return nextSchema;
}

/**
 * 功能：为旧聊天批处理与整合任务补充角色卡示例。
 * @param sectionName sample 对应的 section 名称。
 * @param sample 原始示例。
 * @returns 增强后的示例。
 */
function enrichTakeoverSample(sectionName: string, sample: unknown): unknown {
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
        return sample;
    }
    const nextSample = JSON.parse(JSON.stringify(sample)) as Record<string, unknown>;
    if (sectionName === 'TAKEOVER_BATCH_OUTPUT_SAMPLE' && !Array.isArray(nextSample.actorCards)) {
        nextSample.actorCards = [
            {
                actorKey: 'lina',
                displayName: '莉娜',
                aliases: [],
                identityFacts: ['与主角同行的银发精灵'],
                originFacts: [],
                traits: ['谨慎', '会照顾人'],
            },
        ];
    }
    if (sectionName === 'TAKEOVER_CONSOLIDATION_OUTPUT_SAMPLE' && !Array.isArray(nextSample.actorCards)) {
        nextSample.actorCards = [
            {
                actorKey: 'lina',
                displayName: '莉娜',
                aliases: [],
                identityFacts: ['与主角同行的银发精灵'],
                originFacts: [],
                traits: ['谨慎', '会照顾人'],
            },
        ];
    }
    return nextSample;
}

/**
 * 功能：构建接管结构化任务的真实消息体。
 * @param input 调用输入。
 * @returns 结构化任务请求体。
 */
export async function buildTakeoverStructuredTaskRequest(input: {
    systemSection: string;
    schemaSection: string;
    sampleSection: string;
    payload: Record<string, unknown>;
    renderData?: Record<string, string>;
    extraSystemInstruction?: string;
}): Promise<TakeoverStructuredTaskRequest> {
    const promptPack = await loadPromptPackSections();
    const schema = enrichTakeoverSchema(
        input.schemaSection,
        parseTakeoverJsonSection(promptPack[input.schemaSection as keyof typeof promptPack] as string),
    );
    const sample = enrichTakeoverSample(
        input.sampleSection,
        parseTakeoverJsonSection(promptPack[input.sampleSection as keyof typeof promptPack] as string),
    );
    const systemPrompt = renderPromptTemplate(
        String(promptPack[input.systemSection as keyof typeof promptPack] ?? ''),
        input.renderData ?? {},
    );
    const extraInstruction: string = String(input.extraSystemInstruction ?? '').trim();
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(input.payload, null, 2),
        JSON.stringify(schema ?? {}, null, 2),
        JSON.stringify(sample ?? {}, null, 2),
    );
    return {
        messages: [
            {
                role: 'system',
                content: [
                    systemPrompt,
                    extraInstruction,
                    '除标识字段、枚举字段与 schema 键名外，所有自然语言字段必须使用简体中文。',
                ].filter(Boolean).join('\n\n'),
            },
            {
                role: 'user',
                content: userPayload,
            },
        ],
        schema,
    };
}

/**
 * 功能：执行接管结构化任务。
 * @param input 调用输入。
 * @returns 结构化结果；失败时返回 null。
 */
export async function runTakeoverStructuredTask<T>(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    taskId: string;
    taskDescription?: string;
    systemSection: string;
    schemaSection: string;
    sampleSection: string;
    payload: Record<string, unknown>;
    renderData?: Record<string, string>;
    extraSystemInstruction?: string;
}): Promise<T | null> {
    if (!input.llm) {
        return null;
    }
    const request = await buildTakeoverStructuredTaskRequest({
        systemSection: input.systemSection,
        schemaSection: input.schemaSection,
        sampleSection: input.sampleSection,
        payload: input.payload,
        renderData: input.renderData,
        extraSystemInstruction: input.extraSystemInstruction,
    });
    const result = await input.llm.runTask<T>({
        consumer: input.pluginId,
        taskId: input.taskId,
        taskDescription: String(input.taskDescription ?? '').trim() || '旧聊天处理',
        taskKind: 'generation',
        input: {
            messages: request.messages,
        },
        schema: request.schema,
        enqueue: {
            displayMode: 'compact',
        },
    });
    if (!result.ok) {
        return null;
    }
    return result.data;
}
