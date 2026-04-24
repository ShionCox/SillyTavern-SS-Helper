import { DEFAULT_MEMORY_FILTER_RULES, DEFAULT_MEMORY_FILTER_SETTINGS } from './memory-filter-defaults';
import type {
    MemoryFilterChannel,
    MemoryFilterCleanupConfig,
    MemoryFilterMode,
    MemoryFilterRule,
    MemoryFilterSettings,
    MemoryFilterUnknownPolicy,
} from './memory-filter-types';

let runtimeMemoryFilterSettings: MemoryFilterSettings = cloneMemoryFilterSettings(DEFAULT_MEMORY_FILTER_SETTINGS);

export function getMemoryFilterSettings(): MemoryFilterSettings {
    return cloneMemoryFilterSettings(runtimeMemoryFilterSettings);
}

export function applyMemoryFilterSettings(settings: Partial<MemoryFilterSettings>): MemoryFilterSettings {
    runtimeMemoryFilterSettings = normalizeMemoryFilterSettings({
        ...runtimeMemoryFilterSettings,
        ...settings,
        scope: settings.scope ?? runtimeMemoryFilterSettings.scope,
        cleanup: settings.cleanup ?? runtimeMemoryFilterSettings.cleanup,
        rules: settings.rules ?? runtimeMemoryFilterSettings.rules,
    });
    return getMemoryFilterSettings();
}

export function resetMemoryFilterSettings(): MemoryFilterSettings {
    runtimeMemoryFilterSettings = cloneMemoryFilterSettings(DEFAULT_MEMORY_FILTER_SETTINGS);
    return getMemoryFilterSettings();
}

export function normalizeMemoryFilterSettings(settings: Partial<MemoryFilterSettings> | null | undefined): MemoryFilterSettings {
    const source = settings ?? {};
    return {
        enabled: source.enabled === true,
        mode: normalizeMemoryFilterMode(source.mode),
        scope: {
            summary: source.scope?.summary !== false,
            takeover: source.scope?.takeover !== false,
            dreamRecall: source.scope?.dreamRecall !== false,
            vectorIndex: source.scope?.vectorIndex !== false,
            promptInjection: source.scope?.promptInjection !== false,
        },
        unknownPolicy: normalizeChannel(source.unknownPolicy, DEFAULT_MEMORY_FILTER_SETTINGS.unknownPolicy),
        cleanup: normalizeCleanup(source.cleanup),
        rules: normalizeRules(source.rules),
    };
}

export function cloneMemoryFilterSettings(settings: MemoryFilterSettings): MemoryFilterSettings {
    return {
        enabled: settings.enabled === true,
        mode: normalizeMemoryFilterMode(settings.mode),
        scope: { ...settings.scope },
        unknownPolicy: normalizeChannel(settings.unknownPolicy, 'memory') as MemoryFilterUnknownPolicy,
        cleanup: normalizeCleanup(settings.cleanup),
        rules: settings.rules.map(cloneRule),
    };
}

function normalizeRules(rules: unknown): MemoryFilterRule[] {
    const source = Array.isArray(rules) && rules.length > 0 ? rules : DEFAULT_MEMORY_FILTER_RULES;
    const normalized = source.map((raw, index): MemoryFilterRule | null => {
        const rule = raw && typeof raw === 'object' ? raw as Partial<MemoryFilterRule> : {};
        const mode = normalizeMemoryFilterMode(rule.mode);
        const id = String(rule.id || `${mode}-rule-${index + 1}`).trim();
        const name = String(rule.name || rule.tagName || rule.id || `规则 ${index + 1}`).trim();
        if (!id || !name) {
            return null;
        }
        return {
            id,
            name,
            mode,
            enabled: rule.enabled !== false,
            channel: normalizeChannel(rule.channel, 'memory'),
            priority: Math.trunc(Number(rule.priority) || 0),
            tagName: cleanOptional(rule.tagName),
            aliases: normalizeStringArray(rule.aliases),
            pattern: cleanOptional(rule.pattern),
            patternMode: rule.patternMode === 'regex' ? 'regex' : 'prefix',
            delimiters: normalizeStringArray(rule.delimiters),
            keepDelimiter: rule.keepDelimiter === true,
            regex: cleanOptional(rule.regex),
            flags: cleanOptional(rule.flags) || 'g',
            captureGroup: Math.max(0, Math.trunc(Number(rule.captureGroup) || 0)),
            markdownStrategy: normalizeMarkdownStrategy(rule.markdownStrategy),
            jsonPath: cleanOptional(rule.jsonPath) || '$',
        };
    }).filter(Boolean) as MemoryFilterRule[];
    return normalized.length > 0 ? normalized.map(cloneRule) : DEFAULT_MEMORY_FILTER_RULES.map(cloneRule);
}

function cloneRule(rule: MemoryFilterRule): MemoryFilterRule {
    return {
        ...rule,
        aliases: rule.aliases ? [...rule.aliases] : undefined,
        delimiters: rule.delimiters ? [...rule.delimiters] : undefined,
    };
}

function normalizeCleanup(cleanup: unknown): MemoryFilterCleanupConfig {
    const source = cleanup && typeof cleanup === 'object' ? cleanup as Partial<MemoryFilterCleanupConfig> : {};
    return {
        trimWhitespace: source.trimWhitespace !== false,
        stripWrapper: source.stripWrapper !== false,
        dropEmptyBlocks: source.dropEmptyBlocks !== false,
        minBlockLength: Math.max(0, Math.trunc(Number(source.minBlockLength) || 0)),
        maxBlockLength: Math.max(0, Math.trunc(Number(source.maxBlockLength) || DEFAULT_MEMORY_FILTER_SETTINGS.cleanup.maxBlockLength)),
    };
}

function normalizeMemoryFilterMode(value: unknown): MemoryFilterMode {
    if (value === 'delimiter' || value === 'regex' || value === 'markdown' || value === 'json') {
        return value;
    }
    return 'xml';
}

function normalizeChannel(value: unknown, fallback: MemoryFilterChannel): MemoryFilterChannel {
    if (value === 'context' || value === 'excluded' || value === 'memory') {
        return value;
    }
    return fallback;
}

function normalizeMarkdownStrategy(value: unknown): MemoryFilterRule['markdownStrategy'] {
    if (value === 'heading' || value === 'hr') {
        return value;
    }
    return 'heading_or_hr';
}

function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function cleanOptional(value: unknown): string | undefined {
    return String(value ?? '').trim() || undefined;
}
