import { sendTavernSystemMessageEvent } from "../../../SDK/tavern";
import { logger } from "../../index";

/**
 * 功能：向聊天区推送一条系统消息。
 * @param message 要推送的消息文本
 * @returns 宿主不可用时返回原消息文本
 */
export function pushToChat(message: string): string | void {
  try {
    const result = sendTavernSystemMessageEvent("generic", message, {
      uses_system_ui: true,
      isSmallSys: true,
    });
    if (result !== undefined) {
      return;
    }
  } catch (error) {
    logger.error("发送到聊天框失败", error);
  }
  return message;
}
