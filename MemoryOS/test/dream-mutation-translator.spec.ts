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

    it('缺少明确 entryType 时会推断正式类型，不再兜底为 other', () => {
        const translator = new DreamMutationTranslator();
        const mutations: DreamMutationProposal[] = [
            {
                mutationId: 'm_scene',
                mutationType: 'entry_create',
                confidence: 0.78,
                reason: '实验室状态发生了明确变化。',
                sourceWave: 'recent',
                sourceEntryIds: ['entry_scene'],
                preview: '实验室状态更新',
                payload: {
                    title: '实验室基地状态',
                    summary: '实验室基础设施完成测试。',
                    fieldsJson: '{"location":"实验室","visibilityScope":"全员可见"}',
                },
            },
            {
                mutationId: 'm_task',
                mutationType: 'entry_create',
                confidence: 0.79,
                reason: '形成了明确目标。',
                sourceWave: 'mid',
                sourceEntryIds: ['entry_task'],
                preview: '建立食物供应',
                payload: {
                    title: '建立食物供应',
                    summary: '需要建立稳定食物供应。',
                    fieldsJson: '{"objective":"建立食物供应","status":"进行中"}',
                },
            },
            {
                mutationId: 'm_world',
                mutationType: 'entry_create',
                confidence: 0.8,
                reason: '形成了长期世界状态。',
                sourceWave: 'deep',
                sourceEntryIds: ['entry_world'],
                preview: '夜禁状态',
                payload: {
                    title: '夜禁状态',
                    summary: '城市进入夜禁状态。',
                    fieldsJson: '{"scope":"城市","state":"夜禁中"}',
                },
            },
        ];

        const translated = translator.translateMutations({
            dreamId: 'dream_2',
            mutations,
        });

        expect(translated.map((mutation) => mutation.targetKind)).toEqual([
            'scene_shared_state',
            'task',
            'world_global_state',
        ]);
        expect(translated.some((mutation) => mutation.targetKind === 'other')).toBe(false);
    });

    it('无法分类或低置信的梦境洞察只保留在梦境中，不写入主记忆', () => {
        const translator = new DreamMutationTranslator();
        const translated = translator.translateMutations({
            dreamId: 'dream_3',
            mutations: [
                {
                    mutationId: 'm_low',
                    mutationType: 'entry_create',
                    confidence: 0.5,
                    reason: '只是象征性联想。',
                    sourceWave: 'deep',
                    sourceEntryIds: ['entry_low'],
                    preview: '梦境洞察',
                    payload: {
                        title: '梦境洞察',
                        summary: '记忆在梦里轻微震荡。',
                    },
                },
                {
                    mutationId: 'm_unknown',
                    mutationType: 'entry_create',
                    confidence: 0.82,
                    reason: '没有足够结构化字段。',
                    sourceWave: 'deep',
                    sourceEntryIds: ['entry_unknown'],
                    preview: '梦境洞察',
                    payload: {
                        title: '梦境洞察',
                        summary: '一些抽象感受浮现。',
                    },
                },
            ],
        });

        expect(translated).toEqual([]);
    });

    it('关系形态的 entry_create 不会退化为 other 记忆块', () => {
        const translator = new DreamMutationTranslator();
        const translated = translator.translateMutations({
            dreamId: 'dream_4',
            mutations: [
                {
                    mutationId: 'm_relation_like',
                    mutationType: 'entry_create',
                    confidence: 0.82,
                    reason: '载荷更像关系更新而不是普通条目。',
                    sourceWave: 'mid',
                    sourceEntryIds: ['entry_relation'],
                    preview: '关系变化',
                    payload: {
                        title: '信任升温',
                        sourceActorKey: 'user',
                        targetActorKey: 'char_erin',
                        relationTag: '伙伴',
                        summary: '双方信任有所提升。',
                    },
                },
            ],
        });

        expect(translated).toEqual([]);
    });
});
