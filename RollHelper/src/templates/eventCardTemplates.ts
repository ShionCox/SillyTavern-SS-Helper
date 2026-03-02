import { buildEventCardsSharedStylesTemplateEvent } from "./eventCardStylesTemplate";

export interface EventListItemTemplateParamsEvent {
  titleHtml: string;
  eventIdHtml: string;
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

export function buildEventRollButtonTemplateEvent(params: EventRollButtonTemplateParamsEvent): string {
  return `<button type="button" class="st-rh-roll-btn" data-dice-event-roll="1" data-round-id="${params.roundIdAttr}" data-dice-event-id="${params.eventIdAttr}" data-dice-expr="${params.diceExprAttr}" ${params.buttonDisabledAttr} style="${params.buttonStateStyle}">
            执行检定
          </button>`;
}

export function buildEventListItemTemplateEvent(params: EventListItemTemplateParamsEvent): string {
  const footerClass = params.rollButtonHtml ? "st-rh-event-footer" : "st-rh-event-footer is-centered";
  const modifierBadgeHtml = params.modifierTextHtml
    ? `<span class="st-rh-chip">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")} <span class="st-rh-chip-highlight">${params.modifierTextHtml}</span></span>`
    : "";
  const dcReasonHtml = params.dcReasonHtml
    ? `<div class="st-rh-dc-reason">${buildTipLabelTemplateEvent("DC 原因", "用于解释该事件难度（DC）设置的叙事依据。")}：${params.dcReasonHtml}</div>`
    : "";
  return `
      <li class="st-rh-event-item">
        <div class="st-rh-event-item-head">
          <h4 class="st-rh-event-title">
            ● ${params.titleHtml}
          </h4>
          <div class="st-rh-event-id st-rh-mono" title="${params.eventIdHtml}">
            ID: ${params.eventIdHtml}
          </div>
        </div>

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

        <div class="st-rh-runtime-wrap">
          <div data-dice-countdown="1" data-round-id="${params.roundIdAttr}" data-event-id="${params.eventIdAttr}" data-deadline-at="${params.deadlineAttr}" class="st-rh-runtime st-rh-mono" style="border:${params.runtimeBorder};background:${params.runtimeBackground};color:${params.runtimeColor};">
            状态：${params.runtimeTextHtml}
          </div>
        </div>

        ${params.rolledBlockHtml}

        <div class="${footerClass}">
          <code class="st-rh-command">${params.commandTextHtml}</code>
          ${params.rollButtonHtml}
        </div>
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
  const modifierRowHtml = params.modifierBreakdownHtml
    ? `<div class="st-rh-meta-label">${buildTipLabelTemplateEvent("修正", "总修正 = 基础修正 + 技能修正 + 状态修正。")}</div>
       <div class="st-rh-meta-value st-rh-mono" style="color:#ffd987;">${params.modifierBreakdownHtml}</div>`
    : "";
  return `
  <div class="st-rh-card-scope">
    ${buildEventCardsSharedStylesTemplateEvent()}
    <div class="st-rh-result-card">
      <div class="st-rh-result-head">
        <strong class="st-rh-result-heading">● 检定结果 ●</strong>
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
  </div>`;
}

export function buildRollsSummaryTemplateEvent(rollsHtml: string, modifierHtml: string): string {
  return `[${rollsHtml}] <span style="color:#8c7b60;">|</span> 修正 ${modifierHtml}`;
}

export interface EventAlreadyRolledCardTemplateParamsEvent {
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
  const modifierLineHtml = params.modifierBreakdownHtml
    ? `<div><span style="color:#8c7b60;" title="总修正 = 基础修正 + 技能修正 + 状态修正。">修正:</span> <code style="font-size:11px;color:#ffdfa3;">${params.modifierBreakdownHtml}</code></div>`
    : "";
  return `
  <div style="border:1px solid #5a4b3c;background:linear-gradient(135deg,#241c18 0%,#171210 100%);padding:14px;color:#b3a58b;box-shadow:inset 0 0 20px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px dashed #4a3b2c;padding-bottom:8px;">
      <strong style="color:#d1c5a5;font-size:14px;letter-spacing:1px;">${params.titleTextHtml}</strong>
      <span style="font-size:11px;opacity:0.6;font-family:monospace;">${params.rollIdHtml}</span>
    </div>

    <div style="font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:4px;">
      <div><span style="color:#8c7b60;" title="事件唯一标识。">事件:</span> <strong style="color:#d1c5a5;">${params.eventTitleHtml}</strong> <code style="font-size:11px;color:#6b5a45;">(${params.eventIdHtml})</code></div>
      <div><span style="color:#8c7b60;" title="该次结算由谁触发。">来源:</span> ${params.sourceTextHtml}</div>
      <div><span style="color:#8c7b60;" title="本次事件影响的叙事对象。">对象:</span> ${params.targetHtml}</div>
      <div><span style="color:#8c7b60;" title="骰态分为：普通（normal）、优势（advantage）、劣势（disadvantage）。">骰态:</span> ${params.advantageStateHtml}</div>
      <div><span style="color:#8c7b60;" title="是否请求爆骰，及是否真实触发连爆。">爆骰:</span> ${params.explodeInfoHtml}</div>
      ${modifierLineHtml}

      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.3);">
        <span style="color:#8c7b60;" title="将总值与 DC 按比较符判定成功或失败。">条件:</span>
        <span style="font-size:12px;color:#d1c5a5;font-family:monospace;">${params.compareHtml} ${params.dcText}</span>
        <span style="margin-left:auto;color:${params.statusColor};font-weight:bold;border:1px solid ${params.statusColor};padding:2px 6px;font-size:11px;border-radius:2px;">
          ${params.statusText}
        </span>
      </div>
      ${params.dcReasonHtml ? `<div style="font-size:12px;color:#c8d6a1;line-height:1.5;"><span title="用于解释该事件难度（DC）设置的叙事依据。">DC 原因:</span> ${params.dcReasonHtml}</div>` : ""}

      ${params.diceVisualBlockHtml}
      ${params.distributionBlockHtml}
      <div style="margin-top:8px;padding:8px;border:1px solid rgba(140,123,96,0.3);background:rgba(0,0,0,0.25);">
        <div style="font-size:11px;color:#8c7b60;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${params.outcomeLabelHtml}</div>
        <div style="font-size:12px;line-height:1.6;color:#d1c5a5;">${params.outcomeTextHtml}</div>
        ${params.outcomeStatusSummaryHtml ? `<div style="margin-top:6px;font-size:12px;line-height:1.55;color:#9fd3ff;">状态变化：${params.outcomeStatusSummaryHtml}</div>` : ""}
        ${params.currentStatusesHtml ? `<div style="margin-top:6px;font-size:12px;line-height:1.55;color:#b6e0ff;">当前状态：${params.currentStatusesHtml}</div>` : ""}
      </div>
      ${params.statusImpactHtml ? `<div style="margin-top:6px;padding:8px;border:1px dashed rgba(155,200,255,0.36);background:rgba(20,28,40,0.32);font-size:12px;line-height:1.5;color:#b8d8ff;">${params.statusImpactHtml}</div>` : ""}
      ${params.timeoutBlockHtml}
    </div>
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
