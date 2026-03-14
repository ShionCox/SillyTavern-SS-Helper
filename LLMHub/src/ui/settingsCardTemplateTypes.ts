export interface LLMHubSettingsIds {
    cardId: string;
    drawerToggleId: string;
    drawerContentId: string;
    drawerIconId: string;
    displayName: string;
    badgeId: string;
    badgeText: string;
    changelogHtml: string;
    authorText: string;
    emailText: string;
    githubText: string;
    githubUrl: string;
    searchId: string;

    // Tabs
    tabMainId: string;
    tabRouteId: string;
    tabQueueId: string;
    tabVaultId: string;
    tabAboutId: string;

    // Panels
    panelMainId: string;
    panelRouteId: string;
    panelQueueId: string;
    panelVaultId: string;
    panelAboutId: string;

    // Settings Controls
    enabledId: string;
    globalProfileId: string;

    // Provider Source & Connection
    providerSourceId: string;
    customBaseUrlId: string;
    customModelInputId: string;
    testConnectionBtnId: string;
    testResultId: string;
    tavernInfoId: string;
    tavernInfoStatusId: string;
    tavernInfoListId: string;
    fetchModelsBtnId: string;
    modelListSelectId: string;
    modelListStatusId: string;

    // ─── Route Panel: 3-view sub-tabs ───
    subTabGlobalDefaultsId: string;
    subTabPluginDefaultsId: string;
    subTabTaskOverridesId: string;
    subPanelGlobalDefaultsId: string;
    subPanelPluginDefaultsId: string;
    subPanelTaskOverridesId: string;

    // View A: Global Capability Defaults
    globalDefGenProviderId: string;
    globalDefGenModelId: string;
    globalDefGenProfileId: string;
    globalDefEmbProviderId: string;
    globalDefEmbModelId: string;
    globalDefRerankProviderId: string;
    globalDefRerankModelId: string;
    globalDefSaveBtnId: string;

    // View B: Plugin Defaults
    pluginDefaultsListId: string;
    pluginDefaultsRefreshBtnId: string;

    // View C: Task Overrides
    taskOverridesListId: string;
    taskOverridesRefreshBtnId: string;

    // Budget (legacy compat)
    budgetConsumerId: string;
    budgetMaxRpmId: string;
    budgetMaxTokensId: string;
    budgetMaxLatencyId: string;
    budgetMaxCostId: string;
    budgetSaveBtnId: string;
    budgetResetBtnId: string;
    budgetListId: string;

    // Queue & Display
    queueSnapshotListId: string;
    queueRefreshBtnId: string;
    silentPermissionsListId: string;
    recentHistoryListId: string;

    // Vault
    vaultAddServiceId: string;
    vaultApiKeyId: string;
    vaultSaveBtnId: string;
    vaultClearBtnId: string;
}
