import { MemorySDKImpl } from '../src/sdk/memory-sdk';
import { runPromptReadyInjectionPipeline, type PromptInjectionPipelineResult } from '../src/runtime/prompt-injection-pipeline';
import type { LatestRecallExplanation, MemoryChatDatabaseSnapshot, MemoryPromptTestBundle, MemoryRecallPreviewResult } from '../../SDK/stx';

const DEFAULT_SETTINGS = {
    contextMaxTokens: 1200,
    injectionPreviewEnabled: true,
    injectionPromptSettings: {
        enabled: true,
        preset: 'balanced_enhanced',
        aggressiveness: 'balanced',
        forceDynamicFloor: true,
        selectedOptions: ['world_setting', 'character_setting', 'relationship_state', 'current_scene', 'recent_plot'],
    },
};

const DEFAULT_PROMPT_MESSAGES = [
    { role: 'system', is_system: true, content: "Write Seraphina's next reply in a fictional chat." },
    { role: 'assistant', content: '你刚醒来，四周是林间空地。' },
    { role: 'user', is_user: true, content: '厄尔多利亚是什么地方', mes_id: 'u-last' },
];

type Nullable<T> = T | null;

const chatKeyInput = document.getElementById('chat-key-input') as HTMLInputElement;
const queryInput = document.getElementById('query-input') as HTMLInputElement;
const sourceMessageIdInput = document.getElementById('source-message-id-input') as HTMLInputElement;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const settingsInput = document.getElementById('settings-input') as HTMLTextAreaElement;
const bundleInput = document.getElementById('bundle-input') as HTMLTextAreaElement;
const activeChatChip = document.getElementById('active-chat-chip') as HTMLSpanElement;
const pipelineLogOutput = document.getElementById('pipeline-log-output') as HTMLPreElement;
const capturedPromptOutput = document.getElementById('captured-prompt-output') as HTMLPreElement;
const promptDiffOutput = document.getElementById('prompt-diff-output') as HTMLPreElement;
const systemPromptOutput = document.getElementById('system-prompt-output') as HTMLPreElement;
const systemInsertedOutput = document.getElementById('system-inserted-output') as HTMLPreElement;
const userPromptOutput = document.getElementById('user-prompt-output') as HTMLPreElement;
const finalPromptOutput = document.getElementById('final-prompt-output') as HTMLPreElement;
const explanationOutput = document.getElementById('explanation-output') as HTMLPreElement;
const settingsPreviewOutput = document.getElementById('settings-preview-output') as HTMLPreElement;
const selectedCandidatesOutput = document.getElementById('selected-candidates-output') as HTMLPreElement;
const recallPreviewOutput = document.getElementById('recall-preview-output') as HTMLPreElement;
const funnelOutput = document.getElementById('funnel-output') as HTMLDivElement;
const dbPreviewOutput = document.getElementById('db-preview-output') as HTMLPreElement;

const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const clearResultBtn = document.getElementById('clear-result-btn') as HTMLButtonElement;
const importJsonBtn = document.getElementById('import-json-btn') as HTMLButtonElement;
const exportChatBtn = document.getElementById('export-chat-btn') as HTMLButtonElement;
const importFileBtn = document.getElementById('import-file-btn') as HTMLButtonElement;
const exportFileBtn = document.getElementById('export-file-btn') as HTMLButtonElement;
const previewDbBtn = document.getElementById('preview-db-btn') as HTMLButtonElement;
const clearDbBtn = document.getElementById('clear-db-btn') as HTMLButtonElement;
const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;

let activeBundle: Nullable<MemoryPromptTestBundle> = null;
let lastRunResult: Nullable<PromptInjectionPipelineResult> = null;

/**
 * 功能：释放 MemorySDK 资源，兼容不同版本的销毁入口。
 * @param sdk MemorySDK 实例。
 * @returns 异步销毁完成。
 */
async function disposeMemorySdk(sdk: MemorySDKImpl): Promise<void> {
    const legacyDestroy = (sdk as unknown as { destroy?: () => Promise<void> }).destroy;
    if (typeof legacyDestroy === 'function') {
        await legacyDestroy.call(sdk);
        return;
    }
    const chatStateDestroy = (sdk.chatState as { destroy?: () => Promise<void> }).destroy;
    if (typeof chatStateDestroy === 'function') {
        await chatStateDestroy.call(sdk.chatState);
    }
}

/**
 * 功能：确保测试台运行时可读取到 SillyTavern 上下文。
 * @returns 无返回值。
 */
function ensureMockContext(): void {
    const root = globalThis as unknown as { SillyTavern?: any; window?: any };
    if (!root.SillyTavern) {
        root.SillyTavern = {};
    }
    if (typeof root.SillyTavern.getContext !== 'function') {
        root.SillyTavern.getContext = (): Record<string, unknown> => ({
            extensionSettings: {
                stx_memory_os: readSettingsJson(),
            },
            selected_world_info: [],
            chat: [],
        });
    }
    if (!root.window) {
        (root as any).window = root;
    }
    root.window.SillyTavern = root.SillyTavern;
}

/**
 * 功能：安全解析 JSON 文本。
 * @param text 文本内容。
 * @returns 解析结果。
 */
function parseJsonSafe<T>(text: string): Nullable<T> {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/**
 * 功能：格式化对象用于 textarea/pre 显示。
 * @param value 待格式化对象。
 * @returns 可读 JSON 字符串。
 */
function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

/**
 * 功能：读取设置 JSON。
 * @returns 规范化设置对象。
 */
function readSettingsJson(): Record<string, unknown> {
    const parsed = parseJsonSafe<Record<string, unknown>>(settingsInput.value);
    if (parsed && typeof parsed === 'object') {
        return parsed;
    }
    return { ...DEFAULT_SETTINGS };
}

/**
 * 功能：读取 prompt 消息 JSON。
 * @returns prompt 消息数组。
 */
function readPromptMessages(): Array<Record<string, unknown>> {
    const parsed = parseJsonSafe<Array<Record<string, unknown>>>(promptInput.value);
    if (Array.isArray(parsed)) {
        return parsed;
    }
    return [...DEFAULT_PROMPT_MESSAGES];
}

/**
 * 功能：判断对象是否满足数据库快照基本结构。
 * @param value 待判断对象。
 * @returns 是否为数据库快照。
 */
function isDatabaseSnapshotLike(value: unknown): value is MemoryChatDatabaseSnapshot {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.chatKey === 'string'
        && Array.isArray(record.events)
        && Array.isArray(record.facts)
        && Array.isArray(record.worldState)
        && Array.isArray(record.memoryCardEmbeddings);
}

/**
 * 功能：从 chatKey 中提取角色键，用于维护导出包的角色视角兜底恢复。
 * @param chatKey 聊天键。
 * @returns 角色键，未命中时返回 null。
 */
function inferActorKeyFromChatKey(chatKey: string): string | null {
    const normalized = String(chatKey ?? '').trim();
    const marker = '::character::';
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex < 0) {
        return null;
    }
    const start = markerIndex + marker.length;
    const tail = normalized.slice(start);
    const actorKey = String(tail.split('::')[0] ?? '').trim().toLowerCase();
    return actorKey || null;
}

/**
 * 功能：渲染活动 chatKey 标记。
 * @param chatKey 当前 chatKey。
 * @returns 无返回值。
 */
function renderActiveChat(chatKey: string): void {
    activeChatChip.textContent = `chat: ${chatKey || '(none)'}`;
}

/**
 * 功能：构建用于展示的数据库快照摘要，便于快速判断各表是否有数据。
 * @param snapshot 聊天数据库快照。
 * @returns 适合在测试台展示的摘要对象。
 */
function buildDatabasePreviewSummary(snapshot: MemoryChatDatabaseSnapshot): Record<string, unknown> {
    return {
        chatKey: snapshot.chatKey,
        generatedAt: snapshot.generatedAt,
        counts: {
            events: snapshot.events.length,
            facts: snapshot.facts.length,
            worldState: snapshot.worldState.length,
            summaries: snapshot.summaries.length,
            templates: snapshot.templates.length,
            audit: snapshot.audit.length,
            worldinfoCache: snapshot.worldinfoCache.length,
            templateBindings: snapshot.templateBindings.length,
            memoryCards: snapshot.memoryCards.length,
            memoryCardEmbeddings: snapshot.memoryCardEmbeddings.length,
            memoryCardMeta: snapshot.memoryCardMeta.length,
            relationshipMemory: snapshot.relationshipMemory.length,
            memoryRecallLog: snapshot.memoryRecallLog.length,
            memoryMutationHistory: snapshot.memoryMutationHistory.length,
            pluginRecords: Array.isArray((snapshot as Record<string, unknown>).pluginRecords)
                ? ((snapshot as Record<string, unknown>).pluginRecords as unknown[]).length
                : 0,
        },
        meta: snapshot.meta ?? null,
        pluginState: ((snapshot as Record<string, unknown>).pluginState ?? null) as Record<string, unknown> | null,
    };
}

/**
 * 功能：渲染诊断漏斗卡片。
 * @param result 流程结果。
 * @returns 无返回值。
 */
function renderFunnel(result: Nullable<PromptInjectionPipelineResult>): void {
    if (!result) {
        funnelOutput.innerHTML = '';
        return;
    }
    const steps = [
        {
            title: '基础注入',
            text: result.baseDiagnostics.inserted
                ? `已注入，index=${result.baseDiagnostics.insertedIndex}`
                : `未注入：${result.baseDiagnostics.skippedReason ?? 'unknown'}`,
        },
        {
            title: '主链注入',
            text: result.injectionResult.inserted
                ? `已注入，index=${result.injectionResult.insertIndex}`
                : `未注入，shouldInject=${String(result.injectionResult.shouldInject)}`,
        },
        {
            title: '最终提示词',
            text: `长度=${result.finalPromptText.length} 字符`,
        },
    ];
    funnelOutput.innerHTML = steps.map((item) => {
        return `<div class="funnel-step"><strong>${item.title}</strong><span class="dim">${item.text}</span></div>`;
    }).join('');
}

/**
 * 功能：提取 latest explanation 中真正进入 prompt 的候选，便于直接排查命中情况。
 * @param explanation 最新召回解释。
 * @returns 适合测试台展示的候选摘要。
 */
function buildSelectedCandidatesPreview(explanation: Nullable<LatestRecallExplanation>): Array<Record<string, unknown>> {
    const items = explanation?.selected?.items ?? [];
    return items.map((item) => ({
        title: item.title,
        section: item.section,
        recordKey: item.recordKey,
        recordKind: item.recordKind,
        score: item.score,
        accepted: item.accepted,
        reasonCodes: item.reasonCodes,
    }));
}

/**
 * 功能：提取 recall preview 的高信号内容，便于判断命中卡片与是否进入上下文。
 * @param preview recall preview 结果。
 * @returns 精简后的预览对象。
 */
function buildRecallPreviewSummary(preview: Nullable<MemoryRecallPreviewResult>): Record<string, unknown> | null {
    if (!preview) {
        return null;
    }
    return {
        previewMode: preview.previewMode,
        hitCount: preview.hitCount,
        selectedCount: preview.selectedCount,
        policyGate: preview.policyGate ?? null,
        cheapRecall: preview.cheapRecall ?? null,
        comparison: preview.comparison ?? null,
        hits: (preview.hits ?? []).slice(0, 12).map((hit) => ({
            title: hit.title,
            subject: hit.subject,
            lane: hit.lane,
            score: hit.score,
            matchedInRecall: hit.matchedInRecall,
            enteredContext: hit.enteredContext,
            reasonCodes: hit.reasonCodes,
        })),
    };
}

/**
 * 功能：读取 prompt 消息的可见文本，统一兼容 content、mes、text 字段。
 * @param message Prompt 消息对象。
 * @returns 归一化后的消息文本。
 */
function readPromptMessageContent(message: Record<string, unknown>): string {
    return String(message.content ?? message.mes ?? message.text ?? '').trim();
}

/**
 * 功能：按角色提取最终 prompt 中的 system 与 user 消息，便于单独检查两条注入链。
 * @param promptMessages 最终 prompt 消息数组。
 * @returns 分角色整理后的结果。
 */
function formatPromptMessageAtIndex(promptMessages: Array<Record<string, unknown>>, index: number): string {
    const message = promptMessages[index];
    if (!message) {
        return '(not found)';
    }
    const role = String(message.role ?? '').trim().toLowerCase();
    const content = readPromptMessageContent(message);
    return [`#${index} [${role || 'unknown'}]`, content || '(empty)'].join('\n');
}

/**
 * 功能：判断一条 prompt 消息是否应归入最终 system 输出。
 * @param message Prompt 消息对象。
 * @returns 是否属于 system 角色。
 */
function isSystemPromptMessage(message: Record<string, unknown>): boolean {
    return String(message.role ?? '').trim().toLowerCase() === 'system' || message.is_system === true;
}

/**
 * 功能：判断一条 prompt 消息是否应归入最终 user 输出。
 * @param message Prompt 消息对象。
 * @returns 是否属于 user 角色。
 */
function isUserPromptMessage(message: Record<string, unknown>): boolean {
    return String(message.role ?? '').trim().toLowerCase() === 'user' || message.is_user === true;
}

/**
 * 功能：按筛选条件整理最终 prompt 消息，尽量贴近酒馆请求中的 messages 视图。
 * @param promptMessages 最终 prompt 消息数组。
 * @param predicate 消息筛选条件。
 * @param emptyText 没有命中消息时显示的占位文本。
 * @returns 带索引与角色标签的多条消息文本。
 */
function formatPromptMessagesByPredicate(
    promptMessages: Array<Record<string, unknown>>,
    predicate: (message: Record<string, unknown>) => boolean,
    emptyText: string,
): string {
    const matched = promptMessages
        .map((message, index) => ({ message, index }))
        .filter(({ message }) => predicate(message))
        .map(({ index }) => formatPromptMessageAtIndex(promptMessages, index));
    return matched.length > 0 ? matched.join('\n\n') : emptyText;
}

/**
 * 功能：提取本轮真正插入的基础 system 注入与主链 user 注入消息。
 * @param result 注入流水线结果。
 * @returns 两条注入链对应的展示文本。
 */
function buildEffectivePromptOutputs(result: PromptInjectionPipelineResult): { system: string; user: string } {
    const promptMessages = result.finalPromptMessages as Array<Record<string, unknown>>;
    const system = formatPromptMessagesByPredicate(
        promptMessages,
        isSystemPromptMessage,
        '(最终 Prompt 中无 system 消息)',
    );
    const user = formatPromptMessagesByPredicate(
        promptMessages,
        isUserPromptMessage,
        '(最终 Prompt 中无 user 消息)',
    );
    return { system, user };
}

/**
 * 功能：提取本轮基础 System 注入对应的单条消息预览。
 * @param result 注入流水线结果。
 * @returns 单条注入消息文本，未注入时返回说明文本。
 */
function buildInsertedSystemPreview(result: PromptInjectionPipelineResult): string {
    if (!result.baseDiagnostics.inserted) {
        return `(本轮未插入基础 system 注入：${result.baseDiagnostics.skippedReason ?? 'unknown'})`;
    }
    const insertIndex = Number(result.baseDiagnostics.insertedIndex ?? -1);
    const promptMessages = result.finalPromptMessages as Array<Record<string, unknown>>;
    if (insertIndex < 0 || insertIndex >= promptMessages.length) {
        return `(基础 system 注入索引异常：${insertIndex})`;
    }
    return formatPromptMessageAtIndex(promptMessages, insertIndex);
}

/**
 * 功能：将 prompt messages 规范化为可比较的签名列表。
 * @param promptMessages prompt 消息数组。
 * @returns 仅用于比对的签名文本列表。
 */
function buildPromptMessageSignatures(promptMessages: Array<Record<string, unknown>>): string[] {
    return promptMessages.map((message: Record<string, unknown>): string => {
        const role = String(message.role ?? '').trim().toLowerCase();
        const content = readPromptMessageContent(message);
        return `${role}::${content}`;
    });
}

/**
 * 功能：计算“注入后 Prompt”相对“原始捕获 Prompt”的新增消息列表。
 * @param capturedPromptMessages 原始捕获 prompt。
 * @param finalPromptMessages 注入后 prompt。
 * @returns 可直接展示的新增消息文本。
 */
function buildPromptDiffText(
    capturedPromptMessages: Array<Record<string, unknown>>,
    finalPromptMessages: Array<Record<string, unknown>>,
): string {
    const capturedSignatureSet = new Set<string>(buildPromptMessageSignatures(capturedPromptMessages));
    const appendedEntries = finalPromptMessages
        .map((message: Record<string, unknown>, index: number): { message: Record<string, unknown>; index: number } => ({ message, index }))
        .filter(({ message }): boolean => !capturedSignatureSet.has(`${String(message.role ?? '').trim().toLowerCase()}::${readPromptMessageContent(message)}`))
        .map(({ message, index }): string => {
            const role = String(message.role ?? '').trim().toLowerCase() || 'unknown';
            const content = readPromptMessageContent(message) || '(empty)';
            return [`#${index} [${role}]`, content].join('\n');
        });
    return appendedEntries.length > 0 ? appendedEntries.join('\n\n') : '(无新增消息，final 与 captured 一致)';
}

/**
 * 功能：把当前测试台输入组装为完整测试包，便于导出与回放。
 * @param database 当前测试 chatKey 对应的数据库快照。
 * @returns 包含 prompt、query 与设置快照的测试包对象。
 */
function buildBundleFromCurrentInput(database: MemoryPromptTestBundle['database']): MemoryPromptTestBundle {
    return {
        version: '1.0.0',
        exportedAt: Date.now(),
        sourceChatKey: String(chatKeyInput.value || '').trim(),
        database,
        promptFixture: readPromptMessages(),
        query: String(queryInput.value || '').trim(),
        sourceMessageId: String(sourceMessageIdInput.value || '').trim() || undefined,
        settings: readSettingsJson(),
        captureMeta: {
            mode: 'simulated_prompt',
            note: 'manual_editor_bundle',
        },
    };
}

/**
 * 功能：将各种导入形态归一化为测试包结构。
 * @param raw 原始 JSON 解析结果。
 * @returns 归一化后的测试包，失败则返回 null。
 */
function normalizeBundleFromUnknown(raw: unknown): Nullable<MemoryPromptTestBundle> {
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const record = raw as Record<string, unknown>;
    const readMaintenanceExportDatabase = (): Nullable<MemoryChatDatabaseSnapshot> => {
        const hasMaintenanceFields = typeof record.chatKey === 'string'
            && Array.isArray(record.events)
            && Array.isArray(record.facts)
            && Array.isArray(record.state);
        if (!hasMaintenanceFields) {
            return null;
        }
        const bindingValue = record.binding;
        const templateBindings = bindingValue && typeof bindingValue === 'object'
            ? [bindingValue]
            : [];
        const chatKey = String(record.chatKey ?? '').trim();
        const inferredActorKey = inferActorKeyFromChatKey(chatKey);
        const fallbackPluginState = inferredActorKey
            ? {
                pluginId: 'stx_memory_os',
                chatKey,
                schemaVersion: 1,
                state: {
                    activeActorKey: inferredActorKey,
                    roleProfiles: {
                        [inferredActorKey]: {
                            actorKey: inferredActorKey,
                            displayName: inferredActorKey,
                        },
                    },
                },
                summary: {},
                updatedAt: Date.now(),
            }
            : null;
        const exportedAtValue = record.exportedAt;
        const exportedAtMs = typeof exportedAtValue === 'string'
            ? Date.parse(exportedAtValue)
            : Number(exportedAtValue);
        return {
            chatKey,
            generatedAt: Number.isFinite(exportedAtMs) ? exportedAtMs : Date.now(),
            events: Array.isArray(record.events) ? record.events : [],
            facts: Array.isArray(record.facts) ? record.facts : [],
            worldState: Array.isArray(record.state) ? record.state : [],
            summaries: Array.isArray(record.summaries) ? record.summaries : [],
            templates: Array.isArray(record.templates) ? record.templates : [],
            audit: [],
            meta: (record.meta && typeof record.meta === 'object') ? record.meta : null,
            worldinfoCache: [],
            templateBindings,
            memoryCards: [],
            memoryCardEmbeddings: [],
            memoryCardMeta: [],
            relationshipMemory: [],
            memoryRecallLog: [],
            memoryMutationHistory: [],
            pluginState: fallbackPluginState as unknown as MemoryChatDatabaseSnapshot['pluginState'],
            pluginRecords: [],
        } as unknown as MemoryChatDatabaseSnapshot;
    };

    const wrappedRecord = (() => {
        if (record.payload && typeof record.payload === 'object') {
            return record.payload as Record<string, unknown>;
        }
        if (record.bundle && typeof record.bundle === 'object') {
            return record.bundle as Record<string, unknown>;
        }
        return record;
    })();

    const possibleDatabase = isDatabaseSnapshotLike(wrappedRecord.database)
        ? wrappedRecord.database
        : isDatabaseSnapshotLike(wrappedRecord)
            ? (wrappedRecord as unknown as MemoryChatDatabaseSnapshot)
            : isDatabaseSnapshotLike(wrappedRecord.snapshot)
                ? (wrappedRecord.snapshot as MemoryChatDatabaseSnapshot)
                : isDatabaseSnapshotLike(wrappedRecord.data)
                    ? (wrappedRecord.data as MemoryChatDatabaseSnapshot)
                    : readMaintenanceExportDatabase();
    if (!possibleDatabase) {
        return null;
    }

    const normalizedVersion = String(wrappedRecord.version ?? record.version ?? '1.0.0').trim() || '1.0.0';
    const promptFixture = Array.isArray(wrappedRecord.promptFixture)
        ? (wrappedRecord.promptFixture as Array<Record<string, unknown>>)
        : [];
    const query = String(wrappedRecord.query ?? record.query ?? queryInput.value ?? '').trim();
    const sourceMessageId = String(wrappedRecord.sourceMessageId ?? record.sourceMessageId ?? sourceMessageIdInput.value ?? '').trim() || undefined;
    const settings = (wrappedRecord.settings && typeof wrappedRecord.settings === 'object')
        ? (wrappedRecord.settings as Record<string, unknown>)
        : readSettingsJson();

    return {
        version: normalizedVersion === '1.0.0' ? '1.0.0' : '1.0.0',
        exportedAt: Number(wrappedRecord.exportedAt ?? record.exportedAt ?? Date.now()),
        sourceChatKey: String(wrappedRecord.sourceChatKey ?? record.sourceChatKey ?? possibleDatabase.chatKey ?? '').trim(),
        database: possibleDatabase,
        promptFixture,
        query,
        sourceMessageId,
        settings,
        captureMeta: (() => {
            const rawCaptureMeta = wrappedRecord.captureMeta;
            if (rawCaptureMeta && typeof rawCaptureMeta === 'object') {
                const captureMetaRecord = rawCaptureMeta as Record<string, unknown>;
                const mode = String(captureMetaRecord.mode ?? '').trim() === 'exact_replay' ? 'exact_replay' : 'simulated_prompt';
                return {
                    mode,
                    capturedAt: Number(captureMetaRecord.capturedAt ?? 0) || undefined,
                    source: String(captureMetaRecord.source ?? '').trim() || undefined,
                    note: String(captureMetaRecord.note ?? '').trim() || undefined,
                } as MemoryPromptTestBundle['captureMeta'];
            }
            return {
                mode: promptFixture.length > 0 ? 'simulated_prompt' : 'simulated_prompt',
                note: 'bundle_without_capture_meta',
            } as MemoryPromptTestBundle['captureMeta'];
        })(),
        expectation: (wrappedRecord.expectation && typeof wrappedRecord.expectation === 'object')
            ? (wrappedRecord.expectation as MemoryPromptTestBundle['expectation'])
            : undefined,
        runResult: (wrappedRecord.runResult && typeof wrappedRecord.runResult === 'object')
            ? (wrappedRecord.runResult as Record<string, unknown>)
            : undefined,
    };
}

/**
 * 功能：把测试包回填到页面输入区。
 * @param bundle 测试包对象。
 * @returns 无返回值。
 */
function applyBundleToEditor(bundle: MemoryPromptTestBundle): void {
    activeBundle = bundle;
    chatKeyInput.value = String(bundle.database?.chatKey ?? bundle.sourceChatKey ?? '');
    queryInput.value = String(bundle.query ?? '');
    sourceMessageIdInput.value = String(bundle.sourceMessageId ?? '');
    promptInput.value = formatJson(Array.isArray(bundle.promptFixture) ? bundle.promptFixture : []);
    settingsInput.value = formatJson(bundle.settings ?? DEFAULT_SETTINGS);
    bundleInput.value = formatJson(bundle);
    capturedPromptOutput.textContent = formatJson(Array.isArray(bundle.promptFixture) ? bundle.promptFixture : []);
    promptDiffOutput.textContent = '(等待运行)';
    renderActiveChat(chatKeyInput.value);
    const captureMode = bundle.captureMeta?.mode === 'exact_replay' ? 'exact_replay' : 'simulated_prompt';
    const promptFixtureCount = Array.isArray(bundle.promptFixture) ? bundle.promptFixture.length : 0;
    pipelineLogOutput.textContent = captureMode === 'exact_replay'
        ? `已加载真实捕获测试包（exact_replay），promptFixture=${promptFixtureCount}`
        : `已加载模拟测试包（simulated_prompt），promptFixture=${promptFixtureCount}`;
}

/**
 * 功能：解析测试包编辑器中的 JSON。
 * @returns 解析后的测试包。
 */
function readBundleFromEditor(): Nullable<MemoryPromptTestBundle> {
    const parsed = parseJsonSafe<unknown>(bundleInput.value);
    return normalizeBundleFromUnknown(parsed);
}

/**
 * 功能：运行完整注入流程。
 * @returns 无返回值。
 */
async function runPipeline(): Promise<void> {
    ensureMockContext();
    const chatKey = String(chatKeyInput.value || '').trim() || `memory_test::${Date.now()}`;
    const promptMessages = readPromptMessages();
    const capturedPromptMessages = [...promptMessages];
    const settings = readSettingsJson();
    const sdk = new MemorySDKImpl(chatKey);
    try {
        const recallPreview = await sdk.editor.runMemoryRecallPreview(
            String(queryInput.value || '').trim(),
            { maxTokens: Number(settings.contextMaxTokens) || 1200 },
        );
        const result = await runPromptReadyInjectionPipeline({
            memory: sdk,
            promptMessages: promptMessages as any,
            readSettings: () => settings as Record<string, any>,
            query: String(queryInput.value || '').trim(),
            sourceMessageId: String(sourceMessageIdInput.value || '').trim() || undefined,
            source: 'memory_testbed_manual_run',
            currentChatKey: chatKey,
        });
        const roleOutputs = buildEffectivePromptOutputs(result);
        lastRunResult = result;
        pipelineLogOutput.textContent = formatJson(result.logs);
        capturedPromptOutput.textContent = formatJson(capturedPromptMessages);
        systemPromptOutput.textContent = roleOutputs.system;
        systemInsertedOutput.textContent = buildInsertedSystemPreview(result);
        userPromptOutput.textContent = roleOutputs.user;
        finalPromptOutput.textContent = formatJson(result.finalPromptMessages);
        promptDiffOutput.textContent = buildPromptDiffText(
            capturedPromptMessages,
            result.finalPromptMessages as Array<Record<string, unknown>>,
        );
        explanationOutput.textContent = formatJson(result.latestExplanation ?? {});
        settingsPreviewOutput.textContent = formatJson({
            settings,
            captureMode: activeBundle?.captureMeta?.mode ?? 'simulated_prompt',
            capturedPromptMessageCount: Array.isArray(activeBundle?.promptFixture) ? activeBundle!.promptFixture.length : promptMessages.length,
            finalPromptMessageCount: result.finalPromptMessages.length,
            insertedSystemCount: result.baseDiagnostics.inserted ? 1 : 0,
            insertedUserCount: result.injectionResult.inserted ? 1 : 0,
            baseDiagnostics: result.baseDiagnostics,
            injectionResult: result.injectionResult,
        });
        selectedCandidatesOutput.textContent = formatJson(
            buildSelectedCandidatesPreview((result.latestExplanation ?? null) as Nullable<LatestRecallExplanation>),
        );
        recallPreviewOutput.textContent = formatJson(buildRecallPreviewSummary(recallPreview));
        renderFunnel(result);
        renderActiveChat(chatKey);
        if (activeBundle?.database) {
            const nextBundle = {
                ...activeBundle,
                runResult: {
                    logs: result.logs,
                    baseDiagnostics: result.baseDiagnostics,
                    injectionResult: result.injectionResult,
                },
            };
            activeBundle = nextBundle;
            bundleInput.value = formatJson(nextBundle);
        }
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：从当前 chatKey 导出完整测试包。
 * @returns 无返回值。
 */
async function exportBundleFromCurrentChat(): Promise<void> {
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        pipelineLogOutput.textContent = '请先填写当前测试 ChatKey。';
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        const bundle = await sdk.chatState.exportPromptTestBundleForTest({
            query: String(queryInput.value || '').trim(),
            sourceMessageId: String(sourceMessageIdInput.value || '').trim() || undefined,
            settings: readSettingsJson(),
            runResult: lastRunResult ? {
                logs: lastRunResult.logs,
                baseDiagnostics: lastRunResult.baseDiagnostics,
                injectionResult: lastRunResult.injectionResult,
            } : undefined,
        });
        applyBundleToEditor(bundle as unknown as MemoryPromptTestBundle);
        const captureMode = (bundle as MemoryPromptTestBundle).captureMeta?.mode ?? 'simulated_prompt';
        if (captureMode !== 'exact_replay') {
            pipelineLogOutput.textContent = '导出成功，但当前包为 simulated_prompt。请先在酒馆触发一次真实回复后再导出。';
        } else {
            pipelineLogOutput.textContent = '已从当前 chat 导出真实捕获测试包（exact_replay）。';
        }
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：导入测试包并写入测试 chatKey。
 * @returns 无返回值。
 */
async function importBundleFromEditor(): Promise<void> {
    const raw = parseJsonSafe<unknown>(bundleInput.value);
    const bundle = normalizeBundleFromUnknown(raw);
    if (!bundle) {
        const keys = raw && typeof raw === 'object'
            ? Object.keys(raw as Record<string, unknown>).join(', ')
            : '(not-an-object)';
        pipelineLogOutput.textContent = `测试包 JSON 无效。支持：完整测试包、数据库快照（worldState）或维护导出包（state）。\n检测到根字段：${keys}`;
        return;
    }
    const targetChatKey = String(chatKeyInput.value || '').trim() || `memory_test::${Date.now()}`;
    const sdk = new MemorySDKImpl(targetChatKey);
    try {
        const imported = await sdk.chatState.importPromptTestBundleForTest(bundle, { targetChatKey });
        applyBundleToEditor(imported.bundle as unknown as MemoryPromptTestBundle);
        pipelineLogOutput.textContent = `导入完成，chatKey=${imported.chatKey}`;
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：触发测试包文件下载。
 * @returns 无返回值。
 */
function exportBundleToFile(): void {
    const bundle = readBundleFromEditor() ?? activeBundle;
    if (!bundle) {
        pipelineLogOutput.textContent = '暂无可导出的测试包，请先导入或导出一次。';
        return;
    }
    const blob = new Blob([formatJson(bundle)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memory-prompt-test-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * 功能：读取本地 JSON 文件并导入到编辑器。
 * @param file 选择的文件。
 * @returns 无返回值。
 */
async function importBundleFromFile(file: File): Promise<void> {
    const text = await file.text();
    bundleInput.value = text;
    await importBundleFromEditor();
}

/**
 * 功能：读取并展示当前 chatKey 的数据库快照，辅助排查注入命中问题。
 * @returns 异步执行完成。
 */
async function previewCurrentDatabase(): Promise<void> {
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        pipelineLogOutput.textContent = '请先填写当前测试 ChatKey。';
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        const snapshot = await sdk.chatState.exportCurrentChatDatabaseSnapshotForTest();
        dbPreviewOutput.textContent = formatJson({
            summary: buildDatabasePreviewSummary(snapshot),
            detail: snapshot,
        });
        pipelineLogOutput.textContent = `数据库快照已更新，chatKey=${chatKey}`;
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：清空当前测试 chatKey 的 MemoryOS 数据，用于快速重置测试环境。
 * @returns 异步执行完成。
 */
async function clearCurrentTestDatabase(): Promise<void> {
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        pipelineLogOutput.textContent = '请先填写当前测试 ChatKey。';
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        const emptyBundle: MemoryPromptTestBundle = {
            version: '1.0.0',
            exportedAt: Date.now(),
            sourceChatKey: chatKey,
            database: {
                chatKey,
                generatedAt: Date.now(),
                events: [],
                facts: [],
                worldState: [],
                summaries: [],
                templates: [],
                audit: [],
                meta: null,
                worldinfoCache: [],
                templateBindings: [],
                memoryCards: [],
                memoryCardEmbeddings: [],
                memoryCardMeta: [],
                relationshipMemory: [],
                memoryRecallLog: [],
                memoryMutationHistory: [],
                pluginState: null,
                pluginRecords: [],
            },
            promptFixture: [],
            query: '',
            settings: readSettingsJson(),
            captureMeta: {
                mode: 'simulated_prompt',
                note: 'empty_bundle_for_clear',
            },
        };
        await sdk.chatState.importPromptTestBundleForTest(emptyBundle, {
            targetChatKey: chatKey,
            skipClear: false,
        });
        dbPreviewOutput.textContent = formatJson({
            chatKey,
            clearedAt: Date.now(),
            message: '当前测试数据库已清空',
        });
        pipelineLogOutput.textContent = `清空完成，chatKey=${chatKey}`;
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：初始化页面默认值与事件绑定。
 * @returns 无返回值。
 */
function bootstrapPage(): void {
    chatKeyInput.value = `memory_test::${Date.now()}`;
    queryInput.value = '厄尔多利亚是什么地方';
    sourceMessageIdInput.value = 'u-last';
    promptInput.value = formatJson(DEFAULT_PROMPT_MESSAGES);
    settingsInput.value = formatJson(DEFAULT_SETTINGS);
    renderActiveChat(chatKeyInput.value);

    runBtn.addEventListener('click', () => {
        void runPipeline();
    });
    clearResultBtn.addEventListener('click', () => {
        settingsPreviewOutput.textContent = '';
        pipelineLogOutput.textContent = '';
        capturedPromptOutput.textContent = '';
        promptDiffOutput.textContent = '';
        systemPromptOutput.textContent = '';
        systemInsertedOutput.textContent = '';
        userPromptOutput.textContent = '';
        finalPromptOutput.textContent = '';
        explanationOutput.textContent = '';
        selectedCandidatesOutput.textContent = '';
        recallPreviewOutput.textContent = '';
        renderFunnel(null);
        lastRunResult = null;
    });
    exportChatBtn.addEventListener('click', () => {
        void exportBundleFromCurrentChat();
    });
    importJsonBtn.addEventListener('click', () => {
        void importBundleFromEditor();
    });
    exportFileBtn.addEventListener('click', exportBundleToFile);
    previewDbBtn.addEventListener('click', () => {
        void previewCurrentDatabase();
    });
    clearDbBtn.addEventListener('click', () => {
        void clearCurrentTestDatabase();
    });
    importFileBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (event: Event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
            return;
        }
        void importBundleFromFile(file);
    });
}

bootstrapPage();
