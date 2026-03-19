import { getSillyTavernContextEvent } from "./context";
import { getTavernRuntimeContextEvent } from "./runtime";
import type { SdkTavernContextEvent, SdkTavernUserSnapshotEvent } from "./types";

const TAVERN_USER_PLACEHOLDER_REGEX = /\{\{\s*(user|personaUser)\s*\}\}/gi;

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function readPersonaSettingsRecord(
  context: SdkTavernContextEvent | null,
): Record<string, unknown> | null {
  const runtime = getTavernRuntimeContextEvent();
  const source = runtime?.powerUserSettings ?? context?.powerUserSettings;
  if (!source || typeof source !== "object") {
    return null;
  }
  return source as Record<string, unknown>;
}

function readChatMetadataPersona(
  context: SdkTavernContextEvent | null,
): string {
  const runtime = getTavernRuntimeContextEvent();
  const chatMetadata = runtime?.chatMetadata;
  if (!chatMetadata || typeof chatMetadata !== "object") {
    return "";
  }
  return normalizeText((chatMetadata as Record<string, unknown>).persona);
}

export function getCurrentTavernUserNameEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
  fallback = "User",
): string {
  return normalizeText(context?.name1) || normalizeText(fallback) || "User";
}

export function getCurrentTavernCounterpartNameEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): string {
  return normalizeText(context?.name2 ?? context?.characterName);
}

export function getCurrentTavernUserPersonaDescriptionEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): string {
  const personaSettings = readPersonaSettingsRecord(context);
  return replaceTavernUserPlaceholdersEvent(
    normalizeText(
      personaSettings?.persona_description
      ?? readChatMetadataPersona(context),
    ),
    context,
  );
}

export function getCurrentTavernUserSnapshotEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernUserSnapshotEvent | null {
  const userName = getCurrentTavernUserNameEvent(context, "");
  const counterpartName = getCurrentTavernCounterpartNameEvent(context);
  const personaDescription = getCurrentTavernUserPersonaDescriptionEvent(context);
  const metadataPersona = replaceTavernUserPlaceholdersEvent(readChatMetadataPersona(context), context, {
    userName,
  });
  const personaSettings = readPersonaSettingsRecord(context);
  const avatarName = normalizeText(personaSettings?.default_persona ?? personaSettings?.persona_avatar);

  if (!context && !userName && !personaDescription && !metadataPersona) {
    return null;
  }

  return {
    userName: userName || "User",
    counterpartName,
    personaDescription,
    metadataPersona,
    avatarName,
    avatarUrl: avatarName ? `User Avatars/${avatarName}` : "",
    hasPersonaDescription: Boolean(personaDescription || metadataPersona),
  };
}

export function replaceTavernUserPlaceholdersEvent(
  value: unknown,
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
  options?: {
    userName?: string;
    fallbackUserName?: string;
  },
): string {
  const text = String(value ?? "");
  if (!text || !text.includes("{{")) {
    return text;
  }
  const userName = normalizeText(options?.userName)
    || getCurrentTavernUserNameEvent(context, options?.fallbackUserName ?? "User");
  return text.replace(TAVERN_USER_PLACEHOLDER_REGEX, userName);
}