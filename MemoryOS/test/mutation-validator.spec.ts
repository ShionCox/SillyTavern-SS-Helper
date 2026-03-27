import { describe, expect, it } from 'vitest';
import { validateSummaryMutationDocument, type EditableFieldMap } from '../src/memory-summary';

describe('validateSummaryMutationDocument', () => {
    it('rejects non-whitelisted fields including fields.* paths', () => {
        const editableMap: EditableFieldMap = new Map([
            ['relationship', new Set(['summary', 'trust', 'fields.allowed'])],
        ]);
        const result = validateSummaryMutationDocument({
            schemaVersion: '1.0.0',
            window: { fromTurn: 1, toTurn: 2 },
            actions: [
                {
                    action: 'UPDATE',
                    targetKind: 'relationship',
                    payload: {
                        summary: 'ok',
                        fields: {
                            allowed: 'ok',
                            hacked: 'blocked',
                        },
                        unknownField: 'blocked',
                    },
                },
            ],
        }, editableMap);

        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes('payload_field_not_allowed:relationship:fields.hacked'))).toBe(true);
        expect(result.errors.some((error) => error.includes('payload_field_not_allowed:relationship:unknownField'))).toBe(true);
    });

    it('clamps numbers and dedupes arrays for allowed fields', () => {
        const editableMap: EditableFieldMap = new Map([
            ['world_global_state', new Set(['summary', 'tags', 'state'])],
        ]);
        const result = validateSummaryMutationDocument({
            schemaVersion: '1.0.0',
            window: { fromTurn: 1, toTurn: 2 },
            actions: [
                {
                    action: 'UPDATE',
                    targetKind: 'world_global_state',
                    payload: {
                        summary: 'ok',
                        state: 99999999,
                        tags: ['a', 'a', 'b'],
                    },
                },
            ],
        }, editableMap);

        expect(result.valid).toBe(true);
        const payload = result.document?.actions[0]?.payload ?? {};
        expect(payload.state).toBe(1000000);
        expect(payload.tags).toEqual(['a', 'b']);
    });
});
