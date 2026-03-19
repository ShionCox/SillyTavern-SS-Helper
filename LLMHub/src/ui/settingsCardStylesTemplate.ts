import { buildSharedCheckboxStyles } from "../../../_Components/sharedCheckbox";
import { buildSharedSelectStyles } from "../../../_Components/sharedSelect";
import { buildSharedButtonStyles } from "../../../_Components/sharedButton";
import { buildSharedInputStyles } from "../../../_Components/sharedInput";
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
    ${buildSharedCheckboxStyles(`#${cardId}`)}
    ${buildSharedSelectStyles(`#${cardId}`)}
    ${buildSharedButtonStyles(`#${cardId}`)}
    ${buildSharedInputStyles(`#${cardId}`)}

    #${cardId} {
      margin-bottom: 5px;
      color: inherit;
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
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      overflow-x: hidden;
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
      flex-wrap: wrap;
      justify-content: flex-start;
      padding: 4px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.16));
      border-radius: 999px;
      margin-bottom: 10px;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
    }

    #${cardId} .stx-ui-tab {
      flex: 1 1 0;
      min-width: max-content;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: inherit;
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
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
      min-width: 0;
      max-width: 100%;
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
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-item-stack {
      flex-direction: column;
      align-items: stretch;
    }

    #${cardId} .stx-ui-item-main {
      min-width: 0;
      flex: 1;
      width: 100%;
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
      white-space: normal;
      word-break: break-word;
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
      margin-top: 6px;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
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
      white-space: normal;
      line-height: 1.35;
      word-break: break-word;
    }

    #${cardId} .stx-ui-resource-cap-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    #${cardId} .stx-ui-param-toolbar {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }

    #${cardId} .stx-ui-param-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
    }

    #${cardId} .stx-ui-param-row {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1.6fr) auto;
      gap: 6px;
      align-items: stretch;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .stx-ui-param-row > * {
      min-width: 0;
    }

    #${cardId} .stx-ui-param-row .stx-ui-input {
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 30px;
    }

    #${cardId} .stx-ui-param-row .stx-ui-param-remove,
    #${cardId} .stx-ui-param-row .stx-ui-btn {
      align-self: stretch;
      min-height: 30px;
    }

    #${cardId} .stx-ui-param-empty {
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      opacity: 0.72;
      background: rgba(255, 255, 255, 0.04);
      border: 1px dashed rgba(255, 255, 255, 0.12);
    }

    #${cardId} .stx-ui-param-remove {
      white-space: nowrap;
      justify-self: stretch;
    }

    #${cardId} .stx-ui-rerank-test-panel {
      padding: 10px;
      border-radius: 10px;
      border: 1px solid rgba(197, 160, 89, 0.18);
      background: rgba(197, 160, 89, 0.05);
    }


    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-search,
    #${cardId} .stx-ui-textarea {
      background: var(--ss-theme-surface-2, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.28)));
      color: inherit;
      border: 1px solid rgba(197, 160, 89, 0.36);
      border-radius: 8px;
      box-sizing: border-box;
      max-width: 100%;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

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

    @media (max-width: 900px) {
      #${cardId} .stx-ui-param-row {
        grid-template-columns: 1fr;
      }
    }

    #${cardId} .stx-ui-btn-danger {
      color: #ff8787;
      border-color: rgba(255, 135, 135, 0.3);
    }

    #${cardId} .stx-ui-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: start;
      gap: 8px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-list-empty {
      font-size: 12px;
      opacity: 0.72;
      padding: 4px 0;
    }

    #${cardId} .stx-ui-list-item {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.15));
      border-radius: 10px;
      box-sizing: border-box;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.2));
      cursor: pointer;
      text-align: left;
      color: inherit;
      transition: all 0.2s ease;
    }

    #${cardId} .stx-ui-list-main {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
    }

    #${cardId} .stx-ui-list-side {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex: 0 0 auto;
      margin-left: auto;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-list-item:hover {
      background: var(--ss-theme-surface-hover, rgba(255, 255, 255, 0.05));
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 40%, transparent);
      transform: translateY(-1px);
    }

    #${cardId} .stx-ui-list-item.is-active,
    #${cardId} .stx-ui-list-item.is-context-open {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 15%, transparent);
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 60%, transparent);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }

    #${cardId} .stx-ui-list-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--ss-theme-text, #fff) 8%, transparent);
      font-size: 16px;
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 90%, transparent);
      flex-shrink: 0;
    }

    #${cardId} .stx-ui-list-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    #${cardId} .stx-ui-list-tag {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      margin-left: 8px;
      font-weight: 500;
      vertical-align: middle;
      display: inline-block;
    }

    #${cardId} .stx-ui-list-tag.generation { color: #8ce99a; background: rgba(140, 233, 154, 0.15); }
    #${cardId} .stx-ui-list-tag.embedding { color: #74c0fc; background: rgba(116, 192, 252, 0.15); }
    #${cardId} .stx-ui-list-tag.rerank { color: #ffa8a8; background: rgba(255, 168, 168, 0.15); }

    #${cardId} .stx-ui-list-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 72px;
    }

    #${cardId} .stx-ui-list-toggle-copy {
      display: none;
    }

    #${cardId} .stx-ui-list-toggle .stx-shared-checkbox-body {
      width: auto;
    }

    #${cardId} .stx-ui-list-toggle-control {
      min-width: 64px;
      justify-content: center;
    }

    #${cardId} .stx-ui-list-title {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.2;
      word-break: break-word;
    }

    #${cardId} .stx-ui-list-meta {
      font-size: 12px;
      opacity: 0.65;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${cardId} .stx-ui-advanced {
      padding: 0;
      overflow: hidden;
      gap: 0;
    }

    #${cardId} .stx-ui-advanced-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 8px;
      border: 0;
      color: inherit;
      cursor: pointer;
      text-align: left;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .stx-ui-advanced-toggle .fa-chevron-down {
      margin-left: auto;
      transition: transform 0.2s ease;
    }

    #${cardId} .stx-ui-advanced-toggle[aria-expanded="true"] .fa-chevron-down {
      transform: rotate(180deg);
    }

    #${cardId} .stx-ui-advanced-title {
      font-size: 14px;
      font-weight: 700;
    }

    #${cardId} .stx-ui-advanced-subtitle {
      font-size: 12px;
      opacity: 0.72;
    }

    #${cardId} .stx-ui-advanced-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(0, 0, 0, 0.14);
    }

    #${cardId} .stx-ui-consumer-map-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      width: 100%;
      max-width: 100%;
      overflow: hidden;
    }

    #${cardId} .stx-ui-consumer-map-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      flex-wrap: wrap;
      width: 100%;
    }

    #${cardId} .stx-ui-consumer-map-head-main {
      flex: 1 1 260px;
      min-width: 0;
    }

    #${cardId} .stx-ui-consumer-map-form {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-consumer-map-form > * {
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-consumer-map-form .stx-shared-select,
    #${cardId} .stx-ui-consumer-map-form .stx-shared-select-trigger,
    #${cardId} .stx-ui-consumer-map-form .stx-ui-input {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-consumer-map-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    #${cardId} .stx-ui-consumer-map-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      opacity: 0.88;
    }

    #${cardId} .stx-ui-consumer-map-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #58d36a;
      box-shadow: 0 0 0 3px rgba(88, 211, 106, 0.22);
      flex-shrink: 0;
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
      background-color: var(--ss-theme-surface-3, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.34)));
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
    #${cardId} .stx-ui-search,
    #${cardId} .stx-ui-textarea {
      background: var(--ss-theme-surface-2, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.28)));
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

    /* ─── Sub-tabs (3-view route) ─── */

    #${cardId} .stx-ui-sub-tabs {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-wrap: wrap;
      padding: 3px;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      margin-bottom: 8px;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.15));
    }

    #${cardId} .stx-ui-sub-tab {
      flex: 1 1 140px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      padding: 5px 8px;
      font-size: 11px;
      line-height: 1.2;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      opacity: 0.65;
      transition: background-color 0.2s ease, opacity 0.2s ease;
    }

    #${cardId} .stx-ui-sub-tab.is-active {
      opacity: 1;
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.45));
    }

    #${cardId} .stx-ui-sub-tab:hover {
      opacity: 1;
      background: rgba(197, 160, 89, 0.18);
    }

    #${cardId} .stx-ui-sub-panel[hidden] {
      display: none !important;
    }

    /* ─── Queue & state badges ─── */

    #${cardId} .stx-ui-state-badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.02em;
      flex-shrink: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-state-badge.is-running {
      background: rgba(88, 211, 106, 0.22);
      color: #58d36a;
    }

    #${cardId} .stx-ui-state-badge.is-queued {
      background: rgba(197, 160, 89, 0.22);
      color: #c5a059;
    }

    #${cardId} .stx-ui-state-badge.is-completed {
      background: rgba(130, 170, 255, 0.18);
      color: #82aaff;
    }

    #${cardId} .stx-ui-state-badge.is-failed {
      background: rgba(255, 135, 135, 0.18);
      color: #ff8787;
    }

    #${cardId} .stx-ui-state-badge.is-cancelled {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.6);
    }

    #${cardId} .stx-ui-history-item {
      align-items: stretch;
      flex-direction: column;
      gap: 10px;
    }

    #${cardId} .stx-ui-history-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
    }

    #${cardId} .stx-ui-history-main {
      min-width: 0;
      flex: 1 1 auto;
    }

    #${cardId} .stx-ui-history-details {
      width: 100%;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      background: rgba(0, 0, 0, 0.16);
      overflow: hidden;
    }

    #${cardId} .stx-ui-history-details > summary {
      cursor: pointer;
      list-style: none;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 600;
      color: inherit;
      display: flex;
      align-items: center;
      gap: 8px;
      user-select: none;
    }

    #${cardId} .stx-ui-history-details > summary::-webkit-details-marker {
      display: none;
    }

    #${cardId} .stx-ui-history-details > summary::before {
      content: '▸';
      opacity: 0.8;
      transition: transform 0.2s ease;
    }

    #${cardId} .stx-ui-history-details[open] > summary::before {
      transform: rotate(90deg);
    }

    #${cardId} .stx-ui-history-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 0 10px 10px;
    }

    #${cardId} .stx-ui-history-section {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    #${cardId} .stx-ui-history-label {
      font-size: 11px;
      font-weight: 700;
      opacity: 0.72;
      letter-spacing: 0.02em;
    }

    #${cardId} .stx-ui-history-pre {
      margin: 0;
      padding: 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 11px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 260px;
      overflow: auto;
    }

    #${cardId} .stx-ui-history-error {
      color: #ffb4b4;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #${cardId} .stx-ui-log-modal {
      border: 0;
      padding: 0;
      background: transparent;
      max-width: min(1240px, 96vw);
      width: min(1240px, 96vw);
    }

    #${cardId} .stx-ui-log-modal::backdrop {
      background: rgba(0, 0, 0, 0.56);
      backdrop-filter: blur(2px);
    }

    #${cardId} .stx-ui-log-modal:not([open]) {
      display: none;
    }

    #${cardId} .stx-ui-log-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.38);
    }

    #${cardId} .stx-ui-log-modal-panel {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      min-width: 0;
      height: min(82vh, 860px);
      min-height: min(82vh, 860px);
      max-height: min(82vh, 860px);
      border-radius: 14px;
      overflow: hidden;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.14));
      background: var(--ss-theme-surface-1, rgba(0, 0, 0, 0.42));
      box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    }

    #${cardId} .stx-ui-log-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      min-width: 0;
      padding: 12px 14px;
      border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.1));
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.36)) 82%, transparent);
    }

    #${cardId} .stx-ui-log-modal-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      font-size: 14px;
      font-weight: 700;
    }

    #${cardId} .stx-ui-log-modal-body {
      flex: 1 1 auto;
      display: flex;
      min-height: 0;
      min-width: 0;
    }

    #${cardId} .stx-ui-log-layout {
      flex: 1 1 auto;
      height: auto;
      display: grid;
      grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
      min-width: 0;
      min-height: 0;
    }

    #${cardId} .stx-ui-log-sidebar {
      min-width: 0;
      border-right: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.1));
      display: flex;
      flex-direction: column;
      min-height: 0;
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(0, 0, 0, 0.3)) 88%, transparent);
    }

    #${cardId} .stx-ui-log-toolbar {
      padding: 10px;
      display: grid;
      gap: 8px;
      min-width: 0;
      border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-log-toolbar .stx-ui-input,
    #${cardId} .stx-ui-log-toolbar .stx-ui-select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-log-filter-row {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      min-width: 0;
    }

    #${cardId} .stx-ui-log-meta {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 10px;
      font-size: 11px;
      opacity: 0.8;
      min-width: 0;
      border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-log-chatkey,
    #${cardId} .stx-ui-log-count {
      min-width: 0;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-all;
    }

    #${cardId} .stx-ui-log-list {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow: auto;
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #${cardId} .stx-ui-log-list-item {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.12));
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(0, 0, 0, 0.15);
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      text-align: left;
      color: inherit;
    }

    #${cardId} .stx-ui-log-list-item.is-active {
      border-color: var(--ss-theme-border-strong, rgba(197, 160, 89, 0.72));
      background: var(--ss-theme-list-item-active-bg, rgba(197, 160, 89, 0.24));
    }

    #${cardId} .stx-ui-log-list-head,
    #${cardId} .stx-ui-log-list-meta,
    #${cardId} .stx-ui-log-list-subtitle,
    #${cardId} .stx-ui-log-list-timeline {
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-log-list-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
    }

    #${cardId} .stx-ui-log-list-title {
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
      min-width: 0;
      flex: 1 1 auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    #${cardId} .stx-ui-log-list-meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      opacity: 0.82;
      flex-wrap: wrap;
    }

    #${cardId} .stx-ui-log-list-subtitle {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.68;
      overflow-wrap: anywhere;
      word-break: break-all;
    }

    #${cardId} .stx-ui-log-list-timeline {
      display: grid;
      gap: 4px;
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.82;
    }

    #${cardId} .stx-ui-log-list-timeline span {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    #${cardId} .stx-ui-log-detail-wrap {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #${cardId} .stx-ui-log-actions {
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.08));
      flex-wrap: wrap;
      min-width: 0;
    }

    #${cardId} .stx-ui-log-actions .stx-ui-btn {
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-log-detail {
      flex: 1 1 auto;
      min-height: 0;
      min-width: 0;
      overflow-y: auto;
      overflow-x: auto;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #${cardId} .stx-ui-log-section {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.12));
      border-radius: 10px;
      padding: 10px;
      background: rgba(0, 0, 0, 0.14);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-log-section-title {
      font-size: 12px;
      font-weight: 700;
      opacity: 0.9;
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    #${cardId} .stx-ui-log-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }

    #${cardId} .stx-ui-log-section-head .stx-ui-log-section-title {
      flex: 1 1 auto;
    }

    #${cardId} .stx-ui-log-copy-btn {
      flex: 0 0 auto;
      padding: 4px 8px;
      min-height: 28px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      transition: background-color 0.2s ease, border-color 0.2s ease;
    }

    #${cardId} .stx-ui-log-copy-btn:hover {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 55%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 16%, transparent);
    }

    #${cardId} .stx-ui-log-copy-btn.is-copied {
      border-color: rgba(88, 211, 106, 0.38);
      background: rgba(88, 211, 106, 0.16);
    }

    #${cardId} .stx-ui-log-pre {
      margin: 0;
      border-radius: 8px;
      padding: 10px;
      font-size: 11px;
      line-height: 1.55;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      max-height: min(280px, 34vh);
      min-width: 0;
      max-width: 100%;
      overflow-x: auto;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    #${cardId} .stx-ui-log-pre-raw {
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
    }

    #${cardId} .stx-ui-log-toolbar,
    #${cardId} .stx-ui-log-detail-wrap,
    #${cardId} .stx-ui-log-actions,
    #${cardId} .stx-ui-log-section,
    #${cardId} .stx-ui-log-modal-panel,
    #${cardId} .stx-ui-log-layout {
      box-sizing: border-box;
      max-width: 100%;
    }

    #${cardId} .stx-ui-log-modal-panel,
    #${cardId} .stx-ui-log-detail-wrap,
    #${cardId} .stx-ui-log-section,
    #${cardId} .stx-ui-log-list-item,
    #${cardId} .stx-ui-list-title,
    #${cardId} .stx-ui-list-meta,
    #${cardId} .stx-ui-item-title,
    #${cardId} .stx-ui-item-desc {
      overflow-wrap: anywhere;
    }

    @media (max-width: 900px) {
      #${cardId} .stx-ui-log-modal {
        width: 96vw;
      }

      #${cardId} .stx-ui-log-filter-row {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-log-modal-panel {
        min-height: 88vh;
        max-height: 88vh;
      }

      #${cardId} .stx-ui-log-layout {
        grid-template-columns: 1fr;
      }

      #${cardId} .stx-ui-log-sidebar {
        border-right: 0;
        border-bottom: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.1));
        max-height: 45vh;
      }
    }

    #${cardId} .stx-ui-stale-indicator {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #ff8787;
      opacity: 0.9;
    }

    #${cardId} .stx-ui-online-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      display: inline-block;
      flex-shrink: 0;
    }

    #${cardId} .stx-ui-online-dot.is-online {
      background: #58d36a;
      box-shadow: 0 0 0 2px rgba(88, 211, 106, 0.22);
    }

    #${cardId} .stx-ui-online-dot.is-offline {
      background: rgba(255, 255, 255, 0.3);
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
      background-color: var(--ss-theme-surface-3, var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.34)));
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

    /* ── 连接测试结果区域 ── */
    #${cardId} .stx-ui-result-area {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      margin-bottom: 4px;
    }

    #${cardId} .stx-ui-result-ok {
      background: rgba(88, 211, 106, 0.12);
      border: 1px solid rgba(88, 211, 106, 0.36);
      color: #58d36a;
    }

    #${cardId} .stx-ui-result-error {
      background: rgba(255, 135, 135, 0.12);
      border: 1px solid rgba(255, 135, 135, 0.36);
      color: #ff8787;
    }

    #${cardId} .stx-ui-result-msg {
      font-weight: 600;
    }

    #${cardId} .stx-ui-result-detail {
      margin-top: 4px;
      opacity: 0.78;
      word-break: break-all;
      max-height: 80px;
      overflow-y: auto;
    }

    #${cardId} .stx-ui-result-detail.is-rich {
      max-height: 220px;
      opacity: 1;
      word-break: normal;
    }

    #${cardId} .stx-ui-rerank-result-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 2px;
    }

    #${cardId} .stx-ui-rerank-result-item {
      padding: 8px 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    #${cardId} .stx-ui-rerank-result-head {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 4px;
      font-size: 11px;
    }

    #${cardId} .stx-ui-rerank-result-rank,
    #${cardId} .stx-ui-rerank-result-score {
      font-weight: 700;
    }

    #${cardId} .stx-ui-rerank-result-doc {
      font-size: 12px;
      line-height: 1.55;
      color: inherit;
      opacity: 0.88;
      white-space: pre-wrap;
      word-break: break-word;
    }

    #${cardId} .stx-ui-tavern-info-status {
      width: 100%;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.14));
      background: var(--ss-theme-surface-3, rgba(255, 255, 255, 0.04));
      box-sizing: border-box;
    }

    #${cardId} .stx-ui-tavern-info-status.is-ok {
      border-color: rgba(88, 211, 106, 0.36);
      background: rgba(88, 211, 106, 0.12);
      color: #58d36a;
    }

    #${cardId} .stx-ui-tavern-info-status.is-warning {
      border-color: rgba(197, 160, 89, 0.36);
      background: rgba(197, 160, 89, 0.12);
      color: #e2c27a;
    }

    #${cardId} .stx-ui-tavern-info-list {
      width: 100%;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    #${cardId} .stx-ui-tavern-info-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px dashed var(--ss-theme-border, rgba(255, 255, 255, 0.18));
      background: rgba(0, 0, 0, 0.12);
      box-sizing: border-box;
    }

    #${cardId} .stx-ui-tavern-info-label {
      font-size: 11px;
      opacity: 0.72;
    }

    #${cardId} .stx-ui-tavern-info-value {
      font-size: 12px;
      line-height: 1.45;
      word-break: break-all;
    }

    #${cardId} .stx-ui-tavern-info-empty {
      grid-column: 1 / -1;
      font-size: 12px;
      opacity: 0.72;
      padding: 4px 0;
    }

    #${cardId} .stx-ui-field-hint {
      font-size: 11px;
      opacity: 0.68;
      margin-top: 2px;
      display: block;
    }

    @media (max-width: 900px) {
      #${cardId} .stx-ui-list {
        grid-template-columns: minmax(0, 1fr);
      }

      #${cardId} .stx-ui-form-grid,
      #${cardId} .stx-ui-consumer-map-form {
        grid-template-columns: minmax(0, 1fr);
      }

      #${cardId} .stx-ui-tabs,
      #${cardId} .stx-ui-sub-tabs,
      #${cardId} .stx-ui-row,
      #${cardId} .stx-ui-actions {
        justify-content: flex-start;
      }
    }

    @media (max-width: 768px) {
      #${cardId} .stx-ui-tavern-info-list {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    @media (max-width: 640px) {
      #${cardId} .stx-ui-consumer-map-actions {
        justify-content: flex-start;
      }
    }
  `;
}
