import { buildSharedCheckboxStyles } from "../../../_Components/sharedCheckbox";
import { buildSharedBoxCheckboxStyles } from "../../../_Components/sharedBoxCheckbox";
import { buildSharedButtonStyles } from "../../../_Components/sharedButton";
import { buildChangelogStyles } from "../../../_Components/changelog";
import { buildSharedInputStyles } from "../../../_Components/sharedInput";
import { buildSharedSelectStyles } from "../../../_Components/sharedSelect";
import { buildSettingPageStyles } from "../../../_Components/Setting";
import { buildSdkThemeVars } from "../../../SDK/theme";

export function buildSettingsCardStylesTemplateEvent(cardId: string): string {
  return `
    ${buildSettingPageStyles(`#${cardId}`)}
    ${buildChangelogStyles(`#${cardId}`)}

    #${cardId} {
      margin-bottom: 5px;
    }

    #${cardId},
    #${cardId} .st-roll-shell,
    #${cardId} .st-roll-content,
    #${cardId} .st-roll-skill-modal,
    #${cardId} .st-roll-status-modal {
      color: var(--SmartThemeBodyColor, inherit);
      --st-roll-text: var(--SmartThemeBodyColor, #dcdcd2);
      --st-roll-text-muted: rgba(255, 255, 255, 0.75);
      --st-roll-accent: #c5a059;
      --st-roll-accent-contrast: #ffeac0;
      --st-roll-shell-border: rgba(197, 160, 89, 0.35);
      --st-roll-shell-bg:
        radial-gradient(120% 140% at 100% 0%, rgba(197, 160, 89, 0.12), transparent 55%),
        linear-gradient(160deg, rgba(31, 25, 25, 0.82), rgba(20, 18, 20, 0.82));
      --st-roll-shell-backdrop: blur(3px);
      --st-roll-content-bg: transparent;
      --st-roll-content-border: rgba(255, 255, 255, 0.08);
      --st-roll-tabs-bg: rgba(0, 0, 0, 0.2);
      --st-roll-tabs-border: rgba(255, 255, 255, 0.16);
      --st-roll-tab-active-bg: rgba(197, 160, 89, 0.58);
      --st-roll-tab-hover-bg: rgba(197, 160, 89, 0.2);
      --st-roll-tab-hover-shadow: 0 0 12px rgba(197, 160, 89, 0.2);
      --st-roll-divider-line:
        linear-gradient(
          90deg,
          rgba(255, 255, 255, 0),
          rgba(255, 255, 255, 0.2) 18%,
          rgba(255, 255, 255, 0.26) 50%,
          rgba(255, 255, 255, 0.2) 82%,
          rgba(255, 255, 255, 0)
        );
      --st-roll-item-bg: rgba(0, 0, 0, 0.16);
      --st-roll-item-border: rgba(255, 255, 255, 0.2);
      --st-roll-item-hover-bg: rgba(0, 0, 0, 0.24);
      --st-roll-item-hover-border: rgba(197, 160, 89, 0.48);
      --st-roll-item-hover-shadow:
        0 0 0 1px rgba(197, 160, 89, 0.2),
        0 0 16px rgba(197, 160, 89, 0.16);
      --st-roll-control-bg: rgba(0, 0, 0, 0.28);
      --st-roll-control-bg-hover: rgba(0, 0, 0, 0.34);
      --st-roll-control-border: rgba(197, 160, 89, 0.36);
      --st-roll-control-border-hover: rgba(197, 160, 89, 0.58);
      --st-roll-control-focus-border: rgba(197, 160, 89, 0.72);
      --st-roll-control-focus-ring: rgba(197, 160, 89, 0.22);
      --st-roll-btn-bg: rgba(197, 160, 89, 0.14);
      --st-roll-btn-border: rgba(197, 160, 89, 0.45);
      --st-roll-btn-hover-bg: rgba(197, 160, 89, 0.24);
      --st-roll-btn-hover-border: rgba(197, 160, 89, 0.68);
      --st-roll-btn-hover-shadow:
        inset 0 0 0 1px rgba(197, 160, 89, 0.26),
        0 0 14px rgba(197, 160, 89, 0.2);
      --st-roll-btn-secondary-bg: rgba(255, 255, 255, 0.08);
      --st-roll-btn-secondary-border: rgba(255, 255, 255, 0.2);
      --st-roll-btn-danger-bg: rgba(154, 62, 49, 0.16);
      --st-roll-btn-danger-border: rgba(214, 104, 85, 0.52);
      --st-roll-btn-danger-hover-bg: rgba(179, 70, 53, 0.26);
      --st-roll-btn-danger-hover-border: rgba(230, 123, 101, 0.72);
      --st-roll-btn-danger-hover-shadow:
        inset 0 0 0 1px rgba(230, 123, 101, 0.2),
        0 0 14px rgba(179, 70, 53, 0.24);
      --st-roll-textarea-wrap-bg: rgba(0, 0, 0, 0.15);
      --st-roll-textarea-wrap-border: rgba(255, 255, 255, 0.18);
      --st-roll-textarea-wrap-hover-border: rgba(197, 160, 89, 0.45);
      --st-roll-textarea-wrap-hover-shadow: 0 10px 22px rgba(0, 0, 0, 0.2);
      --st-roll-panel-muted-bg: rgba(0, 0, 0, 0.16);
      --st-roll-panel-muted-border: rgba(255, 255, 255, 0.18);
      --st-roll-modal-panel-bg:
        radial-gradient(110% 130% at 100% 0%, rgba(197, 160, 89, 0.14), transparent 56%),
        linear-gradient(160deg, rgba(23, 21, 24, 0.96), rgba(15, 14, 17, 0.96));
      --st-roll-modal-panel-border: rgba(197, 160, 89, 0.38);
      --st-roll-modal-panel-shadow: 0 18px 54px rgba(0, 0, 0, 0.46);
      --st-roll-modal-head-bg: rgba(255, 255, 255, 0.04);
      --st-roll-modal-head-border: rgba(255, 255, 255, 0.1);
      --st-roll-sidebar-bg: rgba(0, 0, 0, 0.26);
      --st-roll-sidebar-head-bg: rgba(255, 255, 255, 0.03);
      --st-roll-layout-bg: rgba(0, 0, 0, 0.18);
      --st-roll-layout-border: rgba(255, 255, 255, 0.12);
      --st-roll-list-item-bg: rgba(255, 255, 255, 0.03);
      --st-roll-list-item-border: rgba(255, 255, 255, 0.14);
      --st-roll-list-item-hover-bg: rgba(197, 160, 89, 0.16);
      --st-roll-list-item-hover-border: rgba(197, 160, 89, 0.58);
      --st-roll-list-item-active-bg: rgba(197, 160, 89, 0.24);
      --st-roll-list-item-active-border: rgba(197, 160, 89, 0.74);
      --st-roll-list-item-active-shadow: 0 0 0 1px rgba(197, 160, 89, 0.24);
      --st-roll-select-panel-bg: rgba(17, 14, 16, 0.76);
      --st-roll-select-panel-backdrop-filter: blur(8px);
      --st-roll-workbench-bg: rgba(0, 0, 0, 0.18);
      --st-roll-workbench-panel-bg: rgba(255, 255, 255, 0.03);
      --st-roll-workbench-panel-border: rgba(255, 255, 255, 0.12);
      --st-roll-workbench-toolbar-bg: rgba(0, 0, 0, 0.18);
      --st-roll-workbench-accent: rgba(197, 160, 89, 0.18);
      --st-roll-workbench-muted: rgba(255, 255, 255, 0.66);
      --st-roll-dialog-backdrop: rgba(0, 0, 0, 0.52);
      --st-roll-dialog-backdrop-filter: blur(8px);
    }

    ${buildSdkThemeVars(`#${cardId}, #${cardId} .st-roll-shell, #${cardId} .st-roll-content, #${cardId} .st-roll-skill-modal, #${cardId} .st-roll-status-modal`)}

    #${cardId} .st-roll-content[data-st-roll-theme="dark"],
    #${cardId} .st-roll-skill-modal[data-st-roll-theme="dark"],
    #${cardId} .st-roll-status-modal[data-st-roll-theme="dark"] {
      --st-roll-text: #e6edf7;
      --st-roll-text-muted: #a5b0c4;
      --st-roll-accent: #5f8de5;
      --st-roll-accent-contrast: #f1f6ff;
      --st-roll-shell-border: #35425e;
      --st-roll-shell-bg: #171f2f;
      --st-roll-shell-backdrop: none;
      --st-roll-content-bg: #1f2838;
      --st-roll-content-border: #2f3a4d;
      --st-roll-tabs-bg: #1a2333;
      --st-roll-tabs-border: #2f3a4d;
      --st-roll-tab-active-bg: #4b71bb;
      --st-roll-tab-hover-bg: #2e446c;
      --st-roll-tab-hover-shadow: none;
      --st-roll-divider-line: linear-gradient(90deg, #1f2838 0%, #3e4c69 50%, #1f2838 100%);
      --st-roll-item-bg: #212c3f;
      --st-roll-item-border: #38445a;
      --st-roll-item-hover-bg: #27344a;
      --st-roll-item-hover-border: #4f6490;
      --st-roll-item-hover-shadow: none;
      --st-roll-control-bg: #1c2535;
      --st-roll-control-bg-hover: #233047;
      --st-roll-control-border: #435473;
      --st-roll-control-border-hover: #5c74a5;
      --st-roll-control-focus-border: #6f92db;
      --st-roll-control-focus-ring: #2f446f;
      --st-roll-btn-bg: #273755;
      --st-roll-btn-border: #3f5983;
      --st-roll-btn-hover-bg: #32466b;
      --st-roll-btn-hover-border: #5778b3;
      --st-roll-btn-hover-shadow: none;
      --st-roll-btn-secondary-bg: #202d43;
      --st-roll-btn-secondary-border: #40526f;
      --st-roll-btn-danger-bg: #4b262a;
      --st-roll-btn-danger-border: #8e4a54;
      --st-roll-btn-danger-hover-bg: #5b3034;
      --st-roll-btn-danger-hover-border: #b76571;
      --st-roll-btn-danger-hover-shadow: none;
      --st-roll-textarea-wrap-bg: #1d283b;
      --st-roll-textarea-wrap-border: #3a4861;
      --st-roll-textarea-wrap-hover-border: #536d9d;
      --st-roll-textarea-wrap-hover-shadow: none;
      --st-roll-panel-muted-bg: #1d2739;
      --st-roll-panel-muted-border: #35435c;
      --st-roll-modal-panel-bg: #131c2b;
      --st-roll-modal-panel-border: #34435f;
      --st-roll-modal-panel-shadow: 0 12px 30px #0b1020;
      --st-roll-modal-head-bg: #1f2a3d;
      --st-roll-modal-head-border: #34425a;
      --st-roll-sidebar-bg: #182233;
      --st-roll-sidebar-head-bg: #202c40;
      --st-roll-layout-bg: #1a2334;
      --st-roll-layout-border: #344157;
      --st-roll-list-item-bg: #1f2a3d;
      --st-roll-list-item-border: #384863;
      --st-roll-list-item-hover-bg: #2c3b56;
      --st-roll-list-item-hover-border: #4f6798;
      --st-roll-list-item-active-bg: #334766;
      --st-roll-list-item-active-border: #6180bd;
      --st-roll-list-item-active-shadow: none;
      --st-roll-select-panel-bg: rgba(19, 28, 43, 0.84);
      --st-roll-select-panel-backdrop-filter: blur(8px);
      --st-roll-workbench-bg: #182233;
      --st-roll-workbench-panel-bg: #1f2a3d;
      --st-roll-workbench-panel-border: #344157;
      --st-roll-workbench-toolbar-bg: #202c40;
      --st-roll-workbench-accent: rgba(95, 141, 229, 0.2);
      --st-roll-workbench-muted: #a5b0c4;
      --st-roll-dialog-backdrop: rgba(15, 21, 32, 0.56);
      --st-roll-dialog-backdrop-filter: blur(8px);
    }

    #${cardId} .st-roll-content[data-st-roll-theme="light"],
    #${cardId} .st-roll-skill-modal[data-st-roll-theme="light"],
    #${cardId} .st-roll-status-modal[data-st-roll-theme="light"] {
      --st-roll-text: #1f2834;
      --st-roll-text-muted: #5e6e84;
      --st-roll-accent: #2f6ee5;
      --st-roll-accent-contrast: #ffffff;
      --st-roll-shell-border: #c6d1e2;
      --st-roll-shell-bg: #f8fbff;
      --st-roll-shell-backdrop: none;
      --st-roll-content-bg: #ffffff;
      --st-roll-content-border: #d7dfec;
      --st-roll-tabs-bg: #eef3fa;
      --st-roll-tabs-border: #c9d5e7;
      --st-roll-tab-active-bg: #2f6ee5;
      --st-roll-tab-hover-bg: #d9e6ff;
      --st-roll-tab-hover-shadow: none;
      --st-roll-divider-line: linear-gradient(90deg, #ffffff 0%, #c3d4ec 50%, #ffffff 100%);
      --st-roll-item-bg: #f8fbff;
      --st-roll-item-border: #cfdbec;
      --st-roll-item-hover-bg: #edf4ff;
      --st-roll-item-hover-border: #adc3e7;
      --st-roll-item-hover-shadow: none;
      --st-roll-control-bg: #ffffff;
      --st-roll-control-bg-hover: #f1f6ff;
      --st-roll-control-border: #adc1e0;
      --st-roll-control-border-hover: #8eaed9;
      --st-roll-control-focus-border: #3b74e0;
      --st-roll-control-focus-ring: #cfe0ff;
      --st-roll-btn-bg: #e7f0ff;
      --st-roll-btn-border: #a8bfe5;
      --st-roll-btn-hover-bg: #d2e3ff;
      --st-roll-btn-hover-border: #83a2d7;
      --st-roll-btn-hover-shadow: none;
      --st-roll-btn-secondary-bg: #f1f5fc;
      --st-roll-btn-secondary-border: #c1d0e6;
      --st-roll-btn-danger-bg: #fff0ed;
      --st-roll-btn-danger-border: #d7a39b;
      --st-roll-btn-danger-hover-bg: #ffe2dc;
      --st-roll-btn-danger-hover-border: #cb857a;
      --st-roll-btn-danger-hover-shadow: none;
      --st-roll-textarea-wrap-bg: #ffffff;
      --st-roll-textarea-wrap-border: #cfdbec;
      --st-roll-textarea-wrap-hover-border: #9cb7df;
      --st-roll-textarea-wrap-hover-shadow: none;
      --st-roll-panel-muted-bg: #f5f8fe;
      --st-roll-panel-muted-border: #cfdbec;
      --st-roll-modal-panel-bg: #f5f9ff;
      --st-roll-modal-panel-border: #c6d3e6;
      --st-roll-modal-panel-shadow: 0 10px 24px #c6d0df;
      --st-roll-modal-head-bg: #eaf1fb;
      --st-roll-modal-head-border: #c8d5e8;
      --st-roll-sidebar-bg: #eef3fa;
      --st-roll-sidebar-head-bg: #e3ebf8;
      --st-roll-layout-bg: #f6f9ff;
      --st-roll-layout-border: #cfdbec;
      --st-roll-list-item-bg: #ffffff;
      --st-roll-list-item-border: #cfdbec;
      --st-roll-list-item-hover-bg: #e8f0ff;
      --st-roll-list-item-hover-border: #9db6dd;
      --st-roll-list-item-active-bg: #d8e6ff;
      --st-roll-list-item-active-border: #7e9fd5;
      --st-roll-list-item-active-shadow: none;
      --st-roll-select-panel-bg: rgba(245, 249, 255, 0.86);
      --st-roll-select-panel-backdrop-filter: blur(8px);
      --st-roll-workbench-bg: #eef3fa;
      --st-roll-workbench-panel-bg: #ffffff;
      --st-roll-workbench-panel-border: #cfdbec;
      --st-roll-workbench-toolbar-bg: #eef3fa;
      --st-roll-workbench-accent: rgba(47, 110, 229, 0.12);
      --st-roll-workbench-muted: #5e6e84;
      --st-roll-dialog-backdrop: rgba(217, 225, 238, 0.56);
      --st-roll-dialog-backdrop-filter: blur(8px);
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"],
    #${cardId} .st-roll-skill-modal[data-st-roll-theme="tavern"],
    #${cardId} .st-roll-status-modal[data-st-roll-theme="tavern"] {
      --st-roll-text: var(--SmartThemeBodyColor, #dcdcd2);
      --st-roll-text-muted: var(--SmartThemeEmColor, #919191);
      --st-roll-accent: var(--SmartThemeQuoteColor, #e18a24);
      --st-roll-accent-contrast: var(--SmartThemeBodyColor, #dcdcd2);
      --st-roll-shell-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-shell-bg:
        linear-gradient(348deg, var(--white30a, rgba(255, 255, 255, 0.3)) 2%, var(--grey30a, rgba(50, 50, 50, 0.3)) 10%, var(--black70a, rgba(0, 0, 0, 0.7)) 95%, var(--SmartThemeQuoteColor, #e18a24) 100%);
      --st-roll-shell-backdrop: blur(var(--SmartThemeBlurStrength, 0px));
      --st-roll-content-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-content-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-tabs-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 82%, #000 18%);
      --st-roll-tabs-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-tab-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 50%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-tab-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 26%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-tab-hover-shadow: none;
      --st-roll-divider-line: linear-gradient(90deg, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 0%, color-mix(in srgb, var(--SmartThemeBodyColor, #dcdcd2) 28%, transparent) 50%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 100%);
      --st-roll-item-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 88%, #000 12%);
      --st-roll-item-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-item-hover-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 54%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-item-hover-shadow: none;
      --st-roll-control-bg: var(--black30a, rgba(0, 0, 0, 0.3));
      --st-roll-control-bg-hover: color-mix(in srgb, var(--black30a, rgba(0, 0, 0, 0.3)) 70%, var(--SmartThemeQuoteColor, #e18a24) 30%);
      --st-roll-control-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-control-border-hover: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 40%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-control-focus-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 70%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-control-focus-ring: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 32%, transparent);
      --st-roll-btn-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-btn-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-btn-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 20%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-btn-hover-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-btn-hover-shadow: none;
      --st-roll-btn-secondary-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 85%, var(--SmartThemeBodyColor, #dcdcd2) 15%);
      --st-roll-btn-secondary-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-btn-danger-bg: color-mix(in srgb, #8f2f1f 32%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-btn-danger-border: color-mix(in srgb, #cf6c4d 62%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-btn-danger-hover-bg: color-mix(in srgb, #b54833 40%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-btn-danger-hover-border: color-mix(in srgb, #e28a66 74%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-btn-danger-hover-shadow: none;
      --st-roll-textarea-wrap-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-textarea-wrap-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-textarea-wrap-hover-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 50%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-textarea-wrap-hover-shadow: none;
      --st-roll-panel-muted-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 88%, #000 12%);
      --st-roll-panel-muted-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-modal-panel-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-modal-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-modal-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --st-roll-modal-head-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 85%, var(--SmartThemeBodyColor, #dcdcd2) 15%);
      --st-roll-modal-head-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-sidebar-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 88%, #000 12%);
      --st-roll-sidebar-head-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 78%, var(--SmartThemeBodyColor, #dcdcd2) 22%);
      --st-roll-layout-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-layout-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-list-item-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 90%, #000 10%);
      --st-roll-list-item-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-list-item-hover-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 16%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-list-item-hover-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 56%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-list-item-active-bg: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 24%, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)));
      --st-roll-list-item-active-border: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 70%, var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5)));
      --st-roll-list-item-active-shadow: none;
      --st-roll-select-panel-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 74%, transparent);
      --st-roll-select-panel-backdrop-filter: blur(10px);
      --st-roll-workbench-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 88%, #000 12%);
      --st-roll-workbench-panel-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 92%, #000 8%);
      --st-roll-workbench-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-workbench-toolbar-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 82%, var(--SmartThemeBodyColor, #dcdcd2) 18%);
      --st-roll-workbench-accent: color-mix(in srgb, var(--SmartThemeQuoteColor, #e18a24) 22%, transparent);
      --st-roll-workbench-muted: var(--SmartThemeEmColor, #919191);
      --st-roll-dialog-backdrop: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 66%, transparent);
      --st-roll-dialog-backdrop-filter: blur(10px);
    }

    #${cardId} .st-roll-content,
    #${cardId} .st-roll-skill-modal,
    #${cardId} .st-roll-status-modal {
      color: var(--stx-theme-text, var(--st-roll-text, inherit));
      --st-roll-text: var(--stx-theme-text, var(--st-roll-text, inherit));
      --st-roll-text-muted: var(--stx-theme-text-muted, var(--st-roll-text-muted, rgba(255, 255, 255, 0.72)));
      --st-roll-accent: var(--stx-theme-accent, var(--st-roll-accent, #c5a059));
      --st-roll-accent-contrast: var(--stx-theme-accent-contrast, var(--st-roll-accent-contrast, #ffeac0));
      --st-roll-shell-border: var(--stx-theme-border, var(--st-roll-shell-border, rgba(197, 160, 89, 0.35)));
      --st-roll-shell-bg: var(--stx-theme-surface-1, var(--st-roll-shell-bg));
      --st-roll-content-bg: var(--stx-theme-surface-2, var(--st-roll-content-bg));
      --st-roll-content-border: var(--stx-theme-border, var(--st-roll-content-border, rgba(255, 255, 255, 0.08)));
      --st-roll-tabs-bg: var(--stx-theme-surface-2, var(--st-roll-tabs-bg));
      --st-roll-tabs-border: var(--stx-theme-border, var(--st-roll-tabs-border, rgba(255, 255, 255, 0.16)));
      --st-roll-tab-active-bg: var(--stx-theme-list-item-active-bg, var(--st-roll-tab-active-bg));
      --st-roll-tab-hover-bg: var(--stx-theme-list-item-hover-bg, var(--st-roll-tab-hover-bg));
      --st-roll-item-bg: var(--stx-theme-surface-2, var(--st-roll-item-bg));
      --st-roll-item-border: var(--stx-theme-border, var(--st-roll-item-border));
      --st-roll-item-hover-bg: var(--stx-theme-list-item-hover-bg, var(--st-roll-item-hover-bg));
      --st-roll-item-hover-border: var(--stx-theme-border-strong, var(--st-roll-item-hover-border));
      --st-roll-control-bg: var(--stx-theme-surface-2, var(--st-roll-control-bg));
      --st-roll-control-bg-hover: var(--stx-theme-surface-3, var(--st-roll-control-bg-hover));
      --st-roll-control-border: var(--stx-theme-border, var(--st-roll-control-border));
      --st-roll-control-border-hover: var(--stx-theme-border-strong, var(--st-roll-control-border-hover));
      --st-roll-control-focus-border: var(--stx-theme-border-strong, var(--st-roll-control-focus-border));
      --st-roll-control-focus-ring: var(--stx-theme-focus-ring, var(--st-roll-control-focus-ring));
      --st-roll-btn-bg: var(--stx-theme-surface-3, var(--st-roll-btn-bg));
      --st-roll-btn-border: var(--stx-theme-border, var(--st-roll-btn-border));
      --st-roll-btn-hover-bg: var(--stx-theme-list-item-hover-bg, var(--st-roll-btn-hover-bg));
      --st-roll-btn-hover-border: var(--stx-theme-border-strong, var(--st-roll-btn-hover-border));
      --st-roll-btn-secondary-bg: var(--stx-theme-surface-2, var(--st-roll-btn-secondary-bg));
      --st-roll-btn-secondary-border: var(--stx-theme-border, var(--st-roll-btn-secondary-border));
      --st-roll-textarea-wrap-bg: var(--stx-theme-surface-2, var(--st-roll-textarea-wrap-bg));
      --st-roll-textarea-wrap-border: var(--stx-theme-border, var(--st-roll-textarea-wrap-border));
      --st-roll-panel-muted-bg: var(--stx-theme-surface-2, var(--st-roll-panel-muted-bg));
      --st-roll-panel-muted-border: var(--stx-theme-border, var(--st-roll-panel-muted-border));
      --st-roll-modal-panel-bg: var(--stx-theme-panel-bg, var(--st-roll-modal-panel-bg));
      --st-roll-modal-panel-border: var(--stx-theme-panel-border, var(--st-roll-modal-panel-border));
      --st-roll-modal-panel-shadow: var(--stx-theme-panel-shadow, var(--st-roll-modal-panel-shadow));
      --st-roll-modal-head-bg: var(--stx-theme-toolbar-bg, var(--st-roll-modal-head-bg));
      --st-roll-modal-head-border: var(--stx-theme-border, var(--st-roll-modal-head-border));
      --st-roll-sidebar-bg: var(--stx-theme-surface-2, var(--st-roll-sidebar-bg));
      --st-roll-sidebar-head-bg: var(--stx-theme-toolbar-bg, var(--st-roll-sidebar-head-bg));
      --st-roll-layout-bg: var(--stx-theme-surface-2, var(--st-roll-layout-bg));
      --st-roll-layout-border: var(--stx-theme-border, var(--st-roll-layout-border));
      --st-roll-list-item-bg: var(--stx-theme-list-item-bg, var(--st-roll-list-item-bg));
      --st-roll-list-item-border: var(--stx-theme-border, var(--st-roll-list-item-border));
      --st-roll-list-item-hover-bg: var(--stx-theme-list-item-hover-bg, var(--st-roll-list-item-hover-bg));
      --st-roll-list-item-hover-border: var(--stx-theme-border-strong, var(--st-roll-list-item-hover-border));
      --st-roll-list-item-active-bg: var(--stx-theme-list-item-active-bg, var(--st-roll-list-item-active-bg));
      --st-roll-list-item-active-border: var(--stx-theme-border-strong, var(--st-roll-list-item-active-border));
      --st-roll-select-panel-bg: var(--stx-theme-panel-bg, var(--st-roll-select-panel-bg));
      --st-roll-workbench-bg: var(--stx-theme-surface-2, var(--st-roll-workbench-bg));
      --st-roll-workbench-panel-bg: var(--stx-theme-surface-3, var(--st-roll-workbench-panel-bg));
      --st-roll-workbench-panel-border: var(--stx-theme-border, var(--st-roll-workbench-panel-border));
      --st-roll-workbench-toolbar-bg: var(--stx-theme-toolbar-bg, var(--st-roll-workbench-toolbar-bg));
      --st-roll-workbench-accent: var(--stx-theme-list-item-hover-bg, var(--st-roll-workbench-accent));
      --st-roll-workbench-muted: var(--stx-theme-text-muted, var(--st-roll-workbench-muted));
      --st-roll-dialog-backdrop: var(--stx-theme-backdrop, var(--st-roll-dialog-backdrop));
      --st-roll-dialog-backdrop-filter: var(--stx-theme-backdrop-filter, var(--st-roll-dialog-backdrop-filter));
      --stx-shared-select-panel-bg: var(--st-roll-select-panel-bg);
      --stx-shared-select-panel-backdrop-filter: var(--st-roll-select-panel-backdrop-filter, var(--st-roll-dialog-backdrop-filter));
    }

    #${cardId}[data-st-roll-theme="tavern"],
    #${cardId} .st-roll-shell[data-st-roll-theme="tavern"],
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] {
      --st-roll-shell-border: transparent;
      --st-roll-shell-bg: transparent;
      --st-roll-shell-backdrop: none;
      --st-roll-content-bg: transparent;
      --st-roll-content-border: transparent;
      --st-roll-tabs-bg: transparent;
      --st-roll-tabs-border: transparent;
      --st-roll-item-bg: transparent;
      --st-roll-item-border: transparent;
      --st-roll-panel-muted-bg: transparent;
      --st-roll-panel-muted-border: transparent;
      --st-roll-modal-head-bg:
        var(
          --stx-theme-toolbar-bg,
          linear-gradient(
            348deg,
            var(--white30a, rgba(255, 255, 255, 0.3)) 2%,
            var(--grey30a, rgba(50, 50, 50, 0.3)) 10%,
            var(--black70a, rgba(0, 0, 0, 0.7)) 95%,
            var(--SmartThemeQuoteColor, #e18a24) 100%
          )
        );
      --st-roll-modal-head-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-sidebar-bg: transparent;
      --st-roll-sidebar-head-bg:
        var(
          --stx-theme-toolbar-bg,
          linear-gradient(
            348deg,
            var(--white30a, rgba(255, 255, 255, 0.3)) 2%,
            var(--grey30a, rgba(50, 50, 50, 0.3)) 10%,
            var(--black70a, rgba(0, 0, 0, 0.7)) 95%,
            var(--SmartThemeQuoteColor, #e18a24) 100%
          )
        );
      --st-roll-layout-bg: transparent;
      --st-roll-layout-border: transparent;
      --st-roll-list-item-bg: transparent;
      --st-roll-list-item-border: transparent;
      --st-roll-workbench-bg: transparent;
      --st-roll-workbench-panel-bg: transparent;
      --st-roll-workbench-panel-border: transparent;
      --st-roll-select-panel-bg: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 74%, transparent);
      --st-roll-select-panel-backdrop-filter: blur(10px);
      --stx-shared-select-panel-bg: var(--st-roll-select-panel-bg);
      --stx-shared-select-panel-backdrop-filter: var(--st-roll-select-panel-backdrop-filter);
    }

    #${cardId} .st-roll-skill-modal[data-st-roll-theme="tavern"],
    #${cardId} .st-roll-status-modal[data-st-roll-theme="tavern"] {
      --st-roll-modal-panel-bg: var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1));
      --st-roll-modal-panel-border: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      --st-roll-modal-panel-shadow: 0 14px 30px var(--SmartThemeShadowColor, rgba(0, 0, 0, 0.5));
      --st-roll-dialog-backdrop: color-mix(in srgb, var(--SmartThemeBlurTintColor, rgba(23, 23, 23, 1)) 66%, transparent);
      --st-roll-dialog-backdrop-filter: blur(10px);
    }

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
      color: #f06464;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    #${cardId} .st-roll-head .inline-drawer-icon {
      transition: transform 0.2s ease;
    }

    #${cardId} .st-roll-content {
      border-top: 1px solid var(--st-roll-content-border);
      padding: 10px;
      display: block;
      color: var(--st-roll-text);
      background: var(--st-roll-content-bg);
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
      border: 1px solid var(--st-roll-tabs-border);
      border-radius: 999px;
      margin-bottom: 10px;
      background: var(--st-roll-tabs-bg);
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
      color: var(--st-roll-accent-contrast);
      background: var(--st-roll-tab-active-bg);
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
      background: var(--st-roll-divider-line);
    }

    #${cardId} .st-roll-item {
      border: 1px solid var(--st-roll-item-border);
      border-radius: 10px;
      padding: 12px;
      margin: 2px 0;
      background: var(--st-roll-item-bg);
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
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 14px;
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
      min-width: 200px;
    }

    #${cardId} .st-roll-shared-select {
      flex: 0 1 220px;
    }

    #${cardId} .st-roll-status-row .stx-shared-select,
    #${cardId} .st-roll-status-scope-select {
      width: 100%;
      min-width: 0;
    }

    #${cardId} .st-roll-select {
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

    #${cardId} .st-roll-select {
      padding: 4px 8px;
      min-height: 30px;
    }

    #${cardId} .st-roll-select {
      min-width: 182px;
      max-width: 100%;
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
      grid-template-columns: minmax(280px, 1fr) 84px 124px;
      gap: 10px;
      font-size: 12px;
      font-weight: 700;
      opacity: 0.72;
      margin-bottom: 4px;
      padding: 0 2px;
    }

    #${cardId} .st-roll-skill-cols span:nth-child(2),
    #${cardId} .st-roll-skill-cols span:nth-child(3) {
      text-align: center;
    }

    #${cardId} .st-roll-skill-rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    #${cardId} .st-roll-skill-row {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) 84px 124px;
      gap: 10px;
      align-items: stretch;
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
      background: var(--st-roll-dialog-backdrop);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
    }

    #${cardId} .st-roll-skill-modal-backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--st-roll-dialog-backdrop) 55%, transparent);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
    }

    #${cardId} .st-roll-skill-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: min(1460px, 96vw);
      height: min(96vh, 920px);
      margin: 0;
      border: 1px solid var(--st-roll-modal-panel-border);
      border-radius: 14px;
      overflow: hidden;
      background: var(--st-roll-modal-panel-bg);
      box-shadow: var(--st-roll-modal-panel-shadow);
    }

    #${cardId} .st-roll-skill-modal-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 12px 14px;
      border-bottom: 1px solid var(--st-roll-modal-head-border);
      background: var(--st-roll-modal-head-bg);
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
      background: var(--st-roll-dialog-backdrop);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
    }

    #${cardId} .st-roll-status-modal-backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(in srgb, var(--st-roll-dialog-backdrop) 70%, transparent);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
      opacity: 1;
      transition: opacity 0.24s ease;
    }

    #${cardId} .st-roll-skill-modal[data-st-roll-theme="tavern"] .st-roll-skill-modal-backdrop,
    #${cardId} .st-roll-status-modal[data-st-roll-theme="tavern"] .st-roll-status-modal-backdrop {
      background: color-mix(in srgb, var(--st-roll-dialog-backdrop) 55%, transparent);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
    }

    #${cardId} .st-roll-status-modal-panel {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      width: max(1220px, 90vw);
      height: max(85vh, 860px);
      margin: 0;
      border: 1px solid var(--st-roll-modal-panel-border);
      border-radius: 14px;
      overflow: hidden;
      background: var(--st-roll-modal-panel-bg);
      box-shadow: var(--st-roll-modal-panel-shadow);
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
      border-bottom: 1px solid var(--st-roll-modal-head-border);
      background: var(--st-roll-modal-head-bg);
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

    #${cardId} .st-roll-status-row .stx-shared-select-trigger {
      min-height: 36px;
      height: 36px;
      padding-top: 0;
      padding-bottom: 0;
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
      accent-color: var(--st-roll-accent);
      transition: filter 0.2s ease;
    }

    #${cardId} .st-roll-head:hover {
      filter: none;
      box-shadow: none;
    }

    #${cardId} .st-roll-tab:hover {
      opacity: 1;
      background: var(--st-roll-tab-hover-bg);
      box-shadow: var(--st-roll-tab-hover-shadow);
    }

    #${cardId} .st-roll-item:hover {
      border-color: var(--st-roll-item-hover-border);
      background: var(--st-roll-item-hover-bg);
      box-shadow: var(--st-roll-item-hover-shadow);
    }

    #${cardId} .st-roll-select:hover {
      border-color: var(--st-roll-control-border-hover);
      background-color: var(--st-roll-control-bg-hover);
      box-shadow: 0 0 0 1px var(--st-roll-control-focus-ring);
    }

    #${cardId} .st-roll-textarea-wrap:hover {
      border-color: var(--st-roll-textarea-wrap-hover-border);
      box-shadow: var(--st-roll-textarea-wrap-hover-shadow);
    }

    #${cardId} .st-roll-btn:hover {
      border-color: var(--st-roll-btn-hover-border);
      background: var(--st-roll-btn-hover-bg);
      box-shadow: var(--st-roll-btn-hover-shadow);
    }

    #${cardId} .st-roll-select:focus {
      outline: none;
      border-color: var(--st-roll-control-focus-border);
      box-shadow: 0 0 0 2px var(--st-roll-control-focus-ring);
    }

    #${cardId} .st-roll-shell {
      color: inherit;
      border-color: transparent;
      background: transparent;
      backdrop-filter: none;
    }

    #${cardId} .st-roll-content {
      border-top-color: var(--st-roll-content-border);
      background: var(--st-roll-content-bg);
    }

    #${cardId} .st-roll-tabs {
      border-color: var(--st-roll-tabs-border);
      background: var(--st-roll-tabs-bg);
    }

    #${cardId} .st-roll-tab.is-active {
      color: var(--st-roll-accent-contrast);
      background: var(--st-roll-tab-active-bg);
    }

    #${cardId} .st-roll-divider-line {
      background: var(--st-roll-divider-line);
    }

    #${cardId} .st-roll-item {
      border-color: var(--st-roll-item-border);
      background: var(--st-roll-item-bg);
    }

    #${cardId} .st-roll-about-meta a {
      border-bottom-color: var(--st-roll-item-border);
    }

    #${cardId} .st-roll-select,
    #${cardId} .st-roll-select {
      color: var(--st-roll-text);
      border-color: var(--st-roll-control-border);
      background: var(--st-roll-control-bg);
    }

    #${cardId} .st-roll-btn {
      color: var(--st-roll-text);
      border-color: var(--st-roll-btn-border);
      background: var(--st-roll-btn-bg);
      --stx-button-text: var(--st-roll-text);
      --stx-button-border: var(--st-roll-btn-border);
      --stx-button-bg: var(--st-roll-btn-bg);
      --stx-button-hover-border: var(--st-roll-btn-hover-border);
      --stx-button-hover-bg: var(--st-roll-btn-hover-bg);
      --stx-button-hover-shadow: var(--st-roll-btn-hover-shadow);
    }

    #${cardId} .st-roll-btn.secondary {
      border-color: var(--st-roll-btn-secondary-border);
      background: var(--st-roll-btn-secondary-bg);
      --stx-button-border: var(--st-roll-btn-secondary-border);
      --stx-button-bg: var(--st-roll-btn-secondary-bg);
    }

    #${cardId} .st-roll-btn.danger {
      border-color: var(--st-roll-btn-danger-border);
      background: var(--st-roll-btn-danger-bg);
      --stx-button-border: var(--st-roll-btn-danger-border);
      --stx-button-bg: var(--st-roll-btn-danger-bg);
      --stx-button-hover-border: var(--st-roll-btn-danger-hover-border);
      --stx-button-hover-bg: var(--st-roll-btn-danger-hover-bg);
      --stx-button-hover-shadow: var(--st-roll-btn-danger-hover-shadow);
    }

    #${cardId} .st-roll-textarea-wrap,
    #${cardId} .stx-changelog,
    #${cardId} .st-roll-skill-presets,
    #${cardId} .st-roll-status-layout {
      border-color: var(--st-roll-panel-muted-border);
      background: var(--st-roll-panel-muted-bg);
    }

    #${cardId} .st-roll-skill-modal-panel,
    #${cardId} .st-roll-status-modal-panel {
      border-color: var(--st-roll-modal-panel-border);
      background: var(--st-roll-modal-panel-bg);
      box-shadow: var(--st-roll-modal-panel-shadow);
    }

    #${cardId} .st-roll-skill-modal-head,
    #${cardId} .st-roll-status-modal-head {
      border-bottom-color: var(--st-roll-modal-head-border);
      background: var(--st-roll-modal-head-bg);
    }

    #${cardId} .st-roll-status-layout {
      border-color: var(--st-roll-layout-border);
      background: var(--st-roll-layout-bg);
    }

    #${cardId} .st-roll-status-sidebar {
      border-right-color: var(--st-roll-layout-border);
      background: var(--st-roll-sidebar-bg);
    }

    #${cardId} .st-roll-status-sidebar-head {
      border-bottom-color: var(--st-roll-content-border);
      background: var(--st-roll-sidebar-head-bg);
    }

    #${cardId} .st-roll-status-chat-item,
    #${cardId} .st-roll-skill-preset-item {
      border-color: var(--st-roll-list-item-border);
      background: var(--st-roll-list-item-bg);
    }

    #${cardId} .st-roll-status-chat-item:hover,
    #${cardId} .st-roll-skill-preset-item:hover {
      border-color: var(--st-roll-list-item-hover-border);
      background: var(--st-roll-list-item-hover-bg);
    }

    #${cardId} .st-roll-status-chat-item.is-active,
    #${cardId} .st-roll-skill-preset-item.is-active {
      border-color: var(--st-roll-list-item-active-border);
      background: var(--st-roll-list-item-active-bg);
      box-shadow: var(--st-roll-list-item-active-shadow);
    }

    #${cardId} .st-roll-status-splitter {
      user-select: none;
      background: var(--st-roll-panel-muted-bg);
      border-left-color: var(--st-roll-content-border);
      border-right-color: var(--st-roll-content-border);
    }

    #${cardId} .st-roll-status-splitter:hover,
    #${cardId} .st-roll-status-splitter.is-resizing {
      background: var(--st-roll-tab-hover-bg);
    }

    #${cardId} .st-roll-skill-modal::backdrop,
    #${cardId} .st-roll-status-modal::backdrop {
      background: var(--st-roll-dialog-backdrop);
      backdrop-filter: var(--st-roll-dialog-backdrop-filter);
    }

    #${cardId} .stx-shared-checkbox-card {
      --stx-checkbox-accent: var(--st-roll-accent);
      --stx-checkbox-accent-soft: var(--st-roll-control-focus-ring);
      --stx-checkbox-accent-strong: var(--st-roll-accent-contrast);
      --stx-checkbox-border: var(--st-roll-control-border);
      --stx-checkbox-surface: var(--st-roll-control-bg);
      --stx-checkbox-surface-hover: var(--st-roll-control-bg-hover);
      --stx-checkbox-text-off: var(--st-roll-text-muted);
      --stx-checkbox-box-border: var(--st-roll-control-border);
      --stx-checkbox-box-bg: var(--st-roll-control-bg);
      --stx-checkbox-control-shadow: none;
    }

    #${cardId} .stx-shared-box-checkbox {
      --stx-box-checkbox-border: color-mix(in srgb, var(--st-roll-accent) 52%, var(--st-roll-workbench-panel-border));
      --stx-box-checkbox-bg: color-mix(in srgb, var(--st-roll-workbench-panel-bg) 92%, transparent);
      --stx-box-checkbox-hover-border: color-mix(in srgb, var(--st-roll-accent) 72%, #fff 10%);
      --stx-box-checkbox-focus-ring: color-mix(in srgb, var(--st-roll-accent) 24%, transparent);
      --stx-box-checkbox-checked-border: color-mix(in srgb, var(--st-roll-accent) 84%, #fff 8%);
      --stx-box-checkbox-checked-bg: color-mix(in srgb, var(--st-roll-accent) 24%, var(--st-roll-workbench-panel-bg));
      --stx-box-checkbox-indicator: var(--st-roll-accent-contrast);
    }

    #${cardId} .st-roll-content[data-st-roll-theme="dark"] .stx-shared-checkbox-control,
    #${cardId} .st-roll-content[data-st-roll-theme="light"] .stx-shared-checkbox-control {
      background: var(--stx-checkbox-surface);
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="dark"] .stx-shared-checkbox-box,
    #${cardId} .st-roll-content[data-st-roll-theme="light"] .stx-shared-checkbox-box {
      background: var(--stx-checkbox-box-bg);
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="dark"] .stx-shared-checkbox-input:checked + .stx-shared-checkbox-body .stx-shared-checkbox-control,
    #${cardId} .st-roll-content[data-st-roll-theme="light"] .stx-shared-checkbox-input:checked + .stx-shared-checkbox-body .stx-shared-checkbox-control {
      background: var(--stx-checkbox-accent);
      border-color: var(--stx-checkbox-accent);
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="dark"] .stx-shared-checkbox-input:checked + .stx-shared-checkbox-body .stx-shared-checkbox-box,
    #${cardId} .st-roll-content[data-st-roll-theme="light"] .stx-shared-checkbox-input:checked + .stx-shared-checkbox-body .stx-shared-checkbox-box {
      background: var(--stx-checkbox-accent);
      border-color: var(--stx-checkbox-accent);
      box-shadow: none;
    }

    #${cardId} .st-roll-head:hover {
      background: transparent;
      box-shadow: none;
    }

    #${cardId} .st-roll-tab:hover {
      opacity: 1;
      background: var(--st-roll-tab-hover-bg);
      box-shadow: var(--st-roll-tab-hover-shadow);
    }

    #${cardId} .st-roll-item:hover {
      border-color: var(--st-roll-item-hover-border);
      background: var(--st-roll-item-hover-bg);
      box-shadow: var(--st-roll-item-hover-shadow);
    }

    #${cardId} .st-roll-select:hover,
    #${cardId} .st-roll-input:hover,
    #${cardId} .st-roll-search:hover,
    #${cardId} .st-roll-textarea:hover {
      border-color: var(--st-roll-control-border-hover);
      background-color: var(--st-roll-control-bg-hover);
      box-shadow: 0 0 0 1px var(--st-roll-control-focus-ring);
    }

    #${cardId} .st-roll-textarea-wrap:hover {
      border-color: var(--st-roll-textarea-wrap-hover-border);
      box-shadow: var(--st-roll-textarea-wrap-hover-shadow);
    }

    #${cardId} .st-roll-btn:hover {
      border-color: var(--st-roll-btn-hover-border);
      background: var(--st-roll-btn-hover-bg);
      box-shadow: var(--st-roll-btn-hover-shadow);
    }

    #${cardId} .st-roll-btn.danger:hover {
      border-color: var(--st-roll-btn-danger-hover-border);
      background: var(--st-roll-btn-danger-hover-bg);
      box-shadow: var(--st-roll-btn-danger-hover-shadow);
    }

    #${cardId} .st-roll-select:focus,
    #${cardId} .st-roll-input:focus,
    #${cardId} .st-roll-search:focus,
    #${cardId} .st-roll-textarea:focus {
      outline: none;
      border-color: var(--st-roll-control-focus-border);
      box-shadow: 0 0 0 2px var(--st-roll-control-focus-ring);
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-select.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-input.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-search.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-textarea.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-select.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-input.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-search.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-textarea.text_pole {
      margin: 0;
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-select.text_pole,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-select.text_pole {
      background-image: none !important;
      text-align: left;
      text-align-last: left;
      appearance: auto;
      -webkit-appearance: auto;
      -moz-appearance: auto;
      padding-right: 20px;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-tab.menu_button,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-btn.menu_button,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-tab.menu_button,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-btn.menu_button {
      margin: 0;
      width: auto;
      min-height: 30px;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-tab.menu_button,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-tab.menu_button {
      flex: 1;
      min-width: 0;
      border-radius: 999px;
      padding: 6px 10px;
      filter: grayscale(0.15);
      opacity: 0.85;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-tab.menu_button.is-active,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-tab.menu_button.active,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-tab.menu_button.is-active,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-tab.menu_button.active {
      opacity: 1;
      filter: none;
      background-color: var(--white30a, rgba(255, 255, 255, 0.3));
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-btn.menu_button,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-btn.menu_button {
      padding: 3px 8px;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-select.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-input.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-search.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-textarea.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-select.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-input.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-search.text_pole:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-textarea.text_pole:hover {
      border-color: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      background-color: var(--black30a, rgba(0, 0, 0, 0.3));
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-select.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-input.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-search.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-textarea.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-select.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-input.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-search.text_pole:focus,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-textarea.text_pole:focus {
      border-color: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-tab.menu_button:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-btn.menu_button:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-tab.menu_button:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-btn.menu_button:hover {
      border-color: var(--SmartThemeBorderColor, rgba(0, 0, 0, 0.5));
      background-color: var(--white30a, rgba(255, 255, 255, 0.3));
      box-shadow: none;
    }

    #${cardId} .st-roll-content[data-st-roll-theme="tavern"] .st-roll-btn.danger.menu_button:hover,
    #${cardId} .st-roll-content[data-st-roll-theme="smart"] .st-roll-btn.danger.menu_button:hover {
      border-color: var(--st-roll-btn-danger-hover-border);
      background: var(--st-roll-btn-danger-hover-bg);
      box-shadow: var(--st-roll-btn-danger-hover-shadow);
    }

    #${cardId} .st-roll-workbench {
      --st-roll-status-sidebar-width: 276px;
      display: grid;
      min-height: min(72vh, 780px);
      border: 1px solid var(--st-roll-workbench-panel-border);
      border-radius: 14px;
      background: var(--st-roll-workbench-bg);
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
      background: var(--st-roll-workbench-panel-bg);
      border-right: 1px solid var(--st-roll-workbench-panel-border);
    }

    #${cardId} .st-roll-workbench-main {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 14px;
      background: linear-gradient(180deg, var(--st-roll-workbench-panel-bg), transparent 100%);
    }

    #${cardId} .st-roll-workbench-context,
    #${cardId} .st-roll-workbench-toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      padding: 10px 12px;
      border: 1px solid var(--st-roll-workbench-panel-border);
      border-radius: 12px;
      background: var(--st-roll-workbench-toolbar-bg);
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
      border: 1px solid var(--st-roll-workbench-panel-border);
      border-radius: 12px;
      background: var(--st-roll-workbench-toolbar-bg);
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
      color: var(--st-roll-workbench-muted);
    }

    #${cardId} .st-roll-workbench-selection {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--st-roll-workbench-panel-border);
      background: var(--st-roll-workbench-accent);
      white-space: nowrap;
    }

    #${cardId} .st-roll-status-selection-count {
      min-height: 28px;
      padding: 0 8px;
      font-size: 11px;
    }

    #${cardId} .st-roll-workbench-select {
      min-width: 132px;
    }

    #${cardId} .st-roll-inline-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--st-roll-workbench-panel-border);
      background: var(--st-roll-workbench-panel-bg);
      cursor: pointer;
      user-select: none;
    }

    #${cardId} .st-roll-status-toolbar {
      gap: 6px;
      padding: 8px 10px;
    }

    #${cardId} .st-roll-status-toolbar .st-roll-workbench-select {
      min-width: 122px;
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
      background: var(--st-roll-workbench-bg);
      border-color: var(--st-roll-workbench-panel-border);
    }

    #${cardId} .st-roll-skill-layout {
      grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
    }

    #${cardId} .st-roll-status-layout {
      grid-template-columns: minmax(220px, var(--st-roll-status-sidebar-width)) 8px minmax(0, 1fr);
    }

    #${cardId} .st-roll-skill-presets,
    #${cardId} .st-roll-status-sidebar {
      background: var(--st-roll-workbench-panel-bg);
      border-color: var(--st-roll-workbench-panel-border);
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

    #${cardId} .st-roll-status-sidebar .st-roll-workbench-select {
      min-width: 0;
      width: 100%;
    }

    #${cardId} .st-roll-status-sidebar .stx-shared-select {
      width: 100%;
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

    #${cardId} .st-roll-skill-main,
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
      border: 1px solid var(--st-roll-workbench-panel-border);
      background: var(--st-roll-workbench-accent);
    }

    #${cardId} .st-roll-skill-preset-tag.active {
      color: var(--st-roll-accent-contrast);
      background: var(--st-roll-accent);
      border-color: var(--st-roll-accent);
    }

    #${cardId} .st-roll-skill-preset-tag.locked {
      background: transparent;
    }

    #${cardId} .st-roll-skill-preset-meta,
    #${cardId} .st-roll-status-memory-state,
    #${cardId} .st-roll-status-chat-meta {
      font-size: 12px;
      line-height: 1.45;
      color: var(--st-roll-workbench-muted);
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
      color: var(--st-roll-workbench-muted);
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
      border: 1px solid var(--st-roll-workbench-panel-border);
      background: var(--st-roll-workbench-accent);
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
      color: var(--st-roll-accent-contrast);
    }

    #${cardId} .st-roll-skill-cols,
    #${cardId} .st-roll-status-cols {
      background: transparent;
      border-bottom: 1px solid var(--st-roll-workbench-panel-border);
      padding-bottom: 8px;
      margin-bottom: 0;
    }

    #${cardId} .st-roll-skill-rows,
    #${cardId} .st-roll-status-rows {
      flex: 1 1 auto;
      min-height: 0;
      padding: 10px;
      border: 1px solid var(--st-roll-workbench-panel-border);
      border-radius: 14px;
      background: var(--st-roll-workbench-panel-bg);
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
      border: 1px dashed var(--st-roll-workbench-panel-border);
      border-radius: 12px;
      background: var(--st-roll-workbench-panel-bg);
      color: var(--st-roll-workbench-muted);
    }

    @media (max-width: 680px) {
      #${cardId} .st-roll-workbench-toolbar,
      #${cardId} .st-roll-workbench-context,
      #${cardId} .st-roll-workbench-sidebar-head {
        flex-direction: column;
        align-items: stretch;
      }

      #${cardId} .st-roll-workbench-selection,
      #${cardId} .st-roll-inline-toggle,
      #${cardId} .st-roll-workbench-select {
        width: 100%;
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

      #${cardId} .st-roll-skill-actions-group,
      #${cardId} .st-roll-status-actions-group {
        width: 100%;
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

      #${cardId} .st-roll-status-sidebar .st-roll-workbench-select {
        min-width: 0;
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
        border: 1px solid var(--st-roll-workbench-panel-border);
        border-bottom: 0;
        background: var(--st-roll-modal-panel-bg);
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
        color: var(--st-roll-workbench-muted);
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

      #${cardId} .st-roll-status-toolbar .st-roll-workbench-select {
        grid-column: span 3;
        min-width: 0;
        width: 100%;
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
        border: 1px solid var(--st-roll-workbench-panel-border);
        border-radius: 16px;
        background: color-mix(in srgb, var(--st-roll-workbench-panel-bg) 88%, transparent);
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
        color: var(--st-roll-workbench-muted);
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
      #${cardId} .st-roll-status-row .st-roll-status-skills,
      #${cardId} .st-roll-status-row .stx-shared-select {
        width: 100%;
        min-width: 0;
      }

      #${cardId} .st-roll-status-row .st-roll-status-name,
      #${cardId} .st-roll-status-row .st-roll-status-modifier,
      #${cardId} .st-roll-status-row .st-roll-status-duration,
      #${cardId} .st-roll-status-row .st-roll-status-skills,
      #${cardId} .st-roll-status-row .stx-shared-select-trigger,
      #${cardId} .st-roll-status-enabled-wrap {
        min-height: 36px;
        height: 36px;
      }

      #${cardId} .st-roll-status-modifier {
        text-align: left;
      }

      #${cardId} .st-roll-status-field-scope .st-roll-status-scope-select,
      #${cardId} .st-roll-status-field-scope .stx-shared-select {
        width: 100%;
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
