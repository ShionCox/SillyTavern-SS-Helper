import { describe, expect, it } from 'vitest';
import { formatVectorIndexVersionLabel } from '../src/ui/recallUiSummary';
import { readVectorSourceMetadata, type StrictVectorSourceMetadata } from '../src/recall/sources/vector-source';

function buildVectorHit(metadata: Record<string, unknown> = {}) {
    return {
        chunkId: 'chunk-1',
        content: 'vector payload',
        score: 0.91,
        metadata,
    };
}

describe('strict vector metadata', (): void => {
    it('只接受 fact 和 summary 且必须带 sourceRecordKey', (): void => {
        expect(readVectorSourceMetadata(buildVectorHit({
            sourceRecordKind: 'event',
            sourceRecordKey: 'e-1',
        }))).toBeNull();
        expect(readVectorSourceMetadata(buildVectorHit({
            sourceRecordKind: 'fact',
        }))).toBeNull();
    });

    it('会保留有效的 fact / summary metadata', (): void => {
        const factMeta = readVectorSourceMetadata(buildVectorHit({
            sourceRecordKind: 'fact',
            sourceRecordKey: 'fact-1',
            ownerActorKey: 'actor_a',
            sourceScope: 'self',
            memoryType: 'identity',
            memorySubtype: 'trait',
            participantActorKeys: ['actor_a', 'actor_b'],
        }));
        const summaryMeta = readVectorSourceMetadata(buildVectorHit({
            sourceRecordKind: 'summary',
            sourceRecordKey: 'summary-1',
        }));

        const expectedFactMeta: StrictVectorSourceMetadata = {
            sourceRecordKind: 'fact',
            sourceRecordKey: 'fact-1',
            ownerActorKey: 'actor_a',
            sourceScope: 'self',
            memoryType: 'identity',
            memorySubtype: 'trait',
            participantActorKeys: ['actor_a', 'actor_b'],
        };
        const expectedSummaryMeta: StrictVectorSourceMetadata = {
            sourceRecordKind: 'summary',
            sourceRecordKey: 'summary-1',
            ownerActorKey: null,
            sourceScope: undefined,
            memoryType: undefined,
            memorySubtype: undefined,
            participantActorKeys: [],
        };

        expect(factMeta).toEqual(expectedFactMeta);
        expect(summaryMeta).toEqual(expectedSummaryMeta);
    });

    it('会把严格索引版本显示成新文案', (): void => {
        expect(formatVectorIndexVersionLabel(null)).toBe('严格模式未重建');
        expect(formatVectorIndexVersionLabel('source_metadata_v3')).toBe('严格 Metadata 回源');
        expect(formatVectorIndexVersionLabel('legacy')).toBe('旧链路已失效');
    });
});
