import { ensureSharedTooltip } from "../../../SDK/sharedTooltip";

/**
 * 功能：初始化 RollHelper 全局共享 tooltip（桥接到 SDK 单例实现）。
 * 参数：无。
 * 返回：void。
 */
export function ensureSharedTooltipEvent(): void {
  ensureSharedTooltip({
    titleScopeSelectors: [".st-rh-card-scope"],
  });
}
