import { describe, expect, it } from 'vitest';
import { buildAiJsonPromptBundle } from '../src/core/ai-json-builder';
import {
    applyAiJsonOutput,
    getAiNamespace,
    initAiJsonSystem,
    registerAiNamespace,
    validateAiJsonOutput,
} from '../src/core/ai-json-system';
import type { AiJsonNamespaceDefinition } from '../src/core/ai-json-types';

/**
 * 功能：递归断言所有对象节点都显式关闭 additionalProperties。
 * @param schema 待检查的 schema。
 * @returns 无返回值。
 */
function expectStrictObjectShape(schema: unknown): void {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return;
    }
    const record = schema as Record<string, unknown>;
    if (record.type === 'object' || record.properties) {
        expect(record.additionalProperties).toBe(false);
        const properties = record.properties as Record<string, unknown> | undefined;
        if (properties) {
            const keys = Object.keys(properties);
            const required = Array.isArray(record.required) ? [...record.required].sort() : [];
            expect(required).toEqual([...keys].sort());
            Object.values(properties).forEach((value: unknown): void => {
                expectStrictObjectShape(value);
            });
        }
    }
    if (record.items) {
        expectStrictObjectShape(record.items);
    }
    if (Array.isArray(record.anyOf)) {
        record.anyOf.forEach((item: unknown): void => {
            expectStrictObjectShape(item);
        });
    }
}

/**
 * 功能：递归断言所有结构化节点都显式声明类型或 anyOf。
 * @param schema 待检查的 schema。
 * @returns 无返回值。
 */
function expectSchemaNodeHasExplicitType(schema: unknown): void {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
        return;
    }
    const record = schema as Record<string, unknown>;
    const hasShape = Boolean(record.type || record.anyOf || record.properties || record.items);
    if (hasShape) {
        expect(Boolean(record.type || record.anyOf)).toBe(true);
    }
    if (record.properties && typeof record.properties === 'object' && !Array.isArray(record.properties)) {
        Object.values(record.properties as Record<string, unknown>).forEach((value: unknown): void => {
            expectSchemaNodeHasExplicitType(value);
        });
    }
    if (record.items) {
        expectSchemaNodeHasExplicitType(record.items);
    }
    if (Array.isArray(record.anyOf)) {
        record.anyOf.forEach((item: unknown): void => {
            expectSchemaNodeHasExplicitType(item);
        });
    }
}

/**
 * 功能：创建基础角色命名空间文档。
 * @returns 基础角色命名空间文档。
 */
function createRoleDocument(): Record<string, unknown> {
    return {
        role: {
            profiles: {
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
                        },
                    ],
                    equipments: [],
                    updatedAt: 1735689600000,
                },
            },
            activeActorKey: 'erika',
            summary: {
                overview: '当前主角色资料已建立',
                updatedAt: 1735689600000,
            },
        },
    };
}

describe('ai-json-system', (): void => {
    it('初始化后可以读取默认命名空间', (): void => {
        initAiJsonSystem();
        expect(getAiNamespace('role').namespaceKey).toBe('role');
    });

    it('重复注册同名命名空间会报错', (): void => {
        initAiJsonSystem();
        const duplicateDefinition: AiJsonNamespaceDefinition = {
            ...getAiNamespace('role'),
        };
        expect((): void => {
            registerAiNamespace(duplicateDefinition);
        }).toThrow(/重复注册/);
    });

    it('可更新集合缺少主键时会报错', (): void => {
        initAiJsonSystem();
        expect((): void => {
            registerAiNamespace({
                namespaceKey: 'broken_namespace',
                title: '错误命名空间',
                description: '用于验证集合主键校验',
                fields: {
                    brokenList: {
                        fieldKey: 'brokenList',
                        type: 'list',
                        requiredOnInit: true,
                        nullable: false,
                        description: '错误集合',
                        example: [],
                        updatable: true,
                        updateMode: 'upsert_item',
                        itemDefinition: {
                            fieldKey: 'item',
                            type: 'object',
                            requiredOnInit: true,
                            nullable: false,
                            description: '集合元素',
                            example: {
                                name: '示例',
                            },
                            updatable: false,
                            fields: {
                                name: {
                                    fieldKey: 'name',
                                    type: 'string',
                                    requiredOnInit: true,
                                    nullable: false,
                                    description: '名称',
                                    example: '示例',
                                    updatable: false,
                                },
                            },
                        },
                    },
                },
                example: {
                    brokenList: [],
                },
            });
        }).toThrow(/itemPrimaryKey/);
    });

    it('会生成严格 schema、示例与说明', (): void => {
        initAiJsonSystem();
        const bundle = buildAiJsonPromptBundle({
            mode: 'init',
            namespaceKeys: ['semantic_summary', 'role'],
        });

        expect(bundle.schema).toBeTruthy();
        expect(bundle.exampleJson).toContain('"profiles"');
        expect(bundle.systemInstructions).toContain('主记录主键：actorKey');
        expect(bundle.allowedUpdateKeys).toContain('role.profiles.items.upsert_item');
        expect(bundle.usageGuide).toContain('updateKey');
        expectStrictObjectShape(bundle.schema);
        expectSchemaNodeHasExplicitType(bundle.schema);
    });

    it('更新 schema 会按 updateKey 生成严格联合类型', (): void => {
        initAiJsonSystem();
        const bundle = buildAiJsonPromptBundle({
            mode: 'update',
            namespaceKeys: ['role'],
        });

        const updatesSchema = (bundle.schema.properties as Record<string, unknown>).updates as Record<string, unknown>;
        const updateItemSchema = updatesSchema.items as Record<string, unknown>;
        expect(Array.isArray(updateItemSchema.anyOf)).toBe(true);
        const serialized = JSON.stringify(updateItemSchema);
        expect(serialized).toContain('role.profiles.items.upsert_item');
        expect(serialized).toContain('"itemPrimaryKeyField"');
        expect(serialized).not.toContain('"selector"');
        expect(serialized).not.toContain('"/role/profiles"');
    });

    it('角色命名空间会把 profiles 数组归一化为内部字典', (): void => {
        initAiJsonSystem();
        const applied = applyAiJsonOutput({
            document: {},
            payload: {
                mode: 'init',
                namespaces: {
                    role: {
                        profiles: [
                            {
                                actorKey: 'erika',
                                displayName: '艾莉卡·暮影',
                                aliases: ['暮影'],
                                identityFacts: ['暮影巡礼者'],
                                originFacts: ['来自雾港'],
                                relationshipFacts: [],
                                items: [],
                                equipments: [],
                                updatedAt: 1735689600000,
                            },
                        ],
                        activeActorKey: 'erika',
                        summary: {
                            overview: '当前主角色资料已建立',
                            updatedAt: 1735689600000,
                        },
                    },
                },
                updates: [],
                meta: {
                    note: '',
                },
            },
            namespaceKeys: ['role'],
        });

        const profiles = ((applied.document.role as Record<string, unknown>).profiles as Record<string, unknown>);
        expect((profiles.erika as Record<string, unknown>).actorKey).toBe('erika');
    });

    it('支持字段级更新根字段', (): void => {
        initAiJsonSystem();
        const payload = {
            mode: 'update',
            namespaces: {},
            updates: [
                {
                    updateKey: 'role.summary.overview.replace_scalar',
                    namespaceKey: 'role',
                    targetPrimaryKey: '',
                    fieldKey: 'overview',
                    op: 'replace_scalar',
                    value: '当前重点角色资料已补全',
                    reason: '补充角色系统概览',
                },
            ],
            meta: {
                note: '',
            },
        };

        const validated = validateAiJsonOutput({
            mode: 'update',
            namespaceKeys: ['role'],
            payload,
        });
        expect(validated.ok).toBe(true);

        const applied = applyAiJsonOutput({
            document: createRoleDocument(),
            payload: validated.payload!,
            namespaceKeys: ['role'],
        });

        const overview = (((applied.document.role as Record<string, unknown>).summary as Record<string, unknown>).overview);
        expect(overview).toBe('当前重点角色资料已补全');
    });

    it('支持按实体主键更新角色集合字段', (): void => {
        initAiJsonSystem();
        const payload = {
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
        };

        const validated = validateAiJsonOutput({
            mode: 'update',
            namespaceKeys: ['role'],
            payload,
        });
        expect(validated.ok).toBe(true);

        const applied = applyAiJsonOutput({
            document: createRoleDocument(),
            payload: validated.payload!,
            namespaceKeys: ['role'],
        });

        const items = ((((applied.document.role as Record<string, unknown>).profiles as Record<string, unknown>).erika as Record<string, unknown>).items as Array<Record<string, unknown>>);
        expect(items[0]?.detail).toBe('新增了通往旧港仓库的暗道标记。');
    });

    it('实体字段更新缺少主键时会被拒绝', (): void => {
        initAiJsonSystem();
        const payload = {
            mode: 'update',
            namespaces: {},
            updates: [
                {
                    updateKey: 'role.profiles.displayName.replace_scalar',
                    namespaceKey: 'role',
                    targetPrimaryKey: '',
                    fieldKey: 'displayName',
                    op: 'replace_scalar',
                    value: '艾莉卡',
                    reason: '错误示例',
                },
            ],
            meta: {
                note: '',
            },
        };

        const validated = validateAiJsonOutput({
            mode: 'update',
            namespaceKeys: ['role'],
            payload,
        });
        expect(validated.ok).toBe(false);
        expect(validated.errors.join('\n')).toContain('targetPrimaryKey');
    });

    it('集合删除未命中时不会报错', (): void => {
        initAiJsonSystem();
        const payload = {
            mode: 'update',
            namespaces: {},
            updates: [
                {
                    updateKey: 'role.profiles.equipments.remove_item',
                    namespaceKey: 'role',
                    targetPrimaryKey: 'erika',
                    collectionFieldKey: 'equipments',
                    itemPrimaryKeyField: 'name',
                    itemPrimaryKeyValue: '不存在的装备',
                    op: 'remove_item',
                    reason: '尝试移除不存在的装备',
                },
            ],
            meta: {
                note: '',
            },
        };

        const validated = validateAiJsonOutput({
            mode: 'update',
            namespaceKeys: ['role'],
            payload,
        });
        expect(validated.ok).toBe(true);

        const applied = applyAiJsonOutput({
            document: createRoleDocument(),
            payload: validated.payload!,
            namespaceKeys: ['role'],
        });

        const equipments = ((((applied.document.role as Record<string, unknown>).profiles as Record<string, unknown>).erika as Record<string, unknown>).equipments as Array<Record<string, unknown>>);
        expect(equipments).toEqual([]);
    });
});
