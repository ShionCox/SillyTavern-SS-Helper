import { describe, expect, it, vi } from "vitest";
import type { DiceEventSpecEvent } from "../types/eventDomainEvent";

vi.mock("../../index", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { filterEventsByApplyScopeEvent, isLikelyProtagonistActionEvent } from "./parserEvent";

function buildEvent(overrides: Partial<DiceEventSpecEvent> = {}): DiceEventSpecEvent {
  return {
    id: "event_test",
    title: "调查",
    checkDice: "1d100",
    dc: 50,
    compare: ">=",
    skill: "调查",
    targetType: "scene",
    targetLabel: "发黑的爪痕",
    desc: "检定描述",
    ...overrides,
  };
}

describe("parserEvent protagonist scope filter", () => {
  it("会保留主角对场景发起的检定事件", () => {
    const event = buildEvent({ targetType: "scene" });
    expect(isLikelyProtagonistActionEvent(event)).toBe(true);
    expect(filterEventsByApplyScopeEvent([event], "protagonist_only")).toHaveLength(1);
  });

  it("会保留主角对物件/线索发起的检定事件", () => {
    const event = buildEvent({ targetType: "object", targetLabel: "发黑的爪痕" });
    expect(isLikelyProtagonistActionEvent(event)).toBe(true);
    expect(filterEventsByApplyScopeEvent([event], "protagonist_only")).toHaveLength(1);
  });

  it("仍会排除明确是配角/NPC 的事件", () => {
    const event = buildEvent({ targetType: "supporting", targetLabel: "守卫" });
    expect(isLikelyProtagonistActionEvent(event)).toBe(false);
    expect(filterEventsByApplyScopeEvent([event], "protagonist_only")).toHaveLength(0);
  });
});
