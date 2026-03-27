import type { WorldProfileDefinition, WorldProfileDetectionResult } from './types';
import { listWorldProfiles } from './registry';

/**
 * 功能：世界模板识别输入。
 */
export interface DetectWorldProfileInput {
    texts: string[];
    fallbackProfileId?: string;
}

/**
 * 功能：根据文本线索检测世界模板。
 * @param input 识别输入。
 * @returns 世界模板识别结果。
 */
export function detectWorldProfile(input: DetectWorldProfileInput): WorldProfileDetectionResult {
    const profiles = listWorldProfiles();
    const mergedText = (Array.isArray(input.texts) ? input.texts : [])
        .map((text: string): string => normalizeText(text))
        .filter(Boolean)
        .join('\n');
    const scoreRows = profiles
        .map((profile: WorldProfileDefinition): { profile: WorldProfileDefinition; score: number; reasonCodes: string[] } => {
            return scoreProfile(mergedText, profile);
        })
        .sort((left, right): number => right.score - left.score);
    const top = scoreRows[0];
    const secondaries = scoreRows
        .slice(1)
        .filter((row): boolean => row.score > 0)
        .slice(0, 2);
    const fallbackProfileId = String(input.fallbackProfileId ?? '').trim();
    const primaryId = top?.score > 0
        ? top.profile.worldProfileId
        : (fallbackProfileId || profiles[0]?.worldProfileId || 'urban_modern');
    const confidence = clamp01(top?.score ? top.score / 8 : 0.25);
    const reasonCodes = top?.reasonCodes?.length
        ? top.reasonCodes.slice(0, 6)
        : ['fallback_profile'];

    return {
        primaryProfile: primaryId,
        secondaryProfiles: secondaries.map((item): string => item.profile.worldProfileId),
        confidence,
        reasonCodes,
    };
}

/**
 * 功能：对单个模板进行匹配打分。
 * @param sourceText 归一化文本。
 * @param profile 世界模板。
 * @returns 匹配分数与命中原因。
 */
function scoreProfile(
    sourceText: string,
    profile: WorldProfileDefinition,
): { profile: WorldProfileDefinition; score: number; reasonCodes: string[] } {
    if (!sourceText) {
        return { profile, score: 0, reasonCodes: [] };
    }
    let score = 0;
    const reasonCodes: string[] = [];
    for (const keyword of profile.detectionKeywords) {
        const normalizedKeyword = normalizeText(keyword).toLowerCase();
        if (!normalizedKeyword) {
            continue;
        }
        if (sourceText.includes(normalizedKeyword)) {
            score += normalizedKeyword.length >= 3 ? 1.3 : 1;
            reasonCodes.push(`kw:${normalizedKeyword}`);
        }
    }
    return { profile, score, reasonCodes };
}

/**
 * 功能：归一化文本。
 * @param value 原始文本。
 * @returns 归一化结果。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：限制 0~1 区间。
 * @param value 原始值。
 * @returns 限制后的值。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}

