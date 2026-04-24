/**
 * 功能：向量文档构建器。
 * 说明：将 MemoryOS 主表业务对象转换成可向量化的统一文档结构。
 */

import type { VectorDocument } from '../types/vector-document';
import type { MemoryEntry } from '../types';
import { filterMemoryMessages, getMemoryFilterSettings } from '../memory-filter';

// ─── 辅助 ──────────────────────────────

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function buildEntryVectorDocId(sourceId: string): string {
    return `vdoc:entry:${sourceId}`;
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

    const rawText = textParts.join('\n');
    const filtered = filterMemoryMessages([{ role: 'assistant', content: rawText, floor: 1 }], getMemoryFilterSettings(), { scope: 'vectorIndex' });
    const filteredText = filtered.messagesForMemory.map((message) => String(message.content ?? '').trim()).filter(Boolean).join('\n\n');
    const vectorText = filtered.enabled ? filteredText : rawText;

    return {
        vectorDocId: buildEntryVectorDocId(entry.entryId),
        sourceKind: 'entry',
        sourceId: entry.entryId,
        chatKey: entry.chatKey,
        schemaId: entry.entryType,
        title: normalizeText(entry.title),
        text: vectorText,
        compareKey: extractCompareKey(entry),
        actorKeys: extractActorKeys(entry),
        relationKeys: extractRelationKeys(entry),
        worldKeys: extractWorldKeys(entry),
        locationKey: extractLocationKey(entry),
        updatedAt: entry.updatedAt || Date.now(),
    };
}
