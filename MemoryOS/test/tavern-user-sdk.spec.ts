import { describe, expect, it } from 'vitest';
import {
    getCurrentTavernUserNameEvent,
    getCurrentTavernUserSnapshotEvent,
    replaceTavernUserPlaceholdersEvent,
} from '../../SDK/tavern';
import { collectChatSemanticSeed } from '../src/core/chat-semantic-bootstrap';

/**
 * 功能：安装基础 Tavern 上下文，供用户信息与冷启动语义种子测试复用。
 * @returns 无返回值。
 */
function installMockTavernContext(): void {
    (globalThis as Record<string, unknown>).SillyTavern = {
        getContext: (): Record<string, unknown> => ({
            name1: '辽',
            name2: '艾莉卡·暮影',
            characterId: 0,
            this_chid: 0,
            characters: [
                {
                    name: '艾莉卡·暮影',
                    avatar: 'erika.png',
                    chat: 'chat-001',
                },
            ],
            systemPrompt: '你正在与 {{user}} 对话。',
            first_mes: '欢迎你，{{user}}。',
            author_note: '{{user}} 是当前视角主角。',
            powerUserSettings: {
                persona_description: '{{user}} 是一名来自北境的旅者。',
                default_persona: 'liao.png',
            },
            chatMetadata: {
                persona: '{{user}} 的聊天人格备注。',
            },
            groupMembers: ['艾莉卡·暮影', '莉娅'],
        }),
    };
}

/**
 * 功能：安装用于冷启动测试的世界书加载器，模拟包含角色与非角色条目的世界书。
 * @returns 无返回值。
 */
function installMockWorldbookLoader(): void {
    (globalThis as Record<string, unknown>).loadWorldInfo = async (bookName: string): Promise<Record<string, unknown> | null> => {
        if (bookName !== 'book-roles') {
            return null;
        }
        return {
            entries: {
                'entry-main': {
                    uid: 'entry-main',
                    comment: '艾莉卡·暮影',
                    key: ['艾莉卡·暮影', '角色'],
                    content: '姓名：艾莉卡·暮影\n身份：暮影巡礼者\n来历：来自北境雾港\n装备：暮影短刃、雾纹护符\n物品：旧地图、封蜡信\n关系：与莉娅是同伴',
                },
                'entry-side': {
                    uid: 'entry-side',
                    comment: '莉娅',
                    key: ['莉娅', '角色'],
                    content: '姓名：莉娅\n别名：白鸦\n身份：向导\n物品：观星笔记\n关系：与艾莉卡·暮影同行',
                },
                'entry-place': {
                    uid: 'entry-place',
                    comment: '雾港',
                    key: ['雾港', '地点'],
                    content: '地点：北境港口城市',
                },
            },
        };
    };
}

/**
 * 功能：安装包含大量规则条目的世界书加载器，验证冷启动规则不会被截断。
 * @returns 无返回值。
 */
function installMockWorldbookLoaderWithDenseRules(): void {
    const ruleLines = Array.from({ length: 36 }, (_, index: number): string => `规则${index + 1}：必须遵守第${index + 1}条流程`);
    (globalThis as Record<string, unknown>).loadWorldInfo = async (bookName: string): Promise<Record<string, unknown> | null> => {
        if (bookName !== 'book-rules') {
            return null;
        }
        return {
            entries: {
                'entry-rules': {
                    uid: 'entry-rules',
                    comment: '规则总表',
                    key: ['规则', '世界观'],
                    content: ruleLines.join('\n'),
                },
            },
        };
    };
}

describe('tavern-user-sdk', (): void => {
    it('会通过官方 getContext 读取当前用户名并生成用户快照', (): void => {
        installMockTavernContext();

        expect(getCurrentTavernUserNameEvent()).toBe('辽');

        expect(getCurrentTavernUserSnapshotEvent()).toEqual({
            userName: '辽',
            counterpartName: '艾莉卡·暮影',
            personaDescription: '辽 是一名来自北境的旅者。',
            metadataPersona: '辽 的聊天人格备注。',
            avatarName: 'liao.png',
            avatarUrl: 'User Avatars/liao.png',
            hasPersonaDescription: true,
        });
    });

    it('会把 {{user}} 占位符替换成当前用户名并用于冷启动采集', async (): Promise<void> => {
        installMockTavernContext();

        expect(replaceTavernUserPlaceholdersEvent('你好，{{user}}')).toBe('你好，辽');

        const result = await collectChatSemanticSeed('chat-001', []);
        expect(result.seed).not.toBeNull();
        expect(result.seed?.systemPrompt).toContain('辽');
        expect(result.seed?.firstMessage).toContain('辽');
        expect(result.seed?.authorNote).toContain('辽');
        expect(String(result.seed?.characterCore.userName ?? '')).toBe('辽');
    });

    it('基础冷启动只保留世界书原文线索，不再本地兜底推断角色资料', async (): Promise<void> => {
        installMockTavernContext();
        installMockWorldbookLoader();

        const result = await collectChatSemanticSeed('chat-001', ['book-roles']);

        expect(result.seed).not.toBeNull();
        expect(result.seed?.activeLorebooks).toContain('book-roles');
        expect(result.seed?.lorebookSeed.some((item) => item.book === 'book-roles')).toBe(true);
        expect(result.seed?.lorebookSeed.flatMap((item) => item.snippets).join('\n')).toContain('暮影短刃');
        expect(result.seed?.identitySeeds).toBeUndefined();
        expect(result.seed?.roleProfileSeeds).toBeUndefined();
    });

    it('cold start imports all worldbook rules without truncation', async (): Promise<void> => {
        installMockTavernContext();
        installMockWorldbookLoaderWithDenseRules();

        const result = await collectChatSemanticSeed('chat-001', ['book-rules']);
        const rules = result.seed?.worldSeed.rules ?? [];

        expect(rules.length).toBeGreaterThanOrEqual(36);
        expect(rules.some((item) => /\u89c4\u5219\s*1/.test(item) && /\u5fc5\u987b\u9075\u5b88\u7b2c\s*1\u6761\u6d41\u7a0b/.test(item))).toBe(true);
        expect(rules.some((item) => /\u89c4\u5219\s*36/.test(item) && /\u5fc5\u987b\u9075\u5b88\u7b2c\s*36\u6761\u6d41\u7a0b/.test(item))).toBe(true);
    });
});
