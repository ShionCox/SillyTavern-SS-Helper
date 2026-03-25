import type { MemoryCardDraft, MemoryCardLane, MemoryCardScope, MemoryCardTtl } from '../../../SDK/stx';
import type { ChatSemanticSeed } from '../types';
import { inferStructuredSeedWorldStateEntries } from './world-state-seed';

type StructuredSeedWorldStateEntry = ReturnType<typeof inferStructuredSeedWorldStateEntries>[number];

export interface BuildSemanticSeedMemoryCardOptions {
    fingerprint?: string;
    reason?: string;
    maxEntityCards?: number;
    maxLocationCards?: number;
}

/**
 * 功能：将任意值规整为紧凑文本。
 * @param value 原始值。
 * @returns 归一化后的文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：把输入规整为去重文本数组。
 * @param values 任意输入列表。
 * @returns 去重后的文本数组。
 */
function uniqueTexts(...values: unknown[]): string[] {
    const flattened: string[] = [];
    values.forEach((value: unknown): void => {
        if (Array.isArray(value)) {
            value.forEach((item: unknown): void => {
                const text = normalizeText(item);
                if (text) {
                    flattened.push(text);
                }
            });
            return;
        }
        const text = normalizeText(value);
        if (text) {
            flattened.push(text);
        }
    });
    return Array.from(new Set(flattened));
}

/**
 * 功能：将文本转换为稳定 slug。
 * @param value 原始文本。
 * @returns 仅含小写字母数字和下划线的稳定键。
 */
function toSlug(value: string): string {
    const normalized = normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return normalized || 'item';
}

/**
 * 功能：按记忆层级推断默认生命周期。
 * @param lane 记忆层级。
 * @returns 对应生命周期。
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
 * 功能：构建语义种子草稿卡。
 * @param input 基础字段。
 * @returns 规范化后的草稿卡；正文不合法时返回 null。
 */
function createSeedDraft(input: {
    scope: MemoryCardScope;
    lane: MemoryCardLane;
    subject: string;
    title: string;
    memoryText: string;
    keywords?: string[];
    entityKeys?: string[];
    replaceKey?: string | null;
    confidence: number;
    importance: number;
    ownerActorKey?: string | null;
    sourceRefs?: string[];
}): MemoryCardDraft | null {
    const subject = normalizeText(input.subject) || '未命名主体';
    const title = normalizeText(input.title) || subject;
    const memoryText = normalizeText(input.memoryText);
    if (!memoryText || memoryText.length < 10) {
        return null;
    }
    return {
        scope: input.scope,
        lane: input.lane,
        subject,
        title,
        memoryText,
        evidenceText: null,
        entityKeys: uniqueTexts(input.entityKeys ?? []),
        keywords: uniqueTexts(subject, title, input.keywords ?? []).slice(0, 16),
        importance: Math.max(0, Math.min(1, Number(input.importance ?? 0) || 0)),
        confidence: Math.max(0, Math.min(1, Number(input.confidence ?? 0) || 0)),
        ttl: inferLaneTtl(input.lane),
        replaceKey: normalizeText(input.replaceKey) || null,
        sourceRefs: uniqueTexts(input.sourceRefs ?? []),
        sourceRecordKey: 'semantic_seed:active',
        sourceRecordKind: 'semantic_seed',
        ownerActorKey: normalizeText(input.ownerActorKey) || null,
        participantActorKeys: [],
        validFrom: Date.now(),
        validTo: undefined,
    };
}

/**
 * 功能：从结构化世界条目中提取可入库实体卡。
 * @param entries 结构化世界条目。
 * @param roleKey 角色键。
 * @param options 构建选项。
 * @returns 实体与地点草稿卡列表。
 */
function buildStructuredWorldDrafts(
    entries: StructuredSeedWorldStateEntry[],
    roleKey: string,
    options: BuildSemanticSeedMemoryCardOptions,
): MemoryCardDraft[] {
    const maxEntityCards = Math.max(0, Number(options.maxEntityCards ?? 4));
    const maxLocationCards = Math.max(0, Number(options.maxLocationCards ?? 3));
    const drafts: MemoryCardDraft[] = [];
    let entityCount = 0;
    let locationCount = 0;
    entries.forEach((entry: StructuredSeedWorldStateEntry): void => {
        const path = normalizeText(entry.path).toLowerCase();
        const value = (entry.value && typeof entry.value === 'object') ? entry.value as Record<string, unknown> : {};
        const title = normalizeText(value.title) || normalizeText(value.subjectId) || '';
        const summary = normalizeText(value.summary);
        if (!title || !summary) {
            return;
        }
        const isLocation = /\/semantic\/catalog\/(locations|cities)\//.test(path);
        const isEntity = /\/semantic\/catalog\/(organizations|nations|regions|entities)\//.test(path);
        if (!isLocation && !isEntity) {
            return;
        }
        if (isLocation && locationCount >= maxLocationCards) {
            return;
        }
        if (isEntity && entityCount >= maxEntityCards) {
            return;
        }
        const draft = createSeedDraft({
            scope: 'world',
            lane: 'state',
            subject: title,
            title: `${title}·概览`,
            memoryText: `${title} 在当前设定中的关键信息是：${summary}。`,
            keywords: [roleKey, normalizeText(value.scopeType), normalizeText(value.stateType), '冷启动', '语义种子'],
            entityKeys: [title],
            replaceKey: `seed:state:${toSlug(title)}`,
            confidence: 0.75,
            importance: 0.68,
        });
        if (!draft) {
            return;
        }
        drafts.push(draft);
        if (isLocation) {
            locationCount += 1;
        }
        if (isEntity) {
            entityCount += 1;
        }
    });
    return drafts;
}

/**
 * 功能：从语义种子提取冷启动记忆卡草稿。
 * @param seed 语义种子。
 * @param options 可选构建参数。
 * @returns 可直接写入记忆卡主线的草稿列表。
 */
export function buildMemoryCardDraftsFromSemanticSeed(
    seed: ChatSemanticSeed,
    options: BuildSemanticSeedMemoryCardOptions = {},
): MemoryCardDraft[] {
    const roleKey = normalizeText(seed.identitySeed?.roleKey);
    const subject = normalizeText(seed.identitySeed?.displayName) || roleKey || '角色';
    const sourceRefs = uniqueTexts(options.fingerprint ? `fingerprint:${options.fingerprint}` : '', options.reason ? `reason:${options.reason}` : '');
    const drafts: Array<MemoryCardDraft | null> = [];

    const identityLines = uniqueTexts(
        seed.identitySeed?.identity ?? [],
        seed.aiSummary?.identityFacts ?? [],
        seed.aiSummary?.roleSummary ?? '',
    ).slice(0, 5);
    if (identityLines.length > 0) {
        drafts.push(createSeedDraft({
            scope: 'character',
            lane: 'identity',
            subject,
            title: `${subject}·身份画像`,
            memoryText: `${subject} 的稳定身份特征是：${identityLines.join('；')}。`,
            keywords: [roleKey, ...(seed.identitySeed?.aliases ?? []), '身份', '角色', '冷启动'],
            entityKeys: [roleKey, subject],
            replaceKey: `seed:identity:${toSlug(roleKey || subject)}`,
            confidence: 0.9,
            importance: 0.85,
            ownerActorKey: roleKey || null,
            sourceRefs,
        }));
    }

    const styleLines = uniqueTexts(
        seed.styleSeed?.mode ?? '',
        seed.styleSeed?.cues ?? [],
        seed.aiSummary?.styleCues ?? [],
        seed.identitySeed?.catchphrases ?? [],
    ).slice(0, 6);
    if (styleLines.length > 0) {
        drafts.push(createSeedDraft({
            scope: 'character',
            lane: 'style',
            subject,
            title: `${subject}·表达风格`,
            memoryText: `${subject} 在表达和互动中的稳定风格是：${styleLines.join('；')}。`,
            keywords: [roleKey, '风格', '语气', '冷启动'],
            entityKeys: [roleKey, subject],
            replaceKey: `seed:style:${toSlug(roleKey || subject)}`,
            confidence: 0.88,
            importance: 0.82,
            ownerActorKey: roleKey || null,
            sourceRefs,
        }));
    }

    const relationLines = uniqueTexts(
        seed.identitySeed?.relationshipAnchors ?? [],
        seed.aiSummary?.relationshipAnchors ?? [],
        seed.aiSummary?.relationshipFacts ?? [],
    ).slice(0, 4);
    if (relationLines.length > 0) {
        drafts.push(createSeedDraft({
            scope: 'character',
            lane: 'relationship',
            subject,
            title: `${subject}·关系锚点`,
            memoryText: `${subject} 当前已知的重要关系锚点包括：${relationLines.join('；')}。`,
            keywords: [roleKey, '关系', '锚点', '冷启动'],
            entityKeys: [roleKey, subject],
            replaceKey: `seed:relationship:${toSlug(roleKey || subject)}`,
            confidence: 0.86,
            importance: 0.84,
            ownerActorKey: roleKey || null,
            sourceRefs,
        }));
    }

    const worldOverview = normalizeText(seed.aiSummary?.worldSummary);
    if (worldOverview) {
        drafts.push(createSeedDraft({
            scope: 'world',
            lane: 'state',
            subject: '世界',
            title: '世界概览',
            memoryText: `当前世界设定概览是：${worldOverview}。`,
            keywords: ['世界', '概览', roleKey, '冷启动'],
            entityKeys: ['world'],
            replaceKey: 'seed:state:world_overview',
            confidence: 0.8,
            importance: 0.8,
            sourceRefs,
        }));
    }

    const ruleLines = uniqueTexts(
        seed.worldSeed?.rules ?? [],
        seed.worldSeed?.hardConstraints ?? [],
        seed.aiSummary?.worldRules ?? [],
        seed.aiSummary?.hardConstraints ?? [],
    );
    ruleLines.slice(0, 12).forEach((line: string): void => {
        drafts.push(createSeedDraft({
            scope: 'world',
            lane: 'rule',
            subject: '世界',
            title: '世界规则',
            memoryText: `该设定中的硬规则是：${line}。`,
            keywords: ['世界', '规则', '约束', roleKey, '冷启动'],
            entityKeys: ['world'],
            replaceKey: `seed:rule:${toSlug(line)}`,
            confidence: 0.88,
            importance: 0.9,
            sourceRefs,
        }));
    });

    const structuredEntries = inferStructuredSeedWorldStateEntries(seed);
    drafts.push(...buildStructuredWorldDrafts(structuredEntries, roleKey, options));

    const lorebooks = uniqueTexts(seed.activeLorebooks ?? []);
    if (lorebooks.length > 0) {
        drafts.push(createSeedDraft({
            scope: 'chat',
            lane: 'state',
            subject: '当前会话',
            title: '会话世界书绑定',
            memoryText: `当前会话绑定的世界书包括：${lorebooks.slice(0, 8).join('、')}。`,
            keywords: ['会话', '世界书', roleKey, '冷启动'],
            entityKeys: ['session'],
            replaceKey: 'seed:state:session_lorebooks',
            confidence: 0.78,
            importance: 0.62,
            sourceRefs,
        }));
    }

    const groupMembers = uniqueTexts(seed.groupMembers ?? []);
    if (groupMembers.length > 0) {
        drafts.push(createSeedDraft({
            scope: 'chat',
            lane: 'state',
            subject: '当前会话',
            title: '会话成员绑定',
            memoryText: `当前会话关联成员包括：${groupMembers.slice(0, 8).join('、')}。`,
            keywords: ['会话', '成员', roleKey, '冷启动'],
            entityKeys: ['session'],
            replaceKey: 'seed:state:session_members',
            confidence: 0.78,
            importance: 0.62,
            sourceRefs,
        }));
    }

    return drafts.filter((draft: MemoryCardDraft | null): draft is MemoryCardDraft => draft != null);
}
