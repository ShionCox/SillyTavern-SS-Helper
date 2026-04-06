import {
    detectWorldProfile,
    listWorldProfiles,
    resolveWorldProfile,
    type ResolvedWorldProfile,
    type WorldProfileDetectionResult,
} from '../memory-world-profile';
import type { RetrievalCandidate, RetrievalResultItem } from '../memory-retrieval/types';
import type { WorldProfileBinding } from '../types';

export interface WorldStrategyRepository {
    getWorldProfileBinding(): Promise<WorldProfileBinding | null>;
    putWorldProfileBinding(input: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
        detectedFrom: string[];
        bindingMode?: 'auto' | 'manual';
    }): Promise<WorldProfileBinding>;
}

export interface WorldStrategyExplanation {
    profileId: string;
    displayName: string;
    confidence: number;
    bindingMode: 'auto' | 'manual';
    reasonCodes: string[];
    detectedFrom: string[];
    injectionStyle: string;
    preferredSchemas: string[];
    preferredFacets: string[];
    boostedTypes: string[];
    suppressedTypes: string[];
    fieldExtensions: Record<string, string[]>;
    capabilities: ResolvedWorldProfile['mergedCapabilities'];
    effectSummary: string[];
}

export interface ResolvedChatWorldStrategy {
    detection: WorldProfileDetectionResult;
    binding: WorldProfileBinding | null;
    profile: ResolvedWorldProfile;
    explanation: WorldStrategyExplanation;
    retrievalBias: {
        preferredSchemas: string[];
        preferredFacets: string[];
        suppressedTypes: string[];
    };
    dreamBias: {
        preferredSchemas: string[];
        maintenanceFocus: string[];
        promptHints: string[];
    };
    summaryHints: string[];
    takeoverHints: string[];
    bootstrapHints: string[];
}

/**
 * 功能：解析当前聊天应使用的世界策略；若缺少绑定，可按需识别并落盘。
 * @param input 解析输入。
 * @returns 解析后的聊天级世界策略。
 */
export async function resolveChatWorldStrategy(input: {
    repository?: WorldStrategyRepository;
    binding?: WorldProfileBinding | null;
    texts?: string[];
    detectedFrom?: string[];
    persistIfMissing?: boolean;
    forceRedetect?: boolean;
}): Promise<ResolvedChatWorldStrategy> {
    const binding = input.binding ?? await input.repository?.getWorldProfileBinding() ?? null;
    const normalizedTexts = normalizeTextList(input.texts ?? []);
    const normalizedDetectedFrom = normalizeTextList(input.detectedFrom ?? normalizedTexts);

    if (binding && binding.bindingMode === 'manual' && !input.forceRedetect) {
        return buildResolvedStrategy({
            detection: bindingToDetection(binding),
            binding,
        });
    }

    if (binding && !input.forceRedetect) {
        return buildResolvedStrategy({
            detection: bindingToDetection(binding),
            binding,
        });
    }

    const detection = detectWorldProfile({
        texts: normalizedTexts,
    });
    let persistedBinding = binding ?? null;

    if (input.repository && (input.persistIfMissing || input.forceRedetect || !binding)) {
        persistedBinding = await input.repository.putWorldProfileBinding({
            primaryProfile: detection.primaryProfile,
            secondaryProfiles: detection.secondaryProfiles,
            confidence: detection.confidence,
            reasonCodes: normalizeTextList([
                ...detection.reasonCodes,
                input.forceRedetect ? 'source:world_strategy_redetect' : 'source:world_strategy_detect',
            ]),
            detectedFrom: normalizedDetectedFrom,
            bindingMode: 'auto',
        });
    }

    return buildResolvedStrategy({
        detection,
        binding: persistedBinding,
    });
}

/**
 * 功能：手动覆盖当前聊天的世界画像绑定。
 * @param input 覆盖输入。
 * @returns 覆盖后的聊天级世界策略。
 */
export async function applyManualWorldStrategyOverride(input: {
    repository: WorldStrategyRepository;
    primaryProfile: string;
    secondaryProfiles?: string[];
    detectedFrom?: string[];
}): Promise<ResolvedChatWorldStrategy> {
    const normalizedPrimary = normalizeProfileId(input.primaryProfile);
    const secondaryProfiles = normalizeTextList(input.secondaryProfiles ?? []).filter((item): boolean => item !== normalizedPrimary);
    const binding = await input.repository.putWorldProfileBinding({
        primaryProfile: normalizedPrimary,
        secondaryProfiles,
        confidence: 1,
        reasonCodes: ['source:manual_override'],
        detectedFrom: normalizeTextList(input.detectedFrom ?? ['workbench_manual_override']),
        bindingMode: 'manual',
    });
    return buildResolvedStrategy({
        detection: bindingToDetection(binding),
        binding,
    });
}

/**
 * 功能：重置当前聊天为自动识别画像，并立即重新识别落盘。
 * @param input 重置输入。
 * @returns 重置后的聊天级世界策略。
 */
export async function resetChatWorldStrategyToAuto(input: {
    repository: WorldStrategyRepository;
    texts: string[];
    detectedFrom?: string[];
}): Promise<ResolvedChatWorldStrategy> {
    return resolveChatWorldStrategy({
        repository: input.repository,
        texts: input.texts,
        detectedFrom: input.detectedFrom,
        persistIfMissing: true,
        forceRedetect: true,
    });
}

/**
 * 功能：将世界策略偏置应用到检索候选上。
 * @param candidates 原始候选。
 * @param strategy 世界策略。
 * @returns 偏置后的候选。
 */
export function applyWorldStrategyToRetrievalCandidates(
    candidates: RetrievalCandidate[],
    strategy: ResolvedChatWorldStrategy | null | undefined,
): RetrievalCandidate[] {
    if (!strategy) {
        return candidates;
    }
    const preferredSchemas = new Set(strategy.profile.mergedPreferredSchemas);
    const preferredFacets = strategy.profile.mergedPreferredFacets;
    return candidates.map((candidate: RetrievalCandidate): RetrievalCandidate => {
        const schemaBoost = preferredSchemas.has(candidate.schemaId) ? 12 : 0;
        const capabilityPenalty = resolveCapabilityPenalty(candidate, strategy.profile);
        const memoryPercent = clampMemoryPercent(candidate.memoryPercent + schemaBoost - capabilityPenalty);
        const aliasTexts = uniqueStrings([
            ...(candidate.aliasTexts ?? []),
            ...preferredFacets,
            ...resolveSchemaBiasHints(candidate.schemaId, strategy.profile.mergedPreferredSchemas),
        ]);
        return {
            ...candidate,
            memoryPercent,
            aliasTexts,
        };
    });
}

/**
 * 功能：将世界策略偏置应用到最终检索结果排序上。
 * @param items 检索结果项。
 * @param strategy 世界策略。
 * @returns 调整后的结果项。
 */
export function applyWorldStrategyToResultItems(
    items: RetrievalResultItem[],
    strategy: ResolvedChatWorldStrategy | null | undefined,
): RetrievalResultItem[] {
    if (!strategy || items.length <= 0) {
        return items;
    }
    const preferredSchemas = new Set(strategy.profile.mergedPreferredSchemas);
    return [...items]
        .map((item: RetrievalResultItem): RetrievalResultItem => {
            const schemaBoost = preferredSchemas.has(item.candidate.schemaId) ? 0.06 : 0;
            const capabilityPenalty = resolveCapabilityPenalty(item.candidate, strategy.profile) > 0 ? 0.05 : 0;
            return {
                ...item,
                score: Math.max(0, Math.min(1, Number((item.score + schemaBoost - capabilityPenalty).toFixed(6)))),
            };
        })
        .sort((left: RetrievalResultItem, right: RetrievalResultItem): number => right.score - left.score);
}

/**
 * 功能：按世界策略对注入候选条目重新排序。
 * @param entries 条目列表。
 * @param strategy 世界策略。
 * @returns 调整后的条目列表。
 */
export function sortEntriesByWorldStrategy<T extends { entryType: string; updatedAt?: number }>(
    entries: T[],
    strategy: ResolvedChatWorldStrategy | null | undefined,
): T[] {
    if (!strategy) {
        return entries;
    }
    const weights = new Map(strategy.profile.mergedPreferredSchemas.map((schemaId: string, index: number): [string, number] => {
        return [schemaId, strategy.profile.mergedPreferredSchemas.length - index];
    }));
    return [...entries].sort((left: T, right: T): number => {
        const diff = (weights.get(right.entryType) ?? 0) - (weights.get(left.entryType) ?? 0);
        if (diff !== 0) {
            return diff;
        }
        return Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
    });
}

/**
 * 功能：生成世界策略在 prompt/summary/dream/takeover 等链路可直接拼接的说明文本。
 * @param strategy 世界策略。
 * @param scene 场景名。
 * @returns 中文说明文本。
 */
export function buildWorldStrategyHintText(
    strategy: ResolvedChatWorldStrategy,
    scene: 'summary' | 'dream' | 'takeover' | 'bootstrap' | 'prompt',
): string {
    const hints = scene === 'summary'
        ? strategy.summaryHints
        : scene === 'dream'
            ? strategy.dreamBias.promptHints
            : scene === 'takeover'
                ? strategy.takeoverHints
                : scene === 'bootstrap'
                    ? strategy.bootstrapHints
                    : strategy.explanation.effectSummary;
    return [
        `当前世界画像：${strategy.explanation.displayName}（${strategy.explanation.profileId}）`,
        ...hints.map((item: string): string => `- ${item}`),
    ].join('\n');
}

/**
 * 功能：构建世界画像选择项。
 * @returns 世界画像列表。
 */
export function listSelectableWorldProfiles(): Array<{ profileId: string; displayName: string }> {
    return listWorldProfiles().map((profile) => ({
        profileId: profile.worldProfileId,
        displayName: profile.displayName,
    }));
}

/**
 * 功能：基于已有绑定同步生成工作台展示所需的世界策略说明。
 * @param binding 画像绑定。
 * @returns 世界策略说明；无绑定时返回 null。
 */
export function buildWorldStrategyExplanationFromBinding(binding: WorldProfileBinding | null | undefined): WorldStrategyExplanation | null {
    if (!binding?.primaryProfile) {
        return null;
    }
    return buildResolvedStrategy({
        detection: bindingToDetection(binding),
        binding,
    }).explanation;
}

function buildResolvedStrategy(input: {
    detection: WorldProfileDetectionResult;
    binding: WorldProfileBinding | null;
}): ResolvedChatWorldStrategy {
    const profile = resolveWorldProfile(input.detection);
    const bindingMode = input.binding?.bindingMode === 'manual' ? 'manual' : 'auto';
    const effectSummary = buildEffectSummary(profile);
    return {
        detection: input.detection,
        binding: input.binding,
        profile,
        explanation: {
            profileId: profile.primary.worldProfileId,
            displayName: profile.primary.displayName,
            confidence: input.binding?.confidence ?? input.detection.confidence,
            bindingMode,
            reasonCodes: normalizeTextList(input.binding?.reasonCodes ?? input.detection.reasonCodes),
            detectedFrom: normalizeTextList(input.binding?.detectedFrom ?? []),
            injectionStyle: profile.primary.injectionStyle,
            preferredSchemas: profile.mergedPreferredSchemas,
            preferredFacets: profile.mergedPreferredFacets,
            boostedTypes: profile.mergedSummaryBias.boostedTypes,
            suppressedTypes: profile.mergedSummaryBias.suppressedTypes,
            fieldExtensions: profile.mergedFieldExtensions,
            capabilities: profile.mergedCapabilities,
            effectSummary,
        },
        retrievalBias: {
            preferredSchemas: profile.mergedPreferredSchemas,
            preferredFacets: profile.mergedPreferredFacets,
            suppressedTypes: profile.mergedSummaryBias.suppressedTypes,
        },
        dreamBias: {
            preferredSchemas: profile.mergedPreferredSchemas,
            maintenanceFocus: resolveDreamMaintenanceFocus(profile.primary.worldProfileId),
            promptHints: resolveDreamPromptHints(profile.primary.worldProfileId),
        },
        summaryHints: resolveSummaryHints(profile.primary.worldProfileId),
        takeoverHints: resolveTakeoverHints(profile.primary.worldProfileId),
        bootstrapHints: resolveBootstrapHints(profile.primary.worldProfileId),
    };
}

function bindingToDetection(binding: WorldProfileBinding): WorldProfileDetectionResult {
    return {
        primaryProfile: normalizeProfileId(binding.primaryProfile),
        secondaryProfiles: normalizeTextList(binding.secondaryProfiles ?? []),
        confidence: Number(binding.confidence ?? 0) || 0,
        reasonCodes: normalizeTextList([
            ...(binding.reasonCodes ?? []),
            'source:world_profile_binding',
        ]),
    };
}

function buildEffectSummary(profile: ResolvedWorldProfile): string[] {
    return [
        `注入风格使用 ${profile.primary.injectionStyle}。`,
        `检索优先 schema：${profile.mergedPreferredSchemas.join(' / ') || '无'}。`,
        `总结强化类型：${profile.mergedSummaryBias.boostedTypes.join(' / ') || '无'}。`,
        `扩展字段重点：${summarizeFieldExtensions(profile.mergedFieldExtensions)}。`,
    ];
}

function resolveSummaryHints(profileId: string): string[] {
    if (profileId === 'fantasy_magic') {
        return ['优先强化世界规则、阵营边界、种族与圣物线索。', '遇到日常流程类信息时保持保守，避免挤占规则性事件。'];
    }
    if (profileId === 'ancient_traditional') {
        return ['优先强化身份、礼法、门第、宗门与政治站位变化。', '称谓、尊卑、上下位关系比零碎日常更重要。'];
    }
    if (profileId === 'supernatural_hidden') {
        return ['优先强化表世界/里世界的掩饰关系、异常事件与隐藏组织。', '保留公开解释与真实超自然线索的双层结构。'];
    }
    return ['优先强化组织、任务、地点与现实关系推进。', '生活流信息允许保留细碎进展，但避免抽取不必要的设定玄学。'];
}

function resolveTakeoverHints(profileId: string): string[] {
    if (profileId === 'fantasy_magic') {
        return ['优先抽取势力、种族、地域、法则、禁忌与圣物。', '遇到地点时优先描述危险度、法则性与阵营控制。'];
    }
    if (profileId === 'ancient_traditional') {
        return ['优先抽取门第、位阶、称谓、礼制、宗门与家族脉络。', '关系梳理时优先明确尊卑和政治立场。'];
    }
    if (profileId === 'supernatural_hidden') {
        return ['优先抽取异常事件、掩饰说法、公开壳层与真实超自然目的。', '组织、地点、事件都要注意“表层身份/隐藏目的”双层记录。'];
    }
    return ['优先抽取组织、职位、学校/公司、公共规则与日常任务。', '地点、事件与现实关系推进的可持续更新优先于抽象设定。'];
}

function resolveBootstrapHints(profileId: string): string[] {
    if (profileId === 'fantasy_magic') {
        return ['冷启动阶段优先建立世界规则、阵营、地域、圣物和种族骨架。'];
    }
    if (profileId === 'ancient_traditional') {
        return ['冷启动阶段优先建立身份等级、礼法秩序、宗门/朝堂/家族骨架。'];
    }
    if (profileId === 'supernatural_hidden') {
        return ['冷启动阶段优先建立公开世界与隐藏超自然层的双层骨架。'];
    }
    return ['冷启动阶段优先建立现实组织、城市地点、学校/公司与公共规则骨架。'];
}

function resolveDreamMaintenanceFocus(profileId: string): string[] {
    if (profileId === 'fantasy_magic') {
        return ['世界规则强化', '阵营与种族关系维护', '地域边界整理', '能力/契约补全'];
    }
    if (profileId === 'ancient_traditional') {
        return ['身份关系再排序', '礼法与立场巩固', '家族门派脉络整理', '称谓系统强化'];
    }
    if (profileId === 'supernatural_hidden') {
        return ['异常事件压缩', '隐藏组织维护', '表里世界关系整理', '掩饰链路补全'];
    }
    return ['关系推进', '日常事件压缩', '组织角色维护', '任务与现实状态维护'];
}

function resolveDreamPromptHints(profileId: string): string[] {
    if (profileId === 'fantasy_magic') {
        return ['梦境推理优先关注法则、禁忌、阵营边界与圣物影响。', '不要把都市职场流程当成主维护对象。'];
    }
    if (profileId === 'ancient_traditional') {
        return ['梦境推理优先关注身份、礼法、宗门家族、朝堂立场。', '称谓与尊卑错位往往比单次事件更值得维护。'];
    }
    if (profileId === 'supernatural_hidden') {
        return ['梦境推理优先关注异常事件、隐藏组织、公开掩饰与真实目的的双层结构。'];
    }
    return ['梦境推理优先关注组织角色、任务推进、公共秩序与现实关系。'];
}

function resolveCapabilityPenalty(candidate: RetrievalCandidate, profile: ResolvedWorldProfile): number {
    const text = `${candidate.title} ${candidate.summary} ${(candidate.tags ?? []).join(' ')}`.toLowerCase();
    let penalty = 0;
    if (!profile.mergedCapabilities.hasMagic && /(魔法|法术|咒|结界|魔王|圣物|精灵|龙族)/u.test(text)) {
        penalty += 10;
    }
    if (!profile.mergedCapabilities.hasModernTechnology && /(公司|互联网|地铁|电脑|手机|写字楼|学校|警察)/u.test(text)) {
        penalty += 10;
    }
    if (!profile.mergedCapabilities.hasFantasyRace && /(精灵|矮人|龙族|兽人|血族)/u.test(text)) {
        penalty += 8;
    }
    return penalty;
}

function resolveSchemaBiasHints(schemaId: string, preferredSchemas: string[]): string[] {
    if (preferredSchemas.includes(schemaId)) {
        return ['preferred_world_schema'];
    }
    return [];
}

function normalizeProfileId(value: unknown): string {
    const normalized = String(value ?? '').trim();
    return normalized || 'urban_modern';
}

function normalizeTextList(values: string[]): string[] {
    return uniqueStrings(values.map((item: string): string => String(item ?? '').trim()).filter(Boolean));
}

function uniqueStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

function clampMemoryPercent(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

function summarizeFieldExtensions(fieldExtensions: Record<string, string[]>): string {
    const rows = Object.entries(fieldExtensions)
        .filter(([, fields]) => Array.isArray(fields) && fields.length > 0)
        .slice(0, 3)
        .map(([schemaId, fields]): string => `${schemaId}.${fields.slice(0, 3).join('/')}`);
    return rows.join('；') || '无';
}
