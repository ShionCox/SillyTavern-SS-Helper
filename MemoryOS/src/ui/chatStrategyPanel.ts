import { buildTavernChatScopedKeyEvent, listTavernChatsForCurrentTavernEvent } from '../../../SDK/tavern';
import type { SdkTavernChatLocatorEvent } from '../../../SDK/tavern/types';
import { buildSharedButton } from '../../../_Components/sharedButton';
import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';
import { buildSharedInputField } from '../../../_Components/sharedInput';
import { buildSharedSelectField, hydrateSharedSelects, refreshSharedSelectOptions } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { mountThemeHost, initThemeKernel } from '../../../SDK/theme';
import { ChatStateManager } from '../core/chat-state-manager';
import { buildAdaptivePolicy, buildRetentionPolicy } from '../core/chat-strategy-engine';
import {
    DEFAULT_ADAPTIVE_METRICS,
    DEFAULT_CHAT_PROFILE,
    DEFAULT_MEMORY_QUALITY,
    DEFAULT_RETENTION_POLICY,
    DEFAULT_VECTOR_LIFECYCLE,
} from '../types';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    ChatProfile,
    DeletionStrategy,
    MaintenanceAdvice,
    MemoryQualityScorecard,
    RetentionPolicy,
    StrategyDecision,
    VectorLifecycleState,
} from '../types';

interface ChatOption {
    value: string;
    label: string;
    avatarUrl: string;
    iconClassName?: string;
}

interface ChatStrategySnapshot {
    chatKey: string;
    autoProfile: ChatProfile;
    autoPolicy: AdaptivePolicy;
    autoRetention: RetentionPolicy;
    effectiveProfile: ChatProfile;
    effectivePolicy: AdaptivePolicy;
    effectiveRetention: RetentionPolicy;
    metrics: AdaptiveMetrics;
    vectorLifecycle: VectorLifecycleState;
    memoryQuality: MemoryQualityScorecard;
    maintenanceAdvice: MaintenanceAdvice[];
    decision: StrategyDecision | null;
    overrides: Record<string, unknown>;
}

interface MemoryChatStateApi {
    setChatProfileOverride(override: Partial<ChatProfile>): Promise<void>;
    setRetentionPolicyOverride(override: Partial<RetentionPolicy>): Promise<void>;
    recomputeAdaptivePolicy(): Promise<AdaptivePolicy | void>;
    recomputeMemoryQuality?(): Promise<MemoryQualityScorecard | void>;
    flush(): Promise<void>;
}

type WindowWithMemory = Window & {
    STX?: {
        memory?: {
            getChatKey?: () => string;
            chatState?: MemoryChatStateApi;
        };
    };
};

const PANEL_IDS = {
    rootId: 'stx-memoryos-chat-strategy-panel',
    chatSelectId: 'stx-memoryos-chat-strategy-card-chat',
    summaryNameId: 'stx-memoryos-chat-strategy-summary-name',
    summaryIntentId: 'stx-memoryos-chat-strategy-summary-intent',
    summarySectionsId: 'stx-memoryos-chat-strategy-summary-sections',
    summaryProfileId: 'stx-memoryos-chat-strategy-summary-profile',
    openBtnId: 'stx-memoryos-chat-strategy-open',
    refreshBtnId: 'stx-memoryos-chat-strategy-refresh-card',
} as const;

const EDITOR_IDS = {
    overlayId: 'stx-memoryos-chat-strategy-overlay',
    closeBtnId: 'stx-memoryos-chat-strategy-close',
    mobileToggleBtnId: 'stx-memoryos-chat-strategy-mobile-toggle',
    refreshBtnId: 'stx-memoryos-chat-strategy-editor-refresh',
    recomputeBtnId: 'stx-memoryos-chat-strategy-editor-recompute',
    applyBtnId: 'stx-memoryos-chat-strategy-editor-apply',
    chatSearchId: 'stx-memoryos-chat-strategy-chat-search',
    chatListId: 'stx-memoryos-chat-strategy-chat-list',
    currentChatNameId: 'stx-memoryos-chat-strategy-current-name',
    currentChatMetaId: 'stx-memoryos-chat-strategy-current-meta',
    currentIntentId: 'stx-memoryos-chat-strategy-current-intent',
    sectionsWrapId: 'stx-memoryos-chat-strategy-current-sections',
    chatTypeId: 'stx-memoryos-chat-strategy-chat-type',
    stylePreferenceId: 'stx-memoryos-chat-strategy-style',
    memoryStrengthId: 'stx-memoryos-chat-strategy-memory-strength',
    extractStrategyId: 'stx-memoryos-chat-strategy-extract',
    summaryStrategyId: 'stx-memoryos-chat-strategy-summary',
    deletionStrategyId: 'stx-memoryos-chat-strategy-delete',
    vectorEnabledId: 'stx-memoryos-chat-strategy-vector-enabled',
    vectorChunkThresholdId: 'stx-memoryos-chat-strategy-vector-chunk',
    rerankThresholdId: 'stx-memoryos-chat-strategy-rerank-threshold',
    vectorActivationFactsId: 'stx-memoryos-chat-strategy-vector-activation-facts',
    vectorActivationSummariesId: 'stx-memoryos-chat-strategy-vector-activation-summaries',
    vectorIdleDecayDaysId: 'stx-memoryos-chat-strategy-vector-idle-decay-days',
    vectorLowPrecisionStrideId: 'stx-memoryos-chat-strategy-vector-low-precision-stride',
    keepSummaryCountId: 'stx-memoryos-chat-strategy-keep-summary',
    keepEventCountId: 'stx-memoryos-chat-strategy-keep-event',
    keepVectorDaysId: 'stx-memoryos-chat-strategy-keep-vector-days',
    qualityScoreId: 'stx-memoryos-chat-strategy-quality-score',
    qualityLevelId: 'stx-memoryos-chat-strategy-quality-level',
    qualityDimensionsId: 'stx-memoryos-chat-strategy-quality-dimensions',
    qualityVectorModeId: 'stx-memoryos-chat-strategy-quality-vector-mode',
    qualityVectorStatsId: 'stx-memoryos-chat-strategy-quality-vector-stats',
    qualityVectorTimesId: 'stx-memoryos-chat-strategy-quality-vector-times',
    qualityAdviceId: 'stx-memoryos-chat-strategy-quality-advice',
    qualityReasonsId: 'stx-memoryos-chat-strategy-quality-reasons',
    autoBlockId: 'stx-memoryos-chat-strategy-auto',
    overrideBlockId: 'stx-memoryos-chat-strategy-override',
    finalBlockId: 'stx-memoryos-chat-strategy-final',
    metricsBlockId: 'stx-memoryos-chat-strategy-metrics',
    decisionBlockId: 'stx-memoryos-chat-strategy-decision',
} as const;

let selectedChatKey: string = '';
let panelListenersBound: boolean = false;
let cachedChatOptions: ChatOption[] = [];
let autoLoadTimerId: number | null = null;
let autoLoadAttempts: number = 0;

const CHAT_STRATEGY_AUTO_LOAD_MAX_ATTEMPTS: number = 8;
const CHAT_STRATEGY_AUTO_LOAD_INTERVAL_MS: number = 700;

/**
 * 功能：为聊天策略画像区域应用共享提示逻辑。
 * @returns 无返回值。
 */
function applyChatStrategyTooltips(): void {
    ensureSharedTooltip();
}

/**
 * 功能：确保设置页中存在紧凑版聊天策略概览卡。
 * @param panelHost AI 面板根节点。
 * @returns 无返回值。
 */
export function ensureChatStrategyPanel(panelHost: HTMLElement): void {
    if (panelHost.querySelector(`#${PANEL_IDS.rootId}`)) {
        return;
    }
    const wrapper: HTMLDivElement = document.createElement('div');
    wrapper.innerHTML = buildCompactPanelMarkup();
    const firstElement: Element | null = wrapper.firstElementChild;
    if (firstElement instanceof HTMLElement) {
        panelHost.prepend(firstElement);
        hydrateSharedSelects(firstElement);
        applyChatStrategyTooltips();
    }
}

/**
 * 功能：初始化聊天策略概览卡并同步当前聊天摘要。
 * @returns 无返回值。
 */
export async function initializeChatStrategyPanel(): Promise<void> {
    const root: HTMLElement | null = document.getElementById(PANEL_IDS.rootId) as HTMLElement | null;
    if (!root) {
        return;
    }
    bindCompactPanelListeners();
    await refreshChatStrategyChatOptions();
    if (!selectedChatKey) {
        selectedChatKey = getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    }
    if (selectedChatKey) {
        await renderCompactPanelState(selectedChatKey);
    }
    scheduleAutoLoadChatStrategyPanel();
}

/**
 * 功能：刷新概览卡中的聊天下拉列表。
 * @returns 无返回值。
 */
export async function refreshChatStrategyChatOptions(): Promise<void> {
    const select: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    if (!select) {
        return;
    }
    cachedChatOptions = await loadChatOptions();
    if (!selectedChatKey) {
        selectedChatKey = getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    }
    replaceSelectOptions(select, cachedChatOptions, selectedChatKey);
    refreshSharedSelectOptions(document.getElementById(PANEL_IDS.rootId) || document.body);
    applyChatStrategyTooltips();
}

/**
 * 功能：打开聊天策略全屏编辑器。
 * @returns 无返回值。
 */
export async function openChatStrategyEditor(): Promise<void> {
    initThemeKernel();
    const existingOverlay: HTMLElement | null = document.getElementById(EDITOR_IDS.overlayId);
    if (existingOverlay) {
        existingOverlay.remove();
    }

    const overlay: HTMLDivElement = document.createElement('div');
    overlay.id = EDITOR_IDS.overlayId;
    overlay.className = 'stx-memory-chat-strategy-overlay ui-widget';
    overlay.innerHTML = buildEditorMarkup();
    mountThemeHost(overlay);
    document.body.appendChild(overlay);
    document.body.classList.add('stx-memory-chat-strategy-lock-scroll');

    hydrateSharedSelects(overlay);
    applyChatStrategyTooltips();

    const activeChatKey: string = selectedChatKey || getCurrentChatKey() || cachedChatOptions[0]?.value || '';
    selectedChatKey = activeChatKey;
    await syncEditorChatOptions(overlay, activeChatKey);
    bindEditorListeners(overlay);
    if (activeChatKey) {
        await renderEditorState(overlay, activeChatKey);
    }

    requestAnimationFrame((): void => {
        overlay.classList.add('is-visible');
    });
}

/**
 * 功能：构建设置页概览卡 HTML。
 * @returns 概览卡 HTML 字符串。
 */
function buildCompactPanelMarkup(): string {
    const selectMarkup: string = buildSharedSelectField({
        id: PANEL_IDS.chatSelectId,
        containerClassName: 'stx-ui-shared-select stx-ui-shared-select-inline',
        selectClassName: 'stx-ui-input',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: {
            'data-tip': '切换要查看的聊天策略摘要。',
        },
        options: [{
            value: '',
            label: '正在加载聊天...',
            media: {
                type: 'icon',
                iconClassName: 'fa-solid fa-comments',
            },
        }],
    });
    const openButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.openBtnId,
        label: '打开全屏编辑器',
        iconClassName: 'fa-solid fa-expand',
        className: 'stx-memory-chat-strategy-open',
        attributes: {
            'data-tip': '打开全屏聊天策略编辑器。',
        },
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: PANEL_IDS.refreshBtnId,
        label: '刷新摘要',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
        attributes: {
            'data-tip': '重新读取当前聊天的策略摘要。',
        },
    });
    return `
      <div id="${PANEL_IDS.rootId}" class="stx-ui-item stx-ui-item-stack stx-memory-chat-strategy-card">
        <div class="stx-ui-divider">
          <i class="fa-solid fa-sliders"></i>
          <span>聊天策略画像</span>
          <div class="stx-ui-divider-line"></div>
        </div>
        <div class="stx-memory-chat-strategy-card-head">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">按聊天查看与编辑记忆策略</div>
            <div class="stx-ui-item-desc">设置页只保留紧凑摘要，详细编辑、诊断和多聊天切换都在全屏编辑器中完成。</div>
          </div>
          <div class="stx-memory-chat-strategy-card-actions">
            ${refreshButtonMarkup}
            ${openButtonMarkup}
          </div>
        </div>
        <div class="stx-memory-chat-strategy-card-toolbar">
          <label class="stx-memory-chat-strategy-card-field">
            <span class="stx-memory-chat-strategy-card-label">聊天</span>
            ${selectMarkup}
          </label>
        </div>
        <div class="stx-memory-chat-strategy-summary-grid">
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">当前聊天</span>
            <strong id="${PANEL_IDS.summaryNameId}" class="stx-memory-chat-strategy-summary-value">未选择</strong>
          </div>
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">当前意图</span>
            <strong id="${PANEL_IDS.summaryIntentId}" class="stx-memory-chat-strategy-summary-value">暂无</strong>
          </div>
          <div class="stx-memory-chat-strategy-summary-card">
            <span class="stx-memory-chat-strategy-summary-label">画像概览</span>
            <strong id="${PANEL_IDS.summaryProfileId}" class="stx-memory-chat-strategy-summary-value">等待加载</strong>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-sections">
          <span class="stx-memory-chat-strategy-card-label">最近注入区段</span>
          <div id="${PANEL_IDS.summarySectionsId}" class="stx-memory-chat-strategy-pill-wrap">
            <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
          </div>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：构建聊天策略全屏编辑器 HTML。
 * @returns 编辑器 HTML 字符串。
 */
function buildEditorMarkup(): string {
    const searchInputMarkup: string = buildSharedInputField({
        id: EDITOR_IDS.chatSearchId,
        type: 'search',
        className: 'stx-memory-chat-strategy-search',
        attributes: {
            placeholder: '搜索聊天名或 chatKey',
            'data-tip': '按聊天名或 chatKey 过滤左侧聊天列表。',
        },
    });
    const mobileToggleMarkup: string = buildSharedButton({
        id: EDITOR_IDS.mobileToggleBtnId,
        label: '切换聊天',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-comments',
    });
    const refreshButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.refreshBtnId,
        label: '刷新',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-rotate',
    });
    const recomputeButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.recomputeBtnId,
        label: '重算自动策略',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
    });
    const applyButtonMarkup: string = buildSharedButton({
        id: EDITOR_IDS.applyBtnId,
        label: '保存覆盖',
        iconClassName: 'fa-solid fa-floppy-disk',
    });
    return `
      <div class="stx-memory-chat-strategy-editor">
        <div class="stx-memory-chat-strategy-header">
          <div class="stx-memory-chat-strategy-title-wrap">
            <div class="stx-memory-chat-strategy-title">
              <i class="fa-solid fa-sliders"></i>
              <span>聊天策略画像编辑器</span>
            </div>
            <div class="stx-memory-chat-strategy-subtitle">按聊天编辑记忆画像、自适应阈值入口与诊断信息，适配桌面和手机端。</div>
          </div>
          <div class="stx-memory-chat-strategy-header-actions">
            ${mobileToggleMarkup}
            ${refreshButtonMarkup}
            ${recomputeButtonMarkup}
            ${applyButtonMarkup}
            <button id="${EDITOR_IDS.closeBtnId}" type="button" class="stx-memory-chat-strategy-close" aria-label="关闭聊天策略编辑器">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>
        <div class="stx-memory-chat-strategy-body">
          <aside class="stx-memory-chat-strategy-sidebar">
            <div class="stx-memory-chat-strategy-sidebar-head">
              <span class="stx-memory-chat-strategy-sidebar-title">聊天列表</span>
              ${searchInputMarkup}
            </div>
            <div id="${EDITOR_IDS.chatListId}" class="stx-memory-chat-strategy-chat-list">
              <div class="stx-memory-chat-strategy-empty">正在加载聊天列表...</div>
            </div>
          </aside>
          <div class="stx-memory-chat-strategy-sidebar-scrim" aria-hidden="true"></div>
          <main class="stx-memory-chat-strategy-main">
            <section class="stx-memory-chat-strategy-hero">
              <div class="stx-memory-chat-strategy-hero-main">
                <div id="${EDITOR_IDS.currentChatNameId}" class="stx-memory-chat-strategy-hero-title">未选择聊天</div>
                <div id="${EDITOR_IDS.currentChatMetaId}" class="stx-memory-chat-strategy-hero-meta">等待加载聊天画像</div>
              </div>
              <div class="stx-memory-chat-strategy-hero-side">
                <span class="stx-memory-chat-strategy-hero-label">当前意图</span>
                <strong id="${EDITOR_IDS.currentIntentId}" class="stx-memory-chat-strategy-hero-intent">暂无</strong>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>最近注入区段</h3>
                  <p>用于快速确认当前聊天最近一次上下文注入的侧重点。</p>
                </div>
              </div>
              <div id="${EDITOR_IDS.sectionsWrapId}" class="stx-memory-chat-strategy-pill-wrap">
                <span class="stx-memory-chat-strategy-empty">暂无注入记录</span>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>基础画像</h3>
                  <p>这里决定该聊天的基础记忆风格和整体强度。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorSelectField(EDITOR_IDS.chatTypeId, '聊天类型', '切换该聊天的类型画像。', [
                    { value: 'solo', label: '单人' },
                    { value: 'group', label: '群聊' },
                    { value: 'worldbook', label: '世界书驱动' },
                    { value: 'tool', label: '工具型' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.stylePreferenceId, '风格偏好', '调整该聊天的内容风格偏好。', [
                    { value: 'story', label: '剧情型' },
                    { value: 'qa', label: '问答型' },
                    { value: 'trpg', label: '跑团型' },
                    { value: 'info', label: '信息型' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.memoryStrengthId, '记忆强度', '控制该聊天的整体记忆力度。', [
                    { value: 'low', label: '低' },
                    { value: 'medium', label: '中' },
                    { value: 'high', label: '高' },
                ])}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>抽取与摘要</h3>
                  <p>控制事实提取、关系抽取和摘要形态。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorSelectField(EDITOR_IDS.extractStrategyId, '抽取策略', '控制事实、关系与世界状态的抽取范围。', [
                    { value: 'facts_only', label: '只提事实' },
                    { value: 'facts_relations', label: '事实 + 关系' },
                    { value: 'facts_relations_world', label: '事实 + 关系 + 世界状态' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.summaryStrategyId, '摘要策略', '控制当前聊天的摘要组织方式。', [
                    { value: 'short', label: '短摘要' },
                    { value: 'layered', label: '分层摘要' },
                    { value: 'timeline', label: '时间段摘要' },
                ])}
                ${buildEditorSelectField(EDITOR_IDS.deletionStrategyId, '删除策略', '控制删除数据时是软删除还是立即清理。', [
                    { value: 'soft_delete', label: '软删除' },
                    { value: 'immediate_purge', label: '立即清理' },
                ])}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head">
                <div>
                  <h3>向量与保留</h3>
                  <p>为高信息密度聊天调优向量阈值与数据保留策略。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-toggle-wrap">
                ${buildSharedCheckboxCard({
                    id: EDITOR_IDS.vectorEnabledId,
                    title: '启用向量检索',
                    description: '关闭后，该聊天将尽量走轻量记忆路径。',
                    checkedLabel: '开启',
                    uncheckedLabel: '关闭',
                    containerClassName: 'stx-memory-chat-strategy-toggle',
                    inputAttributes: {
                        'data-tip': '控制当前聊天是否启用向量索引与检索。',
                    },
                })}
              </div>
              <div class="stx-memory-chat-strategy-form-grid">
                ${buildEditorInputField(EDITOR_IDS.vectorChunkThresholdId, '分块阈值', '达到该长度后才更积极地进入向量索引。', 'number', '50', '4000', '10')}
                ${buildEditorInputField(EDITOR_IDS.rerankThresholdId, '重排阈值', '候选数量达到该值后再触发 rerank。', 'number', '1', '50', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorActivationFactsId, 'Facts 启用阈值', 'facts 数量达到该值后优先进入向量检索阶段。', 'number', '1', '5000', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorActivationSummariesId, 'Summaries 启用阈值', 'summaries 数量达到该值后优先进入向量检索阶段。', 'number', '1', '5000', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorIdleDecayDaysId, '热度衰减天数', '超过该天数未命中后，向量模式会降档。', 'number', '1', '365', '1')}
                ${buildEditorInputField(EDITOR_IDS.vectorLowPrecisionStrideId, '低精度降频步长', '近期精度低时按该步长降频执行向量检索。', 'number', '1', '30', '1')}
                ${buildEditorInputField(EDITOR_IDS.keepVectorDaysId, '向量保留天数', '控制向量数据保留的时间窗口。', 'number', '1', '365', '1')}
                ${buildEditorInputField(EDITOR_IDS.keepSummaryCountId, '保留摘要数', '控制摘要记录的保留数量上限。', 'number', '10', '1000', '10')}
                ${buildEditorInputField(EDITOR_IDS.keepEventCountId, '保留事件数', '控制事件记录的保留数量上限。', 'number', '50', '5000', '50')}
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head" data-tip="直观展示当前聊天的整体健康度，包含各项指标明细、向量引擎当前的运行模式，以及系统的维护建议。">
                <div>
                  <h3>记忆质量与引擎状态</h3>
                  <p>查看当前聊天的质量评分、各项核心能力表现以及系统维护指引。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-quality-grid">
                <article class="stx-memory-chat-strategy-quality-card is-score" data-tip="结合聊天活跃度与记忆鲜活度得出的综合体检分数，随时了解该聊天是否“健康”。">
                  <span class="stx-memory-chat-strategy-quality-label">记忆综合评分</span>
                  <div class="stx-memory-chat-strategy-quality-score-wrap">
                    <strong id="${EDITOR_IDS.qualityScoreId}" class="stx-memory-chat-strategy-quality-score">--</strong>
                    <span id="${EDITOR_IDS.qualityLevelId}" class="stx-memory-chat-strategy-quality-level">--</span>
                  </div>
                  <div id="${EDITOR_IDS.qualityReasonsId}" class="stx-memory-chat-strategy-pill-wrap" style="margin-top: 8px;">
                    <span class="stx-memory-chat-strategy-empty">暂无状态说明</span>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="展示各维度的得分情况。满管表示该维度表现优异，缩水则代表存在数据稀疏或老化。">
                  <span class="stx-memory-chat-strategy-quality-label">各维度表现明细</span>
                  <div id="${EDITOR_IDS.qualityDimensionsId}" class="stx-memory-chat-strategy-quality-dimensions">
                    <span class="stx-memory-chat-strategy-empty">等待加载...</span>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="展示向量库在该聊天下的激活深度与数据量。">
                  <span class="stx-memory-chat-strategy-quality-label">向量引擎运转状态</span>
                  <strong id="${EDITOR_IDS.qualityVectorModeId}" class="stx-memory-chat-strategy-quality-meta" style="color: var(--stx-memory-info);">--</strong>
                  <div class="stx-memory-chat-strategy-quality-stats">
                    <div id="${EDITOR_IDS.qualityVectorStatsId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                    <div id="${EDITOR_IDS.qualityVectorTimesId}" class="stx-memory-chat-strategy-quality-subtext">--</div>
                  </div>
                </article>
                <article class="stx-memory-chat-strategy-quality-card" data-tip="系统根据数据表现自动生成的保养建议。如果这里空空如也，说明一切正常。">
                  <span class="stx-memory-chat-strategy-quality-label">系统维护与保养建议</span>
                  <div id="${EDITOR_IDS.qualityAdviceId}" class="stx-memory-chat-strategy-quality-list">
                    <span class="stx-memory-chat-strategy-empty">暂无建议，继续保持</span>
                  </div>
                </article>
              </div>
            </section>
            <section class="stx-memory-chat-strategy-section">
              <div class="stx-memory-chat-strategy-section-head" data-tip="用于查看系统在本聊天中的真实决策过程，帮助你定位为什么会这样注入、抽取和检索。">
                <div>
                  <h3>底层运行诊断面板</h3>
                  <p>监控系统如何处理自动策略与人工覆盖的合并效果，以及近期调参指标。</p>
                </div>
              </div>
              <div class="stx-memory-chat-strategy-diagnostic-grid">
                ${buildJsonCardMarkup(EDITOR_IDS.autoBlockId, '系统自动推测', '用于查看系统自动给出的初始配置，判断当前聊天默认会走什么策略。')}
                ${buildJsonCardMarkup(EDITOR_IDS.overrideBlockId, '人工锁定设置', '用于确认你手动覆盖了哪些项，以及这些覆盖会怎样改变系统默认行为。')}
                ${buildJsonCardMarkup(EDITOR_IDS.finalBlockId, '结合生效方案', '用于查看最终实际生效的规则，排查“配置看起来对但结果不对”的问题。')}
                ${buildJsonCardMarkup(EDITOR_IDS.decisionBlockId, '最新执行决策', '用于追踪最近一轮实际使用了哪些记忆区段，判断注入是否符合预期。')}
                ${buildJsonCardMarkup(EDITOR_IDS.metricsBlockId, '上下文动态指标', '用于观察输入输出和密度变化，辅助决定是否需要调阈值或重建摘要。')}
              </div>
            </section>
          </main>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：构建编辑器中的共享下拉字段。
 * @param id 字段 ID。
 * @param label 字段标题。
 * @param tip 提示文本。
 * @param options 下拉选项列表。
 * @returns 字段 HTML 字符串。
 */
function buildEditorSelectField(
    id: string,
    label: string,
    tip: string,
    options: Array<{ value: string; label: string }>,
): string {
    const selectMarkup: string = buildSharedSelectField({
        id,
        containerClassName: 'stx-memory-chat-strategy-select',
        selectClassName: 'stx-memory-chat-strategy-input',
        triggerClassName: 'stx-memory-chat-strategy-input',
        triggerAttributes: {
            'data-tip': tip,
        },
        options,
    });
    return `
      <label class="stx-memory-chat-strategy-field">
        <span class="stx-memory-chat-strategy-field-label">${label}</span>
        ${selectMarkup}
      </label>
    `.trim();
}

/**
 * 功能：构建编辑器中的共享输入字段。
 * @param id 字段 ID。
 * @param label 字段标题。
 * @param tip 提示文本。
 * @param type 输入类型。
 * @param min 最小值。
 * @param max 最大值。
 * @param step 步长。
 * @returns 字段 HTML 字符串。
 */
function buildEditorInputField(
    id: string,
    label: string,
    tip: string,
    type: 'text' | 'number' | 'search' | 'password',
    min?: string,
    max?: string,
    step?: string,
): string {
    const inputMarkup: string = buildSharedInputField({
        id,
        type,
        className: 'stx-memory-chat-strategy-input',
        attributes: {
            min,
            max,
            step,
            'data-tip': tip,
        },
    });
    return `
      <label class="stx-memory-chat-strategy-field">
        <span class="stx-memory-chat-strategy-field-label">${label}</span>
        ${inputMarkup}
      </label>
    `.trim();
}

/**
 * 功能：构建直观卡片。
 * @param bodyId 内容区域 ID。
 * @param title 卡片标题。
 * @param description 卡片描述。
 * @returns 卡片 HTML 字符串。
 */
function buildJsonCardMarkup(bodyId: string, title: string, description: string): string {
    return `
      <details class="stx-memory-chat-strategy-json-card" open>
        <summary data-tip="${description}">
          <span>${title}</span>
          <small>${description}</small>
        </summary>
        <div id="${bodyId}" class="stx-memory-chat-strategy-pretty-body">等待加载...</div>
      </details>
    `.trim();
}

/**
 * 功能：绑定概览卡交互事件。
 * @returns 无返回值。
 */
function bindCompactPanelListeners(): void {
    if (panelListenersBound) {
        return;
    }
    panelListenersBound = true;

    const chatSelect: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    chatSelect?.addEventListener('change', (): void => {
        selectedChatKey = String(chatSelect.value || '').trim();
        void renderCompactPanelState(selectedChatKey);
    });

    const openBtn: HTMLButtonElement | null = document.getElementById(PANEL_IDS.openBtnId) as HTMLButtonElement | null;
    openBtn?.addEventListener('click', (): void => {
        void openChatStrategyEditor();
    });

    const refreshBtn: HTMLButtonElement | null = document.getElementById(PANEL_IDS.refreshBtnId) as HTMLButtonElement | null;
    refreshBtn?.addEventListener('click', (): void => {
        void refreshChatStrategyChatOptions().then(async (): Promise<void> => {
            if (selectedChatKey) {
                await renderCompactPanelState(selectedChatKey);
            }
        });
    });
}

/**
 * 功能：在设置页打开后自动重试读取当前聊天策略，避免依赖手动刷新。
 * @returns 无返回值。
 */
function scheduleAutoLoadChatStrategyPanel(): void {
    if (autoLoadTimerId !== null) {
        window.clearTimeout(autoLoadTimerId);
        autoLoadTimerId = null;
    }
    autoLoadAttempts = 0;
    void runAutoLoadChatStrategyPanel();
}

/**
 * 功能：执行聊天策略概览卡的自动加载与重试逻辑。
 * @returns 无返回值。
 */
async function runAutoLoadChatStrategyPanel(): Promise<void> {
    const currentChatKey: string = getCurrentChatKey();
    if (currentChatKey) {
        selectedChatKey = currentChatKey;
    }
    await refreshChatStrategyChatOptions();
    if (selectedChatKey) {
        await renderCompactPanelState(selectedChatKey);
    }
    if (!shouldRetryAutoLoad()) {
        autoLoadTimerId = null;
        return;
    }
    autoLoadAttempts += 1;
    autoLoadTimerId = window.setTimeout((): void => {
        void runAutoLoadChatStrategyPanel();
    }, CHAT_STRATEGY_AUTO_LOAD_INTERVAL_MS);
}

/**
 * 功能：判断当前是否需要继续自动重试加载聊天策略摘要。
 * @returns 是否继续重试。
 */
function shouldRetryAutoLoad(): boolean {
    if (autoLoadAttempts >= CHAT_STRATEGY_AUTO_LOAD_MAX_ATTEMPTS) {
        return false;
    }
    if (!getCurrentChatKey()) {
        return true;
    }
    if (!cachedChatOptions.length) {
        return true;
    }
    return false;
}

/**
 * 功能：绑定编辑器内部事件。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function bindEditorListeners(overlay: HTMLElement): void {
    const closeBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.closeBtnId}`) as HTMLButtonElement | null;
    const mobileToggleBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.mobileToggleBtnId}`) as HTMLButtonElement | null;
    const refreshBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.refreshBtnId}`) as HTMLButtonElement | null;
    const recomputeBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.recomputeBtnId}`) as HTMLButtonElement | null;
    const applyBtn: HTMLButtonElement | null = overlay.querySelector(`#${EDITOR_IDS.applyBtnId}`) as HTMLButtonElement | null;
    const chatSearchInput: HTMLInputElement | null = overlay.querySelector(`#${EDITOR_IDS.chatSearchId}`) as HTMLInputElement | null;
    const chatList: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.chatListId}`) as HTMLElement | null;

    closeBtn?.addEventListener('click', (): void => {
        closeEditor(overlay);
    });
    mobileToggleBtn?.addEventListener('click', (): void => {
        overlay.classList.toggle('is-sidebar-open');
    });
    refreshBtn?.addEventListener('click', (): void => {
        void syncEditorChatOptions(overlay, selectedChatKey).then(async (): Promise<void> => {
            if (selectedChatKey) {
                await renderEditorState(overlay, selectedChatKey);
            }
        });
    });
    recomputeBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void recomputeSelectedChatPolicy(selectedChatKey).then(async (): Promise<void> => {
            await renderEditorState(overlay, selectedChatKey);
            await renderCompactPanelState(selectedChatKey);
        });
    });
    applyBtn?.addEventListener('click', (): void => {
        if (!selectedChatKey) {
            return;
        }
        void applySelectedChatOverrides(overlay, selectedChatKey).then(async (): Promise<void> => {
            await renderEditorState(overlay, selectedChatKey);
            await renderCompactPanelState(selectedChatKey);
        });
    });
    chatSearchInput?.addEventListener('input', (): void => {
        applyChatListFilter(overlay, String(chatSearchInput.value || ''));
    });
    chatList?.addEventListener('click', (event: Event): void => {
        const target: HTMLElement | null = (event.target as HTMLElement).closest<HTMLElement>('[data-chat-key]');
        if (!target) {
            return;
        }
        selectedChatKey = String(target.dataset.chatKey || '').trim();
        if (!selectedChatKey) {
            return;
        }
        overlay.classList.remove('is-sidebar-open');
        void renderEditorState(overlay, selectedChatKey).then(async (): Promise<void> => {
            await renderCompactPanelState(selectedChatKey);
        });
    });
    overlay.addEventListener('click', (event: Event): void => {
        const target: EventTarget | null = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (target === overlay) {
            closeEditor(overlay);
            return;
        }
        if (target.classList.contains('stx-memory-chat-strategy-sidebar-scrim')) {
            overlay.classList.remove('is-sidebar-open');
        }
    });
    document.addEventListener('keydown', createEscHandler(overlay), { once: true });
}

/**
 * 功能：创建用于关闭编辑器的 Esc 处理器。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 键盘事件处理函数。
 */
function createEscHandler(overlay: HTMLElement): (event: KeyboardEvent) => void {
    return (event: KeyboardEvent): void => {
        if (event.key === 'Escape' && overlay.isConnected) {
            closeEditor(overlay);
            return;
        }
        if (overlay.isConnected) {
            document.addEventListener('keydown', createEscHandler(overlay), { once: true });
        }
    };
}

/**
 * 功能：关闭全屏编辑器并恢复页面滚动。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 无返回值。
 */
function closeEditor(overlay: HTMLElement): void {
    overlay.classList.remove('is-visible');
    window.setTimeout((): void => {
        if (overlay.isConnected) {
            overlay.remove();
        }
        document.body.classList.remove('stx-memory-chat-strategy-lock-scroll');
    }, 180);
}

/**
 * 功能：同步编辑器中的聊天列表与当前选中项。
 * @param overlay 编辑器遮罩层根节点。
 * @param currentChatKey 当前选中的聊天键。
 * @returns 无返回值。
 */
async function syncEditorChatOptions(overlay: HTMLElement, currentChatKey: string): Promise<void> {
    cachedChatOptions = await loadChatOptions();
    const chatList: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.chatListId}`) as HTMLElement | null;
    if (!chatList) {
        return;
    }
    if (cachedChatOptions.length === 0) {
        chatList.innerHTML = '<div class="stx-memory-chat-strategy-empty">当前 Tavern 下没有可用聊天。</div>';
        applyChatStrategyTooltips();
        return;
    }
    chatList.innerHTML = cachedChatOptions
        .map((item: ChatOption): string => {
            const isActive: boolean = item.value === currentChatKey;
            const mediaMarkup: string = item.avatarUrl
                ? `<span class="stx-memory-chat-strategy-chat-avatar"><img src="${escapeHtml(item.avatarUrl)}" alt="${escapeHtml(item.label)}" /></span>`
                : `<span class="stx-memory-chat-strategy-chat-avatar is-icon"><i class="${escapeHtml(item.iconClassName || 'fa-solid fa-user')}"></i></span>`;
            return `
              <button type="button" class="stx-memory-chat-strategy-chat-item${isActive ? ' is-active' : ''}" data-chat-key="${escapeHtml(item.value)}">
                ${mediaMarkup}
                <span class="stx-memory-chat-strategy-chat-copy">
                  <span class="stx-memory-chat-strategy-chat-name">${escapeHtml(item.label)}</span>
                  <span class="stx-memory-chat-strategy-chat-key">${escapeHtml(item.value)}</span>
                </span>
              </button>
            `.trim();
        })
        .join('');
    applyChatListFilter(overlay, String((overlay.querySelector(`#${EDITOR_IDS.chatSearchId}`) as HTMLInputElement | null)?.value || ''));
    applyChatStrategyTooltips();
}

/**
 * 功能：根据搜索关键字过滤编辑器中的聊天列表。
 * @param overlay 编辑器遮罩层根节点。
 * @param keyword 搜索关键字。
 * @returns 无返回值。
 */
function applyChatListFilter(overlay: HTMLElement, keyword: string): void {
    const normalizedKeyword: string = keyword.trim().toLowerCase();
    overlay.querySelectorAll<HTMLElement>('.stx-memory-chat-strategy-chat-item').forEach((item: HTMLElement): void => {
        const text: string = item.textContent?.toLowerCase() || '';
        item.hidden = Boolean(normalizedKeyword) && !text.includes(normalizedKeyword);
    });
}

/**
 * 功能：渲染设置页概览卡摘要。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function renderCompactPanelState(chatKey: string): Promise<void> {
    const summaryName: HTMLElement | null = document.getElementById(PANEL_IDS.summaryNameId);
    const summaryIntent: HTMLElement | null = document.getElementById(PANEL_IDS.summaryIntentId);
    const summarySections: HTMLElement | null = document.getElementById(PANEL_IDS.summarySectionsId);
    const summaryProfile: HTMLElement | null = document.getElementById(PANEL_IDS.summaryProfileId);
    if (!summaryName || !summaryIntent || !summarySections || !summaryProfile) {
        return;
    }
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    replaceSummaryChips(summarySections, snapshot.decision?.sectionsUsed || []);
    summaryName.textContent = findChatLabel(chatKey);
    summaryIntent.textContent = formatIntentLabel(snapshot.decision?.intent || 'auto');
    summaryProfile.textContent = [
        formatChatTypeLabel(snapshot.effectiveProfile.chatType),
        formatStyleLabel(snapshot.effectiveProfile.stylePreference),
        formatMemoryStrengthLabel(snapshot.effectiveProfile.memoryStrength),
    ].join(' / ');
    const select: HTMLSelectElement | null = document.getElementById(PANEL_IDS.chatSelectId) as HTMLSelectElement | null;
    if (select && select.value !== chatKey) {
        select.value = chatKey;
        refreshSharedSelectOptions(document.getElementById(PANEL_IDS.rootId) || document.body);
    }
    applyChatStrategyTooltips();
}

/**
 * 功能：渲染全屏编辑器中的当前聊天状态。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function renderEditorState(overlay: HTMLElement, chatKey: string): Promise<void> {
    const snapshot: ChatStrategySnapshot = await loadChatStrategySnapshot(chatKey);
    fillEditorForm(overlay, snapshot.effectiveProfile, snapshot.effectiveRetention);
    updateEditorHeader(overlay, snapshot);
    updateQualityPanel(overlay, snapshot);
    updateChatListActiveState(overlay, chatKey);
    writeJsonBlock(overlay, EDITOR_IDS.autoBlockId, {
        chatProfile: snapshot.autoProfile,
        adaptivePolicy: snapshot.autoPolicy,
        retentionPolicy: snapshot.autoRetention,
    });
    writeJsonBlock(overlay, EDITOR_IDS.overrideBlockId, snapshot.overrides);
    writeJsonBlock(overlay, EDITOR_IDS.finalBlockId, {
        chatProfile: snapshot.effectiveProfile,
        adaptivePolicy: snapshot.effectivePolicy,
        retentionPolicy: snapshot.effectiveRetention,
    });
    writeJsonBlock(overlay, EDITOR_IDS.metricsBlockId, snapshot.metrics);
    writeJsonBlock(overlay, EDITOR_IDS.decisionBlockId, snapshot.decision ?? {
        tip: '暂无注入决策，下次注入后会显示在这里。',
    });
    applyChatStrategyTooltips();
}

/**
 * 功能：读取聊天策略快照，供概览卡与编辑器复用。
 * @param chatKey 聊天键。
 * @returns 聊天策略快照。
 */
async function loadChatStrategySnapshot(chatKey: string): Promise<ChatStrategySnapshot> {
    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        const state = await manager.load();
        const effectiveProfile: ChatProfile = await manager.getChatProfile();
        const effectivePolicy: AdaptivePolicy = await manager.getAdaptivePolicy();
        const effectiveRetention: RetentionPolicy = await manager.getRetentionPolicy();
        const metrics: AdaptiveMetrics = await manager.getAdaptiveMetrics();
        const vectorLifecycle: VectorLifecycleState = await manager.getVectorLifecycle();
        const memoryQuality: MemoryQualityScorecard = await manager.getMemoryQuality();
        const maintenanceAdvice: MaintenanceAdvice[] = await manager.getMaintenanceAdvice();
        const decision: StrategyDecision | null = await manager.getLastStrategyDecision();
        const autoProfile: ChatProfile = state.chatProfile ?? DEFAULT_CHAT_PROFILE;
        const autoPolicy: AdaptivePolicy = state.adaptivePolicy
            ?? buildAdaptivePolicy(autoProfile, state.adaptiveMetrics ?? DEFAULT_ADAPTIVE_METRICS, state.vectorLifecycle, state.memoryQuality);
        const autoRetention: RetentionPolicy = state.retentionPolicy ?? buildRetentionPolicy(autoProfile);
        return {
            chatKey,
            autoProfile,
            autoPolicy,
            autoRetention,
            effectiveProfile,
            effectivePolicy,
            effectiveRetention,
            metrics,
            vectorLifecycle: {
                ...DEFAULT_VECTOR_LIFECYCLE,
                ...vectorLifecycle,
            },
            memoryQuality: {
                ...DEFAULT_MEMORY_QUALITY,
                ...memoryQuality,
                dimensions: {
                    ...DEFAULT_MEMORY_QUALITY.dimensions,
                    ...(memoryQuality?.dimensions ?? {}),
                },
            },
            maintenanceAdvice,
            decision,
            overrides: (state.manualOverrides ?? {}) as Record<string, unknown>,
        };
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：重算指定聊天的自动策略。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function recomputeSelectedChatPolicy(chatKey: string): Promise<void> {
    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        await manager.load();
        await manager.recomputeAdaptivePolicy();
        await manager.recomputeMemoryQuality();
        await manager.flush();
        if (chatKey === getCurrentChatKey()) {
            const currentChatState: MemoryChatStateApi | undefined = getWindowMemoryChatState();
            if (currentChatState) {
                await currentChatState.recomputeAdaptivePolicy();
                if (typeof currentChatState.recomputeMemoryQuality === 'function') {
                    await currentChatState.recomputeMemoryQuality();
                }
                await currentChatState.flush();
            }
        }
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：保存当前编辑器表单中的覆盖配置。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function applySelectedChatOverrides(overlay: HTMLElement, chatKey: string): Promise<void> {
    const profileOverride: Partial<ChatProfile> = collectProfileOverrideFromForm(overlay);
    const retentionOverride: Partial<RetentionPolicy> = collectRetentionOverrideFromForm(overlay);
    const currentChatState: MemoryChatStateApi | undefined = chatKey === getCurrentChatKey() ? getWindowMemoryChatState() : undefined;

    if (currentChatState) {
        await currentChatState.setChatProfileOverride(profileOverride);
        await currentChatState.setRetentionPolicyOverride(retentionOverride);
        await currentChatState.recomputeAdaptivePolicy();
        await currentChatState.flush();
        return;
    }

    const manager: ChatStateManager = new ChatStateManager(chatKey);
    try {
        await manager.load();
        await manager.setChatProfileOverride(profileOverride);
        await manager.setRetentionPolicyOverride(retentionOverride);
        await manager.recomputeAdaptivePolicy();
        await manager.flush();
    } finally {
        await manager.destroy();
    }
}

/**
 * 功能：根据快照更新编辑器头部摘要。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function updateEditorHeader(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const nameElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatNameId}`) as HTMLElement | null;
    const metaElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentChatMetaId}`) as HTMLElement | null;
    const intentElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.currentIntentId}`) as HTMLElement | null;
    const sectionsWrap: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.sectionsWrapId}`) as HTMLElement | null;
    if (!nameElement || !metaElement || !intentElement || !sectionsWrap) {
        return;
    }
    nameElement.textContent = findChatLabel(snapshot.chatKey);
    metaElement.textContent = [
        formatChatTypeLabel(snapshot.effectiveProfile.chatType),
        formatStyleLabel(snapshot.effectiveProfile.stylePreference),
        formatMemoryStrengthLabel(snapshot.effectiveProfile.memoryStrength),
        snapshot.effectiveProfile.vectorStrategy.enabled ? '向量开启' : '向量关闭',
    ].join(' · ');
    intentElement.textContent = formatIntentLabel(snapshot.decision?.intent || 'auto');
    replaceSummaryChips(sectionsWrap, snapshot.decision?.sectionsUsed || []);
}

/**
 * 功能：更新质量与向量状态面板。
 * @param overlay 编辑器遮罩层根节点。
 * @param snapshot 聊天策略快照。
 * @returns 无返回值。
 */
function updateQualityPanel(overlay: HTMLElement, snapshot: ChatStrategySnapshot): void {
    const scoreElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityScoreId}`) as HTMLElement | null;
    const levelElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityLevelId}`) as HTMLElement | null;
    const dimensionsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityDimensionsId}`) as HTMLElement | null;
    const vectorModeElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorModeId}`) as HTMLElement | null;
    const vectorStatsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorStatsId}`) as HTMLElement | null;
    const vectorTimesElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityVectorTimesId}`) as HTMLElement | null;
    const adviceElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityAdviceId}`) as HTMLElement | null;
    const reasonsElement: HTMLElement | null = overlay.querySelector(`#${EDITOR_IDS.qualityReasonsId}`) as HTMLElement | null;
    if (!scoreElement || !levelElement || !dimensionsElement || !vectorModeElement || !vectorStatsElement || !vectorTimesElement || !adviceElement || !reasonsElement) {
        return;
    }

    const quality = snapshot.memoryQuality;
    const lifecycle = snapshot.vectorLifecycle;

    scoreElement.textContent = String(Math.max(0, Math.min(100, Number(quality.totalScore ?? 0))));
    levelElement.textContent = formatMemoryQualityLevelLabel(String(quality.level ?? 'healthy'));

    dimensionsElement.innerHTML = Object.entries(quality.dimensions ?? {})
        .map(([key, value]): string => {
            const ratio = Math.max(0, Math.min(1, Number(value ?? 0)));
            const percent = Math.round(ratio * 100);
            return `
              <div class="stx-memory-chat-strategy-dimension-item">
                <span class="stx-memory-chat-strategy-dimension-label">${escapeHtml(formatQualityDimensionLabel(key))}</span>
                <div class="stx-memory-chat-strategy-progress">
                    <div class="stx-memory-chat-strategy-progress-bar" style="width: ${percent}%;"></div>
                </div>
                <span class="stx-memory-chat-strategy-dimension-value">${percent}%</span>
              </div>
            `.trim();
        })
        .join('');

    vectorModeElement.textContent = formatVectorModeLabel(
        String(lifecycle.vectorMode ?? snapshot.effectivePolicy.vectorMode ?? 'off'),
        snapshot.effectiveProfile.vectorStrategy.enabled
    );
    vectorStatsElement.innerHTML = `<span class="stx-memory-vector-stat"><i class="fa-solid fa-brain"></i> 事实: ${Number(lifecycle.factCount ?? 0)}</span> <span class="stx-memory-vector-stat"><i class="fa-solid fa-list-check"></i> 摘要: ${Number(lifecycle.summaryCount ?? 0)}</span> <span class="stx-memory-vector-stat"><i class="fa-solid fa-cubes"></i> 检索分块: ${Number(lifecycle.vectorChunkCount ?? 0)}</span>`;
    vectorTimesElement.innerHTML = `<strong>最近激活</strong>: 访问 ${formatTimestamp(lifecycle.lastAccessAt)} · 命中 ${formatTimestamp(lifecycle.lastHitAt)} · 索引 ${formatTimestamp(lifecycle.lastIndexAt)}`;

    if (!Array.isArray(snapshot.maintenanceAdvice) || snapshot.maintenanceAdvice.length === 0) {
        adviceElement.innerHTML = '<span class="stx-memory-chat-strategy-empty">暂无建议</span>';
    } else {
        adviceElement.innerHTML = snapshot.maintenanceAdvice
            .map((item): string => `
              <div class="stx-memory-chat-strategy-quality-advice-item">
                <strong>${escapeHtml(item.title)}</strong>
                <span>${escapeHtml(item.detail)}</span>
              </div>
            `.trim())
            .join('');
    }

    if (Array.isArray(quality.reasonCodes) && quality.reasonCodes.length > 0) {
        const scoreWrap = overlay.querySelector(`#${EDITOR_IDS.qualityReasonsId}`);
        if (scoreWrap) {
            scoreWrap.innerHTML = quality.reasonCodes
                .map((code: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(code)}</span>`)
                .join('');
        }
    }
}

/**
 * 功能：将快照中的配置写回编辑器表单。
 * @param overlay 编辑器遮罩层根节点。
 * @param profile 当前生效画像。
 * @param retention 当前生效保留策略。
 * @returns 无返回值。
 */
function fillEditorForm(overlay: HTMLElement, profile: ChatProfile, retention: RetentionPolicy): void {
    setSelectValue(overlay, EDITOR_IDS.chatTypeId, profile.chatType);
    setSelectValue(overlay, EDITOR_IDS.stylePreferenceId, profile.stylePreference);
    setSelectValue(overlay, EDITOR_IDS.memoryStrengthId, profile.memoryStrength);
    setSelectValue(overlay, EDITOR_IDS.extractStrategyId, profile.extractStrategy);
    setSelectValue(overlay, EDITOR_IDS.summaryStrategyId, profile.summaryStrategy);
    setSelectValue(overlay, EDITOR_IDS.deletionStrategyId, profile.deletionStrategy);
    setCheckboxValue(overlay, EDITOR_IDS.vectorEnabledId, profile.vectorStrategy.enabled);
    setInputValue(overlay, EDITOR_IDS.vectorChunkThresholdId, profile.vectorStrategy.chunkThreshold);
    setInputValue(overlay, EDITOR_IDS.rerankThresholdId, profile.vectorStrategy.rerankThreshold);
    setInputValue(overlay, EDITOR_IDS.vectorActivationFactsId, profile.vectorStrategy.activationFacts);
    setInputValue(overlay, EDITOR_IDS.vectorActivationSummariesId, profile.vectorStrategy.activationSummaries);
    setInputValue(overlay, EDITOR_IDS.vectorIdleDecayDaysId, profile.vectorStrategy.idleDecayDays);
    setInputValue(overlay, EDITOR_IDS.vectorLowPrecisionStrideId, profile.vectorStrategy.lowPrecisionSearchStride);
    setInputValue(overlay, EDITOR_IDS.keepSummaryCountId, retention.keepSummaryCount);
    setInputValue(overlay, EDITOR_IDS.keepEventCountId, retention.keepEventCount);
    setInputValue(overlay, EDITOR_IDS.keepVectorDaysId, retention.keepVectorDays);
    refreshSharedSelectOptions(overlay);
}

/**
 * 功能：从编辑器表单采集画像覆盖值。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 聊天画像覆盖对象。
 */
function collectProfileOverrideFromForm(overlay: HTMLElement): Partial<ChatProfile> {
    return {
        chatType: getSelectValue(overlay, EDITOR_IDS.chatTypeId) as ChatProfile['chatType'],
        stylePreference: getSelectValue(overlay, EDITOR_IDS.stylePreferenceId) as ChatProfile['stylePreference'],
        memoryStrength: getSelectValue(overlay, EDITOR_IDS.memoryStrengthId) as ChatProfile['memoryStrength'],
        extractStrategy: getSelectValue(overlay, EDITOR_IDS.extractStrategyId) as ChatProfile['extractStrategy'],
        summaryStrategy: getSelectValue(overlay, EDITOR_IDS.summaryStrategyId) as ChatProfile['summaryStrategy'],
        deletionStrategy: getSelectValue(overlay, EDITOR_IDS.deletionStrategyId) as DeletionStrategy,
        vectorStrategy: {
            enabled: getCheckboxValue(overlay, EDITOR_IDS.vectorEnabledId),
            chunkThreshold: getNumberValue(overlay, EDITOR_IDS.vectorChunkThresholdId, DEFAULT_CHAT_PROFILE.vectorStrategy.chunkThreshold),
            rerankThreshold: getNumberValue(overlay, EDITOR_IDS.rerankThresholdId, DEFAULT_CHAT_PROFILE.vectorStrategy.rerankThreshold),
            activationFacts: getNumberValue(overlay, EDITOR_IDS.vectorActivationFactsId, DEFAULT_CHAT_PROFILE.vectorStrategy.activationFacts),
            activationSummaries: getNumberValue(overlay, EDITOR_IDS.vectorActivationSummariesId, DEFAULT_CHAT_PROFILE.vectorStrategy.activationSummaries),
            idleDecayDays: getNumberValue(overlay, EDITOR_IDS.vectorIdleDecayDaysId, DEFAULT_CHAT_PROFILE.vectorStrategy.idleDecayDays),
            lowPrecisionSearchStride: getNumberValue(overlay, EDITOR_IDS.vectorLowPrecisionStrideId, DEFAULT_CHAT_PROFILE.vectorStrategy.lowPrecisionSearchStride),
        },
    };
}

/**
 * 功能：从编辑器表单采集保留策略覆盖值。
 * @param overlay 编辑器遮罩层根节点。
 * @returns 保留策略覆盖对象。
 */
function collectRetentionOverrideFromForm(overlay: HTMLElement): Partial<RetentionPolicy> {
    return {
        deletionStrategy: getSelectValue(overlay, EDITOR_IDS.deletionStrategyId) as DeletionStrategy,
        keepSummaryCount: getNumberValue(overlay, EDITOR_IDS.keepSummaryCountId, DEFAULT_RETENTION_POLICY.keepSummaryCount),
        keepEventCount: getNumberValue(overlay, EDITOR_IDS.keepEventCountId, DEFAULT_RETENTION_POLICY.keepEventCount),
        keepVectorDays: getNumberValue(overlay, EDITOR_IDS.keepVectorDaysId, DEFAULT_RETENTION_POLICY.keepVectorDays),
    };
}

/**
 * 功能：更新聊天列表中的激活项样式。
 * @param overlay 编辑器遮罩层根节点。
 * @param chatKey 当前聊天键。
 * @returns 无返回值。
 */
function updateChatListActiveState(overlay: HTMLElement, chatKey: string): void {
    overlay.querySelectorAll<HTMLElement>('.stx-memory-chat-strategy-chat-item').forEach((item: HTMLElement): void => {
        item.classList.toggle('is-active', String(item.dataset.chatKey || '') === chatKey);
    });
}

/**
 * 功能：将机器字典转换为人类易读名。
 * @param key 字段名。
 * @returns 友好的字段名。
 */
function translateDiagnosticKey(key: string): string {
    const dict: Record<string, string> = {
        chatProfile: '基础配置',
        adaptivePolicy: '自适应策略',
        retentionPolicy: '数据保留',
        chatType: '聊天结构',
        stylePreference: '响应风格',
        memoryStrength: '记忆干预度',
        extractStrategy: '提取核心',
        summaryStrategy: '摘要格式',
        deletionStrategy: '清理模式',
        vectorStrategy: '库检索引擎',
        enabled: '总开关',
        chunkThreshold: '切分字数',
        rerankThreshold: '重排触发线',
        activationFacts: '事实启动水位',
        activationSummaries: '摘要启动水位',
        idleDecayDays: '冷却休眠期(天)',
        lowPrecisionSearchStride: '低清步进补偿',
        keepSummaryCount: '保留摘要数',
        keepEventCount: '保留事件数',
        keepVectorDays: '保留天数',
        vectorMode: '当前运转模式',
        maintenanceMode: '深度维护状态',
        budgetMaxTokens: '投入上限',
        budgetReservedTokens: '容忍阈值',
        budgetFacts: '事实预算',
        budgetEvents: '事件预算',
        budgetSummaries: '摘要预算',
        intent: '本次研判意图',
        sectionsUsed: '本次激活区块',
        reason: '产生原因',
        adaptiveMetrics: '近况指标',
        messageInputRatio: '长短交流比',
        recentDensity: '有效信息密度',
        userInvolvement: '交互频繁度'
    };
    return dict[key] || key;
}

/**
 * 功能：构建诊断字段键名的中文提示文案。
 * @param key 字段键名。
 * @returns 中文提示文案。
 */
function buildDiagnosticKeyTip(key: string): string {
    const label: string = translateDiagnosticKey(key);
    return `${label}：用于说明该诊断字段当前值的来源与作用，帮助你定位策略是否按预期生效。`;
}

/**
 * 功能：把对象写入诊断卡片，使用自然语言渲染机制。
 * @param overlay 编辑器遮罩层根节点。
 * @param blockId 内容区域 ID。
 * @param payload 要展示的对象。
 * @returns 无返回值。
 */
function writeJsonBlock(overlay: HTMLElement, blockId: string, payload: unknown): void {
    const target: HTMLElement | null = overlay.querySelector(`#${blockId}`) as HTMLElement | null;
    if (!target) {
        return;
    }

    function renderNode(obj: unknown, depth: number = 0): string {
        if (obj == null) return '<span class="stx-memory-diag-val is-null">空</span>';
        if (typeof obj === 'boolean') return `<span class="stx-memory-diag-val is-bool">${obj ? '开启' : '关闭'}</span>`;
        if (typeof obj === 'number') return `<span class="stx-memory-diag-val is-num">${obj}</span>`;
        if (typeof obj === 'string') return `<span class="stx-memory-diag-val is-str">${escapeHtml(obj)}</span>`;

        if (Array.isArray(obj)) {
            if (obj.length === 0) return '<span class="stx-memory-diag-val is-empty">无内容</span>';
            const items = obj.map(v => `<div class="stx-memory-diag-array-item">${renderNode(v, depth + 1)}</div>`).join('');
            return `<div class="stx-memory-diag-array">${items}</div>`;
        }

        if (typeof obj === 'object') {
            const keys = Object.keys(obj as object);
            if (keys.length === 0) return '<span class="stx-memory-diag-val is-empty">未设置</span>';

            const rows = keys.map(k => {
                const val = (obj as Record<string, unknown>)[k];
                return `
                    <div class="stx-memory-diag-row">
                        <span class="stx-memory-diag-key" data-tip="${escapeHtml(buildDiagnosticKeyTip(k))}">${escapeHtml(translateDiagnosticKey(k))}</span>
                        <div class="stx-memory-diag-value">${renderNode(val, depth + 1)}</div>
                    </div>
                `;
            }).join('');
            return `<div class="stx-memory-diag-object" style="padding-left: ${depth > 0 ? 8 : 0}px;">${rows}</div>`;
        }

        return '<span class="stx-memory-diag-val">未知类型</span>';
    }

    target.innerHTML = renderNode(payload);
}

/**
 * 功能：格式化记忆质量等级标签。
 * @param value 等级值。
 * @returns 中文标签。
 */
function formatMemoryQualityLevelLabel(value: string): string {
    if (value === 'excellent') {
        return '优秀';
    }
    if (value === 'healthy') {
        return '健康';
    }
    if (value === 'watch') {
        return '关注';
    }
    if (value === 'poor') {
        return '偏低';
    }
    if (value === 'critical') {
        return '危险';
    }
    return value || '未知';
}

/**
 * 功能：格式化质量分项标签。
 * @param key 分项键。
 * @returns 中文标签。
 */
function formatQualityDimensionLabel(key: string): string {
    if (key === 'duplicateRate') {
        return '去重质量';
    }
    if (key === 'retrievalPrecision') {
        return '检索精度';
    }
    if (key === 'extractAcceptance') {
        return '抽取接受率';
    }
    if (key === 'summaryFreshness') {
        return '摘要新鲜度';
    }
    if (key === 'tokenEfficiency') {
        return 'Token 效率';
    }
    if (key === 'orphanFactsRatio') {
        return '孤儿事实比例';
    }
    if (key === 'schemaHygiene') {
        return 'Schema 卫生';
    }
    return key;
}

/**
 * 功能：格式化向量模式标签。
 * @param value 向量模式。
 * @param isEnabled 全局向量是否处于开启状态。
 * @returns 中文标签。
 */
function formatVectorModeLabel(value: string, isEnabled: boolean = false): string {
    if (!isEnabled) {
        return '未开启';
    }
    if (value === 'off') {
        return '待机 (未达阈值)';
    }
    if (value === 'index_only') {
        return '仅索引 (构建中)';
    }
    if (value === 'search') {
        return '检索激活';
    }
    if (value === 'search_rerank') {
        return '深度检索 (+重排)';
    }
    return value || '未知';
}

/**
 * 功能：格式化时间戳显示。
 * @param value 时间戳。
 * @returns 可读时间。
 */
function formatTimestamp(value: number): string {
    const ts = Number(value ?? 0);
    if (!Number.isFinite(ts) || ts <= 0) {
        return '暂无';
    }
    try {
        return new Date(ts).toLocaleString();
    } catch {
        return '暂无';
    }
}

/**
 * 功能：替换摘要区段标签。
 * @param container 标签容器。
 * @param sections 区段列表。
 * @returns 无返回值。
 */
function replaceSummaryChips(container: HTMLElement, sections: string[]): void {
    if (!sections.length) {
        container.innerHTML = '<span class="stx-memory-chat-strategy-empty">暂无注入记录</span>';
        return;
    }
    container.innerHTML = sections
        .map((section: string): string => `<span class="stx-memory-chat-strategy-pill">${escapeHtml(formatSectionLabel(section))}</span>`)
        .join('');
}

/**
 * 功能：加载当前 Tavern 下的聊天选项。
 * @returns 聊天选项列表。
 */
async function loadChatOptions(): Promise<ChatOption[]> {
    const currentChatKey: string = getCurrentChatKey();
    const chats: unknown[] = await listTavernChatsForCurrentTavernEvent().catch((): unknown[] => []);
    const options: ChatOption[] = chats.map((item: unknown): ChatOption => {
        const locator: SdkTavernChatLocatorEvent = ((item as { locator?: SdkTavernChatLocatorEvent })?.locator ?? {
            chatId: '',
            scopeType: 'character',
            scopeId: '',
            roleKey: '',
            roleId: '',
            displayName: '',
            avatarUrl: '',
            groupId: '',
            characterId: 0,
            currentChatId: '',
            tavernInstanceId: '',
        }) as SdkTavernChatLocatorEvent;
        const chatKey: string = buildTavernChatScopedKeyEvent(locator);
        const displayName: string = String(locator.displayName ?? locator.chatId ?? '未命名聊天');
        const chatId: string = String(locator.chatId ?? '');
        return {
            value: chatKey,
            label: `${displayName}${chatId ? ` (${chatId})` : ''}`,
            avatarUrl: String(locator.avatarUrl ?? '').trim(),
            iconClassName: locator.scopeType === 'group' ? 'fa-solid fa-users' : 'fa-solid fa-user',
        };
    });
    if (currentChatKey && !options.some((item: ChatOption): boolean => item.value === currentChatKey)) {
        options.unshift({
            value: currentChatKey,
            label: `当前聊天 (${currentChatKey})`,
            avatarUrl: '',
            iconClassName: 'fa-solid fa-user',
        });
    }
    return options;
}

/**
 * 功能：把选项写入指定原生下拉框。
 * @param select 原生下拉框。
 * @param options 选项列表。
 * @param selectedValue 当前选中值。
 * @returns 无返回值。
 */
function replaceSelectOptions(select: HTMLSelectElement, options: ChatOption[], selectedValue: string): void {
    select.innerHTML = options
        .map((item: ChatOption): string => {
            const mediaAttributes: string = item.avatarUrl
                ? ` data-media-type="image" data-media-src="${escapeHtml(item.avatarUrl)}" data-media-alt="${escapeHtml(item.label)}"`
                : ` data-media-type="icon" data-media-icon="${escapeHtml(item.iconClassName || 'fa-solid fa-user')}"`;
            return `<option value="${escapeHtml(item.value)}"${mediaAttributes}>${escapeHtml(item.label)}</option>`;
        })
        .join('');
    if (selectedValue && options.some((item: ChatOption): boolean => item.value === selectedValue)) {
        select.value = selectedValue;
    }
}

/**
 * 功能：读取当前聊天键。
 * @returns 当前聊天键。
 */
function getCurrentChatKey(): string {
    return String(((window as unknown as WindowWithMemory).STX?.memory?.getChatKey?.()) ?? '').trim();
}

/**
 * 功能：读取窗口中的聊天状态 API。
 * @returns 聊天状态 API 或空值。
 */
function getWindowMemoryChatState(): MemoryChatStateApi | undefined {
    return (window as unknown as WindowWithMemory).STX?.memory?.chatState;
}

/**
 * 功能：根据聊天键查找展示名称。
 * @param chatKey 聊天键。
 * @returns 展示名称。
 */
function findChatLabel(chatKey: string): string {
    return cachedChatOptions.find((item: ChatOption): boolean => item.value === chatKey)?.label || chatKey || '未选择聊天';
}

/**
 * 功能：设置下拉框的当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param value 目标值。
 * @returns 无返回值。
 */
function setSelectValue(root: ParentNode, id: string, value: string): void {
    const element: HTMLSelectElement | null = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    if (element) {
        element.value = value;
    }
}

/**
 * 功能：读取下拉框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @returns 下拉框值。
 */
function getSelectValue(root: ParentNode, id: string): string {
    const element: HTMLSelectElement | null = root.querySelector(`#${id}`) as HTMLSelectElement | null;
    return String(element?.value ?? '').trim();
}

/**
 * 功能：设置复选框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param checked 是否选中。
 * @returns 无返回值。
 */
function setCheckboxValue(root: ParentNode, id: string, checked: boolean): void {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    if (element) {
        element.checked = checked;
    }
}

/**
 * 功能：读取复选框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @returns 是否选中。
 */
function getCheckboxValue(root: ParentNode, id: string): boolean {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    return element?.checked === true;
}

/**
 * 功能：设置输入框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param value 目标值。
 * @returns 无返回值。
 */
function setInputValue(root: ParentNode, id: string, value: number): void {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    if (element) {
        element.value = String(value);
    }
}

/**
 * 功能：读取数字输入框当前值。
 * @param root 根节点。
 * @param id 元素 ID。
 * @param fallback 兜底值。
 * @returns 数字值。
 */
function getNumberValue(root: ParentNode, id: string, fallback: number): number {
    const element: HTMLInputElement | null = root.querySelector(`#${id}`) as HTMLInputElement | null;
    const numeric: number = Number(element?.value ?? fallback);
    return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * 功能：格式化聊天类型标签。
 * @param value 聊天类型值。
 * @returns 中文标签。
 */
function formatChatTypeLabel(value: string): string {
    if (value === 'group') {
        return '群聊';
    }
    if (value === 'worldbook') {
        return '世界书驱动';
    }
    if (value === 'tool') {
        return '工具型';
    }
    return '单人';
}

/**
 * 功能：格式化风格偏好标签。
 * @param value 风格值。
 * @returns 中文标签。
 */
function formatStyleLabel(value: string): string {
    if (value === 'qa') {
        return '问答型';
    }
    if (value === 'trpg') {
        return '跑团型';
    }
    if (value === 'info') {
        return '信息型';
    }
    return '剧情型';
}

/**
 * 功能：格式化记忆强度标签。
 * @param value 强度值。
 * @returns 中文标签。
 */
function formatMemoryStrengthLabel(value: string): string {
    if (value === 'low') {
        return '低强度';
    }
    if (value === 'high') {
        return '高强度';
    }
    return '中强度';
}

/**
 * 功能：格式化意图标签。
 * @param value 意图值。
 * @returns 中文标签。
 */
function formatIntentLabel(value: string): string {
    if (value === 'setting_qa') {
        return '设定问答';
    }
    if (value === 'story_continue') {
        return '剧情续写';
    }
    if (value === 'roleplay') {
        return '角色扮演';
    }
    if (value === 'tool_qa') {
        return '工具问答';
    }
    return '自动判断';
}

/**
 * 功能：格式化注入区段标签。
 * @param value 区段值。
 * @returns 中文标签。
 */
function formatSectionLabel(value: string): string {
    if (value === 'WORLD_STATE') {
        return '世界状态';
    }
    if (value === 'FACTS') {
        return '事实';
    }
    if (value === 'EVENTS') {
        return '事件';
    }
    if (value === 'SUMMARY') {
        return '摘要';
    }
    if (value === 'CHARACTER_FACTS') {
        return '角色事实';
    }
    if (value === 'RELATIONSHIPS') {
        return '关系';
    }
    if (value === 'LAST_SCENE') {
        return '最近场景';
    }
    if (value === 'SHORT_SUMMARY') {
        return '短摘要';
    }
    return value;
}

/**
 * 功能：转义 HTML 文本。
 * @param input 原始文本。
 * @returns 转义后的文本。
 */
function escapeHtml(input: string): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
