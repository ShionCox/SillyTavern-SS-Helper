/**
 * MemoryOS AI 状态中心
 *
 * 统一维护 LLMHub 挂载状态、consumer 注册状态、能力可用性、
 * AI 模式有效状态、每类任务的最新执行结果和最近任务记录。
 * 所有对外暴露均为只读快照，供 UI 和运行时共同读取。
 */

import type {
    MemoryAiRouteOverview,
    MemoryAiHealthSnapshot,
    MemoryAiTaskId,
    MemoryAiTaskRecord,
    MemoryAiTaskRouteStatus,
    MemoryAiTaskStatus,
    MemoryAiTaskStatusState,
    CapabilityStatus,
    CapabilityState,
    LlmHubDiagnosisLevel,
} from './ai-health-types';
import type { CapabilityKind, LLMCapability, LLMSDK, RoutePreviewSnapshot } from '../../../SDK/stx';

// ── 常量 ──

const MAX_RECENT_RECORDS = 10;

const ALL_TASK_IDS: MemoryAiTaskId[] = [
    'memory.coldstart.summarize',
    'memory.summarize',
    'memory.extract',
    'world.template.build',
    'memory.vector.embed',
    'memory.search.rerank',
];

/** MemoryOS 依赖的四类能力 */
const REQUIRED_CAPABILITIES: LLMCapability[] = ['chat', 'json', 'embeddings', 'rerank'];

const TASK_KIND_BY_ID: Record<MemoryAiTaskId, CapabilityKind> = {
    'memory.coldstart.summarize': 'generation',
    'memory.summarize': 'generation',
    'memory.extract': 'generation',
    'world.template.build': 'generation',
    'memory.vector.embed': 'embedding',
    'memory.search.rerank': 'rerank',
};

// ── 内部可变状态 ──

let _llmHubMounted = false;
let _consumerRegistered = false;
let _aiModeEnabled = false;

const _taskStatuses: Record<MemoryAiTaskId, MemoryAiTaskStatus> = Object.create(null);
const _recentRecords: MemoryAiTaskRecord[] = [];
let _routeOverview: MemoryAiRouteOverview = {
    generation: null,
    embedding: null,
    rerank: null,
};
const _taskRoutes: Record<MemoryAiTaskId, MemoryAiTaskRouteStatus> = Object.create(null);

/** 订阅者列表 */
type HealthChangeListener = () => void;
const _listeners: Set<HealthChangeListener> = new Set();

// ── 初始化默认任务状态 ──

for (const taskId of ALL_TASK_IDS) {
    _taskStatuses[taskId] = { taskId, state: 'idle', lastRecord: null };
    _taskRoutes[taskId] = {
        taskId,
        taskKind: TASK_KIND_BY_ID[taskId],
        available: false,
        blockedReason: '尚未刷新路由状态',
        route: null,
    };
}

// ── 内部辅助 ──

function notifyListeners(): void {
    for (const listener of _listeners) {
        try { listener(); } catch { /* 订阅者崩溃不应阻断其它 */ }
    }
}

function detectCapabilities(): CapabilityStatus[] {
    const llm = (window as any).STX?.llm as LLMSDK | undefined;
    if (!llm) {
        return REQUIRED_CAPABILITIES.map((cap): CapabilityStatus => ({
            capability: cap,
            state: 'missing',
        }));
    }

    // LLMHub 目前没有暴露逐项能力查询接口，
    // 我们通过 SDK 是否具备对应方法来推断：
    //   runTask → chat/json 能力
    //   embed → embeddings 能力
    //   rerank → rerank 能力
    const hasRunTask = typeof llm.runTask === 'function';
    const hasEmbed = typeof llm.embed === 'function';
    const hasRerank = typeof llm.rerank === 'function';

    const stateOf = (cap: LLMCapability): CapabilityState => {
        switch (cap) {
            case 'chat':
            case 'json':
                return hasRunTask ? 'available' : 'missing';
            case 'embeddings':
                return hasEmbed ? 'available' : 'missing';
            case 'rerank':
                return hasRerank ? 'available' : 'missing';
            default:
                return 'missing';
        }
    };

    return REQUIRED_CAPABILITIES.map((cap): CapabilityStatus => ({
        capability: cap,
        state: stateOf(cap),
    }));
}

function computeDiagnosis(
    mounted: boolean,
    registered: boolean,
    aiModeEnabled: boolean,
    capabilities: CapabilityStatus[],
): { level: LlmHubDiagnosisLevel; text: string } {
    if (!mounted) {
        return { level: 'not_detected', text: '未检测到 LLMHub 实例。' };
    }
    if (!registered) {
        return { level: 'mounted_not_registered', text: 'LLMHub 已挂载，但 MemoryOS consumer 尚未注册。' };
    }
    if (!aiModeEnabled) {
        return { level: 'ai_mode_disabled', text: 'AI 模式已关闭；LLMHub 已连接，但 MemoryOS 当前不会发起 AI 任务。' };
    }
    const missing = capabilities.filter((c) => c.state === 'missing');
    if (missing.length > 0) {
        const names = missing.map((c) => c.capability).join('、');
        return { level: 'online_partial_capabilities', text: `LLMHub 在线但缺少能力：${names}。` };
    }
    return { level: 'fully_operational', text: '能力完整，可正常运行。' };
}

/**
 * 功能：生成不可用状态下的占位路由预览。
 * @param taskKind 能力大类。
 * @param requiredCapabilities 该路由所需能力。
 * @param blockedReason 当前不可用原因。
 * @returns 占位路由预览对象。
 */
function buildBlockedRoutePreview(
    taskKind: CapabilityKind,
    requiredCapabilities: LLMCapability[],
    blockedReason: string,
): RoutePreviewSnapshot {
    return {
        consumer: 'stx_memory_os',
        taskKind,
        requiredCapabilities,
        available: false,
        blockedReason,
    };
}

/**
 * 功能：根据三类路由预览更新每项测试的可运行状态。
 * @returns 无返回值。
 */
function syncTaskRoutesFromOverview(): void {
    const generationRoute = _routeOverview.generation;
    const embeddingRoute = _routeOverview.embedding;
    const rerankRoute = _routeOverview.rerank;

    _taskRoutes['memory.summarize'] = {
        taskId: 'memory.summarize',
        taskKind: 'generation',
        available: generationRoute?.available === true,
        blockedReason: generationRoute?.blockedReason,
        route: generationRoute,
    };
    _taskRoutes['memory.coldstart.summarize'] = {
        taskId: 'memory.coldstart.summarize',
        taskKind: 'generation',
        available: generationRoute?.available === true,
        blockedReason: generationRoute?.blockedReason,
        route: generationRoute,
    };
    _taskRoutes['memory.extract'] = {
        taskId: 'memory.extract',
        taskKind: 'generation',
        available: generationRoute?.available === true,
        blockedReason: generationRoute?.blockedReason,
        route: generationRoute,
    };
    _taskRoutes['world.template.build'] = {
        taskId: 'world.template.build',
        taskKind: 'generation',
        available: generationRoute?.available === true,
        blockedReason: generationRoute?.blockedReason,
        route: generationRoute,
    };
    _taskRoutes['memory.vector.embed'] = {
        taskId: 'memory.vector.embed',
        taskKind: 'embedding',
        available: embeddingRoute?.available === true,
        blockedReason: embeddingRoute?.blockedReason,
        route: embeddingRoute,
    };
    _taskRoutes['memory.search.rerank'] = {
        taskId: 'memory.search.rerank',
        taskKind: 'rerank',
        available: rerankRoute?.available === true,
        blockedReason: rerankRoute?.blockedReason,
        route: rerankRoute,
    };
}

/**
 * 功能：刷新 MemoryOS 当前可见的三类路由预览。
 * @returns 刷新后的健康快照。
 */
export async function refreshHealthSnapshot(): Promise<MemoryAiHealthSnapshot> {
    const llm = (window as any).STX?.llm as LLMSDK | undefined;
    const capabilities = detectCapabilities();
    const { text } = computeDiagnosis(_llmHubMounted, _consumerRegistered, _aiModeEnabled, capabilities);

    if (!llm?.inspect?.previewRoute || !_llmHubMounted || !_consumerRegistered || !_aiModeEnabled) {
        _routeOverview = {
            generation: buildBlockedRoutePreview('generation', ['chat', 'json'], text),
            embedding: buildBlockedRoutePreview('embedding', ['embeddings'], text),
            rerank: buildBlockedRoutePreview('rerank', ['rerank'], text),
        };
        syncTaskRoutesFromOverview();
        notifyListeners();
        return getHealthSnapshot();
    }

    _routeOverview = {
        generation: await llm.inspect.previewRoute({
            consumer: 'stx_memory_os',
            taskKind: 'generation',
            requiredCapabilities: ['chat', 'json'],
        }),
        embedding: await llm.inspect.previewRoute({
            consumer: 'stx_memory_os',
            taskKind: 'embedding',
            requiredCapabilities: ['embeddings'],
        }),
        rerank: await llm.inspect.previewRoute({
            consumer: 'stx_memory_os',
            taskKind: 'rerank',
            requiredCapabilities: ['rerank'],
        }),
    };
    syncTaskRoutesFromOverview();
    notifyListeners();
    return getHealthSnapshot();
}

// ── 公共写入接口（仅限 MemoryOS 内部模块调用） ──

/** 更新 LLMHub 挂载状态 */
export function setLlmHubMounted(mounted: boolean): void {
    if (_llmHubMounted === mounted) return;
    _llmHubMounted = mounted;
    notifyListeners();
    void refreshHealthSnapshot();
}

/** 更新 consumer 注册状态 */
export function setConsumerRegistered(registered: boolean): void {
    if (_consumerRegistered === registered) return;
    _consumerRegistered = registered;
    notifyListeners();
    void refreshHealthSnapshot();
}

/** 更新 AI 模式开关状态 */
export function setAiModeEnabled(enabled: boolean): void {
    if (_aiModeEnabled === enabled) return;
    _aiModeEnabled = enabled;
    notifyListeners();
    void refreshHealthSnapshot();
}

/** 标记某任务开始运行 */
export function markTaskRunning(taskId: MemoryAiTaskId): void {
    const status = _taskStatuses[taskId];
    if (status) {
        status.state = 'running';
        notifyListeners();
    }
}

/** 记录任务执行完毕（成功或失败） */
export function recordTaskResult(record: MemoryAiTaskRecord): void {
    const status = _taskStatuses[record.taskId];
    if (status) {
        status.state = record.ok ? 'success' : 'failed';
        status.lastRecord = record;
    }

    _recentRecords.unshift(record);
    if (_recentRecords.length > MAX_RECENT_RECORDS) {
        _recentRecords.length = MAX_RECENT_RECORDS;
    }

    notifyListeners();
}

// ── 公共只读接口 ──

/** 获取当前健康快照 */
export function getHealthSnapshot(): MemoryAiHealthSnapshot {
    const capabilities = detectCapabilities();
    const { level, text } = computeDiagnosis(_llmHubMounted, _consumerRegistered, _aiModeEnabled, capabilities);

    return {
        ts: Date.now(),
        llmHubMounted: _llmHubMounted,
        consumerRegistered: _consumerRegistered,
        capabilities,
        aiModeEnabled: _aiModeEnabled,
        diagnosisLevel: level,
        diagnosisText: text,
        tasks: { ...(_taskStatuses as Record<MemoryAiTaskId, MemoryAiTaskStatus>) },
        routeOverview: {
            generation: _routeOverview.generation ? { ..._routeOverview.generation } : null,
            embedding: _routeOverview.embedding ? { ..._routeOverview.embedding } : null,
            rerank: _routeOverview.rerank ? { ..._routeOverview.rerank } : null,
        },
        taskRoutes: { ...(_taskRoutes as Record<MemoryAiTaskId, MemoryAiTaskRouteStatus>) },
        recentRecords: [..._recentRecords],
    };
}

/** 判断当前是否具备执行 AI 任务的条件 */
export function isAiOperational(): boolean {
    return _llmHubMounted && _consumerRegistered && _aiModeEnabled;
}

/** 判断特定能力是否可用 */
export function isCapabilityAvailable(cap: LLMCapability): boolean {
    const capabilities = detectCapabilities();
    return capabilities.some((c) => c.capability === cap && c.state === 'available');
}

/** 获取某任务的最新状态 */
export function getTaskStatus(taskId: MemoryAiTaskId): MemoryAiTaskStatus | null {
    return _taskStatuses[taskId] ?? null;
}

/** 获取某项测试当前的路由状态 */
export function getTaskRouteStatus(taskId: MemoryAiTaskId): MemoryAiTaskRouteStatus | null {
    return _taskRoutes[taskId] ?? null;
}

// ── 订阅 ──

/** 订阅健康状态变化，返回取消订阅函数 */
export function onHealthChange(listener: HealthChangeListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
}
