import { buildEventRollHelpTemplateEvent, buildPreBlockTemplateEvent } from "../templates/helpTemplates";
import type {
  ActiveStatusEvent,
  DiceEventSpecEvent,
  DiceMetaEvent,
  DicePluginSettingsEvent,
  PendingRoundEvent,
} from "../types/eventDomainEvent";
import { ensureActiveStatusesEvent, resolveStatusModifiersForSkillEvent } from "../events/statusEvent";

type RuntimeViewStateEvent = {
  text: string;
};

export interface EventRollCommandDepsEvent {
  SlashCommandParser: any;
  SlashCommand: any;
  SlashCommandArgument: any;
  ARGUMENT_TYPE: any;
  pushToChat: (message: string) => string | void;
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
  ) => string;
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

function formatStatusItemForListEvent(status: ActiveStatusEvent): string {
  const skillsText = status.scope === "all" ? "-" : status.skills.join("|");
  const scopeLabel = status.scope === "all" ? "全局" : "按技能";
  const enabledLabel = status.enabled ? "启用" : "停用";
  return `- ${status.name} | ${formatSignedEvent(status.modifier)} | 范围=${scopeLabel} | 技能=${skillsText} | ${enabledLabel}`;
}

function formatStatusPreviewForEventLineEvent(
  settings: DicePluginSettingsEvent,
  activeStatuses: ActiveStatusEvent[],
  skillName: string
): string {
  if (!settings.enableStatusSystem) return "状态=关闭";
  const resolved = resolveStatusModifiersForSkillEvent(activeStatuses, skillName);
  if (resolved.modifier === 0) return "状态=+0";
  const detail =
    resolved.matched.length > 0
      ? `（${resolved.matched
          .map((item) => `${item.name}${formatSignedEvent(item.modifier)}`)
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
    lines.push(
      `- ${event.id}: ${event.title} | 对象=${event.targetLabel} | 骰式=${event.checkDice} | 条件=${
        event.compare ?? ">="
      } ${event.dc}${dcReasonPreview} | 技能=${event.skill} | 技能修正=${formatSignedEvent(
        skillMod
      )} | 模式=${formatRollModeTextEvent(event.rollMode)} | 骰态=${formatAdvantageStateTextEvent(
        event.advantageState
      )} | 时限=${
        event.timeLimit ?? "无"
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
    pushToChat,
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
          const fallback = pushToChat(buildEventRollHelpMessageEvent());
          return fallback ?? "";
        }

        if (action === "list") {
          sweepTimeoutFailuresEvent();
          const meta = getDiceMetaEvent();
          const round = meta.pendingRound;
          if (!round || round.status !== "open") {
            const fallback = pushToChat("当前没有可用事件，请先等待 AI 输出事件 JSON。");
            return fallback ?? "";
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
          const fallback = pushToChat(msg);
          return fallback ?? "";
        }

        if (action === "roll") {
          const eventId = parts[1] || "";
          const overrideExpr = parts.length > 2 ? parts.slice(2).join(" ") : undefined;
          const feedback = performEventRollByIdEvent(eventId, overrideExpr);
          if (feedback) {
            const fallback = pushToChat(feedback);
            return fallback ?? "";
          }
          return "";
        }

        const fallback = pushToChat("未知子命令，请使用 /eventroll help 查看帮助。");
        return fallback ?? "";
      },
    })
  );

  globalRef.__stRollEventCommandRegisteredEvent = true;
}
