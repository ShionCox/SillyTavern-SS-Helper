import { buildSharedCheckboxStyles } from "../../../_Components/sharedCheckbox";
import { buildSharedButtonStyles } from "../../../_Components/sharedButton";
import { buildSharedInputStyles } from "../../../_Components/sharedInput";
import { buildSharedSelectStyles } from "../../../_Components/sharedSelect";
import { buildThemeVars } from "../../../SDK/theme";

export function buildSettingsCardStylesTemplate(cardId: string): string {
  return `
    ${buildThemeVars(`#${cardId} .stx-ui-content`)}
    ${buildThemeVars(`.stx-record-editor-overlay`)}
    ${buildThemeVars(`.stx-memory-chat-strategy-overlay`)}
    ${buildSharedCheckboxStyles(`#${cardId}`)}
    ${buildSharedSelectStyles(`#${cardId}`)}
    ${buildSharedButtonStyles(`#${cardId}`)}
    ${buildSharedInputStyles(`#${cardId}`)}
    ${buildSharedCheckboxStyles(`.stx-memory-chat-strategy-overlay`)}
    ${buildSharedSelectStyles(`.stx-memory-chat-strategy-overlay`)}
    ${buildSharedButtonStyles(`.stx-memory-chat-strategy-overlay`)}
    ${buildSharedInputStyles(`.stx-memory-chat-strategy-overlay`)}

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

    /* === Record Editor Overlay === */
    .stx-record-editor-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: var(--ss-theme-backdrop, rgba(10, 10, 12, 0.85));
      backdrop-filter: var(--ss-theme-backdrop-filter, blur(12px));
      -webkit-backdrop-filter: var(--ss-theme-backdrop-filter, blur(12px));
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ss-theme-text, #eaeaea);
      font-family: inherit;
    }

    .stx-record-editor {
      width: min(1560px, 94vw);
      height: min(92vh, 980px);
      max-width: calc(100vw - 28px);
      max-height: calc(100vh - 28px);
      background: var(--ss-theme-panel-bg, linear-gradient(145deg, rgba(30, 30, 34, 0.95), rgba(18, 18, 20, 0.98)));
      border: 1px solid var(--ss-theme-panel-border, rgba(197, 160, 89, 0.3));
      border-radius: 20px;
      box-shadow: var(--ss-theme-panel-shadow, 0 25px 60px rgba(0,0,0,0.8)), inset 0 1px 0 rgba(255,255,255,0.1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.98);
      animation: stxPopIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
    }

    @keyframes stxPopIn {
      to { transform: scale(1); }
    }

    .stx-re-header {
      padding: 16px 24px;
      background: linear-gradient(90deg, color-mix(in srgb, var(--ss-theme-accent, rgba(197, 160, 89, 1)) 18%, transparent) 0%, transparent 100%);
      border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.08));
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .stx-re-title {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: var(--ss-theme-accent-contrast, #fff);
      display: flex;
      align-items: center;
      gap: 12px;
      text-shadow: 0 0 10px rgba(197, 160, 89, 0.3);
    }

    .stx-re-header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stx-re-close {
      cursor: pointer;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255, 255, 255, 0.05)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.1)) 78%, transparent);
      transition: all 0.2s ease;
    }

    .stx-re-close:hover {
      background: var(--stx-memory-danger-soft, rgba(255, 100, 100, 0.2));
      border-color: var(--stx-memory-danger-border, rgba(255, 100, 100, 0.5));
      color: var(--stx-memory-danger-contrast, #ff8787);
      transform: rotate(90deg);
    }

    .stx-re-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* === Sidebar === */
    .stx-re-sidebar {
      width: 280px;
      flex-shrink: 0;
      border-right: 1px solid var(--ss-theme-border, rgba(255,255,255,0.06));
      background: var(--ss-theme-surface-2, rgba(0,0,0,0.2));
      display: flex;
      flex-direction: column;
    }

    .stx-re-sidebar-title {
      padding: 14px 20px;
      font-size: 13px;
      font-weight: 700;
      color: var(--stx-memory-muted-text, rgba(255,255,255,0.5));
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
    }

    .stx-re-sidebar-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
    }

    .stx-re-sidebar-list::-webkit-scrollbar {
      width: 6px;
    }
    .stx-re-sidebar-list::-webkit-scrollbar-track { background: transparent; }
    .stx-re-sidebar-list::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 80%, transparent);
      border-radius: 3px;
    }

    .stx-re-chat-item {
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: all 0.2s ease;
      border: 1px solid transparent;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .stx-re-chat-item:hover {
      background: var(--ss-theme-list-item-hover-bg, rgba(255,255,255,0.04));
    }
    
    .stx-re-chat-item.is-context-target {
      background: color-mix(in srgb, var(--ss-theme-list-item-hover-bg, rgba(255,255,255,0.08)) 80%, transparent);
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.15)) 88%, transparent);
    }

    .stx-re-chat-item.is-active {
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.15));
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.3));
    }

    .stx-re-chat-item.is-archived {
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 92%, rgba(160, 60, 60, 0.16));
      border-color: color-mix(in srgb, rgba(214, 102, 102, 0.45) 70%, transparent);
    }

    .stx-re-chat-item.is-archived:not(.is-active) {
      opacity: 0.86;
    }

    .stx-re-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.1)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 80%, transparent);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .stx-re-chat-avatar-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent);
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 80%, var(--ss-theme-text, #fff) 20%);
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 30%, transparent);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .stx-re-chat-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
      flex: 1;
    }

    .stx-re-chat-name-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .stx-re-chat-name {
      flex: 0 1 auto;
      min-width: 0;
      font-size: 14px;
      font-weight: 600;
      color: color-mix(in srgb, var(--ss-theme-text, #e0e0e0) 90%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-status-badge {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: color-mix(in srgb, #ffd8d8 88%, var(--ss-theme-text, #fff) 12%);
      background: color-mix(in srgb, rgba(198, 76, 76, 0.32) 100%, transparent);
      border: 1px solid color-mix(in srgb, rgba(214, 102, 102, 0.55) 90%, transparent);
    }

    .stx-re-chat-sys {
      font-size: 11px;
      color: var(--stx-memory-muted-text, rgba(255,255,255,0.4));
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-sys-status {
      color: color-mix(in srgb, #ffb6b6 84%, var(--ss-theme-text, #fff) 16%);
      font-family: inherit;
      font-weight: 600;
    }

    .stx-re-chat-item.is-active .stx-re-chat-name {
      color: var(--ss-theme-accent-contrast, #fff);
    }

    /* === Main Area === */
    .stx-re-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--ss-theme-surface-2, rgba(15, 15, 18, 0.4));
    }

    .stx-re-tabs {
      padding: 6px 24px;
      display: flex;
      gap: 10px;
      background: var(--ss-theme-toolbar-bg, rgba(0,0,0,0.15));
      border-bottom: 1px solid var(--ss-theme-border, rgba(255,255,255,0.04));
      flex-shrink: 0;
    }

    .stx-re-view-tabs {
      padding: 14px 24px 8px;
      display: flex;
      gap: 10px;
      background:
        linear-gradient(180deg,
          color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent) 0%,
          transparent 100%);
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.06)) 100%, transparent);
      flex-shrink: 0;
    }

    .stx-re-tab {
      padding: 8px 18px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0.6;
      background: var(--ss-theme-surface-3, rgba(255,255,255,0.03));
      border: 1px solid transparent;
    }

    .stx-re-tab:hover {
      opacity: 0.9;
      background: var(--ss-theme-list-item-hover-bg, rgba(197, 160, 89, 0.15));
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.3));
      transform: translateY(-1px);
    }

    .stx-re-tab.is-active {
      opacity: 1;
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.3));
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.6));
      color: var(--ss-theme-text, inherit);
      box-shadow: 0 4px 12px color-mix(in srgb, var(--ss-theme-accent, rgba(197, 160, 89, 1)) 24%, transparent);
    }

    .stx-re-view-tabs .stx-re-tab {
      min-width: 120px;
      text-align: center;
    }

    .stx-re-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      padding: 0; /* Remove container padding so table touches top */
      scrollbar-width: thin;
      scrollbar-color: var(--stx-memory-scrollbar, rgba(197, 160, 89, 0.5)) color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent);
    }
    
    .stx-re-content::-webkit-scrollbar {
      width: 8px;
    }
    .stx-re-content::-webkit-scrollbar-track {
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent);
      border-radius: 4px;
    }
    .stx-re-content::-webkit-scrollbar-thumb {
      background: var(--stx-memory-scrollbar, rgba(197, 160, 89, 0.4));
      border-radius: 4px;
    }
    .stx-re-content::-webkit-scrollbar-thumb:hover {
      background: var(--stx-memory-scrollbar-hover, rgba(197, 160, 89, 0.8));
    }

    /* === Table === */
    .stx-re-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
      text-align: left;
    }
    .stx-re-table th {
      padding: 16px 24px;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, #1a1a1e) 92%, black 8%);
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 88%, var(--ss-theme-text, #fff) 12%);
      font-weight: 700;
      border-bottom: 2px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 100%, transparent);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--ss-theme-shadow, rgba(0,0,0,0.8)) 82%, transparent);
      white-space: nowrap;
      background-clip: padding-box;
    }

    .stx-re-resizer {
      position: absolute;
      top: 0;
      right: 0;
      width: 5px;
      bottom: 0;
      cursor: col-resize;
      user-select: none;
      background: transparent;
      z-index: 11;
      transition: background 0.2s;
    }

    .stx-re-resizer:hover, .stx-re-resizer.is-resizing {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 60%, transparent);
    }
    .stx-re-table td {
      padding: 6px 24px;
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.05)) 68%, transparent);
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }

    .stx-re-record-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      white-space: normal;
    }

    .stx-re-record-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
    }

    .stx-re-record-title {
      font-size: 13px;
      line-height: 1.45;
      font-weight: 700;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 94%, transparent);
      word-break: break-word;
    }

    .stx-re-record-sub {
      font-size: 11px;
      line-height: 1.5;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 68%, transparent);
      word-break: break-word;
    }

    .stx-re-record-code {
      font-size: 10px;
      line-height: 1.45;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 42%, transparent);
      word-break: break-all;
    }

    .stx-re-record-flag {
      flex: 0 0 auto;
      padding: 2px 7px;
      border-radius: 999px;
      font-size: 10px;
      line-height: 1.2;
      font-weight: 700;
      color: color-mix(in srgb, var(--stx-memory-warning, #ff9800) 88%, white 12%);
      background: color-mix(in srgb, var(--stx-memory-warning, #ff9800) 12%, transparent);
      border: 1px solid color-mix(in srgb, var(--stx-memory-warning, #ff9800) 28%, transparent);
      white-space: nowrap;
    }
    
    .stx-re-table td:first-child {
      border-left: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.03)) 52%, transparent);
      border-radius: 8px 0 0 8px;
    }
    .stx-re-table td:last-child {
      border-right: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.03)) 52%, transparent);
      border-radius: 0 8px 8px 0;
    }

    .stx-re-row {
      transition: all 0.2s ease;
    }

    .stx-re-row:hover td {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 8%, transparent);
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent);
    }

    .stx-re-actions {
      display: flex;
      gap: 6px;
      white-space: nowrap;
    }

    .stx-re-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.15)) 86%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.05)) 100%, transparent);
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 82%, transparent);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .stx-re-btn:hover {
      background: var(--ss-theme-list-item-hover-bg, rgba(255,255,255, 0.15));
      border-color: color-mix(in srgb, var(--ss-theme-border-strong, rgba(255,255,255, 0.4)) 94%, transparent);
      color: var(--ss-theme-accent-contrast, #fff);
    }

    .stx-re-btn.danger {
      border-color: var(--stx-memory-danger-border, rgba(244, 67, 54, 0.35));
      color: var(--stx-memory-danger-contrast, #f44336);
      background: var(--stx-memory-danger-soft, rgba(244, 67, 54, 0.1));
    }

    .stx-re-btn.danger:hover {
      background: color-mix(in srgb, var(--stx-memory-danger) 22%, transparent);
      border-color: color-mix(in srgb, var(--stx-memory-danger) 56%, transparent);
      color: var(--stx-memory-danger-contrast, #ffb2b2);
    }

    .stx-re-btn.is-hidden {
      display: none;
    }

    .stx-re-value {
      max-height: 200px;
      overflow-y: auto;
      overflow-x: hidden;
      white-space: pre-wrap;
      word-break: break-all;
      line-height: 1.5;
      padding-right: 4px;
      scrollbar-width: thin;
      scrollbar-color: var(--stx-memory-scrollbar, rgba(197, 160, 89, 0.4)) transparent;
      display: flex;
      flex-direction: column;
    }

    .stx-re-value::-webkit-scrollbar {
      width: 4px;
    }
    .stx-re-value::-webkit-scrollbar-track {
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.1)) 100%, transparent);
      border-radius: 2px;
    }
    .stx-re-value::-webkit-scrollbar-thumb {
      background: var(--stx-memory-scrollbar, rgba(197, 160, 89, 0.4));
      border-radius: 2px;
    }
    .stx-re-value::-webkit-scrollbar-thumb:hover {
      background: var(--stx-memory-scrollbar-hover, rgba(197, 160, 89, 0.8));
    }
    
    .stx-re-value.editable:hover {
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.05)) 100%, transparent);
      border-radius: 4px;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 90%, transparent);
    }

    .stx-re-value.is-editing {
      background: var(--stx-memory-edit-soft, rgba(197, 160, 89, 0.1));
      padding: 4px;
      border-radius: 4px;
    }

    .stx-re-json {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: var(--stx-memory-code-text, #b0bfd8);
    }

    .stx-re-json.compact {
      font-size: 10px;
    }

    .stx-re-json.truncate {
      width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-time {
      font-size: 10px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 35%, transparent);
      white-space: nowrap;
      margin-top: 2px;
    }

    /* === Checkbox === */
    .stx-re-checkbox-td {
      text-align: center;
    }
    .stx-re-checkbox {
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 92%, transparent);
      border-radius: 4px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent);
      cursor: pointer;
      position: relative;
      transition: all 0.2s;
      opacity: 0;
    }
    
    /* 默认隐藏 Checkbox，悬浮行或已选中时才显示 */
    .stx-re-row:hover .stx-re-checkbox,
    .stx-re-checkbox:checked,
    .stx-re-table th .stx-re-checkbox {
      opacity: 1;
    }

    .stx-re-checkbox:checked {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 80%, white 20%);
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 100%, white 0%);
    }
    .stx-re-checkbox:checked::after {
      content: '\\f00c';
      font-family: 'Font Awesome 6 Free';
      font-weight: 900;
      font-size: 10px;
      color: #fff;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    }

    /* === Checkbox === */
    .stx-re-value pre {
      margin: 0;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 11px;
      color: color-mix(in srgb, var(--stx-memory-code-text, #a3c2cf) 90%, transparent);
      padding: 4px 6px;
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 90%, transparent) transparent;
      background: transparent;
      border: none;
    }

    /* === KV Display & Edit === */
    .stx-re-kv {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      padding: 0 4px;
      border-radius: 6px;
      background: transparent;
      border: none;
    }
    .stx-re-kv-row {
      align-items: flex-start;
      display: flex;
      gap: 8px;
    }
    .stx-re-kv-key {
      color: var(--stx-memory-info, #7ca5f5);
      font-weight: 600;
      min-width: 64px;
    }
    .stx-re-kv-val {
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 86%, transparent);
      word-break: break-word;
    }
    .stx-re-kv-input {
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.4)) 100%, black 6%);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.15)) 88%, transparent);
      color: var(--ss-theme-accent-contrast, #fff);
      padding: 3px 6px;
      border-radius: 4px;
      font-family: inherit;
      flex-grow: 1;
      font-size: 11px;
      min-height: 20px;
      word-break: break-all;
      outline: none;
    }
    .stx-re-kv-input:focus {
      border-color: var(--stx-memory-edit-border, rgba(197, 160, 89, 0.8));
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.6)) 100%, black 12%);
    }
    
    /* === Sortable Headers === */
    .stx-re-th-sortable {
      cursor: pointer;
      user-select: none;
      transition: color 0.2s;
    }
    .stx-re-th-sortable:hover {
      color: var(--ss-theme-accent-contrast, #fff);
    }
    .stx-re-th-sortable i {
      margin-left: 4px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 30%, transparent);
    }
    .stx-re-th-sortable.active {
      color: var(--ss-theme-accent, rgba(197, 160, 89, 1));
    }
    .stx-re-th-sortable.active i {
      color: var(--ss-theme-accent, rgba(197, 160, 89, 1));
    }

    /* === Footer === */
    .stx-re-footer {
      padding: 14px 24px;
      background: var(--ss-theme-toolbar-bg, rgba(0,0,0,0.25));
      border-top: 1px solid var(--ss-theme-border, rgba(255,255,255,0.06));
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }
    .stx-re-footer-left {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .stx-re-footer-right {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .stx-re-pending-msg {
      font-size: 13px;
      color: var(--stx-memory-warning, #ff9800);
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .stx-re-pending-msg.visible {
      opacity: 1;
    }
    
    .stx-re-btn.save {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 80%, white 20%);
      color: color-mix(in srgb, var(--ss-theme-panel-bg, #111) 92%, black 8%);
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 100%, white 0%);
      padding: 8px 20px;
      font-size: 14px;
      box-shadow: 0 4px 10px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent);
    }
    .stx-re-btn.save:hover {
      background: color-mix(in srgb, var(--ss-theme-accent, #d9b46d) 86%, white 14%);
      box-shadow: 0 4px 15px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 38%, transparent);
      color: color-mix(in srgb, var(--ss-theme-panel-bg, #000) 100%, black 0%);
    }
    .stx-re-btn.save:disabled {
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.3)) 100%, transparent);
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 30%, transparent);
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 76%, transparent);
      cursor: not-allowed;
      box-shadow: none;
    }

    /* === Pending State Styles === */
    .stx-re-row.pending-delete {
      opacity: 0.4;
      pointer-events: none;
      background: var(--stx-memory-danger-soft, rgba(255,0,0,0.05));
    }
    .stx-re-row.pending-update {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 5%, transparent);
      border-left: 2px solid var(--stx-memory-edit-border, rgba(197, 160, 89, 0.8));
    }

    /* === Context Menu === */
    .stx-re-ctx-menu {
      position: absolute;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(25, 25, 25, 0.95)) 94%, black 6%);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255, 255, 255, 0.15)) 90%, transparent);
      border-radius: 6px;
      box-shadow: 0 4px 12px color-mix(in srgb, var(--ss-theme-shadow, rgba(0,0,0,0.5)) 82%, transparent);
      padding: 6px 0;
      z-index: 1000000;
      min-width: 140px;
      backdrop-filter: blur(4px);
    }
    
    .stx-re-ctx-menu-item {
      padding: 8px 16px;
      font-size: 13px;
      color: color-mix(in srgb, var(--ss-theme-text, #e0e0e0) 92%, transparent);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .stx-re-ctx-menu-item:hover {
      background: var(--ss-theme-list-item-hover-bg, rgba(255, 255, 255, 0.15));
    }
    
    .stx-re-empty {
      text-align: center;
      padding: 60px;
      color: var(--stx-memory-muted-text, rgba(255,255,255,0.4));
      font-size: 15px;
      font-weight: 600;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }
    
    .stx-re-empty::before {
      content: '\\f07c';
      font-family: 'Font Awesome 6 Free';
      font-weight: 900;
      font-size: 32px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 15%, transparent);
    }

    .stx-re-empty.is-error {
      color: var(--stx-memory-danger-contrast, #ff8787);
    }

    .stx-re-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      color: var(--ss-theme-accent-contrast, #fff);
    }

    .stx-re-badge.is-ai {
      background: var(--stx-memory-success, #10b981);
    }

    .stx-re-badge.is-user {
      background: var(--stx-memory-info, #3b82f6);
    }

    .stx-re-badge.is-system {
      background: color-mix(in srgb, #8b5cf6 84%, var(--ss-theme-accent, #c5a059));
    }

    .stx-re-sender-info {
      margin-top: 4px;
      font-size: 11px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .stx-re-sender-name {
      color: var(--stx-memory-code-text, #b0bfd8);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 140px;
    }

    .stx-re-event-type {
      font-weight: 700;
    }

    .stx-re-accent-text {
      color: var(--stx-memory-info, #7ca5f5);
      font-weight: 700;
    }

    .stx-re-btn.edit.is-editing {
      color: var(--ss-theme-accent, #c5a059);
      border-color: var(--stx-memory-edit-border, #c5a059);
    }

    .stx-re-logic-cell {
      min-height: 22px;
      border-radius: 6px;
      padding: 4px 6px;
      transition: background 0.2s ease, box-shadow 0.2s ease;
      cursor: text;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .stx-re-logic-cell:hover {
      background: color-mix(in srgb, var(--ss-theme-list-item-hover-bg, rgba(255,255,255,0.06)) 100%, transparent);
    }

    .stx-re-logic-cell.is-readonly {
      cursor: default;
      opacity: 0.75;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(0,0,0,0.18)) 100%, transparent);
    }

    .stx-re-logic-cell.is-editing {
      outline: none;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 16%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 65%, transparent);
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

    #${cardId} .stx-memory-chat-strategy-card {
      gap: 10px;
      padding: 10px;
    }

    #${cardId} .stx-memory-chat-strategy-card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
    }

    #${cardId} .stx-memory-chat-strategy-card-actions,
    #${cardId} .stx-memory-chat-strategy-card-toolbar,
    #${cardId} .stx-memory-chat-strategy-sections {
      width: 100%;
    }

    #${cardId} .stx-memory-chat-strategy-card-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      flex-wrap: wrap;
    }

    #${cardId} .stx-memory-chat-strategy-card-head .stx-ui-item-main {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
    }

    #${cardId} .stx-memory-chat-strategy-card-head .stx-ui-item-title {
      font-size: 14px;
      line-height: 1.25;
    }

    #${cardId} .stx-memory-chat-strategy-card-head .stx-ui-item-desc {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.72;
    }

    #${cardId} .stx-memory-chat-strategy-card-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      align-items: end;
    }

    #${cardId} .stx-memory-chat-strategy-card-toolbar .stx-memory-chat-strategy-card-actions {
      width: auto;
      flex-wrap: nowrap;
      justify-content: flex-end;
    }

    #${cardId} .stx-memory-chat-strategy-card-toolbar .stx-shared-button {
      min-height: 34px;
      padding: 5px 10px;
      font-size: 11px;
      white-space: nowrap;
    }

    .stx-memory-chat-strategy-preset-actions {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      align-items: stretch;
      justify-content: space-between;
      width: 100%;
    }

    .stx-memory-chat-strategy-preset-actions > * {
      min-width: 0;
      width: 100%;
    }

    .stx-memory-chat-strategy-preset-actions button {
      width: 100%;
      justify-content: center;
    }

    .stx-memory-chat-strategy-top-inline-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
      gap: 12px;
      align-items: stretch;
    }

    .stx-memory-chat-strategy-inline-card {
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-inline-card-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-inline-card-head h4 {
      margin: 0;
      font-size: 13px;
      line-height: 1.3;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
    }

    .stx-memory-chat-strategy-inline-card-head p {
      margin: 0;
      font-size: 11px;
      line-height: 1.5;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-inline-card-preset .stx-memory-chat-strategy-card-actions {
      margin-top: 0 !important;
    }

    #${cardId} .stx-memory-chat-strategy-card-field,
    .stx-memory-chat-strategy-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .stx-memory-chat-strategy-card-label,
    .stx-memory-chat-strategy-field-label,
    .stx-memory-chat-strategy-summary-label {
      font-size: 11px;
      line-height: 1.3;
      letter-spacing: 0.02em;
      opacity: 0.72;
    }

    #${cardId} .stx-memory-chat-strategy-summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 6px;
      width: 100%;
    }

    #${cardId} .stx-memory-chat-strategy-summary-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      border-radius: 9px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.14)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent);
      min-width: 0;
    }

    #${cardId} .stx-memory-chat-strategy-summary-value {
      display: -webkit-box;
      overflow: hidden;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.25;
      word-break: break-word;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }

    #${cardId} .stx-memory-chat-strategy-summary-maintenance {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 9px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-warning, #ffb24d) 42%, transparent);
      background: color-mix(in srgb, var(--ss-theme-warning, #ffb24d) 12%, transparent);
    }

    #${cardId} .stx-memory-chat-strategy-summary-maintenance-text {
      font-size: 11px;
      line-height: 1.3;
      font-weight: 600;
    }

    #${cardId} .stx-memory-chat-strategy-summary-maintenance-action {
      border: 1px solid color-mix(in srgb, var(--ss-theme-warning, #ffb24d) 60%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.08)) 96%, transparent);
      color: var(--ss-theme-text, inherit);
      border-radius: 8px;
      padding: 3px 8px;
      font-size: 11px;
      cursor: pointer;
    }

    #${cardId} .stx-memory-chat-strategy-pill-wrap,
    .stx-memory-chat-strategy-pill-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-memory-chat-strategy-pill,
    .stx-memory-chat-strategy-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 26px;
      padding: 4px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 32%, transparent);
      color: var(--ss-theme-text, inherit);
      font-size: 11px;
      line-height: 1.1;
      white-space: nowrap;
    }

    #${cardId} .stx-memory-chat-strategy-empty,
    .stx-memory-chat-strategy-empty {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.66;
    }

    .stx-memory-chat-strategy-lock-scroll {
      overflow: hidden;
    }

    .stx-memory-chat-strategy-overlay {
      position: fixed;
      inset: 0;
      z-index: 100000;
      --stx-shared-select-z-index: 1000001;
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 14px;
      width: 100vw;
      height: 100vh;
      min-height: 100dvh;
      background: var(--ss-theme-backdrop, rgba(10, 10, 12, 0.84));
      backdrop-filter: var(--ss-theme-backdrop-filter, blur(12px));
      -webkit-backdrop-filter: var(--ss-theme-backdrop-filter, blur(12px));
      opacity: 0;
      transition: opacity 0.18s ease;
      color: var(--ss-theme-text, #eaeaea);
    }

    .stx-memory-chat-strategy-overlay.is-visible {
      opacity: 1;
    }

    .stx-memory-chat-strategy-editor {
      position: relative;
      width: min(1480px, 100%);
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-radius: 22px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.16)) 92%, transparent);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent) 0%, transparent 34%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-panel-bg, rgba(18, 18, 22, 0.96)) 100%, black 0%), color-mix(in srgb, var(--ss-theme-surface-2, rgba(10, 10, 14, 0.96)) 100%, black 0%));
      box-shadow: var(--ss-theme-panel-shadow, 0 26px 70px rgba(0,0,0,0.7));
      transform: scale(0.985);
      transition: transform 0.18s ease;
    }

    .stx-memory-chat-strategy-overlay.is-visible .stx-memory-chat-strategy-editor {
      transform: scale(1);
    }

    .stx-memory-chat-strategy-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding: 16px 18px;
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 90%, transparent);
      background: linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent) 0%, transparent 100%);
    }

    .stx-memory-chat-strategy-title-wrap {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stx-memory-chat-strategy-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 18px;
      font-weight: 800;
      line-height: 1.2;
    }

    .stx-memory-chat-strategy-subtitle {
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.74;
      max-width: 680px;
    }

    .stx-memory-chat-strategy-header-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .stx-memory-chat-strategy-close {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.18)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent);
      color: inherit;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
    }

    .stx-memory-chat-strategy-close:hover {
      background: color-mix(in srgb, var(--stx-memory-danger) 18%, transparent);
      border-color: color-mix(in srgb, var(--stx-memory-danger) 42%, transparent);
      transform: rotate(90deg);
    }

    .stx-memory-chat-strategy-body {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      overflow: hidden;
    }

    .stx-memory-chat-strategy-sidebar-scrim {
      display: none;
    }

    .stx-memory-chat-strategy-sidebar {
      display: flex;
      flex-direction: column;
      min-width: 0;
      border-right: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.22)) 100%, transparent);
    }

    .stx-memory-chat-strategy-sidebar-head {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 88%, transparent);
    }

    .stx-memory-chat-strategy-sidebar-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-chat-list {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stx-memory-chat-strategy-chat-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid transparent;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
    }

    .stx-memory-chat-strategy-chat-avatar {
      width: 36px;
      height: 36px;
      min-width: 36px;
      min-height: 36px;
      border-radius: 999px;
      overflow: hidden;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.08)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.14)) 88%, transparent);
    }

    .stx-memory-chat-strategy-chat-avatar img {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
      border-radius: 999px;
    }

    .stx-memory-chat-strategy-chat-avatar.is-icon {
      font-size: 15px;
      color: color-mix(in srgb, var(--ss-theme-text, inherit) 82%, transparent);
    }

    .stx-memory-chat-strategy-chat-copy {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stx-memory-chat-strategy-chat-item:hover {
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-list-item-hover-bg, rgba(255,255,255,0.08)) 100%, transparent);
      transform: translateY(-1px);
    }

    .stx-memory-chat-strategy-chat-item.is-active {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 42%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 14%, transparent);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
    }

    .stx-memory-chat-strategy-chat-name {
      width: 100%;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.35;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-chat-key {
      width: 100%;
      font-size: 11px;
      line-height: 1.35;
      opacity: 0.58;
      word-break: break-all;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }

    .stx-memory-chat-strategy-main {
      min-width: 0;
      min-height: 0;
      overflow: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .stx-memory-chat-strategy-hero,
    .stx-memory-chat-strategy-section {
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 90%, transparent);
      border-radius: 16px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 100%, transparent);
      padding: 14px;
    }

    .stx-memory-chat-strategy-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }

    .stx-memory-chat-strategy-hero-main,
    .stx-memory-chat-strategy-hero-side {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-hero-title {
      font-size: 20px;
      line-height: 1.2;
      font-weight: 800;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-hero-meta,
    .stx-memory-chat-strategy-hero-label,
    .stx-memory-chat-strategy-section-head p {
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-hero-intent {
      font-size: 14px;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 78%, white 22%);
    }

    .stx-memory-chat-strategy-section {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .stx-memory-chat-strategy-section-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .stx-memory-chat-strategy-section-head h3 {
      margin: 0;
      font-size: 14px;
      line-height: 1.25;
      font-weight: 800;
    }

    .stx-memory-chat-strategy-section-head p {
      margin: 4px 0 0 0;
    }

    .stx-memory-chat-strategy-advanced {
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      border-radius: 14px;
      padding: 10px 12px;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent);
    }

    .stx-memory-chat-strategy-advanced-summary {
      list-style: none;
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    .stx-memory-chat-strategy-advanced-summary::-webkit-details-marker {
      display: none;
    }

    .stx-memory-chat-strategy-advanced-summary h3 {
      margin: 0;
      font-size: 14px;
      line-height: 1.25;
      font-weight: 800;
    }

    .stx-memory-chat-strategy-advanced-summary p {
      margin: 4px 0 0 0;
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-advanced-body {
      margin-top: 10px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    [data-tip] {
      cursor: help;
      pointer-events: auto;
    }

    .stx-memory-chat-strategy-form-grid,
    .stx-memory-chat-strategy-diagnostic-grid,
    .stx-memory-chat-strategy-quality-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }

    .stx-memory-chat-strategy-diagnostic-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stx-memory-chat-strategy-diagnostic-group {
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent);
      overflow: hidden;
    }

    .stx-memory-chat-strategy-diagnostic-group summary {
      list-style: none;
      cursor: pointer;
      user-select: none;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stx-memory-chat-strategy-diagnostic-group summary::-webkit-details-marker {
      display: none;
    }

    .stx-memory-chat-strategy-diagnostic-group summary span {
      font-size: 13px;
      font-weight: 800;
      line-height: 1.3;
    }

    .stx-memory-chat-strategy-diagnostic-group summary small {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-diagnostic-group .stx-memory-chat-strategy-diagnostic-grid {
      padding: 0 12px 12px 12px;
    }

    .stx-memory-chat-strategy-quality-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stx-memory-chat-strategy-quality-card {
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-quality-card-full-row {
      grid-column: 1 / -1;
    }

    .stx-memory-chat-strategy-quality-card.is-score {
      align-items: flex-start;
      justify-content: center;
    }

    .stx-memory-chat-strategy-lifecycle-grid {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.95fr);
      gap: 10px;
      align-items: stretch;
    }

    .stx-memory-chat-strategy-lifecycle-hero {
      grid-column: 1 / span 2;
      position: relative;
      overflow: hidden;
      gap: 10px;
      padding: 14px;
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent) 0%, transparent 38%),
        linear-gradient(135deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent));
    }

    .stx-memory-chat-strategy-lifecycle-hero::after {
      content: "";
      position: absolute;
      inset: auto -8% -42% auto;
      width: 148px;
      height: 148px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent);
      filter: blur(14px);
      pointer-events: none;
    }

    .stx-memory-chat-strategy-lifecycle-hero[data-stage="new"] {
      border-color: color-mix(in srgb, #79c0ff 35%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-hero[data-stage="active"] {
      border-color: color-mix(in srgb, #6dd19c 35%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-hero[data-stage="stable"] {
      border-color: color-mix(in srgb, #d7c06a 35%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-hero[data-stage="long_running"] {
      border-color: color-mix(in srgb, #f0a35e 38%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-hero[data-stage="archived"],
    .stx-memory-chat-strategy-lifecycle-hero[data-stage="deleted"] {
      border-color: color-mix(in srgb, #b18cff 30%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-hero-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 10px;
      position: relative;
      z-index: 1;
    }

    .stx-memory-chat-strategy-lifecycle-stage-badge {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(12,12,16,0.72)) 86%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.16)) 85%, transparent);
      font-size: 14px;
      margin-bottom: 0;
    }

    .stx-memory-chat-strategy-lifecycle-summary {
      font-size: 15px;
      line-height: 1.42;
      font-weight: 700;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 94%, transparent);
      position: relative;
      z-index: 1;
      max-width: 680px;
    }

    .stx-memory-chat-strategy-lifecycle-explanation {
      font-size: 12px;
      line-height: 1.58;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 84%, transparent);
      position: relative;
      z-index: 1;
    }

    .stx-memory-chat-strategy-lifecycle-reasons {
      position: relative;
      z-index: 1;
      gap: 6px;
    }

    .stx-memory-chat-strategy-lifecycle-pill {
      min-height: 22px;
      padding: 3px 8px;
      font-size: 10px;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(18,18,22,0.72)) 88%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-card {
      min-height: 100%;
      padding: 10px;
      gap: 6px;
    }

    .stx-memory-chat-strategy-lifecycle-timeline {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .stx-memory-chat-strategy-lifecycle-point {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 10px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.09)) 78%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-point-label {
      font-size: 10px;
      line-height: 1.3;
      opacity: 0.68;
    }

    .stx-memory-chat-strategy-lifecycle-point strong {
      font-size: 12px;
      line-height: 1.32;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 94%, transparent);
    }

    .stx-memory-chat-strategy-lifecycle-point small {
      font-size: 10px;
      line-height: 1.42;
      opacity: 0.76;
    }

    .stx-memory-chat-strategy-lifecycle-impact {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stx-memory-chat-strategy-lifecycle-impact-title {
      font-size: 13px;
      line-height: 1.35;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 76%, white 24%);
    }

    .stx-memory-chat-strategy-lifecycle-impact-detail {
      font-size: 11px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 86%, transparent);
    }

    .stx-memory-chat-strategy-quality-label {
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.72;
    }

    .stx-memory-chat-strategy-quality-score-wrap {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }

    .stx-memory-chat-strategy-quality-score {
      font-size: 28px;
      line-height: 1;
      font-weight: 900;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 76%, white 24%);
    }

    .stx-memory-chat-strategy-quality-level {
      font-size: 12px;
      font-weight: 700;
    }

    .stx-memory-chat-strategy-quality-meta {
      font-size: 14px;
      font-weight: 800;
      margin-bottom: 2px;
    }

    .stx-memory-chat-strategy-quality-stats {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 4px;
    }

    .stx-memory-vector-stat {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 100%, transparent);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 60%, transparent);
    }
    
    .stx-memory-vector-stat i {
      opacity: 0.7;
      font-size: 10px;
    }

    .stx-memory-chat-strategy-quality-subtext {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.76;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-group-memory {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-scene-card,
    .stx-memory-chat-strategy-group-lane-card {
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.16)) 100%, transparent));
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-scene-card {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .stx-memory-chat-strategy-group-scene-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-section-title,
    .stx-memory-chat-strategy-group-subtitle {
      font-size: 11px;
      line-height: 1.3;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.64;
    }

    .stx-memory-chat-strategy-group-scene-summary {
      margin-top: 6px;
      font-size: 18px;
      line-height: 1.55;
      font-weight: 600;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
      word-break: break-word;
    }

    .stx-memory-chat-strategy-group-count {
      flex: 0 0 auto;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
      font-weight: 700;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 82%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 76%, transparent);
      white-space: nowrap;
    }

    .stx-memory-chat-strategy-group-scene-body {
      display: grid;
      grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
      gap: 12px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-subsection {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      padding: 12px;
      border-radius: 12px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 80%, transparent);
    }

    .stx-memory-chat-strategy-group-event-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-event-item {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 10px;
      align-items: flex-start;
      min-width: 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(0,0,0,0.14)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 76%, transparent);
    }

    .stx-memory-chat-strategy-group-event-index {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 84%, white 16%);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 14%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 28%, transparent);
    }

    .stx-memory-chat-strategy-group-event-text,
    .stx-memory-chat-strategy-group-lane-time,
    .stx-memory-chat-strategy-group-lane-footer,
    .stx-memory-chat-strategy-group-footnote {
      font-size: 12px;
      line-height: 1.6;
      opacity: 0.82;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-group-lane-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-lane-card {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stx-memory-chat-strategy-group-lane-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-group-lane-copy {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
    }

    .stx-memory-chat-strategy-group-lane-name {
      font-size: 14px;
      line-height: 1.35;
      font-weight: 800;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-group-salience {
      flex: 0 0 auto;
      white-space: nowrap;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
    }

    .stx-memory-chat-strategy-group-lane-tags .stx-memory-chat-strategy-pill {
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.45;
      align-items: flex-start;
    }

    .stx-memory-chat-strategy-group-footnote {
      opacity: 0.68;
      padding: 0 4px;
    }

    .stx-memory-chat-strategy-quality-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stx-memory-chat-strategy-quality-dimensions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 12px;
    }

    .stx-memory-chat-strategy-dimension-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .stx-memory-chat-strategy-quality-advice-item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      border-radius: 8px;
      padding: 6px 8px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.18)) 76%, transparent);
      flex-direction: column;
    }

    .stx-memory-chat-strategy-dimension-label,
    .stx-memory-chat-strategy-quality-advice-item span {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.9;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-maintenance-action {
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 46%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent);
      color: var(--ss-theme-text, inherit);
      border-radius: 8px;
      padding: 5px 10px;
      font-size: 12px;
      line-height: 1.2;
      cursor: pointer;
    }

    .stx-memory-chat-strategy-maintenance-action:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .stx-memory-chat-strategy-dimension-value,
    .stx-memory-chat-strategy-quality-advice-item strong {
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    .stx-memory-chat-strategy-progress {
      flex: 1;
      height: 4px;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.4)) 100%, transparent);
      border-radius: 999px;
      overflow: hidden;
      margin: 0 8px;
    }

    .stx-memory-chat-strategy-progress-bar {
      height: 100%;
      background: linear-gradient(90deg, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 60%, transparent), var(--ss-theme-accent, #c5a059));
      box-shadow: 0 0 8px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 40%, transparent);
      border-radius: 999px;
      transition: width 0.6s cubic-bezier(0.22, 1, 0.36, 1);
    }

    .stx-memory-chat-strategy-toggle-wrap {
      display: flex;
      align-items: stretch;
      justify-content: flex-start;
      gap: 10px;
    }

    .stx-memory-chat-strategy-toggle {
      width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 90%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
    }

    .stx-memory-chat-strategy-json-card {
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      overflow: hidden;
    }

    .stx-memory-chat-strategy-json-card summary {
      list-style: none;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px;
    }

    .stx-memory-chat-strategy-json-card summary::-webkit-details-marker {
      display: none;
    }

    .stx-memory-chat-strategy-json-card summary span {
      font-size: 13px;
      font-weight: 700;
    }

    .stx-memory-chat-strategy-json-card summary small {
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.68;
    }

    .stx-memory-chat-strategy-pretty-body {
      margin: 0;
      padding: 0 12px 12px 12px;
      max-height: 280px;
      overflow: auto;
      font-size: 11px;
      line-height: 1.5;
      color: var(--ss-theme-text, inherit);
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 90%, transparent) transparent;
    }

    .stx-memory-chat-strategy-pretty-body::-webkit-scrollbar {
      width: 4px;
    }
    .stx-memory-chat-strategy-pretty-body::-webkit-scrollbar-track {
      background: transparent;
    }
    .stx-memory-chat-strategy-pretty-body::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.2)) 90%, transparent);
      border-radius: 4px;
    }

    .stx-memory-diag-object {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stx-memory-diag-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
    }

    .stx-memory-diag-key {
      color: var(--stx-memory-info, #7ca5f5);
      font-weight: 600;
      min-width: 80px;
      max-width: 120px;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: help;
    }

    .stx-memory-diag-value {
      flex: 1;
      min-width: 0;
      color: color-mix(in srgb, var(--stx-memory-code-text, #a3c2cf) 90%, transparent);
    }

    .stx-memory-diag-array {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stx-memory-diag-array-item {
      display: flex;
      align-items: center;
    }

    .stx-memory-diag-array-item::before {
      content: "•";
      color: var(--ss-theme-accent, #c5a059);
      margin-right: 6px;
      font-weight: 900;
    }

    .stx-memory-diag-val.is-str {
      color: var(--stx-memory-success, #65d38f);
    }

    .stx-memory-diag-val.is-num {
      color: var(--stx-memory-warning, #ffbf66);
    }

    .stx-memory-diag-val.is-bool {
      color: var(--stx-memory-danger, #ff6b6b);
      font-weight: 700;
    }

    .stx-memory-diag-val.is-empty,
    .stx-memory-diag-val.is-null {
      opacity: 0.5;
      font-style: italic;
    }

    .stx-memory-chat-strategy-input {
      height: 32px;
      width: 100%;
      min-width: 0;
    }

    .stx-memory-chat-strategy-select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    .stx-memory-chat-strategy-search {
      width: 100%;
    }

    .stx-memory-chat-strategy-dashboard-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 14%, transparent) 0%, transparent 38%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.05)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.2)) 100%, transparent));
      min-width: 0;
    }

    .stx-memory-chat-strategy-dashboard-copy,
    .stx-memory-chat-strategy-dashboard-intent,
    .stx-memory-chat-strategy-dashboard-foot-copy,
    .stx-memory-chat-strategy-hero-pills,
    .stx-memory-chat-strategy-control-stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-dashboard-title {
      font-size: 16px;
      line-height: 1.2;
      font-weight: 900;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 98%, transparent);
      word-break: break-word;
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;
    }

    .stx-memory-chat-strategy-dashboard-meta,
    .stx-memory-chat-strategy-dashboard-card-detail,
    .stx-memory-chat-strategy-dashboard-card-foot {
      font-size: 11px;
      line-height: 1.45;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 82%, transparent);
      word-break: break-word;
    }

    .stx-memory-chat-strategy-dashboard-meta {
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .stx-memory-chat-strategy-dashboard-intent {
      flex: 0 0 min(220px, 100%);
      padding: 8px 10px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.14)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-panel-bg, rgba(18,18,22,0.44)) 100%, transparent);
    }

    .stx-memory-chat-strategy-dashboard-intent-value {
      font-size: 13px;
      line-height: 1.3;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 80%, white 20%);
      word-break: break-word;
    }

    .stx-memory-chat-strategy-dashboard-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-dashboard-grid-editor {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .stx-memory-chat-strategy-dashboard-card {
      min-width: 0;
      border-radius: 14px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.16)) 100%, transparent));
      box-shadow: inset 0 1px 0 color-mix(in srgb, white 4%, transparent);
      overflow: hidden;
    }

    .stx-memory-chat-strategy-dashboard-card[data-tone="warning"] {
      border-color: color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 34%, transparent);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--stx-memory-warning, #ffbf66) 12%, transparent) 0%, transparent 45%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.16)) 100%, transparent));
    }

    .stx-memory-chat-strategy-dashboard-card[data-tone="soft"] {
      border-color: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.18)) 88%, transparent);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 8%, transparent) 0%, transparent 45%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.05)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-2, rgba(0,0,0,0.14)) 100%, transparent));
    }

    .stx-memory-chat-strategy-dashboard-card[data-tone="accent"] {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 26%, transparent);
    }

    .stx-memory-chat-strategy-dashboard-card-inner {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 12px;
      height: 100%;
    }

    .stx-memory-chat-strategy-dashboard-card-label {
      font-size: 10px;
      line-height: 1.3;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.66;
    }

    .stx-memory-chat-strategy-dashboard-card-title {
      font-size: 13px;
      line-height: 1.3;
      font-weight: 800;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 96%, transparent);
      word-break: break-word;
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .stx-memory-chat-strategy-dashboard-card-foot {
      padding-top: 5px;
      border-top: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.08)) 70%, transparent);
      opacity: 0.8;
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .stx-memory-chat-strategy-dashboard-foot {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .stx-memory-chat-strategy-dashboard-foot .stx-memory-chat-strategy-pill-wrap {
      gap: 6px;
    }

    .stx-memory-chat-strategy-dashboard-foot .stx-memory-chat-strategy-summary-maintenance-action {
      padding: 5px 10px;
      font-size: 11px;
      white-space: nowrap;
    }

    .stx-memory-chat-strategy-chat-key {
      width: 100%;
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.62;
      word-break: break-word;
      font-family: inherit;
    }

    .stx-memory-chat-strategy-quick-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-quick-card {
      min-width: 0;
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 88%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.04)) 100%, transparent);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .stx-memory-chat-strategy-quick-card-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-quick-card-head h4 {
      margin: 0;
      font-size: 14px;
      line-height: 1.3;
      font-weight: 800;
    }

    .stx-memory-chat-strategy-quick-card-head p {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.72;
      word-break: break-word;
    }

    .stx-memory-chat-strategy-control-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-chat-strategy-quick-card .stx-memory-chat-strategy-toggle,
    .stx-memory-chat-strategy-quick-card .stx-memory-chat-strategy-field {
      min-width: 0;
    }

    @media (max-width: 960px) {
      #${cardId} .stx-ui-mode-bar {
        align-items: stretch;
      }

      #${cardId} .stx-ui-mode-switch {
        width: fit-content;
        flex-wrap: wrap;
      }

      #${cardId} .stx-ui-advanced-head {
        align-items: stretch;
      }

      #${cardId} .stx-ui-advanced-head-search {
        flex-basis: 100%;
        min-width: 100%;
      }

      #${cardId} .stx-ui-badge-grid,
      #${cardId} .stx-ui-experience-grid {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-memory-list.is-overview-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${cardId} .stx-ui-summary-callout-head,
      #${cardId} .stx-ui-memory-entry-head {
        flex-direction: column;
        align-items: flex-start;
      }

      #${cardId} .stx-ui-summary-line {
        grid-template-columns: 16px minmax(0, 1fr);
      }

      #${cardId} .stx-ui-summary-tile-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${cardId} .stx-ui-summary-line-label {
        white-space: normal;
      }

      #${cardId} .stx-ui-summary-line-value {
        grid-column: 2;
      }

      #${cardId} .stx-memory-chat-strategy-summary-grid {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-header {
        padding: 14px;
      }

      .stx-memory-chat-strategy-body {
        grid-template-columns: 1fr;
        position: relative;
      }

      .stx-memory-chat-strategy-sidebar {
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: min(88vw, 320px);
        z-index: 2;
        transform: translateX(-100%);
        transition: transform 0.2s ease;
        box-shadow: 18px 0 40px rgba(0,0,0,0.36);
        z-index: 4;
      }

      .stx-memory-chat-strategy-overlay.is-sidebar-open .stx-memory-chat-strategy-sidebar {
        transform: translateX(0);
      }

      .stx-memory-chat-strategy-sidebar-scrim {
        display: block;
        position: absolute;
        inset: 0;
        background: rgba(5, 10, 18, 0.28);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        z-index: 3;
      }

      .stx-memory-chat-strategy-overlay.is-sidebar-open .stx-memory-chat-strategy-sidebar-scrim {
        opacity: 1;
        pointer-events: auto;
      }

      .stx-memory-chat-strategy-main {
        padding: 14px;
        min-height: 0;
      }

      .stx-memory-chat-strategy-form-grid,
      .stx-memory-chat-strategy-diagnostic-grid,
      .stx-memory-chat-strategy-quality-grid {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-group-scene-body {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-top-inline-grid {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-dashboard-hero,
      .stx-memory-chat-strategy-dashboard-foot {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .stx-memory-chat-strategy-card-toolbar {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-memory-chat-strategy-card-toolbar .stx-memory-chat-strategy-card-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .stx-memory-chat-strategy-dashboard-grid,
      .stx-memory-chat-strategy-dashboard-grid-editor,
      .stx-memory-chat-strategy-quick-grid,
      .stx-memory-chat-strategy-control-grid {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-lifecycle-grid {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-lifecycle-hero {
        grid-column: 1 / -1;
      }

      .stx-memory-chat-strategy-lifecycle-timeline {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-lifecycle-hero {
        padding: 14px;
      }

      .stx-memory-chat-strategy-lifecycle-summary {
        font-size: 15px;
      }

      .stx-memory-chat-strategy-group-lane-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      #${cardId} .stx-ui-mode-bar,
      #${cardId} .stx-ui-experience-card,
      #${cardId} .stx-ui-summary-callout {
        padding: 12px;
      }

      #${cardId} .stx-ui-mode-copy {
        width: 100%;
      }

      #${cardId} .stx-ui-mode-switch {
        width: 100%;
      }

      #${cardId} .stx-ui-mode-chip {
        flex: 1 1 0;
        justify-content: center;
      }

      #${cardId} .stx-ui-summary-tile-grid {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-memory-entry.is-overview-tile {
        min-height: 0;
      }

      #${cardId} .stx-ui-memory-list.is-overview-grid {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-refresh-btn {
        width: 100%;
      }

      #${cardId} .stx-ui-tabs,
      #${cardId} .stx-ui-tabs-secondary {
        overflow-x: auto;
        scrollbar-width: none;
      }

      #${cardId} .stx-ui-tabs::-webkit-scrollbar,
      #${cardId} .stx-ui-tabs-secondary::-webkit-scrollbar {
        display: none;
      }

      #${cardId} .stx-ui-tab {
        min-width: max-content;
        flex: 0 0 auto;
      }

      #${cardId} .stx-ui-badge-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${cardId} .stx-ui-form-grid,
      #${cardId} .stx-ui-explanation-groups {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-template-activate-row {
        align-items: stretch;
      }

      #${cardId} .stx-ui-template-select-wrap,
      #${cardId} .stx-ui-template-lock,
      #${cardId} .stx-ui-template-apply-btn {
        width: 100%;
      }

      .stx-memory-chat-strategy-overlay {
        padding: 0;
        width: 100vw;
        height: 100dvh;
        min-height: 100dvh;
      }

      .stx-memory-chat-strategy-editor {
        width: 100vw;
        height: 100dvh;
        min-height: 100dvh;
        border-radius: 0;
        border-left: 0;
        border-right: 0;
        border-bottom: 0;
      }

      .stx-memory-chat-strategy-header {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 12px;
      }

      .stx-memory-chat-strategy-title-wrap {
        width: 100%;
        max-width: 100%;
      }

      .stx-memory-chat-strategy-title {
        width: 100%;
        font-size: 16px;
        line-height: 1.25;
        word-break: break-word;
      }

      .stx-memory-chat-strategy-title i {
        flex: 0 0 auto;
      }

      .stx-memory-chat-strategy-subtitle {
        max-width: 100%;
        font-size: 11px;
        line-height: 1.45;
        word-break: break-word;
      }

      .stx-memory-chat-strategy-header-actions {
        width: 100%;
        justify-content: flex-start;
        align-items: center;
        gap: 6px;
        flex-wrap: nowrap;
        overflow-x: auto;
        overflow-y: hidden;
        padding-bottom: 2px;
        -webkit-overflow-scrolling: touch;
        scrollbar-width: none;
      }

      .stx-memory-chat-strategy-header-actions::-webkit-scrollbar {
        display: none;
      }

      .stx-memory-chat-strategy-header-actions > * {
        flex: 0 0 auto;
      }

      .stx-memory-chat-strategy-header-actions .stx-shared-button {
        min-height: 34px;
        padding: 5px 10px;
        font-size: 11px;
        white-space: nowrap;
      }

      .stx-memory-chat-strategy-close {
        width: 34px;
        height: 34px;
        margin-left: 2px;
        flex: 0 0 34px;
      }

      .stx-memory-chat-strategy-hero {
        flex-direction: column;
      }

      .stx-memory-chat-strategy-preset-actions {
        grid-template-columns: 1fr;
      }

      .stx-memory-chat-strategy-dashboard-card-inner,
      .stx-memory-chat-strategy-quick-card {
        padding: 12px;
      }
    }
  `;
}
