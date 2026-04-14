import { normalizeBlankLinesEvent, simpleHashEvent } from "../core/utilsEvent";
import { buildActiveStatusesBlockEvent, ensureActiveStatusesEvent as ensureActiveStatusesFromMetaEvent } from "./statusEvent";
import {
  extractTavernMessageOriginalTextEvent as extractSdkTavernMessageOriginalTextEvent,
  extractTavernPromptMessagesEvent as extractSdkTavernPromptMessagesEvent,
  findFirstTavernPromptSystemIndexEvent as findFirstSdkTavernPromptSystemIndexEvent,
  findLastTavernPromptSystemIndexEvent as findLastSdkTavernPromptSystemIndexEvent,
  findLastTavernPromptUserIndexEvent as findLastSdkTavernPromptUserIndexEvent,
  getTavernPromptMessageTextEvent as getSdkTavernPromptMessageTextEvent,
  insertTavernPromptSystemMessageEvent as insertSdkTavernPromptSystemMessageEvent,
  isTavernPromptSystemMessageEvent as isSdkTavernPromptSystemMessageEvent,
  isTavernPromptUserMessageEvent as isSdkTavernPromptUserMessageEvent,
  listTavernPromptTargetsEvent as listSdkTavernPromptTargetsEvent,
  setTavernPromptMessageTextEvent as setSdkTavernPromptMessageTextEvent,
} from "../../../SDK/tavern";
import type { SdkTavernPromptTargetEvent } from "../../../SDK/tavern";
import type {
  BlindGuidanceEvent,
  BuiltSummaryBlocksEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventResultGradeEvent,
  PendingResultGuidanceEvent,
  RoundSummarySnapshotEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";
import { appendSdkPluginChatRecord } from "../../../SDK/db";
import { buildSdkChatKeyEvent } from "../../../SDK/tavern/chatkey";
import { AI_SUPPORTED_DICE_SIDES_Event } from "../settings/constantsEvent";
import {
  buildAssistantFloorKeyEvent,
  pruneExpiredBlindGuidanceQueueEvent,
  updateBlindHistoryStateByRollIdEvent,
} from "./roundEvent";
import {
  buildBlindGuidanceBlockEvent,
  buildPassiveDiscoveryBlockEvent,
  resolvePassiveDiscoveriesEvent,
} from "./passiveBlindEvent";

const DEFAULT_RULE_BLOCK_START_Event = "<dice_rules>";
const DEFAULT_RULE_BLOCK_END_Event = "</dice_rules>";
const DEFAULT_BLIND_SUMMARY_BLOCK_START_Event = "<dice_blind_round_summary>";
const DEFAULT_BLIND_SUMMARY_BLOCK_END_Event = "</dice_blind_round_summary>";
const DEFAULT_SUMMARY_BLOCK_START_Event = "<dice_round_summary>";
const DEFAULT_SUMMARY_BLOCK_END_Event = "</dice_round_summary>";
const DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event = "<dice_result_guidance>";
const DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event = "</dice_result_guidance>";
const DEFAULT_BLIND_GUIDANCE_BLOCK_START_Event = "<dice_blind_guidance>";
const DEFAULT_BLIND_GUIDANCE_BLOCK_END_Event = "</dice_blind_guidance>";
const DEFAULT_RUNTIME_POLICY_BLOCK_START_Event = "<dice_runtime_policy>";
const DEFAULT_RUNTIME_POLICY_BLOCK_END_Event = "</dice_runtime_policy>";
const DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event = "<dice_active_statuses>";
const DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event = "</dice_active_statuses>";
const DEFAULT_PASSIVE_DISCOVERY_BLOCK_START_Event = "<dice_passive_discovery>";
const DEFAULT_PASSIVE_DISCOVERY_BLOCK_END_Event = "</dice_passive_discovery>";

function normalizeTextEvent(raw: any): string {
  return String(raw ?? "");
}

function normalizeInlineTextEvent(raw: any): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegexEvent(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBlockTextEvent(input: string): string {
  return normalizeBlankLinesEvent(String(input || ""));
}

function getBlockTagsEvent(
  tags?: Partial<{
    ruleStart: string;
    ruleEnd: string;
    runtimePolicyStart: string;
    runtimePolicyEnd: string;
    blindSummaryStart: string;
    blindSummaryEnd: string;
    summaryStart: string;
    summaryEnd: string;
    guidanceStart: string;
    guidanceEnd: string;
    blindStart: string;
    blindEnd: string;
    statusesStart: string;
    statusesEnd: string;
    passiveStart: string;
    passiveEnd: string;
  }>
): { start: string; end: string }[] {
  const ruleStart = tags?.ruleStart || DEFAULT_RULE_BLOCK_START_Event;
  const ruleEnd = tags?.ruleEnd || DEFAULT_RULE_BLOCK_END_Event;
  const runtimePolicyStart = tags?.runtimePolicyStart || DEFAULT_RUNTIME_POLICY_BLOCK_START_Event;
  const runtimePolicyEnd = tags?.runtimePolicyEnd || DEFAULT_RUNTIME_POLICY_BLOCK_END_Event;
  const blindSummaryStart = tags?.blindSummaryStart || DEFAULT_BLIND_SUMMARY_BLOCK_START_Event;
  const blindSummaryEnd = tags?.blindSummaryEnd || DEFAULT_BLIND_SUMMARY_BLOCK_END_Event;
  const summaryStart = tags?.summaryStart || DEFAULT_SUMMARY_BLOCK_START_Event;
  const summaryEnd = tags?.summaryEnd || DEFAULT_SUMMARY_BLOCK_END_Event;
  const guidanceStart = tags?.guidanceStart || DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event;
  const guidanceEnd = tags?.guidanceEnd || DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event;
  const blindStart = tags?.blindStart || DEFAULT_BLIND_GUIDANCE_BLOCK_START_Event;
  const blindEnd = tags?.blindEnd || DEFAULT_BLIND_GUIDANCE_BLOCK_END_Event;
  const statusesStart = tags?.statusesStart || DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event;
  const statusesEnd = tags?.statusesEnd || DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event;
  const passiveStart = tags?.passiveStart || DEFAULT_PASSIVE_DISCOVERY_BLOCK_START_Event;
  const passiveEnd = tags?.passiveEnd || DEFAULT_PASSIVE_DISCOVERY_BLOCK_END_Event;
  return [
    { start: ruleStart, end: ruleEnd },
    { start: runtimePolicyStart, end: runtimePolicyEnd },
    { start: blindSummaryStart, end: blindSummaryEnd },
    { start: summaryStart, end: summaryEnd },
    { start: guidanceStart, end: guidanceEnd },
    { start: blindStart, end: blindEnd },
    { start: statusesStart, end: statusesEnd },
    { start: passiveStart, end: passiveEnd },
  ];
}

function normalizeRoleEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const role = String((message as any).role ?? "").trim().toLowerCase();
  return role;
}

function resolveMessageTimestampEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const value =
    (message as any).create_date ??
    (message as any).create_time ??
    (message as any).timestamp ??
    "";
  const normalized = String(value ?? "").trim();
  return normalized;
}

function resolveMessageExplicitIdEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const explicitId = (message as any).id ?? (message as any).cid ?? (message as any).uid;
  if (explicitId == null) return "";
  return String(explicitId);
}

function formatGradeLabelEvent(grade: EventResultGradeEvent): string {
  switch (grade) {
    case "critical_success":
      return "大成功";
    case "partial_success":
      return "勉强成功";
    case "success":
      return "成功";
    case "failure":
      return "失败";
    case "critical_failure":
      return "大失败";
    default:
      return "结果";
  }
}

function buildResultGuidanceInstructionEvent(
  item: PendingResultGuidanceEvent,
  settings: DicePluginSettingsEvent
): string {
  const title = item.eventTitle || item.eventId;
  const sourceHint = normalizeInlineTextEvent(item.targetLabel || "");
  const sourceText = sourceHint ? `，触发片段是「${sourceHint}」` : "";
  switch (item.resultGrade) {
    case "critical_success":
      return `玩家在「${title}」中掷出大成功${sourceText}，请用英雄化、戏剧性的口吻描述其完美完成动作，并给出额外收益、额外线索或更优局面。`;
    case "partial_success":
      return `玩家在「${title}」中勉强成功${sourceText}，请描述“成功但有代价”，代价可包含受伤、暴露、资源损失或引来威胁。`;
    case "success":
      return `玩家在「${title}」中成功${sourceText}，请给出稳定推进的叙事结果，避免无缘无故追加重罚。`;
    case "failure":
      return settings.enableNarrativeCostEnforcement
        ? `玩家在「${title}」中失败${sourceText}。必须附带明确叙事代价，至少体现时间损失、误判、暴露、资源消耗或引发下一风险之一，同时让剧情继续推进。`
        : `玩家在「${title}」中失败${sourceText}，请描述受阻但剧情继续推进，可引入新的困难或替代路径。`;
    case "critical_failure":
      return settings.enableNarrativeCostEnforcement
        ? `玩家在「${title}」中大失败${sourceText}。必须出现显著误判或危险后果，并带来明确叙事代价，但不要把剧情直接写死，仍要保留后续行动空间。`
        : `玩家在「${title}」中大失败${sourceText}，请描述显著且可感知的严重后果，同时保持后续可行动性。`;
    default:
      return `玩家在「${title}」中完成检定，请根据结果推进叙事。`;
  }
}
function buildResultGuidanceTextEvent(
  queue: PendingResultGuidanceEvent[],
  settings: DicePluginSettingsEvent,
  guidanceStartTag: string,
  guidanceEndTag: string
): string {
  if (!Array.isArray(queue) || queue.length === 0) return "";
  const lines: string[] = [];
  lines.push(guidanceStartTag);
  lines.push(`v=1 count=${queue.length}`);
  for (const item of queue) {
    const gradeLabel = formatGradeLabelEvent(item.resultGrade);
    const compareText = `${item.compareUsed} ${item.dcUsed == null ? "N/A" : item.dcUsed}`;
    const marginText = item.marginToDc == null ? "N/A" : String(item.marginToDc);
    const advantageText = item.advantageStateApplied || "normal";
    lines.push(
      `- [${gradeLabel}] event="${normalizeInlineTextEvent(item.eventTitle)}" target="${normalizeInlineTextEvent(
        item.targetLabel
      )}" total=${item.total} check=${compareText} margin=${marginText} advantage=${advantageText}`
    );
    lines.push(`  instruction: ${buildResultGuidanceInstructionEvent(item, settings)}`);
  }
  lines.push(guidanceEndTag);
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function getMessageTextEvent(message: TavernMessageEvent | undefined): string {
  return getSdkTavernPromptMessageTextEvent(message);
}

/**
 * 功能：从宿主读取助手原文候选，仅供快照捕获阶段作为输入使用。
 * @param message 待读取的助手消息。
 * @returns 宿主提供的原始候选文本；不存在时返回空字符串。
 */
export function getAssistantOriginalSourceCandidateFromHostEvent(
  message: TavernMessageEvent | undefined
): string {
  const result = extractSdkTavernMessageOriginalTextEvent(message);
  return String(result.text ?? "");
}

export function getPreferredAssistantSourceTextEvent(message: TavernMessageEvent | undefined): string {
  if (!message || typeof message !== "object") return "";
  const swipeId = Number((message as any).swipe_id ?? (message as any).swipeId);
  const swipes = (message as any).swipes;
  if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
    const swipeText = String(swipes[swipeId] ?? "");
    if (swipeText.trim()) return swipeText;
  }
  if (typeof (message as any).mes === "string" && (message as any).mes.trim()) {
    return String((message as any).mes);
  }
  return getMessageTextEvent(message);
}

export function setMessageTextEvent(message: TavernMessageEvent, text: string): void {
  setSdkTavernPromptMessageTextEvent(message, text);
}

export function isUserMessageEvent(message: TavernMessageEvent | undefined): boolean {
  return isSdkTavernPromptUserMessageEvent(message);
}

export function isSystemMessageEvent(message: TavernMessageEvent | undefined): boolean {
  return isSdkTavernPromptSystemMessageEvent(message);
}

export function isAssistantMessageEvent(message: TavernMessageEvent | undefined): boolean {
  if (!message || typeof message !== "object") return false;
  if (isUserMessageEvent(message) || isSystemMessageEvent(message)) return false;
  const role = normalizeRoleEvent(message);
  if (role) return role === "assistant";
  return true;
}

export function findFirstSystemIndexEvent(chat: TavernMessageEvent[]): number {
  return findFirstSdkTavernPromptSystemIndexEvent(chat);
}

export function findLastSystemIndexEvent(chat: TavernMessageEvent[]): number {
  return findLastSdkTavernPromptSystemIndexEvent(chat);
}

export function findLastUserIndexEvent(chat: TavernMessageEvent[]): number {
  return findLastSdkTavernPromptUserIndexEvent(chat);
}

export function findLastUserMessageEvent(chat: TavernMessageEvent[]): TavernMessageEvent | null {
  const idx = findLastUserIndexEvent(chat);
  if (idx < 0) return null;
  return chat[idx] || null;
}

/**
 * 功能：为本次 prompt payload 创建一条 system 消息，用于承载受管注入块。
 * @param chat 当前 prompt 消息数组
 * @param insertBeforeIndex 插入位置
 * @param template 作为结构参考的消息
 * @returns 新创建的 system 消息
 */
function insertManagedSystemMessageEvent(
  chat: TavernMessageEvent[],
  insertBeforeIndex: number,
  template: TavernMessageEvent | undefined
): TavernMessageEvent {
  return insertSdkTavernPromptSystemMessageEvent(chat, {
    role: "system",
    insertMode: "before_index",
    insertBeforeIndex,
    template,
    text: "",
  }) as TavernMessageEvent;
}

export function buildPromptMessageIdEvent(message: TavernMessageEvent, index: number): string {
  const baseText = getMessageTextEvent(message);
  return buildPromptMessageIdByTextEvent(baseText, message, index);
}

function buildPromptMessageIdByTextEvent(
  baseTextRaw: string,
  message: TavernMessageEvent,
  index: number
): string {
  const baseText = String(baseTextRaw ?? "");
  const hash = simpleHashEvent(baseText);
  const explicitId = resolveMessageExplicitIdEvent(message);
  if (explicitId) {
    return `prompt_user:${explicitId}:${hash}`;
  }
  const ts = resolveMessageTimestampEvent(message);
  if (ts) {
    return `prompt_user_ts:${ts}:${hash}`;
  }
  return `prompt_user_idx:${index}:${hash}`;
}

export function stripManagedBlocksEvent(
  text: string,
  tags?: Partial<{
    ruleStart: string;
    ruleEnd: string;
    runtimePolicyStart: string;
    runtimePolicyEnd: string;
    blindSummaryStart: string;
    blindSummaryEnd: string;
    summaryStart: string;
    summaryEnd: string;
    guidanceStart: string;
    guidanceEnd: string;
    statusesStart: string;
    statusesEnd: string;
  }>
): string {
  let next = normalizeTextEvent(text);
  for (const tag of getBlockTagsEvent(tags)) {
    const pattern = new RegExp(`${escapeRegexEvent(tag.start)}[\\s\\S]*?${escapeRegexEvent(tag.end)}`, "gi");
    next = next.replace(pattern, "\n");
  }
  return normalizeBlockTextEvent(next);
}

export function buildDiceRuleBlockEvent(ruleText: string, ruleStartTag: string, ruleEndTag: string): string {
  const raw = normalizeTextEvent(ruleText).trim();
  if (!raw) return "";
  if (raw.includes(ruleStartTag) && raw.includes(ruleEndTag)) {
    return normalizeBlockTextEvent(raw);
  }
  return normalizeBlockTextEvent(`${ruleStartTag}\n${raw}\n${ruleEndTag}`);
}

export function buildDynamicSystemRuleTextEvent(settings: DicePluginSettingsEvent): string {
  const checkDiceParts: string[] = ["NdM"];
  if (settings.enableExplodingDice) checkDiceParts.push("[!]");
  if (settings.enableAdvantageSystem) checkDiceParts.push("[khX|klX]");
  checkDiceParts.push("[+/-B]");
  const checkDicePattern = checkDiceParts.join("");
  const enabledDiceTypes = formatEnabledDiceTypesTextEvent(settings.aiAllowedDiceSidesText);

  const lines: string[] = [];
  lines.push("【事件骰子协议（系统动态）】");
  lines.push("1. 仅在文末输出 ```rolljson 代码块（严禁 ```json）。");
  lines.push("   - 若本轮存在必须立刻反馈的关键情报线索，可在 rolljson 后额外追加 1 个 ```triggerpack 代码块；没有这类线索就不要输出。");
  lines.push("2. 叙事正文禁止直接给出判定结果，先给事件，再由系统结算并推进剧情。");
  lines.push("3. rolljson 基本格式：");
  lines.push("{");
  lines.push('  "type": "dice_events", "version": "1",');
  lines.push('  "events": [{');
  lines.push('    "id": "str", "title": "str", "difficulty": "easy|normal|hard|extreme", "desc": "str",');
  lines.push(`    "checkDice": "${checkDicePattern}",`);
  lines.push('    "skill": "str",');
  lines.push('    "compare": ">=|>|<=|<",');
  lines.push('    "scope": "protagonist|character|all",');
  lines.push('    "target": { "type": "self|scene|supporting|object|other", "name": "str(可选)" }');
  if (settings.enableAiRollMode) {
    lines.push('    ,"rollMode": "auto|manual"');
  }
  if (settings.enableAdvantageSystem) {
    lines.push('    ,"advantageState": "normal|advantage|disadvantage"');
  }
  if (settings.enableDynamicDcReason) {
    lines.push('    ,"dc_reason": "str"');
  }
  if (settings.enableTimeLimit) {
    lines.push('    ,"timeLimit": "PT30S"');
  }
  if (settings.enableOutcomeBranches) {
    if (settings.enableExplodingDice && settings.enableExplodeOutcomeBranch) {
      lines.push('    ,"outcomes": { "success": "str", "failure": "str", "explode": "str(爆骰优先)" }');
    } else {
      lines.push('    ,"outcomes": { "success": "str", "failure": "str" }');
    }
  }
  lines.push("  }]");
  if (settings.enableAiRoundControl) {
    lines.push('  ,"round_control": "continue|end_round",');
    lines.push('  "end_round": bool');
  }
  lines.push("}");
  lines.push("3.1 triggerpack 仅用于少量关键情报 trigger 的即时反馈：");
  lines.push("{");
  lines.push('  "type": "trigger_pack", "version": "1",');
  lines.push('  "defaults": { "dice": "1d20", "compare": ">=" },');
  lines.push('  "items": [{ "sid": "str", "skill": "str", "difficulty": "easy|normal|hard|extreme", "reveal": "instant|delayed", "success": "str", "failure": "str", "explode": "str(可选)" }]');
  lines.push("}");

  lines.push("4. 可用能力说明：");
  lines.push(`   - checkDice 仅使用 ${checkDicePattern}，只能写骰式本体，禁止加入技能名、状态名、自然语言、标签或变量,仅允许一个可选修正值，禁止连续修正（如 1d20+1-1）。`);
  lines.push(`   - 当前已启用的可选骰式：${enabledDiceTypes}。只能从这些骰式中选择使用。`);
  lines.push("   - 默认只提供 difficulty，不要手写 dc；系统会根据骰式、优劣骰与比较符自动换算实际阈值。");
  lines.push("   - difficulty 仅允许 easy / normal / hard / extreme。");
  lines.push("   - compare 默认使用 >=；只有在叙事上确有必要时才改成 > / <= / <。");
  lines.push("   - 合法示例：1d20、2d20kh1、2d20kl1；若已启用对应骰式，也可使用 2d6+3、1d100。");
  lines.push("   - 非法示例：1d20+1-1、1d20+体能、1d20+[虚弱]、1d20 (优势)。");
  lines.push("   - 若需施加或移除状态，请仅在 outcomes 文本中使用状态标签。");
  if (settings.enableExplodingDice && settings.enableOutcomeBranches && settings.enableExplodeOutcomeBranch) {
    lines.push("   - 只有 checkDice 明确包含 ! 时，才允许提供 outcomes.explode；如果 checkDice 不含 !，必须完全省略 explode 字段。");
    lines.push('   - 正例：{"checkDice":"1d20!","outcomes":{"success":"...","failure":"...","explode":"..."}}');
    lines.push('   - 反例：{"checkDice":"1d20","outcomes":{"success":"...","failure":"...","explode":"..."}}');
  }
  if (settings.enableAiRollMode) {
    lines.push("   - 可使用 rollMode=auto|manual 指定是否自动掷骰。");
  }
  if (settings.enableAiRoundControl) {
    lines.push("   - 可使用 round_control 或 end_round 控制轮次是否结束。");
  }
  if (settings.enableExplodingDice) {
    lines.push("   - 已启用爆骰：! 会在掷出最大面后连爆，结果会影响剧情走向。(骰式示例：1d6!+2)");
    lines.push("   - 爆骰是否触发由系统根据真实掷骰结果决定，不可直接声明“必爆”。");
    lines.push("   - 只有在你确实需要一条独立的爆骰后果分支时，才给该事件的 checkDice 加 !；没有 ! 就绝不能写 outcomes.explode。");
    if (settings.enableAiRollMode) {
      lines.push("   - AI 自动检定时，同一轮最多仅 1 个事件使用 !，其余会按普通骰结算。");
      lines.push("   - 因此，请把 ! 和 outcomes.explode 留给本轮最关键、最值得出现爆骰分支的那个事件。");
    }
  }
  if (settings.enableAdvantageSystem) {
    lines.push("   - 已启用优势/劣势：可用 advantageState 或 kh/kl，会改变结果并影响剧情走向。");
    lines.push("   - 重点：优势/劣势是取高或取低，不是把两次结果相加。");
    lines.push("   - 若使用 2d20kh1 或 2d20kl1，最终只保留 1 颗 d20；未加修正时总值范围仍是 1~20，不是 2~40。");
    lines.push("   - 生成事件前必须检查判定条件是否可达，避免写出理论上必败或必成的事件。");
    lines.push("   - 例如：2d20kl1+1 不能搭配 >=30；2d20kh1+0 也不应搭配 >20。");
  }
  if (settings.enableExplodingDice && settings.enableAdvantageSystem) {
    lines.push("   - ! 与 kh/kl 不能同用。");
  }
  if (settings.enableDynamicDcReason) {
    lines.push("   - 可填写 dc_reason 解释难度依据；系统会在展示时追加“按难度自动换算阈值”的说明。");
  }
  if (settings.enableTimeLimit) {
    lines.push("   - 可填写 timeLimit，且必须满足系统最小时限。");
  }
  if (settings.enableOutcomeBranches) {
    lines.push("   - outcomes 走向文本会直接影响后续剧情叙事。");
    lines.push("   - 只要该事件属于暗骰语境，就必须提供结构化 outcomes，至少写出 success 与 failure 两个分支，不能只靠后续正文临场发挥。");
    lines.push("   - 暗骰的大成功如果需要独立后果，优先使用 outcomes.explode 承载；没有 explode 字段时，系统只会回退到 success。");
    lines.push("   - 当前结构没有单独的“大失败”字段；如果你希望大失败与普通失败明显不同，请把更重的失败后果写进 failure。");
    lines.push("   - 暗骰的结构化 outcomes 才是系统选择走向的主来源；后续 blind guidance 只负责把已选中的后果自然融入叙事，不能替代 outcomes 本身。");
    lines.push("   - 严禁在 outcomes.success / failure / explode、desc、dc_reason、note 或任何 rolljson 字段中写入 <rh-trigger>。");
    lines.push("   - rh-trigger 只能写在最终回复的剧情正文里，而且必须落在真正关键、值得继续调查或点击的短词上。");
    lines.push("   - 正例：正文写“你注意到书架边缘有一道<rh-trigger action=\"调查\" skill=\"调查\">异常的刮痕</rh-trigger>。”");
    lines.push("   - 反例：在 outcomes.success、事件 desc 或其他 rolljson 字段里塞入 <rh-trigger>。");
    if (settings.enableExplodingDice && settings.enableExplodeOutcomeBranch) {
      lines.push("   - 爆骰触发时优先使用 outcomes.explode。");
      lines.push("   - 如果你设想了“只有爆骰才发生”的特殊后果，就必须同时在 checkDice 中写 !；否则请把该后果合并到 success 或 failure。");
    }
  }
  if (settings.enableStatusSystem && settings.enableOutcomeBranches) {
    lines.push("5. 可在 outcomes 中使用状态标签：");
    lines.push("   - [APPLY_STATUS:名,整数值,turns=2,skills=A|B 或 scope=all]");
    lines.push("   - turns 默认 1；支持 duration= 作为 turns 别名；turns=perm 表示永久");
    lines.push("   - [REMOVE_STATUS:名]");
    lines.push("   - [CLEAR_STATUS]");
    lines.push("   - 负面状态必须使用负数；正面状态（加值）必须使用正数。");
    lines.push("   - 状态数值绝对值需与当前骰子面数匹配，避免失衡，还需要注意状态请勿轻易附加，避免破坏平衡！");
  }

  if (settings.enableInteractiveTriggers) {
    const blindSkillText = String(settings.defaultBlindSkillsText ?? "")
      .split(/[\n,|]+/)
      .map((item) => normalizeInlineTextEvent(item))
      .filter(Boolean)
      .join("、") || "洞察、潜行、搜查、历史、调查";
    lines.push("6. 正文中的可交互线索请使用交互标记：");
    lines.push('   - 语法：<rh-trigger action="调查" skill="调查" difficulty="normal" blind="1" sourceId="bookshelf_scratches">异常的刮痕</rh-trigger>');
    lines.push("   - 只标剧情正文中的关键线索短词或短语，不要放在 rolljson、outcomes、desc、dc_reason、状态标签、规则块或摘要块里。");
    lines.push("   - 不要把 rh-trigger 写成骰子走向的一部分；走向只负责叙事结果，交互标记只负责正文中的下一步调查入口。");
    lines.push("   - triggerpack 只能通过 rh-trigger 的 sourceId / sid 关联，绝不能把 success / failure 文本塞进 rh-trigger 属性里。");
    lines.push("   - 如果本次暗骰后果、被动发现或剧情推进里出现了新的可继续调查线索，就必须在最终剧情正文对应的关键短词上补一个 rh-trigger，不能只写线索却不给点击入口。");
    lines.push("   - 只有当该线索明确不适合继续互动、不可进一步检定，或只是纯氛围描写时，才允许不写 rh-trigger。");
    lines.push("   - 只标真正值得玩家发起检定的短词或短语，不要整句乱标，也不要全篇大量发光。");
    lines.push("   - 每次回复最多给出 3 个交互标记，且必须和当前叙事上下文直接相关。");
    lines.push("   - 每次回复最多只给 1~2 个 trigger 配 triggerpack，而且优先用于异响、痕迹、气味、可疑停顿、异常刮痕等必须立刻影响决策的关键情报。");
    lines.push("   - 普通 trigger 不要硬配 triggerpack；只写正文入口即可。");
    lines.push("   - triggerpack 的 success / failure / explode 都必须是短句，尽量控制在 25~45 字内。");
    lines.push("   - 情报型检定优先使用 reveal=\"instant\"；潜行、欺骗、伏击、藏匿、是否暴露等状态型检定优先使用 reveal=\"delayed\"。");
    lines.push("   - difficulty 仅允许 easy / normal / hard / extreme，由系统自动换算阈值；不要手写成功点数。");
    lines.push(`   - 下列技能通常应默认暗骰：${blindSkillText}。适用时请写 blind="1"。`);
    lines.push("   - 如果你在正文里给某个 rh-trigger 标成暗骰，请确保对应的剧情后果已经在结构化 outcomes 中写全，不要把暗骰成功/失败走向塞进 trigger 文案。");
    lines.push("   - 对于提示、痕迹、异响、异常气味、可疑人物反应、隐藏机关、错误线索等可追查对象，优先把最关键的那个短词标成 rh-trigger。");
    lines.push("   - 被动检定自动发现的信息，如果值得继续追查，也可以继续标成可点击词。");
  }

  if (settings.enableNarrativeCostEnforcement) {
    lines.push("7. 叙事结果约束：");
    lines.push("   - 成功可以推进，但不要无缘无故追加重罚。");
    lines.push("   - 失败必须附带明确叙事代价，至少体现时间损失、误判、暴露、资源消耗或引发下一风险之一。");
    lines.push("   - 大失败必须带来显著误判、危险后果或滑稽失手，但不要把剧情直接写死。");
    lines.push("   - 搜查、调查、洞察、历史等信息类失败，允许给出错误线索、漏掉关键点或自信的误判。");
  }

  lines.push("8. **必须遵守 <dice_runtime_policy> 的运行时限制。**");
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function buildFinalRuleTextEvent(settings: DicePluginSettingsEvent): string {
  const systemRuleText = buildDynamicSystemRuleTextEvent(settings);
  const customRuleText = normalizeTextEvent(settings.ruleText || "").trim();
  if (!customRuleText) return systemRuleText;
  return normalizeBlockTextEvent(`${systemRuleText}\n\n【用户自定义补充】\n${customRuleText}`);
}
/**
 * 功能：解析并规范化已启用的 AI 骰式列表。
 * @param raw 原始配置文本。
 * @returns 规范化后的骰面数组；为空时回退到默认 d20。
 */
function parseEnabledDiceSidesEvent(raw: string): number[] {
  const parts = String(raw || "")
    .split(/[,\s]+/)
    .map((item) => Number(String(item || "").trim()))
    .filter((value) => Number.isFinite(value) && Number.isInteger(value) && AI_SUPPORTED_DICE_SIDES_Event.includes(value as any));
  const normalized = Array.from(new Set(parts)).sort((left, right) => left - right);
  return normalized.length > 0 ? normalized : [20];
}

/**
 * 功能：把已启用骰式格式化为可读中文文本。
 * @param raw 原始配置文本。
 * @returns 形如 d20、d6、d100 的中文列表。
 */
function formatEnabledDiceTypesTextEvent(raw: string): string {
  return parseEnabledDiceSidesEvent(raw)
    .map((sides) => `d${sides}`)
    .join("、");
}

function parseSkillTablePreviewEvent(skillTableText: string, limit = 20): { count: number; preview: string } {
  try {
    const parsed = JSON.parse(String(skillTableText || "{}"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { count: 0, preview: "empty" };
    }
    const entries = Object.entries(parsed as Record<string, any>)
      .filter(([name, value]) => String(name || "").trim().length > 0 && Number.isFinite(Number(value)))
      .map(([name, value]) => [String(name).trim(), Number(value)] as [string, number]);
    if (entries.length <= 0) {
      return { count: 0, preview: "empty" };
    }
    const preview = entries
      .slice(0, Math.max(1, limit))
      .map(([name, value]) => `${normalizeInlineTextEvent(name)}:${value}`)
      .join(",");
    return { count: entries.length, preview: preview || "empty" };
  } catch {
    return { count: 0, preview: "invalid_json" };
  }
}

function buildDiceRuntimePolicyBlockEvent(
  settings: DicePluginSettingsEvent,
  startTag: string,
  endTag: string
): string {
  const enabledDice = parseEnabledDiceSidesEvent(settings.aiAllowedDiceSidesText)
    .map((sides) => `d${sides}`)
    .join(",");
  const skillPreview = parseSkillTablePreviewEvent(settings.skillTableText);
  const lines: string[] = [];
  lines.push(startTag);
  lines.push("v=1");
  lines.push(`apply_scope=${settings.eventApplyScope}`);
  lines.push(`round_mode=${settings.enableAiRoundControl ? "continuous" : "per_round"}`);
  lines.push(`roll_mode_allowed=${settings.enableAiRollMode ? "auto|manual" : "manual_only"}`);
  lines.push(`ai_round_control_enabled=${settings.enableAiRoundControl ? 1 : 0}`);
  lines.push(
    `round_control_allowed=${settings.enableAiRoundControl ? "continue|end_round" : "disabled"}`
  );
  lines.push(`explode_enabled=${settings.enableExplodingDice ? 1 : 0}`);
  lines.push(`ai_auto_explode_event_limit_per_round=${settings.enableAiRollMode ? 1 : 0}`);
  lines.push(`advantage_enabled=${settings.enableAdvantageSystem ? 1 : 0}`);
  lines.push(`dynamic_dc_reason_enabled=${settings.enableDynamicDcReason ? 1 : 0}`);
  lines.push(`status_system_enabled=${settings.enableStatusSystem ? 1 : 0}`);
  lines.push(`status_tags_allowed=${settings.enableStatusSystem ? 1 : 0}`);
  lines.push(`status_sign_rule=${settings.enableStatusSystem ? "debuff_negative,buff_positive" : "disabled"}`);
  lines.push(`outcome_branches_enabled=${settings.enableOutcomeBranches ? 1 : 0}`);
  lines.push(`explode_outcome_enabled=${settings.enableExplodeOutcomeBranch ? 1 : 0}`);
  lines.push(`time_limit_enabled=${settings.enableTimeLimit ? 1 : 0}`);
  lines.push(`min_time_limit_seconds=${Math.max(1, Math.floor(Number(settings.minTimeLimitSeconds) || 1))}`);
  lines.push(`enabled_dice=${enabledDice}`);
  lines.push(`skill_system_enabled=${settings.enableSkillSystem ? 1 : 0}`);
  lines.push(`skill_table_count=${skillPreview.count}`);
  lines.push(`skill_table_preview=${skillPreview.preview}`);
  lines.push(`summary_detail=${settings.summaryDetailMode}`);
  lines.push(`summary_rounds=${settings.summaryHistoryRounds}`);
  lines.push(`summary_include_outcome=${settings.includeOutcomeInSummary ? 1 : 0}`);
  lines.push(`list_outcome_preview=${settings.showOutcomePreviewInListCard ? 1 : 0}`);
  lines.push(endTag);
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function composePromptInjectionsEvent(baseText: string, injections: string[]): string {
  const head = normalizeBlockTextEvent(baseText);
  const blocks = injections.map((item) => normalizeBlockTextEvent(item)).filter((item) => item.length > 0);
  if (!blocks.length) return head;
  if (!head) return blocks.join("\n\n");
  return `${head}\n\n${blocks.join("\n\n")}`;
}

export function applyManagedSystemContentEvent(
  message: TavernMessageEvent,
  composedText: string,
  tags?: Partial<{
    ruleStart: string;
    ruleEnd: string;
    runtimePolicyStart: string;
    runtimePolicyEnd: string;
    summaryStart: string;
    summaryEnd: string;
    guidanceStart: string;
    guidanceEnd: string;
    statusesStart: string;
    statusesEnd: string;
  }>
): void {
  const currentText = getMessageTextEvent(message);
  const stripped = stripManagedBlocksEvent(currentText, tags);
  const nextText = composePromptInjectionsEvent(stripped, [composedText]);
  setMessageTextEvent(message, nextText);
}

function resolvePromptGuidanceInjectionEvent(
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent,
  userMsgId: string,
  isSameUserPrompt: boolean,
  guidanceStartTag: string,
  guidanceEndTag: string
): { text: string; changedMeta: boolean } {
  if (!settings.enableDynamicResultGuidance) {
    if (meta.outboundResultGuidance) {
      delete meta.outboundResultGuidance;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta: false };
  }

  if (
    isSameUserPrompt &&
    meta.outboundResultGuidance &&
    meta.outboundResultGuidance.userMsgId === userMsgId
  ) {
    return {
      text: normalizeBlockTextEvent(meta.outboundResultGuidance.guidanceText),
      changedMeta: false,
    };
  }

  const queue = Array.isArray(meta.pendingResultGuidanceQueue)
    ? meta.pendingResultGuidanceQueue
    : [];
  if (queue.length <= 0) {
    if (meta.outboundResultGuidance) {
      delete meta.outboundResultGuidance;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta: false };
  }

  const consumed = queue.splice(0, queue.length);
  const guidanceText = buildResultGuidanceTextEvent(consumed, settings, guidanceStartTag, guidanceEndTag);
  const lastRollId = consumed[consumed.length - 1]?.rollId || consumed[0]?.rollId || "";
  meta.outboundResultGuidance = {
    userMsgId,
    rollId: lastRollId,
    guidanceText,
  };
  return { text: guidanceText, changedMeta: true };
}

function resolvePromptBlindGuidanceInjectionEvent(
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent,
  userMsgId: string,
  isSameUserPrompt: boolean,
  blindStartTag: string,
  blindEndTag: string
): { text: string; changedMeta: boolean } {
  if (
    isSameUserPrompt &&
    meta.outboundBlindGuidance &&
    meta.outboundBlindGuidance.userMsgId === userMsgId
  ) {
    return {
      text: normalizeBlockTextEvent(meta.outboundBlindGuidance.guidanceText),
      changedMeta: false,
    };
  }
  const pruned = pruneExpiredBlindGuidanceQueueEvent(
    meta,
    Date.now(),
    Boolean(settings.blindHistoryAutoArchiveEnabled),
    Number(settings.blindHistoryAutoArchiveAfterHours ?? 24)
  );
  const normalizedQueue = Array.isArray(meta.pendingBlindGuidanceQueue) ? meta.pendingBlindGuidanceQueue : [];
  if (normalizedQueue.length <= 0) {
    if (meta.outboundBlindGuidance) {
      delete meta.outboundBlindGuidance;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta: pruned };
  }

  const currentRound = meta.pendingRound;
  const currentFloorKeys = new Set<string>();
  if (currentRound) {
    for (const assistantMsgId of currentRound.sourceAssistantMsgIds || []) {
      const floorKey = buildAssistantFloorKeyEvent(assistantMsgId);
      if (floorKey) currentFloorKeys.add(floorKey);
    }
    for (const event of currentRound.events || []) {
      const floorKey = buildAssistantFloorKeyEvent(String(event?.sourceAssistantMsgId ?? ""));
      if (floorKey) currentFloorKeys.add(floorKey);
    }
    for (const record of currentRound.rolls || []) {
      const floorKey = buildAssistantFloorKeyEvent(String(record?.sourceAssistantMsgId ?? ""));
      if (floorKey) currentFloorKeys.add(floorKey);
    }
  }

  const nextQueue: BlindGuidanceEvent[] = [];
  const consumed: BlindGuidanceEvent[] = [];
  const now = Date.now();
  const injectionLimit = Math.max(1, Number(settings.maxBlindGuidanceInjectedPerPrompt) || 1);
  for (const item of normalizedQueue) {
    if (!item || item.consumed || item.state && item.state !== "queued") {
      nextQueue.push(item);
      continue;
    }
    if (item.expiresAt != null && now > item.expiresAt) {
      const expiredItem = {
        ...item,
        state: "expired" as const,
      };
      nextQueue.push(expiredItem);
      updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
        state: "expired",
      });
      continue;
    }
    if (item.roundId) {
      if (!currentRound || currentRound.status !== "open" || currentRound.roundId !== item.roundId) {
        const invalidatedItem = {
          ...item,
          state: "invalidated" as const,
          invalidatedAt: item.invalidatedAt ?? now,
        };
        nextQueue.push(invalidatedItem);
        updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
          state: "invalidated",
          invalidatedAt: item.invalidatedAt ?? now,
        });
        continue;
      }
    }
    if (item.sourceFloorKey) {
      if (!currentRound || currentFloorKeys.size <= 0 || !currentFloorKeys.has(item.sourceFloorKey)) {
        const invalidatedItem = {
          ...item,
          state: "invalidated" as const,
          invalidatedAt: item.invalidatedAt ?? now,
        };
        nextQueue.push(invalidatedItem);
        updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
          state: "invalidated",
          invalidatedAt: item.invalidatedAt ?? now,
        });
        continue;
      }
    }
    if (consumed.length >= injectionLimit) {
      nextQueue.push(item);
      continue;
    }
    const consumedItem = {
      ...item,
      consumed: true,
      consumedAt: now,
      state: "consumed" as const,
    };
    consumed.push(consumedItem);
    nextQueue.push(consumedItem);
    updateBlindHistoryStateByRollIdEvent(meta, item.rollId, {
      consumedAt: now,
      state: "consumed",
    });
  }

  const changedMeta =
    consumed.length > 0
    || normalizedQueue.length !== nextQueue.length
    || pruned
    || Boolean(meta.outboundBlindGuidance);

  meta.pendingBlindGuidanceQueue = nextQueue;
  if (consumed.length <= 0) {
    if (meta.outboundBlindGuidance) {
      delete meta.outboundBlindGuidance;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta };
  }

  const guidanceText = buildBlindGuidanceBlockEvent(consumed, blindStartTag, blindEndTag);
  meta.outboundBlindGuidance = {
    userMsgId,
    rollId: consumed[consumed.length - 1]?.rollId || "",
    guidanceText,
    roundId: consumed[consumed.length - 1]?.roundId,
  };
  return { text: guidanceText, changedMeta: true };
}

function resolvePromptPassiveDiscoveryInjectionEvent(
  meta: DiceMetaEvent,
  settings: DicePluginSettingsEvent,
  userMsgText: string,
  passiveStartTag: string,
  passiveEndTag: string,
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number
): { text: string; changedMeta: boolean } {
  if (!settings.enablePassiveCheck || settings.worldbookPassiveMode === "disabled") {
    if (meta.outboundPassiveDiscovery) {
      delete meta.outboundPassiveDiscovery;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta: false };
  }
  if (!meta.passiveDiscoveriesCache || typeof meta.passiveDiscoveriesCache !== "object") {
    meta.passiveDiscoveriesCache = {};
  }
  const resolved = resolvePassiveDiscoveriesEvent(
    settings,
    userMsgText,
    meta.passiveDiscoveriesCache,
    resolveSkillModifierBySkillNameEvent
  );
  meta.lastPassiveContextHash = resolved.contextHash;
  if (resolved.discoveries.length <= 0) {
    if (meta.outboundPassiveDiscovery) {
      delete meta.outboundPassiveDiscovery;
      return { text: "", changedMeta: true };
    }
    return { text: "", changedMeta: true };
  }
  for (const item of resolved.discoveries) {
    meta.passiveDiscoveriesCache[item.discoveryId] = item;
  }
  const discoveryText = buildPassiveDiscoveryBlockEvent(resolved.discoveries, passiveStartTag, passiveEndTag);
  meta.outboundPassiveDiscovery = {
    userMsgId: meta.lastPromptUserMsgId || "",
    discoveryIds: resolved.discoveries.map((item) => item.discoveryId),
    discoveryText,
  };
  return { text: discoveryText, changedMeta: true };
}

function upsertRoundSnapshotToHistoryEvent(
  history: RoundSummarySnapshotEvent[],
  snapshot: RoundSummarySnapshotEvent
): boolean {
  const idx = history.findIndex((item) => item.roundId === snapshot.roundId);
  if (idx >= 0) {
    history[idx] = snapshot;
    return true;
  }
  history.push(snapshot);
  return true;
}

type PromptChatTargetEvent = SdkTavernPromptTargetEvent<TavernMessageEvent>;

/**
 * 功能：列出当前 payload 中所有可写的消息数组，并按引用去重。
 * @param payload Prompt Ready 事件的 payload
 * @returns 可写消息数组列表
 */
function listPromptChatTargetsEvent(payload: any): PromptChatTargetEvent[] {
  return listSdkTavernPromptTargetsEvent(payload) as PromptChatTargetEvent[];
}

export function extractPromptChatFromPayloadEvent(payload: any): TavernMessageEvent[] | null {
  return extractSdkTavernPromptMessagesEvent(payload) as TavernMessageEvent[] | null;
}

export interface HandlePromptReadyDepsEvent {
  getSettingsEvent: () => DicePluginSettingsEvent;
  DICE_RULE_BLOCK_START_Event: string;
  DICE_RULE_BLOCK_END_Event: string;
  DICE_RUNTIME_POLICY_BLOCK_START_Event?: string;
  DICE_RUNTIME_POLICY_BLOCK_END_Event?: string;
  DICE_BLIND_SUMMARY_BLOCK_START_Event?: string;
  DICE_BLIND_SUMMARY_BLOCK_END_Event?: string;
  DICE_SUMMARY_BLOCK_START_Event: string;
  DICE_SUMMARY_BLOCK_END_Event: string;
  DICE_RESULT_GUIDANCE_BLOCK_START_Event?: string;
  DICE_RESULT_GUIDANCE_BLOCK_END_Event?: string;
  DICE_BLIND_GUIDANCE_BLOCK_START_Event?: string;
  DICE_BLIND_GUIDANCE_BLOCK_END_Event?: string;
  DICE_ACTIVE_STATUSES_BLOCK_START_Event?: string;
  DICE_ACTIVE_STATUSES_BLOCK_END_Event?: string;
  DICE_PASSIVE_DISCOVERY_BLOCK_START_Event?: string;
  DICE_PASSIVE_DISCOVERY_BLOCK_END_Event?: string;
  sweepTimeoutFailuresEvent: () => boolean;
  getDiceMetaEvent: () => DiceMetaEvent;
  resolveSkillModifierBySkillNameEvent: (skillName: string, settings?: DicePluginSettingsEvent) => number;
  ensureSummaryHistoryEvent: (meta: DiceMetaEvent) => RoundSummarySnapshotEvent[];
  createRoundSummarySnapshotEvent: (round: any, now?: number) => RoundSummarySnapshotEvent;
  trimSummaryHistoryEvent: (history: RoundSummarySnapshotEvent[]) => void;
  buildSummaryBlockFromHistoryEvent: (
    history: RoundSummarySnapshotEvent[],
    detailMode: DicePluginSettingsEvent["summaryDetailMode"],
    lastNRounds: number,
    includeOutcomeInSummary: boolean,
    settings: DicePluginSettingsEvent
  ) => BuiltSummaryBlocksEvent;
  saveMetadataSafeEvent: () => void;
}

export function handlePromptReadyEvent(
  payload: any,
  deps: HandlePromptReadyDepsEvent,
  sourceEvent = "unknown"
): void {
  const settings = deps.getSettingsEvent();
  if (!settings.enabled) return;

  deps.sweepTimeoutFailuresEvent();

  const chatTargets = listPromptChatTargetsEvent(payload);
  if (chatTargets.length <= 0) return;
  const primaryTarget =
    chatTargets.find((target) => findLastUserIndexEvent(target.messages) >= 0) || null;
  if (!primaryTarget || primaryTarget.messages.length <= 0) return;
  const userIndex = findLastUserIndexEvent(primaryTarget.messages);
  if (userIndex < 0) return;
  const userMsg = primaryTarget.messages[userIndex];
  if (!userMsg) return;

  const ruleStartTag = deps.DICE_RULE_BLOCK_START_Event || DEFAULT_RULE_BLOCK_START_Event;
  const ruleEndTag = deps.DICE_RULE_BLOCK_END_Event || DEFAULT_RULE_BLOCK_END_Event;
  const runtimePolicyStartTag =
    deps.DICE_RUNTIME_POLICY_BLOCK_START_Event || DEFAULT_RUNTIME_POLICY_BLOCK_START_Event;
  const runtimePolicyEndTag =
    deps.DICE_RUNTIME_POLICY_BLOCK_END_Event || DEFAULT_RUNTIME_POLICY_BLOCK_END_Event;
  const blindSummaryStartTag =
    deps.DICE_BLIND_SUMMARY_BLOCK_START_Event || DEFAULT_BLIND_SUMMARY_BLOCK_START_Event;
  const blindSummaryEndTag =
    deps.DICE_BLIND_SUMMARY_BLOCK_END_Event || DEFAULT_BLIND_SUMMARY_BLOCK_END_Event;
  const summaryStartTag = deps.DICE_SUMMARY_BLOCK_START_Event || DEFAULT_SUMMARY_BLOCK_START_Event;
  const summaryEndTag = deps.DICE_SUMMARY_BLOCK_END_Event || DEFAULT_SUMMARY_BLOCK_END_Event;
  const guidanceStartTag =
    deps.DICE_RESULT_GUIDANCE_BLOCK_START_Event || DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event;
  const guidanceEndTag =
    deps.DICE_RESULT_GUIDANCE_BLOCK_END_Event || DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event;
  const blindStartTag =
    deps.DICE_BLIND_GUIDANCE_BLOCK_START_Event || DEFAULT_BLIND_GUIDANCE_BLOCK_START_Event;
  const blindEndTag =
    deps.DICE_BLIND_GUIDANCE_BLOCK_END_Event || DEFAULT_BLIND_GUIDANCE_BLOCK_END_Event;
  const statusesStartTag =
    deps.DICE_ACTIVE_STATUSES_BLOCK_START_Event || DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event;
  const statusesEndTag =
    deps.DICE_ACTIVE_STATUSES_BLOCK_END_Event || DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event;
  const passiveStartTag =
    deps.DICE_PASSIVE_DISCOVERY_BLOCK_START_Event || DEFAULT_PASSIVE_DISCOVERY_BLOCK_START_Event;
  const passiveEndTag =
    deps.DICE_PASSIVE_DISCOVERY_BLOCK_END_Event || DEFAULT_PASSIVE_DISCOVERY_BLOCK_END_Event;
  const managedTags = {
    ruleStart: ruleStartTag,
    ruleEnd: ruleEndTag,
    runtimePolicyStart: runtimePolicyStartTag,
    runtimePolicyEnd: runtimePolicyEndTag,
    blindSummaryStart: blindSummaryStartTag,
    blindSummaryEnd: blindSummaryEndTag,
    summaryStart: summaryStartTag,
    summaryEnd: summaryEndTag,
    guidanceStart: guidanceStartTag,
    guidanceEnd: guidanceEndTag,
    blindStart: blindStartTag,
    blindEnd: blindEndTag,
    statusesStart: statusesStartTag,
    statusesEnd: statusesEndTag,
    passiveStart: passiveStartTag,
    passiveEnd: passiveEndTag,
  };

  const userStableText = stripManagedBlocksEvent(getMessageTextEvent(userMsg), managedTags);
  const userMsgId = buildPromptMessageIdByTextEvent(userStableText, userMsg, userIndex);
  const userCurrentText = getMessageTextEvent(userMsg);
  if (userCurrentText !== userStableText) {
    setMessageTextEvent(userMsg, userStableText);
  }

  const meta = deps.getDiceMetaEvent();
  const isSameUserPrompt = meta.lastPromptUserMsgId === userMsgId;
  let changedMeta = false;

  if (!isSameUserPrompt) {
    meta.lastPromptUserMsgId = userMsgId;
    changedMeta = true;
  }

  if (!isSameUserPrompt && meta.pendingRound && Array.isArray(meta.pendingRound.events) && meta.pendingRound.events.length > 0) {
    const history = deps.ensureSummaryHistoryEvent(meta);
    const snapshot = deps.createRoundSummarySnapshotEvent(meta.pendingRound, Date.now());
    if (upsertRoundSnapshotToHistoryEvent(history, snapshot)) {
      deps.trimSummaryHistoryEvent(history);
      changedMeta = true;

      // 记录到 chat_plugin_records 以便后续查询
      const chatKey = buildSdkChatKeyEvent();
      if (chatKey) {
        void appendSdkPluginChatRecord('stx_rollhelper', chatKey, 'round_summaries', {
          recordId: snapshot.roundId,
          payload: snapshot as unknown as Record<string, unknown>,
        });
      }
    }
  }

  if (!isSameUserPrompt && !settings.enableAiRoundControl && meta.pendingRound?.status === "open") {
    meta.pendingRound.status = "closed";
    changedMeta = true;
    logger.info("已按“每轮模式”在用户发言后结束当前轮次");
  }

  let ruleBlockText = "";
  let runtimePolicyBlockText = "";
  if (settings.autoSendRuleToAI) {
    const finalRuleText = buildFinalRuleTextEvent(settings);
    ruleBlockText = buildDiceRuleBlockEvent(finalRuleText, ruleStartTag, ruleEndTag);
    runtimePolicyBlockText = buildDiceRuntimePolicyBlockEvent(
      settings,
      runtimePolicyStartTag,
      runtimePolicyEndTag
    );
  }

  let summaryBlockText = "";
  let blindSummaryBlockText = "";
  if (isSameUserPrompt && meta.outboundSummary && meta.outboundSummary.userMsgId === userMsgId) {
    const legacySummaryText = normalizeBlockTextEvent(
      String((meta.outboundSummary as unknown as { summaryText?: unknown }).summaryText ?? "")
    );
    summaryBlockText = normalizeBlockTextEvent(meta.outboundSummary.publicSummaryText || legacySummaryText);
    blindSummaryBlockText = normalizeBlockTextEvent(meta.outboundSummary.blindSummaryText);
  } else {
    const history = deps.ensureSummaryHistoryEvent(meta);
    const built = deps.buildSummaryBlockFromHistoryEvent(
      history,
      settings.summaryDetailMode,
      settings.summaryHistoryRounds,
      settings.includeOutcomeInSummary,
      settings
    );
    summaryBlockText = normalizeBlockTextEvent(built.publicSummaryText);
    blindSummaryBlockText = normalizeBlockTextEvent(built.blindSummaryText);
    if (summaryBlockText || blindSummaryBlockText) {
      meta.outboundSummary = {
        userMsgId,
        roundId: meta.pendingRound?.roundId || "",
        publicSummaryText: summaryBlockText,
        blindSummaryText: blindSummaryBlockText,
      };
    } else if (meta.outboundSummary) {
      delete meta.outboundSummary;
    }
    changedMeta = true;
  }

  const guidanceResolved = resolvePromptGuidanceInjectionEvent(
    meta,
    settings,
    userMsgId,
    isSameUserPrompt,
    guidanceStartTag,
    guidanceEndTag
  );
  const guidanceBlockText = normalizeBlockTextEvent(guidanceResolved.text);
  if (guidanceResolved.changedMeta) {
    changedMeta = true;
  }
  const blindResolved = resolvePromptBlindGuidanceInjectionEvent(
    meta,
    settings,
    userMsgId,
    isSameUserPrompt,
    blindStartTag,
    blindEndTag
  );
  const blindGuidanceBlockText = normalizeBlockTextEvent(blindResolved.text);
  if (blindResolved.changedMeta) {
    changedMeta = true;
  }

  const passiveResolved = resolvePromptPassiveDiscoveryInjectionEvent(
    meta,
    settings,
    userStableText,
    passiveStartTag,
    passiveEndTag,
    deps.resolveSkillModifierBySkillNameEvent
  );
  const passiveDiscoveryBlockText = normalizeBlockTextEvent(passiveResolved.text);
  if (passiveResolved.changedMeta) {
    changedMeta = true;
  }

  const statusBlockText = settings.enableStatusSystem
    ? buildActiveStatusesBlockEvent(ensureActiveStatusesFromMetaEvent(meta), statusesStartTag, statusesEndTag)
    : "";
  const targetSyncLogs: string[] = [];

  for (const target of chatTargets) {
    const targetUserIndex = findLastUserIndexEvent(target.messages);
    if (targetUserIndex < 0) {
      targetSyncLogs.push(`${target.path}:skip_no_user`);
      continue;
    }

    const targetUserMsg = target.messages[targetUserIndex];
    if (!targetUserMsg) {
      targetSyncLogs.push(`${target.path}:skip_no_user`);
      continue;
    }

    const targetUserStableText = stripManagedBlocksEvent(getMessageTextEvent(targetUserMsg), managedTags);
    const targetUserCurrentText = getMessageTextEvent(targetUserMsg);
    if (targetUserCurrentText !== targetUserStableText) {
      setMessageTextEvent(targetUserMsg, targetUserStableText);
    }

    const targetSystemIndex = findLastSystemIndexEvent(target.messages);
    let targetInjectionMsg =
      targetSystemIndex >= 0 ? target.messages[targetSystemIndex] : null;
    let targetAction = targetSystemIndex >= 0 ? "reuse_system" : "create_system";
    const targetCurrentText = targetInjectionMsg ? getMessageTextEvent(targetInjectionMsg) : "";
    const targetStrippedText = stripManagedBlocksEvent(targetCurrentText, managedTags);
    const targetComposedText = composePromptInjectionsEvent(targetStrippedText, [
      ruleBlockText,
      runtimePolicyBlockText,
      summaryBlockText,
      blindSummaryBlockText,
      guidanceBlockText,
      blindGuidanceBlockText,
      statusBlockText,
      passiveDiscoveryBlockText,
    ]);

    if (!targetInjectionMsg && targetComposedText) {
      targetInjectionMsg = insertManagedSystemMessageEvent(
        target.messages,
        targetUserIndex,
        targetUserMsg
      );
    }
    if (targetInjectionMsg) {
      const nextTargetText = targetComposedText;
      const prevTargetText = getMessageTextEvent(targetInjectionMsg);
      if (prevTargetText !== nextTargetText) {
        setMessageTextEvent(targetInjectionMsg, nextTargetText);
      } else if (targetAction === "create_system") {
        targetAction = "create_system_unchanged";
      } else {
        targetAction = "reuse_system_unchanged";
      }
      if (targetAction === "create_system" && !nextTargetText) {
        targetAction = "create_system_empty";
      } else if (targetAction === "reuse_system" && !nextTargetText) {
        targetAction = "reuse_system_cleared";
      }
    } else {
      targetAction = "no_system_needed";
    }

    targetSyncLogs.push(`${target.path}:${targetAction}`);
  }

  if (changedMeta) {
    deps.saveMetadataSafeEvent();
  }

  logger.info(
    `通过 ${sourceEvent} 更新了提示词管理块 (路径=${chatTargets
      .map((target) => target.path)
      .join(",")} 块=规则:${ruleBlockText ? 1 : 0},运行时:${runtimePolicyBlockText ? 1 : 0},摘要:${summaryBlockText ? 1 : 0},暗骰摘要:${blindSummaryBlockText ? 1 : 0},指引:${guidanceBlockText ? 1 : 0},暗骰:${blindGuidanceBlockText ? 1 : 0},状态:${statusBlockText ? 1 : 0},被动:${passiveDiscoveryBlockText ? 1 : 0} 操作=${targetSyncLogs.join(
      ";"
    )})`
  );
}
