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
        const savedPayloads: Array<Record<string, unknown>> = [];
        const historyActions: string[] = [];
        const result = await runBootstrapOrchestrator({
            dependencies: {
                ensureActorProfile: vi.fn(async () => ({})),
                saveEntry: vi.fn(async (input) => {
                    savedEntries.push({ entryType: input.entryType, title: input.title });
                    savedPayloads.push(input.detailPayload || {});
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
                        actorCards: [
                            {
                                actorKey: 'char_mc',
                                displayName: '旅人',
                                aliases: [],
                                identityFacts: ['外来者'],
                                originFacts: ['刚进入王都'],
                                traits: ['谨慎'],
                            },
                        ],
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
                                participants: ['char_erin', 'char_mc'],
                                relationTag: '陌生人',
                                state: '保持观察',
                                summary: 'watching',
                                trust: 0.2,
                                affection: 0.1,
                                tension: 0.3,
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
        const relationshipPayload = savedPayloads.find((item) => item.sourceActorKey === 'char_erin');
        expect((relationshipPayload?.fields as Record<string, unknown> | undefined)?.relationTag).toBe('陌生人');
        expect(historyActions).toContain('cold_start_started');
        expect(historyActions).toContain('world_profile_bound');
        expect(historyActions).toContain('cold_start_succeeded');
    });

    it('fails when relationship actors do not provide actor cards', async () => {
        const result = await runBootstrapOrchestrator({
            dependencies: {
                ensureActorProfile: vi.fn(async () => ({})),
                saveEntry: vi.fn(async (input) => ({
                    ...input,
                    entryId: 'entry_1',
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
                })),
                bindRoleToEntry: vi.fn(async () => ({})),
                putWorldProfileBinding: vi.fn(async () => ({})),
                appendMutationHistory: vi.fn(async () => ({})),
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
                            aliases: [],
                            identityFacts: ['Agent'],
                            originFacts: ['North'],
                            traits: ['Calm'],
                        },
                        actorCards: [],
                        worldBase: [],
                        relationships: [
                            {
                                sourceActorKey: 'char_erin',
                                targetActorKey: 'char_mc',
                                participants: ['char_erin', 'char_mc'],
                                relationTag: '陌生人',
                                state: '保持观察',
                                summary: 'watching',
                                trust: 0.2,
                                affection: 0.1,
                                tension: 0.3,
                            },
                        ],
                        memoryRecords: [],
                    },
                })),
            },
            pluginId: 'MemoryOS',
            sourceBundle: buildBundle(),
        });

        expect(result.ok).toBe(false);
        expect(result.reasonCode).toBe('relationship_actor_card_missing');
    });
});
