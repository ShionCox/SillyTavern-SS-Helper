import { getAiNamespaceDefinitions, getAiNamespaceUpdateDefinitions } from './ai-json-system';
import type {
    AiJsonDescription,
    AiJsonFieldDefinition,
    AiJsonMode,
    AiJsonNotePhase,
    AiJsonNamespaceDefinition,
    AiJsonPromptBundle,
    AiJsonRegisteredUpdateDefinition,
} from './ai-json-types';
import {
    getAiJsonBaseDescriptionText,
    getAiJsonTypedDescriptionText,
    normalizeAiJsonDescription,
} from './ai-json-types';

/**
 * 功能：构建给模型使用的统一提示资源包。
 * @param input 构建参数。
 * @returns 提示资源包。
 */
export function buildAiJsonPromptBundle(input: { mode: AiJsonMode; namespaceKeys: string[]; notePhase?: AiJsonNotePhase }): AiJsonPromptBundle {
    const definitions = getAiNamespaceDefinitions(input.namespaceKeys);
    const updateDefinitions = getAiNamespaceUpdateDefinitions(input.namespaceKeys);
    const allowedUpdateKeys = uniqueTexts(updateDefinitions.map((definition: AiJsonRegisteredUpdateDefinition): string => definition.updateKey));
    const notePhase = resolveNotePhase(input.mode, input.notePhase);
    return {
        schema: buildEnvelopeSchema(input.mode, definitions, updateDefinitions),
        exampleJson: buildExampleJson(input.mode, definitions, updateDefinitions),
        usageGuide: buildUsageGuide(input.mode, notePhase, definitions, allowedUpdateKeys),
        systemInstructions: buildSystemInstructions(definitions, updateDefinitions, notePhase),
        allowedUpdateKeys,
        notePhase,
    };
}

/**
 * 功能：构建统一外壳 schema。
 * @param mode 输出模式。
 * @param definitions 命名空间定义列表。
 * @param updateDefinitions 更新定义列表。
 * @returns 外壳 schema。
 */
function buildEnvelopeSchema(
    mode: AiJsonMode,
    definitions: AiJsonNamespaceDefinition[],
    updateDefinitions: AiJsonRegisteredUpdateDefinition[],
): Record<string, unknown> {
    const namespaceProperties = definitions.reduce<Record<string, unknown>>((result: Record<string, unknown>, definition: AiJsonNamespaceDefinition): Record<string, unknown> => {
        result[definition.namespaceKey] = buildObjectSchema(definition.fields);
        return result;
    }, {});
    return {
        type: 'object',
        additionalProperties: false,
        required: ['mode', 'namespaces', 'updates', 'meta'],
        properties: {
            mode: {
                type: 'string',
                enum: [mode],
            },
            namespaces: mode === 'init'
                ? {
                    type: 'object',
                    additionalProperties: false,
                    required: definitions.map((definition: AiJsonNamespaceDefinition): string => definition.namespaceKey),
                    properties: namespaceProperties,
                }
                : {
                    type: 'object',
                    additionalProperties: false,
                    required: [],
                    properties: {},
                },
            updates: {
                type: 'array',
                items: buildUpdateItemSchema(updateDefinitions),
            },
            meta: {
                type: 'object',
                additionalProperties: false,
                required: ['note'],
                properties: {
                    note: {
                        type: 'string',
                    },
                },
            },
        },
    };
}

/**
 * 功能：构建对象字段 schema。
 * @param fields 字段定义集合。
 * @returns 对象 schema。
 */
function buildObjectSchema(
    fields: Record<string, AiJsonFieldDefinition>,
    options: { allowUnknownProperties?: boolean; requiredFieldKeys?: string[] } = {},
): Record<string, unknown> {
    const properties = Object.values(fields).reduce<Record<string, unknown>>((result: Record<string, unknown>, field: AiJsonFieldDefinition): Record<string, unknown> => {
        result[field.fieldKey] = buildFieldSchema(field);
        return result;
    }, {});
    const required = Array.isArray(options.requiredFieldKeys) && options.requiredFieldKeys.length > 0
        ? options.requiredFieldKeys.filter((fieldKey: string): boolean => Object.prototype.hasOwnProperty.call(properties, fieldKey))
        : Object.keys(properties);
    return {
        type: 'object',
        additionalProperties: options.allowUnknownProperties === true,
        required,
        properties,
    };
}

/**
 * 功能：构建单字段 schema。
 * @param field 字段定义。
 * @returns 字段 schema。
 */
function buildFieldSchema(field: AiJsonFieldDefinition): Record<string, unknown> {
    let schema: Record<string, unknown>;
    if (field.type === 'object') {
        schema = buildObjectSchema(field.fields ?? {}, {
            allowUnknownProperties: field.allowUnknownProperties,
            requiredFieldKeys: field.requiredFieldKeys,
        });
    } else if (field.type === 'json') {
        schema = {
            anyOf: [
                { type: 'string' },
                { type: 'number' },
                { type: 'boolean' },
                {
                    type: 'object',
                    additionalProperties: true,
                    required: [],
                    properties: {},
                },
                {
                    type: 'array',
                    items: {},
                },
                { type: 'null' },
            ],
        };
    } else if (field.type === 'list') {
        schema = {
            type: 'array',
            items: buildFieldSchema(field.itemDefinition ?? createFallbackFieldDefinition()),
        };
    } else if (field.type === 'enum') {
        schema = {
            type: 'string',
            enum: [...(field.enumValues ?? [])],
        };
    } else {
        schema = {
            type: field.type,
        };
    }
    if (!field.nullable) {
        return schema;
    }
    return {
        anyOf: [
            schema,
            { type: 'null' },
        ],
    };
}

/**
 * 功能：构建更新项 schema。
 * @param updateDefinitions 更新定义列表。
 * @returns 更新项 schema。
 */
function buildUpdateItemSchema(updateDefinitions: AiJsonRegisteredUpdateDefinition[]): Record<string, unknown> {
    if (updateDefinitions.length <= 0) {
        return {
            type: 'object',
            additionalProperties: false,
            required: ['updateKey', 'namespaceKey', 'targetPrimaryKey', 'fieldKey', 'op', 'value', 'reason'],
            properties: {
                updateKey: { type: 'string', enum: ['__disabled__'] },
                namespaceKey: { type: 'string', enum: ['__disabled__'] },
                targetPrimaryKey: { type: 'string' },
                fieldKey: { type: 'string', enum: ['__disabled__'] },
                op: { type: 'string', enum: ['replace_scalar'] },
                value: { type: 'string' },
                reason: { type: 'string' },
            },
        };
    }
    return {
        anyOf: updateDefinitions.map((definition: AiJsonRegisteredUpdateDefinition): Record<string, unknown> => {
            if (definition.op === 'replace_scalar' || definition.op === 'replace_object') {
                return {
                    type: 'object',
                    additionalProperties: false,
                    required: ['updateKey', 'namespaceKey', 'targetPrimaryKey', 'fieldKey', 'op', 'value', 'reason'],
                    properties: {
                        updateKey: { type: 'string', enum: [definition.updateKey] },
                        namespaceKey: { type: 'string', enum: [definition.namespaceKey] },
                        targetPrimaryKey: { type: 'string' },
                        fieldKey: { type: 'string', enum: [definition.fieldKey] },
                        op: { type: 'string', enum: [definition.op] },
                        value: buildFieldSchema(definition.valueDefinition ?? createFallbackFieldDefinition()),
                        reason: { type: 'string' },
                    },
                };
            }
            const properties: Record<string, unknown> = {
                updateKey: { type: 'string', enum: [definition.updateKey] },
                namespaceKey: { type: 'string', enum: [definition.namespaceKey] },
                targetPrimaryKey: { type: 'string' },
                collectionFieldKey: { type: 'string', enum: [definition.collectionFieldKey] },
                itemPrimaryKeyField: { type: 'string', enum: [definition.itemPrimaryKeyField] },
                itemPrimaryKeyValue: buildPrimaryKeySchema(definition.itemDefinition, definition.itemPrimaryKeyField),
                op: { type: 'string', enum: [definition.op] },
                reason: { type: 'string' },
            };
            if (definition.op === 'upsert_item') {
                properties.item = buildFieldSchema(definition.itemDefinition ?? createFallbackFieldDefinition());
            }
            return {
                type: 'object',
                additionalProperties: false,
                required: definition.op === 'upsert_item'
                    ? ['updateKey', 'namespaceKey', 'targetPrimaryKey', 'collectionFieldKey', 'itemPrimaryKeyField', 'itemPrimaryKeyValue', 'op', 'item', 'reason']
                    : ['updateKey', 'namespaceKey', 'targetPrimaryKey', 'collectionFieldKey', 'itemPrimaryKeyField', 'itemPrimaryKeyValue', 'op', 'reason'],
                properties,
            };
        }),
    };
}

/**
 * 功能：构建集合主键值 schema。
 * @param itemDefinition 集合元素定义。
 * @param primaryKeyField 主键字段名。
 * @returns 主键值 schema。
 */
function buildPrimaryKeySchema(itemDefinition?: AiJsonFieldDefinition, primaryKeyField?: string): Record<string, unknown> {
    if (!itemDefinition || !primaryKeyField || itemDefinition.type !== 'object') {
        return { type: 'string' };
    }
    const field = itemDefinition.fields?.[primaryKeyField];
    return buildFieldSchema(field ?? createFallbackFieldDefinition());
}

/**
 * 功能：构建带备注的示例 JSON。
 * @param mode 输出模式。
 * @param definitions 命名空间定义列表。
 * @param updateDefinitions 更新定义列表。
 * @returns 示例 JSON 文本。
 */
function buildExampleJson(
    mode: AiJsonMode,
    definitions: AiJsonNamespaceDefinition[],
    updateDefinitions: AiJsonRegisteredUpdateDefinition[],
): string {
    const payload: Record<string, unknown> = {
        mode,
        namespaces: mode === 'init'
            ? Object.fromEntries(definitions.map((definition: AiJsonNamespaceDefinition): [string, unknown] => [definition.namespaceKey, definition.example]))
            : {},
        updates: mode === 'update' ? [buildExampleUpdate(updateDefinitions)] : [],
        meta: {
            note: '只输出 JSON，不要输出解释文本',
        },
    };
    return renderExampleObject(payload, createRootDefinition(mode, definitions, updateDefinitions), 0).join('\n');
}

/**
 * 功能：构建使用说明。
 * @param mode 输出模式。
 * @param definitions 命名空间定义列表。
 * @param updateKeys 可更新项列表。
 * @returns 使用说明文本。
 */
function buildUsageGuide(mode: AiJsonMode, notePhase: AiJsonNotePhase, definitions: AiJsonNamespaceDefinition[], updateKeys: string[]): string {
    const namespaceSummary = definitions.map((definition: AiJsonNamespaceDefinition): string => `${definition.namespaceKey}（${definition.title}）`).join('、');
    return [
        `当前模式：${mode}`,
        `当前备注阶段：${formatNotePhaseLabel(notePhase)}`,
        `允许的命名空间：${namespaceSummary}`,
        '统一输出外壳：{ "mode": "...", "namespaces": {}, "updates": [], "meta": { "note": "" } }',
        mode === 'init'
            ? '初始化模式要求填写完整 namespaces，并将 updates 返回为空数组。'
            : '更新模式要求 namespaces 返回空对象，updates 按 updateKey 填写字段级更新项。',
        '字段更新项结构：{ "updateKey": "...", "namespaceKey": "...", "targetPrimaryKey": "", "fieldKey": "...", "op": "...", "value": ..., "reason": "..." }',
        '集合更新项结构：{ "updateKey": "...", "namespaceKey": "...", "targetPrimaryKey": "", "collectionFieldKey": "...", "itemPrimaryKeyField": "...", "itemPrimaryKeyValue": ..., "op": "...", "item": {...}, "reason": "..." }',
        '无实体主键的命名空间字段更新时，targetPrimaryKey 固定返回空字符串。',
        '可更新项清单：' + (updateKeys.length > 0 ? updateKeys.join('、') : '当前没有可更新项'),
    ].join('\n');
}

/**
 * 功能：构建命名空间说明文本。
 * @param definitions 命名空间定义列表。
 * @param updateDefinitions 更新定义列表。
 * @returns 系统说明文本。
 */
function buildSystemInstructions(
    definitions: AiJsonNamespaceDefinition[],
    updateDefinitions: AiJsonRegisteredUpdateDefinition[],
    notePhase: AiJsonNotePhase,
): string {
    return definitions.map((definition: AiJsonNamespaceDefinition): string => {
        const namespaceUpdates = updateDefinitions.filter((item: AiJsonRegisteredUpdateDefinition): boolean => {
            return item.namespaceKey === definition.namespaceKey;
        });
        const fieldLines = renderFieldInstructions(definition.fields, definition.entityCollectionField, notePhase, '');
        const updateLines = namespaceUpdates.length > 0
            ? namespaceUpdates.map((item: AiJsonRegisteredUpdateDefinition): string => {
                return `${item.updateKey}：${describeUpdateDefinition(item)}`;
            })
            : ['当前命名空间不参与更新模式。'];
        const namespaceLines = [
            `${definition.namespaceKey}：${resolveNamespaceBaseDescription(definition)}`,
            definition.entityKey ? `主记录主键：${definition.entityKey}` : '主记录主键：无',
            '字段说明：',
            ...fieldLines.map((line: string): string => `- ${line}`),
            '可更新项：',
            ...updateLines.map((line: string): string => `- ${line}`),
        ];
        const currentPhaseNote = resolveNamespacePhaseNote(definition, notePhase);
        const baseDescription = resolveNamespaceBaseDescription(definition);
        if (currentPhaseNote) {
            namespaceLines.splice(1, 0, `当前阶段说明：${currentPhaseNote}`);
        } else if (baseDescription) {
            namespaceLines.splice(1, 0, `当前阶段说明：${baseDescription}`);
        }
        return namespaceLines.join('\n');
    }).join('\n\n');
}

/**
 * 功能：递归渲染字段说明。
 * @param fields 字段定义集合。
 * @param entityCollectionField 实体集合字段。
 * @param prefix 路径前缀。
 * @returns 字段说明列表。
 */
function renderFieldInstructions(
    fields: Record<string, AiJsonFieldDefinition>,
    entityCollectionField?: string,
    notePhase: AiJsonNotePhase = 'coldstart',
    prefix: string = '',
): string[] {
    const result: string[] = [];
    Object.values(fields).forEach((field: AiJsonFieldDefinition): void => {
        const currentPath = prefix ? `${prefix}.${field.fieldKey}` : field.fieldKey;
        const collectionNote = field.type === 'list' && field.itemPrimaryKey
            ? `；集合主键：${field.itemPrimaryKey}`
            : '';
        const entityNote = entityCollectionField && field.fieldKey === entityCollectionField
            ? '；该字段承载命名空间主记录'
            : '';
        const segments = [`${currentPath}：${resolveFieldBaseDescription(field)}`];
        const currentPhaseInstruction = resolveFieldPhaseInstruction(field, notePhase);
        if (currentPhaseInstruction) {
            segments.push(`当前阶段填写：${currentPhaseInstruction}`);
        }
        result.push(`${segments.join('；')}${collectionNote}${entityNote}`);
        if (field.type === 'object' && field.fields) {
            result.push(...renderFieldInstructions(field.fields, entityCollectionField, notePhase, currentPath));
        }
        if (field.type === 'list' && field.itemDefinition?.type === 'object' && field.itemDefinition.fields) {
            result.push(...renderFieldInstructions(field.itemDefinition.fields, entityCollectionField, notePhase, currentPath));
        }
    });
    return result;
}

/**
 * 功能：描述单条更新定义的用途。
 * @param definition 更新定义。
 * @returns 说明文本。
 */
function describeUpdateDefinition(definition: AiJsonRegisteredUpdateDefinition): string {
    if (definition.op === 'replace_scalar' || definition.op === 'replace_object') {
        return `更新字段 ${definition.fieldPath.join('.')}。`;
    }
    return `更新集合 ${definition.fieldPath.join('.')}，使用主键 ${definition.itemPrimaryKeyField} 定位条目。`;
}

/**
 * 功能：构建更新模式示例。
 * @param updateDefinitions 更新定义列表。
 * @returns 示例更新项。
 */
function buildExampleUpdate(updateDefinitions: AiJsonRegisteredUpdateDefinition[]): Record<string, unknown> {
    const preferred = updateDefinitions.find((definition: AiJsonRegisteredUpdateDefinition): boolean => {
        return definition.updateKey === 'role.profiles.items.upsert_item';
    }) ?? updateDefinitions[0];
    if (!preferred) {
        return {
            updateKey: '__disabled__',
            namespaceKey: '__disabled__',
            targetPrimaryKey: '',
            fieldKey: '__disabled__',
            op: 'replace_scalar',
            value: '',
            reason: '当前没有可更新项',
        };
    }
    if (preferred.op === 'replace_scalar' || preferred.op === 'replace_object') {
        return {
            updateKey: preferred.updateKey,
            namespaceKey: preferred.namespaceKey,
            targetPrimaryKey: preferred.targetMode === 'entity_field' ? 'erika' : '',
            fieldKey: preferred.fieldKey,
            op: preferred.op,
            value: preferred.valueDefinition?.example ?? '',
            reason: '根据本轮总结更新字段内容',
        };
    }
    const primaryKeyField = preferred.itemPrimaryKeyField ?? 'name';
    const itemExample = isRecord(preferred.itemDefinition?.example) ? preferred.itemDefinition?.example as Record<string, unknown> : {};
    return {
        updateKey: preferred.updateKey,
        namespaceKey: preferred.namespaceKey,
        targetPrimaryKey: preferred.targetMode === 'entity_collection' ? 'erika' : '',
        collectionFieldKey: preferred.collectionFieldKey,
        itemPrimaryKeyField: primaryKeyField,
        itemPrimaryKeyValue: itemExample[primaryKeyField] ?? '',
        op: preferred.op,
        item: preferred.op === 'upsert_item' ? preferred.itemDefinition?.example ?? {} : undefined,
        reason: '根据本轮总结更新集合条目',
    };
}

/**
 * 功能：创建示例渲染用的根定义。
 * @param mode 输出模式。
 * @param definitions 命名空间定义列表。
 * @param updateDefinitions 更新定义列表。
 * @returns 根字段定义。
 */
function createRootDefinition(
    mode: AiJsonMode,
    definitions: AiJsonNamespaceDefinition[],
    updateDefinitions: AiJsonRegisteredUpdateDefinition[],
): AiJsonFieldDefinition {
    return {
        fieldKey: 'root',
        type: 'object',
        requiredOnInit: true,
        nullable: false,
        description: '统一输出外壳',
        example: {},
        updatable: false,
        fields: {
            mode: createStringField('mode', '固定填写当前模式', mode, false),
            namespaces: {
                fieldKey: 'namespaces',
                type: 'object',
                requiredOnInit: true,
                nullable: false,
                description: '命名空间正文',
                example: {},
                updatable: false,
                fields: Object.fromEntries(definitions.map((definition: AiJsonNamespaceDefinition): [string, AiJsonFieldDefinition] => {
                    return [
                        definition.namespaceKey,
                        {
                            fieldKey: definition.namespaceKey,
                            type: 'object',
                            requiredOnInit: true,
                            nullable: false,
                            description: definition.description,
                            example: definition.example,
                            updatable: false,
                            fields: definition.fields,
                        },
                    ];
                })),
            },
            updates: {
                fieldKey: 'updates',
                type: 'list',
                requiredOnInit: true,
                nullable: false,
                description: '字段级更新项',
                example: [buildExampleUpdate(updateDefinitions)],
                updatable: false,
                itemDefinition: createFallbackFieldDefinition(),
            },
            meta: {
                fieldKey: 'meta',
                type: 'object',
                requiredOnInit: true,
                nullable: false,
                description: '附加说明',
                example: { note: '只输出 JSON，不要输出解释文本' },
                updatable: false,
                fields: {
                    note: createStringField('note', '附加说明', '只输出 JSON，不要输出解释文本', false),
                },
            },
        },
    };
}

/**
 * 功能：渲染示例对象。
 * @param value 当前值。
 * @param definition 当前字段定义。
 * @param indent 缩进层级。
 * @returns 渲染后的多行文本。
 */
function renderExampleObject(value: unknown, definition: AiJsonFieldDefinition, indent: number): string[] {
    const indentText = ' '.repeat(indent);
    if (Array.isArray(value)) {
        if (value.length <= 0) {
            return [`${indentText}[]`];
        }
        const lines: string[] = [`${indentText}[`];
        value.forEach((item: unknown, index: number): void => {
            const childDefinition = definition.itemDefinition ?? createFallbackFieldDefinition();
            const childLines = renderExampleObject(item, childDefinition, indent + 2);
            childLines[childLines.length - 1] = `${childLines[childLines.length - 1]}${index < value.length - 1 ? ',' : ''}`;
            lines.push(...childLines);
        });
        lines.push(`${indentText}]`);
        return lines;
    }
    if (isRecord(value)) {
        const lines: string[] = [`${indentText}{`];
        const entries = Object.entries(value);
        entries.forEach(([key, childValue]: [string, unknown], index: number): void => {
            const childDefinition = resolveChildDefinition(definition, key);
            const comment = resolveFieldBaseDescription(childDefinition) || resolveFieldPhaseInstruction(childDefinition, 'coldstart');
            if (comment) {
                lines.push(`${indentText}  // ${key}：${comment}`);
            }
            const childLines = renderExampleObject(childValue, childDefinition ?? createFallbackFieldDefinition(), indent + 2);
            childLines[0] = `${indentText}  "${key}": ${childLines[0].trimStart()}`;
            childLines[childLines.length - 1] = `${childLines[childLines.length - 1]}${index < entries.length - 1 ? ',' : ''}`;
            lines.push(...childLines);
        });
        lines.push(`${indentText}}`);
        return lines;
    }
    return [`${indentText}${JSON.stringify(value)}`];
}

/**
 * 功能：解析子字段定义。
 * @param definition 当前字段定义。
 * @param key 子字段键名。
 * @returns 子字段定义。
 */
function resolveChildDefinition(definition: AiJsonFieldDefinition, key: string): AiJsonFieldDefinition | undefined {
    if (definition.type === 'object') {
        return definition.fields?.[key];
    }
    return undefined;
}

/**
 * 功能：创建兜底字段定义。
 * @returns 兜底字段定义。
 */
function createFallbackFieldDefinition(): AiJsonFieldDefinition {
    return {
        fieldKey: 'value',
        type: 'string',
        requiredOnInit: true,
        nullable: false,
        description: '字段内容',
        example: '',
        updatable: false,
    };
}

/**
 * 功能：创建示例渲染用的字符串字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param example 示例值。
 * @param updatable 是否可更新。
 * @returns 字符串字段定义。
 */
function createStringField(
    fieldKey: string,
    description: AiJsonDescription,
    example: string,
    updatable: boolean = false,
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'string',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable,
    };
}

/**
 * 功能：根据输出模式解析当前备注阶段。
 * @param mode 输出模式。
 * @param notePhase 显式指定的备注阶段。
 * @returns 当前备注阶段。
 */
function resolveNotePhase(mode: AiJsonMode, notePhase?: AiJsonNotePhase): AiJsonNotePhase {
    if (String(notePhase ?? '').trim()) {
        return notePhase as AiJsonNotePhase;
    }
    return mode === 'init' ? 'coldstart' : 'summary';
}

/**
 * 功能：格式化备注阶段标签。
 * @param notePhase 备注阶段。
 * @returns 用于展示的阶段名称。
 */
function formatNotePhaseLabel(notePhase: AiJsonNotePhase): string {
    if (notePhase === 'coldstart') {
        return '冷启动';
    }
    if (notePhase === 'summary') {
        return '总结';
    }
    return String(notePhase);
}

/**
 * 功能：把分阶段备注映射渲染为可读文本。
 * @param definition 命名空间定义。
 * @param notePhase 当前备注阶段。
 * @returns 当前阶段说明。
 */
function resolveNamespacePhaseNote(definition: AiJsonNamespaceDefinition, notePhase: AiJsonNotePhase): string {
    return getAiJsonTypedDescriptionText(definition.description, notePhase);
}

/**
 * 功能：读取字段在当前阶段的填写备注。
 * @param field 字段定义。
 * @param notePhase 当前备注阶段。
 * @returns 当前阶段填写说明。
 */
function resolveFieldPhaseInstruction(field?: AiJsonFieldDefinition, notePhase: AiJsonNotePhase = 'coldstart'): string {
    return field ? getAiJsonTypedDescriptionText(field.description, notePhase) : '';
}

/**
 * 功能：读取命名空间基础说明。
 * @param definition 命名空间定义。
 * @returns 基础说明文本。
 */
function resolveNamespaceBaseDescription(definition: AiJsonNamespaceDefinition): string {
    return getAiJsonBaseDescriptionText(definition.description);
}

/**
 * 功能：读取字段基础说明。
 * @param field 字段定义。
 * @returns 基础说明文本。
 */
function resolveFieldBaseDescription(field?: AiJsonFieldDefinition): string {
    return field ? getAiJsonBaseDescriptionText(field.description) : '';
}

/**
 * 功能：判断值是否为普通对象。
 * @param value 待判断值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：对文本列表做去重。
 * @param values 文本列表。
 * @returns 去重后的文本列表。
 */
function uniqueTexts(values: string[]): string[] {
    return Array.from(new Set(values.filter((value: string): boolean => String(value ?? '').trim().length > 0)));
}
