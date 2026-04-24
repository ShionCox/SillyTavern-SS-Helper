import type { MemoryFilterRule, MemoryFilterSettings } from './memory-filter-types';

const MEMORY_TAGS = ['game', 'story', 'main', 'roleplay', 'rp', 'narrative', 'scene', 'prose', 'content', '正文', '剧情'];
const CONTEXT_TAGS = ['summary', 'recap', 'memo', 'context', 'memory_hint', 'previous', '上文', '摘要'];
const EXCLUDED_TAGS = ['think', 'thinking', 'analysis', 'plan', 'details', 'comment', 'author_note', 'ooc', 'instruction', 'system_prompt', 'directive', 'debug', 'log'];

function buildXmlRules(channel: MemoryFilterRule['channel'], tags: string[], basePriority: number): MemoryFilterRule[] {
    return tags.map((tag, index): MemoryFilterRule => ({
        id: `xml-${channel}-${tag}`,
        name: tag,
        mode: 'xml',
        enabled: true,
        channel,
        priority: basePriority - index,
        tagName: tag,
        aliases: [],
    }));
}

export const DEFAULT_MEMORY_FILTER_RULES: MemoryFilterRule[] = [
    ...buildXmlRules('memory', MEMORY_TAGS, 100),
    ...buildXmlRules('context', CONTEXT_TAGS, 90),
    ...buildXmlRules('excluded', EXCLUDED_TAGS, 110),
    {
        id: 'delimiter-default',
        name: '默认分隔符',
        mode: 'delimiter',
        enabled: true,
        channel: 'memory',
        priority: 0,
        delimiters: ['---', '###', '[章节]', '\\n\\n'],
        keepDelimiter: false,
    },
    {
        id: 'regex-heading',
        name: '标题块',
        mode: 'regex',
        enabled: true,
        channel: 'memory',
        priority: 0,
        regex: '(?:^|\\n)(#{1,6}\\s+[^\\n]+[\\s\\S]*?)(?=\\n#{1,6}\\s+|$)',
        flags: 'g',
        captureGroup: 1,
    },
    {
        id: 'markdown-heading',
        name: 'Markdown 标题',
        mode: 'markdown',
        enabled: true,
        channel: 'memory',
        priority: 0,
        markdownStrategy: 'heading_or_hr',
    },
    {
        id: 'json-root',
        name: 'JSON 根节点',
        mode: 'json',
        enabled: true,
        channel: 'memory',
        priority: 0,
        jsonPath: '$',
    },
];

export const DEFAULT_MEMORY_FILTER_SETTINGS: MemoryFilterSettings = {
    enabled: false,
    mode: 'xml',
    scope: {
        summary: true,
        takeover: true,
        dreamRecall: true,
        vectorIndex: true,
        promptInjection: true,
    },
    unknownPolicy: 'memory',
    cleanup: {
        trimWhitespace: true,
        stripWrapper: true,
        dropEmptyBlocks: true,
        minBlockLength: 0,
        maxBlockLength: 1200,
    },
    rules: DEFAULT_MEMORY_FILTER_RULES.map((rule) => ({ ...rule, aliases: rule.aliases ? [...rule.aliases] : undefined, delimiters: rule.delimiters ? [...rule.delimiters] : undefined })),
};
