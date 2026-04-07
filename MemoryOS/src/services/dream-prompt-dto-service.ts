import type { MemoryOSSettings } from '../settings/store';
import type {
    DreamPromptInfo,
} from './dream-prompt-service';
import type { ResolvedDreamExecutionPlan } from './dream-execution-mode';
import type {
    DreamNeuronNode,
    DreamRecallCandidate,
    DreamRecallHit,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamSessionMetaRecord,
    DreamSessionRecallRecord,
} from './dream-types';
import { PromptReferenceService } from './prompt-reference-service';
import type {
    DreamPromptDTO,
    PromptGraphSummaryItemDTO,
    PromptRecallHitDTO,
} from '../types/prompt-alias';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function clampUnitInterval(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
}

function uniqueStrings(values: unknown[]): string[] {
    return Array.from(new Set(values.map((value: unknown): string => normalizeText(value)).filter(Boolean)));
}

function normalizeActorLabel(actorKey: string): string {
    const normalized = normalizeText(actorKey);
    if (!normalized) {
        return '';
    }
    return normalized.split(':').pop() || normalized;
}

export interface DreamPromptDTOBuildResult {
    dto: DreamPromptDTO;
    references: PromptReferenceService;
    entryRefToEntryId: Map<string, string>;
    nodeRefToNodeKey: Map<string, string>;
    relationshipRefToRelationshipKey: Map<string, string>;
    candidateByEntryRef: Map<string, DreamRecallCandidate>;
}

export class DreamPromptDTOService {
    build(input: {
        meta: DreamSessionMetaRecord;
        recall: DreamSessionRecallRecord;
        diagnostics?: DreamSessionDiagnosticsRecord | null;
        graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
        settings: MemoryOSSettings;
        promptInfo: DreamPromptInfo;
        candidateMap?: Map<string, DreamRecallCandidate>;
        plan?: ResolvedDreamExecutionPlan;
    }): DreamPromptDTOBuildResult {
        const references = new PromptReferenceService();
        const entryRefToEntryId = new Map<string, string>();
        const nodeRefToNodeKey = new Map<string, string>();
        const relationshipRefToRelationshipKey = new Map<string, string>();
        const candidateByEntryRef = new Map<string, DreamRecallCandidate>();
        const nodeMap = new Map(
            (input.graphSnapshot?.activatedNodes ?? []).map((node: DreamNeuronNode): [string, DreamNeuronNode] => [node.nodeKey, node]),
        );

        const encodeEntryRef = (entryId: string): string => {
            const ref = references.encode('entry', entryId);
            entryRefToEntryId.set(ref, entryId);
            const candidate = input.candidateMap?.get(entryId);
            if (candidate) {
                candidateByEntryRef.set(ref, candidate);
            }
            return ref;
        };
        const encodeNodeRef = (nodeKey: string): string => {
            const ref = references.encode('node', nodeKey);
            nodeRefToNodeKey.set(ref, nodeKey);
            return ref;
        };
        const encodeRelationshipRef = (relationshipKey: string): string => {
            const ref = references.encode('relationship', relationshipKey);
            relationshipRefToRelationshipKey.set(ref, relationshipKey);
            return ref;
        };

        const mapHits = (hits: DreamRecallHit[]): PromptRecallHitDTO[] => hits.slice(0, input.settings.dreamFusedMaxItems).map((hit: DreamRecallHit): PromptRecallHitDTO => ({
            entryRef: encodeEntryRef(hit.entryId),
            title: normalizeText(hit.title) || '未命名条目',
            summary: normalizeText(hit.summary) || '暂无摘要',
            score: Number(Number(hit.score ?? 0).toFixed(3)),
            actors: uniqueStrings((hit.actorKeys ?? []).map(normalizeActorLabel)).slice(0, 4),
            relationRefs: uniqueStrings(hit.relationKeys ?? []).slice(0, 4).map(encodeRelationshipRef),
            tags: uniqueStrings(hit.tags ?? []).slice(0, 5),
        }));

        const graphSummary = input.graphSnapshot
            ? {
                topActors: this.buildTopNodeItems(input.graphSnapshot.activatedNodes, 'actor', encodeNodeRef),
                topTopics: this.buildTopNodeItems(input.graphSnapshot.activatedNodes, 'topic', encodeNodeRef),
                topEntries: this.buildTopNodeItems(input.graphSnapshot.activatedNodes, 'entry', encodeNodeRef),
            }
            : null;

        const diagnostics = input.diagnostics
            ? {
                waveHints: input.diagnostics.waveOutputs.map((wave) => ({
                    waveType: wave.waveType,
                    seedEntryRefs: uniqueStrings(wave.seedEntryIds).slice(0, 5).map(encodeEntryRef),
                    topNodeRefs: uniqueStrings(wave.activatedNodeKeys).slice(0, 6).map(encodeNodeRef),
                    candidateCount: wave.diagnostics.candidateCount,
                    truncated: wave.diagnostics.truncated,
                    baseReason: uniqueStrings(wave.diagnostics.baseReason).slice(0, 4),
                })),
                topBridgeNodes: uniqueStrings(input.diagnostics.fusionResult.bridgeNodeKeys)
                    .slice(0, 6)
                    .map((nodeKey: string) => {
                        const node = nodeMap.get(nodeKey);
                        return {
                            nodeRef: encodeNodeRef(nodeKey),
                            label: normalizeText(node?.label) || nodeKey,
                            nodeType: normalizeText(node?.nodeType) || 'node',
                            activation: clampUnitInterval(node?.activation),
                            novelty: clampUnitInterval(node?.novelty),
                        };
                    }),
            }
            : null;

        const dto: DreamPromptDTO = {
            runtime: {
                chatRef: references.encode('chat', input.meta.chatKey),
                dreamRef: references.encode('dream', input.meta.dreamId),
                triggerReason: normalizeText(input.meta.triggerReason) || 'manual',
                executionMode: input.plan?.executionMode ?? input.meta.executionMode ?? input.settings.dreamExecutionMode,
                runProfile: input.plan?.runProfile ?? input.meta.runProfile ?? 'manual_deep',
                outputKind: input.plan?.outputKind ?? 'full',
                promptInfo: {
                    promptVersion: input.promptInfo.promptVersion,
                    stylePreset: input.promptInfo.stylePreset,
                    schemaVersion: input.promptInfo.schemaVersion,
                },
                qualityConstraints: {
                    maxHighlights: input.plan?.maxHighlights ?? input.settings.dreamPromptMaxHighlights,
                    maxMutations: input.plan?.maxMutations ?? input.settings.dreamPromptMaxMutations,
                    weakInferenceOnly: input.settings.dreamPromptWeakInferenceOnly,
                    requireExplain: input.settings.dreamPromptRequireExplain,
                    allowMutationOutput: input.plan?.allowMutations !== false,
                    allowHighRiskMutationOutput: input.plan?.allowHighRiskMutationOutput !== false,
                },
            },
            recall: {
                recentHits: mapHits(input.recall.recentHits),
                midHits: mapHits(input.recall.midHits),
                deepHits: mapHits(input.recall.deepHits),
            },
            diagnostics,
            graphSummary,
        };

        return {
            dto,
            references,
            entryRefToEntryId,
            nodeRefToNodeKey,
            relationshipRefToRelationshipKey,
            candidateByEntryRef,
        };
    }

    private buildTopNodeItems(
        nodes: DreamNeuronNode[],
        nodeType: DreamNeuronNode['nodeType'],
        encodeNodeRef: (nodeKey: string) => string,
    ): PromptGraphSummaryItemDTO[] {
        return [...nodes]
            .filter((node: DreamNeuronNode): boolean => node.nodeType === nodeType)
            .sort((left: DreamNeuronNode, right: DreamNeuronNode): number => {
                return (right.activation + right.novelty) - (left.activation + left.novelty);
            })
            .slice(0, 5)
            .map((node: DreamNeuronNode): PromptGraphSummaryItemDTO => ({
                ref: encodeNodeRef(node.nodeKey),
                label: normalizeText(node.label) || node.nodeKey,
                score: Number((node.activation + node.novelty).toFixed(3)),
            }));
    }
}
