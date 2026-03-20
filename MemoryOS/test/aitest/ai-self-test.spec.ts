import { describe, expect, it, vi } from 'vitest';

interface ManualAiTestInput {
    contentText?: string;
    queryText?: string;
    docsText?: string;
    maxTokens?: number;
    topK?: number;
}

interface ManualAiTestResult {
    ok: boolean;
    detail: string;
    responsePreview: string;
}

/**
 * 功能：规范化手动测试输入文本。
 * @param value 原始输入
 * @returns 去除首尾空白后的文本
 */
function normalizeManualText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：拆分手动输入的重排候选文档。
 * @param value 多行文档文本
 * @returns 清洗后的文档数组
 */
function splitManualDocs(value: string): string[] {
    return value
        .split(/\r?\n+/)
        .map((item: string): string => normalizeManualText(item))
        .filter(Boolean);
}

/**
 * 功能：打印测试结果，便于直接查看返回内容。
 * @param label 测试标签
 * @param result 测试结果
 * @returns 无返回值
 */
function printManualTestResult(label: string, result: ManualAiTestResult): void {
    console.log(`\n[${label}] 成功=${result.ok}`);
    console.log(`说明：${result.detail}`);
    console.log(`结果：${result.responsePreview}`);
}

/**
 * 功能：执行手动重排测试。
 * @param input 手动输入参数
 * @param runRerank 重排调用函数
 * @returns 测试结果
 */
async function runManualRerankTest(
    input: ManualAiTestInput,
    runRerank: (query: string, docs: string[], topK: number) => Promise<{ results: unknown[] }>,
): Promise<ManualAiTestResult> {
    const query = normalizeManualText(input.queryText);
    const docs = splitManualDocs(String(input.docsText ?? ''));
    const topK = Math.max(1, Number(input.topK ?? 2) || 2);
    const result = await runRerank(query, docs, topK);
    return {
        ok: true,
        detail: `输入 ${docs.length} 条候选，返回 ${result.results.length} 条排序结果`,
        responsePreview: JSON.stringify({ query, docs, results: result.results }, null, 2),
    };
}

/**
 * 功能：执行手动向量测试。
 * @param input 手动输入参数
 * @param runEmbed 向量调用函数
 * @returns 测试结果
 */
async function runManualEmbedTest(
    input: ManualAiTestInput,
    runEmbed: (texts: string[]) => Promise<{ vectors: number[][] }>,
): Promise<ManualAiTestResult> {
    const contentText = normalizeManualText(input.contentText);
    const result = await runEmbed([contentText]);
    return {
        ok: true,
        detail: `向量数量 ${result.vectors.length}，首条维度 ${result.vectors[0]?.length ?? 0}`,
        responsePreview: JSON.stringify({
            inputText: contentText,
            vectorCount: result.vectors.length,
            firstVectorLength: result.vectors[0]?.length ?? 0,
        }, null, 2),
    };
}

/**
 * 功能：执行手动生成测试。
 * @param input 手动输入参数
 * @param runGeneration 生成调用函数
 * @returns 测试结果
 */
async function runManualGenerationTest(
    input: ManualAiTestInput,
    runGeneration: (payload: { events: string; maxTokens: number }) => Promise<{ data: unknown }>,
): Promise<ManualAiTestResult> {
    const events = normalizeManualText(input.contentText);
    const maxTokens = Math.max(64, Number(input.maxTokens ?? 300) || 300);
    const result = await runGeneration({ events, maxTokens });
    return {
        ok: true,
        detail: '生成调用成功',
        responsePreview: JSON.stringify(result.data, null, 2),
    };
}

describe('aitest helper', (): void => {
    it('手动重排测试会使用输入的查询和候选文档', async (): Promise<void> => {
        const runRerank = vi.fn().mockResolvedValue({
            results: [{ index: 1, score: 0.9 }],
        });

        const result = await runManualRerankTest({
            queryText: '世界规则',
            docsText: '第一条候选\n\n第二条候选\n第三条候选',
        }, runRerank);

        printManualTestResult('手动重排测试', result);

        expect(runRerank).toHaveBeenCalledWith('世界规则', ['第一条候选', '第二条候选', '第三条候选'], 2);
        expect(result.ok).toBe(true);
        expect(result.responsePreview).toContain('世界规则');
        expect(result.responsePreview).toContain('第二条候选');
    });

    it('手动向量测试会使用输入文本调用向量接口', async (): Promise<void> => {
        const runEmbed = vi.fn().mockResolvedValue({
            vectors: [[0.1, 0.2, 0.3]],
        });

        const result = await runManualEmbedTest({
            contentText: '这是用于向量化测试的文本',
        }, runEmbed);

        printManualTestResult('手动向量测试', result);

        expect(runEmbed).toHaveBeenCalledWith(['这是用于向量化测试的文本']);
        expect(result.ok).toBe(true);
        expect(result.detail).toContain('首条维度');
    });

    it('手动生成测试会把文本和 token 上限传给生成接口', async (): Promise<void> => {
        const runGeneration = vi.fn().mockResolvedValue({
            data: {
                summary: '冷启动摘要结果',
            },
        });

        const result = await runManualGenerationTest({
            contentText: '角色：Alice，冷静克制的调查员。',
            maxTokens: 256,
        }, runGeneration);

        printManualTestResult('手动生成测试', result);

        expect(runGeneration).toHaveBeenCalledWith({
            events: '角色：Alice，冷静克制的调查员。',
            maxTokens: 256,
        });
        expect(result.ok).toBe(true);
        expect(result.responsePreview).toContain('冷启动摘要结果');
    });
});
