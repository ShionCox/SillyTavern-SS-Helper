import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverRange,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { normalizeRelationTag } from '../constants/relationTags';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';
import { logger } from '../runtime/runtime-services';

/**
 * 功能：定义旧聊天批处理可复用的分类对象提示。
 */
export interface MemoryTakeoverKnownEntities {
    actors: Array<{ actorKey: string; displayName: string }>;
    organizations: Array<{ entityKey: string; displayName: string }>;
    cities: Array<{ entityKey: string; displayName: string }>;
    nations: Array<{ entityKey: string; displayName: string }>;
    locations: Array<{ entityKey: string; displayName: string }>;
    tasks: Array<{ entityKey: string; displayName: string }>;
    worldStates: Array<{ entityKey: string; displayName: string }>;
}

/**
 * 功能：定义旧聊天批处理可复用的已知上下文。
 */
export interface MemoryTakeoverKnownContext {
    actorHints: string[];
    stableFacts: string[];
    relationState: string[];
    taskState: string[];
    worldState: string[];
    knownEntities: MemoryTakeoverKnownEntities;
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
 * 功能：归一化带稳定标识的分类对象列表。
 * @param values 原始对象列表。
 * @param limit 最多保留数量。
 * @returns 去重后的对象列表。
 */
function normalizeEntityRefs(
    values: Array<{ entityKey: string; displayName: string }>,
    limit: number,
): Array<{ entityKey: string; displayName: string }> {
    const result: Array<{ entityKey: string; displayName: string }> = [];
    const seen = new Set<string>();
    for (const value of values) {
        const entityKey = String(value.entityKey ?? '').trim();
        const displayName = String(value.displayName ?? '').trim();
        if (!entityKey || !displayName || seen.has(entityKey)) {
            continue;
        }
        seen.add(entityKey);
        result.push({ entityKey, displayName });
        if (result.length >= limit) {
            break;
        }
    }
    return result;
}

/**
 * 功能：根据分类与显示名生成批次内可复用的临时对象键。
 * @param category 分类名称。
 * @param displayName 显示名。
 * @returns 临时对象键。
 */
function buildBatchEntityKey(category: string, displayName: string): string {
    const normalizedCategory = String(category ?? '').trim().toLowerCase() || 'entity';
    const normalizedDisplayName = String(displayName ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return `batch:${normalizedCategory}:${normalizedDisplayName || 'unknown'}`;
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
        if (!actorKey || actorKey === 'user' || !displayName || seen.has(actorKey)) {
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
 * 功能：归一化旧聊天接管输出的结构化关系卡。
 * @param relationships 原始关系卡列表。
 * @returns 去重并校验后的关系卡列表。
 */
function normalizeRelationshipCards(
    relationships: MemoryTakeoverRelationshipCard[],
): MemoryTakeoverRelationshipCard[] {
    const result: MemoryTakeoverRelationshipCard[] = [];
    const seen = new Set<string>();
    for (const relationship of relationships) {
        const sourceActorKey = String(relationship.sourceActorKey ?? '').trim().toLowerCase();
        const targetActorKey = String(relationship.targetActorKey ?? '').trim().toLowerCase();
        const relationTag = normalizeRelationTag(relationship.relationTag);
        const state = String(relationship.state ?? '').trim();
        const summary = String(relationship.summary ?? '').trim();
        if (!sourceActorKey || !targetActorKey || sourceActorKey === targetActorKey || !relationTag || !state || !summary) {
            continue;
        }
        const compareKey = `${sourceActorKey}::${targetActorKey}`;
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        result.push({
            sourceActorKey,
            targetActorKey,
            participants: normalizeStringList([
                sourceActorKey,
                targetActorKey,
                ...((relationship.participants ?? []).map((item: string): string => String(item ?? '').trim().toLowerCase())),
            ], 8),
            relationTag,
            state,
            summary,
            trust: clamp01(Number(relationship.trust)),
            affection: clamp01(Number(relationship.affection)),
            tension: clamp01(Number(relationship.tension)),
        });
    }
    return result;
}

/**
 * 功能：把数值限制在 0 到 1 之间。
 * @param value 原始数值。
 * @returns 裁剪后的数值。
 */
function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value <= 0) {
        return 0;
    }
    if (value >= 1) {
        return 1;
    }
    return Number(value.toFixed(4));
}

/**
 * 功能：根据已完成批次与现有记忆构建分类对象提示。
 * @param batchResults 已完成的批次结果。
 * @param existingKnownEntities 当前聊天已存在的分类对象。
 * @returns 分类对象提示。
 */
function buildTakeoverKnownEntities(
    batchResults: MemoryTakeoverBatchResult[],
    existingKnownEntities: MemoryTakeoverKnownEntities,
): MemoryTakeoverKnownEntities {
    return {
        actors: normalizeActorCards([
            ...existingKnownEntities.actors.map((item): MemoryTakeoverActorCardCandidate => ({
                actorKey: item.actorKey,
                displayName: item.displayName,
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            })),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverActorCardCandidate[] => item.actorCards ?? []),
        ], 16).map((item: MemoryTakeoverActorCardCandidate) => ({
            actorKey: item.actorKey,
            displayName: item.displayName,
        })),
        organizations: normalizeEntityRefs([
            ...existingKnownEntities.organizations,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.stableFacts
                    .filter((fact) => ['faction', 'organization'].includes(String(fact.type ?? '').trim().toLowerCase()))
                    .map((fact) => ({
                        entityKey: buildBatchEntityKey('organization', fact.subject),
                        displayName: fact.subject,
                    }));
            }),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return (item.entityCards ?? [])
                    .filter((entity: MemoryTakeoverEntityCardCandidate) => entity.entityType === 'organization')
                    .map((entity: MemoryTakeoverEntityCardCandidate) => ({
                        entityKey: entity.compareKey || buildBatchEntityKey('organization', entity.title),
                        displayName: entity.title,
                    }));
            }),
        ], 16),
        cities: normalizeEntityRefs([
            ...(existingKnownEntities.cities ?? []),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.stableFacts
                    .filter((fact) => String(fact.type ?? '').trim().toLowerCase() === 'city')
                    .map((fact) => ({
                        entityKey: buildBatchEntityKey('city', fact.subject),
                        displayName: fact.subject,
                    }));
            }),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return (item.entityCards ?? [])
                    .filter((entity: MemoryTakeoverEntityCardCandidate) => entity.entityType === 'city')
                    .map((entity: MemoryTakeoverEntityCardCandidate) => ({
                        entityKey: entity.compareKey || buildBatchEntityKey('city', entity.title),
                        displayName: entity.title,
                    }));
            }),
        ], 16),
        nations: normalizeEntityRefs([
            ...(existingKnownEntities.nations ?? []),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.stableFacts
                    .filter((fact) => String(fact.type ?? '').trim().toLowerCase() === 'nation')
                    .map((fact) => ({
                        entityKey: buildBatchEntityKey('nation', fact.subject),
                        displayName: fact.subject,
                    }));
            }),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return (item.entityCards ?? [])
                    .filter((entity: MemoryTakeoverEntityCardCandidate) => entity.entityType === 'nation')
                    .map((entity: MemoryTakeoverEntityCardCandidate) => ({
                        entityKey: entity.compareKey || buildBatchEntityKey('nation', entity.title),
                        displayName: entity.title,
                    }));
            }),
        ], 16),
        locations: normalizeEntityRefs([
            ...existingKnownEntities.locations,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.stableFacts
                    .filter((fact) => String(fact.type ?? '').trim().toLowerCase() === 'location')
                    .map((fact) => ({
                        entityKey: buildBatchEntityKey('location', fact.subject),
                        displayName: fact.subject,
                    }));
            }),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return (item.entityCards ?? [])
                    .filter((entity: MemoryTakeoverEntityCardCandidate) => entity.entityType === 'location')
                    .map((entity: MemoryTakeoverEntityCardCandidate) => ({
                        entityKey: entity.compareKey || buildBatchEntityKey('location', entity.title),
                        displayName: entity.title,
                    }));
            }),
        ], 16),
        tasks: normalizeEntityRefs([
            ...existingKnownEntities.tasks,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.taskTransitions.map((transition) => ({
                    entityKey: buildBatchEntityKey('task', transition.task),
                    displayName: transition.task,
                }));
            }),
        ], 16),
        worldStates: normalizeEntityRefs([
            ...existingKnownEntities.worldStates,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.worldStateChanges.map((change) => ({
                    entityKey: buildBatchEntityKey('world_state', change.key),
                    displayName: `${change.key}：${change.value}`,
                }));
            }),
        ], 16),
    };
}

/**
 * 功能：根据已完成批次构建后续批次可用的已知上下文。
 * @param batchResults 已完成的批次结果。
 * @param existingKnownEntities 当前聊天已存在的分类对象。
 * @returns 精简后的已知上下文。
 */
export function buildTakeoverKnownContext(
    batchResults: MemoryTakeoverBatchResult[],
    existingKnownEntities: MemoryTakeoverKnownEntities = {
        actors: [],
        organizations: [],
        cities: [],
        nations: [],
        locations: [],
        tasks: [],
        worldStates: [],
    },
): MemoryTakeoverKnownContext {
    const knownEntities = buildTakeoverKnownEntities(batchResults, existingKnownEntities);
    const actorHints = normalizeStringList([
        ...knownEntities.actors.map((item: { actorKey: string; displayName: string }): string => item.displayName),
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
        stableFacts,
        relationState,
        taskState,
        worldState,
        knownEntities,
        updateHint: batchResults.length > 0
            ? '以下内容来自前面已经处理过的批次和当前聊天里已有的相关记忆，可用来判断本批是在补充新信息，还是在更新已有对象。'
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
    historyBatchIndex?: number;
    historyBatchTotal?: number;
    messages: MemoryTakeoverMessageSlice[];
    previousBatchResults?: MemoryTakeoverBatchResult[];
    existingKnownEntities?: MemoryTakeoverKnownEntities;
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
        summary: summary || `第${input.batch.range.startFloor} ~ ${input.batch.range.endFloor}层没有可提取摘要。`,
        actorCards: [],
        relationships: [],
        entityCards: [],
        entityTransitions: [],
        stableFacts: [],
        relationTransitions: [],
        taskTransitions: [],
        worldStateChanges: [],
        openThreads: [],
        chapterTags: [input.batch.category === 'active' ? '最近活跃' : '历史补建'],
        sourceRange: input.batch.range,
        generatedAt: Date.now(),
    };
    const displayProgress = input.batch.category === 'history'
        ? {
            current: Math.max(1, Math.trunc(Number(input.historyBatchIndex) || 1)),
            total: Math.max(1, Math.trunc(Number(input.historyBatchTotal) || 1)),
        }
        : resolveBatchDisplayProgress(input.batch, input.totalBatches);
    const knownContext = buildTakeoverKnownContext(
        input.previousBatchResults ?? [],
        input.existingKnownEntities,
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
            '如果输入里提供了 knownContext，请把它视为当前批次可复用的分类对象提示。',
            'knownContext.knownEntities.actors 代表当前聊天里已知且可更新的角色；knownContext.knownEntities.organizations 代表已知组织与势力；knownContext.knownEntities.cities 代表已知城市；knownContext.knownEntities.nations 代表已知国家；knownContext.knownEntities.locations 代表已知地点；knownContext.knownEntities.tasks 代表已知任务；knownContext.knownEntities.worldStates 代表已知世界状态。',
            '其中 actors 使用 actorKey 作为稳定标识；organizations、cities、nations、locations、tasks、worldStates 使用 entityKey 作为稳定标识。判断是不是同一个对象时，优先参考这些 key，再参考显示名。',
            '处理本批消息时，请优先判断当前信息应该归到哪一类对象上，而不是把所有新名词都当作角色。',
            '只有稳定、反复出现、并且明显是人物的对象，才允许写进 actorCards。',
            'relationships 字段用于输出角色与角色之间的结构化关系卡，必须完整填写 sourceActorKey、targetActorKey、participants、relationTag、state、summary、trust、affection、tension。',
            '只要某个非 user 角色出现在 relationships 中，就必须在 actorCards 中提供同 actorKey 的角色卡；关系双方必须使用稳定 actorKey，不要只写显示名。',
            '如果消息里出现“何盈（橙狗狗视角）”这类写法，relationships 里仍然要使用标准角色键，不要把视角说明塞进 actorKey。',
            '教派、组织、势力、国家、城市、地点、阵营、规则、物品这类非人物对象，不要写进 actorCards。',
            '当 stableFacts.type 为 event，且事件主体、结果或描述里明确指向已有角色时，请优先沿用已有 actorCards 中的角色身份理解该事件，不要把同一个角色拆成新的对象。',
            '新增字段 entityCards 用于输出世界实体卡候选，entityType 可选 organization / city / nation / location。每张 entityCard 必须包含 entityType、compareKey（格式为 "entityType:标题"）、title、aliases、summary、fields（结构化属性）和 confidence。',
            '新增字段 entityTransitions 用于输出世界实体变更，action 可选 ADD / UPDATE / MERGE / INVALIDATE / DELETE。',
            '若已存在组织/城市/国家/地点（参考 knownEntities），请优先 UPDATE 而非 ADD。仅在无法匹配现有 entityKey / 别名时才 ADD。重名但属性一致时优先 MERGE。状态被新状态取代时优先 INVALIDATE + ADD/UPDATE。DELETE 仅用于明显垃圾或误建的记录。',
            '组织与势力优先写入 entityCards（entityType=organization）和 stableFacts（type=faction 或 type=organization）；地点请使用 entityCards（entityType=location）和 stableFacts（type=location）；城市请使用 entityCards（entityType=city）；国家请使用 entityCards（entityType=nation）；事件请使用 stableFacts（type=event）；物品或遗物请使用 stableFacts（type=artifact 或 type=item）；世界长期设定请使用 stableFacts（type=world）。',
            'relationTransitions 的 target 可以是角色，也可以是组织、势力、城市、国家或地点；只有明确是人物时，才应该同时出现在 actorCards 里。',
            '每条 relationTransitions 都要尽量填写 relationTag 和 targetType。relationTag 只能从 亲人、朋友、盟友、恋人、暧昧、师徒、上下级、竞争者、情敌、宿敌、陌生人 中选择；targetType 只能填写 actor、organization、city、nation、location、unknown。',
            '如果关系对象不是人物，不要把它塞进 actorCards；请保留在 relationTransitions，并正确填写对应的 targetType。',
            '如果对象已经出现在 knownContext.knownEntities 对应分类中，请优先按“更新已有对象”处理，而不是重复新增。',
        ].join(''),
    });
    return structured
        ? {
            ...fallback,
            ...structured,
            actorCards: normalizeActorCards(structured.actorCards ?? [], 12),
            relationships: normalizeRelationshipCards(structured.relationships ?? []),
            entityCards: normalizeEntityCards(structured.entityCards ?? []),
            entityTransitions: normalizeEntityTransitions(structured.entityTransitions ?? []),
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

const VALID_ENTITY_TYPES = new Set(['organization', 'city', 'nation', 'location']);
const VALID_ENTITY_ACTIONS = new Set(['ADD', 'UPDATE', 'MERGE', 'INVALIDATE', 'DELETE']);

/**
 * 功能：归一化世界实体卡候选列表。
 * @param entityCards 原始实体卡候选。
 * @returns 去重归一化后的实体卡候选。
 */
function normalizeEntityCards(entityCards: MemoryTakeoverEntityCardCandidate[]): MemoryTakeoverEntityCardCandidate[] {
    const result: MemoryTakeoverEntityCardCandidate[] = [];
    const seen = new Set<string>();
    for (const card of entityCards) {
        const entityType = String(card.entityType ?? '').trim().toLowerCase();
        if (!VALID_ENTITY_TYPES.has(entityType)) {
            continue;
        }
        const title = String(card.title ?? '').trim();
        if (!title) {
            continue;
        }
        const compareKey = String(card.compareKey ?? '').trim() || `${entityType}:${title}`;
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        result.push({
            entityType: entityType as MemoryTakeoverEntityCardCandidate['entityType'],
            compareKey,
            title,
            aliases: normalizeStringList(card.aliases ?? [], 8),
            summary: String(card.summary ?? '').trim(),
            fields: card.fields && typeof card.fields === 'object' ? card.fields : {},
            confidence: Math.max(0, Math.min(1, Number(card.confidence) || 0.5)),
        });
    }
    return result;
}

/**
 * 功能：归一化世界实体变更列表。
 * @param transitions 原始实体变更。
 * @returns 归一化后的实体变更。
 */
function normalizeEntityTransitions(transitions: MemoryTakeoverEntityTransition[]): MemoryTakeoverEntityTransition[] {
    const result: MemoryTakeoverEntityTransition[] = [];
    for (const transition of transitions) {
        const entityType = String(transition.entityType ?? '').trim().toLowerCase();
        if (!VALID_ENTITY_TYPES.has(entityType)) {
            continue;
        }
        const action = String(transition.action ?? '').trim().toUpperCase();
        if (!VALID_ENTITY_ACTIONS.has(action)) {
            continue;
        }
        const title = String(transition.title ?? '').trim();
        if (!title) {
            continue;
        }
        result.push({
            entityType: entityType as MemoryTakeoverEntityTransition['entityType'],
            compareKey: String(transition.compareKey ?? '').trim() || `${entityType}:${title}`,
            title,
            action: action as MemoryTakeoverEntityTransition['action'],
            reason: String(transition.reason ?? '').trim(),
            payload: transition.payload && typeof transition.payload === 'object' ? transition.payload : {},
        });
    }
    return result;
}
