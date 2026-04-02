/**
 * 功能：故事时间解析器 — 从文本中提取显式/相对时间表达。
 */

import type { TimelineSignal, TimeSignalKind } from './time-types';

// ── 显式绝对时间正则 ──

const GREGORIAN_DATE_RE = /(\d{1,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
const MONTH_DAY_RE = /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g;
const WEEKDAY_RE = /星期[一二三四五六日天]/g;
const CLOCK_TIME_RE = /[凌清早上下午晚深夜半]+[\s]?\d{1,2}\s*[点时]/g;

// ── 古代纪年正则 ──

const ANCIENT_ERA_RE = /[\u4e00-\u9fff]{1,6}[元初]?\d{0,4}年/g;
const LUNAR_DATE_RE = /[正腊]?\s*月\s*(初|十|二十|三十)?\s*[一二三四五六七八九十]+/g;
const TIANGAN_DIZHI_RE = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]年/g;

// ── 奇幻纪年正则 ──

const FANTASY_ERA_RE = /[\u4e00-\u9fff]{1,8}历?\s*\d{1,5}\s*年/g;
const FANTASY_ERA2_RE = /第[一二三四五六七八九十百千万零]+纪/g;

// ── 学期制正则 ──

const ACADEMIC_TERM_RE = /[大小]?[一二三四五六七八九十]+[年级]?[上下]学期/g;
const SCHOOL_WEEK_RE = /开学后?第?[一二三四五六七八九十\d]+周/g;
const EXAM_PERIOD_RE = /(期中|期末|考试|暑假|寒假|春假|开学)[周期后前]*/g;

// ── 相对时间正则 ──

const RELATIVE_TIME_PATTERNS: Array<{ re: RegExp; kind: TimeSignalKind }> = [
    { re: /(次日|翌日|第二天|第三天|隔[了]?天|隔[了]?日)/g, kind: 'relative_time' },
    { re: /([一二三四五六七八九十百千]+|[几数]\s*)(天|日|周|月|年|个?月|个?小时|分钟|时辰|刻)后/g, kind: 'relative_time' },
    { re: /(\d+)\s*(天|日|周|月|年|小时|分钟|时辰|刻)\s*(后|之后|以后)/g, kind: 'relative_time' },
    { re: /(当[天日夜晚]|当夜|今[天夜晚日]|此刻|此时|这时|那时|彼时)/g, kind: 'relative_time' },
    { re: /(半[年月天日]后|半个?月后|半年后)/g, kind: 'relative_time' },
];

// ── 一天时段正则 ──

const PART_OF_DAY_RE = /(清晨|黎明|拂晓|破晓|凌晨|早[上晨]|上午|正午|午[后间时]|下午|傍晚|黄昏|入夜|夜[里晚间]|深夜|午夜|半夜|子时|丑时|寅时|卯时|辰时|巳时|午时|未时|申时|酉时|戌时|亥时)/g;

// ── 场景切换正则 ──

const SCENE_TRANSITION_RE = /(镜头[一切转]到|场景切换|回到|来到|去了|到了|转而|画面[一切转]到|与此同时)/g;

// ── 季节正则 ──

const SEASON_RE = /(春[天日季末初]|夏[天日季末初]|秋[天日季末初]|冬[天日季末初]|初春|仲春|暮春|初夏|仲夏|暮夏|初秋|仲秋|暮秋|初冬|仲冬|暮冬|年末|岁末|年初)/g;

/**
 * 功能：从文本中提取所有时间信号。
 * @param text 输入文本。
 * @param sourceFloor 来源楼层。
 * @returns 时间信号列表。
 */
export function extractTimeSignals(text: string, sourceFloor?: number): TimelineSignal[] {
    const raw = String(text ?? '');
    if (!raw.trim()) return [];

    const signals: TimelineSignal[] = [];

    // 公历日期
    for (const m of raw.matchAll(GREGORIAN_DATE_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'explicit_date', confidence: 0.95 });
    }
    for (const m of raw.matchAll(MONTH_DAY_RE)) {
        if (!signals.some(s => s.text.includes(m[0]))) {
            signals.push({ text: m[0], sourceFloor, kind: 'explicit_date', confidence: 0.85 });
        }
    }
    for (const m of raw.matchAll(WEEKDAY_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'explicit_date', confidence: 0.7 });
    }
    for (const m of raw.matchAll(CLOCK_TIME_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'explicit_date', confidence: 0.75 });
    }

    // 古代纪年
    for (const m of raw.matchAll(ANCIENT_ERA_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.88 });
    }
    for (const m of raw.matchAll(LUNAR_DATE_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.8 });
    }
    for (const m of raw.matchAll(TIANGAN_DIZHI_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.85 });
    }

    // 奇幻纪年
    for (const m of raw.matchAll(FANTASY_ERA_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.82 });
    }
    for (const m of raw.matchAll(FANTASY_ERA2_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.78 });
    }

    // 学期制
    for (const m of raw.matchAll(ACADEMIC_TERM_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'schedule_hint', confidence: 0.8 });
    }
    for (const m of raw.matchAll(SCHOOL_WEEK_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'schedule_hint', confidence: 0.75 });
    }
    for (const m of raw.matchAll(EXAM_PERIOD_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'schedule_hint', confidence: 0.65 });
    }

    // 相对时间
    for (const { re, kind } of RELATIVE_TIME_PATTERNS) {
        for (const m of raw.matchAll(re)) {
            signals.push({ text: m[0], sourceFloor, kind, confidence: 0.78 });
        }
    }

    // 时段
    for (const m of raw.matchAll(PART_OF_DAY_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'relative_time', confidence: 0.7 });
    }

    // 季节
    for (const m of raw.matchAll(SEASON_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'calendar_hint', confidence: 0.68 });
    }

    // 场景切换
    for (const m of raw.matchAll(SCENE_TRANSITION_RE)) {
        signals.push({ text: m[0], sourceFloor, kind: 'scene_transition', confidence: 0.6 });
    }

    return dedupeSignals(signals);
}

/**
 * 功能：去重信号（同一文本只保留置信度最高的）。
 */
function dedupeSignals(signals: TimelineSignal[]): TimelineSignal[] {
    const map = new Map<string, TimelineSignal>();
    for (const s of signals) {
        const key = s.text.trim();
        const existing = map.get(key);
        if (!existing || existing.confidence < s.confidence) {
            map.set(key, s);
        }
    }
    return Array.from(map.values());
}

/**
 * 功能：判断文本是否包含睡眠/醒来信号。
 * @param text 输入文本。
 * @returns 是否包含。
 */
export function detectSleepAndWake(text: string): string[] {
    const raw = String(text ?? '');
    const patterns = [
        /睡[了着觉过去下]/g,
        /入睡/g,
        /醒[了来过]/g,
        /天亮[了]?/g,
        /天[微刚]亮/g,
        /一觉/g,
        /沉沉睡去/g,
        /晨光/g,
    ];
    const hits: string[] = [];
    for (const re of patterns) {
        for (const m of raw.matchAll(re)) {
            hits.push(m[0]);
        }
    }
    return hits;
}

/**
 * 功能：检测场景切换信号。
 * @param text 输入文本。
 * @returns 场景切换描述列表。
 */
export function detectSceneTransitions(text: string): string[] {
    const raw = String(text ?? '');
    const hits: string[] = [];
    for (const m of raw.matchAll(SCENE_TRANSITION_RE)) {
        hits.push(m[0]);
    }
    return hits;
}

/**
 * 功能：检测硬切/跳转信号。
 * @param text 输入文本。
 * @returns 检测结果列表。
 */
export function detectHardCuts(text: string): string[] {
    const raw = String(text ?? '');
    const patterns = [
        /[几数][天日周月年]后/g,
        /[一二三四五六七八九十百千]+[天日周月年]后/g,
        /(\d+)\s*[天日周月年]\s*后/g,
        /很久以后/g,
        /多年以后/g,
        /不知过了多久/g,
    ];
    const hits: string[] = [];
    for (const re of patterns) {
        for (const m of raw.matchAll(re)) {
            hits.push(m[0]);
        }
    }
    return hits;
}
