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
  analyzeSelectionFallbackSentencesEvent,
  countSelectionFallbackSentencesEvent,
  isMeaningfulSelectionFallbackFragmentEvent,
  trimSelectionFallbackNoiseEvent,
} = await import("./interactiveTriggersEvent");

describe("自由划词句段分析", () => {
  it("会把完整句和有效残片一起计入句段数", () => {
    const analysis = analyzeSelectionFallbackSentencesEvent(
      "，还有被野兽踩乱的痕迹。” 她略带歉意地看了你一眼，语气温柔得近乎哄慰。 ”"
    );

    expect(analysis.totalSegments).toBe(2);
    expect(analysis.segments).toHaveLength(2);
    expect(analysis.segments[0]?.text).toContain("被野兽踩乱的痕迹");
    expect(analysis.segments[1]?.text).toContain("她略带歉意地看了你一眼");
  });

  it("会把句末标点后的右引号视为完整句的一部分", () => {
    const analysis = analyzeSelectionFallbackSentencesEvent("她低声说：“别回头。”");

    expect(analysis.completeSentences).toBe(1);
    expect(analysis.fragmentCount).toBe(0);
    expect(analysis.totalSegments).toBe(1);
  });

  it("不会把纯引号或纯标点当成有效句段", () => {
    expect(isMeaningfulSelectionFallbackFragmentEvent("”")).toBe(false);
    expect(isMeaningfulSelectionFallbackFragmentEvent("……")).toBe(false);
    expect(trimSelectionFallbackNoiseEvent("” …… ）")).toBe("");
  });

  it("兼容旧计数入口并返回总句段数", () => {
    expect(countSelectionFallbackSentencesEvent("第一句。第二句。残片")).toBe(3);
  });
});
