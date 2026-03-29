/**
 * 功能：事实改写器。
 *
 * 把修复后的候选文本改写为保守、结构化的事实表达。
 * 硬约束：
 * - 不新增原文没有支持的结论
 * - 不补出心理活动
 * - 不把威胁自动升级为最终决定
 * - 不把"可能继续"改成"已经完成"
 */

import type { FactCategory, PlannerFact, RepairedCandidate } from './fragment-types';

// ─── 关键词分类表 ───────────────────────────────────

const RULE_KEYWORDS = ['规定', '要求', '必须', '不准', '不许', '禁止', '否则', '条件', '前提', '限定', '约定', '规矩'];
const EVENT_KEYWORDS = ['发生', '出现', '爆发', '突然', '遭遇', '遭到', '抵达', '离开', '前往', '返回', '动身'];
const STATE_KEYWORDS = ['仍然', '依然', '目前', '当前', '处于', '尚未', '已经', '正在', '暂时', '持续'];
const RELATION_KEYWORDS = ['信任', '戒备', '敌对', '友善', '合作', '怀疑', '冷淡', '亲近', '疏离'];
const TASK_KEYWORDS = ['委托', '任务', '接单', '交易', '定金', '付款', '完成', '推进', '执行', '搁置', '中止'];
const TIME_KEYWORDS = ['之后', '随后', '接着', '此前', '此后', '当时', '同时', '期间', '最终'];

// ─── 公开 API ───────────────────────────────────────

/**
 * 功能：把修复后的候选改写成 PlannerFact。
 * @param repaired 修复后的候选。
 * @param actors 当前已知角色名列表。
 * @returns PlannerFact 或 null（如果文本太短 / 无信息量）。
 */
export function rewriteAsFact(repaired: RepairedCandidate, actors: string[]): PlannerFact | null {
    const text = repaired.repairedText.trim();
    if (text.length < 6) return null;

    const category = classifyFactCategory(text);
    const rewritten = applyFactTemplate(text, category, actors);
    if (!rewritten || rewritten.length < 6) return null;

    return {
        factId: `fact_${repaired.candidateId}`,
        text: rewritten,
        category,
        confidence: repaired.confidence,
        repairMode: repaired.repairMode,
        originalText: repaired.repairMode !== 'none' ? repaired.originalText : undefined,
        sourceRefs: repaired.sourceRefs,
    };
}

// ─── 内部辅助 ───────────────────────────────────────

/**
 * 功能：按关键词分类事实类别。
 */
function classifyFactCategory(text: string): FactCategory {
    if (containsAny(text, RULE_KEYWORDS)) return 'rule';
    if (containsAny(text, TASK_KEYWORDS)) return 'task';
    if (containsAny(text, RELATION_KEYWORDS)) return 'relationship';
    if (containsAny(text, EVENT_KEYWORDS)) return 'event';
    if (containsAny(text, TIME_KEYWORDS)) return 'time';
    if (containsAny(text, STATE_KEYWORDS)) return 'state';
    return 'event';
}

/**
 * 功能：按分类应用事实模板进行保守改写。
 */
function applyFactTemplate(text: string, category: FactCategory, actors: string[]): string {
    const subject = resolveSubject(text, actors);

    switch (category) {
        case 'rule': {
            const condition = extractAfterKeyword(text, RULE_KEYWORDS);
            if (condition) return truncate(`${subject}规定：${condition}`, 60);
            return truncate(text, 60);
        }
        case 'task': {
            const action = extractAfterKeyword(text, TASK_KEYWORDS);
            if (action) return truncate(`${subject}${action}`, 60);
            return truncate(text, 60);
        }
        case 'relationship': {
            const state = extractAfterKeyword(text, RELATION_KEYWORDS);
            if (state) return truncate(`${subject}与对方${state}`, 60);
            return truncate(text, 60);
        }
        case 'event': {
            return truncate(text, 60);
        }
        case 'state': {
            const current = extractAfterKeyword(text, STATE_KEYWORDS);
            if (current) return truncate(`当前${current}`, 60);
            return truncate(text, 60);
        }
        case 'time': {
            return truncate(text, 60);
        }
    }
}

/**
 * 功能：从文本推断主语。
 */
function resolveSubject(text: string, actors: string[]): string {
    const matched = actors.find((actor) => actor && text.includes(actor));
    if (matched) return matched;
    const prefix = text.match(/^[^，,。；：:]{1,8}/u)?.[0] ?? '';
    if (prefix.length >= 2 && prefix.length <= 6 && !containsAny(prefix, ['如果', '因为', '但是', '而且', '当前', '目前'])) {
        return prefix;
    }
    return '当前交涉';
}

/**
 * 功能：提取关键词后的文本片段。
 */
function extractAfterKeyword(text: string, keywords: string[]): string | null {
    for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx >= 0) {
            const tail = text.slice(idx).trim();
            if (tail.length >= 4) return tail;
        }
    }
    return null;
}

/**
 * 功能：判断文本是否包含任一关键词。
 */
function containsAny(text: string, keywords: string[]): boolean {
    return keywords.some((kw) => text.includes(kw));
}

/**
 * 功能：按长度截断。
 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}…`;
}
