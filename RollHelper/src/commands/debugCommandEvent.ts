import { buildDebugTemplateEvent } from "../templates/helpTemplates";

export interface DebugCommandDepsEvent {
  SlashCommandParser: any;
  SlashCommand: any;
  getDiceMeta: () => any;
  getDiceMetaEvent: () => any;
  escapeHtmlEvent: (input: string) => string;
  pushToChat: (message: string) => string | void;
  getLiveContextEvent?: () => any;
  cleanAllHistoryChatBlocks?: (chatContext: any[], options?: any) => number;
  persistChatSafeEvent?: () => void;
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
      returns: "清理并净化当前聊天列表中由于兼容性遗贸的 roll json 数据",
      namedArgumentList: [
        SlashCommand.NamedArgument.fromProps({ name: "force", description: "是否强制清理用户发言里的骰子伪json数据，true/false，默认 false", typeList: ["string"] }),
      ],
      unnamedArgumentList: [],
      callback: (args: any, text: string) => {
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
        pushToChat(buildDebugTemplateEvent(escapeHtmlEvent(`清理完成，共清洗了 ${count} 条包含了历史骰子或受控标记的数据。（如需强制清理 User 发言可加参数 \`force=true\`）`)));
        return "";
      },
    })
  );

  globalRef.__stRollDebugCommandRegisteredEvent = true;
}
