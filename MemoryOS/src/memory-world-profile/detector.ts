import type { WorldProfileDefinition, WorldProfileDetectionResult } from './types';
import { listWorldProfiles } from './registry';

export interface DetectWorldProfileSignal {
    text: string;
    sourceType?: 'system_prompt' | 'scenario' | 'worldbook' | 'author_note' | 'recent_event' | 'query' | 'entry_summary' | 'generic';
    weight?: number;
}

/**
 * 功能：世界模板识别输入。
 */
export interface DetectWorldProfileInput {
    texts?: string[];
    signals?: DetectWorldProfileSignal[];
    fallbackProfileId?: string;
}

interface ProfileScoreRow {
    profile: WorldProfileDefinition;
    score: number;
    reasonCodes: string[];
    matchedKeywords: string[];
    conflictKeywords: string[];
    sourceTypes: string[];
}

/**
 * 功能：根据文本线索检测世界模板。
 * @param input 识别输入。
 * @returns 世界模板识别结果。
 */
export function detectWorldProfile(input: DetectWorldProfileInput): WorldProfileDetectionResult {
    const profiles = listWorldProfiles();
    const signals = normalizeSignals(input);
    const scoreRows = profiles
        .map((profile: WorldProfileDefinition): ProfileScoreRow => scoreProfile(signals, profile, profiles))
        .sort((left, right): number => right.score - left.score);
    const top = scoreRows[0];
    const secondaries = scoreRows
        .slice(1)
        .filter((row): boolean => row.score > 0 && row.score >= Math.max(1.6, Number((top?.score ?? 0) * 0.58)))
        .slice(0, 2);
    const fallbackProfileId = String(input.fallbackProfileId ?? '').trim();
    const primaryId = top?.score > 0
        ? top.profile.worldProfileId
        : (fallbackProfileId || profiles[0]?.worldProfileId || 'urban_modern');
    const confidence = buildConfidence(top, scoreRows[1], signals.length);
    const mixedProfileCandidate = secondaries.length > 0 && top?.score
        && Math.abs(top.score - secondaries[0].score) <= 2.2
        ? secondaries[0].profile.worldProfileId
        : '';
    const reasonCodes = top?.reasonCodes?.length
        ? top.reasonCodes.slice(0, 8)
        : ['fallback_profile'];

    return {
        primaryProfile: primaryId,
        secondaryProfiles: secondaries.map((item): string => item.profile.worldProfileId),
        confidence,
        reasonCodes: mixedProfileCandidate ? [...reasonCodes, `mixed:${mixedProfileCandidate}`] : reasonCodes,
        matchedKeywords: uniqueStrings(top?.matchedKeywords ?? []),
        conflictKeywords: uniqueStrings(top?.conflictKeywords ?? []),
        sourceTypes: uniqueStrings(top?.sourceTypes ?? []),
        mixedProfileCandidate,
    };
}

/**
 * 功能：对单个模板进行多信号加权打分。
 * @param signals 输入信号列表。
 * @param profile 世界模板。
 * @param profiles 全部画像列表。
 * @returns 匹配分数与命中原因。
 */
function scoreProfile(
    signals: DetectWorldProfileSignal[],
    profile: WorldProfileDefinition,
    profiles: WorldProfileDefinition[],
): ProfileScoreRow {
    if (!signals.length) {
        return { profile, score: 0, reasonCodes: [], matchedKeywords: [], conflictKeywords: [], sourceTypes: [] };
    }
    let score = 0;
    const reasonCodes: string[] = [];
    const matchedKeywords: string[] = [];
    const conflictKeywords: string[] = [];
    const sourceTypes: string[] = [];

    for (const signal of signals) {
        const signalText = normalizeText(signal.text);
        if (!signalText) {
            continue;
        }
        const sourceType = normalizeSourceType(signal.sourceType);
        const signalWeight = resolveSourceWeight(sourceType) * clampSignalWeight(signal.weight);
        let signalMatched = false;

        for (const keyword of profile.detectionKeywords) {
            const normalizedKeyword = normalizeText(keyword);
            if (!normalizedKeyword || !signalText.includes(normalizedKeyword)) {
                continue;
            }
            score += (normalizedKeyword.length >= 3 ? 1.55 : 1.1) * signalWeight;
            matchedKeywords.push(normalizedKeyword);
            reasonCodes.push(`kw:${normalizedKeyword}`);
            signalMatched = true;
        }

        for (const keyword of profile.styleHintKeywords ?? []) {
            const normalizedKeyword = normalizeText(keyword);
            if (!normalizedKeyword || !signalText.includes(normalizedKeyword)) {
                continue;
            }
            score += 0.65 * signalWeight;
            reasonCodes.push(`style:${normalizedKeyword}`);
            signalMatched = true;
        }

        const themeHit = resolveThemeHitScore(profile.worldProfileId, signalText);
        if (themeHit.score > 0) {
            score += themeHit.score * signalWeight;
            reasonCodes.push(`theme:${themeHit.reasonCode}`);
            signalMatched = true;
        }

        const conflict = resolveConflictPenalty(profile, profiles, signalText, signalWeight);
        if (conflict.penalty > 0) {
            score -= conflict.penalty;
            conflictKeywords.push(...conflict.conflictKeywords);
            reasonCodes.push(...conflict.reasonCodes);
        }

        if (signalMatched) {
            sourceTypes.push(sourceType);
            reasonCodes.push(`signal:${sourceType}`);
        }
    }

    return {
        profile,
        score: Number(Math.max(0, score).toFixed(4)),
        reasonCodes: uniqueStrings(reasonCodes),
        matchedKeywords: uniqueStrings(matchedKeywords),
        conflictKeywords: uniqueStrings(conflictKeywords),
        sourceTypes: uniqueStrings(sourceTypes),
    };
}

/**
 * 功能：把输入归一化为多信号列表。
 * @param input 识别输入。
 * @returns 标准化信号。
 */
function normalizeSignals(input: DetectWorldProfileInput): DetectWorldProfileSignal[] {
    const directSignals = Array.isArray(input.signals) ? input.signals : [];
    if (directSignals.length > 0) {
        return directSignals
            .map((signal: DetectWorldProfileSignal): DetectWorldProfileSignal => ({
                text: String(signal.text ?? '').trim(),
                sourceType: normalizeSourceType(signal.sourceType),
                weight: clampSignalWeight(signal.weight),
            }))
            .filter((signal: DetectWorldProfileSignal): boolean => Boolean(signal.text));
    }
    return (Array.isArray(input.texts) ? input.texts : [])
        .map((text: string): DetectWorldProfileSignal => ({
            text: String(text ?? '').trim(),
            sourceType: 'generic',
            weight: 1,
        }))
        .filter((signal: DetectWorldProfileSignal): boolean => Boolean(signal.text));
}

/**
 * 功能：标准化来源类型。
 * @param value 原始值。
 * @returns 来源类型。
 */
function normalizeSourceType(value: unknown): NonNullable<DetectWorldProfileSignal['sourceType']> {
    const normalized = String(value ?? '').trim().toLowerCase();
    switch (normalized) {
        case 'system_prompt':
        case 'scenario':
        case 'worldbook':
        case 'author_note':
        case 'recent_event':
        case 'query':
        case 'entry_summary':
            return normalized;
        default:
            return 'generic';
    }
}

/**
 * 功能：根据来源类型解析权重。
 * @param sourceType 来源类型。
 * @returns 权重值。
 */
function resolveSourceWeight(sourceType: DetectWorldProfileSignal['sourceType']): number {
    switch (sourceType) {
        case 'system_prompt': return 2.5;
        case 'scenario': return 2.35;
        case 'worldbook': return 2.15;
        case 'author_note': return 1.7;
        case 'query': return 1.35;
        case 'recent_event': return 1.15;
        case 'entry_summary': return 0.9;
        default: return 1;
    }
}

/**
 * 功能：命中主题群时补充额外得分。
 * @param profileId 画像标识。
 * @param signalText 信号文本。
 * @returns 主题命中结果。
 */
function resolveThemeHitScore(profileId: string, signalText: string): { score: number; reasonCode: string } {
    const themeMap: Record<string, Array<{ pattern: RegExp; score: number; reasonCode: string }>> = {
        urban_modern: [
            { pattern: /公司|学校|写字楼|地铁|警局|媒体|互联网|校园|职场/u, score: 1.35, reasonCode: 'modern_order' },
            { pattern: /任务|项目|组织流程|公共秩序/u, score: 0.9, reasonCode: 'urban_structure' },
        ],
        ancient_traditional: [
            { pattern: /礼制|礼法|门第|朝堂|宗门|门派|尊卑|世家/u, score: 1.45, reasonCode: 'ancient_order' },
            { pattern: /诏令|掌门|拜帖|族谱|嫡庶/u, score: 1.05, reasonCode: 'lineage_hierarchy' },
        ],
        fantasy_magic: [
            { pattern: /法则|阵营|魔力|圣物|种族|王国|结界|禁忌/u, score: 1.5, reasonCode: 'magic_order' },
            { pattern: /地下城|预言|秘银|祭司|龙族/u, score: 1.1, reasonCode: 'epic_elements' },
        ],
        supernatural_hidden: [
            { pattern: /异常|灵异|都市传说|掩饰|表世界|里世界|公开身份|隐藏组织/u, score: 1.55, reasonCode: 'hidden_layers' },
            { pattern: /封印|调查局|夜巡|伪装|暴露风险/u, score: 1.15, reasonCode: 'concealed_supernatural' },
        ],
    };
    const matched = (themeMap[profileId] ?? []).find((item) => item.pattern.test(signalText));
    return matched ?? { score: 0, reasonCode: '' };
}

/**
 * 功能：给相冲突的画像词添加惩罚。
 * @param profile 当前画像。
 * @param profiles 全部画像。
 * @param signalText 信号文本。
 * @param signalWeight 信号权重。
 * @returns 惩罚结果。
 */
function resolveConflictPenalty(
    profile: WorldProfileDefinition,
    profiles: WorldProfileDefinition[],
    signalText: string,
    signalWeight: number,
): { penalty: number; conflictKeywords: string[]; reasonCodes: string[] } {
    let penalty = 0;
    const conflictKeywords: string[] = [];
    const reasonCodes: string[] = [];
    for (const rival of profiles) {
        if (rival.worldProfileId === profile.worldProfileId) {
            continue;
        }
        const rivalMatches = rival.detectionKeywords
            .map((keyword: string): string => normalizeText(keyword))
            .filter((keyword: string): boolean => Boolean(keyword) && signalText.includes(keyword))
            .slice(0, 2);
        if (rivalMatches.length <= 0) {
            continue;
        }
        penalty += rivalMatches.length * 0.38 * signalWeight;
        conflictKeywords.push(...rivalMatches);
        rivalMatches.forEach((keyword: string): void => {
            reasonCodes.push(`conflict:${keyword}`);
        });
    }
    return {
        penalty: Number(penalty.toFixed(4)),
        conflictKeywords: uniqueStrings(conflictKeywords),
        reasonCodes: uniqueStrings(reasonCodes),
    };
}

/**
 * 功能：综合主分、分差与来源覆盖度生成置信度。
 * @param top 第一名。
 * @param second 第二名。
 * @param signalCount 信号数量。
 * @returns 0~1 置信度。
 */
function buildConfidence(
    top: ProfileScoreRow | undefined,
    second: ProfileScoreRow | undefined,
    signalCount: number,
): number {
    if (!top?.score) {
        return 0.25;
    }
    const gap = Math.max(0, top.score - Number(second?.score ?? 0));
    const coverage = top.sourceTypes.length <= 0 ? 0.2 : Math.min(1, top.sourceTypes.length / Math.max(1, signalCount));
    const scoreFactor = Math.min(1, top.score / 7.8);
    const gapFactor = Math.min(1, gap / Math.max(1.4, top.score));
    const conflictPenalty = Math.min(0.18, top.conflictKeywords.length * 0.03);
    return clamp01(0.25 + scoreFactor * 0.42 + gapFactor * 0.23 + coverage * 0.18 - conflictPenalty);
}

/**
 * 功能：归一化文本。
 * @param value 原始文本。
 * @returns 归一化结果。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：限制信号权重范围。
 * @param value 原始值。
 * @returns 权重值。
 */
function clampSignalWeight(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 1;
    }
    return Math.max(0.4, Math.min(3, Number(numeric.toFixed(3))));
}

/**
 * 功能：限制 0~1 区间。
 * @param value 原始值。
 * @returns 限制后的值。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function uniqueStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
