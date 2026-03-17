import type {
    ChatProfile,
    ChatSemanticSeed,
    EncodingScore,
    GroupMemoryState,
    IdentitySeed,
    InjectedMemoryTone,
    MemoryCandidate,
    MemoryCandidateKind,
    MemoryDecayStage,
    MemoryLayer,
    MemoryLifecycleState,
    MemorySourceScope,
    MemorySubtype,
    MemoryTuningProfile,
    MemoryType,
    RelationshipState,
    SimpleMemoryPersona,
    PersonaMemoryProfile,
} from '../types';
import {
    DEFAULT_PERSONA_MEMORY_PROFILE,
    DEFAULT_SIMPLE_MEMORY_PERSONA,
} from '../types';
import {
    areEquivalentPersonaActorKeys,
    choosePreferredPersonaActorKey,
} from './persona-compat';

export interface MemoryCandidateInput {
    candidateId: string;
    kind: MemoryCandidateKind;
    source: string;
    summary: string;
    payload: Record<string, unknown>;
    extractedAt: number;
    sourceEventId?: string;
}

export interface RecallScoreInput {
    text: string;
    keywords: string[];
    confidence: number;
    recencyScore: number;
    lifecycle: MemoryLifecycleState | null;
    profile: PersonaMemoryProfile;
    relationshipWeight: number;
    emotionWeight: number;
    continuityWeight: number;
    privacyPenalty: number;
    conflictPenalty: number;
    tuning?: MemoryTuningProfile | null;
}

export interface RecallScoreResult {
    score: number;
    tone: InjectedMemoryTone;
    reasonCodes: string[];
}

export interface OwnedMemoryInferenceInput {
    recordKey: string;
    recordKind: MemoryLifecycleState['recordKind'];
    title?: string;
    text?: string;
    path?: string;
    factType?: string;
    entityKind?: string;
    entityId?: string;
    keywords?: string[];
    value?: unknown;
    fallbackOwnerActorKey?: string | null;
    current?: Partial<MemoryLifecycleState>;
}

/**
 * 功能：把数值压到 0-1 区间。
 * 参数：
 *   value：原始值。
 * 返回：
 *   number：裁剪后的结果。
 */
export function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}

/**
 * 功能：归一化文本，便于做启发式判断。
 * 参数：
 *   value：原始值。
 * 返回：
 *   string：清洗后的文本。
 */
export function normalizeMemoryText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：从聊天画像与冷启动种子推导角色记忆画像。
 * 参数：
 *   seed：冷启动种子。
 *   profile：聊天画像。
 *   groupMemory：群聊记忆。
 * 返回：
 *   PersonaMemoryProfile：推导出的画像。
 */
export function inferPersonaMemoryProfile(
    seed: ChatSemanticSeed | null,
    profile: ChatProfile,
    groupMemory: GroupMemoryState | null,
    actorKey?: string | null,
): PersonaMemoryProfile {
    const normalizedActorKey: string = normalizeMemoryText(actorKey);
    const selectedIdentitySeed: IdentitySeed | null = (() => {
        const identitySeeds = seed?.identitySeeds ?? {};
        if (normalizedActorKey && identitySeeds[normalizedActorKey]) {
            return identitySeeds[normalizedActorKey];
        }
        if (normalizedActorKey && normalizeMemoryText(seed?.identitySeed?.roleKey) === normalizedActorKey) {
            return seed?.identitySeed ?? null;
        }
        return seed?.identitySeed ?? null;
    })();
    const selectedLane = Array.isArray(groupMemory?.lanes)
        ? groupMemory!.lanes.find((lane) => normalizeMemoryText(lane.actorKey) === normalizedActorKey)
        : undefined;
    const styleMode: string = normalizeMemoryText(seed?.styleSeed?.mode);
    const groupSize: number = Array.isArray(seed?.groupMembers) ? seed!.groupMembers.length : 0;
    const relationAnchors: number = Array.isArray(selectedIdentitySeed?.relationshipAnchors)
        ? selectedIdentitySeed!.relationshipAnchors.length
        : 0;
    const emotionalLaneCount: number = selectedLane
        ? (normalizeMemoryText(selectedLane.lastEmotion) ? 1 : 0)
        : Array.isArray(groupMemory?.lanes)
            ? groupMemory!.lanes.filter((lane) => normalizeMemoryText(lane.lastEmotion)).length
            : 0;
    const identityDensity: number = Array.isArray(selectedIdentitySeed?.identity) ? selectedIdentitySeed!.identity.length : 0;
    const catchphraseCount: number = Array.isArray(selectedIdentitySeed?.catchphrases) ? selectedIdentitySeed!.catchphrases.length : 0;
    const relationshipDeltaSignal: number = normalizeMemoryText(selectedLane?.relationshipDelta) ? 1 : 0;
    const goalSignal: number = normalizeMemoryText(selectedLane?.recentGoal) ? 1 : 0;

    const totalCapacity: number = profile.memoryStrength === 'high'
        ? 0.84
        : profile.memoryStrength === 'low'
            ? 0.36
            : 0.62;
    const eventMemoryBase: number = styleMode === 'narrative' || profile.stylePreference === 'story'
        ? 0.8
        : styleMode === 'rp' || profile.stylePreference === 'trpg'
            ? 0.74
            : 0.52;
    const factMemoryBase: number = styleMode === 'setting_qa' || profile.chatType === 'worldbook'
        ? 0.88
        : profile.chatType === 'tool'
            ? 0.76
            : 0.62;
    const emotionalBias: number = clamp01(
        (profile.stylePreference === 'story' || profile.stylePreference === 'trpg' ? 0.62 : 0.38)
        + (groupSize > 1 ? 0.08 : 0)
        + Math.min(0.16, emotionalLaneCount * 0.03),
    );
    const relationshipSensitivity: number = clamp01(
        (profile.extractStrategy === 'facts_only' ? 0.28 : 0.58)
        + Math.min(0.18, relationAnchors * 0.03)
        + (groupSize > 1 ? 0.1 : 0),
    );
    const forgettingSpeed: number = clamp01(
        profile.memoryStrength === 'high'
            ? 0.26
            : profile.memoryStrength === 'low'
                ? 0.72
                : 0.46,
    );
    const distortionTendency: number = clamp01(
        (profile.memoryStrength === 'low' ? 0.5 : 0.18)
        + (profile.stylePreference === 'story' ? 0.08 : 0)
        + (profile.chatType === 'tool' || profile.chatType === 'worldbook' ? -0.08 : 0),
    );
    const selfNarrativeBias: number = clamp01(
        profile.stylePreference === 'story'
            ? 0.72
            : profile.stylePreference === 'trpg'
                ? 0.58
                : 0.34,
    );
    const privacyGuard: number = clamp01(
        profile.chatType === 'tool'
            ? 0.74
            : profile.chatType === 'worldbook'
                ? 0.58
                : groupSize > 1
                    ? 0.52
                    : 0.42,
    );
    const actorAdjustedProfile: PersonaMemoryProfile = {
        ...DEFAULT_PERSONA_MEMORY_PROFILE,
        profileVersion: 'persona.v2',
        totalCapacity: clamp01(totalCapacity + Math.min(0.12, identityDensity * 0.03) + (goalSignal ? 0.04 : 0)),
        eventMemory: clamp01(eventMemoryBase + (groupSize > 1 ? 0.06 : 0) + (relationshipDeltaSignal ? 0.04 : 0)),
        factMemory: clamp01(factMemoryBase + (relationAnchors > 0 ? 0.04 : 0) + Math.min(0.08, catchphraseCount * 0.02)),
        emotionalBias: clamp01(emotionalBias + (normalizeMemoryText(selectedLane?.lastEmotion) && normalizeMemoryText(selectedLane?.lastEmotion) !== 'neutral' ? 0.06 : 0)),
        relationshipSensitivity: clamp01(relationshipSensitivity + (relationshipDeltaSignal ? 0.08 : 0)),
        forgettingSpeed: clamp01(forgettingSpeed - Math.min(0.08, relationAnchors * 0.02) + (normalizedActorKey && !selectedIdentitySeed ? 0.04 : 0)),
        distortionTendency: clamp01(distortionTendency + (selectedLane?.lastStyle === 'narrative' ? 0.04 : 0)),
        selfNarrativeBias: clamp01(selfNarrativeBias + (identityDensity > 0 ? 0.04 : 0)),
        privacyGuard: clamp01(privacyGuard + (normalizeMemoryText(selectedIdentitySeed?.alignment) ? 0.02 : 0)),
        allowDistortion: distortionTendency >= 0.55 && profile.chatType !== 'tool' && profile.chatType !== 'worldbook',
        derivedFrom: [
            seed ? 'semantic_seed' : '',
            normalizedActorKey ? `actor:${normalizedActorKey}` : 'actor:primary',
            selectedIdentitySeed ? 'identity_seed' : 'fallback_identity_seed',
            selectedLane ? 'group_lane' : '',
            profile.chatType ? `chat_type:${profile.chatType}` : '',
            profile.stylePreference ? `style:${profile.stylePreference}` : '',
            groupSize > 1 ? 'group_bias' : '',
        ].filter(Boolean),
        updatedAt: Date.now(),
    };

    return actorAdjustedProfile;
}

export function inferPersonaMemoryProfiles(
    seed: ChatSemanticSeed | null,
    profile: ChatProfile,
    groupMemory: GroupMemoryState | null,
): Record<string, PersonaMemoryProfile> {
    const actorKeys: string[] = [];
    const collectActorKey = (value: unknown): void => {
        const normalizedActorKey = normalizeMemoryText(value);
        if (!normalizedActorKey) {
            return;
        }
        const existingIndex = actorKeys.findIndex((actorKey: string): boolean => areEquivalentPersonaActorKeys(actorKey, normalizedActorKey));
        if (existingIndex >= 0) {
            actorKeys[existingIndex] = choosePreferredPersonaActorKey(actorKeys[existingIndex], normalizedActorKey);
            return;
        }
        actorKeys.push(normalizedActorKey);
    };

    collectActorKey(seed?.identitySeed?.roleKey);
    Object.keys(seed?.identitySeeds ?? {}).forEach((actorKey: string): void => {
        collectActorKey(actorKey);
    });
    (groupMemory?.lanes ?? []).forEach((lane): void => {
        collectActorKey(lane.actorKey);
    });
    if (actorKeys.length <= 0) {
        const fallbackProfile = inferPersonaMemoryProfile(seed, profile, groupMemory, null);
        return { primary: fallbackProfile };
    }
    return actorKeys.reduce<Record<string, PersonaMemoryProfile>>((result, actorKey: string): Record<string, PersonaMemoryProfile> => {
        result[actorKey] = inferPersonaMemoryProfile(seed, profile, groupMemory, actorKey);
        return result;
    }, {});
}

/**
 * 功能：把复杂画像压缩成设置页友好的标签。
 * 参数：
 *   profile：完整画像。
 * 返回：
 *   SimpleMemoryPersona：简化画像。
 */
export function buildSimpleMemoryPersona(profile: PersonaMemoryProfile): SimpleMemoryPersona {
    const mapLevel = (value: number, low: number, high: number): 'low' | 'medium' | 'high' => {
        if (value >= high) {
            return 'high';
        }
        if (value <= low) {
            return 'low';
        }
        return 'medium';
    };
    const memoryStrength: 'weak' | 'balanced' | 'strong' = profile.totalCapacity >= 0.75
        ? 'strong'
        : profile.totalCapacity <= 0.42
            ? 'weak'
            : 'balanced';
    const emotionalMemory: 'low' | 'medium' | 'high' = mapLevel(profile.emotionalBias, 0.36, 0.66);
    const relationshipFocus: 'low' | 'medium' | 'high' = mapLevel(profile.relationshipSensitivity, 0.36, 0.66);
    const forgettingRate: 'slow' | 'medium' | 'fast' = profile.forgettingSpeed >= 0.62
        ? 'fast'
        : profile.forgettingSpeed <= 0.34
            ? 'slow'
            : 'medium';
    const distortionRisk: 'low' | 'medium' | 'high' = mapLevel(profile.distortionTendency, 0.26, 0.56);
    return {
        ...DEFAULT_SIMPLE_MEMORY_PERSONA,
        memoryStrength,
        emotionalMemory,
        relationshipFocus,
        forgettingRate,
        distortionRisk,
        updatedAt: Date.now(),
    };
}

/**
 * 功能：识别文本中的情绪标签。
 * 参数：
 *   text：原始文本。
 * 返回：
 *   string：情绪标签。
 */
export function detectEmotionTag(text: string): string {
    const normalized: string = normalizeMemoryText(text);
    if (/生气|愤怒|恼火|敌意|暴怒/.test(normalized)) {
        return 'anger';
    }
    if (/开心|高兴|喜悦|兴奋|幸福/.test(normalized)) {
        return 'joy';
    }
    if (/悲伤|难过|失落|哭/.test(normalized)) {
        return 'sadness';
    }
    if (/害怕|担心|恐惧|紧张/.test(normalized)) {
        return 'fear';
    }
    if (/喜欢|爱|亲近|信任|依赖/.test(normalized)) {
        return 'attachment';
    }
    return '';
}

/**
 * 功能：识别文本中的关系作用域。
 * 参数：
 *   text：原始文本。
 * 返回：
 *   string：关系作用域标签。
 */
export function detectRelationScope(text: string): string {
    const normalized: string = normalizeMemoryText(text);
    if (/恋人|爱人|喜欢|亲密|暧昧/.test(normalized)) {
        return 'intimacy';
    }
    if (/敌人|冲突|对立|仇|争执|背叛/.test(normalized)) {
        return 'conflict';
    }
    if (/朋友|同伴|队友|盟友|伙伴/.test(normalized)) {
        return 'companion';
    }
    if (/信任|依赖|尊重|服从|承诺/.test(normalized)) {
        return 'trust';
    }
    return '';
}

/**
 * 功能：根据画像为候选记忆打分，并决定是否写入。
 * 参数：
 *   input：候选输入。
 *   profile：角色记忆画像。
 * 返回：
 *   EncodingScore：编码评分结果。
 */
export function scoreMemoryCandidate(
    input: MemoryCandidateInput,
    profile: PersonaMemoryProfile,
    tuning: MemoryTuningProfile | null = null,
): EncodingScore {
    const text: string = normalizeMemoryText(`${input.summary} ${JSON.stringify(input.payload ?? {})}`);
    const relationSignal: number = detectRelationScope(text) ? 1 : 0;
    const emotionSignal: number = detectEmotionTag(text) ? 1 : 0;
    const identitySignal: number = /identity|profile|persona|trait|名字|身份|性格|设定/.test(text) ? 1 : 0;
    const worldSignal: number = /world|setting|rule|history|地点|规则|世界观|背景/.test(text) ? 1 : 0;
    const privacySignal: number = /secret|private|隐私|秘密|不能说|不想提/.test(text) ? 1 : 0;
    const eventSignal: number = input.kind === 'summary' || /昨天|刚才|随后|这次|上一幕|scene|event|发生/.test(text) ? 1 : 0;
    const lengthSignal: number = clamp01(text.length / 220);
    const baseConfidence: number = clamp01(Number((input.payload.confidence as number | undefined) ?? 0.58));

    let targetLayer: MemoryLayer = 'working';
    if (identitySignal > 0) {
        targetLayer = 'core_identity';
    } else if (worldSignal > 0 || input.kind === 'fact' || input.kind === 'relationship') {
        targetLayer = 'semantic';
    } else if (eventSignal > 0 || input.kind === 'summary' || input.kind === 'state') {
        targetLayer = 'episodic';
    }

    const targetThreshold: Record<MemoryLayer, number> = {
        working: 0.58,
        episodic: 0.42,
        semantic: 0.46,
        core_identity: 0.52,
    };
    const layerBoost: number = targetLayer === 'core_identity'
        ? profile.factMemory * 0.24
        : targetLayer === 'semantic'
            ? profile.factMemory * 0.18
            : profile.eventMemory * 0.18;
    const totalScore: number = clamp01(
        0.22 * baseConfidence
        + 0.14 * lengthSignal
        + layerBoost
        + relationSignal * profile.relationshipSensitivity * 0.2
        + emotionSignal * profile.emotionalBias * 0.18
        + identitySignal * 0.12
        + worldSignal * 0.08
        - privacySignal * profile.privacyGuard * 0.18,
    );
    const accepted: boolean = totalScore >= applyCandidateThresholdBias(targetThreshold[targetLayer], tuning);
    const reasonCodes: string[] = [];
    if (targetLayer === 'core_identity') {
        reasonCodes.push('identity_memory');
    } else if (targetLayer === 'semantic') {
        reasonCodes.push('semantic_memory');
    } else if (targetLayer === 'episodic') {
        reasonCodes.push('episodic_memory');
    } else {
        reasonCodes.push('working_memory');
    }
    if (relationSignal > 0) {
        reasonCodes.push('relation_signal');
    }
    if (emotionSignal > 0) {
        reasonCodes.push('emotion_signal');
    }
    if (privacySignal > 0) {
        reasonCodes.push('privacy_penalty');
    }
    if (!accepted) {
        reasonCodes.push('below_threshold');
    }

    return {
        totalScore,
        accepted,
        targetLayer,
        salience: clamp01(totalScore * 0.9 + relationSignal * 0.1 + emotionSignal * 0.08),
        strength: clamp01(totalScore * 0.65 + (1 - profile.forgettingSpeed) * 0.35),
        decayStage: 'clear',
        emotionTag: detectEmotionTag(text),
        relationScope: detectRelationScope(text),
        reasonCodes,
        profileVersion: profile.profileVersion,
    };
}

/**
 * 功能：将调参偏置限制在安全范围内。
 * @param value 原始偏置值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 裁剪后的偏置值。
 */
function clampBias(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(min, Math.min(max, value));
}

/**
 * 功能：把输入候选扩展成完整候选结构。
 * 参数：
 *   input：原始候选。
 *   profile：角色记忆画像。
 * 返回：
 *   MemoryCandidate：带评分的候选。
 */
export function buildScoredMemoryCandidate(
    input: MemoryCandidateInput,
    profile: PersonaMemoryProfile,
    tuning: MemoryTuningProfile | null = null,
): MemoryCandidate {
    return {
        ...input,
        conflictWith: [],
        encoding: scoreMemoryCandidate(input, profile, tuning),
    };
}

function inferMemorySubtypeFromText(input: OwnedMemoryInferenceInput): MemorySubtype {
    const text: string = normalizeMemoryText([
        input.recordKey,
        input.title,
        input.text,
        input.path,
        input.factType,
        Array.isArray(input.keywords) ? input.keywords.join(' ') : '',
        typeof input.value === 'string' ? input.value : JSON.stringify(input.value ?? ''),
    ].join(' ')).toLowerCase();
    const path: string = normalizeMemoryText(input.path).toLowerCase();

    if (/identity|persona|profile|名字|身份|角色设定/.test(text)) return 'identity';
    if (/trait|性格|特征|习惯/.test(text)) return 'trait';
    if (/preference|喜好|偏好|讨厌|口味/.test(text)) return 'preference';
    if (/bond|关系|好感|信任|亲密|敌意|背叛/.test(text)) return 'bond';
    if (/emotion|情绪|伤心|开心|愤怒|害怕|创伤/.test(text)) return 'emotion_imprint';
    if (/goal|目标|计划|任务|想要/.test(text)) return 'goal';
    if (/promise|约定|誓言|承诺/.test(text)) return 'promise';
    if (/secret|隐私|秘密|不能说/.test(text)) return 'secret';
    if (/rumor|流言|谣言|道听途说/.test(text)) return 'rumor';
    if (/major|关键|重大|转折|决战|真相|plot/.test(text)) return 'major_plot_event';
    if (/combat|战斗|交战|战场/.test(text)) return 'combat_event';
    if (/travel|旅途|出发|抵达|赶路/.test(text)) return 'travel_event';
    if (/conversation|对话|交谈|聊天/.test(text)) return 'conversation_event';
    if (/history|历史|过去|往事|起源/.test(text)) return 'world_history';
    if (/scene|场景|现场/.test(text) || /scene/.test(path)) return 'current_scene';
    if (/conflict|冲突|对立|矛盾/.test(text) || /conflict/.test(path)) return 'current_conflict';
    if (/status|状态|受伤|中毒|冷却|临时/.test(text) || /status/.test(path)) return 'temporary_status';
    if (/city/.test(path) || /城市|城规|城内/.test(text)) return 'city_rule';
    if (/faction/.test(path) || /派系|阵营|组织/.test(text)) return 'faction_rule';
    if (/item/.test(path) || /物品|道具|遗物|装备/.test(text)) return 'item_rule';
    if (/rule|constraint|规则|设定|限制/.test(text)) return 'global_rule';
    if (/location|地点|区域|房间|地标/.test(text) || /location/.test(path)) return 'location_fact';
    if (input.recordKind === 'summary') return 'minor_event';
    if (input.recordKind === 'state') return 'location_fact';
    return 'other';
}

function inferMemoryTypeFromSubtype(subtype: MemorySubtype): MemoryType {
    if (['identity', 'trait', 'preference', 'promise', 'secret'].includes(subtype)) return 'identity';
    if (['bond', 'emotion_imprint'].includes(subtype)) return 'relationship';
    if (['goal', 'current_scene', 'current_conflict', 'temporary_status'].includes(subtype)) return 'status';
    if (['major_plot_event', 'minor_event', 'combat_event', 'travel_event', 'conversation_event', 'rumor'].includes(subtype)) return 'event';
    if (['global_rule', 'city_rule', 'location_fact', 'item_rule', 'faction_rule', 'world_history'].includes(subtype)) return 'world';
    return 'other';
}

function inferSourceScope(memoryType: MemoryType, ownerActorKey: string | null, subtype: MemorySubtype, relationScope: string): MemorySourceScope {
    if (memoryType === 'world') {
        return 'world';
    }
    if (memoryType === 'relationship' || subtype === 'bond' || relationScope) {
        return ownerActorKey ? 'target' : 'group';
    }
    if (ownerActorKey) {
        return 'self';
    }
    if (memoryType === 'event') {
        return 'group';
    }
    return 'system';
}

function inferImportance(memoryType: MemoryType, subtype: MemorySubtype, salience: number, strength: number, rehearsalCount: number): number {
    let base: number = salience * 0.52 + strength * 0.3 + Math.min(0.12, rehearsalCount * 0.02);
    if (subtype === 'major_plot_event' || subtype === 'identity' || subtype === 'global_rule') {
        base += 0.18;
    } else if (subtype === 'bond' || subtype === 'emotion_imprint' || subtype === 'goal') {
        base += 0.12;
    } else if (subtype === 'minor_event' || subtype === 'temporary_status' || subtype === 'rumor') {
        base -= 0.08;
    }
    if (memoryType === 'world') {
        base += 0.08;
    }
    return clamp01(base);
}

function getSubtypeForgettingBase(subtype: MemorySubtype): number {
    switch (subtype) {
        case 'identity':
        case 'global_rule':
            return 0.04;
        case 'trait':
        case 'city_rule':
        case 'world_history':
            return 0.08;
        case 'bond':
        case 'emotion_imprint':
        case 'goal':
        case 'promise':
            return 0.18;
        case 'major_plot_event':
            return 0.16;
        case 'conversation_event':
            return 0.28;
        case 'combat_event':
        case 'travel_event':
            return 0.34;
        case 'minor_event':
        case 'temporary_status':
            return 0.46;
        case 'rumor':
            return 0.58;
        default:
            return 0.32;
    }
}

function getSubtypeAgeWindowDays(subtype: MemorySubtype): number {
    switch (subtype) {
        case 'identity':
        case 'global_rule':
        case 'world_history':
            return 180;
        case 'trait':
        case 'bond':
        case 'emotion_imprint':
        case 'goal':
        case 'promise':
            return 90;
        case 'major_plot_event':
            return 60;
        case 'conversation_event':
            return 21;
        case 'combat_event':
        case 'travel_event':
            return 28;
        case 'minor_event':
        case 'temporary_status':
            return 10;
        case 'rumor':
            return 7;
        default:
            return 30;
    }
}

export function enrichLifecycleOwnedState(
    lifecycle: MemoryLifecycleState,
    input: OwnedMemoryInferenceInput,
    profile: PersonaMemoryProfile,
    now: number = Date.now(),
): MemoryLifecycleState {
    const inferredSubtype: MemorySubtype = input.current?.memorySubtype ?? lifecycle.memorySubtype ?? inferMemorySubtypeFromText(input);
    const inferredType: MemoryType = input.current?.memoryType ?? lifecycle.memoryType ?? inferMemoryTypeFromSubtype(inferredSubtype);
    const ownerActorKey: string | null = input.current?.ownerActorKey !== undefined
        ? (input.current.ownerActorKey == null ? null : normalizeMemoryText(input.current.ownerActorKey))
        : normalizeMemoryText(input.entityKind) === 'character'
            ? normalizeMemoryText(input.entityId)
            : normalizeMemoryText(input.fallbackOwnerActorKey) || null;
    const relationScope: string = normalizeMemoryText(lifecycle.relationScope || input.current?.relationScope);
    const sourceScope: MemorySourceScope = input.current?.sourceScope
        ?? lifecycle.sourceScope
        ?? inferSourceScope(inferredType, ownerActorKey, inferredSubtype, relationScope);
    const importance: number = clamp01(Number(
        input.current?.importance
        ?? lifecycle.importance
        ?? inferImportance(inferredType, inferredSubtype, lifecycle.salience, lifecycle.strength, lifecycle.rehearsalCount),
    ));
    const referenceTs: number = Math.max(Number(lifecycle.updatedAt ?? 0), Number(lifecycle.lastRecalledAt ?? 0));
    const ageDays: number = referenceTs > 0 ? Math.max(0, (now - referenceTs) / (1000 * 60 * 60 * 24)) : 999;
    const ageFactor: number = clamp01(ageDays / getSubtypeAgeWindowDays(inferredSubtype));
    const baseForget: number = getSubtypeForgettingBase(inferredSubtype);
    const stagePenalty: number = lifecycle.stage === 'distorted' ? 0.22 : lifecycle.stage === 'blur' ? 0.1 : 0;
    const rehearsalProtection: number = Math.min(0.24, lifecycle.rehearsalCount * 0.035);
    const relationProtection: number = inferredType === 'relationship' ? profile.relationshipSensitivity * 0.16 : 0;
    const emotionProtection: number = lifecycle.emotionTag ? profile.emotionalBias * 0.12 : 0;
    const knowledgeProtection: number = inferredType === 'world' || inferredType === 'identity'
        ? profile.factMemory * 0.16
        : inferredType === 'event'
            ? profile.eventMemory * 0.12
            : 0;
    const reinforcementProtection: number = Math.min(0.18, (input.current?.reinforcedByEventIds?.length ?? lifecycle.reinforcedByEventIds?.length ?? 0) * 0.06);
    const invalidationPenalty: number = Math.min(0.24, (input.current?.invalidatedByEventIds?.length ?? lifecycle.invalidatedByEventIds?.length ?? 0) * 0.08);
    const forgetProbability: number = clamp01(
        baseForget
        + ageFactor * 0.34
        + profile.forgettingSpeed * 0.24
        + stagePenalty
        + invalidationPenalty
        - importance * 0.22
        - lifecycle.strength * 0.16
        - lifecycle.salience * 0.12
        - rehearsalProtection
        - relationProtection
        - emotionProtection
        - knowledgeProtection
        - reinforcementProtection,
    );
    const previouslyForgotten: boolean = input.current?.forgotten === true || lifecycle.forgotten === true;
    const canRecover: boolean = previouslyForgotten && lifecycle.stage === 'clear' && lifecycle.rehearsalCount > 0 && forgetProbability < 0.55;
    const forgotten: boolean = canRecover
        ? false
        : previouslyForgotten
            ? true
            : forgetProbability >= 0.86 || (forgetProbability >= 0.72 && lifecycle.stage === 'distorted' && ageFactor >= 0.8);
    const forgottenReasonCodes: string[] = forgotten
        ? [
            forgetProbability >= 0.86 ? 'forget_probability_high' : '',
            lifecycle.stage === 'distorted' ? 'lifecycle_distorted' : lifecycle.stage === 'blur' ? 'lifecycle_blur' : '',
            ageFactor >= 0.8 ? 'age_decay_high' : '',
            ['minor_event', 'temporary_status', 'rumor'].includes(inferredSubtype) ? `subtype_${inferredSubtype}` : '',
        ].filter(Boolean)
        : [];
    return {
        ...lifecycle,
        ownerActorKey,
        memoryType: inferredType,
        memorySubtype: inferredSubtype,
        sourceScope,
        importance,
        forgetProbability,
        forgotten,
        forgottenAt: forgotten ? (input.current?.forgottenAt ?? lifecycle.forgottenAt ?? now) : undefined,
        forgottenReasonCodes,
        lastForgetRollAt: now,
        reinforcedByEventIds: Array.isArray(input.current?.reinforcedByEventIds)
            ? input.current!.reinforcedByEventIds!
            : Array.isArray(lifecycle.reinforcedByEventIds)
                ? lifecycle.reinforcedByEventIds
                : [],
        invalidatedByEventIds: Array.isArray(input.current?.invalidatedByEventIds)
            ? input.current!.invalidatedByEventIds!
            : Array.isArray(lifecycle.invalidatedByEventIds)
                ? lifecycle.invalidatedByEventIds
                : [],
    };
}

/**
 * 功能：根据保留强度和时间推导生命周期阶段。
 * 参数：
 *   recordKey：记录键。
 *   recordKind：记录类型。
 *   salience：显著性。
 *   strength：强度。
 *   profile：角色画像。
 *   updatedAt：更新时间。
 *   rehearsalCount：复述次数。
 *   lastRecalledAt：上次召回时间。
 *   emotionTag：情绪标签。
 *   relationScope：关系作用域。
 * 返回：
 *   MemoryLifecycleState：生命周期状态。
 */
export function buildLifecycleState(
    recordKey: string,
    recordKind: MemoryLifecycleState['recordKind'],
    salience: number,
    strength: number,
    profile: PersonaMemoryProfile,
    updatedAt: number,
    rehearsalCount: number,
    lastRecalledAt: number,
    emotionTag: string,
    relationScope: string,
): MemoryLifecycleState {
    const now: number = Date.now();
    const referenceTs: number = Math.max(Number(updatedAt ?? 0), Number(lastRecalledAt ?? 0));
    const ageDays: number = referenceTs > 0 ? Math.max(0, (now - referenceTs) / (1000 * 60 * 60 * 24)) : 999;
    const blurThreshold: number = 5 + (1 - profile.forgettingSpeed) * 16 + rehearsalCount * 3;
    const distortedThreshold: number = blurThreshold + 6 + salience * 5 + strength * 4;
    const stage: MemoryDecayStage = ageDays >= distortedThreshold
        ? 'distorted'
        : ageDays >= blurThreshold
            ? 'blur'
            : 'clear';
    const distortionRisk: number = clamp01(
        profile.distortionTendency * 0.6
        + (stage === 'distorted' ? 0.3 : stage === 'blur' ? 0.14 : 0)
        + (1 - strength) * 0.12
        - Math.min(0.2, rehearsalCount * 0.03),
    );
    return {
        recordKey,
        recordKind,
        stage,
        ownerActorKey: null,
        memoryType: 'other',
        memorySubtype: 'other',
        sourceScope: 'system',
        importance: clamp01(salience),
        forgetProbability: 0,
        forgotten: false,
        forgottenAt: undefined,
        forgottenReasonCodes: [],
        lastForgetRollAt: 0,
        reinforcedByEventIds: [],
        invalidatedByEventIds: [],
        strength: clamp01(strength),
        salience: clamp01(salience),
        rehearsalCount: Math.max(0, Math.round(Number(rehearsalCount ?? 0))),
        lastRecalledAt: Math.max(0, Number(lastRecalledAt ?? 0)),
        distortionRisk,
        emotionTag: normalizeMemoryText(emotionTag),
        relationScope: normalizeMemoryText(relationScope),
        updatedAt: Math.max(0, Number(updatedAt ?? now)),
    };
}

/**
 * 功能：把生命周期阶段映射为注入语气。
 * 参数：
 *   lifecycle：生命周期状态。
 *   profile：角色画像。
 * 返回：
 *   InjectedMemoryTone：注入语气。
 */
export function resolveInjectedMemoryTone(
    lifecycle: MemoryLifecycleState | null,
    profile: PersonaMemoryProfile,
): InjectedMemoryTone {
    if (!lifecycle) {
        return 'stable_fact';
    }
    if (lifecycle.stage === 'distorted' && profile.allowDistortion) {
        return 'possible_misremember';
    }
    if (lifecycle.stage === 'blur') {
        return 'blurred_recall';
    }
    if (lifecycle.stage === 'clear') {
        return 'clear_recall';
    }
    return 'stable_fact';
}

/**
 * 功能：给召回候选打综合分。
 * 参数：
 *   input：召回评分输入。
 * 返回：
 *   RecallScoreResult：召回评分结果。
 */
export function scoreRecallCandidate(input: RecallScoreInput): RecallScoreResult {
    const normalizedText: string = normalizeMemoryText(input.text).toLowerCase();
    const keywordHits: number = input.keywords.reduce((sum: number, keyword: string): number => {
        const normalizedKeyword: string = normalizeMemoryText(keyword).toLowerCase();
        if (!normalizedKeyword) {
            return sum;
        }
        return normalizedText.includes(normalizedKeyword) ? sum + 1 : sum;
    }, 0);
    const tuning: MemoryTuningProfile | null = input.tuning ?? null;
    const relationshipBias: number = clamp01(Number(tuning?.recallRelationshipBias ?? 1));
    const emotionBias: number = clamp01(Number(tuning?.recallEmotionBias ?? 1));
    const recencyBias: number = clamp01(Number(tuning?.recallRecencyBias ?? 1));
    const continuityBias: number = clamp01(Number(tuning?.recallContinuityBias ?? 1));
    const distortionProtectionBias: number = clamp01(Number(tuning?.distortionProtectionBias ?? 1));
    const lifecyclePenalty: number = input.lifecycle?.stage === 'distorted'
        ? 0.24
        : input.lifecycle?.stage === 'blur'
            ? 0.1
            : 0;
    const relationBonus: number = input.relationshipWeight * relationshipBias * input.profile.relationshipSensitivity * 0.18;
    const emotionBonus: number = input.emotionWeight * emotionBias * input.profile.emotionalBias * 0.16;
    const continuityBonus: number = input.continuityWeight * continuityBias * 0.14;
    const keywordBonus: number = Math.min(0.32, keywordHits * 0.08);
    const score: number = clamp01(
        input.confidence * 0.2
        + input.recencyScore * recencyBias * 0.16
        + keywordBonus
        + relationBonus
        + emotionBonus
        + continuityBonus
        - lifecyclePenalty * distortionProtectionBias
        - input.privacyPenalty * input.profile.privacyGuard * 0.12
        - input.conflictPenalty * distortionProtectionBias * 0.18,
    );
    const reasonCodes: string[] = [];
    if (keywordHits > 0) {
        reasonCodes.push('keyword_hit');
    }
    if (relationBonus > 0.05) {
        reasonCodes.push('relation_match');
    }
    if (emotionBonus > 0.05) {
        reasonCodes.push('emotion_match');
    }
    if (continuityBonus > 0.05) {
        reasonCodes.push('topic_continuity');
    }
    if (lifecyclePenalty > 0) {
        reasonCodes.push(`lifecycle_${input.lifecycle?.stage ?? 'unknown'}`);
    }
    if (input.conflictPenalty > 0) {
        reasonCodes.push('conflict_penalty');
    }
    return {
        score,
        tone: resolveInjectedMemoryTone(input.lifecycle, input.profile),
        reasonCodes,
    };
}

/**
 * 功能：根据关系状态估算关系权重。
 * 参数：
 *   state：关系状态。
 * 返回：
 *   number：关系权重。
 */
export function computeRelationshipWeight(state: RelationshipState | null): number {
    if (!state) {
        return 0;
    }
    return clamp01(
        state.familiarity * 0.14
        + state.trust * 0.22
        + state.affection * 0.22
        + state.respect * 0.14
        + state.dependency * 0.12
        + state.unresolvedConflict * 0.16,
    );
}

/**
 * 功能：基于基础阈值和调参偏置，计算最终候选接受阈值。
 * @param baseThreshold 基础阈值。
 * @param tuning 调参画像。
 * @returns 调整后的阈值。
 */
export function applyCandidateThresholdBias(baseThreshold: number, tuning: MemoryTuningProfile | null): number {
    return clamp01(baseThreshold + clampBias(Number(tuning?.candidateAcceptThresholdBias ?? 0), -0.2, 0.2));
}
