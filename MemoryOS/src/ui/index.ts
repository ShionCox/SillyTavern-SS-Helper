import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { logger, toast } from '../index';
import { openRecordEditor } from './recordEditorNext';
import { hydrateSharedSelects, refreshSharedSelectOptions } from '../../../_Components/sharedSelect';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { applyTailwindScopeToNode } from '../../../SDK/tailwind';
import { mountThemeHost, unmountThemeHost, initThemeKernel, subscribeTheme } from '../../../SDK/theme';
import { renderSettingsExperience } from './settingsCardExperience';
import { showSnapshotSourceDetails } from './candidateSourceDialogs';
import { createEditorActionExecutor } from './editorActions';
import { bindRuntimeControlTab } from './settingsTabs/runtimeControlTab';
import { bindMemoryStrategyTab } from './settingsTabs/memoryStrategyTab';
import { bindDataMaintenanceTab } from './settingsTabs/dataMaintenanceTab';
import { bindAboutDiagnosticsTab } from './settingsTabs/aboutDiagnosticsTab';

interface SettingsTabEntry {
    tabId: string;
    panelId: string;
}

let MEMORYOS_THEME_BINDING_READY = false;

const NAMESPACE = 'stx-memoryos';
const CHARACTER_ROLE_STORAGE_PREFIX = 'stx-memoryos-character-role:';

/**
 * 功能：规范化文本，便于比较和检索。
 * @param value 原始值。
 * @returns 清理后的字符串。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：生成更新日志 HTML。
 * @returns 更新日志片段。
 */
function generateChangelogHtml(): string {
    if (!Array.isArray(changelogData) || changelogData.length === 0) {
        return '暂无更新记录';
    }
    return changelogData.map((log: { version?: string; date?: string; changes?: string[] }): string => `
      <div class="stx-ui-changelog-entry">
        <div class="stx-ui-changelog-head">
          <span class="stx-ui-changelog-version">${log.version || ''}</span>
          ${log.date ? `<span class="stx-ui-changelog-date">${log.date}</span>` : ''}
        </div>
        <ul class="stx-ui-changelog-list">
          ${(Array.isArray(log.changes) ? log.changes : []).map((item: string): string => `<li>${item}</li>`).join('')}
        </ul>
      </div>
    `).join('');
}

const IDS: MemoryOSSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'Memory OS',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as { email?: string }).email || '',
    githubText: (manifestJson as { homePage?: string }).homePage
        ? (manifestJson as { homePage?: string }).homePage!.replace(/^https?:\/\//i, '')
        : 'GitHub',
    githubUrl: (manifestJson as { homePage?: string }).homePage || '#',
    searchId: `${NAMESPACE}-search`,
    experienceRefreshBtnId: `${NAMESPACE}-experience-refresh`,
    experienceRecordEditorBtnId: `${NAMESPACE}-experience-record-editor`,
    experienceSnapshotBtnId: `${NAMESPACE}-experience-snapshot`,
    tabRoleId: `${NAMESPACE}-tab-role`,
    tabRecentId: `${NAMESPACE}-tab-recent`,
    tabRelationId: `${NAMESPACE}-tab-relation`,
    tabInjectionId: `${NAMESPACE}-tab-injection`,
    tabMainId: `${NAMESPACE}-tab-main`,
    tabAiId: `${NAMESPACE}-tab-ai`,
    tabDbId: `${NAMESPACE}-tab-db`,
    tabAboutId: `${NAMESPACE}-tab-about`,
    panelRoleId: `${NAMESPACE}-panel-role`,
    panelRecentId: `${NAMESPACE}-panel-recent`,
    panelRelationId: `${NAMESPACE}-panel-relation`,
    panelInjectionId: `${NAMESPACE}-panel-injection`,
    panelAdvancedToolsId: `${NAMESPACE}-panel-advanced-tools`,
    panelMainId: `${NAMESPACE}-panel-main`,
    panelAiId: `${NAMESPACE}-panel-ai`,
    panelDbId: `${NAMESPACE}-panel-db`,
    panelAboutId: `${NAMESPACE}-panel-about`,
    roleOverviewMetaId: `${NAMESPACE}-role-overview-meta`,
    rolePersonaBadgesId: `${NAMESPACE}-role-persona-badges`,
    rolePrimaryFactsId: `${NAMESPACE}-role-primary-facts`,
    roleRecentMemoryId: `${NAMESPACE}-role-recent-memory`,
    roleBlurMemoryId: `${NAMESPACE}-role-blur-memory`,
    recentEventsId: `${NAMESPACE}-recent-events`,
    recentSummariesId: `${NAMESPACE}-recent-summaries`,
    recentLifecycleId: `${NAMESPACE}-recent-lifecycle`,
    relationOverviewId: `${NAMESPACE}-relation-overview`,
    relationLanesId: `${NAMESPACE}-relation-lanes`,
    relationStateId: `${NAMESPACE}-relation-state`,
    injectionOverviewId: `${NAMESPACE}-injection-overview`,
    injectionSectionsId: `${NAMESPACE}-injection-sections`,
    injectionReasonId: `${NAMESPACE}-injection-reason`,
    injectionPostId: `${NAMESPACE}-injection-post`,
    tuningCandidateAcceptThresholdBiasId: `${NAMESPACE}-tuning-candidate-threshold-bias`,
    tuningRecallRelationshipBiasId: `${NAMESPACE}-tuning-recall-relationship-bias`,
    tuningRecallEmotionBiasId: `${NAMESPACE}-tuning-recall-emotion-bias`,
    tuningRecallRecencyBiasId: `${NAMESPACE}-tuning-recall-recency-bias`,
    tuningRecallContinuityBiasId: `${NAMESPACE}-tuning-recall-continuity-bias`,
    tuningDistortionProtectionBiasId: `${NAMESPACE}-tuning-distortion-protection-bias`,
    tuningRecallRetentionLimitId: `${NAMESPACE}-tuning-recall-retention-limit`,
    tuningRefreshBtnId: `${NAMESPACE}-tuning-refresh`,
    tuningResetBtnId: `${NAMESPACE}-tuning-reset`,
    tuningSaveBtnId: `${NAMESPACE}-tuning-save`,
    taskSurfaceBackgroundToastId: `${NAMESPACE}-task-surface-background-toast`,
    taskSurfaceDisableComposerId: `${NAMESPACE}-task-surface-disable-composer`,
    taskSurfaceBlockingDefaultId: `${NAMESPACE}-task-surface-blocking-default`,
    taskSurfaceAutoCloseSecondsId: `${NAMESPACE}-task-surface-auto-close-seconds`,
    templateListId: `${NAMESPACE}-template-list`,
    templateRefreshBtnId: `${NAMESPACE}-template-refresh`,
    templateForceRebuildBtnId: `${NAMESPACE}-template-force-rebuild`,
    templateActiveSelectId: `${NAMESPACE}-template-active-select`,
    templateSetActiveBtnId: `${NAMESPACE}-template-active-apply`,
    templateLockId: `${NAMESPACE}-template-lock`,
    enabledId: `${NAMESPACE}-enabled`,
    aiModeEnabledId: `${NAMESPACE}-ai-mode`,
    aiModeStatusLightId: `${NAMESPACE}-ai-mode-status-light`,
    autoCompactionId: `${NAMESPACE}-auto-compaction`,
    dbCompactionDividerId: `${NAMESPACE}-db-divider-compaction`,
    contextMaxTokensId: `${NAMESPACE}-context-max-tokens`,
    injectionPreviewEnabledId: `${NAMESPACE}-injection-preview-enabled`,
    recordFilterEnabledId: `${NAMESPACE}-record-filter-enabled`,
    recordFilterSectionId: `${NAMESPACE}-record-filter-section`,
    recordFilterDetailWrapId: `${NAMESPACE}-record-filter-detail-wrap`,
    recordFilterLevelId: `${NAMESPACE}-record-filter-level`,
    recordFilterTypeHtmlId: `${NAMESPACE}-record-filter-type-html`,
    recordFilterTypeXmlId: `${NAMESPACE}-record-filter-type-xml`,
    recordFilterTypeJsonId: `${NAMESPACE}-record-filter-type-json`,
    recordFilterTypeCodeblockId: `${NAMESPACE}-record-filter-type-codeblock`,
    recordFilterTypeMarkdownId: `${NAMESPACE}-record-filter-type-markdown`,
    recordFilterCustomCodeblockEnabledId: `${NAMESPACE}-record-filter-custom-codeblock-enabled`,
    recordFilterCustomCodeblockTagsId: `${NAMESPACE}-record-filter-custom-codeblock-tags`,
    recordFilterJsonModeId: `${NAMESPACE}-record-filter-json-mode`,
    recordFilterJsonKeysId: `${NAMESPACE}-record-filter-json-keys`,
    recordFilterPureCodePolicyId: `${NAMESPACE}-record-filter-pure-policy`,
    recordFilterPlaceholderId: `${NAMESPACE}-record-filter-placeholder`,
    recordFilterCustomRegexEnabledId: `${NAMESPACE}-record-filter-custom-enabled`,
    recordFilterCustomRegexRulesId: `${NAMESPACE}-record-filter-custom-rules`,
    recordFilterMaxTextLengthId: `${NAMESPACE}-record-filter-max-length`,
    recordFilterMinEffectiveCharsId: `${NAMESPACE}-record-filter-min-effective`,
    recordFilterPreviewInputId: `${NAMESPACE}-record-filter-preview-input`,
    recordFilterPreviewBtnId: `${NAMESPACE}-record-filter-preview-btn`,
    recordFilterPreviewOutputId: `${NAMESPACE}-record-filter-preview-output`,
    dbCompactBtnId: `${NAMESPACE}-db-compact-btn`,
    dbExportBtnId: `${NAMESPACE}-db-export-btn`,
    dbImportBtnId: `${NAMESPACE}-db-import-btn`,
    dbClearBtnId: `${NAMESPACE}-db-clear-btn`,
    recordEditorBtnId: `${NAMESPACE}-record-editor-btn`,
    auditListId: `${NAMESPACE}-audit-list`,
    auditCreateSnapshotBtnId: `${NAMESPACE}-audit-snapshot`,
    auditRefreshBtnId: `${NAMESPACE}-audit-refresh`,
    mutationHistoryListId: `${NAMESPACE}-mutation-history-list`,
    mutationHistoryRefreshBtnId: `${NAMESPACE}-mutation-history-refresh`,
    wiPreviewId: `${NAMESPACE}-wi-preview`,
    wiPreviewBtnId: `${NAMESPACE}-wi-preview-btn`,
    wiWritebackBtnId: `${NAMESPACE}-wi-writeback`,
    wiWriteSummaryBtnId: `${NAMESPACE}-wi-write-summary`,
    aiDiagOverviewId: `${NAMESPACE}-ai-diag-overview`,
    aiDiagCapabilitiesId: `${NAMESPACE}-ai-diag-capabilities`,
    aiDiagRecentTasksId: `${NAMESPACE}-ai-diag-recent-tasks`,
    aiDiagRefreshBtnId: `${NAMESPACE}-ai-diag-refresh`,
    aiRoutePreviewId: `${NAMESPACE}-ai-route-preview`,
};

/**
 * 功能：应用设置页通用提示。
 * @returns 无返回值。
 */
function applySettingsTooltips(): void {
    ensureSharedTooltip();
}

/**
 * 功能：确保主题变化时重新挂载主题宿主。
 * @returns 无返回值。
 */
function ensureThemeBinding(): void {
    if (MEMORYOS_THEME_BINDING_READY) {
        return;
    }
    MEMORYOS_THEME_BINDING_READY = true;
    subscribeTheme((): void => {
        const cardRoot = document.getElementById(IDS.cardId);
        if (cardRoot) {
            unmountThemeHost(cardRoot);
        }
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) {
            mountThemeHost(contentRoot);
        }
    });
}

/**
 * 功能：等待目标元素出现在页面中。
 * @param selector 目标选择器。
 * @param timeout 超时时间。
 * @returns 找到的元素。
 */
function waitForElement(selector: string, timeout: number = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const element = document.querySelector(selector);
        if (element) {
            resolve(element);
            return;
        }
        const observer = new MutationObserver((_mutations: MutationRecord[], mutationObserver: MutationObserver): void => {
            const nextElement = document.querySelector(selector);
            if (nextElement) {
                mutationObserver.disconnect();
                resolve(nextElement);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        window.setTimeout((): void => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

/**
 * 功能：读取角色标记缓存。
 * @param chatKey 聊天键。
 * @returns 角色标记表。
 */
function readCharacterRoleMarks(chatKey: string): Record<string, string> {
    if (typeof window === 'undefined' || !window.localStorage || !chatKey) {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(`${CHARACTER_ROLE_STORAGE_PREFIX}${chatKey}`);
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw) as Record<string, string>;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

/**
 * 功能：写入角色标记缓存。
 * @param chatKey 聊天键。
 * @param actorKey 角色键。
 * @param role 标记值。
 * @returns 无返回值。
 */
function writeCharacterRoleMark(chatKey: string, actorKey: string, role: string): void {
    if (typeof window === 'undefined' || !window.localStorage || !chatKey || !actorKey) {
        return;
    }
    const nextMarks = readCharacterRoleMarks(chatKey);
    nextMarks[actorKey] = role;
    window.localStorage.setItem(`${CHARACTER_ROLE_STORAGE_PREFIX}${chatKey}`, JSON.stringify(nextMarks));
}

/**
 * 功能：格式化候选类型标签。
 * @param kind 原始类型。
 * @returns 展示文本。
 */
function formatCandidateKindLabel(kind: string): string {
    switch (kind) {
        case 'state':
            return 'world_state';
        case 'fact':
            return 'fact';
        case 'summary':
            return 'summary';
        case 'relationship':
            return 'relationship';
        default:
            return kind || 'unknown';
    }
}

/**
 * 功能：渲染 MemoryOS 设置面板。
 * @returns 无返回值。
 */
export async function renderSettingsUi(): Promise<void> {
    try {
        initThemeKernel();
        const container = await waitForElement('#extensions_settings');
        const styleId = `${IDS.cardId}-styles`;
        const styleText = buildSettingsCardStylesTemplate(IDS.cardId);
        const existingStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (existingStyleEl) {
            if (existingStyleEl.innerHTML !== styleText) {
                existingStyleEl.innerHTML = styleText;
            }
        } else {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = styleText;
            document.head.appendChild(styleEl);
        }

        let cardWrapper = document.getElementById(IDS.cardId) as HTMLDivElement | null;
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            let pluginContainer = document.getElementById('ss-helper-plugins-container');
            if (!pluginContainer) {
                pluginContainer = document.createElement('div');
                pluginContainer.id = 'ss-helper-plugins-container';
                pluginContainer.className = 'ss-helper-plugins-container';
                container.prepend(pluginContainer);
            }
            pluginContainer.appendChild(cardWrapper);
        }

        cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);
        hydrateSharedSelects(cardWrapper);
        refreshSharedSelectOptions(cardWrapper);
        unmountThemeHost(cardWrapper);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) {
            mountThemeHost(contentRoot);
        }
        ensureThemeBinding();
        applyTailwindScopeToNode(cardWrapper);
        bindUiEvents();
        await renderSettingsExperience(IDS);
        applySettingsTooltips();
    } catch (error) {
        logger.error('[MemoryOS] UI 渲染失败：', error);
    }
}

export { openWorldbookInitPanel } from './worldbookInitPanel';

/**
 * 功能：绑定设置卡片的交互事件。
 * @returns 无返回值。
 */
function bindUiEvents(): void {
    const cardRoot = document.getElementById(IDS.cardId) as HTMLElement | null;
    const drawerToggle = document.getElementById(IDS.drawerToggleId) as HTMLElement | null;
    const drawerContent = document.getElementById(IDS.drawerContentId) as HTMLElement | null;
    const drawerIcon = document.getElementById(IDS.drawerIconId) as HTMLElement | null;
    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement | null;

    if (!cardRoot || !drawerToggle || !drawerContent || !drawerIcon) {
        return;
    }
    const cardRootEl = cardRoot;
    const drawerToggleEl = drawerToggle;
    const drawerContentEl = drawerContent;
    const drawerIconEl = drawerIcon;

    const basicTabs: SettingsTabEntry[] = [
        { tabId: IDS.tabRoleId, panelId: IDS.panelRoleId },
        { tabId: IDS.tabRecentId, panelId: IDS.panelRecentId },
        { tabId: IDS.tabRelationId, panelId: IDS.panelRelationId },
        { tabId: IDS.tabInjectionId, panelId: IDS.panelInjectionId },
    ];
    const advancedTabs: SettingsTabEntry[] = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabAiId, panelId: IDS.panelAiId },
        { tabId: IDS.tabDbId, panelId: IDS.panelDbId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    let activeBasicPanelId = IDS.panelRoleId;
    let activeAdvancedPanelId = IDS.panelMainId;

    /**
     * 功能：刷新四个体验页签的数据。
     * @returns 无返回值。
     */
    async function refreshExperiencePanels(): Promise<void> {
        await renderSettingsExperience(IDS);
    }

    /**
     * 功能：判断抽屉是否可见。
     * @returns 是否可见。
     */
    function isDrawerVisible(): boolean {
        return drawerContentEl.style.display !== 'none';
    }

    /**
     * 功能：打开抽屉时刷新当前聊天绑定与体验面板。
     * @returns 无返回值。
     */
    async function refreshCurrentChatContextOnOpen(): Promise<void> {
        const plugin = (window as Window & {
            MemoryOSPlugin?: {
                refreshCurrentChatBinding?: () => Promise<void>;
            };
        }).MemoryOSPlugin;
        try {
            await plugin?.refreshCurrentChatBinding?.();
        } catch (error) {
            logger.error('[MemoryOS] 刷新当前聊天绑定失败：', error);
        }
        await refreshExperiencePanels();
    }

    /**
     * 功能：切换某组页签的激活状态。
     * @param entries 页签集合。
     * @param activeTabId 当前激活的按钮 ID。
     * @param activePanelId 当前激活的面板 ID。
     * @returns 无返回值。
     */
    function applyTabState(entries: SettingsTabEntry[], activeTabId: string, activePanelId: string): void {
        entries.forEach((entry: SettingsTabEntry): void => {
            const tabButton = document.getElementById(entry.tabId);
            const panel = document.getElementById(entry.panelId) as HTMLElement | null;
            tabButton?.classList.toggle('is-active', entry.tabId === activeTabId);
            if (panel) {
                panel.hidden = entry.panelId !== activePanelId;
            }
        });
    }

    /**
     * 功能：激活基础页签。
     * @param tabId 页签按钮 ID。
     * @param panelId 面板 ID。
     * @returns 无返回值。
     */
    function activateBasicTab(tabId: string, panelId: string): void {
        activeBasicPanelId = panelId;
        applyTabState(basicTabs, tabId, panelId);
    }

    /**
     * 功能：激活高级页签。
     * @param tabId 页签按钮 ID。
     * @param panelId 面板 ID。
     * @returns 无返回值。
     */
    function activateAdvancedTab(tabId: string, panelId: string): void {
        activeAdvancedPanelId = panelId;
        applyTabState(advancedTabs, tabId, panelId);
    }

    /**
     * 功能：打开记录编辑器中的系统诊断页。
     * @returns 无返回值。
     */
    function openDiagnostics(): void {
        void openRecordEditor({ initialView: 'diagnostics' });
    }

    const executeEditorAction = createEditorActionExecutor({
        dialogIdPrefix: `${NAMESPACE}-source-details`,
        formatCandidateKindLabel,
        openRecordEditor,
        openDiagnostics,
        refreshExperiencePanels,
        toast,
    });

    drawerToggleEl.addEventListener('click', (): void => {
        const wasVisible = isDrawerVisible();
        window.setTimeout((): void => {
            const isVisibleNow = isDrawerVisible();
            if (!wasVisible && isVisibleNow) {
                void refreshCurrentChatContextOnOpen();
            }
        }, 0);
    });

    drawerIconEl.addEventListener('keydown', (event: KeyboardEvent): void => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        drawerToggleEl.click();
    });

    basicTabs.forEach((entry: SettingsTabEntry): void => {
        document.getElementById(entry.tabId)?.addEventListener('click', (): void => {
            activateBasicTab(entry.tabId, entry.panelId);
        });
    });

    advancedTabs.forEach((entry: SettingsTabEntry): void => {
        document.getElementById(entry.tabId)?.addEventListener('click', (): void => {
            activateAdvancedTab(entry.tabId, entry.panelId);
        });
    });

    document.getElementById(IDS.experienceRefreshBtnId)?.addEventListener('click', (): void => {
        void refreshExperiencePanels();
    });

    document.getElementById(IDS.experienceRecordEditorBtnId)?.addEventListener('click', (): void => {
        openRecordEditor();
    });

    document.getElementById(IDS.experienceSnapshotBtnId)?.addEventListener('click', (): void => {
        void executeEditorAction('rebuild-chat-view');
    });

    cardRootEl.addEventListener('click', (event: Event): void => {
        const target = event.target as HTMLElement | null;
        if (!target) {
            return;
        }

        const sourceTrigger = target.closest<HTMLElement>('[data-stx-source-details]');
        if (sourceTrigger) {
            const payload = sourceTrigger.dataset.stxSourceDetails || '';
            if (payload) {
                showSnapshotSourceDetails(payload, `${NAMESPACE}-source-details`);
            }
            return;
        }

        const roleTrigger = target.closest<HTMLElement>('[data-stx-character-role]');
        if (roleTrigger) {
            const chatKey = roleTrigger.dataset.stxChatKey || '';
            const actorKey = roleTrigger.dataset.stxActorKey || '';
            const role = roleTrigger.dataset.stxCharacterRole || '';
            if (!chatKey || !actorKey || !role) {
                return;
            }
            writeCharacterRoleMark(chatKey, actorKey, role);
            cardRootEl.querySelectorAll<HTMLElement>('[data-stx-character-role]').forEach((button: HTMLElement): void => {
                const sameChat = button.dataset.stxChatKey === chatKey;
                const sameActor = button.dataset.stxActorKey === actorKey;
                if (!sameChat || !sameActor) {
                    return;
                }
                    button.setAttribute('aria-pressed', button.dataset.stxCharacterRole === role ? 'true' : 'false');
            });
            return;
        }

        const actionTrigger = target.closest<HTMLElement>('[data-stx-editor-action]');
        if (actionTrigger) {
            const action = actionTrigger.dataset.stxEditorAction || '';
            if (!action) {
                return;
            }
            void executeEditorAction(action, actionTrigger);
        }
    });

    bindRuntimeControlTab({ ids: IDS });
    bindMemoryStrategyTab({ ids: IDS, refreshExperiencePanels });
    const { syncSearchState } = bindDataMaintenanceTab({ ids: IDS, cardId: IDS.cardId });
    bindAboutDiagnosticsTab({ ids: IDS });

    if (searchInput) {
        searchInput.addEventListener('input', (): void => {
            const keyword = normalizeText(searchInput.value).toLowerCase();
            cardRootEl.querySelectorAll<HTMLElement>('[data-stx-ui-search]').forEach((element: HTMLElement): void => {
                const haystack = normalizeText(element.dataset.stxUiSearch || '').toLowerCase();
                const matched = !keyword || haystack.includes(keyword);
                element.classList.toggle('is-hidden-by-search', !matched);
            });
            syncSearchState();
        });
    }

    activateBasicTab(IDS.tabRoleId, IDS.panelRoleId);
    activateAdvancedTab(IDS.tabMainId, IDS.panelMainId);
    drawerContentEl.style.display = 'none';
    drawerToggleEl.classList.remove('open');
    drawerIconEl.classList.add('down');
}
