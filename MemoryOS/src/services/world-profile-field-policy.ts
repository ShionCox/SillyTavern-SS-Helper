/**
 * 功能：定义世界画像字段策略输入。
 */
export interface WorldProfileFieldPolicy {
    profileId: string;
    preferredSchemas: string[];
    suppressedTypes: string[];
    fieldExtensions: Record<string, string[]>;
}

/**
 * 功能：定义字段策略归一化输入。
 */
export interface ApplyWorldProfileFieldPolicyInput {
    schemaId: string;
    fields?: Record<string, unknown>;
    reasonCodes?: string[];
    policy?: WorldProfileFieldPolicy | null;
}

/**
 * 功能：定义字段策略归一化结果。
 */
export interface ApplyWorldProfileFieldPolicyResult {
    fields: Record<string, unknown>;
    reasonCodes: string[];
    missingFields: string[];
    suppressed: boolean;
    preferred: boolean;
}

/**
 * 功能：按世界画像策略规范化结构化字段，并补充原因码。
 * @param input 归一化输入。
 * @returns 归一化结果。
 */
export function applyWorldProfileFieldPolicy(input: ApplyWorldProfileFieldPolicyInput): ApplyWorldProfileFieldPolicyResult {
    const schemaId = normalizeText(input.schemaId);
    const fields = toRecord(input.fields);
    const reasonCodes = dedupeStrings(input.reasonCodes ?? []);
    const policy = input.policy ?? null;
    if (!schemaId || !policy) {
        return {
            fields,
            reasonCodes,
            missingFields: [],
            suppressed: false,
            preferred: false,
        };
    }
    const expectedFields = dedupeStrings(policy.fieldExtensions[schemaId] ?? []);
    const missingFields: string[] = [];
    const normalizedFields: Record<string, unknown> = { ...fields };
    for (const fieldName of expectedFields) {
        const currentValue = normalizedFields[fieldName];
        if (isFieldValueMissing(currentValue)) {
            normalizedFields[fieldName] = '';
            missingFields.push(fieldName);
        }
    }
    const preferred = policy.preferredSchemas.includes(schemaId);
    const suppressed = policy.suppressedTypes.includes(schemaId);
    return {
        fields: normalizedFields,
        reasonCodes: dedupeStrings([
            ...reasonCodes,
            `world_profile:${policy.profileId}`,
            preferred ? `preferred_schema:${schemaId}` : '',
            suppressed ? `suppressed_schema:${schemaId}` : '',
            ...missingFields.map((fieldName: string): string => `missing_profile_field:${schemaId}.${fieldName}`),
        ]),
        missingFields,
        suppressed,
        preferred,
    };
}

/**
 * 功能：从世界策略说明中提取字段策略输入。
 * @param explanation 世界策略说明。
 * @returns 字段策略对象。
 */
export function buildWorldProfileFieldPolicy(explanation: {
    profileId: string;
    preferredSchemas: string[];
    suppressedTypes: string[];
    fieldExtensions: Record<string, string[]>;
} | null | undefined): WorldProfileFieldPolicy | null {
    if (!explanation?.profileId) {
        return null;
    }
    return {
        profileId: normalizeText(explanation.profileId),
        preferredSchemas: dedupeStrings(explanation.preferredSchemas ?? []),
        suppressedTypes: dedupeStrings(explanation.suppressedTypes ?? []),
        fieldExtensions: normalizeFieldExtensions(explanation.fieldExtensions),
    };
}

/**
 * 功能：归一化扩展字段映射。
 * @param value 原始映射。
 * @returns 归一化结果。
 */
function normalizeFieldExtensions(value: Record<string, string[]> | undefined): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [schemaId, fields] of Object.entries(value ?? {})) {
        const normalizedSchemaId = normalizeText(schemaId);
        if (!normalizedSchemaId) {
            continue;
        }
        result[normalizedSchemaId] = dedupeStrings(fields ?? []);
    }
    return result;
}

/**
 * 功能：判断字段值是否为空。
 * @param value 原始值。
 * @returns 是否为空。
 */
function isFieldValueMissing(value: unknown): boolean {
    if (value === null || value === undefined) {
        return true;
    }
    if (typeof value === 'string') {
        return !value.trim();
    }
    if (Array.isArray(value)) {
        return value.length <= 0;
    }
    return false;
}

/**
 * 功能：转成普通对象。
 * @param value 原始值。
 * @returns 对象结果。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 原始数组。
 * @returns 处理结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：归一化普通文本。
 * @param value 原始值。
 * @returns 文本结果。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}
