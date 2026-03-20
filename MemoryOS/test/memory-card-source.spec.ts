import { describe, expect, it, vi } from 'vitest';

const { searchMock, buildScoredCandidateMock } = vi.hoisted(() => ({
    searchMock: vi.fn(),
    buildScoredCandidateMock: vi.fn(),
}));

vi.mock('../src/vector/vector-manager', () => ({
    VectorManager: class {
        public async search(): Promise<unknown[]> {
            return searchMock();
        }
    },
}));

vi.mock('../src/recall/sources/shared', () => ({
    clamp01: (value: number): number => Math.max(0, Math.min(1, Number(value ?? 0) || 0)),
    normalizeText: (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim(),
    readSourceLimit: (): number => 5,
    loadFacts: async (): Promise<unknown[]> => [],
    loadRecentSummaries: async (): Promise<unknown[]> => [],
    buildScoredCandidate: (context: unknown, params: Record<string, unknown>): unknown => {
        return buildScoredCandidateMock(context, params);
    },
}));

import { collectMemoryCardRecallCandidates } from '../src/recall/sources/memory-card-source';

describe('memory-card-source semantic_seed', (): void => {
    it('会把 semantic_seed 命中直接转为候选项', async (): Promise<void> => {
        searchMock.mockResolvedValue([
            {
                cardId: 'card-001',
                content: '这个世界中公开施法会留下可追踪痕迹。',
                score: 0.91,
                metadata: {
                    sourceRecordKind: 'semantic_seed',
                    sourceRecordKey: 'semantic_seed:active',
                    memoryType: 'rule',
                    sourceScope: 'world',
                    participantActorKeys: [],
                },
                createdAt: Date.now(),
            },
        ]);
        buildScoredCandidateMock.mockImplementation((_context: unknown, params: Record<string, unknown>): Record<string, unknown> => ({
            ...params,
            reasonCodes: params.extraReasonCodes ?? [],
            selected: false,
            finalScore: 0.8,
        }));
        const candidates = await collectMemoryCardRecallCandidates({
            chatKey: 'chat-001',
            query: '魔法规则',
            vectorGate: {
                enabled: true,
                lanes: ['rule'],
            },
            plan: {
                sections: ['SUMMARY', 'FACTS'],
                fineTopK: 8,
            },
        } as any);
        expect(candidates.length).toBe(1);
        expect(buildScoredCandidateMock).toHaveBeenCalledTimes(1);
        expect((buildScoredCandidateMock.mock.calls[0]?.[1] as Record<string, unknown>).recordKind).toBe('state');
        expect((buildScoredCandidateMock.mock.calls[0]?.[1] as Record<string, unknown>).rawText).toContain('公开施法会留下可追踪痕迹');
    });
});
