import type {
    PromptAliasEntry,
    PromptAliasSnapshot,
    PromptReferenceKind,
} from '../types/prompt-alias';

const PROMPT_REF_PREFIX: Record<PromptReferenceKind, string> = {
    chat: 'C',
    dream: 'D',
    entry: 'E',
    relationship: 'R',
    node: 'N',
    summary: 'S',
};

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

export class PromptReferenceService {
    private readonly forwardMaps: Record<PromptReferenceKind, Map<string, string>> = {
        chat: new Map(),
        dream: new Map(),
        entry: new Map(),
        relationship: new Map(),
        node: new Map(),
        summary: new Map(),
    };

    private readonly reverseMaps: Record<PromptReferenceKind, Map<string, string>> = {
        chat: new Map(),
        dream: new Map(),
        entry: new Map(),
        relationship: new Map(),
        node: new Map(),
        summary: new Map(),
    };

    encode(kind: PromptReferenceKind, value: string): string {
        const normalizedValue = normalizeText(value);
        if (!normalizedValue) {
            throw new Error(`prompt_reference_encode_failed:${kind}:empty_value`);
        }
        const existing = this.forwardMaps[kind].get(normalizedValue);
        if (existing) {
            return existing;
        }
        const nextRef = `${PROMPT_REF_PREFIX[kind]}${this.forwardMaps[kind].size + 1}`;
        this.forwardMaps[kind].set(normalizedValue, nextRef);
        this.reverseMaps[kind].set(nextRef, normalizedValue);
        return nextRef;
    }

    decode(kind: PromptReferenceKind, ref: string): string {
        const normalizedRef = normalizeText(ref);
        const exact = this.reverseMaps[kind].get(normalizedRef);
        if (exact) {
            return exact;
        }
        if (this.forwardMaps[kind].has(normalizedRef)) {
            return normalizedRef;
        }
        throw new Error(`prompt_reference_decode_failed:${kind}:${normalizedRef || 'empty_ref'}`);
    }

    decodeMany(kind: PromptReferenceKind, refs: unknown): string[] {
        if (!Array.isArray(refs)) {
            return [];
        }
        return refs
            .map((ref: unknown): string => this.decode(kind, String(ref ?? '').trim()))
            .filter(Boolean);
    }

    snapshot(): PromptAliasSnapshot {
        return {
            chat: this.buildEntries('chat'),
            dream: this.buildEntries('dream'),
            entry: this.buildEntries('entry'),
            relationship: this.buildEntries('relationship'),
            node: this.buildEntries('node'),
            summary: this.buildEntries('summary'),
        };
    }

    private buildEntries(kind: PromptReferenceKind): PromptAliasEntry[] {
        return Array.from(this.forwardMaps[kind].entries()).map(([value, ref]: [string, string]): PromptAliasEntry => ({
            ref,
            value,
        }));
    }
}
