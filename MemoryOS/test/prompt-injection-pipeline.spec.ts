import { describe, expect, it } from 'vitest';
import { runPromptReadyInjectionPipeline } from '../src/runtime/prompt-injection-pipeline';
import type { SdkTavernPromptMessageEvent } from '../../SDK/tavern';

describe('prompt injection pipeline', (): void => {
    it('可执行基础注入与主链注入并返回结构化日志', async (): Promise<void> => {
        const promptMessages: SdkTavernPromptMessageEvent[] = [
            { role: 'system', is_system: true, content: 'system base' } as any,
            { role: 'assistant', content: '上一轮回复' } as any,
            { role: 'user', is_user: true, content: '厄尔多利亚是什么地方', mes_id: 'u-last' } as any,
        ];
        let latestExplanation: Record<string, unknown> | null = {
            generatedAt: Date.now(),
            query: '厄尔多利亚是什么地方',
        };

        const memoryMock = {
            getChatKey: (): string => 'test-chat',
            injection: {
                buildContext: async (): Promise<string> => '[Memory Context]\n<worldinfo><state>厄尔多利亚是魔法森林边境</state></worldinfo>',
                runMemoryPromptInjection: async (): Promise<any> => {
                    return {
                        shouldInject: true,
                        inserted: true,
                        insertIndex: 2,
                        promptLength: 128,
                        insertedLength: 64,
                        trace: { stage: 'memory_context_built', label: 'ok', traceId: 'trace:test' },
                    };
                },
            },
            chatState: {
                getPromptInjectionProfile: async (): Promise<null> => null,
                getLatestRecallExplanation: async (): Promise<Record<string, unknown> | null> => latestExplanation,
                setLatestRecallExplanation: async (value: Record<string, unknown>): Promise<void> => {
                    latestExplanation = value;
                },
            },
        };

        const result = await runPromptReadyInjectionPipeline({
            memory: memoryMock,
            promptMessages,
            readSettings: () => ({
                contextMaxTokens: 1200,
                injectionPromptSettings: {
                    enabled: true,
                    preset: 'balanced_enhanced',
                    aggressiveness: 'balanced',
                    forceDynamicFloor: true,
                    selectedOptions: ['world_setting', 'character_setting', 'relationship_state', 'current_scene', 'recent_plot'],
                },
            }),
            source: 'memory_test_pipeline',
            currentChatKey: 'test-chat',
        });

        expect(result.baseDiagnostics.enabled).toBe(true);
        expect(result.baseDiagnostics.inserted).toBe(true);
        expect(result.injectionResult.inserted).toBe(true);
        expect(result.logs.length).toBeGreaterThanOrEqual(2);
        expect(result.finalPromptText).toContain('厄尔多利亚');
        expect((result.latestExplanation ?? {}).baseInjection).toBeTruthy();
    });

    it('世界设定基础注入会包含 FACTS，避免地理设定仅在事实表时漏注入', async (): Promise<void> => {
        const promptMessages: SdkTavernPromptMessageEvent[] = [
            { role: 'system', is_system: true, content: 'system base' } as any,
            { role: 'user', is_user: true, content: '厄尔多利亚是什么地方', mes_id: 'u-last' } as any,
        ];
        const sectionCalls: string[][] = [];

        const memoryMock = {
            getChatKey: (): string => 'test-chat',
            injection: {
                buildContext: async (opts?: { sections?: string[] }): Promise<string> => {
                    sectionCalls.push([...(opts?.sections ?? [])]);
                    return '[Memory Context]\n<memoryos_context><worldinfo><state>厄尔多利亚是区域地理设定</state></worldinfo></memoryos_context>';
                },
                runMemoryPromptInjection: async (): Promise<any> => ({
                    shouldInject: false,
                    inserted: false,
                    insertIndex: -1,
                    promptLength: 0,
                    insertedLength: 0,
                    trace: { stage: 'memory_skipped', label: 'ok', traceId: 'trace:test-2' },
                }),
            },
            chatState: {
                getPromptInjectionProfile: async (): Promise<null> => null,
                getLatestRecallExplanation: async (): Promise<Record<string, unknown> | null> => null,
                setLatestRecallExplanation: async (): Promise<void> => {},
            },
        };

        await runPromptReadyInjectionPipeline({
            memory: memoryMock,
            promptMessages,
            readSettings: () => ({
                contextMaxTokens: 1200,
                injectionPromptSettings: {
                    enabled: true,
                    preset: 'setting_priority',
                    aggressiveness: 'balanced',
                    forceDynamicFloor: false,
                    selectedOptions: ['world_setting'],
                },
            }),
            source: 'memory_test_pipeline',
            currentChatKey: 'test-chat',
        });

        const mergedSections = new Set(sectionCalls.flat());
        expect(mergedSections.has('WORLD_STATE')).toBe(true);
        expect(mergedSections.has('FACTS')).toBe(true);
    });
});
