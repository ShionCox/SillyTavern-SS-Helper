export function buildSettingsCardStylesTemplateEvent(cardId: string): string {
  return `
    #${cardId} {
      margin-bottom: 5px;
      color: var(--SmartThemeBodyColor, inherit);
    }

    #${cardId} .st-roll-shell {
      border: 1px solid rgba(197, 160, 89, 0.35);
      border-radius: 12px;
      overflow: hidden;
      background:
        radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%),
        linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82));
      backdrop-filter: blur(3px);
    }

    #${cardId} .st-roll-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 0 !important;
      padding: 10px 12px;
      cursor: pointer;
      user-select: none;
      transition: background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-head-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }

    #${cardId} .st-roll-head-badge {
      color: #f06464;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    #${cardId} .st-roll-head .inline-drawer-icon {
      transition: transform 0.2s ease;
    }

    #${cardId} .st-roll-content {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 10px;
      display: block;
    }

    #${cardId} .st-roll-filters {
      margin-bottom: 10px;
      gap: 8px;
    }

    #${cardId} .st-roll-search {
      min-height: 32px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    #${cardId} .st-roll-search-item.is-hidden-by-search {
      display: none !important;
    }

    #${cardId} .st-roll-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      margin-bottom: 10px;
      background: rgba(0, 0, 0, 0.2);
    }

    #${cardId} .st-roll-tab {
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

    #${cardId} .st-roll-tab.is-active {
      opacity: 1;
      color: var(--SmartThemeQuoteTextColor, #fff);
      background: rgba(197, 160, 89, 0.58);
    }

    #${cardId} .st-roll-panel {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    #${cardId} .st-roll-panel[hidden] {
      display: none !important;
    }

    #${cardId} .st-roll-divider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 6px;
      font-size: 13px;
      font-weight: 700;
      opacity: 0.95;
    }

    #${cardId} .st-roll-divider-line {
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

    #${cardId} .st-roll-item {
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 10px;
      padding: 12px;
      margin: 2px 0;
      background: rgba(0, 0, 0, 0.16);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-item-main {
      min-width: 0;
      flex: 1;
    }

    #${cardId} .st-roll-item-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 3px;
    }

    #${cardId} .st-roll-item-desc {
      font-size: 12px;
      line-height: 1.45;
      opacity: 0.75;
    }

    #${cardId} .st-roll-about-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px 24px;
    }

    #${cardId} .st-roll-about-meta-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
    }

    #${cardId} .st-roll-about-meta-item i {
      width: 14px;
      text-align: center;
      opacity: 0.86;
    }

    #${cardId} .st-roll-about-meta a {
      color: inherit;
      text-decoration: none;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.22);
      transition: border-color 0.2s ease, text-shadow 0.2s ease;
    }

    #${cardId} .st-roll-about-meta a:hover {
      border-bottom-color: rgba(255, 255, 255, 0.5);
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.22);
    }

    #${cardId} .st-roll-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    #${cardId} .st-roll-row {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }

    #${cardId} .st-roll-field-label {
      font-size: 13px;
      opacity: 0.85;
      flex: 1;
      min-width: 200px;
    }

    #${cardId} .st-roll-select,
    #${cardId} .st-roll-input,
    #${cardId} .st-roll-textarea {
      background: rgba(0, 0, 0, 0.28);
      color: inherit;
      border: 1px solid rgba(197, 160, 89, 0.36);
      border-radius: 8px;
      box-sizing: border-box;
      transition:
        border-color 0.2s ease,
        box-shadow 0.2s ease,
        background-color 0.2s ease;
    }

    #${cardId} .st-roll-select,
    #${cardId} .st-roll-input {
      padding: 4px 8px;
      min-height: 30px;
    }

    #${cardId} .st-roll-select {
      min-width: 182px;
      max-width: 100%;
      text-align: center;
      text-align-last: center;
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

    #${cardId} .st-roll-select option {
      text-align: left;
    }

    #${cardId} .st-roll-input {
      width: 120px;
    }

    #${cardId} .st-roll-item.is-disabled {
      opacity: 0.52;
    }

    #${cardId} .st-roll-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: nowrap; 
      overflow: visible; 
    }

    #${cardId} .st-roll-btn {
      flex-shrink: 0;
    }

    #${cardId} .st-roll-btn {
      cursor: pointer;
      padding: 4px 10px;
      border-radius: 7px;
      border: 1px solid rgba(197, 160, 89, 0.45);
      background: rgba(197, 160, 89, 0.14);
      color: inherit;
      font-size: 12px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-btn.secondary {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }

    #${cardId} .st-roll-textarea-wrap {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.15);
      padding: 10px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
    }

    #${cardId} .st-roll-textarea {
      width: 100%;
      resize: vertical;
      padding: 8px;
      font-size: 12px;
      line-height: 1.5;
      min-height: 220px;
    }

    #${cardId} .st-roll-changelog {
      width: 100%;
      font-size: 12px;
      background: rgba(0, 0, 0, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 8px;
      padding: 10px;
      max-height: 240px;
      overflow-y: auto;
    }

    #${cardId} .st-roll-changelog ul {
      list-style-type: disc;
      color: inherit;
    }

    #${cardId} .st-roll-changelog li {
      margin-bottom: 4px;
    }

    #${cardId} .st-roll-changelog::-webkit-scrollbar {
      width: 6px;
    }

    #${cardId} .st-roll-changelog::-webkit-scrollbar-thumb {
      background: rgba(197, 160, 89, 0.4);
      border-radius: 4px;
    }

    #${cardId} .st-roll-skill-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .st-roll-skill-cols {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) 130px 76px;
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.72;
      margin-bottom: 6px;
      padding: 0 2px;
    }

    #${cardId} .st-roll-skill-cols span:nth-child(2),
    #${cardId} .st-roll-skill-cols span:nth-child(3) {
      text-align: center;
    }

    #${cardId} .st-roll-skill-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #${cardId} .st-roll-skill-row {
      display: grid;
      grid-template-columns: minmax(160px, 1fr) 130px 76px;
      gap: 8px;
      align-items: center;
    }

    #${cardId} .st-roll-skill-name,
    #${cardId} .st-roll-skill-modifier {
      width: 100%;
    }

    #${cardId} .st-roll-skill-modifier {
      text-align: center;
    }

    #${cardId} .st-roll-skill-remove {
      padding-left: 0;
      padding-right: 0;
    }

    #${cardId} .st-roll-skill-empty {
      border: 1px dashed rgba(255, 255, 255, 0.22);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      font-size: 12px;
      opacity: 0.7;
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .st-roll-skill-errors {
      border: 1px solid rgba(255, 110, 110, 0.45);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(120, 20, 20, 0.22);
      margin-top: 8px;
      margin-bottom: 8px;
    }

    #${cardId} .st-roll-skill-error-item {
      font-size: 12px;
      line-height: 1.45;
      color: #ffd2d2;
    }

    #${cardId} .st-roll-skill-dirty {
      margin-top: 8px;
      margin-bottom: 2px;
      font-size: 12px;
      line-height: 1.4;
      color: #ffe0a6;
    }

    #${cardId} .st-roll-skill-import {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed rgba(255, 255, 255, 0.22);
    }

    #${cardId} .st-roll-skill-modal {
      position: fixed;
      inset: 0;
      z-index: 32000;
      border: 0;
      padding: 0;
      margin: 0;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      background: transparent;
    }

    #${cardId} .st-roll-skill-modal:not([open]) {
      display: none !important;
    }

    #${cardId} .st-roll-skill-modal[open] {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    #${cardId} .st-roll-skill-modal::backdrop {
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(2px);
    }

    #${cardId} .st-roll-skill-modal-backdrop {
      position: absolute;
      inset: 0;
      background: transparent;
      backdrop-filter: none;
    }

    #${cardId} .st-roll-skill-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: min(1460px, 96vw);
      height: min(96vh, 920px);
      margin: 0;
      border: 1px solid rgba(197, 160, 89, 0.38);
      border-radius: 14px;
      overflow: hidden;
      background:
        radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%),
        linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96));
      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
    }

    #${cardId} .st-roll-skill-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
    }

    #${cardId} .st-roll-skill-modal-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 700;
    }

    #${cardId} .st-roll-skill-modal-close {
      min-width: 72px;
    }

    #${cardId} .st-roll-skill-modal-body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 12px;
    }

    #${cardId} .st-roll-skill-layout {
      display: grid;
      grid-template-columns: minmax(220px, 280px) 1fr;
      gap: 10px;
      align-items: start;
    }

    #${cardId} .st-roll-skill-presets {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.16);
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 260px;
    }

    #${cardId} .st-roll-skill-presets-head {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    #${cardId} .st-roll-skill-preset-meta {
      min-height: 24px;
      font-size: 12px;
      line-height: 1.4;
      opacity: 0.78;
    }

    #${cardId} .st-roll-skill-preset-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-height: 360px;
      overflow: auto;
      padding-right: 2px;
    }

    #${cardId} .st-roll-skill-preset-item {
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
      line-height: 1.35;
      transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-skill-preset-item:hover {
      border-color: rgba(197, 160, 89, 0.58);
      background: rgba(197, 160, 89, 0.18);
    }

    #${cardId} .st-roll-skill-preset-item.is-active {
      border-color: rgba(197, 160, 89, 0.68);
      background: rgba(197, 160, 89, 0.24);
      box-shadow:
        0 0 0 1px rgba(197, 160, 89, 0.26),
        0 0 14px rgba(197, 160, 89, 0.18);
    }

    #${cardId} .st-roll-skill-preset-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-align: left;
      font-weight: 700;
    }

    #${cardId} .st-roll-skill-preset-tags {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    #${cardId} .st-roll-skill-preset-tag {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 6px;
      border-radius: 999px;
      font-size: 11px;
      opacity: 0.88;
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }

    #${cardId} .st-roll-skill-preset-tag.active {
      border-color: rgba(197, 160, 89, 0.55);
      background: rgba(197, 160, 89, 0.24);
    }

    #${cardId} .st-roll-skill-preset-tag.locked {
      border-color: rgba(84, 196, 255, 0.45);
      background: rgba(84, 196, 255, 0.2);
    }

    #${cardId} .st-roll-skill-rename-row {
      justify-content: flex-start;
      gap: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .st-roll-skill-preset-name-input {
      width: min(280px, 100%);
    }

    #${cardId} .st-roll-skill-preset-empty {
      border: 1px dashed rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      font-size: 12px;
      opacity: 0.7;
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .st-roll-status-modal {
      position: fixed;
      inset: 0;
      z-index: 32000;
      border: 0;
      padding: 0;
      margin: 0;
      width: 100vw;
      height: 100vh;
      max-width: none;
      max-height: none;
      background: transparent;
    }

    #${cardId} .st-roll-status-modal:not([open]) {
      display: none !important;
    }

    #${cardId} .st-roll-status-modal[open] {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    #${cardId} .st-roll-status-modal::backdrop {
      background: rgba(0, 0, 0, 0.72);
      backdrop-filter: blur(2px);
    }

    #${cardId} .st-roll-status-modal-backdrop {
      position: absolute;
      inset: 0;
      background: transparent;
    }

    #${cardId} .st-roll-status-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: min(1220px, 96vw);
      height: min(92vh, 860px);
      margin: 0;
      border: 1px solid rgba(197, 160, 89, 0.38);
      border-radius: 14px;
      overflow: hidden;
      background:
        radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%),
        linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96));
      box-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --st-roll-status-sidebar-width: 300px;
      --st-roll-status-col-name: 180px;
      --st-roll-status-col-modifier: 96px;
      --st-roll-status-col-duration: 110px;
      --st-roll-status-col-scope: 110px;
      --st-roll-status-col-skills: 1fr;
      --st-roll-status-col-enabled: 96px;
      --st-roll-status-col-actions: 84px;
    }

    #${cardId} .st-roll-status-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.04);
    }

    #${cardId} .st-roll-status-modal-title {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 700;
    }

    #${cardId} .st-roll-status-modal-close {
      min-width: 72px;
    }

    #${cardId} .st-roll-status-modal-body {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 12px;
      display: flex;
    }

    #${cardId} .st-roll-status-layout {
      display: grid;
      grid-template-columns: var(--st-roll-status-sidebar-width) 8px minmax(0, 1fr);
      min-height: 0;
      height: 100%;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.18);
      flex: 1;
    }

    #${cardId} .st-roll-status-sidebar {
      min-width: 180px;
      border-right: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(0, 0, 0, 0.26);
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    #${cardId} .st-roll-status-sidebar-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 8px;
      padding: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .st-roll-status-memory-state {
      font-size: 11px;
      opacity: 0.82;
      white-space: normal;
      overflow-wrap: anywhere;
      word-break: break-word;
      line-height: 1.35;
      max-width: 100%;
      flex: 1 1 100%;
    }

    #${cardId} .st-roll-status-chat-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 8px;
      overflow: auto;
      min-height: 0;
    }

    #${cardId} .st-roll-status-chat-item {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      padding: 8px;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr);
      gap: 8px;
      align-items: center;
      cursor: pointer;
      transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-status-chat-item:hover {
      border-color: rgba(197, 160, 89, 0.58);
      background: rgba(197, 160, 89, 0.16);
    }

    #${cardId} .st-roll-status-chat-item.is-active {
      border-color: rgba(197, 160, 89, 0.74);
      background: rgba(197, 160, 89, 0.24);
      box-shadow: 0 0 0 1px rgba(197, 160, 89, 0.24);
    }

    #${cardId} .st-roll-status-chat-avatar-wrap {
      width: 42px;
      height: 42px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: rgba(0, 0, 0, 0.35);
      display: grid;
      place-items: center;
      flex: 0 0 auto;
    }

    #${cardId} .st-roll-status-chat-avatar {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    #${cardId} .st-roll-status-chat-avatar-fallback {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      font-size: 15px;
      font-weight: 700;
      color: rgba(255, 236, 201, 0.92);
      background: linear-gradient(145deg, rgba(197, 160, 89, 0.32), rgba(197, 160, 89, 0.12));
    }

    #${cardId} .st-roll-status-chat-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      text-align: left;
    }

    #${cardId} .st-roll-status-chat-name {
      font-size: 13px;
      font-weight: 700;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-chat-time {
      font-size: 11px;
      opacity: 0.78;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-chat-key {
      font-size: 11px;
      opacity: 0.7;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-chat-meta-line {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      opacity: 0.8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${cardId} .st-roll-status-splitter {
      cursor: col-resize;
      background: rgba(255, 255, 255, 0.04);
      border-left: 1px solid rgba(255, 255, 255, 0.06);
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      transition: background-color 0.2s ease;
    }

    #${cardId} .st-roll-status-splitter:hover,
    #${cardId} .st-roll-status-splitter.is-resizing {
      background: rgba(197, 160, 89, 0.42);
    }

    #${cardId} .st-roll-status-main {
      padding: 10px;
      min-width: 0;
      min-height: 0;
      overflow-x: auto;
      overflow-y: hidden;
      display: flex;
      flex-direction: column;
    }

    #${cardId} .st-roll-status-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 8px;
      flex-wrap: wrap;
    }

    #${cardId} .st-roll-status-head-main {
      display: flex;
      flex-direction: column;
      gap: 3px;
      min-width: 0;
      flex: 1;
    }

    #${cardId} .st-roll-status-chat-meta {
      font-size: 11px;
      line-height: 1.4;
      opacity: 0.8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-cols {
      display: grid;
      grid-template-columns:
        var(--st-roll-status-col-name)
        var(--st-roll-status-col-modifier)
        var(--st-roll-status-col-duration)
        var(--st-roll-status-col-scope)
        var(--st-roll-status-col-skills)
        var(--st-roll-status-col-enabled)
        var(--st-roll-status-col-actions);
      gap: 8px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.72;
      margin-bottom: 6px;
      padding: 0 2px;
      align-items: center;
      min-width: 760px;
    }

    #${cardId} .st-roll-status-cols span:nth-child(2),
    #${cardId} .st-roll-status-cols span:nth-child(3),
    #${cardId} .st-roll-status-cols span:nth-child(6),
    #${cardId} .st-roll-status-cols span:nth-child(7) {
      text-align: center;
    }

    #${cardId} .st-roll-status-rows {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overflow-x: visible;
      padding-bottom: 4px;
    }

    #${cardId} .st-roll-status-row {
      display: grid;
      grid-template-columns:
        var(--st-roll-status-col-name)
        var(--st-roll-status-col-modifier)
        var(--st-roll-status-col-duration)
        var(--st-roll-status-col-scope)
        var(--st-roll-status-col-skills)
        var(--st-roll-status-col-enabled)
        var(--st-roll-status-col-actions);
      gap: 8px;
      align-items: center;
      min-width: 760px;
    }

    #${cardId} .st-roll-status-col-head {
      position: relative;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 8px;
    }

    #${cardId} .st-roll-status-col-resizer {
      position: absolute;
      top: 0;
      right: -4px;
      bottom: 0;
      width: 8px;
      cursor: col-resize;
      user-select: none;
      background: transparent;
    }

    #${cardId} .st-roll-status-col-resizer::before {
      content: "";
      position: absolute;
      top: 14%;
      bottom: 14%;
      left: 50%;
      width: 1px;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.24);
    }

    #${cardId} .st-roll-status-col-resizer:hover,
    #${cardId} .st-roll-status-col-resizer.is-resizing {
      background: rgba(197, 160, 89, 0.55);
    }

    #${cardId} .st-roll-status-col-resizer:hover::before,
    #${cardId} .st-roll-status-col-resizer.is-resizing::before {
      background: rgba(255, 236, 201, 0.72);
    }

    #${cardId} .st-roll-status-modifier,
    #${cardId} .st-roll-status-duration {
      text-align: center;
    }

    #${cardId} .st-roll-status-enabled-wrap {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 12px;
      opacity: 0.9;
      user-select: none;
    }

    #${cardId} .st-roll-status-remove {
      padding-left: 0;
      padding-right: 0;
    }

    #${cardId} .st-roll-status-empty {
      border: 1px dashed rgba(255, 255, 255, 0.22);
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      font-size: 12px;
      opacity: 0.7;
      background: rgba(255, 255, 255, 0.03);
    }

    #${cardId} .st-roll-status-errors {
      border: 1px solid rgba(255, 110, 110, 0.45);
      border-radius: 8px;
      padding: 8px 10px;
      background: rgba(120, 20, 20, 0.22);
      margin-top: 8px;
      margin-bottom: 8px;
    }

    #${cardId} .st-roll-status-error-item {
      font-size: 12px;
      line-height: 1.45;
      color: #ffd2d2;
    }

    #${cardId} .st-roll-status-dirty {
      margin-top: 8px;
      margin-bottom: 2px;
      font-size: 12px;
      line-height: 1.4;
      color: #ffe0a6;
    }

    #${cardId} .st-roll-tip {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.78;
      padding-top: 4px;
    }

    #${cardId} input[type="checkbox"] {
      accent-color: rgba(197, 160, 89, 0.92);
      transition: filter 0.2s ease;
    }

    #${cardId} .st-roll-head:hover {
      background: rgba(255, 255, 255, 0.04);
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
    }

    #${cardId} .st-roll-tab:hover {
      opacity: 1;
      background: rgba(197, 160, 89, 0.2);
      box-shadow: 0 0 12px rgba(197, 160, 89, 0.2);
    }

    #${cardId} .st-roll-item:hover {
      border-color: rgba(197, 160, 89, 0.48);
      background: rgba(0, 0, 0, 0.24);
      box-shadow:
        0 0 0 1px rgba(197, 160, 89, 0.2),
        0 0 16px rgba(197, 160, 89, 0.16);
    }

    #${cardId} .st-roll-select:hover,
    #${cardId} .st-roll-input:hover,
    #${cardId} .st-roll-search:hover,
    #${cardId} .st-roll-textarea:hover {
      border-color: rgba(197, 160, 89, 0.58);
      background-color: rgba(0, 0, 0, 0.34);
      box-shadow: 0 0 0 1px rgba(197, 160, 89, 0.18);
    }

    #${cardId} .st-roll-textarea-wrap:hover {
      border-color: rgba(197, 160, 89, 0.45);
      box-shadow: 0 10px 22px rgba(0, 0, 0, 0.2);
    }

    #${cardId} .st-roll-btn:hover {
      border-color: rgba(197, 160, 89, 0.68);
      background: rgba(197, 160, 89, 0.24);
      box-shadow:
        inset 0 0 0 1px rgba(197, 160, 89, 0.26),
        0 0 14px rgba(197, 160, 89, 0.2);
    }

    #${cardId} .st-roll-select:focus,
    #${cardId} .st-roll-input:focus,
    #${cardId} .st-roll-search:focus,
    #${cardId} .st-roll-textarea:focus {
      outline: none;
      border-color: rgba(197, 160, 89, 0.72);
      box-shadow: 0 0 0 2px rgba(197, 160, 89, 0.22);
    }

    @media (max-width: 680px) {
      #${cardId} .st-roll-skill-modal-panel {
        width: 100vw;
        height: 100vh;
        margin: 0;
        border-radius: 0;
      }

      #${cardId} .st-roll-skill-modal-head {
        padding: 10px 12px;
      }

      #${cardId} .st-roll-skill-modal-body {
        padding: 10px;
      }

      #${cardId} .st-roll-skill-layout {
        grid-template-columns: 1fr;
      }

      #${cardId} .st-roll-skill-presets {
        min-height: 0;
      }

      #${cardId} .st-roll-skill-head {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .st-roll-skill-cols {
        display: none;
      }

      #${cardId} .st-roll-skill-row {
        grid-template-columns: 1fr;
      }

      #${cardId} .st-roll-skill-modifier {
        text-align: left;
      }

      #${cardId} .st-roll-skill-remove {
        width: 100%;
      }

      #${cardId} .st-roll-status-modal-panel {
        width: 100vw;
        height: 100vh;
        margin: 0;
        border-radius: 0;
      }

      #${cardId} .st-roll-status-modal-head {
        padding: 10px 12px;
      }

      #${cardId} .st-roll-status-modal-body {
        padding: 10px;
      }

      #${cardId} .st-roll-status-layout {
        grid-template-columns: 1fr;
        min-height: 0;
      }

      #${cardId} .st-roll-status-sidebar {
        border-right: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        max-height: 220px;
      }

      #${cardId} .st-roll-status-splitter {
        display: none;
      }

      #${cardId} .st-roll-status-head {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .st-roll-status-cols {
        display: none;
      }

      #${cardId} .st-roll-status-row {
        grid-template-columns: 1fr;
      }

      #${cardId} .st-roll-status-modifier {
        text-align: left;
      }

      #${cardId} .st-roll-status-enabled-wrap {
        justify-content: flex-start;
      }

      #${cardId} .st-roll-status-remove {
        width: 100%;
      }
    }

    @media (max-width: 768px) {
      #${cardId} .st-roll-status-chat-meta {
        white-space: normal;
      }
    }
  `;
}
