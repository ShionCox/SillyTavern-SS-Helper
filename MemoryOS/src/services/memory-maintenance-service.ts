/**
 * 功能：维护治理服务。
 * 说明：在向量系统上线前，先让长期记忆库进入"可维护状态"。
 *       提供：重复检测、compareKey 冲突检测、低价值压缩标记、检索访问统计、trace 归档。
 */

import type { RetrievalCandidate } from '../memory-retrieval/types';
import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import { computeNGramSimilarity, computeRecencyWeight } from '../memory-retrieval/scoring';

/**
 * 功能：维护报告。
 */
export interface MaintenanceReport {
    /** 报告生成时间 */
    generatedAt: number;
    /** 重复候选组 */
    duplicateGroups: DuplicateGroup[];
    /** compareKey 冲突 */
    compareKeyConflicts: CompareKeyConflict[];
    /** 低价值压缩候选 */
    lowValueCandidates: LowValueCandidate[];
    /** 检索访问统计 */
    accessStatistics: AccessStatistics | null;
    /** 审计追踪 */
    auditTrace: MaintenanceAuditEntry[];
}

/**
 * 功能：重复候选组。
 */
export interface DuplicateGroup {
    /** 主条目 ID */
    primaryEntryId: string;
    /** 重复条目 ID 列表 */
    duplicateEntryIds: string[];
    /** 相似度分数 */
    similarity: number;
    /** 判定原因 */
    reason: 'compareKey_match' | 'ngram_similarity' | 'title_match';
}

/**
 * 功能：compareKey 冲突。
 */
export interface CompareKeyConflict {
    /** 冲突的 compareKey */
    compareKey: string;
    /** 涉及的条目 ID */
    entryIds: string[];
    /** schema 类型 */
    schemaIds: string[];
}

/**
 * 功能：低价值压缩候选。
 */
export interface LowValueCandidate {
    /** 条目 ID */
    entryId: string;
    /** 低价值原因 */
    reason: string;
    /** 当前 memoryPercent */
    memoryPercent: number;
    /** 距今时间权重 */
    recencyWeight: number;
    /** 综合价值评分 */
    valueScore: number;
}

/**
 * 功能：检索访问统计。
 */
export interface AccessStatistics {
    /** 统计时间 */
    computedAt: number;
    /** 总 trace 条数 */
    totalTraceCount: number;
    /** 各阶段命中次数 */
    stageCounts: Record<string, number>;
    /** 高频命中候选 ID（前 10） */
    topHitCandidateIds: string[];
}

/**
 * 功能：维护审计日志条目。
 */
export interface MaintenanceAuditEntry {
    ts: number;
    action: string;
    detail: string;
}

/**
 * 功能：维护治理服务。
 */
export class MemoryMaintenanceService {
    /**
     * 功能：执行完整维护扫描。
     * @param candidates 候选记录。
     * @param traceRecords 检索 trace 日志。
     * @returns 维护报告。
     */
    public runFullScan(
        candidates: RetrievalCandidate[],
        traceRecords?: MemoryDebugLogRecord[],
    ): MaintenanceReport {
        const auditTrace: MaintenanceAuditEntry[] = [];
        auditTrace.push({
            ts: Date.now(),
            action: 'start',
            detail: `开始维护扫描，候选数量：${candidates.length}。`,
        });

        const duplicateGroups = this.detectDuplicates(candidates, auditTrace);
        const compareKeyConflicts = this.detectCompareKeyConflicts(candidates, auditTrace);
        const lowValueCandidates = this.markLowValueForCompression(candidates, auditTrace);
        const accessStatistics = traceRecords ? this.buildAccessStatistics(traceRecords, auditTrace) : null;

        auditTrace.push({
            ts: Date.now(),
            action: 'complete',
            detail: `扫描完成：${duplicateGroups.length} 组重复、${compareKeyConflicts.length} 个冲突、${lowValueCandidates.length} 条低价值。`,
        });

        return {
            generatedAt: Date.now(),
            duplicateGroups,
            compareKeyConflicts,
            lowValueCandidates,
            accessStatistics,
            auditTrace,
        };
    }

    /**
     * 功能：检测重复候选。
     * @param candidates 候选记录。
     * @param auditTrace 审计追踪。
     * @returns 重复候选组。
     */
    public detectDuplicates(
        candidates: RetrievalCandidate[],
        auditTrace?: MaintenanceAuditEntry[],
    ): DuplicateGroup[] {
        const groups: DuplicateGroup[] = [];
        const processed = new Set<string>();

        const compareKeyMap = new Map<string, RetrievalCandidate[]>();
        for (const c of candidates) {
            if (c.compareKey) {
                const list = compareKeyMap.get(c.compareKey) ?? [];
                list.push(c);
                compareKeyMap.set(c.compareKey, list);
            }
        }
        for (const [compareKey, items] of compareKeyMap) {
            if (items.length >= 2) {
                const primary = items[0];
                const duplicates = items.slice(1);
                groups.push({
                    primaryEntryId: primary.entryId,
                    duplicateEntryIds: duplicates.map((c) => c.entryId),
                    similarity: 1.0,
                    reason: 'compareKey_match',
                });
                for (const c of items) {
                    processed.add(c.entryId);
                }
            }
        }

        const unprocessed = candidates.filter((c) => !processed.has(c.entryId));
        const SIMILARITY_THRESHOLD = 0.85;

        for (let i = 0; i < unprocessed.length; i += 1) {
            if (processed.has(unprocessed[i].entryId)) {
                continue;
            }
            const textA = `${unprocessed[i].title} ${unprocessed[i].summary}`;
            const duplicateIds: string[] = [];
            let maxSim = 0;

            for (let j = i + 1; j < unprocessed.length; j += 1) {
                if (processed.has(unprocessed[j].entryId)) {
                    continue;
                }
                const textB = `${unprocessed[j].title} ${unprocessed[j].summary}`;
                const similarity = computeNGramSimilarity(textA, textB);
                if (similarity >= SIMILARITY_THRESHOLD) {
                    duplicateIds.push(unprocessed[j].entryId);
                    processed.add(unprocessed[j].entryId);
                    maxSim = Math.max(maxSim, similarity);
                }
            }

            if (duplicateIds.length > 0) {
                groups.push({
                    primaryEntryId: unprocessed[i].entryId,
                    duplicateEntryIds: duplicateIds,
                    similarity: maxSim,
                    reason: 'ngram_similarity',
                });
                processed.add(unprocessed[i].entryId);
            }
        }

        auditTrace?.push({
            ts: Date.now(),
            action: 'detect_duplicates',
            detail: `检测到 ${groups.length} 组重复候选。`,
        });

        return groups;
    }

    /**
     * 功能：检测 compareKey 冲突。
     * @param candidates 候选记录。
     * @param auditTrace 审计追踪。
     * @returns 冲突列表。
     */
    public detectCompareKeyConflicts(
        candidates: RetrievalCandidate[],
        auditTrace?: MaintenanceAuditEntry[],
    ): CompareKeyConflict[] {
        const conflicts: CompareKeyConflict[] = [];
        const keyMap = new Map<string, { entryIds: string[]; schemaIds: Set<string> }>();

        for (const c of candidates) {
            if (!c.compareKey) {
                continue;
            }
            const entry = keyMap.get(c.compareKey) ?? { entryIds: [], schemaIds: new Set() };
            entry.entryIds.push(c.entryId);
            entry.schemaIds.add(c.schemaId);
            keyMap.set(c.compareKey, entry);
        }

        for (const [compareKey, entry] of keyMap) {
            if (entry.schemaIds.size >= 2) {
                conflicts.push({
                    compareKey,
                    entryIds: entry.entryIds,
                    schemaIds: Array.from(entry.schemaIds),
                });
            }
        }

        auditTrace?.push({
            ts: Date.now(),
            action: 'detect_conflicts',
            detail: `检测到 ${conflicts.length} 个 compareKey 跨 schema 冲突。`,
        });

        return conflicts;
    }

    /**
     * 功能：标记低价值旧条目为待压缩。
     * @param candidates 候选记录。
     * @param auditTrace 审计追踪。
     * @returns 低价值候选列表。
     */
    public markLowValueForCompression(
        candidates: RetrievalCandidate[],
        auditTrace?: MaintenanceAuditEntry[],
    ): LowValueCandidate[] {
        const LOW_VALUE_THRESHOLD = 0.25;
        const lowValues: LowValueCandidate[] = [];

        for (const c of candidates) {
            const memoryFactor = (c.memoryPercent ?? 0) / 100;
            const recency = computeRecencyWeight(c.updatedAt);
            const valueScore = memoryFactor * 0.6 + recency * 0.4;

            if (valueScore < LOW_VALUE_THRESHOLD) {
                const reasons: string[] = [];
                if (memoryFactor < 0.3) {
                    reasons.push(`记忆度过低(${c.memoryPercent}%)`);
                }
                if (recency < 0.2) {
                    reasons.push(`长期未更新(权重${recency.toFixed(2)})`);
                }
                lowValues.push({
                    entryId: c.entryId,
                    reason: reasons.join('、') || '综合价值评分低',
                    memoryPercent: c.memoryPercent,
                    recencyWeight: recency,
                    valueScore,
                });
            }
        }

        lowValues.sort((a, b) => a.valueScore - b.valueScore);

        auditTrace?.push({
            ts: Date.now(),
            action: 'mark_low_value',
            detail: `标记 ${lowValues.length} 条低价值条目为待压缩。`,
        });

        return lowValues;
    }

    /**
     * 功能：构建检索访问统计。
     * @param traceRecords trace 日志。
     * @param auditTrace 审计追踪。
     * @returns 访问统计。
     */
    public buildAccessStatistics(
        traceRecords: MemoryDebugLogRecord[],
        auditTrace?: MaintenanceAuditEntry[],
    ): AccessStatistics {
        const stageCounts: Record<string, number> = {};
        const candidateHits = new Map<string, number>();

        for (const record of traceRecords) {
            const stage = record.stage ?? 'unknown';
            stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;

            const payload = record.payload as Record<string, unknown> | undefined;
            if (payload) {
                const candidateId = payload.candidateId as string | undefined;
                if (candidateId) {
                    candidateHits.set(candidateId, (candidateHits.get(candidateId) ?? 0) + 1);
                }
            }
        }

        const topHitCandidateIds = Array.from(candidateHits.entries())
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([id]) => id);

        auditTrace?.push({
            ts: Date.now(),
            action: 'access_statistics',
            detail: `统计 ${traceRecords.length} 条 trace 日志，高频候选 ${topHitCandidateIds.length} 个。`,
        });

        return {
            computedAt: Date.now(),
            totalTraceCount: traceRecords.length,
            stageCounts,
            topHitCandidateIds,
        };
    }
}
