import type { ResolvedWorldProfile, WorldProfileDefinition, WorldProfileDetectionResult } from './types';
import { getWorldProfileById } from './registry';

/**
 * 功能：把识别结果解析为可执行世界模板配置。
 * @param detection 世界模板识别结果。
 * @returns 解析后的世界模板配置。
 */
export function resolveWorldProfile(detection: WorldProfileDetectionResult): ResolvedWorldProfile {
    const primary = getWorldProfileById(detection.primaryProfile) || getDefaultProfile();
    const secondary = (Array.isArray(detection.secondaryProfiles) ? detection.secondaryProfiles : [])
        .map((worldProfileId: string): WorldProfileDefinition | null => getWorldProfileById(worldProfileId))
        .filter(Boolean) as WorldProfileDefinition[];
    const allProfiles = [primary, ...secondary];

    return {
        primary,
        secondary,
        mergedCapabilities: mergeCapabilities(allProfiles),
        mergedPreferredSchemas: uniqueFlatten(allProfiles.map((item): string[] => item.preferredSchemas)),
        mergedPreferredFacets: uniqueFlatten(allProfiles.map((item): string[] => item.preferredFacets)),
        mergedFieldExtensions: mergeFieldExtensions(allProfiles),
        mergedSummaryBias: {
            boostedTypes: uniqueFlatten(allProfiles.map((item): string[] => item.summaryBias.boostedTypes)),
            suppressedTypes: uniqueFlatten(allProfiles.map((item): string[] => item.summaryBias.suppressedTypes)),
        },
    };
}

/**
 * 功能：获取默认世界模板。
 * @returns 默认模板定义。
 */
function getDefaultProfile(): WorldProfileDefinition {
    return getWorldProfileById('urban_modern') as WorldProfileDefinition;
}

/**
 * 功能：合并字段扩展映射。
 * @param profiles 模板列表。
 * @returns 合并后的字段映射。
 */
function mergeFieldExtensions(profiles: WorldProfileDefinition[]): Record<string, string[]> {
    const merged: Record<string, string[]> = {};
    for (const profile of profiles) {
        for (const [schemaId, fields] of Object.entries(profile.schemaFieldExtensions)) {
            merged[schemaId] = uniqueFlatten([merged[schemaId] ?? [], fields]);
        }
    }
    return merged;
}

/**
 * 功能：合并能力开关，任一画像启用则视为启用。
 * @param profiles 模板列表。
 * @returns 合并后的能力对象。
 */
function mergeCapabilities(profiles: WorldProfileDefinition[]): ResolvedWorldProfile['mergedCapabilities'] {
    return {
        hasMagic: profiles.some((item): boolean => item.capabilities.hasMagic),
        hasCultivation: profiles.some((item): boolean => item.capabilities.hasCultivation),
        hasFantasyRace: profiles.some((item): boolean => item.capabilities.hasFantasyRace),
        hasModernTechnology: profiles.some((item): boolean => item.capabilities.hasModernTechnology),
        hasFormalPoliticalOrder: profiles.some((item): boolean => item.capabilities.hasFormalPoliticalOrder),
        hasSupernatural: profiles.some((item): boolean => item.capabilities.hasSupernatural),
    };
}

/**
 * 功能：对二维字符串数组扁平化并去重。
 * @param values 二维数组。
 * @returns 去重后的数组。
 */
function uniqueFlatten(values: string[][]): string[] {
    const merged: string[] = [];
    for (const row of values) {
        for (const item of row) {
            const normalized = String(item ?? '').trim();
            if (normalized && !merged.includes(normalized)) {
                merged.push(normalized);
            }
        }
    }
    return merged;
}
