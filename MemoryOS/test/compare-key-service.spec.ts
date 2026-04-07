import { describe, expect, it } from 'vitest';
import { CompareKeyService } from '../src/core/compare-key-service';
import type { MemoryEntry } from '../src/types';

function buildEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
    return {
        entryId: 'entry-1',
        chatKey: 'chat-1',
        title: '月语教派',
        entryType: 'organization',
        category: '组织',
        tags: [],
        summary: '一个神秘组织',
        detail: '',
        detailSchemaVersion: 1,
        detailPayload: {
            compareKey: 'organization:旧月语教派',
            matchKeys: ['organization:moon_voice'],
            fields: {
                subtype: 'sect',
            },
        },
        sourceSummaryIds: [],
        createdAt: 1,
        updatedAt: 2,
        ...overrides,
    };
}

describe('CompareKeyService', () => {
    it('会为条目生成精确 compareKey 并保留旧键到 matchKeys', () => {
        const service = new CompareKeyService();
        const result = service.resolveForEntry(buildEntry());

        expect(result.compareKey).toBe('ck:v2:organization:月语教派:sect');
        expect(result.schemaVersion).toBe('v2');
        expect(result.matchKeys).toContain('ck:v2:organization:月语教派:sect');
        expect(result.matchKeys).toContain('organization:旧月语教派');
        expect(result.matchKeys).toContain('organization:moon_voice');
    });

    it('会构建可用于索引的记录', () => {
        const service = new CompareKeyService();
        const record = service.buildIndexRecord(buildEntry({ updatedAt: 88 }));

        expect(record.entryId).toBe('entry-1');
        expect(record.entryType).toBe('organization');
        expect(record.compareKey).toBe('ck:v2:organization:月语教派:sect');
        expect(record.schemaVersion).toBe('v2');
        expect(record.updatedAt).toBe(88);
    });

    it('会使用 matchKeys 做兼容匹配', () => {
        const service = new CompareKeyService();
        const record = service.buildIndexRecord(buildEntry());

        expect(service.matchesRecord(record, 'organization:旧月语教派')).toBe(true);
        expect(service.matchesRecord(record, 'ck:v2:organization:月语教派:sect')).toBe(true);
        expect(service.matchesRecord(record, 'organization:不存在')).toBe(false);
    });
});
