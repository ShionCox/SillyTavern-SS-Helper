import { db, type DBFact, type DBMemoryCard, type DBSummary } from '../db/db';
import type { MemoryCard, MemoryCardDraft, MemoryCardLane, MemorySummaryEnvelope } from '../../../SDK/stx';
import { buildMemoryCardDraftsFromFact } from './memory-card-text';
import { buildMemoryCardDraftsFromSemanticSeed } from './memory-card-semantic-seed';
import { buildMemorySummaryEnvelope } from './memory-summary-envelope';
import { VectorManager } from '../vector/vector-manager';
import type { ChatSemanticSeed } from '../types';

interface MemoryCardVectorBatchState {
    depth: number;
    deleteCardIds: Set<string>;
    upsertCards: Map<string, DBMemoryCard>;
    flushPromise: Promise<void> | null;
}

const MEMORY_CARD_VECTOR_BATCHES: Map<string, MemoryCardVectorBatchState> = new Map<string, MemoryCardVectorBatchState>();

/**
 * 功能：将任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 去除多余空白后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：构建稳定的哈希文本。
 * @param value 原始文本。
 * @returns 哈希结果。
 */
function hashText(value: string): string {
    let hash = 5381;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) + hash) ^ value.charCodeAt(index);
    }
    return `h${(hash >>> 0).toString(16)}`;
}

/**
 * 功能：将文本规整为去重比较键。
 * @param value 原始文本。
 * @returns 归一化比较键。
 */
function normalizeCompareText(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

const MEMORY_TYPE_VALUES: ReadonlyArray<NonNullable<MemoryCardDraft['memoryType']>> = [
    'identity',
    'event',
    'relationship',
    'world',
    'status',
    'dialogue',
    'other',
];

const MEMORY_SUBTYPE_VALUES: ReadonlyArray<NonNullable<MemoryCardDraft['memorySubtype']>> = [
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

/**
 * 功能：把输入值收敛为合法的记忆类型。
 * @param value 原始值。
 * @returns 合法记忆类型；无法识别时返回 null。
 */
function normalizeMemoryType(value: unknown): MemoryCardDraft['memoryType'] {
    const normalized = normalizeCompareText(value);
    return MEMORY_TYPE_VALUES.includes(normalized as NonNullable<MemoryCardDraft['memoryType']>)
        ? (normalized as NonNullable<MemoryCardDraft['memoryType']>)
        : null;
}

/**
 * 功能：把输入值收敛为合法的记忆子类型。
 * @param value 原始值。
 * @returns 合法记忆子类型；无法识别时返回 null。
 */
function normalizeMemorySubtype(value: unknown): MemoryCardDraft['memorySubtype'] {
    const normalized = normalizeCompareText(value);
    return MEMORY_SUBTYPE_VALUES.includes(normalized as NonNullable<MemoryCardDraft['memorySubtype']>)
        ? (normalized as NonNullable<MemoryCardDraft['memorySubtype']>)
        : null;
}

/**
 * 功能：把任意输入转换为去重文本数组。
 * @param value 原始输入。
 * @returns 去重后的文本数组。
 */
function normalizeTextList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
    }
    const text = normalizeText(value);
    return text ? [text] : [];
}

/**
 * 功能：从总结正文中提取关键引号原句。
 * @param content 总结正文。
 * @returns 引号文本数组。
 */
function extractQuotedTexts(content: string): string[] {
    const result: string[] = [];
    const normalized = normalizeText(content);
    if (!normalized) {
        return result;
    }
    const pattern = /[“"「『]([^”"」』]{4,220})[”"」』]/g;
    let matched: RegExpExecArray | null = pattern.exec(normalized);
    while (matched) {
        const quote = normalizeText(matched[1]);
        if (quote) {
            result.push(quote);
        }
        matched = pattern.exec(normalized);
    }
    return Array.from(new Set(result));
}

/**
 * 功能：基于总结文本生成对话原句记忆卡草稿。
 * @param summary 总结记录。
 * @param envelope 已有记忆封装。
 * @returns 对话原句草稿列表。
 */
function buildDialogueQuoteDraftsFromSummary(summary: DBSummary, envelope: MemorySummaryEnvelope): MemoryCardDraft[] {
    const content = normalizeText(summary.content);
    if (!content) {
        return [];
    }
    const ownerActorKey = normalizeText(summary.ownerActorKey);
    if (!ownerActorKey) {
        return [];
    }
    const sourceMessageIds = normalizeTextList([
        summary.range?.toMessageId,
        summary.range?.fromMessageId,
    ]);
    const sourceMessageId = sourceMessageIds[0] || normalizeText(summary.summaryId);
    const quotes = extractQuotedTexts(content);
    if (quotes.length <= 0) {
        return [];
    }
    const existingSignatures = new Set<string>();
    (Array.isArray(envelope.memoryCards) ? envelope.memoryCards : []).forEach((card: MemoryCardDraft): void => {
        const isDialogue = normalizeCompareText(card.memorySubtype) === 'dialogue_quote'
            || normalizeCompareText(card.memoryType) === 'dialogue'
            || normalizeTextList(card.keywords).some((item: string): boolean => normalizeCompareText(item) === 'dialogue_quote');
        if (!isDialogue) {
            return;
        }
        const signature = [
            normalizeCompareText(card.sourceMessageIds?.[0] || sourceMessageId),
            normalizeCompareText(card.speakerActorKey || card.speakerLabel),
            normalizeCompareText(card.memoryText),
        ].join('::');
        existingSignatures.add(signature);
    });
    const speakerPattern = /([^\s，。；：:]{1,20})(?:说|提到|表示|强调|提醒|回应|低声说|喊道)/g;
    const speakers = Array.from(content.matchAll(speakerPattern)).map((item: RegExpMatchArray): string => normalizeText(item[1])).filter(Boolean);
    const fallbackSpeaker = speakers[0] || '';
    const reasonPattern = /因为([^。！？!?]{4,80})/;
    const reasonMatched = content.match(reasonPattern);
    const reason = normalizeText(reasonMatched?.[1]) || '影响后续行动或关系判断';
    const drafts: MemoryCardDraft[] = [];
    quotes.forEach((quote: string, index: number): void => {
        const nearSpeaker = speakers[index] || fallbackSpeaker;
        const speakerLabel = nearSpeaker || '未知说话者';
        const signature = [
            normalizeCompareText(sourceMessageId),
            normalizeCompareText(nearSpeaker),
            normalizeCompareText(quote),
        ].join('::');
        if (existingSignatures.has(signature)) {
            return;
        }
        existingSignatures.add(signature);
        drafts.push({
            scope: 'character',
            lane: 'event',
            subject: ownerActorKey,
            title: quote.length > 18 ? `${quote.slice(0, 18)}…` : quote,
            memoryText: quote,
            evidenceText: `${speakerLabel}：${quote}`,
            entityKeys: [ownerActorKey, nearSpeaker].map((item: string): string => normalizeText(item)).filter(Boolean),
            keywords: ['dialogue_quote', '对话', '原句', ownerActorKey, speakerLabel].map((item: string): string => normalizeText(item)).filter(Boolean),
            importance: Math.max(0.68, Math.min(0.93, Number(summary.importance ?? summary.salience ?? summary.encodeScore ?? 0.78) || 0.78)),
            confidence: Math.max(0.74, Math.min(0.96, Number(summary.encodeScore ?? 0.82) || 0.82)),
            ttl: 'medium',
            replaceKey: `dialogue_quote:${sourceMessageId}:${normalizeCompareText(nearSpeaker)}:${hashText(quote)}`,
            sourceRefs: [summary.summaryId].filter(Boolean),
            sourceRecordKey: summary.summaryId,
            sourceRecordKind: 'summary',
            ownerActorKey,
            memoryType: 'dialogue',
            memorySubtype: 'dialogue_quote',
            sourceMessageIds,
            speakerActorKey: nearSpeaker || null,
            speakerLabel: speakerLabel || null,
            rememberedByActorKey: ownerActorKey,
            rememberReason: reason,
            participantActorKeys: [ownerActorKey, nearSpeaker].map((item: string): string => normalizeText(item)).filter(Boolean),
            validFrom: Number(summary.createdAt ?? 0) || Date.now(),
            validTo: undefined,
        });
    });
    return drafts;
}

/**
 * 功能：判断记忆正文是否足够自然，适合进入长期记忆。
 * @param memoryText 记忆正文。
 * @returns 是否通过基本文本准入。
 */
function isNaturalMemoryText(
    memoryText: string,
    lane: MemoryCardLane,
    memorySubtype: DBMemoryCard['memorySubtype'],
): boolean {
    const normalized = normalizeText(memoryText);
    if (!normalized) {
        return false;
    }
    if (/^\s*[\[{<].+[:=].+[\]}>]\s*$/.test(normalized)) {
        return false;
    }
    if (/^```/.test(normalized) || /^<(html|body|script)/i.test(normalized)) {
        return false;
    }
    if (memorySubtype === 'dialogue_quote') {
        return normalized.length >= 2;
    }
    if (lane === 'identity' || lane === 'rule' || lane === 'relationship') {
        return normalized.length >= 4;
    }
    if (lane === 'event') {
        return normalized.length >= 6;
    }
    if (lane === 'state') {
        return normalized.length >= 8;
    }
    return normalized.length >= 6;
    
}

/**
 * 功能：根据草稿构建稳定卡片编号。
 * @param chatKey 聊天键。
 * @param draft 记忆卡草稿。
 * @returns 稳定卡片编号。
 */
/**
 * 功能：判断对话原句类记忆是否满足“来源可靠”准入条件。
 * @param draft 数据库记忆卡草稿。
 * @returns 是否满足可靠来源条件。
 */
function isReliableDialogueQuoteDraft(draft: DBMemoryCard): boolean {
    const sourceRecordKind = normalizeCompareText(draft.sourceRecordKind);
    const hasTrustedRecord = sourceRecordKind === 'summary' || sourceRecordKind === 'fact';
    const hasMessageTrace = normalizeTextList(draft.sourceMessageIds).length > 0;
    const hasOwner = Boolean(normalizeText(draft.ownerActorKey));
    return (hasTrustedRecord && hasMessageTrace) || (hasMessageTrace && hasOwner);
}

/**
 * 功能：按 lane 读取记忆卡准入阈值。
 * @param lane 记忆卡 lane。
 * @returns 对应的置信度与重要性阈值。
 */
function readAdmissionThreshold(lane: MemoryCardLane): { confidence: number; importance: number } {
    if (lane === 'identity' || lane === 'rule') {
        return { confidence: 0.55, importance: 0.45 };
    }
    if (lane === 'relationship' || lane === 'event') {
        return { confidence: 0.6, importance: 0.5 };
    }
    if (lane === 'state') {
        return { confidence: 0.65, importance: 0.55 };
    }
    return { confidence: 0.6, importance: 0.5 };
}

/**
 * 功能：根据草稿生成稳定记忆卡 ID。
 * @param chatKey 聊天键。
 * @param draft 记忆卡草稿。
 * @returns 稳定卡片编号。
 */
function buildMemoryCardId(chatKey: string, draft: MemoryCardDraft): string {
    return `memory_card:${hashText([
        normalizeText(chatKey),
        normalizeText(draft.lane),
        normalizeText(draft.subject),
        normalizeText(draft.replaceKey),
        normalizeText(draft.memoryText),
    ].join('::'))}`;
}

/**
 * 功能：按层级推断默认生命周期。
 * @param lane 记忆卡层级。
 * @returns 默认生命周期。
 */
function inferLaneTtl(lane: MemoryCardLane): DBMemoryCard['ttl'] {
    if (lane === 'state') {
        return 'short';
    }
    if (lane === 'event' || lane === 'relationship') {
        return 'medium';
    }
    return 'long';
}

/**
 * 功能：将草稿规整为数据库记忆卡结构。
 * @param chatKey 聊天键。
 * @param draft 记忆卡草稿。
 * @param fallbackSourceRecordKey 默认来源键。
 * @param fallbackSourceRecordKind 默认来源类型。
 * @returns 规整后的数据库记忆卡。
 */
function normalizeDraft(
    chatKey: string,
    draft: MemoryCardDraft,
    fallbackSourceRecordKey: string | null,
    fallbackSourceRecordKind: DBMemoryCard['sourceRecordKind'],
): DBMemoryCard {
    const normalizedDraft: MemoryCardDraft = {
        ...draft,
        subject: normalizeText(draft.subject) || '未命名主体',
        title: normalizeText(draft.title) || normalizeText(draft.subject) || '记忆卡',
        memoryText: normalizeText(draft.memoryText),
        evidenceText: normalizeText(draft.evidenceText) || null,
        entityKeys: Array.from(new Set((draft.entityKeys ?? []).map((item: string): string => normalizeText(item)).filter(Boolean))),
        keywords: Array.from(new Set((draft.keywords ?? []).map((item: string): string => normalizeText(item)).filter(Boolean))),
        replaceKey: normalizeText(draft.replaceKey) || null,
        sourceRefs: Array.from(new Set((draft.sourceRefs ?? []).map((item: string): string => normalizeText(item)).filter(Boolean))),
        sourceRecordKey: normalizeText(draft.sourceRecordKey) || fallbackSourceRecordKey,
        sourceRecordKind: (normalizeText(draft.sourceRecordKind) as DBMemoryCard['sourceRecordKind']) || fallbackSourceRecordKind,
        ownerActorKey: normalizeText(draft.ownerActorKey) || null,
        memoryType: normalizeMemoryType(draft.memoryType),
        memorySubtype: normalizeMemorySubtype(draft.memorySubtype),
        sourceMessageIds: normalizeTextList(draft.sourceMessageIds),
        speakerActorKey: normalizeText(draft.speakerActorKey) || null,
        speakerLabel: normalizeText(draft.speakerLabel) || null,
        rememberedByActorKey: normalizeText(draft.rememberedByActorKey) || null,
        rememberReason: normalizeText(draft.rememberReason) || null,
        participantActorKeys: Array.from(new Set((draft.participantActorKeys ?? []).map((item: string): string => normalizeText(item)).filter(Boolean))),
        confidence: Math.max(0, Math.min(1, Number(draft.confidence ?? 0) || 0)),
        importance: Math.max(0, Math.min(1, Number(draft.importance ?? 0) || 0)),
        ttl: draft.ttl || inferLaneTtl(draft.lane),
    };
    const now = Date.now();
    return {
        cardId: buildMemoryCardId(chatKey, normalizedDraft),
        chatKey,
        scope: normalizedDraft.scope,
        lane: normalizedDraft.lane,
        subject: normalizedDraft.subject,
        title: normalizedDraft.title,
        memoryText: normalizedDraft.memoryText,
        evidenceText: normalizedDraft.evidenceText,
        entityKeys: normalizedDraft.entityKeys,
        keywords: normalizedDraft.keywords,
        importance: normalizedDraft.importance,
        confidence: normalizedDraft.confidence ?? 0,
        ttl: normalizedDraft.ttl,
        replaceKey: normalizedDraft.lane === 'state'
            ? (normalizedDraft.replaceKey || `${normalizedDraft.subject}:${normalizedDraft.lane}`)
            : normalizedDraft.replaceKey,
        sourceRefs: normalizedDraft.sourceRefs,
        sourceRecordKey: normalizedDraft.sourceRecordKey,
        sourceRecordKind: normalizedDraft.sourceRecordKind as DBMemoryCard['sourceRecordKind'],
        ownerActorKey: normalizedDraft.ownerActorKey,
        memoryType: normalizedDraft.memoryType || null,
        memorySubtype: normalizedDraft.memorySubtype || null,
        sourceMessageIds: normalizedDraft.sourceMessageIds ?? [],
        speakerActorKey: normalizedDraft.speakerActorKey || null,
        speakerLabel: normalizedDraft.speakerLabel || null,
        rememberedByActorKey: normalizedDraft.rememberedByActorKey || null,
        rememberReason: normalizedDraft.rememberReason || null,
        participantActorKeys: normalizedDraft.participantActorKeys,
        validFrom: normalizedDraft.validFrom,
        validTo: normalizedDraft.validTo,
        status: 'active',
        createdAt: now,
        updatedAt: now,
    };
}

/**
 * 功能：判断草稿卡是否通过准入规则。
 * @param draft 数据库草稿卡。
 * @returns 是否允许进入 active 记忆层。
 */
function passesAdmission(draft: DBMemoryCard): boolean {
    if (normalizeCompareText(draft.memorySubtype) === 'dialogue_quote') {
        return isReliableDialogueQuoteDraft(draft)
            && isNaturalMemoryText(draft.memoryText, draft.lane, draft.memorySubtype);
    }
    const threshold = readAdmissionThreshold(draft.lane);
    return draft.confidence >= threshold.confidence
        && draft.importance >= threshold.importance
        && isNaturalMemoryText(draft.memoryText, draft.lane, draft.memorySubtype);
}

/**
 * 功能：为记忆卡生成确定性去重键。
 * @param card 记忆卡。
 * @returns 去重键。
 */
function buildDeterministicKey(card: Pick<DBMemoryCard, 'chatKey' | 'lane' | 'subject' | 'replaceKey' | 'memoryText'>): string {
    return [
        normalizeCompareText(card.chatKey),
        normalizeCompareText(card.lane),
        normalizeCompareText(card.subject),
        normalizeCompareText(card.replaceKey),
        normalizeCompareText(card.memoryText),
    ].join('::');
}

/**
 * 功能：判断两张卡是否属于同源同层级等价内容。
 * @param left 左侧卡片。
 * @param right 右侧卡片。
 * @returns 是否可视为同一内容。
 */
function isEquivalentSourceCard(
    left: Pick<DBMemoryCard, 'sourceRecordKey' | 'lane' | 'memoryText'>,
    right: Pick<DBMemoryCard, 'sourceRecordKey' | 'lane' | 'memoryText'>,
): boolean {
    return normalizeCompareText(left.sourceRecordKey) === normalizeCompareText(right.sourceRecordKey)
        && normalizeCompareText(left.lane) === normalizeCompareText(right.lane)
        && normalizeCompareText(left.memoryText) === normalizeCompareText(right.memoryText);
}

/**
 * 功能：将数据库记忆卡转回 SDK 记忆卡结构。
 * @param card 数据库记忆卡。
 * @returns SDK 记忆卡。
 */
function toSdkCard(card: DBMemoryCard): MemoryCard {
    return {
        cardId: card.cardId,
        chatKey: card.chatKey,
        scope: card.scope,
        lane: card.lane,
        subject: card.subject,
        title: card.title,
        memoryText: card.memoryText,
        evidenceText: card.evidenceText ?? null,
        entityKeys: card.entityKeys,
        keywords: card.keywords,
        importance: card.importance,
        confidence: card.confidence,
        ttl: card.ttl,
        replaceKey: card.replaceKey ?? null,
        sourceRefs: card.sourceRefs,
        sourceRecordKey: card.sourceRecordKey,
        sourceRecordKind: card.sourceRecordKind,
        ownerActorKey: card.ownerActorKey ?? null,
        memoryType: normalizeMemoryType(card.memoryType),
        memorySubtype: normalizeMemorySubtype(card.memorySubtype),
        sourceMessageIds: normalizeTextList(card.sourceMessageIds),
        speakerActorKey: card.speakerActorKey ?? null,
        speakerLabel: card.speakerLabel ?? null,
        rememberedByActorKey: card.rememberedByActorKey ?? null,
        rememberReason: card.rememberReason ?? null,
        participantActorKeys: card.participantActorKeys,
        validFrom: card.validFrom,
        validTo: card.validTo,
        status: card.status,
        createdAt: card.createdAt,
        updatedAt: card.updatedAt,
    };
}

interface PersistMemoryCardsResult {
    activeCards: DBMemoryCard[];
    reusedCards: DBMemoryCard[];
    supersededCardIds: string[];
}

const SEMANTIC_SEED_SOURCE_RECORD_KEY = 'semantic_seed:active';
const SEMANTIC_SEED_SOURCE_RECORD_KIND = 'semantic_seed';

/**
 * 功能：在当前聊天下开启记忆卡向量批处理上下文，统一合并同一轮内的向量写入与删除。
 * @param chatKey 聊天键。
 * @param task 需要在批处理中执行的任务。
 * @returns 任务执行结果。
 */
export async function runWithMemoryCardVectorBatch<T>(chatKey: string, task: () => Promise<T>): Promise<T> {
    const batchState = getMemoryCardVectorBatchState(chatKey);
    batchState.depth += 1;
    try {
        return await task();
    } finally {
        batchState.depth = Math.max(0, batchState.depth - 1);
        if (batchState.depth === 0) {
            await flushMemoryCardVectorBatch(chatKey);
        }
    }
}

/**
 * 功能：获取当前聊天的记忆卡向量批处理状态，不存在时自动创建。
 * @param chatKey 聊天键。
 * @returns 批处理状态对象。
 */
function getMemoryCardVectorBatchState(chatKey: string): MemoryCardVectorBatchState {
    const normalizedChatKey = normalizeText(chatKey);
    const existing = MEMORY_CARD_VECTOR_BATCHES.get(normalizedChatKey);
    if (existing) {
        return existing;
    }
    const nextState: MemoryCardVectorBatchState = {
        depth: 0,
        deleteCardIds: new Set<string>(),
        upsertCards: new Map<string, DBMemoryCard>(),
        flushPromise: null,
    };
    MEMORY_CARD_VECTOR_BATCHES.set(normalizedChatKey, nextState);
    return nextState;
}

/**
 * 功能：登记本轮记忆卡向量同步变更，支持删除与新增合并。
 * @param chatKey 聊天键。
 * @param deletedCardIds 需要删除向量的卡片编号列表。
 * @param activeCards 需要写入向量的活动卡片列表。
 * @returns 无返回值。
 */
function queueMemoryCardVectorSync(chatKey: string, deletedCardIds: string[], activeCards: DBMemoryCard[]): void {
    const batchState = getMemoryCardVectorBatchState(chatKey);
    deletedCardIds
        .map((item: string): string => normalizeText(item))
        .filter(Boolean)
        .forEach((cardId: string): void => {
            if (!batchState.upsertCards.has(cardId)) {
                batchState.deleteCardIds.add(cardId);
            }
        });
    activeCards.forEach((card: DBMemoryCard): void => {
        const cardId = normalizeText(card.cardId);
        if (!cardId) {
            return;
        }
        batchState.deleteCardIds.delete(cardId);
        batchState.upsertCards.set(cardId, card);
    });
}

/**
 * 功能：在未处于批处理上下文时立刻落盘当前队列；若仍在批处理中则延后到上下文结束。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function flushMemoryCardVectorBatchIfReady(chatKey: string): Promise<void> {
    const batchState = MEMORY_CARD_VECTOR_BATCHES.get(normalizeText(chatKey));
    if (!batchState) {
        return;
    }
    if (batchState.depth > 0) {
        return;
    }
    await flushMemoryCardVectorBatch(chatKey);
}

/**
 * 功能：把当前聊天批处理中累计的记忆卡向量变更一次性落盘。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
async function flushMemoryCardVectorBatch(chatKey: string): Promise<void> {
    const normalizedChatKey = normalizeText(chatKey);
    const batchState = MEMORY_CARD_VECTOR_BATCHES.get(normalizedChatKey);
    if (!batchState) {
        return;
    }
    if (batchState.flushPromise) {
        await batchState.flushPromise;
        return;
    }

    const deletedCardIds = Array.from(batchState.deleteCardIds.values());
    const activeCards = Array.from(batchState.upsertCards.values());
    if (deletedCardIds.length <= 0 && activeCards.length <= 0) {
        if (batchState.depth <= 0) {
            MEMORY_CARD_VECTOR_BATCHES.delete(normalizedChatKey);
        }
        return;
    }

    batchState.deleteCardIds.clear();
    batchState.upsertCards.clear();
    batchState.flushPromise = (async (): Promise<void> => {
        const vectorManager = new VectorManager(normalizedChatKey);
        if (deletedCardIds.length > 0) {
            await vectorManager.deleteMemoryCardEmbeddings(deletedCardIds);
        }
        if (activeCards.length > 0) {
            await vectorManager.upsertMemoryCardEmbeddings(activeCards);
        }
    })().finally((): void => {
        batchState.flushPromise = null;
        if (batchState.depth <= 0 && batchState.deleteCardIds.size <= 0 && batchState.upsertCards.size <= 0) {
            MEMORY_CARD_VECTOR_BATCHES.delete(normalizedChatKey);
        }
    });

    await batchState.flushPromise;
}

/**
 * 功能：执行记忆卡主线存储。
 * @param chatKey 聊天键。
 * @param drafts 草稿卡列表。
 * @param fallbackSourceRecordKey 默认来源键。
 * @param fallbackSourceRecordKind 默认来源类型。
 * @returns 持久化结果。
 */
async function persistMemoryCards(
    chatKey: string,
    drafts: MemoryCardDraft[],
    fallbackSourceRecordKey: string | null,
    fallbackSourceRecordKind: DBMemoryCard['sourceRecordKind'],
): Promise<PersistMemoryCardsResult> {
    const normalizedDrafts = drafts
        .map((draft: MemoryCardDraft): DBMemoryCard => normalizeDraft(chatKey, draft, fallbackSourceRecordKey, fallbackSourceRecordKind))
        .filter((draft: DBMemoryCard): boolean => passesAdmission(draft));
    if (normalizedDrafts.length <= 0) {
        return {
            activeCards: [],
            reusedCards: [],
            supersededCardIds: [],
        };
    }

    const [existingActiveCards, existingSourceCards] = await Promise.all([
        db.memory_cards.where('[chatKey+status]').equals([chatKey, 'active']).toArray(),
        fallbackSourceRecordKey
            ? db.memory_cards.where('[chatKey+sourceRecordKey]').equals([chatKey, fallbackSourceRecordKey]).toArray()
            : Promise.resolve([] as DBMemoryCard[]),
    ]);
    const existingByDeterministicKey = new Map<string, DBMemoryCard>();
    existingActiveCards.forEach((card: DBMemoryCard): void => {
        existingByDeterministicKey.set(buildDeterministicKey(card), card);
    });

    const acceptedCards: DBMemoryCard[] = [];
    const reusedCards: DBMemoryCard[] = [];
    const seenDraftKeys = new Set<string>();
    normalizedDrafts.forEach((draft: DBMemoryCard): void => {
        const deterministicKey = buildDeterministicKey(draft);
        if (seenDraftKeys.has(deterministicKey)) {
            return;
        }
        seenDraftKeys.add(deterministicKey);
        const duplicate = existingByDeterministicKey.get(deterministicKey);
        if (duplicate) {
            reusedCards.push(duplicate);
            return;
        }
        if (existingSourceCards.some((card: DBMemoryCard): boolean => isEquivalentSourceCard(card, draft) && card.status === 'active')) {
            const reused = existingSourceCards.find((card: DBMemoryCard): boolean => isEquivalentSourceCard(card, draft) && card.status === 'active');
            if (reused) {
                reusedCards.push(reused);
                return;
            }
        }
        acceptedCards.push(draft);
    });

    const supersededCards: DBMemoryCard[] = [];
    acceptedCards.forEach((draft: DBMemoryCard): void => {
        existingActiveCards.forEach((existing: DBMemoryCard): void => {
            if (existing.cardId === draft.cardId) {
                return;
            }
            if (draft.lane === 'event') {
                return;
            }
            if (draft.lane === 'state') {
                const sameReplaceKey = normalizeCompareText(existing.replaceKey) === normalizeCompareText(draft.replaceKey);
                const sameSubject = normalizeCompareText(existing.subject) === normalizeCompareText(draft.subject);
                if (existing.lane === 'state' && (sameReplaceKey || (!draft.replaceKey && sameSubject))) {
                    supersededCards.push(existing);
                }
                return;
            }
            const sameLane = normalizeCompareText(existing.lane) === normalizeCompareText(draft.lane);
            const sameSource = normalizeCompareText(existing.sourceRecordKey) === normalizeCompareText(draft.sourceRecordKey);
            const sameSubject = normalizeCompareText(existing.subject) === normalizeCompareText(draft.subject);
            if (sameLane && (sameSource || sameSubject)) {
                supersededCards.push(existing);
            }
        });
    });

    const uniqueSupersededCards = Array.from(new Map<string, DBMemoryCard>(supersededCards.map((card: DBMemoryCard): [string, DBMemoryCard] => [card.cardId, card])).values());
    if (uniqueSupersededCards.length > 0) {
        const now = Date.now();
        await db.memory_cards.bulkPut(uniqueSupersededCards.map((card: DBMemoryCard): DBMemoryCard => ({
            ...card,
            status: 'superseded',
            updatedAt: now,
        })));
    }

    if (acceptedCards.length > 0) {
        await db.memory_cards.bulkPut(acceptedCards);
    }

    return {
        activeCards: acceptedCards,
        reusedCards,
        supersededCardIds: uniqueSupersededCards.map((card: DBMemoryCard): string => card.cardId),
    };
}

/**
 * 功能：清理当前会话中不再存在的语义种子记忆卡。
 * @param chatKey 聊天键。
 * @param activeCardIds 本轮应保留的卡片编号集合。
 * @returns 实际删除的卡片编号列表。
 */
async function deleteStaleSemanticSeedCards(chatKey: string, activeCardIds: Set<string>): Promise<string[]> {
    const cards = await db.memory_cards
        .where('[chatKey+status]')
        .equals([chatKey, 'active'])
        .toArray();
    const staleCardIds = cards
        .filter((card: DBMemoryCard): boolean => {
            return normalizeText(card.sourceRecordKind) === SEMANTIC_SEED_SOURCE_RECORD_KIND
                && normalizeText(card.sourceRecordKey) === SEMANTIC_SEED_SOURCE_RECORD_KEY
                && !activeCardIds.has(normalizeText(card.cardId));
        })
        .map((card: DBMemoryCard): string => normalizeText(card.cardId))
        .filter(Boolean);
    if (staleCardIds.length <= 0) {
        return [];
    }
    await Promise.all([
        db.memory_cards.bulkDelete(staleCardIds),
        db.memory_card_embeddings.where('cardId').anyOf(staleCardIds).delete(),
    ]);
    return staleCardIds;
}

/**
 * 功能：保存摘要封装产生的记忆卡。
 * @param chatKey 聊天键。
 * @param summary 摘要记录。
 * @param envelope 摘要封装。
 * @returns 保存后的记忆卡列表。
 */
export async function saveMemoryCardsFromSummaryEnvelope(
    chatKey: string,
    summary: DBSummary,
    envelope?: MemorySummaryEnvelope | null,
): Promise<MemoryCard[]> {
    const normalizedEnvelope = envelope ?? buildMemorySummaryEnvelope(summary);
    const dialogueDrafts = buildDialogueQuoteDraftsFromSummary(summary, normalizedEnvelope);
    const mergedEnvelope: MemorySummaryEnvelope = {
        ...normalizedEnvelope,
        memoryCards: [...(normalizedEnvelope.memoryCards ?? []), ...dialogueDrafts],
    };
    const result = await persistMemoryCards(
        chatKey,
        mergedEnvelope.memoryCards,
        summary.summaryId,
        'summary',
    );
    queueMemoryCardVectorSync(chatKey, result.supersededCardIds, result.activeCards);
    await flushMemoryCardVectorBatchIfReady(chatKey);
    return [...result.reusedCards, ...result.activeCards].map(toSdkCard);
}

/**
 * 功能：把任意摘要封装直接写入记忆卡主线。
 * @param chatKey 聊天键。
 * @param sourceRecordKey 来源记录键。
 * @param sourceRecordKind 来源记录类型。
 * @param envelope 摘要封装。
 * @returns 保存后的记忆卡列表。
 */
export async function saveMemoryCardsFromEnvelope(
    chatKey: string,
    sourceRecordKey: string,
    sourceRecordKind: DBMemoryCard['sourceRecordKind'],
    envelope: MemorySummaryEnvelope,
): Promise<MemoryCard[]> {
    const syntheticSummary: DBSummary = {
        summaryId: sourceRecordKey,
        chatKey,
        level: 'scene',
        title: normalizeText(envelope.summary).slice(0, 24) || '记忆摘要',
        content: envelope.summary,
        createdAt: Date.now(),
    };
    const normalizedEnvelope = buildMemorySummaryEnvelope(syntheticSummary, envelope.memoryCards);
    const result = await persistMemoryCards(
        chatKey,
        normalizedEnvelope.memoryCards,
        sourceRecordKey,
        sourceRecordKind,
    );
    queueMemoryCardVectorSync(chatKey, result.supersededCardIds, result.activeCards);
    await flushMemoryCardVectorBatchIfReady(chatKey);
    return [...result.reusedCards, ...result.activeCards].map(toSdkCard);
}

/**
 * 功能：从事实记录直接生成并保存记忆卡。
 * @param chatKey 聊天键。
 * @param fact 事实记录。
 * @returns 保存后的记忆卡列表。
 */
export async function saveMemoryCardsFromFactRecord(chatKey: string, fact: DBFact): Promise<MemoryCard[]> {
    const drafts = buildMemoryCardDraftsFromFact(fact);
    const result = await persistMemoryCards(chatKey, drafts, fact.factKey, 'fact');
    queueMemoryCardVectorSync(chatKey, result.supersededCardIds, result.activeCards);
    await flushMemoryCardVectorBatchIfReady(chatKey);
    return [...result.reusedCards, ...result.activeCards].map(toSdkCard);
}

/**
 * 功能：从语义种子生成并保存冷启动记忆卡。
 * @param chatKey 聊天键。
 * @param seed 语义种子。
 * @param fingerprint 种子指纹。
 * @param reason 触发原因。
 * @returns 保存后的记忆卡列表。
 */
export async function saveMemoryCardsFromSemanticSeed(
    chatKey: string,
    seed: ChatSemanticSeed,
    fingerprint: string,
    reason: string,
): Promise<MemoryCard[]> {
    const drafts = buildMemoryCardDraftsFromSemanticSeed(seed, {
        fingerprint,
        reason,
    });
    const result = await persistMemoryCards(
        chatKey,
        drafts,
        SEMANTIC_SEED_SOURCE_RECORD_KEY,
        SEMANTIC_SEED_SOURCE_RECORD_KIND,
    );
    const keptCards = [...result.reusedCards, ...result.activeCards];
    const keptCardIds = new Set<string>(keptCards.map((item: DBMemoryCard): string => normalizeText(item.cardId)).filter(Boolean));
    const staleCardIds = await deleteStaleSemanticSeedCards(chatKey, keptCardIds);
    const deletedEmbeddingIds = Array.from(new Set([...result.supersededCardIds, ...staleCardIds]));
    queueMemoryCardVectorSync(chatKey, deletedEmbeddingIds, result.activeCards);
    await flushMemoryCardVectorBatchIfReady(chatKey);
    return keptCards.map(toSdkCard);
}

/**
 * 功能：按来源记录重建记忆卡。
 * @param chatKey 聊天键。
 * @param recordKey 来源记录键。
 * @param recordKind 来源记录类型。
 * @returns 重建后激活的卡片编号列表。
 */
export async function rebuildMemoryCardsFromSource(
    chatKey: string,
    recordKey: string,
    recordKind: 'fact' | 'summary',
): Promise<string[]> {
    const normalizedRecordKey = normalizeText(recordKey);
    if (!normalizedRecordKey) {
        return [];
    }
    if (recordKind === 'fact') {
        const fact = await db.facts.get(normalizedRecordKey);
        if (!fact || normalizeText(fact.chatKey) !== normalizeText(chatKey)) {
            return [];
        }
        const cards = await saveMemoryCardsFromFactRecord(chatKey, fact);
        return cards.map((card: MemoryCard): string => card.cardId);
    }
    const summary = await db.summaries.get(normalizedRecordKey);
    if (!summary || normalizeText(summary.chatKey) !== normalizeText(chatKey)) {
        return [];
    }
    const cards = await saveMemoryCardsFromSummaryEnvelope(chatKey, summary);
    return cards.map((card: MemoryCard): string => card.cardId);
}

/**
 * 功能：按来源记录删除关联记忆卡。
 * @param chatKey 聊天键。
 * @param recordKey 来源记录键。
 * @returns 实际删除的卡片编号列表。
 */
export async function deleteMemoryCardsBySource(chatKey: string, recordKey: string): Promise<string[]> {
    const normalizedRecordKey = normalizeText(recordKey);
    if (!normalizedRecordKey) {
        return [];
    }
    const targetCards = await db.memory_cards
        .where('[chatKey+sourceRecordKey]')
        .equals([chatKey, normalizedRecordKey])
        .toArray();
    if (targetCards.length <= 0) {
        return [];
    }
    const cardIds = targetCards.map((card: DBMemoryCard): string => card.cardId);
    await Promise.all([
        db.memory_cards.bulkDelete(cardIds),
        db.memory_card_embeddings.where('cardId').anyOf(cardIds).delete(),
    ]);
    const vectorManager = new VectorManager(chatKey);
    await vectorManager.deleteMemoryCardEmbeddings(cardIds);
    return cardIds;
}
