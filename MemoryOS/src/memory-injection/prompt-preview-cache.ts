import type { ActorVisibleMemoryContext } from './actor-visible-context-builder';

/**
 * 功能：预览缓存条目。
 */
interface PreviewCacheEntry {
    key: string;
    context: ActorVisibleMemoryContext;
    xmlMarkdown: string;
    createdAt: number;
}

/**
 * 功能：缓存键构建参数。
 */
interface PreviewCacheKeyParams {
    actorKey: string;
    chatId?: string;
    entryCount: number;
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_SIZE = 8;

let cache: PreviewCacheEntry[] = [];

/**
 * 功能：构建缓存键。
 * 基于 actorKey + chatId + 条目数量 来确定缓存命中。
 * @param params 构建参数。
 * @returns 缓存键。
 */
function buildCacheKey(params: PreviewCacheKeyParams): string {
    return `${params.actorKey}:${params.chatId ?? 'default'}:${params.entryCount}`;
}

/**
 * 功能：从缓存中获取预览结果。
 * @param params 缓存键参数。
 * @returns 缓存条目，未命中返回 null。
 */
export function getPreviewCache(params: PreviewCacheKeyParams): PreviewCacheEntry | null {
    const key = buildCacheKey(params);
    const now = Date.now();
    const entry = cache.find((e) => e.key === key && (now - e.createdAt) < CACHE_TTL_MS);
    return entry ?? null;
}

/**
 * 功能：将预览结果写入缓存。
 * @param params 缓存键参数。
 * @param context actor 可见记忆上下文。
 * @param xmlMarkdown 渲染后的 XML Markdown。
 */
export function setPreviewCache(
    params: PreviewCacheKeyParams,
    context: ActorVisibleMemoryContext,
    xmlMarkdown: string,
): void {
    const key = buildCacheKey(params);
    const now = Date.now();
    cache = cache.filter((e) => e.key !== key && (now - e.createdAt) < CACHE_TTL_MS);
    if (cache.length >= CACHE_MAX_SIZE) {
        cache.sort((a, b) => a.createdAt - b.createdAt);
        cache = cache.slice(-CACHE_MAX_SIZE + 1);
    }
    cache.push({ key, context, xmlMarkdown, createdAt: now });
}

/**
 * 功能：清除全部预览缓存。
 */
export function clearPreviewCache(): void {
    cache = [];
}

/**
 * 功能：获取缓存诊断信息。
 * @returns 缓存状态。
 */
export function getPreviewCacheDiagnostics(): { size: number; keys: string[] } {
    const now = Date.now();
    const valid = cache.filter((e) => (now - e.createdAt) < CACHE_TTL_MS);
    return {
        size: valid.length,
        keys: valid.map((e) => e.key),
    };
}
