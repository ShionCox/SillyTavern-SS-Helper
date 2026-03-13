// ─── SS-Helper 统一数据库 barrel export ───

// 数据库实例 & 类型
export { db, SSHelperDatabase } from './database';
export type {
    DBChatDocument,
    DBChatDocumentShared,
    DBChatPluginState,
    DBChatPluginRecord,
    DBEvent,
    DBFact,
    DBWorldState,
    DBSummary,
    DBTemplate,
    DBAudit,
    DBMeta,
    DBWorldInfoCache,
    DBTemplateBinding,
    DBVectorChunk,
    DBVectorEmbedding,
    DBVectorMeta,
    DBLlmCredential,
} from './database';

// 聊天数据 API
export {
    getSdkChatDocument,
    ensureSdkChatDocument,
    patchSdkChatShared,
    readSdkPluginChatState,
    writeSdkPluginChatState,
    deleteSdkPluginChatState,
    listSdkPluginChatStateSummaries,
    appendSdkPluginChatRecord,
    querySdkPluginChatRecords,
    deleteSdkPluginChatRecords,
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

// 跨插件访问控制
export {
    readPluginChatSummary,
    readChatShared,
    readPluginSignal,
    listAllPluginSignals,
    validateWriteAccess,
} from './access-control';
