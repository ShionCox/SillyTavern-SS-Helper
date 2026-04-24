/**
 * 功能：定义记忆过滤器的公共类型。
 */

export type MemoryFilterMode = 'xml' | 'delimiter' | 'regex' | 'markdown' | 'json';

export type MemoryFilterChannel = 'memory' | 'context' | 'excluded';

export type MemoryFilterUnknownPolicy = MemoryFilterChannel;

export type MemoryFilterScopeKey = 'summary' | 'takeover' | 'dreamRecall' | 'vectorIndex' | 'promptInjection';

export interface MemoryFilterScopeSettings {
    summary: boolean;
    takeover: boolean;
    dreamRecall: boolean;
    vectorIndex: boolean;
    promptInjection: boolean;
}

export interface MemoryFilterCleanupConfig {
    trimWhitespace: boolean;
    stripWrapper: boolean;
    dropEmptyBlocks: boolean;
    minBlockLength: number;
    maxBlockLength: number;
}

export interface MemoryFilterRule {
    id: string;
    name: string;
    mode: MemoryFilterMode;
    enabled: boolean;
    channel: MemoryFilterChannel;
    priority: number;
    tagName?: string;
    aliases?: string[];
    pattern?: string;
    patternMode?: 'prefix' | 'regex';
    delimiters?: string[];
    keepDelimiter?: boolean;
    regex?: string;
    flags?: string;
    captureGroup?: number;
    markdownStrategy?: 'heading' | 'hr' | 'heading_or_hr';
    jsonPath?: string;
}

export interface MemoryFilterSettings {
    enabled: boolean;
    mode: MemoryFilterMode;
    scope: MemoryFilterScopeSettings;
    unknownPolicy: MemoryFilterUnknownPolicy;
    cleanup: MemoryFilterCleanupConfig;
    rules: MemoryFilterRule[];
}

export interface MemoryFilterMessage {
    role?: string;
    content?: string;
    name?: string;
    turnIndex?: number;
    floor?: number;
}

export interface MemoryFilterDiagnostic {
    level: 'info' | 'warn' | 'error';
    code: string;
    message: string;
    floor?: number;
    ruleId?: string;
}

export interface MemoryFilterBlock {
    id: string;
    floor: number;
    title: string;
    rawText: string;
    channel: MemoryFilterChannel;
    startOffset: number;
    endOffset: number;
    reasonCodes: string[];
    diagnostics?: string[];
}

export interface MemoryFilterFloorRecord {
    floor: number;
    role: 'user' | 'assistant' | 'system' | 'tool' | 'unknown';
    originalText: string;
    blocks: MemoryFilterBlock[];
    hasMemoryContent: boolean;
    hasContextOnly: boolean;
    hasExcludedOnly: boolean;
}

export interface MemoryFilterPreparedResult<T extends MemoryFilterMessage = MemoryFilterMessage> {
    enabled: boolean;
    mode: MemoryFilterMode;
    messagesForMemory: T[];
    contextText: string;
    excludedText: string;
    records: MemoryFilterFloorRecord[];
    diagnostics: MemoryFilterDiagnostic[];
}
