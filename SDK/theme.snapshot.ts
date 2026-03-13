export type SdkThemeId = "default" | "dark" | "light" | "tavern" | "smart";
export type SdkThemeMode = "sdk" | "smart";
export type SdkThemePresetId = Exclude<SdkThemeId, "smart">;

export interface SdkThemeStateLike {
  mode: SdkThemeMode;
  themeId: SdkThemePresetId;
}

export interface SdkThemeSnapshot {
  mode: SdkThemeMode;
  selection: SdkThemeId;
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  background: string;
  backgroundSolid: string;
  backgroundImage: string;
  border: string;
  borderStrong: string;
  shadow: string;
  surface1: string;
  surface2: string;
  surface3: string;
  toolbarBackground: string;
  listItemBackground: string;
  hoverBackground: string;
  activeBackground: string;
  focusRing: string;
  backdrop: string;
  backdropFilter: string;
  cssVars: Record<string, string>;
}

const SDK_THEME_SOLID_BACKGROUND_DARK = "rgba(12, 8, 6, 0.96)";
const SDK_THEME_SOLID_BACKGROUND_LIGHT = "rgba(245, 249, 255, 0.96)";
const SDK_THEME_PROPERTY_ALIASES = {
  text: ["--stx-theme-text", "--SmartThemeBodyColor", "--st-roll-text"],
  textMuted: [
    "--stx-theme-text-muted",
    "--SmartThemeEmColor",
    "--st-roll-text-muted",
  ],
  accent: [
    "--stx-theme-accent",
    "--SmartThemeQuoteColor",
    "--st-roll-accent",
  ],
  accentContrast: [
    "--stx-theme-accent-contrast",
    "--SmartThemeQuoteTextColor",
    "--st-roll-accent-contrast",
    "--SmartThemeBodyColor",
  ],
  panelBackground: [
    "--stx-theme-panel-bg",
    "--st-roll-modal-panel-bg",
    "--st-roll-select-panel-bg",
    "--st-roll-workbench-toolbar-bg",
    "--st-roll-modal-head-bg",
    "--stx-theme-toolbar-bg",
    "--st-roll-workbench-panel-bg",
    "--st-roll-btn-bg",
    "--SmartThemeBlurTintColor",
    "--st-roll-content-bg",
    "--st-roll-control-bg",
    "--stx-theme-list-item-bg",
  ],
  border: [
    "--stx-theme-panel-border",
    "--st-roll-modal-panel-border",
    "--stx-theme-border",
    "--st-roll-control-border",
    "--SmartThemeBorderColor",
  ],
  borderStrong: [
    "--stx-theme-border-strong",
    "--st-roll-control-border-hover",
    "--st-roll-list-item-hover-border",
    "--st-roll-list-item-active-border",
    "--st-roll-control-focus-border",
    "--SmartThemeBorderColor",
  ],
  shadow: [
    "--stx-theme-panel-shadow",
    "--st-roll-modal-panel-shadow",
    "--stx-theme-shadow",
  ],
  surface1: [
    "--stx-theme-surface-1",
    "--st-roll-shell-bg",
    "--SmartThemeBlurTintColor",
  ],
  surface2: [
    "--stx-theme-surface-2",
    "--st-roll-control-bg",
    "--st-roll-workbench-bg",
  ],
  surface3: [
    "--stx-theme-surface-3",
    "--st-roll-control-bg-hover",
    "--st-roll-workbench-panel-bg",
  ],
  toolbarBackground: [
    "--stx-theme-toolbar-bg",
    "--st-roll-workbench-toolbar-bg",
    "--st-roll-tabs-bg",
  ],
  listItemBackground: [
    "--stx-theme-list-item-bg",
    "--st-roll-list-item-bg",
    "--st-roll-workbench-panel-bg",
  ],
  hoverBackground: [
    "--stx-theme-list-item-hover-bg",
    "--st-roll-list-item-hover-bg",
    "--st-roll-tab-hover-bg",
  ],
  activeBackground: [
    "--stx-theme-list-item-active-bg",
    "--st-roll-list-item-active-bg",
    "--st-roll-tab-active-bg",
  ],
  focusRing: [
    "--stx-theme-focus-ring",
    "--st-roll-control-focus-ring",
  ],
  backdrop: [
    "--stx-theme-backdrop",
    "--st-roll-dialog-backdrop",
  ],
  backdropFilter: [
    "--stx-theme-backdrop-filter",
    "--st-roll-dialog-backdrop-filter",
    "--SmartThemeBlurStrength",
  ],
} as const;
type SdkThemePropertyAliasKey = keyof typeof SDK_THEME_PROPERTY_ALIASES;
const SDK_THEME_SOURCE_SELECTOR = [
  "[data-stx-theme]",
  "[data-st-roll-theme]",
  ".st-roll-content",
  ".st-roll-shell",
  ".st-roll-skill-modal",
  ".st-roll-status-modal",
  ".stx-ui-shell",
].join(", ");
const SDK_THEME_FALLBACK_CONTAINER_SELECTOR = [
  ".st-roll-shell",
  "[data-stx-theme]",
  "[data-st-roll-theme]",
  "[id]",
].join(", ");

interface ParsedCssVarExpression {
  name: string;
  fallback: string;
}

interface ThemeRgbColor {
  red: number;
  green: number;
  blue: number;
}

interface SdkThemeStyleSources {
  nodeStyle: CSSStyleDeclaration;
  bodyStyle: CSSStyleDeclaration;
  rootStyle: CSSStyleDeclaration;
  all: CSSStyleDeclaration[];
}

function describeSdkThemeSnapshotSource(node: HTMLElement): string {
  const tag = node.tagName.toLowerCase();
  const id = node.id ? `#${node.id}` : "";
  const classes = Array.from(node.classList).slice(0, 4);
  const classText = classes.length > 0 ? `.${classes.join(".")}` : "";
  const theme = String(node.getAttribute("data-stx-theme") ?? "").trim();
  const mode = String(node.getAttribute("data-stx-theme-mode") ?? "").trim();
  const rollTheme = String(node.getAttribute("data-st-roll-theme") ?? "").trim();
  return `${tag}${id}${classText} stx=${theme || "-"}/${mode || "-"} roll=${rollTheme || "-"}`;
}

function traceSdkThemeSnapshot(message: string, payload?: unknown): void {
  if (payload === undefined) {
    console.info("[SS-Helper][ThemeSnapshot] " + message);
    return;
  }
  console.info("[SS-Helper][ThemeSnapshot] " + message, payload);
}

export function normalizeSdkThemeId(theme: string): SdkThemeId {
  const normalized = String(theme || "").trim().toLowerCase();
  if (
    normalized === "dark" ||
    normalized === "light" ||
    normalized === "tavern" ||
    normalized === "smart"
  ) {
    return normalized;
  }
  return "default";
}

function resolveSdkThemeSelectionFromState(state: SdkThemeStateLike): SdkThemeId {
  return state.mode === "smart" ? "smart" : state.themeId;
}

interface SdkThemeFallbackTokens {
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  surface1: string;
  surface2: string;
  surface3: string;
  background: string;
  border: string;
  borderStrong: string;
  shadow: string;
  toolbarBackground: string;
  listItemBackground: string;
  hoverBackground: string;
  activeBackground: string;
  focusRing: string;
  backdrop: string;
  backdropFilter: string;
}

function resolveSdkThemeFallbackTokens(
  selection: SdkThemeId,
  mode: SdkThemeMode
): SdkThemeFallbackTokens {
  if (mode === "smart" || selection === "smart") {
    return {
      text: "#dcdcd2",
      textMuted: "rgba(255, 255, 255, 0.72)",
      accent: "#e18a24",
      accentContrast: "#ffffff",
      surface1: "rgba(23, 23, 23, 0.96)",
      surface2: "rgba(20, 20, 20, 0.96)",
      surface3: "rgba(18, 18, 18, 0.96)",
      background: "rgba(23, 23, 23, 0.96)",
      border: "rgba(0, 0, 0, 0.5)",
      borderStrong: "rgba(113, 77, 26, 0.72)",
      shadow: "0 14px 30px rgba(0, 0, 0, 0.5)",
      toolbarBackground: "rgba(46, 41, 34, 0.92)",
      listItemBackground: "rgba(18, 18, 18, 0.9)",
      hoverBackground: "rgba(79, 49, 15, 0.4)",
      activeBackground: "rgba(106, 65, 20, 0.48)",
      focusRing: "rgba(225, 138, 36, 0.32)",
      backdrop: "rgba(20, 20, 20, 0.85)",
      backdropFilter: "blur(0px)",
    };
  }

  if (selection === "dark") {
    return {
      text: "#e6edf7",
      textMuted: "#a5b0c4",
      accent: "#5f8de5",
      accentContrast: "#f1f6ff",
      surface1: "#171f2f",
      surface2: "#182233",
      surface3: "#1f2a3d",
      background: "#131c2b",
      border: "#35425e",
      borderStrong: "#5c74a5",
      shadow: "0 12px 30px #0b1020",
      toolbarBackground: "#202c40",
      listItemBackground: "#1f2a3d",
      hoverBackground: "#2c3b56",
      activeBackground: "#334766",
      focusRing: "rgba(95, 141, 229, 0.24)",
      backdrop: "rgba(15, 21, 32, 0.9)",
      backdropFilter: "none",
    };
  }

  if (selection === "light") {
    return {
      text: "#1f2834",
      textMuted: "#5e6e84",
      accent: "#2f6ee5",
      accentContrast: "#ffffff",
      surface1: "#f8fbff",
      surface2: "#eef3fa",
      surface3: "#ffffff",
      background: "#f5f9ff",
      border: "#c6d1e2",
      borderStrong: "#8eaed9",
      shadow: "0 10px 24px rgba(198, 208, 223, 0.9)",
      toolbarBackground: "#eef3fa",
      listItemBackground: "#ffffff",
      hoverBackground: "#e8f0ff",
      activeBackground: "#d8e6ff",
      focusRing: "rgba(47, 110, 229, 0.18)",
      backdrop: "rgba(217, 225, 238, 0.86)",
      backdropFilter: "none",
    };
  }

  if (selection === "tavern") {
    return {
      text: "#dcdcd2",
      textMuted: "#919191",
      accent: "#e18a24",
      accentContrast: "#dcdcd2",
      surface1: "transparent",
      surface2: "transparent",
      surface3: "transparent",
      background: "rgba(23, 23, 23, 0.96)",
      border: "rgba(0, 0, 0, 0.5)",
      borderStrong: "rgba(113, 77, 26, 0.72)",
      shadow: "0 14px 30px rgba(0, 0, 0, 0.5)",
      toolbarBackground: "rgba(46, 41, 34, 0.92)",
      listItemBackground: "transparent",
      hoverBackground: "rgba(79, 49, 15, 0.4)",
      activeBackground: "rgba(106, 65, 20, 0.48)",
      focusRing: "rgba(225, 138, 36, 0.32)",
      backdrop: "transparent",
      backdropFilter: "blur(0px)",
    };
  }

  return {
    text: "#ecdcb8",
    textMuted: "rgba(255, 255, 255, 0.72)",
    accent: "#c5a059",
    accentContrast: "#ffeac0",
    surface1:
      "radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%), linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82))",
    surface2: "rgba(0, 0, 0, 0.18)",
    surface3: "rgba(255, 255, 255, 0.03)",
    background:
      "radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%), linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96))",
    border: "rgba(197, 160, 89, 0.35)",
    borderStrong: "rgba(197, 160, 89, 0.58)",
    shadow: "0 18px 54px rgba(0, 0, 0, 0.46)",
    toolbarBackground: "rgba(255, 255, 255, 0.04)",
    listItemBackground: "rgba(255, 255, 255, 0.03)",
    hoverBackground: "rgba(197, 160, 89, 0.16)",
    activeBackground: "rgba(197, 160, 89, 0.24)",
    focusRing: "rgba(197, 160, 89, 0.22)",
    backdrop: "rgba(0, 0, 0, 0.72)",
    backdropFilter: "blur(2px)",
  };
}

function readFirstDefinedCustomProperty(
  style: CSSStyleDeclaration,
  propertyNames: readonly string[]
): string {
  for (const propertyName of propertyNames) {
    const value = style.getPropertyValue(propertyName).trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function isTransparentThemeValue(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized === "transparent" ||
    normalized === "rgba(0,0,0,0)" ||
    normalized === "rgba(0, 0, 0, 0)" ||
    normalized === "rgba(0 0 0 / 0)" ||
    normalized === "rgb(0 0 0 / 0)" ||
    normalized === "hsla(0,0%,0%,0)" ||
    normalized === "hsla(0, 0%, 0%, 0)" ||
    normalized === "hsla(0 0% 0% / 0)"
  );
}

function parseAlphaChannel(raw: string): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  if (text.endsWith("%")) {
    const percent = Number(text.slice(0, -1).trim());
    if (!Number.isFinite(percent)) return null;
    return Math.max(0, Math.min(1, percent / 100));
  }
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(1, numeric));
}

function readCssColorAlpha(value: string): number | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "transparent") return 0;

  if ((normalized.startsWith("rgb(") || normalized.startsWith("hsl(") || normalized.startsWith("color(")) && normalized.includes("/")) {
    const slashIndex = normalized.lastIndexOf("/");
    const closeIndex = normalized.lastIndexOf(")");
    if (slashIndex >= 0 && closeIndex > slashIndex) {
      return parseAlphaChannel(normalized.slice(slashIndex + 1, closeIndex).trim());
    }
  }

  if (normalized.startsWith("rgba(") || normalized.startsWith("hsla(")) {
    const openIndex = normalized.indexOf("(");
    const closeIndex = normalized.lastIndexOf(")");
    if (openIndex >= 0 && closeIndex > openIndex) {
      const inner = normalized.slice(openIndex + 1, closeIndex);
      const parts = inner.split(",").map((part) => part.trim());
      if (parts.length >= 4) {
        return parseAlphaChannel(parts[3]);
      }
    }
  }

  return null;
}

function isUnusableTooltipBackgroundValue(value: string): boolean {
  if (isTransparentThemeValue(value)) return true;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.includes("var(")) {
    return true;
  }
  if (normalized.includes("color-mix(") && normalized.includes("transparent")) {
    return true;
  }
  const alpha = readCssColorAlpha(normalized);
  if (alpha !== null && alpha < 0.78) {
    return true;
  }
  return false;
}

function parseSingleCssVarExpression(value: string): ParsedCssVarExpression | null {
  const text = String(value ?? "").trim();
  if (!text.startsWith("var(") || !text.endsWith(")")) return null;
  const inner = text.slice(4, -1).trim();
  if (!inner) return null;

  let depth = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === "," && depth === 0) {
      const name = inner.slice(0, index).trim();
      const fallback = inner.slice(index + 1).trim();
      return name ? { name, fallback } : null;
    }
  }
  return { name: inner.trim(), fallback: "" };
}

function resolveThemeCustomPropertyValue(
  rawValue: string,
  styleSources: CSSStyleDeclaration[],
  depth = 0
): string {
  const value = String(rawValue ?? "").trim();
  if (!value || depth >= 8) return value;

  const parsed = parseSingleCssVarExpression(value);
  if (!parsed) return value;

  const referenced = readFirstDefinedCustomProperty(styleSources[0], [parsed.name]) ||
    readFirstDefinedCustomProperty(styleSources[1], [parsed.name]) ||
    readFirstDefinedCustomProperty(styleSources[2], [parsed.name]);
  if (referenced) {
    return resolveThemeCustomPropertyValue(referenced, styleSources, depth + 1);
  }
  if (parsed.fallback) {
    return resolveThemeCustomPropertyValue(parsed.fallback, styleSources, depth + 1);
  }
  return value;
}

function readFirstUsableCustomProperty(
  style: CSSStyleDeclaration,
  propertyNames: readonly string[],
  styleSources: CSSStyleDeclaration[],
  shouldSkipValue?: (value: string) => boolean
): string {
  for (const propertyName of propertyNames) {
    const rawValue = style.getPropertyValue(propertyName).trim();
    if (!rawValue) continue;
    const value = resolveThemeCustomPropertyValue(rawValue, styleSources);
    if (!value) continue;
    if (shouldSkipValue?.(value)) continue;
    return value;
  }
  return "";
}

function getSdkThemeStyleSources(node: HTMLElement): SdkThemeStyleSources {
  const nodeStyle = getComputedStyle(node);
  const bodyStyle = getComputedStyle(document.body);
  const rootStyle = getComputedStyle(document.documentElement);
  return {
    nodeStyle,
    bodyStyle,
    rootStyle,
    all: [nodeStyle, bodyStyle, rootStyle],
  };
}

function readSdkThemeToken(
  key: SdkThemePropertyAliasKey,
  styleSources: SdkThemeStyleSources,
  fallback: string,
  shouldSkipValue?: (value: string) => boolean
): string {
  const propertyNames = SDK_THEME_PROPERTY_ALIASES[key];
  const candidates = [
    readFirstUsableCustomProperty(
      styleSources.nodeStyle,
      propertyNames,
      styleSources.all,
      shouldSkipValue
    ),
    readFirstUsableCustomProperty(
      styleSources.bodyStyle,
      propertyNames,
      styleSources.all,
      shouldSkipValue
    ),
    readFirstUsableCustomProperty(
      styleSources.rootStyle,
      propertyNames,
      styleSources.all,
      shouldSkipValue
    ),
  ];
  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return fallback;
}

function clampThemeColorChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseThemeHexColor(value: string): ThemeRgbColor | null {
  const normalized = String(value ?? "").trim();
  if (!normalized.startsWith("#")) return null;
  const hex = normalized.slice(1);
  if (hex.length === 3) {
    return {
      red: parseInt(hex[0] + hex[0], 16),
      green: parseInt(hex[1] + hex[1], 16),
      blue: parseInt(hex[2] + hex[2], 16),
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      red: parseInt(hex.slice(0, 2), 16),
      green: parseInt(hex.slice(2, 4), 16),
      blue: parseInt(hex.slice(4, 6), 16),
    };
  }
  return null;
}

function parseThemeRgbColor(value: string): ThemeRgbColor | null {
  const normalized = String(value ?? "").trim();
  const matched = normalized.match(/^rgba?\((.+)\)$/i);
  if (!matched) return null;
  const inner = matched[1]?.trim();
  if (!inner) return null;

  const slashIndex = inner.indexOf("/");
  const colorPart = slashIndex >= 0 ? inner.slice(0, slashIndex).trim() : inner;
  const parts = colorPart.includes(",")
    ? colorPart.split(",").map((part: string) => part.trim())
    : colorPart
        .split(/\s+/)
        .map((part: string) => part.trim())
        .filter(Boolean);
  if (parts.length < 3) return null;

  const red = Number(parts[0]);
  const green = Number(parts[1]);
  const blue = Number(parts[2]);
  if (![red, green, blue].every((channel: number) => Number.isFinite(channel))) {
    return null;
  }
  return {
    red: clampThemeColorChannel(red),
    green: clampThemeColorChannel(green),
    blue: clampThemeColorChannel(blue),
  };
}

function resolveThemeRgbColor(value: string): ThemeRgbColor | null {
  return parseThemeHexColor(value) || parseThemeRgbColor(value);
}

function isLightThemeColor(value: string): boolean | null {
  const rgb = resolveThemeRgbColor(value);
  if (!rgb) return null;
  const brightness = (rgb.red * 299 + rgb.green * 587 + rgb.blue * 114) / 1000;
  return brightness >= 170;
}

function buildSolidThemeBackground(
  background: string,
  surface1: string,
  surface2: string,
  text: string
): string {
  const candidates = [background, surface1, surface2];
  for (const candidate of candidates) {
    const rgb = resolveThemeRgbColor(candidate);
    if (rgb) {
      return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, 0.96)`;
    }
  }
  for (const candidate of candidates) {
    const isLight = isLightThemeColor(candidate);
    if (isLight !== null) {
      return isLight ? SDK_THEME_SOLID_BACKGROUND_LIGHT : SDK_THEME_SOLID_BACKGROUND_DARK;
    }
  }
  const textIsLight = isLightThemeColor(text);
  if (textIsLight !== null) {
    return textIsLight ? SDK_THEME_SOLID_BACKGROUND_DARK : SDK_THEME_SOLID_BACKGROUND_LIGHT;
  }
  return SDK_THEME_SOLID_BACKGROUND_DARK;
}

function looksLikeThemeBackgroundImage(value: string): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("gradient(") ||
    normalized.includes("url(") ||
    normalized.includes("image(")
  );
}

function buildSdkThemeSnapshotCssVars(snapshot: SdkThemeSnapshot): Record<string, string> {
  return {
    "--stx-theme-text": snapshot.text,
    "--stx-theme-text-muted": snapshot.textMuted,
    "--stx-theme-accent": snapshot.accent,
    "--stx-theme-accent-contrast": snapshot.accentContrast,
    "--stx-theme-surface-1": snapshot.surface1,
    "--stx-theme-surface-2": snapshot.surface2,
    "--stx-theme-surface-3": snapshot.surface3,
    "--stx-theme-border": snapshot.border,
    "--stx-theme-border-strong": snapshot.borderStrong,
    "--stx-theme-focus-ring": snapshot.focusRing,
    "--stx-theme-shadow": snapshot.shadow,
    "--stx-theme-backdrop": snapshot.backdrop,
    "--stx-theme-backdrop-filter": snapshot.backdropFilter,
    "--stx-theme-panel-bg": snapshot.background,
    "--stx-theme-panel-border": snapshot.border,
    "--stx-theme-panel-shadow": snapshot.shadow,
    "--stx-theme-toolbar-bg": snapshot.toolbarBackground,
    "--stx-theme-list-item-bg": snapshot.listItemBackground,
    "--stx-theme-list-item-hover-bg": snapshot.hoverBackground,
    "--stx-theme-list-item-active-bg": snapshot.activeBackground,
    "--st-roll-text": snapshot.text,
    "--st-roll-text-muted": snapshot.textMuted,
    "--st-roll-accent": snapshot.accent,
    "--st-roll-accent-contrast": snapshot.accentContrast,
    "--st-roll-control-border": snapshot.border,
    "--st-roll-control-border-hover": snapshot.borderStrong,
    "--st-roll-control-focus-border": snapshot.borderStrong,
    "--st-roll-control-focus-ring": snapshot.focusRing,
    "--st-roll-control-bg": snapshot.surface2,
    "--st-roll-control-bg-hover": snapshot.surface3,
    "--st-roll-panel-muted-border": snapshot.border,
    "--st-roll-select-panel-bg": snapshot.background,
    "--st-roll-select-panel-backdrop-filter": snapshot.backdropFilter,
    "--st-roll-list-item-hover-border": snapshot.borderStrong,
    "--st-roll-list-item-hover-bg": snapshot.hoverBackground,
    "--st-roll-list-item-active-border": snapshot.borderStrong,
    "--st-roll-list-item-active-bg": snapshot.activeBackground,
    "--st-roll-list-item-active-shadow": `0 0 0 1px ${snapshot.focusRing}`,
    "--stx-shared-select-panel-bg": snapshot.background,
    "--stx-shared-select-panel-backdrop-filter": snapshot.backdropFilter,
  };
}

function isPotentialSdkThemeSource(node: HTMLElement): boolean {
  return (
    node.hasAttribute("data-stx-theme") ||
    node.hasAttribute("data-st-roll-theme") ||
    node.classList.contains("st-roll-content") ||
    node.classList.contains("st-roll-shell") ||
    node.classList.contains("st-roll-skill-modal") ||
    node.classList.contains("st-roll-status-modal") ||
    node.classList.contains("stx-ui-shell")
  );
}

function hasUsableSdkThemeVars(node: HTMLElement): boolean {
  const { nodeStyle, all: styleSources } = getSdkThemeStyleSources(node);
  const text = readFirstUsableCustomProperty(
    nodeStyle,
    SDK_THEME_PROPERTY_ALIASES.text,
    styleSources
  );
  if (text) return true;
  const background = readFirstUsableCustomProperty(
    nodeStyle,
    SDK_THEME_PROPERTY_ALIASES.panelBackground,
    styleSources,
    isUnusableTooltipBackgroundValue
  );
  return !!background;
}

function findClosestSdkThemeHost(
  target: HTMLElement,
  requireUsable: boolean
): HTMLElement | null {
  let current: HTMLElement | null = target;
  while (current) {
    if (isPotentialSdkThemeSource(current)) {
      if (!requireUsable || hasUsableSdkThemeVars(current)) {
        return current;
      }
    }
    current = current.parentElement;
  }
  return null;
}

function findFallbackSdkThemeHost(target: HTMLElement): HTMLElement | null {
  const fallbackContainer = target.closest<HTMLElement>(SDK_THEME_FALLBACK_CONTAINER_SELECTOR);
  if (!fallbackContainer) return null;
  const descendantThemeHost = fallbackContainer.querySelector<HTMLElement>(SDK_THEME_SOURCE_SELECTOR);
  if (!descendantThemeHost || !hasUsableSdkThemeVars(descendantThemeHost)) {
    return null;
  }
  return descendantThemeHost;
}

export function resolveSdkThemeSource(target: HTMLElement): HTMLElement {
  return (
    findClosestSdkThemeHost(target, true) ||
    findFallbackSdkThemeHost(target) ||
    findClosestSdkThemeHost(target, false) ||
    target
  );
}

export function buildSdkThemeSnapshot(
  source: HTMLElement,
  currentState: SdkThemeStateLike
): SdkThemeSnapshot {
  const selectionAttr = normalizeSdkThemeId(
    String(source.getAttribute("data-stx-theme") ?? resolveSdkThemeSelectionFromState(currentState))
  );
  const modeAttr = String(source.getAttribute("data-stx-theme-mode") ?? currentState.mode)
    .trim()
    .toLowerCase();
  const mode: SdkThemeMode = modeAttr === "smart" ? "smart" : "sdk";
  const selection: SdkThemeId =
    mode === "smart"
      ? "smart"
      : selectionAttr === "smart"
        ? resolveSdkThemeSelectionFromState(currentState)
        : selectionAttr;
  const fallbackTokens = resolveSdkThemeFallbackTokens(selection, mode);
  const sourceHasUsableVars = hasUsableSdkThemeVars(source);

  const styleSources = getSdkThemeStyleSources(source);

  const text = readSdkThemeToken("text", styleSources, fallbackTokens.text);
  const textMuted = readSdkThemeToken("textMuted", styleSources, fallbackTokens.textMuted);
  const accent = readSdkThemeToken("accent", styleSources, fallbackTokens.accent);
  const accentContrast = readSdkThemeToken(
    "accentContrast",
    styleSources,
    fallbackTokens.accentContrast
  );
  const surface1 = readSdkThemeToken("surface1", styleSources, fallbackTokens.surface1);
  const surface2 = readSdkThemeToken("surface2", styleSources, fallbackTokens.surface2);
  const surface3 = readSdkThemeToken("surface3", styleSources, fallbackTokens.surface3);
  const backgroundFallback =
    isLightThemeColor(text) === false
      ? SDK_THEME_SOLID_BACKGROUND_LIGHT
      : SDK_THEME_SOLID_BACKGROUND_DARK;
  const background = readSdkThemeToken(
    "panelBackground",
    styleSources,
    looksLikeThemeBackgroundImage(fallbackTokens.background)
      ? fallbackTokens.background
      : backgroundFallback,
    isUnusableTooltipBackgroundValue
  );
  const border = readSdkThemeToken("border", styleSources, fallbackTokens.border);
  const borderStrong = readSdkThemeToken(
    "borderStrong",
    styleSources,
    fallbackTokens.borderStrong || border
  );
  const shadow = readSdkThemeToken("shadow", styleSources, fallbackTokens.shadow);
  const toolbarBackground = readSdkThemeToken(
    "toolbarBackground",
    styleSources,
    fallbackTokens.toolbarBackground
  );
  const listItemBackground = readSdkThemeToken(
    "listItemBackground",
    styleSources,
    fallbackTokens.listItemBackground
  );
  const hoverBackground = readSdkThemeToken(
    "hoverBackground",
    styleSources,
    fallbackTokens.hoverBackground
  );
  const activeBackground = readSdkThemeToken(
    "activeBackground",
    styleSources,
    fallbackTokens.activeBackground
  );
  const focusRing = readSdkThemeToken("focusRing", styleSources, fallbackTokens.focusRing);
  const backdrop = readSdkThemeToken("backdrop", styleSources, fallbackTokens.backdrop);
  const backdropFilter = readSdkThemeToken(
    "backdropFilter",
    styleSources,
    fallbackTokens.backdropFilter
  );

  const snapshot: SdkThemeSnapshot = {
    mode,
    selection,
    text,
    textMuted,
    accent,
    accentContrast,
    background,
    backgroundSolid: buildSolidThemeBackground(background, surface1, surface2, text),
    backgroundImage: looksLikeThemeBackgroundImage(background) ? background : "none",
    border,
    borderStrong,
    shadow,
    surface1,
    surface2,
    surface3,
    toolbarBackground,
    listItemBackground,
    hoverBackground,
    activeBackground,
    focusRing,
    backdrop,
    backdropFilter,
    cssVars: {} as Record<string, string>,
  };
  snapshot.cssVars = buildSdkThemeSnapshotCssVars(snapshot);
  traceSdkThemeSnapshot("buildSdkThemeSnapshot", {
    source: describeSdkThemeSnapshotSource(source),
    sourceHasUsableVars,
    currentState,
    mode,
    selection,
    fallbackTokens,
    snapshot: {
      text: snapshot.text,
      background: snapshot.background,
      border: snapshot.border,
      toolbarBackground: snapshot.toolbarBackground,
      backdrop: snapshot.backdrop,
      backdropFilter: snapshot.backdropFilter,
    },
  });
  return snapshot;
}
