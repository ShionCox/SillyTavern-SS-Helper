const TAVERN_INSTANCE_STORAGE_KEY_Event = "stx.rollhelper.tavernInstanceId";
const TAVERN_INSTANCE_FALLBACK_KEY_Event = "stx.rollhelper.tavernInstanceId.fallback";

interface SdkAccountStorageLikeEvent {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * 功能：从全局对象获取 accountStorage。
 * @returns accountStorage 或空值
 */
function getAccountStorageEvent(): SdkAccountStorageLikeEvent | null {
  try {
    const globalRef = globalThis as { SillyTavern?: { getContext?: () => unknown } };
    const context = globalRef.SillyTavern?.getContext?.();
    if (!context || typeof context !== "object") return null;
    const accountStorage = (context as { accountStorage?: unknown }).accountStorage;
    if (!accountStorage || typeof accountStorage !== "object") return null;
    const typed = accountStorage as SdkAccountStorageLikeEvent;
    if (typeof typed.getItem !== "function" || typeof typed.setItem !== "function") return null;
    return typed;
  } catch {
    return null;
  }
}

/**
 * 功能：校验实例 ID 是否为可用字符串。
 * @param raw 原始实例 ID
 * @returns 是否有效
 */
function isValidInstanceIdEvent(raw: string): boolean {
  const text = String(raw ?? "").trim();
  return /^[a-zA-Z0-9_-]{8,128}$/.test(text);
}

/**
 * 功能：生成新的实例 ID。
 * @returns 新实例 ID
 */
function createInstanceIdEvent(): string {
  const randomUuid = (() => {
    try {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
    } catch {
      // ignore
    }
    return "";
  })();

  if (randomUuid) {
    return `tavern_${randomUuid.replace(/-/g, "_")}`;
  }
  return `tavern_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 功能：从浏览器本地回退存储读取实例 ID。
 * @returns 实例 ID 或空字符串
 */
function readFallbackInstanceIdEvent(): string {
  try {
    const value = localStorage.getItem(TAVERN_INSTANCE_FALLBACK_KEY_Event);
    return String(value ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * 功能：把实例 ID 写入浏览器本地回退存储。
 * @param instanceId 实例 ID
 * @returns 无返回值
 */
function writeFallbackInstanceIdEvent(instanceId: string): void {
  try {
    localStorage.setItem(TAVERN_INSTANCE_FALLBACK_KEY_Event, instanceId);
  } catch {
    // ignore
  }
}

/**
 * 功能：确保当前酒馆实例 ID 存在并可复用。
 * @returns 当前实例 ID
 */
export function ensureTavernInstanceIdEvent(): string {
  const storage = getAccountStorageEvent();

  const fromAccountStorage =
    storage && typeof storage.getItem === "function"
      ? String(storage.getItem(TAVERN_INSTANCE_STORAGE_KEY_Event) ?? "").trim()
      : "";
  const fromFallback = readFallbackInstanceIdEvent();
  const existed = isValidInstanceIdEvent(fromAccountStorage)
    ? fromAccountStorage
    : isValidInstanceIdEvent(fromFallback)
      ? fromFallback
      : "";

  if (existed) {
    if (storage && typeof storage.setItem === "function" && existed !== fromAccountStorage) {
      try {
        storage.setItem(TAVERN_INSTANCE_STORAGE_KEY_Event, existed);
      } catch {
        // ignore
      }
    }
    if (existed !== fromFallback) {
      writeFallbackInstanceIdEvent(existed);
    }
    return existed;
  }

  const created = createInstanceIdEvent();
  if (storage && typeof storage.setItem === "function") {
    try {
      storage.setItem(TAVERN_INSTANCE_STORAGE_KEY_Event, created);
    } catch {
      // ignore
    }
  }
  writeFallbackInstanceIdEvent(created);
  return created;
}
