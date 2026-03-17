import {
  ensureSdkFloatingToolbar,
  removeSdkFloatingToolbarGroup,
  SDK_FLOATING_TOOLBAR_ID,
} from "../../../SDK/toolbar";

const MEMORY_TOOLBAR_GROUP_ID = "memoryos";

let MEMORY_TOOLBAR_ACTIONS_BOUND = false;

function buildMemoryToolbarActions() {
  return [
    {
      key: "profile",
      iconClassName: "fa-solid fa-user-pen",
      tooltip: "快速打开画像编辑器",
      ariaLabel: "快速打开画像编辑器",
      buttonClassName: "stx-sdk-toolbar-action-memory-profile",
      attributes: {
        "data-memory-toolbar-open": "profile",
      },
      order: 10,
    },
    {
      key: "records",
      iconClassName: "fa-solid fa-database",
      tooltip: "快速打开记录编辑器",
      ariaLabel: "快速打开记录编辑器",
      buttonClassName: "stx-sdk-toolbar-action-memory-records",
      attributes: {
        "data-memory-toolbar-open": "records",
      },
      order: 20,
    },
  ];
}

export function ensureMemoryChatToolbar(): HTMLElement | null {
  return ensureSdkFloatingToolbar({
    toolbarId: SDK_FLOATING_TOOLBAR_ID,
    groupId: MEMORY_TOOLBAR_GROUP_ID,
    groupClassName: "stx-sdk-toolbar-group-memoryos",
    actions: buildMemoryToolbarActions(),
  });
}

export function removeMemoryChatToolbar(): void {
  removeSdkFloatingToolbarGroup({
    toolbarId: SDK_FLOATING_TOOLBAR_ID,
    groupId: MEMORY_TOOLBAR_GROUP_ID,
  });
}

export function bindMemoryChatToolbarActions(): void {
  if (MEMORY_TOOLBAR_ACTIONS_BOUND) return;
  MEMORY_TOOLBAR_ACTIONS_BOUND = true;

  document.addEventListener(
    "click",
    (event: Event) => {
      const target = event.target as HTMLElement | null;
      const actionButton = target?.closest<HTMLButtonElement>("button[data-memory-toolbar-open]");
      if (!actionButton) return;
      const action = String(actionButton.dataset.memoryToolbarOpen ?? "").trim().toLowerCase();
      if (!action) return;

      event.preventDefault();
      event.stopPropagation();

      void (async (): Promise<void> => {
        if (action === "profile") {
          const { openChatStrategyEditor } = await import("../ui/chatStrategyPanel");
          await openChatStrategyEditor();
          return;
        }
        if (action === "records") {
          const { openRecordEditor } = await import("../ui/recordEditorNext");
          await openRecordEditor();
        }
      })();
    },
    true
  );
}