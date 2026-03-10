import {
  getTavernEventSourceEvent,
  getTavernEventTypesEvent,
  getTavernExtensionSettingsEvent,
  getTavernRuntimeContextEvent,
  getTavernSlashCommandRuntimeEvent,
  registerTavernMacroEvent,
  saveTavernMetadataEvent,
  saveTavernSettingsDebouncedEvent,
  sendTavernSystemMessageEvent,
} from "../../../SDK/tavern";
import type { SdkTavernRuntimeContextEvent } from "../../../SDK/tavern";

export type STContext = SdkTavernRuntimeContextEvent;

const slashCommandRuntimeEvent = getTavernSlashCommandRuntimeEvent();

export const registerMacro = registerTavernMacroEvent;
export const saveMetadata = saveTavernMetadataEvent;
export const saveSettingsDebounced = saveTavernSettingsDebouncedEvent;
export const sendSystemMessage = sendTavernSystemMessageEvent;
export const SlashCommandParser = slashCommandRuntimeEvent.parser;
export const SlashCommand = slashCommandRuntimeEvent.command;
export const SlashCommandArgument = slashCommandRuntimeEvent.argument;
export const SlashCommandNamedArgument = slashCommandRuntimeEvent.namedArgument;
export const ARGUMENT_TYPE = slashCommandRuntimeEvent.argumentType;
export const extensionSettings = getTavernExtensionSettingsEvent() ?? undefined;
export const eventSource = getTavernEventSourceEvent() ?? undefined;
export const event_types = getTavernEventTypesEvent() ?? undefined;

/**
 * 功能：获取当前宿主运行时上下文。
 * @returns 运行时上下文；不可用时返回空值
 */
export function getLiveContextEvent(): STContext | null {
  return getTavernRuntimeContextEvent();
}
