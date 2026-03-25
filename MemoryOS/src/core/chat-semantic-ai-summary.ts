import type {
    ChatSemanticSeed,
    SemanticAiSummary,
    SemanticAiRoleAssetSummary,
    SemanticAiRoleProfileSummary,
    SemanticAiRoleRelationshipSummary,
    SemanticCatalogEntrySummary,
    SemanticKnowledgeLevel,
    SemanticWorldFacetEntry,
    IdentitySeed,
    RoleAssetEntry,
    RoleProfile,
    RoleRelationshipFact,
} from '../types/chat-state';
import { logger } from '../index';
import { runGeneration, MEMORY_TASKS, type TaskPresentationOverride } from '../llm/memoryLlmBridge';
import { buildColdstartOperationSystemPrompt } from '../llm/skills';
import { normalizeTavernRoleKeyEvent } from '../../../SDK/tavern';
import { buildAiJsonPromptBundle } from './ai-json-builder';
import { applyAiJsonOutput, validateAiJsonOutput } from './ai-json-system';


export interface EnhanceSemanticSeedWithAiOptions {
    force?: boolean;
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
    taskDescription?: string;
}

type SemanticSeedAiSummary = Omit<SemanticAiSummary, 'generatedAt' | 'source'>;

const SEMANTIC_AI_JSON_NAMESPACE_KEYS = ['semantic_summary', 'role'] as const;

const NATION_PATTERN = /国家|政体|王国|帝国|联邦|共和国|王朝|nation|country|kingdom|empire|republic|federation|realm/i;
const REGION_PATTERN = /区域|地理|大陆|边境|北境|南境|西境|东境|州|郡|领|region|area|province|territory|continent|frontier/i;
const CITY_PATTERN = /城市|都城|城邦|主城|镇|村|聚落|港口|港城|城镇|city|capital|metropolis|town|village|settlement|harbor/i;
const LOCATION_PATTERN = /地点|场所|遗迹|据点|神殿|学院|基地|空间站|房间|森林|峡谷|湖泊|location|place|site|ruin|outpost|temple|academy|base|station|room|forest|canyon|lake/i;
const FACTION_PATTERN = /组织|阵营|派系|公会|教团|军团|学派|议会|协会|结社|faction|guild|order|clan|alliance|council|union/i;
const RULE_PATTERN = /规则|法则|法律|法典|条例|机制|运作规律|法理|rule|law|canon|principle|system/i;
const CONSTRAINT_PATTERN = /限制|禁忌|不能|不可|不得|禁止|绝不|唯一|固定|必须遵守|constraint|taboo|restriction|forbidden|must not/i;
const CALENDAR_PATTERN = /历法|纪年|历年|年号|月相|节气|calendar|chronology|era|dating system/i;
const CURRENCY_PATTERN = /货币|钱币|金币|银币|铜币|纸钞|税制|汇兑|面额|currency|coin|money|tax|exchange/i;
const SOCIAL_PATTERN = /阶级|等级|身份制度|政治制度|社会制度|贵族制|君主制|共和制|议会制|social system|hierarchy|caste|class/i;
const CULTURE_PATTERN = /文化|习俗|风俗|礼仪|传统|节庆|祭典|成年礼|婚俗|葬礼|culture|custom|tradition|ritual|festival/i;
const HISTORY_PATTERN = /历史|往事|旧日|起源|战争|历史事件|history|origin|past|war/i;
const DANGER_PATTERN = /危险|威胁|风险|灾难|危机|danger|threat|risk|crisis/i;
const GOAL_PATTERN = /目标|想要|必须|计划|打算|任务|goal|objective|intent|mission|plan/i;
const RELATIONSHIP_PATTERN = /关系|信任|敌对|盟友|同伴|羁绊|恋人|导师|relationship|bond|trust|ally|enemy/i;
const IDENTITY_PATTERN = /身份|血统|别名|称号|职业|来历|出身|identity|alias|title|background|lineage/i;
const ENTITY_PATTERN = /机构|设施|装置|神器|遗物|系统核心|核心装置|entity|artifact|relic|device|institution/i;

function toStringArray(value: unknown, limit: number = 16): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return uniqueTexts(limit, value as unknown[]);
}

/**
 * 功能：规范化 AI 输出的角色关系条目数组。
 * @param value 原始数组。
 * @returns 可安全写入状态的角色关系条目数组。
 */
function normalizeAiRoleRelationshipArray(value: unknown): SemanticAiRoleRelationshipSummary[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: SemanticAiRoleRelationshipSummary[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return;
        }
        const record = item as Record<string, unknown>;
        const targetLabel = normalizeText(record.targetLabel);
        const label = normalizeText(record.label);
        const detail = normalizeText(record.detail);
        if (!targetLabel && !detail) {
            return;
        }
        const signature = `${targetLabel.toLowerCase()}::${label.toLowerCase()}::${detail.toLowerCase()}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push({
            targetActorKey: normalizeText(record.targetActorKey) || undefined,
            targetLabel: targetLabel || '未标注对象',
            label: label || '关系事实',
            detail: detail || targetLabel,
        });
    });
    return result.slice(0, 16);
}

/**
 * 功能：规范化 AI 输出的角色资产条目数组。
 * @param value 原始数组。
 * @returns 可安全写入状态的角色资产条目数组。
 */
function normalizeAiRoleAssetArray(value: unknown): SemanticAiRoleAssetSummary[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: SemanticAiRoleAssetSummary[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return;
        }
        const record = item as Record<string, unknown>;
        const kindRaw = normalizeText(record.kind).toLowerCase();
        const kind: SemanticAiRoleAssetSummary['kind'] = kindRaw === 'equipment' ? 'equipment' : 'item';
        const name = normalizeText(record.name);
        const detail = normalizeText(record.detail);
        if (!name && !detail) {
            return;
        }
        const signature = `${kind}:${name.toLowerCase()}:${detail.toLowerCase()}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push({
            kind,
            name: name || detail || '未命名条目',
            detail,
        });
    });
    return result.slice(0, 24);
}

/**
 * 功能：规范化 AI 输出的角色资料 JSON 数组。
 * @param value 原始数组。
 * @returns 可安全写入状态的角色资料数组。
 */
function normalizeAiRoleProfileArray(value: unknown): SemanticAiRoleProfileSummary[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: SemanticAiRoleProfileSummary[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return;
        }
        const record = item as Record<string, unknown>;
        const displayName = normalizeText(record.displayName);
        const actorKey = normalizeText(record.actorKey);
        if (!displayName && !actorKey) {
            return;
        }
        const signature = `${(actorKey || displayName).toLowerCase()}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push({
            actorKey: actorKey || undefined,
            displayName: displayName || actorKey,
            aliases: toStringArray(record.aliases, 8),
            identityFacts: toStringArray(record.identityFacts, 16),
            originFacts: toStringArray(record.originFacts, 12),
            relationshipFacts: normalizeAiRoleRelationshipArray(record.relationshipFacts),
            items: normalizeAiRoleAssetArray(record.items).filter((asset: SemanticAiRoleAssetSummary): boolean => asset.kind === 'item'),
            equipments: normalizeAiRoleAssetArray(record.equipments).filter((asset: SemanticAiRoleAssetSummary): boolean => asset.kind === 'equipment'),
        });
    });
    return result.slice(0, 24);
}

/**
 * 功能：创建空的语义摘要对象，供文档构建与增量更新复用。
 * @returns 空的语义摘要对象。
 */
function createEmptySemanticSeedAiSummary(): SemanticSeedAiSummary {
    return {
        roleSummary: '',
        worldSummary: '',
        identityFacts: [],
        worldRules: [],
        hardConstraints: [],
        cities: [],
        locations: [],
        entities: [],
        nations: [],
        regions: [],
        factions: [],
        calendarSystems: [],
        currencySystems: [],
        socialSystems: [],
        culturalPractices: [],
        historicalEvents: [],
        dangers: [],
        otherWorldDetails: [],
        characterGoals: [],
        relationshipFacts: [],
        catchphrases: [],
        relationshipAnchors: [],
        styleCues: [],
        nationDetails: [],
        regionDetails: [],
        cityDetails: [],
        locationDetails: [],
        ruleDetails: [],
        constraintDetails: [],
        socialSystemDetails: [],
        culturalPracticeDetails: [],
        historicalEventDetails: [],
        dangerDetails: [],
        entityDetails: [],
        otherWorldDetailDetails: [],
        roleProfiles: [],
    };
}

/**
 * 功能：构建语义摘要命名空间文档。
 * @param summary 当前语义摘要。
 * @returns semantic_summary 命名空间对象。
 */
function buildSemanticSummaryNamespace(summary?: SemanticAiSummary | null): Record<string, unknown> {
    const base = createEmptySemanticSeedAiSummary();
    const current = summary ?? null;
    return {
        ...base,
        roleSummary: normalizeText(current?.roleSummary),
        worldSummary: normalizeText(current?.worldSummary),
        identityFacts: uniqueTexts(12, current?.identityFacts ?? []),
        worldRules: uniqueTexts(16, current?.worldRules ?? []),
        hardConstraints: uniqueTexts(12, current?.hardConstraints ?? []),
        cities: normalizeNamedSummaryTexts(current?.cities ?? []),
        locations: normalizeNamedSummaryTexts(current?.locations ?? []),
        entities: uniqueTexts(12, current?.entities ?? []),
        nations: normalizeNationSummaryTexts(current?.nations ?? []),
        regions: normalizeNamedSummaryTexts(current?.regions ?? []),
        factions: uniqueTexts(12, current?.factions ?? []),
        calendarSystems: uniqueTexts(12, current?.calendarSystems ?? []),
        currencySystems: uniqueTexts(12, current?.currencySystems ?? []),
        socialSystems: uniqueTexts(12, current?.socialSystems ?? []),
        culturalPractices: uniqueTexts(12, current?.culturalPractices ?? []),
        historicalEvents: uniqueTexts(12, current?.historicalEvents ?? []),
        dangers: uniqueTexts(12, current?.dangers ?? []),
        otherWorldDetails: uniqueTexts(12, current?.otherWorldDetails ?? []),
        characterGoals: uniqueTexts(8, current?.characterGoals ?? []),
        relationshipFacts: uniqueTexts(8, current?.relationshipFacts ?? []),
        catchphrases: uniqueTexts(8, current?.catchphrases ?? []),
        relationshipAnchors: uniqueTexts(8, current?.relationshipAnchors ?? []),
        styleCues: uniqueTexts(10, current?.styleCues ?? []),
        nationDetails: normalizeCatalogEntrySummaryArray(current?.nationDetails ?? []),
        regionDetails: normalizeCatalogEntrySummaryArray(current?.regionDetails ?? []),
        cityDetails: normalizeCatalogEntrySummaryArray(current?.cityDetails ?? []),
        locationDetails: normalizeCatalogEntrySummaryArray(current?.locationDetails ?? []),
        ruleDetails: normalizeWorldFacetEntryArray(current?.ruleDetails ?? [], 'rule'),
        constraintDetails: normalizeWorldFacetEntryArray(current?.constraintDetails ?? [], 'constraint'),
        socialSystemDetails: normalizeWorldFacetEntryArray(current?.socialSystemDetails ?? [], 'social'),
        culturalPracticeDetails: normalizeWorldFacetEntryArray(current?.culturalPracticeDetails ?? [], 'culture'),
        historicalEventDetails: normalizeWorldFacetEntryArray(current?.historicalEventDetails ?? [], 'history'),
        dangerDetails: normalizeWorldFacetEntryArray(current?.dangerDetails ?? [], 'danger'),
        entityDetails: normalizeWorldFacetEntryArray(current?.entityDetails ?? [], 'entity'),
        otherWorldDetailDetails: normalizeWorldFacetEntryArray(current?.otherWorldDetailDetails ?? [], 'other'),
    };
}

/**
 * 功能：构建角色命名空间文档。
 * @param seed 当前语义种子。
 * @returns role 命名空间对象。
 */
function buildRoleNamespace(seed: ChatSemanticSeed): Record<string, unknown> {
    const profiles = Object.entries(seed.roleProfileSeeds ?? {}).reduce<Record<string, unknown>>((result: Record<string, unknown>, [actorKey, profile]: [string, RoleProfile]): Record<string, unknown> => {
        const normalizedActorKey = normalizeAiActorKey(actorKey || profile.actorKey);
        if (!normalizedActorKey) {
            return result;
        }
        result[normalizedActorKey] = {
            actorKey: normalizedActorKey,
            displayName: normalizeText(profile.displayName),
            aliases: uniqueTexts(8, profile.aliases ?? []),
            identityFacts: uniqueTexts(16, profile.identityFacts ?? []),
            originFacts: uniqueTexts(12, profile.originFacts ?? []),
            relationshipFacts: (profile.relationshipFacts ?? []).map((item: RoleRelationshipFact): Record<string, unknown> => ({
                targetActorKey: normalizeText(item.targetActorKey) || null,
                targetLabel: normalizeText(item.targetLabel),
                label: normalizeText(item.label),
                detail: normalizeText(item.detail),
            })),
            items: (profile.items ?? []).map((item: RoleAssetEntry): Record<string, unknown> => ({
                kind: item.kind,
                name: normalizeText(item.name),
                detail: normalizeText(item.detail),
            })),
            equipments: (profile.equipments ?? []).map((item: RoleAssetEntry): Record<string, unknown> => ({
                kind: item.kind,
                name: normalizeText(item.name),
                detail: normalizeText(item.detail),
            })),
            updatedAt: Number(profile.updatedAt ?? 0) || 0,
        };
        return result;
    }, {});
    return {
        profiles,
        activeActorKey: normalizeAiActorKey(seed.identitySeed.roleKey || seed.identitySeed.displayName) || '',
        summary: {
            overview: normalizeText(seed.aiSummary?.roleSummary) || `${Object.keys(profiles).length} 个角色模板已接入 AI JSON 系统`,
            updatedAt: Number(seed.aiSummary?.generatedAt ?? seed.collectedAt ?? Date.now()) || Date.now(),
        },
    };
}

/**
 * 功能：把当前语义种子转成 AI JSON 文档。
 * @param seed 当前语义种子。
 * @returns 按命名空间组织的文档。
 */
export function buildSemanticSeedAiJsonDocument(seed: ChatSemanticSeed): Record<string, unknown> {
    return {
        semantic_summary: buildSemanticSummaryNamespace(seed.aiSummary ?? null),
        role: buildRoleNamespace(seed),
    };
}

/**
 * 功能：生成语义摘要系统的统一 AI JSON prompt 资源包。
 * @param mode 输出模式。
 * @returns prompt 资源包。
 */
export function buildSemanticSeedAiJsonPromptBundle(mode: 'init' | 'update') {
    return buildAiJsonPromptBundle({
        mode,
        namespaceKeys: [...SEMANTIC_AI_JSON_NAMESPACE_KEYS],
    });
}

/**
 * 功能：把统一 AI JSON 外壳应用到当前语义种子。
 * @param seed 当前语义种子。
 * @param payload AI 输出外壳。
 * @param mode 输出模式。
 * @returns 应用后的语义种子，失败时返回空值。
 */
export function applySemanticSeedAiJsonPayload(
    seed: ChatSemanticSeed,
    payload: unknown,
    mode: 'init' | 'update' = 'init',
): ChatSemanticSeed | null {
    const validated = validateAiJsonOutput({
        mode,
        namespaceKeys: [...SEMANTIC_AI_JSON_NAMESPACE_KEYS],
        payload,
    });
    if (!validated.ok || !validated.payload) {
        return null;
    }
    const applied = applyAiJsonOutput({
        document: buildSemanticSeedAiJsonDocument(seed),
        payload: validated.payload,
        namespaceKeys: [...SEMANTIC_AI_JSON_NAMESPACE_KEYS],
    });
    const normalizedSummary = normalizeSemanticSeedAiSummary({
        mode: 'init',
        namespaces: applied.document,
        updates: [],
        meta: {},
    });
    if (!normalizedSummary) {
        return null;
    }
    return mergeAiSummary(seed, normalizedSummary);
}

/**
 * 功能：把统一 AI JSON 外壳还原成当前摘要归一化函数可消费的对象。
 * @param value 原始 AI 输出。
 * @returns 提取出的摘要对象，无法提取时返回空值。
 */
function extractAiJsonSummaryRecord(value: unknown): Record<string, unknown> | null {
    const validated = validateAiJsonOutput({
        mode: 'init',
        namespaceKeys: [...SEMANTIC_AI_JSON_NAMESPACE_KEYS],
        payload: value,
    });
    if (!validated.ok || !validated.payload) {
        return null;
    }
    const semanticSummary = (validated.payload.namespaces.semantic_summary ?? {}) as Record<string, unknown>;
    const roleNamespace = (validated.payload.namespaces.role ?? {}) as Record<string, unknown>;
    const rawProfiles = Array.isArray(roleNamespace.profiles)
        ? roleNamespace.profiles.reduce<Record<string, unknown>>((result: Record<string, unknown>, item: unknown): Record<string, unknown> => {
            if (!isRecord(item)) {
                return result;
            }
            const actorKey = normalizeText(item.actorKey) || normalizeText(item.displayName);
            if (!actorKey) {
                return result;
            }
            result[actorKey] = item;
            return result;
        }, {})
        : (isRecord(roleNamespace.profiles) ? roleNamespace.profiles : {});
    const roleProfiles = Object.entries(rawProfiles).map(([actorKey, item]: [string, unknown]): Record<string, unknown> => {
        const profile = isRecord(item) ? item : {};
        return {
            actorKey,
            displayName: normalizeText(profile.displayName) || actorKey,
            aliases: toStringArray(profile.aliases, 8),
            identityFacts: toStringArray(profile.identityFacts, 16),
            originFacts: toStringArray(profile.originFacts, 12),
            relationshipFacts: Array.isArray(profile.relationshipFacts) ? profile.relationshipFacts : [],
            items: Array.isArray(profile.items) ? profile.items : [],
            equipments: Array.isArray(profile.equipments) ? profile.equipments : [],
        };
    });
    return {
        ...semanticSummary,
        roleProfiles,
    };
}

/**
 * 功能：判断值是否为普通对象。
 * @param value 待判断值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeSemanticSeedAiSummary(value: unknown): SemanticSeedAiSummary | null {
    const extracted = extractAiJsonSummaryRecord(value);
    const baseValue = extracted ?? value;
    if (!baseValue || typeof baseValue !== 'object' || Array.isArray(baseValue)) {
        return null;
    }

    const direct = baseValue as Record<string, unknown>;
    const directRoleSummary = normalizeText(direct.roleSummary);
    const directWorldSummary = normalizeText(direct.worldSummary);
    if (
        directRoleSummary
        || directWorldSummary
        || Array.isArray(direct.identityFacts)
        || Array.isArray(direct.worldRules)
        || Array.isArray(direct.cities)
        || Array.isArray(direct.nations)
        || Array.isArray(direct.regions)
        || Array.isArray(direct.factions)
        || Array.isArray(direct.calendarSystems)
        || Array.isArray(direct.currencySystems)
        || Array.isArray(direct.socialSystems)
        || Array.isArray(direct.culturalPractices)
        || Array.isArray(direct.otherWorldDetails)
        || Array.isArray(direct.nationDetails)
        || Array.isArray(direct.regionDetails)
        || Array.isArray(direct.cityDetails)
        || Array.isArray(direct.locationDetails)
        || Array.isArray(direct.ruleDetails)
        || Array.isArray(direct.constraintDetails)
        || Array.isArray(direct.socialSystemDetails)
        || Array.isArray(direct.culturalPracticeDetails)
        || Array.isArray(direct.historicalEventDetails)
        || Array.isArray(direct.dangerDetails)
        || Array.isArray(direct.entityDetails)
        || Array.isArray(direct.otherWorldDetailDetails)
        || Array.isArray(direct.roleProfiles)
    ) {
        return {
            roleSummary: directRoleSummary,
            worldSummary: directWorldSummary,
            identityFacts: toStringArray(direct.identityFacts, 12),
            worldRules: toStringArray(direct.worldRules, 16),
            hardConstraints: toStringArray(direct.hardConstraints, 12),
            cities: normalizeNamedSummaryTexts(toStringArray(direct.cities, 12)),
            locations: normalizeNamedSummaryTexts(toStringArray(direct.locations, 12)),
            entities: toStringArray(direct.entities, 12),
            nations: normalizeNationSummaryTexts(toStringArray(direct.nations, 12)),
            regions: normalizeNamedSummaryTexts(toStringArray(direct.regions, 12)),
            factions: toStringArray(direct.factions, 12),
            calendarSystems: toStringArray(direct.calendarSystems, 12),
            currencySystems: toStringArray(direct.currencySystems, 12),
            socialSystems: toStringArray(direct.socialSystems, 12),
            culturalPractices: toStringArray(direct.culturalPractices, 12),
            historicalEvents: toStringArray(direct.historicalEvents, 12),
            dangers: toStringArray(direct.dangers, 12),
            otherWorldDetails: toStringArray(direct.otherWorldDetails, 12),
            characterGoals: toStringArray(direct.characterGoals, 8),
            relationshipFacts: toStringArray(direct.relationshipFacts, 8),
            catchphrases: toStringArray(direct.catchphrases, 8),
            relationshipAnchors: toStringArray(direct.relationshipAnchors, 8),
            styleCues: toStringArray(direct.styleCues, 10),
            nationDetails: normalizeCatalogEntrySummaryArray(direct.nationDetails),
            regionDetails: normalizeCatalogEntrySummaryArray(direct.regionDetails),
            cityDetails: normalizeCatalogEntrySummaryArray(direct.cityDetails),
            locationDetails: normalizeCatalogEntrySummaryArray(direct.locationDetails),
            ruleDetails: normalizeWorldFacetEntryArray(direct.ruleDetails, 'rule'),
            constraintDetails: normalizeWorldFacetEntryArray(direct.constraintDetails, 'constraint'),
            socialSystemDetails: normalizeWorldFacetEntryArray(direct.socialSystemDetails, 'social'),
            culturalPracticeDetails: normalizeWorldFacetEntryArray(direct.culturalPracticeDetails, 'culture'),
            historicalEventDetails: normalizeWorldFacetEntryArray(direct.historicalEventDetails, 'history'),
            dangerDetails: normalizeWorldFacetEntryArray(direct.dangerDetails, 'danger'),
            entityDetails: normalizeWorldFacetEntryArray(direct.entityDetails, 'entity'),
            otherWorldDetailDetails: normalizeWorldFacetEntryArray(direct.otherWorldDetailDetails, 'other'),
            roleProfiles: normalizeAiRoleProfileArray(direct.roleProfiles),
        };
    }

    return null;
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueTexts(limit: number, ...groups: unknown[][]): string[] {
    return Array.from(new Set(
        groups
            .flat()
            .map((item: unknown): string => normalizeText(item))
            .filter((item: string): boolean => item.length >= 2),
    )).slice(0, limit);
}

/**
 * 功能：从国家/政体描述中提取明确的国家名字。
 * @param value 原始国家描述。
 * @returns 可用于国家字段的名字；无法确认时返回空字符串。
 */
function extractNationEntityLabel(value: string): string {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }
    const candidates = Array.from(
        normalized.matchAll(/([A-Za-z0-9\u4e00-\u9fa5·]{2,20}(?:王朝|帝国|王国|联邦|共和国|公国|汗国|联盟|国))/g),
    ).map((item: RegExpMatchArray): string => normalizeText(item[1]));
    const invalidPattern = /社会|结构|制度|政治|经济|军事|婚姻|女子|男子|为尊|为附|开国|盛世|架空|古代|现代|治理|权力|主导|继承|女娶男嫁/;
    for (const candidate of candidates) {
        if (!candidate || invalidPattern.test(candidate) || candidate.length > 16) {
            continue;
        }
        return candidate;
    }
    return '';
}

/**
 * 功能：规范化 AI 摘要中的国家列表，只保留明确国家名。
 * @param values 原始国家数组。
 * @returns 过滤后的国家名数组。
 */
function normalizeNationSummaryTexts(values: string[]): string[] {
    return uniqueTexts(
        12,
        values
            .map((item: string): string => extractNationEntityLabel(item))
            .filter(Boolean),
    );
}

/**
 * 功能：规范化区域、城市、地点名称数组，只保留名字。
 * @param values 原始名称数组。
 * @returns 过滤后的名称数组。
 */
function normalizeNamedSummaryTexts(values: string[]): string[] {
    return uniqueTexts(
        12,
        values
            .map((item: string): string => extractNamedLeadSegment(item))
            .filter(Boolean),
    );
}

/**
 * 功能：从描述中提取适合区域、城市、地点的简短名称。
 * @param value 原始描述文本。
 * @returns 提取出的名称；无法确认时返回空字符串。
 */
function extractNamedLeadSegment(value: string): string {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }
    const lead = normalized
        .split(/[：:，,；;。!！?？\n]/)[0]
        .trim()
        .split(/\s*[-—]\s*/)[0]
        .trim();
    const invalidPattern = /政治|经济|军事|制度|结构|领域|主导权|所有领域|休憩游玩之所|举行大典之所|最受宠的君后寝宫/;
    if (!lead || lead.length > 16 || invalidPattern.test(lead)) {
        return '';
    }
    return lead;
}

/**
 * 功能：规范化目录实体详情数组。
 * @param value 原始详情列表。
 * @returns 结构化后的实体详情。
 */
function normalizeKnowledgeLevel(value: unknown, fallback: SemanticKnowledgeLevel = 'confirmed'): SemanticKnowledgeLevel {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === 'rumor' || normalized === 'inferred' || normalized === 'confirmed') {
        return normalized;
    }
    return fallback;
}

function normalizeCatalogEntrySummaryArray(value: unknown): SemanticCatalogEntrySummary[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: SemanticCatalogEntrySummary[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return;
        }
        const record = item as Record<string, unknown>;
        const rawName = normalizeText(record.name);
        const summary = normalizeText(record.summary);
        const name = rawName || extractNamedLeadSegment(summary);
        if (!name) {
            return;
        }
        const nationName = normalizeText(record.nationName) || undefined;
        const regionName = normalizeText(record.regionName) || undefined;
        const cityName = normalizeText(record.cityName) || undefined;
        const signature = `${normalizeText(name).toLowerCase()}::${normalizeText(nationName).toLowerCase()}::${normalizeText(regionName).toLowerCase()}::${normalizeText(cityName).toLowerCase()}::${normalizeText(summary).toLowerCase()}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push({
            name,
            summary: summary || name,
            knowledgeLevel: normalizeKnowledgeLevel(record.knowledgeLevel, 'confirmed'),
            nationName,
            nationKnowledgeLevel: normalizeKnowledgeLevel(record.nationKnowledgeLevel, 'confirmed'),
            regionName,
            regionKnowledgeLevel: normalizeKnowledgeLevel(record.regionKnowledgeLevel, 'confirmed'),
            cityName,
            cityKnowledgeLevel: normalizeKnowledgeLevel(record.cityKnowledgeLevel, 'confirmed'),
            aliases: uniqueTexts(8, toStringArray(record.aliases, 8)),
            tags: uniqueTexts(10, toStringArray(record.tags, 10)),
        });
    });
    return result.slice(0, 16);
}

function normalizeWorldFacetEntryArray(value: unknown, fallbackFacet: SemanticWorldFacetEntry['facet']): SemanticWorldFacetEntry[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: SemanticWorldFacetEntry[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return;
        }
        const record = item as Record<string, unknown>;
        const title = normalizeText(record.title) || extractNamedLeadSegment(normalizeText(record.summary));
        const summary = normalizeText(record.summary);
        if (!title && !summary) {
            return;
        }
        const facetRaw = normalizeText(record.facet).toLowerCase();
        const facet = (
            facetRaw === 'rule'
            || facetRaw === 'constraint'
            || facetRaw === 'social'
            || facetRaw === 'culture'
            || facetRaw === 'history'
            || facetRaw === 'danger'
            || facetRaw === 'entity'
            || facetRaw === 'other'
        ) ? facetRaw : fallbackFacet;
        const scopeTypeRaw = normalizeText(record.scopeType).toLowerCase();
        const scopeType = (
            scopeTypeRaw === 'global'
            || scopeTypeRaw === 'nation'
            || scopeTypeRaw === 'region'
            || scopeTypeRaw === 'city'
            || scopeTypeRaw === 'location'
            || scopeTypeRaw === 'faction'
            || scopeTypeRaw === 'item'
            || scopeTypeRaw === 'character'
            || scopeTypeRaw === 'scene'
            || scopeTypeRaw === 'unclassified'
        ) ? scopeTypeRaw : 'global';
        const signature = `${normalizeText(title || summary).toLowerCase()}::${normalizeText(summary).toLowerCase()}::${facet}::${scopeType}::${normalizeText(record.nationName).toLowerCase()}::${normalizeText(record.regionName).toLowerCase()}::${normalizeText(record.cityName).toLowerCase()}::${normalizeText(record.locationName).toLowerCase()}`;
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push({
            title: title || summary,
            summary: summary || title,
            facet,
            knowledgeLevel: normalizeKnowledgeLevel(record.knowledgeLevel, 'confirmed'),
            scopeType,
            nationName: normalizeText(record.nationName) || undefined,
            regionName: normalizeText(record.regionName) || undefined,
            cityName: normalizeText(record.cityName) || undefined,
            locationName: normalizeText(record.locationName) || undefined,
            appliesTo: normalizeText(record.appliesTo) || undefined,
            tags: uniqueTexts(10, toStringArray(record.tags, 10)),
        });
    });
    return result.slice(0, 24);
}

function shouldUseAiSummary(seed: ChatSemanticSeed): boolean {
    const description = normalizeText((seed.characterCore as Record<string, unknown> | undefined)?.description);
    const scenario = normalizeText((seed.characterCore as Record<string, unknown> | undefined)?.scenario);
    const worldHints = uniqueTexts(
        8,
        seed.worldSeed.locations,
        seed.worldSeed.rules,
        seed.worldSeed.hardConstraints,
        seed.worldSeed.entities,
    );
    return description.length >= 24 || scenario.length >= 24 || worldHints.length >= 3;
}

function buildPromptPayload(seed: ChatSemanticSeed): string {
    const characterCore = (seed.characterCore ?? {}) as Record<string, unknown>;
    const lorebookSnippets = Array.from(new Set(
        seed.lorebookSeed
            .flatMap((item) => item.snippets.map((snippet: string): string => `${item.book}：${snippet}`))
            .map((value: string): string => String(value ?? '').replace(/\r\n?/g, '\n').trim())
            .filter(Boolean),
    ));
    const roleTemplateNames = uniqueTexts(
        12,
        [
            normalizeText(seed.identitySeed.displayName),
            ...Object.values(seed.identitySeeds ?? {}).map((item): string => normalizeText(item.displayName)),
        ],
    );
    return [
        `角色名：${normalizeText(seed.identitySeed.displayName) || '未知角色'}`,
        `角色别名：${uniqueTexts(8, seed.identitySeed.aliases).join('；') || '无'}`,
        `角色描述：${normalizeText(characterCore.description) || '无'}`,
        `开场白：${normalizeText(seed.firstMessage) || '无'}`,
        `作者注释：${normalizeText(seed.authorNote) || '无'}`,
        `系统提示：${normalizeText(seed.systemPrompt) || '无'}`,
        `场景 / 世界观：${uniqueTexts(16, [normalizeText(characterCore.scenario)], seed.worldSeed.rules, seed.worldSeed.hardConstraints, seed.worldSeed.locations, seed.worldSeed.entities).join('；') || '无'}`,
        `世界书：${uniqueTexts(12, seed.activeLorebooks).join('；') || '无'}`,
        `已识别角色模板：${roleTemplateNames.join('、') || '无'}`,
        lorebookSnippets.length > 0
            ? `世界书条目摘录：\n${lorebookSnippets.join('\n\n')}`
            : '世界书条目摘录：无',
        `现有风格线索：${uniqueTexts(10, seed.styleSeed.cues).join('；') || '无'}`,
    ].join('\n');
}

/**
 * 功能：规范化 AI 角色资料使用的角色键。
 * @param value 原始角色键或角色名。
 * @returns 规范化后的角色键。
 */
function normalizeAiActorKey(value: unknown): string {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }
    return normalizeTavernRoleKeyEvent(normalized);
}

/**
 * 功能：把 AI 角色关系摘要转成角色资料关系事实。
 * @param items AI 输出的关系数组。
 * @returns 角色资料关系事实数组。
 */
function convertAiRelationshipsToRoleFacts(items: SemanticAiRoleRelationshipSummary[]): RoleRelationshipFact[] {
    return items.map((item: SemanticAiRoleRelationshipSummary): RoleRelationshipFact => ({
        targetActorKey: normalizeAiActorKey(item.targetActorKey || item.targetLabel) || undefined,
        targetLabel: normalizeText(item.targetLabel) || '未标注对象',
        label: normalizeText(item.label) || '关系事实',
        detail: normalizeText(item.detail) || normalizeText(item.targetLabel),
        sourceRefs: ['ai_summary:roleProfiles'],
    }));
}

/**
 * 功能：把 AI 角色资产摘要转成角色资料资产条目。
 * @param items AI 输出的资产数组。
 * @returns 角色资料资产条目数组。
 */
function convertAiAssetsToRoleAssets(items: SemanticAiRoleAssetSummary[]): RoleAssetEntry[] {
    return items.map((item: SemanticAiRoleAssetSummary): RoleAssetEntry => ({
        kind: item.kind,
        name: normalizeText(item.name) || normalizeText(item.detail) || '未命名条目',
        detail: normalizeText(item.detail),
        sourceRefs: ['ai_summary:roleProfiles'],
    }));
}

/**
 * 功能：把 AI 角色资料摘要转成角色资料模板。
 * @param item AI 输出的单个角色资料。
 * @returns 可写入 seed 的角色资料模板；缺少主键时返回 null。
 */
function convertAiRoleProfileToSeed(item: SemanticAiRoleProfileSummary): RoleProfile | null {
    const displayName = normalizeText(item.displayName);
    const actorKey = normalizeAiActorKey(item.actorKey || displayName);
    if (!actorKey || !displayName) {
        return null;
    }
    return {
        actorKey,
        displayName,
        aliases: uniqueTexts(8, item.aliases),
        identityFacts: uniqueTexts(16, item.identityFacts),
        originFacts: uniqueTexts(12, item.originFacts),
        relationshipFacts: convertAiRelationshipsToRoleFacts(item.relationshipFacts),
        items: convertAiAssetsToRoleAssets(item.items).filter((asset: RoleAssetEntry): boolean => asset.kind === 'item'),
        equipments: convertAiAssetsToRoleAssets(item.equipments).filter((asset: RoleAssetEntry): boolean => asset.kind === 'equipment'),
        updatedAt: Date.now(),
    };
}

/**
 * 功能：把 AI 角色资料摘要转成身份种子。
 * @param item AI 输出的单个角色资料。
 * @returns 可写入 seed 的身份种子；缺少主键时返回 null。
 */
function convertAiRoleProfileToIdentitySeed(item: SemanticAiRoleProfileSummary): IdentitySeed | null {
    const displayName = normalizeText(item.displayName);
    const actorKey = normalizeAiActorKey(item.actorKey || displayName);
    if (!actorKey || !displayName) {
        return null;
    }
    return {
        roleKey: actorKey,
        displayName,
        aliases: uniqueTexts(8, item.aliases),
        identity: uniqueTexts(16, item.identityFacts, item.originFacts),
        catchphrases: [],
        relationshipAnchors: uniqueTexts(8, item.relationshipFacts.map((relation: SemanticAiRoleRelationshipSummary): string => relation.detail)),
        sourceTrace: [
            { field: 'identity', source: 'ai_summary:roleProfiles', confidence: 0.7 },
            { field: 'relationship', source: 'ai_summary:roleProfiles', confidence: 0.7 },
        ],
    };
}

/**
 * 功能：合并两个角色资料模板。
 * @param base 基础角色资料。
 * @param incoming 新角色资料。
 * @returns 合并后的角色资料。
 */
function mergeRoleProfileSeed(base: RoleProfile, incoming: RoleProfile): RoleProfile {
    const mergeRelations = (current: RoleRelationshipFact[], next: RoleRelationshipFact[]): RoleRelationshipFact[] => {
        const result: RoleRelationshipFact[] = [...current];
        next.forEach((item: RoleRelationshipFact): void => {
            const signature = `${normalizeText(item.targetActorKey || item.targetLabel).toLowerCase()}::${normalizeText(item.label).toLowerCase()}`;
            const matchIndex = result.findIndex((currentItem: RoleRelationshipFact): boolean => {
                return `${normalizeText(currentItem.targetActorKey || currentItem.targetLabel).toLowerCase()}::${normalizeText(currentItem.label).toLowerCase()}` === signature;
            });
            if (matchIndex >= 0) {
                result[matchIndex] = {
                    ...result[matchIndex],
                    ...item,
                    sourceRefs: Array.from(new Set([...(result[matchIndex]?.sourceRefs ?? []), ...(item.sourceRefs ?? [])])),
                };
            } else {
                result.push(item);
            }
        });
        return result.slice(0, 16);
    };
    const mergeAssets = (current: RoleAssetEntry[], next: RoleAssetEntry[]): RoleAssetEntry[] => {
        const result: RoleAssetEntry[] = [...current];
        next.forEach((item: RoleAssetEntry): void => {
            const signature = `${item.kind}::${normalizeText(item.name).toLowerCase()}`;
            const matchIndex = result.findIndex((currentItem: RoleAssetEntry): boolean => {
                return `${currentItem.kind}::${normalizeText(currentItem.name).toLowerCase()}` === signature;
            });
            if (matchIndex >= 0) {
                result[matchIndex] = {
                    ...result[matchIndex],
                    ...item,
                    sourceRefs: Array.from(new Set([...(result[matchIndex]?.sourceRefs ?? []), ...(item.sourceRefs ?? [])])),
                };
            } else {
                result.push(item);
            }
        });
        return result.slice(0, 24);
    };
    return {
        actorKey: normalizeText(base.actorKey) || normalizeText(incoming.actorKey),
        displayName: normalizeText(base.displayName) || normalizeText(incoming.displayName),
        aliases: uniqueTexts(8, base.aliases, incoming.aliases),
        identityFacts: uniqueTexts(16, base.identityFacts, incoming.identityFacts),
        originFacts: uniqueTexts(12, base.originFacts, incoming.originFacts),
        relationshipFacts: mergeRelations(base.relationshipFacts, incoming.relationshipFacts),
        items: mergeAssets(base.items, incoming.items),
        equipments: mergeAssets(base.equipments, incoming.equipments),
        updatedAt: Math.max(Number(base.updatedAt ?? 0) || 0, Number(incoming.updatedAt ?? 0) || 0),
    };
}

/**
 * 功能：合并两个身份种子。
 * @param base 基础身份种子。
 * @param incoming 新身份种子。
 * @returns 合并后的身份种子。
 */
function mergeIdentitySeed(base: IdentitySeed, incoming: IdentitySeed): IdentitySeed {
    return {
        ...base,
        roleKey: normalizeText(base.roleKey) || normalizeText(incoming.roleKey),
        displayName: normalizeText(base.displayName) || normalizeText(incoming.displayName),
        aliases: uniqueTexts(8, base.aliases, incoming.aliases),
        identity: uniqueTexts(16, base.identity, incoming.identity),
        catchphrases: uniqueTexts(8, base.catchphrases, incoming.catchphrases),
        relationshipAnchors: uniqueTexts(8, base.relationshipAnchors, incoming.relationshipAnchors),
        sourceTrace: [...base.sourceTrace, ...incoming.sourceTrace].slice(0, 16),
    };
}

export function mergeAiSummary(seed: ChatSemanticSeed, summary: SemanticSeedAiSummary): ChatSemanticSeed {
    const roleSummary = normalizeText(summary.roleSummary);
    const aiSummary = {
        roleSummary,
        worldSummary: normalizeText(summary.worldSummary),
        identityFacts: uniqueTexts(12, summary.identityFacts),
        worldRules: uniqueTexts(16, summary.worldRules),
        hardConstraints: uniqueTexts(12, summary.hardConstraints),
        cities: normalizeNamedSummaryTexts(summary.cities),
        locations: normalizeNamedSummaryTexts(summary.locations),
        entities: uniqueTexts(12, summary.entities),
        nations: normalizeNationSummaryTexts(summary.nations),
        regions: normalizeNamedSummaryTexts(summary.regions),
        factions: uniqueTexts(12, summary.factions),
        calendarSystems: uniqueTexts(12, summary.calendarSystems),
        currencySystems: uniqueTexts(12, summary.currencySystems),
        socialSystems: uniqueTexts(12, summary.socialSystems),
        culturalPractices: uniqueTexts(12, summary.culturalPractices),
        historicalEvents: uniqueTexts(12, summary.historicalEvents),
        dangers: uniqueTexts(12, summary.dangers),
        otherWorldDetails: uniqueTexts(12, summary.otherWorldDetails),
        characterGoals: uniqueTexts(8, summary.characterGoals),
        relationshipFacts: uniqueTexts(8, summary.relationshipFacts),
        catchphrases: uniqueTexts(8, summary.catchphrases),
        relationshipAnchors: uniqueTexts(8, summary.relationshipAnchors),
        styleCues: uniqueTexts(10, summary.styleCues),
        nationDetails: normalizeCatalogEntrySummaryArray(summary.nationDetails),
        regionDetails: normalizeCatalogEntrySummaryArray(summary.regionDetails),
        cityDetails: normalizeCatalogEntrySummaryArray(summary.cityDetails),
        locationDetails: normalizeCatalogEntrySummaryArray(summary.locationDetails),
        ruleDetails: normalizeWorldFacetEntryArray(summary.ruleDetails, 'rule'),
        constraintDetails: normalizeWorldFacetEntryArray(summary.constraintDetails, 'constraint'),
        socialSystemDetails: normalizeWorldFacetEntryArray(summary.socialSystemDetails, 'social'),
        culturalPracticeDetails: normalizeWorldFacetEntryArray(summary.culturalPracticeDetails, 'culture'),
        historicalEventDetails: normalizeWorldFacetEntryArray(summary.historicalEventDetails, 'history'),
        dangerDetails: normalizeWorldFacetEntryArray(summary.dangerDetails, 'danger'),
        entityDetails: normalizeWorldFacetEntryArray(summary.entityDetails, 'entity'),
        otherWorldDetailDetails: normalizeWorldFacetEntryArray(summary.otherWorldDetailDetails, 'other'),
        roleProfiles: normalizeAiRoleProfileArray(summary.roleProfiles),
        generatedAt: Date.now(),
        source: 'ai' as const,
    };

    aiSummary.nations = uniqueTexts(12, aiSummary.nations, aiSummary.nationDetails.map((item): string => item.name));
    aiSummary.regions = uniqueTexts(12, aiSummary.regions, aiSummary.regionDetails.map((item): string => item.name));
    aiSummary.cities = uniqueTexts(12, aiSummary.cities, aiSummary.cityDetails.map((item): string => item.name));
    aiSummary.locations = uniqueTexts(12, aiSummary.locations, aiSummary.locationDetails.map((item): string => item.name));
    const nextRoleProfileSeeds = Object.entries(seed.roleProfileSeeds ?? {}).reduce<Record<string, RoleProfile>>((result: Record<string, RoleProfile>, [actorKey, profile]: [string, RoleProfile]): Record<string, RoleProfile> => {
        const normalizedActorKey = normalizeAiActorKey(actorKey || profile.actorKey);
        if (normalizedActorKey) {
            result[normalizedActorKey] = profile;
        }
        return result;
    }, {});
    const nextIdentitySeeds = Object.entries(seed.identitySeeds ?? {}).reduce<Record<string, IdentitySeed>>((result: Record<string, IdentitySeed>, [actorKey, profile]: [string, IdentitySeed]): Record<string, IdentitySeed> => {
        const normalizedActorKey = normalizeAiActorKey(actorKey || profile.roleKey);
        if (normalizedActorKey) {
            result[normalizedActorKey] = profile;
        }
        return result;
    }, {});
    aiSummary.roleProfiles.forEach((item: SemanticAiRoleProfileSummary): void => {
        const nextRoleProfile = convertAiRoleProfileToSeed(item);
        const nextIdentitySeed = convertAiRoleProfileToIdentitySeed(item);
        if (nextRoleProfile) {
            nextRoleProfileSeeds[nextRoleProfile.actorKey] = mergeRoleProfileSeed(
                nextRoleProfileSeeds[nextRoleProfile.actorKey] ?? nextRoleProfile,
                nextRoleProfile,
            );
        }
        if (nextIdentitySeed) {
            nextIdentitySeeds[nextIdentitySeed.roleKey] = mergeIdentitySeed(
                nextIdentitySeeds[nextIdentitySeed.roleKey] ?? nextIdentitySeed,
                nextIdentitySeed,
            );
        }
    });
    const primaryActorKey = normalizeAiActorKey(seed.identitySeed.roleKey || seed.identitySeed.displayName);
    const mergedPrimaryIdentity = primaryActorKey ? nextIdentitySeeds[primaryActorKey] : null;

    return {
        ...seed,
        aiSummary,
        identitySeeds: Object.keys(nextIdentitySeeds).length > 0 ? nextIdentitySeeds : undefined,
        roleProfileSeeds: Object.keys(nextRoleProfileSeeds).length > 0 ? nextRoleProfileSeeds : undefined,
        identitySeed: {
            ...seed.identitySeed,
            aliases: uniqueTexts(8, seed.identitySeed.aliases, mergedPrimaryIdentity?.aliases ?? []),
            identity: uniqueTexts(16, roleSummary ? [roleSummary] : [], aiSummary.identityFacts, seed.identitySeed.identity, mergedPrimaryIdentity?.identity ?? []),
            catchphrases: uniqueTexts(8, aiSummary.catchphrases, seed.identitySeed.catchphrases),
            relationshipAnchors: uniqueTexts(8, aiSummary.relationshipAnchors, aiSummary.relationshipFacts, seed.identitySeed.relationshipAnchors, mergedPrimaryIdentity?.relationshipAnchors ?? []),
        },
        worldSeed: {
            ...seed.worldSeed,
            locations: uniqueTexts(12, aiSummary.locations, seed.worldSeed.locations),
            rules: uniqueTexts(16, aiSummary.worldRules, seed.worldSeed.rules),
            hardConstraints: uniqueTexts(12, aiSummary.hardConstraints, seed.worldSeed.hardConstraints),
            entities: uniqueTexts(12, aiSummary.entities, seed.worldSeed.entities),
        },
        styleSeed: {
            ...seed.styleSeed,
            cues: uniqueTexts(12, aiSummary.styleCues, seed.styleSeed.cues),
        },
    };
}

/**
 * 功能：在已有 semantic seed 上追加 AI 角色/世界观总结。
 * 参数：
 *   seed：当前冷启动 seed。
 * 返回：
 *   Promise<ChatSemanticSeed>：增强后的 seed；AI 不可用或失败时返回原 seed。
 */
export async function enhanceSemanticSeedWithAi(seed: ChatSemanticSeed): Promise<ChatSemanticSeed> {
    return enhanceSemanticSeedWithAiWithOptions(seed);
}

export async function enhanceSemanticSeedWithAiWithOptions(
    seed: ChatSemanticSeed,
    options?: EnhanceSemanticSeedWithAiOptions,
): Promise<ChatSemanticSeed> {
    if (!seed || (!options?.force && !shouldUseAiSummary(seed))) {
        return seed;
    }

    const promptBundle = buildSemanticSeedAiJsonPromptBundle('init');
    const systemPrompt = `${buildColdstartOperationSystemPrompt()}

你必须严格按照下面的统一 JSON 结构输出。

命名空间说明：
${promptBundle.systemInstructions}

使用方法：
${promptBundle.usageGuide}

填写示例：
${promptBundle.exampleJson}`; 

    const coldstartUserPrompt = `${buildPromptPayload(seed)}

请基于上面的角色卡、系统提示、开场白、作者注释与世界书信息进行冷启动总结。
要求：
1. 只能提取已经明确出现的事实，不允许猜测、补写或延伸设定。
2. 如果世界书或其他输入没有明确支持，不要新增角色背景、关系、目标或世界规则。
3. 对不确定的信息宁可留空，也不要把模糊描述改写成确定事实。
4. 角色相关信息优先采用世界书里的明确条目，方便后续更新角色模板。
5. 输出内容要尽量可追溯到原始文本，避免使用无来源的概括。
6. role.profiles 里只要出现多个明确角色，就尽量拆成多个角色条目，不要把配角只塞进关系说明里。
7. displayName 只能写角色名字本身，不得写“某某的房东”“老板娘薇拉”“薇拉（房东）”“艾莉卡的同伴莉娅”这类关系、身份或描述。
8. relationshipFacts[].targetLabel 只能写目标角色名字；房东、同伴、老板娘、上司、老师等关系说明必须写进 relationshipFacts[].label 或 relationshipFacts[].detail。
9. aliases 只放简称、别名、误写或稳定称呼，不要把整句描述放进去。
10. 如果文本里明确出现“艾莉卡”和“薇拉”，就应尽量输出两个 profile；“房东”写入关系说明，不要并入角色名字。

4. 你必须只输出统一 AI JSON 外壳，并把内容填写到对应命名空间里，不要输出旧格式字段。
5. 不要输出解释、Markdown 或代码块，只输出 JSON。`;
    const result = await runGeneration<unknown>(
        MEMORY_TASKS.COLDSTART_SUMMARIZE,
        {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: coldstartUserPrompt },
            ],
            temperature: 0.2,
        },
        {
            maxTokens: 1200,
            maxLatencyMs: 0,
            chatKey: options?.chatKey,
            taskPresentation: options?.taskPresentation,
        },
        promptBundle.schema,
        options?.taskDescription || '角色卡与世界观总结',
    );

    if (!result.ok) {
        logger.warn('[ColdStart][AiSummaryFailed]', {
            forced: options?.force === true,
            error: result.error || 'no_data',
            reasonCode: result.reasonCode,
        });
        return seed;
    }

    const mergedSeed = applySemanticSeedAiJsonPayload(seed, result.data, 'init');
    if (!mergedSeed) {
        logger.warn('[ColdStart][AiSummaryNormalizeFailed]', {
            forced: options?.force === true,
            dataKeys: Object.keys(result.data as Record<string, unknown>).slice(0, 20),
        });
        return seed;
    }

    return mergedSeed;
}
