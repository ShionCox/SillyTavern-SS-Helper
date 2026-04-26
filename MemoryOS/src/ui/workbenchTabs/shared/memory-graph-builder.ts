import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatchResult,
    MemoryTakeoverBindings,
    MemoryTakeoverConsolidationResult,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverProgressSnapshot,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
} from '../../../types';
import { isStrictActorKey, normalizeStrictActorKeySyntax } from '../../../core/actor-key';
import { buildRelationshipCompareKey, buildWorldStateCompareKey } from '../../../core/compare-key';
import {
    type DisplayLabelResolverContext,
    normalizeLookupKey,
    resolveDisplayLabel,
    stripComparePrefix,
} from './display-label-resolver';
import { sanitizeWorkbenchDisplayText } from './workbench-text';
import { promoteFactsToEvents, type PromotedMemoryEvent } from './fact-event-promoter';
import { createGraphEdgeLedger } from './graph-edge-ledger';
import { type MemoryGraphMode, type WorkbenchMemoryGraph, type WorkbenchMemoryGraphNode, type WorkbenchMemoryGraphSection } from './memoryGraphTypes';
import { normalizeMemoryCardTitle } from './memory-title-normalizer';

interface MemoryGraphSourceMaps {
    actors: Map<string, string[]>;
    entities: Map<string, string[]>;
    tasks: Map<string, string[]>;
    worldStates: Map<string, string[]>;
    relationships: Map<string, string[]>;
    relationTransitions: Map<string, string[]>;
}

/**
 * 功能：清洗工作台图谱节点中的乱码文案。
 * @param input 原始节点输入
 * @returns 清洗后的节点输入
 */
function sanitizeWorkbenchNode(
    input: Omit<WorkbenchMemoryGraphNode, 'x' | 'y'>,
): Omit<WorkbenchMemoryGraphNode, 'x' | 'y'> {
    return {
        ...input,
        label: sanitizeWorkbenchText(input.label),
        summary: sanitizeWorkbenchText(input.summary),
        semanticSummary: sanitizeWorkbenchText(input.semanticSummary),
        debugSummary: sanitizeWorkbenchText(input.debugSummary),
        sections: (input.sections ?? []).map((section: WorkbenchMemoryGraphSection): WorkbenchMemoryGraphSection => ({
            ...section,
            title: sanitizeWorkbenchText(section.title, '详情'),
            fields: (section.fields ?? []).map((field) => ({
                ...field,
                label: sanitizeWorkbenchText(field.label, '字段'),
                value: sanitizeWorkbenchText(field.value, '暂无'),
            })),
        })),
    };
}

/**
 * 功能：把已知乱码文案恢复成正常中文。
 * @param value 原始文本
 * @param fallback 兜底文本
 * @returns 清洗后的文本
 */
function sanitizeWorkbenchText(value: unknown, fallback = ''): string {
    const text = sanitizeWorkbenchDisplayText(value, fallback);
    if (!text) {
        return fallback;
    }
    if (text === '鏆傛棤' || text === '???') {
        return '暂无';
    }
    if (text.includes('缂佹垵鐣鹃崗宕囬兇')) {
        return '绑定关系';
    }
    if (text.includes('涓栫晫鐘舵')) {
        return '世界状态';
    }
    return sanitizeWorkbenchDisplayText(text, fallback);
}

/**
 * 功能：构建基于 takeover 结构化结果的图谱数据。
 * @param progress takeover 进度快照。
 * @returns 图谱数据。
 */
export function buildTakeoverMemoryGraph(progress: MemoryTakeoverProgressSnapshot | null): WorkbenchMemoryGraph {
    if (!progress) {
        return { nodes: [], edges: [] };
    }
    const batchResults = [...(progress.batchResults ?? [])].sort((left, right) => left.sourceRange.startFloor - right.sourceRange.startFloor);
    const consolidation = progress.consolidation;
    const labelContext = buildDisplayLabelContext(progress, batchResults);
    const sourceMaps = buildSourceMaps(batchResults);
    const nodeMap = new Map<string, WorkbenchMemoryGraphNode>();
    const actorNodeKeyMap = new Map<string, string>();
    const compareNodeKeyMap = new Map<string, string>();

    upsertActorNodes(nodeMap, actorNodeKeyMap, collectActorCards(consolidation, batchResults), labelContext, sourceMaps);
    upsertEntityNodes(nodeMap, compareNodeKeyMap, collectEntityCards(consolidation, batchResults), labelContext, sourceMaps);
    upsertTaskNodes(nodeMap, compareNodeKeyMap, collectTaskStates(consolidation, batchResults), labelContext, sourceMaps);
    upsertWorldStateNodes(nodeMap, compareNodeKeyMap, collectWorldStates(consolidation, batchResults), labelContext, sourceMaps);
    upsertPromotedEventNodes(
        nodeMap,
        compareNodeKeyMap,
        promoteFactsToEvents(collectStableFacts(consolidation, batchResults), {
            batchResults,
            labelContext,
        }),
        labelContext,
    );

    ensureUserNode(nodeMap, actorNodeKeyMap, labelContext, batchResults, consolidation);

    const edgeLedger = createGraphEdgeLedger();
    appendRelationshipEdges(edgeLedger, collectRelationships(consolidation, batchResults), nodeMap, actorNodeKeyMap, labelContext, sourceMaps);
    appendRelationTransitionEdges(edgeLedger, collectRelationTransitions(batchResults), actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext, sourceMaps);
    appendEntityBindingEdges(edgeLedger, collectEntityCards(consolidation, batchResults), compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);
    appendTaskBindingEdges(edgeLedger, collectTaskStates(consolidation, batchResults), compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);
    appendWorldStateBindingEdges(edgeLedger, collectWorldStates(consolidation, batchResults), compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);
    appendEventBindingEdges(edgeLedger, collectPromotedEvents(nodeMap), compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);
    appendEntityFallbackFieldEdges(edgeLedger, collectEntityCards(consolidation, batchResults), compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);

    const nodes = [...nodeMap.values()];
    const edges = edgeLedger.toEdges();
    applyUnifiedMemoryGraphLayout(nodes, edges);
    return { nodes, edges };
}

/**
 * 功能：构建显示名解析上下文。
 * @param progress takeover 进度快照。
 * @param batchResults 批次结果列表。
 * @returns 显示名解析上下文。
 */
function buildDisplayLabelContext(
    progress: MemoryTakeoverProgressSnapshot,
    batchResults: MemoryTakeoverBatchResult[],
): DisplayLabelResolverContext {
    const actorMap = new Map<string, { actorKey: string; displayName: string; aliases?: string[] }>();
    const compareKeyMap = new Map<string, { compareKey: string; title: string; type: string; aliases?: string[] }>();
    const aliasToLabelMap = new Map<string, string>();
    const actorCards = collectActorCards(progress.consolidation, batchResults);
    actorCards.forEach((actor: MemoryTakeoverActorCardCandidate): void => {
        actorMap.set(actor.actorKey, {
            actorKey: actor.actorKey,
            displayName: actor.displayName,
            aliases: actor.aliases,
        });
        actor.aliases.forEach((alias: string): void => {
            aliasToLabelMap.set(normalizeLookupKey(alias), actor.displayName);
        });
        aliasToLabelMap.set(normalizeLookupKey(actor.displayName), actor.displayName);
    });
    collectEntityCards(progress.consolidation, batchResults).forEach((entity: MemoryTakeoverEntityCardCandidate): void => {
        compareKeyMap.set(entity.compareKey, {
            compareKey: entity.compareKey,
            title: entity.title,
            type: entity.entityType,
            aliases: entity.aliases,
        });
        entity.aliases.forEach((alias: string): void => {
            aliasToLabelMap.set(normalizeLookupKey(alias), entity.title);
        });
        aliasToLabelMap.set(normalizeLookupKey(entity.title), entity.title);
    });
    collectTaskStates(progress.consolidation, batchResults).forEach((task: MemoryTakeoverTaskTransition): void => {
        const compareKey = String(task.compareKey ?? '').trim();
        const title = String(task.title ?? task.task ?? '').trim();
        if (!compareKey || !title) {
            return;
        }
        compareKeyMap.set(compareKey, {
            compareKey,
            title,
            type: 'task',
        });
        aliasToLabelMap.set(normalizeLookupKey(title), title);
    });
    collectStableFacts(progress.consolidation, batchResults)
        .filter((fact: MemoryTakeoverStableFact): boolean => String(fact.type ?? '').trim().toLowerCase() === 'event')
        .forEach((fact: MemoryTakeoverStableFact): void => {
            const compareKey = String(fact.compareKey ?? '').trim();
            const rawTitle = String(fact.title ?? '').trim();
            if (!compareKey || !rawTitle) {
                return;
            }
            compareKeyMap.set(compareKey, {
                compareKey,
                title: rawTitle,
                type: 'event',
            });
            aliasToLabelMap.set(normalizeLookupKey(rawTitle), rawTitle);
        });
    collectWorldStates(progress.consolidation, batchResults).forEach((state: MemoryTakeoverWorldStateChange): void => {
        const compareKey = String(state.compareKey ?? '').trim() || buildWorldStateCompareKey(String(state.key ?? '').trim());
        const title = String(state.key ?? '').trim();
        compareKeyMap.set(compareKey, {
            compareKey,
            title,
            type: 'world_state',
        });
        aliasToLabelMap.set(normalizeLookupKey(title), title);
    });
    return {
        actorMap,
        compareKeyMap,
        aliasToLabelMap,
        userLabel: '你',
    };
}

/**
 * 功能：构建节点与边的来源批次索引。
 * @param batchResults 批次结果列表。
 * @returns 来源批次映射。
 */
function buildSourceMaps(batchResults: MemoryTakeoverBatchResult[]): MemoryGraphSourceMaps {
    const sourceMaps: MemoryGraphSourceMaps = {
        actors: new Map<string, string[]>(),
        entities: new Map<string, string[]>(),
        tasks: new Map<string, string[]>(),
        worldStates: new Map<string, string[]>(),
        relationships: new Map<string, string[]>(),
        relationTransitions: new Map<string, string[]>(),
    };
    for (const batch of batchResults) {
        for (const actor of batch.actorCards ?? []) {
            appendBatchSource(sourceMaps.actors, actor.actorKey, batch.batchId);
        }
        for (const entity of batch.entityCards ?? []) {
            appendBatchSource(sourceMaps.entities, resolveEntityNodeKey(entity), batch.batchId);
        }
        for (const task of batch.taskTransitions ?? []) {
            const compareKey = String(task.compareKey ?? '').trim();
            if (compareKey) {
                appendBatchSource(sourceMaps.tasks, compareKey, batch.batchId);
            }
        }
        for (const worldState of batch.worldStateChanges ?? []) {
            appendBatchSource(sourceMaps.worldStates, resolveWorldStateNodeKey(worldState), batch.batchId);
        }
        for (const relationship of batch.relationships ?? []) {
            appendBatchSource(
                sourceMaps.relationships,
                buildRelationshipCompareKey(
                    relationship.sourceActorKey,
                    relationship.targetActorKey,
                    relationship.relationTag ?? relationship.state,
                ),
                batch.batchId,
            );
        }
        for (const transition of batch.relationTransitions ?? []) {
            appendBatchSource(sourceMaps.relationTransitions, `relation_transition:${transition.targetType ?? 'unknown'}:${transition.target}`, batch.batchId);
        }
    }
    return sourceMaps;
}

/**
 * 功能：收集整合后的角色卡。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 角色卡列表。
 */
function collectActorCards(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverActorCardCandidate[] {
    const actorMap = new Map<string, MemoryTakeoverActorCardCandidate>();
    for (const actor of consolidation?.actorCards ?? []) {
        actorMap.set(actor.actorKey, actor);
    }
    for (const batch of batchResults) {
        for (const actor of batch.actorCards ?? []) {
            if (!actorMap.has(actor.actorKey)) {
                actorMap.set(actor.actorKey, actor);
            }
        }
    }
    return [...actorMap.values()];
}

/**
 * 功能：收集整合后的实体卡。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 实体卡列表。
 */
function collectEntityCards(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverEntityCardCandidate[] {
    const compareKeyMap = new Map<string, MemoryTakeoverEntityCardCandidate>();
    const fallbackNodeKeyMap = new Map<string, MemoryTakeoverEntityCardCandidate>();
    const appendEntity = (entity: MemoryTakeoverEntityCardCandidate): void => {
        const compareKey = String(entity.compareKey ?? '').trim();
        if (compareKey) {
            compareKeyMap.set(compareKey, mergeEntityCards(compareKeyMap.get(compareKey), entity));
            return;
        }
        const nodeKey = resolveEntityNodeKey(entity);
        fallbackNodeKeyMap.set(nodeKey, mergeEntityCards(fallbackNodeKeyMap.get(nodeKey), entity));
    };
    for (const entity of consolidation?.entityCards ?? []) {
        appendEntity(entity);
    }
    for (const batch of batchResults) {
        for (const entity of batch.entityCards ?? []) {
            appendEntity(entity);
        }
    }
    const entityMap = new Map<string, MemoryTakeoverEntityCardCandidate>();
    [...compareKeyMap.values(), ...fallbackNodeKeyMap.values()].forEach((entity: MemoryTakeoverEntityCardCandidate): void => {
        const nodeKey = resolveEntityNodeKey(entity);
        entityMap.set(nodeKey, mergeEntityCards(entityMap.get(nodeKey), entity));
    });
    return [...entityMap.values()];
}

/**
 * 功能：收集整合后的任务状态。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 任务状态列表。
 */
function collectTaskStates(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverTaskTransition[] {
    const taskMap = new Map<string, MemoryTakeoverTaskTransition>();
    for (const task of consolidation?.taskState ?? []) {
        const compareKey = String(task.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        taskMap.set(compareKey, {
            task: task.task,
            from: '',
            to: task.state,
            title: task.title,
            summary: task.summary,
            description: task.description,
            goal: task.goal,
            entityKey: task.entityKey,
            status: task.state,
            compareKey,
            schemaVersion: task.schemaVersion,
            canonicalName: task.canonicalName,
            matchKeys: task.matchKeys,
            legacyCompareKeys: task.legacyCompareKeys,
            bindings: task.bindings,
            reasonCodes: task.reasonCodes,
        });
    }
    for (const batch of batchResults) {
        for (const task of batch.taskTransitions ?? []) {
            const compareKey = String(task.compareKey ?? '').trim();
            if (!compareKey || taskMap.has(compareKey)) {
                continue;
            }
            taskMap.set(compareKey, task);
        }
    }
    return [...taskMap.values()];
}

/**
 * 功能：收集稳定事实。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 稳定事实列表。
 */
function collectStableFacts(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverStableFact[] {
    if (Array.isArray(consolidation?.longTermFacts) && consolidation.longTermFacts.length > 0) {
        return consolidation.longTermFacts;
    }
    return batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverStableFact[] => item.stableFacts ?? []);
}

/**
 * 功能：收集关系卡。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 关系卡列表。
 */
function collectRelationships(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverRelationshipCard[] {
    if (Array.isArray(consolidation?.relationships) && consolidation.relationships.length > 0) {
        return consolidation.relationships;
    }
    return batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationshipCard[] => item.relationships ?? []);
}

/**
 * 功能：收集关系变化。
 * @param batchResults 批次结果列表。
 * @returns 关系变化列表。
 */
function collectRelationTransitions(batchResults: MemoryTakeoverBatchResult[]): MemoryTakeoverRelationTransition[] {
    return batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverRelationTransition[] => item.relationTransitions ?? []);
}

/**
 * 功能：收集世界状态节点来源。
 * @param consolidation 最终整合结果。
 * @param batchResults 批次结果列表。
 * @returns 世界状态列表。
 */
function collectWorldStates(
    consolidation: MemoryTakeoverConsolidationResult | null,
    batchResults: MemoryTakeoverBatchResult[],
): MemoryTakeoverWorldStateChange[] {
    const stateMap = new Map<string, MemoryTakeoverWorldStateChange>();
    for (const item of consolidation?.worldStateDetails ?? []) {
        const nodeKey = resolveWorldStateNodeKey(item);
        stateMap.set(nodeKey, mergeWorldStates(stateMap.get(nodeKey), item));
    }
    for (const batch of batchResults) {
        for (const item of batch.worldStateChanges ?? []) {
            const nodeKey = resolveWorldStateNodeKey(item);
            stateMap.set(nodeKey, mergeWorldStates(stateMap.get(nodeKey), item));
        }
    }
    for (const [key, value] of Object.entries(consolidation?.worldState ?? {})) {
        const existing = [...stateMap.values()].find((item: MemoryTakeoverWorldStateChange): boolean => item.key === key);
        const mergedState = mergeWorldStates(existing, {
            key,
            value,
            summary: `${key}：${value}`,
            compareKey: existing?.compareKey || buildWorldStateCompareKey(String(key ?? '').trim()),
            reasonCodes: [],
        });
        stateMap.set(resolveWorldStateNodeKey(mergedState), mergedState);
    }
    return [...stateMap.values()];
}

/**
 * 功能：写入角色节点。
 * @param nodeMap 节点映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param actorCards 角色卡列表。
 * @param labelContext 显示名上下文。
 */
function upsertActorNodes(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    actorNodeKeyMap: Map<string, string>,
    actorCards: MemoryTakeoverActorCardCandidate[],
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    for (const actor of actorCards) {
        const nodeKey = `actor:${actor.actorKey}`;
        actorNodeKeyMap.set(actor.actorKey, nodeKey);
        upsertNode(nodeMap, {
            id: nodeKey,
            key: nodeKey,
            label: normalizeMemoryCardTitle(actor.displayName, {
                mode: 'semantic',
                context: labelContext,
                typeHint: 'actor',
                fallbackRef: actor.actorKey,
            }),
            type: 'actor',
            summary: actor.identityFacts.join('；') || actor.originFacts.join('；') || actor.traits.join('、'),
            semanticSummary: actor.identityFacts.join('；') || actor.originFacts.join('；') || actor.traits.join('、'),
            debugSummary: `actorKey=${actor.actorKey}`,
              importance: 0.9,
              memoryPercent: 100,
              aliases: actor.aliases ?? [],
              hydrationState: 'full',
              sourceBatchIds: sourceMaps.actors.get(actor.actorKey) ?? [],
              sourceKinds: ['actor_card'],
              sourceRefs: [actor.actorKey],
            reasonCodes: [],
            bindings: emptyBindings(),
            sections: [
                {
                    title: '角色信息',
                    fields: [
                        { label: '姓名', value: actor.displayName },
                        { label: '别名', value: (actor.aliases ?? []).join('、') || '暂无' },
                        { label: 'actorKey', value: actor.actorKey, visibleInModes: ['debug'] },
                    ],
                },
                buildOptionalSection('身份事实', actor.identityFacts),
                buildOptionalSection('起源事实', actor.originFacts),
                buildOptionalSection('特征', actor.traits),
            ].filter(Boolean) as WorkbenchMemoryGraphSection[],
            rawData: actor as unknown as Record<string, unknown>,
            visibleInModes: ['semantic', 'debug'],
        });
    }
}

/**
 * 功能：写入实体节点。
 * @param nodeMap 节点映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param entityCards 实体卡列表。
 * @param labelContext 显示名上下文。
 */
function upsertEntityNodes(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    compareNodeKeyMap: Map<string, string>,
    entityCards: MemoryTakeoverEntityCardCandidate[],
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    for (const entity of entityCards) {
        const nodeKey = resolveEntityNodeKey(entity);
        registerEntityNodeRefs(compareNodeKeyMap, entity, nodeKey);
        upsertNode(nodeMap, {
            id: nodeKey,
            key: nodeKey,
            label: normalizeMemoryCardTitle(entity.title, {
                mode: 'semantic',
                context: labelContext,
                typeHint: entity.entityType,
                fallbackRef: entity.compareKey,
            }),
            type: entity.entityType,
            summary: entity.summary,
            semanticSummary: entity.summary,
            debugSummary: `compareKey=${entity.compareKey}`,
            compareKey: entity.compareKey,
            status: String((entity.fields as Record<string, unknown>).status ?? '').trim() || undefined,
            importance: Math.max(Number(entity.confidence ?? 0), 0.62),
            memoryPercent: 100,
            aliases: entity.aliases ?? [],
            sourceBatchIds: sourceMaps.entities.get(nodeKey) ?? [],
            sourceKinds: ['entity_card'],
            sourceRefs: dedupeStrings([
                String(entity.entityKey ?? '').trim(),
                String(entity.compareKey ?? '').trim(),
                ...(entity.matchKeys ?? []),
                ...(entity.legacyCompareKeys ?? []),
            ]),
            reasonCodes: entity.reasonCodes ?? [],
            bindings: normalizeBindings(entity.bindings),
            sections: [
                {
                    title: '实体信息',
                    fields: [
                        { label: '类型', value: entity.entityType },
                        { label: '别名', value: (entity.aliases ?? []).join('、') || '暂无' },
                        { label: '摘要', value: entity.summary || '暂无' },
                        { label: 'entityKey', value: String(entity.entityKey ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'compareKey', value: entity.compareKey, visibleInModes: ['debug'] },
                        { label: 'schemaVersion', value: String(entity.schemaVersion ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'canonicalName', value: String(entity.canonicalName ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                    ],
                },
                buildRecordSection('结构化字段', entity.fields as Record<string, unknown>),
                buildBindingsSection('绑定关系', entity.bindings, labelContext),
            ].filter(Boolean) as WorkbenchMemoryGraphSection[],
            rawData: entity as unknown as Record<string, unknown>,
            visibleInModes: ['semantic', 'debug'],
        });
    }
}

/**
 * 功能：写入任务节点。
 * @param nodeMap 节点映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param tasks 任务状态列表。
 * @param labelContext 显示名上下文。
 */
function upsertTaskNodes(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    compareNodeKeyMap: Map<string, string>,
    tasks: MemoryTakeoverTaskTransition[],
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    for (const task of tasks) {
        const compareKey = String(task.compareKey ?? '').trim();
        if (!compareKey) {
            continue;
        }
        compareNodeKeyMap.set(compareKey, compareKey);
        const entityKey = String(task.entityKey ?? '').trim();
        if (entityKey) {
            compareNodeKeyMap.set(entityKey, compareKey);
        }
        upsertNode(nodeMap, {
            id: compareKey,
            key: compareKey,
            label: normalizeMemoryCardTitle(String(task.title ?? task.task ?? '').trim(), {
                mode: 'semantic',
                context: labelContext,
                typeHint: 'task',
                fallbackRef: compareKey,
            }),
            type: 'task',
            summary: String(task.summary ?? '').trim() || String(task.description ?? '').trim(),
            semanticSummary: String(task.summary ?? '').trim() || String(task.goal ?? '').trim(),
            debugSummary: `compareKey=${compareKey} | status=${String(task.status ?? task.to ?? '').trim() || 'unknown'}`,
            compareKey,
            status: String(task.status ?? task.to ?? '').trim() || undefined,
            importance: 0.86,
            memoryPercent: 100,
            aliases: [],
            sourceBatchIds: sourceMaps.tasks.get(compareKey) ?? [],
            sourceKinds: ['task_state'],
            sourceRefs: [compareKey],
            reasonCodes: task.reasonCodes ?? [],
            bindings: normalizeBindings(task.bindings),
            sections: [
                {
                    title: '任务信息',
                    fields: [
                        { label: '标题', value: String(task.title ?? task.task ?? '').trim() || '暂无' },
                        { label: '状态', value: String(task.status ?? task.to ?? '').trim() || '暂无' },
                        { label: '目标', value: String(task.goal ?? '').trim() || '暂无' },
                        { label: 'entityKey', value: String(task.entityKey ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'compareKey', value: compareKey, visibleInModes: ['debug'] },
                        { label: 'schemaVersion', value: String(task.schemaVersion ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'canonicalName', value: String(task.canonicalName ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                    ],
                },
                {
                    title: '任务说明',
                    fields: [
                        { label: 'summary', value: String(task.summary ?? '').trim() || '暂无' },
                        { label: 'description', value: String(task.description ?? '').trim() || '暂无' },
                    ],
                },
                buildBindingsSection('绑定关系', task.bindings, labelContext),
            ].filter(Boolean) as WorkbenchMemoryGraphSection[],
            rawData: task as unknown as Record<string, unknown>,
            visibleInModes: ['semantic', 'debug'],
        });
    }
}

/**
 * 功能：写入世界状态节点。
 * @param nodeMap 节点映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param worldStates 世界状态列表。
 * @param labelContext 显示名上下文。
 */
function upsertWorldStateNodes(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    compareNodeKeyMap: Map<string, string>,
    worldStates: MemoryTakeoverWorldStateChange[],
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    for (const worldState of worldStates) {
        const compareKey = String(worldState.compareKey ?? '').trim() || buildWorldStateCompareKey(String(worldState.key ?? '').trim());
        const nodeKey = resolveWorldStateNodeKey(worldState);
        registerWorldStateNodeRefs(compareNodeKeyMap, worldState, nodeKey);
        upsertNode(nodeMap, {
            id: nodeKey,
            key: nodeKey,
            label: buildWorldStateDisplayLabel(worldState, labelContext),
            type: 'world_state',
            summary: String(worldState.summary ?? '').trim() || `${worldState.key}：${worldState.value}`,
            semanticSummary: String(worldState.summary ?? '').trim() || `${worldState.key}：${worldState.value}`,
            debugSummary: `compareKey=${compareKey}`,
            compareKey,
            status: String(worldState.value ?? '').trim() || undefined,
            importance: 0.72,
            memoryPercent: 100,
            aliases: [],
            sourceBatchIds: sourceMaps.worldStates.get(nodeKey) ?? [],
            sourceKinds: ['world_state'],
            sourceRefs: dedupeStrings([
                String(worldState.entityKey ?? '').trim(),
                compareKey,
                ...(worldState.matchKeys ?? []),
                ...(worldState.legacyCompareKeys ?? []),
            ]),
            reasonCodes: worldState.reasonCodes ?? [],
            bindings: normalizeBindings(worldState.bindings),
            sections: [
                {
                    title: '世界状态',
                    fields: [
                        { label: 'key', value: String(worldState.key ?? '').trim() || '暂无' },
                        { label: 'value', value: String(worldState.value ?? '').trim() || '暂无' },
                        { label: 'entityKey', value: String(worldState.entityKey ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'compareKey', value: compareKey, visibleInModes: ['debug'] },
                        { label: 'schemaVersion', value: String(worldState.schemaVersion ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'canonicalName', value: String(worldState.canonicalName ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                    ],
                },
                buildBindingsSection('绑定关系', worldState.bindings, labelContext),
            ],
            rawData: worldState as unknown as Record<string, unknown>,
            visibleInModes: ['semantic', 'debug'],
        });
    }
}

function resolveEntityNodeKey(entity: MemoryTakeoverEntityCardCandidate): string {
    const entityKey = String(entity.entityKey ?? '').trim();
    if (entityKey) {
        return entityKey;
    }
    const canonicalName = String(entity.canonicalName ?? entity.title ?? '').trim();
    return `entity:${String(entity.entityType ?? 'entity').trim().toLowerCase()}:${normalizeLookupKey(canonicalName || entity.compareKey)}`;
}

function resolveWorldStateNodeKey(worldState: MemoryTakeoverWorldStateChange): string {
    const entityKey = String(worldState.entityKey ?? '').trim();
    if (entityKey) {
        return entityKey;
    }
    const canonicalName = String(worldState.canonicalName ?? worldState.key ?? '').trim();
    return `worldstate:${normalizeLookupKey(canonicalName || worldState.compareKey || worldState.key)}`;
}

/**
 * 功能：构建世界状态节点的显示标题，避免与同名地点节点混淆。
 * @param worldState 世界状态记录。
 * @param labelContext 显示名上下文。
 * @returns 带语义区分的标题。
 */
function buildWorldStateDisplayLabel(
    worldState: MemoryTakeoverWorldStateChange,
    labelContext: DisplayLabelResolverContext,
): string {
    const baseLabel = normalizeMemoryCardTitle(worldState.key, {
        mode: 'semantic',
        context: labelContext,
        typeHint: 'world_state',
        fallbackRef: String(worldState.compareKey ?? '').trim() || buildWorldStateCompareKey(String(worldState.key ?? '').trim()),
    });
    if (!baseLabel) {
        return '未命名状态';
    }
    return /（状态）$/.test(baseLabel) ? baseLabel : `${baseLabel}（状态）`;
}

function registerEntityNodeRefs(
    compareNodeKeyMap: Map<string, string>,
    entity: MemoryTakeoverEntityCardCandidate,
    nodeKey: string,
): void {
    const refs = [
        String(entity.compareKey ?? '').trim(),
        String(entity.entityKey ?? '').trim(),
        ...dedupeStrings(entity.matchKeys ?? []),
        ...dedupeStrings(entity.legacyCompareKeys ?? []),
    ].filter(Boolean);
    for (const ref of refs) {
        compareNodeKeyMap.set(ref, nodeKey);
    }
}

function registerWorldStateNodeRefs(
    compareNodeKeyMap: Map<string, string>,
    worldState: MemoryTakeoverWorldStateChange,
    nodeKey: string,
): void {
    const refs = [
        String(worldState.compareKey ?? '').trim(),
        String(worldState.entityKey ?? '').trim(),
        buildWorldStateCompareKey(String(worldState.key ?? '').trim()),
        ...(worldState.matchKeys ?? []),
        ...(worldState.legacyCompareKeys ?? []),
    ].filter(Boolean);
    for (const ref of refs) {
        compareNodeKeyMap.set(ref, nodeKey);
    }
}

function mergeEntityCards(
    existing: MemoryTakeoverEntityCardCandidate | undefined,
    incoming: MemoryTakeoverEntityCardCandidate,
): MemoryTakeoverEntityCardCandidate {
    if (!existing) {
        return incoming;
    }
    return {
        ...existing,
        ...incoming,
        title: String(existing.title ?? '').trim() || incoming.title,
        summary: pickLongerText(existing.summary, incoming.summary),
        aliases: dedupeStrings([...(existing.aliases ?? []), ...(incoming.aliases ?? [])]),
        fields: {
            ...((existing.fields as Record<string, unknown>) ?? {}),
            ...((incoming.fields as Record<string, unknown>) ?? {}),
        } as MemoryTakeoverEntityCardCandidate['fields'],
        confidence: Math.max(Number(existing.confidence ?? 0) || 0, Number(incoming.confidence ?? 0) || 0),
        bindings: mergeBindings(normalizeBindings(existing.bindings), normalizeBindings(incoming.bindings)) as unknown as MemoryTakeoverBindings,
        reasonCodes: dedupeStrings([...(existing.reasonCodes ?? []), ...(incoming.reasonCodes ?? [])]),
        matchKeys: dedupeStrings([...(existing.matchKeys ?? []), ...(incoming.matchKeys ?? [])]),
        legacyCompareKeys: dedupeStrings([...(existing.legacyCompareKeys ?? []), ...(incoming.legacyCompareKeys ?? [])]),
        canonicalName: String(existing.canonicalName ?? '').trim() || String(incoming.canonicalName ?? '').trim() || incoming.title,
        entityKey: String(existing.entityKey ?? '').trim() || String(incoming.entityKey ?? '').trim() || undefined,
        compareKey: String(existing.compareKey ?? '').trim() || String(incoming.compareKey ?? '').trim(),
    };
}

function mergeWorldStates(
    existing: MemoryTakeoverWorldStateChange | undefined,
    incoming: MemoryTakeoverWorldStateChange,
): MemoryTakeoverWorldStateChange {
    if (!existing) {
        return incoming;
    }
    return {
        ...existing,
        ...incoming,
        key: String(existing.key ?? '').trim() || String(incoming.key ?? '').trim(),
        value: pickLongerText(existing.value, incoming.value),
        summary: pickLongerText(existing.summary, incoming.summary),
        reasonCodes: dedupeStrings([...(existing.reasonCodes ?? []), ...(incoming.reasonCodes ?? [])]),
        entityKey: String(existing.entityKey ?? '').trim() || String(incoming.entityKey ?? '').trim() || undefined,
        compareKey: String(existing.compareKey ?? '').trim() || String(incoming.compareKey ?? '').trim() || buildWorldStateCompareKey(String(incoming.key ?? '').trim()),
        canonicalName: String(existing.canonicalName ?? '').trim() || String(incoming.canonicalName ?? '').trim() || String(incoming.key ?? '').trim(),
        matchKeys: dedupeStrings([...(existing.matchKeys ?? []), ...(incoming.matchKeys ?? [])]),
        legacyCompareKeys: dedupeStrings([...(existing.legacyCompareKeys ?? []), ...(incoming.legacyCompareKeys ?? [])]),
    };
}

function pickLongerText(currentValue: unknown, nextValue: unknown): string {
    const currentText = String(currentValue ?? '').trim();
    const nextText = String(nextValue ?? '').trim();
    return nextText.length > currentText.length ? nextText : currentText;
}

/**
 * 功能：写入升格后的事件节点。
 * @param nodeMap 节点映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param events 升格事件列表。
 * @param labelContext 显示名上下文。
 */
function upsertPromotedEventNodes(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    compareNodeKeyMap: Map<string, string>,
    events: PromotedMemoryEvent[],
    labelContext: DisplayLabelResolverContext,
): void {
    for (const event of events) {
        compareNodeKeyMap.set(event.compareKey, event.key);
        upsertNode(nodeMap, {
            id: event.key,
            key: event.key,
            label: normalizeMemoryCardTitle(event.label, {
                mode: 'semantic',
                context: labelContext,
                typeHint: 'event',
                fallbackRef: event.compareKey,
            }),
            type: 'event',
            summary: event.summary,
            semanticSummary: event.summary,
            debugSummary: `compareKey=${event.compareKey}`,
            compareKey: event.compareKey,
            status: event.status,
            importance: Math.max(0.62, Number(event.importance) || 0.62),
            memoryPercent: 100,
            aliases: [],
            sourceBatchIds: event.sourceBatchIds,
            sourceKinds: ['stable_fact_event'],
            sourceRefs: [event.compareKey],
            reasonCodes: event.reasonCodes,
            bindings: event.bindings,
            sections: event.sections,
            rawData: event.rawData,
            visibleInModes: ['semantic', 'debug'],
        });
    }
}

/**
 * 功能：确保图中存在用户节点。
 * @param nodeMap 节点映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param labelContext 显示名上下文。
 * @param batchResults 批次结果列表。
 * @param consolidation 最终整合结果。
 */
function ensureUserNode(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    actorNodeKeyMap: Map<string, string>,
    labelContext: DisplayLabelResolverContext,
    batchResults: MemoryTakeoverBatchResult[],
    consolidation: MemoryTakeoverConsolidationResult | null,
): void {
    const needed = batchResults.some((batch: MemoryTakeoverBatchResult): boolean => {
        return (batch.relationships ?? []).some((item: MemoryTakeoverRelationshipCard): boolean => item.sourceActorKey === 'user' || item.targetActorKey === 'user')
            || (batch.taskTransitions ?? []).some((task: MemoryTakeoverTaskTransition): boolean => (task.bindings?.actors ?? []).includes('user'))
            || (batch.relationTransitions ?? []).length > 0;
    }) || (consolidation?.relationships ?? []).some((item: MemoryTakeoverRelationshipCard): boolean => item.sourceActorKey === 'user' || item.targetActorKey === 'user');
    if (!needed) {
        return;
    }
    const nodeKey = 'actor:user';
    actorNodeKeyMap.set('user', nodeKey);
    upsertNode(nodeMap, {
        id: nodeKey,
        key: nodeKey,
        label: resolveDisplayLabel('user', { mode: 'semantic', context: labelContext }),
        type: 'actor',
        summary: '当前玩家视角锚点。',
        semanticSummary: '当前玩家视角锚点。',
        debugSummary: 'actorKey=user',
        importance: 1,
        memoryPercent: 100,
        aliases: [],
        sourceBatchIds: [],
        sourceKinds: ['user_anchor'],
        sourceRefs: ['user'],
        reasonCodes: [],
        bindings: emptyBindings(),
        sections: [
            {
                title: '角色信息',
                fields: [
                    { label: '显示名', value: resolveDisplayLabel('user', { mode: 'semantic', context: labelContext }) },
                    { label: 'actorKey', value: 'user', visibleInModes: ['debug'] },
                ],
            },
        ],
        rawData: { actorKey: 'user' },
        visibleInModes: ['semantic', 'debug'],
    });
}

/**
 * 功能：追加角色关系边。
 * @param edgeLedger 图边账本。
 * @param relationships 关系卡列表。
 * @param actorNodeKeyMap 角色键映射。
 */
function appendRelationshipEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    relationships: MemoryTakeoverRelationshipCard[],
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    actorNodeKeyMap: Map<string, string>,
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    for (const relationship of relationships) {
        const edgeId = buildRelationshipCompareKey(
            relationship.sourceActorKey,
            relationship.targetActorKey,
            relationship.relationTag ?? relationship.state,
        );
        const source = ensureActorNodeFromRef(nodeMap, actorNodeKeyMap, relationship.sourceActorKey, labelContext);
        const target = ensureActorNodeFromRef(nodeMap, actorNodeKeyMap, relationship.targetActorKey, labelContext);
        if (!source || !target) {
            continue;
        }
        edgeLedger.append({
            id: edgeId,
            source,
            target,
            relationType: 'relationship',
            label: relationship.relationTag,
            semanticLabel: relationship.relationTag,
            debugSummary: relationship.summary,
            confidence: Math.max(Number(relationship.trust ?? 0), 0.78),
            sourceKinds: ['structured_relationship'],
            sourceRefs: [`${relationship.sourceActorKey}->${relationship.targetActorKey}`],
            sourceBatchIds: sourceMaps.relationships.get(edgeId) ?? [],
            reasonCodes: ['structured_relationship'],
            visibleInModes: ['semantic', 'debug'],
            sections: [
                {
                    title: '关系详情',
                    fields: [
                        { label: 'relationTag', value: relationship.relationTag },
                        { label: 'state', value: relationship.state },
                        { label: 'summary', value: relationship.summary },
                        {
                            label: '源对象',
                            value: resolveDisplayLabel(relationship.sourceActorKey, {
                                mode: 'semantic',
                                context: labelContext,
                                fallbackLabel: relationship.sourceActorKey,
                                typeHint: 'actor',
                            }),
                            targetNodeId: source,
                            visibleInModes: ['semantic'],
                        },
                        {
                            label: '目标对象',
                            value: resolveDisplayLabel(relationship.targetActorKey, {
                                mode: 'semantic',
                                context: labelContext,
                                fallbackLabel: relationship.targetActorKey,
                                typeHint: 'actor',
                            }),
                            targetNodeId: target,
                            visibleInModes: ['semantic'],
                        },
                        { label: 'sourceActorKey', value: relationship.sourceActorKey, visibleInModes: ['debug'] },
                        { label: 'targetActorKey', value: relationship.targetActorKey, visibleInModes: ['debug'] },
                    ],
                },
                {
                    title: '关系强度',
                    fields: [
                        { label: 'trust', value: String(relationship.trust) },
                        { label: 'affection', value: String(relationship.affection) },
                        { label: 'tension', value: String(relationship.tension) },
                    ],
                },
            ],
            rawData: relationship as unknown as Record<string, unknown>,
        });
    }
}

/**
 * 功能：追加关系变化边。
 * @param edgeLedger 图边账本。
 * @param transitions 关系变化列表。
 * @param actorNodeKeyMap 角色键映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 */
function appendRelationTransitionEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    transitions: MemoryTakeoverRelationTransition[],
    actorNodeKeyMap: Map<string, string>,
    compareNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
    sourceMaps: MemoryGraphSourceMaps,
): void {
    const userNodeKey = actorNodeKeyMap.get('user');
    if (!userNodeKey) {
        return;
    }
    for (const transition of transitions) {
        const edgeId = `relation_transition:${transition.targetType ?? 'unknown'}:${transition.target}`;
        const targetNodeKey = resolveTargetNodeKey(transition.target, transition.targetType, actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext)
            ?? createPlaceholderNode(nodeMap, compareNodeKeyMap, transition.target, transition.targetType ?? 'unknown', labelContext);
        if (!targetNodeKey) {
            continue;
        }
        edgeLedger.append({
            id: edgeId,
            source: userNodeKey,
            target: targetNodeKey,
            relationType: 'relation_transition',
            label: String(transition.relationTag ?? transition.to).trim() || '关系变化',
            semanticLabel: String(transition.relationTag ?? transition.to).trim() || '关系变化',
            debugSummary: transition.reason,
            confidence: 0.68,
            sourceKinds: ['structured_relation_transition'],
            sourceRefs: [String(transition.target ?? '').trim()],
            sourceBatchIds: sourceMaps.relationTransitions.get(edgeId) ?? [],
            reasonCodes: dedupeStrings(['structured_relation_transition', ...(transition.reasonCodes ?? [])]),
            visibleInModes: ['semantic', 'debug'],
            sections: [
                {
                    title: '关系变化',
                    fields: [
                        { label: 'from', value: String(transition.from ?? '').trim() || '暂无' },
                        { label: 'to', value: String(transition.to ?? '').trim() || '暂无' },
                        { label: 'reason', value: String(transition.reason ?? '').trim() || '暂无' },
                        {
                            label: '目标对象',
                            value: resolveDisplayLabel(String(transition.target ?? '').trim(), {
                                mode: 'semantic',
                                context: labelContext,
                                fallbackLabel: stripComparePrefix(String(transition.target ?? '').trim()) || String(transition.target ?? '').trim() || '暂无',
                                typeHint: String(transition.targetType ?? '').trim(),
                            }),
                            targetNodeId: targetNodeKey,
                            visibleInModes: ['semantic'],
                        },
                        { label: 'target', value: String(transition.target ?? '').trim() || '暂无', visibleInModes: ['debug'] },
                        { label: 'targetType', value: String(transition.targetType ?? '').trim() || 'unknown', visibleInModes: ['debug'] },
                    ],
                },
                buildBindingsSection('绑定关系', transition.bindings, labelContext),
            ].filter(Boolean) as WorkbenchMemoryGraphSection[],
            rawData: transition as unknown as Record<string, unknown>,
        });
    }
}


/**
 * 功能：追加实体显式绑定边，作为主图谱层的结构化来源。
 * @param edgeLedger 图边账本。
 * @param entities 实体卡列表。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 无返回值。
 */
function appendEntityBindingEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    entities: MemoryTakeoverEntityCardCandidate[],
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    for (const entity of entities) {
        const source = compareNodeKeyMap.get(String(entity.compareKey ?? '').trim());
        if (!source) {
            continue;
        }
        appendBindingsForNode(edgeLedger, source, normalizeBindings(entity.bindings), 'entity_binding', compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext, {
            sourceKinds: ['structured_binding', 'entity_binding'],
            reasonCodes: ['structured_binding_resolved', 'entity_binding_resolved'],
            confidence: 0.76,
        });
    }
}

/**
 * 功能：追加任务显式绑定边，作为主图谱层的结构化来源。
 * @param edgeLedger 图边账本。
 * @param tasks 任务状态列表。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 无返回值。
 */
function appendTaskBindingEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    tasks: MemoryTakeoverTaskTransition[],
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    for (const task of tasks) {
        const source = compareNodeKeyMap.get(String(task.compareKey ?? '').trim());
        if (!source) {
            continue;
        }
        appendBindingsForNode(edgeLedger, source, normalizeBindings(task.bindings), 'task_binding', compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext, {
            sourceKinds: ['structured_binding', 'task_binding'],
            reasonCodes: ['structured_binding_resolved', 'task_binding_resolved'],
            confidence: 0.74,
        });
    }
}

/**
 * 功能：追加世界状态的结构化绑定边。
 * @param edgeLedger 图边账本
 * @param worldStates 世界状态列表
 * @param compareNodeKeyMap 稳定键到节点键的映射
 * @param actorNodeKeyMap 角色键到节点键的映射
 * @param nodeMap 图节点映射
 * @param labelContext 显示标签上下文
 * @returns 无返回值
 */
function appendWorldStateBindingEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    worldStates: MemoryTakeoverWorldStateChange[],
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    for (const worldState of worldStates) {
        const source = compareNodeKeyMap.get(resolveWorldStateNodeKey(worldState));
        if (!source) {
            continue;
        }
        appendBindingsForNode(edgeLedger, source, normalizeBindings(worldState.bindings), 'world_state_binding', compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext, {
            sourceKinds: ['structured_binding', 'world_state_binding'],
            reasonCodes: ['structured_binding_resolved', 'world_state_binding_resolved'],
            confidence: 0.74,
        });
    }
}

function appendEventBindingEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    events: WorkbenchMemoryGraphNode[],
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    for (const event of events) {
        appendBindingsForNode(edgeLedger, event.id, event.bindings, 'event_binding', compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext, {
            sourceKinds: ['structured_binding', 'event_binding'],
            reasonCodes: ['structured_binding_resolved', 'event_binding_resolved'],
            confidence: 0.74,
        });
    }
}

/**
 * 功能：追加实体字段推断的 fallback 边，仅在缺少显式结构化绑定时使用。
 * @param edgeLedger 图边账本。
 * @param entities 实体卡列表。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 无返回值。
 */
function appendEntityFallbackFieldEdges(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    entities: MemoryTakeoverEntityCardCandidate[],
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    const fallbackConfigs = [
        { bindingKey: 'organizations', fieldKey: 'organization', relationType: 'belongs_to_organization', label: '隶属组织', targetType: 'organization' },
        { bindingKey: 'cities', fieldKey: 'city', relationType: 'located_in_city', label: '位于城市', targetType: 'city' },
        { bindingKey: 'cities', fieldKey: 'baseCity', relationType: 'located_in_city', label: '位于城市', targetType: 'city' },
        { bindingKey: 'nations', fieldKey: 'nation', relationType: 'located_in_nation', label: '位于国家', targetType: 'nation' },
        { bindingKey: 'locations', fieldKey: 'parentLocation', relationType: 'located_in_location', label: '从属地点', targetType: 'location' },
        { bindingKey: 'organizations', fieldKey: 'parentOrganization', relationType: 'subordinate_to_organization', label: '上级组织', targetType: 'organization' },
        { bindingKey: 'actors', fieldKey: 'leader', relationType: 'led_by_actor', label: '领导者', targetType: 'actor' },
    ] as const;
    for (const entity of entities) {
        const source = compareNodeKeyMap.get(String(entity.compareKey ?? '').trim());
        if (!source) {
            continue;
        }
        const bindings = normalizeBindings(entity.bindings);
        const fields = (entity.fields as Record<string, unknown>) ?? {};
        for (const fallbackConfig of fallbackConfigs) {
            appendEntityFieldFallbackEdge(
                edgeLedger,
                source,
                bindings,
                fallbackConfig.bindingKey,
                String(fields[fallbackConfig.fieldKey] ?? '').trim(),
                fallbackConfig.relationType,
                fallbackConfig.label,
                fallbackConfig.targetType,
                compareNodeKeyMap,
                actorNodeKeyMap,
                nodeMap,
                labelContext,
            );
        }
    }
}

/**
 * 功能：对单个节点的 bindings 批量追加绑定边。
 * @param edgeLedger 图边账本。
 * @param sourceNodeKey 源节点键。
 * @param bindings 绑定关系。
 * @param relationPrefix 关系前缀。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 */
function appendBindingsForNode(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    sourceNodeKey: string,
    bindings: Record<string, string[]>,
    relationPrefix: string,
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
    options?: {
        sourceKinds?: string[];
        reasonCodes?: string[];
        confidence?: number;
    },
): void {
    const sourceNode = nodeMap.get(sourceNodeKey);
    const relationMap: Record<string, { type: string; label: string; targetType: string }> = {
        actors: { type: `${relationPrefix}_actor`, label: '关联角色', targetType: 'actor' },
        organizations: { type: `${relationPrefix}_organization`, label: '关联组织', targetType: 'organization' },
        cities: { type: `${relationPrefix}_city`, label: '关联城市', targetType: 'city' },
        locations: { type: `${relationPrefix}_location`, label: '关联地点', targetType: 'location' },
        nations: { type: `${relationPrefix}_nation`, label: '关联国家', targetType: 'nation' },
        tasks: { type: `${relationPrefix}_task`, label: '关联任务', targetType: 'task' },
        events: { type: `${relationPrefix}_event`, label: '关联事件', targetType: 'event' },
    };
    for (const [bindingKey, items] of Object.entries(bindings)) {
        const config = relationMap[bindingKey];
        if (!config) {
            continue;
        }
        for (const targetRef of items) {
            const targetNodeKey = resolveTargetNodeKey(targetRef, config.targetType, actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext)
                ?? createPlaceholderNode(nodeMap, compareNodeKeyMap, targetRef, config.targetType, labelContext);
            if (!targetNodeKey) {
                continue;
            }
            edgeLedger.append({
                id: `${sourceNodeKey}:${targetNodeKey}:${config.type}`,
                source: sourceNodeKey,
                target: targetNodeKey,
                relationType: config.type,
                label: config.label,
                semanticLabel: config.label,
                debugSummary: `${bindingKey} -> ${targetRef}`,
                confidence: Number(options?.confidence ?? 0.72),
                sourceKinds: options?.sourceKinds?.length ? options.sourceKinds : ['structured_binding'],
                sourceRefs: [targetRef],
                sourceBatchIds: sourceNode?.sourceBatchIds ?? [],
                reasonCodes: options?.reasonCodes?.length ? options.reasonCodes : ['structured_binding_resolved'],
                visibleInModes: ['semantic', 'debug'],
                sections: [{
                    title: '绑定来源',
                    fields: [
                        {
                            label: 'target',
                            value: resolveDisplayLabel(targetRef, {
                                mode: 'semantic',
                                context: labelContext,
                                fallbackLabel: stripComparePrefix(targetRef) || targetRef,
                                typeHint: config.targetType,
                            }),
                            targetNodeId: targetNodeKey,
                            visibleInModes: ['semantic'],
                        },
                        { label: 'bindingKey', value: bindingKey, visibleInModes: ['debug'] },
                        { label: 'targetRef', value: targetRef, visibleInModes: ['debug'] },
                    ],
                }],
                rawData: { bindingKey, targetRef },
            });
        }
    }
}


/**
 * 功能：仅在缺少显式结构化绑定时追加实体字段 fallback 边。
 * @param edgeLedger 图边账本。
 * @param source 源节点。
 * @param bindings 已规范化的结构化绑定。
 * @param bindingKey 对应的绑定键。
 * @param targetRef 目标引用。
 * @param relationType 关系类型。
 * @param label 显示标签。
 * @param targetType 目标类型。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 无返回值。
 */
function appendEntityFieldFallbackEdge(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    source: string,
    bindings: Record<string, string[]>,
    bindingKey: keyof ReturnType<typeof emptyBindings>,
    targetRef: string,
    relationType: string,
    label: string,
    targetType: string,
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    if (hasExplicitBindingTarget(bindings, bindingKey, targetRef, targetType, compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext)) {
        return;
    }
    appendFieldEdge(edgeLedger, source, targetRef, relationType, label, targetType, compareNodeKeyMap, actorNodeKeyMap, nodeMap, labelContext);
}

/**
 * 功能：判断字段引用是否已被显式结构化绑定覆盖。
 * @param bindings 已规范化的结构化绑定。
 * @param bindingKey 对应的绑定键。
 * @param targetRef 目标引用。
 * @param targetType 目标类型。
 * @param compareNodeKeyMap compareKey 映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 是否已经存在显式绑定。
 */
function hasExplicitBindingTarget(
    bindings: Record<string, string[]>,
    bindingKey: keyof ReturnType<typeof emptyBindings>,
    targetRef: string,
    targetType: string,
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): boolean {
    const normalizedTargetRef = String(targetRef ?? '').trim();
    if (!normalizedTargetRef) {
        return true;
    }
    const fieldTargetNodeKey = resolveTargetNodeKey(normalizedTargetRef, targetType, actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext);
    return (bindings[bindingKey] ?? []).some((item: string): boolean => {
        const normalizedItem = String(item ?? '').trim();
        if (!normalizedItem) {
            return false;
        }
        const bindingTargetNodeKey = resolveTargetNodeKey(normalizedItem, targetType, actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext);
        if (fieldTargetNodeKey && bindingTargetNodeKey) {
            return fieldTargetNodeKey === bindingTargetNodeKey;
        }
        return normalizeLookupKey(stripComparePrefix(normalizedItem) || normalizedItem)
            === normalizeLookupKey(stripComparePrefix(normalizedTargetRef) || normalizedTargetRef);
    });
}

function appendFieldEdge(
    edgeLedger: ReturnType<typeof createGraphEdgeLedger>,
    source: string,
    targetRef: string,
    relationType: string,
    label: string,
    targetType: string,
    compareNodeKeyMap: Map<string, string>,
    actorNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): void {
    if (!targetRef) {
        return;
    }
    const sourceNode = nodeMap.get(source);
    const target = resolveTargetNodeKey(targetRef, targetType, actorNodeKeyMap, compareNodeKeyMap, nodeMap, labelContext)
        ?? createPlaceholderNode(nodeMap, compareNodeKeyMap, targetRef, targetType, labelContext);
    if (!target) {
        return;
    }
    edgeLedger.append({
        id: `${source}:${target}:${relationType}`,
        source,
        target,
        relationType,
        label,
        semanticLabel: label,
        debugSummary: `${relationType} -> ${targetRef}`,
        confidence: 0.56,
        sourceKinds: ['fallback_field_inference'],
        sourceRefs: [targetRef],
        sourceBatchIds: sourceNode?.sourceBatchIds ?? [],
        reasonCodes: ['fallback_field_inference_resolved'],
        visibleInModes: ['debug'],
        sections: [{
            title: '字段推导',
            fields: [
                {
                    label: 'target',
                    value: resolveDisplayLabel(targetRef, {
                        mode: 'semantic',
                        context: labelContext,
                        fallbackLabel: stripComparePrefix(targetRef) || targetRef,
                        typeHint: targetType,
                    }),
                    targetNodeId: target,
                    visibleInModes: ['semantic'],
                },
                { label: 'relationType', value: relationType, visibleInModes: ['debug'] },
                { label: 'targetRef', value: targetRef, visibleInModes: ['debug'] },
            ],
        }],
        rawData: { relationType, targetRef },
    });
}

/**
 * 功能：按引用查找目标节点键。
 * @param ref 原始引用。
 * @param targetType 目标类型提示。
 * @param actorNodeKeyMap 角色键映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param nodeMap 节点映射。
 * @param labelContext 显示名上下文。
 * @returns 命中的节点键。
 */
function resolveTargetNodeKey(
    ref: string,
    targetType: string | undefined,
    actorNodeKeyMap: Map<string, string>,
    compareNodeKeyMap: Map<string, string>,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    labelContext: DisplayLabelResolverContext,
): string | undefined {
    const rawRef = String(ref ?? '').trim();
    if (!rawRef) {
        return undefined;
    }
    if (targetType === 'actor' || rawRef === 'user') {
        return ensureActorNodeFromRef(nodeMap, actorNodeKeyMap, rawRef, labelContext);
    }
    if (compareNodeKeyMap.has(rawRef)) {
        return compareNodeKeyMap.get(rawRef);
    }
    const stripped = stripComparePrefix(rawRef);
    const resolvedLabel = resolveDisplayLabel(rawRef, {
        mode: 'semantic',
        context: labelContext,
        fallbackLabel: stripped || rawRef,
        typeHint: targetType,
    });
    const normalizedCandidates = new Set([normalizeLookupKey(rawRef), normalizeLookupKey(stripped), normalizeLookupKey(resolvedLabel)]);
    for (const node of nodeMap.values()) {
        const candidateKeys = [
            normalizeLookupKey(node.label),
            normalizeLookupKey(node.compareKey ?? ''),
            ...node.aliases.map((alias: string): string => normalizeLookupKey(alias)),
        ];
        if (candidateKeys.some((item: string): boolean => normalizedCandidates.has(item))) {
            return node.id;
        }
    }
    return undefined;
}

/**
 * 功能：创建仅在调试模式下可见的占位节点。
 * @param nodeMap 节点映射。
 * @param compareNodeKeyMap compareKey 映射。
 * @param rawRef 原始引用。
 * @param targetType 目标类型。
 * @param labelContext 显示名上下文。
 * @returns 占位节点键。
 */
function createPlaceholderNode(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    compareNodeKeyMap: Map<string, string>,
    rawRef: string,
    targetType: string,
    labelContext: DisplayLabelResolverContext,
): string | undefined {
    const normalizedRef = String(rawRef ?? '').trim();
    if (!normalizedRef) {
        return undefined;
    }
    if (targetType === 'actor' || normalizedRef === 'user') {
        return undefined;
    }
    const nodeKey = `placeholder:${targetType}:${normalizedRef}`;
    if (!nodeMap.has(nodeKey)) {
        upsertNode(nodeMap, {
            id: nodeKey,
            key: nodeKey,
            label: normalizeMemoryCardTitle(normalizedRef, {
                mode: 'debug',
                context: labelContext,
                typeHint: targetType,
                fallbackRef: normalizedRef,
            }),
            type: 'placeholder',
            summary: `未解析引用：${normalizedRef}`,
            semanticSummary: `未解析引用：${normalizedRef}`,
            debugSummary: `unresolved ${targetType}: ${normalizedRef}`,
            compareKey: normalizedRef.includes(':') ? normalizedRef : undefined,
            importance: 0.32,
            memoryPercent: 40,
            aliases: [],
            sourceBatchIds: [],
            sourceKinds: ['unresolved_placeholder'],
            sourceRefs: [normalizedRef],
            reasonCodes: ['unresolved_reference'],
            bindings: emptyBindings(),
            placeholder: true,
            sections: [{
                title: '未解析引用',
                fields: [
                    { label: 'targetType', value: targetType || 'unknown' },
                    { label: 'rawRef', value: normalizedRef },
                ],
                visibleInModes: ['debug'],
            }],
            rawData: { rawRef: normalizedRef, targetType },
            visibleInModes: ['debug'],
        });
    }
    if (normalizedRef.includes(':')) {
        compareNodeKeyMap.set(normalizedRef, nodeKey);
    }
    return nodeKey;
}

/**
 * 功能：写入或合并节点。
 * @param nodeMap 节点映射。
 * @param input 节点输入。
 */
function upsertNode(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    input: Omit<WorkbenchMemoryGraphNode, 'x' | 'y'>,
): void {
    const sanitizedInput = sanitizeWorkbenchNode(input);
    const existing = nodeMap.get(sanitizedInput.id);
    if (!existing) {
        nodeMap.set(sanitizedInput.id, {
            ...sanitizedInput,
            x: 0,
            y: 0,
        });
        return;
    }
    nodeMap.set(sanitizedInput.id, {
        ...existing,
        label: existing.label || sanitizedInput.label,
        summary: existing.summary || sanitizedInput.summary,
        semanticSummary: existing.semanticSummary || sanitizedInput.semanticSummary,
        debugSummary: [existing.debugSummary, sanitizedInput.debugSummary].filter(Boolean).join(' | ') || undefined,
        compareKey: existing.compareKey || sanitizedInput.compareKey,
        status: existing.status || sanitizedInput.status,
        importance: Math.max(existing.importance, sanitizedInput.importance),
        memoryPercent: Math.max(existing.memoryPercent, sanitizedInput.memoryPercent),
        aliases: dedupeStrings([...existing.aliases, ...sanitizedInput.aliases]),
        sourceBatchIds: dedupeStrings([...existing.sourceBatchIds, ...sanitizedInput.sourceBatchIds]),
        sourceKinds: dedupeStrings([...existing.sourceKinds, ...sanitizedInput.sourceKinds]),
        sourceRefs: dedupeStrings([...existing.sourceRefs, ...sanitizedInput.sourceRefs]),
          reasonCodes: dedupeStrings([...existing.reasonCodes, ...sanitizedInput.reasonCodes]),
          bindings: mergeBindings(existing.bindings, sanitizedInput.bindings),
          placeholder: existing.placeholder || sanitizedInput.placeholder,
          hydrationState: existing.hydrationState === 'full' || sanitizedInput.hydrationState === 'full'
              ? 'full'
              : (existing.hydrationState || sanitizedInput.hydrationState),
          visibleInModes: dedupeModes([...(existing.visibleInModes ?? ['semantic', 'debug']), ...(sanitizedInput.visibleInModes ?? ['semantic', 'debug'])]),
          sections: [...existing.sections, ...sanitizedInput.sections],
          rawData: { ...existing.rawData, ...sanitizedInput.rawData },
      });
}

/**
 * 功能：确保角色引用在图中拥有最小可用节点，避免关系边因缺失角色卡而丢失。
 * @param nodeMap 节点映射。
 * @param actorNodeKeyMap 角色键映射。
 * @param actorRef 角色引用。
 * @param labelContext 显示名解析上下文。
 * @returns 角色节点键。
 */
function ensureActorNodeFromRef(
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    actorNodeKeyMap: Map<string, string>,
    actorRef: string,
    labelContext: DisplayLabelResolverContext,
): string | undefined {
    const normalizedRef = normalizeStrictActorKeySyntax(actorRef);
    if (!normalizedRef) {
        return undefined;
    }
    if (!isStrictActorKey(normalizedRef)) {
        return undefined;
    }
    const existingNodeKey = actorNodeKeyMap.get(normalizedRef);
    if (existingNodeKey) {
        return existingNodeKey;
    }
    const nodeKey = `actor:${normalizedRef}`;
    actorNodeKeyMap.set(normalizedRef, nodeKey);
    upsertNode(nodeMap, {
        id: nodeKey,
        key: nodeKey,
        label: resolveDisplayLabel(normalizedRef, {
            mode: 'semantic',
            context: labelContext,
            fallbackLabel: normalizedRef === 'user' ? '你' : '未命名角色',
            typeHint: 'actor',
        }),
        type: 'actor',
        summary: normalizedRef === 'user' ? '当前玩家视角锚点。' : '等待后续角色卡补全的轻量角色引用。',
        semanticSummary: normalizedRef === 'user' ? '当前玩家视角锚点。' : '等待后续角色卡补全的轻量角色引用。',
        debugSummary: `actorKey=${normalizedRef}`,
        importance: normalizedRef === 'user' ? 1 : 0.55,
        memoryPercent: normalizedRef === 'user' ? 100 : 70,
        aliases: [],
        hydrationState: normalizedRef === 'user' ? 'full' : 'partial',
        sourceBatchIds: [],
        sourceKinds: [normalizedRef === 'user' ? 'user_anchor' : 'actor_reference'],
        sourceRefs: [normalizedRef],
        reasonCodes: normalizedRef === 'user' ? [] : ['partial_actor_reference'],
        bindings: emptyBindings(),
        sections: [{
            title: '角色信息',
            fields: [
                { label: '姓名', value: resolveDisplayLabel(normalizedRef, { mode: 'semantic', context: labelContext, typeHint: 'actor' }) },
                { label: 'actorKey', value: normalizedRef, visibleInModes: ['debug'] },
                { label: 'hydrationState', value: normalizedRef === 'user' ? 'full' : 'partial', visibleInModes: ['debug'] },
            ],
        }],
        rawData: {
            actorKey: normalizedRef,
            hydrationState: normalizedRef === 'user' ? 'full' : 'partial',
        },
        visibleInModes: ['semantic', 'debug'],
    });
    return nodeKey;
}

/**
 * 功能：收集图中的事件节点。
 * @param nodeMap 节点映射。
 * @returns 事件节点列表。
 */
function collectPromotedEvents(nodeMap: Map<string, WorkbenchMemoryGraphNode>): WorkbenchMemoryGraphNode[] {
    return [...nodeMap.values()].filter((node: WorkbenchMemoryGraphNode): boolean => node.type === 'event');
}

/**
 * 功能：应用简化力导布局。
 * @param nodes 节点列表。
 * @param edges 边列表。
 */
export function applyUnifiedMemoryGraphLayout(
    nodes: WorkbenchMemoryGraphNode[],
    edges: WorkbenchMemoryGraph['edges'],
): void {
    const count = nodes.length;
    if (count <= 0) {
        return;
    }
    if (count === 1) {
        nodes[0].x = 0;
        nodes[0].y = 0;
        return;
    }

    const layoutRadius = Math.max(280, count * 24);
    const typeAnchors = createTypeLayoutAnchors(layoutRadius);
    const nodeIndexMap = new Map(nodes.map((node: WorkbenchMemoryGraphNode, index: number): [string, number] => [node.id, index]));
    const degreeMap = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();
    const edgePairs = edges
        .map((edge) => {
            const source = nodeIndexMap.get(edge.source) ?? -1;
            const target = nodeIndexMap.get(edge.target) ?? -1;
            if (source >= 0 && target >= 0) {
                degreeMap.set(edge.source, (degreeMap.get(edge.source) ?? 0) + 1);
                degreeMap.set(edge.target, (degreeMap.get(edge.target) ?? 0) + 1);
                if (!adjacency.has(edge.source)) {
                    adjacency.set(edge.source, new Set<string>());
                }
                if (!adjacency.has(edge.target)) {
                    adjacency.set(edge.target, new Set<string>());
                }
                adjacency.get(edge.source)?.add(edge.target);
                adjacency.get(edge.target)?.add(edge.source);
            }
            return {
                source,
                target,
                weight: normalizeEdgeStrength(edge),
            };
        })
        .filter((item) => item.source >= 0 && item.target >= 0);
    const components = buildMemoryGraphComponents(nodes, adjacency, degreeMap);
    seedMemoryGraphNodes(nodes, components, typeAnchors, degreeMap, layoutRadius);
    const velocityX = new Float64Array(count);
    const velocityY = new Float64Array(count);
    const iterations = Math.min(180, Math.max(110, count * 4));
    for (let iteration = 0; iteration < iterations; iteration += 1) {
        const temperature = 1 - (iteration / iterations);
        for (let i = 0; i < count; i += 1) {
            for (let j = i + 1; j < count; j += 1) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const distSq = (dx * dx) + (dy * dy) + 1;
                const force = (38000 * temperature) / distSq;
                const dist = Math.sqrt(distSq);
                velocityX[i] += (dx / dist) * force;
                velocityY[i] += (dy / dist) * force;
                velocityX[j] -= (dx / dist) * force;
                velocityY[j] -= (dy / dist) * force;
            }
        }
        for (const pair of edgePairs) {
            const dx = nodes[pair.target].x - nodes[pair.source].x;
            const dy = nodes[pair.target].y - nodes[pair.source].y;
            const dist = Math.sqrt((dx * dx) + (dy * dy)) + 0.01;
            const sourceNode = nodes[pair.source];
            const targetNode = nodes[pair.target];
            const sameType = sourceNode.type === targetNode.type;
            const idealDistance = sameType ? 130 : 172;
            const displacement = dist - idealDistance;
            const force = (0.038 + (pair.weight * 0.022)) * displacement * temperature;
            velocityX[pair.source] += (dx / dist) * force;
            velocityY[pair.source] += (dy / dist) * force;
            velocityX[pair.target] -= (dx / dist) * force;
            velocityY[pair.target] -= (dy / dist) * force;
        }
        for (let i = 0; i < count; i += 1) {
            const node = nodes[i];
            const typeAnchor = typeAnchors[resolveMemoryGraphLayoutGroup(node.type)];
            const centerPullX = (0 - node.x) * 0.00045;
            const centerPullY = (0 - node.y) * 0.00045;
            const typePullX = (typeAnchor.x - node.x) * 0.0034;
            const typePullY = (typeAnchor.y - node.y) * 0.0034;
            velocityX[i] = (velocityX[i] + centerPullX + typePullX) * 0.88;
            velocityY[i] = (velocityY[i] + centerPullY + typePullY) * 0.88;
            const speed = Math.sqrt((velocityX[i] ** 2) + (velocityY[i] ** 2));
            const maxMove = (44 * temperature) + 2;
            if (speed > maxMove) {
                velocityX[i] = (velocityX[i] / speed) * maxMove;
                velocityY[i] = (velocityY[i] / speed) * maxMove;
            }
            nodes[i].x += velocityX[i];
            nodes[i].y += velocityY[i];
        }
        if (iteration % 16 === 0 || iteration === iterations - 1) {
            applyMemoryGraphCollisionPass(nodes);
        }
    }
    applyMemoryGraphCollisionPass(nodes);
    nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        node.x = Math.round(node.x);
        node.y = Math.round(node.y);
    });
}

type MemoryGraphLayoutGroup =
    | 'social'
    | 'dynamic'
    | 'world'
    | 'peripheral';

interface MemoryGraphTypeAnchor {
    x: number;
    y: number;
}

interface MemoryGraphComponent {
    nodeIds: string[];
    size: number;
    score: number;
}

/**
 * 功能：为不同节点语义区分配稳定的大区锚点。
 * @param radius 当前图谱半径。
 * @returns 各布局区块的锚点坐标。
 */
function createTypeLayoutAnchors(radius: number): Record<MemoryGraphLayoutGroup, MemoryGraphTypeAnchor> {
    return {
        social: { x: -radius * 0.44, y: -radius * 0.08 },
        dynamic: { x: radius * 0.4, y: -radius * 0.04 },
        world: { x: radius * 0.06, y: radius * 0.32 },
        peripheral: { x: -radius * 0.08, y: radius * 0.48 },
    };
}

/**
 * 功能：把节点类型映射到布局分区。
 * @param type 节点类型。
 * @returns 布局分区。
 */
function resolveMemoryGraphLayoutGroup(type: string): MemoryGraphLayoutGroup {
    if (type === 'actor' || type === 'organization') {
        return 'social';
    }
    if (type === 'event' || type === 'task') {
        return 'dynamic';
    }
    if (type === 'location' || type === 'city' || type === 'nation' || type === 'world_state') {
        return 'world';
    }
    return 'peripheral';
}

/**
 * 功能：根据图连通关系构建组件列表，用于初始团簇定位。
 * @param nodes 节点列表。
 * @param adjacency 邻接表。
 * @param degreeMap 节点度数映射。
 * @returns 组件列表。
 */
function buildMemoryGraphComponents(
    nodes: WorkbenchMemoryGraphNode[],
    adjacency: Map<string, Set<string>>,
    degreeMap: Map<string, number>,
): MemoryGraphComponent[] {
    const visited = new Set<string>();
    const components: MemoryGraphComponent[] = [];
    nodes.forEach((node: WorkbenchMemoryGraphNode): void => {
        if (visited.has(node.id)) {
            return;
        }
        const queue = [node.id];
        const componentNodeIds: string[] = [];
        let score = 0;
        visited.add(node.id);
        while (queue.length > 0) {
            const current = queue.shift();
            if (!current) {
                continue;
            }
            componentNodeIds.push(current);
            score += degreeMap.get(current) ?? 0;
            adjacency.get(current)?.forEach((neighbor: string): void => {
                if (visited.has(neighbor)) {
                    return;
                }
                visited.add(neighbor);
                queue.push(neighbor);
            });
        }
        components.push({
            nodeIds: componentNodeIds,
            size: componentNodeIds.length,
            score,
        });
    });
    return components.sort((left: MemoryGraphComponent, right: MemoryGraphComponent): number => {
        if (right.size !== left.size) {
            return right.size - left.size;
        }
        return right.score - left.score;
    });
}

/**
 * 功能：为节点生成“类型分区 + 关系团簇”的初始位置。
 * @param nodes 节点列表。
 * @param components 连通组件列表。
 * @param typeAnchors 类型分区锚点。
 * @param degreeMap 度数映射。
 * @param radius 图谱半径。
 * @returns 无返回值。
 */
function seedMemoryGraphNodes(
    nodes: WorkbenchMemoryGraphNode[],
    components: MemoryGraphComponent[],
    typeAnchors: Record<MemoryGraphLayoutGroup, MemoryGraphTypeAnchor>,
    degreeMap: Map<string, number>,
    radius: number,
): void {
    const nodeMap = new Map(nodes.map((node: WorkbenchMemoryGraphNode): [string, WorkbenchMemoryGraphNode] => [node.id, node]));
    const groupBucketMap = new Map<MemoryGraphLayoutGroup, MemoryGraphComponent[]>();
    components.forEach((component: MemoryGraphComponent): void => {
        const representativeNode = nodeMap.get(component.nodeIds[0]);
        const group = resolveMemoryGraphLayoutGroup(representativeNode?.type ?? 'other');
        if (!groupBucketMap.has(group)) {
            groupBucketMap.set(group, []);
        }
        groupBucketMap.get(group)?.push(component);
    });
    groupBucketMap.forEach((bucket: MemoryGraphComponent[], group: MemoryGraphLayoutGroup): void => {
        const anchor = typeAnchors[group];
        const componentCount = bucket.length;
        bucket.forEach((component: MemoryGraphComponent, componentIndex: number): void => {
            const angle = ((componentIndex / Math.max(componentCount, 1)) * Math.PI * 2) - (Math.PI / 2);
            const orbitRadius = componentCount <= 1
                ? 0
                : Math.min(radius * 0.22, 90 + (componentIndex * 28));
            const componentCenterX = anchor.x + (Math.cos(angle) * orbitRadius);
            const componentCenterY = anchor.y + (Math.sin(angle) * orbitRadius * 0.72);
            positionMemoryGraphComponentNodes(
                component,
                componentCenterX,
                componentCenterY,
                nodeMap,
                degreeMap,
            );
        });
    });
}

/**
 * 功能：把单个连通组件中的节点摆放到局部团簇中。
 * @param component 连通组件。
 * @param centerX 团簇中心横坐标。
 * @param centerY 团簇中心纵坐标。
 * @param nodeMap 节点映射。
 * @param degreeMap 度数映射。
 * @returns 无返回值。
 */
function positionMemoryGraphComponentNodes(
    component: MemoryGraphComponent,
    centerX: number,
    centerY: number,
    nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    degreeMap: Map<string, number>,
): void {
    const componentNodes = component.nodeIds
        .map((nodeId: string): WorkbenchMemoryGraphNode | null => nodeMap.get(nodeId) ?? null)
        .filter((node: WorkbenchMemoryGraphNode | null): node is WorkbenchMemoryGraphNode => Boolean(node))
        .sort((left: WorkbenchMemoryGraphNode, right: WorkbenchMemoryGraphNode): number => {
            const degreeDelta = (degreeMap.get(right.id) ?? 0) - (degreeMap.get(left.id) ?? 0);
            if (degreeDelta !== 0) {
                return degreeDelta;
            }
            return (right.importance ?? 0) - (left.importance ?? 0);
        });
    if (componentNodes.length <= 0) {
        return;
    }
    componentNodes.forEach((node: WorkbenchMemoryGraphNode, index: number): void => {
        if (index === 0) {
            node.x = centerX;
            node.y = centerY;
            return;
        }
        const ringIndex = Math.floor((index - 1) / 6);
        const slotIndex = (index - 1) % 6;
        const slotCount = 6 + (ringIndex * 3);
        const angle = ((slotIndex / slotCount) * Math.PI * 2) - (Math.PI / 2) + (ringIndex * 0.18);
        const radius = 56 + (ringIndex * 34) + (Math.max(0, 4 - (degreeMap.get(node.id) ?? 0)) * 3);
        node.x = centerX + (Math.cos(angle) * radius);
        node.y = centerY + (Math.sin(angle) * radius * 0.78);
    });
}

/**
 * 功能：根据边权重和置信度归一化吸引强度。
 * @param edge 图谱边。
 * @returns 归一化后的强度。
 */
function normalizeEdgeStrength(edge: WorkbenchMemoryGraph['edges'][number]): number {
    const weight = Math.max(0, Math.min(1, Number(edge.weight) || 0));
    const confidence = Math.max(0, Math.min(1, Number(edge.confidence) || 0));
    const strengthBoost = edge.strengthLevel === 'strong'
        ? 0.18
        : edge.strengthLevel === 'normal'
            ? 0.1
            : 0;
    return Math.max(0.12, Math.min(1, (weight * 0.6) + (confidence * 0.24) + strengthBoost));
}

/**
 * 功能：对过密节点做一次轻量碰撞修正，增加留白。
 * @param nodes 节点列表。
 * @returns 无返回值。
 */
function applyMemoryGraphCollisionPass(nodes: WorkbenchMemoryGraphNode[]): void {
    for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
            const left = nodes[i];
            const right = nodes[j];
            const dx = right.x - left.x;
            const dy = right.y - left.y;
            const distance = Math.sqrt((dx * dx) + (dy * dy)) || 0.0001;
            const minDistance = 46
                + ((left.importance + right.importance) * 10)
                + (left.type === right.type ? 8 : 0);
            if (distance >= minDistance) {
                continue;
            }
            const overlap = (minDistance - distance) * 0.5;
            const offsetX = (dx / distance) * overlap;
            const offsetY = (dy / distance) * overlap;
            right.x += offsetX;
            right.y += offsetY;
            left.x -= offsetX;
            left.y -= offsetY;
        }
    }
}

/**
 * 功能：构建可选的数组区块。
 * @param title 区块标题。
 * @param values 文本列表。
 * @returns 区块或空值。
 */
function buildOptionalSection(title: string, values: string[]): WorkbenchMemoryGraphSection | null {
    if (!Array.isArray(values) || values.length <= 0) {
        return null;
    }
    return {
        title,
        fields: values.map((value: string, index: number) => ({
            label: `${title}${index + 1}`,
            value,
        })),
    };
}

/**
 * 功能：把对象格式化为详情区块。
 * @param title 区块标题。
 * @param record 原始对象。
 * @returns 区块或空值。
 */
function buildRecordSection(title: string, record: Record<string, unknown>): WorkbenchMemoryGraphSection | null {
    const fields = Object.entries(record ?? {})
        .map(([key, value]: [string, unknown]) => ({
            label: key,
            value: Array.isArray(value) ? value.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean).join('、') || '暂无' : String(value ?? '').trim() || '暂无',
        }))
        .filter((item) => item.value);
    if (fields.length <= 0) {
        return null;
    }
    return { title, fields, visibleInModes: ['debug'] };
}

/**
 * 功能：把绑定对象格式化为详情区块。
 * @param title 区块标题。
 * @param bindings 原始绑定对象。
 * @returns 区块或空值。
 */
function buildBindingsSection(
    title: string,
    bindings: unknown,
    labelContext: DisplayLabelResolverContext,
): WorkbenchMemoryGraphSection {
    const normalized = normalizeBindings(bindings as MemoryTakeoverBindings | undefined);
    const fields = Object.entries(normalized)
        .filter(([, items]: [string, string[]]): boolean => items.length > 0)
        .flatMap(([key, items]: [string, string[]]) => {
            const rawValue = items.join('、');
            return [
                {
                    label: key,
                    value: resolveBindingDisplayValue(items, labelContext),
                    visibleInModes: ['semantic'] as MemoryGraphMode[],
                },
                {
                    label: `${key}(raw)`,
                    value: rawValue,
                    visibleInModes: ['debug'] as MemoryGraphMode[],
                },
            ];
        });
    return { title, fields };
}

/**
 * 功能：把绑定引用解析为语义模式下的可读文本。
 * @param items 绑定引用列表。
 * @param labelContext 显示名上下文。
 * @returns 可读文本。
 */
function resolveBindingDisplayValue(items: string[], labelContext: DisplayLabelResolverContext): string {
    return items
        .map((item: string): string => resolveDisplayLabel(item, {
            mode: 'semantic',
            context: labelContext,
            fallbackLabel: stripComparePrefix(item) || item,
        }))
        .join('、');
}

/**
 * 功能：把绑定对象归一化。
 * @param bindings 原始绑定对象。
 * @returns 绑定结果。
 */
function normalizeBindings(bindings: MemoryTakeoverBindings | undefined): Record<string, string[]> {
    return {
        actors: dedupeStrings(bindings?.actors ?? []),
        organizations: dedupeStrings(bindings?.organizations ?? []),
        cities: dedupeStrings(bindings?.cities ?? []),
        locations: dedupeStrings(bindings?.locations ?? []),
        nations: dedupeStrings(bindings?.nations ?? []),
        tasks: dedupeStrings(bindings?.tasks ?? []),
        events: dedupeStrings(bindings?.events ?? []),
    };
}

/**
 * 功能：构建空绑定对象。
 * @returns 空绑定对象。
 */
function emptyBindings(): Record<string, string[]> {
    return {
        actors: [],
        organizations: [],
        cities: [],
        locations: [],
        nations: [],
        tasks: [],
        events: [],
    };
}

/**
 * 功能：合并两个绑定对象。
 * @param left 左侧绑定。
 * @param right 右侧绑定。
 * @returns 合并后的绑定对象。
 */
function mergeBindings(left: Record<string, string[]>, right: Record<string, string[]>): Record<string, string[]> {
    const result = emptyBindings();
    (Object.keys(result) as Array<keyof typeof result>).forEach((key) => {
        result[key] = dedupeStrings([...(left[key] ?? []), ...(right[key] ?? [])]);
    });
    return result;
}

/**
 * 功能：对字符串数组做去重。
 * @param values 原始数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    return [...new Set(values.map((item: string): string => String(item ?? '').trim()).filter(Boolean))];
}

/**
 * 功能：对模式数组做去重。
 * @param values 原始数组。
 * @returns 去重结果。
 */
function dedupeModes(values: MemoryGraphMode[]): MemoryGraphMode[] {
    return [...new Set(values)];
}

/**
 * 功能：向来源批次映射中追加一个批次标识。
 * @param sourceMap 来源批次映射。
 * @param key 归档键。
 * @param batchId 批次 ID。
 */
function appendBatchSource(sourceMap: Map<string, string[]>, key: string, batchId: string): void {
    const normalizedKey = String(key ?? '').trim();
    const normalizedBatchId = String(batchId ?? '').trim();
    if (!normalizedKey || !normalizedBatchId) {
        return;
    }
    sourceMap.set(normalizedKey, dedupeStrings([...(sourceMap.get(normalizedKey) ?? []), normalizedBatchId]));
}
