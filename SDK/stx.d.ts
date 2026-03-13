export {}; // 确保该文件被识别为模块

// -- 事件信封 --
export type EventEnvelope<T = any> = {
    id: string;
    ts: number;
    chatKey: string;
    source: { pluginId: string; version: string };
    type: string;
    payload: T;
};

// -- 模板与提议相关类型 --
export interface TemplateFactType {
    type: string;
    pathPattern: string;
    slots: string[];
    defaultInjection?: string;
    [key: string]: any;
}

export interface WorldTemplate {
    templateId: string;
    chatKey: string;
    worldType: 'fantasy' | 'urban' | 'custom';
    name: string;
    entities: Record<string, any>;
    factTypes: TemplateFactType[];
    extractPolicies: Record<string, any>;
    injectionLayout: Record<string, any>;
    worldInfoRef?: { book: string; hash: string };
    createdAt: number;
}

export interface TemplateBinding {
    bindingKey: string;
    chatKey: string;
    activeTemplateId: string;
    worldInfoHash: string;
    isLocked?: boolean;
    boundAt: number;
}

export interface FactProposal {
    factKey?: string;
    type: string;
    entity?: { kind: string; id: string };
    path?: string;
    value: any;
    confidence?: number;
}

export interface PatchProposal {
    op: 'add' | 'replace' | 'remove';
    path: string;
    value?: any;
}

export interface SummaryProposal {
    level: 'message' | 'scene' | 'arc';
    title?: string;
    content: string;
    keywords?: string[];
}

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

export interface GateResult {
    passed: boolean;
    gate: string;
    errors: string[];
}

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

export interface HybridSearchResult {
    content: string;
    score: number;
    source: 'vector' | 'keyword' | 'event';
    meta?: any;
}

export interface CompactionResult {
    summariesCreated?: number;
    eventsArchived?: number;
    statesUpdated?: number;
}

// -- BUS 接口 --
export interface STXBus {
    emit<T>(type: string, payload: T, opts?: { chatKey?: string }): void;
    on<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
    once<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void;
    off(type: string, handler: Function): void;
}

export interface RegistryChangeEvent {
    pluginId: string;
    action: 'add' | 'update';
    manifest: PluginManifest;
    degraded: boolean;
    reason?: string;
    ts: number;
}

// -- MemorySDK 接口 --
export interface MemorySDK {
    getChatKey(): string;
    getActiveTemplateId(): Promise<string | null>;
    setActiveTemplateId(templateId: string): Promise<void>;

    events: {
        append<T>(type: string, payload: T, meta?: { sourceMessageId?: string; sourcePlugin?: string }): Promise<string>;
        query(opts: { type?: string; sinceTs?: number; limit?: number }): Promise<Array<EventEnvelope<any>>>;
    };

    facts: {
        upsert(fact: {
            factKey?: string;
            type: string;
            entity?: { kind: string; id: string };
            path?: string;
            value: any;
            confidence?: number;
            provenance?: any;
        }): Promise<string>;
        get(factKey: string): Promise<any | null>;
        query(opts: { type?: string; entity?: { kind: string; id: string }; pathPrefix?: string; limit?: number }): Promise<any[]>;
        remove(factKey: string): Promise<void>;
    };

    state: {
        get(path: string): Promise<any | null>;
        set(path: string, value: any, meta?: { sourceEventId?: string }): Promise<void>;
        patch(patches: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: any }>, meta?: any): Promise<void>;
        query(prefix: string): Promise<Record<string, any>>;
    };

    summaries: {
        upsert(summary: { level: 'message' | 'scene' | 'arc'; messageId?: string; title?: string; content: string; keywords?: string[] }): Promise<string>;
        query(opts: { level?: string; sinceTs?: number; limit?: number }): Promise<any[]>;
    };

    injection: {
        buildContext(opts?: {
            maxTokens?: number;
            sections?: Array<'WORLD_STATE' | 'FACTS' | 'EVENTS' | 'SUMMARY'>;
            query?: string;
            sectionBudgets?: Partial<Record<'WORLD_STATE' | 'FACTS' | 'EVENTS' | 'SUMMARY', number>>;
            preferSummary?: boolean;
        }): Promise<string>;
        setAnchorPolicy(opts: { allowSystem?: boolean; allowUser?: boolean; defaultInsert?: 'top' | 'beforeStart' | 'customAnchor' }): Promise<void>;
    };

    audit: {
        list(opts?: { sinceTs?: number; limit?: number }): Promise<any[]>;
        rollbackToSnapshot(snapshotId: string): Promise<void>;
        createSnapshot(note?: string): Promise<string>;
    };

    extract: {
        kickOffExtraction(): Promise<void>;
    };

    proposal: {
        processProposal(envelope: ProposalEnvelope, consumerPluginId: string): Promise<ProposalResult>;
        requestWrite(request: WriteRequest): Promise<ProposalResult>;
        grantPermission(pluginId: string): void;
        revokePermission(pluginId: string): void;
    };

    template: {
        getById(templateId: string): Promise<WorldTemplate | null>;
        getActive(): Promise<WorldTemplate | null>;
        listByChatKey(): Promise<WorldTemplate[]>;
        setActive(templateId: string, opts?: { lock?: boolean }): Promise<void>;
        setLock(locked: boolean): Promise<void>;
        getBinding(): Promise<TemplateBinding | null>;
        rebuildFromWorldInfo(): Promise<string | null>;
        destroy(): void;
    };

    vector: {
        search(query: string, options?: { maxVectorResults?: number; maxKeywordResults?: number; maxEventResults?: number }): Promise<HybridSearchResult[]>;
        indexText(text: string, bookId?: string): Promise<string[]>;
        formatForPrompt(results: HybridSearchResult[]): string;
    };

    compaction: {
        needsCompaction(): Promise<{ needed: boolean; reason?: string; eventCount?: number }>;
        compact(opts?: { windowSize?: number; archiveProcessed?: boolean }): Promise<CompactionResult>;
        replayToState(opts?: { sinceTs?: number }): Promise<CompactionResult>;
    };

    worldInfo: {
        writeback(mode?: 'facts' | 'summaries' | 'all'): Promise<{ written: number; bookName: string }>;
        preview(): Promise<Array<{ entry: string; keywords: string[]; contentLength: number }>>;
        getLogicTable(entityType: string): Promise<any[]>;
        updateFact(
            factKey: string | undefined,
            type: string,
            entity: { kind: string; id: string },
            path: string,
            value: any
        ): Promise<string>;
    };
}

// -- LLMSDK 接口 --
export interface LLMSDK {
    runTask<T>(args: {
        consumer: string;
        task: string;
        input: any;
        schema?: object;
        routeHint?: { provider?: string; profile?: string };
        budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
    }): Promise<
        | { ok: true; data: T; meta: { provider: string; latencyMs: number; cost?: number } }
        | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean; reasonCode?: string }
    >;

    embed?(args: { consumer: string; texts: string[]; routeHint?: any }): Promise<any>;
    rerank?(args: { consumer: string; query: string; docs: string[]; routeHint?: any }): Promise<any>;
}

// -- Tavern SDK 鎺ュ彛 --
export type SdkTavernScopeTypeEvent = "character" | "group";

export interface SdkTavernRoleIdentityEvent {
    roleId: string;
    roleKey: string;
    displayName: string;
    avatarName: string;
    avatarUrl: string;
}

export interface SdkTavernInstanceEvent {
    tavernInstanceId: string;
}

export interface SdkTavernScopeLocatorEvent extends SdkTavernInstanceEvent {
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
    roleId: string;
    displayName: string;
    avatarUrl: string;
    groupId: string;
    characterId: number;
    currentChatId: string;
}

export interface SdkTavernChatLocatorEvent extends SdkTavernScopeLocatorEvent {
    chatId: string;
}

export interface SdkTavernChatListItemEvent {
    locator: SdkTavernChatLocatorEvent;
    updatedAt: number;
    messageCount: number;
}

export interface SdkTavernChatRefEvent extends SdkTavernInstanceEvent {
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    chatId: string;
}

export interface SdkUnifiedTavernLocalSummaryEvent {
    chatKey: string;
    updatedAt: number;
    activeStatusCount?: number;
    displayName?: string;
    avatarUrl?: string;
    roleKey?: string;
}

export interface SdkUnifiedTavernHostChatEvent {
    chatKey: string;
    updatedAt: number;
    chatId: string;
    displayName: string;
    avatarUrl: string;
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
}

export interface SdkUnifiedTavernChatDirectoryInputEvent {
    currentChatKey: string;
    hostChats: SdkUnifiedTavernHostChatEvent[];
    localSummaries: SdkUnifiedTavernLocalSummaryEvent[];
    draftChatKeys?: string[];
    taggedChatKeys?: string[];
}

export interface SdkUnifiedTavernChatDirectoryItemEvent {
    chatKey: string;
    entityKey: string;
    chatId: string;
    displayName: string;
    avatarUrl: string;
    scopeType: SdkTavernScopeTypeEvent;
    scopeId: string;
    roleKey: string;
    updatedAt: number;
    activeStatusCount: number;
    isCurrent: boolean;
    fromHost: boolean;
    fromLocal: boolean;
    fromDraft: boolean;
    fromTagged: boolean;
}

// -- 插件注册接口 --
export interface PluginManifest {
    pluginId: string;
    name: string;
    version: string;
    displayName?: string;
    capabilities: {
        events?: string[];
        memory?: string[];
        llm?: string[];
    };
    scopes?: string[];
    requiresSDK?: string;
    source?: 'manifest_json' | 'runtime';
    declaredAt?: number;
}

export interface STXRegistry {
    register(manifest: PluginManifest): { ok: boolean; degraded: boolean; reason?: string };
    list(): PluginManifest[];
    get(pluginId: string): PluginManifest | undefined;
    onChanged?(handler: (event: RegistryChangeEvent) => void): () => void;
}

// -- 全局对象声明 --
declare global {
    interface Window {
        STX: {
            version: string;
            bus: STXBus;
            memory: MemorySDK;
            llm: LLMSDK;
            registry: STXRegistry;
        };
        toastr: {
            success(msg: string, title?: string, options?: any): void;
            info(msg: string, title?: string, options?: any): void;
            warning(msg: string, title?: string, options?: any): void;
            error(msg: string, title?: string, options?: any): void;
            clear(): void;
        };
    }
}
