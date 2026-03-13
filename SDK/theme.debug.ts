import type { SdkThemeSnapshot } from "./theme.snapshot";

/**
 * 功能：把主题诊断节点格式化为易读的短文本。
 * @param node 需要描述的节点。
 * @returns 节点摘要文本。
 */
export function describeSdkThemeNode(node: HTMLElement | null): string {
  if (!node) return "(null)";
  const tagName = node.tagName.toLowerCase();
  const idPart = node.id ? `#${node.id}` : "";
  const classList = Array.from(node.classList).slice(0, 4);
  const classPart = classList.length > 0 ? `.${classList.join(".")}` : "";
  const stxTheme = String(node.getAttribute("data-stx-theme") ?? "").trim();
  const stxMode = String(node.getAttribute("data-stx-theme-mode") ?? "").trim();
  const rollTheme = String(node.getAttribute("data-st-roll-theme") ?? "").trim();
  const attrs: string[] = [];
  if (stxTheme) attrs.push(`stx=${stxTheme}`);
  if (stxMode) attrs.push(`mode=${stxMode}`);
  if (rollTheme) attrs.push(`roll=${rollTheme}`);
  const attrPart = attrs.length > 0 ? ` [${attrs.join(" ")}]` : "";
  return `${tagName}${idPart}${classPart}${attrPart}`;
}

/**
 * 功能：收集目标节点向上的主题宿主链路。
 * @param target 当前触发主题解析的目标节点。
 * @returns 祖先链的摘要列表。
 */
export function collectSdkThemeNodeChain(target: HTMLElement): string[] {
  const chain: string[] = [];
  let current: HTMLElement | null = target;
  let guard = 0;
  while (current && guard < 8) {
    chain.push(describeSdkThemeNode(current));
    current = current.parentElement;
    guard += 1;
  }
  return chain;
}

/**
 * 功能：读取主题宿主上的关键样式值，供调试日志输出。
 * @param node 当前命中的主题宿主。
 * @returns 关键样式字段集合。
 */
export function readSdkThemeDebugStyle(node: HTMLElement): Record<string, string> {
  const style = getComputedStyle(node);
  return {
    color: String(style.color || "").trim(),
    backgroundColor: String(style.backgroundColor || "").trim(),
    backgroundImage: String(style.backgroundImage || "").trim(),
    stxThemeText: String(style.getPropertyValue("--stx-theme-text") || "").trim(),
    stxThemePanelBg: String(style.getPropertyValue("--stx-theme-panel-bg") || "").trim(),
    stxThemeSurface1: String(style.getPropertyValue("--stx-theme-surface-1") || "").trim(),
    stxThemeBorder: String(style.getPropertyValue("--stx-theme-border") || "").trim(),
    stxThemeShadow: String(style.getPropertyValue("--stx-theme-shadow") || "").trim(),
    stRollText: String(style.getPropertyValue("--st-roll-text") || "").trim(),
    stRollSelectPanelBg: String(style.getPropertyValue("--st-roll-select-panel-bg") || "").trim(),
  };
}

/**
 * 功能：构建主题解析调试快照的轻量视图。
 * @param snapshot 当前主题快照。
 * @returns 适合日志输出的裁剪结果。
 */
export function buildSdkThemeDebugSnapshotView(snapshot: SdkThemeSnapshot): Record<string, unknown> {
  return {
    mode: snapshot.mode,
    selection: snapshot.selection,
    text: snapshot.text,
    background: snapshot.background,
    backgroundSolid: snapshot.backgroundSolid,
    backgroundImage: snapshot.backgroundImage,
    border: snapshot.border,
    shadow: snapshot.shadow,
    surface1: snapshot.surface1,
    surface2: snapshot.surface2,
    focusRing: snapshot.focusRing,
  };
}
