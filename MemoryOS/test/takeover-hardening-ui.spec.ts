import { describe, expect, it } from 'vitest';

import { buildSummaryWindow } from '../src/memory-summary/summary-window';
import { buildTakeoverMemoryGraph } from '../src/ui/workbenchTabs/shared/memory-graph-builder';
import { renderNarrativeReferenceText } from '../src/utils/narrative-reference-renderer';
import type { MemoryTakeoverBatchResult, MemoryTakeoverProgressSnapshot } from '../src/types';

function createBatchForUi(): MemoryTakeoverBatchResult {
    return {
        takeoverId: 'takeover:test',
        batchId: 'takeover:test:history:0001',
        summary: '测试批次',
        actorCards: [],
        relationships: [],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [{
            target: 'char_alice',
            from: '陌生',
            to: '熟悉',
            reason: '旧协议脏引用',
            relationTag: '朋友',
            targetType: 'actor',
            bindings: {
                actors: [],
                organizations: [],
                cities: [],
                locations: [],
                nations: [],
                tasks: [],
                events: [],
            },
            reasonCodes: [],
        }],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [],
        sourceRange: { startFloor: 1, endFloor: 2 },
        validated: true,
        repairedOnce: false,
        isolated: false,
        validationErrors: [],
        repairActions: [],
        generatedAt: 1,
    };
}

describe('takeover char_* cleanup', (): void => {
    it('narrative renderer 不再把 char_* 当成合法稳定引用', (): void => {
        const text = renderNarrativeReferenceText('目标是 char_alice', {
            userDisplayName: '你',
            labelMap: new Map(),
            aliasToLabelMap: new Map(),
        });

        expect(text).toContain('char_alice');
    });

    it('summary window 只提取 actor_* / user 提示词', (): void => {
        const window = buildSummaryWindow([
            { role: 'user', content: 'char_alice 出现了', turnIndex: 1 },
            { role: 'assistant', content: 'actor_bob 也出现了', turnIndex: 2 },
        ]);

        expect(window.actorHints).toEqual(['user', 'actor_bob']);
    });

    it('graph builder 不再为 char_* 创建 actor 节点', (): void => {
        const progress: MemoryTakeoverProgressSnapshot = {
            plan: null,
            currentBatch: null,
            baseline: null,
            activeSnapshot: null,
            latestBatchResult: null,
            consolidation: null,
            batchResults: [createBatchForUi()],
        };

        const graph = buildTakeoverMemoryGraph(progress);

        expect(graph.nodes.some((node) => String(node.id).includes('char_alice'))).toBe(false);
        expect(graph.edges.some((edge) => String(edge.source).includes('char_alice') || String(edge.target).includes('char_alice'))).toBe(false);
    });
});
