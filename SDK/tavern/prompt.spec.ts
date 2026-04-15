import { describe, expect, it } from "vitest";
import { extractTavernMessageOriginalTextEvent, getTavernPromptMessageTextEvent } from "./prompt";

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
