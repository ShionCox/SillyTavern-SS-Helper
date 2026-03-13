function normalizeSdkThemeScopes(scopeSelector: string): string[] {
  const selectors = scopeSelector
    .split(",")
    .map((selector: string) => selector.trim())
    .filter((selector: string) => selector.length > 0);
  return selectors.length > 0 ? selectors : [":root"];
}

function joinScopedSelectors(scopes: string[], suffix = ""): string {
  return scopes.map((selector: string) => `${selector}${suffix}`).join(",\n    ");
}

function buildScopedThemeRule(scopes: string[], suffix: string, body: string): string {
  return `
    ${joinScopedSelectors(scopes, suffix)} {
${body}
    }`;
}

function buildSdkThemeBaseVarsRule(scopes: string[]): string {
  return buildScopedThemeRule(
    scopes,
    "",
    `      color: var(--stx-theme-text, inherit);
      --stx-theme-text: #ecdcb8;
      --stx-theme-text-muted: rgba(255, 255, 255, 0.72);
      --stx-theme-accent: #c5a059;
      --stx-theme-accent-contrast: #ffeac0;
      --stx-theme-surface-1:
        radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%),
        linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82));
      --stx-theme-surface-2: rgba(0, 0, 0, 0.18);
      --stx-theme-surface-3: rgba(255, 255, 255, 0.03);
      --stx-theme-border: rgba(197, 160, 89, 0.35);
      --stx-theme-border-strong: rgba(197, 160, 89, 0.58);
      --stx-theme-focus-ring: rgba(197, 160, 89, 0.22);
      --stx-theme-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --stx-theme-backdrop: rgba(0, 0, 0, 0.72);
      --stx-theme-backdrop-filter: blur(2px);
      --stx-theme-panel-bg:
        radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%),
        linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96));
      --stx-theme-panel-border: rgba(197, 160, 89, 0.38);
      --stx-theme-panel-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --stx-theme-toolbar-bg: rgba(255, 255, 255, 0.04);
      --stx-theme-list-item-bg: rgba(255, 255, 255, 0.03);
      --stx-theme-list-item-hover-bg: rgba(197, 160, 89, 0.16);
      --stx-theme-list-item-active-bg: rgba(197, 160, 89, 0.24);`
  );
}

function buildSdkThemeDefaultRule(scopes: string[]): string {
  return buildScopedThemeRule(
    scopes,
    `[data-stx-theme-mode="sdk"][data-stx-theme="default"]`,
    `      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: rgba(23, 21, 24, 0.92);
      --SmartThemeShadowColor: rgba(0, 0, 0, 0.45);
      --SmartThemeBlurStrength: 2px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;`
  );
}

function buildSdkThemeDarkRule(scopes: string[]): string {
  return buildScopedThemeRule(
    scopes,
    `[data-stx-theme-mode="sdk"][data-stx-theme="dark"]`,
    `      --stx-theme-text: #e6edf7;
      --stx-theme-text-muted: #a5b0c4;
      --stx-theme-accent: #5f8de5;
      --stx-theme-accent-contrast: #f1f6ff;
      --stx-theme-surface-1: #171f2f;
      --stx-theme-surface-2: #182233;
      --stx-theme-surface-3: #1f2a3d;
      --stx-theme-border: #35425e;
      --stx-theme-border-strong: #5c74a5;
      --stx-theme-focus-ring: rgba(95, 141, 229, 0.24);
      --stx-theme-shadow: 0 12px 30px #0b1020;
      --stx-theme-backdrop: rgba(15, 21, 32, 0.9);
      --stx-theme-backdrop-filter: none;
      --stx-theme-panel-bg: #131c2b;
      --stx-theme-panel-border: #34435f;
      --stx-theme-panel-shadow: 0 12px 30px #0b1020;
      --stx-theme-toolbar-bg: #202c40;
      --stx-theme-list-item-bg: #1f2a3d;
      --stx-theme-list-item-hover-bg: #2c3b56;
      --stx-theme-list-item-active-bg: #334766;
      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: #131c2b;
      --SmartThemeShadowColor: rgba(11, 16, 32, 0.78);
      --SmartThemeBlurStrength: 0px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;`
  );
}

function buildSdkThemeLightRule(scopes: string[]): string {
  return buildScopedThemeRule(
    scopes,
    `[data-stx-theme-mode="sdk"][data-stx-theme="light"]`,
    `      --stx-theme-text: #1f2834;
      --stx-theme-text-muted: #5e6e84;
      --stx-theme-accent: #2f6ee5;
      --stx-theme-accent-contrast: #ffffff;
      --stx-theme-surface-1: #f8fbff;
      --stx-theme-surface-2: #eef3fa;
      --stx-theme-surface-3: #ffffff;
      --stx-theme-border: #c6d1e2;
      --stx-theme-border-strong: #8eaed9;
      --stx-theme-focus-ring: rgba(47, 110, 229, 0.18);
      --stx-theme-shadow: 0 10px 24px rgba(198, 208, 223, 0.9);
      --stx-theme-backdrop: rgba(217, 225, 238, 0.86);
      --stx-theme-backdrop-filter: none;
      --stx-theme-panel-bg: #f5f9ff;
      --stx-theme-panel-border: #c6d3e6;
      --stx-theme-panel-shadow: 0 10px 24px rgba(198, 208, 223, 0.9);
      --stx-theme-toolbar-bg: #eef3fa;
      --stx-theme-list-item-bg: #ffffff;
      --stx-theme-list-item-hover-bg: #e8f0ff;
      --stx-theme-list-item-active-bg: #d8e6ff;
      --SmartThemeBodyColor: var(--stx-theme-text);
      --SmartThemeEmColor: var(--stx-theme-text-muted);
      --SmartThemeQuoteColor: var(--stx-theme-accent);
      --SmartThemeQuoteTextColor: var(--stx-theme-accent-contrast);
      --SmartThemeBorderColor: var(--stx-theme-border);
      --SmartThemeBlurTintColor: #f5f9ff;
      --SmartThemeShadowColor: rgba(198, 208, 223, 0.9);
      --SmartThemeBlurStrength: 0px;
      --SmartThemeBodyFont: "Segoe UI", sans-serif;`
  );
}

function buildSdkThemeTavernRule(scopes: string[]): string {
  return buildScopedThemeRule(
    scopes,
    `[data-stx-theme-mode="sdk"][data-stx-theme="tavern"]`,
    `      --stx-theme-text: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-text-muted: var(--SmartThemeEmColor, #919191);
      --stx-theme-accent: var(--SmartThemeQuoteColor, #e18a24);
      --stx-theme-accent-contrast: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-surface-1: transparent;
      --stx-theme-surface-2: transparent;
      --stx-theme-surface-3: transparent;
      --stx-theme-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-border-strong: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --stx-theme-focus-ring: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent);
      --stx-theme-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-backdrop: transparent;
      --stx-theme-backdrop-filter: blur(var(--SmartThemeBlurStrength, 0px));
      --stx-theme-panel-bg: transparent;
      --stx-theme-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-toolbar-bg:
        linear-gradient(
          348deg,
          var(--white30a, rgba(255, 255, 255, 0.3)) 2%,
          var(--grey30a, rgba(50, 50, 50, 0.3)) 10%,
          var(--black70a, rgba(0, 0, 0, 0.7)) 95%,
          var(--SmartThemeQuoteColor, #e18a24) 100%
        );
      --stx-theme-list-item-bg: transparent;
      --stx-theme-list-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --stx-theme-list-item-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));`
  );
}

function buildSdkThemeSmartRule(scopes: string[]): string {
  return `
    ${joinScopedSelectors(scopes, `[data-stx-theme-mode="smart"]`)},
    ${joinScopedSelectors(scopes, `[data-stx-theme="smart"]`)} {
      --stx-theme-text: var(--SmartThemeBodyColor, #dcdcd2);
      --stx-theme-text-muted: var(--SmartThemeEmColor, rgba(255, 255, 255, 0.72));
      --stx-theme-accent: var(--SmartThemeQuoteColor, #e18a24);
      --stx-theme-accent-contrast: var(--SmartThemeQuoteTextColor, #ffffff);
      --stx-theme-surface-1: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96));
      --stx-theme-surface-2: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 88%, #000 12%);
      --stx-theme-surface-3: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 0.96)) 92%, #000 8%);
      --stx-theme-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-border-strong: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --stx-theme-focus-ring: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent);
      --stx-theme-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-backdrop: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 85%, #000 15%);
      --stx-theme-backdrop-filter: blur(var(--SmartThemeBlurStrength, 0px));
      --stx-theme-panel-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --stx-theme-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --stx-theme-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --stx-theme-toolbar-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 82%, var(--SmartThemeBodyColor, #dcdcd2) 18%);
      --stx-theme-list-item-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 90%, #000 10%);
      --stx-theme-list-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --stx-theme-list-item-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
    }`;
}

/**
 * 功能：构建 SDK 全局主题变量样式文本。
 * @param scopeSelector 主题宿主选择器。
 * @returns 对应作用域的主题变量样式。
 */
export function buildSdkThemeVars(scopeSelector: string): string {
  const scopes = normalizeSdkThemeScopes(scopeSelector);
  return `
${buildSdkThemeBaseVarsRule(scopes)}
${buildSdkThemeDefaultRule(scopes)}
${buildSdkThemeDarkRule(scopes)}
${buildSdkThemeLightRule(scopes)}
${buildSdkThemeTavernRule(scopes)}
${buildSdkThemeSmartRule(scopes)}
  `;
}
