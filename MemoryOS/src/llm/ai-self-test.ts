/**
 * MemoryOS AI 自测模块
 *
 * 五类任务级只读自测，使用最小固定样例。
 * 不写入数据库、不改模板、不污染聊天状态，只返回诊断结果。
 */

import { runGeneration, runEmbed, runRerank, MEMORY_TASKS } from './memoryLlmBridge';
import type { MemoryAiTaskId } from './ai-health-types';
import { getHealthSnapshot } from './ai-health-center';

export interface AiSelfTestResult {
    taskId: MemoryAiTaskId;
    ok: boolean;
    durationMs: number;
    error?: string;
    detail?: string;
}

// ── 固定样例数据 ──

const SAMPLE_EVENTS_TEXT = [
    '[10:00] chat.message.received: 你好，我在云端城堡等你。',
    '[10:01] chat.message.sent: 好的，我马上出发。',
    '[10:02] chat.message.received: 记得带上圣光护符。',
].join('\n');

const SAMPLE_WORLD_INFO = `世界名称：幻域。背景：这是一个剑与魔法的世界，浮空城堡悬于天际。`;

const SAMPLE_EMBED_TEXT = '这是一段用于向量化自测的文本。';

const SAMPLE_RERANK_QUERY = '角色关系';
const SAMPLE_RERANK_DOCS = [
    '艾琳和利奥是搭档。',
    '今天天气很好。',
    '城堡位于北方高原。',
];

// ── 单项自测函数 ──

async function testSummarize(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            systemPrompt: '你是摘要生成自测助手。请返回 JSON：{ "ok": true, "proposal": { "summaries": [{ "level": "message", "content": "自测摘要" }] }, "confidence": 0.9 }',
            events: SAMPLE_EVENTS_TEXT,
            schemaContext: '自测模式，请直接返回固定 JSON。',
        }, { maxTokens: 300, maxLatencyMs: 10000, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return { taskId, ok: true, durationMs: duration, detail: '摘要生成正常' };
        }
        return { taskId, ok: false, durationMs: duration, error: result.error, detail: result.reasonCode };
    } catch (e: any) {
        return { taskId, ok: false, durationMs: Date.now() - start, error: String(e?.message || e) };
    }
}

async function testExtract(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.EXTRACT as MemoryAiTaskId;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            systemPrompt: '你是结构化抽取自测助手。请返回 JSON：{ "ok": true, "proposal": { "facts": [{ "type": "relationship", "value": "自测事实" }] }, "confidence": 0.8 }',
            events: SAMPLE_EVENTS_TEXT,
            schemaContext: '自测模式，请直接返回固定 JSON。',
        }, { maxTokens: 400, maxLatencyMs: 10000, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return { taskId, ok: true, durationMs: duration, detail: '结构化抽取正常' };
        }
        return { taskId, ok: false, durationMs: duration, error: result.error, detail: result.reasonCode };
    } catch (e: any) {
        return { taskId, ok: false, durationMs: Date.now() - start, error: String(e?.message || e) };
    }
}

async function testTemplateBuild(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId;
    const start = Date.now();
    try {
        const result = await runGeneration(taskId, {
            messages: [
                { role: 'system', content: '你是模板构建自测助手。请返回 JSON：{ "worldType": "fantasy", "name": "自测模板", "entities": {}, "factTypes": [] }' },
                { role: 'user', content: SAMPLE_WORLD_INFO },
            ],
            temperature: 0.1,
        }, { maxTokens: 500, maxLatencyMs: 15000, maxCost: 0.05 });
        const duration = Date.now() - start;
        if (result.ok) {
            return { taskId, ok: true, durationMs: duration, detail: '模板构建正常' };
        }
        return { taskId, ok: false, durationMs: duration, error: result.error, detail: result.reasonCode };
    } catch (e: any) {
        return { taskId, ok: false, durationMs: Date.now() - start, error: String(e?.message || e) };
    }
}

async function testVectorEmbed(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId;
    const start = Date.now();
    try {
        const result = await runEmbed([SAMPLE_EMBED_TEXT], { maxLatencyMs: 10000 }) as any;
        const duration = Date.now() - start;
        if (result?.ok !== false && Array.isArray(result?.vectors) && result.vectors.length > 0) {
            return { taskId, ok: true, durationMs: duration, detail: `维度: ${result.vectors[0]?.length ?? '?'}` };
        }
        return { taskId, ok: false, durationMs: duration, error: result?.error || '返回格式异常' };
    } catch (e: any) {
        return { taskId, ok: false, durationMs: Date.now() - start, error: String(e?.message || e) };
    }
}

async function testRerank(): Promise<AiSelfTestResult> {
    const taskId = MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId;
    const start = Date.now();
    try {
        const result = await runRerank(SAMPLE_RERANK_QUERY, SAMPLE_RERANK_DOCS, 2) as any;
        const duration = Date.now() - start;
        if (result?.ok !== false && Array.isArray(result?.results)) {
            return { taskId, ok: true, durationMs: duration, detail: `返回 ${result.results.length} 项` };
        }
        return { taskId, ok: false, durationMs: duration, error: result?.error || '返回格式异常' };
    } catch (e: any) {
        return { taskId, ok: false, durationMs: Date.now() - start, error: String(e?.message || e) };
    }
}

// ── 公共接口 ──

/**
 * 运行全部五类自测，返回每项结果。
 * 不写入数据库，不改模板，不污染聊天状态。
 */
export async function runAiSelfTests(): Promise<AiSelfTestResult[]> {
    const snapshot = getHealthSnapshot();
    if (!snapshot.llmHubMounted || !snapshot.consumerRegistered) {
        const unavailableResult = (taskId: MemoryAiTaskId): AiSelfTestResult => ({
            taskId,
            ok: false,
            durationMs: 0,
            error: snapshot.diagnosisText,
        });
        return [
            unavailableResult(MEMORY_TASKS.SUMMARIZE as MemoryAiTaskId),
            unavailableResult(MEMORY_TASKS.EXTRACT as MemoryAiTaskId),
            unavailableResult(MEMORY_TASKS.TEMPLATE_BUILD as MemoryAiTaskId),
            unavailableResult(MEMORY_TASKS.VECTOR_EMBED as MemoryAiTaskId),
            unavailableResult(MEMORY_TASKS.SEARCH_RERANK as MemoryAiTaskId),
        ];
    }

    // 依次执行（避免并发导致 LLMHub 背压）
    const results: AiSelfTestResult[] = [];
    results.push(await testSummarize());
    results.push(await testExtract());
    results.push(await testTemplateBuild());
    results.push(await testVectorEmbed());
    results.push(await testRerank());
    return results;
}

/**
 * 运行单项自测。
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
            return { taskId, ok: false, durationMs: 0, error: `未知任务: ${taskId}` };
    }
}
