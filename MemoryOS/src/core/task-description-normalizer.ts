/**
 * 功能：任务描述归一化所需的输入。
 */
export interface NormalizeTaskDescriptionInput {
    title?: string;
    summary?: string;
    objective?: string;
    status?: string;
    stage?: string;
    blocker?: string;
    location?: string;
    lastChange?: string;
}

/**
 * 功能：生成可读的任务一句话描述，用于工作台卡片和图谱摘要。
 * @param input 任务描述归一化输入。
 * @returns 归一化后的任务描述。
 */
export function normalizeTaskDescription(input: NormalizeTaskDescriptionInput): string {
    const explicitSummary = normalizeText(input.summary);
    if (isUsefulDescription(explicitSummary, input.title)) {
        return explicitSummary;
    }

    const fragments: string[] = [];
    const objective = normalizeText(input.objective);
    const status = normalizeText(input.status || input.stage);
    const blocker = normalizeText(input.blocker);
    const location = normalizeText(input.location);
    const lastChange = normalizeText(input.lastChange);

    if (objective) {
        fragments.push(`当前目标是${objective}`);
    }
    if (status) {
        fragments.push(`状态为${status}`);
    }
    if (location) {
        fragments.push(`相关地点为${location}`);
    }
    if (blocker) {
        fragments.push(`主要阻碍是${blocker}`);
    }
    if (lastChange) {
        fragments.push(`最近变化为${lastChange}`);
    }

    if (fragments.length <= 0) {
        const title = normalizeText(input.title);
        return title ? `${title}正在持续推进。` : '该任务正在持续推进。';
    }

    return `${fragments.join('，')}。`;
}

/**
 * 功能：判断一句描述是否足够有信息量。
 * @param value 待判断描述。
 * @param title 任务标题。
 * @returns 是否值得直接保留。
 */
function isUsefulDescription(value: string, title?: string): boolean {
    if (!value) {
        return false;
    }
    if (value.length < 8) {
        return false;
    }
    const normalizedTitle = normalizeText(title);
    return !normalizedTitle || value !== normalizedTitle;
}

/**
 * 功能：规范化文本。
 * @param value 原始文本。
 * @returns 去空白后的文本。
 */
function normalizeText(value: string | undefined): string {
    return String(value ?? '').trim();
}
