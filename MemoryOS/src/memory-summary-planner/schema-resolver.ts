/**
 * 功能：总结阶段类型字段白名单。
 */
export interface SummaryTypeSchema {
    schemaId: string;
    editableFields: string[];
}

const BUILTIN_SCHEMA_FIELDS: Record<string, string[]> = {
    actor_profile: ['title', 'summary', 'tags', 'fields.aliases', 'fields.identityFacts', 'fields.originFacts', 'fields.traits'],
    relationship: ['summary', 'trust', 'affection', 'tension', 'unresolvedConflict', 'milestones', 'fields.relationTag'],
    event: ['title', 'summary', 'importance', 'memorySubtype', 'participants', 'tags', 'fields.location', 'fields.outcome'],
    actor_visible_event: ['title', 'summary', 'importance', 'memorySubtype', 'participants', 'tags', 'fields.location', 'fields.outcome'],
    actor_private_interpretation: ['title', 'summary', 'importance', 'tags', 'fields.sourceEventId', 'fields.bias', 'fields.certainty'],
    task: ['title', 'summary', 'fields.objective', 'fields.status', 'importance', 'tags'],
    location: ['title', 'summary', 'tags', 'fields.nation', 'fields.city', 'fields.parentLocation', 'fields.function', 'fields.controllingOrganization', 'fields.entryCondition', 'fields.dangerLevel', 'fields.status', 'fields.aliases'],
    organization: ['title', 'summary', 'tags', 'fields.orgType', 'fields.subtype', 'fields.alignment', 'fields.ideology', 'fields.leader', 'fields.headquartersNation', 'fields.headquartersCity', 'fields.headquartersLocation', 'fields.parentOrganization', 'fields.status', 'fields.influence', 'fields.scope', 'fields.aliases'],
    city: ['title', 'summary', 'tags', 'fields.nation', 'fields.region', 'fields.ruler', 'fields.controllingOrganization', 'fields.traits', 'fields.status', 'fields.aliases'],
    nation: ['title', 'summary', 'tags', 'fields.region', 'fields.capital', 'fields.governance', 'fields.ruler', 'fields.ideology', 'fields.status', 'fields.aliases'],
    scene_shared_state: ['title', 'summary', 'tags', 'fields.location', 'fields.visibilityScope', 'fields.participants'],
    world_core_setting: ['title', 'summary', 'scope', 'tags'],
    world_hard_rule: ['title', 'summary', 'scope', 'tags'],
    world_global_state: ['title', 'summary', 'scope', 'state', 'supersededBy', 'tags'],
};

/**
 * 功能：按候选类型解析字段白名单。
 * @param candidateTypes 候选类型列表。
 * @param fieldExtensions 世界模板字段扩展。
 * @returns 白名单列表。
 */
export function resolveSummaryTypeSchemas(
    candidateTypes: string[],
    fieldExtensions: Record<string, string[]>,
): SummaryTypeSchema[] {
    return candidateTypes.map((type: string): SummaryTypeSchema => {
        const normalized = String(type ?? '').trim();
        const baseFields = BUILTIN_SCHEMA_FIELDS[normalized] ?? ['title', 'summary', 'tags'];
        const extensionFields = (fieldExtensions[normalized] ?? []).map((field: string): string => `fields.${field}`);
        const editableFields = uniqueStrings([...baseFields, ...extensionFields]);
        return {
            schemaId: normalized,
            editableFields,
        };
    });
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function uniqueStrings(values: string[]): string[] {
    const merged: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}
