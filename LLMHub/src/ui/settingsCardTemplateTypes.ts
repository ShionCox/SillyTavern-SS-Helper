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
    tabRouterId: string;
    tabConsumerMapId: string;
    tabVaultId: string;
    tabAboutId: string;

    // Panels
    panelMainId: string;
    panelRouterId: string;
    panelConsumerMapId: string;
    panelVaultId: string;
    panelAboutId: string;

    // Settings Controls
    enabledId: string;
    globalProfileId: string;

    // Router
    defaultProviderId: string;
    defaultModelId: string;
    routerAdvancedToggleId: string;
    routerAdvancedBodyId: string;
    routeConsumerId: string;
    routeTaskId: string;
    routeProviderId: string;
    routeProfileId: string;
    routeFallbackProviderId: string;
    routeSaveBtnId: string;
    routeResetBtnId: string;
    routeListId: string;

    // Consumer Mapping
    consumerMapRefreshBtnId: string;

    // Budget
    budgetConsumerId: string;
    budgetMaxRpmId: string;
    budgetMaxTokensId: string;
    budgetMaxLatencyId: string;
    budgetMaxCostId: string;
    budgetSaveBtnId: string;
    budgetResetBtnId: string;
    budgetListId: string;

    // Vault
    vaultAddServiceId: string;
    vaultApiKeyId: string;
    vaultSaveBtnId: string;
    vaultClearBtnId: string;
}
