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

export interface ActorMemoryProfile {
    actorKey: string;
    chatKey: string;
    displayName: string;
    memoryStat: number;
    createdAt: number;
    updatedAt: number;
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

export interface SummaryEntryUpsert {
    entryId?: string;
    title: string;
    entryType: string;
    category?: MemoryEntryCategory;
    tags?: string[];
    summary: string;
    detail?: string;
    detailPayload?: Record<string, unknown>;
}

export interface SummaryRefreshBinding {
    actorKey: string;
    entryId?: string;
    entryTitle?: string;
}

export interface SummarySnapshot {
    summaryId: string;
    chatKey: string;
    title: string;
    content: string;
    actorKeys: string[];
    entryUpserts: SummaryEntryUpsert[];
    refreshBindings: SummaryRefreshBinding[];
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
        key: 'world_rule',
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
        key: 'relationship',
        label: '关系',
        category: '角色关系',
        description: '角色之间的关系、立场与情感走向。',
        injectToSystem: false,
        bindableToRole: true,
        icon: 'fa-solid fa-link',
        accentColor: '#c04b7f',
        fields: [
            { key: 'participants', label: '参与角色', kind: 'tags' },
            { key: 'state', label: '关系现状', kind: 'textarea' },
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
