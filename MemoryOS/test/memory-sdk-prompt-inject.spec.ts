import { describe, expect, it, vi } from 'vitest';
import { MemorySDKImpl } from '../src/sdk/memory-sdk';
import type { PromptAssemblySnapshot } from '../src/types';

/**
 * 功能：构造最小可用的 Prompt 组装快照。
 * @param overrides 覆盖字段。
 * @returns Prompt 组装快照。
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

describe('MemorySDKImpl prompt inject', () => {
    it('会直接消费传入的 snapshot 并同步更新召回说明', async () => {
        const sdk = new MemorySDKImpl('chat-1') as unknown as MemorySDKImpl & {
            promptAssemblyService: { buildPromptAssembly: ReturnType<typeof vi.fn> };
        };
        const buildPromptAssembly = vi.fn(async (): Promise<PromptAssemblySnapshot> => buildPromptAssemblySnapshot());
        sdk.promptAssemblyService = { buildPromptAssembly };
        const snapshot = buildPromptAssemblySnapshot({
            matchedEntryIds: ['entry:from_snapshot'],
            matchedActorKeys: ['actor:from_snapshot'],
        });
        const promptMessages = [{ role: 'user', content: '你好' }] as unknown as Parameters<MemorySDKImpl['unifiedMemory']['prompts']['inject']>[0]['promptMessages'];

        const result = await sdk.unifiedMemory.prompts.inject({
            promptMessages,
            snapshot,
        });

        expect(buildPromptAssembly).not.toHaveBeenCalled();
        expect(result.inserted).toBe(true);
        expect(String((promptMessages[0] as Record<string, unknown>)?.content ?? '')).toContain('<memoryos_context>');
        await expect(sdk.chatState.getLatestRecallExplanation()).resolves.toMatchObject({
            matchedEntryIds: ['entry:from_snapshot'],
            matchedActorKeys: ['actor:from_snapshot'],
        });
    });
});
