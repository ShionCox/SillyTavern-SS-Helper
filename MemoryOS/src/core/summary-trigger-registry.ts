import type { SummaryLongTrigger } from '../types';

export type SummaryTriggerCategory = 'scene' | 'combat' | 'plot' | 'relationship' | 'world' | 'repair' | 'archive' | 'intent' | 'identity' | 'status';

export type SummaryTriggerSignalKind =
    | 'keyword'
    | 'regex'
    | 'entity_shift'
    | 'location_shift'
    | 'time_shift'
    | 'relationship_shift'
    | 'world_state_shift'
    | 'user_intent';

export interface SummaryTriggerRule {
    id: SummaryLongTrigger;
    label: string;
    description: string;
    category: SummaryTriggerCategory;
    keywords: string[];
    regexes?: RegExp[];
    signalKinds: SummaryTriggerSignalKind[];
    defaultWeight: number;
    allowEarlyTrigger: boolean;
    uiOrder: number;
}

/**
 * 功能：统一维护自动长总结触发规则，避免 UI / Store / 判定器分散写死。
 * 参数：无。
 * 返回：
 *   SummaryTriggerRule[]：触发规则列表。
 */
export const SUMMARY_TRIGGER_RULES: SummaryTriggerRule[] = [
    {
        id: 'scene_end',
        label: '场景结束',
        description: '地点切换、时序推进、场景收束时更适合做阶段总结。',
        category: 'scene',
        keywords: ['来到', '离开', '返回', '回到', '次日', '夜深', '清晨', '黄昏', '这一幕结束', '前往', '驻扎', '抵达', '迁移', '撤离', '回营', '出城', '入城'],
        signalKinds: ['keyword', 'location_shift', 'time_shift'],
        defaultWeight: 0.65,
        allowEarlyTrigger: false,
        uiOrder: 10,
    },
    {
        id: 'combat_end',
        label: '战斗结束',
        description: '战斗、冲突或高压行动收束后，适合做结构化阶段回顾。',
        category: 'combat',
        keywords: ['战斗结束', '收刀', '停火', '撤退', '收兵', '击败', '胜利', '败退', '结束战斗', '尘埃落定'],
        regexes: [/战斗.{0,6}(结束|收束|停火|告一段落)/i],
        signalKinds: ['keyword', 'regex'],
        defaultWeight: 0.78,
        allowEarlyTrigger: false,
        uiOrder: 20,
    },
    {
        id: 'plot_advance',
        label: '剧情推进',
        description: '主线目标推进、阶段目标完成或剧情转折。',
        category: 'plot',
        keywords: ['线索', '推进', '阶段完成', '转折', '真相', '下一步', '主线', '任务完成', '关键进展', '剧情进入'],
        signalKinds: ['keyword', 'entity_shift', 'user_intent'],
        defaultWeight: 0.72,
        allowEarlyTrigger: true,
        uiOrder: 30,
    },
    {
        id: 'relationship_shift',
        label: '关系变化',
        description: '人物之间的好感、敌意、信任、背叛等关系发生明显变化。',
        category: 'relationship',
        keywords: ['和解', '决裂', '背叛', '信任', '怀疑', '喜欢', '爱上', '疏远', '结盟', '吃醋', '示好', '迁就', '冷淡', '回避', '依赖', '纵容', '试探', '疑心', '服从'],
        signalKinds: ['keyword', 'relationship_shift'],
        defaultWeight: 0.9,
        allowEarlyTrigger: true,
        uiOrder: 40,
    },
    {
        id: 'world_change',
        label: '世界变化',
        description: '设定、规则、世界状态或关键环境发生变更。',
        category: 'world',
        keywords: ['世界规则', '设定更新', '背景改变', '局势变化', '制度调整', '禁令', '解禁', '政变', '新秩序', '改一下背景', '补充设定', '更新设定'],
        signalKinds: ['keyword', 'world_state_shift'],
        defaultWeight: 0.86,
        allowEarlyTrigger: true,
        uiOrder: 50,
    },
    {
        id: 'structure_repair',
        label: '结构修复',
        description: '编辑、删改、分支回退后需要做一致性修复。',
        category: 'repair',
        keywords: ['更正', '修正', '覆盖之前', '重新定义', '修复', '改口', '不对，改成', '撤回上一条'],
        signalKinds: ['keyword', 'user_intent'],
        defaultWeight: 0.88,
        allowEarlyTrigger: true,
        uiOrder: 60,
    },
    {
        id: 'archive_finalize',
        label: '归档整理',
        description: '阶段结尾或归档前进行最后整理。',
        category: 'archive',
        keywords: ['收尾', '总结一下', '归档', '封卷', '落幕', '完结', '阶段结束'],
        signalKinds: ['keyword', 'time_shift'],
        defaultWeight: 0.7,
        allowEarlyTrigger: false,
        uiOrder: 70,
    },
];

/**
 * 功能：按展示顺序列出触发规则。
 * 参数：无。
 * 返回：
 *   SummaryTriggerRule[]：已按 uiOrder 排序的触发规则。
 */
export function listSummaryTriggerRules(): SummaryTriggerRule[] {
    return [...SUMMARY_TRIGGER_RULES].sort((left, right): number => left.uiOrder - right.uiOrder);
}

/**
 * 功能：根据触发器 ID 获取规则。
 * 参数：
 *   id：触发器 ID。
 * 返回：
 *   SummaryTriggerRule | undefined：命中规则时返回规则，否则返回 undefined。
 */
export function getSummaryTriggerRule(id: SummaryLongTrigger): SummaryTriggerRule | undefined {
    return SUMMARY_TRIGGER_RULES.find((item: SummaryTriggerRule): boolean => item.id === id);
}

/**
 * 功能：判断输入值是否为合法触发器 ID。
 * 参数：
 *   value：待判定字符串。
 * 返回：
 *   boolean：是合法触发器 ID 返回 true，否则返回 false。
 */
export function isSummaryTriggerId(value: string): value is SummaryLongTrigger {
    return SUMMARY_TRIGGER_RULES.some((item: SummaryTriggerRule): boolean => item.id === value);
}

/**
 * 功能：读取默认启用的触发器 ID 列表。
 * 参数：无。
 * 返回：
 *   SummaryLongTrigger[]：默认触发器 ID 列表。
 */
export function getDefaultSummaryTriggerIds(): SummaryLongTrigger[] {
    return listSummaryTriggerRules().map((item: SummaryTriggerRule): SummaryLongTrigger => item.id);
}

/**
 * 功能：读取触发器标签，用于 UI 统一展示。
 * 参数：
 *   id：触发器 ID。
 * 返回：
 *   string：触发器标签，若无匹配则返回原始 ID。
 */
export function getSummaryTriggerLabel(id: SummaryLongTrigger): string {
    return getSummaryTriggerRule(id)?.label || id;
}
