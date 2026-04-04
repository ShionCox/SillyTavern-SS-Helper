import { describe, expect, it } from 'vitest';
import { PromptAssemblyService } from '../src/services/prompt-assembly-service';
import type { ActorMemoryProfile, MemoryEntry, PromptAssemblyRoleEntry, RoleEntryMemory } from '../src/types';

describe('PromptAssemblyService shadow render', () => {
    it('影子遗忘被唤起后会至少以 blur 进入角色视图', () => {
        const service = new PromptAssemblyService('chat-test', {} as never, undefined) as unknown as {
            buildRoleEntries: (
                roleMemories: RoleEntryMemory[],
                matchedActorKeys: string[],
                matchedEntryIdSet: Set<string>,
                entryMap: Map<string, MemoryEntry>,
                actorMap: Map<string, ActorMemoryProfile>,
                currentMaxFloor: number,
            ) => PromptAssemblyRoleEntry[];
        };

        const entry: MemoryEntry = {
            entryId: 'entry-shadow',
            chatKey: 'chat-test',
            title: '森林中的救援',
            entryType: 'event',
            category: '事件',
            tags: [],
            summary: '塞拉菲娜把{{user}}从森林深处救了出来。',
            detail: '塞拉菲娜把{{user}}从森林深处救了出来。',
            detailSchemaVersion: 1,
            detailPayload: {},
            sourceSummaryIds: [],
            updatedAt: Date.now(),
            createdAt: Date.now(),
        };
        const actor: ActorMemoryProfile = {
            actorKey: 'actor_seraphina',
            chatKey: 'chat-test',
            displayName: '塞拉菲娜',
            memoryStat: 60,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const roleEntries = service.buildRoleEntries(
            [{
                roleMemoryId: 'rm-1',
                chatKey: 'chat-test',
                actorKey: 'actor_seraphina',
                entryId: 'entry-shadow',
                memoryPercent: 0,
                forgotten: true,
                updatedAt: Date.now(),
            }],
            ['actor_seraphina'],
            new Set(['entry-shadow']),
            new Map([[entry.entryId, entry]]),
            new Map([[actor.actorKey, actor]]),
            0,
        );

        expect(roleEntries).toHaveLength(1);
        expect(roleEntries[0].forgettingTier).toBe('shadow_forgotten');
        expect(['blur', 'distorted']).toContain(roleEntries[0].retentionStage);
        expect(roleEntries[0].forgotten).toBe(true);
    });
});
