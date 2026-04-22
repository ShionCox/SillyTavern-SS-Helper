import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';
import type { MemoryLLMApi } from '../memory-summary';
import type {
    MemoryTakeoverBatch,
    MemoryTakeoverCreateInput,
    MemoryTakeoverPreviewBatchEstimate,
    MemoryTakeoverPreviewEstimate,
} from '../types';
import { buildTakeoverBatches, buildTakeoverPlan, validateTakeoverBatchCoverage } from './takeover-planner';
import type { MemoryTakeoverSourceBundle } from './takeover-source';
import { sliceTakeoverMessages } from './takeover-source';
import { buildTakeoverStructuredTaskRequest } from './takeover-llm';
import { assembleTakeoverBatchPromptAssembly } from './takeover-batch-runner';

export const TAKEOVER_TOKEN_WARNING_THRESHOLD: number = 100000;

let takeoverTokenizer: Tiktoken | null = null;

/**
 * 功能：根据真实接管请求结构预估每一轮的 prompt token。
 * @param input 预估输入。
 * @returns token 预估汇总。
 */
export async function buildTakeoverPreviewEstimate(input: {
    chatKey: string;
    chatId: string;
    totalFloors: number;
    llm: MemoryLLMApi | null;
    pluginId: string;
    defaults: {
        recentFloors: number;
        batchSize: number;
        prioritizeRecent: boolean;
        autoContinue: boolean;
        autoConsolidate: boolean;
        pauseOnError: boolean;
    };
    config?: MemoryTakeoverCreateInput;
    sourceBundle: MemoryTakeoverSourceBundle;
    threshold?: number;
}): Promise<MemoryTakeoverPreviewEstimate> {
    const threshold: number = Math.max(1, Math.trunc(Number(input.threshold) || TAKEOVER_TOKEN_WARNING_THRESHOLD));
    const plan = buildTakeoverPlan({
        chatKey: input.chatKey,
        chatId: input.chatId,
        takeoverId: `takeover:preview:${input.chatKey}`,
        totalFloors: input.totalFloors,
        defaults: input.defaults,
        config: input.config,
    });
    const batches = buildTakeoverBatches({
        takeoverId: plan.takeoverId,
        range: plan.range,
        activeWindow: plan.activeWindow,
        batchSize: plan.batchSize,
    });
    const historyBatches = batches.filter((batch: MemoryTakeoverBatch): boolean => batch.category === 'history');
    const coverage = validateTakeoverBatchCoverage(plan.range, batches);
    const batchEstimates: MemoryTakeoverPreviewBatchEstimate[] = await Promise.all(
        batches.map(async (batch: MemoryTakeoverBatch): Promise<MemoryTakeoverPreviewBatchEstimate> => {
            const sourceMessages = sliceTakeoverMessages(input.sourceBundle, batch.range);
            const assembly = await assembleTakeoverBatchPromptAssembly({
                llm: input.llm,
                pluginId: input.pluginId,
                messages: sourceMessages,
            });
            const request = await buildTakeoverStructuredTaskRequest({
                systemSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_SYSTEM' : 'TAKEOVER_BATCH_SYSTEM',
                schemaSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_SCHEMA' : 'TAKEOVER_BATCH_SCHEMA',
                sampleSection: batch.category === 'active' ? 'TAKEOVER_ACTIVE_OUTPUT_SAMPLE' : 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
                payload: batch.category === 'active'
                    ? {
                        range: batch.range,
                        messages: assembly.extractionMessages,
                        hintContext: assembly.channels.hintText || undefined,
                    }
                    : {
                        batchId: batch.batchId,
                        batchCategory: batch.category,
                        range: batch.range,
                        knownContext: {
                            actorHints: [],
                            stableFacts: [],
                            relationState: [],
                            taskState: [],
                            worldState: [],
                            knownEntities: {
                                actors: [],
                                organizations: [],
                                cities: [],
                                nations: [],
                                locations: [],
                                tasks: [],
                                worldStates: [],
                            },
                            updateHint: '',
                        },
                        messages: assembly.extractionMessages,
                        hintContext: assembly.channels.hintText || undefined,
                    },
            });
            const estimatedPromptTokens: number = estimateChatMessageTokens(request.messages);
            return {
                batchId: batch.batchId,
                batchIndex: batch.batchIndex,
                category: batch.category,
                label: resolvePreviewBatchLabel(
                    batch,
                    historyBatches.findIndex((item: MemoryTakeoverBatch): boolean => item.batchId === batch.batchId) + 1,
                    historyBatches.length,
                ),
                range: batch.range,
                messageCount: assembly.extractionMessages.length,
                estimatedPromptTokens,
                overWarningThreshold: estimatedPromptTokens > threshold,
            };
        }),
    );

    return {
        mode: plan.mode,
        totalFloors: plan.totalFloors,
        range: plan.range,
        activeWindow: plan.activeWindow,
        coverageSummary: coverage.covered
            ? `已计划覆盖：${plan.range.startFloor}-${plan.range.endFloor}，共 ${batches.length} 批。`
            : `覆盖异常：缺少 ${coverage.uncoveredRanges.map((item) => `${item.startFloor}-${item.endFloor}`).join('、')}。`,
        batchSize: plan.batchSize,
        useActiveSnapshot: plan.useActiveSnapshot,
        activeSnapshotFloors: plan.activeSnapshotFloors,
        threshold,
        totalBatches: batchEstimates.length,
        batches: batchEstimates,
        hasOverflow: batchEstimates.some((item: MemoryTakeoverPreviewBatchEstimate): boolean => item.overWarningThreshold),
        overflowWarnings: batchEstimates
            .filter((item: MemoryTakeoverPreviewBatchEstimate): boolean => item.overWarningThreshold)
            .map((item: MemoryTakeoverPreviewBatchEstimate): string => {
                return `${item.label}（${item.range.startFloor}-${item.range.endFloor} 层）预计 ${item.estimatedPromptTokens} token，已超过 10 万阈值。`;
            }),
    };
}

/**
 * 功能：估算聊天消息数组的 token 数。
 * @param messages 聊天消息。
 * @returns 预计 token 数。
 */
export function estimateChatMessageTokens(messages: Array<{ role: 'system' | 'user'; content: string }>): number {
    const normalizedPayload: string = JSON.stringify(messages ?? []);
    return getTakeoverTokenizer().encode(normalizedPayload).length;
}

/**
 * 功能：返回接管预估使用的 tokenizer。
 * @returns tokenizer 实例。
 */
function getTakeoverTokenizer(): Tiktoken {
    if (!takeoverTokenizer) {
        takeoverTokenizer = new Tiktoken(o200kBase);
    }
    return takeoverTokenizer;
}

/**
 * 功能：生成预估批次展示名称。
 * @param batch 接管批次。
 * @returns 展示名称。
 */
function resolvePreviewBatchLabel(
    batch: MemoryTakeoverBatch,
    historyBatchIndex: number,
    historyBatchTotal: number,
): string {
    if (batch.category === 'active') {
        return '最近快照';
    }
    return `第 ${Math.max(1, historyBatchIndex)} / ${Math.max(1, historyBatchTotal)} 批`;
}
