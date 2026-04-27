import { WritablePathRegistry } from './writable-path-registry';

export interface TargetRefValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * 功能：统一校验 targetRef 是否存在，以及 patch 是否只写允许路径。
 */
export class TargetRefValidator {
    private readonly pathRegistry: WritablePathRegistry;

    constructor(pathRegistry = new WritablePathRegistry()) {
        this.pathRegistry = pathRegistry;
    }

    validatePatch(input: {
        action: string;
        targetRef?: string;
        patch?: unknown;
        targetEditablePaths?: Map<string, Set<string>>;
        requireTargetRef?: boolean;
    }): TargetRefValidationResult {
        const errors: string[] = [];
        const action = String(input.action ?? '').trim().toUpperCase();
        const targetRef = String(input.targetRef ?? '').trim();
        if (input.requireTargetRef && this.requiresTargetRef(action) && !targetRef) {
            errors.push(`${action.toLowerCase()}_requires_target_ref`);
        }
        const payload = toRecord(input.patch);
        if (!targetRef || !input.targetEditablePaths || !payload || Object.keys(payload).length <= 0) {
            return {
                valid: errors.length <= 0,
                errors,
            };
        }
        const editablePaths = input.targetEditablePaths.get(targetRef);
        if (!editablePaths) {
            errors.push(`target_ref_not_in_manifest:${targetRef}`);
            return {
                valid: false,
                errors,
            };
        }
        for (const path of this.pathRegistry.flattenPayloadPaths(payload)) {
            if (!this.pathRegistry.isPathAllowed(path, editablePaths)) {
                errors.push(`patch_path_not_allowed:${targetRef}:${path}`);
            }
        }
        return {
            valid: errors.length <= 0,
            errors,
        };
    }

    private requiresTargetRef(action: string): boolean {
        return action === 'UPDATE' || action === 'MERGE' || action === 'INVALIDATE' || action === 'DELETE';
    }
}

function toRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}
