import { buildSettingPageStyles, buildSettingPageTemplate, hydrateSettingPage } from '../../../_Components/Setting';
import { buildSharedCheckboxCard, buildSharedCheckboxStyles } from '../../../_Components/sharedCheckbox';
import { buildSharedButton, buildSharedButtonStyles } from '../../../_Components/sharedButton';
import { buildSharedInputField, buildSharedInputStyles } from '../../../_Components/sharedInput';
import { buildThemeVars } from '../../../SDK/theme';
import { logger } from '../runtime/runtime-services';
import { openUnifiedMemoryWorkbench } from './unifiedMemoryWorkbench';
import {
    DEFAULT_MEMORY_OS_SETTINGS,
    type MemoryOSSettings,
    readMemoryOSSettings,
    writeMemoryOSSettings,
} from '../settings/store';

const CARD_ID: string = 'stx-memoryos-card';
const STYLE_ID: string = 'stx-memoryos-settings-style';
const DRAWER_TOGGLE_ID: string = 'stx-memoryos-drawer-toggle';
const DRAWER_CONTENT_ID: string = 'stx-memoryos-drawer-content';
const DRAWER_ICON_ID: string = 'stx-memoryos-drawer-icon';

const BTN_ID: string = 'stx-memoryos-open-workbench';
const SAVE_BTN_ID: string = 'stx-memoryos-save-settings';
const RESET_BTN_ID: string = 'stx-memoryos-reset-settings';
const ENABLED_ID: string = 'stx-memoryos-enabled';
const INJECTION_PROMPT_ID: string = 'stx-memoryos-injection-prompt-enabled';
const INJECTION_PREVIEW_ID: string = 'stx-memoryos-injection-preview-enabled';
const CONTEXT_TOKENS_ID: string = 'stx-memoryos-context-max-tokens';
const STATUS_ID: string = 'stx-memoryos-settings-status';

const TAB_BASIC_ID: string = 'stx-memoryos-tab-basic';
const TAB_INJECTION_ID: string = 'stx-memoryos-tab-injection';
const PANEL_BASIC_ID: string = 'stx-memoryos-panel-basic';
const PANEL_INJECTION_ID: string = 'stx-memoryos-panel-injection';

/**
 * 功能：注入设置样式，复用与 LLMHub 相同的共享控件样式。
 */
function ensureSettingsStyles(): void {
    if (document.getElementById(STYLE_ID)) {
        return;
    }
    const style: HTMLStyleElement = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        ${buildThemeVars(`#${CARD_ID} .stx-setting-content`)}
        ${buildSettingPageStyles(`#${CARD_ID}`)}
        ${buildSharedCheckboxStyles(`#${CARD_ID}`)}
        ${buildSharedButtonStyles(`#${CARD_ID}`)}
        ${buildSharedInputStyles(`#${CARD_ID}`)}

        #${CARD_ID} {
            margin-bottom: 5px;
            color: inherit;
        }
        #${CARD_ID} .stx-setting-content {
            border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.14));
            border-top: 0;
            border-radius: 0 0 10px 10px;
            padding: 10px;
            background: var(--SmartThemeBlurTintColor, rgba(0, 0, 0, 0.16));
            box-sizing: border-box;
            width: 100%;
        }

        #${CARD_ID} .stx-ui-tabs {
            display: flex;
            align-items: center;
            gap: 4px;
            flex-wrap: wrap;
            padding: 4px;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.16));
            border-radius: 999px;
            margin-bottom: 10px;
            background: rgba(0, 0, 0, 0.22);
        }
        #${CARD_ID} .stx-ui-tab {
            flex: 1 1 0;
            min-width: max-content;
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
            opacity: 0.78;
        }
        #${CARD_ID} .stx-ui-tab.is-active {
            opacity: 1;
            background: rgba(197, 160, 89, 0.38);
        }

        #${CARD_ID} .stx-ui-panel {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #${CARD_ID} .stx-ui-panel[hidden] {
            display: none !important;
        }
        #${CARD_ID} .stx-ui-item {
            border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.18));
            border-radius: 10px;
            padding: 12px;
            background: rgba(0, 0, 0, 0.14);
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        #${CARD_ID} .stx-ui-item-stack {
            flex-direction: column;
            align-items: stretch;
        }
        #${CARD_ID} .stx-ui-item-main {
            min-width: 0;
            flex: 1;
        }
        #${CARD_ID} .stx-ui-item-title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 3px;
        }
        #${CARD_ID} .stx-ui-item-desc {
            font-size: 12px;
            line-height: 1.45;
            opacity: 0.75;
            word-break: break-word;
        }
        #${CARD_ID} .stx-ui-inline {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-shrink: 0;
        }
        #${CARD_ID} .stx-ui-form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 8px;
            width: 100%;
        }
        #${CARD_ID} .stx-ui-field {
            display: flex;
            flex-direction: column;
            gap: 6px;
            min-width: 0;
        }
        #${CARD_ID} .stx-ui-field-label {
            font-size: 12px;
            opacity: 0.86;
        }
        #${CARD_ID} .stx-ui-input {
            width: 100%;
            min-width: 0;
            max-width: 100%;
            box-sizing: border-box;
            min-height: 30px;
        }
        #${CARD_ID} .stx-ui-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${CARD_ID} .stx-ui-status {
            font-size: 12px;
            opacity: 0.8;
        }

        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-copy {
            display: none;
        }
        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-body {
            width: auto;
        }
        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-control {
            min-width: 70px;
            justify-content: center;
        }

        @media (max-width: 900px) {
            #${CARD_ID} .stx-ui-form-grid {
                grid-template-columns: minmax(0, 1fr);
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：构建设置页内容。
 * @returns 设置页 HTML。
 */
function buildSettingsContentHtml(): string {
    const openWorkbenchBtn: string = buildSharedButton({
        id: BTN_ID,
        label: '打开统一记忆工作台',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-table-cells-large',
    });

    const enabledCheckbox: string = buildSharedCheckboxCard({
        id: ENABLED_ID,
        title: '',
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
        inputAttributes: { 'aria-label': '启用 MemoryOS' },
    });
    const injectionPromptCheckbox: string = buildSharedCheckboxCard({
        id: INJECTION_PROMPT_ID,
        title: '',
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
        inputAttributes: { 'aria-label': '启用 Prompt 注入' },
    });
    const injectionPreviewCheckbox: string = buildSharedCheckboxCard({
        id: INJECTION_PREVIEW_ID,
        title: '',
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
        inputAttributes: { 'aria-label': '启用注入预览' },
    });

    const contextInput: string = buildSharedInputField({
        id: CONTEXT_TOKENS_ID,
        type: 'number',
        className: 'stx-ui-input',
        attributes: { min: 200, max: 10000, step: 50 },
    });

    const resetBtn: string = buildSharedButton({
        id: RESET_BTN_ID,
        label: '恢复默认',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate-left',
    });
    const saveBtn: string = buildSharedButton({
        id: SAVE_BTN_ID,
        label: '保存设置',
        variant: 'primary',
        iconClassName: 'fa-solid fa-floppy-disk',
    });

    return `
        <div class="stx-ui-tabs">
            <button id="${TAB_BASIC_ID}" type="button" class="stx-ui-tab is-active">
                <i class="fa-solid fa-gear"></i>
                <span>基础</span>
            </button>
            <button id="${TAB_INJECTION_ID}" type="button" class="stx-ui-tab">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span>注入</span>
            </button>
        </div>

        <div id="${PANEL_BASIC_ID}" class="stx-ui-panel">
            <div class="stx-ui-item">
                <div class="stx-ui-item-main">
                    <div class="stx-ui-item-title">工作台</div>
                    <div class="stx-ui-item-desc">进入统一记忆工作台，管理条目、类型和角色记忆。</div>
                </div>
                <div class="stx-ui-inline">${openWorkbenchBtn}</div>
            </div>

            <div class="stx-ui-item">
                <div class="stx-ui-item-main">
                    <div class="stx-ui-item-title">启用 MemoryOS</div>
                    <div class="stx-ui-item-desc">关闭后将停止消息写入、总结与注入。</div>
                </div>
                <div class="stx-ui-inline">${enabledCheckbox}</div>
            </div>
        </div>

        <div id="${PANEL_INJECTION_ID}" class="stx-ui-panel" hidden>
            <div class="stx-ui-item">
                <div class="stx-ui-item-main">
                    <div class="stx-ui-item-title">启用 Prompt 注入</div>
                    <div class="stx-ui-item-desc">控制是否执行主注入链路。</div>
                </div>
                <div class="stx-ui-inline">${injectionPromptCheckbox}</div>
            </div>

            <div class="stx-ui-item">
                <div class="stx-ui-item-main">
                    <div class="stx-ui-item-title">启用注入预览</div>
                    <div class="stx-ui-item-desc">控制是否计算并输出基础注入预览信息。</div>
                </div>
                <div class="stx-ui-inline">${injectionPreviewCheckbox}</div>
            </div>

            <div class="stx-ui-item stx-ui-item-stack">
                <div class="stx-ui-item-main">
                    <div class="stx-ui-item-title">上下文上限</div>
                    <div class="stx-ui-item-desc">限制注入阶段使用的最大 token 预算。</div>
                </div>
                <div class="stx-ui-form-grid">
                    <div class="stx-ui-field">
                        <label class="stx-ui-field-label" for="${CONTEXT_TOKENS_ID}">contextMaxTokens</label>
                        ${contextInput}
                    </div>
                </div>
            </div>
        </div>

        <div class="stx-ui-actions">
            <div id="${STATUS_ID}" class="stx-ui-status">未保存</div>
            <div class="stx-ui-inline">
                ${resetBtn}
                ${saveBtn}
            </div>
        </div>
    `;
}

/**
 * 功能：构建抽屉卡片。
 * @returns 卡片 HTML。
 */
function buildCardTemplateHtml(): string {
    return buildSettingPageTemplate({
        drawerToggleId: DRAWER_TOGGLE_ID,
        drawerContentId: DRAWER_CONTENT_ID,
        drawerIconId: DRAWER_ICON_ID,
        title: 'MemoryOS 设置',
        badgeText: 'Unified',
        contentHtml: buildSettingsContentHtml(),
    });
}

/**
 * 功能：绑定标签切换逻辑。
 */
function bindTabEvents(): void {
    const basicTab: HTMLButtonElement | null = document.getElementById(TAB_BASIC_ID) as HTMLButtonElement | null;
    const injectionTab: HTMLButtonElement | null = document.getElementById(TAB_INJECTION_ID) as HTMLButtonElement | null;
    const basicPanel: HTMLElement | null = document.getElementById(PANEL_BASIC_ID);
    const injectionPanel: HTMLElement | null = document.getElementById(PANEL_INJECTION_ID);
    if (!basicTab || !injectionTab || !basicPanel || !injectionPanel) {
        return;
    }

    const switchTab = (tab: 'basic' | 'injection'): void => {
        const isBasic: boolean = tab === 'basic';
        basicTab.classList.toggle('is-active', isBasic);
        injectionTab.classList.toggle('is-active', !isBasic);
        basicPanel.hidden = !isBasic;
        injectionPanel.hidden = isBasic;
    };

    basicTab.onclick = (): void => switchTab('basic');
    injectionTab.onclick = (): void => switchTab('injection');
    switchTab('basic');
}

/**
 * 功能：把设置写入表单控件。
 * @param settings 当前设置。
 */
function syncSettingsToForm(settings: MemoryOSSettings): void {
    const enabledInput: HTMLInputElement | null = document.getElementById(ENABLED_ID) as HTMLInputElement | null;
    const injectionPromptInput: HTMLInputElement | null = document.getElementById(INJECTION_PROMPT_ID) as HTMLInputElement | null;
    const injectionPreviewInput: HTMLInputElement | null = document.getElementById(INJECTION_PREVIEW_ID) as HTMLInputElement | null;
    const contextTokensInput: HTMLInputElement | null = document.getElementById(CONTEXT_TOKENS_ID) as HTMLInputElement | null;
    if (enabledInput) enabledInput.checked = settings.enabled;
    if (injectionPromptInput) injectionPromptInput.checked = settings.injectionPromptEnabled;
    if (injectionPreviewInput) injectionPreviewInput.checked = settings.injectionPreviewEnabled;
    if (contextTokensInput) contextTokensInput.value = String(settings.contextMaxTokens);
}

/**
 * 功能：从表单读取设置。
 * @returns 表单设置。
 */
function readSettingsFromForm(): MemoryOSSettings {
    const enabledInput: HTMLInputElement | null = document.getElementById(ENABLED_ID) as HTMLInputElement | null;
    const injectionPromptInput: HTMLInputElement | null = document.getElementById(INJECTION_PROMPT_ID) as HTMLInputElement | null;
    const injectionPreviewInput: HTMLInputElement | null = document.getElementById(INJECTION_PREVIEW_ID) as HTMLInputElement | null;
    const contextTokensInput: HTMLInputElement | null = document.getElementById(CONTEXT_TOKENS_ID) as HTMLInputElement | null;
    return {
        enabled: enabledInput?.checked ?? DEFAULT_MEMORY_OS_SETTINGS.enabled,
        injectionPromptEnabled: injectionPromptInput?.checked ?? DEFAULT_MEMORY_OS_SETTINGS.injectionPromptEnabled,
        injectionPreviewEnabled: injectionPreviewInput?.checked ?? DEFAULT_MEMORY_OS_SETTINGS.injectionPreviewEnabled,
        contextMaxTokens: Number(contextTokensInput?.value ?? DEFAULT_MEMORY_OS_SETTINGS.contextMaxTokens),
    };
}

/**
 * 功能：更新状态提示。
 * @param text 状态文本。
 */
function setStatusText(text: string): void {
    const statusEl: HTMLElement | null = document.getElementById(STATUS_ID);
    if (statusEl) {
        statusEl.textContent = text;
    }
}

/**
 * 功能：绑定按钮交互事件。
 */
function bindActionEvents(): void {
    const openBtn: HTMLButtonElement | null = document.getElementById(BTN_ID) as HTMLButtonElement | null;
    if (openBtn) {
        openBtn.onclick = (): void => {
            openUnifiedMemoryWorkbench();
        };
    }

    const saveBtn: HTMLButtonElement | null = document.getElementById(SAVE_BTN_ID) as HTMLButtonElement | null;
    if (saveBtn) {
        saveBtn.onclick = (): void => {
            const nextSettings: MemoryOSSettings = readSettingsFromForm();
            const saved: MemoryOSSettings = writeMemoryOSSettings(nextSettings);
            syncSettingsToForm(saved);
            setStatusText('设置已保存，下一轮对话生效');
        };
    }

    const resetBtn: HTMLButtonElement | null = document.getElementById(RESET_BTN_ID) as HTMLButtonElement | null;
    if (resetBtn) {
        resetBtn.onclick = (): void => {
            const saved: MemoryOSSettings = writeMemoryOSSettings({ ...DEFAULT_MEMORY_OS_SETTINGS });
            syncSettingsToForm(saved);
            setStatusText('已恢复默认设置');
        };
    }
}

/**
 * 功能：渲染 MemoryOS 设置入口。
 * @returns 执行结果。
 */
export async function renderSettingsUi(): Promise<void> {
    const container: Element | null = document.querySelector('#extensions_settings');
    if (!container) {
        logger.warn('[MemoryOS] 未找到 extensions_settings 容器');
        return;
    }

    ensureSettingsStyles();
    let card: HTMLDivElement | null = document.getElementById(CARD_ID) as HTMLDivElement | null;
    if (!card) {
        card = document.createElement('div');
        card.id = CARD_ID;
        card.innerHTML = buildCardTemplateHtml();
        container.prepend(card);
    }

    hydrateSettingPage(card);
    bindTabEvents();
    bindActionEvents();
    syncSettingsToForm(readMemoryOSSettings());
    setStatusText('已加载当前设置');
}

/**
 * 功能：兼容导出旧世界书入口（已下线）。
 */
export function openWorldbookInitPanel(): void {
    openUnifiedMemoryWorkbench({ initialView: 'world' });
}
