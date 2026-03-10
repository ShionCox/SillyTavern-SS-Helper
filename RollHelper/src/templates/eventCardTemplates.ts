import { buildEventCardsSharedStylesTemplateEvent } from "./eventCardStylesTemplate";

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
  roundIdAttr: string;
  eventIdAttr: string;
  deadlineAttr: string;
  runtimeTextHtml: string;
  runtimeBorder: string;
  runtimeBackground: string;
  runtimeColor: string;
  rolledBlockHtml: string;
  outcomePreviewHtml: string;
  commandTextHtml: string;
  rollButtonHtml: string;
}

export function buildEventRolledBlockTemplateEvent(rolledPrefixHtml: string, summaryHtml: string): string {
  return `<div style="margin-top:10px;padding:8px;border:1px solid rgba(82, 196, 26, 0.3);background:rgba(20, 35, 20, 0.6);font-size:12px;color:#a0d9a0;text-align:center;letter-spacing:0.5px;">
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
  return `<span class="st-rh-tip" data-tip="${tip}">${label}</span>`;
}

function buildSummaryToggleStateTemplateEvent(): string {
  return `<span class="st-rh-summary-toggle-state" aria-hidden="true">
            <span class="st-rh-summary-toggle-icon">▾</span>
            <span class="st-rh-toggle-closed">展开详情</span>
            <span class="st-rh-toggle-open">收起详情</span>
          </span>`;
}

export function buildEventRollButtonTemplateEvent(params: EventRollButtonTemplateParamsEvent): string {
  return `<button type="button" class="st-rh-roll-btn" data-dice-event-roll="1" data-round-id="${params.roundIdAttr}" data-dice-event-id="${params.eventIdAttr}" data-dice-expr="${params.diceExprAttr}" ${params.buttonDisabledAttr} style="${params.buttonStateStyle}">
            执行检定
          </button>`;
}

export function buildEventListItemTemplateEvent(params: EventListItemTemplateParamsEvent): string {
  const footerClass = "st-rh-event-footer is-centered";
  const modifierBadgeHtml = params.modifierTextHtml
    ? `<span class="st-rh-chip">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")} <span class="st-rh-chip-highlight">${params.modifierTextHtml}</span></span>`
    : "";
  const rollActionHtml = params.rollButtonHtml
    ? params.rollButtonHtml
    : `<span class="st-rh-summary-lock st-rh-mono">已锁定</span>`;
  const dcReasonHtml = params.dcReasonHtml ? `<div class="st-rh-dc-reason">${params.dcReasonHtml}</div>` : "";
  return `
      <li class="st-rh-event-item">
        <details class="st-rh-details-card st-rh-details-event">
          <summary class="st-rh-collapse-summary">
          <div class="st-rh-summary-main">
            <div class="st-rh-collapse-title-row">
              <strong class="st-rh-summary-title">● ${params.titleHtml}</strong>
              <span class="st-rh-summary-id st-rh-mono" title="${params.eventIdHtml}">ID: ${params.eventIdHtml}</span>
            </div>
            <div class="st-rh-summary-meta-row">
              <span class="st-rh-summary-chip">${params.collapsedCheckHtml}</span>
              <span class="st-rh-summary-chip">时限 ${params.timeLimitHtml}</span>
            </div>
          </div>
          <div class="st-rh-summary-actions">
            <div data-dice-countdown="1" data-round-id="${params.roundIdAttr}" data-event-id="${params.eventIdAttr}" data-deadline-at="${params.deadlineAttr}" class="st-rh-runtime st-rh-runtime-inline st-rh-mono" style="border:${params.runtimeBorder};background:${params.runtimeBackground};color:${params.runtimeColor};">
              ⏱ ${params.collapsedRuntimeHtml}
            </div>
            ${rollActionHtml}
            ${buildSummaryToggleStateTemplateEvent()}
          </div>
          </summary>

          <div id="${params.detailsIdAttr}" class="st-rh-card-details-body st-rh-event-details">
          <div class="st-rh-event-desc">
            ${params.descHtml}
          </div>

          ${params.outcomePreviewHtml}

          <div class="st-rh-chip-row">
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("对象", "本次事件影响的叙事对象。")} <span class="st-rh-chip-target">${params.targetHtml}</span></span>
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("技能", "参与检定并提供修正的技能项。")} <span style="color:#fff;cursor:help;" title="${params.skillTitleAttr}">${params.skillHtml}</span></span>
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("骰态", "骰态分为：普通（normal）、优势（advantage）、劣势（disadvantage），会影响掷骰结果。")} <span class="st-rh-chip-highlight">${params.advantageStateHtml}</span></span>
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("骰式", "本次掷骰表达式，如 1d20、1d20!、2d20kh1。")} <span class="st-rh-chip-dice">${params.checkDiceHtml}</span></span>
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("条件", "将掷骰总值与 DC 按比较符进行判定。")} <span class="st-rh-chip-check">${params.compareHtml} ${params.dcText}</span></span>
            <span class="st-rh-chip">${buildTipLabelTemplateEvent("时限", "超时未掷骰时，系统会按超时规则处理。")} <span class="st-rh-chip-time">${params.timeLimitHtml}</span></span>
            ${modifierBadgeHtml}
          </div>
          ${dcReasonHtml}

          ${params.rolledBlockHtml}

          <div class="${footerClass}">
            <code class="st-rh-command">${params.commandTextHtml}</code>
          </div>
          </div>
        </details>
      </li>`;
}

/**
 * 功能：构建当前事件列表卡片模板（不再内置技能/状态预览按钮）。
 *
 * 参数：
 *   roundIdHtml (string)：轮次 ID 的安全 HTML 文本。
 *   itemsHtml (string)：事件条目列表的 HTML 文本。
 *
 * 返回：
 *   string：事件列表卡片 HTML。
 */
export function buildEventListCardTemplateEvent(roundIdHtml: string, itemsHtml: string): string {
  return `
  <div class="st-rh-card-scope">
    ${buildEventCardsSharedStylesTemplateEvent()}
    <div class="st-rh-event-board">
      <div class="st-rh-board-head">
        <strong class="st-rh-board-title">当前事件</strong>
        <div class="st-rh-board-head-right">
          <span class="st-rh-board-id st-rh-mono" title="${roundIdHtml}">轮次 ID: ${roundIdHtml}</span>
        </div>
      </div>
      <ul class="st-rh-event-list">${itemsHtml}</ul>
    </div>
  </div>`;
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

export function buildEventRollResultCardTemplateEvent(params: EventRollResultCardTemplateParamsEvent): string {
  const collapsedStatusSummaryChipHtml = params.collapsedStatusSummaryHtml
    ? `<span class="st-rh-summary-chip ${params.collapsedStatusSummaryChipClassName}" title="${params.collapsedStatusSummaryTitleAttr}">
        <span class="st-rh-summary-chip-marquee">
          <span class="st-rh-summary-chip-marquee-text">${params.collapsedStatusSummaryHtml}</span>
          <span class="st-rh-summary-chip-marquee-gap" aria-hidden="true">获得状态</span>
          <span class="st-rh-summary-chip-marquee-text" aria-hidden="true">${params.collapsedStatusSummaryHtml}</span>
        </span>
      </span>`
    : "";
  const modifierRowHtml = params.modifierBreakdownHtml
    ? `<div class="st-rh-meta-label">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")}</div>
       <div class="st-rh-meta-value st-rh-mono" style="color:#ffd987;">${params.modifierBreakdownHtml}</div>`
    : "";
  return `
  <div class="st-rh-card-scope">
    ${buildEventCardsSharedStylesTemplateEvent()}
    <details class="st-rh-result-card st-rh-details-card st-rh-details-result">
      <summary class="st-rh-collapse-summary st-rh-collapse-summary-result">
        <div class="st-rh-summary-main st-rh-summary-main-result">
          <div class="st-rh-collapse-title-row">
            <strong class="st-rh-summary-title">${params.titleHtml}</strong>
            <span class="st-rh-summary-id st-rh-mono">${params.rollIdHtml}</span>
          </div>
          <div class="st-rh-summary-meta-row">
            <span class="st-rh-summary-pill" style="--rh-pill:${params.statusColor};">${params.collapsedStatusHtml}</span>
            <span class="st-rh-summary-chip st-rh-mono">总点 ${params.collapsedTotalHtml}</span>
            <span class="st-rh-summary-chip st-rh-mono">${params.collapsedConditionHtml}</span>
            <span class="st-rh-summary-chip">${params.collapsedSourceHtml}</span>
            <span class="st-rh-summary-chip ${params.collapsedOutcomeChipClassName}" title="${params.collapsedOutcomeTitleAttr}">
              <span class="st-rh-summary-chip-marquee">
                <span class="st-rh-summary-chip-marquee-text">${params.collapsedOutcomeHtml}</span>
                <span class="st-rh-summary-chip-marquee-gap" aria-hidden="true">　　</span>
                <span class="st-rh-summary-chip-marquee-text" aria-hidden="true">${params.collapsedOutcomeHtml}</span>
              </span>
            </span>
            ${collapsedStatusSummaryChipHtml}
            ${buildSummaryToggleStateTemplateEvent()}
          </div>
        </div>
        <div class="st-rh-summary-actions st-rh-summary-actions-result">
          ${params.collapsedDiceVisualHtml ? `<span class="st-rh-summary-dice st-rh-summary-dice-large">${params.collapsedDiceVisualHtml}</span>` : ""}
        </div>
      </summary>

      <div id="${params.detailsIdAttr}" class="st-rh-card-details-body st-rh-result-details">
        <div class="st-rh-result-head st-rh-result-head-centered">
          <strong class="st-rh-result-heading">检定结果</strong>
          <span class="st-rh-result-id">${params.rollIdHtml}</span>
        </div>

        <div class="st-rh-result-title">${params.titleHtml}</div>

        <div class="st-rh-meta-grid">
          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("事件 ID", "事件唯一标识。")}</div>
          <div class="st-rh-meta-value st-rh-mono">${params.eventIdHtml}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("来源", "该次结算由谁触发：AI 自动、玩家手动或超时系统结算。")}</div>
          <div class="st-rh-meta-value">${params.sourceHtml}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("对象", "本次事件影响的叙事对象。")}</div>
          <div class="st-rh-meta-value" style="color:#9ad1ff;">${params.targetHtml}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("技能", "参与检定并提供修正的技能项。")}</div>
          <div class="st-rh-meta-value" style="color:#fff;"><span style="cursor:help;" title="${params.skillTitleAttr}">${params.skillHtml}</span></div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("骰态", "骰态分为：普通（normal）、优势（advantage）、劣势（disadvantage），会影响掷骰结果。")}</div>
          <div class="st-rh-meta-value st-rh-chip-highlight">${params.advantageStateHtml}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("骰式", "本次掷骰表达式，如 1d20、1d20!、2d20kh1。")}</div>
          <div class="st-rh-meta-value st-rh-mono" style="color:#ffdfa3;">${params.diceExprHtml}${params.diceModifierHintHtml ? `<span style="margin-left:8px;color:#ffd987;">${params.diceModifierHintHtml}</span>` : ""}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("掷骰结果", "原始掷骰面值与最终修正后的结果。")}</div>
          <div class="st-rh-meta-value st-rh-mono">${params.rollsSummaryHtml}</div>

          <div class="st-rh-meta-label">${buildTipLabelTemplateEvent("爆骰", "是否请求爆骰，以及是否真实触发连爆或被策略降级。")}</div>
          <div class="st-rh-meta-value">${params.explodeInfoHtml}</div>

          ${modifierRowHtml}
        </div>

        <div class="st-rh-result-main" style="--status-color:${params.statusColor};">
          <div class="st-rh-result-main-left">
            <div class="st-rh-result-kicker">结果</div>
          </div>
          <div class="st-rh-result-main-center">
            ${params.diceVisualBlockHtml}
          </div>
          <div class="st-rh-result-main-right">
            <div class="st-rh-result-kicker">系统判定</div>
            <div class="st-rh-meta-value st-rh-mono" style="margin-bottom:2px;">${buildTipLabelTemplateEvent("条件", "将总值与 DC 按比较符判定成功或失败。")}: ${params.compareHtml} ${params.dcText}</div>
            ${params.dcReasonHtml ? `<div class="st-rh-meta-value" style="font-size:12px;color:#c8d6a1;line-height:1.45;">${buildTipLabelTemplateEvent("DC 原因", "用于解释该事件难度（DC）设置的叙事依据。")}: ${params.dcReasonHtml}</div>` : ""}
            <div class="st-rh-result-status">[ ${params.statusText} ]</div>
          </div>
        </div>

        <div class="st-rh-outcome-box">
          <div class="st-rh-outcome-label">${params.outcomeLabelHtml}</div>
          <div class="st-rh-outcome-text">${params.outcomeTextHtml}</div>
          ${params.outcomeStatusSummaryHtml ? `<div class="st-rh-outcome-status-change">状态变化：${params.outcomeStatusSummaryHtml}</div>` : ""}
        </div>
        ${params.statusImpactHtml ? `<div style="margin-top:8px;padding:8px;border:1px dashed rgba(155,200,255,0.36);background:rgba(20,28,40,0.32);font-size:12px;line-height:1.5;color:#b8d8ff;border-radius:8px;">${params.statusImpactHtml}</div>` : ""}
        ${params.currentStatusesHtml ? `<div class="st-rh-outcome-status-current">当前状态：${params.currentStatusesHtml}</div>` : ""}

        <div class="st-rh-time-limit">
          时间限制: ${params.timeLimitHtml}
        </div>
      </div>
    </details>
  </div>`;
}

export function buildRollsSummaryTemplateEvent(rollsHtml: string, modifierHtml: string): string {
  return `[${rollsHtml}] <span style="color:#8c7b60;">|</span> 修正 ${modifierHtml}`;
}

export interface EventAlreadyRolledCardTemplateParamsEvent {
  detailsIdAttr: string;
  collapsedStatusHtml: string;
  collapsedConditionHtml: string;
  collapsedSourceHtml: string;
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
  advantageStateHtml: string;
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

export function buildEventAlreadyRolledCardTemplateEvent(params: EventAlreadyRolledCardTemplateParamsEvent): string {
  const collapsedStatusSummaryChipHtml = params.collapsedStatusSummaryHtml
    ? `<span class="st-rh-summary-chip ${params.collapsedStatusSummaryChipClassName}" title="${params.collapsedStatusSummaryTitleAttr}">
        <span class="st-rh-summary-chip-marquee">
          <span class="st-rh-summary-chip-marquee-text">${params.collapsedStatusSummaryHtml}</span>
          <span class="st-rh-summary-chip-marquee-gap" aria-hidden="true">銆€銆€</span>
          <span class="st-rh-summary-chip-marquee-text" aria-hidden="true">${params.collapsedStatusSummaryHtml}</span>
        </span>
      </span>`
    : "";
  const modifierLineHtml = params.modifierBreakdownHtml
    ? `<div><span style="color:#8c7b60;" title="总修正 = 基础修正 + 技能修正 + 状态修正。">修正:</span> <code style="font-size:11px;color:#ffdfa3;">${params.modifierBreakdownHtml}</code></div>`
    : "";
  return `
  <div class="st-rh-card-scope">
    ${buildEventCardsSharedStylesTemplateEvent()}
    <details class="st-rh-result-card st-rh-already-card st-rh-details-card st-rh-details-already">
      <summary class="st-rh-collapse-summary st-rh-collapse-summary-result">
        <div class="st-rh-summary-main">
          <div class="st-rh-collapse-title-row">
            <strong class="st-rh-summary-title">${params.eventTitleHtml}</strong>
            <span class="st-rh-summary-id st-rh-mono">${params.rollIdHtml}</span>
          </div>
          <div class="st-rh-summary-meta-row">
            <span class="st-rh-summary-pill" style="--rh-pill:${params.statusColor};">${params.collapsedStatusHtml}</span>
            <span class="st-rh-summary-chip">${params.collapsedSourceHtml}</span>
            <span class="st-rh-summary-chip st-rh-mono">${params.collapsedConditionHtml}</span>
            <span class="st-rh-summary-chip ${params.collapsedOutcomeChipClassName}" title="${params.collapsedOutcomeTitleAttr}">
              <span class="st-rh-summary-chip-marquee">
                <span class="st-rh-summary-chip-marquee-text">${params.collapsedOutcomeHtml}</span>
                <span class="st-rh-summary-chip-marquee-gap" aria-hidden="true">　　</span>
                <span class="st-rh-summary-chip-marquee-text" aria-hidden="true">${params.collapsedOutcomeHtml}</span>
              </span>
            </span>
            ${collapsedStatusSummaryChipHtml}
            ${buildSummaryToggleStateTemplateEvent()}
          </div>
        </div>
        <div class="st-rh-summary-actions st-rh-summary-actions-result">
          ${params.collapsedDiceVisualHtml ? `<span class="st-rh-summary-dice">${params.collapsedDiceVisualHtml}</span>` : ""}
        </div>
      </summary>

      <div id="${params.detailsIdAttr}" class="st-rh-card-details-body st-rh-already-details">
        <div class="st-rh-result-head">
          <strong class="st-rh-result-heading">${params.titleTextHtml}</strong>
          <span class="st-rh-result-id">${params.rollIdHtml}</span>
        </div>

        <div class="st-rh-already-stack">
          <div class="st-rh-already-line"><span class="st-rh-already-label">事件:</span> <strong>${params.eventTitleHtml}</strong> <code class="st-rh-mono">(${params.eventIdHtml})</code></div>
          <div class="st-rh-already-line"><span class="st-rh-already-label">来源:</span> ${params.sourceTextHtml}</div>
          <div class="st-rh-already-line"><span class="st-rh-already-label">对象:</span> ${params.targetHtml}</div>
          <div class="st-rh-already-line"><span class="st-rh-already-label">骰态:</span> ${params.advantageStateHtml}</div>
          <div class="st-rh-already-line"><span class="st-rh-already-label">爆骰:</span> ${params.explodeInfoHtml}</div>
          ${modifierLineHtml ? `<div class="st-rh-already-line">${modifierLineHtml}</div>` : ""}
          <div class="st-rh-already-line st-rh-already-line-condition">
            <span class="st-rh-already-label">条件:</span>
            <span class="st-rh-mono">${params.compareHtml} ${params.dcText}</span>
            <span class="st-rh-summary-pill" style="--rh-pill:${params.statusColor};">${params.statusText}</span>
          </div>
          ${params.dcReasonHtml ? `<div class="st-rh-already-line st-rh-already-dc-reason">DC 原因: ${params.dcReasonHtml}</div>` : ""}
        </div>

        ${params.diceVisualBlockHtml}
        ${params.distributionBlockHtml}

        <div class="st-rh-outcome-box">
          <div class="st-rh-outcome-label">${params.outcomeLabelHtml}</div>
          <div class="st-rh-outcome-text">${params.outcomeTextHtml}</div>
          ${params.outcomeStatusSummaryHtml ? `<div class="st-rh-outcome-status-change">状态变化：${params.outcomeStatusSummaryHtml}</div>` : ""}
          ${params.currentStatusesHtml ? `<div class="st-rh-outcome-status-current">当前状态：${params.currentStatusesHtml}</div>` : ""}
        </div>
        ${params.statusImpactHtml ? `<div style="margin-top:6px;padding:8px;border:1px dashed rgba(155,200,255,0.36);background:rgba(20,28,40,0.32);font-size:12px;line-height:1.5;color:#b8d8ff;">${params.statusImpactHtml}</div>` : ""}
        ${params.timeoutBlockHtml}
      </div>
    </details>
  </div>`;
}

export function buildEventDistributionBlockTemplateEvent(rollsHtml: string, modifierHtml: string): string {
  return `
      <div style="font-size:11px;color:#6b5a45;margin-top:6px;text-align:center;background:rgba(0,0,0,0.3);padding:4px;border-radius:4px;">
        <span style="color:#8c7b60;">掷骰:</span> [${rollsHtml}] <span style="color:#8c7b60;margin:0 4px;">|</span> <span style="color:#8c7b60;">修正</span> ${modifierHtml}
      </div>
      `;
}

export function buildEventTimeoutAtBlockTemplateEvent(timeoutIsoHtml: string): string {
  return `<div style="font-size:11px;color:#8c7b60;margin-top:6px;font-family:monospace;text-align:right;">超时结算时间：${timeoutIsoHtml}</div>`;
}
