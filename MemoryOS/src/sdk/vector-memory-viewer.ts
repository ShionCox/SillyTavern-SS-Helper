import { db, type DBFact, type DBMemoryCard, type DBMemoryCardEmbedding, type DBMemoryRecallLog, type DBSummary } from '../db/db';
import type {
    MemoryCardLane,
    MemoryCardStatus,
    MemoryCardSummary,
    MemoryRecallPreviewMode,
    MemoryCardTtl,
    MemoryRecallPreviewHit,
    MemoryRecallPreviewResult,
    MemoryCardViewerSnapshot,
    VectorMemoryRecordSummary,
    VectorMemoryUsageSnapshot,
} from '../../../SDK/stx';
import type {
    AdaptivePolicy,
    InjectionIntent,
    InjectionSectionName,
    RecallGateDecision,
    RecallCandidate,
    RecallPlan,
} from '../types';
import { ChatStateManager } from '../core/chat-state-manager';
import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { VectorManager } from '../vector/vector-manager';
import { buildIntentBudgets, collectAdaptiveMetricsFromEvents, decideInjectionIntent, resolveIntentSections, shouldRunVectorRecall } from '../core/chat-strategy-engine';
import { evaluateLorebookRelevance, loadActiveWorldInfoEntriesFromHost } from '../core/lorebook-relevance-gate';
import { buildPreparedRecallContext } from '../injection/recall-context-builder';
import { buildViewpointPolicyInput } from '../injection/viewpoint-policy';
import { collectRecallCandidates } from '../recall/recall-assembler';
import { planRecall } from '../recall/recall-planner';
import { cutRecallCandidatesByBudget, rankRecallCandidates } from '../recall/recall-ranker';
import { runRerank } from '../llm/memoryLlmBridge';
import { buildRecallTopicHash, collectCheapRecall, resolveRecallGateLanes } from '../injection/recall-gate';

type VectorHit = {
    chunkId: string;
    content: string;
    score: number;
    createdAt?: number;
};

/**
 * 功能：把任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 规整后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：把任意值规整成查找键。
 * @param value 原始值。
 * @returns 小写查找键。
 */
function normalizeLookup(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

/**
 * 功能：归一化字符串数组，便于比较缓存键。
 * 参数：
 *   values：原始字符串数组。
 * 返回：
 *   string[]：去重并排序后的数组。
 */
function normalizeStringList(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set((Array.isArray(values) ? values : []).map((item: string | null | undefined): string => normalizeText(item)).filter(Boolean))).sort();
}

/**
 * 功能：将任意值转为字符串。
 * @param value 原始值。
 * @returns 字符串。
 */
function stringifyValue(value: unknown): string {
    if (typeof value === 'string') {
        return value;
    }
    if (value == null) {
        return '';
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

/**
 * 功能：构建稳定的文本哈希。
 * @param value 原始文本。
 * @returns 哈希文本。
 */
function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：估算文本 token 数量。
 * @param text 文本内容。
 * @returns 估算 token 数。
 */
function estimateTokens(text: string): number {
    if (!text) {
        return 0;
    }
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
    return Math.max(1, Math.ceil(cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25));
}

/**
 * 功能：格式化角色展示名。
 * @param actorKey 角色键。
 * @returns 展示名。
 */
function formatActorLabel(actorKey: string): string {
    const normalized = normalizeText(actorKey);
    if (!normalized) {
        return '未归属';
    }
    const segments = normalized.split(':').filter(Boolean);
    return segments[segments.length - 1] || normalized;
}

/**
 * 功能：构建严格向量文本。
 * @param record 记录。
 * @param recordKind 记录类型。
 * @returns 标准化后的索引文本。
 */
/**
 * 功能：构建列表预览文本。
 * @param text 完整文本。
 * @param maxLength 最大长度。
 * @returns 预览文本。
 */
function buildPreview(text: string, maxLength: number = 120): string {
    const normalized = normalizeText(text);
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(16, maxLength - 1))}…`;
}

/**
 * 功能：格式化来源类型标签。
 * @param kind 来源类型。
 * @returns 中文标签。
 */
/**
 * 功能：根据来源类型推断记忆卡的 lane。
 * @param sourceRecordKind 来源类型。
 * @param memoryType 记忆类型。
 * @param memorySubtype 记忆细分类型。
 * @param sourceLabel 来源标签。
 * @returns 记忆卡 lane。
 */
function inferMemoryLane(
    sourceRecordKind: VectorMemoryRecordSummary['sourceRecordKind'],
    memoryType: string | null | undefined,
    memorySubtype: string | null | undefined,
    sourceLabel: string,
): MemoryCardLane {
    const subtype = normalizeLookup(memorySubtype);
    const type = normalizeLookup(memoryType);
    const label = normalizeLookup(sourceLabel);
    if (subtype === 'identity' || type === 'identity' || label.includes('身份')) {
        return 'identity';
    }
    if (subtype === 'trait' || subtype === 'preference' || label.includes('风格')) {
        return 'style';
    }
    if (subtype === 'bond' || subtype === 'emotion_imprint' || type === 'relationship' || label.includes('关系')) {
        return 'relationship';
    }
    if (subtype === 'global_rule' || subtype === 'city_rule' || subtype === 'item_rule' || subtype === 'faction_rule' || type === 'world' || label.includes('规则')) {
        return 'rule';
    }
    if (subtype === 'current_scene' || subtype === 'current_conflict' || subtype === 'temporary_status' || label.includes('状态')) {
        return 'state';
    }
    if (sourceRecordKind === 'summary' || subtype === 'major_plot_event' || subtype === 'minor_event' || subtype === 'combat_event' || subtype === 'travel_event' || subtype === 'dialogue_quote' || type === 'event' || type === 'dialogue') {
        return 'event';
    }
    return 'other';
}

/**
 * 功能：根据 lane 推断记忆卡的生命周期。
 * @param lane 记忆卡 lane。
 * @returns 生命周期。
 */
function inferMemoryTtl(lane: MemoryCardLane): MemoryCardTtl {
    if (lane === 'state') {
        return 'short';
    }
    if (lane === 'event' || lane === 'relationship') {
        return 'medium';
    }
    return 'long';
}

/**
 * 功能：把旧的状态归一为新版记忆卡状态。
 * @param statusKind 旧状态。
 * @param sourceMissing 是否源记录缺失。
 * @returns 记忆卡状态。
 */
function inferMemoryCardStatus(statusKind: VectorMemoryRecordSummary['statusKind'], sourceMissing: boolean): MemoryCardStatus {
    if (sourceMissing) {
        return 'invalidated';
    }
    if (statusKind === 'archived_residual') {
        return 'superseded';
    }
    return 'active';
}

/**
 * 功能：为记忆卡推断标题。
 * @param item 旧向量记录。
 * @returns 标题文本。
 */
function inferMemoryCardTitle(item: VectorMemoryRecordSummary): string {
    const base = normalizeText(item.sourceLabel) || normalizeText(item.sourceDetail);
    if (base) {
        return base;
    }
    return normalizeText(item.ownerActorLabel) || normalizeText(item.sourceRecordKey) || '记忆卡';
}

/**
 * 功能：为记忆卡推断主体。
 * @param item 旧向量记录。
 * @returns 主体文本。
 */
function inferMemoryCardSubject(item: VectorMemoryRecordSummary): string {
    return normalizeText(item.ownerActorLabel) || normalizeText(item.ownerActorKey) || normalizeText(item.sourceRecordKey) || normalizeText(item.sourceLabel) || '未命名主体';
}

function formatSourceKindLabel(kind: VectorMemoryRecordSummary['sourceRecordKind']): string {
    if (kind === 'fact') {
        return '事实';
    }
    if (kind === 'summary') {
        return '摘要';
    }
    if (kind === 'semantic_seed') {
        return '语义种子';
    }
    return '未知来源';
}

/**
 * 功能：从 metadata 中读取锚点消息编号。
 * @param metadata 向量 metadata。
 * @returns 锚点消息编号。
 */
/**
 * 功能：把记忆卡表直接转成查看器卡片。
 * @param cards 记忆卡表数据。
 * @param recallMap 命中日志映射。
 * @param embeddings 记忆卡向量映射。
 * @param facts 事实表数据。
 * @param summaries 摘要表数据。
 * @param state 当前聊天状态。
 * @returns 记忆卡视图项。
 */
function buildMemoryCardSnapshotItemsFromCards(
    cards: DBMemoryCard[],
    recallMap: Map<string, DBMemoryRecallLog[]>,
    embeddings: Map<string, DBMemoryCardEmbedding>,
    facts: DBFact[],
    summaries: DBSummary[],
    state: Awaited<ReturnType<ChatStateManager['load']>> | null,
): MemoryCardSummary[] {
    const factMap = new Map<string, DBFact>(facts.map((item: DBFact): [string, DBFact] => [normalizeText(item.factKey), item]));
    const summaryMap = new Map<string, DBSummary>(summaries.map((item: DBSummary): [string, DBSummary] => [normalizeText(item.summaryId), item]));
    const actorLabelMap = state ? buildActorLabelMap(state) : new Map<string, string>();
    const now = Date.now();
    const items = cards
        .slice()
        .sort((left: DBMemoryCard, right: DBMemoryCard): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
        .map((card: DBMemoryCard): MemoryCardSummary => {
            const sourceRecordKey = normalizeText(card.sourceRecordKey) || null;
            const sourceRecordKind = normalizeText(card.sourceRecordKind) as MemoryCardSummary['sourceRecordKind'];
            const sourceRecord = sourceRecordKind === 'fact'
                ? (sourceRecordKey ? factMap.get(sourceRecordKey) ?? null : null)
                : sourceRecordKind === 'summary'
                    ? (sourceRecordKey ? summaryMap.get(sourceRecordKey) ?? null : null)
                    : null;
            const usage = buildUsageSnapshot(sourceRecordKey ? (recallMap.get(sourceRecordKey) ?? []) : []);
            const embedding = embeddings.get(card.cardId) ?? null;
            const content = normalizeText(card.memoryText);
            const isArchived = card.status !== 'active';
            const lastHitAt = Number(usage.lastHitAt ?? 0) || 0;
            const recentHit = lastHitAt > 0 && now - lastHitAt <= 7 * 24 * 60 * 60 * 1000;
            const longUnused = ((lastHitAt <= 0 && now - Number(card.createdAt ?? 0) > 14 * 24 * 60 * 60 * 1000) || (lastHitAt > 0 && now - lastHitAt > 30 * 24 * 60 * 60 * 1000));
            const sourceMissing = Boolean(sourceRecordKey && !sourceRecord && sourceRecordKind !== 'semantic_seed');
            const statusKind = sourceMissing
                ? 'source_missing'
                : isArchived
                    ? 'archived_residual'
                    : recentHit
                        ? 'recent_hit'
                        : longUnused
                            ? 'long_unused'
                            : 'normal';
            const statusLabel = statusKind === 'source_missing'
                ? '来源丢失'
                : statusKind === 'archived_residual'
                    ? '已归档残留'
                    : statusKind === 'recent_hit'
                        ? '最近命中'
                        : statusKind === 'long_unused'
                            ? '长期未用'
                            : '正常使用';
            const statusTone = statusKind === 'source_missing'
                ? 'danger'
                : statusKind === 'archived_residual'
                    ? 'muted'
                    : statusKind === 'recent_hit'
                        ? 'success'
                        : statusKind === 'long_unused'
                            ? 'warning'
                            : 'success';
            const ownerActorKey = normalizeText(card.ownerActorKey ?? null) || null;
            const participantActorKeys = Array.isArray(card.participantActorKeys)
                ? card.participantActorKeys.map((item: string): string => normalizeText(item)).filter(Boolean)
                : [];
            const sourceLabel = sourceRecordKind === 'fact'
                ? (sourceRecord ? `${normalizeText((sourceRecord as DBFact).type) || '未命名事实'}${normalizeText((sourceRecord as DBFact).path) ? ` · ${normalizeText((sourceRecord as DBFact).path)}` : ''}` : '事实来源缺失')
                : sourceRecordKind === 'summary'
                    ? (sourceRecord ? (normalizeText((sourceRecord as DBSummary).title) || `${normalizeText((sourceRecord as DBSummary).level) || 'scene'} 摘要`) : '摘要来源缺失')
                    : sourceRecordKind === 'semantic_seed'
                        ? '语义种子'
                        : normalizeText(card.title) || normalizeText(card.subject) || '记忆卡';
            const sourceDetail = [
                `记忆层级 · ${normalizeText(card.lane) || 'other'}`,
                `有效期 · ${normalizeText(card.ttl)}`,
                sourceRecordKey ? `来源 · ${sourceRecordKey}` : '',
            ].filter(Boolean).join(' · ');
            const chunkId = normalizeText(card.cardId) || `memory-card:${hashText(content)}`;
            return {
                chunkId,
                chatKey: card.chatKey,
                content,
                preview: buildPreview(content),
                contentHash: hashText(content),
                contentLength: content.length,
                createdAt: Number(card.createdAt ?? 0) || 0,
                sourceRecordKey,
                sourceRecordKind: sourceRecordKind || 'unknown',
                sourceLabel,
                sourceDetail,
                ownerActorKey,
                ownerActorLabel: ownerActorKey ? (actorLabelMap.get(ownerActorKey) || formatActorLabel(ownerActorKey)) : null,
                sourceScope: normalizeText(card.scope) || null,
                memoryType: normalizeText(card.memoryType) || normalizeText(card.lane) || null,
                memorySubtype: normalizeText(card.memorySubtype) || null,
                participantActorKeys,
                participantActorLabels: participantActorKeys.map((item: string): string => actorLabelMap.get(item) || formatActorLabel(item)),
                anchorMessageId: normalizeText(card.sourceMessageIds?.[0]) || null,
                sourceMessageIds: normalizeStringList(Array.isArray(card.sourceMessageIds) ? card.sourceMessageIds : []),
                sourceTraceKind: null,
                sourceReason: normalizeText(card.rememberReason) || null,
                speakerActorKey: normalizeText(card.speakerActorKey) || null,
                speakerLabel: normalizeText(card.speakerLabel) || null,
                rememberedByActorKey: normalizeText(card.rememberedByActorKey) || null,
                rememberReason: normalizeText(card.rememberReason) || null,
                sourceViewHash: null,
                sourceSnapshotHash: null,
                sourceRepairGeneration: null,
                embeddingModel: normalizeText(embedding?.model) || null,
                embeddingDimensions: Array.isArray(embedding?.vector) ? embedding!.vector.length : null,
                statusKind,
                statusLabel,
                statusTone,
                statusReasons: sourceMissing ? ['来源记录缺失'] : isArchived ? [`记忆卡状态：${card.status}`] : [],
                isArchived,
                sourceMissing,
                needsRebuild: sourceMissing || isArchived,
                duplicateCount: 1,
                usage,
                cardId: card.cardId,
                lane: card.lane,
                subject: card.subject,
                title: card.title,
                memoryText: content,
                evidenceText: card.evidenceText ?? null,
                ttl: card.ttl,
                replaceKey: card.replaceKey ?? null,
                status: card.status,
                cardIds: [card.cardId],
            } as MemoryCardSummary;
        });

    const duplicateMap = items.reduce<Map<string, number>>((map: Map<string, number>, item: MemoryCardSummary): Map<string, number> => {
        const key = normalizeText(item.contentHash);
        map.set(key, Number(map.get(key) ?? 0) + 1);
        return map;
    }, new Map<string, number>());

    return items.map((item: MemoryCardSummary): MemoryCardSummary => {
        const duplicateCount = Number(duplicateMap.get(normalizeText(item.contentHash)) ?? 0);
        const statusReasons = duplicateCount > 1
            ? [...item.statusReasons, `检测到 ${duplicateCount} 条重复记忆内容`]
            : item.statusReasons;
        return {
            ...item,
            duplicateCount,
            statusReasons,
        };
    });
}/**
 * 功能：聚合召回日志，得到使用情况快照。
 * @param rows 召回日志列表。
 * @returns 使用情况快照。
 */
function buildUsageSnapshot(rows: DBMemoryRecallLog[]): VectorMemoryUsageSnapshot {
    const now = Date.now();
    const day7 = now - 7 * 24 * 60 * 60 * 1000;
    const day30 = now - 30 * 24 * 60 * 60 * 1000;
    const sorted = [...rows].sort((left: DBMemoryRecallLog, right: DBMemoryRecallLog): number => Number(right.ts ?? 0) - Number(left.ts ?? 0));
    let totalHits = 0;
    let selectedHits = 0;
    let hitsIn7d = 0;
    let hitsIn30d = 0;
    let lastHitAt: number | null = null;
    let lastSelectedAt: number | null = null;
    let lastQuery: string | null = null;
    let lastScore: number | null = null;
    for (const row of sorted) {
        const ts = Number(row.ts ?? 0) || 0;
        totalHits += 1;
        if (row.selected) {
            selectedHits += 1;
        }
        if (ts >= day7) {
            hitsIn7d += 1;
        }
        if (ts >= day30) {
            hitsIn30d += 1;
        }
        if (lastHitAt == null) {
            lastHitAt = ts || null;
            lastQuery = normalizeText(row.query) || null;
            lastScore = Number.isFinite(Number(row.score)) ? Number(row.score) : null;
        }
        if (row.selected && lastSelectedAt == null) {
            lastSelectedAt = ts || null;
        }
    }
    return {
        totalHits,
        selectedHits,
        hitsIn7d,
        hitsIn30d,
        lastHitAt,
        lastSelectedAt,
        lastQuery,
        lastScore,
    };
}

/**
 * 功能：整理角色展示名映射。
 * @param state 当前聊天状态。
 * @returns 角色名映射。
 */
function buildActorLabelMap(state: Awaited<ReturnType<ChatStateManager['load']>>): Map<string, string> {
    const map = new Map<string, string>();
    const identitySeed = state.semanticSeed?.identitySeed;
    if (identitySeed?.roleKey) {
        map.set(normalizeText(identitySeed.roleKey), normalizeText(identitySeed.displayName) || formatActorLabel(identitySeed.roleKey));
    }
    Object.entries(state.semanticSeed?.identitySeeds ?? {}).forEach(([actorKey, item]): void => {
        const normalizedKey = normalizeText(actorKey);
        if (normalizedKey) {
            map.set(normalizedKey, normalizeText(item?.displayName) || formatActorLabel(normalizedKey));
        }
    });
    (state.groupMemory?.lanes ?? []).forEach((lane): void => {
        const normalizedKey = normalizeText(lane.actorKey);
        if (normalizedKey) {
            map.set(normalizedKey, normalizeText(lane.displayName) || map.get(normalizedKey) || formatActorLabel(normalizedKey));
        }
    });
    return map;
}

/**
 * 功能：对一次检索命中执行和主链一致的 rerank。
 * @param query 查询文本。
 * @param hits 原始命中。
 * @param enabled 是否启用 rerank。
 * @param threshold 启动阈值。
 * @returns 重排后的命中。
 */
async function rerankVectorHits(query: string, hits: VectorHit[], enabled: boolean, threshold: number): Promise<VectorHit[]> {
    if (!enabled || hits.length < threshold) {
        return hits;
    }
    const rerank = await runRerank(query, hits.map((item: VectorHit): string => item.content), hits.length);
    if (!rerank.ok || !Array.isArray(rerank.results) || rerank.results.length <= 0) {
        return hits;
    }
    return rerank.results
        .map((item: { index: number; score: number }): VectorHit | null => {
            const hit = hits[item.index] ?? null;
            return hit ? { ...hit, score: Number(item.score ?? hit.score) } : null;
        })
        .filter((item: VectorHit | null): item is VectorHit => item != null)
        .sort((left: VectorHit, right: VectorHit): number => Number(right.score ?? 0) - Number(left.score ?? 0));
}

/**
 * 功能：构建向量查看器所需的数据层。
 */
export class VectorMemoryViewerFacade {
    private chatKey: string;
    private chatStateManager: ChatStateManager;

    constructor(chatKey: string, chatStateManager: ChatStateManager) {
        this.chatKey = chatKey;
        this.chatStateManager = chatStateManager;
    }

    /**
     * 功能：获取当前聊天全部向量片段的查看器快照。
     * @returns 查看器快照。
     */
    async getMemoryCardSnapshot(): Promise<MemoryCardViewerSnapshot> {
        const [state, memoryCards, memoryCardEmbeddings, facts, summaries, recallRows] = await Promise.all([
            this.chatStateManager.load(),
            db.memory_cards.where('[chatKey+updatedAt]').between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER]).reverse().toArray(),
            db.memory_card_embeddings.where('chatKey').equals(this.chatKey).toArray(),
            db.facts.where('[chatKey+updatedAt]').between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER]).reverse().toArray(),
            db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, '', 0], [this.chatKey, '\uffff', Number.MAX_SAFE_INTEGER]).reverse().toArray(),
            db.memory_recall_log.where('chatKey').equals(this.chatKey).toArray(),
        ]);
        const recallMap = recallRows.reduce<Map<string, DBMemoryRecallLog[]>>((map: Map<string, DBMemoryRecallLog[]>, row: DBMemoryRecallLog): Map<string, DBMemoryRecallLog[]> => {
            const key = normalizeText(row.recordKey);
            if (!key) {
                return map;
            }
            const bucket = map.get(key) ?? [];
            bucket.push(row);
            map.set(key, bucket);
            return map;
        }, new Map<string, DBMemoryRecallLog[]>());
        const memoryEmbeddingMap = new Map<string, DBMemoryCardEmbedding>(memoryCardEmbeddings.map((item: DBMemoryCardEmbedding): [string, DBMemoryCardEmbedding] => [normalizeText(item.cardId), item]));
        const cardItems = buildMemoryCardSnapshotItemsFromCards(memoryCards, recallMap, memoryEmbeddingMap, facts, summaries, state);


        return {
            chatKey: this.chatKey,
            generatedAt: Date.now(),
            totalCount: cardItems.length,
            archivedCount: cardItems.filter((item: MemoryCardSummary): boolean => item.isArchived).length,
            sourceMissingCount: cardItems.filter((item: MemoryCardSummary): boolean => item.sourceMissing).length,
            needsRebuildCount: cardItems.filter((item: MemoryCardSummary): boolean => item.needsRebuild).length,
            recentHitCount: cardItems.filter((item: MemoryCardSummary): boolean => item.statusKind === 'recent_hit').length,
            longUnusedCount: cardItems.filter((item: MemoryCardSummary): boolean => item.statusKind === 'long_unused').length,
            items: cardItems,
        };
    }

    /**
     * 功能：模拟一次向量检索，返回记忆卡预览结果。
     * @param query 测试语句。
     * @param opts 附加配置，可指定是否强制执行向量预演。
     * @returns 预览结果。
     */
    async runMemoryRecallPreview(query: string, opts: { maxTokens?: number; forceVector?: boolean } = {}): Promise<MemoryRecallPreviewResult> {
        const normalizedQuery = normalizeText(query);
        const previewMode: MemoryRecallPreviewMode = opts.forceVector === true ? 'forced_vector' : 'effective_policy';
        if (!normalizedQuery) {
            return {
                query: '',
                testedAt: Date.now(),
                rerankApplied: false,
                hitCount: 0,
                selectedCount: 0,
                hits: [],
                previewMode,
            };
        }
        const [snapshot, policy, profile, recentEvents, logicalView, groupMemory, worldStateSnapshot, lorebookEntries, recallContext] = await Promise.all([
            this.getMemoryCardSnapshot(),
            this.chatStateManager.getAdaptivePolicy(),
            this.chatStateManager.getChatProfile(),
            new EventsManager(this.chatKey).query({ limit: 24 }),
            this.chatStateManager.getLogicalChatView(),
            this.chatStateManager.getGroupMemory(),
            new StateManager(this.chatKey).query(''),
            loadActiveWorldInfoEntriesFromHost(),
            buildPreparedRecallContext(this.chatStateManager, normalizedQuery),
        ]);
        const itemMap = new Map<string, MemoryCardSummary>();
        snapshot.items.forEach((item: MemoryCardSummary): void => {
            itemMap.set(item.cardId, item);
            itemMap.set(item.chunkId, item);
            item.cardIds.forEach((cardId: string): void => {
                itemMap.set(cardId, item);
            });
        });
        const mergedMetrics = collectAdaptiveMetricsFromEvents(recentEvents, await this.chatStateManager.getAdaptiveMetrics());
        const intent: InjectionIntent = decideInjectionIntent({
            query: normalizedQuery,
            events: recentEvents,
            metrics: mergedMetrics,
            profile,
            logicalView,
        });
        const sections: InjectionSectionName[] = resolveIntentSections(intent);
        const worldStateText = stringifyValue(worldStateSnapshot);
        const lorebookDecision = evaluateLorebookRelevance({
            query: normalizedQuery,
            profileChatType: profile.chatType,
            visibleMessages: logicalView?.visibleMessages,
            recentEvents,
            worldStateText,
            entries: lorebookEntries,
        });
        const executionPolicy: AdaptivePolicy = previewMode === 'forced_vector'
            ? {
                ...policy,
                vectorEnabled: true,
                vectorMode: policy.vectorMode === 'search' || policy.vectorMode === 'search_rerank'
                    ? policy.vectorMode
                    : 'search_rerank',
            }
            : policy;
        const budgets = buildIntentBudgets(intent, sections, Math.max(200, Number(opts.maxTokens ?? 1200)), executionPolicy);
        const recallPlan: RecallPlan = planRecall({
            intent,
            sections,
            sectionBudgets: budgets,
            maxTokens: Math.max(200, Number(opts.maxTokens ?? 1200)),
            policy: executionPolicy,
            lorebookDecision,
            ...buildViewpointPolicyInput(recallContext, logicalView, groupMemory),
        });
        const cheapRecall = await collectCheapRecall({
            chatKey: this.chatKey,
            query: normalizedQuery,
            intent,
            plan: recallPlan,
            recentEvents,
            logicalView,
            groupMemory,
            policy: executionPolicy,
            lorebookDecision,
            lorebookEntries,
            factsManager: new FactsManager(this.chatKey),
            stateManager: new StateManager(this.chatKey),
            summariesManager: new SummariesManager(this.chatKey),
            chatStateManager: this.chatStateManager,
            lifecycleIndex: recallContext.lifecycleMap,
            activeActorKey: recallContext.activeActorKey,
            personaProfiles: recallContext.personaProfiles,
            personaProfile: recallContext.personaProfile,
            tuningProfile: recallContext.tuningProfile,
            relationships: recallContext.relationships,
            fallbackRelationshipWeight: recallContext.fallbackRelationshipWeight,
            preparedContext: recallContext,
        });
        const currentTurnTracker = await this.chatStateManager.getAssistantTurnTracker();
        const currentTurn = Math.max(0, Number(currentTurnTracker?.activeAssistantTurnCount ?? 0) || 0);
        const recallCache = await this.chatStateManager.getRecallCache();
        const recallCacheVersion = await this.chatStateManager.getRecallCacheVersion();
        const cheapTopicHash = buildRecallTopicHash(cheapRecall);
        const cacheActiveCards = recallCache?.selectedCardIds?.length
            ? await db.memory_cards.bulkGet(recallCache.selectedCardIds)
            : [];
        const cacheHit = Boolean(
            recallCache
            && recallCache.intent === intent
            && recallCache.baseVersion === recallCacheVersion
            && currentTurn <= recallCache.expiresTurn
            && normalizeStringList(recallCache.entityKeys).join('|') === normalizeStringList(cheapRecall.entityKeys).join('|')
            && String(recallCache.topicHash ?? '').trim() === String(cheapTopicHash ?? '').trim()
            && cacheActiveCards.length > 0
            && cacheActiveCards.every((card): boolean => Boolean(card && card.status === 'active' && String(card.chatKey ?? '').trim() === this.chatKey)),
        );
        const policyGate = shouldRunVectorRecall({
            query: normalizedQuery,
            intent,
            policy,
            structuredCount: cheapRecall.structuredCount,
            coveredLanes: cheapRecall.coveredLanes,
            recentEventCount: cheapRecall.recentEventCount,
            structuredEnough: cheapRecall.enough,
            recentEventsEnough: cheapRecall.recentEventCount > 0 && (cheapRecall.primaryNeed === 'historical_event' || cheapRecall.primaryNeed === 'causal_trace' || cheapRecall.primaryNeed === 'mixed'),
            cacheHit,
        });
        const resolvedPolicyGate: RecallGateDecision = {
            ...policyGate,
            lanes: resolveRecallGateLanes(cheapRecall, policyGate),
        };
        const executionVectorGate: RecallGateDecision = previewMode === 'forced_vector'
            ? {
                enabled: true,
                lanes: resolveRecallGateLanes(cheapRecall, {
                    enabled: true,
                    lanes: [],
                    reasonCodes: [],
                    primaryNeed: policyGate.primaryNeed,
                    vectorMode: executionPolicy.vectorMode,
                }),
                reasonCodes: Array.from(new Set([
                    'forced_vector_preview',
                    `recall_need:${policyGate.primaryNeed}`,
                ])),
                primaryNeed: policyGate.primaryNeed,
                vectorMode: executionPolicy.vectorMode,
            }
            : resolvedPolicyGate;
        const vectorManager = new VectorManager(this.chatKey);
        const rawHits = executionVectorGate.enabled
            ? await vectorManager.search(normalizedQuery, Math.max(Number(recallPlan.sourceLimits.vector ?? 5) * 2, Number(recallPlan.fineTopK ?? 8)), {
                lanes: executionVectorGate.lanes,
                activeOnly: true,
            })
            : [];
        const archives = await this.chatStateManager.getRetentionArchives();
        const archivedChunkSet = new Set((archives.archivedVectorChunkIds ?? []).map((item: string): string => normalizeText(item)).filter(Boolean));
        const activeHits = rawHits.filter((item: VectorHit): boolean => !archivedChunkSet.has(normalizeText(item.chunkId)));
        const rerankEnabled = executionPolicy.vectorMode === 'search_rerank' && executionPolicy.rerankEnabled !== false;
        const rerankedHits = await rerankVectorHits(normalizedQuery, activeHits, rerankEnabled, Math.max(2, Number(executionPolicy.rerankThreshold ?? 6)));
        const beforeRankMap = new Map<string, number>(activeHits.map((item: VectorHit, index: number): [string, number] => [normalizeText(item.chunkId), index + 1]));
        const afterRankMap = new Map<string, number>(rerankedHits.map((item: VectorHit, index: number): [string, number] => [normalizeText(item.chunkId), index + 1]));
        const candidates = executionVectorGate.enabled
            ? await collectRecallCandidates({
                chatKey: this.chatKey,
                plan: recallPlan,
                query: normalizedQuery,
                recentEvents,
                logicalView,
                groupMemory,
                policy: executionPolicy,
                lorebookDecision,
                lorebookEntries,
                factsManager: new FactsManager(this.chatKey),
                stateManager: new StateManager(this.chatKey),
                summariesManager: new SummariesManager(this.chatKey),
                chatStateManager: this.chatStateManager,
                lifecycleIndex: recallContext.lifecycleMap,
                activeActorKey: recallContext.activeActorKey,
                personaProfiles: recallContext.personaProfiles,
                personaProfile: recallContext.personaProfile,
                tuningProfile: recallContext.tuningProfile,
                relationships: recallContext.relationships,
                fallbackRelationshipWeight: recallContext.fallbackRelationshipWeight,
                vectorGate: executionVectorGate,
            })
            : [...cheapRecall.candidates];
        const ranked = rankRecallCandidates({
            candidates,
            plan: recallPlan,
            recentVisibleMessages: logicalView?.visibleMessages.map((item) => item.text) ?? [],
            worldStateText,
            lorebookConflictDetected: lorebookDecision.conflictDetected,
        });
        const finalized = cutRecallCandidatesByBudget({
            candidates: ranked,
            plan: recallPlan,
            estimateTokens,
        });
        const vectorCandidateMap = new Map<string, RecallCandidate>();
        ranked.filter((item: RecallCandidate): boolean => item.source === 'memory_card').forEach((item: RecallCandidate): void => {
            const chunkId = normalizeText(String(item.candidateId ?? '').replace(/^memory-card:/, ''));
            if (chunkId) {
                vectorCandidateMap.set(chunkId, item);
            }
        });
        const selectedVectorCandidates = finalized
            .filter((item: RecallCandidate): boolean => item.source === 'memory_card' && item.selected)
            .sort((left: RecallCandidate, right: RecallCandidate): number => Number(right.finalScore ?? 0) - Number(left.finalScore ?? 0));
        const finalRankMap = new Map<string, number>(selectedVectorCandidates.map((item: RecallCandidate, index: number): [string, number] => [normalizeText(String(item.candidateId ?? '').replace(/^memory-card:/, '')), index + 1]));
        const hits: MemoryRecallPreviewHit[] = rerankedHits.map((hit: VectorHit): MemoryRecallPreviewHit => {
            const chunkId = normalizeText(hit.chunkId);
            const item = itemMap.get(chunkId);
            const candidate = vectorCandidateMap.get(chunkId);
            return {
                chunkId,
                sourceRecordKey: item?.sourceRecordKey ?? null,
                sourceRecordKind: item?.sourceRecordKind ?? 'unknown',
                sourceLabel: item?.sourceLabel ?? formatSourceKindLabel(item?.sourceRecordKind ?? 'unknown'),
                preview: item?.preview ?? buildPreview(hit.content),
                vectorScore: Number(hit.score ?? 0),
                initialRank: beforeRankMap.get(chunkId) ?? null,
                rerankedRank: afterRankMap.get(chunkId) ?? null,
                finalRank: finalRankMap.get(chunkId) ?? null,
                matchedInRecall: Boolean(candidate),
                enteredContext: finalRankMap.has(chunkId),
                reasonCodes: candidate?.reasonCodes ?? [],
                cardId: item?.cardId ?? `memory-card:${chunkId}`,
                lane: item?.lane ?? inferMemoryLane(item?.sourceRecordKind ?? 'unknown', item?.memoryType ?? null, item?.memorySubtype ?? null, item?.sourceLabel ?? ''),
                subject: item?.subject ?? inferMemoryCardSubject(item ?? ({} as MemoryCardSummary)),
                title: item?.title ?? inferMemoryCardTitle(item ?? ({} as MemoryCardSummary)),
                ttl: item?.ttl ?? inferMemoryTtl(item?.lane ?? 'other'),
                status: item?.status ?? inferMemoryCardStatus(item?.statusKind ?? 'normal', Boolean(item?.sourceMissing)),
            };
        });
        return {
            query: normalizedQuery,
            testedAt: Date.now(),
            previewMode,
            rerankApplied: executionVectorGate.enabled && rerankEnabled && activeHits.length >= Math.max(2, Number(executionPolicy.rerankThreshold ?? 6)),
            hitCount: hits.length,
            selectedCount: selectedVectorCandidates.length,
            hits,
            policyGate: resolvedPolicyGate,
            vectorGate: executionVectorGate,
            effectivePolicy: {
                vectorEnabled: Boolean(policy.vectorEnabled),
                vectorMode: policy.vectorMode,
            },
            cache: {
                hit: cacheHit,
                reasonCodes: cacheHit ? ['recall_cache_hit'] : [],
                topicHash: cheapTopicHash,
                entityKeys: normalizeStringList(cheapRecall.entityKeys),
                expiresTurn: recallCache?.expiresTurn ?? 0,
            },
            cheapRecall: {
                primaryNeed: cheapRecall.primaryNeed,
                coveredLanes: cheapRecall.coveredLanes,
                structuredCount: cheapRecall.structuredCount,
                recentEventCount: cheapRecall.recentEventCount,
                enough: cheapRecall.enough,
            },
        };
    }

}
