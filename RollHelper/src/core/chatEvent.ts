import { sendSystemMessage } from "./runtimeContextEvent";
import { logger } from "../../index";

export function pushToChat(message: string) {
  if (typeof sendSystemMessage === "function") {
    try {
      sendSystemMessage("generic", message, {
        uses_system_ui: true,
        isSmallSys: true,
      });
      return;
    } catch (e) {
      logger.error("发送到聊天框失败:", e);
    }
  }
  return message;
}

