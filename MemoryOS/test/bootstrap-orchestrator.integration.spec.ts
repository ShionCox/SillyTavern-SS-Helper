import { describe, expect, it, vi } from 'vitest';
import { applyBootstrapCandidates, runBootstrapOrchestrator } from '../src/memory-bootstrap';
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
            userName: '林远',
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
    it('会在冷启动落库前把自然语言中的用户称呼替换成当前用户名', async () => {
        const savedEntries: Array<{ entryType: string; title: string; summary?: string }> = [];
        const savedPayloads: Array<Record<string, unknown>> = [];
        const historyActions: string[] = [];
        const dependencies = {
            ensureActorProfile: vi.fn(async () => ({})),
            saveEntry: vi.fn(async (input) => {
                savedEntries.push({ entryType: input.entryType, title: input.title, summary: input.summary });
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
        };
        const result = await runBootstrapOrchestrator({
            dependencies,
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
                        actorCards: [],
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
                                targetActorKey: 'user',
                                participants: ['char_erin', 'user'],
                                relationTag: '陌生人',
                                state: '对用户保持观察',
                                summary: '艾琳把主角视为需要持续观察的对象',
                                trust: 0.2,
                                affection: 0.1,
                                tension: 0.3,
                            },
                        ],
                        memoryRecords: [
                            {
                                schemaId: 'actor_visible_event',
                                title: 'First Contact',
                                summary: '艾琳首次在市场看见主角',
                                importance: 0.5,
                            },
                        ],
                    },
                })),
            },
            pluginId: 'MemoryOS',
            sourceBundle: buildBundle(),
        });

        if (result.ok && result.document && result.candidates) {
            await applyBootstrapCandidates({
                dependencies,
                document: result.document,
                sourceBundle: buildBundle(),
                selectedCandidates: result.candidates,
            });
        }

        expect(result.ok).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'actor_profile')).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'world_hard_rule')).toBe(true);
        expect(savedEntries.some((item) => item.entryType === 'relationship')).toBe(true);
        const relationshipPayload = savedPayloads.find((item) => item.sourceActorKey === 'char_erin');
        expect(relationshipPayload?.targetActorKey).toBe('user');
        expect(relationshipPayload?.participants).toEqual(['char_erin', 'user']);
        expect(relationshipPayload?.state).toBe('对林远保持观察');
        expect((relationshipPayload?.fields as Record<string, unknown> | undefined)?.relationTag).toBe('陌生人');
        const relationshipEntry = dependencies.saveEntry.mock.calls.find((call) => call[0].entryType === 'relationship')?.[0];
        expect(relationshipEntry?.summary).toContain('林远');
        expect(relationshipEntry?.summary).not.toContain('主角');
        expect(relationshipEntry?.summary).not.toContain('用户');
        const memoryEntry = dependencies.saveEntry.mock.calls.find((call) => call[0].entryType === 'actor_visible_event')?.[0];
        expect(memoryEntry?.summary).toContain('林远');
        expect(memoryEntry?.summary).not.toContain('主角');
        expect(historyActions).toContain('cold_start_started');
        expect(historyActions).toContain('world_profile_bound');
        expect(historyActions).toContain('cold_start_succeeded');
    });

    it('当关系引用到缺失角色卡时会报错，但 user 锚点不需要角色卡', async () => {
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

    it('第二阶段失败后会复用已完成的第一阶段结果继续执行', async () => {
        const llmRunTask = vi
            .fn()
            .mockResolvedValueOnce({
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
                    relationships: [],
                    memoryRecords: [],
                },
            })
            .mockResolvedValueOnce({
                ok: false,
                reasonCode: 'cold_start_failed',
            })
            .mockResolvedValueOnce({
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
                            targetActorKey: 'user',
                            participants: ['char_erin', 'user'],
                            relationTag: '陌生人',
                            state: '对用户保持观察',
                            summary: '艾琳持续观察主角。',
                            trust: 0.2,
                            affection: 0.1,
                            tension: 0.3,
                        },
                    ],
                    memoryRecords: [],
                },
            });
        const dependencies = {
            ensureActorProfile: vi.fn(async () => ({})),
            applyLedgerMutationBatch: vi.fn(async () => ({
                saved: [],
                invalidated: [],
                deleted: [],
                skipped: [],
            })),
            putWorldProfileBinding: vi.fn(async () => ({})),
            appendMutationHistory: vi.fn(async () => undefined),
        };

        const firstResult = await runBootstrapOrchestrator({
            dependencies,
            llm: {
                registerConsumer: () => {},
                unregisterConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            sourceBundle: buildBundle(),
            runId: 'bootstrap:test:resume',
        });
        const secondResult = await runBootstrapOrchestrator({
            dependencies,
            llm: {
                registerConsumer: () => {},
                unregisterConsumer: () => {},
                runTask: llmRunTask,
            },
            pluginId: 'MemoryOS',
            sourceBundle: buildBundle(),
            runId: 'bootstrap:test:resume',
        });

        expect(firstResult.ok).toBe(false);
        expect(secondResult.ok).toBe(true);
        expect(llmRunTask).toHaveBeenCalledTimes(3);
    });
});
