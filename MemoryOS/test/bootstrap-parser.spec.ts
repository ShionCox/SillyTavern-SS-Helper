import { describe, expect, it } from 'vitest';
import { parseColdStartDocument } from '../src/memory-bootstrap';

/**
 * 功能：构造最小可用的冷启动文档输入。
 * @param relationTag 关系标签。
 * @returns 冷启动文档原始对象。
 */
function buildColdStartDocument(relationTag: unknown): Record<string, unknown> {
    return {
        schemaVersion: '1.0.0',
        identity: {
            actorKey: 'char_demo',
            displayName: '示例角色',
            aliases: [],
            identityFacts: ['示例身份'],
            originFacts: ['示例来源'],
            traits: ['示例特征'],
        },
        actorCards: [],
        worldBase: [],
        relationships: [
            {
                sourceActorKey: 'char_demo',
                targetActorKey: 'user',
                participants: ['char_demo', 'user'],
                relationTag,
                state: '保持谨慎观察',
                summary: '双方暂时保持距离',
                trust: 0.2,
                affection: 0.1,
                tension: 0.3,
            },
        ],
        memoryRecords: [],
    };
}

describe('parseColdStartDocument', () => {
    it('accepts preset relationTag', () => {
        const parsed = parseColdStartDocument(buildColdStartDocument('情敌'));
        expect(parsed?.relationships[0]?.relationTag).toBe('情敌');
    });

    it('rejects missing relationTag', () => {
        const parsed = parseColdStartDocument(buildColdStartDocument(undefined));
        expect(parsed).toBeNull();
    });

    it('rejects non-preset relationTag', () => {
        const parsed = parseColdStartDocument(buildColdStartDocument('死对头'));
        expect(parsed).toBeNull();
    });
});
