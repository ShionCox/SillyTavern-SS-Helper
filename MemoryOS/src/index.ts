/**
 * 功能：MemoryOS 统一入口，仅暴露统一条目主链能力。
 */

export { MemoryOSDatabase, db } from './db/db';
export type {
    DBEvent,
    DBTemplate,
    DBAudit,
    DBMeta,
    DBMemoryMutationHistory,
    DBMemoryEntryType,
    DBMemoryEntry,
    DBActorMemoryProfile,
    DBRoleEntryMemory,
    DBSummarySnapshot,
} from './db/db';

export { EventBus } from '../../SDK/bus/bus';
export { EventsManager } from './core/events-manager';
export { CompareKeyService } from './core/compare-key-service';
export { EntryRepository } from './repository/entry-repository';
export { GraphService } from './services/graph-service';
export { PromptAssemblyService } from './services/prompt-assembly-service';
export { SummaryService } from './services/summary-service';
export { TakeoverService } from './services/takeover-service';
export { MemorySDKImpl } from './sdk/memory-sdk';

export type {
    MemoryEntryCategory,
    MemoryFieldKind,
    MemoryEntryTypeField,
    MemoryEntryType,
    MemoryEntry,
    ActorMemoryProfile,
    RoleEntryMemory,
    SummaryEntryUpsert,
    SummaryRefreshBinding,
    SummarySnapshot,
    PromptAssemblyDiagnostics,
    PromptAssemblyRoleEntry,
    PromptAssemblySnapshot,
    UnifiedMemoryFilters,
} from './types';

export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

import { startMemoryOSRuntime } from './runtime-entry';

startMemoryOSRuntime();
