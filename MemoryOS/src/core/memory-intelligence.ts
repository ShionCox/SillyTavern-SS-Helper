import type {
    ChatProfile,
    ChatSemanticSeed,
    EncodingScore,
    GroupMemoryState,
    InjectedMemoryTone,
    MemoryCandidate,
    MemoryCandidateKind,
    MemoryDecayStage,
    MemoryLayer,
    MemoryLifecycleState,
    MemoryTuningProfile,
    RelationshipState,
    SimpleMemoryPersona,
    PersonaMemoryProfile,
} from '../types';
import {
    DEFAULT_PERSONA_MEMORY_PROFILE,
    DEFAULT_SIMPLE_MEMORY_PERSONA,
} from '../types';

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
): PersonaMemoryProfile {
    const styleMode: string = normalizeMemoryText(seed?.styleSeed?.mode);
    const groupSize: number = Array.isArray(seed?.groupMembers) ? seed!.groupMembers.length : 0;
    const relationAnchors: number = Array.isArray(seed?.identitySeed?.relationshipAnchors)
        ? seed!.identitySeed.relationshipAnchors.length
        : 0;
    const emotionalLaneCount: number = Array.isArray(groupMemory?.lanes)
        ? groupMemory!.lanes.filter((lane) => normalizeMemoryText(lane.lastEmotion)).length
        : 0;

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

    return {
        ...DEFAULT_PERSONA_MEMORY_PROFILE,
        profileVersion: 'persona.v1',
        totalCapacity,
        eventMemory: clamp01(eventMemoryBase + (groupSize > 1 ? 0.06 : 0)),
        factMemory: clamp01(factMemoryBase + (relationAnchors > 0 ? 0.04 : 0)),
        emotionalBias,
        relationshipSensitivity,
        forgettingSpeed,
        distortionTendency,
        selfNarrativeBias,
        privacyGuard,
        allowDistortion: distortionTendency >= 0.55 && profile.chatType !== 'tool' && profile.chatType !== 'worldbook',
        derivedFrom: [
            seed ? 'semantic_seed' : '',
            profile.chatType ? `chat_type:${profile.chatType}` : '',
            profile.stylePreference ? `style:${profile.stylePreference}` : '',
            groupSize > 1 ? 'group_bias' : '',
        ].filter(Boolean),
        updatedAt: Date.now(),
    };
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
