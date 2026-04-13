import { buildRollCommandHelpTemplateEvent } from "../templates/helpTemplates";
import type { DiceResult } from "../types/diceEvent";
import type { BlindGuidanceEvent, DiceMetaEvent, DicePluginSettingsEvent } from "../types/eventDomainEvent";
import { normalizeBlindGuidanceEvent, resolveNatStateEvent } from "../events/passiveBlindEvent";

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
  getDiceMetaEvent: () => DiceMetaEvent;
  getSettingsEvent: () => DicePluginSettingsEvent;
  rollDiceEvent: (exprRaw: string) => Promise<DiceResult>;
  saveLastRoll: (result: DiceResult) => void;
  buildResultMessage: (result: DiceResult) => string;
  buildBlindResultMessage: (title: string) => string;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  createIdEvent: (prefix: string) => string;
  saveMetadataSafeEvent: () => void;
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
    getDiceMetaEvent,
    getSettingsEvent,
    rollDiceEvent,
    saveLastRoll,
    buildResultMessage,
    buildBlindResultMessage,
    appendToConsoleEvent,
    resolveSkillModifierBySkillNameEvent,
    createIdEvent,
    saveMetadataSafeEvent,
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

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "broll",
      aliases: ["blindroll"],
      returns: "暗骰：支持 /broll 1d20、/broll 察觉、/broll 调查宝箱",
      namedArgumentList: [],
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: "技能名或骰子表达式；若不是骰式则按技能名处理，默认使用 1d20。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      callback: async (_namedArgs: Record<string, any>, unnamedArgs: any) => {
        const raw = String(unnamedArgs ?? "").trim();
        const settings = getSettingsEvent();
        if (!settings.enableBlindRoll) {
          appendToConsoleEvent("暗骰功能已关闭，请先在设置中启用。", "warn");
          return "";
        }
        const expr = /\d+d\d+/i.test(raw) ? raw : "1d20";
        const skillName = raw && !/\d+d\d+/i.test(raw) ? raw : "";
        try {
          let result = await rollDiceEvent(expr);
          const skillModifier = skillName ? resolveSkillModifierBySkillNameEvent(skillName, settings) : 0;
          if (skillModifier) {
            result = {
              ...result,
              modifier: Number(result.modifier || 0) + skillModifier,
              total: Number(result.total || 0) + skillModifier,
            };
          }
          saveLastRoll(result);
          const natState = resolveNatStateEvent(result.rolls, Number(result.sides) || 0);
          const total = Number(result.total || 0);
          const blindQueue = Array.isArray(getDiceMetaEvent().pendingBlindGuidanceQueue)
            ? getDiceMetaEvent().pendingBlindGuidanceQueue as BlindGuidanceEvent[]
            : ((getDiceMetaEvent().pendingBlindGuidanceQueue = []) as BlindGuidanceEvent[]);
          blindQueue.push(
            normalizeBlindGuidanceEvent({
              rollId: createIdEvent("broll"),
              eventTitle: skillName ? `暗骰【${skillName}】` : `暗骰【${expr}】`,
              skill: skillName || "未指定",
              diceExpr: expr,
              total,
              success: null,
              resultGrade: natState === "nat20" ? "critical_success" : natState === "nat1" ? "critical_failure" : total >= 10 ? "success" : "failure",
              natState,
              rolledAt: Date.now(),
              source: "blind_manual_roll",
            })
          );
          saveMetadataSafeEvent();
          appendToConsoleEvent(buildBlindResultMessage(skillName ? `暗骰 ${skillName}` : `暗骰 ${expr}`));
          if (settings.blindUiWarnInConsole) {
            appendToConsoleEvent("查看暗骰真实结果会破坏跑团体验哦。", "warn");
          }
          if (result.sourceEngine === "dice_box" && playDiceRevealOnlyEvent) {
            await playDiceRevealOnlyEvent();
          }
        } catch (e: any) {
          appendToConsoleEvent(`暗骰出错：${e?.message ?? String(e)}`, "error");
        }
        return "";
      },
    })
  );

  globalRef.__stRollBaseCommandRegisteredEvent = true;
}
