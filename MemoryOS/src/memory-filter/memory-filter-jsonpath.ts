/**
 * 功能：提供记忆过滤器使用的轻量 JSONPath 读取能力。
 */

export function evaluateMemoryFilterJsonPath(root: unknown, path: string): unknown[] {
    const normalized = String(path ?? '').trim();
    if (!normalized || normalized === '$') {
        return [root];
    }
    const tokens = normalized.replace(/^\$\.?/, '').match(/[^.[\]]+|\[(\d+|\*)\]/g) ?? [];
    let cursors: unknown[] = [root];
    for (const token of tokens) {
        const next: unknown[] = [];
        const arrayMatch = token.match(/^\[(\d+|\*)\]$/);
        for (const cursor of cursors) {
            if (arrayMatch) {
                if (!Array.isArray(cursor)) {
                    continue;
                }
                if (arrayMatch[1] === '*') {
                    next.push(...cursor);
                } else {
                    const value = cursor[Number(arrayMatch[1])];
                    if (value !== undefined) {
                        next.push(value);
                    }
                }
                continue;
            }
            if (Array.isArray(cursor)) {
                for (const item of cursor) {
                    if (item && typeof item === 'object' && token in item) {
                        next.push((item as Record<string, unknown>)[token]);
                    }
                }
            } else if (cursor && typeof cursor === 'object' && token in cursor) {
                next.push((cursor as Record<string, unknown>)[token]);
            }
        }
        cursors = next;
    }
    return cursors;
}
