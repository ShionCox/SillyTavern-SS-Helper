import {
  getSillyTavernContextEvent,
  resolveCurrentCharacterEvent,
  resolveCurrentChatIdEvent,
  resolveTavernRoleIdentityEvent,
} from "./context";
import { getTavernRuntimeContextEvent } from "./runtime";
import type {
  SdkTavernCharacterCapabilitiesEvent,
  SdkTavernCharacterEvent,
  SdkTavernCharacterExtensionsEvent,
  SdkTavernCharacterSnapshotEvent,
  SdkTavernContextEvent,
} from "./types";

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeFilename(value: unknown): string {
  return normalizeText(value).replace(/\.[^/.]+$/, "");
}

function readObjectPath(source: unknown, path: string): unknown {
  if (!source || typeof source !== "object") {
    return undefined;
  }
  const segments = String(path ?? "")
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return source;
  }
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function buildCharacterSnapshot(
  context: SdkTavernContextEvent | null,
  character: SdkTavernCharacterEvent,
  index: number,
): SdkTavernCharacterSnapshotEvent | null {
  const roleIdentity = resolveTavernRoleIdentityEvent({
    ...(context ?? {}),
    characterId: index,
    this_chid: index,
    characters: [character],
    characterName: character.name ?? context?.characterName,
    name2: character.name ?? context?.name2,
  });
  const avatarName = normalizeText(character.avatar);
  const roleId = normalizeText(roleIdentity.roleId || avatarName || character.name);
  const roleKey = normalizeText(roleIdentity.roleKey || roleId);
  if (!roleId || !roleKey) {
    return null;
  }
  const extensions = getTavernCharacterExtensionsEvent(character);
  return {
    index,
    roleId,
    roleKey,
    displayName: normalizeText(roleIdentity.displayName || character.name) || "未知角色",
    avatarName,
    avatarUrl: normalizeText(roleIdentity.avatarUrl),
    chatId: resolveCurrentChatIdEvent(context, character),
    characterFilename: normalizeFilename(character.avatar),
    character,
    extensions,
  };
}

export function listTavernCharactersEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernCharacterEvent[] {
  return Array.isArray(context?.characters) ? context.characters : [];
}

export function getCurrentTavernCharacterEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernCharacterEvent | null {
  return resolveCurrentCharacterEvent(context).character;
}

export function getTavernCharacterExtensionsEvent(
  character: SdkTavernCharacterEvent | null | undefined,
): SdkTavernCharacterExtensionsEvent | null {
  const data = character?.data;
  if (!data || typeof data !== "object") {
    return null;
  }
  const extensions = (data as Record<string, unknown>).extensions;
  if (!extensions || typeof extensions !== "object") {
    return null;
  }
  return extensions as SdkTavernCharacterExtensionsEvent;
}

export function getTavernCharacterExtensionFieldEvent<T = unknown>(
  character: SdkTavernCharacterEvent | null | undefined,
  path: string,
  fallback?: T,
): T | undefined {
  if (!character?.data || typeof character.data !== "object") {
    return fallback;
  }
  const normalizedPath = String(path ?? "").trim().replace(/^data\./, "");
  if (!normalizedPath) {
    return (character.data as T) ?? fallback;
  }
  const resolved = readObjectPath(character.data, normalizedPath);
  return (resolved as T | undefined) ?? fallback;
}

export function getCurrentTavernCharacterFilenameEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): string | null {
  const runtimeContext = getTavernRuntimeContextEvent();
  const globalRef = globalThis as Record<string, unknown> & {
    SillyTavern?: Record<string, unknown>;
  };
  const resolverCandidates = [
    runtimeContext?.getCharaFilename,
    globalRef.getCharaFilename,
    globalRef.SillyTavern?.getCharaFilename,
  ];
  for (const candidate of resolverCandidates) {
    if (typeof candidate !== "function") {
      continue;
    }
    try {
      const resolved = normalizeFilename(candidate());
      if (resolved) {
        return resolved;
      }
    } catch {
      // ignore host resolver failures and continue to fallback logic
    }
  }

  const currentCharacter = getCurrentTavernCharacterEvent(context);
  const avatarFilename = normalizeFilename(currentCharacter?.avatar);
  if (avatarFilename) {
    return avatarFilename;
  }
  return null;
}

export function getCurrentTavernCharacterSnapshotEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernCharacterSnapshotEvent | null {
  const resolved = resolveCurrentCharacterEvent(context);
  if (!resolved.character || resolved.index < 0) {
    return null;
  }
  return buildCharacterSnapshot(context, resolved.character, resolved.index);
}

export function listTavernCharacterSnapshotsEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernCharacterSnapshotEvent[] {
  return listTavernCharactersEvent(context)
    .map((character, index) => buildCharacterSnapshot(context, character, index))
    .filter((item): item is SdkTavernCharacterSnapshotEvent => Boolean(item));
}

export function getTavernCharacterCapabilitiesEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernCharacterCapabilitiesEvent {
  const runtimeContext = getTavernRuntimeContextEvent();
  const currentCharacter = getCurrentTavernCharacterEvent(context);
  return {
    hasContext: Boolean(context),
    hasCharacters: listTavernCharactersEvent(context).length > 0,
    hasCurrentCharacter: Boolean(currentCharacter),
    hasCharacterExtensions: Boolean(getTavernCharacterExtensionsEvent(currentCharacter)),
    hasCharacterFilenameResolver: Boolean(getCurrentTavernCharacterFilenameEvent(context)),
    canPersistCharacterChanges:
      typeof runtimeContext?.saveSettingsDebounced === "function"
      || typeof runtimeContext?.saveMetadata === "function",
  };
}