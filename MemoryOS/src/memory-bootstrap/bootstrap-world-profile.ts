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
    const worldProfileDetection = document.worldProfileDetection;
    if (isCompleteWorldProfileDetection(worldProfileDetection)) {
        return {
            primaryProfile: normalizeText(worldProfileDetection.primaryProfile) || 'urban_modern',
            secondaryProfiles: dedupeStrings(worldProfileDetection.secondaryProfiles ?? []),
            confidence: clamp01(worldProfileDetection.confidence ?? 0.5),
            reasonCodes: dedupeStrings(worldProfileDetection.reasonCodes ?? []),
        };
    }
    return detectWorldProfile({ signals: collectFallbackSignals(sourceBundle) });
}

/**
 * 功能：判断模型返回的 worldProfileDetection 是否完整可用。
 * @param detection 模型返回的检测结果。
 * @returns 是否完整。
 */
function isCompleteWorldProfileDetection(
    detection: ColdStartDocument['worldProfileDetection'],
): detection is NonNullable<ColdStartDocument['worldProfileDetection']> {
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
function collectFallbackSignals(sourceBundle: ColdStartSourceBundle): Array<{
    text: string;
    sourceType: 'scenario' | 'system_prompt' | 'author_note' | 'worldbook' | 'recent_event' | 'generic';
    weight: number;
}> {
    const signals: Array<{
        text: string;
        sourceType: 'scenario' | 'system_prompt' | 'author_note' | 'worldbook' | 'recent_event' | 'generic';
        weight: number;
    }> = [
        { text: sourceBundle.reason, sourceType: 'generic', weight: 1.15 },
        { text: sourceBundle.characterCard.name, sourceType: 'scenario', weight: 1 },
        { text: sourceBundle.characterCard.description, sourceType: 'scenario', weight: 1.55 },
        { text: sourceBundle.characterCard.personality, sourceType: 'scenario', weight: 0.75 },
        { text: sourceBundle.characterCard.scenario, sourceType: 'scenario', weight: 2.25 },
        { text: sourceBundle.characterCard.firstMessage, sourceType: 'scenario', weight: 1.25 },
        { text: sourceBundle.semantic.systemPrompt, sourceType: 'system_prompt', weight: 2.4 },
        { text: sourceBundle.semantic.authorNote, sourceType: 'author_note', weight: 1.8 },
        { text: sourceBundle.semantic.jailbreak, sourceType: 'system_prompt', weight: 1.2 },
        { text: sourceBundle.semantic.instruct, sourceType: 'system_prompt', weight: 1.5 },
        ...sourceBundle.semantic.activeLorebooks.map((text: string) => ({ text, sourceType: 'worldbook' as const, weight: 1.8 })),
        ...sourceBundle.worldbooks.activeBooks.map((text: string) => ({ text, sourceType: 'worldbook' as const, weight: 1.7 })),
        ...sourceBundle.worldbooks.entries.map((entry) => ({
            text: `${entry.entry} ${entry.content}`,
            sourceType: 'worldbook' as const,
            weight: 2.1,
        })),
        ...sourceBundle.recentEvents.map((text: string) => ({ text, sourceType: 'recent_event' as const, weight: 1.1 })),
    ];
    return signals.filter((signal): boolean => Boolean(normalizeText(signal.text)));
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
