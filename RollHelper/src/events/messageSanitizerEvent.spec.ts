import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TavernMessageEvent } from "../types/eventDomainEvent";

let floorStore = new WeakMap<object, { content: { raw: string } }>();

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../settings/storeEvent", () => ({
  getAssistantFloorRecordByMessageEvent: (message: object, createIfMissing = false) => {
    const existing = floorStore.get(message);
    if (existing || !createIfMissing) return existing ?? null;
    const created = { content: { raw: "" } };
    floorStore.set(message, created);
    return created;
  },
  mutateAssistantFloorRecordByMessageEvent: (message: object, mutator: (floor: { content: { raw: string } }) => void) => {
    const existing = floorStore.get(message) ?? { content: { raw: "" } };
    mutator(existing);
    floorStore.set(message, existing);
    return true;
  },
}));

import {
  ensureAssistantOriginalSnapshotPersistedEvent,
  getPersistedAssistantOriginalSourceTextEvent,
  getStableAssistantOriginalSourceTextEvent,
} from "./messageSanitizerEvent";

function buildAssistantMessage(text: string): TavernMessageEvent {
  return {
    role: "assistant",
    mes: text,
  } as TavernMessageEvent;
}

beforeEach(() => {
  floorStore = new WeakMap<object, { content: { raw: string } }>();
});

describe("messageSanitizerEvent", () => {
  it("会优先持久化宿主提供的结构化原文", () => {
    const message = buildAssistantMessage("这是当前显示正文");

    const changed = ensureAssistantOriginalSnapshotPersistedEvent(message, {
      getHostOriginalSourceTextEvent: () => "```rolljson\n{\"type\":\"dice_events\",\"events\":[]}\n```",
      getPreferredAssistantSourceTextEvent: () => "这是宿主偏好的纯正文",
      getMessageTextEvent: () => "这是当前显示正文",
      parseEventEnvelopesEvent: (text: string) => ({
        events: /dice_events/.test(text) ? [{} as any] : [],
        ranges: /```rolljson/.test(text) ? [{ start: 0, end: text.length }] : [],
      }),
    });

    expect(changed).toBe(true);
    expect(getPersistedAssistantOriginalSourceTextEvent(message)).toContain("dice_events");
    expect(getStableAssistantOriginalSourceTextEvent(message)).toContain("dice_events");
  });

  it("已有持久化原文时，不会被后续普通正文覆盖", () => {
    const message = buildAssistantMessage("第一版正文");

    ensureAssistantOriginalSnapshotPersistedEvent(message, {
      getHostOriginalSourceTextEvent: () => "```rolljson\n{\"type\":\"dice_events\",\"events\":[{\"id\":\"e1\"}]}\n```",
      getPreferredAssistantSourceTextEvent: () => "第一版正文",
      getMessageTextEvent: () => "第一版正文",
      parseEventEnvelopesEvent: (text: string) => ({
        events: /dice_events/.test(text) ? [{ id: "e1" } as any] : [],
        ranges: /```rolljson/.test(text) ? [{ start: 0, end: text.length }] : [],
      }),
    });

    const changed = ensureAssistantOriginalSnapshotPersistedEvent(message, {
      getHostOriginalSourceTextEvent: () => "第二版普通正文",
      getPreferredAssistantSourceTextEvent: () => "第二版普通正文",
      getMessageTextEvent: () => "第二版普通正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    });

    expect(changed).toBe(false);
    expect(getStableAssistantOriginalSourceTextEvent(message)).toContain("dice_events");
  });

  it("宿主给出残缺结构块时，会保留已有快照，不会被半截控制块污染", () => {
    const message = buildAssistantMessage("第一版正文");

    ensureAssistantOriginalSnapshotPersistedEvent(message, {
      getHostOriginalSourceTextEvent: () => "```rolljson\n{\"type\":\"dice_events\",\"events\":[{\"id\":\"e1\"}]}\n```",
      getPreferredAssistantSourceTextEvent: () => "第一版正文",
      getMessageTextEvent: () => "第一版正文",
      parseEventEnvelopesEvent: (text: string) => ({
        events: /dice_events/.test(text) ? [{ id: "e1" } as any] : [],
        ranges: /```rolljson/.test(text) ? [{ start: 0, end: text.length }] : [],
      }),
    });

    const changed = ensureAssistantOriginalSnapshotPersistedEvent(message, {
      getHostOriginalSourceTextEvent: () => "```rolljson\n{\"type\":\"dice_events\",\"events\":[",
      getPreferredAssistantSourceTextEvent: () => "第二版普通正文",
      getMessageTextEvent: () => "第二版普通正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    });

    expect(changed).toBe(false);
    expect(getPersistedAssistantOriginalSourceTextEvent(message)).toContain("\"id\":\"e1\"");
    expect(getStableAssistantOriginalSourceTextEvent(message)).toContain("\"id\":\"e1\"");
  });

  it("没有宿主结构化原文时，会按持久化快照、宿主正文、显示正文的固定顺序取源", () => {
    const message = buildAssistantMessage("当前显示正文");

    expect(getStableAssistantOriginalSourceTextEvent(message, {
      getHostOriginalSourceTextEvent: () => "",
      getPreferredAssistantSourceTextEvent: () => "宿主偏好正文",
      getMessageTextEvent: () => "当前显示正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    })).toBe("宿主偏好正文");

    expect(getStableAssistantOriginalSourceTextEvent(message, {
      getHostOriginalSourceTextEvent: () => "",
      getPreferredAssistantSourceTextEvent: () => "后续偏好正文",
      getMessageTextEvent: () => "后续显示正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    })).toBe("宿主偏好正文");

    const anotherMessage = buildAssistantMessage("当前显示正文");
    expect(ensureAssistantOriginalSnapshotPersistedEvent(anotherMessage, {
      getHostOriginalSourceTextEvent: () => "宿主原始正文",
      getPreferredAssistantSourceTextEvent: () => "宿主偏好正文",
      getMessageTextEvent: () => "当前显示正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    })).toBe(true);

    expect(getStableAssistantOriginalSourceTextEvent(anotherMessage, {
      getHostOriginalSourceTextEvent: () => "",
      getPreferredAssistantSourceTextEvent: () => "后续偏好正文",
      getMessageTextEvent: () => "后续显示正文",
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
    })).toBe("宿主原始正文");
  });
});
