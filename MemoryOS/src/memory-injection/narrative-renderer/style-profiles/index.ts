import type { NarrativeStyleProfile } from '../base-renderer';
import { URBAN_MODERN_STYLE_PROFILE } from './urban-modern';
import { ANCIENT_TRADITIONAL_STYLE_PROFILE } from './ancient-traditional';
import { FANTASY_MAGIC_STYLE_PROFILE } from './fantasy-magic';
import { SUPERNATURAL_HIDDEN_STYLE_PROFILE } from './supernatural-hidden';

const styleMap = new Map<string, NarrativeStyleProfile>([
    [URBAN_MODERN_STYLE_PROFILE.styleId, URBAN_MODERN_STYLE_PROFILE],
    [ANCIENT_TRADITIONAL_STYLE_PROFILE.styleId, ANCIENT_TRADITIONAL_STYLE_PROFILE],
    [FANTASY_MAGIC_STYLE_PROFILE.styleId, FANTASY_MAGIC_STYLE_PROFILE],
    [SUPERNATURAL_HIDDEN_STYLE_PROFILE.styleId, SUPERNATURAL_HIDDEN_STYLE_PROFILE],
]);

/**
 * 功能：按样式 ID 读取叙事风格。
 * @param styleId 样式 ID。
 * @returns 对应风格，不存在时返回现代都市风格。
 */
export function getNarrativeStyleProfile(styleId: string): NarrativeStyleProfile {
    return styleMap.get(String(styleId ?? '').trim()) ?? URBAN_MODERN_STYLE_PROFILE;
}

