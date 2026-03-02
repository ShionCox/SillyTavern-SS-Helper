export function buildEventCardsSharedStylesTemplateEvent(): string {
  return `
  <style>
    .st-rh-card-scope {
      --rh-border: #8c7b60;
      --rh-border-soft: rgba(197, 160, 89, 0.25);
      --rh-bg: linear-gradient(145deg, #1c1412 0%, #0d0806 100%);
      --rh-text: #d1c5a5;
      --rh-text-dim: #8c7b60;
      --rh-title: #e8dcb5;
      --rh-accent: #ffdfa3;
      --rh-chip-bg: rgba(255, 255, 255, 0.05);
      --rh-chip-border: rgba(150, 150, 150, 0.2);
      --rh-glow: 0 8px 24px rgba(0, 0, 0, 0.4), inset 0 0 30px rgba(0, 0, 0, 0.6);
      color: var(--rh-text);
      font-family: "Noto Sans SC", "Microsoft YaHei", "Segoe UI", sans-serif;
    }
    .st-rh-card-scope * {
      box-sizing: border-box;
    }
    .st-rh-event-board,
    .st-rh-result-card {
      border: 1px solid var(--rh-border);
      background: var(--rh-bg);
      color: var(--rh-text);
      box-shadow: var(--rh-glow);
      padding: 16px;
    }
    .st-rh-board-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
      border-bottom: 1px solid #4a3b2c;
      padding-bottom: 10px;
    }
    .st-rh-board-title {
      color: var(--rh-title);
      font-size: 17px;
      letter-spacing: 2px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      font-weight: 700;
    }
    .st-rh-board-id {
      font-size: 11px;
      color: #6b5a45;
      font-family: "JetBrains Mono", "Consolas", monospace;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .st-rh-board-head-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      max-width: 100%;
    }
    .st-rh-event-list {
      padding: 0;
      margin: 0;
      list-style: none;
    }
    .st-rh-event-item {
      margin-bottom: 16px;
      border: 1px solid var(--rh-border-soft);
      border-left: 3px solid #c5a059;
      border-radius: 8px;
      padding: 14px;
      background: linear-gradient(135deg, rgba(30, 20, 18, 0.82), rgba(15, 10, 10, 0.92));
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.28);
    }
    .st-rh-event-item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 10px;
    }
    .st-rh-event-title {
      margin: 0;
      color: var(--rh-accent);
      font-size: 17px;
      letter-spacing: 0.8px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      font-weight: 700;
      word-break: break-word;
    }
    .st-rh-event-id {
      font-size: 11px;
      font-family: "JetBrains Mono", "Consolas", monospace;
      color: var(--rh-text-dim);
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(197, 160, 89, 0.2);
      padding: 3px 8px;
      border-radius: 4px;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .st-rh-event-desc {
      margin: 0 0 12px;
      font-size: 13px;
      line-height: 1.7;
      text-align: center;
      color: var(--rh-text);
      opacity: 0.95;
    }
    .st-rh-chip-row {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 8px;
      margin: 12px 0;
    }
    .st-rh-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 4px 9px;
      border: 1px solid var(--rh-chip-border);
      background: var(--rh-chip-bg);
      color: var(--rh-text);
      text-transform: uppercase;
      border-radius: 6px;
      letter-spacing: 0.3px;
      line-height: 1.4;
    }
    .st-rh-chip-highlight {
      color: #ffd987;
    }
    .st-rh-chip-target {
      color: #9ad1ff;
    }
    .st-rh-chip-dice {
      color: var(--rh-accent);
    }
    .st-rh-chip-check {
      color: #ffbbbb;
    }
    .st-rh-chip-time {
      color: #a0d9a0;
    }
    .st-rh-dc-reason {
      margin: 8px 0;
      font-size: 12px;
      line-height: 1.6;
      text-align: center;
      color: #c8d6a1;
      border: 1px dashed rgba(160, 197, 110, 0.35);
      background: rgba(34, 44, 22, 0.38);
      padding: 8px 10px;
      border-radius: 6px;
    }
    .st-rh-runtime-wrap {
      display: flex;
      justify-content: center;
      margin-bottom: 4px;
    }
    .st-rh-runtime {
      display: inline-block;
      padding: 4px 10px;
      font-size: 11px;
      font-family: "JetBrains Mono", "Consolas", monospace;
      letter-spacing: 1px;
      border-radius: 6px;
    }
    .st-rh-event-footer {
      margin-top: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px dashed rgba(197, 160, 89, 0.2);
      padding-top: 12px;
    }
    .st-rh-event-footer.is-centered {
      justify-content: center;
    }
    .st-rh-command {
      font-size: 11px;
      color: var(--rh-text-dim);
      background: none;
      padding: 0;
      font-family: "JetBrains Mono", "Consolas", monospace;
      word-break: break-all;
    }
    .st-rh-roll-btn {
      border: 1px solid #c5a059;
      background: linear-gradient(135deg, #3a2515, #1a100a);
      color: var(--rh-accent);
      padding: 8px 18px;
      border-radius: 8px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 1px;
      text-transform: uppercase;
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      cursor: pointer;
    }
    .st-rh-roll-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.36);
      border-color: #e0bd76;
    }
    .st-rh-result-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 10px;
      margin-bottom: 14px;
      border-bottom: 1px solid #4a3b2c;
      padding-bottom: 10px;
    }
    .st-rh-result-heading {
      color: var(--rh-title);
      font-size: 16px;
      letter-spacing: 1px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      font-weight: 700;
    }
    .st-rh-result-id {
      font-size: 11px;
      color: #6b5a45;
      font-family: "JetBrains Mono", "Consolas", monospace;
      text-align: right;
    }
    .st-rh-result-title {
      margin-bottom: 12px;
      font-weight: 700;
      font-size: 20px;
      color: var(--rh-accent);
      text-align: center;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      letter-spacing: 0.5px;
    }
    .st-rh-meta-grid {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 7px 12px;
      font-size: 12px;
      line-height: 1.5;
      background: rgba(0, 0, 0, 0.3);
      padding: 12px;
      border: 1px solid rgba(197, 160, 89, 0.15);
      border-radius: 8px;
      overflow: visible;
    }
    .st-rh-meta-label {
      color: var(--rh-text-dim);
      text-align: right;
      white-space: nowrap;
    }
    .st-rh-meta-value {
      color: var(--rh-text);
      word-break: break-word;
    }
    .st-rh-mono {
      font-family: "JetBrains Mono", "Consolas", monospace;
    }
    .st-rh-result-main {
      margin-top: 16px;
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      gap: 12px;
      background: linear-gradient(90deg, rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.1));
      padding: 12px;
      border-left: 3px solid var(--status-color, #52c41a);
      border-radius: 8px;
    }
    .st-rh-result-main-left {
      justify-self: start;
    }
    .st-rh-result-main-center {
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .st-rh-result-main-right {
      justify-self: end;
      text-align: right;
      overflow: visible;
    }
    .st-rh-result-kicker {
      font-size: 11px;
      color: var(--rh-text-dim);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .st-rh-result-status {
      font-weight: 700;
      font-size: 16px;
      color: var(--status-color, #52c41a);
      letter-spacing: 1px;
    }
    .st-rh-outcome-box {
      margin-top: 10px;
      padding: 10px;
      border: 1px solid rgba(197, 160, 89, 0.2);
      background: rgba(0, 0, 0, 0.25);
      border-radius: 8px;
    }
    .st-rh-outcome-label {
      font-size: 11px;
      color: var(--rh-text-dim);
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    .st-rh-outcome-text {
      font-size: 13px;
      line-height: 1.7;
      color: var(--rh-title);
    }
    .st-rh-outcome-status-change {
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px dashed rgba(111, 194, 255, 0.45);
      border-radius: 8px;
      background: rgba(10, 26, 38, 0.38);
      font-size: 12px;
      line-height: 1.55;
      color: #b6e0ff;
      word-break: break-word;
    }
    .st-rh-outcome-status-current {
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px dashed rgba(160, 197, 110, 0.42);
      border-radius: 8px;
      background: rgba(28, 42, 20, 0.34);
      font-size: 12px;
      line-height: 1.55;
      color: #d7f0b0;
      word-break: break-word;
    }
    .st-rh-time-limit {
      margin-top: 12px;
      font-size: 11px;
      color: #6b5a45;
      text-align: right;
      font-family: "JetBrains Mono", "Consolas", monospace;
    }
    .st-rh-tip {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: help;
      border-bottom: 1px dotted rgba(255, 223, 163, 0.55);
      color: #e8dcb5;
    }

    @media (max-width: 768px) {
      .st-rh-event-board,
      .st-rh-result-card {
        padding: 12px;
      }
      .st-rh-board-head {
        flex-direction: column;
        align-items: flex-start;
      }
      .st-rh-board-id {
        max-width: 100%;
      }
      .st-rh-board-head-right {
        align-items: flex-start;
        width: 100%;
      }
      .st-rh-event-item {
        padding: 12px;
      }
      .st-rh-event-title {
        font-size: 16px;
      }
      .st-rh-event-id {
        max-width: 100%;
      }
      .st-rh-event-footer {
        flex-direction: column;
        justify-content: center;
      }
      .st-rh-command {
        text-align: center;
      }
      .st-rh-roll-btn {
        width: 100%;
        max-width: 260px;
      }
      .st-rh-result-title {
        font-size: 18px;
      }
      .st-rh-meta-grid {
        grid-template-columns: 1fr;
        gap: 4px;
      }
      .st-rh-meta-label {
        text-align: left;
        margin-top: 8px;
      }
      .st-rh-result-main {
        grid-template-columns: 1fr;
        text-align: center;
      }
      .st-rh-result-main-left,
      .st-rh-result-main-center,
      .st-rh-result-main-right {
        justify-self: center;
        text-align: center;
      }
      .st-rh-time-limit {
        text-align: center;
      }
    }

    @media (max-width: 430px) {
      .st-rh-board-title {
        font-size: 15px;
      }
      .st-rh-event-desc,
      .st-rh-outcome-text {
        font-size: 12px;
      }
      .st-rh-outcome-status-change {
        font-size: 11px;
      }
      .st-rh-outcome-status-current {
        font-size: 11px;
      }
      .st-rh-chip {
        font-size: 10px;
        padding: 3px 7px;
      }
      .st-rh-result-status {
        font-size: 15px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .st-rh-roll-btn {
        transition: none;
      }
      .st-rh-roll-btn:hover {
        transform: none;
      }
    }
  </style>`;
}
