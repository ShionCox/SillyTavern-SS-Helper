import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
