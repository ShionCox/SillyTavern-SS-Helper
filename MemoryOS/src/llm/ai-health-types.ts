/**
 * MemoryOS AI 状态中心 —— 类型定义
 *
 * 只读快照类型，供 UI 和运行时共同读取。
 */

import type { LLMCapability } from '../../../SDK/stx';

// ── 任务标识 ──

export type MemoryAiTaskId =
    | 'memory.summarize'
    | 'memory.extract'
    | 'world.template.build'
    | 'memory.vector.embed'
    | 'memory.search.rerank';

// ── 单条任务执行记录 ──

export interface MemoryAiTaskRecord {
    taskId: MemoryAiTaskId;
    /** 执行时间戳 */
    ts: number;
    /** 是否成功 */
    ok: boolean;
    /** 耗时（ms） */
    durationMs: number;
    /** 失败时的错误信息 */
    error?: string;
    /** 失败时的错误码 */
    reasonCode?: string;
    /** 简短说明 */
    note?: string;
}

// ── 每类任务的最新状态 ──

export type MemoryAiTaskStatusState = 'idle' | 'running' | 'success' | 'failed';

export interface MemoryAiTaskStatus {
    taskId: MemoryAiTaskId;
    state: MemoryAiTaskStatusState;
    /** 最近一次执行记录 */
    lastRecord: MemoryAiTaskRecord | null;
}

// ── 能力可用性 ──

export type CapabilityState = 'available' | 'missing' | 'degraded';

export interface CapabilityStatus {
    capability: LLMCapability;
    state: CapabilityState;
}

// ── LLMHub 连接诊断级别 ──

export type LlmHubDiagnosisLevel =
    | 'not_detected'
    | 'mounted_not_registered'
    | 'online_partial_capabilities'
    | 'fully_operational';

// ── 总体健康快照 ──

export interface MemoryAiHealthSnapshot {
    /** 快照生成时间 */
    ts: number;

    /** LLMHub 是否已挂载（STX.llm 存在且为 object） */
    llmHubMounted: boolean;

    /** MemoryOS consumer 是否已注册成功 */
    consumerRegistered: boolean;

    /** 当前可用能力列表 */
    capabilities: CapabilityStatus[];

    /** AI 模式生效状态 */
    aiModeEnabled: boolean;

    /** 综合诊断级别 */
    diagnosisLevel: LlmHubDiagnosisLevel;

    /** 诊断文案 */
    diagnosisText: string;

    /** 各任务最新状态 */
    tasks: Record<MemoryAiTaskId, MemoryAiTaskStatus>;

    /** 最近任务记录（最多 10 条，仅诊断用） */
    recentRecords: MemoryAiTaskRecord[];
}
