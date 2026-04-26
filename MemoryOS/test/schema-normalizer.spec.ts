import { describe, expect, it } from 'vitest';
import { normalizeMemoryPromptSchema } from '../src/memory-prompts/schema-normalizer';

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

describe('normalizeMemoryPromptSchema', () => {
    it('会把 SUMMARY_SCHEMA 归一化为稀疏 patch 协议', () => {
        const schema = normalizeMemoryPromptSchema('SUMMARY_SCHEMA', {});
        const schemaRecord = toRecord(schema);
        const properties = toRecord(schemaRecord.properties);
        const actions = toRecord(properties.actions);
        const items = toRecord(actions.items);
        const itemProperties = toRecord(items.properties);
        const patch = toRecord(itemProperties.patch);
        const newRecord = toRecord(itemProperties.newRecord);
        const payload = toRecord(itemProperties.payload);

        expect(schemaRecord.required).toEqual(['schemaVersion', 'window', 'actions', 'diagnostics']);
        expect(items.required).toEqual(['action', 'targetKind', 'reasonCodes']);
        expect(itemProperties.reasonCodes).toBeTruthy();
        expect(itemProperties.memoryValue).toBeTruthy();
        expect(itemProperties.sourceEvidence).toBeTruthy();
        expect(itemProperties.timeContext).toBeTruthy();
        expect(itemProperties.targetId).toBeTruthy();
        expect(itemProperties.sourceIds).toBeTruthy();
        expect(patch.type).toBe('object');
        expect(newRecord.type).toBe('object');
        expect(payload.type).toBe('object');
        expect(patch.required).toEqual([]);
        expect(newRecord.required).toEqual([]);
        expect(payload.required).toEqual([]);
    });
});
