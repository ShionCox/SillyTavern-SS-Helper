import { buildThemeVars } from "../../../SDK/theme";

export function buildSettingsCardStylesTemplate(cardId: string): string {
  return `
    ${buildThemeVars(`#${cardId} .stx-ui-content`)}
    ${buildThemeVars(`.stx-record-editor-overlay`)}

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
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
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
    }

    #${cardId} .stx-ui-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
    }

    #${cardId} .stx-ui-field-label {
      font-size: 13px;
      opacity: 0.85;
      white-space: nowrap;
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input,
    #${cardId} .stx-ui-textarea {
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.28));
      color: var(--ss-theme-text, inherit);
      border: 1px solid var(--ss-theme-border, rgba(197, 160, 89, 0.36));
      border-radius: 8px;
      box-sizing: border-box;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease;
    }

    #${cardId} .stx-ui-select,
    #${cardId} .stx-ui-input {
      padding: 4px 8px;
      min-height: 30px;
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

    #${cardId} .stx-ui-item.is-disabled {
      opacity: 0.52;
    }

    #${cardId} .stx-ui-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .stx-ui-btn {
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 7px;
      border: 1px solid var(--ss-theme-border, rgba(197, 160, 89, 0.45));
      background: var(--ss-theme-surface-3, rgba(197, 160, 89, 0.14));
      color: var(--ss-theme-text, inherit);
      font-size: 12px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-btn.secondary {
      border-color: var(--ss-theme-border, rgba(255, 255, 255, 0.2));
      background: var(--ss-theme-surface-2, rgba(255, 255, 255, 0.08));
    }

    #${cardId} .stx-ui-textarea-wrap {
      border: 1px solid var(--ss-theme-border, rgba(255, 255, 255, 0.18));
      border-radius: 10px;
      background: var(--ss-theme-surface-2, rgba(0, 0, 0, 0.15));
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
      background-color: var(--ss-theme-surface-3, rgba(0, 0, 0, 0.34));
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
      width: 80%;
      height: 80%;
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
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: all 0.2s ease;
      border: 1px solid transparent;
      display: flex;
      align-items: center;
      gap: 12px;
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

    .stx-re-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.1)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 80%, transparent);
      flex-shrink: 0;
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
    }

    .stx-re-chat-info {
      display: flex;
      flex-direction: column;
      gap: 3px;
      overflow: hidden;
    }

    .stx-re-chat-name {
      font-size: 14px;
      font-weight: 600;
      color: color-mix(in srgb, var(--ss-theme-text, #e0e0e0) 90%, transparent);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-sys {
      font-size: 11px;
      color: var(--stx-memory-muted-text, rgba(255,255,255,0.4));
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
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
      padding: 12px 24px;
      display: flex;
      gap: 10px;
      background: var(--ss-theme-toolbar-bg, rgba(0,0,0,0.15));
      border-bottom: 1px solid var(--ss-theme-border, rgba(255,255,255,0.04));
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
      padding: 12px 24px;
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.05)) 68%, transparent);
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
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
      margin-left: auto;
      align-self: flex-start;
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
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      padding: 4px;
      border-radius: 6px;
      background: transparent;
      border: none;
    }
    .stx-re-kv-row {
      display: flex;
      gap: 8px;
    }
    .stx-re-kv-key {
      color: var(--stx-memory-info, #7ca5f5);
      font-weight: 600;
      min-width: 60px;
    }
    .stx-re-kv-val {
      color: color-mix(in srgb, var(--stx-memory-code-text, #a3c2cf) 90%, transparent);
      word-break: break-all;
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
  `;
}
