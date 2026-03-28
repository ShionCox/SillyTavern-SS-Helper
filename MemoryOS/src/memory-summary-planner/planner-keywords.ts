import type { WorldProfileBinding } from '../types';
import {
    getWorldProfileById,
    type WorldProfileDefinition,
    type WorldProfileDetectionResult,
} from '../memory-world-profile';

export type KeywordStyle = 'general' | 'ancient' | 'modern' | 'trpg' | 'gangster' | 'fantasy';
export type NarrativeStyle = Exclude<KeywordStyle, 'general'>;

/**
 * 功能：描述当前轮次解析出的叙事风格。
 */
export interface ResolvedNarrativeStyle {
    primaryStyle: NarrativeStyle;
    secondaryStyles: NarrativeStyle[];
    source: 'binding' | 'binding_adjusted' | 'detected' | 'default';
    isStable: boolean;
}

/**
 * 功能：定义分风格词库。
 */
interface StyledKeywordLibrary {
    general: string[];
    ancient: string[];
    modern: string[];
    trpg: string[];
    gangster: string[];
    fantasy: string[];
}

/**
 * 功能：定义当前轮次生效的关键词集合。
 */
export interface ActiveKeywordSets {
    factPriorityRules: Record<string, string[]>;
    evidenceSignalLabels: Array<{ label: string; keywords: string[] }>;
    taskStateKeywords: string[];
    relationStateKeywords: string[];
    unresolvedKeywords: string[];
    evidenceSnippetKeywords: string[];
}

/**
 * 功能：定义风格解析输入。
 */
interface ResolveNarrativeStyleInput {
    worldProfileBinding?: WorldProfileBinding | null;
    worldProfileDetection: WorldProfileDetectionResult;
    windowSummaryText?: string;
    recentSummaryTexts?: string[];
}

/**
 * 功能：定义 world profile 到风格的基础映射。
 */
const WORLD_PROFILE_STYLE_MAP: Record<string, { primaryStyle: NarrativeStyle; secondaryStyles: NarrativeStyle[] }> = {
    urban_modern: { primaryStyle: 'modern', secondaryStyles: [] },
    ancient_traditional: { primaryStyle: 'ancient', secondaryStyles: [] },
    fantasy_magic: { primaryStyle: 'fantasy', secondaryStyles: [] },
    supernatural_hidden: { primaryStyle: 'modern', secondaryStyles: ['fantasy'] },
};

/**
 * 功能：定义风格识别信号词。
 */
const STYLE_SIGNAL_KEYWORDS: Record<NarrativeStyle, string[]> = {
    ancient: ['银票', '盘缠', '赴约', '江湖', '门派', '朝堂', '从实道来', '领命', '王都'],
    modern: ['转账', '订金', '定金', '合同', '城市', '公司', '警方', '说清楚', '现代'],
    trpg: ['跑团', '模组', '副本', '检定', '主持人', '团灭', '回城', '地下城', '任务板', '冒险者'],
    gangster: ['黑帮', '堂口', '码头', '分账', '灭口', '踩点', '保护费', '接活', '买命钱', '给面子'],
    fantasy: ['法阵', '契约', '灵石', '魔晶', '结界', '封印', '咒印', '传送', '王国', '龙族'],
};

/**
 * 功能：定义事实优先级词库。
 */
const FACT_PRIORITY_STYLE_LIBRARIES: Record<string, StyledKeywordLibrary> = {
    accept: {
        general: ['收下', '接受', '同意', '答应', '确认', '认可', '点头'],
        ancient: ['首肯', '允诺', '应允', '领命'],
        modern: ['没问题', '可以', '行', '接了'],
        trpg: ['接取', '立案', '任务确认'],
        gangster: ['接活', '接这单', '认这笔账'],
        fantasy: ['应誓', '受命', '缔约'],
    },
    reject: {
        general: ['拒绝', '回绝', '否决', '不行', '不能', '不会', '不准'],
        ancient: ['作罢', '免谈', '不可', '休想'],
        modern: ['拉倒', '算了', '不接', '不干'],
        trpg: ['检定失败', '无法通过', '不予受理'],
        gangster: ['推掉', '不给面子', '不接这活'],
        fantasy: ['违逆誓约', '拒绝缔约', '不应此约'],
    },
    demand: {
        general: ['要求', '条件', '必须', '先', '交代', '说明', '补充', '前提'],
        ancient: ['报上', '讲明', '从实道来', '先说清楚'],
        modern: ['说清楚', '讲清楚', '吐出来', '把话说全'],
        trpg: ['补充情报', '先过检定', '声明行动'],
        gangster: ['开价', '提条件', '交个实底', '把底细抖出来'],
        fantasy: ['呈明缘由', '献上情报', '先付代价', '满足契约条件'],
    },
    stateChange: {
        general: ['作废', '失效', '继续', '暂停', '终止', '成立', '维持', '中止', '恢复', '开始', '推进'],
        ancient: ['定下', '搁置', '暂缓', '依旧'],
        modern: ['重启', '落实', '敲定', '卡住'],
        trpg: ['进入下一阶段', '切换场景', '任务更新'],
        gangster: ['翻篇', '压下去', '摆平', '撕破脸'],
        fantasy: ['仪式中断', '契约生效', '封印解除', '法阵失效'],
    },
    transaction: {
        general: ['定金', '交易', '委托', '报酬', '接单', '支付', '付款', '尾款', '雇佣'],
        ancient: ['银票', '钱袋', '赏银', '盘缠'],
        modern: ['报价', '订金', '押金', '转账'],
        trpg: ['赏金任务', '任务报酬', '金币', '佣金'],
        gangster: ['买命钱', '保护费', '抽成', '分账'],
        fantasy: ['契约金', '魔晶', '悬赏令', '灵石'],
    },
    movement: {
        general: ['前往', '出发', '返回', '到达', '进入', '离开', '赶往', '动身', '启程'],
        ancient: ['赴约', '上路', '移步', '退下'],
        modern: ['过去', '撤回', '带路', '赶过去'],
        trpg: ['转场', '探索', '进入副本', '回城', '下地城'],
        gangster: ['踩点', '跑路', '撤', '去码头'],
        fantasy: ['传送', '御剑', '入阵', '穿过结界'],
    },
    relation: {
        general: ['怀疑', '信任', '戒备', '警告', '威胁', '试探', '克制', '提防', '敌视', '观察'],
        ancient: ['猜忌', '疏离', '缓和', '靠近', '对峙'],
        modern: ['不信', '示好', '拉拢', '施压', '翻脸'],
        trpg: ['敌对', '友善', '中立', '仇恨', '好感'],
        gangster: ['给面子', '不给面子', '试水', '压一头', '结梁子'],
        fantasy: ['缔盟', '敌意', '神谕影响', '契约牵连'],
    },
};

/**
 * 功能：定义证据信号词库。
 */
const EVIDENCE_SIGNAL_STYLE_LIBRARIES: Array<{ label: string; keywords: StyledKeywordLibrary }> = [
    {
        label: '支付定金',
        keywords: {
            general: ['定金', '支付', '付款', '报酬', '尾款'],
            ancient: ['银票', '赏银', '钱袋'],
            modern: ['订金', '押金', '转账'],
            trpg: ['金币', '任务报酬'],
            gangster: ['分账', '保护费'],
            fantasy: ['契约金', '灵石', '魔晶'],
        },
    },
    {
        label: '明确拒绝',
        keywords: {
            general: ['拒绝', '回绝', '不行', '不会', '不准', '否决'],
            ancient: ['作罢', '免谈'],
            modern: ['拉倒', '算了'],
            trpg: ['不予受理', '检定失败'],
            gangster: ['不给面子', '不接这活'],
            fantasy: ['拒绝缔约', '违逆誓约'],
        },
    },
    {
        label: '提出条件',
        keywords: {
            general: ['条件', '必须', '先', '前提', '代价'],
            ancient: ['规矩', '门槛'],
            modern: ['开价', '要价'],
            trpg: ['前置条件', '检定要求'],
            gangster: ['提条件', '交换条件'],
            fantasy: ['契约条件', '祭品', '代偿'],
        },
    },
    {
        label: '要求补充信息',
        keywords: {
            general: ['交代', '说明', '补充', '线索', '情报', '坦白'],
            ancient: ['报上', '从实道来'],
            modern: ['讲清楚', '吐干净'],
            trpg: ['补充情报', '调查结果'],
            gangster: ['交个实底', '把底细抖出来'],
            fantasy: ['呈明缘由', '献上情报'],
        },
    },
    {
        label: '确认任务推进',
        keywords: {
            general: ['委托', '接单', '成立', '确认', '推进', '执行'],
            ancient: ['定下', '领命'],
            modern: ['落实', '敲定'],
            trpg: ['任务更新', '接取任务'],
            gangster: ['接活', '开做'],
            fantasy: ['应誓', '启程讨伐'],
        },
    },
    {
        label: '关系戒备升高',
        keywords: {
            general: ['戒备', '警告', '威胁', '试探', '怀疑', '提防'],
            ancient: ['猜忌', '对峙'],
            modern: ['施压', '不信'],
            trpg: ['敌对', '仇恨'],
            gangster: ['不给面子', '结梁子'],
            fantasy: ['敌意', '诅咒反噬'],
        },
    },
    {
        label: '地点行动变化',
        keywords: {
            general: ['前往', '出发', '动身', '返回', '抵达', '进入', '离开'],
            ancient: ['赴约', '上路', '移步'],
            modern: ['赶过去', '过去一趟'],
            trpg: ['转场', '回城', '进入副本'],
            gangster: ['踩点', '去码头'],
            fantasy: ['传送', '御剑', '入阵'],
        },
    },
    {
        label: '任务中止或延后',
        keywords: {
            general: ['暂停', '中止', '终止', '延后', '推迟', '搁置', '作废', '失效'],
            ancient: ['暂缓', '改日再议'],
            modern: ['缓一缓', '往后放'],
            trpg: ['任务失败', '任务搁置'],
            gangster: ['先压下去', '缓办'],
            fantasy: ['封印中断', '仪式暂停'],
        },
    },
    {
        label: '调查与追查',
        keywords: {
            general: ['调查', '追查', '查清', '核实', '搜集', '排查'],
            ancient: ['访查', '探访'],
            modern: ['摸底', '查证'],
            trpg: ['侦查', '搜索', '感知检定'],
            gangster: ['盯梢', '打探'],
            fantasy: ['占卜', '追踪魔力', '探查'],
        },
    },
    {
        label: '风险与威胁',
        keywords: {
            general: ['危险', '风险', '麻烦', '威胁', '后果', '代价'],
            ancient: ['祸患', '后患'],
            modern: ['暴露', '出事'],
            trpg: ['团灭', '陷阱'],
            gangster: ['追杀', '灭口', '埋伏'],
            fantasy: ['诅咒', '反噬', '失控'],
        },
    },
];

/**
 * 功能：定义滚动摘要词库。
 */
const ROLLING_DIGEST_STYLE_LIBRARIES: Record<'taskState' | 'relationState' | 'unresolved', StyledKeywordLibrary> = {
    taskState: {
        general: ['定金', '支付', '付款', '交易', '委托', '接单', '任务', '状态', '推进', '阶段', '成立', '执行', '开始'],
        ancient: ['领命', '差事', '盘缠', '定下'],
        modern: ['落实', '部署', '安排', '善后'],
        trpg: ['任务更新', '阶段推进', '副本', '接取', '提交'],
        gangster: ['开做', '摆平', '收账', '踩点', '分账'],
        fantasy: ['讨伐', '封印', '仪式', '契约', '魔晶', '灵石'],
    },
    relationState: {
        general: ['怀疑', '信任', '戒备', '克制', '警告', '威胁', '试探', '冷淡', '合作', '提防', '敌视'],
        ancient: ['猜忌', '疏离', '缓和', '亲近', '对立'],
        modern: ['不满', '默契', '施压', '示好', '拉拢'],
        trpg: ['敌对', '友善', '中立', '仇恨', '好感'],
        gangster: ['给面子', '不给面子', '结梁子', '压一头'],
        fantasy: ['缔盟', '敌意', '契约牵连', '神谕影响'],
    },
    unresolved: {
        general: ['未知', '不明', '尚未', '缺少', '无法确认', '未确认', '不确定', '线索不足', '暂无结果', '待查'],
        ancient: ['未明', '未有定论', '无从知晓'],
        modern: ['没下文', '说不准', '尚不清楚', '无从得知'],
        trpg: ['线索断了', '情报不足', '检定未知'],
        gangster: ['底细不明', '来路不清', '上家未明'],
        fantasy: ['来历不明', '真伪未明', '来源成谜', '魔力未知'],
    },
};

/**
 * 功能：返回默认叙事风格。
 * @returns 默认风格结果。
 */
export function getDefaultNarrativeStyle(): ResolvedNarrativeStyle {
    return {
        primaryStyle: 'modern',
        secondaryStyles: [],
        source: 'default',
        isStable: false,
    };
}

/**
 * 功能：根据当前叙事风格构建生效关键词集合。
 * @param narrativeStyle 当前叙事风格。
 * @returns 生效关键词集合。
 */
export function buildActiveKeywordSets(narrativeStyle: ResolvedNarrativeStyle): ActiveKeywordSets {
    const evidenceSignalLabels: Array<{ label: string; keywords: string[] }> = EVIDENCE_SIGNAL_STYLE_LIBRARIES.map((item) => ({
        label: item.label,
        keywords: flattenStyledKeywordsForNarrativeStyle(item.keywords, narrativeStyle),
    }));
    return {
        factPriorityRules: Object.fromEntries(
            Object.entries(FACT_PRIORITY_STYLE_LIBRARIES).map(([key, library]: [string, StyledKeywordLibrary]) => [
                key,
                flattenStyledKeywordsForNarrativeStyle(library, narrativeStyle),
            ]),
        ) as Record<string, string[]>,
        evidenceSignalLabels,
        taskStateKeywords: flattenStyledKeywordsForNarrativeStyle(ROLLING_DIGEST_STYLE_LIBRARIES.taskState, narrativeStyle),
        relationStateKeywords: flattenStyledKeywordsForNarrativeStyle(ROLLING_DIGEST_STYLE_LIBRARIES.relationState, narrativeStyle),
        unresolvedKeywords: flattenStyledKeywordsForNarrativeStyle(ROLLING_DIGEST_STYLE_LIBRARIES.unresolved, narrativeStyle),
        evidenceSnippetKeywords: dedupeStrings(evidenceSignalLabels.flatMap((item) => item.keywords)),
    };
}

/**
 * 功能：结合 world profile、持久化绑定与当前窗口解析叙事风格。
 * @param input 解析输入。
 * @returns 当前轮次使用的叙事风格。
 */
export function resolveNarrativeStyle(input: ResolveNarrativeStyleInput): ResolvedNarrativeStyle {
    const binding: WorldProfileBinding | null | undefined = input.worldProfileBinding;
    const sourceProfile = binding?.primaryProfile
        ? {
            primaryProfile: binding.primaryProfile,
            secondaryProfiles: binding.secondaryProfiles ?? [],
            confidence: Number(binding.confidence ?? 0) || 0,
        }
        : {
            primaryProfile: input.worldProfileDetection.primaryProfile,
            secondaryProfiles: input.worldProfileDetection.secondaryProfiles ?? [],
            confidence: Number(input.worldProfileDetection.confidence ?? 0) || 0,
        };
    const mappedStyle = mapWorldProfileToNarrativeStyle(sourceProfile.primaryProfile, sourceProfile.secondaryProfiles);
    const profileSignalTexts: string[] = collectProfileSignalTexts(binding, input.worldProfileDetection);
    const stableProfileSignals: Array<{ style: NarrativeStyle; hitTexts: number; score: number }> = detectNarrativeStyleSignals(profileSignalTexts);
    const stableSecondaryStyles: NarrativeStyle[] = stableProfileSignals
        .map((item) => item.style)
        .filter((style) => style !== mappedStyle.primaryStyle);
    const windowSignals: Array<{ style: NarrativeStyle; hitTexts: number; score: number }> = detectNarrativeStyleSignals([
        input.windowSummaryText ?? '',
        ...(input.recentSummaryTexts ?? []).slice(0, 3),
    ]);
    const topWindowSignal: { style: NarrativeStyle; hitTexts: number; score: number } | undefined = windowSignals[0];
    const hasBinding: boolean = Boolean(binding?.primaryProfile);
    const conflictWithBinding: boolean = Boolean(
        hasBinding
        && topWindowSignal
        && topWindowSignal.style !== mappedStyle.primaryStyle
        && !mappedStyle.secondaryStyles.includes(topWindowSignal.style)
        && !stableSecondaryStyles.includes(topWindowSignal.style)
        && topWindowSignal.hitTexts >= 2,
    );

    if (!hasBinding && !sourceProfile.primaryProfile) {
        return {
            primaryStyle: 'modern',
            secondaryStyles: dedupeNarrativeStyles(windowSignals.slice(0, 2).map((item) => item.style).filter((style) => style !== 'modern')),
            source: 'default',
            isStable: false,
        };
    }

    if (hasBinding) {
        return {
            primaryStyle: mappedStyle.primaryStyle,
            secondaryStyles: dedupeNarrativeStyles([
                ...mappedStyle.secondaryStyles,
                ...stableSecondaryStyles,
                ...(conflictWithBinding && topWindowSignal ? [topWindowSignal.style] : []),
            ]),
            source: conflictWithBinding ? 'binding_adjusted' : 'binding',
            isStable: sourceProfile.confidence >= 0.75 && !conflictWithBinding,
        };
    }

    return {
        primaryStyle: mappedStyle.primaryStyle,
        secondaryStyles: dedupeNarrativeStyles([
            ...mappedStyle.secondaryStyles,
            ...stableSecondaryStyles,
            ...windowSignals
                .filter((item) => item.style !== mappedStyle.primaryStyle)
                .slice(0, 2)
                .map((item) => item.style),
        ]),
        source: sourceProfile.confidence > 0 ? 'detected' : 'default',
        isStable: sourceProfile.confidence >= 0.8 && (!topWindowSignal || topWindowSignal.style === mappedStyle.primaryStyle),
    };
}

/**
 * 功能：收集 world profile 侧的稳定风格信号文本。
 * @param binding 持久化绑定。
 * @param detection 当前检测结果。
 * @returns 稳定信号文本列表。
 */
function collectProfileSignalTexts(
    binding: WorldProfileBinding | null | undefined,
    detection: WorldProfileDetectionResult,
): string[] {
    const profileIds: string[] = dedupeStrings([
        binding?.primaryProfile ?? '',
        ...(binding?.secondaryProfiles ?? []),
        detection.primaryProfile,
        ...(detection.secondaryProfiles ?? []),
    ].map((item) => normalizeProfileId(item)));
    const profileTexts: string[] = profileIds.flatMap((profileId) => buildProfileSignalTexts(getWorldProfileById(profileId)));
    return dedupeStrings([
        ...(binding?.reasonCodes ?? []),
        ...(binding?.detectedFrom ?? []),
        ...(detection.reasonCodes ?? []),
        ...profileTexts,
    ]);
}

/**
 * 功能：从单个 world profile 定义中提取风格提示文本。
 * @param profile world profile 定义。
 * @returns 风格提示文本。
 */
function buildProfileSignalTexts(profile: WorldProfileDefinition | null | undefined): string[] {
    if (!profile) {
        return [];
    }
    return dedupeStrings([
        profile.worldProfileId,
        profile.genre,
        profile.injectionStyle,
        ...(profile.subGenres ?? []),
        ...(profile.detectionKeywords ?? []),
        ...(profile.styleHintKeywords ?? []),
    ]);
}

/**
 * 功能：将分风格词库按当前叙事风格扁平化。
 * @param library 分风格词库。
 * @param narrativeStyle 当前叙事风格。
 * @returns 生效关键词列表。
 */
function flattenStyledKeywordsForNarrativeStyle(
    library: StyledKeywordLibrary,
    narrativeStyle: ResolvedNarrativeStyle,
): string[] {
    const activeStyles: NarrativeStyle[] = [narrativeStyle.primaryStyle, ...narrativeStyle.secondaryStyles];
    return dedupeStrings([
        ...library.general,
        ...activeStyles.flatMap((style: NarrativeStyle): string[] => library[style] ?? []),
    ]);
}

/**
 * 功能：将 world profile 映射为基础叙事风格。
 * @param primaryProfile 主 profile。
 * @param secondaryProfiles 次 profile。
 * @returns 主次风格结果。
 */
function mapWorldProfileToNarrativeStyle(
    primaryProfile: string,
    secondaryProfiles: string[],
): Pick<ResolvedNarrativeStyle, 'primaryStyle' | 'secondaryStyles'> {
    const normalizedPrimaryProfile: string = normalizeProfileId(primaryProfile);
    const primaryStyle: NarrativeStyle = WORLD_PROFILE_STYLE_MAP[normalizedPrimaryProfile]?.primaryStyle ?? 'modern';
    const normalizedSecondaryProfiles: string[] = dedupeStrings(secondaryProfiles.map((item) => normalizeProfileId(item)));
    const secondaryStyles: NarrativeStyle[] = dedupeNarrativeStyles([
        ...(WORLD_PROFILE_STYLE_MAP[normalizedPrimaryProfile]?.secondaryStyles ?? []),
        ...normalizedSecondaryProfiles.flatMap((profileId: string): NarrativeStyle[] => {
            const mapped = WORLD_PROFILE_STYLE_MAP[profileId];
            if (!mapped) {
                return [];
            }
            return [mapped.primaryStyle, ...mapped.secondaryStyles];
        }),
    ].filter((style: NarrativeStyle) => style !== primaryStyle));
    return {
        primaryStyle,
        secondaryStyles,
    };
}

/**
 * 功能：探测文本中的风格信号。
 * @param texts 文本列表。
 * @returns 命中的风格信号结果。
 */
function detectNarrativeStyleSignals(texts: string[]): Array<{ style: NarrativeStyle; hitTexts: number; score: number }> {
    const normalizedTexts: string[] = texts.map((text) => normalizeChineseText(text)).filter(Boolean);
    return (Object.entries(STYLE_SIGNAL_KEYWORDS) as Array<[NarrativeStyle, string[]]>)
        .map(([style, keywords]: [NarrativeStyle, string[]]) => {
            let hitTexts: number = 0;
            let score: number = 0;
            for (const text of normalizedTexts) {
                const matchedCount: number = keywords.filter((keyword) => text.includes(keyword)).length;
                if (matchedCount > 0) {
                    hitTexts += 1;
                    score += matchedCount;
                }
            }
            return { style, hitTexts, score };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.hitTexts - left.hitTexts || right.score - left.score);
}

/**
 * 功能：对叙事风格数组去重。
 * @param styles 风格列表。
 * @returns 去重后的风格列表。
 */
function dedupeNarrativeStyles(styles: NarrativeStyle[]): NarrativeStyle[] {
    const result: NarrativeStyle[] = [];
    for (const style of styles) {
        if (style && !result.includes(style)) {
            result.push(style);
        }
    }
    return result;
}

/**
 * 功能：归一化 world profile 标识。
 * @param value 原始值。
 * @returns 标准化后的 profile 标识。
 */
function normalizeProfileId(value: unknown): string {
    return String(value ?? '').trim().replace(/-/g, '_').toLowerCase();
}

/**
 * 功能：归一化中文文本。
 * @param value 原始值。
 * @returns 归一化后的文本。
 */
function normalizeChineseText(value: unknown): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * 功能：对字符串数组去重并去空。
 * @param values 原始数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized: string = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
