import type { DiceOptions, DiceResult } from "../types/diceEvent";
import { logger } from "../../index";
import { getSettingsEvent } from "../settings/storeEvent";
import { applyRulePolicyToExpressionEvent, parseDiceExpression, rollExpression } from "./diceEngineEvent";
import { rollDiceBoxGroupEvent, rollDiceBoxGroupsEvent, type DiceBoxRollGroupEvent } from "./diceBox";

type ParsedDiceExpressionEvent = ReturnType<typeof parseDiceExpression>;

type ResolvedDiceSelectionEvent = {
  keptRolls?: number[];
  droppedRolls?: number[];
  selectionMode: DiceResult["selectionMode"];
  scoringRolls: number[];
};

/**
 * 功能：按当前设置决定使用原生骰子还是 dice-box 完成一次掷骰。
 * @param exprRaw 原始骰式。
 * @param options 掷骰附加参数。
 * @returns 已标准化的掷骰结果。
 */
export async function rollDiceWithEngineEvent(exprRaw: string, options: DiceOptions = {}): Promise<DiceResult> {
  if (options.rule) {
    applyRulePolicyToExpressionEvent(exprRaw, options.rule);
  }

  const settings = getSettingsEvent();
  if (!settings.enable3DDiceBox || typeof document === "undefined") {
    return rollExpression(exprRaw, options);
  }

  const parsed = parseDiceExpression(exprRaw);

  try {
    const result = parsed.keepMode
      ? await rollKeepSelectorWithDiceBoxEvent(exprRaw, parsed)
      : options.adv || options.dis
        ? await rollAdvantagePairWithDiceBoxEvent(exprRaw, parsed, options)
        : await rollSimpleExpressionWithDiceBoxEvent(exprRaw, parsed);
    if (!result) {
      throw new Error("dice-box 未返回可用结果");
    }
    return result;
  } catch (error) {
    logger.warn("dice-box 掷骰失败，已回退到原生掷骰", error);
    return rollExpression(exprRaw, options);
  }
}

/**
 * 功能：把解析结果转换为 dice-box 可执行的基础骰式。
 * @param parsed 已解析的骰式结构。
 * @returns 去掉修正与保留语义后的基础骰式文本。
 */
function buildDiceBoxNotationEvent(parsed: ParsedDiceExpressionEvent): string {
  return `${parsed.count}d${parsed.sides}${parsed.explode ? "!" : ""}`;
}

/**
 * 功能：执行普通单组 dice-box 掷骰。
 * @param exprRaw 原始骰式。
 * @param parsed 原始骰式解析结果。
 * @returns 标准化后的结果。
 */
async function rollSimpleExpressionWithDiceBoxEvent(
  exprRaw: string,
  parsed: ParsedDiceExpressionEvent
): Promise<DiceResult | null> {
  const rollGroup = await rollDiceBoxGroupEvent(buildDiceBoxNotationEvent(parsed));
  return normalizeDiceBoxGroupToDiceResultEvent(exprRaw, parsed, parsed, rollGroup);
}

/**
 * 功能：执行带 kh/kl 的 dice-box 掷骰，并按现有保留语义重建结果。
 * @param exprRaw 原始骰式。
 * @param parsed 原始骰式解析结果。
 * @returns 标准化后的结果。
 */
async function rollKeepSelectorWithDiceBoxEvent(
  exprRaw: string,
  parsed: ParsedDiceExpressionEvent
): Promise<DiceResult | null> {
  const rollGroup = await rollDiceBoxGroupEvent(buildDiceBoxNotationEvent(parsed));
  return normalizeDiceBoxGroupToDiceResultEvent(exprRaw, parsed, parsed, rollGroup);
}

/**
 * 功能：执行事件型优势/劣势的双分组 dice-box 掷骰，并按旧逻辑取高或取低。
 * @param exprRaw 原始骰式。
 * @param parsed 原始骰式解析结果。
 * @param options 附加规则参数。
 * @returns 选中的最终结果。
 */
async function rollAdvantagePairWithDiceBoxEvent(
  exprRaw: string,
  parsed: ParsedDiceExpressionEvent,
  options: DiceOptions
): Promise<DiceResult | null> {
  const notation = buildDiceBoxNotationEvent(parsed);
  const groups = await rollDiceBoxGroupsEvent([notation, notation]);
  const normalized = groups
    .map((group) => normalizeDiceBoxGroupToDiceResultEvent(exprRaw, parsed, parsed, group))
    .filter((item): item is DiceResult => Boolean(item));
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length === 1) {
    return normalized[0];
  }

  return options.dis
    ? normalized.reduce((best, current) => current.total <= best.total ? current : best)
    : normalized.reduce((best, current) => current.total >= best.total ? current : best);
}

/**
 * 功能：根据保留规则计算计分骰面。
 * @param rolls 实际骰面数组。
 * @param parsed 实际执行的骰式结构。
 * @returns 计分结果与被保留/丢弃的骰面。
 */
function resolveDiceSelectionEvent(rolls: number[], parsed: ParsedDiceExpressionEvent): ResolvedDiceSelectionEvent {
  if (
    (parsed.keepMode !== "kh" && parsed.keepMode !== "kl")
    || !Number.isFinite(parsed.keepCount)
    || Number(parsed.keepCount) <= 0
    || parsed.keepCount >= rolls.length
  ) {
    return {
      keptRolls: parsed.keepMode ? [...rolls] : undefined,
      droppedRolls: parsed.keepMode ? [] : undefined,
      selectionMode: parsed.keepMode === "kh"
        ? "keep_highest"
        : parsed.keepMode === "kl"
          ? "keep_lowest"
          : "none",
      scoringRolls: [...rolls],
    };
  }

  const taggedRolls = rolls.map((value, index) => ({ value, index }));
  taggedRolls.sort((left, right) => {
    if (left.value === right.value) {
      return left.index - right.index;
    }
    return parsed.keepMode === "kh" ? right.value - left.value : left.value - right.value;
  });

  const keepCount = Number(parsed.keepCount);
  const keptIndex = new Set(taggedRolls.slice(0, keepCount).map((item) => item.index));
  const keptRolls = rolls.filter((_value, index) => keptIndex.has(index));
  const droppedRolls = rolls.filter((_value, index) => !keptIndex.has(index));
  return {
    keptRolls,
    droppedRolls,
    selectionMode: parsed.keepMode === "kh" ? "keep_highest" : "keep_lowest",
    scoringRolls: keptRolls,
  };
}

/**
 * 功能：把 dice-box 返回的首个分组标准化为 RollHelper 的 DiceResult。
 * @param exprRaw 原始骰式。
 * @param parsed 原始骰式解析结果。
 * @param effectiveParsed 实际执行的骰式解析结果。
 * @param rollGroup dice-box 返回的分组结果。
 * @returns 标准化后的 DiceResult；不可识别时返回空值。
 */
function normalizeDiceBoxGroupToDiceResultEvent(
  exprRaw: string,
  parsed: ParsedDiceExpressionEvent,
  effectiveParsed: ParsedDiceExpressionEvent,
  rollGroup: DiceBoxRollGroupEvent | null | undefined
): DiceResult | null {
  if (!rollGroup) {
    return null;
  }

  const rolls = Array.isArray(rollGroup.rolls)
    ? rollGroup.rolls
      .map((item) => Number(item?.value))
      .filter((value): value is number => Number.isFinite(value))
    : [];
  if (!rolls.length && Number.isFinite(Number(rollGroup.value))) {
    rolls.push(Number(rollGroup.value));
  }
  if (!rolls.length) {
    return null;
  }

  const selection = resolveDiceSelectionEvent(rolls, effectiveParsed);
  const rawTotal = selection.scoringRolls.reduce((sum, value) => sum + value, 0);
  const modifier = Number.isFinite(parsed.modifier) ? parsed.modifier : 0;
  const total = rawTotal + modifier;

  return {
    expr: exprRaw,
    count: effectiveParsed.count,
    sides: effectiveParsed.sides,
    modifier,
    rolls,
    rawTotal,
    total,
    keepMode: effectiveParsed.keepMode,
    keepCount: effectiveParsed.keepCount,
    keptRolls: selection.keptRolls,
    droppedRolls: selection.droppedRolls,
    selectionMode: selection.selectionMode,
    exploding: effectiveParsed.explode,
    explosionTriggered: Boolean(effectiveParsed.explode && rolls.length > effectiveParsed.count),
    sourceEngine: "dice_box",
  };
}
