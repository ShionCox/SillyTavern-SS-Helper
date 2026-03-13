import type {
  DicePluginSettingsEvent,
  SkillEditorRowDraftEvent,
  SkillPresetEvent,
  SkillPresetStoreEvent,
} from "../types/eventDomainEvent";
import { buildSharedBoxCheckbox } from "../../../_Components/sharedBoxCheckbox";
import { buildSharedButton } from "../../../_Components/sharedButton";
import { buildSharedInputField } from "../../../_Components/sharedInput";
import { applySettingsTooltipsEvent } from "./uiCardEvent";
import { syncThemeControlClassesByNodeEvent } from "./uiThemeEvent";

let SKILL_EDITOR_PRESET_SEARCH_TEXT_Event = "";
let SKILL_EDITOR_PRESET_SORT_MODE_Event: "recent" | "name" | "count" = "recent";
let SKILL_EDITOR_ROW_SEARCH_TEXT_Event = "";
let SKILL_EDITOR_ROW_SORT_MODE_Event: "manual" | "name" | "modifier_desc" = "manual";
const SKILL_EDITOR_SELECTED_ROW_IDS_Event = new Set<string>();
let SKILL_PRESET_MARQUEE_RESIZE_BOUND_Event = false;
let SKILL_PRESET_MARQUEE_RESIZE_OBSERVER_Event: ResizeObserver | null = null;

function resolveSkillPresetMarqueeNodesEvent(marqueeElement: HTMLElement): {
  track: HTMLElement;
  segment: HTMLElement;
} | null {
  const track = marqueeElement.querySelector(
    '[data-st-roll-role="preset-name-track"]'
  ) as HTMLElement | null;
  const segment = marqueeElement.querySelector(
    '[data-st-roll-role="preset-name-segment"]'
  ) as HTMLElement | null;
  if (!track || !segment) return null;
  return { track, segment };
}

function refreshSingleSkillPresetMarqueeEvent(marqueeElement: HTMLElement): boolean {
  const nodes = resolveSkillPresetMarqueeNodesEvent(marqueeElement);
  if (!nodes) return false;
  const { track, segment } = nodes;

  const visibleWidth = Math.ceil(
    marqueeElement.clientWidth || marqueeElement.getBoundingClientRect().width || 0
  );
  const contentWidth = Math.ceil(
    segment.scrollWidth || segment.getBoundingClientRect().width || 0
  );
  if (visibleWidth <= 0 || contentWidth <= 0) return false;

  track.style.removeProperty("--st-roll-preset-marquee-distance");
  track.style.removeProperty("--st-roll-preset-marquee-duration");
  marqueeElement.classList.remove("is-overflowing");

  const overflowWidth = contentWidth - visibleWidth;
  if (overflowWidth <= 2) return true;

  marqueeElement.classList.add("is-overflowing");
  track.style.setProperty("--st-roll-preset-marquee-distance", `-${overflowWidth}px`);
  track.style.setProperty(
    "--st-roll-preset-marquee-duration",
    `${Math.max(6, Math.min(18, overflowWidth / 18 + 4))}s`
  );
  return true;
}

function refreshSkillPresetMarqueeEvent(root: ParentNode = document): void {
  const marquees: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches('[data-st-roll-role="preset-name-marquee"]')) {
    marquees.push(root);
  }
  root
    .querySelectorAll?.('[data-st-roll-role="preset-name-marquee"]')
    .forEach((marquee) => {
      if (marquee instanceof HTMLElement) {
        marquees.push(marquee);
      }
    });
  if (marquees.length === 0) return;
  marquees.forEach((marqueeElement) => {
    refreshSingleSkillPresetMarqueeEvent(marqueeElement);
  });
}

function ensureSkillPresetMarqueeResizeBindingEvent(): void {
  if (SKILL_PRESET_MARQUEE_RESIZE_BOUND_Event) return;
  SKILL_PRESET_MARQUEE_RESIZE_BOUND_Event = true;
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(() => {
      refreshSkillPresetMarqueeEvent(document);
    });
  });
}

function observeSkillPresetMarqueeLayoutEvent(root: HTMLElement | null): void {
  if (!(root instanceof HTMLElement) || typeof ResizeObserver === "undefined") return;
  if (!SKILL_PRESET_MARQUEE_RESIZE_OBSERVER_Event) {
    SKILL_PRESET_MARQUEE_RESIZE_OBSERVER_Event = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.target instanceof HTMLElement) {
          refreshSkillPresetMarqueeEvent(entry.target);
        }
      });
    });
  }
  SKILL_PRESET_MARQUEE_RESIZE_OBSERVER_Event.observe(root);
}

export interface BindSkillPresetActionsDepsEvent {
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  SETTINGS_SKILL_PRESET_CREATE_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_RENAME_ID_Event: string;
  SKILL_PRESET_NEW_NAME_BASE_Event: string;
  SKILL_PRESET_DEFAULT_ID_Event: string;
  DEFAULT_SKILL_PRESET_TABLE_TEXT_Event: string;
  getSkillEditorActivePresetIdEvent: () => string;
  confirmDiscardSkillDraftEvent: () => boolean;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getSkillPresetStoreEvent: (settings: DicePluginSettingsEvent) => SkillPresetStoreEvent;
  getSkillPresetByIdEvent: (store: SkillPresetStoreEvent, presetId: string) => SkillPresetEvent | null;
  saveSkillPresetStoreEvent: (store: SkillPresetStoreEvent) => void;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  getUniqueSkillPresetNameEvent: (
    store: SkillPresetStoreEvent,
    baseName: string,
    excludeId?: string
  ) => string;
  createIdEvent: (prefix: string) => string;
  buildDefaultSkillPresetStoreEvent: () => SkillPresetStoreEvent;
  normalizeSkillPresetNameKeyEvent: (raw: string) => string;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
}

export function bindSkillPresetActionsEvent(deps: BindSkillPresetActionsDepsEvent): void {
  const skillPresetListWrap = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_LIST_ID_Event
  ) as HTMLElement | null;
  const skillPresetCreateBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_CREATE_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetDeleteBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetRestoreDefaultBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_RESTORE_DEFAULT_ID_Event
  ) as HTMLButtonElement | null;
  const skillPresetNameInput = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_NAME_ID_Event
  ) as HTMLInputElement | null;
  const skillPresetRenameBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_RENAME_ID_Event
  ) as HTMLButtonElement | null;

  skillPresetListWrap?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const presetBtn = target?.closest<HTMLButtonElement>("button[data-skill-preset-id]");
    if (!presetBtn) return;
    const nextPresetId = String(presetBtn.dataset.skillPresetId ?? "");
    if (!nextPresetId || nextPresetId === deps.getSkillEditorActivePresetIdEvent()) return;
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const preset = deps.getSkillPresetByIdEvent(store, nextPresetId);
    if (!preset) return;
    store.activePresetId = preset.id;
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetCreateBtn?.addEventListener("click", () => {
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    const now = Date.now();
    const name = deps.getUniqueSkillPresetNameEvent(store, deps.SKILL_PRESET_NEW_NAME_BASE_Event);
    const newPreset: SkillPresetEvent = {
      id: deps.createIdEvent("skill_preset"),
      name,
      locked: false,
      skillTableText: activePreset.skillTableText,
      createdAt: now,
      updatedAt: now,
    };
    store.presets.push(newPreset);
    store.activePresetId = newPreset.id;
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetDeleteBtn?.addEventListener("click", () => {
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    if (activePreset.locked) {
      deps.appendToConsoleEvent("⚠️ 默认预设不可删除。", "warn");
      return;
    }
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const confirmed = window.confirm(`确认删除预设「${activePreset.name}」吗？`);
    if (!confirmed) return;
    store.presets = store.presets.filter((preset) => preset.id !== activePreset.id);
    const fallbackPreset =
      deps.getSkillPresetByIdEvent(store, deps.SKILL_PRESET_DEFAULT_ID_Event) ??
      store.presets[0] ??
      null;
    if (!fallbackPreset) {
      store.presets = deps.buildDefaultSkillPresetStoreEvent().presets;
      store.activePresetId = deps.SKILL_PRESET_DEFAULT_ID_Event;
    } else {
      store.activePresetId = fallbackPreset.id;
    }
    deps.saveSkillPresetStoreEvent(store);
  });

  skillPresetRestoreDefaultBtn?.addEventListener("click", () => {
    if (!deps.confirmDiscardSkillDraftEvent()) return;
    const confirmed = window.confirm("确认将默认预设恢复为内置技能表吗？这会覆盖默认预设当前内容。");
    if (!confirmed) return;
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    let defaultPreset = deps.getSkillPresetByIdEvent(store, deps.SKILL_PRESET_DEFAULT_ID_Event);
    if (!defaultPreset) {
      const fallbackStore = deps.buildDefaultSkillPresetStoreEvent();
      const fallbackDefault =
        deps.getSkillPresetByIdEvent(fallbackStore, deps.SKILL_PRESET_DEFAULT_ID_Event) ??
        fallbackStore.presets[0] ??
        null;
      if (!fallbackDefault) return;
      store.presets.unshift(fallbackDefault);
      defaultPreset = fallbackDefault;
    }
    defaultPreset.locked = true;
    defaultPreset.skillTableText = deps.DEFAULT_SKILL_PRESET_TABLE_TEXT_Event;
    defaultPreset.updatedAt = Date.now();
    deps.saveSkillPresetStoreEvent(store);
    deps.renderSkillValidationErrorsEvent([]);
    deps.appendToConsoleEvent("技能编辑器：默认预设已恢复。");
  });

  const handlePresetRename = () => {
    const nextName = String(skillPresetNameInput?.value ?? "").trim();
    if (!nextName) {
      deps.renderSkillValidationErrorsEvent(["预设名称不能为空。"]);
      return;
    }
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    const duplicated = store.presets.some(
      (preset) =>
        preset.id !== activePreset.id &&
        deps.normalizeSkillPresetNameKeyEvent(preset.name) ===
        deps.normalizeSkillPresetNameKeyEvent(nextName)
    );
    if (duplicated) {
      deps.renderSkillValidationErrorsEvent(["预设名称重复，请使用其他名称。"]);
      return;
    }
    activePreset.name = nextName;
    activePreset.updatedAt = Date.now();
    deps.saveSkillPresetStoreEvent(store);
    deps.renderSkillValidationErrorsEvent([]);
  };

  skillPresetRenameBtn?.addEventListener("click", handlePresetRename);
  skillPresetNameInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handlePresetRename();
  });
}

export interface BindSkillRowsEditingActionsDepsEvent {
  SETTINGS_SKILL_ROWS_ID_Event: string;
  SETTINGS_SKILL_ADD_ID_Event: string;
  skillDraftAccessorEvent: SkillDraftAccessorEvent;
  createSkillEditorRowDraftEvent: (skillName: string, modifierText: string) => SkillEditorRowDraftEvent;
  renderSkillRowsEvent: () => void;
  refreshSkillDraftDirtyStateEvent: () => void;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
}

export interface SkillDraftAccessorEvent {
  getRows: () => SkillEditorRowDraftEvent[];
  setRows: (rows: SkillEditorRowDraftEvent[]) => void;
  getSnapshot: () => string;
  setSnapshot: (snapshot: string) => void;
}

export interface CreateSkillDraftAccessorDepsEvent {
  getRowsEvent: () => SkillEditorRowDraftEvent[];
  setRowsEvent: (rows: SkillEditorRowDraftEvent[]) => void;
  getSnapshotEvent: () => string;
  setSnapshotEvent: (snapshot: string) => void;
}

/**
 * 创建技能草稿访问器（纯函数）。
 * 说明：此访问器是技能草稿状态唯一入口。
 */
export function createSkillDraftAccessorEvent(
  deps: CreateSkillDraftAccessorDepsEvent
): SkillDraftAccessorEvent {
  return {
    getRows: deps.getRowsEvent,
    setRows: deps.setRowsEvent,
    getSnapshot: deps.getSnapshotEvent,
    setSnapshot: deps.setSnapshotEvent,
  };
}

export function bindSkillRowsEditingActionsEvent(deps: BindSkillRowsEditingActionsDepsEvent): void {
  const skillRowsWrap = document.getElementById(deps.SETTINGS_SKILL_ROWS_ID_Event) as HTMLElement | null;
  const skillAddBtn = document.getElementById(deps.SETTINGS_SKILL_ADD_ID_Event) as HTMLButtonElement | null;
  const skillModal = skillRowsWrap?.closest(".st-roll-skill-modal") as HTMLElement | null;
  const presetSearchInput = skillModal?.querySelector(".st-roll-skill-preset-search") as HTMLInputElement | null;
  const presetSortInput = skillModal?.querySelector(".st-roll-skill-preset-sort") as HTMLSelectElement | null;
  const rowSearchInput = skillModal?.querySelector(".st-roll-skill-row-search") as HTMLInputElement | null;
  const rowSortInput = skillModal?.querySelector(".st-roll-skill-row-sort") as HTMLSelectElement | null;
  const selectVisibleBtn = skillModal?.querySelector(".st-roll-skill-select-visible") as HTMLButtonElement | null;
  const clearSelectionBtn = skillModal?.querySelector(".st-roll-skill-clear-selection") as HTMLButtonElement | null;
  const batchDeleteBtn = skillModal?.querySelector(".st-roll-skill-batch-delete") as HTMLButtonElement | null;

  if (skillRowsWrap?.dataset.skillWorkbenchBound !== "1") {
    skillRowsWrap?.setAttribute("data-skill-workbench-bound", "1");

    presetSearchInput?.addEventListener("input", () => {
      SKILL_EDITOR_PRESET_SEARCH_TEXT_Event = String(presetSearchInput.value ?? "");
      deps.renderSkillRowsEvent();
    });

    presetSortInput?.addEventListener("change", () => {
      const next = String(presetSortInput.value ?? "recent");
      SKILL_EDITOR_PRESET_SORT_MODE_Event =
        next === "name" || next === "count" ? next : "recent";
      deps.renderSkillRowsEvent();
    });

    rowSearchInput?.addEventListener("input", () => {
      SKILL_EDITOR_ROW_SEARCH_TEXT_Event = String(rowSearchInput.value ?? "");
      deps.renderSkillRowsEvent();
    });

    rowSortInput?.addEventListener("change", () => {
      const next = String(rowSortInput.value ?? "manual");
      SKILL_EDITOR_ROW_SORT_MODE_Event =
        next === "name" || next === "modifier_desc" ? next : "manual";
      deps.renderSkillRowsEvent();
    });

    selectVisibleBtn?.addEventListener("click", () => {
      getVisibleSkillRowsEvent(deps.skillDraftAccessorEvent.getRows()).forEach((row) => {
        SKILL_EDITOR_SELECTED_ROW_IDS_Event.add(String(row.rowId ?? ""));
      });
      deps.renderSkillRowsEvent();
    });

    clearSelectionBtn?.addEventListener("click", () => {
      SKILL_EDITOR_SELECTED_ROW_IDS_Event.clear();
      deps.renderSkillRowsEvent();
    });

    batchDeleteBtn?.addEventListener("click", () => {
      if (SKILL_EDITOR_SELECTED_ROW_IDS_Event.size <= 0) return;
      const rows = deps
        .skillDraftAccessorEvent
        .getRows()
        .filter((row) => !SKILL_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")));
      SKILL_EDITOR_SELECTED_ROW_IDS_Event.clear();
      deps.skillDraftAccessorEvent.setRows(rows);
      deps.renderSkillRowsEvent();
      deps.refreshSkillDraftDirtyStateEvent();
      deps.renderSkillValidationErrorsEvent([]);
    });
  }

  skillRowsWrap?.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const rowId = String(target.dataset.skillRowId ?? "");
    const field = String(target.dataset.skillField ?? "");
    if (!rowId || !field) return;
    const rows = deps.skillDraftAccessorEvent.getRows();
    const row = rows.find((item) => item.rowId === rowId);
    if (!row) return;
    if (field === "name") {
      row.skillName = target.value;
    } else if (field === "modifier") {
      row.modifierText = target.value;
    }
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillRowsWrap?.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement | null;
    if (!target) return;
    const rowId = String(target.dataset.skillSelectId ?? "");
    if (!rowId) return;
    if (target.checked) {
      SKILL_EDITOR_SELECTED_ROW_IDS_Event.add(rowId);
    } else {
      SKILL_EDITOR_SELECTED_ROW_IDS_Event.delete(rowId);
    }
    syncSkillWorkbenchToolbarStateEvent(deps.skillDraftAccessorEvent.getRows());
  });

  skillRowsWrap?.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const duplicateBtn = target?.closest<HTMLButtonElement>("button[data-skill-duplicate-id]");
    if (duplicateBtn) {
      const rowId = String(duplicateBtn.dataset.skillDuplicateId ?? "");
      const rows = deps.skillDraftAccessorEvent.getRows();
      const rowIndex = rows.findIndex((row) => row.rowId === rowId);
      if (rowIndex < 0) return;
      const row = rows[rowIndex];
      const nextRows = [...rows];
      nextRows.splice(
        rowIndex + 1,
        0,
        deps.createSkillEditorRowDraftEvent(String(row.skillName ?? ""), String(row.modifierText ?? ""))
      );
      deps.skillDraftAccessorEvent.setRows(nextRows);
      deps.renderSkillRowsEvent();
      deps.refreshSkillDraftDirtyStateEvent();
      deps.renderSkillValidationErrorsEvent([]);
      return;
    }

    const moveBtn = target?.closest<HTMLButtonElement>("button[data-skill-move-id]");
    if (moveBtn) {
      const rowId = String(moveBtn.dataset.skillMoveId ?? "");
      const direction = String(moveBtn.dataset.skillMoveDirection ?? "");
      const rows = [...deps.skillDraftAccessorEvent.getRows()];
      const rowIndex = rows.findIndex((row) => row.rowId === rowId);
      if (rowIndex < 0) return;
      const nextIndex = direction === "up" ? rowIndex - 1 : rowIndex + 1;
      if (nextIndex < 0 || nextIndex >= rows.length) return;
      const [row] = rows.splice(rowIndex, 1);
      rows.splice(nextIndex, 0, row);
      deps.skillDraftAccessorEvent.setRows(rows);
      deps.renderSkillRowsEvent();
      deps.refreshSkillDraftDirtyStateEvent();
      deps.renderSkillValidationErrorsEvent([]);
      return;
    }

    const removeBtn = target?.closest<HTMLButtonElement>("button[data-skill-remove-id]");
    if (!removeBtn) return;
    const rowId = String(removeBtn.dataset.skillRemoveId ?? "");
    if (!rowId) return;
    SKILL_EDITOR_SELECTED_ROW_IDS_Event.delete(rowId);
    const rows = deps.skillDraftAccessorEvent.getRows().filter((row) => row.rowId !== rowId);
    deps.skillDraftAccessorEvent.setRows(rows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillAddBtn?.addEventListener("click", () => {
    const rows = [
      ...deps.skillDraftAccessorEvent.getRows(),
      deps.createSkillEditorRowDraftEvent("", ""),
    ];
    deps.skillDraftAccessorEvent.setRows(rows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });
}

export interface BindSkillImportExportActionsDepsEvent {
  SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event: string;
  SETTINGS_SKILL_IMPORT_AREA_ID_Event: string;
  SETTINGS_SKILL_TEXT_ID_Event: string;
  SETTINGS_SKILL_IMPORT_APPLY_ID_Event: string;
  SETTINGS_SKILL_EXPORT_ID_Event: string;
  SETTINGS_SKILL_SAVE_ID_Event: string;
  SETTINGS_SKILL_RESET_ID_Event: string;
  skillDraftAccessorEvent: SkillDraftAccessorEvent;
  serializeSkillRowsToSkillTableTextEvent: (rows: SkillEditorRowDraftEvent[]) => string | null;
  getSettingsEvent: () => DicePluginSettingsEvent;
  getSkillPresetStoreEvent: (settings: DicePluginSettingsEvent) => SkillPresetStoreEvent;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  normalizeSkillTableTextForSettingsEvent: (raw: string) => string | null;
  deserializeSkillTableTextToRowsEvent: (skillTableText: string) => SkillEditorRowDraftEvent[];
  validateSkillRowsEvent: (rows: SkillEditorRowDraftEvent[]) => {
    errors: string[];
    table: Record<string, number>;
  };
  renderSkillRowsEvent: () => void;
  refreshSkillDraftDirtyStateEvent: () => void;
  renderSkillValidationErrorsEvent: (errors: string[]) => void;
  copyTextToClipboardEvent: (text: string) => Promise<boolean>;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  buildSkillDraftSnapshotEvent: (rows: SkillEditorRowDraftEvent[]) => string;
  setSkillDraftDirtyEvent: (flag: boolean) => void;
  saveSkillPresetStoreEvent: (store: SkillPresetStoreEvent) => void;
}

export function bindSkillImportExportActionsEvent(
  deps: BindSkillImportExportActionsDepsEvent
): void {
  const skillImportToggleBtn = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_TOGGLE_ID_Event
  ) as HTMLButtonElement | null;
  const skillImportArea = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_AREA_ID_Event
  ) as HTMLElement | null;
  const skillTextInput = document.getElementById(
    deps.SETTINGS_SKILL_TEXT_ID_Event
  ) as HTMLTextAreaElement | null;
  const skillImportApplyBtn = document.getElementById(
    deps.SETTINGS_SKILL_IMPORT_APPLY_ID_Event
  ) as HTMLButtonElement | null;
  const skillExportBtn = document.getElementById(
    deps.SETTINGS_SKILL_EXPORT_ID_Event
  ) as HTMLButtonElement | null;
  const skillSaveBtn = document.getElementById(
    deps.SETTINGS_SKILL_SAVE_ID_Event
  ) as HTMLButtonElement | null;
  const skillResetBtn = document.getElementById(
    deps.SETTINGS_SKILL_RESET_ID_Event
  ) as HTMLButtonElement | null;

  skillImportToggleBtn?.addEventListener("click", () => {
    if (!skillImportArea) return;
    const willOpen = skillImportArea.hidden;
    skillImportArea.hidden = !willOpen;
    skillImportToggleBtn.textContent = willOpen ? "收起导入" : "导入 JSON";
    if (!willOpen || !skillTextInput) return;
    const serialized = deps.serializeSkillRowsToSkillTableTextEvent(deps.skillDraftAccessorEvent.getRows());
    skillTextInput.value =
      serialized ??
      deps.getActiveSkillPresetEvent(deps.getSkillPresetStoreEvent(deps.getSettingsEvent())).skillTableText;
  });

  skillImportApplyBtn?.addEventListener("click", () => {
    const raw = String(skillTextInput?.value ?? "");
    if (deps.normalizeSkillTableTextForSettingsEvent(raw) == null) {
      deps.renderSkillValidationErrorsEvent([
        "导入失败：必须是 JSON 对象（例如 {\"察觉\":15,\"说服\":8}）。",
      ]);
      return;
    }
    const importedRows = deps.deserializeSkillTableTextToRowsEvent(raw);
    const validation = deps.validateSkillRowsEvent(importedRows);
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent(validation.errors);
      return;
    }
    deps.skillDraftAccessorEvent.setRows(importedRows);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });

  skillExportBtn?.addEventListener("click", () => {
    const validation = deps.validateSkillRowsEvent(deps.skillDraftAccessorEvent.getRows());
    const settings = deps.getSettingsEvent();
    const activePreset = deps.getActiveSkillPresetEvent(deps.getSkillPresetStoreEvent(settings));
    const exportText = validation.errors.length
      ? activePreset.skillTableText
      : JSON.stringify(validation.table, null, 2);
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent([
        "当前草稿有校验错误，已导出已保存的技能表。",
      ]);
    } else {
      deps.renderSkillValidationErrorsEvent([]);
    }
    deps.copyTextToClipboardEvent(exportText).then((ok) => {
      if (ok) {
        deps.appendToConsoleEvent("✅ 技能表 JSON 已复制到剪贴板。");
        return;
      }
      if (skillImportArea) {
        skillImportArea.hidden = false;
      }
      if (skillImportToggleBtn) {
        skillImportToggleBtn.textContent = "收起导入";
      }
      if (skillTextInput) {
        skillTextInput.value = exportText;
      }
      deps.appendToConsoleEvent("⚠️ 剪贴板不可用，请在导入框中手动复制 JSON。", "warn");
    });
  });

  skillSaveBtn?.addEventListener("click", () => {
    const validation = deps.validateSkillRowsEvent(deps.skillDraftAccessorEvent.getRows());
    if (validation.errors.length > 0) {
      deps.renderSkillValidationErrorsEvent(validation.errors);
      deps.appendToConsoleEvent("❌ 技能表保存失败，请先修正校验错误。", "error");
      return;
    }
    const normalized = JSON.stringify(validation.table, null, 2);
    const normalizedRows = deps.deserializeSkillTableTextToRowsEvent(normalized);
    deps.skillDraftAccessorEvent.setRows(normalizedRows);
    deps.skillDraftAccessorEvent.setSnapshot(deps.buildSkillDraftSnapshotEvent(normalizedRows));
    const settings = deps.getSettingsEvent();
    const store = deps.getSkillPresetStoreEvent(settings);
    const activePreset = deps.getActiveSkillPresetEvent(store);
    activePreset.skillTableText = normalized;
    activePreset.updatedAt = Date.now();
    deps.renderSkillRowsEvent();
    deps.setSkillDraftDirtyEvent(false);
    deps.renderSkillValidationErrorsEvent([]);
    deps.saveSkillPresetStoreEvent(store);
    if (skillTextInput) {
      skillTextInput.value = normalized;
    }
  });

  skillResetBtn?.addEventListener("click", () => {
    deps.skillDraftAccessorEvent.setRows([]);
    deps.renderSkillRowsEvent();
    deps.refreshSkillDraftDirtyStateEvent();
    deps.renderSkillValidationErrorsEvent([]);
  });
}

export interface ConfirmDiscardSkillDraftDepsEvent {
  isSkillDraftDirtyEvent: () => boolean;
  hydrateSkillDraftFromSettingsEvent: (resetDirty?: boolean) => void;
}

export function confirmDiscardSkillDraftEvent(
  deps: ConfirmDiscardSkillDraftDepsEvent
): boolean {
  if (!deps.isSkillDraftDirtyEvent()) return true;
  const confirmed = window.confirm("技能改动未保存，是否丢弃并继续？");
  if (!confirmed) return false;
  deps.hydrateSkillDraftFromSettingsEvent(true);
  return true;
}

export function isElementVisibleEvent(element: HTMLElement | null): boolean {
  if (!element || element.hidden) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function copyTextToClipboardEvent(text: string): Promise<boolean> {
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.resolve(false);
  }
  return navigator.clipboard
    .writeText(text)
    .then(() => true)
    .catch(() => false);
}

export interface RenderSkillValidationErrorsDepsEvent {
  SETTINGS_SKILL_ERRORS_ID_Event: string;
  escapeHtmlEvent: (input: string) => string;
}

export function renderSkillValidationErrorsEvent(
  errors: string[],
  deps: RenderSkillValidationErrorsDepsEvent
): void {
  const errorWrap = document.getElementById(deps.SETTINGS_SKILL_ERRORS_ID_Event) as HTMLElement | null;
  if (!errorWrap) return;
  if (!errors.length) {
    errorWrap.hidden = true;
    errorWrap.innerHTML = "";
    return;
  }
  errorWrap.hidden = false;
  errorWrap.innerHTML = errors
    .map((item) => `<div class="st-roll-skill-error-item">${deps.escapeHtmlEvent(item)}</div>`)
    .join("");
}

/**
 * 功能：根据当前工作台筛选与排序状态，返回可见的技能预设列表。
 * @param store 技能预设仓库
 * @param countSkillEntriesFromSkillTableTextEvent 统计技能数量的方法
 * @param activeDraftCountEvent 当前草稿技能数
 * @returns 过滤排序后的技能预设列表
 */
function getVisibleSkillPresetsEvent(
  store: SkillPresetStoreEvent,
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number,
  activeDraftCountEvent?: number | null
): SkillPresetEvent[] {
  const keyword = String(SKILL_EDITOR_PRESET_SEARCH_TEXT_Event ?? "").trim().toLowerCase();
  const activePresetId = String(store.activePresetId ?? "");
  const next = [...store.presets].filter((preset) => {
    if (!keyword) return true;
    return String(preset.name ?? "").trim().toLowerCase().includes(keyword);
  });

  next.sort((left, right) => {
    if (SKILL_EDITOR_PRESET_SORT_MODE_Event === "name") {
      return String(left.name ?? "").localeCompare(String(right.name ?? ""), "zh-Hans-CN");
    }
    if (SKILL_EDITOR_PRESET_SORT_MODE_Event === "count") {
      const leftCount =
        left.id === activePresetId && Number.isFinite(Number(activeDraftCountEvent))
          ? Number(activeDraftCountEvent)
          : countSkillEntriesFromSkillTableTextEvent(left.skillTableText);
      const rightCount =
        right.id === activePresetId && Number.isFinite(Number(activeDraftCountEvent))
          ? Number(activeDraftCountEvent)
          : countSkillEntriesFromSkillTableTextEvent(right.skillTableText);
      if (leftCount !== rightCount) return rightCount - leftCount;
      return String(left.name ?? "").localeCompare(String(right.name ?? ""), "zh-Hans-CN");
    }
    return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
  });
  return next;
}

/**
 * 功能：根据当前工作台筛选与排序状态，返回可见的技能行。
 * @param rows 全量技能草稿行
 * @returns 过滤排序后的技能草稿行列表
 */
function getVisibleSkillRowsEvent(rows: SkillEditorRowDraftEvent[]): SkillEditorRowDraftEvent[] {
  const keyword = String(SKILL_EDITOR_ROW_SEARCH_TEXT_Event ?? "").trim().toLowerCase();
  const filtered = [...rows].filter((row) => {
    if (!keyword) return true;
    return String(row.skillName ?? "").trim().toLowerCase().includes(keyword);
  });

  if (SKILL_EDITOR_ROW_SORT_MODE_Event === "name") {
    filtered.sort((left, right) =>
      String(left.skillName ?? "").localeCompare(String(right.skillName ?? ""), "zh-Hans-CN")
    );
  } else if (SKILL_EDITOR_ROW_SORT_MODE_Event === "modifier_desc") {
    filtered.sort((left, right) => {
      const leftValue = Number(left.modifierText ?? 0) || 0;
      const rightValue = Number(right.modifierText ?? 0) || 0;
      if (leftValue !== rightValue) return rightValue - leftValue;
      return String(left.skillName ?? "").localeCompare(String(right.skillName ?? ""), "zh-Hans-CN");
    });
  }
  return filtered;
}

/**
 * 功能：刷新技能编辑器工具栏状态显示。
 * @param rows 当前技能草稿行
 * @returns 无返回值
 */
function syncSkillWorkbenchToolbarStateEvent(rows: SkillEditorRowDraftEvent[]): void {
  const modal = document.querySelector(".st-roll-skill-modal") as HTMLElement | null;
  if (!modal) return;
  const validIds = new Set(rows.map((row) => String(row.rowId ?? "")));
  Array.from(SKILL_EDITOR_SELECTED_ROW_IDS_Event).forEach((rowId) => {
    if (!validIds.has(rowId)) {
      SKILL_EDITOR_SELECTED_ROW_IDS_Event.delete(rowId);
    }
  });

  const visibleRows = getVisibleSkillRowsEvent(rows);
  const selectedVisibleCount = visibleRows.filter((row) =>
    SKILL_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? ""))
  ).length;
  const selectedCount = SKILL_EDITOR_SELECTED_ROW_IDS_Event.size;
  const countNode = modal.querySelector(".st-roll-skill-selection-count") as HTMLElement | null;
  if (countNode) {
    countNode.textContent =
      selectedVisibleCount > 0 && selectedVisibleCount !== selectedCount
        ? `已选 ${selectedCount} 项（可见 ${selectedVisibleCount} 项）`
        : `已选 ${selectedCount} 项`;
  }

  const batchDeleteBtn = modal.querySelector(".st-roll-skill-batch-delete") as HTMLButtonElement | null;
  if (batchDeleteBtn) batchDeleteBtn.disabled = selectedCount <= 0;

  const clearSelectionBtn = modal.querySelector(".st-roll-skill-clear-selection") as HTMLButtonElement | null;
  if (clearSelectionBtn) clearSelectionBtn.disabled = selectedCount <= 0;

  const selectVisibleBtn = modal.querySelector(".st-roll-skill-select-visible") as HTMLButtonElement | null;
  if (selectVisibleBtn) selectVisibleBtn.disabled = visibleRows.length <= 0;
}

export interface RenderSkillPresetListDepsEvent {
  SETTINGS_SKILL_PRESET_LIST_ID_Event: string;
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number;
  escapeAttrEvent: (input: string) => string;
  escapeHtmlEvent: (input: string) => string;
  activeDraftCountEvent?: number | null;
}

export function renderSkillPresetListEvent(
  store: SkillPresetStoreEvent,
  deps: RenderSkillPresetListDepsEvent
): void {
  const listWrap = document.getElementById(deps.SETTINGS_SKILL_PRESET_LIST_ID_Event) as HTMLElement | null;
  if (!listWrap) return;
  if (!store.presets.length) {
    listWrap.innerHTML = `<div class="st-roll-skill-preset-empty">暂无预设</div>`;
    syncThemeControlClassesByNodeEvent(listWrap);
    return;
  }
  const visiblePresets = getVisibleSkillPresetsEvent(
    store,
    deps.countSkillEntriesFromSkillTableTextEvent,
    deps.activeDraftCountEvent
  );
  if (!visiblePresets.length) {
    listWrap.innerHTML = `<div class="st-roll-skill-preset-empty">没有匹配的预设</div>`;
    syncThemeControlClassesByNodeEvent(listWrap);
    return;
  }
  listWrap.innerHTML = visiblePresets
    .map((preset) => {
      const isActive = preset.id === store.activePresetId;
      const skillCount =
        isActive && Number.isFinite(Number(deps.activeDraftCountEvent))
          ? Number(deps.activeDraftCountEvent)
          : deps.countSkillEntriesFromSkillTableTextEvent(preset.skillTableText);
      const presetId = deps.escapeAttrEvent(preset.id);
      const presetName = deps.escapeHtmlEvent(preset.name);
      return `
        <button type="button" class="st-roll-skill-preset-item ${isActive ? "is-active" : ""}" data-skill-preset-id="${presetId}">
          <span class="st-roll-skill-preset-name-marquee" data-st-roll-role="preset-name-marquee">
            <span class="st-roll-skill-preset-name-track" data-st-roll-role="preset-name-track">
              <span class="st-roll-skill-preset-name" data-st-roll-role="preset-name-segment">${presetName}</span>
            </span>
          </span>
          <span class="st-roll-skill-preset-tags">
            <span class="st-roll-skill-preset-tag">${skillCount}</span>
            ${isActive ? `<span class="st-roll-skill-preset-tag active">生效中</span>` : ""}
            ${preset.locked ? `<span class="st-roll-skill-preset-tag locked">默认</span>` : ""}
          </span>
        </button>
      `;
    })
    .join("");
  syncThemeControlClassesByNodeEvent(listWrap);
  ensureSkillPresetMarqueeResizeBindingEvent();
  observeSkillPresetMarqueeLayoutEvent(listWrap);
  refreshSkillPresetMarqueeEvent(listWrap);
  window.requestAnimationFrame(() => {
    refreshSkillPresetMarqueeEvent(listWrap);
  });
}

export interface RenderSkillPresetMetaDepsEvent {
  SETTINGS_SKILL_PRESET_META_ID_Event: string;
  SETTINGS_SKILL_PRESET_NAME_ID_Event: string;
  SETTINGS_SKILL_PRESET_DELETE_ID_Event: string;
  countSkillEntriesFromSkillTableTextEvent: (skillTableText: string) => number;
  getActiveSkillPresetEvent: (store: SkillPresetStoreEvent) => SkillPresetEvent;
  activeDraftCountEvent?: number | null;
}

export function renderSkillPresetMetaEvent(
  store: SkillPresetStoreEvent,
  deps: RenderSkillPresetMetaDepsEvent
): void {
  const activePreset = deps.getActiveSkillPresetEvent(store);
  const meta = document.getElementById(deps.SETTINGS_SKILL_PRESET_META_ID_Event) as HTMLElement | null;
  if (meta) {
    const count = Number.isFinite(Number(deps.activeDraftCountEvent))
      ? Number(deps.activeDraftCountEvent)
      : deps.countSkillEntriesFromSkillTableTextEvent(activePreset.skillTableText);
    const visiblePresetCount = getVisibleSkillPresetsEvent(
      store,
      deps.countSkillEntriesFromSkillTableTextEvent,
      deps.activeDraftCountEvent
    ).length;
    meta.textContent = `当前：${activePreset.name} · 技能 ${count} 项 · 可见预设 ${visiblePresetCount}/${store.presets.length}`;
  }
  const nameInput = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_NAME_ID_Event
  ) as HTMLInputElement | null;
  if (nameInput && nameInput.value !== activePreset.name) {
    nameInput.value = activePreset.name;
  }
  const deleteBtn = document.getElementById(
    deps.SETTINGS_SKILL_PRESET_DELETE_ID_Event
  ) as HTMLButtonElement | null;
  if (deleteBtn) {
    deleteBtn.disabled = activePreset.locked;
    deleteBtn.style.opacity = activePreset.locked ? "0.5" : "1";
    if (activePreset.locked) {
      deleteBtn.dataset.tip = "默认预设不可删除";
    } else {
      deleteBtn.removeAttribute("data-tip");
    }
  }
}

export interface RenderSkillRowsDepsEvent {
  SETTINGS_SKILL_ROWS_ID_Event: string;
  escapeAttrEvent: (input: string) => string;
}

export function renderSkillRowsEvent(
  rows: SkillEditorRowDraftEvent[],
  deps: RenderSkillRowsDepsEvent
): void {
  const rowsWrap = document.getElementById(deps.SETTINGS_SKILL_ROWS_ID_Event) as HTMLElement | null;
  if (!rowsWrap) return;
  const visibleRows = getVisibleSkillRowsEvent(rows);
  syncSkillWorkbenchToolbarStateEvent(rows);
  if (!rows.length) {
    rowsWrap.innerHTML = `<div class="st-roll-skill-empty">暂无技能，点击“新增技能”开始配置。</div>`;
    syncThemeControlClassesByNodeEvent(rowsWrap);
    applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-skill-modal") || rowsWrap);
    return;
  }
  if (!visibleRows.length) {
    rowsWrap.innerHTML = `<div class="st-roll-skill-empty">没有匹配的技能</div>`;
    syncThemeControlClassesByNodeEvent(rowsWrap);
    applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-skill-modal") || rowsWrap);
    return;
  }
  rowsWrap.innerHTML = visibleRows
    .map((row) => {
      const rowId = deps.escapeAttrEvent(String(row.rowId ?? ""));
      const skillName = deps.escapeAttrEvent(String(row.skillName ?? ""));
      const modifierText = deps.escapeAttrEvent(String(row.modifierText ?? ""));
      return `
      <div class="st-roll-skill-row" data-row-id="${rowId}">
        <div class="st-roll-skill-name-wrap">
          ${buildSharedBoxCheckbox({
            id: `st-roll-skill-row-select-${rowId}`,
            containerClassName: "st-roll-skill-row-select",
            attributes: {
              "data-tip": "选择这条技能",
            },
            inputAttributes: {
              "data-skill-select-id": rowId,
              checked: SKILL_EDITOR_SELECTED_ROW_IDS_Event.has(String(row.rowId ?? "")),
            },
          })}
          ${buildSharedInputField({
            value: skillName,
            className: "st-roll-skill-name",
            attributes: {
              placeholder: "例如：察觉",
              "data-skill-row-id": rowId,
              "data-skill-field": "name",
              "data-tip": "技能名称。",
            },
          })}
        </div>
        ${buildSharedInputField({
          value: modifierText,
          type: "number",
          className: "st-roll-skill-modifier",
          attributes: {
            inputmode: "numeric",
            step: 1,
            placeholder: "例如：15",
            "data-skill-row-id": rowId,
            "data-skill-field": "modifier",
            "data-tip": "技能加值（整数）。",
          },
        })}
        <div class="st-roll-skill-actions-group">
          ${buildSharedButton({
            label: "复制",
            variant: "secondary",
            iconClassName: "fa-solid fa-copy",
            className: "st-roll-skill-duplicate st-roll-toolbar-icon-btn",
            attributes: {
              "data-skill-duplicate-id": rowId,
              "data-tip": "复制这条技能",
            },
          })}
          ${buildSharedButton({
            label: "上移",
            variant: "secondary",
            iconClassName: "fa-solid fa-arrow-up",
            className: "st-roll-skill-move-up st-roll-toolbar-icon-btn",
            attributes: {
              "data-skill-move-id": rowId,
              "data-skill-move-direction": "up",
              "data-tip": "上移这条技能",
            },
          })}
          ${buildSharedButton({
            label: "下移",
            variant: "secondary",
            iconClassName: "fa-solid fa-arrow-down",
            className: "st-roll-skill-move-down st-roll-toolbar-icon-btn",
            attributes: {
              "data-skill-move-id": rowId,
              "data-skill-move-direction": "down",
              "data-tip": "下移这条技能",
            },
          })}
          ${buildSharedButton({
            label: "删除",
            variant: "danger",
            iconClassName: "fa-solid fa-trash",
            className: "st-roll-skill-remove st-roll-toolbar-icon-btn",
            attributes: {
              "data-skill-remove-id": rowId,
              "data-tip": "删除这条技能",
            },
          })}
        </div>
      </div>
    `;
    })
    .join("");
  syncThemeControlClassesByNodeEvent(rowsWrap);
  applySettingsTooltipsEvent(rowsWrap.closest(".st-roll-skill-modal") || rowsWrap);
}
