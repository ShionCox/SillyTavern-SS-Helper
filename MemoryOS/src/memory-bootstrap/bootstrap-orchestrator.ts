import type { MemoryEntry } from '../types';
import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload, renderPromptTemplate } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';
import type { ColdStartCandidate, ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { parseColdStartDocument } from './bootstrap-parser';
import { buildColdStartCandidates } from './bootstrap-candidates';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';
import {
    normalizeNarrativeValue,
    normalizeUserNarrativeText,
    resolveCurrentNarrativeUserName,
} from '../utils/narrative-user-name';

/**
 * 功能：冷启动编排依赖。
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
 * 功能：冷启动编排输入。
 */
export interface RunBootstrapOrchestratorInput {
    dependencies: BootstrapOrchestratorDependencies;
    llm: MemoryLLMApi | null;
    pluginId: string;
    sourceBundle: ColdStartSourceBundle;
}

/**
 * 功能：冷启动编排结果。
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
    const coldStartLanguageInstruction = '除 schemaId、actorKey、sourceActorKey、targetActorKey、reasonCodes 等标识字段外，所有自然语言字段必须使用简体中文。';
    const userDisplayName = resolveCurrentNarrativeUserName(input.sourceBundle.user.userName);
    const sourceTexts = collectBundleSourceTexts(input.sourceBundle);
    const actorKeyHints = buildBootstrapActorKeyHints(input.sourceBundle);
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
    const promptPack = await loadPromptPackSections();
    const coldStartSchema = parseJsonSection(promptPack.COLD_START_SCHEMA);
    const coldStartOutputSample = parseJsonSection(promptPack.COLD_START_OUTPUT_SAMPLE);
    const sourcePayload = {
        sourceBundle: input.sourceBundle,
        actorKeyHints,
        userDisplayName,
    };
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(sourcePayload, null, 2),
        JSON.stringify(coldStartSchema ?? {}, null, 2),
        JSON.stringify(coldStartOutputSample ?? {}, null, 2),
    );
    const result = await input.llm.runTask<ColdStartDocument>({
        consumer: input.pluginId,
        taskId: 'memory_cold_start',
        taskDescription: '冷启动处理',
        taskKind: 'generation',
        input: {
            messages: [
                {
                    role: 'system',
                    content: `${renderPromptTemplate(promptPack.COLD_START_SYSTEM, { userDisplayName })}\n\n当前用户自然语言称呼固定为“${userDisplayName}”。请继续使用结构化锚点 \`user\`，但所有自然语言描述都必须优先写成该称呼；拿不到名字时使用“你”。\n\n${coldStartLanguageInstruction}`,
                },
                { role: 'user', content: userPayload },
            ],
        },
        schema: coldStartSchema,
        enqueue: { displayMode: 'fullscreen' },
    });
    if (!result.ok) {
        const reasonCode = result.reasonCode || 'cold_start_failed';
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode },
        });
        return {
            ok: false,
            reasonCode,
            errorMessage: String(result.error ?? '').trim() || undefined,
        };
    }
    const parsed = parseColdStartDocument(result.data);
    if (!parsed) {
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
    const normalizedDocument = normalizeColdStartNarrativeDocument(parsed, userDisplayName);
    const candidates = buildColdStartCandidates(normalizedDocument, input.sourceBundle);
    if (candidates.length <= 0) {
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
    const actorDisplayNameMap = buildBootstrapActorDisplayNameMap(normalizedDocument, input.sourceBundle, userDisplayName);
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
    const worldProfile = resolveBootstrapWorldProfile(normalizedDocument, input.sourceBundle);
    return {
        ok: true,
        reasonCode: 'ok',
        candidates,
        document: normalizedDocument,
        worldProfile,
    };
}

/**
 * 功能：确认并应用冷启动候选到记忆库。
 * @param dependencies 编排依赖。
 * @param document 冷启动原始文档。
 * @param sourceBundle 冷启动源数据包。
 * @param selectedCandidates 已选候选。
 * @returns 世界模板结果。
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
    for (const candidate of input.selectedCandidates.map((candidate: ColdStartCandidate): ColdStartCandidate => normalizeColdStartCandidate(candidate, userDisplayName))) {
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
            actorKey: input.document.identity.actorKey,
            userDisplayName,
            worldProfile,
            selectedCandidateCount: input.selectedCandidates.length,
            selectedCandidateIds: [...selectedIds],
            worldBaseCount: input.document.worldBase.length,
            relationshipCount: input.document.relationships.length,
            memoryRecordCount: input.document.memoryRecords.length,
            entityCardCount: countEntityCards(input.document.entityCards),
        },
    });
    return { worldProfile };
}

/**
 * 功能：归一化世界基础条目类型。
 * @param schemaId 原始 schemaId。
 * @returns 可落库 entryType。
 */
function normalizeWorldBaseType(schemaId: string): string {
    const normalized = String(schemaId ?? '').trim().toLowerCase();
    if (normalized === 'world_core_setting' || normalized === 'world_hard_rule' || normalized === 'world_global_state') {
        return normalized;
    }
    return 'world_global_state';
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
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

/**
 * 功能：构建冷启动可复用的角色键提示，约束模型不要发明用户侧键名。
 * @param sourceBundle 冷启动源数据包。
 * @returns 可注入到提示词上下文中的角色键提示。
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
            note: `当关系对象是当前用户时，必须固定使用 actorKey \`user\`；自然语言称呼优先使用“${userDisplayName}”，不要写成“用户”或“主角”。`,
        },
    };
}

/**
 * 功能：构建冷启动阶段的角色显示名映射。
 * @param parsed 冷启动解析结果。
 * @param sourceBundle 冷启动源数据包。
 * @returns 角色键到显示名的映射表。
 */
function buildBootstrapActorDisplayNameMap(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
    userDisplayName?: string,
): Map<string, string> {
    const displayNameMap = new Map<string, string>();
    const mainActorKey = normalizeActorKey(parsed.identity.actorKey);
    const mainDisplayName = String(parsed.identity.displayName ?? '').trim();
    if (mainActorKey && mainDisplayName) {
        displayNameMap.set(mainActorKey, mainDisplayName);
    }
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
 * @param userDisplayName 当前用户显示名。
 * @returns 规范化后的文档。
 */
function normalizeColdStartNarrativeDocument(document: ColdStartDocument, userDisplayName: string): ColdStartDocument {
    return {
        ...document,
        identity: normalizeNarrativeValue(document.identity, userDisplayName),
        actorCards: document.actorCards.map((actorCard) => normalizeNarrativeValue(actorCard, userDisplayName)),
        entityCards: document.entityCards ? normalizeEntityCardsNarrative(document.entityCards, userDisplayName) : undefined,
        worldBase: document.worldBase.map((entry) => ({
            ...entry,
            title: normalizeUserNarrativeText(entry.title, userDisplayName),
            summary: normalizeUserNarrativeText(entry.summary, userDisplayName),
        })),
        relationships: document.relationships.map((relationship) => ({
            ...relationship,
            state: normalizeUserNarrativeText(relationship.state, userDisplayName),
            summary: normalizeUserNarrativeText(relationship.summary, userDisplayName),
        })),
        memoryRecords: document.memoryRecords.map((record) => ({
            ...record,
            title: normalizeUserNarrativeText(record.title, userDisplayName),
            summary: normalizeUserNarrativeText(record.summary, userDisplayName),
        })),
    };
}

/**
 * 功能：规范化冷启动候选中的自然语言用户称呼。
 * @param candidate 冷启动候选。
 * @param userDisplayName 当前用户显示名。
 * @returns 规范化后的候选。
 */
function normalizeColdStartCandidate(candidate: ColdStartCandidate, userDisplayName: string): ColdStartCandidate {
    return {
        ...candidate,
        title: normalizeUserNarrativeText(candidate.title, userDisplayName),
        summary: normalizeUserNarrativeText(candidate.summary, userDisplayName),
        reason: normalizeUserNarrativeText(candidate.reason, userDisplayName),
        detailPayload: candidate.detailPayload ? normalizeNarrativeValue(candidate.detailPayload, userDisplayName) : undefined,
        sourceRefs: candidate.sourceRefs.map((sourceRef) => ({
            ...sourceRef,
            excerpt: sourceRef.excerpt ? normalizeUserNarrativeText(sourceRef.excerpt, userDisplayName) : sourceRef.excerpt,
        })),
    };
}

/**
 * 功能：校验关系网中的非用户角色是否都带有角色卡。
 * @param parsed 冷启动文档。
 * @param sourceBundle 冷启动源数据包。
 * @returns 校验结果。
 */
function validateRelationshipActorCards(
    parsed: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
): { ok: boolean; missingActorKeys: string[] } {
    const mainActorKey = normalizeActorKey(parsed.identity.actorKey);
    const actorCardKeys = new Set(
        parsed.actorCards
            .map((actorCard): string => normalizeActorKey(actorCard.actorKey))
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

    const missingActorKeys = Array.from(requiredActorKeys).filter((actorKey: string): boolean => !actorCardKeys.has(actorKey));
    return {
        ok: missingActorKeys.length === 0,
        missingActorKeys,
    };
}

/**
 * 功能：保存冷启动角色卡并绑定到对应角色。
 * @param dependencies 编排依赖。
 * @param actorCard 角色卡数据。
 * @returns 角色卡条目。
 */
async function saveColdStartActorProfile(
    dependencies: BootstrapOrchestratorDependencies,
    actorCard: {
        actorKey: string;
        displayName: string;
        aliases: string[];
        identityFacts: string[];
        originFacts: string[];
        traits: string[];
    },
): Promise<MemoryEntry> {
    const summaryParts = dedupeStrings([
        ...actorCard.identityFacts,
        ...actorCard.originFacts,
        ...actorCard.traits,
    ]);
    const savedEntry = await dependencies.saveEntry({
        entryType: 'actor_profile',
        title: actorCard.displayName || actorCard.actorKey,
        summary: summaryParts.length > 0 ? summaryParts.join('；') : `${actorCard.displayName}的角色卡信息。`,
        detailPayload: {
            fields: {
                aliases: dedupeStrings(actorCard.aliases),
                identityFacts: dedupeStrings(actorCard.identityFacts),
                originFacts: dedupeStrings(actorCard.originFacts),
                traits: dedupeStrings(actorCard.traits),
            },
        },
        tags: ['cold_start', 'actor_profile'],
    });
    await dependencies.bindRoleToEntry(actorCard.actorKey, savedEntry.entryId);
    return savedEntry;
}

/**
 * 功能：统一冷启动关系中的角色键，优先收敛到系统约定键名。
 * @param relation 原始关系条目。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据包。
 * @returns 归一化后的关系条目。
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
 * 功能：收集关系条目涉及的全部角色键。
 * @param relation 归一化后的关系条目。
 * @returns 去重后的角色键列表。
 */
function collectRelationshipActorKeys(relation: ColdStartDocument['relationships'][number]): string[] {
    return dedupeStrings([
        relation.sourceActorKey,
        relation.targetActorKey,
        ...relation.participants,
    ]);
}

/**
 * 功能：按角色键解析冷启动阶段应展示的角色名。
 * @param actorKey 角色键。
 * @param displayNameMap 显示名映射。
 * @returns 可用于建档的显示名。
 */
function resolveBootstrapActorDisplayName(actorKey: string, displayNameMap: Map<string, string>): string {
    const normalizedActorKey = normalizeActorKey(actorKey);
    return displayNameMap.get(normalizedActorKey) || actorKey;
}

/**
 * 功能：归一化冷启动中的角色键，并把用户侧别名收敛到固定 `user`。
 * @param actorKey 原始角色键。
 * @param mainActorKey 主角色键。
 * @param sourceBundle 冷启动源数据包。
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
 * 功能：按统一规则归一化角色键文本。
 * @param value 原始值。
 * @returns 归一化后的角色键。
 */
function normalizeActorKey(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * 功能：从结构化冷启动输入中展开可用于追踪的文本切片。
 * @param sourceBundle 冷启动源数据包。
 * @returns 去重后的文本列表。
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
 * 功能：从 section 文本解析 JSON。
 * @param section section 文本。
 * @returns 解析结果。
 */
function parseJsonSection(section: string): unknown {
    const source = String(section ?? '').trim();
    if (!source) {
        return null;
    }
    const fenced = source.match(/```json[\s\S]*?```/i);
    const jsonText = fenced
        ? fenced[0].replace(/```json/i, '').replace(/```/g, '').trim()
        : source;
    try {
        return JSON.parse(jsonText);
    } catch {
        return null;
    }
}

/**
 * 功能：规范化冷启动实体卡集合中的自然语言用户称呼。
 * @param entityCards 实体卡集合。
 * @param userDisplayName 当前用户显示名。
 * @returns 规范化后的实体卡集合。
 */
function normalizeEntityCardsNarrative(
    entityCards: ColdStartDocument['entityCards'],
    userDisplayName: string,
): ColdStartDocument['entityCards'] {
    if (!entityCards) return undefined;
    const normalizeList = (list?: ColdStartDocument['entityCards'] extends infer T ? T extends { organizations?: infer U } ? U : never : never) => {
        if (!Array.isArray(list)) return [];
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
 * 功能：统计实体卡总数。
 * @param entityCards 实体卡集合。
 * @returns 总数。
 */
function countEntityCards(entityCards?: ColdStartDocument['entityCards']): number {
    if (!entityCards) return 0;
    return (entityCards.organizations?.length ?? 0)
        + (entityCards.cities?.length ?? 0)
        + (entityCards.nations?.length ?? 0)
        + (entityCards.locations?.length ?? 0);
}
