import type {
    ChatSemanticSeed,
    SemanticCatalogEntrySummary,
    SemanticKnowledgeLevel,
    SemanticWorldFacet,
    SemanticWorldFacetEntry,
    WorldStateScopeType,
    WorldStateType,
} from '../types';

export interface StructuredSeedWorldStateEntry {
    path: string;
    value: Record<string, unknown>;
}

type MergedEntry = {
    path: string;
    value: Record<string, unknown>;
    parentCompleteness: number;
};

type SeedTaskStatus = 'pending' | 'in_progress' | 'blocked' | 'completed';

const FACET_PRIORITY: Record<SemanticWorldFacet, number> = {
    constraint: 8,
    rule: 7,
    social: 6,
    culture: 5,
    event: 4,
    danger: 3,
    entity: 2,
    other: 1,
};

const KNOWLEDGE_PRIORITY: Record<SemanticKnowledgeLevel, number> = {
    confirmed: 3,
    rumor: 2,
    inferred: 1,
};

const TASK_STATUS_PRIORITY: Record<SeedTaskStatus, number> = {
    pending: 1,
    in_progress: 2,
    blocked: 2,
    completed: 3,
};

const LEGACY_TASK_NOISE_TITLES = new Set<string>([
    'hardconstraints',
    'hardconstraint',
    'hard_constraints',
    'rules',
    'rule',
    'constraints',
    'constraint',
]);

const LEGACY_TASK_PAYLOAD_PATTERN = /"?(hardconstraints|hard_constraints|rules|constraints|social_structure|description)"?\s*[:=]/i;

/**
 * 功能：规范化文本，去除多余空白。
 * @param value 任意输入值。
 * @returns 规范化后的文本。
 */
function normalizeSeedText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：将文本转为 slug，用于路径。
 * @param value 输入文本。
 * @param fallback 兜底值。
 * @returns 可用于路径的短字符串。
 */
function slugifySeedText(value: string, fallback: string): string {
    const normalized = normalizeSeedText(value)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return normalized || fallback;
}

/**
 * 功能：文本去重并截断。
 * @param limit 最大返回数量。
 * @param groups 文本组。
 * @returns 去重后的文本数组。
 */
function uniqueSeedTexts(limit: number, ...groups: Array<ArrayLike<unknown> | null | undefined>): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    groups.forEach((group) => {
        if (!group) {
            return;
        }
        Array.from(group).forEach((item: unknown) => {
            const normalized = normalizeSeedText(item);
            if (!normalized) {
                return;
            }
            const signature = normalized.toLowerCase();
            if (seen.has(signature)) {
                return;
            }
            seen.add(signature);
            result.push(normalized);
        });
    });
    return result.slice(0, limit);
}

/**
 * 功能：规范化任务状态，非法值返回空字符串。
 * @param value 输入状态值。
 * @returns 标准任务状态或空字符串。
 */
function normalizeSeedTaskStatus(value: unknown): SeedTaskStatus | '' {
    const normalized = normalizeSeedText(value).toLowerCase();
    if (normalized === 'pending' || normalized === 'in_progress' || normalized === 'blocked' || normalized === 'completed') {
        return normalized;
    }
    return '';
}

/**
 * 功能：选择更可靠的任务状态，避免 completed 被回退。
 * @param current 当前状态。
 * @param incoming 新状态。
 * @returns 合并后的任务状态。
 */
function mergeSeedTaskStatus(current: unknown, incoming: unknown): SeedTaskStatus | undefined {
    const currentStatus = normalizeSeedTaskStatus(current);
    const incomingStatus = normalizeSeedTaskStatus(incoming);
    if (!currentStatus && !incomingStatus) {
        return undefined;
    }
    if (!currentStatus) {
        return incomingStatus || undefined;
    }
    if (!incomingStatus) {
        return currentStatus;
    }
    return TASK_STATUS_PRIORITY[incomingStatus] >= TASK_STATUS_PRIORITY[currentStatus] ? incomingStatus : currentStatus;
}

/**
 * 功能：判定标题是否是噪音键名。
 * @param title 标题文本。
 * @returns 是否应被忽略。
 */
function isLegacyTaskNoiseTitle(title: unknown): boolean {
    const normalized = normalizeSeedText(title).toLowerCase().replace(/[\s_-]/g, '');
    if (!normalized) {
        return true;
    }
    return LEGACY_TASK_NOISE_TITLES.has(normalized);
}

/**
 * 功能：判定文本是否包含旧版规则/约束 JSON 片段。
 * @param value 输入文本。
 * @returns 是否命中旧版污染片段。
 */
function containsLegacyTaskPayload(value: unknown): boolean {
    const text = normalizeSeedText(value);
    if (!text || !/[{}\[\]"]/.test(text)) {
        return false;
    }
    return LEGACY_TASK_PAYLOAD_PATTERN.test(text);
}

/**
 * 功能：在任务字段合并时优先保留信息量更高的文本。
 * @param current 旧文本。
 * @param incoming 新文本。
 * @returns 合并后的文本。
 */
function pickPreferredTaskText(current: unknown, incoming: unknown): string | undefined {
    const currentText = normalizeSeedText(current);
    const incomingText = normalizeSeedText(incoming);
    if (!currentText && !incomingText) {
        return undefined;
    }
    if (!currentText) {
        return incomingText;
    }
    if (!incomingText) {
        return currentText;
    }
    return incomingText.length >= currentText.length ? incomingText : currentText;
}

/**
 * 功能：规范化知识级别。
 * @param value 输入值。
 * @param fallback 默认级别。
 * @returns 标准知识级别。
 */
function normalizeKnowledgeLevel(value: unknown, fallback: SemanticKnowledgeLevel = 'confirmed'): SemanticKnowledgeLevel {
    const normalized = normalizeSeedText(value).toLowerCase();
    if (normalized === 'confirmed' || normalized === 'rumor' || normalized === 'inferred') {
        return normalized;
    }
    return fallback;
}

/**
 * 功能：比较知识级别，返回更强的一侧。
 * @param current 旧级别。
 * @param incoming 新级别。
 * @returns 升级后的级别。
 */
function mergeKnowledgeLevel(current: unknown, incoming: unknown): SemanticKnowledgeLevel | undefined {
    const currentLevel = normalizeSeedText(current) ? normalizeKnowledgeLevel(current, 'inferred') : null;
    const incomingLevel = normalizeSeedText(incoming) ? normalizeKnowledgeLevel(incoming, 'inferred') : null;
    if (!currentLevel && !incomingLevel) {
        return undefined;
    }
    if (!currentLevel) {
        return incomingLevel ?? undefined;
    }
    if (!incomingLevel) {
        return currentLevel;
    }
    return KNOWLEDGE_PRIORITY[incomingLevel] >= KNOWLEDGE_PRIORITY[currentLevel] ? incomingLevel : currentLevel;
}

/**
 * 功能：将文本标准化为去重键片段。
 * @param value 输入文本。
 * @returns 归一化键片段。
 */
function normalizeCanonicalPart(value: unknown): string {
    return normalizeSeedText(value)
        .toLowerCase()
        .replace(/[，。！？；：,.!?;:\-_/\\'"`~()\[\]{}<>|]/g, ' ')
        .replace(/\b(and|or|the|a|an|of|to|for|with)\b/g, ' ')
        .replace(/(以及|并且|而且|然后|并|和|或|的|地|得)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 功能：基于路径中的重复冲突生成唯一路径。
 * @param basePath 目标基础路径。
 * @param entries 已收集条目。
 * @returns 唯一路径。
 */
function ensureUniquePath(basePath: string, entries: Map<string, MergedEntry>): string {
    const normalizedBase = normalizeSeedText(basePath);
    if (!entries.has(normalizedBase)) {
        return normalizedBase;
    }
    let index = 2;
    while (entries.has(`${normalizedBase}-${index}`)) {
        index += 1;
    }
    return `${normalizedBase}-${index}`;
}

/**
 * 功能：按常见实体后缀提取国家名。
 * @param value 原始文本。
 * @returns 提取后的国家名，无结果返回空。
 */
function extractNationEntityLabel(value: string): string {
    const normalized = normalizeSeedText(value);
    if (!normalized) {
        return '';
    }
    const direct = normalized.match(/([A-Za-z0-9\u4e00-\u9fa5]{2,24}(?:王朝|帝国|王国|联邦|共和国|公国|汗国|联盟|国))/);
    const candidate = normalizeSeedText(direct?.[1]);
    if (!candidate) {
        return '';
    }
    const invalid = /社会|结构|制度|政治|经济|军事|婚姻|女子|男子|盛世|架空|古代|现代|治理|权力|主导|继承/;
    if (invalid.test(candidate)) {
        return '';
    }
    return candidate;
}

/**
 * 功能：从描述文本中抽取主语名词（适用于区域/城市/地点）。
 * @param value 原始文本。
 * @returns 抽取后的名称，无结果返回空。
 */
function extractNamedLeadSegment(value: string): string {
    const normalized = normalizeSeedText(value);
    if (!normalized) {
        return '';
    }
    const lead = normalized
        .split(/[：:，,。；;\n]/)[0]
        .trim()
        .split(/\s*[-—–]\s*/)[0]
        .trim();
    if (!lead) {
        return '';
    }
    const invalid = /政治|经济|军事|制度|结构|领域|主导权|所有领域|休憩游玩之所|举行大典之所|最受宠/;
    if (invalid.test(lead) || lead.length > 24) {
        return '';
    }
    return lead;
}

/**
 * 功能：将一句文本拆分为关键词片段。
 * @param value 输入文本。
 * @returns 关键词数组。
 */
function buildKeywords(value: string): string[] {
    return uniqueSeedTexts(
        12,
        normalizeSeedText(value)
            .split(/[^a-z0-9\u4e00-\u9fa5]+/i)
            .map((item: string): string => normalizeSeedText(item))
            .filter((item: string): boolean => item.length >= 2),
    );
}

/**
 * 功能：计算父级信息完整度。
 * @param value 世界状态值对象。
 * @returns 父级字段已填数量。
 */
function countParentCompleteness(value: Record<string, unknown>): number {
    let count = 0;
    if (normalizeSeedText(value.nationName ?? value.nationId)) count += 1;
    if (normalizeSeedText(value.regionName ?? value.regionId)) count += 1;
    if (normalizeSeedText(value.cityName ?? value.cityId)) count += 1;
    return count;
}

/**
 * 功能：构建目录类 canonical key。
 * @param scopeType 作用域类型。
 * @param name 名称。
 * @param nationName 国家名。
 * @param regionName 区域名。
 * @param cityName 城市名。
 * @returns 严格 canonical key。
 */
function buildCatalogCanonicalKey(scopeType: WorldStateScopeType, name: string, nationName?: string, regionName?: string, cityName?: string): string {
    return [
        'catalog',
        scopeType,
        normalizeCanonicalPart(name) || '_',
        normalizeCanonicalPart(nationName) || '_',
        normalizeCanonicalPart(regionName) || '_',
        normalizeCanonicalPart(cityName) || '_',
    ].join('::');
}

/**
 * 功能：构建目录类宽松 canonical key（用于未知父级后续升级）。
 * @param scopeType 作用域类型。
 * @param name 名称。
 * @returns 宽松 canonical key。
 */
function buildCatalogLooseCanonicalKey(scopeType: WorldStateScopeType, name: string): string {
    return ['catalog-loose', scopeType, normalizeCanonicalPart(name) || '_'].join('::');
}

/**
 * 功能：构建法典/历史等 facet canonical key。
 * @param facet 类型分面。
 * @param title 标题。
 * @param summary 摘要。
 * @param scopeType 作用域类型。
 * @param nationName 国家名。
 * @param regionName 区域名。
 * @param cityName 城市名。
 * @param locationName 地点名。
 * @returns 严格 canonical key。
 */
function buildFacetCanonicalKey(
    facet: SemanticWorldFacet,
    title: string,
    summary: string,
    scopeType: WorldStateScopeType,
    nationName?: string,
    regionName?: string,
    cityName?: string,
    locationName?: string,
): string {
    return [
        'facet',
        facet,
        scopeType,
        normalizeCanonicalPart(title) || normalizeCanonicalPart(summary) || '_',
        normalizeCanonicalPart(nationName) || '_',
        normalizeCanonicalPart(regionName) || '_',
        normalizeCanonicalPart(cityName) || '_',
        normalizeCanonicalPart(locationName) || '_',
    ].join('::');
}

/**
 * 功能：构建统一 world_state 值对象。
 * @param params 输入参数。
 * @returns world_state 值对象。
 */
function buildStateValue(params: {
    title: string;
    summary: string;
    scopeType: WorldStateScopeType;
    stateType: WorldStateType;
    sourceLabel: string;
    knowledgeLevel?: SemanticKnowledgeLevel;
    nationName?: string;
    nationKnowledgeLevel?: SemanticKnowledgeLevel;
    regionName?: string;
    regionKnowledgeLevel?: SemanticKnowledgeLevel;
    cityName?: string;
    cityKnowledgeLevel?: SemanticKnowledgeLevel;
    locationName?: string;
    subjectId?: string;
    canonicalKey: string;
    tags?: string[];
}): Record<string, unknown> {
    const title = normalizeSeedText(params.title);
    const summary = normalizeSeedText(params.summary) || title;
    const nationName = normalizeSeedText(params.nationName) || undefined;
    const regionName = normalizeSeedText(params.regionName) || undefined;
    const cityName = normalizeSeedText(params.cityName) || undefined;
    const locationName = normalizeSeedText(params.locationName) || undefined;
    const sourceTags = uniqueSeedTexts(16, [params.sourceLabel, params.scopeType, params.stateType], params.tags ?? []);
    return {
        title: title || (summary.length > 28 ? `${summary.slice(0, 28)}…` : summary),
        summary,
        scopeType: params.scopeType,
        stateType: params.stateType,
        subjectId: normalizeSeedText(params.subjectId) || undefined,
        nationName,
        regionName,
        cityName,
        locationName,
        nationId: nationName,
        regionId: regionName,
        cityId: cityName,
        locationId: locationName,
        knowledgeLevel: params.knowledgeLevel ?? 'confirmed',
        nationKnowledgeLevel: nationName ? (params.nationKnowledgeLevel ?? params.knowledgeLevel ?? 'confirmed') : undefined,
        regionKnowledgeLevel: regionName ? (params.regionKnowledgeLevel ?? params.knowledgeLevel ?? 'confirmed') : undefined,
        cityKnowledgeLevel: cityName ? (params.cityKnowledgeLevel ?? params.knowledgeLevel ?? 'confirmed') : undefined,
        canonicalKey: params.canonicalKey,
        keywords: buildKeywords(`${title} ${summary}`),
        tags: sourceTags,
        sourceRefs: [params.sourceLabel],
        confidence: 0.74,
        updatedAt: Date.now(),
    };
}

/**
 * 功能：合并两个 state 值，优先保留更强知识级别与更完整父级链。
 * @param current 已有值。
 * @param incoming 新值。
 * @returns 合并后的值。
 */
function mergeStateValue(current: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...current, ...incoming };
    const currentSummary = normalizeSeedText(current.summary);
    const incomingSummary = normalizeSeedText(incoming.summary);
    merged.summary = incomingSummary.length >= currentSummary.length ? (incomingSummary || currentSummary) : (currentSummary || incomingSummary);
    const currentTitle = normalizeSeedText(current.title);
    const incomingTitle = normalizeSeedText(incoming.title);
    merged.title = incomingTitle.length >= currentTitle.length ? (incomingTitle || currentTitle) : (currentTitle || incomingTitle);
    merged.knowledgeLevel = mergeKnowledgeLevel(current.knowledgeLevel, incoming.knowledgeLevel);

    const currentParentScore = countParentCompleteness(current);
    const incomingParentScore = countParentCompleteness(incoming);
    const incomingBetterParent = incomingParentScore > currentParentScore;

    if (incomingBetterParent) {
        merged.nationName = incoming.nationName ?? incoming.nationId;
        merged.regionName = incoming.regionName ?? incoming.regionId;
        merged.cityName = incoming.cityName ?? incoming.cityId;
        merged.locationName = incoming.locationName ?? incoming.locationId;
        merged.nationId = incoming.nationName ?? incoming.nationId;
        merged.regionId = incoming.regionName ?? incoming.regionId;
        merged.cityId = incoming.cityName ?? incoming.cityId;
        merged.locationId = incoming.locationName ?? incoming.locationId;
    } else {
        merged.nationName = current.nationName ?? current.nationId ?? incoming.nationName ?? incoming.nationId;
        merged.regionName = current.regionName ?? current.regionId ?? incoming.regionName ?? incoming.regionId;
        merged.cityName = current.cityName ?? current.cityId ?? incoming.cityName ?? incoming.cityId;
        merged.locationName = current.locationName ?? current.locationId ?? incoming.locationName ?? incoming.locationId;
        merged.nationId = merged.nationName;
        merged.regionId = merged.regionName;
        merged.cityId = merged.cityName;
        merged.locationId = merged.locationName;
    }

    merged.nationKnowledgeLevel = mergeKnowledgeLevel(current.nationKnowledgeLevel, incoming.nationKnowledgeLevel);
    merged.regionKnowledgeLevel = mergeKnowledgeLevel(current.regionKnowledgeLevel, incoming.regionKnowledgeLevel);
    merged.cityKnowledgeLevel = mergeKnowledgeLevel(current.cityKnowledgeLevel, incoming.cityKnowledgeLevel);
    merged.keywords = uniqueSeedTexts(12, (current.keywords as unknown[]) ?? [], (incoming.keywords as unknown[]) ?? []);
    merged.tags = uniqueSeedTexts(16, (current.tags as unknown[]) ?? [], (incoming.tags as unknown[]) ?? []);
    merged.sourceRefs = uniqueSeedTexts(24, (current.sourceRefs as unknown[]) ?? [], (incoming.sourceRefs as unknown[]) ?? []);
    merged.confidence = Math.max(Number(current.confidence ?? 0), Number(incoming.confidence ?? 0)) || undefined;
    merged.updatedAt = Math.max(Number(current.updatedAt ?? 0), Number(incoming.updatedAt ?? 0), Date.now());
    merged.canonicalKey = normalizeSeedText(current.canonicalKey) || normalizeSeedText(incoming.canonicalKey) || undefined;

    const mergedStateType = normalizeSeedText(merged.stateType || current.stateType || incoming.stateType).toLowerCase();
    if (mergedStateType === 'task') {
        const mergedStatus = mergeSeedTaskStatus(current.status, incoming.status);
        if (mergedStatus) {
            merged.status = mergedStatus;
        }
        const objective = pickPreferredTaskText(current.objective, incoming.objective);
        const completionCriteria = pickPreferredTaskText(current.completionCriteria, incoming.completionCriteria);
        const progressNote = pickPreferredTaskText(current.progressNote, incoming.progressNote);
        if (objective) {
            merged.objective = objective;
        }
        if (completionCriteria) {
            merged.completionCriteria = completionCriteria;
        }
        if (progressNote) {
            merged.progressNote = progressNote;
        }
        const ownerActorKeys = uniqueSeedTexts(16, (current.ownerActorKeys as unknown[]) ?? [], (incoming.ownerActorKeys as unknown[]) ?? []);
        if (ownerActorKeys.length > 0) {
            merged.ownerActorKeys = ownerActorKeys;
        }
        const organizationNames = uniqueSeedTexts(12, (current.organizationNames as unknown[]) ?? [], (incoming.organizationNames as unknown[]) ?? []);
        if (organizationNames.length > 0) {
            merged.organizationNames = organizationNames;
        }
    }
    return merged;
}

/**
 * 功能：将 facet 类型映射为 world_state 类型。
 * @param facet 分面类型。
 * @returns world_state 类型。
 */
function resolveFacetStateType(facet: SemanticWorldFacet): WorldStateType {
    if (facet === 'constraint') return 'constraint';
    if (facet === 'rule') return 'rule';
    if (facet === 'social') return 'constraint';
    if (facet === 'culture') return 'culture';
    if (facet === 'event') return 'event';
    if (facet === 'danger') return 'danger';
    if (facet === 'entity') return 'status';
    return 'other';
}

/**
 * 功能：将 facet 类型映射为路径前缀。
 * @param facet 分面类型。
 * @returns 路径前缀。
 */
function resolveFacetPathPrefix(facet: SemanticWorldFacet): string {
    if (facet === 'constraint') return '/semantic/constraints';
    if (facet === 'rule') return '/semantic/rules';
    if (facet === 'social' || facet === 'culture') return '/semantic/world/systems';
    if (facet === 'event') return '/semantic/events';
    if (facet === 'danger') return '/semantic/world/danger';
    return '/semantic/world/other';
}

/**
 * 功能：将明细数组和字符串数组融合为统一 facet 列表，并做跨 facet 去重。
 * @param seed 聊天语义种子。
 * @returns 去重后的 facet 列表。
 */
function collectWorldFacetEntries(seed: ChatSemanticSeed): SemanticWorldFacetEntry[] {
    const ai = seed.aiSummary;
    const details: SemanticWorldFacetEntry[] = [
        ...(ai?.ruleDetails ?? []),
        ...(ai?.constraintDetails ?? []),
        ...(ai?.socialSystemDetails ?? []),
        ...(ai?.culturalPracticeDetails ?? []),
        ...(ai?.majorEventDetails ?? []).map((item): SemanticWorldFacetEntry => ({
            title: normalizeSeedText(item.title) || extractNamedLeadSegment(normalizeSeedText(item.summary)) || '未命名事件',
            summary: normalizeSeedText(item.summary) || normalizeSeedText(item.title),
            facet: 'event',
            knowledgeLevel: 'confirmed',
            scopeType: item.locationName ? 'location' : 'global',
            locationName: normalizeSeedText(item.locationName) || undefined,
            appliesTo: uniqueSeedTexts(1, item.relatedActorKeys ?? [])[0] || undefined,
            tags: uniqueSeedTexts(10, item.organizationNames ?? [], [normalizeSeedText(item.phase)], [normalizeSeedText(item.impact)]),
        })),
        ...(ai?.dangerDetails ?? []),
        ...(ai?.entityDetails ?? []),
        ...(ai?.otherWorldDetailDetails ?? []),
    ];

    const fallbackEntries: SemanticWorldFacetEntry[] = [
        ...uniqueSeedTexts(32, ai?.worldRules, seed.worldSeed.rules).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'rule',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(24, ai?.hardConstraints, seed.worldSeed.hardConstraints).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'constraint',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.socialSystems).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'social',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.culturalPractices).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'culture',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.majorEvents).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'event',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.dangers).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'danger',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.entities, seed.worldSeed.entities).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'entity',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
        ...uniqueSeedTexts(16, ai?.otherWorldDetails).map((text: string): SemanticWorldFacetEntry => ({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            facet: 'other',
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
        })),
    ];

    const combined = [...details, ...fallbackEntries].map((item: SemanticWorldFacetEntry): SemanticWorldFacetEntry => ({
        ...item,
        title: normalizeSeedText(item.title) || extractNamedLeadSegment(item.summary) || normalizeSeedText(item.summary),
        summary: normalizeSeedText(item.summary) || normalizeSeedText(item.title),
        facet: item.facet,
        scopeType: item.scopeType || 'global',
        knowledgeLevel: normalizeKnowledgeLevel(item.knowledgeLevel, 'confirmed'),
        nationName: normalizeSeedText(item.nationName) || undefined,
        regionName: normalizeSeedText(item.regionName) || undefined,
        cityName: normalizeSeedText(item.cityName) || undefined,
        locationName: normalizeSeedText(item.locationName) || undefined,
        appliesTo: normalizeSeedText(item.appliesTo) || undefined,
        tags: uniqueSeedTexts(10, item.tags ?? []),
    })).filter((item: SemanticWorldFacetEntry): boolean => Boolean(item.title || item.summary));

    const merged = new Map<string, SemanticWorldFacetEntry>();
    combined.forEach((item: SemanticWorldFacetEntry): void => {
        const key = normalizeCanonicalPart(`${item.title} ${item.summary}`);
        if (!key) {
            return;
        }
        const existing = merged.get(key);
        if (!existing) {
            merged.set(key, item);
            return;
        }
        const existingPriority = FACET_PRIORITY[existing.facet];
        const incomingPriority = FACET_PRIORITY[item.facet];
        if (incomingPriority > existingPriority) {
            merged.set(key, {
                ...item,
                tags: uniqueSeedTexts(12, existing.tags ?? [], item.tags ?? []),
                knowledgeLevel: mergeKnowledgeLevel(existing.knowledgeLevel, item.knowledgeLevel) ?? item.knowledgeLevel,
            });
            return;
        }
        if (incomingPriority < existingPriority) {
            merged.set(key, {
                ...existing,
                tags: uniqueSeedTexts(12, existing.tags ?? [], item.tags ?? []),
                knowledgeLevel: mergeKnowledgeLevel(existing.knowledgeLevel, item.knowledgeLevel) ?? existing.knowledgeLevel,
            });
            return;
        }
        const existingText = normalizeSeedText(existing.summary);
        const incomingText = normalizeSeedText(item.summary);
        const pickIncoming = incomingText.length > existingText.length;
        const base = pickIncoming ? item : existing;
        const other = pickIncoming ? existing : item;
        merged.set(key, {
            ...base,
            tags: uniqueSeedTexts(12, base.tags ?? [], other.tags ?? []),
            knowledgeLevel: mergeKnowledgeLevel(existing.knowledgeLevel, item.knowledgeLevel) ?? base.knowledgeLevel,
        });
    });

    return Array.from(merged.values()).slice(0, 120);
}

/**
 * 功能：写入或合并条目，支持 strict/loose canonical key。
 * @param entries 条目映射。
 * @param canonicalToPath canonical 索引。
 * @param input 输入条目。
 */
function upsertMergedEntry(
    entries: Map<string, MergedEntry>,
    canonicalToPath: Map<string, string>,
    input: {
        path: string;
        value: Record<string, unknown>;
        strictCanonical: string;
        looseCanonical?: string;
        allowLooseMerge?: boolean;
    },
): void {
    const strictCanonical = normalizeSeedText(input.strictCanonical);
    const looseCanonical = normalizeSeedText(input.looseCanonical);
    let targetPath = canonicalToPath.get(strictCanonical) ?? '';

    if (!targetPath && looseCanonical && input.allowLooseMerge) {
        targetPath = canonicalToPath.get(looseCanonical) ?? '';
    }

    if (targetPath) {
        const existing = entries.get(targetPath);
        if (!existing) {
            return;
        }
        const mergedValue = mergeStateValue(existing.value, input.value);
        const mergedParentCompleteness = countParentCompleteness(mergedValue);
        entries.set(targetPath, {
            path: targetPath,
            value: mergedValue,
            parentCompleteness: mergedParentCompleteness,
        });
        canonicalToPath.set(strictCanonical, targetPath);
        if (looseCanonical && input.allowLooseMerge) {
            canonicalToPath.set(looseCanonical, targetPath);
        }
        return;
    }

    const uniquePath = ensureUniquePath(input.path, entries);
    const parentCompleteness = countParentCompleteness(input.value);
    entries.set(uniquePath, {
        path: uniquePath,
        value: input.value,
        parentCompleteness,
    });
    canonicalToPath.set(strictCanonical, uniquePath);
    if (looseCanonical && parentCompleteness <= 0) {
        canonicalToPath.set(looseCanonical, uniquePath);
    }
}

/**
 * 功能：推断并生成结构化 world_state 条目。
 * @param seed 聊天语义种子。
 * @returns 结构化条目列表。
 */
export function inferStructuredSeedWorldStateEntries(seed: ChatSemanticSeed): StructuredSeedWorldStateEntry[] {
    const entries = new Map<string, MergedEntry>();
    const canonicalToPath = new Map<string, string>();
    const ai = seed.aiSummary;

    const nationEntries = (ai?.nationDetails ?? []).length > 0
        ? ai!.nationDetails
        : uniqueSeedTexts(16, ai?.nations).map((nation: string): SemanticCatalogEntrySummary => ({
            name: extractNationEntityLabel(nation) || extractNamedLeadSegment(nation),
            summary: nation,
            knowledgeLevel: 'confirmed',
        })).filter((item: SemanticCatalogEntrySummary): boolean => Boolean(item.name));

    nationEntries.forEach((entry: SemanticCatalogEntrySummary, index: number): void => {
        const name = extractNationEntityLabel(entry.name) || extractNationEntityLabel(entry.summary) || extractNamedLeadSegment(entry.name) || extractNamedLeadSegment(entry.summary);
        if (!name) {
            return;
        }
        const strictCanonical = buildCatalogCanonicalKey('nation', name, name, undefined, undefined);
        const value = buildStateValue({
            title: name,
            summary: normalizeSeedText(entry.summary) || name,
            scopeType: 'nation',
            stateType: 'status',
            sourceLabel: 'seed_ai_nation',
            knowledgeLevel: normalizeKnowledgeLevel(entry.knowledgeLevel, 'confirmed'),
            nationName: name,
            nationKnowledgeLevel: normalizeKnowledgeLevel(entry.nationKnowledgeLevel, 'confirmed'),
            canonicalKey: strictCanonical,
            tags: entry.tags ?? [],
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/catalog/nations/${slugifySeedText(name, `nation-${index + 1}`)}`,
            value,
            strictCanonical,
            looseCanonical: buildCatalogLooseCanonicalKey('nation', name),
            allowLooseMerge: true,
        });
    });

    const regionEntries = (ai?.regionDetails ?? []).length > 0
        ? ai!.regionDetails
        : uniqueSeedTexts(16, ai?.regions).map((region: string): SemanticCatalogEntrySummary => ({
            name: extractNamedLeadSegment(region),
            summary: region,
            knowledgeLevel: 'confirmed',
        })).filter((item: SemanticCatalogEntrySummary): boolean => Boolean(item.name));

    regionEntries.forEach((entry: SemanticCatalogEntrySummary, index: number): void => {
        const name = extractNamedLeadSegment(entry.name) || extractNamedLeadSegment(entry.summary);
        if (!name) {
            return;
        }
        const nationName = extractNationEntityLabel(normalizeSeedText(entry.nationName) || '');
        const strictCanonical = buildCatalogCanonicalKey('region', name, nationName, name, undefined);
        const value = buildStateValue({
            title: name,
            summary: normalizeSeedText(entry.summary) || name,
            scopeType: 'region',
            stateType: 'status',
            sourceLabel: 'seed_ai_region',
            knowledgeLevel: normalizeKnowledgeLevel(entry.knowledgeLevel, 'confirmed'),
            nationName: nationName || undefined,
            nationKnowledgeLevel: normalizeKnowledgeLevel(entry.nationKnowledgeLevel, 'confirmed'),
            regionName: name,
            regionKnowledgeLevel: normalizeKnowledgeLevel(entry.regionKnowledgeLevel, 'confirmed'),
            canonicalKey: strictCanonical,
            tags: entry.tags ?? [],
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/catalog/regions/${slugifySeedText(name, `region-${index + 1}`)}`,
            value,
            strictCanonical,
            looseCanonical: buildCatalogLooseCanonicalKey('region', name),
            allowLooseMerge: true,
        });
    });

    const cityEntries = (ai?.cityDetails ?? []).length > 0
        ? ai!.cityDetails
        : uniqueSeedTexts(16, ai?.cities).map((city: string): SemanticCatalogEntrySummary => ({
            name: extractNamedLeadSegment(city),
            summary: city,
            knowledgeLevel: 'confirmed',
        })).filter((item: SemanticCatalogEntrySummary): boolean => Boolean(item.name));

    cityEntries.forEach((entry: SemanticCatalogEntrySummary, index: number): void => {
        const name = extractNamedLeadSegment(entry.name) || extractNamedLeadSegment(entry.summary);
        if (!name) {
            return;
        }
        const nationName = extractNationEntityLabel(normalizeSeedText(entry.nationName) || '');
        const regionName = extractNamedLeadSegment(normalizeSeedText(entry.regionName) || '');
        const strictCanonical = buildCatalogCanonicalKey('city', name, nationName, regionName, name);
        const value = buildStateValue({
            title: name,
            summary: normalizeSeedText(entry.summary) || name,
            scopeType: 'city',
            stateType: 'status',
            sourceLabel: 'seed_ai_city',
            knowledgeLevel: normalizeKnowledgeLevel(entry.knowledgeLevel, 'confirmed'),
            nationName: nationName || undefined,
            nationKnowledgeLevel: normalizeKnowledgeLevel(entry.nationKnowledgeLevel, 'confirmed'),
            regionName: regionName || undefined,
            regionKnowledgeLevel: normalizeKnowledgeLevel(entry.regionKnowledgeLevel, 'confirmed'),
            cityName: name,
            cityKnowledgeLevel: normalizeKnowledgeLevel(entry.cityKnowledgeLevel, 'confirmed'),
            canonicalKey: strictCanonical,
            tags: entry.tags ?? [],
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/catalog/cities/${slugifySeedText(name, `city-${index + 1}`)}`,
            value,
            strictCanonical,
            looseCanonical: buildCatalogLooseCanonicalKey('city', name),
            allowLooseMerge: true,
        });
    });

    const locationEntries = (ai?.locationDetails ?? []).length > 0
        ? ai!.locationDetails
        : uniqueSeedTexts(24, ai?.locations).map((location: string): SemanticCatalogEntrySummary => ({
            name: extractNamedLeadSegment(location),
            summary: location,
            knowledgeLevel: 'confirmed',
        })).filter((item: SemanticCatalogEntrySummary): boolean => Boolean(item.name));

    locationEntries.forEach((entry: SemanticCatalogEntrySummary, index: number): void => {
        const name = extractNamedLeadSegment(entry.name) || extractNamedLeadSegment(entry.summary);
        if (!name) {
            return;
        }
        const nationName = extractNationEntityLabel(normalizeSeedText(entry.nationName) || '');
        const regionName = extractNamedLeadSegment(normalizeSeedText(entry.regionName) || '');
        const rawCityName = extractNamedLeadSegment(normalizeSeedText(entry.cityName) || '');
        const cityName = normalizeCanonicalPart(rawCityName) === normalizeCanonicalPart(name) ? '' : rawCityName;
        const strictCanonical = buildCatalogCanonicalKey('location', name, nationName, regionName, cityName);
        const value = buildStateValue({
            title: name,
            summary: normalizeSeedText(entry.summary) || name,
            scopeType: 'location',
            stateType: 'status',
            sourceLabel: 'seed_ai_location',
            knowledgeLevel: normalizeKnowledgeLevel(entry.knowledgeLevel, 'confirmed'),
            nationName: nationName || undefined,
            nationKnowledgeLevel: normalizeKnowledgeLevel(entry.nationKnowledgeLevel, 'confirmed'),
            regionName: regionName || undefined,
            regionKnowledgeLevel: normalizeKnowledgeLevel(entry.regionKnowledgeLevel, 'confirmed'),
            cityName: cityName || undefined,
            cityKnowledgeLevel: cityName ? normalizeKnowledgeLevel(entry.cityKnowledgeLevel, 'confirmed') : undefined,
            locationName: name,
            canonicalKey: strictCanonical,
            tags: entry.tags ?? [],
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/catalog/locations/${slugifySeedText(name, `location-${index + 1}`)}`,
            value,
            strictCanonical,
            looseCanonical: buildCatalogLooseCanonicalKey('location', name),
            allowLooseMerge: true,
        });
    });

    const organizationDetails = ai?.organizationDetails ?? [];
    const organizationEntries = organizationDetails.length > 0
        ? organizationDetails
        : uniqueSeedTexts(16, ai?.organizations).map((name: string) => ({
            name,
            summary: name,
            aliases: [],
            parentOrganizationName: '',
            ownershipStatus: '',
            relatedActorKeys: [],
            locationName: '',
        }));

    organizationEntries.forEach((organization, index: number): void => {
        const title = extractNamedLeadSegment(normalizeSeedText(organization.name)) || normalizeSeedText(organization.name);
        if (!title) {
            return;
        }
        const strictCanonical = ['catalog', 'organization', normalizeCanonicalPart(title) || '_'].join('::');
        const mergedSummary = uniqueSeedTexts(
            2,
            [normalizeSeedText(organization.summary)],
            [normalizeSeedText(organization.ownershipStatus)],
        ).join('；') || title;
        const value = buildStateValue({
            title,
            summary: mergedSummary,
            scopeType: 'organization',
            stateType: 'ownership',
            sourceLabel: 'seed_ai_organization',
            locationName: normalizeSeedText(organization.locationName) || undefined,
            canonicalKey: strictCanonical,
            tags: uniqueSeedTexts(12, organization.aliases ?? [], organization.relatedActorKeys ?? []),
        });
        value.parentOrganizationName = normalizeSeedText(organization.parentOrganizationName) || undefined;
        value.ownershipStatus = normalizeSeedText(organization.ownershipStatus) || undefined;
        value.relatedActorKeys = uniqueSeedTexts(16, organization.relatedActorKeys ?? []);
        value.organizationAliases = uniqueSeedTexts(8, organization.aliases ?? []);
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/catalog/organizations/${slugifySeedText(title, `organization-${index + 1}`)}`,
            value,
            strictCanonical,
        });
    });

    collectWorldFacetEntries(seed).forEach((facetEntry: SemanticWorldFacetEntry, index: number): void => {
        const title = normalizeSeedText(facetEntry.title) || extractNamedLeadSegment(facetEntry.summary);
        const summary = normalizeSeedText(facetEntry.summary) || title;
        if (!title && !summary) {
            return;
        }
        const prefix = resolveFacetPathPrefix(facetEntry.facet);
        const strictCanonical = buildFacetCanonicalKey(
            facetEntry.facet,
            title || summary,
            summary,
            facetEntry.scopeType ?? 'global',
            facetEntry.nationName,
            facetEntry.regionName,
            facetEntry.cityName,
            facetEntry.locationName,
        );
        const slug = slugifySeedText(title || summary, `${facetEntry.facet}-${index + 1}`);
        const path = `${prefix}/${slug}`;
        const value = buildStateValue({
            title: title || summary,
            summary,
            scopeType: facetEntry.scopeType ?? 'global',
            stateType: resolveFacetStateType(facetEntry.facet),
            sourceLabel: `seed_ai_${facetEntry.facet}`,
            knowledgeLevel: normalizeKnowledgeLevel(facetEntry.knowledgeLevel, 'confirmed'),
            nationName: normalizeSeedText(facetEntry.nationName) || undefined,
            regionName: normalizeSeedText(facetEntry.regionName) || undefined,
            cityName: normalizeSeedText(facetEntry.cityName) || undefined,
            locationName: normalizeSeedText(facetEntry.locationName) || undefined,
            subjectId: normalizeSeedText(facetEntry.appliesTo) || undefined,
            canonicalKey: strictCanonical,
            tags: facetEntry.tags ?? [],
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path,
            value,
            strictCanonical,
        });
    });

    const roleKey = normalizeSeedText(seed.identitySeed?.roleKey);
    const actorSlug = slugifySeedText(roleKey || seed.identitySeed?.displayName || 'character', 'character');

    uniqueSeedTexts(16, seed.identitySeed.relationshipAnchors, ai?.relationshipAnchors, ai?.relationshipFacts).forEach((text: string, index: number): void => {
        const canonical = ['character-relationship', actorSlug, normalizeCanonicalPart(text) || `_r_${index + 1}`].join('::');
        const value = buildStateValue({
            title: extractNamedLeadSegment(text) || text,
            summary: text,
            scopeType: 'character',
            stateType: 'relationship',
            sourceLabel: 'seed_relationship',
            subjectId: roleKey || actorSlug,
            canonicalKey: canonical,
        });
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/characters/${actorSlug}/relationships/${slugifySeedText(text, `relationship-${index + 1}`)}`,
            value,
            strictCanonical: canonical,
        });
    });

    const taskDetails = ai?.taskDetails ?? [];
    const explicitTaskSignatures = new Set<string>();
    taskDetails.forEach((task, index: number): void => {
        const title = extractNamedLeadSegment(normalizeSeedText(task.title)) || normalizeSeedText(task.title) || extractNamedLeadSegment(normalizeSeedText(task.summary));
        if (!title || isLegacyTaskNoiseTitle(title)) {
            return;
        }
        if ([
            task.title,
            task.summary,
            task.objective,
            task.completionCriteria,
            task.progressNote,
        ].some((item: unknown): boolean => containsLegacyTaskPayload(item))) {
            return;
        }
        const taskSignature = normalizeCanonicalPart(title);
        if (taskSignature) {
            explicitTaskSignatures.add(taskSignature);
        }
        const canonical = ['task', normalizeCanonicalPart(title) || `_t_${index + 1}`].join('::');
        const status = normalizeSeedTaskStatus(task.status) || 'pending';
        const summary = uniqueSeedTexts(
            3,
            [normalizeSeedText(task.summary)],
            [normalizeSeedText(task.objective)],
            [normalizeSeedText(task.progressNote)],
        ).join('；') || title;
        const value = buildStateValue({
            title,
            summary,
            scopeType: normalizeSeedText(task.locationName) ? 'location' : 'global',
            stateType: 'task',
            sourceLabel: 'seed_ai_task',
            subjectId: uniqueSeedTexts(1, task.ownerActorKeys ?? [])[0] || (roleKey || actorSlug),
            locationName: normalizeSeedText(task.locationName) || undefined,
            canonicalKey: canonical,
            tags: uniqueSeedTexts(12, task.organizationNames ?? [], task.ownerActorKeys ?? []),
        });
        value.status = status;
        value.objective = normalizeSeedText(task.objective) || undefined;
        value.completionCriteria = normalizeSeedText(task.completionCriteria) || undefined;
        value.progressNote = normalizeSeedText(task.progressNote) || undefined;
        value.ownerActorKeys = uniqueSeedTexts(16, task.ownerActorKeys ?? []);
        value.organizationNames = uniqueSeedTexts(12, task.organizationNames ?? []);
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/tasks/${slugifySeedText(title, `task-${index + 1}`)}`,
            value,
            strictCanonical: canonical,
        });
    });

    uniqueSeedTexts(16, ai?.tasks).forEach((text: string, index: number): void => {
        const title = extractNamedLeadSegment(text) || text;
        const taskSignature = normalizeCanonicalPart(title || text);
        if (!title || isLegacyTaskNoiseTitle(title) || containsLegacyTaskPayload(text)) {
            return;
        }
        if (taskSignature && explicitTaskSignatures.has(taskSignature)) {
            return;
        }
        const canonical = ['task', normalizeCanonicalPart(title) || `_t_text_${index + 1}`].join('::');
        const value = buildStateValue({
            title,
            summary: text,
            scopeType: 'global',
            stateType: 'task',
            sourceLabel: 'seed_task',
            subjectId: roleKey || actorSlug,
            canonicalKey: canonical,
        });
        value.status = 'pending';
        upsertMergedEntry(entries, canonicalToPath, {
            path: `/semantic/tasks/${slugifySeedText(title, `task-${index + 1}`)}`,
            value,
            strictCanonical: canonical,
        });
    });

    return Array.from(entries.values()).map((item: MergedEntry): StructuredSeedWorldStateEntry => ({
        path: item.path,
        value: item.value,
    }));
}
