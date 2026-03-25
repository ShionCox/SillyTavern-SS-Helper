import type { ChatStateManager } from '../core/chat-state-manager';
import { clamp01 } from '../core/memory-intelligence';
import type {
    MemoryLifecycleState,
    MemoryTuningProfile,
    PersonaMemoryProfile,
    RelationshipState,
    RoleProfile,
} from '../types';

/**
 * 功能：描述本轮注入前需要准备的召回上下文。
 * 参数：无。
 * 返回：召回上下文对象。
 */
export interface PreparedRecallContext {
    activeActorKey: string | null;
    personaProfile: PersonaMemoryProfile | null;
    personaProfiles: Record<string, PersonaMemoryProfile>;
    lifecycleMap: Map<string, MemoryLifecycleState>;
    relationships: RelationshipState[];
    fallbackRelationshipWeight: number;
    tuningProfile: MemoryTuningProfile | null;
    roleProfiles: Record<string, RoleProfile>;
    recallQuery: string;
    recallQueryTerms: string[];
}

/**
 * 功能：规范化参与检索的文本片段，便于去重与拼接。
 * 参数：
 *   value：原始文本值。
 * 返回：
 *   string：去除多余空白后的文本。
 */
function normalizeActorKey(actorKey: string | null | undefined): string {
    return String(actorKey ?? '').trim().toLowerCase();
}

/**
 * 功能：按关系权重计算关系条目的优先级分值。
 * 参数：
 *   item：关系状态条目。
 * 返回：
 *   number：归一化后的关系权重分值。
 */
function readRelationshipWeight(item: RelationshipState): number {
    return clamp01(
        item.familiarity * 0.14
        + item.trust * 0.22
        + item.affection * 0.22
        + item.respect * 0.14
        + item.dependency * 0.12
        + item.unresolvedConflict * 0.16,
    );
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function dedupeTerms(terms: string[]): string[] {
    return Array.from(new Set(terms.map((item: string): string => normalizeText(item)).filter(Boolean)));
}

/**
 * 功能：从角色画像里提取展示名与别名，用于确定性扩展检索词。
 * 参数：
 *   personaProfiles：全部角色画像映射。
 * 返回：
 *   string[]：展示名与别名词项。
 */
function collectPersonaAliasTerms(personaProfiles: Record<string, PersonaMemoryProfile>): string[] {
    const terms: string[] = [];
    Object.values(personaProfiles ?? {}).forEach((profile: PersonaMemoryProfile): void => {
        const aliases = (profile as PersonaMemoryProfile & {
            displayName?: string;
            aliases?: string[];
        }) ?? {};
        terms.push(normalizeText(aliases.displayName));
        (Array.isArray(aliases.aliases) ? aliases.aliases : []).forEach((alias: string): void => {
            terms.push(normalizeText(alias));
        });
    });
    return dedupeTerms(terms);
}

/**
 * 功能：从关系状态提取参与角色词项，用于确定性扩展检索词。
 * 参数：
 *   relationships：关系状态列表。
 * 返回：
 *   string[]：参与角色词项。
 */
function collectParticipantActorTerms(relationships: RelationshipState[]): string[] {
    const terms: string[] = [];
    (Array.isArray(relationships) ? relationships : []).forEach((item: RelationshipState): void => {
        terms.push(normalizeText(item.actorKey));
        terms.push(normalizeText(item.targetKey));
        (Array.isArray(item.participantKeys) ? item.participantKeys : []).forEach((actorKey: string): void => {
            terms.push(normalizeText(actorKey));
        });
    });
    return dedupeTerms(terms);
}

/**
 * 功能：根据注入意图提供稳定的 lane 术语提示。
 * 参数：
 *   query：原始查询文本。
 * 返回：
 *   string[]：lane 术语词项。
 */
function collectLaneTerms(query: string): string[] {
    const normalizedQuery = normalizeText(query).toLowerCase();
    const terms = ['identity', 'rule', 'relationship', 'event', 'state'];
    if (/设定|规则|世界观|背景|条款|约束|lore|rule/.test(normalizedQuery)) {
        terms.push('setting', 'world', 'lorebook');
    }
    if (/关系|羁绊|互动|态度|relationship/.test(normalizedQuery)) {
        terms.push('bond', 'emotion_imprint');
    }
    if (/事件|经过|发生|回顾|剧情|event/.test(normalizedQuery)) {
        terms.push('timeline', 'scene');
    }
    if (/状态|当前|近况|冲突|state/.test(normalizedQuery)) {
        terms.push('current_scene', 'current_conflict');
    }
    return dedupeTerms(terms);
}

/**
 * 功能：构建确定性的召回扩展 query 与词项集合。
 * 参数：
 *   query：原始查询文本。
 *   activeActorKey：当前活跃角色键。
 *   relationships：关系状态列表。
 *   personaProfiles：角色画像映射。
 * 返回：
 *   { recallQuery: string; recallQueryTerms: string[] }：扩展后的 query 及词项。
 */
function buildDeterministicRecallQuery(
    query: string,
    activeActorKey: string | null,
    relationships: RelationshipState[],
    personaProfiles: Record<string, PersonaMemoryProfile>,
): {
    recallQuery: string;
    recallQueryTerms: string[];
} {
    const baseQuery = normalizeText(query);
    const terms = dedupeTerms([
        baseQuery,
        normalizeText(activeActorKey),
        ...collectParticipantActorTerms(relationships),
        ...collectPersonaAliasTerms(personaProfiles),
        ...collectLaneTerms(baseQuery),
    ]);
    return {
        recallQuery: terms.join(' '),
        recallQueryTerms: terms,
    };
}

/**
 * 功能：准备本轮召回所需的角色、生命周期与关系上下文。
 * 参数：
 *   chatStateManager：聊天状态管理器。
 *   query：本轮查询文本。
 * 返回：准备完成的召回上下文。
 */
export async function buildPreparedRecallContext(
    chatStateManager: ChatStateManager | null,
    query: string,
): Promise<PreparedRecallContext> {
    const baseContext: PreparedRecallContext = {
        activeActorKey: null,
        personaProfile: null,
        personaProfiles: {},
        lifecycleMap: new Map<string, MemoryLifecycleState>(),
        relationships: [],
        fallbackRelationshipWeight: 0,
        tuningProfile: null,
        roleProfiles: {},
        recallQuery: String(query ?? ''),
        recallQueryTerms: dedupeTerms([String(query ?? '')]),
    };
    if (!chatStateManager) {
        return baseContext;
    }

    const activeActorKey = await chatStateManager.getActiveActorKey();
    const personaProfile = await chatStateManager.getPersonaMemoryProfile();
    const personaProfiles = await chatStateManager.getPersonaMemoryProfiles();
    const tuningProfile = await chatStateManager.getMemoryTuningProfile();
    const roleProfiles = await chatStateManager.getRoleProfiles();
    const lifecycleSummary = await chatStateManager.getMemoryLifecycleSummary(240);
    const lifecycleMap = new Map(
        lifecycleSummary.map((item: MemoryLifecycleState): [string, MemoryLifecycleState] => [item.recordKey, item]),
    );
    const relationships = await chatStateManager.getRelationshipState();
    relationships.sort((left: RelationshipState, right: RelationshipState): number => readRelationshipWeight(right) - readRelationshipWeight(left));
    const preferredRelationship = relationships.find((item: RelationshipState): boolean => item.scope === 'self_target') ?? relationships[0] ?? null;
    const fallbackRelationshipWeight = preferredRelationship ? readRelationshipWeight(preferredRelationship) : 0;
    const expandedQuery = buildDeterministicRecallQuery(
        query,
        normalizeActorKey(activeActorKey) || null,
        relationships,
        personaProfiles,
    );

    return {
        activeActorKey: normalizeActorKey(activeActorKey) || null,
        personaProfile,
        personaProfiles,
        lifecycleMap,
        relationships,
        fallbackRelationshipWeight,
        tuningProfile,
        roleProfiles,
        recallQuery: expandedQuery.recallQuery,
        recallQueryTerms: expandedQuery.recallQueryTerms,
    };
}
