import type { SummaryLongTrigger } from '../types';
import {
    listSummaryTriggerRules,
    type SummaryTriggerCategory,
    type SummaryTriggerRule,
} from '../core/summary-trigger-registry';

export interface SummaryTriggerCardModel {
    id: string;
    triggerId: SummaryLongTrigger;
    title: string;
    description: string;
}

/**
 * 功能：返回聊天策略面板当前使用的总结触发规则列表。
 * 参数：无。
 * 返回：按注册表排序后的触发规则。
 */
export function listSummaryTriggerRulesForPanel(): SummaryTriggerRule[] {
    return listSummaryTriggerRules();
}

/**
 * 功能：构建总结触发器复选框 ID，避免为每个 trigger 维护手写常量。
 * 参数：
 *   triggerId：触发器 ID。
 * 返回：触发器复选框 ID。
 */
export function buildSummaryTriggerControlId(triggerId: SummaryLongTrigger): string {
    return `stx-memoryos-chat-ops-summary-trigger-${triggerId.replace(/_/g, '-')}`;
}

/**
 * 功能：将触发器分类转换为面板展示标签。
 * 参数：
 *   category：触发器分类。
 * 返回：分类中文标签。
 */
export function formatSummaryTriggerCategoryLabel(category: SummaryTriggerCategory): string {
    if (category === 'scene') return '场景';
    if (category === 'combat') return '战斗';
    if (category === 'plot') return '剧情';
    if (category === 'relationship') return '关系';
    if (category === 'world') return '世界';
    if (category === 'repair') return '修复';
    if (category === 'archive') return '归档';
    if (category === 'intent') return '意图';
    if (category === 'identity') return '身份';
    if (category === 'status') return '状态';
    return category;
}

/**
 * 功能：构建触发器卡片说明文案，强化“触发来源 + 提前触发”的可扫读性。
 * 参数：
 *   rule：触发规则。
 * 返回：用于复选卡片描述的文案。
 */
export function buildSummaryTriggerCardDescription(rule: SummaryTriggerRule): string {
    const category = formatSummaryTriggerCategoryLabel(rule.category);
    const early = rule.allowEarlyTrigger ? '支持提前触发' : '仅阈值后触发';
    return `${rule.description} [${category}] [${early}]`;
}

/**
 * 功能：构建总结触发器 UI 卡片模型，统一供渲染与测试复用。
 * 参数：无。
 * 返回：触发器卡片模型列表。
 */
export function buildSummaryTriggerCardsForPanel(): SummaryTriggerCardModel[] {
    return listSummaryTriggerRulesForPanel().map((rule: SummaryTriggerRule): SummaryTriggerCardModel => ({
        id: buildSummaryTriggerControlId(rule.id),
        triggerId: rule.id,
        title: rule.label,
        description: buildSummaryTriggerCardDescription(rule),
    }));
}
