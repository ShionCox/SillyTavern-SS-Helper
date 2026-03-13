import {
  confirmDiscardSkillDraftEvent as confirmDiscardSkillDraftModuleEvent,
  renderSkillPresetListEvent as renderSkillPresetListModuleEvent,
  renderSkillPresetMetaEvent as renderSkillPresetMetaModuleEvent,
  renderSkillRowsEvent as renderSkillRowsModuleEvent,
  renderSkillValidationErrorsEvent as renderSkillValidationErrorsModuleEvent,
} from "./uiEvent";
import type {
  DicePluginSettingsEvent,
  SkillEditorRowDraftEvent,
  SkillPresetStoreEvent,
} from "../types/eventDomainEvent";
import { logger } from "../../index";

export interface CreateSkillEditorRuntimeEventDeps {
  SETTINGS_SKILL_DIRTY_HINT_ID_Event: string;
  SETTINGS_SKILL_ERRORS_ID_Event: string;
  SETTINGS_SKILL_ROWS_ID_Event: string;
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  SETTINGS_SKILL_PRESET_META_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getSkillPresetStoreEvent: (settings: DicePluginSettingsEvent) => SkillPresetStoreEvent;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetStoreEvent["presets"][number];
  normalizeSkillTableTextForSettingsEvent: (skillTableText: string) => string | null;
  deserializeSkillTableTextToRowsEvent: (skillTableText: string) => SkillEditorRowDraftEvent[];
  buildSkillDraftSnapshotEvent: (rows: SkillEditorRowDraftEvent[]) => string;
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  escapeHtmlEvent: (input: string) => string;
  escapeAttrEvent: (input: string) => string;
}

export interface SkillEditorRuntimeEvent {
  /** 设置草稿脏状态并同步脏提示 DOM；会操作页面元素可见性。 */
  setSkillDraftDirtyEvent: (flag: boolean) => void;
  /** 读取当前草稿是否为脏状态；无副作用。 */
  isSkillDraftDirtyEvent: () => boolean;
  /** 根据当前草稿刷新脏状态并更新 DOM 提示；会操作页面元素可见性。 */
  refreshSkillDraftDirtyStateEvent: () => void;
  /** 渲染技能行；会写入技能编辑区域 DOM。 */
  renderSkillRowsEvent: () => void;
  /** 渲染校验错误列表；会写入错误提示区域 DOM。 */
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
  /** 从 settings/store 回填草稿；会读写内部状态、可能写入聊天提示并刷新多个技能面板 DOM。 */
  hydrateSkillDraftFromSettingsEvent: (force?: boolean) => void;
  /** 如草稿已改动则弹确认框；确认后会放弃草稿并回填，返回是否允许继续。 */
  confirmDiscardSkillDraftEvent: () => boolean;
  /** 获取当前草稿行数组引用；无副作用。 */
  getSkillRowsDraftEvent: () => SkillEditorRowDraftEvent[];
  /** 覆盖当前草稿行数组；仅写内部状态。 */
  setSkillRowsDraftEvent: (rows: SkillEditorRowDraftEvent[]) => void;
  /** 获取当前激活预设 id；无副作用。 */
  getSkillEditorActivePresetIdEvent: () => string;
  /** 设置最后保存快照文本；仅写内部状态。 */
  setSkillEditorLastSavedSnapshotEvent: (snapshot: string) => void;
  /** 获取最后保存快照文本；无副作用。 */
  getSkillEditorLastSavedSnapshotEvent: () => string;
  /** 获取上次同步的 settings 技能文本；无副作用。 */
  getSkillEditorLastSettingsTextEvent: () => string;
  /** 获取上次同步的预设仓库文本；无副作用。 */
  getSkillEditorLastPresetStoreTextEvent: () => string;
}

/**
 * 创建技能编辑器运行时实例。
 * 输入：依赖的 store/UI 函数与常量 id。
 * 输出：可供 event runtime 调用的技能编辑器状态方法集合。
 * 副作用：实例方法在执行时会读写内部状态，并按需操作 DOM 与聊天消息。
 */
export function createSkillEditorRuntimeEvent(
  deps: CreateSkillEditorRuntimeEventDeps
): SkillEditorRuntimeEvent {
  let SKILL_EDITOR_ROWS_DRAFT_Event: SkillEditorRowDraftEvent[] = [];
  let SKILL_EDITOR_LAST_SAVED_SNAPSHOT_Event = "[]";
  let SKILL_EDITOR_LAST_SETTINGS_TEXT_Event = "";
  let SKILL_EDITOR_LAST_PRESET_STORE_TEXT_Event = "";
  let SKILL_EDITOR_ACTIVE_PRESET_ID_Event = "";
  let SKILL_EDITOR_DIRTY_Event = false;
  let SKILL_EDITOR_INVALID_SETTINGS_WARNED_TEXT_Event = "";

  function setSkillDraftDirtyEvent(flag: boolean): void {
    SKILL_EDITOR_DIRTY_Event = Boolean(flag);
    const dirtyHint = document.getElementById(
      deps.SETTINGS_SKILL_DIRTY_HINT_ID_Event
    ) as HTMLElement | null;
    if (dirtyHint) {
      dirtyHint.hidden = !SKILL_EDITOR_DIRTY_Event;
    }
  }

  function isSkillDraftDirtyEvent(): boolean {
    return SKILL_EDITOR_DIRTY_Event;
  }

  function refreshSkillDraftDirtyStateEvent(): void {
    const snapshot = deps.buildSkillDraftSnapshotEvent(SKILL_EDITOR_ROWS_DRAFT_Event);
    setSkillDraftDirtyEvent(snapshot !== SKILL_EDITOR_LAST_SAVED_SNAPSHOT_Event);
  }

  function renderSkillValidationErrorsEvent(errors: string[]): void {
    renderSkillValidationErrorsModuleEvent(errors, {
      SETTINGS_SKILL_ERRORS_ID_Event: deps.SETTINGS_SKILL_ERRORS_ID_Event,
      escapeHtmlEvent: deps.escapeHtmlEvent,
    });
  }

  /**
   * 功能：统计当前草稿中用于侧栏展示的技能条目数。
   * 参数：无（读取运行时草稿状态）。
   * 返回：number，去除空名称并按标准化名称去重后的数量。
   */
  function countSkillEntriesFromDraftRowsEvent(): number {
    const dedupe = new Set<string>();
    for (const row of SKILL_EDITOR_ROWS_DRAFT_Event) {
      const normalizedKey = String(row.skillName ?? "").trim().toLowerCase();
      if (!normalizedKey) continue;
      dedupe.add(normalizedKey);
    }
    return dedupe.size;
  }

  /**
   * 功能：刷新技能预设侧栏（列表与元信息），并把当前草稿数量实时映射到激活预设。
   * 参数：无（读取设置与草稿状态）。
   * 返回：void。
   */
  function renderSkillPresetSidebarEvent(): void {
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activeDraftCount = countSkillEntriesFromDraftRowsEvent();
    renderSkillPresetListModuleEvent(store, {
      SETTINGS_SKILL_PRESET_LIST_ID_Event: deps.SETTINGS_SKILL_PRESET_LIST_ID_Event,
      countSkillEntriesFromSkillTableTextEvent: deps.countSkillEntriesFromSkillTableTextEvent,
      escapeAttrEvent: deps.escapeAttrEvent,
      escapeHtmlEvent: deps.escapeHtmlEvent,
      activeDraftCountEvent: activeDraftCount,
    });
    renderSkillPresetMetaModuleEvent(store, {
      SETTINGS_SKILL_PRESET_META_ID_Event: deps.SETTINGS_SKILL_PRESET_META_ID_Event,
      SETTINGS_SKILL_PRESET_NAME_ID_Event: deps.SETTINGS_SKILL_PRESET_NAME_ID_Event,
      SETTINGS_SKILL_PRESET_DELETE_ID_Event: deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event,
      countSkillEntriesFromSkillTableTextEvent: deps.countSkillEntriesFromSkillTableTextEvent,
      getActiveSkillPresetEvent: deps.getActiveSkillPresetEvent,
      activeDraftCountEvent: activeDraftCount,
    });
  }

  function renderSkillRowsEvent(): void {
    renderSkillRowsModuleEvent(SKILL_EDITOR_ROWS_DRAFT_Event, {
      SETTINGS_SKILL_ROWS_ID_Event: deps.SETTINGS_SKILL_ROWS_ID_Event,
      escapeAttrEvent: deps.escapeAttrEvent,
    });
    renderSkillPresetSidebarEvent();
  }

  function hydrateSkillDraftFromSettingsEvent(force = false): void {
    if (!force && isSkillDraftDirtyEvent()) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const normalizedStoreText = JSON.stringify(store, null, 2);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    const activeSkillTableNormalized = deps.normalizeSkillTableTextForSettingsEvent(activePreset.skillTableText);
    const activeSkillTableText = activeSkillTableNormalized ?? "{}";

    if (activeSkillTableNormalized == null) {
      SKILL_EDITOR_ROWS_DRAFT_Event = [];
      if (SKILL_EDITOR_INVALID_SETTINGS_WARNED_TEXT_Event !== activePreset.skillTableText) {
        SKILL_EDITOR_INVALID_SETTINGS_WARNED_TEXT_Event = activePreset.skillTableText;
        logger.warn("技能预设配置无效，已按空表载入");
        deps.appendToConsoleEvent("技能预设配置格式无效，已按空表载入。", "warn");
      }
    } else {
      SKILL_EDITOR_INVALID_SETTINGS_WARNED_TEXT_Event = "";
      SKILL_EDITOR_ROWS_DRAFT_Event = deps.deserializeSkillTableTextToRowsEvent(activeSkillTableText);
    }

    SKILL_EDITOR_ACTIVE_PRESET_ID_Event = activePreset.id;
    SKILL_EDITOR_LAST_SAVED_SNAPSHOT_Event = deps.buildSkillDraftSnapshotEvent(SKILL_EDITOR_ROWS_DRAFT_Event);
    SKILL_EDITOR_LAST_SETTINGS_TEXT_Event = activeSkillTableText;
    SKILL_EDITOR_LAST_PRESET_STORE_TEXT_Event = normalizedStoreText;
    setSkillDraftDirtyEvent(false);
    renderSkillValidationErrorsEvent([]);
    renderSkillRowsEvent();
  }

  function confirmDiscardSkillDraftEvent(): boolean {
    return confirmDiscardSkillDraftModuleEvent({
      isSkillDraftDirtyEvent,
      hydrateSkillDraftFromSettingsEvent,
    });
  }

  return {
    setSkillDraftDirtyEvent,
    isSkillDraftDirtyEvent,
    refreshSkillDraftDirtyStateEvent,
    renderSkillRowsEvent,
    renderSkillValidationErrorsEvent,
    hydrateSkillDraftFromSettingsEvent,
    confirmDiscardSkillDraftEvent,
    getSkillRowsDraftEvent: () => SKILL_EDITOR_ROWS_DRAFT_Event,
    setSkillRowsDraftEvent: (rows) => {
      SKILL_EDITOR_ROWS_DRAFT_Event = rows;
    },
    getSkillEditorActivePresetIdEvent: () => SKILL_EDITOR_ACTIVE_PRESET_ID_Event,
    setSkillEditorLastSavedSnapshotEvent: (snapshot) => {
      SKILL_EDITOR_LAST_SAVED_SNAPSHOT_Event = snapshot;
    },
    getSkillEditorLastSavedSnapshotEvent: () => SKILL_EDITOR_LAST_SAVED_SNAPSHOT_Event,
    getSkillEditorLastSettingsTextEvent: () => SKILL_EDITOR_LAST_SETTINGS_TEXT_Event,
    getSkillEditorLastPresetStoreTextEvent: () => SKILL_EDITOR_LAST_PRESET_STORE_TEXT_Event,
  };
}
