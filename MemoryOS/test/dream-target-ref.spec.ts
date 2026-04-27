import { describe, expect, it } from 'vitest';
import type { MemoryOSSettings } from '../src/settings/store';
import { DreamMutationTranslator } from '../src/services/dream-mutation-translator';
import { DreamPromptDTOService } from '../src/services/dream-prompt-dto-service';
import type { DreamSessionMetaRecord, DreamSessionRecallRecord } from '../src/services/dream-types';

function buildDreamSettings(): MemoryOSSettings {
    return {
        dreamFusedMaxItems: 8,
        dreamPromptMaxHighlights: 4,
        dreamPromptMaxMutations: 6,
        dreamPromptWeakInferenceOnly: false,
        dreamPromptRequireExplain: true,
        dreamExecutionMode: 'manual_review',
    } as MemoryOSSettings;
}

function buildDreamMeta(): DreamSessionMetaRecord {
    return {
        dreamId: 'dream-1',
        chatKey: 'chat',
        status: 'running',
        triggerReason: 'manual',
        createdAt: 1,
        updatedAt: 1,
        settingsSnapshot: {
            retrievalMode: 'hybrid',
            dreamContextMaxChars: 8000,
        },
    };
}

function buildDreamRecall(): DreamSessionRecallRecord {
    return {
        dreamId: 'dream-1',
        chatKey: 'chat',
        recentHits: [
            {
                entryId: 'entry-task-1',
                title: '护送密使离开王都',
                summary: '任务仍在筹划。',
                score: 0.86,
                source: 'recent',
                actorKeys: ['actor:erin'],
                relationKeys: ['rel-erin-user'],
                tags: ['task'],
            },
        ],
        midHits: [],
        deepHits: [],
        fusedHits: [],
        diagnostics: {
            sourceQuery: '护送密使',
            totalCandidates: 1,
            truncated: false,
        },
        createdAt: 1,
        updatedAt: 1,
    };
}

describe('dream writable target refs', () => {
    it('会在 DreamPromptDTO 中暴露可写 targetRef 并保留系统侧映射', () => {
        const result = new DreamPromptDTOService().build({
            meta: buildDreamMeta(),
            recall: buildDreamRecall(),
            diagnostics: null,
            graphSnapshot: null,
            settings: buildDreamSettings(),
            promptInfo: {
                promptVersion: 'test',
                stylePreset: 'reflective',
                schemaVersion: 'dream-output.v1',
            },
        });

        expect(result.dto.writableTargets.patchTargets[0]?.targetRef).toBe('T1');
        expect(result.dto.writableTargets.patchTargets[0]?.entryRef).toBe('E1');
        expect(result.dto.writableTargets.patchTargets[1]?.targetRef).toBe('T2');
        expect(result.dto.writableTargets.patchTargets[1]?.relationshipRef).toBe('R1');
        expect(result.targetRefToEntryId.get('T1')).toBe('entry-task-1');
        expect(result.targetRefToRelationshipId.get('T2')).toBe('rel-erin-user');
    });

    it('会由 translator 解码 targetRef，并为 entry_create 生成稳定键', () => {
        const translator = new DreamMutationTranslator({
            targetRefToEntryId: new Map([['T1', 'entry-task-1']]),
            targetRefToRelationshipId: new Map([['T2', 'rel-erin-user']]),
        });

        const mutations = translator.translateMutations({
            dreamId: 'dream-1',
            mutations: [
                {
                    mutationId: 'm_patch',
                    mutationType: 'entry_patch',
                    confidence: 0.9,
                    reason: '任务阶段发生变化。',
                    sourceWave: 'recent',
                    sourceEntryIds: ['entry-task-1'],
                    preview: '护送任务进入执行。',
                    payload: {
                        targetRef: 'T1',
                        entryType: 'task',
                        patch: {
                            summary: '任务改为当晚执行。',
                            fields: {
                                status: '执行中',
                            },
                        },
                    },
                },
                {
                    mutationId: 'm_create',
                    mutationType: 'entry_create',
                    confidence: 0.92,
                    reason: '发现新的内鬼调查线索。',
                    sourceWave: 'fused',
                    sourceEntryIds: ['entry-task-1'],
                    preview: '新增内鬼调查任务。',
                    payload: {
                        entryType: 'task',
                        keySeed: {
                            kind: 'task',
                            title: '追踪王都内鬼',
                            qualifier: '北门守卫线索',
                            participants: ['actor:erin'],
                        },
                        newRecord: {
                            title: '追踪王都内鬼',
                            summary: '泄密者接触过北门守卫，身份仍未查明。',
                            fields: {
                                objective: '确认王都内鬼身份',
                                status: '待调查',
                            },
                        },
                    },
                },
                {
                    mutationId: 'm_rel',
                    mutationType: 'relationship_patch',
                    confidence: 0.88,
                    reason: '艾琳信任度提高。',
                    sourceWave: 'recent',
                    sourceEntryIds: ['entry-task-1'],
                    preview: '强化艾琳与用户的盟友关系。',
                    payload: {
                        targetRef: 'T2',
                        patch: {
                            relationTag: '可靠盟友',
                            summary: '艾琳愿意共享真实情报。',
                            trust: 72,
                            participants: ['actor:erin', 'user'],
                        },
                    },
                },
            ],
        });

        expect(mutations[0]?.entryId).toBe('entry-task-1');
        expect(mutations[0]?.detailPayload?.fields).toEqual({ status: '执行中' });
        expect(mutations[1]?.entityKey).toContain('entity:task:');
        expect(mutations[1]?.compareKey).toContain('ck:');
        expect(mutations[1]?.matchKeys?.[0]).toContain('mk:task:');
        expect(mutations[2]?.detailPayload?.relationshipId).toBe('rel-erin-user');
        expect(mutations[2]?.detailPayload?.relationTag).toBe('可靠盟友');
    });
});
