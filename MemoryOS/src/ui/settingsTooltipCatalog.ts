import type { MemoryOSSettingsIds } from "./settingsCardTemplateTypes";

/**
 * 功能：构建 MemoryOS 设置面板 tooltip 目录。
 * 参数：
 *   ids：设置面板 DOM ID 集合。
 * 返回：
 *   Record<string, string>：键为控件 ID，值为提示文本。
 */
export function buildSettingsTooltipCatalog(ids: MemoryOSSettingsIds): Record<string, string> {
  return {
    [ids.searchId]: "按关键词筛选设置项。",
    [ids.tabMainId]: "查看主设置。",
    [ids.tabAiId]: "查看 AI 规则。",
    [ids.tabDbId]: "查看数据管理。",
    [ids.tabTemplateId]: "查看世界模板。",
    [ids.tabAuditId]: "查看审计与回滚。",
    [ids.tabAboutId]: "查看插件信息。",
    [ids.enabledId]: "MemoryOS 总开关。",
    [ids.aiModeEnabledId]: "开启后使用 AI 抽取事实。",
    [ids.aiModeStatusLightId]: "显示与 LLMHub 的连接状态。",
    [ids.contextMaxTokensId]: "限制注入给 AI 的记忆长度。",
    [ids.autoCompactionId]: "自动压缩历史事件。",
    [ids.compactionThresholdId]: "达到这个数量后开始压缩。",
    [ids.dbCompactBtnId]: "立即执行一次压缩。",
    [ids.recordEditorBtnId]: "打开记录编辑器。",
    [ids.dbExportBtnId]: "导出当前聊天记忆。",
    [ids.dbImportBtnId]: "导入记忆到当前聊天。",
    [ids.dbClearBtnId]: "清空当前聊天记忆。",
    [ids.testPingBtnId]: "测试连通性（Ping）。",
    [ids.testHelloBtnId]: "测试握手（Hello）。",
    [ids.templateRefreshBtnId]: "刷新模板列表。",
    [ids.templateForceRebuildBtnId]: "从世界书重建模板。",
    [ids.templateActiveSelectId]: "选择要启用的模板。",
    [ids.templateLockId]: "锁定当前模板。",
    [ids.templateSetActiveBtnId]: "应用当前选择的模板。",
    [ids.wiPreviewBtnId]: "预览写回内容。",
    [ids.wiWritebackBtnId]: "写回事实和摘要到世界书。",
    [ids.wiWriteSummaryBtnId]: "只写回摘要到世界书。",
    [ids.logicTableEntitySelectId]: "选择要查看的实体类型。",
    [ids.logicTableRefreshBtnId]: "刷新当前逻辑表。",
    [ids.auditCreateSnapshotBtnId]: "创建一个回滚快照。",
    [ids.auditRefreshBtnId]: "刷新审计记录。",
  };
}
