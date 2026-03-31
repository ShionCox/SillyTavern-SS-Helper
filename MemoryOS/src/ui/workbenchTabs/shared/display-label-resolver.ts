import { parseCompareKey } from '../../../core/compare-key';
import type { MemoryGraphMode } from './memoryGraphTypes';

/**
 * 功能：定义显示名解析上下文中的角色记录。
 */
export interface DisplayLabelActorRecord {
    actorKey: string;
    displayName: string;
    aliases?: string[];
}

/**
 * 功能：定义显示名解析上下文中的 compareKey 记录。
 */
export interface DisplayLabelCompareRecord {
    compareKey: string;
    title: string;
    type: string;
    aliases?: string[];
}

/**
 * 功能：定义显示名解析上下文。
 */
export interface DisplayLabelResolverContext {
    actorMap: Map<string, DisplayLabelActorRecord>;
    compareKeyMap: Map<string, DisplayLabelCompareRecord>;
    aliasToLabelMap: Map<string, string>;
    userLabel?: string;
}

/**
 * 功能：解析图谱中的稳定引用显示名。
 * @param ref 原始引用。
 * @param options 解析选项。
 * @returns 解析后的显示名。
 */
export function resolveDisplayLabel(
    ref: string,
    options: {
        mode: MemoryGraphMode;
        context: DisplayLabelResolverContext;
        fallbackLabel?: string;
        typeHint?: string;
    },
): string {
    const rawRef = String(ref ?? '').trim();
    const fallbackLabel = String(options.fallbackLabel ?? '').trim();
    if (!rawRef) {
        return fallbackLabel || (options.mode === 'debug' ? '未解析引用' : '未命名对象');
    }
    if (rawRef === 'user') {
        const userLabel = String(options.context.userLabel ?? '').trim() || '你';
        return options.mode === 'debug' ? `user（${userLabel}）` : userLabel;
    }

    const actorRecord = options.context.actorMap.get(rawRef);
    if (actorRecord?.displayName) {
        return actorRecord.displayName;
    }

    const compareRecord = options.context.compareKeyMap.get(rawRef);
    if (compareRecord?.title) {
        return compareRecord.title;
    }

    const aliasLabel = options.context.aliasToLabelMap.get(normalizeLookupKey(rawRef));
    if (aliasLabel) {
        return aliasLabel;
    }

    const stripped = stripComparePrefix(rawRef);
    if (options.mode === 'semantic') {
        const safeFallback = fallbackLabel && fallbackLabel !== rawRef ? fallbackLabel : '';
        return stripped || safeFallback || '未命名对象';
    }
    return fallbackLabel || rawRef;
}

/**
 * 功能：裁剪 compareKey 常见前缀，得到更可读的标题。
 * @param value 原始值。
 * @returns 去前缀后的文本。
 */
export function stripComparePrefix(value: string): string {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }
    if (rawValue.startsWith('ck:v2:')) {
        const parsed = parseCompareKey(rawValue);
        return parsed.canonicalName || rawValue;
    }
    if (rawValue.startsWith('entity:')) {
        const strippedEntity = rawValue.slice('entity:'.length);
        const segments = strippedEntity.split(':').map((item: string): string => item.trim()).filter(Boolean);
        return segments.length > 0 ? segments[segments.length - 1] : rawValue;
    }
    const prefixes = ['organization:', 'city:', 'nation:', 'location:', 'task:', 'event:', 'world_global_state:', 'world:'];
    for (const prefix of prefixes) {
        if (rawValue.startsWith(prefix)) {
            const stripped = rawValue.slice(prefix.length);
            const lastColon = stripped.lastIndexOf(':');
            return lastColon >= 0 ? stripped.slice(lastColon + 1).trim() : stripped.trim();
        }
    }
    return rawValue;
}

/**
 * 功能：构建查询用的别名键。
 * @param value 原始值。
 * @returns 归一化后的键。
 */
export function normalizeLookupKey(value: string): string {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}
