import type { MemoryEntry } from '../types';
import { loadPromptPackSections } from '../memory-prompts/prompt-loader';
import { buildStructuredTaskUserPayload } from '../memory-prompts/prompt-renderer';
import type { MemoryLLMApi } from '../memory-summary';
import type { ColdStartDocument, ColdStartSourceBundle } from './bootstrap-types';
import { parseColdStartDocument } from './bootstrap-parser';
import { resolveBootstrapWorldProfile } from './bootstrap-world-profile';

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
        return { ok: false, reasonCode: 'llm_unavailable' };
    }
    const promptPack = await loadPromptPackSections();
    const coldStartSchema = parseJsonSection(promptPack.COLD_START_SCHEMA);
    const coldStartOutputSample = parseJsonSection(promptPack.COLD_START_OUTPUT_SAMPLE);
    const sourcePayload = {
        sourceBundle: input.sourceBundle,
        actorKeyHints,
    };
    const userPayload = buildStructuredTaskUserPayload(
        JSON.stringify(sourcePayload, null, 2),
        JSON.stringify(coldStartSchema ?? {}, null, 2),
        JSON.stringify(coldStartOutputSample ?? {}, null, 2),
    );
    const result = await input.llm.runTask<ColdStartDocument>({
        consumer: input.pluginId,
        taskId: 'memory_cold_start',
        taskKind: 'generation',
        input: {
            messages: [
                { role: 'system', content: `${promptPack.COLD_START_SYSTEM}\n\n${coldStartLanguageInstruction}` },
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
        return { ok: false, reasonCode };
    }
    const parsed = parseColdStartDocument(result.data);
    if (!parsed) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: { reasonCode: 'invalid_cold_start_document' },
        });
        return { ok: false, reasonCode: 'invalid_cold_start_document' };
    }
    const actorDisplayNameMap = buildBootstrapActorDisplayNameMap(parsed, input.sourceBundle);
    const actorCardValidation = validateRelationshipActorCards(parsed, input.sourceBundle);
    if (!actorCardValidation.ok) {
        await input.dependencies.appendMutationHistory({
            action: 'cold_start_failed',
            payload: {
                reasonCode: 'relationship_actor_card_missing',
                missingActorKeys: actorCardValidation.missingActorKeys,
            },
        });
        return { ok: false, reasonCode: 'relationship_actor_card_missing' };
    }
    await input.dependencies.ensureActorProfile({
        actorKey: parsed.identity.actorKey,
        displayName: resolveBootstrapActorDisplayName(parsed.identity.actorKey, actorDisplayNameMap),
    });
    await saveColdStartActorProfile(input.dependencies, {
        actorKey: parsed.identity.actorKey,
        displayName: parsed.identity.displayName || parsed.identity.actorKey,
        aliases: parsed.identity.aliases,
        identityFacts: parsed.identity.identityFacts,
        originFacts: parsed.identity.originFacts,
        traits: parsed.identity.traits,
    });
    for (const actorCard of parsed.actorCards) {
        const normalizedActorKey = normalizeActorKey(actorCard.actorKey);
        if (!normalizedActorKey || normalizedActorKey === 'user' || normalizedActorKey === normalizeActorKey(parsed.identity.actorKey)) {
            continue;
        }
        await input.dependencies.ensureActorProfile({
            actorKey: actorCard.actorKey,
            displayName: resolveBootstrapActorDisplayName(actorCard.actorKey, actorDisplayNameMap),
        });
        await saveColdStartActorProfile(input.dependencies, actorCard);
    }

    for (const worldEntry of parsed.worldBase) {
        await input.dependencies.saveEntry({
            entryType: normalizeWorldBaseType(worldEntry.schemaId),
            title: worldEntry.title,
            summary: worldEntry.summary,
            detailPayload: {
                scope: worldEntry.scope,
            },
            tags: ['cold_start', 'world_base'],
        });
    }
    for (const relation of parsed.relationships) {
        const normalizedRelation = normalizeBootstrapRelationship(relation, parsed.identity.actorKey, input.sourceBundle);
        const relationActorKeys = collectRelationshipActorKeys(normalizedRelation);
        for (const actorKey of relationActorKeys) {
            await input.dependencies.ensureActorProfile({
                actorKey,
                displayName: resolveBootstrapActorDisplayName(actorKey, actorDisplayNameMap),
            });
        }
        const relationEntry = await input.dependencies.saveEntry({
            entryType: 'relationship',
            title: `${normalizedRelation.sourceActorKey} -> ${normalizedRelation.targetActorKey}`,
            summary: normalizedRelation.summary,
            detailPayload: {
                sourceActorKey: normalizedRelation.sourceActorKey,
                targetActorKey: normalizedRelation.targetActorKey,
                participants: dedupeStrings(normalizedRelation.participants),
                state: normalizedRelation.state,
                trust: normalizedRelation.trust,
                affection: normalizedRelation.affection,
                tension: normalizedRelation.tension,
            },
            tags: ['cold_start', 'relationship'],
        });
        for (const actorKey of relationActorKeys) {
            await input.dependencies.bindRoleToEntry(actorKey, relationEntry.entryId);
        }
    }
    for (const memoryRecord of parsed.memoryRecords) {
        const saved = await input.dependencies.saveEntry({
            entryType: memoryRecord.schemaId,
            title: memoryRecord.title,
            summary: memoryRecord.summary,
            detailPayload: {
                importance: memoryRecord.importance,
            },
            tags: ['cold_start'],
        });
        await input.dependencies.bindRoleToEntry(parsed.identity.actorKey, saved.entryId);
    }
    const worldProfile = resolveBootstrapWorldProfile(parsed, input.sourceBundle);
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
            actorKey: parsed.identity.actorKey,
            worldProfile,
            worldBaseCount: parsed.worldBase.length,
            relationshipCount: parsed.relationships.length,
            memoryRecordCount: parsed.memoryRecords.length,
        },
    });
    return {
        ok: true,
        reasonCode: 'ok',
        worldProfile,
    };
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
    return {
        currentUser: {
            actorKey: 'user',
            displayName: String(sourceBundle.user.userName ?? '').trim() || '用户',
            note: '当关系对象是当前用户时，必须固定使用 actorKey `user`，不要自行扩展成 user_xxx、player_xxx 或其它变体。',
        },
    };
}

/**
 * 功能：构建冷启动阶段的角色显示名映射。
 * @param parsed 冷启动解析结果。
 * @param sourceBundle 冷启动源数据包。
 * @returns 角色键到显示名的映射表。
 */
function buildBootstrapActorDisplayNameMap(parsed: ColdStartDocument, sourceBundle: ColdStartSourceBundle): Map<string, string> {
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
    const userDisplayName = String(sourceBundle.user.userName ?? '').trim() || '用户';
    displayNameMap.set('user', userDisplayName);
    return displayNameMap;
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
