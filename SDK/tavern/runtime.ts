import { getSillyTavernContextEvent } from "./context";
import type {
  SdkTavernEventSourceEvent,
  SdkTavernRuntimeContextEvent,
  SdkTavernSlashCommandRuntimeEvent,
} from "./types";

/**
 * 功能：读取当前宿主运行时上下文，并以 SDK 统一类型返回。
 * @returns 运行时上下文；不可用时返回空值
 */
export function getTavernRuntimeContextEvent(): SdkTavernRuntimeContextEvent | null {
  const context = getSillyTavernContextEvent();
  if (!context || typeof context !== "object") return null;
  return context as SdkTavernRuntimeContextEvent;
}

/**
 * 功能：读取当前宿主的聊天元数据根对象。
 * @returns 聊天元数据；不存在时返回空值
 */
export function getTavernChatMetadataEvent(): Record<string, unknown> | null {
  const context = getTavernRuntimeContextEvent();
  if (!context?.chatMetadata || typeof context.chatMetadata !== "object") return null;
  return context.chatMetadata;
}

/**
 * 功能：读取当前宿主的扩展设置对象。
 * @returns 扩展设置对象；不存在时返回空值
 */
export function getTavernExtensionSettingsEvent(): Record<string, unknown> | null {
  const context = getTavernRuntimeContextEvent();
  if (!context?.extensionSettings || typeof context.extensionSettings !== "object") return null;
  return context.extensionSettings;
}

/**
 * 功能：读取当前宿主事件源。
 * @returns 事件源；不存在时返回空值
 */
export function getTavernEventSourceEvent(): SdkTavernEventSourceEvent | null {
  const context = getTavernRuntimeContextEvent();
  if (!context?.eventSource || typeof context.eventSource !== "object") return null;
  return context.eventSource as SdkTavernEventSourceEvent;
}

/**
 * 功能：读取当前宿主事件类型映射表。
 * @returns 事件类型映射；不存在时返回空值
 */
export function getTavernEventTypesEvent(): Record<string, string> | null {
  const context = getTavernRuntimeContextEvent();
  if (!context?.event_types || typeof context.event_types !== "object") return null;
  return context.event_types;
}

/**
 * 功能：读取当前宿主 Slash Command 运行时接口。
 * @returns 命令相关接口集合
 */
export function getTavernSlashCommandRuntimeEvent(): SdkTavernSlashCommandRuntimeEvent {
  const context = getTavernRuntimeContextEvent();
  return {
    parser: context?.SlashCommandParser ?? null,
    command: context?.SlashCommand ?? null,
    argument: context?.SlashCommandArgument ?? null,
    namedArgument: context?.SlashCommandNamedArgument ?? null,
    argumentType:
      context?.ARGUMENT_TYPE && typeof context.ARGUMENT_TYPE === "object"
        ? context.ARGUMENT_TYPE
        : null,
  };
}

/**
 * 功能：向宿主注册宏。
 * @param name 宏名称
 * @param fn 宏回调
 * @returns 无返回值
 */
export function registerTavernMacroEvent(name: string, fn: () => string): void {
  const context = getTavernRuntimeContextEvent();
  if (typeof context?.registerMacro === "function") {
    context.registerMacro(name, fn);
  }
}

/**
 * 功能：请求宿主发送一条系统消息。
 * @param type 系统消息类型
 * @param text 消息文本
 * @param extra 额外选项
 * @returns 宿主返回值；不可用时返回空值
 */
export function sendTavernSystemMessageEvent(
  type: unknown,
  text: string,
  extra?: unknown
): unknown {
  const context = getTavernRuntimeContextEvent();
  if (typeof context?.sendSystemMessage === "function") {
    return context.sendSystemMessage(type, text, extra);
  }
  return undefined;
}

/**
 * 功能：请求宿主保存聊天元数据。
 * @returns 无返回值
 */
export function saveTavernMetadataEvent(): void {
  const context = getTavernRuntimeContextEvent();
  if (typeof context?.saveMetadata === "function") {
    context.saveMetadata();
  }
}

/**
 * 功能：请求宿主触发设置延迟保存。
 * @returns 无返回值
 */
export function saveTavernSettingsDebouncedEvent(): void {
  const context = getTavernRuntimeContextEvent();
  if (typeof context?.saveSettingsDebounced === "function") {
    context.saveSettingsDebounced();
  }
}
