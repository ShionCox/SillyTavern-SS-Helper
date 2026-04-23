import { describe, expect, it } from "vitest";
import { extractTavernMessageOriginalTextEvent, getTavernPromptMessageTextEvent, isTavernMessageHiddenEvent } from "./prompt";

describe("extractTavernMessageOriginalTextEvent", () => {
  it("对象型 swipe 会正确拼回 reasoning 与正文", () => {
    const result = extractTavernMessageOriginalTextEvent({
      swipe_id: 0,
      swipes: [
        {
          mes: "对象 swipe 正文",
        },
      ],
      swipe_info: [
        {
          extra: {
            reasoning: "这是推理区",
          },
        },
      ],
    });

    expect(result.text).toBe("这是推理区\n对象 swipe 正文");
    expect(result.source).toBe("swipes[0]+swipe_info[0].extra.reasoning");
  });
});

describe("getTavernPromptMessageTextEvent", () => {
  it("会优先返回当前激活 swipe 的正文", () => {
    const result = getTavernPromptMessageTextEvent({
      mes: "消息本体正文",
      swipe_id: 0,
      swipes: [
        {
          mes: "当前 swipe 正文",
        },
      ],
    });

    expect(result).toBe("当前 swipe 正文");
  });
});

describe("isTavernMessageHiddenEvent", () => {
  it("会识别顶层隐藏标记", () => {
    expect(isTavernMessageHiddenEvent({ is_hidden: true, mes: "隐藏楼层" })).toBe(true);
    expect(isTavernMessageHiddenEvent({ isHidden: true, mes: "隐藏楼层" })).toBe(true);
    expect(isTavernMessageHiddenEvent({ hide: true, mes: "隐藏楼层" })).toBe(true);
    expect(isTavernMessageHiddenEvent({ hidden: true, mes: "隐藏楼层" })).toBe(true);
  });

  it("会识别 extra 中的隐藏标记，普通消息不误判", () => {
    expect(isTavernMessageHiddenEvent({ mes: "隐藏楼层", extra: { hidden: true } })).toBe(true);
    expect(isTavernMessageHiddenEvent({ mes: "隐藏楼层", extra: { hid: true } })).toBe(true);
    expect(isTavernMessageHiddenEvent({ mes: "可见楼层", extra: { hidden: false } })).toBe(false);
    expect(isTavernMessageHiddenEvent({ mes: "可见楼层" })).toBe(false);
  });

  it("会把挂着 is_system 的隐藏 user 或 assistant 楼层识别为隐藏", () => {
    expect(isTavernMessageHiddenEvent({ is_user: true, is_system: true, mes: "隐藏用户楼层" })).toBe(true);
    expect(isTavernMessageHiddenEvent({ role: "assistant", is_system: true, mes: "隐藏助手楼层" })).toBe(true);
    expect(isTavernMessageHiddenEvent({ is_system: true, mes: "导入助手兼容楼层" })).toBe(false);
  });
});
