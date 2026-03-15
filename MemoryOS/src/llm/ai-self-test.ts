/**
 * 功能：提供 MemoryOS 五类 AI 自测任务。
 *
 * 说明：
 * 1. 只读取、不写入数据库。
 * 2. 不污染模板、不修改聊天状态。
 * 3. 返回可直接展示给用户的测试结果与返回预览。
 */

import { runGeneration, runEmbed, runRerank, MEMORY_TASKS } from './memoryLlmBridge';
import type { MemoryAiTaskId, MemoryAiTaskRouteStatus } from './ai-health-types';
import { getHealthSnapshot, getTaskRouteStatus, refreshHealthSnapshot } from './ai-health-center';

export interface AiSelfTestResult {
    taskId: MemoryAiTaskId;
    ok: boolean;
    durationMs: number;
    error?: string;
    detail?: string;
    resourceId?: string;
    resourceLabel?: string;
    model?: string;
    resolvedBy?: string;
    blockedReason?: string;
    source?: 'tavern' | 'custom';
    responsePreview?: string;
}

const SAMPLE_EVENTS_TEXT: string = [
    '[10:00] chat.message.received: 你好，我在云端城堡等你。',
    '[10:01] chat.message.sent: 好的，我马上出发。',
    '[10:02] chat.message.received: 记得带上圣光护符。',
].join('\n');

const SAMPLE_WORLD_INFO: string = '世界名称：幻域。背景：这是一个剑与魔法的世界，浮空城堡悬于天际。';
const SAMPLE_EMBED_TEXT: string = '这是一段用于向量化自测的文本。';
const SAMPLE_RERANK_QUERY: string = '角色关系';
const SAMPLE_RERANK_DOCS: string[] = [
    '艾琳和利奥是搭档。',
    '今天天气很好。',
    '城堡位于北方高原。',
];

/**
 * 功能：把任意返回数据压缩成适合界面展示的预览文本。
 * @param value 原始返回值。
 * @returns 截断后的可读预览文本。
 */
function buildResponsePreview(value: unknown): string {
    if (value == null) return '';
    try {
        const json = JSON.stringify(value, null, 2);
        return json.length > 1200 ? `${json.slice(0, 1200)}\n...` : json;
    } catch {
        const text = String(value);
        return text.length > 1200 ? `${text.slice(0, 1200)}\n...` : text;
    }
}

/**
 * 功能：把路由预览信息附加到测试结果中。
 * @param routeStatus 当前任务的路由状态。
 * @param result 原始测试结果。
 * @returns 带路由信息的测试结果。
 */
function attachRouteInfo(
    routeStatus: MemoryAiTaskRouteStatus | null,
    result: AiSelfTestResult,
): AiSelfTestResult {
    const route = routeStatus?.route;
    return {
        ...result,
        resourceId: route?.resourceId,
        resourceLabel: route?.resourceLabel,
        model: route?.model,
        resolvedBy: route?.resolvedBy,
        blockedReason: result.blockedReason || routeStatus?.blockedReason,
        source: route?.source,
    };
}

/**
 * 功能：为被阻塞的测试构造统一结果。
 * @param taskId 目标任务 ID。
 * @param routeStatus 当前任务的路由状态。
 * @param blockedReason 阻塞原因。
 * @returns 阻塞态测试结果。
 */
function buildBlockedResult(
    taskId: MemoryAiTaskId,
    routeStatus: MemoryAiTaskRouteStatus | null,
    blockedReason: string,
): AiSelfTestResult {
    return attachRouteInfo(routeStatus, {
        taskId,
        ok: false,
        durationMs: 0,
        error: blockedReason,
        blockedReason,
        detail: '当前任务暂不可测试',
        responsePreview: '',
    });
}

/**
 * 功能：刷新健康快照并判断目标测试当前是否可运行。
 * @param taskId 目标任务 ID。
 * @returns 路由状态或阻塞结果。
 */
async function ensureTaskReady(taskId: MemoryAiTaskId): Promise<{
    routeStatus: MemoryAiTaskRouteStatus | null;
    blockedResult: AiSelfTestResult | null;
}> {
    await refreshHealthSnapshot();
    const snapshot = getHealthSnapshot();
    const routeStatus = getTaskRouteStatus(taskId);

    if (!snapshot.llmHubMounted || !snapshot.consumerRegistered) {
        return {
            routeStatus,
            blockedResult: buildBlockedResult(taskId, routeStatus, snapshot.diagnosisText),
        };
    }
    if (!routeStatus?.available) {
        return {
            routeStatus,
            blockedResult: buildBlockedResult(taskId, routeStatus, routeStatus?.blockedReason || '当前路由不可用'),
        };
    }
    return { routeStatus, blockedResult: null };
}

/**
 * 功能：执行摘要自测。
 * @returns 摘要自测结果。
 */
async function testSummarize(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId;
    const { routeStatus, blockedResult } = await ensureTaskReady(taskId);
    if (blockedResult) return blockedResult;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            systemPrompt: '你是摘要生成自测助手。请返回 JSON：{ "ok": true, "proposal": { "summaries": [{ "level": "message", "content": "自测摘要" }] }, "confidence": 0.9 }',
            events: SAMPLE_EVENTS_TEXT,
            schemaContext: '自测模式，请直接返回固定 JSON。',
        }, { maxTokens: 300, maxLatencyMs: 0, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return attachRouteInfo(routeStatus, {
                taskId,
                ok: true,
                durationMs: duration,
                detail: '摘要生成正常',
                resourceId: result.meta?.resourceId,
                model: result.meta?.model,
                responsePreview: buildResponsePreview(result.data),
            });
        }
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: duration,
            error: result.error,
            detail: result.reasonCode,
            blockedReason: result.reasonCode,
            responsePreview: '',
        });
    } catch (error: unknown) {
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: Date.now() - start,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        });
    }
}

/**
 * 功能：执行结构化抽取自测。
 * @returns 抽取自测结果。
 */
async function testExtract(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.EXTRACT as MemoryAiTaskId;
    const { routeStatus, blockedResult } = await ensureTaskReady(taskId);
    if (blockedResult) return blockedResult;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            systemPrompt: '你是结构化抽取自测助手。请返回 JSON：{ "ok": true, "proposal": { "facts": [{ "type": "relationship", "value": "自测事实" }] }, "confidence": 0.8 }',
            events: SAMPLE_EVENTS_TEXT,
            schemaContext: '自测模式，请直接返回固定 JSON。',
        }, { maxTokens: 400, maxLatencyMs: 0, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return attachRouteInfo(routeStatus, {
                taskId,
                ok: true,
                durationMs: duration,
                detail: '结构化抽取正常',
                resourceId: result.meta?.resourceId,
                model: result.meta?.model,
                responsePreview: buildResponsePreview(result.data),
            });
        }
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: duration,
            error: result.error,
            detail: result.reasonCode,
            blockedReason: result.reasonCode,
            responsePreview: '',
        });
    } catch (error: unknown) {
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: Date.now() - start,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        });
    }
}

/**
 * 功能：执行模板构建自测。
 * @returns 模板构建自测结果。
 */
async function testTemplateBuild(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId;
    const { routeStatus, blockedResult } = await ensureTaskReady(taskId);
    if (blockedResult) return blockedResult;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            messages: [
                {
                    role: 'system',
                    content: [
                        '你是模板构建自测助手。',
                        '请忽略用户输入中的世界内容，不要自行设计字段，不要补充解释，不要输出 Markdown 代码块。',
                        '你必须返回且只能返回下面这段纯 JSON，字段名和结构必须完全一致：',
                        '{',
                        '  "templateId": "selftest-template",',
                        '  "worldType": "fantasy",',
                        '  "name": "自测模板",',
                        '  "entities": {',
                        '    "world": {',
                        '      "primaryKey": "id",',
                        '      "fields": ["id", "name", "background"]',
                        '    }',
                        '  },',
                        '  "factTypes": [',
                        '    {',
                        '      "type": "world_name",',
                        '      "pathPattern": "world/:id/name",',
                        '      "slots": ["id", "name"]',
                        '    },',
                        '    {',
                        '      "type": "world_background",',
                        '      "pathPattern": "world/:id/background",',
                        '      "slots": ["id", "background"]',
                        '    }',
                        '  ],',
                        '  "extractPolicies": {},',
                        '  "injectionLayout": {}',
                        '}',
                    ].join('\n'),
                },
                { role: 'user', content: `${SAMPLE_WORLD_INFO}\n\n请直接返回上面要求的固定 JSON。` },
            ],
            temperature: 0.1,
        }, { maxTokens: 500, maxLatencyMs: 0, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return attachRouteInfo(routeStatus, {
                taskId,
                ok: true,
                durationMs: duration,
                detail: '模板构建正常',
                resourceId: result.meta?.resourceId,
                model: result.meta?.model,
                responsePreview: buildResponsePreview(result.data),
            });
        }
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: duration,
            error: result.error,
            detail: result.reasonCode,
            blockedReason: result.reasonCode,
            responsePreview: '',
        });
    } catch (error: unknown) {
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: Date.now() - start,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        });
    }
}

/**
 * 功能：执行向量化自测。
 * @returns 向量化自测结果。
 */
async function testVectorEmbed(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId;
    const { routeStatus, blockedResult } = await ensureTaskReady(taskId);
    if (blockedResult) return blockedResult;
    const start = Date.now();
    try {
        const result = await runEmbed([SAMPLE_EMBED_TEXT], { maxLatencyMs: 10000 });
        const duration = Date.now() - start;
        if (result?.ok !== false && Array.isArray(result?.vectors) && result.vectors.length > 0) {
            return attachRouteInfo(routeStatus, {
                taskId,
                ok: true,
                durationMs: duration,
                detail: `维度：${result.vectors[0]?.length ?? '?'}`,
                resourceId: result.meta?.resourceId,
                model: result.meta?.model,
                responsePreview: buildResponsePreview({
                    vectorCount: result.vectors.length,
                    dimension: result.vectors[0]?.length ?? 0,
                }),
            });
        }
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: duration,
            error: result?.error || '返回格式异常',
            responsePreview: '',
        });
    } catch (error: unknown) {
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: Date.now() - start,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        });
    }
}

/**
 * 功能：执行重排自测。
 * @returns 重排自测结果。
 */
async function testRerank(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId;
    const { routeStatus, blockedResult } = await ensureTaskReady(taskId);
    if (blockedResult) return blockedResult;
    const start = Date.now();
    try {
        const result = await runRerank(SAMPLE_RERANK_QUERY, SAMPLE_RERANK_DOCS, 2);
        const duration = Date.now() - start;
        if (result?.ok !== false && Array.isArray(result?.results)) {
            return attachRouteInfo(routeStatus, {
                taskId,
                ok: true,
                durationMs: duration,
                detail: `返回 ${result.results.length} 项`,
                resourceId: result.meta?.resourceId,
                model: result.meta?.model,
                responsePreview: buildResponsePreview(result.results),
            });
        }
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: duration,
            error: result?.error || '返回格式异常',
            responsePreview: '',
        });
    } catch (error: unknown) {
        return attachRouteInfo(routeStatus, {
            taskId,
            ok: false,
            durationMs: Date.now() - start,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        });
    }
}

/**
 * 功能：执行单项自测。
 * @param taskId 目标任务标识。
 * @returns 单项自测结果。
 */
export async function runSingleSelfTest(taskId: MemoryAiTaskId): Promise<AiSelfTestResult> {
    switch (taskId) {
        case MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId:
            return testSummarize();
        case MEMORY_TASKS.EXTRACT as MemoryAiTaskId:
            return testExtract();
        case MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId:
            return testTemplateBuild();
        case MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId:
            return testVectorEmbed();
        case MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId:
            return testRerank();
        default:
            return {
                taskId,
                ok: false,
                durationMs: 0,
                error: `未知任务：${taskId}`,
                responsePreview: '',
            };
    }
}

/**
 * 功能：顺序执行全部五类自测。
 * @returns 全部自测结果列表。
 */
export async function runAiSelfTests(): Promise<AiSelfTestResult[]> {
    return [
        await runSingleSelfTest(MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId),
        await runSingleSelfTest(MEMORY_TASKS.EXTRACT as MemoryAiTaskId),
        await runSingleSelfTest(MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId),
        await runSingleSelfTest(MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId),
        await runSingleSelfTest(MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId),
    ];
}
