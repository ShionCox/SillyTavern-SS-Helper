import type { MemoryGraphMode } from './memoryGraphTypes';
import { resolveDisplayLabel, type DisplayLabelResolverContext, stripComparePrefix } from './display-label-resolver';

/**
 * 功能：规范化图谱节点标题，避免把内部 key 直接暴露到显示层。
 * @param rawTitle 原始标题。
 * @param options 规范化选项。
 * @returns 规范化后的标题。
 */
export function normalizeMemoryCardTitle(
    rawTitle: string,
    options: {
        mode: MemoryGraphMode;
        context: DisplayLabelResolverContext;
        typeHint?: string;
        fallbackRef?: string;
    },
): string {
    const title = String(rawTitle ?? '').trim();
    const fallbackRef = String(options.fallbackRef ?? '').trim();
    const typeHint = String(options.typeHint ?? '').trim().toLowerCase();
    const source = title || fallbackRef;
    if (!source) {
        return options.mode === 'debug' ? '未命名标题' : '未命名对象';
    }

    const directResolved = tryResolveDirectRef(source, options.mode, options.context, typeHint);
    if (directResolved) {
        return directResolved;
    }

    const withoutPrefix = stripComparePrefix(source);
    const keyRewritten = rewriteEmbeddedKeys(withoutPrefix || source, options.mode, options.context);
    const dottedRewritten = rewriteCenteredDotTitle(keyRewritten, typeHint);
    const normalized = dottedRewritten.replace(/\s+/g, ' ').trim();
    if (normalized) {
        return normalized;
    }
    return options.mode === 'debug' ? source : stripComparePrefix(source) || '未命名对象';
}

/**
 * 功能：尝试把整段标题当作稳定引用直接解析。
 * @param value 原始值。
 * @param mode 图谱模式。
 * @param context 显示名上下文。
 * @param typeHint 类型提示。
 * @returns 解析后的显示名；失败时返回空字符串。
 */
function tryResolveDirectRef(
    value: string,
    mode: MemoryGraphMode,
    context: DisplayLabelResolverContext,
    typeHint: string,
): string {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) {
        return '';
    }
    if (rawValue === 'user' || rawValue.includes(':')) {
        return resolveDisplayLabel(rawValue, { mode, context, typeHint });
    }
    return '';
}

/**
 * 功能：把标题中的内部引用替换为可读文本。
 * @param value 原始标题。
 * @param mode 图谱模式。
 * @param context 显示名上下文。
 * @returns 重写后的标题。
 */
function rewriteEmbeddedKeys(value: string, mode: MemoryGraphMode, context: DisplayLabelResolverContext): string {
    return String(value ?? '').replace(/\b(user|(?:organization|city|nation|location|task|event|world_global_state):[^\s，。；、]+)/gi, (matched: string): string => {
        return resolveDisplayLabel(matched, { mode, context, fallbackLabel: stripComparePrefix(matched) || matched });
    });
}

/**
 * 功能：把 `X · Y` 样式标题转成自然语言短语。
 * @param value 原始标题。
 * @param typeHint 类型提示。
 * @returns 重写后的标题。
 */
function rewriteCenteredDotTitle(value: string, typeHint: string): string {
    const rawValue = String(value ?? '').trim();
    const match = rawValue.match(/^(.+?)\s*[·]\s*(.+)$/);
    if (!match) {
        return rawValue;
    }
    const subject = String(match[1] ?? '').trim();
    const predicate = String(match[2] ?? '').trim();
    if (!subject || !predicate) {
        return rawValue;
    }
    if (typeHint === 'task') {
        return subject === '你' ? `你的${predicate}` : `与${subject}的${predicate}`;
    }
    if (typeHint === 'location' || typeHint === 'world_state') {
        return `${subject}${predicate}`;
    }
    return `${subject}的${predicate}`;
}
