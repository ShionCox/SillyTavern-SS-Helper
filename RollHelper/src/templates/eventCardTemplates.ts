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

export function buildEventRollButtonTemplateEvent(params: EventRollButtonTemplateParamsEvent): string {
  return `<button type="button" data-dice-event-roll="1" data-round-id="${params.roundIdAttr}" data-dice-event-id="${params.eventIdAttr}" data-dice-expr="${params.diceExprAttr}" ${params.buttonDisabledAttr} style="border:1px solid #c5a059;background:linear-gradient(135deg,#3a2515,#1a100a);color:#ffdfa3;padding:6px 16px;font-family:'Georgia', serif;font-weight:bold;font-size:12px;letter-spacing:1px;text-transform:uppercase;transition:all 0.2s;box-shadow:0 2px 4px rgba(0,0,0,0.5);${params.buttonStateStyle}">
            执行检定
          </button>`;
}

export function buildEventListItemTemplateEvent(params: EventListItemTemplateParamsEvent): string {
  const modifierBadgeHtml = params.modifierTextHtml
    ? `<span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">修正 <span style="color:#ffd987;">${params.modifierTextHtml}</span></span>`
    : "";
  const dcReasonHtml = params.dcReasonHtml
    ? `<div style="margin-top:8px;margin-bottom:8px;font-size:12px;line-height:1.5;color:#c8d6a1;border:1px dashed rgba(160,197,110,0.35);background:rgba(34,44,22,0.38);padding:8px 10px;">DC 原因：${params.dcReasonHtml}</div>`
    : "";
  return `
      <li style="position:relative;list-style:none;margin-bottom:16px;border:1px solid rgba(197,160,89,0.3);border-left:3px solid #c5a059;padding:14px;background:linear-gradient(135deg, rgba(30,20,18,0.8), rgba(15,10,10,0.9));box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
          <div style="font-weight:bold;color:#ffdfa3;font-size:15px;font-family:'Georgia', serif;letter-spacing:1px;">
            ● ${params.titleHtml}
          </div>
          <div style="font-size:11px;font-family:monospace;color:#8c7b60;background:rgba(0,0,0,0.5);border:1px solid rgba(197,160,89,0.2);padding:2px 6px;">
            ID: ${params.eventIdHtml}
          </div>
        </div>

        <div style="font-size:13px;line-height:1.6;color:#d1c5a5;opacity:0.9;margin-bottom:12px;">
          ${params.descHtml}
        </div>

        ${params.outcomePreviewHtml}

        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;justify-content:center;text-align:center;">
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">对象 <span style="color:#9ad1ff;">${params.targetHtml}</span></span>
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">技能 <span style="color:#fff;cursor:help;" title="${params.skillTitleAttr}">${params.skillHtml}</span></span>
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">骰态 <span style="color:#ffd987;">${params.advantageStateHtml}</span></span>
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">骰式 <span style="color:#ffdfa3;">${params.checkDiceHtml}</span></span>
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">条件 <span style="color:#ffbbbb;">${params.compareHtml} ${params.dcText}</span></span>
          <span style="font-size:11px;padding:3px 8px;border:1px solid rgba(150,150,150,0.2);background:rgba(255,255,255,0.05);color:#d1c5a5;text-transform:uppercase;">时限 <span style="color:#a0d9a0;">${params.timeLimitHtml}</span></span>
          ${modifierBadgeHtml}
        </div>
        ${dcReasonHtml}

        <div data-dice-countdown="1" data-round-id="${params.roundIdAttr}" data-event-id="${params.eventIdAttr}" data-deadline-at="${params.deadlineAttr}" style="display:inline-block;padding:4px 10px;font-size:11px;font-family:monospace;border:${params.runtimeBorder};background:${params.runtimeBackground};color:${params.runtimeColor};letter-spacing:1px;margin-bottom:4px;">
          状态：${params.runtimeTextHtml}
        </div>

        ${params.rolledBlockHtml}

        <div style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;border-top:1px dashed rgba(197,160,89,0.2);padding-top:12px;">
          <code style="font-size:11px;color:#8c7b60;background:none;padding:0;">${params.commandTextHtml}</code>
          ${params.rollButtonHtml}
        </div>
      </li>`;
}

export function buildEventListCardTemplateEvent(roundIdHtml: string, itemsHtml: string): string {
  return `
  <div style="border:1px solid #8c7b60;background:linear-gradient(145deg,#1c1412 0%,#0d0806 100%);padding:16px;color:#d1c5a5;box-shadow:0 8px 24px rgba(0,0,0,0.4), inset 0 0 30px rgba(0,0,0,0.6);font-family:sans-serif;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;border-bottom:1px solid #4a3b2c;padding-bottom:10px;">
      <strong style="color:#e8dcb5;font-size:16px;font-family:'Georgia', serif;letter-spacing:2px;">● 当前事件 ●</strong>
      <span style="font-size:11px;color:#6b5a45;font-family:monospace;">轮次 ID: ${roundIdHtml}</span>
    </div>
    <ul style="padding:0;margin:0;">${itemsHtml}</ul>
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
}

export function buildEventRollResultCardTemplateEvent(params: EventRollResultCardTemplateParamsEvent): string {
  const modifierRowHtml = params.modifierBreakdownHtml
    ? `<div style="color:#8c7b60;text-align:right;">修正</div>
       <div style="font-family:monospace;color:#ffd987;">${params.modifierBreakdownHtml}</div>`
    : "";
  return `
  <div style="border:1px solid #8c7b60;background:linear-gradient(145deg,#1c1412 0%,#0d0806 100%);padding:16px;color:#d1c5a5;box-shadow:0 8px 24px rgba(0,0,0,0.4), inset 0 0 30px rgba(0,0,0,0.6);">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:14px;border-bottom:1px solid #4a3b2c;padding-bottom:10px;">
      <strong style="color:#e8dcb5;font-size:15px;font-family:'Georgia', serif;letter-spacing:1px;">● 检定结果 ●</strong>
      <span style="font-size:11px;color:#6b5a45;font-family:monospace;">${params.rollIdHtml}</span>
    </div>

    <div style="margin-bottom:12px;font-weight:bold;font-size:16px;color:#ffdfa3;font-family:'Georgia', serif;">
      ${params.titleHtml}
    </div>

    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:12px;line-height:1.4;opacity:0.9;background:rgba(0,0,0,0.3);padding:10px;border:1px solid rgba(197,160,89,0.15);">
      <div style="color:#8c7b60;text-align:right;">事件 ID</div>
      <div style="font-family:monospace;">${params.eventIdHtml}</div>

      <div style="color:#8c7b60;text-align:right;">来源</div>
      <div>${params.sourceHtml}</div>

      <div style="color:#8c7b60;text-align:right;">对象</div>
      <div style="color:#9ad1ff;">${params.targetHtml}</div>

      <div style="color:#8c7b60;text-align:right;">技能</div>
      <div style="color:#fff;"><span style="cursor:help;" title="${params.skillTitleAttr}">${params.skillHtml}</span></div>

      <div style="color:#8c7b60;text-align:right;">骰态</div>
      <div style="color:#ffd987;">${params.advantageStateHtml}</div>

      <div style="color:#8c7b60;text-align:right;">骰式</div>
      <div style="font-family:monospace;color:#ffdfa3;">${params.diceExprHtml}${params.diceModifierHintHtml ? `<span style="margin-left:8px;color:#ffd987;">${params.diceModifierHintHtml}</span>` : ""}</div>

      <div style="color:#8c7b60;text-align:right;">掷骰结果</div>
      <div style="font-family:monospace;">${params.rollsSummaryHtml}</div>

      ${modifierRowHtml}
    </div>

    <div style="margin-top:16px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;background:linear-gradient(90deg, rgba(0,0,0,0.4), rgba(0,0,0,0.1));padding:12px;border-left:3px solid ${params.statusColor};">
      <div style="justify-self:start;">
        <div style="font-size:11px;color:#8c7b60;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">结果</div>
      </div>
      <div style="justify-self:center;display:flex;align-items:center;justify-content:center;">
        ${params.diceVisualBlockHtml}
      </div>
      <div style="justify-self:end;text-align:right;">
        <div style="font-size:11px;color:#8c7b60;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">系统判定</div>
        <div style="font-size:13px;font-family:monospace;margin-bottom:2px;">条件: ${params.compareHtml} ${params.dcText}</div>
        ${params.dcReasonHtml ? `<div style="font-size:12px;color:#c8d6a1;line-height:1.45;">DC 原因: ${params.dcReasonHtml}</div>` : ""}
        <div style="font-weight:bold;font-size:16px;color:${params.statusColor};letter-spacing:1px;">[ ${params.statusText} ]</div>
      </div>
    </div>

    <div style="margin-top:10px;padding:10px;border:1px solid rgba(197,160,89,0.2);background:rgba(0,0,0,0.25);">
      <div style="font-size:11px;color:#8c7b60;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">${params.outcomeLabelHtml}</div>
      <div style="font-size:13px;line-height:1.6;color:#e8dcb5;">${params.outcomeTextHtml}</div>
    </div>
    ${params.statusImpactHtml ? `<div style="margin-top:8px;padding:8px;border:1px dashed rgba(155,200,255,0.36);background:rgba(20,28,40,0.32);font-size:12px;line-height:1.5;color:#b8d8ff;">${params.statusImpactHtml}</div>` : ""}

    <div style="margin-top:12px;font-size:11px;color:#6b5a45;text-align:right;font-family:monospace;">
      时间限制: ${params.timeLimitHtml}
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
}

export function buildEventAlreadyRolledCardTemplateEvent(params: EventAlreadyRolledCardTemplateParamsEvent): string {
  const modifierLineHtml = params.modifierBreakdownHtml
    ? `<div><span style="color:#8c7b60;">修正:</span> <code style="font-size:11px;color:#ffdfa3;">${params.modifierBreakdownHtml}</code></div>`
    : "";
  return `
  <div style="border:1px solid #5a4b3c;background:linear-gradient(135deg,#241c18 0%,#171210 100%);padding:14px;color:#b3a58b;box-shadow:inset 0 0 20px rgba(0,0,0,0.5);">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;border-bottom:1px dashed #4a3b2c;padding-bottom:8px;">
      <strong style="color:#d1c5a5;font-size:14px;letter-spacing:1px;">${params.titleTextHtml}</strong>
      <span style="font-size:11px;opacity:0.6;font-family:monospace;">${params.rollIdHtml}</span>
    </div>

    <div style="font-size:13px;line-height:1.6;display:flex;flex-direction:column;gap:4px;">
      <div><span style="color:#8c7b60;">事件:</span> <strong style="color:#d1c5a5;">${params.eventTitleHtml}</strong> <code style="font-size:11px;color:#6b5a45;">(${params.eventIdHtml})</code></div>
      <div><span style="color:#8c7b60;">来源:</span> ${params.sourceTextHtml}</div>
      <div><span style="color:#8c7b60;">对象:</span> ${params.targetHtml}</div>
      <div><span style="color:#8c7b60;">骰态:</span> ${params.advantageStateHtml}</div>
      ${modifierLineHtml}

      <div style="display:flex;align-items:center;gap:8px;margin-top:4px;padding-top:4px;border-top:1px solid rgba(0,0,0,0.3);">
        <span style="color:#8c7b60;">条件:</span>
        <span style="font-size:12px;color:#d1c5a5;font-family:monospace;">${params.compareHtml} ${params.dcText}</span>
        <span style="margin-left:auto;color:${params.statusColor};font-weight:bold;border:1px solid ${params.statusColor};padding:2px 6px;font-size:11px;border-radius:2px;">
          ${params.statusText}
        </span>
      </div>
      ${params.dcReasonHtml ? `<div style="font-size:12px;color:#c8d6a1;line-height:1.5;">DC 原因: ${params.dcReasonHtml}</div>` : ""}

      ${params.diceVisualBlockHtml}
      ${params.distributionBlockHtml}
      <div style="margin-top:8px;padding:8px;border:1px solid rgba(140,123,96,0.3);background:rgba(0,0,0,0.25);">
        <div style="font-size:11px;color:#8c7b60;letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;">${params.outcomeLabelHtml}</div>
        <div style="font-size:12px;line-height:1.6;color:#d1c5a5;">${params.outcomeTextHtml}</div>
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
