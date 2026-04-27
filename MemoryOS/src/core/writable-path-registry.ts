export type WritablePathDomain = 'summary' | 'dream' | 'takeover' | 'relationship';

const DEFAULT_WRITABLE_PATHS = ['title', 'summary', 'detail', 'tags', 'fields', 'bindings'];

const WRITABLE_PATHS_BY_KIND: Record<string, string[]> = {
    task: ['summary', 'detail', 'tags', 'fields.objective', 'fields.goal', 'fields.status', 'fields.lastChange', 'bindings', 'timeContext', 'firstObservedAt', 'lastObservedAt', 'validFrom', 'validTo', 'ongoing'],
    event: ['summary', 'detail', 'tags', 'fields.participants', 'fields.result', 'fields.outcome', 'fields.impact', 'bindings', 'timeContext', 'firstObservedAt', 'lastObservedAt'],
    relationship: ['relationTag', 'state', 'summary', 'trust', 'affection', 'tension', 'participants', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    scene_shared_state: ['summary', 'detail', 'tags', 'fields.location', 'fields.visibilityScope', 'fields.status', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    world_global_state: ['value', 'summary', 'detail', 'tags', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    world_hard_rule: ['summary', 'detail', 'tags', 'fields.rule', 'fields.scope', 'fields.enforcement', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    world_core_setting: ['summary', 'detail', 'tags', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    item: ['summary', 'detail', 'tags', 'fields.owner', 'fields.holder', 'fields.ability', 'fields.rarity', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    organization: ['title', 'summary', 'aliases', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    city: ['title', 'summary', 'aliases', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    nation: ['title', 'summary', 'aliases', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
    location: ['title', 'summary', 'aliases', 'fields', 'bindings', 'timeContext', 'validFrom', 'validTo', 'ongoing'],
};

/**
 * 功能：统一解析各链路可写 patch 路径。
 */
export class WritablePathRegistry {
    resolvePaths(input: {
        targetKind: string;
        domain?: WritablePathDomain;
        schemaPaths?: string[];
        overridePaths?: string[];
    }): string[] {
        const overridePaths = normalizePathList(input.overridePaths);
        if (overridePaths.length > 0) {
            return overridePaths;
        }
        const schemaPaths = normalizePathList(input.schemaPaths);
        if (schemaPaths.length > 0) {
            return schemaPaths;
        }
        const targetKind = normalizeKind(input.targetKind);
        if (input.domain === 'relationship') {
            return [...WRITABLE_PATHS_BY_KIND.relationship];
        }
        return [...(WRITABLE_PATHS_BY_KIND[targetKind] ?? DEFAULT_WRITABLE_PATHS)];
    }

    isPathAllowed(path: string, editablePaths: Iterable<string>): boolean {
        const normalizedPath = normalizePath(path);
        if (!normalizedPath) {
            return false;
        }
        const pathSet = new Set(Array.from(editablePaths).map(normalizePath).filter(Boolean));
        if (pathSet.has(normalizedPath)) {
            return true;
        }
        const parentPath = normalizedPath.split('.').slice(0, -1).join('.');
        return Boolean(parentPath && pathSet.has(parentPath));
    }

    flattenPayloadPaths(value: unknown, prefix = ''): string[] {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return prefix ? [prefix] : [];
        }
        const paths: string[] = [];
        for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
            const nextPath = prefix ? `${prefix}.${key}` : key;
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                const childPaths = this.flattenPayloadPaths(item, nextPath);
                paths.push(...(childPaths.length > 0 ? childPaths : [nextPath]));
                continue;
            }
            paths.push(nextPath);
        }
        return paths.map(normalizePath).filter(Boolean);
    }
}

function normalizePathList(values: unknown): string[] {
    if (!Array.isArray(values)) {
        return [];
    }
    return Array.from(new Set(values.map(normalizePath).filter(Boolean)));
}

function normalizePath(value: unknown): string {
    return String(value ?? '').trim();
}

function normalizeKind(value: unknown): string {
    return String(value ?? '').trim().toLowerCase() || 'other';
}
