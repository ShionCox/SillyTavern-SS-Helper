/**
 * 功能：Signal 降级器。
 *
 * 把不能成为强事实但有弱提示价值的片段降级为 PlannerSignal。
 * Signal 可进 Planner 但默认不进长期记忆。
 */

import type { PlannerSignal, RepairedCandidate, SignalCategory } from './fragment-types';

// ─── 分类关键词 ────────────────────────────────────

const ONGOING_CONTACT_KEYWORDS = ['继续', '仍在', '还在', '接触', '交涉', '交谈', '商谈', '对话', '会面'];
const UNFINISHED_TASK_KEYWORDS = ['委托', '任务', '交易', '尚未', '未完成', '待定', '搁置', '中止'];
const RISK_KEYWORDS = ['危险', '风险', '威胁', '警告', '代价', '后果', '麻烦', '追杀', '灭口', '埋伏'];
const UNCERTAIN_RELATION_KEYWORDS = ['怀疑', '戒备', '不确定', '信任', '敌对', '冷淡', '试探'];
const UNCERTAIN_EVENT_KEYWORDS = ['不明', '未知', '不清楚', '线索', '情报', '待查', '成谜'];

// ─── 公开 API ───────────────────────────────────────

/**
 * 功能：把无法改写为 Fact 的修复结果降级为 Signal。
 * @param repaired 修复后的候选。
 * @returns PlannerSignal 或 null（如果连 signal 都做不了）。
 */
export function downgradeToSignal(repaired: RepairedCandidate): PlannerSignal | null {
    const text = repaired.repairedText.trim();
    if (text.length < 4) return null;

    const category = classifySignalCategory(text);
    const signalText = buildSignalText(text, category);
    if (!signalText || signalText.length < 4) return null;

    return {
        signalId: `sig_${repaired.candidateId}`,
        text: signalText,
        category,
        confidence: Math.min(repaired.confidence, 0.6),
        derivedFrom: [repaired.originalText],
    };
}

// ─── 内部辅助 ───────────────────────────────────────

/**
 * 功能：按关键词分类信号类别。
 */
function classifySignalCategory(text: string): SignalCategory {
    if (containsAny(text, RISK_KEYWORDS)) return 'risk';
    if (containsAny(text, UNFINISHED_TASK_KEYWORDS)) return 'unfinished_task';
    if (containsAny(text, UNCERTAIN_RELATION_KEYWORDS)) return 'uncertain_relation';
    if (containsAny(text, UNCERTAIN_EVENT_KEYWORDS)) return 'uncertain_event';
    if (containsAny(text, ONGOING_CONTACT_KEYWORDS)) return 'ongoing_contact';
    return 'uncertain_event';
}

/**
 * 功能：构建保守的信号文本。
 */
function buildSignalText(text: string, category: SignalCategory): string {
    switch (category) {
        case 'ongoing_contact':
            return truncate(`当前接触仍在继续。`, 40);
        case 'unfinished_task': {
            const taskRef = extractKeywordContext(text, UNFINISHED_TASK_KEYWORDS);
            return truncate(taskRef ? `${taskRef}尚未完成。` : '存在未完成的事项。', 40);
        }
        case 'risk': {
            const riskRef = extractKeywordContext(text, RISK_KEYWORDS);
            return truncate(riskRef ? `当前存在${riskRef}。` : '当前可能存在风险或威胁。', 40);
        }
        case 'uncertain_relation':
            return truncate('关系状态尚不确定。', 40);
        case 'uncertain_event': {
            const eventRef = extractKeywordContext(text, UNCERTAIN_EVENT_KEYWORDS);
            return truncate(eventRef ? `${eventRef}尚待确认。` : '存在未确认的事项。', 40);
        }
    }
}

/**
 * 功能：在文本中提取关键词附近的上下文片段。
 */
function extractKeywordContext(text: string, keywords: string[]): string | null {
    for (const kw of keywords) {
        const idx = text.indexOf(kw);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 6);
        const end = Math.min(text.length, idx + kw.length + 8);
        const fragment = text.slice(start, end).trim();
        if (fragment.length >= 4) return fragment;
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
 * 功能：截断。
 */
function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen)}…`;
}
