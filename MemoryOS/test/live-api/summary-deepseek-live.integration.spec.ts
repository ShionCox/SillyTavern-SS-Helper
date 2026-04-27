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
    vi.doMock('../../src/settings/store', async (importOriginal) => {
        const actual = await importOriginal<typeof import('../../src/settings/store')>();
        return {
            ...actual,
            readMemoryOSSettings: () => ({
                ...actual.readMemoryOSSettings(),
                summarySplitByActionType: false,
            }),
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

function createDeepSeekLLM(env: DeepSeekEnv, capture?: Array<{ taskKey: string; data: unknown }>): MemoryLLMApi {
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
                        messages: buildDeepSeekJsonModeMessages(args.taskKey, args.input.messages, args.schema),
                        temperature: 0,
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
                const data = normalizeDeepSeekJsonKeys(parseJsonContent<T>(content), args.taskKey) as T;
                capture?.push({
                    taskKey: args.taskKey,
                    data,
                });
                return {
                    ok: true,
                    data,
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
    schema?: unknown,
): Array<{ role: 'system' | 'user'; content: string }> {
    if (taskKey !== 'memory_summary_mutation') {
        return messages;
    }
    return [
        {
            role: 'system',
            content: [
                'DeepSeek JSON mode live test reminder:',
                '如果 patchTargetManifest.patchTargets 中已有同一对象，必须优先输出 UPDATE 或 MERGE，不要输出 ADD。',
                '根据 patchTargetManifest 选择 relationship、task、open_thread 等 targetKind；已有候选必须引用当前上下文提供的 targetRef。',
                '只有完全没有合适 targetRef 的新对象才允许 ADD；ADD 必须包含 keySeed 和 newRecord，禁止输出 entityKey 或 compareKey。',
                'UPDATE、MERGE、INVALIDATE 必须包含 targetRef 和 patch，不要输出 payload、candidateId、targetId、entryId。',
                'patch 不能只包含 summary；必须包含当前类型可编辑字段里的实际变化，例如 task 使用 fields.status/fields.route/fields.nextStep，open_thread 使用 fields.status/fields.clue，relationship 使用 fields.relationTag/fields.state/trust。',
                '如果无法给出包含有效可编辑字段的 patch，请输出 NOOP，不要输出空 patch 的 UPDATE。',
                '每个非 NOOP action 必须包含 sourceEvidence、confidence、memoryValue、reasonCodes。',
                'patch 必须是非空对象；UPDATE 如果没有实际 patch 字段就必须改成 NOOP。',
                '合法 UPDATE 示例：{"action":"UPDATE","targetKind":"task","targetRef":"T1","confidence":0.82,"memoryValue":"high","sourceEvidence":{"type":"story_dialogue","brief":"艾琳确认任务从筹划进入执行。"},"patch":{"fields":{"status":"执行中","route":"旧水渠","nextStep":"第三声钟响后从北门旧水渠离城"}},"reasonCodes":["target_ref_selected","task_progressed"]}',
                '合法 ADD 示例：{"action":"ADD","targetKind":"item","keySeed":{"kind":"item","title":"旧水渠检修门铜钥匙","qualifier":"今晚撤离","participants":["actor_erin","user"]},"confidence":0.78,"memoryValue":"medium","sourceEvidence":{"type":"story_dialogue","brief":"艾琳交给{{user}}一枚铜钥匙。"},"newRecord":{"title":"旧水渠检修门铜钥匙","summary":"艾琳把无纹章铜钥匙交给{{user}}，用于今晚打开旧水渠外侧检修门。","fields":{"holder":"user","owner":"actor_erin","usage":"打开旧水渠外侧检修门","validity":"仅限今晚撤离"}},"reasonCodes":["item_created","system_key_required"]}',
                schema ? `必须符合以下 JSON Schema；尤其 UPDATE/MERGE/INVALIDATE 的 patch 不能缺失或为空：\n${JSON.stringify(schema)}` : '',
                '只输出合法 JSON。',
            ].join('\n'),
        },
        ...messages,
        {
            role: 'user',
            content: [
                '输出最终 JSON 前逐条自检：',
                '1. 所有 UPDATE / MERGE / INVALIDATE 都必须有 targetRef 和 patch 对象。',
                '2. 所有 ADD 都必须有 keySeed 和 newRecord，不能有 entityKey / compareKey。',
                '3. 所有非 NOOP 都必须有 sourceEvidence、confidence、memoryValue、reasonCodes。',
                '4. 禁止输出 payload、candidateId、targetId、entryId 字段。',
                '5. patch 不能只写 summary，必须写 fields/trust 等实际可编辑字段。',
                '6. 如果某条动作无法满足以上字段，改为 NOOP。',
            ].join('\n'),
        },
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
        target_ref: 'targetRef',
        source_refs: 'sourceRefs',
        key_seed: 'keySeed',
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
        {
            entryId: 'entry-task-escort',
            chatKey: 'deepseek-live-chat',
            title: '护送密使离开王都',
            entryType: 'task',
            category: '任务',
            tags: ['task', '密使', '王都'],
            summary: '护送密使离开王都仍处于筹划阶段，尚未确定可靠路线。',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {
                entityKey: 'entity:task:escort_messenger',
                compareKey: 'ck:v2:task:护送密使离开王都:王都',
                bindings: {
                    actors: ['user', 'actor_erin'],
                    locations: ['entity:location:north_gate'],
                    organizations: [],
                },
                fields: {
                    objective: '护送密使离开王都',
                    status: '筹划中',
                    route: '未确认',
                    nextStep: '等待艾琳确认离城路线',
                },
            },
            sourceSummaryIds: [],
            createdAt: 1,
            updatedAt: 1,
        },
        {
            entryId: 'entry-thread-traitor',
            chatKey: 'deepseek-live-chat',
            title: '内鬼身份尚未查明',
            entryType: 'open_thread',
            category: '未解决线索',
            tags: ['open_thread', '内鬼'],
            summary: '王都内存在泄密者，但身份和动机尚未确认。',
            detail: '',
            detailSchemaVersion: 1,
            detailPayload: {
                entityKey: 'entity:open_thread:royal_capital_traitor',
                compareKey: 'ck:v2:open_thread:王都内鬼身份未明',
                bindings: {
                    actors: ['user', 'actor_erin'],
                    locations: ['entity:location:royal_capital'],
                    organizations: [],
                },
                fields: {
                    question: '王都内鬼是谁',
                    status: '未解决',
                    clue: '有人向追兵泄露密使动向',
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

    runIfConfigured('使用真实 DeepSeek 跑 Summary 主链路，并校验 targetRef / keySeed / patch path 新协议', async () => {
        const env = deepseekEnv;
        expect(env).not.toBeNull();
        if (!env) {
            return;
        }
        const { runSummaryOrchestrator } = await loadSummaryOrchestrator('林远');
        const history: Array<{ action: string; payload: Record<string, unknown> }> = [];
        const snapshotInputs: CapturedSnapshotInput[] = [];
        const llmOutputs: Array<{ taskKey: string; data: unknown }> = [];
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
            llm: createDeepSeekLLM(env, llmOutputs),
            pluginId: 'MemoryOS',
            chatKey: `deepseek-live-${Date.now()}`,
            messages: [
                {
                    role: 'user',
                    content: '我是林远。次日清晨，雨刚停，旧钟楼的钟声还没散。艾琳把我叫到药铺后巷，承认过去三天她一直在试探我，故意只给我半真半假的情报。',
                },
                {
                    role: 'assistant',
                    content: '艾琳低声说：“昨夜你明明可以拿着密信离开，却还是回来救了那个受伤的传令兵。我已经确认你不会背叛我。从今天起，我会把你当成可靠盟友，而不是临时同伴。”',
                },
                {
                    role: 'user',
                    content: '我没有追问她之前隐瞒了什么，只问护送密使的路线是否已经确定。我也承诺，之后涉及密使、北门和追兵的行动，会先和她互通情报，不再各自隐瞒。',
                },
                {
                    role: 'assistant',
                    content: '她摊开一张潮湿的城防图，说北门第三声钟响后会短暂换岗，旧水渠的铁栅栏已经被她提前锯松。密使必须在当晚从旧水渠离城，所以护送任务从筹划改为当晚执行。',
                },
                {
                    role: 'user',
                    content: '我指出一个问题：追兵昨夜能提前堵住药铺，说明密使行踪已经泄露。知道水渠路线的人越少越好，因为王都里仍有内鬼。',
                },
                {
                    role: 'assistant',
                    content: '艾琳同意这个判断。她只能确认泄密者接触过北门守卫，还知道药铺后巷这个备用会合点，但内鬼身份仍未查明。她要求你护送结束后继续追踪这条线索。',
                },
                {
                    role: 'user',
                    content: '我答应她，如果密使成功出城，我会在黎明前回到石桥下，把北门守卫名单和药铺线索重新核对一遍。',
                },
                {
                    role: 'assistant',
                    content: '艾琳把一枚没有纹章的铜钥匙交给你，说它能打开旧水渠外侧的检修门；她强调钥匙只用于今晚撤离，不能暴露给其他人。',
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
                llmOutputs,
            }, null, 2)}`);
        }
        expect(result.diagnostics.usedLLM).toBe(true);
        expect(snapshotInputs).toHaveLength(1);

        const batchPayload = history.find((item) => item.action === 'summary_mutation_batch_resolved')?.payload;
        expect(batchPayload).toBeTruthy();
        const rawDocument = batchPayload?.rawDocument as SummaryMutationDocument | undefined;
        const validatedDocument = batchPayload?.validatedDocument as SummaryMutationDocument | undefined;
        expect(validatedDocument?.schemaVersion).toBe('1.0.0');
        expect(validatedDocument?.actions.length).toBeGreaterThan(0);

        const nonNoopActions = validatedDocument?.actions.filter((action) => action.action !== 'NOOP') ?? [];
        expect(nonNoopActions.length).toBeGreaterThan(0);
        const targetKinds = new Set(nonNoopActions.map((action) => action.targetKind));
        const expectedCoveredKinds = ['relationship', 'task', 'open_thread'].filter((kind) => targetKinds.has(kind));
        expect(expectedCoveredKinds.length).toBeGreaterThanOrEqual(2);
        const targetRefActions = nonNoopActions.filter((action) => ['UPDATE', 'MERGE', 'INVALIDATE'].includes(action.action));
        expect(targetRefActions.length).toBeGreaterThan(0);

        for (const action of nonNoopActions) {
            expect(action.confidence ?? 0).toBeGreaterThanOrEqual(0);
            expect(action.confidence ?? 1).toBeLessThanOrEqual(1);
            expect(action.memoryValue).toMatch(/^(low|medium|high)$/u);
            expect(action.sourceEvidence?.brief).toBeTruthy();
            expect(action.reasonCodes.length).toBeGreaterThan(0);
            if (action.action === 'ADD') {
                expect(action.newRecord).toBeTruthy();
                expect(action.keySeed).toBeTruthy();
                expect(action.reasonCodes).toContain('system_key_resolved');
                expect(action.entityKey).toMatch(/^entity:/u);
                expect(action.compareKey).toMatch(/^ck:v2:/u);
            }
            if (['UPDATE', 'MERGE', 'INVALIDATE'].includes(action.action)) {
                expect(action.targetRef).toMatch(/^T\d+$/u);
                expect(action.targetId || action.candidateId).toBeTruthy();
                expect(action.reasonCodes).toContain('target_ref_decoded');
                expect(action.patch).toBeTruthy();
            }
        }
        const rawExistingMutations = rawDocument?.actions.filter((action) => ['UPDATE', 'MERGE', 'INVALIDATE'].includes(action.action)) ?? [];
        for (const action of rawExistingMutations) {
            expect(action.targetRef).toMatch(/^T\d+$/u);
            expect(action.candidateId).toBeUndefined();
            expect(action.targetId).toBeUndefined();
            expect(action.payload).toBeUndefined();
        }
        const appliedUpserts = snapshotInputs.flatMap((input) => input.entryUpserts ?? []) as Array<{ entryId?: string; detailPayload?: Record<string, unknown> }>;
        expect(appliedUpserts.some((entry) => entry.entryId === 'entry-task-escort')).toBe(true);

        const rawDocumentText = JSON.stringify(batchPayload?.rawDocument ?? {});
        expect(rawDocumentText).toContain('{{user}}');
        expect(rawDocumentText).not.toMatch(/用户|主角|玩家|当前系统|抽取结果|结构化处理/u);
    }, 120_000);
});
