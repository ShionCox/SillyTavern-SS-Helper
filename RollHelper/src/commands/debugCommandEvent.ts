import { buildDebugTemplateEvent } from "../templates/helpTemplates";

export interface DebugCommandDepsEvent {
  SlashCommandParser: any;
  SlashCommand: any;
  getDiceMeta: () => any;
  getDiceMetaEvent: () => any;
  escapeHtmlEvent: (input: string) => string;
  pushToChat: (message: string) => string | void;
}

export function registerDebugCommandEvent(deps: DebugCommandDepsEvent): void {
  const {
    SlashCommandParser,
    SlashCommand,
    getDiceMeta,
    getDiceMetaEvent,
    escapeHtmlEvent,
    pushToChat,
  } = deps;
  const globalRef = globalThis as any;
  if (globalRef.__stRollDebugCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand) return;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "rollDebug",
      aliases: ["ddebug"],
      returns: "显示 diceRoller 元数据",
      namedArgumentList: [],
      unnamedArgumentList: [],
      callback: () => {
        const diceMeta = getDiceMeta();
        const eventMeta = getDiceMetaEvent();
        const text = JSON.stringify({ diceMeta, eventMeta }, null, 2);
        const msg = buildDebugTemplateEvent(escapeHtmlEvent(text));
        pushToChat(msg);
        return "";
      },
    })
  );

  globalRef.__stRollDebugCommandRegisteredEvent = true;
}
