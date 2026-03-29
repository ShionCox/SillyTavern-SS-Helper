import type { ColdStartSourceBundle } from './bootstrap-types';

/**
 * 功能：定义冷启动分段结果。
 */
export interface ColdStartSourceSegments {
    phase1: Record<string, unknown>;
    phase2: Record<string, unknown>;
}

/**
 * 功能：把冷启动 sourceBundle 拆成两阶段输入。
 * @param sourceBundle 原始冷启动数据。
 * @returns 两阶段输入。
 */
export function segmentColdStartSourceBundle(sourceBundle: ColdStartSourceBundle): ColdStartSourceSegments {
    return {
        phase1: {
            reason: sourceBundle.reason,
            characterCard: sourceBundle.characterCard,
            semantic: {
                systemPrompt: sourceBundle.semantic.systemPrompt,
                firstMessage: sourceBundle.semantic.firstMessage,
                authorNote: sourceBundle.semantic.authorNote,
                activeLorebooks: sourceBundle.semantic.activeLorebooks,
            },
            user: sourceBundle.user,
            worldbooks: {
                mainBook: sourceBundle.worldbooks.mainBook,
                extraBooks: sourceBundle.worldbooks.extraBooks,
                activeBooks: sourceBundle.worldbooks.activeBooks,
                entries: sourceBundle.worldbooks.entries.slice(0, 200),
            },
        },
        phase2: {
            reason: sourceBundle.reason,
            semantic: sourceBundle.semantic,
            user: sourceBundle.user,
            worldbooks: {
                entries: sourceBundle.worldbooks.entries.slice(0, 200),
            },
            recentEvents: sourceBundle.recentEvents,
        },
    };
}
