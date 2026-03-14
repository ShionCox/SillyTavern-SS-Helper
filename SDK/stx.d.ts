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
    /** v2: 多表定义 */
    tables?: TemplateTableDef[];
    /** v2: 字段同义词映射 */
    fieldSynonyms?: Record<string, string[]>;
    /** v2: 表同义词映射 */
    tableSynonyms?: Record<string, string[]>;
    /** v2: 模板族 ID */
    templateFamilyId?: string;
    /** v2: 修订版本号 */
    revisionNo?: number;
    /** v2: 修订状态 */
    revisionState?: 'draft' | 'final';
    /** v2: 父模板 ID */
    parentTemplateId?: string | null;
    /** v2: Schema 指纹 */
    schemaFingerprint?: string;
    /** v2: 最后修改时间 */
    lastTouchedAt?: number;
    /** v2: 定稿时间 */
    finalizedAt?: number | null;
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
        /** v2: 模板 schema 变更提案 */
        schemaChanges?: SchemaChangeProposal[];
        /** v2: 实体解析提案 */
        entityResolutions?: EntityResolutionProposal[];
    };
    confidence: number;
}

/** v2: Schema 变更提案 */
export interface SchemaChangeProposal {
    kind: 'add_table' | 'add_field' | 'modify_primary_key' | 'modify_description' | 'alias_suggestion';
    tableKey: string;
    fieldKey?: string;
    payload: Record<string, unknown>;
    requiredByFacts?: boolean;
}

/** v2: 实体解析提案 */
export interface EntityResolutionProposal {
    tableKey: string;
    fromRowId: string;
    toRowId: string;
    confidence: number;
    reason: string;
}

/** v2: 延迟 schema 提示 */
export interface DeferredSchemaHint {
    change: SchemaChangeProposal;
    deferredAt: number;
    reason: string;
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
        /** v2: 已应用的 schema 变更数 */
        schemaChangesApplied?: number;
        /** v2: 被延迟的 schema 变更数 */
        schemaChangesDeferred?: number;
        /** v2: 实体解析结果 */
        entityResolutions?: number;
    };
    rejectedReasons: string[];
    gateResults: GateResult[];
    /** v2: 本轮产生的延迟 schema 提示 */
    deferredSchemaHints?: DeferredSchemaHint[];
}

export interface WriteRequest {
    source: { pluginId: string; version: string };
    chatKey: string;
    proposal: {
        facts?: FactProposal[];
        patches?: PatchProposal[];
        summaries?: SummaryProposal[];
        /** v2: 模板 schema 变更提案 */
        schemaChanges?: SchemaChangeProposal[];
        /** v2: 实体解析提案 */
        entityResolutions?: EntityResolutionProposal[];
    };
    reason: string;
    /** v2: 上一轮被延迟的 schema 提示 */
    deferredSchemaHints?: DeferredSchemaHint[];
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

// -- v2: 模板表定义 --
export interface TemplateTableDef {
    key: string;
    label: string;
    isBase: boolean;
    primaryKeyField: string;
    source?: 'persisted' | 'derived';
    fields: Array<{
        key: string;
        label: string;
        tier: 'core' | 'extension';
        description?: string;
        fillSpec?: string;
        isPrimaryKey?: boolean;
    }>;
    description?: string;
}

// -- v2: 聊天级状态类型 --
export interface SummaryPolicyOverride {
    enabled?: boolean;
    floorUnit?: 'assistant_reply';
    interval?: number;
    windowSize?: number;
    allowAutoSchemaExpansion?: boolean;
}

export interface AutoSchemaPolicy {
    maxNewTablesPerRound?: number;
    maxNewFieldsPerRound?: number;
    maxNewFieldsPerTable?: number;
    tableNameConflictThreshold?: number;
    descriptionSimilarityThreshold?: number;
}

// -- v2: 行操作类型 --
export interface RowRefResolution {
    resolved: boolean;
    rowId: string | null;
    source: 'exact' | 'redirect' | 'alias' | 'fuzzy';
    input: string;
    flattenedRedirect?: boolean;
}

export interface RowMergeResult {
    success: boolean;
    migratedFactKeys: string[];
    updatedRedirects: number;
    updatedAliases: number;
    auditId?: string;
    error?: string;
}

export interface RowSeedData {
    [fieldKey: string]: unknown;
}

export interface LogicTableRow {
    rowId: string;
    tableKey: string;
    values: Record<string, unknown>;
    factKeys: Record<string, string>;
    tombstoned: boolean;
    redirectedTo: string | null;
    aliases: string[];
    updatedAt: number;
}

export interface LogicTableQueryOpts {
    limit?: number;
    includeTombstones?: boolean;
    keywords?: string[];
}

export interface SchemaContextResult {
    source: 'active_draft' | 'active_final' | 'base_schema' | 'fallback_prompt';
    schemaSummary: string;
    dataSnapshot: string;
    degraded: boolean;
    degradeReason?: string;
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
        /** v2: 返回合并后的有效模板（draft + base） */
        getEffective(): Promise<WorldTemplate | null>;
        /** v2: 列出有效模板中的表定义 */
        listTables(): Promise<TemplateTableDef[]>;
        /** v2: 列出模板修订历史 */
        listRevisions(opts?: { limit?: number }): Promise<WorldTemplate[]>;
        /** v2: 回滚到指定模板修订 */
        rollbackRevision(templateId: string): Promise<void>;
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
        getLogicTable(entityType: string, opts?: LogicTableQueryOpts): Promise<any[]>;
        updateFact(
            factKey: string | undefined,
            type: string,
            entity: { kind: string; id: string },
            path: string,
            value: any
        ): Promise<string>;
    };

    // ─── v2 新增：聊天级状态管理 ───
    chatState: {
        getSummaryPolicy(): Promise<SummaryPolicyOverride>;
        setSummaryPolicyOverride(override: Partial<SummaryPolicyOverride>): Promise<void>;
        getAutoSchemaPolicy(): Promise<AutoSchemaPolicy>;
        setAutoSchemaPolicy(policy: AutoSchemaPolicy): Promise<void>;
        flush(): Promise<void>;
        destroy(): Promise<void>;
    };

    // ─── v2 新增：楼层跟踪器 ───
    turnTracker: {
        tryCountTurn(input: {
            eventType: string;
            messageId?: string;
            textContent: string;
            isSystemMessage: boolean;
            ingestHint: 'normal' | 'bootstrap' | 'backfill';
        }): Promise<boolean>;
        getAssistantTurnCount(): Promise<number>;
        invalidateCache(): void;
    };

    // ─── v2 新增：行操作 ───
    rows: {
        resolve(tableKey: string, input: string): Promise<RowRefResolution>;
        resolveMany(tableKey: string, inputs: string[]): Promise<RowRefResolution[]>;
        create(tableKey: string, rowId: string, seed?: RowSeedData): Promise<string>;
        merge(tableKey: string, fromRowId: string, toRowId: string): Promise<RowMergeResult>;
        delete(tableKey: string, rowId: string): Promise<void>;
        restore(tableKey: string, rowId: string): Promise<void>;
        listTableRows(tableKey: string, opts?: LogicTableQueryOpts): Promise<LogicTableRow[]>;
        updateCell(tableKey: string, rowId: string, fieldKey: string, value: unknown): Promise<string>;
        setAlias(tableKey: string, alias: string, canonicalRowId: string): Promise<void>;
    };

    // ─── v2 新增：schemaContext 与 Prompt 裁剪 ───
    schemaContext: {
        build(mode: 'extract' | 'summarize', windowKeywords?: string[]): Promise<SchemaContextResult>;
    };
}

// -- LLMHub 能力约束类型 --
export type LLMCapability = 'chat' | 'json' | 'tools' | 'embeddings' | 'rerank' | 'vision' | 'reasoning';
export type CapabilityKind = 'generation' | 'embedding' | 'rerank';
export type DisplayMode = 'fullscreen' | 'compact' | 'silent';

export interface LLMRunMeta {
    requestId: string;
    resourceId: string;
    model?: string;
    capabilityKind: CapabilityKind;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    fallbackUsed?: boolean;
}

export type LLMRunResult<T> =
    | { ok: true; data: T; meta: LLMRunMeta }
    | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean; reasonCode?: string; meta?: LLMRunMeta };

export interface TaskDescriptor {
    taskId: string;
    taskKind: CapabilityKind;
    requiredCapabilities: LLMCapability[];
    recommendedRoute?: { resourceId?: string; profileId?: string };
    recommendedDisplay?: DisplayMode;
    description?: string;
    backgroundEligible?: boolean;
}

export interface ConsumerRegistration {
    pluginId: string;
    displayName: string;
    registrationVersion: number;
    tasks: TaskDescriptor[];
    routeBindings?: Array<{
        taskId: string;
        resourceId: string;
        model?: string;
        profileId?: string;
        fallbackResourceId?: string;
    }>;
}

export interface LLMOverlayPatch {
    title?: string;
    status?: 'loading' | 'streaming' | 'done' | 'error';
    progress?: number;
    content?: { type: 'text' | 'markdown' | 'html'; body: string };
    actions?: Array<{ id: string; label: string; style?: 'primary' | 'secondary' | 'danger'; closeOnClick?: boolean }>;
    displayMode?: DisplayMode;
    autoClose?: boolean;
    autoCloseMs?: number;
}

export interface RequestScope {
    chatId?: string;
    sessionId?: string;
    pluginId?: string;
}

export interface RequestEnqueueOptions {
    dedupeKey?: string;
    replacePendingByKey?: string;
    cancelOnScopeChange?: boolean;
    displayMode?: DisplayMode;
    scope?: RequestScope;
    blockNextUntilOverlayClose?: boolean;
}

export interface RouteResolveArgs {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities?: LLMCapability[];
    routeHint?: { resourceId?: string; model?: string; profileId?: string };
}

export interface RoutePreviewSnapshot {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities: LLMCapability[];
    available: boolean;
    resourceId?: string;
    resourceLabel?: string;
    resourceType?: 'generation' | 'embedding' | 'rerank';
    source?: 'tavern' | 'custom';
    model?: string;
    resolvedBy?: 'route_hint' | 'user_task_override' | 'plugin_task_recommend' | 'user_plugin_default' | 'user_global_default' | 'builtin_tavern_fallback' | 'fallback';
    blockedReason?: string;
}

export interface ResourceStatusSnapshot {
    resourceId: string;
    resourceLabel: string;
    resourceType: 'generation' | 'embedding' | 'rerank';
    source: 'tavern' | 'custom';
    enabled: boolean;
    baseUrl?: string;
    model?: string;
    credentialConfigured: boolean;
    builtin: boolean;
}

export interface LLMHubStatusSnapshot {
    resources: ResourceStatusSnapshot[];
    globalProfile?: string;
    globalAssignments: {
        generation?: { resourceId: string };
        embedding?: { resourceId: string };
        rerank?: { resourceId: string };
    };
    pluginAssignments: Array<{
        pluginId: string;
        generation?: { resourceId: string };
        embedding?: { resourceId: string };
        rerank?: { resourceId: string };
    }>;
    taskAssignments: Array<{
        pluginId: string;
        taskId: string;
        taskKind: CapabilityKind;
        resourceId: string;
        isStale: boolean;
        staleReason?: string;
    }>;
    readiness: Record<CapabilityKind, boolean>;
}

export interface LLMInspectApi {
    getStatusSnapshot(): Promise<LLMHubStatusSnapshot> | LLMHubStatusSnapshot;
    previewRoute(args: RouteResolveArgs): Promise<RoutePreviewSnapshot> | RoutePreviewSnapshot;
}

// -- LLMSDK 接口 --
export interface LLMSDK {
    // ─── 同步命令式接口 ───

    /** 幂等 upsert 消费方注册。同步返回，内部异步落盘。 */
    registerConsumer(registration: ConsumerRegistration): void;

    /** 注销消费方。同步返回。 */
    unregisterConsumer(pluginId: string, opts?: { keepPersistent?: boolean }): void;

    /** 更新已存在的覆层。同步返回。 */
    updateOverlay(requestId: string, patch: LLMOverlayPatch): void;

    /** 关闭覆层。同步返回。 */
    closeOverlay(requestId: string, reason?: string): void;

    // ─── 异步接口 ───

    /** 执行 AI 任务。只等待 AI 结果返回，不等待展示关闭。 */
    runTask<T>(args: {
        consumer: string;
        taskId: string;
        taskKind: CapabilityKind;
        input: any;
        schema?: object;
        routeHint?: { resource?: string; profile?: string; model?: string };
        budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
        enqueue?: RequestEnqueueOptions;
    }): Promise<LLMRunResult<T>>;

    /** 向量化接口 */
    embed(args: {
        consumer: string;
        taskId: string;
        texts: string[];
        routeHint?: { resource?: string; model?: string };
        enqueue?: RequestEnqueueOptions;
    }): Promise<any>;

    /** 重排序接口 */
    rerank(args: {
        consumer: string;
        taskId: string;
        query: string;
        docs: string[];
        topK?: number;
        routeHint?: { resource?: string; model?: string };
        enqueue?: RequestEnqueueOptions;
    }): Promise<any>;

    /** 等待指定请求的覆层关闭。通过 meta.requestId 获取 requestId。 */
    waitForOverlayClose(requestId: string): Promise<void>;

    /** 只读检查接口。*/
    inspect?: LLMInspectApi;
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
