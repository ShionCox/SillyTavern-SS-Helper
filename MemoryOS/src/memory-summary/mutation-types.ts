/**
 * 功能：定义总结 action 类型。
 */
export type SummaryMutationActionType = 'ADD' | 'MERGE' | 'UPDATE' | 'INVALIDATE' | 'DELETE' | 'NOOP';

/**
 * 功能：定义总结 action。
 */
export interface SummaryMutationAction {
    action: SummaryMutationActionType;
    targetKind: string;
    candidateId?: string;
    compareKey?: string;
    payload?: Record<string, unknown>;
    reasonCodes?: string[];
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
    actions: SummaryMutationAction[];
}

