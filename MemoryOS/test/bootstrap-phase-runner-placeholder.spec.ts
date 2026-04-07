import { describe, expect, it, vi } from 'vitest';
import { runBootstrapPhase } from '../src/memory-bootstrap/bootstrap-phase-runner';

describe('runBootstrapPhase 用户占位符', () => {
    it('会在冷启动送模前把真实用户名替换为 {{user}}', async () => {
        const llmRunTask = vi.fn(async () => ({
            ok: false,
            reasonCode: 'mocked_stop',
        }));

        await runBootstrapPhase({
            llm: {
                registerConsumer: () => {},
                unregisterConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            userDisplayName: '林远',
            phaseName: 'phase2',
            payload: {
                sourceBundle: {
                    user: {
                        userName: '林远',
                    },
                    recentEvents: ['林远在雨里回到了村子。'],
                    semantic: {
                        firstMessage: '何盈抬头看向林远。',
                    },
                },
                actorKeyHints: {
                    currentUser: {
                        actorKey: 'user',
                        displayName: '{{user}}',
                        note: '所有自然语言字段一律使用 {{user}}。',
                    },
                },
                userPlaceholder: '{{user}}',
            },
        });

        const call = llmRunTask.mock.calls[0]?.[0] as { input?: { messages?: Array<{ content: string }> } };
        const promptText = (call.input?.messages ?? []).map((item) => item.content).join('\n');
        expect(promptText).toContain('{{user}}');
        expect(promptText).not.toContain('林远');
        expect(promptText).not.toContain('{{userDisplayName}}');
    });
});
