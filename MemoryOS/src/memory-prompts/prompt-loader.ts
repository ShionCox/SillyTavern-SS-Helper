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
    | 'MEMORY_EXTRACTION_POLICY'
    | 'ROLEPLAY_MEMORY_POLICY'
    | 'SOURCE_TRUST_POLICY'
    | 'MEMORY_ACTION_POLICY'
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
    MEMORY_EXTRACTION_POLICY: string;
    ROLEPLAY_MEMORY_POLICY: string;
    SOURCE_TRUST_POLICY: string;
    MEMORY_ACTION_POLICY: string;
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
    'MEMORY_EXTRACTION_POLICY',
    'ROLEPLAY_MEMORY_POLICY',
    'SOURCE_TRUST_POLICY',
    'MEMORY_ACTION_POLICY',
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
    'ADD 使用 newRecord，UPDATE、MERGE、INVALIDATE 使用 patch，DELETE 和 NOOP 不要输出 payload、patch、newRecord。',
    'compareKey 采用 ck:v2 协议；entityKey 是内部稳定键，compareKey 是跨流程比对键，matchKeys 仅用于模糊候选。',
    'actorKey 只能使用 user 或 actor_*，禁止输出 char_*、ck:*、ek:* 或任何临时引用。',
    '不要输出 targetKind=actor_profile；关系变化必须使用 targetKind=relationship，并提供 sourceActorKey、targetActorKey、relationTag 写入关系主表。',
    '无法确认同一对象时优先 NOOP、UPDATE 或 MERGE，不要因名字变化盲目 ADD。',
    'reasonCodes、candidateId、compareKey、matchKeys 不是每个动作都必须出现，只有确认时才填写。',
];

const TAKEOVER_COMMON_RULES: string[] = [
    '优先复用 knownContext、knownEntities、已有 entityKey 与 compareKey，不要因别名或描述变化创建重复对象。',
    'compareKey 采用 ck:v2 协议；relationships 必须保留 sourceActorKey、targetActorKey、relationTag 的结构语义。',
    'entityKey 是内部稳定主键；compareKey 用于跨流程归并；matchKeys 只做候选召回，不参与唯一判定。',
    '所有 actorKey 只能使用 user 或 actor_*，禁止输出 char_*、ck:*、ek:* 或其他协议式引用。',
    'actorCards 对应 actor_memory_profiles 主表，relationships 对应 memory_relationships 主表，不会写入 memory_entries。',
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
    const plannerPolicyPrompt = joinPromptBlocks([
        sections.MEMORY_EXTRACTION_POLICY,
        sections.ROLEPLAY_MEMORY_POLICY,
        sections.SOURCE_TRUST_POLICY,
        sections.SUMMARY_PLANNER_SYSTEM,
    ]);
    const summaryPolicyPrompt = joinPromptBlocks([
        sections.MEMORY_EXTRACTION_POLICY,
        sections.ROLEPLAY_MEMORY_POLICY,
        sections.SOURCE_TRUST_POLICY,
        sections.MEMORY_ACTION_POLICY,
        sections.SUMMARY_SYSTEM,
    ]);
    return {
        ...sections,
        SUMMARY_PLANNER_SYSTEM: plannerPolicyPrompt,
        SUMMARY_SYSTEM: appendPromptRules(summaryPolicyPrompt, SUMMARY_COMMON_RULES),
        TAKEOVER_BATCH_SYSTEM: appendPromptRules(sections.TAKEOVER_BATCH_SYSTEM, TAKEOVER_COMMON_RULES),
    };
}

/**
 * 功能：拼接多个提示词块，并去掉空块。
 * @param blocks 提示词块列表。
 * @returns 拼接后的提示词。
 */
function joinPromptBlocks(blocks: string[]): string {
    return blocks
        .map((block: string): string => String(block ?? '').trim())
        .filter(Boolean)
        .join('\n\n');
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
- 用户锚点固定为 \`user\`，所有自然语言字段中凡是指代主角/玩家/当前用户，一律使用 \`{{user}}\`。
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
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 \`{{user}}\`，不要展开为真实名字。
只输出 JSON。
        `),
        section('COLD_START_CORE_SCHEMA', fencedJson(baseColdStartSchema())),
        section('COLD_START_CORE_OUTPUT_SAMPLE', fencedJson(coldStartCoreSample())),
        section('COLD_START_STATE_SYSTEM', `
你正在执行冷启动 State Extract 阶段。
只关注 relationships、memoryRecords 和近期稳定状态线索。
identity、actorCards、entityCards、worldBase 没有新增时可返回空集合。
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 \`{{user}}\`，不要展开为真实名字。
只输出 JSON。
        `),
        section('COLD_START_STATE_SCHEMA', fencedJson(baseColdStartStateSchema())),
        section('COLD_START_STATE_OUTPUT_SAMPLE', fencedJson(coldStartStateSample())),
        section('MEMORY_EXTRACTION_POLICY', `
你是 MemoryOS 的记忆提炼器，不是普通摘要器。
你的目标不是复述聊天内容，而是判断哪些信息值得进入长期记忆系统，并将它们提炼成稳定、可复用、可检索、可更新的结构化记忆。
- 只保留长期有用的信息：稳定身份、人物设定、关系变化、任务进展、世界规则、地点组织、重要事件、未解悬念、用户或主角偏好。
- 不保留普通寒暄、临时语气、重复确认、无后续价值的吐槽、纯格式说明、系统提示、工具日志。
- 记忆必须是可复用事实，不是聊天摘要；优先提炼变化，而不是重复旧状态。
- 每条记忆尽量包含主体、变化、依据、时间和置信度。
- 记忆语言应像故事设定集、角色小传、事件档案或悬念记录，不要写成系统日志、分析报告或处理说明。
- 所有自然语言字段中，凡是指代主角、玩家或当前用户，一律使用 \`{{user}}\`。
- 人物、组织、地点、任务、事件必须分清类别，地点名、组织名、任务名不得误写成人物。
- 记忆提炼必须克制，宁可少写，也不要写入不稳定、无依据、重复或过度推断的内容。
        `),
        section('ROLEPLAY_MEMORY_POLICY', `
针对角色扮演、小说式互动、长篇剧情，请优先提炼角色身份、关系状态、任务目标、世界地点、事件档案和开放悬念。
- 关系记忆要体现变化，不要只写“他们进行了交流”。
- 任务推进要记录 from/to 或阶段变化，不要只写“任务继续”。
- 地点和组织不要误写成人物。
- 禁止写入气氛描写本身、无后果的临时动作、模型自言自语、系统提示、格式说明、未来剧情纯猜测。
- 玩家或用户的真实身份信息不得写入，除非是在故事设定内明确给出的角色信息，并且自然语言字段仍使用 \`{{user}}\`。
        `),
        section('SOURCE_TRUST_POLICY', `
你必须根据来源判断信息是否可写入正式记忆。
可作为正式抽取来源：story_dialogue、story_narrative、user_story_instruction、stable_worldbook。
只能作为弱候选来源：assistant_summary、meta_discussion、future_plan、analysis_note。
禁止作为正式抽取来源：system prompt、developer instruction、tool artifact、error log、debug output、JSON schema 示例、代码、<think>、reasoning、隐藏推理、模型自我说明、插件内部状态、用户对插件或提示词格式的调试要求。
如果同一事实只出现在弱候选来源中，不要直接 ADD；可输出低置信 open_thread 或 NOOP，除非后续故事正文明确确认。
        `),
        section('MEMORY_ACTION_POLICY', `
在生成 actions 时，必须根据新信息与已有记忆的关系选择动作：
- ADD：当前窗口出现新的稳定对象、事件、任务、关系或世界状态，且现有记忆中没有等价内容。
- UPDATE：当前窗口补充了已有对象的新状态、新细节或新阶段，更新后保留仍然有效的旧信息。
- MERGE：当前窗口或已有记忆中存在多个疑似同一对象，名称、别名、地点、参与者或目标高度重合。
- INVALIDATE：当前窗口明确推翻、废止或纠正旧记忆，旧记忆不应再被直接召回。
- DELETE：仅用于明显错误、无意义、系统污染或重复垃圾记忆；剧情变化优先 INVALIDATE 或 UPDATE。
- NOOP：信息已被现有记忆完整覆盖，或当前窗口没有长期价值，或无法确认事实稳定性与来源可靠性。
每条 action 必须有明确 reasonCodes；不要为了凑数量输出 actions。
        `),
        section('SUMMARY_PLANNER_SYSTEM', `
你正在执行 MemoryOS summary planner。
你的职责不是总结聊天，而是判断当前窗口是否产生了值得进入长期记忆系统的稳定变化，并给出后续 mutation 的聚焦方向。
请判断窗口是否有长期记忆价值、变化类型以及是否可能重复。
应更新的情况：新的稳定人物、组织、地点、任务、事件、世界规则；关系明显变化；任务推进、失败、转向、完成；世界、地点、阵营状态变化；未来仍需追踪的悬念、承诺、约定、目标。
不应更新的情况：普通闲聊、气氛描写、重复确认、无新事实的过渡对话、复述旧设定、格式调试、系统说明、模型解释、工具日志。
focus_types 只能使用 identity、relationship、task、event、world_global_state、location、organization、open_thread、no_update。
- 所有自然语言字段中，凡是指代主角、玩家或当前用户，一律使用 \`{{user}}\`。
- 不要输出 Markdown。
只输出 JSON。
        `),
        section('SUMMARY_PLANNER_SCHEMA', fencedJson(summaryPlannerSchema())),
        section('SUMMARY_PLANNER_OUTPUT_SAMPLE', fencedJson(summaryPlannerSample())),
        section('SUMMARY_SYSTEM', `
你正在执行 MemoryOS summary mutation。
你不是普通摘要器。你的任务是根据当前窗口、已有记忆和 planner 结果，输出真正需要落库的稀疏 mutation。
- ADD 使用 newRecord。
- UPDATE、MERGE、INVALIDATE 使用 patch。
- DELETE 和 NOOP 不要输出 payload、patch、newRecord。
- compareKey 采用 ck:v2 协议；entityKey 是内部稳定键；matchKeys 只做模糊候选。
- 无法确认同一对象时优先 NOOP、UPDATE 或 MERGE，不要盲目 ADD。
- 输出长期可复用的事实、状态变化、关系变化、任务进展、世界状态、开放悬念。
- 不要输出聊天过程说明、系统分析、重复旧记忆或无依据推断。
- 每条 ADD、UPDATE、MERGE、INVALIDATE 都必须包含 sourceEvidence。
- sourceEvidence.brief 只能概括故事内依据，不要写系统分析。
- 所有自然语言字段中，凡是指代主角、玩家或当前用户，一律使用 \`{{user}}\`。
只输出 JSON。
        `),
        section('SUMMARY_SCHEMA', fencedJson(summaryMutationSchema())),
        section('SUMMARY_OUTPUT_SAMPLE', fencedJson(summaryMutationSample())),
        section('TAKEOVER_BASELINE_SYSTEM', `
你正在执行旧聊天接管的静态基线抽取任务。
提取稳定设定、人格基线、世界规则和静态背景。
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 \`{{user}}\`，不要展开为真实名字。
只输出 JSON。
        `),
        section('TAKEOVER_BASELINE_SCHEMA', fencedJson(takeoverBaselineSchema())),
        section('TAKEOVER_BASELINE_OUTPUT_SAMPLE', fencedJson(takeoverBaselineSample())),
        section('TAKEOVER_ACTIVE_SYSTEM', `
你正在执行旧聊天接管的最近活跃快照任务。
总结当前场景、地点、时间线索、活跃目标、活跃关系和未结线索。
- 所有自然语言字段中，凡是指代主角/玩家/当前用户，一律使用 \`{{user}}\`，不要展开为真实名字。
只输出 JSON。
        `),
        section('TAKEOVER_ACTIVE_SCHEMA', fencedJson(takeoverActiveSchema())),
        section('TAKEOVER_ACTIVE_OUTPUT_SAMPLE', fencedJson(takeoverActiveSample())),
        section('TAKEOVER_BATCH_SYSTEM', `
你正在执行旧聊天接管的历史批次分析任务。
请优先复用 knownContext 与 knownEntities，保持 compareKey、entityKey、bindings 的稳定性。
任务、事件、世界状态、关系必须尽量给出结构化主源，不要只给模糊摘要。
- 你输出的是故事世界内部可读的记忆文本，不是系统日志、不是批处理说明、不是分析报告。
- 所有自然语言字段中，凡是指代主角/玩家，一律使用 \`{{user}}\`。
- 禁止使用：用户、主角、你、主人公、对方、本批次、本轮、当前剧情、当前场景、当前设置地点、当前设置、首次识别到、已触发、已确认、结构化、绑定、主链、输出内容、处理结果、待补全、需要进一步确认。
- 只有 story_narrative 与 story_dialogue 可作为正式抽取主源；meta 分析、instruction、tool artifact、thought-like 文本不能直接产出正式角色与主链事实。
- 正式角色仅限于：在正文里实际出场并参与行动、对话、关系推进的人物；与 \`{{user}}\` 或其他已确认角色形成明确关系的人物；在本批因果链中起关键作用的人物。
- 只在分析说明、未来构思、summary、details、tableEdit、think 文本里出现的人物，只能视为候选线索，不得直接写入 actorCards。
- 群体词、身份 title、地点名、组织名、任务名不得误判成角色。
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
        required: ['should_update', 'focus_types', 'entities', 'topics', 'reasons', 'memory_value', 'suggested_operation_bias', 'skip_reason'],
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
                    required: ['action', 'targetKind', 'reasonCodes'],
                    properties: {
                        action: { type: 'string' },
                        targetKind: { type: 'string' },
                        entityKey: { type: 'string' },
                        compareKey: { type: 'string' },
                        matchKeys: { type: 'array', items: { type: 'string' } },
                        schemaVersion: { type: 'string' },
                        confidence: { type: 'number' },
                        memoryValue: { type: 'string' },
                        sourceEvidence: { type: 'object', additionalProperties: true },
                        timeContext: { type: 'object', additionalProperties: true },
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
            actorKey: 'actor_erin',
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
            actorKey: 'actor_erin',
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
            actorKey: 'actor_erin',
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
                sourceActorKey: 'actor_erin',
                targetActorKey: 'user',
                participants: ['actor_erin', 'user'],
                relationTag: '陌生人',
                state: '艾琳对{{user}}保持警惕，但愿意继续接触。',
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
                summary: '艾琳与{{user}}形成了谨慎但可持续推进的接触关系。',
                importance: 0.66,
            },
        ],
    };
}

function summaryPlannerSample(): Record<string, unknown> {
    return {
        should_update: true,
        focus_types: ['relationship', 'task', 'world_global_state'],
        entities: ['user', 'actor_erin', 'ck:v2:task:护送密使离开王都:王都'],
        topics: ['关系推进', '任务进展', '夜禁状态变化'],
        reasons: ['当前窗口形成了稳定任务推进与关系变化。'],
        memory_value: 'high',
        suggested_operation_bias: ['UPDATE', 'MERGE'],
        skip_reason: '',
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
                confidence: 0.84,
                memoryValue: 'high',
                sourceEvidence: {
                    type: 'story_dialogue',
                    brief: '艾琳主动把撤离路线告诉{{user}}，并允许{{user}}同行。',
                    turnRefs: [108, 109],
                },
                timeContext: {
                    mode: 'story_inferred',
                    storyTime: '撤离前夜',
                    confidence: 0.68,
                },
                patch: {
                    summary: '任务已从确认情报升级为正式撤离执行。',
                    bindings: {
                        actors: ['user', 'actor_erin'],
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
            },
        ],
        diagnostics: {
            skippedCount: 2,
            noopReasons: ['重复的撤离目标没有再次写入。'],
            possibleDuplicates: [],
            sourceWarnings: [],
        },
    };
}

function takeoverBaselineSample(): Record<string, unknown> {
    return {
        staticBaseline: '艾琳是谨慎冷静的情报员。',
        personaBaseline: '{{user}}倾向直接推进剧情。',
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
        summary: '{{user}}一行人在撤离途中进一步稳固了同行关系，任务线也因此继续向前推进。',
        actorCards: [
            {
                actorKey: 'actor_erin',
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
                targetActorKey: 'actor_erin',
                participants: ['user', 'actor_erin'],
                relationTag: '朋友',
                state: '{{user}}与艾琳已经形成谨慎但有效的合作关系。',
                summary: '两人在同行与试探中逐渐建立起可持续推进的信任。',
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
                    actors: ['actor_erin'],
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
                    actors: ['actor_erin', 'user'],
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
                target: 'actor_erin',
                from: '陌生试探',
                to: '谨慎合作',
                reason: '双方确认共同目标并共同承担风险。',
                relationTag: '朋友',
                targetType: 'actor',
                bindings: {
                    actors: ['user', 'actor_erin'],
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
                    actors: ['user', 'actor_erin'],
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
                    actors: ['user', 'actor_erin'],
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
        required: ['patches'],
        properties: {
            patches: {
                type: 'array',
                items: takeoverConflictSchema(),
            },
        },
    };
}

function takeoverConflictBatchSample(): Record<string, unknown> {
    return {
        patches: [
            {
                bucketId: 'relationship/state_divergence/user_actor_erin',
                domain: 'relationship',
                resolutions: [
                    {
                        action: 'merge',
                        primaryKey: 'relationship:user:actor_erin:朋友',
                        secondaryKeys: [],
                        fieldOverrides: {},
                        reasonCodes: ['llm_conflict_merge'],
                    },
                ],
            },
        ],
    };
}
