import { describe, expect, it } from 'vitest';
import {
    buildStrictObjectSchema,
    nullableEnumStringSchema,
    nullableStringArraySchema,
    nullableStringSchema,
} from '../src/llm/strict-schema';

describe('strict-schema', (): void => {
    it('默认会把全部属性键名写入 required', (): void => {
        const schema = buildStrictObjectSchema({
            a: { type: 'string' },
            b: { type: 'number' },
            c: nullableStringSchema(),
        });

        expect(schema.additionalProperties).toBe(false);
        expect(schema.required).toEqual(['a', 'b', 'c']);
    });

    it('可空辅助字段会输出严格兼容的类型结构', (): void => {
        const nullableString = nullableStringSchema();
        const nullableArray = nullableStringArraySchema();
        const nullableEnum = nullableEnumStringSchema(['confirmed', 'rumor', 'inferred'] as const);

        expect(nullableString).toEqual({ type: ['string', 'null'] });
        expect(nullableArray).toEqual({ type: ['array', 'null'], items: { type: 'string' } });
        expect(nullableEnum).toEqual({
            type: ['string', 'null'],
            enum: ['confirmed', 'rumor', 'inferred', null],
        });
    });
});
