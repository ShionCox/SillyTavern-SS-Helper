import { describe, expect, it } from 'vitest';
import { DreamMutationTranslator } from '../src/services/dream-mutation-translator';
import type { DreamMutationProposal } from '../src/services/dream-types';

describe('DreamMutationTranslator', () => {
    it('会把 dream proposal 翻译为统一 mutation 协议', () => {
        const translator = new DreamMutationTranslator();
        const mutations: DreamMutationProposal[] = [
            {
                mutationId: 'm1',
                mutationType: 'entry_create',
                confidence: 0.82,
                reason: '形成了更稳定的事件记忆。',
                sourceWave: 'recent',
                sourceEntryIds: ['entry_a'],
                preview: '新增事件条目',
                payload: {
                    title: '雨夜重逢',
                    entryType: 'event',
                    summary: '在雨夜再次相遇。',
                    tags: ['重逢', '夜晚'],
                    actorBindings: ['user', 'assistant'],
                },
                explain: {
                    sourceWave: 'recent',
                    sourceEntryIds: ['entry_a'],
                    sourceNodeKeys: ['node_a'],
                    bridgeNodeKeys: ['bridge_a'],
                    explanationSteps: ['step 1'],
                    confidenceBreakdown: {
                        retrieval: 0.8,
                        activation: 0.7,
                        novelty: 0.6,
                        repetitionPenalty: 0.1,
                        final: 0.82,
                    },
                },
            },
            {
                mutationId: 'm2',
                mutationType: 'relationship_patch',
                confidence: 0.77,
                reason: '双方互动稳定升温。',
                sourceWave: 'mid',
                sourceEntryIds: ['entry_b'],
                preview: '更新关系',
                payload: {
                    relationshipId: 'rel_1',
                    sourceActorKey: 'user',
                    targetActorKey: 'assistant',
                    relationTag: '朋友',
                    trust: 66,
                    affection: 72,
                    tension: 8,
                    summary: '关系更稳定',
                },
                explain: {
                    sourceWave: 'mid',
                    sourceEntryIds: ['entry_b'],
                    sourceNodeKeys: ['node_b'],
                    bridgeNodeKeys: [],
                    explanationSteps: ['step 1'],
                    confidenceBreakdown: {
                        retrieval: 0.7,
                        activation: 0.7,
                        novelty: 0.5,
                        repetitionPenalty: 0.1,
                        final: 0.77,
                    },
                },
            },
        ];

        const translated = translator.translateMutations({
            dreamId: 'dream_1',
            mutations,
        });

        expect(translated).toHaveLength(2);
        expect(translated[0]).toMatchObject({
            targetKind: 'event',
            action: 'ADD',
            title: '雨夜重逢',
        });
        expect(translated[0]?.reasonCodes).toContain('source:dream');
        expect(translated[0]?.reasonCodes).toContain('wave:recent');
        expect((translated[0]?.detailPayload as Record<string, unknown>)?.dreamMeta).toBeTruthy();
        expect(translated[1]).toMatchObject({
            targetKind: 'relationship',
            action: 'UPDATE',
            title: '朋友',
        });
        expect((translated[1]?.detailPayload as Record<string, unknown>)?.sourceActorKey).toBe('user');
        expect((translated[1]?.sourceContext as Record<string, unknown>)?.mutationId).toBe('m2');
    });
});
