import { normalizeEnvelopeEvent, repairAndParseEventJsonEvent } from "../src/events/parserEvent";
import type { EventRollRecordEvent, PendingRoundEvent } from "../src/types/eventDomainEvent";
import { DEFAULT_SETTINGS_Event } from "../src/settings/constantsEvent";
import {
  buildEventListCardEvent as buildListCardCore,
  buildEventRollResultCardEvent as buildResultCardCore,
  getEventRuntimeViewStateEvent as getEventRuntimeViewStateCore,
} from "../src/events/renderEvent";
import { escapeAttrEvent, escapeHtmlEvent, formatEventModifierBreakdownEvent, formatModifier } from "../src/core/utilsEvent";
import {
  buildAlreadyRolledDiceVisualTemplateEvent,
  buildDiceSvgTemplateEvent,
  buildRollingSvgTemplateEvent,
} from "../src/templates/diceResultTemplates";
import {
  buildEventListCardTemplateEvent,
  buildEventListItemTemplateEvent,
  buildEventRolledBlockTemplateEvent,
  buildEventRolledPrefixTemplateEvent,
  buildEventRollButtonTemplateEvent,
  buildEventRollResultCardTemplateEvent,
  buildRollsSummaryTemplateEvent,
  ensureEventCardStylesEvent,
  refreshEventCardMobileTitleMarqueeEvent,
} from "../src/templates/eventCardTemplates";
import { resolveTriggeredOutcomeEvent } from "../src/events/roundEvent";
import { ensureSharedTooltip } from "../../_Components/sharedTooltip";

type PreviewMode = "desktop" | "mobile";

type MockStatus = {
  name: string;
  modifier: number;
  remainingRounds: number | null;
  scope: string;
  skills: string[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  source: string;
};

type RuntimeToneStyle = {
  border: string;
  background: string;
  color: string;
};

type ParsedDiceResult = {
  sides: number;
  count: number;
  modifier: number;
  explode: boolean;
};

type RenderDeps = Parameters<typeof buildListCardCore>[1]
  & Parameters<typeof buildResultCardCore>[2];

const PREVIEW_MODE_STORAGE_KEY = "rollhelper:test:preview-mode";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "rollhelper:test:sidebar-collapsed";

const body = document.body as HTMLBodyElement;
const input = document.getElementById("json-input") as HTMLTextAreaElement;
const renderButton = document.getElementById("render-btn") as HTMLButtonElement;
const preview = document.getElementById("preview-cards") as HTMLDivElement;
const desktopModeButton = document.getElementById("preview-mode-desktop") as HTMLButtonElement;
const mobileModeButton = document.getElementById("preview-mode-mobile") as HTMLButtonElement;
const sidebarEdgeToggle = document.getElementById("sidebar-edge-toggle") as HTMLButtonElement;
const codePanelToggle = document.getElementById("code-panel-toggle") as HTMLButtonElement;

ensureEventCardStylesEvent(document);

const TEST_SETTINGS = {
  ...DEFAULT_SETTINGS_Event,
  eventApplyScope: "all" as const,
};

const MOCK_ACTIVE_STATUSES: MockStatus[] = [
  { name: "中毒", modifier: -2, remainingRounds: 3, scope: "all", skills: [], enabled: true, createdAt: Date.now(), updatedAt: Date.now(), source: "ai_tag" },
  { name: "鼓舞", modifier: 1, remainingRounds: null, scope: "skills", skills: ["力量", "体质"], enabled: true, createdAt: Date.now(), updatedAt: Date.now(), source: "ai_tag" },
];

/**
 * 功能：返回测试页使用的固定设置。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   typeof TEST_SETTINGS：测试设置对象
 */
function getTestSettings(): typeof TEST_SETTINGS {
  return TEST_SETTINGS;
}

/**
 * 功能：返回测试页使用的固定状态数据。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   { activeStatuses: MockStatus[] }：模拟状态集合
 */
function getDiceMetaEvent(): { activeStatuses: MockStatus[] } {
  return { activeStatuses: MOCK_ACTIVE_STATUSES };
}

/**
 * 功能：提供测试页使用的圆角提示样式。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   RuntimeToneStyle：状态提示样式
 */
function getRuntimeToneStyleEvent(): RuntimeToneStyle {
  return {
    border: "1px solid rgba(209,182,127,0.3)",
    background: "rgba(30,30,30,0.6)",
    color: "#d1b67f",
  };
}

/**
 * 功能：为测试页提供固定的骰子解析结果。
 *
 * 参数：
 *   _expression (string)：占位用的骰子表达式
 *
 * 返回：
 *   ParsedDiceResult：固定的骰子基础结构
 */
function parseDiceExpression(_expression: string): ParsedDiceResult {
  return {
    sides: 20,
    count: 1,
    modifier: 0,
    explode: false,
  };
}

/**
 * 功能：返回固定的技能修正值。
 *
 * 参数：
 *   _skillName (string)：技能名称
 *
 * 返回：
 *   number：固定修正值
 */
function resolveSkillModifierBySkillNameEvent(_skillName: string): number {
  return 0;
}

/**
 * 功能：在测试页中占位同步回合计时器。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function ensureRoundEventTimersSyncedEvent(): void {}

/**
 * 功能：在测试页中返回空的历史检定记录。
 *
 * 参数：
 *   _round (PendingRoundEvent)：测试回合
 *   _eventId (string)：事件标识
 *
 * 返回：
 *   EventRollRecordEvent | null：固定为空
 */
function getLatestRollRecordForEvent(
  _round: PendingRoundEvent,
  _eventId: string,
): EventRollRecordEvent | null {
  return null;
}

/**
 * 功能：返回测试页使用的空检定摘要。
 *
 * 参数：
 *   _record (EventRollRecordEvent)：检定记录
 *   _event (PendingRoundEvent["events"][number] | undefined)：事件数据
 *
 * 返回：
 *   string：空字符串
 */
function formatRollRecordSummaryEvent(
  _record: EventRollRecordEvent,
  _event?: PendingRoundEvent["events"][number],
): string {
  return "";
}

/**
 * 功能：为测试页补齐事件运行态视图依赖。
 *
 * 参数：
 *   round (PendingRoundEvent)：当前回合
 *   event (PendingRoundEvent["events"][number])：当前事件
 *   now (number | undefined)：当前时间戳
 *
 * 返回：
 *   ReturnType<typeof getEventRuntimeViewStateCore>：运行态展示信息
 */
function getEventRuntimeViewStateEvent(
  round: PendingRoundEvent,
  event: PendingRoundEvent["events"][number],
  now?: number,
): ReturnType<typeof getEventRuntimeViewStateCore> {
  return getEventRuntimeViewStateCore(
    round,
    event,
    {
      getSettingsEvent: getTestSettings,
      getLatestRollRecordForEvent,
      ensureRoundEventTimersSyncedEvent,
    },
    now,
  );
}

/**
 * 功能：返回测试页的基础渲染依赖。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   RenderDeps：渲染卡片所需依赖集合
 */
function createRenderDeps(): RenderDeps {
  return {
    getSettingsEvent: getTestSettings,
    getDiceMetaEvent,
    ensureRoundEventTimersSyncedEvent,
    getLatestRollRecordForEvent,
    getEventRuntimeViewStateEvent,
    getRuntimeToneStyleEvent,
    buildEventRolledPrefixTemplateEvent,
    buildEventRolledBlockTemplateEvent,
    formatRollRecordSummaryEvent,
    parseDiceExpression,
    resolveSkillModifierBySkillNameEvent,
    formatEventModifierBreakdownEvent,
    formatModifier,
    buildEventRollButtonTemplateEvent,
    buildEventListItemTemplateEvent,
    buildEventListCardTemplateEvent,
    escapeHtmlEvent,
    escapeAttrEvent,
    resolveTriggeredOutcomeEvent,
    buildRollsSummaryTemplateEvent,
    buildEventRollResultCardTemplateEvent,
    getDiceSvg: buildDiceSvgTemplateEvent,
    getRollingSvg: buildRollingSvgTemplateEvent,
    buildAlreadyRolledDiceVisualTemplateEvent,
  };
}

const DUMMY_DEPS = {
  getSettingsEvent: getTestSettings,
  OUTCOME_TEXT_MAX_LEN_Event: 400,
  ISO_8601_DURATION_REGEX_Event: /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/i,
};

/**
 * 功能：同步桌面与手机预览按钮的激活状态。
 *
 * 参数：
 *   mode (PreviewMode)：当前预览模式
 *
 * 返回：
 *   void：无返回值
 */
function updatePreviewModeButtons(mode: PreviewMode): void {
  const isDesktop = mode === "desktop";
  desktopModeButton.classList.toggle("is-active", isDesktop);
  mobileModeButton.classList.toggle("is-active", !isDesktop);
  desktopModeButton.setAttribute("aria-pressed", String(isDesktop));
  mobileModeButton.setAttribute("aria-pressed", String(!isDesktop));
}

function readStoredPreviewMode(): PreviewMode | null {
  try {
    const stored = window.localStorage.getItem(PREVIEW_MODE_STORAGE_KEY);
    return stored === "desktop" || stored === "mobile" ? stored : null;
  } catch {
    return null;
  }
}

function persistPreviewMode(mode: PreviewMode): void {
  try {
    window.localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, mode);
  } catch {}
}

/**
 * 功能：切换测试页的预览模式。
 *
 * 参数：
 *   mode (PreviewMode)：目标预览模式
 *
 * 返回：
 *   void：无返回值
 */
function setPreviewMode(mode: PreviewMode): void {
  body.dataset.previewMode = mode;
  updatePreviewModeButtons(mode);
  persistPreviewMode(mode);
}

/**
 * 功能：刷新侧栏开关文案与可访问性标签。
 *
 * 参数：
 *   collapsed (boolean)：侧栏是否收起
 *
 * 返回：
 *   void：无返回值
 */
function updateSidebarToggleLabels(collapsed: boolean): void {
  sidebarEdgeToggle.textContent = collapsed ? "展开" : "收起";
  sidebarEdgeToggle.setAttribute("aria-label", collapsed ? "展开输入面板" : "收起输入面板");
}

/**
 * 功能：设置左侧输入栏的展开或收起状态。
 *
 * 参数：
 *   collapsed (boolean)：是否收起
 *
 * 返回：
 *   void：无返回值
 */
function syncCodePanelToggleState(collapsed: boolean): void {
  const label = collapsed ? "展开代码" : "收起代码";
  const ariaLabel = collapsed ? "展开代码输入面板" : "收起代码输入面板";
  sidebarEdgeToggle.textContent = label;
  sidebarEdgeToggle.setAttribute("aria-label", ariaLabel);
  codePanelToggle.textContent = label;
  codePanelToggle.setAttribute("aria-label", ariaLabel);
  codePanelToggle.setAttribute("aria-pressed", String(!collapsed));
}

function readStoredSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function persistSidebarCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
  } catch {}
}

function setSidebarCollapsed(collapsed: boolean): void {
  body.classList.toggle("sidebar-collapsed", collapsed);
  updateSidebarToggleLabels(collapsed);
  syncCodePanelToggleState(collapsed);
  persistSidebarCollapsed(collapsed);
}

/**
 * 功能：在展开与收起之间切换左侧输入栏。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function toggleSidebar(): void {
  const collapsed = body.classList.contains("sidebar-collapsed");
  setSidebarCollapsed(!collapsed);
}

/**
 * 功能：根据测试事件构造一条模拟检定记录。
 *
 * 参数：
 *   roundId (string)：当前测试回合标识
 *   eventData (PendingRoundEvent["events"][number])：事件数据
 *   index (number)：事件序号
 *
 * 返回：
 *   EventRollRecordEvent：模拟的检定结果
 */
function buildMockRollRecord(
  roundId: string,
  eventData: PendingRoundEvent["events"][number],
  index: number,
): EventRollRecordEvent {
  const score = eventData.dc
    ? Math.max(1, Math.min(20, eventData.dc + (index % 2 === 0 ? 2 : -2)))
    : 12;
  const isSuccess = eventData.dc == null || score >= eventData.dc;

  return {
    rollId: "test_roll_" + index,
    roundId,
    eventId: eventData.id,
    eventTitle: eventData.title,
    targetLabelUsed: eventData.targetLabel,
    compareUsed: eventData.compare ?? ">=",
    dcUsed: eventData.dc ?? null,
    source: eventData.rollMode === "auto" ? "ai_auto_roll" : "manual_roll",
    rolledAt: Date.now(),
    diceExpr: eventData.checkDice,
    baseModifierUsed: 0,
    skillModifierApplied: 0,
    statusModifierApplied: 0,
    advantageStateApplied: eventData.advantageState ?? "normal",
    finalModifierUsed: 0,
    statusModifiersApplied: [],
    result: {
      expr: eventData.checkDice,
      rolls: [score],
      modifier: 0,
      rawTotal: score,
      total: score,
      sides: 20,
      count: 1,
      exploding: false,
      explosionTriggered: false,
    },
    success: isSuccess,
  };
}

/**
 * 功能：把未知错误整理成可展示文本。
 *
 * 参数：
 *   error (unknown)：捕获到的异常
 *
 * 返回：
 *   string：可渲染的错误文本
 */
function formatErrorText(error: unknown): string {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
}

/**
 * 功能：渲染测试页中的所有事件卡片。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function renderAll(): void {
  const text = input.value;
  const parsed = repairAndParseEventJsonEvent(text);
  if (!parsed) {
    preview.innerHTML = "<div style='color:#ff4d4f'>JSON 格式无法解析，请检查语法。</div>";
    return;
  }

  const env = normalizeEnvelopeEvent(parsed, DUMMY_DEPS);
  if (!env) {
    preview.innerHTML = "<div style='color:#ff4d4f'>未能提取出合法 RollHelper 事件包裹，请检查属性。</div>";
    return;
  }

  const round: PendingRoundEvent = {
    roundId: "test_round_" + Date.now().toString().slice(-4),
    events: env.events,
    status: "open",
    eventTimers: {},
    rolls: [],
    sourceAssistantMsgIds: [],
    openedAt: Date.now(),
  };

  try {
    const depsObj = createRenderDeps();
    const listHtml = buildListCardCore(round, depsObj);
    let blocks = `<div class="preview-section"><h3>未检定悬赏卡事件列表 (EventListCard)</h3>${listHtml}</div>`;

    for (const [index, eventData] of env.events.entries()) {
      const record = buildMockRollRecord(round.roundId, eventData, index);
      const resultHtml = buildResultCardCore(eventData, record, depsObj);

      blocks += `<div class="preview-section"><h3>实时结算结果卡片 (ResultCard)</h3>${resultHtml}</div>`;
    }

    preview.innerHTML = blocks;
    refreshEventCardMobileTitleMarqueeEvent(preview);
    requestAnimationFrame((): void => {
      refreshEventCardMobileTitleMarqueeEvent(preview);
    });
    window.setTimeout((): void => {
      refreshEventCardMobileTitleMarqueeEvent(preview);
    }, 120);
  } catch (error: unknown) {
    console.error(error);
    preview.innerHTML = `<div style='color:#ff4d4f; white-space: pre-wrap;'>渲染过程中发生崩溃：\n${formatErrorText(error)}</div>`;
  }
}

/**
 * 功能：处理重新渲染按钮点击。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function handleRenderButtonClick(): void {
  renderAll();
}

/**
 * 功能：切换到桌面预览模式。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function handleDesktopModeClick(): void {
  setPreviewMode("desktop");
  refreshEventCardMobileTitleMarqueeEvent(preview);
  requestAnimationFrame((): void => {
    refreshEventCardMobileTitleMarqueeEvent(preview);
  });
}

/**
 * 功能：切换到手机预览模式。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function handleMobileModeClick(): void {
  setPreviewMode("mobile");
  refreshEventCardMobileTitleMarqueeEvent(preview);
  requestAnimationFrame((): void => {
    refreshEventCardMobileTitleMarqueeEvent(preview);
  });
}

/**
 * 功能：处理侧栏开关点击。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function handleSidebarToggleClick(): void {
  toggleSidebar();
}

/**
 * 功能：绑定测试页所有交互按钮。
 *
 * 参数：
 *   无
 *
 * 返回：
 *   void：无返回值
 */
function bindWorkbenchControls(): void {
  renderButton.addEventListener("click", handleRenderButtonClick);
  desktopModeButton.addEventListener("click", handleDesktopModeClick);
  mobileModeButton.addEventListener("click", handleMobileModeClick);
  sidebarEdgeToggle.addEventListener("click", handleSidebarToggleClick);
  codePanelToggle.addEventListener("click", handleSidebarToggleClick);
}

bindWorkbenchControls();
setPreviewMode(readStoredPreviewMode() ?? "desktop");
setSidebarCollapsed(readStoredSidebarCollapsed());
renderAll();
ensureSharedTooltip();
