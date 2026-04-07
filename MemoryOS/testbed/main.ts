import { MemorySDKImpl } from '../src/sdk/memory-sdk';
import { runPromptReadyInjectionPipeline, type PromptInjectionPipelineResult } from '../src/runtime/prompt-injection-pipeline';
import type { MemoryChatDatabaseSnapshot, MemoryPromptTestBundle } from '../src/db/db';
import { normalizePromptTestBundleFromUnknown, detectPromptTestBundleMode } from './bundle';
import { createTestbedLogger } from './logger';
import {
    buildReplayBaselineFromPipeline,
    compareExactReplayResult,
    extractExactReplayBaseline,
    formatParityReport,
    type TestbedParityReport,
} from './parity';

const DEFAULT_SETTINGS = {
    contextMaxTokens: 1200,
    injectionPromptEnabled: true,
    injectionPreviewEnabled: true,
};

const DEFAULT_PROMPT_MESSAGES: Array<Record<string, unknown>> = [
    { role: 'system', is_system: true, content: "Write Seraphina's next reply in a fictional chat." },
    { role: 'assistant', content: '你刚醒来，四周是林间空地。' },
    { role: 'user', is_user: true, content: '厄尔多利亚是什么地方', mes_id: 'u-last' },
];

/**
 * 功能：安全获取页面元素。
 * @param id 元素 ID。
 * @returns 对应的 DOM 元素。
 */
function requireElement<T extends HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`missing_element:${id}`);
    }
    return element as T;
}

const chatKeyInput = requireElement<HTMLInputElement>('chat-key-input');
const queryInput = requireElement<HTMLInputElement>('query-input');
const sourceMessageIdInput = requireElement<HTMLInputElement>('source-message-id-input');
const promptInput = requireElement<HTMLTextAreaElement>('prompt-input');
const settingsInput = requireElement<HTMLTextAreaElement>('settings-input');
const bundleInput = requireElement<HTMLTextAreaElement>('bundle-input');
const activeChatChip = requireElement<HTMLSpanElement>('active-chat-chip');

const capturedPromptOutput = requireElement<HTMLPreElement>('captured-prompt-output');
const finalPromptOutput = requireElement<HTMLPreElement>('final-prompt-output');
const promptDiffOutput = requireElement<HTMLPreElement>('prompt-diff-output');
const strictParityOutput = requireElement<HTMLPreElement>('strict-parity-output');
const dbPreviewOutput = requireElement<HTMLPreElement>('db-preview-output');
const runLogOutput = requireElement<HTMLTextAreaElement>('run-log-output');

const runBtn = requireElement<HTMLButtonElement>('run-btn');
const clearResultBtn = requireElement<HTMLButtonElement>('clear-result-btn');
const importJsonBtn = requireElement<HTMLButtonElement>('import-json-btn');
const exportChatBtn = requireElement<HTMLButtonElement>('export-chat-btn');
const importFileBtn = requireElement<HTMLButtonElement>('import-file-btn');
const exportFileBtn = requireElement<HTMLButtonElement>('export-file-btn');
const previewDbBtn = requireElement<HTMLButtonElement>('preview-db-btn');
const clearDbBtn = requireElement<HTMLButtonElement>('clear-db-btn');
const importFileInput = requireElement<HTMLInputElement>('import-file-input');

const logger = createTestbedLogger((text: string): void => {
    runLogOutput.value = text;
});

let activeBundle: MemoryPromptTestBundle | null = null;
let lastParityReport: TestbedParityReport | null = null;

/**
 * 功能：释放 MemorySDK 资源。
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
 * 功能：确保测试台运行时存在酒馆上下文。
 * @returns 无返回值。
 */
function ensureMockContext(): void {
    const root = globalThis as unknown as { SillyTavern?: Record<string, unknown>; window?: Record<string, unknown> };
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
        root.window = root as unknown as Record<string, unknown>;
    }
    root.window.SillyTavern = root.SillyTavern;
}

/**
 * 功能：安全解析 JSON 字符串。
 * @param text 输入文本。
 * @returns 解析结果。
 */
function parseJsonSafe<T>(text: string): T | null {
    try {
        return JSON.parse(text) as T;
    } catch {
        return null;
    }
}

/**
 * 功能：格式化 JSON 输出。
 * @param value 待格式化对象。
 * @returns 格式化文本。
 */
function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
}

/**
 * 功能：深拷贝 PromptFixture。
 * @param promptFixture PromptFixture 原始数组。
 * @returns 深拷贝后的数组。
 */
function clonePromptFixture(promptFixture: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
    return promptFixture.map((item: Record<string, unknown>): Record<string, unknown> => ({ ...item }));
}

/**
 * 功能：读取设置 JSON。
 * @returns 设置对象。
 */
function readSettingsJson(): Record<string, unknown> {
    const parsed = parseJsonSafe<Record<string, unknown>>(settingsInput.value);
    if (parsed && typeof parsed === 'object') {
        return parsed;
    }
    return { ...DEFAULT_SETTINGS };
}

/**
 * 功能：读取 PromptFixture。
 * @returns PromptFixture 数组。
 */
function readPromptMessages(): Array<Record<string, unknown>> {
    const parsed = parseJsonSafe<Array<Record<string, unknown>>>(promptInput.value);
    if (Array.isArray(parsed)) {
        return parsed;
    }
    return clonePromptFixture(DEFAULT_PROMPT_MESSAGES);
}

/**
 * 功能：渲染当前活动 chatKey。
 * @param chatKey 聊天键。
 * @returns 无返回值。
 */
function renderActiveChat(chatKey: string): void {
    activeChatChip.textContent = `chat: ${chatKey || '(none)'}`;
}

/**
 * 功能：构建数据库快照摘要。
 * @param snapshot 数据库快照。
 * @returns 摘要对象。
 */
function buildDatabasePreviewSummary(snapshot: MemoryChatDatabaseSnapshot): Record<string, unknown> {
    return {
        chatKey: snapshot.chatKey,
        generatedAt: snapshot.generatedAt,
        counts: {
            events: snapshot.events.length,
            templates: snapshot.templates.length,
            audit: snapshot.audit.length,
            memoryMutationHistory: snapshot.memoryMutationHistory.length,
            memoryEntries: snapshot.memoryEntries.length,
            memoryEntryTypes: snapshot.memoryEntryTypes.length,
            actorMemoryProfiles: snapshot.actorMemoryProfiles.length,
            roleEntryMemory: snapshot.roleEntryMemory.length,
            summarySnapshots: snapshot.summarySnapshots.length,
            worldProfileBindings: snapshot.worldProfileBindings.length,
            pluginRecords: snapshot.pluginRecords.length,
        },
    };
}

/**
 * 功能：将任意对象归一化为测试包。
 * @param raw 原始对象。
 * @returns 测试包。
 */
function normalizeBundle(raw: unknown): MemoryPromptTestBundle | null {
    return normalizePromptTestBundleFromUnknown(raw, {
        fallbackQuery: String(queryInput.value ?? ''),
        fallbackSourceMessageId: String(sourceMessageIdInput.value ?? ''),
        fallbackSettings: readSettingsJson(),
    });
}

/**
 * 功能：从编辑器读取测试包。
 * @returns 测试包对象。
 */
function readBundleFromEditor(): MemoryPromptTestBundle | null {
    const parsed = parseJsonSafe<unknown>(bundleInput.value);
    return normalizeBundle(parsed);
}

/**
 * 功能：把测试包同步到左侧输入区域。
 * @param bundle 测试包。
 * @returns 无返回值。
 */
function applyBundleToEditor(bundle: MemoryPromptTestBundle): void {
    activeBundle = bundle;
    chatKeyInput.value = String(bundle.database.chatKey || bundle.sourceChatKey || '');
    queryInput.value = String(bundle.query || '');
    sourceMessageIdInput.value = String(bundle.sourceMessageId || '');
    promptInput.value = formatJson(Array.isArray(bundle.promptFixture) ? bundle.promptFixture : []);
    settingsInput.value = formatJson(bundle.settings ?? DEFAULT_SETTINGS);
    bundleInput.value = formatJson(bundle);
    renderActiveChat(chatKeyInput.value);
}

/**
 * 功能：格式化最终 Prompt 文本差异。
 * @param baseline 基准文本。
 * @param replay 回放文本。
 * @returns 差异文本。
 */
function buildPromptTextDiff(baseline: string, replay: string): string {
    if (baseline === replay) {
        return '(无差异)';
    }
    const baselineLines = baseline.split('\n');
    const replayLines = replay.split('\n');
    const maxLine = Math.max(baselineLines.length, replayLines.length);
    const output: string[] = [];
    for (let index = 0; index < maxLine; index += 1) {
        const left = baselineLines[index] ?? '';
        const right = replayLines[index] ?? '';
        if (left === right) {
            continue;
        }
        output.push(`- [${index + 1}] ${left}`);
        output.push(`+ [${index + 1}] ${right}`);
        if (output.length >= 120) {
            output.push('...（差异过多，已截断）');
            break;
        }
    }
    return output.join('\n');
}

/**
 * 功能：把 PromptFixture 渲染为可读文本。
 * @param promptFixture PromptFixture 数组。
 * @returns 渲染文本。
 */
function renderPromptFixtureText(promptFixture: Array<Record<string, unknown>>): string {
    if (promptFixture.length <= 0) {
        return '(空 PromptFixture)';
    }
    return promptFixture
        .map((item: Record<string, unknown>, index: number): string => {
            const role = String(item.role ?? '').trim() || 'unknown';
            const content = String(item.content ?? item.mes ?? item.text ?? '').trim();
            return `#${index} [${role}]\n${content}`;
        })
        .join('\n\n');
}

/**
 * 功能：构建并显示严格一致性结果。
 * @param report 一致性报告。
 * @returns 无返回值。
 */
function renderParityReport(report: TestbedParityReport): void {
    strictParityOutput.textContent = formatParityReport(report);
    lastParityReport = report;
}

/**
 * 功能：执行 exact replay 主链路并完成严格比对。
 * @returns 异步执行完成。
 */
async function runPipeline(): Promise<void> {
    ensureMockContext();
    logger.clear();
    logger.section('读取测试包');

    const bundle = readBundleFromEditor() ?? activeBundle;
    if (!bundle) {
        logger.error('未读取到有效测试包，请先导入或粘贴测试包 JSON。');
        return;
    }

    const mode = detectPromptTestBundleMode(bundle);
    logger.info(`测试模式：${mode === 'exact_replay' ? 'exact_replay（严格模式）' : 'simulated_prompt（仅排障）'}`);
    const targetChatKey = String(chatKeyInput.value || bundle.database.chatKey || '').trim() || `memory_test::${Date.now()}`;
    renderActiveChat(targetChatKey);

    const sdk = new MemorySDKImpl(targetChatKey);
    try {
        await sdk.init();
        logger.section('导入数据库');
        const imported = await sdk.chatState.importPromptTestBundleForTest(bundle, {
            targetChatKey,
            skipClear: false,
        });
        const importedBundle = imported.bundle;
        applyBundleToEditor(importedBundle);
        dbPreviewOutput.textContent = formatJson(buildDatabasePreviewSummary(importedBundle.database));
        logger.info('数据库导入完成。', {
            targetChatKey: imported.chatKey,
            memoryEntries: importedBundle.database.memoryEntries.length,
            worldProfileBindings: importedBundle.database.worldProfileBindings.length,
        });

        logger.section('加载 PromptFixture');
        const promptFixture = Array.isArray(importedBundle.promptFixture) && importedBundle.promptFixture.length > 0
            ? clonePromptFixture(importedBundle.promptFixture)
            : readPromptMessages();
        logger.info('PromptFixture 已加载。', { messageCount: promptFixture.length });

        const query = String(importedBundle.query ?? queryInput.value ?? '').trim();
        const sourceMessageId = String(importedBundle.sourceMessageId ?? sourceMessageIdInput.value ?? '').trim() || undefined;
        const settings = (importedBundle.settings && typeof importedBundle.settings === 'object')
            ? importedBundle.settings
            : readSettingsJson();
        const settingsMaxTokens = Number(settings.contextMaxTokens ?? DEFAULT_SETTINGS.contextMaxTokens) || DEFAULT_SETTINGS.contextMaxTokens;

        logger.section('识别角色与查询');
        logger.info('当前查询已确定。', {
            query: query || '(空)',
            sourceMessageId: sourceMessageId ?? '(空)',
        });

        logger.section('世界模板判定');
        const worldBinding = importedBundle.database.worldProfileBindings[0];
        if (worldBinding) {
            logger.info('命中已持久化 world_profile_binding。', {
                primaryProfile: worldBinding.primaryProfile,
                secondaryProfiles: worldBinding.secondaryProfiles,
                confidence: worldBinding.confidence,
                reasonCodes: worldBinding.reasonCodes,
            });
        } else {
            logger.warn('未找到 world_profile_binding，将走链路内 fallback 检测。');
        }

        const replayPromptMessages = clonePromptFixture(promptFixture);
        const pipelineResult: PromptInjectionPipelineResult = await runPromptReadyInjectionPipeline({
            memory: sdk,
            promptMessages: replayPromptMessages as any,
            readSettings: () => settings as any,
            query: query || undefined,
            sourceMessageId,
            source: 'memory_testbed_exact_replay',
            currentChatKey: targetChatKey,
        });

        const replayBaseline = buildReplayBaselineFromPipeline(pipelineResult);
        const baseline = extractExactReplayBaseline(importedBundle);
        const parityReport = compareExactReplayResult(baseline, replayBaseline, mode);

        logger.section('构建注入上下文');
        logger.info('已完成 world_base / scene_shared / actor_view 组装。', {
            matchedActorKeys: replayBaseline.matchedActorKeys,
            matchedEntryIds: replayBaseline.matchedEntryIds,
            reasonCodes: replayBaseline.reasonCodes,
        });

        logger.section('预算裁剪结果');
        logger.info('预算裁剪执行完成。', {
            candidateCounts: pipelineResult.baseDiagnostics.candidateCounts,
            finalTextLength: pipelineResult.baseDiagnostics.finalTextLength,
            settingsMaxTokens,
        });

        logger.section('注入位置判定');
        logger.info('注入位置已计算。', {
            insertIndex: replayBaseline.insertIndex,
            insertedBlockLength: replayBaseline.insertedMemoryBlock.length,
        });

        logger.section('最终一致性比对结果');
        if (parityReport.pass) {
            logger.info('严格一致性校验通过。');
        } else {
            logger.warn('严格一致性校验未通过。', {
                strictComparable: parityReport.strictComparable,
                mismatchCount: parityReport.mismatches.length,
            });
        }
        logger.dump('一致性详情', parityReport);

        const baselinePromptText = baseline
            ? baseline.finalPromptText
            : renderPromptFixtureText(promptFixture);
        capturedPromptOutput.textContent = baselinePromptText;
        finalPromptOutput.textContent = replayBaseline.finalPromptText;
        promptDiffOutput.textContent = buildPromptTextDiff(baselinePromptText, replayBaseline.finalPromptText);
        renderParityReport(parityReport);

        const nextBundle: MemoryPromptTestBundle = {
            ...importedBundle,
            query,
            sourceMessageId,
            settings,
            runResult: {
                finalPromptText: replayBaseline.finalPromptText,
                insertIndex: replayBaseline.insertIndex,
                insertedMemoryBlock: replayBaseline.insertedMemoryBlock,
                reasonCodes: replayBaseline.reasonCodes,
                matchedActorKeys: replayBaseline.matchedActorKeys,
                matchedEntryIds: replayBaseline.matchedEntryIds,
                pipelineLogs: pipelineResult.logs,
                baseDiagnostics: pipelineResult.baseDiagnostics,
                injectionResult: pipelineResult.injectionResult,
            },
        };
        activeBundle = nextBundle;
        bundleInput.value = formatJson(nextBundle);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`运行失败：${message}`);
        strictParityOutput.textContent = `运行失败：${message}`;
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：从当前 chat 导出测试包。
 * @returns 异步执行完成。
 */
async function exportBundleFromCurrentChat(): Promise<void> {
    logger.clear();
    logger.section('导出当前会话测试包');
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        logger.error('请先填写当前测试 ChatKey。');
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        await sdk.init();
        const latestCapture = await sdk.chatState.getLatestPromptReadyCaptureSnapshotForTest();
        const bundle = await sdk.chatState.exportPromptTestBundleForTest({
            query: String(queryInput.value || latestCapture?.query || '').trim(),
            sourceMessageId: String(sourceMessageIdInput.value || latestCapture?.sourceMessageId || '').trim() || undefined,
            settings: readSettingsJson(),
            runResult: activeBundle?.runResult,
            parityBaseline: activeBundle?.parityBaseline,
        });
        applyBundleToEditor(bundle);
        const mode = detectPromptTestBundleMode(bundle);
        if (mode === 'exact_replay') {
            logger.info('导出成功：已导出真实 prompt-ready 抓包（exact_replay）。');
        } else {
            logger.warn('导出成功：当前为 simulated_prompt，不可用于严格一致验收。');
        }
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：导入编辑器里的测试包到目标 chatKey。
 * @returns 异步执行完成。
 */
async function importBundleFromEditor(): Promise<void> {
    logger.clear();
    logger.section('导入测试包');
    const bundle = readBundleFromEditor();
    if (!bundle) {
        logger.error('测试包 JSON 无效，无法导入。');
        return;
    }
    const targetChatKey = String(chatKeyInput.value || bundle.database.chatKey || '').trim() || `memory_test::${Date.now()}`;
    const sdk = new MemorySDKImpl(targetChatKey);
    try {
        await sdk.init();
        const imported = await sdk.chatState.importPromptTestBundleForTest(bundle, { targetChatKey });
        applyBundleToEditor(imported.bundle);
        logger.info(`导入完成：chatKey=${imported.chatKey}`);
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：导出当前编辑器中的测试包为文件。
 * @returns 无返回值。
 */
function exportBundleToFile(): void {
    const bundle = readBundleFromEditor() ?? activeBundle;
    if (!bundle) {
        logger.clear();
        logger.error('暂无可导出的测试包。');
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
 * 功能：读取本地 JSON 文件并导入。
 * @param file 上传文件。
 * @returns 异步执行完成。
 */
async function importBundleFromFile(file: File): Promise<void> {
    const text = await file.text();
    bundleInput.value = text;
    await importBundleFromEditor();
}

/**
 * 功能：预览当前 chatKey 的数据库快照。
 * @returns 异步执行完成。
 */
async function previewCurrentDatabase(): Promise<void> {
    logger.clear();
    logger.section('读取数据库快照');
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        logger.error('请先填写当前测试 ChatKey。');
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        await sdk.init();
        const snapshot = await sdk.chatState.exportCurrentChatDatabaseSnapshotForTest();
        dbPreviewOutput.textContent = formatJson({
            summary: buildDatabasePreviewSummary(snapshot),
            detail: snapshot,
        });
        logger.info('数据库快照读取完成。', {
            chatKey,
            memoryEntries: snapshot.memoryEntries.length,
            worldProfileBindings: snapshot.worldProfileBindings.length,
        });
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：清空当前测试 chatKey 的 MemoryOS 数据。
 * @returns 异步执行完成。
 */
async function clearCurrentTestDatabase(): Promise<void> {
    logger.clear();
    logger.section('清空数据库');
    const chatKey = String(chatKeyInput.value || '').trim();
    if (!chatKey) {
        logger.error('请先填写当前测试 ChatKey。');
        return;
    }
    const sdk = new MemorySDKImpl(chatKey);
    try {
        await sdk.init();
        const emptyBundle: MemoryPromptTestBundle = {
            version: '1.0.0',
            exportedAt: Date.now(),
            sourceChatKey: chatKey,
            database: {
                chatKey,
                generatedAt: Date.now(),
                events: [],
                templates: [],
                audit: [],
                meta: null,
                memoryMutationHistory: [],
                memoryEntries: [],
                memoryEntryTypes: [],
                actorMemoryProfiles: [],
                roleEntryMemory: [],
                summarySnapshots: [],
                worldProfileBindings: [],
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
            message: '当前测试数据库已清空。',
        });
        logger.info(`清空完成：chatKey=${chatKey}`);
    } finally {
        await disposeMemorySdk(sdk);
    }
}

/**
 * 功能：清空本轮可视化结果。
 * @returns 无返回值。
 */
function clearResultViews(): void {
    capturedPromptOutput.textContent = '';
    finalPromptOutput.textContent = '';
    promptDiffOutput.textContent = '';
    strictParityOutput.textContent = '';
    dbPreviewOutput.textContent = '';
    logger.clear();
    lastParityReport = null;
}

/**
 * 功能：初始化测试台页面。
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
    clearResultBtn.addEventListener('click', clearResultViews);
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

    document.addEventListener('click', async (event: Event): Promise<void> => {
        const target = event.target as HTMLElement;
        if (!target.matches('.copy-btn')) {
            return;
        }
        const targetId = target.getAttribute('data-target');
        if (!targetId) {
            return;
        }
        const element = document.getElementById(targetId) as HTMLTextAreaElement | HTMLPreElement | null;
        if (!element) {
            return;
        }
        const textToCopy = 'value' in element ? element.value : (element.textContent ?? '');
        if (!textToCopy) {
            return;
        }
        try {
            await navigator.clipboard.writeText(textToCopy);
            const originalText = target.textContent;
            target.textContent = '已复制!';
            target.classList.add('copied');
            setTimeout((): void => {
                target.textContent = originalText;
                target.classList.remove('copied');
            }, 2000);
        } catch {
            logger.warn('复制失败，可能是浏览器权限限制。');
        }
    });
}

bootstrapPage();
