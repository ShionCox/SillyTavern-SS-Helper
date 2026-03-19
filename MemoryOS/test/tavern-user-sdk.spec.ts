import { describe, expect, it } from 'vitest';
import {
    getCurrentTavernUserNameEvent,
    getCurrentTavernUserSnapshotEvent,
    replaceTavernUserPlaceholdersEvent,
} from '../../SDK/tavern';
import { collectChatSemanticSeed } from '../src/core/chat-semantic-bootstrap';

function installMockTavernContext(): void {
    (globalThis as Record<string, unknown>).SillyTavern = {
        getContext: (): Record<string, unknown> => ({
            name1: '辽',
            name2: '艾莉卡',
            characterId: 0,
            this_chid: 0,
            characters: [
                {
                    name: '艾莉卡',
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
                persona: '{{user}} 的聊天人格备注',
            },
        }),
    };
}

describe('tavern-user-sdk', (): void => {
    it('会通过官方 getContext 读取当前用户名并生成用户快照', (): void => {
        installMockTavernContext();

        expect(getCurrentTavernUserNameEvent()).toBe('辽');

        expect(getCurrentTavernUserSnapshotEvent()).toEqual({
            userName: '辽',
            counterpartName: '艾莉卡',
            personaDescription: '辽 是一名来自北境的旅者。',
            metadataPersona: '辽 的聊天人格备注',
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
});