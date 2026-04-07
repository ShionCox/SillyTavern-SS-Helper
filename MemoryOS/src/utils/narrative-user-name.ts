import { getCurrentTavernUserNameEvent } from '../../../SDK/tavern';
import {
    renderNarrativeReferenceText,
    type NarrativeReferenceRendererContext,
} from './narrative-reference-renderer';

const STRUCTURED_SKIP_KEYS = new Set<string>([
    'actorKey',
    'sourceActorKey',
    'targetActorKey',
    'participants',
    'reasonCodes',
    'sourceIds',
    'targetId',
    'candidateId',
    'compareKey',
    'entityKeys',
    'actorKeys',
    'schemaId',
    'entryType',
    'targetKind',
    'relationTag',
]);

const USER_PLACEHOLDER: string = '{{user}}';

/**
 * 功能：解析当前叙事语义里应该使用的用户称呼。
 * @param preferredName 优先使用的名字，例如冷启动输入里的用户名。
 * @returns 当前应使用的自然语言称呼，缺失时回退为“你”。
 */
export function resolveCurrentNarrativeUserName(preferredName?: string): string {
    const directName = normalizeNarrativeUserName(preferredName);
    if (directName) {
        return directName;
    }
    const sdkName = normalizeNarrativeUserName(getCurrentTavernUserNameEvent(undefined, ''));
    return sdkName || '你';
}

/**
 * 功能：规范化自然语言里的用户指代。
 * @param text 原始文本。
 * @param userDisplayName 当前用户显示名。
 * @returns 替换后的文本。
 */
export function normalizeUserNarrativeText(text: string, userDisplayName: string): string {
    const source = String(text ?? '');
    if (!source.trim()) {
        return source;
    }
    const displayName = resolveCurrentNarrativeUserName(userDisplayName);
    const normalized = source
        .replace(/当前用户/g, displayName)
        .replace(/该用户/g, displayName)
        .replace(/主角/g, displayName)
        .replace(/用户(?!名)/g, displayName)
        .replace(/\{\{\s*userDisplayName\s*\}\}/gi, displayName)
        .replace(/\{\{\s*user\s*\}\}/gi, displayName);
    return renderNarrativeReferenceText(normalized, buildNarrativeReferenceRendererContext(displayName));
}

/**
 * 功能：递归规范化对象中的自然语言字符串字段。
 * @param value 原始值。
 * @param userDisplayName 当前用户显示名。
 * @param currentKey 当前字段名。
 * @returns 规范化后的值。
 */
export function normalizeNarrativeValue<T>(value: T, userDisplayName: string, currentKey?: string): T {
    if (typeof value === 'string') {
        if (shouldSkipNarrativeNormalization(currentKey)) {
            return value;
        }
        return normalizeUserNarrativeText(value, userDisplayName) as T;
    }
    if (Array.isArray(value)) {
        if (shouldSkipNarrativeNormalization(currentKey)) {
            return value;
        }
        return value.map((item: unknown): unknown => normalizeNarrativeValue(item, userDisplayName)) as T;
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (shouldSkipNarrativeNormalization(currentKey)) {
        return value;
    }
    const output: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        output[key] = normalizeNarrativeValue(childValue, userDisplayName, key);
    }
    return output as T;
}

/**
 * 功能：把自然语言里的当前用户名统一替换为 `{{user}}` 占位。
 * @param text 原始文本。
 * @param userDisplayName 当前用户显示名。
 * @returns 替换后的文本。
 */
export function replaceCurrentUserNameWithPlaceholder(text: string, userDisplayName?: string): string {
    const source = String(text ?? '');
    if (!source.trim()) {
        return source;
    }
    let output = source
        .replace(/\{\{\s*userDisplayName\s*\}\}/gi, USER_PLACEHOLDER)
        .replace(/当前用户/g, USER_PLACEHOLDER)
        .replace(/该用户/g, USER_PLACEHOLDER)
        .replace(/主角/g, USER_PLACEHOLDER)
        .replace(/主人公/g, USER_PLACEHOLDER)
        .replace(/对方/g, USER_PLACEHOLDER)
        .replace(/用户(?!名)/g, USER_PLACEHOLDER);
    const resolvedUserName = resolveCurrentNarrativeUserName(userDisplayName);
    if (resolvedUserName && resolvedUserName !== '你') {
        output = output.replace(new RegExp(escapeRegExp(resolvedUserName), 'g'), USER_PLACEHOLDER);
    }
    return output;
}

/**
 * 功能：递归把对象中的当前用户名替换为 `{{user}}` 占位。
 * @param value 原始值。
 * @param userDisplayName 当前用户显示名。
 * @param currentKey 当前字段名。
 * @returns 替换后的值。
 */
export function normalizeNarrativeValueWithUserPlaceholder<T>(value: T, userDisplayName?: string, currentKey?: string): T {
    if (typeof value === 'string') {
        if (shouldSkipNarrativeNormalization(currentKey)) {
            return value;
        }
        return replaceCurrentUserNameWithPlaceholder(value, userDisplayName) as T;
    }
    if (Array.isArray(value)) {
        if (shouldSkipNarrativeNormalization(currentKey)) {
            return value;
        }
        return value.map((item: unknown): unknown => normalizeNarrativeValueWithUserPlaceholder(item, userDisplayName)) as T;
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (shouldSkipNarrativeNormalization(currentKey)) {
        return value;
    }
    const output: Record<string, unknown> = {};
    for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
        output[key] = normalizeNarrativeValueWithUserPlaceholder(childValue, userDisplayName, key);
    }
    return output as T;
}

/**
 * 功能：判断当前字段是否应跳过自然语言替换。
 * @param key 当前字段名。
 * @returns 是否跳过。
 */
function shouldSkipNarrativeNormalization(key?: string): boolean {
    const normalizedKey = String(key ?? '').trim();
    if (!normalizedKey) {
        return false;
    }
    return STRUCTURED_SKIP_KEYS.has(normalizedKey);
}

/**
 * 功能：转义正则中的特殊字符。
 * @param value 原始文本。
 * @returns 转义后的文本。
 */
function escapeRegExp(value: string): string {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 功能：清洗用户名中的空白与占位值。
 * @param value 原始名称。
 * @returns 清洗后的用户名。
 */
function normalizeNarrativeUserName(value: unknown): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '';
    }
    if (normalized === '用户' || normalized.toLowerCase() === 'user') {
        return '';
    }
    return normalized;
}

/**
 * 功能：构建仅包含用户名的叙事引用渲染上下文。
 * @param userDisplayName 当前用户名。
 * @returns 引用渲染上下文。
 */
function buildNarrativeReferenceRendererContext(userDisplayName: string): NarrativeReferenceRendererContext {
    return {
        userDisplayName,
        labelMap: new Map<string, string>([['user', userDisplayName]]),
        aliasToLabelMap: new Map<string, string>(),
    };
}
