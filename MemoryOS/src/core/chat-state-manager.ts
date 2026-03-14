import { readSdkPluginChatState, writeSdkPluginChatState } from '../../../SDK/db';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { Logger } from '../../../SDK/logger';
import type {
    MemoryOSChatState,
    SummaryPolicyOverride,
    AutoSchemaPolicy,
    SchemaDraftSession,
    AssistantTurnTracker,
    RowAliasIndex,
    RowRedirects,
    RowTombstones,
} from '../types';
import {
    DEFAULT_SUMMARY_POLICY,
    DEFAULT_AUTO_SCHEMA_POLICY,
    DEFAULT_SCHEMA_DRAFT_SESSION,
    DEFAULT_ASSISTANT_TURN_TRACKER,
} from '../types';

const logger = new Logger('ChatStateManager');

/**
 * 聊天级插件状态管理器
 * 读写 chat_plugin_state.state 中的 MemoryOSChatState
 * 每个 chatKey 独立维护，不跨聊天共享
 */
export class ChatStateManager {
    private chatKey: string;
    private cache: MemoryOSChatState | null = null;
    private dirty = false;
    private flushTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly flushIntervalMs: number = 1000;

    constructor(chatKey: string) {
        this.chatKey = chatKey;
    }

    /**
     * 加载聊天级状态，若不存在则初始化默认值
     */
    async load(): Promise<MemoryOSChatState> {
        if (this.cache) return this.cache;
        try {
            const row = await readSdkPluginChatState(MEMORY_OS_PLUGIN_ID, this.chatKey);
            const raw = (row?.state ?? {}) as MemoryOSChatState;
            this.cache = raw;
            return raw;
        } catch (e) {
            logger.warn('加载聊天级状态失败，使用默认值', e);
            this.cache = {};
            return this.cache;
        }
    }

    /**
     * 标记 dirty 并在节流窗口后写回
     */
    private markDirty(): void {
        this.dirty = true;
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, this.flushIntervalMs);
    }

    /**
     * 强制写回当前缓存到 chat_plugin_state
     */
    async flush(): Promise<void> {
        if (!this.dirty || !this.cache) return;
        try {
            await writeSdkPluginChatState(MEMORY_OS_PLUGIN_ID, this.chatKey, this.cache as Record<string, unknown>);
            this.dirty = false;
        } catch (e) {
            logger.warn('聊天级状态写回失败', e);
        }
    }

    /**
     * 销毁时强制 flush
     */
    async destroy(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        await this.flush();
        this.cache = null;
    }

    // ─── 总结策略 ───

    async getSummaryPolicy(): Promise<Required<SummaryPolicyOverride>> {
        const state = await this.load();
        return { ...DEFAULT_SUMMARY_POLICY, ...state.summaryPolicyOverride };
    }

    async setSummaryPolicyOverride(override: Partial<SummaryPolicyOverride>): Promise<void> {
        const state = await this.load();
        state.summaryPolicyOverride = { ...state.summaryPolicyOverride, ...override };
        this.markDirty();
    }

    // ─── 自动 Schema 策略 ───

    async getAutoSchemaPolicy(): Promise<Required<AutoSchemaPolicy>> {
        const state = await this.load();
        return { ...DEFAULT_AUTO_SCHEMA_POLICY, ...state.autoSchemaPolicy };
    }

    async setAutoSchemaPolicy(policy: Partial<AutoSchemaPolicy>): Promise<void> {
        const state = await this.load();
        state.autoSchemaPolicy = { ...state.autoSchemaPolicy, ...policy };
        this.markDirty();
    }

    // ─── Schema 草稿会话 ───

    async getSchemaDraftSession(): Promise<SchemaDraftSession> {
        const state = await this.load();
        return { ...DEFAULT_SCHEMA_DRAFT_SESSION, ...state.schemaDraftSession };
    }

    async updateSchemaDraftSession(patch: Partial<SchemaDraftSession>): Promise<void> {
        const state = await this.load();
        state.schemaDraftSession = { ...DEFAULT_SCHEMA_DRAFT_SESSION, ...state.schemaDraftSession, ...patch };
        this.markDirty();
    }

    // ─── 助手楼层跟踪器 ───

    async getAssistantTurnTracker(): Promise<AssistantTurnTracker> {
        const state = await this.load();
        return { ...DEFAULT_ASSISTANT_TURN_TRACKER, ...state.assistantTurnTracker };
    }

    async updateAssistantTurnTracker(patch: Partial<AssistantTurnTracker>): Promise<void> {
        const state = await this.load();
        const current = { ...DEFAULT_ASSISTANT_TURN_TRACKER, ...state.assistantTurnTracker };
        state.assistantTurnTracker = { ...current, ...patch, lastUpdatedAt: Date.now() };
        this.markDirty();
    }

    // ─── 行别名索引 ───

    async getRowAliasIndex(): Promise<RowAliasIndex> {
        const state = await this.load();
        return state.rowAliasIndex ?? {};
    }

    async setRowAlias(tableKey: string, alias: string, canonicalRowId: string): Promise<void> {
        const state = await this.load();
        if (!state.rowAliasIndex) state.rowAliasIndex = {};
        if (!state.rowAliasIndex[tableKey]) state.rowAliasIndex[tableKey] = {};
        state.rowAliasIndex[tableKey][alias] = canonicalRowId;
        this.markDirty();
    }

    async removeRowAlias(tableKey: string, alias: string): Promise<void> {
        const state = await this.load();
        if (state.rowAliasIndex?.[tableKey]) {
            delete state.rowAliasIndex[tableKey][alias];
            this.markDirty();
        }
    }

    // ─── 行重定向 ───

    async getRowRedirects(): Promise<RowRedirects> {
        const state = await this.load();
        return state.rowRedirects ?? {};
    }

    async setRowRedirect(tableKey: string, fromRowId: string, toRowId: string): Promise<void> {
        const state = await this.load();
        if (!state.rowRedirects) state.rowRedirects = {};
        if (!state.rowRedirects[tableKey]) state.rowRedirects[tableKey] = {};
        // 压平：确保直接指向最终目标
        const finalTarget = state.rowRedirects[tableKey][toRowId] ?? toRowId;
        state.rowRedirects[tableKey][fromRowId] = finalTarget;
        // 回写压平已有的指向 fromRowId 的 redirect
        for (const [k, v] of Object.entries(state.rowRedirects[tableKey])) {
            if (v === fromRowId) {
                state.rowRedirects[tableKey][k] = finalTarget;
            }
        }
        this.markDirty();
    }

    // ─── 行墓碑 ───

    async getRowTombstones(): Promise<RowTombstones> {
        const state = await this.load();
        return state.rowTombstones ?? {};
    }

    async addRowTombstone(tableKey: string, rowId: string, deletedBy: string): Promise<void> {
        const state = await this.load();
        if (!state.rowTombstones) state.rowTombstones = {};
        if (!state.rowTombstones[tableKey]) state.rowTombstones[tableKey] = {};
        state.rowTombstones[tableKey][rowId] = {
            rowId,
            tableKey,
            deletedAt: Date.now(),
            deletedBy,
        };
        this.markDirty();
    }

    async removeRowTombstone(tableKey: string, rowId: string): Promise<void> {
        const state = await this.load();
        if (state.rowTombstones?.[tableKey]) {
            delete state.rowTombstones[tableKey][rowId];
            this.markDirty();
        }
    }

    async isRowTombstoned(tableKey: string, rowId: string): Promise<boolean> {
        const tombstones = await this.getRowTombstones();
        return Boolean(tombstones[tableKey]?.[rowId]);
    }
}
