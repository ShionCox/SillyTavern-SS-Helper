export interface STContext {
  chatMetadata: Record<string, any>;
  extensionSettings?: Record<string, any>;
  chat?: any[];
  saveMetadata(): void;
  saveSettingsDebounced?(): void;
  saveChat?(): unknown;
  saveChatConditional?(): unknown;
  saveChatDebounced?(): unknown;
  registerMacro(name: string, fn: () => string): void;
  SlashCommandParser: any;
  SlashCommand: any;
  SlashCommandArgument: any;
  SlashCommandNamedArgument: any;
  ARGUMENT_TYPE: any;
  sendSystemMessage(type: any, text: string, extra?: any): void;
  eventSource?: {
    on(eventName: string, handler: (payload: any) => void): void;
    makeLast?(eventName: string, handler: (payload: any) => void): void;
  };
  event_types?: Record<string, string>;
}

const ctx = SillyTavern.getContext() as STContext;

export const {
  chatMetadata,
  saveMetadata,
  registerMacro,
  SlashCommandParser,
  SlashCommand,
  SlashCommandArgument,
  SlashCommandNamedArgument,
  ARGUMENT_TYPE,
  sendSystemMessage,
  extensionSettings,
  saveSettingsDebounced,
  eventSource,
  event_types,
} = ctx;

export function getLiveContextEvent(): STContext | null {
  try {
    return SillyTavern.getContext() as STContext;
  } catch {
    return null;
  }
}

