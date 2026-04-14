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
  lines.push(`count=${queue.length}`);
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

function buildCheckDicePatternEvent(settings: DicePluginSettingsEvent): string {
  const checkDiceParts: string[] = ["NdM"];
  if (settings.enableExplodingDice) checkDiceParts.push("[!]");
  if (settings.enableAdvantageSystem) checkDiceParts.push("[khX|klX]");
  checkDiceParts.push("[+/-B]");
  return checkDiceParts.join("");
}

function isVerbosePromptModeEvent(settings: DicePluginSettingsEvent): boolean {
  return settings.promptVerbosityMode === "verbose";
}

function buildCoreDiceProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const checkDicePattern = buildCheckDicePatternEvent(settings);
  const lines: string[] = [];
  lines.push("【骰子协议】");
  lines.push("1. 只输出 ```rolljson，禁止 ```json。");
  lines.push("2. 正文先叙事，不直接宣判检定结果。");
  lines.push("3. rolljson:");
  lines.push("{");
  lines.push('  "type":"dice_events","version":"1",');
  lines.push('  "events":[{');
  lines.push('    "id":"str","title":"str","difficulty":"easy|normal|hard|extreme","desc":"str",');
  lines.push(`    "checkDice":"${checkDicePattern}",`);
  lines.push('    "skill":"str","compare":">=|>|<=|<","scope":"protagonist|character|all",');
  lines.push('    "target":{"type":"self|scene|supporting|object|other","name":"str?"}');
  if (settings.enableAiRollMode) {
    lines.push('    ,"rollMode":"auto|manual"');
  }
  if (settings.enableAdvantageSystem) {
    lines.push('    ,"advantageState":"normal|advantage|disadvantage"');
  }
  if (settings.enableDynamicDcReason) {
    lines.push('    ,"dc_reason":"str"');
  }
  if (settings.enableTimeLimit) {
    lines.push('    ,"timeLimit":"PT30S"');
  }
  if (settings.enableOutcomeBranches) {
    lines.push(
      settings.enableExplodingDice && settings.enableExplodeOutcomeBranch
        ? '    ,"outcomes":{"success":"str","failure":"str","explode":"str?"}'
        : '    ,"outcomes":{"success":"str","failure":"str"}'
    );
  }
  lines.push("  }]");
  if (settings.enableAiRoundControl) {
    lines.push('  ,"round_control":"continue|end_round","end_round":bool');
  }
  lines.push("}");
  lines.push("4. checkDice 只能写骰式本体；difficulty 只允许 easy|normal|hard|extreme。");
  lines.push(`5. 已启用骰式：${formatEnabledDiceTypesTextEvent(settings.aiAllowedDiceSidesText)}。`);
  if (settings.enableOutcomeBranches) {
    lines.push("6. 暗骰事件必须提供 outcomes。");
  }
  lines.push("7. 所有运行时限制以 <dice_runtime_policy> 为准。");
  if (isVerbosePromptModeEvent(settings)) {
    lines.push(`例：{"checkDice":"${settings.enableAdvantageSystem ? "2d20kh1" : "1d20"}","compare":">=","difficulty":"normal"}`);
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

function buildInteractiveTriggerProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const blindSkillText = String(settings.defaultBlindSkillsText ?? "")
    .split(/[\n,|]+/)
    .map((item) => normalizeInlineTextEvent(item))
    .filter(Boolean)
    .join("、") || "洞察、潜行、搜查、历史、调查";
  const lines: string[] = [];
  lines.push("【交互触发协议】");
  lines.push("1. rh-trigger 只能写在最终剧情正文里，不能写进 rolljson/outcomes/desc/dc_reason。");
  lines.push("2. trigger_pack 只能输出 ```triggerjson，禁止 ```json。");
  lines.push("3. trigger_pack 可选，不是每轮必出。");
  lines.push("4. triggerjson:");
  lines.push("{");
  lines.push('  "type":"trigger_pack","version":"1",');
  lines.push('  "defaults":{"dice":"1d20","compare":">="},');
  lines.push('  "items":[{"sid":"str","skill":"str","difficulty":"easy|normal|hard|extreme","reveal":"instant|delayed","success":"str","failure":"str","explode":"str?"}]');
  lines.push("}");
  lines.push("5. sid 必须对应 rh-trigger 的 sourceId；success/failure/explode 必须简短。");
  lines.push("6. 每轮最多 1~2 个 trigger_pack，只给关键情报 trigger 使用。");
  lines.push('7. reveal="instant" 表示命中后立即给短反馈；reveal="delayed" 表示进入后续体现。');
  lines.push(`8. ${blindSkillText} 这类暗骰技能适用时请写 blind="1"，且对应 outcomes 必须写全。`);
  lines.push("9. 只标值得继续调查、判断或检定的短词或短短语，例如异响、痕迹、异味、可疑停顿、异常缝隙、被移动的物件、矛盾细节。");
  lines.push("10. 不要标整句、纯氛围描写、普通修饰词、装饰性名词、已经没有后续调查价值的结论句。");
  lines.push('11. 需要立刻支持玩家决策的信息优先 instant；潜行、欺骗、伏击、藏匿、是否暴露、是否被怀疑等结果优先 delayed。');
  lines.push('12. rh-trigger 语法：<rh-trigger action="调查" skill="调查" difficulty="normal" sourceId="clue_1">奇怪的响声</rh-trigger>');
  if (isVerbosePromptModeEvent(settings)) {
    lines.push('13. 示例：<rh-trigger action="调查" skill="调查" difficulty="normal" sourceId="clue_1">奇怪的响声</rh-trigger>');
    lines.push("14. rh-trigger 应落在正文里最值得继续追查的那个短词或短短语上，不要整句包裹，也不要在同一段中大量重复发光。");
    lines.push("15. 调查、察觉、洞察、搜索、历史、聆听这类信息型检定优先 instant。");
    lines.push("16. 潜行、欺骗、伏击、藏匿、伪装、是否暴露、是否被怀疑这类状态型检定优先 delayed。");
    lines.push("17. 例如“奇怪的响声”“店主的停顿”“异常刮痕”适合 instant；“是否暴露”“是否被识破”适合 delayed。");
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

function buildStatusProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const lines: string[] = [];
  lines.push("【状态标签】");
  lines.push("- [APPLY_STATUS:名,整数值,turns=2,skills=A|B 或 scope=all]");
  lines.push("- [REMOVE_STATUS:名]");
  lines.push("- [CLEAR_STATUS]");
  lines.push("- 状态标签只能写在 ```rolljson 的 outcomes.success / outcomes.failure / outcomes.explode 文本里。");
  lines.push("- 禁止把状态标签写进正文、desc、dc_reason、rh-trigger 或 trigger_pack。");
  lines.push("- 负面状态必须为负数，正面状态必须为正数。");
  lines.push("- turns 默认 1；turns=perm 表示永久。");
  if (isVerbosePromptModeEvent(settings)) {
    lines.push("- 示例：把 [APPLY_STATUS:林间庇护,1,turns=2,skills=体魄|感知] 写进对应事件的 outcomes.success，而不是正文段落。");
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

function buildExplodeProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const lines: string[] = [];
  lines.push("【爆骰规则】");
  lines.push("1. 只有 checkDice 含 ! 时，才允许写 outcomes.explode。");
  lines.push("2. 没有 ! 就必须省略 explode。");
  lines.push("3. ! 与 kh/kl 不能同用。");
  if (settings.enableAiRollMode) {
    lines.push("4. 若启用 auto 检定，同一轮最多仅 1 个事件使用 !。");
  }
  if (isVerbosePromptModeEvent(settings)) {
    lines.push('例：{"checkDice":"1d20!","outcomes":{"success":"...","failure":"...","explode":"..."}}');
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

function buildAdvantageProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const lines: string[] = [];
  lines.push("【优势/劣势规则】");
  lines.push("1. 可用 advantageState 或 2d20kh1 / 2d20kl1。");
  lines.push("2. kh/kl 只保留 1 颗 d20，不是两次结果相加。");
  lines.push("3. 写事件前必须检查阈值是否可达，避免理论上必败或必成。");
  if (isVerbosePromptModeEvent(settings)) {
    lines.push("4. 例如 2d20kl1+1 不应搭配 >=30，2d20kh1+0 也不应搭配 >20。");
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

function buildTimeLimitProtocolBlockEvent(): string {
  return normalizeBlockTextEvent([
    "【时间限制】",
    "可填写 timeLimit，且必须不小于 <dice_runtime_policy> 给出的最小时限。",
  ].join("\n"));
}

function buildDcReasonProtocolBlockEvent(): string {
  return normalizeBlockTextEvent([
    "【难度说明】",
    "可填写 dc_reason，用于解释 difficulty 的叙事依据。",
  ].join("\n"));
}

function buildNarrativeConstraintProtocolBlockEvent(settings: DicePluginSettingsEvent): string {
  const lines: string[] = [];
  lines.push("【叙事约束】");
  lines.push("1. 成功可以推进，不要无故追加重罚。");
  lines.push("2. 失败必须附带明确代价（时间损失、误判、暴露、资源消耗、引发下一风险之一）。");
  lines.push("3. 大失败必须显著，但仍保留后续行动空间。");
  if (isVerbosePromptModeEvent(settings)) {
    lines.push("4. 信息类失败可给出错误线索、漏掉关键点或自信误判。");
  }
  return normalizeBlockTextEvent(lines.join("\n"));
}

export function buildDynamicSystemRuleTextEvent(settings: DicePluginSettingsEvent): string {
  const blocks = [
    buildCoreDiceProtocolBlockEvent(settings),
    settings.enableInteractiveTriggers ? buildInteractiveTriggerProtocolBlockEvent(settings) : "",
    settings.enableStatusSystem && settings.enableOutcomeBranches ? buildStatusProtocolBlockEvent(settings) : "",
    settings.enableExplodingDice ? buildExplodeProtocolBlockEvent(settings) : "",
    settings.enableAdvantageSystem ? buildAdvantageProtocolBlockEvent(settings) : "",
    settings.enableTimeLimit ? buildTimeLimitProtocolBlockEvent() : "",
    settings.enableDynamicDcReason ? buildDcReasonProtocolBlockEvent() : "",
    settings.enableNarrativeCostEnforcement ? buildNarrativeConstraintProtocolBlockEvent(settings) : "",
  ].filter(Boolean);
  return normalizeBlockTextEvent(blocks.join("\n\n"));
}

export function buildFinalRuleTextEvent(settings: DicePluginSettingsEvent): string {
  const blocks = [buildDynamicSystemRuleTextEvent(settings)];
  const customRuleText = normalizeTextEvent(settings.ruleText || "").trim();
  if (customRuleText) {
    blocks.push(`【用户自定义补充】\n${customRuleText}`);
  }
  return normalizeBlockTextEvent(blocks.join("\n\n"));
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

export function buildCompactDiceRuntimePolicyBlockEvent(
  settings: DicePluginSettingsEvent,
  startTag: string,
  endTag: string
): string {
  const enabledDice = parseEnabledDiceSidesEvent(settings.aiAllowedDiceSidesText)
    .map((sides) => `d${sides}`)
    .join(",");
  const lines: string[] = [];
  lines.push(startTag);
  lines.push(`apply_scope=${settings.eventApplyScope}`);
  lines.push(`round_mode=${settings.enableAiRoundControl ? "continuous" : "per_round"}`);
  lines.push(`roll_mode_allowed=${settings.enableAiRollMode ? "auto|manual" : "manual_only"}`);
  lines.push(
    `round_control_allowed=${settings.enableAiRoundControl ? "continue|end_round" : "disabled"}`
  );
  lines.push(`explode_enabled=${settings.enableExplodingDice ? 1 : 0}`);
  lines.push(`ai_auto_explode_event_limit_per_round=${settings.enableAiRollMode ? 1 : 0}`);
  lines.push(`advantage_enabled=${settings.enableAdvantageSystem ? 1 : 0}`);
  lines.push(`dynamic_dc_reason_enabled=${settings.enableDynamicDcReason ? 1 : 0}`);
  lines.push(`status_system_enabled=${settings.enableStatusSystem ? 1 : 0}`);
  lines.push(`status_tags_allowed=${settings.enableStatusSystem ? 1 : 0}`);
  lines.push(`outcome_branches_enabled=${settings.enableOutcomeBranches ? 1 : 0}`);
  lines.push(`explode_outcome_enabled=${settings.enableExplodeOutcomeBranch ? 1 : 0}`);
  lines.push(`time_limit_enabled=${settings.enableTimeLimit ? 1 : 0}`);
  lines.push(`min_time_limit_seconds=${Math.max(1, Math.floor(Number(settings.minTimeLimitSeconds) || 1))}`);
  lines.push(`enabled_dice=${enabledDice}`);
  lines.push(`skill_system_enabled=${settings.enableSkillSystem ? 1 : 0}`);
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

function buildAssistantFloorKeyFromPromptMessageEvent(
  message: TavernMessageEvent | undefined,
  index: number
): string | null {
  if (!message || typeof message !== "object") return null;
  const explicitId = message.id ?? message.cid ?? message.uid;
  if (explicitId != null) {
    return `assistant:${String(explicitId)}`;
  }
  const timestamp =
    (message as any).create_date
    ?? (message as any).create_time
    ?? (message as any).timestamp
    ?? "";
  const normalizedTimestamp = String(timestamp ?? "").trim();
  if (normalizedTimestamp) {
    return `assistant_ts:${normalizedTimestamp}`;
  }
  if (!Number.isFinite(index) || index < 0) return null;
  return `assistant_idx:${index}`;
}

function collectPromptExcludedSummaryFloorKeysEvent(
  messages: TavernMessageEvent[],
  userIndex: number
): Set<string> {
  const excluded = new Set<string>();
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (!isAssistantMessageEvent(message)) continue;
    const floorKey = buildAssistantFloorKeyFromPromptMessageEvent(message, index);
    if (floorKey) excluded.add(floorKey);
  }
  return excluded;
}

function filterSummaryHistoryByExcludedFloorsEvent(
  history: RoundSummarySnapshotEvent[],
  excludedFloorKeys: Set<string>
): RoundSummarySnapshotEvent[] {
  if (!Array.isArray(history) || history.length <= 0 || excludedFloorKeys.size <= 0) {
    return Array.isArray(history) ? history : [];
  }

  return history
    .map((snapshot) => {
      if (!snapshot) return null;
      const nextEvents = Array.isArray(snapshot.events)
        ? snapshot.events.filter((event) => {
            const floorKey = buildAssistantFloorKeyEvent(String(event?.sourceAssistantMsgId ?? "").trim());
            return !floorKey || !excludedFloorKeys.has(floorKey);
          })
        : [];
      const nextSourceAssistantMsgIds = Array.isArray(snapshot.sourceAssistantMsgIds)
        ? snapshot.sourceAssistantMsgIds.filter((assistantMsgId) => {
            const floorKey = buildAssistantFloorKeyEvent(String(assistantMsgId ?? "").trim());
            return !floorKey || !excludedFloorKeys.has(floorKey);
          })
        : [];

      if (
        nextEvents.length === (Array.isArray(snapshot.events) ? snapshot.events.length : 0)
        && nextSourceAssistantMsgIds.length === (Array.isArray(snapshot.sourceAssistantMsgIds) ? snapshot.sourceAssistantMsgIds.length : 0)
      ) {
        return snapshot;
      }

      if (nextEvents.length <= 0 && nextSourceAssistantMsgIds.length <= 0) {
        return null;
      }

      return {
        ...snapshot,
        events: nextEvents,
        eventsCount: nextEvents.length,
        rolledCount: nextEvents.filter((event) => event?.rollId || event?.resultSource).length,
        sourceAssistantMsgIds: nextSourceAssistantMsgIds,
      };
    })
    .filter((snapshot): snapshot is RoundSummarySnapshotEvent => snapshot != null);
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
  const promptExcludedSummaryFloorKeys = collectPromptExcludedSummaryFloorKeysEvent(
    primaryTarget.messages,
    userIndex
  );
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
    runtimePolicyBlockText = buildCompactDiceRuntimePolicyBlockEvent(
      settings,
      runtimePolicyStartTag,
      runtimePolicyEndTag
    );
  }

  let summaryBlockText = "";
  let blindSummaryBlockText = "";
  const shouldReuseOutboundSummary =
    promptExcludedSummaryFloorKeys.size <= 0
    && isSameUserPrompt
    && meta.outboundSummary
    && meta.outboundSummary.userMsgId === userMsgId;
  if (shouldReuseOutboundSummary) {
    const legacySummaryText = normalizeBlockTextEvent(
      String((meta.outboundSummary as unknown as { summaryText?: unknown }).summaryText ?? "")
    );
    summaryBlockText = normalizeBlockTextEvent(meta.outboundSummary.publicSummaryText || legacySummaryText);
    blindSummaryBlockText = normalizeBlockTextEvent(meta.outboundSummary.blindSummaryText);
  } else {
    const history = deps.ensureSummaryHistoryEvent(meta);
    const filteredHistory = filterSummaryHistoryByExcludedFloorsEvent(
      history,
      promptExcludedSummaryFloorKeys
    );
    const built = deps.buildSummaryBlockFromHistoryEvent(
      filteredHistory,
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
