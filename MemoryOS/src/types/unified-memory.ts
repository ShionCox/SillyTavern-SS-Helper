import type { MemoryDebugLogRecord } from '../core/debug/memory-retrieval-logger';
import type { RetrievalContextRoute, RetrievalDiagnostics, RetrievalRulePackMode } from '../memory-retrieval/types';
import type { RetrievalMode } from '../memory-retrieval/retrieval-mode';
import type { RetentionStage } from '../memory-retention/retention-types';

export type MemoryEntryCategory =
    | '世界基础'
    | '国家'
    | '城市'
    | '地点'
    | '组织'
    | '事件'
    | '角色关系'
    | '任务'
    | '物品'
    | '其他'
    | string;

export type MemoryFieldKind =
    | 'text'
    | 'textarea'
    | 'number'
    | 'boolean'
    | 'date'
    | 'tags';

export interface MemoryEntryTypeField {
    key: string;
    label: string;
    kind: MemoryFieldKind;
    placeholder?: string;
    required?: boolean;
}

export interface MemoryEntryType {
    typeId: string;
    chatKey: string;
    key: string;
    label: string;
    category: MemoryEntryCategory;
    description: string;
    fields: MemoryEntryTypeField[];
    injectToSystem: boolean;
    bindableToRole: boolean;
    builtIn: boolean;
    icon?: string;
    accentColor?: string;
    createdAt: number;
    updatedAt: number;
}

export interface MemoryEntry {
    entryId: string;
    chatKey: string;
    title: string;
    entryType: string;
    category: MemoryEntryCategory;
    tags: string[];
    summary: string;
    detail: string;
    detailSchemaVersion: number;
    detailPayload: Record<string, unknown>;
    sourceSummaryIds: string[];
    createdAt: number;
    updatedAt: number;
}

export interface MemoryEntryFieldDiff {
    path: string;
    label: string;
    before: unknown;
    after: unknown;
}

export interface MemoryEntryAuditRecord {
    auditId: string;
    chatKey: string;
    summaryId?: string;
    entryId: string;
    entryTitle: string;
    entryType: string;
    actionType: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    sourceLabel?: string;
    beforeEntry: MemoryEntry | null;
    afterEntry: MemoryEntry | null;
    changedFields: MemoryEntryFieldDiff[];
    reasonCodes: string[];
    ts: number;
}

export interface ActorMemoryProfile {
    actorKey: string;
    chatKey: string;
    displayName: string;
    memoryStat: number;
    createdAt: number;
    updatedAt: number;
}

export type ActorDisplayNameSource =
    | 'manual'
    | 'bootstrap'
    | 'takeover_actor_card'
    | 'takeover_relation'
    | 'summary_hint'
    | 'fallback';

export interface EnsureActorProfileInput {
    actorKey: string;
    displayName?: string;
    memoryStat?: number;
    displayNameSource?: ActorDisplayNameSource;
}

export interface RoleEntryMemory {
    roleMemoryId: string;
    chatKey: string;
    actorKey: string;
    entryId: string;
    memoryPercent: number;
    lastRefreshSummaryId?: string;
    lastDecaySummaryId?: string;
    lastMentionSummaryId?: string;
    forgotten: boolean;
    forgottenAt?: number;
    updatedAt: number;
}

export interface MemoryRelationshipRecord {
    relationshipId: string;
    chatKey: string;
    sourceActorKey: string;
    targetActorKey: string;
    relationTag: string;
    state: string;
    summary: string;
    trust: number;
    affection: number;
    tension: number;
    participants: string[];
    createdAt: number;
    updatedAt: number;
}

export interface SummaryEntryUpsert {
    entryId?: string;
    title: string;
    entryType: string;
    category?: MemoryEntryCategory;
    tags?: string[];
    summary: string;
    detail?: string;
    detailPayload?: Record<string, unknown>;
    actionType?: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE';
    reasonCodes?: string[];
    sourceLabel?: string;
}

export interface SummaryRefreshBinding {
    actorKey: string;
    entryId?: string;
    entryTitle?: string;
}

/**
 * 功能：定义统一结构化绑定载荷。
 */
export interface StructuredBindings {
    actors: string[];
    organizations: string[];
    cities: string[];
    locations: string[];
    nations: string[];
    tasks: string[];
    events: string[];
}

/**
 * 功能：定义绑定解析命中模式。
 */
export type BindingMatchMode =
    | 'entity_key'
    | 'compare_key'
    | 'match_key'
    | 'alias_exact'
    | 'batch_reuse'
    | 'rule_inferred'
    | 'unresolved';

/**
 * 功能：定义单条绑定解析决策。
 */
export interface BindingResolutionDecision {
    bindingKey: keyof StructuredBindings;
    rawValue: string;
    resolvedRef?: string;
    resolvedLabel?: string;
    matchMode: BindingMatchMode;
    sourceKind: 'explicit' | 'fallback' | 'rule';
}

/**
 * 功能：定义绑定解析结果。
 */
export interface ResolvedBindings {
    bindings: StructuredBindings;
    decisions: BindingResolutionDecision[];
    resolvedCount: number;
    unresolvedCount: number;
    fallbackCount: number;
}

export type LedgerMutationAction = 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE' | 'NOOP';

export type LedgerMutationSource = 'summary' | 'cold_start' | 'takeover' | 'manual_edit';

export interface LedgerMutation {
    targetKind: string;
    action: LedgerMutationAction;
    title: string;
    entryId?: string;
    entityKey?: string;
    compareKey?: string;
    matchKeys?: string[];
    summary?: string;
    detail?: string;
    detailPayload?: Record<string, unknown>;
    tags?: string[];
    actorBindings?: string[];
    bindings?: Partial<StructuredBindings>;
    reasonCodes?: string[];
    sourceContext?: Record<string, unknown>;
}

export interface LedgerMutationBatchContext {
    chatKey: string;
    source: LedgerMutationSource;
    sourceLabel: string;
    summaryId?: string;
    takeoverId?: string;
    bootstrapRunId?: string;
    manualEditorId?: string;
    userDisplayName?: string;
    allowCreate?: boolean;
    allowInvalidate?: boolean;
}

export type LedgerMutationMatchMode = 'exact_match' | 'near_match' | 'created' | 'skipped';

export interface LedgerMutationBatchCounts {
    input: number;
    add: number;
    update: number;
    merge: number;
    invalidate: number;
    delete: number;
    noop: number;
}

export interface LedgerMutationBatchDecision {
    targetKind: string;
    action: LedgerMutationAction;
    title: string;
    matchMode: LedgerMutationMatchMode;
    entryId?: string;
    entityKey?: string;
    compareKey?: string;
    reasonCodes: string[];
}

export interface LedgerMutationAffectedRecord {
    entryId: string;
    entityKey?: string;
    compareKey?: string;
    action: Exclude<LedgerMutationAction, 'NOOP'>;
}

export interface LedgerMutationBindingResult {
    actorKey: string;
    entryId: string;
    written: boolean;
}

/**
 * 功能：定义结构化绑定解析结果。
 */
export interface LedgerMutationResolvedBindingResult {
    title: string;
    targetKind: string;
    resolvedBindings: StructuredBindings;
    decisions: BindingResolutionDecision[];
    resolvedCount: number;
    unresolvedCount: number;
    fallbackCount: number;
}

export interface LedgerMutationAuditResult {
    entryId: string;
    action: Exclude<LedgerMutationAction, 'NOOP'>;
    written: boolean;
}

export interface ApplyLedgerMutationBatchResult {
    createdEntryIds: string[];
    updatedEntryIds: string[];
    invalidatedEntryIds: string[];
    deletedEntryIds: string[];
    noopCount: number;
    counts: LedgerMutationBatchCounts;
    decisions: LedgerMutationBatchDecision[];
    affectedRecords: LedgerMutationAffectedRecord[];
    bindingResults: LedgerMutationBindingResult[];
    resolvedBindingResults: LedgerMutationResolvedBindingResult[];
    auditResults: LedgerMutationAuditResult[];
    historyWritten: boolean;
}

export interface SummarySnapshot {
    summaryId: string;
    chatKey: string;
    title: string;
    content: string;
    normalizedSummary?: {
        stableContext: string;
        taskState: string[];
        relationState: string[];
        unresolvedQuestions: string[];
    };
    actorKeys: string[];
    entryUpserts: SummaryEntryUpsert[];
    refreshBindings: SummaryRefreshBinding[];
    mutationApplyDiagnostics?: ApplyLedgerMutationBatchResult;
    createdAt: number;
    updatedAt: number;
}

export interface MemoryMutationHistoryRecord {
    historyId: string;
    chatKey: string;
    action: string;
    payload: Record<string, unknown>;
    ts: number;
}

export interface WorldProfileBinding {
    chatKey: string;
    primaryProfile: string;
    secondaryProfiles: string[];
    confidence: number;
    reasonCodes: string[];
    detectedFrom: string[];
    sourceHash: string;
    createdAt: number;
    updatedAt: number;
}

export interface PromptAssemblyRoleEntry {
    actorKey: string;
    actorLabel: string;
    entryId: string;
    title: string;
    entryType: string;
    memoryPercent: number;
    forgotten: boolean;
    renderedText: string;
    retentionStage: RetentionStage;
    retentionReasonCodes: string[];
    renderMode: 'clear' | 'blur' | 'distorted' | 'hidden';
    distortionTemplateId?: string;
    bindings?: StructuredBindings;
    bindingDiagnostics?: {
        resolvedCount: number;
        unresolvedCount: number;
        fallbackCount: number;
    };
}

export interface PromptAssemblyDiagnostics {
    providerId: string;
    retrievalMode?: RetrievalMode;
    rulePackMode: RetrievalRulePackMode;
    contextRoute: RetrievalContextRoute | null;
    retrieval: RetrievalDiagnostics | Record<string, unknown> | null;
    traceRecords: MemoryDebugLogRecord[];
    injectionActorKey: string;
    injectedCount: number;
    estimatedChars: number;
    retentionStageCounts: Record<RetentionStage, number>;
    matchModeCounts?: Record<string, number>;
    compareKeySchemaVersion?: string;
    bindingMatchModeCounts?: Record<string, number>;
}

export interface PromptAssemblySnapshot {
    generatedAt: number;
    query: string;
    matchedActorKeys: string[];
    matchedEntryIds: string[];
    systemText: string;
    roleText: string;
    finalText: string;
    systemEntryIds: string[];
    roleEntries: PromptAssemblyRoleEntry[];
    reasonCodes: string[];
    diagnostics?: PromptAssemblyDiagnostics;
}

export interface UnifiedMemoryFilters {
    query?: string;
    category?: string;
    entryType?: string;
    rememberedByActorKey?: string;
    injectToSystemOnly?: boolean;
}

export const DEFAULT_ACTOR_MEMORY_STAT = 60;

export const CORE_MEMORY_ENTRY_TYPES: Array<{
    key: string;
    label: string;
    category: MemoryEntryCategory;
    description: string;
    injectToSystem: boolean;
    bindableToRole: boolean;
    fields: MemoryEntryTypeField[];
    icon: string;
    accentColor: string;
}> = [
    {
        key: 'world_core_setting',
        label: '世界核心设定',
        category: '世界基础',
        description: '长期成立的世界设定与事实框架。',
        injectToSystem: true,
        bindableToRole: false,
        icon: 'fa-solid fa-landmark-dome',
        accentColor: '#b58a52',
        fields: [
            { key: 'scope', label: '作用域', kind: 'text' },
            { key: 'impact', label: '影响范围', kind: 'textarea' },
        ],
    },
    {
        key: 'world_hard_rule',
        label: '世界硬规则',
        category: '世界基础',
        description: '制度、禁令与法则等稳定硬约束。',
        injectToSystem: true,
        bindableToRole: false,
        icon: 'fa-solid fa-gavel',
        accentColor: '#9e6b3a',
        fields: [
            { key: 'scope', label: '作用域', kind: 'text' },
            { key: 'enforcement', label: '执行方式', kind: 'textarea' },
        ],
    },
    {
        key: 'world_global_state',
        label: '世界全局状态',
        category: '世界基础',
        description: '某一时期的世界现实状态，可被新状态替换。',
        injectToSystem: true,
        bindableToRole: false,
        icon: 'fa-solid fa-earth-asia',
        accentColor: '#8a7d4f',
        fields: [
            { key: 'scope', label: '作用域', kind: 'text' },
            { key: 'state', label: '状态', kind: 'textarea' },
            { key: 'supersededBy', label: '替代状态', kind: 'text' },
        ],
    },
    {
        key: 'scene_shared_state',
        label: '场景共享状态',
        category: '地点',
        description: '当前场景中所有角色共享可见的信息。',
        injectToSystem: true,
        bindableToRole: false,
        icon: 'fa-solid fa-map-location-dot',
        accentColor: '#5e7b68',
        fields: [
            { key: 'location', label: '地点', kind: 'text' },
            { key: 'visibilityScope', label: '可见范围', kind: 'text' },
            { key: 'participants', label: '参与者', kind: 'tags' },
        ],
    },
    {
        key: 'actor_visible_event',
        label: '角色可见事件',
        category: '事件',
        description: '角色视角下明确可见的事件。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-eye',
        accentColor: '#8e5741',
        fields: [
            { key: 'participants', label: '参与者', kind: 'tags' },
            { key: 'location', label: '地点', kind: 'text' },
            { key: 'outcome', label: '结果', kind: 'textarea' },
        ],
    },
    {
        key: 'actor_private_interpretation',
        label: '角色主观理解',
        category: '其他',
        description: '角色的猜测、误解、偏见与主观解读。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-brain',
        accentColor: '#7b5f9e',
        fields: [
            { key: 'sourceEventId', label: '来源事件', kind: 'text' },
            { key: 'bias', label: '偏向', kind: 'textarea' },
            { key: 'certainty', label: '确信度', kind: 'number' },
        ],
    },
    {
        key: 'world_hard_rule_legacy',
        label: '世界规则',
        category: '世界基础',
        description: '长期稳定存在的世界规则、魔法法则与硬约束。',
        injectToSystem: true,
        bindableToRole: false,
        icon: 'fa-solid fa-landmark-dome',
        accentColor: '#b58a52',
        fields: [
            { key: 'constraint', label: '核心规则', kind: 'textarea', required: true },
            { key: 'impact', label: '影响范围', kind: 'text' },
        ],
    },
    {
        key: 'nation',
        label: '国家',
        category: '国家',
        description: '国家、王朝或大型政治实体。',
        injectToSystem: true,
        bindableToRole: true,
        icon: 'fa-solid fa-flag',
        accentColor: '#5d8aa8',
        fields: [
            { key: 'region', label: '所属区域', kind: 'text' },
            { key: 'traits', label: '核心特征', kind: 'textarea' },
        ],
    },
    {
        key: 'city',
        label: '城市',
        category: '城市',
        description: '城市、都城或聚落。',
        injectToSystem: true,
        bindableToRole: true,
        icon: 'fa-solid fa-city',
        accentColor: '#477998',
        fields: [
            { key: 'nation', label: '所属国家', kind: 'text' },
            { key: 'region', label: '所属区域', kind: 'text' },
            { key: 'traits', label: '城市特征', kind: 'textarea' },
            { key: 'status', label: '当前状态', kind: 'textarea' },
        ],
    },
    {
        key: 'location',
        label: '地点',
        category: '地点',
        description: '具体地点、区域、建筑或据点。',
        injectToSystem: true,
        bindableToRole: true,
        icon: 'fa-solid fa-location-dot',
        accentColor: '#4e6e5d',
        fields: [
            { key: 'city', label: '所属城市', kind: 'text' },
            { key: 'dangerLevel', label: '危险度', kind: 'number' },
            { key: 'function', label: '地点功能', kind: 'textarea' },
            { key: 'entryCondition', label: '进入条件', kind: 'textarea' },
        ],
    },
    {
        key: 'organization',
        label: '组织',
        category: '组织',
        description: '公会、教团、学院、势力或秘密组织。',
        injectToSystem: true,
        bindableToRole: true,
        icon: 'fa-solid fa-people-group',
        accentColor: '#6b7f3a',
        fields: [
            { key: 'alignment', label: '立场', kind: 'text' },
            { key: 'influence', label: '影响力', kind: 'textarea' },
        ],
    },
    {
        key: 'event',
        label: '事件',
        category: '事件',
        description: '已经发生或正在推进的重要事件。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-burst',
        accentColor: '#bb5a3c',
        fields: [
            { key: 'time', label: '发生时间', kind: 'text' },
            { key: 'participants', label: '参与方', kind: 'tags' },
            { key: 'result', label: '结果', kind: 'textarea' },
            { key: 'impact', label: '后续影响', kind: 'textarea' },
        ],
    },
    {
        key: 'item',
        label: '物品',
        category: '物品',
        description: '重要道具、神器、资源或装备。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-cube',
        accentColor: '#8661c1',
        fields: [
            { key: 'owner', label: '所属者', kind: 'text' },
            { key: 'ability', label: '能力说明', kind: 'textarea' },
        ],
    },
    {
        key: 'task',
        label: '任务',
        category: '任务',
        description: '支线、主线、委托或目标。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-list-check',
        accentColor: '#d17941',
        fields: [
            { key: 'objective', label: '目标', kind: 'textarea' },
            { key: 'status', label: '当前状态', kind: 'text' },
        ],
    },
    {
        key: 'other',
        label: '其他',
        category: '其他',
        description: '暂时无法归类，但仍应保留的条目。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-ellipsis',
        accentColor: '#7f8c8d',
        fields: [
            { key: 'notes', label: '补充说明', kind: 'textarea' },
        ],
    },
];
