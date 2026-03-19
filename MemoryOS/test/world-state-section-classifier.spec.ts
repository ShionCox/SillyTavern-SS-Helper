import { describe, expect, it } from 'vitest';
import type { StructuredWorldStateEntry } from '../src/types';
import {
    buildWorldStateSectionTypeState,
    filterWorldStateEntriesByType,
    shouldShowWorldStateSectionTypeTabs,
} from '../src/ui/worldStateSectionClassifier';

function makeEntry(stateKey: string, stateType: StructuredWorldStateEntry['node']['stateType']): StructuredWorldStateEntry {
    return {
        stateKey,
        path: stateKey,
        rawValue: { title: stateKey },
        node: {
            title: stateKey,
            summary: `${stateKey} 摘要`,
            scopeType: 'city',
            stateType,
            keywords: [],
            tags: [],
            updatedAt: 1,
        },
        updatedAt: 1,
    };
}

describe('世界状态子表分类器', (): void => {
    it('会优先选中首选分类', (): void => {
        const entries = [
            makeEntry('city:1', 'history'),
            makeEntry('city:2', 'history'),
            makeEntry('city:3', 'rule'),
        ];

        const state = buildWorldStateSectionTypeState(entries, 'rule');

        expect(state.activeTypeKey).toBe('rule');
        expect(state.buckets.map((bucket): string => bucket.typeKey)).toEqual(['history', 'rule']);
    });

    it('会在首选分类失效时回退到数量最多的分类', (): void => {
        const entries = [
            makeEntry('city:1', 'history'),
            makeEntry('city:2', 'history'),
            makeEntry('city:3', 'rule'),
        ];

        const state = buildWorldStateSectionTypeState(entries, 'status');

        expect(state.activeTypeKey).toBe('history');
        expect(state.buckets[0]?.count).toBe(2);
    });

    it('会按目标分类过滤条目', (): void => {
        const entries = [
            makeEntry('city:1', 'history'),
            makeEntry('city:2', 'history'),
            makeEntry('city:3', 'rule'),
        ];

        const filtered = filterWorldStateEntriesByType(entries, 'history');

        expect(filtered).toHaveLength(2);
        expect(filtered.every((entry): boolean => entry.node.stateType === 'history')).toBe(true);
    });

    it('只给需要的子表显示分类标签页', (): void => {
        expect(shouldShowWorldStateSectionTypeTabs('city')).toBe(true);
        expect(shouldShowWorldStateSectionTypeTabs('history')).toBe(false);
    });
});
