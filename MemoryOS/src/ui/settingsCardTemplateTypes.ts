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
    aiModeStatusLightId: string; // [P0-4] 连接灯状态指标
    autoCompactionId: string;
    compactionThresholdId: string;
    contextMaxTokensId: string;

    // 网络自检及工具 (P2-3)
    testPingBtnId: string;
    testHelloBtnId: string;

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
    // 记录编辑器
    recordEditorBtnId: string;
}
