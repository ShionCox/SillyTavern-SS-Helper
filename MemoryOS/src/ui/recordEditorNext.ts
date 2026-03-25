import { db, clearAllMemoryData, clearMemoryChatData, patchSdkChatShared } from '../db/db';
import type { DBMeta } from '../db/db';
import { logger, toast } from '../index';
import { openSharedDialog } from '../../../_Components/sharedDialog';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { renderSharedWorldStateSectionTable as renderWorldStateSectionTable, type SharedWorldStateSectionColumn as WorldStateSectionColumn, type SharedWorldStateSectionTypeTab as WorldStateSectionTypeTab } from '../../../_Components/sharedWorldStateSectionTable';
import { mountThemeHost, initThemeKernel } from '../../../SDK/theme';
import WORLD_INFO_HERO_ICON_URL from '../../../assets/images/icon/woridifo.png';
import { AuditManager } from '../core/audit-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { MemorySDKImpl } from '../sdk/memory-sdk';
import { escapeHtml, formatSourceKindLabel, formatSourceRefMeta, formatTimeLabel, normalizeLookup, parseLooseValue } from './editorShared';
import {
    activateMemoryChatSidebarItem,
    getCurrentMemoryChatKey,
    loadMemoryChatSidebarItems,
    renderMemoryChatSidebarList,
} from './recordEditorChatList';
import {
    buildWorldStateSectionTypeState,
    filterWorldStateEntriesByType,
    shouldShowWorldStateSectionTypeTabs,
    type WorldStateSectionTypeBucket,
} from './worldStateSectionClassifier';
import {
    RECORD_EDITOR_RAW_TAB_META,
    RECORD_EDITOR_VIEW_META,
    renderMemoryPage,
} from './recordEditor/pages';
import type {
    RawTableName,
    RecordEditorOpenOptions,
            PendingRawFocus,
    ViewMode,
    VisibleRawTableName,
} from './recordEditor/types';
import { buildRecallUiSummary, extractForeignPrivateSuppressedItems } from './recallUiSummary';
import { VectorMemoryViewerController, type VectorMemoryViewerSourceJumpTarget } from './vectorMemoryViewer';
import type {
    DerivedRowCandidate,
    EditorExperienceSnapshot,
    EditorHealthSnapshot,
    LogicRowView,
    LogicTableStatus,
    LogicTableSummary,
    LogicTableViewModel,
    MemoryActorRetentionMap,
    MemoryActorRetentionState,
    MemoryLifecycleState,
    OwnedMemoryState,
    PersonaMemoryProfile,
    SourceRef,
    SnapshotValue,
} from '../../../SDK/stx';
import type { StructuredWorldStateEntry } from '../types';

interface PendingRawUpdate {
    id: string;
    tableName: RawTableName;
    payload: unknown;
}

interface CurrentSort {
    col: string;
    asc: boolean;
}

interface WorldStateSectionCategoryShortcutItem {
    sectionKey: string;
    sectionTitle: string;
    typeKey: string;
    typeLabel: string;
    count: number;
}

interface WorldStateSectionCategoryViewModel {
    activeTypeKey: string;
    currentTypeLabel: string;
    totalTypeCount: number;
    visibleTypeCount: number;
    typeTabs: WorldStateSectionTypeTab[];
}

type RawRecord = Record<string, unknown>;

const WORLD_STATE_INTERNAL_AGGREGATE_PATH_PREFIXES: string[] = [
    '/semantic/world/locations',
    '/semantic/world/entities',
    '/semantic/meta/groupmembers',
    '/semantic/world/overview',
];

function buildTipAttr(text: string): string {
    const normalized = String(text ?? '').trim();
    return normalized ? ` data-tip="${escapeHtml(normalized)}"` : '';
}

function formatWorldStateAnchorSummary(entry: StructuredWorldStateEntry): string {
    const parts = [
        entry.node.subjectId ? `主体：${entry.node.subjectId}` : '',
        entry.node.regionId ? `区域：${entry.node.regionId}` : '',
        entry.node.cityId ? `城市：${entry.node.cityId}` : '',
        entry.node.locationId ? `地点：${entry.node.locationId}` : '',
        entry.node.itemId ? `物品：${entry.node.itemId}` : '',
    ].filter(Boolean);
    return parts.join(' · ') || '未绑定额外锚点';
}

interface WorldQuestBoardRow {
    rowKey: string;
    title: string;
    kind: string;
    summary: string;
    objective: string;
    relatedActors: string[];
    ownerActorKeys?: string[];
    sourceKind?: 'scene_snapshot' | 'memory_state' | 'world_state';
    sourceKinds?: Array<'scene_snapshot' | 'memory_state' | 'world_state'>;
    sourceRefs?: SourceRef[];
    recordKey?: string;
    statePath?: string;
    stateKey?: string;
    priorityLabel?: string;
    sourceLabel: string;
    statusLabel: string;
    updatedAt: number;
}

interface WorldMacroCardViewModel {
    title: string;
    iconClass: string;
    tip: string;
    className?: string;
    bodyHtml: string;
}

function getWorldStateRawObject(entry: StructuredWorldStateEntry): Record<string, unknown> {
    if (entry.rawValue && typeof entry.rawValue === 'object' && !Array.isArray(entry.rawValue)) {
        return entry.rawValue as Record<string, unknown>;
    }
    return {};
}

/**
 * 功能：把记忆索引中的重大剧情事件转换成统一 world_state 事件条目。
 * @param ownedStates 记忆索引状态列表。
 * @param actorLabelMap 角色标签映射。
 * @returns 可直接并入世界状态分区的重大事件条目。
 */
function buildMajorEventWorldStateEntries(
    ownedStates: OwnedMemoryState[],
    actorLabelMap: Map<string, string>,
): StructuredWorldStateEntry[] {
    return ownedStates
        .filter((item: OwnedMemoryState): boolean => item.memorySubtype === 'major_plot_event' && item.forgotten !== true)
        .sort((left: OwnedMemoryState, right: OwnedMemoryState): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
        .slice(0, 24)
        .map((item: OwnedMemoryState, index: number): StructuredWorldStateEntry => {
            const ownerActorKey = String(item.ownerActorKey ?? '').trim();
            const ownerLabel = ownerActorKey ? (actorLabelMap.get(ownerActorKey) || ownerActorKey) : '世界 / 未归属';
            const title = normalizeQuestText(buildMemoryRecordHeadline(item.recordKey, undefined, item)) || `重大事件 ${index + 1}`;
            const impact = normalizeQuestText(formatMemoryImpactSummary(item));
            const summary = [impact, `归属：${ownerLabel}`].filter(Boolean).join('；') || '重大事件';
            const updatedAt = Number(item.updatedAt ?? Date.now()) || Date.now();
            const stateKey = `memory-event:${item.recordKey || `major-${index + 1}`}`;
            const rawValue: Record<string, unknown> = {
                title,
                summary,
                scopeType: ownerActorKey ? 'character' : 'global',
                stateType: 'event',
                subjectId: ownerActorKey || undefined,
                sourceRefs: [`memory_state:${item.recordKey}`],
                updatedAt,
            };
            return {
                stateKey,
                path: `/semantic/events/memory-${encodeURIComponent(String(item.recordKey || `major-${index + 1}`))}`,
                rawValue,
                node: {
                    title,
                    summary,
                    scopeType: ownerActorKey ? 'character' : 'global',
                    stateType: 'event',
                    subjectId: ownerActorKey || undefined,
                    keywords: [ownerLabel, '重大事件'].filter((text: string): boolean => Boolean(normalizeQuestText(text))),
                    tags: ['major_plot_event', 'memory_state'],
                    sourceRefs: [`memory_state:${item.recordKey}`],
                    confidence: 0.72,
                    updatedAt,
                },
                updatedAt,
            };
        });
}

function hasExplicitWorldStateKeywords(entry: StructuredWorldStateEntry): boolean {
    const raw = getWorldStateRawObject(entry);
    return Array.isArray(raw.keywords) && raw.keywords.some((item: unknown): boolean => Boolean(String(item ?? '').trim()));
}

function pickWorldStateText(source: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
        const value = source[key];
        const text = String(value ?? '').trim();
        if (text) {
            return text;
        }
    }
    return '';
}

function pickWorldStateValue(source: Record<string, unknown>, keys: string[]): unknown {
    for (const key of keys) {
        const value = source[key];
        if (value == null) {
            continue;
        }
        if (typeof value === 'string' && !value.trim()) {
            continue;
        }
        if (Array.isArray(value) && value.length <= 0) {
            continue;
        }
        return value;
    }
    return undefined;
}

function pickWorldStateTextList(source: Record<string, unknown>, keys: string[]): string[] {
    const values = keys.flatMap((key: string): string[] => {
        const raw = source[key];
        if (Array.isArray(raw)) {
            return raw.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
        }
        const text = String(raw ?? '').trim();
        if (!text) {
            return [];
        }
        return text.split(/[、,，/｜|\n]+/).map((item: string): string => item.trim()).filter(Boolean);
    });
    return Array.from(new Set(values));
}

function extractWorldStateListItems(entry: StructuredWorldStateEntry, preferredKeys: string[] = []): string[] {
    const raw = getWorldStateRawObject(entry);
    const directKeys = preferredKeys.length > 0
        ? preferredKeys
        : ['items', 'entries', 'rules', 'constraints', 'points', 'bullets', 'list', 'content'];
    const keyedItems = pickWorldStateTextList(raw, directKeys);
    if (keyedItems.length > 0) {
        return keyedItems;
    }
    if (Array.isArray(entry.rawValue)) {
        return entry.rawValue.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
    }
    const summary = String(entry.node.summary ?? '').trim();
    if (!summary) {
        return [];
    }
    if ((summary.startsWith('[') && summary.endsWith(']')) || (summary.startsWith('{') && summary.endsWith('}'))) {
        try {
            const parsed = JSON.parse(summary);
            if (Array.isArray(parsed)) {
                return parsed.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean);
            }
        } catch {
            // ignore
        }
    }
    return summary
        .split(/[；;\n]+/)
        .map((item: string): string => item.replace(/^[-•·\d.\s]+/, '').trim())
        .filter((item: string): boolean => item.length >= 2)
        .slice(0, 8);
}

/**
 * 功能：从国家与政体描述中提取可展示的国家名称。
 * @param value 原始文本。
 * @returns 提取出的国家名；无法确认时返回空字符串。
 */
function extractWorldStateNationLabel(value: unknown): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }
    const candidates = Array.from(
        normalized.matchAll(/([A-Za-z0-9\u4e00-\u9fa5·]{2,20}(?:王朝|帝国|王国|联邦|共和国|公国|汗国|联盟|国))/g),
    ).map((item: RegExpMatchArray): string => String(item[1] ?? '').trim());
    const invalidPattern = /社会|结构|制度|政治|经济|军事|婚姻|女子|男子|为尊|为附|开国|盛世|架空|古代|现代|治理|权力|主导|继承|女娶男嫁/;
    for (const candidate of candidates) {
        if (!candidate || invalidPattern.test(candidate) || candidate.length > 16) {
            continue;
        }
        return candidate;
    }
    return '';
}

/**
 * 功能：从区域、城市、地点描述中提取简短名称。
 * @param value 原始文本。
 * @returns 提取出的名称；无法确认时返回空字符串。
 */
function extractWorldStateNamedLead(value: unknown): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }
    const lead = normalized
        .split(/[：:，,；;。!！?？\n]/)[0]
        .trim()
        .split(/\s*[-—]\s*/)[0]
        .trim();
    const invalidPattern = /政治|经济|军事|制度|结构|领域|主导权|所有领域/;
    if (!lead || lead.length > 16 || invalidPattern.test(lead)) {
        return '';
    }
    return lead;
}

/**
 * 功能：解析世界状态条目的国家显示名。
 * @param entry 世界状态条目。
 * @returns 可展示的国家名称；无法确认时返回空字符串。
 */
/**
 * 功能：解析世界状态的知识级别字段。
 * @param value 原始值。
 * @returns 规范化知识级别，无法识别时返回空串。
 */
function parseWorldStateKnowledgeLevel(value: unknown): 'confirmed' | 'rumor' | 'inferred' | '' {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'confirmed' || normalized === 'rumor' || normalized === 'inferred') {
        return normalized;
    }
    return '';
}

/**
 * 功能：根据知识级别格式化父级标签显示。
 * @param label 基础标签。
 * @param knowledgeLevel 知识级别。
 * @returns 带“传闻/推测”前缀的显示标签。
 */
function resolveWorldStateKnowledgeAwareLabel(label: string, knowledgeLevel: unknown): string {
    const normalizedLabel = String(label ?? '').trim();
    if (!normalizedLabel) {
        return '';
    }
    const level = parseWorldStateKnowledgeLevel(knowledgeLevel);
    if (level === 'rumor') {
        return `传闻：${normalizedLabel}`;
    }
    if (level === 'inferred') {
        return `推测：${normalizedLabel}`;
    }
    return normalizedLabel;
}

/**
 * 功能：格式化知识级别文案。
 * @param knowledgeLevel 知识级别原始值。
 * @returns 面向 UI 的知识级别文案。
 */
function formatWorldStateKnowledgeLevelLabel(knowledgeLevel: unknown): string {
    const level = parseWorldStateKnowledgeLevel(knowledgeLevel);
    if (level === 'confirmed') {
        return '明确';
    }
    if (level === 'rumor') {
        return '传闻';
    }
    if (level === 'inferred') {
        return '推测';
    }
    return '未标注';
}

function resolveWorldStateNationLabel(entry: StructuredWorldStateEntry, options?: { strictParent?: boolean }): string {
    const raw = getWorldStateRawObject(entry);
    const strictParent = options?.strictParent === true;
    const baseLabel = (
        extractWorldStateNationLabel(raw.nationName)
        || extractWorldStateNationLabel(raw.nation)
        || extractWorldStateNationLabel(raw.country)
        || extractWorldStateNationLabel(raw.kingdom)
        || extractWorldStateNationLabel(raw.empire)
        || extractWorldStateNationLabel(raw.polity)
        || extractWorldStateNationLabel(entry.node.nationId)
    );
    if (strictParent) {
        return resolveWorldStateKnowledgeAwareLabel(
            baseLabel,
            raw.nationKnowledgeLevel ?? raw.knowledgeLevel ?? entry.node.nationKnowledgeLevel ?? entry.node.knowledgeLevel,
        );
    }
    return (
        baseLabel
        || extractWorldStateNationLabel(entry.node.title)
        || extractWorldStateNationLabel(entry.node.summary)
    );
}

/**
 * 功能：解析世界状态条目的区域显示名。
 * @param entry 世界状态条目。
 * @returns 可展示的区域名称；无法确认时返回空字符串。
 */
function resolveWorldStateRegionLabel(entry: StructuredWorldStateEntry, options?: { strictParent?: boolean }): string {
    const raw = getWorldStateRawObject(entry);
    const strictParent = options?.strictParent === true;
    const baseLabel = (
        extractWorldStateNamedLead(raw.regionName)
        || extractWorldStateNamedLead(raw.region)
        || extractWorldStateNamedLead(raw.area)
        || extractWorldStateNamedLead(entry.node.regionId)
    );
    if (strictParent) {
        return resolveWorldStateKnowledgeAwareLabel(
            baseLabel,
            raw.regionKnowledgeLevel ?? raw.knowledgeLevel ?? entry.node.regionKnowledgeLevel ?? entry.node.knowledgeLevel,
        );
    }
    return (
        baseLabel
        || extractWorldStateNamedLead(entry.node.title)
        || extractWorldStateNamedLead(entry.node.summary)
    );
}

/**
 * 功能：解析世界状态条目的城市显示名。
 * @param entry 世界状态条目。
 * @returns 可展示的城市名称；无法确认时返回空字符串。
 */
function resolveWorldStateCityLabel(entry: StructuredWorldStateEntry, options?: { strictParent?: boolean }): string {
    const raw = getWorldStateRawObject(entry);
    const strictParent = options?.strictParent === true;
    const baseLabel = (
        extractWorldStateNamedLead(raw.cityName)
        || extractWorldStateNamedLead(raw.city)
        || extractWorldStateNamedLead(entry.node.cityId)
    );
    if (strictParent) {
        return resolveWorldStateKnowledgeAwareLabel(
            baseLabel,
            raw.cityKnowledgeLevel ?? raw.knowledgeLevel ?? entry.node.cityKnowledgeLevel ?? entry.node.knowledgeLevel,
        );
    }
    return (
        baseLabel
        || extractWorldStateNamedLead(entry.node.title)
        || extractWorldStateNamedLead(entry.node.summary)
    );
}

/**
 * 功能：解析世界状态条目的地点显示名。
 * @param entry 世界状态条目。
 * @returns 可展示的地点名称；无法确认时返回空字符串。
 */
function resolveWorldStateLocationLabel(entry: StructuredWorldStateEntry): string {
    const raw = getWorldStateRawObject(entry);
    return (
        extractWorldStateNamedLead(raw.locationName)
        || extractWorldStateNamedLead(raw.location)
        || extractWorldStateNamedLead(raw.scene)
        || extractWorldStateNamedLead(entry.node.title)
        || extractWorldStateNamedLead(entry.node.summary)
        || extractWorldStateNamedLead(entry.node.locationId)
    );
}

function formatWorldStateDisplayTitle(entry: StructuredWorldStateEntry): string {
    if (entry.node.scopeType === 'nation') {
        const nationLabel = resolveWorldStateNationLabel(entry);
        if (nationLabel) {
            return nationLabel;
        }
        return '未知国家';
    }
    if (entry.node.scopeType === 'region') {
        return resolveWorldStateRegionLabel(entry) || '未知区域';
    }
    if (entry.node.scopeType === 'city') {
        return resolveWorldStateCityLabel(entry) || '未知城市';
    }
    if (entry.node.scopeType === 'location') {
        return resolveWorldStateLocationLabel(entry) || '未知地点';
    }
    const rawTitle = String(entry.node.title || '').trim();
    if (!rawTitle) {
        return buildWorldStateHeadline(entry.path);
    }
    const normalized = formatRecordEditorKeyLabel(rawTitle);
    return normalized || rawTitle;
}

function buildWorldStateLeadSummary(entry: StructuredWorldStateEntry, fallback?: string): string {
    const listItems = extractWorldStateListItems(entry);
    if (listItems.length > 0) {
        if (listItems.length === 1) {
            return listItems[0]!;
        }
        return `共 ${listItems.length} 条：${listItems.slice(0, 2).join(' / ')}`;
    }
    return String(fallback ?? entry.node.summary ?? '').trim() || '暂无说明';
}

function renderWorldStateCodexList(items: string[], emptyLabel: string = '暂无条目'): string {
    if (items.length <= 0) {
        return `<span class="stx-re-record-sub">${escapeHtml(emptyLabel)}</span>`;
    }
    return `<ol class="stx-re-world-codex-list">${items.slice(0, 6).map((item: string): string => `<li class="stx-re-world-codex-item">${escapeHtml(item)}</li>`).join('')}</ol>`;
}

function renderWorldStateKeywordGroup(entry: StructuredWorldStateEntry): string {
    const keywords = (entry.node.keywords ?? []).filter(Boolean);
    const tags = (entry.node.tags ?? []).filter(Boolean);
    const keywordSourceLabel = hasExplicitWorldStateKeywords(entry) ? '来源：结构化结果 / AI 提取' : '来源：系统自动抽词';
    return `
        <div class="stx-re-world-keyword-groups">
            <div class="stx-re-world-keyword-group">
                <div class="stx-re-world-keyword-group-label">关键词</div>
                ${renderWorldStatePillList(keywords, '暂无')}
            </div>
            <div class="stx-re-world-keyword-group">
                <div class="stx-re-world-keyword-group-label">路径标签</div>
                ${renderWorldStatePillList(tags, '暂无')}
            </div>
            <div class="stx-re-world-keyword-source">${escapeHtml(keywordSourceLabel)}</div>
        </div>
    `;
}

function renderWorldMacroCard(card: WorldMacroCardViewModel): string {
    const className = card.className ? ` ${card.className}` : '';
    return `
        <div class="stx-re-panel-card stx-re-world-macro-card${className}"${buildTipAttr(card.tip)}>
            <div class="stx-re-world-section-title"><span>${escapeHtml(card.title)}</span></div>
            <div class="stx-re-world-macro-body">${card.bodyHtml}</div>
        </div>
    `;
}

function renderWorldStatePillList(items: string[], emptyLabel: string = '暂无'): string {
    if (items.length <= 0) {
        return `<span class="stx-re-record-sub">${escapeHtml(emptyLabel)}</span>`;
    }
    return `<div class="stx-re-world-pill-list">${items.slice(0, 6).map((item: string): string => `<span class="stx-re-world-pill">${escapeHtml(item)}</span>`).join('')}</div>`;
}function renderWorldStateMiniMeta(label: string, value: string, emptyLabel: string = '暂无'): string {
    return `
        <div class="stx-re-world-meta-line">
            <span class="stx-re-world-meta-label">${escapeHtml(label)}</span>
            <span class="stx-re-world-meta-value">${escapeHtml(value || emptyLabel)}</span>
        </div>
    `;
}

function renderWorldStateCompactInfoCard(label: string, value: unknown, emptyLabel: string = '暂无'): string {
    const hasValue = value != null && (!(typeof value === 'string') || Boolean(value.trim()));
    const listItems = hasValue ? extractDisplayListItems(value) : [];
    const text = hasValue ? formatReadableValueText(value) : '';
    const contentHtml = listItems.length > 0
        ? `<div class="stx-re-world-compact-card-list">${listItems.slice(0, 6).map((item: string): string => `<div class="stx-re-world-compact-card-item">${escapeHtml(item)}</div>`).join('')}</div>`
        : `<div class="stx-re-world-compact-card-text">${escapeHtml(text && text !== '未填写' ? text : emptyLabel)}</div>`;
    return `
        <article class="stx-re-world-compact-card">
            <div class="stx-re-world-compact-card-head">
                <span class="stx-re-record-flag">${escapeHtml(label)}</span>
            </div>
            <div class="stx-re-world-compact-card-body">${contentHtml}</div>
        </article>
    `;
}

function renderWorldStateEntryPrimaryCell(
    entry: StructuredWorldStateEntry,
    subtitle: string,
    metaLines: string[],
): string {
    return `
        <div class="stx-re-record-main">
            <div class="stx-re-record-title-row">
                <div class="stx-re-record-title">${escapeHtml(formatWorldStateDisplayTitle(entry))}</div>
            </div>
            <div class="stx-re-record-sub">${escapeHtml(subtitle || entry.node.summary || '暂无说明')}</div>
            <div class="stx-re-world-meta-stack">${metaLines.join('')}</div>
            <div class="stx-re-record-code" title="${escapeHtml(entry.path)}"${buildTipAttr(`原始路径：${entry.path}`)}>内部路径：${escapeHtml(formatHumanReadableTopic(entry.path, compactInternalIdentifier(entry.path, 48)))}</div>
            <details class="stx-re-world-details">
                <summary${buildTipAttr('展开查看这条世界状态的原始值，便于核对结构化结果是否准确。')}>查看原始值</summary>
                <pre class="stx-re-json compact">${escapeHtml(renderWorldStateRawPreview(entry.rawValue))}</pre>
            </details>
        </div>
    `;
}

function renderWorldStateActorList(entry: StructuredWorldStateEntry, ownedStates: OwnedMemoryState[], actorLabelMap: Map<string, string>, emptyLabel: string = '暂无关联角色'): string {
    return renderWorldStatePillList(getWorldStateAwareActors(entry, ownedStates, actorLabelMap), emptyLabel);
}

function renderWorldStateUpdateCell(entry: StructuredWorldStateEntry): string {
    return `
        <div class="stx-re-record-sub">${escapeHtml(entry.updatedAt ? formatTimeLabel(entry.updatedAt) : '暂无')}</div>
        <div class="stx-re-record-code">置信度：${escapeHtml(entry.node.confidence != null ? formatPercent(entry.node.confidence) : '暂无')}</div>
    `;
}

const WORLD_QUEST_SOURCE_LABELS: Record<'scene_snapshot' | 'memory_state' | 'world_state', string> = {
    scene_snapshot: '场景快照',
    memory_state: '记忆索引',
    world_state: '世界状态',
};

const WORLD_QUEST_PRIORITY_RANK: Record<string, number> = {
    待处理事件: 50,
    待推进: 40,
    进行中: 35,
    已阻塞: 30,
    任务进展: 24,
};

const WORLD_QUEST_NOISE_TITLES = new Set<string>([
    'hardconstraints',
    'pendingevents',
    'participants',
    'currentconflict',
    'worldoverview',
    'overview',
    'rules',
    'locations',
    'location',
    'constraints',
]);

const WORLD_QUEST_LEGACY_PAYLOAD_PATTERN = /"?(hardconstraints|hard_constraints|rules|constraints|social_structure|description)"?\s*[:=]/i;

/**
 * 功能：统一规范任务文本，避免把占位文案当成真实任务。
 * @param value 原始文本。
 * @returns 去噪后的文本。
 */
function normalizeQuestText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：判断任务文本是否是派生占位值。
 * @param value 任务文本。
 * @returns 是否应从任务板过滤。
 */
function isQuestPlaceholderText(value: string): boolean {
    const text = normalizeQuestText(value);
    if (!text) {
        return true;
    }
    if (text === '尚未稳定抽取') {
        return true;
    }
    return /^可见消息\s*\d+\s*条$/.test(text);
}

/**
 * 功能：判断任务标题是否属于结构键噪音值（不应直接展示成任务）。
 * @param title 任务标题。
 * @returns 是否属于噪音标题。
 */
function isQuestNoiseTitle(title: string): boolean {
    const normalized = normalizeLookup(String(title ?? '').trim()).replace(/[\s_-]/g, '');
    if (!normalized) {
        return true;
    }
    return WORLD_QUEST_NOISE_TITLES.has(normalized);
}

/**
 * 功能：识别旧链路遗留的规则/约束 JSON 文本，避免污染任务板。
 * @param value 原始文本。
 * @returns 是否属于旧版污染片段。
 */
function containsLegacyQuestPayload(value: unknown): boolean {
    const normalized = normalizeQuestText(value);
    if (!normalized || !/[{}\[\]"]/.test(normalized)) {
        return false;
    }
    return WORLD_QUEST_LEGACY_PAYLOAD_PATTERN.test(normalized);
}

/**
 * 功能：判断任务文本是否包含可用内容。
 * @param text 任务文本。
 * @returns 是否可视作有效任务描述。
 */
function hasMeaningfulQuestText(text: string): boolean {
    const normalized = normalizeQuestText(text);
    if (!normalized || isQuestPlaceholderText(normalized)) {
        return false;
    }
    const compact = normalizeLookup(normalized);
    if (!compact) {
        return false;
    }
    return compact !== 'null' && compact !== 'undefined' && compact !== 'na';
}

/**
 * 功能：去重任务标签列表，避免状态列重复显示。
 * @param labels 标签列表。
 * @returns 去重后的标签列表。
 */
function dedupeQuestLabels(labels: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    labels.forEach((label: string): void => {
        const text = String(label ?? '').trim();
        const key = normalizeLookup(text);
        if (!text || !key || seen.has(key)) {
            return;
        }
        seen.add(key);
        result.push(text);
    });
    return result;
}

/**
 * 功能：按角色键或显示名反查 actorKey。
 * @param actorHint 角色线索（可能是 key，也可能是显示名）。
 * @param actorLabelMap 角色标签映射。
 * @returns 解析出的 actorKey；无法解析时返回空字符串。
 */
function resolveQuestActorKey(actorHint: string, actorLabelMap: Map<string, string>): string {
    const normalizedHint = normalizeLookup(actorHint);
    if (!normalizedHint) {
        return '';
    }
    if (actorLabelMap.has(actorHint)) {
        return actorHint;
    }
    for (const [actorKey, actorLabel] of actorLabelMap.entries()) {
        if (normalizeLookup(actorKey) === normalizedHint || normalizeLookup(actorLabel) === normalizedHint) {
            return actorKey;
        }
    }
    return '';
}

/**
 * 功能：把角色键列表去重并清理空值。
 * @param actorKeys 原始角色键列表。
 * @returns 去重后的角色键数组。
 */
function normalizeQuestActorKeys(actorKeys: Array<string | null | undefined>): string[] {
    const unique = new Set<string>();
    actorKeys.forEach((actorKey: string | null | undefined): void => {
        const normalized = String(actorKey ?? '').trim();
        if (!normalized) {
            return;
        }
        unique.add(normalized);
    });
    return Array.from(unique);
}

/**
 * 功能：把 actorKey 列表映射为展示标签。
 * @param actorKeys 角色键列表。
 * @param actorLabelMap 角色标签映射。
 * @returns 角色展示名列表。
 */
function mapQuestActorLabels(actorKeys: string[], actorLabelMap: Map<string, string>): string[] {
    return actorKeys
        .map((actorKey: string): string => actorLabelMap.get(actorKey) || actorKey)
        .filter(Boolean);
}

/**
 * 功能：从场景 participant 快照解析角色键与展示名。
 * @param participants 场景参与者快照。
 * @param actorLabelMap 角色标签映射。
 * @returns 角色键列表与展示标签列表。
 */
function resolveSceneParticipantActors(
    participants: SnapshotValue[],
    actorLabelMap: Map<string, string>,
): { actorKeys: string[]; labels: string[] } {
    const actorKeys = new Set<string>();
    const labels = new Set<string>();
    participants.forEach((item: SnapshotValue): void => {
        const rawLabel = normalizeQuestText(item.value);
        if (!rawLabel) {
            return;
        }
        const actorKey = resolveQuestActorKey(rawLabel, actorLabelMap);
        if (actorKey) {
            actorKeys.add(actorKey);
            labels.add(actorLabelMap.get(actorKey) || rawLabel);
            return;
        }
        labels.add(rawLabel);
    });
    return {
        actorKeys: Array.from(actorKeys),
        labels: Array.from(labels),
    };
}

/**
 * 功能：将来源种类映射为 SourceRef kind。
 * @param recordKind 记忆记录类型。
 * @returns SourceRef kind。
 */
function mapQuestRecordKindToSourceKind(recordKind: string): SourceRef['kind'] {
    const normalized = String(recordKind ?? '').trim().toLowerCase();
    if (normalized === 'summary') {
        return 'summary';
    }
    if (normalized === 'state') {
        return 'world_state';
    }
    return 'fact';
}

/**
 * 功能：去重合并 SourceRef。
 * @param refs 原始来源列表。
 * @returns 去重后的来源列表。
 */
function dedupeQuestSourceRefs(refs: SourceRef[]): SourceRef[] {
    const uniqueMap = new Map<string, SourceRef>();
    refs.forEach((item: SourceRef): void => {
        const key = normalizeLookup([
            item.kind,
            item.label,
            item.recordId || '',
            item.path || '',
            item.ts ?? '',
            item.note || '',
        ].join('|'));
        if (!key || uniqueMap.has(key)) {
            return;
        }
        uniqueMap.set(key, item);
    });
    return Array.from(uniqueMap.values()).sort((left: SourceRef, right: SourceRef): number => Number(right.ts ?? 0) - Number(left.ts ?? 0));
}

/**
 * 功能：判断 world_state 条目是否具备任务语义。
 * @param entry 世界状态条目。
 * @returns 是否应该进入任务进展板。
 */
function isQuestLikeWorldStateEntry(entry: StructuredWorldStateEntry): boolean {
    const stateType = String(entry.node.stateType ?? '').trim().toLowerCase();
    if (stateType !== 'task') {
        return false;
    }
    const raw = getWorldStateRawObject(entry);
    if (isQuestNoiseTitle(String(entry.node.title ?? ''))) {
        return false;
    }
    if ([
        entry.node.title,
        entry.node.summary,
        pickWorldStateText(raw, ['objective', 'completionCriteria', 'progressNote', 'nextStep', 'next']),
    ].some((text: unknown): boolean => containsLegacyQuestPayload(text))) {
        return false;
    }
    const intentText = normalizeQuestText([
        entry.node.title,
        entry.node.summary,
        pickWorldStateText(raw, ['objective', 'completionCriteria', 'progressNote', 'nextStep', 'next']),
    ].join(' / '));
    return hasMeaningfulQuestText(intentText);
}

/**
 * 功能：根据优先级标签计算排序权重。
 * @param priorityLabel 优先级标签。
 * @returns 排序分值。
 */
function getWorldQuestPriorityRank(priorityLabel: string | undefined): number {
    return WORLD_QUEST_PRIORITY_RANK[String(priorityLabel ?? '').trim()] ?? 0;
}

function formatTaskStatusLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'pending') return '待推进';
    if (normalized === 'in_progress') return '进行中';
    if (normalized === 'blocked') return '已阻塞';
    if (normalized === 'completed') return '已完成';
    return '待推进';
}

/**
 * 功能：合并任务摘要/目标文本，保留信息又避免重复。
 * @param primary 主文本。
 * @param incoming 待合并文本。
 * @returns 合并后的文本。
 */
function mergeWorldQuestText(primary: string, incoming: string): string {
    const current = normalizeQuestText(primary);
    const next = normalizeQuestText(incoming);
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    if (normalizeLookup(current) === normalizeLookup(next)) {
        return current;
    }
    return `${current} / ${next}`;
}

/**
 * 功能：按来源组合生成任务来源标签。
 * @param sourceKinds 来源种类列表。
 * @returns 展示用来源标签。
 */
function formatWorldQuestSourceLabel(sourceKinds: Array<'scene_snapshot' | 'memory_state' | 'world_state'>): string {
    if (sourceKinds.length <= 0) {
        return '未知来源';
    }
    if (sourceKinds.length === 1) {
        return WORLD_QUEST_SOURCE_LABELS[sourceKinds[0]];
    }
    return sourceKinds.map((kind: 'scene_snapshot' | 'memory_state' | 'world_state'): string => WORLD_QUEST_SOURCE_LABELS[kind]).join(' + ');
}

/**
 * 功能：选取任务行主来源类型，便于 UI 归类显示。
 * @param sourceKinds 来源种类列表。
 * @returns 主来源类型。
 */
function pickPrimaryWorldQuestSourceKind(
    sourceKinds: Array<'scene_snapshot' | 'memory_state' | 'world_state'>,
): 'scene_snapshot' | 'memory_state' | 'world_state' {
    if (sourceKinds.includes('memory_state')) {
        return 'memory_state';
    }
    if (sourceKinds.includes('world_state')) {
        return 'world_state';
    }
    return 'scene_snapshot';
}

/**
 * 功能：把任务候选行并入聚合表，按语义和标题去重并叠加来源。
 * @param rowMap 聚合表。
 * @param row 候选任务行。
 * @returns 无返回值。
 */
function mergeWorldQuestRow(rowMap: Map<string, WorldQuestBoardRow>, row: WorldQuestBoardRow): void {
    const dedupeKey = normalizeLookup([row.priorityLabel || row.kind, row.title].join('|'));
    if (!dedupeKey) {
        return;
    }
    const existing = rowMap.get(dedupeKey);
    if (!existing) {
        rowMap.set(dedupeKey, {
            ...row,
            sourceRefs: dedupeQuestSourceRefs(row.sourceRefs ?? []),
            ownerActorKeys: normalizeQuestActorKeys(row.ownerActorKeys ?? []),
            sourceKinds: Array.from(new Set(row.sourceKinds ?? [])),
        });
        return;
    }
    existing.summary = mergeWorldQuestText(existing.summary, row.summary);
    existing.objective = mergeWorldQuestText(existing.objective, row.objective);
    existing.updatedAt = Math.max(existing.updatedAt, row.updatedAt);
    existing.ownerActorKeys = normalizeQuestActorKeys([...(existing.ownerActorKeys ?? []), ...(row.ownerActorKeys ?? [])]);
    existing.relatedActors = Array.from(new Set([...existing.relatedActors, ...row.relatedActors]));
    existing.sourceKinds = Array.from(new Set([...(existing.sourceKinds ?? []), ...(row.sourceKinds ?? [])]));
    existing.sourceKind = pickPrimaryWorldQuestSourceKind(existing.sourceKinds);
    existing.sourceLabel = formatWorldQuestSourceLabel(existing.sourceKinds);
    existing.sourceRefs = dedupeQuestSourceRefs([...(existing.sourceRefs ?? []), ...(row.sourceRefs ?? [])]);
    if (!existing.recordKey && row.recordKey) {
        existing.recordKey = row.recordKey;
    }
    if (!existing.statePath && row.statePath) {
        existing.statePath = row.statePath;
    }
    if (!existing.stateKey && row.stateKey) {
        existing.stateKey = row.stateKey;
    }
    if (getWorldQuestPriorityRank(row.priorityLabel) > getWorldQuestPriorityRank(existing.priorityLabel)) {
        existing.priorityLabel = row.priorityLabel;
        existing.kind = row.kind;
        existing.statusLabel = row.statusLabel;
    }
}

/**
 * 功能：从任务行信息推断原始表跳转目标。
 * @param row 任务行。
 * @returns 可用于跳转 raw 视图的目标；无法判定时返回 null。
 */
function resolveQuestRowRawJumpTarget(row: WorldQuestBoardRow): VectorMemoryViewerSourceJumpTarget | null {
    const recordKey = String(row.recordKey ?? '').trim();
    const sourceRefs = row.sourceRefs ?? [];
    if (!recordKey) {
        return null;
    }
    const normalized = recordKey.toLowerCase();
    if (normalized.startsWith('summary:') || sourceRefs.some((sourceRef: SourceRef): boolean => sourceRef.kind === 'summary')) {
        return { tableName: 'summaries', recordId: recordKey };
    }
    if (normalized.startsWith('event:')) {
        return { tableName: 'events', recordId: recordKey };
    }
    if (sourceRefs.some((sourceRef: SourceRef): boolean => sourceRef.kind === 'world_state')) {
        return null;
    }
    return { tableName: 'facts', recordId: recordKey };
}

/**
 * 功能：按“场景快照 + 记忆索引 + 世界状态”三路构建可追踪任务板行。
 * @param experience 编辑器体验快照。
 * @param ownedStates 记忆索引状态列表。
 * @param worldEntries 结构化世界状态条目列表。
 * @param actorLabelMap 角色标签映射。
 * @returns 任务板行列表。
 */
function buildWorldQuestBoardRows(
    experience: EditorExperienceSnapshot,
    ownedStates: OwnedMemoryState[],
    worldEntries: StructuredWorldStateEntry[],
    actorLabelMap: Map<string, string>,
): WorldQuestBoardRow[] {
    const rowMap = new Map<string, WorldQuestBoardRow>();
    const pendingEvents = getStableSnapshotValues(experience.canon.scene.pendingEvents)
        .filter((item: SnapshotValue): boolean => !isSyntheticVisibleMessageSnapshot(item));
    const stableParticipants = getStableSnapshotValues(experience.canon.scene.participants);
    const participantActors = resolveSceneParticipantActors(stableParticipants, actorLabelMap);
    const participantActorKeys = participantActors.actorKeys;
    const participantLabels = participantActors.labels;
    const fallbackNow = Number(experience.canon.generatedAt ?? Date.now());
    pendingEvents.forEach((item: SnapshotValue, index: number): void => {
        const title = normalizeQuestText(item.value);
        if (!title || isQuestPlaceholderText(title) || isQuestNoiseTitle(title) || containsLegacyQuestPayload(title)) {
            return;
        }
        mergeWorldQuestRow(rowMap, {
            rowKey: `pending:${index}:${normalizeLookup(title) || 'pending'}`,
            title,
            kind: '待处理事件',
            summary: '当前场景中被挂起、待处理的事件。',
            objective: '等待触发 / 等待角色推进',
            relatedActors: participantLabels,
            ownerActorKeys: participantActorKeys,
            sourceKind: 'scene_snapshot',
            sourceKinds: ['scene_snapshot'],
            sourceRefs: dedupeQuestSourceRefs(item.sourceRefs ?? [{
                kind: 'group_memory',
                label: `scene.pending.${index + 1}`,
                ts: Number(item.updatedAt ?? fallbackNow),
                    note: '来自场景快照 pendingEvents',
                }]),
            priorityLabel: '待处理事件',
            sourceLabel: WORLD_QUEST_SOURCE_LABELS.scene_snapshot,
            statusLabel: '待处理事件',
            updatedAt: Number(item.updatedAt ?? fallbackNow),
        });
    });

    worldEntries
        .filter((entry: StructuredWorldStateEntry): boolean => isQuestLikeWorldStateEntry(entry))
        .forEach((entry: StructuredWorldStateEntry): void => {
            const raw = getWorldStateRawObject(entry);
            const title = normalizeQuestText(entry.node.title) || formatWorldStateDisplayTitle(entry);
            if (!title || isQuestPlaceholderText(title) || isQuestNoiseTitle(title)) {
                return;
            }
            const summaryText = normalizeQuestText(entry.node.summary);
            const explicitOwnerActorKey = resolveQuestActorKey(String(entry.node.subjectId ?? '').trim(), actorLabelMap)
                || resolveQuestActorKey(pickWorldStateText(raw, ['subject', 'owner', 'actor', 'character', 'ownerActorKey']), actorLabelMap);
            const ownerActorKeys = normalizeQuestActorKeys([
                explicitOwnerActorKey,
                ...(explicitOwnerActorKey ? [] : participantActorKeys),
            ]);
            const statusLabel = formatTaskStatusLabel(pickWorldStateText(raw, ['status']));
            if (statusLabel === '已完成') {
                return;
            }
            const priorityLabel = statusLabel === '待推进'
                ? '待推进'
                : statusLabel === '进行中'
                    ? '进行中'
                    : statusLabel === '已阻塞'
                        ? '已阻塞'
                        : '任务进展';
            const objectiveHint = pickWorldStateText(raw, ['objective', 'completionCriteria', 'progressNote', 'nextStep', 'next'])
                || summaryText;
            if ([title, summaryText, objectiveHint, pickWorldStateText(raw, ['description'])].some((text: unknown): boolean => containsLegacyQuestPayload(text))) {
                return;
            }
            if (isQuestNoiseTitle(title) && !hasMeaningfulQuestText(objectiveHint) && !hasMeaningfulQuestText(summaryText)) {
                return;
            }
            const objective = objectiveHint || formatWorldStateTypeLabel(entry.node.stateType);
            mergeWorldQuestRow(rowMap, {
                rowKey: `world:${entry.stateKey || entry.path || title}`,
                title,
                kind: priorityLabel,
                summary: summaryText || formatWorldStateAnchorSummary(entry),
                objective,
                relatedActors: ownerActorKeys.length > 0
                    ? mapQuestActorLabels(ownerActorKeys, actorLabelMap)
                    : participantLabels,
                ownerActorKeys,
                sourceKind: 'world_state',
                sourceKinds: ['world_state'],
                sourceRefs: dedupeQuestSourceRefs([
                    ...(Array.isArray(entry.node.sourceRefs)
                        ? entry.node.sourceRefs.map((ref: string): SourceRef => ({
                            kind: 'world_state',
                            label: ref,
                            recordId: entry.stateKey,
                            path: entry.path,
                            ts: Number(entry.updatedAt ?? fallbackNow),
                            note: `stateType=${entry.node.stateType}`,
                        }))
                        : []),
                    {
                        kind: 'world_state',
                        label: `state.${entry.node.stateType}`,
                        recordId: entry.stateKey,
                        path: entry.path,
                        ts: Number(entry.updatedAt ?? fallbackNow),
                        note: '来自结构化 world_state',
                    },
                ]),
                statePath: entry.path,
                stateKey: entry.stateKey,
                priorityLabel,
                sourceLabel: WORLD_QUEST_SOURCE_LABELS.world_state,
                statusLabel,
                updatedAt: Number(entry.updatedAt ?? fallbackNow),
            });
        });

    return Array.from(rowMap.values())
        .filter((row: WorldQuestBoardRow): boolean => {
            const normalizedTitle = normalizeQuestText(row.title);
            if (!normalizedTitle || isQuestPlaceholderText(normalizedTitle)) {
                return false;
            }
            return true;
        })
        .map((row: WorldQuestBoardRow, index: number): WorldQuestBoardRow => {
            const dedupeKey = normalizeLookup([row.priorityLabel || row.kind, row.title].join('|')) || `quest-${index + 1}`;
            const ownerActorKeys = normalizeQuestActorKeys(row.ownerActorKeys ?? []);
            const sourceKinds = Array.from(new Set(row.sourceKinds ?? []));
            return {
                ...row,
                rowKey: `quest:${dedupeKey}`,
                ownerActorKeys,
                sourceKinds,
                sourceKind: pickPrimaryWorldQuestSourceKind(sourceKinds),
                sourceLabel: formatWorldQuestSourceLabel(sourceKinds),
                relatedActors: (row.relatedActors.length > 0 ? row.relatedActors : mapQuestActorLabels(ownerActorKeys, actorLabelMap)),
                sourceRefs: dedupeQuestSourceRefs(row.sourceRefs ?? []),
            };
        })
        .sort((left: WorldQuestBoardRow, right: WorldQuestBoardRow): number => {
            const rankDiff = getWorldQuestPriorityRank(right.priorityLabel) - getWorldQuestPriorityRank(left.priorityLabel);
            if (rankDiff !== 0) {
                return rankDiff;
            }
            return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
        });
}

/**
 * 功能：提供任务进展聚合逻辑给自动化测试使用。
 * @param experience 编辑器体验快照。
 * @param ownedStates 记忆索引状态列表。
 * @param worldEntries 结构化世界状态条目列表。
 * @param actorLabelMap 角色标签映射。
 * @returns 任务板行列表。
 */
export function buildWorldQuestBoardRowsForTest(
    experience: EditorExperienceSnapshot,
    ownedStates: OwnedMemoryState[],
    worldEntries: StructuredWorldStateEntry[],
    actorLabelMap: Map<string, string>,
): WorldQuestBoardRow[] {
    return buildWorldQuestBoardRows(experience, ownedStates, worldEntries, actorLabelMap);
}

function applyWorldTableViewportLimits(root: ParentNode): void {
    root.querySelectorAll('.stx-re-world-table-wrap').forEach((node: Element): void => {
        const wrap = node as HTMLElement;
        const limit = Number(wrap.dataset.worldTableLimit ?? 0);
        const table = wrap.querySelector('.stx-re-world-table') as HTMLElement | null;
        const header = table?.querySelector('thead') as HTMLElement | null;
        const rows = Array.from(wrap.querySelectorAll('tbody tr')) as HTMLElement[];

        wrap.classList.remove('is-scrollable');
        wrap.style.removeProperty('max-height');
        wrap.style.removeProperty('overflow-y');

        if (!limit || rows.length <= limit) {
            return;
        }

        const headerHeight = Math.ceil(header?.getBoundingClientRect().height || 0);
        const visibleRows = rows.slice(0, limit);
        const rowsHeight = visibleRows.reduce((sum: number, row: HTMLElement): number => {
            return sum + Math.ceil(row.getBoundingClientRect().height || 0);
        }, 0);
        const maxHeight = headerHeight + rowsHeight + 12;
        if (maxHeight > 0) {
            wrap.classList.add('is-scrollable');
            wrap.style.maxHeight = `${maxHeight}px`;
            wrap.style.overflowY = 'auto';
        }
    });
}

function updateWorldOverviewStripState(strip: HTMLElement): void {
    const maxScrollLeft = Math.max(0, strip.scrollWidth - strip.clientWidth);
    const threshold = 6;
    const shell = strip.closest('.stx-re-world-overview-shell') as HTMLElement | null;
    strip.classList.toggle('is-scrollable', maxScrollLeft > threshold);
    strip.classList.toggle('can-scroll-left', strip.scrollLeft > threshold);
    strip.classList.toggle('can-scroll-right', strip.scrollLeft < (maxScrollLeft - threshold));
    shell?.classList.toggle('can-scroll-left', strip.scrollLeft > threshold);
    shell?.classList.toggle('can-scroll-right', strip.scrollLeft < (maxScrollLeft - threshold));
    shell?.classList.toggle('is-scrollable', maxScrollLeft > threshold);
    shell?.querySelectorAll('[data-world-strip-nav]').forEach((node: Element): void => {
        const button = node as HTMLButtonElement;
        const direction = String(button.dataset.worldStripNav ?? '').trim();
        if (direction === 'prev') {
            button.disabled = !(strip.scrollLeft > threshold);
        } else if (direction === 'next') {
            button.disabled = !(strip.scrollLeft < (maxScrollLeft - threshold));
        }
    });
}

function bindNestedVerticalScrollBridge(inner: HTMLElement, outer: HTMLElement, signal: AbortSignal): void {
    inner.addEventListener('wheel', (event: WheelEvent): void => {
        if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) {
            return;
        }
        if (inner.scrollHeight <= inner.clientHeight + 1) {
            return;
        }

        const direction = Math.sign(event.deltaY);
        if (!direction) {
            return;
        }

        const threshold = 1;
        const atTop = inner.scrollTop <= threshold;
        const atBottom = (inner.scrollTop + inner.clientHeight) >= (inner.scrollHeight - threshold);
        const shouldForward = (direction < 0 && atTop) || (direction > 0 && atBottom);
        if (!shouldForward) {
            return;
        }

        event.preventDefault();
        outer.scrollBy({ top: event.deltaY, behavior: 'auto' });
    }, { signal, passive: false });
}

type HorizontalScrollAnimationState = {
    rafId: number;
    startLeft: number;
    targetLeft: number;
    startedAt: number;
    duration: number;
    onFrame?: () => void;
};

const horizontalScrollAnimations = new WeakMap<HTMLElement, HorizontalScrollAnimationState>();

function easeInOutCubic(progress: number): number {
    if (progress <= 0) {
        return 0;
    }
    if (progress >= 1) {
        return 1;
    }
    return progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function stopAnimatedHorizontalScroll(element: HTMLElement, syncState = false): void {
    const state = horizontalScrollAnimations.get(element);
    if (!state) {
        return;
    }
    window.cancelAnimationFrame(state.rafId);
    horizontalScrollAnimations.delete(element);
    element.classList.remove('is-animating');
    if (syncState) {
        state.onFrame?.();
    }
}

function animateHorizontalScrollBy(element: HTMLElement, delta: number, options?: { duration?: number; onFrame?: () => void }): void {
    if (!delta) {
        return;
    }
    const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
    if (maxScrollLeft <= 0) {
        options?.onFrame?.();
        return;
    }

    const currentLeft = element.scrollLeft;
    const previousState = horizontalScrollAnimations.get(element);
    const baseTarget = previousState ? previousState.targetLeft : currentLeft;
    const nextTarget = Math.min(maxScrollLeft, Math.max(0, baseTarget + delta));
    const onFrame = options?.onFrame;

    if (Math.abs(nextTarget - currentLeft) < 1) {
        element.scrollLeft = nextTarget;
        element.classList.remove('is-animating');
        onFrame?.();
        return;
    }

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        stopAnimatedHorizontalScroll(element);
        element.scrollLeft = nextTarget;
        element.classList.remove('is-animating');
        onFrame?.();
        return;
    }

    if (previousState) {
        window.cancelAnimationFrame(previousState.rafId);
    }

    const state: HorizontalScrollAnimationState = {
        rafId: 0,
        startLeft: currentLeft,
        targetLeft: nextTarget,
        startedAt: performance.now(),
        duration: Math.max(140, options?.duration ?? 280),
        onFrame,
    };

    const tick = (timestamp: number): void => {
        const activeState = horizontalScrollAnimations.get(element);
        if (activeState !== state) {
            return;
        }

        const progress = Math.min(1, (timestamp - state.startedAt) / state.duration);
        const easedProgress = easeInOutCubic(progress);
        element.scrollLeft = state.startLeft + (state.targetLeft - state.startLeft) * easedProgress;
        state.onFrame?.();

        if (progress >= 1) {
            element.scrollLeft = state.targetLeft;
            state.onFrame?.();
            horizontalScrollAnimations.delete(element);
            element.classList.remove('is-animating');
            return;
        }

        state.rafId = window.requestAnimationFrame(tick);
    };

    element.classList.add('is-animating');
    horizontalScrollAnimations.set(element, state);
    state.rafId = window.requestAnimationFrame(tick);
}

function updateWorldStickyTableHeaders(root: ParentNode, scrollContainer: HTMLElement): void {
    const containerRect = scrollContainer.getBoundingClientRect();
    const stickyTop = containerRect.top + 10;
    let currentSection: Element | null = null;
    let currentSectionScore = Number.POSITIVE_INFINITY;

    root.querySelectorAll('.stx-re-world-section').forEach((node: Element): void => {
        const section = node as HTMLElement;
        const wrap = section.querySelector('.stx-re-world-table-wrap') as HTMLElement | null;
        const firstHeadCell = section.querySelector('.stx-re-world-table thead th') as HTMLElement | null;
        if (!wrap || !firstHeadCell) {
            section.style.removeProperty('--stx-world-head-offset');
            section.classList.remove('is-head-sticky');
            section.classList.remove('is-current-section');
            return;
        }

        const sectionRect = section.getBoundingClientRect();
        if (!section.dataset.worldHeaderNaturalTop) {
            const naturalTop = Math.max(0, Math.round(firstHeadCell.getBoundingClientRect().top - sectionRect.top));
            section.dataset.worldHeaderNaturalTop = String(naturalTop);
        }

        const naturalTop = Number(section.dataset.worldHeaderNaturalTop ?? 0);
        const naturalViewportTop = sectionRect.top + naturalTop;
        const headHeight = Math.ceil(firstHeadCell.getBoundingClientRect().height || 0);
        wrap.style.setProperty('--stx-world-head-height', `${headHeight}px`);
        const maxViewportTop = sectionRect.bottom - headHeight - 14;

        let offset = 0;
        if (maxViewportTop > naturalViewportTop && stickyTop > naturalViewportTop) {
            offset = Math.min(stickyTop, maxViewportTop) - naturalViewportTop;
        }

        const normalizedOffset = Math.max(0, Math.round(offset));
        section.style.setProperty('--stx-world-head-offset', `${normalizedOffset}px`);
        section.classList.toggle('is-head-sticky', normalizedOffset > 0);
        wrap.classList.toggle('is-head-sticky', normalizedOffset > 0);

        const intersectsViewport = sectionRect.bottom > (containerRect.top + 32) && sectionRect.top < (containerRect.bottom - 32);
        if (intersectsViewport) {
            const score = Math.abs((sectionRect.top + naturalTop + normalizedOffset) - stickyTop);
            if (score < currentSectionScore) {
                currentSectionScore = score;
                currentSection = section;
            }
        }
    });

    root.querySelectorAll('.stx-re-world-section.is-current-section').forEach((node: Element): void => {
        if (node !== currentSection) {
            node.classList.remove('is-current-section');
        }
    });
    root.querySelectorAll('[data-world-section-nav].is-active').forEach((node: Element): void => {
        node.classList.remove('is-active');
    });
    const currentSectionElement = currentSection as HTMLElement | null;
    if (currentSectionElement) {
        currentSectionElement.classList.add('is-current-section');
        const sectionKey = String(currentSectionElement.dataset.worldSectionKey ?? '').trim();
        if (sectionKey) {
            root.querySelector(`[data-world-section-nav="${CSS.escape(sectionKey)}"]`)?.classList.add('is-active');
        }
    }
}

function normalizeRecordTextSignature(value: unknown): string {
    return String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function readEventMessageId(record: RawRecord): string {
    const refs = (record.refs as Record<string, unknown> | undefined) || {};
    return String(refs.messageId ?? refs.sourceMessageId ?? '').trim();
}

function readEventPayloadText(record: RawRecord): string {
    const payload = (record.payload as Record<string, unknown> | undefined) || {};
    return String(payload.text ?? payload.content ?? '').trim();
}

function dedupeDisplayEvents(records: RawRecord[]): RawRecord[] {
    const kept: RawRecord[] = [];
    const seenTsByKey = new Map<string, number>();

    for (const record of records) {
        const type = String(record.type ?? '').trim();
        if (type !== 'chat.message.received' && type !== 'chat.message.sent') {
            kept.push(record);
            continue;
        }

        const messageId = readEventMessageId(record);
        const textSignature = normalizeRecordTextSignature(readEventPayloadText(record));
        const dedupeKey = messageId
            ? `${type}|id:${messageId}`
            : textSignature
                ? `${type}|text:${textSignature}`
                : '';

        if (!dedupeKey) {
            kept.push(record);
            continue;
        }

        const currentTs = Number(record.ts ?? 0);
        const previousTs = seenTsByKey.get(dedupeKey);
        const withinDuplicateWindow = previousTs != null && (
            dedupeKey.includes('|id:')
            || Math.abs(currentTs - previousTs) <= 5000
        );
        if (withinDuplicateWindow) {
            continue;
        }

        seenTsByKey.set(dedupeKey, currentTs);
        kept.push(record);
    }

    return kept;
}

/**
 * 功能：标准化消息发送方标签。
 * @param senderType 原始发送方类型
 * @returns 规范化后的标签
 */
function normalizeSenderLabel(senderType: string): '助手' | '用户' | '系统' {
    if (senderType === '系统') {
        return '系统';
    }
    if (senderType === '用户') {
        return '用户';
    }
    return '助手';
}

/**
 * 功能：把任意值转换为适合展示的字符串。
 * @param value 任意值
 * @returns 展示字符串
 */
function stringifyDisplayValue(value: unknown): string {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function extractDisplayListItems(value: unknown, depth: number = 0): string[] {
    if (depth > 2 || value === null || value === undefined) {
        return [];
    }

    const collect = (items: string[]): string[] => Array.from(new Set(items.map((item: string): string => String(item ?? '').trim()).filter(Boolean)));

    if (Array.isArray(value)) {
        return collect(value.flatMap((item: unknown): string[] => {
            const nested = extractDisplayListItems(item, depth + 1);
            if (nested.length > 0) {
                return nested;
            }
            const text = formatReadableValueText(item, depth + 1);
            return text && text !== '未填写' ? [text] : [];
        }));
    }

    if (typeof value !== 'string') {
        return [];
    }

    const trimmed = value.trim();
    if (!trimmed || !trimmed.startsWith('[') || !trimmed.endsWith(']')) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            return collect(parsed.map((item: unknown): string => formatReadableValueText(item, depth + 1)).filter((item: string): boolean => item !== '未填写'));
        }
    } catch {
        // ignore and fallback to loose split
    }

    const looseItems = trimmed.slice(1, -1)
        .split(/[、,，;；|｜/\n]+/)
        .map((item: string): string => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    return collect(looseItems);
}

function renderReadableListHtml(items: string[], emptyLabel: string = '未填写'): string {
    if (items.length <= 0) {
        return `<span class="stx-re-record-sub">${escapeHtml(emptyLabel)}</span>`;
    }
    return `<div class="stx-re-readable-list">${items.slice(0, 10).map((item: string): string => `<span class="stx-re-readable-list-item">${escapeHtml(item)}</span>`).join('')}</div>`;
}

function renderReadableValueFragmentHtml(value: unknown): string {
    const listItems = extractDisplayListItems(value);
    if (listItems.length > 0) {
        return renderReadableListHtml(listItems);
    }
    return escapeHtml(formatReadableValueText(value));
}

function formatLogicStatusLabel(status: LogicTableStatus): string {
    if (status === 'needs_attention') {
        return '需要维护';
    }
    if (status === 'sparse') {
        return '待补足';
    }
    if (status === 'hidden') {
        return '仅隐藏项';
    }
    return '状态稳定';
}

function formatLogicRowKindLabel(kind: LogicRowView['rowKind']): string {
    if (kind === 'materialized') {
        return '正式行';
    }
    if (kind === 'derived') {
        return '候选行';
    }
    if (kind === 'redirected') {
        return '重定向';
    }
    return '已隐藏';
}

function formatHealthSeverityLabel(severity: 'critical' | 'warning' | 'info'): string {
    if (severity === 'critical') {
        return '高优先级';
    }
    if (severity === 'warning') {
        return '注意';
    }
    return '提示';
}

/**
 * 功能：根据健康快照推导记录编辑器诊断主信号。
 * @param health 当前聊天的健康快照。
 * @returns 诊断中控台使用的状态文案与样式信息。
 */
function resolveRecordDiagnosticsSignalState(health: EditorHealthSnapshot): {
    toneClassName: 'is-danger' | 'is-warning' | 'is-stable';
    title: string;
    summary: string;
    badge: string;
} {
    const criticalCount = health.issues.filter((issue): boolean => issue.severity === 'critical').length;
    const warningCount = health.issues.filter((issue): boolean => issue.severity === 'warning').length;
    const orphanFactsCount = Number(health.orphanFactsCount ?? 0);
    const duplicateEntityRisk = Number(health.duplicateEntityRisk ?? 0);

    if (criticalCount > 0) {
        return {
            toneClassName: 'is-danger',
            title: '高风险链路待处理',
            summary: `当前发现 ${criticalCount} 项高优先级问题，建议先处理结构修复，再继续查看证据快照。`,
            badge: '立即处理',
        };
    }

    if (warningCount > 0 || health.hasDraftRevision || orphanFactsCount > 0 || duplicateEntityRisk >= 0.35) {
        return {
            toneClassName: 'is-warning',
            title: '存在待整理信号',
            summary: `当前有 ${warningCount} 项注意项，并伴随草稿、孤儿事实或重复实体风险，适合在这一页连续完成整理。`,
            badge: '建议整理',
        };
    }

    return {
        toneClassName: 'is-stable',
        title: '结构状态相对平稳',
        summary: '当前没有明显高风险问题，建议把重点放在角色画像、事件影响与边界压制证据上。',
        badge: '运行平稳',
    };
}

/**
 * 功能：把健康问题等级映射为诊断面板样式类名。
 * @param severity 健康问题等级。
 * @returns 样式类名。
 */
function resolveRecordDiagnosticsIssueToneClass(severity: 'critical' | 'warning' | 'info'): 'is-danger' | 'is-warning' | 'is-soft' {
    if (severity === 'critical') {
        return 'is-danger';
    }
    if (severity === 'warning') {
        return 'is-warning';
    }
    return 'is-soft';
}

/**
 * 功能：把逻辑表状态映射为诊断面板样式类名。
 * @param status 逻辑表状态。
 * @returns 样式类名。
 */
function resolveRecordDiagnosticsTableToneClass(status: LogicTableStatus): 'is-danger' | 'is-warning' | 'is-stable' {
    const normalized = String(status ?? '').trim().toLowerCase();
    if (!normalized || normalized === 'healthy' || normalized === 'ready' || normalized === 'ok' || normalized === 'clean') {
        return 'is-stable';
    }
    if (normalized.includes('candidate') || normalized.includes('draft') || normalized.includes('warning') || normalized.includes('pending')) {
        return 'is-warning';
    }
    return 'is-danger';
}

function openLogicSourceDetailsDialog(title: string, summary: string, sourceRefs: SourceRef[]): void {
    const bodyHtml = sourceRefs.length <= 0
        ? '<div style="padding:12px; border-radius:12px; border:1px solid var(--SmartThemeBorderColor);">当前没有可展示的来源明细。</div>'
        : sourceRefs.map((sourceRef: SourceRef, index: number): string => `
            <div style="display:flex; flex-direction:column; gap:6px; padding:12px; border-radius:12px; border:1px solid var(--SmartThemeBorderColor); background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #1b1b1b) 88%, transparent);">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:center;">
                    <strong>来源 ${index + 1}</strong>
                    <span style="opacity:0.72;">${escapeHtml(formatSourceKindLabel(sourceRef.kind))}</span>
                </div>
                <div>${escapeHtml(formatSourceRefMeta(sourceRef))}</div>
                ${sourceRef.note ? `<div style="opacity:0.84;">说明：${escapeHtml(sourceRef.note)}</div>` : ''}
            </div>
        `).join('');

    openSharedDialog({
        id: 'stx-record-editor-source-details',
        size: 'lg',
        chrome: {
            title,
            description: summary,
        },
        bodyHtml: `<div style="display:flex; flex-direction:column; gap:10px;">${bodyHtml}</div>`,
        closeOnBackdrop: true,
        closeOnEscape: true,
    });
}

function isStableSnapshotValue(value: SnapshotValue | null | undefined): boolean {
    const text = String(value?.value ?? '').trim();
    return Boolean(text) && text !== '尚未稳定抽取';
}

function getStableSnapshotValues(values: SnapshotValue[] | null | undefined): SnapshotValue[] {
    return Array.isArray(values)
        ? values.filter((item: SnapshotValue): boolean => isStableSnapshotValue(item))
        : [];
}

/**
 * 功能：判断快照值是否为“可见消息 N 条”这类派生占位文案。
 * @param value 快照值。
 * @returns 是否应视作任务板占位项。
 */
function isSyntheticVisibleMessageSnapshot(value: SnapshotValue | null | undefined): boolean {
    const text = String(value?.value ?? '').trim();
    return /^可见消息\s*\d+\s*条$/.test(text);
}

function summarizeSnapshotValues(values: SnapshotValue[] | null | undefined, limit: number = 3): string {
    const items = getStableSnapshotValues(values)
        .slice(0, limit)
        .map((item: SnapshotValue): string => String(item.value ?? '').trim())
        .filter(Boolean);
    return items.length > 0 ? items.join(' / ') : '尚未稳定抽取';
}

function formatPercent(value: number | undefined): string {
    if (!Number.isFinite(Number(value))) {
        return '--';
    }
    return `${Math.round(Number(value) * 100)}%`;
}

function formatLogicTableSummaryLine(summary: LogicTableSummary): string {
    return [
        formatLogicStatusLabel(summary.status),
        `正式 ${summary.materializedRowCount}`,
        `候选 ${summary.derivedRowCount}`,
        `隐藏 ${summary.tombstonedRowCount}`,
        `重定向 ${summary.redirectedRowCount}`,
    ].join(' · ');
}

function sortLogicTableSummaries(summaries: LogicTableSummary[]): LogicTableSummary[] {
    const statusWeight: Record<LogicTableStatus, number> = {
        needs_attention: 0,
        sparse: 1,
        hidden: 2,
        healthy: 3,
    };
    return [...summaries].sort((left: LogicTableSummary, right: LogicTableSummary): number => {
        const byStatus = statusWeight[left.status] - statusWeight[right.status];
        if (byStatus !== 0) {
            return byStatus;
        }
        const leftWeight = left.derivedRowCount + left.tombstonedRowCount + left.redirectedRowCount;
        const rightWeight = right.derivedRowCount + right.tombstonedRowCount + right.redirectedRowCount;
        if (rightWeight !== leftWeight) {
            return rightWeight - leftWeight;
        }
        return left.title.localeCompare(right.title, 'zh-CN');
    });
}

function resolvePreferredLogicTableKey(
    summaries: LogicTableSummary[],
    currentLogicTableKey: string,
    mode?: 'normalize_aliases' | 'compact_tombstones' | 'rebuild_candidates',
): string {
    const ordered = sortLogicTableSummaries(summaries);
    if (currentLogicTableKey && ordered.some((item: LogicTableSummary): boolean => item.tableKey === currentLogicTableKey)) {
        return currentLogicTableKey;
    }
    if (mode === 'rebuild_candidates') {
        return ordered.find((item: LogicTableSummary): boolean => item.derivedRowCount > 0 || item.status === 'sparse' || item.status === 'needs_attention')?.tableKey || ordered[0]?.tableKey || '';
    }
    if (mode === 'compact_tombstones') {
        return ordered.find((item: LogicTableSummary): boolean => item.tombstonedRowCount > 0 || item.status === 'hidden')?.tableKey || ordered[0]?.tableKey || '';
    }
    if (mode === 'normalize_aliases') {
        return ordered.find((item: LogicTableSummary): boolean => item.redirectedRowCount > 0 || item.status === 'needs_attention')?.tableKey || ordered[0]?.tableKey || '';
    }
    return ordered[0]?.tableKey || '';
}

/**
 * 功能：获取原始库表记录的主键。
 * @param tableName 表名
 * @param record 数据记录
 * @returns 记录主键
 */
function getRawRecordId(tableName: RawTableName, record: RawRecord): string {
    if (tableName === 'events') {
        return String(record.eventId ?? '');
    }
    if (tableName === 'facts') {
        return String(record.factKey ?? '');
    }
    if (tableName === 'summaries') {
        return String(record.summaryId ?? '');
    }
    if (tableName === 'world_state') {
        return String(record.stateKey ?? '');
    }
    if (tableName === 'memory_mutation_history') {
        return String(record.mutationId ?? '');
    }
    return String(record.auditId ?? '');
}

/**
 * 功能：返回原始库表记录中可编辑的主载荷字段名。
 * @param tableName 表名
 * @returns 字段名
 */
function getRawPayloadFieldName(tableName: RawTableName): 'payload' | 'value' | 'content' | 'after' {
    if (tableName === 'events') {
        return 'payload';
    }
    if (tableName === 'summaries') {
        return 'content';
    }
    if (tableName === 'audit') {
        return 'after';
    }
    if (tableName === 'memory_mutation_history') {
        return 'after';
    }
    return 'value';
}

/**
 * 功能：判断原始表是否只读。
 * @param tableName 表名。
 * @returns 是否只读。
 */
function isReadOnlyRawTable(tableName: RawTableName): boolean {
    return tableName === 'audit' || tableName === 'memory_mutation_history';
}

/**
 * 功能：创建挂起变更的索引键。
 * @param tableName 表名
 * @param id 记录主键
 * @returns 挂起索引键
 */
function makePendingKey(tableName: RawTableName, id: string): string {
    return `${tableName}::${id}`;
}

/**
 * 功能：解析挂起变更索引键。
 * @param pendingKey 挂起索引键
 * @returns 表名与记录主键
 */
function parsePendingKey(pendingKey: string): { tableName: RawTableName | null; id: string } {
    const separatorIndex = pendingKey.indexOf('::');
    if (separatorIndex < 0) {
        return { tableName: null, id: '' };
    }
    return {
        tableName: pendingKey.slice(0, separatorIndex) as RawTableName,
        id: pendingKey.slice(separatorIndex + 2),
    };
}

const RE_KEY_I18N: Record<string, string> = {
    role: '角色',
    name: '名称',
    mode: '风格模式',
    profile: '人物资料',
    semantic: '整理结果',
    meta: '基本信息',
    content: '内容正文',
    text: '普通文本',
    summary: '摘要内容',
    significance: '显著度',
    importance: '重要度',
    keywords: '关键词',
    type: '类型',
    description: '描述',
    system: '系统设定',
    user: '用户意图',
    assistant: 'AI回复',
    observation: '观察结果',
    resolution: '决议',
    thought: '内部思考',
    context: '背景信息',
    entities: '实体引用',
    ability: '能力',
    abilities: '能力',
    companion: '同伴',
    current_emotion: '当前情绪',
    emotion: '情绪',
    goal: '目标',
    health: '健康',
    hp: '生命值',
    inventory: '物品',
    location: '位置',
    notes: '备注',
    style: '风格',
    identity: '人物信息',
    aliases: '别名',
    displayname: '显示名称',
    catchphrases: '口头禅',
    relationshipanchors: '关系线索',
    presetstyle: '预设风格',
    aistylecues: 'AI整理出的风格线索',
    cues: '风格线索',
    relationship: '关系',
    relationships: '关系',
    scene: '场景',
    status: '状态',
    value: '值',
    world: '世界设定',
    overview: '总体说明',
    locations: '地点',
    rules: '规则',
    'semantic.style': '整理结果 / 风格',
    'semantic.identity': '整理结果 / 人物信息',
    activelorebooks: '启用中的设定书',
    groupmembers: '群成员',
    hardconstraints: '不能改的规则',
    world_state: '世界状态',
};

const RE_VALUE_I18N: Record<string, string> = {
    balanced: '平衡',
    creative: '更有发挥',
    precise: '更严谨',
    strict: '严格',
    auto: '自动',
    manual: '手动',
};

const RE_ENTITY_KIND_I18N: Record<string, string> = {
    user: '用户',
    character: '角色',
    relationship: '关系',
    location: '地点',
    environment: '环境',
    goal: '目标',
    world: '世界',
    item: '物品',
    group: '群组',
    scene: '场景',
    semantic: '语义',
    state: '状态',
    actor: '对象',
};

const RE_EVENT_TYPE_I18N: Record<string, string> = {
    'chat.message.sent': '用户发言',
    'chat.message.received': '角色回复',
    'chat.message.system': '系统消息',
    'chat.message.updated': '消息更新',
    'memory.ingest': '统一记忆处理',
    'memory.vector.embed': '向量写入',
    'memory.search.rerank': '检索重排',
    'world.template.build': '世界模板构建',
    'world_state.update': '世界状态更新',
};

const RE_AUDIT_ACTION_I18N: Record<string, string> = {
    create: '新建',
    upsert: '写入',
    update: '更新',
    patch: '修补',
    delete: '删除',
    restore: '恢复',
    merge: '合并',
    compact: '压缩',
    rebuild: '重建',
    snapshot: '快照',
};

const RE_MUTATION_HISTORY_ACTION_I18N: Record<string, string> = {
    add: '新增',
    merge: '合并',
    update: '更新',
    invalidate: '失效',
    delete: '删除',
};

/**
 * 功能：把记录字段键名转换为更友好的中文标签。
 * @param key 原始字段键名。
 * @returns 友好的字段标签。
 */
function formatRecordEditorKeyLabel(key: string): string {
    const trimmed = String(key ?? '').trim();
    if (!trimmed) {
        return '未命名字段';
    }

    const normalized = trimmed.toLowerCase();
    if (RE_KEY_I18N[normalized]) {
        return RE_KEY_I18N[normalized];
    }

    const parts = trimmed
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .split(/[_./-]+/)
        .filter(Boolean);
    if (parts.length === 0) {
        return trimmed;
    }

    const translatedParts = parts.map((part: string): string => {
        const partKey = part.toLowerCase();
        if (RE_KEY_I18N[partKey]) {
            return RE_KEY_I18N[partKey];
        }
        if (/^(id|uuid)$/i.test(part)) {
            return part.toUpperCase();
        }
        return part;
    });
    const hasTranslatedPart = parts.some((part: string): boolean => Boolean(RE_KEY_I18N[part.toLowerCase()]));
    return hasTranslatedPart ? translatedParts.join('') : trimmed;
}

/**
 * 功能：压缩内部标识的显示长度，避免界面被长键值撑开。
 * @param value 原始内部标识。
 * @param maxLength 最大展示长度。
 * @returns 压缩后的展示文本。
 */
function compactInternalIdentifier(value: string, maxLength: number = 64): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '暂无';
    }
    if (trimmed.length <= maxLength) {
        return trimmed;
    }
    const headLength = Math.max(12, Math.floor(maxLength * 0.42));
    const tailLength = Math.max(10, maxLength - headLength - 3);
    return `${trimmed.slice(0, headLength)}...${trimmed.slice(-tailLength)}`;
}

/**
 * 功能：把实体类型转换成更直观的中文称呼。
 * @param kind 实体类型。
 * @returns 中文类型名。
 */
function formatEntityKindLabel(kind: string): string {
    const normalized = String(kind ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未绑定对象';
    }
    if (RE_ENTITY_KIND_I18N[normalized]) {
        return RE_ENTITY_KIND_I18N[normalized];
    }
    if (normalized === 'dialogue') return '对话记忆';
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：把路径或代码式片段转换成更适合阅读的中文主题。
 * @param value 原始路径或标识片段。
 * @param fallback 兜底文本。
 * @returns 中文化后的主题名。
 */
function formatHumanReadableTopic(value: string, fallback: string = '未命名'): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return fallback;
    }
    const normalized = trimmed.replace(/^\/+/, '').trim();
    if (!normalized) {
        return fallback;
    }
    const segments = normalized.split(/[/.]+/).filter(Boolean);
    if (segments.length === 0) {
        return fallback;
    }
    const translated = segments.map((segment: string): string => formatRecordEditorKeyLabel(segment));
    return translated.join(' / ');
}

/**
 * 功能：把实体对象渲染成更直观的中文说明。
 * @param entity 原始实体对象。
 * @returns 中文实体说明。
 */
function formatEntityDisplayLabel(entity: Record<string, unknown> | undefined): string {
    if (!entity) {
        return '未绑定对象';
    }
    const kind = formatEntityKindLabel(String(entity.kind ?? ''));
    const entityId = String(entity.id ?? '').trim();
    if (!entityId) {
        return kind;
    }
    return `${kind}：${entityId}`;
}

/**
 * 功能：把事件类型转换成更容易理解的中文名称。
 * @param value 原始事件类型。
 * @returns 中文事件名称。
 */
function formatEventTypeLabel(value: string): string {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
        return '未命名事件';
    }
    if (RE_EVENT_TYPE_I18N[normalized]) {
        return RE_EVENT_TYPE_I18N[normalized];
    }
    return formatHumanReadableTopic(normalized.replace(/\./g, '/'), normalized);
}

/**
 * 功能：把审计动作转换成更自然的中文动词。
 * @param value 原始审计动作。
 * @returns 中文动作名称。
 */
function formatAuditActionLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未命名动作';
    }
    if (RE_AUDIT_ACTION_I18N[normalized]) {
        return RE_AUDIT_ACTION_I18N[normalized];
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：把 mutation history 动作转换成更自然的中文动作名。
 * @param value 原始动作。
 * @returns 中文动作名称。
 */
function formatMutationHistoryActionLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未命名变更';
    }
    if (RE_MUTATION_HISTORY_ACTION_I18N[normalized]) {
        return RE_MUTATION_HISTORY_ACTION_I18N[normalized];
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：把维护来源模式转换成中文说明。
 * @param value 原始模式值。
 * @returns 中文模式说明。
 */
function formatOperationModeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '常规';
    }
    if (normalized === 'manual') {
        return '手动';
    }
    if (normalized === 'auto') {
        return '自动';
    }
    if (normalized === 'system') {
        return '系统';
    }
    return formatRecordEditorKeyLabel(normalized);
}

/**
 * 功能：生成事实记录的主标题，让原始事实更像资料项。
 * @param record 原始事实记录。
 * @returns 主标题文本。
 */
function buildFactHeadline(record: RawRecord): string {
    const path = String(record.path ?? '').trim();
    if (path) {
        return formatHumanReadableTopic(path, '未命名事实');
    }
    const type = String(record.type ?? '').trim();
    if (type) {
        return formatRecordEditorKeyLabel(type);
    }
    return '未命名事实';
}

/**
 * 功能：根据事实记录给出简洁的分类说明。
 * @param record 原始事实记录。
 * @returns 分类说明文本。
 */
function buildFactSummaryLabel(record: RawRecord): string {
    const type = String(record.type ?? '').trim();
    if (type) {
        return `分类：${formatRecordEditorKeyLabel(type)}`;
    }
    return '分类：未标记';
}

/**
 * 功能：生成世界状态记录的主标题。
 * @param path 原始路径。
 * @returns 主标题文本。
 */
function buildWorldStateHeadline(path: string): string {
    return formatHumanReadableTopic(path, '未命名状态');
}

function formatWorldStateScopeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    const labels: Record<string, string> = {
        global: '全局',
        nation: '国家/政体',
        region: '区域',
        city: '城市',
        location: '地点',
        organization: '组织',
        item: '物品',
        character: '角色',
        scene: '场景',
        unclassified: '待归类',
    };
    return labels[normalized] || formatRecordEditorKeyLabel(normalized || 'scene');
}

function formatWorldStateTypeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    const labels: Record<string, string> = {
        rule: '规则',
        constraint: '约束',
        event: '重大事件',
        status: '状态',
        capability: '能力',
        ownership: '归属',
        culture: '文化',
        danger: '危险',
        relationship: '关系',
        task: '任务',
        relationship_hook: '关系钩子',
        other: '其他设定',
        anomaly: '结构异常',
    };
    return labels[normalized] || formatRecordEditorKeyLabel(normalized || 'status');
}

/**
 * 功能：把某个世界状态子表的类型桶整理成适合渲染的视图模型。
 * @param sectionKey 子表键。
 * @param sectionEntries 子表条目。
 * @param preferredTypeKey 优先选中的类型键。
 * @returns 子表分类视图模型。
 */
function buildWorldStateSectionCategoryViewModel(
    sectionKey: string,
    sectionEntries: StructuredWorldStateEntry[],
    preferredTypeKey: string = '',
): WorldStateSectionCategoryViewModel {
    const typeState = buildWorldStateSectionTypeState(sectionEntries, preferredTypeKey);
    const activeBucket = typeState.buckets.find((bucket: WorldStateSectionTypeBucket): boolean => bucket.typeKey === typeState.activeTypeKey) ?? null;
    const typeTabs: WorldStateSectionTypeTab[] = typeState.buckets.map((bucket: WorldStateSectionTypeBucket): WorldStateSectionTypeTab => ({
        key: bucket.typeKey,
        label: formatWorldStateTypeLabel(bucket.typeKey),
        count: bucket.count,
        active: bucket.typeKey === typeState.activeTypeKey,
    }));

    return {
        activeTypeKey: typeState.activeTypeKey,
        currentTypeLabel: formatWorldStateTypeLabel(typeState.activeTypeKey || activeBucket?.typeKey || sectionKey),
        totalTypeCount: sectionEntries.length,
        visibleTypeCount: activeBucket?.count ?? sectionEntries.length,
        typeTabs,
    };
}

function hasWorldStateStructuralAnomaly(entry: StructuredWorldStateEntry): boolean {
    if (isInternalWorldStateAggregateEntry(entry)) {
        return false;
    }
    const raw = getWorldStateRawObject(entry);
    const anomalyFlags = Array.isArray(entry.node.anomalyFlags) ? entry.node.anomalyFlags : [];
    if (anomalyFlags.length > 0) {
        return true;
    }
    const hasAnyAnchor = Boolean(
        entry.node.subjectId
        || entry.node.nationId
        || entry.node.regionId
        || entry.node.cityId
        || entry.node.locationId
        || entry.node.itemId
        || pickWorldStateText(raw, ['subject', 'character', 'actor', 'nation', 'country', 'region', 'city', 'location', 'item']),
    );
    if (entry.node.scopeType === 'unclassified') {
        return true;
    }
    if (!hasAnyAnchor && !['global', 'scene'].includes(String(entry.node.scopeType ?? ''))) {
        return true;
    }
    return entry.node.stateType === 'anomaly';
}

/**
 * 功能：判断条目是否属于内部聚合路径。
 * @param entry 世界状态条目。
 * @returns 是否为内部聚合条目。
 */
function isInternalWorldStateAggregateEntry(entry: StructuredWorldStateEntry): boolean {
    const normalizedPath = String(entry.path ?? '').trim().toLowerCase();
    if (!normalizedPath) {
        return false;
    }
    return WORLD_STATE_INTERNAL_AGGREGATE_PATH_PREFIXES.some((prefix: string): boolean => normalizedPath.startsWith(prefix));
}

function matchWorldStateKeyword(entry: StructuredWorldStateEntry, keyword: string): boolean {
    const normalizedKeyword = normalizeLookup(keyword);
    if (!normalizedKeyword) {
        return true;
    }
    const haystack = normalizeLookup([
        entry.path,
        entry.node.title,
        entry.node.summary,
        ...(entry.node.keywords ?? []),
        ...(entry.node.tags ?? []),
    ].join(' '));
    return haystack.includes(normalizedKeyword);
}

function renderWorldStateRawPreview(value: unknown): string {
    if (typeof value === 'string') {
        return value.trim() || '暂无原始值';
    }
    try {
        return JSON.stringify(value ?? {}, null, 2);
    } catch {
        return String(value ?? '');
    }
}

function formatActorKeyLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '未命名角色';
    }
    const normalized = trimmed.toLowerCase();
    if (normalized === 'role:user') return '用户';
    if (normalized === 'role:assistant') return '助手';
    if (normalized === 'role:system') return '系统';
    if (normalized.startsWith('assistant:')) return trimmed.slice('assistant:'.length).trim() || '助手角色';
    if (normalized.startsWith('character:')) return trimmed.slice('character:'.length).trim() || '角色';
    if (normalized.startsWith('name:')) return trimmed.slice('name:'.length).trim() || '命名角色';
    if (normalized.startsWith('role:')) return formatRecordEditorKeyLabel(trimmed.slice('role:'.length).trim() || 'role');
    if (normalized.startsWith('msg:')) return `消息片段 ${compactInternalIdentifier(trimmed.slice('msg:'.length).trim(), 16)}`;
    return trimmed;
}

function resolveActorDisplayLabel(actorKey: string, displayName?: string | null): string {
    const normalizedDisplayName = String(displayName ?? '').trim();
    if (normalizedDisplayName) {
        return normalizedDisplayName;
    }
    return formatActorKeyLabel(actorKey);
}

function formatRetentionBiasLabel(value: number | undefined): string {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric) || Math.abs(numeric) < 0.001) {
        return '±0%';
    }
    const sign = numeric > 0 ? '+' : '';
    return `${sign}${Math.round(numeric * 100)}%`;
}

function buildFallbackMemoryActorRetentionMap(
    owned: OwnedMemoryState,
    lifecycle?: MemoryLifecycleState,
): MemoryActorRetentionMap {
    const actorKey = String(owned.ownerActorKey ?? '').trim() || '__world__';
    const distortionRisk = Number(lifecycle?.distortionRisk ?? 0);
    return {
        [actorKey]: {
            actorKey,
            stage: lifecycle?.stage || 'clear',
            forgetProbability: Math.max(0, Math.min(1, Number(owned.forgetProbability ?? lifecycle?.forgetProbability ?? 0) || 0)),
            forgotten: owned.forgotten === true || lifecycle?.forgotten === true,
            forgottenAt: owned.forgottenAt ?? lifecycle?.forgottenAt,
            forgottenReasonCodes: Array.from(new Set([...(owned.forgottenReasonCodes ?? []), ...(lifecycle?.forgottenReasonCodes ?? [])])).filter(Boolean),
            rehearsalCount: Number(lifecycle?.rehearsalCount ?? 0) || 0,
            lastRecalledAt: Number(lifecycle?.lastRecalledAt ?? 0) || 0,
            retentionBias: 0,
            confidence: Math.max(0, Math.min(1, 1 - Math.max(0, Math.min(1, distortionRisk)))),
            updatedAt: Number(owned.updatedAt ?? lifecycle?.updatedAt ?? Date.now()) || Date.now(),
        },
    };
}

function resolveMemoryActorRetentionMap(
    owned: OwnedMemoryState,
    lifecycle?: MemoryLifecycleState,
): MemoryActorRetentionMap {
    const ownedMap = owned.roleBasedRetentionOverrides;
    if (ownedMap && Object.keys(ownedMap).length > 0) {
        return ownedMap;
    }
    const lifecycleMap = lifecycle?.perActorMetrics;
    if (lifecycleMap && Object.keys(lifecycleMap).length > 0) {
        return lifecycleMap;
    }
    return buildFallbackMemoryActorRetentionMap(owned, lifecycle);
}

interface MemoryActorRetentionRowViewModel {
    actorKey: string;
    actorLabel: string;
    state: MemoryActorRetentionState;
    isActive: boolean;
}

function buildMemoryActorRetentionRows(
    owned: OwnedMemoryState,
    lifecycle: MemoryLifecycleState | undefined,
    actorLabelMap: Map<string, string>,
    activeActorKey: string | null = null,
): MemoryActorRetentionRowViewModel[] {
    const retentionMap = resolveMemoryActorRetentionMap(owned, lifecycle);
    return Object.values(retentionMap)
        .filter((item: MemoryActorRetentionState | undefined): item is MemoryActorRetentionState => Boolean(item && String(item.actorKey ?? '').trim()))
        .map((item: MemoryActorRetentionState): MemoryActorRetentionRowViewModel => {
            const actorKey = String(item.actorKey ?? '').trim();
            const fallbackLabel = actorKey === '__world__' ? '世界 / 未归属' : actorLabelMap.get(actorKey);
            return {
                actorKey,
                actorLabel: resolveActorDisplayLabel(actorKey, fallbackLabel || actorKey),
                state: item,
                isActive: Boolean(activeActorKey && actorKey === activeActorKey),
            };
        })
        .sort((left: MemoryActorRetentionRowViewModel, right: MemoryActorRetentionRowViewModel): number => {
            if (left.isActive !== right.isActive) {
                return left.isActive ? -1 : 1;
            }
            if (left.state.forgotten !== right.state.forgotten) {
                return left.state.forgotten ? -1 : 1;
            }
            return left.actorLabel.localeCompare(right.actorLabel, 'zh-CN');
        });
}

function renderMemoryActorRetentionRowsMarkup(
    rows: MemoryActorRetentionRowViewModel[],
    options: {
        compact?: boolean;
        maxRows?: number;
    } = {},
): string {
    if (rows.length <= 0) {
        return '<div class="stx-re-empty">当前没有按角色细分的遗忘指标。</div>';
    }
    const maxRows = Math.max(1, options.maxRows ?? rows.length);
    const visibleRows = rows.slice(0, maxRows);
    const hiddenCount = Math.max(0, rows.length - visibleRows.length);
    return `
        <div class="stx-re-retention-list${options.compact ? ' is-compact' : ''}">
            ${visibleRows.map((row: MemoryActorRetentionRowViewModel): string => {
                const probability = Math.max(0, Math.min(1, Number(row.state.forgetProbability ?? 0) || 0));
                const fillWidth = `${Math.max(4, Math.round(probability * 1000) / 10)}%`;
                const rowClassName = [
                    'stx-re-retention-row',
                    `is-stage-${escapeHtml(row.state.stage || 'clear')}`,
                    row.state.forgotten ? 'is-forgotten' : '',
                    row.isActive ? 'is-active' : '',
                ].filter(Boolean).join(' ');
                const reasonText = (row.state.forgottenReasonCodes ?? []).slice(0, 2).map((reason: string): string => formatMemoryReasonLabel(reason)).join(' · ');
                return `
                    <div class="${rowClassName}">
                        <div class="stx-re-retention-head">
                            <div class="stx-re-retention-title-wrap">
                                <strong>${escapeHtml(row.actorLabel)}</strong>
                                ${row.isActive ? '<span class="stx-re-record-flag">主视角</span>' : ''}
                                ${row.state.forgotten ? '<span class="stx-re-json">已遗忘</span>' : ''}
                            </div>
                            <span class="stx-re-retention-value">${escapeHtml(formatPercent(probability))}</span>
                        </div>
                        <div class="stx-re-retention-bar"><div class="stx-re-retention-fill" style="width:${fillWidth}"></div></div>
                        <div class="stx-re-retention-meta">
                            <span>${escapeHtml(formatMemoryStageLabel(row.state.stage || 'clear'))}</span>
                            <span>置信 ${escapeHtml(formatPercent(row.state.confidence))}</span>
                            <span>偏置 ${escapeHtml(formatRetentionBiasLabel(row.state.retentionBias))}</span>
                            ${row.state.lastRecalledAt ? `<span>回忆于 ${escapeHtml(formatTimeLabel(row.state.lastRecalledAt))}</span>` : ''}
                            ${reasonText ? `<span>${escapeHtml(reasonText)}</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
            ${hiddenCount > 0 ? `<div class="stx-re-json">另有 ${hiddenCount} 个角色视角已折叠。</div>` : ''}
        </div>
    `;
}

function formatPersonaProfileVersionLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '角色画像';
    }
    const match = trimmed.match(/^persona\.v(\d+)$/i);
    if (match) {
        return `角色画像 v${match[1]}`;
    }
    return formatRecordEditorKeyLabel(trimmed);
}

function formatMemoryReasonLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    const labels: Record<string, string> = {
        manual_restore: '手动恢复',
        manual_mark_forgotten: '手动标记遗忘',
        event_reinforced: '事件强化',
        event_invalidated: '事件覆盖或冲淡',
        low_importance: '重要度偏低',
        fast_forgetting: '遗忘速度较快',
        distortion_risk: '扭曲风险偏高',
        owner_missing: '缺少归属角色',
    };
    return labels[normalized] || formatRecordEditorKeyLabel(normalized || 'reason');
}function formatChatKeyLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '全局记录';
    }
    return `会话 ${compactInternalIdentifier(trimmed, 24)}`;
}

function formatTemplateIdLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '默认模板';
    }
    return `模板编号 ${compactInternalIdentifier(trimmed, 20)}`;
}

function formatLogicTableKeyLabel(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '未命名逻辑表';
    }
    return formatHumanReadableTopic(trimmed.replace(/_/g, '/'), compactInternalIdentifier(trimmed, 24));
}

function formatLogicRowDisplayLabel(value: string, fallback?: string | null): string {
    const preferred = String(fallback ?? '').trim();
    if (preferred) {
        return preferred;
    }
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '未命名逻辑行';
    }
    return formatHumanReadableTopic(trimmed.replace(/_/g, '/'), compactInternalIdentifier(trimmed, 24));
}

function formatPersonaDerivedSource(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    const labels: Record<string, string> = {
        semantic_seed: '初始设定',
        identity_seed: '角色身份',
        fallback_identity_seed: '主身份兜底',
        group_memory: '群像记忆',
        group_lane: '角色分轨',
        relationship_state: '关系状态',
        active_actor: '当前主视角',
        fallback: '结构补全',
    };
    if (normalized.startsWith('actor:')) {
        return `角色：${formatActorKeyLabel(normalized.slice('actor:'.length))}`;
    }
    if (normalized.startsWith('chat_type:')) {
        return `聊天类型：${formatRecordEditorKeyLabel(normalized.slice('chat_type:'.length) || 'chat')}`;
    }
    if (normalized.startsWith('style:')) {
        return `风格：${formatRecordEditorKeyLabel(normalized.slice('style:'.length) || 'style')}`;
    }
    return labels[normalized] || formatRecordEditorKeyLabel(normalized || 'persona');
}

/**
 * 功能：把 mutation planner 快照格式化为便于摘要卡展示的动作统计文本。
 * @param snapshot 最近一次 mutation planner 快照。
 * @returns 动作统计文本。
 */
function formatMutationPlanSummary(snapshot: EditorExperienceSnapshot['lastMutationPlan']): string {
    if (!snapshot) {
        return '最近还没有 mutation planner 记录';
    }
    const parts = [
        ['ADD', snapshot.actionCounts.ADD],
        ['MERGE', snapshot.actionCounts.MERGE],
        ['UPDATE', snapshot.actionCounts.UPDATE],
        ['INVALIDATE', snapshot.actionCounts.INVALIDATE],
        ['DELETE', snapshot.actionCounts.DELETE],
        ['NOOP', snapshot.actionCounts.NOOP],
    ].filter((entry): boolean => Number(entry[1] ?? 0) > 0)
        .map((entry): string => `${entry[0]} ${entry[1]}`);
    return parts.length > 0 ? parts.join(' / ') : '最近一轮没有产生有效动作';
}

/**
 * 功能：把 mutation planner 快照格式化为摘要卡的来源行。
 * @param snapshot 最近一次 mutation planner 快照。
 * @returns 摘要卡来源行文本。
 */
function formatMutationPlanMeta(snapshot: EditorExperienceSnapshot['lastMutationPlan']): string {
    if (!snapshot) {
        return '等待新的提议进入长期记忆 CRUD';
    }
    const sourceLabel = String(snapshot.consumerPluginId || snapshot.source || 'unknown_plugin').trim();
    return `${sourceLabel} · ${snapshot.generatedAt > 0 ? formatTimeLabel(snapshot.generatedAt) : '刚刚'}`;
}

/**
 * 功能：把 mutation history 的最近条目整理成摘要文本。
 * @param history 最近的变更历史。
 * @returns 摘要文本。
 */
function formatMutationHistorySummary(history: EditorExperienceSnapshot['mutationHistory']): string {
    if (!Array.isArray(history) || history.length === 0) {
        return '最近还没有变更历史';
    }
    const counts = history.reduce<Record<string, number>>((result, entry): Record<string, number> => {
        const action = String(entry.action ?? '').trim().toUpperCase() || 'OTHER';
        result[action] = (result[action] ?? 0) + 1;
        return result;
    }, {});
    const parts = ['ADD', 'MERGE', 'UPDATE', 'INVALIDATE', 'DELETE']
        .filter((action: string): boolean => Number(counts[action] ?? 0) > 0)
        .map((action: string): string => `${formatMutationHistoryActionLabel(action)} ${counts[action]}`);
    return parts.length > 0 ? parts.join(' / ') : '最近没有可展示的变更';
}

/**
 * 功能：把 mutation history 的来源行格式化为摘要卡可读文本。
 * @param history 最近的变更历史。
 * @returns 来源说明。
 */
function formatMutationHistoryMeta(history: EditorExperienceSnapshot['mutationHistory']): string {
    if (!Array.isArray(history) || history.length === 0) {
        return '等待新的变更写入历史';
    }
    const latest = history[0];
    const sourceLabel = String(latest.consumerPluginId || latest.source || 'unknown_plugin').trim();
    const targetLabel = `${formatMutationHistoryActionLabel(latest.action)} · ${latest.targetKind}`;
    return `${sourceLabel} · ${targetLabel} · ${latest.ts > 0 ? formatTimeLabel(latest.ts) : '刚刚'}`;
}

/**
 * 功能：渲染角色记忆总览卡片。
 * @param options 卡片配置。
 * @returns HTML 字符串。
 */
function renderMemoryDashboardCardMarkup(options: {
    icon: string;
    eyebrow: string;
    value: string;
    detail?: string;
    meta?: string;
    tone?: 'gold' | 'azure' | 'crimson' | 'slate';
}): string {
    const toneClassName = options.tone ? ` is-${options.tone}` : '';
    return `
        <div class="stx-re-memory-dashboard-card${toneClassName}">
            <div class="stx-re-memory-dashboard-head">
                <span class="stx-re-memory-dashboard-icon"><i class="${options.icon}" aria-hidden="true"></i></span>
                <span class="stx-re-memory-dashboard-eyebrow">${escapeHtml(options.eyebrow)}</span>
            </div>
            <div class="stx-re-memory-dashboard-value">${escapeHtml(options.value)}</div>
            ${options.detail ? `<div class="stx-re-memory-dashboard-detail">${escapeHtml(options.detail)}</div>` : ''}
            ${options.meta ? `<div class="stx-re-memory-dashboard-meta">${escapeHtml(options.meta)}</div>` : ''}
        </div>
    `;
}

/**
 * 功能：渲染角色记忆数值块。
 * @param label 数值标签。
 * @param value 数值内容。
 * @param tone 色调类型。
 * @returns HTML 字符串。
 */
function renderMemoryMetricCardMarkup(
    label: string,
    value: string,
    tone: 'neutral' | 'accent' | 'warning' | 'danger' = 'neutral',
): string {
    return `
        <div class="stx-re-memory-metric-card is-${tone}">
            <div class="stx-re-memory-metric-label">${escapeHtml(label)}</div>
            <div class="stx-re-memory-metric-value">${escapeHtml(value)}</div>
        </div>
    `;
}

/**
 * 功能：根据遗忘阶段推导角色记忆卡的视觉状态。
 * @param stage 遗忘阶段。
 * @param forgotten 是否已遗忘。
 * @returns 视觉状态类名。
 */
function buildMemoryStageToneClassName(stage: string | undefined, forgotten: boolean): string {
    if (forgotten) {
        return 'is-forgotten';
    }
    if (stage === 'distorted') {
        return 'is-distorted';
    }
    if (stage === 'blur') {
        return 'is-blur';
    }
    return 'is-clear';
}

/**
 * 功能：构建角色记忆召回战况卡片组。
 * @param experience 体验快照。
 * @returns HTML 字符串。
 */
function buildRecallSummaryCardsMarkup(experience: EditorExperienceSnapshot): string {
    const summary = buildRecallUiSummary(experience);
    const secondaryText = summary.secondaryActorLabels.length > 0
        ? summary.secondaryActorLabels.join(' / ')
        : '当前以共享池为主';
    const salienceText = summary.salienceLabels.length > 0
        ? summary.salienceLabels.join(' / ')
        : '当前没有显著活跃角色';
    return `
        <div class="stx-re-memory-dashboard-grid stx-re-memory-dashboard-grid-secondary">
            ${renderMemoryDashboardCardMarkup({
                icon: 'fa-solid fa-eye',
                eyebrow: '召回视角',
                value: summary.viewpointModeLabel,
                detail: `主视角：${summary.primaryActorLabel}`,
                meta: `来源：${summary.focusSourceLabel} / 次角色：${secondaryText}`,
                tone: 'azure',
            })}
            ${renderMemoryDashboardCardMarkup({
                icon: 'fa-solid fa-chess-knight',
                eyebrow: '共享池 / 角色池',
                value: `命中 ${summary.globalPoolSelectedCount} / ${summary.actorPoolSelectedCount}`,
                detail: `边界压制 ${summary.foreignPrivateSuppressedCount} 条 / 遗忘阻断 ${summary.forgottenBlockedCount} 条`,
                meta: `热度角色：${salienceText}`,
                tone: 'gold',
            })}
            ${renderMemoryDashboardCardMarkup({
                icon: 'fa-solid fa-compass',
                eyebrow: '严格 Metadata 回溯',
                value: summary.vectorIndexLabel,
                detail: `最近重建：${summary.vectorRebuiltLabel}`,
                meta: `命中 ${summary.selectedCount} 条 / 回退 ${summary.rejectedCount} 条`,
                tone: 'slate',
            })}
            ${renderMemoryDashboardCardMarkup({
                icon: 'fa-solid fa-wand-sparkles',
                eyebrow: '长期记忆 CRUD',
                value: formatMutationPlanSummary(experience.lastMutationPlan),
                detail: `执行 ${String(experience.lastMutationPlan?.appliedItems ?? 0)} / ${String(experience.lastMutationPlan?.totalItems ?? 0)}`,
                meta: `来源：${formatMutationPlanMeta(experience.lastMutationPlan)}`,
                tone: 'gold',
            })}
            ${renderMemoryDashboardCardMarkup({
                icon: 'fa-solid fa-clock-rotate-left',
                eyebrow: '最近变更',
                value: formatMutationHistorySummary(experience.mutationHistory),
                detail: `记录 ${String(experience.mutationHistory?.length ?? 0)} 条`,
                meta: `来源：${formatMutationHistoryMeta(experience.mutationHistory)}`,
                tone: 'crimson',
            })}
        </div>
    `;
}

/**
 * 功能：构建最近被角色边界压制的 recall 条目列表。
 * @param experience 体验快照。
 * @returns HTML 字符串。
 */
function buildSuppressedRecallListMarkup(experience: EditorExperienceSnapshot): string {
    const suppressedItems = extractForeignPrivateSuppressedItems(experience.latestRecallExplanation, 6);
    if (suppressedItems.length <= 0) {
        return '<div class="stx-re-empty">最近这一轮没有被角色边界压制的私人记忆。</div>';
    }
    return `
        <div class="stx-re-memory-suppressed-list">
            ${suppressedItems.map((item): string => `
                <div class="stx-re-memory-suppressed-card">
                    <div class="stx-re-memory-suppressed-head">
                        <strong>${escapeHtml(item.title)}</strong>
                        <span class="stx-re-memory-suppressed-score">${escapeHtml(formatPercent(item.score))}</span>
                    </div>
                    <div class="stx-re-memory-suppressed-reason">${escapeHtml(item.reasonLabels.join(' / ') || '因角色边界规则被压制')}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * 功能：渲染角色画像卡片。
 * @param actorKey 角色键。
 * @param actorLabel 角色标签。
 * @param profile 角色画像。
 * @param options 额外渲染选项。
 * @returns HTML 字符串。
 */
function renderPersonaProfileCardMarkup(
    actorKey: string,
    actorLabel: string,
    profile: PersonaMemoryProfile,
    options: {
        active?: boolean;
        extraActionsHtml?: string;
    } = {},
): string {
    const derivedSources = (profile.derivedFrom ?? []).slice(0, 4).map((item: string): string => formatPersonaDerivedSource(item));
    const resolvedActorLabel = resolveActorDisplayLabel(actorKey, actorLabel);
    const summaryTags = [
        profile.allowDistortion ? '允许出现模糊或扭曲回忆' : '优先保持稳定事实',
        `更新于 ${profile.updatedAt ? formatTimeLabel(profile.updatedAt) : '暂无'}`,
        ...(derivedSources.length > 0 ? derivedSources.map((item: string): string => `来源：${item}`) : ['来源待补全']),
    ];
    const stats = [
        { label: '总容量', value: formatPercent(profile.totalCapacity), tone: 'accent' as const },
        { label: '事件记忆', value: formatPercent(profile.eventMemory), tone: 'neutral' as const },
        { label: '事实记忆', value: formatPercent(profile.factMemory), tone: 'neutral' as const },
        { label: '遗忘速度', value: formatPercent(profile.forgettingSpeed), tone: 'warning' as const },
        { label: '扭曲倾向', value: formatPercent(profile.distortionTendency), tone: 'danger' as const },
        { label: '关系敏感', value: formatPercent(profile.relationshipSensitivity), tone: 'accent' as const },
        { label: '情绪偏置', value: formatPercent(profile.emotionalBias), tone: 'warning' as const },
        { label: '隐私保护', value: formatPercent(profile.privacyGuard), tone: 'neutral' as const },
    ];
    return `
        <article class="stx-re-memory-persona-card${options.active ? ' is-active' : ''}">
            <div class="stx-re-memory-persona-head">
                <div class="stx-re-memory-persona-crest">
                    <i class="fa-solid ${options.active ? 'fa-crown' : 'fa-user-shield'}" aria-hidden="true"></i>
                </div>
                <div class="stx-re-memory-persona-main">
                    <div class="stx-re-memory-persona-topline">
                        <div class="stx-re-memory-persona-name">${escapeHtml(resolvedActorLabel)}</div>
                        <div class="stx-re-memory-persona-status">
                            <span class="stx-re-record-flag">${options.active ? '当前主视角' : '待命画像'}</span>
                            <span class="stx-re-json">${escapeHtml(formatPersonaProfileVersionLabel(profile.profileVersion || 'persona'))}</span>
                        </div>
                    </div>
                    <div class="stx-re-record-code" title="${escapeHtml(actorKey)}">角色键：${escapeHtml(formatActorKeyLabel(actorKey))}</div>
                    <div class="stx-re-memory-chip-row">
                        ${summaryTags.map((item: string): string => `<span class="stx-re-memory-chip">${escapeHtml(item)}</span>`).join('')}
                    </div>
                </div>
            </div>
            <div class="stx-re-memory-stat-grid">
                ${stats.map((item: { label: string; value: string; tone: 'neutral' | 'accent' | 'warning' | 'danger' }): string => renderMemoryMetricCardMarkup(item.label, item.value, item.tone)).join('')}
            </div>
            ${options.extraActionsHtml ? `<div class="stx-re-action-row stx-re-memory-action-row">${options.extraActionsHtml}</div>` : ''}
        </article>
    `;
}

/**
 * 功能：渲染角色记忆条目卡片。
 * @param owned 角色记忆状态。
 * @param lifecycle 生命周期快照。
 * @param recall 召回统计。
 * @param actorLabelMap 角色标签映射。
 * @param activeActorKey 当前主视角键。
 * @param eventTitleMap 重大事件标题映射。
 * @returns HTML 字符串。
 */
function renderMemoryRecordCardMarkup(
    owned: OwnedMemoryState,
    lifecycle: MemoryLifecycleState | undefined,
    recall: { count: number; lastAt: number } | undefined,
    actorLabelMap: Map<string, string>,
    activeActorKey: string | null,
    eventTitleMap: Map<string, string>,
): string {
    const retentionRows = buildMemoryActorRetentionRows(owned, lifecycle, actorLabelMap, activeActorKey);
    const title = buildMemoryRecordHeadline(owned.recordKey, lifecycle, owned);
    const recordTooltip = buildMemoryRecordTooltip(owned.recordKey, owned);
    const ownerLabel = owned.ownerActorKey ? (actorLabelMap.get(owned.ownerActorKey) || owned.ownerActorKey) : '世界 / 未归属';
    const stageLabel = formatMemoryStageLabel(lifecycle?.stage || 'clear');
    const stateToneClassName = buildMemoryStageToneClassName(lifecycle?.stage, owned.forgotten === true);
    const subtitle = joinReadableMeta([
        `归属：${ownerLabel}`,
        `类型：${formatMemoryTypeLabel(owned.memoryType)}`,
        `细分：${formatMemorySubtypeLabel(owned.memorySubtype)}`,
        `来源：${formatMemorySourceScopeLabel(owned.sourceScope)}`,
    ]);
    const reinforcedRefs = renderMemoryEventRefs(owned.reinforcedByEventIds, eventTitleMap, '暂无');
    const invalidatedRefs = renderMemoryEventRefs(owned.invalidatedByEventIds, eventTitleMap, '暂无');
    const reasonLabels = (owned.forgottenReasonCodes.length > 0 ? owned.forgottenReasonCodes : ['当前没有明确遗忘原因'])
        .slice(0, 4)
        .map((reason: string): string => formatMemoryReasonLabel(reason));
    const entryIconClassName = owned.memorySubtype === 'major_plot_event'
        ? 'fa-star'
        : owned.memoryType === 'relationship'
            ? 'fa-link'
            : owned.recordKind === 'state'
                ? 'fa-landmark'
                : 'fa-book-open';
    const metaChips = [
        `归属 ${ownerLabel}`,
        `类型 ${formatMemoryTypeLabel(owned.memoryType)}`,
        `细分 ${formatMemorySubtypeLabel(owned.memorySubtype)}`,
        `来源 ${formatMemorySourceScopeLabel(owned.sourceScope)}`,
    ];
    const metricCards = [
        renderMemoryMetricCardMarkup('重要度', formatPercent(owned.importance), 'accent'),
        renderMemoryMetricCardMarkup('遗忘概率', formatPercent(owned.forgetProbability), owned.forgotten ? 'danger' : 'warning'),
        renderMemoryMetricCardMarkup('复述次数', String(lifecycle?.rehearsalCount ?? 0), 'neutral'),
        renderMemoryMetricCardMarkup('扭曲风险', formatPercent(lifecycle?.distortionRisk), 'danger'),
        renderMemoryMetricCardMarkup('上次回忆', lifecycle?.lastRecalledAt ? formatTimeLabel(lifecycle.lastRecalledAt) : '暂无', 'neutral'),
        renderMemoryMetricCardMarkup('最近命中', recall?.lastAt ? `${formatTimeLabel(recall.lastAt)} · ${recall.count} 次` : '暂无', 'accent'),
    ];
    return `
        <article class="stx-re-panel-card stx-re-memory-entry ${stateToneClassName}">
            <div class="stx-re-memory-entry-head">
                <div class="stx-re-memory-entry-title-wrap">
                    <div class="stx-re-memory-entry-crest">
                        <i class="fa-solid ${entryIconClassName}" aria-hidden="true"></i>
                    </div>
                    <div class="stx-re-memory-entry-main">
                        <div class="stx-re-record-title" data-tip="${escapeHtml(recordTooltip)}">${escapeHtml(title)}</div>
                        <div class="stx-re-record-sub">${escapeHtml(subtitle)}</div>
                        <div class="stx-re-memory-chip-row">
                            ${metaChips.map((item: string): string => `<span class="stx-re-memory-chip">${escapeHtml(item)}</span>`).join('')}
                        </div>
                        <div class="stx-re-record-code" title="${escapeHtml(owned.recordKey)}" data-tip="${escapeHtml(`完整内部键：${owned.recordKey}`)}">内部编号：${escapeHtml(compactInternalIdentifier(owned.recordKey, 32))}</div>
                    </div>
                </div>
                <div class="stx-re-memory-entry-status">
                    <span class="stx-re-memory-status-pill">${owned.forgotten ? '已遗忘' : '可回忆'}</span>
                    <span class="stx-re-memory-stage-pill">${escapeHtml(stageLabel)}</span>
                </div>
            </div>
            <div class="stx-re-memory-metric-grid">
                ${metricCards.join('')}
            </div>
            <div class="stx-re-memory-chip-row is-reason-row">
                ${reasonLabels.map((item: string): string => `<span class="stx-re-memory-chip is-warning">${escapeHtml(item)}</span>`).join('')}
            </div>
            <div class="stx-re-memory-detail-grid">
                <section class="stx-re-memory-mini-panel">
                    <div class="stx-re-memory-mini-head">
                        <strong>遗忘矩阵</strong>
                        <span class="stx-re-json">${escapeHtml(String(retentionRows.length))} 个视角</span>
                    </div>
                    ${renderMemoryActorRetentionRowsMarkup(retentionRows, { maxRows: 8 })}
                </section>
                <section class="stx-re-memory-mini-panel is-event-panel">
                    <div class="stx-re-memory-mini-head">
                        <strong>重大事件联动</strong>
                        <span class="stx-re-json">${escapeHtml(formatMemoryImpactSummary(owned))}</span>
                    </div>
                    <div class="stx-re-memory-mini-copy">${escapeHtml(formatMemoryImpactSummary(owned))}</div>
                    <div class="stx-re-memory-mini-links"><strong>强化来源</strong>${reinforcedRefs}</div>
                    <div class="stx-re-memory-mini-links"><strong>覆盖 / 冲淡来源</strong>${invalidatedRefs}</div>
                </section>
            </div>
            <div class="stx-re-action-row stx-re-memory-action-row">
                <button class="stx-re-btn" data-memory-action="toggle-forgotten" data-record-key="${escapeHtml(owned.recordKey)}"${buildTipAttr(owned.forgotten ? '恢复这条已遗忘记忆。' : '手动把这条记忆标记为已遗忘。')}>${owned.forgotten ? '恢复记忆' : '标记遗忘'}</button>
                <button class="stx-re-btn" data-memory-action="change-owner" data-record-key="${escapeHtml(owned.recordKey)}"${buildTipAttr('调整这条记忆归属到哪个角色，留空则归入世界或未归属。')}>调整归属</button>
                <button class="stx-re-btn" data-memory-action="change-subtype" data-record-key="${escapeHtml(owned.recordKey)}"${buildTipAttr('修改这条记忆的细分类型，例如重大剧情、地点信息或偏好。')}>调整细分</button>
                <button class="stx-re-btn" data-memory-action="change-importance" data-record-key="${escapeHtml(owned.recordKey)}"${buildTipAttr('手动调整重要度，这会影响遗忘概率。')}>调整重要度</button>
                <button class="stx-re-btn save" data-memory-action="recompute" data-record-key="${escapeHtml(owned.recordKey)}"${buildTipAttr('根据当前参数重新计算这条记忆的遗忘状态。')}>重新计算</button>
            </div>
        </article>
    `;
}
function collectWorldStateMatchTokens(entry: StructuredWorldStateEntry): string[] {
    const rawTokens = [
        entry.path,
        entry.node.title,
        entry.node.summary,
        entry.node.subjectId,
        entry.node.regionId,
        entry.node.cityId,
        entry.node.locationId,
        entry.node.itemId,
        ...(entry.node.keywords ?? []),
        ...(entry.node.tags ?? []),
    ].flatMap((item: unknown): string[] => {
        return String(item ?? '')
            .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/)
            .map((part: string): string => normalizeLookup(part))
            .filter((part: string): boolean => part.length >= 2);
    });
    return Array.from(new Set(rawTokens)).slice(0, 12);
}

function doesOwnedMemoryRelateToWorldEntry(owned: OwnedMemoryState, entry: StructuredWorldStateEntry): boolean {
    const haystack = normalizeLookup([
        owned.recordKey,
        owned.memoryType,
        owned.memorySubtype,
        owned.sourceScope,
        owned.recordKind,
    ].join(' '));
    if (!haystack) {
        return false;
    }
    const tokens = collectWorldStateMatchTokens(entry);
    const matchedCount = tokens.filter((token: string): boolean => haystack.includes(token)).length;
    if (matchedCount <= 0) {
        return false;
    }
    const isWorldLinked = owned.memoryType === 'world' || owned.sourceScope === 'world' || owned.recordKind === 'state';
    return isWorldLinked ? matchedCount >= 1 : matchedCount >= 2;
}

function getWorldStateAwareActors(
    entry: StructuredWorldStateEntry,
    ownedStates: OwnedMemoryState[],
    actorLabelMap: Map<string, string>,
): string[] {
    const matchedActors = new Set<string>();
    ownedStates.forEach((owned: OwnedMemoryState): void => {
        const actorKey = String(owned.ownerActorKey ?? '').trim();
        if (!actorKey) {
            return;
        }
        if (!doesOwnedMemoryRelateToWorldEntry(owned, entry)) {
            return;
        }
        matchedActors.add(actorLabelMap.get(actorKey) || actorKey);
    });
    return Array.from(matchedActors).sort((left: string, right: string): number => left.localeCompare(right, 'zh-CN'));
}

/**
 * 功能：把摘要层级转换成更自然的中文标签。
 * @param level 原始层级值。
 * @returns 中文层级名。
 */
function formatSummaryLevelLabel(level: string): string {
    const normalized = String(level ?? '').trim().toLowerCase();
    if (!normalized) {
        return '普通摘要';
    }
    if (normalized === 'scene') {
        return '场景摘要';
    }
    if (normalized === 'conversation') {
        return '会话摘要';
    }
    if (normalized === 'chapter') {
        return '章节摘要';
    }
    if (normalized === 'global') {
        return '全局摘要';
    }
    return `${formatRecordEditorKeyLabel(normalized)}摘要`;
}

function formatMemoryTypeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未分类';
    }
    if (normalized === 'identity') return '身份记忆';
    if (normalized === 'event') return '事件记忆';
    if (normalized === 'relationship') return '关系记忆';
    if (normalized === 'world') return '世界知识';
    if (normalized === 'status') return '状态记忆';
    return formatRecordEditorKeyLabel(normalized);
}

function formatMemorySubtypeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (!normalized) {
        return '未细分';
    }
    const labels: Record<string, string> = {
        identity: '身份',
        trait: '性格特征',
        preference: '偏好',
        bond: '关系牵连',
        emotion_imprint: '情绪烙印',
        goal: '目标',
        promise: '承诺',
        secret: '秘密',
        rumor: '传闻',
        major_plot_event: '重大剧情',
        minor_event: '普通事件',
        combat_event: '战斗事件',
        travel_event: '旅途事件',
        dialogue_quote: '对话原句',
        global_rule: '全局规则',
        city_rule: '城市规则',
        location_fact: '地点信息',
        item_rule: '物品规则',
        faction_rule: '派系规则',
        world_history: '世界历史',
        current_scene: '当前场景',
        current_conflict: '当前冲突',
        temporary_status: '临时状态',
        other: '其他',
    };
    return labels[normalized] || formatRecordEditorKeyLabel(normalized);
}

function formatMemorySourceScopeLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'self') return '自己';
    if (normalized === 'target') return '对象相关';
    if (normalized === 'group') return '群体共享';
    if (normalized === 'world') return '世界知识';
    if (normalized === 'system') return '系统补全';
    return formatRecordEditorKeyLabel(normalized || 'system');
}

function formatMemoryStageLabel(value: string): string {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'clear') return '清晰';
    if (normalized === 'blur') return '开始模糊';
    if (normalized === 'distorted') return '已经偏差';
    return formatRecordEditorKeyLabel(normalized || 'clear');
}function formatMemoryRecordSegmentLabel(segment: string): string {
    const trimmed = String(segment ?? '').trim();
    if (!trimmed) {
        return '';
    }
    const normalized = trimmed.toLowerCase();
    if (normalized === 'profile') return '人物资料';
    if (normalized === 'mode') return '风格模式';
    if (normalized === 'style') return '风格';
    if (normalized === 'semantic') return '语义设定';
    if (normalized === 'identity') return '身份设定';
    if (normalized === 'event') return '事件记录';
    if (normalized === 'summary') return '摘要内容';
    return formatRecordEditorKeyLabel(trimmed);
}

function splitMemoryRecordSegments(recordKey: string): string[] {
    const normalizedKey = String(recordKey ?? '').trim();
    if (!normalizedKey) {
        return [];
    }
    if (normalizedKey.includes('::')) {
        return normalizedKey.split('::').map((item: string): string => item.trim()).filter(Boolean);
    }
    if (normalizedKey.includes('/')) {
        return normalizedKey.split('/').map((item: string): string => item.trim()).filter(Boolean);
    }
    return [normalizedKey];
}

function isGeneratedMemoryRecordSegment(segment: string, actorLabel: string): boolean {
    const trimmed = String(segment ?? '').trim();
    if (!trimmed) {
        return true;
    }
    if (actorLabel && trimmed === actorLabel) {
        return true;
    }
    return /(?:^|[_\.\-])20\d{2}[-_]\d{2}[-_]\d{2}(?:$|[@_\.\-])/.test(trimmed)
        || /\b\d{1,2}h\d{1,2}m\d{1,2}s\d*ms\b/i.test(trimmed)
        || /\b\d{13,}\b/.test(trimmed);
}

function collectMemoryRecordDisplayParts(recordKey: string, owned: OwnedMemoryState): { actorLabel: string; labels: string[] } | null {
    const segments = splitMemoryRecordSegments(recordKey);
    if (segments.length <= 0) {
        return null;
    }

    let actorLabel = owned.ownerActorKey ? formatActorKeyLabel(owned.ownerActorKey) : '';
    const labels: string[] = [];
    const skipIndexes = new Set<number>();

    segments.forEach((segment: string, index: number): void => {
        if (skipIndexes.has(index)) {
            return;
        }
        const trimmed = String(segment ?? '').trim();
        const normalized = trimmed.toLowerCase();
        if (!normalized) {
            return;
        }
        if (/^(tavern_|chat:|session:|conversation:|memory:)/i.test(trimmed)) {
            return;
        }
        if (['character', 'assistant', 'name'].includes(normalized) && segments[index + 1]) {
            actorLabel = formatActorKeyLabel(`${normalized}:${segments[index + 1]}`);
            skipIndexes.add(index + 1);
            return;
        }
        if (normalized === 'role' && segments[index + 1]) {
            actorLabel = formatActorKeyLabel(`${normalized}:${segments[index + 1]}`);
            skipIndexes.add(index + 1);
            return;
        }
        if (normalized.startsWith('character:') || normalized.startsWith('assistant:') || normalized.startsWith('name:') || normalized.startsWith('role:')) {
            actorLabel = formatActorKeyLabel(trimmed);
            return;
        }
        if (isGeneratedMemoryRecordSegment(trimmed, actorLabel)) {
            return;
        }

        const previous = segments[index - 1]?.trim().toLowerCase() || '';
        if (normalized === 'mode' && previous === 'style') {
            labels.push('风格模式');
            return;
        }
        if (normalized === 'profile' && (previous === 'character' || previous === 'assistant' || previous === 'name' || previous.startsWith('character:') || previous.startsWith('assistant:') || previous.startsWith('name:'))) {
            labels.push('人物资料');
            return;
        }

        const label = formatMemoryRecordSegmentLabel(trimmed);
        if (!label || label === actorLabel) {
            return;
        }
        labels.push(label);
    });

    const compactLabels = labels.filter(Boolean).filter((label: string, index: number, array: string[]): boolean => index === 0 || label !== array[index - 1]);
    if (compactLabels.length >= 2 && compactLabels[compactLabels.length - 1] === '风格模式' && compactLabels[compactLabels.length - 2] === '风格') {
        compactLabels.splice(compactLabels.length - 2, 1);
    }
    if (!actorLabel && compactLabels.length <= 0) {
        return null;
    }
    return { actorLabel, labels: compactLabels };
}

function buildReadableMemoryRecordHeadline(recordKey: string, owned: OwnedMemoryState): string | null {
    const parts = collectMemoryRecordDisplayParts(recordKey, owned);
    if (!parts) {
        return null;
    }

    const summaryLabel = parts.labels[parts.labels.length - 1] || '';
    if (parts.actorLabel && summaryLabel) {
        return parts.actorLabel === summaryLabel ? parts.actorLabel : `${parts.actorLabel} · ${summaryLabel}`;
    }
    if (parts.actorLabel) {
        return parts.actorLabel;
    }
    if (parts.labels.length >= 2) {
        return parts.labels.slice(-2).join(' / ');
    }
    return parts.labels[0] || null;
}

function buildReadableMemoryRecordContext(recordKey: string, owned: OwnedMemoryState): string | null {
    const parts = collectMemoryRecordDisplayParts(recordKey, owned);
    if (!parts || parts.labels.length <= 1) {
        return null;
    }
    return parts.labels.join(' / ');
}

function buildMemoryRecordTooltip(recordKey: string, owned: OwnedMemoryState): string {
    const readableHeadline = buildReadableMemoryRecordHeadline(recordKey, owned);
    const readableContext = buildReadableMemoryRecordContext(recordKey, owned);
    return [
        readableHeadline ? `记忆说明：${readableHeadline}` : '',
        readableContext ? `记忆层级：${readableContext}` : '',
        `内部键：${String(recordKey ?? '').trim() || '暂无'}`,
    ].filter(Boolean).join('\n');
}

function buildMemoryRecordHeadline(recordKey: string, _lifecycle: MemoryLifecycleState | undefined, owned: OwnedMemoryState): string {
    const normalizedKey = String(recordKey ?? '').trim();
    if (!normalizedKey) {
        return '未命名记忆';
    }
    const readableHeadline = buildReadableMemoryRecordHeadline(normalizedKey, owned);
    if (readableHeadline) {
        return readableHeadline;
    }
    if (owned.recordKind === 'state' || normalizedKey.includes('/')) {
        return formatHumanReadableTopic(normalizedKey, '未命名记忆');
    }
    return compactInternalIdentifier(normalizedKey, 54);
}

function renderMemoryEventRefs(eventIds: string[] | undefined, eventTitleMap: Map<string, string>, emptyLabel: string): string {
    const items = Array.isArray(eventIds) ? eventIds.filter(Boolean) : [];
    if (items.length <= 0) {
        return `<span class="stx-re-json">${escapeHtml(emptyLabel)}</span>`;
    }
    return items.slice(0, 4).map((eventId: string): string => {
        const title = eventTitleMap.get(eventId) || compactInternalIdentifier(eventId, 40);
        return `<span class="stx-re-json" title="${escapeHtml(eventId)}">${escapeHtml(title)}</span>`;
    }).join('');
}

function formatMemoryImpactSummary(owned: OwnedMemoryState): string {
    const reinforcedCount = Array.isArray(owned.reinforcedByEventIds) ? owned.reinforcedByEventIds.length : 0;
    const invalidatedCount = Array.isArray(owned.invalidatedByEventIds) ? owned.invalidatedByEventIds.length : 0;
    if (owned.memorySubtype === 'major_plot_event') {
        return '这条记忆本身就是重大事件，会主动影响其他记忆。';
    }
    if (reinforcedCount <= 0 && invalidatedCount <= 0) {
        return '当前还没有检测到重大事件对它的直接影响。';
    }
    const parts: string[] = [];
    if (reinforcedCount > 0) {
        parts.push(`被强化 ${reinforcedCount} 次`);
    }
    if (invalidatedCount > 0) {
        parts.push(`被覆盖/冲淡 ${invalidatedCount} 次`);
    }
    return parts.join(' · ');
}

const MEMORY_SUBTYPE_OPTIONS: string[] = [
    'identity',
    'trait',
    'preference',
    'bond',
    'emotion_imprint',
    'goal',
    'promise',
    'secret',
    'rumor',
    'major_plot_event',
    'minor_event',
    'combat_event',
    'travel_event',
    'dialogue_quote',
    'global_rule',
    'city_rule',
    'location_fact',
    'item_rule',
    'faction_rule',
    'world_history',
    'current_scene',
    'current_conflict',
    'temporary_status',
    'other',
];

function parseImportanceInput(input: string | null, _fallback: number): number | null {
    const text = String(input ?? '').trim();
    if (!text) {
        return null;
    }
    const numeric = Number(text);
    if (!Number.isFinite(numeric)) {
        return null;
    }
    if (numeric > 1) {
        return Math.max(0, Math.min(1, numeric / 100));
    }
    return Math.max(0, Math.min(1, numeric));
}

/**
 * 功能：把少量固定英文值转换成更易懂的中文。
 * @param value 原始值。
 * @returns 中文化后的值。
 */
function formatReadableScalarText(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '未填写';
    }
    const normalized = trimmed.toLowerCase();
    return RE_VALUE_I18N[normalized] || trimmed;
}

/**
 * 功能：把值转换成更适合用户阅读的中文短句，避免直接展示 JSON/代码结构。
 * @param value 原始值。
 * @param depth 当前递归深度。
 * @returns 中文化后的文本。
 */
function formatReadableValueText(value: unknown, depth: number = 0): string {
    if (value === null || value === undefined) {
        return '未填写';
    }
    if (typeof value === 'string') {
        const normalized = value.replace(/\s+/g, ' ').trim();
        const listItems = extractDisplayListItems(normalized, depth + 1);
        if (listItems.length > 0) {
            return listItems.join('、');
        }
        return normalized ? formatReadableScalarText(normalized) : '未填写';
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            return '未填写';
        }
        return Number.isInteger(value)
            ? String(value)
            : value.toFixed(3).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
    }
    if (typeof value === 'boolean') {
        return value ? '是' : '否';
    }
    if (Array.isArray(value)) {
        if (value.length === 0) {
            return '未填写';
        }
        const renderedItems = value
            .slice(0, 6)
            .map((item: unknown): string => formatReadableValueText(item, depth + 1))
            .filter((item: string): boolean => Boolean(item) && item !== '未填写');
        if (renderedItems.length === 0) {
            return '未填写';
        }
        return `${renderedItems.join('、')}${value.length > 6 ? ' 等内容' : ''}`;
    }
    if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).filter(([, itemValue]: [string, unknown]): boolean => itemValue !== undefined);
        if (entries.length === 0) {
            return '未填写';
        }
        return entries.slice(0, depth > 0 ? 3 : 5).map(([key, itemValue]: [string, unknown]): string => {
            const label = formatRecordEditorKeyLabel(key);
            const renderedValue = formatReadableValueText(itemValue, depth + 1);
            return renderedValue === '未填写' ? label : `${label}：${renderedValue}`;
        }).join('；');
    }
    return String(value);
}

/**
 * 功能：渲染更适合展示的中文值视图；编辑态仍保留原始键值编辑能力。
 * @param value 原始值。
 * @param isEditing 是否处于编辑态。
 * @returns HTML 字符串。
 */
function renderReadableValueHtml(value: unknown, isEditing: boolean): string {
    if (isEditing) {
        return renderRawValueHtml(value, true);
    }

    if (typeof value !== 'object' || value === null) {
        return `<div style="word-break: break-word; white-space: pre-wrap;">${renderReadableValueFragmentHtml(value)}</div>`;
    }

    const entries = Object.entries(value as Record<string, unknown>).filter(([, itemValue]: [string, unknown]): boolean => itemValue !== undefined);
    if (entries.length === 0) {
        return '<div>未填写</div>';
    }

    return `
        <div class="stx-re-kv">
            ${entries.map(([key, itemValue]: [string, unknown]): string => {
                const displayKey = formatRecordEditorKeyLabel(key);
                const renderedValueHtml = renderReadableValueFragmentHtml(itemValue);
                return `<div class="stx-re-kv-row"><div class="stx-re-kv-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}:</div><div class="stx-re-kv-val">${renderedValueHtml}</div></div>`;
            }).join('')}
        </div>
    `;
}

/**
 * 功能：构建摘要记录的主标题。
 * @param record 原始摘要记录。
 * @returns 主标题文本。
 */
function buildSummaryHeadline(record: RawRecord): string {
    const title = String(record.title ?? '').trim();
    if (title) {
        return title;
    }
    return formatSummaryLevelLabel(String(record.level ?? ''));
}

/**
 * 功能：构建摘要记录的辅助说明。
 * @param record 原始摘要记录。
 * @returns 辅助说明文本。
 */
function buildSummarySubtitle(record: RawRecord): string {
    const keywords = Array.isArray(record.keywords)
        ? (record.keywords as unknown[]).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
        : [];
    const parts = [
        `层级：${formatSummaryLevelLabel(String(record.level ?? ''))}`,
        keywords.length > 0 ? `关键词：${keywords.join('、')}` : '关键词：未提取',
    ];
    const createdAt = Number(record.createdAt ?? 0);
    if (createdAt > 0) {
        parts.push(`生成于 ${formatTimeLabel(createdAt)}`);
    }
    return joinReadableMeta(parts);
}

/**
 * 功能：把多个描述片段拼成一行辅助说明。
 * @param parts 片段列表。
 * @returns 合并后的辅助说明。
 */
function joinReadableMeta(parts: string[]): string {
    return parts.map((part: string): string => String(part ?? '').trim()).filter(Boolean).join(' · ');
}

/**
 * 功能：判断事实记录是否存在结构信息缺失。
 * @param record 原始事实记录。
 * @returns 是否需要提示结构待整理。
 */
function isFactStructurallyIncomplete(record: RawRecord): boolean {
    const entity = record.entity as Record<string, unknown> | undefined;
    const entityKind = String(entity?.kind ?? '').trim();
    const entityId = String(entity?.id ?? '').trim();
    const path = String(record.path ?? '').trim();
    return !entityKind || !entityId || !path;
}

/**
 * 功能：渲染带标题、说明和内部提示的记录摘要块。
 * @param title 主标题。
 * @param subtitle 辅助说明。
 * @param internalLabel 内部信息标签。
 * @param internalValue 内部信息原值。
 * @param flagText 右上角提示文案。
 * @returns HTML 字符串。
 */
function renderRecordSummaryMarkup(
    title: string,
    subtitle: string,
    internalLabel: string,
    internalValue: string,
    flagText: string = '',
): string {
    const normalizedTitle = String(title ?? '').trim() || '未命名';
    const normalizedSubtitle = String(subtitle ?? '').trim() || '暂无补充说明';
    const normalizedInternalValue = String(internalValue ?? '').trim();
    return `
        <div class="stx-re-record-main">
            <div class="stx-re-record-title-row">
                <div class="stx-re-record-title">${escapeHtml(normalizedTitle)}</div>
                ${flagText ? `<span class="stx-re-record-flag">${escapeHtml(flagText)}</span>` : ''}
            </div>
            <div class="stx-re-record-sub">${escapeHtml(normalizedSubtitle)}</div>
            ${normalizedInternalValue ? `<div class="stx-re-record-code" title="${escapeHtml(normalizedInternalValue)}">${escapeHtml(internalLabel)}：${escapeHtml(compactInternalIdentifier(normalizedInternalValue))}</div>` : ''}
        </div>
    `.trim();
}

/**
 * 功能：渲染原始值的查看或编辑 HTML。
 * @param value 原始值
 * @param isEditing 是否处于编辑态
 * @returns HTML 字符串
 */
function renderRawValueHtml(value: unknown, isEditing: boolean): string {
    if (typeof value !== 'object' || value === null) {
        const text = escapeHtml(stringifyDisplayValue(value));
        if (isEditing) {
            return `<div contenteditable="true" class="stx-re-kv-input" data-key="__primitive__">${text}</div>`;
        }
        return `<div style="word-break: break-all;">${text}</div>`;
    }

    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
        return isEditing
            ? '<div contenteditable="true" class="stx-re-kv-input" data-key="__primitive__">{}</div>'
            : '<div>{}</div>';
    }

    return `
        <div class="stx-re-kv">
            ${entries.map(([key, itemValue]: [string, unknown]): string => {
                const renderedValue = escapeHtml(stringifyDisplayValue(itemValue));
                const displayKey = formatRecordEditorKeyLabel(key);
                if (isEditing) {
                    return `<div class="stx-re-kv-row"><div class="stx-re-kv-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}:</div><div contenteditable="true" class="stx-re-kv-input" data-key="${escapeHtml(key)}">${renderedValue}</div></div>`;
                }
                return `<div class="stx-re-kv-row"><div class="stx-re-kv-key" title="${escapeHtml(key)}">${escapeHtml(displayKey)}:</div><div class="stx-re-kv-val">${renderedValue}</div></div>`;
            }).join('')}
        </div>
    `;
}

/**
 * 功能：从原始行编辑 DOM 中读取用户编辑后的值。
 * @param editableDiv 编辑容器
 * @param dataType 数据类型
 * @returns 解析后的值
 */
function readRawEditedValue(editableDiv: HTMLElement, dataType: string | null): unknown {
    if (dataType !== 'object') {
        const input = editableDiv.querySelector('.stx-re-kv-input') as HTMLElement | null;
        return parseLooseValue(input?.textContent ?? '');
    }

    const inputs = editableDiv.querySelectorAll('.stx-re-kv-input');
    if (inputs.length === 1 && inputs[0].getAttribute('data-key') === '__primitive__') {
        return parseLooseValue(inputs[0].textContent ?? '');
    }

    const result: Record<string, unknown> = {};
    inputs.forEach((item: Element): void => {
        const element = item as HTMLElement;
        const key = String(element.dataset.key ?? '').trim();
        if (!key || key === '__primitive__') {
            return;
        }
        result[key] = parseLooseValue(element.textContent ?? '');
    });
    return result;
}

/**
 * 功能：打开 MemoryOS 记录编辑器。
 * @param options 打开选项。
 * @returns 无返回值
 */
export async function openRecordEditor(options: RecordEditorOpenOptions = {}): Promise<void> {
    initThemeKernel();
    ensureSharedTooltip();

    let currentViewMode: ViewMode = options.initialView ?? 'world';
    let btnSaveRef: HTMLButtonElement | null = null;
    let worldUiInteractionController: AbortController | null = null;

    const dialog = openSharedDialog({
        id: 'stx-record-editor-overlay',
        layout: 'bare',
        rootClassName: 'stx-record-editor-overlay ui-widget',
        chrome: false,
        closeOnBackdrop: true,
        closeOnEscape: true,
        beforeClose: (): boolean => {
            if (currentViewMode === 'raw' && !btnSaveRef?.disabled) {
                return confirm('当前仍有未保存的原始库表修改，关闭后将丢失。确定继续吗？');
            }
            return true;
        },
        onAfterClose: (): void => {
            vectorViewerController?.reset();
            void disposeRecordMemory();
        },
    });
    const overlay = dialog.root;
    mountThemeHost(overlay);

    const panel = document.createElement('div');
    panel.className = 'stx-record-editor';

    panel.innerHTML = `
        <div class="stx-re-header">
            <div class="stx-re-title">
                <i class="fa-solid fa-database"></i>
                <span>MemoryOS 记录编辑器</span>
            </div>
            <div class="stx-re-header-actions">
                <button class="stx-re-btn danger" id="stx-re-btn-clear-db"${buildTipAttr('清空整个 MemoryOS 数据库。危险操作，不可恢复。')}><i class="fa-solid fa-radiation"></i> 一键清空数据库</button>
                <div class="stx-re-close" id="stx-re-close-btn" title="关闭 (Esc)"${buildTipAttr('关闭记录编辑器。若当前还在原始数据表中且有未保存修改，会再次确认。')}>
                    <i class="fa-solid fa-xmark"></i>
                </div>
            </div>
        </div>
        <div class="stx-re-body">
            <div class="stx-re-sidebar">
                <div class="stx-re-sidebar-title"><i class="fa-regular fa-comments"></i> 会话列表</div>
                <div class="stx-re-sidebar-list" id="stx-re-chat-list"></div>
            </div>
            <div class="stx-re-main">
                <div class="stx-re-view-tabs" id="stx-re-view-tabs">
                    <div class="stx-re-tab is-active" data-view="world"${buildTipAttr(RECORD_EDITOR_VIEW_META.world.tip)}><span>${RECORD_EDITOR_VIEW_META.world.label}</span></div>
                    <div class="stx-re-tab" data-view="memory"${buildTipAttr(RECORD_EDITOR_VIEW_META.memory.tip)}><span>${RECORD_EDITOR_VIEW_META.memory.label}</span></div>
                    <div class="stx-re-tab" data-view="vector"${buildTipAttr(RECORD_EDITOR_VIEW_META.vector.tip)}><span>${RECORD_EDITOR_VIEW_META.vector.label}</span></div>
                    <div class="stx-re-tab" data-view="diagnostics"${buildTipAttr(RECORD_EDITOR_VIEW_META.diagnostics.tip)}><span>${RECORD_EDITOR_VIEW_META.diagnostics.label}</span></div>
                    <div class="stx-re-tab" data-view="raw"${buildTipAttr(RECORD_EDITOR_VIEW_META.raw.tip)}><span>${RECORD_EDITOR_VIEW_META.raw.label}</span></div>
                </div>
                <div class="stx-re-view-hero" id="stx-re-view-hero"></div>
                <div class="stx-re-tabs" id="stx-re-raw-tabs">
                    <div class="stx-re-tab is-active" data-table="events"${buildTipAttr(RECORD_EDITOR_RAW_TAB_META.events.tip)}>${RECORD_EDITOR_RAW_TAB_META.events.label}</div>
                    <div class="stx-re-tab" data-table="facts"${buildTipAttr(RECORD_EDITOR_RAW_TAB_META.facts.tip)}>${RECORD_EDITOR_RAW_TAB_META.facts.label}</div>
                    <div class="stx-re-tab" data-table="summaries"${buildTipAttr(RECORD_EDITOR_RAW_TAB_META.summaries.tip)}>${RECORD_EDITOR_RAW_TAB_META.summaries.label}</div>
                    <div class="stx-re-tab" data-table="audit"${buildTipAttr(RECORD_EDITOR_RAW_TAB_META.audit.tip)}>${RECORD_EDITOR_RAW_TAB_META.audit.label}</div>
                    <div class="stx-re-tab" data-table="memory_mutation_history"${buildTipAttr(RECORD_EDITOR_RAW_TAB_META.memory_mutation_history.tip)}>${RECORD_EDITOR_RAW_TAB_META.memory_mutation_history.label}</div>
                </div>
                <div class="stx-re-content" id="stx-re-content-area"><div class="stx-re-empty">正在加载数据...</div></div>
                <div class="stx-re-footer" id="stx-re-footer">
                    <div class="stx-re-footer-left">
                        <button class="stx-re-btn danger is-hidden" id="stx-re-btn-batch-del"${buildTipAttr('删除当前勾选的原始记录。只有在原始数据表视图中可用。')}>批量删除选中</button>
                    </div>
                    <div class="stx-re-footer-right">
                        <div class="stx-re-pending-msg" id="stx-re-pending-msg"><i class="fa-solid fa-triangle-exclamation"></i> 有未保存的修改</div>
                        <button class="stx-re-btn save" id="stx-re-btn-save" disabled${buildTipAttr('将当前原始数据表中的挂起编辑与删除操作写回数据库。')}>保存修改</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    dialog.content.appendChild(panel);

    const contentArea = panel.querySelector('#stx-re-content-area') as HTMLElement;
    const closeBtn = panel.querySelector('#stx-re-close-btn') as HTMLElement | null;
    const rawTabsContainer = panel.querySelector('#stx-re-raw-tabs') as HTMLElement;
    const viewTabsContainer = panel.querySelector('#stx-re-view-tabs') as HTMLElement;
    const viewHero = panel.querySelector('#stx-re-view-hero') as HTMLElement;
    const chatListContainer = panel.querySelector('#stx-re-chat-list') as HTMLElement;
    const btnSave = panel.querySelector('#stx-re-btn-save') as HTMLButtonElement;
    btnSaveRef = btnSave;
    const btnBatchDelete = panel.querySelector('#stx-re-btn-batch-del') as HTMLButtonElement;
    const pendingMsg = panel.querySelector('#stx-re-pending-msg') as HTMLElement;
    const btnClearDb = panel.querySelector('#stx-re-btn-clear-db') as HTMLButtonElement;
    const footer = panel.querySelector('#stx-re-footer') as HTMLElement;

    let currentRawTable: RawTableName = options.rawTable ?? options.focusRaw?.tableName ?? 'events';
    let currentChatKey = getCurrentMemoryChatKey();
    let currentSort: CurrentSort = { col: '', asc: false };
let currentLogicTableKey = '';
let currentMemoryActorKey = '__all__';
let currentMemorySearchQuery = '';
let currentWorldStateScopeFilter = '__all__';
let currentWorldStateKeywordFilter = '';
let logicCreateExpanded = false;
let recordMemory: MemorySDKImpl | null = null;
let recordMemoryChatKey = '';
const selectedLogicRowIds = new Set<string>();
const currentWorldStateSectionTypeFilters = new Map<string, string>();
let currentWorldStateRenderSeq = 0;
let pendingWorldStateFocusSectionKey: string | null = null;
let pendingWorldStateOpenSectionKeys: Set<string> | null = null;
let pendingWorldStateFocusRowKey: string | null = null;
let pendingRawFocus: PendingRawFocus | null = options.focusRaw ?? null;
let vectorViewerController: VectorMemoryViewerController | null = null;
    if ((options.rawTable || options.focusRaw) && !options.initialView) {
        currentViewMode = 'raw';
    }
    const pendingChanges = {
        deletes: new Set<string>(),
        updates: new Map<string, PendingRawUpdate>(),
    };

    /**
     * 功能：同步指定聊天的共享摘要。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    async function syncChatSignal(chatKey: string): Promise<void> {
        if (!chatKey) {
            return;
        }
        const [factCount, eventCount, activeTemplateId, latestSummary] = await Promise.all([
            db.facts.where('[chatKey+updatedAt]').between([chatKey, 0], [chatKey, Infinity]).count(),
            db.events.where('[chatKey+ts]').between([chatKey, 0], [chatKey, Infinity]).count(),
            db.meta.get(chatKey).then((meta: DBMeta | undefined): string | null => {
                return String(meta?.activeTemplateId ?? '').trim() || null;
            }),
            db.summaries
                .where('[chatKey+level+createdAt]')
                .between([chatKey, '', 0], [chatKey, '\uffff', Infinity])
                .last(),
        ]);
        await patchSdkChatShared(chatKey, {
            signals: {
                [MEMORY_OS_PLUGIN_ID]: {
                    activeTemplate: activeTemplateId,
                    eventCount,
                    factCount,
                    lastSummaryAt: latestSummary?.createdAt ?? null,
                },
            },
        });
    }

    /**
     * 功能：释放当前记录编辑器持有的 MemorySDK 实例。
     * @returns 无返回值
     */
    async function disposeRecordMemory(): Promise<void> {
        if (!recordMemory) {
            return;
        }
        try {
            await recordMemory.chatState.destroy();
        } catch (error) {
            logger.warn('释放记录编辑器 chatState 失败', error);
        }
        try {
            recordMemory.template.destroy();
        } catch (error) {
            logger.warn('释放记录编辑器 template 失败', error);
        }
        recordMemory = null;
        recordMemoryChatKey = '';
    }

    /**
     * 功能：确保当前聊天存在临时 MemorySDK 实例。
     * @returns MemorySDK 实例；未选中聊天时返回 null
     */
    async function ensureRecordMemory(): Promise<MemorySDKImpl | null> {
        if (!currentChatKey) {
            await disposeRecordMemory();
            return null;
        }
        if (recordMemory && recordMemoryChatKey === currentChatKey) {
            return recordMemory;
        }
        await disposeRecordMemory();
        recordMemory = new MemorySDKImpl(currentChatKey);
        await recordMemory.init();
        recordMemoryChatKey = currentChatKey;
        return recordMemory;
    }

    /**
     * 功能：切换到原始数据表并尝试聚焦指定记录。
     * @param target 原始表聚焦目标。
     * @returns 无返回值。
     */
    async function jumpToRawTarget(target: VectorMemoryViewerSourceJumpTarget): Promise<void> {
        pendingRawFocus = {
            tableName: target.tableName,
            recordId: target.recordId,
            messageId: target.messageId,
        };
        currentViewMode = 'raw';
        currentRawTable = target.tableName;
        currentSort = { col: '', asc: false };
        updateChromeState();
        await renderActiveView();
    }

    /**
     * 功能：跳转到 world_state 相关任务来源，并尝试定位对应条目。
     * @param row 任务行数据。
     * @returns 无返回值。
     */
    async function jumpToWorldStateQuestSource(row: WorldQuestBoardRow): Promise<void> {
        const stateKey = String(row.stateKey ?? '').trim();
        const statePath = String(row.statePath ?? '').trim();
        pendingWorldStateFocusSectionKey = null;
        pendingWorldStateOpenSectionKeys = null;
        pendingWorldStateFocusRowKey = stateKey || null;
        currentWorldStateScopeFilter = '__all__';
        if (stateKey) {
            currentWorldStateKeywordFilter = '';
        } else if (statePath) {
            currentWorldStateKeywordFilter = statePath;
        }
        currentViewMode = 'raw';
        currentRawTable = 'world_state';
        currentSort = { col: '', asc: false };
        updateChromeState();
        await renderActiveView();
    }

    /**
     * 功能：在原始表完成渲染后聚焦指定记录。
     * @param tableName 当前原始表名。
     * @returns 无返回值。
     */
    function applyPendingRawFocus(tableName: RawTableName): void {
        if (!pendingRawFocus || pendingRawFocus.tableName !== tableName) {
            return;
        }
        const escapeSelector = (window as Window & { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
        const buildSelector = (attribute: 'data-record-id' | 'data-message-id', value?: string): string => {
            const normalized = String(value ?? '').trim();
            if (!normalized) {
                return '';
            }
            if (escapeSelector) {
                return `tr[${attribute}="${escapeSelector(normalized)}"]`;
            }
            return `tr[${attribute}="${normalized.replace(/"/g, '\\"')}"]`;
        };
        const recordSelector = buildSelector('data-record-id', pendingRawFocus.recordId);
        const messageSelector = buildSelector('data-message-id', pendingRawFocus.messageId);
        const row = (recordSelector ? contentArea.querySelector(recordSelector) : null)
            || (messageSelector ? contentArea.querySelector(messageSelector) : null);
        pendingRawFocus = null;
        if (!(row instanceof HTMLElement)) {
            return;
        }
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const previousOutline = row.style.outline;
        const previousBackground = row.style.background;
        row.style.outline = '2px solid color-mix(in srgb, var(--SmartThemeQuoteColor, #ef7d2d) 88%, white 12%)';
        row.style.background = 'color-mix(in srgb, var(--SmartThemeQuoteColor, #ef7d2d) 18%, transparent)';
        window.setTimeout((): void => {
            row.style.outline = previousOutline;
            row.style.background = previousBackground;
        }, 2600);
    }

    vectorViewerController = new VectorMemoryViewerController({
        container: contentArea,
        getMemory: async (): Promise<MemorySDKImpl> => {
            const memory = await ensureRecordMemory();
            if (!memory) {
                throw new Error('当前未选中聊天。');
            }
            return memory;
        },
        onJumpToRaw: async (target: VectorMemoryViewerSourceJumpTarget): Promise<void> => {
            await jumpToRawTarget(target);
        },
    });

    /**
     * 功能：刷新底部保存区状态。
     * @returns 无返回值
     */
    function updateFooterState(): void {
        const hasChanges = pendingChanges.deletes.size > 0 || pendingChanges.updates.size > 0;
        btnSave.disabled = !hasChanges;
        pendingMsg.classList.toggle('visible', hasChanges);
    }

    function updateViewHeroState(): void {
        const meta = RECORD_EDITOR_VIEW_META[currentViewMode];
        const rawMeta = currentViewMode === 'raw'
            ? RECORD_EDITOR_RAW_TAB_META[(currentRawTable === 'world_state' ? 'events' : currentRawTable) as VisibleRawTableName]
            : null;
        const currentChatLabel = currentChatKey ? formatChatKeyLabel(currentChatKey) : '全局记录';
        const subtitle = currentViewMode === 'raw' && rawMeta
            ? `${meta.subtitle} · 当前子表：${rawMeta.label}`
            : meta.subtitle;
        const statusLabel = currentViewMode === 'raw'
            ? (rawMeta?.label || '原始数据表')
            : meta.label;
        const glyphHtml = currentViewMode === 'world'
            ? `<img class="stx-re-view-hero-glyph-img" src="${escapeHtml(WORLD_INFO_HERO_ICON_URL)}" alt="" />`
            : `<i class="${meta.icon}"></i>`;
        viewHero.dataset.viewMode = currentViewMode;
        viewHero.innerHTML = `
            <div class="stx-re-view-hero-glyph" aria-hidden="true">${glyphHtml}</div>
            <div class="stx-re-view-hero-main">
                <div class="stx-re-view-hero-title"><span>${escapeHtml(meta.title)}</span></div>
                <div class="stx-re-view-hero-sub">${escapeHtml(subtitle)}</div>
            </div>
            <div class="stx-re-view-hero-meta">
                <span class="stx-re-rpg-badge"${buildTipAttr(`当前查看的主区域：${statusLabel}`)}>${escapeHtml(statusLabel)}</span>
                <span class="stx-re-rpg-badge"${buildTipAttr(`当前绑定聊天：${currentChatKey || '全局记录'}`)}>${escapeHtml(currentChatLabel)}</span>
                <span class="stx-re-rpg-badge"${buildTipAttr('界面样式会自动跟随 SDK/theme 的主题变量变化。')}>主题联动已启用</span>
            </div>
        `;
    }

    /**
     * 功能：根据当前视图模式更新界面显隐。
     * @returns 无返回值
     */
    function updateChromeState(): void {
        rawTabsContainer.style.display = currentViewMode === 'raw' ? '' : 'none';
        footer.style.display = currentViewMode === 'raw' ? '' : 'none';
        updateViewHeroState();
        viewTabsContainer.querySelectorAll('.stx-re-tab').forEach((tab: Element): void => {
            const element = tab as HTMLElement;
            element.classList.toggle('is-active', element.dataset.view === currentViewMode);
        });
        rawTabsContainer.querySelectorAll('.stx-re-tab').forEach((tab: Element): void => {
            const element = tab as HTMLElement;
            element.classList.toggle('is-active', element.dataset.table === currentRawTable);
        });
    }

    /**
     * 功能：激活指定聊天项。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    function activateChatItem(chatKey: string): void {
        activateMemoryChatSidebarItem(chatListContainer, chatKey, '.stx-re-chat-item');
    }

    /**
     * 功能：移除当前打开的右键菜单。
     * @returns 无返回值
     */
    function removeContextMenus(): void {
        document.querySelectorAll('.stx-re-ctx-menu').forEach((menu: Element): void => menu.remove());
        document.querySelectorAll('.is-context-target').forEach((target: Element): void => {
            (target as HTMLElement).classList.remove('is-context-target');
        });
    }

    /**
     * 功能：加载聊天列表并附带 MemoryOS 摘要。
     * @returns 无返回值
     */
    async function loadChatKeys(): Promise<void> {
        try {
            const items = await loadMemoryChatSidebarItems({
                activeChatKey: currentChatKey,
                recoverArchivedIfHostExists: true,
            });
            renderMemoryChatSidebarList(chatListContainer, items, {
                activeChatKey: currentChatKey,
                includeGlobalEntry: true,
                globalEntryTitle: '全局记录',
                globalEntryMetaLine1: 'Database Root',
                globalEntryMetaLine2: '仅原始库表可查看',
            });
            activateChatItem(currentChatKey);
        } catch (error) {
            logger.error('加载聊天列表失败', error);
            chatListContainer.innerHTML = '<div class="stx-re-empty is-error">聊天列表加载失败</div>';
        }
    }

    /**
     * 功能：读取当前原始库表记录。
     * @param tableName 表名
     * @returns 记录数组
     */
    async function getRawRecords(tableName: RawTableName): Promise<RawRecord[]> {
        const queryTable = (db as unknown as Record<RawTableName, any>)[tableName];
        const baseQuery = currentChatKey ? queryTable.where('chatKey').equals(currentChatKey) : queryTable.toCollection();
        const needReverse = tableName === 'events' || tableName === 'audit' || tableName === 'memory_mutation_history';
        const directionalQuery = needReverse ? baseQuery.reverse() : baseQuery;
        const limitedQuery = (tableName === 'events' || tableName === 'audit' || tableName === 'memory_mutation_history')
            ? directionalQuery.limit(tableName === 'events' ? 1000 : 500)
            : directionalQuery;
        return limitedQuery.toArray() as Promise<RawRecord[]>;
    }

    /**
     * 功能：刷新原始库表批量选择状态。
     * @returns 无返回值
     */
    function updateRawSelectionState(): void {
        const rowCheckboxes = contentArea.querySelectorAll('.stx-re-select-row:not(:disabled)') as NodeListOf<HTMLInputElement>;
        const checkedCount = Array.from(rowCheckboxes).filter((checkbox: HTMLInputElement): boolean => checkbox.checked).length;
        const masterCheckbox = contentArea.querySelector('.stx-re-select-all') as HTMLInputElement | null;
        if (masterCheckbox) {
            masterCheckbox.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
        }
        btnBatchDelete.classList.toggle('is-hidden', checkedCount === 0);
        if (checkedCount > 0) {
            btnBatchDelete.textContent = `批量删除选中 (${checkedCount})`;
        }
    }

    /**
     * 功能：保存原始库表中的挂起修改。
     * @returns 无返回值
     */
    async function saveRawChanges(): Promise<void> {
        try {
            const deleteEntries = Array.from(pendingChanges.deletes);
            const updateEntries = Array.from(pendingChanges.updates.values());
            const writeRequests: Array<{ tableName: RawTableName; id: string; payload: unknown; action: 'update' | 'delete'; item: RawRecord | null }> = [];
            for (const pendingKey of deleteEntries) {
                const parsedKey = parsePendingKey(pendingKey);
                if (!parsedKey.tableName || !parsedKey.id) {
                    continue;
                }
                const table = (db as unknown as Record<RawTableName, any>)[parsedKey.tableName];
                const item = await table.get(parsedKey.id);
                if (!item) {
                    continue;
                }
                writeRequests.push({
                    tableName: parsedKey.tableName,
                    id: parsedKey.id,
                    payload: null,
                    action: 'delete',
                    item: item as RawRecord,
                });
            }

            for (const updateInfo of updateEntries) {
                const table = (db as unknown as Record<RawTableName, any>)[updateInfo.tableName];
                const item = await table.get(updateInfo.id);
                if (!item) {
                    continue;
                }
                writeRequests.push({
                    tableName: updateInfo.tableName,
                    id: updateInfo.id,
                    payload: updateInfo.payload,
                    action: 'update',
                    item: item as RawRecord,
                });
            }

            if (writeRequests.length > 0 && currentChatKey) {
                const memory = (window as any).STX?.memory;
                if (memory?.proposal?.requestWrite) {
                    const facts: Array<Record<string, unknown>> = [];
                    const summaries: Array<Record<string, unknown>> = [];
                    const patches: Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }> = [];
                    for (const request of writeRequests) {
                        if (request.tableName === 'facts') {
                            const factKey = String((request.item as any).factKey ?? '').trim();
                            if (!factKey) {
                                continue;
                            }
                            facts.push({
                                factKey,
                                targetRecordKey: factKey,
                                action: request.action === 'delete' ? 'delete' : 'update',
                                type: String((request.item as any).type ?? '').trim(),
                                entity: (request.item as any).entity,
                                path: String((request.item as any).path ?? '').trim(),
                                value: request.action === 'delete' ? (request.item as any).value : request.payload,
                                confidence: (request.item as any).confidence,
                                provenance: (request.item as any).provenance,
                            });
                        } else if (request.tableName === 'summaries') {
                            const summaryId = String((request.item as any).summaryId ?? '').trim();
                            if (!summaryId) {
                                continue;
                            }
                            summaries.push({
                                summaryId,
                                targetRecordKey: summaryId,
                                action: request.action === 'delete' ? 'delete' : 'update',
                                level: String((request.item as any).level ?? 'scene') as 'message' | 'scene' | 'arc',
                                title: request.action === 'delete' ? (request.item as any).title : (request.item as any).title,
                                content: request.action === 'delete' ? String((request.item as any).content ?? '') : String(request.payload ?? ''),
                                keywords: Array.isArray((request.item as any).keywords) ? (request.item as any).keywords : [],
                            });
                        } else if (request.tableName === 'world_state') {
                            const path = String((request.item as any).path ?? request.id).trim();
                            if (!path) {
                                continue;
                            }
                            patches.push(request.action === 'delete'
                                ? { op: 'remove', path }
                                : { op: 'replace', path, value: request.payload });
                        }
                    }

                    await memory.proposal.requestWrite({
                        source: { pluginId: MEMORY_OS_PLUGIN_ID, version: '1.0.0' },
                        chatKey: currentChatKey,
                        reason: 'raw_editor_save',
                        proposal: {
                            facts: facts.length > 0 ? facts as any[] : undefined,
                            summaries: summaries.length > 0 ? summaries as any[] : undefined,
                            patches: patches.length > 0 ? patches : undefined,
                        },
                    });
                }

                const auditManager = new AuditManager(currentChatKey);
                if (deleteEntries.length > 0) {
                    await auditManager.log({
                        action: 'manual.delete',
                        actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                        before: { keys: deleteEntries },
                        after: {},
                    });
                }
                if (updateEntries.length > 0) {
                    await auditManager.log({
                        action: 'manual.edit',
                        actor: { pluginId: MEMORY_OS_PLUGIN_ID, mode: 'manual' },
                        before: {},
                        after: {
                            updates: updateEntries.map((item: PendingRawUpdate): Record<string, string> => ({
                                id: item.id,
                                tableName: item.tableName,
                            })),
                        },
                    });
                }
                await syncChatSignal(currentChatKey);
                await loadChatKeys();
            }

            pendingChanges.deletes.clear();
            pendingChanges.updates.clear();
            updateFooterState();
            toast.success('原始库表修改已保存');
            await renderActiveView();
        } catch (error) {
            logger.error('保存原始库表修改失败', error);
            toast.error(`保存失败: ${String(error)}`);
        }
    }

    async function renderWorldStateStructuredView(options: { preserveContent?: boolean } = {}): Promise<void> {
        const renderSeq = ++currentWorldStateRenderSeq;
        const preservedOpenSectionKeys = new Set<string>(Array.from(contentArea.querySelectorAll('.stx-re-world-section-collapsible[open]')).map((node: Element): string => String((node as HTMLElement).dataset.worldSectionKey ?? '').trim()).filter(Boolean));
        const nextOpenSectionKeys = new Set<string>(preservedOpenSectionKeys);
        const preserveContent = Boolean(options.preserveContent && contentArea.querySelector('.stx-re-world-overview-top'));
        if (pendingWorldStateOpenSectionKeys) {
            pendingWorldStateOpenSectionKeys.forEach((sectionKey: string): void => {
                const normalized = String(sectionKey ?? '').trim();
                if (normalized) {
                    nextOpenSectionKeys.add(normalized);
                }
            });
            pendingWorldStateOpenSectionKeys = null;
        }
        const nextFocusSectionKey = pendingWorldStateFocusSectionKey;
        pendingWorldStateFocusSectionKey = null;
        const nextFocusRowKey = pendingWorldStateFocusRowKey;
        pendingWorldStateFocusRowKey = null;
        const nextScrollTop = nextFocusSectionKey ? null : contentArea.scrollTop;
        if (!preserveContent) {
            contentArea.innerHTML = '<div class="stx-re-empty">正在加载世界状态...</div>';
        }
        if (!currentChatKey) {
            if (!preserveContent) {
                contentArea.innerHTML = '<div class="stx-re-empty">世界状态需要先选择一个具体聊天。</div>';
            }
            return;
        }

        const memory = await ensureRecordMemory();
        if (!memory) {
            if (!preserveContent) {
                contentArea.innerHTML = '<div class="stx-re-empty">无法为当前聊天建立 MemorySDK。</div>';
            }
            return;
        }

        const [rawEntries, experience, ownedStates] = await Promise.all([
            memory.state.queryStructured(''),
            memory.editor.getExperienceSnapshot() as Promise<EditorExperienceSnapshot>,
            memory.chatState.getOwnedMemoryStates(240) as Promise<OwnedMemoryState[]>,
        ]);
        if (renderSeq !== currentWorldStateRenderSeq) {
            return;
        }
        const visibleEntries = rawEntries.filter((entry: StructuredWorldStateEntry): boolean => !isInternalWorldStateAggregateEntry(entry));
        const dedupedEntryMap = new Map<string, StructuredWorldStateEntry>();
        visibleEntries.forEach((entry: StructuredWorldStateEntry): void => {
            const raw = getWorldStateRawObject(entry);
            const canonical = String(raw.canonicalKey || entry.node.canonicalKey || '').trim();
            const dedupeKey = canonical || entry.stateKey || entry.path;
            const existing = dedupedEntryMap.get(dedupeKey);
            if (!existing) {
                dedupedEntryMap.set(dedupeKey, entry);
                return;
            }
            const existingScore = Number(existing.updatedAt ?? 0) + Number(existing.node.confidence ?? 0);
            const nextScore = Number(entry.updatedAt ?? 0) + Number(entry.node.confidence ?? 0);
            dedupedEntryMap.set(dedupeKey, nextScore >= existingScore ? entry : existing);
        });
        const worldStateEntries = Array.from(dedupedEntryMap.values());
        const actorLabelMap = new Map<string, string>();
        experience.canon.characters.forEach((character): void => {
            const actorKey = String(character.actorKey ?? '').trim();
            if (!actorKey) {
                return;
            }
            actorLabelMap.set(actorKey, resolveActorDisplayLabel(actorKey, String(character.displayName ?? actorKey).trim() || actorKey));
        });
        ownedStates.forEach((item: OwnedMemoryState): void => {
            const ownerActorKey = String(item.ownerActorKey ?? '').trim();
            if (ownerActorKey && !actorLabelMap.has(ownerActorKey)) {
                actorLabelMap.set(ownerActorKey, ownerActorKey);
            }
        });
        const majorEventEntries = buildMajorEventWorldStateEntries(ownedStates, actorLabelMap);
        const entries = [...worldStateEntries, ...majorEventEntries];
        const scopeStats = entries.reduce<Map<string, number>>((map, entry: StructuredWorldStateEntry): Map<string, number> => {
            const key = String(entry.node.scopeType ?? 'scene');
            map.set(key, (map.get(key) ?? 0) + 1);
            return map;
        }, new Map<string, number>());
        const filteredByScope = entries.filter((entry: StructuredWorldStateEntry): boolean => {
            return currentWorldStateScopeFilter === '__all__' || entry.node.scopeType === currentWorldStateScopeFilter;
        });
        const filteredEntries = filteredByScope
            .filter((entry: StructuredWorldStateEntry): boolean => matchWorldStateKeyword(entry, currentWorldStateKeywordFilter))
            .sort((left: StructuredWorldStateEntry, right: StructuredWorldStateEntry): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0));
        const sectionCategoryShortcutItems: WorldStateSectionCategoryShortcutItem[] = [];
        const majorEventCount = entries.filter((entry: StructuredWorldStateEntry): boolean => entry.node.stateType === 'event').length;
        const currentLocationValue = isStableSnapshotValue(experience.canon.world.currentLocation)
            ? String(experience.canon.world.currentLocation?.value ?? '').trim()
            : '';
        const currentSceneValue = isStableSnapshotValue(experience.canon.scene.currentScene)
            ? String(experience.canon.scene.currentScene?.value ?? '').trim()
            : '';
        const currentConflictValue = isStableSnapshotValue(experience.canon.scene.currentConflict)
            ? String(experience.canon.scene.currentConflict?.value ?? '').trim()
            : '';
        const worldOverviewRaw = String(experience.canon.world.overview?.value ?? '').trim();
        const participantLabels = getStableSnapshotValues(experience.canon.scene.participants)
            .map((item: SnapshotValue): string => String(item.value ?? '').trim())
            .filter(Boolean);
        const pendingEventLabels = getStableSnapshotValues(experience.canon.scene.pendingEvents)
            .filter((item: SnapshotValue): boolean => !isSyntheticVisibleMessageSnapshot(item))
            .map((item: SnapshotValue): string => String(item.value ?? '').trim())
            .filter(Boolean);
        const lorebookLabels = getStableSnapshotValues(experience.canon.world.activeLorebooks)
            .map((item: SnapshotValue): string => String(item.value ?? '').trim())
            .filter(Boolean);
        const ruleSummaryItems = getStableSnapshotValues(experience.canon.world.rules)
            .map((item: SnapshotValue): string => String(item.value ?? '').trim())
            .filter(Boolean);
        const hardConstraintItems = getStableSnapshotValues(experience.canon.world.hardConstraints)
            .map((item: SnapshotValue): string => String(item.value ?? '').trim())
            .filter(Boolean);
        const uniqueCities = new Set(entries.map((entry: StructuredWorldStateEntry): string => {
            return resolveWorldStateCityLabel(entry);
        }).filter(Boolean));
        const uniqueLocations = new Set(entries.map((entry: StructuredWorldStateEntry): string => {
            return resolveWorldStateLocationLabel(entry);
        }).filter(Boolean));
        const uniqueRegions = new Set(entries.map((entry: StructuredWorldStateEntry): string => {
            return resolveWorldStateRegionLabel(entry);
        }).filter(Boolean));
        const uniqueNations = new Set(entries.map((entry: StructuredWorldStateEntry): string => {
            return resolveWorldStateNationLabel(entry);
        }).filter(Boolean));
        const boundSubjects = new Set(entries.map((entry: StructuredWorldStateEntry): string => {
            const raw = getWorldStateRawObject(entry);
            return String(entry.node.subjectId || pickWorldStateText(raw, ['subject', 'actor', 'character']) || '').trim();
        }).filter(Boolean));
        const ruleEntryCount = entries.filter((entry: StructuredWorldStateEntry): boolean => ['rule', 'constraint', 'culture', 'capability'].includes(String(entry.node.stateType ?? ''))).length;
        const organizationEntryCount = entries.filter((entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'organization' || entry.node.stateType === 'ownership').length;
        const anomalyEntryCount = entries.filter((entry: StructuredWorldStateEntry): boolean => hasWorldStateStructuralAnomaly(entry)).length;
        const explicitKeywordEntryCount = entries.filter((entry: StructuredWorldStateEntry): boolean => hasExplicitWorldStateKeywords(entry)).length;
        const autoKeywordEntryCount = Math.max(0, entries.length - explicitKeywordEntryCount);
        const keywordCoveredCount = entries.filter((entry: StructuredWorldStateEntry): boolean => ((entry.node.keywords?.length ?? 0) > 0) || ((entry.node.tags?.length ?? 0) > 0)).length;
        const confidenceValues = entries
            .map((entry: StructuredWorldStateEntry): number => Number(entry.node.confidence))
            .filter((value: number): boolean => Number.isFinite(value));
        const averageConfidence = confidenceValues.length > 0
            ? confidenceValues.reduce((sum: number, value: number): number => sum + value, 0) / confidenceValues.length
            : null;
        const recentThreshold = Date.now() - (24 * 60 * 60 * 1000);
        const recentlyUpdatedCount = entries.filter((entry: StructuredWorldStateEntry): boolean => Number(entry.updatedAt ?? 0) >= recentThreshold).length;
        let recognizedGroupCount = 0;
        const readinessChecks = [
            Boolean(worldOverviewRaw),
            Boolean(currentLocationValue),
            Boolean(currentSceneValue),
            Boolean(currentConflictValue),
            ruleSummaryItems.length > 0,
            participantLabels.length > 0,
            uniqueCities.size > 0 || uniqueLocations.size > 0,
        ];
        const readinessScore = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);
        const coldStartRecommendations = [
            !worldOverviewRaw ? '补 1 句世界背景总览' : '',
            !currentLocationValue ? '补当前位置锚点' : '',
            !currentSceneValue ? '补当前场景摘要' : '',
            !currentConflictValue ? '补主冲突线索' : '',
            ruleSummaryItems.length <= 0 ? '补世界基础规则' : '',
            hardConstraintItems.length <= 0 ? '补不可违背硬约束' : '',
            participantLabels.length <= 0 ? '补场景参与者' : '',
            uniqueCities.size <= 0 && uniqueLocations.size <= 0 ? '补城市 / 地点图鉴' : '',
        ].filter(Boolean);

        const scopeButtons = [
            { key: '__all__', label: `全部 (${entries.length})` },
            ...Array.from(scopeStats.entries()).sort((left, right): number => right[1] - left[1]).map(([key, count]: [string, number]) => ({
                key,
                label: `${formatWorldStateScopeLabel(key)} (${count})`,
            })),
        ];
        if (currentWorldStateScopeFilter !== '__all__' && !scopeButtons.some((item: { key: string; label: string }): boolean => item.key === currentWorldStateScopeFilter)) {
            currentWorldStateScopeFilter = '__all__';
        }

        const assignedSectionKeys = new Set<string>();
        const renderedSectionNavItems: Array<{ key: string; title: string; iconClass: string; badgeText: string }> = [];
        const pickStateSection = (options: {
            sectionKey: string;
            title: string;
            description: string;
            iconClass: string;
            predicate: (entry: StructuredWorldStateEntry) => boolean;
            columns: WorldStateSectionColumn<StructuredWorldStateEntry>[];
            allowTypeTabs?: boolean;
        }): string => {
            const sectionEntries = filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => {
                if (assignedSectionKeys.has(entry.stateKey)) {
                    return false;
                }
                return options.predicate(entry);
            });
            sectionEntries.forEach((entry: StructuredWorldStateEntry): void => {
                assignedSectionKeys.add(entry.stateKey);
            });
            const hasTypeTabs = options.allowTypeTabs !== false && shouldShowWorldStateSectionTypeTabs(options.sectionKey);
            const typeView = hasTypeTabs && sectionEntries.length > 0
                ? buildWorldStateSectionCategoryViewModel(
                    options.sectionKey,
                    sectionEntries,
                    currentWorldStateSectionTypeFilters.get(options.sectionKey) ?? '',
                )
                : null;
            if (typeView && typeView.typeTabs.length > 1) {
                currentWorldStateSectionTypeFilters.set(options.sectionKey, typeView.activeTypeKey);
                typeView.typeTabs.forEach((tab: WorldStateSectionTypeTab): void => {
                    sectionCategoryShortcutItems.push({
                        sectionKey: options.sectionKey,
                        sectionTitle: options.title,
                        typeKey: tab.key,
                        typeLabel: tab.label,
                        count: tab.count,
                    });
                });
            } else if (hasTypeTabs) {
                currentWorldStateSectionTypeFilters.delete(options.sectionKey);
            }
            const visibleSectionEntries = typeView && typeView.typeTabs.length > 1
                ? filterWorldStateEntriesByType(sectionEntries, typeView.activeTypeKey)
                : sectionEntries;
            if (sectionEntries.length > 0) {
                renderedSectionNavItems.push({
                    key: options.sectionKey,
                    title: options.title,
                    iconClass: options.iconClass,
                    badgeText: `${sectionEntries.length} 条`,
                });
            }
            return renderWorldStateSectionTable<StructuredWorldStateEntry>({
                sectionKey: options.sectionKey,
                title: options.title,
                description: options.description,
                iconClass: options.iconClass,
                badgeText: typeView && typeView.typeTabs.length > 1
                    ? `${visibleSectionEntries.length}/${sectionEntries.length} 条`
                    : `${sectionEntries.length} 条`,
                badgeTip: typeView && typeView.typeTabs.length > 1
                    ? `${options.title} 当前显示 ${visibleSectionEntries.length} 条，共 ${sectionEntries.length} 条可切换记录。`
                    : `${options.title} 当前共有 ${sectionEntries.length} 条生效记录。`,
                rows: visibleSectionEntries,
                rowKey: (entry: StructuredWorldStateEntry): string => entry.stateKey,
                columns: options.columns,
                typeTabs: typeView?.typeTabs,
                open: nextOpenSectionKeys.has(options.sectionKey),
            }, { buildTipAttr });
        };

        const cityColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '城市 / 区域',
                tip: '城市状态主卡，显示城市、区域与摘要。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前城市的主状态说明。', [
                        renderWorldStateMiniMeta('城市', resolveWorldStateCityLabel(entry) || '未知'),
                        renderWorldStateMiniMeta('区域', resolveWorldStateRegionLabel(entry, { strictParent: true }) || '未知'),
                    ]);
                },
            },
            {
                label: '城市局势',
                tip: '展示城市当前的状态、阶段、危险或文化气质。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const statePills = [
                        formatWorldStateTypeLabel(entry.node.stateType),
                        pickWorldStateText(raw, ['status', 'phase', 'mood', 'tone']),
                        ...pickWorldStateTextList(raw, ['states', 'conditions', 'hazards']),
                    ].filter(Boolean);
                    return `${renderWorldStatePillList(statePills, '暂无局势标签')}${renderWorldStateMiniMeta('摘要', entry.node.summary || '暂无说明')}`;
                },
            },
            {
                label: '地标 / 规则',
                tip: '展示城市关联的地标、规则或特殊约束。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const items = [
                        ...pickWorldStateTextList(raw, ['landmarks', 'districts', 'locations', 'rules']),
                        entry.node.locationId || '',
                    ].filter(Boolean);
                    return `${renderWorldStatePillList(items, '暂无地标或规则')}${renderWorldStateMiniMeta('锚点', formatWorldStateAnchorSummary(entry))}`;
                },
            },
            {
                label: '关联角色',
                tip: '哪些角色对这条城市状态有明显关联。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateActorList(entry, ownedStates, actorLabelMap),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const nationColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '国家 / 政体',
                tip: '国家、王国、帝国、联邦等高层政治实体主卡。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前国家/政体说明。', [
                        renderWorldStateMiniMeta('国家', resolveWorldStateNationLabel(entry, { strictParent: true }) || '未知'),
                        renderWorldStateMiniMeta('政体', pickWorldStateText(raw, ['government', 'regime', 'polity', '政体']) || formatWorldStateTypeLabel(entry.node.stateType)),
                    ]);
                },
            },
            {
                label: '治理 / 权力',
                tip: '统治者、权力结构、法统或制度性标签。',
                width: '22%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        pickWorldStateText(raw, ['ruler', 'leader', 'government', 'regime']),
                        pickWorldStateText(raw, ['capital', 'capitalCity']),
                        ...pickWorldStateTextList(raw, ['laws', 'institutions', 'traits']),
                    ].filter(Boolean), '暂无治理信息');
                },
            },
            {
                label: '疆域 / 附属',
                tip: '国家名下的区域、城市与属地。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        entry.node.regionId || '',
                        entry.node.cityId || '',
                        ...pickWorldStateTextList(raw, ['regions', 'cities', 'territories']),
                    ].filter(Boolean), '暂无疆域信息');
                },
            },
            {
                label: '关键词 / 标签',
                tip: '国家/政体的检索标签。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateKeywordGroup(entry),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const regionColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '区域 / 地理',
                tip: '区域、地理带、地貌与广域环境主卡。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前区域/地理说明。', [
                        renderWorldStateMiniMeta('区域', resolveWorldStateRegionLabel(entry, { strictParent: true }) || '未知'),
                        renderWorldStateMiniMeta('国家', resolveWorldStateNationLabel(entry, { strictParent: true }) || '未知'),
                    ]);
                },
            },
            {
                label: '地貌 / 气候',
                tip: '地形、生态、气候等宏观地理信息。',
                width: '22%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        pickWorldStateText(raw, ['terrain', 'geography', 'climate', 'biome']),
                        ...pickWorldStateTextList(raw, ['traits', 'features', 'landmarks']),
                    ].filter(Boolean), '暂无地理信息');
                },
            },
            {
                label: '城市 / 地点',
                tip: '该区域下挂接的城市和地点。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        entry.node.cityId || '',
                        entry.node.locationId || '',
                        ...pickWorldStateTextList(raw, ['cities', 'locations', 'districts']),
                    ].filter(Boolean), '暂无下属锚点');
                },
            },
            {
                label: '关联角色',
                tip: '与这片区域明显相关的角色。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateActorList(entry, ownedStates, actorLabelMap),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const locationColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '地点 / 场景',
                tip: '地点主卡，适合展示场景、位置、房间、区域节点。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前地点的状态说明。', [
                        renderWorldStateMiniMeta('地点', resolveWorldStateLocationLabel(entry) || '未知'),
                        renderWorldStateMiniMeta('城市', resolveWorldStateCityLabel(entry, { strictParent: true }) || '未知'),
                    ]);
                },
            },
            {
                label: '场景状态',
                tip: '当前地点的状态、氛围、限制或危险信息。',
                width: '22%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const cards = [
                        renderWorldStateCompactInfoCard('状态', pickWorldStateValue(raw, ['status', 'phase', 'condition', 'conditions']) ?? formatWorldStateTypeLabel(entry.node.stateType), '暂无'),
                        renderWorldStateCompactInfoCard('氛围', pickWorldStateValue(raw, ['mood', 'tone', 'trait', 'traits']), '暂无'),
                        renderWorldStateCompactInfoCard('危险 / 限制', pickWorldStateValue(raw, ['hazards', 'hazard', 'restrictions', 'restriction']), entry.node.summary || '暂无'),
                    ];
                    return `<div class="stx-re-world-compact-card-grid">${cards.join('')}</div>`;
                },
            },
            {
                label: '相关对象',
                tip: '显示地点内关联的人物、物品或主体。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const related = [
                        entry.node.subjectId || '',
                        entry.node.itemId || '',
                        ...pickWorldStateTextList(raw, ['actors', 'participants', 'items', 'subjects']),
                    ].filter(Boolean);
                    return renderWorldStatePillList(related, '暂无相关对象');
                },
            },
            {
                label: '关键词 / 线索',
                tip: '地点相关的关键词、标签和线索。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([...(entry.node.keywords ?? []), ...(entry.node.tags ?? [])], '暂无线索'),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const ruleColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '规则 / 法典',
                tip: '规则条目主卡，展示规则名、摘要和规则类型。',
                width: '24%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, buildWorldStateLeadSummary(entry, '当前规则的核心说明。'), [
                        renderWorldStateMiniMeta('规则类型', formatWorldStateTypeLabel(entry.node.stateType)),
                        renderWorldStateMiniMeta('知识级别', formatWorldStateKnowledgeLevelLabel(raw.knowledgeLevel ?? entry.node.knowledgeLevel)),
                        renderWorldStateMiniMeta('适用对象', entry.node.subjectId || pickWorldStateText(raw, ['subject', 'target', 'appliesTo']) || '未指定'),
                    ]);
                },
            },
            {
                label: '适用范围',
                tip: '规则会影响到哪个城市、地点、角色或全局范围。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const scopeItems = [
                        formatWorldStateScopeLabel(entry.node.scopeType),
                        entry.node.cityId || '',
                        entry.node.locationId || '',
                        entry.node.regionId || '',
                        pickWorldStateText(raw, ['scopeLabel', 'region', 'area']),
                    ].filter(Boolean);
                    return renderWorldStatePillList(scopeItems, '暂无范围信息');
                },
            },
            {
                label: '法典要点',
                tip: '把规则正文拆成更可读的法典条目列表。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const listItems = extractWorldStateListItems(entry, ['rules', 'constraints', 'entries', 'items', 'content']);
                    const exception = pickWorldStateText(raw, ['exception', 'exceptionRule', 'override']);
                    return `
                        <div class="stx-re-world-codex-card">
                            ${renderWorldStateCodexList(listItems, '暂无规则要点')}
                            ${exception ? `<div class="stx-re-world-codex-note">例外：${escapeHtml(exception)}</div>` : ''}
                        </div>
                    `;
                },
            },
            {
                label: '检索线索',
                tip: '用于索引该规则的关键词和路径标签。关键词可能来自上游结构化结果，也可能是系统自动抽词。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateKeywordGroup(entry),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '10%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const factionColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '对象 / 组织',
                tip: '展示归属对象、势力组织或物品主卡。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '归属关系说明。', [
                        renderWorldStateMiniMeta('主体', entry.node.subjectId || pickWorldStateText(raw, ['subject', 'owner', 'holder']) || '未标记'),
                        renderWorldStateMiniMeta('组织 / 归属', pickWorldStateText(raw, ['organization', 'organizationName', 'ownerOrganization', 'ownershipStatus']) || entry.node.itemId || '未标记'),
                        renderWorldStateMiniMeta('位置', entry.node.locationId || pickWorldStateText(raw, ['location', 'locationName']) || '未标记'),
                    ]);
                },
            },
            {
                label: '归属关系',
                tip: '对象当前的归属或控制关系。',
                width: '22%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const items = [
                        formatWorldStateTypeLabel(entry.node.stateType),
                        pickWorldStateText(raw, ['status', 'ownership', 'ownershipStatus', 'relation', 'alignment', 'parentOrganizationName']),
                        ...pickWorldStateTextList(raw, ['relations', 'owners', 'affiliations', 'organizationAliases']),
                    ].filter(Boolean);
                    return renderWorldStatePillList(items, '暂无归属信息');
                },
            },
            {
                label: '关联角色 / 物件',
                tip: '与该归属关系有关的角色和物品。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const related = [
                        ...getWorldStateAwareActors(entry, ownedStates, actorLabelMap),
                        ...pickWorldStateTextList(raw, ['items', 'characters', 'participants', 'relatedActorKeys']),
                    ];
                    return renderWorldStatePillList(Array.from(new Set(related)), '暂无关联对象');
                },
            },
            {
                label: '标签 / 线索',
                tip: '用来快速识别归属关系的标签与关键词。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([...(entry.node.keywords ?? []), ...(entry.node.tags ?? [])], '暂无线索'),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const characterColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '角色 / 状态',
                tip: '角色主卡，显示角色名、状态说明与主键。',
                width: '28%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '角色相关状态说明。', [
                        renderWorldStateMiniMeta('角色', entry.node.subjectId || pickWorldStateText(raw, ['character', 'actor', 'subject']) || '未标记'),
                        renderWorldStateMiniMeta('状态', pickWorldStateText(raw, ['status', 'condition', 'emotion']) || formatWorldStateTypeLabel(entry.node.stateType)),
                    ]);
                },
            },
            {
                label: '组织归属',
                tip: '角色当前所属势力组织及归属关系。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const organizationItems = [
                        pickWorldStateText(raw, ['organization', 'organizationName', 'ownerOrganization']),
                        ...pickWorldStateTextList(raw, ['organizationNames', 'organizations', 'organizationMemberships']),
                    ].filter(Boolean);
                    return renderWorldStatePillList(organizationItems, '暂无组织归属');
                },
            },
            {
                label: '当前位置 / 当前任务',
                tip: '角色当前位置与当前任务推进。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const lines = [
                        renderWorldStateMiniMeta('位置', entry.node.locationId || pickWorldStateText(raw, ['location', 'currentLocation']) || '未知'),
                        renderWorldStateMiniMeta('任务', pickWorldStateText(raw, ['task', 'objective', 'activeTask']) || pickWorldStateTextList(raw, ['activeTasks', 'tasks'])[0] || '暂无'),
                    ];
                    return `<div class="stx-re-world-meta-stack">${lines.join('')}</div>`;
                },
            },
            {
                label: '关联局势',
                tip: '角色当前卷入的事件、冲突或规则。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList(pickWorldStateTextList(raw, ['conflicts', 'relations', 'events', 'rules']), '暂无局势挂钩');
                },
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const characterGoalColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '角色 / 关系',
                tip: '角色关系链与绑定对象。',
                width: '30%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '角色关系说明。', [
                        renderWorldStateMiniMeta('角色', entry.node.subjectId || pickWorldStateText(raw, ['character', 'actor', 'subject']) || '未标记'),
                        renderWorldStateMiniMeta('类型', formatWorldStateTypeLabel(entry.node.stateType)),
                    ]);
                },
            },
            {
                label: '关系标签',
                tip: '角色关系类型与关系状态标签。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        pickWorldStateText(raw, ['relationship', 'relationType', 'bond', 'label']),
                        ...pickWorldStateTextList(raw, ['relations', 'relationships', 'relationTags']),
                    ].filter(Boolean), '暂无关系');
                },
            },
            {
                label: '关系 / 对象',
                tip: '角色与谁存在关系、依赖、冲突或绑定。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        pickWorldStateText(raw, ['target', 'counterpart', 'bondTarget']),
                        ...pickWorldStateTextList(raw, ['relations', 'relationships', 'allies', 'enemies']),
                    ].filter(Boolean), '暂无关系对象');
                },
            },
            {
                label: '相关线索',
                tip: '当前目标/关系挂接的事件、地点或规则。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        entry.node.locationId || '',
                        ...pickWorldStateTextList(raw, ['events', 'conflicts', 'rules']),
                    ].filter(Boolean), '暂无挂接线索');
                },
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const dangerColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '危险 / 威胁',
                tip: '显式危险、威胁、风险与危机条目。',
                width: '30%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前危险/威胁说明。', [
                        renderWorldStateMiniMeta('范围', formatWorldStateScopeLabel(entry.node.scopeType)),
                        renderWorldStateMiniMeta('强度', pickWorldStateText(raw, ['severity', 'level', 'threatLevel']) || '未标记'),
                    ]);
                },
            },
            {
                label: '影响对象',
                tip: '这条威胁正影响哪些区域、城市、地点或角色。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([
                    entry.node.regionId || '',
                    entry.node.cityId || '',
                    entry.node.locationId || '',
                    entry.node.subjectId || '',
                ].filter(Boolean), '暂无影响对象'),
            },
            {
                label: '危险要点',
                tip: '危险来源、触发条件和后果。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStatePillList([
                        pickWorldStateText(raw, ['source', 'trigger', 'cause']),
                        pickWorldStateText(raw, ['effect', 'impact', 'result']),
                        ...pickWorldStateTextList(raw, ['hazards', 'risks']),
                    ].filter(Boolean), '暂无危险要点');
                },
            },
            {
                label: '关联角色',
                tip: '与这条危险直接相关的角色。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateActorList(entry, ownedStates, actorLabelMap),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const anomalyColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '待归类 / 异常',
                tip: '未被正确识别、锚点不完整或结构可疑的条目。',
                width: '30%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '结构异常或待归类。', [
                    renderWorldStateMiniMeta('作用域', formatWorldStateScopeLabel(entry.node.scopeType)),
                    renderWorldStateMiniMeta('类型', formatWorldStateTypeLabel(entry.node.stateType)),
                ]),
            },
            {
                label: '异常标记',
                tip: '系统发现的结构异常原因。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList(entry.node.anomalyFlags ?? [], '暂无异常标记'),
            },
            {
                label: '锚点状态',
                tip: '条目当前可识别的锚点。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => `<div class="stx-re-record-sub">${escapeHtml(formatWorldStateAnchorSummary(entry))}</div>`,
            },
            {
                label: '标签',
                tip: '便于后续人工整理的标签和关键词。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([...(entry.node.keywords ?? []), ...(entry.node.tags ?? [])], '暂无标签'),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const historyColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '事件 / 局势',
                tip: '局势与历史主卡，适合查看大事件、危险、历史变动。',
                width: '30%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    return renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '当前局势或历史信息说明。', [
                        renderWorldStateMiniMeta('类型', formatWorldStateTypeLabel(entry.node.stateType)),
                        renderWorldStateMiniMeta('范围', formatWorldStateScopeLabel(entry.node.scopeType)),
                        renderWorldStateMiniMeta('阶段', pickWorldStateText(raw, ['phase', 'status', 'stage']) || '未标记'),
                    ]);
                },
            },
            {
                label: '影响范围',
                tip: '事件主要影响哪些区域、城市、地点或对象。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const scopeItems = [
                        entry.node.regionId || '',
                        entry.node.cityId || '',
                        entry.node.locationId || '',
                        entry.node.subjectId || '',
                        formatWorldStateScopeLabel(entry.node.scopeType),
                    ].filter(Boolean);
                    return renderWorldStatePillList(scopeItems, '暂无影响范围');
                },
            },
            {
                label: '当前影响',
                tip: '当前局势产生的后果、危险或推进影响。',
                width: '22%',
                render: (entry: StructuredWorldStateEntry): string => {
                    const raw = getWorldStateRawObject(entry);
                    const cards = [
                        renderWorldStateCompactInfoCard('影响', pickWorldStateValue(raw, ['impact', 'effect', 'result']) ?? entry.node.summary, '暂无'),
                        renderWorldStateCompactInfoCard('危险', pickWorldStateValue(raw, ['danger', 'risk']), '暂无'),
                    ];
                    return `<div class="stx-re-world-compact-card-grid">${cards.join('')}</div>`;
                },
            },
            {
                label: '相关角色',
                tip: '与该局势相关的角色列表。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateActorList(entry, ownedStates, actorLabelMap),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const otherColumns: WorldStateSectionColumn<StructuredWorldStateEntry>[] = [
            {
                label: '状态条目',
                tip: '未被前面分类命中的剩余世界状态条目。',
                width: '32%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateEntryPrimaryCell(entry, entry.node.summary || '剩余状态说明。', [
                    renderWorldStateMiniMeta('作用域', formatWorldStateScopeLabel(entry.node.scopeType)),
                    renderWorldStateMiniMeta('锚点', formatWorldStateAnchorSummary(entry)),
                ]),
            },
            {
                label: '分类',
                tip: '当前条目的作用域、状态类型与结构标签。',
                width: '18%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([formatWorldStateScopeLabel(entry.node.scopeType), formatWorldStateTypeLabel(entry.node.stateType)], '暂无分类'),
            },
            {
                label: '说明',
                tip: '剩余状态的摘要说明。',
                width: '20%',
                render: (entry: StructuredWorldStateEntry): string => `<div class="stx-re-record-sub">${escapeHtml(entry.node.summary || '暂无说明')}</div>`,
            },
            {
                label: '标签',
                tip: '剩余状态的标签与关键词。',
                width: '16%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStatePillList([...(entry.node.keywords ?? []), ...(entry.node.tags ?? [])], '暂无标签'),
            },
            {
                label: '更新时间',
                tip: '最近更新时间和置信度。',
                width: '14%',
                render: (entry: StructuredWorldStateEntry): string => renderWorldStateUpdateCell(entry),
            },
        ];

        const questRows = buildWorldQuestBoardRows(experience, ownedStates, entries, actorLabelMap).filter((row: WorldQuestBoardRow): boolean => {
            if (!currentWorldStateKeywordFilter) {
                return true;
            }
            return normalizeLookup([
                row.title,
                row.kind,
                row.priorityLabel || '',
                row.summary,
                row.objective,
                row.sourceLabel,
                (row.relatedActors ?? []).join(' '),
            ].join(' ')).includes(normalizeLookup(currentWorldStateKeywordFilter));
        });
        const questRowMap = new Map<string, WorldQuestBoardRow>(questRows.map((row: WorldQuestBoardRow): [string, WorldQuestBoardRow] => [row.rowKey, row]));
        const showQuestSection = currentWorldStateScopeFilter === '__all__' || currentWorldStateScopeFilter === 'scene' || currentWorldStateScopeFilter === 'global';

        const sectionHtml = [
            pickStateSection({
                sectionKey: 'nation',
                title: '国家与政体',
                description: '国家、王国、帝国、联邦与高层治理结构。',
                iconClass: 'fa-solid fa-crown',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'nation' || Boolean(entry.node.nationId),
                columns: nationColumns,
            }),
            pickStateSection({
                sectionKey: 'region',
                title: '区域地理',
                description: '区域、地貌、气候与广域地理结构。',
                iconClass: 'fa-solid fa-mountain-sun',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'region',
                columns: regionColumns,
            }),
            pickStateSection({
                sectionKey: 'city',
                title: '城市志',
                description: '城市状态、区域氛围、城市规则与地标情报。',
                iconClass: 'fa-solid fa-city',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'city' || Boolean(entry.node.cityId),
                columns: cityColumns,
            }),
            pickStateSection({
                sectionKey: 'location',
                title: '地点图鉴',
                description: '地点、场景、房间与具体位置的即时状态。',
                iconClass: 'fa-solid fa-location-dot',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'location' || entry.node.scopeType === 'scene' || Boolean(entry.node.locationId),
                columns: locationColumns,
            }),
            showQuestSection ? renderWorldStateSectionTable<WorldQuestBoardRow>({
                sectionKey: 'quest',
                title: '任务进展',
                description: '仅展示结构化任务与场景待处理事件，按目标推进统一汇总。',
                iconClass: 'fa-solid fa-list-check',
                badgeText: `${questRows.length} 条`,
                badgeTip: `当前共整理出 ${questRows.length} 条任务进展线索。`,
                rows: questRows,
                rowKey: (row: WorldQuestBoardRow): string => row.rowKey,
                rowAttributes: (row: WorldQuestBoardRow): Record<string, string> => ({
                    'data-quest-row-key': row.rowKey,
                    'data-quest-record-key': row.recordKey || '',
                    'data-quest-state-key': row.stateKey || '',
                    'data-quest-state-path': row.statePath || '',
                }),
                columns: [
                    {
                        label: '任务 / 冲突',
                        tip: '任务板主标题，显示当前任务或冲突名称。',
                        width: '28%',
                        render: (row: WorldQuestBoardRow): string => `
                            <div class="stx-re-record-main">
                                <div class="stx-re-record-title-row">
                                    <div class="stx-re-record-title">${escapeHtml(row.title)}</div>
                                    <span class="stx-re-record-flag">${escapeHtml(row.kind)}</span>
                                </div>
                                <div class="stx-re-record-sub">${escapeHtml(row.summary || '暂无说明')}</div>
                            </div>
                        `,
                    },
                    {
                        label: '目标 / 推进',
                        tip: '当前任务的推进方向、目标或下一步。',
                        width: '24%',
                        render: (row: WorldQuestBoardRow): string => `
                            <div class="stx-re-record-sub">${escapeHtml(row.objective || '等待推进')}</div>
                            <div class="stx-re-record-code">来源：${escapeHtml(row.sourceLabel)}</div>
                            <div class="stx-re-actions" style="margin-top:6px; flex-wrap:wrap;">
                                ${(row.sourceRefs?.length ?? 0) > 0
        ? `<button class="stx-re-btn" data-quest-row-action="sources" data-quest-row-key="${escapeHtml(row.rowKey)}"${buildTipAttr('查看这条任务的来源详情。')}>来源</button>`
        : ''}
                                ${(row.recordKey || row.statePath || row.stateKey)
        ? `<button class="stx-re-btn" data-quest-row-action="jump" data-quest-row-key="${escapeHtml(row.rowKey)}"${buildTipAttr('跳转到这条任务对应的原始记录或世界状态。')}>跳转</button>`
        : ''}
                            </div>
                        `,
                    },
                    {
                        label: '相关角色',
                        tip: '跟这条任务或冲突相关的角色。',
                        width: '18%',
                        render: (row: WorldQuestBoardRow): string => renderWorldStatePillList(row.relatedActors, '暂无角色'),
                    },
                    {
                        label: '状态',
                        tip: '当前任务状态。',
                        width: '16%',
                        render: (row: WorldQuestBoardRow): string => renderWorldStatePillList([row.statusLabel], '暂无状态'),
                    },
                    {
                        label: '更新时间',
                        tip: '任务线索的最近更新时间。',
                        width: '14%',
                        render: (row: WorldQuestBoardRow): string => `<div class="stx-re-record-sub">${escapeHtml(row.updatedAt ? formatTimeLabel(row.updatedAt) : '暂无')}</div>`,
                    },
                ],
            }, { buildTipAttr }) : '',
            pickStateSection({
                sectionKey: 'rules',
                title: '规则法典',
                description: '规则、约束、文化与能力类条目集中查看。',
                iconClass: 'fa-solid fa-book-open',
                predicate: (entry: StructuredWorldStateEntry): boolean => ['rule', 'constraint', 'culture', 'capability'].includes(String(entry.node.stateType ?? '')),
                columns: ruleColumns,
            }),
            pickStateSection({
                sectionKey: 'other-world',
                title: '其他设定',
                description: '合法但不属于主分类的世界设定细节。',
                iconClass: 'fa-solid fa-compass-drafting',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.stateType === 'other',
                columns: otherColumns,
            }),
            pickStateSection({
                sectionKey: 'organization',
                title: '势力组织',
                description: '组织归属、层级关系、关联角色与控制范围。',
                iconClass: 'fa-solid fa-flag',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'organization' || entry.node.scopeType === 'item' || entry.node.stateType === 'ownership',
                columns: factionColumns,
            }),
            pickStateSection({
                sectionKey: 'character',
                title: '角色档案',
                description: '展示角色当前位置、组织归属与当前任务关联。',
                iconClass: 'fa-solid fa-user',
                predicate: (entry: StructuredWorldStateEntry): boolean => (entry.node.scopeType === 'character' || Boolean(entry.node.subjectId)) && !['task', 'relationship', 'relationship_hook'].includes(String(entry.node.stateType ?? '')),
                columns: characterColumns,
            }),
            pickStateSection({
                sectionKey: 'character-goal',
                title: '角色关系',
                description: '角色之间的关系、羁绊和关联线索。',
                iconClass: 'fa-solid fa-people-arrows',
                predicate: (entry: StructuredWorldStateEntry): boolean => entry.node.scopeType === 'character' && ['relationship', 'relationship_hook'].includes(String(entry.node.stateType ?? '')),
                columns: characterGoalColumns,
            }),
            renderWorldStateSectionTable<StructuredWorldStateEntry>({
                sectionKey: 'danger',
                title: '危险 / 威胁',
                description: '危险、风险、威胁与危机状态。',
                iconClass: 'fa-solid fa-triangle-exclamation',
                badgeText: `${filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => !assignedSectionKeys.has(entry.stateKey) && entry.node.stateType === 'danger').length} 条`,
                badgeTip: '显式危险/威胁条目。',
                rows: filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => !assignedSectionKeys.has(entry.stateKey) && entry.node.stateType === 'danger'),
                rowKey: (entry: StructuredWorldStateEntry): string => entry.stateKey,
                columns: dangerColumns,
            }, { buildTipAttr }),
            pickStateSection({
                sectionKey: 'event',
                title: '重大事件',
                description: '统一展示世界级与角色级的关键事件进展。',
                iconClass: 'fa-solid fa-landmark-flag',
                predicate: (entry: StructuredWorldStateEntry): boolean => ['event'].includes(String(entry.node.stateType ?? '')),
                columns: historyColumns,
            }),
            renderWorldStateSectionTable<StructuredWorldStateEntry>({
                sectionKey: 'other',
                title: '待归类 / 结构异常',
                description: '未命中特定分区、缺锚点或结构可疑的剩余世界状态。',
                iconClass: 'fa-solid fa-layer-group',
                badgeText: `${filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => !assignedSectionKeys.has(entry.stateKey)).length} 条`,
                badgeTip: '归类规则之外，或结构需要人工整理的状态条目。',
                rows: filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => !assignedSectionKeys.has(entry.stateKey)),
                rowKey: (entry: StructuredWorldStateEntry): string => entry.stateKey,
                columns: anomalyColumns,
            }, { buildTipAttr }),
        ].filter(Boolean).join('');

        if (showQuestSection && questRows.length > 0) {
            renderedSectionNavItems.splice(Math.min(renderedSectionNavItems.length, 3), 0, {
                key: 'quest',
                title: '任务进展',
                iconClass: 'fa-solid fa-list-check',
                badgeText: `${questRows.length} 条`,
            });
        }
        const otherCount = filteredEntries.filter((entry: StructuredWorldStateEntry): boolean => !assignedSectionKeys.has(entry.stateKey)).length;
        if (otherCount > 0 && !renderedSectionNavItems.some((item: { key: string }): boolean => item.key === 'other')) {
            renderedSectionNavItems.push({
                key: 'other',
                title: '其他状态',
                iconClass: 'fa-solid fa-layer-group',
                badgeText: `${otherCount} 条`,
            });
        }

        const totalSectionCategoryShortcutCount = sectionCategoryShortcutItems.length;
        const sortedSectionCategoryShortcutItems = [...sectionCategoryShortcutItems]
            .sort((left: WorldStateSectionCategoryShortcutItem, right: WorldStateSectionCategoryShortcutItem): number => {
                if (right.count !== left.count) {
                    return right.count - left.count;
                }
                const sectionTitleCompare = left.sectionTitle.localeCompare(right.sectionTitle);
                if (sectionTitleCompare !== 0) {
                    return sectionTitleCompare;
                }
                return left.typeLabel.localeCompare(right.typeLabel);
            })
            .slice(0, 16);
        recognizedGroupCount = totalSectionCategoryShortcutCount;

        const locationSummary = currentLocationValue || '尚未稳定抽取';
        const worldOverview = worldOverviewRaw || '当前聊天暂未形成稳定世界总览。';
        const overviewLeadCardHtml = renderWorldMacroCard({
                title: '世界总览',
                iconClass: 'fa-solid fa-earth-asia',
                tip: '固定在左侧的世界总览卡，概括当前聊天中已经提取出的世界背景、场景锚点与冷启动成熟度。',
                className: 'stx-re-world-overview-card stx-re-world-overview-lead-card',
                bodyHtml: `
                    <div class="stx-re-record-sub">${escapeHtml(worldOverview)}</div>
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('冷启动成熟度', `${readinessScore}%`, '0%')}
                    </div>
                    <div class="stx-re-world-pill-list">
                        <span class="stx-re-world-pill">世界状态：${escapeHtml(String(entries.length))} 条</span>
                        <span class="stx-re-world-pill">任务线索：${escapeHtml(String(questRows.length))} 条</span>
                        <span class="stx-re-world-pill">重大事件：${escapeHtml(String(majorEventCount))} 条</span>
                    </div>
                `,
            });
        const overviewDeckCardsHtml = [
            renderWorldMacroCard({
                title: '时空锚点',
                iconClass: 'fa-solid fa-compass-drafting',
                tip: '集中显示当前位置、当前场景和主冲突，方便快速进入当前世界局面。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('当前位置', locationSummary, '尚未稳定抽取')}
                        ${renderWorldStateMiniMeta('当前场景', currentSceneValue || '尚未稳定抽取', '尚未稳定抽取')}
                        ${renderWorldStateMiniMeta('主冲突', currentConflictValue || '未识别', '未识别')}
                    </div>
                `,
            }),
            renderWorldMacroCard({
                title: '状态统计',
                iconClass: 'fa-solid fa-chart-line',
                tip: '显示当前世界状态总数、筛选后剩余条目以及近 24 小时内更新情况。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-kpi-value">${escapeHtml(String(filteredEntries.length))}</div>
                    <div class="stx-re-record-sub">筛选后条目 / 总计 ${escapeHtml(String(entries.length))}</div>
                    <div class="stx-re-record-code">近 24h 更新：${escapeHtml(String(recentlyUpdatedCount))} 条</div>
                `,
            }),
            renderWorldMacroCard({
                title: '场景推进',
                iconClass: 'fa-solid fa-swords',
                tip: '查看当前冲突、待处理事件与场景参与者，适合做剧情推进速览。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('主冲突', currentConflictValue || '未识别', '未识别')}
                        ${renderWorldStateMiniMeta('待处理事件', pendingEventLabels.slice(0, 3).join(' / ') || '暂无', '暂无')}
                        ${renderWorldStateMiniMeta('场景参与者', participantLabels.slice(0, 4).join(' / ') || '暂无', '暂无')}
                    </div>
                `,
            }),
            renderWorldMacroCard({
                title: '世界法则',
                iconClass: 'fa-solid fa-book-open-reader',
                tip: '集中显示规则、硬约束与启用中的设定书，方便做世界观校准。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-kpi-value">${escapeHtml(String(ruleEntryCount))}</div>
                    <div class="stx-re-record-sub">规则 / 硬约束 / 设定书</div>
                    <div class="stx-re-record-code">规则 ${escapeHtml(String(ruleSummaryItems.length))} · 硬约束 ${escapeHtml(String(hardConstraintItems.length))} · 设定书 ${escapeHtml(String(lorebookLabels.length))}</div>
                `,
            }),
            renderWorldMacroCard({
                title: '版图覆盖',
                iconClass: 'fa-solid fa-map',
                tip: '汇总当前识别到的城市、地点、区域和归属关系，方便判断世界建模覆盖度。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('城市', String(uniqueCities.size), '0')}
                        ${renderWorldStateMiniMeta('地点', String(uniqueLocations.size), '0')}
                        ${renderWorldStateMiniMeta('国家 / 区域', `${uniqueNations.size} / ${uniqueRegions.size}`, '0 / 0')}
                        ${renderWorldStateMiniMeta('组织 / 异常', `${organizationEntryCount} / ${anomalyEntryCount}`, '0 / 0')}
                    </div>
                `,
            }),
            renderWorldMacroCard({
                title: '人物联动',
                iconClass: 'fa-solid fa-people-group',
                tip: '展示角色、参与者和世界条目之间的绑定程度。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('绑定主体', String(boundSubjects.size), '0')}
                        ${renderWorldStateMiniMeta('场景参与者', participantLabels.slice(0, 4).join(' / ') || '暂无', '暂无')}
                        ${renderWorldStateMiniMeta('重大事件', String(majorEventCount), '0')}
                    </div>
                `,
            }),
            renderWorldMacroCard({
                title: '数据新鲜度',
                iconClass: 'fa-solid fa-stopwatch',
                tip: '统计最近更新条目、平均置信度和已识别分组数量，用来看当前世界状态是不是够“热”。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-kpi-value">${escapeHtml(averageConfidence != null ? formatPercent(averageConfidence) : '--')}</div>
                    <div class="stx-re-record-sub">平均置信度</div>
                    <div class="stx-re-record-code">近 24h 更新 ${escapeHtml(String(recentlyUpdatedCount))} 条 · 分类 ${escapeHtml(String(recognizedGroupCount))} 个</div>
                `,
            }),
            renderWorldMacroCard({
                title: '关键词来源',
                iconClass: 'fa-solid fa-key',
                tip: '区分关键词究竟来自结构化结果 / AI 提取，还是系统自动抽词。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-world-meta-stack">
                        ${renderWorldStateMiniMeta('结构化 / AI', `${explicitKeywordEntryCount} 条`, '0 条')}
                        ${renderWorldStateMiniMeta('系统抽词', `${autoKeywordEntryCount} 条`, '0 条')}
                        ${renderWorldStateMiniMeta('已带线索', `${keywordCoveredCount} / ${entries.length}`, '0 / 0')}
                    </div>
                `,
            }),
            renderWorldMacroCard({
                title: '当前过滤',
                iconClass: 'fa-solid fa-filter',
                tip: '显示当前过滤条件，方便确认为什么某些条目没有显示。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-record-sub">作用域：${escapeHtml(scopeButtons.find((item: { key: string; label: string }): boolean => item.key === currentWorldStateScopeFilter)?.label || '全部')}</div>
                    <div class="stx-re-record-code">子表分类：${escapeHtml(String(currentWorldStateSectionTypeFilters.size))} 个子表记住了切换状态</div>
                    <div class="stx-re-record-code">关键词：${escapeHtml(currentWorldStateKeywordFilter || '未设置')}</div>
                `,
            }),
            renderWorldMacroCard({
                title: '热门分类',
                iconClass: 'fa-solid fa-compass',
                tip: '这里显示目前最常见的可切换子表分类。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-record-sub">${escapeHtml(sortedSectionCategoryShortcutItems.length > 0 ? `${sortedSectionCategoryShortcutItems[0]!.sectionTitle} / ${sortedSectionCategoryShortcutItems[0]!.typeLabel}` : '暂无')}</div>
                    <div class="stx-re-record-code">已识别 ${escapeHtml(String(scopeStats.size))} 个作用域 / ${escapeHtml(String(recognizedGroupCount))} 个可切换分类</div>
                `,
            }),
            renderWorldMacroCard({
                title: '冷启动建议',
                iconClass: 'fa-solid fa-wand-magic-sparkles',
                tip: '如果当前世界宏观信息还不够，可以把这些建议交给 AI 摘要阶段或冷启动模板预填。',
                className: 'stx-re-world-kpi-card',
                bodyHtml: `
                    <div class="stx-re-record-sub">${escapeHtml(coldStartRecommendations.length > 0 ? '以下信息建议在 AI 摘要或冷启动阶段优先补齐。' : '当前宏观世界信息已经具备基础冷启动条件。')}</div>
                    ${renderReadableListHtml(coldStartRecommendations.length > 0 ? coldStartRecommendations : ['已具备基础背景总览', '已具备位置/场景锚点', '已具备规则或冲突线索'], '暂无建议')}
                `,
            }),
        ].join('');
        const contentHtml = sectionHtml || '<div class="stx-re-empty">当前筛选下没有世界状态。</div>';

        const previousOverviewStrip = contentArea.querySelector('.stx-re-world-overview-strip') as HTMLElement | null;
        if (previousOverviewStrip) {
            stopAnimatedHorizontalScroll(previousOverviewStrip);
        }

        contentArea.innerHTML = `
            <div class="stx-re-world-overview-top">
                <div class="stx-re-world-overview-lead">${overviewLeadCardHtml}</div>
                <div class="stx-re-world-overview-shell">
                    <button class="stx-re-world-overview-nav stx-re-world-overview-nav-prev" type="button" data-world-strip-nav="prev"${buildTipAttr('向左滚动顶部世界情报带。')}><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button>
                    <div class="stx-re-world-overview-strip">${overviewDeckCardsHtml}</div>
                    <button class="stx-re-world-overview-nav stx-re-world-overview-nav-next" type="button" data-world-strip-nav="next"${buildTipAttr('向右滚动顶部世界情报带。')}><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>
                </div>
            </div>
            <div class="stx-re-panel-grid stx-re-world-overview-grid">
                <div class="stx-re-world-layout">
                    <div class="stx-re-world-sidebar">
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title"><span>分区导航</span></div>
                            <div class="stx-re-world-action-row">
                                <button class="stx-re-btn" data-world-sections-expand${buildTipAttr('展开当前页面所有世界状态分区。')}><i class="fa-solid fa-up-right-and-down-left-from-center" aria-hidden="true"></i> 展开</button>
                                <button class="stx-re-btn" data-world-sections-collapse${buildTipAttr('收起当前页面所有世界状态分区。')}><i class="fa-solid fa-down-left-and-up-right-to-center" aria-hidden="true"></i> 收起</button>
                                <button class="stx-re-btn" data-world-scroll-top${buildTipAttr('回到世界状态页顶部。')}><i class="fa-solid fa-arrow-up" aria-hidden="true"></i> 顶部</button>
                            </div>
                            <div class="stx-re-world-filter-list stx-re-world-section-nav-list">
                                ${renderedSectionNavItems.length > 0 ? renderedSectionNavItems.map((item: { key: string; title: string; iconClass: string; badgeText: string }): string => `<button class="stx-re-btn stx-re-world-section-nav" data-world-section-nav="${escapeHtml(item.key)}"${buildTipAttr(`跳转到 ${item.title} 分区。`)}><span class="stx-re-world-section-nav-main"><i class="${escapeHtml(item.iconClass)}" aria-hidden="true"></i><span>${escapeHtml(item.title)}</span></span><span class="stx-re-world-section-nav-badge">${escapeHtml(item.badgeText)}</span></button>`).join('') : '<div class="stx-re-record-sub">当前筛选下暂无可跳转分区</div>'}
                            </div>
                        </div>
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title"><span>作用域筛选</span></div>
                            <div class="stx-re-world-filter-list">
                                ${scopeButtons.map((item: { key: string; label: string }): string => `<button class="stx-re-btn ${item.key === currentWorldStateScopeFilter ? 'save' : ''}" data-world-scope="${escapeHtml(item.key)}"${buildTipAttr(`只显示作用域为 ${item.label} 的世界状态。`)} style="justify-content:flex-start;">${escapeHtml(item.label)}</button>`).join('')}
                            </div>
                        </div>
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title"><span>分类捷径</span></div>
                            <div class="stx-re-world-filter-list">
                                ${sortedSectionCategoryShortcutItems.length > 0 ? sortedSectionCategoryShortcutItems.map((item: WorldStateSectionCategoryShortcutItem): string => `<button class="stx-re-btn" data-world-section-type-shortcut data-world-section-key="${escapeHtml(item.sectionKey)}" data-world-section-type="${escapeHtml(item.typeKey)}"${buildTipAttr(`快速切换到 ${item.sectionTitle} 的 ${item.typeLabel} 分类，并跳转到对应子表。`)} style="justify-content:flex-start;">${escapeHtml(item.sectionTitle)} / ${escapeHtml(item.typeLabel)} · ${escapeHtml(String(item.count))} 条</button>`).join('') : '<div class="stx-re-record-sub">暂无可用分类</div>'}
                            </div>
                        </div>
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title"><span>关键词过滤</span></div>
                            <input class="text_pole" data-world-keyword-input placeholder="输入关键词过滤" value="${escapeHtml(currentWorldStateKeywordFilter)}">
                            <div class="stx-re-world-action-row">
                                <button class="stx-re-btn" data-world-keyword-apply${buildTipAttr('应用关键词过滤，匹配标题、摘要、关键词与标签。')}><i class="fa-solid fa-check" aria-hidden="true"></i> 应用</button>
                                <button class="stx-re-btn" data-world-keyword-clear${buildTipAttr('清空关键词过滤，重新显示全部命中条目。')}><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> 清空</button>
                            </div>
                        </div>
                    </div>
                    <div class="stx-re-world-sections">
                        ${contentHtml}
                    </div>
                </div>
            </div>
        `;
        if (renderSeq !== currentWorldStateRenderSeq) {
            return;
        }

        contentArea.querySelectorAll('[data-world-scope]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                currentWorldStateScopeFilter = String((button as HTMLElement).dataset.worldScope ?? '__all__');
                void renderWorldStateStructuredView({ preserveContent: true });
            });
        });

        contentArea.querySelectorAll('[data-world-section-type-tab]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const element = button as HTMLElement;
                const sectionKey = String(element.dataset.worldSectionKey ?? '').trim();
                const typeKey = String(element.dataset.worldSectionType ?? '').trim();
                if (!sectionKey || !typeKey) {
                    return;
                }
                currentWorldStateSectionTypeFilters.set(sectionKey, typeKey);
                void renderWorldStateStructuredView({ preserveContent: true });
            });
        });

        contentArea.querySelector('[data-world-keyword-apply]')?.addEventListener('click', (): void => {
            const input = contentArea.querySelector('[data-world-keyword-input]') as HTMLInputElement | null;
            currentWorldStateKeywordFilter = String(input?.value ?? '').trim();
            void renderWorldStateStructuredView({ preserveContent: true });
        });

        contentArea.querySelector('[data-world-keyword-clear]')?.addEventListener('click', (): void => {
            currentWorldStateKeywordFilter = '';
            void renderWorldStateStructuredView({ preserveContent: true });
        });

        contentArea.querySelectorAll('[data-world-section-type-shortcut]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const element = button as HTMLElement;
                const sectionKey = String(element.dataset.worldSectionKey ?? '').trim();
                const typeKey = String(element.dataset.worldSectionType ?? '').trim();
                if (!sectionKey || !typeKey) {
                    return;
                }
                currentWorldStateSectionTypeFilters.set(sectionKey, typeKey);
                pendingWorldStateFocusSectionKey = sectionKey;
                pendingWorldStateOpenSectionKeys = new Set<string>([sectionKey]);
                void renderWorldStateStructuredView({ preserveContent: true });
            });
        });

        contentArea.querySelector('[data-world-sections-expand]')?.addEventListener('click', (): void => {
            contentArea.querySelectorAll('.stx-re-world-section-collapsible').forEach((node: Element): void => {
                (node as HTMLDetailsElement).open = true;
            });
            requestAnimationFrame((): void => updateWorldStickyTableHeaders(contentArea, contentArea));
        });

        contentArea.querySelector('[data-world-sections-collapse]')?.addEventListener('click', (): void => {
            contentArea.querySelectorAll('.stx-re-world-section-collapsible').forEach((node: Element): void => {
                (node as HTMLDetailsElement).open = false;
            });
            requestAnimationFrame((): void => updateWorldStickyTableHeaders(contentArea, contentArea));
        });

        contentArea.querySelector('[data-world-scroll-top]')?.addEventListener('click', (): void => {
            contentArea.scrollTo({ top: 0, behavior: 'smooth' });
        });

        contentArea.querySelectorAll('[data-world-section-nav]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const sectionKey = String((button as HTMLElement).dataset.worldSectionNav ?? '').trim();
                const target = contentArea.querySelector(`#stx-re-world-section-${sectionKey}`) as HTMLElement | null;
                if (!target) {
                    return;
                }
                if (target instanceof HTMLDetailsElement) {
                    target.open = true;
                }
                const targetRect = target.getBoundingClientRect();
                const contentRect = contentArea.getBoundingClientRect();
                const nextTop = contentArea.scrollTop + (targetRect.top - contentRect.top) - 12;
                contentArea.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
                requestAnimationFrame((): void => updateWorldStickyTableHeaders(contentArea, contentArea));
            });
        });

        contentArea.querySelectorAll('[data-quest-row-action]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const element = button as HTMLElement;
                const action = String(element.dataset.questRowAction ?? '').trim();
                const rowKey = String(element.dataset.questRowKey ?? '').trim();
                if (!action || !rowKey) {
                    return;
                }
                const row = questRowMap.get(rowKey);
                if (!row) {
                    return;
                }
                if (action === 'sources') {
                    openLogicSourceDetailsDialog(
                        `任务进展 / ${row.title}`,
                        `来源 ${row.sourceRefs?.length ?? 0} 条 · ${row.sourceLabel}`,
                        row.sourceRefs ?? [],
                    );
                    return;
                }
                if (action !== 'jump') {
                    return;
                }
                const rawTarget = resolveQuestRowRawJumpTarget(row);
                if (rawTarget) {
                    void jumpToRawTarget(rawTarget);
                    return;
                }
                if (row.statePath || row.stateKey) {
                    void jumpToWorldStateQuestSource(row);
                }
            });
        });

        worldUiInteractionController?.abort();
        worldUiInteractionController = new AbortController();
        const worldUiSignal = worldUiInteractionController.signal;

        const overviewStrip = contentArea.querySelector('.stx-re-world-overview-strip') as HTMLElement | null;
        const scheduleWorldUiRefresh = (() => {
            let rafId = 0;
            return (): void => {
                if (rafId) {
                    return;
                }
                rafId = window.requestAnimationFrame((): void => {
                    rafId = 0;
                    if (overviewStrip) {
                        updateWorldOverviewStripState(overviewStrip);
                    }
                    updateWorldStickyTableHeaders(contentArea, contentArea);
                });
            };
        })();

        if (overviewStrip) {
            updateWorldOverviewStripState(overviewStrip);
            let draggingPointerId: number | null = null;
            let dragStartX = 0;
            let dragStartScrollLeft = 0;
            const stopStripDragging = (): void => {
                draggingPointerId = null;
                overviewStrip.classList.remove('is-dragging');
            };

            contentArea.querySelectorAll('[data-world-strip-nav]').forEach((node: Element): void => {
                node.addEventListener('click', (): void => {
                    const direction = String((node as HTMLElement).dataset.worldStripNav ?? '').trim();
                    const delta = direction === 'prev' ? -360 : 360;
                    animateHorizontalScrollBy(overviewStrip, delta, {
                        duration: 320,
                        onFrame: scheduleWorldUiRefresh,
                    });
                }, { signal: worldUiSignal });
            });

            overviewStrip.addEventListener('scroll', (): void => scheduleWorldUiRefresh(), { signal: worldUiSignal, passive: true });
            overviewStrip.addEventListener('pointerdown', (event: PointerEvent): void => {
                if (event.button !== 0) {
                    return;
                }
                const target = event.target as HTMLElement | null;
                if (target?.closest('[data-world-strip-nav]')) {
                    return;
                }
                if (overviewStrip.scrollWidth <= overviewStrip.clientWidth) {
                    return;
                }
                stopAnimatedHorizontalScroll(overviewStrip, true);
                draggingPointerId = event.pointerId;
                dragStartX = event.clientX;
                dragStartScrollLeft = overviewStrip.scrollLeft;
                overviewStrip.classList.add('is-dragging');
                overviewStrip.setPointerCapture(event.pointerId);
            }, { signal: worldUiSignal });
            overviewStrip.addEventListener('pointermove', (event: PointerEvent): void => {
                if (draggingPointerId == null || event.pointerId !== draggingPointerId) {
                    return;
                }
                const deltaX = event.clientX - dragStartX;
                overviewStrip.scrollLeft = dragStartScrollLeft - deltaX;
                scheduleWorldUiRefresh();
                event.preventDefault();
            }, { signal: worldUiSignal });
            overviewStrip.addEventListener('pointerup', (event: PointerEvent): void => {
                if (draggingPointerId != null && event.pointerId === draggingPointerId) {
                    stopStripDragging();
                }
            }, { signal: worldUiSignal });
            overviewStrip.addEventListener('pointercancel', (): void => stopStripDragging(), { signal: worldUiSignal });
            overviewStrip.addEventListener('lostpointercapture', (): void => stopStripDragging(), { signal: worldUiSignal });
            overviewStrip.addEventListener('wheel', (event: WheelEvent): void => {
                const horizontalIntent = Math.abs(event.deltaX) > Math.abs(event.deltaY);
                const delta = horizontalIntent ? event.deltaX : event.deltaY;
                if (!delta) {
                    return;
                }
                const canScroll = overviewStrip.scrollWidth > overviewStrip.clientWidth;
                if (!canScroll) {
                    return;
                }
                event.preventDefault();
                animateHorizontalScrollBy(overviewStrip, delta, {
                    duration: horizontalIntent ? 220 : 280,
                    onFrame: scheduleWorldUiRefresh,
                });
            }, { signal: worldUiSignal, passive: false });
        }

        contentArea.addEventListener('scroll', (): void => scheduleWorldUiRefresh(), { signal: worldUiSignal, passive: true });
        contentArea.querySelectorAll('.stx-re-world-section-collapsible').forEach((node: Element): void => {
            node.addEventListener('toggle', (): void => scheduleWorldUiRefresh(), { signal: worldUiSignal });
        });
        contentArea.querySelectorAll('.stx-re-world-table-wrap.is-scrollable').forEach((node: Element): void => {
            const wrap = node as HTMLElement;
            wrap.addEventListener('scroll', (): void => scheduleWorldUiRefresh(), { signal: worldUiSignal, passive: true });
            bindNestedVerticalScrollBridge(wrap, contentArea, worldUiSignal);
        });

        requestAnimationFrame((): void => {
            applyWorldTableViewportLimits(contentArea);
            if (nextFocusSectionKey) {
                const target = contentArea.querySelector(`#stx-re-world-section-${nextFocusSectionKey}`) as HTMLElement | null;
                if (target) {
                    const targetRect = target.getBoundingClientRect();
                    const contentRect = contentArea.getBoundingClientRect();
                    const nextTop = contentArea.scrollTop + (targetRect.top - contentRect.top) - 12;
                    contentArea.scrollTo({ top: Math.max(0, nextTop), behavior: 'smooth' });
                } else if (nextScrollTop != null) {
                    contentArea.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'auto' });
                }
            } else if (nextScrollTop != null) {
                contentArea.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'auto' });
            }
            if (nextFocusRowKey) {
                const escapeSelector = (window as Window & { CSS?: { escape?: (value: string) => string } }).CSS?.escape;
                const rowSelector = escapeSelector
                    ? `[data-world-row-key="${escapeSelector(nextFocusRowKey)}"]`
                    : `[data-world-row-key="${nextFocusRowKey.replace(/"/g, '\\"')}"]`;
                const row = contentArea.querySelector(rowSelector) as HTMLElement | null;
                if (row) {
                    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const previousOutline = row.style.outline;
                    const previousBackground = row.style.background;
                    row.style.outline = '2px solid color-mix(in srgb, var(--SmartThemeQuoteColor, #ef7d2d) 88%, white 12%)';
                    row.style.background = 'color-mix(in srgb, var(--SmartThemeQuoteColor, #ef7d2d) 12%, transparent)';
                    window.setTimeout((): void => {
                        row.style.outline = previousOutline;
                        row.style.background = previousBackground;
                    }, 2200);
                }
            }
            scheduleWorldUiRefresh();
            window.setTimeout((): void => applyWorldTableViewportLimits(contentArea), 120);
            window.setTimeout((): void => scheduleWorldUiRefresh(), 120);
        });
    }

    /**
     * 功能：渲染原始库表视图。
     * @param tableName 表名
     * @returns 无返回值
     */
    async function renderRawTable(tableName: RawTableName): Promise<void> {
        if (tableName === 'world_state') {
            await renderWorldStateStructuredView();
            return;
        }
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载数据...</div>';

        try {
            const data = await getRawRecords(tableName);
            if (data.length === 0) {
                if (pendingRawFocus?.tableName === tableName) {
                    pendingRawFocus = null;
                }
                contentArea.innerHTML = '<div class="stx-re-empty">暂无数据记录。</div>';
                updateRawSelectionState();
                return;
            }
            const displayData = tableName === 'events' ? dedupeDisplayEvents(data) : [...data];
            const readOnlyTable = isReadOnlyRawTable(tableName);
            if (displayData.length === 0) {
                if (pendingRawFocus?.tableName === tableName) {
                    pendingRawFocus = null;
                }
                contentArea.innerHTML = '<div class="stx-re-empty">暂无数据记录。</div>';
                updateRawSelectionState();
                return;
            }

            const defaultSortCol = tableName === 'events' || readOnlyTable
                ? 'ts'
                : tableName === 'summaries'
                        ? 'level'
                        : 'factKey';
            const sortCol = currentSort.col || defaultSortCol;
            displayData.sort((left: RawRecord, right: RawRecord): number => {
                const leftValue = left[sortCol];
                const rightValue = right[sortCol];
                if (leftValue === rightValue) {
                    return 0;
                }
                if (leftValue == null) {
                    return 1;
                }
                if (rightValue == null) {
                    return -1;
                }
                const normalizedLeftValue = typeof leftValue === 'number' ? leftValue : String(leftValue);
                const normalizedRightValue = typeof rightValue === 'number' ? rightValue : String(rightValue);
                if (normalizedLeftValue < normalizedRightValue) {
                    return currentSort.asc ? -1 : 1;
                }
                if (normalizedLeftValue > normalizedRightValue) {
                    return currentSort.asc ? 1 : -1;
                }
                return 0;
            });
            const headerCell = (label: string, column: string): string => {
                const isActive = sortCol === column;
                const icon = isActive
                    ? (currentSort.asc ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>')
                    : '<i class="fa-solid fa-sort"></i>';
                return `<th class="stx-re-th-sortable ${isActive ? 'active' : ''}" data-col="${column}">${label} ${icon}</th>`;
            };

            if (readOnlyTable) {
                const readOnlyRows = [...displayData];
                const readOnlySortCol = currentSort.col || 'ts';
                const readOnlyHeaderCell = (label: string, column: string): string => {
                    const isActive = readOnlySortCol === column;
                    const icon = isActive
                        ? (currentSort.asc ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>')
                        : '<i class="fa-solid fa-sort"></i>';
                    return `<th class="stx-re-th-sortable ${isActive ? 'active' : ''}" data-col="${column}">${label} ${icon}</th>`;
                };
                readOnlyRows.sort((left: RawRecord, right: RawRecord): number => {
                    const leftValue = left[readOnlySortCol];
                    const rightValue = right[readOnlySortCol];
                    if (leftValue === rightValue) {
                        return 0;
                    }
                    if (leftValue == null) {
                        return 1;
                    }
                    if (rightValue == null) {
                        return -1;
                    }
                    const normalizedLeftValue = typeof leftValue === 'number' ? leftValue : String(leftValue);
                    const normalizedRightValue = typeof rightValue === 'number' ? rightValue : String(rightValue);
                    if (normalizedLeftValue < normalizedRightValue) {
                        return currentSort.asc ? -1 : 1;
                    }
                    if (normalizedLeftValue > normalizedRightValue) {
                        return currentSort.asc ? 1 : -1;
                    }
                    return 0;
                });

                const readOnlyRowsHtml = readOnlyRows.map((record: RawRecord): string => {
                    const recordId = getRawRecordId(tableName, record);
                    const recordValue = getRawPayloadFieldName(tableName) === 'after' ? record.after : record.after;
                    if (tableName === 'audit') {
                        const actor = record.actor as Record<string, unknown> | undefined;
                        const actorPluginId = String(actor?.pluginId ?? 'system').trim() || 'system';
                        const actorMode = String(actor?.mode ?? '').trim();
                        const actorTitle = actorPluginId === 'system' ? '系统维护' : actorPluginId === MEMORY_OS_PLUGIN_ID ? 'MemoryOS' : actorPluginId;
                        const actorSubtitle = joinReadableMeta([
                            actorMode ? `方式：${formatOperationModeLabel(actorMode)}` : '',
                            actorPluginId === 'system' ? '来源：系统内核' : '',
                        ]);
                        return `
                            <tr class="stx-re-row" data-record-id="${escapeHtml(recordId)}">
                                <td>${renderRecordSummaryMarkup(formatAuditActionLabel(String(record.action ?? '')), String(record.reason ?? '记录发生了结构变更').trim() || '记录发生了结构变更', '审计编号', recordId)}</td>
                                <td>${renderRecordSummaryMarkup(actorTitle, actorSubtitle || '未记录额外来源信息', '内部来源', actorPluginId)}</td>
                                <td><div class="stx-re-value" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(recordValue, false)}</div></td>
                                <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                            </tr>
                        `;
                    }
                    const targetKind = String(record.targetKind ?? '').trim() || '未知类型';
                    const targetTitle = String(record.title ?? '').trim() || '未命名变更';
                    const sourceLabel = joinReadableMeta([
                        String(record.source ?? '').trim(),
                        String(record.consumerPluginId ?? '').trim(),
                    ]);
                    const reasonText = Array.isArray(record.reasonCodes)
                        ? (record.reasonCodes as unknown[]).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean).join(' / ')
                        : '';
                    return `
                        <tr class="stx-re-row" data-record-id="${escapeHtml(recordId)}">
                            <td>${renderRecordSummaryMarkup(formatMutationHistoryActionLabel(String(record.action ?? '')), `${targetKind} · ${targetTitle}`, '变更编号', recordId)}</td>
                            <td>${renderRecordSummaryMarkup(formatLogicRowDisplayLabel(String(record.targetRecordKey ?? ''), targetTitle), joinReadableMeta([String(record.compareKey ?? '').trim(), reasonText ? `原因 ${reasonText}` : '']), '目标记录', String(record.targetRecordKey ?? ''))}</td>
                            <td>${renderRecordSummaryMarkup(sourceLabel || '未记录来源', Array.isArray(record.visibleMessageIds) && record.visibleMessageIds.length > 0 ? `消息 ${record.visibleMessageIds.length}` : '未记录消息上下文', '执行来源', String(record.consumerPluginId ?? ''))}</td>
                            <td><div class="stx-re-value" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(recordValue, false)}</div></td>
                            <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                        </tr>
                    `;
                }).join('');

                let readOnlyTheadHtml = '';
                if (tableName === 'audit') {
                    readOnlyTheadHtml = `<tr>${readOnlyHeaderCell('审计动作', 'action')}${readOnlyHeaderCell('执行来源', 'actor')}${readOnlyHeaderCell('记录内容', 'after')}${readOnlyHeaderCell('发生时间', 'ts')}</tr>`;
                } else {
                    readOnlyTheadHtml = `<tr>${readOnlyHeaderCell('变更动作', 'action')}${readOnlyHeaderCell('目标记录', 'target')}${readOnlyHeaderCell('执行来源', 'source')}${readOnlyHeaderCell('记录内容', 'after')}${readOnlyHeaderCell('发生时间', 'ts')}</tr>`;
                }

                const tableEl = document.createElement('table');
                tableEl.className = 'stx-re-table';
                tableEl.innerHTML = `<thead>${readOnlyTheadHtml}</thead><tbody>${readOnlyRowsHtml}</tbody>`;
                contentArea.innerHTML = '';
                contentArea.appendChild(tableEl);
                applyPendingRawFocus(tableName);

                tableEl.querySelectorAll('.stx-re-th-sortable').forEach((header: Element): void => {
                    (header as HTMLElement).dataset.tip = '点击这一列排序，再点一次切换升序/降序。';
                    header.addEventListener('click', (): void => {
                        const column = String((header as HTMLElement).dataset.col ?? '');
                        if (!column) {
                            return;
                        }
                        if (currentSort.col === column) {
                            currentSort.asc = !currentSort.asc;
                        } else {
                            currentSort.col = column;
                            currentSort.asc = false;
                        }
                        void renderRawTable(tableName);
                    });
                });
                btnBatchDelete.classList.add('is-hidden');
                return;
            }

            let theadHtml = '';
            let rowsHtml = '';

            displayData.forEach((record: RawRecord): void => {
                const recordId = getRawRecordId(tableName, record);
                const pendingKey = makePendingKey(tableName, recordId);
                const isPendingDelete = pendingChanges.deletes.has(pendingKey);
                const pendingUpdate = pendingChanges.updates.get(pendingKey);
                const rowClass = isPendingDelete
                    ? 'stx-re-row pending-delete'
                    : pendingUpdate
                        ? 'stx-re-row pending-update'
                        : 'stx-re-row';
                const checkboxDisabled = isPendingDelete ? 'disabled' : '';
                const payloadField = getRawPayloadFieldName(tableName);
                const payloadValue = pendingUpdate?.payload ?? record[payloadField];

                if (tableName === 'events') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('事件概览', 'type')}${headerCell('发生时间', 'ts')}${headerCell('内容', 'payload')}<th>操作</th></tr>`;
                    }
                    const payloadRecord = payloadValue as Record<string, unknown> | null;
                    const senderName = String(payloadRecord?.name ?? '未知').trim() || '未知';
                    const isUser = Boolean(payloadRecord?.isUser) || payloadRecord?.name === 'You' || payloadRecord?.name === 'User';
                    const isSystem = payloadRecord?.role === 'system' || payloadRecord?.name === 'System' || payloadRecord?.name === '系统';
                    const senderType = isSystem ? '系统' : isUser || record.type === 'chat.message.sent' ? '用户' : 'AI';
                    const eventTypeLabel = formatEventTypeLabel(String(record.type ?? ''));
                    const eventSummary = joinReadableMeta([
                        `来源：${normalizeSenderLabel(senderType)}`,
                        senderName && senderName !== normalizeSenderLabel(senderType) ? senderName : '',
                    ]);
                    rowsHtml += `
                        <tr class="${rowClass}" data-record-id="${escapeHtml(recordId)}" data-message-id="${escapeHtml(readEventMessageId(record))}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(eventTypeLabel, eventSummary, '事件编号', recordId)}</td>
                            <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'facts') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('记忆主题', 'factKey')}${headerCell('关联对象', 'entity')}${headerCell('主题位置', 'path')}${headerCell('内容', 'value')}<th>操作</th></tr>`;
                    }
                    const entity = record.entity as Record<string, unknown> | undefined;
                    const pathValue = String(record.path ?? '').trim();
                    const entityLabel = formatEntityDisplayLabel(entity);
                    const pathLabel = pathValue ? formatHumanReadableTopic(pathValue, '未填写路径') : '未填写路径';
                    const pathSummary = pathValue ? '这条记录会归入当前主题下' : '这条记录还没有填写路径';
                    const factTitle = buildFactHeadline(record);
                    const factSubtitle = joinReadableMeta([entityLabel, buildFactSummaryLabel(record)]);
                    const entitySummary = entity ? '这条记录已经绑定到具体对象' : '这条记录还没有绑定对象';
                    rowsHtml += `
                        <tr class="${rowClass}" data-record-id="${escapeHtml(recordId)}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(factTitle, factSubtitle, '', '', isFactStructurallyIncomplete(record) ? '结构待整理' : '')}</td>
                            <td>${renderRecordSummaryMarkup(entityLabel, entitySummary, '', '')}</td>
                            <td>${renderRecordSummaryMarkup(pathLabel, pathSummary, '', '')}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderReadableValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'summaries') {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('摘要主题', 'level')}${headerCell('关键词', 'keywords')}${headerCell('摘要内容', 'content')}<th>操作</th></tr>`;
                    }
                    const keywords = Array.isArray(record.keywords)
                        ? (record.keywords as unknown[]).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
                        : [];
                    rowsHtml += `
                        <tr class="${rowClass}" data-record-id="${escapeHtml(recordId)}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(buildSummaryHeadline(record), buildSummarySubtitle(record), '', '')}</td>
                            <td>${renderRecordSummaryMarkup(keywords.length > 0 ? keywords.join('、') : '暂无关键词', keywords.length > 0 ? '这些词会帮助系统回忆这段摘要' : '当前这条摘要还没有提取关键词', '', '')}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="string">${renderReadableValueHtml(payloadValue, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                } else {
                    if (!theadHtml) {
                        theadHtml = `<tr><th style="width:30px; text-align:center"><input type="checkbox" class="stx-re-checkbox stx-re-select-all"></th>${headerCell('变更动作', 'action')}${headerCell('执行来源', 'actor')}${headerCell('变更内容', 'after')}${headerCell('发生时间', 'ts')}<th>操作</th></tr>`;
                    }
                    const actor = record.actor as Record<string, unknown> | undefined;
                    const actorPluginId = String(actor?.pluginId ?? 'system').trim() || 'system';
                    const actorMode = String(actor?.mode ?? '').trim();
                    const actorTitle = actorPluginId === 'system' ? '系统维护' : actorPluginId === MEMORY_OS_PLUGIN_ID ? 'MemoryOS' : actorPluginId;
                    const actorSubtitle = joinReadableMeta([
                        actorMode ? `方式：${formatOperationModeLabel(actorMode)}` : '',
                        actorPluginId === 'system' ? '来源：系统内核' : '',
                    ]);
                    rowsHtml += `
                        <tr class="${rowClass}" data-record-id="${escapeHtml(recordId)}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${escapeHtml(recordId)}" ${checkboxDisabled}></td>
                            <td>${renderRecordSummaryMarkup(formatAuditActionLabel(String(record.action ?? '')), String(record.reason ?? '记录发生了结构变更').trim() || '记录发生了结构变更', '审计编号', recordId)}</td>
                            <td>${renderRecordSummaryMarkup(actorTitle, actorSubtitle || '未记录额外来源信息', '内部来源', actorPluginId)}</td>
                            <td><div class="stx-re-value editable" data-id="${escapeHtml(recordId)}" data-type="object">${renderRawValueHtml(payloadValue, false)}</div></td>
                            <td>${escapeHtml(formatTimeLabel(record.ts))}</td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${escapeHtml(recordId)}">编辑</button><button class="stx-re-btn delete" data-id="${escapeHtml(recordId)}">删除</button></div></td>
                        </tr>
                    `;
                }
            });

            const tableEl = document.createElement('table');
            tableEl.className = 'stx-re-table';
            tableEl.innerHTML = `<thead>${theadHtml}</thead><tbody>${rowsHtml}</tbody>`;
            contentArea.innerHTML = '';
            contentArea.appendChild(tableEl);
            applyPendingRawFocus(tableName);

            tableEl.querySelectorAll('.stx-re-th-sortable').forEach((header: Element): void => {
                (header as HTMLElement).dataset.tip = '点击按这一列排序，再点一次切换升序/降序。';
                header.addEventListener('click', (): void => {
                    const column = String((header as HTMLElement).dataset.col ?? '');
                    if (!column) {
                        return;
                    }
                    if (currentSort.col === column) {
                        currentSort.asc = !currentSort.asc;
                    } else {
                        currentSort.col = column;
                        currentSort.asc = false;
                    }
                    void renderRawTable(tableName);
                });
            });

            const masterCheckbox = tableEl.querySelector('.stx-re-select-all') as HTMLInputElement | null;
            masterCheckbox?.addEventListener('change', (): void => {
                tableEl.querySelectorAll('.stx-re-select-row:not(:disabled)').forEach((checkbox: Element): void => {
                    (checkbox as HTMLInputElement).checked = Boolean(masterCheckbox.checked);
                });
                updateRawSelectionState();
            });

            tableEl.querySelectorAll('.stx-re-select-row').forEach((checkbox: Element): void => {
                checkbox.addEventListener('change', (): void => updateRawSelectionState());
            });

            tableEl.querySelectorAll('.stx-re-btn.delete').forEach((button: Element): void => {
                (button as HTMLElement).dataset.tip = '把这条原始记录加入待删除列表，保存后才会真正写回数据库。';
                button.addEventListener('click', (): void => {
                    const id = String((button as HTMLElement).dataset.id ?? '');
                    if (!id) {
                        return;
                    }
                    pendingChanges.deletes.add(makePendingKey(tableName, id));
                    pendingChanges.updates.delete(makePendingKey(tableName, id));
                    updateFooterState();
                    void renderRawTable(tableName);
                });
            });

            tableEl.querySelectorAll('.stx-re-btn.edit').forEach((button: Element): void => {
                (button as HTMLElement).dataset.tip = '进入编辑态后可修改当前载荷，再次点击会把修改加入待保存列表。';
                button.addEventListener('click', (): void => {
                    const buttonElement = button as HTMLButtonElement;
                    const id = String(buttonElement.dataset.id ?? '');
                    if (!id) {
                        return;
                    }
                    const editableDiv = buttonElement.closest('tr')?.querySelector('.editable') as HTMLElement | null;
                    if (!editableDiv) {
                        return;
                    }

                    if (editableDiv.classList.contains('is-editing')) {
                        const nextValue = readRawEditedValue(editableDiv, editableDiv.getAttribute('data-type'));
                        pendingChanges.updates.set(makePendingKey(tableName, id), { id, tableName, payload: nextValue });
                        editableDiv.classList.remove('is-editing');
                        editableDiv.innerHTML = renderRawValueHtml(nextValue, false);
                        buttonElement.textContent = '编辑';
                        buttonElement.classList.remove('is-editing');
                        updateFooterState();
                        return;
                    }

                    const record = data.find((item: RawRecord): boolean => getRawRecordId(tableName, item) === id);
                    const currentValue = pendingChanges.updates.get(makePendingKey(tableName, id))?.payload ?? record?.[getRawPayloadFieldName(tableName)];
                    editableDiv.classList.add('is-editing');
                    editableDiv.innerHTML = renderRawValueHtml(currentValue, true);
                    buttonElement.textContent = '保存';
                    buttonElement.classList.add('is-editing');
                });
            });

            tableEl.querySelectorAll('.editable').forEach((cell: Element): void => {
                cell.addEventListener('dblclick', (): void => {
                    const editButton = cell.closest('tr')?.querySelector('.stx-re-btn.edit') as HTMLButtonElement | null;
                    if (editButton && !(cell as HTMLElement).classList.contains('is-editing')) {
                        editButton.click();
                    }
                });
            });

            updateRawSelectionState();
        } catch (error) {
            logger.error('渲染原始库表失败', error);
            contentArea.innerHTML = `<div class="stx-re-empty is-error">加载失败: ${escapeHtml(String(error))}</div>`;
        }
    }

    /**
     * 功能：把逻辑表值转换为单元格文本。
     * @param value 原始值
     * @returns 展示文本
     */
    function renderLogicCellText(value: unknown): string {
        const text = stringifyDisplayValue(value);
        return text || '—';
    }

    /**
     * 功能：开始编辑逻辑表单元格。
     * @param cell 单元格元素
     * @returns 无返回值
     */
    function startLogicCellEditing(cell: HTMLElement): void {
        if (cell.dataset.readonly === 'true' || cell.dataset.editing === 'true') {
            return;
        }
        cell.dataset.editing = 'true';
        cell.contentEditable = 'true';
        cell.classList.add('is-editing');
        cell.focus();
    }

    /**
     * 功能：结束逻辑表单元格编辑并立即保存。
     * @param cell 单元格元素
     * @returns 无返回值
     */
    async function finishLogicCellEditing(cell: HTMLElement): Promise<void> {
        if (cell.dataset.editing !== 'true') {
            return;
        }
        cell.dataset.editing = 'false';
        cell.contentEditable = 'false';
        cell.classList.remove('is-editing');

        const memory = await ensureRecordMemory();
        const tableKey = String(cell.dataset.tableKey ?? '').trim();
        const rowId = String(cell.dataset.rowId ?? '').trim();
        const fieldKey = String(cell.dataset.fieldKey ?? '').trim();
        if (!memory || !tableKey || !rowId || !fieldKey) {
            return;
        }

        try {
            await memory.logicTable.updateCell(tableKey, rowId, fieldKey, parseLooseValue(cell.textContent ?? ''));
            cell.classList.add('is-saved');
            setTimeout((): void => cell.classList.remove('is-saved'), 800);
            await loadChatKeys();
            await renderLogicView();
        } catch (error) {
            cell.classList.add('is-error');
            toast.error(`保存单元格失败: ${String(error)}`);
            await renderLogicView();
        }
    }

    /**
     * 功能：渲染逻辑表视图。
     * @returns 无返回值
     */
    async function renderLogicView(): Promise<void> {
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载逻辑表...</div>';
        if (!currentChatKey) {
            contentArea.innerHTML = '<div class="stx-re-empty">请先在左侧选择一个聊天，然后即可进入逻辑表维护，处理候选行、别名和隐藏项。</div>';
            return;
        }

        const memory = await ensureRecordMemory();
        if (!memory) {
            contentArea.innerHTML = '<div class="stx-re-empty">无法为当前聊天建立 MemorySDK。</div>';
            return;
        }

        const [experience, template, binding, summaries] = await Promise.all([
            memory.editor.getExperienceSnapshot() as Promise<EditorExperienceSnapshot>,
            memory.template.getEffective(),
            memory.template.getBinding(),
            memory.logicTable.listLogicTables() as Promise<LogicTableSummary[]>,
        ]);
        const orderedSummaries = sortLogicTableSummaries(summaries);
        if (!template || orderedSummaries.length === 0) {
            contentArea.innerHTML = '<div class="stx-re-empty">当前聊天还没有可展示的逻辑表。请先生成结构视图，或切到系统诊断检查数据链路。</div>';
            return;
        }

        currentLogicTableKey = resolvePreferredLogicTableKey(orderedSummaries, currentLogicTableKey);
        const [view, candidates] = await Promise.all([
            memory.logicTable.getLogicTableView(currentLogicTableKey) as Promise<LogicTableViewModel>,
            memory.logicTable.listBackfillCandidates(currentLogicTableKey) as Promise<DerivedRowCandidate[]>,
        ]);
        const visibleRowIds = new Set<string>(view.rows.map((row: LogicRowView): string => row.rowId));
        Array.from(selectedLogicRowIds).forEach((rowId: string): void => {
            if (!visibleRowIds.has(rowId)) {
                selectedLogicRowIds.delete(rowId);
            }
        });

        const tableOptionsHtml = orderedSummaries.map((summary: LogicTableSummary): string => {
            return `<option value="${escapeHtml(summary.tableKey)}" ${summary.tableKey === view.tableKey ? 'selected' : ''}>${escapeHtml(summary.title)} · ${escapeHtml(formatLogicStatusLabel(summary.status))}</option>`;
        }).join('');
        const createFieldsHtml = view.columns
            .filter((field): boolean => !field.isPrimaryKey)
            .map((field): string => `<label style="display:flex; flex-direction:column; gap:4px; min-width:180px;"><span>${escapeHtml(field.label)}</span><input class="text_pole" data-create-field="${escapeHtml(field.key)}" placeholder="可输入文本或 JSON"></label>`)
            .join('');
        const headerHtml = view.columns.map((field): string => `<th>${escapeHtml(field.label)}</th>`).join('');
        const rowsHtml = view.rows.length === 0
            ? `<tr><td colspan="${view.columns.length + 3}"><div class="stx-re-empty">当前表暂无稳定行。你可以先新建一行，或者先处理候选与隐藏项。</div></td></tr>`
            : view.rows.map((row: LogicRowView): string => {
                const statusParts: string[] = [];
                if (row.rowKind === 'tombstoned') {
                    statusParts.push('已软删除');
                }
                if (row.redirectedTo) {
                    statusParts.push(`重定向到 ${row.redirectedTo}`);
                }
                if (row.aliases.length > 0) {
                    statusParts.push(`别名 ${row.aliases.join(', ')}`);
                }
                if (row.warnings.length > 0) {
                    statusParts.push(row.warnings.join(' / '));
                }
                if (row.sourceRefs.length > 0) {
                    statusParts.push(`来源 ${row.sourceRefs.length} 条`);
                }
                const actionButtons: string[] = [];
                const candidate = row.rowKind === 'derived'
                    ? candidates.find((item: DerivedRowCandidate): boolean => normalizeLookup(item.rowId) === normalizeLookup(row.rowId)) ?? null
                    : null;
                if (row.sourceRefs.length > 0) {
                    actionButtons.push(`<button class="stx-re-btn" data-logic-row-action="sources" data-row-id="${escapeHtml(row.rowId)}"${buildTipAttr('查看这条逻辑行的来源明细。')}>来源</button>`);
                }
                if (row.rowKind === 'derived' && candidate) {
                    actionButtons.push(`<button class="stx-re-btn" data-logic-row-action="promote" data-row-id="${escapeHtml(row.rowId)}" data-candidate-id="${escapeHtml(candidate.candidateId)}"${buildTipAttr('把这条候选行转为正式逻辑行。')}>转正</button>`);
                }
                if (row.rowKind === 'materialized' || row.rowKind === 'redirected') {
                    actionButtons.push(`<button class="stx-re-btn" data-logic-row-action="alias" data-row-id="${escapeHtml(row.rowId)}"${buildTipAttr('为这条逻辑行补充别名。')}>设置别名</button>`);
                    actionButtons.push(`<button class="stx-re-btn danger" data-logic-row-action="tombstone" data-row-id="${escapeHtml(row.rowId)}"${buildTipAttr('隐藏这条逻辑行，但不会立即物理删除。')}>隐藏</button>`);
                }
                if (row.rowKind === 'tombstoned') {
                    actionButtons.push(`<button class="stx-re-btn" data-logic-row-action="restore" data-row-id="${escapeHtml(row.rowId)}"${buildTipAttr('恢复这条已隐藏的逻辑行。')}>恢复</button>`);
                }
                const cellsHtml = view.columns.map((field): string => {
                    const cellValue = row.values[field.key] ?? (field.isPrimaryKey ? row.rowId : '');
                    return `<td><div class="stx-re-value stx-re-logic-cell ${field.isPrimaryKey ? 'is-readonly' : ''}" data-table-key="${escapeHtml(view.tableKey)}" data-row-id="${escapeHtml(row.rowId)}" data-field-key="${escapeHtml(field.key)}" data-readonly="${field.isPrimaryKey ? 'true' : 'false'}" title="${escapeHtml(stringifyDisplayValue(cellValue))}">${escapeHtml(renderLogicCellText(cellValue))}</div></td>`;
                }).join('');
                return `<tr class="${row.rowKind === 'tombstoned' ? 'stx-re-row pending-delete' : 'stx-re-row'}"><td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-logic-row-check" data-row-id="${escapeHtml(row.rowId)}" ${selectedLogicRowIds.has(row.rowId) ? 'checked' : ''}></td><td><div class="stx-re-event-type">${escapeHtml(formatLogicRowDisplayLabel(row.rowId, row.displayName || row.rowId))}</div><div class="stx-re-json compact">${escapeHtml(formatLogicRowKindLabel(row.rowKind))} · ${escapeHtml(statusParts.join(' · ') || `更新于 ${formatTimeLabel(row.updatedAt)}`)}</div></td>${cellsHtml}<td><div class="stx-re-actions">${actionButtons.join('')}</div></td></tr>`;
            }).join('');

        const topMaintenanceLabels = experience.canon.health.maintenanceLabels.slice(0, 3).join(' / ') || '当前结构状态稳定';
        const worldOverview = String(experience.canon.world.overview?.value ?? '').trim() || '这里会直接展示当前聊天的逻辑表、候选行、别名、重定向和隐藏项维护状态。';
        const quickLocation = isStableSnapshotValue(experience.canon.world.currentLocation) ? experience.canon.world.currentLocation!.value : '尚未稳定抽取';
        const tableSummary = orderedSummaries.find((item: LogicTableSummary): boolean => item.tableKey === view.tableKey) || orderedSummaries[0];
        const summaryButtonsHtml = orderedSummaries.slice(0, 8).map((summary: LogicTableSummary): string => `
            <button class="stx-re-btn${summary.tableKey === view.tableKey ? ' save' : ''}" data-logic-summary-key="${escapeHtml(summary.tableKey)}"${buildTipAttr(`切换到 ${summary.title} 逻辑表。当前状态：${formatLogicStatusLabel(summary.status)}。`)}>${escapeHtml(summary.title)} · ${escapeHtml(formatLogicStatusLabel(summary.status))}</button>
        `).join('');
        const coverageCardsHtml = [
            { label: '正式行', value: String(view.sourceCoverage.factRows), tone: '' },
            { label: '候选行', value: String(view.sourceCoverage.derivedRows), tone: view.sourceCoverage.derivedRows > 0 ? 'color: var(--SmartThemeQuoteColor, #4a90e2);' : '' },
            { label: '隐藏项', value: String(view.sourceCoverage.tombstonedRows), tone: view.sourceCoverage.tombstonedRows > 0 ? 'color: var(--SmartThemeQuoteColor, #f59e0b);' : '' },
            { label: '重定向', value: String(view.sourceCoverage.redirectedRows), tone: view.sourceCoverage.redirectedRows > 0 ? 'color: var(--SmartThemeQuoteColor, #f59e0b);' : '' },
            { label: '别名', value: String(view.sourceCoverage.aliasCount), tone: view.sourceCoverage.aliasCount > 0 ? 'color: var(--SmartThemeQuoteColor, #4a90e2);' : '' },
            { label: '待处理来源', value: String(candidates.length), tone: candidates.length > 0 ? 'color: var(--SmartThemeQuoteColor, #4a90e2);' : '' },
        ].map((item: { label: string; value: string; tone: string }): string => `
            <div class="stx-re-panel-card stx-re-panel-chip"${buildTipAttr(`${item.label}：${item.value}`)}>
                <div style="font-size:11px; opacity:0.7; margin-bottom:4px;">${escapeHtml(item.label)}</div>
                <div style="font-weight:700; ${item.tone}">${escapeHtml(item.value)}</div>
            </div>
        `).join('');

        contentArea.innerHTML = `
            <div class="stx-re-shell-stack">
                <div class="stx-re-panel-grid">
                    <div class="stx-re-panel-card stx-re-panel-card-emphasis">
                        <div class="stx-re-world-section-title">逻辑表维护概览</div>
                        <div class="stx-re-record-sub">${escapeHtml(worldOverview)}</div>
                        <div class="stx-re-record-code">地点：${escapeHtml(quickLocation)}</div>
                    </div>
                    <div class="stx-re-panel-card">
                        <div class="stx-re-world-section-title">世界约束</div>
                        <div class="stx-re-record-sub">规则：${escapeHtml(summarizeSnapshotValues(experience.canon.world.rules, 2))}</div>
                        <div class="stx-re-record-code">硬约束：${escapeHtml(summarizeSnapshotValues(experience.canon.world.hardConstraints, 2))}</div>
                        <div class="stx-re-record-code">活跃世界书：${escapeHtml(summarizeSnapshotValues(experience.canon.world.activeLorebooks, 2))}</div>
                    </div>
                    <div class="stx-re-panel-card">
                        <div class="stx-re-world-section-title">逻辑表维护状态</div>
                        <div class="stx-re-record-sub">${escapeHtml(topMaintenanceLabels)}</div>
                        <div class="stx-re-record-code">角色 ${experience.canon.characters.length} / 表 ${orderedSummaries.length}</div>
                        <div class="stx-re-record-code">事实 ${experience.canon.health.dataLayers.factsCount} / 世界状态 ${experience.canon.health.dataLayers.worldStateCount}</div>
                    </div>
                </div>
                <div class="stx-re-split-layout">
                    <div class="stx-re-side-column">
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title">当前目标</div>
                            <div class="stx-re-record-sub">当前聊天：${escapeHtml(formatChatKeyLabel(currentChatKey))}</div>
                            <div class="stx-re-record-code">模板：${escapeHtml(template.name)}（${escapeHtml(formatTemplateIdLabel(template.templateId))}）</div>
                            <div class="stx-re-record-code">绑定状态：${binding?.isLocked ? '已锁定' : '自动同步'}</div>
                            <div class="stx-re-record-code">当前表：${escapeHtml(view.title)}（${escapeHtml(formatLogicTableKeyLabel(view.tableKey))}）</div>
                            <div class="stx-re-record-sub">${escapeHtml(formatLogicTableSummaryLine(tableSummary))}</div>
                        </div>
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title">逻辑表切换</div>
                            <select class="text_pole" data-logic-table-select>${tableOptionsHtml}</select>
                            <div class="stx-re-world-filter-list stx-re-chip-list">${summaryButtonsHtml}</div>
                        </div>
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title">维护动作</div>
                            <div class="stx-re-action-grid">
                                <button class="stx-re-btn" data-logic-refresh${buildTipAttr('重新读取当前聊天的逻辑表状态和候选来源。')}>刷新</button>
                                <button class="stx-re-btn" data-logic-create-toggle${buildTipAttr(logicCreateExpanded ? '收起新建表单。' : '展开新建行表单，用于手动补录逻辑行。')}>${logicCreateExpanded ? '取消新建' : '新建行'}</button>
                                <button class="stx-re-btn" data-logic-merge${buildTipAttr('将当前勾选的两行逻辑记录合并为一行。')}>合并选中</button>
                                <button class="stx-re-btn danger" data-logic-delete${buildTipAttr('将当前勾选的逻辑行标记为隐藏，不会立即物理删除。')}>隐藏选中</button>
                                <button class="stx-re-btn" data-logic-restore${buildTipAttr('恢复当前勾选的已隐藏逻辑行。')}>恢复选中</button>
                                <button class="stx-re-btn" data-logic-repair="normalize_aliases"${buildTipAttr('扫描并整理当前逻辑表中的别名与重定向关系。')}>规范别名</button>
                                <button class="stx-re-btn" data-logic-repair="compact_tombstones"${buildTipAttr('整理隐藏项，压缩逻辑表中无效或已废弃的记录。')}>整理隐藏项</button>
                                <button class="stx-re-btn" data-logic-repair="rebuild_candidates"${buildTipAttr('根据当前数据层重新生成待处理候选行。')}>重建候选</button>
                                <button class="stx-re-btn" data-open-diagnostics${buildTipAttr('跳转到系统诊断面板，查看当前聊天的结构风险和健康状态。')}>查看诊断</button>
                            </div>
                        </div>
                    </div>
                    <div class="stx-re-main-column">
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title">逻辑表覆盖统计</div>
                            <div class="stx-re-chip-wrap">${coverageCardsHtml}</div>
                        </div>
                        ${view.warnings.length > 0 ? `<div class="stx-re-panel-card stx-re-panel-card-warning"><div class="stx-re-world-section-title">当前预警</div><div class="stx-re-record-sub">${escapeHtml(view.warnings.join(' / '))}</div></div>` : ''}
                        ${logicCreateExpanded ? `<div class="stx-re-panel-card"><div class="stx-re-world-section-title">新建 ${escapeHtml(view.title)} 行</div><label style="display:flex; flex-direction:column; gap:4px; min-width:220px;"><span>行 ID（主键）</span><input class="text_pole" data-create-row-id placeholder="请输入新的行 ID"></label><div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px;">${createFieldsHtml || '<span class="stx-re-json">当前表暂无额外字段，可先创建空行后再编辑。</span>'}</div><div class="stx-re-action-row"><button class="stx-re-btn save" data-logic-create-submit>立即创建</button><button class="stx-re-btn" data-logic-create-cancel>取消</button></div></div>` : ''}
                        <div class="stx-re-panel-card">
                            <div class="stx-re-world-section-title">逻辑行清单</div>
                            <table class="stx-re-table"><thead><tr><th style="width:30px; text-align:center;"><input type="checkbox" class="stx-re-checkbox" data-logic-check-all></th><th>行 / 状态</th>${headerHtml}<th style="min-width:180px;">维护动作</th></tr></thead><tbody>${rowsHtml}</tbody></table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const tableSelect = contentArea.querySelector('[data-logic-table-select]') as HTMLSelectElement | null;
        tableSelect?.addEventListener('change', (): void => {
            currentLogicTableKey = tableSelect.value;
            selectedLogicRowIds.clear();
            logicCreateExpanded = false;
            void renderLogicView();
        });

        contentArea.querySelectorAll('[data-logic-summary-key]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                currentLogicTableKey = String((button as HTMLElement).dataset.logicSummaryKey ?? '').trim();
                selectedLogicRowIds.clear();
                logicCreateExpanded = false;
                void renderLogicView();
            });
        });

        contentArea.querySelector('[data-logic-refresh]')?.addEventListener('click', (): void => {
            void loadChatKeys().then((): Promise<void> => renderLogicView());
        });

        contentArea.querySelector('[data-logic-create-toggle]')?.addEventListener('click', (): void => {
            logicCreateExpanded = !logicCreateExpanded;
            void renderLogicView();
        });

        contentArea.querySelector('[data-logic-create-cancel]')?.addEventListener('click', (): void => {
            logicCreateExpanded = false;
            void renderLogicView();
        });

        contentArea.querySelector('[data-logic-create-submit]')?.addEventListener('click', (): void => {
            const rowIdInput = contentArea.querySelector('[data-create-row-id]') as HTMLInputElement | null;
            const rowId = String(rowIdInput?.value ?? '').trim();
            if (!rowId) {
                alert('请先填写行 ID。');
                return;
            }
            const primaryKeyField = view.columns.find((column): boolean => Boolean(column.isPrimaryKey))?.key;
            const seed: Record<string, unknown> = primaryKeyField ? { [primaryKeyField]: rowId } : {};
            contentArea.querySelectorAll('[data-create-field]').forEach((input: Element): void => {
                const element = input as HTMLInputElement;
                const fieldKey = String(element.dataset.createField ?? '').trim();
                const rawValue = String(element.value ?? '').trim();
                if (!fieldKey || !rawValue) {
                    return;
                }
                seed[fieldKey] = parseLooseValue(rawValue);
            });
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.rows.create(view.tableKey, rowId, seed);
                logicCreateExpanded = false;
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已创建 ${view.tableKey}/${rowId}`);
            }).catch((error: unknown): void => {
                toast.error(`创建行失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-delete]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length === 0) {
                alert('请先选择要删除的行。');
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                for (const rowId of rowIds) {
                    await memoryInstance.logicTable.tombstoneRow(view.tableKey, rowId);
                }
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已隐藏 ${rowIds.length} 行`);
            }).catch((error: unknown): void => {
                toast.error(`隐藏失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-restore]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length === 0) {
                alert('请先选择要恢复的行。');
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                for (const rowId of rowIds) {
                    await memoryInstance.logicTable.restoreRow(view.tableKey, rowId);
                }
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已恢复 ${rowIds.length} 行`);
            }).catch((error: unknown): void => {
                toast.error(`恢复失败: ${String(error)}`);
            });
        });

        contentArea.querySelector('[data-logic-merge]')?.addEventListener('click', (): void => {
            const rowIds = Array.from(selectedLogicRowIds);
            if (rowIds.length !== 2) {
                alert('合并前请恰好选中 2 行。');
                return;
            }
            const targetRowId = prompt(`请输入保留的行 ID：\n${rowIds.join('\n')}`, rowIds[0] || '');
            if (!targetRowId) {
                return;
            }
            const normalizedTargetRowId = targetRowId.trim();
            if (!rowIds.includes(normalizedTargetRowId)) {
                alert('保留行 ID 必须来自当前选中的两行。');
                return;
            }
            const sourceRowId = rowIds.find((rowId: string): boolean => rowId !== normalizedTargetRowId);
            if (!sourceRowId) {
                return;
            }
            void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                if (!memoryInstance) {
                    return;
                }
                await memoryInstance.logicTable.mergeRows(view.tableKey, sourceRowId, normalizedTargetRowId);
                selectedLogicRowIds.clear();
                await loadChatKeys();
                await renderLogicView();
                toast.success(`已合并 ${sourceRowId} -> ${normalizedTargetRowId}`);
            }).catch((error: unknown): void => {
                toast.error(`合并失败: ${String(error)}`);
            });
        });

        contentArea.querySelectorAll('[data-logic-repair]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const mode = String((button as HTMLElement).dataset.logicRepair ?? '').trim() as 'normalize_aliases' | 'compact_tombstones' | 'rebuild_candidates';
                if (!mode) {
                    return;
                }
                void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                    if (!memoryInstance) {
                        return;
                    }
                    await memoryInstance.logicTable.repairTable(view.tableKey, mode);
                    await loadChatKeys();
                    await renderLogicView();
                    toast.success(mode === 'rebuild_candidates' ? '候选已重建' : mode === 'compact_tombstones' ? '隐藏项已整理' : '别名已规范');
                }).catch((error: unknown): void => {
                    toast.error(`执行维护失败: ${String(error)}`);
                });
            });
        });

        contentArea.querySelectorAll('[data-logic-row-action]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const element = button as HTMLElement;
                const action = String(element.dataset.logicRowAction ?? '').trim();
                const rowId = String(element.dataset.rowId ?? '').trim();
                const candidateId = String(element.dataset.candidateId ?? '').trim();
                if (!action || !rowId) {
                    return;
                }
                const row = view.rows.find((item: LogicRowView): boolean => item.rowId === rowId) ?? null;
                if (action === 'sources') {
                    openLogicSourceDetailsDialog(
                        `${view.title} / ${row?.displayName || rowId}`,
                        `${row ? formatLogicRowKindLabel(row.rowKind) : '逻辑行'} · ${row?.sourceRefs.length ?? 0} 条来源明细`,
                        row?.sourceRefs ?? [],
                    );
                    return;
                }
                void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                    if (!memoryInstance) {
                        return;
                    }
                    if (action === 'promote') {
                        await memoryInstance.logicTable.promoteDerivedRow(view.tableKey, candidateId);
                        toast.success('候选行已转正');
                    } else if (action === 'restore') {
                        await memoryInstance.logicTable.restoreRow(view.tableKey, rowId);
                        toast.success('逻辑行已恢复');
                    } else if (action === 'tombstone') {
                        if (!confirm(`确定隐藏逻辑行 ${rowId} 吗？`)) {
                            return;
                        }
                        await memoryInstance.logicTable.tombstoneRow(view.tableKey, rowId);
                        toast.success('逻辑行已隐藏');
                    } else if (action === 'alias') {
                        const alias = prompt(`为 ${formatLogicRowDisplayLabel(rowId, row?.displayName || rowId)} 输入一个别名`, '');
                        if (!alias || !alias.trim()) {
                            return;
                        }
                        await memoryInstance.logicTable.setAlias(view.tableKey, rowId, alias.trim());
                        toast.success('别名已设置');
                    }
                    await loadChatKeys();
                    await renderLogicView();
                }).catch((error: unknown): void => {
                    toast.error(`执行维护动作失败: ${String(error)}`);
                });
            });
        });

        contentArea.querySelector('[data-open-diagnostics]')?.addEventListener('click', (): void => {
            currentViewMode = 'diagnostics';
            void renderActiveView();
        });

        const checkAll = contentArea.querySelector('[data-logic-check-all]') as HTMLInputElement | null;
        checkAll?.addEventListener('change', (): void => {
            const rowChecks = contentArea.querySelectorAll('.stx-re-logic-row-check') as NodeListOf<HTMLInputElement>;
            rowChecks.forEach((checkbox: HTMLInputElement): void => {
                checkbox.checked = Boolean(checkAll.checked);
                const rowId = String(checkbox.dataset.rowId ?? '');
                if (!rowId) {
                    return;
                }
                if (checkbox.checked) {
                    selectedLogicRowIds.add(rowId);
                } else {
                    selectedLogicRowIds.delete(rowId);
                }
            });
        });

        contentArea.querySelectorAll('.stx-re-logic-row-check').forEach((checkbox: Element): void => {
            checkbox.addEventListener('change', (): void => {
                const element = checkbox as HTMLInputElement;
                const rowId = String(element.dataset.rowId ?? '');
                if (!rowId) {
                    return;
                }
                if (element.checked) {
                    selectedLogicRowIds.add(rowId);
                } else {
                    selectedLogicRowIds.delete(rowId);
                }
            });
        });

        contentArea.querySelectorAll('.stx-re-logic-cell').forEach((cell: Element): void => {
            const element = cell as HTMLElement;
            if (element.dataset.readonly === 'true') {
                return;
            }
            element.addEventListener('dblclick', (): void => startLogicCellEditing(element));
            element.addEventListener('keydown', (event: Event): void => {
                const keyboardEvent = event as KeyboardEvent;
                if (keyboardEvent.key === 'Enter') {
                    keyboardEvent.preventDefault();
                    void finishLogicCellEditing(element);
                } else if (keyboardEvent.key === 'Escape') {
                    keyboardEvent.preventDefault();
                    void renderLogicView();
                }
            });
            element.addEventListener('blur', (): void => {
                void finishLogicCellEditing(element);
            });
        });
    }

    async function renderDiagnosticsView(): Promise<void> {
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载系统诊断...</div>';
        if (!currentChatKey) {
            contentArea.innerHTML = '<div class="stx-re-empty">系统诊断需要先选择一个具体聊天。</div>';
            return;
        }

        const memory = await ensureRecordMemory();
        if (!memory) {
            contentArea.innerHTML = '<div class="stx-re-empty">无法为当前聊天建立 MemorySDK。</div>';
            return;
        }

        const [experience, summaries, ownedStates, lifecycleList, personaProfiles, activeActorKey] = await Promise.all([
            memory.editor.getExperienceSnapshot() as Promise<EditorExperienceSnapshot>,
            memory.logicTable.listLogicTables() as Promise<LogicTableSummary[]>,
            memory.chatState.getOwnedMemoryStates(240) as Promise<OwnedMemoryState[]>,
            memory.chatState.getMemoryLifecycleSummary(240) as Promise<MemoryLifecycleState[]>,
            memory.chatState.getPersonaMemoryProfiles(),
            memory.chatState.getActiveActorKey(),
        ]);
        const canon = experience.canon;
        const health = canon.health;
        const orderedSummaries = sortLogicTableSummaries(summaries);
        const actorLabelMap = new Map<string, string>();
        canon.characters.forEach((character): void => {
            const actorKey = String(character.actorKey ?? '').trim();
            if (!actorKey) {
                return;
            }
            actorLabelMap.set(actorKey, String(character.displayName ?? actorKey).trim() || actorKey);
        });
        const seedActorKey = String(experience.semanticSeed?.identitySeed?.roleKey ?? '').trim();
        const seedActorName = String(experience.semanticSeed?.identitySeed?.displayName ?? '').trim();
        if (seedActorKey) {
            actorLabelMap.set(seedActorKey, resolveActorDisplayLabel(seedActorKey, seedActorName || actorLabelMap.get(seedActorKey) || seedActorKey));
        }
        ownedStates.forEach((item: OwnedMemoryState): void => {
            const ownerActorKey = String(item.ownerActorKey ?? '').trim();
            if (ownerActorKey && !actorLabelMap.has(ownerActorKey)) {
                actorLabelMap.set(ownerActorKey, formatActorKeyLabel(ownerActorKey));
            }
        });
        const lifecycleMap = new Map<string, MemoryLifecycleState>(
            lifecycleList.map((item: MemoryLifecycleState): [string, MemoryLifecycleState] => [item.recordKey, item]),
        );
        const eventTitleMap = new Map<string, string>();
        ownedStates.forEach((owned: OwnedMemoryState): void => {
            if (owned.memorySubtype !== 'major_plot_event') {
                return;
            }
            eventTitleMap.set(owned.recordKey, buildMemoryRecordHeadline(owned.recordKey, lifecycleMap.get(owned.recordKey), owned));
        });
        const forgottenCount = ownedStates.filter((item: OwnedMemoryState): boolean => item.forgotten === true).length;
        const stageCounts = {
            clear: lifecycleList.filter((item: MemoryLifecycleState): boolean => item.stage === 'clear').length,
            blur: lifecycleList.filter((item: MemoryLifecycleState): boolean => item.stage === 'blur').length,
            distorted: lifecycleList.filter((item: MemoryLifecycleState): boolean => item.stage === 'distorted').length,
        };
        const affectedByEvent = ownedStates.filter((item: OwnedMemoryState): boolean => (item.reinforcedByEventIds?.length ?? 0) > 0 || (item.invalidatedByEventIds?.length ?? 0) > 0);
        const reinforcedCount = ownedStates.filter((item: OwnedMemoryState): boolean => (item.reinforcedByEventIds?.length ?? 0) > 0).length;
        const invalidatedCount = ownedStates.filter((item: OwnedMemoryState): boolean => (item.invalidatedByEventIds?.length ?? 0) > 0).length;
        const recentAffectedRows = affectedByEvent
            .map((owned: OwnedMemoryState): { owned: OwnedMemoryState; lifecycle: MemoryLifecycleState | undefined } => ({
                owned,
                lifecycle: lifecycleMap.get(owned.recordKey),
            }))
            .sort((left, right): number => Number(right.lifecycle?.updatedAt ?? right.owned.updatedAt ?? 0) - Number(left.lifecycle?.updatedAt ?? left.owned.updatedAt ?? 0))
            .slice(0, 8);
        const sortedPersonaProfiles = Object.entries(personaProfiles ?? {})
            .sort((left: [string, PersonaMemoryProfile], right: [string, PersonaMemoryProfile]): number => {
                const leftLabel = actorLabelMap.get(left[0]) || left[0];
                const rightLabel = actorLabelMap.get(right[0]) || right[0];
                return leftLabel.localeCompare(rightLabel, 'zh-CN');
            });
        const activeActorLabel = activeActorKey ? (actorLabelMap.get(activeActorKey) || activeActorKey) : '自动 / 未指定';
        const criticalCount = health.issues.filter((issue): boolean => issue.severity === 'critical').length;
        const warningCount = health.issues.filter((issue): boolean => issue.severity === 'warning').length;
        const infoCount = health.issues.filter((issue): boolean => issue.severity === 'info').length;
        const majorEventCount = ownedStates.filter((item: OwnedMemoryState): boolean => item.memorySubtype === 'major_plot_event').length;
        const signalState = resolveRecordDiagnosticsSignalState(health);
        const maintenanceSummaryText = health.maintenanceLabels.slice(0, 4).join(' / ') || '当前没有明显维护提示';
        const currentLocationText = isStableSnapshotValue(canon.world.currentLocation) ? canon.world.currentLocation!.value : '尚未稳定抽取';
        const worldRulesText = summarizeSnapshotValues(canon.world.rules, 2);
        const hardConstraintsText = summarizeSnapshotValues(canon.world.hardConstraints, 2);
        const personaCardsHtml = sortedPersonaProfiles.length > 0
            ? sortedPersonaProfiles.map(([actorKey, profile]: [string, PersonaMemoryProfile]): string => {
                const actorLabel = actorLabelMap.get(actorKey) || actorKey;
                const actionButtons = [
                    `<button class="stx-re-btn ${actorKey === activeActorKey ? 'save' : ''}" data-diag-persona-actor="${escapeHtml(actorKey)}"${buildTipAttr(actorKey === activeActorKey ? '当前已经是诊断主视角。' : '将这个角色设为诊断面板里的当前主视角。')}>${actorKey === activeActorKey ? '当前主视角' : '设为主视角'}</button>`,
                ].join('');
                return renderPersonaProfileCardMarkup(actorKey, actorLabel, profile, {
                    active: actorKey === activeActorKey,
                    extraActionsHtml: actionButtons,
                });
            }).join('')
            : '<div class="stx-re-empty">当前还没有建立角色画像，可先刷新初始设定或重算画像。</div>';
        const actorForgetRateRows = Array.from(ownedStates.reduce<Map<string, { actorKey: string; actorLabel: string; total: number; forgotten: number; avgProbability: number }>>((map, owned: OwnedMemoryState) => {
            const retentionRows = buildMemoryActorRetentionRows(owned, lifecycleMap.get(owned.recordKey), actorLabelMap, activeActorKey);
            retentionRows.forEach((row: MemoryActorRetentionRowViewModel): void => {
                const actorKey = row.actorKey;
                const actorLabel = row.actorLabel;
                const current = map.get(actorKey) ?? { actorKey, actorLabel, total: 0, forgotten: 0, avgProbability: 0 };
                current.total += 1;
                current.avgProbability += Number(row.state.forgetProbability ?? 0) || 0;
                if (row.state.forgotten) {
                    current.forgotten += 1;
                }
                map.set(actorKey, current);
            });
            return map;
        }, new Map<string, { actorKey: string; actorLabel: string; total: number; forgotten: number; avgProbability: number }>()).values())
            .map((item: { actorKey: string; actorLabel: string; total: number; forgotten: number; avgProbability: number }) => ({
                ...item,
                avgProbability: item.total > 0 ? item.avgProbability / item.total : 0,
                forgottenRate: item.total > 0 ? item.forgotten / item.total : 0,
            }))
            .sort((left, right): number => right.forgottenRate - left.forgottenRate || right.total - left.total)
            .slice(0, 8);
        const actorForgetRateHtml = actorForgetRateRows.length > 0
            ? actorForgetRateRows.map((item: { actorKey: string; actorLabel: string; total: number; forgotten: number; avgProbability: number; forgottenRate: number }): string => {
                const toneClassName = item.forgottenRate >= 0.5 ? 'is-danger' : item.forgottenRate >= 0.25 ? 'is-warning' : 'is-stable';
                return `
                    <div class="stx-re-diag-forget-card ${toneClassName}">
                        <div class="stx-re-diag-forget-head">
                            <strong>${escapeHtml(item.actorLabel)}</strong>
                            <span class="stx-re-diag-issue-pill ${toneClassName}">${escapeHtml(formatPercent(item.forgottenRate))}</span>
                        </div>
                        <div class="stx-re-retention-bar is-compact"><div class="stx-re-retention-fill" style="width:${Math.max(4, Math.round(item.forgottenRate * 1000) / 10)}%"></div></div>
                        <div class="stx-re-diag-forget-meta">已遗忘 ${escapeHtml(String(item.forgotten))} / ${escapeHtml(String(item.total))}</div>
                        <div class="stx-re-diag-forget-meta">平均遗忘概率 ${escapeHtml(formatPercent(item.avgProbability))}</div>
                    </div>
                `;
            }).join('')
            : '<div class="stx-re-empty">当前没有可统计的角色遗忘分布。</div>';
        const consoleStripHtml = [
            {
                label: '高优先问题',
                value: String(criticalCount),
                meta: `${health.issues.length} 项诊断结果`,
            },
            {
                label: '注意项',
                value: String(warningCount),
                meta: `提示 ${infoCount} 项`,
            },
            {
                label: '逻辑表',
                value: String(orderedSummaries.length),
                meta: `角色 ${canon.characters.length} 个`,
            },
            {
                label: '角色画像',
                value: String(sortedPersonaProfiles.length),
                meta: `主视角 ${activeActorLabel}`,
            },
            {
                label: '事件影响',
                value: String(affectedByEvent.length),
                meta: `重大事件 ${majorEventCount} 条`,
            },
        ].map((item: { label: string; value: string; meta: string }): string => `
            <div class="stx-re-diag-strip-cell">
                <span class="stx-re-diag-strip-label">${escapeHtml(item.label)}</span>
                <strong class="stx-re-diag-strip-value">${escapeHtml(item.value)}</strong>
                <span class="stx-re-diag-strip-meta">${escapeHtml(item.meta)}</span>
            </div>
        `).join('');
        const signalTilesHtml = [
            {
                label: '孤儿事实',
                value: `${health.orphanFactsCount ?? 0} 条`,
            },
            {
                label: '重复风险',
                value: formatPercent(health.duplicateEntityRisk),
            },
            {
                label: '草稿修订',
                value: health.hasDraftRevision ? '存在' : '无',
            },
            {
                label: '已遗忘',
                value: `${forgottenCount} 条`,
            },
        ].map((item: { label: string; value: string }): string => `
            <div class="stx-re-diag-signal-cell">
                <span class="stx-re-diag-signal-cell-label">${escapeHtml(item.label)}</span>
                <strong class="stx-re-diag-signal-cell-value">${escapeHtml(item.value)}</strong>
            </div>
        `).join('');
        const overviewCardsHtml = [
            {
                eyebrow: '世界观速览',
                title: currentLocationText,
                detail: `规则：${worldRulesText}`,
                meta: `硬约束：${hardConstraintsText}`,
                toneClassName: 'is-accent',
                iconClassName: 'fa-solid fa-globe',
            },
            {
                eyebrow: '数据层覆盖',
                title: `事实 ${health.dataLayers.factsCount ?? 0} / 世界状态 ${health.dataLayers.worldStateCount ?? 0}`,
                detail: `摘要 ${health.dataLayers.summaryCount ?? 0} / 事件 ${health.dataLayers.eventCount ?? 0}`,
                meta: `别名 ${health.dataLayers.aliasCount ?? 0} / 重定向 ${health.dataLayers.redirectCount ?? 0} / 已隐藏 ${health.dataLayers.tombstoneCount ?? 0}`,
                toneClassName: 'is-soft',
                iconClassName: 'fa-solid fa-layer-group',
            },
            {
                eyebrow: '遗忘矩阵',
                title: `清晰 ${stageCounts.clear} / 模糊 ${stageCounts.blur}`,
                detail: `偏差 ${stageCounts.distorted} / 已遗忘 ${forgottenCount}`,
                meta: `受事件影响 ${affectedByEvent.length} 条 / 强化 ${reinforcedCount} 条`,
                toneClassName: 'is-warning',
                iconClassName: 'fa-solid fa-brain',
            },
            {
                eyebrow: '维护提示',
                title: maintenanceSummaryText,
                detail: `角色 ${canon.characters.length} / 表 ${orderedSummaries.length} / 重大事件 ${majorEventCount}`,
                meta: `当前主视角：${activeActorLabel}`,
                toneClassName: signalState.toneClassName === 'is-danger' ? 'is-danger' : signalState.toneClassName === 'is-warning' ? 'is-warning' : 'is-soft',
                iconClassName: 'fa-solid fa-screwdriver-wrench',
            },
        ].map((card: { eyebrow: string; title: string; detail: string; meta: string; toneClassName: string; iconClassName: string }): string => `
            <article class="stx-re-diag-summary-card ${card.toneClassName}">
                <div class="stx-re-diag-summary-head">
                    <span class="stx-re-diag-summary-icon"><i class="${escapeHtml(card.iconClassName)}" aria-hidden="true"></i></span>
                    <span class="stx-re-diag-summary-eyebrow">${escapeHtml(card.eyebrow)}</span>
                </div>
                <div class="stx-re-diag-summary-title">${escapeHtml(card.title)}</div>
                <div class="stx-re-diag-summary-detail">${escapeHtml(card.detail)}</div>
                <div class="stx-re-diag-summary-meta">${escapeHtml(card.meta)}</div>
            </article>
        `).join('');
        const issueCardsHtml = health.issues.length > 0
            ? health.issues.map((issue): string => {
                const toneClassName = resolveRecordDiagnosticsIssueToneClass(issue.severity);
                return `
                    <article class="stx-re-diag-issue-card ${toneClassName}">
                        <div class="stx-re-diag-issue-top">
                            <strong>${escapeHtml(issue.label)}</strong>
                            <span class="stx-re-diag-issue-pill ${toneClassName}">${escapeHtml(formatHealthSeverityLabel(issue.severity))}</span>
                        </div>
                        <div class="stx-re-diag-issue-copy">${escapeHtml(issue.detail)}</div>
                        <div class="stx-re-diag-issue-meta">${escapeHtml(issue.actionLabel || '建议继续在系统诊断中处理')}</div>
                    </article>
                `;
            }).join('')
            : '<div class="stx-re-empty">当前没有明显诊断问题。</div>';
        const logicTableCardsHtml = orderedSummaries.length > 0
            ? orderedSummaries.map((summary: LogicTableSummary): string => {
                const toneClassName = resolveRecordDiagnosticsTableToneClass(summary.status);
                return `
                    <article class="stx-re-diag-table-card ${toneClassName}">
                        <div class="stx-re-diag-table-top">
                            <strong>${escapeHtml(summary.title)}</strong>
                            <span class="stx-re-diag-issue-pill ${toneClassName}">${escapeHtml(formatLogicStatusLabel(summary.status))}</span>
                        </div>
                        <div class="stx-re-diag-table-copy">${escapeHtml(formatLogicTableSummaryLine(summary))}</div>
                    </article>
                `;
            }).join('')
            : '<div class="stx-re-empty">当前没有逻辑表摘要。</div>';
        const recentAffectedCardsHtml = recentAffectedRows.length > 0
            ? recentAffectedRows.map(({ owned, lifecycle }: { owned: OwnedMemoryState; lifecycle: MemoryLifecycleState | undefined }): string => {
                const title = buildMemoryRecordHeadline(owned.recordKey, lifecycle, owned);
                return `
                    <article class="stx-re-diag-event-card"${buildTipAttr('这条记忆最近受到了重大事件的强化或冲淡影响。')}>
                        <div class="stx-re-diag-event-top">
                            <div class="stx-re-diag-event-title">${escapeHtml(title)}</div>
                            <span class="stx-re-diag-issue-pill is-soft">${escapeHtml(formatMemoryStageLabel(lifecycle?.stage || 'clear'))}</span>
                        </div>
                        <div class="stx-re-diag-event-copy">${escapeHtml(formatMemoryImpactSummary(owned))}</div>
                        <div class="stx-re-diag-event-links">
                            <div class="stx-re-diag-event-link-row"><strong>强化来源</strong>${renderMemoryEventRefs(owned.reinforcedByEventIds, eventTitleMap, '暂无')}</div>
                            <div class="stx-re-diag-event-link-row"><strong>覆盖 / 冲淡来源</strong>${renderMemoryEventRefs(owned.invalidatedByEventIds, eventTitleMap, '暂无')}</div>
                        </div>
                    </article>
                `;
            }).join('')
            : '<div class="stx-re-empty">当前还没有被重大事件显式影响的记忆。</div>';
        const actionDeckHtml = `
            <article class="stx-re-diag-action-card is-accent">
                <div class="stx-re-diag-action-head">
                    <span class="stx-re-diag-section-kicker">同步修复</span>
                    <div class="stx-re-diag-action-title">先把结构和种子拉回同一条链路</div>
                    <div class="stx-re-diag-action-copy">适合在结构视图不同步、世界设定刚发生变化，或者你怀疑编辑器快照已经滞后时执行。</div>
                </div>
                <div class="stx-re-action-row stx-re-diag-action-row">
                    <button class="stx-re-btn" data-diag-action="rebuild-chat-view"${buildTipAttr('重新构建当前聊天的编辑器结构视图，适合结构不同步时使用。')}>重建结构视图</button>
                    <button class="stx-re-btn" data-diag-action="refresh-seed"${buildTipAttr('重新拉取或刷新当前聊天的初始设定种子。')}>刷新初始设定</button>
                </div>
            </article>
            <article class="stx-re-diag-action-card is-soft">
                <div class="stx-re-diag-action-head">
                    <span class="stx-re-diag-section-kicker">角色校准</span>
                    <div class="stx-re-diag-action-title">把诊断视角收束到更可信的角色画像</div>
                    <div class="stx-re-diag-action-copy">用于重建角色画像、清除手动主视角，让后续观察重新回到自动判断或新的主视角上。</div>
                </div>
                <div class="stx-re-action-row stx-re-diag-action-row">
                    <button class="stx-re-btn" data-diag-action="recompute-personas"${buildTipAttr('重新计算所有角色画像，用于修正角色记忆面板。')}>重算角色画像</button>
                    <button class="stx-re-btn" data-diag-action="clear-active-actor"${buildTipAttr('取消手动指定的主视角，让系统自动选择活跃角色。')}>清除主视角</button>
                </div>
            </article>
            <article class="stx-re-diag-action-card is-warning">
                <div class="stx-re-diag-action-head">
                    <span class="stx-re-diag-section-kicker">结构修复</span>
                    <div class="stx-re-diag-action-title">对逻辑表做集中整理，而不是逐处散修</div>
                    <div class="stx-re-diag-action-copy">当问题集中在别名、隐藏项或候选生成时，直接在这里执行修复比回到其他页签更快。</div>
                </div>
                <div class="stx-re-action-row stx-re-diag-action-row">
                    <button class="stx-re-btn" data-diag-repair="normalize_aliases"${buildTipAttr('针对合适的逻辑表执行别名规范化修复。')}>规范别名</button>
                    <button class="stx-re-btn" data-diag-repair="compact_tombstones"${buildTipAttr('针对合适的逻辑表执行隐藏项整理。')}>整理隐藏项</button>
                    <button class="stx-re-btn" data-diag-repair="rebuild_candidates"${buildTipAttr('针对合适的逻辑表重新生成候选。')}>重建候选</button>
                </div>
            </article>
        `;

        contentArea.innerHTML = `
            <div class="stx-re-diag-shell">
                <section class="stx-re-panel-card stx-re-diag-console">
                    <div class="stx-re-diag-console-grid">
                        <div class="stx-re-diag-console-main">
                            <div class="stx-re-diag-kicker">记录编辑器诊断台</div>
                            <div class="stx-re-diag-title">系统诊断中控台</div>
                            <div class="stx-re-diag-subtitle">把结构风险、修复动作、角色画像和事件影响压到同一个操作面上，减少在不同页签之间来回跳转。</div>
                            <div class="stx-re-diag-ledger">
                                ${[
                                    `当前聊天 ${formatChatKeyLabel(currentChatKey)}`,
                                    `当前主视角 ${activeActorLabel}`,
                                    `维护提示 ${maintenanceSummaryText}`,
                                    `逻辑表 ${orderedSummaries.length} 张`,
                                ].map((item: string): string => `<span class="stx-re-diag-chip">${escapeHtml(item)}</span>`).join('')}
                            </div>
                        </div>
                        <div class="stx-re-diag-console-side">
                            <div class="stx-re-diag-signal ${signalState.toneClassName}">
                                <div class="stx-re-diag-signal-top">
                                    <span class="stx-re-diag-signal-label">诊断信号</span>
                                    <span class="stx-re-diag-chip ${signalState.toneClassName}">${escapeHtml(signalState.badge)}</span>
                                </div>
                                <div class="stx-re-diag-signal-title">${escapeHtml(signalState.title)}</div>
                                <div class="stx-re-diag-signal-copy">${escapeHtml(signalState.summary)}</div>
                                <div class="stx-re-diag-signal-grid">${signalTilesHtml}</div>
                            </div>
                            <div class="stx-re-diag-wave" aria-hidden="true">
                                <span></span>
                                <span></span>
                                <span></span>
                                <span></span>
                            </div>
                        </div>
                    </div>
                    <div class="stx-re-diag-console-strip">${consoleStripHtml}</div>
                </section>

                <div class="stx-re-diag-summary-grid">${overviewCardsHtml}</div>

                <div class="stx-re-diag-main-layout">
                    <div class="stx-re-diag-main">
                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">召回证据</div>
                                    <div class="stx-re-diag-section-title">最近一轮召回与注入摘要</div>
                                </div>
                                <div class="stx-re-diag-section-copy">先确认这一轮究竟命中了什么，再决定是否需要动结构层。</div>
                            </div>
                            ${buildRecallSummaryCardsMarkup(experience)}
                        </section>

                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">边界压制</div>
                                    <div class="stx-re-diag-section-title">最近被角色边界挡下来的候选</div>
                                </div>
                                <div class="stx-re-diag-section-copy">这里适合判断问题是“该放出来”还是“本来就不该进主视角”。</div>
                            </div>
                            ${buildSuppressedRecallListMarkup(experience)}
                        </section>

                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">风险与修复</div>
                                    <div class="stx-re-diag-section-title">把问题列表和动作甲板并排放到一起</div>
                                </div>
                                <div class="stx-re-diag-section-copy">发现问题后可以直接执行修复，不需要再切去别的维护页。</div>
                            </div>
                            <div class="stx-re-diag-split-grid">
                                <div class="stx-re-diag-issue-list">${issueCardsHtml}</div>
                                <div class="stx-re-diag-action-deck">${actionDeckHtml}</div>
                            </div>
                        </section>

                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">事件影响</div>
                                    <div class="stx-re-diag-section-title">最近被重大事件牵动的记忆证据</div>
                                </div>
                                <div class="stx-re-diag-section-copy">用于确认哪些记忆是被事件强化，哪些则被覆盖或冲淡。</div>
                            </div>
                            <div class="stx-re-diag-event-list">${recentAffectedCardsHtml}</div>
                        </section>
                    </div>

                    <aside class="stx-re-diag-side">
                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">角色画像</div>
                                    <div class="stx-re-diag-section-title">多角色记忆画像面板</div>
                                </div>
                            </div>
                            <div class="stx-re-diag-persona-grid">${personaCardsHtml}</div>
                        </section>

                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">遗忘率</div>
                                    <div class="stx-re-diag-section-title">每个角色的遗忘压力分布</div>
                                </div>
                            </div>
                            <div class="stx-re-diag-forget-grid">${actorForgetRateHtml}</div>
                        </section>

                        <section class="stx-re-panel-card stx-re-diag-section">
                            <div class="stx-re-diag-section-head">
                                <div>
                                    <div class="stx-re-diag-section-kicker">逻辑表状态</div>
                                    <div class="stx-re-diag-section-title">当前聊天的结构表摘要</div>
                                </div>
                            </div>
                            <div class="stx-re-diag-table-list">${logicTableCardsHtml}</div>
                        </section>
                    </aside>
                </div>
            </div>
        `;

        contentArea.querySelectorAll('[data-diag-action]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const action = String((button as HTMLElement).dataset.diagAction ?? '').trim();
                void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                    if (!memoryInstance) {
                        return;
                    }
                    if (action === 'rebuild-chat-view') {
                        await memoryInstance.editor.rebuildChatView();
                        toast.success('聊天结构视图已重建');
                    } else if (action === 'refresh-seed') {
                        await memoryInstance.editor.refreshSemanticSeed();
                        toast.success('初始设定已刷新');
                    } else if (action === 'recompute-personas') {
                        await memoryInstance.chatState.recomputePersonaMemoryProfiles();
                        toast.success('角色画像已重算');
                    } else if (action === 'clear-active-actor') {
                        await memoryInstance.chatState.setActiveActorKey(null);
                        toast.success('主视角已切回自动模式');
                    }
                    await loadChatKeys();
                    await renderActiveView();
                }).catch((error: unknown): void => {
                    toast.error(`执行诊断动作失败: ${String(error)}`);
                });
            });
        });

        contentArea.querySelectorAll('[data-diag-repair]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const mode = String((button as HTMLElement).dataset.diagRepair ?? '').trim() as 'normalize_aliases' | 'compact_tombstones' | 'rebuild_candidates';
                const targetTableKey = resolvePreferredLogicTableKey(orderedSummaries, currentLogicTableKey, mode);
                if (!targetTableKey) {
                    toast.info('当前没有可处理的逻辑表');
                    return;
                }
                currentLogicTableKey = targetTableKey;
                void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                    if (!memoryInstance) {
                        return;
                    }
                    await memoryInstance.logicTable.repairTable(targetTableKey, mode);
                    await loadChatKeys();
                    await renderDiagnosticsView();
                    toast.success(mode === 'rebuild_candidates' ? '候选已重建' : mode === 'compact_tombstones' ? '隐藏项已整理' : '别名已规范');
                }).catch((error: unknown): void => {
                    toast.error(`执行维护失败: ${String(error)}`);
                });
            });
        });

        contentArea.querySelectorAll('[data-diag-persona-actor]').forEach((button: Element): void => {
            button.addEventListener('click', (): void => {
                const actorKey = String((button as HTMLElement).dataset.diagPersonaActor ?? '').trim();
                if (!actorKey) {
                    return;
                }
                void ensureRecordMemory().then(async (memoryInstance: MemorySDKImpl | null): Promise<void> => {
                    if (!memoryInstance) {
                        return;
                    }
                    await memoryInstance.chatState.setActiveActorKey(actorKey);
                    await renderDiagnosticsView();
                    toast.success('主视角已更新');
                }).catch((error: unknown): void => {
                    toast.error(`切换主视角失败: ${String(error)}`);
                });
            });
        });
    }

    /**
     * 功能：渲染角色记忆面板。
     * @returns 无返回值。
     */
    async function renderMemoryView(): Promise<void> {
        contentArea.innerHTML = '<div class="stx-re-empty">正在加载角色记忆...</div>';
        if (!currentChatKey) {
            contentArea.innerHTML = '<div class="stx-re-empty">角色记忆需要先选择一个具体聊天。</div>';
            return;
        }

        const memory = await ensureRecordMemory();
        if (!memory) {
            contentArea.innerHTML = '<div class="stx-re-empty">无法为当前聊天建立 MemorySDK。</div>';
            return;
        }

        const [experience, memoryCardSnapshot, roleProfiles, activeActorKey] = await Promise.all([
            memory.editor.getExperienceSnapshot() as Promise<EditorExperienceSnapshot>,
            memory.editor.getMemoryCardSnapshot(),
            memory.chatState.getRoleProfiles(),
            memory.chatState.getActiveActorKey(),
        ]);
        await renderMemoryPage({
            contentArea,
            currentMemoryActorKey,
            currentMemorySearchQuery,
            setCurrentMemoryActorKey(nextActorKey: string): void {
                currentMemoryActorKey = nextActorKey;
            },
            setCurrentMemorySearchQuery(nextQuery: string): void {
                currentMemorySearchQuery = nextQuery;
            },
            ensureRecordMemory,
            rerender: renderMemoryView,
            showSuccess(message: string): void {
                toast.success(message);
            },
            showError(message: string): void {
                toast.error(message);
            },
            experience,
            roleProfiles,
            memoryCards: memoryCardSnapshot.items,
            activeActorKey,
            helpers: {
                escapeHtml,
                buildTipAttr,
                formatTimeLabel,
                formatActorKeyLabel,
                formatMemorySubtypeLabel,
            },
        });
    }
    async function renderActiveView(): Promise<void> {
        worldUiInteractionController?.abort();
        worldUiInteractionController = null;
        updateChromeState();
        if (currentViewMode === 'world') {
            await renderWorldStateStructuredView();
            return;
        }
        if (currentViewMode === 'raw') {
            await renderRawTable(currentRawTable);
            return;
        }
        if (currentViewMode === 'memory') {
            await renderMemoryView();
            return;
        }
        if (currentViewMode === 'vector') {
            if (!currentChatKey) {
                contentArea.innerHTML = '<div class="stx-re-empty">请先在左侧选择一个聊天，再查看记忆卡。</div>';
                return;
            }
            await vectorViewerController?.render();
            return;
        }
        if (currentViewMode === 'diagnostics') {
            await renderDiagnosticsView();
            return;
        }
        currentViewMode = 'world';
        await renderWorldStateStructuredView();
    }

    /**
     * 功能：切换聊天并刷新当前视图。
     * @param chatKey 聊天键
     * @returns 无返回值
     */
    async function switchChat(chatKey: string): Promise<void> {
        currentChatKey = chatKey;
        currentLogicTableKey = '';
        currentMemoryActorKey = '__all__';
        currentMemorySearchQuery = '';
        logicCreateExpanded = false;
        pendingRawFocus = null;
        vectorViewerController?.reset();
        selectedLogicRowIds.clear();
        activateChatItem(chatKey);
        if (currentViewMode !== 'raw') {
            await ensureRecordMemory();
        } else if (recordMemoryChatKey && recordMemoryChatKey !== chatKey) {
            await disposeRecordMemory();
        }
        await renderActiveView();
    }

    /**
     * 功能：关闭记录编辑器。
     * @returns 无返回值
     */
    async function close(): Promise<void> {
        await dialog.close('button');
    }

    btnClearDb.addEventListener('click', (): void => {
        const confirmed = confirm('警告：此操作将清空所有 MemoryOS 数据，且不可恢复。确定继续吗？');
        if (!confirmed) {
            return;
        }
        void clearAllMemoryData().then(async (): Promise<void> => {
            pendingChanges.deletes.clear();
            pendingChanges.updates.clear();
            currentChatKey = '';
            selectedLogicRowIds.clear();
            await disposeRecordMemory();
            await loadChatKeys();
            updateFooterState();
            toast.success('数据库已清空');
            await renderActiveView();
        }).catch((error: unknown): void => {
            logger.error('清空数据库失败', error);
            toast.error(`清空失败: ${String(error)}`);
        });
    });

    btnSave.addEventListener('click', (): void => {
        void saveRawChanges();
    });

    btnBatchDelete.addEventListener('click', (): void => {
        const checkboxes = contentArea.querySelectorAll('.stx-re-select-row:checked') as NodeListOf<HTMLInputElement>;
        checkboxes.forEach((checkbox: HTMLInputElement): void => {
            const id = String(checkbox.dataset.id ?? '');
            if (!id) {
                return;
            }
            pendingChanges.deletes.add(makePendingKey(currentRawTable, id));
            pendingChanges.updates.delete(makePendingKey(currentRawTable, id));
        });
        updateFooterState();
        void renderRawTable(currentRawTable);
    });

    closeBtn?.addEventListener('click', (event: Event): void => {
        event.stopPropagation();
        void close();
    });

    viewTabsContainer.addEventListener('click', (event: Event): void => {
        const target = (event.target as HTMLElement).closest('.stx-re-tab') as HTMLElement | null;
        const nextView = target?.dataset.view as ViewMode | undefined;
        if (!nextView || nextView === currentViewMode) {
            return;
        }
        currentViewMode = nextView;
        selectedLogicRowIds.clear();
        logicCreateExpanded = false;
        void renderActiveView();
    });

    rawTabsContainer.addEventListener('click', (event: Event): void => {
        const target = (event.target as HTMLElement).closest('.stx-re-tab') as HTMLElement | null;
        const nextTable = target?.dataset.table as RawTableName | undefined;
        if (!nextTable || nextTable === currentRawTable) {
            return;
        }
        currentRawTable = nextTable;
        currentSort = { col: '', asc: false };
        btnBatchDelete.classList.add('is-hidden');
        void renderActiveView();
    });

    chatListContainer.addEventListener('click', (event: Event): void => {
        const item = (event.target as HTMLElement).closest('.stx-re-chat-item') as HTMLElement | null;
        if (!item) {
            return;
        }
        void switchChat(String(item.dataset.chatKey ?? ''));
    });

    chatListContainer.addEventListener('contextmenu', (event: Event): void => {
        const mouseEvent = event as MouseEvent;
        const item = (event.target as HTMLElement).closest('.stx-re-chat-item') as HTMLElement | null;
        if (!item) {
            return;
        }
        const chatKey = String(item.dataset.chatKey ?? '');
        if (!chatKey) {
            return;
        }
        mouseEvent.preventDefault();
        removeContextMenus();
        item.classList.add('is-context-target');

        const menu = document.createElement('div');
        menu.className = 'stx-re-ctx-menu';
        menu.style.left = `${mouseEvent.clientX}px`;
        menu.style.top = `${mouseEvent.clientY}px`;
        menu.innerHTML = `<div class="stx-re-ctx-menu-item"><i class="fa-solid fa-trash-can"></i> 删除该会话全部记忆</div>`;
        menu.addEventListener('click', (): void => {
            menu.remove();
            item.classList.remove('is-context-target');
            const confirmed = confirm('此操作会清空该聊天下的事件、事实、摘要、模板和状态，且不可恢复。确定继续吗？');
            if (!confirmed) {
                return;
            }
            void clearMemoryChatData(chatKey).then(async (): Promise<void> => {
                if (currentChatKey === chatKey) {
                    currentChatKey = '';
                    currentLogicTableKey = '';
                    selectedLogicRowIds.clear();
                    await disposeRecordMemory();
                }
                await loadChatKeys();
                updateFooterState();
                toast.success('已清空该会话的 MemoryOS 数据');
                await renderActiveView();
            }).catch((error: unknown): void => {
                logger.error('清空会话记忆失败', error);
                toast.error(`清空失败: ${String(error)}`);
            });
        });
        document.body.appendChild(menu);

        const dismiss = (dismissEvent: Event): void => {
            if (!menu.contains(dismissEvent.target as Node)) {
                menu.remove();
                item.classList.remove('is-context-target');
                document.removeEventListener('pointerdown', dismiss, { capture: true });
                document.removeEventListener('contextmenu', dismiss, { capture: true });
            }
        };
        setTimeout((): void => {
            document.addEventListener('pointerdown', dismiss, { capture: true });
            document.addEventListener('contextmenu', dismiss, { capture: true });
        }, 0);
    });

    await loadChatKeys();
    updateFooterState();
    updateChromeState();
    await renderActiveView();
}
