import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import type { EventEnvelope } from '../../../SDK/stx';
import { EventsManager } from '../core/events-manager';
import { UnifiedMemoryManager } from '../core/unified-memory-manager';
import {
    exportMemoryChatDatabaseSnapshot,
    exportMemoryPromptTestBundle,
    importMemoryPromptTestBundle,
    type ImportMemoryPromptTestBundleResult,
    type MemoryChatDatabaseSnapshot,
    type MemoryPromptTestBundle,
    type PromptReadyCaptureSnapshot,
    restoreArchivedMemoryChat,
} from '../db/db';

/**
 * 功能：定义统一记忆提示词注入入参。
 */
export interface UnifiedPromptInjectInput {
    promptMessages: SdkTavernPromptMessageEvent[];
    maxTokens?: number;
    query?: string;
    source?: string;
    sourceMessageId?: string;
    trace?: Record<string, unknown>;
}

/**
 * 功能：定义统一记忆提示词注入结果。
 */
export interface UnifiedPromptInjectResult {
    shouldInject: boolean;
    inserted: boolean;
    insertIndex: number;
    promptLength: number;
    insertedLength: number;
    trace: Record<string, unknown> | null;
}

/**
 * 功能：MemoryOS 统一条目 SDK 门面。
 */
export class MemorySDKImpl {
    private readonly chatKey_: string;
    private readonly eventsManager: EventsManager;
    private readonly unifiedManager: UnifiedMemoryManager;
    private promptReadyCaptureSnapshot: PromptReadyCaptureSnapshot | null;
    private latestRecallExplanation: Record<string, unknown> | null;

    public readonly template: { destroy: () => void };
    public readonly events: {
        append: (
            type: string,
            payload: Record<string, unknown>,
            meta?: { sourceMessageId?: string; sourcePlugin?: string },
        ) => Promise<string>;
        query: (opts: { type?: string; sinceTs?: number; limit?: number }) => Promise<Array<Record<string, unknown>>>;
        getById: (eventId: string) => Promise<Record<string, unknown> | undefined>;
        count: () => Promise<number>;
    };
    public readonly postGeneration: {
        scheduleRoundProcessing: (source?: string) => Promise<void>;
    };
    public readonly chatState: {
        getLatestRecallExplanation: () => Promise<Record<string, unknown> | null>;
        setPromptReadyCaptureSnapshotForTest: (snapshot: PromptReadyCaptureSnapshot) => Promise<void>;
        getPromptReadyCaptureSnapshotForTest: () => Promise<PromptReadyCaptureSnapshot | null>;
        exportPromptTestBundleForTest: () => Promise<MemoryPromptTestBundle>;
        importPromptTestBundleForTest: (
            bundle: MemoryPromptTestBundle,
            options?: { targetChatKey?: string; skipClear?: boolean },
        ) => Promise<ImportMemoryPromptTestBundleResult>;
        rebuildLogicalChatView: () => Promise<void>;
        primeColdStartPrompt: (_reason?: string) => Promise<void>;
        flush: () => Promise<void>;
        destroy: () => Promise<void>;
        restoreArchivedMemoryChat: () => Promise<void>;
    };
    public readonly unifiedMemory: {
        entryTypes: {
            list: ReturnType<UnifiedMemoryManager['listEntryTypes']> extends Promise<infer R>
                ? () => Promise<R>
                : never;
            save: (input: Parameters<UnifiedMemoryManager['saveEntryType']>[0]) => ReturnType<UnifiedMemoryManager['saveEntryType']>;
            remove: (key: string) => Promise<void>;
        };
        entries: {
            list: (filters?: Parameters<UnifiedMemoryManager['listEntries']>[0]) => ReturnType<UnifiedMemoryManager['listEntries']>;
            get: (entryId: string) => ReturnType<UnifiedMemoryManager['getEntry']>;
            save: (input: Parameters<UnifiedMemoryManager['saveEntry']>[0]) => ReturnType<UnifiedMemoryManager['saveEntry']>;
            remove: (entryId: string) => Promise<void>;
        };
        actors: {
            list: () => ReturnType<UnifiedMemoryManager['listActorProfiles']>;
            ensure: (input: Parameters<UnifiedMemoryManager['ensureActorProfile']>[0]) => ReturnType<UnifiedMemoryManager['ensureActorProfile']>;
            setMemoryStat: (actorKey: string, memoryStat: number) => ReturnType<UnifiedMemoryManager['setActorMemoryStat']>;
        };
        roleMemory: {
            list: (actorKey?: string) => ReturnType<UnifiedMemoryManager['listRoleMemories']>;
            bind: (actorKey: string, entryId: string) => ReturnType<UnifiedMemoryManager['bindRoleToEntry']>;
            unbind: (actorKey: string, entryId: string) => Promise<void>;
        };
        summaries: {
            list: (limit?: number) => ReturnType<UnifiedMemoryManager['listSummarySnapshots']>;
            apply: (input: Parameters<UnifiedMemoryManager['applySummarySnapshot']>[0]) => ReturnType<UnifiedMemoryManager['applySummarySnapshot']>;
            capture: (input: Parameters<UnifiedMemoryManager['captureSummaryFromChat']>[0]) => ReturnType<UnifiedMemoryManager['captureSummaryFromChat']>;
        };
        prompts: {
            preview: (input?: Parameters<UnifiedMemoryManager['buildPromptAssembly']>[0]) => ReturnType<UnifiedMemoryManager['buildPromptAssembly']>;
            inject: (input: UnifiedPromptInjectInput) => Promise<UnifiedPromptInjectResult>;
        };
    };

    /**
     * 功能：构造统一记忆 SDK。
     * @param chatKey 聊天键。
     */
    constructor(chatKey: string) {
        this.chatKey_ = String(chatKey ?? '').trim();
        this.eventsManager = new EventsManager(this.chatKey_);
        this.unifiedManager = new UnifiedMemoryManager(this.chatKey_);
        this.promptReadyCaptureSnapshot = null;
        this.latestRecallExplanation = null;

        this.template = {
            destroy: (): void => {
                return;
            },
        };

        this.events = {
            append: async (
                type: string,
                payload: Record<string, unknown>,
                meta?: { sourceMessageId?: string; sourcePlugin?: string },
            ): Promise<string> => {
                return this.eventsManager.append(type, payload, meta);
            },
            query: async (opts: { type?: string; sinceTs?: number; limit?: number }): Promise<Array<Record<string, unknown>>> => {
                const rows = await this.eventsManager.query(opts);
                return rows.map((row: EventEnvelope<unknown>): Record<string, unknown> => ({ ...row }));
            },
            getById: async (eventId: string): Promise<Record<string, unknown> | undefined> => {
                const row = await this.eventsManager.getById(eventId);
                return row ? ({ ...row } as Record<string, unknown>) : undefined;
            },
            count: async (): Promise<number> => {
                return this.eventsManager.count();
            },
        };

        this.postGeneration = {
            scheduleRoundProcessing: async (_source?: string): Promise<void> => {
                const rows = await this.eventsManager.query({ limit: 12 });
                const messages = rows
                    .map((row: EventEnvelope<unknown>): { role?: string; content?: string; name?: string } => {
                        const type = String(row.type ?? '').trim();
                        const payload = (row.payload ?? {}) as Record<string, unknown>;
                        const role = type === 'chat.message.sent' ? 'user' : 'assistant';
                        return {
                            role,
                            content: String(payload.text ?? '').trim(),
                            name: undefined,
                        };
                    })
                    .filter((item: { content?: string }): boolean => Boolean(String(item.content ?? '').trim()));
                if (messages.length <= 0) {
                    return;
                }
                await this.unifiedManager.captureSummaryFromChat({ messages });
            },
        };

        this.chatState = {
            getLatestRecallExplanation: async (): Promise<Record<string, unknown> | null> => {
                return this.latestRecallExplanation ? { ...this.latestRecallExplanation } : null;
            },
            setPromptReadyCaptureSnapshotForTest: async (snapshot: PromptReadyCaptureSnapshot): Promise<void> => {
                this.promptReadyCaptureSnapshot = {
                    ...snapshot,
                    promptFixture: Array.isArray(snapshot.promptFixture) ? snapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })) : [],
                };
            },
            getPromptReadyCaptureSnapshotForTest: async (): Promise<PromptReadyCaptureSnapshot | null> => {
                if (!this.promptReadyCaptureSnapshot) {
                    return null;
                }
                return {
                    ...this.promptReadyCaptureSnapshot,
                    promptFixture: this.promptReadyCaptureSnapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })),
                };
            },
            exportPromptTestBundleForTest: async (): Promise<MemoryPromptTestBundle> => {
                return exportMemoryPromptTestBundle(this.chatKey_, {
                    captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
                });
            },
            importPromptTestBundleForTest: async (
                bundle: MemoryPromptTestBundle,
                options?: { targetChatKey?: string; skipClear?: boolean },
            ): Promise<ImportMemoryPromptTestBundleResult> => {
                return importMemoryPromptTestBundle(bundle, options);
            },
            rebuildLogicalChatView: async (): Promise<void> => {
                return;
            },
            primeColdStartPrompt: async (_reason?: string): Promise<void> => {
                return;
            },
            flush: async (): Promise<void> => {
                return;
            },
            destroy: async (): Promise<void> => {
                return;
            },
            restoreArchivedMemoryChat: async (): Promise<void> => {
                await restoreArchivedMemoryChat(this.chatKey_);
            },
        };

        this.unifiedMemory = {
            entryTypes: {
                list: async () => this.unifiedManager.listEntryTypes(),
                save: async (input: Parameters<UnifiedMemoryManager['saveEntryType']>[0]) => this.unifiedManager.saveEntryType(input),
                remove: async (key: string) => this.unifiedManager.deleteEntryType(key),
            },
            entries: {
                list: async (filters?: Parameters<UnifiedMemoryManager['listEntries']>[0]) => this.unifiedManager.listEntries(filters),
                get: async (entryId: string) => this.unifiedManager.getEntry(entryId),
                save: async (input: Parameters<UnifiedMemoryManager['saveEntry']>[0]) => this.unifiedManager.saveEntry(input),
                remove: async (entryId: string) => this.unifiedManager.deleteEntry(entryId),
            },
            actors: {
                list: async () => this.unifiedManager.listActorProfiles(),
                ensure: async (input: Parameters<UnifiedMemoryManager['ensureActorProfile']>[0]) => this.unifiedManager.ensureActorProfile(input),
                setMemoryStat: async (actorKey: string, memoryStat: number) => this.unifiedManager.setActorMemoryStat(actorKey, memoryStat),
            },
            roleMemory: {
                list: async (actorKey?: string) => this.unifiedManager.listRoleMemories(actorKey),
                bind: async (actorKey: string, entryId: string) => this.unifiedManager.bindRoleToEntry(actorKey, entryId),
                unbind: async (actorKey: string, entryId: string) => this.unifiedManager.unbindRoleFromEntry(actorKey, entryId),
            },
            summaries: {
                list: async (limit?: number) => this.unifiedManager.listSummarySnapshots(limit),
                apply: async (input: Parameters<UnifiedMemoryManager['applySummarySnapshot']>[0]) => this.unifiedManager.applySummarySnapshot(input),
                capture: async (input: Parameters<UnifiedMemoryManager['captureSummaryFromChat']>[0]) => this.unifiedManager.captureSummaryFromChat(input),
            },
            prompts: {
                preview: async (input?: Parameters<UnifiedMemoryManager['buildPromptAssembly']>[0]) => this.unifiedManager.buildPromptAssembly(input ?? {}),
                inject: async (input: UnifiedPromptInjectInput): Promise<UnifiedPromptInjectResult> => {
                    const preview = await this.unifiedManager.buildPromptAssembly({
                        query: input.query,
                        promptMessages: input.promptMessages,
                        maxTokens: input.maxTokens,
                    });
                    const content = String(preview.finalText ?? '').trim();
                    const shouldInject = content.length > 0;
                    const insertIndex = this.resolveInsertIndex(input.promptMessages);
                    if (shouldInject && insertIndex >= 0) {
                        input.promptMessages.splice(insertIndex, 0, {
                            role: 'system',
                            content: `[Memory Context]\n<memoryos_context>\n${content}\n</memoryos_context>`,
                        } as unknown as SdkTavernPromptMessageEvent);
                    }
                    this.latestRecallExplanation = {
                        generatedAt: Date.now(),
                        query: String(preview.query ?? ''),
                        matchedActorKeys: preview.matchedActorKeys,
                        matchedEntryIds: preview.matchedEntryIds,
                        reasonCodes: preview.reasonCodes,
                        source: 'unified_memory',
                    };
                    return {
                        shouldInject,
                        inserted: shouldInject && insertIndex >= 0,
                        insertIndex,
                        promptLength: input.promptMessages.length,
                        insertedLength: content.length,
                        trace: input.trace ?? null,
                    };
                },
            },
        };
    }

    /**
     * 功能：初始化 SDK。
     * @returns 初始化结果。
     */
    public async init(): Promise<void> {
        await this.unifiedManager.init();
    }

    /**
     * 功能：读取当前聊天键。
     * @returns 聊天键。
     */
    public getChatKey(): string {
        return this.chatKey_;
    }

    /**
     * 功能：导出聊天数据库快照。
     * @returns 快照。
     */
    public async exportMemoryChatDatabaseSnapshotForTest(): Promise<MemoryChatDatabaseSnapshot> {
        return exportMemoryChatDatabaseSnapshot(this.chatKey_);
    }

    /**
     * 功能：导出 Prompt 测试包。
     * @returns 测试包。
     */
    public async exportPromptTestBundleForTest(): Promise<MemoryPromptTestBundle> {
        return exportMemoryPromptTestBundle(this.chatKey_, {
            captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
        });
    }

    /**
     * 功能：导入 Prompt 测试包。
     * @param bundle 测试包。
     * @param options 导入参数。
     * @returns 导入结果。
     */
    public async importPromptTestBundleForTest(
        bundle: MemoryPromptTestBundle,
        options?: { targetChatKey?: string; skipClear?: boolean },
    ): Promise<ImportMemoryPromptTestBundleResult> {
        return importMemoryPromptTestBundle(bundle, options);
    }

    /**
     * 功能：恢复归档聊天。
     * @returns 恢复结果。
     */
    public async restoreArchivedMemoryChat(): Promise<void> {
        await restoreArchivedMemoryChat(this.chatKey_);
    }

    /**
     * 功能：计算统一注入插入位置。
     * @param promptMessages 消息数组。
     * @returns 插入下标。
     */
    private resolveInsertIndex(promptMessages: SdkTavernPromptMessageEvent[]): number {
        for (let index = promptMessages.length - 1; index >= 0; index -= 1) {
            const row = promptMessages[index] as Record<string, unknown>;
            const role = String(row.role ?? '').trim().toLowerCase();
            if (role === 'user' || row.is_user === true) {
                return index;
            }
        }
        return promptMessages.length;
    }
}
