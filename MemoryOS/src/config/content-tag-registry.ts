/**
 * 功能：内容标签注册表——唯一标签规则源。
 * 所有已知标签都在这里维护，系统启动时读取，控制台也编辑它。
 */

/**
 * 功能：定义内容块的类型标识。
 */
export type ContentBlockKind =
    | 'story_primary'
    | 'story_secondary'
    | 'summary'
    | 'tool_artifact'
    | 'thought'
    | 'meta_commentary'
    | 'instruction'
    | 'unknown';

/**
 * 功能：定义标签模式匹配方式。
 */
export type ContentTagPatternMode = 'prefix' | 'regex';

/**
 * 功能：定义单条内容标签策略。
 */
export interface ContentBlockPolicy {
    /** 标签名（如 game, summary, think） */
    tagName: string;
    /** 标签名别名列表 */
    aliases: string[];
    /** 模式匹配文本 */
    pattern?: string;
    /** 模式匹配方式 */
    patternMode?: ContentTagPatternMode;
    /** 多规则命中时的优先级 */
    priority?: number;
    /** 内容块分类 */
    kind: ContentBlockKind;
    /** 是否参与主正文抽取 */
    includeInPrimaryExtraction: boolean;
    /** 是否作为辅助上下文 */
    includeAsHint: boolean;
    /** 是否允许角色升级 */
    allowActorPromotion: boolean;
    /** 是否允许关系升级 */
    allowRelationPromotion: boolean;
    /** 备注 */
    notes: string;
}

/**
 * 功能：默认内容标签注册表。
 */
export const DEFAULT_CONTENT_TAG_REGISTRY: ContentBlockPolicy[] = [
    {
        tagName: 'game',
        aliases: ['story', 'main', 'roleplay', 'rp'],
        kind: 'story_primary',
        includeInPrimaryExtraction: true,
        includeAsHint: true,
        allowActorPromotion: true,
        allowRelationPromotion: true,
        notes: '正文主源',
    },
    {
        tagName: 'narrative',
        aliases: ['scene', 'prose'],
        kind: 'story_primary',
        includeInPrimaryExtraction: true,
        includeAsHint: true,
        allowActorPromotion: true,
        allowRelationPromotion: true,
        notes: '叙事主源',
    },
    {
        tagName: 'summary',
        aliases: ['recap', 'memo'],
        pattern: '^summary(?:[-_].+)?$',
        patternMode: 'regex',
        priority: 80,
        kind: 'summary',
        includeInPrimaryExtraction: false,
        includeAsHint: true,
        allowActorPromotion: false,
        allowRelationPromotion: false,
        notes: '总结层，只能做辅助',
    },
    {
        tagName: 'tableEdit',
        aliases: ['sheetEdit', 'dbPatch'],
        pattern: 'tableedit',
        patternMode: 'prefix',
        priority: 90,
        kind: 'tool_artifact',
        includeInPrimaryExtraction: false,
        includeAsHint: true,
        allowActorPromotion: false,
        allowRelationPromotion: false,
        notes: '插件表格更新层，不得作为正文主源',
    },
    {
        tagName: 'details',
        aliases: ['comment', 'author_note', 'ooc'],
        kind: 'meta_commentary',
        includeInPrimaryExtraction: false,
        includeAsHint: false,
        allowActorPromotion: false,
        allowRelationPromotion: false,
        notes: '注释/留言层，排除',
    },
    {
        tagName: 'think',
        aliases: ['think_nya~', 'analysis', 'plan', 'thinking'],
        pattern: '^think(?:[_~-].+|\\d+.*)?$',
        patternMode: 'regex',
        priority: 90,
        kind: 'thought',
        includeInPrimaryExtraction: false,
        includeAsHint: false,
        allowActorPromotion: false,
        allowRelationPromotion: false,
        notes: '思考层，排除',
    },
    {
        tagName: 'instruction',
        aliases: ['system_prompt', 'directive', 'command'],
        kind: 'instruction',
        includeInPrimaryExtraction: false,
        includeAsHint: false,
        allowActorPromotion: false,
        allowRelationPromotion: false,
        notes: '指令层，排除',
    },
];

/**
 * 功能：定义未知标签的默认处理策略。
 */
export interface UnknownTagPolicy {
    /** 未知标签默认分类 */
    defaultKind: ContentBlockKind;
    /** 未知标签是否允许作为 hint */
    allowAsHint: boolean;
}

/**
 * 功能：默认未知标签策略。
 */
export const DEFAULT_UNKNOWN_TAG_POLICY: UnknownTagPolicy = {
    defaultKind: 'unknown',
    allowAsHint: true,
};

/**
 * 功能：定义分类器开关配置。
 */
export interface ClassifierToggleConfig {
    /** 启用规则分类器 */
    enableRuleClassifier: boolean;
    /** 启用 meta 关键词检测 */
    enableMetaKeywordDetection: boolean;
    /** 启用 tool artifact 检测 */
    enableToolArtifactDetection: boolean;
}

/**
 * 功能：定义内容实验室完整配置。
 */
export interface ContentLabSettings {
    /** 标签注册表 */
    tagRegistry: ContentBlockPolicy[];
    /** 未知标签处理策略 */
    unknownTagPolicy: UnknownTagPolicy;
    /** 规则分类器开关 */
    classifierToggles: ClassifierToggleConfig;
    /** 是否启用 AI 兜底分类 */
    enableAIClassifier: boolean;
}

/**
 * 功能：默认分类器开关。
 */
export const DEFAULT_CLASSIFIER_TOGGLES: ClassifierToggleConfig = {
    enableRuleClassifier: true,
    enableMetaKeywordDetection: true,
    enableToolArtifactDetection: true,
};

/**
 * 功能：默认内容实验室配置。
 */
export const DEFAULT_CONTENT_LAB_SETTINGS: ContentLabSettings = {
    tagRegistry: [...DEFAULT_CONTENT_TAG_REGISTRY],
    unknownTagPolicy: { ...DEFAULT_UNKNOWN_TAG_POLICY },
    classifierToggles: { ...DEFAULT_CLASSIFIER_TOGGLES },
    enableAIClassifier: false,
};

/** 运行时内容实验室配置。 */
let _runtimeContentLabSettings: ContentLabSettings = cloneContentLabSettings(DEFAULT_CONTENT_LAB_SETTINGS);

/**
 * 功能：获取当前内容实验室配置快照。
 * @returns 配置快照。
 */
export function getContentLabSettings(): ContentLabSettings {
    return cloneContentLabSettings(_runtimeContentLabSettings);
}

/**
 * 功能：应用并覆盖运行时内容实验室配置。
 * @param settings 新配置。
 * @returns 应用后的配置快照。
 */
export function applyContentLabSettings(settings: Partial<ContentLabSettings>): ContentLabSettings {
    _runtimeContentLabSettings = normalizeContentLabSettings({
        ..._runtimeContentLabSettings,
        ...settings,
        tagRegistry: settings.tagRegistry ?? _runtimeContentLabSettings.tagRegistry,
        unknownTagPolicy: settings.unknownTagPolicy ?? _runtimeContentLabSettings.unknownTagPolicy,
        classifierToggles: settings.classifierToggles ?? _runtimeContentLabSettings.classifierToggles,
        enableAIClassifier: settings.enableAIClassifier ?? _runtimeContentLabSettings.enableAIClassifier,
    });
    return getContentLabSettings();
}

/**
 * 功能：重置运行时内容实验室配置。
 * @returns 重置后的配置快照。
 */
export function resetContentLabSettings(): ContentLabSettings {
    _runtimeContentLabSettings = cloneContentLabSettings(DEFAULT_CONTENT_LAB_SETTINGS);
    return getContentLabSettings();
}

/**
 * 功能：获取当前标签注册表。
 */
export function getContentTagRegistry(): ContentBlockPolicy[] {
    return getContentLabSettings().tagRegistry;
}

/**
 * 功能：保存标签注册表（覆盖运行时实例）。
 */
export function saveContentTagRegistry(rules: ContentBlockPolicy[]): void {
    applyContentLabSettings({ tagRegistry: rules });
}

/**
 * 功能：重置为默认注册表。
 */
export function resetContentTagRegistry(): void {
    applyContentLabSettings({ tagRegistry: DEFAULT_CONTENT_TAG_REGISTRY });
}

/**
 * 功能：获取当前未知标签策略。
 */
export function getUnknownTagPolicy(): UnknownTagPolicy {
    return getContentLabSettings().unknownTagPolicy;
}

/**
 * 功能：保存未知标签策略。
 */
export function saveUnknownTagPolicy(policy: UnknownTagPolicy): void {
    applyContentLabSettings({ unknownTagPolicy: policy });
}

/**
 * 功能：获取分类器开关。
 */
export function getClassifierToggles(): ClassifierToggleConfig {
    return getContentLabSettings().classifierToggles;
}

/**
 * 功能：保存分类器开关。
 */
export function saveClassifierToggles(toggles: ClassifierToggleConfig): void {
    applyContentLabSettings({ classifierToggles: toggles });
}

/**
 * 功能：根据标签名在注册表中查找匹配的策略。
 * @param tagName 标签名。
 * @returns 匹配的策略或 undefined。
 */
export function lookupTagPolicy(tagName: string): ContentBlockPolicy | undefined {
    const normalized = String(tagName ?? '').trim().toLowerCase();
    if (!normalized) {
        return undefined;
    }
    const matches = getContentTagRegistry()
        .map((policy, index) => {
            const match = resolvePolicyMatch(policy, normalized);
            if (!match) {
                return null;
            }
            return {
                policy,
                index,
                priority: Number.isFinite(policy.priority) ? Number(policy.priority) : 0,
                specificity: match,
            };
        })
        .filter(Boolean) as Array<{
            policy: ContentBlockPolicy;
            index: number;
            priority: number;
            specificity: number;
        }>;
    if (matches.length === 0) {
        return undefined;
    }
    matches.sort((left, right) => {
        if (right.priority !== left.priority) {
            return right.priority - left.priority;
        }
        if (right.specificity !== left.specificity) {
            return right.specificity - left.specificity;
        }
        return left.index - right.index;
    });
    return matches[0]?.policy;
}

/**
 * 功能：规范化内容实验室配置，保证结构完整且值合法。
 * @param settings 原始配置。
 * @returns 规范化后的配置。
 */
export function normalizeContentLabSettings(settings: Partial<ContentLabSettings> | null | undefined): ContentLabSettings {
    const source = settings ?? {};
    const tagRegistry = Array.isArray(source.tagRegistry) && source.tagRegistry.length > 0
        ? source.tagRegistry.map((rule: ContentBlockPolicy): ContentBlockPolicy => ({
            tagName: String(rule.tagName ?? '').trim(),
            aliases: Array.isArray(rule.aliases) ? rule.aliases.map((alias: string): string => String(alias ?? '').trim()).filter(Boolean) : [],
            pattern: String(rule.pattern ?? '').trim() || undefined,
            patternMode: normalizePatternMode(rule.patternMode),
            priority: normalizePriority(rule.priority),
            kind: rule.kind ?? 'unknown',
            includeInPrimaryExtraction: rule.includeInPrimaryExtraction === true,
            includeAsHint: rule.includeAsHint === true,
            allowActorPromotion: rule.allowActorPromotion === true,
            allowRelationPromotion: rule.allowRelationPromotion === true,
            notes: String(rule.notes ?? '').trim(),
        })).filter((rule: ContentBlockPolicy): boolean => Boolean(rule.tagName))
        : [...DEFAULT_CONTENT_TAG_REGISTRY];
    return {
        tagRegistry,
        unknownTagPolicy: {
            defaultKind: source.unknownTagPolicy?.defaultKind ?? DEFAULT_UNKNOWN_TAG_POLICY.defaultKind,
            allowAsHint: source.unknownTagPolicy?.allowAsHint ?? DEFAULT_UNKNOWN_TAG_POLICY.allowAsHint,
        },
        classifierToggles: {
            enableRuleClassifier: source.classifierToggles?.enableRuleClassifier ?? DEFAULT_CLASSIFIER_TOGGLES.enableRuleClassifier,
            enableMetaKeywordDetection: source.classifierToggles?.enableMetaKeywordDetection ?? DEFAULT_CLASSIFIER_TOGGLES.enableMetaKeywordDetection,
            enableToolArtifactDetection: source.classifierToggles?.enableToolArtifactDetection ?? DEFAULT_CLASSIFIER_TOGGLES.enableToolArtifactDetection,
        },
        enableAIClassifier: source.enableAIClassifier === true,
    };
}

/**
 * 功能：深拷贝内容实验室配置。
 * @param settings 原始配置。
 * @returns 拷贝结果。
 */
function cloneContentLabSettings(settings: ContentLabSettings): ContentLabSettings {
    return {
        tagRegistry: settings.tagRegistry.map((rule: ContentBlockPolicy): ContentBlockPolicy => ({
            ...rule,
            aliases: [...rule.aliases],
            pattern: String(rule.pattern ?? '').trim() || undefined,
            patternMode: normalizePatternMode(rule.patternMode),
            priority: normalizePriority(rule.priority),
        })),
        unknownTagPolicy: { ...settings.unknownTagPolicy },
        classifierToggles: { ...settings.classifierToggles },
        enableAIClassifier: settings.enableAIClassifier,
    };
}

/**
 * 功能：解析单条策略对标签的命中强度。
 * @param policy 标签策略。
 * @param normalizedTag 已归一化标签。
 * @returns 命中强度；未命中时返回 0。
 */
function resolvePolicyMatch(policy: ContentBlockPolicy, normalizedTag: string): number {
    if (String(policy.tagName ?? '').trim().toLowerCase() === normalizedTag) {
        return 400;
    }
    if (policy.aliases.some((alias) => String(alias ?? '').trim().toLowerCase() === normalizedTag)) {
        return 300;
    }
    const pattern = String(policy.pattern ?? '').trim();
    if (!pattern) {
        return 0;
    }
    const patternMode = normalizePatternMode(policy.patternMode);
    if (patternMode === 'prefix') {
        return normalizedTag.startsWith(pattern.toLowerCase()) ? 200 : 0;
    }
    try {
        return new RegExp(pattern, 'i').test(normalizedTag) ? 100 : 0;
    } catch {
        return 0;
    }
}

/**
 * 功能：归一化模式匹配方式。
 * @param value 原始值。
 * @returns 规范后的模式。
 */
function normalizePatternMode(value: unknown): ContentTagPatternMode | undefined {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'prefix' || normalized === 'regex') {
        return normalized;
    }
    return undefined;
}

/**
 * 功能：归一化优先级。
 * @param value 原始值。
 * @returns 规范化优先级。
 */
function normalizePriority(value: unknown): number {
    const priority = Math.trunc(Number(value));
    return Number.isFinite(priority) ? priority : 0;
}
