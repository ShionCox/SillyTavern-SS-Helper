import { describe, expect, it } from 'vitest';
import {
    resolvePromptBlockTitle,
    resolveRecallReasonCodeLabel,
    resolveRecallSourceLabel,
    resolveRetrievalProviderLabel,
    resolveRetrievalRulePackLabel,
} from '../src/ui/workbenchLocale';

describe('workbench recall locale', () => {
    it('可以转译注入说明来源与检索信息', () => {
        expect(resolveRecallSourceLabel('unified_memory')).toBe('统一记忆');
        expect(resolveRetrievalProviderLabel('lexical_bm25')).toBe('词法检索');
        expect(resolveRetrievalRulePackLabel('hybrid')).toBe('混合规则包');
    });

    it('可以转译注入说明原因码', () => {
        expect(resolveRecallReasonCodeLabel('inserted')).toBe('已插入提示词');
        expect(resolveRecallReasonCodeLabel('prompt:system_base_present')).toBe('存在系统基底文本');
        expect(resolveRecallReasonCodeLabel('preview_disabled')).toBe('预览功能已禁用');
    });

    it('可以转译注入文本分组标题', () => {
        expect(resolvePromptBlockTitle('systemText')).toBe('系统注入文本');
        expect(resolvePromptBlockTitle('roleText')).toBe('角色注入文本');
        expect(resolvePromptBlockTitle('finalText')).toBe('最终注入文本');
    });
});
