export interface MemoryPromptSkill {
    skillId: string;
    title: string;
    description: string;
    instructions: string[];
}

/**
 * 功能：将单个提示技能渲染为可直接拼接到系统提示词中的文本。
 * @param skill 提示技能定义。
 * @returns 渲染后的技能文本。
 */
export function renderPromptSkill(skill: MemoryPromptSkill): string {
    const instructions = Array.isArray(skill.instructions)
        ? skill.instructions
            .map((item: string, index: number): string => `${index + 1}. ${String(item ?? '').trim()}`)
            .filter((item: string): boolean => item.length > 0)
        : [];
    return [
        `【技能】${String(skill.title ?? '').trim()}`,
        `技能编号：${String(skill.skillId ?? '').trim()}`,
        String(skill.description ?? '').trim(),
        ...instructions,
    ]
        .filter((item: string): boolean => item.length > 0)
        .join('\n');
}

/**
 * 功能：将多个提示技能合并为单段提示词文本，并按技能编号去重。
 * @param skills 提示技能数组。
 * @returns 合并后的提示技能文本。
 */
export function joinPromptSkills(skills: MemoryPromptSkill[]): string {
    const rendered: string[] = [];
    const seen = new Set<string>();
    for (const skill of skills) {
        const skillId = String(skill?.skillId ?? '').trim();
        if (!skillId || seen.has(skillId)) {
            continue;
        }
        seen.add(skillId);
        const text = renderPromptSkill(skill);
        if (text) {
            rendered.push(text);
        }
    }
    return rendered.join('\n\n');
}

export { COLDSTART_OPERATION_SKILL } from './coldstart-operation-skill';
export { buildColdstartOperationSystemPrompt } from './coldstart-operation-skill';
export { MEMORY_SUMMARY_SAVE_SKILL } from './memory-summary-save-skill';
export { buildMemorySummarySaveSystemPrompt } from './memory-summary-save-skill';
export {
    buildExtractPromptByScopeTaskPrompt,
    buildExtractTaskPrompt,
    buildLongSummarizeTaskPrompt,
    buildShortSummarizeTaskPrompt,
    buildSummarizeTaskPrompt,
} from './extract-operation-skill';
