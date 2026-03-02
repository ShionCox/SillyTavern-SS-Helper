import { normalizeBlankLinesEvent } from "../core/utilsEvent";
import type { ActiveStatusEvent, DiceMetaEvent, StatusScopeEvent } from "../types/eventDomainEvent";
import { logger } from "../../index";

export type ParsedStatusCommandEvent =
  | {
      kind: "apply";
      name: string;
      modifier: number;
      durationRounds?: number | null;
      scope: StatusScopeEvent;
      skills: string[];
    }
  | {
      kind: "remove";
      name: string;
    }
  | {
      kind: "clear";
    };

const STATUS_TAG_REGEX_Event = /\[(APPLY_STATUS|REMOVE_STATUS|CLEAR_STATUS)\s*:(.*?)\]|\[(CLEAR_STATUS)\]/gi;

function normalizeStringEvent(raw: any): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function normalizeRemainingRoundsEvent(raw: any): number | null {
  if (raw == null || raw === "") return null;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (rounded <= 0) return null;
  return rounded;
}

export function formatStatusRemainingRoundsLabelEvent(remainingRounds?: number | null): string {
  const normalized = normalizeRemainingRoundsEvent(remainingRounds);
  if (normalized == null) return "永久";
  return `剩余${normalized}轮`;
}

export function normalizeStatusNameKeyEvent(raw: any): string {
  return normalizeStringEvent(raw).toLowerCase();
}

export function normalizeStatusSkillKeyEvent(raw: any): string {
  return normalizeStringEvent(raw).toLowerCase();
}

function parseSkillsTextToKeysEvent(raw: string): string[] {
  const source = normalizeStringEvent(raw);
  if (!source) return [];
  const tokens = source
    .split("|")
    .map((item) => normalizeStatusSkillKeyEvent(item))
    .filter(Boolean);
  return Array.from(new Set(tokens));
}

function parseDurationRoundsFromTailEvent(tailText: string): number | null {
  const match = tailText.match(/(?:turns|duration)\s*=\s*([^,\]]+)/i);
  if (!match) return 1;
  const raw = String(match[1] ?? "").trim();
  if (!raw) return 1;
  if (/^(perm|permanent|forever|infinite|inf|\*)$/i.test(raw)) {
    return null;
  }
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && Math.floor(numeric) >= 1) {
    return Math.floor(numeric);
  }
  logger.warn(`状态标签 turns/duration 非法，已回退为 1 轮: ${raw}`);
  return 1;
}

export function stripStatusTagsFromTextEvent(text: string): string {
  const next = String(text || "").replace(STATUS_TAG_REGEX_Event, "").replace(/[ \t]{2,}/g, " ");
  return normalizeBlankLinesEvent(next);
}

export function parseStatusCommandsFromTextEvent(
  text: string,
  currentSkillName: string
): ParsedStatusCommandEvent[] {
  const commands: ParsedStatusCommandEvent[] = [];
  const source = String(text || "");
  const currentSkillKey = normalizeStatusSkillKeyEvent(currentSkillName);
  const regex = new RegExp(STATUS_TAG_REGEX_Event.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    const op = String(match[1] || match[3] || "").trim().toUpperCase();
    const payload = normalizeStringEvent(match[2] || "");
    if (op === "CLEAR_STATUS") {
      commands.push({ kind: "clear" });
      continue;
    }

    if (op === "REMOVE_STATUS") {
      const name = normalizeStringEvent(payload);
      if (!name) continue;
      commands.push({ kind: "remove", name });
      continue;
    }

    if (op !== "APPLY_STATUS") continue;
    const parts = payload.split(",").map((item) => normalizeStringEvent(item));
    const name = parts[0] || "";
    const modifier = Number(parts[1]);
    if (!name || !Number.isFinite(modifier)) continue;

    const tailText = parts.slice(2).join(",");
    const durationRounds = parseDurationRoundsFromTailEvent(tailText);
    let scope: StatusScopeEvent = "skills";
    let skills: string[] = [];
    if (/scope\s*=\s*all/i.test(tailText)) {
      scope = "all";
    } else {
      const skillsMatch = tailText.match(/skills\s*=\s*([^,\]]+)/i);
      if (skillsMatch) {
        skills = parseSkillsTextToKeysEvent(skillsMatch[1] || "");
      }
      if (skills.length <= 0 && currentSkillKey) {
        skills = [currentSkillKey];
      }
    }

    commands.push({
      kind: "apply",
      name,
      modifier,
      durationRounds,
      scope,
      skills,
    });
  }

  return commands;
}

export function extractStatusCommandsAndCleanTextEvent(
  text: string,
  currentSkillName: string
): { cleanedText: string; commands: ParsedStatusCommandEvent[] } {
  const commands = parseStatusCommandsFromTextEvent(text, currentSkillName);
  return {
    cleanedText: stripStatusTagsFromTextEvent(text),
    commands,
  };
}

export function normalizeActiveStatusEvent(raw: any, now = Date.now()): ActiveStatusEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const name = normalizeStringEvent((raw as any).name);
  const modifier = Number((raw as any).modifier);
  const remainingRounds = normalizeRemainingRoundsEvent((raw as any).remainingRounds);
  const scopeRaw = normalizeStringEvent((raw as any).scope).toLowerCase();
  const scope: StatusScopeEvent = scopeRaw === "all" ? "all" : "skills";
  const enabled = (raw as any).enabled !== false;
  const skillsRaw = Array.isArray((raw as any).skills) ? (raw as any).skills : [];
  const skills = Array.from(
    new Set<string>(
      skillsRaw
        .map((item: any) => normalizeStatusSkillKeyEvent(item))
        .filter((item): item is string => Boolean(item))
    )
  );
  const createdAtRaw = Number((raw as any).createdAt);
  const updatedAtRaw = Number((raw as any).updatedAt);
  const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : now;
  const updatedAt = Number.isFinite(updatedAtRaw) ? updatedAtRaw : createdAt;
  const sourceRaw = normalizeStringEvent((raw as any).source);
  const source = sourceRaw === "manual_editor" || sourceRaw === "ai_tag" ? sourceRaw : undefined;

  if (!name || !Number.isFinite(modifier)) return null;
  if (scope === "skills" && skills.length <= 0) return null;

  return {
    name,
    modifier,
    remainingRounds,
    scope,
    skills,
    enabled,
    createdAt,
    updatedAt,
    source,
  };
}

export function normalizeActiveStatusesEvent(raw: any): ActiveStatusEvent[] {
  if (!Array.isArray(raw)) return [];
  const normalized: ActiveStatusEvent[] = [];
  const dedupeIndex = new Map<string, number>();
  for (const item of raw) {
    const parsed = normalizeActiveStatusEvent(item);
    if (!parsed) continue;
    const key = normalizeStatusNameKeyEvent(parsed.name);
    const existingIdx = dedupeIndex.get(key);
    if (existingIdx == null) {
      dedupeIndex.set(key, normalized.length);
      normalized.push(parsed);
      continue;
    }
    normalized[existingIdx] = parsed;
  }
  return normalized;
}

export function ensureActiveStatusesEvent(meta: DiceMetaEvent): ActiveStatusEvent[] {
  if (!Array.isArray(meta.activeStatuses)) {
    meta.activeStatuses = [];
  }
  meta.activeStatuses = normalizeActiveStatusesEvent(meta.activeStatuses);
  return meta.activeStatuses;
}

export function applyStatusCommandsToMetaEvent(
  meta: DiceMetaEvent,
  commands: ParsedStatusCommandEvent[],
  source: "ai_tag" | "manual_editor",
  now = Date.now()
): boolean {
  if (!Array.isArray(commands) || commands.length <= 0) return false;
  const statuses = ensureActiveStatusesEvent(meta);
  let changed = false;

  for (const command of commands) {
    if (command.kind === "clear") {
      if (statuses.length > 0) {
        statuses.splice(0, statuses.length);
        changed = true;
      }
      continue;
    }

    if (command.kind === "remove") {
      const key = normalizeStatusNameKeyEvent(command.name);
      const idx = statuses.findIndex((item) => normalizeStatusNameKeyEvent(item.name) === key);
      if (idx >= 0) {
        statuses.splice(idx, 1);
        changed = true;
      }
      continue;
    }

    if (command.kind === "apply") {
      const key = normalizeStatusNameKeyEvent(command.name);
      const idx = statuses.findIndex((item) => normalizeStatusNameKeyEvent(item.name) === key);
      const previous = idx >= 0 ? statuses[idx] : null;
      const next: ActiveStatusEvent = {
        name: command.name,
        modifier: command.modifier,
        remainingRounds: command.durationRounds == null ? null : Math.max(1, Math.floor(command.durationRounds)),
        scope: command.scope,
        skills: command.scope === "all" ? [] : Array.from(new Set(command.skills)),
        enabled: true,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        source,
      };
      if (idx >= 0) {
        statuses[idx] = next;
      } else {
        statuses.push(next);
      }
      changed = true;
    }
  }

  return changed;
}

export function resolveStatusModifiersForSkillEvent(
  statuses: ActiveStatusEvent[],
  skillName: string
): { modifier: number; matched: Array<{ name: string; modifier: number }> } {
  const normalizedStatuses = normalizeActiveStatusesEvent(statuses);
  const skillKey = normalizeStatusSkillKeyEvent(skillName);
  let modifier = 0;
  const matched: Array<{ name: string; modifier: number }> = [];

  for (const status of normalizedStatuses) {
    if (!status.enabled) continue;
    const remaining = normalizeRemainingRoundsEvent(status.remainingRounds);
    if (status.remainingRounds != null && remaining == null) continue;
    const value = Number(status.modifier);
    if (!Number.isFinite(value)) continue;
    if (status.scope === "all") {
      modifier += value;
      matched.push({ name: status.name, modifier: value });
      continue;
    }
    if (!skillKey) continue;
    if (status.skills.includes(skillKey)) {
      modifier += value;
      matched.push({ name: status.name, modifier: value });
    }
  }

  return { modifier, matched };
}

export function buildActiveStatusesBlockEvent(
  statuses: ActiveStatusEvent[],
  startTag: string,
  endTag: string
): string {
  const normalized = normalizeActiveStatusesEvent(statuses);
  const lines: string[] = [];
  lines.push(startTag);
  if (normalized.length <= 0) {
    lines.push("none");
    lines.push(endTag);
    return normalizeBlankLinesEvent(lines.join("\n"));
  }
  lines.push(`count=${normalized.length}`);
  for (const item of normalized) {
    const scope = item.scope;
    const skills = scope === "all" ? "-" : item.skills.join("|");
    const duration = formatStatusRemainingRoundsLabelEvent(item.remainingRounds);
    lines.push(
      `- name="${item.name}" mod=${item.modifier >= 0 ? `+${item.modifier}` : item.modifier} duration=${duration} scope=${scope} skills=${skills} enabled=${item.enabled ? 1 : 0}`
    );
  }
  lines.push(endTag);
  return normalizeBlankLinesEvent(lines.join("\n"));
}
