/**
 * 功能：邻近上下文修复引擎。
 *
 * 从同消息 / 同 turn / 邻近 turn 的局部句段中尝试恢复截断片段。
 * 只做结构恢复，不做剧情推断。
 */

import type { RepairContext, RepairedCandidate, WindowCandidate } from './fragment-types';
import { analyzeTextFragment } from './fragment-detector';

// ─── 公开 API ───────────────────────────────────────

/**
 * 功能：为指定候选片段构建邻近修复上下文。
 * @param candidate 当前候选。
 * @param allCandidates 全部窗口候选。
 * @returns 修复上下文。
 */
export function buildRepairContext(candidate: WindowCandidate, allCandidates: WindowCandidate[]): RepairContext {
    const sameTurnSegments: string[] = [];
    const prevSegments: string[] = [];
    const nextSegments: string[] = [];

    for (const other of allCandidates) {
        if (other.candidateId === candidate.candidateId) continue;
        const text = other.normalizedText.trim();
        if (!text) continue;

        if (other.turnIndex === candidate.turnIndex) {
            sameTurnSegments.push(text);
        } else if (other.turnIndex === candidate.turnIndex - 1) {
            prevSegments.push(text);
        } else if (other.turnIndex === candidate.turnIndex + 1) {
            nextSegments.push(text);
        }
    }

    return {
        sameTurnSegments: sameTurnSegments.slice(0, 6),
        prevSegments: prevSegments.slice(0, 4),
        nextSegments: nextSegments.slice(0, 4),
    };
}

/**
 * 功能：尝试修复残缺片段。
 * @param candidate 待修复候选。
 * @param ctx 邻近修复上下文。
 * @returns 修复结果。
 */
export function repairFragment(candidate: WindowCandidate, ctx: RepairContext): RepairedCandidate {
    const original = candidate.normalizedText.trim();
    const baseRefs = [{ turnIndex: candidate.turnIndex, excerpt: truncate(original, 40) }];

    // 第一优先级：同 turn 内合并
    const sameTurnMerged = tryMergeSegments(original, ctx.sameTurnSegments);
    if (sameTurnMerged && !analyzeTextFragment(sameTurnMerged).isFragment) {
        return {
            candidateId: candidate.candidateId,
            originalText: candidate.rawText,
            repairedText: sameTurnMerged,
            repairMode: 'same_turn_merge',
            confidence: 0.85,
            fragmentType: undefined,
            sourceRefs: baseRefs,
        };
    }

    // 第二优先级：邻近 turn 合并
    const neighborMerged = tryMergeSegments(original, [...ctx.prevSegments, ...ctx.nextSegments]);
    if (neighborMerged && !analyzeTextFragment(neighborMerged).isFragment) {
        return {
            candidateId: candidate.candidateId,
            originalText: candidate.rawText,
            repairedText: neighborMerged,
            repairMode: 'neighbor_merge',
            confidence: 0.75,
            fragmentType: undefined,
            sourceRefs: baseRefs,
        };
    }

    // 第三优先级：尝试通过截断尾部自修复（去掉悬空尾巴看是否独立成句）
    const selfTrimmed = trySelfTrim(original);
    if (selfTrimmed && !analyzeTextFragment(selfTrimmed).isFragment && selfTrimmed.length >= 8) {
        return {
            candidateId: candidate.candidateId,
            originalText: candidate.rawText,
            repairedText: selfTrimmed,
            repairMode: 'fact_rewrite',
            confidence: 0.7,
            fragmentType: undefined,
            sourceRefs: baseRefs,
        };
    }

    // 无法修复
    return {
        candidateId: candidate.candidateId,
        originalText: candidate.rawText,
        repairedText: original,
        repairMode: 'signal_downgrade',
        confidence: 0.45,
        fragmentType: undefined,
        sourceRefs: baseRefs,
    };
}

// ─── 内部辅助 ───────────────────────────────────────

/**
 * 功能：尝试用邻近句段合并来补全残句。
 * 策略：在邻近片段中寻找与原句尾部重叠或语义延续的部分，拼接成完整句。
 */
function tryMergeSegments(original: string, segments: string[]): string | null {
    const cleaned = original.replace(/[…]+$/u, '').replace(/[，、：—\-（「『"(]+$/u, '').trim();
    if (!cleaned) return null;

    // 策略 1：找到能接续原句的片段（原句尾部若干字 ⊂ 对方开头）
    for (const seg of segments) {
        const overlap = findOverlap(cleaned, seg);
        if (overlap >= 2) {
            const merged = cleaned + seg.slice(overlap);
            if (merged.length > original.length && merged.length <= 120) {
                return normalizeEnding(merged);
            }
        }
    }

    // 策略 2：找同一说话人的延续句（以原句最后几个字匹配的方式）
    const tail = cleaned.slice(-4);
    for (const seg of segments) {
        if (seg.length < 6) continue;
        const idx = seg.indexOf(tail);
        if (idx >= 0 && idx < 10) {
            const merged = cleaned + seg.slice(idx + tail.length);
            if (merged.length > original.length && merged.length <= 120) {
                return normalizeEnding(merged);
            }
        }
    }

    return null;
}

/**
 * 功能：找两个字符串的尾首重叠长度。
 */
function findOverlap(left: string, right: string): number {
    const maxCheck = Math.min(left.length, right.length, 12);
    for (let len = maxCheck; len >= 2; len--) {
        if (left.endsWith(right.slice(0, len))) {
            return len;
        }
    }
    return 0;
}

/**
 * 功能：尝试自修复：去掉悬空的连接词/标点尾巴。
 */
function trySelfTrim(text: string): string | null {
    const trimmed = text
        .replace(/[…]+$/u, '')
        .replace(/[，、：—\-（「『"(]+$/u, '')
        .replace(/(?:然后|继续|在|向|为了|如果|于是|并且|准备|正在|但是|不过|因为|所以|而且)$/u, '')
        .trim();
    if (trimmed.length < 6) return null;
    return normalizeEnding(trimmed);
}

/**
 * 功能：确保句子以合理标点结尾。
 */
function normalizeEnding(text: string): string {
    const trimmed = text.replace(/[，、；]+$/u, '').trim();
    if (/[。！？…」』"]$/u.test(trimmed)) return trimmed;
    return `${trimmed}。`;
}

/**
 * 功能：截断文本。
 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}…`;
}
