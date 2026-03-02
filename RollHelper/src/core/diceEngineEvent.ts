import type { DiceOptions, DiceResult } from "../types/diceEvent";
import { getSettingsEvent } from "../settings/storeEvent";

const MAX_DICE_COUNT = 1000;
const MAX_DICE_SIDES = 1000;
const MAX_EXPLOSION_ROLLS = 10000;

function parseAllowedSidesFromRuleTextEvent(ruleText: string): Set<number> | null {
  const raw = String(ruleText || "").trim();
  if (!raw) return null;

  const blockMatch = raw.match(/\[DICE_ALLOWED_SIDES\]([\s\S]*?)\[\/DICE_ALLOWED_SIDES\]/i);
  const scanText = blockMatch ? blockMatch[1] : raw;
  const lineMatch = scanText.match(/allowed_sides\s*=\s*([^\n\r]+)/i);
  if (!lineMatch) return null;

  const parsed = lineMatch[1]
    .split(/[,\s]+/)
    .map((item) => Number(String(item || "").trim()))
    .filter((value) => Number.isFinite(value) && Number.isInteger(value) && value > 0);

  if (parsed.length === 0) return null;
  return new Set(parsed);
}

function applyRulePolicyToExpressionEvent(exprRaw: string, ruleText: string): void {
  const parsedExpr = parseDiceExpression(exprRaw);
  const allowedSidesSet = parseAllowedSidesFromRuleTextEvent(ruleText);
  if (!allowedSidesSet || allowedSidesSet.size === 0) return;
  if (!allowedSidesSet.has(parsedExpr.sides)) {
    throw new Error(
      `当前规则不允许 d${parsedExpr.sides}，allowed_sides=${Array.from(allowedSidesSet)
        .sort((a, b) => a - b)
        .join(",")}`
    );
  }
}

export function parseDiceExpression(exprRaw: string): {
  count: number;
  sides: number;
  modifier: number;
  explode: boolean;
  keepMode?: "kh" | "kl";
  keepCount?: number;
} {
  const expr = String(exprRaw || "").replace(/\s+/g, "");
  const regex = /^(\d*)d(\d+)(!)?(?:(kh|kl)(\d+))?([+\-]\d+)?$/i;
  const match = expr.match(regex);

  if (!match) {
    throw new Error(`无效的骰子表达式：${exprRaw}，示例：1d20、3d6+2、2d20kh1`);
  }

  const count = Number(match[1] || 1);
  const sides = Number(match[2]);
  const explode = !!match[3];
  const keepModeRaw = String(match[4] || "").toLowerCase();
  const keepMode = keepModeRaw === "kh" || keepModeRaw === "kl" ? (keepModeRaw as "kh" | "kl") : undefined;
  const keepCount = keepMode ? Number(match[5] || 0) : undefined;
  const modifier = Number(match[6] || 0);

  if (!Number.isFinite(count) || !Number.isInteger(count) || count <= 0) {
    throw new Error(`骰子数量无效：${count}`);
  }
  if (!Number.isFinite(sides) || !Number.isInteger(sides) || sides <= 0) {
    throw new Error(`骰子面数无效：${sides}`);
  }
  if (count > MAX_DICE_COUNT) {
    throw new Error(`骰子数量过大（${count}），上限 ${MAX_DICE_COUNT}`);
  }
  if (sides > MAX_DICE_SIDES) {
    throw new Error(`骰子面数过大（${sides}），上限 ${MAX_DICE_SIDES}`);
  }
  if (keepMode) {
    if (!Number.isFinite(keepCount) || !Number.isInteger(keepCount) || keepCount! <= 0) {
      throw new Error(`kh/kl 参数无效：${exprRaw}`);
    }
    if (keepCount! > count) {
      throw new Error(`kh/kl 保留数量不能大于骰子数量：${exprRaw}`);
    }
  }
  if (explode && keepMode) {
    throw new Error("当前版本不支持 ! 与 kh/kl 同时使用");
  }

  return { count, sides, modifier, explode, keepMode, keepCount };
}

function rollOnce(sides: number): number {
  const max = Math.floor(sides);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0xffffffff / max) * max;
    let rand: number;
    do {
      crypto.getRandomValues(buf);
      rand = buf[0];
    } while (rand >= limit);
    return (rand % max) + 1;
  }
  return Math.floor(Math.random() * max) + 1;
}

function pushRollWithExplosion(sides: number, explode: boolean, rolls: number[]): void {
  let value = rollOnce(sides);
  rolls.push(value);

  if (!explode) {
    return;
  }

  while (value === sides) {
    if (rolls.length >= MAX_EXPLOSION_ROLLS) {
      throw new Error(`爆骰次数超过安全上限 ${MAX_EXPLOSION_ROLLS}，请调整表达式`);
    }
    value = rollOnce(sides);
    rolls.push(value);
  }
}

function rollBaseExpression(exprRaw: string): DiceResult {
  const { count, sides, modifier, explode, keepMode, keepCount } = parseDiceExpression(exprRaw);
  const settings = getSettingsEvent();
  const effectiveExplode = explode && settings.enableExplodingDice;
  const rolls: number[] = [];

  for (let i = 0; i < count; i++) {
    pushRollWithExplosion(sides, effectiveExplode, rolls);
  }

  let keptRolls: number[] | undefined;
  let droppedRolls: number[] | undefined;
  let selectionMode: DiceResult["selectionMode"] = "none";

  if (keepMode && keepCount && keepCount < rolls.length) {
    const taggedRolls = rolls.map((value, index) => ({ value, index }));
    taggedRolls.sort((a, b) => {
      if (a.value === b.value) return a.index - b.index;
      return keepMode === "kh" ? b.value - a.value : a.value - b.value;
    });
    const keptIndex = new Set(taggedRolls.slice(0, keepCount).map((item) => item.index));
    keptRolls = rolls.filter((_, index) => keptIndex.has(index));
    droppedRolls = rolls.filter((_, index) => !keptIndex.has(index));
    selectionMode = keepMode === "kh" ? "keep_highest" : "keep_lowest";
  } else if (keepMode && keepCount) {
    keptRolls = [...rolls];
    droppedRolls = [];
    selectionMode = keepMode === "kh" ? "keep_highest" : "keep_lowest";
  }

  const scoringRolls = Array.isArray(keptRolls) ? keptRolls : rolls;
  const rawTotal = scoringRolls.reduce((a, b) => a + b, 0);
  const total = rawTotal + modifier;
  const explosionTriggered = effectiveExplode && rolls.length > count;

  return {
    expr: exprRaw,
    count,
    sides,
    modifier,
    rolls,
    rawTotal,
    total,
    keepMode,
    keepCount,
    keptRolls,
    droppedRolls,
    selectionMode,
    exploding: effectiveExplode,
    explosionTriggered,
  };
}

export function rollExpression(exprRaw: string, options: DiceOptions = {}): DiceResult {
  if (options.rule) {
    applyRulePolicyToExpressionEvent(exprRaw, options.rule);
  }

  let result = rollBaseExpression(exprRaw);

  if (options.adv) {
    const r1 = rollBaseExpression(exprRaw);
    const r2 = rollBaseExpression(exprRaw);
    result = r1.total >= r2.total ? r1 : r2;
  }

  if (options.dis) {
    const r1 = rollBaseExpression(exprRaw);
    const r2 = rollBaseExpression(exprRaw);
    result = r1.total <= r2.total ? r1 : r2;
  }

  return result;
}

export function evaluateSuccessEvent(
  total: number,
  compare: ">=" | ">" | "<=" | "<",
  dc: number | null
): boolean | null {
  if (dc == null || !Number.isFinite(dc)) return null;
  switch (compare) {
    case ">=":
      return total >= dc;
    case ">":
      return total > dc;
    case "<=":
      return total <= dc;
    case "<":
      return total < dc;
    default:
      return null;
  }
}

export function applySkillModifierToDiceResultEvent(
  result: DiceResult,
  skillModifier: number
): { result: DiceResult; baseModifierUsed: number; finalModifierUsed: number } {
  const baseModifierUsed = Number.isFinite(Number(result.modifier)) ? Number(result.modifier) : 0;
  const numericSkillModifier = Number.isFinite(Number(skillModifier)) ? Number(skillModifier) : 0;
  const finalModifierUsed = baseModifierUsed + numericSkillModifier;
  if (numericSkillModifier === 0) {
    return { result, baseModifierUsed, finalModifierUsed };
  }
  return {
    result: {
      ...result,
      modifier: finalModifierUsed,
      total: Number(result.rawTotal) + finalModifierUsed,
    },
    baseModifierUsed,
    finalModifierUsed,
  };
}
