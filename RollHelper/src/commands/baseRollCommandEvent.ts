import { buildRollCommandHelpTemplateEvent } from "../templates/helpTemplates";
import type { DiceResult } from "../types/diceEvent";

type DiceMetaLikeEvent = {
  last?: DiceResult;
  lastTotal?: number;
};

export interface BaseRollCommandDepsEvent {
  registerMacro: (name: string, fn: () => string) => void;
  SlashCommandParser: any;
  SlashCommand: any;
  SlashCommandArgument: any;
  ARGUMENT_TYPE: any;
  getDiceMeta: () => DiceMetaLikeEvent;
  rollExpression: (exprRaw: string) => DiceResult;
  saveLastRoll: (result: DiceResult) => void;
  buildResultMessage: (result: DiceResult) => string;
  pushToChat: (message: string) => string | void;
}

export function registerBaseMacrosAndCommandsEvent(
  deps: BaseRollCommandDepsEvent
): void {
  const {
    registerMacro,
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    ARGUMENT_TYPE,
    getDiceMeta,
    rollExpression,
    saveLastRoll,
    buildResultMessage,
    pushToChat,
  } = deps;

  const globalRef = globalThis as any;

  if (!globalRef.__stRollBaseMacrosRegisteredEvent) {
    registerMacro("lastRollTotal", () => {
      const meta = getDiceMeta();
      if (meta.lastTotal == null) {
        return "尚未掷骰，请先使用 /roll";
      }
      return String(meta.lastTotal);
    });

    registerMacro("lastRoll", () => {
      const meta = getDiceMeta();
      if (!meta.last) {
        return "尚未掷骰，请先使用 /roll";
      }
      return JSON.stringify(meta.last, null, 2);
    });
    globalRef.__stRollBaseMacrosRegisteredEvent = true;
  }

  if (globalRef.__stRollBaseCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand || !SlashCommandArgument || !ARGUMENT_TYPE) {
    return;
  }

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "roll",
      aliases: ["dice"],
      returns: "通用骰子：支持 NdM+X，例如 3d6+2、1d20",
      namedArgumentList: [],
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: "骰子表达式（如 1d20、3d6+2）。留空等于 1d20。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      helpString: buildRollCommandHelpTemplateEvent(),
      callback: (_namedArgs: Record<string, any>, unnamedArgs: any) => {
        try {
          const exprRaw = (unnamedArgs ?? "").toString().trim();
          const expr = exprRaw || "1d20";
          const result = rollExpression(expr);
          saveLastRoll(result);
          const msg = buildResultMessage(result);
          const fallback = pushToChat(msg);
          return fallback ?? "";
        } catch (e: any) {
          const errMsg = `掷骰出错：${e?.message ?? String(e)}`;
          const fallback = pushToChat(errMsg);
          return fallback ?? "";
        }
      },
    })
  );

  globalRef.__stRollBaseCommandRegisteredEvent = true;
}
