import type {
    AutoSummaryMode,
    AutoSummaryRuntimeState,
    AutoSummaryTriggerSettings,
    ChatProfile,
    LogicalChatView,
    PostGenerationGateDecision,
    SummaryLongTrigger,
} from '../types';
import {
    getSummaryTriggerRule,
    listSummaryTriggerRules,
} from './summary-trigger-registry';

export interface SemanticChangeSummary {
    score: number;
    hasImportantEvent: boolean;
    hasUserCorrection: boolean;
    hasWorldStateShift: boolean;
    hasRelationshipShift: boolean;
    hasLocationShift: boolean;
    hasTimeShift: boolean;
    reasonCodes: string[];
}

export interface TriggerMatchScore {
    score: number;
    matchedTriggerIds: SummaryLongTrigger[];
    reasonCodes: string[];
    matchedEarlyTrigger: boolean;
}

export interface AutoSummaryDecisionResult {
    shouldRun: boolean;
    reasonCodes: string[];
    threshold: number;
    mode: AutoSummaryMode;
    matchedTriggerIds: SummaryLongTrigger[];
    turnsSinceLastSummary: number;
    scores: {
        triggerRule: number;
        semantic: number;
        pressure: number;
    };
}

/**
 * 功能：根据聊天画像与上下文推导自动总结模式。
 * 参数：
 *   input：模式推导输入。
 * 返回：
 *   AutoSummaryMode：推导得到的自动总结模式。
 */
export function resolveAutoSummaryMode(input: {
    presetStyle?: string | null;
    chatProfile?: Pick<ChatProfile, 'chatType' | 'stylePreference'> | null;
    logicalView?: LogicalChatView | null;
}): AutoSummaryMode {
    const chatType = String(input.chatProfile?.chatType ?? '').trim();
    const style = String(input.chatProfile?.stylePreference ?? input.presetStyle ?? '').trim();
    if (chatType === 'group' || style === 'trpg') {
        return 'roleplay';
    }
    if (chatType === 'tool' || style === 'qa' || style === 'info') {
        return 'chat';
    }
    if (style === 'story') {
        return 'story';
    }

    const mutationKinds = Array.isArray(input.logicalView?.mutationKinds) ? input.logicalView!.mutationKinds : [];
    if (mutationKinds.includes('chat_branched') || mutationKinds.includes('message_swiped')) {
        return 'story';
    }
    return 'mixed';
}

/**
 * 功能：从窗口文本中计算触发规则匹配分数。
 * 参数：
 *   input：触发规则评分输入。
 * 返回：
 *   TriggerMatchScore：触发规则评分结果。
 */
export function scoreSummaryTriggerMatches(input: {
    textWindow: string;
    enabledTriggerIds: SummaryLongTrigger[];
}): TriggerMatchScore {
    const normalizedText = normalizeTextWindow(input.textWindow);
    if (!normalizedText) {
        return {
            score: 0,
            matchedTriggerIds: [],
            reasonCodes: [],
            matchedEarlyTrigger: false,
        };
    }

    const enabled = new Set(input.enabledTriggerIds);
    const allRules = listSummaryTriggerRules().filter((rule) => enabled.has(rule.id));
    const matchedTriggerIds: SummaryLongTrigger[] = [];
    const reasonCodes: string[] = [];
    let score = 0;
    let matchedEarlyTrigger = false;

    for (const rule of allRules) {
        const keywordHitCount = countKeywordHits(normalizedText, rule.keywords);
        const regexHit = Array.isArray(rule.regexes) && rule.regexes.some((regex: RegExp): boolean => regex.test(normalizedText));
        if (keywordHitCount <= 0 && !regexHit) {
            continue;
        }
        const perRuleScore = Math.min(
            rule.defaultWeight + (keywordHitCount >= 2 ? 0.08 : keywordHitCount > 0 ? 0.04 : 0) + (regexHit ? 0.08 : 0),
            1.2,
        );
        score += perRuleScore;
        matchedTriggerIds.push(rule.id);
        reasonCodes.push(`trigger_match:${rule.id}`);
        if (rule.allowEarlyTrigger) {
            matchedEarlyTrigger = true;
        }
    }

    return {
        score: Number(Math.min(score, 1.5).toFixed(3)),
        matchedTriggerIds,
        reasonCodes,
        matchedEarlyTrigger,
    };
}

/**
 * 功能：构建语义变化摘要，用于自动总结提前触发判定。
 * 参数：
 *   input：语义变化摘要输入。
 * 返回：
 *   SemanticChangeSummary：语义变化摘要结果。
 */
export function buildSemanticChangeSummary(input: {
    textWindow: string;
    logicalView?: LogicalChatView | null;
    postGate?: PostGenerationGateDecision | null;
}): SemanticChangeSummary {
    const text = normalizeTextWindow(input.textWindow);
    const reasonCodes: string[] = [];
    const mutationKinds = Array.isArray(input.logicalView?.mutationKinds) ? input.logicalView!.mutationKinds : [];

    const hasLocationShift = /来到|抵达|前往|离开|返回|回到|迁移|撤离|驻扎|出城|入城/.test(text);
    const hasTimeShift = /次日|翌日|夜深|清晨|黄昏|黎明|傍晚|数小时后|第二天/.test(text);
    const hasRelationshipShift = /和解|决裂|背叛|信任|怀疑|喜欢|爱上|疏远|结盟|吃醋|示好|回避|依赖/.test(text)
        || input.postGate?.valueClass === 'relationship_shift';
    const hasWorldStateShift = /设定更新|世界规则|禁令|解禁|政变|局势变化|补充设定|更新设定|改一下背景|重新定义/.test(text)
        || Boolean(input.postGate?.shouldUpdateWorldState)
        || Boolean(input.postGate?.shouldExtractWorldState);
    const hasUserCorrection = /更正|修正|覆盖之前|撤回上一条|改口|不对，改成|以后按这个来|记住|别忘了/.test(text)
        || mutationKinds.some((kind: string): boolean => kind === 'message_edited' || kind === 'message_deleted' || kind === 'message_swiped');
    const hasImportantEvent = /真相|暴露身份|真正身份|觉醒|反转|结局|落幕|阶段完成|任务完成|主线/.test(text)
        || input.postGate?.valueClass === 'setting_confirmed';

    if (hasLocationShift) reasonCodes.push('semantic:location_shift');
    if (hasTimeShift) reasonCodes.push('semantic:time_shift');
    if (hasRelationshipShift) reasonCodes.push('semantic:relationship_shift');
    if (hasWorldStateShift) reasonCodes.push('semantic:world_state_shift');
    if (hasUserCorrection) reasonCodes.push('semantic:user_correction');
    if (hasImportantEvent) reasonCodes.push('semantic:important_event');

    const score = clampScore(
        (hasLocationShift ? 0.16 : 0)
        + (hasTimeShift ? 0.12 : 0)
        + (hasRelationshipShift ? 0.28 : 0)
        + (hasWorldStateShift ? 0.32 : 0)
        + (hasUserCorrection ? 0.34 : 0)
        + (hasImportantEvent ? 0.3 : 0),
    );

    return {
        score,
        hasImportantEvent,
        hasUserCorrection,
        hasWorldStateShift,
        hasRelationshipShift,
        hasLocationShift,
        hasTimeShift,
        reasonCodes,
    };
}

/**
 * 功能：综合阈值、触发规则、语义变化与上下文压力，判定是否执行自动长总结。
 * 参数：
 *   input：自动长总结判定输入。
 * 返回：
 *   AutoSummaryDecisionResult：自动长总结判定结果。
 */
export function shouldRunAutoSummary(input: {
    settings: AutoSummaryTriggerSettings;
    runtime: AutoSummaryRuntimeState | null;
    activeAssistantTurnCount: number;
    currentMode: AutoSummaryMode;
    textWindow: string;
    enabledTriggerIds: SummaryLongTrigger[];
    semanticChange: SemanticChangeSummary;
    promptPressureRatio: number;
}): AutoSummaryDecisionResult {
    const reasonCodes: string[] = [];
    const threshold = getThresholdByMode(input.settings, input.currentMode);
    const safeTurnCount = Math.max(0, Math.round(Number(input.activeAssistantTurnCount ?? 0)));
    const lastSummaryTurnCount = Math.max(0, Math.round(Number(input.runtime?.lastSummaryTurnCount ?? 0)));
    const turnsSinceLastSummary = Math.max(0, safeTurnCount - lastSummaryTurnCount);

    if (!input.settings.enabled) {
        return buildDecisionResult(false, input, threshold, turnsSinceLastSummary, reasonCodes, [], 0, input.semanticChange.score);
    }

    if (turnsSinceLastSummary < Math.max(0, input.settings.minTurnsAfterLastSummary)) {
        reasonCodes.push('auto_summary_blocked:min_turn_gap');
        return buildDecisionResult(false, input, threshold, turnsSinceLastSummary, reasonCodes, [], 0, input.semanticChange.score);
    }

    if (turnsSinceLastSummary <= Math.max(0, input.settings.coolDownTurns)) {
        reasonCodes.push('auto_summary_blocked:cooldown');
        return buildDecisionResult(false, input, threshold, turnsSinceLastSummary, reasonCodes, [], 0, input.semanticChange.score);
    }

    const triggerScore = input.settings.enableTriggerRules
        ? scoreSummaryTriggerMatches({
            textWindow: input.textWindow,
            enabledTriggerIds: input.enabledTriggerIds,
        })
        : {
            score: 0,
            matchedTriggerIds: [] as SummaryLongTrigger[],
            reasonCodes: [] as string[],
            matchedEarlyTrigger: false,
        };
    reasonCodes.push(...triggerScore.reasonCodes);

    const semanticPassed = input.settings.enableSemanticChangeTrigger
        && input.semanticChange.score >= input.settings.semanticTriggerMinScore;
    const pressurePassed = input.settings.enablePromptPressureTrigger
        && Number(input.promptPressureRatio) >= input.settings.promptPressureTokenRatio;
    const triggerPassed = triggerScore.score >= input.settings.triggerRuleMinScore;

    const thresholdReached = turnsSinceLastSummary >= threshold;
    const earlyTrigger = triggerScore.matchedEarlyTrigger
        || input.semanticChange.hasImportantEvent
        || input.semanticChange.hasUserCorrection;

    if (earlyTrigger && (triggerPassed || semanticPassed)) {
        reasonCodes.push('auto_summary:early_trigger');
        return buildDecisionResult(true, input, threshold, turnsSinceLastSummary, reasonCodes, triggerScore.matchedTriggerIds, triggerScore.score, input.semanticChange.score);
    }

    if (thresholdReached && (triggerPassed || semanticPassed || pressurePassed)) {
        reasonCodes.push('auto_summary:threshold_reached');
        return buildDecisionResult(true, input, threshold, turnsSinceLastSummary, reasonCodes, triggerScore.matchedTriggerIds, triggerScore.score, input.semanticChange.score);
    }

    reasonCodes.push('auto_summary:not_reached');
    return buildDecisionResult(false, input, threshold, turnsSinceLastSummary, reasonCodes, triggerScore.matchedTriggerIds, triggerScore.score, input.semanticChange.score);
}

/**
 * 功能：按模式读取楼层阈值。
 * 参数：
 *   settings：自动总结设置。
 *   mode：自动总结模式。
 * 返回：
 *   number：对应模式阈值。
 */
function getThresholdByMode(settings: AutoSummaryTriggerSettings, mode: AutoSummaryMode): number {
    if (mode === 'roleplay') return Math.max(1, settings.roleplayTurnThreshold);
    if (mode === 'chat') return Math.max(1, settings.chatTurnThreshold);
    if (mode === 'story') return Math.max(1, settings.storyTurnThreshold);
    return Math.max(1, settings.mixedTurnThreshold);
}

/**
 * 功能：构建自动总结判定结果对象。
 * 参数：
 *   shouldRun：是否触发。
 *   input：判定输入。
 *   threshold：阈值。
 *   turnsSinceLastSummary：距上次总结楼层差。
 *   reasonCodes：原因码。
 *   matchedTriggerIds：命中触发器。
 *   triggerScore：触发器分数。
 *   semanticScore：语义分数。
 * 返回：
 *   AutoSummaryDecisionResult：判定结果。
 */
function buildDecisionResult(
    shouldRun: boolean,
    input: {
        currentMode: AutoSummaryMode;
        promptPressureRatio: number;
    },
    threshold: number,
    turnsSinceLastSummary: number,
    reasonCodes: string[],
    matchedTriggerIds: SummaryLongTrigger[],
    triggerScore: number,
    semanticScore: number,
): AutoSummaryDecisionResult {
    return {
        shouldRun,
        reasonCodes: Array.from(new Set(reasonCodes.filter(Boolean))),
        threshold,
        mode: input.currentMode,
        matchedTriggerIds,
        turnsSinceLastSummary,
        scores: {
            triggerRule: clampScore(triggerScore),
            semantic: clampScore(semanticScore),
            pressure: clampScore(Number(input.promptPressureRatio ?? 0)),
        },
    };
}

/**
 * 功能：归一化窗口文本，便于关键词和正则匹配。
 * 参数：
 *   value：原始文本。
 * 返回：
 *   string：归一化文本。
 */
function normalizeTextWindow(value: string): string {
    return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * 功能：统计关键词命中数量。
 * 参数：
 *   text：归一化文本。
 *   keywords：关键词列表。
 * 返回：
 *   number：命中关键词数量。
 */
function countKeywordHits(text: string, keywords: string[]): number {
    let count = 0;
    const seen = new Set<string>();
    for (const rawKeyword of keywords) {
        const keyword = normalizeTextWindow(rawKeyword);
        if (!keyword || seen.has(keyword)) {
            continue;
        }
        seen.add(keyword);
        if (text.includes(keyword)) {
            count += 1;
        }
    }
    return count;
}

/**
 * 功能：裁剪分数到可读范围。
 * 参数：
 *   value：原始分数。
 * 返回：
 *   number：裁剪后的分数。
 */
function clampScore(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Number(Math.max(0, Math.min(1.5, value)).toFixed(3));
}

/**
 * 功能：读取触发器是否允许提前触发，供 UI 展示使用。
 * 参数：
 *   triggerId：触发器 ID。
 * 返回：
 *   boolean：允许提前触发返回 true。
 */
export function isEarlyTriggerEnabled(triggerId: SummaryLongTrigger): boolean {
    return Boolean(getSummaryTriggerRule(triggerId)?.allowEarlyTrigger);
}
