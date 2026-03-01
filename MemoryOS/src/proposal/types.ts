/**
 * AI 提议制类型定义
 * 所有 AI 任务的返回必须以提议（Proposal）形式包裹,
 * 通过四道闸门校验后才能落盘
 */

/** 事实提议 */
export interface FactProposal {
    factKey?: string;
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
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
    title?: string;
    content: string;
    keywords?: string[];
}

/** 统一提议信封（所有 AI 任务的标准返回） */
export interface ProposalEnvelope {
    ok: boolean;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        notes?: string;
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
    };
    rejectedReasons: string[];
    gateResults: GateResult[];
}

/** 外部插件写入请求 */
export interface WriteRequest {
    source: { pluginId: string; version: string };
    chatKey: string;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
    };
    reason: string;
}
