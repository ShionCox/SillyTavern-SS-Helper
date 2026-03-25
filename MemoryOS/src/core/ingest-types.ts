import type { EventEnvelope } from '../../../SDK/stx';
import type { MemoryMutationDocument, MutationResult } from '../proposal/types';
import type {
    AutoSummaryDecisionSnapshot,
    ChatLifecycleState,
    ChatProfile,
    LogicalChatView,
    LorebookGateDecision,
    MemoryIngestProgressState,
    MemoryProcessingDecision,
    PostGenerationGateDecision,
    PrecompressedWindowStats,
} from '../types';

/**
 * 功能：统一定义 ingest 任务标识，供执行层调用模型时复用。
 */
export type IngestTask = 'memory.ingest';

/**
 * 功能：定义执行所需的 schema 上下文载荷类型。
 */
export type SchemaContextPayload = Record<string, unknown> | string;

/**
 * 功能：定义单轮增量窗口选择结果。
 */
export interface IngestWindowSelection {
    windowHash: string;
    windowMessages: LogicalChatView['visibleMessages'];
    fromMessageId?: string;
    toMessageId?: string;
    lastAssistantTurnId?: string;
    lastAssistantMessageId?: string;
    lastAssistantTurnCount: number;
    pendingAssistantTurns: number;
    repairTriggered: boolean;
}

/**
 * 功能：定义统一 ingest 计划对象，承载规划层输出给执行层与提交层的全部上下文。
 */
export interface IngestPlan {
    selection: IngestWindowSelection;
    currentAssistantTurnCount: number;
    repairGeneration: number;
    triggerBySpecialEvent: boolean;
    summaryEnabled: boolean;
    summaryInterval: number;
    chatProfile: ChatProfile | null;
    previousLorebookDecision: LorebookGateDecision | null;
    lorebookDecision: LorebookGateDecision;
    postGate: PostGenerationGateDecision;
    lifecycleState: ChatLifecycleState | null;
    autoSummaryDecisionSnapshot: AutoSummaryDecisionSnapshot | null;
    processingDecision: MemoryProcessingDecision;
    windowText: string;
    compressedWindowText: string;
    precompressedStats: PrecompressedWindowStats;
    taskDescription: string;
    promptBudget: {
        maxTokens: number;
        maxLatencyMs: number;
        maxCost: number;
    };
    metaRefreshSignals: {
        lastQualityRefreshAssistantTurnCount: number;
    };
}

/**
 * 功能：定义规划层返回结果，包含可执行计划和用于日志回显的关键指标。
 */
export interface IngestPlanBuildResult {
    plan: IngestPlan | null;
    currentAssistantTurnCount: number;
}

/**
 * 功能：定义 ingest 规划与提交阶段需要读取的 meta 快照字段。
 */
export interface IngestMetaSnapshot {
    lastProfileRefreshAssistantTurnCount?: number;
    lastQualityRefreshAssistantTurnCount?: number;
}

/**
 * 功能：定义执行层返回结果，统一封装 mutation 执行结果与统计信息。
 */
export interface IngestExecutionResult {
    mutationResult: MutationResult | null;
    mutationDocument: MemoryMutationDocument | null;
    accepted: boolean;
    factsApplied: number;
    patchesApplied: number;
    summariesApplied: number;
    reasonCodes: string[];
}

/**
 * 功能：定义提交层返回摘要，供 facade 决定是否结算窗口并记录输出。
 */
export interface IngestCommitResult {
    shouldSettleWindow: boolean;
    finalOutcome: MemoryIngestProgressState['lastProcessedOutcome'];
    recordedReasonCodes: string[];
}

/**
 * 功能：定义 facade 传给提交层 finalize 的上下文。
 */
export interface IngestFacadeContext {
    plan: IngestPlan;
    recentEvents: Array<EventEnvelope<unknown>>;
    logicalView: LogicalChatView;
}
