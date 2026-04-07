import { escapeHtml } from '../editorShared';
import type {
    ActorMemoryProfile,
    MemoryEntry,
    MemoryEntryAuditRecord,
    MemoryEntryType,
    MemoryTakeoverProgressSnapshot,
    MemoryEntryTypeField,
    MemoryMutationHistoryRecord,
    PromptAssemblySnapshot,
    RoleEntryMemory,
    SummarySnapshot,
    MemoryTakeoverPreviewEstimate,
    WorldProfileBinding,
} from '../../types';
import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';
import { listRelationTagPresets } from '../../constants/relationTags';
import type { MemoryGraphMode } from './shared/memoryGraphTypes';
import { sanitizeWorkbenchDisplayText } from './shared/workbench-text';
import type { DBMemoryVectorDocument, DBMemoryVectorIndex, DBMemoryVectorRecallStat } from '../../types/vector-document';
import type { RetrievalResultItem } from '../../memory-retrieval/types';
import type { RetrievalOutputDiagnostics } from '../../memory-retrieval/retrieval-output';
import type { ContentPreviewSourceMode, RawFloorRecord } from '../../memory-takeover/content-block-pipeline';
import type { DreamMaintenanceProposalRecord, DreamQualityReport, DreamSchedulerStateRecord, DreamSessionRecord } from '../../services/dream-types';
import type { DreamUiStateSnapshot } from '../dream-ui-state-service';

export type WorkbenchView = 'entries' | 'types' | 'actors' | 'world-entities' | 'preview' | 'memory-graph' | 'takeover' | 'vectors' | 'content-lab' | 'dream';
export type ActorSubView = 'attributes' | 'memory' | 'items' | 'relationships';
export type WorkbenchGraphLinkType = 'ally' | 'enemy' | 'neutral' | 'family' | 'romance';

export interface WorkbenchRecallExplanation {
    generatedAt?: number;
    query?: string;
    matchedActorKeys: string[];
    matchedEntryIds: string[];
    reasonCodes: string[];
    source?: string;
    retrievalProviderId?: string;
    finalProviderId?: string;
    seedProviderId?: string;
    retrievalRulePack?: string;
    compareKeySchemaVersion?: string;
    subQueries?: string[];
    matchModeCounts?: Record<string, number>;
    vectorHitCount?: number;
    mergeUsed?: boolean;
    rerankUsed?: boolean;
    rerankSource?: string;
    strategyDecision?: {
        route?: string;
        candidateWindow?: number;
        finalTopK?: number;
        rerankEnabled?: boolean;
        reasonCodes?: string[];
    } | null;
    matchedRules?: Array<{
        pack: string;
        label: string;
        matchedText: string[];
    }>;
    routeReasons?: string[];
    semanticCounts?: Record<string, number>;
    forgettingCounts?: Record<string, number>;
    shadowTriggeredCount?: number;
    worldProfileId?: string;
    worldProfileDisplayName?: string;
    worldBindingMode?: 'auto' | 'manual';
    worldEffectSummary?: string[];
    traceRecords?: Array<{
        ts: number;
        level: string;
        stage: string;
        title: string;
        message: string;
    }>;
}

export interface WorkbenchActorGraphNode {
    id: string;
    label: string;
    memoryStat: number;
    x: number;
    y: number;
    relationCount: number;
    kind?: 'actor' | 'entity';
}

export interface WorkbenchActorGraphLink {
    id: string;
    source: string;
    target: string;
    entryId: string;
    label: string;
    summary: string;
    type: WorkbenchGraphLinkType;
    updatedAt: number;
}

export interface WorkbenchActorGraph {
    nodes: WorkbenchActorGraphNode[];
    links: WorkbenchActorGraphLink[];
}

export interface WorkbenchVectorRuntimeStatus {
    runtimeReady: boolean;
    embeddingAvailable: boolean;
    embeddingUnavailableReason?: string;
    vectorStoreAvailable: boolean;
    vectorStoreUnavailableReason?: string;
    retrievalMode: string;
    embeddingModel?: string;
    embeddingVersion?: string;
    vectorEnableStrategyRouting?: boolean;
    vectorEnableRerank?: boolean;
    vectorEnableLLMHubRerank?: boolean;
}

export interface WorkbenchVectorSnapshot extends WorkbenchVectorRuntimeStatus {
    loaded: boolean;
    documentCount: number;
    readyCount: number;
    pendingCount: number;
    failedCount: number;
    indexCount: number;
    recallStatCount: number;
    documents: DBMemoryVectorDocument[];
    indexRecords: DBMemoryVectorIndex[];
    recallStats: DBMemoryVectorRecallStat[];
}

export interface WorkbenchVectorTestResult {
    generatedAt: number;
    query: string;
    retrievalMode: 'lexical_only' | 'vector_only' | 'hybrid';
    providerId: string;
    diagnostics: RetrievalOutputDiagnostics;
    items: RetrievalResultItem[];
}

/**
 * 功能：定义向量召回测试的当前进度提示。
 */
export interface WorkbenchVectorTestProgress {
    stage: string;
    title: string;
    message: string;
    progress?: number;
}

export interface WorkbenchWorldProfileTestResult {
    primaryProfile: string;
    secondaryProfiles: string[];
    confidence: number;
    reasonCodes: string[];
    matchedKeywords: string[];
    conflictKeywords: string[];
    sourceTypes: string[];
    mixedProfileCandidate?: string;
    preferredSchemas: string[];
    preferredFacets: string[];
    suppressedTypes: string[];
    fieldExtensions: Record<string, string[]>;
}

export interface WorkbenchState {
    currentView: WorkbenchView;
    currentActorTab: ActorSubView;
    selectedEntryId: string;
    selectedTypeKey: string;
    selectedActorKey: string;
    entryQuery: string;
    previewQuery: string;
    previewTabLoaded: boolean;
    previewTabLoading: boolean;
    worldProfileTestInput: string;
    worldProfileTestRunning: boolean;
    worldProfileTestResult: WorkbenchWorldProfileTestResult | null;
    bindEntryId: string;
    actorQuery: string;
    actorSortOrder: 'name-asc' | 'name-desc' | 'stat-desc' | 'stat-asc';
    actorTagFilter: string;
    selectedGraphNodeId: string;
    selectedGraphEdgeId: string;
    memoryGraphQuery: string;
    memoryGraphFilterType: string;
    memoryGraphMode: MemoryGraphMode;
    takeoverMode: string;
    takeoverRangeStart: string;
    takeoverRangeEnd: string;
    takeoverRecentFloors: string;
    takeoverBatchSize: string;
    takeoverUseActiveSnapshot: boolean;
    takeoverActiveSnapshotFloors: string;
    takeoverPreview: MemoryTakeoverPreviewEstimate | null;
    takeoverPreviewLoading: boolean;
    takeoverPreviewExpanded: boolean;
    takeoverProgressLoading: boolean;
    takeoverActionRunning: boolean;
    vectorQuery: string;
    vectorMode: 'lexical_only' | 'vector_only' | 'hybrid';
    vectorSourceKindFilter: string;
    vectorStatusFilter: string;
    vectorSchemaFilter: string;
    vectorActorFilter: string;
    vectorTextFilter: string;
    vectorSelectedDocId: string;
    vectorRightTab: 'detail' | 'test';
    vectorEnableStrategyRoutingTest: boolean;
    vectorEnableRerankTest: boolean;
    vectorEnableLLMHubRerankTest: boolean;
    vectorEnableGraphExpansionTest: boolean;
    vectorTopKTest: string;
    vectorDeepWindowTest: string;
    vectorFinalTopKTest: string;
    vectorTabLoaded: boolean;
    vectorTabLoading: boolean;
    vectorTestRunning: boolean;
    vectorTestResult: WorkbenchVectorTestResult | null;
    vectorTestProgress: WorkbenchVectorTestProgress | null;
    contentLabStartFloor: string;
    contentLabEndFloor: string;
    contentLabSelectedFloor: string;
    contentLabPreviewSourceMode: ContentPreviewSourceMode;
    contentLabPreviewLoading: boolean;
    contentLabTabLoaded: boolean;
    contentLabTabLoading: boolean;
    contentLabBlocks: import('../../memory-takeover/content-block-classifier').ClassifiedContentBlock[];
    contentLabPrimaryPreview: string;
    contentLabHintPreview: string;
    contentLabExcludedPreview: string;
    contentLabUnknownTagDefaultKind: string;
    contentLabUnknownTagAllowHint: boolean;
    contentLabEnableRuleClassifier: boolean;
    contentLabEnableMetaKeywordDetection: boolean;
    contentLabEnableToolArtifactDetection: boolean;
    contentLabEnableAIClassifier: boolean;
    contentLabEditingRuleIndex: number;
    dreamSubView: 'overview' | 'workbench';
    dreamWorkbenchTab: 'session' | 'diagnostics' | 'maintenance' | 'applied' | 'rollback';
    /** 时间模式过滤 */
    entryTimeFilter: 'all' | 'story_explicit' | 'story_inferred' | 'sequence_fallback' | 'no_time';
    /** 条目排序方式 */
    entrySortOrder: 'updated-desc' | 'updated-asc' | 'floor-desc' | 'floor-asc' | 'confidence-desc';
}

export interface WorkbenchSnapshot {
    entryTypes: MemoryEntryType[];
    entries: MemoryEntry[];
    actors: ActorMemoryProfile[];
    roleMemories: RoleEntryMemory[];
    summaries: SummarySnapshot[];
    preview: PromptAssemblySnapshot | null;
    worldProfileBinding: WorldProfileBinding | null;
    mutationHistory: MemoryMutationHistoryRecord[];
    entryAuditRecords: MemoryEntryAuditRecord[];
    recallExplanation: WorkbenchRecallExplanation | null;
    actorGraph: WorkbenchActorGraph;
    memoryGraph: import('./shared/memoryGraphTypes').WorkbenchMemoryGraph;
    takeoverProgress: MemoryTakeoverProgressSnapshot | null;
    vectorSnapshot: WorkbenchVectorSnapshot;
    contentLabSnapshot: {
        loaded: boolean;
        tagRegistry: import('../../config/content-tag-registry').ContentBlockPolicy[];
        availableFloors: Array<{ floor: number; role: string; charCount: number }>;
        previewFloor?: RawFloorRecord;
    };
    dreamSnapshot: {
        sessions: DreamSessionRecord[];
        maintenanceProposals: DreamMaintenanceProposalRecord[];
        qualityReports: DreamQualityReport[];
        schedulerState: DreamSchedulerStateRecord | null;
        uiState: DreamUiStateSnapshot | null;
    };
}

/**
 * 功能：判断当前角色是否为用户角色。
 * @param actorKey 角色键。
 * @returns 是否为用户角色。
 */
export function isUserActorKey(actorKey: string | null | undefined): boolean {
    return String(actorKey ?? '').trim().toLowerCase() === 'user';
}

/**
 * 功能：转义 HTML 属性值。
 * @param value 原始值。
 * @returns 可安全写入属性的文本。
 */
export function escapeAttr(value: unknown): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * 功能：读取输入控件的字符串值。
 * @param root 根节点。
 * @param selector 选择器。
 * @returns 去首尾空白后的文本。
 */
export function readInputValue(root: HTMLElement, selector: string): string {
    const element = root.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    return String(element?.value ?? '').trim();
}

/**
 * 功能：读取复选框状态。
 * @param root 根节点。
 * @param selector 选择器。
 * @returns 是否勾选。
 */
export function readCheckedValue(root: HTMLElement, selector: string): boolean {
    const element = root.querySelector(selector) as HTMLInputElement | null;
    return element?.checked === true;
}

/**
 * 功能：把标签输入文本拆解为字符串数组。
 * @param value 原始文本。
 * @returns 去重后的标签列表。
 */
export function parseTagText(value: string): string[] {
    return Array.from(new Set(
        String(value ?? '')
            .split(/[,，\n]+/)
            .map((item: string): string => item.trim())
            .filter(Boolean),
    ));
}

/**
 * 功能：解析条目类型字段定义 JSON。
 * @param raw 原始 JSON 文本。
 * @returns 字段定义列表。
 */
export function parseTypeFieldsJson(raw: string): MemoryEntryTypeField[] {
    const normalized = String(raw ?? '').trim();
    if (!normalized) {
        return [];
    }
    const parsed = JSON.parse(normalized);
    if (!Array.isArray(parsed)) {
        throw new Error('字段定义必须是数组。');
    }
    return parsed.map((item: unknown): MemoryEntryTypeField => {
        const record = (item && typeof item === 'object') ? item as Record<string, unknown> : {};
        return {
            key: String(record.key ?? '').trim(),
            label: String(record.label ?? record.key ?? '').trim(),
            kind: String(record.kind ?? 'text').trim() as MemoryEntryTypeField['kind'],
            placeholder: String(record.placeholder ?? '').trim() || undefined,
            required: record.required === true,
        };
    }).filter((item: MemoryEntryTypeField): boolean => Boolean(item.key));
}

/**
 * 功能：从动态字段控件收集结构化 payload。
 * @param root 表单根节点。
 * @returns 结构化 payload。
 */
export function collectDetailPayload(root: HTMLElement): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    root.querySelectorAll<HTMLElement>('[data-entry-field-key]').forEach((element: HTMLElement): void => {
        const fieldKey = String(element.dataset.entryFieldKey ?? '').trim();
        const fieldPath = String(element.dataset.entryFieldPath ?? fieldKey).trim();
        if (!fieldKey) {
            return;
        }
        if (element instanceof HTMLInputElement && element.type === 'checkbox') {
            setDetailPayloadValue(payload, fieldPath, element.checked);
            return;
        }
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
            const rawValue = String(element.value ?? '').trim();
            if (!rawValue) {
                return;
            }
            if (element.dataset.entryFieldKind === 'number') {
                setDetailPayloadValue(payload, fieldPath, Number(rawValue));
                return;
            }
            if (element.dataset.entryFieldKind === 'tags') {
                setDetailPayloadValue(payload, fieldPath, parseTagText(rawValue));
                return;
            }
            setDetailPayloadValue(payload, fieldPath, rawValue);
        }
    });
    return payload;
}

/**
 * 功能：合并工作台编辑产生的 detailPayload，保留已有的嵌套字段。
 * @param base 原始 detailPayload。
 * @param patch 编辑后收集到的 detailPayload。
 * @returns 合并后的 detailPayload。
 */
export function mergeWorkbenchDetailPayload(
    base: Record<string, unknown> | undefined,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const source = toRecord(base);
    const result: Record<string, unknown> = { ...source };
    for (const [key, value] of Object.entries(toRecord(patch))) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            result[key] = mergeWorkbenchDetailPayload(toRecord(source[key]), toRecord(value));
            continue;
        }
        result[key] = value;
    }
    return result;
}

/**
 * 功能：把字段定义列表格式化为 JSON 文本。
 * @param fields 字段定义列表。
 * @returns 便于编辑的 JSON 字符串。
 */
export function formatTypeFieldsJson(fields: MemoryEntryTypeField[]): string {
    return JSON.stringify(fields ?? [], null, 2);
}

/**
 * 功能：生成百分比进度样式。
 * @param percent 百分比。
 * @returns 内联样式文本。
 */
export function buildMeterStyle(percent: number): string {
    const safe = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    return `width:${safe}%;`;
}

/**
 * 功能：创建新条目的默认草稿。
 * @param entryType 当前类型。
 * @returns 草稿对象。
 */
export function createDraftEntry(entryType?: MemoryEntryType | null): Partial<MemoryEntry> {
    return {
        entryType: entryType?.key || 'other',
        category: entryType?.category || '其他',
        tags: [],
        summary: '',
        detail: '',
        detailPayload: {},
    };
}

/**
 * 功能：解析当前选中的条目。
 * @param snapshot 快照。
 * @param state 当前状态。
 * @returns 条目或空值。
 */
export function resolveSelectedEntry(snapshot: WorkbenchSnapshot, state: WorkbenchState): MemoryEntry | null {
    return snapshot.entries.find((entry: MemoryEntry): boolean => entry.entryId === state.selectedEntryId) ?? null;
}

/**
 * 功能：解析当前选中的类型。
 * @param snapshot 快照。
 * @param state 当前状态。
 * @returns 类型或空值。
 */
export function resolveSelectedType(snapshot: WorkbenchSnapshot, state: WorkbenchState): MemoryEntryType | null {
    return snapshot.entryTypes.find((item: MemoryEntryType): boolean => item.key === state.selectedTypeKey) ?? null;
}

/**
 * 功能：解析当前选中的角色。
 * @param snapshot 快照。
 * @param state 当前状态。
 * @returns 角色或空值。
 */
export function resolveSelectedActor(snapshot: WorkbenchSnapshot, state: WorkbenchState): ActorMemoryProfile | null {
    return snapshot.actors.find((item: ActorMemoryProfile): boolean => item.actorKey === state.selectedActorKey) ?? null;
}

/**
 * 功能：根据类型定义构建动态字段表单。
 * @param selectedEntryType 选中的条目类型。
 * @param detailPayload 结构化 payload。
 * @returns 动态字段 HTML。
 */
export function buildDynamicFieldMarkup(
    selectedEntryType: MemoryEntryType | null,
    detailPayload: Record<string, unknown> | undefined,
): string {
    return (selectedEntryType?.fields ?? []).map((field: MemoryEntryTypeField): string => {
        const fieldPath = resolveWorkbenchFieldPath(selectedEntryType, field);
        const fieldValue = resolveWorkbenchFieldValue(detailPayload, fieldPath, field.key);
        if (selectedEntryType?.key === 'relationship' && field.key === 'relationTag') {
            return buildRelationTagSelectMarkup(field, fieldPath, fieldValue);
        }
        if (field.kind === 'textarea') {
            return `
                <div class="stx-memory-workbench__field-stack">
                    <label>${escapeHtml(field.label)}</label>
                    <textarea class="stx-memory-workbench__textarea" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-path="${escapeAttr(fieldPath)}" data-entry-field-kind="${escapeAttr(field.kind)}" placeholder="${escapeAttr(field.placeholder ?? '')}">${escapeHtml(fieldValue ?? '')}</textarea>
                </div>
            `;
        }
        if (field.kind === 'boolean') {
            return `
                <div class="stx-memory-workbench__field-stack">
                    <label>${escapeHtml(field.label)}</label>
                    <div class="stx-memory-workbench__checkbox-row" style="margin-top:4px;">
                        ${buildSharedBoxCheckbox({
                            id: `stx-memory-entry-bool-${escapeAttr(field.key)}`,
                            appearance: 'check',
                            inputAttributes: {
                                'data-entry-field-key': field.key,
                                'data-entry-field-path': fieldPath,
                                'data-entry-field-kind': field.kind,
                                checked: fieldValue === true,
                            },
                        })}
                        <label for="stx-memory-entry-bool-${escapeAttr(field.key)}">${escapeHtml(field.placeholder ?? '启用')}</label>
                    </div>
                </div>
            `;
        }
        return `
            <div class="stx-memory-workbench__field">
                <label>${escapeHtml(field.label)}</label>
                <input class="stx-memory-workbench__input" type="${field.kind === 'number' ? 'number' : field.kind === 'date' ? 'date' : 'text'}" value="${escapeAttr(Array.isArray(fieldValue) ? fieldValue.join(', ') : fieldValue ?? '')}" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-path="${escapeAttr(fieldPath)}" data-entry-field-kind="${escapeAttr(field.kind)}" placeholder="${escapeAttr(field.placeholder ?? '')}">
            </div>
        `;
    }).join('');
}

/**
 * 功能：解析工作台字段的 detailPayload 存储路径。
 * @param selectedEntryType 当前条目类型。
 * @param field 字段定义。
 * @returns 字段存储路径。
 */
function resolveWorkbenchFieldPath(selectedEntryType: MemoryEntryType | null, field: MemoryEntryTypeField): string {
    if (selectedEntryType?.key === 'relationship' && field.key === 'relationTag') {
        return 'fields.relationTag';
    }
    return field.key;
}

/**
 * 功能：读取工作台字段当前值。
 * @param detailPayload 结构化 payload。
 * @param fieldPath 字段路径。
 * @param fieldKey 字段键名。
 * @returns 当前字段值。
 */
function resolveWorkbenchFieldValue(
    detailPayload: Record<string, unknown> | undefined,
    fieldPath: string,
    fieldKey: string,
): unknown {
    const payload = toRecord(detailPayload);
    const pathValue = readRecordPath(payload, fieldPath);
    if (pathValue !== undefined) {
        return pathValue;
    }
    return payload[fieldKey];
}

/**
 * 功能：构建关系 TAG 的预设下拉框。
 * @param field 字段定义。
 * @param fieldPath 字段路径。
 * @param fieldValue 当前值。
 * @returns 下拉框 HTML。
 */
function buildRelationTagSelectMarkup(field: MemoryEntryTypeField, fieldPath: string, fieldValue: unknown): string {
    const currentValue = String(fieldValue ?? '').trim();
    const optionsHtml = [
        '<option value="">请选择关系标签</option>',
        ...listRelationTagPresets().map((tag: string): string => {
            const selected = currentValue === tag ? ' selected' : '';
            return `<option value="${escapeAttr(tag)}"${selected}>${escapeHtml(tag)}</option>`;
        }),
    ].join('');
    return `
        <div class="stx-memory-workbench__field">
            <label>${escapeHtml(field.label)}</label>
            <select class="stx-memory-workbench__select" data-entry-field-key="${escapeAttr(field.key)}" data-entry-field-path="${escapeAttr(fieldPath)}" data-entry-field-kind="text">
                ${optionsHtml}
            </select>
        </div>
    `;
}

/**
 * 功能：把时间戳格式化为中文时间。
 * @param value 原始时间值。
 * @returns 格式化结果。
 */
export function formatTimestamp(value: unknown): string {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return '暂无';
    }
    return new Date(Math.trunc(numericValue)).toLocaleString('zh-CN');
}

/**
 * 功能：把未知值格式化为可读文本。
 * @param value 原始值。
 * @returns 展示文本。
 */
export function formatDisplayValue(value: unknown): string {
    if (value === null || value === undefined) {
        return '暂无';
    }
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : '暂无';
    }
    if (Array.isArray(value)) {
        const items = value
            .map((item: unknown): string => sanitizeWorkbenchDisplayText(item))
            .filter(Boolean);
        return items.length > 0 ? items.join('、') : '暂无';
    }
    if (typeof value === 'object') {
        const keys = Object.keys(toRecord(value));
        return keys.length > 0 ? stringifyData(value) : '暂无';
    }
    const normalized = sanitizeWorkbenchDisplayText(value);
    return normalized || '暂无';
}

/**
 * 功能：生成紧凑的 detailPayload 摘要。
 * @param detailPayload 结构化 payload。
 * @returns 摘要文本。
 */
import { resolveEntryIdentifierLabel } from '../workbenchLocale';

const KEY_LOCALE_MAP: Record<string, string> = {
    sourceActorKey: '源属角色',
    targetActorKey: '目标角色',
    relationTag: '关系标签',
    participants: '参与者',
    state: '关系现状',
    affection: '亲近度',
    trust: '信任度',
    tension: '紧张度',
    milestones: '关键节点',
    identityFacts: '身份事实',
    originFacts: '起源事实',
    traits: '特征',
    aliases: '别名',
    scope: '作用范围',
    impact: '影响',
    unresolvedConflict: '未解冲突',
    location: '地点',
    visibilityScope: '可见度',
    outcome: '结果'
};

export function summarizeDetailPayload(detailPayload: Record<string, unknown> | undefined): string {
    const payload = toRecord(detailPayload);
    const keys = Object.keys(payload);
    if (keys.length <= 0) {
        return '无结构化事实';
    }
    const summary = keys.slice(0, 4).map((key: string): string => {
        const value = payload[key];
        const translatedKey = KEY_LOCALE_MAP[key] || resolveEntryIdentifierLabel(key);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            const childKeys = Object.keys(toRecord(value));
            return `${translatedKey}: ${childKeys.length > 0 ? childKeys.slice(0, 3).join('、') : '对象'}`;
        }
        return `${translatedKey}: ${truncateText(formatDisplayValue(value), 18)}`;
    }).join('；');
    return keys.length > 4 ? `${summary} 等 ${keys.length} 项` : summary;
}

/**
 * 功能：把数据格式化为 JSON 字符串。
 * @param value 原始值。
 * @returns JSON 文本。
 */
export function stringifyData(value: unknown): string {
    try {
        return JSON.stringify(value ?? {}, null, 2);
    } catch {
        return '{}';
    }
}

/**
 * 功能：按路径读取对象值。
 * @param record 对象。
 * @param path 点分路径。
 * @returns 读取结果。
 */
export function readRecordPath(record: Record<string, unknown>, path: string): unknown {
    const segments = String(path ?? '').split('.').map((segment: string): string => segment.trim()).filter(Boolean);
    let current: unknown = record;
    for (const segment of segments) {
        if (!current || typeof current !== 'object' || Array.isArray(current)) {
            return undefined;
        }
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

/**
 * 功能：截断过长文本。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 截断后的文本。
 */
export function truncateText(value: string, maxLength: number = 72): string {
    const normalized = sanitizeWorkbenchDisplayText(value);
    if (!normalized) {
        return '';
    }
    return normalized.length > maxLength ? `${normalized.slice(0, Math.max(8, maxLength - 1))}…` : normalized;
}

/**
 * 功能：归一化对象。
 * @param value 原始值。
 * @returns 安全对象。
 */
export function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：归一化字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
export function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
}

/**
 * 功能：按点路径写入 detailPayload。
 * @param target 目标 payload。
 * @param path 字段路径。
 * @param value 待写入的值。
 * @returns 无返回值。
 */
function setDetailPayloadValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const segments = String(path ?? '').split('.').map((segment: string): string => segment.trim()).filter(Boolean);
    if (segments.length <= 0) {
        return;
    }
    let cursor: Record<string, unknown> = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const key = segments[index];
        const next = cursor[key];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
            cursor[key] = {};
        }
        cursor = cursor[key] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]] = value;
}
