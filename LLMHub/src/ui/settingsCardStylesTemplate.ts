import { buildThemeVars } from "../../../SDK/theme";

/**
 * 功能：构建 LLMHub 设置面板样式。
 * 参数：
 *   cardId：面板容器 ID。
 * 返回：
 *   string：可注入 style 标签的 CSS 文本。
 */
export function buildSettingsCardStylesTemplate(cardId: string): string {
    return `
    ${buildThemeVars(`#${cardId} .stx-ui-content`)}

    #${cardId} {
      margin-bottom: 5px;
      color: inherit;
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
      transition: background-color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-tab.is-active {
      opacity: 1;
      color: var(--ss-theme-text, inherit);
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.58));
    }

    #${cardId} .stx-ui-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #${cardId} .stx-ui-panel[hidden] {
      display: none !important;
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
        rgba(255, 255, 255, 0),
        rgba(255, 255, 255, 0.2) 18%,
        rgba(255, 255, 255, 0.26) 50%,
        rgba(255, 255, 255, 0.2) 82%,
        rgba(255, 255, 255, 0)
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
      transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-item-stack {
      flex-direction: column;
      align-items: stretch;
    }

    #${cardId} .stx-ui-item-main {
      min-width: 0;
      flex: 1;
    }

    #${cardId} .stx-ui-item-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 3px;
    }

    #${cardId} .stx-ui-item-desc {
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.75;
    }

    #${cardId} .stx-ui-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    #${cardId} .stx-ui-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }

    #${cardId} .stx-ui-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .stx-ui-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 8px;
      width: 100%;
    }

    #${cardId} .stx-ui-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .stx-ui-field-label {
      font-size: 12px;
      opacity: 0.85;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-textarea {
      background: rgba(0, 0, 0, 0.28);
      color: inherit;
      border: 1px solid rgba(197, 160, 89, 0.36);
      border-radius: 8px;
      box-sizing: border-box;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input {
      padding: 4px 8px;
      min-height: 30px;
    }

    #${cardId} .stx-ui-input-full {
      width: 100%;
      min-width: 0;
    }

    #${cardId} .stx-ui-select {
      min-width: 182px;
      max-width: 100%;
      appearance: none;
      -webkit-appearance: none;
      -moz-appearance: none;
      padding-right: 32px;
      background-image:
        linear-gradient(45deg, transparent 50%, rgba(255, 255, 255, 0.75) 50%),
        linear-gradient(135deg, rgba(255, 255, 255, 0.75) 50%, transparent 50%),
        linear-gradient(to right, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.05));
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

    #${cardId} .stx-ui-btn {
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 7px;
      border: 1px solid rgba(197, 160, 89, 0.45);
      background: rgba(197, 160, 89, 0.14);
      color: inherit;
      font-size: 12px;
      transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-btn.secondary {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }

    #${cardId} .stx-ui-btn-danger {
      color: #ff8787;
      border-color: rgba(255, 135, 135, 0.3);
    }

    #${cardId} .stx-ui-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    #${cardId} .stx-ui-list-empty {
      font-size: 12px;
      opacity: 0.72;
      padding: 4px 0;
    }

    #${cardId} .stx-ui-list-item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      padding: 8px 10px;
      border: 1px dashed rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.12);
    }

    #${cardId} .stx-ui-list-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 2px;
    }

    #${cardId} .stx-ui-list-meta {
      font-size: 12px;
      opacity: 0.78;
      line-height: 1.4;
      word-break: break-all;
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
      border-bottom: 1px dashed rgba(255, 255, 255, 0.22);
    }

    #${cardId} .stx-ui-changelog {
      width: 100%;
      max-height: 150px;
      overflow-y: auto;
      margin-top: 8px;
      padding: 8px 10px;
      font-size: 12px;
      line-height: 1.5;
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      box-sizing: border-box;
    }

    #${cardId} .stx-ui-changelog::-webkit-scrollbar {
      width: 4px;
    }

    #${cardId} .stx-ui-changelog::-webkit-scrollbar-thumb {
      background: rgba(197, 160, 89, 0.5);
      border-radius: 10px;
    }

    #${cardId} input[type="checkbox"] {
      accent-color: rgba(197, 160, 89, 0.92);
      transition: filter 0.2s ease;
    }

    #${cardId} .vault-key-input {
      font-family: monospace;
      letter-spacing: 1px;
    }

    #${cardId} .stx-ui-tab:hover {
      opacity: 1;
      background: rgba(197, 160, 89, 0.2);
      box-shadow: 0 0 12px rgba(197, 160, 89, 0.2);
    }

    #${cardId} .stx-ui-item:hover {
      border-color: rgba(197, 160, 89, 0.48);
      background: rgba(0, 0, 0, 0.24);
      box-shadow:
        0 0 0 1px rgba(197, 160, 89, 0.2),
        0 0 16px rgba(197, 160, 89, 0.16);
    }

    #${cardId} .stx-ui-select:hover,
    #${cardId} .stx-ui-input:hover,
    #${cardId} .stx-ui-search:hover {
      border-color: rgba(197, 160, 89, 0.58);
      background-color: rgba(0, 0, 0, 0.34);
      box-shadow: 0 0 0 1px rgba(197, 160, 89, 0.18);
    }

    #${cardId} .stx-ui-btn:hover {
      border-color: rgba(197, 160, 89, 0.68);
      background: rgba(197, 160, 89, 0.24);
      box-shadow:
        inset 0 0 0 1px rgba(197, 160, 89, 0.26),
        0 0 14px rgba(197, 160, 89, 0.2);
    }

    #${cardId} .stx-ui-select:focus,
    #${cardId} .stx-ui-input:focus,
    #${cardId} .stx-ui-search:focus {
      outline: none;
      border-color: rgba(197, 160, 89, 0.72);
      box-shadow: 0 0 0 2px rgba(197, 160, 89, 0.22);
    }

    #${cardId} .stx-ui-shell {
      border-color: transparent;
      background: transparent;
      backdrop-filter: none;
      box-shadow: none;
    }

    #${cardId} .stx-ui-content {
      border-top-color: var(--ss-theme-border, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-tabs {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.16));
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
    }

    #${cardId} .stx-ui-tab.is-active {
      color: var(--ss-theme-text, inherit);
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.58));
    }

    #${cardId} .stx-ui-item {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.16));
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-textarea {
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.28));
      border-color: var(--ss-theme-border, rgba(197, 160, 89, 0.36));
    }

    #${cardId} .stx-ui-btn {
      border-color: var(--ss-theme-border, rgba(197, 160, 89, 0.45));
      background: var(--ss-theme-surface-3, rgba(197, 160, 89, 0.14));
    }

    #${cardId} .stx-ui-btn.secondary {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      background: var(--ss-theme-surface-2, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-list-item {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.12));
    }

    #${cardId} .stx-ui-about-meta a {
      border-bottom-color: var(--ss-theme-border, rgba(255, 255, 255, 0.22));
    }

    #${cardId} .stx-ui-changelog {
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.1));
    }

    #${cardId} .stx-ui-changelog::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 48%, transparent);
    }

    #${cardId} input[type="checkbox"] {
      accent-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 92%, white 8%);
    }

    #${cardId} .stx-ui-tab:hover {
      background: var(--ss-theme-list-item-hover-bg, rgba(197, 160, 89, 0.2));
      box-shadow: 0 0 12px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
    }

    #${cardId} .stx-ui-item:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.48));
      background: var(--ss-theme-list-item-hover-bg, rgba(0, 0, 0, 0.24));
    }

    #${cardId} .stx-ui-select:hover,
    #${cardId} .stx-ui-input:hover,
    #${cardId} .stx-ui-search:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.58));
      background-color: var(--ss-theme-surface-3, rgba(0, 0, 0, 0.34));
      box-shadow: 0 0 0 1px var(--ss-theme-focus-ring, rgba(197, 160, 89, 0.18));
    }

    #${cardId} .stx-ui-btn:hover {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.68));
      background: var(--ss-theme-list-item-hover-bg, rgba(197, 160, 89, 0.24));
    }

    #${cardId} .stx-ui-select:focus,
    #${cardId} .stx-ui-input:focus,
    #${cardId} .stx-ui-search:focus {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.72));
      box-shadow: 0 0 0 2px var(--ss-theme-focus-ring, rgba(197, 160, 89, 0.22));
    }
  `;
}
