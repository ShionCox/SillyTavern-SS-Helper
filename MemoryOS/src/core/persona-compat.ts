import type {
    ChatSemanticSeed,
    IdentitySeed,
    MemoryOSChatState,
    PersonaMemoryProfile,
    PersonaMemoryProfileMap,
    SimpleMemoryPersona,
    SimpleMemoryPersonaMap,
} from '../types';

import {
    DEFAULT_PERSONA_MEMORY_PROFILE,
    DEFAULT_SIMPLE_MEMORY_PERSONA,
} from '../types';

function normalizePersonaText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function normalizePersonaLookupKey(value: unknown): string {
    return normalizePersonaText(value).toLowerCase();
}

export function areEquivalentPersonaActorKeys(leftValue: unknown, rightValue: unknown): boolean {
    const left = normalizePersonaLookupKey(leftValue);
    const right = normalizePersonaLookupKey(rightValue);
    if (!left || !right) {
        return false;
    }
    return left === right || left.endsWith(`:${right}`) || right.endsWith(`:${left}`);
}

function getActorKeyPreferenceScore(value: string): number {
    const normalized = normalizePersonaLookupKey(value);
    if (!normalized) {
        return -1;
    }
    if (!normalized.includes(':')) {
        return 60;
    }
    if (normalized.startsWith('character:')) {
        return 50;
    }
    if (normalized.startsWith('assistant:')) {
        return 40;
    }
    if (normalized.startsWith('name:')) {
        return 30;
    }
    if (normalized.startsWith('role:')) {
        return 20;
    }
    if (normalized.startsWith('msg:')) {
        return 10;
    }
    return 25;
}

export function choosePreferredPersonaActorKey(...values: Array<string | null | undefined>): string {
    const candidates = values.map((value: string | null | undefined): string => normalizePersonaText(value)).filter(Boolean);
    if (candidates.length <= 0) {
        return '';
    }
    const uniqueCandidates: string[] = [];
    candidates.forEach((candidate: string): void => {
        const existingIndex = uniqueCandidates.findIndex((existing: string): boolean => areEquivalentPersonaActorKeys(existing, candidate));
        if (existingIndex >= 0) {
            uniqueCandidates[existingIndex] = [uniqueCandidates[existingIndex], candidate].sort((left: string, right: string): number => {
                const scoreDiff = getActorKeyPreferenceScore(right) - getActorKeyPreferenceScore(left);
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }
                return left.length - right.length || left.localeCompare(right, 'zh-CN');
            })[0] ?? uniqueCandidates[existingIndex];
            return;
        }
        uniqueCandidates.push(candidate);
    });
    return uniqueCandidates.sort((left: string, right: string): number => {
        const scoreDiff = getActorKeyPreferenceScore(right) - getActorKeyPreferenceScore(left);
        if (scoreDiff !== 0) {
            return scoreDiff;
        }
        return left.length - right.length || left.localeCompare(right, 'zh-CN');
    })[0] ?? '';
}

function normalizePersonaProfile(profile: PersonaMemoryProfile | null | undefined): PersonaMemoryProfile | null {
    if (!profile) {
        return null;
    }
    return {
        ...DEFAULT_PERSONA_MEMORY_PROFILE,
        ...profile,
        derivedFrom: Array.isArray(profile.derivedFrom) ? profile.derivedFrom.map((item: string): string => normalizePersonaText(item)).filter(Boolean) : [],
        updatedAt: Math.max(0, Number(profile.updatedAt ?? 0) || 0),
    };
}

function normalizeSimplePersona(profile: SimpleMemoryPersona | null | undefined): SimpleMemoryPersona | null {
    if (!profile) {
        return null;
    }
    return {
        ...DEFAULT_SIMPLE_MEMORY_PERSONA,
        ...profile,
        updatedAt: Math.max(0, Number(profile.updatedAt ?? 0) || 0),
    };
}

export function getPrimaryPersonaActorKey(state: MemoryOSChatState): string {
    const active = normalizePersonaText(state.activeActorKey);
    if (active) {
        return active;
    }
    const seedRoleKey = normalizePersonaText(state.semanticSeed?.identitySeed?.roleKey);
    if (seedRoleKey) {
        return seedRoleKey;
    }
    const laneActorKey = Array.isArray(state.groupMemory?.lanes)
        ? state.groupMemory!.lanes.map((lane): string => normalizePersonaText(lane.actorKey)).find(Boolean) ?? ''
        : '';
    if (laneActorKey) {
        return laneActorKey;
    }
    return Object.keys(state.personaMemoryProfiles ?? {}).map((key: string): string => normalizePersonaText(key)).find(Boolean) ?? '';
}

export function normalizeIdentitySeedMap(seed: ChatSemanticSeed | null | undefined): Record<string, IdentitySeed> {
    const result: Record<string, IdentitySeed> = {};
    const appendSeed = (actorKey: string, value: IdentitySeed | null | undefined): void => {
        const rawActorKey = normalizePersonaText(actorKey || value?.roleKey);
        const matchedExistingKey = Object.keys(result).find((existing: string): boolean => areEquivalentPersonaActorKeys(existing, rawActorKey)) ?? '';
        const normalizedActorKey = choosePreferredPersonaActorKey(rawActorKey, matchedExistingKey);
        if (!normalizedActorKey || !value) {
            return;
        }
        if (matchedExistingKey && matchedExistingKey !== normalizedActorKey) {
            delete result[matchedExistingKey];
        }
        result[normalizedActorKey] = {
            ...value,
            roleKey: normalizedActorKey,
            displayName: normalizePersonaText(value.displayName) || normalizedActorKey,
            aliases: Array.isArray(value.aliases) ? value.aliases.map((item: string): string => normalizePersonaText(item)).filter(Boolean) : [],
            identity: Array.isArray(value.identity) ? value.identity.map((item: string): string => normalizePersonaText(item)).filter(Boolean) : [],
            alignment: normalizePersonaText(value.alignment) || undefined,
            catchphrases: Array.isArray(value.catchphrases) ? value.catchphrases.map((item: string): string => normalizePersonaText(item)).filter(Boolean) : [],
            relationshipAnchors: Array.isArray(value.relationshipAnchors) ? value.relationshipAnchors.map((item: string): string => normalizePersonaText(item)).filter(Boolean) : [],
            sourceTrace: Array.isArray(value.sourceTrace) ? value.sourceTrace : [],
        };
    };

    appendSeed(seed?.identitySeed?.roleKey ?? '', seed?.identitySeed);
    Object.entries(seed?.identitySeeds ?? {}).forEach(([actorKey, value]: [string, IdentitySeed]): void => appendSeed(actorKey, value));
    return result;
}

export function normalizePersonaProfileMap(state: MemoryOSChatState): PersonaMemoryProfileMap {
    const result: PersonaMemoryProfileMap = {};
    Object.entries(state.personaMemoryProfiles ?? {}).forEach(([actorKey, profile]: [string, PersonaMemoryProfile]): void => {
        const matchedExistingKey = Object.keys(result).find((existing: string): boolean => areEquivalentPersonaActorKeys(existing, actorKey)) ?? '';
        const normalizedActorKey = choosePreferredPersonaActorKey(actorKey, matchedExistingKey);
        const normalizedProfile = normalizePersonaProfile(profile);
        if (!normalizedActorKey || !normalizedProfile) {
            return;
        }
        const existingProfile = result[normalizedActorKey] ?? (matchedExistingKey ? result[matchedExistingKey] : undefined);
        if (matchedExistingKey && matchedExistingKey !== normalizedActorKey) {
            delete result[matchedExistingKey];
        }
        result[normalizedActorKey] = existingProfile && Number(existingProfile.updatedAt ?? 0) > Number(normalizedProfile.updatedAt ?? 0)
            ? existingProfile
            : normalizedProfile;
    });
    return result;
}

export function normalizeSimplePersonaMap(state: MemoryOSChatState): SimpleMemoryPersonaMap {
    const result: SimpleMemoryPersonaMap = {};
    Object.entries(state.simpleMemoryPersonas ?? {}).forEach(([actorKey, profile]: [string, SimpleMemoryPersona]): void => {
        const matchedExistingKey = Object.keys(result).find((existing: string): boolean => areEquivalentPersonaActorKeys(existing, actorKey)) ?? '';
        const normalizedActorKey = choosePreferredPersonaActorKey(actorKey, matchedExistingKey);
        const normalizedProfile = normalizeSimplePersona(profile);
        if (!normalizedActorKey || !normalizedProfile) {
            return;
        }
        const existingProfile = result[normalizedActorKey] ?? (matchedExistingKey ? result[matchedExistingKey] : undefined);
        if (matchedExistingKey && matchedExistingKey !== normalizedActorKey) {
            delete result[matchedExistingKey];
        }
        result[normalizedActorKey] = existingProfile && Number(existingProfile.updatedAt ?? 0) > Number(normalizedProfile.updatedAt ?? 0)
            ? existingProfile
            : normalizedProfile;
    });
    return result;
}

export function resolvePersonaProfile(state: MemoryOSChatState, actorKey?: string | null): PersonaMemoryProfile | null {
    const map = normalizePersonaProfileMap(state);
    const normalizedActorKey = normalizePersonaText(actorKey);
    if (normalizedActorKey && map[normalizedActorKey]) {
        return map[normalizedActorKey];
    }
    const primaryActorKey = getPrimaryPersonaActorKey(state);
    if (primaryActorKey && map[primaryActorKey]) {
        return map[primaryActorKey];
    }
    return null;
}

export function resolveSimplePersona(state: MemoryOSChatState, actorKey?: string | null): SimpleMemoryPersona | null {
    const map = normalizeSimplePersonaMap(state);
    const normalizedActorKey = normalizePersonaText(actorKey);
    if (normalizedActorKey && map[normalizedActorKey]) {
        return map[normalizedActorKey];
    }
    const primaryActorKey = getPrimaryPersonaActorKey(state);
    if (primaryActorKey && map[primaryActorKey]) {
        return map[primaryActorKey];
    }
    return null;
}
