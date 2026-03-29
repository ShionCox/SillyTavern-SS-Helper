import type { MemoryEntry } from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import type { ColdStartCandidate, ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { parseColdStartDocument } from './bootstrap-parser';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';
import { segmentColdStartSourceBundle } from './bootstrap-source-segmenter';
import { runBootstrapPhase } from './bootstrap-phase-runner';
import { reduceBootstrapDocuments } from './bootstrap-reducer';
import { resolveBootstrapConflicts } from './bootstrap-conflict-resolver';
import { finalizeBootstrapDocument } from './bootstrap-finalizer';
import {
    normalizeNarrativeValue,
    normalizeUserNarrativeText,
    resolveCurrentNarrativeUserName,
} from '../utils/narrative-user-name';

/**
 * 功能：定义冷启动编排依赖。
 */
export interface BootstrapOrchestratorDependencies {
    ensureActorProfile(input: {
        actorKey: string;
        displayName?: string;
        memoryStat?: number;
    }): Promise<unknown>;
    saveEntry(input: Partial<MemoryEntry> & { title: string; entryType: string }): Promise<MemoryEntry>;
    bindRoleToEntry(actorKey: string, entryId: string): Promise<unknown>;
    putWorldProfileBinding(input: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
        detectedFrom: string[];
    }): Promise<unknown>;
    appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<unknown>;
}

/**
 * 功能：定义冷启动编排输入。
 */
export interface RunBootstrapOrchestratorInput {
    dependencies: BootstrapOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    sourceBundle: ColdStartSourceBundle;
}

/**
 * 功能：定义冷启动编排结果。
 */
export interface RunBootstrapOrchestratorResult {
    ok: boolean;
    reasonCode: string;
    errorMessage?: string;
    candidates?: ColdStartCandidate[];
    document?: ColdStartDocument;
    worldProfile?: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
}

/**
 * 功能：执行冷启动编排。
 * @param input 编排输入。
 * @returns 编排结果。
 */
export async function runBootstrapOrchestrator(input: RunBootstrapOrchestratorInput): Promise<RunBootstrapOrchestratorResult> {
    const userDisplayName = resolveCurrentNarrativeUserName(input.sourceBundle.user.userName);
    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_started',
        payload: {
            reason: input.sourceBundle.reason,
            sourceTextCount: sourceTexts.length,
        },
    });
    if (!input.llm) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'llm_unavailable' },
        });
        return {
            ok: false,
            reasonCode: 'llm_unavailable',
            errorMessage: '当前未连接可用的 LLMHub 服务。',
        };
    }

    const segments = segmentColdStartSourceBundle(input.sourceBundle);
    const actorKeyHints = buildBootstrapActorKeyHints(input.sourceBundle);
    const phase1Result = await runBootstrapPhase({
        llm: input.llm,
        pluginId: input.pluginId,
        userDisplayName,
        phaseName: 'phase1',
        payload: {
            sourceBundle: segments.phase1,
            actorKeyHints,
            userDisplayName,
        },
    });
    const phase2Result = await runBootstrapPhase({
        llm: input.llm,
        pluginId: input.pluginId,
        userDisplayName,
        phaseName: 'phase2',
        payload: {
            sourceBundle: segments.phase2,
            actorKeyHints,
            userDisplayName,
        },
    });
    if (!phase1Result.ok || !phase2Result.ok) {
        const reasonCode = phase1Result.reasonCode || phase2Result.reasonCode || 'cold_start_failed';
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode },
        });
        return {
            ok: false,
            reasonCode,
            errorMessage: reasonCode,
        };
    }

    const reduced = reduceBootstrapDocuments([
        parseColdStartDocument(phase1Result.data),
        parseColdStartDocument(phase2Result.data),
    ].filter(Boolean) as ColdStartDocument[]);
    if (!reduced) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'invalid_cold_start_document' },
        });
        return {
            ok: false,
            reasonCode: 'invalid_cold_start_document',
            errorMessage: '冷启动返回内容无法通过结构校验。',
        };
    }

    const normalizedDocument = normalizeColdStartNarrativeDocument(resolveBootstrapConflicts(reduced), userDisplayName);
    const finalized = finalizeBootstrapDocument(normalizedDocument, input.sourceBundle);
    if (finalized.candidates.length <= 0) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'empty_cold_start_candidates' },
        });
        return {
            ok: false,
            reasonCode: 'empty_cold_start_candidates',
            errorMessage: '冷启动没有提取出可确认的候选记忆。',
        };
    }

    const actorCardValidation = validateRelationshipActorCards(normalizedDocument, input.sourceBundle);
    if (!actorCardValidation.ok) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: {
                reasonCode: 'relationship_actor_card_missing',
                missingActorKeys: actorCardValidation.missingActorKeys,
            },
        });
        return {
            ok: false,
            reasonCode: 'relationship_actor_card_missing',
            errorMessage: '冷启动关系中引用了未创建角色卡的对象。',
        };
    }

    return {
        ok: true,
        reasonCode: 'ok',
        candidates: finalized.candidates,
        document: normalizedDocument,
        worldProfile: finalized.worldProfile,
    };
}

/**
 * 功能：确认并应用冷启动候选到记忆库。
 * @param input 应用输入。
 * @returns 世界画像结果。
 */
export async function applyBootstrapCandidates(input: {
    dependencies: BootstrapOrchestratorDependencies;
    document: ColdStartDocument;
    sourceBundle: ColdStartSourceBundle;
    selectedCandidates: ColdStartCandidate[];
}): Promise<{
    worldProfile: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
    };
}> {
    const userDisplayName = resolveCurrentNarrativeUserName(input.sourceBundle.user.userName);
    const normalizedDocument = normalizeColdStartNarrativeDocument(input.document, userDisplayName);
    const actorDisplayNameMap = buildBootstrapActorDisplayNameMap(normalizedDocument, input.sourceBundle, userDisplayName);
    const selectedIds = new Set(input.selectedCandidates.map((candidate: ColdStartCandidate): string => candidate.id));

    for (const candidate of input.selectedCandidates.map((item: ColdStartCandidate): ColdStartCandidate => normalizeColdStartCandidate(item, userDisplayName))) {
        for (const actorKey of candidate.actorBindings ?? []) {
            await input.dependencies.ensureActorProfile({
                actorKey,
                displayName: resolveBootstrapActorDisplayName(actorKey, actorDisplayNameMap),
            });
        }
        const saved = await input.dependencies.saveEntry({
            entryType: candidate.entryType,
            title: candidate.title,
            summary: candidate.summary,
            detailPayload: candidate.detailPayload,
            tags: candidate.tags,
        });
        for (const actorKey of candidate.actorBindings ?? []) {
            await input.dependencies.bindRoleToEntry(actorKey, saved.entryId);
        }
    }

    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    const worldProfile = resolveBootstrapWorldProfile(normalizedDocument, input.sourceBundle);
    await input.dependencies.putWorldProfileBinding({
        primaryProfile: worldProfile.primaryProfile,
        secondaryProfiles: worldProfile.secondaryProfiles,
        confidence: worldProfile.confidence,
        reasonCodes: worldProfile.reasonCodes,
        detectedFrom: sourceTexts.slice(0, 24),
    });
    await input.dependencies.appendMutationHistory({
        action: 'world_profile_bound',
        payload: {
            primaryProfile: worldProfile.primaryProfile,
            secondaryProfiles: worldProfile.secondaryProfiles,
            confidence: worldProfile.confidence,
            reasonCodes: worldProfile.reasonCodes,
        },
    });
    await input.dependencies.appendMutationHistory({
        action: 'cold_start_succeeded',
        payload: {
            actorKey: normalizedDocument.identity.actorKey,
            userDisplayName,
            worldProfile,
            selectedCandidateCount: input.selectedCandidates.length,
            selectedCandidateIds: [...selectedIds],
            worldBaseCount: normalizedDocument.worldBase.length,
            relationshipCount: normalizedDocument.relationships.length,
            memoryRecordCount: normalizedDocument.memoryRecords.length,
            entityCardCount: countEntityCards(normalizedDocument.entityCards),
        },
    });
    return { worldProfile };
}

/**
 * 功能：构建冷启动 actorKey 提示。
 * @param sourceBundle 冷启动源数据。
 * @returns actorKey 提示。
 */
function buildBootstrapActorKeyHints(sourceBundle: ColdStartSourceBundle): {
    currentUser: {
        actorKey: string;
        displayName: string;
        note: string;
    };
} {
    const userDisplayName = resolveCurrentNarrativeUserName(sourceBundle.user.userName);
    return {
        currentUser: {
            actorKey: 'user',
            displayName: userDisplayName,
            note: `当关系对象是当前用户时，必须固定使用 actorKey \`user\`；自然语言称呼优先使用“${userDisplayName}”。`,
        },
    };
}

/**
 * 功能：构建角色显示名映射。
 * @param parsed 冷启动文档。
 * @param sourceBundle 冷启动源数据。
 * @param userDisplayName 当前用户显示名。
 * @returns 显示名映射。
 */
function buildBootstrapActorDisplayNameMap(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
    userDisplayName?: string,
): Map<string, string> {
    const displayNameMap = new Map<string, string>();
    displayNameMap.set(normalizeActorKey(parsed.identity.actorKey), String(parsed.identity.displayName ?? '').trim() || parsed.identity.actorKey);
    for (const actorCard of parsed.actorCards) {
        const actorKey = normalizeActorKey(actorCard.actorKey);
        const displayName = String(actorCard.displayName ?? '').trim();
        if (actorKey && displayName) {
            displayNameMap.set(actorKey, displayName);
        }
    }
    displayNameMap.set('user', resolveCurrentNarrativeUserName(userDisplayName || sourceBundle.user.userName));
    return displayNameMap;
}

/**
 * 功能：规范化冷启动文档中的自然语言用户称呼。
 * @param document 冷启动文档。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的文档。
 */
function normalizeColdStartNarrativeDocument(document: ColdStartDocument, userDisplayName: string): ColdStartDocument {
    return {
        ...document,
        identity: normalizeNarrativeValue(document.identity, userDisplayName),
        actorCards: document.actorCards.map((item) => normalizeNarrativeValue(item, userDisplayName)),
        entityCards: document.entityCards ? normalizeEntityCardsNarrative(document.entityCards, userDisplayName) : undefined,
        worldBase: document.worldBase.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
        relationships: document.relationships.map((entry) => ({
            ...entry,
            state: normalizeUserNarrativeText(entry.state, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
        memoryRecords: document.memoryRecords.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
    };
}

/**
 * 功能：规范化冷启动候选中的自然语言用户称呼。
 * @param candidate 冷启动候选。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的候选。
 */
function normalizeColdStartCandidate(candidate: ColdStartCandidate, userDisplayName: string): ColdStartCandidate {
    return {
        ...candidate,
        title: normalizeUserNarrativeText(candidate.title, userDisplayName),
        summary: normalizeUserNarrativeText(candidate.summary, userDisplayName),
        reason: normalizeUserNarrativeText(candidate.reason, userDisplayName),
        detailPayload: candidate.detailPayload ? normalizeNarrativeValue(candidate.detailPayload, userDisplayName) : undefined,
        sourceRefs: candidate.sourceRefs.map((item) => ({
            ...item,
            excerpt: item.excerpt ? normalizeUserNarrativeText(item.excerpt, userDisplayName) : item.excerpt,
        })),
    };
}

/**
 * 功能：校验关系引用的非用户角色是否都有角色卡。
 * @param parsed 冷启动文档。
 * @param sourceBundle 冷启动源数据。
 * @returns 校验结果。
 */
function validateRelationshipActorCards(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
): { ok: boolean; missingActorKeys: string[] } {
    const mainActorKey = normalizeActorKey(parsed.identity.actorKey);
    const actorCardKeys = new Set(
        parsed.actorCards
            .map((item): string => normalizeActorKey(item.actorKey))
            .filter(Boolean),
    );
    const requiredActorKeys = new Set<string>();

    for (const relation of parsed.relationships) {
        const normalizedRelation = normalizeBootstrapRelationship(relation, parsed.identity.actorKey, sourceBundle);
        for (const actorKey of collectRelationshipActorKeys(normalizedRelation)) {
            const normalizedActorKey = normalizeActorKey(actorKey);
            if (!normalizedActorKey || normalizedActorKey === 'user' || normalizedActorKey === mainActorKey) {
                continue;
            }
            requiredActorKeys.add(normalizedActorKey);
        }
    }

    const missingActorKeys = [...requiredActorKeys].filter((actorKey: string): boolean => !actorCardKeys.has(actorKey));
    return {
        ok: missingActorKeys.length === 0,
        missingActorKeys,
    };
}

/**
 * 功能：归一化冷启动关系中的角色键。
 * @param relation 原始关系。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据。
 * @returns 归一化后的关系。
 */
function normalizeBootstrapRelationship(
    relation: ColdStartDocument['relationships'][number],
    mainActorKey: string,
    sourceBundle: ColdStartSourceBundle,
): ColdStartDocument['relationships'][number] {
    const sourceActorKey = normalizeBootstrapActorKey(relation.sourceActorKey, mainActorKey, sourceBundle);
    const targetActorKey = normalizeBootstrapActorKey(relation.targetActorKey, mainActorKey, sourceBundle);
    return {
        ...relation,
        sourceActorKey,
        targetActorKey,
        participants: dedupeStrings([
            sourceActorKey,
            targetActorKey,
            ...relation.participants.map((actorKey: string): string => normalizeBootstrapActorKey(actorKey, mainActorKey, sourceBundle)),
        ]),
    };
}

/**
 * 功能：收集关系中的角色键。
 * @param relation 归一化后的关系。
 * @returns 角色键列表。
 */
function collectRelationshipActorKeys(relation: ColdStartDocument['relationships'][number]): string[] {
    return dedupeStrings([
        relation.sourceActorKey,
        relation.targetActorKey,
        ...relation.participants,
    ]);
}

/**
 * 功能：解析角色显示名。
 * @param actorKey 角色键。
 * @param displayNameMap 显示名映射。
 * @returns 显示名。
 */
function resolveBootstrapActorDisplayName(actorKey: string, displayNameMap: Map<string, string>): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    return displayNameMap.get(normalizedActorKey) || actorKey;
}

/**
 * 功能：归一化冷启动中的角色键。
 * @param actorKey 原始角色键。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据。
 * @returns 归一化后的角色键。
 */
function normalizeBootstrapActorKey(actorKey: string, mainActorKey: string, sourceBundle: ColdStartSourceBundle): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    const normalizedMainActorKey = normalizeActorKey(mainActorKey);
    if (!normalizedActorKey) {
        return '';
    }
    if (normalizedActorKey === normalizedMainActorKey) {
        return normalizedMainActorKey;
    }
    const normalizedUserName = normalizeActorKey(sourceBundle.user.userName);
    if (
        normalizedActorKey === 'user'
        || normalizedActorKey === normalizedUserName
        || normalizedActorKey === 'player'
        || normalizedActorKey === 'mc'
        || normalizedActorKey.startsWith('user_')
        || normalizedActorKey.startsWith('player_')
    ) {
        return 'user';
    }
    return normalizedActorKey;
}

/**
 * 功能：规范化角色键文本。
 * @param value 原始值。
 * @returns 角色键。
 */
function normalizeActorKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * 功能：收集冷启动来源文本。
 * @param sourceBundle 冷启动源数据。
 * @returns 来源文本列表。
 */
function collectBundleSourceTexts(sourceBundle: ColdStartSourceBundle): string[] {
    return dedupeStrings([
        sourceBundle.reason,
        sourceBundle.characterCard.name,
        sourceBundle.characterCard.description,
        sourceBundle.characterCard.personality,
        sourceBundle.characterCard.scenario,
        sourceBundle.characterCard.firstMessage,
        sourceBundle.characterCard.messageExample,
        sourceBundle.characterCard.creatorNotes,
        ...sourceBundle.characterCard.tags,
        sourceBundle.semantic.systemPrompt,
        sourceBundle.semantic.firstMessage,
        sourceBundle.semantic.authorNote,
        sourceBundle.semantic.jailbreak,
        sourceBundle.semantic.instruct,
        ...sourceBundle.semantic.activeLorebooks,
        sourceBundle.user.userName,
        sourceBundle.user.counterpartName,
        sourceBundle.user.personaDescription,
        sourceBundle.user.metadataPersona,
        sourceBundle.worldbooks.mainBook,
        ...sourceBundle.worldbooks.extraBooks,
        ...sourceBundle.worldbooks.activeBooks,
        ...sourceBundle.worldbooks.entries.map((entry): string => `${entry.entry} ${entry.content}`),
        ...sourceBundle.recentEvents,
    ]);
}

/**
 * 功能：规范化实体卡片中的自然语言用户称呼。
 * @param entityCards 实体卡片集合。
 * @param userDisplayName 用户显示名。
 * @returns 规范化后的实体卡片集合。
 */
function normalizeEntityCardsNarrative(
    entityCards: ColdStartDocument['entityCards'],
    userDisplayName: string,
): ColdStartDocument['entityCards'] {
    if (!entityCards) return undefined;
    const normalizeList = (list: NonNullable<ColdStartDocument['entityCards']>[keyof NonNullable<ColdStartDocument['entityCards']>] = []) => {
        return list.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        }));
    };
    return {
        organizations: normalizeList(entityCards.organizations),
        cities: normalizeList(entityCards.cities),
        nations: normalizeList(entityCards.nations),
        locations: normalizeList(entityCards.locations),
    };
}

/**
 * 功能：统计实体卡片总数。
 * @param entityCards 实体卡片集合。
 * @returns 总数。
 */
function countEntityCards(entityCards?: ColdStartDocument['entityCards']): number {
    if (!entityCards) return 0;
    return (entityCards.organizations?.length ?? 0)
        + (entityCards.cities?.length ?? 0)
        + (entityCards.nations?.length ?? 0)
        + (entityCards.locations?.length ?? 0);
}

/**
 * 功能：去重字符串数组。
 * @param values 原始数组。
 * @returns 去重后的数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
