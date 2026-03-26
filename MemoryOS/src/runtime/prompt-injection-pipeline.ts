import { createMemoryTraceContext } from '../core/memory-trace';
import type { BaseInjectionDiagnosticsSnapshot, BaseInjectionLayerBudget, InjectionSectionName } from '../types';
import { normalizeInjectionPromptSettings, type InjectionAggressiveness, type InjectionPromptOption, type InjectionPromptPreset } from '../injection/injection-prompt-settings';
import {
    findLastTavernPromptSystemIndexEvent,
    getTavernPromptMessageTextEvent,
    insertTavernPromptMessageEvent,
    type SdkTavernPromptMessageEvent,
} from '../../../SDK/tavern';

export interface PromptInjectionPipelineLogEntry {
    stage: string;
    status: 'ok' | 'failed';
    reasonCodes: string[];
    summary: string;
    details?: Record<string, unknown>;
}

export interface PromptInjectionPipelineResult {
    query: string;
    sourceMessageId?: string;
    settingsMaxTokens: number;
    baseDiagnostics: BaseInjectionDiagnosticsSnapshot;
    injectionResult: {
        shouldInject: boolean;
        inserted: boolean;
        insertIndex: number;
        promptLength: number;
        insertedLength: number;
        trace?: { stage?: string; label?: string; traceId?: string } | null;
    };
    latestExplanation: Record<string, unknown> | null;
    finalPromptMessages: SdkTavernPromptMessageEvent[];
    finalPromptText: string;
    logs: PromptInjectionPipelineLogEntry[];
}

/**
 * 功能：按积极度计算基础注入可用 token 预算，避免挤占主链注入空间。
 * @param contextMaxTokens 主注入可用预算。
 * @param aggressiveness 基础注入积极度。
 * @returns 基础注入 token 预算。
 */
function resolveBaseInjectionMaxTokens(contextMaxTokens: number, aggressiveness: InjectionAggressiveness): number {
    const safeContextMaxTokens = Number.isFinite(contextMaxTokens) ? Math.max(0, Math.floor(contextMaxTokens)) : 1200;
    const ratioByAggressiveness: Record<InjectionAggressiveness, number> = {
        stable: 0.24,
        balanced: 0.3,
        aggressive: 0.36,
    };
    const ratioBudget = Math.floor(safeContextMaxTokens * ratioByAggressiveness[aggressiveness]);
    return Math.max(120, Math.min(420, ratioBudget));
}

/**
 * 功能：将基础注入选项映射为 section 列表。
 * @param selectedOptions 用户勾选的基础注入选项。
 * @param forceDynamicFloor 是否强制带动态层。
 * @returns 去重后的 section 数组。
 */
function resolveBaseInjectionSections(selectedOptions: InjectionPromptOption[], forceDynamicFloor: boolean): InjectionSectionName[] {
    const sectionSet = new Set<InjectionSectionName>();
    selectedOptions.forEach((option: InjectionPromptOption): void => {
        if (option === 'world_setting') {
            sectionSet.add('WORLD_STATE');
            sectionSet.add('FACTS');
        }
        if (option === 'character_setting') sectionSet.add('CHARACTER_FACTS');
        if (option === 'relationship_state') sectionSet.add('RELATIONSHIPS');
        if (option === 'current_scene') sectionSet.add('LAST_SCENE');
        if (option === 'recent_plot') sectionSet.add('EVENTS');
    });
    if (forceDynamicFloor) {
        sectionSet.add('LAST_SCENE');
        sectionSet.add('EVENTS');
    }
    return Array.from(sectionSet);
}

/**
 * 功能：根据预设计算基础注入三层 sections。
 * @param input 预设与选项输入。
 * @returns 三层 section 配置。
 */
function resolveBaseLayerSections(input: {
    preset: InjectionPromptPreset;
    selectedOptions: InjectionPromptOption[];
    forceDynamicFloor: boolean;
}): {
    background: InjectionSectionName[];
    dynamic: InjectionSectionName[];
    reserve: InjectionSectionName[];
} {
    const selectedSet = new Set<InjectionPromptOption>(input.selectedOptions);
    const backgroundSet = new Set<InjectionSectionName>();
    const dynamicSet = new Set<InjectionSectionName>();
    const reserveSet = new Set<InjectionSectionName>(['SUMMARY', 'SHORT_SUMMARY']);

    if (selectedSet.has('world_setting')) backgroundSet.add('WORLD_STATE');
    if (selectedSet.has('world_setting')) backgroundSet.add('FACTS');
    if (selectedSet.has('character_setting')) backgroundSet.add('CHARACTER_FACTS');
    if (selectedSet.has('relationship_state')) backgroundSet.add('RELATIONSHIPS');
    if (selectedSet.has('current_scene')) dynamicSet.add('LAST_SCENE');
    if (selectedSet.has('recent_plot')) dynamicSet.add('EVENTS');

    if (input.preset === 'balanced_enhanced') {
        backgroundSet.add('WORLD_STATE');
        backgroundSet.add('FACTS');
        backgroundSet.add('CHARACTER_FACTS');
        backgroundSet.add('RELATIONSHIPS');
        dynamicSet.add('LAST_SCENE');
        dynamicSet.add('EVENTS');
    } else if (input.preset === 'story_priority') {
        dynamicSet.add('LAST_SCENE');
        dynamicSet.add('EVENTS');
        backgroundSet.add('RELATIONSHIPS');
        reserveSet.add('SUMMARY');
    } else if (input.preset === 'setting_priority') {
        backgroundSet.add('WORLD_STATE');
        backgroundSet.add('FACTS');
        backgroundSet.add('CHARACTER_FACTS');
        backgroundSet.add('RELATIONSHIPS');
        dynamicSet.add('LAST_SCENE');
    }

    if (input.forceDynamicFloor) {
        dynamicSet.add('LAST_SCENE');
        dynamicSet.add('EVENTS');
    }

    return {
        background: Array.from(backgroundSet),
        dynamic: Array.from(dynamicSet),
        reserve: Array.from(reserveSet),
    };
}

/**
 * 功能：按积极度拆分三层预算。
 * @param maxTokens 基础注入总预算。
 * @param aggressiveness 积极度档位。
 * @returns 三层预算。
 */
function resolveBaseLayerBudgets(maxTokens: number, aggressiveness: InjectionAggressiveness): {
    background: number;
    dynamic: number;
    reserve: number;
} {
    const presets: Record<InjectionAggressiveness, { background: number; dynamic: number; reserve: number }> = {
        stable: { background: 0.52, dynamic: 0.28, reserve: 0.2 },
        balanced: { background: 0.45, dynamic: 0.35, reserve: 0.2 },
        aggressive: { background: 0.4, dynamic: 0.42, reserve: 0.18 },
    };
    const ratio = presets[aggressiveness];
    const background = Math.max(40, Math.floor(maxTokens * ratio.background));
    const dynamic = Math.max(36, Math.floor(maxTokens * ratio.dynamic));
    const reserve = Math.max(24, maxTokens - background - dynamic);
    return { background, dynamic, reserve };
}

/**
 * 功能：粗估文本 token 数用于诊断展示。
 * @param text 文本内容。
 * @returns 估算 token 数。
 */
function estimateTokens(text: string): number {
    if (!text) {
        return 0;
    }
    const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
    const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
    return Math.max(1, Math.ceil(cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25));
}

/**
 * 功能：构建三层基础注入文本。
 * @param input 构建输入。
 * @returns 文本和层预算诊断。
 */
async function buildLayeredBaseContext(input: {
    memory: any;
    query: string;
    maxTokens: number;
    preset: InjectionPromptPreset;
    aggressiveness: InjectionAggressiveness;
    selectedOptions: InjectionPromptOption[];
    forceDynamicFloor: boolean;
}): Promise<{
    text: string;
    layerBudgets: BaseInjectionLayerBudget[];
}> {
    const layers = resolveBaseLayerSections({
        preset: input.preset,
        selectedOptions: input.selectedOptions,
        forceDynamicFloor: input.forceDynamicFloor,
    });
    const budgets = resolveBaseLayerBudgets(input.maxTokens, input.aggressiveness);
    const layerBudgets: BaseInjectionLayerBudget[] = [];
    const buildLayer = async (
        layer: BaseInjectionLayerBudget['layer'],
        sections: InjectionSectionName[],
        maxLayerTokens: number,
    ): Promise<string> => {
        if (!sections.length || !input.memory?.injection?.buildContext) {
            layerBudgets.push({ layer, maxTokens: maxLayerTokens, usedTokens: 0, sections });
            return '';
        }
        const result = await input.memory.injection.buildContext({
            maxTokens: maxLayerTokens,
            sections,
            query: input.query,
            preferSummary: true,
            intentHint: 'auto',
            includeDecisionMeta: true,
            bypassPreGenerationGate: true,
        });
        const text = (typeof result === 'string' ? result : String(result?.text ?? '')).trim();
        layerBudgets.push({ layer, maxTokens: maxLayerTokens, usedTokens: estimateTokens(text), sections });
        return text;
    };

    const [backgroundText, dynamicText] = await Promise.all([
        buildLayer('background', layers.background, budgets.background),
        buildLayer('dynamic', layers.dynamic, budgets.dynamic),
    ]);
    const reserveText = await buildLayer('reserve', layers.reserve, budgets.reserve);
    const parts: string[] = [];
    if (backgroundText) parts.push(`## 世界与规则\n${backgroundText}`);
    if (reserveText) parts.push(`## 角色与关系\n${reserveText}`);
    if (dynamicText) parts.push(`## 当前局势\n${dynamicText}`);
    return {
        text: parts.join('\n\n').trim(),
        layerBudgets,
    };
}

/**
 * 功能：把基础注入文本插入到 prompt 中最后一条 system 后。
 * @param promptMessages prompt 消息数组。
 * @param injectedText 待插入文本。
 * @returns 实际插入索引。
 */
function insertBaseContextAsSystemMessage(
    promptMessages: SdkTavernPromptMessageEvent[],
    injectedText: string,
): number {
    const lastSystemIndex = findLastTavernPromptSystemIndexEvent(promptMessages);
    const insertIndex = lastSystemIndex >= 0 ? lastSystemIndex + 1 : 0;
    insertTavernPromptMessageEvent(promptMessages, {
        role: 'system',
        text: injectedText,
        insertMode: 'before_index',
        insertBeforeIndex: insertIndex,
        template: promptMessages[Math.max(0, Math.min(insertIndex - 1, promptMessages.length - 1))] ?? promptMessages[0],
    });
    return insertIndex;
}

/**
 * 功能：将聊天级注入覆盖合并到全局注入设置。
 * @param globalSettings 全局基础注入设置。
 * @param promptProfile 聊天级 prompt 注入画像。
 * @returns 合并后的注入设置。
 */
function mergeBaseInjectionSettingsWithChatOverride(
    globalSettings: ReturnType<typeof normalizeInjectionPromptSettings>,
    promptProfile: Record<string, unknown> | null,
): ReturnType<typeof normalizeInjectionPromptSettings> {
    if (!promptProfile) {
        return globalSettings;
    }
    return normalizeInjectionPromptSettings({
        ...globalSettings,
        preset: promptProfile.baseInjectionPreset ?? globalSettings.preset,
        forceDynamicFloor: promptProfile.baseInjectionForceDynamicFloor ?? globalSettings.forceDynamicFloor,
        aggressiveness: promptProfile.baseInjectionAggressiveness ?? globalSettings.aggressiveness,
    });
}

/**
 * 功能：执行可复用的 prompt_ready 双链注入主流程（基础 system + 主链 user）。
 * @param input 流水线输入参数。
 * @returns 流水线执行结果与结构化诊断。
 */
export async function runPromptReadyInjectionPipeline(input: {
    memory: any;
    promptMessages: SdkTavernPromptMessageEvent[];
    readSettings: () => Record<string, any>;
    query?: string;
    sourceMessageId?: string;
    source?: string;
    currentChatKey?: string;
}): Promise<PromptInjectionPipelineResult> {
    const logs: PromptInjectionPipelineLogEntry[] = [];
    const promptMessages = input.promptMessages;
    const settings = input.readSettings();
    const settingsMaxTokens = Number(settings.contextMaxTokens) || 1200;
    const latestUserMessage = [...promptMessages]
        .reverse()
        .find((item: SdkTavernPromptMessageEvent) => String(item?.role ?? '').trim().toLowerCase() === 'user' || item?.is_user === true);
    const query = String(input.query ?? getTavernPromptMessageTextEvent(latestUserMessage)).trim();
    const sourceMessageId = String(
        input.sourceMessageId
        ?? (latestUserMessage as any)?.mes_id
        ?? (latestUserMessage as any)?.message_id
        ?? (latestUserMessage as any)?.id
        ?? '',
    ).trim() || undefined;
    const source = String(input.source ?? 'chat_completion_prompt_ready').trim() || 'chat_completion_prompt_ready';

    const globalInjectionPromptSettings = normalizeInjectionPromptSettings(settings.injectionPromptSettings);
    const promptInjectionProfile = input.memory?.chatState?.getPromptInjectionProfile
        ? await input.memory.chatState.getPromptInjectionProfile()
        : null;
    const injectionPromptSettings = mergeBaseInjectionSettingsWithChatOverride(
        globalInjectionPromptSettings,
        promptInjectionProfile as Record<string, unknown> | null,
    );

    let baseDiagnostics: BaseInjectionDiagnosticsSnapshot = {
        enabled: injectionPromptSettings.enabled,
        inserted: false,
        skippedReason: injectionPromptSettings.enabled ? null : 'disabled',
        preset: injectionPromptSettings.preset,
        aggressiveness: injectionPromptSettings.aggressiveness,
        forceDynamicFloor: injectionPromptSettings.forceDynamicFloor,
        selectedOptions: [...injectionPromptSettings.selectedOptions],
        candidateCounts: { total: 0, pretrimDropped: 0, budgetDropped: 0 },
        layerBudgets: [],
        finalTextLength: 0,
        finalTokenRatio: 0,
        insertedIndex: -1,
        generatedAt: Date.now(),
    };

    const baseSections = resolveBaseInjectionSections(
        injectionPromptSettings.selectedOptions,
        injectionPromptSettings.forceDynamicFloor,
    );
    if (!baseSections.length) {
        baseDiagnostics.skippedReason = 'no_sections';
    }
    if (injectionPromptSettings.enabled && baseSections.length > 0 && input.memory?.injection?.buildContext) {
        try {
            const layeredBaseContext = await buildLayeredBaseContext({
                memory: input.memory,
                query,
                maxTokens: resolveBaseInjectionMaxTokens(settingsMaxTokens, injectionPromptSettings.aggressiveness),
                preset: injectionPromptSettings.preset,
                aggressiveness: injectionPromptSettings.aggressiveness,
                selectedOptions: injectionPromptSettings.selectedOptions,
                forceDynamicFloor: injectionPromptSettings.forceDynamicFloor,
            });
            const normalizedBaseContextText = layeredBaseContext.text.trim();
            const mergedUsedTokens = layeredBaseContext.layerBudgets.reduce((sum: number, layer): number => sum + Number(layer.usedTokens ?? 0), 0);
            const mergedMaxTokens = layeredBaseContext.layerBudgets.reduce((sum: number, layer): number => sum + Number(layer.maxTokens ?? 0), 0);
            baseDiagnostics = {
                ...baseDiagnostics,
                layerBudgets: layeredBaseContext.layerBudgets,
                finalTextLength: normalizedBaseContextText.length,
                finalTokenRatio: mergedMaxTokens > 0 ? Number((mergedUsedTokens / mergedMaxTokens).toFixed(4)) : 0,
                candidateCounts: {
                    total: layeredBaseContext.layerBudgets.length,
                    pretrimDropped: layeredBaseContext.layerBudgets.filter((layer) => layer.usedTokens <= 0).length,
                    budgetDropped: layeredBaseContext.layerBudgets.filter((layer) => layer.usedTokens > layer.maxTokens).length,
                },
            };
            if (normalizedBaseContextText.length > 0) {
                const baseInsertIndex = insertBaseContextAsSystemMessage(promptMessages, normalizedBaseContextText);
                baseDiagnostics = {
                    ...baseDiagnostics,
                    inserted: true,
                    insertedIndex: baseInsertIndex,
                };
                logs.push({
                    stage: 'base_injection',
                    status: 'ok',
                    reasonCodes: ['inserted'],
                    summary: '基础注入已插入',
                    details: { insertIndex: baseInsertIndex, promptLength: normalizedBaseContextText.length, sections: baseSections },
                });
            } else {
                baseDiagnostics.skippedReason = 'empty_content';
                logs.push({
                    stage: 'base_injection',
                    status: 'failed',
                    reasonCodes: ['empty_content'],
                    summary: '基础注入无内容可插入',
                    details: { sections: baseSections },
                });
            }
        } catch (error) {
            baseDiagnostics.skippedReason = 'build_error';
            logs.push({
                stage: 'base_injection',
                status: 'failed',
                reasonCodes: ['build_error'],
                summary: '基础注入构建失败',
                details: { error: String((error as Error)?.message ?? error ?? 'unknown_error') },
            });
        }
    }

    const promptTrace = createMemoryTraceContext({
        chatKey: String(input.memory?.getChatKey?.() ?? input.currentChatKey ?? '').trim() || 'unknown',
        source: 'prompt_injection',
        stage: 'memory_recall_started',
        sourceMessageId,
        requestId: query || undefined,
    });

    const injectionResult = await input.memory.injection.runMemoryPromptInjection({
        promptMessages,
        maxTokens: settingsMaxTokens,
        query,
        preferSummary: true,
        intentHint: 'auto',
        source,
        sourceMessageId,
        trace: promptTrace,
    });

    if (input.memory?.chatState?.getLatestRecallExplanation && input.memory?.chatState?.setLatestRecallExplanation) {
        const latestExplanation = await input.memory.chatState.getLatestRecallExplanation();
        await input.memory.chatState.setLatestRecallExplanation({
            ...(latestExplanation ?? {}),
            baseInjection: baseDiagnostics,
        });
    }
    const latestExplanation = input.memory?.chatState?.getLatestRecallExplanation
        ? await input.memory.chatState.getLatestRecallExplanation()
        : null;

    logs.push({
        stage: 'main_injection',
        status: injectionResult.inserted ? 'ok' : 'failed',
        reasonCodes: injectionResult.inserted ? ['inserted'] : ['not_inserted'],
        summary: injectionResult.inserted ? '主链注入已插入' : '主链注入未插入',
        details: {
            shouldInject: Boolean(injectionResult.shouldInject),
            insertIndex: Number(injectionResult.insertIndex ?? -1),
            insertedLength: Number(injectionResult.insertedLength ?? 0),
            trace: injectionResult.trace ?? null,
        },
    });

    return {
        query,
        sourceMessageId,
        settingsMaxTokens,
        baseDiagnostics,
        injectionResult,
        latestExplanation: (latestExplanation ?? null) as Record<string, unknown> | null,
        finalPromptMessages: promptMessages,
        finalPromptText: promptMessages.map((item: SdkTavernPromptMessageEvent): string => String((item as any)?.content ?? (item as any)?.mes ?? '')).join('\n'),
        logs,
    };
}
