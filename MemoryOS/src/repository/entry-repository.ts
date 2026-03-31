import { getCurrentTavernUserSnapshotEvent } from '../../../SDK/tavern';
import { CompareKeyService } from '../core/compare-key-service';
import { assertStrictActorKey, isStrictActorKey } from '../core/actor-key';
import {
    db,
    deleteMemoryCompareKeyIndexRecord,
    loadMemoryCompareKeyIndexRecords,
    saveMemoryCompareKeyIndexRecord,
    type DBActorMemoryProfile,
    type DBMemoryEntry,
    type DBMemoryEntryAuditRecord,
    type DBMemoryEntryType,
    type DBMemoryMutationHistory,
    type DBMemoryRelationship,
    type DBRoleEntryMemory,
    type DBSummarySnapshot,
} from '../db/db';
import { normalizeSummarySnapshot } from '../memory-summary-planner';
import { deleteWorldProfileBinding, getWorldProfileBinding, putWorldProfileBinding } from '../memory-world-profile';
import { BindingResolutionService } from '../services/binding-resolution-service';
import {
    CORE_MEMORY_ENTRY_TYPES,
    DEFAULT_ACTOR_MEMORY_STAT,
    type ActorMemoryProfile,
    type ApplyLedgerMutationBatchResult,
    type MemoryEntry,
    type MemoryEntryAuditRecord,
    type MemoryEntryFieldDiff,
    type MemoryEntryType,
    type MemoryEntryTypeField,
    type MemoryRelationshipRecord,
    type MemoryMutationHistoryRecord,
    type RoleEntryMemory,
    type LedgerMutation,
    type LedgerMutationBatchContext,
    type SummaryEntryUpsert,
    type SummaryRefreshBinding,
    type SummarySnapshot,
    type StructuredBindings,
    type UnifiedMemoryFilters,
    type WorldProfileBinding,
} from '../types';
import { resolveCurrentNarrativeUserName } from '../utils/narrative-user-name';

interface EntryAuditWriteOptions {
    actionType?: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    summaryId?: string;
    sourceLabel?: string;
    reasonCodes?: string[];
}

/**
 * 功能：统一承接 MemoryOS 记忆数据读写与 compareKey 索引维护。
 */
export class EntryRepository {
    private readonly chatKey: string;
    private readonly compareKeyService: CompareKeyService;
    private readonly bindingResolutionService: BindingResolutionService;

    constructor(chatKey: string, compareKeyService?: CompareKeyService) {
        this.chatKey = String(chatKey ?? '').trim();
        this.compareKeyService = compareKeyService ?? new CompareKeyService();
        this.bindingResolutionService = new BindingResolutionService(this.compareKeyService);
    }

    /**
     * 功能：初始化核心类型、默认用户画像与 compareKey 索引。
     * @returns 异步完成。
     */
    async init(): Promise<void> {
        await this.ensureCoreEntryTypes();
        await this.ensureActorProfile({ actorKey: 'user', displayName: this.resolveUserActorDisplayName() });
        await this.rebuildCompareKeyIndex();
    }

    /**
     * 功能：重建 compareKey 索引。
     * @returns 异步完成。
     */
    async rebuildCompareKeyIndex(): Promise<void> {
        const entries = await this.listEntries();
        for (const entry of entries) {
            await this.syncCompareKeyIndex(entry);
        }
    }

    /**
     * 功能：读取 compareKey 索引记录。
     * @returns 索引记录列表。
     */
    async listCompareKeyIndexRecords() {
        return loadMemoryCompareKeyIndexRecords(this.chatKey);
    }

    /**
     * 功能：列出条目类型。
     * @returns 条目类型列表。
     */
    async listEntryTypes(): Promise<MemoryEntryType[]> {
        const rows = await db.memory_entry_types.where('chatKey').equals(this.chatKey).toArray();
        return rows
            .map((row: DBMemoryEntryType): MemoryEntryType => this.mapEntryType(row))
            .sort((left: MemoryEntryType, right: MemoryEntryType): number => left.label.localeCompare(right.label, 'zh-CN'));
    }

    /**
     * 功能：保存条目类型。
     * @param input 条目类型输入。
     * @returns 保存后的条目类型。
     */
    async saveEntryType(input: Partial<MemoryEntryType> & { key: string; label: string }): Promise<MemoryEntryType> {
        const existing = await this.findEntryTypeByKey(input.key);
        const now = Date.now();
        const row: DBMemoryEntryType = {
            typeId: existing?.typeId ?? `entry-type:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            key: this.normalizeKey(input.key),
            label: this.normalizeText(input.label) || this.normalizeText(input.key),
            category: this.normalizeText(input.category) || '其他',
            description: this.normalizeText(input.description),
            fields: this.normalizeFields(input.fields),
            injectToSystem: input.injectToSystem === true,
            bindableToRole: input.bindableToRole !== false,
            builtIn: Boolean(existing?.builtIn),
            icon: this.normalizeText(input.icon),
            accentColor: this.normalizeText(input.accentColor),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        await db.memory_entry_types.put(row);
        return this.mapEntryType(row);
    }

    /**
     * 功能：删除自定义条目类型。
     * @param key 类型键。
     * @returns 异步完成。
     */
    async deleteEntryType(key: string): Promise<void> {
        const existing = await this.findEntryTypeByKey(key);
        if (!existing || existing.builtIn) {
            return;
        }
        const entries = await db.memory_entries.where('[chatKey+entryType]').equals([this.chatKey, existing.key]).toArray();
        if (entries.length > 0) {
            await db.memory_entries.bulkPut(entries.map((row: DBMemoryEntry): DBMemoryEntry => ({
                ...row,
                entryType: 'other',
                category: row.category || '其他',
                updatedAt: Date.now(),
            })));
        }
        await db.memory_entry_types.delete(existing.typeId);
    }

    /**
     * 功能：列出条目。
     * @param filters 过滤条件。
     * @returns 条目列表。
     */
    async listEntries(filters: UnifiedMemoryFilters = {}): Promise<MemoryEntry[]> {
        let rows = await db.memory_entries.where('chatKey').equals(this.chatKey).toArray();
        if (filters.entryType) {
            rows = rows.filter((row: DBMemoryEntry): boolean => row.entryType === filters.entryType);
        }
        if (filters.category) {
            rows = rows.filter((row: DBMemoryEntry): boolean => row.category === filters.category);
        }
        if (filters.injectToSystemOnly) {
            const typeMap = await this.getEntryTypeMap();
            rows = rows.filter((row: DBMemoryEntry): boolean => typeMap.get(row.entryType)?.injectToSystem === true);
        }
        if (filters.rememberedByActorKey) {
            const actorKey = this.assertActorKey(filters.rememberedByActorKey, 'listEntries.rememberedByActorKey');
            const memories = await db.role_entry_memory.where('[chatKey+actorKey]').equals([this.chatKey, actorKey]).toArray();
            const entrySet = new Set(memories.map((row: DBRoleEntryMemory): string => row.entryId));
            rows = rows.filter((row: DBMemoryEntry): boolean => entrySet.has(row.entryId));
        }
        const query = this.normalizeText(filters.query).toLowerCase();
        if (query) {
            rows = rows.filter((row: DBMemoryEntry): boolean => this.computeEntrySearchText(row).includes(query));
        }
        return rows
            .map((row: DBMemoryEntry): MemoryEntry => this.mapEntry(row))
            .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt);
    }

    /**
     * 功能：读取单个条目。
     * @param entryId 条目 ID。
     * @returns 条目对象。
     */
    async getEntry(entryId: string): Promise<MemoryEntry | null> {
        const row = await db.memory_entries.get(String(entryId ?? '').trim());
        if (!row || row.chatKey !== this.chatKey) {
            return null;
        }
        return this.mapEntry(row);
    }

    /**
     * 功能：保存条目并同步审计与 compareKey 索引。
     * @param input 条目输入。
     * @param options 审计选项。
     * @returns 保存后的条目。
     */
    async saveEntry(input: Partial<MemoryEntry> & { title: string; entryType: string }, options: EntryAuditWriteOptions = {}): Promise<MemoryEntry> {
        const existing = input.entryId ? await db.memory_entries.get(String(input.entryId ?? '').trim()) : null;
        const type = await this.getResolvedEntryType(input.entryType);
        const now = Date.now();
        const row: DBMemoryEntry = {
            entryId: existing?.entryId ?? `entry:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            title: this.normalizeText(input.title) || '未命名条目',
            entryType: type.key,
            category: this.normalizeText(input.category) || type.category || '其他',
            tags: this.normalizeTags(input.tags),
            summary: this.normalizeText(input.summary),
            detail: this.normalizeText(input.detail),
            detailSchemaVersion: Math.max(1, Number(input.detailSchemaVersion ?? existing?.detailSchemaVersion ?? 1) || 1),
            detailPayload: this.normalizeRecord(input.detailPayload ?? existing?.detailPayload ?? {}),
            sourceSummaryIds: this.normalizeTags(input.sourceSummaryIds),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        await db.memory_entries.put(row);
        const savedEntry = this.mapEntry(row);
        await this.syncCompareKeyIndex(savedEntry);
        await this.appendEntryAuditRecord({
            actionType: options.actionType ?? (existing ? 'UPDATE' : 'ADD'),
            summaryId: options.summaryId,
            sourceLabel: options.sourceLabel,
            reasonCodes: options.reasonCodes ?? [],
            beforeEntry: existing ? this.mapEntry(existing) : null,
            afterEntry: savedEntry,
            ts: now,
        });
        return savedEntry;
    }

    /**
     * 功能：删除条目并清理绑定与索引。
     * @param entryId 条目 ID。
     * @param options 审计选项。
     * @returns 异步完成。
     */
    async deleteEntry(entryId: string, options: EntryAuditWriteOptions = {}): Promise<void> {
        const normalizedEntryId = String(entryId ?? '').trim();
        const existingEntry = await this.getEntry(normalizedEntryId);
        const memories = await db.role_entry_memory.where('[chatKey+entryId]').equals([this.chatKey, normalizedEntryId]).toArray();
        if (memories.length > 0) {
            await db.role_entry_memory.bulkDelete(memories.map((row: DBRoleEntryMemory): string => row.roleMemoryId));
        }
        await db.memory_entries.delete(normalizedEntryId);
        await deleteMemoryCompareKeyIndexRecord(this.chatKey, normalizedEntryId);
        if (existingEntry) {
            await this.appendEntryAuditRecord({
                actionType: options.actionType ?? 'DELETE',
                summaryId: options.summaryId,
                sourceLabel: options.sourceLabel,
                reasonCodes: options.reasonCodes ?? [],
                beforeEntry: existingEntry,
                afterEntry: null,
                ts: Date.now(),
            });
        }
    }

    /**
     * 功能：列出角色资料。
     * @returns 角色资料列表。
     */
    async listActorProfiles(): Promise<ActorMemoryProfile[]> {
        let rows = await db.actor_memory_profiles.where('chatKey').equals(this.chatKey).toArray();
        const hasUserActor = rows.some((row: DBActorMemoryProfile): boolean => this.normalizeActorKey(row.actorKey) === 'user');
        if (!hasUserActor) {
            await this.ensureActorProfile({ actorKey: 'user', displayName: this.resolveUserActorDisplayName() });
            rows = await db.actor_memory_profiles.where('chatKey').equals(this.chatKey).toArray();
        }
        const profiles = rows.map((row: DBActorMemoryProfile): ActorMemoryProfile => this.mapActorProfile(row));
        return profiles.sort((left: ActorMemoryProfile, right: ActorMemoryProfile): number => left.displayName.localeCompare(right.displayName, 'zh-CN'));
    }

    /**
     * 功能：确保角色资料存在。
     * @param input 角色输入。
     * @returns 角色资料。
     */
    async ensureActorProfile(input: { actorKey: string; displayName?: string; memoryStat?: number }): Promise<ActorMemoryProfile> {
        const actorKey = this.assertActorKey(input.actorKey, 'ensureActorProfile.actorKey');
        const existing = await db.actor_memory_profiles.get([this.chatKey, actorKey]);
        const now = Date.now();
        const resolvedUserDisplayName = actorKey === 'user' ? this.resolveUserActorDisplayName() : '';
        const fallbackDisplayName = resolvedUserDisplayName || actorKey;
        const row: DBActorMemoryProfile = {
            actorKey,
            chatKey: this.chatKey,
            displayName: this.normalizeText(input.displayName) || resolvedUserDisplayName || existing?.displayName || fallbackDisplayName,
            memoryStat: this.clampPercent(input.memoryStat ?? existing?.memoryStat ?? DEFAULT_ACTOR_MEMORY_STAT),
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        };
        await db.actor_memory_profiles.put(row);
        return this.mapActorProfile(row);
    }

    /**
     * 功能：设置角色记性值。
     * @param actorKey 角色键。
     * @param memoryStat 记性值。
     * @returns 更新后的角色资料。
     */
    async setActorMemoryStat(actorKey: string, memoryStat: number): Promise<ActorMemoryProfile> {
        return this.ensureActorProfile({ actorKey, memoryStat });
    }

    /**
     * 功能：列出角色记忆绑定。
     * @param actorKey 可选角色键。
     * @returns 角色记忆列表。
     */
    async listRoleMemories(actorKey?: string): Promise<RoleEntryMemory[]> {
        const rows = actorKey
            ? await db.role_entry_memory.where('[chatKey+actorKey]').equals([this.chatKey, this.assertActorKey(actorKey, 'listRoleMemories.actorKey')]).toArray()
            : await db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray();
        return rows
            .map((row: DBRoleEntryMemory): RoleEntryMemory => this.mapRoleMemory(row))
            .sort((left: RoleEntryMemory, right: RoleEntryMemory): number => right.updatedAt - left.updatedAt);
    }

    /**
     * 功能：绑定角色与条目。
     * @param actorKey 角色键。
     * @param entryId 条目 ID。
     * @returns 角色记忆绑定。
     */
    async bindRoleToEntry(actorKey: string, entryId: string): Promise<RoleEntryMemory> {
        const normalizedActorKey = this.assertActorKey(actorKey, 'bindRoleToEntry.actorKey');
        const normalizedEntryId = String(entryId ?? '').trim();
        await this.ensureActorProfile({ actorKey: normalizedActorKey });
        const existing = await this.findRoleEntryMemory(normalizedActorKey, normalizedEntryId);
        const row: DBRoleEntryMemory = {
            roleMemoryId: existing?.roleMemoryId ?? `role-memory:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            actorKey: normalizedActorKey,
            entryId: normalizedEntryId,
            memoryPercent: 100,
            lastRefreshSummaryId: existing?.lastRefreshSummaryId,
            lastDecaySummaryId: existing?.lastDecaySummaryId,
            lastMentionSummaryId: existing?.lastMentionSummaryId,
            forgotten: false,
            forgottenAt: undefined,
            updatedAt: Date.now(),
        };
        await db.role_entry_memory.put(row);
        return this.mapRoleMemory(row);
    }

    /**
     * 功能：解除角色与条目绑定。
     * @param actorKey 角色键。
     * @param entryId 条目 ID。
     * @returns 异步完成。
     */
    async unbindRoleFromEntry(actorKey: string, entryId: string): Promise<void> {
        const existing = await this.findRoleEntryMemory(this.assertActorKey(actorKey, 'unbindRoleFromEntry.actorKey'), String(entryId ?? '').trim());
        if (existing) {
            await db.role_entry_memory.delete(existing.roleMemoryId);
        }
    }

    /**
     * 功能：列出当前聊天的角色关系主表记录。
     * @returns 关系主表记录列表。
     */
    async listRelationships(): Promise<MemoryRelationshipRecord[]> {
        const rows = await db.memory_relationships.where('chatKey').equals(this.chatKey).toArray();
        return rows
            .map((row: DBMemoryRelationship): MemoryRelationshipRecord => this.mapRelationship(row))
            .sort((left: MemoryRelationshipRecord, right: MemoryRelationshipRecord): number => right.updatedAt - left.updatedAt);
    }

    /**
     * 功能：保存单条角色关系到关系主表。
     * @param input 关系记录输入。
     * @returns 保存后的关系记录。
     */
    async saveRelationship(input: Omit<MemoryRelationshipRecord, 'chatKey' | 'createdAt' | 'updatedAt' | 'relationshipId'> & {
        relationshipId?: string;
        createdAt?: number;
        updatedAt?: number;
    }): Promise<MemoryRelationshipRecord> {
        const relationshipId = this.normalizeText(input.relationshipId) || `relationship:${this.chatKey}:${crypto.randomUUID()}`;
        const existing = await db.memory_relationships.get(relationshipId);
        const now = Date.now();
        const row: DBMemoryRelationship = {
            relationshipId,
            chatKey: this.chatKey,
            sourceActorKey: this.assertActorKey(input.sourceActorKey, 'saveRelationship.sourceActorKey'),
            targetActorKey: this.assertActorKey(input.targetActorKey, 'saveRelationship.targetActorKey'),
            relationTag: this.normalizeText(input.relationTag),
            state: this.normalizeText(input.state),
            summary: this.normalizeText(input.summary),
            trust: this.clampPercent(input.trust),
            affection: this.clampPercent(input.affection),
            tension: this.clampPercent(input.tension),
            participants: this.normalizeActorKeyList(input.participants),
            createdAt: existing?.createdAt ?? (Number(input.createdAt ?? now) || now),
            updatedAt: Number(input.updatedAt ?? now) || now,
        };
        await db.memory_relationships.put(row);
        return this.mapRelationship(row);
    }

    /**
     * 功能：用 takeover 最终结果整批替换当前聊天的角色关系主表。
     * @param relationships 最终关系列表。
     * @returns 异步完成。
     */
    async replaceRelationshipsForTakeover(relationships: MemoryRelationshipRecord[]): Promise<void> {
        const currentRows = await db.memory_relationships.where('chatKey').equals(this.chatKey).toArray();
        const nextRows = relationships.map((item: MemoryRelationshipRecord): DBMemoryRelationship => ({
            relationshipId: this.normalizeText(item.relationshipId) || `relationship:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            sourceActorKey: this.assertActorKey(item.sourceActorKey, 'replaceRelationshipsForTakeover.sourceActorKey'),
            targetActorKey: this.assertActorKey(item.targetActorKey, 'replaceRelationshipsForTakeover.targetActorKey'),
            relationTag: this.normalizeText(item.relationTag),
            state: this.normalizeText(item.state),
            summary: this.normalizeText(item.summary),
            trust: this.clampPercent(item.trust),
            affection: this.clampPercent(item.affection),
            tension: this.clampPercent(item.tension),
            participants: this.normalizeActorKeyList(item.participants),
            createdAt: Number(item.createdAt ?? Date.now()) || Date.now(),
            updatedAt: Number(item.updatedAt ?? Date.now()) || Date.now(),
        }));
        await db.transaction('rw', [db.memory_relationships], async (): Promise<void> => {
            if (currentRows.length > 0) {
                await db.memory_relationships.bulkDelete(currentRows.map((row: DBMemoryRelationship): string => row.relationshipId));
            }
            if (nextRows.length > 0) {
                await db.memory_relationships.bulkPut(nextRows);
            }
        });
    }

    /**
     * 功能：应用结构化总结快照。
     * @param input 总结输入。
     * @returns 保存后的总结快照。
     */
    async applyLedgerMutationBatch(
        mutations: LedgerMutation[],
        context: LedgerMutationBatchContext,
    ): Promise<ApplyLedgerMutationBatchResult> {
        const result: ApplyLedgerMutationBatchResult = {
            createdEntryIds: [],
            updatedEntryIds: [],
            invalidatedEntryIds: [],
            deletedEntryIds: [],
            noopCount: 0,
            counts: {
                input: Array.isArray(mutations) ? mutations.length : 0,
                add: 0,
                update: 0,
                merge: 0,
                invalidate: 0,
                delete: 0,
                noop: 0,
            },
            decisions: [],
            affectedRecords: [],
            bindingResults: [],
            resolvedBindingResults: [],
            auditResults: [],
            historyWritten: false,
        };
        const existingEntries = await this.listEntries();
        const compareKeyRecords = await this.listCompareKeyIndexRecords();
        const actorProfiles = await this.listActorProfiles();
        const batchBindingCandidates = this.buildBindingBatchCandidates(mutations);
        for (const mutation of mutations) {
            const normalizedTargetKind = this.normalizeText(mutation.targetKind);
            if (normalizedTargetKind === 'actor_profile') {
                throw new Error('actor_profile mutation 已停用，请改用 actor_memory_profiles 主表写入角色。');
            }
            if (normalizedTargetKind === 'relationship') {
                throw new Error('relationship mutation 已停用，请改用 memory_relationships 主表写入关系。');
            }
            const action = this.normalizeText(mutation.action).toUpperCase();
            const targetResolution = await this.resolveLedgerTargetEntry(mutation, existingEntries, compareKeyRecords);
            const targetEntry = targetResolution.entry;
            const resolvedBindings = this.bindingResolutionService.resolveForMutation({
                bindings: mutation.bindings
                    ?? (this.normalizeRecord(mutation.detailPayload).bindings as Record<string, unknown> | undefined)
                    ?? (this.normalizeRecord(targetEntry?.detailPayload).bindings as Record<string, unknown> | undefined),
                actorBindings: mutation.actorBindings,
                title: mutation.title,
                summary: mutation.summary,
                detail: mutation.detail,
                detailPayload: mutation.detailPayload,
                compareKey: mutation.compareKey,
                entityKey: mutation.entityKey,
                targetKind: mutation.targetKind,
                actorProfiles,
                existingEntries,
                compareKeyRecords,
                batchCandidates: batchBindingCandidates,
            });
            result.resolvedBindingResults.push({
                title: this.normalizeText(mutation.title) || '未命名条目',
                targetKind: this.normalizeText(mutation.targetKind) || 'other',
                resolvedBindings: resolvedBindings.bindings,
                decisions: resolvedBindings.decisions,
                resolvedCount: resolvedBindings.resolvedCount,
                unresolvedCount: resolvedBindings.unresolvedCount,
                fallbackCount: resolvedBindings.fallbackCount,
            });
            if (!action || action === 'NOOP') {
                result.noopCount += 1;
                result.counts.noop += 1;
                result.decisions.push({
                    targetKind: this.normalizeText(mutation.targetKind) || 'other',
                    action: 'NOOP',
                    title: this.normalizeText(mutation.title) || '未命名条目',
                    matchMode: 'skipped',
                    entityKey: this.normalizeText(mutation.entityKey) || undefined,
                    compareKey: this.normalizeText(mutation.compareKey) || undefined,
                    reasonCodes: this.normalizeTags(mutation.reasonCodes),
                    });
                continue;
            }
            if (action === 'DELETE') {
                if (!targetEntry) {
                    result.noopCount += 1;
                    result.counts.noop += 1;
                    result.decisions.push({
                        targetKind: this.normalizeText(mutation.targetKind) || 'other',
                        action: 'DELETE',
                        title: this.normalizeText(mutation.title) || '未命名条目',
                        matchMode: 'skipped',
                        entityKey: this.normalizeText(mutation.entityKey) || undefined,
                        compareKey: this.normalizeText(mutation.compareKey) || undefined,
                        reasonCodes: this.normalizeTags(mutation.reasonCodes),
                    });
                    continue;
                }
                await this.deleteEntry(targetEntry.entryId, {
                    actionType: 'DELETE',
                    summaryId: context.summaryId,
                    sourceLabel: context.sourceLabel,
                    reasonCodes: mutation.reasonCodes ?? [],
                });
                result.deletedEntryIds.push(targetEntry.entryId);
                result.counts.delete += 1;
                result.decisions.push({
                    targetKind: this.normalizeText(mutation.targetKind) || targetEntry.entryType,
                    action: 'DELETE',
                    title: this.normalizeText(mutation.title) || targetEntry.title,
                    matchMode: targetResolution.matchMode,
                    entryId: targetEntry.entryId,
                    entityKey: targetResolution.entityKey || undefined,
                    compareKey: targetResolution.compareKey || undefined,
                    reasonCodes: this.normalizeTags(mutation.reasonCodes),
                });
                result.affectedRecords.push({
                    entryId: targetEntry.entryId,
                    entityKey: targetResolution.entityKey || undefined,
                    compareKey: targetResolution.compareKey || undefined,
                    action: 'DELETE',
                });
                result.auditResults.push({
                    entryId: targetEntry.entryId,
                    action: 'DELETE',
                    written: true,
                });
                continue;
            }
            const savedEntry = await this.saveEntry({
                entryId: targetEntry?.entryId ?? mutation.entryId,
                title: mutation.title,
                entryType: mutation.targetKind,
                summary: mutation.summary ?? '',
                detail: mutation.detail,
                detailPayload: this.buildLedgerDetailPayload(mutation, targetEntry, resolvedBindings.bindings),
                tags: mutation.tags,
                sourceSummaryIds: context.summaryId ? [context.summaryId] : [],
            }, {
                actionType: action as EntryAuditWriteOptions['actionType'],
                summaryId: context.summaryId,
                sourceLabel: context.sourceLabel,
                reasonCodes: mutation.reasonCodes ?? [],
            });
            const normalizedAction = this.normalizeLedgerAction(action, targetEntry);
            if (normalizedAction === 'ADD') {
                result.createdEntryIds.push(savedEntry.entryId);
                result.counts.add += 1;
            } else if (normalizedAction === 'INVALIDATE') {
                result.invalidatedEntryIds.push(savedEntry.entryId);
                result.counts.invalidate += 1;
            } else if (normalizedAction === 'MERGE') {
                result.updatedEntryIds.push(savedEntry.entryId);
                result.counts.merge += 1;
            } else {
                result.updatedEntryIds.push(savedEntry.entryId);
                result.counts.update += 1;
            }
            result.decisions.push({
                targetKind: this.normalizeText(mutation.targetKind) || savedEntry.entryType,
                action: normalizedAction,
                title: this.normalizeText(mutation.title) || savedEntry.title,
                matchMode: targetResolution.matchMode,
                entryId: savedEntry.entryId,
                entityKey: this.readEntryEntityKey(savedEntry) || targetResolution.entityKey || undefined,
                compareKey: this.readEntryCompareKey(savedEntry) || targetResolution.compareKey || undefined,
                reasonCodes: this.normalizeTags(mutation.reasonCodes),
            });
            result.affectedRecords.push({
                entryId: savedEntry.entryId,
                entityKey: this.readEntryEntityKey(savedEntry) || targetResolution.entityKey || undefined,
                compareKey: this.readEntryCompareKey(savedEntry) || targetResolution.compareKey || undefined,
                action: normalizedAction,
            });
            result.auditResults.push({
                entryId: savedEntry.entryId,
                action: normalizedAction,
                written: true,
            });
            const actorBindings = this.normalizeTags([
                ...(mutation.actorBindings ?? []),
                ...resolvedBindings.bindings.actors,
            ]);
            for (const actorKey of actorBindings) {
                await this.bindRoleToEntry(actorKey, savedEntry.entryId);
                result.bindingResults.push({
                    actorKey: this.assertActorKey(actorKey, 'applyLedgerMutationBatch.actorBindings'),
                    entryId: savedEntry.entryId,
                    written: true,
                });
            }
            existingEntries.push(savedEntry);
            compareKeyRecords.push(this.compareKeyService.buildIndexRecord(savedEntry));
        }
        await this.appendMutationHistory({
            action: 'ledger_mutation_batch_applied',
            payload: {
                source: context.source,
                sourceLabel: context.sourceLabel,
                mutationCount: mutations.length,
                summaryId: context.summaryId,
                takeoverId: context.takeoverId,
                bootstrapRunId: context.bootstrapRunId,
                manualEditorId: context.manualEditorId,
                result,
            },
        });
        result.historyWritten = true;
        return result;
    }

    async applySummarySnapshot(input: {
        title?: string;
        content: string;
        normalizedSummary?: SummarySnapshot['normalizedSummary'];
        actorKeys: string[];
        entryUpserts?: SummaryEntryUpsert[];
        refreshBindings?: SummaryRefreshBinding[];
    }): Promise<SummarySnapshot> {
        const summaryId = `summary-snapshot:${this.chatKey}:${crypto.randomUUID()}`;
        const now = Date.now();
        const actorKeys = this.normalizeTags(input.actorKeys).map((item: string): string => this.assertActorKey(item, 'applySummarySnapshot.actorKeys'));
        for (const actorKey of actorKeys) {
            await this.ensureActorProfile({ actorKey });
        }

        const mutations = (Array.isArray(input.entryUpserts) ? input.entryUpserts : []).map((upsert: SummaryEntryUpsert): LedgerMutation => ({
            targetKind: upsert.entryType,
            action: (upsert.actionType ?? (upsert.entryId ? 'UPDATE' : 'ADD')) as LedgerMutation['action'],
            title: upsert.title,
            entryId: upsert.entryId,
            summary: upsert.summary,
            detail: upsert.detail,
            detailPayload: upsert.detailPayload,
            tags: upsert.tags,
            reasonCodes: upsert.reasonCodes,
        }));
        const mutationApplyDiagnostics = await this.applyLedgerMutationBatch(mutations, {
            chatKey: this.chatKey,
            source: 'summary',
            sourceLabel: this.normalizeText(input.title) || '结构化回合总结',
            summaryId,
            allowCreate: true,
            allowInvalidate: true,
        });

        const allEntries = await this.listEntries();
        const savedEntries: MemoryEntry[] = (Array.isArray(input.entryUpserts) ? input.entryUpserts : [])
            .map((upsert: SummaryEntryUpsert): MemoryEntry | null => {
                if (upsert.entryId) {
                    return allEntries.find((entry: MemoryEntry): boolean => entry.entryId === upsert.entryId) ?? null;
                }
                return allEntries.find((entry: MemoryEntry): boolean => entry.title === upsert.title && entry.entryType === upsert.entryType) ?? null;
            })
            .filter((entry: MemoryEntry | null): entry is MemoryEntry => Boolean(entry));

        const refreshTargets = await this.resolveRefreshTargets(input.refreshBindings ?? [], savedEntries);
        const refreshedSet = new Set<string>();
        for (const target of refreshTargets) {
            const existing = await this.findRoleEntryMemory(target.actorKey, target.entryId);
            await db.role_entry_memory.put({
                roleMemoryId: existing?.roleMemoryId ?? `role-memory:${this.chatKey}:${crypto.randomUUID()}`,
                chatKey: this.chatKey,
                actorKey: target.actorKey,
                entryId: target.entryId,
                memoryPercent: 100,
                lastRefreshSummaryId: summaryId,
                lastDecaySummaryId: existing?.lastDecaySummaryId,
                lastMentionSummaryId: summaryId,
                forgotten: false,
                forgottenAt: undefined,
                updatedAt: now,
            });
            refreshedSet.add(`${target.actorKey}::${target.entryId}`);
        }

        const actorStatMap = new Map((await this.listActorProfiles()).map((profile: ActorMemoryProfile): [string, number] => [profile.actorKey, profile.memoryStat]));
        const roleRows = await db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray();
        const decayedRows = roleRows
            .filter((row: DBRoleEntryMemory): boolean => !refreshedSet.has(`${row.actorKey}::${row.entryId}`))
            .map((row: DBRoleEntryMemory): DBRoleEntryMemory => {
                const nextPercent = this.clampPercent(row.memoryPercent - this.resolveDecayValue(actorStatMap.get(row.actorKey) ?? DEFAULT_ACTOR_MEMORY_STAT));
                return {
                    ...row,
                    memoryPercent: nextPercent,
                    lastDecaySummaryId: summaryId,
                    forgotten: nextPercent <= 0 ? true : row.forgotten,
                    forgottenAt: nextPercent <= 0 ? now : row.forgottenAt,
                    updatedAt: now,
                };
            });
        if (decayedRows.length > 0) {
            await db.role_entry_memory.bulkPut(decayedRows);
        }

        const row: DBSummarySnapshot & {
            mutationApplyDiagnostics?: ApplyLedgerMutationBatchResult;
        } = {
            summaryId,
            chatKey: this.chatKey,
            title: this.normalizeText(input.title) || `总结 ${new Date(now).toLocaleString('zh-CN')}`,
            content: this.normalizeText(input.content),
            normalizedSummary: normalizeSummarySnapshot({
                title: input.title,
                content: input.content,
                entryUpserts: input.entryUpserts,
                normalizedSummary: input.normalizedSummary,
            }),
            actorKeys,
            entryUpserts: (input.entryUpserts ?? []).map((item: SummaryEntryUpsert): Record<string, unknown> => ({ ...item })),
            refreshBindings: (input.refreshBindings ?? []).map((item: SummaryRefreshBinding): Record<string, unknown> => ({ ...item })),
            mutationApplyDiagnostics,
            createdAt: now,
            updatedAt: now,
        };
        await db.summary_snapshots.put(row);
        return this.mapSummarySnapshot(row);
    }

    async listSummarySnapshots(limit: number = 20): Promise<SummarySnapshot[]> {
        const rows = await db.summary_snapshots
            .where('[chatKey+updatedAt]')
            .between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER])
            .reverse()
            .limit(Math.max(1, limit))
            .toArray();
        return rows.map((row: DBSummarySnapshot): SummarySnapshot => this.mapSummarySnapshot(row));
    }

    /**
     * 功能：读取当前聊天的世界画像绑定。
     * @returns 世界画像绑定。
     */
    async getWorldProfileBinding(): Promise<WorldProfileBinding | null> {
        return getWorldProfileBinding(this.chatKey);
    }

    /**
     * 功能：写入当前聊天的世界画像绑定。
     * @param input 绑定输入。
     * @returns 保存后的绑定对象。
     */
    async putWorldProfileBinding(input: {
        primaryProfile: string;
        secondaryProfiles: string[];
        confidence: number;
        reasonCodes: string[];
        detectedFrom: string[];
    }): Promise<WorldProfileBinding> {
        return putWorldProfileBinding({
            chatKey: this.chatKey,
            primaryProfile: input.primaryProfile,
            secondaryProfiles: input.secondaryProfiles,
            confidence: input.confidence,
            reasonCodes: input.reasonCodes,
            detectedFrom: input.detectedFrom,
        });
    }

    /**
     * 功能：删除当前聊天的世界画像绑定。
     * @returns 异步完成。
     */
    async deleteWorldProfileBinding(): Promise<void> {
        await deleteWorldProfileBinding(this.chatKey);
    }

    /**
     * 功能：追加 mutation 历史记录。
     * @param input 历史记录输入。
     * @returns 异步完成。
     */
    async appendMutationHistory(input: { action: string; payload: Record<string, unknown> }): Promise<void> {
        const row: DBMemoryMutationHistory = {
            historyId: `memory-history:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            action: this.normalizeText(input.action) || 'unknown',
            payload: this.normalizeRecord(input.payload),
            ts: Date.now(),
        };
        await db.memory_mutation_history.put(row);
    }

    /**
     * 功能：列出 mutation 历史记录。
     * @param limit 返回数量。
     * @returns 历史记录列表。
     */
    async listMutationHistory(limit: number = 20): Promise<MemoryMutationHistoryRecord[]> {
        const rows = await db.memory_mutation_history
            .where('[chatKey+ts]')
            .between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER])
            .reverse()
            .limit(Math.max(1, limit))
            .toArray();
        return rows.map((row: DBMemoryMutationHistory): MemoryMutationHistoryRecord => this.mapMutationHistory(row));
    }

    /**
     * 功能：列出条目审计记录。
     * @param limit 返回数量。
     * @returns 审计记录列表。
     */
    async listEntryAuditRecords(limit: number = 20): Promise<MemoryEntryAuditRecord[]> {
        const rows = await db.memory_entry_audit_records
            .where('[chatKey+ts]')
            .between([this.chatKey, 0], [this.chatKey, Number.MAX_SAFE_INTEGER])
            .reverse()
            .limit(Math.max(1, limit))
            .toArray();
        return rows.map((row: DBMemoryEntryAuditRecord): MemoryEntryAuditRecord => this.mapEntryAuditRecord(row));
    }

    /**
     * 功能：确保核心条目类型存在。
     * @returns 异步完成。
     */
    private async ensureCoreEntryTypes(): Promise<void> {
        const rows = await db.memory_entry_types.where('chatKey').equals(this.chatKey).toArray();
        const existingMap = new Map(rows.map((row: DBMemoryEntryType): [string, DBMemoryEntryType] => [row.key, row]));
        const now = Date.now();
        await db.memory_entry_types.bulkPut(CORE_MEMORY_ENTRY_TYPES.map((item) => ({
            typeId: existingMap.get(item.key)?.typeId ?? `entry-type:${this.chatKey}:${item.key}`,
            chatKey: this.chatKey,
            key: item.key,
            label: item.label,
            category: item.category,
            description: item.description,
            fields: item.fields,
            injectToSystem: item.injectToSystem,
            bindableToRole: item.bindableToRole,
            builtIn: true,
            icon: item.icon,
            accentColor: item.accentColor,
            createdAt: existingMap.get(item.key)?.createdAt ?? now,
            updatedAt: now,
        })));
    }

    /**
     * 功能：同步单条 entry 的 compareKey 索引。
     * @param entry 条目。
     * @returns 异步完成。
     */
    private async syncCompareKeyIndex(entry: MemoryEntry): Promise<void> {
        await saveMemoryCompareKeyIndexRecord(this.chatKey, this.compareKeyService.buildIndexRecord(entry));
    }

    /**
     * 功能：解析 ledger mutation 目标条目。
     * @param mutation mutation
     * @param existingEntries 已有条目
     * @param compareKeyRecords compareKey 索引
     * @returns 命中的条目
     */
    private async resolveLedgerTargetEntry(
        mutation: LedgerMutation,
        existingEntries: MemoryEntry[],
        compareKeyRecords: Array<Awaited<ReturnType<EntryRepository['listCompareKeyIndexRecords']>>[number]>,
    ): Promise<{
        entry: MemoryEntry | null;
        matchMode: 'exact_match' | 'near_match' | 'created' | 'skipped';
        compareKey: string;
        entityKey: string;
    }> {
        if (mutation.entryId) {
            const matchedEntry = existingEntries.find((entry: MemoryEntry): boolean => entry.entryId === mutation.entryId) ?? null;
            return {
                entry: matchedEntry,
                matchMode: matchedEntry ? 'exact_match' : 'skipped',
                compareKey: this.readEntryCompareKey(matchedEntry) || this.normalizeText(mutation.compareKey),
                entityKey: this.readEntryEntityKey(matchedEntry) || this.normalizeText(mutation.entityKey),
            };
        }
        const compareKey = this.normalizeText(mutation.compareKey);
        if (compareKey) {
            const exact = compareKeyRecords.find((record): boolean => this.compareKeyService.isExactMatch(record.compareKey, compareKey));
            if (exact) {
                return {
                    entry: existingEntries.find((entry: MemoryEntry): boolean => entry.entryId === exact.entryId) ?? null,
                    matchMode: 'exact_match',
                    compareKey: this.normalizeText(exact.compareKey) || compareKey,
                    entityKey: this.normalizeText(exact.entityKey) || this.normalizeText(mutation.entityKey),
                };
            }
            const near = compareKeyRecords.find((record): boolean => this.compareKeyService.isNearMatch(record.compareKey, compareKey));
            if (near) {
                return {
                    entry: existingEntries.find((entry: MemoryEntry): boolean => entry.entryId === near.entryId) ?? null,
                    matchMode: 'near_match',
                    compareKey: this.normalizeText(near.compareKey) || compareKey,
                    entityKey: this.normalizeText(near.entityKey) || this.normalizeText(mutation.entityKey),
                };
            }
        }
        const normalizedTitle = this.normalizeText(mutation.title);
        const normalizedKind = this.normalizeText(mutation.targetKind);
        const matchedEntry = existingEntries.find((entry: MemoryEntry): boolean => {
            return entry.entryType === normalizedKind && this.normalizeText(entry.title) === normalizedTitle;
        }) ?? null;
        return {
            entry: matchedEntry,
            matchMode: matchedEntry ? 'exact_match' : 'created',
            compareKey: this.readEntryCompareKey(matchedEntry) || compareKey,
            entityKey: this.readEntryEntityKey(matchedEntry) || this.normalizeText(mutation.entityKey),
        };
    }

    /**
     * 功能：根据动作与是否命中旧记录，归一化统一落盘动作。
     * @param action 原始动作
     * @param targetEntry 命中的旧记录
     * @returns 归一化后的动作
     */
    private normalizeLedgerAction(
        action: string,
        targetEntry: MemoryEntry | null,
    ): 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE' {
        const normalizedAction = this.normalizeText(action).toUpperCase();
        if (normalizedAction === 'INVALIDATE') {
            return 'INVALIDATE';
        }
        if (normalizedAction === 'DELETE') {
            return 'DELETE';
        }
        if (normalizedAction === 'MERGE') {
            return 'MERGE';
        }
        if (normalizedAction === 'ADD' && !targetEntry) {
            return 'ADD';
        }
        return 'UPDATE';
    }

    /**
     * 功能：从条目中读取协议化 compareKey。
     * @param entry 条目
     * @returns compareKey
     */
    private readEntryCompareKey(entry: MemoryEntry | null): string {
        if (!entry) {
            return '';
        }
        const payload = this.normalizeRecord(entry.detailPayload);
        const fields = this.normalizeRecord(payload.fields);
        return this.normalizeText(payload.compareKey ?? fields.compareKey);
    }

    /**
     * 功能：从条目中读取协议化 entityKey。
     * @param entry 条目
     * @returns entityKey
     */
    private readEntryEntityKey(entry: MemoryEntry | null): string {
        if (!entry) {
            return '';
        }
        const payload = this.normalizeRecord(entry.detailPayload);
        const fields = this.normalizeRecord(payload.fields);
        return this.normalizeText(payload.entityKey ?? fields.entityKey);
    }

    /**
     * 功能：构建 ledger mutation 对应的 detailPayload。
     * @param mutation mutation
     * @param targetEntry 已命中的条目
     * @returns detailPayload
     */
    private buildLedgerDetailPayload(
        mutation: LedgerMutation,
        targetEntry: MemoryEntry | null,
        resolvedBindings: StructuredBindings,
    ): Record<string, unknown> {
        const currentPayload = this.normalizeRecord(targetEntry?.detailPayload);
        const nextPayload = this.normalizeRecord(mutation.detailPayload);
        const nextFields = this.normalizeRecord(nextPayload.fields);
        const mergedPayload: Record<string, unknown> = {
            ...currentPayload,
            ...nextPayload,
            bindings: resolvedBindings,
            fields: {
                ...this.normalizeRecord(currentPayload.fields),
                ...nextFields,
            },
        };
        if (mutation.compareKey) {
            mergedPayload.compareKey = mutation.compareKey;
        }
        if (Array.isArray(mutation.matchKeys) && mutation.matchKeys.length > 0) {
            mergedPayload.matchKeys = this.normalizeTags(mutation.matchKeys);
        }
        if (mutation.entityKey) {
            mergedPayload.entityKey = mutation.entityKey;
        }
        if (mutation.action === 'INVALIDATE') {
            const lifecycle = this.normalizeRecord(mergedPayload.lifecycle);
            mergedPayload.lifecycle = {
                ...lifecycle,
                status: 'invalidated',
                invalidatedAt: Date.now(),
                reasonCodes: this.normalizeTags([
                    ...this.normalizeTags(lifecycle.reasonCodes),
                    ...(mutation.reasonCodes ?? []),
                ]),
            };
        }
        return mergedPayload;
    }

    /**
     * 功能：构建批次内可复用的绑定候选。
     * @param mutations mutation 列表。
     * @returns 批次候选列表。
     */
    private buildBindingBatchCandidates(mutations: LedgerMutation[]): Array<{
        bindingKey: keyof StructuredBindings;
        ref: string;
        label: string;
        aliases?: string[];
    }> {
        return mutations
            .map((mutation: LedgerMutation): {
                bindingKey: keyof StructuredBindings;
                ref: string;
                label: string;
                aliases?: string[];
            } | null => {
                const bindingKey = this.resolveBindingKeyFromTargetKind(mutation.targetKind);
                const label = this.normalizeText(mutation.title);
                const ref = this.normalizeText(mutation.entityKey ?? mutation.compareKey);
                if (!bindingKey || !label || !ref) {
                    return null;
                }
                const payload = this.normalizeRecord(mutation.detailPayload);
                const fields = this.normalizeRecord(payload.fields);
                return {
                    bindingKey,
                    ref,
                    label,
                    aliases: this.normalizeTags(fields.aliases ?? payload.aliases),
                };
            })
            .filter(Boolean) as Array<{
            bindingKey: keyof StructuredBindings;
            ref: string;
            label: string;
            aliases?: string[];
        }>;
    }

    /**
     * 功能：根据目标类型映射绑定分类。
     * @param targetKind 目标类型。
     * @returns 绑定分类。
     */
    private resolveBindingKeyFromTargetKind(targetKind: string): keyof StructuredBindings | null {
        const normalizedKind = this.normalizeText(targetKind).toLowerCase();
        if (normalizedKind === 'organization') return 'organizations';
        if (normalizedKind === 'city') return 'cities';
        if (normalizedKind === 'nation') return 'nations';
        if (normalizedKind === 'location') return 'locations';
        if (normalizedKind === 'task') return 'tasks';
        if (normalizedKind === 'event') return 'events';
        return null;
    }

    /**
     * 功能：解析有效条目类型。
     * @param key 类型键。
     * @returns 条目类型。
     */
    private async getResolvedEntryType(key: string): Promise<MemoryEntryType> {
        const matched = await this.findEntryTypeByKey(key);
        if (matched) {
            return this.mapEntryType(matched);
        }
        const fallback = await this.findEntryTypeByKey('other');
        if (fallback) {
            return this.mapEntryType(fallback);
        }
        return this.saveEntryType({
            key: 'other',
            label: '其他',
            category: '其他',
            description: '兜底类型',
        });
    }

    /**
     * 功能：读取类型映射。
     * @returns 类型映射。
     */
    private async getEntryTypeMap(): Promise<Map<string, MemoryEntryType>> {
        const items = await this.listEntryTypes();
        return new Map(items.map((item: MemoryEntryType): [string, MemoryEntryType] => [item.key, item]));
    }

    /**
     * 功能：按键查找条目类型。
     * @param key 类型键。
     * @returns 数据库类型行。
     */
    private async findEntryTypeByKey(key: string): Promise<DBMemoryEntryType | null> {
        const rows = await db.memory_entry_types.where('[chatKey+key]').equals([this.chatKey, this.normalizeKey(key)]).toArray();
        return rows[0] ?? null;
    }

    /**
     * 功能：读取角色与条目的绑定记录。
     * @param actorKey 角色键。
     * @param entryId 条目 ID。
     * @returns 绑定记录。
     */
    private async findRoleEntryMemory(actorKey: string, entryId: string): Promise<DBRoleEntryMemory | null> {
        const rows = await db.role_entry_memory.where('[chatKey+actorKey+entryId]').equals([this.chatKey, actorKey, entryId] as [string, string, string]).toArray();
        return rows[0] ?? null;
    }

    /**
     * 功能：解析总结刷新目标。
     * @param bindings 刷新绑定。
     * @param savedEntries 本次保存条目。
     * @returns 刷新目标列表。
     */
    private async resolveRefreshTargets(bindings: SummaryRefreshBinding[], savedEntries: MemoryEntry[]): Promise<Array<{ actorKey: string; entryId: string }>> {
        const titleMap = new Map<string, string>();
        (await this.listEntries()).forEach((entry: MemoryEntry): void => {
            titleMap.set(entry.title, entry.entryId);
        });
        savedEntries.forEach((entry: MemoryEntry): void => {
            titleMap.set(entry.title, entry.entryId);
        });
        return bindings
            .map((binding: SummaryRefreshBinding): { actorKey: string; entryId: string } | null => {
                const actorKey = isStrictActorKey(binding.actorKey)
                    ? this.assertActorKey(binding.actorKey, 'resolveRefreshTargets.actorKey')
                    : '';
                const entryId = String(binding.entryId ?? '').trim() || String(titleMap.get(this.normalizeText(binding.entryTitle)) ?? '').trim();
                if (!actorKey || !entryId) {
                    return null;
                }
                return { actorKey, entryId };
            })
            .filter(Boolean) as Array<{ actorKey: string; entryId: string }>;
    }

    /**
     * 功能：计算条目检索文本。
     * @param entry 条目。
     * @returns 检索文本。
     */
    private computeEntrySearchText(entry: DBMemoryEntry | MemoryEntry): string {
        const payloadTexts = Object.values(this.normalizeRecord(entry.detailPayload ?? {}))
            .map((value: unknown): string => this.normalizeText(Array.isArray(value) ? value.join(' ') : value))
            .filter(Boolean);
        return [
            this.normalizeText(entry.title),
            this.normalizeText(entry.entryType),
            this.normalizeText(entry.category),
            this.normalizeText(entry.summary),
            this.normalizeText(entry.detail),
            ...this.normalizeTags(entry.tags),
            ...payloadTexts,
        ].join(' ').toLowerCase();
    }

    /**
     * 功能：计算记忆衰减值。
     * @param memoryStat 角色记性。
     * @returns 衰减值。
     */
    private resolveDecayValue(memoryStat: number): number {
        return Math.max(4, Math.round((100 - this.clampPercent(memoryStat)) / 8));
    }

    /**
     * 功能：映射条目类型。
     * @param row 数据库行。
     * @returns 条目类型。
     */
    private mapEntryType(row: DBMemoryEntryType): MemoryEntryType {
        return {
            ...row,
            fields: this.normalizeFields(row.fields),
        };
    }

    /**
     * 功能：映射条目。
     * @param row 数据库行。
     * @returns 条目。
     */
    private mapEntry(row: DBMemoryEntry): MemoryEntry {
        return {
            ...row,
            tags: this.normalizeTags(row.tags),
            summary: this.normalizeText(row.summary),
            detail: this.normalizeText(row.detail),
            detailPayload: this.normalizeRecord(row.detailPayload),
            sourceSummaryIds: this.normalizeTags(row.sourceSummaryIds),
        };
    }

    /**
     * 功能：映射角色资料。
     * @param row 数据库行。
     * @returns 角色资料。
     */
    private mapActorProfile(row: DBActorMemoryProfile): ActorMemoryProfile {
        const actorKey = this.assertActorKey(row.actorKey, 'mapActorProfile.actorKey');
        const displayName = actorKey === 'user'
            ? (this.resolveUserActorDisplayName() || this.normalizeText(row.displayName) || actorKey)
            : (this.normalizeText(row.displayName) || actorKey);
        return {
            ...row,
            actorKey,
            displayName,
            memoryStat: this.clampPercent(row.memoryStat),
        };
    }

    /**
     * 功能：映射角色记忆绑定。
     * @param row 数据库行。
     * @returns 角色记忆。
     */
    private mapRoleMemory(row: DBRoleEntryMemory): RoleEntryMemory {
        return {
            ...row,
            actorKey: this.assertActorKey(row.actorKey, 'mapRoleMemory.actorKey'),
            memoryPercent: this.clampPercent(row.memoryPercent),
            forgotten: Boolean(row.forgotten),
        };
    }

    /**
     * 功能：将关系主表数据库行映射为运行时关系记录。
     * @param row 数据库关系行。
     * @returns 运行时关系记录。
     */
    private mapRelationship(row: DBMemoryRelationship): MemoryRelationshipRecord {
        return {
            ...row,
            sourceActorKey: this.assertActorKey(row.sourceActorKey, 'mapRelationship.sourceActorKey'),
            targetActorKey: this.assertActorKey(row.targetActorKey, 'mapRelationship.targetActorKey'),
            participants: this.normalizeActorKeyList(row.participants),
            trust: this.clampPercent(row.trust),
            affection: this.clampPercent(row.affection),
            tension: this.clampPercent(row.tension),
        };
    }

    /**
     * 功能：映射总结快照。
     * @param row 数据库行。
     * @returns 总结快照。
     */
    private mapSummarySnapshot(row: DBSummarySnapshot): SummarySnapshot {
        const extraRecord = row as DBSummarySnapshot & {
            mutationApplyDiagnostics?: ApplyLedgerMutationBatchResult;
        };
        return {
            summaryId: row.summaryId,
            chatKey: row.chatKey,
            title: this.normalizeText(row.title),
            content: this.normalizeText(row.content),
            normalizedSummary: row.normalizedSummary
                ? normalizeSummarySnapshot({
                    title: row.title,
                    content: row.content,
                    normalizedSummary: row.normalizedSummary,
                })
                : undefined,
            actorKeys: this.normalizeTags(row.actorKeys),
            entryUpserts: Array.isArray(row.entryUpserts) ? row.entryUpserts as unknown as SummaryEntryUpsert[] : [],
            refreshBindings: Array.isArray(row.refreshBindings) ? row.refreshBindings as unknown as SummaryRefreshBinding[] : [],
            mutationApplyDiagnostics: extraRecord.mutationApplyDiagnostics,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    /**
     * 功能：映射 mutation 历史记录。
     * @param row 数据库行。
     * @returns 历史记录。
     */
    private mapMutationHistory(row: DBMemoryMutationHistory): MemoryMutationHistoryRecord {
        return {
            historyId: row.historyId,
            chatKey: row.chatKey,
            action: this.normalizeText(row.action),
            payload: this.normalizeRecord(row.payload),
            ts: row.ts,
        };
    }

    /**
     * 功能：写入条目审计记录。
     * @param input 审计输入。
     * @returns 异步完成。
     */
    private async appendEntryAuditRecord(input: {
        actionType: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
        summaryId?: string;
        sourceLabel?: string;
        reasonCodes: string[];
        beforeEntry: MemoryEntry | null;
        afterEntry: MemoryEntry | null;
        ts: number;
    }): Promise<void> {
        const anchorEntry = input.afterEntry ?? input.beforeEntry;
        if (!anchorEntry) {
            return;
        }
        const row: DBMemoryEntryAuditRecord = {
            auditId: `memory-entry-audit:${this.chatKey}:${crypto.randomUUID()}`,
            chatKey: this.chatKey,
            summaryId: this.normalizeText(input.summaryId) || undefined,
            entryId: anchorEntry.entryId,
            entryTitle: anchorEntry.title,
            entryType: anchorEntry.entryType,
            actionType: input.actionType,
            sourceLabel: this.normalizeText(input.sourceLabel) || undefined,
            beforeEntry: input.beforeEntry ? this.toAuditEntrySnapshot(input.beforeEntry) : null,
            afterEntry: input.afterEntry ? this.toAuditEntrySnapshot(input.afterEntry) : null,
            changedFields: this.buildEntryFieldDiffs(input.beforeEntry, input.afterEntry).map((item) => ({
                path: item.path,
                label: item.label,
                before: this.deepCloneValue(item.before),
                after: this.deepCloneValue(item.after),
            })),
            reasonCodes: this.normalizeTags(input.reasonCodes),
            ts: input.ts,
        };
        await db.memory_entry_audit_records.put(row);
    }

    /**
     * 功能：将条目快照转成可存储的审计对象。
     * @param entry 条目。
     * @returns 审计快照。
     */
    private toAuditEntrySnapshot(entry: MemoryEntry): Record<string, unknown> {
        return {
            entryId: entry.entryId,
            chatKey: entry.chatKey,
            title: entry.title,
            entryType: entry.entryType,
            category: entry.category,
            tags: [...entry.tags],
            summary: entry.summary,
            detail: entry.detail,
            detailSchemaVersion: entry.detailSchemaVersion,
            detailPayload: this.deepCloneValue(entry.detailPayload),
            sourceSummaryIds: [...entry.sourceSummaryIds],
            createdAt: entry.createdAt,
            updatedAt: entry.updatedAt,
        };
    }

    /**
     * 功能：构建条目字段差异。
     * @param beforeEntry 变更前条目。
     * @param afterEntry 变更后条目。
     * @returns 差异列表。
     */
    private buildEntryFieldDiffs(beforeEntry: MemoryEntry | null, afterEntry: MemoryEntry | null): MemoryEntryFieldDiff[] {
        const beforeMap = this.flattenEntryForDiff(beforeEntry);
        const afterMap = this.flattenEntryForDiff(afterEntry);
        const paths = Array.from(new Set<string>([
            ...beforeMap.keys(),
            ...afterMap.keys(),
        ])).sort((left: string, right: string): number => left.localeCompare(right, 'zh-CN'));
        return paths
            .filter((path: string): boolean => !this.isAuditValueEqual(beforeMap.get(path), afterMap.get(path)))
            .map((path: string): MemoryEntryFieldDiff => ({
                path,
                label: this.resolveDiffFieldLabel(path),
                before: this.deepCloneValue(beforeMap.get(path)),
                after: this.deepCloneValue(afterMap.get(path)),
            }));
    }

    /**
     * 功能：拍平条目用于差异比对。
     * @param entry 条目。
     * @returns 路径映射。
     */
    private flattenEntryForDiff(entry: MemoryEntry | null): Map<string, unknown> {
        const out = new Map<string, unknown>();
        if (!entry) {
            return out;
        }
        out.set('title', entry.title);
        out.set('entryType', entry.entryType);
        out.set('category', entry.category);
        out.set('tags', [...entry.tags]);
        out.set('summary', entry.summary);
        out.set('detail', entry.detail);
        this.appendFlattenedDiffValue(out, 'detailPayload', entry.detailPayload);
        return out;
    }

    /**
     * 功能：递归展开对象字段。
     * @param out 输出映射。
     * @param path 当前路径。
     * @param value 当前值。
     */
    private appendFlattenedDiffValue(out: Map<string, unknown>, path: string, value: unknown): void {
        if (Array.isArray(value)) {
            out.set(path, this.deepCloneValue(value));
            return;
        }
        if (!value || typeof value !== 'object') {
            out.set(path, value);
            return;
        }
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort((left: string, right: string): number => left.localeCompare(right, 'zh-CN'));
        if (keys.length <= 0) {
            out.set(path, {});
            return;
        }
        for (const key of keys) {
            this.appendFlattenedDiffValue(out, `${path}.${key}`, record[key]);
        }
    }

    /**
     * 功能：判断两个审计值是否相等。
     * @param left 左值。
     * @param right 右值。
     * @returns 是否相等。
     */
    private isAuditValueEqual(left: unknown, right: unknown): boolean {
        return JSON.stringify(this.deepCloneValue(left)) === JSON.stringify(this.deepCloneValue(right));
    }

    /**
     * 功能：深拷贝值。
     * @param value 原始值。
     * @returns 拷贝结果。
     */
    private deepCloneValue<T>(value: T): T {
        if (value === undefined) {
            return value;
        }
        return JSON.parse(JSON.stringify(value)) as T;
    }

    /**
     * 功能：解析差异字段标签。
     * @param path 字段路径。
     * @returns 展示标签。
     */
    private resolveDiffFieldLabel(path: string): string {
        const preset: Record<string, string> = {
            title: '标题',
            entryType: '类型',
            category: '分类',
            tags: '标签',
            summary: '摘要',
            detail: '详情',
        };
        if (preset[path]) {
            return preset[path];
        }
        if (path.startsWith('detailPayload.')) {
            return `结构化字段：${path.slice('detailPayload.'.length)}`;
        }
        return path;
    }

    /**
     * 功能：映射条目审计记录。
     * @param row 数据库行。
     * @returns 审计记录。
     */
    private mapEntryAuditRecord(row: DBMemoryEntryAuditRecord): MemoryEntryAuditRecord {
        return {
            auditId: row.auditId,
            chatKey: row.chatKey,
            summaryId: this.normalizeText(row.summaryId) || undefined,
            entryId: row.entryId,
            entryTitle: this.normalizeText(row.entryTitle),
            entryType: this.normalizeText(row.entryType),
            actionType: row.actionType,
            sourceLabel: this.normalizeText(row.sourceLabel) || undefined,
            beforeEntry: this.normalizeAuditEntrySnapshot(row.beforeEntry),
            afterEntry: this.normalizeAuditEntrySnapshot(row.afterEntry),
            changedFields: Array.isArray(row.changedFields)
                ? row.changedFields
                    .filter((item: unknown): boolean => Boolean(item) && typeof item === 'object')
                    .map((item: unknown): MemoryEntryFieldDiff => {
                        const record = item as Record<string, unknown>;
                        return {
                            path: this.normalizeText(record.path),
                            label: this.normalizeText(record.label) || this.normalizeText(record.path),
                            before: this.deepCloneValue(record.before),
                            after: this.deepCloneValue(record.after),
                        };
                    })
                    .filter((item: MemoryEntryFieldDiff): boolean => Boolean(item.path))
                : [],
            reasonCodes: this.normalizeTags(row.reasonCodes),
            ts: row.ts,
        };
    }

    /**
     * 功能：还原审计快照为条目对象。
     * @param value 审计快照。
     * @returns 条目对象。
     */
    private normalizeAuditEntrySnapshot(value: Record<string, unknown> | null): MemoryEntry | null {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return null;
        }
        return {
            entryId: this.normalizeText(value.entryId),
            chatKey: this.normalizeText(value.chatKey) || this.chatKey,
            title: this.normalizeText(value.title),
            entryType: this.normalizeText(value.entryType) || 'other',
            category: this.normalizeText(value.category) || '其他',
            tags: this.normalizeTags(value.tags),
            summary: this.normalizeText(value.summary),
            detail: this.normalizeText(value.detail),
            detailSchemaVersion: Math.max(1, Number(value.detailSchemaVersion ?? 1) || 1),
            detailPayload: this.normalizeRecord(value.detailPayload),
            sourceSummaryIds: this.normalizeTags(value.sourceSummaryIds),
            createdAt: Number(value.createdAt ?? 0) || 0,
            updatedAt: Number(value.updatedAt ?? 0) || 0,
        };
    }

    /**
     * 功能：归一化类型字段配置。
     * @param fields 原始字段。
     * @returns 字段列表。
     */
    private normalizeFields(fields: unknown): MemoryEntryTypeField[] {
        if (!Array.isArray(fields)) {
            return [];
        }
        return fields
            .filter((item: unknown): boolean => Boolean(item) && typeof item === 'object')
            .map((item: unknown): MemoryEntryTypeField => {
                const record = item as Record<string, unknown>;
                return {
                    key: this.normalizeKey(record.key),
                    label: this.normalizeText(record.label) || this.normalizeText(record.key),
                    kind: (this.normalizeText(record.kind) || 'text') as MemoryEntryTypeField['kind'],
                    placeholder: this.normalizeText(record.placeholder) || undefined,
                    required: record.required === true,
                };
            })
            .filter((item: MemoryEntryTypeField): boolean => Boolean(item.key));
    }

    /**
     * 功能：安全归一化对象。
     * @param value 原始值。
     * @returns 对象记录。
     */
    private normalizeRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：归一化字符串数组。
     * @param values 原始值。
     * @returns 字符串数组。
     */
    private normalizeTags(values: unknown): string[] {
        if (!Array.isArray(values)) {
            return [];
        }
        return Array.from(new Set(values.map((item: unknown): string => this.normalizeText(item)).filter(Boolean)));
    }

    /**
     * 功能：归一化文本。
     * @param value 原始值。
     * @returns 文本。
     */
    private normalizeText(value: unknown): string {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    /**
     * 功能：归一化键名。
     * @param value 原始值。
     * @returns 键名。
     */
    private normalizeKey(value: unknown): string {
        return this.normalizeText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    }

    /**
     * 功能：归一化角色键。
     * @param value 原始值。
     * @returns 角色键。
     */
    private normalizeActorKey(value: unknown): string {
        return this.normalizeText(value).toLowerCase();
    }

    /**
     * 功能：断言角色键满足当前严格协议。
     * @param value 原始角色键。
     * @param context 错误上下文。
     * @returns 校验通过后的角色键。
     */
    private assertActorKey(value: unknown, context: string): string {
        return assertStrictActorKey(value, context);
    }

    /**
     * 功能：把候选角色键列表过滤并归一化为严格角色键数组。
     * @param values 原始角色键列表。
     * @returns 通过校验后的角色键数组。
     */
    private normalizeActorKeyList(values: unknown): string[] {
        if (!Array.isArray(values)) {
            return [];
        }
        return Array.from(new Set(
            values
                .filter((item: unknown): boolean => isStrictActorKey(item))
                .map((item: unknown): string => this.assertActorKey(item, 'normalizeActorKeyList.item')),
        ));
    }

    /**
     * 功能：解析当前用户在记忆中的显示名。
     * @returns 用户显示名。
     */
    private resolveUserActorDisplayName(): string {
        return this.normalizeText(resolveCurrentNarrativeUserName()) || '你';
    }

    /**
     * 功能：限制百分比范围。
     * @param value 原始值。
     * @returns 百分比。
     */
    private clampPercent(value: number): number {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return 0;
        }
        return Math.max(0, Math.min(100, Math.round(numericValue)));
    }
}
