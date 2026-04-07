import { describe, expect, it, vi } from 'vitest';
import { runPromptReadyInjectionPipeline } from '../src/runtime/prompt-injection-pipeline';
import type { PromptAssemblySnapshot } from '../src/types';
import type { SdkTavernPromptMessageEvent } from '../../SDK/tavern';

/**
 * 功能：构造最小可用的 Prompt 组装快照。
 * @param overrides 覆盖字段
 * @returns Prompt 组装快照
 */
function buildPromptAssemblySnapshot(overrides: Partial<PromptAssemblySnapshot> = {}): PromptAssemblySnapshot {
    return {
        generatedAt: 123,
        query: '测试查询',
        matchedActorKeys: ['actor:test'],
        matchedEntryIds: ['entry:1'],
        systemText: '系统注入文本',
        roleText: '',
        finalText: '系统注入文本',
        systemEntryIds: ['entry:1'],
        roleEntries: [],
        reasonCodes: ['prompt:test'],
        diagnostics: {
            providerId: 'provider:test',
            rulePackMode: 'native',
            contextRoute: null,
            retrieval: null,
            traceRecords: [],
            injectionActorKey: 'actor:test',
            injectedCount: 1,
            estimatedChars: 12,
            retentionStageCounts: {
                clear: 1,
                blur: 0,
                distorted: 0,
            },
        },
        ...overrides,
    };
}

describe('runPromptReadyInjectionPipeline', () => {
    it('会复用同一份快照给 preview 和 inject', async () => {
        const snapshot = buildPromptAssemblySnapshot();
        const preview = vi.fn(async (): Promise<PromptAssemblySnapshot> => snapshot);
        const inject = vi.fn(async (input: { snapshot?: PromptAssemblySnapshot }) => {
            expect(input.snapshot).toBe(snapshot);
            return {
                shouldInject: true,
                inserted: true,
                insertIndex: 0,
                promptLength: 2,
                insertedLength: snapshot.finalText.length,
                trace: null,
            };
        });

        const result = await runPromptReadyInjectionPipeline({
            memory: {
                getChatKey: (): string => 'chat-1',
                unifiedMemory: {
                    prompts: {
                        preview,
                        inject,
                    },
                },
            },
            promptMessages: [{ role: 'user', content: '测试消息' } as unknown as SdkTavernPromptMessageEvent],
            readSettings: (): { contextMaxTokens: number } => ({ contextMaxTokens: 1200 }),
        });

        expect(preview).toHaveBeenCalledTimes(1);
        expect(inject).toHaveBeenCalledTimes(1);
        expect(result.baseDiagnostics.inserted).toBe(true);
        expect(result.latestExplanation?.matchedEntryIds).toEqual(['entry:1']);
        expect(result.logs[0]?.details?.matchedEntryIds).toEqual(['entry:1']);
    });
});
