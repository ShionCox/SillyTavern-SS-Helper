import type {
  ActiveStatusEvent,
  StatusEditorRowDraftEvent,
  StatusScopeEvent,
} from "../types/eventDomainEvent";
import { readSdkPluginUiState, writeSdkPluginUiState } from "../../../SDK/settings";
import {
  isFallbackTavernChatEvent,
  listUnifiedTavernChatDirectoryEvent,
  parseAnyTavernChatRefEvent,
} from "../../../SDK/tavern";
import { buildSharedBoxCheckbox } from "../../../_Components/sharedBoxCheckbox";
import { buildSharedSelectField, hydrateSharedSelects } from "../../../_Components/sharedSelect";
import { buildSharedButton } from "../../../_Components/sharedButton";
import { buildSharedCheckboxCard } from "../../../_Components/sharedCheckbox";
import { buildSharedInputField } from "../../../_Components/sharedInput";
import { SDK_SETTINGS_NAMESPACE_Event } from "./constantsEvent";
import { applySettingsTooltipsEvent } from "./uiCardEvent";
import { syncThemeControlClassesByNodeEvent } from "./uiThemeEvent";

function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/\x60/g, "&#96;");
}

/**
 * 功能：构建状态编辑器字段外壳，供移动端显示字段标签。
 * @param label 字段标签
 * @param contentHtml 字段内容 HTML
 * @param className 额外类名
 * @returns 字段外壳 HTML
 */
function buildStatusEditorFieldShellEvent(
  label: string,
  contentHtml: string,
  className = ""
): string {
  const classes = ["st-roll-status-field", String(className ?? "").trim()].filter(Boolean).join(" ");
  return `
    <div class="${classes}">
      <span class="st-roll-status-field-label">${escapeHtml(label)}</span>
      <div class="st-roll-status-field-content">${contentHtml}</div>
    </div>
  `;
}

function buildStatusScopeSelectEvent(rowId: string, scope: StatusScopeEvent): string {
  return buildSharedSelectField({
    id: "st-roll-status-scope-" + rowId,
    value: scope === "all" ? "all" : "skills",
    containerClassName: "st-roll-status-scope-select",
    selectClassName: "st-roll-status-scope",
    selectAttributes: {
      "data-status-row-id": rowId,
      "data-status-field": "scope",
    },
    triggerAttributes: {
      "data-tip": "状态范围",
    },
    options: [
      { value: "skills", label: "按技能" },
      { value: "all", label: "全局" },
    ],
  });
}

let STATUS_EDITOR_ROWS_DRAFT_Event: StatusEditorRowDraftEvent[] = [];
let STATUS_EDITOR_LAST_SNAPSHOT_Event = "";
let STATUS_EDITOR_DIRTY_Event = false;
let STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "";
let STATUS_EDITOR_SELECTED_CHAT_KEY_Event = "";
let STATUS_EDITOR_CURRENT_CHAT_KEY_Event = "";
let STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：检测中";
let STATUS_EDITOR_OPEN_EVENT_BOUND_Event = false;
let STATUS_EDITOR_MOBILE_SHEET_STATE_Event: "closed" | "half" | "full" = "closed";
let STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event = false;
let STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event: number | null = null;
let STATUS_EDITOR_MOBILE_SHEET_DRAG_START_Y_Event = 0;
let STATUS_EDITOR_MOBILE_SHEET_DRAG_START_TRANSLATE_Event = 0;
let STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_Y_Event = 0;
let STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_TS_Event = 0;
let STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event = 0;
let STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event: (() => void) | null = null;
let STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event = 0;

type StatusEditorColKeyEvent = "name" | "modifier" | "duration" | "scope" | "skills" | "enabled" | "actions";

interface StatusEditorChatListItemEvent {
  chatKey: string;
  chatId: string;
  displayName: string;
  avatarUrl: string;
  scopeType: "character" | "group";
  scopeId: string;
  roleKey: string;
  updatedAt: number;
  activeStatusCount: number;
  isCurrent: boolean;
  fromRollLocal: boolean;
  fromHost: boolean;
  fromMemory: boolean;
}

interface StatusEditorChatDraftCacheEvent {
  rows: StatusEditorRowDraftEvent[];
  snapshot: string;
  metaSnapshot: string;
  dirty: boolean;
  updatedAt: number;
  activeStatusCount: number;
}

const STATUS_EDITOR_CHAT_DRAFT_CACHE_Event = new Map<string, StatusEditorChatDraftCacheEvent>();
let STATUS_EDITOR_CHAT_LIST_Event: StatusEditorChatListItemEvent[] = [];
let STATUS_EDITOR_CHAT_SEARCH_TEXT_Event = "";
let STATUS_EDITOR_CHAT_SOURCE_FILTER_Event: "all" | "current" | "local" | "memory" = "all";
let STATUS_EDITOR_ROW_SEARCH_TEXT_Event = "";
let STATUS_EDITOR_SCOPE_FILTER_Event: "all" | "skills" | "global" = "all";
let STATUS_EDITOR_ONLY_ENABLED_Event = false;
let STATUS_EDITOR_IS_REFRESHING_Event = false;
const STATUS_EDITOR_SELECTED_ROW_IDS_Event = new Set<string>();

const STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event = "st_roll_status_editor_layout_v1";
const STATUS_EDITOR_COL_MIN_WIDTH_Event: Record<StatusEditorColKeyEvent, number> = {
  name: 120,
  modifier: 72,
  duration: 90,
  scope: 90,
  skills: 160,
  enabled: 80,
  actions: 70,
};
const STATUS_EDITOR_COL_VAR_MAP_Event: Record<StatusEditorColKeyEvent, string> = {
  name: "--st-roll-status-col-name",
  modifier: "--st-roll-status-col-modifier",
  duration: "--st-roll-status-col-duration",
  scope: "--st-roll-status-col-scope",
  skills: "--st-roll-status-col-skills",
  enabled: "--st-roll-status-col-enabled",
  actions: "--st-roll-status-col-actions",
};

function getStatusEditorLayoutFromPanelEvent(panel: HTMLElement | null): HTMLElement | null {
  if (!panel) return null;
  return panel.querySelector(".st-roll-status-layout") as HTMLElement | null;
}

function normalizeStatusNameKeyLocalEvent(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeStatusSkillKeyLocalEvent(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function parseStatusSkillsTextToKeysEvent(raw: string): string[] {
  const source = String(raw ?? "").trim();
  if (!source) return [];
  const parts = source
    .split("|")
    .map((item) => normalizeStatusSkillKeyLocalEvent(item))
    .filter(Boolean);
  return Array.from(new Set(parts));
}

function createStatusEditorRowDraftEvent(
  name = "",
  modifierText = "",
  durationText = "",
  scope: StatusScopeEvent = "skills",
  skillsText = "",
  enabled = true
): StatusEditorRowDraftEvent {
  return {
    rowId: `status_row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    modifierText,
    durationText,
    scope,
    skillsText,
    enabled,
  };
}

function buildStatusDraftSnapshotEvent(rows: StatusEditorRowDraftEvent[]): string {
  return JSON.stringify(
    rows.map((row) => ({
      name: String(row.name ?? ""),
      modifierText: String(row.modifierText ?? ""),
      durationText: String(row.durationText ?? ""),
      scope: row.scope === "all" ? "all" : "skills",
      skillsText: String(row.skillsText ?? ""),
      enabled: row.enabled !== false,
    }))
  );
}

function buildStatusMetaSnapshotEvent(statuses: ActiveStatusEvent[]): string {
  return JSON.stringify(
    (Array.isArray(statuses) ? statuses : []).map((item) => ({
      name: String(item.name ?? ""),
      modifier: Number(item.modifier ?? 0),
      scope: item.scope === "all" ? "all" : "skills",
      skills: item.scope === "all" ? [] : (Array.isArray(item.skills) ? item.skills : []),
      remainingRounds: item.remainingRounds == null ? null : Number(item.remainingRounds),
      enabled: item.enabled !== false,
    }))
  );
}

function getStatusEditorModalPanelEvent(rowsWrapId: string): HTMLElement | null {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  return rowsWrap?.closest(".st-roll-status-modal-panel") as HTMLElement | null;
}

export function renderStatusValidationErrorsEvent(errorWrapId: string, errors: string[]): void {
  const wrap = document.getElementById(errorWrapId) as HTMLElement | null;
  if (!wrap) return;
  if (!errors.length) {
    wrap.hidden = true;
    wrap.innerHTML = "";
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = errors
    .map((item) => `<div class="st-roll-status-error-item">${escapeHtml(item)}</div>`)
    .join("");
}

/**
 * 功能：根据当前工作台筛选条件返回可见的状态草稿行。
 * @param rows 全量状态草稿行
 * @returns 过滤后的状态草稿行列表
 */
function getVisibleStatusEditorRowsEvent(rows: StatusEditorRowDraftEvent[]): StatusEditorRowDraftEvent[] {
  const keyword = String(STATUS_EDITOR_ROW_SEARCH_TEXT_Event ?? "").trim().toLowerCase();
  return rows.filter((row) => {
    if (STATUS_EDITOR_ONLY_ENABLED_Event && row.enabled === false) return false;
    if (STATUS_EDITOR_SCOPE_FILTER_Event === "skills" && row.scope !== "skills") return false;
    if (STATUS_EDITOR_SCOPE_FILTER_Event === "global" && row.scope !== "all") return false;
    if (!keyword) return true;
    return String(row.name ?? "").trim().toLowerCase().includes(keyword);
  });
}

/**
 * 功能：根据当前工作台筛选条件返回可见的聊天列表。
 * @returns 过滤后的聊天列表
 */
function getVisibleStatusEditorChatListEvent(): StatusEditorChatListItemEvent[] {
  const keyword = String(STATUS_EDITOR_CHAT_SEARCH_TEXT_Event ?? "").trim().toLowerCase();
  return STATUS_EDITOR_CHAT_LIST_Event.filter((item) => {
    if (STATUS_EDITOR_CHAT_SOURCE_FILTER_Event === "current" && !item.isCurrent) return false;
    if (STATUS_EDITOR_CHAT_SOURCE_FILTER_Event === "local" && !item.fromRollLocal) return false;
    if (STATUS_EDITOR_CHAT_SOURCE_FILTER_Event === "memory" && !item.fromMemory) return false;
    if (!keyword) return true;
    const chatId = String(item.chatId ?? "").toLowerCase();
    const name = String(item.displayName ?? "").toLowerCase();
    return chatId.includes(keyword) || name.includes(keyword);
  });
}

/**
 * 功能：同步状态编辑器工作台按钮与选择统计。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function syncStatusWorkbenchToolbarStateEvent(rowsWrapId: string): void {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  const modal = rowsWrap?.closest(".st-roll-status-modal") as HTMLElement | null;
  if (!rowsWrap || !modal) return;

  const validIds = new Set(STATUS_EDITOR_ROWS_DRAFT_Event.map((row) => String(row.rowId ?? "")));
  Array.from(STATUS_EDITOR_SELECTED_ROW_IDS_Event).forEach((rowId) => {
    if (!validIds.has(rowId)) {
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.delete(rowId);
    }
  });

  const visibleRows = getVisibleStatusEditorRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
  const visibleSelectedCount = visibleRows.filter((row) =>
    STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? ""))
  ).length;
  const selectedCount = STATUS_EDITOR_SELECTED_ROW_IDS_Event.size;
  const countNode = modal.querySelector(".st-roll-status-selection-count") as HTMLElement | null;
  if (countNode) {
    countNode.textContent =
      visibleSelectedCount > 0 && visibleSelectedCount !== selectedCount
        ? `已选 ${selectedCount} 项（可见 ${visibleSelectedCount} 项）`
        : `已选 ${selectedCount} 项`;
  }

  [
    ".st-roll-status-batch-enable",
    ".st-roll-status-batch-disable",
    ".st-roll-status-batch-delete",
  ].forEach((selector) => {
    const button = modal.querySelector(selector) as HTMLButtonElement | null;
    if (button) button.disabled = selectedCount <= 0;
  });

  const selectVisibleBtn = modal.querySelector(".st-roll-status-select-visible") as HTMLButtonElement | null;
  if (selectVisibleBtn) selectVisibleBtn.disabled = visibleRows.length <= 0;
}

/**
 * 功能：同步状态编辑器刷新按钮状态。
 * @param refreshBtnId 刷新按钮 ID
 * @returns 无返回值
 */
function syncStatusRefreshButtonStateEvent(refreshBtnId: string): void {
  const refreshBtn = document.getElementById(refreshBtnId) as HTMLButtonElement | null;
  if (!refreshBtn) return;
  refreshBtn.disabled = STATUS_EDITOR_IS_REFRESHING_Event;
  const label = refreshBtn.querySelector(".stx-shared-button-label") as HTMLElement | null;
  if (label) {
    label.textContent = STATUS_EDITOR_IS_REFRESHING_Event ? "刷新中" : "刷新";
  }
}

/**
 * 功能：同步移动端状态编辑抽屉的开合状态。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function clampStatusMobileSheetValueEvent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (min > max) return min;
  return Math.max(min, Math.min(max, value));
}

function resolveStatusMobileSheetNodesEvent(rowsWrapId: string): {
  modal: HTMLElement;
  layout: HTMLElement | null;
  body: HTMLElement | null;
} | null {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  const modal = rowsWrap?.closest(".st-roll-status-modal") as HTMLElement | null;
  if (!modal) return null;
  const main = modal.querySelector(".st-roll-status-main") as HTMLElement | null;
  if (!main) return null;
  const layout = modal.querySelector(".st-roll-status-layout") as HTMLElement | null;
  const body = modal.querySelector(".st-roll-status-modal-body") as HTMLElement | null;
  return { modal, layout, body };
}

function buildStatusMobileSheetMetricsEvent(rowsWrapId: string): {
  fullHeight: number;
  halfTranslate: number;
  closedTranslate: number;
} {
  const nodes = resolveStatusMobileSheetNodesEvent(rowsWrapId);
  const hostHeightRaw = Number(
    nodes?.layout?.clientHeight ??
      nodes?.body?.clientHeight ??
      window.visualViewport?.height ??
      window.innerHeight ??
      0
  );
  const hostHeight = clampStatusMobileSheetValueEvent(Math.round(hostHeightRaw), 320, 2000);
  const topGap = 8;
  const fullHeight = clampStatusMobileSheetValueEvent(
    hostHeight - topGap,
    280,
    hostHeight
  );
  const halfHeight = clampStatusMobileSheetValueEvent(
    Math.round(hostHeight * 0.5),
    240,
    Math.max(240, fullHeight - 56)
  );
  const halfTranslate = Math.max(0, Math.round(fullHeight - halfHeight));
  const closedTranslate = Math.max(Math.round(fullHeight + 72), halfTranslate + 120);
  return { fullHeight, halfTranslate, closedTranslate };
}

function getStatusMobileSheetTranslateByStateEvent(
  state: "closed" | "half" | "full",
  metrics: {
    fullHeight: number;
    halfTranslate: number;
    closedTranslate: number;
  }
): number {
  if (state === "full") return 0;
  if (state === "half") return metrics.halfTranslate;
  return metrics.closedTranslate;
}

function resolveStatusMobileSheetStateByReleaseEvent(
  translate: number,
  velocityY: number,
  metrics: {
    fullHeight: number;
    halfTranslate: number;
    closedTranslate: number;
  }
): "closed" | "half" | "full" {
  const closeThreshold =
    metrics.halfTranslate + (metrics.closedTranslate - metrics.halfTranslate) * 0.42;
  if (translate >= closeThreshold || velocityY >= 1.05) return "closed";
  if (velocityY <= -0.9) return "full";
  if (velocityY >= 0.85) return "half";
  const fullDistance = Math.abs(translate);
  const halfDistance = Math.abs(translate - metrics.halfTranslate);
  return fullDistance <= halfDistance ? "full" : "half";
}

function syncStatusMobileSheetStateEvent(rowsWrapId: string): {
  fullHeight: number;
  halfTranslate: number;
  closedTranslate: number;
} | null {
  const nodes = resolveStatusMobileSheetNodesEvent(rowsWrapId);
  if (!nodes) return null;

  const metrics = buildStatusMobileSheetMetricsEvent(rowsWrapId);
  const targetTranslate = getStatusMobileSheetTranslateByStateEvent(
    STATUS_EDITOR_MOBILE_SHEET_STATE_Event,
    metrics
  );
  const nextTranslate = STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event
    ? STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event
    : targetTranslate;
  STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event = clampStatusMobileSheetValueEvent(
    nextTranslate,
    0,
    metrics.closedTranslate
  );

  const openProgress =
    metrics.closedTranslate <= 0
      ? 0
      : clampStatusMobileSheetValueEvent(
        1 - STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event / metrics.closedTranslate,
        0,
        1
      );

  nodes.modal.dataset.mobileSheetState = STATUS_EDITOR_MOBILE_SHEET_STATE_Event;
  nodes.modal.classList.toggle(
    "is-mobile-sheet-open",
    STATUS_EDITOR_MOBILE_SHEET_STATE_Event !== "closed"
  );
  nodes.modal.classList.toggle(
    "is-mobile-sheet-expanded",
    STATUS_EDITOR_MOBILE_SHEET_STATE_Event === "full"
  );
  nodes.modal.classList.toggle("is-mobile-sheet-dragging", STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event);
  nodes.modal.style.setProperty("--st-roll-status-mobile-sheet-height", `${metrics.fullHeight}px`);
  nodes.modal.style.setProperty(
    "--st-roll-status-mobile-sheet-translate",
    `${STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event}px`
  );
  nodes.modal.style.setProperty(
    "--st-roll-status-mobile-sheet-backdrop-opacity",
    openProgress.toFixed(3)
  );
  return metrics;
}

function setStatusMobileSheetStateEvent(
  rowsWrapId: string,
  state: "closed" | "half" | "full"
): void {
  STATUS_EDITOR_MOBILE_SHEET_STATE_Event = state;
  STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event = false;
  STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event = null;
  syncStatusMobileSheetStateEvent(rowsWrapId);
}

/**
 * 功能：打开移动端状态编辑抽屉。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function openStatusMobileSheetEvent(rowsWrapId: string): void {
  setStatusMobileSheetStateEvent(rowsWrapId, "half");
}

/**
 * 功能：关闭移动端状态编辑抽屉。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function closeStatusMobileSheetEvent(rowsWrapId: string): void {
  setStatusMobileSheetStateEvent(rowsWrapId, "closed");
}

/**
 * 功能：展开移动端状态编辑抽屉到接近全屏。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function expandStatusMobileSheetEvent(rowsWrapId: string): void {
  setStatusMobileSheetStateEvent(rowsWrapId, "full");
}

/**
 * 功能：收起移动端状态编辑抽屉的扩展高度。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function collapseStatusMobileSheetExpandedEvent(rowsWrapId: string): void {
  setStatusMobileSheetStateEvent(rowsWrapId, "half");
}

/**
 * 功能：切换移动端状态编辑抽屉的扩展高度。
 * @param rowsWrapId 状态行容器 ID
 * @returns 无返回值
 */
function toggleStatusMobileSheetExpandedEvent(rowsWrapId: string): void {
  if (STATUS_EDITOR_MOBILE_SHEET_STATE_Event === "closed") {
    openStatusMobileSheetEvent(rowsWrapId);
    return;
  }
  if (STATUS_EDITOR_MOBILE_SHEET_STATE_Event === "full") {
    collapseStatusMobileSheetExpandedEvent(rowsWrapId);
    return;
  }
  expandStatusMobileSheetEvent(rowsWrapId);
}

function setStatusDraftDirtyEvent(flag: boolean, dirtyHintId: string): void {
  STATUS_EDITOR_DIRTY_Event = Boolean(flag);
  const dirtyHint = document.getElementById(dirtyHintId) as HTMLElement | null;
  if (dirtyHint) {
    dirtyHint.hidden = !STATUS_EDITOR_DIRTY_Event;
  }
}

function renderStatusRowsEvent(rowsWrapId: string): void {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  if (!rowsWrap) return;
  const visibleRows = getVisibleStatusEditorRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
  syncStatusWorkbenchToolbarStateEvent(rowsWrapId);
  if (!STATUS_EDITOR_ROWS_DRAFT_Event.length) {
    rowsWrap.innerHTML = `<div class="st-roll-status-empty">暂无状态，点击“新增状态”开始配置。</div>`;
    syncThemeControlClassesByNodeEvent(rowsWrap);
    applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-status-modal") || rowsWrap);
    return;
  }
  if (!visibleRows.length) {
    rowsWrap.innerHTML = `<div class="st-roll-status-empty">没有匹配的状态</div>`;
    syncThemeControlClassesByNodeEvent(rowsWrap);
    applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-status-modal") || rowsWrap);
    return;
  }
  const renderedRowsHtml = visibleRows
    .map((row) => {
      const rowId = escapeAttr(String(row.rowId ?? ""));
      const name = escapeAttr(String(row.name ?? ""));
      const modifierText = escapeAttr(String(row.modifierText ?? ""));
      const durationText = escapeAttr(String(row.durationText ?? ""));
      const scope = row.scope === "all" ? "all" : "skills";
      const skillsText = escapeAttr(String(row.skillsText ?? ""));
      const enabled = row.enabled !== false;
      const skillsPlaceholder = scope === "all" ? "范围为全局时会忽略此项" : "例如：反应|潜行";

      const nameFieldHtml = buildStatusEditorFieldShellEvent(
        "名称",
        `
          <div class="st-roll-status-name-wrap">
            ${buildSharedBoxCheckbox({
              id: `st-roll-status-row-select-${rowId}`,
              containerClassName: "st-roll-status-row-select",
              attributes: {
                "data-tip": "选择这条状态",
              },
              inputAttributes: {
                "data-status-select-id": rowId,
                checked: STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")),
              },
            })}
            ${buildSharedInputField({
              value: name,
              className: "st-roll-status-name",
              attributes: {
                "data-status-row-id": rowId,
                "data-status-field": "name",
                "data-tip": "状态名称。",
                placeholder: "状态名称",
              },
            })}
          </div>
        `,
        "st-roll-status-field-name"
      );
      const modifierFieldHtml = buildStatusEditorFieldShellEvent(
        "修正",
        buildSharedInputField({
          value: modifierText,
          type: "number",
          className: "st-roll-status-modifier",
          attributes: {
            inputmode: "numeric",
            step: 1,
            "data-status-row-id": rowId,
            "data-status-field": "modifier",
            "data-tip": "状态加减值，必须是整数。",
            placeholder: "例如 -2",
          },
        }),
        "st-roll-status-field-modifier"
      );
      const durationFieldHtml = buildStatusEditorFieldShellEvent(
        "轮次",
        buildSharedInputField({
          value: durationText,
          type: "number",
          className: "st-roll-status-duration",
          attributes: {
            inputmode: "numeric",
            min: 1,
            step: 1,
            "data-status-row-id": rowId,
            "data-status-field": "duration",
            "data-tip": "持续轮次，留空表示永久。",
            placeholder: "留空=永久，例如 3",
          },
        }),
        "st-roll-status-field-duration"
      );
      const scopeFieldHtml = buildStatusEditorFieldShellEvent(
        "范围",
        buildStatusScopeSelectEvent(rowId, scope),
        "st-roll-status-field-scope"
      );
      const skillsFieldHtml = buildStatusEditorFieldShellEvent(
        "技能",
        buildSharedInputField({
          value: skillsText,
          className: "st-roll-status-skills",
          disabled: scope === "all",
          attributes: {
            "data-status-row-id": rowId,
            "data-status-field": "skills",
            "data-tip": "技能范围，用 | 分隔。",
            placeholder: skillsPlaceholder,
          },
        }),
        "st-roll-status-field-skills"
      );
      const enabledFieldHtml = buildStatusEditorFieldShellEvent(
        "",
        buildSharedCheckboxCard({
          id: `st-roll-status-enabled-${rowId}`,
          title: "启用",
          checkedLabel: "开",
          uncheckedLabel: "关",
          containerClassName: "st-roll-status-enabled-card",
          copyClassName: "st-roll-status-enabled-copy",
          titleClassName: "st-roll-status-enabled-title",
          controlClassName: "st-roll-status-enabled-control",
          inputAttributes: {
            "data-status-row-id": rowId,
            "data-status-field": "enabled",
            "data-tip": "是否启用该状态。",
            checked: enabled,
          },
        }),
        "st-roll-status-field-enabled"
      );
      const actionsFieldHtml = buildStatusEditorFieldShellEvent(
        "操作",
        `
          <div class="st-roll-status-actions-group">
            ${buildSharedButton({
              label: "复制",
              variant: "secondary",
              iconClassName: "fa-solid fa-copy",
              className: "st-roll-status-duplicate st-roll-toolbar-icon-btn",
              attributes: {
                "data-status-duplicate-id": rowId,
                "data-tip": "复制这条状态。",
                "aria-label": "复制状态",
              },
            })}
            ${buildSharedButton({
              label: "删除",
              variant: "danger",
              iconClassName: "fa-solid fa-trash",
              className: "st-roll-status-remove st-roll-toolbar-icon-btn",
              attributes: {
                "data-status-remove-id": rowId,
                "data-tip": "删除这条状态。",
                "aria-label": "删除状态",
              },
            })}
          </div>
        `,
        "st-roll-status-field-actions"
      );

      return `
        <div class="st-roll-status-row" data-row-id="${rowId}">
          ${nameFieldHtml}
          ${modifierFieldHtml}
          ${durationFieldHtml}
          ${scopeFieldHtml}
          ${skillsFieldHtml}
          <div class="st-roll-status-bottom-grid">
            ${enabledFieldHtml}
            ${actionsFieldHtml}
          </div>
        </div>
      `;
    })
    .join("");
  rowsWrap.innerHTML = renderedRowsHtml;
  hydrateSharedSelects(rowsWrap);
  syncThemeControlClassesByNodeEvent(rowsWrap);
  applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-status-modal") || rowsWrap);
  return;
  rowsWrap.innerHTML = visibleRows
    .map((row) => {
      const rowId = escapeAttr(String(row.rowId ?? ""));
      const name = escapeAttr(String(row.name ?? ""));
      const modifierText = escapeAttr(String(row.modifierText ?? ""));
      const durationText = escapeAttr(String(row.durationText ?? ""));
      const scope = row.scope === "all" ? "all" : "skills";
      const skillsText = escapeAttr(String(row.skillsText ?? ""));
      const enabled = row.enabled !== false;
      const skillsPlaceholder = scope === "all" ? "范围为全局时会忽略此项" : "例如：潜行|察觉";
      return `
        <div class="st-roll-status-row" data-row-id="${rowId}">
          <div class="st-roll-status-name-wrap">
            ${buildSharedBoxCheckbox({
              id: `st-roll-status-row-select-${rowId}-legacy`,
              containerClassName: "st-roll-status-row-select",
              attributes: {
                "data-tip": "选择这条状态",
              },
              inputAttributes: {
                "data-status-select-id": rowId,
                checked: STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")),
              },
            })}
            ${buildSharedInputField({
              value: name,
              className: "st-roll-status-name",
              attributes: {
                "data-status-row-id": rowId,
                "data-status-field": "name",
                "data-tip": "状态名称。",
                placeholder: "状态名称",
              },
            })}
          </div>
          ${buildSharedInputField({
            value: modifierText,
            type: "number",
            className: "st-roll-status-modifier",
            attributes: {
              inputmode: "numeric",
              step: 1,
              "data-status-row-id": rowId,
              "data-status-field": "modifier",
              "data-tip": "状态加减值（整数）。",
              placeholder: "例如 -2",
            },
          })}
          ${buildSharedInputField({
            value: durationText,
            type: "number",
            className: "st-roll-status-duration",
            attributes: {
              inputmode: "numeric",
              min: 1,
              step: 1,
              "data-status-row-id": rowId,
              "data-status-field": "duration",
              "data-tip": "持续轮次，留空表示永久。",
              placeholder: "留空=永久，例如 3",
            },
          })}
          ${buildStatusScopeSelectEvent(rowId, scope)}
          ${buildSharedInputField({
            value: skillsText,
            className: "st-roll-status-skills",
            disabled: scope === "all",
            attributes: {
              "data-status-row-id": rowId,
              "data-status-field": "skills",
              "data-tip": "技能范围，用 | 分隔。",
              placeholder: skillsPlaceholder,
            },
          })}
          <label class="st-roll-status-enabled-wrap">
            <input type="checkbox" data-status-row-id="${rowId}" data-status-field="enabled" data-tip="是否启用该状态。" ${enabled ? "checked" : ""} />
            <span>启用</span>
          </label>
          <div class="st-roll-status-actions-group">
            ${buildSharedButton({
              label: "复制",
              variant: "secondary",
              iconClassName: "fa-solid fa-copy",
              className: "st-roll-status-duplicate st-roll-toolbar-icon-btn",
              attributes: {
                "data-status-duplicate-id": rowId,
                "data-tip": "复制这条状态",
                "aria-label": "复制状态",
              },
            })}
            ${buildSharedButton({
              label: "删除",
              variant: "danger",
              iconClassName: "fa-solid fa-trash",
              className: "st-roll-status-remove st-roll-toolbar-icon-btn",
              attributes: {
                "data-status-remove-id": rowId,
                "data-tip": "删除这条状态",
                "aria-label": "删除状态",
              },
            })}
          </div>
        </div>
      `;
    })
    .join("");
  hydrateSharedSelects(rowsWrap);
  syncThemeControlClassesByNodeEvent(rowsWrap);
  applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-status-modal") || rowsWrap);
}

function deserializeActiveStatusesToDraftRowsEvent(statuses: ActiveStatusEvent[]): StatusEditorRowDraftEvent[] {
  return (Array.isArray(statuses) ? statuses : []).map((status) =>
    createStatusEditorRowDraftEvent(
      String(status.name ?? ""),
      String(status.modifier ?? 0),
      status.remainingRounds == null ? "" : String(status.remainingRounds),
      status.scope === "all" ? "all" : "skills",
      status.scope === "all" ? "" : (Array.isArray(status.skills) ? status.skills : []).join("|"),
      status.enabled !== false
    )
  );
}

function validateStatusRowsEvent(
  rows: StatusEditorRowDraftEvent[],
  existingStatuses: ActiveStatusEvent[]
): { errors: string[]; statuses: ActiveStatusEvent[] } {
  const errors: string[] = [];
  const statuses: ActiveStatusEvent[] = [];
  const seen = new Map<string, number>();
  const existingMap = new Map<string, ActiveStatusEvent>();
  for (const item of existingStatuses || []) {
    const key = normalizeStatusNameKeyLocalEvent(item.name);
    if (key) existingMap.set(key, item);
  }
  const integerPattern = /^[+-]?\d+$/;
  const now = Date.now();

  rows.forEach((row, index) => {
    const rowNo = index + 1;
    const name = String(row.name ?? "").trim();
    const nameKey = normalizeStatusNameKeyLocalEvent(name);
    const modifierText = String(row.modifierText ?? "").trim();
    const durationText = String(row.durationText ?? "").trim();
    const scope: StatusScopeEvent = row.scope === "all" ? "all" : "skills";
    const skills = scope === "all" ? [] : parseStatusSkillsTextToKeysEvent(String(row.skillsText ?? ""));
    let hasError = false;

    if (!name) {
      errors.push(`第 ${rowNo} 行：名称不能为空`);
      hasError = true;
    }
    if (nameKey) {
      const firstRow = seen.get(nameKey);
      if (firstRow != null) {
        errors.push(`第 ${rowNo} 行：名称与第 ${firstRow + 1} 行重复`);
        hasError = true;
      } else {
        seen.set(nameKey, index);
      }
    }
    if (!modifierText) {
      errors.push(`第 ${rowNo} 行：修正值不能为空`);
      hasError = true;
    } else if (!integerPattern.test(modifierText)) {
      errors.push(`第 ${rowNo} 行：修正值必须为整数`);
      hasError = true;
    }

    let remainingRounds: number | null = null;
    if (durationText) {
      if (!integerPattern.test(durationText)) {
        errors.push(`第 ${rowNo} 行：持续轮次必须为整数（留空表示永久）`);
        hasError = true;
      } else {
        const parsedRounds = Math.floor(Number(durationText));
        if (!Number.isFinite(parsedRounds) || parsedRounds < 1) {
          errors.push(`第 ${rowNo} 行：持续轮次必须 >= 1（留空表示永久）`);
          hasError = true;
        } else {
          remainingRounds = parsedRounds;
        }
      }
    }

    if (scope === "skills" && skills.length <= 0) {
      errors.push(`第 ${rowNo} 行：范围为“按技能”时，技能列表不能为空`);
      hasError = true;
    }
    if (hasError) return;

    const modifier = Number(modifierText);
    const prev = existingMap.get(nameKey);
    statuses.push({
      name,
      modifier,
      remainingRounds,
      scope,
      skills,
      enabled: row.enabled !== false,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      source: "manual_editor",
    });
  });

  return { errors, statuses };
}

function hydrateStatusDraftFromMetaEvent(
  statuses: ActiveStatusEvent[],
  rowsWrapId: string,
  dirtyHintId: string,
  force = false
): void {
  const rowsWrap = document.getElementById(rowsWrapId) as HTMLElement | null;
  const metaSnapshot = JSON.stringify(
    (Array.isArray(statuses) ? statuses : []).map((item) => ({
      name: item.name,
      modifier: item.modifier,
      scope: item.scope,
      skills: item.scope === "all" ? [] : item.skills,
      remainingRounds: item.remainingRounds ?? null,
        enabled: item.enabled !== false,
    }))
  );
  if (!force && STATUS_EDITOR_DIRTY_Event && rowsWrap?.hasChildNodes()) return;
  if (!force && metaSnapshot === STATUS_EDITOR_LAST_META_SNAPSHOT_Event && rowsWrap?.hasChildNodes()) return;

  STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
  STATUS_EDITOR_ROWS_DRAFT_Event = deserializeActiveStatusesToDraftRowsEvent(statuses);
  STATUS_EDITOR_LAST_SNAPSHOT_Event = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
  STATUS_EDITOR_LAST_META_SNAPSHOT_Event = metaSnapshot;
  setStatusDraftDirtyEvent(false, dirtyHintId);
  renderStatusRowsEvent(rowsWrapId);
}

export interface BindStatusEditorActionsDepsEvent {
  SETTINGS_STATUS_ROWS_ID_Event: string;
  SETTINGS_STATUS_ADD_ID_Event: string;
  SETTINGS_STATUS_SAVE_ID_Event: string;
  SETTINGS_STATUS_RESET_ID_Event: string;
  SETTINGS_STATUS_REFRESH_ID_Event: string;
  SETTINGS_STATUS_CLEAN_UNUSED_ID_Event: string;
  SETTINGS_STATUS_ERRORS_ID_Event: string;
  SETTINGS_STATUS_DIRTY_HINT_ID_Event: string;
  SETTINGS_STATUS_SPLITTER_ID_Event: string;
  SETTINGS_STATUS_COLS_ID_Event: string;
  SETTINGS_STATUS_CHAT_LIST_ID_Event: string;
  SETTINGS_STATUS_CHAT_META_ID_Event: string;
  SETTINGS_STATUS_MEMORY_STATE_ID_Event: string;
  getActiveStatusesEvent: () => ActiveStatusEvent[];
  setActiveStatusesEvent: (statuses: ActiveStatusEvent[]) => void;
  getActiveChatKeyEvent: () => string;
  listHostChatsForCurrentScopeEvent: () => Promise<
    Array<{
      chatKey: string;
      updatedAt: number;
      chatId: string;
      displayName: string;
      avatarUrl: string;
      scopeType: "character" | "group";
      scopeId: string;
      roleKey: string;
    }>
  >;
  listChatScopedStatusSummariesEvent: () => Promise<Array<{ chatKey: string; updatedAt: number; activeStatusCount: number }>>;
  loadStatusesForChatKeyEvent: (chatKey: string) => Promise<ActiveStatusEvent[]>;
  saveStatusesForChatKeyEvent: (chatKey: string, statuses: ActiveStatusEvent[]) => Promise<void>;
  cleanupUnusedChatStatesForCurrentTavernEvent: (retainChatKeys: string[]) => Promise<{
    deletedCount: number;
    deletedChatKeys: string[];
  }>;
  probeMemoryPluginEvent: (timeoutMs?: number) => Promise<{
    available: boolean;
    enabled: boolean;
    pluginId: string;
    version: string;
    capabilities: string[];
  }>;
  fetchMemoryChatKeysEvent: (timeoutMs?: number) => Promise<{ chatKeys: string[]; updatedAt: number | null }>;
  subscribeMemoryPluginStateEvent: (
    handler: (payload: { enabled: boolean; pluginId: string }) => void
  ) => () => void;
  syncSettingsUiEvent?: () => void;
  pushToChat?: (message: string) => void;
}

interface StatusEditorLayoutPrefsEvent {
  sidebarWidth?: number;
  columns?: Partial<Record<StatusEditorColKeyEvent, number>>;
}

function clampStatusEditorValueEvent(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function readStatusEditorLayoutPrefsEvent(): StatusEditorLayoutPrefsEvent {
  const parsed = readSdkPluginUiState<StatusEditorLayoutPrefsEvent | null>(
    SDK_SETTINGS_NAMESPACE_Event,
    STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event,
    null
  );
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

function saveStatusEditorLayoutPrefsEvent(next: StatusEditorLayoutPrefsEvent): void {
  writeSdkPluginUiState(
    SDK_SETTINGS_NAMESPACE_Event,
    STATUS_EDITOR_LAYOUT_STORAGE_KEY_Event,
    next
  );
}

function applyStatusEditorLayoutPrefsEvent(rowsWrapId: string): void {
  const panel = getStatusEditorModalPanelEvent(rowsWrapId);
  if (!panel) return;
  const layout = getStatusEditorLayoutFromPanelEvent(panel);
  const prefs = readStatusEditorLayoutPrefsEvent();
  const sidebarWidth = Number(prefs.sidebarWidth);
  if (Number.isFinite(sidebarWidth)) {
    const clamped = clampStatusEditorValueEvent(sidebarWidth, 220, 520);
    layout?.style.setProperty("--st-roll-status-sidebar-width", `${clamped}px`);
    panel.style.setProperty("--st-roll-status-sidebar-width", `${clamped}px`);
  }
  const columns = prefs.columns ?? {};
  (Object.keys(STATUS_EDITOR_COL_VAR_MAP_Event) as StatusEditorColKeyEvent[]).forEach((key) => {
    const width = Number(columns[key]);
    if (!Number.isFinite(width)) return;
    const clamped = clampStatusEditorValueEvent(width, STATUS_EDITOR_COL_MIN_WIDTH_Event[key], 520);
    panel.style.setProperty(STATUS_EDITOR_COL_VAR_MAP_Event[key], `${clamped}px`);
  });
}

function resolveStatusEditorPanelFromElementEvent(
  element: HTMLElement,
  rowsWrapId: string
): HTMLElement | null {
  const fromElement = element.closest(".st-roll-status-modal-panel") as HTMLElement | null;
  if (fromElement) return fromElement;
  return getStatusEditorModalPanelEvent(rowsWrapId);
}

function bindStatusEditorSplitterResizeEvent(splitter: HTMLElement, rowsWrapId: string): void {
  if (splitter.dataset.statusSplitterResizeBound === "1") return;
  splitter.dataset.statusSplitterResizeBound = "1";
  splitter.style.touchAction = "none";

  let activePanel: HTMLElement | null = null;
  let activeLayout: HTMLElement | null = null;
  let activePointerId: number | null = null;
  let startX = 0;
  let startWidth = 300;
  let isResizing = false;

  const updateWidth = (clientX: number): void => {
    if (!isResizing || !activePanel) return;
    const width = clampStatusEditorValueEvent(startWidth + (clientX - startX), 220, 520);
    activeLayout?.style.setProperty("--st-roll-status-sidebar-width", `${width}px`);
    activePanel.style.setProperty("--st-roll-status-sidebar-width", `${width}px`);
  };

  const persistWidth = (): void => {
    if (!activePanel) return;
    const widthNode = activeLayout || activePanel;
    const width = Number.parseFloat(
      getComputedStyle(widthNode).getPropertyValue("--st-roll-status-sidebar-width")
    );
    if (!Number.isFinite(width)) return;
    const prev = readStatusEditorLayoutPrefsEvent();
    saveStatusEditorLayoutPrefsEvent({
      ...prev,
      sidebarWidth: width,
    });
  };

  const cleanup = (shouldPersist: boolean): void => {
    if (!isResizing) return;
    if (shouldPersist) persistWidth();
    isResizing = false;
    splitter.classList.remove("is-resizing");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    if (activePointerId != null) {
      try {
        if (splitter.hasPointerCapture(activePointerId)) {
          splitter.releasePointerCapture(activePointerId);
        }
      } catch {
        // noop
      }
    }
    activePointerId = null;
    activeLayout = null;
    activePanel = null;
  };

  const beginResize = (clientX: number, pointerId: number | null): void => {
    const panel = resolveStatusEditorPanelFromElementEvent(splitter, rowsWrapId);
    if (!panel) return;
    activePanel = panel;
    activeLayout = getStatusEditorLayoutFromPanelEvent(panel);
    activePointerId = pointerId;
    startX = clientX;
    const sidebar = splitter.previousElementSibling as HTMLElement | null;
    startWidth = Math.max(220, Math.round(sidebar?.getBoundingClientRect().width ?? 300));
    isResizing = true;
    splitter.classList.add("is-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    if (pointerId != null) {
      try {
        splitter.setPointerCapture(pointerId);
      } catch {
        // noop
      }
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    updateWidth(event.clientX);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    cleanup(true);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    cleanup(false);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!isResizing || activePointerId != null) return;
    updateWidth(event.clientX);
  };

  const onMouseUp = (): void => {
    if (!isResizing || activePointerId != null) return;
    cleanup(true);
  };

  splitter.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    if (isResizing) cleanup(false);
    beginResize(event.clientX, event.pointerId);
  });

  splitter.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (isResizing) return;
    event.preventDefault();
    event.stopPropagation();
    beginResize(event.clientX, null);
  });
}

function bindStatusEditorColumnResizeEvent(colsWrap: HTMLElement, rowsWrapId: string): void {
  if (colsWrap.dataset.statusColsResizeBound === "1") return;
  colsWrap.dataset.statusColsResizeBound = "1";
  let activePanel: HTMLElement | null = null;
  let activeHandle: HTMLElement | null = null;
  let activeKey: StatusEditorColKeyEvent | null = null;
  let activePointerId: number | null = null;
  let startX = 0;
  let startWidth = 0;
  let isResizing = false;

  const updateWidth = (clientX: number): void => {
    if (!isResizing || !activePanel || !activeKey) return;
    const width = clampStatusEditorValueEvent(
      startWidth + (clientX - startX),
      STATUS_EDITOR_COL_MIN_WIDTH_Event[activeKey],
      520
    );
    activePanel.style.setProperty(STATUS_EDITOR_COL_VAR_MAP_Event[activeKey], `${width}px`);
  };

  const persistWidth = (): void => {
    if (!activePanel || !activeKey) return;
    const width = Number.parseFloat(
      getComputedStyle(activePanel).getPropertyValue(STATUS_EDITOR_COL_VAR_MAP_Event[activeKey])
    );
    if (!Number.isFinite(width)) return;
    const prev = readStatusEditorLayoutPrefsEvent();
    saveStatusEditorLayoutPrefsEvent({
      ...prev,
      columns: {
        ...(prev.columns ?? {}),
        [activeKey]: width,
      },
    });
  };

  const cleanup = (shouldPersist: boolean): void => {
    if (!isResizing) return;
    if (shouldPersist) persistWidth();
    isResizing = false;
    activeHandle?.classList.remove("is-resizing");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    if (activeHandle && activePointerId != null) {
      try {
        if (activeHandle.hasPointerCapture(activePointerId)) {
          activeHandle.releasePointerCapture(activePointerId);
        }
      } catch {
        // noop
      }
    }
    activePanel = null;
    activeHandle = null;
    activeKey = null;
    activePointerId = null;
  };

  const beginResize = (
    handle: HTMLElement,
    key: StatusEditorColKeyEvent,
    clientX: number,
    pointerId: number | null
  ): void => {
    const panel = resolveStatusEditorPanelFromElementEvent(colsWrap, rowsWrapId);
    if (!panel) return;
    activePanel = panel;
    activeHandle = handle;
    activeKey = key;
    activePointerId = pointerId;
    const header = colsWrap.querySelector<HTMLElement>(`[data-status-col-key="${key}"]`);
    startX = clientX;
    startWidth = Math.max(
      STATUS_EDITOR_COL_MIN_WIDTH_Event[key],
      Math.round(header?.getBoundingClientRect().width ?? STATUS_EDITOR_COL_MIN_WIDTH_Event[key])
    );
    isResizing = true;
    handle.style.touchAction = "none";
    handle.classList.add("is-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    if (pointerId != null) {
      try {
        handle.setPointerCapture(pointerId);
      } catch {
        // noop
      }
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    updateWidth(event.clientX);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    cleanup(true);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (!isResizing) return;
    if (activePointerId != null && event.pointerId !== activePointerId) return;
    cleanup(false);
  };

  const onMouseMove = (event: MouseEvent): void => {
    if (!isResizing || activePointerId != null) return;
    updateWidth(event.clientX);
  };

  const onMouseUp = (): void => {
    if (!isResizing || activePointerId != null) return;
    cleanup(true);
  };

  const findHandleAndKey = (
    target: EventTarget | null
  ): { handle: HTMLElement; key: StatusEditorColKeyEvent } | null => {
    const element = target as HTMLElement | null;
    const handle = element?.closest<HTMLElement>("[data-status-col-resize-key]");
    if (!handle) return null;
    const key = String(handle.dataset.statusColResizeKey ?? "") as StatusEditorColKeyEvent;
    if (!key || !STATUS_EDITOR_COL_VAR_MAP_Event[key]) return null;
    return { handle, key };
  };

  colsWrap.addEventListener("pointerdown", (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const matched = findHandleAndKey(event.target);
    if (!matched) return;
    event.preventDefault();
    event.stopPropagation();
    if (isResizing) cleanup(false);
    beginResize(matched.handle, matched.key, event.clientX, event.pointerId);
  });

  colsWrap.addEventListener("mousedown", (event: MouseEvent) => {
    if (event.button !== 0) return;
    if (isResizing) return;
    const matched = findHandleAndKey(event.target);
    if (!matched) return;
    event.preventDefault();
    event.stopPropagation();
    beginResize(matched.handle, matched.key, event.clientX, null);
  });
}

function renderStatusMemoryStateEvent(memoryStateId: string): void {
  const node = document.getElementById(memoryStateId) as HTMLElement | null;
  if (!node) return;
  node.textContent = STATUS_EDITOR_MEMORY_STATE_TEXT_Event;
}

/**
 * 功能：把角色标识归一化为可比较的作用域键。
 * @param roleId 原始角色标识
 * @returns 归一化后的角色作用域键
 */
function normalizeStatusEditorRoleScopeKeyEvent(roleId: string): string {
  return String(roleId ?? "")
    .trim()
    .toLowerCase()
    .replace(/^default_/i, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function formatStatusEditorTimeEvent(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "-";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "-";
  }
}

function saveCurrentStatusDraftToCacheEvent(dirtyHintId: string): void {
  const chatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
  if (!chatKey) return;
  STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.set(chatKey, {
    rows: [...STATUS_EDITOR_ROWS_DRAFT_Event],
    snapshot: STATUS_EDITOR_LAST_SNAPSHOT_Event,
    metaSnapshot: STATUS_EDITOR_LAST_META_SNAPSHOT_Event,
    dirty: STATUS_EDITOR_DIRTY_Event,
    updatedAt: Date.now(),
    activeStatusCount: STATUS_EDITOR_ROWS_DRAFT_Event.length,
  });
  setStatusDraftDirtyEvent(STATUS_EDITOR_DIRTY_Event, dirtyHintId);
}

function buildStatusEditorChatEntityKeySetEvent(chatKeys: string[]): Set<string> {
  const entityKeys = new Set<string>();
  (Array.isArray(chatKeys) ? chatKeys : []).forEach((chatKey) => {
    const entityKey = buildStatusEditorChatEntityKeyFromKeyEvent(String(chatKey ?? "").trim());
    if (entityKey) entityKeys.add(entityKey);
  });
  return entityKeys;
}

function collectUnusedStatusEditorChatKeysEvent(chatKeys: string[], retainChatKeys: string[]): string[] {
  const retainEntityKeys = buildStatusEditorChatEntityKeySetEvent(retainChatKeys);
  return (Array.isArray(chatKeys) ? chatKeys : []).filter((chatKey) => {
    const normalizedChatKey = String(chatKey ?? "").trim();
    if (!normalizedChatKey) return false;
    const entityKey = buildStatusEditorChatEntityKeyFromKeyEvent(normalizedChatKey);
    if (!entityKey) return false;
    return !retainEntityKeys.has(entityKey);
  });
}

function dropStatusEditorChatDraftCacheEntriesEvent(chatKeys: string[]): number {
  let removedCount = 0;
  (Array.isArray(chatKeys) ? chatKeys : []).forEach((chatKey) => {
    const normalizedChatKey = String(chatKey ?? "").trim();
    if (!normalizedChatKey) return;
    if (!STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.has(normalizedChatKey)) return;
    STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.delete(normalizedChatKey);
    removedCount += 1;
  });
  return removedCount;
}

function countStatusEditorDirtyDraftEntriesEvent(chatKeys: string[]): number {
  return (Array.isArray(chatKeys) ? chatKeys : []).filter((chatKey) => {
    const normalizedChatKey = String(chatKey ?? "").trim();
    return Boolean(STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(normalizedChatKey)?.dirty);
  }).length;
}

function restoreStatusDraftFromCacheEvent(
  chatKey: string,
  rowsWrapId: string,
  dirtyHintId: string
): boolean {
  const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(chatKey);
  if (!cached) return false;
  STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
  STATUS_EDITOR_ROWS_DRAFT_Event = [...cached.rows];
  STATUS_EDITOR_LAST_SNAPSHOT_Event = String(cached.snapshot ?? "[]");
  STATUS_EDITOR_LAST_META_SNAPSHOT_Event = String(cached.metaSnapshot ?? "[]");
  setStatusDraftDirtyEvent(Boolean(cached.dirty), dirtyHintId);
  renderStatusRowsEvent(rowsWrapId);
  return true;
}

interface StatusEditorChatKeySnapshotEvent {
  tavernInstanceId: string;
  chatId: string;
  scopeType: "character" | "group";
  scopeId: string;
}

interface StatusEditorChatEntityPartsEvent {
  tavernInstanceId: string;
  chatId: string;
  scopeType: "character" | "group";
  scopeId: string;
}

/**
 * 功能：解析聊天键，兼容 V2 结构化键与旧版键。
 * @param chatKey 聊天键
 * @returns 聊天键快照
 */
function parseStatusEditorChatKeySnapshotEvent(chatKey: string): StatusEditorChatKeySnapshotEvent {
  const parsed = parseAnyTavernChatRefEvent(chatKey);
  return {
    tavernInstanceId: String(parsed.tavernInstanceId ?? "").trim(),
    chatId: String(parsed.chatId ?? "").trim(),
    scopeType: parsed.scopeType === "group" ? "group" : "character",
    scopeId: String(parsed.scopeId ?? "").trim(),
  };
}

function normalizeStatusEditorEntityPartEvent(raw: unknown): string {
  return String(raw ?? "").trim().toLowerCase();
}

function normalizeStatusEditorEntityScopeIdEvent(scopeType: "character" | "group", scopeId: string): string {
  const raw = String(scopeId ?? "").trim();
  if (!raw) return "";
  if (scopeType === "group") return normalizeStatusEditorEntityPartEvent(raw);
  const roleScope = normalizeStatusEditorRoleScopeKeyEvent(raw);
  return normalizeStatusEditorEntityPartEvent(roleScope || raw);
}

function buildStatusEditorChatEntityKeyEvent(parts: StatusEditorChatEntityPartsEvent): string {
  const tavernInstanceId = normalizeStatusEditorEntityPartEvent(parts.tavernInstanceId);
  const chatId = normalizeStatusEditorEntityPartEvent(parts.chatId);
  const scopeType = parts.scopeType === "group" ? "group" : "character";
  const scopeId = normalizeStatusEditorEntityScopeIdEvent(scopeType, parts.scopeId);
  if (!tavernInstanceId || !chatId || !scopeId || isFallbackTavernChatEvent(chatId)) return "";
  return `${tavernInstanceId}::${scopeType}::${scopeId}::${chatId}`;
}

function buildStatusEditorChatEntityKeyFromKeyEvent(chatKey: string): string {
  const snapshot = parseStatusEditorChatKeySnapshotEvent(chatKey);
  return buildStatusEditorChatEntityKeyEvent(snapshot);
}

/**
 * 功能：判断候选聊天是否属于当前作用域。
 * @param currentKey 当前聊天键
 * @param candidateKey 候选聊天键
 * @returns 是否同作用域
 */
function isStatusEditorChatInCurrentScopeEvent(currentKey: string, candidateKey: string): boolean {
  const current = parseStatusEditorChatKeySnapshotEvent(currentKey);
  const candidate = parseStatusEditorChatKeySnapshotEvent(candidateKey);
  if (!candidate.chatId || isFallbackTavernChatEvent(candidate.chatId)) return false;
  if (!current.tavernInstanceId) {
    return Boolean(candidate.tavernInstanceId);
  }
  if (!candidate.tavernInstanceId) return false;
  return current.tavernInstanceId === candidate.tavernInstanceId;
}

/**
 * 功能：构建聊天列表项的兜底展示文案。
 * @param chatKey 聊天键
 * @returns 兜底显示名
 */
function buildStatusEditorFallbackChatNameEvent(chatKey: string): string {
  const parsed = parseAnyTavernChatRefEvent(chatKey);
  return String(parsed.chatId ?? "").trim() || "unknown_chat";
}

function mergeStatusEditorChatListEvent(
  currentChatKey: string,
  hostChats: Array<{
    chatKey: string;
    updatedAt: number;
    chatId: string;
    displayName: string;
    avatarUrl: string;
    scopeType: "character" | "group";
    scopeId: string;
    roleKey: string;
  }>,
  localSummaries: Array<{ chatKey: string; updatedAt: number; activeStatusCount: number }>,
  memoryChatKeys: string[]
): StatusEditorChatListItemEvent[] {
  const currentKey = String(currentChatKey ?? "").trim();
  const draftChatKeys = Array.from(STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.keys());
  const unified = listUnifiedTavernChatDirectoryEvent({
    currentChatKey: currentKey,
    hostChats,
    localSummaries,
    draftChatKeys,
    taggedChatKeys: memoryChatKeys,
  });

  return unified
    .map((item): StatusEditorChatListItemEvent => {
      const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(item.chatKey);
      return {
        chatKey: item.chatKey,
        chatId: item.chatId,
        displayName: String(item.displayName ?? "").trim() || buildStatusEditorFallbackChatNameEvent(item.chatKey),
        avatarUrl: String(item.avatarUrl ?? "").trim(),
        scopeType: item.scopeType,
        scopeId: String(item.scopeId ?? "").trim(),
        roleKey: String(item.roleKey ?? "").trim(),
        updatedAt: Math.max(Number(item.updatedAt) || 0, Number(cached?.updatedAt) || 0),
        activeStatusCount: Math.max(
          Number(item.activeStatusCount) || 0,
          Number(cached?.activeStatusCount) || 0
        ),
        isCurrent: item.isCurrent,
        fromRollLocal: item.fromLocal,
        fromHost: item.fromHost,
        fromMemory: item.fromTagged,
      };
    })
    .filter((item) => {
      const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(item.chatKey);
      if (item.isCurrent || item.fromHost || item.fromMemory) return true;
      if (Boolean(cached?.dirty)) return true;
      return Number(item.activeStatusCount) > 0;
    })
    .sort((a, b) => {
      if (a.chatKey === currentKey) return -1;
      if (b.chatKey === currentKey) return 1;
      const aDirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(a.chatKey)?.dirty ? 1 : 0;
      const bDirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(b.chatKey)?.dirty ? 1 : 0;
      if (aDirty !== bDirty) return bDirty - aDirty;
      if (a.fromHost !== b.fromHost) return Number(b.fromHost) - Number(a.fromHost);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
}

function renderStatusEditorChatListEvent(chatListId: string): void {
  const node = document.getElementById(chatListId) as HTMLElement | null;
  if (!node) return;
  const visibleChatList = getVisibleStatusEditorChatListEvent();
  if (!STATUS_EDITOR_CHAT_LIST_Event.length) {
    node.innerHTML = `<div class="st-roll-status-empty">当前酒馆下暂无聊天记录。</div>`;
    return;
  }
  if (!visibleChatList.length) {
    node.innerHTML = `<div class="st-roll-status-empty">没有匹配的聊天。</div>`;
    return;
  }
  node.innerHTML = visibleChatList.map((item) => {
    const active = item.chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event;
    const dirty = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(item.chatKey)?.dirty === true;
    const tags: string[] = [];
    if (item.isCurrent) tags.push("当前");
    if (item.fromHost) tags.push("宿主");
    if (item.fromRollLocal) tags.push("本地");
    if (item.fromMemory) tags.push("记忆库");
    if (dirty) tags.push("未保存");

    const chatId = String(item.chatId ?? "").trim();
    const name = String(item.displayName ?? "").trim() || buildStatusEditorFallbackChatNameEvent(item.chatKey);
    const avatarUrl = String(item.avatarUrl ?? "").trim();
    const avatarFallback = escapeHtml(String(name || "未").slice(0, 1).toUpperCase());

    return `
      <button type="button" class="st-roll-status-chat-item ${active ? "is-active" : ""}" data-status-chat-key="${escapeAttr(item.chatKey)}">
        <div class="st-roll-status-chat-avatar-wrap">
          ${avatarUrl
            ? `<img class="st-roll-status-chat-avatar" src="${escapeAttr(avatarUrl)}" alt="${escapeAttr(name)}" onerror="this.style.display='none'; const fb=this.nextElementSibling; if(fb){fb.style.display='grid';}" />`
            : ""}
          <div class="st-roll-status-chat-avatar-fallback" style="${avatarUrl ? "display:none;" : ""}">${avatarFallback}</div>
        </div>
        <div class="st-roll-status-chat-main">
          <span class="st-roll-status-chat-name">${escapeHtml(name)}</span>
          <span class="st-roll-status-chat-time">最后聊天：${escapeHtml(formatStatusEditorTimeEvent(item.updatedAt))}</span>
          <span class="st-roll-status-chat-key">CHATID：${escapeHtml(chatId)}</span>
          <span class="st-roll-status-chat-meta-line">${tags.map((tag) => `<span class="st-roll-skill-preset-tag">${escapeHtml(tag)}</span>`).join("")}</span>
        </div>
      </button>
    `;
  }).join("");
}

function renderStatusEditorChatMetaEvent(chatMetaId: string): void {
  const node = document.getElementById(chatMetaId) as HTMLElement | null;
  if (!node) return;
  const selectedKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
  if (!selectedKey) {
    node.textContent = "未选择聊天";
    return;
  }
  const selected = STATUS_EDITOR_CHAT_LIST_Event.find((item) => item.chatKey === selectedKey);
  if (!selected) {
    node.textContent = selectedKey;
    return;
  }
  const tags: string[] = [];
  if (selected.isCurrent) tags.push("当前");
  if (selected.fromHost) tags.push("宿主");
  if (selected.fromRollLocal) tags.push("本地");
  if (selected.fromMemory) tags.push("记忆库");
  const visibleCount = getVisibleStatusEditorRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event).length;
  node.textContent = `来源：${tags.join("、") || "未知"}｜状态数：${selected.activeStatusCount}｜可见：${visibleCount}`;
}

async function switchStatusEditorChatEvent(
  chatKey: string,
  deps: BindStatusEditorActionsDepsEvent,
  options?: { skipSaveCurrent?: boolean }
): Promise<void> {
  const key = String(chatKey ?? "").trim();
  if (!key) return;
  if (!options?.skipSaveCurrent) {
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
  }
  STATUS_EDITOR_SELECTED_CHAT_KEY_Event = key;

  const restored = restoreStatusDraftFromCacheEvent(
    key,
    deps.SETTINGS_STATUS_ROWS_ID_Event,
    deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event
  );
  if (!restored) {
    const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
    const statuses =
      key === currentKey
        ? deps.getActiveStatusesEvent()
        : await deps.loadStatusesForChatKeyEvent(key);
    hydrateStatusDraftFromMetaEvent(
      statuses,
      deps.SETTINGS_STATUS_ROWS_ID_Event,
      deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
      true
    );
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
  }

  renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
}

async function refreshStatusEditorChatListEvent(deps: BindStatusEditorActionsDepsEvent): Promise<void> {
  const token = ++STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event;
  STATUS_EDITOR_IS_REFRESHING_Event = true;
  syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
  STATUS_EDITOR_CURRENT_CHAT_KEY_Event = String(deps.getActiveChatKeyEvent() ?? "").trim();
  STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：检测中";
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);

  const [hostChats, localSummaries, probeResult] = await Promise.all([
    deps.listHostChatsForCurrentScopeEvent().catch(() => []),
    deps.listChatScopedStatusSummariesEvent().catch(() => []),
    deps.probeMemoryPluginEvent(1200).catch(() => ({
      available: false,
      enabled: false,
      pluginId: "stx_memory_os",
      version: "",
      capabilities: [],
    })),
  ]);
  if (token !== STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event) {
    STATUS_EDITOR_IS_REFRESHING_Event = false;
    syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
    return;
  }

  let memoryChatKeys: string[] = [];
  if (!probeResult.available) {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：未安装";
  } else if (!probeResult.enabled) {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：已安装（未启用）";
  } else {
    STATUS_EDITOR_MEMORY_STATE_TEXT_Event = "记忆库：已启用";
    const memoryResult = await deps.fetchMemoryChatKeysEvent(1200).catch(() => ({ chatKeys: [], updatedAt: null }));
    if (token !== STATUS_EDITOR_CHAT_REFRESH_TOKEN_Event) {
      STATUS_EDITOR_IS_REFRESHING_Event = false;
      syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
      return;
    }
    memoryChatKeys = Array.isArray(memoryResult.chatKeys) ? memoryResult.chatKeys : [];
  }

  STATUS_EDITOR_CHAT_LIST_Event = mergeStatusEditorChatListEvent(
    STATUS_EDITOR_CURRENT_CHAT_KEY_Event,
    hostChats,
    localSummaries,
    memoryChatKeys
  );
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
  renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);

  const selectedExists = STATUS_EDITOR_CHAT_LIST_Event.some((item) => item.chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event);
  const target =
    (selectedExists ? STATUS_EDITOR_SELECTED_CHAT_KEY_Event : "") ||
    STATUS_EDITOR_CURRENT_CHAT_KEY_Event ||
    STATUS_EDITOR_CHAT_LIST_Event[0]?.chatKey ||
    "";
  if (!target) {
    STATUS_EDITOR_SELECTED_CHAT_KEY_Event = "";
    STATUS_EDITOR_ROWS_DRAFT_Event = [];
    STATUS_EDITOR_LAST_SNAPSHOT_Event = "[]";
    STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "[]";
    setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
    closeStatusMobileSheetEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    STATUS_EDITOR_IS_REFRESHING_Event = false;
    syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
    return;
  }
  await switchStatusEditorChatEvent(target, deps, { skipSaveCurrent: true });
  STATUS_EDITOR_IS_REFRESHING_Event = false;
  syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
}

export function syncStatusEditorCurrentChatFromRuntimeEvent(deps: Pick<
  BindStatusEditorActionsDepsEvent,
  "SETTINGS_STATUS_ROWS_ID_Event" | "SETTINGS_STATUS_DIRTY_HINT_ID_Event" | "getActiveChatKeyEvent" | "getActiveStatusesEvent"
>): void {
  const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
  if (!currentKey) return;
  const cached = STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(currentKey);
  if (cached?.dirty) return;
  const statuses = deps.getActiveStatusesEvent();
  const rows = deserializeActiveStatusesToDraftRowsEvent(statuses);
  const snapshot = buildStatusDraftSnapshotEvent(rows);
  const metaSnapshot = buildStatusMetaSnapshotEvent(statuses);
  STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.set(currentKey, {
    rows,
    snapshot,
    metaSnapshot,
    dirty: false,
    updatedAt: Date.now(),
    activeStatusCount: statuses.length,
  });
  if (STATUS_EDITOR_SELECTED_CHAT_KEY_Event && STATUS_EDITOR_SELECTED_CHAT_KEY_Event !== currentKey) return;
  STATUS_EDITOR_SELECTED_CHAT_KEY_Event = currentKey;
  hydrateStatusDraftFromMetaEvent(
    statuses,
    deps.SETTINGS_STATUS_ROWS_ID_Event,
    deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event,
    true
  );
}

export function bindStatusEditorActionsEvent(deps: BindStatusEditorActionsDepsEvent): void {
  const rowsWrap = document.getElementById(deps.SETTINGS_STATUS_ROWS_ID_Event) as HTMLElement | null;
  const addBtn = document.getElementById(deps.SETTINGS_STATUS_ADD_ID_Event) as HTMLButtonElement | null;
  const saveBtn = document.getElementById(deps.SETTINGS_STATUS_SAVE_ID_Event) as HTMLButtonElement | null;
  const resetBtn = document.getElementById(deps.SETTINGS_STATUS_RESET_ID_Event) as HTMLButtonElement | null;
  const refreshBtn = document.getElementById(deps.SETTINGS_STATUS_REFRESH_ID_Event) as HTMLButtonElement | null;
  const cleanUnusedBtn = document.getElementById(deps.SETTINGS_STATUS_CLEAN_UNUSED_ID_Event) as HTMLButtonElement | null;
  const chatList = document.getElementById(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event) as HTMLElement | null;
  const splitter = document.getElementById(deps.SETTINGS_STATUS_SPLITTER_ID_Event) as HTMLElement | null;
  const cols = document.getElementById(deps.SETTINGS_STATUS_COLS_ID_Event) as HTMLElement | null;
  const modal = rowsWrap?.closest(".st-roll-status-modal") as HTMLElement | null;
  const chatSearchInput = modal?.querySelector(".st-roll-status-chat-search") as HTMLInputElement | null;
  const chatSourceInput = modal?.querySelector(".st-roll-status-chat-source") as HTMLSelectElement | null;
  const rowSearchInput = modal?.querySelector(".st-roll-status-search") as HTMLInputElement | null;
  const scopeFilterInput = modal?.querySelector(".st-roll-status-scope-filter") as HTMLSelectElement | null;
  const onlyEnabledInput = modal?.querySelector(".st-roll-status-only-enabled") as HTMLInputElement | null;
  const selectVisibleBtn = modal?.querySelector(".st-roll-status-select-visible") as HTMLButtonElement | null;
  const batchEnableBtn = modal?.querySelector(".st-roll-status-batch-enable") as HTMLButtonElement | null;
  const batchDisableBtn = modal?.querySelector(".st-roll-status-batch-disable") as HTMLButtonElement | null;
  const batchDeleteBtn = modal?.querySelector(".st-roll-status-batch-delete") as HTMLButtonElement | null;
  const mobileBackBtn = modal?.querySelector(".st-roll-status-mobile-back") as HTMLButtonElement | null;
  const mobileSheetHead = modal?.querySelector(".st-roll-status-mobile-sheet-head") as HTMLElement | null;

  if (!rowsWrap) return;
  if (rowsWrap.dataset.statusEditorBound === "1") return;
  rowsWrap.dataset.statusEditorBound = "1";

  applyStatusEditorLayoutPrefsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
  if (splitter) bindStatusEditorSplitterResizeEvent(splitter, deps.SETTINGS_STATUS_ROWS_ID_Event);
  if (cols) bindStatusEditorColumnResizeEvent(cols, deps.SETTINGS_STATUS_ROWS_ID_Event);

  const markDirty = () => {
    const next = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
    setStatusDraftDirtyEvent(next !== STATUS_EDITOR_LAST_SNAPSHOT_Event, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
    renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  };

  syncStatusEditorCurrentChatFromRuntimeEvent(deps);
  renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
  renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  syncStatusRefreshButtonStateEvent(deps.SETTINGS_STATUS_REFRESH_ID_Event);
  syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
  void refreshStatusEditorChatListEvent(deps);

  chatSearchInput?.addEventListener("input", () => {
    STATUS_EDITOR_CHAT_SEARCH_TEXT_Event = String(chatSearchInput.value ?? "");
    renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  });

  chatSourceInput?.addEventListener("change", () => {
    const next = String(chatSourceInput.value ?? "all");
    STATUS_EDITOR_CHAT_SOURCE_FILTER_Event =
      next === "current" || next === "local" || next === "memory" ? next : "all";
    renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
  });

  rowSearchInput?.addEventListener("input", () => {
    STATUS_EDITOR_ROW_SEARCH_TEXT_Event = String(rowSearchInput.value ?? "");
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  });

  scopeFilterInput?.addEventListener("change", () => {
    const next = String(scopeFilterInput.value ?? "all");
    STATUS_EDITOR_SCOPE_FILTER_Event = next === "skills" || next === "global" ? next : "all";
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  });

  onlyEnabledInput?.addEventListener("change", () => {
    STATUS_EDITOR_ONLY_ENABLED_Event = Boolean(onlyEnabledInput.checked);
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
  });

  selectVisibleBtn?.addEventListener("click", () => {
    getVisibleStatusEditorRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event).forEach((row) => {
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.add(String(row.rowId ?? ""));
    });
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
  });

  batchEnableBtn?.addEventListener("click", () => {
    if (STATUS_EDITOR_SELECTED_ROW_IDS_Event.size <= 0) return;
    STATUS_EDITOR_ROWS_DRAFT_Event = STATUS_EDITOR_ROWS_DRAFT_Event.map((row) =>
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")) ? { ...row, enabled: true } : row
    );
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  batchDisableBtn?.addEventListener("click", () => {
    if (STATUS_EDITOR_SELECTED_ROW_IDS_Event.size <= 0) return;
    STATUS_EDITOR_ROWS_DRAFT_Event = STATUS_EDITOR_ROWS_DRAFT_Event.map((row) =>
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")) ? { ...row, enabled: false } : row
    );
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  batchDeleteBtn?.addEventListener("click", () => {
    if (STATUS_EDITOR_SELECTED_ROW_IDS_Event.size <= 0) return;
    STATUS_EDITOR_ROWS_DRAFT_Event = STATUS_EDITOR_ROWS_DRAFT_Event.filter(
      (row) => !STATUS_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? ""))
    );
    STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  mobileBackBtn?.addEventListener("click", () => {
    closeStatusMobileSheetEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
  });

  if (mobileSheetHead) {
    let ignoreNextSheetClick = false;

    const stopSheetDragging = () => {
      STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event = false;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event = null;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_START_Y_Event = 0;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_START_TRANSLATE_Event = STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event;
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_Y_Event = 0;
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_TS_Event = 0;
    };

    mobileSheetHead.addEventListener("click", (event: MouseEvent) => {
      if (ignoreNextSheetClick) {
        ignoreNextSheetClick = false;
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest(".st-roll-status-mobile-back")) return;
      toggleStatusMobileSheetExpandedEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    });

    mobileSheetHead.addEventListener("pointerdown", (event: PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(".st-roll-status-mobile-back")) return;
      if (!window.matchMedia("(max-width: 680px)").matches) return;

      syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event = true;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event = event.pointerId;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_START_Y_Event = event.clientY;
      STATUS_EDITOR_MOBILE_SHEET_DRAG_START_TRANSLATE_Event = STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event;
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_Y_Event = event.clientY;
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_TS_Event = performance.now();

      try {
        mobileSheetHead.setPointerCapture(event.pointerId);
      } catch {
        // noop
      }
      syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    });

    mobileSheetHead.addEventListener("pointermove", (event: PointerEvent) => {
      if (!STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event) return;
      if (STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event !== event.pointerId) return;
      const metrics = syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      if (!metrics) return;

      const deltaY = event.clientY - STATUS_EDITOR_MOBILE_SHEET_DRAG_START_Y_Event;
      STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event = clampStatusMobileSheetValueEvent(
        STATUS_EDITOR_MOBILE_SHEET_DRAG_START_TRANSLATE_Event + deltaY,
        0,
        metrics.closedTranslate
      );
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_Y_Event = event.clientY;
      STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_TS_Event = performance.now();
      if (Math.abs(deltaY) > 8) {
        ignoreNextSheetClick = true;
      }
      syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      event.preventDefault();
    });

    mobileSheetHead.addEventListener("pointerup", (event: PointerEvent) => {
      if (!STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event) return;
      if (STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event !== event.pointerId) return;

      const metrics = buildStatusMobileSheetMetricsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      const totalDelta = event.clientY - STATUS_EDITOR_MOBILE_SHEET_DRAG_START_Y_Event;
      const releasedTranslate = clampStatusMobileSheetValueEvent(
        STATUS_EDITOR_MOBILE_SHEET_DRAG_START_TRANSLATE_Event + totalDelta,
        0,
        metrics.closedTranslate
      );
      const now = performance.now();
      const dt = Math.max(1, now - STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_TS_Event);
      const velocityY = (event.clientY - STATUS_EDITOR_MOBILE_SHEET_LAST_MOVE_Y_Event) / dt;
      STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event = releasedTranslate;
      STATUS_EDITOR_MOBILE_SHEET_STATE_Event = resolveStatusMobileSheetStateByReleaseEvent(
        releasedTranslate,
        velocityY,
        metrics
      );
      stopSheetDragging();
      syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      ignoreNextSheetClick = Math.abs(totalDelta) > 8;

      try {
        mobileSheetHead.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
    });

    mobileSheetHead.addEventListener("pointercancel", (event: PointerEvent) => {
      if (!STATUS_EDITOR_MOBILE_SHEET_DRAGGING_Event) return;
      if (STATUS_EDITOR_MOBILE_SHEET_DRAG_POINTER_ID_Event !== event.pointerId) return;

      const metrics = buildStatusMobileSheetMetricsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      STATUS_EDITOR_MOBILE_SHEET_STATE_Event = resolveStatusMobileSheetStateByReleaseEvent(
        STATUS_EDITOR_MOBILE_SHEET_CURRENT_TRANSLATE_Event,
        0,
        metrics
      );
      stopSheetDragging();
      syncStatusMobileSheetStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      ignoreNextSheetClick = false;
      try {
        mobileSheetHead.releasePointerCapture(event.pointerId);
      } catch {
        // noop
      }
    });
  }

  rowsWrap.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | HTMLSelectElement | null;
    if (!target) return;
    const rowId = String(target.dataset.statusRowId ?? "");
    const field = String(target.dataset.statusField ?? "");
    if (!rowId || !field) return;
    const row = STATUS_EDITOR_ROWS_DRAFT_Event.find((item) => item.rowId === rowId);
    if (!row) return;

    if (field === "name") row.name = target.value;
    if (field === "modifier") row.modifierText = target.value;
    if (field === "skills") row.skillsText = target.value;
    if (field === "duration") row.durationText = target.value;
    if (field === "scope") {
      row.scope = target.value === "all" ? "all" : "skills";
      if (row.scope === "all") row.skillsText = "";
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    }
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  rowsWrap.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const selectRowId = String(target.dataset.statusSelectId ?? "");
    if (selectRowId) {
      if (target.checked) {
        STATUS_EDITOR_SELECTED_ROW_IDS_Event.add(selectRowId);
      } else {
        STATUS_EDITOR_SELECTED_ROW_IDS_Event.delete(selectRowId);
      }
      syncStatusWorkbenchToolbarStateEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      return;
    }
    const rowId = String(target.dataset.statusRowId ?? "");
    const field = String(target.dataset.statusField ?? "");
    if (!rowId || field !== "enabled") return;
    const row = STATUS_EDITOR_ROWS_DRAFT_Event.find((item) => item.rowId === rowId);
    if (!row) return;
    row.enabled = target.checked;
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  rowsWrap.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const duplicateBtn = target?.closest<HTMLButtonElement>("button[data-status-duplicate-id]");
    if (duplicateBtn) {
      const rowId = String(duplicateBtn.dataset.statusDuplicateId ?? "");
      const sourceRow = STATUS_EDITOR_ROWS_DRAFT_Event.find((item) => item.rowId === rowId);
      if (!sourceRow) return;
      STATUS_EDITOR_ROWS_DRAFT_Event = [
        ...STATUS_EDITOR_ROWS_DRAFT_Event,
        createStatusEditorRowDraftEvent(
          String(sourceRow.name ?? ""),
          String(sourceRow.modifierText ?? ""),
          String(sourceRow.durationText ?? ""),
          sourceRow.scope === "all" ? "all" : "skills",
          String(sourceRow.skillsText ?? ""),
          sourceRow.enabled !== false
        ),
      ];
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      markDirty();
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      return;
    }

    const removeBtn = target?.closest<HTMLButtonElement>("button[data-status-remove-id]");
    if (!removeBtn) return;
    const rowId = String(removeBtn.dataset.statusRemoveId ?? "");
    if (!rowId) return;
    STATUS_EDITOR_SELECTED_ROW_IDS_Event.delete(rowId);
    STATUS_EDITOR_ROWS_DRAFT_Event = STATUS_EDITOR_ROWS_DRAFT_Event.filter((item) => item.rowId !== rowId);
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  chatList?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const item = target?.closest<HTMLButtonElement>("button[data-status-chat-key]");
    if (!item) return;
    const chatKey = String(item.dataset.statusChatKey ?? "").trim();
    if (!chatKey) return;
    if (chatKey === STATUS_EDITOR_SELECTED_CHAT_KEY_Event) {
      if (STATUS_EDITOR_MOBILE_SHEET_STATE_Event === "closed") {
        openStatusMobileSheetEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      }
      return;
    }
    void switchStatusEditorChatEvent(chatKey, deps).then(() => {
      openStatusMobileSheetEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    });
  });

  addBtn?.addEventListener("click", () => {
    STATUS_EDITOR_ROWS_DRAFT_Event = [...STATUS_EDITOR_ROWS_DRAFT_Event, createStatusEditorRowDraftEvent()];
    renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
    markDirty();
    renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
  });

  saveBtn?.addEventListener("click", () => {
    void (async () => {
      const selectedChatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
      if (!selectedChatKey) return;
      const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
      const existing =
        selectedChatKey === currentKey
          ? deps.getActiveStatusesEvent()
          : await deps.loadStatusesForChatKeyEvent(selectedChatKey);
      const validated = validateStatusRowsEvent(STATUS_EDITOR_ROWS_DRAFT_Event, existing);
      if (validated.errors.length > 0) {
        renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, validated.errors);
        return;
      }

      if (selectedChatKey === currentKey) {
        deps.setActiveStatusesEvent(validated.statuses);
      } else {
        await deps.saveStatusesForChatKeyEvent(selectedChatKey, validated.statuses);
      }
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
      STATUS_EDITOR_ROWS_DRAFT_Event = deserializeActiveStatusesToDraftRowsEvent(validated.statuses);
      STATUS_EDITOR_LAST_SNAPSHOT_Event = buildStatusDraftSnapshotEvent(STATUS_EDITOR_ROWS_DRAFT_Event);
      STATUS_EDITOR_LAST_META_SNAPSHOT_Event = buildStatusMetaSnapshotEvent(validated.statuses);
      setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
      saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);

      const item = STATUS_EDITOR_CHAT_LIST_Event.find((entry) => entry.chatKey === selectedChatKey);
      if (item) {
        item.updatedAt = Date.now();
        item.activeStatusCount = validated.statuses.length;
      }
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
      renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      deps.syncSettingsUiEvent?.();
      deps.pushToChat?.(
        selectedChatKey === currentKey
          ? "状态编辑器：已保存并立即应用到当前聊天。"
          : `状态编辑器：已保存到聊天 ${selectedChatKey}。`
      );
    })();
  });

  resetBtn?.addEventListener("click", () => {
    void (async () => {
      const selectedChatKey = String(STATUS_EDITOR_SELECTED_CHAT_KEY_Event ?? "").trim();
      if (!selectedChatKey) return;
      const currentKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
      if (selectedChatKey === currentKey) {
        deps.setActiveStatusesEvent([]);
      } else {
        await deps.saveStatusesForChatKeyEvent(selectedChatKey, []);
      }
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
      STATUS_EDITOR_ROWS_DRAFT_Event = [];
      STATUS_EDITOR_LAST_SNAPSHOT_Event = "[]";
      STATUS_EDITOR_LAST_META_SNAPSHOT_Event = "[]";
      setStatusDraftDirtyEvent(false, deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);
      saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);

      const item = STATUS_EDITOR_CHAT_LIST_Event.find((entry) => entry.chatKey === selectedChatKey);
      if (item) {
        item.updatedAt = Date.now();
        item.activeStatusCount = 0;
      }
      renderStatusRowsEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      renderStatusEditorChatListEvent(deps.SETTINGS_STATUS_CHAT_LIST_ID_Event);
      renderStatusEditorChatMetaEvent(deps.SETTINGS_STATUS_CHAT_META_ID_Event);
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      deps.syncSettingsUiEvent?.();
      deps.pushToChat?.(
        selectedChatKey === currentKey
          ? "状态编辑器：已重置当前聊天状态。"
          : `状态编辑器：聊天 ${selectedChatKey} 已重置。`
      );
    })();
  });

  refreshBtn?.addEventListener("click", () => {
    void refreshStatusEditorChatListEvent(deps);
  });

  cleanUnusedBtn?.addEventListener("click", () => {
    void (async () => {
      saveCurrentStatusDraftToCacheEvent(deps.SETTINGS_STATUS_DIRTY_HINT_ID_Event);

      let hostChats: Array<{
        chatKey: string;
        updatedAt: number;
        chatId: string;
        displayName: string;
        avatarUrl: string;
        scopeType: "character" | "group";
        scopeId: string;
        roleKey: string;
      }>;
      let localSummaries: Array<{ chatKey: string; updatedAt: number; activeStatusCount: number }>;
      try {
        [hostChats, localSummaries] = await Promise.all([
          deps.listHostChatsForCurrentScopeEvent(),
          deps.listChatScopedStatusSummariesEvent(),
        ]);
      } catch {
        deps.pushToChat?.("状态编辑器：读取当前酒馆聊天列表失败，未执行清理。");
        return;
      }

      const currentChatKey = String(deps.getActiveChatKeyEvent() ?? "").trim();
      const retainChatKeys = Array.from(
        new Set([
          ...((Array.isArray(hostChats) ? hostChats : []).map((item) => String(item.chatKey ?? "").trim())),
          currentChatKey,
        ].filter(Boolean))
      );
      const staleStateKeys = collectUnusedStatusEditorChatKeysEvent(
        (Array.isArray(localSummaries) ? localSummaries : []).map((item) => String(item.chatKey ?? "").trim()),
        retainChatKeys
      );
      const staleDraftKeys = collectUnusedStatusEditorChatKeysEvent(
        Array.from(STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.keys()),
        retainChatKeys
      );

      if (staleStateKeys.length <= 0 && staleDraftKeys.length <= 0) {
        deps.pushToChat?.("状态编辑器：当前没有可清理的无用聊天。");
        return;
      }

      const dirtyDraftCount = countStatusEditorDirtyDraftEntriesEvent(staleDraftKeys);
      const confirmed = window.confirm(
        [
          `将删除 ${staleStateKeys.length} 条不在当前酒馆聊天列表中的本地聊天状态记录。`,
          `将同时移除 ${staleDraftKeys.length} 条对应草稿${dirtyDraftCount > 0 ? `（其中 ${dirtyDraftCount} 条未保存）` : ""}。`,
          "此操作不会影响酒馆原始聊天，也不会影响记忆库。",
        ].join("\n")
      );
      if (!confirmed) return;

      const cleanupResult = await deps.cleanupUnusedChatStatesForCurrentTavernEvent(retainChatKeys);
      const removedDraftCount = dropStatusEditorChatDraftCacheEntriesEvent(staleDraftKeys);
      STATUS_EDITOR_SELECTED_ROW_IDS_Event.clear();
      await refreshStatusEditorChatListEvent(deps);
      renderStatusValidationErrorsEvent(deps.SETTINGS_STATUS_ERRORS_ID_Event, []);
      deps.syncSettingsUiEvent?.();
      deps.pushToChat?.(
        `状态编辑器：已清理 ${cleanupResult.deletedCount} 条无用聊天状态，移除 ${removedDraftCount} 条草稿。`
      );
    })();
  });

  if (!STATUS_EDITOR_OPEN_EVENT_BOUND_Event) {
    document.addEventListener("st-roll-status-editor-opened", () => {
      closeStatusMobileSheetEvent(deps.SETTINGS_STATUS_ROWS_ID_Event);
      void refreshStatusEditorChatListEvent(deps);
    });
    STATUS_EDITOR_OPEN_EVENT_BOUND_Event = true;
  }

  if (!STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event) {
    STATUS_EDITOR_MEMORY_UNSUBSCRIBE_Event = deps.subscribeMemoryPluginStateEvent((payload) => {
      STATUS_EDITOR_MEMORY_STATE_TEXT_Event = payload.enabled
        ? "记忆库：已启用"
        : "记忆库：已安装（未启用）";
      renderStatusMemoryStateEvent(deps.SETTINGS_STATUS_MEMORY_STATE_ID_Event);
      void refreshStatusEditorChatListEvent(deps);
    });
  }
}


export function isStatusEditorChatDraftDirtyEvent(chatKey: string): boolean {
  return Boolean(STATUS_EDITOR_CHAT_DRAFT_CACHE_Event.get(String(chatKey ?? ""))?.dirty);
}

