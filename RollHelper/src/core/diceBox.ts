import DiceBox from "../vendor/dice-box/index.js";
import diceBoxCssText from "./diceBox.css?inline";
import type { DiceResult } from "../types/diceEvent";
import { parseDiceExpression } from "./diceEngineEvent";
import {
  DEFAULT_DICE_FOCUS_MOVE_DURATION_MS,
  DEFAULT_DICE_FOCUS_POSITION,
  DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
  animateDiceFocusLayoutEvent,
  resolveFocusedDiceEvent,
  resolveFocusedDiceRuntimeStatesEvent,
  type DiceBoxInstance,
  type FocusedDieInfo,
} from "./diceFocusRuntime";

type DiceBoxRollStatus = "critical_success" | "critical_failure" | "partial_success" | "success" | "failure";
export type DiceBoxRollGroupEvent = {
  qty?: number;
  sides?: number | string;
  modifier?: number;
  value?: number;
  rolls?: Array<{ value?: number }>;
};

/**
 * 功能：把 3D 骰子样式注入到当前页面。
 * @returns 无返回值。
 */
function injectDiceBoxCss(): void {
  if (!document.getElementById("dice-box-style")) {
    const style = document.createElement("style");
    style.id = "dice-box-style";
    style.textContent = diceBoxCssText;
    document.head.appendChild(style);
  }
}

let diceBoxInstance: DiceBoxInstance | null = null;
let initialized = false;
const DICE_ROLL_MIN_DURATION_MS = 3000;
const DICE_CAMERA_FOCUS_DURATION_MS = 1200;
const DICE_RESULT_ANIMATION_DURATION_MS = 2400;
const DICE_REVEAL_HOLD_DURATION_MS = 900;
const DICE_CANVAS_FADE_DURATION_MS = 520;
const DICE_CANVAS_HIDE_CLASS = "dice-box-canvas--hide";
let focusedDice: FocusedDieInfo[] = [];

/**
 * 功能：等待指定毫秒数后继续执行。
 * @param ms 需要等待的毫秒数。
 * @returns 等待完成后的 Promise。
 */
function delayEvent(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 功能：等待下一帧，给 dice-box 画布留出挂载与布局时间。
 * @returns 下一帧回调完成后的 Promise。
 */
function waitForNextFrameEvent(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * 功能：把 dice-box 的分组结果转换为 RollHelper 统一的骰子结果结构。
 * @param expr 原始骰式文本。
 * @param rollGroup dice-box 返回的首个分组结果。
 * @returns 标准化后的骰子结果；无法识别时返回空值。
 */
function normalizeDiceBoxResultEvent(expr: string, rollGroup: DiceBoxRollGroupEvent | null | undefined): DiceResult | null {
  if (!rollGroup) {
    return null;
  }

  let parsedExpr: ReturnType<typeof parseDiceExpression> | null = null;
  try {
    parsedExpr = parseDiceExpression(expr);
  } catch {
    parsedExpr = null;
  }

  const rolls = Array.isArray(rollGroup.rolls)
    ? rollGroup.rolls
      .map((item) => Number(item?.value))
      .filter((value): value is number => Number.isFinite(value))
    : [];
  const count = Math.max(1, Number(rollGroup.qty) || rolls.length || 1);
  const modifier = parsedExpr
    ? parsedExpr.modifier
    : Number.isFinite(Number(rollGroup.modifier))
      ? Number(rollGroup.modifier)
      : 0;
  const sidesRaw = rollGroup.sides;
  const sides = parsedExpr
    ? parsedExpr.sides
    : typeof sidesRaw === "number"
      ? sidesRaw
      : typeof sidesRaw === "string"
        ? Number(String(sidesRaw).replace(/\D/g, "")) || 0
        : 0;
  const rawTotal = rolls.reduce((sum, value) => sum + value, 0);
  const total = rawTotal + modifier;
  const exploding = parsedExpr ? parsedExpr.explode : expr.includes("!");
  const explosionTriggered = exploding && rolls.length > count;

  return {
    expr,
    count,
    sides,
    modifier,
    rolls,
    rawTotal,
    total,
    keptRolls: [...rolls],
    droppedRolls: [],
    selectionMode: "none",
    exploding,
    explosionTriggered,
    sourceEngine: "dice_box",
  };
}

/**
 * 功能：获取当前骰子画布节点。
 * @returns 骰子画布；不存在时返回 `null`。
 */
function getDiceCanvasElementEvent(): HTMLCanvasElement | null {
  const canvas = document.querySelector("#dice-box-container .dice-box-canvas");
  return canvas instanceof HTMLCanvasElement ? canvas : null;
}

/**
 * 功能：判断当前 3D 骰子画布是否已成功渲染并处于可显示状态。
 * @returns 若画布存在且可见则返回 `true`。
 */
function isDiceCanvasRenderableEvent(): boolean {
  const canvas = getDiceCanvasElementEvent();
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  const style = window.getComputedStyle(canvas as unknown as Element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) <= 0) {
    return false;
  }
  return rect.width > 0 && rect.height > 0;
}

/**
 * 功能：校验 3D 骰子画布是否成功显示；失败时抛错以便上层回退原生掷骰。
 * @param stage 当前检测阶段。
 * @returns 无返回值。
 */
async function ensureDiceCanvasRenderableEvent(stage: "init" | "roll"): Promise<void> {
  await waitForNextFrameEvent();
  if (isDiceCanvasRenderableEvent()) {
    return;
  }
  await delayEvent(32);
  if (isDiceCanvasRenderableEvent()) {
    return;
  }
  throw new Error(`3D 骰子显示失败（${stage}）`);
}

/**
 * 功能：强制显示骰子画布，避免宿主环境下 `show()` 未生效。
 * @returns 无返回值。
 */
function forceShowDiceCanvasEvent(): void {
  const canvas = getDiceCanvasElementEvent();
  if (!canvas) return;
  canvas.classList.remove(DICE_CANVAS_HIDE_CLASS);
  canvas.style.display = "block";
  canvas.style.visibility = "visible";
  canvas.style.opacity = "1";
}

/**
 * 功能：开始播放骰子画布的淡出动画。
 * @returns 无返回值。
 */
function startHideDiceCanvasEvent(): void {
  const canvas = getDiceCanvasElementEvent();
  if (!canvas) return;
  canvas.classList.add(DICE_CANVAS_HIDE_CLASS);
}

/**
 * 功能：强制隐藏骰子画布。
 * @returns 无返回值。
 */
function forceHideDiceCanvasEvent(): void {
  const canvas = getDiceCanvasElementEvent();
  if (!canvas) return;
  canvas.classList.add(DICE_CANVAS_HIDE_CLASS);
  canvas.style.visibility = "hidden";
}

/**
 * 功能：把检定结果状态转换成中文文案。
 * @param status 检定结果状态。
 * @returns 中文结果文本。
 */
function getRollAnimationLabelEvent(status: DiceBoxRollStatus): string {
  if (status === "critical_success") return "大成功";
  if (status === "critical_failure") return "大失败";
  if (status === "partial_success") return "勉强成功";
  if (status === "failure") return "失败";
  return "成功";
}

/**
 * 功能：返回检定结果对应的中文副标题。
 * @param status 检定结果状态。
 * @returns 中文副标题文本。
 */
function getRollAnimationSubLabelEvent(status: DiceBoxRollStatus): string {
  if (status === "critical_success") return "完美命中";
  if (status === "critical_failure") return "局势失控";
  if (status === "partial_success") return "成功但有代价";
  if (status === "failure") return "检定未通过";
  return "检定通过";
}

/**
 * 功能：解析 3D 骰子静态资源目录的本地地址。
 * @returns 本地资源目录 URL，末尾始终带有斜杠。
 */
function resolveDiceBoxAssetPath(): string {
  const assetUrl = new URL(/* @vite-ignore */ "./assets/dice-box/", import.meta.url).href;
  return assetUrl.endsWith("/") ? assetUrl : `${assetUrl}/`;
}

/**
 * 功能：初始化 3D 骰子容器与 DiceBox 实例。
 * @returns 已初始化的 DiceBox 实例。
 */
export async function initDiceBox(): Promise<DiceBoxInstance> {
  if (initialized && diceBoxInstance) return diceBoxInstance;

  injectDiceBoxCss();

  let container = document.getElementById("dice-box-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "dice-box-container";
    document.body.appendChild(container);
  }

  diceBoxInstance = new DiceBox("#dice-box-container", {
    assetPath: resolveDiceBoxAssetPath(),
    origin: "",
    theme: "default",
    themeColor: "#4287f5",
    offscreen: false,
    scale: 6,
    gravity: 2,
    startingHeight: 9,
    throwForce: 5.8,
    restitution: 0.46,
    friction: 0.52,
    linearDamping: 0.24,
    angularDamping: 0.2,
    settleTimeout: 5800,
  });

  await diceBoxInstance.init();

  // 监听容器尺寸变化（含 F12 切换设备模式），同步物理边界
  const resizeObserver = new ResizeObserver(() => {
    window.dispatchEvent(new Event("resize"));
  });
  resizeObserver.observe(container);

  // 初始化后立即触发一次，确保物理边界与容器对齐
  window.dispatchEvent(new Event("resize"));

  diceBoxInstance.hide(DICE_CANVAS_HIDE_CLASS);
  forceHideDiceCanvasEvent();
  initialized = true;
  return diceBoxInstance;
}

/**
 * 功能：把聚焦骰子移动到画面中央，制造近景特写效果。
 * @returns 聚焦结束后的 Promise。
 */
async function playDiceCameraFocusEvent(): Promise<void> {
  const box = await initDiceBox();
  if (!focusedDice.length) {
    await delayEvent(DICE_CAMERA_FOCUS_DURATION_MS);
    return;
  }

  const runtimeStates = await resolveFocusedDiceRuntimeStatesEvent(box, focusedDice);
  if (!runtimeStates.length) {
    await delayEvent(DICE_CAMERA_FOCUS_DURATION_MS);
    return;
  }
  await animateDiceFocusLayoutEvent({
    box,
    dice: runtimeStates,
    focusPosition: DEFAULT_DICE_FOCUS_POSITION,
    baseScaleMultiplier: DEFAULT_DICE_FOCUS_SCALE_MULTIPLIER,
    durationMs: DEFAULT_DICE_FOCUS_MOVE_DURATION_MS,
  });
  await delayEvent(DICE_CAMERA_FOCUS_DURATION_MS - DEFAULT_DICE_FOCUS_MOVE_DURATION_MS);
}

/**
 * 功能：播放一次 3D 骰子掷骰动画。
 * @param expr 骰子表达式。
 * @returns 3D 骰子库返回的动画结果。
 */
export async function roll3DDice(expr: string): Promise<DiceResult | null> {
  const rollGroup = await rollDiceBoxGroupEvent(expr);
  return normalizeDiceBoxResultEvent(expr, rollGroup);
}

/**
 * 功能：按指定骰式执行一次 dice-box 掷骰，并返回所有分组结果。
 * @param notation 供 dice-box 执行的骰式或分组骰式数组。
 * @returns 本次掷骰的全部分组结果。
 */
export async function rollDiceBoxGroupsEvent(notation: unknown): Promise<DiceBoxRollGroupEvent[]> {
  const box = await initDiceBox();
  const startedAt = Date.now();
  focusedDice = [];
  box.show();
  forceShowDiceCanvasEvent();
  await ensureDiceCanvasRenderableEvent("init");
  box.clear();
  await box.roll(notation as never);
  await ensureDiceCanvasRenderableEvent("roll");
  const elapsed = Date.now() - startedAt;
  const remain = DICE_ROLL_MIN_DURATION_MS - elapsed;
  if (remain > 0) {
    await delayEvent(remain);
  }
  focusedDice = resolveFocusedDiceEvent(box);
  const rollResults = (box as unknown as {
    getRollResults?: () => DiceBoxRollGroupEvent[];
  }).getRollResults?.() ?? [];
  return rollResults;
}

/**
 * 功能：按指定骰式执行一次 dice-box 掷骰，并返回首个分组结果。
 * @param notation 供 dice-box 执行的骰式。
 * @returns 首个分组结果；失败时返回空值。
 */
export async function rollDiceBoxGroupEvent(notation: string): Promise<DiceBoxRollGroupEvent | null> {
  const rollResults = await rollDiceBoxGroupsEvent(notation);
  return rollResults[0] ?? null;
}

/**
 * 功能：播放检定结果提示动画。
 * @param status 检定结果状态。
 * @returns 动画初段完成后的 Promise。
 */
export function playRollAnimation(status: DiceBoxRollStatus): Promise<void> {
  injectDiceBoxCss();
  return new Promise<void>((resolve) => {
    const el = document.createElement("div");
    el.className = `roll-result-anim ${status}`;
    el.innerHTML = `
      <span class="roll-result-anim__title">${getRollAnimationLabelEvent(status)}</span>
      <span class="roll-result-anim__subtitle">${getRollAnimationSubLabelEvent(status)}</span>
    `;
    el.style.zIndex = "2147483647";
    void (async (): Promise<void> => {
      try {
        await playDiceCameraFocusEvent();
        document.body.appendChild(el);
        await delayEvent(DICE_RESULT_ANIMATION_DURATION_MS);
      } finally {
        const box = await initDiceBox();
        box.hide(DICE_CANVAS_HIDE_CLASS);
        startHideDiceCanvasEvent();
        await delayEvent(DICE_CANVAS_FADE_DURATION_MS);
        forceHideDiceCanvasEvent();
        focusedDice = [];
        if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
        resolve();
      }
    })();
  });
}

/**
 * 功能：在不展示成功失败结果文案的前提下，安全结束当前 3D 骰子展示并隐藏画布。
 * @returns 动画收尾结束后的 Promise。
 */
export async function hideDiceBoxPresentationEvent(): Promise<void> {
  injectDiceBoxCss();
  const box = await initDiceBox();
  box.hide(DICE_CANVAS_HIDE_CLASS);
  startHideDiceCanvasEvent();
  await delayEvent(DICE_CANVAS_FADE_DURATION_MS);
  forceHideDiceCanvasEvent();
  focusedDice = [];
}

/**
 * 功能：仅展示 3D 骰子的聚焦收尾，不叠加成功失败文案。
 * @returns 动画结束后的 Promise。
 */
export function playDiceRevealOnlyEvent(): Promise<void> {
  injectDiceBoxCss();
  return new Promise<void>((resolve) => {
    void (async (): Promise<void> => {
      try {
        await playDiceCameraFocusEvent();
        await delayEvent(DICE_REVEAL_HOLD_DURATION_MS);
      } finally {
        const box = await initDiceBox();
        box.hide(DICE_CANVAS_HIDE_CLASS);
        startHideDiceCanvasEvent();
        await delayEvent(DICE_CANVAS_FADE_DURATION_MS);
        forceHideDiceCanvasEvent();
        focusedDice = [];
        resolve();
      }
    })();
  });
}
