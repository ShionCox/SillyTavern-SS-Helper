import { PromptReferenceService } from './prompt-reference-service';

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

export interface SummaryPromptCandidateDTO {
    candidateRef: string;
    entryRef?: string;
    targetKind: string;
    title: string;
    summary: string;
    compareKey?: string;
}

export interface SummaryPromptDTOBuildResult {
    candidates: SummaryPromptCandidateDTO[];
    references: PromptReferenceService;
    candidateRefToCandidateId: Map<string, string>;
    candidateIdToCandidateRef: Map<string, string>;
    entryRefToEntryId: Map<string, string>;
    entryIdToEntryRef: Map<string, string>;
}

/**
 * 功能：为 Summary Prompt 预留统一 alias / DTO 压缩入口。
 * 说明：当前先提供基础压缩能力，后续可在 summary planner / mutation 阶段复用。
 */
export class SummaryPromptDTOService {
    build(input: {
        candidates: Array<{
            candidateId?: string;
            entryId?: string;
            targetKind?: string;
            title?: string;
            summary?: string;
            compareKey?: string;
        }>;
    }): SummaryPromptDTOBuildResult {
        const references = new PromptReferenceService();
        const candidateRefToCandidateId = new Map<string, string>();
        const candidateIdToCandidateRef = new Map<string, string>();
        const entryRefToEntryId = new Map<string, string>();
        const entryIdToEntryRef = new Map<string, string>();
        const candidates = input.candidates.map((candidate, index): SummaryPromptCandidateDTO => ({
            candidateRef: (() => {
                const candidateId = normalizeText(candidate.candidateId) || `summary_candidate_${index + 1}`;
                const ref = references.encode('summary', candidateId);
                candidateRefToCandidateId.set(ref, candidateId);
                candidateIdToCandidateRef.set(candidateId, ref);
                return ref;
            })(),
            entryRef: (() => {
                const entryId = normalizeText(candidate.entryId);
                if (!entryId) {
                    return undefined;
                }
                const ref = references.encode('entry', entryId);
                entryRefToEntryId.set(ref, entryId);
                entryIdToEntryRef.set(entryId, ref);
                return ref;
            })(),
            targetKind: normalizeText(candidate.targetKind) || 'other',
            title: normalizeText(candidate.title) || '未命名候选',
            summary: normalizeText(candidate.summary) || '暂无摘要',
            compareKey: normalizeText(candidate.compareKey) || undefined,
        }));
        return {
            candidates,
            references,
            candidateRefToCandidateId,
            candidateIdToCandidateRef,
            entryRefToEntryId,
            entryIdToEntryRef,
        };
    }
}
