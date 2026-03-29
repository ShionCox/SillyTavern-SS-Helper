/**
 * 功能：残缺片段修复与事实/信号分流链路的统一类型定义。
 *
 * 核心原则：
 * - Fact = 语义完整、主体明确、可直接送 Planner 和摘要。
 * - Signal = 有信息价值但不够完整，仅作弱提示，不进长期记忆。
 * - Filtered = 不可恢复，直接丢弃。
 */

// ─── 窗口候选片段 ─────────────────────────────────

/** 候选片段来源类型。 */
export type CandidateType = 'dialogue' | 'narration' | 'action' | 'rule' | 'state' | 'event';

/**
 * 功能：从最近窗口消息中提取的候选片段。
 */
export interface WindowCandidate {
    candidateId: string;
    turnIndex: number;
    speaker?: string;
    rawText: string;
    normalizedText: string;
    candidateType: CandidateType;
}

// ─── 残缺检测 ──────────────────────────────────────

/** 残缺片段子类型。 */
export type FragmentType = 'tail_cut' | 'dialogue_cut' | 'subject_broken' | 'mid_slice';

/**
 * 功能：残缺检测结果。
 */
export interface FragmentAnalysis {
    isFragment: boolean;
    fragmentScore: number;
    reasons: string[];
    fragmentType?: FragmentType;
}

// ─── 邻近修复上下文 ────────────────────────────────

/**
 * 功能：用于修复残缺片段的邻近上下文。
 */
export interface RepairContext {
    /** 同一 turn 内的其他片段。 */
    sameTurnSegments: string[];
    /** 前一 turn 的局部句段。 */
    prevSegments: string[];
    /** 后一 turn 的局部句段。 */
    nextSegments: string[];
}

/** 修复模式。 */
export type RepairMode = 'none' | 'neighbor_merge' | 'same_turn_merge' | 'fact_rewrite' | 'signal_downgrade' | 'filtered';

/**
 * 功能：修复后的候选对象。
 */
export interface RepairedCandidate {
    candidateId: string;
    originalText: string;
    repairedText: string;
    repairMode: RepairMode;
    confidence: number;
    fragmentType?: FragmentType;
    sourceRefs: Array<{
        turnIndex: number;
        excerpt: string;
    }>;
}

// ─── 事实与信号 ─────────────────────────────────────

/** 事实分类。 */
export type FactCategory = 'rule' | 'event' | 'state' | 'relationship' | 'task' | 'time';

/**
 * 功能：经修复和改写后可直接给 Planner 的强事实。
 */
export interface PlannerFact {
    factId: string;
    text: string;
    category: FactCategory;
    confidence: number;
    repairMode: RepairMode;
    originalText?: string;
    sourceRefs: Array<{
        turnIndex: number;
        excerpt: string;
    }>;
}

/** 信号分类。 */
export type SignalCategory = 'ongoing_contact' | 'unfinished_task' | 'risk' | 'uncertain_relation' | 'uncertain_event';

/**
 * 功能：不够成为强事实但有弱提示价值的信号。
 */
export interface PlannerSignal {
    signalId: string;
    text: string;
    category: SignalCategory;
    confidence: number;
    derivedFrom: string[];
}

// ─── Planner 输入扩展 ──────────────────────────────

/**
 * 功能：片段修复链路的统计元数据。
 */
export interface FragmentRepairMetadata {
    /** 来源 turn 范围。 */
    sourceTurnRange: [number, number];
    /** 被丢弃的片段数。 */
    droppedFragments: number;
    /** 成功修复的片段数。 */
    repairedFragments: number;
    /** 降级为 signal 的片段数。 */
    downgradedSignals: number;
}

// ─── 调试行 ─────────────────────────────────────────

/**
 * 功能：调试面板每条候选的处理结果行。
 */
export interface FragmentRepairDebugRow {
    originalText: string;
    fragmentScore: number;
    fragmentType?: string;
    repairMode: string;
    repairedText?: string;
    finalKind: 'fact' | 'signal' | 'filtered';
    confidence: number;
    enteredPlanner: boolean;
    enteredSummaryCandidate: boolean;
}
