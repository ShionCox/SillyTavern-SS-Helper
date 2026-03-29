/**
 * 功能：记忆修复审计日志。
 *
 * 记录每条候选片段的完整处理链路：
 * 原文 → 检测结果 → 修复方式 → 置信度 → 最终归类 → 是否进入 Planner / 摘要。
 */

import type { FragmentRepairDebugRow, FragmentRepairMetadata } from './fragment-types';

/**
 * 功能：完整修复审计记录。
 */
export interface FragmentRepairAuditRecord {
    timestamp: number;
    metadata: FragmentRepairMetadata;
    rows: FragmentRepairDebugRow[];
    summary: {
        totalCandidates: number;
        directFacts: number;
        repairedFacts: number;
        signals: number;
        filtered: number;
    };
}

/**
 * 功能：从调试行构建审计记录。
 * @param metadata 修复元数据。
 * @param rows 调试行列表。
 * @returns 审计记录。
 */
export function buildFragmentRepairAuditRecord(
    metadata: FragmentRepairMetadata,
    rows: FragmentRepairDebugRow[],
): FragmentRepairAuditRecord {
    const directFacts = rows.filter((row) => row.finalKind === 'fact' && row.repairMode === 'none').length;
    const repairedFacts = rows.filter((row) => row.finalKind === 'fact' && row.repairMode !== 'none').length;
    const signals = rows.filter((row) => row.finalKind === 'signal').length;
    const filtered = rows.filter((row) => row.finalKind === 'filtered').length;

    return {
        timestamp: Date.now(),
        metadata,
        rows,
        summary: {
            totalCandidates: rows.length,
            directFacts,
            repairedFacts,
            signals,
            filtered,
        },
    };
}

/**
 * 功能：将审计记录格式化为可读日志（用于调试面板）。
 * @param record 审计记录。
 * @returns 多行日志文本。
 */
export function formatAuditLog(record: FragmentRepairAuditRecord): string {
    const lines: string[] = [];
    const s = record.summary;
    lines.push(`[FragmentRepair] turn ${record.metadata.sourceTurnRange[0]}–${record.metadata.sourceTurnRange[1]}`);
    lines.push(`  候选: ${s.totalCandidates} | 直接Fact: ${s.directFacts} | 修复Fact: ${s.repairedFacts} | Signal: ${s.signals} | 丢弃: ${s.filtered}`);

    for (const row of record.rows) {
        const icon = row.finalKind === 'fact' ? '✓' : row.finalKind === 'signal' ? '◆' : '✗';
        const scoreStr = row.fragmentScore.toFixed(2);
        const modeStr = row.repairMode;
        const origShort = row.originalText.slice(0, 30);
        const resultShort = row.repairedText ? row.repairedText.slice(0, 30) : '—';
        lines.push(`  ${icon} [${scoreStr}] ${modeStr.padEnd(16)} "${origShort}" → "${resultShort}"`);
    }

    return lines.join('\n');
}
