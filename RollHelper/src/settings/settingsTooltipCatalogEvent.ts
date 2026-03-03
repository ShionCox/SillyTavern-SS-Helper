import type { SettingsCardTemplateIdsEvent } from "../templates/settingsCardTemplateTypes";

/**
 * 功能：构建 RollHelper 设置面板 tooltip 目录。
 * 参数：
 *   ids：设置面板 DOM ID 集合。
 * 返回：
 *   Record<string, string>：键为控件 ID，值为提示文本。
 */
export function buildSettingsTooltipCatalogEvent(ids: SettingsCardTemplateIdsEvent): Record<string, string> {
  return {
    [ids.searchId]: "按关键词筛选设置项。",
    [ids.enabledId]: "事件系统总开关。",
    [ids.scopeId]: "设置事件作用范围。",
    [ids.ruleId]: "发送前自动附加规则。",
    [ids.aiRollModeId]: "让 AI 决定是否自动掷骰。",
    [ids.aiRoundControlId]: "让 AI 决定何时结束本轮。",
    [ids.dynamicDcReasonId]: "显示难度变化原因。",
    [ids.statusSystemEnabledId]: "开启状态效果。",
    [ids.explodingEnabledId]: "开启爆骰规则。",
    [ids.advantageEnabledId]: "开启优势/劣势规则。",
    [ids.dynamicResultGuidanceId]: "追加结果提示给 AI。",
    [ids.allowedDiceSidesId]: "限制 AI 可用的骰子面数。",
    [ids.outcomeBranchesId]: "开启剧情分支结果。",
    [ids.explodeOutcomeId]: "开启爆骰专属分支。",
    [ids.listOutcomePreviewId]: "列表中预览结果分支。",
    [ids.summaryDetailId]: "设置摘要详细度。",
    [ids.summaryRoundsId]: "设置历史轮次数量。",
    [ids.includeOutcomeSummaryId]: "摘要里带上结果文本。",
    [ids.timeLimitEnabledId]: "开启事件倒计时。",
    [ids.timeLimitMinId]: "设置最短倒计时秒数。",
    [ids.aiBridgeStatusTextId]: "显示 LLMHub 连接状态。",
    [ids.skillEnabledId]: "开启技能系统。",
    [ids.skillPresetNameId]: "输入预设名称。",
    [ids.skillTextId]: "粘贴技能配置 JSON。",
    [ids.ruleTextId]: "编辑补充规则。",
    [ids.statusModalCloseId]: "关闭状态编辑器。",
    [ids.skillModalCloseId]: "关闭技能编辑器。",
  };
}
