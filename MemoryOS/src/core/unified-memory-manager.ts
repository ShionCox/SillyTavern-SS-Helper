import { db } from '../db/db';
import type {
    DBActorMemoryProfile,
    DBMemoryMutationHistory,
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
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { detectWorldProfile, resolveWorldProfile, getWorldProfileBinding, putWorldProfileBinding, deleteWorldProfileBinding } from '../memory-world-profile';
import { buildActorVisibleMemoryContext, renderMemoryContextXmlMarkdown } from '../memory-injection';

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
    async saveEntry(input: Partial<MemoryEntry> & { title: string; entryType: string }): Promise<MemoryEntry> {
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
        return this.mapEntry(row);
    }

    /**
     * 功能：删除条目及相关角色记忆。
     * @param entryId 条目 ID。
     * @returns 删除完成后的 Promise。
     */
    async deleteEntry(entryId: string): Promise<void> {
        const normalizedEntryId = String(entryId ?? '').trim();
        const memories = await db.role_entry_memory.where('[chatKey+entryId]').equals([this.chatKey, normalizedEntryId]).toArray();
        if (memories.length > 0) {
            await db.role_entry_memory.bulkDelete(memories.map((row: DBRoleEntryMemory): string => row.roleMemoryId));
        }
        await db.memory_entries.delete(normalizedEntryId);
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
            ? input.messages.filter((item: { role?: string }): boolean => this.normalizeText(item.role) !== 'system').slice(-10)
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
                getWorldProfileBinding: async (): Promise<WorldProfileBinding | null> => this.getWorldProfileBinding(),
                appendMutationHistory: async (history): Promise<void> => this.appendMutationHistory(history),
                getEntry: async (entryId: string): Promise<MemoryEntry | null> => this.getEntry(entryId),
                applySummarySnapshot: async (summaryInput): Promise<SummarySnapshot> => this.applySummarySnapshot(summaryInput),
                deleteEntry: async (entryId: string): Promise<void> => this.deleteEntry(entryId),
            },
            llm,
            pluginId: MEMORY_OS_PLUGIN_ID,
            messages: normalizedMessages,
            enableEmbedding: settings.enableEmbedding === true,
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
        {
        const query = this.normalizeText(input.query);
        const promptText = (input.promptMessages ?? [])
            .map((message: SdkTavernPromptMessageEvent): string => this.readPromptText(message))
            .join('\n')
            .toLowerCase();
        const queryTerms = this.extractQueryTerms(query);
        const typeMap = await this.getEntryTypeMap();
        const entries = await this.listEntries();
        const actorProfiles = await this.listActorProfiles();
        const matchedActorKeys = actorProfiles
            .filter((profile: ActorMemoryProfile): boolean => {
                if (!query && !promptText) {
                    return true;
                }
                return [profile.actorKey, profile.displayName]
                    .map((text: string): string => text.toLowerCase())
                    .some((text: string): boolean => Boolean(text) && (
                        promptText.includes(text)
                        || queryTerms.some((term: string): boolean => term.includes(text) || text.includes(term))
                    ));
            })
            .map((profile: ActorMemoryProfile): string => profile.actorKey);
        const effectiveActorKeys = matchedActorKeys.length > 0
            ? matchedActorKeys
            : actorProfiles.slice(0, 3).map((profile: ActorMemoryProfile): string => profile.actorKey);
        const actorMap = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, ActorMemoryProfile] => [profile.actorKey, profile]));
        const entryMap = new Map(entries.map((entry: MemoryEntry): [string, MemoryEntry] => [entry.entryId, entry]));
        const roleRows = await db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray();
        const roleEntries: PromptAssemblyRoleEntry[] = [];
        const matchedEntryIds = new Set<string>();
        for (const row of roleRows) {
            if (!effectiveActorKeys.includes(row.actorKey)) {
                continue;
            }
            const entry = entryMap.get(row.entryId);
            if (!entry) {
                continue;
            }
            if (query && !this.isEntryMatched(entry, queryTerms)) {
                continue;
            }
            const forgotten = this.shouldForget(row, query || promptText);
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
            matchedEntryIds.add(entry.entryId);
        }

        const worldBinding = await this.getWorldProfileBinding();
        const worldDetection = worldBinding?.primaryProfile
            ? {
                primaryProfile: worldBinding.primaryProfile,
                secondaryProfiles: worldBinding.secondaryProfiles,
                confidence: worldBinding.confidence,
                reasonCodes: worldBinding.reasonCodes,
            }
            : detectWorldProfile({
                texts: [
                    query,
                    promptText,
                    ...entries.slice(0, 40).map((entry: MemoryEntry): string => `${entry.title} ${entry.summary}`),
                ],
            });
        const worldProfile = resolveWorldProfile(worldDetection);
        const visibleContext = buildActorVisibleMemoryContext({
            entries,
            roleEntries,
            activeActorKey: effectiveActorKeys[0],
        });
        const xmlNarrative = renderMemoryContextXmlMarkdown(visibleContext, worldProfile.primary.injectionStyle, {
            worldBaseChars: 900,
            sceneSharedChars: 700,
            actorViewChars: 1400,
            totalChars: 2600,
        });
        const systemText = this.trimTextToBudget(xmlNarrative, input.maxTokens ?? 1400);
        const snapshot: PromptAssemblySnapshot = {
            generatedAt: Date.now(),
            query,
            matchedActorKeys: effectiveActorKeys,
            matchedEntryIds: Array.from(matchedEntryIds),
            systemText,
            roleText: '',
            finalText: systemText,
            systemEntryIds: entries
                .filter((entry: MemoryEntry): boolean => typeMap.get(entry.entryType)?.injectToSystem === true)
                .map((entry: MemoryEntry): string => entry.entryId),
            roleEntries,
            reasonCodes: [
                'prompt:unified_memory',
                'prompt:xml_markdown_renderer',
                `world_profile:${worldProfile.primary.worldProfileId}`,
                systemText ? 'prompt:system_base_present' : 'prompt:system_base_empty',
            ],
        };
        await this.appendMutationHistory({
            action: 'injection_context_built',
            payload: {
                worldProfile: worldProfile.primary.worldProfileId,
                actorKey: effectiveActorKeys[0] || 'actor',
                matchedEntryCount: snapshot.matchedEntryIds.length,
                reasonCodes: snapshot.reasonCodes,
            },
        });
        return snapshot;
        }

        /* legacy prompt assembly branch removed:
        const query = this.normalizeText(input.query);
        const queryTerms = this.extractQueryTerms(query);
        const promptText = (input.promptMessages ?? [])
            .map((message: SdkTavernPromptMessageEvent): string => this.readPromptText(message))
            .join('\n')
            .toLowerCase();
        const typeMap = await this.getEntryTypeMap();
        const entries = await this.listEntries();
        const systemEntries = entries.filter((entry: MemoryEntry): boolean => typeMap.get(entry.entryType)?.injectToSystem === true);
        const actorProfiles = await this.listActorProfiles();
        const matchedActorKeys = actorProfiles
            .filter((profile: ActorMemoryProfile): boolean => {
                if (!query && !promptText) {
                    return true;
                }
                return [profile.actorKey, profile.displayName]
                    .map((text: string): string => text.toLowerCase())
                    .some((text: string): boolean => Boolean(text) && (
                        promptText.includes(text)
                        || queryTerms.some((term: string): boolean => term.includes(text) || text.includes(term))
                    ));
            })
            .map((profile: ActorMemoryProfile): string => profile.actorKey);
        const effectiveActorKeys = matchedActorKeys.length > 0
            ? matchedActorKeys
            : actorProfiles.slice(0, 3).map((profile: ActorMemoryProfile): string => profile.actorKey);
        const actorMap = new Map(actorProfiles.map((profile: ActorMemoryProfile): [string, ActorMemoryProfile] => [profile.actorKey, profile]));
        const entryMap = new Map(entries.map((entry: MemoryEntry): [string, MemoryEntry] => [entry.entryId, entry]));
        const roleRows = await db.role_entry_memory.where('chatKey').equals(this.chatKey).toArray();
        const roleEntries: PromptAssemblyRoleEntry[] = [];
        const matchedEntryIds = new Set<string>();
        for (const row of roleRows) {
            if (!effectiveActorKeys.includes(row.actorKey)) {
                continue;
            }
            const entry = entryMap.get(row.entryId);
            if (!entry) {
                continue;
            }
            if (query && !this.isEntryMatched(entry, queryTerms)) {
                continue;
            }
            const forgotten = this.shouldForget(row, query || promptText);
            roleEntries.push({
                actorKey: row.actorKey,
                actorLabel: actorMap.get(row.actorKey)?.displayName || row.actorKey,
                entryId: entry.entryId,
                title: entry.title,
                entryType: typeMap.get(entry.entryType)?.label || entry.entryType,
                memoryPercent: row.memoryPercent,
                forgotten,
                renderedText: forgotten
                    ? `${entry.title}：内容已遗忘`
                    : `${entry.title}：${entry.summary || entry.detail || '暂无详情'}`,
            });
            matchedEntryIds.add(entry.entryId);
        }
        const systemText = this.trimTextToBudget(this.renderSystemText(systemEntries, typeMap), input.maxTokens ?? 1400);
        const roleText = this.trimTextToBudget(this.renderRoleText(roleEntries), input.maxTokens ?? 1400);
        return {
            generatedAt: Date.now(),
            query,
            matchedActorKeys: effectiveActorKeys,
            matchedEntryIds: Array.from(matchedEntryIds),
            systemText,
            roleText,
            finalText: [systemText, roleText].filter(Boolean).join('\n\n').trim(),
            systemEntryIds: systemEntries.map((entry: MemoryEntry): string => entry.entryId),
            roleEntries,
            reasonCodes: [
                'prompt:unified_memory',
                systemText ? 'prompt:system_base_present' : 'prompt:system_base_empty',
                roleText ? 'prompt:role_memory_present' : 'prompt:role_memory_empty',
            ],
        };
        */
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
        const userSnapshot = getCurrentTavernUserSnapshotEvent(null);
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
        return this.normalizeText(getCurrentTavernUserNameEvent(null, '用户')) || '用户';
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
