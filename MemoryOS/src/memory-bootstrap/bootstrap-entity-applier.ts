import type { MemoryEntry } from '../types';
import { buildCompareKey } from '../core/compare-key';
import { isEntityLedgerType } from '../core/entity-schema';
import type { ColdStartCandidate } from './bootstrap-types';

/**
 * 功能：冷启动实体落库依赖（saveEntry 子集）。
 */
export interface EntityApplierDependencies {
    saveEntry(input: Partial<MemoryEntry> & { title: string; entryType: string }): Promise<MemoryEntry>;
}

/**
 * 功能：实体卡落库结果。
 */
export interface ApplyEntityCardResult {
    entryId: string;
    entryType: string;
    title: string;
    compareKey: string;
}

/**
 * 功能：将冷启动实体卡候选写入记忆库，确保 compareKey、fields、lifecycle 完整。
 * @param dependencies 落库依赖。
 * @param candidate 冷启动候选。
 * @returns 落库结果；非实体类型返回 null。
 */
export async function applyEntityCardCandidate(
    dependencies: EntityApplierDependencies,
    candidate: ColdStartCandidate,
): Promise<ApplyEntityCardResult | null> {
    if (!isEntityLedgerType(candidate.entryType)) {
        return null;
    }
    const payload = ensureEntityPayload(candidate);
    const saved = await dependencies.saveEntry({
        entryType: candidate.entryType,
        title: candidate.title,
        summary: candidate.summary,
        detailPayload: payload,
        tags: candidate.tags,
    });
    return {
        entryId: saved.entryId,
        entryType: candidate.entryType,
        title: candidate.title,
        compareKey: String((payload as Record<string, unknown>).compareKey ?? ''),
    };
}

/**
 * 功能：批量应用实体卡候选，返回成功落库的实体摘要。
 * @param dependencies 落库依赖。
 * @param candidates 候选列表。
 * @returns 成功落库的实体摘要列表。
 */
export async function applyEntityCardCandidates(
    dependencies: EntityApplierDependencies,
    candidates: ColdStartCandidate[],
): Promise<ApplyEntityCardResult[]> {
    const results: ApplyEntityCardResult[] = [];
    for (const candidate of candidates) {
        const result = await applyEntityCardCandidate(dependencies, candidate);
        if (result) {
            results.push(result);
        }
    }
    return results;
}

/**
 * 功能：确保实体候选的 detailPayload 包含 compareKey、lifecycle、fields。
 * @param candidate 冷启动候选。
 * @returns 完整 detailPayload。
 */
function ensureEntityPayload(candidate: ColdStartCandidate): Record<string, unknown> {
    const payload = (candidate.detailPayload && typeof candidate.detailPayload === 'object')
        ? { ...candidate.detailPayload as Record<string, unknown> }
        : {};
    if (!payload.compareKey) {
        const fields = (payload.fields && typeof payload.fields === 'object')
            ? payload.fields as Record<string, unknown>
            : {};
        payload.compareKey = buildCompareKey(candidate.entryType, candidate.title, fields);
    }
    if (!payload.lifecycle || typeof payload.lifecycle !== 'object') {
        payload.lifecycle = { status: 'active' };
    }
    return payload;
}
