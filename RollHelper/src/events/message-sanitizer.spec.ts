import { describe, expect, it, vi } from "vitest";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  ensureAssistantOriginalSnapshotPersistedEvent,
  getPersistedAssistantOriginalSourceMetaEvent,
  getPersistedAssistantOriginalSourceTextEvent,
  getStableAssistantOriginalSourceTextEvent,
  sanitizeAssistantMessageArtifactsEvent,
} from "./messageSanitizerEvent";
import { getAssistantOriginalSourceCandidateFromHostEvent } from "./promptEvent";
import { buildAssistantMessageIdEvent } from "./hooksEvent";
import { getMessageInteractiveTriggersEvent, getMessageTriggerPackEvent } from "./interactiveTriggerMetadataEvent";

function parseRanges(text: string) {
  const start = text.indexOf("```rolljson");
  if (start < 0) {
    return [];
  }
  const end = text.indexOf("```", start + 3);
  if (end < 0) {
    return [];
  }
  return [{ start, end: end + 3 }];
}

describe("原始文本稳定快照", () => {
  it("宿主候选带控制块时会优先持久化 richer 快照", () => {
    const preferredText = "塞拉菲娜压低声音，让你先别出声。";
    const hostOriginalText = `${preferredText}\n\n\`\`\`rolljson\n{"type":"dice_events","version":"1","events":[]}\n\`\`\``;
    const message = {
      mes: preferredText,
      extra: {},
    };

    const changed = ensureAssistantOriginalSnapshotPersistedEvent(message as any, {
      getHostOriginalSourceTextEvent: () => hostOriginalText,
      getPreferredAssistantSourceTextEvent: () => preferredText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => ({
        events: [],
        ranges: parseRanges(text),
      }),
    });

    expect(changed).toBe(true);
    expect(getPersistedAssistantOriginalSourceTextEvent(message as any)).toBe(hostOriginalText);
    expect(getPersistedAssistantOriginalSourceMetaEvent(message as any)).toMatchObject({
      source: "host",
      containsRollJson: true,
      containsEventEnvelope: true,
      containsInteractiveTrigger: false,
    });
    expect(
      getStableAssistantOriginalSourceTextEvent(message as any, {
        getHostOriginalSourceTextEvent: () => preferredText,
        getPreferredAssistantSourceTextEvent: () => preferredText,
        getMessageTextEvent: () => preferredText,
      })
    ).toBe(hostOriginalText);
  });

  it("sanitize 前会先保留 stable snapshot，再清理展示正文", () => {
    const preferredText = `塞拉菲娜抬手示意你停下。\n\n\`\`\`rolljson\n{"type":"dice_events","version":"1","events":[]}\n\`\`\``;
    const hostOriginalText = `旁白前缀\n${preferredText}`;
    const message = {
      mes: preferredText,
      extra: {},
    };

    const changed = sanitizeAssistantMessageArtifactsEvent(message as any, 0, {
      getHostOriginalSourceTextEvent: () => hostOriginalText,
      getPreferredAssistantSourceTextEvent: () => preferredText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => ({
        events: [],
        ranges: parseRanges(text),
      }),
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.trim();
      },
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).toBe("塞拉菲娜抬手示意你停下。");
    expect(getPersistedAssistantOriginalSourceTextEvent(message as any)).toBe(hostOriginalText);
  });

  it("display_text 场景下 metadata 缺失时会从稳定原文重建交互触发", () => {
    const displayText = "你察觉到奇怪的响声。";
    const hostOriginalText = `你察觉到<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`triggerpack
{
  "type": "trigger_pack",
  "version": "1",
  "items": [
    {
      "sid": "weird_sound",
      "skill": "调查",
      "difficulty": "normal",
      "reveal": "instant",
      "success": "你听出那不是风，而是木板后的抓挠声。",
      "failure": "你暂时还听不清来源。"
    }
  ]
}
\`\`\``;
    const message = {
      mes: displayText,
      extra: {},
    };

    const changed = sanitizeAssistantMessageArtifactsEvent(message as any, 0, {
      getSettingsEvent: () => ({ defaultBlindSkillsText: "调查,察觉" }),
      getHostOriginalSourceTextEvent: () => hostOriginalText,
      getPreferredAssistantSourceTextEvent: () => displayText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: () => ({
        events: [],
        ranges: [],
      }),
      removeRangesEvent: (text) => text,
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
      sourceState: "display_text",
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).toBe(displayText);
    expect(getMessageInteractiveTriggersEvent(message as any)).toHaveLength(1);
    expect(getMessageTriggerPackEvent(message as any)?.items[0].sid).toBe("weird_sound");
  });

  it("流式阶段只补写快照，不会改动当前展示正文", () => {
    const preferredText = "她示意你先不要出声。";
    const hostOriginalText = `${preferredText}\n\n\`\`\`rolljson\n{"type":"dice_events","version":"1","events":[]}\n\`\`\``;
    const message = {
      mes: preferredText,
      extra: {},
    };

    const changed = ensureAssistantOriginalSnapshotPersistedEvent(message as any, {
      getHostOriginalSourceTextEvent: () => hostOriginalText,
      getPreferredAssistantSourceTextEvent: () => preferredText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => ({
        events: [],
        ranges: parseRanges(text),
      }),
    });

    expect(changed).toBe(true);
    expect(String(message.mes)).toBe(preferredText);
    expect(getPersistedAssistantOriginalSourceTextEvent(message as any)).toBe(hostOriginalText);
  });
});

describe("宿主原文候选 getter", () => {
  it("不会再把宿主 richer 原文降级成 preferredText", () => {
    const message = {
      mes: "塞拉菲娜让你跟紧她。",
      extra: {
        reasoning: "<analysis>林间气息异常，附近可能仍有追踪者。</analysis>",
      },
    };

    expect(getAssistantOriginalSourceCandidateFromHostEvent(message as any)).toBe(
      "<analysis>林间气息异常，附近可能仍有追踪者。</analysis>\n塞拉菲娜让你跟紧她。"
    );
  });
});

describe("原文读取一致性", () => {
  it("buildAssistantMessageId 会优先使用稳定快照策略", () => {
    const stableText = `脚步声在林间回荡。\n\n\`\`\`rolljson\n{"type":"dice_events","version":"1","events":[]}\n\`\`\``;
    const message = {
      mes: "脚步声在林间回荡。",
      swipe_id: 0,
      extra: {},
    };

    const assistantId = buildAssistantMessageIdEvent(message as any, 3, {
      simpleHashEvent: (input) => `hash:${input}`,
      getStableAssistantOriginalSourceTextEvent: () => stableText,
      getHostOriginalSourceTextEvent: () => "较贫正文",
      getPreferredAssistantSourceTextEvent: () => "较贫正文",
      getMessageTextEvent: () => "较贫正文",
      parseEventEnvelopesEvent: (text) => ({
        events: [],
        ranges: parseRanges(text),
      }),
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.trim();
      },
    });

    expect(assistantId).toContain("swipe_0");
    expect(assistantId).toContain("hash:脚步声在林间回荡。");
  });
});
