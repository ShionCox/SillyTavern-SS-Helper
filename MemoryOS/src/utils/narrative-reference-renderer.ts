import { parseCompareKey } from '../core/compare-key';

/**
 * 功能：定义叙事引用渲染上下文。
 */
export interface NarrativeReferenceRendererContext {
    userDisplayName?: string;
    labelMap?: Map<string, string>;
    aliasToLabelMap?: Map<string, string>;
}

/**
 * 功能：解析自然语言中的稳定引用显示名。
 * @param ref 原始引用。
 * @param context 渲染上下文。
 * @param fallbackLabel 兜底显示名。
 * @returns 解析后的自然语言标签。
 */
export function resolveNarrativeReferenceLabel(
    ref: string,
    context: NarrativeReferenceRendererContext,
    fallbackLabel?: string,
): string {
    const rawRef = String(ref ?? '').trim();
    const normalizedFallback = String(fallbackLabel ?? '').trim();
    if (!rawRef) {
        return normalizedFallback || '未命名对象';
    }
    if (rawRef === 'user') {
        return normalizeNarrativeReferenceUserName(context.userDisplayName);
    }
    const directLabel = context.labelMap?.get(rawRef);
    if (directLabel) {
        return directLabel;
    }
    const aliasLabel = context.aliasToLabelMap?.get(buildNarrativeReferenceLookupKey(rawRef));
    if (aliasLabel) {
        return aliasLabel;
    }
    const stripped = stripNarrativeReferencePrefix(rawRef);
    if ((rawRef.startsWith('actor:') || rawRef.startsWith('entity:actor:')) && stripped.startsWith('char_')) {
        return normalizedFallback || '未命名角色';
    }
    if (rawRef.startsWith('char_')) {
        return normalizedFallback || '未命名角色';
    }
    return normalizedFallback || stripped || '未命名对象';
}

/**
 * 功能：把自然语言文本中的占位引用和稳定键渲染为可读文本。
 * @param text 原始文本。
 * @param context 渲染上下文。
 * @returns 渲染后的文本。
 */
export function renderNarrativeReferenceText(
    text: string,
    context: NarrativeReferenceRendererContext,
): string {
    const source = String(text ?? '');
    if (!source.trim()) {
        return source;
    }
    const userDisplayName = normalizeNarrativeReferenceUserName(context.userDisplayName);
    const referencePattern = /\b(user|char_[a-z0-9_]+|ck:v2:[^\s，。；、.!?！？()]+|entity:[^\s，。；、.!?！？()]+|(?:organization|city|nation|location|task|event|world_global_state|world|actor):[^\s，。；、.!?！？()]+)/gi;
    return source
        .replace(/当前用户/g, userDisplayName)
        .replace(/该用户/g, userDisplayName)
        .replace(/主角/g, userDisplayName)
        .replace(/用户(?!名)/g, userDisplayName)
        .replace(/\{\{\s*userDisplayName\s*\}\}/gi, userDisplayName)
        .replace(/\{\{\s*([a-zA-Z]+)\s*:\s*([^{}]+?)\s*\}\}/g, (_matched: string, type: string, rawValue: string): string => {
            const ref = `${String(type ?? '').trim().toLowerCase()}:${String(rawValue ?? '').trim()}`;
            const stripped = stripNarrativeReferencePrefix(ref);
            return resolveNarrativeReferenceLabel(ref, context, stripped || ref);
        })
        .replace(referencePattern, (matched: string): string => {
            return resolveNarrativeReferenceLabel(matched, context, stripNarrativeReferencePrefix(matched) || matched);
        });
}

/**
 * 功能：裁剪叙事引用的常见前缀，得到更可读的标题。
 * @param value 原始引用。
 * @returns 去前缀后的文本。
 */
export function stripNarrativeReferencePrefix(value: string): string {
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
    const prefixes = ['actor:', 'organization:', 'city:', 'nation:', 'location:', 'task:', 'event:', 'world_global_state:', 'world:'];
    for (const prefix of prefixes) {
        if (!rawValue.startsWith(prefix)) {
            continue;
        }
        const stripped = rawValue.slice(prefix.length);
        const lastColon = stripped.lastIndexOf(':');
        return lastColon >= 0 ? stripped.slice(lastColon + 1).trim() : stripped.trim();
    }
    return rawValue;
}

/**
 * 功能：构建查询用的引用别名键。
 * @param value 原始值。
 * @returns 归一化后的键。
 */
export function buildNarrativeReferenceLookupKey(value: string): string {
    return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

/**
 * 功能：归一化叙事里展示的用户名。
 * @param value 原始用户名。
 * @returns 归一化后的用户名。
 */
function normalizeNarrativeReferenceUserName(value: string | undefined): string {
    const normalized = String(value ?? '').trim();
    if (!normalized || normalized === '用户' || normalized.toLowerCase() === 'user') {
        return '你';
    }
    return normalized;
}
