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
    providerId: string;
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
    recommendedRoute?: { providerId?: string; profileId?: string };
    recommendedDisplay?: DisplayMode;
    description?: string;
    backgroundEligible?: boolean;
}

/** 路由绑定 —— 一个插件对某个任务的覆盖 */
export interface RouteBinding {
    taskId: string;
    providerId: string;
    model?: string;
    profileId?: string;
    fallbackProviderId?: string;
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
        providerId?: string;
        model?: string;
        profileId?: string;
        source: 'user_task_override' | 'user_plugin_default' | 'user_global_default';
    }>;
    /** 推荐值快照 */
    recommendedSnapshots?: Record<string, {
        taskId: string;
        providerId?: string;
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

/** 内部请求记录 */
export interface RequestRecord<T = unknown> {
    requestId: string;
    consumer: string;
    taskId: string;
    taskKind: CapabilityKind;
    state: RequestState;
    validity: RequestValidity;
    enqueueOptions: RequestEnqueueOptions;
    scope?: RequestScope;
    queuedAt: number;
    startedAt?: number;
    finishedAt?: number;
    resultPromise: Promise<LLMRunResult<T>>;
    overlayClosedPromise: Promise<void>;
    resolveResult?: (value: LLMRunResult<T>) => void;
    resolveOverlay?: () => void;
    meta?: LLMRunMeta;
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
    routeHint?: { providerId?: string; model?: string; profileId?: string };
}

/** 路由解析结果 */
export interface RouteResolveResult {
    providerId: string;
    model?: string;
    profileId?: string;
    fallbackProviderId?: string;
    /** 实际生效来源 */
    resolvedBy: 'route_hint' | 'user_task_override' | 'plugin_task_recommend' | 'user_plugin_default' | 'user_global_default' | 'fallback';
}

// ═══════════════════════════════════════════
//  设置数据模型
// ═══════════════════════════════════════════

/** 全局能力默认 */
export interface GlobalCapabilityDefault {
    capabilityKind: CapabilityKind;
    providerId: string;
    model?: string;
    profileId?: string;
    fallbackProviderId?: string;
}

/** 插件能力默认 */
export interface PluginCapabilityDefault {
    pluginId: string;
    capabilityKind: CapabilityKind;
    providerId: string;
    model?: string;
    profileId?: string;
    fallbackProviderId?: string;
}

/** 任务覆盖 */
export interface TaskOverride {
    pluginId: string;
    taskId: string;
    taskKind: CapabilityKind;
    providerId?: string;
    model?: string;
    profileId?: string;
    fallbackProviderId?: string;
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
    /** 多 Provider 配置条目 */
    providers?: ProviderConfig[];
    /** 全局能力默认 */
    globalDefaults?: GlobalCapabilityDefault[];
    /** 插件能力默认 */
    pluginDefaults?: PluginCapabilityDefault[];
    /** 任务覆盖 */
    taskOverrides?: TaskOverride[];
    /** 预算配置 */
    budgets?: Record<string, import('../budget/budget-manager').BudgetConfig>;
    /** 消费方注册持久快照 */
    consumerSnapshots?: Record<string, ConsumerPersistentSnapshot>;
    /** silent 权限授权 */
    silentPermissions?: SilentPermissionGrant[];
}

export interface ProviderConfig {
    id: string;
    source: 'tavern' | 'custom';
    label?: string;
    baseUrl?: string;
    model?: string;
    manualModel?: string;
    selectedModel?: string;
    enabled?: boolean;
    /** Provider 声明支持的能力 */
    capabilities?: LLMCapability[];
}

// ═══════════════════════════════════════════
//  Provider 能力声明（扩展）
// ═══════════════════════════════════════════

export interface ProviderCapabilitySet {
    capabilities: LLMCapability[];
}

// ═══════════════════════════════════════════
//  runTask / embed / rerank 入参
// ═══════════════════════════════════════════

export interface RunTaskArgs<T = unknown> {
    consumer: string;
    taskId: string;
    taskKind: CapabilityKind;
    input: any;
    schema?: any;
    routeHint?: { provider?: string; profile?: string; model?: string };
    budget?: { maxTokens?: number; maxLatencyMs?: number; maxCost?: number };
    enqueue?: RequestEnqueueOptions;
}

export interface EmbedArgs {
    consumer: string;
    taskId: string;
    texts: string[];
    routeHint?: { provider?: string; model?: string };
    enqueue?: RequestEnqueueOptions;
}

export interface RerankArgs {
    consumer: string;
    taskId: string;
    query: string;
    docs: string[];
    topK?: number;
    routeHint?: { provider?: string; model?: string };
    enqueue?: RequestEnqueueOptions;
}
