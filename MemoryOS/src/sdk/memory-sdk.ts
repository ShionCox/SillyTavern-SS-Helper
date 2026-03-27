import {
    getCurrentTavernCharacterEvent,
    getCurrentTavernUserSnapshotEvent,
    getTavernSemanticSnapshotEvent,
    loadTavernWorldbookEntriesEvent,
    resolveTavernCharacterWorldbookBindingEvent,
    type SdkTavernPromptMessageEvent,
} from '../../../SDK/tavern';
import type { EventEnvelope } from '../../../SDK/stx';
import { EventsManager } from '../core/events-manager';
import { UnifiedMemoryManager } from '../core/unified-memory-manager';
import { logger } from '../runtime/runtime-services';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { readMemoryLLMApi, registerMemoryLLMTasks } from '../memory-summary';
import { runBootstrapOrchestrator, type ColdStartSourceBundle } from '../memory-bootstrap';
import {
    exportMemoryChatDatabaseSnapshot,
    exportMemoryPromptTestBundle,
    importMemoryPromptTestBundle,
    type ImportMemoryPromptTestBundleResult,
    type MemoryChatDatabaseSnapshot,
    type MemoryPromptParityBaseline,
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
 * 功能：定义测试包导出参数。
 */
export interface ExportPromptTestBundleForTestOptions {
    promptFixture?: Array<Record<string, unknown>>;
    query?: string;
    sourceMessageId?: string;
    settings?: Record<string, unknown>;
    runResult?: Record<string, unknown>;
    parityBaseline?: MemoryPromptParityBaseline;
}

/**
 * 功能：MemoryOS 统一条目 SDK 门面。
 */
export class MemorySDKImpl {
    private readonly chatKey_: string;
    private readonly eventsManager: EventsManager;
    private readonly unifiedManager: UnifiedMemoryManager;
    private promptReadyCaptureSnapshot: PromptReadyCaptureSnapshot | null;
    private promptReadyRunResultSnapshot: Record<string, unknown> | null;
    private latestRecallExplanation: Record<string, unknown> | null;
    private llmTasksRegistered: boolean;

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
        setPromptReadyRunResultForTest: (runResult: Record<string, unknown>) => Promise<void>;
        getPromptReadyRunResultForTest: () => Promise<Record<string, unknown> | null>;
        getLatestPromptReadyCaptureSnapshotForTest: () => Promise<PromptReadyCaptureSnapshot | null>;
        exportCurrentChatDatabaseSnapshotForTest: () => Promise<MemoryChatDatabaseSnapshot>;
        exportPromptTestBundleForTest: (options?: ExportPromptTestBundleForTestOptions) => Promise<MemoryPromptTestBundle>;
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
        this.promptReadyRunResultSnapshot = null;
        this.latestRecallExplanation = null;
        this.llmTasksRegistered = false;

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
            /**
             * 功能：缓存最近一次 prompt-ready 的运行结果。
             * @param runResult 运行结果。
             * @returns 异步完成。
             */
            setPromptReadyRunResultForTest: async (runResult: Record<string, unknown>): Promise<void> => {
                this.promptReadyRunResultSnapshot = { ...runResult };
            },
            /**
             * 功能：读取最近一次 prompt-ready 的运行结果。
             * @returns 运行结果快照。
             */
            getPromptReadyRunResultForTest: async (): Promise<Record<string, unknown> | null> => {
                if (!this.promptReadyRunResultSnapshot) {
                    return null;
                }
                return { ...this.promptReadyRunResultSnapshot };
            },
            /**
             * 功能：读取最近一次 prompt-ready 抓包快照。
             * @returns 抓包快照。
             */
            getLatestPromptReadyCaptureSnapshotForTest: async (): Promise<PromptReadyCaptureSnapshot | null> => {
                if (!this.promptReadyCaptureSnapshot) {
                    return null;
                }
                return {
                    ...this.promptReadyCaptureSnapshot,
                    promptFixture: this.promptReadyCaptureSnapshot.promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item })),
                };
            },
            /**
             * 功能：导出当前会话数据库快照。
             * @returns 数据库快照。
             */
            exportCurrentChatDatabaseSnapshotForTest: async (): Promise<MemoryChatDatabaseSnapshot> => {
                return exportMemoryChatDatabaseSnapshot(this.chatKey_);
            },
            /**
             * 功能：导出 Prompt 测试包。
             * @param options 导出参数。
             * @returns 测试包结果。
             */
            exportPromptTestBundleForTest: async (options: ExportPromptTestBundleForTestOptions = {}): Promise<MemoryPromptTestBundle> => {
                const resolvedRunResult = options.runResult ?? this.promptReadyRunResultSnapshot ?? undefined;
                const resolvedParityBaseline = options.parityBaseline ?? this.resolveParityBaselineFromRunResult(resolvedRunResult);
                return exportMemoryPromptTestBundle(this.chatKey_, {
                    promptFixture: options.promptFixture,
                    captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
                    query: options.query,
                    sourceMessageId: options.sourceMessageId,
                    settings: options.settings,
                    runResult: resolvedRunResult,
                    parityBaseline: resolvedParityBaseline,
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
                const llm = readMemoryLLMApi();
                if (!llm) {
                    return;
                }
                const sourceBundle = await this.collectColdStartSourceBundle(_reason);
                const result = await runBootstrapOrchestrator({
                    dependencies: {
                        ensureActorProfile: async (input): Promise<unknown> => this.unifiedManager.ensureActorProfile(input),
                        saveEntry: async (input): Promise<any> => this.unifiedManager.saveEntry(input),
                        bindRoleToEntry: async (actorKey: string, entryId: string): Promise<unknown> => this.unifiedManager.bindRoleToEntry(actorKey, entryId),
                        putWorldProfileBinding: async (binding): Promise<unknown> => this.unifiedManager.putWorldProfileBinding(binding),
                        appendMutationHistory: async (history): Promise<unknown> => this.unifiedManager.appendMutationHistory(history),
                    },
                    llm,
                    pluginId: MEMORY_OS_PLUGIN_ID,
                    sourceBundle,
                });
                if (!result.ok) {
                    logger.warn(`[MemoryOS] 冷启动执行失败: ${result.reasonCode}`);
                }
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
        this.tryRegisterLLMTasks();
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
     * @param options 导出参数。
     * @returns 测试包。
     */
    public async exportPromptTestBundleForTest(options: ExportPromptTestBundleForTestOptions = {}): Promise<MemoryPromptTestBundle> {
        const resolvedRunResult = options.runResult ?? this.promptReadyRunResultSnapshot ?? undefined;
        const resolvedParityBaseline = options.parityBaseline ?? this.resolveParityBaselineFromRunResult(resolvedRunResult);
        return exportMemoryPromptTestBundle(this.chatKey_, {
            promptFixture: options.promptFixture,
            captureSnapshot: this.promptReadyCaptureSnapshot ?? undefined,
            query: options.query,
            sourceMessageId: options.sourceMessageId,
            settings: options.settings,
            runResult: resolvedRunResult,
            parityBaseline: resolvedParityBaseline,
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

    /**
     * 功能：从运行结果提取严格一致性基准。
     * @param runResult 运行结果对象。
     * @returns 严格一致性基准。
     */
    private resolveParityBaselineFromRunResult(runResult?: Record<string, unknown>): MemoryPromptParityBaseline | undefined {
        if (!runResult || typeof runResult !== 'object') {
            return undefined;
        }
        const raw = (runResult.parityBaseline && typeof runResult.parityBaseline === 'object')
            ? runResult.parityBaseline as Record<string, unknown>
            : runResult;
        const finalPromptText = String(raw.finalPromptText ?? '').trim();
        if (!finalPromptText) {
            return undefined;
        }
        const insertIndex = Number(raw.insertIndex);
        return {
            finalPromptText,
            insertIndex: Number.isFinite(insertIndex) ? Math.trunc(insertIndex) : -1,
            insertedMemoryBlock: String(raw.insertedMemoryBlock ?? '').trim(),
            reasonCodes: this.normalizeStringArray(raw.reasonCodes),
            matchedActorKeys: this.normalizeStringArray(raw.matchedActorKeys),
            matchedEntryIds: this.normalizeStringArray(raw.matchedEntryIds),
        };
    }

    /**
     * 功能：将未知值归一化为字符串数组并去重。
     * @param value 原始输入。
     * @returns 归一化数组。
     */
    private normalizeStringArray(value: unknown): string[] {
        if (!Array.isArray(value)) {
            return [];
        }
        const seen = new Set<string>();
        const result: string[] = [];
        for (const row of value) {
            const normalized = String(row ?? '').trim();
            if (!normalized || seen.has(normalized)) {
                continue;
            }
            seen.add(normalized);
            result.push(normalized);
        }
        return result;
    }

    /**
     * 功能：注册 MemoryOS 的 LLMHub 任务。
     */
    private tryRegisterLLMTasks(): void {
        if (this.llmTasksRegistered) {
            return;
        }
        const llm = readMemoryLLMApi();
        if (!llm) {
            return;
        }
        try {
            registerMemoryLLMTasks(llm, MEMORY_OS_PLUGIN_ID);
            this.llmTasksRegistered = true;
        } catch (error) {
            logger.warn('[MemoryOS] LLM 任务注册失败', error);
        }
    }

    /**
     * 功能：收集冷启动输入文本。
     * @param reason 触发原因。
     * @returns 冷启动源文本列表。
     */
    private async collectColdStartSourceBundle(reason?: string): Promise<ColdStartSourceBundle> {
        const events = await this.eventsManager.query({ limit: 40 });
        const recentEvents = events
            .map((event: EventEnvelope<unknown>): string => {
                const payload = (event.payload ?? {}) as Record<string, unknown>;
                return String(payload.text ?? '').trim();
            })
            .filter((text: string): boolean => text.length > 0);
        const semanticSnapshot = getTavernSemanticSnapshotEvent();
        const userSnapshot = getCurrentTavernUserSnapshotEvent();
        const currentCharacter = getCurrentTavernCharacterEvent();
        const worldbookBinding = resolveTavernCharacterWorldbookBindingEvent(32);
        const worldbookEntries = await loadTavernWorldbookEntriesEvent(worldbookBinding.allBooks);
        return buildColdStartSourceBundle({
            reason,
            currentCharacter,
            semanticSnapshot,
            userSnapshot,
            worldbookBinding,
            worldbookEntries: worldbookEntries.map((entry) => ({
                book: String(entry.book ?? '').trim(),
                entryId: String(entry.entryId ?? '').trim(),
                entry: String(entry.entry ?? '').trim(),
                keywords: dedupeStrings((entry.keywords ?? []).map((item): string => String(item))),
                content: String(entry.content ?? '').trim(),
            })),
            recentEvents,
        });
    }
}

/**
 * 功能：组装冷启动的结构化 sourceBundle 输入。
 * @param input 冷启动原始输入。
 * @returns 冷启动 sourceBundle。
 */
export function buildColdStartSourceBundle(input: {
    reason?: string;
    currentCharacter?: {
        name?: string;
        description?: string;
        desc?: string;
        personality?: string;
        scenario?: string;
        first_mes?: string;
        mes_example?: string;
        creator_notes?: string;
        tags?: string[];
    } | null;
    semanticSnapshot?: {
        systemPrompt?: string;
        firstMessage?: string;
        authorNote?: string;
        jailbreak?: string;
        instruct?: string;
        activeLorebooks?: string[];
    } | null;
    userSnapshot?: {
        userName?: string;
        counterpartName?: string;
        personaDescription?: string;
        metadataPersona?: string;
    } | null;
    worldbookBinding?: {
        mainBook?: string;
        extraBooks?: string[];
        allBooks?: string[];
    } | null;
    worldbookEntries?: Array<{
        book: string;
        entryId: string;
        entry: string;
        keywords: string[];
        content: string;
    }>;
    recentEvents?: string[];
}): ColdStartSourceBundle {
    const characterTags = dedupeStrings((input.currentCharacter?.tags ?? []).map((tag): string => String(tag)));
    return {
        reason: String(input.reason ?? '').trim(),
        characterCard: {
            name: String(input.currentCharacter?.name ?? '').trim(),
            description: String(input.currentCharacter?.description ?? input.currentCharacter?.desc ?? '').trim(),
            personality: String(input.currentCharacter?.personality ?? '').trim(),
            scenario: String(input.currentCharacter?.scenario ?? '').trim(),
            firstMessage: String(input.currentCharacter?.first_mes ?? '').trim(),
            messageExample: String(input.currentCharacter?.mes_example ?? '').trim(),
            creatorNotes: String(input.currentCharacter?.creator_notes ?? '').trim(),
            tags: characterTags,
        },
        semantic: {
            systemPrompt: String(input.semanticSnapshot?.systemPrompt ?? '').trim(),
            firstMessage: String(input.semanticSnapshot?.firstMessage ?? '').trim(),
            authorNote: String(input.semanticSnapshot?.authorNote ?? '').trim(),
            jailbreak: String(input.semanticSnapshot?.jailbreak ?? '').trim(),
            instruct: String(input.semanticSnapshot?.instruct ?? '').trim(),
            activeLorebooks: dedupeStrings((input.semanticSnapshot?.activeLorebooks ?? []).map((item): string => String(item))),
        },
        user: {
            userName: String(input.userSnapshot?.userName ?? '').trim(),
            counterpartName: String(input.userSnapshot?.counterpartName ?? '').trim(),
            personaDescription: String(input.userSnapshot?.personaDescription ?? '').trim(),
            metadataPersona: String(input.userSnapshot?.metadataPersona ?? '').trim(),
        },
        worldbooks: {
            mainBook: String(input.worldbookBinding?.mainBook ?? '').trim(),
            extraBooks: dedupeStrings((input.worldbookBinding?.extraBooks ?? []).map((item): string => String(item))),
            activeBooks: dedupeStrings((input.worldbookBinding?.allBooks ?? []).map((item): string => String(item))),
            entries: (input.worldbookEntries ?? []).map((entry) => ({
                book: String(entry.book ?? '').trim(),
                entryId: String(entry.entryId ?? '').trim(),
                entry: String(entry.entry ?? '').trim(),
                keywords: dedupeStrings((entry.keywords ?? []).map((item): string => String(item))),
                content: String(entry.content ?? '').trim(),
            })),
        },
        recentEvents: dedupeStrings((input.recentEvents ?? []).map((event): string => String(event))),
    };
}

/**
 * 功能：字符串数组去重并去空。
 * @param values 输入字符串数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (normalized && !result.includes(normalized)) {
            result.push(normalized);
        }
    }
    return result;
}
