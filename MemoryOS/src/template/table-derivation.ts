import type { TemplateEntity, TemplateTableDef } from './types';

/**
 * 功能：描述用于推导表结构的最小事实形状。
 * 参数：
 *   无。
 * 返回：
 *   无。
 */
export interface TableFactShape {
    type?: string;
    path?: string;
}

/**
 * 功能：将字段键名转换为适合界面展示的标签。
 * @param value 字段或表的内部键名
 * @returns 适合显示的标签文本
 */
function formatDisplayLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '未命名';
    }
    return trimmed
        .split(/[_./-]+/)
        .filter(Boolean)
        .map((part: string): string => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

/**
 * 功能：创建单个表字段定义。
 * @param fieldKey 字段键名
 * @param primaryKeyField 主键字段名
 * @param tier 字段层级
 * @returns 规范化后的字段定义
 */
function createFieldDef(
    fieldKey: string,
    primaryKeyField: string,
    tier: 'core' | 'extension',
): TemplateTableDef['fields'][number] {
    return {
        key: fieldKey,
        label: formatDisplayLabel(fieldKey),
        tier,
        isPrimaryKey: fieldKey === primaryKeyField,
    };
}

/**
 * 功能：收集每张表在事实数据里出现过的字段。
 * @param facts 事实最小形状列表
 * @returns 表键到字段集合的映射
 */
function collectFactFields(facts: TableFactShape[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const fact of facts) {
        const tableKey = String(fact.type ?? '').trim();
        const fieldKey = String(fact.path ?? '').trim();
        if (!tableKey || !fieldKey) {
            continue;
        }
        if (!result.has(tableKey)) {
            result.set(tableKey, new Set<string>());
        }
        result.get(tableKey)?.add(fieldKey);
    }
    return result;
}

/**
 * 功能：构建单张派生表定义。
 * @param tableKey 表键
 * @param entity 模板实体定义
 * @param factFields 来自事实数据的字段集合
 * @param source 表定义来源
 * @returns 规范化后的表定义
 */
function buildDerivedTable(
    tableKey: string,
    entity: TemplateEntity | undefined,
    factFields: Set<string> | undefined,
    source: 'persisted' | 'derived',
): TemplateTableDef {
    const primaryKeyField = String(entity?.primaryKey ?? 'id').trim() || 'id';
    const orderedFieldKeys = new Set<string>();
    const fields: TemplateTableDef['fields'] = [];

    orderedFieldKeys.add(primaryKeyField);
    fields.push(createFieldDef(primaryKeyField, primaryKeyField, 'core'));

    for (const fieldKey of entity?.fields ?? []) {
        const normalizedFieldKey = String(fieldKey ?? '').trim();
        if (!normalizedFieldKey || orderedFieldKeys.has(normalizedFieldKey)) {
            continue;
        }
        orderedFieldKeys.add(normalizedFieldKey);
        fields.push(createFieldDef(normalizedFieldKey, primaryKeyField, 'core'));
    }

    for (const fieldKey of factFields ?? []) {
        const normalizedFieldKey = String(fieldKey ?? '').trim();
        if (!normalizedFieldKey || orderedFieldKeys.has(normalizedFieldKey)) {
            continue;
        }
        orderedFieldKeys.add(normalizedFieldKey);
        fields.push(createFieldDef(normalizedFieldKey, primaryKeyField, 'extension'));
    }

    return {
        key: tableKey,
        label: formatDisplayLabel(tableKey),
        isBase: false,
        primaryKeyField,
        source,
        fields,
    };
}

/**
 * 功能：根据旧版 entities 定义派生逻辑表结构。
 * @param entities 旧版实体定义
 * @param facts 当前聊天下的事实列表
 * @param source 派生结果的来源标记
 * @returns 可直接用于界面展示的表定义列表
 */
export function deriveTablesFromEntities(
    entities: Record<string, TemplateEntity>,
    facts: TableFactShape[] = [],
    source: 'persisted' | 'derived' = 'derived',
): TemplateTableDef[] {
    const safeEntities = entities ?? {};
    const factFieldsByTable = collectFactFields(facts);
    const orderedTableKeys = new Set<string>([
        ...Object.keys(safeEntities),
        ...Array.from(factFieldsByTable.keys()),
    ]);

    return Array.from(orderedTableKeys)
        .filter((tableKey: string): boolean => Boolean(String(tableKey ?? '').trim()))
        .map((tableKey: string): TemplateTableDef =>
            buildDerivedTable(tableKey, safeEntities[tableKey], factFieldsByTable.get(tableKey), source),
        );
}

/**
 * 功能：在已有模板表定义上补齐事实中出现但模板未声明的扩展字段。
 * @param tables 已持久化的模板表定义
 * @param facts 当前聊天下的事实列表
 * @param entities 旧版实体定义，用于补充缺失表
 * @returns 追加扩展字段后的表定义列表
 */
export function mergeTemplateTablesWithFacts(
    tables: TemplateTableDef[],
    facts: TableFactShape[] = [],
    entities: Record<string, TemplateEntity> = {},
): TemplateTableDef[] {
    const factFieldsByTable = collectFactFields(facts);
    const normalizedTables = (tables ?? []).map((table: TemplateTableDef): TemplateTableDef => {
        const primaryKeyField = String(table.primaryKeyField ?? 'id').trim() || 'id';
        const seenFieldKeys = new Set<string>();
        const normalizedFields: TemplateTableDef['fields'] = [];

        const pushField = (
            fieldKey: string,
            tier: 'core' | 'extension',
            label?: string,
            isPrimaryKey?: boolean,
        ): void => {
            const normalizedFieldKey = String(fieldKey ?? '').trim();
            if (!normalizedFieldKey || seenFieldKeys.has(normalizedFieldKey)) {
                return;
            }
            seenFieldKeys.add(normalizedFieldKey);
            normalizedFields.push({
                key: normalizedFieldKey,
                label: label || formatDisplayLabel(normalizedFieldKey),
                tier,
                isPrimaryKey: isPrimaryKey ?? normalizedFieldKey === primaryKeyField,
            });
        };

        pushField(primaryKeyField, 'core', formatDisplayLabel(primaryKeyField), true);

        for (const field of table.fields ?? []) {
            pushField(
                field.key,
                field.tier ?? 'core',
                field.label,
                field.isPrimaryKey,
            );
        }

        for (const factFieldKey of factFieldsByTable.get(table.key) ?? []) {
            pushField(factFieldKey, 'extension');
        }

        return {
            ...table,
            label: table.label || formatDisplayLabel(table.key),
            primaryKeyField,
            source: table.source ?? 'persisted',
            fields: normalizedFields,
        };
    });

    const existingTableKeys = new Set<string>(normalizedTables.map((table: TemplateTableDef): string => table.key));
    const extraTables = deriveTablesFromEntities(entities, facts, 'derived')
        .filter((table: TemplateTableDef): boolean => !existingTableKeys.has(table.key));

    return [...normalizedTables, ...extraTables];
}

/**
 * 功能：统一生成可展示的模板表定义。
 * @param entities 旧版实体定义
 * @param tables 持久化表定义
 * @param facts 当前聊天下的事实列表
 * @returns 兼容旧模板和新模板的表定义列表
 */
export function buildDisplayTables(
    entities: Record<string, TemplateEntity>,
    tables: TemplateTableDef[] = [],
    facts: TableFactShape[] = [],
): TemplateTableDef[] {
    if (Array.isArray(tables) && tables.length > 0) {
        return mergeTemplateTablesWithFacts(tables, facts, entities);
    }
    return deriveTablesFromEntities(entities, facts, 'derived');
}
