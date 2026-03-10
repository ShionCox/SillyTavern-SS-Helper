import {
  bindEventButtonsEvent,
  mountSettingsCardEvent,
  refreshCountdownDomEvent,
  registerBaseMacrosAndCommandsEvent,
  registerDebugCommandEvent,
  registerEventHooksEvent,
  registerEventRollCommandEvent,
  sanitizeCurrentChatEventBlocksEvent,
  startCountdownTickerEvent,
  sweepTimeoutFailuresEvent,
} from "./eventRuntime";

import { logger } from "../../index";
import { loadChatScopedStateIntoRuntimeEvent } from "../settings/storeEvent";

const INITIALIZE_RETRY_MAX_Event = 80;
const INITIALIZE_RETRY_DELAY_MS_Event = 500;

export function initializeEventRuntimeEvent(attempt = 0): void {
  registerBaseMacrosAndCommandsEvent();
  mountSettingsCardEvent();
  bindEventButtonsEvent();
  registerEventRollCommandEvent();
  registerDebugCommandEvent();
  registerEventHooksEvent();
  void loadChatScopedStateIntoRuntimeEvent("init_runtime").catch((error) => {
    logger.warn("初始化聊天级状态失败", error);
  });
  startCountdownTickerEvent();
  sweepTimeoutFailuresEvent();
  refreshCountdownDomEvent();
  sanitizeCurrentChatEventBlocksEvent();

  const globalRef = globalThis as any;
  if (
    !globalRef.__stRollEventCommandRegisteredEvent ||
    !globalRef.__stRollBaseCommandRegisteredEvent ||
    !globalRef.__stRollDebugCommandRegisteredEvent ||
    !globalRef.__stRollEventHooksRegisteredEvent
  ) {
    if (attempt < INITIALIZE_RETRY_MAX_Event) {
      setTimeout(() => initializeEventRuntimeEvent(attempt + 1), INITIALIZE_RETRY_DELAY_MS_Event);
    }
    return;
  }

  logger.info("Event 初始化完成");
}
