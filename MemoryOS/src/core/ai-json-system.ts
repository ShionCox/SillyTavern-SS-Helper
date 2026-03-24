import { getDefaultAiJsonNamespaces } from './ai-json-namespaces';
import type {
    AiJsonApplyResult,
    AiJsonFieldDefinition,
    AiJsonMode,
    AiJsonNamespaceDefinition,
    AiJsonOutputEnvelope,
    AiJsonRegisteredUpdateDefinition,
    AiJsonUpdateInstruction,
    AiJsonValidationResult,
} from './ai-json-types';
import { getAiJsonBaseDescriptionText } from './ai-json-types';

type MutableRecord = Record<string, unknown>;

const namespaceRegistry = new Map<string, AiJsonNamespaceDefinition>();
const updateRegistry = new Map<string, AiJsonRegisteredUpdateDefinition>();
let initialized = false;

/**
 * 功能：初始化统一 AI JSON 注册中心。
 * @returns 无返回值。
 */
export function initAiJsonSystem(): void {
    namespaceRegistry.clear();
    updateRegistry.clear();
    getDefaultAiJsonNamespaces().forEach((definition: AiJsonNamespaceDefinition): void => {
        registerAiNamespace(definition);
    });
    initialized = true;
}

/**
 * 功能：注册单个命名空间定义。
 * @param definition 命名空间定义。
 * @returns 无返回值。
 */
export function registerAiNamespace(definition: AiJsonNamespaceDefinition): void {
    const namespaceKey = normalizeText(definition.namespaceKey);
    if (!namespaceKey) {
        throw new Error('AI JSON 命名空间缺少 namespaceKey');
    }
    if (namespaceRegistry.has(namespaceKey)) {
        throw new Error(`AI JSON 命名空间重复注册: ${namespaceKey}`);
    }
    validateNamespaceDefinition(definition);
    const normalizedDefinition: AiJsonNamespaceDefinition = {
        ...definition,
        namespaceKey,
    };
    namespaceRegistry.set(namespaceKey, normalizedDefinition);
    collectNamespaceUpdateDefinitions(normalizedDefinition).forEach((item: AiJsonRegisteredUpdateDefinition): void => {
        if (updateRegistry.has(item.updateKey)) {
            throw new Error(`AI JSON 更新键重复注册: ${item.updateKey}`);
        }
        updateRegistry.set(item.updateKey, item);
    });
}

/**
 * 功能：读取单个命名空间定义。
 * @param namespaceKey 命名空间键名。
 * @returns 命名空间定义。
 */
export function getAiNamespace(namespaceKey: string): AiJsonNamespaceDefinition {
    ensureReady();
    const definition = namespaceRegistry.get(normalizeText(namespaceKey));
    if (!definition) {
        throw new Error(`AI JSON 命名空间不存在: ${namespaceKey}`);
    }
    return definition;
}

/**
 * 功能：按顺序读取多个命名空间定义。
 * @param namespaceKeys 命名空间键名列表。
 * @returns 命名空间定义列表。
 */
export function getAiNamespaceDefinitions(namespaceKeys: string[]): AiJsonNamespaceDefinition[] {
    ensureReady();
    return namespaceKeys.map((namespaceKey: string): AiJsonNamespaceDefinition => getAiNamespace(namespaceKey));
}

/**
 * 功能：读取多个命名空间对应的更新定义列表。
 * @param namespaceKeys 命名空间键名列表。
 * @returns 更新定义列表。
 */
export function getAiNamespaceUpdateDefinitions(namespaceKeys: string[]): AiJsonRegisteredUpdateDefinition[] {
    const allowedNamespaces = new Set(getAiNamespaceDefinitions(namespaceKeys).map((definition: AiJsonNamespaceDefinition): string => definition.namespaceKey));
    return Array.from(updateRegistry.values()).filter((definition: AiJsonRegisteredUpdateDefinition): boolean => {
        return allowedNamespaces.has(definition.namespaceKey);
    });
}

/**
 * 功能：校验 AI JSON 统一外壳。
 * @param input 校验输入。
 * @returns 校验结果。
 */
export function validateAiJsonOutput(input: {
    mode: AiJsonMode;
    namespaceKeys: string[];
    payload: unknown;
}): AiJsonValidationResult {
    const definitions = getAiNamespaceDefinitions(input.namespaceKeys);
    const updateDefinitions = new Map<string, AiJsonRegisteredUpdateDefinition>(
        getAiNamespaceUpdateDefinitions(input.namespaceKeys).map((definition: AiJsonRegisteredUpdateDefinition): [string, AiJsonRegisteredUpdateDefinition] => {
            return [definition.updateKey, definition];
        }),
    );
    if (!isRecord(input.payload)) {
        return {
            ok: false,
            errors: ['输出必须是 JSON 对象'],
            payload: null,
        };
    }

    const record = input.payload as MutableRecord;
    const errors: string[] = [];
    const namespaces = isRecord(record.namespaces) ? cloneValue(record.namespaces) as MutableRecord : {};
    const updates = Array.isArray(record.updates)
        ? normalizeUpdates(record.updates, updateDefinitions, errors)
        : [];
    const metaNote = isRecord(record.meta) ? normalizeText(record.meta.note) : '';

    if (normalizeText(record.mode) !== input.mode) {
        errors.push(`mode 必须为 ${input.mode}`);
    }

    if (input.mode === 'init') {
        definitions.forEach((definition: AiJsonNamespaceDefinition): void => {
            if (!Object.prototype.hasOwnProperty.call(namespaces, definition.namespaceKey)) {
                errors.push(`初始化输出缺少命名空间 ${definition.namespaceKey}`);
            }
        });
    }

    if (input.mode === 'update' && updates.length <= 0) {
        errors.push('更新模式至少需要一条 updates');
    }

    return {
        ok: errors.length <= 0,
        errors,
        payload: errors.length <= 0
            ? {
                mode: input.mode,
                namespaces,
                updates,
                meta: {
                    note: metaNote,
                },
            }
            : null,
    };
}

/**
 * 功能：把 AI JSON 外壳应用到当前命名空间文档。
 * @param input 应用输入。
 * @returns 应用结果。
 */
export function applyAiJsonOutput(input: {
    document: Record<string, unknown>;
    payload: AiJsonOutputEnvelope;
    namespaceKeys: string[];
}): AiJsonApplyResult {
    const definitions = getAiNamespaceDefinitions(input.namespaceKeys);
    const updateDefinitions = new Map<string, AiJsonRegisteredUpdateDefinition>(
        getAiNamespaceUpdateDefinitions(input.namespaceKeys).map((definition: AiJsonRegisteredUpdateDefinition): [string, AiJsonRegisteredUpdateDefinition] => {
            return [definition.updateKey, definition];
        }),
    );
    const nextDocument = cloneValue(input.document ?? {}) as MutableRecord;
    const appliedPaths: string[] = [];

    if (input.payload.mode === 'init') {
        definitions.forEach((definition: AiJsonNamespaceDefinition): void => {
            const rawValue = input.payload.namespaces[definition.namespaceKey];
            const normalizedValue = definition.hooks?.normalizeInitDocument
                ? definition.hooks.normalizeInitDocument(rawValue)
                : cloneValue(rawValue);
            nextDocument[definition.namespaceKey] = cloneValue(normalizedValue);
            appliedPaths.push(definition.namespaceKey);
        });
        return {
            document: nextDocument,
            appliedPaths,
        };
    }

    input.payload.updates.forEach((update: AiJsonUpdateInstruction): void => {
        const definition = updateDefinitions.get(update.updateKey);
        if (!definition) {
            return;
        }
        const namespaceDefinition = getAiNamespace(definition.namespaceKey);
        const namespaceValue = isRecord(nextDocument[definition.namespaceKey])
            ? cloneValue(nextDocument[definition.namespaceKey]) as MutableRecord
            : {};
        applyRegisteredUpdate(namespaceValue, namespaceDefinition, definition, update);
        nextDocument[definition.namespaceKey] = namespaceDefinition.hooks?.afterApply
            ? namespaceDefinition.hooks.afterApply(namespaceValue)
            : namespaceValue;
        appliedPaths.push(definition.updateKey);
    });

    return {
        document: nextDocument,
        appliedPaths,
    };
}

/**
 * 功能：归一化更新项列表。
 * @param updates 原始更新项列表。
 * @param definitions 更新定义映射。
 * @param errors 错误列表。
 * @returns 归一化后的更新项列表。
 */
function normalizeUpdates(
    updates: unknown[],
    definitions: Map<string, AiJsonRegisteredUpdateDefinition>,
    errors: string[],
): AiJsonUpdateInstruction[] {
    const result: AiJsonUpdateInstruction[] = [];
    updates.forEach((item: unknown, index: number): void => {
        if (!isRecord(item)) {
            errors.push(`updates[${index}] 必须是对象`);
            return;
        }
        const updateKey = normalizeText(item.updateKey);
        const definition = definitions.get(updateKey);
        if (!definition) {
            errors.push(`updates[${index}].updateKey 未注册: ${updateKey}`);
            return;
        }
        const namespaceKey = normalizeText(item.namespaceKey);
        if (namespaceKey !== definition.namespaceKey) {
            errors.push(`updates[${index}].namespaceKey 与 updateKey 不匹配`);
            return;
        }
        if (definition.op === 'replace_scalar' || definition.op === 'replace_object') {
            const fieldKey = normalizeText(item.fieldKey);
            const targetPrimaryKey = normalizeText(item.targetPrimaryKey);
            if (fieldKey !== definition.fieldKey) {
                errors.push(`updates[${index}].fieldKey 与 updateKey 不匹配`);
                return;
            }
            if (definition.targetMode === 'entity_field' && !targetPrimaryKey) {
                errors.push(`updates[${index}] 缺少 targetPrimaryKey`);
                return;
            }
            result.push({
                updateKey,
                namespaceKey,
                targetPrimaryKey,
                fieldKey,
                op: definition.op,
                value: cloneValue(item.value),
                reason: normalizeText(item.reason),
            });
            return;
        }
        const collectionFieldKey = normalizeText(item.collectionFieldKey);
        const itemPrimaryKeyField = normalizeText(item.itemPrimaryKeyField);
        const targetPrimaryKey = normalizeText(item.targetPrimaryKey);
        const itemPrimaryKeyValue = cloneValue(item.itemPrimaryKeyValue);
        if (collectionFieldKey !== definition.collectionFieldKey || itemPrimaryKeyField !== definition.itemPrimaryKeyField) {
            errors.push(`updates[${index}] 的集合定位字段与 updateKey 不匹配`);
            return;
        }
        if (definition.targetMode === 'entity_collection' && !targetPrimaryKey) {
            errors.push(`updates[${index}] 缺少 targetPrimaryKey`);
            return;
        }
        if (
            itemPrimaryKeyValue == null
            || (typeof itemPrimaryKeyValue === 'string' && !itemPrimaryKeyValue.trim())
        ) {
            errors.push(`updates[${index}] 缺少 itemPrimaryKeyValue`);
            return;
        }
        if (definition.op === 'upsert_item') {
            result.push({
                updateKey,
                namespaceKey,
                targetPrimaryKey,
                collectionFieldKey,
                itemPrimaryKeyField,
                itemPrimaryKeyValue,
                op: 'upsert_item',
                item: cloneValue(item.item),
                reason: normalizeText(item.reason),
            });
            return;
        }
        result.push({
            updateKey,
            namespaceKey,
            targetPrimaryKey,
            collectionFieldKey,
            itemPrimaryKeyField,
            itemPrimaryKeyValue,
            op: 'remove_item',
            reason: normalizeText(item.reason),
        });
    });
    return result;
}

/**
 * 功能：收集命名空间允许的更新定义。
 * @param namespace 命名空间定义。
 * @returns 更新定义列表。
 */
function collectNamespaceUpdateDefinitions(namespace: AiJsonNamespaceDefinition): AiJsonRegisteredUpdateDefinition[] {
    const result: AiJsonRegisteredUpdateDefinition[] = [];
    Object.values(namespace.fields).forEach((field: AiJsonFieldDefinition): void => {
        collectFieldUpdateDefinitions(result, namespace, field, [field.fieldKey], false);
    });
    return result;
}

/**
 * 功能：递归收集字段更新定义。
 * @param collector 收集器。
 * @param namespace 命名空间定义。
 * @param field 当前字段定义。
 * @param path 当前路径。
 * @param insideEntity 是否位于实体记录内部。
 * @returns 无返回值。
 */
function collectFieldUpdateDefinitions(
    collector: AiJsonRegisteredUpdateDefinition[],
    namespace: AiJsonNamespaceDefinition,
    field: AiJsonFieldDefinition,
    path: string[],
    insideEntity: boolean,
): void {
    const currentPath = [...path];
    if (field.hiddenInUpdate) {
        return;
    }

    if (
        namespace.entityCollectionField
        && currentPath.length === 1
        && currentPath[0] === namespace.entityCollectionField
        && field.type === 'list'
        && field.itemDefinition?.type === 'object'
        && field.itemPrimaryKey
    ) {
        collector.push({
            updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.upsert_item`,
            namespaceKey: namespace.namespaceKey,
            targetMode: 'namespace_collection',
            collectionFieldKey: field.fieldKey,
            itemPrimaryKeyField: field.itemPrimaryKey,
            itemDefinition: field.itemDefinition,
            op: 'upsert_item',
            fieldPath: currentPath,
        });
        collector.push({
            updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.remove_item`,
            namespaceKey: namespace.namespaceKey,
            targetMode: 'namespace_collection',
            collectionFieldKey: field.fieldKey,
            itemPrimaryKeyField: field.itemPrimaryKey,
            itemDefinition: field.itemDefinition,
            op: 'remove_item',
            fieldPath: currentPath,
        });
        Object.values(field.itemDefinition.fields ?? {}).forEach((childField: AiJsonFieldDefinition): void => {
            collectFieldUpdateDefinitions(collector, namespace, childField, [...currentPath, childField.fieldKey], true);
        });
        return;
    }

    if (field.type === 'object') {
        if (field.updatable && field.updateMode === 'replace_object') {
            collector.push({
                updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.replace_object`,
                namespaceKey: namespace.namespaceKey,
                targetMode: insideEntity ? 'entity_field' : 'namespace_field',
                fieldKey: field.fieldKey,
                valueDefinition: field,
                op: 'replace_object',
                fieldPath: currentPath,
            });
        }
        Object.values(field.fields ?? {}).forEach((childField: AiJsonFieldDefinition): void => {
            collectFieldUpdateDefinitions(collector, namespace, childField, [...currentPath, childField.fieldKey], insideEntity);
        });
        return;
    }

    if (field.type === 'list' && field.itemDefinition?.type === 'object' && field.itemPrimaryKey && field.updateMode === 'upsert_item') {
        collector.push({
            updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.upsert_item`,
            namespaceKey: namespace.namespaceKey,
            targetMode: insideEntity ? 'entity_collection' : 'namespace_collection',
            collectionFieldKey: field.fieldKey,
            itemPrimaryKeyField: field.itemPrimaryKey,
            itemDefinition: field.itemDefinition,
            op: 'upsert_item',
            fieldPath: currentPath,
        });
        collector.push({
            updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.remove_item`,
            namespaceKey: namespace.namespaceKey,
            targetMode: insideEntity ? 'entity_collection' : 'namespace_collection',
            collectionFieldKey: field.fieldKey,
            itemPrimaryKeyField: field.itemPrimaryKey,
            itemDefinition: field.itemDefinition,
            op: 'remove_item',
            fieldPath: currentPath,
        });
        return;
    }

    if (field.updatable) {
        collector.push({
            updateKey: `${namespace.namespaceKey}.${currentPath.join('.')}.replace_scalar`,
            namespaceKey: namespace.namespaceKey,
            targetMode: insideEntity ? 'entity_field' : 'namespace_field',
            fieldKey: field.fieldKey,
            valueDefinition: field,
            op: 'replace_scalar',
            fieldPath: currentPath,
        });
    }
}

/**
 * 功能：执行单条已注册更新。
 * @param namespaceValue 命名空间当前文档。
 * @param namespace 命名空间定义。
 * @param definition 更新定义。
 * @param update 更新项。
 * @returns 无返回值。
 */
function applyRegisteredUpdate(
    namespaceValue: MutableRecord,
    namespace: AiJsonNamespaceDefinition,
    definition: AiJsonRegisteredUpdateDefinition,
    update: AiJsonUpdateInstruction,
): void {
    if (definition.targetMode === 'namespace_field') {
        setValueByPath(namespaceValue, definition.fieldPath, cloneValue((update as { value: unknown }).value));
        return;
    }
    if (definition.targetMode === 'entity_field') {
        const entityRecord = ensureEntityRecord(namespaceValue, namespace, update.targetPrimaryKey);
        setValueByPath(entityRecord, definition.fieldPath.slice(1), cloneValue((update as { value: unknown }).value));
        return;
    }
    if (definition.targetMode === 'namespace_collection') {
        applyCollectionUpdate(namespaceValue, namespace, definition, update);
        return;
    }
    const entityRecord = ensureEntityRecord(namespaceValue, namespace, update.targetPrimaryKey);
    applyCollectionUpdate(entityRecord, namespace, definition, update, true);
}

/**
 * 功能：执行集合更新。
 * @param container 当前容器对象。
 * @param namespace 命名空间定义。
 * @param definition 更新定义。
 * @param update 更新项。
 * @param insideEntity 是否位于实体内部。
 * @returns 无返回值。
 */
function applyCollectionUpdate(
    container: MutableRecord,
    namespace: AiJsonNamespaceDefinition,
    definition: AiJsonRegisteredUpdateDefinition,
    update: AiJsonUpdateInstruction,
    insideEntity: boolean = false,
): void {
    const path = insideEntity ? definition.fieldPath.slice(1) : definition.fieldPath;
    const collectionFieldKey = definition.collectionFieldKey ?? path[path.length - 1];
    const parent = ensureParentRecord(container, path.slice(0, -1));
    const primaryKeyField = definition.itemPrimaryKeyField ?? '';

    if (
        !insideEntity
        && namespace.entityCollectionField === collectionFieldKey
        && namespace.entityCollectionStorage === 'record'
    ) {
        const mapValue = isRecord(parent[collectionFieldKey]) ? parent[collectionFieldKey] as MutableRecord : {};
        const itemPrimaryKeyValue = normalizeText((update as { itemPrimaryKeyValue: unknown }).itemPrimaryKeyValue);
        if ((update as { op: string }).op === 'remove_item') {
            delete mapValue[itemPrimaryKeyValue];
        } else {
            const itemRecord = isRecord((update as { item: unknown }).item)
                ? cloneValue((update as { item: unknown }).item) as MutableRecord
                : {};
            if (!itemRecord[primaryKeyField]) {
                itemRecord[primaryKeyField] = itemPrimaryKeyValue;
            }
            mapValue[itemPrimaryKeyValue] = itemRecord;
        }
        parent[collectionFieldKey] = mapValue;
        return;
    }

    const currentList = Array.isArray(parent[collectionFieldKey]) ? cloneValue(parent[collectionFieldKey]) as unknown[] : [];
    const itemPrimaryKeyValue = normalizeCompareValue((update as { itemPrimaryKeyValue: unknown }).itemPrimaryKeyValue);
    const index = currentList.findIndex((item: unknown): boolean => {
        return isRecord(item) && normalizeCompareValue(item[primaryKeyField]) === itemPrimaryKeyValue;
    });
    if ((update as { op: string }).op === 'remove_item') {
        if (index >= 0) {
            currentList.splice(index, 1);
        }
        parent[collectionFieldKey] = currentList;
        return;
    }
    const itemRecord = isRecord((update as { item: unknown }).item)
        ? cloneValue((update as { item: unknown }).item) as MutableRecord
        : {};
    if (!itemRecord[primaryKeyField]) {
        itemRecord[primaryKeyField] = cloneValue((update as { itemPrimaryKeyValue: unknown }).itemPrimaryKeyValue);
    }
    if (index >= 0) {
        currentList[index] = itemRecord;
    } else {
        currentList.push(itemRecord);
    }
    parent[collectionFieldKey] = currentList;
}

/**
 * 功能：确保实体记录存在。
 * @param namespaceValue 命名空间文档。
 * @param namespace 命名空间定义。
 * @param targetPrimaryKey 目标主键。
 * @returns 实体记录对象。
 */
function ensureEntityRecord(
    namespaceValue: MutableRecord,
    namespace: AiJsonNamespaceDefinition,
    targetPrimaryKey: string,
): MutableRecord {
    const collectionField = namespace.entityCollectionField;
    const entityKey = namespace.entityKey;
    const normalizedKey = normalizeText(targetPrimaryKey);
    if (!collectionField || !entityKey || !normalizedKey) {
        throw new Error(`命名空间 ${namespace.namespaceKey} 缺少实体定位信息`);
    }
    if (namespace.entityCollectionStorage === 'record') {
        const profiles = isRecord(namespaceValue[collectionField]) ? namespaceValue[collectionField] as MutableRecord : {};
        if (!isRecord(profiles[normalizedKey])) {
            profiles[normalizedKey] = { [entityKey]: normalizedKey };
        }
        namespaceValue[collectionField] = profiles;
        return profiles[normalizedKey] as MutableRecord;
    }
    const list = Array.isArray(namespaceValue[collectionField]) ? namespaceValue[collectionField] as unknown[] : [];
    let found = list.find((item: unknown): boolean => isRecord(item) && normalizeText(item[entityKey]) === normalizedKey);
    if (!isRecord(found)) {
        found = { [entityKey]: normalizedKey };
        list.push(found);
    }
    namespaceValue[collectionField] = list;
    return found as MutableRecord;
}

/**
 * 功能：确保父级对象路径存在。
 * @param root 根对象。
 * @param path 父级路径。
 * @returns 父级对象。
 */
function ensureParentRecord(root: MutableRecord, path: string[]): MutableRecord {
    let current = root;
    path.forEach((segment: string): void => {
        if (!isRecord(current[segment])) {
            current[segment] = {};
        }
        current = current[segment] as MutableRecord;
    });
    return current;
}

/**
 * 功能：按路径写入值。
 * @param root 根对象。
 * @param path 字段路径。
 * @param value 待写入值。
 * @returns 无返回值。
 */
function setValueByPath(root: MutableRecord, path: string[], value: unknown): void {
    if (path.length <= 0) {
        return;
    }
    const parent = ensureParentRecord(root, path.slice(0, -1));
    parent[path[path.length - 1]] = value;
}

/**
 * 功能：校验命名空间定义是否合法。
 * @param definition 命名空间定义。
 * @returns 无返回值。
 */
function validateNamespaceDefinition(definition: AiJsonNamespaceDefinition): void {
    if (!normalizeText(definition.title) || !normalizeText(getAiJsonBaseDescriptionText(definition.description))) {
        throw new Error(`AI JSON 命名空间 ${definition.namespaceKey} 缺少标题或说明`);
    }
    validateDescription(definition.description, `${definition.namespaceKey}.description`);
    if (!isRecord(definition.fields) || Object.keys(definition.fields).length <= 0) {
        throw new Error(`AI JSON 命名空间 ${definition.namespaceKey} 缺少字段定义`);
    }
    Object.values(definition.fields).forEach((field: AiJsonFieldDefinition): void => {
        validateFieldDefinition(field, `${definition.namespaceKey}.${field.fieldKey}`);
    });
}

/**
 * 功能：递归校验字段定义是否合法。
 * @param field 字段定义。
 * @param path 字段路径。
 * @returns 无返回值。
 */
function validateFieldDefinition(field: AiJsonFieldDefinition, path: string): void {
    if (!normalizeText(field.fieldKey) || !normalizeText(getAiJsonBaseDescriptionText(field.description))) {
        throw new Error(`AI JSON 字段 ${path} 缺少基础说明`);
    }
    validateDescription(field.description, `${path}.description`);
    if (field.type === 'enum' && (!Array.isArray(field.enumValues) || field.enumValues.length <= 0)) {
        throw new Error(`AI JSON 枚举字段 ${path} 缺少 enumValues`);
    }
    if (field.type === 'object' && (!field.fields || Object.keys(field.fields).length <= 0)) {
        throw new Error(`AI JSON 对象字段 ${path} 缺少 fields`);
    }
    if (field.type === 'list' && !field.itemDefinition) {
        throw new Error(`AI JSON 列表字段 ${path} 缺少 itemDefinition`);
    }
    if (field.type === 'list' && field.updateMode === 'upsert_item' && !normalizeText(field.itemPrimaryKey)) {
        throw new Error(`AI JSON 可更新集合字段 ${path} 缺少 itemPrimaryKey`);
    }
    Object.values(field.fields ?? {}).forEach((childField: AiJsonFieldDefinition): void => {
        validateFieldDefinition(childField, `${path}.${childField.fieldKey}`);
    });
    if (field.itemDefinition) {
        validateFieldDefinition(field.itemDefinition, `${path}[]`);
    }
}

/**
 * 功能：校验带类型的说明文本。
 * @param description 原始说明。
 * @param path 当前路径。
 * @returns 无返回值。
 */
function validateDescription(description: unknown, path: string): void {
    if (!normalizeText(description)) {
        throw new Error(`AI JSON 说明 ${path} 不能为空`);
    }
}

/**
 * 功能：判断值是否为普通对象。
 * @param value 待判断值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is MutableRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：归一化文本。
 * @param value 原始值。
 * @returns 归一化后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：归一化可比较值。
 * @param value 原始值。
 * @returns 可比较文本。
 */
function normalizeCompareValue(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim().toLowerCase();
    }
    if (Array.isArray(value)) {
        return JSON.stringify(value.map((item: unknown): string => normalizeCompareValue(item)));
    }
    if (isRecord(value)) {
        const ordered = Object.keys(value).sort().reduce<MutableRecord>((result: MutableRecord, key: string): MutableRecord => {
            result[key] = normalizeCompareValue(value[key]);
            return result;
        }, {});
        return JSON.stringify(ordered);
    }
    if (value == null) {
        return '';
    }
    return String(value).trim().toLowerCase();
}

/**
 * 功能：深拷贝可序列化值。
 * @param value 原始值。
 * @returns 拷贝后的值。
 */
function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item: unknown): unknown => cloneValue(item)) as T;
    }
    if (isRecord(value)) {
        return Object.entries(value).reduce<MutableRecord>((result: MutableRecord, [key, item]: [string, unknown]): MutableRecord => {
            result[key] = cloneValue(item);
            return result;
        }, {}) as T;
    }
    return value;
}

/**
 * 功能：确保注册中心已初始化。
 * @returns 无返回值。
 */
function ensureReady(): void {
    if (!initialized) {
        initAiJsonSystem();
    }
}
