import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import type { RoutePolicy } from '../router/router';
import type { BudgetConfig } from '../budget/budget-manager';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { hydrateSharedSelects, refreshSharedSelectOptions, syncSharedSelects } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { mountThemeHost, unmountThemeHost, initThemeKernel, subscribeTheme } from '../../../SDK/theme';


let LLMHUB_THEME_BINDING_READY = false;

type LLMHubSettings = {
    enabled?: boolean;
    globalProfile?: string;
    defaultProvider?: string;
    defaultModel?: string;
    routePolicies?: RoutePolicy[];
    budgets?: Record<string, BudgetConfig>;
};

type ProviderLite = { id: string };

type LLMHubRuntime = {
    saveCredential?: (providerId: string, apiKey: string) => Promise<void>;
    clearAllCredentials?: () => Promise<void>;
    setDefaultRoute?: (providerId: string, model: string) => Promise<void>;
    setRoutePolicies?: (policies: RoutePolicy[]) => void;
    setBudgetConfig?: (consumer: string, config: BudgetConfig) => void;
    removeBudgetConfig?: (consumer: string) => void;
    applySettingsFromContext?: () => Promise<void>;
    router?: {
        getAllProviders?: () => ProviderLite[];
    };
    sdk?: {
        setGlobalProfile?: (profile: string) => void;
    };
};

// UI 组件的唯一命名空间
const NAMESPACE = 'stx-llmhub';
const PROFILE_LABELS: Record<string, string> = {
    balanced: '平衡',
    precise: '精准',
    creative: '创意',
    economy: '经济',
};

/**
 * 功能：将参数档标识转换为中文标签。
 * 参数：
 *   profileId：参数档标识。
 * 返回：
 *   string：中文标签，未知值回退为原始值。
 */
function getProfileLabel(profileId: string): string {
    return PROFILE_LABELS[profileId] || profileId;
}

/**
 * 功能：渲染更新日志 HTML。
 * 参数：
 *   无。
 * 返回：
 *   string：更新日志 HTML 字符串。
 */
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
    tabRouterId: `${NAMESPACE}-tab-router`,
    tabConsumerMapId: `${NAMESPACE}-tab-consumer-map`,
    tabVaultId: `${NAMESPACE}-tab-vault`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelRouterId: `${NAMESPACE}-panel-router`,
    panelConsumerMapId: `${NAMESPACE}-panel-consumer-map`,
    panelVaultId: `${NAMESPACE}-panel-vault`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    globalProfileId: `${NAMESPACE}-global-profile`,

    defaultProviderId: `${NAMESPACE}-default-provider`,
    defaultModelId: `${NAMESPACE}-default-model`,
    routerAdvancedToggleId: `${NAMESPACE}-router-advanced-toggle`,
    routerAdvancedBodyId: `${NAMESPACE}-router-advanced-body`,
    routeConsumerId: `${NAMESPACE}-route-consumer`,
    routeTaskId: `${NAMESPACE}-route-task`,
    routeProviderId: `${NAMESPACE}-route-provider`,
    routeProfileId: `${NAMESPACE}-route-profile`,
    routeFallbackProviderId: `${NAMESPACE}-route-fallback-provider`,
    routeSaveBtnId: `${NAMESPACE}-route-save-btn`,
    routeResetBtnId: `${NAMESPACE}-route-reset-btn`,
    routeListId: `${NAMESPACE}-route-list`,

    consumerMapRefreshBtnId: `${NAMESPACE}-consumer-map-refresh-btn`,

    budgetConsumerId: `${NAMESPACE}-budget-consumer`,
    budgetMaxRpmId: `${NAMESPACE}-budget-max-rpm`,
    budgetMaxTokensId: `${NAMESPACE}-budget-max-tokens`,
    budgetMaxLatencyId: `${NAMESPACE}-budget-max-latency`,
    budgetMaxCostId: `${NAMESPACE}-budget-max-cost`,
    budgetSaveBtnId: `${NAMESPACE}-budget-save-btn`,
    budgetResetBtnId: `${NAMESPACE}-budget-reset-btn`,
    budgetListId: `${NAMESPACE}-budget-list`,

    vaultAddServiceId: `${NAMESPACE}-vault-service`,
    vaultApiKeyId: `${NAMESPACE}-vault-api-key`,
    vaultSaveBtnId: `${NAMESPACE}-vault-save-btn`,
    vaultClearBtnId: `${NAMESPACE}-vault-clear-btn`,
};

/**
 * 功能：为 LLMHub 设置面板应用 tooltip 目录并执行兜底补齐。
 * 参数：无。
 * 返回：void。
 */
function applySettingsTooltips(): void {
    ensureSharedTooltip();
}

/**
 * 功能：确保 LLMHub 设置面板会在全局主题切换后重新应用主题。
 * 参数：无。
 * 返回：void。
 */
function ensureThemeBinding(): void {
    if (LLMHUB_THEME_BINDING_READY) return;
    LLMHUB_THEME_BINDING_READY = true;

    subscribeTheme((): void => {
        const cardRoot = document.getElementById(IDS.cardId);
        if (cardRoot) {
            unmountThemeHost(cardRoot);
        }
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (!contentRoot) return;
        mountThemeHost(contentRoot);
    });
}

/**
 * 功能：读取 LLMHub 运行时实例。
 * 参数：
 *   无。
 * 返回：
 *   LLMHubRuntime | null：运行时实例。
 */
function getRuntime(): LLMHubRuntime | null {
    return ((window as any).LLMHubPlugin || null) as LLMHubRuntime | null;
}

/**
 * 功能：等待元素挂载到 DOM。
 * 参数：
 *   selector：元素选择器。
 *   timeout：等待超时时间。
 * 返回：
 *   Promise<Element>：命中的元素。
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) {
            resolve(el);
            return;
        }

        const observer = new MutationObserver((_, obs) => {
            const target = document.querySelector(selector);
            if (target) {
                obs.disconnect();
                resolve(target);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

/**
 * 功能：渲染 LLMHub 设置面板。
 * 参数：
 *   无。
 * 返回：
 *   Promise<void>：渲染流程完成。
 */
export async function renderSettingsUi(): Promise<void> {
    try {
        initThemeKernel();
        const container = await waitForElement('#extensions_settings');

        const styleId = `${IDS.cardId}-styles`;
        const nextStyleText = buildSettingsCardStylesTemplate(IDS.cardId);
        const existingStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (existingStyleEl) {
            if (existingStyleEl.innerHTML !== nextStyleText) {
                existingStyleEl.innerHTML = nextStyleText;
            }
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
        if (contentRoot) {
            mountThemeHost(contentRoot);
        }
        ensureThemeBinding();

        bindUiEvents();
        applySettingsTooltips();
    } catch (error) {
        console.error('UI 渲染失败:', error);
    }
}

/**
 * 功能：绑定设置面板交互逻辑。
 * 参数：
 *   无。
 * 返回：
 *   void：无返回值。
 */
function bindUiEvents(): void {
    const runtime = getRuntime();
    const stContext = (window as any).SillyTavern?.getContext?.() || {};

    type STContextSnapshot = {
        extensionSettings?: Record<string, any>;
        saveSettingsDebounced?: () => void;
    } | null;

    /**
     * 功能：获取最新 SillyTavern 上下文，避免闭包持有过期对象。
     * 参数：无。
     * 返回：上下文对象或 null。
     */
    const getStContext = (): STContextSnapshot => {
        return (window as any).SillyTavern?.getContext?.() || null;
    };

    /**
     * 功能：确保存在 `stx_llmhub` 设置对象。
     * 参数：
     *   无。
     * 返回：
     *   LLMHubSettings：设置对象引用。
     */
    const ensureSettings = (): LLMHubSettings => {
        const stContext = getStContext();
        if (!stContext) {
            return {};
        }
        if (!stContext.extensionSettings) {
            stContext.extensionSettings = {};
        }
        if (!stContext.extensionSettings['stx_llmhub']) {
            stContext.extensionSettings['stx_llmhub'] = {};
        }
        return stContext.extensionSettings['stx_llmhub'] as LLMHubSettings;
    };

    /**
     * 功能：触发设置保存。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const saveSettings = (): void => {
        const stContext = getStContext();
        stContext?.saveSettingsDebounced?.();
    };

    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabRouterId, panelId: IDS.panelRouterId },
        { tabId: IDS.tabConsumerMapId, panelId: IDS.panelConsumerMapId },
        { tabId: IDS.tabVaultId, panelId: IDS.panelVaultId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) {
            return;
        }
        tabEl.addEventListener('click', () => {
            tabs.forEach(({ tabId: tId, panelId: pId }) => {
                const tEl = document.getElementById(tId);
                const pEl = document.getElementById(pId);
                tEl?.classList.remove('is-active');
                pEl?.setAttribute('hidden', 'true');
            });
            tabEl.classList.add('is-active');
            document.getElementById(panelId)?.removeAttribute('hidden');
            if (panelId === IDS.panelConsumerMapId) {
                renderConsumerMappings().catch((error: unknown) => {
                    console.error('renderConsumerMappings failed:', error);
                });
            }
        });
    });

    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement | null;
    if (searchInput) {
        searchInput.addEventListener('input', (evt: Event) => {
            const term = ((evt.target as HTMLInputElement).value || '').toLowerCase().trim();
            const searchableItems = document.querySelectorAll('[data-stx-ui-search]');
            searchableItems.forEach((el: Element) => {
                const keywords = (el.getAttribute('data-stx-ui-search') || '').toLowerCase();
                if (!term || keywords.includes(term)) {
                    el.classList.remove('is-hidden-by-search');
                } else {
                    el.classList.add('is-hidden-by-search');
                }
            });
        });
    }

    const vaultSaveBtn = document.getElementById(IDS.vaultSaveBtnId);
    const vaultClearBtn = document.getElementById(IDS.vaultClearBtnId);
    const vaultServiceSelect = document.getElementById(IDS.vaultAddServiceId) as HTMLSelectElement | null;
    const vaultKeyInput = document.getElementById(IDS.vaultApiKeyId) as HTMLInputElement | null;

    if (vaultSaveBtn && vaultServiceSelect && vaultKeyInput) {
        vaultSaveBtn.addEventListener('click', async () => {
            const provider = vaultServiceSelect.value;
            const apiKey = vaultKeyInput.value.trim();
            if (!apiKey) {
                alert('API Key 不能为空');
                return;
            }
            try {
                if (!runtime?.saveCredential) {
                    throw new Error('LLMHub Runtime 未就绪');
                }
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
            if (!confirm('确定清空全部凭据吗？')) {
                return;
            }
            try {
                if (!runtime?.clearAllCredentials) {
                    throw new Error('LLMHub Runtime 未就绪');
                }
                await runtime.clearAllCredentials();
                alert('已清空全部凭据');
            } catch (error) {
                console.error('清空凭据失败:', error);
                alert('清空凭据失败，请查看控制台');
            }
        });
    }

    const cardRoot = document.getElementById(IDS.cardId);
    const syncCardDisabledState = (enabled: boolean): void => {
        cardRoot?.classList.toggle('is-card-disabled', !enabled);
    };

    const enabledEl = document.getElementById(IDS.enabledId) as HTMLInputElement | null;
    if (enabledEl) {
        enabledEl.checked = ensureSettings().enabled === true;
        syncCardDisabledState(enabledEl.checked);
        enabledEl.addEventListener('change', () => {
            const settings = ensureSettings();
            settings.enabled = enabledEl.checked;
            syncCardDisabledState(enabledEl.checked);
            saveSettings();
            (window as any).STX?.bus?.emit('plugin:broadcast:state_changed', {
                v: 1,
                type: 'broadcast',
                topic: 'plugin:broadcast:state_changed',
                from: 'stx_llmhub',
                ts: Date.now(),
                data: { isEnabled: enabledEl.checked },
            });
        });
    }

    const defaultProviderEl = document.getElementById(IDS.defaultProviderId) as HTMLSelectElement | null;
    const defaultModelEl = document.getElementById(IDS.defaultModelId) as HTMLInputElement | null;
    const profileEl = document.getElementById(IDS.globalProfileId) as HTMLSelectElement | null;

    const settings = ensureSettings();
    if (defaultProviderEl) {
        defaultProviderEl.value = settings.defaultProvider || 'openai';
    }
    if (defaultModelEl) {
        defaultModelEl.value = settings.defaultModel || 'gpt-4o-mini';
    }
    if (profileEl) {
        profileEl.value = settings.globalProfile || 'balanced';
    }
    syncSharedSelects(document.getElementById(IDS.cardId) || document.body);

    /**
     * 功能：保存默认 Provider 与默认 Model。
     * 参数：
     *   无。
     * 返回：
     *   Promise<void>：保存流程完成。
     */
    const saveDefaultRouteSettings = async (): Promise<void> => {
        if (!runtime?.setDefaultRoute || !defaultProviderEl || !defaultModelEl) {
            return;
        }
        const provider = defaultProviderEl.value;
        const model = defaultModelEl.value.trim() || 'gpt-4o-mini';
        await runtime.setDefaultRoute(provider, model);
        const current = ensureSettings();
        current.defaultProvider = provider;
        current.defaultModel = model;
        saveSettings();
    };

    defaultProviderEl?.addEventListener('change', () => {
        saveDefaultRouteSettings().catch((error: unknown) => {
            console.error('保存默认 Provider 失败:', error);
        });
    });

    defaultModelEl?.addEventListener('blur', () => {
        saveDefaultRouteSettings().catch((error: unknown) => {
            console.error('保存默认 Model 失败:', error);
        });
    });

    profileEl?.addEventListener('change', () => {
        const profile = profileEl.value;
        try {
            runtime?.sdk?.setGlobalProfile?.(profile);
            const current = ensureSettings();
            current.globalProfile = profile;
            saveSettings();
        } catch (error) {
            console.error('设置全局 Profile 失败:', error);
        }
    });

    const routeConsumerEl = document.getElementById(IDS.routeConsumerId) as HTMLInputElement | null;
    const routeTaskEl = document.getElementById(IDS.routeTaskId) as HTMLInputElement | null;
    const routeProviderEl = document.getElementById(IDS.routeProviderId) as HTMLSelectElement | null;
    const routeProfileEl = document.getElementById(IDS.routeProfileId) as HTMLSelectElement | null;
    const routeFallbackEl = document.getElementById(IDS.routeFallbackProviderId) as HTMLSelectElement | null;
    const routeSaveBtn = document.getElementById(IDS.routeSaveBtnId);
    const routeResetBtn = document.getElementById(IDS.routeResetBtnId);
    const routeListEl = document.getElementById(IDS.routeListId);
    const consumerMapRefreshBtn = document.getElementById(IDS.consumerMapRefreshBtnId);
    const consumerMapListEl = cardRoot?.querySelector<HTMLElement>('[data-consumer-map-list="1"]') ?? null;

    const budgetConsumerEl = document.getElementById(IDS.budgetConsumerId) as HTMLInputElement | null;
    const budgetMaxRpmEl = document.getElementById(IDS.budgetMaxRpmId) as HTMLInputElement | null;
    const budgetMaxTokensEl = document.getElementById(IDS.budgetMaxTokensId) as HTMLInputElement | null;
    const budgetMaxLatencyEl = document.getElementById(IDS.budgetMaxLatencyId) as HTMLInputElement | null;
    const budgetMaxCostEl = document.getElementById(IDS.budgetMaxCostId) as HTMLInputElement | null;
    const budgetSaveBtn = document.getElementById(IDS.budgetSaveBtnId);
    const budgetResetBtn = document.getElementById(IDS.budgetResetBtnId);
    const budgetListEl = document.getElementById(IDS.budgetListId);
    const routerAdvancedToggleEl = document.getElementById(IDS.routerAdvancedToggleId) as HTMLButtonElement | null;
    const routerAdvancedBodyEl = document.getElementById(IDS.routerAdvancedBodyId) as HTMLElement | null;

    if (routerAdvancedToggleEl && routerAdvancedBodyEl) {
        routerAdvancedToggleEl.setAttribute('aria-expanded', 'false');
        routerAdvancedBodyEl.setAttribute('hidden', 'true');
        routerAdvancedToggleEl.addEventListener('click', () => {
            const expanded = routerAdvancedToggleEl.getAttribute('aria-expanded') === 'true';
            const nextExpanded = !expanded;
            routerAdvancedToggleEl.setAttribute('aria-expanded', nextExpanded ? 'true' : 'false');
            if (nextExpanded) {
                routerAdvancedBodyEl.removeAttribute('hidden');
            } else {
                routerAdvancedBodyEl.setAttribute('hidden', 'true');
            }
        });
    }

    /**
     * 功能：获取可选 Provider 列表。
     * 参数：
     *   无。
     * 返回：
     *   string[]：Provider ID 列表。
     */
    const getProviderIds = (): string[] => {
        const dynamic = runtime?.router?.getAllProviders?.() || [];
        const dynamicIds = dynamic
            .map((provider: ProviderLite) => String(provider?.id || '').trim())
            .filter(Boolean);
        const fallback = ['openai', 'claude', 'gemini', 'groq'];
        return Array.from(new Set([...dynamicIds, ...fallback]));
    };

    /**
     * 功能：刷新 Provider 下拉框选项。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const refreshProviderSelects = (): void => {
        const providerIds = getProviderIds();
        const updateSelect = (selectEl: HTMLSelectElement | null, allowEmpty: boolean): void => {
            if (!selectEl) {
                return;
            }
            const previousValue = selectEl.value;
            selectEl.innerHTML = '';
            if (allowEmpty) {
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '(不指定)';
                selectEl.appendChild(emptyOption);
            }
            providerIds.forEach((providerId: string) => {
                const option = document.createElement('option');
                option.value = providerId;
                option.textContent = providerId;
                selectEl.appendChild(option);
            });
            if (Array.from(selectEl.options).some((opt: HTMLOptionElement) => opt.value === previousValue)) {
                selectEl.value = previousValue;
            }
        };

        updateSelect(defaultProviderEl, false);
        updateSelect(routeProviderEl, false);
        updateSelect(routeFallbackEl, true);
        updateSelect(vaultServiceSelect, false);

        const current = ensureSettings();
        if (defaultProviderEl && current.defaultProvider) {
            defaultProviderEl.value = current.defaultProvider;
        }
        refreshSharedSelectOptions(document.getElementById(IDS.cardId) || document.body);
    };

    /**
     * 功能：读取路由规则并做最小归一化。
     * 参数：
     *   无。
     * 返回：
     *   RoutePolicy[]：规范化后的规则数组。
     */
    const readRoutePolicies = (): RoutePolicy[] => {
        const raw = ensureSettings().routePolicies;
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .map((item: any) => ({
                consumer: String(item?.consumer || '').trim(),
                task: String(item?.task || '').trim(),
                providerId: String(item?.providerId || '').trim(),
                profileId: item?.profileId ? String(item.profileId).trim() : undefined,
                fallbackProviderId: item?.fallbackProviderId ? String(item.fallbackProviderId).trim() : undefined,
            }))
            .filter((item: RoutePolicy) => item.consumer && item.task && item.providerId);
    };

    /**
     * 功能：判断两个 consumer 是否可视为同一调用方。
     * 参数：
     *   left：调用方 A。
     *   right：调用方 B。
     * 返回：
     *   boolean：是否同一调用方。
     */
    const isSameConsumer = (left: string, right: string): boolean => {
        return String(left || '').trim() === String(right || '').trim();
    };

    /**
     * 功能：写入并应用路由规则。
     * 参数：
     *   policies：待写入规则数组。
     * 返回：
     *   void：无返回值。
     */
    const writeRoutePolicies = (policies: RoutePolicy[]): void => {
        runtime?.setRoutePolicies?.(policies);
        const current = ensureSettings();
        current.routePolicies = policies;
        saveSettings();
    };

    /**
     * 功能：渲染路由规则列表。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const renderRoutePolicies = (): void => {
        if (!routeListEl) {
            return;
        }
        const policies = readRoutePolicies();
        if (policies.length === 0) {
            routeListEl.innerHTML = '<div class="stx-ui-list-empty">暂无路由规则</div>';
            return;
        }
        routeListEl.innerHTML = policies
            .map((policy: RoutePolicy, index: number) => `
            <div class="stx-ui-list-item">
              <div>
                <div class="stx-ui-list-title">${policy.consumer} / ${policy.task}</div>
                <div class="stx-ui-list-meta">
                  服务商=${policy.providerId}
                  ${policy.profileId ? `，参数档=${getProfileLabel(policy.profileId)}` : ''}
                  ${policy.fallbackProviderId ? `，备用=${policy.fallbackProviderId}` : ''}
                </div>
              </div>
              <button class="stx-ui-btn secondary" type="button" data-route-index="${index}">删除</button>
            </div>
          `)
            .join('');
    };

    /**
     * 功能：转义文本，防止注入到 innerHTML。
     * 参数：
     *   value：原始文本。
     * 返回：
     *   string：转义后的文本。
     */
    const escapeHtml = (value: string): string => {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * 功能：渲染插件映射列表。
     * 参数：无。
     * 返回：
     *   Promise<void>：渲染完成。
     */
    const renderConsumerMappings = async (): Promise<void> => {
        if (!consumerMapListEl) {
            return;
        }
        consumerMapListEl.innerHTML = '<div class="stx-ui-list-empty">正在检测在线插件...</div>';
        let discovered: DiscoveredConsumer[] = [];
        try {
            discovered = await discoverConsumers({
                fromNamespace: 'stx_llmhub',
                timeoutMs: 1200,
                excludePluginIds: ['stx_llmhub'],
                onlineOnly: true,
            });
        } catch (error) {
            console.error('discoverConsumers failed:', error);
        }

        if (!discovered.length) {
            consumerMapListEl.innerHTML = '<div class="stx-ui-list-empty">未检测到在线插件</div>';
            refreshSettingsTooltips();
            return;
        }

        const providerIds = getProviderIds();
        const profiles = Object.keys(PROFILE_LABELS);
        const policies = readRoutePolicies();

        const providerOptionHtml = (selected: string): string =>
            providerIds
                .map((providerId: string) => `<option value="${escapeHtml(providerId)}"${providerId === selected ? ' selected' : ''}>${escapeHtml(providerId)}</option>`)
                .join('');
        const profileOptionHtml = (selected?: string): string =>
            [''].concat(profiles)
                .map((profileId: string) => {
                    const label = profileId ? getProfileLabel(profileId) : '(不指定)';
                    return `<option value="${escapeHtml(profileId)}"${profileId === (selected || '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
                })
                .join('');
        const fallbackOptionHtml = (selected?: string): string =>
            [''].concat(providerIds)
                .map((providerId: string) => {
                    const label = providerId || '(不指定)';
                    return `<option value="${escapeHtml(providerId)}"${providerId === (selected || '') ? ' selected' : ''}>${escapeHtml(label)}</option>`;
                })
                .join('');

        consumerMapListEl.innerHTML = discovered
            .map((item: DiscoveredConsumer) => {
                const currentPolicy = policies.find((policy: RoutePolicy) => policy.task === '*' && isSameConsumer(policy.consumer, item.pluginId));
                const pluginId = item.pluginId;
                const displayName = item.displayName || pluginId;
                const stateText = item.isEnabled === false ? '在线（插件已关闭）' : '在线';
                return `
                <div class="stx-ui-list-item stx-ui-consumer-map-row" data-consumer-map-row="${escapeHtml(pluginId)}">
                  <div class="stx-ui-consumer-map-head">
                    <div class="stx-ui-list-title">${escapeHtml(displayName)} <span class="stx-ui-list-meta">(${escapeHtml(pluginId)})</span></div>
                    <div class="stx-ui-consumer-map-status">
                      <span class="stx-ui-consumer-map-status-dot" aria-hidden="true"></span>
                      <span>${escapeHtml(stateText)}</span>
                    </div>
                  </div>
                  <div class="stx-ui-consumer-map-form">
                    <div class="stx-ui-field">
                      <label class="stx-ui-field-label">服务商</label>
                      <select class="stx-ui-select stx-ui-input-full" data-consumer-map-provider="${escapeHtml(pluginId)}">
                        ${providerOptionHtml(currentPolicy?.providerId || providerIds[0] || '')}
                      </select>
                    </div>
                    <div class="stx-ui-field">
                      <label class="stx-ui-field-label">参数档</label>
                      <select class="stx-ui-select stx-ui-input-full" data-consumer-map-profile="${escapeHtml(pluginId)}">
                        ${profileOptionHtml(currentPolicy?.profileId)}
                      </select>
                    </div>
                    <div class="stx-ui-field">
                      <label class="stx-ui-field-label">备用服务商</label>
                      <select class="stx-ui-select stx-ui-input-full" data-consumer-map-fallback="${escapeHtml(pluginId)}">
                        ${fallbackOptionHtml(currentPolicy?.fallbackProviderId)}
                      </select>
                    </div>
                  </div>
                  <div class="stx-ui-consumer-map-actions">
                    <button class="stx-ui-btn" type="button" data-consumer-map-save="${escapeHtml(pluginId)}">保存映射</button>
                    <button class="stx-ui-btn secondary" type="button" data-consumer-map-delete="${escapeHtml(pluginId)}">删除映射</button>
                  </div>
                </div>
              `;
            })
            .join('');
        refreshSettingsTooltips();
    };

    /**
     * 功能：重置路由编辑表单。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const clearRouteForm = (): void => {
        if (routeConsumerEl) {
            routeConsumerEl.value = '';
        }
        if (routeTaskEl) {
            routeTaskEl.value = '';
        }
        if (routeProviderEl) {
            routeProviderEl.value = defaultProviderEl?.value || routeProviderEl.value;
        }
        if (routeProfileEl) {
            routeProfileEl.value = '';
        }
        if (routeFallbackEl) {
            routeFallbackEl.value = '';
        }
        syncSharedSelects(document.getElementById(IDS.cardId) || document.body);
    };

    routeSaveBtn?.addEventListener('click', () => {
        const consumer = (routeConsumerEl?.value || '').trim();
        const task = (routeTaskEl?.value || '').trim();
        const providerId = (routeProviderEl?.value || '').trim();
        const profileId = (routeProfileEl?.value || '').trim();
        const fallbackProviderId = (routeFallbackEl?.value || '').trim();

        if (!consumer || !task || !providerId) {
            alert('请填写：调用方、任务名、服务商');
            return;
        }

        const next: RoutePolicy = {
            consumer,
            task,
            providerId,
            profileId: profileId || undefined,
            fallbackProviderId: fallbackProviderId || undefined,
        };

        const policies = readRoutePolicies();
        const existingIndex = policies.findIndex((item: RoutePolicy) => item.consumer === consumer && item.task === task);
        if (existingIndex >= 0) {
            policies[existingIndex] = next;
        } else {
            policies.push(next);
        }
        writeRoutePolicies(policies);
        renderRoutePolicies();
        renderConsumerMappings().catch((error: unknown) => {
            console.error('renderConsumerMappings failed:', error);
        });
        clearRouteForm();
    });

    routeResetBtn?.addEventListener('click', () => {
        clearRouteForm();
    });

    routeListEl?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const button = target.closest<HTMLButtonElement>('button[data-route-index]');
        if (!button) {
            return;
        }
        const index = Number(button.dataset.routeIndex);
        if (!Number.isInteger(index)) {
            return;
        }
        const policies = readRoutePolicies();
        if (index < 0 || index >= policies.length) {
            return;
        }
        policies.splice(index, 1);
        writeRoutePolicies(policies);
        renderRoutePolicies();
        renderConsumerMappings().catch((error: unknown) => {
            console.error('renderConsumerMappings failed:', error);
        });
    });

    consumerMapRefreshBtn?.addEventListener('click', () => {
        renderConsumerMappings().catch((error: unknown) => {
            console.error('renderConsumerMappings failed:', error);
        });
    });

    consumerMapListEl?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const saveBtn = target.closest<HTMLButtonElement>('button[data-consumer-map-save]');
        const deleteBtn = target.closest<HTMLButtonElement>('button[data-consumer-map-delete]');
        const pluginId = String(saveBtn?.dataset.consumerMapSave || deleteBtn?.dataset.consumerMapDelete || '').trim();
        if (!pluginId) {
            return;
        }
        if (!consumerMapListEl) {
            return;
        }

        const policies = readRoutePolicies();
        const nextPolicies = policies.filter(
            (item: RoutePolicy) => !(item.task === '*' && isSameConsumer(item.consumer, pluginId))
        );

        if (saveBtn) {
            const providerEl = consumerMapListEl.querySelector<HTMLSelectElement>(`select[data-consumer-map-provider="${pluginId}"]`);
            const profileEl = consumerMapListEl.querySelector<HTMLSelectElement>(`select[data-consumer-map-profile="${pluginId}"]`);
            const fallbackEl = consumerMapListEl.querySelector<HTMLSelectElement>(`select[data-consumer-map-fallback="${pluginId}"]`);
            const providerId = String(providerEl?.value || '').trim();
            if (!providerId) {
                alert('请先选择服务商');
                return;
            }
            nextPolicies.push({
                consumer: pluginId,
                task: '*',
                providerId,
                profileId: String(profileEl?.value || '').trim() || undefined,
                fallbackProviderId: String(fallbackEl?.value || '').trim() || undefined,
            });
        }

        writeRoutePolicies(nextPolicies);
        renderRoutePolicies();
        renderConsumerMappings().catch((error: unknown) => {
            console.error('renderConsumerMappings failed:', error);
        });
    });

    /**
     * 功能：将输入框字符串转换为可选数字。
     * 参数：
     *   value：输入字符串。
     * 返回：
     *   number | undefined：合法数字或 undefined。
     */
    const parseOptionalNumber = (value: string): number | undefined => {
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return undefined;
        }
        return parsed;
    };

    /**
     * 功能：读取预算配置映射。
     * 参数：
     *   无。
     * 返回：
     *   Record<string, BudgetConfig>：预算映射。
     */
    const readBudgets = (): Record<string, BudgetConfig> => {
        const raw = ensureSettings().budgets;
        if (!raw || typeof raw !== 'object') {
            return {};
        }
        return { ...raw };
    };

    /**
     * 功能：渲染预算列表。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const renderBudgets = (): void => {
        if (!budgetListEl) {
            return;
        }
        const budgetMap = readBudgets();
        const entries = Object.entries(budgetMap);
        if (entries.length === 0) {
            budgetListEl.innerHTML = '<div class="stx-ui-list-empty">暂无预算规则</div>';
            return;
        }
        budgetListEl.innerHTML = entries
            .map(([consumer, config]: [string, BudgetConfig]) => `
            <div class="stx-ui-list-item">
              <div>
                <div class="stx-ui-list-title">${consumer}</div>
                <div class="stx-ui-list-meta">
                  maxRPM=${config.maxRPM ?? '-'},
                  maxTokens=${config.maxTokens ?? '-'},
                  maxLatencyMs=${config.maxLatencyMs ?? '-'},
                  maxCost=${config.maxCost ?? '-'}
                </div>
              </div>
              <button class="stx-ui-btn secondary" type="button" data-budget-consumer="${consumer}">删除</button>
            </div>
          `)
            .join('');
    };

    /**
     * 功能：重置预算编辑表单。
     * 参数：
     *   无。
     * 返回：
     *   void：无返回值。
     */
    const clearBudgetForm = (): void => {
        if (budgetConsumerEl) {
            budgetConsumerEl.value = '';
        }
        if (budgetMaxRpmEl) {
            budgetMaxRpmEl.value = '';
        }
        if (budgetMaxTokensEl) {
            budgetMaxTokensEl.value = '';
        }
        if (budgetMaxLatencyEl) {
            budgetMaxLatencyEl.value = '';
        }
        if (budgetMaxCostEl) {
            budgetMaxCostEl.value = '';
        }
    };

    budgetSaveBtn?.addEventListener('click', () => {
        const consumer = (budgetConsumerEl?.value || '').trim();
        if (!consumer) {
            alert('请填写预算的调用方');
            return;
        }

        const config: BudgetConfig = {};
        const maxRPM = parseOptionalNumber(budgetMaxRpmEl?.value || '');
        const maxTokens = parseOptionalNumber(budgetMaxTokensEl?.value || '');
        const maxLatencyMs = parseOptionalNumber(budgetMaxLatencyEl?.value || '');
        const maxCost = parseOptionalNumber(budgetMaxCostEl?.value || '');

        if (maxRPM !== undefined) {
            config.maxRPM = maxRPM;
        }
        if (maxTokens !== undefined) {
            config.maxTokens = maxTokens;
        }
        if (maxLatencyMs !== undefined) {
            config.maxLatencyMs = maxLatencyMs;
        }
        if (maxCost !== undefined) {
            config.maxCost = maxCost;
        }

        runtime?.setBudgetConfig?.(consumer, config);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        budgets[consumer] = config;
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
        clearBudgetForm();
    });

    budgetResetBtn?.addEventListener('click', () => {
        clearBudgetForm();
    });

    budgetListEl?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const button = target.closest<HTMLButtonElement>('button[data-budget-consumer]');
        if (!button) {
            return;
        }
        const consumer = String(button.dataset.budgetConsumer || '').trim();
        if (!consumer) {
            return;
        }

        runtime?.removeBudgetConfig?.(consumer);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        delete budgets[consumer];
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
    });

    refreshProviderSelects();
    renderRoutePolicies();
    renderBudgets();
    const currentEnabled = ensureSettings().enabled === true;
    setTimeout(() => {
        (window as any).STX?.bus?.emit('plugin:broadcast:state_changed', {
            v: 1,
            type: 'broadcast',
            topic: 'plugin:broadcast:state_changed',
            from: 'stx_llmhub',
            ts: Date.now(),
            data: { isEnabled: currentEnabled },
        });
    }, 500);

    runtime?.applySettingsFromContext?.().catch((error: unknown) => {
        console.error('应用 LLMHub 设置失败:', error);
    });
}
