import type { MemoryCardDraft } from '../../../SDK/stx';
import type { MemoryMutationPlanSnapshot, MemoryTraceContext } from '../types';

/**
 * AI 提议制类型定义
 * 所有 AI 任务的返回必须以提议（Proposal）形式包裹,
 * 通过四道闸门校验后才能落盘
 */

/** 事实提议 */
export interface FactProposal {
    factKey?: string;
    targetRecordKey?: string;
    action?: 'auto' | 'update' | 'merge' | 'delete' | 'invalidate';
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
    provenance?: any;
}

/** 状态补丁提议 (JSON Patch 格式) */
export interface PatchProposal {
    op: 'add' | 'replace' | 'remove';
    path: string;
    value?: any;
}

/** 摘要提议 */
export interface SummaryProposal {
    level: 'message' | 'scene' | 'arc';
    summaryId?: string;
    targetRecordKey?: string;
    action?: 'auto' | 'update' | 'merge' | 'delete' | 'invalidate';
    title?: string;
    content: string;
    keywords?: string[];
    memoryCards?: MemoryCardDraft[];
    messageId?: string;
    range?: { fromMessageId?: string; toMessageId?: string };
    source?: {
        extractor?: string;
        provider?: string;
        provenance?: Record<string, unknown>;
    };
}

/** Schema 变更提议 */
export interface SchemaChangeProposal {
    kind: 'add_table' | 'add_field' | 'modify_primary_key' | 'modify_description' | 'alias_suggestion';
    tableKey: string;
    fieldKey?: string;
    payload: Record<string, unknown>;
    requiredByFacts?: boolean;
}

/** 实体解析提议 */
export interface EntityResolutionProposal {
    tableKey: string;
    fromRowId: string;
    toRowId: string;
    confidence: number;
    reason: string;
}

/** 延后 Schema 建议 */
export interface DeferredSchemaHint {
    change: SchemaChangeProposal;
    deferredAt: number;
    reason: string;
}

/** 统一提议信封（所有 AI 任务的标准返回） */
export interface ProposalEnvelope {
    ok: boolean;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        memoryCards?: MemoryCardDraft[];
        notes?: string;
        schemaChanges?: SchemaChangeProposal[];
        entityResolutions?: EntityResolutionProposal[];
    };
    confidence: number;
}

/** 闸门校验结果 */
export interface GateResult {
    passed: boolean;
    gate: string;
    errors: string[];
}

/** 提议处理结果 */
export interface ProposalResult {
    accepted: boolean;
    applied: {
        factKeys: string[];
        statePaths: string[];
        summaryIds: string[];
        schemaChangesApplied?: number;
        schemaChangesDeferred?: number;
        entityResolutions?: number;
    };
    rejectedReasons: string[];
    gateResults: GateResult[];
    deferredSchemaHints?: DeferredSchemaHint[];
    mutationPlan?: MemoryMutationPlanSnapshot | null;
}

/** 外部插件写入请求 */
export interface WriteRequest {
    source: { pluginId: string; version: string };
    chatKey: string;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        schemaChanges?: SchemaChangeProposal[];
        entityResolutions?: EntityResolutionProposal[];
    };
    reason: string;
    trace?: MemoryTraceContext;
    deferredSchemaHints?: DeferredSchemaHint[];
}
