import { describe, expect, it } from 'vitest';
import {
    getDefaultInjectionPromptSettings,
    normalizeInjectionPromptSettings,
} from '../src/injection/injection-prompt-settings';

describe('injection-prompt-settings', (): void => {
    it('缺省输入会回退到默认配置', (): void => {
        expect(normalizeInjectionPromptSettings(null)).toEqual(getDefaultInjectionPromptSettings());
        expect(normalizeInjectionPromptSettings(undefined)).toEqual(getDefaultInjectionPromptSettings());
    });

    it('非法选项会被过滤并按预设补全动态保底', (): void => {
        const normalized = normalizeInjectionPromptSettings({
            enabled: true,
            selectedOptions: ['invalid', 'world_setting', 'world_setting'],
            preset: 'balanced_enhanced',
            forceDynamicFloor: true,
        });
        expect(normalized.enabled).toBe(true);
        expect(normalized.selectedOptions).toContain('world_setting');
        expect(normalized.selectedOptions).toContain('current_scene');
        expect(normalized.selectedOptions).toContain('recent_plot');
    });

    it('preset/aggressiveness 会在非法值时回退默认', (): void => {
        const normalized = normalizeInjectionPromptSettings({
            preset: 'invalid_preset',
            aggressiveness: 'invalid_aggressiveness',
        });
        expect(normalized.preset).toBe(getDefaultInjectionPromptSettings().preset);
        expect(normalized.aggressiveness).toBe(getDefaultInjectionPromptSettings().aggressiveness);
    });

    it('enabled 仅在显式 false 时关闭', (): void => {
        expect(normalizeInjectionPromptSettings({ enabled: false }).enabled).toBe(false);
        expect(normalizeInjectionPromptSettings({ enabled: 'false' }).enabled).toBe(true);
        expect(normalizeInjectionPromptSettings({ enabled: true }).enabled).toBe(true);
    });
});
