import { describe, expect, it, vi } from "vitest";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

;(globalThis as any).window = (globalThis as any).window ?? {};

const {
  analyzeSelectionFallbackSegmentsEvent,
  countSelectionFallbackSmartSegmentsEvent,
  isSelectionFallbackLatestAssistantFloorAllowedEvent,
  isMeaningfulSelectionFallbackFragmentEvent,
  resolveLatestAssistantSelectionFallbackFloorKeyEvent,
  trimSelectionFallbackNoiseEvent,
} = await import("./interactiveTriggersEvent");

describe("自由划词句段分析", () => {
  const baseSettings = {
    selectionFallbackLongSentenceThreshold: 100,
    selectionFallbackMaxTotalLength: 999,
    selectionFallbackLongSentenceSplitPunctuationText: "，,、：",
  };

  it("会把完整句和有效残片一起计入句段数", () => {
    const analysis = analyzeSelectionFallbackSegmentsEvent(
      "，还有被野兽踩乱的痕迹。” 她略带歉意地看了你一眼，语气温柔得近乎哄慰。 ”"
    , baseSettings as any);

    expect(analysis.totalSegments).toBe(2);
    expect(analysis.segments).toHaveLength(2);
    expect(analysis.segments[0]?.text).toContain("被野兽踩乱的痕迹");
    expect(analysis.segments[1]?.text).toContain("她略带歉意地看了你一眼");
  });

  it("会把句末标点后的右引号视为完整句的一部分", () => {
    const analysis = analyzeSelectionFallbackSegmentsEvent("她低声说：“别回头。”", baseSettings as any);

    expect(analysis.mainSentenceCount).toBe(1);
    expect(analysis.fragmentCount).toBe(0);
    expect(analysis.totalSegments).toBe(1);
  });

  it("长句会在阈值触发时按逗号补切", () => {
    const analysis = analyzeSelectionFallbackSegmentsEvent(
      "她的神情微微收紧，粉色长发被林间拂来的风轻轻扬起。",
      {
        ...baseSettings,
        selectionFallbackLongSentenceThreshold: 12,
      } as any
    );

    expect(analysis.mainSentenceCount).toBe(1);
    expect(analysis.splitLongSentenceCount).toBeGreaterThan(1);
    expect(analysis.totalSegments).toBe(analysis.segments.length);
    expect(analysis.segments.some((item) => item.kind === "split_long_sentence")).toBe(true);
  });

  it("不会把纯引号或纯标点当成有效句段", () => {
    expect(isMeaningfulSelectionFallbackFragmentEvent("”")).toBe(false);
    expect(isMeaningfulSelectionFallbackFragmentEvent("……")).toBe(false);
    expect(trimSelectionFallbackNoiseEvent("” …… ）")).toBe("");
  });

  it("智能句段计数入口会返回总句段数", () => {
    expect(countSelectionFallbackSmartSegmentsEvent("第一句。第二句。残片", baseSettings as any)).toBe(3);
  });
});

describe("自由划词最新楼层限制", () => {
  function createMesTextNode(mesId: string): HTMLElement {
    return {
      closest: (selector: string) => {
        if (selector === "[mesid]" || selector === "[data-message-id]" || selector === ".mes") {
          return {
            getAttribute: (attr: string) => {
              if (attr === "mesid" || attr === "data-message-id" || attr === "data-mesid") {
                return mesId;
              }
              return "";
            },
          };
        }
        return null;
      },
    } as unknown as HTMLElement;
  }

  it("会把最后一条 assistant 消息识别为最新可划词楼层", () => {
    const floorKey = resolveLatestAssistantSelectionFallbackFloorKeyEvent(() => ({
      chat: [
        { role: "assistant", mes: "第一条" },
        { role: "user", mes: "回应" },
        { role: "assistant", mes: "第二条" },
      ],
    }));

    expect(floorKey).toBe("floor:2");
  });

  it("旧楼层会被拒绝", () => {
    const scopeNode = createMesTextNode("0");
    const result = isSelectionFallbackLatestAssistantFloorAllowedEvent(scopeNode, () => ({
      chat: [
        { role: "assistant", mes: "第一条" },
        { role: "user", mes: "回应" },
        { role: "assistant", mes: "第二条" },
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("自由划词仅允许在最新一条 AI 回复中操作。");
    expect(result.latestFloorKey).toBe("floor:2");
    expect(result.sourceFloorKey).toBe("floor:0");
  });

  it("最新楼层仍允许自由划词", () => {
    const scopeNode = createMesTextNode("2");
    const result = isSelectionFallbackLatestAssistantFloorAllowedEvent(scopeNode, () => ({
      chat: [
        { role: "assistant", mes: "第一条" },
        { role: "user", mes: "回应" },
        { role: "assistant", mes: "第二条" },
      ],
    }));

    expect(result.ok).toBe(true);
    expect(result.latestFloorKey).toBe("floor:2");
    expect(result.sourceFloorKey).toBe("floor:2");
  });

  it("无法解析最新 assistant 时会保守拒绝", () => {
    const scopeNode = createMesTextNode("0");
    const result = isSelectionFallbackLatestAssistantFloorAllowedEvent(scopeNode, () => ({
      chat: [
        { role: "user", mes: "只有用户消息" },
      ],
    }));

    expect(result.ok).toBe(false);
    expect(result.latestFloorKey).toBeNull();
    expect(result.reason).toBe("自由划词仅允许在最新一条 AI 回复中操作。");
  });
});
