import type { WorldStateNodeValue, WorldStateScopeType, WorldStateType } from '../types';

export function normalizeWorldStateText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseWorldStatePathSegments(path: string): string[] {
    return normalizeWorldStateText(path)
        .split('/')
        .map((item: string): string => normalizeWorldStateText(item))
        .filter(Boolean);
}

function pickAnchorAfter(segments: string[], keys: string[]): string | undefined {
    const lowerKeys = keys.map((item: string): string => item.toLowerCase());
    const index = segments.findIndex((item: string): boolean => lowerKeys.includes(item.toLowerCase()));
    if (index < 0 || index >= segments.length - 1) {
        return undefined;
    }
    return normalizeWorldStateText(segments[index + 1]) || undefined;
}

export function inferWorldStateAnomalyFlags(path: string, rawObject: Record<string, unknown> | null, title: string, summary: string): string[] {
    const flags: string[] = [];
    const normalizedPath = normalizeWorldStateText(path).toLowerCase();
    const pathSegments = parseWorldStatePathSegments(normalizedPath);
    const inferredSubjectId = pickAnchorAfter(pathSegments, ['character', 'characters']);
    const inferredNationId = pickAnchorAfter(pathSegments, ['nation', 'nations', 'country', 'countries']);
    const inferredRegionId = pickAnchorAfter(pathSegments, ['region', 'regions']);
    const inferredCityId = pickAnchorAfter(pathSegments, ['city', 'cities']);
    const inferredLocationId = pickAnchorAfter(pathSegments, ['location', 'locations']);
    const inferredItemId = pickAnchorAfter(pathSegments, ['item', 'items']);
    const inferredFactionAnchor = Boolean(pickAnchorAfter(pathSegments, ['faction', 'factions']));
    const rawTitle = rawObject ? normalizeWorldStateText(rawObject.title) : title;
    const rawSummary = rawObject ? normalizeWorldStateText(rawObject.summary) : summary;
    if (!normalizedPath) {
        flags.push('missing_path');
    }
    if (!rawTitle) {
        flags.push('missing_title');
    }
    if (!rawSummary || rawSummary === '{}' || rawSummary === '[]') {
        flags.push('missing_summary');
    }
    if (rawObject) {
        const hasAnchor = Boolean(
            normalizeWorldStateText(rawObject.subjectId)
            || normalizeWorldStateText(rawObject.nationId ?? rawObject.countryId)
            || normalizeWorldStateText(rawObject.regionId)
            || normalizeWorldStateText(rawObject.cityId)
            || normalizeWorldStateText(rawObject.locationId)
            || normalizeWorldStateText(rawObject.itemId)
            || inferredSubjectId
            || inferredNationId
            || inferredRegionId
            || inferredCityId
            || inferredLocationId
            || inferredItemId
            || inferredFactionAnchor
        );
        if (!hasAnchor && !/^global\//.test(normalizedPath) && !/^scene\//.test(normalizedPath) && !/\/semantic\/world\//.test(normalizedPath)) {
            flags.push('missing_anchor');
        }
    }
    return flags;
}

export function inferWorldStateScopeType(path: string, text: string): WorldStateScopeType {
    const normalizedPath = normalizeWorldStateText(path).toLowerCase();
    const normalizedText = normalizeWorldStateText(text).toLowerCase();
    if (/^global\//.test(normalizedPath) || /global|world\//.test(normalizedPath)) return 'global';
    if (/^nation\//.test(normalizedPath) || /^country\//.test(normalizedPath) || /\/nations?\//.test(normalizedPath)) return 'nation';
    if (/^region\//.test(normalizedPath) || /\/regions?\//.test(normalizedPath)) return 'region';
    if (/^city\//.test(normalizedPath) || /\/cities\//.test(normalizedPath)) return 'city';
    if (/^location\//.test(normalizedPath) || /\/locations?\//.test(normalizedPath)) return 'location';
    if (/^faction\//.test(normalizedPath) || /\/factions?\//.test(normalizedPath)) return 'faction';
    if (/^item\//.test(normalizedPath) || /\/items?\//.test(normalizedPath)) return 'item';
    if (/^character\//.test(normalizedPath) || /\/characters\//.test(normalizedPath)) return 'character';
    if (/nation|country|kingdom|empire|republic|federation|realm|政体|国家|王国|帝国|共和国|联邦|王朝/.test(normalizedPath + ' ' + normalizedText)) return 'nation';
    if (/region|区域|地理|大陆|边境|北境|南境|西境|东境|州|郡|领/.test(normalizedPath + ' ' + normalizedText)) return 'region';
    if (/city|城市|都城|城邦|主城|镇|村|聚落|港口|港城|城镇/.test(normalizedPath + ' ' + normalizedText)) return 'city';
    if (/location|地点|场所|遗迹|据点|神殿|学院|基地|空间站|房间|森林|峡谷|湖泊/.test(normalizedPath + ' ' + normalizedText)) return 'location';
    if (/faction|派系|阵营|组织|公会|教团|军团|学派|议会|协会|结社/.test(normalizedPath + ' ' + normalizedText)) return 'faction';
    if (/item|物品|装备|道具|遗物/.test(normalizedPath + ' ' + normalizedText)) return 'item';
    if (/character|角色|人物|主角|同伴|npc/.test(normalizedPath + ' ' + normalizedText)) return 'character';
    if (/^scene\//.test(normalizedPath) || /scene|场景|现场/.test(normalizedPath + ' ' + normalizedText)) return 'scene';
    return 'unclassified';
}

export function inferWorldStateType(path: string, text: string): WorldStateType {
    const normalizedPath = normalizeWorldStateText(path).toLowerCase();
    const normalizedText = normalizeWorldStateText(text).toLowerCase();
    if (/\/goals\//.test(normalizedPath) || /goal|objective|intent|mission|目标|打算|意图|任务|计划|想要|必须/.test(normalizedPath + ' ' + normalizedText)) return 'goal';
    if (/\/relationships\//.test(normalizedPath) || /relationship|关系|羁绊|信任|敌对|亲密|牵连|盟友|导师|恋人/.test(normalizedPath + ' ' + normalizedText)) return 'relationship';
    if (/\/other\//.test(normalizedPath) || /其他设定|设定细节|世界细节|other world/.test(normalizedPath + ' ' + normalizedText)) return 'other';
    if (/rule|规则|law|法则|法律|法典|条例/.test(normalizedPath + ' ' + normalizedText)) return 'rule';
    if (/constraint|限制|禁忌|不能|不可|不得|禁止|绝不|唯一|固定/.test(normalizedPath + ' ' + normalizedText)) return 'constraint';
    if (/history|历史|往事|起源|旧日|战争|历史事件/.test(normalizedPath + ' ' + normalizedText)) return 'history';
    if (/capability|能力|技能|效果/.test(normalizedPath + ' ' + normalizedText)) return 'capability';
    if (/ownership|归属|拥有|持有/.test(normalizedPath + ' ' + normalizedText)) return 'ownership';
    if (/culture|文化|习俗|风俗|历法|纪年|祭典|节庆/.test(normalizedPath + ' ' + normalizedText)) return 'culture';
    if (/danger|危险|风险|威胁|灾难|危机/.test(normalizedPath + ' ' + normalizedText)) return 'danger';
    if (/hook|clue|关系钩子|线索/.test(normalizedPath + ' ' + normalizedText)) return 'relationship_hook';
    if (/异常|错位|invalid|malformed|unknown|缺失|待归类|冲突|anomaly|missing|unclassified/.test(normalizedPath + ' ' + normalizedText)) return 'anomaly';
    return 'status';
}

export function extractWorldStateKeywords(path: string, text: string, value: unknown): string[] {
    const source = `${normalizeWorldStateText(path)} ${normalizeWorldStateText(text)} ${typeof value === 'string' ? value : JSON.stringify(value ?? '')}`.toLowerCase();
    return Array.from(new Set(source.split(/[^a-z0-9\u4e00-\u9fa5]+/).map((item: string): string => item.trim()).filter((item: string): boolean => item.length >= 2))).slice(0, 16);
}

export function buildWorldStateNodeFromRaw(path: string, value: unknown, updatedAt: number): WorldStateNodeValue {
    const rawValue = value as Record<string, unknown> | string | number | boolean | null | undefined;
    const rawObject = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
        ? rawValue as Record<string, unknown>
        : null;
    const pathSegments = parseWorldStatePathSegments(path);
    const rawText = typeof rawValue === 'string'
        ? rawValue
        : rawObject
            ? JSON.stringify(rawObject)
            : String(rawValue ?? '');
    const scopeType = (rawObject?.scopeType as WorldStateScopeType | undefined) ?? inferWorldStateScopeType(path, rawText);
    const stateType = (rawObject?.stateType as WorldStateType | undefined) ?? inferWorldStateType(path, rawText);
    const keywords = Array.isArray(rawObject?.keywords)
        ? rawObject.keywords.map((item: unknown): string => normalizeWorldStateText(item)).filter(Boolean).slice(0, 16)
        : extractWorldStateKeywords(path, rawText, rawValue);
    const tags = Array.isArray(rawObject?.tags)
        ? rawObject.tags.map((item: unknown): string => normalizeWorldStateText(item)).filter(Boolean).slice(0, 16)
        : pathSegments.slice(0, 8);
    const title = normalizeWorldStateText(rawObject?.title) || pathSegments.slice(-1)[0] || '未命名状态';
    const summary = normalizeWorldStateText(rawObject?.summary)
        || (typeof rawValue === 'string' ? normalizeWorldStateText(rawValue) : normalizeWorldStateText(JSON.stringify(rawValue ?? '')))
        || '暂无说明';
    const anomalyFlags = inferWorldStateAnomalyFlags(path, rawObject, title, summary);
    const normalizedScopeType = anomalyFlags.includes('missing_path') ? 'unclassified' : scopeType;
    const normalizedStateType = anomalyFlags.length > 0 && stateType === 'status' ? 'anomaly' : stateType;

    return {
        title,
        summary,
        scopeType: normalizedScopeType,
        stateType: normalizedStateType,
        subjectId: normalizeWorldStateText(rawObject?.subjectId) || pickAnchorAfter(pathSegments, ['character', 'characters']) || undefined,
        nationId: normalizeWorldStateText(rawObject?.nationId ?? rawObject?.countryId) || pickAnchorAfter(pathSegments, ['nation', 'nations', 'country', 'countries']) || undefined,
        regionId: normalizeWorldStateText(rawObject?.regionId) || pickAnchorAfter(pathSegments, ['region', 'regions']) || undefined,
        cityId: normalizeWorldStateText(rawObject?.cityId) || pickAnchorAfter(pathSegments, ['city', 'cities']) || undefined,
        locationId: normalizeWorldStateText(rawObject?.locationId) || pickAnchorAfter(pathSegments, ['location', 'locations']) || undefined,
        itemId: normalizeWorldStateText(rawObject?.itemId) || pickAnchorAfter(pathSegments, ['item', 'items']) || undefined,
        anomalyFlags: anomalyFlags.length > 0 ? anomalyFlags : undefined,
        keywords,
        tags,
        confidence: Number(rawObject?.confidence ?? 0) || undefined,
        sourceRefs: Array.isArray(rawObject?.sourceRefs) ? rawObject.sourceRefs.map((item: unknown): string => normalizeWorldStateText(item)).filter(Boolean).slice(0, 24) : undefined,
        updatedAt: Math.max(0, Number(rawObject?.updatedAt ?? updatedAt ?? 0) || 0),
    };
}