import { buildDebugTemplateEvent } from "../templates/helpTemplates";

interface SlashCommandParserEvent {
  addCommandObject(commandObject: unknown): void;
}

interface SlashCommandFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

export interface DebugCommandDepsEvent {
  SlashCommandParser: SlashCommandParserEvent | null;
  SlashCommand: SlashCommandFactoryEvent | null;
  getDiceMeta: () => unknown;
  getDiceMetaEvent: () => unknown;
  escapeHtmlEvent: (input: string) => string;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
}

/**
 * 功能：注册 RollHelper 的调试命令。
 * @param deps 调试命令依赖集合
 * @returns 无返回值
 */
export function registerDebugCommandEvent(deps: DebugCommandDepsEvent): void {
  const {
    SlashCommandParser,
    SlashCommand,
    getDiceMeta,
    getDiceMetaEvent,
    escapeHtmlEvent,
    appendToConsoleEvent,
  } = deps;
  const globalRef = globalThis as { __stRollDebugCommandRegisteredEvent?: boolean };
  if (globalRef.__stRollDebugCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand) return;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "rollDebug",
      aliases: ["ddebug"],
      returns: "显示 diceRoller 元数据",
      namedArgumentList: [],
      unnamedArgumentList: [],
      callback: (): string => {
        const legacy = getDiceMeta();
        const eventMeta = getDiceMetaEvent();
        const text = JSON.stringify({ diceMeta, eventMeta }, null, 2);
        const msg = buildDebugTemplateEvent(escapeHtmlEvent(text));
        appendToConsoleEvent(msg);
        return "";
      },
    })
  );

  globalRef.__stRollDebugCommandRegisteredEvent = true;
}
