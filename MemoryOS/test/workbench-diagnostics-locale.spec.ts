import { describe, expect, it } from 'vitest';
import {
    resolveEntryActionTypeLabel,
    resolveEntryTypeLabel,
    resolveFailureReasonLabel,
    resolveNarrativeStyleLabel,
    resolveNarrativeStyleSourceLabel,
    resolveMutationActionLabel,
    resolveMutationSummaryFieldValue,
    resolvePromptStatsLabel,
    resolveSummaryFailureStageLabel,
    resolveSummaryPlannerFieldLabel,
    resolveSummaryStageLabel,
    resolveTraceEmptyText,
    resolveTraceLevelLabel,
    resolveTracePanelTitle,
    resolveTraceStageLabel,
} from '../src/ui/workbenchLocale';

describe('workbench diagnostics locale', () => {
    it('可以转译原始变更动作名', () => {
        expect(resolveMutationActionLabel('summary_planner_resolved')).toBe('总结规划已完成');
        expect(resolveMutationActionLabel('mutation_applied')).toBe('变更写入已完成');
    });

    it('可以转译 Trace 面板标题与阶段级别', () => {
        expect(resolveTracePanelTitle('currentRecall')).toBe('当前召回跟踪');
        expect(resolveTraceEmptyText('latestInjection')).toBe('当前还没有最近一次注入的跟踪记录。');
        expect(resolveTraceStageLabel('memory_context_built')).toBe('召回上下文已构建');
        expect(resolveTraceLevelLabel('warn')).toBe('警告');
    });

    it('可以把变更摘要中的世界画像字段转成中文', () => {
        expect(resolveMutationSummaryFieldValue('primaryProfile', 'dark_fantasy_steampunk')).toBe('黑暗奇幻蒸汽朋克');
    });

    it('可以转译总结阶段详情里的内部术语', () => {
        expect(resolveSummaryStageLabel('planner')).toBe('规划阶段');
        expect(resolveSummaryPlannerFieldLabel('focusTypes')).toBe('聚焦类型');
        expect(resolveNarrativeStyleLabel('gangster')).toBe('黑帮');
        expect(resolveNarrativeStyleSourceLabel('binding')).toBe('已绑定画像');
        expect(resolveSummaryFailureStageLabel('validation_failed_schema')).toBe('结构校验');
    });

    it('可以转译词条记录与统计区块的内部术语', () => {
        expect(resolveEntryTypeLabel('other')).toBe('其他');
        expect(resolveEntryActionTypeLabel('NOOP')).toBe('无需操作');
        expect(resolveFailureReasonLabel('validation_failed_payload')).toBe('结构校验失败');
        expect(resolvePromptStatsLabel('schema_list')).toBe('类型列表');
    });
});
