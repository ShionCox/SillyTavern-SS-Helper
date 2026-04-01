import type {
    MemoryTakeoverBatch,
    MemoryTakeoverBatchAuditReport,
    MemoryTakeoverBatchResult,
    TakeoverSourceSegment,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import type { MemoryTakeoverKnownContext } from './takeover-batch-runner';
import type { MemoryTakeoverMessageSlice } from './takeover-source';
import { runTakeoverStructuredTask } from './takeover-llm';
import { applyActorCreationPolicy } from './actor-creation-policy';
import { sanitizeTakeoverBatchNarratives } from './narrative-sanitizer';
import { validateTakeoverNarratives } from './narrative-validator';

/**
 * 功能：定义接管修复服务输入。
 */
export interface TakeoverRepairServiceInput {
    llm: MemoryLLMApi | null;
    pluginId: string;
    batch: MemoryTakeoverBatch;
    knownContext: MemoryTakeoverKnownContext;
    messages: MemoryTakeoverMessageSlice[];
    segments: TakeoverSourceSegment[];
    result: MemoryTakeoverBatchResult;
    normalizeResult: (value: MemoryTakeoverBatchResult) => MemoryTakeoverBatchResult;
}

/**
 * 功能：执行接管批次的文案修复、角色补全与审计。
 * @param input 修复输入。
 * @returns 修复后的批次结果。
 */
export async function runTakeoverRepairService(input: TakeoverRepairServiceInput): Promise<MemoryTakeoverBatchResult> {
    let working = input.normalizeResult(input.result);
    let styleRepairTriggered = false;
    let actorCompletionTriggered = false;

    const firstSanitized = sanitizeTakeoverBatchNarratives(working);
    working = input.normalizeResult(firstSanitized.result);
    let validation = validateTakeoverNarratives(working);
    if (!validation.valid && input.llm) {
        styleRepairTriggered = true;
        const repaired = await requestStyleRepair(input, working);
        if (repaired) {
            working = input.normalizeResult(repaired);
            working = input.normalizeResult(sanitizeTakeoverBatchNarratives(working).result);
            validation = validateTakeoverNarratives(working);
        }
    }

    let actorPolicy = applyActorCreationPolicy(working, input.segments);
    working = {
        ...working,
        actorCards: actorPolicy.actorCards,
        candidateActors: actorPolicy.candidateActors,
        rejectedMentions: actorPolicy.rejectedMentions,
    };

    if (actorPolicy.actorCompletionMissingKeys.length > 0 && input.llm) {
        actorCompletionTriggered = true;
        const repaired = await requestActorCompletion(input, working);
        if (repaired) {
            working = input.normalizeResult(repaired);
            working = input.normalizeResult(sanitizeTakeoverBatchNarratives(working).result);
            actorPolicy = applyActorCreationPolicy(working, input.segments);
            working = {
                ...working,
                actorCards: actorPolicy.actorCards,
                candidateActors: actorPolicy.candidateActors,
                rejectedMentions: actorPolicy.rejectedMentions,
            };
        }
    }

    const finalSanitized = sanitizeTakeoverBatchNarratives(working);
    working = input.normalizeResult(finalSanitized.result);
    validation = validateTakeoverNarratives(working);

    const auditReport: MemoryTakeoverBatchAuditReport = {
        userPlaceholderReplacements: finalSanitized.stats.userPlaceholderReplacements,
        bannedPatternHits: finalSanitized.stats.bannedPatternHits,
        narrativeValidatorPassed: validation.valid,
        styleRepairTriggered,
        actorCompletionTriggered,
        confirmedActorCount: working.actorCards.length,
        candidateActorCount: working.candidateActors?.length ?? 0,
        rejectedMentionCount: working.rejectedMentions?.length ?? 0,
        invalidFieldPaths: validation.issues.map((item) => item.path),
    };

    return {
        ...working,
        sourceSegments: input.segments,
        auditReport,
        repairActions: [
            ...(working.repairActions ?? []),
            ...(styleRepairTriggered ? ['style_repair_retry'] : []),
            ...(actorCompletionTriggered ? ['actor_completion_retry'] : []),
        ],
    };
}

/**
 * 功能：请求文案风格修复重试。
 * @param input 修复输入。
 * @param result 当前结果。
 * @returns 修复后的结果。
 */
async function requestStyleRepair(
    input: TakeoverRepairServiceInput,
    result: MemoryTakeoverBatchResult,
): Promise<MemoryTakeoverBatchResult | null> {
    const rangeLabel = `${input.batch.range.startFloor}-${input.batch.range.endFloor}层`;
    return runTakeoverStructuredTask<MemoryTakeoverBatchResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskKey: 'memory_takeover_style_repair',
        taskDescription: `旧聊天处理文案修复（${input.batch.batchId} / ${rangeLabel}）`,
        systemSection: 'TAKEOVER_BATCH_SYSTEM',
        schemaSection: 'TAKEOVER_BATCH_SCHEMA',
        sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
        payload: {
            batchId: input.batch.batchId,
            range: input.batch.range,
            knownContext: input.knownContext,
            messages: input.messages,
            originalResult: result,
        },
        extraSystemInstruction: [
            '保持所有结构、字段、键名、数值、关系与事实不变，只修正自然语言字段的写法。',
            '所有指代主角/玩家的自然语言表达一律改为 `{{user}}`。',
            '删除“本批次”“当前剧情”“首次识别到”等系统视角词。',
            '所有 narrative 字段必须改写成故事设定集、角色小传、世界观摘要或悬念档案风格。',
            '不得新增事实、不得删减事实、不得改动 actorKey、entityKey、compareKey、bindings、reasonCodes。',
        ].join(''),
    });
}

/**
 * 功能：请求角色补全修复重试。
 * @param input 修复输入。
 * @param result 当前结果。
 * @returns 修复后的结果。
 */
async function requestActorCompletion(
    input: TakeoverRepairServiceInput,
    result: MemoryTakeoverBatchResult,
): Promise<MemoryTakeoverBatchResult | null> {
    const rangeLabel = `${input.batch.range.startFloor}-${input.batch.range.endFloor}层`;
    return runTakeoverStructuredTask<MemoryTakeoverBatchResult>({
        llm: input.llm,
        pluginId: input.pluginId,
        taskKey: 'memory_takeover_actor_completion',
        taskDescription: `旧聊天处理角色补全（${input.batch.batchId} / ${rangeLabel}）`,
        systemSection: 'TAKEOVER_BATCH_SYSTEM',
        schemaSection: 'TAKEOVER_BATCH_SCHEMA',
        sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
        payload: {
            batchId: input.batch.batchId,
            range: input.batch.range,
            knownContext: input.knownContext,
            messages: input.messages,
            originalResult: result,
        },
        extraSystemInstruction: [
            '保持原有结构尽量不变，补全遗漏的正式角色。',
            '检查故事正文中已确认出场、形成关键关系或已被 relationships 引用的角色。',
            '若该角色未进入 actorCards，则补入；若只出现在分析、注释、未来构思中，则只允许留在候选层，不得升级为正式角色。',
            '不要创建群体词、身份 title、地点、组织作为角色。',
        ].join(''),
    });
}
