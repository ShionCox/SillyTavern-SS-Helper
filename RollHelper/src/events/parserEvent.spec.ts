import { beforeEach, describe, expect, it, vi } from "vitest";

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../index", () => ({
  logger: loggerMock,
}));

import { parseIsoDurationToMsEvent } from "./parserEvent";

describe("parseIsoDurationToMsEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("把 none 视为不限时哨兵值，不重复打印警告", () => {
    const regex = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;

    expect(parseIsoDurationToMsEvent("none", regex)).toBeNull();
    expect(parseIsoDurationToMsEvent("无", regex)).toBeNull();
    expect(parseIsoDurationToMsEvent("关闭", regex)).toBeNull();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("非法值仍然只按非法 timeLimit 处理", () => {
    const regex = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i;

    expect(parseIsoDurationToMsEvent("abc", regex)).toBeNull();
    expect(loggerMock.warn).toHaveBeenCalledWith("非法 timeLimit，按不限时处理:", "abc");
  });
});
