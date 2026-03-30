/**
 * 功能：定义 Prompt Pack 支持的分段名称。
 */
export type PromptPackSectionName =
    | 'COLD_START_SYSTEM'
    | 'COLD_START_SCHEMA'
    | 'COLD_START_OUTPUT_SAMPLE'
    | 'COLD_START_CORE_SYSTEM'
    | 'COLD_START_CORE_SCHEMA'
    | 'COLD_START_CORE_OUTPUT_SAMPLE'
    | 'COLD_START_STATE_SYSTEM'
    | 'COLD_START_STATE_SCHEMA'
    | 'COLD_START_STATE_OUTPUT_SAMPLE'
    | 'SUMMARY_PLANNER_SYSTEM'
    | 'SUMMARY_PLANNER_SCHEMA'
    | 'SUMMARY_PLANNER_OUTPUT_SAMPLE'
    | 'SUMMARY_SYSTEM'
    | 'SUMMARY_SCHEMA'
    | 'SUMMARY_OUTPUT_SAMPLE'
    | 'TAKEOVER_BASELINE_SYSTEM'
    | 'TAKEOVER_BASELINE_SCHEMA'
    | 'TAKEOVER_BASELINE_OUTPUT_SAMPLE'
    | 'TAKEOVER_ACTIVE_SYSTEM'
    | 'TAKEOVER_ACTIVE_SCHEMA'
    | 'TAKEOVER_ACTIVE_OUTPUT_SAMPLE'
    | 'TAKEOVER_BATCH_SYSTEM'
    | 'TAKEOVER_BATCH_SCHEMA'
    | 'TAKEOVER_BATCH_OUTPUT_SAMPLE'
    | 'TAKEOVER_CONFLICT_RESOLUTION_SCHEMA'
    | 'TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE'
    | 'TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA'
    | 'TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE';

/**
 * 功能：定义 Prompt Pack 各分段内容。
 */
export interface PromptPackSections {
    COLD_START_SYSTEM: string;
    COLD_START_SCHEMA: string;
    COLD_START_OUTPUT_SAMPLE: string;
    COLD_START_CORE_SYSTEM: string;
    COLD_START_CORE_SCHEMA: string;
    COLD_START_CORE_OUTPUT_SAMPLE: string;
    COLD_START_STATE_SYSTEM: string;
    COLD_START_STATE_SCHEMA: string;
    COLD_START_STATE_OUTPUT_SAMPLE: string;
    SUMMARY_PLANNER_SYSTEM: string;
    SUMMARY_PLANNER_SCHEMA: string;
    SUMMARY_PLANNER_OUTPUT_SAMPLE: string;
    SUMMARY_SYSTEM: string;
    SUMMARY_SCHEMA: string;
    SUMMARY_OUTPUT_SAMPLE: string;
    TAKEOVER_BASELINE_SYSTEM: string;
    TAKEOVER_BASELINE_SCHEMA: string;
    TAKEOVER_BASELINE_OUTPUT_SAMPLE: string;
    TAKEOVER_ACTIVE_SYSTEM: string;
    TAKEOVER_ACTIVE_SCHEMA: string;
    TAKEOVER_ACTIVE_OUTPUT_SAMPLE: string;
    TAKEOVER_BATCH_SYSTEM: string;
    TAKEOVER_BATCH_SCHEMA: string;
    TAKEOVER_BATCH_OUTPUT_SAMPLE: string;
    TAKEOVER_CONFLICT_RESOLUTION_SCHEMA: string;
    TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE: string;
    TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA: string;
    TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE: string;
}

const PROMPT_PACK_URL = new URL('./prompt-pack.md', import.meta.url).toString();

const REQUIRED_SECTIONS: string[] = [
    'COLD_START_SYSTEM',
    'COLD_START_SCHEMA',
    'COLD_START_OUTPUT_SAMPLE',
    'COLD_START_CORE_SYSTEM',
    'COLD_START_CORE_SCHEMA',
    'COLD_START_CORE_OUTPUT_SAMPLE',
    'COLD_START_STATE_SYSTEM',
    'COLD_START_STATE_SCHEMA',
    'COLD_START_STATE_OUTPUT_SAMPLE',
    'SUMMARY_PLANNER_SYSTEM',
    'SUMMARY_PLANNER_SCHEMA',
    'SUMMARY_PLANNER_OUTPUT_SAMPLE',
    'SUMMARY_SYSTEM',
    'SUMMARY_SCHEMA',
    'SUMMARY_OUTPUT_SAMPLE',
    'TAKEOVER_BASELINE_SYSTEM',
    'TAKEOVER_BASELINE_SCHEMA',
    'TAKEOVER_BASELINE_OUTPUT_SAMPLE',
    'TAKEOVER_ACTIVE_SYSTEM',
    'TAKEOVER_ACTIVE_SCHEMA',
    'TAKEOVER_ACTIVE_OUTPUT_SAMPLE',
    'TAKEOVER_BATCH_SYSTEM',
    'TAKEOVER_BATCH_SCHEMA',
    'TAKEOVER_BATCH_OUTPUT_SAMPLE',
    'TAKEOVER_CONFLICT_RESOLUTION_SCHEMA',
    'TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE',
    'TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA',
    'TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE',
];

const SUMMARY_COMMON_RULES: string[] = [
    '这是 summary mutation 任务，只输出真正需要落库的稀疏 mutation。',
    'ADD 使用 newRecord；UPDATE、MERGE、INVALIDATE 使用 patch；DELETE 和 NOOP 不要输出 payload、patch、newRecord。',
    'compareKey 采用 ck:v2 协议；entityKey 是内部稳定键，compareKey 是跨流程比对键，matchKeys 仅用于模糊候选。',
    '无法确认同一对象时优先 NOOP、UPDATE 或 MERGE，不要因为名字变化盲目 ADD。',
    'reasonCodes、candidateId、compareKey、matchKeys 不是每个动作都必须出现，只有确认时才填写。',
];

const TAKEOVER_COMMON_RULES: string[] = [
    '优先复用 knownContext、knownEntities、已有 entityKey 与 compareKey，不要因为别名或描述变化创建重复对象。',
    'compareKey 采用 ck:v2 协议；relationship 必须保留 sourceActorKey、targetActorKey、relationTag 的结构语义。',
    'entityKey 是内部稳定主键；compareKey 用于跨流程归并；matchKeys 只做候选召回，不参与唯一判定。',
    '实体、任务、世界状态、事件如存在显式 bindings，请优先补 bindings，不要只补文本摘要。',
    '输出必须偏向结构化主源；字段猜测、模糊关系和不确定线索宁可保守，也不要伪造稳定事实。',
];

let promptPackCache: Promise<PromptPackSections> | null = null;

/**
 * 功能：读取并解析 Prompt Pack。
 * @returns Prompt Pack 分段内容。
 */
export async function loadPromptPackSections(): Promise<PromptPackSections> {
    if (!promptPackCache) {
        promptPackCache = loadPromptPackSectionsInternal();
    }
    return promptPackCache;
}

/**
 * 功能：清理 Prompt Pack 缓存。
 */
export function clearPromptPackCache(): void {
    promptPackCache = null;
}

/**
 * 功能：执行实际的 Prompt Pack 加载流程。
 * @returns 分段内容。
 */
async function loadPromptPackSectionsInternal(): Promise<PromptPackSections> {
    const raw = await readPromptPackRaw();
    const parsed = parsePromptPackSections(raw);
    if (hasAllRequiredSections(parsed)) {
        return enrichPromptPackSections(parsed);
    }
    const fallback = parsePromptPackSections(buildFallbackPromptPack());
    return enrichPromptPackSections(fallback as PromptPackSections);
}

/**
 * 功能：读取 Prompt Pack 原文。
 * @returns 原始文本。
 */
async function readPromptPackRaw(): Promise<string> {
    if (typeof fetch !== 'function') {
        return buildFallbackPromptPack();
    }
    try {
        const response = await fetch(PROMPT_PACK_URL, { cache: 'no-cache' });
        if (!response.ok) {
            return buildFallbackPromptPack();
        }
        const text = await response.text();
        return String(text ?? '').trim() || buildFallbackPromptPack();
    } catch {
        return buildFallbackPromptPack();
    }
}

/**
 * 功能：按 section 注释解析 Prompt Pack。
 * @param raw 原始文本。
 * @returns 分段结果。
 */
function parsePromptPackSections(raw: string): Partial<PromptPackSections> {
    const source = String(raw ?? '');
    const marker = /<!--\s*section:\s*([A-Z0-9_]+)\s*-->/g;
    const matches = Array.from(source.matchAll(marker));
    const result: Partial<PromptPackSections> = {};
    for (let index = 0; index < matches.length; index += 1) {
        const current = matches[index];
        const next = matches[index + 1];
        const sectionName = String(current[1] ?? '').trim() as PromptPackSectionName;
        const start = (current.index ?? 0) + current[0].length;
        const end = next ? (next.index ?? source.length) : source.length;
        const content = source.slice(start, end).trim();
        if (content) {
            result[sectionName] = content;
        }
    }
    return result;
}

/**
 * 功能：检查 Prompt Pack 是否完整。
 * @param sections 已解析分段。
 * @returns 是否完整。
 */
function hasAllRequiredSections(sections: Partial<PromptPackSections>): sections is PromptPackSections {
    return REQUIRED_SECTIONS
        .filter((name: string): boolean => /^(COLD_START|SUMMARY|TAKEOVER)_/.test(String(name)))
        .every((name: string): boolean => {
        return typeof sections[name as PromptPackSectionName] === 'string' && String(sections[name as PromptPackSectionName]).trim().length > 0;
        });
}

/**
 * 功能：补齐和增强 Prompt Pack 规则。
 * @param sections 原始分段。
 * @returns 增强后的分段。
 */
function enrichPromptPackSections(sections: PromptPackSections): PromptPackSections {
    return {
        ...sections,
        SUMMARY_SYSTEM: appendPromptRules(sections.SUMMARY_SYSTEM, SUMMARY_COMMON_RULES),
        TAKEOVER_BATCH_SYSTEM: appendPromptRules(sections.TAKEOVER_BATCH_SYSTEM, TAKEOVER_COMMON_RULES),
    };
}

/**
 * 功能：向提示词追加单条规则。
 * @param source 原始提示词。
 * @param rule 规则文本。
 * @returns 处理后的提示词。
 */
function appendPromptRule(source: string, rule: string): string {
    const normalized = String(source ?? '').trim();
    if (!normalized || normalized.includes(rule)) {
        return normalized;
    }
    return `${normalized}\n- ${rule}`;
}

/**
 * 功能：批量向提示词追加规则。
 * @param source 原始提示词。
 * @param rules 规则列表。
 * @returns 处理后的提示词。
 */
function appendPromptRules(source: string, rules: string[]): string {
    return rules.reduce((current: string, rule: string): string => appendPromptRule(current, rule), String(source ?? '').trim());
}

/**
 * 功能：构建内置 Prompt Pack。
 * @returns Prompt Pack 文本。
 */
function buildFallbackPromptPack(): string {
    return [
        section('COLD_START_SYSTEM', `
你正在执行结构化记忆冷启动抽取任务。
只保留长期稳定、可复用、适合进入记忆系统的内容。
- 用户锚点固定为 \`user\`，自然语言称呼优先使用 \`{{userDisplayName}}\`。
- compareKey 采用 \`ck:v2:<kind>:...\` 协议；entityKey 是内部稳定主键；matchKeys 只用于模糊候选。
- 非人物对象请放进 entityCards，不要误写进 actorCards。
- 只输出 JSON。
        `),
        section('COLD_START_SCHEMA', fencedJson(baseColdStartSchema())),
        section('COLD_START_OUTPUT_SAMPLE', fencedJson(coldStartSample())),
        section('COLD_START_CORE_SYSTEM', `
你正在执行冷启动 Core Extract 阶段。
只关注 identity、actorCards、entityCards、worldProfileDetection、worldBase。
relationships 与 memoryRecords 必须返回空数组。
只输出 JSON。
        `),
        section('COLD_START_CORE_SCHEMA', fencedJson(baseColdStartSchema())),
        section('COLD_START_CORE_OUTPUT_SAMPLE', fencedJson(coldStartCoreSample())),
        section('COLD_START_STATE_SYSTEM', `
你正在执行冷启动 State Extract 阶段。
只关注 relationships、memoryRecords 和近期稳定状态线索。
identity、actorCards、entityCards、worldBase 没有新增时可返回空集合。
只输出 JSON。
        `),
        section('COLD_START_STATE_SCHEMA', fencedJson(baseColdStartStateSchema())),
        section('COLD_START_STATE_OUTPUT_SAMPLE', fencedJson(coldStartStateSample())),
        section('SUMMARY_PLANNER_SYSTEM', `
你正在执行 summary planner。
你的职责是判断当前窗口是否值得更新长期记忆，并给出后续 mutation 的聚焦方向。
如窗口只是闲聊、重复确认或没有形成稳定事实，应返回 should_update=false。
只输出 JSON。
        `),
        section('SUMMARY_PLANNER_SCHEMA', fencedJson(summaryPlannerSchema())),
        section('SUMMARY_PLANNER_OUTPUT_SAMPLE', fencedJson(summaryPlannerSample())),
        section('SUMMARY_SYSTEM', `
你正在执行 summary mutation。
请输出真正需要落库的稀疏 mutation，而不是重写整份旧状态。
- compareKey 采用 ck:v2 协议。
- entityKey 是内部稳定键，compareKey 是跨流程归并键，matchKeys 只做模糊候选。
- sourceContext 可写入本次动作来自 summary 的附加信息。
只输出 JSON。
        `),
        section('SUMMARY_SCHEMA', fencedJson(summaryMutationSchema())),
        section('SUMMARY_OUTPUT_SAMPLE', fencedJson(summaryMutationSample())),
        section('TAKEOVER_BASELINE_SYSTEM', `
你正在执行旧聊天接管的静态基线抽取任务。
提取稳定设定、人格基线、世界规则和静态背景。
只输出 JSON。
        `),
        section('TAKEOVER_BASELINE_SCHEMA', fencedJson(takeoverBaselineSchema())),
        section('TAKEOVER_BASELINE_OUTPUT_SAMPLE', fencedJson(takeoverBaselineSample())),
        section('TAKEOVER_ACTIVE_SYSTEM', `
你正在执行旧聊天接管的最近活跃快照任务。
总结当前场景、地点、时间线索、活跃目标、活跃关系和未结线索。
只输出 JSON。
        `),
        section('TAKEOVER_ACTIVE_SCHEMA', fencedJson(takeoverActiveSchema())),
        section('TAKEOVER_ACTIVE_OUTPUT_SAMPLE', fencedJson(takeoverActiveSample())),
        section('TAKEOVER_BATCH_SYSTEM', `
你正在执行旧聊天接管的历史批次分析任务。
请优先复用 knownContext 与 knownEntities，保持 compareKey、entityKey、bindings 的稳定性。
任务、事件、世界状态、关系必须尽量给出结构化主源，不要只给模糊摘要。
只输出 JSON。
        `),
        section('TAKEOVER_BATCH_SCHEMA', fencedJson(takeoverBatchSchema())),
        section('TAKEOVER_BATCH_OUTPUT_SAMPLE', fencedJson(takeoverBatchSample())),
        section('TAKEOVER_CONFLICT_RESOLUTION_SCHEMA', fencedJson(takeoverConflictSchema())),
        section('TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE', fencedJson(takeoverConflictSample())),
        section('TAKEOVER_CONFLICT_RESOLUTION_BATCH_SCHEMA', fencedJson(takeoverConflictBatchSchema())),
        section('TAKEOVER_CONFLICT_RESOLUTION_BATCH_OUTPUT_SAMPLE', fencedJson(takeoverConflictBatchSample())),
    ].join('\n\n');
}

/**
 * 功能：包装 section 文本。
 * @param name section 名称。
 * @param content section 内容。
 * @returns section 文本。
 */
function section(name: PromptPackSectionName, content: string): string {
    return `<!-- section: ${name} -->\n${String(content ?? '').trim()}`;
}

/**
 * 功能：包装 JSON 代码块。
 * @param value 任意对象。
 * @returns Markdown 代码块。
 */
function fencedJson(value: unknown): string {
    return `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
}

function baseColdStartSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'identity', 'actorCards', 'entityCards', 'worldProfileDetection', 'worldBase', 'relationships', 'memoryRecords'],
    };
}

function baseColdStartStateSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'identity', 'actorCards', 'entityCards', 'worldBase', 'relationships', 'memoryRecords'],
    };
}

function summaryPlannerSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['should_update', 'focus_types', 'entities', 'topics', 'reasons'],
    };
}

function summaryMutationSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['schemaVersion', 'window', 'actions'],
        properties: {
            schemaVersion: { type: 'string' },
            window: { type: 'object' },
            actions: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['action', 'targetKind'],
                    properties: {
                        action: { type: 'string' },
                        targetKind: { type: 'string' },
                        entityKey: { type: 'string' },
                        compareKey: { type: 'string' },
                        matchKeys: { type: 'array', items: { type: 'string' } },
                        schemaVersion: { type: 'string' },
                        patch: { type: 'object', additionalProperties: true },
                        newRecord: { type: 'object', additionalProperties: true },
                        reasonCodes: { type: 'array', items: { type: 'string' } },
                    },
                },
            },
        },
    };
}

function takeoverBaselineSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['staticBaseline', 'personaBaseline', 'worldBaseline', 'ruleBaseline', 'sourceSummary', 'generatedAt'],
    };
}

function takeoverActiveSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['generatedAt', 'currentScene', 'currentLocation', 'currentTimeHint', 'activeGoals', 'activeRelations', 'openThreads', 'recentDigest'],
    };
}

function takeoverBatchSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['batchId', 'summary', 'actorCards', 'relationships', 'entityCards', 'entityTransitions', 'stableFacts', 'relationTransitions', 'taskTransitions', 'worldStateChanges', 'openThreads', 'chapterTags', 'sourceRange'],
    };
}

function takeoverConflictSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['bucketId', 'domain', 'resolutions'],
    };
}

function coldStartSample(): Record<string, unknown> {
    return {
        schemaVersion: '1.0.0',
        identity: {
            actorKey: 'char_erin',
            displayName: '艾琳',
            aliases: ['小艾'],
            identityFacts: ['王都情报员'],
            originFacts: ['来自北境边区'],
            traits: ['冷静', '多疑'],
        },
        actorCards: [],
        entityCards: {
            organizations: [
                {
                    entityType: 'organization',
                    entityKey: 'entity:organization:night_raven',
                    compareKey: 'ck:v2:organization:夜鸦组:王都',
                    matchKeys: ['mk:organization:夜鸦组', 'mk:organization:王都:夜鸦组'],
                    schemaVersion: 'v2',
                    canonicalName: '夜鸦组',
                    title: '夜鸦组',
                    aliases: [],
                    summary: '负责王都秘密联络的情报组织。',
                    fields: {
                        subtype: 'intelligence',
                        baseCity: '王都',
                        status: 'active',
                    },
                },
            ],
            cities: [],
            nations: [],
            locations: [],
        },
        worldProfileDetection: {
            primaryProfile: 'fantasy_magic',
            secondaryProfiles: ['political_intrigue'],
            confidence: 0.88,
            reasonCodes: ['core_extract'],
        },
        worldBase: [],
        relationships: [],
        memoryRecords: [],
    };
}

function coldStartCoreSample(): Record<string, unknown> {
    return {
        schemaVersion: '1.0.0',
        identity: {
            actorKey: 'char_erin',
            displayName: '艾琳',
            aliases: ['小艾'],
            identityFacts: ['王都情报员'],
            originFacts: ['来自北境边区'],
            traits: ['冷静', '多疑'],
        },
        actorCards: [],
        entityCards: { organizations: [], cities: [], nations: [], locations: [] },
        worldProfileDetection: {
            primaryProfile: 'fantasy_magic',
            secondaryProfiles: ['political_intrigue'],
            confidence: 0.81,
            reasonCodes: ['core_extract'],
        },
        worldBase: [],
        relationships: [],
        memoryRecords: [],
    };
}

function coldStartStateSample(): Record<string, unknown> {
    return {
        schemaVersion: '1.0.0',
        identity: {
            actorKey: 'char_erin',
            displayName: '艾琳',
            aliases: [],
            identityFacts: [],
            originFacts: [],
            traits: [],
        },
        actorCards: [],
        entityCards: { organizations: [], cities: [], nations: [], locations: [] },
        worldBase: [],
        relationships: [
            {
                sourceActorKey: 'char_erin',
                targetActorKey: 'user',
                participants: ['char_erin', 'user'],
                relationTag: '陌生人',
                state: '艾琳对{{userDisplayName}}保持警惕，但愿意继续接触。',
                summary: '双方建立了可继续推进的初始接触。',
                trust: 0.31,
                affection: 0.12,
                tension: 0.21,
            },
        ],
        memoryRecords: [
            {
                schemaId: 'initial_state',
                title: '建立初始接触',
                summary: '艾琳与{{userDisplayName}}形成了谨慎但可持续推进的接触关系。',
                importance: 0.66,
            },
        ],
    };
}

function summaryPlannerSample(): Record<string, unknown> {
    return {
        should_update: true,
        focus_types: ['relationship', 'task', 'world_global_state'],
        entities: ['user', 'char_erin', 'ck:v2:task:护送密使离开王都:王都'],
        topics: ['关系推进', '任务进展', '夜禁状态变化'],
        reasons: ['当前窗口形成了稳定任务推进与关系变化。'],
    };
}

function summaryMutationSample(): Record<string, unknown> {
    return {
        schemaVersion: '1.0.0',
        window: { fromTurn: 101, toTurn: 120 },
        actions: [
            {
                action: 'UPDATE',
                targetKind: 'task',
                entityKey: 'entity:task:escort_messenger',
                compareKey: 'ck:v2:task:护送密使离开王都:王都',
                matchKeys: ['mk:task:护送密使离开王都'],
                schemaVersion: 'v2',
                patch: {
                    summary: '任务已从确认情报升级为正式撤离执行。',
                    bindings: {
                        actors: ['user', 'char_erin'],
                        organizations: ['entity:organization:night_raven'],
                        cities: ['entity:city:royal_capital'],
                    },
                    fields: {
                        objective: '护送密使离开王都',
                        status: '进行中',
                        goal: '确保密使安全离城',
                    },
                },
                reasonCodes: ['task_progressed', 'bindings_refreshed'],
                sourceContext: {
                    source: 'summary',
                    sourceLabel: '结构化回合总结',
                },
            },
            {
                action: 'NOOP',
                targetKind: 'relationship',
                reasonCodes: ['state_already_covered'],
            },
        ],
    };
}

function takeoverBaselineSample(): Record<string, unknown> {
    return {
        staticBaseline: '艾琳是谨慎冷静的情报员。',
        personaBaseline: '用户倾向直接推进剧情。',
        worldBaseline: '王都处于夜禁与边境紧张并存的状态。',
        ruleBaseline: '夜间通行受到严格审查。',
        sourceSummary: '已完成静态设定抽取。',
        generatedAt: 0,
    };
}

function takeoverActiveSample(): Record<string, unknown> {
    return {
        generatedAt: 0,
        currentScene: '双方刚刚交换完关键情报，正在决定撤离路线。',
        currentLocation: '王都北城门附近',
        currentTimeHint: '深夜',
        activeGoals: ['确认密使状态', '选择安全撤离路线'],
        activeRelations: [{ target: '艾琳', state: '谨慎合作' }],
        openThreads: ['北城门是否仍可通行'],
        recentDigest: '最近主要围绕夜禁、密使撤离与合作关系展开。',
    };
}

function takeoverBatchSample(): Record<string, unknown> {
    return {
        batchId: 'takeover:demo:history:0001',
        summary: '本批次主要确认了撤离路线、任务推进和关系升温。',
        actorCards: [
            {
                actorKey: 'char_erin',
                displayName: '艾琳',
                aliases: ['小艾'],
                identityFacts: ['王都情报员'],
                originFacts: ['来自北境边区'],
                traits: ['冷静', '多疑'],
            },
        ],
        relationships: [
            {
                sourceActorKey: 'user',
                targetActorKey: 'char_erin',
                participants: ['user', 'char_erin'],
                relationTag: '朋友',
                state: '{{userDisplayName}}与艾琳已经形成谨慎但有效的合作关系。',
                summary: '双方建立了可持续推进的合作信任。',
                trust: 0.72,
                affection: 0.38,
                tension: 0.17,
            },
        ],
        entityCards: [
            {
                entityType: 'organization',
                entityKey: 'entity:organization:night_raven',
                compareKey: 'ck:v2:organization:夜鸦组:王都',
                matchKeys: ['mk:organization:夜鸦组'],
                schemaVersion: 'v2',
                canonicalName: '夜鸦组',
                title: '夜鸦组',
                aliases: [],
                summary: '艾琳所属的情报组织。',
                fields: {
                    subtype: 'intelligence',
                    baseCity: '王都',
                    status: 'active',
                },
                confidence: 0.88,
                bindings: {
                    actors: ['char_erin'],
                    organizations: [],
                    cities: ['entity:city:royal_capital'],
                    locations: [],
                    nations: [],
                    tasks: ['entity:task:escort_messenger'],
                    events: [],
                },
                reasonCodes: ['organization_referenced_repeatedly'],
            },
        ],
        entityTransitions: [],
        stableFacts: [
            {
                type: 'event',
                subject: '艾琳',
                predicate: '确认',
                value: '北城门是当前最可行的撤离路线',
                confidence: 0.86,
                title: '确认北城门撤离路线',
                summary: '艾琳确认北城门是当前阶段最可行的撤离路线。',
                entityKey: 'entity:event:north_gate_route',
                compareKey: 'ck:v2:event:确认北城门撤离路线:王都',
                matchKeys: ['mk:event:确认北城门撤离路线'],
                schemaVersion: 'v2',
                canonicalName: '确认北城门撤离路线',
                bindings: {
                    actors: ['char_erin', 'user'],
                    organizations: ['entity:organization:night_raven'],
                    cities: ['entity:city:royal_capital'],
                    locations: ['entity:location:north_gate'],
                    nations: [],
                    tasks: ['entity:task:escort_messenger'],
                    events: [],
                },
                status: 'active',
                importance: 0.82,
                reasonCodes: ['event_bindings_confirmed'],
            },
        ],
        relationTransitions: [
            {
                target: 'char_erin',
                from: '陌生试探',
                to: '谨慎合作',
                reason: '双方确认共同目标并共同承担风险。',
                relationTag: '朋友',
                targetType: 'actor',
                bindings: {
                    actors: ['user', 'char_erin'],
                    organizations: [],
                    cities: ['entity:city:royal_capital'],
                    locations: ['entity:location:north_gate'],
                    nations: [],
                    tasks: ['entity:task:escort_messenger'],
                    events: ['entity:event:north_gate_route'],
                },
                reasonCodes: ['relationship_progressed'],
            },
        ],
        taskTransitions: [
            {
                task: '护送密使离开王都',
                from: '未开始',
                to: '进行中',
                title: '护送密使离开王都',
                summary: '双方已经从确认情报进入正式撤离执行。',
                description: '当前重点是确保密使安全通过北城门。',
                goal: '确保密使安全离城',
                status: '进行中',
                entityKey: 'entity:task:escort_messenger',
                compareKey: 'ck:v2:task:护送密使离开王都:王都',
                matchKeys: ['mk:task:护送密使离开王都'],
                schemaVersion: 'v2',
                canonicalName: '护送密使离开王都',
                bindings: {
                    actors: ['user', 'char_erin'],
                    organizations: ['entity:organization:night_raven'],
                    cities: ['entity:city:royal_capital'],
                    locations: ['entity:location:north_gate'],
                    nations: [],
                    tasks: [],
                    events: [],
                },
                reasonCodes: ['task_update_preferred'],
            },
        ],
        worldStateChanges: [
            {
                key: '王都夜禁',
                value: '持续执行中',
                summary: '夜禁仍然有效，直接影响撤离路径选择。',
                bindings: {
                    actors: ['user', 'char_erin'],
                    organizations: ['entity:organization:night_raven'],
                    cities: ['entity:city:royal_capital'],
                    locations: ['entity:location:north_gate'],
                    nations: [],
                    tasks: ['entity:task:escort_messenger'],
                    events: ['entity:event:north_gate_route'],
                },
                entityKey: 'entity:world_state:royal_capital_curfew',
                compareKey: 'ck:v2:world_global_state:王都夜禁:global',
                matchKeys: ['mk:world_global_state:王都夜禁'],
                schemaVersion: 'v2',
                canonicalName: '王都夜禁',
                reasonCodes: ['world_state_confirmed'],
            },
        ],
        openThreads: ['北城门是否会临时关闭仍未确认'],
        chapterTags: ['关系推进', '任务开启', '夜禁影响'],
        sourceRange: { startFloor: 1, endFloor: 30 },
    };
}

function takeoverConflictSample(): Record<string, unknown> {
    return {
        bucketId: 'takeover:entity:0001',
        domain: 'entity',
        resolutions: [
            {
                action: 'merge',
                primaryKey: 'entity:organization:night_raven',
                secondaryKeys: ['entity:organization:night_raven_alias'],
                fieldOverrides: {},
                reasonCodes: ['llm_conflict_merge'],
            },
        ],
    };
}

function takeoverConflictBatchSchema(): Record<string, unknown> {
    return {
        type: 'object',
        required: ['domain', 'conflictType', 'buckets', 'patches'],
        properties: {
            domain: { type: 'string' },
            conflictType: { type: 'string' },
            buckets: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['bucketId', 'domain', 'conflictType', 'records'],
                    properties: {
                        bucketId: { type: 'string' },
                        domain: { type: 'string' },
                        conflictType: { type: 'string' },
                        records: { type: 'array', items: { type: 'object', additionalProperties: true } },
                    },
                },
            },
            patches: {
                type: 'array',
                items: takeoverConflictSchema(),
            },
        },
    };
}

function takeoverConflictBatchSample(): Record<string, unknown> {
    return {
        domain: 'relationship',
        conflictType: 'state_divergence',
        buckets: [
            {
                bucketId: 'relationship/state_divergence/user_char_erin',
                domain: 'relationship',
                conflictType: 'state_divergence',
                records: [
                    {
                        sourceActorKey: 'user',
                        targetActorKey: 'char_erin',
                        participants: ['user', 'char_erin'],
                        relationTag: '朋友',
                        state: '双方已建立谨慎合作。',
                        summary: '形成了可继续推进的合作关系。',
                    },
                ],
            },
        ],
        patches: [
            {
                bucketId: 'relationship/state_divergence/user_char_erin',
                domain: 'relationship',
                resolutions: [
                    {
                        action: 'merge',
                        primaryKey: 'relationship:user:char_erin:朋友',
                        secondaryKeys: [],
                        fieldOverrides: {},
                        reasonCodes: ['llm_conflict_merge'],
                    },
                ],
            },
        ],
    };
}
