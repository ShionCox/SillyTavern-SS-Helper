import { describe, expect, it, vi } from "vitest";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockedModules = vi.hoisted(() => ({
  hideEventCodeBlocksInMessageEvent: vi.fn(),
  enhanceInteractiveTriggersInMessageEvent: vi.fn(),
}));

vi.mock("./renderEvent", () => ({
  hideEventCodeBlocksInMessageEvent: mockedModules.hideEventCodeBlocksInMessageEvent,
}));

vi.mock("./interactiveTriggersEvent", () => ({
  enhanceInteractiveTriggersInMessageEvent: mockedModules.enhanceInteractiveTriggersInMessageEvent,
}));

import { finalizeAssistantFloorDataEvent } from "./hooksEvent";
import { getPersistedAssistantOriginalSourceTextEvent } from "./messageSanitizerEvent";

function createFakeDocument() {
  const bodyNode = {
    textContent: "",
    innerHTML: "",
    replaceChildrenCalls: 0,
    replaceChildren(fragment: { children?: Array<{ textContent?: string }> }) {
      this.replaceChildrenCalls += 1;
      const children = Array.isArray(fragment?.children) ? fragment.children : [];
      const text = children.map((item) => String(item?.textContent ?? "")).join("");
      this.textContent = text;
      this.innerHTML = text;
    },
  };
  const mesElement = {
    querySelector(selector: string) {
      if (selector === ".mes_text") return bodyNode;
      return null;
    },
  };
  const chatRoot = {
    querySelector(selector: string) {
      if (selector === `.mes[mesid="0"]`) return mesElement;
      return null;
    },
  };

  return {
    bodyNode,
    document: {
      getElementById(id: string) {
        if (id === "chat") return chatRoot;
        return null;
      },
      createDocumentFragment() {
        return {
          children: [] as Array<{ textContent?: string }>,
          appendChild(node: { textContent?: string }) {
            this.children.push(node);
            return node;
          },
        };
      },
      createElement(tagName: string) {
        return {
          tagName,
          textContent: tagName.toLowerCase() === "br" ? "\n" : "",
        };
      },
      createTextNode(text: string) {
        return { textContent: text };
      },
    },
  };
}

describe("finalizeAssistantFloorDataEvent", () => {
  it("会在 autoRoll 前先同步当前消息 DOM 为干净正文", async () => {
    const sourceText = `剧情正文里有<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`rolljson
{"type":"dice_events","version":"1","events":[{"id":"event-1","skill":"调查","targetName":"奇怪的响声"}]}
\`\`\`\n\n\`\`\`triggerjson
{"type":"trigger_pack","version":"1","items":[{"sid":"weird_sound","skill":"调查","difficulty":"normal","reveal":"instant","success":"你听见了木板后的抓挠声。"}]}
\`\`\``;
    const message = {
      mes: sourceText,
      extra: {},
    };
    const meta = {
      pendingRound: {
        roundId: "round-1",
        status: "open",
        events: [],
        rolls: [],
      },
    };
    const { bodyNode, document } = createFakeDocument();
    bodyNode.textContent = sourceText;
    bodyNode.innerHTML = sourceText;
    (globalThis as any).document = document;

    const persistChatSafeEvent = vi.fn();
    const saveMetadataSafeEvent = vi.fn();
    const mergeEventsIntoPendingRoundEvent = vi.fn(() => meta.pendingRound);
    const autoRollEventsByAiModeEvent = vi.fn(async () => {
      expect(bodyNode.textContent).toBe("剧情正文里有奇怪的响声。");
      expect(bodyNode.textContent).not.toContain("rolljson");
      expect(bodyNode.textContent).not.toContain("triggerjson");
      return ["event-1"];
    });

    const result = await finalizeAssistantFloorDataEvent({
      msg: message as any,
      index: 0,
    }, {
      getLiveContextEvent: () => ({ chat: [message] } as any),
      getSettingsEvent: () => ({
        enabled: true,
        eventApplyScope: "all",
        enableAiRoundControl: false,
        defaultBlindSkillsText: "调查",
      }),
      getDiceMetaEvent: () => meta as any,
      buildAssistantMessageIdEvent: () => "assistant:1:swipe_0:hash",
      buildAssistantFloorKeyEvent: () => "floor:1",
      getStableAssistantOriginalSourceTextEvent: () => sourceText,
      getHostOriginalSourceTextEvent: () => sourceText,
      getPreferredAssistantSourceTextEvent: () => sourceText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => {
        const start = text.indexOf("```rolljson");
        const end = text.indexOf("```", start + 3);
        return {
          events: [{ id: "event-1", skill: "调查", targetName: "奇怪的响声" }],
          ranges: start >= 0 && end >= 0 ? [{ start, end: end + 3 }] : [],
          shouldEndRound: false,
        };
      },
      filterEventsByApplyScopeEvent: (events) => events as any,
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.replace(/\n{3,}/g, "\n\n").trim();
      },
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
      hideEventCodeBlocksInDomEvent: vi.fn(),
      enhanceInteractiveTriggersInDomEvent: vi.fn(),
      enhanceAssistantRawSourceButtonsEvent: vi.fn(),
      persistChatSafeEvent,
      mergeEventsIntoPendingRoundEvent,
      invalidatePendingRoundFloorEvent: vi.fn(() => false),
      invalidateSummaryHistoryFloorEvent: vi.fn(() => false),
      autoRollEventsByAiModeEvent,
      refreshAllWidgetsFromStateEvent: vi.fn(),
      sweepTimeoutFailuresEvent: vi.fn(() => false),
      refreshCountdownDomEvent: vi.fn(),
      saveMetadataSafeEvent,
    });

    expect(result.changedData).toBe(true);
    expect(String(message.mes)).toBe("剧情正文里有奇怪的响声。");
    expect(getPersistedAssistantOriginalSourceTextEvent(message as any)).toBe(sourceText);
    expect(mergeEventsIntoPendingRoundEvent).toHaveBeenCalledOnce();
    expect(autoRollEventsByAiModeEvent).toHaveBeenCalledOnce();
    expect(persistChatSafeEvent).toHaveBeenCalledOnce();
    expect(saveMetadataSafeEvent).toHaveBeenCalledOnce();
  });

  it("纯 rolljson 消息即使清理后正文为空，也会继续接管事件", async () => {
    const sourceText = `\`\`\`rolljson
{"type":"dice_events","version":"1","events":[{"id":"event-1","skill":"调查","targetName":"暗门"}]}
\`\`\``;
    const message = {
      mes: sourceText,
      extra: {},
    };
    const meta = {
      pendingRound: {
        roundId: "round-1",
        status: "open",
        events: [],
        rolls: [],
      },
    };
    const { bodyNode, document } = createFakeDocument();
    bodyNode.textContent = sourceText;
    bodyNode.innerHTML = sourceText;
    (globalThis as any).document = document;

    const mergeEventsIntoPendingRoundEvent = vi.fn(() => meta.pendingRound);
    const autoRollEventsByAiModeEvent = vi.fn(async () => ["event-1"]);

    await finalizeAssistantFloorDataEvent({
      msg: message as any,
      index: 0,
    }, {
      getLiveContextEvent: () => ({ chat: [message] } as any),
      getSettingsEvent: () => ({
        enabled: true,
        eventApplyScope: "all",
        enableAiRoundControl: false,
        defaultBlindSkillsText: "调查",
      }),
      getDiceMetaEvent: () => meta as any,
      buildAssistantMessageIdEvent: () => "assistant:1:swipe_0:hash",
      buildAssistantFloorKeyEvent: () => "floor:1",
      getStableAssistantOriginalSourceTextEvent: () => sourceText,
      getHostOriginalSourceTextEvent: () => sourceText,
      getPreferredAssistantSourceTextEvent: () => sourceText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => {
        const start = text.indexOf("```rolljson");
        const end = text.indexOf("```", start + 3);
        return {
          events: [{ id: "event-1", skill: "调查", targetName: "暗门" }],
          ranges: start >= 0 && end >= 0 ? [{ start, end: end + 3 }] : [],
          shouldEndRound: false,
        };
      },
      filterEventsByApplyScopeEvent: (events) => events as any,
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.replace(/\n{3,}/g, "\n\n").trim();
      },
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
      hideEventCodeBlocksInDomEvent: vi.fn(),
      enhanceInteractiveTriggersInDomEvent: vi.fn(),
      enhanceAssistantRawSourceButtonsEvent: vi.fn(),
      persistChatSafeEvent: vi.fn(),
      mergeEventsIntoPendingRoundEvent,
      invalidatePendingRoundFloorEvent: vi.fn(() => false),
      invalidateSummaryHistoryFloorEvent: vi.fn(() => false),
      autoRollEventsByAiModeEvent,
      refreshAllWidgetsFromStateEvent: vi.fn(),
      sweepTimeoutFailuresEvent: vi.fn(() => false),
      refreshCountdownDomEvent: vi.fn(),
      saveMetadataSafeEvent: vi.fn(),
    });

    expect(String(message.mes)).toBe("");
    expect(mergeEventsIntoPendingRoundEvent).toHaveBeenCalledOnce();
    expect(autoRollEventsByAiModeEvent).toHaveBeenCalledOnce();
  });

  it("当前消息 DOM 已无内部残留时，不会强制降级为纯文本重绘", async () => {
    const sourceText = `剧情正文里有<rh-trigger action="调查" skill="调查" blind="1" sourceId="weird_sound">奇怪的响声</rh-trigger>。\n\n\`\`\`rolljson
{"type":"dice_events","version":"1","events":[{"id":"event-1","skill":"调查","targetName":"奇怪的响声"}]}
\`\`\`\n\n\`\`\`triggerjson
{"type":"trigger_pack","version":"1","items":[{"sid":"weird_sound","skill":"调查","difficulty":"normal","reveal":"instant","success":"你听见了木板后的抓挠声。"}]}
\`\`\``;
    const message = {
      mes: sourceText,
      extra: {},
    };
    const meta = {
      pendingRound: {
        roundId: "round-1",
        status: "open",
        events: [],
        rolls: [],
      },
    };
    const { bodyNode, document } = createFakeDocument();
    bodyNode.textContent = "剧情正文里有奇怪的响声。";
    bodyNode.innerHTML = "<p>剧情正文里有<strong>奇怪的响声</strong>。</p>";
    (globalThis as any).document = document;

    await finalizeAssistantFloorDataEvent({
      msg: message as any,
      index: 0,
    }, {
      getLiveContextEvent: () => ({ chat: [message] } as any),
      getSettingsEvent: () => ({
        enabled: true,
        eventApplyScope: "all",
        enableAiRoundControl: false,
        defaultBlindSkillsText: "调查",
      }),
      getDiceMetaEvent: () => meta as any,
      buildAssistantMessageIdEvent: () => "assistant:1:swipe_0:hash",
      buildAssistantFloorKeyEvent: () => "floor:1",
      getStableAssistantOriginalSourceTextEvent: () => sourceText,
      getHostOriginalSourceTextEvent: () => sourceText,
      getPreferredAssistantSourceTextEvent: () => sourceText,
      getMessageTextEvent: (target) => String((target as any)?.mes ?? ""),
      parseEventEnvelopesEvent: (text) => {
        const start = text.indexOf("```rolljson");
        const end = text.indexOf("```", start + 3);
        return {
          events: [{ id: "event-1", skill: "调查", targetName: "奇怪的响声" }],
          ranges: start >= 0 && end >= 0 ? [{ start, end: end + 3 }] : [],
          shouldEndRound: false,
        };
      },
      filterEventsByApplyScopeEvent: (events) => events as any,
      removeRangesEvent: (text, ranges) => {
        const [range] = ranges;
        return `${text.slice(0, range.start)}${text.slice(range.end)}`.replace(/\n{3,}/g, "\n\n").trim();
      },
      setMessageTextEvent: (target, text) => {
        (target as any).mes = text;
      },
      hideEventCodeBlocksInDomEvent: vi.fn(),
      enhanceInteractiveTriggersInDomEvent: vi.fn(),
      enhanceAssistantRawSourceButtonsEvent: vi.fn(),
      persistChatSafeEvent: vi.fn(),
      mergeEventsIntoPendingRoundEvent: vi.fn(() => meta.pendingRound),
      invalidatePendingRoundFloorEvent: vi.fn(() => false),
      invalidateSummaryHistoryFloorEvent: vi.fn(() => false),
      autoRollEventsByAiModeEvent: vi.fn(async () => ["event-1"]),
      refreshAllWidgetsFromStateEvent: vi.fn(),
      sweepTimeoutFailuresEvent: vi.fn(() => false),
      refreshCountdownDomEvent: vi.fn(),
      saveMetadataSafeEvent: vi.fn(),
    });

    expect(bodyNode.replaceChildrenCalls).toBe(0);
    expect(bodyNode.innerHTML).toBe("<p>剧情正文里有<strong>奇怪的响声</strong>。</p>");
  });
});
