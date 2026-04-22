import { describe, expect, it } from 'vitest';
import { GraphService } from '../src/services/graph-service';
import type { WorkbenchMemoryGraphNode } from '../src/ui/workbenchTabs/shared/memoryGraphTypes';
import type { ActorMemoryProfile, MemoryEntry, MemoryRelationshipRecord, RoleEntryMemory, SummarySnapshot } from '../src/types';

/**
 * 功能：构建测试角色资料。
 * @param actorKey 角色键。
 * @param displayName 显示名。
 * @returns 角色资料。
 */
function buildActor(actorKey: string, displayName: string): ActorMemoryProfile {
    return {
        actorKey,
        chatKey: 'chat-1',
        displayName,
        memoryStat: 70,
        createdAt: 1,
        updatedAt: 1,
    };
}

/**
 * 功能：构建测试记忆条目。
 * @returns 记忆条目。
 */
function buildEntry(): MemoryEntry {
    return {
        entryId: 'entry-task-1',
        chatKey: 'chat-1',
        title: '调查旧港仓库',
        entryType: 'task',
        category: '任务',
        tags: ['任务'],
        summary: '你和艾琳正在调查旧港仓库。',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            compareKey: 'ck:v2:task:调查旧港仓库',
            bindings: {
                actors: ['user', 'char_erin'],
            },
            fields: {
                status: '进行中',
            },
        },
        sourceSummaryIds: ['summary-1'],
        createdAt: 1,
        updatedAt: 2,
    };
}

/**
 * 功能：构建指定类型的测试记忆条目。
 * @param entryId 条目 ID。
 * @param entryType 条目类型。
 * @param title 标题。
 * @param detailPayload 结构化载荷。
 * @returns 记忆条目。
 */
function buildTypedEntry(
    entryId: string,
    entryType: string,
    title: string,
    detailPayload: Record<string, unknown> = {},
): MemoryEntry {
    return {
        entryId,
        chatKey: 'chat-1',
        title,
        entryType,
        category: '其他',
        tags: [entryType],
        summary: `${title}的摘要。`,
        detail: '',
        detailSchemaVersion: 1,
        detailPayload,
        sourceSummaryIds: ['summary-1'],
        createdAt: 1,
        updatedAt: 2,
    };
}

/**
 * 功能：构建旧关系条目。
 * @returns 旧关系条目。
 */
function buildLegacyRelationshipEntry(): MemoryEntry {
    return buildTypedEntry('entry-legacy-relationship', 'relationship', '伙伴', {
        compareKey: 'ck:v2:relationship:user~char_erin:伙伴',
        sourceActorKey: 'user',
        targetActorKey: 'char_erin',
        fields: {
            relationTag: '伙伴',
            state: '一起行动',
        },
    });
}

/**
 * 功能：构建测试关系记录。
 * @returns 关系记录。
 */
function buildRelationship(): MemoryRelationshipRecord {
    return {
        relationshipId: 'relationship:chat-1:user:char_erin:陌生人',
        chatKey: 'chat-1',
        sourceActorKey: 'user',
        targetActorKey: 'char_erin',
        relationTag: '陌生人',
        state: '保持观察',
        summary: '艾琳仍在观察你。',
        trust: 20,
        affection: 10,
        tension: 45,
        participants: ['user', 'char_erin'],
        ongoing: true,
        createdAt: 1,
        updatedAt: 2,
    };
}

/**
 * 功能：构建测试角色记忆。
 * @returns 角色记忆。
 */
function buildRoleMemory(): RoleEntryMemory {
    return {
        roleMemoryId: 'role-memory-1',
        chatKey: 'chat-1',
        actorKey: 'char_erin',
        entryId: 'entry-task-1',
        memoryPercent: 88,
        forgotten: false,
        updatedAt: 2,
    };
}

/**
 * 功能：构建测试总结快照。
 * @returns 总结快照。
 */
function buildSummary(): SummarySnapshot {
    return {
        summaryId: 'summary-1',
        chatKey: 'chat-1',
        title: '结构化总结',
        content: '艾琳和你推进了旧港仓库调查。',
        actorKeys: ['user', 'char_erin'],
        entryUpserts: [{
            entryId: 'entry-task-1',
            title: '调查旧港仓库',
            entryType: 'task',
            summary: '你和艾琳正在调查旧港仓库。',
        }],
        refreshBindings: [],
        createdAt: 1,
        updatedAt: 2,
    };
}

describe('GraphService.buildMemoryGraphFromMemory', () => {
    it('没有 takeover progress 时也会从主记忆表生成节点和关系边', () => {
        const graph = new GraphService().buildMemoryGraphFromMemory({
            entries: [buildEntry()],
            relationships: [buildRelationship()],
            actors: [buildActor('user', '你'), buildActor('char_erin', '艾琳')],
            roleMemories: [buildRoleMemory()],
            summaries: [buildSummary()],
        });

        expect(graph.nodes.some((node) => node.id === 'entry:entry-task-1')).toBe(true);
        expect(graph.nodes.some((node) => node.id === 'actor:user')).toBe(true);
        expect(graph.nodes.some((node) => node.id === 'actor:char_erin')).toBe(true);
        expect(graph.edges.some((edge) => edge.relationType === 'relationship')).toBe(true);
        expect(graph.edges.some((edge) => edge.relationType === 'entry_binding_actor')).toBe(true);
    });

    it('按旧聊天语义分类主记忆条目，避免细分类型显示为其他', () => {
        const graph = new GraphService().buildMemoryGraphFromMemory({
            entries: [
                buildTypedEntry('entry-visible-event', 'actor_visible_event', '目击密谈'),
                buildTypedEntry('entry-world-rule', 'world_hard_rule', '城邦禁令'),
                buildTypedEntry('entry-scene-state', 'scene_shared_state', '旧港雨夜'),
                buildTypedEntry('entry-org', 'other', '银鸦商会', {
                    compareKey: 'ck:v2:organization:银鸦商会',
                }),
                buildTypedEntry('entry-city', 'other', '灰港城', {
                    fields: { entityType: 'city' },
                }),
                buildTypedEntry('entry-nation', '国家', '北境王国'),
                buildTypedEntry('entry-location', 'location', '旧港仓库'),
                buildTypedEntry('entry-item', 'artifact', '旧钥匙'),
            ],
            relationships: [],
            actors: [],
            roleMemories: [],
            summaries: [],
        });
        const typeById = new Map(graph.nodes.map((node) => [node.id, node.type]));

        expect(typeById.get('entry:entry-visible-event')).toBe('event');
        expect(typeById.get('entry:entry-world-rule')).toBe('world_state');
        expect(typeById.get('entry:entry-scene-state')).toBe('world_state');
        expect(typeById.get('entry:entry-org')).toBe('organization');
        expect(typeById.get('entry:entry-city')).toBe('city');
        expect(typeById.get('entry:entry-nation')).toBe('nation');
        expect(typeById.get('entry:entry-location')).toBe('location');
        expect(typeById.get('entry:entry-item')).toBe('item');
        expect([...typeById.values()]).not.toContain('other');
    });

    it('旧关系条目会转为关系边，不再生成其他节点', () => {
        const graph = new GraphService().buildMemoryGraphFromMemory({
            entries: [buildLegacyRelationshipEntry()],
            relationships: [],
            actors: [buildActor('user', '你'), buildActor('char_erin', '艾琳')],
            roleMemories: [],
            summaries: [],
        });

        expect(graph.nodes.some((node) => node.id === 'entry:entry-legacy-relationship')).toBe(false);
        expect(graph.nodes.some((node) => node.type === 'other')).toBe(false);
        expect(graph.edges.some((edge) => edge.id === 'legacy_relationship:entry-legacy-relationship')).toBe(true);
        expect(graph.edges.some((edge) => edge.relationType === 'relationship' && edge.label === '伙伴')).toBe(true);
    });

    it('梦境总结候选默认不出现在语义图谱，只在调试模式展示', () => {
        const graph = new GraphService().buildMemoryGraphFromMemory({
            entries: [
                buildEntry(),
                buildTypedEntry('entry-dream-candidate', 'dream_summary_candidate', '梦境洞察候选', {
                    dreamSummaryCandidate: true,
                }),
            ],
            relationships: [],
            actors: [],
            roleMemories: [],
            summaries: [],
        });

        const semanticNodes = graph.nodes.filter((node: WorkbenchMemoryGraphNode): boolean => !node.visibleInModes || node.visibleInModes.includes('semantic'));
        const debugNodes = graph.nodes.filter((node: WorkbenchMemoryGraphNode): boolean => !node.visibleInModes || node.visibleInModes.includes('debug'));

        expect(semanticNodes.some((node: WorkbenchMemoryGraphNode): boolean => node.id === 'entry:entry-dream-candidate')).toBe(false);
        expect(debugNodes.some((node: WorkbenchMemoryGraphNode): boolean => node.id === 'entry:entry-dream-candidate')).toBe(true);
    });
});
