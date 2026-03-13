import type { SdkThemeSnapshot } from "./theme.snapshot";

export interface SdkThemeSnapshotCacheEntry {
  version: number;
  snapshot: SdkThemeSnapshot;
}

export interface SdkThemeRuntimeCaches {
  themeSnapshotVersion: number;
  themeSnapshotCache: WeakMap<HTMLElement, SdkThemeSnapshotCacheEntry>;
  detachedThemeCache: WeakMap<HTMLElement, Map<string, string>>;
}

/**
 * 功能：创建一组新的主题运行时缓存容器。
 * @returns 初始缓存对象。
 */
export function createSdkThemeRuntimeCaches(): SdkThemeRuntimeCaches {
  return {
    themeSnapshotVersion: 0,
    themeSnapshotCache: new WeakMap<HTMLElement, SdkThemeSnapshotCacheEntry>(),
    detachedThemeCache: new WeakMap<HTMLElement, Map<string, string>>(),
  };
}

/**
 * 功能：规范化并自修复主题运行时缓存对象。
 * @param caches 可能来自旧版本运行时的缓存对象。
 * @returns 可安全使用的完整缓存对象。
 */
export function ensureSdkThemeRuntimeCaches(
  caches?: Partial<SdkThemeRuntimeCaches> | null
): SdkThemeRuntimeCaches {
  const base =
    caches && typeof caches === "object"
      ? (caches as SdkThemeRuntimeCaches)
      : ({} as SdkThemeRuntimeCaches);

  base.themeSnapshotVersion =
    typeof base.themeSnapshotVersion === "number" ? base.themeSnapshotVersion : 0;
  base.themeSnapshotCache =
    base.themeSnapshotCache instanceof WeakMap
      ? base.themeSnapshotCache
      : new WeakMap<HTMLElement, SdkThemeSnapshotCacheEntry>();
  base.detachedThemeCache =
    base.detachedThemeCache instanceof WeakMap
      ? base.detachedThemeCache
      : new WeakMap<HTMLElement, Map<string, string>>();

  return base;
}

/**
 * 功能：使主题快照与 detached 变量缓存全部失效。
 * @param caches 运行时缓存对象。
 * @returns 无返回值。
 */
export function invalidateSdkThemeRuntimeCaches(caches: SdkThemeRuntimeCaches): void {
  const normalized = ensureSdkThemeRuntimeCaches(caches);
  normalized.themeSnapshotVersion += 1;
  normalized.themeSnapshotCache = new WeakMap<HTMLElement, SdkThemeSnapshotCacheEntry>();
  normalized.detachedThemeCache = new WeakMap<HTMLElement, Map<string, string>>();
}

/**
 * 功能：读取当前版本下命中的主题快照缓存。
 * @param caches 运行时缓存对象。
 * @param source 主题源节点。
 * @returns 命中的缓存快照；否则返回 null。
 */
export function readCachedSdkThemeSnapshot(
  caches: SdkThemeRuntimeCaches,
  source: HTMLElement
): SdkThemeSnapshot | null {
  const normalized = ensureSdkThemeRuntimeCaches(caches);
  const cached = normalized.themeSnapshotCache.get(source);
  if (!cached || cached.version !== normalized.themeSnapshotVersion) {
    return null;
  }
  return cached.snapshot;
}

/**
 * 功能：写入当前版本的主题快照缓存。
 * @param caches 运行时缓存对象。
 * @param source 主题源节点。
 * @param snapshot 已解析的主题快照。
 * @returns 无返回值。
 */
export function writeCachedSdkThemeSnapshot(
  caches: SdkThemeRuntimeCaches,
  source: HTMLElement,
  snapshot: SdkThemeSnapshot
): void {
  const normalized = ensureSdkThemeRuntimeCaches(caches);
  normalized.themeSnapshotCache.set(source, {
    version: normalized.themeSnapshotVersion,
    snapshot,
  });
}

/**
 * 功能：读取 detached 节点的变量缓存，不存在时自动初始化。
 * @param caches 运行时缓存对象。
 * @param node detached 节点。
 * @returns 节点级变量缓存。
 */
export function getDetachedSdkThemeVarCache(
  caches: SdkThemeRuntimeCaches,
  node: HTMLElement
): Map<string, string> {
  const normalized = ensureSdkThemeRuntimeCaches(caches);
  const cached = normalized.detachedThemeCache.get(node);
  if (cached) {
    return cached;
  }
  const created = new Map<string, string>();
  normalized.detachedThemeCache.set(node, created);
  return created;
}

/**
 * 功能：把主题快照中的 cssVars 差量写入 detached 节点。
 * @param caches 运行时缓存对象。
 * @param node 目标 detached 节点。
 * @param snapshot 主题快照。
 * @returns 无返回值。
 */
export function syncDetachedSdkThemeCssVars(
  caches: SdkThemeRuntimeCaches,
  node: HTMLElement,
  snapshot: SdkThemeSnapshot
): void {
  const normalized = ensureSdkThemeRuntimeCaches(caches);
  const cached = getDetachedSdkThemeVarCache(normalized, node);
  const appliedKeys = new Set<string>(Object.keys(snapshot.cssVars));

  for (const [propertyName, propertyValue] of Object.entries(snapshot.cssVars)) {
    if (cached.get(propertyName) === propertyValue) continue;
    node.style.setProperty(propertyName, propertyValue);
    cached.set(propertyName, propertyValue);
  }

  for (const propertyName of Array.from(cached.keys())) {
    if (appliedKeys.has(propertyName)) continue;
    node.style.removeProperty(propertyName);
    cached.delete(propertyName);
  }

  normalized.detachedThemeCache.set(node, cached);
}
