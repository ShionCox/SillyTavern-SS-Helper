export const PEROCORE_SYSTEM_PREFIXES: string[] = [
    '【管理系统提醒',
    '【系统触发】',
    '【系统事件】',
    '(系统触发：',
    '[I said in Group]:',
];

const PEROCORE_GROUP_CONTEXT_PREFIX = /^\[[^\]\r\n]+ said in Group\]:/u;

/**
 * 功能：检测输入是否带有系统事件前缀。
 * @param text 原始文本。
 * @returns 命中的前缀；未命中时返回空值。
 */
export function matchPerocoreSystemPrefix(text: string): string | undefined {
    const source = String(text ?? '').trim();
    const fixedPrefix = PEROCORE_SYSTEM_PREFIXES.find((prefix: string): boolean => source.startsWith(prefix));
    if (fixedPrefix) {
        return fixedPrefix;
    }
    const dynamicGroupPrefix = source.match(PEROCORE_GROUP_CONTEXT_PREFIX)?.[0];
    return dynamicGroupPrefix;
}

/**
 * 功能：移除输入开头的系统事件前缀。
 * @param text 原始文本。
 * @returns 移除后的文本。
 */
export function stripPerocoreSystemPrefix(text: string): string {
    const source = String(text ?? '').trim();
    const matchedPrefix = matchPerocoreSystemPrefix(source);
    if (!matchedPrefix) {
        return source;
    }
    return source.slice(matchedPrefix.length).trim();
}
