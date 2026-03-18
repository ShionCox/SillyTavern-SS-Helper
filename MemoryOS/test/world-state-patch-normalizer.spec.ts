import { describe, expect, it } from 'vitest';
import { normalizeWorldStatePatchValue } from '../src/core/world-state-patch-normalizer';
import { buildWorldStateNodeValue } from '../src/core/state-manager';
import type { DBWorldState } from '../src/db/db';

describe('world-state-patch-normalizer', (): void => {
    it('会把 proposal 的原始世界状态补丁规范成结构化记录', (): void => {
        const normalized = normalizeWorldStatePatchValue(
            '/semantic/catalog/nations/morningstar',
            '晨星王国正在进入摄政议会统治期',
        ) as Record<string, unknown>;

        expect(normalized.scopeType).toBe('nation');
        expect(normalized.stateType).toBe('status');
        expect(normalized.nationId).toBe('morningstar');
        expect(normalized.summary).toContain('晨星王国');
        expect(normalized.tags).toEqual(expect.arrayContaining(['nation', 'status', 'proposal_patch']));
    });

    it('会根据路径和文本识别角色目标与关系', (): void => {
        const goal = normalizeWorldStatePatchValue(
            '/semantic/characters/alice/goals/crown',
            { summary: 'Alice 必须在拂晓前找到失落王冠' },
        ) as Record<string, unknown>;
        const relationship = normalizeWorldStatePatchValue(
            '/semantic/characters/alice/relationships/bob',
            { summary: 'Alice 信任 Bob，但不愿让他知道王冠线索' },
        ) as Record<string, unknown>;

        expect(goal.scopeType).toBe('character');
        expect(goal.stateType).toBe('goal');
        expect(goal.subjectId).toBe('alice');
        expect(relationship.scopeType).toBe('character');
        expect(relationship.stateType).toBe('relationship');
        expect(relationship.subjectId).toBe('alice');
    });

    it('规范化后的 proposal 状态再次经过 state-manager 读取时不会漂移分类', (): void => {
        const normalized = normalizeWorldStatePatchValue(
            '/semantic/catalog/factions/white-tower-council',
            { summary: '白塔议会正在争夺晨星王国摄政权' },
        );

        const node = buildWorldStateNodeValue({
            stateKey: 'test::/semantic/catalog/factions/white-tower-council',
            chatKey: 'test',
            path: '/semantic/catalog/factions/white-tower-council',
            value: normalized,
            updatedAt: Date.now(),
        } as DBWorldState);

        expect(node.scopeType).toBe('faction');
        expect(node.stateType).toBe('status');
        expect(node.tags).toEqual(expect.arrayContaining(['proposal_patch']));
        expect(node.summary).toContain('白塔议会');
    });
});