import type { DiceResult } from "./diceEvent";

export type CompareOperatorEvent = ">=" | ">" | "<=" | "<";
export type EventApplyScopeSettingEvent = "protagonist_only" | "all";
export type EventScopeTagEvent = "protagonist" | "all" | "character";
export type EventTargetTypeEvent = "self" | "scene" | "supporting" | "object" | "other";
export type EventRollModeEvent = "auto" | "manual";
export type AdvantageStateEvent = "normal" | "advantage" | "disadvantage";
export type EventRollSourceEvent = "manual_roll" | "ai_auto_roll" | "timeout_auto_fail";
export type SummaryDetailModeEvent = "minimal" | "balanced" | "detailed";
export type SummaryEventStatusEvent = "pending" | "done" | "timeout";
export type EventOutcomeKindEvent = "success" | "failure" | "explode" | "none";
export type StatusScopeEvent = "skills" | "all";
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
  enableExplodingDice: boolean;
  enableAdvantageSystem: boolean;
  enableDynamicResultGuidance: boolean;
  enableDynamicDcReason: boolean;
  enableStatusSystem: boolean;
  aiAllowedDiceSidesText: string;
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
  timeoutAt?: number | null;
  explodePolicyApplied?:
  | "not_requested"
  | "enabled"
  | "disabled_globally"
  | "downgraded_by_ai_limit";
  explodePolicyReason?: string;
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
  summaryText: string;
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

export interface RoundSummaryEventItemEvent {
  id: string;
  title: string;
  desc: string;
  targetLabel: string;
  skill: string;
  checkDice: string;
  compare: CompareOperatorEvent;
  dc: number;
  dcReason: string;
  rollMode: EventRollModeEvent;
  advantageState: AdvantageStateEvent;
  timeLimit: string;
  status: SummaryEventStatusEvent;
  resultSource: EventRollSourceEvent | null;
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
}

export interface RoundSummarySnapshotEvent {
  roundId: string;
  openedAt: number;
  closedAt: number;
  eventsCount: number;
  rolledCount: number;
  events: RoundSummaryEventItemEvent[];
}

export interface DiceMetaEvent {
  pendingRound?: PendingRoundEvent;
  activeStatuses?: ActiveStatusEvent[];
  outboundSummary?: OutboundSummaryCacheEvent;
  pendingResultGuidanceQueue?: PendingResultGuidanceEvent[];
  outboundResultGuidance?: OutboundResultGuidanceCacheEvent;
  summaryHistory?: RoundSummarySnapshotEvent[];
  lastPromptUserMsgId?: string;
  lastProcessedAssistantMsgId?: string;
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

