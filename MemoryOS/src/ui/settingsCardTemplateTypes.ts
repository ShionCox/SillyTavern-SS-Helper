export interface MemoryOSSettingsIds {
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
    tabMainId: string;
    tabAiId: string;
    tabDbId: string;
    tabAboutId: string;
    tabTemplateId: string;
    tabAuditId: string;
    panelMainId: string;
    panelAiId: string;
    panelDbId: string;
    panelAboutId: string;
    panelTemplateId: string;
    panelAuditId: string;
    // 模板面板
    templateListId: string;
    templateRefreshBtnId: string;
    templateForceRebuildBtnId: string;

    // Settings Controls
    enabledId: string;
    aiModeEnabledId: string;
    autoCompactionId: string;
    compactionThresholdId: string;
    contextMaxTokensId: string;

    // DB Actions
    dbCompactBtnId: string;
    dbExportBtnId: string;
    dbClearBtnId: string;
    // 审计面板
    auditListId: string;
    auditCreateSnapshotBtnId: string;
    auditRefreshBtnId: string;
    // 世界书写回
    wiPreviewId: string;
    wiPreviewBtnId: string;
    wiWritebackBtnId: string;
    wiWriteSummaryBtnId: string;
    // 逻辑表可编辑
    logicTableEntitySelectId: string;
    logicTableRefreshBtnId: string;
    logicTableContainerId: string;
}
