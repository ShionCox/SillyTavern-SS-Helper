import { DreamSessionRepository } from './dream-session-repository';
import type {
    DreamMaintenanceProposalRecord,
    DreamMutationProposal,
    DreamQualityReport,
    DreamSessionOutputRecord,
} from './dream-types';

/** explain 缺失时的质量分数惩罚 */
const PENALTY_EXPLAIN_MISSING = 0.12;
/** 重复提案的质量分数惩罚 */
const PENALTY_DUPLICATE = 0.08;
/** 硬事实风险的质量分数惩罚 */
const PENALTY_HARD_FACT_RISK = 0.12;
/** 幻觉风险的质量分数惩罚 */
const PENALTY_HALLUCINATION_RISK = 0.16;

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：对 dream 输出做第三阶段质量守卫检查。
 */
export class DreamQualityGuardService {
    private readonly chatKey: string;
    private readonly repository: DreamSessionRepository;

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = new DreamSessionRepository(this.chatKey);
    }

    async evaluateDreamQuality(input: {
        dreamId: string;
        output: DreamSessionOutputRecord;
        maintenanceProposals: DreamMaintenanceProposalRecord[];
    }): Promise<DreamQualityReport> {
        const recentOutputs = await this.repository.listDreamSessionOutputs(8);
        const warnings: string[] = [];
        const blockedMutationIds = new Set<string>();
        const forcedReviewMutationIds = new Set<string>();

        const recentFingerprints = new Set(
            recentOutputs
                .filter((item: DreamSessionOutputRecord): boolean => item.dreamId !== input.dreamId)
                .flatMap((item: DreamSessionOutputRecord): string[] => {
                    return item.proposedMutations.map((mutation: DreamMutationProposal): string => this.buildMutationFingerprint(mutation));
                }),
        );

        let explainMissingCount = 0;
        let hardFactRiskCount = 0;
        let duplicateCount = 0;
        let hallucinationRiskCount = 0;

        for (const mutation of input.output.proposedMutations) {
            const explain = mutation.explain;
            if (!explain || explain.sourceEntryIds.length <= 0 || explain.explanationSteps.length <= 0) {
                explainMissingCount += 1;
                forcedReviewMutationIds.add(mutation.mutationId);
            }
            const fingerprint = this.buildMutationFingerprint(mutation);
            if (recentFingerprints.has(fingerprint)) {
                duplicateCount += 1;
                warnings.push(`提案 ${mutation.preview} 与近期梦境高度重复。`);
                forcedReviewMutationIds.add(mutation.mutationId);
            }
            if (this.isHardFactRisk(mutation)) {
                hardFactRiskCount += 1;
                warnings.push(`提案 ${mutation.preview} 触及高风险硬事实，必须人工复核。`);
                forcedReviewMutationIds.add(mutation.mutationId);
            }
            if (mutation.sourceEntryIds.length <= 1 && Number(mutation.confidence ?? 0) >= 0.8) {
                hallucinationRiskCount += 1;
                warnings.push(`提案 ${mutation.preview} 证据过少但置信度偏高，存在幻觉风险。`);
                blockedMutationIds.add(mutation.mutationId);
            }
        }

        if (input.maintenanceProposals.length <= 0) {
            warnings.push('本轮梦境未生成 maintenance proposal，长期维护价值偏弱。');
        }

        const qualityScore = Math.max(
            0,
            Math.min(
                1,
                Number((
                    1
                    - explainMissingCount * PENALTY_EXPLAIN_MISSING
                    - duplicateCount * PENALTY_DUPLICATE
                    - hardFactRiskCount * PENALTY_HARD_FACT_RISK
                    - hallucinationRiskCount * PENALTY_HALLUCINATION_RISK
                ).toFixed(3)),
            ),
        );

        return {
            dreamId: input.dreamId,
            chatKey: this.chatKey,
            qualityScore,
            warnings: Array.from(new Set(warnings)).slice(0, 12),
            blockedMutationIds: Array.from(blockedMutationIds),
            forcedReviewMutationIds: Array.from(forcedReviewMutationIds),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
    }

    guardDreamMutations(input: {
        output: DreamSessionOutputRecord;
        qualityReport: DreamQualityReport;
    }): DreamMutationProposal[] {
        const blockedSet = new Set(input.qualityReport.blockedMutationIds);
        return input.output.proposedMutations.filter((mutation: DreamMutationProposal): boolean => {
            return !blockedSet.has(mutation.mutationId);
        });
    }

    private buildMutationFingerprint(mutation: DreamMutationProposal): string {
        return [
            normalizeText(mutation.mutationType).toLowerCase(),
            normalizeText(mutation.preview).toLowerCase(),
            JSON.stringify(toRecord(mutation.payload)),
        ].join('::');
    }

    private isHardFactRisk(mutation: DreamMutationProposal): boolean {
        const payload = toRecord(mutation.payload);
        const entryType = normalizeText(payload.entryType).toLowerCase();
        const tags = Array.isArray(payload.tags)
            ? payload.tags.map((item: unknown): string => normalizeText(item).toLowerCase())
            : [];
        const preview = normalizeText(mutation.preview).toLowerCase();
        const hardFactEntryTypes = [
            'identity', 'persona', 'profile', 'core_fact', 'world_rule',
            'character', 'setting', 'rule', 'backstory',
        ];
        const hardFactTags = [
            '身份', '设定', '规则', '世界观', '核心事实',
            'identity', 'persona', 'core_fact', 'world_rule', 'backstory',
        ];
        const hardFactKeywords = [
            '身份', '设定', '规则', '世界观',
            'identity', 'persona', 'rule', 'setting',
        ];
        return hardFactEntryTypes.includes(entryType)
            || tags.some((tag: string): boolean => hardFactTags.includes(tag))
            || hardFactKeywords.some((keyword: string): boolean => preview.includes(keyword));
    }
}
