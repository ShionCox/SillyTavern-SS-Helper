import { describe, expect, it } from 'vitest';

import { buildRelationshipCompareKey, buildRelationshipRecordId } from '../src/core/compare-key';

describe('relationship record id', (): void => {
    it('按 chatKey + source + target + relationTag 稳定生成 relationshipId', (): void => {
        const compareKey = buildRelationshipCompareKey('actor_alice', 'user', '朋友');
        const left = buildRelationshipRecordId('chat-1', 'actor_alice', 'user', '朋友');
        const right = buildRelationshipRecordId('chat-1', ' actor_alice ', 'USER', ' 朋友 ');

        expect(left).toBe(`relationship:chat-1:${compareKey}`);
        expect(right).toBe(left);
    });
});
