export interface SharedFloatingPanelPositionEvent {
  left: number;
  top: number;
}

export interface SharedFloatingPanelOptionsEvent {
  panel: HTMLElement;
  handle: HTMLElement;
  draggingClassName?: string;
  mobileBreakpoint?: number;
  minMargin?: number;
  initialPosition?:
    | SharedFloatingPanelPositionEvent
    | ((panel: HTMLElement) => SharedFloatingPanelPositionEvent);
  allowPointerTargetEvent?: (target: HTMLElement) => boolean;
  onMobileLayoutEvent?: (panel: HTMLElement) => void;
}

function resolveFloatingMinMarginEvent(options: SharedFloatingPanelOptionsEvent): number {
  return Math.max(0, Math.floor(Number(options.minMargin) || 12));
}

function isFloatingMobileLayoutEvent(options: SharedFloatingPanelOptionsEvent): boolean {
  const breakpoint = Math.max(0, Math.floor(Number(options.mobileBreakpoint) || 680));
  return window.innerWidth <= breakpoint;
}

function getFloatingBindingKeyEvent(handle: HTMLElement): string {
  const base = handle.dataset.stxFloatingBindKey?.trim();
  if (base) {
    const safeBase = base.replace(/[^a-zA-Z0-9_]+/g, "_");
    return `stxFloatingBound_${safeBase}`;
  }
  return "stxFloatingBound";
}

export function resetSharedFloatingPanelPositionEvent(panel: HTMLElement): void {
  panel.style.removeProperty("left");
  panel.style.removeProperty("top");
  panel.style.removeProperty("right");
  panel.style.removeProperty("bottom");
  delete panel.dataset.stxFloatingPositioned;
}

export function clampSharedFloatingPanelPositionEvent(
  panel: HTMLElement,
  left: number,
  top: number,
  minMargin = 12
): SharedFloatingPanelPositionEvent {
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(minMargin, window.innerWidth - rect.width - minMargin);
  const maxTop = Math.max(minMargin, window.innerHeight - rect.height - minMargin);
  return {
    left: Math.min(Math.max(minMargin, left), maxLeft),
    top: Math.min(Math.max(minMargin, top), maxTop),
  };
}

export function applySharedFloatingPanelPositionEvent(
  panel: HTMLElement,
  left: number,
  top: number,
  minMargin = 12
): SharedFloatingPanelPositionEvent {
  const next = clampSharedFloatingPanelPositionEvent(panel, left, top, minMargin);
  panel.style.left = `${next.left}px`;
  panel.style.top = `${next.top}px`;
  panel.style.right = "auto";
  panel.style.bottom = "auto";
  panel.dataset.stxFloatingPositioned = "1";
  return next;
}

export function ensureSharedFloatingPanelPositionEvent(
  options: SharedFloatingPanelOptionsEvent
): SharedFloatingPanelPositionEvent | null {
  const { panel, onMobileLayoutEvent, initialPosition } = options;
  if (!(panel instanceof HTMLElement)) return null;
  if (isFloatingMobileLayoutEvent(options)) {
    resetSharedFloatingPanelPositionEvent(panel);
    onMobileLayoutEvent?.(panel);
    return null;
  }
  const minMargin = resolveFloatingMinMarginEvent(options);
  if (panel.dataset.stxFloatingPositioned === "1" && panel.style.left && panel.style.top) {
    const rect = panel.getBoundingClientRect();
    return applySharedFloatingPanelPositionEvent(panel, rect.left, rect.top, minMargin);
  }
  const fallbackRect = panel.getBoundingClientRect();
  const resolvedInitial =
    typeof initialPosition === "function"
      ? initialPosition(panel)
      : initialPosition ?? {
          left: Math.round((window.innerWidth - fallbackRect.width) / 2),
          top: minMargin,
        };
  return applySharedFloatingPanelPositionEvent(
    panel,
    Number(resolvedInitial.left) || 0,
    Number(resolvedInitial.top) || 0,
    minMargin
  );
}

export function bindSharedFloatingPanelDragEvent(
  options: SharedFloatingPanelOptionsEvent
): void {
  const { panel, handle, draggingClassName = "is-floating-dragging", allowPointerTargetEvent } = options;
  if (!(panel instanceof HTMLElement) || !(handle instanceof HTMLElement)) return;
  const bindingKey = getFloatingBindingKeyEvent(handle);
  if (panel.dataset[bindingKey] === "1") return;
  panel.dataset[bindingKey] = "1";

  let dragging = false;
  let pointerId: number | null = null;
  let offsetX = 0;
  let offsetY = 0;

  const stopDrag = (): void => {
    dragging = false;
    pointerId = null;
    panel.classList.remove(draggingClassName);
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    if (isFloatingMobileLayoutEvent(options)) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const allowTarget = allowPointerTargetEvent
      ? allowPointerTargetEvent(target)
      : !target.closest("button, input, select, textarea, a, label");
    if (!allowTarget) return;
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    dragging = true;
    pointerId = event.pointerId;
    offsetX = event.clientX - rect.left;
    offsetY = event.clientY - rect.top;
    panel.classList.add(draggingClassName);
    applySharedFloatingPanelPositionEvent(panel, rect.left, rect.top, resolveFloatingMinMarginEvent(options));
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  handle.addEventListener("pointermove", (event: PointerEvent) => {
    if (!dragging || pointerId !== event.pointerId) return;
    applySharedFloatingPanelPositionEvent(
      panel,
      event.clientX - offsetX,
      event.clientY - offsetY,
      resolveFloatingMinMarginEvent(options)
    );
    event.preventDefault();
  });

  const finishDrag = (event: PointerEvent): void => {
    if (!dragging || pointerId !== event.pointerId) return;
    if (handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    stopDrag();
  };

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);

  window.addEventListener("resize", () => {
    if (isFloatingMobileLayoutEvent(options)) {
      stopDrag();
      resetSharedFloatingPanelPositionEvent(panel);
      options.onMobileLayoutEvent?.(panel);
      return;
    }
    if (!panel.style.left || !panel.style.top) return;
    const rect = panel.getBoundingClientRect();
    applySharedFloatingPanelPositionEvent(panel, rect.left, rect.top, resolveFloatingMinMarginEvent(options));
  });
}
