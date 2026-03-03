import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';

/**
 * 功能：构建 LLMHub 设置页 tooltip 目录。
 * @param ids 设置页控件 ID 集合。
 * @returns 键为控件 ID、值为提示文案的映射。
 */
export function buildSettingsTooltipCatalog(ids: LLMHubSettingsIds): Record<string, string> {
    return {
        [ids.searchId]: '按关键词筛选设置项。',
        [ids.enabledId]: 'LLMHub 总开关。',
        [ids.globalProfileId]: '默认参数档。',
        [ids.defaultProviderId]: '默认服务商。',
        [ids.defaultModelId]: '默认模型。',
        [ids.routerAdvancedToggleId]: '展开或收起高级规则。',
        [ids.routerAdvancedBodyId]: '这里编辑路由和预算。',
        [ids.routeConsumerId]: '填写调用方标识。',
        [ids.routeTaskId]: '填写任务名。',
        [ids.routeProviderId]: '选择主服务商。',
        [ids.routeProfileId]: '选择参数档。',
        [ids.routeFallbackProviderId]: '选择备用服务商。',
        [ids.routeListId]: '当前路由规则列表。',
        [ids.consumerMapRefreshBtnId]: '重新检测在线插件。',
        [ids.budgetConsumerId]: '填写预算对应的调用方。',
        [ids.budgetMaxRpmId]: '每分钟请求上限。',
        [ids.budgetMaxTokensId]: '单次 Token 上限。',
        [ids.budgetMaxLatencyId]: '最大延迟上限。',
        [ids.budgetMaxCostId]: '单次成本上限。',
        [ids.budgetListId]: '当前预算规则列表。',
        [ids.vaultAddServiceId]: '选择服务商。',
        [ids.vaultApiKeyId]: '输入接口密钥。',
    };
}
