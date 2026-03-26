import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { buildSharedCheckboxCard } from '../../../../_Components/sharedCheckbox';
import type {
    InjectionAggressiveness,
    InjectionPromptOption,
    InjectionPromptPreset,
} from '../../injection/injection-prompt-settings';
import {
    readInjectionPromptSettings,
    saveInjectionPromptSettings,
} from './sharedRuntime';

interface InjectionPromptTabBindOptions {
    ids: MemoryOSSettingsIds;
}

type InjectionPromptOptionDescriptor = {
    option: InjectionPromptOption;
    inputId: string;
};

/**
 * 功能：渲染“注入提示词”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildInjectionPromptTabPanel(ids: MemoryOSSettingsIds): string {
    const enabledCheckboxMarkup = buildSharedCheckboxCard({
        id: ids.injectionPromptEnabledId,
        checkedLabel: '开启',
        uncheckedLabel: '关闭',
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
    });
    const dynamicFloorCheckboxMarkup = buildSharedCheckboxCard({
        id: ids.injectionPromptForceDynamicFloorId,
        checkedLabel: '开启',
        uncheckedLabel: '关闭',
        containerClassName: 'stx-ui-inline-checkbox is-control-only',
    });
    const optionCardsMarkup = [
        { id: ids.injectionPromptWorldSettingId, title: '世界设定' },
        { id: ids.injectionPromptCharacterSettingId, title: '角色设定' },
        { id: ids.injectionPromptRelationshipStateId, title: '关系状态' },
        { id: ids.injectionPromptCurrentSceneId, title: '当前场景' },
        { id: ids.injectionPromptRecentPlotId, title: '近期剧情' },
    ].map((item: { id: string; title: string }): string => {
        return buildSharedCheckboxCard({
            id: item.id,
            title: item.title,
            checkedLabel: '开启',
            uncheckedLabel: '关闭',
            containerClassName: 'stx-ui-inline-checkbox is-compact',
        });
    }).join('');

    return `
      <div id="${ids.panelPromptId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
        <div class="stx-ui-divider">
          <i class="fa-solid fa-file-lines"></i>
          <span>注入提示词</span>
          <div class="stx-ui-divider-line"></div>
        </div>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="inject prompt base context system">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">每次回复注入基础提示词</div>
            <div class="stx-ui-item-desc">开启后每轮都会尝试注入基础背景，使用 system 角色插入到现有 system 提示词之后。</div>
          </div>
          <div class="stx-ui-inline">
            ${enabledCheckboxMarkup}
          </div>
        </label>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="inject prompt preset strategy">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">注入预设</div>
            <div class="stx-ui-item-desc">用于控制基础注入更偏设定还是更偏剧情。</div>
          </div>
          <div class="stx-ui-inline">
            <select id="${ids.injectionPromptPresetId}" class="stx-select stx-memory-select">
              <option value="balanced_enhanced">平衡增强</option>
              <option value="story_priority">剧情优先</option>
              <option value="setting_priority">设定优先</option>
            </select>
          </div>
        </label>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="inject prompt aggressiveness stable balanced aggressive">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">积极度</div>
            <div class="stx-ui-item-desc">决定每轮基础注入与主链召回的主动程度。</div>
          </div>
          <div class="stx-ui-inline">
            <select id="${ids.injectionPromptAggressivenessId}" class="stx-select stx-memory-select">
              <option value="stable">稳健</option>
              <option value="balanced">平衡</option>
              <option value="aggressive">积极</option>
            </select>
          </div>
        </label>

        <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="inject prompt dynamic floor scene events">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">强制动态局势保底</div>
            <div class="stx-ui-item-desc">开启后会优先保底注入当前场景与近期事件。</div>
          </div>
          <div class="stx-ui-inline">
            ${dynamicFloorCheckboxMarkup}
          </div>
        </label>

        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="inject prompt world character relationship scene recent plot option">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">默认注入内容</div>
            <div class="stx-ui-item-desc">“近期剧情”可能增加 token 占用，建议按需开启。</div>
          </div>
          <div class="stx-ui-row stx-ui-grid-form">
            ${optionCardsMarkup}
          </div>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：收集“注入提示词”页签中的多选项配置。
 * @param ids 控件 ID 集合。
 * @returns 当前表单中的选项数组。
 */
function collectSelectedOptions(ids: MemoryOSSettingsIds): InjectionPromptOption[] {
    const optionDescriptors: InjectionPromptOptionDescriptor[] = [
        { option: 'world_setting', inputId: ids.injectionPromptWorldSettingId },
        { option: 'character_setting', inputId: ids.injectionPromptCharacterSettingId },
        { option: 'relationship_state', inputId: ids.injectionPromptRelationshipStateId },
        { option: 'current_scene', inputId: ids.injectionPromptCurrentSceneId },
        { option: 'recent_plot', inputId: ids.injectionPromptRecentPlotId },
    ];
    return optionDescriptors
        .filter((item: InjectionPromptOptionDescriptor): boolean => {
            const element = document.getElementById(item.inputId) as HTMLInputElement | null;
            return element?.checked === true;
        })
        .map((item: InjectionPromptOptionDescriptor): InjectionPromptOption => item.option);
}

/**
 * 功能：把基础注入配置写回“注入提示词”表单。
 * @param ids 控件 ID 集合。
 * @returns 无返回值。
 */
function writeInjectionPromptInputs(ids: MemoryOSSettingsIds): void {
    const settings = readInjectionPromptSettings();
    const enabledElement = document.getElementById(ids.injectionPromptEnabledId) as HTMLInputElement | null;
    if (enabledElement) {
        enabledElement.checked = settings.enabled;
    }
    const presetElement = document.getElementById(ids.injectionPromptPresetId) as HTMLSelectElement | null;
    if (presetElement) {
        presetElement.value = settings.preset;
    }
    const aggressivenessElement = document.getElementById(ids.injectionPromptAggressivenessId) as HTMLSelectElement | null;
    if (aggressivenessElement) {
        aggressivenessElement.value = settings.aggressiveness;
    }
    const dynamicFloorElement = document.getElementById(ids.injectionPromptForceDynamicFloorId) as HTMLInputElement | null;
    if (dynamicFloorElement) {
        dynamicFloorElement.checked = settings.forceDynamicFloor;
    }
    const selectedSet = new Set(settings.selectedOptions);
    const optionDescriptors: InjectionPromptOptionDescriptor[] = [
        { option: 'world_setting', inputId: ids.injectionPromptWorldSettingId },
        { option: 'character_setting', inputId: ids.injectionPromptCharacterSettingId },
        { option: 'relationship_state', inputId: ids.injectionPromptRelationshipStateId },
        { option: 'current_scene', inputId: ids.injectionPromptCurrentSceneId },
        { option: 'recent_plot', inputId: ids.injectionPromptRecentPlotId },
    ];
    optionDescriptors.forEach((item: InjectionPromptOptionDescriptor): void => {
        const element = document.getElementById(item.inputId) as HTMLInputElement | null;
        if (element) {
            element.checked = selectedSet.has(item.option);
        }
    });
}

/**
 * 功能：读取预设下拉框当前值。
 * @param ids 控件 ID 集合。
 * @returns 预设值。
 */
function readPresetInput(ids: MemoryOSSettingsIds): InjectionPromptPreset {
    const element = document.getElementById(ids.injectionPromptPresetId) as HTMLSelectElement | null;
    return String(element?.value ?? '').trim() as InjectionPromptPreset;
}

/**
 * 功能：读取积极度下拉框当前值。
 * @param ids 控件 ID 集合。
 * @returns 积极度值。
 */
function readAggressivenessInput(ids: MemoryOSSettingsIds): InjectionAggressiveness {
    const element = document.getElementById(ids.injectionPromptAggressivenessId) as HTMLSelectElement | null;
    return String(element?.value ?? '').trim() as InjectionAggressiveness;
}

/**
 * 功能：绑定“注入提示词”页签事件。
 * @param options 绑定参数。
 * @returns 无返回值。
 */
export function bindInjectionPromptTab(options: InjectionPromptTabBindOptions): void {
    const { ids } = options;
    writeInjectionPromptInputs(ids);

    const enabledElement = document.getElementById(ids.injectionPromptEnabledId) as HTMLInputElement | null;
    if (enabledElement) {
        enabledElement.addEventListener('change', (): void => {
            saveInjectionPromptSettings({
                enabled: enabledElement.checked,
            });
        });
    }
    const presetElement = document.getElementById(ids.injectionPromptPresetId) as HTMLSelectElement | null;
    if (presetElement) {
        presetElement.addEventListener('change', (): void => {
            saveInjectionPromptSettings({
                preset: readPresetInput(ids),
            });
            writeInjectionPromptInputs(ids);
        });
    }
    const aggressivenessElement = document.getElementById(ids.injectionPromptAggressivenessId) as HTMLSelectElement | null;
    if (aggressivenessElement) {
        aggressivenessElement.addEventListener('change', (): void => {
            saveInjectionPromptSettings({
                aggressiveness: readAggressivenessInput(ids),
            });
        });
    }
    const dynamicFloorElement = document.getElementById(ids.injectionPromptForceDynamicFloorId) as HTMLInputElement | null;
    if (dynamicFloorElement) {
        dynamicFloorElement.addEventListener('change', (): void => {
            saveInjectionPromptSettings({
                forceDynamicFloor: dynamicFloorElement.checked,
            });
            writeInjectionPromptInputs(ids);
        });
    }

    const optionInputIds = [
        ids.injectionPromptWorldSettingId,
        ids.injectionPromptCharacterSettingId,
        ids.injectionPromptRelationshipStateId,
        ids.injectionPromptCurrentSceneId,
        ids.injectionPromptRecentPlotId,
    ];
    optionInputIds.forEach((inputId: string): void => {
        const inputElement = document.getElementById(inputId) as HTMLInputElement | null;
        if (!inputElement) {
            return;
        }
        inputElement.addEventListener('change', (): void => {
            saveInjectionPromptSettings({
                selectedOptions: collectSelectedOptions(ids),
            });
        });
    });
}
