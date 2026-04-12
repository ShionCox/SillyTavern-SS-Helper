interface SlashCommandParserEvent {
  addCommandObject(commandObject: unknown): void;
}

interface SlashCommandFactoryEvent {
  fromProps(props: Record<string, unknown>): unknown;
}

type DiceAnimStatusEvent = "critical_success" | "critical_failure" | "partial_success" | "success" | "failure";

export interface AnimationDebugCommandDepsEvent {
  SlashCommandParser: SlashCommandParserEvent | null;
  SlashCommand: SlashCommandFactoryEvent | null;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  roll3DDice: (expr: string) => Promise<unknown>;
  playRollAnimation: (status: DiceAnimStatusEvent) => Promise<void>;
}

/**
 * 功能：规范化动画测试命令传入的结果状态。
 * @param raw 原始状态文本。
 * @returns 合法状态；非法时返回默认成功状态。
 */
function normalizeAnimationStatusEvent(raw: string): DiceAnimStatusEvent {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "critical_success") return "critical_success";
  if (normalized === "critical_failure") return "critical_failure";
  if (normalized === "partial_success") return "partial_success";
  if (normalized === "failure") return "failure";
  return "success";
}

/**
 * 功能：注册骰子动画测试命令。
 * @param deps 命令依赖集合。
 * @returns 无返回值。
 */
export function registerAnimationDebugCommandEvent(deps: AnimationDebugCommandDepsEvent): void {
  const {
    SlashCommandParser,
    SlashCommand,
    appendToConsoleEvent,
    roll3DDice,
    playRollAnimation,
  } = deps;
  const globalRef = globalThis as { __stRollAnimationDebugCommandRegisteredEvent?: boolean };
  if (globalRef.__stRollAnimationDebugCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand) return;

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "rollanim",
      aliases: ["animroll", "testrollanim"],
      returns: "测试骰子动画，可选参数：表达式 状态",
      namedArgumentList: [],
      unnamedArgumentList: [],
      callback: (_namedArgs: Record<string, unknown>, unnamedArgs: unknown): string => {
        const rawText = String(unnamedArgs ?? "").trim();
        const parts = rawText ? rawText.split(/\s+/).filter(Boolean) : [];
        const expr = parts[0] || "1d20";
        const status = normalizeAnimationStatusEvent(parts[1] || "success");

        void (async (): Promise<void> => {
          try {
            await roll3DDice(expr);
            await playRollAnimation(status);
            appendToConsoleEvent(`已播放骰子动画测试：${expr} / ${status}`);
          } catch (error: any) {
            appendToConsoleEvent(`骰子动画测试失败：${error?.message ?? String(error)}`, "error");
          }
        })();

        return "";
      },
    })
  );

  globalRef.__stRollAnimationDebugCommandRegisteredEvent = true;
}
