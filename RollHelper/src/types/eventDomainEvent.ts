import type { DiceResult } from "./diceEvent";

export type CompareOperatorEvent = ">=" | ">" | "<=" | "<";
export type EventApplyScopeSettingEvent = "protagonist_only" | "all";
export type EventScopeTagEvent = "protagonist" | "all" | "character";
export type EventTargetTypeEvent = "self" | "scene" | "supporting" | "object" | "other";
export type EventRollModeEvent = "auto" | "manual";
export type AdvantageStateEvent = "normal" | "advantage" | "disadvantage";
export type EventDifficultyLevelEvent = "easy" | "normal" | "hard" | "extreme";
export type EventRollSourceEvent =
  | "manual_roll"
  | "blind_manual_roll"
  | "ai_auto_roll"
  | "passive_check"
  | "timeout_auto_fail";
export type SummaryDetailModeEvent = "minimal" | "balanced" | "detailed";
export type RollHelperSettingsThemeEvent = "default" | "dark" | "light" | "tavern";
export type SummaryEventStatusEvent = "pending" | "done" | "timeout";
export type EventOutcomeKindEvent = "success" | "failure" | "explode" | "none";
export type StatusScopeEvent = "skills" | "all";
export type RollVisibilityEvent = "public" | "blind" | "passive";
export type SelectionFallbackLimitModeEvent = "char_count" | "sentence_count";
export type TriggerPackRevealModeEvent = "instant" | "delayed";
export type BlindGuidanceStateEvent =
  | "queued"
  | "consumed"
  | "expired"
  | "invalidated"
  | "archived";
export type EventResultGradeEvent =
  | "critical_success"
  | "partial_success"
  | "success"
  | "failure"
  | "critical_failure";

export interface EventOutcomesEvent {
  success?: string;
  failure?: string;
  explode?: string;
}

export interface TriggerPackDefaultsEvent {
  dice?: string;
  compare?: CompareOperatorEvent;
}

export interface TriggerPackItemEvent {
  sid: string;
  skill: string;
  difficulty: EventDifficultyLevelEvent;
  reveal: TriggerPackRevealModeEvent;
  success?: string;
  failure?: string;
  explode?: string;
  dice?: string;
  compare?: CompareOperatorEvent;
}

export interface TriggerPackEvent {
  type: "trigger_pack";
  version: "1";
  defaults?: TriggerPackDefaultsEvent;
  items: TriggerPackItemEvent[];
}

export interface EventTimerStateEvent {
  offeredAt: number;
  deadlineAt: number | null;
  expiredAt?: number;
}

export interface DicePluginSettingsEvent {
  enabled: boolean;
  autoSendRuleToAI: boolean;
  enableAiRollMode: boolean;
  enableAiRoundControl: boolean;
  enable3DDiceBox: boolean;
  enableRerollFeature: boolean;
  enableExplodingDice: boolean;
  enableAdvantageSystem: boolean;
  enableDynamicResultGuidance: boolean;
  enableDynamicDcReason: boolean;
  enableStatusSystem: boolean;
  aiAllowedDiceSidesText: string;
  theme: RollHelperSettingsThemeEvent;
  summaryDetailMode: SummaryDetailModeEvent;
  summaryHistoryRounds: number;
  eventApplyScope: EventApplyScopeSettingEvent;
  enableOutcomeBranches: boolean;
  enableExplodeOutcomeBranch: boolean;
  includeOutcomeInSummary: boolean;
  showOutcomePreviewInListCard: boolean;
  enableTimeLimit: boolean;
  minTimeLimitSeconds: number;
  enableSkillSystem: boolean;
  enableInteractiveTriggers: boolean;
  enableSelectionFallbackTriggers: boolean;
  selectionFallbackLimitMode: SelectionFallbackLimitModeEvent;
  selectionFallbackMaxPerRound: number;
  selectionFallbackMaxPerFloor: number;
  selectionFallbackMinTextLength: number;
  selectionFallbackMaxTextLength: number;
  selectionFallbackMaxSentences: number;
  selectionFallbackSingleAction: string;
  selectionFallbackSingleSkill: string;
  enableSelectionFallbackDebugInfo: boolean;
  interactiveTriggerMode: "ai_markup";
  enableBlindRoll: boolean;
  defaultBlindSkillsText: string;
  maxBlindRollsPerRound: number;
  maxQueuedBlindGuidance: number;
  blindGuidanceTtlSeconds: number;
  enableBlindGuidanceDedup: boolean;
  blindDedupScope: "same_round" | "same_floor";
  blindEventCardVisibilityMode: "remove" | "placeholder";
  maxBlindGuidanceInjectedPerPrompt: number;
  enableBlindDebugInfo: boolean;
  blindHistoryDisplayConsumedAsNarrativeApplied: boolean;
  blindHistoryAutoArchiveEnabled: boolean;
  blindHistoryAutoArchiveAfterHours: number;
  blindHistoryShowFloorKey: boolean;
  blindHistoryShowOrigin: boolean;
  enablePassiveCheck: boolean;
  passiveFormulaBase: number;
  passiveSkillAliasesText: string;
  enableNarrativeCostEnforcement: boolean;
  worldbookPassiveMode: "disabled" | "read_only" | "read_write";
  blindUiWarnInConsole: boolean;
  blindRevealInSummary: boolean; // 仅控制摘要是否允许揭示暗骰 outcome 文本，不影响结果卡隐藏策略
  skillTableText: string;
  skillPresetStoreText: string;
  ruleTextModeVersion: number;
  ruleText: string;
}

export interface SkillEditorRowDraftEvent {
  rowId: string;
  skillName: string;
  modifierText: string;
}

export interface StatusEditorRowDraftEvent {
  rowId: string;
  name: string;
  modifierText: string;
  durationText: string;
  scope: StatusScopeEvent;
  skillsText: string;
  enabled: boolean;
}

export interface ActiveStatusEvent {
  name: string;
  modifier: number;
  remainingRounds?: number | null;
  scope: StatusScopeEvent;
  skills: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  source?: "ai_tag" | "manual_editor";
}

export interface SkillPresetEvent {
  id: string;
  name: string;
  locked: boolean;
  skillTableText: string;
  createdAt: number;
  updatedAt: number;
}

export interface SkillPresetStoreEvent {
  version: 1;
  activePresetId: string;
  presets: SkillPresetEvent[];
}

export interface DiceEventSpecEvent {
  id: string;
  title: string;
  checkDice: string;
  dc: number;
  difficulty?: EventDifficultyLevelEvent;
  dcSource?: "ai" | "difficulty_mapped";
  compare?: CompareOperatorEvent;
  scope?: EventScopeTagEvent;
  rollMode?: EventRollModeEvent;
  advantageState?: AdvantageStateEvent;
  skill: string;
  targetType: EventTargetTypeEvent;
  targetName?: string;
  targetLabel: string;
  timeLimit?: string;
  offeredAt?: number;
  deadlineAt?: number | null;
  timeLimitMs?: number | null;
  desc: string;
  dcReason?: string;
  outcomes?: EventOutcomesEvent;
  sourceAssistantMsgId?: string;
}

export interface EventRollRecordEvent {
  rollId: string;
  roundId: string;
  eventId: string;
  eventTitle: string;
  diceExpr: string;
  result: DiceResult;
  success: boolean | null;
  compareUsed: CompareOperatorEvent;
  dcUsed: number | null;
  advantageStateApplied: AdvantageStateEvent;
  resultGrade?: EventResultGradeEvent;
  marginToDc?: number | null;
  skillModifierApplied: number;
  statusModifierApplied: number;
  statusModifiersApplied?: Array<{ name: string; modifier: number }>;
  baseModifierUsed: number;
  finalModifierUsed: number;
  targetLabelUsed: string;
  rolledAt: number;
  source: EventRollSourceEvent;
  visibility?: RollVisibilityEvent; // 首投决定，重投必须继承，不能通过重投切换
  concealResult?: boolean;
  natState?: "nat1" | "nat20" | "none";
  timeoutAt?: number | null;
  explodePolicyApplied?:
  | "not_requested"
  | "enabled"
  | "disabled_globally"
  | "downgraded_by_ai_limit";
  explodePolicyReason?: string;
  sourceAssistantMsgId?: string;
  revealMode?: TriggerPackRevealModeEvent;
}

export interface PendingRoundEvent {
  roundId: string;
  status: "open" | "closed";
  events: DiceEventSpecEvent[];
  rolls: EventRollRecordEvent[];
  eventTimers: Record<string, EventTimerStateEvent>;
  sourceAssistantMsgIds: string[];
  openedAt: number;
}

export interface OutboundSummaryCacheEvent {
  userMsgId: string;
  roundId: string;
  publicSummaryText: string;
  blindSummaryText: string;
}

export interface BuiltSummaryBlocksEvent {
  publicSummaryText: string;
  blindSummaryText: string;
}

export interface PendingResultGuidanceEvent {
  rollId: string;
  roundId: string;
  eventId: string;
  eventTitle: string;
  targetLabel: string;
  resultGrade: EventResultGradeEvent;
  marginToDc: number | null;
  total: number;
  dcUsed: number | null;
  compareUsed: CompareOperatorEvent;
  advantageStateApplied: AdvantageStateEvent;
  source: EventRollSourceEvent;
  rolledAt: number;
}

export interface OutboundResultGuidanceCacheEvent {
  userMsgId: string;
  rollId: string;
  guidanceText: string;
}

export interface BlindGuidanceEvent {
  rollId: string;
  roundId?: string;
  eventId: string;
  eventTitle: string;
  skill: string;
  diceExpr: string;
  total: number;
  success: boolean | null;
  resultGrade: EventResultGradeEvent;
  natState: "nat1" | "nat20" | "none";
  targetLabel: string;
  rolledAt: number;
  source: EventRollSourceEvent;
  sourceAssistantMsgId?: string;
  sourceFloorKey?: string;
  origin?: "slash_broll" | "event_blind" | "interactive_blind";
  sourceId?: string;
  note?: string;
  createdAt?: number;
  expiresAt?: number | null;
  consumed?: boolean;
  consumedAt?: number;
  invalidatedAt?: number;
  archivedAt?: number;
  state?: BlindGuidanceStateEvent;
  dedupeKey?: string;
}

export interface BlindHistoryItemEvent {
  rollId: string;
  roundId?: string;
  eventId: string;
  eventTitle: string;
  skill: string;
  diceExpr: string;
  targetLabel: string;
  resultGrade?: EventResultGradeEvent;
  rolledAt: number;
  source: EventRollSourceEvent;
  origin?: "slash_broll" | "event_blind" | "interactive_blind";
  sourceAssistantMsgId?: string;
  sourceFloorKey?: string;
  note?: string;
  createdAt?: number;
  expiresAt?: number | null;
  consumedAt?: number;
  invalidatedAt?: number;
  archivedAt?: number;
  dedupeKey?: string;
  state?: BlindGuidanceStateEvent;
  revealMode?: TriggerPackRevealModeEvent;
}

export interface InteractiveTriggerEvent {
  triggerId: string;
  label: string;
  action: string;
  skill: string;
  blind: boolean;
  sourceMessageId: string;
  sourceFloorKey?: string;
  sourceId: string;
  occurrenceIndex?: number;
  textRange?: { start: number; end: number } | null;
  dcHint?: number | null;
  difficulty?: EventDifficultyLevelEvent;
  loreType?: string;
  note?: string;
  diceExpr?: string;
  compare?: CompareOperatorEvent;
  revealMode?: TriggerPackRevealModeEvent;
  triggerPackSourceId?: string;
  triggerPackSuccessText?: string;
  triggerPackFailureText?: string;
  triggerPackExplodeText?: string;
  resolvedResultGrade?: EventResultGradeEvent;
}

export interface PassiveDiscoveryEvent {
  discoveryId: string;
  bookName: string;
  entryId: string;
  title: string;
  type: string;
  skillName: string;
  passiveScore: number;
  dc: number;
  priority: number;
  scope: "once" | "persistent";
  content: string;
  matchedAt: number;
  source: "worldbook_passive";
}

export interface OutboundBlindGuidanceCacheEvent {
  userMsgId: string;
  rollId: string;
  guidanceText: string;
  roundId?: string;
}

export interface OutboundPassiveDiscoveryCacheEvent {
  userMsgId: string;
  discoveryIds: string[];
  discoveryText: string;
}

export interface RoundSummaryEventItemEvent {
  id: string;
  title: string;
  desc: string;
  targetLabel: string;
  skill: string;
  checkDice: string;
  compare: CompareOperatorEvent;
  dc: number;
  difficulty?: EventDifficultyLevelEvent;
  dcSource?: "ai" | "difficulty_mapped";
  dcReason: string;
  rollMode: EventRollModeEvent;
  advantageState: AdvantageStateEvent;
  timeLimit: string;
  status: SummaryEventStatusEvent;
  resultSource: EventRollSourceEvent | null;
  visibility?: RollVisibilityEvent;
  revealMode?: TriggerPackRevealModeEvent;
  total: number | null;
  skillModifierApplied: number;
  statusModifierApplied: number;
  baseModifierUsed: number;
  finalModifierUsed: number;
  success: boolean | null;
  marginToDc: number | null;
  resultGrade: EventResultGradeEvent | null;
  outcomeKind: EventOutcomeKindEvent;
  outcomeText: string;
  explosionTriggered: boolean;
  sourceAssistantMsgId?: string;
  rollId?: string;
  rolledAt?: number;
  targetLabelUsed?: string;
  statusModifiersApplied?: Array<{ name: string; modifier: number }>;
  explodePolicyApplied?: string;
  rollsSnapshot?: {
    rolls: number[];
    modifier: number;
    total: number;
    rawTotal: number;
    count: number;
    sides: number;
    exploding?: boolean;
    explosionTriggered?: boolean;
  };
}

export interface RoundSummarySnapshotEvent {
  roundId: string;
  openedAt: number;
  closedAt: number;
  eventsCount: number;
  rolledCount: number;
  events: RoundSummaryEventItemEvent[];
  sourceAssistantMsgIds: string[];
}

export interface DiceMetaEvent {
  pendingRound?: PendingRoundEvent;
  activeStatuses?: ActiveStatusEvent[];
  lastBaseRoll?: DiceResult;
  outboundSummary?: OutboundSummaryCacheEvent;
  pendingResultGuidanceQueue?: PendingResultGuidanceEvent[];
  outboundResultGuidance?: OutboundResultGuidanceCacheEvent;
  // 仅保留当前仍有效轮次/楼层可注入到下一次 prompt 的暗骰引导。
  pendingBlindGuidanceQueue?: BlindGuidanceEvent[];
  // 当前聊天已发生过的暗骰历史，仅用于 UI 列表展示，不保存真实结果。
  blindHistory?: BlindHistoryItemEvent[];
  // 当前 user prompt 已构造出的暗骰引导缓存，仅用于避免同一次 prompt 重复拼装。
  outboundBlindGuidance?: OutboundBlindGuidanceCacheEvent;
  pendingPassiveDiscoveries?: PassiveDiscoveryEvent[];
  outboundPassiveDiscovery?: OutboundPassiveDiscoveryCacheEvent;
  passiveDiscoveriesCache?: Record<string, PassiveDiscoveryEvent>;
  lastPassiveContextHash?: string;
  selectionFallbackState?: SelectionFallbackStateEvent;
  summaryHistory?: RoundSummarySnapshotEvent[];
  lastPromptUserMsgId?: string;
  // 记录最近一次 generation 后处理过的助手消息版本，避免重复清洗同一版本。
  lastProcessedAssistantMsgId?: string;
}

export interface SelectionFallbackStateEvent {
  roundId?: string;
  roundUsedCount: number;
  floorUsedCountMap: Record<string, number>;
  triedKeys: string[];
}

export interface TavernMessageEvent {
  role?: string;
  is_user?: boolean;
  is_system?: boolean;
  mes?: string;
  content?: string;
  id?: string | number;
  cid?: string | number;
  uid?: string | number;
  create_date?: string | number;
  create_time?: string | number;
  timestamp?: string | number;
  [key: string]: any;
}
