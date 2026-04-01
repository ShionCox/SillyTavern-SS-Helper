import type { MemoryTakeoverBatchResult } from '../types';
import { isHighRiskSystemNarrative } from './narrative-sanitizer';

const BANNED_TEXT_PATTERN = /用户(?!名)|主角|主人公|对方|本批次|本轮|当前剧情|当前场景|当前设置|当前设置地点|首次识别到|已触发|已确认|结构化|绑定|主链|输出内容|处理结果|待补全|需要进一步确认/;
const PROCESS_OPEN_THREAD_PATTERN = /待补全|待确认|后续处理|结构化确认|继续处理|流程|修复/;

/**
 * 功能：定义叙事校验问题。
 */
export interface NarrativeValidationIssue {
    path: string;
    text: string;
    reason: string;
}

/**
 * 功能：校验接管批次结果中的叙事字段。
 * @param result 批次结果。
 * @returns 校验结果。
 */
export function validateTakeoverNarratives(result: MemoryTakeoverBatchResult): {
    valid: boolean;
    issues: NarrativeValidationIssue[];
} {
    const issues: NarrativeValidationIssue[] = [];
    walkNarrativeFields(result, '', issues);
    return {
        valid: issues.length <= 0,
        issues,
    };
}

/**
 * 功能：递归遍历叙事字段并记录问题。
 * @param value 当前值。
 * @param path 当前路径。
 * @param issues 问题列表。
 */
function walkNarrativeFields(value: unknown, path: string, issues: NarrativeValidationIssue[]): void {
    if (typeof value === 'string') {
        validateSingleNarrative(path, value, issues);
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item: unknown, index: number): void => {
            walkNarrativeFields(item, `${path}[${index}]`, issues);
        });
        return;
    }
    if (!value || typeof value !== 'object') {
        return;
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, child]: [string, unknown]): void => {
        if (shouldSkipKey(key)) {
            return;
        }
        const nextPath = path ? `${path}.${key}` : key;
        walkNarrativeFields(child, nextPath, issues);
    });
}

/**
 * 功能：校验单个叙事文本字段。
 * @param path 字段路径。
 * @param text 文本内容。
 * @param issues 问题列表。
 */
function validateSingleNarrative(path: string, text: string, issues: NarrativeValidationIssue[]): void {
    const source = String(text ?? '').trim();
    if (!source) {
        return;
    }
    if (BANNED_TEXT_PATTERN.test(source)) {
        issues.push({ path, text: source, reason: '命中禁用系统词或主角错误指代' });
    }
    if ((/summary|state|reason|openThreads/i.test(path) || path === 'summary') && isHighRiskSystemNarrative(source)) {
        issues.push({ path, text: source, reason: '系统腔风险过高' });
    }
    if (/openThreads\[\d+\]$/.test(path) && PROCESS_OPEN_THREAD_PATTERN.test(source)) {
        issues.push({ path, text: source, reason: '悬念字段写成了流程说明' });
    }
}

/**
 * 功能：判断字段是否应跳过叙事校验。
 * @param key 字段名。
 * @returns 是否跳过。
 */
function shouldSkipKey(key: string): boolean {
    return new Set([
        'actorKey',
        'sourceActorKey',
        'targetActorKey',
        'participants',
        'relationTag',
        'targetType',
        'entityKey',
        'compareKey',
        'matchKeys',
        'schemaVersion',
        'canonicalName',
        'legacyCompareKeys',
        'bindings',
        'reasonCodes',
        'sourceRange',
        'generatedAt',
        'takeoverId',
        'batchId',
        'sourceSegments',
        'auditReport',
    ]).has(key);
}
