import type { SummaryMutationAction, SummaryMutationDocument } from './mutation-types';

/**
 * 功能：定义总结 mutation 校验结果。
 */
export interface ValidateSummaryMutationResult {
    valid: boolean;
    document: SummaryMutationDocument | null;
    errors: string[];
}

/**
 * 功能：定义字段白名单映射。
 */
export type EditableFieldMap = Map<string, Set<string>>;

const ALLOWED_ACTIONS = new Set(['ADD', 'MERGE', 'UPDATE', 'INVALIDATE', 'DELETE', 'NOOP']);

/**
 * 功能：校验并归一化总结 mutation 文档。
 * @param rawDocument 原始文档。
 * @param editableFieldMap 字段白名单映射。
 * @returns 校验结果。
 */
export function validateSummaryMutationDocument(
    rawDocument: unknown,
    editableFieldMap: EditableFieldMap,
): ValidateSummaryMutationResult {
    if (!rawDocument || typeof rawDocument !== 'object' || Array.isArray(rawDocument)) {
        return {
            valid: false,
            document: null,
            errors: ['invalid_document_type'],
        };
    }
    const source = rawDocument as Record<string, unknown>;
    const schemaVersion = String(source.schemaVersion ?? '').trim();
    const window = normalizeWindow(source.window);
    const actionNormalizeResult = normalizeActions(source.actions, editableFieldMap);
    const errors = [...actionNormalizeResult.errors];
    if (!schemaVersion) {
        errors.push('missing_schema_version');
    }
    if (!window) {
        errors.push('invalid_window');
    }
    if (actionNormalizeResult.actions.length <= 0) {
        errors.push('missing_actions');
    }
    if (errors.length > 0) {
        return {
            valid: false,
            document: null,
            errors: dedupeStrings(errors),
        };
    }
    return {
        valid: true,
        document: {
            schemaVersion,
            window,
            actions: actionNormalizeResult.actions,
        },
        errors: [],
    };
}

/**
 * 功能：归一化 mutation 窗口。
 * @param value 原始窗口。
 * @returns 归一化窗口，不合法时返回 null。
 */
function normalizeWindow(value: unknown): SummaryMutationDocument['window'] | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const record = value as Record<string, unknown>;
    const fromTurn = Math.max(0, Math.floor(Number(record.fromTurn) || 0));
    const toTurn = Math.max(fromTurn, Math.floor(Number(record.toTurn) || 0));
    return {
        fromTurn,
        toTurn,
    };
}

/**
 * 功能：归一化 mutation action 列表。
 * @param value 原始 action 列表。
 * @param editableFieldMap 字段白名单映射。
 * @returns 归一化 action 列表与错误集合。
 */
function normalizeActions(
    value: unknown,
    editableFieldMap: EditableFieldMap,
): { actions: SummaryMutationAction[]; errors: string[] } {
    if (!Array.isArray(value)) {
        return { actions: [], errors: [] };
    }
    const actions: SummaryMutationAction[] = [];
    const errors: string[] = [];
    for (const row of value) {
        const normalized = normalizeAction(row, editableFieldMap);
        if (!normalized.action) {
            if (normalized.error) {
                errors.push(normalized.error);
            }
            continue;
        }
        actions.push(normalized.action);
        errors.push(...normalized.errors);
    }
    return {
        actions,
        errors: dedupeStrings(errors),
    };
}

/**
 * 功能：归一化单个 action。
 * @param value 原始 action。
 * @param editableFieldMap 字段白名单映射。
 * @returns 归一化结果。
 */
function normalizeAction(
    value: unknown,
    editableFieldMap: EditableFieldMap,
): { action: SummaryMutationAction | null; error?: string; errors: string[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { action: null, error: 'invalid_action_type', errors: [] };
    }
    const row = value as Record<string, unknown>;
    const action = String(row.action ?? '').trim().toUpperCase();
    if (!ALLOWED_ACTIONS.has(action)) {
        return { action: null, error: 'invalid_action_name', errors: [] };
    }
    const targetKind = String(row.targetKind ?? '').trim();
    if (!targetKind) {
        return { action: null, error: 'missing_target_kind', errors: [] };
    }
    const allowedFields = editableFieldMap.get(targetKind) ?? new Set<string>();
    const payloadResult = sanitizePayloadByAllowedFields(row.payload, allowedFields);
    return {
        action: {
            action: action as SummaryMutationAction['action'],
            targetKind,
            candidateId: normalizeOptionalString(row.candidateId),
            compareKey: normalizeOptionalString(row.compareKey),
            payload: payloadResult.payload,
            reasonCodes: dedupeStrings(Array.isArray(row.reasonCodes) ? (row.reasonCodes as string[]) : []),
        },
        errors: payloadResult.errors.map((path): string => `payload_field_not_allowed:${targetKind}:${path}`),
    };
}

/**
 * 功能：按字段白名单清理 payload。
 * @param value 原始 payload。
 * @param allowedFields 允许字段集合。
 * @returns 清理后的 payload 与错误列表。
 */
function sanitizePayloadByAllowedFields(
    value: unknown,
    allowedFields: Set<string>,
): { payload: Record<string, unknown>; errors: string[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { payload: {}, errors: [] };
    }
    const source = value as Record<string, unknown>;
    if (allowedFields.size <= 0) {
        return { payload: {}, errors: Object.keys(flattenRecord(source)) };
    }
    const flattened = flattenRecord(source);
    const filtered: Record<string, unknown> = {};
    const errors: string[] = [];
    for (const [path, pathValue] of Object.entries(flattened)) {
        if (!allowedFields.has(path)) {
            errors.push(path);
            continue;
        }
        setPathValue(filtered, path, pathValue);
    }
    return {
        payload: clampNumericFields(filtered),
        errors: dedupeStrings(errors),
    };
}

/**
 * 功能：把对象拍平为 path -> value。
 * @param value 对象。
 * @param path 当前路径。
 * @returns 拍平映射。
 */
function flattenRecord(value: Record<string, unknown>, path: string = ''): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, rowValue] of Object.entries(value)) {
        const nextPath = path ? `${path}.${key}` : key;
        if (rowValue && typeof rowValue === 'object' && !Array.isArray(rowValue)) {
            Object.assign(out, flattenRecord(rowValue as Record<string, unknown>, nextPath));
        } else {
            out[nextPath] = rowValue;
        }
    }
    return out;
}

/**
 * 功能：按 path 写入对象。
 * @param target 目标对象。
 * @param path path。
 * @param value 值。
 */
function setPathValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const steps = String(path ?? '').split('.').filter(Boolean);
    if (steps.length <= 0) {
        return;
    }
    let cursor: Record<string, unknown> = target;
    for (let index = 0; index < steps.length - 1; index += 1) {
        const key = steps[index];
        const next = cursor[key];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
            cursor[key] = {};
        }
        cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[steps[steps.length - 1]] = value;
}

/**
 * 功能：对 payload 中所有数值执行 clamp。
 * @param value 原始对象。
 * @returns clamp 后对象。
 */
function clampNumericFields(value: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'number') {
            out[key] = clampNumber(item);
            continue;
        }
        if (Array.isArray(item)) {
            out[key] = dedupeArray(item.map((row: unknown): unknown => {
                return typeof row === 'number' ? clampNumber(row) : row;
            }));
            continue;
        }
        if (item && typeof item === 'object') {
            out[key] = clampNumericFields(item as Record<string, unknown>);
            continue;
        }
        out[key] = item;
    }
    return out;
}

/**
 * 功能：限制数值范围并处理非法值。
 * @param value 原始值。
 * @returns 限制后的数值。
 */
function clampNumber(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(-1_000_000, Math.min(1_000_000, Number(numeric.toFixed(6))));
}

/**
 * 功能：归一化可选字符串。
 * @param value 原始值。
 * @returns 归一化值。
 */
function normalizeOptionalString(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized || undefined;
}

/**
 * 功能：字符串数组去重。
 * @param values 输入值。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const merged: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

/**
 * 功能：数组去重。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function dedupeArray(values: unknown[]): unknown[] {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const value of values) {
        const key = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : JSON.stringify(value);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        out.push(value);
    }
    return out;
}
