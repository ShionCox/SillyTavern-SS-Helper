/**
 * 功能：定义总结 action 类型。
 */
export type SummaryMutationActionType = 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE' | 'NOOP';

import type { BatchTimeAssessment, MemoryTimeContext } from '../memory-time/time-types';

/**
 * 功能：定义总结 Planner 输出。
 */
export interface SummaryPlannerOutput {
    should_update: boolean;
    focus_types: string[];
    entities: string[];
    topics: string[];
    reasons: string[];
}

/**
 * 功能：定义候选已有记忆短卡片。
 */
export interface SummaryMemoryCard {
    id: string;
    type: string;
    title: string;
    summary: string;
    entityKeys: string[];
    status: 'active' | 'invalidated' | 'merged' | 'archived';
    updatedAt: number;
    sourceHint?: string;
}

/**
 * 功能：定义总结 action。
 */
export interface SummaryMutationAction {
    action: SummaryMutationActionType;
    targetKind: string;
    type?: string;
    title?: string;
    reason?: string;
    confidence?: number;
    targetId?: string;
    sourceIds?: string[];
    candidateId?: string;
    compareKey?: string;
    patch?: Record<string, unknown>;
    newRecord?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    reasonCodes?: string[];
    /** 时间上下文（由时间引擎生成或 AI 输出） */
    timeContext?: MemoryTimeContext;
}

/**
 * 功能：定义总结 mutation 文档。
 */
export interface SummaryMutationDocument {
    schemaVersion: string;
    window: {
        fromTurn: number;
        toTurn: number;
    };
    /** 批次时间评估（由时间引擎生成） */
    batchTimeAssessment?: BatchTimeAssessment;
    actions: SummaryMutationAction[];
}

