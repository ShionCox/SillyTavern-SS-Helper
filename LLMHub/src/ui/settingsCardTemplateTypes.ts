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

    // ─── 5-Tab Layout ───
    tabBasicId: string;       // 基础
    tabResourceId: string;    // 资源
    tabAssignId: string;      // 分配
    tabOrchId: string;        // 编排
    tabAboutId: string;       // 关于

    panelBasicId: string;
    panelResourceId: string;
    panelAssignId: string;
    panelOrchId: string;
    panelAboutId: string;

    // ─── 基础 Panel ───
    enabledId: string;
    globalProfileId: string;

    // ─── 资源 Panel ───
    resourceListId: string;
    resourceNewBtnId: string;

    // Resource Editor
    resourceEditorId: string;
    resourceIdInputId: string;
    resourceLabelInputId: string;
    resourceTypeSelectId: string;
    resourceSourceSelectId: string;
    resourceEnabledId: string;
    resourceBaseUrlId: string;
    resourceApiKeyId: string;
    resourceApiKeySaveBtnId: string;
    resourceDefaultModelId: string;
    resourceRerankPathId: string;
    resourceCustomParamsId: string;
    resourceCustomParamsListId: string;
    resourceCustomParamsAddBtnId: string;
    resourceCustomParamsSyncBtnId: string;
    rerankTestPanelId: string;
    rerankTestQueryId: string;
    rerankTestDocsId: string;
    rerankTestTopKId: string;

    // Connection Test
    testConnectionBtnId: string;
    testRerankBtnId: string;
    testResultId: string;
    fetchModelsBtnId: string;
    modelListSelectId: string;
    modelListStatusId: string;

    // Capabilities (checkboxes)
    resourceCapChatId: string;
    resourceCapJsonId: string;
    resourceCapToolsId: string;
    resourceCapEmbId: string;
    resourceCapRerankId: string;
    resourceCapVisionId: string;
    resourceCapReasoningId: string;

    resourceSaveBtnId: string;
    resourceDeleteBtnId: string;

    // Tavern Info
    tavernInfoId: string;
    tavernInfoStatusId: string;
    tavernInfoListId: string;

    // ─── 分配 Panel: 3-view sub-tabs ───
    subTabGlobalAssignId: string;
    subTabPluginAssignId: string;
    subTabTaskAssignId: string;
    subPanelGlobalAssignId: string;
    subPanelPluginAssignId: string;
    subPanelTaskAssignId: string;

    // Global Assignments
    globalAssignGenResourceId: string;
    globalAssignGenModelId: string;
    globalAssignEmbResourceId: string;
    globalAssignEmbModelId: string;
    globalAssignRerankResourceId: string;
    globalAssignRerankModelId: string;
    globalAssignSaveBtnId: string;

    // Plugin Assignments
    pluginAssignListId: string;
    pluginAssignRefreshBtnId: string;

    // Task Assignments
    taskAssignListId: string;
    taskAssignRefreshBtnId: string;

    // ─── 编排 Panel ───
    // Budget
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
    requestLogOpenBtnId: string;
    requestLogModalId: string;
    requestLogModalCloseId: string;
    requestLogChatKeyId: string;
    requestLogCountId: string;
    requestLogSearchId: string;
    requestLogStateFilterId: string;
    requestLogRefreshBtnId: string;
    requestLogClearBtnId: string;
    requestLogListId: string;
    requestLogDetailId: string;
}
