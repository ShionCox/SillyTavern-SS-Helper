/**
 * MemoryOS 统一入口
 * 导出所有公共模块，供外部引用。
 */

// 数据库层
export { MemoryOSDatabase, db } from './db/db';
export type {
    DBEvent, DBFact, DBWorldState, DBSummary, DBTemplate, DBAudit, DBMeta,
    DBWorldInfoCache, DBTemplateBinding,
    DBVectorChunkMetadata,
} from './db/db';

// 事件总线
export { EventBus } from '../../SDK/bus/bus';

// 核心管理器
export { EventsManager } from './core/events-manager';
export { FactsManager } from './core/facts-manager';
export { StateManager } from './core/state-manager';
export { SummariesManager } from './core/summaries-manager';
export { AuditManager } from './core/audit-manager';
export { MetaManager } from './core/meta-manager';
export { CompactionManager } from './core/compaction-manager';

// v2 核心管理器
export { ChatStateManager } from './core/chat-state-manager';
export { TurnTracker } from './core/turn-tracker';
export { SchemaGate } from './core/schema-gate';
export { RowResolver } from './core/row-resolver';
export { RowOperationsManager } from './core/row-operations';
export { PromptTrimmer } from './core/prompt-trimmer';
export { ChatViewManager } from './core/chat-view-manager';
export { ChatLifecycleManager } from './core/chat-lifecycle-manager';

// 注入管理器
export { InjectionManager } from './injection/injection-manager';

// SDK 门面层
export { MemorySDKImpl } from './sdk/memory-sdk';

// 工具函数
export { buildScopePrefix, buildScopedKey, validateScopeAccess } from './utils/scope-manager';
export type { ScopeLevel, ScopeContext } from './utils/scope-manager';

// 世界模板系统
export { TemplateManager } from './template/template-manager';
export { TemplateBuilder } from './template/template-builder';
export { WorldInfoReader } from './template/worldinfo-reader';
export { WorldInfoWriter } from './template/worldinfo-writer';
export type {
    WorldTemplate, TemplateFactType, TemplateTableDef,
    ExtractPolicies, InjectionLayout,
    WorldInfoEntry, WorldContextBundle,
} from './template/types';

// v2 类型系统
export type {
    AdaptiveMetrics, AdaptivePolicy, ChatProfile, ChatProfileOverride,
    MemoryOSChatState, RetentionPolicy, StrategyDecision,
    AutoSchemaPolicy, SchemaDraftSession, AssistantTurnTracker,
    TurnLifecycle, TurnKind, TurnRecord, LogicalChatView, LogicalMessageNode, ChatMutationKind, ChatArchiveState,
    ColdStartBootstrapState, ColdStartBootstrapStatus, ColdStartStage, MutationRepairTask, MemoryMutationAction, MemoryMutationActionCounts, MemoryMutationPlanItem, MemoryMutationPlanSnapshot, MemoryMutationTargetKind,
    RowAliasIndex, RowRedirects, RowTombstones,
} from './types/chat-state';
export type {
    TableDef, TableFieldDef, FieldTier,
    TemplateRevisionMeta, SchemaChangeProposal,
    EntityResolutionProposal, DeferredSchemaHint,
    ChangeBudget, PromptTrimBudget,
} from './types/schema-revision';
export type {
    RowRefResolution, RowMergeRequest, RowMergeResult,
    RowDeleteMode, RowSeedData, LogicTableRow, LogicTableQueryOpts,
} from './types/row-operations';

// Mutation 写入与闸门验证
export { GateValidator } from './proposal/gate-validator';
export { MutationManager } from './proposal/proposal-manager';
export type {
    MemoryMutationDocument, MutationResult, MutationRequest,
    FactProposal, PatchProposal, SummaryProposal, GateResult,
} from './proposal/types';

// AI 状态中心
export type {
    MemoryAiHealthSnapshot, MemoryAiTaskId, MemoryAiTaskRecord,
    MemoryAiTaskStatus, CapabilityStatus, LlmHubDiagnosisLevel,
} from './llm/ai-health-types';
export {
    getHealthSnapshot, isAiOperational, isCapabilityAvailable,
    getTaskStatus, onHealthChange,
} from './llm/ai-health-center';
export { runAiSelfTests } from './llm/ai-self-test';
export type { AiSelfTestResult } from './llm/ai-self-test';

export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

import { startMemoryOSRuntime } from './runtime-entry';

startMemoryOSRuntime();

