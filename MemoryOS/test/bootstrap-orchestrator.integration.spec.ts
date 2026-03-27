import { describe, expect, it, vi } from 'vitest';
import { runBootstrapOrchestrator } from '../src/memory-bootstrap';
import type { ColdStartSourceBundle } from '../src/memory-bootstrap';

function buildBundle(): ColdStartSourceBundle {
    return {
        reason: 'integration',
        characterCard: {
            name: 'Erin',
            description: 'Royal intelligence agent',
            personality: 'Calm',
            scenario: 'War city',
            firstMessage: 'hello',
            messageExample: 'stay alert',
            creatorNotes: 'n/a',
            tags: ['royal'],
        },
        semantic: {
            systemPrompt: 'magic kingdom under curfew',
            firstMessage: 'hello',
            authorNote: '',
            jailbreak: '',
            instruct: '',
            activeLorebooks: ['kingdom_lore'],
        },
        user: {
            userName: 'user',
            counterpartName: 'erin',
            personaDescription: 'traveler',
            metadataPersona: '',
        },
        worldbooks: {
            mainBook: 'kingdom_lore',
            extraBooks: [],
            activeBooks: ['kingdom_lore'],
            entries: [
                {
                    book: 'kingdom_lore',
                    entryId: '1',
                    entry: 'Curfew',
                    keywords: ['curfew'],
                    content: 'No one can leave at night.',
                },
            ],
        },
        recentEvents: ['User asked about curfew'],
    };
}

describe('runBootstrapOrchestrator integration', () => {
    it('writes actor/world/relationship/memory and world profile binding', async () => {
        const savedEntries: Array<{ entryType: string; title: string }> = [];
        const historyActions: string[] = [];
        const result = await runBootstrapOrchestrator({
            dependencies: {
                ensureActorProfile: vi.fn(async () => ({})),
                saveEntry: vi.fn(async (input) => {
                    savedEntries.push({ entryType: input.entryType, title: input.title });
                    return {
                        ...input,
                        entryId: `entry_${savedEntries.length}`,
                        chatKey: 'chat',
                        category: input.category || 'other',
                        tags: input.tags || [],
                        summary: input.summary || '',
                        detail: input.detail || '',
                        detailSchemaVersion: 1,
                        detailPayload: input.detailPayload || {},
                        sourceSummaryIds: [],
                        createdAt: 1,
                        updatedAt: 1,
                    };
                }),
                bindRoleToEntry: vi.fn(async () => ({})),
                putWorldProfileBinding: vi.fn(async () => ({})),
                appendMutationHistory: vi.fn(async (input) => {
                    historyActions.push(String(input.action));
                }),
            },
            llm: {
                registerConsumer: () => {},
                unregisterConsumer: () => {},
                runTask: vi.fn(async () => ({
                    ok: true,
                    data: {
                        schemaVersion: '1.0.0',
                        identity: {
                            actorKey: 'char_erin',
                            displayName: 'Erin',
                            aliases: ['E'],
                            identityFacts: ['Agent'],
                            originFacts: ['North'],
                            traits: ['Calm'],
                        },
                        worldProfileDetection: {
                            primaryProfile: 'fantasy_magic',
                            secondaryProfiles: ['ancient_traditional'],
                            confidence: 0.8,
                            reasonCodes: ['kw:magic'],
                        },
                        worldBase: [
                            {
                                schemaId: 'world_hard_rule',
                                title: 'Curfew',
                                summary: 'No one can leave at night',
                                scope: 'global',
                            },
                        ],
                        relationships: [
                            {
                                sourceActorKey: 'char_erin',
                                targetActorKey: 'char_mc',
                                summary: 'watching',
                                trust: 0.2,
                            },
                        ],
                        memoryRecords: [
                            {
                                schemaId: 'actor_visible_event',
                                title: 'First Contact',
                                summary: 'Saw the player in market',
                                importance: 0.5,
                            },
                        ],
                    },
                })),
            },
            pluginId: 'MemoryOS',
            sourceBundle: buildBundle(),
        });

        expect(result.ok).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'actor_profile')).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'world_hard_rule')).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'relationship')).toBe(true);
        expect(historyActions).toContain('cold_start_started');
        expect(historyActions).toContain('world_profile_bound');
        expect(historyActions).toContain('cold_start_succeeded');
    });
});
