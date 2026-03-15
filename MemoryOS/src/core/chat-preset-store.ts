import { readSdkPluginSettings, writeSdkPluginSettings } from '../../../SDK/settings';
import { getTavernSemanticSnapshotEvent } from '../../../SDK/tavern';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import type {
    AdaptivePolicy,
    ChatProfileOverride,
    EffectivePresetBundle,
    MemoryOSChatState,
    PresetScope,
    PromptInjectionProfile,
    RetentionPolicy,
    UserFacingChatPreset,
} from '../types';
import {
    DEFAULT_ADAPTIVE_POLICY,
    DEFAULT_EFFECTIVE_PRESET_BUNDLE,
    DEFAULT_PROMPT_INJECTION_PROFILE,
    DEFAULT_USER_FACING_CHAT_PRESET,
} from '../types';

interface PresetStoreBucket {
    globalPreset?: UserFacingChatPreset | null;
    scopedPresets?: Record<string, UserFacingChatPreset>;
}

const PRESET_STORE_NAMESPACE = `${MEMORY_OS_PLUGIN_ID}.preset_profiles`;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePromptProfile(profile: Partial<PromptInjectionProfile> | null | undefined): Partial<PromptInjectionProfile> {
    if (!profile || typeof profile !== 'object') {
        return {};
    }
    return {
        ...profile,
        fallbackOrder: Array.isArray(profile.fallbackOrder) ? profile.fallbackOrder.filter(Boolean) : undefined,
        wrapTag: normalizeText(profile.wrapTag) || undefined,
        settingOnlyMinScore: Number.isFinite(Number(profile.settingOnlyMinScore))
            ? Number(profile.settingOnlyMinScore)
            : undefined,
    };
}

function normalizePreset(input: unknown): UserFacingChatPreset | null {
    if (!isObjectRecord(input)) {
        return null;
    }
    const preset = input as Partial<UserFacingChatPreset>;
    return {
        ...DEFAULT_USER_FACING_CHAT_PRESET,
        ...preset,
        label: normalizeText(preset.label) || DEFAULT_USER_FACING_CHAT_PRESET.label,
        chatProfile: isObjectRecord(preset.chatProfile) ? (preset.chatProfile as ChatProfileOverride) : {},
        adaptivePolicy: isObjectRecord(preset.adaptivePolicy) ? (preset.adaptivePolicy as Partial<AdaptivePolicy>) : {},
        retentionPolicy: isObjectRecord(preset.retentionPolicy) ? (preset.retentionPolicy as Partial<RetentionPolicy>) : {},
        promptInjection: normalizePromptProfile(preset.promptInjection),
        profileRefreshInterval: Number.isFinite(Number(preset.profileRefreshInterval))
            ? Number(preset.profileRefreshInterval)
            : DEFAULT_USER_FACING_CHAT_PRESET.profileRefreshInterval,
        qualityRefreshInterval: Number.isFinite(Number(preset.qualityRefreshInterval))
            ? Number(preset.qualityRefreshInterval)
            : DEFAULT_USER_FACING_CHAT_PRESET.qualityRefreshInterval,
        autoBootstrapSemanticSeed: preset.autoBootstrapSemanticSeed !== false,
        groupLaneEnabled: preset.groupLaneEnabled !== false,
        updatedAt: Number.isFinite(Number(preset.updatedAt)) ? Number(preset.updatedAt) : Date.now(),
    };
}

function readPresetBucket(): PresetStoreBucket {
    const raw = readSdkPluginSettings(PRESET_STORE_NAMESPACE);
    const scopedSource = isObjectRecord(raw.scopedPresets) ? raw.scopedPresets : {};
    const scopedPresets: Record<string, UserFacingChatPreset> = {};
    for (const [scopeKey, preset] of Object.entries(scopedSource)) {
        const normalized = normalizePreset(preset);
        if (normalized) {
            scopedPresets[scopeKey] = normalized;
        }
    }
    return {
        globalPreset: normalizePreset(raw.globalPreset),
        scopedPresets,
    };
}

function writePresetBucket(bucket: PresetStoreBucket): void {
    writeSdkPluginSettings(PRESET_STORE_NAMESPACE, {
        globalPreset: bucket.globalPreset ?? null,
        scopedPresets: bucket.scopedPresets ?? {},
    });
}

function mergePromptProfile(...profiles: Array<Partial<PromptInjectionProfile> | null | undefined>): PromptInjectionProfile {
    const merged: PromptInjectionProfile = {
        ...DEFAULT_PROMPT_INJECTION_PROFILE,
    };
    for (const profile of profiles) {
        if (!profile) {
            continue;
        }
        Object.assign(merged, normalizePromptProfile(profile));
        if (Array.isArray(profile.fallbackOrder) && profile.fallbackOrder.length > 0) {
            merged.fallbackOrder = profile.fallbackOrder.filter(Boolean);
        }
    }
    if (!Array.isArray(merged.fallbackOrder) || merged.fallbackOrder.length === 0) {
        merged.fallbackOrder = [...DEFAULT_PROMPT_INJECTION_PROFILE.fallbackOrder];
    }
    return merged;
}

function resolveRoleScopeFromState(state?: MemoryOSChatState | null): { roleScope: PresetScope | 'none'; roleScopeKey: string } {
    const groupId = normalizeText(state?.groupMemory?.bindingSnapshot?.groupId);
    if (groupId) {
        return {
            roleScope: 'group',
            roleScopeKey: `group:${groupId}`,
        };
    }
    const roleKey = normalizeText(state?.semanticSeed?.identitySeed?.roleKey);
    if (roleKey) {
        return {
            roleScope: 'character',
            roleScopeKey: `character:${roleKey}`,
        };
    }
    const fingerprint = normalizeText(state?.characterBindingFingerprint);
    if (fingerprint) {
        const [, characterIdRaw] = fingerprint.split('|');
        const characterId = normalizeText(characterIdRaw === '-' ? '' : characterIdRaw);
        if (characterId) {
            return {
                roleScope: 'character',
                roleScopeKey: `character:${characterId}`,
            };
        }
    }
    const hostSnapshot = getTavernSemanticSnapshotEvent();
    const hostGroupId = normalizeText(hostSnapshot?.groupId);
    if (hostGroupId) {
        return {
            roleScope: 'group',
            roleScopeKey: `group:${hostGroupId}`,
        };
    }
    const hostRoleKey = normalizeText(hostSnapshot?.roleKey);
    if (hostRoleKey) {
        return {
            roleScope: 'character',
            roleScopeKey: `character:${hostRoleKey}`,
        };
    }
    return {
        roleScope: 'none',
        roleScopeKey: '',
    };
}

export function getGlobalPreset(): UserFacingChatPreset | null {
    return readPresetBucket().globalPreset ?? null;
}

export function getRolePreset(state?: MemoryOSChatState | null): UserFacingChatPreset | null {
    const bucket = readPresetBucket();
    const scopeInfo = resolveRoleScopeFromState(state);
    if (!scopeInfo.roleScopeKey) {
        return null;
    }
    return bucket.scopedPresets?.[scopeInfo.roleScopeKey] ?? null;
}

export function saveGlobalPreset(preset: UserFacingChatPreset): UserFacingChatPreset {
    const bucket = readPresetBucket();
    const normalized = normalizePreset(preset) ?? DEFAULT_USER_FACING_CHAT_PRESET;
    bucket.globalPreset = normalized;
    writePresetBucket(bucket);
    return normalized;
}

export function saveRolePreset(state: MemoryOSChatState | null | undefined, preset: UserFacingChatPreset): UserFacingChatPreset {
    const bucket = readPresetBucket();
    const scopeInfo = resolveRoleScopeFromState(state);
    if (!scopeInfo.roleScopeKey) {
        throw new Error('当前聊天缺少稳定角色绑定，无法保存角色级预设');
    }
    const normalized = normalizePreset(preset) ?? DEFAULT_USER_FACING_CHAT_PRESET;
    bucket.scopedPresets = {
        ...(bucket.scopedPresets ?? {}),
        [scopeInfo.roleScopeKey]: normalized,
    };
    writePresetBucket(bucket);
    return normalized;
}

export function clearRolePreset(state: MemoryOSChatState | null | undefined): void {
    const bucket = readPresetBucket();
    const scopeInfo = resolveRoleScopeFromState(state);
    if (!scopeInfo.roleScopeKey || !bucket.scopedPresets?.[scopeInfo.roleScopeKey]) {
        return;
    }
    const nextScoped = { ...(bucket.scopedPresets ?? {}) };
    delete nextScoped[scopeInfo.roleScopeKey];
    bucket.scopedPresets = nextScoped;
    writePresetBucket(bucket);
}

export function buildEffectivePresetBundle(state?: MemoryOSChatState | null): EffectivePresetBundle {
    const bucket = readPresetBucket();
    const scopeInfo = resolveRoleScopeFromState(state);
    const globalPreset = bucket.globalPreset ?? null;
    const rolePreset = scopeInfo.roleScopeKey ? bucket.scopedPresets?.[scopeInfo.roleScopeKey] ?? null : null;
    const chatPreset = normalizePreset(state?.userFacingPreset) ?? null;
    const effectiveChatProfile: ChatProfileOverride = {
        ...(globalPreset?.chatProfile ?? {}),
        ...(rolePreset?.chatProfile ?? {}),
        ...(chatPreset?.chatProfile ?? {}),
        vectorStrategy: {
            ...(globalPreset?.chatProfile?.vectorStrategy ?? {}),
            ...(rolePreset?.chatProfile?.vectorStrategy ?? {}),
            ...(chatPreset?.chatProfile?.vectorStrategy ?? {}),
        },
    };
    const groupLaneEnabled = chatPreset?.groupLaneEnabled
        ?? rolePreset?.groupLaneEnabled
        ?? globalPreset?.groupLaneEnabled
        ?? DEFAULT_ADAPTIVE_POLICY.groupLaneEnabled;
    const profileRefreshInterval = Number(
        chatPreset?.profileRefreshInterval
        ?? rolePreset?.profileRefreshInterval
        ?? globalPreset?.profileRefreshInterval
        ?? DEFAULT_ADAPTIVE_POLICY.profileRefreshInterval,
    );
    const qualityRefreshInterval = Number(
        chatPreset?.qualityRefreshInterval
        ?? rolePreset?.qualityRefreshInterval
        ?? globalPreset?.qualityRefreshInterval
        ?? DEFAULT_ADAPTIVE_POLICY.qualityRefreshInterval,
    );
    const effectiveAdaptivePolicy: Partial<AdaptivePolicy> = {
        ...(globalPreset?.adaptivePolicy ?? {}),
        ...(rolePreset?.adaptivePolicy ?? {}),
        ...(chatPreset?.adaptivePolicy ?? {}),
        groupLaneEnabled,
        profileRefreshInterval,
        qualityRefreshInterval,
    };
    const effectiveRetentionPolicy: Partial<RetentionPolicy> = {
        ...(globalPreset?.retentionPolicy ?? {}),
        ...(rolePreset?.retentionPolicy ?? {}),
        ...(chatPreset?.retentionPolicy ?? {}),
    };
    return {
        ...DEFAULT_EFFECTIVE_PRESET_BUNDLE,
        globalPreset,
        rolePreset,
        chatPreset,
        effectiveChatProfile,
        effectiveAdaptivePolicy,
        effectiveRetentionPolicy,
        effectivePromptInjection: mergePromptProfile(
            globalPreset?.promptInjection,
            rolePreset?.promptInjection,
            chatPreset?.promptInjection,
        ),
        profileRefreshInterval: Number.isFinite(profileRefreshInterval)
            ? Math.max(1, Math.round(profileRefreshInterval))
            : DEFAULT_EFFECTIVE_PRESET_BUNDLE.profileRefreshInterval,
        qualityRefreshInterval: Number.isFinite(qualityRefreshInterval)
            ? Math.max(1, Math.round(qualityRefreshInterval))
            : DEFAULT_EFFECTIVE_PRESET_BUNDLE.qualityRefreshInterval,
        autoBootstrapSemanticSeed: chatPreset?.autoBootstrapSemanticSeed
            ?? rolePreset?.autoBootstrapSemanticSeed
            ?? globalPreset?.autoBootstrapSemanticSeed
            ?? true,
        groupLaneEnabled,
        roleScope: scopeInfo.roleScope,
        roleScopeKey: scopeInfo.roleScopeKey,
    };
}
