import { buildDebugTemplateEvent } from "../templates/helpTemplates";

interface SlashCommandParserEvent {
  addCommandObject(commandObject: unknown): void;
}

interface SlashCommandNamedArgumentFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

interface SlashCommandFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

interface LiveContextEvent {
  chat?: unknown[];
}

export interface DebugCommandDepsEvent {
  SlashCommandParser: SlashCommandParserEvent | null;
  SlashCommand: SlashCommandFactoryEvent | null;
  SlashCommandNamedArgument?: SlashCommandNamedArgumentFactoryEvent | null;
  getDiceMeta: () => unknown;
  getDiceMetaEvent: () => unknown;
  escapeHtmlEvent: (input: string) => string;
  pushToChat: (message: string) => string | void;
  getLiveContextEvent?: () => LiveContextEvent | null;
  cleanAllHistoryChatBlocks?: (chatContext: unknown[], options?: { forceAll?: boolean }) => number;
  persistChatSafeEvent?: () => void;
}

/**
 * 功能：注册 RollHelper 的调试命令与历史净化命令。
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
    pushToChat,
  } = deps;
  const globalRef = globalThis as { __stRollDebugCommandRegisteredEvent?: boolean };
  if (globalRef.__stRollDebugCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand) return;
  const namedArgumentFactory =
    deps.SlashCommandNamedArgument && typeof deps.SlashCommandNamedArgument.fromProps === "function"
      ? deps.SlashCommandNamedArgument
      : null;

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
        const text = JSON.stringify({ legacy, eventMeta }, null, 2);
        const msg = buildDebugTemplateEvent(escapeHtmlEvent(text));
        pushToChat(msg);
        return "";
      },
    })
  );

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "rollHelperClean",
      aliases: ["rhclean", "diceclean"],
      returns: "清理并净化当前聊天列表中遗留的 roll json 数据",
      namedArgumentList: namedArgumentFactory
        ? [
            namedArgumentFactory.fromProps({
              name: "force",
              description: "是否强制清理用户发言中的骰子 json 数据，true/false，默认 false",
              typeList: ["string"],
            }),
          ]
        : [],
      unnamedArgumentList: [],
      callback: (args: Record<string, unknown> | undefined): string => {
        const liveCtx = deps.getLiveContextEvent?.();
        if (!liveCtx?.chat || !Array.isArray(liveCtx.chat)) {
          pushToChat(buildDebugTemplateEvent(escapeHtmlEvent("上下文不可用，清理失败。")));
          return "";
        }
        if (typeof deps.cleanAllHistoryChatBlocks !== "function") {
          pushToChat(buildDebugTemplateEvent(escapeHtmlEvent("清理功能未挂载。")));
          return "";
        }

        const forceArg = args?.force;
        const forceAll = forceArg === "true" || forceArg === "1";
        const count = deps.cleanAllHistoryChatBlocks(liveCtx.chat, { forceAll });

        if (count > 0 && typeof deps.persistChatSafeEvent === "function") {
          deps.persistChatSafeEvent();
        }

        pushToChat(
          buildDebugTemplateEvent(
            escapeHtmlEvent(
              `清理完成，共清洗了 ${count} 条包含历史骰子或受控标记的数据。（如需强制清理 User 发言可加参数 \`force=true\`）`
            )
          )
        );
        return "";
      },
    })
  );

  globalRef.__stRollDebugCommandRegisteredEvent = true;
}
