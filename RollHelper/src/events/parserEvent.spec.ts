import { describe, expect, it, vi } from "vitest";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { resolveEventTimeLimitByUrgencyEvent } from "./parserEvent";

describe("resolveEventTimeLimitByUrgencyEvent", () => {
  const settings = {
    enableTimeLimit: true,
    enableAiUrgencyHint: true,
    timeLimitDefaultUrgency: "normal",
    timeLimitUrgencyLowSeconds: 45,
    timeLimitUrgencyNormalSeconds: 30,
    timeLimitUrgencyHighSeconds: 15,
    timeLimitUrgencyCriticalSeconds: 8,
  } as any;

  it("manual 事件会按 urgency 映射秒数", () => {
    const result = resolveEventTimeLimitByUrgencyEvent({
      rollMode: "manual",
      urgency: "high",
      settings,
    });

    expect(result.urgency).toBe("high");
    expect(result.timeLimitMs).toBe(15_000);
    expect(result.timeLimit).toBe("PT15S");
  });

  it("auto 事件始终无时限", () => {
    const result = resolveEventTimeLimitByUrgencyEvent({
      rollMode: "auto",
      urgency: "critical",
      settings,
    });

    expect(result.urgency).toBe("none");
    expect(result.timeLimitMs).toBeNull();
    expect(result.timeLimit).toBe("none");
  });

  it("关闭 AI 紧张提示后会回退到默认紧张程度", () => {
    const result = resolveEventTimeLimitByUrgencyEvent({
      rollMode: "manual",
      urgency: "critical",
      settings: {
        ...settings,
        enableAiUrgencyHint: false,
      },
    });

    expect(result.urgency).toBe("normal");
    expect(result.timeLimitMs).toBe(30_000);
    expect(result.timeLimit).toBe("PT30S");
  });
});
