import { describe, expect, it, vi } from "vitest";
import type { TavernMessageEvent } from "../types/eventDomainEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { getPreferredAssistantSourceTextEvent } from "./promptEvent";

describe("getPreferredAssistantSourceTextEvent", () => {
  it("对象型 swipe 会优先返回当前激活 swipe 的 mes 文本", () => {
    const message = {
      role: "assistant",
      mes: "消息本体文本",
      swipe_id: 0,
      swipes: [
        {
          mes: "对象 swipe 正文",
        },
      ],
    } as TavernMessageEvent;

    expect(getPreferredAssistantSourceTextEvent(message)).toBe("对象 swipe 正文");
  });

  it("字符串 swipe 与对象型 swipe 返回结果一致，不会落成对象字符串", () => {
    const stringSwipeMessage = {
      role: "assistant",
      mes: "消息本体文本",
      swipe_id: 0,
      swipes: ["同一段正文"],
    } as TavernMessageEvent;
    const objectSwipeMessage = {
      role: "assistant",
      mes: "消息本体文本",
      swipe_id: 0,
      swipes: [
        {
          mes: "同一段正文",
        },
      ],
    } as TavernMessageEvent;

    expect(getPreferredAssistantSourceTextEvent(stringSwipeMessage)).toBe("同一段正文");
    expect(getPreferredAssistantSourceTextEvent(objectSwipeMessage)).toBe("同一段正文");
    expect(getPreferredAssistantSourceTextEvent(objectSwipeMessage)).not.toBe("[object Object]");
  });
});
