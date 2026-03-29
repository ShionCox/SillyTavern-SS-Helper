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
 * 功能：构建旧聊天处理失败提示。
 * @param taskId 任务标识。
 * @param reasonCode 原始原因码。
 * @param errorMessage 原始错误信息。
 * @returns 统一后的错误文本。
 */
function buildTakeoverTaskErrorMessage(taskId: string, reasonCode?: string, errorMessage?: string): string {
    const normalizedTaskId = String(taskId ?? '').trim() || 'unknown_task';
    const normalizedReasonCode = String(reasonCode ?? '').trim();
    const normalizedErrorMessage = String(errorMessage ?? '').trim();
    if (normalizedErrorMessage && normalizedReasonCode) {
        return `旧聊天处理任务失败（${normalizedTaskId}）：${normalizedErrorMessage}（原因码：${normalizedReasonCode}）`;
    }
    if (normalizedErrorMessage) {
        return `旧聊天处理任务失败（${normalizedTaskId}）：${normalizedErrorMessage}`;
    }
    if (normalizedReasonCode) {
        return `旧聊天处理任务失败（${normalizedTaskId}）：原因码 ${normalizedReasonCode}`;
    }
    return `旧聊天处理任务失败（${normalizedTaskId}）。`;
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
 * 功能：构建旧聊天接管关系卡的结构化 schema。
 * @returns 关系卡数组 schema。
 */
function buildRelationshipArraySchema(): Record<string, unknown> {
    return {
        type: 'array',
        items: {
            type: 'object',
            required: [
                'sourceActorKey',
                'targetActorKey',
                'participants',
                'relationTag',
                'state',
                'summary',
                'trust',
                'affection',
                'tension',
            ],
            additionalProperties: false,
            properties: {
                sourceActorKey: { type: 'string' },
                targetActorKey: { type: 'string' },
                participants: {
                    type: 'array',
                    items: { type: 'string' },
                },
                relationTag: {
                    type: 'string',
                    enum: ['亲人', '朋友', '盟友', '恋人', '暧昧', '师徒', '上下级', '竞争者', '情敌', '宿敌', '陌生人'],
                },
                state: { type: 'string' },
                summary: { type: 'string' },
                trust: { type: 'number' },
                affection: { type: 'number' },
                tension: { type: 'number' },
            },
        },
    };
}

/**
 * 功能：为旧聊天关系结果补充关系标签与目标类型字段。
 * @param sectionName 当前 schema 对应 section 名称。
 * @param properties schema 属性集合。
 * @returns 就地增强后的属性集合。
 */
function enrichTakeoverRelationSchemas(sectionName: string, properties: Record<string, unknown>): Record<string, unknown> {
    const relationTagSchema: Record<string, unknown> = {
        type: 'string',
        enum: ['亲人', '朋友', '盟友', '恋人', '暧昧', '师徒', '上下级', '竞争者', '情敌', '宿敌', '陌生人'],
    };
    const targetTypeSchema: Record<string, unknown> = {
        type: 'string',
        enum: ['actor', 'organization', 'city', 'nation', 'location', 'unknown'],
    };

    if (sectionName === 'TAKEOVER_BATCH_SCHEMA') {
        const relationTransitions = properties.relationTransitions as Record<string, unknown> | undefined;
        const relationItems = relationTransitions?.items as Record<string, unknown> | undefined;
        const relationProperties = relationItems?.properties as Record<string, unknown> | undefined;
        if (relationProperties) {
            relationProperties.relationTag = relationTagSchema;
            relationProperties.targetType = targetTypeSchema;
        }
    }

    if (sectionName === 'TAKEOVER_CONSOLIDATION_SCHEMA') {
        const relationState = properties.relationState as Record<string, unknown> | undefined;
        const relationItems = relationState?.items as Record<string, unknown> | undefined;
        const relationProperties = relationItems?.properties as Record<string, unknown> | undefined;
        if (relationProperties) {
            relationProperties.relationTag = relationTagSchema;
            relationProperties.targetType = targetTypeSchema;
        }
    }
    return properties;
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
        properties.relationships = buildRelationshipArraySchema();
        if (!required.includes('actorCards')) {
            required.splice(3, 0, 'actorCards');
        }
        if (!required.includes('relationships')) {
            required.splice(4, 0, 'relationships');
        }
    }

    if (sectionName === 'TAKEOVER_CONSOLIDATION_SCHEMA') {
        properties.actorCards = buildActorCardArraySchema();
        properties.relationships = buildRelationshipArraySchema();
        if (!required.includes('actorCards')) {
            required.splice(1, 0, 'actorCards');
        }
        if (!required.includes('relationships')) {
            required.splice(2, 0, 'relationships');
        }
    }

    enrichTakeoverRelationSchemas(sectionName, properties);
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
    if (sectionName === 'TAKEOVER_BATCH_OUTPUT_SAMPLE' && !Array.isArray(nextSample.relationships)) {
        nextSample.relationships = [
            {
                sourceActorKey: 'user',
                targetActorKey: 'lina',
                participants: ['user', 'lina'],
                relationTag: '朋友',
                state: '双方已经形成稳定同行与互相信任。',
                summary: '主角与莉娜在同行中建立了明确的信任关系。',
                trust: 0.72,
                affection: 0.48,
                tension: 0.12,
            },
        ];
    }
    if (sectionName === 'TAKEOVER_BATCH_OUTPUT_SAMPLE' && Array.isArray(nextSample.relationTransitions)) {
        nextSample.relationTransitions = nextSample.relationTransitions.map((item: Record<string, unknown>) => ({
            ...item,
            relationTag: item.relationTag ?? '朋友',
            targetType: item.targetType ?? 'actor',
        }));
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
    if (sectionName === 'TAKEOVER_CONSOLIDATION_OUTPUT_SAMPLE' && !Array.isArray(nextSample.relationships)) {
        nextSample.relationships = [
            {
                sourceActorKey: 'user',
                targetActorKey: 'lina',
                participants: ['user', 'lina'],
                relationTag: '朋友',
                state: '双方保持同行与互相信任。',
                summary: '整合后确认主角与莉娜之间形成稳定朋友关系。',
                trust: 0.72,
                affection: 0.48,
                tension: 0.12,
            },
        ];
    }
    if (sectionName === 'TAKEOVER_CONSOLIDATION_OUTPUT_SAMPLE' && Array.isArray(nextSample.relationState)) {
        nextSample.relationState = nextSample.relationState.map((item: Record<string, unknown>) => ({
            ...item,
            relationTag: item.relationTag ?? '朋友',
            targetType: item.targetType ?? 'actor',
        }));
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
        throw new Error(buildTakeoverTaskErrorMessage(input.taskId, 'llm_unavailable', '当前未连接可用的 LLMHub 服务。'));
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
        throw new Error(buildTakeoverTaskErrorMessage(input.taskId, result.reasonCode, result.error));
    }
    return result.data;
}
