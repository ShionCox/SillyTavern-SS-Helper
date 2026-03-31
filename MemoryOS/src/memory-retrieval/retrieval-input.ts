import type { RecallConfig } from './recall-config';
import type { PayloadFilter } from './payload-filter';
import type { RetrievalCandidate, RetrievalRulePackMode } from './types';
import type { ActorProfileForDictionary, RecentContextBias } from './context-router';

/**
 * 功能：统一检索输入。
 * 说明：Prompt、Takeover、Workbench 等场景都通过这个结构进入统一召回主链。
 */
export interface MemoryRetrievalInput {
    /** 查询文本 */
    query: string;
    /** 聊天键 */
    chatKey?: string;
    /** 候选记录 */
    candidates: RetrievalCandidate[];
    /** 召回配置（覆盖全局默认） */
    recallConfig?: Partial<RecallConfig>;
    /** 规则包模式 */
    rulePackMode?: RetrievalRulePackMode;
    /** 角色侧写（用于构建语境字典） */
    actorProfiles?: ActorProfileForDictionary[];
    /** 最近上下文偏置 */
    recentContext?: RecentContextBias;
    /** 最大字符预算 */
    maxChars?: number;
}

/**
 * 功能：Prompt 场景的快捷检索输入。
 */
export interface PromptRecallInput {
    /** 查询文本 */
    query: string;
    /** 聊天键 */
    chatKey?: string;
    /** 候选记录 */
    candidates: RetrievalCandidate[];
    /** 最大字符预算 */
    maxChars?: number;
    /** 最大候选数量 */
    maxCandidates?: number;
    /** 规则包模式 */
    rulePackMode?: RetrievalRulePackMode;
    /** 角色侧写 */
    actorProfiles?: ActorProfileForDictionary[];
    /** 最近上下文偏置 */
    recentContext?: RecentContextBias;
    /** 候选预过滤 */
    payloadFilter?: PayloadFilter;
}

/**
 * 功能：Takeover 场景的快捷检索输入。
 */
export interface TakeoverRecallInput {
    /** 查询文本 */
    query: string;
    /** 聊天键 */
    chatKey?: string;
    /** 候选记录 */
    candidates: RetrievalCandidate[];
    /** 最大候选数量 */
    maxCandidates?: number;
    /** 候选预过滤 */
    payloadFilter?: PayloadFilter;
}

/**
 * 功能：Workbench 场景的快捷检索输入。
 */
export interface WorkbenchRecallInput {
    /** 查询文本 */
    query: string;
    /** 聊天键 */
    chatKey?: string;
    /** 候选记录 */
    candidates: RetrievalCandidate[];
    /** 最大候选数量 */
    maxCandidates?: number;
    /** 候选预过滤 */
    payloadFilter?: PayloadFilter;
}
