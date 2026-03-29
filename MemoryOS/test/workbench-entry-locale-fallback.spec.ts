import { describe, expect, it } from 'vitest';
import { resolveEntryIdentifierLabel, resolveEntryTypeLabel, resolveFailureReasonLabel } from '../src/ui/workbenchLocale';

describe('workbench entry locale fallback', () => {
    it('可以将未收录的下划线标识尽量转成中文兜底', () => {
        expect(resolveEntryTypeLabel('source_summary')).toBe('来源总结');
        expect(resolveEntryTypeLabel('actor_private_interpretation')).toBe('角色私有理解');
        expect(resolveFailureReasonLabel('planner_validation_failed')).toBe('规划校验失败');
    });

    it('可以将通用字段标识转成可读中文', () => {
        expect(resolveEntryIdentifierLabel('source_actor_key')).toBe('来源角色键');
        expect(resolveEntryIdentifierLabel('visibility_scope')).toBe('可见范围');
    });
});
