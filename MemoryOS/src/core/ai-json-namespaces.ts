import type {
    AiJsonDescription,
    AiJsonFieldDefinition,
    AiJsonNamespaceDefinition,
} from './ai-json-types';
import {    normalizeAiJsonDescription,
} from './ai-json-types';

type MutableRecord = Record<string, unknown>;

const KNOWLEDGE_LEVEL_VALUES = ['confirmed', 'rumor', 'inferred'] as const;
const WORLD_SCOPE_VALUES = ['global', 'nation', 'region', 'city', 'location', 'organization', 'item', 'character', 'scene', 'unclassified'] as const;
const MEMORY_CARD_SCOPE_VALUES = ['global', 'character', 'group', 'world', 'scene'] as const;
const MEMORY_CARD_TTL_VALUES = ['short', 'medium', 'long'] as const;
const MEMORY_SCHEMA_CHANGE_VALUES = ['add_table', 'add_field', 'modify_primary_key', 'modify_description', 'alias_suggestion'] as const;
const TASK_STATUS_VALUES = ['pending', 'in_progress', 'blocked', 'completed'] as const;

/**
 * 功能：创建字符串字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param example 示例值。
 * @param extra 额外配置。
 * @returns 字符串字段定义。
 */
function createStringField(
    fieldKey: string,
    description: AiJsonDescription,
    example: string,
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'string',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_scalar',
        ...extra,
    };
}

/**
 * 功能：创建数字字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param example 示例值。
 * @param extra 额外配置。
 * @returns 数字字段定义。
 */
function createNumberField(
    fieldKey: string,
    description: AiJsonDescription,
    example: number,
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'number',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_scalar',
        ...extra,
    };
}

/**
 * 功能：创建布尔字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param example 示例值。
 * @param extra 额外配置。
 * @returns 布尔字段定义。
 */
function createBooleanField(
    fieldKey: string,
    description: AiJsonDescription,
    example: boolean,
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'boolean',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_scalar',
        ...extra,
    };
}

/**
 * 功能：创建枚举字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param example 示例值。
 * @param enumValues 枚举值列表。
 * @param extra 额外配置。
 * @returns 枚举字段定义。
 */
function createEnumField(
    fieldKey: string,
    description: AiJsonDescription,
    example: string,
    enumValues: readonly string[],
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'enum',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_scalar',
        enumValues: [...enumValues],
        ...extra,
    };
}

/**
 * 功能：创建对象字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param fields 子字段定义。
 * @param example 示例值。
 * @param extra 额外配置。
 * @returns 对象字段定义。
 */
function createObjectField(
    fieldKey: string,
    description: AiJsonDescription,
    fields: Record<string, AiJsonFieldDefinition>,
    example: Record<string, unknown>,
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'object',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_object',
        fields,
        ...extra,
    };
}

/**
 * 功能：创建列表字段定义。
 * @param fieldKey 字段键名。
 * @param description 字段说明。
 * @param itemDefinition 元素定义。
 * @param example 示例值。
 * @param extra 额外配置。
 * @returns 列表字段定义。
 */
function createListField(
    fieldKey: string,
    description: AiJsonDescription,
    itemDefinition: AiJsonFieldDefinition,
    example: unknown[],
    extra: Partial<AiJsonFieldDefinition> = {},
): AiJsonFieldDefinition {
    return {
        fieldKey,
        type: 'list',
        requiredOnInit: true,
        nullable: false,
        description: normalizeAiJsonDescription(description),
        example,
        updatable: true,
        updateMode: 'replace_scalar',
        itemDefinition,
        ...extra,
    };
}

/**
 * 功能：判断值是否为普通对象。
 * @param value 待判断的值。
 * @returns 是否为普通对象。
 */
function isRecord(value: unknown): value is MutableRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 功能：归一化文本值。
 * @param value 原始值。
 * @returns 归一化后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：归一化数字值。
 * @param value 原始值。
 * @returns 归一化后的数字。
 */
function normalizeNumber(value: unknown): number {
    return Number(value ?? 0) || 0;
}

/**
 * 功能：对文本数组去重并截断。
 * @param value 原始值。
 * @param limit 最大保留数量。
 * @returns 归一化后的字符串数组。
 */
function normalizeStringArray(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const result: string[] = [];
    const seen = new Set<string>();
    value.forEach((item: unknown): void => {
        const text = normalizeText(item);
        if (!text) {
            return;
        }
        const signature = text.toLowerCase();
        if (seen.has(signature)) {
            return;
        }
        seen.add(signature);
        result.push(text);
    });
    return result.slice(0, limit);
}

/**
 * 功能：在限定枚举中归一化文本值。
 * @param value 原始值。
 * @param enumValues 可选值列表。
 * @param fallback 兜底值。
 * @returns 归一化后的枚举值。
 */
function normalizeEnumValue(value: unknown, enumValues: readonly string[], fallback: string): string {
    const normalized = normalizeText(value);
    return enumValues.includes(normalized) ? normalized : fallback;
}

/**
 * 功能：深拷贝可序列化值。
 * @param value 原始值。
 * @returns 拷贝后的值。
 */
function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item: unknown): unknown => cloneValue(item)) as T;
    }
    if (isRecord(value)) {
        return Object.entries(value).reduce<MutableRecord>((result: MutableRecord, [key, item]: [string, unknown]): MutableRecord => {
            result[key] = cloneValue(item);
            return result;
        }, {}) as T;
    }
    return value;
}

/**
 * 功能：解析模型给出的 JSON 字符串。
 * @param value 原始值。
 * @param fallback 解析失败时使用的兜底值。
 * @returns 解析后的对象或兜底值。
 */
function parseJsonText(value: unknown, fallback: unknown): unknown {
    if (value == null) {
        return cloneValue(fallback);
    }
    if (typeof value !== 'string') {
        return cloneValue(value);
    }
    const text = value.trim();
    if (!text) {
        return cloneValue(fallback);
    }
    try {
        return JSON.parse(text);
    } catch {
        return cloneValue(fallback);
    }
}

/**
 * 功能：归一化目录条目。
 * @param value 原始值。
 * @returns 归一化后的目录条目。
 */
function normalizeCatalogEntry(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        name: normalizeText(record.name),
        summary: normalizeText(record.summary),
        knowledgeLevel: normalizeEnumValue(record.knowledgeLevel, KNOWLEDGE_LEVEL_VALUES, 'confirmed'),
        nationName: normalizeText(record.nationName),
        nationKnowledgeLevel: normalizeEnumValue(record.nationKnowledgeLevel, KNOWLEDGE_LEVEL_VALUES, 'confirmed'),
        regionName: normalizeText(record.regionName),
        regionKnowledgeLevel: normalizeEnumValue(record.regionKnowledgeLevel, KNOWLEDGE_LEVEL_VALUES, 'confirmed'),
        cityName: normalizeText(record.cityName),
        cityKnowledgeLevel: normalizeEnumValue(record.cityKnowledgeLevel, KNOWLEDGE_LEVEL_VALUES, 'confirmed'),
        aliases: normalizeStringArray(record.aliases, 8),
        tags: normalizeStringArray(record.tags, 12),
    };
}

/**
 * 功能：归一化目录条目数组。
 * @param value 原始值。
 * @returns 归一化后的目录条目数组。
 */
function normalizeCatalogEntryArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): Record<string, unknown> => normalizeCatalogEntry(item))
        .filter((item: Record<string, unknown>): boolean => Boolean(String(item.name ?? '').trim()))
        .slice(0, 32);
}

/**
 * 功能：归一化世界细节条目。
 * @param value 原始值。
 * @returns 归一化后的世界细节条目。
 */
function normalizeWorldFacetEntry(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        title: normalizeText(record.title),
        summary: normalizeText(record.summary),
        facet: normalizeEnumValue(record.facet, ['rule', 'constraint', 'social', 'culture', 'event', 'danger', 'entity', 'other'], 'other'),
        knowledgeLevel: normalizeEnumValue(record.knowledgeLevel, KNOWLEDGE_LEVEL_VALUES, 'confirmed'),
        scopeType: normalizeEnumValue(record.scopeType, WORLD_SCOPE_VALUES, 'unclassified'),
        nationName: normalizeText(record.nationName),
        regionName: normalizeText(record.regionName),
        cityName: normalizeText(record.cityName),
        locationName: normalizeText(record.locationName),
        appliesTo: normalizeText(record.appliesTo),
        tags: normalizeStringArray(record.tags, 12),
    };
}

/**
 * 功能：归一化世界细节数组。
 * @param value 原始值。
 * @returns 归一化后的世界细节数组。
 */
function normalizeWorldFacetArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): Record<string, unknown> => normalizeWorldFacetEntry(item))
        .filter((item: Record<string, unknown>): boolean => Boolean(String(item.title ?? '').trim()))
        .slice(0, 48);
}

/**
 * 功能：归一化角色关系条目。
 * @param value 原始值。
 * @returns 归一化后的角色关系条目。
 */
function normalizeRoleRelationship(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        targetActorKey: normalizeText(record.targetActorKey),
        targetLabel: normalizeText(record.targetLabel),
        label: normalizeText(record.label),
        detail: normalizeText(record.detail),
    };
}

/**
 * 功能：归一化角色关系数组。
 * @param value 原始值。
 * @returns 归一化后的角色关系数组。
 */
function normalizeRoleRelationshipArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): Record<string, unknown> => normalizeRoleRelationship(item))
        .filter((item: Record<string, unknown>): boolean => Boolean(String(item.targetLabel ?? '').trim() || String(item.detail ?? '').trim()))
        .slice(0, 24);
}

/**
 * 功能：归一化角色资产条目。
 * @param value 原始值。
 * @param kind 资产类型。
 * @returns 归一化后的资产条目。
 */
function normalizeRoleAsset(value: unknown, kind: 'item' | 'equipment'): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        kind,
        name: normalizeText(record.name),
        detail: normalizeText(record.detail),
    };
}

/**
 * 功能：归一化角色资产数组。
 * @param value 原始值。
 * @param kind 资产类型。
 * @returns 归一化后的资产数组。
 */
function normalizeRoleAssetArray(value: unknown, kind: 'item' | 'equipment'): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): Record<string, unknown> => normalizeRoleAsset(item, kind))
        .filter((item: Record<string, unknown>): boolean => Boolean(String(item.name ?? '').trim()))
        .slice(0, 24);
}

/**
 * 功能：归一化角色资料条目。
 * @param actorKey 角色主键。
 * @param value 原始值。
 * @returns 归一化后的角色资料。
 */
function normalizeRoleProfile(actorKey: string, value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        actorKey,
        displayName: normalizeText(record.displayName) || actorKey,
        aliases: normalizeStringArray(record.aliases, 8),
        identityFacts: normalizeStringArray(record.identityFacts, 16),
        originFacts: normalizeStringArray(record.originFacts, 12),
        relationshipFacts: normalizeRoleRelationshipArray(record.relationshipFacts),
        items: normalizeRoleAssetArray(record.items, 'item'),
        equipments: normalizeRoleAssetArray(record.equipments, 'equipment'),
        currentLocation: normalizeText(record.currentLocation),
        organizationMemberships: normalizeStringArray(record.organizationMemberships, 12),
        activeTasks: normalizeStringArray(record.activeTasks, 16),
        updatedAt: normalizeNumber(record.updatedAt),
    };
}

/**
 * 功能：归一化角色资料集合。
 * @param value 原始值。
 * @returns 归一化后的角色资料字典。
 */
function normalizeRoleProfiles(value: unknown): Record<string, unknown> {
    if (Array.isArray(value)) {
        return value.reduce<Record<string, unknown>>((result: Record<string, unknown>, item: unknown): Record<string, unknown> => {
            const record = isRecord(item) ? item : {};
            const actorKey = normalizeText(record.actorKey) || normalizeText(record.displayName);
            if (!actorKey) {
                return result;
            }
            result[actorKey] = normalizeRoleProfile(actorKey, record);
            return result;
        }, {});
    }
    if (!isRecord(value)) {
        return {};
    }
    return Object.entries(value).reduce<Record<string, unknown>>((result: Record<string, unknown>, [actorKey, item]: [string, unknown]): Record<string, unknown> => {
        const normalizedActorKey = normalizeText(actorKey);
        if (!normalizedActorKey) {
            return result;
        }
        result[normalizedActorKey] = normalizeRoleProfile(normalizedActorKey, item);
        return result;
    }, {});
}

/**
 * 功能：归一化角色命名空间文档。
 * @param value 原始值。
 * @returns 归一化后的角色命名空间文档。
 */
function normalizeRoleNamespaceDocument(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    const summary = isRecord(record.summary) ? record.summary : {};
    return {
        profiles: normalizeRoleProfiles(record.profiles),
        activeActorKey: normalizeText(record.activeActorKey),
        summary: {
            overview: normalizeText(summary.overview),
            updatedAt: normalizeNumber(summary.updatedAt),
        },
    };
}

/**
 * 功能：归一化语义摘要命名空间文档。
 * @param value 原始值。
 * @returns 归一化后的语义摘要文档。
 */
function normalizeSemanticSummaryDocument(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        roleSummary: normalizeText(record.roleSummary),
        worldSummary: normalizeText(record.worldSummary),
        identityFacts: normalizeStringArray(record.identityFacts, 16),
        worldRules: normalizeStringArray(record.worldRules, 24),
        hardConstraints: normalizeStringArray(record.hardConstraints, 16),
        cities: normalizeStringArray(record.cities, 16),
        locations: normalizeStringArray(record.locations, 24),
        entities: normalizeStringArray(record.entities, 24),
        nations: normalizeStringArray(record.nations, 16),
        regions: normalizeStringArray(record.regions, 16),
        organizations: normalizeStringArray(record.organizations, 24),
        calendarSystems: normalizeStringArray(record.calendarSystems, 12),
        currencySystems: normalizeStringArray(record.currencySystems, 12),
        socialSystems: normalizeStringArray(record.socialSystems, 16),
        culturalPractices: normalizeStringArray(record.culturalPractices, 16),
        majorEvents: normalizeStringArray(record.majorEvents, 16),
        dangers: normalizeStringArray(record.dangers, 16),
        otherWorldDetails: normalizeStringArray(record.otherWorldDetails, 16),
        tasks: normalizeStringArray(record.tasks, 24),
        relationshipFacts: normalizeStringArray(record.relationshipFacts, 12),
        catchphrases: normalizeStringArray(record.catchphrases, 12),
        relationshipAnchors: normalizeStringArray(record.relationshipAnchors, 12),
        styleCues: normalizeStringArray(record.styleCues, 12),
        nationDetails: normalizeCatalogEntryArray(record.nationDetails),
        regionDetails: normalizeCatalogEntryArray(record.regionDetails),
        cityDetails: normalizeCatalogEntryArray(record.cityDetails),
        locationDetails: normalizeCatalogEntryArray(record.locationDetails),
        organizationDetails: Array.isArray(record.organizationDetails)
            ? record.organizationDetails
                .map((item: unknown): Record<string, unknown> => {
                    const detail = isRecord(item) ? item : {};
                    return {
                        name: normalizeText(detail.name),
                        summary: normalizeText(detail.summary),
                        aliases: normalizeStringArray(detail.aliases, 8),
                        parentOrganizationName: normalizeText(detail.parentOrganizationName),
                        ownershipStatus: normalizeText(detail.ownershipStatus),
                        relatedActorKeys: normalizeStringArray(detail.relatedActorKeys, 16),
                        locationName: normalizeText(detail.locationName),
                    };
                })
                .filter((item: Record<string, unknown>): boolean => Boolean(String(item.name ?? '').trim()))
                .slice(0, 32)
            : [],
        taskDetails: Array.isArray(record.taskDetails)
            ? record.taskDetails
                .map((item: unknown): Record<string, unknown> => {
                    const detail = isRecord(item) ? item : {};
                    return {
                        title: normalizeText(detail.title),
                        summary: normalizeText(detail.summary),
                        status: normalizeEnumValue(detail.status, TASK_STATUS_VALUES, 'pending'),
                        objective: normalizeText(detail.objective),
                        completionCriteria: normalizeText(detail.completionCriteria),
                        progressNote: normalizeText(detail.progressNote),
                        ownerActorKeys: normalizeStringArray(detail.ownerActorKeys, 16),
                        organizationNames: normalizeStringArray(detail.organizationNames, 12),
                        locationName: normalizeText(detail.locationName),
                    };
                })
                .filter((item: Record<string, unknown>): boolean => Boolean(String(item.title ?? '').trim() || String(item.summary ?? '').trim()))
                .slice(0, 48)
            : [],
        majorEventDetails: Array.isArray(record.majorEventDetails)
            ? record.majorEventDetails
                .map((item: unknown): Record<string, unknown> => {
                    const detail = isRecord(item) ? item : {};
                    return {
                        title: normalizeText(detail.title),
                        summary: normalizeText(detail.summary),
                        phase: normalizeText(detail.phase),
                        locationName: normalizeText(detail.locationName),
                        relatedActorKeys: normalizeStringArray(detail.relatedActorKeys, 16),
                        organizationNames: normalizeStringArray(detail.organizationNames, 12),
                        impact: normalizeText(detail.impact),
                    };
                })
                .filter((item: Record<string, unknown>): boolean => Boolean(String(item.title ?? '').trim() || String(item.summary ?? '').trim()))
                .slice(0, 48)
            : [],
        ruleDetails: normalizeWorldFacetArray(record.ruleDetails),
        constraintDetails: normalizeWorldFacetArray(record.constraintDetails),
        socialSystemDetails: normalizeWorldFacetArray(record.socialSystemDetails),
        culturalPracticeDetails: normalizeWorldFacetArray(record.culturalPracticeDetails),
        dangerDetails: normalizeWorldFacetArray(record.dangerDetails),
        entityDetails: normalizeWorldFacetArray(record.entityDetails),
        otherWorldDetailDetails: normalizeWorldFacetArray(record.otherWorldDetailDetails),
    };
}

/**
 * 功能：归一化记忆卡片条目。
 * @param value 原始值。
 * @returns 归一化后的记忆卡片条目。
 */
function normalizeMemoryCard(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        scope: normalizeEnumValue(record.scope, MEMORY_CARD_SCOPE_VALUES, 'character'),
        lane: normalizeText(record.lane),
        subject: normalizeText(record.subject),
        title: normalizeText(record.title),
        memoryText: normalizeText(record.memoryText),
        evidenceText: normalizeText(record.evidenceText),
        entityKeys: normalizeStringArray(record.entityKeys, 12),
        keywords: normalizeStringArray(record.keywords, 12),
        importance: normalizeNumber(record.importance),
        confidence: normalizeNumber(record.confidence),
        ttl: normalizeEnumValue(record.ttl, MEMORY_CARD_TTL_VALUES, 'medium'),
        replaceKey: normalizeText(record.replaceKey),
        sourceRefs: normalizeStringArray(record.sourceRefs, 12),
        sourceRecordKey: normalizeText(record.sourceRecordKey),
        sourceRecordKind: normalizeText(record.sourceRecordKind),
        ownerActorKey: normalizeText(record.ownerActorKey),
        memoryType: normalizeText(record.memoryType),
        memorySubtype: normalizeText(record.memorySubtype),
        sourceMessageIds: normalizeStringArray(record.sourceMessageIds, 12),
        speakerActorKey: normalizeText(record.speakerActorKey),
        speakerLabel: normalizeText(record.speakerLabel),
        rememberedByActorKey: normalizeText(record.rememberedByActorKey),
        rememberReason: normalizeText(record.rememberReason),
        participantActorKeys: normalizeStringArray(record.participantActorKeys, 12),
        validFrom: normalizeNumber(record.validFrom),
        validTo: normalizeNumber(record.validTo),
    };
}

/**
 * 功能：归一化记忆卡片数组。
 * @param value 原始值。
 * @returns 归一化后的记忆卡片数组。
 */
function normalizeMemoryCardArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): Record<string, unknown> => normalizeMemoryCard(item))
        .filter((item: Record<string, unknown>): boolean => Boolean(String(item.memoryText ?? '').trim() || String(item.title ?? '').trim()))
        .slice(0, 24);
}

/**
 * 功能：归一化提案事实数组。
 * @param value 原始值。
 * @returns 归一化后的提案事实数组。
 */
function normalizeProposalFactArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): Record<string, unknown> => {
        const record = isRecord(item) ? item : {};
        const entity = isRecord(record.entity) ? record.entity : {};
        return {
            factKey: normalizeText(record.factKey),
            targetRecordKey: normalizeText(record.targetRecordKey),
            action: normalizeText(record.action) || 'auto',
            type: normalizeText(record.type),
            entity: {
                kind: normalizeText(entity.kind),
                id: normalizeText(entity.id),
            },
            path: normalizeText(record.path),
            value: parseJsonText(record.valueJson, {}),
            confidence: normalizeNumber(record.confidence),
            provenance: parseJsonText(record.provenanceJson, {}),
        };
    }).filter((item: Record<string, unknown>): boolean => Boolean(String(item.type ?? '').trim()));
}

/**
 * 功能：归一化提案补丁数组。
 * @param value 原始值。
 * @returns 归一化后的提案补丁数组。
 */
function normalizeProposalPatchArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): Record<string, unknown> => {
        const record = isRecord(item) ? item : {};
        return {
            op: normalizeText(record.op) || 'replace',
            path: normalizeText(record.path),
            value: parseJsonText(record.valueJson, null),
        };
    }).filter((item: Record<string, unknown>): boolean => Boolean(String(item.path ?? '').trim()));
}

/**
 * 功能：归一化摘要来源对象。
 * @param value 原始值。
 * @returns 归一化后的摘要来源对象。
 */
function normalizeProposalSummarySource(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        extractor: normalizeText(record.extractor),
        provider: normalizeText(record.provider),
        provenance: parseJsonText(record.provenanceJson, {}),
    };
}

/**
 * 功能：归一化提案摘要数组。
 * @param value 原始值。
 * @returns 归一化后的提案摘要数组。
 */
function normalizeProposalSummaryArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): Record<string, unknown> => {
        const record = isRecord(item) ? item : {};
        const range = isRecord(record.range) ? record.range : {};
        return {
            level: normalizeText(record.level) || 'scene',
            summaryId: normalizeText(record.summaryId),
            targetRecordKey: normalizeText(record.targetRecordKey),
            action: normalizeText(record.action) || 'auto',
            title: normalizeText(record.title),
            content: normalizeText(record.content),
            keywords: normalizeStringArray(record.keywords, 16),
            memoryCards: normalizeMemoryCardArray(record.memoryCards),
            messageId: normalizeText(record.messageId),
            range: {
                fromMessageId: normalizeText(range.fromMessageId),
                toMessageId: normalizeText(range.toMessageId),
            },
            source: normalizeProposalSummarySource(record.source),
        };
    }).filter((item: Record<string, unknown>): boolean => Boolean(String(item.content ?? '').trim()));
}

/**
 * 功能：归一化结构变更建议数组。
 * @param value 原始值。
 * @returns 归一化后的结构变更建议数组。
 */
function normalizeProposalSchemaChangeArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): Record<string, unknown> => {
        const record = isRecord(item) ? item : {};
        return {
            kind: normalizeEnumValue(record.kind, MEMORY_SCHEMA_CHANGE_VALUES, 'add_field'),
            tableKey: normalizeText(record.tableKey),
            fieldKey: normalizeText(record.fieldKey),
            payload: parseJsonText(record.payloadJson, {}),
            requiredByFacts: Boolean(record.requiredByFacts),
        };
    }).filter((item: Record<string, unknown>): boolean => Boolean(String(item.tableKey ?? '').trim()));
}

/**
 * 功能：归一化实体解析建议数组。
 * @param value 原始值。
 * @returns 归一化后的实体解析建议数组。
 */
function normalizeProposalEntityResolutionArray(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item: unknown): Record<string, unknown> => {
        const record = isRecord(item) ? item : {};
        return {
            tableKey: normalizeText(record.tableKey),
            fromRowId: normalizeText(record.fromRowId),
            toRowId: normalizeText(record.toRowId),
            confidence: normalizeNumber(record.confidence),
            reason: normalizeText(record.reason),
        };
    }).filter((item: Record<string, unknown>): boolean => {
        return Boolean(String(item.tableKey ?? '').trim() && String(item.fromRowId ?? '').trim() && String(item.toRowId ?? '').trim());
    });
}

/**
 * 功能：归一化记忆提案命名空间文档。
 * @param value 原始值。
 * @returns 归一化后的记忆提案文档。
 */
function normalizeMemoryProposalDocument(value: unknown): Record<string, unknown> {
    const record = isRecord(value) ? value : {};
    return {
        facts: normalizeProposalFactArray(record.facts),
        patches: normalizeProposalPatchArray(record.patches),
        summaries: normalizeProposalSummaryArray(record.summaries),
        notes: normalizeText(record.notes),
        schemaChanges: normalizeProposalSchemaChangeArray(record.schemaChanges),
        entityResolutions: normalizeProposalEntityResolutionArray(record.entityResolutions),
        confidence: normalizeNumber(record.confidence),
    };
}

/**
 * 功能：创建目录条目字段定义。
 * @param fieldKey 字段键名。
 * @returns 目录条目字段定义。
 */
function createCatalogEntryDefinition(fieldKey: string): AiJsonFieldDefinition {
    return createObjectField(
        fieldKey,
        '目录条目',
        {
            name: createStringField('name', '名称', '御花园'),
            summary: createStringField('summary', '摘要', '供皇室休憩游玩之所。'),
            knowledgeLevel: createEnumField('knowledgeLevel', '可靠程度', 'confirmed', KNOWLEDGE_LEVEL_VALUES, {
                requiredOnInit: false,
                nullable: true,
            }),
            nationName: createStringField('nationName', '所属国家', '', {
                requiredOnInit: false,
            }),
            nationKnowledgeLevel: createEnumField('nationKnowledgeLevel', '国家归属可靠程度', 'confirmed', KNOWLEDGE_LEVEL_VALUES, {
                requiredOnInit: false,
                nullable: true,
            }),
            regionName: createStringField('regionName', '所属区域', '', {
                requiredOnInit: false,
            }),
            regionKnowledgeLevel: createEnumField('regionKnowledgeLevel', '区域归属可靠程度', 'confirmed', KNOWLEDGE_LEVEL_VALUES, {
                requiredOnInit: false,
                nullable: true,
            }),
            cityName: createStringField('cityName', '所属城市', '', {
                requiredOnInit: false,
            }),
            cityKnowledgeLevel: createEnumField('cityKnowledgeLevel', '城市归属可靠程度', 'confirmed', KNOWLEDGE_LEVEL_VALUES, {
                requiredOnInit: false,
                nullable: true,
            }),
            aliases: createListField('aliases', '别名', createStringField('value', '别名', '皇家庭院', {
                fieldKey: 'value',
            }), ['皇家庭院'], {
                updatable: true,
                updateMode: 'replace_scalar',
            }),
            tags: createListField('tags', '标签', createStringField('value', '标签', '皇家', {
                fieldKey: 'value',
            }), ['皇家'], {
                updatable: true,
                updateMode: 'replace_scalar',
            }),
        },
        {
            name: '御花园',
            summary: '供皇室休憩游玩之所。',
            knowledgeLevel: 'confirmed',
            nationName: '',
            nationKnowledgeLevel: 'confirmed',
            regionName: '',
            regionKnowledgeLevel: 'confirmed',
            cityName: '',
            cityKnowledgeLevel: 'confirmed',
            aliases: [],
            tags: [],
        },
        {
            updateMode: 'upsert_item',
            itemPrimaryKey: 'name',
        },
    );
}

/**
 * 功能：创建世界细节字段定义。
 * @param fieldKey 字段键名。
 * @param facet 示例 facet。
 * @returns 世界细节字段定义。
 */
function createWorldFacetDetailDefinition(fieldKey: string, facet: string): AiJsonFieldDefinition {
    return createObjectField(
        fieldKey,
        '世界细节条目',
        {
            title: createStringField('title', '主题', '公开施法'),
            summary: createStringField('summary', '摘要', '公开施法会留下可追踪痕迹。'),
            facet: createEnumField('facet', '分面', facet, ['rule', 'constraint', 'social', 'culture', 'event', 'danger', 'entity', 'other']),
            knowledgeLevel: createEnumField('knowledgeLevel', '可靠程度', 'confirmed', KNOWLEDGE_LEVEL_VALUES),
            scopeType: createEnumField('scopeType', '作用范围', 'global', WORLD_SCOPE_VALUES),
            nationName: createStringField('nationName', '关联国家', '', {
                requiredOnInit: false,
            }),
            regionName: createStringField('regionName', '关联区域', '', {
                requiredOnInit: false,
            }),
            cityName: createStringField('cityName', '关联城市', '', {
                requiredOnInit: false,
            }),
            locationName: createStringField('locationName', '关联地点', '', {
                requiredOnInit: false,
            }),
            appliesTo: createStringField('appliesTo', '适用对象', '', {
                requiredOnInit: false,
            }),
            tags: createListField('tags', '标签', createStringField('value', '标签', '施法', {
                fieldKey: 'value',
            }), [], {
                updatable: true,
                updateMode: 'replace_scalar',
            }),
        },
        {
            title: '公开施法',
            summary: '公开施法会留下可追踪痕迹。',
            facet,
            knowledgeLevel: 'confirmed',
            scopeType: 'global',
            nationName: '',
            regionName: '',
            cityName: '',
            locationName: '',
            appliesTo: '',
            tags: [],
        },
        {
            updateMode: 'upsert_item',
            itemPrimaryKey: 'title',
        },
    );
}

const roleRelationshipDefinition = createObjectField(
    'relationshipFacts',
    '角色关系；目标名称只写角色名字',
    {
        targetActorKey: createStringField('targetActorKey', '目标角色键', '', {
            requiredOnInit: false,
        }),
        targetLabel: createStringField('targetLabel', '目标名字；不写房东、同伴、老板娘等关系描述', '莉娅'),
        label: createStringField('label', '关系标签', '同伴'),
        detail: createStringField('detail', '关系说明；房东、同伴、老板娘等描述写这里', '与莉娅长期同行，遇险时会互相掩护。'),
    },
    {
        targetActorKey: 'liya',
        targetLabel: '莉娅',
        label: '同伴',
        detail: '与莉娅长期同行，遇险时会互相掩护。',
    },
    {
        updateMode: 'upsert_item',
        itemPrimaryKey: 'targetLabel',
    },
);

const roleAssetDefinition = createObjectField(
    'asset',
    '角色资产',
    {
        kind: createEnumField('kind', '类型', 'item', ['item', 'equipment'], {
            hiddenInUpdate: true,
        }),
        name: createStringField('name', '名称', '旧地图'),
        detail: createStringField('detail', '说明', '标记着北境旧路和隐蔽渡口。'),
    },
    {
        kind: 'item',
        name: '旧地图',
        detail: '标记着北境旧路和隐蔽渡口。',
    },
    {
        updateMode: 'upsert_item',
        itemPrimaryKey: 'name',
    },
);

const roleProfileDefinition = createObjectField(
    'profiles',
    '角色资料；出现多个明确角色时尽量拆成多个角色条目',
    {
        actorKey: createStringField('actorKey', '角色键', 'erika'),
        displayName: createStringField('displayName', '角色名字；只写名字，不写房东、老板娘、同伴、身份说明或整句描述', '艾莉卡·暮影'),
        aliases: createListField('aliases', '别名；简称、误写、带括号称呼放这里', createStringField('value', '别名', '暮影', {
            fieldKey: 'value',
        }), ['暮影'], {
            updatable: true,
            updateMode: 'replace_scalar',
        }),
        identityFacts: createListField('identityFacts', '身份事实', createStringField('value', '身份事实', '暮影巡礼者', {
            fieldKey: 'value',
        }), ['暮影巡礼者'], {
            updatable: true,
            updateMode: 'replace_scalar',
        }),
        originFacts: createListField('originFacts', '来历事实', createStringField('value', '来历事实', '来自北境雾港。', {
            fieldKey: 'value',
        }), ['来自北境雾港。'], {
            updatable: true,
            updateMode: 'replace_scalar',
        }),
        relationshipFacts: createListField('relationshipFacts', '关系事实', roleRelationshipDefinition, [
            {
                targetActorKey: 'liya',
                targetLabel: '莉娅',
                label: '同伴',
                detail: '与莉娅长期同行，遇险时会互相掩护。',
            },
        ], {
            updatable: true,
            updateMode: 'upsert_item',
            itemPrimaryKey: 'targetLabel',
        }),
        items: createListField('items', '物品', roleAssetDefinition, [
            {
                kind: 'item',
                name: '旧地图',
                detail: '标记着北境旧路和隐蔽渡口。',
            },
        ], {
            updatable: true,
            updateMode: 'upsert_item',
            itemPrimaryKey: 'name',
        }),
        equipments: createListField('equipments', '装备', roleAssetDefinition, [
            {
                kind: 'equipment',
                name: '暮影短刃',
                detail: '刀柄包着旧皮革，适合近身防卫。',
            },
        ], {
            updatable: true,
            updateMode: 'upsert_item',
            itemPrimaryKey: 'name',
        }),
        currentLocation: createStringField('currentLocation', '当前位置', '黑塔档案厅'),
        organizationMemberships: createListField('organizationMemberships', '所属势力组织', createStringField('value', '势力组织', '白塔议会', {
            fieldKey: 'value',
        }), ['白塔议会'], {
            updatable: true,
            updateMode: 'replace_scalar',
        }),
        activeTasks: createListField('activeTasks', '当前任务', createStringField('value', '任务', '查清黑塔档案失窃案。', {
            fieldKey: 'value',
        }), ['查清黑塔档案失窃案。'], {
            updatable: true,
            updateMode: 'replace_scalar',
        }),
        updatedAt: createNumberField('updatedAt', '更新时间', 1735689600000),
    },
    {
        actorKey: 'erika',
        displayName: '艾莉卡·暮影',
        aliases: ['暮影'],
        identityFacts: ['暮影巡礼者'],
        originFacts: ['来自北境雾港。'],
        relationshipFacts: [
            {
                targetActorKey: 'liya',
                targetLabel: '莉娅',
                label: '同伴',
                detail: '与莉娅长期同行，遇险时会互相掩护。',
            },
        ],
        items: [
            {
                kind: 'item',
                name: '旧地图',
                detail: '标记着北境旧路和隐蔽渡口。',
            },
        ],
        equipments: [
            {
                kind: 'equipment',
                name: '暮影短刃',
                detail: '刀柄包着旧皮革，适合近身防卫。',
            },
        ],
        currentLocation: '黑塔档案厅',
        organizationMemberships: ['白塔议会'],
        activeTasks: ['查清黑塔档案失窃案。'],
        updatedAt: 1735689600000,
    },
    {
        updateMode: 'upsert_item',
        itemPrimaryKey: 'actorKey',
    },
);

const organizationDetailDefinition = createObjectField(
    'organizationDetail',
    '势力组织细节',
    {
        name: createStringField('name', '名称', '白塔议会'),
        summary: createStringField('summary', '摘要', '主导暮光城法术许可与档案审议。'),
        aliases: createListField('aliases', '别名', createStringField('value', '别名', '白塔', { fieldKey: 'value' }), ['白塔'], { updatable: true, updateMode: 'replace_scalar' }),
        parentOrganizationName: createStringField('parentOrganizationName', '上级组织', ''),
        ownershipStatus: createStringField('ownershipStatus', '归属状态', '控制黑塔档案区。'),
        relatedActorKeys: createListField('relatedActorKeys', '关联角色键', createStringField('value', '角色键', 'erika', { fieldKey: 'value' }), ['erika'], { updatable: true, updateMode: 'replace_scalar' }),
        locationName: createStringField('locationName', '关联地点', '黑塔档案厅'),
    },
    {
        name: '白塔议会',
        summary: '主导暮光城法术许可与档案审议。',
        aliases: ['白塔'],
        parentOrganizationName: '',
        ownershipStatus: '控制黑塔档案区。',
        relatedActorKeys: ['erika'],
        locationName: '黑塔档案厅',
    },
);

const taskDetailDefinition = createObjectField(
    'taskDetail',
    '任务细节',
    {
        title: createStringField('title', '任务标题', '查清黑塔档案失窃案'),
        summary: createStringField('summary', '任务摘要', '追踪失窃档案流向并锁定内应。'),
        status: createEnumField('status', '任务状态', 'in_progress', TASK_STATUS_VALUES),
        objective: createStringField('objective', '任务目标', '定位失窃档案与幕后操作者。'),
        completionCriteria: createStringField('completionCriteria', '完成条件', '找回档案并确认责任方。'),
        progressNote: createStringField('progressNote', '推进记录', '已确认档案最后出现于黑塔内库。'),
        ownerActorKeys: createListField('ownerActorKeys', '负责角色键', createStringField('value', '角色键', 'erika', { fieldKey: 'value' }), ['erika'], { updatable: true, updateMode: 'replace_scalar' }),
        organizationNames: createListField('organizationNames', '关联势力组织', createStringField('value', '势力组织', '白塔议会', { fieldKey: 'value' }), ['白塔议会'], { updatable: true, updateMode: 'replace_scalar' }),
        locationName: createStringField('locationName', '关联地点', '黑塔档案厅'),
    },
    {
        title: '查清黑塔档案失窃案',
        summary: '追踪失窃档案流向并锁定内应。',
        status: 'in_progress',
        objective: '定位失窃档案与幕后操作者。',
        completionCriteria: '找回档案并确认责任方。',
        progressNote: '已确认档案最后出现于黑塔内库。',
        ownerActorKeys: ['erika'],
        organizationNames: ['白塔议会'],
        locationName: '黑塔档案厅',
    },
);

const majorEventDetailDefinition = createObjectField(
    'majorEventDetail',
    '重大事件细节',
    {
        title: createStringField('title', '事件标题', '黑塔档案失窃'),
        summary: createStringField('summary', '事件摘要', '失窃事件引发了城内多方势力博弈。'),
        phase: createStringField('phase', '事件阶段', '调查中'),
        locationName: createStringField('locationName', '关联地点', '黑塔档案厅'),
        relatedActorKeys: createListField('relatedActorKeys', '关联角色键', createStringField('value', '角色键', 'erika', { fieldKey: 'value' }), ['erika'], { updatable: true, updateMode: 'replace_scalar' }),
        organizationNames: createListField('organizationNames', '关联势力组织', createStringField('value', '势力组织', '白塔议会', { fieldKey: 'value' }), ['白塔议会'], { updatable: true, updateMode: 'replace_scalar' }),
        impact: createStringField('impact', '事件影响', '黑塔封锁升级，外城情报流通受阻。'),
    },
    {
        title: '黑塔档案失窃',
        summary: '失窃事件引发了城内多方势力博弈。',
        phase: '调查中',
        locationName: '黑塔档案厅',
        relatedActorKeys: ['erika'],
        organizationNames: ['白塔议会'],
        impact: '黑塔封锁升级，外城情报流通受阻。',
    },
);

const semanticSummaryFields: Record<string, AiJsonFieldDefinition> = {
    roleSummary: createStringField('roleSummary', '角色摘要', '艾莉卡·暮影是一名冷静克制的调查者。'),
    worldSummary: createStringField('worldSummary', '世界总览', '暮光城是魔法衰落与工业崛起碰撞的核心战场。'),
    identityFacts: createListField('identityFacts', '身份事实', createStringField('value', '身份事实', '暮影巡礼者', { fieldKey: 'value' }), ['暮影巡礼者'], { updatable: true, updateMode: 'replace_scalar' }),
    worldRules: createListField('worldRules', '世界规则', createStringField('value', '规则', '公开施法会留下可追踪痕迹。', { fieldKey: 'value' }), ['公开施法会留下可追踪痕迹。'], { updatable: true, updateMode: 'replace_scalar' }),
    hardConstraints: createListField('hardConstraints', '硬约束', createStringField('value', '硬约束', '未经许可不得进入黑塔档案区。', { fieldKey: 'value' }), ['未经许可不得进入黑塔档案区。'], { updatable: true, updateMode: 'replace_scalar' }),
    cities: createListField('cities', '城市', createStringField('value', '城市', '雾港', { fieldKey: 'value' }), ['雾港'], { updatable: true, updateMode: 'replace_scalar' }),
    locations: createListField('locations', '地点', createStringField('value', '地点', '黑塔档案厅', { fieldKey: 'value' }), ['黑塔档案厅'], { updatable: true, updateMode: 'replace_scalar' }),
    entities: createListField('entities', '实体', createStringField('value', '实体', '黑塔', { fieldKey: 'value' }), ['黑塔'], { updatable: true, updateMode: 'replace_scalar' }),
    nations: createListField('nations', '国家', createStringField('value', '国家', '晨星王国', { fieldKey: 'value' }), ['晨星王国'], { updatable: true, updateMode: 'replace_scalar' }),
    regions: createListField('regions', '区域', createStringField('value', '区域', '北境', { fieldKey: 'value' }), ['北境'], { updatable: true, updateMode: 'replace_scalar' }),
    organizations: createListField('organizations', '势力组织', createStringField('value', '势力组织', '白塔议会', { fieldKey: 'value' }), ['白塔议会'], { updatable: true, updateMode: 'replace_scalar' }),
    calendarSystems: createListField('calendarSystems', '历法', createStringField('value', '历法', '以永恒盟约签订为纪元元年。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    currencySystems: createListField('currencySystems', '货币系统', createStringField('value', '货币系统', '金齿轮、银齿轮、铜螺丝并行流通。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    socialSystems: createListField('socialSystems', '社会制度', createStringField('value', '社会制度', '暮光城存在严格的阶层分化。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    culturalPractices: createListField('culturalPractices', '文化习俗', createStringField('value', '文化习俗', '每月满月之夜举办纯血舞会。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    majorEvents: createListField('majorEvents', '重大事件', createStringField('value', '重大事件', '圣树焚毁事件改变了大陆秩序。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    dangers: createListField('dangers', '危险', createStringField('value', '危险', '暗影窟深处存在危险猎食者。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    otherWorldDetails: createListField('otherWorldDetails', '其他世界细节', createStringField('value', '其他世界细节', '工业污染正在稀释以太浓度。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    tasks: createListField('tasks', '任务', createStringField('value', '任务', '查清黑塔档案失窃案。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    relationshipFacts: createListField('relationshipFacts', '关系事实', createStringField('value', '关系事实', '艾莉卡信任莉娅。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    catchphrases: createListField('catchphrases', '口头禅', createStringField('value', '口头禅', '不要回头。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    relationshipAnchors: createListField('relationshipAnchors', '关系锚点', createStringField('value', '关系锚点', '遇险时会优先让莉娅先撤。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    styleCues: createListField('styleCues', '风格线索', createStringField('value', '风格线索', '语气克制，避免夸张描述。', { fieldKey: 'value' }), [], { updatable: true, updateMode: 'replace_scalar' }),
    nationDetails: createListField('nationDetails', '国家细节', createCatalogEntryDefinition('nationDetail'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'name' }),
    regionDetails: createListField('regionDetails', '区域细节', createCatalogEntryDefinition('regionDetail'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'name' }),
    cityDetails: createListField('cityDetails', '城市细节', createCatalogEntryDefinition('cityDetail'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'name' }),
    locationDetails: createListField('locationDetails', '地点细节', createCatalogEntryDefinition('locationDetail'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'name' }),
    organizationDetails: createListField('organizationDetails', '势力组织细节', organizationDetailDefinition, [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'name' }),
    taskDetails: createListField('taskDetails', '任务细节', taskDetailDefinition, [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    majorEventDetails: createListField('majorEventDetails', '重大事件细节', majorEventDetailDefinition, [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    ruleDetails: createListField('ruleDetails', '规则细节', createWorldFacetDetailDefinition('ruleDetail', 'rule'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    constraintDetails: createListField('constraintDetails', '硬约束细节', createWorldFacetDetailDefinition('constraintDetail', 'constraint'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    socialSystemDetails: createListField('socialSystemDetails', '社会制度细节', createWorldFacetDetailDefinition('socialSystemDetail', 'social'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    culturalPracticeDetails: createListField('culturalPracticeDetails', '文化习俗细节', createWorldFacetDetailDefinition('culturalPracticeDetail', 'culture'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    dangerDetails: createListField('dangerDetails', '危险细节', createWorldFacetDetailDefinition('dangerDetail', 'danger'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    entityDetails: createListField('entityDetails', '实体细节', createWorldFacetDetailDefinition('entityDetail', 'entity'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
    otherWorldDetailDetails: createListField('otherWorldDetailDetails', '其他世界细节', createWorldFacetDetailDefinition('otherWorldDetail', 'other'), [], { updatable: true, updateMode: 'upsert_item', itemPrimaryKey: 'title' }),
};

const roleNamespaceFields: Record<string, AiJsonFieldDefinition> = {
    profiles: createListField('profiles', '角色资料；多个明确角色要分别建条目', roleProfileDefinition, [
        {
            actorKey: 'erika',
            displayName: '艾莉卡·暮影',
            aliases: ['暮影'],
            identityFacts: ['暮影巡礼者'],
            originFacts: ['来自北境雾港。'],
            relationshipFacts: [
                {
                    targetActorKey: 'liya',
                    targetLabel: '莉娅',
                    label: '同伴',
                    detail: '与莉娅长期同行，遇险时会互相掩护。',
                },
            ],
            items: [],
            equipments: [],
            currentLocation: '黑塔档案厅',
            organizationMemberships: ['白塔议会'],
            activeTasks: ['查清黑塔档案失窃案。'],
            updatedAt: 1735689600000,
        },
        {
            actorKey: 'liya',
            displayName: '莉娅',
            aliases: [],
            identityFacts: [],
            originFacts: [],
            relationshipFacts: [
                {
                    targetActorKey: 'erika',
                    targetLabel: '艾莉卡·暮影',
                    label: '同伴',
                    detail: '与艾莉卡长期同行。',
                },
            ],
            items: [],
            equipments: [],
            currentLocation: '',
            organizationMemberships: [],
            activeTasks: [],
            updatedAt: 1735689600000,
        },
    ], {
        updatable: true,
        updateMode: 'upsert_item',
        itemPrimaryKey: 'actorKey',
    }),
    activeActorKey: createStringField('activeActorKey', '当前主视角角色键', 'erika'),
    summary: createObjectField(
        'summary',
        '角色系统摘要',
        {
            overview: createStringField('overview', '角色概览', '当前重点角色是艾莉卡·暮影。'),
            updatedAt: createNumberField('updatedAt', '角色摘要更新时间', 1735689600000),
        },
        {
            overview: '当前重点角色是艾莉卡·暮影。',
            updatedAt: 1735689600000,
        },
    ),
};

const proposalEntityDefinition = createObjectField(
    'entity',
    '关联实体。',
    {
        kind: createStringField('kind', '实体类别。', 'character'),
        id: createStringField('id', '实体 ID。', 'erika'),
    },
    {
        kind: 'character',
        id: 'erika',
    },
    {
        updatable: false,
    },
);

const proposalSummarySourceDefinition = createObjectField(
    'source',
    '摘要来源。',
    {
        extractor: createStringField('extractor', '提取器。', 'memory.ingest'),
        provider: createStringField('provider', '模型来源。', 'openrouter'),
        provenanceJson: createStringField('provenanceJson', '来源补充 JSON。', '{"reason":"来自最近一段对话。"}', {
            updatable: false,
        }),
    },
    {
        extractor: 'memory.ingest',
        provider: 'openrouter',
        provenanceJson: '{"reason":"来自最近一段对话。"}',
    },
    {
        updatable: false,
    },
);

const proposalMemoryCardDefinition = createObjectField(
    'memoryCard',
    '记忆卡。',
    {
        scope: createEnumField('scope', '作用域。', 'character', MEMORY_CARD_SCOPE_VALUES),
        lane: createStringField('lane', '槽位。', 'dialogue'),
        subject: createStringField('subject', '主体。', '艾莉卡·暮影'),
        title: createStringField('title', '标题。', '关键对话'),
        memoryText: createStringField('memoryText', '记忆正文。', '艾莉卡记住了莉娅说过“不要回头”。'),
        evidenceText: createStringField('evidenceText', '证据。', '原句来自撤离前的最后提醒。'),
        entityKeys: createListField('entityKeys', '关联实体键。', createStringField('value', '实体键。', 'erika', { fieldKey: 'value' }), ['erika', 'liya'], { updatable: false }),
        keywords: createListField('keywords', '关键词。', createStringField('value', '关键词。', '撤离', { fieldKey: 'value' }), ['撤离'], { updatable: false }),
        importance: createNumberField('importance', '重要度。', 0.92),
        confidence: createNumberField('confidence', '置信度。', 0.87),
        ttl: createEnumField('ttl', '时效。', 'long', MEMORY_CARD_TTL_VALUES),
        replaceKey: createStringField('replaceKey', '替换键。', 'dialogue:liya:msg_105'),
        sourceRefs: createListField('sourceRefs', '来源引用。', createStringField('value', '来源引用。', 'message:msg_105', { fieldKey: 'value' }), ['message:msg_105'], { updatable: false }),
        sourceRecordKey: createStringField('sourceRecordKey', '来源记录键。', 'summary_msg_105'),
        sourceRecordKind: createStringField('sourceRecordKind', '来源记录类型。', 'summary'),
        ownerActorKey: createStringField('ownerActorKey', '拥有者角色键。', 'erika'),
        memoryType: createStringField('memoryType', '记忆类型。', 'dialogue'),
        memorySubtype: createStringField('memorySubtype', '记忆子类型。', 'dialogue_quote'),
        sourceMessageIds: createListField('sourceMessageIds', '来源消息 ID。', createStringField('value', '消息 ID。', 'msg_105', { fieldKey: 'value' }), ['msg_105'], { updatable: false }),
        speakerActorKey: createStringField('speakerActorKey', '说话者角色键。', 'liya'),
        speakerLabel: createStringField('speakerLabel', '说话者名称。', '莉娅'),
        rememberedByActorKey: createStringField('rememberedByActorKey', '记住者角色键。', 'erika'),
        rememberReason: createStringField('rememberReason', '记住原因。', '这是撤离前最关键的警告。'),
        participantActorKeys: createListField('participantActorKeys', '参与者角色键。', createStringField('value', '角色键。', 'erika', { fieldKey: 'value' }), ['erika', 'liya'], { updatable: false }),
        validFrom: createNumberField('validFrom', '生效时间。', 1735689600000),
        validTo: createNumberField('validTo', '失效时间。', 1738291200000),
    },
    {
        scope: 'character',
        lane: 'dialogue',
        subject: '艾莉卡·暮影',
        title: '关键对话',
        memoryText: '艾莉卡记住了莉娅说过“不要回头”。',
        evidenceText: '原句来自撤离前的最后提醒。',
        entityKeys: ['erika', 'liya'],
        keywords: ['撤离', '提醒'],
        importance: 0.92,
        confidence: 0.87,
        ttl: 'long',
        replaceKey: 'dialogue:liya:msg_105',
        sourceRefs: ['message:msg_105'],
        sourceRecordKey: 'summary_msg_105',
        sourceRecordKind: 'summary',
        ownerActorKey: 'erika',
        memoryType: 'dialogue',
        memorySubtype: 'dialogue_quote',
        sourceMessageIds: ['msg_105'],
        speakerActorKey: 'liya',
        speakerLabel: '莉娅',
        rememberedByActorKey: 'erika',
        rememberReason: '这是撤离前最关键的警告。',
        participantActorKeys: ['erika', 'liya'],
        validFrom: 1735689600000,
        validTo: 1738291200000,
    },
    {
        updatable: false,
    },
);

const proposalSummaryDefinition = createObjectField(
    'summary',
    '摘要提案。',
    {
        level: createEnumField('level', '层级。', 'scene', ['message', 'scene', 'arc']),
        summaryId: createStringField('summaryId', '摘要 ID。', 'summary_scene_01'),
        targetRecordKey: createStringField('targetRecordKey', '目标记录键。', 'record_scene_01'),
        action: createEnumField('action', '动作。', 'auto', ['auto', 'update', 'merge', 'delete', 'invalidate']),
        title: createStringField('title', '标题。', '雾港撤离'),
        content: createStringField('content', '正文。', '艾莉卡与莉娅在雾港完成撤离确认，并留下新的线索。'),
        keywords: createListField('keywords', '关键词。', createStringField('value', '关键词。', '雾港', { fieldKey: 'value' }), ['雾港', '撤离'], { updatable: false }),
        memoryCards: createListField('memoryCards', '记忆卡。', proposalMemoryCardDefinition, [], { updatable: false }),
        messageId: createStringField('messageId', '消息 ID。', 'msg_105'),
        range: createObjectField('range', '消息范围。', {
            fromMessageId: createStringField('fromMessageId', '起始消息 ID。', 'msg_101'),
            toMessageId: createStringField('toMessageId', '结束消息 ID。', 'msg_105'),
        }, {
            fromMessageId: 'msg_101',
            toMessageId: 'msg_105',
        }, {
            updatable: false,
        }),
        source: proposalSummarySourceDefinition,
    },
    {
        level: 'scene',
        summaryId: 'summary_scene_01',
        targetRecordKey: 'record_scene_01',
        action: 'auto',
        title: '雾港撤离',
        content: '艾莉卡与莉娅在雾港完成撤离确认，并留下新的线索。',
        keywords: ['雾港', '撤离'],
        memoryCards: [],
        messageId: 'msg_105',
        range: {
            fromMessageId: 'msg_101',
            toMessageId: 'msg_105',
        },
        source: {
            extractor: 'memory.ingest',
            provider: 'openrouter',
            provenanceJson: '{"reason":"来自最近一段对话。"}',
        },
    },
    {
        updatable: false,
    },
);

const memoryProposalFields: Record<string, AiJsonFieldDefinition> = {
    facts: createListField('facts', '事实提案。', createObjectField('fact', '事实提案。', {
        factKey: createStringField('factKey', '事实键。', 'fact_erika_relation_01'),
        targetRecordKey: createStringField('targetRecordKey', '目标记录键。', 'record_fact_01'),
        action: createEnumField('action', '动作。', 'auto', ['auto', 'update', 'merge', 'delete', 'invalidate']),
        type: createStringField('type', '事实类型。', 'relationship_fact'),
        entity: proposalEntityDefinition,
        path: createStringField('path', '目标路径。', '/relationships/erika/liya'),
        valueJson: createStringField('valueJson', '事实值 JSON。', '{"label":"同伴","detail":"艾莉卡依赖莉娅提供撤离判断。"}', { updatable: false }),
        confidence: createNumberField('confidence', '置信度。', 0.88),
        provenanceJson: createStringField('provenanceJson', '来源补充 JSON。', '{"sourceMessageIds":["msg_105"]}', { updatable: false }),
    }, {
        factKey: 'fact_erika_relation_01',
        targetRecordKey: 'record_fact_01',
        action: 'auto',
        type: 'relationship_fact',
        entity: { kind: 'character', id: 'erika' },
        path: '/relationships/erika/liya',
        valueJson: '{"label":"同伴","detail":"艾莉卡依赖莉娅提供撤离判断。"}',
        confidence: 0.88,
        provenanceJson: '{"sourceMessageIds":["msg_105"]}',
    }, { updatable: false }), [], { updatable: false }),
    patches: createListField('patches', '状态补丁。', createObjectField('patch', '状态补丁。', {
        op: createEnumField('op', '补丁操作。', 'replace', ['add', 'replace', 'remove']),
        path: createStringField('path', '补丁路径。', '/groupMemory/lanes/erika/latestMood'),
        valueJson: createStringField('valueJson', '补丁值 JSON。', '{"mood":"戒备"}', { updatable: false }),
    }, {
        op: 'replace',
        path: '/groupMemory/lanes/erika/latestMood',
        valueJson: '{"mood":"戒备"}',
    }, { updatable: false }), [], { updatable: false }),
    summaries: createListField('summaries', '摘要提案。', proposalSummaryDefinition, [], { updatable: false }),
    notes: createStringField('notes', '补充说明。', '本轮重点保留撤离阶段形成的新关系和关键对话。', { updatable: false }),
    schemaChanges: createListField('schemaChanges', '结构变更建议。', createObjectField('schemaChange', '结构变更建议。', {
        kind: createEnumField('kind', '变更类型。', 'add_field', MEMORY_SCHEMA_CHANGE_VALUES),
        tableKey: createStringField('tableKey', '目标表键。', 'character_relationships'),
        fieldKey: createStringField('fieldKey', '字段键。', 'bond_reason'),
        payloadJson: createStringField('payloadJson', '结构负载 JSON。', '{"type":"string","description":"关系形成原因"}', { updatable: false }),
        requiredByFacts: createBooleanField('requiredByFacts', '事实驱动。', true),
    }, {
        kind: 'add_field',
        tableKey: 'character_relationships',
        fieldKey: 'bond_reason',
        payloadJson: '{"type":"string","description":"关系形成原因"}',
        requiredByFacts: true,
    }, { updatable: false }), [], { updatable: false }),
    entityResolutions: createListField('entityResolutions', '实体解析建议。', createObjectField('entityResolution', '实体解析建议。', {
        tableKey: createStringField('tableKey', '目标表键。', 'characters'),
        fromRowId: createStringField('fromRowId', '来源行 ID。', 'erika_shadow'),
        toRowId: createStringField('toRowId', '目标行 ID。', 'erika'),
        confidence: createNumberField('confidence', '置信度。', 0.76),
        reason: createStringField('reason', '合并原因。', '两条记录都指向同一名调查者。'),
    }, {
        tableKey: 'characters',
        fromRowId: 'erika_shadow',
        toRowId: 'erika',
        confidence: 0.76,
        reason: '两条记录都指向同一名调查者。',
    }, { updatable: false }), [], { updatable: false }),
    confidence: createNumberField('confidence', '整体置信度。', 0.86, { updatable: false }),
};

/**
 * 功能：返回默认命名空间注册表。
 * @returns 默认命名空间定义列表。
 */
export function getDefaultAiJsonNamespaces(): AiJsonNamespaceDefinition[] {
    return [
        {
            namespaceKey: 'semantic_summary',
            title: '语义摘要',
            description: '世界观与角色摘要。',
            fields: semanticSummaryFields,
            example: {
                roleSummary: '艾莉卡·暮影是一名冷静克制的调查者。',
                worldSummary: '暮光城是魔法衰落与工业崛起碰撞的核心战场。',
                identityFacts: ['暮影巡礼者'],
                worldRules: ['公开施法会留下可追踪痕迹。'],
                hardConstraints: ['未经许可不得进入黑塔档案区。'],
                cities: ['雾港'],
                locations: ['黑塔档案厅'],
                entities: ['黑塔'],
                nations: ['晨星王国'],
                regions: ['北境'],
                organizations: ['白塔议会'],
                calendarSystems: [],
                currencySystems: [],
                socialSystems: [],
                culturalPractices: [],
                majorEvents: [],
                dangers: [],
                otherWorldDetails: [],
                tasks: [],
                relationshipFacts: [],
                catchphrases: [],
                relationshipAnchors: [],
                styleCues: [],
                nationDetails: [],
                regionDetails: [],
                cityDetails: [],
                locationDetails: [],
                organizationDetails: [],
                taskDetails: [],
                majorEventDetails: [],
                ruleDetails: [],
                constraintDetails: [],
                socialSystemDetails: [],
                culturalPracticeDetails: [],
                dangerDetails: [],
                entityDetails: [],
                otherWorldDetailDetails: [],
            },
            hooks: {
                normalizeInitDocument: normalizeSemanticSummaryDocument,
                afterApply: normalizeSemanticSummaryDocument,
            },
        },
        {
            namespaceKey: 'role',
            title: '角色系统',
            description: '角色资料与角色摘要。',
            entityKey: 'actorKey',
            entityCollectionField: 'profiles',
            entityCollectionStorage: 'record',
            fields: roleNamespaceFields,
            example: {
                profiles: [
                    {
                        actorKey: 'erika',
                        displayName: '艾莉卡·暮影',
                        aliases: ['暮影'],
                        identityFacts: ['暮影巡礼者'],
                        originFacts: ['来自北境雾港。'],
                        relationshipFacts: [
                            {
                                targetActorKey: 'liya',
                                targetLabel: '莉娅',
                                label: '同伴',
                                detail: '与莉娅长期同行，遇险时会互相掩护。',
                            },
                        ],
                        items: [],
                        equipments: [],
                        currentLocation: '黑塔档案厅',
                        organizationMemberships: ['白塔议会'],
                        activeTasks: ['查清黑塔档案失窃案。'],
                        updatedAt: 1735689600000,
                    },
                    {
                        actorKey: 'liya',
                        displayName: '莉娅',
                        aliases: [],
                        identityFacts: [],
                        originFacts: [],
                        relationshipFacts: [
                            {
                                targetActorKey: 'erika',
                                targetLabel: '艾莉卡·暮影',
                                label: '同伴',
                                detail: '与艾莉卡长期同行。',
                            },
                        ],
                        items: [],
                        equipments: [],
                        currentLocation: '',
                        organizationMemberships: [],
                        activeTasks: [],
                        updatedAt: 1735689600000,
                    },
                ],
                activeActorKey: 'erika',
                summary: {
                    overview: '当前重点角色是艾莉卡·暮影。',
                    updatedAt: 1735689600000,
                },
            },
            hooks: {
                normalizeInitDocument: normalizeRoleNamespaceDocument,
                afterApply: normalizeRoleNamespaceDocument,
            },
        },
        {
            namespaceKey: 'memory_proposal',
            title: '记忆提案',
            description: '记忆提案与结构建议。',
            fields: memoryProposalFields,
            example: {
                facts: [],
                patches: [],
                summaries: [],
                notes: '',
                schemaChanges: [],
                entityResolutions: [],
                confidence: 0,
            },
            hooks: {
                normalizeInitDocument: normalizeMemoryProposalDocument,
                afterApply: normalizeMemoryProposalDocument,
            },
        },
    ];
}
