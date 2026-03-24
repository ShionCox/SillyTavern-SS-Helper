import { describe, expect, it } from 'vitest';
import type { EditorExperienceSnapshot, OwnedMemoryState, SnapshotValue } from '../../SDK/stx';
import type { StructuredWorldStateEntry } from '../src/types';
import { buildWorldQuestBoardRowsForTest } from '../src/ui/recordEditorNext';

/**
 * 功能：构造最小可用的快照值。
 * @param value 快照文本值。
 * @param updatedAt 更新时间戳。
 * @returns 快照值对象。
 */
function createSnapshotValue(value: string, updatedAt: number = 1000): SnapshotValue {
    return {
        value,
        confidence: 0.9,
        sourceKinds: ['group_memory'],
        updatedAt,
        sourceRefs: [{
            kind: 'group_memory',
            label: 'snapshot',
            ts: updatedAt,
        }],
    };
}

/**
 * 功能：构造最小可用的编辑器体验快照。
 * @param overrides 局部覆盖。
 * @returns 体验快照对象。
 */
function createExperienceSnapshot(overrides: {
    currentConflict?: string;
    currentScene?: string;
    pendingEvents?: string[];
    participants?: string[];
} = {}): EditorExperienceSnapshot {
    return {
        canon: {
            generatedAt: 1700000000000,
            scene: {
                currentScene: createSnapshotValue(overrides.currentScene ?? '旧城门前'),
                currentConflict: createSnapshotValue(overrides.currentConflict ?? '追回旧地图'),
                pendingEvents: (overrides.pendingEvents ?? ['等待队伍会合']).map((value: string, index: number): SnapshotValue => {
                    return createSnapshotValue(value, 1700000000000 + index);
                }),
                participants: (overrides.participants ?? ['艾莉卡']).map((value: string): SnapshotValue => createSnapshotValue(value)),
            },
        },
    } as unknown as EditorExperienceSnapshot;
}

/**
 * 功能：构造最小可用的 owned memory 状态。
 * @param overrides 局部覆盖。
 * @returns owned memory 状态对象。
 */
function createOwnedState(overrides: Partial<OwnedMemoryState> = {}): OwnedMemoryState {
    return {
        recordKey: 'fact:quest-default',
        ownerActorKey: 'erika',
        recordKind: 'fact',
        memoryType: 'event',
        memorySubtype: 'goal',
        sourceScope: 'group',
        importance: 0.8,
        forgetProbability: 0.1,
        forgotten: false,
        forgottenReasonCodes: [],
        reinforcedByEventIds: [],
        invalidatedByEventIds: [],
        updatedAt: 1700000001000,
        ...overrides,
    } as OwnedMemoryState;
}

/**
 * 功能：构造最小可用的 world_state 条目。
 * @param overrides 局部覆盖。
 * @returns world_state 条目。
 */
function createWorldEntry(overrides: Partial<StructuredWorldStateEntry> = {}): StructuredWorldStateEntry {
    return {
        stateKey: 'ws-quest-1',
        path: '/semantic/world/quests/main',
        rawValue: {
            objective: '追回旧地图',
        },
        node: {
            title: '追回旧地图',
            summary: '必须在天亮前找回地图',
            scopeType: 'character',
            stateType: 'goal',
            subjectId: 'erika',
            keywords: [],
            tags: [],
            updatedAt: 1700000002000,
        },
        updatedAt: 1700000002000,
        ...overrides,
    } as StructuredWorldStateEntry;
}

describe('quest board refactor', () => {
    it('过滤 pendingEvents 中的可见消息占位值', () => {
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot({
                pendingEvents: ['可见消息 3 条', '等待队伍会合'],
            }),
            [],
            [],
            new Map([['erika', '艾莉卡']]),
        );
        expect(rows.some((row) => row.title.includes('可见消息'))).toBe(false);
        expect(rows.some((row) => row.title.includes('等待队伍会合'))).toBe(true);
    });

    it('ownedStates 的 goal/promise/current_conflict 进入任务板且来源为 memory_state', () => {
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot(),
            [
                createOwnedState({ recordKey: 'fact:goal-1', memorySubtype: 'goal' }),
                createOwnedState({ recordKey: 'fact:promise-1', memorySubtype: 'promise' }),
                createOwnedState({ recordKey: 'fact:conflict-1', memorySubtype: 'current_conflict' }),
            ],
            [],
            new Map([['erika', '艾莉卡']]),
        );
        const memoryRows = rows.filter((row) => row.sourceKinds?.includes('memory_state'));
        expect(memoryRows.length).toBeGreaterThanOrEqual(3);
        expect(memoryRows.every((row) => (row.sourceRefs?.length ?? 0) > 0)).toBe(true);
    });

    it('world_state 的 goal 条目会进入任务板并保留 statePath', () => {
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot(),
            [],
            [createWorldEntry()],
            new Map([['erika', '艾莉卡']]),
        );
        const worldGoal = rows.find((row) => row.stateKey === 'ws-quest-1');
        expect(worldGoal).toBeTruthy();
        expect(worldGoal?.sourceKinds).toContain('world_state');
        expect(worldGoal?.statePath).toBe('/semantic/world/quests/main');
    });

    it('should skip empty hardConstraints world-state rows', () => {
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot(),
            [],
            [createWorldEntry({
                stateKey: 'ws-hard-1',
                path: '/semantic/world/overview/hardConstraints',
                rawValue: {},
                node: {
                    ...createWorldEntry().node,
                    title: 'hardConstraints',
                    summary: '',
                    stateType: 'constraint',
                    subjectId: '',
                },
            })],
            new Map([['erika', '艾莉卡']]),
        );
        expect(rows.some((row) => row.title === 'hardConstraints')).toBe(false);
    });

    it('同名任务来自记忆与世界状态时会合并为单行并叠加来源', () => {
        const memoryOnlyRows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot(),
            [createOwnedState({ recordKey: 'fact:goal-merge', memorySubtype: 'goal' })],
            [],
            new Map([['erika', '艾莉卡']]),
        );
        const memoryTitle = memoryOnlyRows.find((row) => row.sourceKinds?.includes('memory_state'))?.title ?? '追回旧地图';
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot(),
            [createOwnedState({ recordKey: 'fact:goal-merge', memorySubtype: 'goal' })],
            [createWorldEntry({ node: { ...createWorldEntry().node, title: memoryTitle } })],
            new Map([['erika', '艾莉卡']]),
        );
        const mergedRows = rows.filter((row) => row.title === memoryTitle);
        expect(mergedRows.length).toBe(1);
        expect(mergedRows[0].sourceKinds).toEqual(expect.arrayContaining(['memory_state', 'world_state']));
    });

    it('ownerActorKey / subjectId 会映射到相关角色显示', () => {
        const rows = buildWorldQuestBoardRowsForTest(
            createExperienceSnapshot({ participants: ['艾莉卡'] }),
            [createOwnedState({ ownerActorKey: 'erika', recordKey: 'fact:goal-owner' })],
            [createWorldEntry({ node: { ...createWorldEntry().node, subjectId: 'erika' } })],
            new Map([['erika', '艾莉卡']]),
        );
        const roleRelatedRows = rows.filter((row) => row.relatedActors.includes('艾莉卡'));
        expect(roleRelatedRows.length).toBeGreaterThan(0);
    });
});
