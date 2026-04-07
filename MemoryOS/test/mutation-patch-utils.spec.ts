import { describe, expect, it } from 'vitest';
import { normalizeSummaryPatch } from '../src/memory-summary/mutation-patch-utils';
import { applyPatchDiffGuard } from '../src/memory-summary/patch-diff-guard';
import type { SummaryMutationDocument } from '../src/memory-summary/mutation-types';
import type { MemoryEntry } from '../src/types';

function buildEntry(): MemoryEntry {
    return {
        entryId: 'entry-1',
        chatKey: 'chat',
        title: '艾琳',
        entryType: 'actor_profile',
        category: '角色关系',
        tags: ['friend'],
        summary: '旧摘要',
        detail: '旧详情',
        detailSchemaVersion: 1,
        detailPayload: {
            compareKey: 'actor_profile:char_erin',
            fields: {
                aliases: ['艾琳'],
                traits: ['谨慎'],
            },
        },
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 2,
    };
}

describe('normalizeSummaryPatch', () => {
    it('会按动作类型归一化载荷字段', () => {
        const result = normalizeSummaryPatch([
            {
                action: 'ADD',
                targetKind: 'actor_profile',
                payload: { title: '新角色' },
            },
            {
                action: 'UPDATE',
                targetKind: 'actor_profile',
                payload: { summary: '新摘要' },
            },
            {
                action: 'DELETE',
                targetKind: 'actor_profile',
                payload: { summary: '不应保留' },
            },
        ]);

        expect(result[0].newRecord).toEqual({ title: '新角色' });
        expect(result[0].patch).toBeUndefined();
        expect(result[1].patch).toEqual({ summary: '新摘要' });
        expect(result[1].newRecord).toBeUndefined();
        expect(result[2].patch).toBeUndefined();
        expect(result[2].newRecord).toBeUndefined();
        expect(result[2].payload).toBeUndefined();
    });
});

describe('applyPatchDiffGuard', () => {
    it('会移除未变化字段并把空补丁降级为 NOOP', async () => {
        const document: SummaryMutationDocument = {
            schemaVersion: '1.0.0',
            window: {
                fromTurn: 1,
                toTurn: 2,
            },
            actions: [
                {
                    action: 'UPDATE',
                    targetKind: 'actor_profile',
                    candidateId: 'cand_1',
                    patch: {
                        title: '艾琳',
                        summary: '旧摘要',
                        fields: {
                            aliases: ['艾琳'],
                        },
                    },
                },
            ],
        };

        const result = await applyPatchDiffGuard(
            document,
            [{
                candidateId: 'cand_1',
                recordId: 'entry-1',
                targetKind: 'actor_profile',
                schemaId: 'actor_profile',
                title: '艾琳',
                summary: '旧摘要',
                entityKeys: [],
                compareKey: 'actor_profile:char_erin',
                aliases: [],
                lifecycleStatus: 'active',
                status: 'active',
                updatedAt: 2,
            }],
            async () => buildEntry(),
        );

        expect(result.document.actions[0].action).toBe('NOOP');
        expect(result.document.actions[0].reasonCodes).toContain('patch_diff_noop');
        expect(result.diagnostics[0].downgradedToNoop).toBe(true);
    });

    it('会保留真正发生变化的字段', async () => {
        const document: SummaryMutationDocument = {
            schemaVersion: '1.0.0',
            window: {
                fromTurn: 1,
                toTurn: 2,
            },
            actions: [
                {
                    action: 'UPDATE',
                    targetKind: 'actor_profile',
                    candidateId: 'cand_1',
                    patch: {
                        summary: '新摘要',
                        fields: {
                            traits: ['谨慎', '冷静'],
                        },
                    },
                },
            ],
        };

        const result = await applyPatchDiffGuard(
            document,
            [{
                candidateId: 'cand_1',
                recordId: 'entry-1',
                targetKind: 'actor_profile',
                schemaId: 'actor_profile',
                title: '艾琳',
                summary: '旧摘要',
                entityKeys: [],
                compareKey: 'actor_profile:char_erin',
                aliases: [],
                lifecycleStatus: 'active',
                status: 'active',
                updatedAt: 2,
            }],
            async () => buildEntry(),
        );

        expect(result.document.actions[0].action).toBe('UPDATE');
        expect(result.document.actions[0].patch).toEqual({
            summary: '新摘要',
            fields: {
                traits: ['谨慎', '冷静'],
            },
        });
    });
});
