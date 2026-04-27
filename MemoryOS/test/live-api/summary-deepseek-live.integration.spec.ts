import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemoryLLMApi } from '../../src/memory-summary/llm-types';
import type { SummaryMutationDocument } from '../../src/memory-summary/mutation-types';
import type { MemoryEntry, SummarySnapshot } from '../../src/types';

type DeepSeekEnv = {
    deepseek_url: string;
    deepseek_api_key: string;
    deepseek_model: string;
    embedding_url: string;
    embedding_api_key: string;
    embedding_model: string;
    reranking_url: string;
    reranking_api_key: string;
    reranking_model: string;
};

type CapturedSnapshotInput = {
    title?: string;
    content: string;
    actorKeys: string[];
    entryUpserts?: unknown[];
    relationshipMutations?: unknown[];
    refreshBindings?: unknown[];
};

async function loadSummaryOrchestrator(mockedUserName: string) {
    vi.resetModules();
    vi.doMock('../../../SDK/tavern', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../../../SDK/tavern')>();
        return {
            ...actual,
            getCurrentTavernUserNameEvent: vi.fn(() => mockedUserName),
        };
    });
    return import('../../src/memory-summary');
}

function readDeepSeekEnv(): DeepSeekEnv | null {
    const envFromProcess = {
        deepseek_url: process.env.deepseek_url ?? process.env.DEEPSEEK_URL ?? '',
        deepseek_api_key: process.env.deepseek_api_key ?? process.env.DEEPSEEK_API_KEY ?? '',
        deepseek_model: process.env.deepseek_model ?? process.env.DEEPSEEK_MODEL ?? '',
        embedding_url: process.env.embedding_url ?? process.env.EMBEDDING_URL ?? '',
        embedding_api_key: process.env.embedding_api_key ?? process.env.EMBEDDING_API_KEY ?? '',
        embedding_model: process.env.embedding_model ?? process.env.EMBEDDING_MODEL ?? '',
        reranking_url: process.env.reranking_url ?? process.env.RERANKING_URL ?? '',
        reranking_api_key: process.env.reranking_api_key ?? process.env.RERANKING_API_KEY ?? '',
        reranking_model: process.env.reranking_model ?? process.env.RERANKING_MODEL ?? '',
    };
    if (hasLiveEnv(envFromProcess)) {
        return envFromProcess;
    }

    const envPath = findFileUpwards(process.cwd(), '.env');
    if (!envPath) {
        return null;
    }
    const parsed = parseDotEnv(readFileSync(envPath, 'utf8'));
    const deepseekEnv = {
        deepseek_url: parsed.deepseek_url ?? parsed.DEEPSEEK_URL ?? '',
        deepseek_api_key: parsed.deepseek_api_key ?? parsed.DEEPSEEK_API_KEY ?? '',
        deepseek_model: parsed.deepseek_model ?? parsed.DEEPSEEK_MODEL ?? '',
        embedding_url: parsed.embedding_url ?? parsed.EMBEDDING_URL ?? '',
        embedding_api_key: parsed.embedding_api_key ?? parsed.EMBEDDING_API_KEY ?? '',
        embedding_model: parsed.embedding_model ?? parsed.EMBEDDING_MODEL ?? '',
        reranking_url: parsed.reranking_url ?? parsed.RERANKING_URL ?? '',
        reranking_api_key: parsed.reranking_api_key ?? parsed.RERANKING_API_KEY ?? '',
        reranking_model: parsed.reranking_model ?? parsed.RERANKING_MODEL ?? '',
    };
    return hasLiveEnv(deepseekEnv)
        ? deepseekEnv
        : null;
}

function hasLiveEnv(env: DeepSeekEnv): boolean {
    return Boolean(
        env.deepseek_url
        && env.deepseek_api_key
        && env.deepseek_model
        && env.embedding_url
        && env.embedding_api_key
        && env.embedding_model
        && env.reranking_url
        && env.reranking_api_key
        && env.reranking_model,
    );
}

function findFileUpwards(startDir: string, fileName: string): string | null {
    let current = resolve(startDir);
    while (true) {
        const candidate = resolve(current, fileName);
        if (existsSync(candidate)) {
            return candidate;
        }
        const parent = dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

function parseDotEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const rawLine of content.split(/\r?\n/u)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const equalsIndex = line.indexOf('=');
        if (equalsIndex <= 0) {
            continue;
        }
        const key = line.slice(0, equalsIndex).trim();
        const rawValue = line.slice(equalsIndex + 1).trim();
        result[key] = rawValue.replace(/^['"]|['"]$/gu, '');
    }
    return result;
}

function createDeepSeekLLM(env: DeepSeekEnv): MemoryLLMApi {
    const baseUrl = env.deepseek_url.replace(/\/+$/u, '');
    return {
        registerConsumer: () => {},
        runTask: async <T>(args): Promise<{ ok: true; data: T } | { ok: false; error: string; reasonCode: string }> => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 90_000);
            try {
                const response = await fetch(`${baseUrl}/chat/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${env.deepseek_api_key}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: env.deepseek_model,
                        messages: buildDeepSeekJsonModeMessages(args.taskKey, args.input.messages),
                        temperature: 0.1,
                        max_tokens: 4096,
                        response_format: { type: 'json_object' },
                    }),
                    signal: controller.signal,
                });
                const responseText = await response.text();
                if (!response.ok) {
                    return {
                        ok: false,
                        error: `DeepSeek HTTP ${response.status}: ${responseText.slice(0, 300)}`,
                        reasonCode: 'deepseek_http_error',
                    };
                }
                const payload = JSON.parse(responseText) as {
                    choices?: Array<{ message?: { content?: string } }>;
                };
                const content = payload.choices?.[0]?.message?.content ?? '';
                return {
                    ok: true,
                    data: normalizeDeepSeekJsonKeys(parseJsonContent<T>(content), args.taskKey) as T,
                };
            } catch (error) {
                return {
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                    reasonCode: 'deepseek_request_failed',
                };
            } finally {
                clearTimeout(timeout);
            }
        },
    };
}

function buildDeepSeekJsonModeMessages(
    taskKey: string,
    messages: Array<{ role: 'system' | 'user'; content: string }>,
): Array<{ role: 'system' | 'user'; content: string }> {
    if (taskKey !== 'memory_summary_mutation') {
        return messages;
    }
    return [
        {
            role: 'system',
            content: [
                'DeepSeek JSON mode live test reminder:',
                '如果 candidateRecords 中已有同一对象，必须优先输出 UPDATE 或 MERGE，不要输出 ADD。',
                '本轮已有候选覆盖艾琳与{{user}}的关系变化，应输出 UPDATE relationship，并引用已有 candidateId。',
                '每个非 NOOP action 必须包含 sourceEvidence、confidence、memoryValue、reasonCodes。',
                '只输出合法 JSON。',
            ].join('\n'),
        },
        ...messages,
    ];
}

async function runEmbeddingPreflight(env: DeepSeekEnv): Promise<void> {
    const response = await fetch(`${env.embedding_url.replace(/\/+$/u, '')}/embeddings`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.embedding_api_key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: env.embedding_model,
            input: [
                '艾琳信任{{user}}，并交付通行信物。',
                '普通闲聊，没有长期记忆价值。',
            ],
        }),
    });
    const responseText = await response.text();
    expect(response.ok, `embedding request failed: HTTP ${response.status} ${responseText.slice(0, 200)}`).toBe(true);
    const payload = JSON.parse(responseText) as {
        data?: Array<{ embedding?: unknown }>;
    };
    const vector = payload.data?.[0]?.embedding;
    expect(Array.isArray(vector)).toBe(true);
    expect((vector as unknown[]).length).toBeGreaterThan(0);
}

async function runRerankPreflight(env: DeepSeekEnv): Promise<void> {
    const response = await fetch(`${env.reranking_url.replace(/\/+$/u, '')}/rerank`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.reranking_api_key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: env.reranking_model,
            query: '艾琳信任林远并委托他护送密使出城',
            documents: [
                '艾琳交付银色徽章，信任林远护送密使离开王都。',
                '天气转晴，街边商贩开始收摊。',
                '北门守卫会在第三声钟响后换岗。',
            ],
            top_n: 2,
            return_documents: false,
        }),
    });
    const responseText = await response.text();
    expect(response.ok, `reranking request failed: HTTP ${response.status} ${responseText.slice(0, 200)}`).toBe(true);
    const payload = JSON.parse(responseText) as {
        results?: Array<{ index?: number; relevance_score?: number; score?: number }>;
        data?: Array<{ index?: number; relevance_score?: number; score?: number }>;
    };
    const results = payload.results ?? payload.data ?? [];
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.index).toBe(0);
    expect(Number(results[0]?.relevance_score ?? results[0]?.score ?? 0)).toBeGreaterThan(0);
}

function parseJsonContent<T>(content: string): T {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/u);
    const jsonText = fenced?.[1] ?? trimmed;
    return JSON.parse(jsonText) as T;
}

function normalizeDeepSeekJsonKeys(value: unknown, taskKey: string): unknown {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeDeepSeekJsonKeys(item, taskKey));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    const keyMap: Record<string, string> = {
        should_update: 'should_update',
        focus_types: 'focus_types',
        memory_value: taskKey === 'memory_summary_mutation' ? 'memoryValue' : 'memory_value',
        suggested_operation_bias: 'suggested_operation_bias',
        skip_reason: 'skip_reason',
        schema_version: 'schemaVersion',
        target_kind: 'targetKind',
        target_id: 'targetId',
        source_ids: 'sourceIds',
        candidate_id: 'candidateId',
        entity_key: 'entityKey',
        compare_key: 'compareKey',
        match_keys: 'matchKeys',
        memoryValue: 'memoryValue',
        memory_value_action: 'memoryValue',
        source_evidence: 'sourceEvidence',
        turn_refs: 'turnRefs',
        time_context: 'timeContext',
        story_time: 'storyTime',
        new_record: 'newRecord',
        reason_codes: 'reasonCodes',
        skipped_count: 'skippedCount',
        noop_reasons: 'noopReasons',
        possible_duplicates: 'possibleDuplicates',
        source_warnings: 'sourceWarnings',
    };
    const normalized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        normalized[keyMap[key] ?? key] = normalizeDeepSeekJsonKeys(item, taskKey);
    }
    return normalized;
}

function buildExistingEntries(): MemoryEntry[] {
    return [
        {
            entryId: 'entry-relationship-erin',
            chatKey: 'deepseek-live-chat',
            title: '林远与艾琳的合作关系',
            entryType: 'relationship',
            category: '角色关系',
            tags: ['relationship', '艾琳'],
            summary: '艾琳仍在试探{{user}}，暂未完全信任。',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {
                sourceActorKey: 'actor_erin',
                targetActorKey: 'user',
                participants: ['actor_erin', 'user'],
                relationTag: '谨慎合作',
                trust: 0.42,
                fields: {
                    relationTag: '谨慎合作',
                },
            },
            sourceSummaryIds: [],
            createdAt: 1,
            updatedAt: 1,
        },
    ];
}

describe('summary DeepSeek live integration', () => {
    const deepseekEnv = readDeepSeekEnv();
    const runIfConfigured = deepseekEnv ? it : it.skip;

    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    runIfConfigured('使用真实 DeepSeek 跑总结链路，并校验输出符合 P1/P2/P3 关键约束', async () => {
        const env = deepseekEnv;
        expect(env).not.toBeNull();
        if (!env) {
            return;
        }
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const history: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const snapshotInputs: CapturedSnapshotInput[] = [];
        const existingEntries = buildExistingEntries();

        await runEmbeddingPreflight(env);
        await runRerankPreflight(env);

        const result = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async () => existingEntries,
                listRoleMemories: async () => [],
                listSummarySnapshots: async () => [],
                getWorldProfileBinding: async () => null,
                appendMutationHistory: async (input) => {
                    history.push(input);
                },
                getEntry: async (entryId) => existingEntries.find((entry) => entry.entryId === entryId) ?? null,
                applySummarySnapshot: async (input): Promise<SummarySnapshot> => {
                    snapshotInputs.push(input);
                    return {
                        summaryId: 'deepseek-live-summary',
                        chatKey: 'deepseek-live-chat',
                        title: input.title ?? 'DeepSeek Live Summary',
                        content: input.content,
                        actorKeys: input.actorKeys,
                        entryUpserts: input.entryUpserts ?? [],
                        refreshBindings: input.refreshBindings ?? [],
                        createdAt: Date.now(),
                        updatedAt: Date.now(),
                    };
                },
                deleteEntry: async () => {},
            },
            llm: createDeepSeekLLM(env),
            pluginId: 'MemoryOS',
            chatKey: `deepseek-live-${Date.now()}`,
            messages: [
                {
                    role: 'user',
                    content: '我是林远。次日清晨，艾琳承认过去一直在试探我，但现在愿意把真正的情报告诉我。',
                },
                {
                    role: 'assistant',
                    content: '艾琳低声说：“我已经确认你不会背叛我。从今天起，我会把你当成可靠盟友，而不是临时同伴。”',
                },
                {
                    role: 'user',
                    content: '我答应她，之后重要行动会先和她互通情报，不再各自隐瞒。',
                },
                {
                    role: 'assistant',
                    content: '她点头，并再次确认你们的关系已经从临时合作变为稳定盟友。',
                },
            ],
            retrievalRulePack: 'hybrid',
        });

        if (!result.snapshot) {
            const failedHistory = history.filter((item) => item.action === 'summary_failed').slice(-3);
            throw new Error(`DeepSeek summary failed: ${JSON.stringify({
                diagnostics: result.diagnostics,
                failedHistory,
                historyActions: history.map((item) => item.action),
            }, null, 2)}`);
        }
        expect(result.diagnostics.usedLLM).toBe(true);
        expect(snapshotInputs).toHaveLength(1);

        const batchPayload = history.find((item) => item.action === 'summary_mutation_batch_resolved')?.payload;
        expect(batchPayload).toBeTruthy();
        const validatedDocument = batchPayload?.validatedDocument as SummaryMutationDocument | undefined;
        expect(validatedDocument?.schemaVersion).toBe('1.0.0');
        expect(validatedDocument?.actions.length).toBeGreaterThan(0);

        const nonNoopActions = validatedDocument?.actions.filter((action) => action.action !== 'NOOP') ?? [];
        expect(nonNoopActions.length).toBeGreaterThan(0);
        expect(nonNoopActions.some((action) => ['relationship', 'task', 'open_thread', 'event'].includes(action.targetKind))).toBe(true);

        for (const action of nonNoopActions) {
            expect(action.confidence ?? 0).toBeGreaterThanOrEqual(0);
            expect(action.confidence ?? 1).toBeLessThanOrEqual(1);
            expect(action.memoryValue).toMatch(/^(low|medium|high)$/u);
            expect(action.sourceEvidence?.brief).toBeTruthy();
            expect(action.reasonCodes.length).toBeGreaterThan(0);
            if (action.compareKey) {
                expect(action.compareKey).toMatch(/^ck:v2:/u);
            }
            if (action.action === 'ADD') {
                expect(action.newRecord).toBeTruthy();
            }
            if (['UPDATE', 'MERGE', 'INVALIDATE'].includes(action.action)) {
                expect(action.patch).toBeTruthy();
            }
        }

        const rawDocumentText = JSON.stringify(batchPayload?.rawDocument ?? {});
        expect(rawDocumentText).toContain('{{user}}');
        expect(rawDocumentText).not.toMatch(/用户|主角|玩家|当前系统|抽取结果|结构化处理/u);
    }, 120_000);
});
