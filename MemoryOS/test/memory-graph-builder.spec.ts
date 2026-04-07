import { describe, expect, it } from 'vitest';
import { buildTakeoverMemoryGraph } from '../src/ui/workbenchTabs/shared/memory-graph-builder';
import type { MemoryTakeoverProgressSnapshot } from '../src/types';

/**
 * 功能：构造最小可用的接管图谱快照。
 * @param overrides 覆盖字段。
 * @returns 接管进度快照。
 */
function buildProgressSnapshot(overrides: Partial<MemoryTakeoverProgressSnapshot> = {}): MemoryTakeoverProgressSnapshot {
    return {
        plan: null,
        currentBatch: null,
        baseline: null,
        activeSnapshot: null,
        latestBatchResult: null,
        consolidation: null,
        batchResults: [],
        ...overrides,
    };
}

describe('buildTakeoverMemoryGraph', () => {
    it('有显式 bindings 时优先使用结构化主边，不再追加字段 fallback 边', () => {
        const graph = buildTakeoverMemoryGraph(buildProgressSnapshot({
            batchResults: [{
                takeoverId: 'takeover-1',
                batchId: 'batch-1',
                summary: '测试',
                actorCards: [],
                relationships: [],
                entityCards: [
                    {
                        entityType: 'location',
                        compareKey: 'location:旧港仓库',
                        title: '旧港仓库',
                        aliases: [],
                        summary: '一处仓库',
                        confidence: 0.9,
                        fields: {
                            organization: '黑塔会',
                        },
                        bindings: {
                            actors: [],
                            organizations: ['organization:黑塔会'],
                            cities: [],
                            locations: [],
                            nations: [],
                            tasks: [],
                            events: [],
                        },
                    },
                    {
                        entityType: 'organization',
                        compareKey: 'organization:黑塔会',
                        title: '黑塔会',
                        aliases: [],
                        summary: '目标组织',
                        confidence: 0.9,
                        fields: {},
                    },
                ],
                entityTransitions: [],
                stableFacts: [],
                relationTransitions: [],
                taskTransitions: [],
                worldStateChanges: [],
                openThreads: [],
                chapterTags: [],
                sourceRange: { startFloor: 1, endFloor: 1 },
                generatedAt: 1,
            }],
        }));

        const primaryEdge = graph.edges.find((edge) => edge.relationType === 'entity_binding_organization');
        const fallbackEdge = graph.edges.find((edge) => edge.relationType === 'belongs_to_organization');

        expect(primaryEdge?.sourceKinds).toContain('structured_binding');
        expect(primaryEdge?.reasonCodes).toContain('structured_binding_resolved');
        expect(primaryEdge?.sections[0]?.fields.some((field) => field.targetNodeId === primaryEdge?.target)).toBe(true);
        expect(fallbackEdge).toBeUndefined();
    });

    it('缺少显式 bindings 时会追加 fallback 字段边并生成占位节点', () => {
        const graph = buildTakeoverMemoryGraph(buildProgressSnapshot({
            batchResults: [{
                takeoverId: 'takeover-2',
                batchId: 'batch-2',
                summary: '测试',
                actorCards: [],
                relationships: [],
                entityCards: [
                    {
                        entityType: 'location',
                        compareKey: 'location:南门岗哨',
                        title: '南门岗哨',
                        aliases: [],
                        summary: '一处岗哨',
                        confidence: 0.9,
                        fields: {
                            organization: '灰烬守卫',
                        },
                    },
                ],
                entityTransitions: [],
                stableFacts: [],
                relationTransitions: [],
                taskTransitions: [],
                worldStateChanges: [],
                openThreads: [],
                chapterTags: [],
                sourceRange: { startFloor: 1, endFloor: 1 },
                generatedAt: 1,
            }],
        }));

        const fallbackEdge = graph.edges.find((edge) => edge.relationType === 'belongs_to_organization');
        const placeholderNode = graph.nodes.find((node) => node.type === 'placeholder');

        expect(fallbackEdge?.sourceKinds).toContain('fallback_field_inference');
        expect(fallbackEdge?.reasonCodes).toContain('fallback_field_inference_resolved');
        expect(placeholderNode?.sourceKinds).toContain('unresolved_placeholder');
        expect(placeholderNode?.reasonCodes).toContain('unresolved_reference');
    });

    it('同 compareKey 的整合实体卡与批次实体卡只生成一个节点', () => {
        const graph = buildTakeoverMemoryGraph(buildProgressSnapshot({
            consolidation: {
                takeoverId: 'takeover-entity-merge',
                chapterDigestIndex: [],
                actorCards: [],
                relationships: [],
                entityCards: [{
                    entityType: 'location',
                    compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
                    title: '半山腰旧庙',
                    aliases: ['旧庙'],
                    summary: '整合结果里的旧庙',
                    confidence: 0.8,
                    canonicalName: '半山腰旧庙',
                    fields: {
                        region: '半山腰',
                    },
                }],
                entityTransitions: [],
                longTermFacts: [],
                relationState: [],
                taskState: [],
                worldState: {},
                activeSnapshot: null,
                dedupeStats: {
                    totalFacts: 0,
                    dedupedFacts: 0,
                    relationUpdates: 0,
                    taskUpdates: 0,
                    worldUpdates: 0,
                },
                conflictStats: {
                    unresolvedFacts: 0,
                    unresolvedRelations: 0,
                    unresolvedTasks: 0,
                    unresolvedWorldStates: 0,
                    unresolvedEntities: 0,
                },
                generatedAt: 1,
            },
            batchResults: [{
                takeoverId: 'takeover-entity-merge',
                batchId: 'batch-entity-merge',
                summary: '测试',
                actorCards: [],
                relationships: [],
                entityCards: [
                    {
                        entityType: 'location',
                        entityKey: 'entity:location:hillside_old_temple',
                        compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
                        title: '半山腰旧庙',
                        aliases: [],
                        summary: '批次结果里的旧庙',
                        confidence: 0.95,
                        canonicalName: '半山腰旧庙',
                        fields: {
                            status: '空置',
                        },
                    },
                ],
                entityTransitions: [],
                stableFacts: [],
                relationTransitions: [],
                taskTransitions: [],
                worldStateChanges: [],
                openThreads: [],
                chapterTags: [],
                sourceRange: { startFloor: 1, endFloor: 1 },
                generatedAt: 1,
            }],
        }));

        const duplicatedNodes = graph.nodes.filter((node) => node.type === 'location' && node.label === '半山腰旧庙');

        expect(duplicatedNodes).toHaveLength(1);
        expect(duplicatedNodes[0]?.id).toBe('entity:location:hillside_old_temple');
    });

    it('同名地点和世界状态仍保留两个节点，并给世界状态补语义后缀', () => {
        const graph = buildTakeoverMemoryGraph(buildProgressSnapshot({
            batchResults: [{
                takeoverId: 'takeover-world-state',
                batchId: 'batch-world-state',
                summary: '测试',
                actorCards: [],
                relationships: [],
                entityCards: [
                    {
                        entityType: 'location',
                        entityKey: 'entity:location:hillside_old_temple',
                        compareKey: 'ck:v2:location:半山腰旧庙:老岫村',
                        title: '半山腰旧庙',
                        aliases: [],
                        summary: '地点节点',
                        confidence: 0.9,
                        fields: {},
                    },
                ],
                entityTransitions: [],
                stableFacts: [],
                relationTransitions: [],
                taskTransitions: [],
                worldStateChanges: [
                    {
                        key: '半山腰旧庙',
                        value: '守庙人已亡，只剩遗痕与空屋',
                        entityKey: 'entity:world_state:old_temple_vacant',
                        compareKey: 'ck:v2:world_global_state:半山腰旧庙空置:老岫村',
                        summary: '状态节点',
                        canonicalName: '半山腰旧庙空置',
                        bindings: {
                            actors: [],
                            organizations: [],
                            cities: [],
                            locations: ['entity:location:hillside_old_temple'],
                            nations: [],
                            tasks: [],
                            events: [],
                        },
                        reasonCodes: [],
                    },
                ],
                openThreads: [],
                chapterTags: [],
                sourceRange: { startFloor: 1, endFloor: 1 },
                generatedAt: 1,
            }],
        }));

        const locationNode = graph.nodes.find((node) => node.id === 'entity:location:hillside_old_temple');
        const worldStateNode = graph.nodes.find((node) => node.id === 'entity:world_state:old_temple_vacant');

        expect(locationNode?.label).toBe('半山腰旧庙');
        expect(worldStateNode?.label).toBe('半山腰旧庙（状态）');
    });
});
