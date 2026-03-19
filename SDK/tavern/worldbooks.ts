import { getSillyTavernContextEvent } from "./context";
import { getCurrentTavernCharacterEvent, getCurrentTavernCharacterFilenameEvent, getTavernCharacterExtensionFieldEvent } from "./characters";
import { substituteTavernWorldbookEntryMacrosEvent } from "./macros";
import { getTavernRuntimeContextEvent } from "./runtime";
import type {
  SdkTavernCharacterWorldbookBindingEvent,
  SdkTavernResolvedWorldbookEntryEvent,
  SdkTavernRuntimeContextEvent,
  SdkTavernWorldbookBookEvent,
  SdkTavernWorldbookCapabilitiesEvent,
  SdkTavernWorldbookEntryEvent,
} from "./types";

type WorldbookGlobalRef = Record<string, unknown> & {
  SillyTavern?: Record<string, unknown>;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: unknown): string {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function normalizeFilename(value: unknown): string {
  return normalizeText(value).replace(/\.[^/.]+$/, "").toLowerCase();
}

function buildUniqueNames(values: Iterable<unknown>, limit: number): string[] {
  const names = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || names.has(normalized)) {
      continue;
    }
    names.add(normalized);
    if (names.size >= limit) {
      break;
    }
  }
  return Array.from(names);
}

function readNameFromEntry(item: unknown): string {
  if (typeof item === "string") {
    return normalizeText(item);
  }
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    return normalizeText(record.name ?? record.book ?? record.title ?? record.id);
  }
  return "";
}

function normalizeNames(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return buildUniqueNames(value.map(readNameFromEntry).filter(Boolean), limit);
}

function extractNamesFromUnknown(value: unknown, limit: number): string[] {
  if (Array.isArray(value)) {
    return normalizeNames(value, limit);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  const record = value as Record<string, unknown>;
  const nestedCandidates = [record.names, record.books, record.items, record.list, record.values];
  for (const candidate of nestedCandidates) {
    const names = normalizeNames(candidate, limit);
    if (names.length > 0) {
      return names;
    }
  }
  return buildUniqueNames(
    Object.keys(record)
      .map((key) => normalizeText(key))
      .filter((key) => Boolean(key) && !/^\d+$/.test(key)),
    limit,
  );
}

function readSelectWorldbookNames(selectors: string[], selectedOnly: boolean, limit: number): string[] {
  if (typeof document === "undefined") {
    return [];
  }
  const optionSelector = selectedOnly ? "option:checked" : "option";
  const names: string[] = [];
  for (const selector of selectors) {
    const select = document.querySelector<HTMLSelectElement>(selector);
    if (!select) {
      continue;
    }
    const optionNames = Array.from(select.querySelectorAll<HTMLOptionElement>(optionSelector))
      .map((option) => normalizeText(option.textContent ?? option.label ?? option.value))
      .filter((name) => Boolean(name) && name !== "---");
    names.push(...optionNames);
  }
  return buildUniqueNames(names, limit);
}

function getGlobalRef(): WorldbookGlobalRef {
  return globalThis as WorldbookGlobalRef;
}

function getLoader(runtimeContext: SdkTavernRuntimeContextEvent | null): ((bookName: string) => Promise<unknown>) | null {
  const globalRef = getGlobalRef();
  const candidates = [
    runtimeContext?.loadWorldInfo,
    globalRef.loadWorldInfo,
    globalRef.SillyTavern?.loadWorldInfo,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate as (bookName: string) => Promise<unknown>;
    }
  }
  return null;
}

function getWorldInfoSourceRecord(): Record<string, unknown> | null {
  const globalRef = getGlobalRef();
  const candidates = [
    globalRef.world_info,
    globalRef.SillyTavern?.world_info,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object") {
      return candidate as Record<string, unknown>;
    }
  }
  return null;
}

function normalizeEntryForWrite(entry: SdkTavernWorldbookEntryEvent): SdkTavernWorldbookEntryEvent {
  return {
    ...entry,
    key: Array.isArray(entry.key) ? entry.key.map((item) => normalizeText(item)).filter(Boolean) : [],
    keysecondary: Array.isArray(entry.keysecondary)
      ? entry.keysecondary.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    comment: normalizeText(entry.comment),
    content: normalizeText(entry.content),
  };
}

function normalizeResolvedEntry(
  bookName: string,
  entryId: string,
  rawEntry: unknown,
): SdkTavernResolvedWorldbookEntryEvent | null {
  if (!rawEntry || typeof rawEntry !== "object") {
    return null;
  }
  const originalSource = rawEntry as SdkTavernWorldbookEntryEvent;
  const source = substituteTavernWorldbookEntryMacrosEvent(originalSource);
  const content = normalizeMultilineText(source.content);
  if (!content) {
    return null;
  }
  const keywords = Array.isArray(source.key)
    ? source.key.map((item) => normalizeText(item)).filter(Boolean)
    : [];
  return {
    book: bookName,
    entryId: normalizeText(entryId || source.uid) || `entry_${Math.random().toString(36).slice(2, 8)}`,
    uid: source.uid,
    entry: normalizeText(source.comment ?? keywords[0] ?? entryId ?? "untitled"),
    keywords,
    content,
    rawEntry: originalSource,
  };
}

function collectCharacterMainWorldbook(): string {
  const context = getSillyTavernContextEvent();
  const character = getCurrentTavernCharacterEvent(context);
  const candidates = [
    getTavernCharacterExtensionFieldEvent<string>(character, "extensions.world"),
    getTavernCharacterExtensionFieldEvent<string>(character, "world"),
    context?.world_info,
    ...readSelectWorldbookNames([".character_world_info_selector"], true, 1),
  ];
  return buildUniqueNames(candidates, 1)[0] ?? "";
}

function collectCharacterExtraWorldbooks(limit: number): string[] {
  const context = getSillyTavernContextEvent();
  const character = getCurrentTavernCharacterEvent(context);
  const filename = getCurrentTavernCharacterFilenameEvent(context);
  const extraCandidates: unknown[] = [
    getTavernCharacterExtensionFieldEvent(character, "extensions.extraBooks", []),
    getTavernCharacterExtensionFieldEvent(character, "extensions.extra_books", []),
    getTavernCharacterExtensionFieldEvent(character, "extraBooks", []),
  ];

  const worldInfoRecord = getWorldInfoSourceRecord();
  const charLore = Array.isArray(worldInfoRecord?.charLore) ? worldInfoRecord?.charLore : [];
  for (const item of charLore) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const record = item as Record<string, unknown>;
    const matchCandidates = [
      record.character,
      record.characterName,
      record.file,
      record.fileName,
      record.filename,
      record.avatar,
      record.id,
      record.name,
    ].map((value) => normalizeFilename(value));
    if (filename && matchCandidates.includes(filename)) {
      extraCandidates.push(record.extraBooks);
    }
  }

  extraCandidates.push(readSelectWorldbookNames([".character_extra_world_info_selector"], true, limit));
  return buildUniqueNames(
    extraCandidates.flatMap((value) => normalizeNames(value, limit)),
    limit,
  );
}

export function listTavernActiveWorldbooksEvent(limit: number = 64): string[] {
  const globalRef = getGlobalRef();
  const context = getSillyTavernContextEvent();
  const sources: unknown[] = [
    globalRef.selected_world_info,
    globalRef.SillyTavern?.selected_world_info,
    context?.selected_world_info,
  ];
  const names = new Set<string>(readSelectWorldbookNames(["#world_info"], true, limit));
  for (const source of sources) {
    for (const name of [...normalizeNames(source, limit), ...extractNamesFromUnknown(source, limit)]) {
      if (name) {
        names.add(name);
      }
    }
  }
  return Array.from(names).slice(0, limit);
}

export function listTavernAvailableWorldbooksEvent(limit: number = 64): string[] {
  const globalRef = getGlobalRef();
  const context = getSillyTavernContextEvent();
  const sources: unknown[] = [
    globalRef.world_names,
    globalRef.worldNames,
    globalRef.world_info_names,
    globalRef.worldInfoNames,
    globalRef.SillyTavern?.world_names,
    globalRef.SillyTavern?.worldNames,
    context?.world_names,
    context?.worldNames,
    context?.world_info_names,
    context?.worldInfoNames,
    context?.worldInfoBooks,
  ];
  return buildUniqueNames(
    [
      ...listTavernActiveWorldbooksEvent(limit),
      ...readSelectWorldbookNames([
        "#world_info",
        ".character_world_info_selector",
        ".character_extra_world_info_selector",
      ], false, limit),
      ...sources.flatMap((value) => [...normalizeNames(value, limit), ...extractNamesFromUnknown(value, limit)]),
    ],
    limit,
  );
}

export function resolveTavernCharacterWorldbookBindingEvent(
  limit: number = 32,
): SdkTavernCharacterWorldbookBindingEvent {
  const mainBook = collectCharacterMainWorldbook();
  const extraBooks = buildUniqueNames(
    collectCharacterExtraWorldbooks(limit).filter((name) => name !== mainBook),
    limit,
  );
  const allBooks = buildUniqueNames([mainBook, ...extraBooks].filter(Boolean), limit);
  const source = mainBook || extraBooks.length > 0
    ? (getTavernCharacterExtensionFieldEvent(getCurrentTavernCharacterEvent(), "extensions.world")
      || getTavernCharacterExtensionFieldEvent(getCurrentTavernCharacterEvent(), "extensions.extraBooks")
      || getTavernCharacterExtensionFieldEvent(getCurrentTavernCharacterEvent(), "extensions.extra_books")
        ? "character_extensions"
        : getSillyTavernContextEvent()?.world_info || collectCharacterExtraWorldbooks(limit).length > 0
          ? "host_world_info"
          : "dom_selectors")
    : "none";
  return {
    mainBook,
    extraBooks,
    allBooks,
    characterFilename: getCurrentTavernCharacterFilenameEvent() ?? "",
    source,
  };
}

export async function loadTavernWorldbookEvent(
  bookName: string,
): Promise<SdkTavernWorldbookBookEvent | null> {
  const normalizedBookName = normalizeText(bookName);
  if (!normalizedBookName) {
    return null;
  }
  const runtimeContext = getTavernRuntimeContextEvent();
  const loader = getLoader(runtimeContext);
  if (!loader) {
    return null;
  }
  try {
    const payload = await loader(normalizedBookName);
    if (!payload || typeof payload !== "object") {
      return null;
    }
    return {
      name: normalizedBookName,
      ...(payload as SdkTavernWorldbookBookEvent),
    };
  } catch {
    return null;
  }
}

export async function loadTavernWorldbookEntriesEvent(
  bookNames?: string[],
): Promise<SdkTavernResolvedWorldbookEntryEvent[]> {
  const targetBooks = Array.isArray(bookNames) && bookNames.length > 0
    ? buildUniqueNames(bookNames, 64)
    : listTavernActiveWorldbooksEvent(64);
  const entries: SdkTavernResolvedWorldbookEntryEvent[] = [];
  for (const bookName of targetBooks) {
    const book = await loadTavernWorldbookEvent(bookName);
    const rawEntries = book?.entries && typeof book.entries === "object"
      ? Object.entries(book.entries)
      : [];
    for (const [entryId, rawEntry] of rawEntries) {
      const normalizedEntry = normalizeResolvedEntry(bookName, entryId, rawEntry);
      if (normalizedEntry) {
        entries.push(normalizedEntry);
      }
    }
  }
  return entries;
}

export async function saveTavernWorldbookEntryEvent(
  bookName: string,
  entry: SdkTavernWorldbookEntryEvent,
): Promise<boolean> {
  const normalizedBookName = normalizeText(bookName);
  if (!normalizedBookName) {
    return false;
  }
  const runtimeContext = getTavernRuntimeContextEvent();
  const globalRef = getGlobalRef();
  const normalizedEntry = normalizeEntryForWrite(entry);
  try {
    if (typeof runtimeContext?.saveWorldInfo === "function") {
      await runtimeContext.saveWorldInfo(normalizedBookName, normalizedEntry);
      return true;
    }
    const createEntry = runtimeContext?.createWorldInfoEntry
      ?? (typeof globalRef.createWorldInfoEntry === "function" ? globalRef.createWorldInfoEntry : null)
      ?? (typeof globalRef.SillyTavern?.createWorldInfoEntry === "function" ? globalRef.SillyTavern.createWorldInfoEntry : null);
    if (typeof createEntry === "function") {
      await createEntry(normalizedBookName, normalizedEntry.content ?? "", normalizedEntry.key ?? []);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function deleteTavernWorldbookBookEvent(bookName: string): Promise<boolean> {
  const runtimeContext = getTavernRuntimeContextEvent();
  const normalizedBookName = normalizeText(bookName);
  if (!normalizedBookName || typeof runtimeContext?.deleteWorldInfoBook !== "function") {
    return false;
  }
  try {
    await runtimeContext.deleteWorldInfoBook(normalizedBookName);
    return true;
  } catch {
    return false;
  }
}

export async function deleteTavernWorldbookEntryEvent(
  bookName: string,
  entryUid: string | number,
): Promise<boolean> {
  const runtimeContext = getTavernRuntimeContextEvent();
  const normalizedBookName = normalizeText(bookName);
  if (!normalizedBookName || typeof runtimeContext?.deleteWorldInfoEntry !== "function") {
    return false;
  }
  try {
    await runtimeContext.deleteWorldInfoEntry(normalizedBookName, entryUid);
    return true;
  } catch {
    return false;
  }
}

export function updateTavernActiveWorldbooksEvent(names: string[]): boolean {
  const normalizedNames = buildUniqueNames(names, 64);
  const globalRef = getGlobalRef();
  const context = getSillyTavernContextEvent();
  const targets = [
    globalRef.selected_world_info,
    globalRef.SillyTavern?.selected_world_info,
    context?.selected_world_info,
  ];
  let updated = false;
  for (const target of targets) {
    if (!Array.isArray(target)) {
      continue;
    }
    target.length = 0;
    target.push(...normalizedNames);
    updated = true;
  }
  return updated;
}

export function getTavernWorldbookCapabilitiesEvent(): SdkTavernWorldbookCapabilitiesEvent {
  const runtimeContext = getTavernRuntimeContextEvent();
  const globalRef = getGlobalRef();
  const activeTargets = [
    globalRef.selected_world_info,
    globalRef.SillyTavern?.selected_world_info,
    getSillyTavernContextEvent()?.selected_world_info,
  ];
  return {
    hasAvailableWorldbooks: listTavernAvailableWorldbooksEvent(8).length > 0,
    hasActiveWorldbooks: listTavernActiveWorldbooksEvent(8).length > 0,
    hasCharacterWorldbookBinding: resolveTavernCharacterWorldbookBindingEvent(8).allBooks.length > 0,
    hasCharacterFilenameResolver: Boolean(getCurrentTavernCharacterFilenameEvent()),
    canLoadWorldbook: Boolean(getLoader(runtimeContext)),
    canSaveWorldbookEntry: typeof runtimeContext?.saveWorldInfo === "function",
    canCreateWorldbookEntry:
      typeof runtimeContext?.createWorldInfoEntry === "function"
      || typeof globalRef.createWorldInfoEntry === "function"
      || typeof globalRef.SillyTavern?.createWorldInfoEntry === "function",
    canDeleteWorldbookBook: typeof runtimeContext?.deleteWorldInfoBook === "function",
    canDeleteWorldbookEntry: typeof runtimeContext?.deleteWorldInfoEntry === "function",
    canUpdateActiveWorldbooks: activeTargets.some((target) => Array.isArray(target)),
  };
}
