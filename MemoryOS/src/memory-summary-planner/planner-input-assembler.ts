/**
 * 功能：Planner 输入组装器（片段修复链路入口）。
 *
 * 完整流程：
 * 1. 从 summaryText 提取窗口候选片段
 * 2. 对每个候选做残缺检测
 * 3. 残缺者走邻近修复 → 成功则 Fact，失败则 Signal 或 Filtered
 * 4. 完整者直接走事实改写
 * 5. 输出 facts + signals + metadata
 */

import type {
    FragmentRepairDebugRow,
    FragmentRepairMetadata,
    PlannerFact,
    PlannerSignal,
    WindowCandidate,
} from './fragment-types';
import { analyzeFragment } from './fragment-detector';
import { buildRepairContext, repairFragment } from './context-repair-engine';
import { rewriteAsFact } from './fact-rewriter';
import { downgradeToSignal } from './signal-downgrader';

// ─── 常量 ───────────────────────────────────────────

/** 候选片段分类关键词。 */
const RULE_CUE = /(?:规定|要求|必须|不准|禁止|否则|条件)/u;
const STATE_CUE = /(?:仍然|依然|目前|当前|处于|尚未|已经)/u;
const EVENT_CUE = /(?:发生|出现|抵达|离开|前往|返回|动身|爆发|遭遇)/u;
const ACTION_CUE = /(?:拿起|放下|打开|关上|走向|跑向|拔出|举起|冲过去)/u;

// ─── 公开 API ───────────────────────────────────────

/**
 * 功能：对 summaryText 执行完整的片段修复链路。
 * @param summaryText 窗口叙事文本。
 * @param actors 当前已知角色名列表。
 * @param turnRange 来源 turn 范围。
 * @returns 修复后的 facts、signals 与元数据。
 */
export function runFragmentRepairPipeline(
    summaryText: string,
    actors: string[],
    turnRange: [number, number],
): {
    facts: PlannerFact[];
    signals: PlannerSignal[];
    metadata: FragmentRepairMetadata;
    debugRows: FragmentRepairDebugRow[];
} {
    const candidates = extractWindowCandidates(summaryText, turnRange);

    const facts: PlannerFact[] = [];
    const signals: PlannerSignal[] = [];
    const debugRows: FragmentRepairDebugRow[] = [];
    let droppedFragments = 0;
    let repairedFragments = 0;
    let downgradedSignals = 0;

    for (const candidate of candidates) {
        const analysis = analyzeFragment(candidate);

        if (!analysis.isFragment) {
            // 完整片段 → 直接改写为 Fact
            const directFact = rewriteAsFact(
                {
                    candidateId: candidate.candidateId,
                    originalText: candidate.rawText,
                    repairedText: candidate.normalizedText,
                    repairMode: 'none',
                    confidence: 0.9,
                    sourceRefs: [{ turnIndex: candidate.turnIndex, excerpt: candidate.rawText.slice(0, 40) }],
                },
                actors,
            );
            if (directFact) {
                facts.push(directFact);
                debugRows.push({
                    originalText: candidate.rawText,
                    fragmentScore: analysis.fragmentScore,
                    fragmentType: undefined,
                    repairMode: 'none',
                    repairedText: directFact.text,
                    finalKind: 'fact',
                    confidence: 0.9,
                    enteredPlanner: true,
                    enteredSummaryCandidate: true,
                });
            }
            continue;
        }

        // 残缺片段 → 尝试修复
        const ctx = buildRepairContext(candidate, candidates);
        const repaired = repairFragment(candidate, ctx);

        if (
            repaired.repairMode === 'neighbor_merge'
            || repaired.repairMode === 'same_turn_merge'
            || repaired.repairMode === 'fact_rewrite'
        ) {
            const fact = rewriteAsFact(repaired, actors);
            if (fact) {
                facts.push(fact);
                repairedFragments++;
                debugRows.push({
                    originalText: candidate.rawText,
                    fragmentScore: analysis.fragmentScore,
                    fragmentType: analysis.fragmentType,
                    repairMode: repaired.repairMode,
                    repairedText: fact.text,
                    finalKind: 'fact',
                    confidence: repaired.confidence,
                    enteredPlanner: true,
                    enteredSummaryCandidate: true,
                });
                continue;
            }
        }

        // 修复失败 → 尝试降级为 Signal
        const signal = downgradeToSignal(repaired);
        if (signal) {
            signals.push(signal);
            downgradedSignals++;
            debugRows.push({
                originalText: candidate.rawText,
                fragmentScore: analysis.fragmentScore,
                fragmentType: analysis.fragmentType,
                repairMode: 'signal_downgrade',
                repairedText: signal.text,
                finalKind: 'signal',
                confidence: signal.confidence,
                enteredPlanner: true,
                enteredSummaryCandidate: false,
            });
            continue;
        }

        // Signal 也做不了 → 丢弃
        droppedFragments++;
        debugRows.push({
            originalText: candidate.rawText,
            fragmentScore: analysis.fragmentScore,
            fragmentType: analysis.fragmentType,
            repairMode: 'filtered',
            finalKind: 'filtered',
            confidence: 0,
            enteredPlanner: false,
            enteredSummaryCandidate: false,
        });
    }

    return {
        facts: dedupeFacts(facts),
        signals: dedupeSignals(signals),
        metadata: {
            sourceTurnRange: turnRange,
            droppedFragments,
            repairedFragments,
            downgradedSignals,
        },
        debugRows,
    };
}

// ─── 窗口候选提取 ───────────────────────────────────

/**
 * 功能：从 summaryText 提取候选片段列表。
 * 按句号、叹号、问号、换行分割，再分类。
 */
function extractWindowCandidates(summaryText: string, turnRange: [number, number]): WindowCandidate[] {
    const sentences = String(summaryText ?? '')
        .split(/[。！？\n]+/u)
        .map((s) => s.replace(/\s+/g, ' ').replace(/^[，,；;：:]+|[，,；;：:]+$/g, '').trim())
        .filter((s) => s.length >= 4);

    const baseTurn = turnRange[0];
    return sentences.map((sentence, idx): WindowCandidate => {
        const speaker = detectSpeaker(sentence);
        return {
            candidateId: `wc_${baseTurn}_${idx}`,
            turnIndex: baseTurn + Math.floor(idx / 3), // 粗略分配，每 3 句近似一个 turn
            speaker: speaker ?? undefined,
            rawText: sentence,
            normalizedText: normalizeText(sentence),
            candidateType: classifyCandidateType(sentence),
        };
    });
}

/**
 * 功能：对文本做轻量归一化。
 */
function normalizeText(text: string): string {
    return text
        .replace(/\s+/g, ' ')
        .replace(/\.{2,}/g, '…')
        .replace(/。{2,}/g, '。')
        .replace(/^[，,；;：:]+|[，,；;：:]+$/g, '')
        .trim();
}

/**
 * 功能：尝试检测说话人。
 */
function detectSpeaker(text: string): string | null {
    // 模式 1："角色名说：..."
    const match1 = text.match(/^(.{1,8})[说道喊叫问答吼嘲嘀](?:道)?[：:]/u);
    if (match1) return match1[1].trim();
    // 模式 2：「...」前有角色名
    const match2 = text.match(/^(.{1,8})[："「『]/u);
    if (match2 && match2[1].length <= 6) return match2[1].trim();
    return null;
}

/**
 * 功能：候选片段分类。
 */
function classifyCandidateType(text: string): WindowCandidate['candidateType'] {
    if (/[「『""]/u.test(text)) return 'dialogue';
    if (RULE_CUE.test(text)) return 'rule';
    if (STATE_CUE.test(text)) return 'state';
    if (EVENT_CUE.test(text)) return 'event';
    if (ACTION_CUE.test(text)) return 'action';
    return 'narration';
}

// ─── 去重 ───────────────────────────────────────────

/**
 * 功能：Fact 去重 — 高置信度覆盖低置信度同义事实。
 */
function dedupeFacts(facts: PlannerFact[]): PlannerFact[] {
    const seen = new Map<string, PlannerFact>();
    for (const fact of facts) {
        const fingerprint = buildFingerprint(fact.text);
        const existing = seen.get(fingerprint);
        if (!existing || fact.confidence > existing.confidence) {
            seen.set(fingerprint, fact);
        }
    }
    return Array.from(seen.values());
}

/**
 * 功能：Signal 去重。
 */
function dedupeSignals(signals: PlannerSignal[]): PlannerSignal[] {
    const seen = new Map<string, PlannerSignal>();
    for (const signal of signals) {
        const fingerprint = `${signal.category}_${buildFingerprint(signal.text)}`;
        if (!seen.has(fingerprint)) {
            seen.set(fingerprint, signal);
        }
    }
    return Array.from(seen.values());
}

/**
 * 功能：简单文本指纹 — 去标点取核心字。
 */
function buildFingerprint(text: string): string {
    return text.replace(/[，。！？、：；…""「」『』\s]/gu, '').slice(0, 20);
}
