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
    .st-rh-details-card {
      position: relative;
      overflow: hidden;
    }
    .st-rh-details-card > summary {
      list-style: none;
      cursor: pointer;
    }
    .st-rh-details-card > summary::-webkit-details-marker {
      display: none;
    }
    .st-rh-collapse-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid rgba(197, 160, 89, 0.3);
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(46, 31, 24, 0.85), rgba(18, 12, 9, 0.92));
      box-shadow: inset 0 1px 0 rgba(255, 223, 163, 0.08), 0 8px 18px rgba(0, 0, 0, 0.26);
    }
    .st-rh-collapse-summary-result {
      margin-bottom: 2px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: stretch;
      gap: 14px;
    }
    .st-rh-summary-main {
      min-width: 0;
      flex: 1;
    }
    .st-rh-summary-main-result {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .st-rh-collapse-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .st-rh-summary-title {
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      color: var(--rh-accent);
      font-size: 15px;
      letter-spacing: 0.4px;
      font-weight: 700;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .st-rh-summary-id {
      font-size: 11px;
      color: #7d6a50;
      opacity: 0.9;
      flex-shrink: 0;
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .st-rh-summary-meta-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 7px;
    }
    .st-rh-summary-chip {
      display: inline-flex;
      align-items: center;
      border: 1px solid rgba(197, 160, 89, 0.24);
      background: rgba(255, 255, 255, 0.04);
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 11px;
      line-height: 1.45;
      color: #dbc79f;
      max-width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .st-rh-summary-chip-outcome,
    .st-rh-summary-chip-status-summary {
      flex: 0 1 auto;
      width: fit-content;
      min-width: 0;
      max-width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: flex-start;
      overflow: hidden;
      text-overflow: clip;
    }
    .st-rh-summary-chip-marquee {
      display: inline-flex;
      align-items: center;
      min-width: max-content;
      white-space: nowrap;
      will-change: transform;
      animation: none;
    }
    .st-rh-summary-chip.is-marquee .st-rh-summary-chip-marquee {
      animation: st-rh-summary-marquee 14s linear infinite;
    }
    .st-rh-summary-chip.is-marquee:hover .st-rh-summary-chip-marquee {
      animation-play-state: paused;
    }
    .st-rh-summary-chip-marquee-text,
    .st-rh-summary-chip-marquee-gap {
      display: inline-flex;
      align-items: center;
      flex: 0 0 auto;
    }
    @keyframes st-rh-summary-marquee {
      0% {
        transform: translateX(0);
      }
      100% {
        transform: translateX(calc(-50% - 8px));
      }
    }
    .st-rh-summary-meta-row .st-rh-summary-toggle-state {
      margin-left: auto;
      flex: 0 0 auto;
    }
    .st-rh-summary-pill {
      --rh-pill: #52c41a;
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--rh-pill);
      background: rgba(0, 0, 0, 0.24);
      color: var(--rh-pill);
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 11px;
      line-height: 1.4;
      font-weight: 700;
      white-space: nowrap;
    }
    .st-rh-summary-actions {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex-shrink: 0;
    }
    .st-rh-summary-actions-result {
      min-width: 104px;
      align-self: stretch;
      justify-content: flex-end;
      padding-left: 8px;
      border-left: 1px solid rgba(197, 160, 89, 0.18);
    }
    .st-rh-summary-dice {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 54px;
      min-height: 54px;
      border: 1px solid rgba(197, 160, 89, 0.3);
      border-radius: 9px;
      background: rgba(0, 0, 0, 0.22);
      padding: 2px;
      box-shadow: inset 0 1px 0 rgba(255, 223, 163, 0.08);
    }
    .st-rh-summary-dice svg {
      display: block;
      width: 48px;
      height: 48px;
    }
    .st-rh-summary-dice-large {
      min-width: 76px;
      min-height: 76px;
      padding: 4px;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(18, 12, 9, 0.92), rgba(0, 0, 0, 0.28));
      box-shadow: inset 0 1px 0 rgba(255, 223, 163, 0.12), 0 10px 20px rgba(0, 0, 0, 0.28);
    }
    .st-rh-summary-dice-large svg {
      width: 66px;
      height: 66px;
    }
    .st-rh-summary-footer-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      margin-top: 10px;
    }
    .st-rh-summary-toggle-state {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      white-space: nowrap;
      user-select: none;
    }
    .st-rh-roll-btn,
    .st-rh-summary-toggle-state {
      border: 1px solid #c5a059;
      background: linear-gradient(135deg, #3a2515, #1a100a);
      color: var(--rh-accent);
      border-radius: 8px;
      min-height: 28px;
      padding: 4px 10px;
      font-family: "Noto Serif SC", "STSong", "Georgia", serif;
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.4px;
      line-height: 1;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
      transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, filter 0.2s ease;
      text-transform: uppercase;
    }
    .st-rh-roll-btn {
      cursor: pointer;
    }
    .st-rh-summary-toggle-state {
      cursor: pointer;
    }
    .st-rh-roll-btn:hover,
    .st-rh-details-card:hover .st-rh-summary-toggle-state {
      border-color: #efd392;
      filter: brightness(1.08);
      transform: translateY(-1px);
      box-shadow: 0 6px 12px rgba(0, 0, 0, 0.36);
    }
    .st-rh-runtime-inline {
      margin: 0;
      white-space: nowrap;
    }
    .st-rh-summary-lock {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 30px;
      min-width: 72px;
      padding: 4px 9px;
      border: 1px dashed rgba(197, 160, 89, 0.36);
      border-radius: 8px;
      color: #a89472;
      background: rgba(18, 11, 8, 0.5);
      font-size: 11px;
    }
    .st-rh-summary-toggle-icon {
      display: inline-flex;
      transition: transform 0.2s ease;
      line-height: 1;
      font-size: 11px;
      opacity: 0.9;
    }
    .st-rh-toggle-open {
      display: none;
    }
    .st-rh-details-card[open] .st-rh-toggle-open {
      display: inline;
    }
    .st-rh-details-card[open] .st-rh-toggle-closed {
      display: none;
    }
    .st-rh-details-card[open] .st-rh-summary-toggle-icon {
      transform: rotate(180deg);
    }
    .st-rh-card-details-body {
      margin-top: 12px;
      display: none;
      animation: st-rh-details-reveal 0.2s ease;
    }
    .st-rh-details-card[open] > .st-rh-card-details-body {
      display: block;
    }
    @keyframes st-rh-details-reveal {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
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
    .st-rh-result-details .st-rh-result-head {
      margin-bottom: 12px;
    }
    .st-rh-result-details .st-rh-result-title {
      margin-bottom: 12px;
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
    .st-rh-result-head-centered {
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      gap: 4px;
    }
    .st-rh-result-head-centered .st-rh-result-id {
      text-align: center;
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
    .st-rh-details-result .st-rh-result-main {
      grid-template-columns: 1fr;
      text-align: center;
      gap: 10px;
    }
    .st-rh-details-result .st-rh-result-main-left,
    .st-rh-details-result .st-rh-result-main-center,
    .st-rh-details-result .st-rh-result-main-right {
      justify-self: center;
      text-align: center;
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
    .st-rh-already-card {
      border-left: 3px solid rgba(197, 160, 89, 0.58);
    }
    .st-rh-already-details .st-rh-result-head {
      margin-bottom: 8px;
      padding-bottom: 8px;
    }
    .st-rh-already-stack {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 10px;
      font-size: 13px;
      line-height: 1.6;
      color: #c8b796;
    }
    .st-rh-already-line {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .st-rh-already-line-condition {
      padding-top: 6px;
      border-top: 1px solid rgba(197, 160, 89, 0.18);
    }
    .st-rh-already-label {
      color: #8f7a58;
      white-space: nowrap;
    }
    .st-rh-already-dc-reason {
      color: #c8d6a1;
      font-size: 12px;
      line-height: 1.5;
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
        padding: 10px;
      }
      .st-rh-board-head {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 12px;
        padding-bottom: 8px;
      }
      .st-rh-board-id {
        max-width: 100%;
      }
      .st-rh-board-head-right {
        align-items: flex-start;
        width: 100%;
      }
      .st-rh-event-item {
        padding: 10px;
        margin-bottom: 12px;
      }
      .st-rh-collapse-summary {
        gap: 7px;
        padding: 8px 9px;
        border-radius: 9px;
      }
      .st-rh-collapse-summary-result {
        grid-template-columns: minmax(0, 1fr) 86px;
        align-items: stretch;
        gap: 10px;
      }
      .st-rh-summary-title {
        font-size: 13px;
        line-height: 1.35;
      }
      .st-rh-summary-id {
        max-width: 100%;
        font-size: 10px;
      }
      .st-rh-summary-meta-row {
        gap: 5px;
        margin-top: 5px;
      }
      .st-rh-summary-chip,
      .st-rh-summary-pill {
        padding: 2px 7px;
        min-height: 24px;
        font-size: 10px;
      }
      .st-rh-summary-chip-outcome {
        max-width: min(100%, 300px);
      }
      .st-rh-summary-actions {
        width: 100%;
        justify-content: space-between;
        gap: 6px;
      }
      .st-rh-summary-actions-result {
        width: auto;
        min-width: 86px;
        padding-left: 6px;
      }
      .st-rh-summary-dice {
        min-width: 42px;
        min-height: 42px;
        padding: 1px;
        border-radius: 8px;
      }
      .st-rh-summary-dice svg {
        width: 36px;
        height: 36px;
      }
      .st-rh-summary-dice-large {
        min-width: 68px;
        min-height: 68px;
        padding: 3px;
      }
      .st-rh-summary-dice-large svg {
        width: 58px;
        height: 58px;
      }
      .st-rh-runtime-inline {
        flex: 1 1 auto;
      }
      .st-rh-summary-toggle-state {
        min-height: 24px;
        padding: 3px 8px;
        font-size: 11px;
        letter-spacing: 0.4px;
      }
      .st-rh-summary-footer-row {
        margin-top: 8px;
      }
      .st-rh-event-title {
        font-size: 15px;
      }
      .st-rh-event-id {
        max-width: 100%;
      }
      .st-rh-event-footer {
        flex-direction: column;
        justify-content: center;
        gap: 8px;
        margin-top: 10px;
        padding-top: 10px;
      }
      .st-rh-command {
        text-align: center;
      }
      .st-rh-roll-btn {
        width: auto;
        max-width: 220px;
        min-height: 30px;
        padding: 5px 11px;
        font-size: 11px;
      }
      .st-rh-card-details-body {
        margin-top: 8px;
      }
      .st-rh-result-details .st-rh-result-head {
        margin-bottom: 8px;
      }
      .st-rh-result-head {
        gap: 6px;
        padding-bottom: 8px;
      }
      .st-rh-result-title {
        margin-bottom: 8px;
        font-size: 16px;
      }
      .st-rh-meta-grid {
        grid-template-columns: 66px minmax(0, 1fr);
        gap: 5px 8px;
        padding: 9px 10px;
        font-size: 11px;
        line-height: 1.4;
      }
      .st-rh-meta-label {
        text-align: left;
        margin-top: 0;
        white-space: normal;
        font-size: 10px;
        line-height: 1.35;
      }
      .st-rh-meta-value {
        min-width: 0;
        font-size: 11px;
        line-height: 1.45;
      }
      .st-rh-result-main {
        grid-template-columns: 1fr;
        text-align: center;
        gap: 8px;
        margin-top: 10px;
        padding: 10px;
      }
      .st-rh-result-main-left,
      .st-rh-result-main-center,
      .st-rh-result-main-right {
        justify-self: center;
        text-align: center;
      }
      .st-rh-result-kicker {
        margin-bottom: 2px;
        font-size: 10px;
      }
      .st-rh-result-status {
        font-size: 14px;
      }
      .st-rh-outcome-box {
        margin-top: 8px;
        padding: 8px 9px;
      }
      .st-rh-outcome-label {
        margin-bottom: 4px;
      }
      .st-rh-outcome-text,
      .st-rh-outcome-status-change,
      .st-rh-outcome-status-current {
        line-height: 1.5;
      }
      .st-rh-time-limit {
        text-align: center;
        margin-top: 8px;
      }
    }

    @media (max-width: 430px) {
      .st-rh-event-board,
      .st-rh-result-card {
        padding: 8px;
        border-radius: 10px;
      }
      .st-rh-board-title {
        font-size: 14px;
        letter-spacing: 1px;
      }
      .st-rh-collapse-summary {
        gap: 6px;
        padding: 7px 8px;
      }
      .st-rh-collapse-summary-result {
        grid-template-columns: minmax(0, 1fr) 76px;
        gap: 8px;
      }
      .st-rh-collapse-title-row {
        gap: 6px;
      }
      .st-rh-summary-title {
        font-size: 12px;
      }
      .st-rh-summary-id {
        font-size: 9px;
      }
      .st-rh-summary-meta-row {
        gap: 4px;
        margin-top: 4px;
      }
      .st-rh-summary-chip,
      .st-rh-summary-pill {
        padding: 2px 6px;
        min-height: 22px;
        border-radius: 999px;
      }
      .st-rh-summary-chip-outcome {
        max-width: min(100%, 240px);
      }
      .st-rh-summary-actions {
        align-items: center;
      }
      .st-rh-summary-actions-result {
        min-width: 76px;
        padding-left: 4px;
      }
      .st-rh-summary-dice {
        min-width: 38px;
        min-height: 38px;
      }
      .st-rh-summary-dice svg {
        width: 32px;
        height: 32px;
      }
      .st-rh-summary-dice-large {
        min-width: 60px;
        min-height: 60px;
        padding: 2px;
        border-radius: 10px;
      }
      .st-rh-summary-dice-large svg {
        width: 52px;
        height: 52px;
      }
      .st-rh-summary-toggle-state {
        min-height: 22px;
        padding: 2px 7px;
        font-size: 9px;
      }
      .st-rh-result-heading {
        font-size: 14px;
      }
      .st-rh-result-id {
        font-size: 10px;
      }
      .st-rh-result-title {
        margin-bottom: 7px;
        font-size: 14px;
      }
      .st-rh-event-desc,
      .st-rh-outcome-text {
        font-size: 11px;
        line-height: 1.45;
      }
      .st-rh-outcome-status-change {
        font-size: 11px;
      }
      .st-rh-outcome-status-current {
        font-size: 11px;
      }
      .st-rh-meta-grid {
        grid-template-columns: 58px minmax(0, 1fr);
        gap: 4px 7px;
        padding: 8px;
      }
      .st-rh-chip {
        font-size: 10px;
        padding: 2px 6px;
      }
      .st-rh-meta-label {
        font-size: 9px;
      }
      .st-rh-meta-value {
        font-size: 10.5px;
      }
      .st-rh-result-main {
        gap: 6px;
        margin-top: 8px;
        padding: 8px;
      }
      .st-rh-result-status {
        font-size: 13px;
      }
      .st-rh-outcome-box {
        margin-top: 7px;
        padding: 7px 8px;
      }
      .st-rh-time-limit {
        font-size: 10px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .st-rh-roll-btn {
        transition: none;
      }
      .st-rh-roll-btn:hover {
        transform: none;
      }
      .st-rh-summary-toggle-state {
        transition: none;
      }
      .st-rh-summary-toggle-icon,
      .st-rh-card-details-body {
        transition: none;
        animation: none;
      }
    }
  </style>`;
}
