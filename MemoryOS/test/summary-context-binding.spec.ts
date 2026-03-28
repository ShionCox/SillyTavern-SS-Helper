import { describe, expect, it } from 'vitest';
import { buildSummaryMutationContext } from '../src/memory-summary-planner';
import type { MemoryEntry, WorldProfileBinding } from '../src/types';

describe('buildSummaryMutationContext world profile binding', () => {
    it('prefers persisted world profile binding over temporary detection', async () => {
        const entries: MemoryEntry[] = [
            {
                entryId: 'entry-1',
                chatKey: 'chat',
                title: '规则',
                entryType: 'world_hard_rule',
                category: '世界基础',
                tags: [],
                summary: '夜间宵禁',
                detail: '',
                detailSchemaVersion: 1,
                detailPayload: {},
                sourceSummaryIds: [],
                createdAt: 1,
                updatedAt: 1,
            },
        ];
        const binding: WorldProfileBinding = {
            chatKey: 'chat',
            primaryProfile: 'supernatural_hidden',
            secondaryProfiles: ['urban_modern'],
            confidence: 0.77,
            reasonCodes: ['from_db'],
            detectedFrom: ['cache'],
            sourceHash: 'wp:1',
            createdAt: 1,
            updatedAt: 1,
        };

        const result = await buildSummaryMutationContext({
            task: 'memory_summary_mutation',
            schemaVersion: '1.0.0',
            window: {
                fromTurn: 1,
                toTurn: 2,
                summaryText: '普通现代城市对话，但数据库里有已绑定模板',
            },
            actorHints: ['char_erin'],
            entries,
            worldProfileTexts: ['urban city'],
            worldProfileBinding: binding,
            enableEmbedding: false,
        });

        expect(result.context.worldProfileBias.primaryProfile).toBe('supernatural_hidden');
        expect(result.context.worldProfileBias.reasonCodes).toContain('source:world_profile_binding');
        expect(result.context.narrativeStyle.primaryStyle).toBe('modern');
        expect(result.context.narrativeStyle.secondaryStyles).toContain('fantasy');
        expect(result.context.narrativeStyle.isStable).toBe(true);
    });
});
