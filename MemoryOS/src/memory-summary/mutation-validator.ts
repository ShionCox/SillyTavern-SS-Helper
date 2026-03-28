import type { SummaryMutationAction, SummaryMutationDocument } from './mutation-types';
import { isRelationTag } from '../constants/relationTags';

/**
 * 功能：定义总结 mutation 校验结果。
 */
export interface ValidateSummaryMutationResult {
    valid: boolean;
    document: SummaryMutationDocument | null;
    errors: string[];
    warnings: string[];
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
            warnings: [],
        };
    }
    const source = rawDocument as Record<string, unknown>;
    const schemaVersion = String(source.schemaVersion ?? '').trim();
    const window = normalizeWindow(source.window);
    const actionNormalizeResult = normalizeActions(source.actions, editableFieldMap);
    const errors = [...actionNormalizeResult.errors, ...validateDocumentSafety(actionNormalizeResult.actions)];
    const warnings = [...actionNormalizeResult.warnings];
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
            warnings: dedupeStrings(warnings),
        };
    }
    const normalizedWindow = window as SummaryMutationDocument['window'];
    return {
        valid: true,
        document: {
            schemaVersion,
            window: normalizedWindow,
            actions: actionNormalizeResult.actions,
        },
        errors: [],
        warnings: dedupeStrings(warnings),
    };
}

/**
 * 功能：执行文档级安全校验。
 * @param actions 归一化后的动作列表。
 * @returns 错误列表。
 */
function validateDocumentSafety(actions: SummaryMutationAction[]): string[] {
    const errors: string[] = [];
    const deleteActions = actions.filter((action: SummaryMutationAction): boolean => action.action === 'DELETE');
    if (deleteActions.length >= 3) {
        errors.push('too_many_delete_actions');
    }
    const targetActionMap = new Map<string, Set<string>>();
    for (const action of actions) {
        const targetKey = String(action.targetId ?? action.candidateId ?? '').trim();
        if (!targetKey) {
            continue;
        }
        const bucket = targetActionMap.get(targetKey) ?? new Set<string>();
        bucket.add(action.action);
        targetActionMap.set(targetKey, bucket);
    }
    for (const [targetKey, actionSet] of targetActionMap.entries()) {
        if ((actionSet.has('DELETE') && actionSet.has('UPDATE')) || (actionSet.has('DELETE') && actionSet.has('INVALIDATE'))) {
            errors.push(`conflicting_actions_on_target:${targetKey}`);
        }
    }
    for (const action of actions) {
        const confidence = Number(action.confidence ?? 1);
        if (confidence >= 0.5) {
            continue;
        }
        if (action.action !== 'UPDATE' && action.action !== 'DELETE' && action.action !== 'INVALIDATE') {
            continue;
        }
        if (action.targetKind === 'world_core_setting' || action.targetKind === 'world_hard_rule' || action.targetKind === 'relationship') {
            errors.push(`low_confidence_high_priority_mutation:${action.targetKind}`);
        }
    }
    return dedupeStrings(errors);
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
): { actions: SummaryMutationAction[]; errors: string[]; warnings: string[] } {
    if (!Array.isArray(value)) {
        return { actions: [], errors: [], warnings: [] };
    }
    const actions: SummaryMutationAction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
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
        warnings.push(...normalized.warnings);
    }
    return {
        actions,
        errors: dedupeStrings(errors),
        warnings: dedupeStrings(warnings),
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
): { action: SummaryMutationAction | null; error?: string; errors: string[]; warnings: string[] } {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { action: null, error: 'invalid_action_type', errors: [], warnings: [] };
    }
    const row = value as Record<string, unknown>;
    const action = String(row.action ?? '').trim().toUpperCase();
    if (!ALLOWED_ACTIONS.has(action)) {
        return { action: null, error: 'invalid_action_name', errors: [], warnings: [] };
    }
    const targetKind = String(row.targetKind ?? row.type ?? '').trim();
    if (!targetKind) {
        return { action: null, error: 'missing_target_kind', errors: [], warnings: [] };
    }
    const allowedFields = editableFieldMap.get(targetKind) ?? new Set<string>();
    const rawPayload = resolveRawPayload(action, row);
    const payloadResult = sanitizePayloadByAllowedFields(rawPayload, allowedFields);
    const enumErrors = validatePayloadEnums(targetKind, payloadResult.payload);
    const semanticErrors = validateActionShape(action, row, payloadResult.payload);
    return {
        action: {
            action: action as SummaryMutationAction['action'],
            targetKind,
            type: normalizeOptionalString(row.type),
            title: normalizeOptionalString(row.title),
            reason: normalizeOptionalString(row.reason),
            confidence: normalizeOptionalNumber(row.confidence),
            targetId: normalizeOptionalString(row.targetId),
            sourceIds: dedupeStrings(Array.isArray(row.sourceIds) ? (row.sourceIds as string[]) : []),
            candidateId: normalizeOptionalString(row.candidateId),
            compareKey: normalizeOptionalString(row.compareKey),
            patch: toPlainRecord(row.patch),
            newRecord: toPlainRecord(row.newRecord),
            payload: payloadResult.payload,
            reasonCodes: dedupeStrings(Array.isArray(row.reasonCodes) ? (row.reasonCodes as string[]) : []),
        },
        errors: [
            ...enumErrors,
            ...semanticErrors,
        ],
        // payload_field_not_allowed 降级为警告：因 strict JSON schema 不支持 anyOf/oneOf，
        // 所有类型的可写字段被合并到统一 payload schema，AI 不可避免使用跨类型字段。
        // sanitizePayloadByAllowedFields 已将不属于当前 targetKind 的字段从 payload 移除，
        // 仅作为 warning 输出以便诊断与 prompt 调优。
        warnings: payloadResult.errors.map((path): string => `payload_field_not_allowed:${targetKind}:${path}`),
    };
}

/**
 * 功能：解析 action 对应的原始 payload。
 * @param action 动作名称。
 * @param row 原始 action 记录。
 * @returns 待校验的 payload。
 */
function resolveRawPayload(action: string, row: Record<string, unknown>): unknown {
    if (row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)) {
        return row.payload;
    }
    if (action === 'ADD') {
        return row.newRecord;
    }
    if (action === 'UPDATE' || action === 'MERGE' || action === 'INVALIDATE') {
        return row.patch;
    }
    return {};
}

/**
 * 功能：校验动作与字段形态是否匹配。
 * @param action 动作名称。
 * @param row 原始 action。
 * @param payload 已过滤 payload。
 * @returns 错误列表。
 */
function validateActionShape(action: string, row: Record<string, unknown>, payload: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (action === 'ADD' && Object.keys(payload).length <= 0) {
        errors.push('add_requires_new_record');
    }
    if (action === 'UPDATE' && !String(row.targetId ?? row.candidateId ?? '').trim()) {
        errors.push('update_requires_target');
    }
    if (action === 'UPDATE' && Object.keys(payload).length <= 0) {
        errors.push('update_requires_patch');
    }
    if (action === 'MERGE' && !Array.isArray(row.sourceIds)) {
        errors.push('merge_requires_source_ids');
    }
    if (action === 'INVALIDATE' && !String(row.targetId ?? row.candidateId ?? '').trim()) {
        errors.push('invalidate_requires_target');
    }
    if (action === 'DELETE' && !String(row.targetId ?? row.candidateId ?? '').trim()) {
        errors.push('delete_requires_target');
    }
    if (action === 'NOOP' && Object.keys(payload).length > 0) {
        errors.push('noop_payload_should_be_empty');
    }
    return errors;
}

/**
 * 功能：校验 payload 中的枚举字段是否合法。
 * @param targetKind 目标 schemaId。
 * @param payload 已过滤的 payload。
 * @returns 错误列表。
 */
function validatePayloadEnums(targetKind: string, payload: Record<string, unknown>): string[] {
    const errors: string[] = [];
    if (String(targetKind ?? '').trim() !== 'relationship') {
        return errors;
    }
    const relationTag = flattenRecord(payload)['fields.relationTag'];
    if (relationTag !== undefined && !isRelationTag(relationTag)) {
        errors.push(`payload_field_invalid_enum:${targetKind}:fields.relationTag`);
    }
    return errors;
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
 * 功能：归一化可选数字。
 * @param value 原始值。
 * @returns 归一化结果。
 */
function normalizeOptionalNumber(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return undefined;
    }
    return clampNumber(numeric);
}

/**
 * 功能：将未知值安全转为普通对象。
 * @param value 原始值。
 * @returns 普通对象。
 */
function toPlainRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value as Record<string, unknown>;
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
