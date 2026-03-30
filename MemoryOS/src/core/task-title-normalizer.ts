/**
 * 功能：任务标题归一化所需的输入。
 */
export interface NormalizeTaskTitleInput {
    title?: string;
    objective?: string;
    action?: string;
    target?: string;
    location?: string;
    compareKey?: string;
}

/**
 * 功能：归一化任务标题，优先保留稳定可读标题，缺失时按模板生成。
 * @param input 任务标题归一化输入。
 * @returns 归一化后的任务标题。
 */
export function normalizeTaskTitle(input: NormalizeTaskTitleInput): string {
    const explicitTitle = normalizeText(input.title);
    if (isReadableTaskTitle(explicitTitle)) {
        return explicitTitle;
    }

    const objective = normalizeText(input.objective);
    if (isReadableTaskTitle(objective)) {
        return truncateTitle(objective);
    }

    const action = normalizeVerb(input.action) || inferActionFromObjective(objective);
    const target = normalizeText(input.target);
    const location = normalizeText(input.location);
    if (action && target) {
        return truncateTitle(`${action}${target}`);
    }
    if (action && location) {
        return truncateTitle(`${action}${location}`);
    }
    if (target) {
        return truncateTitle(`处理${target}`);
    }
    if (location) {
        return truncateTitle(`前往${location}`);
    }

    const compareKey = normalizeText(input.compareKey);
    if (compareKey) {
        const tail = compareKey.split(':').filter(Boolean).pop() || '';
        if (tail) {
            return truncateTitle(`任务-${tail}`);
        }
    }
    return '未命名任务';
}

/**
 * 功能：判断任务标题是否已经足够可读。
 * @param value 待检查标题。
 * @returns 是否为可读标题。
 */
function isReadableTaskTitle(value: string): boolean {
    if (!value) {
        return false;
    }
    if (value.length < 2) {
        return false;
    }
    const normalized = value.toLowerCase();
    const genericTitles = new Set([
        'task',
        '任务',
        '未命名任务',
        'unknown',
        'todo',
        'mission',
    ]);
    return !genericTitles.has(normalized);
}

/**
 * 功能：从目标描述中推断动作动词。
 * @param objective 任务目标描述。
 * @returns 推断后的动作动词。
 */
function inferActionFromObjective(objective: string): string {
    if (!objective) {
        return '';
    }
    const verbTemplates: Array<{ pattern: RegExp; verb: string }> = [
        { pattern: /调查|查明|搜集证据/, verb: '调查' },
        { pattern: /寻找|找回|搜寻/, verb: '寻找' },
        { pattern: /护送|护卫|护送出城/, verb: '护送' },
        { pattern: /潜入|渗透|混入/, verb: '潜入' },
        { pattern: /阻止|破坏|拦截/, verb: '阻止' },
        { pattern: /说服|劝说|谈判/, verb: '说服' },
        { pattern: /逃离|撤离|离开/, verb: '撤离' },
    ];
    for (const item of verbTemplates) {
        if (item.pattern.test(objective)) {
            return item.verb;
        }
    }
    return '';
}

/**
 * 功能：规范化动作动词。
 * @param value 原始动词。
 * @returns 规范化后的动词。
 */
function normalizeVerb(value: string | undefined): string {
    const normalized = normalizeText(value);
    if (!normalized) {
        return '';
    }
    return normalized.replace(/[：:，,。.！!？?].*$/, '');
}

/**
 * 功能：裁剪任务标题长度，避免展示过长。
 * @param value 原始标题。
 * @returns 裁剪后的标题。
 */
function truncateTitle(value: string): string {
    if (value.length <= 28) {
        return value;
    }
    return `${value.slice(0, 27).trim()}…`;
}

/**
 * 功能：规范化文本。
 * @param value 原始文本。
 * @returns 去空白后的文本。
 */
function normalizeText(value: string | undefined): string {
    return String(value ?? '').trim();
}
