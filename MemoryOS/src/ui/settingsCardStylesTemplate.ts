import { buildSharedCheckboxStyles } from "../../../_Components/sharedCheckbox";
import { buildSharedButtonStyles } from "../../../_Components/sharedButton";
import { buildSharedInputStyles } from "../../../_Components/sharedInput";
import { buildSharedSelectStyles } from "../../../_Components/sharedSelect";
import { buildThemeVars } from "../../../SDK/theme";
import { buildMemoryChatOpsStyles } from "./memoryChatOpsStyles";
import { buildRecordEditorStyles } from "./recordEditor/styles";

export function buildSettingsCardStylesTemplate(cardId: string): string {
  const sharedComponentScopes: string[] = Array.from(new Set([
    `#${cardId}`,
    `.stx-record-editor-overlay`,
    `.stx-record-editor`,
    `.stx-memory-chat-ops-overlay`,
    `.stx-memory-chat-ops-editor`,
  ]));
  const themeScopes: string[] = Array.from(new Set([
    `#${cardId} .stx-ui-content`,
    ...sharedComponentScopes.filter((scope: string): boolean => scope !== `#${cardId}`),
  ]));

  const sharedComponentStyles: string = sharedComponentScopes.map((scope: string): string => {
    return [
      buildSharedCheckboxStyles(scope),
      buildSharedSelectStyles(scope),
      buildSharedButtonStyles(scope),
      buildSharedInputStyles(scope),
    ].join("\n");
  }).join("\n");
  const themeVarStyles: string = themeScopes
    .map((scope: string): string => buildThemeVars(scope))
    .join("\n");

  return `
    ${themeVarStyles}
    ${sharedComponentStyles}
    ${buildRecordEditorStyles()}
    ${buildMemoryChatOpsStyles(cardId)}

    #${cardId} {
      margin-bottom: 5px;
      color: inherit;
      --stx-memory-danger: color-mix(in srgb, #ff6b6b 72%, var(--ss-theme-accent, #c5a059));
      --stx-memory-danger-soft: color-mix(in srgb, var(--stx-memory-danger) 14%, transparent);
      --stx-memory-danger-border: color-mix(in srgb, var(--stx-memory-danger) 44%, transparent);
      --stx-memory-danger-contrast: color-mix(in srgb, var(--stx-memory-danger) 88%, white 12%);
      --stx-memory-info: color-mix(in srgb, #78a8ff 84%, var(--ss-theme-accent, #c5a059));
      --stx-memory-info-soft: color-mix(in srgb, var(--stx-memory-info) 16%, transparent);
      --stx-memory-info-border: color-mix(in srgb, var(--stx-memory-info) 38%, transparent);
      --stx-memory-success: color-mix(in srgb, #65d38f 82%, var(--ss-theme-accent, #c5a059));
      --stx-memory-success-soft: color-mix(in srgb, var(--stx-memory-success) 14%, transparent);
      --stx-memory-success-border: color-mix(in srgb, var(--stx-memory-success) 34%, transparent);
      --stx-memory-warning: color-mix(in srgb, #ffbf66 82%, var(--ss-theme-accent, #c5a059));
      --stx-memory-warning-soft: color-mix(in srgb, var(--stx-memory-warning) 14%, transparent);
      --stx-memory-warning-border: color-mix(in srgb, var(--stx-memory-warning) 34%, transparent);
      --stx-memory-code-text: color-mix(in srgb, var(--ss-theme-text, #eaeaea) 76%, #8fc3ff 24%);
      --stx-memory-muted-text: color-mix(in srgb, var(--ss-theme-text, #eaeaea) 52%, transparent);
      --stx-memory-soft-line: color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.16)) 78%, transparent);
      --stx-memory-scrollbar: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 44%, transparent);
      --stx-memory-scrollbar-hover: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 72%, transparent);
      --stx-memory-edit-soft: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      --stx-memory-edit-border: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 42%, transparent);
    }

    .stx-record-editor-overlay {
      --stx-memory-danger: color-mix(in srgb, #ff6b6b 72%, var(--ss-theme-accent, #c5a059));
      --stx-memory-danger-soft: color-mix(in srgb, var(--stx-memory-danger) 14%, transparent);
      --stx-memory-danger-border: color-mix(in srgb, var(--stx-memory-danger) 44%, transparent);
      --stx-memory-danger-contrast: color-mix(in srgb, var(--stx-memory-danger) 88%, white 12%);
      --stx-memory-info: color-mix(in srgb, #78a8ff 84%, var(--ss-theme-accent, #c5a059));
      --stx-memory-info-soft: color-mix(in srgb, var(--stx-memory-info) 16%, transparent);
      --stx-memory-info-border: color-mix(in srgb, var(--stx-memory-info) 38%, transparent);
      --stx-memory-success: color-mix(in srgb, #65d38f 82%, var(--ss-theme-accent, #c5a059));
      --stx-memory-success-soft: color-mix(in srgb, var(--stx-memory-success) 14%, transparent);
      --stx-memory-success-border: color-mix(in srgb, var(--stx-memory-success) 34%, transparent);
      --stx-memory-warning: color-mix(in srgb, #ffbf66 82%, var(--ss-theme-accent, #c5a059));
      --stx-memory-warning-soft: color-mix(in srgb, var(--stx-memory-warning) 14%, transparent);
      --stx-memory-warning-border: color-mix(in srgb, var(--stx-memory-warning) 34%, transparent);
      --stx-memory-code-text: color-mix(in srgb, var(--ss-theme-text, #eaeaea) 76%, #8fc3ff 24%);
      --stx-memory-muted-text: color-mix(in srgb, var(--ss-theme-text, #eaeaea) 52%, transparent);
      --stx-memory-soft-line: color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.16)) 78%, transparent);
      --stx-memory-scrollbar: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 44%, transparent);
      --stx-memory-scrollbar-hover: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 72%, transparent);
      --stx-memory-edit-soft: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      --stx-memory-edit-border: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 42%, transparent);
    }

    #${cardId}.is-card-disabled .stx-ui-shell {
      opacity: 0.68;
      filter: grayscale(0.6) saturate(0.5);
    }

    #${cardId} .stx-ui-shell {
      border: 0;
      border-radius: 0;
      overflow: visible;
      background: transparent;
      backdrop-filter: none;
      box-shadow: none;
      color: inherit;
    }

    #${cardId} .stx-ui-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-head-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }

    #${cardId} .stx-ui-head-badge {
      color: inherit;
      opacity: 0.8;
      font-size: 0.8em;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    #${cardId} .stx-ui-head .inline-drawer-icon {
      transition: transform 0.2s ease;
    }

    #${cardId} .stx-ui-content {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.08));
      border-top: 0;
      border-radius: 0 0 10px 10px;
      padding: 10px;
      display: block;
      color: var(--ss-theme-text, inherit);
      background: var(--ss-theme-surface-1, rgba(0, 0, 0, 0.16));
      backdrop-filter: var(--ss-theme-backdrop-filter, blur(3px));
      box-shadow: var(--ss-theme-panel-shadow, none);
      overflow: hidden;
      min-width: 0;
    }

    #${cardId} .stx-ui-filters {
      margin-bottom: 10px;
      gap: 8px;
    }

    #${cardId} .stx-ui-search {
      min-height: 32px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    #${cardId} .stx-ui-search-item.is-hidden-by-search {
      display: none !important;
    }

    #${cardId} .stx-ui-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.16));
      border-radius: 999px;
      margin-bottom: 10px;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
    }

    #${cardId} .stx-ui-tabs-primary {
      margin-bottom: 8px;
    }

    #${cardId} .stx-ui-tab {
      flex: 1;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.2;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      opacity: 0.75;
      transition:
        background-color 0.2s ease,
        opacity 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-tab.is-active {
      opacity: 1;
      color: var(--ss-theme-text, inherit);
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.58));
    }

    #${cardId}[data-stx-ui-mode="basic"] [data-stx-ui-mode="advanced"] {
      display: none !important;
    }

    #${cardId}[data-stx-ui-mode="advanced"] .stx-ui-tabs-primary {
      display: none;
    }

    #${cardId}[data-stx-ui-mode="basic"] .stx-ui-filters[data-stx-ui-mode="advanced"] {
      display: none !important;
    }

    #${cardId} .stx-ui-mode-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 8px;
      padding: 9px 10px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
      border-radius: 13px;
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent) 0%, transparent 42%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.18)) 100%, transparent));
    }

    #${cardId} .stx-ui-mode-copy {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 1 1 auto;
    }

    #${cardId} .stx-ui-mode-kicker {
      flex: 0 0 auto;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent);
      font-size: 10px;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 88%, transparent);
    }

    #${cardId} .stx-ui-mode-title {
      font-size: 15px;
      line-height: 1.2;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-mode-desc {
      display: none;
    }

    #${cardId} .stx-ui-mode-switch {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px;
      border-radius: 999px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.14));
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2)) 100%, transparent);
    }

    #${cardId} .stx-ui-mode-chip {
      border: 0;
      border-radius: 999px;
      padding: 7px 11px;
      background: transparent;
      color: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      opacity: 0.72;
      transition: background-color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-mode-chip.is-active {
      opacity: 1;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 14%, transparent);
    }

    #${cardId} .stx-ui-refresh-btn {
      white-space: nowrap;
      min-height: 34px;
    }

    #${cardId} .stx-ui-advanced-panel {
      gap: 8px;
    }

    #${cardId} .stx-ui-advanced-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 2px;
    }

    #${cardId} .stx-ui-advanced-head-title {
      font-size: 13px;
      line-height: 1.2;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 94%, transparent);
      white-space: nowrap;
    }

    #${cardId} .stx-ui-advanced-head-search {
      flex: 1 1 220px;
      min-width: min(100%, 220px);
    }

    #${cardId} .stx-ui-advanced-head-search .stx-ui-search {
      width: 100%;
    }

    #${cardId} .stx-ui-tabs-secondary {
      margin-bottom: 10px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.16)) 100%, transparent);
    }

    #${cardId} .stx-ui-advanced-subpanel {
      gap: 10px;
    }

    #${cardId} .stx-ui-advanced-section {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.1)) 88%, transparent);
    }

    #${cardId} .stx-ui-advanced-section > .stx-ui-divider:first-child {
      margin-top: 0;
    }

    #${cardId} .stx-ui-experience-shell {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    #${cardId} .stx-ui-experience-actions {
      justify-content: flex-start;
    }

    #${cardId} .stx-ui-experience-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      min-width: 0;
    }

    #${cardId} .stx-ui-experience-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.14)) 90%, transparent);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.14)) 100%, transparent));
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
    }

    #${cardId} .stx-ui-experience-card-wide {
      grid-column: 1 / -1;
    }

    #${cardId} .stx-ui-experience-card-reason {
      gap: 8px;
    }

    #${cardId} .stx-ui-experience-card-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    #${cardId} .stx-ui-experience-card-head h3 {
      margin: 0;
      font-size: 14px;
      line-height: 1.35;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-experience-card-head p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 70%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-summary-callout {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 14px;
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent) 0%, transparent 44%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.16)) 100%, transparent));
    }

    #${cardId} .stx-ui-summary-callout.is-overview-hero {
      gap: 10px;
      padding: 12px 14px;
    }

    #${cardId} .stx-ui-summary-callout.is-empty-state {
      border-style: dashed;
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.2)) 86%, transparent);
    }

    #${cardId} .stx-ui-summary-callout-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    #${cardId} .stx-ui-summary-eyebrow {
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.66;
      margin-bottom: 6px;
    }

    #${cardId} .stx-ui-summary-title {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 900;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 98%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-summary-title-wrap {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    #${cardId} .stx-ui-summary-title-icon {
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 88%, white 12%);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
      font-size: 13px;
    }

    #${cardId} .stx-ui-summary-meta,
    #${cardId} .stx-ui-summary-copy,
    #${cardId} .stx-ui-summary-foot {
      font-size: 12px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 78%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-summary-copy.is-rich,
    #${cardId} .stx-ui-summary-foot.is-rich {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    #${cardId} .stx-ui-summary-callout.is-overview-hero .stx-ui-summary-copy.is-rich {
      gap: 8px;
    }

    #${cardId} .stx-ui-summary-caption {
      font-size: 12px;
      line-height: 1.45;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 78%, transparent);
      word-break: break-word;
    }

    #${cardId} .stx-ui-summary-tile-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-ui-summary-tile {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 8px 9px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.12)) 90%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.14)) 100%, transparent);
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
    }

    #${cardId} .stx-ui-summary-tile-head {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .stx-ui-summary-tile-icon {
      flex: 0 0 auto;
      width: 16px;
      text-align: center;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 86%, white 14%);
      font-size: 11px;
      opacity: 0.92;
    }

    #${cardId} .stx-ui-summary-tile-label {
      min-width: 0;
      font-size: 10px;
      line-height: 1.3;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 58%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${cardId} .stx-ui-summary-tile-value {
      min-width: 0;
      font-size: 12px;
      line-height: 1.35;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 92%, transparent);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-summary-line {
      display: grid;
      grid-template-columns: 16px 72px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-ui-summary-line-icon {
      width: 16px;
      line-height: 1.45;
      text-align: center;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 86%, white 14%);
      opacity: 0.92;
      font-size: 11px;
      margin-top: 1px;
    }

    #${cardId} .stx-ui-summary-line-label {
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 60%, transparent);
      white-space: nowrap;
    }

    #${cardId} .stx-ui-summary-line-value {
      min-width: 0;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 90%, transparent);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-badge-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    #${cardId} .stx-ui-badge-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.14)) 90%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent);
    }

    #${cardId} .stx-ui-badge-card.is-accent {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 26%, transparent);
    }

    #${cardId} .stx-ui-badge-card.is-warning {
      border-color: color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 34%, transparent);
      background: color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 10%, transparent);
    }

    #${cardId} .stx-ui-badge-card.is-success {
      border-color: color-mix(in srgb, var(--stx-memory-success, #65d38f) 34%, transparent);
      background: color-mix(in srgb, var(--stx-memory-success, #65d38f) 10%, transparent);
    }

    #${cardId} .stx-ui-badge-label {
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.7;
    }

    #${cardId} .stx-ui-badge-value {
      font-size: 18px;
      line-height: 1.2;
      font-weight: 900;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 98%, transparent);
    }

    #${cardId} .stx-ui-memory-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-ui-memory-list.is-overview-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      align-items: stretch;
    }

    #${cardId} .stx-ui-memory-entry {
      min-width: 0;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.12)) 90%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.14)) 100%, transparent);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile {
      padding: 8px 10px;
      gap: 4px;
      border-radius: 10px;
      min-height: 90px;
    }

    #${cardId} .stx-ui-memory-entry.is-accent {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
    }

    #${cardId} .stx-ui-memory-entry.is-warning {
      border-color: color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 30%, transparent);
      background: color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 10%, transparent);
    }

    #${cardId} .stx-ui-memory-entry.is-success {
      border-color: color-mix(in srgb, var(--stx-memory-success, #65d38f) 28%, transparent);
    }

    #${cardId} .stx-ui-memory-entry-head {
      display: flex;
      flex-direction: column;
      align-items: baseline;
      justify-content: space-between;
      min-width: 0;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-memory-entry-head {
      gap: 1px;
    }

    #${cardId} .stx-ui-memory-entry-head strong,
    #${cardId} .stx-ui-memory-entry-body {
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-memory-entry-head strong {
      font-size: 13px;
      line-height: 1.35;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    #${cardId} .stx-ui-memory-entry-icon {
      flex: 0 0 auto;
      width: 18px;
      text-align: center;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 84%, white 16%);
      opacity: 0.9;
      font-size: 12px;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-memory-entry-head strong {
      font-size: 12px;
      line-height: 1.25;
      gap: 6px;
    }

    #${cardId} .stx-ui-memory-entry-head span {
      flex: 0 0 auto;
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.62;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-memory-entry-head span {
      font-size: 10px;
      line-height: 1.25;
      opacity: 0.52;
    }

    #${cardId} .stx-ui-memory-entry-body {
      font-size: 12px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 84%, transparent);
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-memory-entry-body {
      font-size: 11px;
      line-height: 1.38;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-actions {
      margin-top: auto;
      gap: 4px;
      justify-content: flex-end;
    }

    #${cardId} .stx-ui-fact-card-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    #${cardId} .stx-ui-fact-card {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 13px 14px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.14)) 90%, transparent);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 9%, transparent) 0%, transparent 44%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.14)) 100%, transparent));
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
    }

    #${cardId} .stx-ui-fact-card.is-accent {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 28%, transparent);
    }

    #${cardId} .stx-ui-fact-card-head,
    #${cardId} .stx-ui-fact-card-title-wrap,
    #${cardId} .stx-ui-fact-card-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #${cardId} .stx-ui-fact-card-title {
      font-size: 14px;
      line-height: 1.4;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-fact-card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .stx-ui-fact-chip {
      display: inline-flex;
      align-items: center;
      min-width: 0;
      max-width: 100%;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 10px;
      line-height: 1.25;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 76%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-fact-chip.is-soft {
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent);
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.16)) 88%, transparent);
    }

    #${cardId} .stx-ui-fact-field {
      min-width: 0;
      display: grid;
      grid-template-columns: minmax(64px, 92px) minmax(0, 1fr);
      gap: 8px 10px;
      align-items: start;
      padding: 8px 10px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.12)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.08)) 82%, transparent);
    }

    #${cardId} .stx-ui-fact-field.is-multiline {
      align-items: stretch;
    }

    #${cardId} .stx-ui-fact-field-label {
      font-size: 11px;
      line-height: 1.5;
      font-weight: 700;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 68%, transparent);
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-fact-field-value {
      min-width: 0;
      font-size: 12px;
      line-height: 1.7;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 90%, transparent);
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-pill-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    #${cardId} .stx-ui-explanation-groups {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      min-width: 0;
      align-items: start;
    }

    #${cardId} .stx-ui-explanation-group {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 8px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.12)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.14)) 100%, transparent);
      overflow: hidden;
    }

    #${cardId} .stx-ui-explanation-group-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 78%, transparent);
    }

    #${cardId} .stx-ui-explanation-group-head strong {
      font-size: 13px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-list {
      gap: 6px;
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-entry {
      padding: 8px 9px;
      gap: 4px;
      border-radius: 10px;
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-entry-head {
      align-items: flex-start;
      gap: 4px;
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-entry-head strong {
      font-size: 12px;
      line-height: 1.45;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-entry-head span {
      font-size: 10px;
      line-height: 1.45;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      text-align: left;
    }

    #${cardId} .stx-ui-explanation-group .stx-ui-memory-entry-body {
      font-size: 11px;
      line-height: 1.55;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-pill em {
      font-style: normal;
      opacity: 0.74;
    }

    #${cardId} .stx-ui-empty-hint {
      padding: 12px;
      border-radius: 12px;
      border: 1px dashed color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.16)) 86%, transparent);
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 66%, transparent);
      font-size: 12px;
      line-height: 1.55;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.12)) 100%, transparent);
    }

    #${cardId} .stx-ui-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #${cardId} .stx-ui-filter-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
    }

    #${cardId} .stx-ui-filter-group[hidden] {
      display: none !important;
    }

    #${cardId} .stx-ui-filter-group.is-reveal-animating {
      animation: stxFilterGroupReveal 0.28s cubic-bezier(0.21, 0.84, 0.35, 1) both;
    }

    @keyframes stxFilterGroupReveal {
      0% {
        opacity: 0;
        transform: translateY(-8px);
      }
      100% {
        opacity: 1;
        transform: translateY(0);
      }
    }

    #${cardId} .stx-ui-panel[hidden] {
      display: none !important;
    }

    @media (max-width: 760px) {
      #${cardId} .stx-ui-fact-field {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    #${cardId} .stx-ui-divider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
      opacity: 0.95;
    }

    #${cardId} .stx-ui-divider-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.2)) 0%, transparent),
        color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.2)) 80%, transparent) 18%,
        color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.2)) 100%, transparent) 50%,
        color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.2)) 80%, transparent) 82%,
        color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.2)) 0%, transparent)
      );
    }

    #${cardId} .stx-ui-item {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      border-radius: 10px;
      padding: 12px;
      margin: 2px 0;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.16));
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      overflow: hidden;
      min-width: 0;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-item-stack {
      flex-direction: column;
      align-items: stretch;
    }

    #${cardId} .stx-ui-item-main {
      min-width: 0;
      flex: 1;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    #${cardId} .stx-ui-item-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 3px;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    #${cardId} .stx-ui-item-desc {
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.75;
      word-break: break-word;
      overflow-wrap: break-word;
    }

    #${cardId} .stx-ui-about-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 24px;
    }

    #${cardId} .stx-ui-about-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-about-meta-item i {
      width: 14px;
      text-align: center;
      opacity: 0.86;
    }

    #${cardId} .stx-ui-about-meta a {
      color: inherit;
      text-decoration: none;
      border-bottom: 1px dashed color-mix(in srgb, var(--stx-memory-soft-line, rgba(255, 255, 255, 0.22)) 92%, transparent);
      transition: border-color 0.2s ease, text-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-about-meta a:hover {
      border-bottom-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 55%, transparent);
      text-shadow: 0 0 8px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent);
    }

    #${cardId} .stx-ui-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      flex-wrap: wrap;
      min-width: 0;
    }

    #${cardId} .stx-ui-inline-checkbox {
      width: auto;
      min-width: 0;
      flex-shrink: 0;
    }

    #${cardId} .stx-ui-inline-checkbox .stx-shared-checkbox-body {
      width: auto;
      min-width: 0;
      justify-content: flex-end;
    }

    #${cardId} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-copy {
      display: none;
    }

    #${cardId} .stx-ui-inline-checkbox.is-compact .stx-shared-checkbox-body {
      gap: 6px;
    }

    #${cardId} .stx-ui-inline-checkbox.is-compact .stx-shared-checkbox-title {
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }

    #${cardId} .stx-ui-item-stack .stx-ui-row {
      justify-content: flex-start;
      width: 100%;
    }

    #${cardId} .stx-ui-field-label {
      font-size: 13px;
      opacity: 0.85;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .stx-ui-form-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      width: 100%;
    }

    #${cardId} .stx-ui-memory-tuning-grid .stx-ui-input {
      width: 100%;
    }

    #${cardId} .stx-ui-task-surface-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    #${cardId} .stx-ui-inline-toggle-field {
      justify-content: space-between;
      min-height: 56px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.12));
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-search,
    #${cardId} .stx-ui-textarea {
      background: var(--ss-theme-surface-2, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.28)));
      color: var(--ss-theme-text, inherit);
      border: 1px solid var(--ss-theme-border, rgba(197, 160, 89, 0.36));
      border-radius: 8px;
      box-sizing: border-box;
      max-width: 100%;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease;
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-search {
      padding: 4px 8px;
      min-height: 30px;
    }

    #${cardId} .stx-ui-input::placeholder,
    #${cardId} .stx-ui-search::placeholder,
    #${cardId} .stx-ui-textarea::placeholder {
      color: color-mix(in srgb, var(--ss-theme-text, #dcdcd2) 60%, transparent);
    }

    #${cardId} .stx-ui-select {
      min-width: 182px;
      max-width: 100%;
      text-align: center;
      text-align-last: center;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      padding-right: 32px;
      background-image:
        linear-gradient(45deg, transparent 50%, color-mix(in srgb, var(--ss-theme-text, #fff) 78%, transparent) 50%),
        linear-gradient(135deg, color-mix(in srgb, var(--ss-theme-text, #fff) 78%, transparent) 50%, transparent 50%),
        linear-gradient(to right, color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.15)) 100%, transparent), color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.08)) 72%, transparent));
      background-position:
        calc(100% - 16px) calc(50% - 1px),
        calc(100% - 11px) calc(50% - 1px),
        calc(100% - 30px) 50%;
      background-size: 6px 6px, 6px 6px, 1px 62%;
      background-repeat: no-repeat;
    }

    #${cardId} .stx-ui-select option {
      text-align: left;
    }

    #${cardId} .stx-ui-input {
      width: 120px;
    }

    #${cardId} .stx-ui-codeblock-tags {
      width: 100%;
      min-height: 78px;
      resize: vertical;
      line-height: 1.45;
      padding: 8px 10px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    #${cardId} .stx-ui-item.is-disabled {
      opacity: 0.62;
    }

    #${cardId} .stx-ui-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .stx-ui-icon-action {
      flex: 0 0 auto;
      width: 28px;
      min-width: 28px;
      height: 28px;
      min-height: 28px;
      padding: 0;
      border-radius: 999px;
      justify-content: center;
      gap: 0;
    }

    #${cardId} .stx-ui-icon-action i {
      font-size: 12px;
    }

    #${cardId} .stx-ui-memory-entry.is-overview-tile .stx-ui-icon-action {
      margin-left: auto;
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.14)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent);
      box-shadow: none;
    }

    #${cardId} .stx-ui-code-surface {
      width: 100%;
      font-size: 12px;
      color: var(--ss-theme-text, #ccc);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent);
      border-radius: 10px;
      padding: 10px 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 82%, transparent);
      box-sizing: border-box;
      min-width: 0;
    }

    #${cardId} .stx-ui-template-panel {
      gap: 10px;
    }

    #${cardId} .stx-ui-template-list {
      max-height: 280px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      white-space: normal;
    }

    #${cardId} .stx-ui-template-record {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 10px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 84%, transparent);
    }

    #${cardId} .stx-ui-template-record.is-active {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 34%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent);
    }

    #${cardId} .stx-ui-template-record-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-ui-template-record-title {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    #${cardId} .stx-ui-template-record-name {
      font-size: 13px;
      line-height: 1.4;
      font-weight: 800;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-template-record-meta {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.76;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-template-record-badge {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 28%, transparent);
      font-size: 10px;
      line-height: 1;
      font-weight: 800;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-template-record-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 6px 10px;
      min-width: 0;
    }

    #${cardId} .stx-ui-template-record-cell {
      min-width: 0;
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-template-record-cell strong {
      display: block;
      margin-bottom: 2px;
      font-size: 10px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.7;
    }

    #${cardId} .stx-ui-template-toolbar {
      width: 100%;
    }

    #${cardId} .stx-ui-template-activate-row {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    #${cardId} .stx-ui-template-select-wrap {
      flex: 1 1 280px;
      min-width: min(100%, 280px);
    }

    #${cardId} .stx-ui-template-lock {
      flex: 0 0 auto;
      min-width: 0;
    }

    #${cardId} .stx-ui-template-lock .stx-ui-inline-checkbox {
      width: auto;
    }

    #${cardId} .stx-ui-checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
      min-width: 0;
    }

    #${cardId} .stx-ui-grid-form {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 10px;
      width: 100%;
      min-width: 0;
    }

    #${cardId} .stx-ui-grid-form label {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    #${cardId} .stx-ui-grid-form label span {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    #${cardId} .stx-ui-grid-form .stx-ui-input,
    #${cardId} .stx-ui-grid-form .stx-ui-select {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }

    #${cardId} .stx-ui-btn {
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 7px;
      border: 1px solid var(--ss-theme-border, rgba(197, 160, 89, 0.45));
      background: var(--ss-theme-surface-3, rgba(197, 160, 89, 0.14));
      color: var(--ss-theme-text, inherit);
      font-size: 12px;
      white-space: nowrap;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-template-apply-btn {
      min-width: 70px;
      align-self: stretch;
    }

    #${cardId} .stx-ui-btn.secondary {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      background: var(--ss-theme-surface-2, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-textarea-wrap {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.18));
      border-radius: 10px;
      background: var(--ss-theme-surface-2, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.15)));
      padding: 10px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    #${cardId} .stx-ui-textarea {
      width: 100%;
      resize: vertical;
      padding: 8px;
      font-size: 12px;
      line-height: 1.5;
      min-height: 220px;
    }

    #${cardId} .stx-ui-tip {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.78;
      padding-top: 4px;
    }
    
    #${cardId} .stx-ui-changelog {
      width: 100%;
      max-height: 150px;
      overflow-y: auto;
      margin-top: 8px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.5;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      box-sizing: border-box;
    }

    #${cardId} .stx-ui-changelog ul {
      margin: 4px 0 0 0;
      padding-left: 20px;
      opacity: 0.85;
    }

    #${cardId} .stx-ui-changelog li {
      margin-bottom: 4px;
    }

    #${cardId} .stx-ui-changelog-entry {
      margin-bottom: 12px;
    }

    #${cardId} .stx-ui-changelog-head {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
    }

    #${cardId} .stx-ui-changelog-version {
      font-weight: 700;
      color: var(--ss-theme-accent-contrast, #fff);
      font-size: 13px;
    }

    #${cardId} .stx-ui-changelog-date {
      font-size: 11px;
      opacity: 0.6;
    }

    #${cardId} .stx-ui-changelog-list {
      margin: 0;
      padding-left: 20px;
      font-size: 12px;
      opacity: 0.85;
    }

    #${cardId} .stx-ui-changelog-list li {
      margin-bottom: 4px;
      line-height: 1.4;
    }

    #${cardId} .stx-ui-audit-row {
      padding: 6px 8px;
      border-radius: 4px;
      margin-bottom: 4px;
      background: var(--ss-theme-surface-2, rgba(255, 255, 255, 0.05));
      display: flex;
      align-items: center;
      gap: 8px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.12)) 72%, transparent);
    }

    #${cardId} .stx-ui-audit-main {
      flex: 1;
      font-size: 11px;
    }

    #${cardId} .stx-ui-audit-action {
      color: color-mix(in srgb, var(--ss-theme-text, #ccc) 80%, transparent);
      font-weight: 700;
    }

    #${cardId} .stx-ui-audit-action.is-snapshot {
      color: var(--stx-memory-info, #7ca5f5);
    }

    #${cardId} .stx-ui-audit-time,
    #${cardId} .stx-ui-empty-hint {
      color: var(--stx-memory-muted-text, #aaa);
    }

    #${cardId} .stx-ui-audit-rollback {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--stx-memory-info-soft, rgba(124, 165, 245, 0.2));
      border: 1px solid var(--stx-memory-info-border, #7ca5f5);
      border-radius: 4px;
      color: var(--stx-memory-info, #7ca5f5);
      cursor: pointer;
    }

    #${cardId} .stx-ui-audit-rollback:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }

    #${cardId} .stx-logic-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 6px;
      border-radius: 4px;
      margin-bottom: 3px;
      background: var(--ss-theme-surface-2, rgba(255, 255, 255, 0.04));
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.08)) 70%, transparent);
    }

    #${cardId} .stx-logic-entity {
      color: var(--stx-memory-info, #7ca5f5);
      font-size: 11px;
      white-space: nowrap;
    }

    #${cardId} .stx-logic-path {
      color: var(--stx-memory-muted-text, #aaa);
      font-size: 11px;
      flex: 0 0 auto;
    }

    #${cardId} .stx-logic-value {
      flex: 1;
      font-size: 11px;
      border-radius: 3px;
      padding: 1px 4px;
      cursor: default;
      transition: background-color 0.2s ease, outline-color 0.2s ease;
    }

    #${cardId} .stx-logic-value.is-editing {
      background: var(--stx-memory-info-soft, rgba(124, 165, 245, 0.15));
      outline: 1px solid var(--stx-memory-info, #7ca5f5);
      cursor: text;
    }

    #${cardId} .stx-logic-value.is-saved {
      background: var(--stx-memory-success-soft, rgba(80, 200, 120, 0.1));
    }

    #${cardId} .stx-logic-value.is-error {
      background: var(--stx-memory-danger-soft, rgba(255, 100, 100, 0.15));
    }

    #${cardId} .stx-ui-changelog::-webkit-scrollbar {
      width: 4px;
    }
    #${cardId} .stx-ui-changelog::-webkit-scrollbar-thumb {
      background: var(--stx-memory-scrollbar, rgba(197, 160, 89, 0.5));
      border-radius: 10px;
    }

    #${cardId} input[type="checkbox"] {
      accent-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 92%, white 8%);
      transition: filter 0.2s ease;
    }

    #${cardId} .stx-ui-tab:hover {
      opacity: 1;
      background: var(--ss-theme-list-item-hover-bg, rgba(197, 160, 89, 0.2));
      box-shadow: 0 0 12px color-mix(in srgb, var(--ss-theme-accent, rgba(197, 160, 89, 1)) 28%, transparent);
    }

    #${cardId} .stx-ui-item:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.48));
      background: var(--ss-theme-list-item-hover-bg, rgba(0, 0, 0, 0.24));
      box-shadow:
        0 0 0 1px rgba(197, 160, 89, 0.2),
        0 0 16px rgba(197, 160, 89, 0.16);
    }

    #${cardId} .stx-ui-select:hover,
    #${cardId} .stx-ui-input:hover,
    #${cardId} .stx-ui-search:hover,
    #${cardId} .stx-ui-textarea:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.58));
      background-color: var(--ss-theme-surface-3, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.34)));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ss-theme-focus-ring, rgba(197, 160, 89, 0.22)) 82%, transparent);
    }

    #${cardId} .stx-ui-btn:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.68));
      background: var(--ss-theme-list-item-hover-bg, rgba(197, 160, 89, 0.24));
      box-shadow:
        inset 0 0 0 1px rgba(197, 160, 89, 0.26),
        0 0 14px rgba(197, 160, 89, 0.2);
    }

    #${cardId} .stx-ui-select:focus,
    #${cardId} .stx-ui-input:focus,
    #${cardId} .stx-ui-search:focus,
    #${cardId} .stx-ui-textarea:focus {
      outline: none;
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.72));
      box-shadow: 0 0 0 2px var(--ss-theme-focus-ring, rgba(197, 160, 89, 0.22));
    }

    .stx-running-dots {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .stx-dot {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background-color: var(--ss-theme-accent, #c5a059);
      animation: stxRunningDots 1.4s infinite ease-in-out both;
    }

    .stx-running-dots .stx-dot:nth-child(1) {
      animation-delay: -0.32s;
    }

    .stx-running-dots .stx-dot:nth-child(2) {
      animation-delay: -0.16s;
    }

    @keyframes stxRunningDots {
      0%, 80%, 100% {
        transform: scale(0);
        opacity: 0.3;
      }
      40% {
        transform: scale(1);
        opacity: 1;
      }
    }

  `;
}
