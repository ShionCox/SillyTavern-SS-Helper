export type InjectionPromptOption =
    | 'world_setting'
    | 'character_setting'
    | 'relationship_state'
    | 'current_scene'
    | 'recent_plot';

export type InjectionPromptPreset =
    | 'balanced_enhanced'
    | 'story_priority'
    | 'setting_priority';

export type InjectionAggressiveness =
    | 'stable'
    | 'balanced'
    | 'aggressive';

export interface InjectionPromptSettings {
    enabled: boolean;
    selectedOptions: InjectionPromptOption[];
    preset: InjectionPromptPreset;
    aggressiveness: InjectionAggressiveness;
    forceDynamicFloor: boolean;
}

const DEFAULT_INJECTION_PROMPT_SETTINGS: InjectionPromptSettings = {
    enabled: true,
    selectedOptions: ['world_setting', 'character_setting', 'relationship_state', 'current_scene', 'recent_plot'],
    preset: 'balanced_enhanced',
    aggressiveness: 'balanced',
    forceDynamicFloor: true,
};

const INJECTION_PROMPT_OPTION_VALUES: InjectionPromptOption[] = [
    'world_setting',
    'character_setting',
    'relationship_state',
    'current_scene',
    'recent_plot',
];

const INJECTION_PROMPT_PRESET_VALUES: InjectionPromptPreset[] = [
    'balanced_enhanced',
    'story_priority',
    'setting_priority',
];

const INJECTION_PROMPT_AGGRESSIVENESS_VALUES: InjectionAggressiveness[] = [
    'stable',
    'balanced',
    'aggressive',
];

/**
 * 功能：把任意值归一化为合法的基础注入选项。
 * @param value 待归一化的选项值。
 * @returns 合法选项；不合法时返回 `null`。
 */
function normalizeInjectionPromptOption(value: unknown): InjectionPromptOption | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (INJECTION_PROMPT_OPTION_VALUES.includes(normalized as InjectionPromptOption)) {
        return normalized as InjectionPromptOption;
    }
    return null;
}

/**
 * 功能：把任意值归一化为合法的注入预设。
 * @param value 待归一化的预设值。
 * @returns 合法预设；不合法时返回默认预设。
 */
function normalizeInjectionPromptPreset(value: unknown): InjectionPromptPreset {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (INJECTION_PROMPT_PRESET_VALUES.includes(normalized as InjectionPromptPreset)) {
        return normalized as InjectionPromptPreset;
    }
    return DEFAULT_INJECTION_PROMPT_SETTINGS.preset;
}

/**
 * 功能：把任意值归一化为合法的积极度档位。
 * @param value 待归一化的积极度值。
 * @returns 合法积极度；不合法时返回默认值。
 */
function normalizeInjectionAggressiveness(value: unknown): InjectionAggressiveness {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (INJECTION_PROMPT_AGGRESSIVENESS_VALUES.includes(normalized as InjectionAggressiveness)) {
        return normalized as InjectionAggressiveness;
    }
    return DEFAULT_INJECTION_PROMPT_SETTINGS.aggressiveness;
}

/**
 * 功能：读取默认基础注入配置快照。
 * @returns 默认配置对象。
 */
export function getDefaultInjectionPromptSettings(): InjectionPromptSettings {
    return {
        enabled: DEFAULT_INJECTION_PROMPT_SETTINGS.enabled,
        selectedOptions: [...DEFAULT_INJECTION_PROMPT_SETTINGS.selectedOptions],
        preset: DEFAULT_INJECTION_PROMPT_SETTINGS.preset,
        aggressiveness: DEFAULT_INJECTION_PROMPT_SETTINGS.aggressiveness,
        forceDynamicFloor: DEFAULT_INJECTION_PROMPT_SETTINGS.forceDynamicFloor,
    };
}

/**
 * 功能：按预设修正基础注入选项，确保策略强度与内容项一致。
 * @param input 已归一化前的配置。
 * @returns 预设修正后的选项列表。
 */
function resolvePresetSelectedOptions(input: {
    selectedOptions: InjectionPromptOption[];
    preset: InjectionPromptPreset;
    forceDynamicFloor: boolean;
}): InjectionPromptOption[] {
    const optionSet = new Set<InjectionPromptOption>(input.selectedOptions);
    if (input.preset === 'balanced_enhanced') {
        optionSet.add('world_setting');
        optionSet.add('character_setting');
        optionSet.add('relationship_state');
        optionSet.add('current_scene');
    }
    if (input.preset === 'story_priority') {
        optionSet.add('current_scene');
        optionSet.add('recent_plot');
        optionSet.add('relationship_state');
    }
    if (input.preset === 'setting_priority') {
        optionSet.add('world_setting');
        optionSet.add('character_setting');
        optionSet.add('relationship_state');
    }
    if (input.forceDynamicFloor) {
        optionSet.add('current_scene');
        optionSet.add('recent_plot');
    }
    return Array.from(optionSet);
}

/**
 * 功能：归一化基础注入配置，保证开关、预设与选项均可用。
 * @param input 任意来源的配置输入。
 * @returns 归一化后的配置结果。
 */
export function normalizeInjectionPromptSettings(input: unknown): InjectionPromptSettings {
    if (!input || typeof input !== 'object') {
        return getDefaultInjectionPromptSettings();
    }
    const record = input as {
        enabled?: unknown;
        selectedOptions?: unknown;
        preset?: unknown;
        aggressiveness?: unknown;
        forceDynamicFloor?: unknown;
    };
    const options = Array.isArray(record.selectedOptions)
        ? record.selectedOptions
            .map((item: unknown): InjectionPromptOption | null => normalizeInjectionPromptOption(item))
            .filter((item: InjectionPromptOption | null): item is InjectionPromptOption => item != null)
        : [];
    const uniqueOptions = Array.from(new Set(options));
    const fallbackOptions = uniqueOptions.length > 0
        ? uniqueOptions
        : [...DEFAULT_INJECTION_PROMPT_SETTINGS.selectedOptions];
    const preset = normalizeInjectionPromptPreset(record.preset);
    const forceDynamicFloor = record.forceDynamicFloor !== false;
    const normalizedOptions = resolvePresetSelectedOptions({
        selectedOptions: fallbackOptions,
        preset,
        forceDynamicFloor,
    });

    return {
        enabled: record.enabled !== false,
        selectedOptions: normalizedOptions,
        preset,
        aggressiveness: normalizeInjectionAggressiveness(record.aggressiveness),
        forceDynamicFloor,
    };
}
