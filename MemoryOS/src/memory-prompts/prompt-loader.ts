/**
 * 功能：Prompt Pack 支持的分段名称。
 */
export type PromptPackSectionName =
    | 'COLD_START_SYSTEM'
    | 'COLD_START_SCHEMA'
    | 'COLD_START_OUTPUT_SAMPLE'
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
    SUMMARY_SYSTEM: string;
    SUMMARY_SCHEMA: string;
    SUMMARY_OUTPUT_SAMPLE: string;
}

const PROMPT_PACK_URL = new URL('./prompt-pack.md', import.meta.url).toString();

const REQUIRED_SECTIONS: PromptPackSectionName[] = [
    'COLD_START_SYSTEM',
    'COLD_START_SCHEMA',
    'COLD_START_OUTPUT_SAMPLE',
    'SUMMARY_SYSTEM',
    'SUMMARY_SCHEMA',
    'SUMMARY_OUTPUT_SAMPLE',
];

const FALLBACK_PROMPT_PACK = `
<!-- section: COLD_START_SYSTEM -->
你正在执行结构化记忆冷启动任务。只输出 JSON，不输出解释文本。
<!-- section: COLD_START_SCHEMA -->
{"type":"object"}
<!-- section: COLD_START_OUTPUT_SAMPLE -->
{"schemaVersion":"1.0.0"}
<!-- section: SUMMARY_SYSTEM -->
你正在执行结构化记忆总结任务。只输出 JSON，不输出解释文本。
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
        return parsed as PromptPackSections;
    }
    const fallbackParsed = parsePromptPackSections(FALLBACK_PROMPT_PACK);
    return fallbackParsed as PromptPackSections;
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

