import { buildEventRollHelpTemplateEvent, buildPreBlockTemplateEvent } from "../templates/helpTemplates";
import { formatIsoDurationNaturalLanguageEvent } from "../core/utilsEvent";
import type {
  ActiveStatusEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  PendingRoundEvent,
} from "../types/eventDomainEvent";
import { ensureActiveStatusesEvent, formatStatusRemainingRoundsLabelEvent, resolveStatusModifiersForSkillEvent } from "../events/statusEvent";

type RuntimeViewStateEvent = {
  text: string;
};

export interface EventRollCommandDepsEvent {
  SlashCommandParser: any;
  SlashCommand: any;
  SlashCommandArgument: any;
  ARGUMENT_TYPE: any;
  appendToConsoleEvent: (html: string, level?: "info" | "warn" | "error") => void;
  sweepTimeoutFailuresEvent: () => boolean;
  getDiceMetaEvent: () => DiceMetaEvent;
  getSettingsEvent: () => DicePluginSettingsEvent;
  ensureRoundEventTimersSyncedEvent: (round: PendingRoundEvent) => void;
  getEventRuntimeViewStateEvent: (
    round: PendingRoundEvent,
    event: DiceEventSpecEvent,
    now?: number
  ) => RuntimeViewStateEvent;
  resolveSkillModifierBySkillNameEvent: (
    skillName: string,
    settings?: DicePluginSettingsEvent
  ) => number;
  performEventRollByIdEvent: (
    eventIdRaw: string,
    overrideExpr?: string,
    expectedRoundId?: string
  ) => Promise<string>;
  escapeHtmlEvent: (input: string) => string;
}

function buildEventRollHelpMessageEvent(): string {
  return buildEventRollHelpTemplateEvent();
}

function formatSignedEvent(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function formatAdvantageStateTextEvent(raw: any): string {
  if (raw === "advantage") return "优势";
  if (raw === "disadvantage") return "劣势";
  return "正常";
}

function formatRollModeTextEvent(raw: any): string {
  return raw === "auto" ? "自动" : "手动";
}

function formatDifficultyTextEvent(raw: any): string {
  if (raw === "easy") return "简单";
  if (raw === "hard") return "困难";
  if (raw === "extreme") return "极难";
  if (raw === "normal") return "普通";
  return "";
}

function formatStatusItemForListEvent(status: ActiveStatusEvent): string {
  const skillsText = status.scope === "all" ? "-" : status.skills.join("|");
  const scopeLabel = status.scope === "all" ? "全局" : "按技能";
  const durationLabel = formatStatusRemainingRoundsLabelEvent(status.remainingRounds);
  const enabledLabel = status.enabled ? "启用" : "停用";
  return `- ${status.name} | ${formatSignedEvent(status.modifier)} | 持续=${durationLabel} | 范围=${scopeLabel} | 技能=${skillsText} | ${enabledLabel}`;
}

function formatStatusPreviewForEventLineEvent(
  settings: DicePluginSettingsEvent,
  activeStatuses: ActiveStatusEvent[],
  skillName: string
): string {
  if (!settings.enableStatusSystem) return "状态=关闭";
  const resolved = resolveStatusModifiersForSkillEvent(activeStatuses, skillName);
  const roundsByName = new Map<string, number | null>();
  for (const status of activeStatuses) {
    const key = String(status?.name ?? "").trim().toLowerCase();
    if (!key) continue;
    roundsByName.set(key, status.remainingRounds ?? null);
  }
  if (resolved.modifier === 0) return "状态=+0";
  const detail =
    resolved.matched.length > 0
      ? `（${resolved.matched
          .map(
            (item) =>
              `${item.name}${formatSignedEvent(item.modifier)}(${formatStatusRemainingRoundsLabelEvent(
                roundsByName.get(String(item.name ?? "").trim().toLowerCase()) ?? null
              )})`
          )
          .join("，")}）`
      : "";
  return `状态=${formatSignedEvent(resolved.modifier)}${detail}`;
}

function buildEventListTextEvent(
  round: PendingRoundEvent,
  deps: Pick<
    EventRollCommandDepsEvent,
    | "getSettingsEvent"
    | "getDiceMetaEvent"
    | "ensureRoundEventTimersSyncedEvent"
    | "getEventRuntimeViewStateEvent"
    | "resolveSkillModifierBySkillNameEvent"
  >
): string {
  const settings = deps.getSettingsEvent();
  const meta = deps.getDiceMetaEvent();
  const activeStatuses = ensureActiveStatusesEvent(meta);
  deps.ensureRoundEventTimersSyncedEvent(round);

  const lines: string[] = [];
  lines.push(`当前轮次: ${round.roundId}`);
  lines.push(`事件数量: ${round.events.length}`);
  lines.push(`状态系统: ${settings.enableStatusSystem ? "开启" : "关闭"}`);
  if (settings.enableStatusSystem) {
    if (activeStatuses.length <= 0) {
      lines.push("Active_Statuses:");
      lines.push("- 无");
    } else {
      lines.push("Active_Statuses:");
      for (const status of activeStatuses) {
        lines.push(formatStatusItemForListEvent(status));
      }
    }
  }

  for (const event of round.events) {
    const state = deps.getEventRuntimeViewStateEvent(round, event);
    const skillMod = deps.resolveSkillModifierBySkillNameEvent(event.skill, settings);
    const statusPreview = formatStatusPreviewForEventLineEvent(settings, activeStatuses, event.skill);
    const dcReasonPreview =
      settings.enableDynamicDcReason && event.dcReason ? ` | DC原因=${event.dcReason}` : "";
    const difficultyPreview = event.difficulty
      ? ` | 难度=${formatDifficultyTextEvent(event.difficulty)}`
      : "";
    const dcSourcePreview = event.dcSource === "difficulty_mapped" ? " | 阈值=系统换算" : "";
    lines.push(
      `- ${event.id}: ${event.title} | 对象=${event.targetLabel} | 骰式=${event.checkDice} | 条件=${
        event.compare ?? ">="
      } ${event.dc}${difficultyPreview}${dcSourcePreview}${dcReasonPreview} | 技能=${event.skill} | 技能修正=${formatSignedEvent(
        skillMod
      )} | 模式=${formatRollModeTextEvent(event.rollMode)} | 骰态=${formatAdvantageStateTextEvent(
        event.advantageState
      )} | 时限=${
        formatIsoDurationNaturalLanguageEvent(event.timeLimit ?? "无")
      } | ${statusPreview} | 状态=${state.text}`
    );
  }
  return lines.join("\n");
}

export function registerEventRollCommandEvent(deps: EventRollCommandDepsEvent): void {
  const {
    SlashCommandParser,
    SlashCommand,
    SlashCommandArgument,
    ARGUMENT_TYPE,
    appendToConsoleEvent,
    sweepTimeoutFailuresEvent,
    getDiceMetaEvent,
    getSettingsEvent,
    ensureRoundEventTimersSyncedEvent,
    getEventRuntimeViewStateEvent,
    resolveSkillModifierBySkillNameEvent,
    performEventRollByIdEvent,
    escapeHtmlEvent,
  } = deps;

  const globalRef = globalThis as any;
  if (globalRef.__stRollEventCommandRegisteredEvent) return;
  if (!SlashCommandParser || !SlashCommand || !SlashCommandArgument || !ARGUMENT_TYPE) {
    return;
  }

  SlashCommandParser.addCommandObject(
    SlashCommand.fromProps({
      name: "eventroll",
      aliases: ["eroll"],
      returns: "事件骰子命令：list / roll / help",
      namedArgumentList: [],
      unnamedArgumentList: [
        SlashCommandArgument.fromProps({
          description: "子命令，例如：list | roll lockpick_gate 1d20+3",
          typeList: ARGUMENT_TYPE.STRING,
          isRequired: false,
        }),
      ],
      helpString: buildEventRollHelpMessageEvent(),
      callback: (_namedArgs: Record<string, any>, unnamedArgs: any) => {
        const raw = (unnamedArgs ?? "").toString().trim();
        const parts = raw ? raw.split(/\s+/) : [];
        const action = (parts[0] || "help").toLowerCase();

        if (action === "help") {
          appendToConsoleEvent(buildEventRollHelpMessageEvent());
          return "";
        }

        if (action === "list") {
          sweepTimeoutFailuresEvent();
          const meta = getDiceMetaEvent();
          const round = meta.pendingRound;
          if (!round || round.status !== "open") {
            appendToConsoleEvent("当前没有可用事件，请先等待 AI 输出事件 JSON。", "warn");
            return "";
          }
          const msg = buildPreBlockTemplateEvent(
            escapeHtmlEvent(
              buildEventListTextEvent(round, {
                getSettingsEvent,
                getDiceMetaEvent,
                ensureRoundEventTimersSyncedEvent,
                getEventRuntimeViewStateEvent,
                resolveSkillModifierBySkillNameEvent,
              })
            )
          );
          appendToConsoleEvent(msg);
          return "";
        }

        if (action === "roll") {
          const eventId = parts[1] || "";
          const overrideExpr = parts.length > 2 ? parts.slice(2).join(" ") : undefined;
          performEventRollByIdEvent(eventId, overrideExpr).then(feedback => { 
            if (feedback) {
              appendToConsoleEvent(feedback, "error");
            }
          });
          return "";
        }

        appendToConsoleEvent("未知子命令，请使用 /eventroll help 查看帮助。", "warn");
        return "";
      },
    })
  );

  globalRef.__stRollEventCommandRegisteredEvent = true;
}
