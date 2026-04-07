/**
 * 功能：向量文档构建器。
 * 说明：将 MemoryOS 主表业务对象转换成可向量化的统一文档结构。
 */

import type { VectorDocument, VectorDocSourceKind } from '../types/vector-document';
import type {
    MemoryEntry,
    ActorMemoryProfile,
    MemoryRelationshipRecord,
    SummarySnapshot,
} from '../types';

// ─── 辅助 ──────────────────────────────

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function buildVectorDocId(sourceKind: VectorDocSourceKind, sourceId: string): string {
    return `vdoc:${sourceKind}:${sourceId}`;
}

function extractActorKeys(entry: MemoryEntry): string[] {
    const keys: string[] = [];
    const payload = entry.detailPayload ?? {};
    if (typeof payload.actorKey === 'string' && payload.actorKey) {
        keys.push(payload.actorKey);
    }
    if (Array.isArray(payload.actorKeys)) {
        for (const k of payload.actorKeys) {
            if (typeof k === 'string' && k) {
                keys.push(k);
            }
        }
    }
    if (Array.isArray(payload.participantActorKeys)) {
        for (const k of payload.participantActorKeys) {
            if (typeof k === 'string' && k) {
                keys.push(k);
            }
        }
    }
    return Array.from(new Set(keys));
}

function extractRelationKeys(entry: MemoryEntry): string[] {
    const keys: string[] = [];
    const payload = entry.detailPayload ?? {};
    if (Array.isArray(payload.relationKeys)) {
        for (const k of payload.relationKeys) {
            if (typeof k === 'string' && k) {
                keys.push(k);
            }
        }
    }
    return Array.from(new Set(keys));
}

function extractWorldKeys(entry: MemoryEntry): string[] {
    const keys: string[] = [];
    const payload = entry.detailPayload ?? {};
    if (Array.isArray(payload.worldKeys)) {
        for (const k of payload.worldKeys) {
            if (typeof k === 'string' && k) {
                keys.push(k);
            }
        }
    }
    return Array.from(new Set(keys));
}

function extractLocationKey(entry: MemoryEntry): string | undefined {
    const payload = entry.detailPayload ?? {};
    if (typeof payload.locationKey === 'string' && payload.locationKey) {
        return payload.locationKey;
    }
    return undefined;
}

function extractCompareKey(entry: MemoryEntry): string | undefined {
    const payload = entry.detailPayload ?? {};
    if (typeof payload.compareKey === 'string' && payload.compareKey) {
        return payload.compareKey;
    }
    return undefined;
}

// ─── 文档构建 ──────────────────────────────

/**
 * 功能：从 MemoryEntry 构建 entry_document。
 * @param entry 记忆条目。
 * @returns 向量文档。
 */
export function buildEntryDocument(entry: MemoryEntry): VectorDocument {
    const textParts: string[] = [];
    if (entry.title) {
        textParts.push(entry.title);
    }
    if (entry.summary) {
        textParts.push(entry.summary);
    }
    if (entry.detail) {
        textParts.push(entry.detail);
    }
    const tags = (entry.tags ?? []).filter(Boolean);
    if (tags.length > 0) {
        textParts.push(`标签：${tags.join('、')}`);
    }

    return {
        vectorDocId: buildVectorDocId('entry', entry.entryId),
        sourceKind: 'entry',
        sourceId: entry.entryId,
        chatKey: entry.chatKey,
        schemaId: entry.entryType,
        title: normalizeText(entry.title),
        text: textParts.join('\n'),
        compareKey: extractCompareKey(entry),
        actorKeys: extractActorKeys(entry),
        relationKeys: extractRelationKeys(entry),
        worldKeys: extractWorldKeys(entry),
        locationKey: extractLocationKey(entry),
        updatedAt: entry.updatedAt || Date.now(),
    };
}

/**
 * 功能：从 MemoryRelationshipRecord 构建 relationship_document。
 * @param rel 关系记录。
 * @returns 向量文档。
 */
export function buildRelationshipDocument(rel: MemoryRelationshipRecord): VectorDocument {
    const textParts: string[] = [];
    textParts.push(`${rel.sourceActorKey} → ${rel.targetActorKey}`);
    if (rel.relationTag) {
        textParts.push(`关系：${rel.relationTag}`);
    }
    if (rel.state) {
        textParts.push(`状态：${rel.state}`);
    }
    if (rel.summary) {
        textParts.push(rel.summary);
    }
    textParts.push(`信任：${rel.trust}，好感：${rel.affection}，紧张：${rel.tension}`);

    return {
        vectorDocId: buildVectorDocId('relationship', rel.relationshipId),
        sourceKind: 'relationship',
        sourceId: rel.relationshipId,
        chatKey: rel.chatKey,
        schemaId: 'relationship',
        title: `${rel.sourceActorKey} → ${rel.targetActorKey} (${rel.relationTag})`,
        text: textParts.join('\n'),
        actorKeys: Array.from(new Set([rel.sourceActorKey, rel.targetActorKey, ...rel.participants].filter(Boolean))),
        relationKeys: [rel.relationTag].filter(Boolean),
        worldKeys: [],
        updatedAt: rel.updatedAt || Date.now(),
    };
}

/**
 * 功能：从 ActorMemoryProfile 构建 actor_document。
 * @param actor 角色画像。
 * @returns 向量文档。
 */
export function buildActorDocument(actor: ActorMemoryProfile): VectorDocument {
    const textParts: string[] = [];
    textParts.push(`角色：${actor.displayName}`);
    textParts.push(`角色键：${actor.actorKey}`);
    textParts.push(`记忆度：${actor.memoryStat}`);

    return {
        vectorDocId: buildVectorDocId('actor', actor.actorKey),
        sourceKind: 'actor',
        sourceId: actor.actorKey,
        chatKey: actor.chatKey,
        schemaId: 'actor_profile',
        title: actor.displayName || actor.actorKey,
        text: textParts.join('\n'),
        actorKeys: [actor.actorKey],
        relationKeys: [],
        worldKeys: [],
        updatedAt: actor.updatedAt || Date.now(),
    };
}

/**
 * 功能：从 SummarySnapshot 构建 summary_document。
 * @param snapshot 总结快照。
 * @returns 向量文档。
 */
export function buildSummaryDocument(snapshot: SummarySnapshot): VectorDocument {
    const textParts: string[] = [];
    if (snapshot.title) {
        textParts.push(snapshot.title);
    }
    if (snapshot.content) {
        textParts.push(snapshot.content);
    }
    const ns = snapshot.normalizedSummary;
    if (ns) {
        if (ns.stableContext) {
            textParts.push(ns.stableContext);
        }
        if (ns.taskState?.length > 0) {
            textParts.push(`任务：${ns.taskState.join('；')}`);
        }
        if (ns.relationState?.length > 0) {
            textParts.push(`关系：${ns.relationState.join('；')}`);
        }
    }

    return {
        vectorDocId: buildVectorDocId('summary', snapshot.summaryId),
        sourceKind: 'summary',
        sourceId: snapshot.summaryId,
        chatKey: snapshot.chatKey,
        schemaId: 'summary_snapshot',
        title: normalizeText(snapshot.title),
        text: textParts.join('\n'),
        actorKeys: Array.from(new Set(snapshot.actorKeys ?? [])),
        relationKeys: [],
        worldKeys: [],
        updatedAt: snapshot.updatedAt || Date.now(),
    };
}

/**
 * 功能：向量文档构建器类。
 */
export class VectorDocumentBuilder {
    /**
     * 功能：从 Entry 构建。
     */
    fromEntry(entry: MemoryEntry): VectorDocument {
        return buildEntryDocument(entry);
    }

    /**
     * 功能：从 Relationship 构建。
     */
    fromRelationship(rel: MemoryRelationshipRecord): VectorDocument {
        return buildRelationshipDocument(rel);
    }

    /**
     * 功能：从 ActorProfile 构建。
     */
    fromActor(actor: ActorMemoryProfile): VectorDocument {
        return buildActorDocument(actor);
    }

    /**
     * 功能：从 SummarySnapshot 构建。
     */
    fromSummary(snapshot: SummarySnapshot): VectorDocument {
        return buildSummaryDocument(snapshot);
    }

    /**
     * 功能：批量从 Entry 列表构建。
     */
    fromEntries(entries: MemoryEntry[]): VectorDocument[] {
        return entries.map(buildEntryDocument);
    }

    /**
     * 功能：批量从 Relationship 列表构建。
     */
    fromRelationships(rels: MemoryRelationshipRecord[]): VectorDocument[] {
        return rels.map(buildRelationshipDocument);
    }
}
