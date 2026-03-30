/**
 * 功能：Prompt Pack 支持的分段名称。
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
    | 'TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE';

/**
 * 功能：Prompt Pack 解析后的结构。
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
}

const PROMPT_PACK_URL = new URL('./prompt-pack.md', import.meta.url).toString();

const REQUIRED_SECTIONS: PromptPackSectionName[] = [
    'COLD_START_SYSTEM',
    'COLD_START_SCHEMA',
    'COLD_START_OUTPUT_SAMPLE',
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
];

const ALL_SECTION_NAMES: PromptPackSectionName[] = [
    ...REQUIRED_SECTIONS,
    'COLD_START_CORE_SYSTEM',
    'COLD_START_CORE_SCHEMA',
    'COLD_START_CORE_OUTPUT_SAMPLE',
    'COLD_START_STATE_SYSTEM',
    'COLD_START_STATE_SCHEMA',
    'COLD_START_STATE_OUTPUT_SAMPLE',
    'TAKEOVER_CONFLICT_RESOLUTION_SCHEMA',
    'TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE',
];

const COLD_START_COMMON_RULES: string[] = [
    '这不是自由创作任务，而是结构化抽取任务。只保留长期稳定、可复用、适合进入记忆系统的内容。',
    '语义输出字段面向用户可读；结构化字段面向稳定归并和调试，请优先保持稳定可复用。',
    '如果角色属于组织、组织位于城市、地点从属于城市或国家，请在 entityCards.fields 中显式写出稳定绑定线索。',
    '不要为了补满字段编造人物、组织、地点或关系；不确定时保持保守，不要写假设。',
];

const SUMMARY_COMMON_RULES: string[] = [
    '这是 summary mutation 任务，只输出真正需要变更的 sparse patch，不要重写整份旧状态。',
    '任务对象要尽量补齐稳定标题、摘要、goal、status 与 bindings，不要只给模糊标签。',
    '如果对象之间存在稳定关系，请在 payload.bindings 中输出 actors、organizations、cities、locations、nations、tasks、events。',
    '不确定是否同一对象时，优先 NOOP、UPDATE 或 MERGE，不要为了看起来完整而重复 ADD。',
];

const TAKEOVER_BATCH_COMMON_RULES: string[] = [
    '当前批次不是从零抽取，必须优先参考 knownContext、knownEntities、已有 compareKey 与稳定对象键。',
    '命中同一对象时优先 UPDATE；只有明确出现全新对象时才 ADD；无法确认是否同一对象时，不要盲目新建，优先输出保守更新或待确认线索。',
    'compareKey、stable key、canonical target 的稳定性高于表面名称；不要因为别名、视角说明或措辞变化而拆出新对象。',
    '任务对象必须尽量补齐 title、summary、description、goal、status、compareKey 与 bindings。标题优先级是：明确任务名 > 稳定动作模板 > 兜底标题。',
    '如果角色属于组织、组织位于城市、任务发生在地点、事件影响角色、组织、城市或地点，请在 bindings 中显式输出，不要只抽对象不抽边。',
    '语义字段面向用户可读，调试字段 compareKey、reasonCodes、bindings、targetType 面向稳定归并与排查。',
    '不要为了补满字段编造关系、组织从属、地点归属或长期属性；临时状态不要误写成长期实体属性。',
];

const FALLBACK_PROMPT_PACK = `
<!-- section: COLD_START_SYSTEM -->
你正在执行结构化记忆冷启动抽取任务。系统已经预置固定的用户角色卡，\`actorKey\` 固定为 \`user\`；如果关系对象是当前用户，只需要在 \`relationships\` 中引用 \`user\`，不要在 \`actorCards\` 中重复输出用户角色卡。所有自然语言字段必须使用简体中文。只输出 JSON。
<!-- section: COLD_START_SCHEMA -->
{"type":"object"}
<!-- section: COLD_START_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","identity":{"actorKey":"char_demo","displayName":"示例角色","aliases":[],"identityFacts":["示例身份"],"originFacts":["示例来源"],"traits":["示例特征"]},"actorCards":[{"actorKey":"guard_captain","displayName":"守卫队长","aliases":[],"identityFacts":["负责夜间巡逻"],"originFacts":["长期驻守城门"],"traits":["警觉","强硬"]}],"worldBase":[],"relationships":[{"sourceActorKey":"char_demo","targetActorKey":"user","participants":["char_demo","user"],"relationTag":"陌生人","state":"示例角色对{{userDisplayName}}保持谨慎关注。","summary":"示例角色与{{userDisplayName}}之间形成了谨慎而持续的观察关系。","trust":0.35,"affection":0.2,"tension":0.15}],"memoryRecords":[]}
<!-- section: COLD_START_CORE_SYSTEM -->
你正在执行结构化记忆冷启动的 Core Extract 阶段。只提取 identity、actorCards、entityCards、worldProfileDetection 和 worldBase。relationships 和 memoryRecords 必须返回空集合。只输出 JSON。
<!-- section: COLD_START_CORE_SCHEMA -->
{"type":"object"}
<!-- section: COLD_START_CORE_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","identity":{"actorKey":"char_demo","displayName":"示例角色","aliases":[],"identityFacts":["示例身份"],"originFacts":["示例来源"],"traits":["示例特征"]},"actorCards":[{"actorKey":"guard_captain","displayName":"守卫队长","aliases":[],"identityFacts":["负责夜间巡逻"],"originFacts":["长期驻守城门"],"traits":["警觉","强硬"]}],"entityCards":{"organizations":[],"cities":[],"nations":[],"locations":[]},"worldProfileDetection":{"primaryProfile":"fantasy","secondaryProfiles":["political_intrigue"],"confidence":0.8,"reasonCodes":["core_extract"]},"worldBase":[],"relationships":[],"memoryRecords":[]}
<!-- section: COLD_START_STATE_SYSTEM -->
你正在执行结构化记忆冷启动的 State Extract 阶段。只提取 relationships、memoryRecords 和近期状态线索；identity、actorCards、entityCards、worldBase 如果没有新增内容，可以返回空集合。只输出 JSON。
<!-- section: COLD_START_STATE_SCHEMA -->
{"type":"object"}
<!-- section: COLD_START_STATE_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","identity":{"actorKey":"char_demo","displayName":"示例角色","aliases":[],"identityFacts":[],"originFacts":[],"traits":[]},"actorCards":[],"entityCards":{"organizations":[],"cities":[],"nations":[],"locations":[]},"worldBase":[],"relationships":[{"sourceActorKey":"char_demo","targetActorKey":"user","participants":["char_demo","user"],"relationTag":"陌生人","state":"当前保持谨慎接触与试探。","summary":"双方已经建立初步接触。","trust":0.35,"affection":0.2,"tension":0.15}],"memoryRecords":[{"schemaId":"initial_state","title":"北门夜间戒严","summary":"王都北门夜间正在执行戒严排查。","importance":0.66}]}
<!-- section: SUMMARY_PLANNER_SYSTEM -->
你正在执行结构化记忆 summary planner 阶段。你的职责不是直接修改记忆，而是判断当前窗口是否值得更新长期记忆，并给出后续 mutation 的聚焦方向。若当前窗口只是闲聊、没有稳定新事实，或已有记忆足以覆盖，则应返回 should_update=false。只输出 JSON。
<!-- section: SUMMARY_PLANNER_SCHEMA -->
{"type":"object"}
<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->
{"should_update":true,"focus_types":["relationship","initial_state"],"entities":["user","char_demo"],"topics":["关系变化","地点切换"],"reasons":["本区间出现了持续关系变化","当前地点状态发生明确变化"]}
<!-- section: SUMMARY_SYSTEM -->
你正在执行结构化记忆 summary mutation 任务。只输出真正需要写入的增量结构；如果 action 需要新增或更新 relationship 的 fields.relationTag，则 relationTag 只能从预设关系标签中选择。只输出 JSON。
<!-- section: SUMMARY_SCHEMA -->
{"type":"object"}
<!-- section: SUMMARY_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","actions":[]}
<!-- section: TAKEOVER_BASELINE_SYSTEM -->
你正在执行旧聊天接管的静态基线抽取任务。你会收到角色卡、语义设定、用户资料与总楼层数。请只提取长期稳定、适合作为接管起点的信息。所有自然语言字段必须使用简体中文。只输出 JSON。
<!-- section: TAKEOVER_BASELINE_SCHEMA -->
{"type":"object"}
<!-- section: TAKEOVER_BASELINE_OUTPUT_SAMPLE -->
{"staticBaseline":"当前角色是谨慎冷静的情报人员。","personaBaseline":"用户倾向直接推进剧情。","worldBaseline":"当前世界存在稳定的王都与边境对立格局。","ruleBaseline":"角色行为受到夜间戒严与身份保密规则约束。","sourceSummary":"已完成角色卡、语义设定与用户资料的静态抽取。","generatedAt":0}
<!-- section: TAKEOVER_ACTIVE_SYSTEM -->
你正在执行旧聊天接管的最近活跃快照任务。你会收到最近楼层范围与消息列表。请输出当前场景、地点、时间线索、活跃目标、活跃关系、未结线索与最近摘要。所有自然语言字段必须使用简体中文。只输出 JSON。
<!-- section: TAKEOVER_ACTIVE_SCHEMA -->
{"type":"object"}
<!-- section: TAKEOVER_ACTIVE_OUTPUT_SAMPLE -->
{"generatedAt":0,"currentScene":"双方刚完成一轮关键信息交换，局势仍在推进。","currentLocation":"王都北门附近的临时驻点","currentTimeHint":"深夜","activeGoals":["确认情报来源","判断下一步是否同行"],"activeRelations":[{"target":"巡逻队长","state":"仍保持谨慎合作"}],"openThreads":["巡逻队长是否愿意继续提供通行帮助"],"recentDigest":"最近几层主要围绕通行条件、身份试探与下一步行动选择展开。"}
<!-- section: TAKEOVER_BATCH_SYSTEM -->
你正在执行旧聊天接管的历史批次分析任务。你会收到批次编号、批次范围、批次分类、消息列表、knownContext 与 knownEntities。请输出章节摘要、稳定事实、关系变化、任务变化、世界状态变化、未结线索、章节标签和来源范围。所有自然语言字段必须使用简体中文。只输出 JSON。
<!-- section: TAKEOVER_BATCH_SCHEMA -->
{"type":"object"}
<!-- section: TAKEOVER_BATCH_OUTPUT_SAMPLE -->
{"batchId":"takeover:demo:history:0001","summary":"这一段历史主要建立了角色互信的初始框架，并首次明确了共同目标。","stableFacts":[{"type":"identity","subject":"巡逻队长","predicate":"身份","value":"负责北门夜巡","confidence":0.86}],"relationTransitions":[{"target":"巡逻队长","from":"陌生试探","to":"有限合作","reason":"双方达成了短期协作共识"}],"taskTransitions":[{"task":"寻找失踪信使","title":"寻找失踪信使","summary":"确认失踪信使的下落并决定是否追查。","description":"角色开始围绕失踪信使展开调查。","goal":"确认信使状态并找到线索来源","status":"in_progress","compareKey":"task:寻找失踪信使","bindings":{"actors":["巡逻队长"],"organizations":[],"cities":["王都"],"locations":["北门"],"nations":[],"tasks":[],"events":[]},"reasonCodes":["task_started"],"from":"未开始","to":"进行中"}],"worldStateChanges":[{"key":"北门戒严","value":"持续执行夜间封锁","summary":"北门仍处于严格夜间戒严中。","compareKey":"world:北门戒严","reasonCodes":["state_persisted"]}],"openThreads":["失踪信使的下落仍未确认"],"chapterTags":["关系推进","任务开启"],"sourceRange":{"startFloor":1,"endFloor":30}}
<!-- section: TAKEOVER_CONFLICT_RESOLUTION_SCHEMA -->
{"type":"object","additionalProperties":false,"properties":{"bucketId":{"type":"string"},"domain":{"type":"string"},"resolutions":{"type":"array","items":{"type":"object","additionalProperties":false,"properties":{"action":{"type":"string","enum":["merge","keep_primary","replace","invalidate","split"]},"primaryKey":{"type":"string"},"secondaryKeys":{"type":"array","items":{"type":"string"}},"fieldOverrides":{"type":"object","additionalProperties":true},"reasonCodes":{"type":"array","items":{"type":"string"}}},"required":["action","primaryKey","secondaryKeys","fieldOverrides","reasonCodes"]}}},"required":["bucketId","domain","resolutions"]}
<!-- section: TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE -->
{"bucketId":"takeover:entity:0001","domain":"entity","resolutions":[{"action":"merge","primaryKey":"organization:示例教派","secondaryKeys":["organization:示例教团"],"fieldOverrides":{},"reasonCodes":["llm_conflict_merge"]}]}
`.trim();

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
 * 功能：清理 Prompt Pack 缓存，便于测试或热更新。
 */
export function clearPromptPackCache(): void {
    promptPackCache = null;
}

/**
 * 功能：执行实际的 Prompt Pack 加载流程。
 * @returns Prompt Pack 分段内容。
 */
async function loadPromptPackSectionsInternal(): Promise<PromptPackSections> {
    const raw = await readPromptPackRaw();
    const parsed = parsePromptPackSections(raw);
    if (hasAllRequiredSections(parsed)) {
        return enrichPromptPackSections(parsed as PromptPackSections);
    }
    const fallbackParsed = parsePromptPackSections(FALLBACK_PROMPT_PACK);
    return enrichPromptPackSections(fallbackParsed as PromptPackSections);
}

/**
 * 功能：读取 Prompt Pack 原始文本。
 * @returns 原始 Markdown 文本。
 */
async function readPromptPackRaw(): Promise<string> {
    if (typeof fetch !== 'function') {
        return FALLBACK_PROMPT_PACK;
    }
    try {
        const response = await fetch(PROMPT_PACK_URL, { cache: 'no-cache' });
        if (!response.ok) {
            return FALLBACK_PROMPT_PACK;
        }
        const text = await response.text();
        return text.trim() || FALLBACK_PROMPT_PACK;
    } catch {
        return FALLBACK_PROMPT_PACK;
    }
}

/**
 * 功能：按 section 注释解析 Prompt Pack。
 * @param raw Prompt Pack 原文。
 * @returns 解析得到的分段。
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
        if (!ALL_SECTION_NAMES.includes(sectionName)) {
            continue;
        }
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
 * 功能：校验 Prompt Pack 是否包含全部必需分段。
 * @param sections 已解析分段。
 * @returns 是否完整。
 */
function hasAllRequiredSections(sections: Partial<PromptPackSections>): sections is PromptPackSections {
    return REQUIRED_SECTIONS.every((name: PromptPackSectionName): boolean => {
        return typeof sections[name] === 'string' && String(sections[name]).trim().length > 0;
    });
}

/**
 * 功能：统一增强 Prompt Pack 中与批次继承、调试字段和用户称呼相关的规则。
 * @param sections 原始分段。
 * @returns 增强后的分段。
 */
function enrichPromptPackSections(sections: PromptPackSections): PromptPackSections {
    const coldStartCoreSystem = sections.COLD_START_CORE_SYSTEM || appendPromptRule(
        sections.COLD_START_SYSTEM,
        '这是冷启动 Core Extract 阶段，只输出 identity、actorCards、entityCards、worldProfileDetection、worldBase，relationships 与 memoryRecords 返回空集合。',
    );
    const coldStartStateSystem = sections.COLD_START_STATE_SYSTEM || appendPromptRule(
        sections.COLD_START_SYSTEM,
        '这是冷启动 State Extract 阶段，只输出 relationships、memoryRecords 与近期状态线索，其余字段如无新增可返回空集合。',
    );
    const coldStartCoreSchema = sections.COLD_START_CORE_SCHEMA || sections.COLD_START_SCHEMA;
    const coldStartStateSchema = sections.COLD_START_STATE_SCHEMA || sections.COLD_START_SCHEMA;
    const coldStartCoreSample = sections.COLD_START_CORE_OUTPUT_SAMPLE || sections.COLD_START_OUTPUT_SAMPLE;
    const coldStartStateSample = sections.COLD_START_STATE_OUTPUT_SAMPLE || sections.COLD_START_OUTPUT_SAMPLE;
    const takeoverConflictSchema = sections.TAKEOVER_CONFLICT_RESOLUTION_SCHEMA || JSON.stringify(buildTakeoverConflictResolutionSchema());
    const takeoverConflictSample = sections.TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE || JSON.stringify(buildTakeoverConflictResolutionSample());

    return {
        ...sections,
        COLD_START_CORE_SYSTEM: appendPromptRules(coldStartCoreSystem, COLD_START_COMMON_RULES),
        COLD_START_CORE_SCHEMA: coldStartCoreSchema,
        COLD_START_CORE_OUTPUT_SAMPLE: coldStartCoreSample,
        COLD_START_STATE_SYSTEM: appendPromptRules(coldStartStateSystem, COLD_START_COMMON_RULES),
        COLD_START_STATE_SCHEMA: coldStartStateSchema,
        COLD_START_STATE_OUTPUT_SAMPLE: coldStartStateSample,
        TAKEOVER_CONFLICT_RESOLUTION_SCHEMA: takeoverConflictSchema,
        TAKEOVER_CONFLICT_RESOLUTION_OUTPUT_SAMPLE: takeoverConflictSample,
        COLD_START_SYSTEM: appendPromptRules(appendPromptRule(
            sections.COLD_START_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，所有自然语言字段都应优先使用该称呼，不要写成“用户”或“主角”；结构化锚点继续使用 `user`。',
        ), COLD_START_COMMON_RULES),
        SUMMARY_PLANNER_SYSTEM: appendPromptRules(appendPromptRule(
            sections.SUMMARY_PLANNER_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，reasons、topics 及其他自然语言字段都应优先使用该称呼，不要写成“用户”或“主角”；结构化锚点继续使用 `user`。',
        ), SUMMARY_COMMON_RULES),
        SUMMARY_SYSTEM: appendPromptRules(appendPromptRule(
            sections.SUMMARY_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，title、summary、detail、state 及其他自然语言字段都应优先使用该称呼，不要写成“用户”或“主角”；结构化锚点继续使用 `user`。',
        ), SUMMARY_COMMON_RULES),
        TAKEOVER_BATCH_SYSTEM: appendPromptRules(appendPromptRule(
            sections.TAKEOVER_BATCH_SYSTEM,
            '如果已知当前用户自然语言称呼为 `{{userDisplayName}}`，自然语言描述请优先使用该称呼；结构化 target、actorKey、participants 仍继续使用 `user` 作为稳定锚点。',
        ), TAKEOVER_BATCH_COMMON_RULES),
        COLD_START_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.COLD_START_OUTPUT_SAMPLE),
        SUMMARY_PLANNER_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.SUMMARY_PLANNER_OUTPUT_SAMPLE),
        SUMMARY_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.SUMMARY_OUTPUT_SAMPLE),
        TAKEOVER_BASELINE_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.TAKEOVER_BASELINE_OUTPUT_SAMPLE),
        TAKEOVER_ACTIVE_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.TAKEOVER_ACTIVE_OUTPUT_SAMPLE),
        TAKEOVER_BATCH_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.TAKEOVER_BATCH_OUTPUT_SAMPLE),
    };
}

/**
 * 功能：构建旧聊天接管冲突裁决 schema。
 * @returns schema 对象。
 */
function buildTakeoverConflictResolutionSchema(): Record<string, unknown> {
    return {
        type: 'object',
        additionalProperties: false,
        properties: {
            bucketId: { type: 'string' },
            domain: { type: 'string' },
            resolutions: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        action: { type: 'string', enum: ['merge', 'keep_primary', 'replace', 'invalidate', 'split'] },
                        primaryKey: { type: 'string' },
                        secondaryKeys: { type: 'array', items: { type: 'string' } },
                        fieldOverrides: { type: 'object', additionalProperties: true },
                        reasonCodes: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['action', 'primaryKey', 'secondaryKeys', 'fieldOverrides', 'reasonCodes'],
                },
            },
        },
        required: ['bucketId', 'domain', 'resolutions'],
    };
}

/**
 * 功能：构建旧聊天接管冲突裁决示例。
 * @returns 示例对象。
 */
function buildTakeoverConflictResolutionSample(): Record<string, unknown> {
    return {
        bucketId: 'takeover:entity:0001',
        domain: 'entity',
        resolutions: [
            {
                action: 'merge',
                primaryKey: 'organization:示例教派',
                secondaryKeys: ['organization:示例教团'],
                fieldOverrides: {},
                reasonCodes: ['llm_conflict_merge'],
            },
        ],
    };
}

/**
 * 功能：在提示词尾部追加单条规则说明。
 * @param source 原始提示词。
 * @param rule 追加规则。
 * @returns 处理后的提示词。
 */
function appendPromptRule(source: string, rule: string): string {
    const normalized = String(source ?? '').trim();
    if (!normalized || normalized.includes(rule)) {
        return normalized;
    }
    return `${normalized}\n${rule}`;
}

/**
 * 功能：批量向提示词追加规则说明。
 * @param source 原始提示词。
 * @param rules 规则列表。
 * @returns 处理后的提示词。
 */
function appendPromptRules(source: string, rules: string[]): string {
    return rules.reduce((current: string, rule: string): string => appendPromptRule(current, rule), String(source ?? '').trim());
}

/**
 * 功能：替换示例中的固定“用户”“主角”称呼为模板变量。
 * @param source 原始示例文本。
 * @returns 处理后的示例文本。
 */
function replacePromptSampleUserNarrative(source: string): string {
    return String(source ?? '')
        .replace(/对用户/g, '对{{userDisplayName}}')
        .replace(/与用户/g, '与{{userDisplayName}}')
        .replace(/用户之间/g, '{{userDisplayName}}之间')
        .replace(/主角/g, '{{userDisplayName}}')
        .replace(/用户/g, '{{userDisplayName}}');
}
