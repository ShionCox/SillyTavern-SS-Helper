/**
 * 功能：残缺片段检测器。
 *
 * 对每个窗口候选片段进行残缺评分，判定是否为残句。
 * 阈值：>= 0.7 强疑似、0.4–0.7 可尝试修复、< 0.4 基本完整。
 */

import type { FragmentAnalysis, FragmentType, WindowCandidate } from './fragment-types';

// ─── 常量 ───────────────────────────────────────────

/** 尾部连接词 / 介词 / 未闭合结构，出现在句尾表示截断。 */
const DANGLING_CONNECTORS = [
    '然后', '继续', '在', '向', '为了', '如果', '于是', '并且',
    '准备', '正在', '但是', '不过', '因为', '所以', '而且',
    '虽然', '还是', '或者', '接着', '随后', '同时', '尽管',
];

/** 不完整谓词：有主语、有动作起始但缺宾语 / 结果的模式。 */
const INCOMPLETE_PREDICATE_TAILS = /(?:进行|处理|说明|执行|安排|商量|讨论|调查|解决|回去|过去|出发|赶去|收拾)(?:了)?[…。！？]?$/u;

/** 尾部未闭合标点。 */
const TAIL_OPEN_PUNCTUATION = /[，、：—\-（「『"(]$/u;

/** 检测开引号与闭引号是否配对。 */
const QUOTE_PAIRS: Array<[string, string]> = [
    ['\u201C', '\u201D'],
    ['\u300C', '\u300D'],
    ['\u300E', '\u300F'],
    ['"', '"'],
    ['\u2018', '\u2019'],
];

// ─── 公开 API ───────────────────────────────────────

/**
 * 功能：对单个候选片段执行残缺检测。
 * @param candidate 窗口候选片段。
 * @returns 检测结果。
 */
export function analyzeFragment(candidate: WindowCandidate): FragmentAnalysis {
    return analyzeTextFragment(candidate.normalizedText);
}

/**
 * 功能：仅对纯文本执行残缺检测（用于修复后二次检验）。
 * @param text 待检测文本。
 * @returns 检测结果。
 */
export function analyzeTextFragment(text: string): FragmentAnalysis {
    const trimmed = text.trim();
    const reasons: string[] = [];
    let score = 0;

    // 规则 1：尾部未闭合标点
    if (TAIL_OPEN_PUNCTUATION.test(trimmed)) {
        score += 0.35;
        reasons.push('tail_open_punctuation');
    }

    // 规则 2：引号不闭合
    if (hasUnclosedQuote(trimmed)) {
        score += 0.35;
        reasons.push('unclosed_quote');
    }

    // 规则 3：尾部连接词 / 介词悬空
    if (endsWithDanglingConnector(trimmed)) {
        score += 0.2;
        reasons.push('dangling_connector');
    }

    // 规则 4：谓词不完整
    if (looksLikeIncompletePredicate(trimmed)) {
        score += 0.25;
        reasons.push('incomplete_predicate');
    }

    // 规则 5：中段切片 — 既无清晰开头也无清晰结尾
    if (looksLikeMidSlice(trimmed)) {
        score += 0.25;
        reasons.push('mid_slice');
    }

    // 规则 6：长度异常
    if (trimmed.length > 0 && trimmed.length < 6 && !/[。！？]$/u.test(trimmed)) {
        score += 0.15;
        reasons.push('too_short');
    }

    const isFragment = score >= 0.4;
    return {
        isFragment,
        fragmentScore: Math.min(score, 1),
        reasons,
        fragmentType: inferFragmentType(reasons),
    };
}

// ─── 内部辅助 ───────────────────────────────────────

/**
 * 功能：检测文本中是否存在未闭合引号。
 */
function hasUnclosedQuote(text: string): boolean {
    for (const [open, close] of QUOTE_PAIRS) {
        const openCount = countOccurrences(text, open);
        const closeCount = countOccurrences(text, close);
        if (open === close) {
            if (openCount % 2 !== 0) return true;
        } else {
            if (openCount > closeCount) return true;
        }
    }
    return false;
}

/**
 * 功能：检测文本是否以悬空连接词结尾。
 */
function endsWithDanglingConnector(text: string): boolean {
    const tail = text.replace(/[…。！？，、：—\-]+$/u, '').trim();
    return DANGLING_CONNECTORS.some((connector) => tail.endsWith(connector));
}

/**
 * 功能：检测文本是否像谓词不完整。
 */
function looksLikeIncompletePredicate(text: string): boolean {
    return INCOMPLETE_PREDICATE_TAILS.test(text.replace(/[…]+$/u, '').trim());
}

/**
 * 功能：检测文本是否像中段切片 — 开头非主语词，结尾也不是自然句末。
 */
function looksLikeMidSlice(text: string): boolean {
    if (text.length < 8) return false;
    const startsWithConnector = /^(?:然后|接着|并且|而且|但是|不过|同时|随后|于是)/u.test(text);
    const noNaturalEnding = !/[。！？…」』"]$/u.test(text);
    return startsWithConnector && noNaturalEnding;
}

/**
 * 功能：统计子串出现次数。
 */
function countOccurrences(text: string, sub: string): number {
    let count = 0;
    let pos = 0;
    while (true) {
        pos = text.indexOf(sub, pos);
        if (pos < 0) break;
        count++;
        pos += sub.length;
    }
    return count;
}

/**
 * 功能：根据检测 reasons 推断残缺子类型。
 */
function inferFragmentType(reasons: string[]): FragmentType | undefined {
    if (reasons.includes('unclosed_quote')) return 'dialogue_cut';
    if (reasons.includes('tail_open_punctuation') || reasons.includes('dangling_connector')) return 'tail_cut';
    if (reasons.includes('mid_slice')) return 'mid_slice';
    if (reasons.includes('incomplete_predicate')) return 'tail_cut';
    return undefined;
}
