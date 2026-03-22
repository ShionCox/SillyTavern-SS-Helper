import { db, type DBEvent, type DBFact, type DBSummary, type DBWorldState } from '../db/db';
import type {
    AdaptiveMetrics,
    CanonSnapshot,
    ChatContextSnapshot,
    ChatLifecycleState,
    CharacterSnapshot,
    EditorExperienceSnapshot,
    ChatSemanticSeed,
    EditorDataLayerSnapshot,
    EditorHealthIssue,
    EditorHealthSnapshot,
    EditorSourceKind,
    GroupMemoryState,
    LogicalChatView,
    MaintenanceInsight,
    RelationshipState,
    SceneSnapshot,
    SnapshotValue,
    SourceRef,
    SummarySettings,
    SummarySettingsOverride,
    EffectiveSummarySettings,
    SummarySettingsSource,
    MemoryCardViewerSnapshot,
    MemoryRecallPreviewResult,
    WorldTemplate,
} from '../../../SDK/stx';
import { ChatStateManager } from '../core/chat-state-manager';
import { TemplateManager } from '../template/template-manager';
import { VectorMemoryViewerFacade } from './vector-memory-viewer';

const EMPTY_STABLE_LABEL = '尚未稳定抽取';

interface EditorContextBundle {
    template: WorldTemplate | null;
    adaptiveMetrics: AdaptiveMetrics;
    lifecycleState: ChatLifecycleState;
    semanticSeed: ChatSemanticSeed | null;
    groupMemory: GroupMemoryState | null;
    logicalView: LogicalChatView | null;
    maintenanceInsights: MaintenanceInsight[];
    relationshipState: RelationshipState[];
    facts: DBFact[];
    summaries: DBSummary[];
    events: DBEvent[];
    states: DBWorldState[];
    schemaDraftSession: { draftRevisionId: string | null };
    rowAliasIndex: Record<string, Record<string, string>>;
    rowRedirects: Record<string, Record<string, string>>;
    rowTombstones: Record<string, Record<string, unknown>>;
}

interface SnapshotValueInput {
    value: string;
    confidence?: number;
    sourceKind: EditorSourceKind;
    updatedAt?: number;
    sourceRef?: SourceRef;
}

function normalizeText(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeLookupKey(value: unknown): string {
    return normalizeText(value).toLowerCase();
}

function uniqueStrings(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = normalizeText(value);
        if (!text) {
            continue;
        }
        const key = normalizeLookupKey(text);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(text);
    }
    return result;
}

function toTextArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return uniqueStrings(value.flatMap((item: unknown): string[] => toTextArray(item)));
    }
    if (value && typeof value === 'object') {
        return uniqueStrings(Object.values(value as Record<string, unknown>).flatMap((item: unknown): string[] => toTextArray(item)));
    }
    const text = normalizeText(value);
    return text ? [text] : [];
}

function guessConfidence(sourceKind: EditorSourceKind, confidence?: number): number {
    if (Number.isFinite(confidence)) {
        return Math.max(0, Math.min(1, Number(confidence)));
    }
    if (sourceKind === 'manual') return 1;
    if (sourceKind === 'fact') return 0.9;
    if (sourceKind === 'world_state') return 0.8;
    if (sourceKind === 'semantic_seed') return 0.68;
    if (sourceKind === 'group_memory') return 0.62;
    if (sourceKind === 'summary') return 0.58;
    return 0.4;
}

function makeSourceRef(kind: EditorSourceKind, label: string, options: {
    recordId?: string;
    path?: string;
    ts?: number;
    note?: string;
} = {}): SourceRef {
    return {
        kind,
        label,
        recordId: options.recordId,
        path: options.path,
        ts: options.ts,
        note: options.note,
    };
}

function mergeSourceRefs(current: SourceRef[] | undefined, next: SourceRef | undefined): SourceRef[] | undefined {
    if (!next) {
        return current;
    }
    const existing = Array.isArray(current) ? current.slice() : [];
    const signature = [next.kind, next.label, next.recordId, next.path, next.ts].join('|');
    const found = existing.some((item: SourceRef): boolean => [item.kind, item.label, item.recordId, item.path, item.ts].join('|') === signature);
    if (!found) {
        existing.push(next);
    }
    return existing;
}

function pushSnapshotValue(target: Map<string, SnapshotValue>, input: SnapshotValueInput): void {
    const value = normalizeText(input.value);
    if (!value) {
        return;
    }
    const key = normalizeLookupKey(value);
    const existing = target.get(key);
    if (!existing) {
        target.set(key, {
            value,
            confidence: guessConfidence(input.sourceKind, input.confidence),
            sourceKinds: [input.sourceKind],
            updatedAt: input.updatedAt,
            sourceRefs: input.sourceRef ? [input.sourceRef] : undefined,
        });
        return;
    }
    existing.confidence = Math.max(existing.confidence, guessConfidence(input.sourceKind, input.confidence));
    if (!existing.sourceKinds.includes(input.sourceKind)) {
        existing.sourceKinds = existing.sourceKinds.concat(input.sourceKind);
    }
    existing.updatedAt = Math.max(Number(existing.updatedAt ?? 0), Number(input.updatedAt ?? 0)) || undefined;
    existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, input.sourceRef);
}

function finalizeSnapshotValues(map: Map<string, SnapshotValue>, placeholder = true): SnapshotValue[] {
    const values = Array.from(map.values()).sort((left: SnapshotValue, right: SnapshotValue): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0));
    if (values.length > 0 || !placeholder) {
        return values;
    }
    return [{ value: EMPTY_STABLE_LABEL, confidence: 0, sourceKinds: ['derived'] }];
}

function mergeSnapshotValuesIntoMap(target: Map<string, SnapshotValue>, values: SnapshotValue[] | undefined): void {
    for (const value of values ?? []) {
        const text = normalizeText(value?.value);
        if (!text || text === EMPTY_STABLE_LABEL) {
            continue;
        }
        const key = normalizeLookupKey(text);
        const existing = target.get(key);
        if (!existing) {
            target.set(key, {
                value: text,
                confidence: Number.isFinite(value?.confidence) ? Number(value.confidence) : 0,
                sourceKinds: Array.isArray(value?.sourceKinds) ? value.sourceKinds.slice() : ['derived'],
                updatedAt: Number(value?.updatedAt ?? 0) || undefined,
                sourceRefs: Array.isArray(value?.sourceRefs) ? value.sourceRefs.slice() : undefined,
            });
            continue;
        }
        existing.confidence = Math.max(Number(existing.confidence ?? 0), Number(value?.confidence ?? 0));
        const nextKinds = Array.isArray(value?.sourceKinds) ? value.sourceKinds : [];
        for (const kind of nextKinds) {
            if (!existing.sourceKinds.includes(kind)) {
                existing.sourceKinds.push(kind);
            }
        }
        existing.updatedAt = Math.max(Number(existing.updatedAt ?? 0), Number(value?.updatedAt ?? 0)) || undefined;
        for (const sourceRef of value?.sourceRefs ?? []) {
            existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, sourceRef);
        }
    }
}

function mergeCharacterSnapshotsByDisplayName(snapshots: CharacterSnapshot[]): CharacterSnapshot[] {
    const merged = new Map<string, CharacterSnapshot>();
    for (const item of snapshots) {
        const displayKey = normalizeLookupKey(item.displayName);
        const mergeKey = displayKey && displayKey !== normalizeLookupKey(EMPTY_STABLE_LABEL)
            ? displayKey
            : normalizeLookupKey(item.actorKey);
        const existing = merged.get(mergeKey);
        if (!existing) {
            merged.set(mergeKey, {
                actorKey: item.actorKey,
                displayName: item.displayName,
                aliases: item.aliases.slice(),
                identities: item.identities.slice(),
                relationshipAnchors: item.relationshipAnchors.slice(),
                currentLocation: item.currentLocation ? { ...item.currentLocation, sourceKinds: item.currentLocation.sourceKinds.slice(), sourceRefs: item.currentLocation.sourceRefs?.slice() } : undefined,
                lastActiveAt: item.lastActiveAt,
                sourceRefs: item.sourceRefs?.slice(),
            });
            continue;
        }

        const aliasMap = new Map<string, SnapshotValue>();
        mergeSnapshotValuesIntoMap(aliasMap, existing.aliases);
        mergeSnapshotValuesIntoMap(aliasMap, item.aliases);
        existing.aliases = finalizeSnapshotValues(aliasMap, false);

        const identityMap = new Map<string, SnapshotValue>();
        mergeSnapshotValuesIntoMap(identityMap, existing.identities);
        mergeSnapshotValuesIntoMap(identityMap, item.identities);
        existing.identities = finalizeSnapshotValues(identityMap, true);

        const anchorMap = new Map<string, SnapshotValue>();
        mergeSnapshotValuesIntoMap(anchorMap, existing.relationshipAnchors);
        mergeSnapshotValuesIntoMap(anchorMap, item.relationshipAnchors);
        existing.relationshipAnchors = finalizeSnapshotValues(anchorMap, true);

        const locationMap = new Map<string, SnapshotValue>();
        mergeSnapshotValuesIntoMap(locationMap, existing.currentLocation ? [existing.currentLocation] : []);
        mergeSnapshotValuesIntoMap(locationMap, item.currentLocation ? [item.currentLocation] : []);
        existing.currentLocation = finalizeSnapshotValues(locationMap, false)[0];

        existing.lastActiveAt = Math.max(Number(existing.lastActiveAt ?? 0), Number(item.lastActiveAt ?? 0)) || undefined;
        for (const sourceRef of item.sourceRefs ?? []) {
            existing.sourceRefs = mergeSourceRefs(existing.sourceRefs, sourceRef);
        }

        const currentDisplay = normalizeText(existing.displayName);
        const nextDisplay = normalizeText(item.displayName);
        if (currentDisplay === EMPTY_STABLE_LABEL && nextDisplay && nextDisplay !== EMPTY_STABLE_LABEL) {
            existing.displayName = nextDisplay;
        }
    }
    return Array.from(merged.values());
}

function sumRecordMapEntries(value: Record<string, Record<string, unknown>>): number {
    return Object.values(value ?? {}).reduce((count: number, tableRows: Record<string, unknown>): number => count + Object.keys(tableRows ?? {}).length, 0);
}

function matchActorKey(candidate: string, actorKey: string): boolean {
    const left = normalizeLookupKey(candidate);
    const right = normalizeLookupKey(actorKey);
    if (!left || !right) {
        return false;
    }
    return left === right || right.endsWith(`:${left}`) || right.includes(left);
}

function readFactValueField(fact: DBFact, fieldKeys: string[]): string[] {
    const value = fact.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
    }
    return fieldKeys.flatMap((fieldKey: string): string[] => toTextArray((value as Record<string, unknown>)[fieldKey]));
}

function buildChatContextSnapshot(logicalView: LogicalChatView | null, lifecycleState: ChatLifecycleState): ChatContextSnapshot {
    if (!logicalView) {
        return {
            visibleMessageCount: 0,
            invalidatedMessageCount: 0,
            activeMessageIds: [],
            editedRevisionCount: 0,
            deletedTurnCount: 0,
            branchRootCount: 0,
            mutationKinds: Array.isArray(lifecycleState.mutationKinds) ? lifecycleState.mutationKinds : [],
            lastMutationAt: Number(lifecycleState.lastMutationAt ?? 0) || undefined,
            rebuildRecommended: true,
        };
    }
    const invalidatedCount = Array.isArray(logicalView.invalidatedMessageIds) ? logicalView.invalidatedMessageIds.length : 0;
    const mutationKinds = Array.isArray(logicalView.mutationKinds) && logicalView.mutationKinds.length > 0
        ? logicalView.mutationKinds
        : (Array.isArray(lifecycleState.mutationKinds) ? lifecycleState.mutationKinds : []);
    return {
        visibleMessageCount: Array.isArray(logicalView.visibleMessages) ? logicalView.visibleMessages.length : 0,
        invalidatedMessageCount: invalidatedCount,
        activeMessageIds: Array.isArray(logicalView.activeMessageIds) ? logicalView.activeMessageIds : [],
        editedRevisionCount: Array.isArray(logicalView.editedRevisions) ? logicalView.editedRevisions.length : 0,
        deletedTurnCount: Array.isArray(logicalView.deletedTurns) ? logicalView.deletedTurns.length : 0,
        branchRootCount: Array.isArray(logicalView.branchRoots) ? logicalView.branchRoots.length : 0,
        mutationKinds,
        lastMutationAt: Number(lifecycleState.lastMutationAt ?? 0) || Number(logicalView.rebuiltAt ?? 0) || undefined,
        rebuildRecommended: invalidatedCount > 0 || mutationKinds.some((kind: string): boolean => ['message_deleted', 'message_edited', 'chat_branched', 'message_swiped'].includes(kind)),
    };
}

function buildSceneSnapshot(groupMemory: GroupMemoryState | null, logicalView: LogicalChatView | null, summaries: DBSummary[], states: DBWorldState[]): SceneSnapshot {
    const sceneMap = new Map<string, SnapshotValue>();
    const conflictMap = new Map<string, SnapshotValue>();
    const pendingMap = new Map<string, SnapshotValue>();
    const participantMap = new Map<string, SnapshotValue>();
    const sharedScene = groupMemory?.sharedScene;
    if (sharedScene) {
        pushSnapshotValue(sceneMap, { value: sharedScene.currentScene, sourceKind: 'group_memory', updatedAt: sharedScene.updatedAt, sourceRef: makeSourceRef('group_memory', '共享场景', { ts: sharedScene.updatedAt }) });
        pushSnapshotValue(conflictMap, { value: sharedScene.currentConflict, sourceKind: 'group_memory', updatedAt: sharedScene.updatedAt, sourceRef: makeSourceRef('group_memory', '共享冲突', { ts: sharedScene.updatedAt }) });
        for (const item of sharedScene.pendingEvents ?? []) {
            pushSnapshotValue(pendingMap, { value: item, sourceKind: 'group_memory', updatedAt: sharedScene.updatedAt, sourceRef: makeSourceRef('group_memory', '待处理事件', { ts: sharedScene.updatedAt }) });
        }
        for (const actorKey of sharedScene.participantActorKeys ?? []) {
            pushSnapshotValue(participantMap, { value: actorKey, sourceKind: 'group_memory', updatedAt: sharedScene.updatedAt, sourceRef: makeSourceRef('group_memory', '当前参与者', { ts: sharedScene.updatedAt }) });
        }
    }
    for (const state of states) {
        const path = normalizeLookupKey(state.path);
        if (path === '/scene/current' || path === '/scene/currentscene') {
            for (const value of toTextArray(state.value)) {
                pushSnapshotValue(sceneMap, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef: makeSourceRef('world_state', '场景状态', { recordId: state.stateKey, path: state.path, ts: state.updatedAt }) });
            }
        }
        if (path.includes('/scene/conflict')) {
            for (const value of toTextArray(state.value)) {
                pushSnapshotValue(conflictMap, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef: makeSourceRef('world_state', '冲突状态', { recordId: state.stateKey, path: state.path, ts: state.updatedAt }) });
            }
        }
    }
    const latestSceneSummary = summaries.find((summary: DBSummary): boolean => summary.level === 'scene');
    if (latestSceneSummary) {
        pushSnapshotValue(sceneMap, { value: latestSceneSummary.title || latestSceneSummary.content, sourceKind: 'summary', updatedAt: latestSceneSummary.createdAt, sourceRef: makeSourceRef('summary', '场景摘要', { recordId: latestSceneSummary.summaryId, ts: latestSceneSummary.createdAt }) });
    }
    if (logicalView?.visibleAssistantTurns?.length) {
        pushSnapshotValue(pendingMap, { value: `可见消息 ${logicalView.visibleMessages.length} 条`, sourceKind: 'derived', updatedAt: logicalView.rebuiltAt, sourceRef: makeSourceRef('derived', '逻辑消息视图', { ts: logicalView.rebuiltAt }) });
    }
    return {
        currentScene: finalizeSnapshotValues(sceneMap)[0] ?? null,
        currentConflict: finalizeSnapshotValues(conflictMap)[0] ?? null,
        pendingEvents: finalizeSnapshotValues(pendingMap),
        participants: finalizeSnapshotValues(participantMap),
    };
}

function buildCharacterSnapshots(semanticSeed: ChatSemanticSeed | null, groupMemory: GroupMemoryState | null, relationshipState: RelationshipState[], facts: DBFact[], states: DBWorldState[]): CharacterSnapshot[] {
    const actorKeys = new Set<string>();
    const semanticRoleKey = normalizeText(semanticSeed?.identitySeed?.roleKey);
    if (semanticRoleKey) {
        actorKeys.add(semanticRoleKey);
    }
    for (const lane of groupMemory?.lanes ?? []) {
        if (normalizeText(lane.actorKey)) actorKeys.add(normalizeText(lane.actorKey));
    }
    for (const fact of facts) {
        if (normalizeLookupKey(fact.entity?.kind) === 'character' && normalizeText(fact.entity?.id)) {
            actorKeys.add(normalizeText(fact.entity?.id));
        }
    }

    const snapshots: CharacterSnapshot[] = [];
    for (const actorKey of actorKeys) {
        const aliases = new Map<string, SnapshotValue>();
        const identities = new Map<string, SnapshotValue>();
        const anchors = new Map<string, SnapshotValue>();
        const locations = new Map<string, SnapshotValue>();
        const lane = (groupMemory?.lanes ?? []).find((item) => matchActorKey(actorKey, item.actorKey));
        const matchedFacts = facts.filter((fact: DBFact): boolean => matchActorKey(actorKey, fact.entity?.id ?? ''));
        const matchedRelationships = relationshipState.filter((item: RelationshipState): boolean => matchActorKey(actorKey, item.targetKey) || (Array.isArray(item.participantKeys) && item.participantKeys.some((participant: string): boolean => matchActorKey(actorKey, participant))));
        const matchedStates = states.filter((state: DBWorldState): boolean => normalizeLookupKey(state.path).includes(normalizeLookupKey(actorKey)) && normalizeLookupKey(state.path).includes('location'));
        const isPrimary = semanticRoleKey && matchActorKey(actorKey, semanticRoleKey);

        if (isPrimary) {
            for (const value of semanticSeed?.identitySeed.aliases ?? []) {
                pushSnapshotValue(aliases, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '角色别名') });
            }
            for (const value of semanticSeed?.identitySeed.identity ?? []) {
                pushSnapshotValue(identities, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '角色身份') });
            }
            for (const value of semanticSeed?.identitySeed.relationshipAnchors ?? []) {
                pushSnapshotValue(anchors, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '关系锚点') });
            }
        }

        if (lane) {
            pushSnapshotValue(anchors, { value: lane.relationshipDelta, sourceKind: 'group_memory', updatedAt: lane.lastActiveAt, sourceRef: makeSourceRef('group_memory', '最近关系变化', { ts: lane.lastActiveAt }) });
        }
        for (const item of matchedRelationships) {
            pushSnapshotValue(anchors, { value: item.summary, sourceKind: 'group_memory', updatedAt: item.updatedAt, sourceRef: makeSourceRef('group_memory', '关系状态', { ts: item.updatedAt, note: item.relationshipKey }) });
        }
        for (const fact of matchedFacts) {
            const sourceKind: EditorSourceKind = normalizeLookupKey(fact.provenance?.extractor) === 'manual' ? 'manual' : 'fact';
            const sourceRef = makeSourceRef(sourceKind, fact.type || '事实', { recordId: fact.factKey, path: fact.path, ts: fact.updatedAt });
            for (const value of readFactValueField(fact, ['aliases', 'alias', 'aka'])) {
                pushSnapshotValue(aliases, { value, sourceKind, confidence: fact.confidence, updatedAt: fact.updatedAt, sourceRef });
            }
            for (const value of readFactValueField(fact, ['identity', 'identities', 'summary', 'roleSummary', 'displayName', 'name'])) {
                pushSnapshotValue(identities, { value, sourceKind, confidence: fact.confidence, updatedAt: fact.updatedAt, sourceRef });
            }
            for (const value of readFactValueField(fact, ['relationshipAnchors', 'relationship', 'relations'])) {
                pushSnapshotValue(anchors, { value, sourceKind, confidence: fact.confidence, updatedAt: fact.updatedAt, sourceRef });
            }
            if (normalizeLookupKey(fact.path).includes('location') || normalizeLookupKey(fact.type).includes('location')) {
                for (const value of toTextArray(fact.value)) {
                    pushSnapshotValue(locations, { value, sourceKind, confidence: fact.confidence, updatedAt: fact.updatedAt, sourceRef });
                }
            }
        }
        for (const state of matchedStates) {
            for (const value of toTextArray(state.value)) {
                pushSnapshotValue(locations, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef: makeSourceRef('world_state', '角色地点状态', { recordId: state.stateKey, path: state.path, ts: state.updatedAt }) });
            }
        }

        const displayName = normalizeText(
            lane?.displayName
            || (isPrimary ? semanticSeed?.identitySeed.displayName : '')
            || readFactValueField(matchedFacts[0] ?? {} as DBFact, ['displayName', 'name'])[0]
            || actorKey,
        ) || '待确认角色';

        snapshots.push({
            actorKey,
            displayName,
            aliases: finalizeSnapshotValues(aliases),
            identities: finalizeSnapshotValues(identities),
            relationshipAnchors: finalizeSnapshotValues(anchors),
            currentLocation: finalizeSnapshotValues(locations, false)[0],
            lastActiveAt: Number(lane?.lastActiveAt ?? 0) || undefined,
            sourceRefs: lane ? [makeSourceRef('group_memory', '角色记忆分支', { note: lane.actorKey, ts: lane.lastActiveAt })] : undefined,
        });
    }

    return mergeCharacterSnapshotsByDisplayName(snapshots)
        .sort((left: CharacterSnapshot, right: CharacterSnapshot): number => Number(right.lastActiveAt ?? 0) - Number(left.lastActiveAt ?? 0));
}

function buildWorldSnapshot(template: WorldTemplate | null, semanticSeed: ChatSemanticSeed | null, groupMemory: GroupMemoryState | null, states: DBWorldState[], characterLocations: SnapshotValue[]): CanonSnapshot['world'] {
    const locations = new Map<string, SnapshotValue>();
    const rules = new Map<string, SnapshotValue>();
    const hardConstraints = new Map<string, SnapshotValue>();
    const lorebooks = new Map<string, SnapshotValue>();
    const groupMembers = new Map<string, SnapshotValue>();
    const overview = new Map<string, SnapshotValue>();

    for (const state of states) {
        const path = normalizeLookupKey(state.path);
        const sourceRef = makeSourceRef('world_state', path || '世界状态', { recordId: state.stateKey, path: state.path, ts: state.updatedAt });
        if (path === '/semantic/world/locations') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(locations, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
        if (path === '/semantic/world/rules') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(rules, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
        if (path === '/semantic/world/hardconstraints') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(hardConstraints, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
        if (path === '/semantic/world/overview') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(overview, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
        if (path === '/semantic/meta/activelorebooks') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(lorebooks, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
        if (path === '/semantic/meta/groupmembers') {
            for (const value of toTextArray(state.value)) pushSnapshotValue(groupMembers, { value, sourceKind: 'world_state', updatedAt: state.updatedAt, sourceRef });
        }
    }

    for (const value of semanticSeed?.worldSeed.locations ?? []) pushSnapshotValue(locations, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '世界语义种子') });
    for (const value of semanticSeed?.worldSeed.rules ?? []) pushSnapshotValue(rules, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '规则语义种子') });
    for (const value of semanticSeed?.worldSeed.hardConstraints ?? []) pushSnapshotValue(hardConstraints, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '硬约束语义种子') });
    for (const value of semanticSeed?.activeLorebooks ?? []) pushSnapshotValue(lorebooks, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '已激活世界书') });
    for (const value of semanticSeed?.groupMembers ?? []) pushSnapshotValue(groupMembers, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', '群组成员语义种子') });
    for (const value of toTextArray(semanticSeed?.aiSummary?.worldSummary)) pushSnapshotValue(overview, { value, sourceKind: 'semantic_seed', sourceRef: makeSourceRef('semantic_seed', 'AI 世界总结') });
    for (const value of groupMemory?.bindingSnapshot?.memberNames ?? []) pushSnapshotValue(groupMembers, { value, sourceKind: 'group_memory', updatedAt: groupMemory?.updatedAt, sourceRef: makeSourceRef('group_memory', '群聊绑定成员', { ts: groupMemory?.updatedAt }) });

    return {
        templateId: normalizeText(template?.templateId) || null,
        currentLocation: characterLocations[0] || finalizeSnapshotValues(locations)[0] || null,
        overview: finalizeSnapshotValues(overview)[0] ?? null,
        locations: finalizeSnapshotValues(locations),
        rules: finalizeSnapshotValues(rules),
        hardConstraints: finalizeSnapshotValues(hardConstraints),
        activeLorebooks: finalizeSnapshotValues(lorebooks),
        groupMembers: finalizeSnapshotValues(groupMembers),
    };
}

function buildHealthIssues(maintenanceInsights: MaintenanceInsight[], logicalView: LogicalChatView | null, semanticSeed: ChatSemanticSeed | null): EditorHealthIssue[] {
    const issues = maintenanceInsights.map((item: MaintenanceInsight): EditorHealthIssue => ({
        id: item.id,
        severity: item.severity,
        label: item.shortLabel || item.title,
        detail: item.detail,
        actionLabel: item.actionLabel,
    }));
    if (!semanticSeed) {
        issues.unshift({ id: 'seed-missing', severity: 'warning', label: '语义种子缺失', detail: '当前聊天还没有稳定的 semantic seed，总览会退回到 facts 和 world_state。', actionLabel: '刷新种子' });
    }
    if (!logicalView) {
        issues.unshift({ id: 'logical-view-missing', severity: 'warning', label: '逻辑视图缺失', detail: '当前聊天还没有可用的 logical chat view，聊天上下文和场景聚合会不完整。', actionLabel: '重建 chat view' });
    }
    return issues;
}

function buildSuggestedActions(logicalView: LogicalChatView | null, semanticSeed: ChatSemanticSeed | null, orphanFactsCount: number, hasDraftRevision: boolean): EditorHealthSnapshot['suggestedActions'] {
    const actions: EditorHealthSnapshot['suggestedActions'] = [];
    if (!logicalView || (logicalView.invalidatedMessageIds?.length ?? 0) > 0) actions.push('rebuild_chat_view');
    if (!semanticSeed) actions.push('refresh_seed');
    if (orphanFactsCount > 0 || hasDraftRevision) actions.push('normalize_rows');
    if (!actions.includes('review_candidates') && (orphanFactsCount > 0 || (logicalView?.branchRoots?.length ?? 0) > 0)) actions.push('review_candidates');
    return actions;
}

function buildDataLayerSnapshot(template: WorldTemplate | null, semanticSeed: ChatSemanticSeed | null, groupMemory: GroupMemoryState | null, logicalView: LogicalChatView | null, facts: DBFact[], states: DBWorldState[], summaries: DBSummary[], events: DBEvent[], rowAliasIndex: Record<string, Record<string, string>>, rowRedirects: Record<string, Record<string, string>>, rowTombstones: Record<string, Record<string, unknown>>, hasDraftRevision: boolean): EditorDataLayerSnapshot {
    return {
        factsCount: facts.length,
        worldStateCount: states.length,
        summaryCount: summaries.length,
        eventCount: events.length,
        aliasCount: sumRecordMapEntries(rowAliasIndex),
        activeTemplateId: normalizeText(template?.templateId) || null,
        hasSemanticSeed: Boolean(semanticSeed),
        hasLogicalChatView: Boolean(logicalView),
        hasGroupMemory: Boolean(groupMemory),
        hasDraftRevision,
        redirectCount: sumRecordMapEntries(rowRedirects),
        tombstoneCount: sumRecordMapEntries(rowTombstones),
    };
}

function buildEditorHealthSnapshot(context: EditorContextBundle, characters: CharacterSnapshot[]): EditorHealthSnapshot {
    const orphanFactsCount = Math.max(0, Math.round(Number(context.adaptiveMetrics.orphanFactsRatio ?? 0) * context.facts.length));
    const hasDraftRevision = Boolean(context.schemaDraftSession?.draftRevisionId);
    const issues = buildHealthIssues(context.maintenanceInsights, context.logicalView, context.semanticSeed);
    const characterDuplicateRisk = characters.length > 1 ? Math.max(0, characters.length - new Set(characters.map((item: CharacterSnapshot): string => normalizeLookupKey(item.displayName))).size) / characters.length : 0;
    return {
        orphanFactsCount,
        duplicateEntityRisk: Math.max(Number(context.adaptiveMetrics.duplicateRate ?? 0), characterDuplicateRisk),
        hasDraftRevision,
        maintenanceLabels: uniqueStrings(issues.map((item: EditorHealthIssue): string => item.label)).slice(0, 8),
        suggestedActions: buildSuggestedActions(context.logicalView, context.semanticSeed, orphanFactsCount, hasDraftRevision),
        issues,
        dataLayers: buildDataLayerSnapshot(context.template, context.semanticSeed, context.groupMemory, context.logicalView, context.facts, context.states, context.summaries, context.events, context.rowAliasIndex, context.rowRedirects, context.rowTombstones, hasDraftRevision),
    };
}

export class MemoryEditorFacade {
    private chatKey: string;
    private templateManager: TemplateManager;
    private chatStateManager: ChatStateManager;
    private vectorMemoryViewer: VectorMemoryViewerFacade;

    constructor(chatKey: string, templateManager: TemplateManager, chatStateManager: ChatStateManager) {
        this.chatKey = chatKey;
        this.templateManager = templateManager;
        this.chatStateManager = chatStateManager;
        this.vectorMemoryViewer = new VectorMemoryViewerFacade(chatKey, chatStateManager);
    }

    async getCanonSnapshot(): Promise<CanonSnapshot> {
        const context = await this.loadContextBundle();
        return this.buildCanonSnapshotFromContext(context);
    }

    async getExperienceSnapshot(): Promise<EditorExperienceSnapshot> {
        const context = await this.loadContextBundle();
        const canon = this.buildCanonSnapshotFromContext(context);
        const [
            profile,
            quality,
            retention,
            summarySettings,
            summarySettingsOverride,
            effectiveSummarySettings,
            simplePersona,
            lorebookDecision,
            preDecision,
            postDecision,
            processingDecision,
            longSummaryCooldown,
            lifecycleSummary,
            recallLog,
            latestRecallExplanation,
            mainlineTraceSnapshot,
            tuningProfile,
            activeActorKey,
            chatState,
            mutationHistory,
        ] = await Promise.all([
            this.chatStateManager.getChatProfile(),
            this.chatStateManager.getMemoryQuality(),
            this.chatStateManager.getRetentionPolicy(),
            this.chatStateManager.getGlobalSummarySettings(),
            this.chatStateManager.getChatSummarySettingsOverride(),
            this.chatStateManager.getEffectiveSummarySettings(),
            this.chatStateManager.getSimpleMemoryPersona(),
            this.chatStateManager.getLorebookDecision(),
            this.chatStateManager.getLastPreGenerationDecision(),
            this.chatStateManager.getLastPostGenerationDecision(),
            this.chatStateManager.getLastProcessingDecision(),
            this.chatStateManager.getLongSummaryCooldown(),
            this.chatStateManager.getMemoryLifecycleSummary(),
            this.chatStateManager.getRecallLog(),
            this.chatStateManager.getLatestRecallExplanation(),
            this.chatStateManager.getMainlineTraceSnapshot(),
            this.chatStateManager.getMemoryTuningProfile(),
            this.chatStateManager.getActiveActorKey(),
            this.chatStateManager.load(),
            this.chatStateManager.getMutationHistory({ limit: 24 }),
        ]);

        return {
            chatKey: this.chatKey,
            canon,
            profile,
            quality,
            lifecycle: context.lifecycleState,
            activeActorKey,
            retention,
            semanticSeed: context.semanticSeed,
            simplePersona,
            groupMemory: context.groupMemory,
            relationshipState: context.relationshipState,
            logicalView: context.logicalView,
            lorebookDecision,
            preDecision,
            postDecision,
            processingDecision,
            longSummaryCooldown,
            summarySettings,
            summarySettingsOverride,
            effectiveSummarySettings,
            summarySettingsSource: effectiveSummarySettings.source,
            lifecycleSummary,
            recallLog,
            latestRecallExplanation,
            mainlineTraceSnapshot,
            tuningProfile,
            lastMutationPlan: chatState.lastMutationPlan ?? null,
            maintenanceInsights: context.maintenanceInsights,
            mutationHistory,
            facts: context.facts.slice(0, 36),
            summaries: context.summaries.slice(0, 18),
            events: context.events.slice(0, 18),
            states: context.states
                .slice()
                .sort((left: DBWorldState, right: DBWorldState): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))
                .slice(0, 18),
            vectorIndexVersion: String(chatState.vectorIndexVersion ?? '').trim() || null,
            vectorMetadataRebuiltAt: Number(chatState.vectorMetadataRebuiltAt ?? 0) || null,
        };
    }

    /**
     * 功能：读取当前聊天的向量记忆查看器快照。
     * @returns 向量记忆查看器快照。
     */
    async getMemoryCardSnapshot(): Promise<MemoryCardViewerSnapshot> {
        return this.vectorMemoryViewer.getMemoryCardSnapshot();
    }

    /**
     * 功能：读取当前聊天的向量记忆查看器快照。
     * 返回：
     *   Promise<VectorMemoryViewerSnapshot>：向量记忆查看器快照。
     */
    /**
     * 功能：模拟一次向量检索测试，返回命中顺序与最终入选情况。
     * @param query 测试语句。
     * @param opts 额外配置。
     * @returns 检索测试结果。
     */
    async runMemoryRecallPreview(query: string, opts?: { maxTokens?: number; forceVector?: boolean }): Promise<MemoryRecallPreviewResult> {
        return this.vectorMemoryViewer.runMemoryRecallPreview(query, opts);
    }

    /**
     * 功能：模拟一次向量检索测试并返回结果。
     * 参数：
     *   query (string)：测试语句。
     *   opts ({ maxTokens?: number })：附加配置。
     * 返回：
     *   Promise<VectorMemorySearchTestResult>：检索测试结果。
     */
    private buildCanonSnapshotFromContext(context: EditorContextBundle): CanonSnapshot {
        const characters = buildCharacterSnapshots(context.semanticSeed, context.groupMemory, context.relationshipState, context.facts, context.states);
        const characterLocations = characters.map((item: CharacterSnapshot): SnapshotValue | undefined => item.currentLocation).filter((item: SnapshotValue | undefined): item is SnapshotValue => Boolean(item));
        return {
            chatKey: this.chatKey,
            generatedAt: Date.now(),
            world: buildWorldSnapshot(context.template, context.semanticSeed, context.groupMemory, context.states, characterLocations),
            characters,
            scene: buildSceneSnapshot(context.groupMemory, context.logicalView, context.summaries, context.states),
            chat: buildChatContextSnapshot(context.logicalView, context.lifecycleState),
            health: buildEditorHealthSnapshot(context, characters),
        };
    }

    async getEditorHealth(): Promise<EditorHealthSnapshot> {
        const context = await this.loadContextBundle();
        const characters = buildCharacterSnapshots(context.semanticSeed, context.groupMemory, context.relationshipState, context.facts, context.states);
        return buildEditorHealthSnapshot(context, characters);
    }

    private async loadContextBundle(): Promise<EditorContextBundle> {
        const [activeTemplate, templates, adaptiveMetrics, lifecycleState, semanticSeed, groupMemory, logicalView, maintenanceInsights, relationshipState, facts, summaries, events, states, schemaDraftSession, rowAliasIndex, rowRedirects, rowTombstones] = await Promise.all([
            this.templateManager.getActiveTemplate(),
            this.templateManager.listByChatKey(),
            this.chatStateManager.getAdaptiveMetrics(),
            this.chatStateManager.getLifecycleState(),
            this.chatStateManager.getSemanticSeed(),
            this.chatStateManager.getGroupMemory(),
            this.chatStateManager.getLogicalChatView(),
            this.chatStateManager.getMaintenanceInsights(),
            this.chatStateManager.getRelationshipState(),
            this.queryFacts(),
            this.querySummaries(),
            this.queryEvents(),
            this.queryStates(),
            this.chatStateManager.getSchemaDraftSession(),
            this.chatStateManager.getRowAliasIndex(),
            this.chatStateManager.getRowRedirects(),
            this.chatStateManager.getRowTombstones(),
        ]);

        return {
            template: activeTemplate ?? templates[templates.length - 1] ?? null,
            adaptiveMetrics,
            lifecycleState,
            semanticSeed,
            groupMemory,
            logicalView,
            maintenanceInsights,
            relationshipState,
            facts,
            summaries,
            events,
            states,
            schemaDraftSession,
            rowAliasIndex,
            rowRedirects,
            rowTombstones,
        };
    }

    private async queryFacts(): Promise<DBFact[]> {
        return db.facts.where('[chatKey+updatedAt]').between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER]).reverse().toArray();
    }

    private async querySummaries(): Promise<DBSummary[]> {
        return db.summaries.where('[chatKey+level+createdAt]').between([this.chatKey, '', 0], [this.chatKey, '\uffff', Number.MAX_SAFE_INTEGER]).reverse().toArray();
    }

    private async queryEvents(): Promise<DBEvent[]> {
        return db.events.where('[chatKey+ts]').between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER]).reverse().toArray();
    }

    private async queryStates(): Promise<DBWorldState[]> {
        return db.world_state.where('[chatKey+path]').between([this.chatKey, ''], [this.chatKey, '\uffff']).toArray();
    }
}
