import { describe, expect, it } from 'vitest';
import { MemorySDKImpl } from '../src/sdk/memory-sdk';
import type { PromptAssemblySnapshot } from '../src/types';

describe('recall explanation semantic counts', () => {
    it('会把 prompt 快照里的公共语义数量写入召回说明', async () => {
        const sdk = new MemorySDKImpl('chat-1') as unknown as MemorySDKImpl & {
            buildRecallExplanationFromSnapshot: (snapshot: PromptAssemblySnapshot) => Record<string, unknown>;
        };

        const explanation = sdk.buildRecallExplanationFromSnapshot({
            generatedAt: 1,
            query: '测试',
            matchedActorKeys: [],
            matchedEntryIds: [],
            systemText: '',
            roleText: '',
            finalText: '',
            systemEntryIds: [],
            roleEntries: [
                {
                    actorKey: 'actor:a',
                    actorLabel: 'A',
                    entryId: 'e1',
                    title: '事件',
                    entryType: 'event',
                    memoryPercent: 60,
                    forgotten: false,
                    forgettingTier: 'active',
                    renderedText: '',
                    retentionStage: 'clear',
                    retentionReasonCodes: [],
                    renderMode: 'clear',
                    semantic: {
                        semanticKind: 'event',
                        visibilityScope: 'actor_visible',
                        isCharacterVisible: true,
                        sourceEntryType: 'event',
                    },
                },
                {
                    actorKey: 'actor:a',
                    actorLabel: 'A',
                    entryId: 'e2',
                    title: '状态',
                    entryType: 'scene_shared_state',
                    memoryPercent: 60,
                    forgotten: true,
                    forgettingTier: 'shadow_forgotten',
                    shadowTriggered: true,
                    renderedText: '',
                    retentionStage: 'clear',
                    retentionReasonCodes: [],
                    renderMode: 'clear',
                    semantic: {
                        semanticKind: 'state',
                        visibilityScope: 'scene_shared',
                        isCharacterVisible: true,
                        sourceEntryType: 'scene_shared_state',
                    },
                },
            ],
            reasonCodes: [],
            diagnostics: {
                providerId: 'p',
                rulePackMode: 'native',
                contextRoute: null,
                retrieval: null,
                traceRecords: [],
                injectionActorKey: 'actor:a',
                injectedCount: 2,
                estimatedChars: 20,
                retentionStageCounts: { clear: 2, blur: 0, distorted: 0 },
            },
        });

        expect(explanation.semanticCounts).toMatchObject({
            event: 1,
            state: 1,
            task_progress: 0,
        });
        expect(explanation.forgettingCounts).toMatchObject({
            active: 1,
            shadow_forgotten: 1,
            hard_forgotten: 0,
        });
        expect(explanation.shadowTriggeredCount).toBe(1);
    });
});
