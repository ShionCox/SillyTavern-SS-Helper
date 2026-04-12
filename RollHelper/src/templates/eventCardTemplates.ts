import baseCssText from "./html/roll-cards/_base.css?inline";
import eventListCardCssText from "./html/roll-cards/event-list-card.css?inline";
import eventListCardMobileCssText from "./html/roll-cards/event-list-card.mobile.css?inline";
import eventListItemCssText from "./html/roll-cards/event-list-item.css?inline";
import eventListItemMobileCssText from "./html/roll-cards/event-list-item.mobile.css?inline";
import settlementSharedCssText from "./html/roll-cards/_settlement-shared.css?inline";
import eventSettlementCardMobileCssText from "./html/roll-cards/event-settlement-card.mobile.css?inline";
import eventRollResultCardCssText from "./html/roll-cards/event-roll-result-card.css?inline";
import eventRollResultCardMobileCssText from "./html/roll-cards/event-roll-result-card.mobile.css?inline";
import eventListCardTemplateHtml from "./html/roll-cards/event-list-card.html?raw";
import eventListCardMobileTemplateHtml from "./html/roll-cards/event-list-card.mobile.html?raw";
import eventListItemTemplateHtml from "./html/roll-cards/event-list-item.html?raw";
import eventListItemMobileTemplateHtml from "./html/roll-cards/event-list-item.mobile.html?raw";
import eventRollResultCardTemplateHtml from "./html/roll-cards/event-roll-result-card.html?raw";
import eventRollResultCardMobileTemplateHtml from "./html/roll-cards/event-roll-result-card.mobile.html?raw";
import { ensureSdkSharedRuntimeStyles } from "../../../SDK/runtime-styles";

const EVENT_CARD_STYLE_ID_Event = "st-rh-event-card-styles-v1";
const EVENT_CARD_CUSTOM_CLASS_PREFIX_Event = "custom-";
const EVENT_CARD_CUSTOM_CLASS_SELECTOR_PATTERN_Event = /\.(?=[A-Za-z_\\])((?:\\.|[A-Za-z0-9_%@/\-[\]:])+)/g;
const fontFaceCssText = `@font-face {
  font-family: "STRHSourceSong";
  src: url("${new URL(/* @vite-ignore */ "./assets/font/思源宋体.otf", import.meta.url).href}") format("opentype");
  font-style: normal;
  font-weight: 400 900;
  font-display: swap;
}`;



function buildCustomPrefixedEventCardCssTextEvent(cssText: string): string {
  return cssText.replace(EVENT_CARD_CUSTOM_CLASS_SELECTOR_PATTERN_Event, (match, className: string) => {
    if (className.startsWith(EVENT_CARD_CUSTOM_CLASS_PREFIX_Event)) {
      return match;
    }
    return `.${EVENT_CARD_CUSTOM_CLASS_PREFIX_Event}${className}`;
  });
}

const eventCardClassesCssText = [
  baseCssText,
  eventListCardCssText,
  eventListCardMobileCssText,
  eventListItemCssText,
  eventListItemMobileCssText,
  settlementSharedCssText,
  eventSettlementCardMobileCssText,
  eventRollResultCardCssText,
  eventRollResultCardMobileCssText,
].join("\n");

const eventCardRuntimeCssText = `${fontFaceCssText}\n${eventCardClassesCssText}\n${buildCustomPrefixedEventCardCssTextEvent(eventCardClassesCssText)}`;

export function buildEventCardStylesCssTextEvent(): string {
  return eventCardRuntimeCssText;
}

/**
 * 功能：兼容旧入口，转为调用 SDK 的全局 Font Awesome 样式挂载器。
 * @param doc 目标文档对象，默认使用当前页面文档
 * @returns void：无返回值
 */
export function ensureEventCardExternalStylesEvent(doc: Document = document): void {
  ensureSdkSharedRuntimeStyles(doc);
}

/**
 * 功能：确保事件卡片样式与共享图标样式已经注入页面。
 * @param doc 目标文档对象，默认使用当前页面文档
 * @returns void：无返回值
 */
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

  // 注入展开/折叠动画拦截器脚本
  ensureDetailsAnimScriptEvent(doc);
}

/**
 * 功能：刷新手机事件卡标题的滚动状态。
 * @param root 用于查询标题节点的根容器。
 * @returns 无返回值。
 */
function resolveEventCardMarqueeNodesEvent(marqueeElement: HTMLElement): {
  track: HTMLElement;
  segment: HTMLElement;
} | null {
  const track = marqueeElement.querySelector(
    '[data-st-rh-role="title-track"], [data-st-rh-role="inline-track"]'
  ) as HTMLElement | null;
  const segment = marqueeElement.querySelector(
    '[data-st-rh-role="title-segment"], [data-st-rh-role="inline-segment"]'
  ) as HTMLElement | null;
  if (!track || !segment) return null;
  return { track, segment };
}

function refreshSingleEventCardMarqueeEvent(marqueeElement: HTMLElement): boolean {
  const nodes = resolveEventCardMarqueeNodesEvent(marqueeElement);
  if (!nodes) return false;
  const { track, segment } = nodes;

  const visibleWidth = Math.ceil(
    marqueeElement.clientWidth || marqueeElement.getBoundingClientRect().width || 0
  );
  const contentWidth = Math.ceil(
    segment.scrollWidth || segment.getBoundingClientRect().width || 0
  );
  if (visibleWidth <= 0 || contentWidth <= 0) return false;

  track.style.removeProperty("--st-rh-marquee-distance");
  track.style.removeProperty("--st-rh-marquee-duration");
  marqueeElement.classList.remove("is-overflowing");

  const overflowWidth = contentWidth - visibleWidth;
  if (overflowWidth <= 2) return true;

  marqueeElement.classList.add("is-overflowing");
  track.style.setProperty("--st-rh-marquee-distance", `-${overflowWidth}px`);
  track.style.setProperty("--st-rh-marquee-duration", `${Math.max(6, Math.min(18, overflowWidth / 18 + 4))}s`);
  return true;
}

export function refreshEventCardMarqueeEvent(root: ParentNode = document): void {
  const marquees: HTMLElement[] = [];
  if (
    root instanceof HTMLElement &&
    root.matches('[data-st-rh-role="title-marquee"], [data-st-rh-role="inline-marquee"]')
  ) {
    marquees.push(root);
  }
  root
    .querySelectorAll?.('[data-st-rh-role="title-marquee"], [data-st-rh-role="inline-marquee"]')
    .forEach((marquee) => {
      if (marquee instanceof HTMLElement) {
        marquees.push(marquee);
      }
    });
  if (marquees.length === 0) return;

  marquees.forEach((marqueeElement) => {
    refreshSingleEventCardMarqueeEvent(marqueeElement);
  });
}

export function refreshEventCardMobileTitleMarqueeEvent(root: ParentNode = document): void {
  refreshEventCardMarqueeEvent(root);
}

const DETAILS_ANIM_SCRIPT_ID_Event = "st-rh-details-anim-script-v1";

function ensureDetailsAnimScriptEvent(doc: Document): void {
  if (doc.getElementById(DETAILS_ANIM_SCRIPT_ID_Event)) return;
  const script = doc.createElement("script");
  script.id = DETAILS_ANIM_SCRIPT_ID_Event;
  script.textContent = `
(function(){
  if(window.__stRhDetailsAnimBound)return;
  window.__stRhDetailsAnimBound=true;
  var marqueeRefreshQueued=false;
  var marqueeResizeObserver=null;
  var observedMarqueeResizeTargets=typeof WeakSet==='function'?new WeakSet():null;
  function resolveMarqueeNodes(marquee){
    var track=marquee.querySelector('[data-st-rh-role="title-track"], [data-st-rh-role="inline-track"]');
    var segment=marquee.querySelector('[data-st-rh-role="title-segment"], [data-st-rh-role="inline-segment"]');
    if(!track||!segment)return null;
    return {track:track,segment:segment};
  }
  function refreshSingleMobileMarquee(marquee){
    var nodes=resolveMarqueeNodes(marquee);
    if(!nodes)return false;
    var track=nodes.track;
    var segment=nodes.segment;
    var visibleWidth=Math.ceil(marquee.clientWidth||marquee.getBoundingClientRect().width||0);
    var contentWidth=Math.ceil(segment.scrollWidth||segment.getBoundingClientRect().width||0);
    if(visibleWidth<=0||contentWidth<=0)return false;
    track.style.removeProperty('--st-rh-marquee-distance');
    track.style.removeProperty('--st-rh-marquee-duration');
    marquee.classList.remove('is-overflowing');
    var overflowWidth=contentWidth-visibleWidth;
    if(overflowWidth<=2)return true;
    marquee.classList.add('is-overflowing');
    track.style.setProperty('--st-rh-marquee-distance', '-' + overflowWidth + 'px');
    track.style.setProperty('--st-rh-marquee-duration', Math.max(6, Math.min(18, overflowWidth / 18 + 4)) + 's');
    return true;
  }
  function refreshMobileMarquee(){
    var marquees=document.querySelectorAll('[data-st-rh-role="title-marquee"], [data-st-rh-role="inline-marquee"]');
    marquees.forEach(function(marquee){
      refreshSingleMobileMarquee(marquee);
    });
  }
  function queueMobileMarqueeRefresh(){
    if(marqueeRefreshQueued)return;
    marqueeRefreshQueued=true;
    requestAnimationFrame(function(){
      refreshMobileMarquee();
      requestAnimationFrame(function(){
        refreshMobileMarquee();
        window.setTimeout(function(){
          marqueeRefreshQueued=false;
          refreshMobileMarquee();
        },120);
      });
    });
  }
  function observeMarqueeResizeTarget(target){
    if(!marqueeResizeObserver||!target)return;
    if(observedMarqueeResizeTargets&&observedMarqueeResizeTargets.has(target))return;
    if(observedMarqueeResizeTargets)observedMarqueeResizeTargets.add(target);
    marqueeResizeObserver.observe(target);
  }
  function observeMobileTitleMarqueeTargets(root){
    if(!root)return;
    if(root.nodeType===1&&root.matches&&root.matches('.st-rh-card-switch, [data-st-rh-role="title-marquee"], [data-st-rh-role="inline-marquee"]')){
      observeMarqueeResizeTarget(root);
    }
    if(!root.querySelectorAll)return;
    root.querySelectorAll('.st-rh-card-switch, [data-st-rh-role="title-marquee"], [data-st-rh-role="inline-marquee"]').forEach(function(target){
      observeMarqueeResizeTarget(target);
    });
  }
  function syncDetailsVariants(details,shouldOpen){
    var syncKey=details.getAttribute('data-st-rh-sync-key');
    if(!syncKey)return;
    var peers=document.querySelectorAll('details[data-st-rh-sync-key]');
    peers.forEach(function(peer){
      if(peer===details)return;
      if(peer.getAttribute('data-st-rh-sync-key')!==syncKey)return;
      var body=peer.querySelector('[data-st-rh-role="details-body"]');
      if(body){
        body.classList.remove('st-rh-anim-opening','st-rh-anim-closing');
      }
      if(shouldOpen){
        peer.setAttribute('open','');
      }else{
        peer.removeAttribute('open');
      }
    });
  }
  if(window.ResizeObserver){
    marqueeResizeObserver=new ResizeObserver(function(){
      queueMobileMarqueeRefresh();
    });
    observeMobileTitleMarqueeTargets(document);
  }
  queueMobileMarqueeRefresh();
  window.addEventListener('resize',queueMobileMarqueeRefresh,{passive:true});
  window.addEventListener('load',queueMobileMarqueeRefresh,{passive:true});
  if(document.fonts&&typeof document.fonts.ready==='object'&&typeof document.fonts.ready.then==='function'){
    document.fonts.ready.then(function(){
      queueMobileMarqueeRefresh();
    });
  }
  if(document.body&&window.MutationObserver){
    var mutationObserver=new MutationObserver(function(mutations){
      mutations.forEach(function(mutation){
        if(mutation.type!=='childList')return;
        mutation.addedNodes.forEach(function(node){
          if(!node||node.nodeType!==1)return;
          observeMobileTitleMarqueeTargets(node);
        });
      });
      queueMobileMarqueeRefresh();
    });
    mutationObserver.observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  document.addEventListener('click',function(e){
    var t=e.target;
    if(!t)return;
    if(t.closest&&t.closest('button'))return;
    var summary=t.closest?t.closest('[data-st-rh-role="summary"]'):null;
    if(!summary){
      if(t.tagName==='SUMMARY'&&t.getAttribute('data-st-rh-role')==='summary')summary=t;
      else if(t.parentElement&&t.parentElement.tagName==='SUMMARY')summary=t.parentElement;
      else return;
    }
    var d=summary.parentElement;
    if(!d||d.tagName!=='DETAILS')return;
    e.preventDefault();
    var b=d.querySelector('[data-st-rh-role="details-body"]');
    if(!b){d.open=!d.open;return}
    b.classList.remove('st-rh-anim-opening','st-rh-anim-closing');
    if(d.open){
      b.classList.add('st-rh-anim-closing');
      function cl(){b.removeEventListener('animationend',cl);b.classList.remove('st-rh-anim-closing');d.removeAttribute('open')}
      b.addEventListener('animationend',cl);
      syncDetailsVariants(d,false);
      setTimeout(function(){b.classList.remove('st-rh-anim-closing');if(d.open)d.removeAttribute('open')},300);
    }else{
      d.setAttribute('open','');
      syncDetailsVariants(d,true);
      b.classList.add('st-rh-anim-opening');
      function op(){b.removeEventListener('animationend',op);b.classList.remove('st-rh-anim-opening')}
      b.addEventListener('animationend',op);
      setTimeout(function(){b.classList.remove('st-rh-anim-opening')},350);
    }
  },true);
})();
`;
  doc.head.appendChild(script);
}

type CardTemplateVariantEvent = "desktop" | "mobile";

/**
 * 功能：为双模板卡片生成带变体后缀的详情区 ID。
 * @param detailsIdAttr 原始详情区 ID
 * @param variant 模板变体
 * @returns 带后缀的详情区 ID
 */
function buildVariantDetailsIdEvent(detailsIdAttr: string, variant: CardTemplateVariantEvent): string {
  return `${detailsIdAttr}-${variant}`;
}

/**
 * 功能：给模板中的 details 根节点补充双模板同步元数据。
 * @param html 已渲染的模板 HTML
 * @param syncKey 双模板同步键
 * @param variant 模板变体
 * @returns 注入同步属性后的 HTML
 */
function decorateDetailsTemplateHtmlEvent(
  html: string,
  syncKey: string,
  variant: CardTemplateVariantEvent
): string {
  return html.replace(
    /<details\b/,
    `<details data-st-rh-sync-key="${syncKey}" data-st-rh-template-variant="${variant}"`
  );
}

/**
 * 功能：构建桌面与手机双模板切换外壳。
 * @param switchClass 外壳附加类名
 * @param desktopHtml 桌面模板 HTML
 * @param mobileHtml 手机模板 HTML
 * @returns 双模板外壳 HTML
 */
function buildCardVariantSwitchTemplateEvent(
  switchClass: string,
  desktopHtml: string,
  mobileHtml: string
): string {
  return `<div class="st-rh-card-switch ${switchClass}">
    <div class="st-rh-card-variant st-rh-card-variant-desktop" data-st-rh-template-variant="desktop">${desktopHtml}</div>
    <div class="st-rh-card-variant st-rh-card-variant-mobile" data-st-rh-template-variant="mobile">${mobileHtml}</div>
  </div>`;
}

export interface EventListItemTemplateParamsEvent {
  detailsIdAttr: string;
  templateVariant?: CardTemplateVariantEvent;
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
  difficultyHtml: string;
  difficultyTitleAttr: string;
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

export interface EventRerollButtonTemplateParamsEvent {
  roundIdAttr: string;
  eventIdAttr: string;
  rollIdAttr: string;
  buttonTitleAttr: string;
}

function buildTipLabelTemplateEvent(label: string, tip: string): string {
  return `<span class="st-rh-tip-label" data-tip="${tip}">${label}</span>`;
}

function buildSummaryToggleStateTemplateEvent(): string {
  return `<span class="st-rh-summary-toggle-state" data-st-rh-role="toggle-state" aria-hidden="true">
            <span class="st-rh-toggle-closed"><i class="fa-solid fa-chevron-down fa-fw st-rh-fa-icon" style="margin-right:4px;"></i>展开详情</span>
            <span class="st-rh-toggle-open"><i class="fa-solid fa-chevron-up fa-fw st-rh-fa-icon" style="margin-right:4px;"></i>收起详情</span>
          </span>`
    .replace('class="st-rh-toggle-closed"', 'class="st-rh-toggle-closed" data-st-rh-role="toggle-closed"')
    .replace('class="st-rh-toggle-open"', 'class="st-rh-toggle-open" data-st-rh-role="toggle-open"');
}

export function buildEventRollButtonTemplateEvent(params: EventRollButtonTemplateParamsEvent): string {
  const stateStyleAttr = params.buttonStateStyle ? ` style="${params.buttonStateStyle}"` : "";
  return `<button type="button" class="st-rh-roll-btn" data-dice-event-roll="1" data-round-id="${params.roundIdAttr}"
  data-dice-event-id="${params.eventIdAttr}" data-dice-expr="${params.diceExprAttr}" ${params.buttonDisabledAttr}${stateStyleAttr}>
  <i class="fa-solid fa-dice-d20 fa-fw st-rh-fa-icon" aria-hidden="true" style="margin-right:6px; opacity:0.9;"></i>执行检定
</button>`;
}

/**
 * 功能：构建事件结果卡中的重新投掷按钮。
 * @param params 按钮所需的轮次、事件与提示信息
 * @returns 重新投掷按钮 HTML
 */
export function buildEventRerollButtonTemplateEvent(params: EventRerollButtonTemplateParamsEvent): string {
  return `<button type="button" class="st-rh-reroll-btn" data-dice-event-reroll="1" data-round-id="${params.roundIdAttr}"
  data-dice-event-id="${params.eventIdAttr}" data-roll-id="${params.rollIdAttr}" data-tip="${params.buttonTitleAttr}">
  <i class="fa-solid fa-rotate-right fa-fw st-rh-fa-icon" aria-hidden="true" style="margin-right:6px; opacity:0.92;"></i>重新投掷
</button>`;
}

export function buildEventListItemTemplateEvent(params: EventListItemTemplateParamsEvent): string {
  const templateVariant: CardTemplateVariantEvent = params.templateVariant ?? "desktop";
  const detailsIdAttr = buildVariantDetailsIdEvent(params.detailsIdAttr, templateVariant);
  const templateHtml =
    templateVariant === "mobile" ? eventListItemMobileTemplateHtml : eventListItemTemplateHtml;
  const modifierBadgeHtml = params.modifierTextHtml
    ? `<span class="st-rh-chip"><i class="fa-solid fa-calculator fa-fw st-rh-fa-icon st-rh-fact-label-icon" aria-hidden="true" style="margin-right: 6px; font-size: 0.85rem; color: #d8b87a; opacity: 0.9;"></i>${buildTipLabelTemplateEvent("修正：", "总修正 = 基础修正 + 技能修正 + 状态修正。")} <span class="st-rh-chip-highlight">${params.modifierTextHtml}</span></span>`
    : "";
  const rollActionHtml = params.rollButtonHtml
    ? params.rollButtonHtml
    : `<span class="st-rh-summary-lock st-rh-mono"><i class="fa-solid fa-lock fa-fw st-rh-fa-icon" style="margin-right:6px;"></i>已锁定</span>`;
  const dcReasonHtml = params.dcReasonHtml ? `<div class="st-rh-dc-reason">${params.dcReasonHtml}</div>` : "";
  const renderedHtml = renderHtmlTemplateEvent(templateHtml, {
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
    details_id_attr: detailsIdAttr,
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
    tip_label_difficulty_html: buildTipLabelTemplateEvent("难度", "系统建议优先由难度等级推导阈值，以避免不可达的判定条件。"),
    difficulty_html: params.difficultyHtml,
    difficulty_title_attr: params.difficultyTitleAttr,
    tip_label_condition_html: buildTipLabelTemplateEvent("条件", "将掷骰总值与 DC 按比较符进行判定。"),
    compare_html: params.compareHtml,
    dc_text: params.dcText,
    tip_label_time_html: buildTipLabelTemplateEvent("时限", "超时未检定时，系统会按对应规则自动处理。"),
    modifier_badge_html: modifierBadgeHtml,
    dc_reason_html: dcReasonHtml,
    rolled_block_html: params.rolledBlockHtml,
    command_text_html: params.commandTextHtml,
  });
  return decorateDetailsTemplateHtmlEvent(renderedHtml, params.detailsIdAttr, templateVariant);
}

export function buildEventListCardTemplateEvent(
  roundIdHtml: string,
  desktopItemsHtml: string,
  mobileItemsHtml: string = desktopItemsHtml
): string {
  const desktopHtml = renderHtmlTemplateEvent(eventListCardTemplateHtml, {
    round_id_html: roundIdHtml,
    items_html: desktopItemsHtml,
  });
  const mobileHtml = renderHtmlTemplateEvent(eventListCardMobileTemplateHtml, {
    round_id_html: roundIdHtml,
    items_html: mobileItemsHtml,
  });
  return buildCardVariantSwitchTemplateEvent("st-rh-card-switch-event-board", desktopHtml, mobileHtml);
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
  rerollActionHtml: string;
  rollIdHtml: string;
  titleHtml: string;
  eventIdHtml: string;
  sourceHtml: string;
  targetHtml: string;
  skillHtml: string;
  skillTitleAttr: string;
  advantageStateHtml: string;
  difficultyHtml: string;
  difficultyTitleAttr: string;
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
  outcomeToneClassName: string;
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
  extraClasses?: string,
  tipAttr?: string
): string {
  if (!String(textHtml ?? "").trim()) return "";
  const tipDataAttr = tipAttr ? ` data-tip="${tipAttr}"` : "";
  return `<span class="${joinClassNamesTemplateEvent(
    "st-rh-status-pill st-rh-inline-chip st-rh-status-badge",
    extraClasses
  )}" style="--st-rh-status-color:${color};"${tipDataAttr}>${textHtml}</span>`;
}

function getSettlementStatusToneClassTemplateEvent(statusText: string): string {
  if (statusText.includes("失败")) return "st-rh-settlement-status-failure";
  if (statusText.includes("成功")) return "st-rh-settlement-status-success";
  return "st-rh-settlement-status-pending";
}

function buildSettlementChipTemplateEvent(
  innerHtml: string,
  options?: {
    classes?: string;
    strong?: boolean;
    tipAttr?: string;
    iconClass?: string;
  }
): string {
  if (!String(innerHtml ?? "").trim()) return "";
  const tipAttr = options?.tipAttr ? ` data-tip="${options.tipAttr}"` : "";
  const iconHtml = options?.iconClass ? `<i class="${options.iconClass} fa-fw st-rh-chip-icon" aria-hidden="true"></i>` : "";
  return `<span class="${joinClassNamesTemplateEvent(
    options?.strong
      ? "st-rh-chip-strong st-rh-inline-chip st-rh-inline-chip-gap"
      : "st-rh-chip-soft st-rh-inline-chip st-rh-inline-chip-gap",
    options?.classes
  )}"${tipAttr}>${iconHtml}${innerHtml}</span>`;
}

function buildSettlementPreviewChipTemplateEvent(
  textHtml: string,
  titleAttr: string,
  chipClassName: string,
  extraClasses?: string,
  iconClass?: string
): string {
  if (!String(textHtml ?? "").trim()) return "";
  const allClasses = joinClassNamesTemplateEvent(
    "st-rh-chip-soft st-rh-inline-chip st-rh-inline-chip-gap st-rh-inline-chip-fluid",
    chipClassName,
    extraClasses
  );
  const iconHtml = iconClass ? `<i class="${iconClass} fa-fw st-rh-chip-icon" aria-hidden="true"></i>` : "";

  return `<span class="${allClasses}">${iconHtml}${textHtml}</span>`;
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

/**
 * 功能：构建走向面板页脚信息条目。
 * @param labelText 条目标识文本
 * @param valueHtml 条目正文 HTML
 * @param extraClasses 额外样式类名
 * @returns 页脚信息条目 HTML；无内容时返回空字符串
 */
function buildOutcomeStripItemTemplateEvent(
  labelText: string,
  valueHtml: string,
  extraClasses?: string
): string {
  if (!String(valueHtml ?? "").trim()) return "";
  return `<div class="${joinClassNamesTemplateEvent("st-rh-outcome-strip-item", extraClasses)}">
    <span class="st-rh-outcome-strip-label">${labelText}</span>
    <span class="st-rh-outcome-strip-value">${valueHtml}</span>
  </div>`;
}

/**
 * 功能：构建结算卡的剧情走向卷轴面板。
 * @param params 走向面板所需的文案与样式参数
 * @returns 专用走向面板 HTML；无正文时返回空字符串
 */
function buildSettlementOutcomePanelTemplateEvent(params: {
  kickerText: string;
  toneClassName: string;
  outcomeTextHtml: string;
  statusImpactHtml: string;
  outcomeStatusSummaryHtml: string;
  currentStatusesHtml: string;
}): string {
  if (!String(params.outcomeTextHtml ?? "").trim()) return "";

  const normalizedStatusesText = String(params.currentStatusesHtml ?? "").trim();
  const stripHtml = [
    buildOutcomeStripItemTemplateEvent("判定影响", params.statusImpactHtml),
    buildOutcomeStripItemTemplateEvent("状态变化", params.outcomeStatusSummaryHtml),
    buildOutcomeStripItemTemplateEvent(
      "当前状态",
      params.currentStatusesHtml,
      normalizedStatusesText === "无" ? "st-rh-outcome-strip-item-muted" : ""
    ),
  ]
    .filter(Boolean)
    .join("");

  return `<section class="${joinClassNamesTemplateEvent(
    "st-rh-panel st-rh-info-panel st-rh-outcome-panel",
    params.toneClassName
  )}">
    <div class="st-rh-outcome-head">
      <span class="st-rh-outcome-head-line" aria-hidden="true"></span>
      <span class="st-rh-outcome-head-seal" aria-hidden="true"></span>
      <p class="st-rh-kicker st-rh-outcome-kicker">${params.kickerText}</p>
      <span class="st-rh-outcome-head-seal" aria-hidden="true"></span>
      <span class="st-rh-outcome-head-line" aria-hidden="true"></span>
    </div>
    <div class="st-rh-outcome-scroll">
      <div class="st-rh-outcome-copy">${params.outcomeTextHtml}</div>
    </div>
    ${stripHtml ? `<div class="st-rh-outcome-status-strip">${stripHtml}</div>` : ""}
  </section>`;
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
  showVisual?: boolean;
}): string {
  const visualHtml = String(params.diceVisualBlockHtml ?? "").trim()
    ? params.diceVisualBlockHtml
    : `<div class="st-rh-empty-visual">${params.emptyVisualHint}</div>`;
  return `<div class="st-rh-panel st-rh-result-core">
    ${params.showVisual === false ? "" : `<div class="st-rh-result-visual">
      ${visualHtml}
    </div>`}
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

/**
 * 功能：构建结果卡中“判定拆解”的掷骰摘要。
 * @param rollsHtml 原始骰面展示 HTML
 * @param modifierHtml 修正值展示 HTML
 * @param selectionHtml 优劣骰保留/舍弃说明 HTML
 * @returns 掷骰摘要 HTML
 */
export function buildRollsSummaryTemplateEvent(
  rollsHtml: string,
  modifierHtml: string,
  selectionHtml = ""
): string {
  const selectionSegment = String(selectionHtml ?? "").trim()
    ? `<span class="st-rh-inline-divider">•</span>
    <span class="st-rh-meta-text">${selectionHtml}</span>`
    : "";
  return `<span class="st-rh-mono st-rh-title-text">[${rollsHtml}]</span>
    ${selectionSegment}
    <span class="st-rh-inline-divider">•</span>
    <span class="st-rh-meta-text">修正：</span>
    <span class="st-rh-mono st-rh-emphasis-text">${modifierHtml}</span>`;
}

export function buildEventRollResultCardTemplateEvent(params: EventRollResultCardTemplateParamsEvent): string {
  const statusToneClass = getSettlementStatusToneClassTemplateEvent(params.statusText);
  const summaryStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(
    params.collapsedStatusHtml,
    params.statusColor,
    undefined,
    "本次结算的最终判定结果。"
  );
  const detailsStatusBadgeHtml = buildSettlementStatusBadgeTemplateEvent(params.statusText, params.statusColor);
  const summaryPrimaryChipsHtml = [
    buildSettlementChipTemplateEvent(
      `总点 <span class="st-rh-mono st-rh-title-text">${params.collapsedTotalHtml}</span>`,
      {
        strong: true,
        iconClass: "fa-solid fa-dice-d20",
        tipAttr: "最终总点数，通常由骰面结果与各类修正共同组成。",
      }
    ),
    buildSettlementChipTemplateEvent(`<span class="st-rh-mono">${params.collapsedConditionHtml}</span>`, {
      iconClass: "fa-solid fa-bullseye",
      tipAttr: "结算时用于比较总点与 DC 的判定条件。",
    }),
  ]
    .filter(Boolean)
    .join("");
  const summarySecondaryChipsHtml = [
    buildSettlementChipTemplateEvent(params.collapsedSourceHtml, { iconClass: "fa-solid fa-user-pen" }),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedOutcomeHtml,
      params.collapsedOutcomeTitleAttr,
      params.collapsedOutcomeChipClassName || "st-rh-summary-chip-outcome",
      "",
      "fa-solid fa-scroll"
    ),
    buildSettlementPreviewChipTemplateEvent(
      params.collapsedStatusSummaryHtml,
      params.collapsedStatusSummaryTitleAttr,
      params.collapsedStatusSummaryChipClassName || "st-rh-summary-chip-status-summary",
      "",
      "fa-solid fa-bolt-lightning"
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
      buildTipLabelTemplateEvent("难度", "系统建议优先由难度等级自动换算阈值，避免出现理论不可达的判定条件。"),
      params.difficultyTitleAttr
        ? `<span data-tip="${params.difficultyTitleAttr}">${params.difficultyHtml}</span>`
        : params.difficultyHtml
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
  const outcomeSectionHtml = buildSettlementOutcomePanelTemplateEvent({
    kickerText: params.outcomeLabelHtml,
    toneClassName: params.outcomeToneClassName,
    outcomeTextHtml: params.outcomeTextHtml,
    statusImpactHtml: params.statusImpactHtml,
    outcomeStatusSummaryHtml: params.outcomeStatusSummaryHtml,
    currentStatusesHtml: params.currentStatusesHtml,
  });
  const summaryResultCoreHtml = buildSettlementResultCoreTemplateEvent({
    kickerText: "结算结果",
    totalText: params.totalText,
    statusText: params.statusText,
    statusColor: params.statusColor,
    compareHtml: params.compareHtml,
    dcText: params.dcText,
    diceVisualBlockHtml: params.diceVisualBlockHtml,
    timeLimitHtml: params.timeLimitHtml,
    emptyVisualHint: "本次结算未生成骰面可视化。",
    showVisual: false,
  });
  const detailResultCoreHtml = buildSettlementResultCoreTemplateEvent({
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

  const desktopHtml = decorateDetailsTemplateHtmlEvent(
    renderHtmlTemplateEvent(eventRollResultCardTemplateHtml, {
    shell_type_class: `st-rh-settlement-shell-result ${statusToneClass}`,
    dice_slot_type_class: "st-rh-summary-dice-slot-result",
    details_layout_type_class: "st-rh-details-layout-result",
    summary_kicker_text: "检定结果",
    title_html: params.titleHtml,
    roll_id_html: params.rollIdHtml,
    summary_status_badge_html: summaryStatusBadgeHtml,
    summary_primary_chips_html: summaryPrimaryChipsHtml,
    summary_secondary_chips_html: summarySecondaryChipsHtml,
    summary_dice_visual_html: buildSettlementSummaryVisualTemplateEvent(params.collapsedDiceVisualHtml, "ROLL"),
    summary_toggle_html: `${params.rerollActionHtml}${buildSummaryToggleStateTemplateEvent()}`,
    details_id_attr: buildVariantDetailsIdEvent(params.detailsIdAttr, "desktop"),
    details_kicker_text: "结果档案",
    details_heading_html: params.titleHtml,
    details_status_badge_html: detailsStatusBadgeHtml,
    detail_meta_html: detailMetaHtml,
    outcome_section_html: outcomeSectionHtml,
    footer_blocks_html: "",
    summary_result_core_html: summaryResultCoreHtml,
    detail_result_core_html: detailResultCoreHtml,
    detail_aux_html: detailAuxHtml,
    }),
    params.detailsIdAttr,
    "desktop"
  );
  const mobileHtml = decorateDetailsTemplateHtmlEvent(
    renderHtmlTemplateEvent(eventRollResultCardMobileTemplateHtml, {
    shell_type_class: `st-rh-settlement-shell-result ${statusToneClass}`,
    dice_slot_type_class: "st-rh-summary-dice-slot-result",
    details_layout_type_class: "st-rh-details-layout-result",
    summary_kicker_text: "检定结果",
    title_html: params.titleHtml,
    roll_id_html: params.rollIdHtml,
    summary_status_badge_html: summaryStatusBadgeHtml,
    summary_primary_chips_html: summaryPrimaryChipsHtml,
    summary_secondary_chips_html: summarySecondaryChipsHtml,
    summary_dice_visual_html: buildSettlementSummaryVisualTemplateEvent(params.collapsedDiceVisualHtml, "ROLL"),
    summary_toggle_html: `${params.rerollActionHtml}${buildSummaryToggleStateTemplateEvent()}`,
    details_id_attr: buildVariantDetailsIdEvent(params.detailsIdAttr, "mobile"),
    details_kicker_text: "结果档案",
    details_heading_html: params.titleHtml,
    details_status_badge_html: detailsStatusBadgeHtml,
    detail_meta_html: detailMetaHtml,
    outcome_section_html: outcomeSectionHtml,
    footer_blocks_html: "",
    summary_result_core_html: summaryResultCoreHtml,
    detail_result_core_html: detailResultCoreHtml,
    detail_aux_html: detailAuxHtml,
    }),
    params.detailsIdAttr,
    "mobile"
  );
  return buildCardVariantSwitchTemplateEvent("st-rh-card-switch-settlement st-rh-card-switch-result", desktopHtml, mobileHtml);
}
