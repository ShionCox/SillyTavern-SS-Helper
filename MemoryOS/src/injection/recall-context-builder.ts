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
}

function normalizeActorKey(actorKey: string | null | undefined): string {
    return String(actorKey ?? '').trim().toLowerCase();
}

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

    return {
        activeActorKey: normalizeActorKey(activeActorKey) || null,
        personaProfile,
        personaProfiles,
        lifecycleMap,
        relationships,
        fallbackRelationshipWeight,
        tuningProfile,
        roleProfiles,
        recallQuery: String(query ?? ''),
    };
}
