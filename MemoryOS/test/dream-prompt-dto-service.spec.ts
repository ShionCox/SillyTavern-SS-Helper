import { describe, expect, it } from 'vitest';
import { DreamPromptDTOService } from '../src/services/dream-prompt-dto-service';
import { DEFAULT_MEMORY_OS_SETTINGS } from '../src/settings/store';
import type {
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamSessionMetaRecord,
    DreamSessionRecallRecord,
} from '../src/services/dream-types';

describe('DreamPromptDTOService', () => {
    it('会把真实长 ID 压缩成 Prompt alias，并裁剪图摘要', () => {
        const service = new DreamPromptDTOService();
        const meta: DreamSessionMetaRecord = {
            dreamId: 'dream:tavern:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            chatKey: 'chat:tavern:seraphina:long-chat-key',
            status: 'running',
            triggerReason: 'manual',
            createdAt: 1,
            updatedAt: 1,
            settingsSnapshot: {
                contextMaxTokens: 1200,
                retrievalMode: 'lexical_only',
                dreamContextMaxChars: 6000,
            },
        };
        const recall: DreamSessionRecallRecord = {
            dreamId: meta.dreamId,
            chatKey: meta.chatKey,
            recentHits: [{
                entryId: 'entry:tavern:11111111-1111-1111-1111-111111111111',
                title: '林地守护',
                summary: '在林地中休整。',
                score: 0.92,
                source: 'recent',
                actorKeys: ['user', 'seraphina'],
                relationKeys: ['relationship:tavern:1'],
                tags: ['林地', '休整'],
            }],
            midHits: [],
            deepHits: [],
            fusedHits: [],
            diagnostics: {
                sourceQuery: 'forest',
                totalCandidates: 1,
                truncated: false,
            },
            createdAt: 1,
            updatedAt: 1,
        };
        const diagnostics: DreamSessionDiagnosticsRecord = {
            dreamId: meta.dreamId,
            chatKey: meta.chatKey,
            waveOutputs: [{
                waveType: 'recent',
                queryText: 'forest',
                seedEntryIds: ['entry:tavern:11111111-1111-1111-1111-111111111111'],
                activatedNodeKeys: ['node:topic:forest', 'node:actor:seraphina'],
                candidates: [],
                diagnostics: {
                    candidateCount: 1,
                    truncated: false,
                    baseReason: ['recent resonance'],
                },
            }],
            fusionResult: {
                fusedCandidates: [],
                bridgeNodeKeys: ['node:topic:forest'],
                rejectedCandidateIds: [],
                diagnostics: {
                    duplicateDropped: 0,
                    boostedByNovelty: 1,
                    boostedByActivation: 1,
                    finalSelectedCount: 1,
                },
            },
            createdAt: 1,
            updatedAt: 1,
        };
        const graphSnapshot: DreamSessionGraphSnapshotRecord = {
            dreamId: meta.dreamId,
            chatKey: meta.chatKey,
            activatedNodes: [
                {
                    nodeKey: 'node:topic:forest',
                    nodeType: 'topic',
                    label: 'forest',
                    activation: 0.9,
                    novelty: 0.3,
                    rarity: 0.1,
                    lastSeenAt: 1,
                    usageCount: 1,
                    chatKey: meta.chatKey,
                },
                {
                    nodeKey: 'node:actor:seraphina',
                    nodeType: 'actor',
                    label: 'seraphina',
                    activation: 0.8,
                    novelty: 0.2,
                    rarity: 0.1,
                    lastSeenAt: 1,
                    usageCount: 1,
                    chatKey: meta.chatKey,
                },
            ],
            activatedEdges: [],
            createdAt: 1,
            updatedAt: 1,
        };

        const result = service.build({
            meta,
            recall,
            diagnostics,
            graphSnapshot,
            settings: DEFAULT_MEMORY_OS_SETTINGS,
            promptInfo: {
                promptVersion: 'v1.0.0',
                stylePreset: 'reflective',
                schemaVersion: 'dream-output.v1',
            },
        });

        expect(result.dto.runtime.chatRef).toBe('C1');
        expect(result.dto.runtime.dreamRef).toBe('D1');
        expect(result.dto.recall.recentHits[0]?.entryRef).toBe('E1');
        expect(JSON.stringify(result.dto)).not.toContain(meta.chatKey);
        expect(JSON.stringify(result.dto)).not.toContain(recall.recentHits[0]?.entryId ?? '');
        expect(result.dto.diagnostics?.topBridgeNodes[0]?.nodeRef).toBe('N2');
        expect(result.dto.graphSummary?.topActors[0]?.label).toBe('seraphina');
    });
});
