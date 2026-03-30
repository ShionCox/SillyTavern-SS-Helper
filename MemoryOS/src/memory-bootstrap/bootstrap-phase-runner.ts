import { loadPromptPackSections, type PromptPackSections } from '../memory-prompts/prompt-loader';
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
    const promptSections = resolveBootstrapPromptSections(promptPack, input.phaseName);
    const coldStartSchema = parseJsonSection(promptSections.schema);
    const coldStartOutputSample = parseJsonSection(promptSections.sample);
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(input.payload, null, 2),
        JSON.stringify(coldStartSchema ?? {}, null, 2),
        JSON.stringify(coldStartOutputSample ?? {}, null, 2),
    );
    const phaseInstruction = input.phaseName === 'phase1'
        ? '本阶段只关注 identity、actorCards、entityCards、worldProfileDetection、worldBase；relationships 和 memoryRecords 必须返回空集合。'
        : '本阶段只关注 relationships、memoryRecords 与近期状态线索；identity、actorCards、entityCards、worldBase 如无新增可返回空集合。';
    const result = await input.llm.runTask({
        consumer: input.pluginId,
        taskId: input.phaseName === 'phase1' ? 'memory_cold_start_core' : 'memory_cold_start_state',
        taskDescription: `冷启动分阶段抽取：${input.phaseName}`,
        taskKind: 'generation',
        input: {
            messages: [
                {
                    role: 'system',
                    content: `${renderPromptTemplate(promptSections.system, { userDisplayName: input.userDisplayName })}\n\n${phaseInstruction}\n\n除 schemaId、actorKey、sourceActorKey、targetActorKey、reasonCodes 等标识字段外，所有自然语言字段必须使用简体中文。`,
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
 * 功能：为冷启动阶段选择对应的 prompt 分段。
 * @param promptPack prompt pack 分段集合。
 * @param phaseName 当前阶段名。
 * @returns 当前阶段的 system/schema/sample。
 */
function resolveBootstrapPromptSections(
    promptPack: PromptPackSections,
    phaseName: 'phase1' | 'phase2',
): { system: string; schema: string; sample: string } {
    if (phaseName === 'phase1') {
        return {
            system: promptPack.COLD_START_CORE_SYSTEM,
            schema: promptPack.COLD_START_CORE_SCHEMA,
            sample: promptPack.COLD_START_CORE_OUTPUT_SAMPLE,
        };
    }
    return {
        system: promptPack.COLD_START_STATE_SYSTEM,
        schema: promptPack.COLD_START_STATE_SCHEMA,
        sample: promptPack.COLD_START_STATE_OUTPUT_SAMPLE,
    };
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
