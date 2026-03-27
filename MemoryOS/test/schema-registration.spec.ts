import { describe, expect, it } from 'vitest';
import { CORE_MEMORY_ENTRY_TYPES } from '../src/types';

describe('core schema registration', () => {
    it('contains required architecture schema ids', () => {
        const keys = new Set(CORE_MEMORY_ENTRY_TYPES.map((item) => item.key));
        expect(keys.has('actor_profile')).toBe(true);
        expect(keys.has('world_core_setting')).toBe(true);
        expect(keys.has('world_hard_rule')).toBe(true);
        expect(keys.has('world_global_state')).toBe(true);
        expect(keys.has('scene_shared_state')).toBe(true);
        expect(keys.has('actor_visible_event')).toBe(true);
        expect(keys.has('actor_private_interpretation')).toBe(true);
    });

    it('does not expose deprecated world_rule schema id', () => {
        const keys = new Set(CORE_MEMORY_ENTRY_TYPES.map((item) => item.key));
        expect(keys.has('world_rule')).toBe(false);
    });
});
