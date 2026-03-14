import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import type { BudgetConfig } from '../budget/budget-manager';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { buildSharedSelectField, hydrateSharedSelects, refreshSharedSelectOptions, syncSharedSelects } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { mountThemeHost, unmountThemeHost, initThemeKernel, subscribeTheme } from '../../../SDK/theme';
import { getTavernConnectionSnapshot } from '../../../SDK/tavern';
import type { TavernConnectionInfoItem, TavernConnectionSnapshot } from '../../../SDK/tavern';
import { discoverConsumers } from '../discovery/consumer-discovery';
import type { DiscoveredConsumer } from '../discovery/consumer-discovery';
import type {
    LLMHubSettings,
    GlobalCapabilityDefault,
    PluginCapabilityDefault,
    TaskOverride,
    ConsumerSnapshot,
    TaskDescriptor,
    CapabilityKind,
    LLMCapability,
    SilentPermissionGrant,
} from '../schema/types';

let LLMHUB_THEME_BINDING_READY = false;
let LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE: (() => void) | null = null;
let LLMHUB_CONSUMER_DISCOVERY_SEQ = 0;

// ─── 运行时类型声明 ───

type ProviderLite = { id: string };

type LLMHubRuntime = {
    saveCredential?: (providerId: string, apiKey: string) => Promise<void>;
    clearAllCredentials?: () => Promise<void>;
    applySettingsFromContext?: () => Promise<void>;
    setBudgetConfig?: (consumer: string, config: BudgetConfig) => void;
    removeBudgetConfig?: (consumer: string) => void;
    registry?: {
        listConsumerRegistrations?: () => ConsumerSnapshot[];
        subscribe?: (listener: () => void) => (() => void);
    };
    router?: {
        getAllProviders?: () => ProviderLite[];
        getProvider?: (id: string) => ProviderWithTest | null;
        getProviderCapabilities?: (providerId: string) => LLMCapability[];
        listProvidersWithCapabilities?: (required?: LLMCapability[]) => ProviderLite[];
        applyGlobalDefaults?: (defaults: GlobalCapabilityDefault[]) => void;
        applyPluginDefaults?: (defaults: PluginCapabilityDefault[]) => void;
        applyTaskOverrides?: (overrides: TaskOverride[]) => void;
    };
    orchestrator?: {
        getQueueSnapshot?: () => {
            pending: Array<{ requestId: string; consumer: string; taskId: string; queuedAt: number }>;
            active: { requestId: string; consumer: string; taskId: string; state: string } | null;
            recentHistory: Array<{ requestId: string; consumer: string; taskId: string; state: string; finishedAt?: number }>;
        };
    };
    displayController?: {
        exportSilentPermissions?: () => SilentPermissionGrant[];
        grantSilentPermission?: (pluginId: string, taskId: string) => void;
        revokeSilentPermission?: (pluginId: string, taskId: string) => void;
    };
    sdk?: {
        setGlobalProfile?: (profile: string) => void;
    };
};

type ProviderWithTest = ProviderLite & {
    testConnection?: () => Promise<{ ok: boolean; message: string; errorCode?: string; detail?: string; model?: string; latencyMs?: number }>;
    listModels?: () => Promise<{ ok: boolean; models: { id: string; label?: string }[]; message: string; errorCode?: string; detail?: string }>;
};

// ─── 常量 ───

const NAMESPACE = 'stx-llmhub';
const PROFILE_LABELS: Record<string, string> = {
    balanced: '平衡',
    precise: '精准',
    creative: '创意',
    economy: '经济',
};

const KIND_LABELS: Record<string, string> = {
    generation: '生成',
    embedding: '向量化',
    rerank: '重排序',
};

const STATE_LABELS: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    result_ready: '结果就绪',
    overlay_waiting: '等待关闭',
    completed: '已完成',
    failed: '已失败',
    cancelled: '已取消',
};

// ─── 工具函数 ───

function getProfileLabel(profileId: string): string {
    return PROFILE_LABELS[profileId] || profileId;
}

function getKindLabel(kind: string): string {
    return KIND_LABELS[kind] || kind;
}

function getStateBadgeClass(state: string): string {
    if (state === 'running' || state === 'result_ready' || state === 'overlay_waiting') return 'is-running';
    if (state === 'queued') return 'is-queued';
    if (state === 'completed') return 'is-completed';
    if (state === 'failed') return 'is-failed';
    if (state === 'cancelled') return 'is-cancelled';
    return '';
}

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：构建服务商共享选择框 HTML，并保留原生 select 作为数据读取源。
 * 参数：
 *   selectId：选择框唯一 ID。
 *   selected：当前已选值。
 *   providerIds：候选服务商列表。
 *   selectDataAttributes：写入原生 select 的 data 属性。
 * 返回：
 *   string：共享选择框 HTML。
 */
function buildProviderSharedSelectHtml(
    selectId: string,
    selected: string,
    providerIds: string[],
    selectDataAttributes: Record<string, string>,
): string {
    return buildSharedSelectField({
        id: selectId,
        value: selected,
        containerClassName: 'stx-ui-shared-select stx-ui-shared-select-fluid',
        selectClassName: 'stx-ui-input stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        selectAttributes: selectDataAttributes,
        options: [
            { value: '', label: '（不指定）' },
            ...providerIds.map((providerId: string) => ({
                value: providerId,
                label: providerId,
            })),
        ],
    });
}

function formatTimestamp(ts: number): string {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/**
 * 功能：根据酒馆连接快照返回状态样式类名。
 * 参数：
 *   snapshot (TavernConnectionSnapshot)：酒馆连接快照。
 * 返回：
 *   string：状态区域使用的样式类名。
 */
function getTavernInfoStatusClass(snapshot: TavernConnectionSnapshot): string {
    return snapshot.available ? 'is-ok' : 'is-warning';
}

/**
 * 功能：把酒馆连接信息项列表渲染为 HTML。
 * 参数：
 *   items (TavernConnectionInfoItem[])：待渲染的信息项列表。
 * 返回：
 *   string：可直接写入容器的 HTML 字符串。
 */
function buildTavernInfoItemsHtml(items: TavernConnectionInfoItem[]): string {
    if (!items.length) {
        return '<div class="stx-ui-tavern-info-empty">暂未读取到酒馆连接信息</div>';
    }

    return items
        .map((item: TavernConnectionInfoItem) => `
            <div class="stx-ui-tavern-info-row">
                <span class="stx-ui-tavern-info-label">${escapeHtml(item.label)}</span>
                <span class="stx-ui-tavern-info-value">${escapeHtml(item.value)}</span>
            </div>
        `)
        .join('');
}

/**
 * 功能：把已发现的 consumer 列表整理成可展示的名称摘要。
 * @param consumers 已发现的 consumer 列表。
 * @returns 摘要文本。
 */
function formatDiscoveredConsumerSummary(consumers: DiscoveredConsumer[]): string {
    if (consumers.length === 0) {
        return '';
    }

    const names = consumers.slice(0, 3).map((consumer: DiscoveredConsumer) => {
        return consumer.displayName || consumer.pluginId;
    });
    const summary = names.join('、');
    if (consumers.length <= 3) {
        return summary;
    }
    return `${summary} 等 ${consumers.length} 个插件`;
}

/**
 * 功能：根据只读探测结果生成“插件默认映射”空态提示。
 * @param consumers 只读探测得到的 consumer 列表。
 * @returns 可直接写入列表容器的 HTML。
 */
function buildPluginDefaultsEmptyStateHtml(consumers: DiscoveredConsumer[]): string {
    const onlineConsumers = consumers.filter((consumer: DiscoveredConsumer) => consumer.alive === true);
    const memoryOsConsumer = onlineConsumers.find((consumer: DiscoveredConsumer) => consumer.pluginId === 'stx_memory_os');

    if (memoryOsConsumer) {
        return '<div class="stx-ui-list-empty">已检测到 MemoryOS 在线，但它尚未向 LLMHub 注册任务。请稍候片刻，或检查 MemoryLlmBridge 注册日志。</div>';
    }

    if (onlineConsumers.length > 0) {
        const summary = escapeHtml(formatDiscoveredConsumerSummary(onlineConsumers));
        return `<div class="stx-ui-list-empty">已检测到 ${summary} 在线，但它们尚未向 LLMHub 注册任务。</div>`;
    }

    return '<div class="stx-ui-list-empty">暂无已注册插件</div>';
}

function generateChangelogHtml(): string {
    if (!Array.isArray(changelogData) || changelogData.length === 0) {
        return '暂无更新记录';
    }
    return changelogData
        .map((log: { version: string; date?: string; changes?: string[] }) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
          <span style="font-weight: bold; color: var(--ss-theme-accent-contrast, #fff); font-size: 13px;">${log.version}</span>
          ${log.date ? `<span style="font-size: 11px; opacity: 0.6;">${log.date}</span>` : ''}
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; opacity: 0.85;">
          ${(log.changes || []).map((change: string) => `<li style="margin-bottom: 4px; line-height: 1.4;">${change}</li>`).join('')}
        </ul>
      </div>
    `)
        .join('');
}

// ─── IDS ───

const IDS: LLMHubSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'LLM Hub',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabMainId: `${NAMESPACE}-tab-main`,
    tabRouteId: `${NAMESPACE}-tab-route`,
    tabQueueId: `${NAMESPACE}-tab-queue`,
    tabVaultId: `${NAMESPACE}-tab-vault`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelRouteId: `${NAMESPACE}-panel-route`,
    panelQueueId: `${NAMESPACE}-panel-queue`,
    panelVaultId: `${NAMESPACE}-panel-vault`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    globalProfileId: `${NAMESPACE}-global-profile`,

    providerSourceId: `${NAMESPACE}-provider-source`,
    customBaseUrlId: `${NAMESPACE}-custom-base-url`,
    customModelInputId: `${NAMESPACE}-custom-model-input`,
    testConnectionBtnId: `${NAMESPACE}-test-connection-btn`,
    testResultId: `${NAMESPACE}-test-result`,
    tavernInfoId: `${NAMESPACE}-tavern-info`,
    tavernInfoStatusId: `${NAMESPACE}-tavern-info-status`,
    tavernInfoListId: `${NAMESPACE}-tavern-info-list`,
    fetchModelsBtnId: `${NAMESPACE}-fetch-models-btn`,
    modelListSelectId: `${NAMESPACE}-model-list-select`,
    modelListStatusId: `${NAMESPACE}-model-list-status`,

    // Route panel sub-tabs
    subTabGlobalDefaultsId: `${NAMESPACE}-sub-tab-global`,
    subTabPluginDefaultsId: `${NAMESPACE}-sub-tab-plugin`,
    subTabTaskOverridesId: `${NAMESPACE}-sub-tab-task`,
    subPanelGlobalDefaultsId: `${NAMESPACE}-sub-panel-global`,
    subPanelPluginDefaultsId: `${NAMESPACE}-sub-panel-plugin`,
    subPanelTaskOverridesId: `${NAMESPACE}-sub-panel-task`,

    // View A
    globalDefGenProviderId: `${NAMESPACE}-gdef-gen-provider`,
    globalDefGenModelId: `${NAMESPACE}-gdef-gen-model`,
    globalDefGenProfileId: `${NAMESPACE}-gdef-gen-profile`,
    globalDefEmbProviderId: `${NAMESPACE}-gdef-emb-provider`,
    globalDefEmbModelId: `${NAMESPACE}-gdef-emb-model`,
    globalDefRerankProviderId: `${NAMESPACE}-gdef-rerank-provider`,
    globalDefRerankModelId: `${NAMESPACE}-gdef-rerank-model`,
    globalDefSaveBtnId: `${NAMESPACE}-gdef-save-btn`,

    // View B
    pluginDefaultsListId: `${NAMESPACE}-plugin-defaults-list`,
    pluginDefaultsRefreshBtnId: `${NAMESPACE}-plugin-defaults-refresh`,

    // View C
    taskOverridesListId: `${NAMESPACE}-task-overrides-list`,
    taskOverridesRefreshBtnId: `${NAMESPACE}-task-overrides-refresh`,

    // Budget
    budgetConsumerId: `${NAMESPACE}-budget-consumer`,
    budgetMaxRpmId: `${NAMESPACE}-budget-max-rpm`,
    budgetMaxTokensId: `${NAMESPACE}-budget-max-tokens`,
    budgetMaxLatencyId: `${NAMESPACE}-budget-max-latency`,
    budgetMaxCostId: `${NAMESPACE}-budget-max-cost`,
    budgetSaveBtnId: `${NAMESPACE}-budget-save-btn`,
    budgetResetBtnId: `${NAMESPACE}-budget-reset-btn`,
    budgetListId: `${NAMESPACE}-budget-list`,

    // Queue
    queueSnapshotListId: `${NAMESPACE}-queue-snapshot-list`,
    queueRefreshBtnId: `${NAMESPACE}-queue-refresh-btn`,
    silentPermissionsListId: `${NAMESPACE}-silent-permissions-list`,
    recentHistoryListId: `${NAMESPACE}-recent-history-list`,

    // Vault
    vaultAddServiceId: `${NAMESPACE}-vault-service`,
    vaultApiKeyId: `${NAMESPACE}-vault-api-key`,
    vaultSaveBtnId: `${NAMESPACE}-vault-save-btn`,
    vaultClearBtnId: `${NAMESPACE}-vault-clear-btn`,
};

// ─── 运行时引用 ───

function getRuntime(): LLMHubRuntime | null {
    return ((window as any).LLMHubPlugin || null) as LLMHubRuntime | null;
}

function ensureThemeBinding(): void {
    if (LLMHUB_THEME_BINDING_READY) return;
    LLMHUB_THEME_BINDING_READY = true;
    subscribeTheme((): void => {
        const cardRoot = document.getElementById(IDS.cardId);
        if (cardRoot) unmountThemeHost(cardRoot);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (!contentRoot) return;
        mountThemeHost(contentRoot);
    });
}

function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) { resolve(el); return; }
        const observer = new MutationObserver((_, obs) => {
            const target = document.querySelector(selector);
            if (target) { obs.disconnect(); resolve(target); }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)); }, timeout);
    });
}

// ─── 入口 ───

export async function renderSettingsUi(): Promise<void> {
    try {
        initThemeKernel();
        const container = await waitForElement('#extensions_settings');

        const styleId = `${IDS.cardId}-styles`;
        const nextStyleText = buildSettingsCardStylesTemplate(IDS.cardId);
        const existingStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (existingStyleEl) {
            if (existingStyleEl.innerHTML !== nextStyleText) existingStyleEl.innerHTML = nextStyleText;
        } else {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = nextStyleText;
            document.head.appendChild(styleEl);
        }

        let ssContainer = document.getElementById('ss-helper-plugins-container');
        if (!ssContainer) {
            ssContainer = document.createElement('div');
            ssContainer.id = 'ss-helper-plugins-container';
            ssContainer.className = 'ss-helper-plugins-container';
            container.prepend(ssContainer);
        }

        let cardWrapper = document.getElementById(IDS.cardId);
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);
            ssContainer.appendChild(cardWrapper);
        }
        hydrateSharedSelects(cardWrapper);

        unmountThemeHost(cardWrapper);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) mountThemeHost(contentRoot);
        ensureThemeBinding();

        bindUiEvents();
        ensureSharedTooltip();
    } catch (error) {
        console.error('UI 渲染失败:', error);
    }
}

// ──────────────────────────────────────────
//  事件绑定
// ──────────────────────────────────────────

function bindUiEvents(): void {
    const runtime = getRuntime();
    const cardRoot = document.getElementById(IDS.cardId);

    // ─── 设置存取 ───

    const getStContext = (): any => (window as any).SillyTavern?.getContext?.() || null;

    const ensureSettings = (): LLMHubSettings => {
        const ctx = getStContext();
        if (!ctx) return {};
        if (!ctx.extensionSettings) ctx.extensionSettings = {};
        if (!ctx.extensionSettings['stx_llmhub']) ctx.extensionSettings['stx_llmhub'] = {};
        return ctx.extensionSettings['stx_llmhub'] as LLMHubSettings;
    };

    const saveSettings = (): void => { getStContext()?.saveSettingsDebounced?.(); };

    // ─── 主 Tab 切换 ───

    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabRouteId, panelId: IDS.panelRouteId },
        { tabId: IDS.tabQueueId, panelId: IDS.panelQueueId },
        { tabId: IDS.tabVaultId, panelId: IDS.panelVaultId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;
        tabEl.addEventListener('click', () => {
            tabs.forEach(({ tabId: tId, panelId: pId }) => {
                document.getElementById(tId)?.classList.remove('is-active');
                document.getElementById(pId)?.setAttribute('hidden', 'true');
            });
            tabEl.classList.add('is-active');
            document.getElementById(panelId)?.removeAttribute('hidden');

            if (panelId === IDS.panelMainId) renderTavernConnectionInfo();
            // 切换到路由 tab 时刷新 View B
            if (panelId === IDS.panelRouteId) renderPluginDefaults();
            // 切换到队列 tab 时刷新
            if (panelId === IDS.panelQueueId) { renderQueueSnapshot(); renderRecentHistory(); renderSilentPermissions(); }
        });
    });

    // ─── Route sub-tabs ───

    const subTabs = [
        { tabId: IDS.subTabGlobalDefaultsId, panelId: IDS.subPanelGlobalDefaultsId },
        { tabId: IDS.subTabPluginDefaultsId, panelId: IDS.subPanelPluginDefaultsId },
        { tabId: IDS.subTabTaskOverridesId, panelId: IDS.subPanelTaskOverridesId },
    ];

    subTabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;
        tabEl.addEventListener('click', () => {
            subTabs.forEach(({ tabId: tId, panelId: pId }) => {
                document.getElementById(tId)?.classList.remove('is-active');
                document.getElementById(pId)?.setAttribute('hidden', 'true');
            });
            tabEl.classList.add('is-active');
            document.getElementById(panelId)?.removeAttribute('hidden');

            if (panelId === IDS.subPanelPluginDefaultsId) renderPluginDefaults();
            if (panelId === IDS.subPanelTaskOverridesId) renderTaskOverrides();
        });
    });

    // ─── 搜索 ───

    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement | null;
    if (searchInput) {
        searchInput.addEventListener('input', (evt: Event) => {
            const term = ((evt.target as HTMLInputElement).value || '').toLowerCase().trim();
            const searchableItems = document.querySelectorAll('[data-stx-ui-search]');
            searchableItems.forEach((el: Element) => {
                const keywords = (el.getAttribute('data-stx-ui-search') || '').toLowerCase();
                if (!term || keywords.includes(term)) el.classList.remove('is-hidden-by-search');
                else el.classList.add('is-hidden-by-search');
            });
        });
    }

    // ─── Enable 开关 ───

    const enabledEl = document.getElementById(IDS.enabledId) as HTMLInputElement | null;
    if (enabledEl) {
        enabledEl.checked = ensureSettings().enabled === true;
        cardRoot?.classList.toggle('is-card-disabled', !enabledEl.checked);
        enabledEl.addEventListener('change', () => {
            const settings = ensureSettings();
            settings.enabled = enabledEl.checked;
            cardRoot?.classList.toggle('is-card-disabled', !enabledEl.checked);
            saveSettings();
            (window as any).STX?.bus?.emit('plugin:broadcast:state_changed', {
                v: 1, type: 'broadcast', topic: 'plugin:broadcast:state_changed',
                from: 'stx_llmhub', ts: Date.now(),
                data: { isEnabled: enabledEl.checked },
            });
        });
    }

    // ─── 全局 Profile ───

    const profileEl = document.getElementById(IDS.globalProfileId) as HTMLSelectElement | null;
    if (profileEl) {
        profileEl.value = ensureSettings().globalProfile || 'balanced';
        syncSharedSelects(cardRoot || document.body);
        profileEl.addEventListener('change', () => {
            try {
                runtime?.sdk?.setGlobalProfile?.(profileEl.value);
                const current = ensureSettings();
                current.globalProfile = profileEl.value;
                saveSettings();
            } catch (error) {
                console.error('设置全局 Profile 失败:', error);
            }
        });
    }

    // ─── Provider 来源 ───

    const providerSourceEl = document.getElementById(IDS.providerSourceId) as HTMLSelectElement | null;
    const testResultEl = document.getElementById(IDS.testResultId) as HTMLElement | null;
    const tavernInfoStatusEl = document.getElementById(IDS.tavernInfoStatusId) as HTMLElement | null;
    const tavernInfoListEl = document.getElementById(IDS.tavernInfoListId) as HTMLElement | null;
    const tavernSections = cardRoot?.querySelectorAll<HTMLElement>('.stx-ui-provider-tavern-section') ?? [];
    const customSections = cardRoot?.querySelectorAll<HTMLElement>('.stx-ui-provider-custom-section') ?? [];

    const toggleProviderSourceSections = (source: string): void => {
        const isTavern = source === 'tavern';
        tavernSections.forEach(el => { el.style.display = isTavern ? '' : 'none'; });
        customSections.forEach(el => { el.style.display = isTavern ? 'none' : ''; });
    };

    /**
     * 功能：渲染当前酒馆连接信息面板。
     * 返回：
     *   void：无返回值。
     */
    const renderTavernConnectionInfo = (): void => {
        if (!tavernInfoStatusEl || !tavernInfoListEl) return;
        const snapshot = getTavernConnectionSnapshot();
        tavernInfoStatusEl.className = `stx-ui-tavern-info-status ${getTavernInfoStatusClass(snapshot)}`;
        tavernInfoStatusEl.textContent = snapshot.message;
        tavernInfoListEl.innerHTML = buildTavernInfoItemsHtml(snapshot.items);
    };

    const showTestResult = (result: { ok: boolean; message: string; detail?: string; latencyMs?: number }): void => {
        if (!testResultEl) return;
        const cls = result.ok ? 'stx-ui-result-ok' : 'stx-ui-result-error';
        const latency = result.latencyMs != null ? ` (${result.latencyMs}ms)` : '';
        const detail = result.detail ? `<div class="stx-ui-result-detail">${escapeHtml(result.detail)}</div>` : '';
        testResultEl.className = `stx-ui-result-area ${cls}`;
        testResultEl.innerHTML = `<div class="stx-ui-result-msg">${escapeHtml(result.message)}${latency}</div>${detail}`;
        testResultEl.style.display = '';
    };

    {
        const savedSource = ensureSettings().providers?.[0]?.source || 'tavern';
        if (providerSourceEl) providerSourceEl.value = savedSource;
        toggleProviderSourceSections(savedSource);
        renderTavernConnectionInfo();
        syncSharedSelects(cardRoot || document.body);

        const customCfg = ensureSettings().providers?.find(p => p.source === 'custom');
        if (customCfg) {
            const customBaseUrlEl = document.getElementById(IDS.customBaseUrlId) as HTMLInputElement | null;
            const customModelInputEl = document.getElementById(IDS.customModelInputId) as HTMLInputElement | null;
            if (customBaseUrlEl) customBaseUrlEl.value = customCfg.baseUrl || '';
            if (customModelInputEl) customModelInputEl.value = customCfg.manualModel || customCfg.model || '';
        }
    }

    providerSourceEl?.addEventListener('change', () => {
        const source = providerSourceEl.value as 'tavern' | 'custom';
        toggleProviderSourceSections(source);
        renderTavernConnectionInfo();
        if (testResultEl) testResultEl.style.display = 'none';
        const current = ensureSettings();
        if (!current.providers || current.providers.length === 0) {
            current.providers = [{ id: source === 'tavern' ? 'tavern' : 'openai', source }];
        } else {
            current.providers[0].source = source;
            current.providers[0].id = source === 'tavern' ? 'tavern' : (current.providers[0].id || 'openai');
        }
        saveSettings();
        runtime?.applySettingsFromContext?.().catch(() => {});
    });

    // ─── 连接测试 ───

    const testConnectionBtn = document.getElementById(IDS.testConnectionBtnId) as HTMLButtonElement | null;
    testConnectionBtn?.addEventListener('click', async () => {
        testConnectionBtn.disabled = true;
        testConnectionBtn.textContent = '测试中…';
        try {
            const source = providerSourceEl?.value || 'tavern';
            const providerId = source === 'tavern' ? 'tavern' : (ensureSettings().providers?.find(p => p.source === 'custom')?.id || 'openai');
            const provider = runtime?.router?.getProvider?.(providerId) as ProviderWithTest | null;
            if (!provider?.testConnection) { showTestResult({ ok: false, message: 'Provider 不支持连接测试' }); return; }
            const res = await provider.testConnection();
            showTestResult(res);
        } catch (error: unknown) {
            showTestResult({ ok: false, message: `测试异常: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            renderTavernConnectionInfo();
            testConnectionBtn.disabled = false;
            testConnectionBtn.textContent = '测试连接';
        }
    });

    const customTestBtn = document.getElementById(IDS.testConnectionBtnId + '_custom') as HTMLButtonElement | null;
    customTestBtn?.addEventListener('click', async () => {
        customTestBtn.disabled = true;
        customTestBtn.textContent = '测试中…';
        try {
            const settings = ensureSettings();
            const customBaseUrlEl = document.getElementById(IDS.customBaseUrlId) as HTMLInputElement | null;
            const customModelInputEl = document.getElementById(IDS.customModelInputId) as HTMLInputElement | null;
            const baseUrl = customBaseUrlEl?.value.trim() || '';
            const model = customModelInputEl?.value.trim() || '';
            if (baseUrl || model) {
                if (!settings.providers) settings.providers = [];
                const customCfg = settings.providers.find(p => p.source === 'custom');
                if (customCfg) {
                    customCfg.baseUrl = baseUrl;
                    customCfg.manualModel = model;
                } else {
                    settings.providers.push({ id: 'openai', source: 'custom', baseUrl, manualModel: model });
                }
                saveSettings();
                await runtime?.applySettingsFromContext?.();
            }
            const providerId = settings.providers?.find(p => p.source === 'custom')?.id || 'openai';
            const provider = runtime?.router?.getProvider?.(providerId) as ProviderWithTest | null;
            if (!provider?.testConnection) { showTestResult({ ok: false, message: 'Provider 不支持连接测试' }); return; }
            const res = await provider.testConnection();
            showTestResult(res);
        } catch (error: unknown) {
            showTestResult({ ok: false, message: `测试异常: ${error instanceof Error ? error.message : String(error)}` });
        } finally {
            customTestBtn.disabled = false;
            customTestBtn.textContent = '测试连接';
        }
    });

    // ─── 获取模型列表 ───

    const fetchModelsBtn = document.getElementById(IDS.fetchModelsBtnId) as HTMLButtonElement | null;
    const modelListSelectEl = document.getElementById(IDS.modelListSelectId) as HTMLSelectElement | null;
    const modelListStatusEl = document.getElementById(IDS.modelListStatusId) as HTMLElement | null;

    fetchModelsBtn?.addEventListener('click', async () => {
        fetchModelsBtn.disabled = true;
        fetchModelsBtn.textContent = '获取中…';
        if (modelListStatusEl) modelListStatusEl.textContent = '';
        try {
            const providerId = ensureSettings().providers?.find(p => p.source === 'custom')?.id || 'openai';
            const provider = runtime?.router?.getProvider?.(providerId) as ProviderWithTest | null;
            if (!provider?.listModels) {
                if (modelListStatusEl) modelListStatusEl.textContent = 'Provider 不支持模型列表';
                return;
            }
            const res = await provider.listModels();
            if (!res.ok) {
                if (modelListStatusEl) modelListStatusEl.textContent = `获取失败: ${res.message}`;
                return;
            }
            if (modelListSelectEl) {
                modelListSelectEl.innerHTML = res.models
                    .map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label || m.id)}</option>`)
                    .join('');
                refreshSharedSelectOptions(cardRoot || document.body);
            }
            if (modelListStatusEl) modelListStatusEl.textContent = `已获取 ${res.models.length} 个模型`;
        } catch (error: unknown) {
            if (modelListStatusEl) modelListStatusEl.textContent = `异常: ${error instanceof Error ? error.message : String(error)}`;
        } finally {
            fetchModelsBtn.disabled = false;
            fetchModelsBtn.textContent = '获取模型列表';
        }
    });

    modelListSelectEl?.addEventListener('change', () => {
        const customModelInputEl = document.getElementById(IDS.customModelInputId) as HTMLInputElement | null;
        if (customModelInputEl && modelListSelectEl.value) customModelInputEl.value = modelListSelectEl.value;
    });

    // ══════════════════════════════════════
    //  View A: 全局能力默认
    // ══════════════════════════════════════

    const getProviderIds = (): string[] => {
        const dynamic = runtime?.router?.getAllProviders?.() || [];
        const dynamicIds = dynamic.map((p: ProviderLite) => String(p?.id || '').trim()).filter(Boolean);
        const fallback = ['openai', 'claude', 'gemini', 'groq'];
        return Array.from(new Set([...dynamicIds, ...fallback]));
    };

    const populateProviderSelect = (selectEl: HTMLSelectElement | null, allowEmpty: boolean, currentValue?: string): void => {
        if (!selectEl) return;
        const ids = getProviderIds();
        const prev = currentValue ?? selectEl.value;
        selectEl.innerHTML = '';
        if (allowEmpty) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '（自动选择）';
            selectEl.appendChild(opt);
        }
        ids.forEach(id => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = id;
            selectEl.appendChild(opt);
        });
        if (Array.from(selectEl.options).some(o => o.value === prev)) selectEl.value = prev;
    };

    const refreshAllProviderSelects = (): void => {
        populateProviderSelect(document.getElementById(IDS.globalDefGenProviderId) as HTMLSelectElement, true);
        populateProviderSelect(document.getElementById(IDS.globalDefEmbProviderId) as HTMLSelectElement, true);
        populateProviderSelect(document.getElementById(IDS.globalDefRerankProviderId) as HTMLSelectElement, true);
        populateProviderSelect(document.getElementById(IDS.vaultAddServiceId) as HTMLSelectElement, false);
        refreshSharedSelectOptions(cardRoot || document.body);
    };

    // 恢复全局默认到 UI
    const restoreGlobalDefaultsToUI = (): void => {
        const settings = ensureSettings();
        const defaults = settings.globalDefaults || [];
        for (const d of defaults) {
            if (d.capabilityKind === 'generation') {
                const provEl = document.getElementById(IDS.globalDefGenProviderId) as HTMLSelectElement | null;
                const modelEl = document.getElementById(IDS.globalDefGenModelId) as HTMLInputElement | null;
                const profileEl = document.getElementById(IDS.globalDefGenProfileId) as HTMLSelectElement | null;
                if (provEl) provEl.value = d.providerId || '';
                if (modelEl) modelEl.value = d.model || '';
                if (profileEl) profileEl.value = d.profileId || '';
            } else if (d.capabilityKind === 'embedding') {
                const provEl = document.getElementById(IDS.globalDefEmbProviderId) as HTMLSelectElement | null;
                const modelEl = document.getElementById(IDS.globalDefEmbModelId) as HTMLInputElement | null;
                if (provEl) provEl.value = d.providerId || '';
                if (modelEl) modelEl.value = d.model || '';
            } else if (d.capabilityKind === 'rerank') {
                const provEl = document.getElementById(IDS.globalDefRerankProviderId) as HTMLSelectElement | null;
                const modelEl = document.getElementById(IDS.globalDefRerankModelId) as HTMLInputElement | null;
                if (provEl) provEl.value = d.providerId || '';
                if (modelEl) modelEl.value = d.model || '';
            }
        }
        syncSharedSelects(cardRoot || document.body);
    };

    // 保存全局默认
    const globalDefSaveBtn = document.getElementById(IDS.globalDefSaveBtnId);
    globalDefSaveBtn?.addEventListener('click', () => {
        const genProvider = (document.getElementById(IDS.globalDefGenProviderId) as HTMLSelectElement)?.value || '';
        const genModel = (document.getElementById(IDS.globalDefGenModelId) as HTMLInputElement)?.value.trim() || '';
        const genProfile = (document.getElementById(IDS.globalDefGenProfileId) as HTMLSelectElement)?.value || '';
        const embProvider = (document.getElementById(IDS.globalDefEmbProviderId) as HTMLSelectElement)?.value || '';
        const embModel = (document.getElementById(IDS.globalDefEmbModelId) as HTMLInputElement)?.value.trim() || '';
        const rerankProvider = (document.getElementById(IDS.globalDefRerankProviderId) as HTMLSelectElement)?.value || '';
        const rerankModel = (document.getElementById(IDS.globalDefRerankModelId) as HTMLInputElement)?.value.trim() || '';

        const defaults: GlobalCapabilityDefault[] = [];
        if (genProvider) defaults.push({ capabilityKind: 'generation', providerId: genProvider, model: genModel || undefined, profileId: genProfile || undefined });
        if (embProvider) defaults.push({ capabilityKind: 'embedding', providerId: embProvider, model: embModel || undefined });
        if (rerankProvider) defaults.push({ capabilityKind: 'rerank', providerId: rerankProvider, model: rerankModel || undefined });

        const settings = ensureSettings();
        settings.globalDefaults = defaults;

        saveSettings();
        runtime?.router?.applyGlobalDefaults?.(defaults);
        runtime?.applySettingsFromContext?.().catch(() => {});
    });

    // ══════════════════════════════════════
    //  View B: 插件默认
    // ══════════════════════════════════════

    const renderPluginDefaults = (): void => {
        const listEl = document.getElementById(IDS.pluginDefaultsListId);
        if (!listEl) return;
        const renderSeq = ++LLMHUB_CONSUMER_DISCOVERY_SEQ;

        const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
        if (registrations.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">正在检查已在线但尚未注册任务的插件…</div>';
            void discoverConsumers({
                fromNamespace: 'stx_llmhub',
                onlineOnly: true,
                excludePluginIds: ['stx_llmhub'],
            })
                .then((consumers: DiscoveredConsumer[]): void => {
                    if (renderSeq !== LLMHUB_CONSUMER_DISCOVERY_SEQ || !listEl.isConnected) {
                        return;
                    }
                    listEl.innerHTML = buildPluginDefaultsEmptyStateHtml(consumers);
                })
                .catch((): void => {
                    if (renderSeq !== LLMHUB_CONSUMER_DISCOVERY_SEQ || !listEl.isConnected) {
                        return;
                    }
                    listEl.innerHTML = '<div class="stx-ui-list-empty">暂无已注册插件</div>';
                });
            return;
        }

        const settings = ensureSettings();
        const providerIds = getProviderIds();
        const existingPluginDefaults = settings.pluginDefaults || [];

        const collectCandidateProviderIds = (filterCaps?: LLMCapability[]): string[] => {
            let candidates = providerIds;
            if (filterCaps && filterCaps.length > 0 && runtime?.router?.getProviderCapabilities) {
                candidates = candidates.filter(pid => {
                    const caps = runtime!.router!.getProviderCapabilities!(pid);
                    return filterCaps.every(c => caps.includes(c));
                });
            }
            return candidates;
        };

        const kinds: CapabilityKind[] = ['generation', 'embedding', 'rerank'];

        listEl.innerHTML = registrations.map((snap: ConsumerSnapshot) => {
            const pluginId = snap.pluginId;
            const displayName = snap.displayName || pluginId;
            const isOnline = snap.session?.online ?? false;
            const lastSeen = snap.session?.seenAt ? formatTimestamp(snap.session.seenAt) : '-';

            // 该插件声明的任务所用到的 kinds
            const declaredKinds = new Set<CapabilityKind>();
            (snap.tasks || []).forEach((t: TaskDescriptor) => declaredKinds.add(t.taskKind));
            const relevantKinds = kinds.filter(k => declaredKinds.has(k));
            if (relevantKinds.length === 0) relevantKinds.push('generation');

            const kindRows = relevantKinds.map(kind => {
                const existing = existingPluginDefaults.find(d => d.pluginId === pluginId && d.capabilityKind === kind);
                // 推算该 kind 下需要的最小能力集
                const tasksOfKind = (snap.tasks || []).filter((t: TaskDescriptor) => t.taskKind === kind);
                const requiredCaps = new Set<LLMCapability>();
                tasksOfKind.forEach(t => (t.requiredCapabilities || []).forEach(c => requiredCaps.add(c)));

                const selectId = `stx-llmhub-plugin-default-${pluginId}-${kind}`.replace(/[^a-zA-Z0-9_-]/g, '-');
                const providerSelectHtml = buildProviderSharedSelectHtml(
                    selectId,
                    existing?.providerId || '',
                    collectCandidateProviderIds(Array.from(requiredCaps)),
                    {
                        'data-plugin-def-provider': pluginId,
                        'data-plugin-def-kind': kind,
                    },
                );

                return `
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label">${getKindLabel(kind)} 服务商</label>
                    ${providerSelectHtml}
                  </div>`;
            }).join('');

            return `
              <div class="stx-ui-list-item stx-ui-consumer-map-row" data-plugin-row="${escapeHtml(pluginId)}">
                <div class="stx-ui-consumer-map-head">
                  <div class="stx-ui-consumer-map-head-main">
                    <div class="stx-ui-list-title">
                      <span class="stx-ui-online-dot ${isOnline ? 'is-online' : 'is-offline'}"></span>
                      ${escapeHtml(displayName)} <span class="stx-ui-list-meta">(${escapeHtml(pluginId)})</span>
                    </div>
                  </div>
                  <div class="stx-ui-list-meta">最后活跃 ${lastSeen}</div>
                </div>
                <div class="stx-ui-consumer-map-form">${kindRows}</div>
                <div class="stx-ui-consumer-map-actions">
                  <button class="stx-ui-btn" type="button" data-plugin-def-save="${escapeHtml(pluginId)}">保存</button>
                  <button class="stx-ui-btn secondary" type="button" data-plugin-def-delete="${escapeHtml(pluginId)}">清除</button>
                </div>
              </div>`;
        }).join('');

        hydrateSharedSelects(listEl);
        ensureSharedTooltip();
    };

    // 插件默认列表事件委托
    document.getElementById(IDS.pluginDefaultsListId)?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const saveBtn = target.closest<HTMLButtonElement>('button[data-plugin-def-save]');
        const deleteBtn = target.closest<HTMLButtonElement>('button[data-plugin-def-delete]');
        const pluginId = String(saveBtn?.dataset.pluginDefSave || deleteBtn?.dataset.pluginDefDelete || '').trim();
        if (!pluginId) return;

        const settings = ensureSettings();
        let pluginDefaults = (settings.pluginDefaults || []).filter(d => d.pluginId !== pluginId);

        if (saveBtn) {
            const row = document.querySelector(`[data-plugin-row="${pluginId}"]`);
            if (!row) return;
            const selects = row.querySelectorAll<HTMLSelectElement>('select[data-plugin-def-provider]');
            selects.forEach(sel => {
                const kind = sel.dataset.pluginDefKind as CapabilityKind;
                const providerId = sel.value.trim();
                if (providerId && kind) {
                    pluginDefaults.push({ pluginId, capabilityKind: kind, providerId });
                }
            });
        }

        settings.pluginDefaults = pluginDefaults;
        saveSettings();
        runtime?.router?.applyPluginDefaults?.(pluginDefaults);
    });

    document.getElementById(IDS.pluginDefaultsRefreshBtnId)?.addEventListener('click', renderPluginDefaults);

    // ══════════════════════════════════════
    //  View C: 任务覆盖
    // ══════════════════════════════════════

    const renderTaskOverrides = (): void => {
        const listEl = document.getElementById(IDS.taskOverridesListId);
        if (!listEl) return;

        const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
        const allTasks: Array<{ pluginId: string; displayName: string; task: TaskDescriptor; isOnline: boolean }> = [];
        for (const snap of registrations) {
            for (const task of (snap.tasks || [])) {
                allTasks.push({
                    pluginId: snap.pluginId,
                    displayName: snap.displayName || snap.pluginId,
                    task,
                    isOnline: snap.session?.online ?? false,
                });
            }
        }

        if (allTasks.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">暂无已注册任务</div>';
            return;
        }

        const settings = ensureSettings();
        const existingOverrides = settings.taskOverrides || [];
        const providerIds = getProviderIds();

        const collectCandidateProviderIds = (requiredCaps: LLMCapability[]): string[] => {
            let candidates = providerIds;
            if (requiredCaps.length > 0 && runtime?.router?.getProviderCapabilities) {
                candidates = candidates.filter(pid => {
                    const caps = runtime!.router!.getProviderCapabilities!(pid);
                    return requiredCaps.every(c => caps.includes(c));
                });
            }
            return candidates;
        };

        listEl.innerHTML = allTasks.map(({ pluginId, displayName, task, isOnline }) => {
            const existing = existingOverrides.find(o => o.pluginId === pluginId && o.taskId === task.taskId);
            const isStale = existing?.isStale === true;
            const staleHtml = isStale
                ? `<span class="stx-ui-stale-indicator"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(existing?.staleReason || '绑定失效')}</span>`
                : '';
            const key = `${pluginId}::${task.taskId}`;
            const selectId = `stx-llmhub-task-override-${pluginId}-${task.taskId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
            const providerSelectHtml = buildProviderSharedSelectHtml(
                selectId,
                existing?.providerId || '',
                collectCandidateProviderIds(task.requiredCapabilities || []),
                {
                    'data-task-override-provider': key,
                },
            );

            return `
              <div class="stx-ui-list-item stx-ui-consumer-map-row" data-task-row="${escapeHtml(key)}">
                <div class="stx-ui-consumer-map-head">
                  <div class="stx-ui-consumer-map-head-main">
                    <div class="stx-ui-list-title">
                      <span class="stx-ui-online-dot ${isOnline ? 'is-online' : 'is-offline'}"></span>
                      ${escapeHtml(displayName)} / ${escapeHtml(task.taskId)}
                    </div>
                    <div class="stx-ui-list-meta">
                      类型=${getKindLabel(task.taskKind)}
                      ${task.requiredCapabilities?.length ? `，需要=[${task.requiredCapabilities.join(',')}]` : ''}
                      ${task.backgroundEligible ? '，可静默' : ''}
                    </div>
                    ${staleHtml}
                  </div>
                </div>
                <div class="stx-ui-consumer-map-form">
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label">服务商</label>
                    ${providerSelectHtml}
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label">模型</label>
                    <input class="stx-ui-input stx-ui-input-full" type="text" data-task-override-model="${escapeHtml(key)}" value="${escapeHtml(existing?.model || '')}" placeholder="留空跟随默认" />
                  </div>
                </div>
                <div class="stx-ui-consumer-map-actions">
                  <button class="stx-ui-btn" type="button" data-task-override-save="${escapeHtml(key)}" data-task-kind="${task.taskKind}">保存</button>
                  <button class="stx-ui-btn secondary" type="button" data-task-override-delete="${escapeHtml(key)}">清除</button>
                </div>
              </div>`;
        }).join('');

        hydrateSharedSelects(listEl);
        ensureSharedTooltip();
    };

    // 任务覆盖事件委托
    document.getElementById(IDS.taskOverridesListId)?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const saveBtn = target.closest<HTMLButtonElement>('button[data-task-override-save]');
        const deleteBtn = target.closest<HTMLButtonElement>('button[data-task-override-delete]');
        const key = String(saveBtn?.dataset.taskOverrideSave || deleteBtn?.dataset.taskOverrideDelete || '').trim();
        if (!key) return;

        const [pluginId, taskId] = key.split('::');
        if (!pluginId || !taskId) return;

        const settings = ensureSettings();
        let overrides = (settings.taskOverrides || []).filter(o => !(o.pluginId === pluginId && o.taskId === taskId));

        if (saveBtn) {
            const providerEl = document.querySelector<HTMLSelectElement>(`select[data-task-override-provider="${key}"]`);
            const modelEl = document.querySelector<HTMLInputElement>(`input[data-task-override-model="${key}"]`);
            const providerId = providerEl?.value.trim() || '';
            const model = modelEl?.value.trim() || '';
            const taskKind = (saveBtn.dataset.taskKind || 'generation') as CapabilityKind;

            if (providerId) {
                // 前端能力校验: 检查 provider 是否满足该任务的 requiredCapabilities
                const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
                let taskDesc: TaskDescriptor | undefined;
                for (const snap of registrations) {
                    taskDesc = snap.tasks?.find((t: TaskDescriptor) => t.taskId === taskId);
                    if (taskDesc) break;
                }
                if (taskDesc?.requiredCapabilities?.length && runtime?.router?.getProviderCapabilities) {
                    const provCaps = runtime.router.getProviderCapabilities(providerId);
                    const missing = taskDesc.requiredCapabilities.filter(c => !provCaps.includes(c));
                    if (missing.length > 0) {
                        alert(`服务商 "${providerId}" 缺少所需能力: ${missing.join(', ')}。无法保存。`);
                        return;
                    }
                }
                overrides.push({ pluginId, taskId, taskKind, providerId, model: model || undefined, isStale: false });
            }
        }

        settings.taskOverrides = overrides;
        saveSettings();
        runtime?.router?.applyTaskOverrides?.(overrides);
    });

    document.getElementById(IDS.taskOverridesRefreshBtnId)?.addEventListener('click', renderTaskOverrides);

    /**
     * 功能：统一刷新依赖 consumer 注册表的设置视图。
     * 返回：
     *   void：无返回值。
     */
    const renderConsumerDrivenViews = (): void => {
        renderPluginDefaults();
        renderTaskOverrides();
    };

    LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE?.();
    LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE = runtime?.registry?.subscribe?.((): void => {
        renderConsumerDrivenViews();
    }) || null;

    // ══════════════════════════════════════
    //  预算规则
    // ══════════════════════════════════════

    const budgetConsumerEl = document.getElementById(IDS.budgetConsumerId) as HTMLInputElement | null;
    const budgetMaxRpmEl = document.getElementById(IDS.budgetMaxRpmId) as HTMLInputElement | null;
    const budgetMaxTokensEl = document.getElementById(IDS.budgetMaxTokensId) as HTMLInputElement | null;
    const budgetMaxLatencyEl = document.getElementById(IDS.budgetMaxLatencyId) as HTMLInputElement | null;
    const budgetMaxCostEl = document.getElementById(IDS.budgetMaxCostId) as HTMLInputElement | null;
    const budgetSaveBtn = document.getElementById(IDS.budgetSaveBtnId);
    const budgetResetBtn = document.getElementById(IDS.budgetResetBtnId);
    const budgetListEl = document.getElementById(IDS.budgetListId);

    const parseOptionalNumber = (value: string): number | undefined => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) return undefined;
        return parsed;
    };

    const renderBudgets = (): void => {
        if (!budgetListEl) return;
        const budgets = ensureSettings().budgets || {};
        const entries = Object.entries(budgets);
        if (entries.length === 0) {
            budgetListEl.innerHTML = '<div class="stx-ui-list-empty">暂无预算规则</div>';
            return;
        }
        budgetListEl.innerHTML = entries
            .map(([consumer, config]: [string, BudgetConfig]) => `
            <div class="stx-ui-list-item">
              <div>
                <div class="stx-ui-list-title">${escapeHtml(consumer)}</div>
                <div class="stx-ui-list-meta">
                  maxRPM=${config.maxRPM ?? '-'}, maxTokens=${config.maxTokens ?? '-'}, maxLatencyMs=${config.maxLatencyMs ?? '-'}, maxCost=${config.maxCost ?? '-'}
                </div>
              </div>
              <button class="stx-ui-btn secondary" type="button" data-budget-consumer="${escapeHtml(consumer)}">删除</button>
            </div>`)
            .join('');
    };

    const clearBudgetForm = (): void => {
        if (budgetConsumerEl) budgetConsumerEl.value = '';
        if (budgetMaxRpmEl) budgetMaxRpmEl.value = '';
        if (budgetMaxTokensEl) budgetMaxTokensEl.value = '';
        if (budgetMaxLatencyEl) budgetMaxLatencyEl.value = '';
        if (budgetMaxCostEl) budgetMaxCostEl.value = '';
    };

    budgetSaveBtn?.addEventListener('click', () => {
        const consumer = (budgetConsumerEl?.value || '').trim();
        if (!consumer) { alert('请填写预算的调用方'); return; }
        const config: BudgetConfig = {};
        const maxRPM = parseOptionalNumber(budgetMaxRpmEl?.value || '');
        const maxTokens = parseOptionalNumber(budgetMaxTokensEl?.value || '');
        const maxLatencyMs = parseOptionalNumber(budgetMaxLatencyEl?.value || '');
        const maxCost = parseOptionalNumber(budgetMaxCostEl?.value || '');
        if (maxRPM !== undefined) config.maxRPM = maxRPM;
        if (maxTokens !== undefined) config.maxTokens = maxTokens;
        if (maxLatencyMs !== undefined) config.maxLatencyMs = maxLatencyMs;
        if (maxCost !== undefined) config.maxCost = maxCost;
        runtime?.setBudgetConfig?.(consumer, config);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        budgets[consumer] = config;
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
        clearBudgetForm();
    });

    budgetResetBtn?.addEventListener('click', clearBudgetForm);

    budgetListEl?.addEventListener('click', (evt: Event) => {
        const button = (evt.target as HTMLElement).closest<HTMLButtonElement>('button[data-budget-consumer]');
        if (!button) return;
        const consumer = String(button.dataset.budgetConsumer || '').trim();
        if (!consumer) return;
        runtime?.removeBudgetConfig?.(consumer);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        delete budgets[consumer];
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
    });

    // ══════════════════════════════════════
    //  队列快照
    // ══════════════════════════════════════

    const renderQueueSnapshot = (): void => {
        const listEl = document.getElementById(IDS.queueSnapshotListId);
        if (!listEl) return;

        const snapshot = runtime?.orchestrator?.getQueueSnapshot?.();
        if (!snapshot) { listEl.innerHTML = '<div class="stx-ui-list-empty">编排器未就绪</div>'; return; }

        const items: string[] = [];

        // 当前执行中
        if (snapshot.active) {
            const a = snapshot.active;
            items.push(`
              <div class="stx-ui-list-item">
                <div>
                  <div class="stx-ui-list-title">${escapeHtml(a.consumer)} / ${escapeHtml(a.taskId)}</div>
                  <div class="stx-ui-list-meta">ID: ${escapeHtml(a.requestId.slice(0, 8))}...</div>
                </div>
                <span class="stx-ui-state-badge ${getStateBadgeClass(a.state)}">${STATE_LABELS[a.state] || a.state}</span>
              </div>`);
        }

        // 排队中
        for (const p of snapshot.pending) {
            items.push(`
              <div class="stx-ui-list-item">
                <div>
                  <div class="stx-ui-list-title">${escapeHtml(p.consumer)} / ${escapeHtml(p.taskId)}</div>
                  <div class="stx-ui-list-meta">ID: ${escapeHtml(p.requestId.slice(0, 8))}... | 入队 ${formatTimestamp(p.queuedAt)}</div>
                </div>
                <span class="stx-ui-state-badge is-queued">排队中</span>
              </div>`);
        }

        listEl.innerHTML = items.length > 0 ? items.join('') : '<div class="stx-ui-list-empty">队列为空</div>';
    };

    // ─── 最近记录 ───

    const renderRecentHistory = (): void => {
        const listEl = document.getElementById(IDS.recentHistoryListId);
        if (!listEl) return;

        const snapshot = runtime?.orchestrator?.getQueueSnapshot?.();
        if (!snapshot || !snapshot.recentHistory.length) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">暂无记录</div>';
            return;
        }

        listEl.innerHTML = snapshot.recentHistory.slice().reverse().map(r => `
          <div class="stx-ui-list-item">
            <div>
              <div class="stx-ui-list-title">${escapeHtml(r.consumer)} / ${escapeHtml(r.taskId)}</div>
              <div class="stx-ui-list-meta">
                ID: ${escapeHtml(r.requestId.slice(0, 8))}...
                ${r.finishedAt ? ` | 完成 ${formatTimestamp(r.finishedAt)}` : ''}
              </div>
            </div>
            <span class="stx-ui-state-badge ${getStateBadgeClass(r.state)}">${STATE_LABELS[r.state] || r.state}</span>
          </div>`).join('');
    };

    // ─── 静默权限 ───

    const renderSilentPermissions = (): void => {
        const listEl = document.getElementById(IDS.silentPermissionsListId);
        if (!listEl) return;

        const permissions = runtime?.displayController?.exportSilentPermissions?.() || [];
        if (permissions.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">暂无静默权限授权</div>';
            return;
        }

        listEl.innerHTML = permissions.map(p => `
          <div class="stx-ui-list-item">
            <div>
              <div class="stx-ui-list-title">${escapeHtml(p.pluginId)} / ${escapeHtml(p.taskId)}</div>
              <div class="stx-ui-list-meta">授权于 ${formatTimestamp(p.grantedAt)}</div>
            </div>
            <button class="stx-ui-btn secondary" type="button" data-silent-revoke="${escapeHtml(p.pluginId)}::${escapeHtml(p.taskId)}">撤销</button>
          </div>`).join('');
    };

    document.getElementById(IDS.silentPermissionsListId)?.addEventListener('click', (evt: Event) => {
        const button = (evt.target as HTMLElement).closest<HTMLButtonElement>('button[data-silent-revoke]');
        if (!button) return;
        const key = String(button.dataset.silentRevoke || '').trim();
        const [pluginId, taskId] = key.split('::');
        if (!pluginId || !taskId) return;
        runtime?.displayController?.revokeSilentPermission?.(pluginId, taskId);
        // 持久化
        const settings = ensureSettings();
        settings.silentPermissions = runtime?.displayController?.exportSilentPermissions?.() || [];
        saveSettings();
        renderSilentPermissions();
    });

    document.getElementById(IDS.queueRefreshBtnId)?.addEventListener('click', () => {
        renderQueueSnapshot();
        renderRecentHistory();
        renderSilentPermissions();
    });

    // ══════════════════════════════════════
    //  凭据金库
    // ══════════════════════════════════════

    const vaultSaveBtn = document.getElementById(IDS.vaultSaveBtnId);
    const vaultClearBtn = document.getElementById(IDS.vaultClearBtnId);
    const vaultServiceSelect = document.getElementById(IDS.vaultAddServiceId) as HTMLSelectElement | null;
    const vaultKeyInput = document.getElementById(IDS.vaultApiKeyId) as HTMLInputElement | null;

    if (vaultSaveBtn && vaultServiceSelect && vaultKeyInput) {
        vaultSaveBtn.addEventListener('click', async () => {
            const provider = vaultServiceSelect.value;
            const apiKey = vaultKeyInput.value.trim();
            if (!apiKey) { alert('API Key 不能为空'); return; }
            try {
                if (!runtime?.saveCredential) throw new Error('LLMHub Runtime 未就绪');
                await runtime.saveCredential(provider, apiKey);
                vaultKeyInput.value = '';
                alert(`已保存 ${provider} 的凭据`);
            } catch (error) {
                console.error('保存凭据失败:', error);
                alert('保存凭据失败，请查看控制台');
            }
        });
    }

    if (vaultClearBtn) {
        vaultClearBtn.addEventListener('click', async () => {
            if (!confirm('确定清空全部凭据吗？')) return;
            try {
                if (!runtime?.clearAllCredentials) throw new Error('LLMHub Runtime 未就绪');
                await runtime.clearAllCredentials();
                alert('已清空全部凭据');
            } catch (error) {
                console.error('清空凭据失败:', error);
                alert('清空凭据失败，请查看控制台');
            }
        });
    }

    // ─── 初始化渲染 ───

    refreshAllProviderSelects();
    restoreGlobalDefaultsToUI();
    renderConsumerDrivenViews();
    renderBudgets();
}
