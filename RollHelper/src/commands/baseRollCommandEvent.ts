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
  rollDiceEvent: (exprRaw: string) => Promise<DiceResult>;
  saveLastRoll: (result: DiceResult) => void;
  buildResultMessage: (result: DiceResult) => string;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  playDiceRevealOnlyEvent?: () => Promise<void>;
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
    rollDiceEvent,
    saveLastRoll,
    buildResultMessage,
    appendToConsoleEvent,
    playDiceRevealOnlyEvent,
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
        const exprRaw = (unnamedArgs ?? "").toString().trim();
        const expr = exprRaw || "1d20";
        rollDiceEvent(expr)
          .then((result) => {
            saveLastRoll(result);
            const msg = buildResultMessage(result);
            appendToConsoleEvent(msg);
            if (result.sourceEngine === "dice_box" && playDiceRevealOnlyEvent) {
              return playDiceRevealOnlyEvent();
            }
            return undefined;
          })
          .catch((e: any) => {
            const errMsg = `掷骰出错：${e?.message ?? String(e)}`;
            appendToConsoleEvent(errMsg, "error");
          });
        return "";
      },
    })
  );

  globalRef.__stRollBaseCommandRegisteredEvent = true;
}
