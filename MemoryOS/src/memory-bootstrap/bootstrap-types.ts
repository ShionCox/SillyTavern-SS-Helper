/**
 * 功能：定义冷启动输入中的角色卡信息。
 */
export interface ColdStartCharacterCardSource {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    firstMessage: string;
    messageExample: string;
    creatorNotes: string;
    tags: string[];
}

/**
 * 功能：定义冷启动输入中的 Tavern 语义快照。
 */
export interface ColdStartSemanticSource {
    systemPrompt: string;
    firstMessage: string;
    authorNote: string;
    jailbreak: string;
    instruct: string;
    activeLorebooks: string[];
}

/**
 * 功能：定义冷启动输入中的用户画像信息。
 */
export interface ColdStartUserSource {
    userName: string;
    counterpartName: string;
    personaDescription: string;
    metadataPersona: string;
}

/**
 * 功能：定义冷启动输入中的世界书条目。
 */
export interface ColdStartWorldbookEntrySource {
    book: string;
    entryId: string;
    entry: string;
    keywords: string[];
    content: string;
}

/**
 * 功能：定义冷启动输入的统一数据包。
 */
export interface ColdStartSourceBundle {
    reason: string;
    characterCard: ColdStartCharacterCardSource;
    semantic: ColdStartSemanticSource;
    user: ColdStartUserSource;
    worldbooks: {
        mainBook: string;
        extraBooks: string[];
        activeBooks: string[];
        entries: ColdStartWorldbookEntrySource[];
    };
    recentEvents: string[];
}

/**
 * 功能：定义冷启动身份对象。
 */
export interface ColdStartIdentity {
    actorKey: string;
    displayName: string;
    aliases: string[];
    identityFacts: string[];
    originFacts: string[];
    traits: string[];
}

/**
 * 功能：定义冷启动世界基础条目。
 */
export interface ColdStartWorldBaseEntry {
    schemaId: string;
    title: string;
    summary: string;
    scope: string;
}

/**
 * 功能：定义冷启动关系条目。
 */
export interface ColdStartRelationshipEntry {
    sourceActorKey: string;
    targetActorKey: string;
    summary: string;
    trust?: number;
    affection?: number;
    tension?: number;
}

/**
 * 功能：定义冷启动记忆条目。
 */
export interface ColdStartMemoryRecord {
    schemaId: string;
    title: string;
    summary: string;
    importance?: number;
}

/**
 * 功能：定义冷启动输出文档。
 */
export interface ColdStartDocument {
    schemaVersion: string;
    identity: ColdStartIdentity;
    worldProfileDetection?: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
    worldBase: ColdStartWorldBaseEntry[];
    relationships: ColdStartRelationshipEntry[];
    memoryRecords: ColdStartMemoryRecord[];
}
