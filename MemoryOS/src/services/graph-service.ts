import { applyUnifiedMemoryGraphLayout, buildTakeoverMemoryGraph } from '../ui/workbenchTabs/shared/memory-graph-builder';
import { parseCompareKey } from '../core/compare-key';
import { stripComparePrefix } from '../ui/workbenchTabs/shared/display-label-resolver';
import type {
    ActorMemoryProfile,
    MemoryEntry,
    MemoryRelationshipRecord,
    MemoryTakeoverProgressSnapshot,
    RoleEntryMemory,
    SummarySnapshot,
} from '../types';
import type {
    WorkbenchMemoryGraph,
    WorkbenchMemoryGraphEdge,
    WorkbenchMemoryGraphNode,
    WorkbenchMemoryGraphSection,
} from '../ui/workbenchTabs/shared/memoryGraphTypes';

interface MemoryGraphBuildInput {
    entries: MemoryEntry[];
    relationships: MemoryRelationshipRecord[];
    actors: ActorMemoryProfile[];
    roleMemories: RoleEntryMemory[];
    summaries: SummarySnapshot[];
}

/**
 * 功能：统一承接记忆图谱构建。
 */
export class GraphService {
    /**
     * 功能：根据接管进度构建图谱快照。
     * @param progress 接管进度。
     * @returns 图谱快照。
     */
    buildTakeoverGraph(progress: MemoryTakeoverProgressSnapshot | null): WorkbenchMemoryGraph {
        return buildTakeoverMemoryGraph(progress);
    }

    /**
     * 功能：根据当前主记忆库构建图谱快照。
     * @param input 主记忆数据。
     * @returns 图谱快照。
     */
    buildMemoryGraphFromMemory(input: MemoryGraphBuildInput): WorkbenchMemoryGraph {
        const nodeMap = new Map<string, WorkbenchMemoryGraphNode>();
        const actorNodeIdMap = new Map<string, string>();
        const entryNodeIdMap = new Map<string, string>();
        const compareNodeIdMap = new Map<string, string>();
        const edgeMap = new Map<string, WorkbenchMemoryGraphEdge>();
        for (const actor of input.actors) {
            const node = this.buildActorNode(actor);
            nodeMap.set(node.id, node);
            actorNodeIdMap.set(actor.actorKey, node.id);
        }
        for (const relationship of input.relationships) {
            this.ensureActorNode(nodeMap, actorNodeIdMap, relationship.sourceActorKey, input.actors);
            this.ensureActorNode(nodeMap, actorNodeIdMap, relationship.targetActorKey, input.actors);
        }
        const memoryPercentMap = this.buildEntryMemoryPercentMap(input.roleMemories);
        for (const entry of input.entries) {
            if (this.appendLegacyRelationshipEntryEdge(edgeMap, entry, nodeMap, actorNodeIdMap, input.actors)) {
                continue;
            }
            const node = this.buildEntryNode(entry, memoryPercentMap.get(entry.entryId) ?? 60);
            nodeMap.set(node.id, node);
            entryNodeIdMap.set(entry.entryId, node.id);
            const compareKey = this.readCompareKey(entry.detailPayload);
            if (compareKey) {
                compareNodeIdMap.set(compareKey, node.id);
            }
            const entityKey = this.readEntityKey(entry.detailPayload);
            if (entityKey) {
                compareNodeIdMap.set(entityKey, node.id);
            }
        }
        for (const relationship of input.relationships) {
            this.appendRelationshipEdge(edgeMap, relationship, actorNodeIdMap);
        }
        for (const entry of input.entries) {
            this.appendEntryBindingEdges(edgeMap, entry, entryNodeIdMap, actorNodeIdMap, compareNodeIdMap, nodeMap);
        }
        for (const summary of input.summaries.slice(0, 8)) {
            const summaryNode = this.buildSummaryNode(summary);
            nodeMap.set(summaryNode.id, summaryNode);
            this.appendSummaryEdges(edgeMap, summary, entryNodeIdMap);
        }
        const nodes = [...nodeMap.values()];
        const edges = [...edgeMap.values()];
        applyUnifiedMemoryGraphLayout(nodes, edges);
        return { nodes, edges };
    }

    /**
     * 功能：构建角色节点。
     * @param actor 角色资料。
     * @returns 图谱节点。
     */
    private buildActorNode(actor: ActorMemoryProfile): WorkbenchMemoryGraphNode {
        const label = normalizeText(actor.displayName) || actor.actorKey;
        return this.buildBaseNode({
            id: `actor:${actor.actorKey}`,
            key: actor.actorKey,
            label,
            type: 'actor',
            summary: `记忆强度 ${actor.memoryStat}`,
            importance: 0.75,
            memoryPercent: actor.memoryStat,
            sourceKinds: ['actor_profile'],
            sourceRefs: [actor.actorKey],
            sections: [{
                title: '角色资料',
                fields: [
                    { label: '角色键', value: actor.actorKey },
                    { label: '显示名', value: label },
                    { label: '记忆强度', value: String(actor.memoryStat) },
                ],
            }],
            rawData: actor as unknown as Record<string, unknown>,
        });
    }

    /**
     * 功能：构建记忆条目节点。
     * @param entry 记忆条目。
     * @param memoryPercent 记忆度。
     * @returns 图谱节点。
     */
    private buildEntryNode(entry: MemoryEntry, memoryPercent: number): WorkbenchMemoryGraphNode {
        const payload = toRecord(entry.detailPayload);
        const compareKey = this.readCompareKey(payload);
        const bindings = toRecord(payload.bindings);
        const rawTitle = normalizeText(entry.title) || stripStableGraphKey(compareKey) || '未命名记忆';
        return this.buildBaseNode({
            id: `entry:${entry.entryId}`,
            key: compareKey || entry.entryId,
            label: normalizeGraphDisplayText(rawTitle, '未命名记忆'),
            type: resolveMemoryGraphNodeType(entry),
            summary: normalizeGraphDisplayText(entry.summary || entry.detail),
            compareKey,
            importance: resolveEntryImportance(entry),
            memoryPercent,
            aliases: toStringArray(payload.aliases),
            sourceBatchIds: entry.sourceSummaryIds,
            sourceKinds: ['memory_entry'],
            sourceRefs: [entry.entryId],
            reasonCodes: toStringArray(payload.reasonCodes),
            bindings: this.normalizeBindings(bindings),
            visibleInModes: isDreamSummaryCandidateEntry(entry) ? ['debug'] : undefined,
            sections: this.buildEntrySections(entry, compareKey),
            rawData: entry as unknown as Record<string, unknown>,
        });
    }

    /**
     * 功能：构建总结节点。
     * @param summary 总结快照。
     * @returns 图谱节点。
     */
    private buildSummaryNode(summary: SummarySnapshot): WorkbenchMemoryGraphNode {
        return this.buildBaseNode({
            id: `summary:${summary.summaryId}`,
            key: summary.summaryId,
            label: normalizeGraphDisplayText(summary.title || '结构化总结', '结构化总结'),
            type: 'event',
            summary: normalizeGraphDisplayText(summary.content),
            importance: 0.45,
            memoryPercent: 60,
            sourceKinds: ['summary_snapshot'],
            sourceRefs: [summary.summaryId],
            sections: [{
                title: '总结快照',
                fields: [
                    { label: '标题', value: summary.title },
                    { label: '内容', value: summary.content || '暂无' },
                    { label: '角色', value: summary.actorKeys.join('、') || '暂无' },
                ],
            }],
            rawData: summary as unknown as Record<string, unknown>,
        });
    }

    /**
     * 功能：构建基础节点。
     * @param input 节点输入。
     * @returns 图谱节点。
     */
    private buildBaseNode(input: {
        id: string;
        key: string;
        label: string;
        type: string;
        summary?: string;
        compareKey?: string;
        importance: number;
        memoryPercent: number;
        aliases?: string[];
        sourceBatchIds?: string[];
        sourceKinds: string[];
        sourceRefs: string[];
        reasonCodes?: string[];
        bindings?: Record<string, string[]>;
        visibleInModes?: WorkbenchMemoryGraphNode['visibleInModes'];
        sections: WorkbenchMemoryGraphSection[];
        rawData: Record<string, unknown>;
    }): WorkbenchMemoryGraphNode {
        const summary = normalizeText(input.summary);
        return {
            id: input.id,
            key: input.key,
            label: input.label,
            type: input.type,
            summary,
            semanticSummary: summary,
            debugSummary: summary,
            compareKey: input.compareKey,
            importance: input.importance,
            memoryPercent: clampPercent(input.memoryPercent),
            aliases: input.aliases ?? [],
            sourceBatchIds: input.sourceBatchIds ?? [],
            sourceKinds: input.sourceKinds,
            sourceRefs: input.sourceRefs,
            reasonCodes: input.reasonCodes ?? [],
            bindings: input.bindings ?? {},
            visibleInModes: input.visibleInModes,
            hydrationState: 'full',
            sections: input.sections,
            rawData: input.rawData,
            x: 0,
            y: 0,
        };
    }

    /**
     * 功能：保证角色节点存在。
     * @param nodeMap 节点映射。
     * @param actorNodeIdMap 角色节点映射。
     * @param actorKey 角色键。
     * @param actors 已知角色列表。
     * @returns 节点 ID。
     */
    private ensureActorNode(
        nodeMap: Map<string, WorkbenchMemoryGraphNode>,
        actorNodeIdMap: Map<string, string>,
        actorKey: string,
        actors: ActorMemoryProfile[],
    ): string {
        const normalized = normalizeText(actorKey);
        const existing = actorNodeIdMap.get(normalized);
        if (existing) {
            return existing;
        }
        const actor = actors.find((item: ActorMemoryProfile): boolean => item.actorKey === normalized) ?? {
            actorKey: normalized,
            chatKey: '',
            displayName: normalized === 'user' ? '你' : normalized,
            memoryStat: 60,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        const node = this.buildActorNode(actor);
        nodeMap.set(node.id, node);
        actorNodeIdMap.set(normalized, node.id);
        return node.id;
    }

    /**
     * 功能：追加关系主表边。
     * @param edgeMap 边映射。
     * @param relationship 关系记录。
     * @param actorNodeIdMap 角色节点映射。
     * @returns 无返回值。
     */
    private appendRelationshipEdge(
        edgeMap: Map<string, WorkbenchMemoryGraphEdge>,
        relationship: MemoryRelationshipRecord,
        actorNodeIdMap: Map<string, string>,
    ): void {
        const source = actorNodeIdMap.get(relationship.sourceActorKey);
        const target = actorNodeIdMap.get(relationship.targetActorKey);
        if (!source || !target) {
            return;
        }
        const id = `relationship:${relationship.relationshipId}`;
        edgeMap.set(id, {
            id,
            source,
            target,
            relationType: 'relationship',
            label: relationship.relationTag || '关系',
            semanticLabel: relationship.relationTag || '关系',
            debugSummary: relationship.summary || relationship.state,
            confidence: 0.85,
            weight: Math.max(1, Math.min(5, 1 + ((Math.abs(relationship.trust) + Math.abs(relationship.affection) + Math.abs(relationship.tension)) / 90))),
            strengthLevel: resolveEdgeStrength(relationship),
            status: relationship.ongoing === false ? 'inactive' : 'active',
            visibleInModes: ['semantic', 'debug'],
            sourceKinds: ['memory_relationship'],
            sourceRefs: [relationship.relationshipId],
            sourceBatchIds: [],
            reasonCodes: [],
            sections: [{
                title: '关系详情',
                fields: [
                    { label: '关系标签', value: relationship.relationTag },
                    { label: '状态', value: relationship.state || '暂无' },
                    { label: '摘要', value: relationship.summary || '暂无' },
                    { label: '信任度', value: String(relationship.trust) },
                    { label: '好感度', value: String(relationship.affection) },
                    { label: '紧张度', value: String(relationship.tension) },
                ],
            }],
            rawData: relationship as unknown as Record<string, unknown>,
        });
    }

    /**
     * 功能：把旧关系条目投影为角色关系边。
     * @param edgeMap 边映射。
     * @param entry 记忆条目。
     * @param nodeMap 节点映射。
     * @param actorNodeIdMap 角色节点映射。
     * @param actors 已知角色列表。
     * @returns 是否已处理为关系边。
     */
    private appendLegacyRelationshipEntryEdge(
        edgeMap: Map<string, WorkbenchMemoryGraphEdge>,
        entry: MemoryEntry,
        nodeMap: Map<string, WorkbenchMemoryGraphNode>,
        actorNodeIdMap: Map<string, string>,
        actors: ActorMemoryProfile[],
    ): boolean {
        const relationship = resolveLegacyRelationshipEntry(entry);
        if (!relationship) {
            return false;
        }
        const source = this.ensureActorNode(nodeMap, actorNodeIdMap, relationship.sourceActorKey, actors);
        const target = this.ensureActorNode(nodeMap, actorNodeIdMap, relationship.targetActorKey, actors);
        const id = `legacy_relationship:${entry.entryId}`;
        edgeMap.set(id, {
            id,
            source,
            target,
            relationType: 'relationship',
            label: relationship.relationTag,
            semanticLabel: relationship.relationTag,
            debugSummary: relationship.summary || relationship.state,
            confidence: 0.68,
            weight: Math.max(1, Math.min(5, 1 + ((Math.abs(relationship.trust) + Math.abs(relationship.affection) + Math.abs(relationship.tension)) / 90))),
            strengthLevel: resolveEdgeStrength(relationship),
            status: relationship.ongoing === false ? 'inactive' : 'active',
            visibleInModes: ['semantic', 'debug'],
            sourceKinds: ['legacy_relationship_entry'],
            sourceRefs: [entry.entryId],
            sourceBatchIds: entry.sourceSummaryIds,
            reasonCodes: ['legacy_relationship_entry'],
            sections: [{
                title: '旧关系条目',
                fields: [
                    { label: '关系标签', value: relationship.relationTag },
                    { label: '状态', value: relationship.state || '暂无' },
                    { label: '摘要', value: relationship.summary || '暂无' },
                    { label: '来源条目', value: entry.entryId, visibleInModes: ['debug'] },
                ],
            }],
            rawData: entry as unknown as Record<string, unknown>,
        });
        return true;
    }

    /**
     * 功能：追加条目绑定边。
     * @param edgeMap 边映射。
     * @param entry 记忆条目。
     * @param entryNodeIdMap 条目节点映射。
     * @param actorNodeIdMap 角色节点映射。
     * @param compareNodeIdMap compareKey 节点映射。
     * @param nodeMap 节点映射。
     * @returns 无返回值。
     */
    private appendEntryBindingEdges(
        edgeMap: Map<string, WorkbenchMemoryGraphEdge>,
        entry: MemoryEntry,
        entryNodeIdMap: Map<string, string>,
        actorNodeIdMap: Map<string, string>,
        compareNodeIdMap: Map<string, string>,
        nodeMap: Map<string, WorkbenchMemoryGraphNode>,
    ): void {
        const entryNodeId = entryNodeIdMap.get(entry.entryId);
        if (!entryNodeId) {
            return;
        }
        const bindings = this.normalizeBindings(toRecord(toRecord(entry.detailPayload).bindings));
        for (const actorKey of bindings.actors ?? []) {
            const actorNodeId = actorNodeIdMap.get(actorKey);
            if (actorNodeId) {
                this.appendGenericEdge(edgeMap, actorNodeId, entryNodeId, 'entry_binding_actor', '关联', entry.entryId, 'structured_binding');
            }
        }
        for (const [bindingKey, refs] of Object.entries(bindings)) {
            if (bindingKey === 'actors') {
                continue;
            }
            for (const ref of refs) {
                const targetNodeId = compareNodeIdMap.get(ref) ?? this.ensurePlaceholderNode(nodeMap, compareNodeIdMap, ref, bindingKey);
                this.appendGenericEdge(edgeMap, entryNodeId, targetNodeId, `entry_binding_${bindingKey}`, '绑定', entry.entryId, 'structured_binding');
            }
        }
    }

    /**
     * 功能：追加总结来源边。
     * @param edgeMap 边映射。
     * @param summary 总结快照。
     * @param entryNodeIdMap 条目节点映射。
     * @returns 无返回值。
     */
    private appendSummaryEdges(
        edgeMap: Map<string, WorkbenchMemoryGraphEdge>,
        summary: SummarySnapshot,
        entryNodeIdMap: Map<string, string>,
    ): void {
        for (const upsert of summary.entryUpserts ?? []) {
            if (!upsert.entryId) {
                continue;
            }
            const entryNodeId = entryNodeIdMap.get(upsert.entryId);
            if (!entryNodeId) {
                continue;
            }
            const summaryNodeId = `summary:${summary.summaryId}`;
            this.appendGenericEdge(edgeMap, summaryNodeId, entryNodeId, 'summary_updated_entry', '总结更新', summary.summaryId, 'summary_snapshot');
        }
    }

    /**
     * 功能：追加通用图谱边。
     * @param edgeMap 边映射。
     * @param source 源节点 ID。
     * @param target 目标节点 ID。
     * @param relationType 关系类型。
     * @param label 显示标签。
     * @param sourceRef 来源引用。
     * @param sourceKind 来源类型。
     * @returns 无返回值。
     */
    private appendGenericEdge(
        edgeMap: Map<string, WorkbenchMemoryGraphEdge>,
        source: string,
        target: string,
        relationType: string,
        label: string,
        sourceRef: string,
        sourceKind: string,
    ): void {
        const id = `${relationType}:${source}:${target}:${sourceRef}`;
        if (source === target || edgeMap.has(id)) {
            return;
        }
        edgeMap.set(id, {
            id,
            source,
            target,
            relationType,
            label,
            semanticLabel: label,
            confidence: 0.72,
            weight: 1.4,
            strengthLevel: 'normal',
            status: 'active',
            visibleInModes: ['semantic', 'debug'],
            sourceKinds: [sourceKind],
            sourceRefs: [sourceRef],
            sourceBatchIds: [],
            reasonCodes: [sourceKind],
            sections: [{
                title: '绑定关系',
                fields: [
                    { label: '来源类型', value: sourceKind },
                    { label: '来源引用', value: sourceRef },
                ],
            }],
            rawData: { sourceRef, sourceKind },
        });
    }

    /**
     * 功能：确保占位节点存在。
     * @param nodeMap 节点映射。
     * @param compareNodeIdMap compareKey 节点映射。
     * @param ref 引用。
     * @param bindingKey 绑定键。
     * @returns 节点 ID。
     */
    private ensurePlaceholderNode(
        nodeMap: Map<string, WorkbenchMemoryGraphNode>,
        compareNodeIdMap: Map<string, string>,
        ref: string,
        bindingKey: string,
    ): string {
        const id = `placeholder:${bindingKey}:${ref}`;
        if (!nodeMap.has(id)) {
            nodeMap.set(id, this.buildBaseNode({
                id,
                key: ref,
                label: normalizeGraphDisplayText(ref, '未解析引用'),
                type: 'placeholder',
                summary: `未解析引用：${normalizeGraphDisplayText(ref, '未解析引用')}`,
                importance: 0.35,
                memoryPercent: 30,
                sourceKinds: ['unresolved_placeholder'],
                sourceRefs: [ref],
                reasonCodes: ['unresolved_reference'],
                visibleInModes: ['debug'],
                sections: [{
                    title: '占位节点',
                    fields: [
                        { label: '绑定键', value: bindingKey },
                        { label: '目标引用', value: ref },
                    ],
                }],
                rawData: { ref, bindingKey },
            }));
        }
        compareNodeIdMap.set(ref, id);
        return id;
    }

    /**
     * 功能：构建条目详情区块。
     * @param entry 记忆条目。
     * @param compareKey 比较键。
     * @returns 详情区块列表。
     */
    private buildEntrySections(entry: MemoryEntry, compareKey: string): WorkbenchMemoryGraphSection[] {
        const payload = toRecord(entry.detailPayload);
        const fields = toRecord(payload.fields);
        return [{
            title: '记忆条目',
            fields: [
                { label: '标题', value: entry.title },
                { label: '类型', value: entry.entryType },
                { label: '摘要', value: entry.summary || '暂无' },
                ...(compareKey ? [{ label: '对比键', value: compareKey }] : []),
            ],
        }, {
            title: '结构化字段',
            fields: Object.entries(fields).slice(0, 16).map(([key, value]: [string, unknown]) => ({
                label: key,
                value: formatFieldValue(value),
            })),
            visibleInModes: ['debug'],
        }];
    }

    /**
     * 功能：构建条目记忆度映射。
     * @param roleMemories 角色记忆列表。
     * @returns 条目记忆度映射。
     */
    private buildEntryMemoryPercentMap(roleMemories: RoleEntryMemory[]): Map<string, number> {
        const result = new Map<string, number>();
        for (const row of roleMemories) {
            result.set(row.entryId, Math.max(result.get(row.entryId) ?? 0, row.memoryPercent));
        }
        return result;
    }

    /**
     * 功能：读取条目比较键。
     * @param payload 结构化载荷。
     * @returns 比较键。
     */
    private readCompareKey(payload: unknown): string {
        const record = toRecord(payload);
        const fields = toRecord(record.fields);
        return normalizeText(record.compareKey ?? fields.compareKey);
    }

    /**
     * 功能：读取条目实体键。
     * @param payload 结构化载荷。
     * @returns 实体键。
     */
    private readEntityKey(payload: unknown): string {
        const record = toRecord(payload);
        const fields = toRecord(record.fields);
        return normalizeText(record.entityKey ?? fields.entityKey);
    }

    /**
     * 功能：归一化绑定字段。
     * @param value 原始绑定载荷。
     * @returns 绑定映射。
     */
    private normalizeBindings(value: Record<string, unknown>): Record<string, string[]> {
        return {
            actors: toStringArray(value.actors),
            organizations: toStringArray(value.organizations),
            cities: toStringArray(value.cities),
            locations: toStringArray(value.locations),
            nations: toStringArray(value.nations),
            tasks: toStringArray(value.tasks),
            events: toStringArray(value.events),
        };
    }

}

/**
 * 功能：标准化文本。
 * @param value 原始值。
 * @returns 文本。
 */
function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}

/**
 * 功能：把图谱显示文本中的内部键转换为可读文本。
 * @param value 原始文本。
 * @param fallback 兜底文本。
 * @returns 可读文本。
 */
function normalizeGraphDisplayText(value: unknown, fallback = ''): string {
    const source = normalizeText(value);
    if (!source) {
        return fallback;
    }
    const rewritten = source.replace(/\b(ck:v2:[^\s，。；、]+|ek:[^\s，。；、]+|entity:[^\s，。；、]+|(?:organization|city|nation|location|task|event|world_global_state|world):[^\s，。；、]+)/gi, (matched: string): string => {
        return stripStableGraphKey(matched) || matched;
    });
    return rewritten.trim() || fallback;
}

/**
 * 功能：裁剪稳定键前缀，得到可读名称。
 * @param value 原始稳定键。
 * @returns 可读名称。
 */
function stripStableGraphKey(value: unknown): string {
    return stripComparePrefix(normalizeText(value));
}

/**
 * 功能：把未知值转换为对象。
 * @param value 原始值。
 * @returns 对象。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：把未知值转换为字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function toStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        const text = normalizeText(value);
        return text ? [text] : [];
    }
    return Array.from(new Set(value.map((item: unknown): string => normalizeText(item)).filter(Boolean)));
}

/**
 * 功能：限制百分比范围。
 * @param value 原始值。
 * @returns 百分比。
 */
function clampPercent(value: number): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(numeric)));
}

const DIRECT_GRAPH_NODE_TYPES = new Set(['organization', 'city', 'nation', 'location', 'task', 'event', 'item']);
const WORLD_GRAPH_ENTRY_TYPES = new Set([
    'world_global_state',
    'world_core_setting',
    'world_hard_rule',
    'world_hard_rule_legacy',
    'scene_shared_state',
    'world',
]);
const EVENT_GRAPH_ENTRY_TYPES = new Set([
    'event',
    'actor_visible_event',
    'visible_event',
    'stable_event',
]);
const ITEM_GRAPH_ENTRY_TYPES = new Set(['item', 'artifact', 'tool_artifact', 'relic', 'equipment', 'resource']);
const ACTOR_GRAPH_ENTRY_TYPES = new Set(['actor', 'actor_profile', 'character', 'role']);

/**
 * 功能：判断条目是否为梦境总结候选。
 * @param entry 记忆条目。
 * @returns 是否为梦境总结候选。
 */
function isDreamSummaryCandidateEntry(entry: MemoryEntry): boolean {
    const payload = toRecord(entry.detailPayload);
    return normalizeGraphTypeToken(entry.entryType) === 'dream_summary_candidate'
        || Boolean(payload.dreamSummaryCandidate);
}

/**
 * 功能：按旧聊天接管图谱语义解析主记忆节点类型。
 * @param entry 记忆条目。
 * @returns 图谱节点类型。
 */
function resolveMemoryGraphNodeType(entry: MemoryEntry): string {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const compareKey = normalizeText(payload.compareKey ?? fields.compareKey);
    const parsedCompareKey = parseCompareKey(compareKey);
    const candidateTypes = [
        entry.entryType,
        entry.category,
        payload.targetKind,
        payload.entityType,
        payload.type,
        payload.kind,
        payload.category,
        fields.entityType,
        fields.type,
        fields.kind,
        fields.category,
        parsedCompareKey.entityType,
    ].map((value: unknown): string => normalizeGraphTypeToken(value)).filter(Boolean);
    for (const candidate of candidateTypes) {
        const resolved = resolveGraphTypeToken(candidate);
        if (resolved) {
            return resolved;
        }
    }
    if (hasAnyStructuredValue(fields, ['location', 'locationKey', 'city', 'nation', 'region'])) {
        return 'location';
    }
    if (hasAnyStructuredValue(fields, ['owner', 'holder', 'ability', 'rarity'])) {
        return 'item';
    }
    return 'other';
}

/**
 * 功能：判断条目是否为旧关系条目。
 * @param entry 记忆条目。
 * @returns 是否为旧关系条目。
 */
function isLegacyRelationshipEntry(entry: MemoryEntry): boolean {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const compareKey = normalizeText(payload.compareKey ?? fields.compareKey);
    const parsedCompareKey = parseCompareKey(compareKey);
    return normalizeGraphTypeToken(entry.entryType) === 'relationship'
        || normalizeGraphTypeToken(payload.targetKind) === 'relationship'
        || normalizeGraphTypeToken(fields.targetKind) === 'relationship'
        || parsedCompareKey.entityType === 'relationship';
}

/**
 * 功能：从旧关系条目解析关系边数据。
 * @param entry 记忆条目。
 * @returns 关系边数据；无法解析时返回 null。
 */
function resolveLegacyRelationshipEntry(entry: MemoryEntry): MemoryRelationshipRecord | null {
    if (!isLegacyRelationshipEntry(entry)) {
        return null;
    }
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const compareKey = normalizeText(payload.compareKey ?? fields.compareKey);
    const parsedCompareKey = parseCompareKey(compareKey);
    const sourceActorKey = normalizeGraphActorKey(payload.sourceActorKey ?? fields.sourceActorKey ?? parsedCompareKey.sourceActorKey);
    const targetActorKey = normalizeGraphActorKey(payload.targetActorKey ?? fields.targetActorKey ?? parsedCompareKey.targetActorKey);
    const relationTag = normalizeText(payload.relationTag ?? fields.relationTag ?? parsedCompareKey.relationTag ?? entry.title) || '关系';
    if (!sourceActorKey || !targetActorKey) {
        return null;
    }
    return {
        relationshipId: `legacy:${entry.entryId}`,
        chatKey: entry.chatKey,
        sourceActorKey,
        targetActorKey,
        relationTag,
        state: normalizeText(payload.state ?? fields.state ?? entry.detail),
        summary: normalizeText(payload.summary ?? fields.summary ?? entry.summary),
        trust: normalizeNumericGraphValue(payload.trust ?? fields.trust),
        affection: normalizeNumericGraphValue(payload.affection ?? fields.affection),
        tension: normalizeNumericGraphValue(payload.tension ?? fields.tension),
        participants: toStringArray(payload.participants ?? fields.participants),
        ongoing: entry.ongoing,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
    };
}

/**
 * 功能：归一化图谱类型候选值。
 * @param value 原始值。
 * @returns 小写类型值。
 */
function normalizeGraphTypeToken(value: unknown): string {
    return normalizeText(value).toLowerCase().replace(/\s+/g, '_');
}

/**
 * 功能：把候选类型映射为图谱节点类型。
 * @param token 候选类型。
 * @returns 图谱节点类型；无法识别时返回空字符串。
 */
function resolveGraphTypeToken(token: string): string {
    if (DIRECT_GRAPH_NODE_TYPES.has(token)) {
        return token;
    }
    if (WORLD_GRAPH_ENTRY_TYPES.has(token)) {
        return 'world_state';
    }
    if (EVENT_GRAPH_ENTRY_TYPES.has(token)) {
        return 'event';
    }
    if (ITEM_GRAPH_ENTRY_TYPES.has(token)) {
        return 'item';
    }
    if (ACTOR_GRAPH_ENTRY_TYPES.has(token)) {
        return 'actor';
    }
    if (token === 'dream_summary_candidate') {
        return 'dream_summary_candidate';
    }
    if (token === '国家') {
        return 'nation';
    }
    if (token === '城市') {
        return 'city';
    }
    if (token === '地点') {
        return 'location';
    }
    if (token === '组织') {
        return 'organization';
    }
    if (token === '事件') {
        return 'event';
    }
    if (token === '任务') {
        return 'task';
    }
    if (token === '物品') {
        return 'item';
    }
    if (token === '世界基础' || token === '世界状态') {
        return 'world_state';
    }
    return '';
}

/**
 * 功能：判断对象是否包含任一有效字段。
 * @param record 字段对象。
 * @param keys 字段键列表。
 * @returns 是否包含有效字段。
 */
function hasAnyStructuredValue(record: Record<string, unknown>, keys: string[]): boolean {
    return keys.some((key: string): boolean => {
        const value = record[key];
        return Array.isArray(value) ? value.length > 0 : normalizeText(value).length > 0;
    });
}

/**
 * 功能：归一化图谱角色键。
 * @param value 原始值。
 * @returns 角色键。
 */
function normalizeGraphActorKey(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

/**
 * 功能：归一化图谱数值。
 * @param value 原始值。
 * @returns 数值。
 */
function normalizeNumericGraphValue(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}

/**
 * 功能：解析条目重要度。
 * @param entry 记忆条目。
 * @returns 重要度。
 */
function resolveEntryImportance(entry: MemoryEntry): number {
    if (entry.entryType === 'task' || entry.entryType === 'event') {
        return 0.72;
    }
    if (entry.entryType.startsWith('world_')) {
        return 0.82;
    }
    return 0.58;
}

/**
 * 功能：解析关系边强度。
 * @param relationship 关系记录。
 * @returns 边强度。
 */
function resolveEdgeStrength(relationship: MemoryRelationshipRecord): WorkbenchMemoryGraphEdge['strengthLevel'] {
    const score = Math.abs(relationship.trust) + Math.abs(relationship.affection) + Math.abs(relationship.tension);
    if (score >= 160) {
        return 'strong';
    }
    if (score <= 45) {
        return 'weak';
    }
    return 'normal';
}

/**
 * 功能：格式化字段值。
 * @param value 原始值。
 * @returns 文本值。
 */
function formatFieldValue(value: unknown): string {
    if (Array.isArray(value)) {
        return value.map((item: unknown): string => normalizeText(item)).filter(Boolean).join('、');
    }
    if (value && typeof value === 'object') {
        return JSON.stringify(value);
    }
    return normalizeText(value) || '暂无';
}
