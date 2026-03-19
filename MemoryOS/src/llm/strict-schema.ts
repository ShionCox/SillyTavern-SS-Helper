export type JsonSchemaProperty = Record<string, unknown>;
export type JsonSchemaProperties = Record<string, JsonSchemaProperty>;

/**
 * 功能：构建严格对象 Schema，默认要求所有属性都出现在 required 中。
 * @param properties 对象属性定义。
 * @param required 可选的 required 列表；未提供时自动使用全部属性键名。
 * @returns 严格对象 Schema。
 */
export function buildStrictObjectSchema(
    properties: JsonSchemaProperties,
    required?: string[],
): {
    type: 'object';
    additionalProperties: false;
    required: string[];
    properties: JsonSchemaProperties;
} {
    return {
        type: 'object',
        additionalProperties: false,
        required: Array.isArray(required) && required.length > 0 ? required : Object.keys(properties),
        properties,
    };
}

/**
 * 功能：构建可空字符串字段 Schema。
 * @returns 可空字符串 Schema。
 */
export function nullableStringSchema(): JsonSchemaProperty {
    return { type: ['string', 'null'] };
}

/**
 * 功能：构建可空字符串数组字段 Schema。
 * @returns 可空字符串数组 Schema。
 */
export function nullableStringArraySchema(): JsonSchemaProperty {
    return { type: ['array', 'null'], items: { type: 'string' } };
}

/**
 * 功能：构建可空字符串枚举字段 Schema。
 * @param values 字符串枚举值。
 * @returns 可空枚举 Schema。
 */
export function nullableEnumStringSchema(values: readonly string[]): JsonSchemaProperty {
    return {
        type: ['string', 'null'],
        enum: [...values, null],
    };
}
