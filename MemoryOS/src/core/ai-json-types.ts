export type AiJsonMode = 'init' | 'update';

export type AiJsonFieldType = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'list';

export type AiJsonUpdateMode = 'replace_scalar' | 'replace_object' | 'upsert_item' | 'remove_item';

export type AiJsonUpdateTargetMode = 'namespace_field' | 'entity_field' | 'namespace_collection' | 'entity_collection';

export type AiJsonNotePhase = 'coldstart' | 'summary' | (string & {});

export type AiJsonDescription = string;

/**
 * 功能：描述统一字段注册项。
 * @param fieldKey 字段键名。
 * @param type 字段类型。
 * @param requiredOnInit 冷启动时是否必填。
 * @param nullable 是否允许为空。
 * @param description 字段说明。
 * @param example 示例值。
 * @param updatable 是否允许在更新模式中修改。
 * @param updateMode 更新模式。
 * @param enumValues 枚举可选值。
 * @param fields 对象字段定义。
 * @param itemDefinition 列表元素定义。
 * @param itemPrimaryKey 可更新列表的主键字段。
 * @param hiddenInUpdate 是否从更新项生成中隐藏。
 * @returns 字段注册定义。
 */
export interface AiJsonFieldDefinition {
    fieldKey: string;
    type: AiJsonFieldType;
    requiredOnInit: boolean;
    nullable: boolean;
    description: AiJsonDescription;
    example: unknown;
    updatable: boolean;
    updateMode?: AiJsonUpdateMode;
    enumValues?: string[];
    fields?: Record<string, AiJsonFieldDefinition>;
    itemDefinition?: AiJsonFieldDefinition;
    itemPrimaryKey?: string;
    hiddenInUpdate?: boolean;
}

/**
 * 功能：描述命名空间级注册钩子。
 * @param normalizeInitDocument 冷启动文档归一化钩子。
 * @param afterApply 更新后文档归一化钩子。
 * @returns 命名空间钩子定义。
 */
export interface AiJsonNamespaceHooks {
    normalizeInitDocument?: (value: unknown) => unknown;
    afterApply?: (value: unknown) => unknown;
}

/**
 * 功能：描述统一命名空间注册项。
 * @param namespaceKey 命名空间键名。
 * @param title 命名空间标题。
 * @param description 命名空间说明。
 * @param entityKey 主记录主键字段，没有则留空。
 * @param entityCollectionField 主记录集合字段，没有则留空。
 * @param entityCollectionStorage 主记录集合的内部存储形式。
 * @param fields 字段注册表。
 * @param example 示例文档。
 * @param hooks 归一化钩子。
 * @returns 命名空间注册定义。
 */
export interface AiJsonNamespaceDefinition {
    namespaceKey: string;
    title: string;
    description: AiJsonDescription;
    entityKey?: string;
    entityCollectionField?: string;
    entityCollectionStorage?: 'array' | 'record';
    fields: Record<string, AiJsonFieldDefinition>;
    example: Record<string, unknown>;
    hooks?: AiJsonNamespaceHooks;
}

/**
 * 功能：描述更新注册项。
 * @param updateKey 更新项判别键。
 * @param namespaceKey 命名空间键名。
 * @param targetMode 更新目标模式。
 * @param fieldKey 字段键名。
 * @param op 更新操作。
 * @param valueDefinition 值定义。
 * @param collectionFieldKey 集合字段键名。
 * @param itemPrimaryKeyField 集合元素主键字段。
 * @param itemDefinition 集合元素定义。
 * @param fieldPath 字段路径。
 * @returns 更新注册定义。
 */
export interface AiJsonRegisteredUpdateDefinition {
    updateKey: string;
    namespaceKey: string;
    targetMode: AiJsonUpdateTargetMode;
    fieldKey?: string;
    op: AiJsonUpdateMode;
    valueDefinition?: AiJsonFieldDefinition;
    collectionFieldKey?: string;
    itemPrimaryKeyField?: string;
    itemDefinition?: AiJsonFieldDefinition;
    fieldPath: string[];
}

/**
 * 功能：描述标量或对象字段更新项。
 * @param updateKey 更新项判别键。
 * @param namespaceKey 命名空间键名。
 * @param targetPrimaryKey 目标主记录主键，没有则填空字符串。
 * @param fieldKey 字段键名。
 * @param op 更新操作。
 * @param value 更新值。
 * @param reason 更新原因。
 * @returns 字段更新项。
 */
export interface AiJsonValueUpdateInstruction {
    updateKey: string;
    namespaceKey: string;
    targetPrimaryKey: string;
    fieldKey: string;
    op: 'replace_scalar' | 'replace_object';
    value: unknown;
    reason: string;
}

/**
 * 功能：描述集合新增或覆盖更新项。
 * @param updateKey 更新项判别键。
 * @param namespaceKey 命名空间键名。
 * @param targetPrimaryKey 目标主记录主键，没有则填空字符串。
 * @param collectionFieldKey 集合字段键名。
 * @param itemPrimaryKeyField 集合元素主键字段。
 * @param itemPrimaryKeyValue 集合元素主键值。
 * @param op 更新操作。
 * @param item 更新元素。
 * @param reason 更新原因。
 * @returns 集合更新项。
 */
export interface AiJsonCollectionUpsertInstruction {
    updateKey: string;
    namespaceKey: string;
    targetPrimaryKey: string;
    collectionFieldKey: string;
    itemPrimaryKeyField: string;
    itemPrimaryKeyValue: unknown;
    op: 'upsert_item';
    item: unknown;
    reason: string;
}

/**
 * 功能：描述集合移除更新项。
 * @param updateKey 更新项判别键。
 * @param namespaceKey 命名空间键名。
 * @param targetPrimaryKey 目标主记录主键，没有则填空字符串。
 * @param collectionFieldKey 集合字段键名。
 * @param itemPrimaryKeyField 集合元素主键字段。
 * @param itemPrimaryKeyValue 集合元素主键值。
 * @param op 更新操作。
 * @param reason 更新原因。
 * @returns 集合移除更新项。
 */
export interface AiJsonCollectionRemoveInstruction {
    updateKey: string;
    namespaceKey: string;
    targetPrimaryKey: string;
    collectionFieldKey: string;
    itemPrimaryKeyField: string;
    itemPrimaryKeyValue: unknown;
    op: 'remove_item';
    reason: string;
}

export type AiJsonUpdateInstruction =
    | AiJsonValueUpdateInstruction
    | AiJsonCollectionUpsertInstruction
    | AiJsonCollectionRemoveInstruction;

/**
 * 功能：描述统一输出外壳。
 * @param mode 输出模式。
 * @param namespaces 命名空间正文。
 * @param updates 字段级更新项列表。
 * @param meta 元信息。
 * @returns 统一输出外壳。
 */
export interface AiJsonOutputEnvelope {
    mode: AiJsonMode;
    namespaces: Record<string, unknown>;
    updates: AiJsonUpdateInstruction[];
    meta: {
        note: string;
    };
}

/**
 * 功能：描述给模型使用的提示资源包。
 * @param schema 严格结构化输出 schema。
 * @param exampleJson 带备注的示例 JSON。
 * @param usageGuide 使用说明。
 * @param systemInstructions 命名空间与字段说明。
 * @param allowedUpdateKeys 可更新项键列表。
 * @param notePhase 当前备注阶段。
 * @returns 提示资源包。
 */
export interface AiJsonPromptBundle {
    schema: Record<string, unknown>;
    exampleJson: string;
    usageGuide: string;
    systemInstructions: string;
    allowedUpdateKeys: string[];
    notePhase: AiJsonNotePhase;
}

/**
 * 功能：描述结构化输出校验结果。
 * @param ok 是否校验通过。
 * @param errors 错误列表。
 * @param payload 归一化后的外壳对象。
 * @returns 校验结果。
 */
export interface AiJsonValidationResult {
    ok: boolean;
    errors: string[];
    payload: AiJsonOutputEnvelope | null;
}

/**
 * 功能：描述结构化输出应用结果。
 * @param document 更新后的命名空间文档。
 * @param appliedPaths 已应用的字段引用列表。
 * @returns 应用结果。
 */
export interface AiJsonApplyResult {
    document: Record<string, unknown>;
    appliedPaths: string[];
}

/**
 * 功能：归一化说明文本。
 * @param description 原始说明。
 * @returns 归一化后的说明文本。
 */
export function normalizeAiJsonDescription(description: AiJsonDescription): string {
    return String(description ?? '').trim();
}

/**
 * 功能：读取基础说明文本。
 * @param description 原始说明。
 * @returns 基础说明文本。
 */
export function getAiJsonBaseDescriptionText(description: AiJsonDescription): string {
    return normalizeAiJsonDescription(description);
}

/**
 * 功能：读取指定阶段说明文本。
 * @param description 原始说明。
 * @param type 说明类型。
 * @returns 阶段说明文本。
 */
export function getAiJsonTypedDescriptionText(
    description: AiJsonDescription,
    type: AiJsonNotePhase,
): string {
    void type;
    return normalizeAiJsonDescription(description);
}
