export function buildSettingsCardStylesTemplate(cardId: string): string {
  return `
    #${cardId} {
      margin-bottom: 5px;
      color: var(--SmartThemeBodyColor, inherit);
    }

    #${cardId}.is-card-disabled .stx-ui-shell {
      opacity: 0.56;
      filter: grayscale(0.92) saturate(0.35);
    }

    #${cardId} .stx-ui-shell {
      border: 1px solid rgba(197, 160, 89, 0.35);
      border-radius: 12px;
      overflow: hidden;
      background:
        radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%),
        linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82));
      backdrop-filter: blur(3px);
    }

    #${cardId} .stx-ui-head {
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

    #${cardId} .stx-ui-head-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }

    #${cardId} .stx-ui-head-badge {
      color: #f06464;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    #${cardId} .stx-ui-head .inline-drawer-icon {
      transition: transform 0.2s ease;
    }

    #${cardId} .stx-ui-content {
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      padding: 10px;
      display: block;
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
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 999px;
      margin-bottom: 10px;
      background: rgba(0, 0, 0, 0.2);
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
      color: var(--SmartThemeQuoteTextColor, #fff);
      background: rgba(197, 160, 89, 0.58);
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
      border-bottom: 1px dashed rgba(255, 255, 255, 0.22);
      transition: border-color 0.2s ease, text-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-about-meta a:hover {
      border-bottom-color: rgba(255, 255, 255, 0.5);
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.22);
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

    #${cardId} .stx-ui-item-stack {
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
    }

    #${cardId} .stx-ui-item-stack .stx-ui-item-main {
      width: 100%;
    }

    #${cardId} .stx-ui-item-stack .stx-ui-row,
    #${cardId} .stx-ui-item-stack .stx-ui-actions {
      width: 100%;
      justify-content: flex-start;
    }

    #${cardId} .stx-ui-grid-form {
      display: grid;
      grid-template-columns: repeat(2, minmax(220px, 1fr));
      gap: 8px;
      width: 100%;
    }

    #${cardId} .stx-ui-grid-form label {
      display: block;
      min-width: 0;
    }

    #${cardId} .stx-ui-grid-form .stx-ui-input,
    #${cardId} .stx-ui-grid-form .stx-ui-select {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }

    #${cardId} .stx-ui-checkbox-group {
      width: 100%;
      justify-content: flex-start;
      row-gap: 8px;
      column-gap: 14px;
    }

    @media (max-width: 900px) {
      #${cardId} .stx-ui-grid-form {
        grid-template-columns: 1fr;
      }
    }

    #${cardId} .stx-ui-field-label {
      font-size: 13px;
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
      border: 1px solid rgba(197, 160, 89, 0.45);
      background: rgba(197, 160, 89, 0.14);
      color: inherit;
      font-size: 12px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .stx-ui-btn.secondary {
      border-color: rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
    }

    #${cardId} .stx-ui-textarea-wrap {
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 10px;
      background: rgba(0, 0, 0, 0.15);
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
      background: rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.1);
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

    #${cardId} .stx-ui-changelog::-webkit-scrollbar {
      width: 4px;
    }
    #${cardId} .stx-ui-changelog::-webkit-scrollbar-thumb {
      background: rgba(197, 160, 89, 0.5);
      border-radius: 10px;
    }

    #${cardId} .stx-ui-head:hover {
      background: rgba(255, 255, 255, 0.04);
      box-shadow: inset 0 -1px 0 rgba(255, 255, 255, 0.08);
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
    #${cardId} .stx-ui-search:hover,
    #${cardId} .stx-ui-textarea:hover {
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
    #${cardId} .stx-ui-search:focus,
    #${cardId} .stx-ui-textarea:focus {
      outline: none;
      border-color: rgba(197, 160, 89, 0.72);
      box-shadow: 0 0 0 2px rgba(197, 160, 89, 0.22);
    }

    /* === Record Editor Overlay === */
    .stx-record-editor-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(10, 10, 12, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #eaeaea;
      font-family: var(--SmartThemeBodyFont, system-ui);
    }

    .stx-record-editor {
      width: 80%;
      height: 80%;
      background: linear-gradient(145deg, rgba(30, 30, 34, 0.95), rgba(18, 18, 20, 0.98));
      border: 1px solid rgba(197, 160, 89, 0.3);
      border-radius: 20px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.1);
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
      background: linear-gradient(90deg, rgba(197, 160, 89, 0.15) 0%, transparent 100%);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
    }

    .stx-re-title {
      font-size: 19px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: var(--SmartThemeQuoteTextColor, #fff);
      display: flex;
      align-items: center;
      gap: 12px;
      text-shadow: 0 0 10px rgba(197, 160, 89, 0.3);
    }

    .stx-re-close {
      cursor: pointer;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.2s ease;
    }

    .stx-re-close:hover {
      background: rgba(255, 100, 100, 0.2);
      border-color: rgba(255, 100, 100, 0.5);
      color: #ff8787;
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
      border-right: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
    }

    .stx-re-sidebar-title {
      padding: 14px 20px;
      font-size: 13px;
      font-weight: 700;
      color: rgba(255,255,255,0.5);
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
      background: rgba(255,255,255,0.1);
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
      background: rgba(255,255,255,0.04);
    }
    
    .stx-re-chat-item.is-context-target {
      background: rgba(255,255,255,0.08);
      border-color: rgba(255,255,255,0.15);
    }

    .stx-re-chat-item.is-active {
      background: rgba(197, 160, 89, 0.15);
      border-color: rgba(197, 160, 89, 0.3);
    }

    .stx-re-chat-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.1);
      flex-shrink: 0;
    }

    .stx-re-chat-avatar-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(197, 160, 89, 0.1);
      color: rgba(197, 160, 89, 0.8);
      border: 1px solid rgba(197, 160, 89, 0.3);
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
      color: #e0e0e0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-sys {
      font-size: 11px;
      color: rgba(255,255,255,0.4);
      font-family: monospace;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stx-re-chat-item.is-active .stx-re-chat-name {
      color: #fff;
    }

    /* === Main Area === */
    .stx-re-main {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: rgba(15, 15, 18, 0.4);
    }

    .stx-re-tabs {
      padding: 12px 24px;
      display: flex;
      gap: 10px;
      background: rgba(0,0,0,0.15);
      border-bottom: 1px solid rgba(255,255,255,0.04);
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
      background: rgba(255,255,255,0.03);
      border: 1px solid transparent;
    }

    .stx-re-tab:hover {
      opacity: 0.9;
      background: rgba(197, 160, 89, 0.15);
      border-color: rgba(197, 160, 89, 0.3);
      transform: translateY(-1px);
    }

    .stx-re-tab.is-active {
      opacity: 1;
      background: rgba(197, 160, 89, 0.3);
      border-color: rgba(197, 160, 89, 0.6);
      color: #fff;
      box-shadow: 0 4px 12px rgba(197, 160, 89, 0.2);
    }

    .stx-re-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      padding: 0; /* Remove container padding so table touches top */
      scrollbar-width: thin;
      scrollbar-color: rgba(197, 160, 89, 0.5) rgba(0,0,0,0.2);
    }
    
    .stx-re-content::-webkit-scrollbar {
      width: 8px;
    }
    .stx-re-content::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.2);
      border-radius: 4px;
    }
    .stx-re-content::-webkit-scrollbar-thumb {
      background: rgba(197, 160, 89, 0.4);
      border-radius: 4px;
    }
    .stx-re-content::-webkit-scrollbar-thumb:hover {
      background: rgba(197, 160, 89, 0.8);
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
      background: #1a1a1e; /* 完全不透明背景截断滚动 */
      color: rgba(197, 160, 89, 0.9);
      font-weight: 700;
      border-bottom: 2px solid rgba(255,255,255,0.1);
      position: sticky;
      top: 0;
      z-index: 10;
      box-shadow: 0 4px 10px -4px rgba(0,0,0,0.8);
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
      background: rgba(197, 160, 89, 0.6);
    }
    .stx-re-table td {
      padding: 12px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: top;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }
    
    .stx-re-table td:first-child {
      border-left: 1px solid rgba(255,255,255,0.03);
      border-radius: 8px 0 0 8px;
    }
    .stx-re-table td:last-child {
      border-right: 1px solid rgba(255,255,255,0.03);
      border-radius: 0 8px 8px 0;
    }

    .stx-re-row {
      transition: all 0.2s ease;
    }

    .stx-re-row:hover td {
      background: rgba(197,160,89, 0.08);
      border-color: rgba(197,160,89, 0.2);
    }

    .stx-re-actions {
      display: flex;
      gap: 6px;
      white-space: nowrap;
    }

    .stx-re-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: 1px solid rgba(255,255,255,0.15);
      background: rgba(255,255,255,0.05);
      color: rgba(255,255,255,0.8);
      cursor: pointer;
      font-size: 11px;
      font-weight: 600;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .stx-re-btn:hover {
      background: rgba(255,255,255, 0.15);
      border-color: rgba(255,255,255, 0.4);
      color: #fff;
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
      scrollbar-color: rgba(197, 160, 89, 0.4) transparent;
    }

    .stx-re-value::-webkit-scrollbar {
      width: 4px;
    }
    .stx-re-value::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
      border-radius: 2px;
    }
    .stx-re-value::-webkit-scrollbar-thumb {
      background: rgba(197, 160, 89, 0.4);
      border-radius: 2px;
    }
    .stx-re-value::-webkit-scrollbar-thumb:hover {
      background: rgba(197, 160, 89, 0.8);
    }
    
    .stx-re-value.editable:hover {
      background: rgba(255,255,255,0.05);
      border-radius: 4px;
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
    }

    .stx-re-json {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #b0bfd8;
    }

    .stx-re-chat-time {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
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
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      background: rgba(0,0,0,0.2);
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
      background: rgba(197, 160, 89, 0.8);
      border-color: rgba(197, 160, 89, 1);
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
      color: #a3c2cf;
      padding: 4px 6px;
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.2) transparent;
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
      color: #7ca5f5;
      font-weight: 600;
      min-width: 60px;
    }
    .stx-re-kv-val {
      color: #a3c2cf;
      word-break: break-all;
    }
    .stx-re-kv-input {
      background: rgba(0,0,0,0.4);
      border: 1px solid rgba(255,255,255,0.15);
      color: #fff;
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
      border-color: rgba(197, 160, 89, 0.8);
      background: rgba(0,0,0,0.6);
    }
    
    /* === Sortable Headers === */
    .stx-re-th-sortable {
      cursor: pointer;
      user-select: none;
      transition: color 0.2s;
    }
    .stx-re-th-sortable:hover {
      color: #fff;
    }
    .stx-re-th-sortable i {
      margin-left: 4px;
      color: rgba(255,255,255,0.3);
    }
    .stx-re-th-sortable.active {
      color: rgba(197, 160, 89, 1);
    }
    .stx-re-th-sortable.active i {
      color: rgba(197, 160, 89, 1);
    }

    /* === Footer === */
    .stx-re-footer {
      padding: 14px 24px;
      background: rgba(0,0,0,0.25);
      border-top: 1px solid rgba(255,255,255,0.06);
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
      color: #ff9800;
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
      background: rgba(197, 160, 89, 0.8);
      color: #111;
      border-color: rgba(197, 160, 89, 1);
      padding: 8px 20px;
      font-size: 14px;
      box-shadow: 0 4px 10px rgba(197, 160, 89, 0.2);
    }
    .stx-re-btn.save:hover {
      background: rgba(217, 180, 109, 1);
      box-shadow: 0 4px 15px rgba(197, 160, 89, 0.4);
      color: #000;
    }
    .stx-re-btn.save:disabled {
      background: rgba(0,0,0,0.3);
      color: rgba(255,255,255,0.3);
      border-color: rgba(255,255,255,0.1);
      cursor: not-allowed;
      box-shadow: none;
    }

    /* === Pending State Styles === */
    .stx-re-row.pending-delete {
      opacity: 0.4;
      pointer-events: none;
      background: rgba(255,0,0,0.05);
    }
    .stx-re-row.pending-update {
      background: rgba(197, 160, 89, 0.05);
      border-left: 2px solid rgba(197, 160, 89, 0.8);
    }

    /* === Context Menu === */
    .stx-re-ctx-menu {
      position: absolute;
      background: rgba(25, 25, 25, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      padding: 6px 0;
      z-index: 1000000;
      min-width: 140px;
      backdrop-filter: blur(4px);
    }
    
    .stx-re-ctx-menu-item {
      padding: 8px 16px;
      font-size: 13px;
      color: #e0e0e0;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .stx-re-ctx-menu-item:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    
    .stx-re-empty {
      text-align: center;
      padding: 60px;
      color: rgba(255,255,255,0.4);
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
      color: rgba(255,255,255,0.15);
    }
  `;
}
