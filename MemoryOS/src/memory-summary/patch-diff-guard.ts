import type { MemoryEntry } from '../types';
import type { SummaryCandidateRecord } from '../memory-summary-planner';
import type { SummaryMutationAction, SummaryMutationDocument } from './mutation-types';

/**
 * 功能：定义补丁差异化保护结果。
 */
export interface PatchDiffGuardResult {
    document: SummaryMutationDocument;
    diagnostics: Array<{
        action: string;
        targetKind: string;
        candidateId?: string;
        targetId?: string;
        downgradedToNoop: boolean;
        removedPaths: string[];
    }>;
}

/**
 * 功能：对模型输出的补丁执行字段级去重，确保保留真正变化字段。
 * @param document 原始 mutation 文档。
 * @param candidateRecords 候选记录列表。
 * @param getEntry 条目加载函数。
 * @returns 差异化后的文档与诊断信息。
 */
export async function applyPatchDiffGuard(
    document: SummaryMutationDocument,
    candidateRecords: SummaryCandidateRecord[],
    getEntry: (entryId: string) => Promise<MemoryEntry | null>,
): Promise<PatchDiffGuardResult> {
    const candidateIdMap = new Map(candidateRecords.map((item: SummaryCandidateRecord): [string, SummaryCandidateRecord] => [item.candidateId, item]));
    const diagnostics: PatchDiffGuardResult['diagnostics'] = [];
    const nextActions: SummaryMutationAction[] = [];

    for (const action of document.actions) {
        const actionName = String(action.action ?? '').trim().toUpperCase();
        if (actionName !== 'UPDATE' && actionName !== 'MERGE' && actionName !== 'INVALIDATE') {
            nextActions.push(action);
            continue;
        }
        const candidate = action.candidateId ? candidateIdMap.get(action.candidateId) : null;
        const targetId = String(action.targetId ?? candidate?.recordId ?? '').trim();
        if (!targetId) {
            nextActions.push(action);
            continue;
        }
        const existing = await getEntry(targetId);
        if (!existing) {
            nextActions.push(action);
            continue;
        }
        const sourcePatch = toRecord(action.patch ?? action.payload);
        const baseline = buildBaselineState(existing);
        const removedPaths: string[] = [];
        const filteredPatch = diffPatchObject(sourcePatch, baseline, '', removedPaths);
        if (Object.keys(filteredPatch).length <= 0) {
            nextActions.push({
                action: 'NOOP',
                targetKind: action.targetKind,
                candidateId: action.candidateId,
                targetId,
                compareKey: action.compareKey,
                reason: action.reason || '补丁去重后无有效变更',
                confidence: action.confidence,
                reasonCodes: dedupeStrings([...(action.reasonCodes ?? []), 'patch_diff_noop']),
            });
            diagnostics.push({
                action: actionName,
                targetKind: action.targetKind,
                candidateId: action.candidateId,
                targetId,
                downgradedToNoop: true,
                removedPaths,
            });
            continue;
        }
        nextActions.push({
            ...action,
            patch: filteredPatch,
            payload: undefined,
            newRecord: undefined,
            reasonCodes: dedupeStrings(action.reasonCodes ?? []),
        });
        diagnostics.push({
            action: actionName,
            targetKind: action.targetKind,
            candidateId: action.candidateId,
            targetId,
            downgradedToNoop: false,
            removedPaths,
        });
    }

    return {
        document: {
            ...document,
            actions: nextActions,
        },
        diagnostics,
    };
}

/**
 * 功能：构建用于补丁比对的基线状态。
 * @param entry 现有条目。
 * @returns 基线状态。
 */
function buildBaselineState(entry: MemoryEntry): Record<string, unknown> {
    const payload = toRecord(entry.detailPayload);
    return {
        ...payload,
        title: entry.title,
        summary: entry.summary,
        detail: entry.detail,
        category: entry.category,
        tags: entry.tags,
        fields: toRecord(payload.fields),
    };
}

/**
 * 功能：递归移除未变化字段。
 * @param patch 当前补丁。
 * @param baseline 基线状态。
 * @param path 当前路径。
 * @param removedPaths 被移除字段路径。
 * @returns 过滤后的补丁。
 */
function diffPatchObject(
    patch: Record<string, unknown>,
    baseline: Record<string, unknown>,
    path: string,
    removedPaths: string[],
): Record<string, unknown> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        const nextPath = path ? `${path}.${key}` : key;
        const baselineValue = baseline[key];
        if (value === undefined) {
            removedPaths.push(nextPath);
            continue;
        }
        if (value && typeof value === 'object' && !Array.isArray(value) && baselineValue && typeof baselineValue === 'object' && !Array.isArray(baselineValue)) {
            const nested = diffPatchObject(value as Record<string, unknown>, baselineValue as Record<string, unknown>, nextPath, removedPaths);
            if (Object.keys(nested).length > 0) {
                next[key] = nested;
            } else {
                removedPaths.push(nextPath);
            }
            continue;
        }
        if (isSameValue(value, baselineValue)) {
            removedPaths.push(nextPath);
            continue;
        }
        next[key] = value;
    }
    return next;
}

/**
 * 功能：判断两个值是否等价。
 * @param left 左值。
 * @param right 右值。
 * @returns 是否相同。
 */
function isSameValue(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * 功能：安全转对象。
 * @param value 原始值。
 * @returns 对象记录。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：字符串数组去重。
 * @param values 原始值。
 * @returns 去重后的字符串数组。
 */
function dedupeStrings(values: string[]): string[] {
    return Array.from(new Set((values ?? []).map((item: string): string => String(item ?? '').trim()).filter(Boolean)));
}
