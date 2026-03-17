import { buildSharedCheckboxStyles } from "../../../_Components/sharedCheckbox";
import { buildSharedBoxCheckboxStyles } from "../../../_Components/sharedBoxCheckbox";
import { buildSharedButtonStyles } from "../../../_Components/sharedButton";
import { buildChangelogStyles } from "../../../_Components/changelog";
import { buildSharedInputStyles } from "../../../_Components/sharedInput";
import { buildSharedSelectStyles } from "../../../_Components/sharedSelect";
import { buildSettingPageStyles } from "../../../_Components/Setting";
import { buildThemeVars } from "../../../SDK/theme";

export function buildSettingsCardStylesTemplateEvent(cardId: string): string {
  return `
    ${buildSettingPageStyles(`#${cardId}`)}
    ${buildChangelogStyles(`#${cardId}`)}

    #${cardId} {
      margin-bottom: 5px;
      color: inherit;
    }


    ${buildThemeVars(`#${cardId} .st-roll-content, #${cardId} .st-roll-skill-modal, #${cardId} .st-roll-status-modal`)}

    #${cardId} .st-roll-shell {
      border: 0;
      border-radius: 0;
      overflow: visible;
      background: transparent;
      backdrop-filter: none;
    }

    #${cardId} .st-roll-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      cursor: pointer;
      user-select: none;
    }

    #${cardId} .st-roll-head-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 700;
    }

    #${cardId} .st-roll-head-badge {
      color: inherit;
      opacity: 0.8;
      font-size: 0.8em;
      font-weight: 500;
      letter-spacing: 0.02em;
    }

    #${cardId} .st-roll-head .inline-drawer-icon {
      transition: transform 0.2s ease;
    }

    #${cardId} .st-roll-content {
      border-top: 1px solid var(--ss-theme-border);
      padding: 10px;
      display: block;
      color: var(--ss-theme-text);
      background: var(--ss-theme-surface-2);
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
      border: 1px solid var(--ss-theme-border);
      border-radius: 999px;
      margin-bottom: 10px;
      background: var(--ss-theme-surface-2);
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
      color: var(--ss-theme-text);
      background: var(--ss-theme-list-item-active-bg);
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
      background: var(--ss-theme-border);
    }

    #${cardId} .st-roll-item {
      border: 1px solid var(--ss-theme-border);
      border-radius: 10px;
      padding: 12px;
      margin: 2px 0;
      background: var(--ss-theme-surface-2);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      transition:
        border-color 0.2s ease,
        background-color 0.2s ease,
        box-shadow 0.2s ease;
    }

    #${cardId} .st-roll-item-stack {
      flex-direction: column;
      align-items: stretch;
    }

    #${cardId} .st-roll-item-main {
      min-width: 0;
      flex: 1;
    }

    #${cardId} .st-roll-item-title {
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 5px;
    }

    #${cardId} .st-roll-item-desc {
      font-size: 11px;
      line-height: 1.45;
      opacity: 0.7;
    }

    #${cardId} .st-roll-ai-bridge-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      font-size: 12px;
      opacity: 0.9;
    }

    #${cardId} .st-roll-ai-bridge-light {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #d75a5a;
      box-shadow: 0 0 0 3px rgba(215, 90, 90, 0.18);
    }

    #${cardId} .st-roll-ai-bridge-light.is-online {
      background: #57d36a;
      box-shadow: 0 0 0 3px rgba(87, 211, 106, 0.2);
    }

    #${cardId} .st-roll-ai-bridge-light.is-checking {
      background: #d7bf5a;
      box-shadow: 0 0 0 3px rgba(215, 191, 90, 0.2);
    }


    #${cardId} .st-roll-about-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px 24px;
      width: 100%;
      min-width: 0;
    }

    #${cardId} .st-roll-about-meta-item {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
      white-space: normal;
    }

    #${cardId} .st-roll-about-meta-item > span {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
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
      overflow-wrap: anywhere;
      word-break: break-word;
      transition: border-color 0.2s ease, text-shadow 0.2s ease;
    }

    #${cardId} .st-roll-about-meta a:hover {
      border-bottom-color: rgba(255, 255, 255, 0.5);
      text-shadow: 0 0 8px rgba(255, 255, 255, 0.22);
    }

    #${cardId} .st-roll-about-item {
      display: block;
    }

    #${cardId} .st-roll-about-logo {
      display: block;
      width: min(240px, 100%);
      height: auto;
      margin: 0 auto 14px;
      object-fit: contain;
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

    #${cardId} .st-roll-changelog-item {
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      margin-bottom: 12px;
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
      grid-template-columns:
        var(--st-roll-skill-col-name)
        var(--st-roll-skill-col-modifier)
        var(--st-roll-skill-col-actions);
      gap: 10px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.72;
      margin-bottom: 4px;
      padding: 0 2px;
      align-items: center;
      min-width: calc(var(--st-roll-skill-col-name) + var(--st-roll-skill-col-modifier) + var(--st-roll-skill-col-actions) + 20px);
    }

    #${cardId} .st-roll-skill-col-head {
      position: relative;
      display: block;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding-right: 8px;
    }

    #${cardId} .st-roll-skill-col-head[data-skill-col-key="modifier"],
    #${cardId} .st-roll-skill-col-head[data-skill-col-key="actions"] {
      text-align: center;
    }

    #${cardId} .st-roll-skill-col-resizer {
      position: absolute;
      top: 0;
      right: -4px;
      bottom: 0;
      width: 8px;
      cursor: col-resize;
      user-select: none;
      background: transparent;
    }

    #${cardId} .st-roll-skill-col-resizer::before {
      content: "";
      position: absolute;
      top: 14%;
      bottom: 14%;
      left: 50%;
      width: 1px;
      transform: translateX(-50%);
      background: rgba(255, 255, 255, 0.24);
    }

    #${cardId} .st-roll-skill-col-resizer:hover,
    #${cardId} .st-roll-skill-col-resizer.is-resizing {
      background: rgba(197, 160, 89, 0.55);
    }

    #${cardId} .st-roll-skill-col-resizer:hover::before,
    #${cardId} .st-roll-skill-col-resizer.is-resizing::before {
      background: rgba(255, 236, 201, 0.72);
    }

    #${cardId} .st-roll-skill-rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${cardId} .st-roll-skill-row {
      display: grid;
      grid-template-columns:
        var(--st-roll-skill-col-name)
        var(--st-roll-skill-col-modifier)
        var(--st-roll-skill-col-actions);
      gap: 10px;
      align-items: center;
      min-width: calc(var(--st-roll-skill-col-name) + var(--st-roll-skill-col-modifier) + var(--st-roll-skill-col-actions) + 20px);
    }

    #${cardId} .st-roll-skill-name,
    #${cardId} .st-roll-skill-modifier {
      width: 100%;
    }

    #${cardId} .st-roll-skill-modifier {
      text-align: center;
      justify-self: stretch;
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
      background: var(--ss-theme-backdrop);
      backdrop-filter: var(--ss-theme-backdrop-filter);
    }

    #${cardId} .st-roll-skill-modal-backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--ss-theme-backdrop) 55%, transparent);
      backdrop-filter: var(--ss-theme-backdrop-filter);
    }

    #${cardId} .st-roll-skill-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: min(1460px, 96vw);
      height: min(96vh, 920px);
      margin: 0;
      border: 1px solid var(--ss-theme-panel-border);
      border-radius: 14px;
      overflow: hidden;
      background: var(--ss-theme-panel-bg);
      box-shadow: var(--ss-theme-panel-shadow);
      --st-roll-skill-col-name: 280px;
      --st-roll-skill-col-modifier: 84px;
      --st-roll-skill-col-actions: 124px;
    }

    #${cardId} .st-roll-skill-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-toolbar-bg);
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

    #${cardId} .st-roll-skill-preset-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
    }

    #${cardId} .st-roll-skill-preset-toolbar .st-roll-skill-preset-search {
      width: 100%;
      min-width: 0;
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
      min-width: 0;
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

    #${cardId} .st-roll-skill-preset-name-marquee {
      display: block;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    #${cardId} .st-roll-skill-preset-name-marquee.is-overflowing {
      mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
    }

    #${cardId} .st-roll-skill-preset-name-track {
      display: inline-flex;
      align-items: center;
      min-width: max-content;
      width: max-content;
      max-width: none;
      transform: translateX(0);
      will-change: transform;
    }

    #${cardId} .st-roll-skill-preset-name-marquee.is-overflowing .st-roll-skill-preset-name-track {
      animation: st-roll-skill-preset-marquee var(--st-roll-preset-marquee-duration, 8s) ease-in-out infinite alternate;
    }

    #${cardId} .st-roll-skill-preset-name {
      display: inline-flex;
      align-items: center;
      min-width: max-content;
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

    @keyframes st-roll-skill-preset-marquee {
      0% {
        transform: translateX(0);
      }

      12% {
        transform: translateX(0);
      }

      88% {
        transform: translateX(var(--st-roll-preset-marquee-distance, 0px));
      }

      100% {
        transform: translateX(var(--st-roll-preset-marquee-distance, 0px));
      }
    }

    #${cardId} .st-roll-skill-rename-row {
      justify-content: flex-start;
      gap: 8px;
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
      background: var(--ss-theme-backdrop);
      backdrop-filter: var(--ss-theme-backdrop-filter);
    }

    #${cardId} .st-roll-status-modal-backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--ss-theme-backdrop) 70%, transparent);
      backdrop-filter: var(--ss-theme-backdrop-filter);
      opacity: 1;
      transition: opacity 0.24s ease;
    }

    #${cardId} .st-roll-skill-modal[data-ss-theme="host"] .st-roll-skill-modal-backdrop,
    #${cardId} .st-roll-status-modal[data-ss-theme="host"] .st-roll-status-modal-backdrop {
      background: color-mix(in srgb, var(--ss-theme-backdrop) 55%, transparent);
      backdrop-filter: var(--ss-theme-backdrop-filter);
    }

    #${cardId} .st-roll-status-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: max(1220px, 90vw);
      height: max(85vh, 860px);
      margin: 0;
      border: 1px solid var(--ss-theme-panel-border);
      border-radius: 14px;
      overflow: hidden;
      background: var(--ss-theme-panel-bg);
      box-shadow: var(--ss-theme-panel-shadow);
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
      border-bottom: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-toolbar-bg);
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

    #${cardId} .st-roll-status-chat-name-marquee {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    #${cardId} .st-roll-status-chat-name-marquee.is-overflowing {
      mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
      -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
    }

    #${cardId} .st-roll-status-chat-name-track {
      display: inline-flex;
      align-items: center;
      min-width: max-content;
      width: max-content;
      max-width: none;
      transform: translateX(0);
      will-change: transform;
    }

    #${cardId} .st-roll-status-chat-name-marquee.is-overflowing .st-roll-status-chat-name-track {
      animation: st-roll-status-chat-marquee var(--st-roll-status-chat-marquee-duration, 8s) ease-in-out infinite alternate;
    }

    #${cardId} .st-roll-status-chat-name {
      font-size: 13px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      min-width: max-content;
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

    @keyframes st-roll-status-chat-marquee {
      0% {
        transform: translateX(0);
      }

      12% {
        transform: translateX(0);
      }

      88% {
        transform: translateX(var(--st-roll-status-chat-marquee-distance, 0px));
      }

      100% {
        transform: translateX(var(--st-roll-status-chat-marquee-distance, 0px));
      }
    }

    #${cardId} .st-roll-status-splitter {
      cursor: col-resize;
      user-select: none;
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

    #${cardId} .st-roll-status-mobile-sheet-head {
      display: none;
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

    #${cardId} .st-roll-status-cols span:nth-child(1),
    #${cardId} .st-roll-status-cols span:nth-child(2),
    #${cardId} .st-roll-status-cols span:nth-child(3),
    #${cardId} .st-roll-status-cols span:nth-child(4),
    #${cardId} .st-roll-status-cols span:nth-child(5),
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

    #${cardId} .st-roll-status-field {
      display: contents;
    }

    #${cardId} .st-roll-status-field-label {
      display: none;
    }

    #${cardId} .st-roll-status-field-content {
      display: contents;
      min-width: 0;
    }

    #${cardId} .st-roll-status-field-content > * {
      min-width: 0;
    }

    #${cardId} .st-roll-status-bottom-grid {
      display: contents;
    }

    #${cardId} .st-roll-status-row .st-roll-status-name-wrap,
    #${cardId} .st-roll-status-row .st-roll-status-enabled-wrap,
    #${cardId} .st-roll-status-row .st-roll-status-actions-group {
      min-height: 36px;
    }

    #${cardId} .st-roll-status-enabled-card {
      display: flex;
      align-items: stretch;
      min-height: 36px;
      padding: 0;
      border-radius: 0;
      border: 0;
      background: transparent;
      box-sizing: border-box;
    }

    #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-body {
      min-height: 34px;
    }

    #${cardId} .st-roll-status-col-head[data-status-col-key="enabled"] {
      text-align: center;
    }

    #${cardId} .st-roll-status-col-head[data-status-col-key="actions"] {
      text-align: center;
    }

    #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-copy,
    #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-title {
      display: none;
    }

    #${cardId} .st-roll-status-field-enabled .st-roll-status-field-content {
      justify-content: center;
    }

    #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-body {
      justify-content: center;
    }

    #${cardId} .st-roll-status-row .st-roll-status-actions-group {
      justify-self: center;
      justify-content: center;
    }

    #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-title {
      font-size: 12px;
      line-height: 1.2;
    }

    #${cardId} .st-roll-status-row .st-roll-status-name-wrap {
      width: 100%;
      align-self: stretch;
    }

    #${cardId} .st-roll-status-row .st-roll-status-name,
    #${cardId} .st-roll-status-row .st-roll-status-modifier,
    #${cardId} .st-roll-status-row .st-roll-status-duration,
    #${cardId} .st-roll-status-row .st-roll-status-skills {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      height: 36px;
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
      min-height: 36px;
      padding: 0 10px;
      font-size: 12px;
      opacity: 0.9;
      user-select: none;
      box-sizing: border-box;
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
      margin: 0;
    }

    #${cardId} .st-roll-status-error-item {
      font-size: 12px;
      line-height: 1.45;
      color: #ffd2d2;
    }

    #${cardId} .st-roll-status-dirty {
      margin: 0;
      min-height: 28px;
      font-size: 12px;
      line-height: 1.4;
      color: #ffe0a6;
      display: flex;
      align-items: center;
    }

    #${cardId} .st-roll-status-footer {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-top: 10px;
    }

    #${cardId} .st-roll-tip {
      font-size: 12px;
      line-height: 1.5;
      opacity: 0.78;
      padding-top: 4px;
    }

    ${buildSharedCheckboxStyles(`#${cardId}`)}
    ${buildSharedBoxCheckboxStyles(`#${cardId}`)}
    ${buildSharedButtonStyles(`#${cardId}`)}
    ${buildSharedInputStyles(`#${cardId}`)}
    ${buildSharedSelectStyles(`#${cardId}`)}

    #${cardId} input[type="checkbox"] {
      accent-color: var(--ss-theme-accent);
      transition: filter 0.2s ease;
    }

    #${cardId} .st-roll-tab:hover {
      opacity: 1;
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-item:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-textarea-wrap:hover {
      border-color: var(--ss-theme-border-strong);
      box-shadow: none;
    }

    #${cardId} .st-roll-btn:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-shell {
      color: inherit;
      border-color: transparent;
      background: transparent;
      backdrop-filter: none;
    }

    #${cardId} .st-roll-content {
      border-top-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-tabs {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-tab.is-active {
      color: var(--ss-theme-text);
      background: var(--ss-theme-list-item-active-bg);
    }

    #${cardId} .st-roll-divider-line {
      background: var(--ss-theme-border);
    }

    #${cardId} .st-roll-item {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-about-meta a {
      border-bottom-color: var(--ss-theme-border);
    }

    #${cardId} .st-roll-btn {
      color: var(--ss-theme-text);
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-3);
      --stx-button-text: var(--ss-theme-text);
      --stx-button-border: var(--ss-theme-border);
      --stx-button-bg: var(--ss-theme-surface-3);
      --stx-button-hover-border: var(--ss-theme-border-strong);
      --stx-button-hover-bg: var(--ss-theme-list-item-hover-bg);
      --stx-button-hover-shadow: none;
    }

    #${cardId} .st-roll-btn.secondary {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
      --stx-button-border: var(--ss-theme-border);
      --stx-button-bg: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-btn.danger {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
      --stx-button-border: var(--ss-theme-border);
      --stx-button-bg: var(--ss-theme-surface-2);
      --stx-button-hover-border: var(--ss-theme-border-strong);
      --stx-button-hover-bg: var(--ss-theme-list-item-hover-bg);
      --stx-button-hover-shadow: none;
    }

    #${cardId} .st-roll-textarea-wrap,
    #${cardId} .st-roll-skill-presets,
    #${cardId} .st-roll-status-layout {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-skill-modal-panel,
    #${cardId} .st-roll-status-modal-panel {
      border-color: var(--ss-theme-panel-border);
      background: var(--ss-theme-panel-bg);
      box-shadow: var(--ss-theme-panel-shadow);
    }

    #${cardId} .st-roll-skill-modal-head,
    #${cardId} .st-roll-status-modal-head {
      border-bottom-color: var(--ss-theme-border);
      background: var(--ss-theme-toolbar-bg);
    }

    #${cardId} .st-roll-status-layout {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-status-sidebar {
      border-right-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-2);
    }

    #${cardId} .st-roll-status-sidebar-head {
      border-bottom-color: var(--ss-theme-border);
      background: var(--ss-theme-toolbar-bg);
    }

    #${cardId} .st-roll-status-chat-item,
    #${cardId} .st-roll-skill-preset-item {
      border-color: var(--ss-theme-border);
      background: var(--ss-theme-surface-3);
    }

    #${cardId} .st-roll-status-chat-item:hover,
    #${cardId} .st-roll-skill-preset-item:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
    }

    #${cardId} .st-roll-status-chat-item.is-active,
    #${cardId} .st-roll-skill-preset-item.is-active {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-active-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-status-splitter {
      user-select: none;
      background: var(--ss-theme-surface-2);
      border-left-color: var(--ss-theme-border);
      border-right-color: var(--ss-theme-border);
    }

    #${cardId} .st-roll-status-splitter:hover,
    #${cardId} .st-roll-status-splitter.is-resizing {
      background: var(--ss-theme-list-item-hover-bg);
    }

    #${cardId} .st-roll-skill-modal::backdrop,
    #${cardId} .st-roll-status-modal::backdrop {
      background: var(--ss-theme-backdrop);
      backdrop-filter: var(--ss-theme-backdrop-filter);
    }

    #${cardId} .stx-shared-box-checkbox {
      --stx-box-checkbox-border: color-mix(in srgb, var(--ss-theme-accent) 52%, var(--ss-theme-border));
      --stx-box-checkbox-bg: color-mix(in srgb, var(--ss-theme-surface-3) 92%, transparent);
      --stx-box-checkbox-hover-border: color-mix(in srgb, var(--ss-theme-accent) 72%, #fff 10%);
      --stx-box-checkbox-focus-ring: color-mix(in srgb, var(--ss-theme-accent) 24%, transparent);
      --stx-box-checkbox-checked-border: color-mix(in srgb, var(--ss-theme-accent) 84%, #fff 8%);
      --stx-box-checkbox-checked-bg: color-mix(in srgb, var(--ss-theme-accent) 24%, var(--ss-theme-surface-3));
      --stx-box-checkbox-indicator: var(--ss-theme-accent-contrast);
    }

    #${cardId} .st-roll-tab:hover {
      opacity: 1;
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-item:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-input:hover,
    #${cardId} .st-roll-search:hover,
    #${cardId} .st-roll-textarea:hover {
      border-color: var(--ss-theme-border-strong);
      background-color: var(--ss-theme-surface-3);
      box-shadow: 0 0 0 1px var(--ss-theme-focus-ring);
    }

    #${cardId} .st-roll-textarea-wrap:hover {
      border-color: var(--ss-theme-border-strong);
      box-shadow: none;
    }

    #${cardId} .st-roll-btn:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-btn.danger:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-input:focus,
    #${cardId} .st-roll-search:focus,
    #${cardId} .st-roll-textarea:focus {
      outline: none;
      border-color: var(--ss-theme-border-strong);
      box-shadow: 0 0 0 2px var(--ss-theme-focus-ring);
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-input.text_pole,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-search.text_pole,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-textarea.text_pole {
      margin: 0;
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-tab.menu_button,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-btn.menu_button {
      margin: 0;
      width: auto;
      min-height: 30px;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-tab.menu_button {
      flex: 1;
      min-width: 0;
      border-radius: 999px;
      padding: 6px 10px;
      filter: grayscale(0.15);
      opacity: 0.85;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-tab.menu_button.is-active,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-tab.menu_button.active {
      opacity: 1;
      filter: none;
      background-color: var(--white30a, rgba(255, 255, 255, 0.3));
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-btn.menu_button {
      padding: 3px 8px;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-input.text_pole:hover,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-search.text_pole:hover,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-textarea.text_pole:hover {
      border-color: var(--ss-theme-border);
      background-color: var(--black30a, rgba(0, 0, 0, 0.3));
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-input.text_pole:focus,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-search.text_pole:focus,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-textarea.text_pole:focus {
      border-color: var(--ss-theme-border);
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-tab.menu_button:hover,
    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-btn.menu_button:hover {
      border-color: var(--ss-theme-border);
      background-color: var(--white30a, rgba(255, 255, 255, 0.3));
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-ss-theme="host"] .st-roll-btn.danger.menu_button:hover {
      border-color: var(--ss-theme-border-strong);
      background: var(--ss-theme-list-item-hover-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-workbench {
      --st-roll-status-sidebar-width: 276px;
      display: grid;
      height: 100%;
      border: 1px solid var(--ss-theme-border);
      border-radius: 14px;
      background: var(--ss-theme-surface-2);
      overflow: hidden;
    }

    #${cardId} .st-roll-workbench-sidebar,
    #${cardId} .st-roll-workbench-main {
      min-width: 0;
      min-height: 0;
    }

    #${cardId} .st-roll-workbench-sidebar {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 10px;
      background: var(--ss-theme-surface-3);
      border-right: 1px solid var(--ss-theme-border);
    }

    #${cardId} .st-roll-workbench-main {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      background: linear-gradient(180deg, var(--ss-theme-surface-3), transparent 100%);
    }

    #${cardId} .st-roll-workbench-context,
    #${cardId} .st-roll-workbench-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 10px 12px;
      border: 1px solid var(--ss-theme-border);
      border-radius: 12px;
      background: var(--ss-theme-toolbar-bg);
    }

    #${cardId} .st-roll-workbench-context {
      align-items: flex-start;
      justify-content: space-between;
    }

    #${cardId} .st-roll-status-context {
      display: grid;
      grid-template-columns: minmax(240px, auto) minmax(0, 1fr);
      align-items: center;
      gap: 6px 14px;
      padding: 8px 12px;
      min-height: 0;
    }

    #${cardId} .st-roll-status-context .st-roll-workbench-head-copy {
      gap: 2px;
    }

    #${cardId} .st-roll-status-context .st-roll-field-label {
      font-size: 14px;
      line-height: 1.2;
    }

    #${cardId} .st-roll-status-context .st-roll-status-chat-meta {
      font-size: 11px;
      line-height: 1.25;
    }

    #${cardId} .st-roll-status-context .st-roll-tip {
      padding-top: 0;
      margin: 0;
      font-size: 11px;
      line-height: 1.35;
      text-align: right;
      opacity: 0.72;
    }

    #${cardId} .st-roll-workbench-sidebar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 12px;
      border: 1px solid var(--ss-theme-border);
      border-radius: 12px;
      background: var(--ss-theme-toolbar-bg);
    }

    #${cardId} .st-roll-workbench-sidebar-copy,
    #${cardId} .st-roll-workbench-head-copy {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }

    #${cardId} .st-roll-workbench-subtitle,
    #${cardId} .st-roll-workbench-selection {
      font-size: 12px;
      line-height: 1.4;
      color: var(--ss-theme-text-muted);
    }

    #${cardId} .st-roll-workbench-selection {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-list-item-hover-bg);
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-selection-count {
      min-height: 28px;
      padding: 0 8px;
      font-size: 11px;
    }

    #${cardId} .st-roll-inline-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-surface-3);
      cursor: pointer;
      user-select: none;
    }

    #${cardId} .st-roll-status-toolbar {
      gap: 6px;
      padding: 8px 10px;
    }

    #${cardId} .st-roll-status-toolbar .st-roll-inline-toggle {
      min-height: 28px;
      padding: 0 8px;
      gap: 6px;
      font-size: 12px;
    }

    #${cardId} .st-roll-toolbar-icon-btn {
      width: 28px;
      min-width: 28px;
      min-height: 28px;
      padding: 0;
      border-radius: 8px;
      gap: 0;
      flex: 0 0 auto;
    }

    #${cardId} .st-roll-toolbar-icon-btn .stx-shared-button-label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    #${cardId} .st-roll-toolbar-icon-btn .stx-shared-button-icon {
      width: 14px;
      height: 14px;
      font-size: 13px;
    }

    #${cardId} .st-roll-inline-toggle input[type="checkbox"] {
      margin: 0;
    }

    #${cardId} .st-roll-skill-layout,
    #${cardId} .st-roll-status-layout {
      background: var(--ss-theme-surface-2);
      border-color: var(--ss-theme-border);
    }

    #${cardId} .st-roll-skill-layout {
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    }

    #${cardId} .st-roll-status-layout {
      grid-template-columns: minmax(220px, var(--st-roll-status-sidebar-width)) 8px minmax(0, 1fr);
    }

    #${cardId} .st-roll-skill-presets,
    #${cardId} .st-roll-status-sidebar {
      background: var(--ss-theme-surface-3);
      border-color: var(--ss-theme-border);
    }

    #${cardId} .st-roll-workbench-toolbar-sidebar {
      gap: 6px;
      padding: 8px;
    }

    #${cardId} .st-roll-status-sidebar .st-roll-workbench-toolbar-sidebar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      padding: 8px;
    }

    #${cardId} .st-roll-status-sidebar .st-roll-status-chat-search {
      grid-column: 1 / -1;
    }

    #${cardId} .st-roll-status-sidebar .st-roll-btn {
      min-height: 30px;
      padding: 4px 10px;
    }

    #${cardId} .st-roll-status-sidebar-head {
      padding: 8px 12px;
    }

    #${cardId} .st-roll-status-head-main {
      gap: 2px;
    }

    #${cardId} .st-roll-status-memory-state {
      font-size: 11px;
      line-height: 1.3;
    }

    #${cardId} .st-roll-status-chat-list {
      gap: 6px;
    }

    #${cardId} .st-roll-skill-main {
      overflow-x: auto;
      overflow-y: hidden;
    }

    #${cardId} .st-roll-status-main {
      overflow: hidden;
    }

    #${cardId} .st-roll-skill-preset-list,
    #${cardId} .st-roll-status-chat-list,
    #${cardId} .st-roll-skill-rows,
    #${cardId} .st-roll-status-rows {
      scrollbar-width: thin;
    }

    #${cardId} .st-roll-skill-preset-list,
    #${cardId} .st-roll-status-chat-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
    }

    #${cardId} .st-roll-skill-preset-item,
    #${cardId} .st-roll-status-chat-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px;
      border-radius: 12px;
    }

    #${cardId} .st-roll-skill-preset-item {
      align-items: flex-start;
    }

    #${cardId} .st-roll-skill-preset-name {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
    }

    #${cardId} .st-roll-skill-preset-tags {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    #${cardId} .st-roll-skill-preset-tag {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-size: 11px;
      line-height: 1;
      border: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-list-item-hover-bg);
    }

    #${cardId} .st-roll-skill-preset-tag.active {
      color: var(--ss-theme-accent-contrast);
      background: var(--ss-theme-accent);
      border-color: var(--ss-theme-accent);
    }

    #${cardId} .st-roll-skill-preset-tag.locked {
      background: transparent;
    }

    #${cardId} .st-roll-skill-preset-meta,
    #${cardId} .st-roll-status-memory-state,
    #${cardId} .st-roll-status-chat-meta {
      font-size: 12px;
      line-height: 1.45;
      color: var(--ss-theme-text-muted);
    }

    #${cardId} .st-roll-status-chat-item {
      align-items: stretch;
      gap: 12px;
    }

    #${cardId} .st-roll-status-chat-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1 1 auto;
      text-align: left;
    }

    #${cardId} .st-roll-status-chat-name {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
    }

    #${cardId} .st-roll-status-chat-time,
    #${cardId} .st-roll-status-chat-key,
    #${cardId} .st-roll-status-chat-meta-line {
      font-size: 12px;
      line-height: 1.35;
      color: var(--ss-theme-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${cardId} .st-roll-status-chat-meta-line {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    #${cardId} .st-roll-status-chat-avatar-wrap {
      flex: 0 0 56px;
      width: 56px;
      height: 56px;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid var(--ss-theme-border);
      background: var(--ss-theme-list-item-hover-bg);
    }

    #${cardId} .st-roll-status-chat-avatar,
    #${cardId} .st-roll-status-chat-avatar-fallback {
      width: 100%;
      height: 100%;
    }

    #${cardId} .st-roll-status-chat-avatar {
      object-fit: cover;
      display: block;
    }

    #${cardId} .st-roll-status-chat-avatar-fallback {
      display: grid;
      place-items: center;
      font-size: 26px;
      font-weight: 700;
      color: var(--ss-theme-accent-contrast);
    }

    #${cardId} .st-roll-skill-cols,
    #${cardId} .st-roll-status-cols {
      background: transparent;
      border-bottom: 1px solid var(--ss-theme-border);
      padding-bottom: 8px;
      margin-bottom: 0;
    }

    #${cardId} .st-roll-skill-rows,
    #${cardId} .st-roll-status-rows {
      flex: 1 1 auto;
      min-height: 0;
      padding: 10px;
      border: 1px solid var(--ss-theme-border);
      border-radius: 14px;
      background: var(--ss-theme-surface-3);
    }

    #${cardId} .st-roll-skill-row,
    #${cardId} .st-roll-status-row {
      align-items: stretch;
    }

    #${cardId} .st-roll-skill-name-wrap,
    #${cardId} .st-roll-status-name-wrap {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    #${cardId} .st-roll-skill-name-wrap {
      width: 100%;
    }

    #${cardId} .st-roll-skill-name,
    #${cardId} .st-roll-skill-modifier {
      min-height: 32px;
    }

    #${cardId} .st-roll-skill-name {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
    }

    #${cardId} .st-roll-skill-name {
      font-size: 13px;
    }

    #${cardId} .st-roll-skill-modifier {
      text-align: center;
      font-size: 13px;
      padding-left: 6px;
      padding-right: 6px;
    }

    #${cardId} .st-roll-skill-row-select,
    #${cardId} .st-roll-status-row-select {
      flex: 0 0 auto;
      width: 16px;
      height: 16px;
      margin: 0;
      display: inline-grid;
      place-items: center;
      align-self: center;
      --stx-box-checkbox-size: 16px;
    }

    #${cardId} .st-roll-skill-actions-group,
    #${cardId} .st-roll-status-actions-group {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: nowrap;
    }

    #${cardId} .st-roll-skill-actions-group {
      display: grid;
      grid-template-columns: repeat(4, 28px);
      gap: 4px;
      justify-self: center;
      justify-content: end;
      align-content: center;
    }

    #${cardId} .st-roll-skill-actions-group .st-roll-btn,
    #${cardId} .st-roll-status-actions-group .st-roll-btn {
      min-height: 28px;
      padding: 3px 8px;
      font-size: 12px;
    }

    #${cardId} .st-roll-skill-actions-group .st-roll-btn {
      width: 28px;
      min-width: 28px;
      min-height: 28px;
      padding: 0;
      font-size: 11px;
      line-height: 1;
    }

    #${cardId} .st-roll-status-actions-group {
      justify-content: flex-end;
      display: grid;
      grid-template-columns: repeat(2, 28px);
      gap: 6px;
      align-content: center;
    }

    #${cardId} .st-roll-status-actions-group .st-roll-toolbar-icon-btn {
      width: 28px;
      min-width: 28px;
      min-height: 28px;
      padding: 0;
      line-height: 1;
    }

    #${cardId} .st-roll-skill-empty,
    #${cardId} .st-roll-status-empty {
      display: grid;
      place-items: center;
      min-height: 120px;
      border: 1px dashed var(--ss-theme-border);
      border-radius: 12px;
      background: var(--ss-theme-surface-3);
      color: var(--ss-theme-text-muted);
    }

    @media (max-width: 680px) {
      #${cardId} .st-roll-workbench-toolbar,
      #${cardId} .st-roll-workbench-context,
      #${cardId} .st-roll-workbench-sidebar-head {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .st-roll-workbench-selection,
      #${cardId} .st-roll-inline-toggle {
        width: 100%;
      }

      #${cardId} .st-roll-skill-preset-toolbar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
      }

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
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        overscroll-behavior-y: contain;
      }

      #${cardId} .st-roll-workbench,
      #${cardId} .st-roll-skill-layout {
        height: auto;
        min-height: max-content;
        overflow: visible;
      }

      #${cardId} .st-roll-skill-layout {
        grid-template-columns: 1fr;
      }

      #${cardId} .st-roll-skill-presets {
        min-height: 0;
      }

      #${cardId} .st-roll-skill-main {
        overflow: visible;
        min-height: max-content;
      }

      #${cardId} .st-roll-skill-rows {
        overflow: visible;
      }

      #${cardId} .st-roll-skill-toolbar {
        flex-direction: row;
        align-items: stretch;
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      #${cardId} .st-roll-skill-toolbar .st-roll-skill-row-search,
      #${cardId} .st-roll-skill-toolbar .st-roll-workbench-selection {
        width: 100%;
        min-width: 0;
        flex: 1 1 100%;
      }

      #${cardId} .st-roll-skill-toolbar .st-roll-skill-select-visible,
      #${cardId} .st-roll-skill-toolbar .st-roll-skill-clear-selection,
      #${cardId} .st-roll-skill-toolbar .st-roll-skill-batch-delete {
        min-width: 0;
        flex: 1 1 calc(33.333% - 6px);
      }

      #${cardId} .st-roll-skill-head {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .st-roll-skill-head .st-roll-workbench-head-copy {
        min-width: 0;
      }

      #${cardId} .st-roll-skill-head .st-roll-actions {
        width: 100%;
        flex-wrap: wrap;
        overflow: hidden;
      }

      #${cardId} .st-roll-skill-head .st-roll-actions .st-roll-btn {
        min-width: 0;
        flex: 1 1 calc(50% - 4px);
      }

      #${cardId} .st-roll-skill-actions-group,
      #${cardId} .st-roll-status-actions-group {
        width: 100%;
      }

      #${cardId} .st-roll-skill-cols {
        display: none;
      }

      #${cardId} .st-roll-skill-row {
        grid-template-columns: minmax(0, 1fr) auto;
        grid-template-areas:
          "name name"
          "modifier actions";
        gap: 6px 8px;
        align-items: center;
        min-width: 0;
      }

      #${cardId} .st-roll-skill-name-wrap {
        grid-area: name;
        gap: 4px;
      }

      #${cardId} .st-roll-skill-modifier {
        grid-area: modifier;
        text-align: left;
        min-height: 28px;
        max-width: 96px;
      }

      #${cardId} .st-roll-skill-row-select {
        width: 14px;
        height: 14px;
        --stx-box-checkbox-size: 14px;
      }

      #${cardId} .st-roll-skill-actions-group {
        grid-area: actions;
        width: auto;
        justify-self: end;
        grid-template-columns: repeat(4, 26px);
        gap: 4px;
      }

      #${cardId} .st-roll-skill-actions-group .st-roll-btn {
        width: 26px;
        min-width: 26px;
        min-height: 26px;
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

      #${cardId} .st-roll-status-modal {
        --st-roll-status-mobile-sheet-height: min(92vh, 920px);
        --st-roll-status-mobile-sheet-translate: calc(var(--st-roll-status-mobile-sheet-height) + 84px);
        --st-roll-status-mobile-sheet-backdrop-opacity: 0;
      }

      #${cardId} .st-roll-status-modal-backdrop {
        opacity: var(--st-roll-status-mobile-sheet-backdrop-opacity, 0);
      }

      #${cardId} .st-roll-status-modal.is-mobile-sheet-dragging .st-roll-status-modal-backdrop {
        transition: none;
      }

      #${cardId} .st-roll-status-modal-head {
        padding: 10px 12px;
      }

      #${cardId} .st-roll-status-modal-body {
        padding: 0;
        position: relative;
      }

      #${cardId} .st-roll-status-layout {
        display: block;
        position: relative;
        min-height: 0;
        height: 100%;
        border: 0;
        border-radius: 0;
        background: transparent;
      }

      #${cardId} .st-roll-status-sidebar {
        min-width: 0;
        height: 100%;
        border: 0;
        background: transparent;
        padding: 12px 12px 20px;
        gap: 10px;
      }

      #${cardId} .st-roll-status-splitter {
        display: none;
      }

      #${cardId} .st-roll-status-sidebar .st-roll-workbench-toolbar-sidebar {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto auto;
        gap: 8px;
        padding: 10px;
        border-radius: 16px;
      }

      #${cardId} .st-roll-status-sidebar .st-roll-status-chat-search {
        grid-column: 1 / -1;
      }

      #${cardId} .st-roll-status-sidebar .st-roll-btn {
        min-width: 84px;
        min-height: 34px;
      }

      #${cardId} .st-roll-status-sidebar-head {
        padding: 10px 12px;
        border-radius: 16px;
      }

      #${cardId} .st-roll-status-chat-list {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding-bottom: 24px;
        gap: 10px;
      }

      #${cardId} .st-roll-status-chat-item {
        align-items: center;
        padding: 12px;
        min-height: 76px;
        border-radius: 16px;
      }

      #${cardId} .st-roll-status-chat-avatar-wrap {
        flex-basis: 60px;
        width: 60px;
        height: 60px;
      }

      #${cardId} .st-roll-status-main {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 4;
        height: var(--st-roll-status-mobile-sheet-height);
        padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
        border-radius: 20px 20px 0 0;
        border: 1px solid var(--ss-theme-border);
        border-bottom: 0;
        background: var(--ss-theme-panel-bg);
        box-shadow: 0 -16px 36px rgba(0, 0, 0, 0.42);
        transform: translateY(var(--st-roll-status-mobile-sheet-translate));
        opacity: 1;
        pointer-events: none;
        transition: transform 0.26s cubic-bezier(0.22, 0.74, 0.22, 1);
        overflow: hidden;
        overscroll-behavior: contain;
        touch-action: pan-y;
        will-change: transform;
        display: grid;
        grid-template-rows: auto auto auto auto auto minmax(0, 1fr);
        gap: 10px;
      }

      #${cardId} .st-roll-status-modal.is-mobile-sheet-open .st-roll-status-main,
      #${cardId} .st-roll-status-modal.is-mobile-sheet-dragging .st-roll-status-main {
        pointer-events: auto;
      }

      #${cardId} .st-roll-status-modal.is-mobile-sheet-expanded .st-roll-status-main {
        box-shadow: 0 -22px 46px rgba(0, 0, 0, 0.5);
      }

      #${cardId} .st-roll-status-modal.is-mobile-sheet-dragging .st-roll-status-main {
        transition: none;
      }

      #${cardId} .st-roll-status-mobile-sheet-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 4px 8px;
        position: relative;
        user-select: none;
        touch-action: none;
      }

      #${cardId} .st-roll-status-mobile-sheet-head::before {
        content: "";
        position: absolute;
        top: 0;
        left: 50%;
        width: 44px;
        height: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        transform: translateX(-50%);
      }

      #${cardId} .st-roll-status-mobile-back {
        min-height: 32px;
      }

      #${cardId} .st-roll-status-mobile-sheet-copy {
        min-width: 0;
        flex: 1 1 auto;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        font-size: 12px;
        color: var(--ss-theme-text-muted);
      }

      #${cardId} .st-roll-status-context {
        grid-template-columns: 1fr;
        gap: 4px;
        padding: 8px 10px;
        border-radius: 14px;
      }

      #${cardId} .st-roll-status-context .st-roll-tip {
        text-align: left;
        font-size: 11px;
        line-height: 1.35;
      }

      #${cardId} .st-roll-status-toolbar {
        display: grid;
        grid-template-columns: repeat(6, minmax(0, 1fr));
        gap: 8px;
        padding: 10px;
        border-radius: 16px;
      }

      #${cardId} .st-roll-status-toolbar .st-roll-status-search {
        grid-column: 1 / -1;
      }

      #${cardId} .st-roll-status-toolbar .st-roll-inline-toggle {
        grid-column: span 3;
        width: 100%;
        min-height: 34px;
        justify-content: flex-start;
      }

      #${cardId} .st-roll-status-selection-count {
        grid-column: span 2;
        width: 100%;
        justify-content: center;
        min-height: 32px;
      }

      #${cardId} .st-roll-status-toolbar .st-roll-toolbar-icon-btn {
        width: 100%;
        min-width: 0;
        min-height: 34px;
        border-radius: 10px;
      }

      #${cardId} .st-roll-status-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        flex-wrap: nowrap;
        gap: 6px;
      }

      #${cardId} .st-roll-status-head-main {
        gap: 2px;
        min-width: 0;
      }

      #${cardId} .st-roll-status-head .st-roll-workbench-subtitle {
        font-size: 11px;
        line-height: 1.3;
      }

      #${cardId} .st-roll-status-head .st-roll-actions {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: max-content;
        align-items: center;
        justify-content: end;
        gap: 6px;
        min-width: 0;
      }

      #${cardId} .st-roll-status-head .st-roll-btn {
        min-height: 30px;
        padding: 0 10px;
        font-size: 11px;
      }

      #${cardId} .st-roll-status-cols {
        display: none;
      }

      #${cardId} .st-roll-status-actions-group {
        width: 100%;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }

      #${cardId} .st-roll-status-actions-group .st-roll-btn {
        width: 100%;
        min-width: 0;
        min-height: 32px;
      }

      #${cardId} .st-roll-status-rows {
        padding: 8px;
        border-radius: 16px;
        overflow-x: hidden;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }

      #${cardId} .st-roll-status-row {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        padding: 12px;
        border: 1px solid var(--ss-theme-border);
        border-radius: 16px;
        background: color-mix(in srgb, var(--ss-theme-surface-3) 88%, transparent);
        min-width: 0;
      }

      #${cardId} .st-roll-status-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        min-width: 0;
      }

      #${cardId} .st-roll-status-field-label {
        display: block;
        padding: 0 2px;
        font-size: 10px;
        font-weight: 700;
        line-height: 1.2;
        letter-spacing: 0.04em;
        color: var(--ss-theme-text-muted);
        opacity: 0.72;
      }

      #${cardId} .st-roll-status-field-content {
        display: block;
        min-width: 0;
      }

      #${cardId} .st-roll-status-field-name,
      #${cardId} .st-roll-status-field-skills {
        grid-column: 1 / -1;
      }

      #${cardId} .st-roll-status-bottom-grid {
        grid-column: 1 / -1;
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      #${cardId} .st-roll-status-field-enabled {
        min-width: 0;
      }

      #${cardId} .st-roll-status-field-actions {
        justify-self: end;
        width: max-content;
        max-width: 100%;
      }

      #${cardId} .st-roll-status-field-name .st-roll-status-field-label {
        padding-left: 32px;
      }

      #${cardId} .st-roll-status-field-enabled .st-roll-status-field-label {
        display: none;
      }

      #${cardId} .st-roll-status-field-actions .st-roll-status-field-label {
        display: none;
      }

      #${cardId} .st-roll-status-row .st-roll-status-name-wrap {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        align-items: center;
        gap: 8px;
        width: 100%;
      }

      #${cardId} .st-roll-status-row .st-roll-status-name,
      #${cardId} .st-roll-status-row .st-roll-status-modifier,
      #${cardId} .st-roll-status-row .st-roll-status-duration,
      #${cardId} .st-roll-status-row .st-roll-status-skills {
        width: 100%;
        min-width: 0;
      }

      #${cardId} .st-roll-status-row .st-roll-status-name,
      #${cardId} .st-roll-status-row .st-roll-status-modifier,
      #${cardId} .st-roll-status-row .st-roll-status-duration,
      #${cardId} .st-roll-status-row .st-roll-status-skills,
      #${cardId} .st-roll-status-enabled-wrap {
        min-height: 36px;
        height: 36px;
      }

      #${cardId} .st-roll-status-modifier {
        text-align: left;
      }

      #${cardId} .st-roll-status-enabled-card {
        width: auto;
        max-width: 100%;
        min-width: 0;
        min-height: 36px;
        margin-left: auto;
        padding: 0;
      }

      #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-body {
        justify-content: flex-end;
        gap: 4px;
      }

      #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-copy {
        flex: 0 0 auto;
      }

      #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-control {
        padding: 2px 6px 2px 4px;
      }

      #${cardId} .st-roll-status-enabled-card .stx-shared-checkbox-title {
        font-size: 12px;
      }

      #${cardId} .st-roll-status-field-enabled .st-roll-status-field-content,
      #${cardId} .st-roll-status-field-actions .st-roll-status-field-content {
        display: flex;
        align-items: center;
        min-height: 36px;
      }

      #${cardId} .st-roll-status-field-enabled .st-roll-status-field-content {
        justify-content: flex-end;
        width: 100%;
      }

      #${cardId} .st-roll-status-field-actions .st-roll-status-field-content {
        justify-content: flex-end;
        width: max-content;
        max-width: 100%;
      }

      #${cardId} .st-roll-status-actions-group {
        width: auto;
        grid-template-columns: repeat(2, 28px);
        gap: 6px;
        justify-content: flex-end;
      }

      #${cardId} .st-roll-status-actions-group .st-roll-btn,
      #${cardId} .st-roll-status-actions-group .st-roll-toolbar-icon-btn {
        width: 28px;
        min-width: 28px;
        min-height: 28px;
        border-radius: 9px;
        padding: 0;
      }

      #${cardId} .st-roll-status-actions-group .stx-shared-button-icon {
        font-size: 11px;
      }

      #${cardId} .st-roll-status-duplicate,
      #${cardId} .st-roll-status-remove {
        width: 28px;
      }
    }

    @media (max-width: 768px) {
      #${cardId} .st-roll-status-chat-meta {
        white-space: normal;
      }
    }
  `;
}
