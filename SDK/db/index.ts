// ─── SS-Helper 统一数据库 barrel export ───

// 数据库实例 & 类型
export { db, SSHelperDatabase, rebuildSSHelperDatabase } from './database';
export type {
    DBChatDocument,
    DBChatDocumentShared,
    DBChatPluginState,
    DBChatPluginRecord,
    DBEvent,
    DBTemplate,
    DBTemplateBinding,
    DBAudit,
    DBMemoryMutationHistory,
    DBMemoryEntryFieldDiff,
    DBMemoryEntryAuditRecord,
    DBMeta,
    DBVectorChunkMetadata,
    DBMemoryEntryTypeField,
    DBMemoryEntryType,
    DBMemoryEntry,
    DBActorMemoryProfile,
    DBRoleEntryMemory,
    DBMemoryRelationship,
    DBSummarySnapshot,
    DBWorldProfileBinding,
    DBLlmCredential,
    DBLlmRequestLog,
} from './database';

// 聊天数据 API
export {
    getSdkChatDocument,
    ensureSdkChatDocument,
    deleteSdkChatDocument,
    patchSdkChatShared,
    readSdkPluginChatState,
    writeSdkPluginChatState,
    deleteSdkPluginChatState,
    listSdkPluginChatStateSummaries,
    appendSdkPluginChatRecord,
    querySdkPluginChatRecords,
    queryAllSdkPluginChatRecords,
    deleteSdkPluginChatRecords,
    trimSdkPluginChatRecords,
    invalidateSdkChatDataCache,
    flushSdkChatDataNow,
} from './chat-data';
export type {
    ChatSharedPatch,
    WriteSdkPluginChatStateOptions,
    ListSdkPluginChatStateSummariesOptions,
    SdkPluginChatStateSummaryRow,
    AppendSdkPluginChatRecordPayload,
    QuerySdkPluginChatRecordsOptions,
} from './chat-data';

export {
    appendLlmRequestLog,
    queryLlmRequestLogs,
    clearLlmRequestLogs,
    trimLlmRequestLogs,
} from './llm-request-logs';
export type {
    AppendLlmRequestLogInput,
    QueryLlmRequestLogsOptions,
} from './llm-request-logs';

// 跨插件访问控制
export {
    readPluginChatSummary,
    readChatShared,
    readPluginSignal,
    listAllPluginSignals,
    validateWriteAccess,
} from './access-control';
