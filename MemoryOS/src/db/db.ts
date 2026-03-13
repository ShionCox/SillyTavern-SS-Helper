/**
 * MemoryOS 数据库层 — 已并入 ss-helper-db 统一数据库
 *
 * 所有 Table 和类型现由 SDK/db 统一管理。
 * 此文件保留 re-export 以保持 Manager 层 import 路径不变。
 */
export { db, patchSdkChatShared } from '../../../SDK/db';
export type { ChatSharedPatch } from '../../../SDK/db';
export type {
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
} from '../../../SDK/db';

// 保持旧类名导出以向后兼容
export { SSHelperDatabase as MemoryOSDatabase } from '../../../SDK/db';
