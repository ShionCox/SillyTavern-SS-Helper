import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';

/**
 * 功能：执行单个冷启动阶段抽取任务。
 * @param input 阶段输入。
 * @returns 模型返回结果。
 */
export async function runBootstrapPhase(input: {
    llm: MemoryLLMApi;
    pluginId: string;
    userDisplayName: string;
    phaseName: 'phase1' | 'phase2';
    payload: Record<string, unknown>;
}): Promise<{ ok: boolean; reasonCode?: string; data?: unknown }> {
    const promptPack = await loadPromptPackSections();
    const coldStartSchema = parseJsonSection(promptPack.COLD_START_SCHEMA);
    const coldStartOutputSample = parseJsonSection(promptPack.COLD_START_OUTPUT_SAMPLE);
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(input.payload, null, 2),
        JSON.stringify(coldStartSchema ?? {}, null, 2),
        JSON.stringify(coldStartOutputSample ?? {}, null, 2),
    );
    const phaseInstruction = input.phaseName === 'phase1'
        ? '本阶段只关注 identity、actorCards、entityCards、worldProfileDetection、worldBase。relationships 和 memoryRecords 可以留空。'
        : '本阶段只关注 relationships、memoryRecords 与近期世界状态补充。identity、actorCards、entityCards、worldBase 可以复用已有信息或留空。';
    const result = await input.llm.runTask({
        consumer: input.pluginId,
        taskId: 'memory_cold_start',
        taskDescription: `冷启动分阶段抽取：${input.phaseName}`,
        taskKind: 'generation',
        input: {
            messages: [
                {
                    role: 'system',
                    content: `${renderPromptTemplate(promptPack.COLD_START_SYSTEM, { userDisplayName: input.userDisplayName })}\n\n${phaseInstruction}\n\n除 schemaId、actorKey、sourceActorKey、targetActorKey、reasonCodes 等标识字段外，所有自然语言字段必须使用简体中文。`,
                },
                { role: 'user', content: userPayload },
            ],
        },
        schema: coldStartSchema,
        enqueue: { displayMode: 'compact' },
    });
    return result.ok
        ? { ok: true, data: result.data }
        : { ok: false, reasonCode: result.reasonCode || 'cold_start_failed' };
}

/**
 * 功能：解析 prompt section 中的 JSON。
 * @param section section 文本。
 * @returns 解析结果。
 */
function parseJsonSection(section: string): unknown {
    const source = String(section ?? '').trim();
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
