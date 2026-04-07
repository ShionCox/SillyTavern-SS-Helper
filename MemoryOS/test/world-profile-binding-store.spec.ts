import { beforeEach, describe, expect, it, vi } from 'vitest';

const bindingRows = new Map<string, Record<string, unknown>>();

vi.mock('../src/db/db', () => {
    return {
        db: {
            world_profile_bindings: {
                get: vi.fn(async (chatKey: string) => bindingRows.get(chatKey)),
                put: vi.fn(async (row: Record<string, unknown>) => {
                    bindingRows.set(String(row.chatKey), row);
                }),
                delete: vi.fn(async (chatKey: string) => {
                    bindingRows.delete(chatKey);
                }),
            },
        },
    };
});

import {
    buildWorldProfileSourceHash,
    deleteWorldProfileBinding,
    getWorldProfileBinding,
    putWorldProfileBinding,
} from '../src/memory-world-profile/binding-store';

describe('world profile binding store', () => {
    beforeEach(() => {
        bindingRows.clear();
    });

    it('supports put/get/delete lifecycle', async () => {
        const saved = await putWorldProfileBinding({
            chatKey: 'chat-1',
            primaryProfile: 'fantasy_magic',
            secondaryProfiles: ['ancient_traditional', 'ancient_traditional'],
            confidence: 1.2,
            reasonCodes: ['kw:magic', 'kw:magic'],
            detectedFrom: ['a', 'a', 'b'],
        });
        expect(saved.chatKey).toBe('chat-1');
        expect(saved.secondaryProfiles).toEqual(['ancient_traditional']);
        expect(saved.confidence).toBe(1);
        expect(saved.reasonCodes).toEqual(['kw:magic']);
        expect(saved.detectedFrom).toEqual(['a', 'b']);
        expect(saved.sourceHash).toMatch(/^wp:/);

        const loaded = await getWorldProfileBinding('chat-1');
        expect(loaded?.primaryProfile).toBe('fantasy_magic');

        await deleteWorldProfileBinding('chat-1');
        const removed = await getWorldProfileBinding('chat-1');
        expect(removed).toBeNull();
    });

    it('builds deterministic source hash', () => {
        const left = buildWorldProfileSourceHash({
            chatKey: 'chat-1',
            primaryProfile: 'urban_modern',
            secondaryProfiles: ['a', 'b'],
            detectedFrom: ['x', 'y'],
        });
        const right = buildWorldProfileSourceHash({
            chatKey: 'chat-1',
            primaryProfile: 'urban_modern',
            secondaryProfiles: ['a', 'b'],
            detectedFrom: ['x', 'y'],
        });
        expect(left).toBe(right);
    });
});
