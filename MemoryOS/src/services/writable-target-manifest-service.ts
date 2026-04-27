import type { SummaryCandidateRecord, SummaryTypeSchema } from '../memory-summary-planner';
import { WritablePathRegistry } from '../core/writable-path-registry';
import { PromptReferenceService } from './prompt-reference-service';

export type WritableTargetAction = 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE' | 'RELATIONSHIP_PATCH' | 'ENTRY_PATCH';

export interface WritableTargetManifestItem {
    targetRef: string;
    candidateRef?: string;
    entryRef?: string;
    relationshipRef?: string;
    candidateId?: string;
    entryId?: string;
    relationshipId?: string;
    targetKind: string;
    title: string;
    status: string;
    entityKey?: string;
    compareKey?: string;
    matchKeys?: string[];
    current: Record<string, unknown>;
    editablePaths: string[];
    allowedActions: WritableTargetAction[];
    operationHints: string[];
}

export interface WritableTargetManifest {
    version: 'writable-target-manifest.v1';
    rules: string[];
    patchTargets: WritableTargetManifestItem[];
}

export interface WritableTargetManifestBuildResult {
    manifest: WritableTargetManifest;
    targetRefToCandidateId: Map<string, string>;
    targetRefToEntryId: Map<string, string>;
    targetRefToRelationshipId: Map<string, string>;
    targetRefToItem: Map<string, WritableTargetManifestItem>;
}

/**
 * 功能：构建 Summary / Dream 等链路共用的可写目标清单。
 */
export class WritableTargetManifestService {
    private readonly pathRegistry = new WritablePathRegistry();

    buildFromSummaryCandidates(input: {
        candidates: SummaryCandidateRecord[];
        typeSchemas: SummaryTypeSchema[];
        references: PromptReferenceService;
        candidateIdToCandidateRef: Map<string, string>;
        entryIdToEntryRef: Map<string, string>;
    }): WritableTargetManifestBuildResult {
        const editablePathMap = new Map<string, string[]>(
            input.typeSchemas.map((schema: SummaryTypeSchema): [string, string[]] => [
                schema.schemaId,
                schema.editableFields,
            ]),
        );
        const targetRefToCandidateId = new Map<string, string>();
        const targetRefToEntryId = new Map<string, string>();
        const targetRefToRelationshipId = new Map<string, string>();
        const targetRefToItem = new Map<string, WritableTargetManifestItem>();
        const patchTargets = input.candidates.map((candidate: SummaryCandidateRecord): WritableTargetManifestItem => {
            const targetRef = input.references.encode('target', candidate.candidateId);
            const entryId = normalizeText(candidate.recordId);
            const item: WritableTargetManifestItem = {
                targetRef,
                candidateRef: input.candidateIdToCandidateRef.get(candidate.candidateId),
                entryRef: entryId ? input.entryIdToEntryRef.get(entryId) : undefined,
                candidateId: candidate.candidateId,
                entryId: entryId || undefined,
                targetKind: normalizeText(candidate.targetKind) || 'other',
                title: normalizeText(candidate.title) || '未命名目标',
                status: normalizeText(candidate.status) || 'active',
                entityKey: candidate.entityKeys[0],
                compareKey: normalizeText(candidate.compareKey) || undefined,
                matchKeys: candidate.aliases,
                current: buildCurrent(candidate),
                editablePaths: this.resolveEditablePaths(candidate, editablePathMap),
                allowedActions: resolveAllowedActions(candidate),
                operationHints: buildOperationHints(candidate),
            };
            targetRefToCandidateId.set(targetRef, candidate.candidateId);
            if (entryId) {
                targetRefToEntryId.set(targetRef, entryId);
            }
            targetRefToItem.set(targetRef, item);
            return item;
        });
        return {
            manifest: {
                version: 'writable-target-manifest.v1',
                rules: [
                    'UPDATE / MERGE / INVALIDATE / DELETE 必须引用 patchTargets 中的 targetRef。',
                    'patch 只能写 target.editablePaths 允许的路径。',
                    'patch 只写变化字段，不要重复 current 中未变化的内容。',
                    '不要输出真实 entryId、recordId、targetId 或数据库 key。',
                    'ADD 不引用 targetRef；ADD 使用 keySeed，系统生成 entityKey / compareKey。',
                ],
                patchTargets: patchTargets.map((item: WritableTargetManifestItem): WritableTargetManifestItem => stripInternalIds(item)),
            },
            targetRefToCandidateId,
            targetRefToEntryId,
            targetRefToRelationshipId,
            targetRefToItem,
        };
    }

    private resolveEditablePaths(
        candidate: SummaryCandidateRecord,
        editablePathMap: Map<string, string[]>,
    ): string[] {
        return this.pathRegistry.resolvePaths({
            targetKind: candidate.schemaId || candidate.targetKind,
            domain: 'summary',
            schemaPaths: editablePathMap.get(candidate.schemaId) ?? editablePathMap.get(candidate.targetKind),
            overridePaths: candidate.editablePaths,
        });
    }
}

function buildCurrent(candidate: SummaryCandidateRecord): Record<string, unknown> {
    const source = candidate.current ?? {};
    return {
        ...(source.summary ? { summary: source.summary } : {}),
        ...(source.fields && Object.keys(source.fields).length > 0 ? { fields: source.fields } : {}),
        ...(source.bindings && Object.keys(source.bindings).length > 0 ? { bindings: source.bindings } : {}),
        ...(source.state ? { state: source.state } : {}),
        ...(source.lifecycle && Object.keys(source.lifecycle).length > 0 ? { lifecycle: source.lifecycle } : {}),
    };
}

function resolveAllowedActions(candidate: SummaryCandidateRecord): WritableTargetAction[] {
    if (candidate.status !== 'active') {
        return ['UPDATE'];
    }
    return ['UPDATE', 'MERGE', 'INVALIDATE', 'DELETE'];
}

function buildOperationHints(candidate: SummaryCandidateRecord): string[] {
    const targetKind = normalizeText(candidate.targetKind) || 'memory';
    return [
        `如果信息是对该 ${targetKind} 的状态推进、关系变化或细节补充，优先 UPDATE ${candidate.candidateId} 对应目标。`,
        '不要为同一对象 ADD 新记录。',
    ];
}

function stripInternalIds(item: WritableTargetManifestItem): WritableTargetManifestItem {
    const { candidateId, entryId, relationshipId, ...safeItem } = item;
    void candidateId;
    void entryId;
    void relationshipId;
    return safeItem;
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}
