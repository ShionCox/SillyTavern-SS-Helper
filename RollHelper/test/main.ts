import { normalizeEnvelopeEvent, repairAndParseEventJsonEvent } from "../src/events/parserEvent";
import type { EventRollRecordEvent, PendingRoundEvent } from "../src/types/eventDomainEvent";
import { DEFAULT_SETTINGS_Event } from "../src/settings/constantsEvent";
import { buildEventListCardEvent as buildListCardCore, buildEventRollResultCardEvent as buildResultCardCore, buildEventAlreadyRolledCardEvent as buildAlreadyRolledCore, getEventRuntimeViewStateEvent } from "../src/events/renderEvent";
import { escapeAttrEvent, escapeHtmlEvent, formatEventModifierBreakdownEvent, formatModifier } from "../src/core/utilsEvent";
import { buildAlreadyRolledDiceVisualTemplateEvent, buildDiceSvgTemplateEvent, buildRollingSvgTemplateEvent } from "../src/templates/diceResultTemplates";
import { buildEventAlreadyRolledCardTemplateEvent, buildEventDistributionBlockTemplateEvent, buildEventListCardTemplateEvent, buildEventListItemTemplateEvent, buildEventRolledBlockTemplateEvent, buildEventRolledPrefixTemplateEvent, buildEventRollButtonTemplateEvent, buildEventRollResultCardTemplateEvent, buildEventTimeoutAtBlockTemplateEvent, buildRollsSummaryTemplateEvent, ensureEventCardStylesEvent } from "../src/templates/eventCardTemplates";
import { resolveTriggeredOutcomeEvent } from "../src/events/roundEvent";
import { ensureSharedTooltip } from "../../SDK/sharedTooltip";

const input = document.getElementById("json-input") as HTMLTextAreaElement;
const btn = document.getElementById("render-btn") as HTMLButtonElement;
const preview = document.getElementById("preview-cards") as HTMLDivElement;

ensureEventCardStylesEvent(document);

const TEST_SETTINGS = {
  ...DEFAULT_SETTINGS_Event,
  eventApplyScope: "all" as const,
};

const DUMMY_DEPS = {
  getSettingsEvent: () => TEST_SETTINGS,
  OUTCOME_TEXT_MAX_LEN_Event: 400,
  ISO_8601_DURATION_REGEX_Event: /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+S)?)?$/i,
};

const MOCK_ACTIVE_STATUSES = [
  { name: "中毒", modifier: -2, remainingRounds: 3, scope: "all", skills: [], enabled: true, createdAt: Date.now(), updatedAt: Date.now(), source: "ai_tag" },
  { name: "鼓舞", modifier: +1, remainingRounds: null, scope: "skills", skills: ["力量", "体质"], enabled: true, createdAt: Date.now(), updatedAt: Date.now(), source: "ai_tag" },
];

function renderAll() {
  const text = input.value;
  const parsed = repairAndParseEventJsonEvent(text);
  if (!parsed) {
    preview.innerHTML = "<div style='color:#ff4d4f'>JSON 格式无法解析，请检查语法。</div>";
    return;
  }

  const env = normalizeEnvelopeEvent(parsed, DUMMY_DEPS);
  if (!env) {
    preview.innerHTML = "<div style='color:#ff4d4f'>未能提取出合法 RollHelper 事件包裹，检查属性。</div>";
    return;
  }

  const round: PendingRoundEvent = {
    roundId: "test_round_" + Date.now().toString().slice(-4),
    events: env.events,
    status: "open",
    eventTimers: {},
    rolls: [],
    sourceAssistantMsgIds: [],
    openedAt: Date.now(),
  };

  try {
    const depsObj = {
      getSettingsEvent: () => TEST_SETTINGS,
      getDiceMetaEvent: () => ({ activeStatuses: MOCK_ACTIVE_STATUSES }),
      ensureRoundEventTimersSyncedEvent: () => {},
      getLatestRollRecordForEvent: (eventId: string) => undefined,
      getEventRuntimeViewStateEvent: () => ({ canRoll: true, disableReason: "", text: "等待中", tone: "idle", locked: false }),
      getRuntimeToneStyleEvent: () => ({ border: "1px solid rgba(209,182,127,0.3)", background: "rgba(30,30,30,0.6)", color: "#d1b67f" }),
      buildEventRolledPrefixTemplateEvent,
      buildEventRolledBlockTemplateEvent,
      formatRollRecordSummaryEvent: () => "",
      parseDiceExpression: (e: any) => ({ sides: 20, count: 1, modifier: 0, keepHighest: 0, keepLowest: 0, exploding: false }),
      resolveSkillModifierBySkillNameEvent: () => 0,
      formatEventModifierBreakdownEvent,
      formatModifier,
      buildEventRollButtonTemplateEvent,
      buildEventListItemTemplateEvent,
      buildEventListCardTemplateEvent,
      escapeHtmlEvent,
      escapeAttrEvent,
      resolveTriggeredOutcomeEvent,
      buildRollsSummaryTemplateEvent,
      buildEventRollResultCardTemplateEvent,
      getDiceSvg: buildDiceSvgTemplateEvent,
      getRollingSvg: buildRollingSvgTemplateEvent,
      buildAlreadyRolledDiceVisualTemplateEvent,
      buildEventDistributionBlockTemplateEvent,
      buildEventTimeoutAtBlockTemplateEvent,
      buildEventAlreadyRolledCardTemplateEvent,
    };

    const listHtml = buildListCardCore(round, depsObj as any);
    
    let blocks = `<div class="preview-section"><h3>未检定悬赏卡事件列表 (EventListCard)</h3>${listHtml}</div>`;
    
    // Simulate completed rolls for the test objects:
    env.events.forEach((ev, index) => {
        // Mock a success roll roughly around DC. If check dice provides count and side, we can just hardcode a score
        const score = ev.dc ? Math.max(1, Math.min(20, ev.dc + (index % 2 === 0 ? 2 : -2))) : 12;
        const isSuccess = ev.dc == null || score >= ev.dc;

        const record: EventRollRecordEvent = {
            rollId: "test_roll_" + index,
            roundId: round.roundId,
            eventId: ev.id,
            eventTitle: ev.title,
            targetLabelUsed: ev.targetLabel,
            compareUsed: ev.compare ?? ">=",
            dcUsed: ev.dc ?? null,
            source: ev.rollMode === "auto" ? "ai_auto_roll" : "manual_roll",
            rolledAt: Date.now(),
            diceExpr: ev.checkDice,
            baseModifierUsed: 0,
            skillModifierApplied: 0,
            statusModifierApplied: 0,
            advantageStateApplied: ev.advantageState ?? "normal",
            finalModifierUsed: 0,
            statusModifiersApplied: [],
            result: {
              expr: ev.checkDice,
              rolls: [score],
              modifier: 0,
              rawTotal: score,
              total: score,
              sides: 20,
              count: 1,
              exploding: false,
              explosionTriggered: false
            },
            success: isSuccess,
        };

        const resultHtml = buildResultCardCore(ev, record, depsObj as any);
        const alreadyHtml = buildAlreadyRolledCore(ev, record, depsObj as any);

        blocks += `<div class="preview-section"><h3>实时结算结果大发重横幅 (ResultCard)</h3>${resultHtml}</div>`;
        blocks += `<div class="preview-section"><h3>折叠的历史/已投掷记录 (AlreadyRolledCard)</h3>${alreadyHtml}</div>`;
    });

    preview.innerHTML = blocks;
  } catch (err: any) {
    console.error(err);
    preview.innerHTML = `<div style='color:#ff4d4f; white-space: pre-wrap;'>渲染过程中发生崩溃：\n${err?.stack || err?.message}</div>`;
  }
}

btn.addEventListener("click", renderAll);

// 初次访问渲染一下
renderAll();

// 初始化 Tooltip 组件
ensureSharedTooltip();
