import type {
    InjectionSectionName,
    MemoryContextBlockUsage,
    RecallCandidate,
    RecallPlan,
    RelationshipState,
    RoleAssetEntry,
    RoleProfile,
    RoleRelationshipFact,
} from '../types';

function countTokens(text: string): number {
    if (!text) {
        return 0;
    }
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
    return Math.max(1, Math.ceil(cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25));
}

/**
 * 功能：转义 XML 特殊字符，避免文本破坏结构。
 * @param input 原始文本。
 * @returns 可安全写入 XML 的文本。
 */
/**
 * 功能：转义 XML 文本节点中的必要特殊字符，避免破坏结构且保留可读引号。
 * @param input 原始文本。
 * @returns 可安全写入 XML 文本节点的内容。
 */
function escapeXml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

/**
 * 功能：清洗文本并转成单行字符串。
 * @param input 原始值。
 * @returns 归一化后的字符串。
 */
function normalizeText(input: unknown): string {
    return String(input ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：归一化角色键用于比对。
 * @param actorKey 角色键。
 * @returns 归一化后的角色键。
 */
function normalizeActorKey(actorKey: unknown): string {
    return normalizeText(actorKey).toLowerCase();
}

/**
 * 功能：把 actorKey 转成可用作 XML 标签名的值。
 * @param actorKey 角色键。
 * @returns 合法 XML 标签名。
 */
function toActorTagName(actorKey: string): string {
    const normalized = normalizeText(actorKey).replace(/[^A-Za-z0-9_.-]/g, '_');
    if (!normalized) {
        return 'unknown_actor';
    }
    if (/^[0-9.-]/.test(normalized)) {
        return `a_${normalized}`;
    }
    return normalized;
}

/**
 * 功能：把文本数组渲染成 XML 子节点集合。
 * @param tagName 子节点标签名。
 * @param values 文本数组。
 * @returns XML 片段。
 */
function renderTextList(tagName: string, values: string[]): string {
    const normalized = values.map((value: string): string => normalizeText(value)).filter(Boolean);
    if (normalized.length <= 0) {
        return '';
    }
    return normalized.map((value: string): string => `<${tagName}>${escapeXml(value)}</${tagName}>`).join('');
}

type RoleMemoryEntry = {
    type: string;
    subtype: string;
    summary: string;
    source: string;
    reason: string;
};

type RoleXmlNode = {
    actorKey: string;
    displayName: string;
    identityFacts: string[];
    originFacts: string[];
    items: RoleAssetEntry[];
    equipments: RoleAssetEntry[];
    relationships: RoleRelationshipFact[];
    memories: RoleMemoryEntry[];
    isPrimary: boolean;
};

type WorldInfoNode = {
    summary: string[];
    rules: string[];
    states: string[];
    recentScene: string[];
};

function dedupeTexts(values: string[]): string[] {
    return Array.from(new Set(values.map((value: string): string => normalizeText(value)).filter(Boolean)));
}

function inferMemoryType(candidate: RecallCandidate): string {
    if (candidate.recordKind === 'event') return 'event';
    if (candidate.recordKind === 'relationship') return 'relationship';
    if (candidate.recordKind === 'state') return 'state';
    if (candidate.recordKind === 'summary') return 'summary';
    return candidate.source || 'fact';
}

function inferMemorySubtype(candidate: RecallCandidate): string {
    if (candidate.sectionHint) {
        return String(candidate.sectionHint).toLowerCase();
    }
    return candidate.visibilityPool === 'actor' ? 'actor_memory' : 'world_memory';
}

function buildMemoryEntry(candidate: RecallCandidate): RoleMemoryEntry {
    const reason = candidate.reasonCodes.slice(0, 3).join(' / ');
    return {
        type: inferMemoryType(candidate),
        subtype: inferMemorySubtype(candidate),
        summary: normalizeText(candidate.rawText),
        source: `${candidate.source}:${candidate.recordKey}`,
        reason: reason || 'recall',
    };
}

/**
 * 功能：尝试解析 `/semantic/...: payload` 形式的文本，提取结构化值。
 * @param text 原始文本。
 * @returns 成功时返回路径和值，否则返回 `null`。
 */
function tryParseSemanticPayload(text: string): { path: string; value: unknown } | null {
    const normalized = normalizeText(text);
    if (!normalized.startsWith('/semantic/')) {
        return null;
    }
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0) {
        return null;
    }
    const path = normalized.slice(0, separatorIndex).trim();
    const payloadText = normalized.slice(separatorIndex + 1).trim();
    if (!payloadText) {
        return { path, value: '' };
    }
    try {
        return {
            path,
            value: JSON.parse(payloadText),
        };
    } catch {
        return {
            path,
            value: payloadText,
        };
    }
}

/**
 * 功能：把世界规则记录规整成适合注入的规则列表。
 * @param text 原始规则文本。
 * @returns 展开的规则文本列表。
 */
function normalizeRuleTexts(text: string): string[] {
    const parsed = tryParseSemanticPayload(text);
    if (!parsed) {
        return [normalizeText(text)].filter(Boolean);
    }
    if (Array.isArray(parsed.value)) {
        return dedupeTexts(parsed.value.map((item: unknown): string => normalizeText(item)));
    }
    if (parsed.value && typeof parsed.value === 'object') {
        const record = parsed.value as Record<string, unknown>;
        return dedupeTexts([
            normalizeText(record.summary),
            normalizeText(record.title),
            normalizeText(record.detail),
            normalizeText(record.content),
        ]);
    }
    return dedupeTexts([normalizeText(parsed.value)]);
}

/**
 * 功能：把世界状态记录规整成简洁状态描述，避免把整段原始 JSON 直接注入。
 * @param text 原始状态文本。
 * @returns 适合 prompt 的状态描述。
 */
function normalizeStateText(text: string): string {
    const parsed = tryParseSemanticPayload(text);
    if (!parsed) {
        return normalizeText(text);
    }
    if (parsed.value && typeof parsed.value === 'object' && !Array.isArray(parsed.value)) {
        const record = parsed.value as Record<string, unknown>;
        return normalizeText(record.summary)
            || normalizeText(record.title)
            || normalizeText(record.detail)
            || normalizeText(record.content)
            || normalizeText(text);
    }
    if (Array.isArray(parsed.value)) {
        return dedupeTexts(parsed.value.map((item: unknown): string => normalizeText(item))).join('；');
    }
    return normalizeText(parsed.value) || normalizeText(text);
}

function classifyWorldInfo(candidates: RecallCandidate[]): WorldInfoNode {
    const summary: string[] = [];
    const rules: string[] = [];
    const states: string[] = [];
    const recentScene: string[] = [];
    for (const candidate of candidates) {
        const text = normalizeText(candidate.rawText);
        if (!text) continue;
        const section = candidate.sectionHint;
        if (section === 'SUMMARY' || section === 'SHORT_SUMMARY') {
            summary.push(text);
            continue;
        }
        if (section === 'LAST_SCENE' || section === 'EVENTS') {
            recentScene.push(text);
            continue;
        }
        if (section === 'WORLD_STATE' && /(规则|约束|rule|constraint)/i.test(text + ' ' + candidate.title)) {
            rules.push(...normalizeRuleTexts(text));
            continue;
        }
        states.push(normalizeStateText(text));
    }
    return {
        summary: dedupeTexts(summary).slice(0, 4),
        rules: dedupeTexts(rules).slice(0, 6),
        states: dedupeTexts(states).slice(0, 8),
        recentScene: dedupeTexts(recentScene).slice(0, 4),
    };
}

function buildRoleProfilesLookup(roleProfiles: Record<string, RoleProfile>): Map<string, RoleProfile> {
    return Object.entries(roleProfiles ?? {}).reduce<Map<string, RoleProfile>>((result: Map<string, RoleProfile>, [actorKey, profile]: [string, RoleProfile]): Map<string, RoleProfile> => {
        const normalized = normalizeActorKey(actorKey || profile.actorKey);
        if (!normalized) {
            return result;
        }
        result.set(normalized, profile);
        return result;
    }, new Map<string, RoleProfile>());
}

function collectRelatedActorKeys(input: {
    candidates: RecallCandidate[];
    plan: RecallPlan;
    relationships: RelationshipState[];
}): { primaryActorKey: string | null; relatedActorKeys: string[] } {
    const primaryActorKey = normalizeActorKey(input.plan.viewpoint.activeActorKey ?? input.plan.viewpoint.focus.primaryActorKey ?? null) || null;
    const related = new Set<string>();
    const push = (actorKey: unknown): void => {
        const normalized = normalizeActorKey(actorKey);
        if (!normalized || normalized === primaryActorKey) {
            return;
        }
        related.add(normalized);
    };
    (input.plan.viewpoint.focus.secondaryActorKeys ?? []).forEach((actorKey: string): void => push(actorKey));
    input.candidates.forEach((candidate: RecallCandidate): void => {
        push(candidate.ownerActorKey);
        (candidate.participantActorKeys ?? []).forEach((actorKey: string): void => push(actorKey));
    });
    if (primaryActorKey) {
        input.relationships.forEach((relationship: RelationshipState): void => {
            const actorKey = normalizeActorKey(relationship.actorKey);
            const targetKey = normalizeActorKey(relationship.targetKey);
            if (actorKey === primaryActorKey) {
                push(targetKey);
            }
            if (targetKey === primaryActorKey) {
                push(actorKey);
            }
            (relationship.participantKeys ?? []).forEach((participant: string): void => {
                if (normalizeActorKey(participant) !== primaryActorKey) {
                    push(participant);
                }
            });
        });
    }
    return {
        primaryActorKey,
        relatedActorKeys: Array.from(related).slice(0, 2),
    };
}

function buildRoleNodes(input: {
    candidates: RecallCandidate[];
    plan: RecallPlan;
    roleProfiles: Record<string, RoleProfile>;
    relationships: RelationshipState[];
}): RoleXmlNode[] {
    const { primaryActorKey, relatedActorKeys } = collectRelatedActorKeys({
        candidates: input.candidates,
        plan: input.plan,
        relationships: input.relationships,
    });
    const roleProfilesMap = buildRoleProfilesLookup(input.roleProfiles);
    const orderedActorKeys = [primaryActorKey, ...relatedActorKeys].filter(Boolean) as string[];
    if (orderedActorKeys.length <= 0) {
        return [];
    }
    const selectedCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.selected);
    const roleNodes: RoleXmlNode[] = orderedActorKeys.map((actorKey: string, index: number): RoleXmlNode => {
        const profile = roleProfilesMap.get(actorKey);
        const actorCandidates = selectedCandidates
            .filter((candidate: RecallCandidate): boolean => {
                const owner = normalizeActorKey(candidate.ownerActorKey);
                if (owner) {
                    return owner === actorKey;
                }
                return actorKey === primaryActorKey && candidate.visibilityPool === 'actor';
            })
            .sort((left: RecallCandidate, right: RecallCandidate): number => Number(right.finalScore ?? 0) - Number(left.finalScore ?? 0))
            .slice(0, index === 0 ? 6 : 3);
        const memories = actorCandidates.map(buildMemoryEntry);
        const normalizedRelationships = Array.isArray(profile?.relationshipFacts) ? profile!.relationshipFacts.slice(0, index === 0 ? 8 : 4) : [];
        return {
            actorKey,
            displayName: normalizeText(profile?.displayName) || actorKey,
            identityFacts: dedupeTexts(profile?.identityFacts ?? []).slice(0, index === 0 ? 8 : 4),
            originFacts: dedupeTexts(profile?.originFacts ?? []).slice(0, index === 0 ? 6 : 3),
            items: Array.isArray(profile?.items) ? profile!.items.slice(0, index === 0 ? 8 : 4) : [],
            equipments: Array.isArray(profile?.equipments) ? profile!.equipments.slice(0, index === 0 ? 8 : 4) : [],
            relationships: normalizedRelationships,
            memories,
            isPrimary: index === 0,
        };
    });
    return roleNodes.filter((node: RoleXmlNode): boolean => {
        return Boolean(node.displayName)
            || node.identityFacts.length > 0
            || node.originFacts.length > 0
            || node.items.length > 0
            || node.equipments.length > 0
            || node.relationships.length > 0
            || node.memories.length > 0;
    });
}

function renderWorldInfoXml(worldInfo: WorldInfoNode): string {
    const summaryXml = renderTextList('summary', worldInfo.summary);
    const ruleItems = renderTextList('rule', worldInfo.rules);
    const stateItems = renderTextList('state', worldInfo.states);
    const recentSceneXml = renderTextList('recent_scene', worldInfo.recentScene);
    const rulesXml = ruleItems ? `<rules>${ruleItems}</rules>` : '';
    const statesXml = stateItems ? `<states>${stateItems}</states>` : '';
    return `<worldinfo>${summaryXml}${rulesXml}${statesXml}${recentSceneXml}</worldinfo>`;
}

function renderRoleXml(roleNode: RoleXmlNode): string {
    const identityXml = renderTextList('fact', roleNode.identityFacts);
    const originXml = renderTextList('fact', roleNode.originFacts);
    const profileXml = `<profile><display_name>${escapeXml(roleNode.displayName)}</display_name>${identityXml ? `<identity>${identityXml}</identity>` : ''}${originXml ? `<origin>${originXml}</origin>` : ''}</profile>`;
    const itemsXml = roleNode.items.length > 0
        ? `<items>${roleNode.items.map((item: RoleAssetEntry): string => `<item><name>${escapeXml(item.name)}</name>${normalizeText(item.detail) ? `<detail>${escapeXml(item.detail)}</detail>` : ''}</item>`).join('')}</items>`
        : '';
    const equipmentsXml = roleNode.equipments.length > 0
        ? `<equipments>${roleNode.equipments.map((item: RoleAssetEntry): string => `<equipment><name>${escapeXml(item.name)}</name>${normalizeText(item.detail) ? `<detail>${escapeXml(item.detail)}</detail>` : ''}</equipment>`).join('')}</equipments>`
        : '';
    const relationshipsXml = roleNode.relationships.length > 0
        ? `<relationships>${roleNode.relationships.map((item: RoleRelationshipFact): string => `<relationship><target>${escapeXml(normalizeText(item.targetLabel) || normalizeText(item.targetActorKey) || 'unknown')}</target><label>${escapeXml(normalizeText(item.label) || 'relation')}</label>${normalizeText(item.detail) ? `<detail>${escapeXml(item.detail)}</detail>` : ''}</relationship>`).join('')}</relationships>`
        : '';
    const memoriesXml = roleNode.memories.length > 0
        ? `<memories>${roleNode.memories.map((item: RoleMemoryEntry): string => `<memory><type>${escapeXml(item.type)}</type><subtype>${escapeXml(item.subtype)}</subtype><summary>${escapeXml(item.summary)}</summary><source>${escapeXml(item.source)}</source><reason>${escapeXml(item.reason)}</reason></memory>`).join('')}</memories>`
        : '';
    return `<${toActorTagName(roleNode.actorKey)}>${profileXml}${itemsXml}${equipmentsXml}${relationshipsXml}${memoriesXml}</${toActorTagName(roleNode.actorKey)}>`;
}

function renderMemoryOsContextXml(worldInfo: WorldInfoNode, roles: RoleXmlNode[]): string {
    const rolesXml = roles.length > 0 ? `<roles>${roles.map(renderRoleXml).join('')}</roles>` : '<roles></roles>';
    return ['[Memory Context]', '<memoryos_context>', renderWorldInfoXml(worldInfo), rolesXml, '</memoryos_context>'].join('\n');
}

function trimByBudget(input: {
    worldInfo: WorldInfoNode;
    roleNodes: RoleXmlNode[];
    maxTokens: number;
}): { worldInfo: WorldInfoNode; roleNodes: RoleXmlNode[] } {
    const worldInfo: WorldInfoNode = {
        summary: [...input.worldInfo.summary],
        rules: [...input.worldInfo.rules],
        states: [...input.worldInfo.states],
        recentScene: [...input.worldInfo.recentScene],
    };
    const roleNodes: RoleXmlNode[] = input.roleNodes.map((roleNode: RoleXmlNode): RoleXmlNode => ({
        ...roleNode,
        identityFacts: [...roleNode.identityFacts],
        originFacts: [...roleNode.originFacts],
        items: [...roleNode.items],
        equipments: [...roleNode.equipments],
        relationships: [...roleNode.relationships],
        memories: [...roleNode.memories],
    }));
    const render = (): string => renderMemoryOsContextXml(worldInfo, roleNodes);

    while (countTokens(render()) > input.maxTokens) {
        const secondaryRole = roleNodes.find((node: RoleXmlNode): boolean => !node.isPrimary && node.memories.length > 0);
        if (secondaryRole) {
            secondaryRole.memories.pop();
            continue;
        }
        const secondaryRelationshipRole = roleNodes.find((node: RoleXmlNode): boolean => !node.isPrimary && node.relationships.length > 0);
        if (secondaryRelationshipRole) {
            secondaryRelationshipRole.relationships.pop();
            continue;
        }
        let removableSecondaryIndex = -1;
        for (let index = roleNodes.length - 1; index >= 0; index -= 1) {
            if (!roleNodes[index].isPrimary) {
                removableSecondaryIndex = index;
                break;
            }
        }
        if (removableSecondaryIndex >= 0) {
            roleNodes.splice(removableSecondaryIndex, 1);
            continue;
        }
        const primaryRole = roleNodes.find((node: RoleXmlNode): boolean => node.isPrimary);
        if (primaryRole && primaryRole.items.length > 0) {
            primaryRole.items.pop();
            continue;
        }
        if (primaryRole && primaryRole.equipments.length > 0) {
            primaryRole.equipments.pop();
            continue;
        }
        if (primaryRole && primaryRole.memories.length > 0) {
            primaryRole.memories.pop();
            continue;
        }
        if (worldInfo.states.length > 0) {
            worldInfo.states.pop();
            continue;
        }
        if (worldInfo.rules.length > 0) {
            worldInfo.rules.pop();
            continue;
        }
        if (worldInfo.recentScene.length > 0) {
            worldInfo.recentScene.pop();
            continue;
        }
        break;
    }

    return { worldInfo, roleNodes };
}

/**
 * 功能：按 MemoryOS 结构化协议渲染记忆上下文。
 * @param input 渲染输入。
 * @returns 渲染结果文本与块使用信息。
 */
export function buildLayeredMemoryContext(input: {
    candidates: RecallCandidate[];
    plan: RecallPlan;
    roleProfiles?: Record<string, RoleProfile>;
    relationships?: RelationshipState[];
}): {
    text: string;
    blocksUsed: MemoryContextBlockUsage[];
} {
    const selectedCandidates = input.candidates.filter((candidate: RecallCandidate): boolean => candidate.selected);
    if (selectedCandidates.length <= 0) {
        return { text: '', blocksUsed: [] };
    }
    const globalCandidates = selectedCandidates
        .filter((candidate: RecallCandidate): boolean => candidate.visibilityPool === 'global')
        .sort((left: RecallCandidate, right: RecallCandidate): number => Number(right.finalScore ?? 0) - Number(left.finalScore ?? 0))
        .slice(0, 18);
    const worldInfoNode = classifyWorldInfo(globalCandidates);
    const roleNodes = buildRoleNodes({
        candidates: selectedCandidates,
        plan: input.plan,
        roleProfiles: input.roleProfiles ?? {},
        relationships: input.relationships ?? [],
    });
    const { worldInfo, roleNodes: trimmedRoles } = trimByBudget({
        worldInfo: worldInfoNode,
        roleNodes,
        maxTokens: Math.max(120, input.plan.maxTokens),
    });
    const text = renderMemoryOsContextXml(worldInfo, trimmedRoles);
    const primaryActorKey = trimmedRoles.find((node: RoleXmlNode): boolean => node.isPrimary)?.actorKey ?? null;
    const blocksUsed: MemoryContextBlockUsage[] = [];
    if (worldInfo.summary.length > 0 || worldInfo.rules.length > 0 || worldInfo.states.length > 0 || worldInfo.recentScene.length > 0) {
        blocksUsed.push({
            kind: 'memoryos_worldinfo',
            actorKey: null,
            candidateCount: globalCandidates.length,
            sectionHints: Array.from(new Set(globalCandidates.map((candidate: RecallCandidate): InjectionSectionName | null => candidate.sectionHint).filter(Boolean) as InjectionSectionName[])),
            reasonCodes: ['block:worldinfo_xml', `summary:${worldInfo.summary.length}`, `rules:${worldInfo.rules.length}`, `states:${worldInfo.states.length}`],
        });
    }
    if (trimmedRoles.length > 0) {
        const roleCandidates = selectedCandidates.filter((candidate: RecallCandidate): boolean => {
            const owner = normalizeActorKey(candidate.ownerActorKey);
            return owner ? trimmedRoles.some((role: RoleXmlNode): boolean => role.actorKey === owner) : candidate.visibilityPool === 'actor';
        });
        blocksUsed.push({
            kind: 'memoryos_roles',
            actorKey: primaryActorKey,
            candidateCount: roleCandidates.length,
            sectionHints: Array.from(new Set(roleCandidates.map((candidate: RecallCandidate): InjectionSectionName | null => candidate.sectionHint).filter(Boolean) as InjectionSectionName[])),
            reasonCodes: ['block:roles_xml', `role_count:${trimmedRoles.length}`],
        });
    }

    return {
        text,
        blocksUsed,
    };
}
