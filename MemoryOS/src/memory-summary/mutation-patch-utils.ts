/**
 * 功能：Summary patch 工具集。
 *
 * 本模块为新架构"稀疏 patch apply"主链提供：
 * - validateSummaryPatch：patch 合法性校验
 * - normalizeSummaryPatch：patch 规范化（去除无效字段、补齐默认值）
 * - applySummaryPatch：将 patch 应用到旧 state，未变化字段由旧值保留
 *
 * 设计原则：
 * - LLM 仅输出变化字段，未变化字段不要求模型重复生成
 * - patch 体积显著低于完整 state
 * - 相同输入下 patch 应用结果稳定
 * - patch 应用失败可回退到旧状态
 */

import type { SummaryMutationAction } from './mutation-types';

// ─── patch 校验 ────────────────────────────────────────

/**
 * 功能：定义 patch 校验结果。
 */
export interface SummaryPatchValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/** patch 中允许出现的 action 类型。 */
const VALID_PATCH_ACTIONS = new Set(['ADD', 'MERGE', 'UPDATE', 'INVALIDATE', 'DELETE', 'NOOP']);

/** 不允许为空的关键字段。 */
const NON_EMPTY_REQUIRED_KEYS = new Set(['action', 'targetKind']);

/**
 * 功能：校验 summary patch 是否合法。
 * 验证规则：
 * - action 必须是合法类型
 * - targetKind 不得为空
 * - patch/payload 必须是对象（若存在）
 * - 不允许出现完整旧 state 副本（通过体积阈值检测）
 * @param actions 待校验的 patch 动作列表。
 * @returns 校验结果。
 */
export function validateSummaryPatch(actions: SummaryMutationAction[]): SummaryPatchValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(actions) || actions.length <= 0) {
        return { valid: false, errors: ['empty_patch_actions'], warnings };
    }

    for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        if (!action || typeof action !== 'object') {
            errors.push(`invalid_action_at_index:${i}`);
            continue;
        }
        if (!VALID_PATCH_ACTIONS.has(action.action)) {
            errors.push(`invalid_action_type:${action.action}`);
        }
        for (const key of NON_EMPTY_REQUIRED_KEYS) {
            const value = (action as unknown as Record<string, unknown>)[key];
            if (!value || !String(value).trim()) {
                errors.push(`empty_required_field:${key}:index_${i}`);
            }
        }
        // 校验 patch / payload 字段格式
        const patchPayload = action.patch ?? action.payload ?? action.newRecord;
        if (patchPayload !== undefined && patchPayload !== null) {
            if (typeof patchPayload !== 'object' || Array.isArray(patchPayload)) {
                errors.push(`invalid_patch_payload_type:index_${i}`);
            } else {
                // 检测 patch 是否过大（可能是完整 state 副本）
                const payloadSize = JSON.stringify(patchPayload).length;
                if (payloadSize > 4000) {
                    warnings.push(`large_patch_payload:index_${i}:${payloadSize}chars`);
                }
            }
        }
        // NOOP 不应有实质 payload
        if (action.action === 'NOOP' && patchPayload && Object.keys(patchPayload as object).length > 0) {
            warnings.push(`noop_with_payload:index_${i}`);
        }
    }

    return {
        valid: errors.length <= 0,
        errors: dedupeStrings(errors),
        warnings: dedupeStrings(warnings),
    };
}

// ─── patch 规范化 ────────────────────────────────────────

/**
 * 功能：规范化 summary patch（去除无效字段、保留有效变更、过滤非法值）。
 * @param actions 原始 patch 动作列表。
 * @param allowedFields 允许的字段白名单（可选）。
 * @returns 规范化后的动作列表。
 */
export function normalizeSummaryPatch(
    actions: SummaryMutationAction[],
    allowedFields?: Set<string>,
): SummaryMutationAction[] {
    if (!Array.isArray(actions)) {
        return [];
    }
    return actions
        .filter((action): action is SummaryMutationAction => {
            if (!action || typeof action !== 'object') return false;
            if (!VALID_PATCH_ACTIONS.has(action.action)) return false;
            if (!String(action.targetKind ?? '').trim()) return false;
            return true;
        })
        .map((action): SummaryMutationAction => {
            const patchPayload = action.patch ?? action.payload ?? action.newRecord;
            const normalizedPayload = patchPayload && typeof patchPayload === 'object' && !Array.isArray(patchPayload)
                ? filterPatchFields(patchPayload as Record<string, unknown>, allowedFields)
                : undefined;
            const normalizedAction = String(action.action ?? '').trim().toUpperCase();

            const baseAction: SummaryMutationAction = {
                action: normalizedAction as SummaryMutationAction['action'],
                targetKind: String(action.targetKind ?? '').trim(),
                ...(action.type ? { type: String(action.type).trim() } : {}),
                ...(action.title ? { title: String(action.title).trim() } : {}),
                ...(action.reason ? { reason: String(action.reason).trim() } : {}),
                ...(action.confidence !== undefined ? { confidence: clampConfidence(action.confidence) } : {}),
                ...(action.memoryValue ? { memoryValue: action.memoryValue } : {}),
                ...(action.sourceEvidence ? { sourceEvidence: action.sourceEvidence } : {}),
                ...(action.targetRef ? { targetRef: String(action.targetRef).trim() } : {}),
                ...(action.sourceRefs ? { sourceRefs: dedupeStrings(action.sourceRefs) } : {}),
                ...(action.targetId ? { targetId: String(action.targetId).trim() } : {}),
                ...(action.sourceIds ? { sourceIds: action.sourceIds } : {}),
                ...(action.candidateId ? { candidateId: String(action.candidateId).trim() } : {}),
                ...(action.keySeed ? { keySeed: action.keySeed } : {}),
                ...(action.entityKey ? { entityKey: String(action.entityKey).trim() } : {}),
                ...(action.compareKey ? { compareKey: String(action.compareKey).trim() } : {}),
                ...(action.matchKeys ? { matchKeys: dedupeStrings(action.matchKeys) } : {}),
                ...(action.reasonCodes ? { reasonCodes: dedupeStrings(action.reasonCodes) } : {}),
            };

            if (!normalizedPayload || Object.keys(normalizedPayload).length <= 0) {
                return baseAction;
            }
            if (normalizedAction === 'ADD') {
                return {
                    ...baseAction,
                    newRecord: normalizedPayload,
                };
            }
            if (normalizedAction === 'UPDATE' || normalizedAction === 'MERGE' || normalizedAction === 'INVALIDATE') {
                return {
                    ...baseAction,
                    patch: normalizedPayload,
                };
            }
            return baseAction;
        });
}

// ─── patch 应用 ────────────────────────────────────────

/**
 * 功能：将稀疏 patch 应用到旧 state，未变化字段完全由旧 state 保留。
 *
 * 策略：
 * - 标量字段：patch 值覆盖旧值
 * - 数组字段：patch 值替换旧值（不做追加）
 * - 嵌套对象：递归 patch
 * - 未出现在 patch 中的字段：保持旧值不变
 *
 * @param oldState 旧 state（完整对象）。
 * @param patch 稀疏 patch（仅包含变化字段）。
 * @returns 合并后的新 state。
 */
export function applySummaryPatch<T extends Record<string, unknown>>(
    oldState: T,
    patch: Record<string, unknown>,
): T {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return oldState;
    }
    if (!oldState || typeof oldState !== 'object' || Array.isArray(oldState)) {
        return { ...patch } as T;
    }

    const result = { ...oldState };

    for (const [key, patchValue] of Object.entries(patch)) {
        if (patchValue === undefined) {
            continue;
        }
        if (patchValue === null) {
            // null 表示显式删除
            delete (result as Record<string, unknown>)[key];
            continue;
        }
        const oldValue = (result as Record<string, unknown>)[key];
        // 嵌套对象递归 patch
        if (
            typeof patchValue === 'object'
            && !Array.isArray(patchValue)
            && typeof oldValue === 'object'
            && oldValue !== null
            && !Array.isArray(oldValue)
        ) {
            (result as Record<string, unknown>)[key] = applySummaryPatch(
                oldValue as Record<string, unknown>,
                patchValue as Record<string, unknown>,
            );
        } else {
            // 标量或数组直接覆盖
            (result as Record<string, unknown>)[key] = patchValue;
        }
    }

    return result;
}

// ─── 辅助函数 ──────────────────────────────────────

/**
 * 功能：过滤 patch 字段，仅保留白名单内的字段。
 */
function filterPatchFields(
    payload: Record<string, unknown>,
    allowedFields?: Set<string>,
): Record<string, unknown> {
    if (!allowedFields || allowedFields.size <= 0) {
        return payload;
    }
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (allowedFields.has(key) || key === 'fields') {
            filtered[key] = value;
        }
    }
    return filtered;
}

/**
 * 功能：将置信度限制在 [0, 1] 范围内。
 */
function clampConfidence(value: unknown): number {
    const num = Number(value ?? 0);
    return Math.max(0, Math.min(1, Number.isFinite(num) ? num : 0));
}

/**
 * 功能：去重字符串列表。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
