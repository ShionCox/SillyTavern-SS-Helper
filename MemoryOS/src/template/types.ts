/**
 * 世界模板类型定义
 * 定义模板中的实体、事实类型、抽取策略和注入布局
 */

/** 实体定义（逻辑表的列结构） */
export interface TemplateEntity {
    primaryKey: string;
    fields: string[];
    indexes?: string[];
}

/** 事实类型定义（决定 facts 的 path 模式与注入分区） */
export interface TemplateFactType {
    type: string;
    pathPattern: string;
    slots: string[];
    defaultInjection?: string;
}

/** 抽取策略 */
export interface ExtractPolicies {
    'memory.extract'?: {
        minConfidence?: number;
        allowWriteFacts?: boolean;
    };
    'world.update'?: {
        allowPatches?: boolean;
        requireDiff?: boolean;
    };
    [task: string]: Record<string, any> | undefined;
}

/** 注入布局（控制各区段的 token/条数限额） */
export interface InjectionLayout {
    WORLD_STATE?: { maxTokens?: number };
    FACTS?: { maxTokens?: number };
    EVENTS?: { maxItems?: number };
    SUMMARY?: { maxTokens?: number };
}

/** 完整的世界模板 */
export interface WorldTemplate {
    templateId: string;
    chatKey: string;
    worldType: 'fantasy' | 'urban' | 'custom';
    name: string;
    entities: Record<string, TemplateEntity>;
    factTypes: TemplateFactType[];
    extractPolicies: ExtractPolicies;
    injectionLayout: InjectionLayout;
    worldInfoRef?: { book: string; hash: string };
    createdAt: number;
}

/** 世界书条目（从 SillyTavern WorldInfo 读入） */
export interface WorldInfoEntry {
    book: string;
    entry: string;
    keywords: string[];
    content: string;
}

/** 世界上下文束（传给 LLM 用于生成模板） */
export interface WorldContextBundle {
    chatKey: string;
    worldInfo: WorldInfoEntry[];
    characterCard?: { name: string; desc: string; tags?: string[] };
    recentMessages?: Array<{ role: string; content: string }>;
}
