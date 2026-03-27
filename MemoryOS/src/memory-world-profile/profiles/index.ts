import type { WorldProfileDefinition } from '../types';
import { URBAN_MODERN_PROFILE } from './urban-modern';
import { ANCIENT_TRADITIONAL_PROFILE } from './ancient-traditional';
import { FANTASY_MAGIC_PROFILE } from './fantasy-magic';
import { SUPERNATURAL_HIDDEN_PROFILE } from './supernatural-hidden';

/**
 * 功能：导出内置世界模板列表。
 */
export const BUILTIN_WORLD_PROFILES: WorldProfileDefinition[] = [
    URBAN_MODERN_PROFILE,
    ANCIENT_TRADITIONAL_PROFILE,
    FANTASY_MAGIC_PROFILE,
    SUPERNATURAL_HIDDEN_PROFILE,
];

