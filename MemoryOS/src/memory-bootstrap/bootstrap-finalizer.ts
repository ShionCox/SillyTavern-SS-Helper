import type { ColdStartCandidate, ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { buildColdStartCandidates } from './bootstrap-candidates';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';

/**
 * 功能：生成冷启动最终候选结果。
 * @param document 冷启动文档。
 * @param sourceBundle 原始数据。
 * @returns 候选结果。
 */
export function finalizeBootstrapDocument(document: ColdStartDocument, sourceBundle: ColdStartSourceBundle): {
    candidates: ColdStartCandidate[];
    worldProfile: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
} {
    return {
        candidates: buildColdStartCandidates(document, sourceBundle),
        worldProfile: resolveBootstrapWorldProfile(document, sourceBundle),
    };
}
