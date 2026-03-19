import type { DBFact, DBSummary } from '../db/db';
import type { MemoryCardDraft, MemoryCardLane, MemoryCardScope, MemoryCardTtl } from '../../../SDK/stx';

interface FactTextSegment {
    label: string;
    text: string;
}

/**
 * 功能：将任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 去除多余空白后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：把任意输入规整为字符串数组。
 * @param value 原始值。
 * @returns 过滤空值后的文本数组。
 */
function normalizeTextArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item: unknown): string => normalizeText(item)).filter(Boolean);
    }
    const text = normalizeText(value);
    return text ? [text] : [];
}

/**
 * 功能：为记忆卡层级推断默认生命周期。
 * @param lane 记忆卡层级。
 * @returns 对应的生命周期。
 */
function inferLaneTtl(lane: MemoryCardLane): MemoryCardTtl {
    if (lane === 'state') {
        return 'short';
    }
    if (lane === 'event' || lane === 'relationship') {
        return 'medium';
    }
    return 'long';
}

/**
 * 功能：将驼峰或下划线键名转成更适合展示的标签。
 * @param key 原始键名。
 * @returns 适合展示的标签文本。
 */
function formatSegmentLabel(key: string): string {
    const normalized = normalizeText(key);
    if (!normalized) {
        return '';
    }
    return normalized
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim();
}

/**
 * 功能：限制记忆正文长度，避免一张卡塞入过多主题。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 截断后的文本。
 */
function clampCardText(value: string, maxLength: number = 220): string {
    const normalized = normalizeText(value);
    if (!normalized || normalized.length <= maxLength) {
        return normalized;
    }
    const sentences = normalized.split(/(?<=[。！？；.!?;])/).map((item: string): string => normalizeText(item)).filter(Boolean);
    const picked: string[] = [];
    for (const sentence of sentences) {
        const next = picked.concat(sentence).join('');
        if (next.length > maxLength && picked.length > 0) {
            break;
        }
        if (next.length > maxLength) {
            return `${normalized.slice(0, Math.max(24, maxLength - 1))}…`;
        }
        picked.push(sentence);
    }
    const merged = picked.join('');
    if (merged.length >= Math.min(normalized.length, maxLength - 8)) {
        return merged;
    }
    return `${normalized.slice(0, Math.max(24, maxLength - 1))}…`;
}

/**
 * 功能：从复合值中递归提取适合展示与建卡的文本片段。
 * @param value 原始值。
 * @param prefix 当前路径前缀。
 * @param depth 当前递归深度。
 * @returns 平铺后的文本片段。
 */
function collectValueSegments(value: unknown, prefix: string = '', depth: number = 0): FactTextSegment[] {
    if (depth > 3 || value == null) {
        return [];
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        const text = normalizeText(value);
        if (!text) {
            return [];
        }
        return [{
            label: formatSegmentLabel(prefix) || '内容',
            text,
        }];
    }
    if (Array.isArray(value)) {
        const items = value
            .map((item: unknown): string => normalizeText(item))
            .filter(Boolean);
        if (items.length > 0 && items.every((item: string): boolean => item.length > 0)) {
            return [{
                label: formatSegmentLabel(prefix) || '内容',
                text: items.join('；'),
            }];
        }
        return value.flatMap((item: unknown, index: number): FactTextSegment[] => collectValueSegments(item, `${prefix}${prefix ? ' ' : ''}${index + 1}`, depth + 1));
    }
    if (typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).flatMap(([key, nextValue]: [string, unknown]): FactTextSegment[] => {
            const nextPrefix = prefix ? `${prefix}.${key}` : key;
            return collectValueSegments(nextValue, nextPrefix, depth + 1);
        });
    }
    return [];
}

/**
 * 功能：按关键词从片段中筛出更聚焦的一组文本。
 * @param segments 片段列表。
 * @param patterns 关键词模式。
 * @returns 命中的片段列表。
 */
function pickSegmentsByPatterns(segments: FactTextSegment[], patterns: RegExp[]): FactTextSegment[] {
    return segments.filter((segment: FactTextSegment): boolean => {
        const haystack = `${normalizeText(segment.label)} ${normalizeText(segment.text)}`;
        return patterns.some((pattern: RegExp): boolean => pattern.test(haystack));
    });
}

/**
 * 功能：去重并按顺序保留文本片段。
 * @param values 原始文本列表。
 * @returns 去重后的文本列表。
 */
function dedupeTexts(values: string[]): string[] {
    return Array.from(new Set(values.map((item: string): string => normalizeText(item)).filter(Boolean)));
}

/**
 * 功能：把多个片段压缩成一段适合记忆卡的自然语言。
 * @param subject 主体名称。
 * @param lead 引导语。
 * @param segments 片段列表。
 * @returns 适合写入记忆卡的正文。
 */
function composeNarrative(subject: string, lead: string, segments: string[]): string {
    const merged = dedupeTexts(segments);
    if (merged.length <= 0) {
        return '';
    }
    const prefix = normalizeText(subject) ? `${normalizeText(subject)}的${lead}` : lead;
    return clampCardText(`${prefix}：${merged.join('；')}`);
}

/**
 * 功能：根据事实记录推断记忆卡作用域。
 * @param fact 事实记录。
 * @returns 记忆卡作用域。
 */
function inferFactScope(fact: DBFact): MemoryCardScope {
    const typeText = normalizeText(fact.type).toLowerCase();
    const entityKind = normalizeText(fact.entity?.kind).toLowerCase();
    if (typeText.includes('world_state') || typeText.includes('world') || entityKind === 'world') {
        return 'world';
    }
    if (entityKind === 'character' || normalizeText(fact.ownerActorKey)) {
        return 'character';
    }
    return 'chat';
}

/**
 * 功能：从事实中推断主体名称。
 * @param fact 事实记录。
 * @param segments 已提取的片段。
 * @returns 主体名称。
 */
function inferFactSubject(fact: DBFact, segments: FactTextSegment[]): string {
    const record = (fact.value && typeof fact.value === 'object' ? fact.value as Record<string, unknown> : {}) as Record<string, unknown>;
    const candidates = [
        normalizeText(record.displayName),
        normalizeText(record.name),
        normalizeText(record.title),
        normalizeText(fact.entity?.id),
        normalizeText(fact.ownerActorKey),
        normalizeText(fact.path),
        normalizeText(fact.type),
    ];
    const matchedSegment = segments.find((segment: FactTextSegment): boolean => /display name|name|title|主体|角色/i.test(segment.label));
    if (matchedSegment) {
        candidates.unshift(normalizeText(matchedSegment.text));
    }
    return candidates.find(Boolean) || '未命名主体';
}

/**
 * 功能：构建记忆卡草稿。
 * @param fact 事实记录。
 * @param lane 记忆卡层级。
 * @param subject 主体名称。
 * @param title 卡片标题。
 * @param memoryText 记忆正文。
 * @param keywords 关键词列表。
 * @param evidenceText 证据文本。
 * @param replaceKey 覆盖键。
 * @param participantActorKeys 参与角色。
 * @returns 记忆卡草稿；若正文为空则返回 null。
 */
function createFactDraft(
    fact: DBFact,
    lane: MemoryCardLane,
    subject: string,
    title: string,
    memoryText: string,
    keywords: string[],
    evidenceText?: string | null,
    replaceKey?: string | null,
    participantActorKeys: string[] = [],
): MemoryCardDraft | null {
    const normalizedMemoryText = clampCardText(memoryText);
    if (!normalizedMemoryText) {
        return null;
    }
    const normalizedSubject = normalizeText(subject) || '未命名主体';
    const normalizedTitle = normalizeText(title) || normalizedSubject;
    return {
        scope: inferFactScope(fact),
        lane,
        subject: normalizedSubject,
        title: normalizedTitle,
        memoryText: normalizedMemoryText,
        evidenceText: normalizeText(evidenceText) || null,
        entityKeys: dedupeTexts([normalizeText(fact.entity?.id), normalizeText(fact.ownerActorKey)]),
        keywords: dedupeTexts([normalizedSubject, normalizedTitle, normalizeText(fact.type), normalizeText(fact.path), ...keywords]).slice(0, 12),
        importance: Math.max(0.6, Math.min(0.95, Number(fact.importance ?? fact.salience ?? fact.encodeScore ?? fact.confidence ?? 0.72) || 0.72)),
        confidence: Math.max(0.72, Math.min(0.98, Number(fact.confidence ?? fact.encodeScore ?? 0.8) || 0.8)),
        ttl: inferLaneTtl(lane),
        replaceKey: lane === 'state' ? (normalizeText(replaceKey) || `${normalizedSubject}:${lane}`) : (normalizeText(replaceKey) || null),
        sourceRefs: dedupeTexts([normalizeText(fact.factKey)]),
        sourceRecordKey: normalizeText(fact.factKey) || null,
        sourceRecordKind: 'fact',
        ownerActorKey: normalizeText(fact.ownerActorKey) || null,
        participantActorKeys: dedupeTexts(participantActorKeys),
        validFrom: Number(fact.updatedAt ?? 0) || undefined,
        validTo: undefined,
    };
}

/**
 * 功能：从 `semantic.identity/profile` 中抽取多张记忆卡。
 * @param fact 事实记录。
 * @param subject 主体名称。
 * @param segments 扁平文本片段。
 * @returns 记忆卡草稿数组。
 */
function buildIdentityProfileDrafts(fact: DBFact, subject: string, segments: FactTextSegment[]): MemoryCardDraft[] {
    const value = (fact.value && typeof fact.value === 'object' ? fact.value as Record<string, unknown> : {}) as Record<string, unknown>;
    const aliases = normalizeTextArray(value.aliases);
    const identityLines = dedupeTexts([
        ...normalizeTextArray(value.identity),
        normalizeText(value.roleSummary),
        normalizeText(value.displayName) ? `常用称呼：${normalizeText(value.displayName)}` : '',
        aliases.length > 0 ? `别名：${aliases.join('、')}` : '',
    ]);
    const styleSegments = pickSegmentsByPatterns(segments, [
        /性格|气质|外貌|体态|衣着|风格|习惯|语气|发|眼|眉|肤|穿/i,
        /temper|style|appearance|trait|manner|speech/i,
    ]);
    const relationLines = dedupeTexts([
        ...normalizeTextArray(value.relationshipAnchors),
        ...pickSegmentsByPatterns(segments, [/关系|羁绊|宠|爱|恨|敌|友|伴侣|配偶|占有|依赖/i]).map((segment: FactTextSegment): string => segment.text),
    ]);
    const drafts = [
        createFactDraft(
            fact,
            'identity',
            subject,
            `${subject}·身份`,
            composeNarrative(subject, '身份设定', identityLines),
            ['身份', '设定', ...aliases],
            identityLines.join('；'),
            `${subject}:identity`,
        ),
        createFactDraft(
            fact,
            'style',
            subject,
            `${subject}·风格`,
            composeNarrative(subject, '风格与气质', styleSegments.map((segment: FactTextSegment): string => segment.text)),
            ['风格', '气质', '性格'],
            styleSegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
        ),
        createFactDraft(
            fact,
            'relationship',
            subject,
            `${subject}·关系`,
            composeNarrative(subject, '重要关系锚点', relationLines),
            ['关系', '锚点'],
            relationLines.join('；'),
        ),
    ];
    return drafts.filter((item: MemoryCardDraft | null): item is MemoryCardDraft => item != null);
}

/**
 * 功能：从 `semantic.style/mode` 中抽取风格卡。
 * @param fact 事实记录。
 * @param subject 主体名称。
 * @param segments 扁平文本片段。
 * @returns 记忆卡草稿数组。
 */
function buildStyleModeDrafts(fact: DBFact, subject: string, segments: FactTextSegment[]): MemoryCardDraft[] {
    const value = (fact.value && typeof fact.value === 'object' ? fact.value as Record<string, unknown> : {}) as Record<string, unknown>;
    const styleLines = dedupeTexts([
        ...normalizeTextArray(value.mode),
        ...normalizeTextArray(value.cues),
        ...normalizeTextArray(value.aiStyleCues),
        normalizeText(value.presetStyle),
        ...segments.map((segment: FactTextSegment): string => segment.text),
    ]);
    const draft = createFactDraft(
        fact,
        'style',
        subject,
        `${subject}·风格`,
        composeNarrative(subject, '说话与表现风格', styleLines),
        ['风格', '语气', '模式'],
        styleLines.join('；'),
    );
    return draft ? [draft] : [];
}

/**
 * 功能：从关系类事实中抽取关系卡。
 * @param fact 事实记录。
 * @param subject 主体名称。
 * @param segments 扁平文本片段。
 * @returns 记忆卡草稿数组。
 */
function buildRelationshipDrafts(fact: DBFact, subject: string, segments: FactTextSegment[]): MemoryCardDraft[] {
    const participantActorKeys = dedupeTexts([
        normalizeText(fact.ownerActorKey),
        normalizeText(fact.entity?.id),
        ...segments
            .filter((segment: FactTextSegment): boolean => /target|对象|对方|角色|人物/i.test(segment.label))
            .map((segment: FactTextSegment): string => segment.text),
    ]);
    const relationLines = dedupeTexts(segments.map((segment: FactTextSegment): string => segment.text));
    const draft = createFactDraft(
        fact,
        'relationship',
        subject,
        `${subject}·关系`,
        composeNarrative(subject, '关系描述', relationLines),
        ['关系', '互动'],
        segments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
        null,
        participantActorKeys,
    );
    return draft ? [draft] : [];
}

/**
 * 功能：从世界状态类事实中抽取规则、状态或事件卡。
 * @param fact 事实记录。
 * @param subject 主体名称。
 * @param segments 扁平文本片段。
 * @returns 记忆卡草稿数组。
 */
function buildWorldStateDrafts(fact: DBFact, subject: string, segments: FactTextSegment[]): MemoryCardDraft[] {
    const typePath = `${normalizeText(fact.type)} ${normalizeText(fact.path)}`.toLowerCase();
    const ruleSegments = pickSegmentsByPatterns(segments, [/规则|限制|设定|准则|法律|约束|rule|constraint/i]);
    const stateSegments = pickSegmentsByPatterns(segments, [/当前|现在|处于|局势|状态|scene|status|current|ongoing/i]);
    const eventSegments = pickSegmentsByPatterns(segments, [/发生|经历|推进|结果|事件|历史|冲突|event|history|conflict/i]);
    const drafts: Array<MemoryCardDraft | null> = [];
    drafts.push(createFactDraft(
        fact,
        'rule',
        subject,
        `${subject}·规则`,
        composeNarrative(subject, '关键规则', (ruleSegments.length > 0 ? ruleSegments : (/rule|constraint|setting/.test(typePath) ? segments : [])).map((segment: FactTextSegment): string => segment.text)),
        ['规则', '设定'],
        ruleSegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
    ));
    drafts.push(createFactDraft(
        fact,
        'state',
        subject,
        `${subject}·状态`,
        composeNarrative(subject, '当前状态', (stateSegments.length > 0 ? stateSegments : (/state|status|scene|current/.test(typePath) ? segments : [])).map((segment: FactTextSegment): string => segment.text)),
        ['状态', '当前'],
        stateSegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
        `${subject}:${normalizeText(fact.path) || 'state'}`,
    ));
    drafts.push(createFactDraft(
        fact,
        'event',
        subject,
        `${subject}·事件`,
        composeNarrative(subject, '相关事件', (eventSegments.length > 0 ? eventSegments : (/event|history/.test(typePath) ? segments : [])).map((segment: FactTextSegment): string => segment.text)),
        ['事件', '变化'],
        eventSegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
    ));
    const filtered = drafts.filter((item: MemoryCardDraft | null): item is MemoryCardDraft => item != null);
    if (filtered.length > 0) {
        return filtered;
    }
    const fallback = createFactDraft(
        fact,
        /rule|constraint|setting/.test(typePath) ? 'rule' : /event|history/.test(typePath) ? 'event' : 'state',
        subject,
        `${subject}·世界信息`,
        composeNarrative(subject, '世界信息', segments.map((segment: FactTextSegment): string => segment.text)),
        ['世界', '设定'],
        segments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
        `${subject}:${normalizeText(fact.path) || 'world'}`,
    );
    return fallback ? [fallback] : [];
}

/**
 * 功能：为未知结构事实构建一到两张短卡。
 * @param fact 事实记录。
 * @param subject 主体名称。
 * @param segments 扁平文本片段。
 * @returns 记忆卡草稿数组。
 */
function buildGenericDrafts(fact: DBFact, subject: string, segments: FactTextSegment[]): MemoryCardDraft[] {
    const typePath = `${normalizeText(fact.type)} ${normalizeText(fact.path)}`.toLowerCase();
    const lane: MemoryCardLane = /relationship|bond|关系|羁绊/.test(typePath)
        ? 'relationship'
        : /rule|constraint|设定|规则/.test(typePath)
            ? 'rule'
            : /state|status|scene|当前|状态/.test(typePath)
                ? 'state'
                : /event|history|事件|经历|剧情/.test(typePath)
                    ? 'event'
                    : /style|trait|风格|性格|语气|外貌/.test(typePath)
                        ? 'style'
                        : /identity|profile|身份|设定|角色/.test(typePath)
                            ? 'identity'
                            : 'other';
    const primarySegments = segments.slice(0, 6);
    const drafts: Array<MemoryCardDraft | null> = [
        createFactDraft(
            fact,
            lane,
            subject,
            `${subject}·${lane}`,
            composeNarrative(subject, '记忆要点', primarySegments.map((segment: FactTextSegment): string => segment.text)),
            [normalizeText(fact.type), normalizeText(fact.path)],
            primarySegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
            lane === 'state' ? `${subject}:${normalizeText(fact.path) || lane}` : null,
        ),
    ];
    const secondarySegments = segments.slice(6, 12);
    if (secondarySegments.length > 0 && lane === 'other') {
        drafts.push(createFactDraft(
            fact,
            /状态|当前|现在/.test(secondarySegments.map((segment: FactTextSegment): string => segment.text).join(' '))
                ? 'state'
                : 'event',
            subject,
            `${subject}·补充记忆`,
            composeNarrative(subject, '补充信息', secondarySegments.map((segment: FactTextSegment): string => segment.text)),
            ['补充信息'],
            secondarySegments.map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`).join('；'),
        ));
    }
    return drafts.filter((item: MemoryCardDraft | null): item is MemoryCardDraft => item != null);
}

/**
 * 功能：格式化事实记录的展示文本。
 * @param fact 事实记录。
 * @returns 适合界面和调试展示的完整文本。
 */
export function formatFactMemoryTextForDisplay(fact: DBFact): string {
    const segments = collectValueSegments(fact.value);
    const subject = inferFactSubject(fact, segments);
    const header = [
        normalizeText(fact.type) ? `类型：${normalizeText(fact.type)}` : '',
        normalizeText(fact.path) ? `路径：${normalizeText(fact.path)}` : '',
        subject ? `主体：${subject}` : '',
    ].filter(Boolean);
    const body = dedupeTexts(segments.slice(0, 16).map((segment: FactTextSegment): string => `${segment.label}：${segment.text}`));
    return [...header, ...body].join('\n');
}

/**
 * 功能：将事实记录拆成多张适合长期记忆的卡片草稿。
 * @param fact 事实记录。
 * @returns 记忆卡草稿数组。
 */
export function buildMemoryCardDraftsFromFact(fact: DBFact): MemoryCardDraft[] {
    const segments = collectValueSegments(fact.value);
    const subject = inferFactSubject(fact, segments);
    const typePath = `${normalizeText(fact.type)} ${normalizeText(fact.path)}`.toLowerCase();
    if (typePath.includes('semantic.identity') && typePath.includes('profile')) {
        return buildIdentityProfileDrafts(fact, subject, segments);
    }
    if (typePath.includes('semantic.style') && typePath.includes('mode')) {
        return buildStyleModeDrafts(fact, subject, segments);
    }
    if (typePath.includes('semantic.relationship') || /relationship|relation|bond|羁绊|关系/.test(typePath)) {
        return buildRelationshipDrafts(fact, subject, segments);
    }
    if (typePath.includes('world_state') || typePath.includes('semantic.world_state')) {
        return buildWorldStateDrafts(fact, subject, segments);
    }
    return buildGenericDrafts(fact, subject, segments);
}

/**
 * 功能：格式化摘要的展示文本。
 * @param summary 摘要记录。
 * @returns 适合摘要区展示的文本。
 */
export function formatSummaryMemoryText(summary: DBSummary): string {
    const title = normalizeText(summary.title);
    const content = normalizeText(summary.content);
    if (title && content) {
        return `${title}：${content}`;
    }
    return title || content;
}
