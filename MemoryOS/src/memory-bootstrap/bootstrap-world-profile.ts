import { detectWorldProfile, type WorldProfileDetectionResult } from '../memory-world-profile';
import type { ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';

/**
 * 功能：解析冷启动阶段的世界模板识别结果。
 * @param document 冷启动输出文档。
 * @param sourceBundle 冷启动源数据包。
 * @returns 世界模板识别结果。
 */
export function resolveBootstrapWorldProfile(
    document: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
): WorldProfileDetectionResult {
    if (isCompleteWorldProfileDetection(document.worldProfileDetection)) {
        return {
            primaryProfile: normalizeText(document.worldProfileDetection.primaryProfile) || 'urban_modern',
            secondaryProfiles: dedupeStrings(document.worldProfileDetection.secondaryProfiles ?? []),
            confidence: clamp01(document.worldProfileDetection.confidence ?? 0.5),
            reasonCodes: dedupeStrings(document.worldProfileDetection.reasonCodes ?? []),
        };
    }
    return detectWorldProfile({ texts: collectFallbackTexts(sourceBundle) });
}

/**
 * 功能：判断模型返回的 worldProfileDetection 是否完整可用。
 * @param detection 模型返回的检测结果。
 * @returns 是否完整。
 */
function isCompleteWorldProfileDetection(detection: ColdStartDocument['worldProfileDetection']): boolean {
    if (!detection) {
        return false;
    }
    const primaryProfile = normalizeText(detection.primaryProfile);
    if (!primaryProfile) {
        return false;
    }
    if (!Array.isArray(detection.secondaryProfiles) || !Array.isArray(detection.reasonCodes)) {
        return false;
    }
    return Number.isFinite(Number(detection.confidence));
}

/**
 * 功能：收集本地 detector 兜底文本。
 * @param sourceBundle 冷启动源数据包。
 * @returns 兜底文本数组。
 */
function collectFallbackTexts(sourceBundle: ColdStartSourceBundle): string[] {
    return dedupeStrings([
        sourceBundle.reason,
        sourceBundle.characterCard.name,
        sourceBundle.characterCard.description,
        sourceBundle.characterCard.personality,
        sourceBundle.characterCard.scenario,
        sourceBundle.characterCard.firstMessage,
        sourceBundle.semantic.systemPrompt,
        sourceBundle.semantic.authorNote,
        sourceBundle.semantic.jailbreak,
        sourceBundle.semantic.instruct,
        ...sourceBundle.semantic.activeLorebooks,
        ...sourceBundle.worldbooks.activeBooks,
        ...sourceBundle.worldbooks.entries.map((entry): string => `${entry.entry} ${entry.content}`),
        ...sourceBundle.recentEvents,
    ]);
}

/**
 * 功能：标准化文本。
 * @param value 原始值。
 * @returns 标准化后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：限制数值到 0~1。
 * @param value 原始数值。
 * @returns 限制后的数值。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}
