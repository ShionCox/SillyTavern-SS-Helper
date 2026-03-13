import {
  bindEventButtonsEvent,
  mountSettingsCardEvent,
  registerBaseMacrosAndCommandsEvent,
  registerDebugCommandEvent,
  registerEventHooksEvent,
  registerEventRollCommandEvent,
  restoreRuntimeUiFromStateEvent,
  startCountdownTickerEvent,
} from "./eventRuntime";

import { logger } from "../../index";
import { loadChatScopedStateIntoRuntimeEvent } from "../settings/storeEvent";
import { ensureEventCardStylesEvent } from "../templates/eventCardTemplates";

const INITIALIZE_RETRY_MAX_Event = 80;
const INITIALIZE_RETRY_DELAY_MS_Event = 500;

/**
 * 功能：收集当前尚未完成注册的初始化标记。
 * @param globalRef 全局对象引用。
 * @returns 尚未完成的标记名称列表。
 */
function collectMissingInitFlagsEvent(globalRef: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!globalRef.__stRollEventCommandRegisteredEvent) missing.push("event_command");
  if (!globalRef.__stRollBaseCommandRegisteredEvent) missing.push("base_command");
  if (!globalRef.__stRollDebugCommandRegisteredEvent) missing.push("debug_command");
  if (!globalRef.__stRollEventHooksRegisteredEvent) missing.push("event_hooks");
  return missing;
}

/**
 * 功能：初始化事件运行时，并在宿主能力尚未就绪时自动重试。
 * @param attempt 当前重试次数。
 * @returns 无返回值。
 */
export function initializeEventRuntimeEvent(attempt = 0): void {
  ensureEventCardStylesEvent();
  registerBaseMacrosAndCommandsEvent();
  mountSettingsCardEvent();
  bindEventButtonsEvent();
  registerEventRollCommandEvent();
  registerDebugCommandEvent();
  registerEventHooksEvent();
  startCountdownTickerEvent();

  void loadChatScopedStateIntoRuntimeEvent("init_runtime")
    .catch((error) => {
      logger.warn("初始化聊天级状态失败", error);
    })
    .finally(() => {
      restoreRuntimeUiFromStateEvent();
    });

  const globalRef = globalThis as Record<string, unknown>;
  const missingFlags = collectMissingInitFlagsEvent(globalRef);
  if (missingFlags.length > 0) {
    if (attempt < INITIALIZE_RETRY_MAX_Event) {
      setTimeout(() => initializeEventRuntimeEvent(attempt + 1), INITIALIZE_RETRY_DELAY_MS_Event);
    }
    return;
  }
}
