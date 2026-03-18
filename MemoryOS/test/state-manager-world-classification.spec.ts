import { describe, expect, it } from 'vitest';
import type { DBWorldState } from '../src/db/db';
import { buildWorldStateNodeValue } from '../src/core/state-manager';

describe('state-manager world classification', (): void => {
    it('会识别国家政体与角色目标关系分类', async (): Promise<void> => {
        const nationRecord: DBWorldState = {
            stateKey: 'test::nation/aurora/regime',
            chatKey: 'test',
            path: 'nation/aurora/regime',
            value: {
                title: '曙光王国',
                summary: '由女王统治的海权王国。',
                nationId: 'aurora',
                government: '君主制',
            },
            updatedAt: Date.now(),
        };
        const goalRecord: DBWorldState = {
            stateKey: 'test::character/alice/goal',
            chatKey: 'test',
            path: 'character/alice/goal',
            value: {
                title: 'Alice 的目标',
                summary: '想找到遗失的王冠。',
                subjectId: 'alice',
                goal: '找到遗失的王冠',
            },
            updatedAt: Date.now(),
        };
        const relationshipRecord: DBWorldState = {
            stateKey: 'test::character/alice/relationship',
            chatKey: 'test',
            path: 'character/alice/relationship',
            value: {
                title: 'Alice 与 Bob',
                summary: '互相信任但保持戒心。',
                subjectId: 'alice',
                target: 'bob',
                relation: '信任',
            },
            updatedAt: Date.now(),
        };

        const nation = buildWorldStateNodeValue(nationRecord);
        const goal = buildWorldStateNodeValue(goalRecord);
        const relationship = buildWorldStateNodeValue(relationshipRecord);

        expect(nation.scopeType).toBe('nation');
        expect(nation.nationId).toBe('aurora');
        expect(goal.stateType).toBe('goal');
        expect(relationship.stateType).toBe('relationship');
    });

    it('会把无法识别且缺锚点的条目标成待归类异常', (): void => {
        const anomalyRecord: DBWorldState = {
            stateKey: 'test::mystery/undefined',
            chatKey: 'test',
            path: 'mystery/undefined',
            value: {
                title: '',
                summary: '',
            },
            updatedAt: Date.now(),
        };

        const anomaly = buildWorldStateNodeValue(anomalyRecord);

        expect(anomaly.scopeType).toBe('unclassified');
        expect(anomaly.stateType).toBe('anomaly');
        expect(anomaly.anomalyFlags).toContain('missing_title');
        expect(anomaly.anomalyFlags).toContain('missing_summary');
    });
});