import type { LLMHubSettingsIds } from "./settingsCardTemplateTypes";

/**
 * 功能：构建 LLMHub 设置面板 tooltip 目录。
 * 参数：
 *   ids：设置面板 DOM ID 集合。
 * 返回：
 *   Record<string, string>：键为控件 ID，值为提示文本。
 */
export function buildSettingsTooltipCatalog(ids: LLMHubSettingsIds): Record<string, string> {
  return {
    [ids.searchId]: "按关键词筛选设置项。",
    [ids.tabMainId]: "查看基础设置。",
    [ids.tabRouterId]: "查看路由和预算。",
    [ids.tabVaultId]: "查看密钥管理。",
    [ids.tabAboutId]: "查看插件信息。",
    [ids.enabledId]: "LLMHub 总开关。",
    [ids.globalProfileId]: "默认参数档。",
    [ids.defaultProviderId]: "未命中规则时使用的服务商。",
    [ids.defaultModelId]: "默认模型名。",
    [ids.routeConsumerId]: "填写调用方标识。",
    [ids.routeTaskId]: "填写任务名。",
    [ids.routeProviderId]: "选择主服务商。",
    [ids.routeProfileId]: "选择参数档。",
    [ids.routeFallbackProviderId]: "选择备用服务商。",
    [ids.routeSaveBtnId]: "保存路由规则。",
    [ids.routeResetBtnId]: "清空路由表单。",
    [ids.routeListId]: "当前路由规则列表。",
    [ids.budgetConsumerId]: "填写预算对应的调用方。",
    [ids.budgetMaxRpmId]: "每分钟请求上限。",
    [ids.budgetMaxTokensId]: "令牌上限。",
    [ids.budgetMaxLatencyId]: "最大延迟上限。",
    [ids.budgetMaxCostId]: "成本上限。",
    [ids.budgetSaveBtnId]: "保存预算。",
    [ids.budgetResetBtnId]: "清空预算表单。",
    [ids.budgetListId]: "当前预算列表。",
    [ids.vaultAddServiceId]: "选择要保存密钥的服务。",
    [ids.vaultApiKeyId]: "输入服务密钥。",
    [ids.vaultSaveBtnId]: "加密保存密钥。",
    [ids.vaultClearBtnId]: "清空所有本地密钥。",
  };
}
