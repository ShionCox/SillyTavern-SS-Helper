import { normalizeBlankLinesEvent, simpleHashEvent } from "../core/utilsEvent";
import { buildActiveStatusesBlockEvent, ensureActiveStatusesEvent as ensureActiveStatusesFromMetaEvent } from "./statusEvent";
import {
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
  DiceMetaEvent,
  DicePluginSettingsEvent,
  EventResultGradeEvent,
  PendingResultGuidanceEvent,
  RoundSummarySnapshotEvent,
  TavernMessageEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";

const DEFAULT_RULE_BLOCK_START_Event = "<dice_rules>";
const DEFAULT_RULE_BLOCK_END_Event = "</dice_rules>";
const DEFAULT_SUMMARY_BLOCK_START_Event = "<dice_round_summary>";
const DEFAULT_SUMMARY_BLOCK_END_Event = "</dice_round_summary>";
const DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event = "<dice_result_guidance>";
const DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event = "</dice_result_guidance>";
const DEFAULT_RUNTIME_POLICY_BLOCK_START_Event = "<dice_runtime_policy>";
const DEFAULT_RUNTIME_POLICY_BLOCK_END_Event = "</dice_runtime_policy>";
const DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event = "<dice_active_statuses>";
const DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event = "</dice_active_statuses>";

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
    summaryStart: string;
    summaryEnd: string;
    guidanceStart: string;
    guidanceEnd: string;
    statusesStart: string;
    statusesEnd: string;
  }>
): { start: string; end: string }[] {
  const ruleStart = tags?.ruleStart || DEFAULT_RULE_BLOCK_START_Event;
  const ruleEnd = tags?.ruleEnd || DEFAULT_RULE_BLOCK_END_Event;
  const runtimePolicyStart = tags?.runtimePolicyStart || DEFAULT_RUNTIME_POLICY_BLOCK_START_Event;
  const runtimePolicyEnd = tags?.runtimePolicyEnd || DEFAULT_RUNTIME_POLICY_BLOCK_END_Event;
  const summaryStart = tags?.summaryStart || DEFAULT_SUMMARY_BLOCK_START_Event;
  const summaryEnd = tags?.summaryEnd || DEFAULT_SUMMARY_BLOCK_END_Event;
  const guidanceStart = tags?.guidanceStart || DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event;
  const guidanceEnd = tags?.guidanceEnd || DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event;
  const statusesStart = tags?.statusesStart || DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event;
  const statusesEnd = tags?.statusesEnd || DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event;
  return [
    { start: ruleStart, end: ruleEnd },
    { start: runtimePolicyStart, end: runtimePolicyEnd },
    { start: summaryStart, end: summaryEnd },
    { start: guidanceStart, end: guidanceEnd },
    { start: statusesStart, end: statusesEnd },
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

function buildResultGuidanceInstructionEvent(item: PendingResultGuidanceEvent): string {
  const title = item.eventTitle || item.eventId;
  switch (item.resultGrade) {
    case "critical_success":
      return `玩家在「${title}」中掷出大成功，请用英雄化、戏剧性的口吻描述其完美完成动作，并给出额外收益。`;
    case "partial_success":
      return `玩家在「${title}」中勉强成功，请描述“成功但有代价”，代价可包含受伤、暴露、资源损失或引来威胁。`;
    case "success":
      return `玩家在「${title}」中成功，请给出稳定推进的叙事结果，避免额外惩罚。`;
    case "failure":
      return `玩家在「${title}」中失败，请描述受阻但剧情继续推进，可引入新的困难或替代路径。`;
    case "critical_failure":
      return `玩家在「${title}」中大失败，请描述显著且可感知的严重后果，同时保持后续可行动性。`;
    default:
      return `玩家在「${title}」中完成检定，请根据结果推进叙事。`;
  }
}
function buildResultGuidanceTextEvent(
  queue: PendingResultGuidanceEvent[],
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
    lines.push(`  instruction: ${buildResultGuidanceInstructionEvent(item)}`);
  }
  lines.push(guidanceEndTag);
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function getMessageTextEvent(message: TavernMessageEvent | undefined): string {
  return getSdkTavernPromptMessageTextEvent(message);
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
    return (message as any).mes;
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
  const allowedSides = parseAllowedSidesTextEvent(settings.aiAllowedDiceSidesText);

  const lines: string[] = [];
  lines.push("【事件骰子协议（系统动态）】");
  lines.push("1. 仅在文末输出 ```rolljson 代码块（严禁 ```json）。");
  lines.push("2. 叙事正文禁止直接给出判定结果，先给事件，再由系统结算并推进剧情。");
  lines.push("3. rolljson 基本格式：");
  lines.push("{");
  lines.push('  "type": "dice_events", "version": "1",');
  lines.push('  "events": [{');
  lines.push('    "id": "str", "title": "str", "dc": num, "desc": "str",');
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

  lines.push("4. 可用能力说明：");
  lines.push(`   - checkDice 仅使用 ${checkDicePattern}，只能写骰式本体，禁止加入技能名、状态名、自然语言、标签或变量,仅允许一个可选修正值，禁止连续修正（如 1d20+1-1）。`);
  lines.push("   - 合法示例：1d20、2d6+3、2d20kh1、2d20kl1、1d6!+2。");
  lines.push("   - 非法示例：1d20+1-1、1d20+体能、1d20+[虚弱]、1d20 (优势)。");
  lines.push("   - 若需施加或移除状态，请仅在 outcomes 文本中使用状态标签。");
  if (allowedSides !== "none") {
    lines.push(`   - 骰子面数限制：${allowedSides}。`);
  }
  if (settings.enableAiRollMode) {
    lines.push("   - 可使用 rollMode=auto|manual 指定是否自动掷骰。");
  }
  if (settings.enableAiRoundControl) {
    lines.push("   - 可使用 round_control 或 end_round 控制轮次是否结束。");
  }
  if (settings.enableExplodingDice) {
    lines.push("   - 已启用爆骰：! 会在掷出最大面后连爆，结果会影响剧情走向。");
    lines.push("   - 爆骰是否触发由系统根据真实掷骰结果决定，不可直接声明“必爆”。");
    if (settings.enableAiRollMode) {
      lines.push("   - AI 自动检定时，同一轮最多仅 1 个事件使用 !，其余会按普通骰结算。");
    }
  }
  if (settings.enableAdvantageSystem) {
    lines.push("   - 已启用优势/劣势：可用 advantageState 或 kh/kl，会改变结果并影响剧情走向。");
  }
  if (settings.enableExplodingDice && settings.enableAdvantageSystem) {
    lines.push("   - ! 与 kh/kl 不能同用。");
  }
  if (settings.enableDynamicDcReason) {
    lines.push("   - 可填写 dc_reason 解释难度依据。");
  }
  if (settings.enableTimeLimit) {
    lines.push("   - 可填写 timeLimit，且必须满足系统最小时限。");
  }
  if (settings.enableOutcomeBranches) {
    lines.push("   - outcomes 走向文本会直接影响后续剧情叙事。");
    if (settings.enableExplodingDice && settings.enableExplodeOutcomeBranch) {
      lines.push("   - 爆骰触发时优先使用 outcomes.explode。");
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

  lines.push("6. **必须遵守 <dice_runtime_policy> 的运行时限制。**");
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function buildFinalRuleTextEvent(settings: DicePluginSettingsEvent): string {
  const systemRuleText = buildDynamicSystemRuleTextEvent(settings);
  const customRuleText = normalizeTextEvent(settings.ruleText || "").trim();
  if (!customRuleText) return systemRuleText;
  return normalizeBlockTextEvent(`${systemRuleText}\n\n【用户自定义补充】\n${customRuleText}`);
}
function parseAllowedSidesTextEvent(raw: string): string {
  const parts = String(raw || "")
    .split(/[,\s]+/)
    .map((item) => Number(String(item || "").trim()))
    .filter((value) => Number.isFinite(value) && Number.isInteger(value) && value > 0);
  if (parts.length <= 0) return "none";
  return Array.from(new Set(parts)).sort((a, b) => a - b).join(",");
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
  const allowedSides = parseAllowedSidesTextEvent(settings.aiAllowedDiceSidesText);
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
  lines.push(`allowed_sides=${allowedSides}`);
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
  const guidanceText = buildResultGuidanceTextEvent(consumed, guidanceStartTag, guidanceEndTag);
  const lastRollId = consumed[consumed.length - 1]?.rollId || consumed[0]?.rollId || "";
  meta.outboundResultGuidance = {
    userMsgId,
    rollId: lastRollId,
    guidanceText,
  };
  return { text: guidanceText, changedMeta: true };
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
  DICE_SUMMARY_BLOCK_START_Event: string;
  DICE_SUMMARY_BLOCK_END_Event: string;
  DICE_RESULT_GUIDANCE_BLOCK_START_Event?: string;
  DICE_RESULT_GUIDANCE_BLOCK_END_Event?: string;
  DICE_ACTIVE_STATUSES_BLOCK_START_Event?: string;
  DICE_ACTIVE_STATUSES_BLOCK_END_Event?: string;
  sweepTimeoutFailuresEvent: () => boolean;
  getDiceMetaEvent: () => DiceMetaEvent;
  ensureSummaryHistoryEvent: (meta: DiceMetaEvent) => RoundSummarySnapshotEvent[];
  createRoundSummarySnapshotEvent: (round: any, now?: number) => RoundSummarySnapshotEvent;
  trimSummaryHistoryEvent: (history: RoundSummarySnapshotEvent[]) => void;
  buildSummaryBlockFromHistoryEvent: (
    history: RoundSummarySnapshotEvent[],
    detailMode: DicePluginSettingsEvent["summaryDetailMode"],
    lastNRounds: number,
    includeOutcomeInSummary: boolean
  ) => string;
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
  const summaryStartTag = deps.DICE_SUMMARY_BLOCK_START_Event || DEFAULT_SUMMARY_BLOCK_START_Event;
  const summaryEndTag = deps.DICE_SUMMARY_BLOCK_END_Event || DEFAULT_SUMMARY_BLOCK_END_Event;
  const guidanceStartTag =
    deps.DICE_RESULT_GUIDANCE_BLOCK_START_Event || DEFAULT_RESULT_GUIDANCE_BLOCK_START_Event;
  const guidanceEndTag =
    deps.DICE_RESULT_GUIDANCE_BLOCK_END_Event || DEFAULT_RESULT_GUIDANCE_BLOCK_END_Event;
  const statusesStartTag =
    deps.DICE_ACTIVE_STATUSES_BLOCK_START_Event || DEFAULT_ACTIVE_STATUSES_BLOCK_START_Event;
  const statusesEndTag =
    deps.DICE_ACTIVE_STATUSES_BLOCK_END_Event || DEFAULT_ACTIVE_STATUSES_BLOCK_END_Event;
  const managedTags = {
    ruleStart: ruleStartTag,
    ruleEnd: ruleEndTag,
    runtimePolicyStart: runtimePolicyStartTag,
    runtimePolicyEnd: runtimePolicyEndTag,
    summaryStart: summaryStartTag,
    summaryEnd: summaryEndTag,
    guidanceStart: guidanceStartTag,
    guidanceEnd: guidanceEndTag,
    statusesStart: statusesStartTag,
    statusesEnd: statusesEndTag,
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
  if (isSameUserPrompt && meta.outboundSummary && meta.outboundSummary.userMsgId === userMsgId) {
    summaryBlockText = normalizeBlockTextEvent(meta.outboundSummary.summaryText);
  } else {
    const history = deps.ensureSummaryHistoryEvent(meta);
    const built = deps.buildSummaryBlockFromHistoryEvent(
      history,
      settings.summaryDetailMode,
      settings.summaryHistoryRounds,
      settings.includeOutcomeInSummary
    );
    summaryBlockText = normalizeBlockTextEvent(built);
    if (summaryBlockText) {
      meta.outboundSummary = {
        userMsgId,
        roundId: meta.pendingRound?.roundId || "",
        summaryText: summaryBlockText,
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
      guidanceBlockText,
      statusBlockText,
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
      .join(",")} 块=规则:${ruleBlockText ? 1 : 0},运行时:${runtimePolicyBlockText ? 1 : 0},摘要:${summaryBlockText ? 1 : 0},指引:${guidanceBlockText ? 1 : 0},状态:${statusBlockText ? 1 : 0} 操作=${targetSyncLogs.join(
      ";"
    )})`
  );
}

