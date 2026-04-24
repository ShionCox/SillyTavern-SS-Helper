import type {
    MemoryTakeoverActorCardCandidate,
    MemoryTakeoverBatch,
    MemoryTakeoverBatchResult,
    MemoryTakeoverBindings,
    MemoryTakeoverEntityCardCandidate,
    MemoryTakeoverEntityTransition,
    MemoryTakeoverRelationshipCard,
    MemoryTakeoverRange,
    MemoryTakeoverFloorManifestRecord,
    MemoryTakeoverRelationTransition,
    MemoryTakeoverStableFact,
    MemoryTakeoverTaskTransition,
    MemoryTakeoverWorldStateChange,
    TakeoverSourceSegment,
} from '../types';
import type { MemoryLLMApi } from '../memory-summary';
import { normalizeRelationTag } from '../constants/relationTags';
import { runTakeoverStructuredTask } from './takeover-llm';
import type { MemoryTakeoverMessageSlice } from './takeover-source';
import { filterMemoryMessages, getMemoryFilterSettings, type MemoryFilterFloorRecord } from '../memory-filter';
import { runTakeoverRepairService } from './takeover-repair-service';
import { logger } from '../runtime/runtime-services';
import { resolveCurrentNarrativeUserName } from '../utils/narrative-user-name';
import {
    COMPARE_KEY_SCHEMA_VERSION,
    buildCompareKey,
    buildEventCompareKey,
    buildMatchKeys,
    buildTaskCompareKey,
    buildWorldStateCompareKey,
} from '../core/compare-key';
import { assessBatchTime } from '../memory-time/batch-time-assessment';
import { enhanceMemoryTimeContextWithText, mapBatchToMemoryTimeContext } from '../memory-time/fallback-time-engine';
import type { MemoryTimeContext } from '../memory-time/time-types';
import { buildTimeMetaByEntryType } from '../memory-time/time-context';
import { logTimeDebug } from '../memory-time/time-debug';
import { applyWorldProfileFieldPolicy, type WorldProfileFieldPolicy } from '../services/world-profile-field-policy';

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
 * 功能：定义批次送模组装结果。
 */
export interface MemoryTakeoverBatchPromptAssembly {
    floorRecords: MemoryFilterFloorRecord[];
    channels: {
        memoryText: string;
        contextText: string;
        excludedText: string;
        floorManifest: MemoryTakeoverFloorManifestRecord[];
    };
    extractionMessages: MemoryTakeoverMessageSlice[];
    sourceSegments: TakeoverSourceSegment[];
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

function toTakeoverFloorManifest(records: MemoryFilterFloorRecord[]): MemoryTakeoverFloorManifestRecord[] {
    return records.map((record): MemoryTakeoverFloorManifestRecord => ({
        floor: record.floor,
        sourceFloor: record.floor,
        originalText: record.originalText,
        originalRole: record.role,
        includedInBatch: true,
        blocks: record.blocks.map((block) => ({
            blockId: block.id,
            title: block.title,
            rawText: block.rawText,
            startOffset: block.startOffset,
            endOffset: block.endOffset,
            channel: block.channel,
            reasonCodes: [...block.reasonCodes],
        })),
        hasMemoryContent: record.hasMemoryContent,
        hasContextOnly: record.hasContextOnly,
        hasExcludedOnly: record.hasExcludedOnly,
    }));
}

/**
 * 功能：按正式批处理规则组装送模输入。
 * @param input 组装输入。
 * @returns 送模组装结果。
 */
export async function assembleTakeoverBatchPromptAssembly(input: {
    llm: MemoryLLMApi | null;
    pluginId: string;
    messages: MemoryTakeoverMessageSlice[];
}): Promise<MemoryTakeoverBatchPromptAssembly> {
    void input.llm;
    void input.pluginId;
    const prepared = filterMemoryMessages(input.messages, getMemoryFilterSettings(), { scope: 'takeover' });
    const floorRecords = prepared.enabled
        ? prepared.records
        : input.messages.map((message): MemoryFilterFloorRecord => ({
            floor: message.floor,
            role: message.role === 'user' || message.role === 'assistant' || message.role === 'system' ? message.role : 'unknown',
            originalText: String(message.content ?? ''),
            blocks: String(message.content ?? '').trim() ? [{
                id: `raw_${message.floor}`,
                floor: message.floor,
                title: '原始楼层',
                rawText: String(message.content ?? ''),
                channel: 'memory',
                startOffset: 0,
                endOffset: String(message.content ?? '').length,
                reasonCodes: ['memory_filter_disabled'],
            }] : [],
            hasMemoryContent: Boolean(String(message.content ?? '').trim()),
            hasContextOnly: false,
            hasExcludedOnly: false,
        }));
    const channels = {
        memoryText: prepared.messagesForMemory.map((message) => String(message.content ?? '').trim()).filter(Boolean).join('\n\n'),
        contextText: prepared.contextText,
        excludedText: prepared.excludedText,
        floorManifest: toTakeoverFloorManifest(floorRecords),
    };
    const messageNameMap = new Map(
        input.messages.map((message: MemoryTakeoverMessageSlice): [number, string] => [message.floor, message.name ?? '']),
    );
    const extractionMessages: MemoryTakeoverMessageSlice[] = floorRecords
        .filter((floor): boolean => floor.hasMemoryContent)
        .map((floor) => ({
            floor: floor.floor,
            sourceFloor: floor.floor,
            role: floor.role === 'tool' || floor.role === 'unknown' ? 'assistant' : floor.role,
            name: messageNameMap.get(floor.floor) ?? '',
            content: floor.blocks
                .filter((block) => block.channel === 'memory')
                .map((block) => block.rawText)
                .join('\n\n'),
        }));
    const sourceSegments = floorRecords.flatMap((floor) =>
        floor.blocks
            .filter((block) => block.channel === 'memory' || block.channel === 'context')
            .map((block) => ({
                kind: block.channel === 'memory' ? 'story_narrative' as const : 'meta_analysis' as const,
                text: block.rawText,
                sourceFloor: floor.floor,
                confidence: block.channel === 'memory' ? 0.95 : 0.5,
            })),
    );
    return {
        floorRecords,
        channels,
        extractionMessages,
        sourceSegments,
    };
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
 * 功能：构建空的绑定关系载荷。
 * @returns 空绑定对象。
 */
function createEmptyBindings(): MemoryTakeoverBindings {
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
 * 功能：归一化旧聊天结构化输出中的绑定关系。
 * @param value 原始绑定值。
 * @returns 归一化后的绑定对象。
 */
function normalizeBindings(value: unknown): MemoryTakeoverBindings {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    const empty = createEmptyBindings();
    return {
        actors: normalizeStringList(Array.isArray(source.actors) ? source.actors.map((item) => String(item ?? '')) : empty.actors, 12),
        organizations: normalizeStringList(Array.isArray(source.organizations) ? source.organizations.map((item) => String(item ?? '')) : empty.organizations, 12),
        cities: normalizeStringList(Array.isArray(source.cities) ? source.cities.map((item) => String(item ?? '')) : empty.cities, 12),
        locations: normalizeStringList(Array.isArray(source.locations) ? source.locations.map((item) => String(item ?? '')) : empty.locations, 12),
        nations: normalizeStringList(Array.isArray(source.nations) ? source.nations.map((item) => String(item ?? '')) : empty.nations, 12),
        tasks: normalizeStringList(Array.isArray(source.tasks) ? source.tasks.map((item) => String(item ?? '')) : empty.tasks, 12),
        events: normalizeStringList(Array.isArray(source.events) ? source.events.map((item) => String(item ?? '')) : empty.events, 12),
    };
}

/**
 * 功能：归一化任务状态变更列表，补齐稳定标题、摘要和绑定信息。
 * @param transitions 原始任务变更列表。
 * @returns 归一化后的任务变更列表。
 */
export function normalizeTaskTransitions(transitions: MemoryTakeoverTaskTransition[]): MemoryTakeoverTaskTransition[] {
    const result: MemoryTakeoverTaskTransition[] = [];
    const seen = new Set<string>();
    for (const transition of transitions) {
        const task = String(transition.task ?? '').trim();
        if (!task) {
            continue;
        }
        const title = String(transition.title ?? '').trim() || task;
        const compareKey = String(transition.compareKey ?? '').trim() || buildTaskCompareKey(title);
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        const status = String(transition.status ?? transition.to ?? '').trim();
        result.push({
            task,
            from: String(transition.from ?? '').trim(),
            to: String(transition.to ?? '').trim(),
            title,
            summary: String(transition.summary ?? '').trim(),
            description: String(transition.description ?? '').trim(),
            goal: String(transition.goal ?? '').trim(),
            status,
            entityKey: String(transition.entityKey ?? '').trim() || `entity:task:${normalizeId(title)}`,
            compareKey,
            matchKeys: normalizeStringList(transition.matchKeys ?? buildMatchKeys('task', title, undefined, [task]), 12),
            schemaVersion: String(transition.schemaVersion ?? '').trim() || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName: String(transition.canonicalName ?? '').trim() || title,
            bindings: normalizeBindings(transition.bindings),
            reasonCodes: normalizeStringList(transition.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：归一化世界状态变更列表，补齐摘要和 compareKey。
 * @param changes 原始世界状态变更列表。
 * @returns 归一化后的世界状态变更列表。
 */
export function normalizeWorldStateChanges(changes: MemoryTakeoverWorldStateChange[]): MemoryTakeoverWorldStateChange[] {
    const result: MemoryTakeoverWorldStateChange[] = [];
    const seen = new Set<string>();
    for (const change of changes) {
        const key = String(change.key ?? '').trim();
        if (!key) {
            continue;
        }
        const compareKey = String(change.compareKey ?? '').trim() || buildWorldStateCompareKey(key);
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        const value = String(change.value ?? '').trim();
        result.push({
            key,
            value,
            entityKey: String(change.entityKey ?? '').trim() || `entity:world_state:${normalizeId(key)}`,
            summary: String(change.summary ?? '').trim() || `${key}：${value}`,
            compareKey,
            matchKeys: normalizeStringList(change.matchKeys ?? buildMatchKeys('world_global_state', key, undefined, ['global']), 12),
            schemaVersion: String(change.schemaVersion ?? '').trim() || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName: String(change.canonicalName ?? '').trim() || key,
            bindings: normalizeBindings(change.bindings),
            reasonCodes: normalizeStringList(change.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：归一化稳定事实列表，补齐 compareKey、标题与绑定信息。
 * @param facts 原始稳定事实列表。
 * @returns 归一化后的稳定事实列表。
 */
export function normalizeStableFacts(facts: MemoryTakeoverStableFact[]): MemoryTakeoverStableFact[] {
    const result: MemoryTakeoverStableFact[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        const type = String(fact.type ?? '').trim().toLowerCase();
        const subject = String(fact.subject ?? '').trim();
        const predicate = String(fact.predicate ?? '').trim();
        const value = String(fact.value ?? '').trim();
        if (!type || !subject || !predicate || !value) {
            continue;
        }
        const compareKey = String(fact.compareKey ?? '').trim() || resolveStableFactCompareKey(type, fact);
        const factKey = `${type}::${subject}::${predicate}::${value}`;
        if (seen.has(factKey)) {
            continue;
        }
        seen.add(factKey);
        result.push({
            type,
            subject,
            predicate,
            value,
            confidence: clamp01(Number(fact.confidence)),
            entityKey: String(fact.entityKey ?? '').trim() || `entity:${type}:${normalizeId(fact.title ?? subject)}`,
            title: String(fact.title ?? '').trim() || undefined,
            summary: String(fact.summary ?? '').trim() || undefined,
            compareKey,
            matchKeys: normalizeStringList(fact.matchKeys ?? buildMatchKeys(type === 'world' ? 'world_global_state' : type, String(fact.title ?? subject ?? ''), undefined, [subject]), 12),
            schemaVersion: String(fact.schemaVersion ?? '').trim() || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName: String(fact.canonicalName ?? '').trim() || String(fact.title ?? subject ?? '').trim() || undefined,
            legacyCompareKeys: normalizeStringList(fact.legacyCompareKeys ?? [], 8),
            bindings: normalizeBindings(fact.bindings),
            status: String(fact.status ?? '').trim() || undefined,
            importance: Number.isFinite(Number(fact.importance)) ? clamp01(Number(fact.importance)) : undefined,
            reasonCodes: normalizeStringList(fact.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：归一化关系变化列表，补齐绑定与原因码。
 * @param transitions 原始关系变化列表。
 * @returns 归一化后的关系变化列表。
 */
export function normalizeRelationTransitions(transitions: MemoryTakeoverRelationTransition[]): MemoryTakeoverRelationTransition[] {
    const result: MemoryTakeoverRelationTransition[] = [];
    const seen = new Set<string>();
    for (const transition of transitions) {
        const target = String(transition.target ?? '').trim();
        const from = String(transition.from ?? '').trim();
        const to = String(transition.to ?? '').trim();
        const reason = String(transition.reason ?? '').trim();
        if (!target || !to || !reason) {
            continue;
        }
        const uniqueKey = `${String(transition.targetType ?? 'unknown').trim()}::${target}::${from}::${to}`;
        if (seen.has(uniqueKey)) {
            continue;
        }
        seen.add(uniqueKey);
        result.push({
            target,
            from,
            to,
            reason,
            relationTag: normalizeRelationTag(transition.relationTag),
            targetType: normalizeRelationTargetType(transition.targetType),
            bindings: normalizeBindings(transition.bindings),
            reasonCodes: normalizeStringList(transition.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：归一化关系目标类型。
 * @param value 原始目标类型。
 * @returns 合法目标类型。
 */
function normalizeRelationTargetType(
    value: MemoryTakeoverRelationTransition['targetType'],
): MemoryTakeoverRelationTransition['targetType'] {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'actor' || normalized === 'organization' || normalized === 'city' || normalized === 'nation' || normalized === 'location') {
        return normalized;
    }
    return 'unknown';
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
 * 功能：归一化角色引用列表，并优先保留高质量正式显示名。
 * @param values 原始角色引用列表。
 * @param limit 最多保留数量。
 * @returns 去重后的角色引用列表。
 */
function normalizeActorRefs(
    values: Array<{ actorKey: string; displayName: string }>,
    limit: number,
): Array<{ actorKey: string; displayName: string }> {
    const actorMap = new Map<string, { actorKey: string; displayName: string }>();
    for (const value of values) {
        const actorKey = String(value.actorKey ?? '').trim();
        const displayName = String(value.displayName ?? '').trim();
        if (!actorKey || !displayName) {
            continue;
        }
        const existing = actorMap.get(actorKey);
        actorMap.set(actorKey, {
            actorKey,
            displayName: choosePreferredActorRefDisplayName(actorKey, existing?.displayName, displayName),
        });
        if (actorMap.size >= limit && !existing) {
            break;
        }
    }
    return [...actorMap.values()].slice(0, limit);
}

/**
 * 功能：为后续批次提示选择更好的角色显示名。
 * @param actorKey 角色键。
 * @param currentDisplayName 当前显示名。
 * @param nextDisplayName 新显示名。
 * @returns 选择后的显示名。
 */
function choosePreferredActorRefDisplayName(actorKey: string, currentDisplayName: string | undefined, nextDisplayName: string): string {
    const current = String(currentDisplayName ?? '').trim();
    const next = String(nextDisplayName ?? '').trim();
    if (!current) {
        return next;
    }
    if (!next) {
        return current;
    }
    const currentIsFallbackLike = isFallbackLikeActorRefDisplayName(actorKey, current);
    const nextIsFallbackLike = isFallbackLikeActorRefDisplayName(actorKey, next);
    if (currentIsFallbackLike && !nextIsFallbackLike) {
        return next;
    }
    if (!currentIsFallbackLike && nextIsFallbackLike) {
        return current;
    }
    return current;
}

/**
 * 功能：判断角色提示名是否只是由 actorKey 派生的低质量兜底名。
 * @param actorKey 角色键。
 * @param displayName 显示名。
 * @returns 是否为低质量显示名。
 */
function isFallbackLikeActorRefDisplayName(actorKey: string, displayName: string): boolean {
    const normalizedDisplayName = String(displayName ?? '').trim();
    if (!normalizedDisplayName) {
        return true;
    }
    if (normalizedDisplayName.toLowerCase() === String(actorKey ?? '').trim().toLowerCase()) {
        return true;
    }
    return simplifyActorRefDisplayName(normalizedDisplayName) === simplifyActorRefDisplayName(resolveActorRefFallbackDisplayName(actorKey));
}

/**
 * 功能：生成角色引用的兜底显示名。
 * @param actorKey 角色键。
 * @returns 兜底显示名。
 */
function resolveActorRefFallbackDisplayName(actorKey: string): string {
    return String(actorKey ?? '')
        .trim()
        .replace(/^(actor|char)[_:]+/i, '')
        .replace(/[_-]+/g, ' ')
        .trim();
}

/**
 * 功能：简化角色显示名以便比较。
 * @param value 原始文本。
 * @returns 简化后的文本。
 */
function simplifyActorRefDisplayName(value: string): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

/**
 * 功能：判断文本是否是稳定角色键引用。
 * @param value 原始文本。
 * @returns 是否为角色键。
 */
function isActorRefKey(value: string): boolean {
    return /^(actor|char)[_:]/i.test(String(value ?? '').trim()) || String(value ?? '').trim().toLowerCase() === 'user';
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
export function normalizeActorCards(
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
export function normalizeRelationshipCards(
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
        actors: normalizeActorRefs([
            ...existingKnownEntities.actors.map((item): MemoryTakeoverActorCardCandidate => ({
                actorKey: item.actorKey,
                displayName: item.displayName,
                aliases: [],
                identityFacts: [],
                originFacts: [],
                traits: [],
            })),
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): MemoryTakeoverActorCardCandidate[] => item.actorCards ?? []),
        ].map((item: MemoryTakeoverActorCardCandidate) => ({
            actorKey: item.actorKey,
            displayName: item.displayName,
        })), 16),
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
                        entityKey: String(entity.entityKey ?? '').trim() || entity.compareKey || buildBatchEntityKey('organization', entity.title),
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
                        entityKey: String(entity.entityKey ?? '').trim() || entity.compareKey || buildBatchEntityKey('city', entity.title),
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
                        entityKey: String(entity.entityKey ?? '').trim() || entity.compareKey || buildBatchEntityKey('nation', entity.title),
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
                        entityKey: String(entity.entityKey ?? '').trim() || entity.compareKey || buildBatchEntityKey('location', entity.title),
                        displayName: entity.title,
                    }));
            }),
        ], 16),
        tasks: normalizeEntityRefs([
            ...existingKnownEntities.tasks,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.taskTransitions.map((transition) => ({
                    entityKey: String(transition.entityKey ?? '').trim() || String(transition.compareKey ?? '').trim() || buildBatchEntityKey('task', transition.task),
                    displayName: String(transition.title ?? transition.task ?? '').trim(),
                }));
            }),
        ], 16),
        worldStates: normalizeEntityRefs([
            ...existingKnownEntities.worldStates,
            ...batchResults.flatMap((item: MemoryTakeoverBatchResult): Array<{ entityKey: string; displayName: string }> => {
                return item.worldStateChanges.map((change) => ({
                    entityKey: String(change.entityKey ?? '').trim() || String(change.compareKey ?? '').trim() || buildBatchEntityKey('world_state', change.key),
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
    const actorLabelMap = new Map(knownEntities.actors.map((item: { actorKey: string; displayName: string }): [string, string] => [String(item.actorKey ?? '').trim(), String(item.displayName ?? '').trim()]));
    const actorHints = normalizeStringList([
        ...knownEntities.actors.map((item: { actorKey: string; displayName: string }): string => item.displayName),
        ...batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.stableFacts.map((fact) => fact.subject);
        }),
        ...batchResults.flatMap((item: MemoryTakeoverBatchResult): string[] => {
            return item.relationTransitions
                .map((transition) => {
                    const target = String(transition.target ?? '').trim();
                    if (!target) {
                        return '';
                    }
                    if (actorLabelMap.has(target)) {
                        return actorLabelMap.get(target) ?? '';
                    }
                    if (isActorRefKey(target)) {
                        return '';
                    }
                    return target;
                })
                .filter(Boolean);
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
    worldStrategyHintText?: string;
    worldProfileFieldPolicy?: WorldProfileFieldPolicy | null;
}): Promise<MemoryTakeoverBatchResult> {
    const assembly = await assembleTakeoverBatchPromptAssembly({
        llm: input.llm,
        pluginId: input.pluginId,
        messages: input.messages,
    });
    const floorRecords = assembly.floorRecords;
    const channels = assembly.channels;
    const extractionMessages = assembly.extractionMessages;
    const sourceSegments = assembly.sourceSegments;
    const roleStats = computeBatchRoleStats(input.messages);
    const userCount: number = roleStats.user || 0;
    const assistantCount: number = roleStats.assistant || 0;

    logger.info(`[takeover][batch][${input.batch.batchId}] 记忆过滤结果：`, {
        range: input.batch.range,
        total: input.messages.length,
        floorCount: floorRecords.length,
        sentFloors: extractionMessages.length,
        memoryFloors: floorRecords.filter((f) => f.hasMemoryContent).length,
        contextOnlyFloors: floorRecords.filter((f) => f.hasContextOnly && !f.hasMemoryContent).length,
        excludedOnlyFloors: floorRecords.filter((f) => f.hasExcludedOnly).length,
        memoryText: channels.memoryText.length,
        contextText: channels.contextText.length,
        roleStats,
    });
    logger.info(`[takeover][batch][${input.batch.batchId}] F12送模诊断：`, {
        requestedRange: `${input.batch.range.startFloor}-${input.batch.range.endFloor}`,
        sourceFloors: input.messages.map((message: MemoryTakeoverMessageSlice) => message.floor),
        manifestFloors: floorRecords.map((floor) => floor.floor),
        sentMessageFloors: extractionMessages.map((message: MemoryTakeoverMessageSlice) => message.floor),
        floorDecisions: floorRecords.map((floor) => ({
            floor: floor.floor,
            sourceFloor: floor.floor,
            hasMemoryContent: floor.hasMemoryContent,
            hasContextOnly: floor.hasContextOnly,
            hasExcludedOnly: floor.hasExcludedOnly,
            memoryBlockCount: floor.blocks.filter((block) => block.channel === 'memory').length,
            contextBlockCount: floor.blocks.filter((block) => block.channel === 'context').length,
            excludedBlockCount: floor.blocks.filter((block) => block.channel === 'excluded').length,
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

    // ── 批次时间评估 ──
    const batchText = input.messages.map(m => m.content).join('\n');
    const batchTimeResult = assessBatchTime({
        batchId: input.batch.batchId,
        batchText,
        startFloor: input.batch.range.startFloor,
        endFloor: input.batch.range.endFloor,
    });
    logTimeDebug('takeover_batch_time_assessment', {
        batchId: input.batch.batchId,
        explicitMentions: batchTimeResult.explicitMentions,
        sceneTransitions: batchTimeResult.sceneTransitions,
        inferredElapsed: batchTimeResult.inferredElapsed,
        confidence: batchTimeResult.confidence,
    });

    const fallback: MemoryTakeoverBatchResult = {
        takeoverId: input.batch.takeoverId,
        batchId: input.batch.batchId,
        summary: summary || `第${input.batch.range.startFloor} ~ ${input.batch.range.endFloor}层没有可提取摘要。`,
        batchTimeAssessment: batchTimeResult,
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
        sourceSegments: sourceSegments,
        floorManifest: toTakeoverFloorManifest(floorRecords),
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
        taskKey: 'memory_takeover_batch',
        taskDescription: `旧聊天处理（${displayProgress.current}/${displayProgress.total}）`,
        systemSection: 'TAKEOVER_BATCH_SYSTEM',
        schemaSection: 'TAKEOVER_BATCH_SCHEMA',
        sampleSection: 'TAKEOVER_BATCH_OUTPUT_SAMPLE',
        payload: {
            batchId: input.batch.batchId,
            batchCategory: input.batch.category,
            range: input.batch.range,
            knownContext,
            messages: extractionMessages,
            hintContext: channels.contextText || undefined,
        },
        extraSystemInstruction: [
            String(input.worldStrategyHintText ?? '').trim(),
            '如果输入里提供了 knownContext，请把它视为当前批次可复用的分类对象提示。',
            '你输出的是故事世界内部可读的记忆文本，不是系统日志、不是批处理说明、不是分析报告。',
            '所有自然语言字段中，凡是指代主角、玩家或当前用户，一律使用 `{{user}}`，禁止使用“用户”“主角”“你”“主人公”“对方”等写法。',
            '禁止在自然语言字段中出现“本批次”“本轮”“当前剧情”“当前场景”“当前设置地点”“当前设置”“首次识别到”“已触发”“已确认”“结构化”“绑定”“主链”“输出内容”“处理结果”“待补全”“需要进一步确认”等系统视角词。',
            '所有给人看的自然语言字段都必须写成小说设定集、角色小传、世界观摘要或悬念档案风格，不要解释你在做什么，只描述故事事实、人物关系、情绪推进与悬念。',
            '只有 story_narrative 与 story_dialogue 可作为正式抽取主源；meta 分析、说明、注释、tool 文本、think 风格文本不能直接产出正式角色与主链事实。',
            'knownContext.knownEntities.actors 代表当前聊天里已知且可更新的角色；knownContext.knownEntities.organizations 代表已知组织与势力；knownContext.knownEntities.cities 代表已知城市；knownContext.knownEntities.nations 代表已知国家；knownContext.knownEntities.locations 代表已知地点；knownContext.knownEntities.tasks 代表已知任务；knownContext.knownEntities.worldStates 代表已知世界状态。',
            '其中 actors 使用 actorKey 作为稳定标识；organizations、cities、nations、locations、tasks、worldStates 使用 entityKey 作为稳定标识。判断是不是同一个对象时，优先参考这些 key，再参考显示名。',
            '处理本批消息时，请优先判断当前信息应该归到哪一类对象上，而不是把所有新名词都当作角色。',
            '只有稳定、反复出现、并且明显是人物的对象，才允许写进 actorCards。',
            '正式角色仅限：在故事正文中实际出场并参与行动、对话、关系推进的人物；与 `{{user}}` 或其他已确认角色形成明确关系的人物；在本批剧情因果链中起关键作用的人物。',
            '只在分析说明、未来构思、注释、summary、details、tableEdit、think 文本里出现的人物，只能视为候选或忽略，不得直接升级为 actorCards。',
            '群体词、身份 title、组织名、地点名、任务名不得误判成角色。',
            'relationships 字段用于输出角色与角色之间的结构化关系卡，必须完整填写 sourceActorKey、targetActorKey、participants、relationTag、state、summary、trust、affection、tension。',
            '只要某个非 user 角色出现在 relationships 中，就必须在 actorCards 中提供同 actorKey 的角色卡；关系双方必须使用稳定 actorKey，不要只写显示名。',
            '如果消息里出现“何盈（橙狗狗视角）”这类写法，relationships 里仍然要使用标准角色键，不要把视角说明塞进 actorKey。',
            '教派、组织、势力、国家、城市、地点、阵营、规则、物品这类非人物对象，不要写进 actorCards。',
            '当 stableFacts.type 为 event，且事件主体、结果或描述里明确指向已有角色时，请优先沿用已有 actorCards 中的角色身份理解该事件，不要把同一个角色拆成新的对象。',
            '新增字段 entityCards 用于输出世界实体卡候选，entityType 可选 organization / city / nation / location。每张 entityCard 必须包含 entityType、entityKey、compareKey（格式为 ck:v2 协议）、title、aliases、summary、fields、confidence，并在能确认时补 matchKeys、schemaVersion、canonicalName。',
            '新增字段 entityTransitions 用于输出世界实体变更，action 可选 ADD / UPDATE / MERGE / INVALIDATE / DELETE。',
            '若已存在组织/城市/国家/地点（参考 knownEntities），请优先 UPDATE 而非 ADD。仅在无法匹配现有 entityKey / 别名时才 ADD。重名但属性一致时优先 MERGE。状态被新状态取代时优先 INVALIDATE + ADD/UPDATE。DELETE 仅用于明显垃圾或误建的记录。',
            '组织与势力优先写入 entityCards（entityType=organization）和 stableFacts（type=faction 或 type=organization）；地点请使用 entityCards（entityType=location）和 stableFacts（type=location）；城市请使用 entityCards（entityType=city）；国家请使用 entityCards（entityType=nation）；事件请使用 stableFacts（type=event）；物品或遗物请使用 stableFacts（type=artifact 或 type=item）；世界长期设定请使用 stableFacts（type=world）。',
            'relationTransitions 的 target 可以是角色，也可以是组织、势力、城市、国家或地点；只有明确是人物时，才应该同时出现在 actorCards 里。',
            '每条 relationTransitions 都要尽量填写 relationTag 和 targetType。relationTag 只能从 亲人、朋友、盟友、恋人、暧昧、师徒、上下级、竞争者、情敌、宿敌、陌生人 中选择；targetType 只能填写 actor、organization、city、nation、location、unknown。',
            '如果关系对象不是人物，不要把它塞进 actorCards；请保留在 relationTransitions，并正确填写对应的 targetType。',
            '如果对象已经出现在 knownContext.knownEntities 对应分类中，请优先按“更新已有对象”处理，而不是重复新增。',
        ].filter(Boolean).join(''),
    });
    if (!structured) {
        return fallback;
    }
    const normalized = normalizeTakeoverBatchResult({
        fallback,
        batch: input.batch,
        range: input.batch.range,
        result: structured,
        sourceSegments,
        worldProfileFieldPolicy: input.worldProfileFieldPolicy,
    });
    return runTakeoverRepairService({
        llm: input.llm,
        pluginId: input.pluginId,
        batch: input.batch,
        knownContext,
        messages: extractionMessages,
        segments: sourceSegments,
        result: normalized,
        normalizeResult: (value: MemoryTakeoverBatchResult): MemoryTakeoverBatchResult => normalizeTakeoverBatchResult({
            fallback,
            batch: input.batch,
            range: input.batch.range,
            result: value,
            sourceSegments,
            worldProfileFieldPolicy: input.worldProfileFieldPolicy,
        }),
    });
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
export function normalizeEntityCards(entityCards: MemoryTakeoverEntityCardCandidate[]): MemoryTakeoverEntityCardCandidate[] {
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
        const compareKey = String(card.compareKey ?? '').trim() || buildCompareKey(entityType, title, card.fields as Record<string, unknown>);
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        result.push({
            entityType: entityType as MemoryTakeoverEntityCardCandidate['entityType'],
            entityKey: String(card.entityKey ?? '').trim() || `entity:${entityType}:${normalizeId(title)}`,
            compareKey,
            matchKeys: normalizeStringList(card.matchKeys ?? buildMatchKeys(entityType, title, card.aliases, Object.values(card.fields ?? {})), 12),
            schemaVersion: String(card.schemaVersion ?? '').trim() || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName: String(card.canonicalName ?? '').trim() || title,
            legacyCompareKeys: normalizeStringList(card.legacyCompareKeys ?? [], 8),
            title,
            aliases: normalizeStringList(card.aliases ?? [], 8),
            summary: String(card.summary ?? '').trim(),
            fields: card.fields && typeof card.fields === 'object' ? card.fields : {},
            confidence: Math.max(0, Math.min(1, Number(card.confidence) || 0.5)),
            bindings: normalizeBindings(card.bindings),
            reasonCodes: normalizeStringList(card.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：归一化世界实体变更列表。
 * @param transitions 原始实体变更。
 * @returns 归一化后的实体变更。
 */
export function normalizeEntityTransitions(transitions: MemoryTakeoverEntityTransition[]): MemoryTakeoverEntityTransition[] {
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
            entityKey: String(transition.entityKey ?? '').trim() || `entity:${entityType}:${normalizeId(title)}`,
            compareKey: String(transition.compareKey ?? '').trim() || buildCompareKey(entityType, title, transition.payload as Record<string, unknown>),
            matchKeys: normalizeStringList(transition.matchKeys ?? buildMatchKeys(entityType, title, undefined, Object.values((transition.payload as Record<string, unknown>) ?? {})), 12),
            schemaVersion: String(transition.schemaVersion ?? '').trim() || COMPARE_KEY_SCHEMA_VERSION,
            canonicalName: String(transition.canonicalName ?? '').trim() || title,
            legacyCompareKeys: normalizeStringList(transition.legacyCompareKeys ?? [], 8),
            title,
            action: action as MemoryTakeoverEntityTransition['action'],
            reason: String(transition.reason ?? '').trim(),
            payload: transition.payload && typeof transition.payload === 'object' ? transition.payload : {},
            bindings: normalizeBindings(transition.bindings),
            reasonCodes: normalizeStringList(transition.reasonCodes ?? [], 12),
        });
    }
    return result;
}

/**
 * 功能：为稳定事实推导 compareKey。
 * @param type 事实类型。
 * @param fact 稳定事实。
 * @returns compareKey。
 */
function resolveStableFactCompareKey(type: string, fact: MemoryTakeoverStableFact): string {
    const title = String(fact.title ?? fact.subject ?? '').trim();
    if (type === 'event') {
        return buildEventCompareKey(title || fact.subject, {
            qualifier: String((fact.bindings?.locations ?? [])[0] ?? '').trim(),
        });
    }
    if (type === 'task') {
        return buildTaskCompareKey(title || fact.subject, {
            qualifier: String((fact.bindings?.locations ?? [])[0] ?? '').trim(),
        });
    }
    if (type === 'world' || type === 'world_global_state') {
        return buildWorldStateCompareKey(title || fact.subject, {
            qualifier: 'global',
        });
    }
    return buildCompareKey(type, title || fact.subject, {
        aliases: [],
        qualifier: String((fact.bindings?.locations ?? [])[0] ?? '').trim(),
    } as Record<string, unknown>);
}

/**
 * 功能：把标题压缩为稳定片段。
 * @param value 原始文本。
 * @returns 归一化结果。
 */
function normalizeId(value: string): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, '_')
        .replace(/^_+|_+$/g, '')
        || 'unknown';
}

const USER_PLACEHOLDER_SKIP_KEYS = new Set<string>([
    'actorKey',
    'sourceActorKey',
    'targetActorKey',
    'participants',
    'entityKey',
    'compareKey',
    'matchKeys',
    'schemaVersion',
    'legacyCompareKeys',
    'bindings',
    'reasonCodes',
    'sourceRange',
    'generatedAt',
    'takeoverId',
    'batchId',
    'sourceSegments',
    'auditReport',
]);

/**
 * 功能：转义正则中的特殊字符。
 * @param value 原始文本。
 * @returns 转义后的文本。
 */
function escapeRegExp(value: string): string {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 功能：把当前用户名统一替换为 `{{user}}`。
 * @param text 原始文本。
 * @param userDisplayName 当前用户名。
 * @returns 归一化后的文本。
 */
function replaceCurrentUserNameWithPlaceholder(text: string, userDisplayName: string): string {
    let output = String(text ?? '');
    if (!output) {
        return output;
    }
    output = output.replace(/\{\{\s*userDisplayName\s*\}\}/gi, '{{user}}');
    const normalizedUserDisplayName = String(userDisplayName ?? '').trim();
    if (normalizedUserDisplayName && normalizedUserDisplayName !== '你') {
        output = output.replace(new RegExp(escapeRegExp(normalizedUserDisplayName), 'g'), '{{user}}');
    }
    return output;
}

/**
 * 功能：递归统一接管结果里的用户占位符。
 * @param value 原始值。
 * @param userDisplayName 当前用户名。
 * @param currentKey 当前字段名。
 * @returns 归一化后的值。
 */
function normalizeTakeoverUserPlaceholder<T>(value: T, userDisplayName: string, currentKey?: string): T {
    if (typeof value === 'string') {
        if (USER_PLACEHOLDER_SKIP_KEYS.has(String(currentKey ?? '').trim())) {
            return value;
        }
        return replaceCurrentUserNameWithPlaceholder(value, userDisplayName) as T;
    }
    if (Array.isArray(value)) {
        if (USER_PLACEHOLDER_SKIP_KEYS.has(String(currentKey ?? '').trim())) {
            return value;
        }
        return value.map((item: unknown): unknown => normalizeTakeoverUserPlaceholder(item, userDisplayName)) as T;
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    if (USER_PLACEHOLDER_SKIP_KEYS.has(String(currentKey ?? '').trim())) {
        return value;
    }
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        output[key] = normalizeTakeoverUserPlaceholder(child, userDisplayName, key);
    }
    return output as T;
}

/**
 * 功能：根据接管稳定事实类型映射目标 entryType。
 * @param factType 接管稳定事实类型。
 * @returns 对应的 entryType。
 */
function resolveTakeoverFactEntryTypeForTime(factType: string): string {
    const normalized = String(factType ?? '').trim().toLowerCase();
    if (normalized === 'faction') {
        return 'organization';
    }
    if (normalized === 'artifact') {
        return 'item';
    }
    if (normalized === 'world') {
        return 'world_core_setting';
    }
    if (normalized === 'world_global_state') {
        return 'world_global_state';
    }
    return normalized || 'other';
}

/**
 * 功能：为单条接管记录补齐时间上下文与扩展时间字段。
 * @param entryType 目标 entryType。
 * @param record 原始记录。
 * @param timeContext 批次映射出的时间上下文。
 * @returns 补齐时间后的记录。
 */
function attachTakeoverRecordTime<T extends Record<string, unknown>>(
    entryType: string,
    record: T,
    timeContext: MemoryTimeContext,
): T {
    const existingTimeContext = record.timeContext as MemoryTimeContext | undefined;
    const resolvedTimeContext = existingTimeContext ?? timeContext;
    const enhancedTimeContext = enhanceMemoryTimeContextWithText({
        timeContext: resolvedTimeContext,
        text: buildTakeoverRecordTimeSeedText(record),
        sourceFloor: resolvedTimeContext.sequenceTime.firstFloor,
    });
    const timeMeta = buildTimeMetaByEntryType(entryType, enhancedTimeContext);
    return {
        ...record,
        timeContext: enhancedTimeContext,
        ...timeMeta,
    };
}

/**
 * 功能：把批次时间评估下沉到接管条目级结果。
 * @param result 原始批次结果。
 * @returns 补齐时间字段后的批次结果。
 */
function attachTakeoverBatchTimeMeta(result: MemoryTakeoverBatchResult): MemoryTakeoverBatchResult {
    const assessment = result.batchTimeAssessment;
    if (!assessment) {
        return result;
    }
    const batchTimeContext = mapBatchToMemoryTimeContext({
        assessment,
        firstFloor: result.sourceRange.startFloor,
        lastFloor: result.sourceRange.endFloor,
        source: 'takeover_batch',
        sourceText: `${result.summary ?? ''}\n${(result.sourceSegments ?? []).map((segment: TakeoverSourceSegment): string => String(segment.text ?? '').trim()).filter(Boolean).join('\n')}`,
    });
    return {
        ...result,
        stableFacts: (result.stableFacts ?? []).map((fact: MemoryTakeoverStableFact): MemoryTakeoverStableFact => (
            attachTakeoverRecordTime(resolveTakeoverFactEntryTypeForTime(fact.type), fact as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverStableFact
        )),
        relationships: (result.relationships ?? []).map((relationship: MemoryTakeoverRelationshipCard): MemoryTakeoverRelationshipCard => (
            attachTakeoverRecordTime('relationship', relationship as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverRelationshipCard
        )),
        entityCards: (result.entityCards ?? []).map((entityCard: MemoryTakeoverEntityCardCandidate): MemoryTakeoverEntityCardCandidate => (
            attachTakeoverRecordTime(entityCard.entityType, entityCard as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverEntityCardCandidate
        )),
        entityTransitions: (result.entityTransitions ?? []).map((transition: MemoryTakeoverEntityTransition): MemoryTakeoverEntityTransition => (
            attachTakeoverRecordTime(transition.entityType, transition as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverEntityTransition
        )),
        relationTransitions: (result.relationTransitions ?? []).map((transition: MemoryTakeoverRelationTransition): MemoryTakeoverRelationTransition => (
            attachTakeoverRecordTime('relationship', transition as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverRelationTransition
        )),
        taskTransitions: (result.taskTransitions ?? []).map((task: MemoryTakeoverTaskTransition): MemoryTakeoverTaskTransition => (
            attachTakeoverRecordTime('task', task as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverTaskTransition
        )),
        worldStateChanges: (result.worldStateChanges ?? []).map((change: MemoryTakeoverWorldStateChange): MemoryTakeoverWorldStateChange => (
            attachTakeoverRecordTime('world_global_state', change as unknown as Record<string, unknown>, batchTimeContext) as unknown as MemoryTakeoverWorldStateChange
        )),
    };
}

function buildTakeoverRecordTimeSeedText(record: Record<string, unknown>): string {
    return [
        record.title,
        record.summary,
        record.detail,
        record.description,
        record.state,
        record.value,
    ]
        .map((item: unknown): string => String(item ?? '').trim())
        .filter(Boolean)
        .join(' ');
}

/**
 * 功能：统一归一化接管批次结果。
 * @param input 归一化输入。
 * @returns 归一化后的批次结果。
 */
export function normalizeTakeoverBatchResult(input: {
    fallback: MemoryTakeoverBatchResult;
    batch: MemoryTakeoverBatch;
    range: MemoryTakeoverRange;
    result: MemoryTakeoverBatchResult;
    sourceSegments?: MemoryTakeoverBatchResult['sourceSegments'];
    worldProfileFieldPolicy?: WorldProfileFieldPolicy | null;
}): MemoryTakeoverBatchResult {
    const userDisplayName = resolveCurrentNarrativeUserName();
    const structured = normalizeTakeoverUserPlaceholder(input.result, userDisplayName);
    const normalizedResult: MemoryTakeoverBatchResult = {
        ...input.fallback,
        ...structured,
        actorCards: normalizeActorCards(structured.actorCards ?? [], 12),
        candidateActors: structured.candidateActors ?? [],
        rejectedMentions: structured.rejectedMentions ?? [],
        relationships: normalizeRelationshipCards(structured.relationships ?? []),
        entityCards: normalizeEntityCards(structured.entityCards ?? []),
        entityTransitions: normalizeEntityTransitions(structured.entityTransitions ?? []),
        stableFacts: normalizeStableFacts(structured.stableFacts ?? []),
        relationTransitions: normalizeRelationTransitions(structured.relationTransitions ?? []),
        taskTransitions: normalizeTaskTransitions(structured.taskTransitions ?? []),
        worldStateChanges: normalizeWorldStateChanges(structured.worldStateChanges ?? []),
        takeoverId: input.batch.takeoverId,
        batchId: input.batch.batchId,
        sourceRange: ensureRange(structured.sourceRange, input.range),
        sourceSegments: input.sourceSegments ?? structured.sourceSegments ?? [],
        generatedAt: Date.now(),
    };
    return attachTakeoverBatchTimeMeta(
        applyTakeoverWorldProfilePolicy(normalizedResult, input.worldProfileFieldPolicy),
    );
}

/**
 * 功能：把世界画像字段策略应用到接管批次结果。
 * @param result 批次结果。
 * @param worldProfileFieldPolicy 世界画像字段策略。
 * @returns 处理后的批次结果。
 */
function applyTakeoverWorldProfilePolicy(
    result: MemoryTakeoverBatchResult,
    worldProfileFieldPolicy: WorldProfileFieldPolicy | null | undefined,
): MemoryTakeoverBatchResult {
    if (!worldProfileFieldPolicy) {
        return result;
    }
    return {
        ...result,
        entityCards: result.entityCards.map((card: MemoryTakeoverEntityCardCandidate): MemoryTakeoverEntityCardCandidate => {
            const fieldPolicy = applyWorldProfileFieldPolicy({
                schemaId: card.entityType,
                fields: toRecord(card.fields),
                reasonCodes: card.reasonCodes ?? [],
                policy: worldProfileFieldPolicy,
            });
            return {
                ...card,
                fields: fieldPolicy.fields as MemoryTakeoverEntityCardCandidate['fields'],
                reasonCodes: fieldPolicy.reasonCodes,
            };
        }),
        entityTransitions: result.entityTransitions.map((transition: MemoryTakeoverEntityTransition): MemoryTakeoverEntityTransition => {
            const payload = toRecord(transition.payload);
            const fieldPolicy = applyWorldProfileFieldPolicy({
                schemaId: transition.entityType,
                fields: {
                    ...toRecord(payload),
                    ...toRecord(payload.fields),
                },
                reasonCodes: transition.reasonCodes ?? [],
                policy: worldProfileFieldPolicy,
            });
            return {
                ...transition,
                payload: {
                    ...payload,
                    fields: fieldPolicy.fields,
                },
                reasonCodes: fieldPolicy.reasonCodes,
            };
        }),
        stableFacts: result.stableFacts.map((fact: MemoryTakeoverStableFact): MemoryTakeoverStableFact => {
            const fieldPolicy = applyWorldProfileFieldPolicy({
                schemaId: mapStableFactTypeToSchemaId(fact.type),
                reasonCodes: fact.reasonCodes ?? [],
                policy: worldProfileFieldPolicy,
            });
            return {
                ...fact,
                reasonCodes: fieldPolicy.reasonCodes,
            };
        }),
        taskTransitions: result.taskTransitions.map((task: MemoryTakeoverTaskTransition): MemoryTakeoverTaskTransition => {
            const fieldPolicy = applyWorldProfileFieldPolicy({
                schemaId: 'task',
                fields: {
                    objective: task.goal,
                    status: task.status || task.to,
                },
                reasonCodes: task.reasonCodes ?? [],
                policy: worldProfileFieldPolicy,
            });
            return {
                ...task,
                reasonCodes: fieldPolicy.reasonCodes,
            };
        }),
        worldStateChanges: result.worldStateChanges.map((change: MemoryTakeoverWorldStateChange): MemoryTakeoverWorldStateChange => {
            const fieldPolicy = applyWorldProfileFieldPolicy({
                schemaId: 'world_global_state',
                fields: {
                    key: change.key,
                    state: change.value,
                },
                reasonCodes: change.reasonCodes ?? [],
                policy: worldProfileFieldPolicy,
            });
            return {
                ...change,
                reasonCodes: fieldPolicy.reasonCodes,
            };
        }),
    };
}

/**
 * 功能：把接管稳定事实类型映射到世界画像 schemaId。
 * @param factType 稳定事实类型。
 * @returns schemaId。
 */
function mapStableFactTypeToSchemaId(factType: string): string {
    const normalized = String(factType ?? '').trim().toLowerCase();
    if (normalized === 'faction') {
        return 'organization';
    }
    if (normalized === 'artifact') {
        return 'item';
    }
    if (normalized === 'world') {
        return 'world_core_setting';
    }
    return normalized || 'other';
}

/**
 * 功能：转成普通对象。
 * @param value 原始值。
 * @returns 对象结果。
 */
function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}
