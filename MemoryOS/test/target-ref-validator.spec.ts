import { describe, expect, it } from 'vitest';
import { TargetRefValidator } from '../src/core/target-ref-validator';
import { WritablePathRegistry } from '../src/core/writable-path-registry';

describe('target ref infrastructure', () => {
    it('会统一校验 targetRef 与 patch 路径', () => {
        const validator = new TargetRefValidator();
        const result = validator.validatePatch({
            action: 'UPDATE',
            targetRef: 'T1',
            patch: {
                fields: {
                    status: '执行中',
                    secret: '不允许写入',
                },
            },
            targetEditablePaths: new Map([['T1', new Set(['summary', 'fields.status'])]]),
            requireTargetRef: true,
        });

        expect(result.valid).toBe(false);
        expect(result.errors).toContain('patch_path_not_allowed:T1:fields.secret');
        expect(result.errors).not.toContain('patch_path_not_allowed:T1:fields.status');
    });

    it('会按 targetKind 提供共享 editablePaths', () => {
        const registry = new WritablePathRegistry();
        expect(registry.resolvePaths({ targetKind: 'task' })).toContain('fields.status');
        expect(registry.resolvePaths({ targetKind: 'relationship', domain: 'relationship' })).toContain('trust');
        expect(registry.isPathAllowed('fields.status', ['fields'])).toBe(true);
    });
});
