import { buildSettingPageStyles, buildSettingPageTemplate, hydrateSettingPage } from '../../../_Components/Setting';
import { buildSharedCheckboxCard, buildSharedCheckboxStyles } from '../../../_Components/sharedCheckbox';
import { buildSharedButton, buildSharedButtonStyles } from '../../../_Components/sharedButton';
import { buildSharedInputField, buildSharedInputStyles } from '../../../_Components/sharedInput';
import { buildThemeVars } from '../../../SDK/theme';
import { logger } from '../runtime/runtime-services';
import { openUnifiedMemoryWorkbench } from './unifiedMemoryWorkbench';
import { DEFAULT_MEMORY_OS_SETTINGS, type MemoryOSSettings, readMemoryOSSettings, writeMemoryOSSettings } from '../settings/store';

const CARD_ID = 'stx-memoryos-card';
const STYLE_ID = 'stx-memoryos-settings-style';
const DRAWER_TOGGLE_ID = 'stx-memoryos-drawer-toggle';
const DRAWER_CONTENT_ID = 'stx-memoryos-drawer-content';
const DRAWER_ICON_ID = 'stx-memoryos-drawer-icon';
const BTN_ID = 'stx-memoryos-open-workbench';
const RESET_BTN_ID = 'stx-memoryos-reset-settings';
const STATUS_ID = 'stx-memoryos-settings-status';
const TAB_GENERAL_ID = 'stx-memoryos-tab-general';
const TAB_MEMORY_ID = 'stx-memoryos-tab-memory';
const TAB_INJECTION_ID = 'stx-memoryos-tab-injection';
const TAB_PIPELINE_ID = 'stx-memoryos-tab-pipeline';
const PANEL_GENERAL_ID = 'stx-memoryos-panel-general';
const PANEL_MEMORY_ID = 'stx-memoryos-panel-memory';
const PANEL_INJECTION_ID = 'stx-memoryos-panel-injection';
const PANEL_PIPELINE_ID = 'stx-memoryos-panel-pipeline';
const ENABLED_ID = 'stx-memoryos-enabled';
const TOOLBAR_QUICK_ACTIONS_ID = 'stx-memoryos-toolbar-quick-actions-enabled';
const COLD_START_ENABLED_ID = 'stx-memoryos-cold-start-enabled';
const TAKEOVER_ENABLED_ID = 'stx-memoryos-takeover-enabled';
const SUMMARY_AUTO_TRIGGER_ID = 'stx-memoryos-summary-auto-trigger';
const SUMMARY_PROGRESS_OVERLAY_ID = 'stx-memoryos-summary-progress-overlay-enabled';
const SUMMARY_INTERVAL_ID = 'stx-memoryos-summary-interval-floors';
const SUMMARY_MIN_MESSAGES_ID = 'stx-memoryos-summary-min-messages';
const SUMMARY_RECENT_WINDOW_ID = 'stx-memoryos-summary-recent-window';
const SUMMARY_SECOND_STAGE_ROLLING_DIGEST_MAX_CHARS_ID = 'stx-memoryos-summary-second-stage-rolling-digest-max-chars';
const SUMMARY_SECOND_STAGE_CANDIDATE_SUMMARY_MAX_CHARS_ID = 'stx-memoryos-summary-second-stage-candidate-summary-max-chars';
const TAKEOVER_DETECT_MIN_FLOORS_ID = 'stx-memoryos-takeover-detect-min-floors';
const TAKEOVER_DEFAULT_RECENT_FLOORS_ID = 'stx-memoryos-takeover-default-recent-floors';
const TAKEOVER_DEFAULT_BATCH_SIZE_ID = 'stx-memoryos-takeover-default-batch-size';
const TAKEOVER_REQUEST_INTERVAL_SECONDS_ID = 'stx-memoryos-takeover-request-interval-seconds';
const TAKEOVER_DEFAULT_PRIORITIZE_RECENT_ID = 'stx-memoryos-takeover-default-prioritize-recent';
const TAKEOVER_DEFAULT_AUTO_CONTINUE_ID = 'stx-memoryos-takeover-default-auto-continue';
const TAKEOVER_DEFAULT_AUTO_CONSOLIDATE_ID = 'stx-memoryos-takeover-default-auto-consolidate';
const TAKEOVER_DEFAULT_PAUSE_ON_ERROR_ID = 'stx-memoryos-takeover-default-pause-on-error';
const INJECTION_PROMPT_ID = 'stx-memoryos-injection-prompt-enabled';
const INJECTION_PREVIEW_ID = 'stx-memoryos-injection-preview-enabled';
const CONTEXT_TOKENS_ID = 'stx-memoryos-context-max-tokens';
const RETRIEVAL_MODE_ID = 'stx-memoryos-retrieval-mode';
const RETRIEVAL_DEFAULT_TOPK_ID = 'stx-memoryos-retrieval-default-topk';
const RETRIEVAL_DEFAULT_EXPAND_DEPTH_ID = 'stx-memoryos-retrieval-default-expand-depth';
const RETRIEVAL_ENABLE_PAYLOAD_FILTER_ID = 'stx-memoryos-retrieval-enable-payload-filter';
const RETRIEVAL_ENABLE_GRAPH_EXPANSION_ID = 'stx-memoryos-retrieval-enable-graph-expansion';
const RETRIEVAL_ENABLE_GRAPH_PENALTY_ID = 'stx-memoryos-retrieval-enable-graph-penalty';
const RETRIEVAL_ENABLE_QUERY_CONTEXT_BUILDER_ID = 'stx-memoryos-retrieval-enable-query-context-builder';
const RETRIEVAL_LOG_ENABLED_ID = 'stx-memoryos-retrieval-log-enabled';
const RETRIEVAL_TRACE_PANEL_ID = 'stx-memoryos-retrieval-trace-panel-enabled';
const RETRIEVAL_LOG_LEVEL_ID = 'stx-memoryos-retrieval-log-level';
const RETRIEVAL_RULE_PACK_ID = 'stx-memoryos-retrieval-rule-pack';
const VECTOR_TOPK_ID = 'stx-memoryos-vector-topk';
const VECTOR_DEEP_WINDOW_ID = 'stx-memoryos-vector-deep-window';
const VECTOR_FINAL_TOPK_ID = 'stx-memoryos-vector-final-topk';
const VECTOR_ENABLE_STRATEGY_ROUTING_ID = 'stx-memoryos-vector-enable-strategy-routing';
const VECTOR_ENABLE_RERANK_ID = 'stx-memoryos-vector-enable-rerank';
const VECTOR_RERANK_WINDOW_ID = 'stx-memoryos-vector-rerank-window';
const VECTOR_EMBEDDING_MODEL_ID = 'stx-memoryos-vector-embedding-model';
const VECTOR_EMBEDDING_VERSION_ID = 'stx-memoryos-vector-embedding-version';
const VECTOR_AUTO_INDEX_ON_WRITE_ID = 'stx-memoryos-vector-auto-index-on-write';
const VECTOR_ENABLE_LLMHUB_RERANK_ID = 'stx-memoryos-vector-enable-llmhub-rerank';
const VECTOR_LLMHUB_RERANK_RESOURCE_ID = 'stx-memoryos-vector-llmhub-rerank-resource';
const VECTOR_LLMHUB_RERANK_MODEL_ID = 'stx-memoryos-vector-llmhub-rerank-model';
const VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID = 'stx-memoryos-vector-llmhub-rerank-min-candidates';
const VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID = 'stx-memoryos-vector-llmhub-rerank-max-candidates';
const VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID = 'stx-memoryos-vector-llmhub-rerank-fallback-to-rule';
const PIPELINE_BUDGET_ENABLED_ID = 'stx-memoryos-pipeline-budget-enabled';
const PIPELINE_MAX_INPUT_CHARS_ID = 'stx-memoryos-pipeline-max-input-chars';
const PIPELINE_MAX_OUTPUT_ITEMS_ID = 'stx-memoryos-pipeline-max-output-items';
const PIPELINE_MAX_ACTIONS_ID = 'stx-memoryos-pipeline-max-actions';
const PIPELINE_MAX_SECTION_BATCHES_ID = 'stx-memoryos-pipeline-max-section-batches';
const PIPELINE_MAX_CONFLICT_BUCKET_ID = 'stx-memoryos-pipeline-max-conflict-bucket';
const PIPELINE_MAX_SECTION_DIGEST_ID = 'stx-memoryos-pipeline-max-section-digest';
const PIPELINE_MAX_FINALIZER_ITEMS_ID = 'stx-memoryos-pipeline-max-finalizer-items';
const PIPELINE_STAGING_RETENTION_DAYS_ID = 'stx-memoryos-pipeline-staging-retention-days';
const PIPELINE_RESOLVE_UNRESOLVED_ONLY_ID = 'stx-memoryos-pipeline-resolve-unresolved-only';

type TabKey = 'general' | 'memory' | 'injection' | 'pipeline';
type TabBinding = { key: TabKey; tabId: string; panelId: string };

const TABS: TabBinding[] = [
    { key: 'general', tabId: TAB_GENERAL_ID, panelId: PANEL_GENERAL_ID },
    { key: 'memory', tabId: TAB_MEMORY_ID, panelId: PANEL_MEMORY_ID },
    { key: 'injection', tabId: TAB_INJECTION_ID, panelId: PANEL_INJECTION_ID },
    { key: 'pipeline', tabId: TAB_PIPELINE_ID, panelId: PANEL_PIPELINE_ID },
];

let isSyncingForm = false;
let autoSaveTimer: number | null = null;

/**
 * 功能：构建分隔栏。
 * @param title 标题。
 * @returns HTML。
 */
function divider(title: string): string {
    return `<div class="stx-ui-divider"><span>${title}</span><span class="stx-ui-divider-line"></span></div>`;
}

/**
 * 功能：构建数字输入框。
 * @param id 控件 ID。
 * @param min 最小值。
 * @param max 最大值。
 * @param step 步长。
 * @returns HTML。
 */
function numberField(id: string, min: number, max: number, step: number): string {
    return buildSharedInputField({ id, type: 'number', className: 'stx-ui-input', attributes: { min, max, step } });
}

/**
 * 功能：构建仅显示控件的复选框。
 * @param id 控件 ID。
 * @param ariaLabel 无障碍标签。
 * @returns HTML。
 */
function inlineCheckbox(id: string, ariaLabel: string): string {
    return buildSharedCheckboxCard({ id, title: '', containerClassName: 'stx-ui-inline-checkbox is-control-only', inputAttributes: { 'aria-label': ariaLabel } });
}

/**
 * 功能：写入设置页样式，标签与分隔栏对齐 LLMHub。
 */
function ensureSettingsStyles(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        ${buildThemeVars(`#${CARD_ID} .stx-setting-content`)}
        ${buildSettingPageStyles(`#${CARD_ID}`)}
        ${buildSharedCheckboxStyles(`#${CARD_ID}`)}
        ${buildSharedButtonStyles(`#${CARD_ID}`)}
        ${buildSharedInputStyles(`#${CARD_ID}`)}
        #${CARD_ID}{margin-bottom:5px;color:inherit;}
        #${CARD_ID} .stx-setting-content{border:1px solid var(--ss-theme-border,rgba(255,255,255,.08));border-top:0;border-radius:0 0 10px 10px;padding:10px;background:var(--ss-theme-surface-1,rgba(0,0,0,.16));backdrop-filter:var(--ss-theme-backdrop-filter,blur(3px));box-sizing:border-box;width:100%;max-width:100%;overflow-x:hidden;}
        #${CARD_ID} .stx-ui-tabs{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-start;padding:4px;border:1px solid var(--ss-theme-border,rgba(255,255,255,.16));border-radius:999px;margin-bottom:10px;background:var(--ss-theme-surface-2,rgba(0,0,0,.2));}
        #${CARD_ID} .stx-ui-tab{flex:1 1 0;min-width:max-content;border:0;border-radius:999px;background:transparent;color:inherit;padding:6px 10px;font-size:12px;line-height:1.2;white-space:nowrap;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;opacity:.75;transition:background-color .2s ease,opacity .2s ease,box-shadow .2s ease;}
        #${CARD_ID} .stx-ui-tab.is-active{opacity:1;color:var(--ss-theme-text,inherit);background:var(--ss-theme-list-item-active-bg,rgba(197,160,89,.58));}
        #${CARD_ID} .stx-ui-tab:hover{background:var(--ss-theme-list-item-hover-bg,rgba(197,160,89,.2));box-shadow:0 0 12px color-mix(in srgb,var(--ss-theme-accent,#c5a059) 24%,transparent);}
        #${CARD_ID} .stx-ui-panel{display:flex;flex-direction:column;gap:10px;min-width:0;max-width:100%;}
        #${CARD_ID} .stx-ui-panel[hidden]{display:none!important;}
        #${CARD_ID} .stx-ui-divider{display:flex;align-items:center;gap:8px;margin-top:8px;margin-bottom:6px;font-size:13px;font-weight:700;opacity:.95;}
        #${CARD_ID} .stx-ui-divider-line{flex:1;height:1px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.2) 18%,rgba(255,255,255,.26) 50%,rgba(255,255,255,.2) 82%,rgba(255,255,255,0));}
        #${CARD_ID} .stx-ui-item{border:1px solid var(--ss-theme-border,rgba(255,255,255,.2));border-radius:10px;padding:12px;margin:2px 0;background:var(--ss-theme-surface-2,rgba(0,0,0,.16));display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;max-width:100%;box-sizing:border-box;transition:border-color .2s ease,background-color .2s ease,box-shadow .2s ease;}
        #${CARD_ID} .stx-ui-item:hover{border-color:var(--ss-theme-border-strong,rgba(197,160,89,.48));background:var(--ss-theme-list-item-hover-bg,rgba(0,0,0,.24));}
        #${CARD_ID} .stx-ui-item-stack{flex-direction:column;align-items:stretch;}
        #${CARD_ID} .stx-ui-item-main{min-width:0;flex:1;width:100%;}
        #${CARD_ID} .stx-ui-item-title{font-size:14px;font-weight:700;margin-bottom:3px;overflow-wrap:anywhere;}
        #${CARD_ID} .stx-ui-item-desc{font-size:12px;line-height:1.45;opacity:.75;word-break:break-word;overflow-wrap:anywhere;}
        #${CARD_ID} .stx-ui-inline{display:flex;align-items:center;gap:8px;flex-shrink:0;}
        #${CARD_ID} .stx-ui-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;width:100%;min-width:0;max-width:100%;}
        #${CARD_ID} .stx-ui-field{display:flex;flex-direction:column;gap:6px;min-width:0;}
        #${CARD_ID} .stx-ui-field-label{font-size:12px;opacity:.85;line-height:1.35;word-break:break-word;}
        #${CARD_ID} .stx-ui-field-hint{font-size:11px;opacity:.68;margin-top:2px;display:block;}
        #${CARD_ID} .stx-ui-input{width:100%;min-width:0;max-width:100%;box-sizing:border-box;min-height:30px;background:var(--ss-theme-surface-2,var(--SmartThemeBlurTintColor,rgba(0,0,0,.28)));color:inherit;border:1px solid rgba(197,160,89,.36);border-radius:8px;transition:border-color .2s ease,box-shadow .2s ease,background-color .2s ease;}
        #${CARD_ID} .stx-ui-input:hover{border-color:var(--ss-theme-border-strong,rgba(197,160,89,.58));background-color:var(--ss-theme-surface-3,rgba(0,0,0,.34));box-shadow:0 0 0 1px var(--ss-theme-focus-ring,rgba(197,160,89,.18));}
        #${CARD_ID} .stx-ui-input:focus{border-color:var(--ss-theme-border-strong,rgba(197,160,89,.72));box-shadow:0 0 0 2px var(--ss-theme-focus-ring,rgba(197,160,89,.22));}
        #${CARD_ID} .stx-ui-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;}
        #${CARD_ID} .stx-ui-status{font-size:12px;opacity:.84;}
        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-copy{display:none;}
        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-body{width:auto;}
        #${CARD_ID} .stx-ui-inline-checkbox.is-control-only .stx-shared-checkbox-control{min-width:70px;justify-content:center;}
        @media (max-width:900px){#${CARD_ID} .stx-ui-form-grid{grid-template-columns:minmax(0,1fr);}#${CARD_ID} .stx-ui-tabs,#${CARD_ID} .stx-ui-actions{justify-content:flex-start;}}
    `;
    document.head.appendChild(style);
}

/**
 * 功能：构建设置页主体。
 * @returns HTML。
 */
function buildSettingsContentHtml(): string {
    const openWorkbenchBtn = buildSharedButton({ id: BTN_ID, label: '打开统一记忆工作台', variant: 'secondary', iconClassName: 'fa-solid fa-table-cells-large' });
    const resetBtn = buildSharedButton({ id: RESET_BTN_ID, label: '恢复默认', variant: 'secondary', iconClassName: 'fa-solid fa-rotate-left' });
    const retrievalLogLevelSelect = `<select id="${RETRIEVAL_LOG_LEVEL_ID}" class="stx-ui-input"><option value="info">信息级</option><option value="debug">调试级</option></select>`;
    const retrievalRulePackSelect = `<select id="${RETRIEVAL_RULE_PACK_ID}" class="stx-ui-input"><option value="hybrid">混合规则包</option><option value="native">原生规则包</option><option value="perocore">PeroCore 兼容包</option></select>`;
    const retrievalModeSelect = `<select id="${RETRIEVAL_MODE_ID}" class="stx-ui-input"><option value="lexical_only">仅词法检索</option><option value="vector_only">仅向量检索</option><option value="hybrid">混合检索</option></select>`;
    return `
        <div class="stx-ui-tabs">
            <button id="${TAB_GENERAL_ID}" type="button" class="stx-ui-tab is-active"><i class="fa-solid fa-sliders"></i><span>通用</span></button>
            <button id="${TAB_MEMORY_ID}" type="button" class="stx-ui-tab"><i class="fa-solid fa-brain"></i><span>记忆流程</span></button>
            <button id="${TAB_INJECTION_ID}" type="button" class="stx-ui-tab"><i class="fa-solid fa-wand-magic-sparkles"></i><span>注入检索</span></button>
            <button id="${TAB_PIPELINE_ID}" type="button" class="stx-ui-tab"><i class="fa-solid fa-diagram-project"></i><span>预算诊断</span></button>
        </div>
        <div id="${PANEL_GENERAL_ID}" class="stx-ui-panel">
            ${divider('通用控制')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">统一记忆工作台</div><div class="stx-ui-item-desc">进入统一工作台，管理条目、类型、角色、世界实体和接管测试能力。</div></div><div class="stx-ui-inline">${openWorkbenchBtn}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用 MemoryOS</div><div class="stx-ui-item-desc">关闭后将停止消息写入、自动总结、注入和相关后台流程。</div></div><div class="stx-ui-inline">${inlineCheckbox(ENABLED_ID, '启用 MemoryOS')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用工具栏快捷按钮</div><div class="stx-ui-item-desc">在发送区上方显示快捷按钮，便于快速打开 MemoryOS 浮层和工作台。</div></div><div class="stx-ui-inline">${inlineCheckbox(TOOLBAR_QUICK_ACTIONS_ID, '启用工具栏快捷按钮')}</div></div>
            ${divider('会话初始化')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用冷启动</div><div class="stx-ui-item-desc">新会话时自动弹出冷启动确认，基于角色卡和世界书生成初始记忆。</div></div><div class="stx-ui-inline">${inlineCheckbox(COLD_START_ENABLED_ID, '启用冷启动')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用旧聊天接管</div><div class="stx-ui-item-desc">聊天楼层较多时自动提示创建接管任务，并在后台按批整理历史记忆。</div></div><div class="stx-ui-inline">${inlineCheckbox(TAKEOVER_ENABLED_ID, '启用旧聊天接管')}</div></div>
        </div>
        <div id="${PANEL_MEMORY_ID}" class="stx-ui-panel" hidden>
            ${divider('AI 总结')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用自动总结触发</div><div class="stx-ui-item-desc">到达阈值后自动运行 AI 总结，关闭后只保留手动触发。</div></div><div class="stx-ui-inline">${inlineCheckbox(SUMMARY_AUTO_TRIGGER_ID, '启用自动总结触发')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用总结进度悬浮框</div><div class="stx-ui-item-desc">显示距离下次自动总结还差多少楼层，并在即将触发时给出提示。</div></div><div class="stx-ui-inline">${inlineCheckbox(SUMMARY_PROGRESS_OVERLAY_ID, '启用总结进度悬浮框')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">总结窗口参数</div><div class="stx-ui-item-desc">控制触发频率、最小消息量和第二阶段摘要截断策略。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${SUMMARY_INTERVAL_ID}">触发间隔楼层</label>${numberField(SUMMARY_INTERVAL_ID,1,200,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${SUMMARY_MIN_MESSAGES_ID}">最少消息数</label>${numberField(SUMMARY_MIN_MESSAGES_ID,2,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${SUMMARY_RECENT_WINDOW_ID}">最近窗口大小</label>${numberField(SUMMARY_RECENT_WINDOW_ID,10,100,5)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${SUMMARY_SECOND_STAGE_ROLLING_DIGEST_MAX_CHARS_ID}">第二阶段 rollingDigest 截断长度</label>${numberField(SUMMARY_SECOND_STAGE_ROLLING_DIGEST_MAX_CHARS_ID,0,10000,20)}<span class="stx-ui-field-hint">填 0 表示不限制。</span></div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${SUMMARY_SECOND_STAGE_CANDIDATE_SUMMARY_MAX_CHARS_ID}">第二阶段候选摘要截断长度</label>${numberField(SUMMARY_SECOND_STAGE_CANDIDATE_SUMMARY_MAX_CHARS_ID,0,10000,20)}<span class="stx-ui-field-hint">填 0 表示不限制。</span></div>
            </div></div>
            ${divider('旧聊天接管')}
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">接管默认参数</div><div class="stx-ui-item-desc">控制识别旧聊天的阈值、默认范围和批处理策略。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${TAKEOVER_DETECT_MIN_FLOORS_ID}">识别阈值楼层</label>${numberField(TAKEOVER_DETECT_MIN_FLOORS_ID,1,2000,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${TAKEOVER_DEFAULT_RECENT_FLOORS_ID}">默认最近楼层</label>${numberField(TAKEOVER_DEFAULT_RECENT_FLOORS_ID,1,2000,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${TAKEOVER_DEFAULT_BATCH_SIZE_ID}">默认每批楼层数</label>${numberField(TAKEOVER_DEFAULT_BATCH_SIZE_ID,1,500,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${TAKEOVER_REQUEST_INTERVAL_SECONDS_ID}">每轮请求间隔秒数</label>${numberField(TAKEOVER_REQUEST_INTERVAL_SECONDS_ID,0,600,1)}<span class="stx-ui-field-hint">控制旧聊天接管每一轮 LLM 请求之间的等待时间，并同步驱动 LLMHub 右下角紧凑提示的自动关闭时间，默认 3 秒。</span></div>
            </div><div class="stx-ui-form-grid">
                <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">优先处理最近区间</div></div><div class="stx-ui-inline">${inlineCheckbox(TAKEOVER_DEFAULT_PRIORITIZE_RECENT_ID, '优先处理最近区间')}</div></div>
                <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">自动继续</div></div><div class="stx-ui-inline">${inlineCheckbox(TAKEOVER_DEFAULT_AUTO_CONTINUE_ID, '自动继续')}</div></div>
                <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">完成后自动整合</div></div><div class="stx-ui-inline">${inlineCheckbox(TAKEOVER_DEFAULT_AUTO_CONSOLIDATE_ID, '完成后自动整合')}</div></div>
                <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">失败自动暂停</div></div><div class="stx-ui-inline">${inlineCheckbox(TAKEOVER_DEFAULT_PAUSE_ON_ERROR_ID, '失败自动暂停')}</div></div>
            </div></div>
        </div>
        <div id="${PANEL_INJECTION_ID}" class="stx-ui-panel" hidden>
            ${divider('注入链路')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用 Prompt 注入</div><div class="stx-ui-item-desc">控制是否执行主注入链路。</div></div><div class="stx-ui-inline">${inlineCheckbox(INJECTION_PROMPT_ID, '启用 Prompt 注入')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用注入预览</div><div class="stx-ui-item-desc">在正式注入前额外计算并显示预览信息，便于调试。</div></div><div class="stx-ui-inline">${inlineCheckbox(INJECTION_PREVIEW_ID, '启用注入预览')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">注入上下文预算</div><div class="stx-ui-item-desc">限制注入阶段可使用的最大 token 预算。</div></div><div class="stx-ui-form-grid"><div class="stx-ui-field"><label class="stx-ui-field-label" for="${CONTEXT_TOKENS_ID}">contextMaxTokens</label>${numberField(CONTEXT_TOKENS_ID,200,10000,50)}</div></div></div>
            ${divider('检索与诊断')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">检索模式</div><div class="stx-ui-item-desc">控制召回主链使用的检索链路：仅词法（默认稳定）、仅向量（测试）、混合（综合）。</div></div><div class="stx-ui-inline">${retrievalModeSelect}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">检索参数</div><div class="stx-ui-item-desc">控制召回行为的查询级默认配置。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${RETRIEVAL_DEFAULT_TOPK_ID}">默认 TopK</label>${numberField(RETRIEVAL_DEFAULT_TOPK_ID,1,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${RETRIEVAL_DEFAULT_EXPAND_DEPTH_ID}">图扩展深度</label>${numberField(RETRIEVAL_DEFAULT_EXPAND_DEPTH_ID,0,3,1)}<span class="stx-ui-field-hint">0 = 不扩展。</span></div>
            </div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用 PayloadFilter 预过滤</div><div class="stx-ui-item-desc">在检索前按角色、schema、世界等条件预过滤候选。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_ENABLE_PAYLOAD_FILTER_ID, '启用 PayloadFilter')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用图扩展</div><div class="stx-ui-item-desc">控制是否沿关系图扩散种子节点，把相关上下文一起召回。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_ENABLE_GRAPH_EXPANSION_ID, '启用图扩展')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用图扩展热点降权</div><div class="stx-ui-item-desc">对高入度 Hub 节点施加惩罚，减少热门节点垄断召回结果。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_ENABLE_GRAPH_PENALTY_ID, '启用图扩展热点降权')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用 QueryContextBuilder</div><div class="stx-ui-item-desc">预留：为后续 embedding 查询构造统一上下文输入。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_ENABLE_QUERY_CONTEXT_BUILDER_ID, '启用 QueryContextBuilder')}</div></div>
            ${divider('向量检索')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用写入自动建索引</div><div class="stx-ui-item-desc">写入条目、关系、角色和总结后立即刷新向量文档，不再依赖当前检索模式。</div></div><div class="stx-ui-inline">${inlineCheckbox(VECTOR_AUTO_INDEX_ON_WRITE_ID, '启用写入自动建索引')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用向量策略路由</div><div class="stx-ui-item-desc">根据查询复杂度决定走快路径还是深路径，并使用不同候选窗口。</div></div><div class="stx-ui-inline">${inlineCheckbox(VECTOR_ENABLE_STRATEGY_ROUTING_ID, '启用向量策略路由')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">向量窗口参数</div><div class="stx-ui-item-desc">控制快路径窗口、深路径窗口和最终裁切数量。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_TOPK_ID}">快路径候选数</label>${numberField(VECTOR_TOPK_ID,1,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_DEEP_WINDOW_ID}">深路径候选窗口</label>${numberField(VECTOR_DEEP_WINDOW_ID,5,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_FINAL_TOPK_ID}">最终 TopK</label>${numberField(VECTOR_FINAL_TOPK_ID,1,50,1)}</div>
            </div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">Embedding 配置</div><div class="stx-ui-item-desc">控制 MemoryOS 向量编码的模型提示和版本标识。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_EMBEDDING_MODEL_ID}">Embedding 模型提示</label>${buildSharedInputField({ id: VECTOR_EMBEDDING_MODEL_ID, type: 'text', className: 'stx-ui-input' })}<span class="stx-ui-field-hint">不填则交给 LLMHub 自动路由。</span></div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_EMBEDDING_VERSION_ID}">Embedding 版本标识</label>${buildSharedInputField({ id: VECTOR_EMBEDDING_VERSION_ID, type: 'text', className: 'stx-ui-input' })}</div>
            </div></div>
            ${divider('向量重排序')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用向量重排序</div><div class="stx-ui-item-desc">仅在向量深路径中生效，关闭后直接使用融合结果裁切。</div></div><div class="stx-ui-inline">${inlineCheckbox(VECTOR_ENABLE_RERANK_ID, '启用向量重排序')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用 LLMHub 模型重排序</div><div class="stx-ui-item-desc">开启后仅深路径优先尝试模型重排，失败时可按设置回退规则重排。</div></div><div class="stx-ui-inline">${inlineCheckbox(VECTOR_ENABLE_LLMHUB_RERANK_ID, '启用 LLMHub 模型重排序')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">重排序参数</div><div class="stx-ui-item-desc">规则重排窗口与 LLMHub 模型重排的候选数量配置。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_RERANK_WINDOW_ID}">规则重排窗口</label>${numberField(VECTOR_RERANK_WINDOW_ID,5,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID}">模型重排最小候选数</label>${numberField(VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID,1,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID}">模型重排最大候选数</label>${numberField(VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID,1,100,1)}</div>
            </div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_LLMHUB_RERANK_RESOURCE_ID}">LLMHub 重排资源</label>${buildSharedInputField({ id: VECTOR_LLMHUB_RERANK_RESOURCE_ID, type: 'text', className: 'stx-ui-input' })}<span class="stx-ui-field-hint">不填则使用默认路由。</span></div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${VECTOR_LLMHUB_RERANK_MODEL_ID}">LLMHub 重排模型</label>${buildSharedInputField({ id: VECTOR_LLMHUB_RERANK_MODEL_ID, type: 'text', className: 'stx-ui-input' })}<span class="stx-ui-field-hint">不填则交给资源默认模型。</span></div>
            </div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">模型重排失败时回退规则重排</div><div class="stx-ui-item-desc">关闭后若模型重排失败，将直接返回当前融合结果裁切，不再继续规则重排。</div></div><div class="stx-ui-inline">${inlineCheckbox(VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID, '模型重排失败时回退规则重排')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用检索日志</div><div class="stx-ui-item-desc">输出中文检索链日志，并为工作台保留结构化 trace。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_LOG_ENABLED_ID, '启用检索日志')}</div></div>
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用诊断 Trace 面板</div><div class="stx-ui-item-desc">允许工作台直接查看最近一轮检索判定与召回流水。</div></div><div class="stx-ui-inline">${inlineCheckbox(RETRIEVAL_TRACE_PANEL_ID, '启用诊断 Trace 面板')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">检索调试配置</div><div class="stx-ui-item-desc">控制日志级别与当前启用的规则包模式。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${RETRIEVAL_LOG_LEVEL_ID}">retrievalLogLevel</label>${retrievalLogLevelSelect}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${RETRIEVAL_RULE_PACK_ID}">retrievalRulePack</label>${retrievalRulePackSelect}</div>
            </div></div>
        </div>
        <div id="${PANEL_PIPELINE_ID}" class="stx-ui-panel" hidden>
            ${divider('统一预算')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">启用统一预算控制</div><div class="stx-ui-item-desc">让总结、冷启动和旧聊天接管共用统一的预算与截断策略。</div></div><div class="stx-ui-inline">${inlineCheckbox(PIPELINE_BUDGET_ENABLED_ID, '启用统一预算控制')}</div></div>
            <div class="stx-ui-item stx-ui-item-stack"><div class="stx-ui-item-main"><div class="stx-ui-item-title">Pipeline 预算参数</div><div class="stx-ui-item-desc">这些参数会直接影响 batch、section、冲突裁决和 finalizer 的体量。</div></div><div class="stx-ui-form-grid">
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_INPUT_CHARS_ID}">每批最大输入字符数</label>${numberField(PIPELINE_MAX_INPUT_CHARS_ID,1000,50000,100)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_OUTPUT_ITEMS_ID}">每批最大输出项数</label>${numberField(PIPELINE_MAX_OUTPUT_ITEMS_ID,1,200,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_ACTIONS_ID}">每轮 mutation 最大动作数</label>${numberField(PIPELINE_MAX_ACTIONS_ID,1,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_SECTION_BATCHES_ID}">每个 section 最大 batch 数</label>${numberField(PIPELINE_MAX_SECTION_BATCHES_ID,1,50,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_CONFLICT_BUCKET_ID}">冲突桶最大记录数</label>${numberField(PIPELINE_MAX_CONFLICT_BUCKET_ID,1,100,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_SECTION_DIGEST_ID}">section digest 最大字符数</label>${numberField(PIPELINE_MAX_SECTION_DIGEST_ID,100,10000,20)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_MAX_FINALIZER_ITEMS_ID}">finalizer 每域最大条目数</label>${numberField(PIPELINE_MAX_FINALIZER_ITEMS_ID,1,500,1)}</div>
                <div class="stx-ui-field"><label class="stx-ui-field-label" for="${PIPELINE_STAGING_RETENTION_DAYS_ID}">staging 保留天数</label>${numberField(PIPELINE_STAGING_RETENTION_DAYS_ID,1,365,1)}</div>
            </div></div>
            ${divider('冲突裁决')}
            <div class="stx-ui-item"><div class="stx-ui-item-main"><div class="stx-ui-item-title">仅裁决未解决冲突</div><div class="stx-ui-item-desc">开启后只把 unresolved bucket 送入裁决任务，减少重复消耗。</div></div><div class="stx-ui-inline">${inlineCheckbox(PIPELINE_RESOLVE_UNRESOLVED_ONLY_ID, '仅裁决未解决冲突')}</div></div>
        </div>
        <div class="stx-ui-actions"><div id="${STATUS_ID}" class="stx-ui-status">已加载当前设置</div><div class="stx-ui-inline">${resetBtn}</div></div>
    `;
}

/**
 * 功能：构建抽屉卡片模板。
 * @returns HTML。
 */
function buildCardTemplateHtml(): string {
    return buildSettingPageTemplate({
        drawerToggleId: DRAWER_TOGGLE_ID,
        drawerContentId: DRAWER_CONTENT_ID,
        drawerIconId: DRAWER_ICON_ID,
        title: 'MemoryOS 设置',
        badgeText: 'Unified',
        contentHtml: buildSettingsContentHtml(),
    });
}

/**
 * 功能：切换活动标签页。
 * @param key 标签键。
 */
function activateTab(key: TabKey): void {
    TABS.forEach((tab: TabBinding): void => {
        const tabElement = document.getElementById(tab.tabId) as HTMLButtonElement | null;
        const panelElement = document.getElementById(tab.panelId);
        const active = tab.key === key;
        if (tabElement) tabElement.classList.toggle('is-active', active);
        if (panelElement) panelElement.hidden = !active;
    });
}

/**
 * 功能：绑定标签事件。
 */
function bindTabEvents(): void {
    TABS.forEach((tab: TabBinding): void => {
        const tabElement = document.getElementById(tab.tabId) as HTMLButtonElement | null;
        if (!tabElement) return;
        tabElement.onclick = (): void => activateTab(tab.key);
    });
    activateTab('general');
}

/**
 * 功能：同步设置到表单。
 * @param settings 设置对象。
 */
function syncSettingsToForm(settings: MemoryOSSettings): void {
    const setters: Array<[string, string | boolean]> = [
        [ENABLED_ID, settings.enabled],
        [TOOLBAR_QUICK_ACTIONS_ID, settings.toolbarQuickActionsEnabled],
        [COLD_START_ENABLED_ID, settings.coldStartEnabled],
        [TAKEOVER_ENABLED_ID, settings.takeoverEnabled],
        [SUMMARY_AUTO_TRIGGER_ID, settings.summaryAutoTriggerEnabled],
        [SUMMARY_PROGRESS_OVERLAY_ID, settings.summaryProgressOverlayEnabled],
        [SUMMARY_INTERVAL_ID, String(settings.summaryIntervalFloors)],
        [SUMMARY_MIN_MESSAGES_ID, String(settings.summaryMinMessages)],
        [SUMMARY_RECENT_WINDOW_ID, String(settings.summaryRecentWindowSize)],
        [SUMMARY_SECOND_STAGE_ROLLING_DIGEST_MAX_CHARS_ID, String(settings.summarySecondStageRollingDigestMaxChars)],
        [SUMMARY_SECOND_STAGE_CANDIDATE_SUMMARY_MAX_CHARS_ID, String(settings.summarySecondStageCandidateSummaryMaxChars)],
        [TAKEOVER_DETECT_MIN_FLOORS_ID, String(settings.takeoverDetectMinFloors)],
        [TAKEOVER_DEFAULT_RECENT_FLOORS_ID, String(settings.takeoverDefaultRecentFloors)],
        [TAKEOVER_DEFAULT_BATCH_SIZE_ID, String(settings.takeoverDefaultBatchSize)],
        [TAKEOVER_REQUEST_INTERVAL_SECONDS_ID, String(settings.takeoverRequestIntervalSeconds)],
        [TAKEOVER_DEFAULT_PRIORITIZE_RECENT_ID, settings.takeoverDefaultPrioritizeRecent],
        [TAKEOVER_DEFAULT_AUTO_CONTINUE_ID, settings.takeoverDefaultAutoContinue],
        [TAKEOVER_DEFAULT_AUTO_CONSOLIDATE_ID, settings.takeoverDefaultAutoConsolidate],
        [TAKEOVER_DEFAULT_PAUSE_ON_ERROR_ID, settings.takeoverDefaultPauseOnError],
        [INJECTION_PROMPT_ID, settings.injectionPromptEnabled],
        [INJECTION_PREVIEW_ID, settings.injectionPreviewEnabled],
        [CONTEXT_TOKENS_ID, String(settings.contextMaxTokens)],
        [RETRIEVAL_MODE_ID, settings.retrievalMode],
        [RETRIEVAL_DEFAULT_TOPK_ID, String(settings.retrievalDefaultTopK)],
        [RETRIEVAL_DEFAULT_EXPAND_DEPTH_ID, String(settings.retrievalDefaultExpandDepth)],
        [RETRIEVAL_ENABLE_PAYLOAD_FILTER_ID, settings.retrievalEnablePayloadFilter],
        [RETRIEVAL_ENABLE_GRAPH_EXPANSION_ID, settings.retrievalEnableGraphExpansion],
        [RETRIEVAL_ENABLE_GRAPH_PENALTY_ID, settings.retrievalEnableGraphPenalty],
        [RETRIEVAL_ENABLE_QUERY_CONTEXT_BUILDER_ID, settings.retrievalEnableQueryContextBuilder],
        [VECTOR_TOPK_ID, String(settings.vectorTopK)],
        [VECTOR_DEEP_WINDOW_ID, String(settings.vectorDeepWindow)],
        [VECTOR_FINAL_TOPK_ID, String(settings.vectorFinalTopK)],
        [VECTOR_ENABLE_STRATEGY_ROUTING_ID, settings.vectorEnableStrategyRouting],
        [VECTOR_ENABLE_RERANK_ID, settings.vectorEnableRerank],
        [VECTOR_RERANK_WINDOW_ID, String(settings.vectorRerankWindow)],
        [VECTOR_EMBEDDING_MODEL_ID, settings.vectorEmbeddingModel],
        [VECTOR_EMBEDDING_VERSION_ID, settings.vectorEmbeddingVersion],
        [VECTOR_AUTO_INDEX_ON_WRITE_ID, settings.vectorAutoIndexOnWrite],
        [VECTOR_ENABLE_LLMHUB_RERANK_ID, settings.vectorEnableLLMHubRerank],
        [VECTOR_LLMHUB_RERANK_RESOURCE_ID, settings.vectorLLMHubRerankResource],
        [VECTOR_LLMHUB_RERANK_MODEL_ID, settings.vectorLLMHubRerankModel],
        [VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID, String(settings.vectorLLMHubRerankMinCandidates)],
        [VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID, String(settings.vectorLLMHubRerankMaxCandidates)],
        [VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID, settings.vectorLLMHubRerankFallbackToRule],
        [RETRIEVAL_LOG_ENABLED_ID, settings.retrievalLogEnabled],
        [RETRIEVAL_TRACE_PANEL_ID, settings.retrievalTracePanelEnabled],
        [RETRIEVAL_LOG_LEVEL_ID, settings.retrievalLogLevel],
        [RETRIEVAL_RULE_PACK_ID, settings.retrievalRulePack],
        [PIPELINE_BUDGET_ENABLED_ID, settings.pipelineBudgetEnabled],
        [PIPELINE_MAX_INPUT_CHARS_ID, String(settings.pipelineMaxInputCharsPerBatch)],
        [PIPELINE_MAX_OUTPUT_ITEMS_ID, String(settings.pipelineMaxOutputItemsPerBatch)],
        [PIPELINE_MAX_ACTIONS_ID, String(settings.pipelineMaxActionsPerMutation)],
        [PIPELINE_MAX_SECTION_BATCHES_ID, String(settings.pipelineMaxSectionBatchCount)],
        [PIPELINE_MAX_CONFLICT_BUCKET_ID, String(settings.pipelineMaxConflictBucketSize)],
        [PIPELINE_MAX_SECTION_DIGEST_ID, String(settings.pipelineMaxSectionDigestChars)],
        [PIPELINE_MAX_FINALIZER_ITEMS_ID, String(settings.pipelineMaxFinalizerItemsPerDomain)],
        [PIPELINE_STAGING_RETENTION_DAYS_ID, String(settings.pipelineStagingRetentionDays)],
        [PIPELINE_RESOLVE_UNRESOLVED_ONLY_ID, settings.pipelineResolveOnlyUnresolvedConflicts],
    ];
    isSyncingForm = true;
    try {
        setters.forEach(([id, value]): void => {
            const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
            if (!element) return;
            if (typeof value === 'boolean' && element instanceof HTMLInputElement) {
                element.checked = value;
                return;
            }
            element.value = String(value);
        });
    } finally {
        isSyncingForm = false;
    }
    syncVectorSettingsUiState();
}

/**
 * 功能：读取表单中的设置。
 * @returns 设置对象。
 */
function readSettingsFromForm(): Partial<MemoryOSSettings> {
    const checked = (id: string, fallback: boolean): boolean => (document.getElementById(id) as HTMLInputElement | null)?.checked ?? fallback;
    const text = (id: string, fallback: string): string => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? fallback;
    return {
        enabled: checked(ENABLED_ID, DEFAULT_MEMORY_OS_SETTINGS.enabled),
        coldStartEnabled: checked(COLD_START_ENABLED_ID, DEFAULT_MEMORY_OS_SETTINGS.coldStartEnabled),
        takeoverEnabled: checked(TAKEOVER_ENABLED_ID, DEFAULT_MEMORY_OS_SETTINGS.takeoverEnabled),
        toolbarQuickActionsEnabled: checked(TOOLBAR_QUICK_ACTIONS_ID, DEFAULT_MEMORY_OS_SETTINGS.toolbarQuickActionsEnabled),
        injectionPromptEnabled: checked(INJECTION_PROMPT_ID, DEFAULT_MEMORY_OS_SETTINGS.injectionPromptEnabled),
        injectionPreviewEnabled: checked(INJECTION_PREVIEW_ID, DEFAULT_MEMORY_OS_SETTINGS.injectionPreviewEnabled),
        contextMaxTokens: Number(text(CONTEXT_TOKENS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.contextMaxTokens))),
        retrievalMode: (() => {
            const v = text(RETRIEVAL_MODE_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalMode);
            return v === 'lexical_only' || v === 'vector_only' || v === 'hybrid' ? v : DEFAULT_MEMORY_OS_SETTINGS.retrievalMode;
        })(),
        retrievalDefaultTopK: Number(text(RETRIEVAL_DEFAULT_TOPK_ID, String(DEFAULT_MEMORY_OS_SETTINGS.retrievalDefaultTopK))),
        retrievalDefaultExpandDepth: Number(text(RETRIEVAL_DEFAULT_EXPAND_DEPTH_ID, String(DEFAULT_MEMORY_OS_SETTINGS.retrievalDefaultExpandDepth))),
        retrievalEnablePayloadFilter: checked(RETRIEVAL_ENABLE_PAYLOAD_FILTER_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalEnablePayloadFilter),
        retrievalEnableGraphExpansion: checked(RETRIEVAL_ENABLE_GRAPH_EXPANSION_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalEnableGraphExpansion),
        retrievalEnableGraphPenalty: checked(RETRIEVAL_ENABLE_GRAPH_PENALTY_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalEnableGraphPenalty),
        retrievalEnableQueryContextBuilder: checked(RETRIEVAL_ENABLE_QUERY_CONTEXT_BUILDER_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalEnableQueryContextBuilder),
        vectorTopK: Number(text(VECTOR_TOPK_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorTopK))),
        vectorDeepWindow: Number(text(VECTOR_DEEP_WINDOW_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorDeepWindow))),
        vectorFinalTopK: Number(text(VECTOR_FINAL_TOPK_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorFinalTopK))),
        vectorEnableStrategyRouting: checked(VECTOR_ENABLE_STRATEGY_ROUTING_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorEnableStrategyRouting),
        vectorEnableRerank: checked(VECTOR_ENABLE_RERANK_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorEnableRerank),
        vectorRerankWindow: Number(text(VECTOR_RERANK_WINDOW_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorRerankWindow))),
        vectorEmbeddingModel: text(VECTOR_EMBEDDING_MODEL_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorEmbeddingModel),
        vectorEmbeddingVersion: text(VECTOR_EMBEDDING_VERSION_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorEmbeddingVersion),
        vectorAutoIndexOnWrite: checked(VECTOR_AUTO_INDEX_ON_WRITE_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorAutoIndexOnWrite),
        vectorEnableLLMHubRerank: checked(VECTOR_ENABLE_LLMHUB_RERANK_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorEnableLLMHubRerank),
        vectorLLMHubRerankResource: text(VECTOR_LLMHUB_RERANK_RESOURCE_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankResource),
        vectorLLMHubRerankModel: text(VECTOR_LLMHUB_RERANK_MODEL_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankModel),
        vectorLLMHubRerankMinCandidates: Number(text(VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankMinCandidates))),
        vectorLLMHubRerankMaxCandidates: Number(text(VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID, String(DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankMaxCandidates))),
        vectorLLMHubRerankFallbackToRule: checked(VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID, DEFAULT_MEMORY_OS_SETTINGS.vectorLLMHubRerankFallbackToRule),
        summaryAutoTriggerEnabled: checked(SUMMARY_AUTO_TRIGGER_ID, DEFAULT_MEMORY_OS_SETTINGS.summaryAutoTriggerEnabled),
        summaryProgressOverlayEnabled: checked(SUMMARY_PROGRESS_OVERLAY_ID, DEFAULT_MEMORY_OS_SETTINGS.summaryProgressOverlayEnabled),
        summaryIntervalFloors: Number(text(SUMMARY_INTERVAL_ID, String(DEFAULT_MEMORY_OS_SETTINGS.summaryIntervalFloors))),
        summaryMinMessages: Number(text(SUMMARY_MIN_MESSAGES_ID, String(DEFAULT_MEMORY_OS_SETTINGS.summaryMinMessages))),
        summaryRecentWindowSize: Number(text(SUMMARY_RECENT_WINDOW_ID, String(DEFAULT_MEMORY_OS_SETTINGS.summaryRecentWindowSize))),
        summarySecondStageRollingDigestMaxChars: Number(text(SUMMARY_SECOND_STAGE_ROLLING_DIGEST_MAX_CHARS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.summarySecondStageRollingDigestMaxChars))),
        summarySecondStageCandidateSummaryMaxChars: Number(text(SUMMARY_SECOND_STAGE_CANDIDATE_SUMMARY_MAX_CHARS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.summarySecondStageCandidateSummaryMaxChars))),
        pipelineBudgetEnabled: checked(PIPELINE_BUDGET_ENABLED_ID, DEFAULT_MEMORY_OS_SETTINGS.pipelineBudgetEnabled),
        pipelineMaxInputCharsPerBatch: Number(text(PIPELINE_MAX_INPUT_CHARS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxInputCharsPerBatch))),
        pipelineMaxOutputItemsPerBatch: Number(text(PIPELINE_MAX_OUTPUT_ITEMS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxOutputItemsPerBatch))),
        pipelineMaxActionsPerMutation: Number(text(PIPELINE_MAX_ACTIONS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxActionsPerMutation))),
        pipelineMaxSectionBatchCount: Number(text(PIPELINE_MAX_SECTION_BATCHES_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxSectionBatchCount))),
        pipelineMaxConflictBucketSize: Number(text(PIPELINE_MAX_CONFLICT_BUCKET_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxConflictBucketSize))),
        pipelineMaxSectionDigestChars: Number(text(PIPELINE_MAX_SECTION_DIGEST_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxSectionDigestChars))),
        pipelineMaxFinalizerItemsPerDomain: Number(text(PIPELINE_MAX_FINALIZER_ITEMS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineMaxFinalizerItemsPerDomain))),
        pipelineStagingRetentionDays: Number(text(PIPELINE_STAGING_RETENTION_DAYS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.pipelineStagingRetentionDays))),
        pipelineResolveOnlyUnresolvedConflicts: checked(PIPELINE_RESOLVE_UNRESOLVED_ONLY_ID, DEFAULT_MEMORY_OS_SETTINGS.pipelineResolveOnlyUnresolvedConflicts),
        takeoverDetectMinFloors: Number(text(TAKEOVER_DETECT_MIN_FLOORS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.takeoverDetectMinFloors))),
        takeoverDefaultRecentFloors: Number(text(TAKEOVER_DEFAULT_RECENT_FLOORS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultRecentFloors))),
        takeoverDefaultBatchSize: Number(text(TAKEOVER_DEFAULT_BATCH_SIZE_ID, String(DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultBatchSize))),
        takeoverRequestIntervalSeconds: Number(text(TAKEOVER_REQUEST_INTERVAL_SECONDS_ID, String(DEFAULT_MEMORY_OS_SETTINGS.takeoverRequestIntervalSeconds))),
        takeoverDefaultPrioritizeRecent: checked(TAKEOVER_DEFAULT_PRIORITIZE_RECENT_ID, DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultPrioritizeRecent),
        takeoverDefaultAutoContinue: checked(TAKEOVER_DEFAULT_AUTO_CONTINUE_ID, DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultAutoContinue),
        takeoverDefaultAutoConsolidate: checked(TAKEOVER_DEFAULT_AUTO_CONSOLIDATE_ID, DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultAutoConsolidate),
        takeoverDefaultPauseOnError: checked(TAKEOVER_DEFAULT_PAUSE_ON_ERROR_ID, DEFAULT_MEMORY_OS_SETTINGS.takeoverDefaultPauseOnError),
        retrievalLogEnabled: checked(RETRIEVAL_LOG_ENABLED_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalLogEnabled),
        retrievalLogLevel: text(RETRIEVAL_LOG_LEVEL_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalLogLevel) === 'debug' ? 'debug' : 'info',
        retrievalRulePack: text(RETRIEVAL_RULE_PACK_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalRulePack) === 'native'
            ? 'native'
            : text(RETRIEVAL_RULE_PACK_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalRulePack) === 'perocore'
                ? 'perocore'
                : 'hybrid',
        retrievalTracePanelEnabled: checked(RETRIEVAL_TRACE_PANEL_ID, DEFAULT_MEMORY_OS_SETTINGS.retrievalTracePanelEnabled),
    };
}

/**
 * 功能：同步向量设置区的可编辑状态。
 */
function syncVectorSettingsUiState(): void {
    const rerankEnabled = (document.getElementById(VECTOR_ENABLE_RERANK_ID) as HTMLInputElement | null)?.checked ?? false;
    const llmhubEnabled = (document.getElementById(VECTOR_ENABLE_LLMHUB_RERANK_ID) as HTMLInputElement | null)?.checked ?? false;
    const rerankFieldIds = [
        VECTOR_ENABLE_LLMHUB_RERANK_ID,
        VECTOR_RERANK_WINDOW_ID,
        VECTOR_LLMHUB_RERANK_RESOURCE_ID,
        VECTOR_LLMHUB_RERANK_MODEL_ID,
        VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID,
        VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID,
        VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID,
    ];
    const llmhubFieldIds = [
        VECTOR_LLMHUB_RERANK_RESOURCE_ID,
        VECTOR_LLMHUB_RERANK_MODEL_ID,
        VECTOR_LLMHUB_RERANK_MIN_CANDIDATES_ID,
        VECTOR_LLMHUB_RERANK_MAX_CANDIDATES_ID,
        VECTOR_LLMHUB_RERANK_FALLBACK_TO_RULE_ID,
    ];

    rerankFieldIds.forEach((id: string): void => {
        const element = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
        if (!element) {
            return;
        }
        if (id === VECTOR_ENABLE_LLMHUB_RERANK_ID) {
            element.disabled = !rerankEnabled;
            return;
        }
        if (llmhubFieldIds.includes(id)) {
            element.disabled = !rerankEnabled || !llmhubEnabled;
            return;
        }
        element.disabled = !rerankEnabled;
    });
}

/**
 * 功能：设置状态提示文案。
 * @param text 文案。
 */
function setStatusText(text: string): void {
    const element = document.getElementById(STATUS_ID);
    if (element) element.textContent = text;
}

/**
 * 功能：立即执行自动保存。
 */
function flushAutoSave(): void {
    if (isSyncingForm) return;
    const saved = writeMemoryOSSettings(readSettingsFromForm());
    syncSettingsToForm(saved);
    setStatusText('已自动保存，下一轮对话生效');
}

/**
 * 功能：延迟调度自动保存。
 */
function scheduleAutoSave(): void {
    if (isSyncingForm) return;
    if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer);
    setStatusText('检测到更改，正在准备自动保存…');
    autoSaveTimer = window.setTimeout((): void => {
        autoSaveTimer = null;
        flushAutoSave();
    }, 320);
}

/**
 * 功能：绑定交互事件。
 */
function bindActionEvents(): void {
    const openButton = document.getElementById(BTN_ID) as HTMLButtonElement | null;
    if (openButton) openButton.onclick = (): void => openUnifiedMemoryWorkbench();
    const resetButton = document.getElementById(RESET_BTN_ID) as HTMLButtonElement | null;
    if (resetButton) {
        resetButton.onclick = (): void => {
            if (autoSaveTimer !== null) window.clearTimeout(autoSaveTimer);
            autoSaveTimer = null;
            const saved = writeMemoryOSSettings({ ...DEFAULT_MEMORY_OS_SETTINGS });
            syncSettingsToForm(saved);
            setStatusText('已恢复默认设置');
        };
    }
    const elements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`#${CARD_ID} input, #${CARD_ID} select`));
    elements.forEach((element: HTMLInputElement | HTMLSelectElement): void => {
        if (element.id === BTN_ID || element.id === RESET_BTN_ID) return;
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            element.addEventListener('change', (): void => {
                syncVectorSettingsUiState();
                scheduleAutoSave();
            });
            return;
        }
        element.addEventListener('input', (): void => {
            syncVectorSettingsUiState();
            scheduleAutoSave();
        });
        element.addEventListener('change', (): void => {
            syncVectorSettingsUiState();
            scheduleAutoSave();
        });
        element.addEventListener('blur', (): void => flushAutoSave());
    });
}

/**
 * 功能：渲染 MemoryOS 设置入口。
 * @returns 异步完成。
 */
export async function renderSettingsUi(): Promise<void> {
    const container = document.querySelector('#extensions_settings');
    if (!container) {
        logger.warn('[MemoryOS] 未找到 extensions_settings 容器');
        return;
    }
    ensureSettingsStyles();
    let card = document.getElementById(CARD_ID) as HTMLDivElement | null;
    if (!card) {
        card = document.createElement('div');
        card.id = CARD_ID;
        container.prepend(card);
    }
    card.innerHTML = buildCardTemplateHtml();
    hydrateSettingPage(card);
    bindTabEvents();
    bindActionEvents();
    syncSettingsToForm(readMemoryOSSettings());
    setStatusText('已加载当前设置');
}

/**
 * 功能：兼容导出旧世界书入口，当前转到统一工作台。
 */
export function openWorldbookInitPanel(): void {
    openUnifiedMemoryWorkbench({ initialView: 'world' });
}
