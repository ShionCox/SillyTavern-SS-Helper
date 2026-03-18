import type { WorldStateNodeValue } from '../types';
import { buildWorldStateNodeFromRaw, normalizeWorldStateText } from './world-state-node';

function shouldNormalizeWorldStatePath(path: string): boolean {
    return /^\/semantic\/(catalog|rules|constraints|world|characters)\//i.test(normalizeWorldStateText(path));
}

export function normalizeWorldStatePatchValue(path: string, value: unknown): unknown {
    const normalizedPath = normalizeWorldStateText(path);
    if (!shouldNormalizeWorldStatePath(normalizedPath) || value == null || Array.isArray(value)) {
        return value;
    }

    const rawRecord = typeof value === 'object'
        ? { ...(value as Record<string, unknown>) }
        : { summary: normalizeWorldStateText(value) };
    const summary = normalizeWorldStateText(rawRecord.summary ?? rawRecord.value ?? value);
    const pathTail = normalizedPath.split('/').map((item: string): string => normalizeWorldStateText(item)).filter(Boolean).slice(-1)[0] || 'state';
    rawRecord.title = normalizeWorldStateText(rawRecord.title) || (summary.length > 28 ? `${summary.slice(0, 28)}…` : summary) || pathTail;
    const normalizedNode = buildWorldStateNodeFromRaw(normalizedPath, rawRecord, typeof rawRecord.updatedAt === 'number' ? rawRecord.updatedAt : Date.now());
    const tags = Array.from(new Set([...(normalizedNode.tags ?? []), normalizedNode.scopeType, normalizedNode.stateType, 'proposal_patch'])).slice(0, 12);
    const sourceRefs = Array.from(new Set([...(normalizedNode.sourceRefs ?? []), 'proposal_patch'])).slice(0, 8);
    const normalizedValue: WorldStateNodeValue = {
        ...normalizedNode,
        tags,
        sourceRefs,
        confidence: typeof rawRecord.confidence === 'number' ? rawRecord.confidence : (normalizedNode.confidence ?? 0.7),
    };

    if (!normalizedValue.summary) {
        normalizedValue.summary = normalizedValue.title || 'state';
    }
    if (!normalizedValue.title) {
        normalizedValue.title = normalizedValue.summary.length > 28 ? `${normalizedValue.summary.slice(0, 28)}…` : normalizedValue.summary;
    }

    return normalizedValue;
}