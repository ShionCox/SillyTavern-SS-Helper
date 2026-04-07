/**
 * 功能：为 embedding 查询预留的上下文构建器。
 * 说明：第一阶段只做文本组装和上下文规范化，不真正生成 embedding。
 *       第二阶段将用 `EmbeddingService.encode(bundle.mergedContextText)` 或
 *       分道编码 user / assistant / tool 再加权融合。
 */

/**
 * 功能：查询上下文包。
 */
export interface QueryContextBundle {
    /** 原始查询文本 */
    queryText: string;
    /** 最近用户文本 */
    recentUserText: string;
    /** 最近助手文本 */
    recentAssistantText: string;
    /** 最近工具文本 */
    recentToolText: string;
    /** 合并后的完整上下文文本（用于 embedding） */
    mergedContextText: string;
    /** 偏置角色键 */
    actorBiasKeys: string[];
    /** 偏置关系键 */
    relationBiasKeys: string[];
    /** 偏置世界键 */
    worldBiasKeys: string[];
}

/**
 * 功能：构建查询上下文包的输入。
 */
export interface QueryContextBuilderInput {
    /** 查询文本 */
    query: string;
    /** 最近的聊天消息 */
    recentMessages?: Array<{
        role?: string;
        content?: string;
    }>;
    /** 已知的角色键 */
    knownActorKeys?: string[];
    /** 已知的关系键 */
    knownRelationKeys?: string[];
    /** 已知的世界键 */
    knownWorldKeys?: string[];
    /** 最大上下文窗口字符数 */
    maxContextChars?: number;
}

/**
 * 功能：构建查询上下文包。
 * @param input 构建输入。
 * @returns 查询上下文包。
 */
export function buildQueryContextBundle(input: QueryContextBuilderInput): QueryContextBundle {
    const query = normalizeText(input.query);
    const maxChars = Math.max(200, Number(input.maxContextChars ?? 4000) || 4000);
    const messages = Array.isArray(input.recentMessages) ? input.recentMessages : [];

    const userMessages: string[] = [];
    const assistantMessages: string[] = [];
    const toolMessages: string[] = [];

    for (const msg of messages) {
        const role = normalizeText(msg.role).toLowerCase();
        const content = normalizeText(msg.content);
        if (!content) {
            continue;
        }
        if (role === 'user') {
            userMessages.push(content);
        } else if (role === 'assistant') {
            assistantMessages.push(content);
        } else if (role === 'tool' || role === 'function') {
            toolMessages.push(content);
        }
    }

    const recentUserText = truncateText(userMessages.slice(-5).join('\n'), maxChars);
    const recentAssistantText = truncateText(assistantMessages.slice(-3).join('\n'), maxChars);
    const recentToolText = truncateText(toolMessages.slice(-2).join('\n'), Math.floor(maxChars / 2));

    const mergedParts: string[] = [query];
    if (recentUserText) {
        mergedParts.push(recentUserText);
    }
    if (recentAssistantText) {
        mergedParts.push(recentAssistantText);
    }
    if (recentToolText) {
        mergedParts.push(recentToolText);
    }
    const mergedContextText = truncateText(mergedParts.join('\n'), maxChars);

    return {
        queryText: query,
        recentUserText,
        recentAssistantText,
        recentToolText,
        mergedContextText,
        actorBiasKeys: dedupeStrings(input.knownActorKeys),
        relationBiasKeys: dedupeStrings(input.knownRelationKeys),
        worldBiasKeys: dedupeStrings(input.knownWorldKeys),
    };
}

/**
 * 功能：标准化文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * 功能：截断文本到指定长度。
 */
function truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }
    return text.slice(0, maxChars);
}

/**
 * 功能：去重字符串数组。
 */
function dedupeStrings(items?: string[]): string[] {
    if (!Array.isArray(items)) {
        return [];
    }
    return Array.from(new Set(
        items.map((s: string): string => normalizeText(s)).filter(Boolean),
    ));
}
