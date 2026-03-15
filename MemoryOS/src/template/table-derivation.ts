import type { TemplateTableDef } from './types';

/**
 * 功能：描述用于补齐表字段的最小事实结构。
 * @param type 事实所属表键。
 * @param path 事实路径，对应字段键。
 * @returns 最小事实结构类型。
 */
export interface TableFactShape {
    type?: string;
    path?: string;
}

/**
 * 功能：将内部键名转换为适合界面展示的标签。
 * @param value 字段或表的内部键名。
 * @returns 展示标签文本。
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
 * 功能：收集事实中实际出现过的字段。
 * @param facts 事实最小结构列表。
 * @returns 表键到字段集合的映射。
 */
function collectFactFields(facts: TableFactShape[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const fact of facts) {
        const tableKey = String(fact.type ?? '').trim();
        const fieldKey = String(fact.path ?? '').trim();
        if (!tableKey || !fieldKey) {
            continue;
        }
        const bucket = result.get(tableKey) ?? new Set<string>();
        bucket.add(fieldKey);
        result.set(tableKey, bucket);
    }
    return result;
}

/**
 * 功能：补齐单张表的字段定义，确保主键存在并吸收事实中的扩展字段。
 * @param table 原始表定义。
 * @param factFields 事实中出现的字段集合。
 * @returns 规范化后的表定义。
 */
function normalizeTable(
    table: TemplateTableDef,
    factFields: Set<string> | undefined,
): TemplateTableDef {
    const primaryKeyField = String(table.primaryKeyField ?? 'id').trim() || 'id';
    const seenFieldKeys = new Set<string>();
    const fields: TemplateTableDef['fields'] = [];

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
        fields.push({
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

    for (const fieldKey of factFields ?? []) {
        pushField(fieldKey, 'extension');
    }

    return {
        ...table,
        label: table.label || formatDisplayLabel(table.key),
        primaryKeyField,
        source: table.source ?? 'persisted',
        fields,
    };
}

/**
 * 功能：构建当前模板可展示的逻辑表定义。
 * @param tables 持久化表定义。
 * @param facts 当前聊天下的事实列表。
 * @returns 用于界面展示的表定义列表。
 */
export function buildDisplayTables(
    tables: TemplateTableDef[] = [],
    facts: TableFactShape[] = [],
): TemplateTableDef[] {
    const factFieldsByTable = collectFactFields(facts);
    return (tables ?? [])
        .filter((table: TemplateTableDef): boolean => Boolean(String(table.key ?? '').trim()))
        .map((table: TemplateTableDef): TemplateTableDef =>
            normalizeTable(table, factFieldsByTable.get(table.key)),
        );
}
