import type { WorldProfileDefinition } from './types';
import { BUILTIN_WORLD_PROFILES } from './profiles';

const profileMap = new Map<string, WorldProfileDefinition>();

for (const profile of BUILTIN_WORLD_PROFILES) {
    profileMap.set(profile.worldProfileId, profile);
}

/**
 * 功能：获取所有世界模板。
 * @returns 世界模板数组。
 */
export function listWorldProfiles(): WorldProfileDefinition[] {
    return Array.from(profileMap.values());
}

/**
 * 功能：根据模板 ID 读取模板。
 * @param worldProfileId 模板 ID。
 * @returns 模板定义，不存在时返回 null。
 */
export function getWorldProfileById(worldProfileId: string): WorldProfileDefinition | null {
    return profileMap.get(String(worldProfileId ?? '').trim()) ?? null;
}

/**
 * 功能：注册或覆盖世界模板。
 * @param profile 模板定义。
 */
export function registerWorldProfile(profile: WorldProfileDefinition): void {
    profileMap.set(String(profile.worldProfileId ?? '').trim(), profile);
}

