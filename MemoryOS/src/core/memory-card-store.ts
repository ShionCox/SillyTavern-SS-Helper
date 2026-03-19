import { db, type DBFact, type DBMemoryCard, type DBSummary } from '../db/db';
import type { MemoryCard, MemoryCardDraft, MemoryCardLane, MemorySummaryEnvelope } from '../../../SDK/stx';
import { buildMemoryCardDraftsFromFact } from './memory-card-text';
import { buildMemorySummaryEnvelope } from './memory-summary-envelope';
import { VectorManager } from '../vector/vector-manager';

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

/**
 * 功能：判断记忆正文是否足够自然，适合进入长期记忆。
 * @param memoryText 记忆正文。
 * @returns 是否通过基本文本准入。
 */
function isNaturalMemoryText(memoryText: string): boolean {
    const normalized = normalizeText(memoryText);
    if (!normalized || normalized.length < 10) {
        return false;
    }
    if (/[{}[\]"]/.test(normalized)) {
        return false;
    }
    const separatorCount = (normalized.match(/[；;]\s*/g) || []).length;
    return separatorCount <= 4;
}

/**
 * 功能：根据草稿构建稳定卡片编号。
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
        confidence: normalizedDraft.confidence,
        ttl: normalizedDraft.ttl,
        replaceKey: normalizedDraft.lane === 'state'
            ? (normalizedDraft.replaceKey || `${normalizedDraft.subject}:${normalizedDraft.lane}`)
            : normalizedDraft.replaceKey,
        sourceRefs: normalizedDraft.sourceRefs,
        sourceRecordKey: normalizedDraft.sourceRecordKey,
        sourceRecordKind: normalizedDraft.sourceRecordKind as DBMemoryCard['sourceRecordKind'],
        ownerActorKey: normalizedDraft.ownerActorKey,
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
    return draft.confidence >= 0.72
        && draft.importance >= 0.6
        && isNaturalMemoryText(draft.memoryText);
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
            ? db.memory_cards.where('sourceRecordKey').equals(fallbackSourceRecordKey).toArray()
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
    const result = await persistMemoryCards(
        chatKey,
        normalizedEnvelope.memoryCards,
        summary.summaryId,
        'summary',
    );
    const vectorManager = new VectorManager(chatKey);
    if (result.supersededCardIds.length > 0) {
        await vectorManager.deleteMemoryCardEmbeddings(result.supersededCardIds);
    }
    if (result.activeCards.length > 0) {
        await vectorManager.upsertMemoryCardEmbeddings(result.activeCards);
    }
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
    const vectorManager = new VectorManager(chatKey);
    if (result.supersededCardIds.length > 0) {
        await vectorManager.deleteMemoryCardEmbeddings(result.supersededCardIds);
    }
    if (result.activeCards.length > 0) {
        await vectorManager.upsertMemoryCardEmbeddings(result.activeCards);
    }
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
    const vectorManager = new VectorManager(chatKey);
    if (result.supersededCardIds.length > 0) {
        await vectorManager.deleteMemoryCardEmbeddings(result.supersededCardIds);
    }
    if (result.activeCards.length > 0) {
        await vectorManager.upsertMemoryCardEmbeddings(result.activeCards);
    }
    return [...result.reusedCards, ...result.activeCards].map(toSdkCard);
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
    const cards = await db.memory_cards.where('sourceRecordKey').equals(normalizedRecordKey).toArray();
    const targetCards = cards.filter((card: DBMemoryCard): boolean => normalizeText(card.chatKey) === normalizeText(chatKey));
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
