import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderNarrativeReferenceText } from '../src/utils/narrative-reference-renderer';

async function loadNarrativeUserNameModule(mockedUserName: string) {
    vi.resetModules();
    vi.doMock('../../../SDK/tavern', () => {
        return {
            getCurrentTavernUserNameEvent: vi.fn(() => mockedUserName),
        };
    });
    return import('../src/utils/narrative-user-name');
}

describe('narrative user name helpers', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('优先使用显式传入的用户名，并把占位值用户回退为你', async () => {
        const { resolveCurrentNarrativeUserName } = await loadNarrativeUserNameModule('酒馆名');
        expect(resolveCurrentNarrativeUserName('林远')).toBe('林远');
        expect(resolveCurrentNarrativeUserName('用户')).toBe('你');
    });

    it('在 SDK 也拿不到用户名时回退为你', async () => {
        const { resolveCurrentNarrativeUserName } = await loadNarrativeUserNameModule('');
        expect(resolveCurrentNarrativeUserName()).toBe('你');
    });

    it('只替换自然语言文本，不破坏结构化 user 锚点', async () => {
        const { normalizeNarrativeValue } = await loadNarrativeUserNameModule('林远');
        const normalized = normalizeNarrativeValue(
            {
                title: '主角进入城门',
                summary: '她对用户保持警惕',
                targetActorKey: 'user',
                participants: ['char_erin', 'user'],
                fields: {
                    state: '当前用户仍在观察名单中',
                },
            },
            '林远',
        );
        expect(normalized.title).toBe('林远进入城门');
        expect(normalized.summary).toBe('她对林远保持警惕');
        expect(normalized.fields.state).toBe('林远仍在观察名单中');
        expect(normalized.targetActorKey).toBe('user');
        expect(normalized.participants).toEqual(['char_erin', 'user']);
    });

    it('会把主角和用户统一替换成当前显示名', async () => {
        const { normalizeUserNarrativeText } = await loadNarrativeUserNameModule('林远');
        expect(normalizeUserNarrativeText('主角提醒她不要再怀疑用户', '林远')).toBe('林远提醒她不要再怀疑林远');
    });

    it('会把双花括号用户占位符替换成当前显示名', async () => {
        const { normalizeUserNarrativeText } = await loadNarrativeUserNameModule('林远');
        expect(normalizeUserNarrativeText('{{user}}在雨里回头看向{{ userDisplayName }}', '林远')).toBe('林远在雨里回头看向林远');
    });

    it('会把 typed placeholder 渲染为自然语言引用', () => {
        const rendered = renderNarrativeReferenceText(
            '{{actor:char_heying}}在{{location:半山腰旧庙}}等待{{userDisplayName}}',
            {
                userDisplayName: '林远',
                labelMap: new Map<string, string>([
                    ['actor:char_heying', '何盈'],
                    ['location:半山腰旧庙', '半山腰旧庙'],
                ]),
                aliasToLabelMap: new Map<string, string>(),
            },
        );
        expect(rendered).toBe('何盈在半山腰旧庙等待林远');
    });

    it('会把泄漏到自然语言字段中的内部 key 渲染掉', () => {
        const rendered = renderNarrativeReferenceText(
            'char_heying仍在location:半山腰旧庙等用户',
            {
                userDisplayName: '林远',
                labelMap: new Map<string, string>([
                    ['char_heying', '何盈'],
                    ['location:半山腰旧庙', '半山腰旧庙'],
                ]),
                aliasToLabelMap: new Map<string, string>(),
            },
        );
        expect(rendered).toBe('何盈仍在半山腰旧庙等林远');
    });

    it('会把自然语言中的{{user}}占位符渲染为当前用户名', () => {
        const rendered = renderNarrativeReferenceText(
            '{{user}}仍在{{location:半山腰旧庙}}等{{ user }}',
            {
                userDisplayName: '林远',
                labelMap: new Map<string, string>([
                    ['location:半山腰旧庙', '半山腰旧庙'],
                ]),
                aliasToLabelMap: new Map<string, string>(),
            },
        );
        expect(rendered).toBe('林远仍在半山腰旧庙等林远');
    });
});
