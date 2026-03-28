import { db } from '../db/db';
import type {
    DBActorMemoryProfile,
    DBMemoryMutationHistory,
    DBMemoryEntryAuditRecord,
    DBMemoryEntry,
    DBMemoryEntryType,
    DBRoleEntryMemory,
    DBSummarySnapshot,
} from '../db/db';
import {
    CORE_MEMORY_ENTRY_TYPES,
    DEFAULT_ACTOR_MEMORY_STAT,
    type ActorMemoryProfile,
    type MemoryEntry,
    type MemoryEntryAuditRecord,
    type MemoryEntryFieldDiff,
    type MemoryEntryType,
    type MemoryEntryTypeField,
    type MemoryMutationHistoryRecord,
    type PromptAssemblyRoleEntry,
    type PromptAssemblySnapshot,
    type RoleEntryMemory,
    type SummaryEntryUpsert,
    type SummaryRefreshBinding,
    type SummarySnapshot,
    type UnifiedMemoryFilters,
    type WorldProfileBinding,
} from '../types';
import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { getCurrentTavernUserNameEvent, getCurrentTavernUserSnapshotEvent } from '../../../SDK/tavern';
import { readMemoryOSSettings } from '../settings/store';
import { readMemoryLLMApi, runSummaryOrchestrator } from '../memory-summary';
import { normalizeSummarySnapshot } from '../memory-summary-planner';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { detectWorldProfile, resolveWorldProfile, getWorldProfileBinding, putWorldProfileBinding, deleteWorldProfileBinding } from '../memory-world-profile';
import { buildActorVisibleMemoryContext, renderMemoryContextXmlMarkdown } from '../memory-injection';
import { getMemoryTrace, recordMemoryDebug } from './debug/memory-retrieval-logger';
import { RetrievalOrchestrator, type RetrievalCandidate } from '../memory-retrieval';

const promptRetrievalOrchestrator = new RetrievalOrchestrator();

interface EntryAuditWriteOptions {
    actionType?: 'ADD' | 'UPDATE' | 'MERGE' | 'INVALIDATE' | 'DELETE';
    summaryId?: string;
    sourceLabel?: string;
    reasonCodes?: string[];
}

/**
 * 功能：统一条目记忆系统主管理器。
 */
export class UnifiedMemoryManager {
    private chatKey: string;

    private static readonly QUERY_STOP_PHRASES: string[] = [
        '是什么地方',
        '是什么意思',
        '请介绍一下',
        '请告诉我',
        '是什么',
        '在哪里',
        '是谁',
        '有哪里',
        '有哪些',
        '为什么',
        '怎么样',
        '怎么',
        '如何',
        '介绍',
        '说明',
        '设定',
        '定义',
        '含义',
        '背景',
        '来历',
        '作用',
        '位置',
        '地点',
        '概况',
        '信息',
        '请问',
        '一下',
        '这个',
        '那个',
    ];

    constructor(chatKey: string) {
        this.chatKey = String(chatKey ?? '').trim();
    }

    /**
     * 功能：初始化核心类型与默认角色资料。
     * @returns 初始化 Promise。
     */
    async init(): Promise<void> {
        await this.ensureCoreEntryTypes();
        await this.ensureActorProfile({ actorKey: 'user', displayName: this.resolveUserActorDisplayName() });
        await this.ensureDefaultUserActorCard();
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
     * @returns 删除完成后的 Promise。
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
     * @param filters 筛选条件。
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
            const memories = await db.role_entry_memory.where('[chatKey+actorKey]').equals([this.chatKey, this.normalizeActorKey(filters.rememberedByActorKey)]).toArray();
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
     * @returns 条目。
     */
    async getEntry(entryId: string): Promise<MemoryEntry | null> {
        const row = await db.memory_entries.get(String(entryId ?? '').trim());
        if (!row || row.chatKey !== this.chatKey) {
            return null;
        }
        return this.mapEntry(row);
    }

    /**
     * 功能：保存条目。
     * @param input 条目输入。
     * @returns 保存后的条目。
     */
    async saveEntry(
        input: Partial<MemoryEntry> & { title: string; entryType: string },
        options: EntryAuditWriteOptions = {},
    ): Promise<MemoryEntry> {
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
     * 功能：删除条目及相关角色记忆。
     * @param entryId 条目 ID。
     * @returns 删除完成后的 Promise。
     */
    async deleteEntry(entryId: string, options: EntryAuditWriteOptions = {}): Promise<void> {
        const normalizedEntryId = String(entryId ?? '').trim();
        const existingEntry = await this.getEntry(normalizedEntryId);
        const memories = await db.role_entry_memory.where('[chatKey+entryId]').equals([this.chatKey, normalizedEntryId]).toArray();
        if (memories.length > 0) {
            await db.role_entry_memory.bulkDelete(memories.map((row: DBRoleEntryMemory): string => row.roleMemoryId));
        }
        await db.memory_entries.delete(normalizedEntryId);
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
            await this.ensureActorProfile({
                actorKey: 'user',
                displayName: this.resolveUserActorDisplayName(),
            });
            rows = await db.actor_memory_profiles.where('chatKey').equals(this.chatKey).toArray();
        }
        return rows
            .map((row: DBActorMemoryProfile): ActorMemoryProfile => this.mapActorProfile(row))
            .sort((left: ActorMemoryProfile, right: ActorMemoryProfile): number => left.displayName.localeCompare(right.displayName, 'zh-CN'));
    }

    /**
     * 功能：确保角色资料存在。
     * @param input 角色输入。
     * @returns 角色资料。
     */
    async ensureActorProfile(input: {
        actorKey: string;
        displayName?: string;
        memoryStat?: number;
    }): Promise<ActorMemoryProfile> {
        const actorKey = this.normalizeActorKey(input.actorKey);
        const existing = await db.actor_memory_profiles.get(actorKey);
        const now = Date.now();
        const resolvedUserDisplayName = actorKey === 'user'
            ? this.resolveUserActorDisplayName()
            : '';
        const fallbackDisplayName = resolvedUserDisplayName || actorKey;
        const row: DBActorMemoryProfile = {
            actorKey,
            chatKey: this.chatKey,
            displayName: this.normalizeText(input.displayName)
                || resolvedUserDisplayName
                || existing?.displayName
                || fallbackDisplayName,
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
     * 功能：列出角色记忆。
     * @param actorKey 可选角色键。
     * @returns 角色记忆列表。
     */
    async listRoleMemories(actorKey?: string): Promise<RoleEntryMemory[]> {
        const rows = actorKey
            ? await db.role_entry_memory.where('[chatKey+actorKey]').equals([this.chatKey, this.normalizeActorKey(actorKey)]).toArray()
            : await db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray();
        return rows
            .map((row: DBRoleEntryMemory): RoleEntryMemory => this.mapRoleMemory(row))
            .sort((left: RoleEntryMemory, right: RoleEntryMemory): number => right.updatedAt - left.updatedAt);
    }

    /**
     * 功能：绑定角色与条目。
     * @param actorKey 角色键。
     * @param entryId 条目 ID。
     * @returns 保存后的角色记忆。
     */
    async bindRoleToEntry(actorKey: string, entryId: string): Promise<RoleEntryMemory> {
        const normalizedActorKey = this.normalizeActorKey(actorKey);
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
     * @returns 删除完成后的 Promise。
     */
    async unbindRoleFromEntry(actorKey: string, entryId: string): Promise<void> {
        const existing = await this.findRoleEntryMemory(this.normalizeActorKey(actorKey), String(entryId ?? '').trim());
        if (existing) {
            await db.role_entry_memory.delete(existing.roleMemoryId);
        }
    }

    /**
     * 功能：应用结构化总结快照。
     * @param input 总结输入。
     * @returns 保存后的总结快照。
     */
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
        const actorKeys = this.normalizeTags(input.actorKeys).map((item: string): string => this.normalizeActorKey(item));
        for (const actorKey of actorKeys) {
            await this.ensureActorProfile({ actorKey });
        }

        const savedEntries: MemoryEntry[] = [];
        for (const upsert of Array.isArray(input.entryUpserts) ? input.entryUpserts : []) {
            const savedEntry = await this.saveEntry({
                entryId: upsert.entryId,
                title: upsert.title,
                entryType: upsert.entryType,
                category: upsert.category,
                tags: upsert.tags,
                summary: upsert.summary,
                detail: upsert.detail,
                detailPayload: upsert.detailPayload,
                sourceSummaryIds: [summaryId],
            }, {
                actionType: upsert.actionType,
                summaryId,
                sourceLabel: upsert.sourceLabel || (this.normalizeText(input.title) || '结构化回合总结'),
                reasonCodes: upsert.reasonCodes ?? [],
            });
            savedEntries.push(savedEntry);
        }

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

        const row: DBSummarySnapshot = {
            summaryId,
            chatKey: this.chatKey,
            title: this.normalizeText(input.title) || `回合总结 ${new Date(now).toLocaleString('zh-CN')}`,
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
            createdAt: now,
            updatedAt: now,
        };
        await db.summary_snapshots.put(row);
        return this.mapSummarySnapshot(row);
    }

    /**
     * 功能：读取当前聊天的世界模板绑定。
     * @returns 世界模板绑定；不存在时返回 null。
     */
    async getWorldProfileBinding(): Promise<WorldProfileBinding | null> {
        return getWorldProfileBinding(this.chatKey);
    }

    /**
     * 功能：写入当前聊天的世界模板绑定。
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
     * 功能：追加 mutation 历史记录。
     * @param input 历史输入。
     */
    /**
     * 功能：删除当前聊天的世界模板绑定。
     */
    async deleteWorldProfileBinding(): Promise<void> {
        await deleteWorldProfileBinding(this.chatKey);
    }

    /**
     * 功能：追加一条 mutation 历史记录。
     * @param input 历史记录输入。
     */
    async appendMutationHistory(input: {
        action: string;
        payload: Record<string, unknown>;
    }): Promise<void> {
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
     * 功能：读取最近的记忆变更历史。
     * @param limit 返回数量。
     * @returns 变更历史列表。
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
     * 功能：读取最近的词条更新审计记录。
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
     * 功能：从当前聊天消息自动生成轻量总结。
     * @param input 消息输入。
     * @returns 总结快照。
     */
    async captureSummaryFromChat(input: {
        messages: Array<{ role?: string; content?: string; name?: string }>;
        actorHints?: Array<{ actorKey: string; displayName?: string }>;
        title?: string;
    }): Promise<SummarySnapshot | null> {
        const normalizedMessages = Array.isArray(input.messages)
            ? input.messages.filter((item: { role?: string }): boolean => this.normalizeText(item.role) !== 'system').slice(-40)
            : [];
        if (normalizedMessages.length <= 0) {
            return null;
        }
        for (const actorHint of Array.isArray(input.actorHints) ? input.actorHints : []) {
            await this.ensureActorProfile(actorHint);
        }
        const settings = readMemoryOSSettings();
        const llm = readMemoryLLMApi();
        const summaryResult = await runSummaryOrchestrator({
            dependencies: {
                listEntries: async (): Promise<MemoryEntry[]> => this.listEntries(),
                listRoleMemories: async (actorKey?: string): Promise<RoleEntryMemory[]> => this.listRoleMemories(actorKey),
                listSummarySnapshots: async (limit?: number): Promise<SummarySnapshot[]> => this.listSummarySnapshots(limit),
                getWorldProfileBinding: async (): Promise<WorldProfileBinding | null> => this.getWorldProfileBinding(),
                appendMutationHistory: async (history): Promise<void> => this.appendMutationHistory(history),
                getEntry: async (entryId: string): Promise<MemoryEntry | null> => this.getEntry(entryId),
                applySummarySnapshot: async (summaryInput): Promise<SummarySnapshot> => this.applySummarySnapshot(summaryInput),
                deleteEntry: async (
                    entryId: string,
                    options?: {
                        actionType?: 'DELETE';
                        summaryId?: string;
                        sourceLabel?: string;
                        reasonCodes?: string[];
                    },
                ): Promise<void> => this.deleteEntry(entryId, options),
            },
            llm,
            pluginId: MEMORY_OS_PLUGIN_ID,
            messages: normalizedMessages,
            enableEmbedding: settings.enableEmbedding === true,
            retrievalRulePack: settings.retrievalRulePack,
        });
        return summaryResult.snapshot;

        /* legacy fallback removed:
        const messages = Array.isArray(input.messages)
            ? input.messages.filter((item: { role?: string }): boolean => this.normalizeText(item.role) !== 'system').slice(-8)
            : [];
        if (messages.length <= 0) {
            return null;
        }
        for (const actorHint of Array.isArray(input.actorHints) ? input.actorHints : []) {
            await this.ensureActorProfile(actorHint);
        }
        const content = messages
            .map((item: { role?: string; content?: string; name?: string }, index: number): string => {
                const speaker = this.normalizeText(item.name) || this.normalizeText(item.role) || `消息${index + 1}`;
                return `${speaker}：${this.normalizeText(item.content)}`;
            })
            .join('\n');
        const actorProfiles = await this.listActorProfiles();
        const normalizedContent = content.toLowerCase();
        const actorKeys = actorProfiles
            .filter((profile: ActorMemoryProfile): boolean => {
                return [profile.actorKey, profile.displayName]
                    .map((item: string): string => item.toLowerCase())
                    .some((item: string): boolean => Boolean(item) && normalizedContent.includes(item));
            })
            .map((profile: ActorMemoryProfile): string => profile.actorKey);
        const refreshBindings: SummaryRefreshBinding[] = [];
        const entries = await this.listEntries();
        entries.forEach((entry: MemoryEntry): void => {
            const texts = this.collectEntryLookupTexts(entry);
            if (!texts.some((text: string): boolean => normalizedContent.includes(text))) {
                return;
            }
            actorKeys.forEach((actorKey: string): void => {
                refreshBindings.push({ actorKey, entryId: entry.entryId });
            });
        });
        return this.applySummarySnapshot({
            title: input.title || '自动回合总结',
            content,
            actorKeys,
            refreshBindings,
        });
        */
    }

    /**
     * 功能：构建统一提示词快照。
     * @param input 构建输入。
     * @returns 提示词快照。
     */
    async buildPromptAssembly(input: {
        query?: string;
        promptMessages?: SdkTavernPromptMessageEvent[];
        maxTokens?: number;
    }): Promise<PromptAssemblySnapshot> {
        const settings = readMemoryOSSettings();
        const query = this.normalizeText(input.query);
        const promptText = (input.promptMessages ?? [])
            .map((message: SdkTavernPromptMessageEvent): string => this.readPromptText(message))
            .join('\n')
            .toLowerCase();
        const [typeMap, entries, actorProfiles, worldBinding, roleRows] = await Promise.all([
            this.getEntryTypeMap(),
            this.listEntries(),
            this.listActorProfiles(),
            this.getWorldProfileBinding(),
            db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray(),
        ]);
        const retrievalCandidates = this.buildPromptRetrievalCandidates(entries, roleRows, actorProfiles);
        const retrievalQueryText = query || promptText || '当前对话';
        const retrievalResult = await promptRetrievalOrchestrator.retrieve(
            {
                query: retrievalQueryText,
                enableEmbedding: settings.enableEmbedding === true,
                chatKey: this.chatKey,
                rulePackMode: settings.retrievalRulePack,
                budget: {
                    maxCandidates: 18,
                    maxChars: Math.max(2600, Number(input.maxTokens ?? settings.contextMaxTokens) * 4),
                },
            },
            retrievalCandidates,
            {
                actorProfiles: actorProfiles.map((profile: ActorMemoryProfile) => ({
                    actorKey: profile.actorKey,
                    displayName: profile.displayName,
                    aliases: this.collectActorProfileAliases(entries, profile.actorKey),
                })),
            },
        );

        const matchedEntryIdSet = new Set(retrievalResult.items.map((item) => item.candidate.entryId));
        const selectedEntries = matchedEntryIdSet.size > 0
            ? entries.filter((entry: MemoryEntry): boolean => matchedEntryIdSet.has(entry.entryId))
            : entries.filter((entry: MemoryEntry): boolean => typeMap.get(entry.entryType)?.injectToSystem === true).slice(0, 8);
        const matchedActorKeys = this.resolvePromptMatchedActorKeys(
            retrievalResult.contextRoute?.entityAnchors.actorKeys ?? [],
            retrievalResult.items.map((item) => item.candidate),
            actorProfiles,
        );
        const effectiveActorKey = matchedActorKeys[0] || 'user';
        const actorMap = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, ActorMemoryProfile] => [profile.actorKey, profile]));
        const entryMap = new Map(entries.map((entry: MemoryEntry): [string, MemoryEntry] => [entry.entryId, entry]));
        const roleEntries: PromptAssemblyRoleEntry[] = [];
        for (const row of roleRows) {
            if (!matchedActorKeys.includes(row.actorKey) || !matchedEntryIdSet.has(row.entryId)) {
                continue;
            }
            const entry = entryMap.get(row.entryId);
            if (!entry) {
                continue;
            }
            const forgotten = this.shouldForget(row, retrievalQueryText);
            roleEntries.push({
                actorKey: row.actorKey,
                actorLabel: actorMap.get(row.actorKey)?.displayName || row.actorKey,
                entryId: entry.entryId,
                title: entry.title,
                entryType: entry.entryType,
                memoryPercent: row.memoryPercent,
                forgotten,
                renderedText: forgotten
                    ? `${entry.title}：内容已遗忘`
                    : `${entry.title}：${entry.summary || entry.detail || '暂无详情'}`,
            });
        }

        const worldDetection = worldBinding?.primaryProfile
            ? {
                primaryProfile: worldBinding.primaryProfile,
                secondaryProfiles: worldBinding.secondaryProfiles,
                confidence: worldBinding.confidence,
                reasonCodes: worldBinding.reasonCodes,
            }
            : detectWorldProfile({
                texts: [
                    retrievalQueryText,
                    promptText,
                    ...selectedEntries.slice(0, 40).map((entry: MemoryEntry): string => `${entry.title} ${entry.summary}`),
                ],
            });
        const worldProfile = resolveWorldProfile(worldDetection);
        const visibleContext = buildActorVisibleMemoryContext({
            entries: selectedEntries,
            roleEntries,
            activeActorKey: effectiveActorKey,
        });

        recordMemoryDebug(this.chatKey, {
            ts: Date.now(),
            level: 'info',
            stage: 'injection',
            title: '开始构建',
            message: '开始构建注入上下文。',
            payload: {
                actorKey: effectiveActorKey,
                matchedEntryCount: selectedEntries.length,
            },
        });
        recordMemoryDebug(this.chatKey, {
            ts: Date.now(),
            level: 'info',
            stage: 'injection',
            title: '注入视角',
            message: `当前注入视角角色：${effectiveActorKey}。`,
            payload: {
                actorKey: effectiveActorKey,
            },
        });

        const xmlNarrative = renderMemoryContextXmlMarkdown(visibleContext, worldProfile.primary.injectionStyle, {
            worldBaseChars: 900,
            sceneSharedChars: 700,
            actorViewChars: 1400,
            totalChars: 2600,
        });
        const systemText = this.trimTextToBudget(xmlNarrative, input.maxTokens ?? 1400);

        recordMemoryDebug(this.chatKey, {
            ts: Date.now(),
            level: 'info',
            stage: 'injection',
            title: '注入统计',
            message: `本轮共注入 ${visibleContext.diagnostics.totalInjectedCount} 条记忆，预计上下文占用约 ${visibleContext.diagnostics.estimatedChars} 字。`,
            payload: {
                injectedCount: visibleContext.diagnostics.totalInjectedCount,
                estimatedChars: visibleContext.diagnostics.estimatedChars,
                retentionStageCounts: visibleContext.diagnostics.retentionStageCounts,
            },
        });
        recordMemoryDebug(this.chatKey, {
            ts: Date.now(),
            level: 'info',
            stage: 'injection',
            title: '注入层级',
            message: '注入内容包含 clear / blur / distorted 三种记忆呈现层级。',
            payload: {
                retentionStageCounts: visibleContext.diagnostics.retentionStageCounts,
            },
        });

        const snapshot: PromptAssemblySnapshot = {
            generatedAt: Date.now(),
            query,
            matchedActorKeys,
            matchedEntryIds: selectedEntries.map((entry: MemoryEntry): string => entry.entryId),
            systemText,
            roleText: '',
            finalText: systemText,
            systemEntryIds: selectedEntries
                .filter((entry: MemoryEntry): boolean => typeMap.get(entry.entryType)?.injectToSystem === true)
                .map((entry: MemoryEntry): string => entry.entryId),
            roleEntries,
            reasonCodes: [
                'prompt:unified_memory',
                'prompt:xml_markdown_renderer',
                `world_profile:${worldProfile.primary.worldProfileId}`,
                `retrieval_provider:${retrievalResult.providerId || 'none'}`,
                `retrieval_rule_pack:${settings.retrievalRulePack}`,
                systemText ? 'prompt:system_base_present' : 'prompt:system_base_empty',
            ],
            diagnostics: {
                providerId: retrievalResult.providerId,
                rulePackMode: settings.retrievalRulePack,
                contextRoute: retrievalResult.contextRoute,
                retrieval: retrievalResult.diagnostics ?? null,
                traceRecords: getMemoryTrace(this.chatKey),
                injectionActorKey: effectiveActorKey,
                injectedCount: visibleContext.diagnostics.totalInjectedCount,
                estimatedChars: visibleContext.diagnostics.estimatedChars,
                retentionStageCounts: visibleContext.diagnostics.retentionStageCounts,
            },
        };
        await this.appendMutationHistory({
            action: 'injection_context_built',
            payload: {
                worldProfile: worldProfile.primary.worldProfileId,
                actorKey: effectiveActorKey,
                matchedEntryCount: snapshot.matchedEntryIds.length,
                retrievalProviderId: retrievalResult.providerId,
                retrievalRulePack: settings.retrievalRulePack,
                reasonCodes: snapshot.reasonCodes,
            },
        });
        return snapshot;
    }

    /**
     * 功能：收集指定角色画像条目的别名列表。
     * @param entries 全量条目。
     * @param actorKey 角色键。
     * @returns 别名列表。
     */
    private collectActorProfileAliases(entries: MemoryEntry[], actorKey: string): string[] {
        const aliases = new Set<string>();
        entries
            .filter((entry: MemoryEntry): boolean => entry.entryType === 'actor_profile')
            .forEach((entry: MemoryEntry): void => {
                const payload = this.normalizeRecord(entry.detailPayload);
                const fields = this.normalizeRecord(payload.fields);
                const boundActorKey = this.normalizeActorKey(payload.actorKey ?? fields.actorKey ?? entry.title);
                if (boundActorKey !== this.normalizeActorKey(actorKey)) {
                    return;
                }
                aliases.add(entry.title);
                this.normalizeLooseStringArray(fields.aliases ?? payload.aliases).forEach((alias: string): void => {
                    aliases.add(alias);
                });
            });
        return [...aliases].filter(Boolean);
    }

    /**
     * 功能：把条目映射为检索候选，补充结构化锚点信息。
     * @param entries 条目列表。
     * @param roleRows 角色记忆绑定。
     * @param actorProfiles 角色资料。
     * @returns 检索候选列表。
     */
    private buildPromptRetrievalCandidates(
        entries: MemoryEntry[],
        roleRows: DBRoleEntryMemory[],
        actorProfiles: ActorMemoryProfile[],
    ): RetrievalCandidate[] {
        const boundActorMap = new Map<string, string[]>();
        const memoryPercentMap = new Map<string, number>();
        roleRows.forEach((row: DBRoleEntryMemory): void => {
            if (row.forgotten) {
                return;
            }
            const list = boundActorMap.get(row.entryId) ?? [];
            if (!list.includes(row.actorKey)) {
                list.push(row.actorKey);
            }
            boundActorMap.set(row.entryId, list);
            memoryPercentMap.set(row.entryId, Math.max(memoryPercentMap.get(row.entryId) ?? 0, row.memoryPercent));
        });
        const actorDisplayNameMap = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, string] => [profile.actorKey, profile.displayName]));
        const actorKeyByDisplayName = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, string] => [profile.displayName, profile.actorKey]));

        return entries.map((entry: MemoryEntry): RetrievalCandidate => {
            const payload = this.normalizeRecord(entry.detailPayload);
            const fields = this.normalizeRecord(payload.fields);
            const sourceActorKey = this.normalizeActorKey(payload.sourceActorKey ?? fields.sourceActorKey);
            const targetActorKey = this.normalizeActorKey(payload.targetActorKey ?? fields.targetActorKey);
            const participantNames = this.normalizeLooseStringArray(payload.participants ?? fields.participants);
            const boundActorKeys = boundActorMap.get(entry.entryId) ?? [];
            const actorKeys = Array.from(new Set([
                ...boundActorKeys,
                ...[sourceActorKey, targetActorKey].filter(Boolean),
            ]));
            const participantActorKeys = participantNames
                .map((name: string): string => actorKeyByDisplayName.get(name) ?? '')
                .filter(Boolean);
            const relationKeys = Array.from(new Set([
                ...this.normalizeLooseStringArray(payload.relationKeys ?? fields.relationKeys),
                ...(sourceActorKey && targetActorKey ? [`relationship:${sourceActorKey}:${targetActorKey}`] : []),
                ...this.normalizeLooseStringArray(fields.relationTag ?? payload.relationTag),
            ]));
            const locationKey = this.normalizeText(payload.locationKey ?? fields.locationKey ?? payload.location ?? fields.location);
            const worldKeys = Array.from(new Set([
                ...this.normalizeLooseStringArray(payload.worldKeys ?? fields.worldKeys),
                ...(entry.entryType.startsWith('world_') ? [entry.title] : []),
            ]));
            const aliasTexts = Array.from(new Set([
                ...actorKeys.map((actorKey: string): string => actorDisplayNameMap.get(actorKey) ?? ''),
                ...participantNames,
                ...this.normalizeLooseStringArray(payload.aliases ?? fields.aliases),
                ...entry.tags,
            ])).filter(Boolean);
            return {
                candidateId: `prompt:${entry.entryId}`,
                entryId: entry.entryId,
                schemaId: entry.entryType,
                title: entry.title,
                summary: entry.summary || entry.detail,
                updatedAt: entry.updatedAt,
                memoryPercent: memoryPercentMap.get(entry.entryId) ?? (entry.entryType.startsWith('world_') ? 88 : 60),
                category: String(entry.category ?? ''),
                tags: entry.tags,
                sourceSummaryIds: entry.sourceSummaryIds,
                actorKeys,
                relationKeys,
                participantActorKeys: Array.from(new Set([...participantActorKeys, ...boundActorKeys])),
                locationKey: locationKey || undefined,
                worldKeys,
                compareKey: `${entry.entryType}:${entry.title}`,
                injectToSystem: entry.entryType.startsWith('world_') || entry.entryType === 'scene_shared_state' || entry.entryType === 'location',
                aliasTexts,
            };
        });
    }

    /**
     * 功能：解析本轮真正命中的角色键。
     * @param anchorActorKeys 语境路由命中的角色。
     * @param candidates 命中的候选列表。
     * @param actorProfiles 全量角色资料。
     * @returns 角色键列表。
     */
    private resolvePromptMatchedActorKeys(
        anchorActorKeys: string[],
        candidates: RetrievalCandidate[],
        actorProfiles: ActorMemoryProfile[],
    ): string[] {
        const matchedActorKeys = Array.from(new Set([
            ...anchorActorKeys,
            ...candidates.flatMap((candidate: RetrievalCandidate): string[] => candidate.actorKeys ?? []),
            ...candidates.flatMap((candidate: RetrievalCandidate): string[] => candidate.participantActorKeys ?? []),
        ])).filter(Boolean);
        if (matchedActorKeys.length > 0) {
            return matchedActorKeys;
        }
        return actorProfiles.slice(0, 3).map((profile: ActorMemoryProfile): string => profile.actorKey);
    }

    /**
     * 功能：把未知值解析为宽松字符串数组。
     * @param value 原始值。
     * @returns 字符串数组。
     */
    private normalizeLooseStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean);
        }
        const text = this.normalizeText(value);
        if (!text) {
            return [];
        }
        return text
            .split(/[,，、\n]+/)
            .map((item: string): string => this.normalizeText(item))
            .filter(Boolean);
    }

    /**
     * 功能：读取最近总结快照。
     * @param limit 数量。
     * @returns 总结快照列表。
     */
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
     * 功能：确保核心类型存在。
     * @returns 初始化 Promise。
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
     * 功能：确保默认用户角色卡条目存在，并为后续 AI 复用提供稳定锚点。
     * @returns 初始化结果。
     */
    private async ensureDefaultUserActorCard(): Promise<void> {
        const actorKey = 'user';
        const displayName = this.resolveUserActorDisplayName();
        const userSnapshot = getCurrentTavernUserSnapshotEvent();
        const identityFacts = this.normalizeTags([
            userSnapshot?.personaDescription,
            userSnapshot?.metadataPersona,
        ]);
        const existingEntry = await this.findBoundActorProfileEntry(actorKey);
        if (existingEntry) {
            const normalizedExistingTitle = this.normalizeText(existingEntry.title);
            const shouldRefreshTitle = !normalizedExistingTitle || normalizedExistingTitle === '用户' || normalizedExistingTitle !== displayName;
            const shouldRefreshSummary = !this.normalizeText(existingEntry.summary);
            if (!shouldRefreshTitle && !shouldRefreshSummary) {
                return;
            }
            await this.saveEntry({
                entryId: existingEntry.entryId,
                title: shouldRefreshTitle ? displayName : existingEntry.title,
                entryType: existingEntry.entryType,
                category: existingEntry.category,
                tags: existingEntry.tags,
                summary: shouldRefreshSummary
                    ? (identityFacts.join('；') || `${displayName}的默认用户角色卡`)
                    : existingEntry.summary,
                detail: existingEntry.detail,
                detailPayload: existingEntry.detailPayload,
                sourceSummaryIds: existingEntry.sourceSummaryIds,
            });
            return;
        }

        const savedEntry = await this.saveEntry({
            title: displayName,
            entryType: 'actor_profile',
            category: '角色关系',
            tags: ['system', 'user_profile'],
            summary: identityFacts.join('；') || `${displayName}的默认用户角色卡`,
            detailPayload: {
                fields: {
                    aliases: [],
                    identityFacts,
                    originFacts: [],
                    traits: [],
                },
            },
        });
        await this.bindRoleToEntry(actorKey, savedEntry.entryId);
    }

    /**
     * 功能：读取并回退条目类型。
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
     * 功能：构建类型映射。
     * @returns 类型映射。
     */
    private async getEntryTypeMap(): Promise<Map<string, MemoryEntryType>> {
        const items = await this.listEntryTypes();
        return new Map(items.map((item: MemoryEntryType): [string, MemoryEntryType] => [item.key, item]));
    }

    /**
     * 功能：按键查找类型。
     * @param key 类型键。
     * @returns 原始类型行。
     */
    private async findEntryTypeByKey(key: string): Promise<DBMemoryEntryType | null> {
        const rows = await db.memory_entry_types.where('[chatKey+key]').equals([this.chatKey, this.normalizeKey(key)]).toArray();
        return rows[0] ?? null;
    }

    /**
     * 功能：查找角色记忆绑定。
     * @param actorKey 角色键。
     * @param entryId 条目 ID。
     * @returns 绑定行。
     */
    private async findRoleEntryMemory(actorKey: string, entryId: string): Promise<DBRoleEntryMemory | null> {
        const rows = await db.role_entry_memory
            .where('[chatKey+actorKey+entryId]')
            .equals([this.chatKey, actorKey, entryId] as [string, string, string])
            .toArray();
        return rows[0] ?? null;
    }

    /**
     * 功能：查找指定角色当前已绑定的角色卡条目。
     * @param actorKey 角色键。
     * @returns 已绑定的角色卡条目；不存在时返回 null。
     */
    private async findBoundActorProfileEntry(actorKey: string): Promise<MemoryEntry | null> {
        const normalizedActorKey = this.normalizeActorKey(actorKey);
        const memories = await db.role_entry_memory.where('[chatKey+actorKey]').equals([this.chatKey, normalizedActorKey]).toArray();
        if (memories.length <= 0) {
            return null;
        }
        const entryIds = memories.map((row: DBRoleEntryMemory): string => row.entryId);
        const rows = await db.memory_entries.bulkGet(entryIds);
        for (const row of rows) {
            if (!row || row.chatKey !== this.chatKey || row.entryType !== 'actor_profile') {
                continue;
            }
            return this.mapEntry(row);
        }
        return null;
    }

    /**
     * 功能：解析总结刷新目标。
     * @param bindings 刷新绑定。
     * @param savedEntries 本次已保存条目。
     * @returns 刷新目标列表。
     */
    private async resolveRefreshTargets(
        bindings: SummaryRefreshBinding[],
        savedEntries: MemoryEntry[],
    ): Promise<Array<{ actorKey: string; entryId: string }>> {
        const titleMap = new Map<string, string>();
        (await this.listEntries()).forEach((entry: MemoryEntry): void => {
            titleMap.set(entry.title, entry.entryId);
        });
        savedEntries.forEach((entry: MemoryEntry): void => {
            titleMap.set(entry.title, entry.entryId);
        });
        return bindings
            .map((binding: SummaryRefreshBinding): { actorKey: string; entryId: string } | null => {
                const actorKey = this.normalizeActorKey(binding.actorKey);
                const entryId = String(binding.entryId ?? '').trim() || String(titleMap.get(this.normalizeText(binding.entryTitle)) ?? '').trim();
                if (!actorKey || !entryId) {
                    return null;
                }
                return { actorKey, entryId };
            })
            .filter(Boolean) as Array<{ actorKey: string; entryId: string }>;
    }

    /**
     * 功能：计算条目搜索文本。
     * @param entry 条目。
     * @returns 搜索文本。
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
     * 功能：从自然语言问题中提取更适合条目检索的查询词。
     * @param query 原始问题。
     * @returns 适合匹配条目的查询词列表。
     */
    private extractQueryTerms(query: string): string[] {
        const normalized = this.normalizeText(query).toLowerCase();
        if (!normalized) {
            return [];
        }
        let stripped = normalized;
        UnifiedMemoryManager.QUERY_STOP_PHRASES.forEach((phrase: string): void => {
            if (!phrase) {
                return;
            }
            stripped = stripped.split(phrase).join(' ');
        });
        const terms = Array.from(new Set(
            stripped
                .split(/[\s,，。！？；：:、()（）【】\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
                .map((item: string): string => item.trim())
                .filter((item: string): boolean => item.length >= 2),
        ));
        if (terms.length > 0) {
            return terms.slice(0, 12);
        }
        const compact = stripped.replace(/\s+/g, '').trim();
        return compact.length >= 2 ? [compact] : [];
    }

    /**
     * 功能：收集条目关键词。
     * @param entry 条目。
     * @returns 关键词列表。
     */
    private collectEntryLookupTexts(entry: MemoryEntry): string[] {
        return [entry.title, entry.summary, ...entry.tags]
            .map((text: string): string => this.normalizeText(text).toLowerCase())
            .filter((text: string): boolean => text.length > 1);
    }

    /**
     * 功能：判断条目是否命中查询。
     * @param entry 条目。
     * @param queryTerms 查询词列表。
     * @returns 是否命中。
     */
    private isEntryMatched(entry: MemoryEntry, queryTerms: string[]): boolean {
        if (queryTerms.length <= 0) {
            return true;
        }
        const searchText = this.computeEntrySearchText(entry);
        return queryTerms.some((term: string): boolean => searchText.includes(term));
    }

    /**
     * 功能：渲染 system 基础设定文本。
     * @param entries 条目列表。
     * @param typeMap 类型映射。
     * @returns 渲染文本。
     */
    private renderSystemText(entries: MemoryEntry[], typeMap: Map<string, MemoryEntryType>): string {
        if (entries.length <= 0) {
            return '';
        }
        const grouped = new Map<string, MemoryEntry[]>();
        entries.forEach((entry: MemoryEntry): void => {
            const label = typeMap.get(entry.entryType)?.label || entry.entryType || '其他';
            const bucket = grouped.get(label) ?? [];
            bucket.push(entry);
            grouped.set(label, bucket);
        });
        return ['[MemoryOS 基础设定]', ...Array.from(grouped.entries()).map(([label, items]: [string, MemoryEntry[]]): string => {
            return `## ${label}\n${items
                .sort((left: MemoryEntry, right: MemoryEntry): number => right.updatedAt - left.updatedAt)
                .map((item: MemoryEntry): string => `- ${item.title}：${item.summary || item.detail || '暂无详情'}`)
                .join('\n')}`;
        })].join('\n\n').trim();
    }

    /**
     * 功能：渲染角色记忆文本。
     * @param roleEntries 角色记忆。
     * @returns 渲染文本。
     */
    private renderRoleText(roleEntries: PromptAssemblyRoleEntry[]): string {
        if (roleEntries.length <= 0) {
            return '';
        }
        const grouped = new Map<string, PromptAssemblyRoleEntry[]>();
        roleEntries.forEach((entry: PromptAssemblyRoleEntry): void => {
            const bucket = grouped.get(entry.actorLabel) ?? [];
            bucket.push(entry);
            grouped.set(entry.actorLabel, bucket);
        });
        return ['[MemoryOS 角色记忆]', ...Array.from(grouped.entries()).map(([actorLabel, items]: [string, PromptAssemblyRoleEntry[]]): string => {
            return `## ${actorLabel}\n${items
                .sort((left: PromptAssemblyRoleEntry, right: PromptAssemblyRoleEntry): number => right.memoryPercent - left.memoryPercent)
                .map((item: PromptAssemblyRoleEntry): string => `- ${item.renderedText}（记忆度 ${item.memoryPercent}%）`)
                .join('\n')}`;
        })].join('\n\n').trim();
    }

    /**
     * 功能：按预算裁剪文本。
     * @param text 文本。
     * @param maxTokens 最大预算。
     * @returns 裁剪后的文本。
     */
    private trimTextToBudget(text: string, maxTokens: number): string {
        const normalized = this.normalizeText(text);
        if (!normalized) {
            return '';
        }
        const maxChars = Math.max(240, (Number(maxTokens ?? 1200) || 1200) * 2);
        if (text.length <= maxChars) {
            return text;
        }
        const kept = text.slice(0, maxChars);
        const trimmedIndex = kept.lastIndexOf('\n');
        return `${trimmedIndex > 0 ? kept.slice(0, trimmedIndex) : kept}\n- 其余内容因预算已省略`;
    }

    /**
     * 功能：根据记忆度执行确定性遗忘判定。
     * @param row 角色记忆。
     * @param salt 轮次盐值。
     * @returns 是否遗忘。
     */
    private shouldForget(row: DBRoleEntryMemory, salt: string): boolean {
        if (row.forgotten || row.memoryPercent <= 0) {
            return true;
        }
        const seed = `${row.actorKey}|${row.entryId}|${this.normalizeText(salt)}`;
        let hash = 0;
        for (let index = 0; index < seed.length; index += 1) {
            hash = ((hash << 5) - hash) + seed.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash % 100) >= this.clampPercent(row.memoryPercent);
    }

    /**
     * 功能：根据角色记性值计算衰减值。
     * @param memoryStat 记性值。
     * @returns 衰减值。
     */
    private resolveDecayValue(memoryStat: number): number {
        return Math.max(4, Math.round((100 - this.clampPercent(memoryStat)) / 8));
    }

    /**
     * 功能：读取 prompt 消息文本。
     * @param message prompt 消息。
     * @returns 文本。
     */
    private readPromptText(message: SdkTavernPromptMessageEvent): string {
        const record = message as Record<string, unknown>;
        return this.normalizeText(record.content ?? record.mes ?? record.text ?? '');
    }

    /**
     * 功能：映射条目类型。
     * @param row 原始行。
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
     * @param row 原始行。
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
     * @param row 原始行。
     * @returns 角色资料。
     */
    private mapActorProfile(row: DBActorMemoryProfile): ActorMemoryProfile {
        const actorKey = this.normalizeActorKey(row.actorKey);
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
     * 功能：映射角色记忆。
     * @param row 原始行。
     * @returns 角色记忆。
     */
    private mapRoleMemory(row: DBRoleEntryMemory): RoleEntryMemory {
        return {
            ...row,
            actorKey: this.normalizeActorKey(row.actorKey),
            memoryPercent: this.clampPercent(row.memoryPercent),
            forgotten: Boolean(row.forgotten),
        };
    }

    /**
     * 功能：映射总结快照。
     * @param row 原始行。
     * @returns 总结快照。
     */
    private mapSummarySnapshot(row: DBSummarySnapshot): SummarySnapshot {
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
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    /**
     * 功能：映射记忆变更历史记录。
     * @param row 原始行。
     * @returns 业务层记录。
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
     * 功能：归一化类型字段。
     * @param fields 原始字段。
     * @returns 字段数组。
     */
    /**
     * 功能：写入单条词条审计记录。
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
            changedFields: this.buildEntryFieldDiffs(input.beforeEntry, input.afterEntry).map((item): {
                path: string;
                label: string;
                before: unknown;
                after: unknown;
            } => ({
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
     * 功能：将词条快照转成审计可存储结构。
     * @param entry 词条。
     * @returns 可序列化快照。
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
     * 功能：计算词条更新前后的字段差异。
     * @param beforeEntry 更新前词条。
     * @param afterEntry 更新后词条。
     * @returns 变化字段列表。
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
     * 功能：将词条拉平成路径映射，便于比较差异。
     * @param entry 词条。
     * @returns 扁平字段映射。
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
     * 功能：递归展开对象字段用于差异比较。
     * @param out 输出映射。
     * @param path 当前字段路径。
     * @param value 字段值。
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
     * 功能：比较两个审计值是否相同。
     * @param left 左值。
     * @param right 右值。
     * @returns 是否相同。
     */
    private isAuditValueEqual(left: unknown, right: unknown): boolean {
        return JSON.stringify(this.deepCloneValue(left)) === JSON.stringify(this.deepCloneValue(right));
    }

    /**
     * 功能：深拷贝审计值，避免后续渲染误改引用。
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
     * 功能：将字段路径转成便于阅读的中文标签。
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
     * 功能：映射词条审计记录。
     * @param row 数据库行。
     * @returns 业务审计记录。
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
     * 功能：将审计快照还原成词条对象。
     * @param value 原始快照。
     * @returns 词条对象。
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
     * 功能：归一化记录对象。
     * @param value 原始值。
     * @returns 记录对象。
     */
    private normalizeRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：归一化标签数组。
     * @param values 原始值。
     * @returns 标签数组。
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
        return this.normalizeText(value).toLowerCase().replace(/[^a-z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
    }

    /**
     * 功能：归一化角色键。
     * @param value 原始值。
     * @returns 角色键。
     */
    private normalizeActorKey(value: unknown): string {
        return this.normalizeKey(value) || 'actor';
    }

    /**
     * 功能：解析当前酒馆用户在用户角色卡中应显示的名称。
     * @returns 用户显示名称。
     */
    private resolveUserActorDisplayName(): string {
        return this.normalizeText(getCurrentTavernUserNameEvent(undefined, '用户')) || '用户';
    }

    /**
     * 功能：限制百分比取值。
     * @param value 原始值。
     * @returns 百分比值。
     */
    private clampPercent(value: number): number {
        const numericValue = Number(value);
        if (!Number.isFinite(numericValue)) {
            return 0;
        }
        return Math.max(0, Math.min(100, Math.round(numericValue)));
    }
}
