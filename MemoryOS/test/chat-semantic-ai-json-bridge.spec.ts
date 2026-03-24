import { describe, expect, it } from 'vitest';
import { applySemanticSeedAiJsonPayload, buildSemanticSeedAiJsonDocument, buildSemanticSeedAiJsonPromptBundle } from '../src/core/chat-semantic-ai-summary';
import type { ChatSemanticSeed } from '../src/types/chat-state';

/**
 * 功能：创建基础语义种子。
 * @returns 语义种子对象。
 */
function createSeed(): ChatSemanticSeed {
    return {
        collectedAt: Date.now(),
        characterCore: {},
        systemPrompt: '',
        firstMessage: '',
        authorNote: '',
        jailbreak: '',
        instruct: '',
        activeLorebooks: [],
        lorebookSeed: [],
        groupMembers: [],
        characterAnchors: [],
        presetStyle: 'story',
        identitySeed: {
            roleKey: 'erika',
            displayName: '艾莉卡·暮影',
            aliases: [],
            identity: [],
            catchphrases: [],
            relationshipAnchors: [],
            sourceTrace: [],
        },
        roleProfileSeeds: {
            erika: {
                actorKey: 'erika',
                displayName: '艾莉卡·暮影',
                aliases: ['暮影'],
                identityFacts: ['暮影巡礼者'],
                originFacts: ['来自雾港'],
                relationshipFacts: [],
                items: [
                    {
                        kind: 'item',
                        name: '旧地图',
                        detail: '标记了北境旧路。',
                        sourceRefs: [],
                    },
                ],
                equipments: [],
                updatedAt: 1735689600000,
            },
        },
        worldSeed: {
            locations: [],
            rules: [],
            hardConstraints: [],
            entities: [],
            sourceTrace: [],
        },
        styleSeed: {
            mode: 'story',
            cues: [],
            sourceTrace: [],
        },
        sourceTrace: [],
    };
}

describe('chat-semantic-ai-json-bridge', (): void => {
    it('能够生成当前语义种子的 AI JSON 文档', (): void => {
        const document = buildSemanticSeedAiJsonDocument(createSeed());
        expect((document.role as Record<string, unknown>).profiles).toBeTruthy();
        expect(((document.role as Record<string, unknown>).profiles as Record<string, unknown>).erika).toBeTruthy();
    });

    it('能够生成统一 prompt bundle', (): void => {
        const bundle = buildSemanticSeedAiJsonPromptBundle('init');
        expect(bundle.schema).toBeTruthy();
        expect(bundle.allowedUpdateKeys).toContain('role.profiles.items.upsert_item');
        expect(bundle.systemInstructions).toContain('集合主键：name');
        expect(bundle.usageGuide).toContain('字段更新项结构');
    });

    it('能够通过 update 模式把字段级更新回写到当前语义种子', (): void => {
        const merged = applySemanticSeedAiJsonPayload(createSeed(), {
            mode: 'update',
            namespaces: {},
            updates: [
                {
                    updateKey: 'role.profiles.items.upsert_item',
                    namespaceKey: 'role',
                    targetPrimaryKey: 'erika',
                    collectionFieldKey: 'items',
                    itemPrimaryKeyField: 'name',
                    itemPrimaryKeyValue: '旧地图',
                    op: 'upsert_item',
                    item: {
                        kind: 'item',
                        name: '旧地图',
                        detail: '新增了通往旧港仓库的暗道标记。',
                    },
                    reason: '补充角色物品细节',
                },
            ],
            meta: {
                note: '',
            },
        }, 'update');

        expect(merged).not.toBeNull();
        expect(merged?.roleProfileSeeds?.erika?.items[0]?.detail).toBe('新增了通往旧港仓库的暗道标记。');
    });
});
