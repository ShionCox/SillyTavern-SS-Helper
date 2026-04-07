import type { MemoryTakeoverBaseline } from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverSourceBundle } from './takeover-source';

/**
 * 功能：构建旧聊天接管静态基线。
 * @param input 构建输入。
 * @returns 静态基线。
 */
export async function runTakeoverBaseline(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    sourceBundle: MemoryTakeoverSourceBundle;
}): Promise<MemoryTakeoverBaseline> {
    const fallback: MemoryTakeoverBaseline = {
        staticBaseline: String(input.sourceBundle.characterCard.description ?? input.sourceBundle.characterCard.desc ?? '').trim() || '当前角色卡没有提供稳定静态描述。',
        personaBaseline: String(input.sourceBundle.userSnapshot.personaDescription ?? input.sourceBundle.userSnapshot.metadataPersona ?? '').trim() || '当前用户没有提供额外 persona 描述。',
        worldBaseline: String(input.sourceBundle.semanticSnapshot.systemPrompt ?? '').trim() || '当前聊天没有读取到额外世界系统提示。',
        ruleBaseline: String(input.sourceBundle.semanticSnapshot.authorNote ?? input.sourceBundle.semanticSnapshot.instruct ?? '').trim() || '当前聊天没有额外规则说明。',
        sourceSummary: `角色卡、语义快照与用户资料已收集，共 ${input.sourceBundle.totalFloors} 层历史消息。`,
        generatedAt: Date.now(),
    };
    const structured = await runTakeoverStructuredTask<MemoryTakeoverBaseline>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskKey: 'memory_takeover_baseline',
        taskDescription: '旧聊天处理：先看基础设定',
        systemSection: 'TAKEOVER_BASELINE_SYSTEM',
        schemaSection: 'TAKEOVER_BASELINE_SCHEMA',
        sampleSection: 'TAKEOVER_BASELINE_OUTPUT_SAMPLE',
        payload: {
            characterCard: input.sourceBundle.characterCard,
            semanticSnapshot: input.sourceBundle.semanticSnapshot,
            userSnapshot: input.sourceBundle.userSnapshot,
            totalFloors: input.sourceBundle.totalFloors,
        },
    });
    return structured
        ? {
            ...fallback,
            ...structured,
            generatedAt: Date.now(),
        }
        : fallback;
}
