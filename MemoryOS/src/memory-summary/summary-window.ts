/**
 * 功能：聊天消息结构。
 */
export interface SummaryWindowMessage {
    role?: string;
    content?: string;
    name?: string;
    turnIndex?: number;
}

/**
 * 功能：总结窗口结构。
 */
export interface SummaryWindow {
    fromTurn: number;
    toTurn: number;
    summaryText: string;
    actorHints: string[];
    /** 近景窗口：最近 3~5 楼提纯的 facts，用于语境提示。 */
    recentContextText: string;
}

/**
 * 功能：双层窗口构建选项。
 */
export interface SummaryWindowOptions {
    /** 严格未总结区间起始 turnIndex（含）。 */
    pendingStartIndex?: number;
    /** 严格未总结区间结束 turnIndex（含）。 */
    pendingEndIndex?: number;
    /** 近景窗口消息数量，默认 5。 */
    recentContextSize?: number;
}

/**
 * 功能：从聊天消息构建总结窗口。
 * 支持双层模式：主窗口为严格 pendingStartIndex~pendingEndIndex 区间，
 * 近景窗口取最后 3~5 条消息提纯 facts，用于当前语境提示。
 * @param messages 消息列表。
 * @param options 双层构建选项。
 * @returns 总结窗口。
 */
export function buildSummaryWindow(messages: SummaryWindowMessage[], options?: SummaryWindowOptions): SummaryWindow {
    const nonSystem = (Array.isArray(messages) ? messages : [])
        .filter((message: SummaryWindowMessage): boolean => String(message.role ?? '').trim().toLowerCase() !== 'system');

    const hasPendingRange = options
        && typeof options.pendingStartIndex === 'number'
        && typeof options.pendingEndIndex === 'number'
        && options.pendingEndIndex >= options.pendingStartIndex;

    const mainSlice = hasPendingRange
        ? nonSystem.filter((m: SummaryWindowMessage): boolean => {
            const turn = Math.trunc(Number(m.turnIndex) || 0);
            return turn >= options!.pendingStartIndex! && turn <= options!.pendingEndIndex!;
        })
        : nonSystem.slice(-20);

    const recentSize = Math.max(3, Math.min(options?.recentContextSize ?? 5, 8));
    const recentSlice = nonSystem.slice(-recentSize);

    const fromTurn = mainSlice.length > 0
        ? Math.max(1, Math.trunc(Number(mainSlice[0].turnIndex) || 1))
        : 0;
    const toTurn = mainSlice.length > 0
        ? Math.max(fromTurn, Math.trunc(Number(mainSlice[mainSlice.length - 1].turnIndex) || mainSlice.length))
        : 0;
    const summaryText = formatMessages(mainSlice);
    const recentContextText = formatMessages(recentSlice);
    const actorHints = extractActorHintsFromSummary(summaryText + '\n' + recentContextText);
    return {
        fromTurn,
        toTurn,
        summaryText,
        actorHints,
        recentContextText,
    };
}

/**
 * 功能：将消息列表格式化为文本。
 * @param sliced 消息列表。
 * @returns 格式化文本。
 */
function formatMessages(sliced: SummaryWindowMessage[]): string {
    return sliced
        .map((message: SummaryWindowMessage, index: number): string => {
            const name = String(message.name ?? '').trim();
            const role = String(message.role ?? '').trim() || `message_${index + 1}`;
            const speaker = name || role;
            const content = String(message.content ?? '').trim();
            return `${speaker}：${content}`;
        })
        .join('\n');
}

/**
 * 功能：从窗口摘要中提取角色提示词。
 * @param summaryText 窗口摘要文本。
 * @returns 角色提示词。
 */
function extractActorHintsFromSummary(summaryText: string): string[] {
    const matches = String(summaryText ?? '').match(/char_[a-zA-Z0-9_-]+/g) ?? [];
    const merged: string[] = [];
    for (const match of matches) {
        const normalized = String(match ?? '').trim();
        if (normalized && !merged.includes(normalized)) {
            merged.push(normalized);
        }
    }
    return merged;
}

