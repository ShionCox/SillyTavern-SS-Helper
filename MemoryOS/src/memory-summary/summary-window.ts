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
}

/**
 * 功能：从聊天消息构建总结窗口。
 * @param messages 消息列表。
 * @returns 总结窗口。
 */
export function buildSummaryWindow(messages: SummaryWindowMessage[]): SummaryWindow {
    const sliced = (Array.isArray(messages) ? messages : [])
        .filter((message: SummaryWindowMessage): boolean => String(message.role ?? '').trim().toLowerCase() !== 'system')
        .slice(-20);
    const fromTurn = sliced.length > 0
        ? Math.max(1, Math.trunc(Number(sliced[0].turnIndex) || 1))
        : 0;
    const toTurn = sliced.length > 0
        ? Math.max(fromTurn, Math.trunc(Number(sliced[sliced.length - 1].turnIndex) || sliced.length))
        : 0;
    const summaryText = sliced
        .map((message: SummaryWindowMessage, index: number): string => {
            const name = String(message.name ?? '').trim();
            const role = String(message.role ?? '').trim() || `message_${index + 1}`;
            const speaker = name || role;
            const content = String(message.content ?? '').trim();
            return `${speaker}：${content}`;
        })
        .join('\n');
    const actorHints = extractActorHintsFromSummary(summaryText);
    return {
        fromTurn,
        toTurn,
        summaryText,
        actorHints,
    };
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

