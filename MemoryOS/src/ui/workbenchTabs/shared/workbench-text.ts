const WORKBENCH_USER_PLACEHOLDER_PATTERN: RegExp = /\{\{\s*(?:你|user|userDisplayName|当前用户|用户|主角)\s*\}\}/gi;

/**
 * 功能：把工作台展示层里的用户占位符压平成自然文本，避免直接露出模板语法。
 * @param value 原始文本。
 * @param fallback 兜底文本。
 * @returns 适合工作台展示的文本。
 */
export function sanitizeWorkbenchDisplayText(value: unknown, fallback = ''): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return fallback;
    }
    const normalized = text
        .replace(WORKBENCH_USER_PLACEHOLDER_PATTERN, '你')
        .replace(/\s+\n/g, '\n')
        .replace(/\n\s+/g, '\n')
        .trim();
    return normalized || fallback;
}
