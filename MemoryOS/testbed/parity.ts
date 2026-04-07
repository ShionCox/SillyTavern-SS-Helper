import type { MemoryPromptParityBaseline, MemoryPromptTestBundle } from '../src/db/db';
import type { PromptInjectionPipelineResult } from '../src/runtime/prompt-injection-pipeline';

/**
 * 功能：定义严格一致性差异类型。
 */
export type TestbedParityMismatchType =
    | 'prompt_length_changed'
    | 'insert_index_changed'
    | 'memory_block_changed'
    | 'final_prompt_changed'
    | 'reason_codes_changed'
    | 'matched_entries_changed';

/**
 * 功能：定义严格一致性差异项。
 */
export interface TestbedParityMismatch {
    type: TestbedParityMismatchType;
    detail: string;
}

/**
 * 功能：定义 testbed 严格一致性基准结构。
 */
export interface ExactReplayBaseline extends MemoryPromptParityBaseline {}

/**
 * 功能：定义 testbed 运行日志条目结构。
 */
export interface TestbedRunLogEntry {
    ts: number;
    level: 'info' | 'warn' | 'error';
    section: string;
    message: string;
    details?: Record<string, unknown>;
}

/**
 * 功能：定义 testbed 严格一致性报告。
 */
export interface TestbedParityReport {
    mode: 'exact_replay' | 'simulated_prompt';
    strictComparable: boolean;
    pass: boolean;
    mismatches: TestbedParityMismatch[];
    baseline: ExactReplayBaseline | null;
    replay: ExactReplayBaseline;
    summary: string;
}

/**
 * 功能：读取 Prompt 消息文本。
 * @param message Prompt 消息对象。
 * @returns 归一化文本。
 */
function readPromptMessageText(message: unknown): string {
    if (!message || typeof message !== 'object') {
        return '';
    }
    const record = message as Record<string, unknown>;
    return String(record.content ?? record.mes ?? record.text ?? '').trim();
}

/**
 * 功能：归一化字符串数组并去重。
 * @param value 原始输入。
 * @returns 去重后的字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        const normalized = String(item ?? '').trim();
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：归一化严格一致性基准对象。
 * @param value 原始值。
 * @returns 归一化基准，无效时返回 null。
 */
export function normalizeExactReplayBaseline(value: unknown): ExactReplayBaseline | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const record = value as Record<string, unknown>;
    const finalPromptText = String(record.finalPromptText ?? '').trim();
    if (!finalPromptText) {
        return null;
    }
    const insertIndex = Number(record.insertIndex);
    return {
        finalPromptText,
        insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
        insertedMemoryBlock: String(record.insertedMemoryBlock ?? '').trim(),
        reasonCodes: normalizeStringArray(record.reasonCodes),
        matchedActorKeys: normalizeStringArray(record.matchedActorKeys),
        matchedEntryIds: normalizeStringArray(record.matchedEntryIds),
    };
}

/**
 * 功能：从测试包中提取严格一致性基准。
 * @param bundle 测试包对象。
 * @returns 基准结构，无可用基准时返回 null。
 */
export function extractExactReplayBaseline(bundle: MemoryPromptTestBundle): ExactReplayBaseline | null {
    return normalizeExactReplayBaseline(
        bundle.parityBaseline
        ?? (bundle.runResult as Record<string, unknown> | undefined)?.parityBaseline
        ?? bundle.runResult,
    );
}

/**
 * 功能：从注入流水线结果提取回放基准。
 * @param result 流水线结果。
 * @returns 可用于严格比对的回放结果。
 */
export function buildReplayBaselineFromPipeline(result: PromptInjectionPipelineResult): ExactReplayBaseline {
    const latestExplanation = (result.latestExplanation ?? {}) as Record<string, unknown>;
    const insertIndex = Number(result.injectionResult.insertIndex ?? -1);
    const insertedMemoryBlock = (insertIndex >= 0 && insertIndex < result.finalPromptMessages.length)
        ? readPromptMessageText(result.finalPromptMessages[insertIndex])
        : '';
    return {
        finalPromptText: String(result.finalPromptText ?? ''),
        insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
        insertedMemoryBlock,
        reasonCodes: normalizeStringArray(latestExplanation.reasonCodes),
        matchedActorKeys: normalizeStringArray(latestExplanation.matchedActorKeys),
        matchedEntryIds: normalizeStringArray(latestExplanation.matchedEntryIds),
    };
}

/**
 * 功能：判断两个字符串数组是否完全一致。
 * @param left 左值。
 * @param right 右值。
 * @returns 是否一致。
 */
function areArraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

/**
 * 功能：比较 exact replay 基准与回放结果。
 * @param baseline 酒馆基准。
 * @param replay testbed 回放结果。
 * @param mode 当前测试模式。
 * @returns 严格一致性报告。
 */
export function compareExactReplayResult(
    baseline: ExactReplayBaseline | null,
    replay: ExactReplayBaseline,
    mode: 'exact_replay' | 'simulated_prompt',
): TestbedParityReport {
    const strictComparable = mode === 'exact_replay' && baseline !== null;
    const mismatches: TestbedParityMismatch[] = [];
    if (!strictComparable || !baseline) {
        return {
            mode,
            strictComparable,
            pass: false,
            mismatches,
            baseline,
            replay,
            summary: mode === 'exact_replay'
                ? '缺少酒馆基准，无法执行严格一致性验收。'
                : '模拟模式仅用于排障，不参与严格一致性验收。',
        };
    }

    if (baseline.finalPromptText.length !== replay.finalPromptText.length) {
        mismatches.push({
            type: 'prompt_length_changed',
            detail: `长度不一致：baseline=${baseline.finalPromptText.length}，replay=${replay.finalPromptText.length}`,
        });
    }
    if (baseline.insertIndex !== replay.insertIndex) {
        mismatches.push({
            type: 'insert_index_changed',
            detail: `注入位置不一致：baseline=${baseline.insertIndex}，replay=${replay.insertIndex}`,
        });
    }
    if (baseline.insertedMemoryBlock !== replay.insertedMemoryBlock) {
        mismatches.push({
            type: 'memory_block_changed',
            detail: '注入块文本不一致。',
        });
    }
    if (baseline.finalPromptText !== replay.finalPromptText) {
        mismatches.push({
            type: 'final_prompt_changed',
            detail: '最终 Prompt 文本不一致。',
        });
    }
    if (!areArraysEqual(baseline.reasonCodes, replay.reasonCodes)) {
        mismatches.push({
            type: 'reason_codes_changed',
            detail: `reasonCodes 不一致：baseline=[${baseline.reasonCodes.join(', ')}]，replay=[${replay.reasonCodes.join(', ')}]`,
        });
    }
    if (
        !areArraysEqual(baseline.matchedActorKeys, replay.matchedActorKeys)
        || !areArraysEqual(baseline.matchedEntryIds, replay.matchedEntryIds)
    ) {
        mismatches.push({
            type: 'matched_entries_changed',
            detail: [
                `matchedActorKeys baseline=[${baseline.matchedActorKeys.join(', ')}] replay=[${replay.matchedActorKeys.join(', ')}]`,
                `matchedEntryIds baseline=[${baseline.matchedEntryIds.join(', ')}] replay=[${replay.matchedEntryIds.join(', ')}]`,
            ].join('；'),
        });
    }

    const pass = mismatches.length === 0;
    return {
        mode,
        strictComparable,
        pass,
        mismatches,
        baseline,
        replay,
        summary: pass ? '严格一致：通过。' : `严格一致：失败，共 ${mismatches.length} 项差异。`,
    };
}

/**
 * 功能：格式化严格一致性报告文本。
 * @param report 一致性报告。
 * @returns 适合渲染到测试台的文本。
 */
export function formatParityReport(report: TestbedParityReport): string {
    const lines: string[] = [
        `模式：${report.mode}`,
        `是否可严格验收：${report.strictComparable ? '是' : '否'}`,
        `结论：${report.pass ? '通过' : '失败'}`,
        `摘要：${report.summary}`,
    ];
    if (report.mismatches.length > 0) {
        lines.push('');
        lines.push('差异列表：');
        report.mismatches.forEach((item, index): void => {
            lines.push(`${index + 1}. ${item.type} -> ${item.detail}`);
        });
    }
    return lines.join('\n');
}
