import baseCssText from "./html/roll-cards/_base.css?inline";
import eventListCardCssText from "./html/roll-cards/event-list-card.css?inline";
import eventListItemCssText from "./html/roll-cards/event-list-item.css?inline";
import settlementSharedCssText from "./html/roll-cards/_settlement-shared.css?inline";
import eventRollResultCardCssText from "./html/roll-cards/event-roll-result-card.css?inline";
import eventAlreadyRolledCardCssText from "./html/roll-cards/event-already-rolled-card.css?inline";
import eventAlreadyRolledCardTemplateHtml from "./html/roll-cards/event-already-rolled-card.html?raw";
import eventRollResultCardTemplateHtml from "./html/roll-cards/event-roll-result-card.html?raw";
import eventListCardTemplateHtml from "./html/roll-cards/event-list-card.html?raw";
import eventListItemTemplateHtml from "./html/roll-cards/event-list-item.html?raw";

const EVENT_CARD_STYLE_ID_Event = "st-rh-event-card-styles-v1";
const EVENT_CARD_EXTERNAL_STYLE_LINK_ID_PREFIX_Event = "st-rh-event-card-external-style-v1";
const EVENT_CARD_CUSTOM_CLASS_PREFIX_Event = "custom-";
const EVENT_CARD_CUSTOM_CLASS_SELECTOR_PATTERN_Event = /\.(?=[A-Za-z_\\])((?:\\.|[A-Za-z0-9_%@/\-[\]:])+)/g;
const EVENT_CARD_EXTERNAL_STYLE_URLS_Event = [
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/all.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/sharp-solid.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/sharp-regular.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/sharp-light.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/duotone.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/sharp-duotone-solid.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/chisel-regular.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/etch-solid.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/graphite-thin.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/jelly-regular.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/notdog-solid.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/slab-regular.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/thumbprint-light.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/utility-semibold.css",
  "https://site-assets.fontawesome.com/releases/v7.2.0/css/whiteboard-semibold.css",
];

const fontFaceCssText = `@font-face {
  font-family: "STRHSourceSong";
  src: url("${new URL(/* @vite-ignore */ "./assets/font/思源宋体.otf", import.meta.url).href}") format("opentype");
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
}`;

const fallbackFontUrlEvent = new URL(["..", "..", "..", "assets", "font", "\u601d\u6e90\u5b8b\u4f53.otf"].join("/"), import.meta.url).href;

const processedBaseCssText = `${fontFaceCssText.replace(
  'format("opentype");',
  `format("opentype"), url("${fallbackFontUrlEvent}") format("opentype");`,
)}\n${baseCssText}`;

function buildCustomPrefixedEventCardCssTextEvent(cssText: string): string {
  return cssText.replace(EVENT_CARD_CUSTOM_CLASS_SELECTOR_PATTERN_Event, (match, className: string) => {
    if (className.startsWith(EVENT_CARD_CUSTOM_CLASS_PREFIX_Event)) {
      return match;
    }
    return `.${EVENT_CARD_CUSTOM_CLASS_PREFIX_Event}${className}`;
  });
}

const eventCardStylesCssText = [
  processedBaseCssText,
  eventListCardCssText,
  eventListItemCssText,
  settlementSharedCssText,
  eventRollResultCardCssText,
  eventAlreadyRolledCardCssText,
].join("\n");

const eventCardRuntimeCssText = `${eventCardStylesCssText}\n${buildCustomPrefixedEventCardCssTextEvent(eventCardStylesCssText)}`;

export function buildEventCardStylesCssTextEvent(): string {
  return eventCardRuntimeCssText;
}

export function ensureEventCardExternalStylesEvent(doc: Document = document): void {
  if (!doc?.head) return;

  EVENT_CARD_EXTERNAL_STYLE_URLS_Event.forEach((href, index) => {
    const id = `${EVENT_CARD_EXTERNAL_STYLE_LINK_ID_PREFIX_Event}-${index}`;
    const existing = doc.getElementById(id) as HTMLLinkElement | null;
    if (existing) {
      if (existing.href !== href) {
        existing.href = href;
      }
      return;
    }

    const link = doc.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    doc.head.appendChild(link);
  });
}

export function ensureEventCardStylesEvent(doc: Document = document): void {
  if (!doc?.head) return;

  ensureEventCardExternalStylesEvent(doc);

  const cssText = buildEventCardStylesCssTextEvent();
  const existing = doc.getElementById(EVENT_CARD_STYLE_ID_Event) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== cssText) {
      existing.textContent = cssText;
    }
    return;
  }

  const style = doc.createElement("style");
  style.id = EVENT_CARD_STYLE_ID_Event;
  style.textContent = cssText;
  doc.head.appendChild(style);
}

export interface EventListItemTemplateParamsEvent {
  detailsIdAttr: string;
  titleHtml: string;
  eventIdHtml: string;
  collapsedCheckHtml: string;
  collapsedRuntimeHtml: string;
  descHtml: string;
  targetHtml: string;
  skillHtml: string;
  skillTitleAttr: string;
  advantageStateHtml: string;
  modifierTextHtml: string;
  checkDiceHtml: string;
  compareHtml: string;
  dcText: string;
  dcReasonHtml: string;
  timeLimitHtml: string;
  rollModeBadgeHtml: string;
  roundIdAttr: string;
  eventIdAttr: string;
  deadlineAttr: string;
  runtimeStyleAttr: string;
  runtimeTextHtml: string;
  rolledBlockHtml: string;
  outcomePreviewHtml: string;
  commandTextHtml: string;
  rollButtonHtml: string;
}

export function buildEventRolledBlockTemplateEvent(rolledPrefixHtml: string, summaryHtml: string): string {
  return `<div class="st-rh-rolled-block">
  ${rolledPrefixHtml} 已结算：${summaryHtml}
</div>`;
}

export function buildEventRolledPrefixTemplateEvent(isTimeoutAutoFail: boolean): string {
  return isTimeoutAutoFail
    ? "<span style='color:#ff4d4f;font-weight:bold;'>[超时]</span>"
    : "<span style='color:#52c41a;font-weight:bold;'>[已掷]</span>";
}

export interface EventRollButtonTemplateParamsEvent {
  roundIdAttr: string;
  eventIdAttr: string;
  diceExprAttr: string;
  buttonDisabledAttr: string;
  buttonStateStyle: string;
}

function buildTipLabelTemplateEvent(label: string, tip: string): string {
  return `<span class="st-rh-tip-label" data-tip="${tip}">${label}</span>`;
}

function buildSummaryToggleStateTemplateEvent(): string {
  return `<span class="st-rh-summary-toggle-state" aria-hidden="true">
            <span class="st-rh-summary-toggle-icon">▾</span>
            <span class="st-rh-toggle-closed">展开详情</span>
            <span class="st-rh-toggle-open">收起详情</span>
          </span>`;
}

export function buildEventRollButtonTemplateEvent(params: EventRollButtonTemplateParamsEvent): string {
  const stateStyleAttr = params.buttonStateStyle ? ` style="${params.buttonStateStyle}"` : "";
  return `<button type="button" class="st-rh-roll-btn" data-dice-event-roll="1" data-round-id="${params.roundIdAttr}"
  data-dice-event-id="${params.eventIdAttr}" data-dice-expr="${params.diceExprAttr}" ${params.buttonDisabledAttr}${stateStyleAttr}>
  执行检定
</button>`;
}

export function buildEventListItemTemplateEvent(params: EventListItemTemplateParamsEvent): string {
  const footerClass = "st-rh-event-footer is-centered";
  const modifierBadgeHtml = params.modifierTextHtml
    ? `<span class="st-rh-chip">${buildTipLabelTemplateEvent("修正：", "总修正 = 基础修正 + 技能修正 + 状态修正。")} <span class="st-rh-chip-highlight">${params.modifierTextHtml}</span></span>`
    : "";
  const rollActionHtml = params.rollButtonHtml
    ? params.rollButtonHtml
    : `<span class="st-rh-summary-lock st-rh-mono">已锁定</span>`;
  const dcReasonHtml = params.dcReasonHtml ? `<div class="st-rh-dc-reason">${params.dcReasonHtml}</div>` : "";
  return renderHtmlTemplateEvent(eventListItemTemplateHtml, {
    title_html: params.titleHtml,
    roll_mode_badge_html: params.rollModeBadgeHtml,
    event_id_html: params.eventIdHtml,
    collapsed_check_html: params.collapsedCheckHtml,
    time_limit_html: params.timeLimitHtml,
    round_id_attr: params.roundIdAttr,
    event_id_attr: params.eventIdAttr,
    deadline_attr: params.deadlineAttr,
    runtime_style_attr: params.runtimeStyleAttr,
    collapsed_runtime_html: params.runtimeTextHtml || params.collapsedRuntimeHtml,
    roll_action_html: rollActionHtml,
    summary_toggle_state_html: buildSummaryToggleStateTemplateEvent(),
    details_id_attr: params.detailsIdAttr,
    desc_html: params.descHtml,
    outcome_preview_html: params.outcomePreviewHtml,
    tip_label_target_html: buildTipLabelTemplateEvent("对象", "本次事件影响的叙事对象。"),
    target_html: params.targetHtml,
    tip_label_skill_html: buildTipLabelTemplateEvent("技能", "参与检定并提供修正的技能项。"),
    skill_title_attr: params.skillTitleAttr,
    skill_html: params.skillHtml,
    tip_label_advantage_html: buildTipLabelTemplateEvent("掷骰模式", "普通、优势、劣势会影响最终检定结果。"),
    advantage_state_html: params.advantageStateHtml,
    tip_label_dice_html: buildTipLabelTemplateEvent("骰式", "本次检定使用的骰子表达式。"),
    check_dice_html: params.checkDiceHtml,
    tip_label_condition_html: buildTipLabelTemplateEvent("条件", "将掷骰总值与 DC 按比较符进行判定。"),
    compare_html: params.compareHtml,
    dc_text: params.dcText,
    tip_label_time_html: buildTipLabelTemplateEvent("时限", "超时未检定时，系统会按对应规则自动处理。"),
    modifier_badge_html: modifierBadgeHtml,
    dc_reason_html: dcReasonHtml,
    rolled_block_html: params.rolledBlockHtml,
    command_text_html: params.commandTextHtml,
  });
}

export function buildEventListCardTemplateEvent(roundIdHtml: string, itemsHtml: string): string {
  return renderHtmlTemplateEvent(eventListCardTemplateHtml, {
    round_id_html: roundIdHtml,
    items_html: itemsHtml,
  });
}

export interface EventRollResultCardTemplateParamsEvent {
  detailsIdAttr: string;
  collapsedStatusHtml: string;
  collapsedConditionHtml: string;
  collapsedSourceHtml: string;
  collapsedTotalHtml: string;
  collapsedOutcomeHtml: string;
  collapsedOutcomeTitleAttr: string;
  collapsedOutcomeChipClassName: string;
  collapsedStatusSummaryHtml: string;
  collapsedStatusSummaryTitleAttr: string;
  collapsedStatusSummaryChipClassName: string;
  collapsedDiceVisualHtml: string;
  rollIdHtml: string;
  titleHtml: string;
  eventIdHtml: string;
  sourceHtml: string;
  targetHtml: string;
  skillHtml: string;
  skillTitleAttr: string;
  advantageStateHtml: string;
  diceExprHtml: string;
  diceModifierHintHtml: string;
  rollsSummaryHtml: string;
  explodeInfoHtml: string;
  modifierBreakdownHtml: string;
  compareHtml: string;
  dcText: string;
  dcReasonHtml: string;
  statusText: string;
  statusColor: string;
  totalText: string;
  timeLimitHtml: string;
  diceVisualBlockHtml: string;
  outcomeLabelHtml: string;
  outcomeTextHtml: string;
  statusImpactHtml: string;
  outcomeStatusSummaryHtml: string;
  currentStatusesHtml: string;
}

export interface EventAlreadyRolledCardTemplateParamsEvent {
  detailsIdAttr: string;
  collapsedStatusHtml: string;
  collapsedConditionHtml: string;
  collapsedSourceHtml: string;
  collapsedTotalHtml: string;
  collapsedOutcomeHtml: string;
  collapsedOutcomeTitleAttr: string;
  collapsedOutcomeChipClassName: string;
  collapsedStatusSummaryHtml: string;
  collapsedStatusSummaryTitleAttr: string;
  collapsedStatusSummaryChipClassName: string;
  collapsedDiceVisualHtml: string;
  titleTextHtml: string;
  rollIdHtml: string;
  eventTitleHtml: string;
  eventIdHtml: string;
  sourceTextHtml: string;
  targetHtml: string;
  skillHtml: string;
  skillTitleAttr: string;
  advantageStateHtml: string;
  diceExprHtml: string;
  diceModifierHintHtml: string;
  rollsSummaryHtml: string;
  explodeInfoHtml: string;
  modifierBreakdownHtml: string;
  compareHtml: string;
  dcText: string;
  dcReasonHtml: string;
  statusText: string;
  statusColor: string;
  diceVisualBlockHtml: string;
  distributionBlockHtml: string;
  timeoutBlockHtml: string;
  outcomeLabelHtml: string;
  outcomeTextHtml: string;
  statusImpactHtml: string;
  outcomeStatusSummaryHtml: string;
  currentStatusesHtml: string;
}

function joinClassNamesTemplateEvent(...parts: Array<string | undefined | null | false>): string {
  return parts.filter(Boolean).join(" ");
}

function renderHtmlTemplateEvent(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => tokens[key] ?? "");
}

function buildSettlementStatusBadgeTemplateEvent(
  textHtml: string,
  color: string,
  extraClasses?: string
): string {
  if (!String(textHtml ?? "").trim()) return "";
  return `<span class="${joinClassNamesTemplateEvent(
    "st-rh-status-pill st-rh-inline-chip st-rh-status-badge",
    extraClasses
  )}" style="--st-rh-status-color:${color};">${textHtml}</span>`;
}

function buildSettlementChipTemplateEvent(
  innerHtml: string,
  options?: {
    classes?: string;
    strong?: boolean;
    tipAttr?: string;
  }
): string {
  if (!String(innerHtml ?? "").trim()) return "";
  const tipAttr = options?.tipAttr ? ` data-tip="${options.tipAttr}"` : "";
  return `<span class="${joinClassNamesTemplateEvent(
    options?.strong
      ? "st-rh-chip-strong st-rh-inline-chip st-rh-inline-chip-gap"
      : "st-rh-chip-soft st-rh-inline-chip st-rh-inline-chip-gap",
    options?.classes
  )}"${tipAttr}>${innerHtml}</span>`;
}

function buildSettlementPreviewChipTemplateEvent(
  textHtml: string,
  titleAttr: string,
  chipClassName: string,
  extraClasses?: string
): string {
  if (!String(textHtml ?? "").trim()) return "";
  const allClasses = joinClassNamesTemplateEvent(
    "st-rh-chip-soft st-rh-inline-chip st-rh-inline-chip-gap st-rh-inline-chip-fluid",
    chipClassName,
    extraClasses
  );
  const hasMarquee = String(chipClassName ?? "").includes("is-marquee");
  if (!hasMarquee) {
    return `<span class="${allClasses}" data-tip="${titleAttr}">${textHtml}</span>`;
  }
  return `<span class="${allClasses}" data-tip="${titleAttr}">
    <span class="st-rh-marquee-clip">
      <span class="st-rh-marquee-track">
        <span class="st-rh-marquee-text">${textHtml}</span>
        <span class="st-rh-marquee-gap" aria-hidden="true">•</span>
        <span class="st-rh-marquee-text" aria-hidden="true">${textHtml}</span>
      </span>
    </span>
  </span>`;
}

function buildSettlementFactTemplateEvent(
  labelHtml: string,
  valueHtml: string,
  options?: {
    valueClasses?: string;
  }
): string {
  if (!String(valueHtml ?? "").trim()) return "";
  return `<div class="st-rh-fact-card st-rh-surface-card">
    <dt class="st-rh-fact-label">${labelHtml}</dt>
    <dd class="${joinClassNamesTemplateEvent("st-rh-fact-value", options?.valueClasses)}">${valueHtml}</dd>
  </div>`;
}

function buildSettlementInfoPanelTemplateEvent(
  kickerText: string,
  bodyHtml: string,
  extraClasses?: string
): string {
  if (!String(bodyHtml ?? "").trim()) return "";
  return `<div class="${joinClassNamesTemplateEvent(
    "st-rh-panel st-rh-info-panel",
    extraClasses
  )}">
    <p class="st-rh-kicker">${kickerText}</p>
    <div class="st-rh-detail-note st-rh-panel-copy">${bodyHtml}</div>
  </div>`;
}

function buildSettlementSummaryVisualTemplateEvent(contentHtml: string, fallbackText: string): string {
  if (String(contentHtml ?? "").trim()) return contentHtml;
  return `<span class="st-rh-summary-visual-fallback">${fallbackText}</span>`;
}

function buildSettlementResultCoreTemplateEvent(params: {
  kickerText: string;
  totalText: string;
  statusText: string;
  statusColor: string;
  compareHtml: string;
  dcText: string;
  diceVisualBlockHtml: string;
  timeLimitHtml: string;
  emptyVisualHint: string;
}): string {
  const visualHtml = String(params.diceVisualBlockHtml ?? "").trim()
    ? params.diceVisualBlockHtml
    : `<div class="st-rh-empty-visual">${params.emptyVisualHint}</div>`;
  return `<div class="st-rh-panel st-rh-result-core">
    <div class="st-rh-result-core-head">
      <div class="st-rh-result-core-copy">
        <p class="st-rh-kicker st-rh-kicker-compact">${params.kickerText}</p>
        <div class="st-rh-score-row">
          <span class="st-rh-title-font st-rh-result-total">${params.totalText}</span>
          <span class="st-rh-result-total-label">总点</span>
        </div>
      </div>
      ${buildSettlementStatusBadgeTemplateEvent(params.statusText, params.statusColor)}
    </div>
    <div class="st-rh-result-visual">
      ${visualHtml}
    </div>
    <div class="st-rh-result-meta-grid">
      ${buildSettlementFactTemplateEvent(
    buildTipLabelTemplateEvent("条件", "将总值与 DC 按比较符进行结算判定。"),
    `<span class="st-rh-mono st-rh-fact-value-mono">${params.compareHtml} ${params.dcText}</span>`,
    { valueClasses: "st-rh-fact-value-mono" }
  )}
      ${buildSettlementFactTemplateEvent(
    buildTipLabelTemplateEvent("时限", "事件超时后，系统会按对应规则自动处理。"),
    params.timeLimitHtml
  )}
    </div>
  </div>`;
}

export function buildRollsSummaryTemplateEvent(rollsHtml: string, modifierHtml: string): string {
  return `<span class="st-rh-mono st-rh-title-text">[${rollsHtml}]</span>
    <span class="st-rh-inline-divider">•</span>
    <span class="st-rh-meta-text">修正：</span>
    <span class="st-rh-mono st-rh-emphasis-text">${modifierHtml}</span>`;
}

export function buildEventRollResultCardTemplateEvent(params: EventRollResultCardTemplateParamsEvent): string {
  const summaryStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(params.collapsedStatusHtml, params.statusColor);
  const detailsStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(params.statusText, params.statusColor);
  const summaryPrimaryChipsHtml = [
    buildSettlementChipTemplateEvent(
      `总点 <span class="st-rh-mono st-rh-title-text">${params.collapsedTotalHtml}</span>`,
      { strong: true }
    ),
    buildSettlementChipTemplateEvent(`<span class="st-rh-mono">${params.collapsedConditionHtml}</span>`),
  ]
    .filter(Boolean)
    .join("");
  const summarySecondaryChipsHtml = [
    buildSettlementChipTemplateEvent(params.collapsedSourceHtml),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedOutcomeHtml,
      params.collapsedOutcomeTitleAttr,
      params.collapsedOutcomeChipClassName
    ),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedStatusSummaryHtml,
      params.collapsedStatusSummaryTitleAttr,
      params.collapsedStatusSummaryChipClassName
    ),
  ]
    .filter(Boolean)
    .join("");
  const detailMetaHtml = [
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("事件 ID", "事件唯一标识。"),
      `<span class="st-rh-mono st-rh-title-text">${params.eventIdHtml}</span>`,
      { valueClasses: "st-rh-fact-value-mono" }
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("来源", "该次结算由谁触发：AI 自动、玩家手动或超时系统结算。"),
      params.sourceHtml
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("对象", "本次事件影响的叙事对象。"),
      params.targetHtml,
      { valueClasses: "st-rh-fact-value-accent" }
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("技能", "参与检定并提供修正的技能项。"),
      `<span data-tip="${params.skillTitleAttr}">${params.skillHtml}</span>`
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("掷骰模式", "普通、优势、劣势会影响最终检定结果。"),
      params.advantageStateHtml
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("骰式", "本次检定使用的骰子表达式。"),
      `${params.diceExprHtml}${params.diceModifierHintHtml
        ? `<div class="st-rh-subhint st-rh-emphasis-text">${params.diceModifierHintHtml}</div>`
        : ""
      }`,
      { valueClasses: "st-rh-fact-value-mono st-rh-title-text" }
    ),
  ]
    .filter(Boolean)
    .join("");
  const outcomeSectionHtml = buildSettlementInfoPanelTemplateEvent(
    params.outcomeLabelHtml,
    `<div class="st-rh-body-copy">${params.outcomeTextHtml}</div>
     ${params.outcomeStatusSummaryHtml
      ? `<div class="st-rh-meta-copy st-rh-meta-copy-spaced"><strong>状态变化：</strong>${params.outcomeStatusSummaryHtml}</div>`
      : ""
    }
     ${params.currentStatusesHtml
      ? `<div class="st-rh-meta-copy"><strong>当前状态：</strong>${params.currentStatusesHtml}</div>`
      : ""
    }
     ${params.statusImpactHtml
      ? `<div class="st-rh-impact-note">${params.statusImpactHtml}</div>`
      : ""
    }`
  );
  const resultCoreHtml = buildSettlementResultCoreTemplateEvent({
    kickerText: "结算结果",
    totalText: params.totalText,
    statusText: params.statusText,
    statusColor: params.statusColor,
    compareHtml: params.compareHtml,
    dcText: params.dcText,
    diceVisualBlockHtml: params.diceVisualBlockHtml,
    timeLimitHtml: params.timeLimitHtml,
    emptyVisualHint: "本次结算未生成骰面可视化。",
  });
  const detailAuxHtml = [
    buildSettlementInfoPanelTemplateEvent(
      "判定拆解",
      `<div class="st-rh-stack-md">
         <div>
           <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("掷骰结果", "原始骰面与最终修正后的结果。")}</div>
           <div class="st-rh-value-copy st-rh-title-text">${params.rollsSummaryHtml}</div>
         </div>
         <div>
           <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("爆骰", "是否请求爆骰，以及是否真实触发连爆或被策略降级。")}</div>
           <div class="st-rh-value-copy">${params.explodeInfoHtml}</div>
         </div>
         ${params.modifierBreakdownHtml
        ? `<div>
                  <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")}</div>
                  <div class="st-rh-value-copy st-rh-emphasis-text">${params.modifierBreakdownHtml}</div>
                </div>`
        : ""
      }
         ${params.dcReasonHtml
        ? `<div class="st-rh-note-box"><strong>DC 说明：</strong>${params.dcReasonHtml}</div>`
        : ""
      }
       </div>`
    ),
  ]
    .filter(Boolean)
    .join("");

  return renderHtmlTemplateEvent(eventRollResultCardTemplateHtml, {
    summary_kicker_text: "检定结果",
    title_html: params.titleHtml,
    roll_id_html: params.rollIdHtml,
    summary_status_badge_html: summaryStatusBadgeHtml,
    summary_primary_chips_html: summaryPrimaryChipsHtml,
    summary_secondary_chips_html: summarySecondaryChipsHtml,
    summary_dice_visual_html: buildSettlementSummaryVisualTemplateEvent(params.collapsedDiceVisualHtml, "ROLL"),
    summary_footer_note_html: "手机端默认保留关键结果，展开后查看判定链路与剧情后果。",
    summary_toggle_html: buildSummaryToggleStateTemplateEvent(),
    details_id_attr: params.detailsIdAttr,
    details_kicker_text: "结果档案",
    details_heading_html: params.titleHtml,
    details_status_badge_html: detailsStatusBadgeHtml,
    detail_meta_html: detailMetaHtml,
    outcome_section_html: outcomeSectionHtml,
    footer_blocks_html: "",
    result_core_html: resultCoreHtml,
    detail_aux_html: detailAuxHtml,
  });
}

export function buildEventAlreadyRolledCardTemplateEvent(
  params: EventAlreadyRolledCardTemplateParamsEvent
): string {
  const summaryStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(params.collapsedStatusHtml, params.statusColor);
  const detailsStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(params.statusText, params.statusColor);
  const summaryPrimaryChipsHtml = [
    buildSettlementChipTemplateEvent(
      `总点 <span class="st-rh-mono st-rh-title-text">${params.collapsedTotalHtml}</span>`,
      { strong: true }
    ),
    buildSettlementChipTemplateEvent(`<span class="st-rh-mono">${params.collapsedConditionHtml}</span>`),
  ]
    .filter(Boolean)
    .join("");
  const summarySecondaryChipsHtml = [
    buildSettlementChipTemplateEvent(params.collapsedSourceHtml),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedOutcomeHtml,
      params.collapsedOutcomeTitleAttr,
      params.collapsedOutcomeChipClassName
    ),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedStatusSummaryHtml,
      params.collapsedStatusSummaryTitleAttr,
      params.collapsedStatusSummaryChipClassName
    ),
  ]
    .filter(Boolean)
    .join("");
  const detailMetaHtml = [
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("事件", "本次结算对应的事件标题与 ID。"),
      `<strong>${params.eventTitleHtml}</strong><div class="st-rh-fact-subline st-rh-mono">${params.eventIdHtml}</div>`
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("来源", "该次结算由谁触发：AI 自动、玩家手动或超时系统结算。"),
      params.sourceTextHtml
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("对象", "本次事件影响的叙事对象。"),
      params.targetHtml,
      { valueClasses: "st-rh-fact-value-accent" }
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("技能", "参与检定并提供修正的技能项。"),
      `<span data-tip="${params.skillTitleAttr}">${params.skillHtml}</span>`
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("掷骰模式", "普通、优势、劣势会影响最终检定结果。"),
      params.advantageStateHtml
    ),
    buildSettlementFactTemplateEvent(
      buildTipLabelTemplateEvent("骰式", "本次检定使用的骰子表达式。"),
      `${params.diceExprHtml}${params.diceModifierHintHtml
        ? `<div class="st-rh-subhint st-rh-emphasis-text">${params.diceModifierHintHtml}</div>`
        : ""
      }`,
      { valueClasses: "st-rh-fact-value-mono st-rh-title-text" }
    ),
  ]
    .filter(Boolean)
    .join("");
  const outcomeSectionHtml = buildSettlementInfoPanelTemplateEvent(
    params.outcomeLabelHtml,
    `<div class="st-rh-body-copy">${params.outcomeTextHtml}</div>
     ${params.outcomeStatusSummaryHtml
      ? `<div class="st-rh-meta-copy st-rh-meta-copy-spaced"><strong>状态变化：</strong>${params.outcomeStatusSummaryHtml}</div>`
      : ""
    }
     ${params.currentStatusesHtml
      ? `<div class="st-rh-meta-copy"><strong>当前状态：</strong>${params.currentStatusesHtml}</div>`
      : ""
    }
     ${params.statusImpactHtml
      ? `<div class="st-rh-impact-note">${params.statusImpactHtml}</div>`
      : ""
    }`
  );
  const resultCoreHtml = buildSettlementResultCoreTemplateEvent({
    kickerText: "结算回顾",
    totalText: params.collapsedTotalHtml,
    statusText: params.statusText,
    statusColor: params.statusColor,
    compareHtml: params.compareHtml,
    dcText: params.dcText,
    diceVisualBlockHtml: params.diceVisualBlockHtml,
    timeLimitHtml: params.timeoutBlockHtml ? "已触发自动结算" : "无超时记录",
    emptyVisualHint: "系统按结算记录归档，本次没有可播放的骰面动画。",
  });
  const detailAuxHtml = [
    buildSettlementInfoPanelTemplateEvent(
      "判定拆解",
      `<div class="st-rh-stack-md">
         <div>
           <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("掷骰结果", "原始骰面与最终修正后的结果。")}</div>
           <div class="st-rh-value-copy st-rh-title-text">${params.rollsSummaryHtml}</div>
         </div>
         <div>
           <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("爆骰", "是否请求爆骰，以及是否真实触发连爆或被策略降级。")}</div>
           <div class="st-rh-value-copy">${params.explodeInfoHtml}</div>
         </div>
         ${params.modifierBreakdownHtml
        ? `<div>
                  <div class="st-rh-mini-kicker">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")}</div>
                  <div class="st-rh-value-copy st-rh-emphasis-text">${params.modifierBreakdownHtml}</div>
                </div>`
        : ""
      }
         ${params.dcReasonHtml
        ? `<div class="st-rh-note-box"><strong>DC 说明：</strong>${params.dcReasonHtml}</div>`
        : ""
      }
       </div>`
    ),
    params.distributionBlockHtml,
    params.timeoutBlockHtml,
  ]
    .filter(Boolean)
    .join("");

  return renderHtmlTemplateEvent(eventAlreadyRolledCardTemplateHtml, {
    summary_kicker_text: params.titleTextHtml,
    title_html: params.eventTitleHtml,
    roll_id_html: params.rollIdHtml,
    summary_status_badge_html: summaryStatusBadgeHtml,
    summary_primary_chips_html: summaryPrimaryChipsHtml,
    summary_secondary_chips_html: summarySecondaryChipsHtml,
    summary_dice_visual_html: buildSettlementSummaryVisualTemplateEvent(params.collapsedDiceVisualHtml, "LOG"),
    summary_footer_note_html: "手机端先看关键结算摘要，展开后查看完整归档与后果记录。",
    summary_toggle_html: buildSummaryToggleStateTemplateEvent(),
    details_id_attr: params.detailsIdAttr,
    details_kicker_text: "结算档案",
    details_heading_html: params.titleTextHtml,
    details_status_badge_html: detailsStatusBadgeHtml,
    detail_meta_html: detailMetaHtml,
    outcome_section_html: outcomeSectionHtml,
    footer_blocks_html: "",
    result_core_html: resultCoreHtml,
    detail_aux_html: detailAuxHtml,
  });
}

export function buildEventDistributionBlockTemplateEvent(rollsHtml: string, modifierHtml: string): string {
  return `<div class="st-rh-panel st-rh-info-panel">
  <p class="st-rh-kicker">骰面分布</p>
  <div class="st-rh-distribution-copy">
    <span class="st-rh-meta-text">骰面</span>
    <span class="st-rh-mono st-rh-title-text">[${rollsHtml}]</span>
    <span class="st-rh-inline-divider st-rh-inline-divider-wide">•</span>
    <span class="st-rh-meta-text">修正</span>
    <span class="st-rh-mono st-rh-emphasis-text">${modifierHtml}</span>
  </div>
</div>`;
}

export function buildEventTimeoutAtBlockTemplateEvent(timeoutIsoHtml: string): string {
  return `<div class="st-rh-panel st-rh-info-panel">
  <p class="st-rh-kicker">超时结算</p>
  <div class="st-rh-timeout-copy">
    归档时间
    <span class="st-rh-timeout-stamp st-rh-mono">${timeoutIsoHtml}</span>
  </div>
</div>`;
}
