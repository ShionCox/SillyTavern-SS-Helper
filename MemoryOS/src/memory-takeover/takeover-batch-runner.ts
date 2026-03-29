import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverRange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：定义旧聊天批处理可复用的已知上下文。
 */
export interface MemoryTakeoverKnownContext {
    actorHints: string[];
    existingActorCards: Array<{
        actorKey: string;
        displayName: string;
    }>;
    stableFacts: string[];
    relationState: string[];
    taskState: string[];
    worldState: string[];
    updateHint: string;
}

/**
 * 功能：统计批次消息的角色分布。
 * @param messages 消息列表。
 * @returns 角色统计对象。
 */
function computeBatchRoleStats(messages: MemoryTakeoverMessageSlice[]): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const message of messages) {
        stats[message.role] = (stats[message.role] || 0) + 1;
    }
    return stats;
}

/**
 * 功能：把字符串数组去重、去空并限制数量。
 * @param values 原始列表。
 * @param limit 最多保留数量。
 * @returns 处理后的字符串数组。
 */
function normalizeStringList(values: string[], limit: number): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (!normalized || result.includes(normalized)) {
            continue;
        }
        result.push(normalized);
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

/**
 * 功能：归一化角色卡候选列表。
 * @param actorCards 原始角色卡候选。
 * @param limit 最多保留数量。
 * @returns 去重后的角色卡候选。
 */
function normalizeActorCards(
    actorCards: MemoryTakeoverActorCardCandidate[],
    limit: number,
): MemoryTakeoverActorCardCandidate[] {
    const result: MemoryTakeoverActorCardCandidate[] = [];
    const seen = new Set<string>();
    for (const actorCard of actorCards) {
        const actorKey = String(actorCard.actorKey ?? '').trim().toLowerCase();
        const displayName = String(actorCard.displayName ?? '').trim();
        if (!actorKey || actorKey === 'user' || !displayName) {
            continue;
        }
        if (seen.has(actorKey)) {
            continue;
        }
        seen.add(actorKey);
        result.push({
            actorKey,
            displayName,
            aliases: normalizeStringList(actorCard.aliases ?? [], 8),
            identityFacts: normalizeStringList(actorCard.identityFacts ?? [], 8),
            originFacts: normalizeStringList(actorCard.originFacts ?? [], 8),
            traits: normalizeStringList(actorCard.traits ?? [], 8),
        });
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

/**
 * 功能：根据已完成批次构建后续批次可用的已知上下文。
 * @param batchResults 已完成的批次结果。
 * @param existingActorCards 当前聊天已存在的角色卡列表。
 * @returns 精简后的已知上下文。
 */
export function buildTakeoverKnownContext(
    batchResults: MemoryTakeoverBatchResult[],
    existingActorCards: Array<{ actorKey: string; displayName: string }> = [],
): MemoryTakeoverKnownContext {
    const actorHints = normalizeStringList([
        ...existingActorCards.map((item: { actorKey: string; displayName: string }): string => item.displayName),
        ...batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.actorCards.map((actorCard: MemoryTakeoverActorCardCandidate): string => actorCard.displayName);
        }),
        ...batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.stableFacts.map((fact) => fact.subject);
        }),
        ...batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.relationTransitions.map((transition) => transition.target);
        }),
    ], 16);
    const stableFacts = normalizeStringList(
        batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.stableFacts.map((fact) => `${fact.subject}${fact.predicate}${fact.value}`);
        }),
        12,
    );
    const relationState = normalizeStringList(
        batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.relationTransitions.map((transition) => `${transition.target}：${transition.to}`);
        }),
        8,
    );
    const taskState = normalizeStringList(
        batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.taskTransitions.map((transition) => `${transition.task}：${transition.to}`);
        }),
        8,
    );
    const worldState = normalizeStringList(
        batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.worldStateChanges.map((change) => `${change.key}：${change.value}`);
        }),
        8,
    );

    return {
        actorHints,
        existingActorCards: normalizeActorCards(
            existingActorCards.map((item: { actorKey: string; displayName: string }): MemoryTakeoverActorCardCandidate => ({
                actorKey: item.actorKey,
                displayName: item.displayName,
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            })),
            16,
        ).map((item: MemoryTakeoverActorCardCandidate) => ({
            actorKey: item.actorKey,
            displayName: item.displayName,
        })),
        stableFacts,
        relationState,
        taskState,
        worldState,
        updateHint: batchResults.length > 0
            ? '以下内容来自前面已经处理过的批次，可用来判断本批是在补充新信息，还是在更新已有角色卡、关系、任务或世界状态。'
            : '当前还没有前置批次结果，本批按首次识别处理即可。',
    };
}

/**
 * 功能：计算批次显示编号，避免把最近快照算进历史批次编号里。
 * @param batch 当前批次。
 * @param totalBatches 总批次数。
 * @returns 展示编号。
 */
function resolveBatchDisplayProgress(batch: MemoryTakeoverBatch, totalBatches: number): { current: number; total: number } {
    if (batch.category === 'history') {
        return {
            current: Math.max(1, batch.batchIndex),
            total: Math.max(1, totalBatches - 1),
        };
    }
    return {
        current: 1,
        total: Math.max(1, totalBatches),
    };
}

/**
 * 功能：执行单个历史批次分析。
 * @param input 执行输入。
 * @returns 批次结果。
 */
export async function runTakeoverBatch(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    batch: MemoryTakeoverBatch;
    totalBatches: number;
    messages: MemoryTakeoverMessageSlice[];
    previousBatchResults?: MemoryTakeoverBatchResult[];
    existingActorCards?: Array<{ actorKey: string; displayName: string }>;
}): Promise<MemoryTakeoverBatchResult> {
    const roleStats = computeBatchRoleStats(input.messages);
    const userCount: number = roleStats.user || 0;
    const assistantCount: number = roleStats.assistant || 0;

    logger.info(`[takeover][batch][${input.batch.batchId}] role校验：`, {
        range: input.batch.range,
        total: input.messages.length,
        roleStats,
        floors: input.messages.slice(0, 10).map((message) => ({
            floor: message.floor,
            role: message.role,
            name: message.name,
        })),
    });

    if (input.messages.length > 0 && (userCount === 0 || assistantCount === 0)) {
        logger.warn(
            `[takeover][batch][${input.batch.batchId}] 单边批次告警：仅包含 ${userCount > 0 ? 'USER' : 'ASSISTANT'} 消息（user=${userCount}, assistant=${assistantCount}）`,
        );
    }

    const summary: string = input.messages
        .slice(0, 6)
        .map((message: MemoryTakeoverMessageSlice): string => `第${message.floor}层[${message.role}] ${message.content}`)
        .join('\n');
    const fallback: MemoryTakeoverBatchResult = {
        takeoverId: input.batch.takeoverId,
        batchId: input.batch.batchId,
        summary: summary || `第 ${input.batch.range.startFloor} ~ ${input.batch.range.endFloor} 层没有可提取摘要。`,
        actorCards: [],
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [input.batch.category === 'active' ? '最近活跃' : '历史补建'],
        sourceRange: input.batch.range,
        generatedAt: Date.now(),
    };
    const displayProgress = resolveBatchDisplayProgress(input.batch, input.totalBatches);
    const knownContext = buildTakeoverKnownContext(
        input.previousBatchResults ?? [],
        input.existingActorCards ?? [],
    );
    const structured = await runTakeoverStructuredTask<MemoryTakeoverBatchResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskId: 'memory_takeover_batch',
        taskDescription: `旧聊天处理（${displayProgress.current}/${displayProgress.total}）`,
        systemSection: 'TAKEOVER_BATCH_SYSTEM',
        schemaSection: 'TAKEOVER_BATCH_SCHEMA',
        sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
        payload: {
            batchId: input.batch.batchId,
            batchCategory: input.batch.category,
            range: input.batch.range,
            knownContext,
            messages: input.messages,
        },
        extraSystemInstruction: [
            '如果输入里提供了 knownContext，请把它视为前面批次已经识别出的可更新对象列表。',
            '处理角色时，先检查 knownContext.existingActorCards 与前面批次已经识别出的角色卡；若只是称呼变化、别名变化或信息补充，应继续使用已有 actorKey，不要重复创建同一角色。',
            '只有当本批次出现了一个稳定、反复出现、并且明显不是 user 的新角色，同时在已提供角色卡列表里找不到可匹配对象时，才允许把它加入 actorCards 作为新角色卡候选。',
            'actorCards 只放适合长期保存的非 user 角色，不要为 user 创建角色卡，也不要把一次性路人、纯群体称呼或不稳定指代写进 actorCards。',
            '如果某个角色已经存在于 knownContext.existingActorCards，请优先输出更新后的角色卡内容，并沿用原 actorKey。',
        ].join(''),
    });
    return structured
        ? {
            ...fallback,
            ...structured,
            actorCards: normalizeActorCards(structured.actorCards ?? [], 12),
            takeoverId: input.batch.takeoverId,
            batchId: input.batch.batchId,
            sourceRange: ensureRange(structured.sourceRange, input.batch.range),
            generatedAt: Date.now(),
        }
        : fallback;
}

/**
 * 功能：确保批次结果范围存在。
 * @param value 结构化输出范围。
 * @param fallback 默认范围。
 * @returns 规范化后的范围。
 */
function ensureRange(value: MemoryTakeoverRange | undefined, fallback: MemoryTakeoverRange): MemoryTakeoverRange {
    if (!value) {
        return fallback;
    }
    return {
        startFloor: Math.max(1, Math.trunc(Number(value.startFloor) || fallback.startFloor)),
        endFloor: Math.max(
            Math.trunc(Number(value.startFloor) || fallback.startFloor),
            Math.trunc(Number(value.endFloor) || fallback.endFloor),
        ),
    };
}
