import { getSillyTavernContextEvent, resolveCurrentGroupEvent } from "./context";
import type {
  SdkTavernContextEvent,
  SdkTavernGroupEvent,
  SdkTavernGroupMemberEvent,
  SdkTavernGroupSnapshotEvent,
} from "./types";

function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMember(
  value: unknown,
): SdkTavernGroupMemberEvent | null {
  if (typeof value === "string") {
    const name = normalizeText(value);
    return name ? { name } : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const name = normalizeText(record.name ?? record.id);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || undefined,
    name,
    avatar: normalizeText(record.avatar) || undefined,
  };
}

function buildGroupSnapshot(group: SdkTavernGroupEvent): SdkTavernGroupSnapshotEvent | null {
  const groupId = normalizeText(group.id);
  if (!groupId) {
    return null;
  }
  return {
    groupId,
    groupKey: `group:${groupId}`,
    displayName: normalizeText(group.name) || groupId,
    avatarUrl: normalizeText(group.avatar_url),
    currentChatId: normalizeText(group.chat_id),
    members: resolveTavernGroupMembersEvent(group),
    group,
  };
}

export function resolveTavernGroupMembersEvent(
  value: SdkTavernGroupEvent | SdkTavernContextEvent | unknown,
): SdkTavernGroupMemberEvent[] {
  const record = value as Record<string, unknown> | null | undefined;
  const rawMembers = Array.isArray(record?.members)
    ? record?.members
    : Array.isArray(record?.groupMembers)
      ? record?.groupMembers
      : Array.isArray(record?.group_members)
        ? record?.group_members
        : Array.isArray(record?.memberNames)
          ? record?.memberNames
          : [];
  return rawMembers
    .map((item) => normalizeMember(item))
    .filter((item): item is SdkTavernGroupMemberEvent => Boolean(item));
}

export function getCurrentTavernGroupEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernGroupEvent | null {
  return resolveCurrentGroupEvent(context);
}

export function getCurrentTavernGroupSnapshotEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernGroupSnapshotEvent | null {
  const group = getCurrentTavernGroupEvent(context);
  return group ? buildGroupSnapshot(group) : null;
}

export function listTavernGroupSnapshotsEvent(
  context: SdkTavernContextEvent | null = getSillyTavernContextEvent(),
): SdkTavernGroupSnapshotEvent[] {
  const groups = Array.isArray(context?.groups) ? context.groups : [];
  return groups
    .map((group) => buildGroupSnapshot(group))
    .filter((item): item is SdkTavernGroupSnapshotEvent => Boolean(item));
}