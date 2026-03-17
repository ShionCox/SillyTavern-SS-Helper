/**
 * LLMHub 核心类型定义
 * 统一定义四层架构（注册中心、路由解析、请求编排、展示控制）的全部契约类型。
 */

// ═══════════════════════════════════════════
//  能力约束联合字面量
// ═══════════════════════════════════════════

/** 受控能力字面量，不允许自由字符串漂移 */
export type LLMCapability = 'chat' | 'json' | 'tools' | 'embeddings' | 'rerank' | 'vision' | 'reasoning';

/** 能力大类 */
export type CapabilityKind = 'generation' | 'embedding' | 'rerank';

// ═══════════════════════════════════════════
//  结果返回结构
// ═══════════════════════════════════════════

/** 请求元数据 —— 固定字段集 */
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

/** 统一结果形态 */
export type LLMRunResult<T> =
    | { ok: true; data: T; meta: LLMRunMeta }
    | { ok: false; error: string; retryable?: boolean; fallbackUsed?: boolean; reasonCode?: string; meta?: LLMRunMeta };

export type LLMTaskLifecycleStage =
    | 'queued'
    | 'running'
    | 'route_resolved'
    | 'provider_requesting'
    | 'fallback_started'
    | 'completed'
    | 'failed';

export interface LLMTaskLifecycleEvent {
    requestId: string;
    consumer: string;
    taskId: string;
    taskKind: CapabilityKind;
    stage: LLMTaskLifecycleStage;
    ts: number;
    message?: string;
    resourceId?: string;
    model?: string;
    fallbackUsed?: boolean;
    progress?: number;
    error?: string;
    reasonCode?: string;
}

export type LLMTaskLifecycleHandler = (event: LLMTaskLifecycleEvent) => void;

// ═══════════════════════════════════════════
//  展示模式
// ═══════════════════════════════════════════

export type DisplayMode = 'fullscreen' | 'compact' | 'silent';

// ═══════════════════════════════════════════
//  消费方注册描述
// ═══════════════════════════════════════════

/** 单个任务描述 */
export interface TaskDescriptor {
    taskId: string;
    taskKind: CapabilityKind;
    requiredCapabilities: LLMCapability[];
    recommendedRoute?: { resourceId?: string; profileId?: string };
    recommendedDisplay?: DisplayMode;
    description?: string;
    backgroundEligible?: boolean;
}

/** 路由绑定 —— 一个插件对某个任务的覆盖 */
export interface RouteBinding {
    taskId: string;
    resourceId: string;
    model?: string;
    profileId?: string;
    fallbackResourceId?: string;
}

/** 消费方注册包 */
export interface ConsumerRegistration {
    pluginId: string;
    displayName: string;
    registrationVersion: number;
    tasks: TaskDescriptor[];
    routeBindings?: RouteBinding[];
}

// ═══════════════════════════════════════════
//  注册快照：持久字段 & 会话字段
// ═══════════════════════════════════════════

/** 持久字段 —— 重启后恢复 */
export interface ConsumerPersistentSnapshot {
    pluginId: string;
    displayName: string;
    registrationVersion: number;
    tasks: TaskDescriptor[];
    routeBindings: RouteBinding[];
    staleReason?: string;
    /** 用户覆盖来源快照 */
    userOverrides?: Record<string, {
        taskId: string;
        resourceId?: string;
        model?: string;
        profileId?: string;
        source: 'user_task_override' | 'user_plugin_default' | 'user_global_default';
    }>;
    /** 推荐值快照 */
    recommendedSnapshots?: Record<string, {
        taskId: string;
        resourceId?: string;
        model?: string;
        profileId?: string;
    }>;
}

/** 会话字段 —— 不跨重启 */
export interface ConsumerSessionSnapshot {
    online: boolean;
    seenAt: number;
    currentQueueState: {
        pendingCount: number;
        runningTaskId?: string;
    };
    currentOverlayState: {
        activeRequestId?: string;
        displayMode?: DisplayMode;
    };
}

/** 完整注册快照 */
export interface ConsumerSnapshot extends ConsumerPersistentSnapshot {
    session: ConsumerSessionSnapshot;
}

// ═══════════════════════════════════════════
//  失效绑定快照
// ═══════════════════════════════════════════

export interface StaleBindingSnapshot {
    taskId: string;
    taskKind: CapabilityKind;
    registrationVersion: number;
    lastSeenAt: number;
    source: 'task_removed' | 'task_kind_changed' | 'capability_mismatch' | 'plugin_inactive';
    isStale: true;
    staleReason: string;
}

// ═══════════════════════════════════════════
//  请求编排
// ═══════════════════════════════════════════

/** 请求作用域 —— 取消与作废判断的唯一上下文单位 */
export interface RequestScope {
    chatKey?: string;
    chatId?: string;
    sessionId?: string;
    pluginId?: string;
}

/** 请求入队参数 */
export interface RequestEnqueueOptions {
    dedupeKey?: string;
    replacePendingByKey?: string;
    cancelOnScopeChange?: boolean;
    displayMode?: DisplayMode;
    scope?: RequestScope;
    blockNextUntilOverlayClose?: boolean;
}

/** 请求状态机 */
export type RequestState =
    | 'queued'
    | 'running'
    | 'result_ready'
    | 'overlay_waiting'
    | 'completed'
    | 'failed'
    | 'cancelled';

/** 请求有效性状态 */
export interface RequestValidity {
    isCancelled: boolean;
    isSuperseded: boolean;
    isObsolete: boolean;
}

export interface RequestDebugInfo {
    rawResponseText?: string;
    parsedResponse?: unknown;
    normalizedResponse?: unknown;
    validationErrors?: string[];
    finalError?: string;
    reasonCode?: string;
}

export interface LLMRequestLogRequestSnapshot {
    taskKind: CapabilityKind;
    taskDescription?: string;
    routeHint?: unknown;
    budget?: unknown;
    enqueue?: unknown;
    schemaSummary?: string;
    schema?: unknown;
    jsonMode?: boolean;
    providerRequest?: unknown;
    normalizeMode?: string;
    generationInput?: unknown;
    embeddingTexts?: string[];
    rerankQuery?: string;
    rerankDocs?: string[];
    rerankTopK?: number;
    metrics?: {
        messageCount?: number;
        embeddingTextCount?: number;
        rerankDocCount?: number;
    };
}

export interface LLMRequestLogResponseSnapshot {
    meta?: Partial<LLMRunMeta>;
    finalError?: string;
    reasonCode?: string;
    validationErrors?: string[];
    rawResponseText?: string;
    parsedResponse?: unknown;
    normalizedResponse?: unknown;
}

export interface LLMRequestLogEntry {
    logId: string;
    requestId: string;
    chatKey: string;
    consumer: string;
    taskId: string;
    taskDescription?: string;
    taskKind: CapabilityKind;
    state: RequestState;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    latencyMs?: number;
    request: LLMRequestLogRequestSnapshot;
    response: LLMRequestLogResponseSnapshot;
    truncated?: Record<string, unknown>;
}

export interface LLMRequestLogQueryOptions {
    limit?: number;
    offset?: number;
    order?: 'asc' | 'desc';
    state?: RequestState | 'all';
    search?: string;
    fromTs?: number;
    toTs?: number;
}

/** 内部请求记录 */
export interface RequestRecord<T = unknown> {
    requestId: string;
    consumer: string;
    taskId: string;
    taskDescription?: string;
    taskKind: CapabilityKind;
    requestArgs?: unknown;
    state: RequestState;
    validity: RequestValidity;
    enqueueOptions: RequestEnqueueOptions;
    scope?: RequestScope;
    chatKey?: string;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    resultPromise: Promise<LLMRunResult<T>>;
    overlayClosedPromise: Promise<void>;
    resolveResult?: (value: LLMRunResult<T>) => void;
    resolveOverlay?: () => void;
    meta?: LLMRunMeta;
    debug?: RequestDebugInfo;
    requestLogSnapshot?: LLMRequestLogRequestSnapshot;
}

// ═══════════════════════════════════════════
//  展示协议
// ═══════════════════════════════════════════

/** Level 1: 结构化覆层描述 */
export interface LLMOverlaySpec {
    requestId: string;
    title?: string;
    status?: 'loading' | 'streaming' | 'done' | 'error';
    progress?: number;
    content?: LLMSafeRichContent;
    actions?: OverlayAction[];
    displayMode: DisplayMode;
    autoClose?: boolean;
    autoCloseMs?: number;
}

/** Level 2: 受限富内容 */
export interface LLMSafeRichContent {
    type: 'text' | 'markdown' | 'html';
    body: string;
}

export interface OverlayAction {
    id: string;
    label: string;
    style?: 'primary' | 'secondary' | 'danger';
    closeOnClick?: boolean;
}

/** Overlay 补丁 */
export type OverlayPatch = Partial<Omit<LLMOverlaySpec, 'requestId'>>;

// ═══════════════════════════════════════════
//  路由解析
// ═══════════════════════════════════════════

/** 路由解析入口参数 */
export interface RouteResolveArgs {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities?: LLMCapability[];
    routeHint?: { resourceId?: string; model?: string; profileId?: string };
}

/** 路由解析结果 */
export interface RouteResolveResult {
    resourceId: string;
    model?: string;
    profileId?: string;
    fallbackResourceId?: string;
    /** 实际生效来源 */
    resolvedBy: 'route_hint' | 'user_task_override' | 'plugin_task_recommend' | 'user_plugin_default' | 'user_global_default' | 'builtin_tavern_fallback' | 'fallback';
}

// ═══════════════════════════════════════════
//  资源类型
// ═══════════════════════════════════════════

/** 资源类型 —— 决定能力，不再手动勾选 */
export type ResourceType = 'generation' | 'embedding' | 'rerank';

/** 资源来源 */
export type ResourceSource = 'tavern' | 'custom';

/** 资源级自定义请求参数 */
export type ResourceCustomParams = Record<string, unknown>;

/** 用户创建的第三方资源配置 */
export interface ResourceConfig {
    id: string;
    type: ResourceType;
    source: ResourceSource;
    label: string;
    baseUrl?: string;
    model?: string;
    enabled?: boolean;
    /** 重排资源专用路径，如 /rerank */
    rerankPath?: string;
    /** 资源声明能力（包含基础能力与附加能力） */
    capabilities?: LLMCapability[];
    /** 透传到 Provider 请求体中的自定义参数 */
    customParams?: ResourceCustomParams;
}

// ═══════════════════════════════════════════
//  分配数据模型
// ═══════════════════════════════════════════

/** 单条分配项 —— 只保存 resourceId */
export interface AssignmentEntry {
    resourceId: string;
}

/** 全局分配 */
export interface GlobalAssignments {
    generation?: AssignmentEntry;
    embedding?: AssignmentEntry;
    rerank?: AssignmentEntry;
}

/** 插件分配 */
export interface PluginAssignment {
    pluginId: string;
    generation?: AssignmentEntry;
    embedding?: AssignmentEntry;
    rerank?: AssignmentEntry;
}

/** 任务分配 */
export interface TaskAssignment {
    pluginId: string;
    taskId: string;
    taskKind: CapabilityKind;
    resourceId: string;
    isStale: boolean;
    staleReason?: string;
}

/** silent 权限授权 */
export interface SilentPermissionGrant {
    pluginId: string;
    taskId: string;
    grantedAt: number;
}

/** LLMHub 完整设置 */
export interface LLMHubSettings {
    enabled?: boolean;
    globalProfile?: string;
    /** 用户创建的资源列表 */
    resources?: ResourceConfig[];
    /** 全局分配 */
    globalAssignments?: GlobalAssignments;
    /** 插件分配 */
    pluginAssignments?: PluginAssignment[];
    /** 任务分配 */
    taskAssignments?: TaskAssignment[];
    /** 预算配置 */
    budgets?: Record<string, import('../budget/budget-manager').BudgetConfig>;
    /** 消费方注册持久快照 */
    consumerSnapshots?: Record<string, ConsumerPersistentSnapshot>;
    /** silent 权限授权 */
    silentPermissions?: SilentPermissionGrant[];
}

// ═══════════════════════════════════════════
//  资源状态快照
// ═══════════════════════════════════════════

/** 单个资源的运行时状态摘要 */
export interface ResourceStatusSnapshot {
    resourceId: string;
    resourceLabel: string;
    resourceType: ResourceType;
    source: ResourceSource;
    enabled: boolean;
    baseUrl?: string;
    model?: string;
    credentialConfigured: boolean;
    builtin: boolean;
}

/** 路由预览结果 */
export interface RoutePreviewSnapshot {
    consumer: string;
    taskKind: CapabilityKind;
    taskId?: string;
    requiredCapabilities: LLMCapability[];
    available: boolean;
    resourceId?: string;
    resourceLabel?: string;
    resourceType?: ResourceType;
    source?: ResourceSource;
    model?: string;
    resolvedBy?: RouteResolveResult['resolvedBy'];
    blockedReason?: string;
}

/** 当前资源池与分配的只读状态快照 */
export interface LLMHubStatusSnapshot {
    resources: ResourceStatusSnapshot[];
    globalProfile?: string;
    globalAssignments: GlobalAssignments;
    pluginAssignments: PluginAssignment[];
    taskAssignments: TaskAssignment[];
    readiness: Record<CapabilityKind, boolean>;
}

/** 提供给外部插件读取 LLMHub 状态与路由预览的只读接口 */
export interface LLMInspectApi {
    getStatusSnapshot(): Promise<LLMHubStatusSnapshot> | LLMHubStatusSnapshot;
    previewRoute(args: RouteResolveArgs): Promise<RoutePreviewSnapshot> | RoutePreviewSnapshot;
}

// ═══════════════════════════════════════════
//  runTask / embed / rerank 入参
// ═══════════════════════════════════════════

export interface RunTaskArgs<T = unknown> {
    consumer: string;
    taskId: string;
    taskDescription?: string;
    taskKind: CapabilityKind;
    input: any;
    schema?: any;
    routeHint?: { resource?: string; profile?: string; model?: string };
    budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
    enqueue?: RequestEnqueueOptions;
    onLifecycle?: LLMTaskLifecycleHandler;
}

export interface EmbedArgs {
    consumer: string;
    taskId: string;
    taskDescription?: string;
    texts: string[];
    routeHint?: { resource?: string; model?: string };
    enqueue?: RequestEnqueueOptions;
    onLifecycle?: LLMTaskLifecycleHandler;
}

export interface RerankArgs {
    consumer: string;
    taskId: string;
    taskDescription?: string;
    query: string;
    docs: string[];
    topK?: number;
    routeHint?: { resource?: string; model?: string };
    enqueue?: RequestEnqueueOptions;
    onLifecycle?: LLMTaskLifecycleHandler;
}
