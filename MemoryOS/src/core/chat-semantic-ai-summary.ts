import type { ChatSemanticSeed, SemanticAiSummary } from '../types/chat-state';
import { Logger } from '../../../SDK/logger';
import { runGeneration, MEMORY_TASKS, type TaskPresentationOverride } from '../llm/memoryLlmBridge';

const logger = new Logger('ColdStartAiSummary');

export interface EnhanceSemanticSeedWithAiOptions {
    force?: boolean;
    chatKey?: string;
    taskPresentation?: TaskPresentationOverride;
    taskDescription?: string;
}

type SemanticSeedAiSummary = Omit<SemanticAiSummary, 'generatedAt' | 'source'>;

const SEMANTIC_SEED_SUMMARY_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: [
        'roleSummary',
        'worldSummary',
        'identityFacts',
        'worldRules',
        'hardConstraints',
        'locations',
        'entities',
        'catchphrases',
        'relationshipAnchors',
        'styleCues',
    ],
    properties: {
        roleSummary: { type: 'string' },
        worldSummary: { type: 'string' },
        identityFacts: { type: 'array', items: { type: 'string' } },
        worldRules: { type: 'array', items: { type: 'string' } },
        hardConstraints: { type: 'array', items: { type: 'string' } },
        locations: { type: 'array', items: { type: 'string' } },
        entities: { type: 'array', items: { type: 'string' } },
        catchphrases: { type: 'array', items: { type: 'string' } },
        relationshipAnchors: { type: 'array', items: { type: 'string' } },
        styleCues: { type: 'array', items: { type: 'string' } },
    },
};

type AltSummaryEntry = {
    type?: unknown;
    items?: unknown;
};

function normalizeSnippetText(value: unknown): string {
    return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function uniqueSnippetTexts(limit: number, values: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    for (const value of values) {
        const normalized = normalizeSnippetText(value);
        if (!normalized || seen.has(normalized)) {
            continue;
        }
        seen.add(normalized);
        result.push(normalized);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

function toStringArray(value: unknown, limit: number = 16): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return uniqueTexts(limit, value as unknown[]);
}

function pickText(...values: unknown[]): string {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized.length > 0) {
            return normalized;
        }
    }
    return '';
}

function normalizeSemanticSeedAiSummary(value: unknown): SemanticSeedAiSummary | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    const direct = value as Record<string, unknown>;
    const directRoleSummary = normalizeText(direct.roleSummary);
    const directWorldSummary = normalizeText(direct.worldSummary);
    if (directRoleSummary || directWorldSummary || Array.isArray(direct.identityFacts) || Array.isArray(direct.worldRules)) {
        return {
            roleSummary: directRoleSummary,
            worldSummary: directWorldSummary,
            identityFacts: toStringArray(direct.identityFacts, 12),
            worldRules: toStringArray(direct.worldRules, 16),
            hardConstraints: toStringArray(direct.hardConstraints, 12),
            locations: toStringArray(direct.locations, 12),
            entities: toStringArray(direct.entities, 12),
            catchphrases: toStringArray(direct.catchphrases, 8),
            relationshipAnchors: toStringArray(direct.relationshipAnchors, 8),
            styleCues: toStringArray(direct.styleCues, 10),
        };
    }

    const characterSummary = ((direct.character_summary ?? direct.characterSummary) || null) as Record<string, unknown> | null;
    const worldSummary = ((direct.world_summary ?? direct.worldSummary) || null) as Record<string, unknown> | null;
    const seedEntries = Array.isArray(direct.seed_key_entries ?? direct.seedKeyEntries)
        ? ((direct.seed_key_entries ?? direct.seedKeyEntries) as AltSummaryEntry[])
        : [];

    if (!characterSummary && !worldSummary && seedEntries.length === 0) {
        return null;
    }

    const roleSummaryParts = [
        pickText(characterSummary?.role_identity, characterSummary?.roleIdentity),
        pickText(characterSummary?.personality),
        pickText(characterSummary?.background),
    ].filter((item: string): boolean => item.length > 0);

    const worldSummaryParts = [
        pickText(worldSummary?.core_concept, worldSummary?.coreConcept),
        pickText(worldSummary?.main_conflict, worldSummary?.mainConflict),
        pickText(worldSummary?.rules_notes, worldSummary?.rulesNotes),
    ].filter((item: string): boolean => item.length > 0);

    const seedTexts = seedEntries.flatMap((entry: AltSummaryEntry): string[] => {
        const title = normalizeText(entry?.type);
        const items = toStringArray(entry?.items, 8);
        if (!title) {
            return items;
        }
        return items.map((item: string): string => `${title}：${item}`);
    });

    const relationshipAnchors = Array.isArray(characterSummary?.relationships)
        ? uniqueTexts(
            8,
            (characterSummary.relationships as unknown[]).map((item: unknown): string => {
                if (!item || typeof item !== 'object') {
                    return normalizeText(item);
                }
                const record = item as Record<string, unknown>;
                return pickText(record.name, record.target, record.relation, record.description);
            }),
        )
        : [];

    return {
        roleSummary: roleSummaryParts.join('；'),
        worldSummary: worldSummaryParts.join('；'),
        identityFacts: uniqueTexts(12, seedTexts, toStringArray(characterSummary?.aliases, 6)),
        worldRules: uniqueTexts(16, seedTexts, toStringArray(worldSummary?.factions, 8)),
        hardConstraints: uniqueTexts(12, seedTexts),
        locations: uniqueTexts(12, toStringArray(worldSummary?.key_locations ?? worldSummary?.keyLocations, 8)),
        entities: uniqueTexts(12, toStringArray(worldSummary?.factions, 8)),
        catchphrases: [],
        relationshipAnchors,
        styleCues: uniqueTexts(10, [pickText(worldSummary?.tone_style, worldSummary?.toneStyle)]),
    };
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
    const lorebookSnippets = uniqueSnippetTexts(
        18,
        seed.lorebookSeed.flatMap((item) => item.snippets.map((snippet: string): string => `${item.book}：${snippet}`)),
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
        lorebookSnippets.length > 0
            ? `世界书条目摘录：\n${lorebookSnippets.join('\n\n')}`
            : '世界书条目摘录：无',
        `现有风格线索：${uniqueTexts(10, seed.styleSeed.cues).join('；') || '无'}`,
    ].join('\n');
}

function mergeAiSummary(seed: ChatSemanticSeed, summary: SemanticSeedAiSummary): ChatSemanticSeed {
    const roleSummary = normalizeText(summary.roleSummary);
    const worldSummary = normalizeText(summary.worldSummary);
    const aiSummary = {
        roleSummary,
        worldSummary,
        identityFacts: uniqueTexts(12, summary.identityFacts),
        worldRules: uniqueTexts(16, summary.worldRules),
        hardConstraints: uniqueTexts(12, summary.hardConstraints),
        locations: uniqueTexts(12, summary.locations),
        entities: uniqueTexts(12, summary.entities),
        catchphrases: uniqueTexts(8, summary.catchphrases),
        relationshipAnchors: uniqueTexts(8, summary.relationshipAnchors),
        styleCues: uniqueTexts(10, summary.styleCues),
        generatedAt: Date.now(),
        source: 'ai' as const,
    };

    return {
        ...seed,
        aiSummary,
        identitySeed: {
            ...seed.identitySeed,
            identity: uniqueTexts(16, roleSummary ? [roleSummary] : [], aiSummary.identityFacts, seed.identitySeed.identity),
            catchphrases: uniqueTexts(8, aiSummary.catchphrases, seed.identitySeed.catchphrases),
            relationshipAnchors: uniqueTexts(8, aiSummary.relationshipAnchors, seed.identitySeed.relationshipAnchors),
        },
        worldSeed: {
            ...seed.worldSeed,
            locations: uniqueTexts(12, aiSummary.locations, seed.worldSeed.locations),
            rules: uniqueTexts(16, worldSummary ? [worldSummary] : [], aiSummary.worldRules, seed.worldSeed.rules),
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

    const systemPrompt = [
        '你是一个角色卡与世界观整理助手。',
        '请根据输入的角色描述、开场白、作者注释、系统提示和世界观资料，提炼适合 MemoryOS 冷启动的角色总结与世界观总结。',
        '只输出符合 schema 的 JSON，不要输出额外说明。',
        '所有自然语言内容使用简体中文。',
        '内容要简洁、可复用、避免编造；如果资料里没有，就返回空字符串或空数组。',
        '严格使用以下 JSON 键名：roleSummary, worldSummary, identityFacts, worldRules, hardConstraints, locations, entities, catchphrases, relationshipAnchors, styleCues。',
        '不要返回 character_summary、world_summary、seed_key_entries 或任何其他替代键名。',
    ].join('\n');

    const userPrompt = `${buildPromptPayload(seed)}\n\n请输出角色摘要、世界观摘要，以及适合做 seed 的关键条目。`;
    const result = await runGeneration<SemanticSeedAiSummary>(
        MEMORY_TASKS.COLDSTART_SUMMARIZE,
        {
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2,
        },
        {
            maxTokens: 1200,
            maxLatencyMs: 0,
            chatKey: options?.chatKey,
            taskPresentation: options?.taskPresentation,
        },
        SEMANTIC_SEED_SUMMARY_SCHEMA,
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

    const normalizedSummary = normalizeSemanticSeedAiSummary(result.data);
    if (!normalizedSummary) {
        logger.warn('[ColdStart][AiSummaryNormalizeFailed]', {
            forced: options?.force === true,
            dataKeys: Object.keys(result.data as Record<string, unknown>).slice(0, 20),
        });
        return seed;
    }

    return mergeAiSummary(seed, normalizedSummary);
}
