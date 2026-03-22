import type { MemoryPromptSkill } from './index';

export const MEMORY_SUMMARY_SAVE_SKILL: MemoryPromptSkill = {
    skillId: 'memoryos.summary.memory-save',
    title: '记忆摘要保存说明',
    description: '用于对话摘要与记忆卡提炼，要求摘要负责浏览，记忆卡负责保存与召回。',
    instructions: [
        '输出必须是符合任务要求的 JSON，不要附带额外解释。',
        'summary 负责阶段摘要与上下文浏览，memoryCards 负责长期记忆；不要把摘要原文直接镜像成一张长卡。',
        '每张 memoryCard 只能表达一个中心主题，优先拆成 identity、relationship、rule、state、event、style 等明确卡片。',
        'memoryText 必须是自然语言短句，不要堆砌 JSON、字段列表或原始结构化键值对。',
        '如果当前信息不足以形成高质量记忆卡，可以少写卡，但不要把多条无关信息硬塞进一张卡。',
        'state 卡优先描述当前稳定状态，event 卡优先描述已经发生的变化，二者不要混成一条。',
        'evidenceText 可以保留证据来源，但主记忆正文必须人类可读，便于召回解释与查看。',
        '如果无法确定内容是否值得长期保存，优先保守，不要为了凑数量生成低质量卡片。',
        'summary.level 只允许使用 message、scene 或 arc，不要输出 short、medium、long 或其他旧口径。',
    ],
};

/**
 * 功能：将记忆摘要保存技能渲染为系统提示文本。
 * @returns 记忆摘要保存技能文本。
 */
function renderMemorySummarySaveSkillText(): string {
    const instructions: string[] = MEMORY_SUMMARY_SAVE_SKILL.instructions
        .map((item: string, index: number): string => `${index + 1}. ${String(item ?? '').trim()}`)
        .filter((item: string): boolean => item.length > 0);
    return [
        `【技能】${MEMORY_SUMMARY_SAVE_SKILL.title}`,
        `技能编号：${MEMORY_SUMMARY_SAVE_SKILL.skillId}`,
        MEMORY_SUMMARY_SAVE_SKILL.description,
        ...instructions,
    ]
        .filter((item: string): boolean => item.length > 0)
        .join('\n');
}

/**
 * 功能：构建记忆摘要保存专用的系统提示词。
 * @returns 完整记忆摘要保存提示词。
 */
export function buildMemorySummarySaveSystemPrompt(): string {
    return renderMemorySummarySaveSkillText();
}
