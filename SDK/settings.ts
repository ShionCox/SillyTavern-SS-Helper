import {
  buildTavernChatEntityKeyEvent,
  buildTavernChatScopedKeyEvent,
  ensureTavernInstanceIdEvent,
  parseAnyTavernChatRefEvent,
} from "./tavern";
import type { SdkTavernChatRefEvent, SdkTavernScopeTypeEvent } from "./tavern";

export interface SdkSettingsScope {
  tavernInstanceId: string;
}

export interface SdkPluginSettingsBucket {
  pluginSettings: Record<string, unknown>;
  pluginUiState: Record<string, unknown>;
  pluginChatState: Record<string, unknown>;
  __sdkMeta?: {
    updatedAt?: number;
  };
}

export interface SdkPluginSettingsSnapshot extends SdkPluginSettingsBucket {
  namespace: string;
  scope: SdkSettingsScope;
}

export interface SdkPluginSettingsStoreOptions<TSettings extends object> {
  namespace: string;
  defaults: TSettings;
  normalize?: (candidate: Partial<TSettings>) => TSettings;
}

export interface SdkPluginSettingsStore<TSettings extends object> {
  read: () => TSettings;
  write: (patchOrNext: Partial<TSettings> | ((prev: TSettings) => TSettings)) => TSettings;
  subscribe: (listener: (settings: TSettings, scope: SdkSettingsScope) => void) => () => void;
  readUiState: <TValue = unknown>(key: string, fallback?: TValue) => TValue;
  writeUiState: <TValue = unknown>(key: string, value: TValue) => TValue;
  getScope: () => SdkSettingsScope;
}

export type SdkPluginChatStateRefInput = string | Partial<SdkTavernChatRefEvent>;

export interface SdkPluginChatStateRecord<TState = Record<string, unknown>> {
  chatKey: string;
  entityKey: string;
  ref: SdkTavernChatRefEvent;
  state: TState;
  updatedAt: number;
  displayName: string;
  avatarUrl: string;
  roleKey: string;
  summary: Record<string, unknown>;
}

export interface SdkPluginChatStateSummary {
  chatKey: string;
  entityKey: string;
  tavernInstanceId: string;
  scopeType: SdkTavernScopeTypeEvent;
  scopeId: string;
  chatId: string;
  updatedAt: number;
  displayName: string;
  avatarUrl: string;
  roleKey: string;
  summary: Record<string, unknown>;
}

export interface SdkPluginChatStateListOptions {
  scopeType?: SdkTavernScopeTypeEvent;
  scopeId?: string;
}

export interface SdkPluginChatStateStoreOptions<TState extends object> {
  namespace: string;
  defaults: TState;
  normalize?: (candidate: Partial<TState>) => TState;
}

export interface SdkPluginChatStateWriteMeta {
  displayName?: string;
  avatarUrl?: string;
  roleKey?: string;
  summary?: Record<string, unknown>;
  updatedAt?: number;
}

export interface SdkPluginChatStateStore<TState extends object> {
  read: (chatRef: SdkPluginChatStateRefInput) => SdkPluginChatStateRecord<TState>;
  write: (
    chatRef: SdkPluginChatStateRefInput,
    patchOrNext: Partial<TState> | ((prev: TState) => TState),
    meta?: SdkPluginChatStateWriteMeta
  ) => SdkPluginChatStateRecord<TState>;
  listSummaries: (options?: SdkPluginChatStateListOptions) => SdkPluginChatStateSummary[];
}

export interface SdkLegacyPluginChatStateMigrationEntry {
  chatKey: string;
  updatedAt?: number;
  displayName?: string;
  avatarUrl?: string;
  roleKey?: string;
  summary?: Record<string, unknown>;
}

export interface SdkLegacyPluginChatStateMigrationAdapter<TState extends object> {
  versionTag: string;
  list: () => Promise<SdkLegacyPluginChatStateMigrationEntry[]>;
  read: (chatKey: string) => Promise<TState | null>;
}

export interface SdkPluginChatStateMigrationResult {
  migrated: boolean;
  migratedCount: number;
  skippedCount: number;
}

type BucketListener = (snapshot: SdkPluginSettingsSnapshot) => void;

interface SdkAccountStorageLikeEvent {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SDK_SETTINGS_STORAGE_PREFIX = "stx.sdk.settings.v1";
const NAMESPACE_LISTENERS = new Map<string, Set<BucketListener>>();
let STORAGE_SYNC_BOUND_Event = false;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getAccountStorageEvent(): SdkAccountStorageLikeEvent | null {
  try {
    const globalRef = globalThis as { SillyTavern?: { getContext?: () => unknown } };
    const context = globalRef.SillyTavern?.getContext?.();
    if (!isObjectRecord(context)) return null;
    const accountStorage = context.accountStorage;
    if (!isObjectRecord(accountStorage)) return null;
    const typed = accountStorage as unknown as SdkAccountStorageLikeEvent;
    if (typeof typed.getItem !== "function" || typeof typed.setItem !== "function") return null;
    return typed;
  } catch {
    return null;
  }
}

function buildScopedStorageKey(namespace: string, scope: SdkSettingsScope): string {
  return `${SDK_SETTINGS_STORAGE_PREFIX}::${namespace}::${scope.tavernInstanceId}`;
}

function getCurrentScopeEvent(): SdkSettingsScope {
  return {
    tavernInstanceId: ensureTavernInstanceIdEvent(),
  };
}

function normalizeNamespaceEvent(namespace: string): string {
  return String(namespace ?? "").trim();
}

function isValidNamespaceEvent(namespace: string): boolean {
  return normalizeNamespaceEvent(namespace).length > 0;
}

function readAccountStorageValueEvent(key: string): string {
  const accountStorage = getAccountStorageEvent();
  return accountStorage && typeof accountStorage.getItem === "function"
    ? String(accountStorage.getItem(key) ?? "").trim()
    : "";
}

function readLocalStorageValueEvent(key: string): string {
  try {
    return String(globalThis.localStorage?.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function writeAccountStorageValueEvent(key: string, value: string): void {
  const accountStorage = getAccountStorageEvent();
  if (!accountStorage || typeof accountStorage.setItem !== "function") return;
  try {
    accountStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function writeLocalStorageValueEvent(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // ignore
  }
}

function writeStorageValueEvent(key: string, value: string): void {
  writeAccountStorageValueEvent(key, value);
  writeLocalStorageValueEvent(key, value);
}

function hasOwnRecordEvent(value: unknown, key: string): boolean {
  return isObjectRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function bucketRequiresShapeRepairEvent(candidate: unknown): boolean {
  if (!isObjectRecord(candidate)) return true;
  if (!hasOwnRecordEvent(candidate, "pluginSettings")) return true;
  if (!isObjectRecord(candidate.pluginSettings)) return true;
  if (!hasOwnRecordEvent(candidate, "pluginUiState")) return true;
  if (!isObjectRecord(candidate.pluginUiState)) return true;
  if (!hasOwnRecordEvent(candidate, "pluginChatState")) return true;
  if (!isObjectRecord(candidate.pluginChatState)) return true;
  return false;
}

function normalizeJsonForStableStringifyEvent(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonForStableStringifyEvent(item));
  }
  if (!isObjectRecord(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      normalized[key] = normalizeJsonForStableStringifyEvent(value[key]);
    });
  return normalized;
}

function stableStringifyJsonEvent(value: unknown): string {
  return JSON.stringify(normalizeJsonForStableStringifyEvent(value));
}

function serializeBucketEvent(bucket: SdkPluginSettingsBucket): string {
  return stableStringifyJsonEvent(sanitizeBucketEvent(bucket));
}

interface ParsedBucketCandidateEvent {
  hasValue: boolean;
  valid: boolean;
  bucket: SdkPluginSettingsBucket | null;
  needsShapeRepair: boolean;
  quality: number;
  payloadSize: number;
}

function countBucketPayloadSizeEvent(bucket: SdkPluginSettingsBucket | null): number {
  if (!bucket) return 0;
  return (
    Object.keys(bucket.pluginSettings ?? {}).length +
    Object.keys(bucket.pluginUiState ?? {}).length +
    Object.keys(bucket.pluginChatState ?? {}).length
  );
}

function scoreBucketCandidateQualityEvent(candidate: unknown): number {
  if (!isObjectRecord(candidate)) return 1;
  const hasPluginSettings = isObjectRecord(candidate.pluginSettings);
  const hasPluginUiState = isObjectRecord(candidate.pluginUiState);
  const hasPluginChatState = isObjectRecord(candidate.pluginChatState);
  if (hasPluginSettings && hasPluginUiState && hasPluginChatState) return 3;
  if (hasPluginSettings || hasPluginUiState || hasPluginChatState) return 2;
  return 1;
}

function parseBucketCandidateEvent(raw: string): ParsedBucketCandidateEvent {
  const text = String(raw ?? "").trim();
  if (!text) {
    return {
      hasValue: false,
      valid: false,
      bucket: null,
      needsShapeRepair: false,
      quality: 0,
      payloadSize: 0,
    };
  }
  try {
    const parsed = JSON.parse(text);
    const bucket = sanitizeBucketEvent(parsed);
    return {
      hasValue: true,
      valid: true,
      bucket,
      needsShapeRepair: bucketRequiresShapeRepairEvent(parsed),
      quality: scoreBucketCandidateQualityEvent(parsed),
      payloadSize: countBucketPayloadSizeEvent(bucket),
    };
  } catch {
    return {
      hasValue: true,
      valid: false,
      bucket: null,
      needsShapeRepair: false,
      quality: 0,
      payloadSize: 0,
    };
  }
}

function sanitizeBucketEvent(candidate: unknown): SdkPluginSettingsBucket {
  if (!isObjectRecord(candidate)) {
    return {
      pluginSettings: {},
      pluginUiState: {},
      pluginChatState: {},
      __sdkMeta: {
        updatedAt: 0,
      },
    };
  }
  const pluginSettings = isObjectRecord(candidate.pluginSettings) ? candidate.pluginSettings : {};
  const pluginUiState = isObjectRecord(candidate.pluginUiState) ? candidate.pluginUiState : {};
  const pluginChatState = isObjectRecord(candidate.pluginChatState) ? candidate.pluginChatState : {};
  const rawUpdatedAt = Number(
    isObjectRecord(candidate.__sdkMeta) ? candidate.__sdkMeta.updatedAt : 0
  );
  return {
    pluginSettings: { ...pluginSettings },
    pluginUiState: { ...pluginUiState },
    pluginChatState: { ...pluginChatState },
    __sdkMeta: {
      updatedAt: Number.isFinite(rawUpdatedAt) ? rawUpdatedAt : 0,
    },
  };
}

function readBucketEvent(namespace: string, scope: SdkSettingsScope): SdkPluginSettingsBucket {
  const key = buildScopedStorageKey(namespace, scope);
  const fromAccount = parseBucketCandidateEvent(readAccountStorageValueEvent(key));
  const fromLocal = parseBucketCandidateEvent(readLocalStorageValueEvent(key));
  const accountUpdatedAt = Number(fromAccount.bucket?.__sdkMeta?.updatedAt ?? 0);
  const localUpdatedAt = Number(fromLocal.bucket?.__sdkMeta?.updatedAt ?? 0);
  const useAccount =
    fromAccount.valid &&
    fromAccount.bucket &&
    (accountUpdatedAt > localUpdatedAt ||
      (accountUpdatedAt === localUpdatedAt &&
        (fromAccount.quality > fromLocal.quality ||
      (fromAccount.quality === fromLocal.quality &&
        fromAccount.payloadSize >= fromLocal.payloadSize))));
  const selectedBucket = useAccount
    ? (fromAccount.bucket as SdkPluginSettingsBucket)
    : fromLocal.valid && fromLocal.bucket
    ? fromLocal.bucket
    : sanitizeBucketEvent(null);

  const accountSerialized =
    fromAccount.valid && fromAccount.bucket ? serializeBucketEvent(fromAccount.bucket) : "";
  const localSerialized = fromLocal.valid && fromLocal.bucket ? serializeBucketEvent(fromLocal.bucket) : "";
  const selectedSerialized = serializeBucketEvent(selectedBucket);

  const shouldRepair =
    (fromAccount.hasValue && !fromAccount.valid && fromLocal.valid) ||
    (fromLocal.hasValue && !fromLocal.valid && fromAccount.valid) ||
    (fromAccount.valid && fromLocal.valid && accountSerialized !== localSerialized) ||
    (fromAccount.valid && fromAccount.needsShapeRepair) ||
    (fromLocal.valid && fromLocal.needsShapeRepair) ||
    (!fromAccount.valid && !fromLocal.valid && (fromAccount.hasValue || fromLocal.hasValue));

  if (shouldRepair) {
    writeStorageValueEvent(key, selectedSerialized);
  }
  return selectedBucket;
}

interface ScopedStorageKeyMetaEvent {
  namespace: string;
  tavernInstanceId: string;
}

function parseScopedStorageKeyEvent(key: string): ScopedStorageKeyMetaEvent | null {
  const text = String(key ?? "").trim();
  if (!text) return null;
  const prefix = `${SDK_SETTINGS_STORAGE_PREFIX}::`;
  if (!text.startsWith(prefix)) return null;
  const rest = text.slice(prefix.length);
  const splitAt = rest.indexOf("::");
  if (splitAt <= 0) return null;
  const namespace = rest.slice(0, splitAt).trim();
  const tavernInstanceId = rest.slice(splitAt + 2).trim();
  if (!namespace || !tavernInstanceId) return null;
  return {
    namespace,
    tavernInstanceId,
  };
}

function ensureStorageSyncBindingEvent(): void {
  if (STORAGE_SYNC_BOUND_Event) return;
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  STORAGE_SYNC_BOUND_Event = true;
  window.addEventListener("storage", (event: StorageEvent) => {
    const meta = parseScopedStorageKeyEvent(String(event.key ?? ""));
    if (!meta) return;
    const listeners = NAMESPACE_LISTENERS.get(meta.namespace);
    if (!listeners || listeners.size <= 0) return;
    const scope = getCurrentScopeEvent();
    if (scope.tavernInstanceId !== meta.tavernInstanceId) return;
    const bucket = readBucketEvent(meta.namespace, scope);
    notifyNamespaceListenersEvent(meta.namespace, {
      namespace: meta.namespace,
      scope,
      pluginSettings: bucket.pluginSettings,
      pluginUiState: bucket.pluginUiState,
      pluginChatState: bucket.pluginChatState,
    });
  });
}

function notifyNamespaceListenersEvent(namespace: string, snapshot: SdkPluginSettingsSnapshot): void {
  const listeners = NAMESPACE_LISTENERS.get(namespace);
  if (!listeners || listeners.size <= 0) return;
  Array.from(listeners).forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore listener error
    }
  });
}

function writeBucketEvent(namespace: string, scope: SdkSettingsScope, bucket: SdkPluginSettingsBucket): void {
  const key = buildScopedStorageKey(namespace, scope);
  const normalized = sanitizeBucketEvent({
    ...bucket,
    __sdkMeta: {
      updatedAt: Date.now(),
    },
  });
  try {
    writeStorageValueEvent(key, serializeBucketEvent(normalized));
  } finally {
    notifyNamespaceListenersEvent(namespace, {
      namespace,
      scope,
      pluginSettings: normalized.pluginSettings,
      pluginUiState: normalized.pluginUiState,
      pluginChatState: normalized.pluginChatState,
    });
  }
}

function readBucketForCurrentScopeEvent(namespace: string): SdkPluginSettingsSnapshot {
  const scope = getCurrentScopeEvent();
  const bucket = readBucketEvent(namespace, scope);
  return {
    namespace,
    scope,
    pluginSettings: bucket.pluginSettings,
    pluginUiState: bucket.pluginUiState,
    pluginChatState: bucket.pluginChatState,
  };
}

function writePluginSettingsEvent(
  namespace: string,
  patchOrNext: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)
): Record<string, unknown> {
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  const previous = snapshot.pluginSettings;
  const nextRaw =
    typeof patchOrNext === "function" ? patchOrNext({ ...previous }) : { ...previous, ...patchOrNext };
  const next = isObjectRecord(nextRaw) ? nextRaw : {};
  writeBucketEvent(namespace, snapshot.scope, {
    pluginSettings: next,
    pluginUiState: snapshot.pluginUiState,
    pluginChatState: snapshot.pluginChatState,
  });
  return { ...next };
}

function readPluginSettingsEvent(namespace: string): Record<string, unknown> {
  return { ...readBucketForCurrentScopeEvent(namespace).pluginSettings };
}

function subscribePluginSettingsEvent(namespace: string, listener: BucketListener): () => void {
  ensureStorageSyncBindingEvent();
  let set = NAMESPACE_LISTENERS.get(namespace);
  if (!set) {
    set = new Set<BucketListener>();
    NAMESPACE_LISTENERS.set(namespace, set);
  }
  set.add(listener);
  return () => {
    const current = NAMESPACE_LISTENERS.get(namespace);
    if (!current) return;
    current.delete(listener);
    if (current.size <= 0) {
      NAMESPACE_LISTENERS.delete(namespace);
    }
  };
}

function readPluginUiStateEvent<TValue = unknown>(namespace: string, key: string, fallback?: TValue): TValue {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return fallback as TValue;
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  if (!(normalizedKey in snapshot.pluginUiState)) return fallback as TValue;
  return snapshot.pluginUiState[normalizedKey] as TValue;
}

function writePluginUiStateEvent<TValue = unknown>(namespace: string, key: string, value: TValue): TValue {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return value;
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  writeBucketEvent(namespace, snapshot.scope, {
    pluginSettings: snapshot.pluginSettings,
    pluginUiState: {
      ...snapshot.pluginUiState,
      [normalizedKey]: value as unknown,
    },
    pluginChatState: snapshot.pluginChatState,
  });
  return value;
}

function resolveChatRefEvent(scope: SdkSettingsScope, chatRef: SdkPluginChatStateRefInput): SdkTavernChatRefEvent {
  return parseAnyTavernChatRefEvent(chatRef, {
    tavernInstanceId: scope.tavernInstanceId,
  });
}

function buildScopedChatKeyFromRefEvent(
  ref: SdkTavernChatRefEvent,
  displayName = "",
  avatarUrl = "",
  roleKey = ""
): string {
  const scopeType = ref.scopeType === "group" ? "group" : "character";
  const scopeId = String(ref.scopeId ?? "").trim() || "unknown_scope";
  const fallbackRoleKey = scopeType === "group" ? `group:${scopeId}` : scopeId;
  const normalizedRoleKey = String(roleKey ?? "").trim() || fallbackRoleKey;
  const roleId = normalizedRoleKey;
  return buildTavernChatScopedKeyEvent({
    tavernInstanceId: ref.tavernInstanceId,
    scopeType,
    scopeId,
    roleKey: normalizedRoleKey,
    roleId,
    displayName: displayName || scopeId,
    avatarUrl: avatarUrl || "",
    groupId: scopeType === "group" ? scopeId : "no_group",
    characterId: -1,
    currentChatId: ref.chatId,
    chatId: ref.chatId,
  });
}

function sanitizeChatStateRecordEvent(
  entityKey: string,
  raw: unknown,
  fallbackRef: SdkTavernChatRefEvent
): SdkPluginChatStateRecord<Record<string, unknown>> {
  const source = isObjectRecord(raw) ? raw : {};
  const preferredRef = source.ref;
  const preferredChatKey = String(source.chatKey ?? "").trim();
  const parsedRef = parseAnyTavernChatRefEvent(
    isObjectRecord(preferredRef) ? (preferredRef as Partial<SdkTavernChatRefEvent>) : preferredChatKey || fallbackRef,
    { tavernInstanceId: fallbackRef.tavernInstanceId }
  );
  const nextEntityKey = buildTavernChatEntityKeyEvent(parsedRef) || entityKey;
  const displayName = String(source.displayName ?? "").trim();
  const avatarUrl = String(source.avatarUrl ?? "").trim();
  const roleKey = String(source.roleKey ?? "").trim();
  const chatKey =
    preferredChatKey || buildScopedChatKeyFromRefEvent(parsedRef, displayName, avatarUrl, roleKey);
  const state = isObjectRecord(source.state) ? source.state : {};
  const summary = isObjectRecord(source.summary) ? source.summary : {};
  const updatedAtRaw = Number(source.updatedAt);
  return {
    chatKey,
    entityKey: nextEntityKey,
    ref: parsedRef,
    state: { ...state },
    updatedAt: Number.isFinite(updatedAtRaw) ? updatedAtRaw : Date.now(),
    displayName,
    avatarUrl,
    roleKey,
    summary: { ...summary },
  };
}

function readPluginChatStateEvent(
  namespace: string,
  chatRef: SdkPluginChatStateRefInput
): SdkPluginChatStateRecord<Record<string, unknown>> | null {
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  const resolvedRef = resolveChatRefEvent(snapshot.scope, chatRef);
  const entityKey = buildTavernChatEntityKeyEvent(resolvedRef);
  if (!entityKey) return null;
  const raw = snapshot.pluginChatState[entityKey];
  if (!raw) return null;
  return sanitizeChatStateRecordEvent(entityKey, raw, resolvedRef);
}

function writePluginChatStateEvent(
  namespace: string,
  chatRef: SdkPluginChatStateRefInput,
  patchOrNext:
    | Partial<SdkPluginChatStateRecord<Record<string, unknown>>>
    | ((
        previous: SdkPluginChatStateRecord<Record<string, unknown>>
      ) => Partial<SdkPluginChatStateRecord<Record<string, unknown>>>)
): SdkPluginChatStateRecord<Record<string, unknown>> {
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  const resolvedRef = resolveChatRefEvent(snapshot.scope, chatRef);
  const entityKey = buildTavernChatEntityKeyEvent(resolvedRef);
  if (!entityKey) {
    const fallback = sanitizeChatStateRecordEvent("", null, resolvedRef);
    return {
      ...fallback,
      entityKey: "",
    };
  }
  const previousRaw = snapshot.pluginChatState[entityKey];
  const previous = sanitizeChatStateRecordEvent(entityKey, previousRaw, resolvedRef);
  const patch = typeof patchOrNext === "function" ? patchOrNext({ ...previous }) : patchOrNext;
  const candidate = {
    ...previous,
    ...(isObjectRecord(patch) ? patch : {}),
  } as SdkPluginChatStateRecord<Record<string, unknown>>;
  const patchState = isObjectRecord((patch as { state?: unknown } | null)?.state)
    ? ((patch as { state: Record<string, unknown> }).state ?? {})
    : null;
  candidate.state = patchState ? { ...patchState } : { ...previous.state };
  const normalizedRef = parseAnyTavernChatRefEvent(
    candidate.chatKey || candidate.ref || resolvedRef,
    { tavernInstanceId: snapshot.scope.tavernInstanceId }
  );
  const normalizedEntityKey = buildTavernChatEntityKeyEvent(normalizedRef) || entityKey;
  const normalized = sanitizeChatStateRecordEvent(normalizedEntityKey, candidate, normalizedRef);
  normalized.updatedAt = Number.isFinite(Number(candidate.updatedAt))
    ? Number(candidate.updatedAt)
    : Date.now();

  const nextChatState = {
    ...snapshot.pluginChatState,
    [normalizedEntityKey]: {
      chatKey: normalized.chatKey,
      ref: normalized.ref,
      state: normalized.state,
      updatedAt: normalized.updatedAt,
      displayName: normalized.displayName,
      avatarUrl: normalized.avatarUrl,
      roleKey: normalized.roleKey,
      summary: normalized.summary,
    },
  };
  if (normalizedEntityKey !== entityKey) {
    delete nextChatState[entityKey];
  }

  writeBucketEvent(namespace, snapshot.scope, {
    pluginSettings: snapshot.pluginSettings,
    pluginUiState: snapshot.pluginUiState,
    pluginChatState: nextChatState,
  });
  return normalized;
}

function listPluginChatStateSummariesEvent(
  namespace: string,
  options?: SdkPluginChatStateListOptions
): SdkPluginChatStateSummary[] {
  const snapshot = readBucketForCurrentScopeEvent(namespace);
  const rows = Object.entries(snapshot.pluginChatState).map(([entityKey, raw]) =>
    sanitizeChatStateRecordEvent(
      entityKey,
      raw,
      parseAnyTavernChatRefEvent(entityKey, { tavernInstanceId: snapshot.scope.tavernInstanceId })
    )
  );
  const scopeType = options?.scopeType === "group" ? "group" : options?.scopeType === "character" ? "character" : null;
  const scopeId = String(options?.scopeId ?? "").trim().toLowerCase();
  return rows
    .filter((row) => {
      if (row.ref.tavernInstanceId !== snapshot.scope.tavernInstanceId) return false;
      if (scopeType && row.ref.scopeType !== scopeType) return false;
      if (scopeId && String(row.ref.scopeId ?? "").trim().toLowerCase() !== scopeId) return false;
      if (!row.ref.chatId || row.ref.chatId === "fallback_chat") return false;
      return true;
    })
    .map((row) => ({
      chatKey: row.chatKey,
      entityKey: row.entityKey,
      tavernInstanceId: row.ref.tavernInstanceId,
      scopeType: row.ref.scopeType,
      scopeId: row.ref.scopeId,
      chatId: row.ref.chatId,
      updatedAt: row.updatedAt,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      roleKey: row.roleKey,
      summary: row.summary,
    }))
    .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt));
}

export function getCurrentTavernSettingsScope(): SdkSettingsScope {
  return getCurrentScopeEvent();
}

export function readSdkPluginSettings(namespace: string): Record<string, unknown> {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return {};
  return readPluginSettingsEvent(normalizedNamespace);
}

export function writeSdkPluginSettings(
  namespace: string,
  patchOrNext: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)
): Record<string, unknown> {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) {
    const fallback =
      typeof patchOrNext === "function" ? patchOrNext({}) : { ...(patchOrNext ?? {}) };
    return isObjectRecord(fallback) ? fallback : {};
  }
  return writePluginSettingsEvent(normalizedNamespace, patchOrNext);
}

export function subscribeSdkPluginSettings(
  namespace: string,
  listener: (snapshot: SdkPluginSettingsSnapshot) => void
): () => void {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return () => undefined;
  return subscribePluginSettingsEvent(normalizedNamespace, listener);
}

export function readSdkPluginUiState<TValue = unknown>(
  namespace: string,
  key: string,
  fallback?: TValue
): TValue {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return fallback as TValue;
  return readPluginUiStateEvent(normalizedNamespace, key, fallback);
}

export function writeSdkPluginUiState<TValue = unknown>(namespace: string, key: string, value: TValue): TValue {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return value;
  return writePluginUiStateEvent(normalizedNamespace, key, value);
}

export function readSdkPluginChatState<TState extends object = Record<string, unknown>>(
  namespace: string,
  chatRef: SdkPluginChatStateRefInput
): SdkPluginChatStateRecord<TState> | null {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return null;
  const row = readPluginChatStateEvent(normalizedNamespace, chatRef);
  if (!row) return null;
  return row as SdkPluginChatStateRecord<TState>;
}

export function writeSdkPluginChatState<TState extends object = Record<string, unknown>>(
  namespace: string,
  chatRef: SdkPluginChatStateRefInput,
  patchOrNext:
    | Partial<SdkPluginChatStateRecord<TState>>
    | ((previous: SdkPluginChatStateRecord<TState>) => Partial<SdkPluginChatStateRecord<TState>>)
): SdkPluginChatStateRecord<TState> {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) {
    const fallbackRef = parseAnyTavernChatRefEvent(chatRef, {
      tavernInstanceId: getCurrentScopeEvent().tavernInstanceId,
    });
    return {
      chatKey: "",
      entityKey: "",
      ref: fallbackRef,
      state: {} as TState,
      updatedAt: Date.now(),
      displayName: "",
      avatarUrl: "",
      roleKey: "",
      summary: {},
    };
  }
  const row = writePluginChatStateEvent(
    normalizedNamespace,
    chatRef,
    patchOrNext as
      | Partial<SdkPluginChatStateRecord<Record<string, unknown>>>
      | ((
          previous: SdkPluginChatStateRecord<Record<string, unknown>>
        ) => Partial<SdkPluginChatStateRecord<Record<string, unknown>>>)
  );
  return row as SdkPluginChatStateRecord<TState>;
}

export function listSdkPluginChatStateSummaries(
  namespace: string,
  options?: SdkPluginChatStateListOptions
): SdkPluginChatStateSummary[] {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!normalizedNamespace) return [];
  return listPluginChatStateSummariesEvent(normalizedNamespace, options);
}

export async function migrateLegacyPluginChatState<TState extends object = Record<string, unknown>>(
  namespace: string,
  migrationAdapter: SdkLegacyPluginChatStateMigrationAdapter<TState>
): Promise<SdkPluginChatStateMigrationResult> {
  const normalizedNamespace = normalizeNamespaceEvent(namespace);
  if (!isValidNamespaceEvent(normalizedNamespace)) {
    return {
      migrated: false,
      migratedCount: 0,
      skippedCount: 0,
    };
  }
  const versionTag = String(migrationAdapter?.versionTag ?? "").trim() || "legacy_v1";
  const flagKey = `__sdk_chat_state_migrated__${versionTag}`;
  if (readSdkPluginUiState<boolean>(normalizedNamespace, flagKey, false)) {
    return {
      migrated: false,
      migratedCount: 0,
      skippedCount: 0,
    };
  }

  let listed: SdkLegacyPluginChatStateMigrationEntry[] = [];
  try {
    const loaded = await migrationAdapter.list();
    listed = Array.isArray(loaded) ? loaded : [];
  } catch {
    return {
      migrated: false,
      migratedCount: 0,
      skippedCount: 0,
    };
  }

  let migratedCount = 0;
  let skippedCount = 0;
  for (const row of listed) {
    const chatKey = String(row.chatKey ?? "").trim();
    if (!chatKey) {
      skippedCount += 1;
      continue;
    }
    const loaded = await migrationAdapter.read(chatKey).catch(() => null);
    if (!loaded || typeof loaded !== "object") {
      skippedCount += 1;
      continue;
    }
    writeSdkPluginChatState<Record<string, unknown>>(normalizedNamespace, chatKey, {
      state: { ...(loaded as Record<string, unknown>) },
      updatedAt: Number(row.updatedAt) || Date.now(),
      displayName: String(row.displayName ?? "").trim(),
      avatarUrl: String(row.avatarUrl ?? "").trim(),
      roleKey: String(row.roleKey ?? "").trim(),
      summary: isObjectRecord(row.summary) ? row.summary : {},
    });
    migratedCount += 1;
  }

  // Only mark done after a real migration pass (list/read flow) completes.
  writeSdkPluginUiState(normalizedNamespace, flagKey, true);
  return {
    migrated: true,
    migratedCount,
    skippedCount,
  };
}

export function createSdkPluginSettingsStore<TSettings extends object>(
  options: SdkPluginSettingsStoreOptions<TSettings>
): SdkPluginSettingsStore<TSettings> {
  const namespace = normalizeNamespaceEvent(options.namespace);
  const defaults = { ...(options.defaults ?? ({} as TSettings)) };
  const normalize = options.normalize;

  const read = (): TSettings => {
    const raw = readSdkPluginSettings(namespace) as Partial<TSettings>;
    const merged = {
      ...defaults,
      ...raw,
    } as Partial<TSettings>;
    return normalize ? normalize(merged) : (merged as TSettings);
  };

  const write = (patchOrNext: Partial<TSettings> | ((prev: TSettings) => TSettings)): TSettings => {
    const nextRaw = writeSdkPluginSettings(namespace, (previous: Record<string, unknown>) => {
      const mergedPrev = {
        ...defaults,
        ...(previous as Partial<TSettings>),
      } as TSettings;
      const candidate =
        typeof patchOrNext === "function"
          ? (patchOrNext as (prev: TSettings) => TSettings)(mergedPrev)
          : ({
              ...mergedPrev,
              ...patchOrNext,
            } as TSettings);
      const normalizedCandidate = normalize ? normalize(candidate) : candidate;
      if (!isObjectRecord(normalizedCandidate)) return {};
      return { ...normalizedCandidate };
    });
    const merged = {
      ...defaults,
      ...(nextRaw as Partial<TSettings>),
    } as Partial<TSettings>;
    return normalize ? normalize(merged) : (merged as TSettings);
  };

  const subscribe = (listener: (settings: TSettings, scope: SdkSettingsScope) => void): (() => void) => {
    return subscribeSdkPluginSettings(namespace, (snapshot) => {
      const merged = {
        ...defaults,
        ...(snapshot.pluginSettings as Partial<TSettings>),
      } as Partial<TSettings>;
      const normalized = normalize ? normalize(merged) : (merged as TSettings);
      listener(normalized, snapshot.scope);
    });
  };

  return {
    read,
    write,
    subscribe,
    readUiState: <TValue = unknown>(key: string, fallback?: TValue): TValue =>
      readSdkPluginUiState<TValue>(namespace, key, fallback),
    writeUiState: <TValue = unknown>(key: string, value: TValue): TValue =>
      writeSdkPluginUiState<TValue>(namespace, key, value),
    getScope: () => getCurrentTavernSettingsScope(),
  };
}

export function createSdkPluginChatStateStore<TState extends object>(
  options: SdkPluginChatStateStoreOptions<TState>
): SdkPluginChatStateStore<TState> {
  const namespace = normalizeNamespaceEvent(options.namespace);
  const defaults = { ...(options.defaults ?? ({} as TState)) };
  const normalize = options.normalize;

  const normalizeState = (candidate: Partial<TState>): TState => {
    const merged = {
      ...defaults,
      ...candidate,
    } as Partial<TState>;
    return normalize ? normalize(merged) : (merged as TState);
  };

  return {
    read: (chatRef: SdkPluginChatStateRefInput): SdkPluginChatStateRecord<TState> => {
      const row = readSdkPluginChatState<TState>(namespace, chatRef);
      if (!row) {
        const scope = getCurrentTavernSettingsScope();
        const ref = resolveChatRefEvent(scope, chatRef);
        const entityKey = buildTavernChatEntityKeyEvent(ref);
        return {
          chatKey: buildScopedChatKeyFromRefEvent(ref),
          entityKey,
          ref,
          state: normalizeState({}),
          updatedAt: 0,
          displayName: "",
          avatarUrl: "",
          roleKey: "",
          summary: {},
        };
      }
      return {
        ...row,
        state: normalizeState(row.state as Partial<TState>),
      };
    },
    write: (
      chatRef: SdkPluginChatStateRefInput,
      patchOrNext: Partial<TState> | ((prev: TState) => TState),
      meta?: SdkPluginChatStateWriteMeta
    ): SdkPluginChatStateRecord<TState> => {
      const row = writeSdkPluginChatState<TState>(namespace, chatRef, (previous) => {
        const previousState = normalizeState(previous.state as Partial<TState>);
        const nextState =
          typeof patchOrNext === "function"
            ? normalizeState((patchOrNext as (prev: TState) => TState)(previousState))
            : normalizeState({
                ...previousState,
                ...patchOrNext,
              });
        return {
          state: nextState,
          displayName: String(meta?.displayName ?? previous.displayName ?? "").trim(),
          avatarUrl: String(meta?.avatarUrl ?? previous.avatarUrl ?? "").trim(),
          roleKey: String(meta?.roleKey ?? previous.roleKey ?? "").trim(),
          summary: {
            ...(isObjectRecord(previous.summary) ? previous.summary : {}),
            ...(isObjectRecord(meta?.summary) ? meta?.summary : {}),
          },
          updatedAt: Number(meta?.updatedAt) || Date.now(),
        };
      });
      return {
        ...row,
        state: normalizeState(row.state as Partial<TState>),
      };
    },
    listSummaries: (options?: SdkPluginChatStateListOptions): SdkPluginChatStateSummary[] =>
      listSdkPluginChatStateSummaries(namespace, options),
  };
}
