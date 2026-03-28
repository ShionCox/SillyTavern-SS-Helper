import type {
    ColdStartActorCard,
    ColdStartCandidate,
    ColdStartDocument,
    ColdStartMemoryRecord,
    ColdStartMemoryType,
    ColdStartRelationshipEntry,
    ColdStartSourceBundle,
    ColdStartSourceRef,
    ColdStartWorldBaseEntry,
} from './bootstrap-types';

/**
 * 功能：从冷启动文档构建候选项列表，并执行基础校验与去重。
 * @param document 冷启动文档。
 * @param sourceBundle 冷启动源数据包。
 * @returns 归一化后的候选项列表。
 */
export function buildColdStartCandidates(
    document: ColdStartDocument,
    sourceBundle: ColdStartSourceBundle,
): ColdStartCandidate[] {
    const candidates: ColdStartCandidate[] = [];
    candidates.push(buildActorProfileCandidate(document.identity, true, sourceBundle));
    for (const actorCard of document.actorCards) {
        candidates.push(buildActorProfileCandidate(actorCard, false, sourceBundle));
    }
    for (const worldBase of document.worldBase) {
        candidates.push(buildWorldBaseCandidate(worldBase, sourceBundle));
    }
    for (const relationship of document.relationships) {
        candidates.push(buildRelationshipCandidate(relationship, sourceBundle));
    }
    for (const memoryRecord of document.memoryRecords) {
        candidates.push(buildMemoryRecordCandidate(memoryRecord, sourceBundle));
    }
    return dedupeColdStartCandidates(candidates)
        .filter(isValidColdStartCandidate)
        .filter((candidate: ColdStartCandidate): boolean => !shouldRejectColdStartCandidate(candidate));
}

/**
 * 功能：构建角色画像候选。
 * @param actorCard 角色卡。
 * @param isIdentity 是否为主角色。
 * @param sourceBundle 冷启动源数据包。
 * @returns 候选项。
 */
function buildActorProfileCandidate(
    actorCard: ColdStartDocument['identity'] | ColdStartActorCard,
    isIdentity: boolean,
    sourceBundle: ColdStartSourceBundle,
): ColdStartCandidate {
    const actorKey = String(actorCard.actorKey ?? '').trim();
    const displayName = String(actorCard.displayName ?? actorKey).trim() || actorKey;
    const summary = dedupeStrings([
        ...actorCard.identityFacts,
        ...actorCard.originFacts,
        ...actorCard.traits,
    ]).join('；') || `${displayName}的基础角色信息。`;
    return {
        id: `cold_start_candidate:${actorKey}:profile`,
        type: 'character_profile',
        entryType: 'actor_profile',
        title: displayName,
        summary,
        entityKeys: [actorKey],
        confidence: isIdentity ? 0.96 : 0.9,
        sourceRefs: buildSourceRefs(sourceBundle, isIdentity ? 'character_card' : 'summary', displayName),
        status: 'candidate',
        reason: isIdentity ? '主角色的稳定身份信息适合作为冷启动基础记忆。' : '关系中出现的角色卡信息可作为长期稳定人物档案。',
        detailPayload: {
            actorKey,
            fields: {
                aliases: dedupeStrings(actorCard.aliases),
                identityFacts: dedupeStrings(actorCard.identityFacts),
                originFacts: dedupeStrings(actorCard.originFacts),
                traits: dedupeStrings(actorCard.traits),
            },
        },
        tags: ['cold_start', 'actor_profile'],
        actorBindings: [actorKey],
    };
}

/**
 * 功能：构建世界基础候选。
 * @param worldBase 世界基础条目。
 * @param sourceBundle 冷启动源数据包。
 * @returns 候选项。
 */
function buildWorldBaseCandidate(
    worldBase: ColdStartWorldBaseEntry,
    sourceBundle: ColdStartSourceBundle,
): ColdStartCandidate {
    const type: ColdStartMemoryType = worldBase.schemaId === 'world_global_state' ? 'initial_state' : 'world_rule';
    return {
        id: `cold_start_candidate:${worldBase.schemaId}:${worldBase.title}`,
        type,
        entryType: worldBase.schemaId,
        title: worldBase.title,
        summary: worldBase.summary,
        entityKeys: [worldBase.title],
        confidence: worldBase.schemaId === 'world_hard_rule' ? 0.94 : 0.86,
        sourceRefs: buildSourceRefs(sourceBundle, 'lorebook', `${worldBase.title} ${worldBase.summary}`),
        status: 'candidate',
        reason: type === 'world_rule' ? '稳定世界法则和核心设定适合进入长期记忆。' : '开局世界状态可作为初始状态写入，并允许后续失效或替换。',
        detailPayload: {
            scope: worldBase.scope,
            state: worldBase.schemaId === 'world_global_state' ? 'active' : undefined,
        },
        tags: ['cold_start', 'world_base'],
    };
}

/**
 * 功能：构建关系候选。
 * @param relationship 关系条目。
 * @param sourceBundle 冷启动源数据包。
 * @returns 候选项。
 */
function buildRelationshipCandidate(
    relationship: ColdStartRelationshipEntry,
    sourceBundle: ColdStartSourceBundle,
): ColdStartCandidate {
    return {
        id: `cold_start_candidate:relationship:${relationship.sourceActorKey}:${relationship.targetActorKey}`,
        type: 'relationship',
        entryType: 'relationship',
        title: `${relationship.sourceActorKey} -> ${relationship.targetActorKey}`,
        summary: relationship.summary,
        entityKeys: dedupeStrings([relationship.sourceActorKey, relationship.targetActorKey, ...relationship.participants]),
        confidence: 0.9,
        sourceRefs: buildSourceRefs(sourceBundle, 'character_card', relationship.summary),
        status: 'candidate',
        reason: '明确且稳定的人际关系适合作为长期关系记忆建立。',
        detailPayload: {
            sourceActorKey: relationship.sourceActorKey,
            targetActorKey: relationship.targetActorKey,
            participants: dedupeStrings(relationship.participants),
            state: relationship.state,
            trust: relationship.trust,
            affection: relationship.affection,
            tension: relationship.tension,
            fields: {
                relationTag: relationship.relationTag,
            },
        },
        tags: ['cold_start', 'relationship'],
        actorBindings: dedupeStrings([relationship.sourceActorKey, relationship.targetActorKey, ...relationship.participants]),
    };
}

/**
 * 功能：构建通用记忆候选。
 * @param memoryRecord 记忆条目。
 * @param sourceBundle 冷启动源数据包。
 * @returns 候选项。
 */
function buildMemoryRecordCandidate(
    memoryRecord: ColdStartMemoryRecord,
    sourceBundle: ColdStartSourceBundle,
): ColdStartCandidate {
    const type = inferColdStartMemoryType(memoryRecord.schemaId, memoryRecord.title, memoryRecord.summary);
    const matchedSourceType = inferCandidateSourceType(type, memoryRecord.schemaId);
    return {
        id: `cold_start_candidate:${memoryRecord.schemaId}:${memoryRecord.title}`,
        type,
        entryType: memoryRecord.schemaId,
        title: memoryRecord.title,
        summary: memoryRecord.summary,
        entityKeys: extractEntityKeys(memoryRecord.title, memoryRecord.summary),
        confidence: clamp01(Number(memoryRecord.importance ?? 0.78) || 0.78),
        sourceRefs: buildSourceRefs(sourceBundle, matchedSourceType, `${memoryRecord.title} ${memoryRecord.summary}`),
        status: 'candidate',
        reason: buildCandidateReason(type),
        detailPayload: {
            importance: memoryRecord.importance,
        },
        tags: ['cold_start', type],
    };
}

/**
 * 功能：校验候选是否合法。
 * @param candidate 候选项。
 * @returns 是否合法。
 */
function isValidColdStartCandidate(candidate: ColdStartCandidate): boolean {
    if (!candidate.title || !candidate.summary) {
        return false;
    }
    if (candidate.confidence < 0 || candidate.confidence > 1) {
        return false;
    }
    if (!Array.isArray(candidate.sourceRefs) || candidate.sourceRefs.length <= 0) {
        return false;
    }
    if (!Array.isArray(candidate.entityKeys) || candidate.entityKeys.length <= 0) {
        return false;
    }
    if (candidate.summary.length < 4) {
        return false;
    }
    return true;
}

/**
 * 功能：判断候选是否应在冷启动阶段被拦截。
 * @param candidate 候选项。
 * @returns 是否应拦截。
 */
function shouldRejectColdStartCandidate(candidate: ColdStartCandidate): boolean {
    const normalizedTitle = normalizeText(candidate.title);
    const normalizedSummary = normalizeText(candidate.summary);
    const normalizedText = `${normalizedTitle} ${normalizedSummary}`;
    if (candidate.type === 'initial_state' && /语气|文风|风格|氛围感|旁白感|修辞|描述性文字/u.test(normalizedText)) {
        return true;
    }
    if (candidate.type !== 'world_rule' && /(作者注释|作者备注|控制提示|越狱|jailbreak|system prompt|prompt)/u.test(normalizedText)) {
        return true;
    }
    if (/(可能|也许|似乎|仿佛|大概|好像|疑似)/u.test(normalizedSummary) && candidate.confidence < 0.82) {
        return true;
    }
    if (candidate.entityKeys.length <= 1 && candidate.summary.length < 10) {
        return true;
    }
    if (candidate.type === 'timeline_fact' && !/(首次|第一次|那天|后来|起初|开局|初始|当时)/u.test(normalizedText)) {
        return true;
    }
    return false;
}

/**
 * 功能：对候选项做近似去重。
 * @param candidates 候选列表。
 * @returns 去重结果。
 */
function dedupeColdStartCandidates(candidates: ColdStartCandidate[]): ColdStartCandidate[] {
    const result: ColdStartCandidate[] = [];
    const seen = new Map<string, number>();
    for (const candidate of candidates) {
        const key = [
            candidate.type,
            candidate.entryType,
            dedupeStrings(candidate.entityKeys).sort().join('|'),
            normalizeText(candidate.title),
        ].join('::');
        const existingIndex = seen.get(key);
        if (existingIndex === undefined) {
            seen.set(key, result.length);
            result.push(candidate);
            continue;
        }
        const existing = result[existingIndex];
        if (candidate.confidence > existing.confidence) {
            result[existingIndex] = {
                ...candidate,
                sourceRefs: mergeSourceRefs(existing.sourceRefs, candidate.sourceRefs),
            };
            continue;
        }
        existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, candidate.sourceRefs);
    }
    return result;
}

/**
 * 功能：推断冷启动候选类型。
 * @param schemaId 条目 schema。
 * @param title 标题。
 * @param summary 摘要。
 * @returns 记忆类型。
 */
function inferColdStartMemoryType(schemaId: string, title: string, summary: string): ColdStartMemoryType {
    const normalizedSchemaId = normalizeText(schemaId);
    const normalizedText = `${normalizeText(title)} ${normalizeText(summary)}`;
    if (normalizedSchemaId === 'relationship') return 'relationship';
    if (normalizedSchemaId === 'actor_profile') return 'character_profile';
    if (normalizedSchemaId === 'task') return 'persistent_goal';
    if (normalizedSchemaId === 'location' || normalizedSchemaId === 'scene_shared_state') return 'location_fact';
    if (normalizedSchemaId.startsWith('world_')) return normalizedSchemaId === 'world_global_state' ? 'initial_state' : 'world_rule';
    if (/不能|禁止|不可|保密|禁忌|边界|不得公开|身份秘密/u.test(normalizedText)) return 'identity_constraint';
    if (/喜欢|讨厌|偏好|习惯/u.test(normalizedText)) return 'preference';
    if (/目标|计划|任务|追查|寻找|调查|待办|约定/u.test(normalizedText)) return 'persistent_goal';
    if (/地点|房间|位置|客厅|设施|据点|场景/u.test(normalizedText)) return 'location_fact';
    if (/当时|后来|首次|第一次|那天|开局|起初|初始/u.test(normalizedText)) return 'timeline_fact';
    return 'initial_state';
}

/**
 * 功能：根据候选类型推断最合适的来源类型。
 * @param type 候选类型。
 * @param schemaId 条目 schema。
 * @returns 来源类型。
 */
function inferCandidateSourceType(
    type: ColdStartMemoryType,
    schemaId: string,
): ColdStartSourceRef['sourceType'] {
    if (type === 'character_profile' || type === 'relationship') {
        return 'character_card';
    }
    if (type === 'world_rule' || type === 'initial_state' || String(schemaId).startsWith('world_')) {
        return 'lorebook';
    }
    return 'summary';
}

/**
 * 功能：构建候选理由。
 * @param type 候选类型。
 * @returns 中文理由。
 */
function buildCandidateReason(type: ColdStartMemoryType): string {
    if (type === 'preference') return '稳定偏好可作为长期行为参考。';
    if (type === 'persistent_goal') return '该内容具备跨回合持续性，适合形成长期目标记忆。';
    if (type === 'identity_constraint') return '身份边界或禁忌适合作为长期约束记录。';
    if (type === 'location_fact') return '地点与场景事实可作为开局环境底座。';
    if (type === 'timeline_fact') return '关键开局事件适合作为时间线事实记录。';
    if (type === 'initial_state') return '该内容更适合作为可变的初始状态保留。';
    return '该内容具备稳定性和可追溯性，适合作为冷启动候选记忆。';
}

/**
 * 功能：构建候选来源引用。
 * @param sourceBundle 冷启动源数据包。
 * @param sourceType 来源类型。
 * @param excerpt 引用摘要。
 * @returns 来源引用列表。
 */
function buildSourceRefs(
    sourceBundle: ColdStartSourceBundle,
    sourceType: ColdStartSourceRef['sourceType'],
    excerpt: string,
): ColdStartSourceRef[] {
    if (sourceType === 'lorebook') {
        const entries = rankWorldbookEntriesByExcerpt(sourceBundle, excerpt).slice(0, 3);
        if (entries.length > 0) {
            return entries.map((entry) => ({
                sourceType,
                sourceId: `${entry.book}:${entry.entryId}`,
                excerpt: truncateText(entry.content || excerpt, 80),
            }));
        }
    }
    if (sourceType === 'character_card') {
        return [
            {
                sourceType,
                sourceId: sourceBundle.characterCard.name || 'character_card',
                excerpt: truncateText(sourceBundle.characterCard.description || excerpt, 80),
            },
        ];
    }
    return [
        {
            sourceType,
            sourceId: sourceBundle.reason || 'cold_start',
            excerpt: truncateText(resolveSummarySourceExcerpt(sourceBundle, excerpt), 80),
        },
    ];
}

/**
 * 功能：按匹配度为世界书条目排序，优先返回真正相关的来源。
 * @param sourceBundle 冷启动源数据包。
 * @param excerpt 候选摘要。
 * @returns 排序后的世界书条目。
 */
function rankWorldbookEntriesByExcerpt(
    sourceBundle: ColdStartSourceBundle,
    excerpt: string,
): ColdStartSourceBundle['worldbooks']['entries'] {
    const normalizedExcerpt = normalizeText(excerpt);
    const excerptTokens = extractEntityKeys(excerpt, excerpt);
    return [...sourceBundle.worldbooks.entries].sort((left, right): number => {
        const leftScore = scoreWorldbookEntry(left, normalizedExcerpt, excerptTokens);
        const rightScore = scoreWorldbookEntry(right, normalizedExcerpt, excerptTokens);
        return rightScore - leftScore;
    });
}

/**
 * 功能：计算世界书条目与候选摘要的匹配分。
 * @param entry 世界书条目。
 * @param normalizedExcerpt 已归一化的摘要。
 * @param excerptTokens 摘要关键词。
 * @returns 匹配分。
 */
function scoreWorldbookEntry(
    entry: ColdStartSourceBundle['worldbooks']['entries'][number],
    normalizedExcerpt: string,
    excerptTokens: string[],
): number {
    const haystack = normalizeText(`${entry.entry} ${entry.content} ${(entry.keywords ?? []).join(' ')}`);
    let score = 0;
    for (const token of excerptTokens) {
        if (token && haystack.includes(normalizeText(token))) {
            score += 2;
        }
    }
    if (normalizedExcerpt && haystack.includes(normalizedExcerpt.slice(0, Math.min(12, normalizedExcerpt.length)))) {
        score += 3;
    }
    if (entry.book && sourceIncludesBookHint(normalizedExcerpt, entry.book)) {
        score += 1;
    }
    return score;
}

/**
 * 功能：判断摘要是否带有世界书名提示。
 * @param text 摘要文本。
 * @param book 世界书名称。
 * @returns 是否命中。
 */
function sourceIncludesBookHint(text: string, book: string): boolean {
    const normalizedBook = normalizeText(book);
    return Boolean(normalizedBook) && text.includes(normalizedBook);
}

/**
 * 功能：为 summary/manual_input 来源挑选更贴近原始输入的摘要。
 * @param sourceBundle 冷启动源数据包。
 * @param excerpt 当前候选摘要。
 * @returns 更合适的来源摘要。
 */
function resolveSummarySourceExcerpt(sourceBundle: ColdStartSourceBundle, excerpt: string): string {
    const fallbackTexts = [
        sourceBundle.characterCard.firstMessage,
        sourceBundle.characterCard.scenario,
        sourceBundle.semantic.firstMessage,
        sourceBundle.semantic.authorNote,
        sourceBundle.user.personaDescription,
        sourceBundle.user.metadataPersona,
        ...sourceBundle.recentEvents,
    ].filter(Boolean);
    const normalizedExcerpt = normalizeText(excerpt);
    for (const text of fallbackTexts) {
        const normalizedText = normalizeText(text);
        if (normalizedText && (
            normalizedText.includes(normalizedExcerpt.slice(0, Math.min(10, normalizedExcerpt.length)))
            || extractEntityKeys(text, excerpt).some((token: string): boolean => normalizedExcerpt.includes(normalizeText(token)))
        )) {
            return text;
        }
    }
    return excerpt;
}

/**
 * 功能：从标题和摘要中提取实体键。
 * @param title 标题。
 * @param summary 摘要。
 * @returns 实体键数组。
 */
function extractEntityKeys(title: string, summary: string): string[] {
    const tokens = `${title} ${summary}`
        .split(/[\s，。；：、,.!?！？]+/u)
        .map((item: string): string => item.trim())
        .filter((item: string): boolean => item.length >= 2)
        .filter((item: string): boolean => !isLowValueToken(item));
    return dedupeStrings(tokens).slice(0, 8);
}

/**
 * 功能：过滤不适合作为实体键的低价值词。
 * @param token 单个词项。
 * @returns 是否为低价值词。
 */
function isLowValueToken(token: string): boolean {
    return /^(这个|那个|这里|那里|当前|状态|内容|设定|信息|角色|人物|自己|对方|我们|他们)$/u.test(String(token ?? '').trim());
}

/**
 * 功能：裁剪文本长度。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 裁剪结果。
 */
function truncateText(value: string, maxLength: number): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

/**
 * 功能：合并来源引用并去重。
 * @param left 左侧引用。
 * @param right 右侧引用。
 * @returns 合并结果。
 */
function mergeSourceRefs(left: ColdStartSourceRef[], right: ColdStartSourceRef[]): ColdStartSourceRef[] {
    const result: ColdStartSourceRef[] = [];
    const seen = new Set<string>();
    for (const item of [...left, ...right]) {
        const key = `${item.sourceType}:${item.sourceId}:${item.excerpt ?? ''}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(item);
    }
    return result;
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}

/**
 * 功能：标准化文本。
 * @param value 原始值。
 * @returns 标准化文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim().toLowerCase();
}

/**
 * 功能：将置信度限制在 0~1。
 * @param value 原始值。
 * @returns 限制结果。
 */
function clamp01(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(1, Number(numeric.toFixed(4))));
}
