import { activateDreamNeuronGraph, buildDreamNeuronGraph, selectCandidateNodeKeys } from '../core/dream-neuron-graph';
import type { EntryRepository } from '../repository/entry-repository';
import { readMemoryOSSettings } from '../settings/store';
import type { MemoryEntry, MemoryRelationshipRecord, SummarySnapshot } from '../types';
import type {
    DreamFusionResult,
    DreamRecallCandidate,
    DreamRecallHit,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamSessionRecallRecord,
    DreamWaveOutput,
} from './dream-types';

const INITIAL_RECENT_DAYS = 7;
const INITIAL_MID_DAYS = 90;
const RECENT_EXPAND_STEP = 7;
const RECENT_EXPAND_MAX = 30;
const MID_EXPAND_STEP = 30;
const MID_EXPAND_MAX = 180;

export type DreamWaveRecallBuildResult = {
    recall: Omit<DreamSessionRecallRecord, 'dreamId' | 'chatKey'>;
    diagnostics: Omit<DreamSessionDiagnosticsRecord, 'dreamId' | 'chatKey'>;
    graphSnapshot: Omit<DreamSessionGraphSnapshotRecord, 'dreamId' | 'chatKey'> | null;
    candidateMap: Map<string, DreamRecallCandidate>;
};

/**
 * 功能：独立实现第二阶段梦境波纹召回与图激活。
 */
export class DreamWaveRecallService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly readRecentMessages: () => Promise<Array<{ role?: string; content?: string; name?: string; turnIndex?: number }>>;

    constructor(input: {
        chatKey: string;
        repository: EntryRepository;
        readRecentMessages: () => Promise<Array<{ role?: string; content?: string; name?: string; turnIndex?: number }>>;
    }) {
        this.chatKey = String(input.chatKey ?? '').trim();
        this.repository = input.repository;
        this.readRecentMessages = input.readRecentMessages;
    }

    async buildRecallBundle(): Promise<DreamWaveRecallBuildResult> {
        const settings = readMemoryOSSettings();
        const [entries, roleMemories, relationships, summaries, recentMessages] = await Promise.all([
            this.repository.listEntries(),
            this.repository.listRoleMemories(),
            this.repository.listRelationships(),
            this.repository.listSummarySnapshots(6),
            this.readRecentMessages(),
        ]);
        const currentTs = Date.now();
        const sourceQuery = recentMessages
            .slice(-8)
            .map((item): string => String(item.content ?? '').trim())
            .filter(Boolean)
            .join('\n')
            .slice(0, 1600);
        const memoryPercentMap = new Map<string, number>();
        for (const row of roleMemories) {
            const current = memoryPercentMap.get(row.entryId) ?? 0;
            if (row.memoryPercent > current) {
                memoryPercentMap.set(row.entryId, row.memoryPercent);
            }
        }
        const relationshipMap = this.buildRelationshipMap(relationships);
        const graph = buildDreamNeuronGraph({
            chatKey: this.chatKey,
            entries,
            relationships,
            summaries,
        });
        const candidates = entries.map((entry: MemoryEntry): DreamRecallCandidate => {
            return this.buildCandidate(entry, summaries, memoryPercentMap, relationshipMap, currentTs, graph.entryNodeMap.get(entry.entryId) ?? []);
        });
        const candidateMap = new Map(candidates.map((candidate: DreamRecallCandidate): [string, DreamRecallCandidate] => [candidate.entryId, candidate]));
        const buckets = this.buildDynamicTimeBuckets(candidates, currentTs);

        const recentWave = this.buildWave({
            waveType: 'recent',
            queryText: sourceQuery || '最近消息不足，退回到近期记忆种子。',
            bucket: buckets.recent,
            anchorHits: [],
            seedTopK: 3,
            resultTopK: settings.dreamWaveEnabled ? settings.dreamWaveRecentTopK : settings.dreamRecentTopK,
            graph,
            graphEnabled: settings.dreamGraphEnabled,
            graphExpandDepth: settings.dreamGraphExpandDepth,
            noveltyEnabled: settings.dreamNoveltyEnabled,
            noveltyWeight: settings.dreamNoveltyWeight,
            repetitionPenaltyWeight: settings.dreamRepetitionPenaltyWeight,
        });
        const recentSet = new Set(recentWave.candidates.map((candidate: DreamRecallCandidate): string => candidate.entryId));
        const midWave = this.buildWave({
            waveType: 'mid',
            queryText: sourceQuery || '最近消息不足，回退到中期回音。',
            bucket: buckets.mid.filter((item: DreamRecallCandidate): boolean => !recentSet.has(item.entryId)),
            anchorHits: recentWave.candidates,
            seedTopK: 2,
            resultTopK: settings.dreamWaveEnabled ? settings.dreamWaveMidTopK : settings.dreamMidTopK,
            graph,
            graphEnabled: settings.dreamGraphEnabled,
            graphExpandDepth: settings.dreamGraphExpandDepth,
            noveltyEnabled: settings.dreamNoveltyEnabled,
            noveltyWeight: settings.dreamNoveltyWeight,
            repetitionPenaltyWeight: settings.dreamRepetitionPenaltyWeight,
        });
        const midSet = new Set(midWave.candidates.map((candidate: DreamRecallCandidate): string => candidate.entryId));
        const deepWave = this.buildWave({
            waveType: 'deep',
            queryText: sourceQuery || '最近消息不足，回退到深层回声。',
            bucket: buckets.deep.filter((item: DreamRecallCandidate): boolean => !recentSet.has(item.entryId) && !midSet.has(item.entryId)),
            anchorHits: [...recentWave.candidates, ...midWave.candidates],
            seedTopK: 0,
            resultTopK: settings.dreamWaveEnabled ? settings.dreamWaveDeepTopK : settings.dreamDeepTopK,
            graph,
            graphEnabled: settings.dreamGraphEnabled,
            graphExpandDepth: Math.max(1, settings.dreamGraphExpandDepth),
            noveltyEnabled: settings.dreamNoveltyEnabled,
            noveltyWeight: settings.dreamNoveltyWeight,
            repetitionPenaltyWeight: settings.dreamRepetitionPenaltyWeight,
        });
        const fusion = this.fuseWaveCandidates(
            [recentWave, midWave, deepWave],
            settings.dreamWaveEnabled ? settings.dreamWaveFusionTopK : settings.dreamFusedMaxItems,
        );

        const activeNodeKeys = new Set<string>(selectCandidateNodeKeys(fusion.fusedCandidates));
        const graphSnapshot = settings.dreamDiagnosticsEnabled && settings.dreamGraphEnabled
            ? {
                activatedNodes: graph.nodes
                    .filter((node) => activeNodeKeys.has(node.nodeKey))
                    .map((node) => ({ ...node }))
                    .sort((left, right) => right.activation - left.activation || right.novelty - left.novelty)
                    .slice(0, 24),
                activatedEdges: graph.edges
                    .filter((edge) => activeNodeKeys.has(edge.fromNodeKey) && activeNodeKeys.has(edge.toNodeKey))
                    .slice(0, 40),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            }
            : null;

        return {
            recall: {
                recentHits: recentWave.candidates.map((candidate: DreamRecallCandidate): DreamRecallHit => this.toRecallHit(candidate, 'recent')),
                midHits: midWave.candidates.map((candidate: DreamRecallCandidate): DreamRecallHit => this.toRecallHit(candidate, 'mid')),
                deepHits: deepWave.candidates.map((candidate: DreamRecallCandidate): DreamRecallHit => this.toRecallHit(candidate, 'deep')),
                fusedHits: fusion.fusedCandidates.map((candidate: DreamRecallCandidate): DreamRecallHit => this.toRecallHit(candidate, 'fused')),
                diagnostics: {
                    sourceQuery: sourceQuery || '当前聊天最近消息为空，使用第二阶段 DreamWave + 图激活回退。',
                    totalCandidates: candidates.length,
                    truncated: fusion.fusedCandidates.length < candidates.length,
                },
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            diagnostics: {
                waveOutputs: [recentWave, midWave, deepWave],
                fusionResult: fusion,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            },
            graphSnapshot: graphSnapshot ? {
                activatedNodes: graphSnapshot.activatedNodes,
                activatedEdges: graphSnapshot.activatedEdges,
                createdAt: graphSnapshot.createdAt,
                updatedAt: graphSnapshot.updatedAt,
            } : null,
            candidateMap,
        };
    }

    private buildWave(input: {
        waveType: 'recent' | 'mid' | 'deep';
        queryText: string;
        bucket: DreamRecallCandidate[];
        anchorHits: DreamRecallCandidate[];
        seedTopK: number;
        resultTopK: number;
        graph: ReturnType<typeof buildDreamNeuronGraph>;
        graphEnabled: boolean;
        graphExpandDepth: number;
        noveltyEnabled: boolean;
        noveltyWeight: number;
        repetitionPenaltyWeight: number;
    }): DreamWaveOutput {
        const bucket = [...input.bucket].sort((left, right): number => right.baseScore - left.baseScore);
        const seedEntries = input.seedTopK > 0 ? bucket.slice(0, Math.min(input.seedTopK, bucket.length)) : bucket.slice(0, Math.min(3, bucket.length));
        const graphActivation = input.graphEnabled
            ? activateDreamNeuronGraph({
                nodes: input.graph.nodes,
                edges: input.graph.edges,
                entryNodeMap: input.graph.entryNodeMap,
                seeds: [...seedEntries, ...input.anchorHits].map((item): DreamRecallHit => this.toRecallHit(item, item.source)),
                expandDepth: input.graphExpandDepth,
            })
            : {
                nodeActivationMap: new Map<string, number>(),
                bridgeNodeKeys: [] as string[],
                activatedNodes: [],
                activatedEdges: [],
            };
        graphActivation.activatedNodes.forEach((node): void => {
            const original = input.graph.nodes.find((item) => item.nodeKey === node.nodeKey);
            if (original) {
                original.activation = node.activation;
                original.novelty = node.novelty;
            }
        });

        const candidates = bucket
            .map((candidate: DreamRecallCandidate): DreamRecallCandidate => {
                const resonanceScore = this.computeResonance(candidate, [...seedEntries, ...input.anchorHits]);
                const activationScore = candidate.sourceNodeKeys.reduce((sum: number, nodeKey: string): number => {
                    return sum + (graphActivation.nodeActivationMap.get(nodeKey) ?? 0);
                }, 0) / Math.max(1, candidate.sourceNodeKeys.length);
                const noveltyScore = input.noveltyEnabled ? this.computeCandidateNovelty(candidate, graphActivation.nodeActivationMap) : 0;
                const repetitionPenalty = this.computeRepetitionPenalty(candidate, input.anchorHits) * input.repetitionPenaltyWeight;
                const deepBoost = input.waveType === 'deep' ? this.computeDeepPriority(candidate, Date.now()) * 0.18 : 0;
                const finalScore = Math.max(
                    0,
                    Number((candidate.baseScore + resonanceScore * 0.4 + activationScore * 0.28 + noveltyScore * input.noveltyWeight + deepBoost - repetitionPenalty).toFixed(4)),
                );
                return {
                    ...candidate,
                    source: input.waveType,
                    activationScore: Number(activationScore.toFixed(4)),
                    noveltyScore: Number(noveltyScore.toFixed(4)),
                    repetitionPenalty: Number(repetitionPenalty.toFixed(4)),
                    finalScore,
                    score: finalScore,
                    bridgeNodeKeys: graphActivation.bridgeNodeKeys.slice(0, 6),
                    reasonChain: [
                        `基础分 ${candidate.baseScore.toFixed(3)}`,
                        `共振加成 ${resonanceScore.toFixed(3)}`,
                        `激活加成 ${activationScore.toFixed(3)}`,
                        `新颖度 ${noveltyScore.toFixed(3)}`,
                        `重复惩罚 ${repetitionPenalty.toFixed(3)}`,
                    ],
                };
            })
            .sort((left: DreamRecallCandidate, right: DreamRecallCandidate): number => right.finalScore - left.finalScore)
            .slice(0, input.resultTopK);

        return {
            waveType: input.waveType,
            queryText: input.queryText,
            seedEntryIds: seedEntries.map((candidate: DreamRecallCandidate): string => candidate.entryId),
            activatedNodeKeys: graphActivation.activatedNodes.map((node) => node.nodeKey),
            candidates,
            diagnostics: {
                candidateCount: bucket.length,
                truncated: candidates.length < bucket.length,
                baseReason: graphActivation.bridgeNodeKeys.length > 0
                    ? [`图桥节点: ${graphActivation.bridgeNodeKeys.slice(0, 5).join(', ')}`]
                    : ['未命中额外图桥节点，按波段基础共振排序。'],
            },
        };
    }

    private fuseWaveCandidates(waves: DreamWaveOutput[], maxItems: number): DreamFusionResult {
        const seen = new Set<string>();
        const fusedCandidates: DreamRecallCandidate[] = [];
        const rejectedCandidateIds: string[] = [];
        let duplicateDropped = 0;
        let boostedByNovelty = 0;
        let boostedByActivation = 0;
        for (const candidate of waves.flatMap((wave: DreamWaveOutput): DreamRecallCandidate[] => wave.candidates)) {
            if (seen.has(candidate.entryId)) {
                duplicateDropped += 1;
                rejectedCandidateIds.push(candidate.candidateId);
                continue;
            }
            seen.add(candidate.entryId);
            if (candidate.noveltyScore >= 0.2) {
                boostedByNovelty += 1;
            }
            if (candidate.activationScore >= 0.2) {
                boostedByActivation += 1;
            }
            fusedCandidates.push({
                ...candidate,
                source: 'fused',
                score: candidate.finalScore,
            });
            if (fusedCandidates.length >= maxItems) {
                break;
            }
        }
        return {
            fusedCandidates,
            bridgeNodeKeys: Array.from(new Set(fusedCandidates.flatMap((candidate: DreamRecallCandidate): string[] => candidate.bridgeNodeKeys))).slice(0, 12),
            rejectedCandidateIds,
            diagnostics: {
                duplicateDropped,
                boostedByNovelty,
                boostedByActivation,
                finalSelectedCount: fusedCandidates.length,
            },
        };
    }

    private buildRelationshipMap(relationships: MemoryRelationshipRecord[]): Map<string, string[]> {
        const map = new Map<string, string[]>();
        for (const relationship of relationships) {
            for (const actorKey of relationship.participants) {
                const current = map.get(actorKey) ?? [];
                current.push(relationship.relationshipId);
                map.set(actorKey, current);
            }
        }
        return map;
    }

    private buildCandidate(
        entry: MemoryEntry,
        summaries: SummarySnapshot[],
        memoryPercentMap: Map<string, number>,
        relationshipMap: Map<string, string[]>,
        currentTs: number,
        sourceNodeKeys: string[],
    ): DreamRecallCandidate {
        const summarySignals = this.computeSummarySignals(entry, summaries);
        const memoryPercent = memoryPercentMap.get(entry.entryId) ?? 0;
        const recencyHours = Math.max(1, (currentTs - Number(entry.updatedAt ?? currentTs)) / 3600000);
        const recencyScore = Math.max(0, 1 - Math.min(1, recencyHours / (24 * 14)));
        const stabilityScore = Math.min(1, ((entry.summary?.length ?? 0) + (entry.detail?.length ?? 0)) / 400);
        const resonanceScore = Math.min(1, (summarySignals + memoryPercent / 100) / 2);
        const actorKeys = this.normalizeTags((entry.detailPayload as { bindings?: { actors?: string[] } })?.bindings?.actors);
        const baseScore = Number((recencyScore * 0.45 + stabilityScore * 0.2 + resonanceScore * 0.35).toFixed(4));
        return {
            candidateId: `dream_candidate:${entry.entryId}`,
            entryId: entry.entryId,
            title: entry.title,
            summary: entry.summary || entry.detail || '无摘要',
            score: baseScore,
            source: 'fused',
            actorKeys,
            relationKeys: actorKeys.flatMap((actorKey: string): string[] => relationshipMap.get(actorKey) ?? []).slice(0, 8),
            tags: this.normalizeTags(entry.tags),
            updatedAt: entry.updatedAt,
            baseScore,
            activationScore: 0,
            noveltyScore: 0,
            repetitionPenalty: 0,
            finalScore: baseScore,
            sourceNodeKeys,
            bridgeNodeKeys: [],
            reasonChain: ['基础候选'],
        };
    }

    private buildDynamicTimeBuckets(candidateHits: DreamRecallCandidate[], currentTs: number): {
        recent: DreamRecallCandidate[];
        mid: DreamRecallCandidate[];
        deep: DreamRecallCandidate[];
    } {
        const sorted = [...candidateHits].sort((left, right): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0));
        let recentBoundary = INITIAL_RECENT_DAYS;
        let midBoundary = INITIAL_MID_DAYS;
        const countInRange = (minDays: number, maxDays: number): number => {
            return sorted.filter((hit): boolean => {
                const ageDays = this.computeAgeDays(hit, currentTs);
                return ageDays >= minDays && ageDays <= maxDays;
            }).length;
        };
        while (countInRange(0, recentBoundary) < 3 && recentBoundary < RECENT_EXPAND_MAX) {
            recentBoundary += RECENT_EXPAND_STEP;
        }
        const midStart = recentBoundary + 1;
        while (countInRange(midStart, midBoundary) < 2 && midBoundary < MID_EXPAND_MAX) {
            midBoundary += MID_EXPAND_STEP;
        }
        return {
            recent: sorted.filter((hit): boolean => this.computeAgeDays(hit, currentTs) <= recentBoundary),
            mid: sorted.filter((hit): boolean => {
                const ageDays = this.computeAgeDays(hit, currentTs);
                return ageDays > recentBoundary && ageDays <= midBoundary;
            }),
            deep: sorted.filter((hit): boolean => this.computeAgeDays(hit, currentTs) > midBoundary),
        };
    }

    private computeResonance(candidate: DreamRecallCandidate, anchors: DreamRecallCandidate[]): number {
        if (anchors.length <= 0) {
            return 0;
        }
        let bestScore = 0;
        const candidateKeywords = this.extractKeywords(candidate.summary, candidate.title, candidate.tags);
        for (const anchor of anchors) {
            const sharedTags = this.countSharedValues(candidate.tags, anchor.tags);
            const sharedActors = this.countSharedValues(candidate.actorKeys, anchor.actorKeys);
            const sharedRelations = this.countSharedValues(candidate.relationKeys, anchor.relationKeys);
            const anchorKeywords = this.extractKeywords(anchor.summary, anchor.title, anchor.tags);
            const sharedKeywords = this.countSharedValues(candidateKeywords, anchorKeywords);
            const score = Math.min(1, sharedTags * 0.22 + sharedActors * 0.28 + sharedRelations * 0.18 + sharedKeywords * 0.08);
            if (score > bestScore) {
                bestScore = score;
            }
        }
        return bestScore;
    }

    private computeCandidateNovelty(candidate: DreamRecallCandidate, activationMap: Map<string, number>): number {
        const activationMean = candidate.sourceNodeKeys.reduce((sum: number, nodeKey: string): number => {
            return sum + (activationMap.get(nodeKey) ?? 0);
        }, 0) / Math.max(1, candidate.sourceNodeKeys.length);
        const deepAge = Math.min(1, this.computeAgeDays(candidate, Date.now()) / 180);
        return Number((Math.max(0, deepAge * 0.6 + (1 - activationMean) * 0.4)).toFixed(4));
    }

    private computeRepetitionPenalty(candidate: DreamRecallCandidate, anchors: DreamRecallCandidate[]): number {
        if (anchors.length <= 0) {
            return 0;
        }
        const sharedAnchorCount = anchors.filter((anchor: DreamRecallCandidate): boolean => {
            return this.countSharedValues(candidate.tags, anchor.tags) > 1
                || this.countSharedValues(candidate.actorKeys, anchor.actorKeys) > 0;
        }).length;
        return Math.min(0.8, sharedAnchorCount / Math.max(1, anchors.length) * 0.6);
    }

    private computeSummarySignals(entry: MemoryEntry, summaries: SummarySnapshot[]): number {
        const sourceSummaryIds = new Set(entry.sourceSummaryIds);
        if (sourceSummaryIds.size <= 0) {
            return 0;
        }
        let matches = 0;
        for (const summary of summaries) {
            if (sourceSummaryIds.has(summary.summaryId)) {
                matches += 1;
            }
        }
        return Math.min(1, matches / Math.max(1, summaries.length || 1));
    }

    private computeDeepPriority(hit: DreamRecallHit, currentTs: number): number {
        const ageHours = Math.max(1, (currentTs - Number(hit.updatedAt ?? currentTs)) / 3600000);
        const ageScore = Math.min(1, ageHours / (24 * 60));
        const tagScore = Math.min(1, hit.tags.length / 5);
        return ageScore * 0.6 + hit.score * 0.25 + tagScore * 0.15;
    }

    private toRecallHit(candidate: DreamRecallCandidate, source: DreamRecallHit['source']): DreamRecallHit {
        return {
            entryId: candidate.entryId,
            title: candidate.title,
            summary: candidate.summary,
            score: candidate.finalScore || candidate.score,
            source,
            actorKeys: candidate.actorKeys,
            relationKeys: candidate.relationKeys,
            tags: candidate.tags,
            updatedAt: candidate.updatedAt,
        };
    }

    private normalizeTags(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        return Array.from(new Set(value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)));
    }

    private extractKeywords(...values: Array<string | string[]>): string[] {
        const text = values
            .flatMap((value: string | string[]): string[] => Array.isArray(value) ? value : [value])
            .map((value: string): string => String(value ?? '').trim().toLowerCase())
            .join(' ');
        const tokens = text
            .split(/[^\p{L}\p{N}_-]+/u)
            .map((token: string): string => token.trim())
            .filter((token: string): boolean => token.length >= 2);
        return Array.from(new Set(tokens)).slice(0, 20);
    }

    private countSharedValues(left: string[], right: string[]): number {
        const rightSet = new Set(right);
        return left.filter((item: string): boolean => rightSet.has(item)).length;
    }

    private computeAgeDays(hit: DreamRecallHit, currentTs: number): number {
        return Math.max(0, (currentTs - Number(hit.updatedAt ?? currentTs)) / (24 * 3600000));
    }
}
