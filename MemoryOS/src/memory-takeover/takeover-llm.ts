import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';

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
 * 功能：执行接管结构化任务。
 * @param input 调用输入。
 * @returns 结构化结果；失败时返回 null。
 */
export async function runTakeoverStructuredTask<T>(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    taskId: string;
    systemSection: string;
    schemaSection: string;
    sampleSection: string;
    payload: Record<string, unknown>;
    renderData?: Record<string, string>;
}): Promise<T | null> {
    if (!input.llm) {
        return null;
    }
    const promptPack = await loadPromptPackSections();
    const schema = parseTakeoverJsonSection(promptPack[input.schemaSection as keyof typeof promptPack] as string);
    const sample = parseTakeoverJsonSection(promptPack[input.sampleSection as keyof typeof promptPack] as string);
    const systemPrompt = renderPromptTemplate(
        String(promptPack[input.systemSection as keyof typeof promptPack] ?? ''),
        input.renderData ?? {},
    );
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(input.payload, null, 2),
        JSON.stringify(schema ?? {}, null, 2),
        JSON.stringify(sample ?? {}, null, 2),
    );
    const result = await input.llm.runTask<T>({
        consumer: input.pluginId,
        taskId: input.taskId,
        taskDescription: `旧聊天接管：${input.taskId}`,
        taskKind: 'generation',
        input: {
            messages: [
                {
                    role: 'system',
                    content: `${systemPrompt}\n\n除标识字段、枚举字段与 schema 键名外，所有自然语言字段必须使用简体中文。`,
                },
                {
                    role: 'user',
                    content: userPayload,
                },
            ],
        },
        schema,
        enqueue: {
            displayMode: 'compact',
        },
    });
    if (!result.ok) {
        return null;
    }
    return result.data;
}
