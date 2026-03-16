import type { ChatSemanticSeed, SemanticAiSummary } from '../types/chat-state';
import { runGeneration, MEMORY_TASKS } from '../llm/memoryLlmBridge';

type SemanticSeedAiSummary = Omit<SemanticAiSummary, 'generatedAt' | 'source'>;

const SEMANTIC_SEED_SUMMARY_SCHEMA = {
    type: 'object',
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
    return [
        `角色名：${normalizeText(seed.identitySeed.displayName) || '未知角色'}`,
        `角色别名：${uniqueTexts(8, seed.identitySeed.aliases).join('；') || '无'}`,
        `角色描述：${normalizeText(characterCore.description) || '无'}`,
        `开场白：${normalizeText(seed.firstMessage) || '无'}`,
        `作者注释：${normalizeText(seed.authorNote) || '无'}`,
        `系统提示：${normalizeText(seed.systemPrompt) || '无'}`,
        `场景 / 世界观：${uniqueTexts(16, [normalizeText(characterCore.scenario)], seed.worldSeed.rules, seed.worldSeed.hardConstraints, seed.worldSeed.locations, seed.worldSeed.entities).join('；') || '无'}`,
        `世界书：${uniqueTexts(12, seed.activeLorebooks).join('；') || '无'}`,
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
    if (!seed || !shouldUseAiSummary(seed)) {
        return seed;
    }

    const llm = (window as unknown as { STX?: { llm?: { runTask?: unknown } } }).STX?.llm;
    if (!llm || typeof llm.runTask !== 'function') {
        return seed;
    }

    const systemPrompt = [
        '你是一个角色卡与世界观整理助手。',
        '请根据输入的角色描述、开场白、作者注释、系统提示和世界观资料，提炼适合 MemoryOS 冷启动的角色总结与世界观总结。',
        '只输出符合 schema 的 JSON，不要输出额外说明。',
        '所有自然语言内容使用简体中文。',
        '内容要简洁、可复用、避免编造；如果资料里没有，就返回空字符串或空数组。',
    ].join('\n');

    const userPrompt = `${buildPromptPayload(seed)}\n\n请输出角色摘要、世界观摘要，以及适合做 seed 的关键条目。`;
    const result = await runGeneration<SemanticSeedAiSummary>(
        MEMORY_TASKS.SUMMARIZE,
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
        },
        SEMANTIC_SEED_SUMMARY_SCHEMA,
        '角色卡与世界观总结',
    );

    if (!result.ok || !result.data) {
        return seed;
    }

    return mergeAiSummary(seed, result.data);
}
