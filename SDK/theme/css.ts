/**
 * 通用主题系统 —— 生成主题作用域 CSS 文本。
 */

import type { ThemeId, ThemeTokens } from "./types";
import { CSS_VAR_NAMES } from "./tokens";
import { getThemeTokens } from "./presets";

function normalizeScopeSelectors(scopeSelector: string): string[] {
  const selectors = scopeSelector
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return selectors.length > 0 ? selectors : [":root"];
}

function joinScoped(scopes: string[], suffix = ""): string {
  return scopes.map((s) => `${s}${suffix}`).join(",\n    ");
}

function buildTokenCssBlock(tokens: ThemeTokens): string {
  return (Object.entries(CSS_VAR_NAMES) as [keyof ThemeTokens, string][])
    .map(([key, cssVar]) => `      ${cssVar}: ${tokens[key]};`)
    .join("\n");
}

function buildScopedRule(
  scopes: string[],
  suffix: string,
  tokens: ThemeTokens,
  extra?: string
): string {
  return `
    ${joinScoped(scopes, suffix)} {
      color: var(--ss-theme-text, inherit);
${buildTokenCssBlock(tokens)}
${extra ? extra + "\n" : ""}    }`;
}

type SmartThemeCompatOptions = {
  shadowWidth?: string;
};

function buildSmartThemeCompatVars(options: SmartThemeCompatOptions = {}): string {
  const lines = [
    "      --SmartThemeBodyColor: var(--ss-theme-text);",
    "      --SmartThemeEmColor: var(--ss-theme-text-muted);",
    "      --SmartThemeQuoteColor: var(--ss-theme-accent);",
    "      --SmartThemeQuoteTextColor: var(--ss-theme-accent-contrast);",
    "      --SmartThemeBorderColor: var(--ss-theme-border);",
  ];
  if (options.shadowWidth !== undefined) {
    lines.push(`      --shadowWidth: ${options.shadowWidth};`);
  }
  return lines.join("\n");
}

/**
 * 构建全局主题变量 CSS 文本。每个主题通过 `[data-ss-theme="..."]` 属性选择器区分。
 */
export function buildThemeVars(scopeSelector: string): string {
  const scopes = normalizeScopeSelectors(scopeSelector);

  const baseRule = buildScopedRule(scopes, "", getThemeTokens("default"));

  const defaultRule = buildScopedRule(
    scopes,
    `[data-ss-theme="default"]`,
    getThemeTokens("default"),
    buildSmartThemeCompatVars()
  );

  const darkRule = buildScopedRule(
    scopes,
    `[data-ss-theme="dark"]`,
    getThemeTokens("dark"),
    buildSmartThemeCompatVars()
  );

  const lightRule = buildScopedRule(
    scopes,
    `[data-ss-theme="light"]`,
    getThemeTokens("light"),
    buildSmartThemeCompatVars({ shadowWidth: "0" })
  );

  const hostTokens = getThemeTokens("host");

  const hostRule = buildScopedRule(
    scopes,
    `[data-ss-theme="host"]`,
    hostTokens
  );

  const tavernAliasRule = buildScopedRule(
    scopes,
    `[data-ss-theme="tavern"]`,
    hostTokens
  );

  return `${baseRule}\n${defaultRule}\n${darkRule}\n${lightRule}\n${hostRule}\n${tavernAliasRule}`;
}
