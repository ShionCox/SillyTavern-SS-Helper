import { describe, expect, it } from 'vitest';
import {
    buildColdstartOperationSystemPrompt,
    buildExtractPromptByScopeTaskPrompt,
    buildExtractTaskPrompt,
    buildLongSummarizeTaskPrompt,
    buildMemorySummarySaveSystemPrompt,
    buildShortSummarizeTaskPrompt,
    buildSummarizeTaskPrompt,
    COLDSTART_OPERATION_SKILL,
    joinPromptSkills,
    MEMORY_SUMMARY_SAVE_SKILL,
    renderPromptSkill,
} from '../src/llm/skills';
import type { PostGenerationGateDecision } from '../src/types';

function createPostGateDecision(): PostGenerationGateDecision {
    return {
        valueClass: 'relationship_signal',
        shouldPersistLongTerm: true,
        shouldExtractFacts: true,
        shouldExtractRelations: true,
        shouldExtractWorldState: true,
        rebuildSummary: true,
        reasonCodes: ['test'],
    };
}

describe('memory-prompt-skills', (): void => {
    it('能渲染单个提示技能文本', (): void => {
        const rendered = renderPromptSkill(COLDSTART_OPERATION_SKILL);

        expect(rendered).toContain('冷启动操作说明');
        expect(rendered).toContain('worldSummary');
        expect(rendered).toContain('detail');
    });

    it('能合并多个提示技能并按技能编号去重', (): void => {
        const rendered = joinPromptSkills([
            COLDSTART_OPERATION_SKILL,
            MEMORY_SUMMARY_SAVE_SKILL,
            COLDSTART_OPERATION_SKILL,
        ]);

        expect(rendered).toContain('冷启动操作说明');
        expect(rendered).toContain('记忆摘要保存说明');
        expect(rendered.match(/技能编号：memoryos\.coldstart\.operation/g)?.length ?? 0).toBe(1);
    });

    it('能构建完整冷启动系统提示词', (): void => {
        const prompt = buildColdstartOperationSystemPrompt();

        expect(prompt).toContain('你是一个角色卡与世界观整理助手');
        expect(prompt).toContain('ruleDetails');
        expect(prompt).toContain('knowledgeLevel');
        expect(prompt).toContain('worldSummary 只能写总览');
    });

    it('能构建完整记忆摘要保存提示词', (): void => {
        const prompt = buildMemorySummarySaveSystemPrompt();

        expect(prompt).toContain('记忆摘要保存说明');
        expect(prompt).toContain('memoryCards');
        expect(prompt).toContain('state 卡优先描述当前稳定状态');
    });

    it('能构建摘要与抽取任务提示词', (): void => {
        const postGate = createPostGateDecision();
        const attachedSkillText = buildMemorySummarySaveSystemPrompt();

        const shortPrompt = buildShortSummarizeTaskPrompt('summary_only', postGate, attachedSkillText);
        const longPrompt = buildLongSummarizeTaskPrompt('block', postGate, attachedSkillText);
        const summarizePrompt = buildSummarizeTaskPrompt('full', postGate, attachedSkillText);
        const extractPrompt = buildExtractTaskPrompt('full', true, postGate);
        const scopedExtractPrompt = buildExtractPromptByScopeTaskPrompt('block', false, postGate, 'medium');

        expect(shortPrompt).toContain('你是短总结助手');
        expect(longPrompt).toContain('你是长总结助手');
        expect(summarizePrompt).toContain('你是对话摘要助手');
        expect(extractPrompt).toContain('你是结构化记忆提取助手');
        expect(scopedExtractPrompt).toContain('Processing scope: medium.');
    });
});
