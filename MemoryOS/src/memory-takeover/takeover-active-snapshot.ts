import type { MemoryTakeoverActiveSnapshot, MemoryTakeoverRange } from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';

/**
 * 功能：生成旧聊天接管的最近活跃快照。
 * @param input 生成输入。
 * @returns 活跃快照。
 */
export async function runTakeoverActiveSnapshot(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    range: MemoryTakeoverRange;
    messages: MemoryTakeoverMessageSlice[];
    hintContext?: string;
}): Promise<MemoryTakeoverActiveSnapshot> {
    const recentDigest: string = input.messages
        .slice(-8)
        .map((item: MemoryTakeoverMessageSlice): string => `第${item.floor}层[${item.role}]: ${item.content}`)
        .join('\n');
    const fallback: MemoryTakeoverActiveSnapshot = {
        generatedAt: Date.now(),
        currentScene: input.messages.length > 0 ? '最近剧情仍在持续推进中。' : '当前聊天暂无可用消息。',
        currentLocation: '',
        currentTimeHint: '',
        activeGoals: [],
        activeRelations: [],
        openThreads: [],
        recentDigest: recentDigest || '最近区间没有可提取的有效消息。',
    };
    const structured = await runTakeoverStructuredTask<MemoryTakeoverActiveSnapshot>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskKey: 'memory_takeover_active_snapshot',
        taskDescription: `旧聊天处理：先看最近聊到哪（${input.range.startFloor}-${input.range.endFloor}层）`,
        systemSection: 'TAKEOVER_ACTIVE_SYSTEM',
        schemaSection: 'TAKEOVER_ACTIVE_SCHEMA',
        sampleSection: 'TAKEOVER_ACTIVE_OUTPUT_SAMPLE',
        payload: {
            range: input.range,
            messages: input.messages,
            hintContext: input.hintContext,
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
