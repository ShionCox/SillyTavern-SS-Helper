import { buildRollCommandHelpTemplateEvent } from "../templates/helpTemplates";
import type { DiceResult } from "../types/diceEvent";
import type { DiceMetaEvent, DicePluginSettingsEvent } from "../types/eventDomainEvent";
import { normalizeBlindGuidanceEvent, resolveNatStateEvent } from "../events/passiveBlindEvent";
import {
  appendBlindHistoryFromGuidanceEvent,
  buildAssistantFloorKeyEvent,
  buildBlindGuidanceDedupKeyEvent,
  canEnqueueBlindGuidanceEvent,
  enqueueBlindGuidanceSafeEvent,
  isBlindSkillAllowedEvent,
} from "../events/roundEvent";

export interface BaseRollCommandDepsEvent {
  registerMacro: (name: string, fn: () => string) => void;
  SlashCommandParser: any;
  SlashCommand: any;
  SlashCommandArgument: any;
  ARGUMENT_TYPE: any;
  getLastBaseRollEvent: () => DiceResult | undefined;
  getLastBaseRollTotalEvent: () => number | undefined;
  getDiceMetaEvent: () => DiceMetaEvent;
  getSettingsEvent: () => DicePluginSettingsEvent;
  rollDiceEvent: (exprRaw: string) => Promise<DiceResult>;
  saveLastRoll: (result: DiceResult) => void;
  buildResultMessage: (result: DiceResult) => string;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  createIdEvent: (prefix: string) => string;
  saveMetadataSafeEvent: () => void;
  appendBlindHistoryRecordEvent: (item: {
    rollId: string;
    roundId?: string;
    eventId: string;
    eventTitle: string;
    skill: string;
    diceExpr: string;
    targetLabel: string;
    rolledAt: number;
    source: "manual_roll" | "blind_manual_roll" | "ai_auto_roll" | "passive_check" | "timeout_auto_fail";
    origin?: "slash_broll" | "event_blind" | "interactive_blind";
    sourceAssistantMsgId?: string;
    note?: string;
  }) => void;
  playDiceRevealOnlyEvent?: () => Promise<void>;
}

type ParsedBlindRollInputEvent = {
  diceExpr: string;
  skillName: string;
  targetLabel: string;
  note: string;
};

/**
 * 功能：判断一段文本是否看起来像骰子表达式。
 * @param raw 待判断文本。
 * @returns 若文本符合常见骰式格式则返回 true。
 */
function isLikelyDiceExprEvent(raw: string): boolean {
  return /^\d+d\d+(?:!|kh\d+|kl\d+|[+-]\d+)*$/i.test(String(raw ?? "").trim());
}

/**
 * 功能：从无空格的自然输入中按白名单技能前缀拆出技能与目标。
 * @param raw 原始输入。
 * @param settings 当前设置。
 * @returns 命中的技能名与目标；未命中时返回空字符串。
 */
function resolveBlindSkillPrefixEvent(
  raw: string,
  settings: DicePluginSettingsEvent
): { skillName: string; targetLabel: string } {
  const normalizedRaw = String(raw ?? "").trim();
  if (!normalizedRaw) {
    return { skillName: "", targetLabel: "" };
  }
  const candidates = String(settings.defaultBlindSkillsText ?? "")
    .split(/[\n,|]+/)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  for (const skillName of candidates) {
    if (!normalizedRaw.startsWith(skillName)) continue;
    const targetLabel = normalizedRaw.slice(skillName.length).trim();
    return { skillName, targetLabel };
  }
  return { skillName: "", targetLabel: "" };
}

/**
 * 功能：把 `/broll` 输入解析为结构化暗骰请求。
 * @param raw 未命名参数原文。
 * @param namedArgs 命名参数集合。
 * @param settings 当前设置。
 * @returns 结构化暗骰输入。
 */
function parseBlindRollInputEvent(
  raw: string,
  namedArgs: Record<string, any>,
  settings: DicePluginSettingsEvent
): ParsedBlindRollInputEvent {
  const rawText = String(raw ?? "").trim();
  const namedSkill = String(namedArgs.skill ?? namedArgs.s ?? "").trim();
  const namedTarget = String(namedArgs.target ?? namedArgs.t ?? "").trim();
  const namedNote = String(namedArgs.note ?? namedArgs.n ?? "").trim();
  const namedDiceExpr = String(namedArgs.dice ?? namedArgs.expr ?? "").trim();

  let diceExpr = isLikelyDiceExprEvent(namedDiceExpr) ? namedDiceExpr : "";
  let skillName = namedSkill;
  let targetLabel = namedTarget;

  if (!diceExpr && rawText && isLikelyDiceExprEvent(rawText)) {
    diceExpr = rawText;
  }

  if (!diceExpr && !skillName && rawText) {
    const tokens = rawText.split(/\s+/).filter(Boolean);
    if (tokens.length > 1) {
      skillName = tokens[0] ?? "";
      targetLabel = targetLabel || tokens.slice(1).join(" ").trim();
    } else {
      const prefixed = resolveBlindSkillPrefixEvent(rawText, settings);
      skillName = prefixed.skillName || rawText;
      targetLabel = targetLabel || prefixed.targetLabel;
    }
  }

  if (!diceExpr) {
    diceExpr = "1d20";
  }

  return {
    diceExpr,
    skillName: String(skillName ?? "").trim(),
    targetLabel: String(targetLabel ?? "").trim(),
    note: namedNote,
  };
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
    getLastBaseRollEvent,
    getLastBaseRollTotalEvent,
    getDiceMetaEvent,
    getSettingsEvent,
    rollDiceEvent,
    saveLastRoll,
    buildResultMessage,
    appendToConsoleEvent,
    resolveSkillModifierBySkillNameEvent,
    createIdEvent,
    saveMetadataSafeEvent,
    appendBlindHistoryRecordEvent,
    playDiceRevealOnlyEvent,
  } = deps;

  const globalRef = globalThis as any;

  if (!globalRef.__stRollBaseMacrosRegisteredEvent) {
    registerMacro("lastRollTotal", () => {
      const total = getLastBaseRollTotalEvent();
      if (total == null) {
        return "尚未掷骰，请先使用 /roll";
      }
      return String(total);
    });

    registerMacro("lastRoll", () => {
      const lastRoll = getLastBaseRollEvent();
      if (!lastRoll) {
        return "尚未掷骰，请先使用 /roll";
      }
      return JSON.stringify(lastRoll, null, 2);
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
      returns: "暗骰：支持 /broll 调查 宝箱、/broll skill=调查 target=宝箱、/broll 1d20",
      namedArgumentList: [
        SlashCommandArgument.fromProps({
          name: "skill",
          description: "技能名，例如 调查、察觉。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
        SlashCommandArgument.fromProps({
          name: "target",
          description: "目标或对象说明。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
        SlashCommandArgument.fromProps({
          name: "note",
          description: "附加备注，仅写入暗骰历史与引导。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
        SlashCommandArgument.fromProps({
          name: "expr",
          description: "覆盖默认骰式，例如 1d100。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: "技能名或骰子表达式；若不是骰式则按技能名处理，默认使用 1d20。",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      callback: async (namedArgs: Record<string, any>, unnamedArgs: any) => {
        const raw = String(unnamedArgs ?? "").trim();
        const settings = getSettingsEvent();
        if (!settings.enableBlindRoll) {
          appendToConsoleEvent("暗骰功能已关闭，请先在设置中启用。", "warn");
          return "";
        }
        const parsedInput = parseBlindRollInputEvent(raw, namedArgs, settings);
        const expr = parsedInput.diceExpr;
        const skillName = parsedInput.skillName;
        const targetLabel = parsedInput.targetLabel || skillName || expr;
        const note = parsedInput.note;
        const meta = getDiceMetaEvent();
        const round = meta.pendingRound && meta.pendingRound.status === "open" ? meta.pendingRound : null;
        if (!round || !Array.isArray(round.sourceAssistantMsgIds) || round.sourceAssistantMsgIds.length <= 0) {
          appendToConsoleEvent("当前没有可绑定的最新轮次，暗骰不会进入后续叙事。请等待新一轮事件，或改用普通 /roll。", "warn");
          return "";
        }
        if (skillName && !isBlindSkillAllowedEvent(skillName, settings)) {
          appendToConsoleEvent(`技能「${skillName}」当前不允许作为暗骰使用。`, "warn");
          return "";
        }
        const sourceAssistantMsgId = String(round.sourceAssistantMsgIds[round.sourceAssistantMsgIds.length - 1] ?? "").trim();
        const sourceFloorKey = buildAssistantFloorKeyEvent(sourceAssistantMsgId) || undefined;
        const dedupeKey = buildBlindGuidanceDedupKeyEvent({
          roundId: round.roundId,
          skill: skillName || "未指定",
          targetLabel,
          sourceFloorKey,
          origin: "slash_broll",
        }, settings);
        const enqueueCheck = canEnqueueBlindGuidanceEvent({
          meta,
          settings,
          round,
          dedupeKey,
          sourceFloorKey,
          origin: "slash_broll",
        });
        if (!enqueueCheck.ok) {
          appendToConsoleEvent(enqueueCheck.reason || "暗骰当前无法加入叙事引导。", "warn");
          return "";
        }
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
          const now = Date.now();
          const blindItem = normalizeBlindGuidanceEvent({
            rollId: createIdEvent("broll"),
            eventTitle: skillName ? `暗骰【${skillName}】` : `暗骰【${expr}】`,
            skill: skillName || "未指定",
            diceExpr: expr,
            total,
            success: null,
            resultGrade: natState === "nat20" ? "critical_success" : natState === "nat1" ? "critical_failure" : total >= 10 ? "success" : "failure",
            natState,
            targetLabel,
            rolledAt: now,
            source: "blind_manual_roll",
            roundId: round.roundId,
            sourceAssistantMsgId: sourceAssistantMsgId || undefined,
            sourceFloorKey,
            origin: "slash_broll",
            note: note || undefined,
            createdAt: now,
            consumed: false,
            dedupeKey,
          });
          const enqueueResult = enqueueBlindGuidanceSafeEvent({
            meta,
            settings,
            round,
            item: blindItem,
            now,
          });
          if (!enqueueResult.ok) {
            appendToConsoleEvent(enqueueResult.reason || "暗骰当前无法加入叙事引导。", "warn");
            return "";
          }
          appendBlindHistoryFromGuidanceEvent(meta, blindItem, appendBlindHistoryRecordEvent);
          saveMetadataSafeEvent();
          appendToConsoleEvent(`暗骰已记录：${skillName || expr}${targetLabel ? ` → ${targetLabel}` : ""}`);
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
