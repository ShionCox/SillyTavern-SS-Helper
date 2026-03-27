/**
 * 功能：渲染 Prompt 模板时使用的变量表。
 */
export type PromptRenderVariables = Record<string, unknown>;

/**
 * 功能：将模板中的 `{{key}}` 变量替换为实际值。
 * @param template 原始模板。
 * @param variables 模板变量。
 * @returns 渲染后的文本。
 */
export function renderPromptTemplate(template: string, variables: PromptRenderVariables = {}): string {
    const source = String(template ?? '');
    return source.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_matched: string, key: string): string => {
        return stringifyPromptVariable(resolvePromptVariable(variables, key));
    });
}

/**
 * 功能：把上下文对象和 schema 组装为结构化任务 user payload。
 * @param contextJson 总结或冷启动上下文 JSON。
 * @param schemaJson 结构化输出 schema JSON。
 * @returns 拼装后的 user payload。
 */
export function buildStructuredTaskUserPayload(contextJson: string, schemaJson: string): string {
    const context = String(contextJson ?? '').trim();
    const schema = String(schemaJson ?? '').trim();
    return [
        '<memory_task_context>',
        context || '{}',
        '</memory_task_context>',
        '',
        '<output_schema>',
        schema || '{}',
        '</output_schema>',
    ].join('\n');
}

/**
 * 功能：解析点路径变量。
 * @param variables 变量对象。
 * @param path 点路径。
 * @returns 对应值。
 */
function resolvePromptVariable(variables: PromptRenderVariables, path: string): unknown {
    const steps = String(path ?? '').split('.').filter(Boolean);
    let cursor: unknown = variables;
    for (const step of steps) {
        if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
            return undefined;
        }
        cursor = (cursor as Record<string, unknown>)[step];
    }
    return cursor;
}

/**
 * 功能：把变量值序列化成可注入模板的字符串。
 * @param value 变量值。
 * @returns 字符串值。
 */
function stringifyPromptVariable(value: unknown): string {
    if (value == null) {
        return '';
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return '';
    }
}

