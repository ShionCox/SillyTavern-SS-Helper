/**
 * 功能：Prompt Pack 支持的分段名称。
 */
export type PromptPackSectionName =
    | 'COLD_START_SYSTEM'
    | 'COLD_START_SCHEMA'
    | 'COLD_START_OUTPUT_SAMPLE'
    | 'SUMMARY_PLANNER_SYSTEM'
    | 'SUMMARY_PLANNER_SCHEMA'
    | 'SUMMARY_PLANNER_OUTPUT_SAMPLE'
    | 'SUMMARY_SYSTEM'
    | 'SUMMARY_SCHEMA'
    | 'SUMMARY_OUTPUT_SAMPLE';

/**
 * 功能：Prompt Pack 解析后的结构。
 */
export interface PromptPackSections {
    COLD_START_SYSTEM: string;
    COLD_START_SCHEMA: string;
    COLD_START_OUTPUT_SAMPLE: string;
    SUMMARY_PLANNER_SYSTEM: string;
    SUMMARY_PLANNER_SCHEMA: string;
    SUMMARY_PLANNER_OUTPUT_SAMPLE: string;
    SUMMARY_SYSTEM: string;
    SUMMARY_SCHEMA: string;
    SUMMARY_OUTPUT_SAMPLE: string;
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
];

const FALLBACK_PROMPT_PACK = `
<!-- section: COLD_START_SYSTEM -->
你正在执行结构化记忆冷启动任务。系统已经预置固定的用户角色卡，actorKey 固定为 user；如果关系对象是当前用户，只需要在 relationships 中引用 user，不要在 actorCards 中重复输出 user。每条 relationships 都必须完整填写 sourceActorKey、targetActorKey、participants、relationTag、state、summary、trust、affection、tension。relationTag 只能从以下预设中单选其一：亲人、朋友、盟友、恋人、暧昧、师徒、上下级、竞争者、情敌、宿敌、陌生人。只要某个非 user 角色出现在 relationships 中，就必须在 actorCards 中提供同 actorKey 的角色卡，且 displayName 不能为空。当前用户固定使用 actorKey user，不要发明 user_xxx 或 player_xxx 变体。只输出 JSON，不输出解释文本。
<!-- section: COLD_START_SCHEMA -->
{"type":"object"}
<!-- section: COLD_START_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","identity":{"actorKey":"char_demo","displayName":"示例角色","aliases":[],"identityFacts":["示例身份"],"originFacts":["示例来源"],"traits":["示例特征"]},"actorCards":[{"actorKey":"guard_captain","displayName":"守卫队长","aliases":[],"identityFacts":["负责夜间巡逻"],"originFacts":["长期驻守城门"],"traits":["警觉","强硬"]}],"worldBase":[],"relationships":[{"sourceActorKey":"char_demo","targetActorKey":"user","participants":["char_demo","user"],"relationTag":"陌生人","state":"示例角色对用户保持谨慎关注。","summary":"示例角色与用户之间形成了谨慎而持续的观察关系。","trust":0.35,"affection":0.2,"tension":0.15}],"memoryRecords":[]}
<!-- section: SUMMARY_PLANNER_SYSTEM -->
你正在执行结构化记忆总结的 Planner 阶段。你的职责不是直接修改记忆，而是判断本轮是否值得更新长期记忆、应聚焦哪些类型、涉及哪些实体与主题，以及为什么要动这些记忆。若当前区间只是闲聊、没有稳定新事实、或已有记忆足以覆盖，则应返回 should_update=false。仅输出 JSON，不输出解释文本。
<!-- section: SUMMARY_PLANNER_SCHEMA -->
{"type":"object"}
<!-- section: SUMMARY_PLANNER_OUTPUT_SAMPLE -->
{"should_update":true,"focus_types":["relationship","initial_state"],"entities":["user","char_demo"],"topics":["关系变化","地点切换"],"reasons":["本区间出现持续关系变化","当前地点状态发生明确迁移"]}
<!-- section: SUMMARY_SYSTEM -->
你正在执行结构化记忆总结任务。若 action 需要新增或更新 relationship 的 fields.relationTag，则 relationTag 只能从以下预设中单选其一：亲人、朋友、盟友、恋人、暧昧、师徒、上下级、竞争者、情敌、宿敌、陌生人。只输出 JSON，不输出解释文本。
<!-- section: SUMMARY_SCHEMA -->
{"type":"object"}
<!-- section: SUMMARY_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0","actions":[]}
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
        if (!REQUIRED_SECTIONS.includes(sectionName)) {
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
 * 功能：统一增强 Prompt Pack 中与用户称呼相关的规则与示例。
 * @param sections 原始分段。
 * @returns 增强后的分段。
 */
function enrichPromptPackSections(sections: PromptPackSections): PromptPackSections {
    return {
        ...sections,
        COLD_START_SYSTEM: appendPromptRule(
            sections.COLD_START_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，所有自然语言字段都必须优先使用这个称呼，不要写成“用户”或“主角”；仅结构化锚点继续使用 `user`。',
        ),
        SUMMARY_PLANNER_SYSTEM: appendPromptRule(
            sections.SUMMARY_PLANNER_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，reasons、topics 及其它自然语言字段都必须优先使用这个称呼，不要写成“用户”或“主角”；仅结构化锚点继续使用 `user`。',
        ),
        SUMMARY_SYSTEM: appendPromptRule(
            sections.SUMMARY_SYSTEM,
            '已知当前用户自然语言称呼为 `{{userDisplayName}}` 时，title、summary、detail、state 及其它自然语言字段都必须优先使用这个称呼，不要写成“用户”或“主角”；仅结构化锚点继续使用 `user`。',
        ),
        COLD_START_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.COLD_START_OUTPUT_SAMPLE),
        SUMMARY_PLANNER_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.SUMMARY_PLANNER_OUTPUT_SAMPLE),
        SUMMARY_OUTPUT_SAMPLE: replacePromptSampleUserNarrative(sections.SUMMARY_OUTPUT_SAMPLE),
    };
}

/**
 * 功能：在提示词规则尾部追加新的约束说明。
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
 * 功能：替换示例中的固定“用户/主角”称呼为模板变量。
 * @param source 原始示例文本。
 * @returns 处理后的示例文本。
 */
function replacePromptSampleUserNarrative(source: string): string {
    return String(source ?? '')
        .replace(/对用户/g, '对{{userDisplayName}}')
        .replace(/与用户/g, '与{{userDisplayName}}')
        .replace(/用户之间/g, '{{userDisplayName}}之间')
        .replace(/主角/g, '{{userDisplayName}}')
        .replace(/用户(?!名)/g, '{{userDisplayName}}');
}
