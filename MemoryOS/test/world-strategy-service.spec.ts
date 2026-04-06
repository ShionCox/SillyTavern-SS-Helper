import { describe, expect, it } from 'vitest';
import {
    applyWorldStrategyToRetrievalCandidates,
    buildWorldStrategyExplanationFromBinding,
    resolveChatWorldStrategy,
} from '../src/services/world-strategy-service';
import type { RetrievalCandidate } from '../src/memory-retrieval/types';
import type { WorldProfileBinding } from '../src/types';

describe('world strategy service', () => {
    it('reuses persisted binding as stable strategy source', async () => {
        const binding: WorldProfileBinding = {
            chatKey: 'chat-1',
            primaryProfile: 'fantasy_magic',
            secondaryProfiles: ['supernatural_hidden'],
            confidence: 0.88,
            reasonCodes: ['from_db'],
            detectedFrom: ['龙族', '王国'],
            sourceHash: 'wp:test',
            bindingMode: 'auto',
            createdAt: 1,
            updatedAt: 2,
        };

        const strategy = await resolveChatWorldStrategy({
            binding,
            texts: ['现代公司办公室日常'],
        });

        expect(strategy.explanation.profileId).toBe('fantasy_magic');
        expect(strategy.detection.reasonCodes).toContain('source:world_profile_binding');
        expect(strategy.explanation.preferredSchemas).toContain('world_core_setting');
    });

    it('boosts preferred schemas during retrieval biasing', async () => {
        const strategy = await resolveChatWorldStrategy({
            texts: ['魔法 王国 精灵 圣殿'],
        });
        const candidates: RetrievalCandidate[] = [
            {
                candidateId: '1',
                entryId: '1',
                schemaId: 'world_core_setting',
                title: '法则',
                summary: '王国以魔法契约维持秩序',
                updatedAt: 1,
                memoryPercent: 50,
            },
            {
                candidateId: '2',
                entryId: '2',
                schemaId: 'task',
                title: '办公开会',
                summary: '公司流程汇报',
                updatedAt: 1,
                memoryPercent: 50,
            },
        ];

        const biased = applyWorldStrategyToRetrievalCandidates(candidates, strategy);

        expect(biased[0]?.memoryPercent).toBeGreaterThan(candidates[0]?.memoryPercent ?? 0);
        expect(biased[1]?.memoryPercent).toBeLessThanOrEqual(candidates[1]?.memoryPercent ?? 0);
    });

    it('builds workbench explanation from binding', () => {
        const explanation = buildWorldStrategyExplanationFromBinding({
            chatKey: 'chat-1',
            primaryProfile: 'urban_modern',
            secondaryProfiles: [],
            confidence: 1,
            reasonCodes: ['source:manual_override'],
            detectedFrom: ['workbench'],
            sourceHash: 'wp:1',
            bindingMode: 'manual',
            createdAt: 1,
            updatedAt: 1,
        });

        expect(explanation?.bindingMode).toBe('manual');
        expect(explanation?.injectionStyle).toBe('urban_modern');
        expect(explanation?.effectSummary.length).toBeGreaterThan(0);
    });
});
