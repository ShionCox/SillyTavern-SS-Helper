import type { EventEnvelope } from '../../../SDK/stx';
import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { ChatStateManager } from '../core/chat-state-manager';
import {
    buildIntentBudgets,
    buildStrategyDecision,
    collectAdaptiveMetricsFromEvents,
    decideInjectionIntent,
    resolveIntentSections,
} from '../core/chat-strategy-engine';
import type {
    AdaptivePolicy,
    GroupMemoryState,
    InjectionIntent,
    InjectionSectionName,
    LorebookGateDecision,
    LogicalChatView,
    PreGenerationGateDecision,
    PromptAnchorMode,
    PromptInjectionProfile,
    PromptQueryMode,
    PromptRenderStyle,
    PromptSoftPersonaMode,
    StrategyDecision,
} from '../types';
import {
    DEFAULT_PROMPT_INJECTION_PROFILE,
} from '../types';
import {
    buildLorebookSnippet,
    evaluateLorebookRelevance,
    loadActiveWorldInfoEntriesFromHost,
    type LorebookEntryCandidate,
} from '../core/lorebook-relevance-gate';

type BuildContextOptions = {
    maxTokens?: number;
    sections?: InjectionSectionName[];
    query?: string;
    sectionBudgets?: Partial<Record<InjectionSectionName, number>>;
    preferSummary?: boolean;
    intentHint?: InjectionIntent;
    includeDecisionMeta?: boolean;
};

type BuildContextDecision = {
    text: string;
    sectionsUsed: InjectionSectionName[];
    budgets: Partial<Record<InjectionSectionName, number>>;
    intent: InjectionIntent;
    reasonCodes: string[];
    preDecision: PreGenerationGateDecision;
};

type AnchorPolicy = PromptInjectionProfile;

/**
 * 功能：根据聊天画像和意图构建注入上下文。
 * @param _chatKey 当前聊天键。
 * @param eventsManager 事件管理器。
 * @param factsManager 事实管理器。
 * @param stateManager 世界状态管理器。
 * @param summariesManager 摘要管理器。
 * @param chatStateManager 聊天状态管理器。
 * @returns 注入管理器实例。
 */
export class InjectionManager {
    private chatKey: string;
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private stateManager: StateManager;
    private summariesManager: SummariesManager;
    private chatStateManager: ChatStateManager | null;
    private anchorPolicy: AnchorPolicy = {
        ...DEFAULT_PROMPT_INJECTION_PROFILE,
    };

    constructor(
        chatKey: string,
        eventsManager: EventsManager,
        factsManager: FactsManager,
        stateManager: StateManager,
        summariesManager: SummariesManager,
        chatStateManager?: ChatStateManager,
    ) {
        this.chatKey = chatKey;
        this.eventsManager = eventsManager;
        this.factsManager = factsManager;
        this.stateManager = stateManager;
        this.summariesManager = summariesManager;
        this.chatStateManager = chatStateManager ?? null;
    }

    /**
     * 功能：构建用于注入 Prompt 的上下文文本或决策元数据。
     * @param opts 构建参数。
     * @returns 上下文文本或带元数据的构建结果。
     */
    async buildContext(opts?: BuildContextOptions): Promise<string | BuildContextDecision> {
        if (this.chatStateManager && await this.chatStateManager.isChatArchived()) {
            const skippedDecision: PreGenerationGateDecision = {
                shouldInject: false,
                intent: 'auto',
                sectionsUsed: [],
                budgets: {},
                lorebookMode: 'block',
                anchorMode: this.anchorPolicy.defaultInsert,
                fallbackOrder: [...this.anchorPolicy.fallbackOrder],
                queryMode: this.anchorPolicy.queryMode,
                renderStyle: this.anchorPolicy.renderStyle,
                softPersonaMode: this.anchorPolicy.softPersonaMode,
                shouldTrimPrompt: false,
                reasonCodes: ['chat_archived'],
                generatedAt: Date.now(),
            };
            return opts?.includeDecisionMeta === true
                ? {
                    text: '',
                    sectionsUsed: [],
                    budgets: {},
                    intent: 'auto',
                    reasonCodes: ['chat_archived'],
                    preDecision: skippedDecision,
                }
                : '';
        }
        const maxTokens = Math.max(200, Number(opts?.maxTokens ?? 1200));
        const recentEvents = await this.eventsManager.query({ limit: 24 });
        const logicalView = this.chatStateManager ? await this.chatStateManager.getLogicalChatView() : null;
        const previousMetrics = this.chatStateManager ? await this.chatStateManager.getAdaptiveMetrics() : undefined;
        const mergedMetrics = collectAdaptiveMetricsFromEvents(recentEvents, previousMetrics);
        if (this.chatStateManager) {
            await this.chatStateManager.updateAdaptiveMetrics({
                avgMessageLength: mergedMetrics.avgMessageLength,
                assistantLongMessageRatio: mergedMetrics.assistantLongMessageRatio,
                userInfoDensity: mergedMetrics.userInfoDensity,
                repeatedTopicRate: mergedMetrics.repeatedTopicRate,
                recentUserTurns: mergedMetrics.recentUserTurns,
                recentAssistantTurns: mergedMetrics.recentAssistantTurns,
                recentGroupSpeakerCount: mergedMetrics.recentGroupSpeakerCount,
                worldStateSignal: mergedMetrics.worldStateSignal,
            });
        }
        const profile = this.chatStateManager ? await this.chatStateManager.getChatProfile() : null;
        const policy = this.chatStateManager ? await this.chatStateManager.getAdaptivePolicy() : this.buildFallbackPolicy();
        const groupMemory = this.chatStateManager ? await this.chatStateManager.getGroupMemory() : null;
        const worldStateSnapshot = await this.stateManager.query('');
        const worldStateText = this.stringifyValue(worldStateSnapshot);
        const lorebookEntries = await loadActiveWorldInfoEntriesFromHost();
        const intent = this.resolveIntent(opts, profile, recentEvents);
        const explicitSections = Array.isArray(opts?.sections) && opts.sections.length > 0 ? opts.sections : null;
        const sections = explicitSections ?? this.resolveSectionOrder(intent, opts?.preferSummary !== false);
        const lorebookDecision = evaluateLorebookRelevance({
            query: String(opts?.query ?? ''),
            profileChatType: profile?.chatType,
            visibleMessages: logicalView?.visibleMessages,
            recentEvents,
            worldStateText,
            entries: lorebookEntries,
        });
        if (this.chatStateManager) {
            await this.chatStateManager.setLorebookDecision(lorebookDecision, 'injection');
        }
        const promptProfile = await this.resolvePromptInjectionProfile(intent, profile, lorebookDecision);
        this.anchorPolicy = { ...promptProfile };
        const budgets = await this.resolveSectionBudgets(
            maxTokens,
            sections,
            policy,
            intent,
            opts?.sectionBudgets,
        );
        const keywords = this.extractKeywords(opts?.query ?? '');
        const sectionTexts: Partial<Record<InjectionSectionName, string>> = {};

        for (const section of sections) {
            sectionTexts[section] = await this.buildSectionText(
                section,
                budgets[section] ?? 0,
                keywords,
                recentEvents,
                logicalView,
                policy,
                lorebookDecision,
                lorebookEntries,
                groupMemory,
            );
        }

        const text = this.trimToBudget(
            sections
                .map((section: InjectionSectionName): string => String(sectionTexts[section] ?? '').trim())
                .filter((chunk: string): boolean => chunk.length > 0)
                .join('\n\n')
                .trim(),
            maxTokens,
        );
        const preDecision = this.buildPreGenerationDecision(
            intent,
            sections,
            budgets,
            promptProfile,
            lorebookDecision,
            policy,
            text,
        );
        if (!preDecision.shouldInject || !text) {
            if (this.chatStateManager) {
                await this.chatStateManager.setLastPreGenerationDecision(preDecision);
                await this.chatStateManager.setLastStrategyDecision(buildStrategyDecision(intent, sections, budgets, preDecision.reasonCodes));
            }
            return opts?.includeDecisionMeta === true
                ? {
                    text: '',
                    sectionsUsed: sections,
                    budgets,
                    intent,
                    reasonCodes: preDecision.reasonCodes,
                    preDecision,
                }
                : '';
        }
        const renderedText = this.renderInjectedContext(text, promptProfile, intent);
        const promptInjectionTokenRatio = maxTokens > 0 ? this.estimateTokens(renderedText) / maxTokens : 0;
        const reasonCodes = this.buildReasonCodes(intent, profile?.chatType, policy, sections, lorebookDecision);
        const mergedReasonCodes = Array.from(new Set([...reasonCodes, ...lorebookDecision.reasonCodes.map((code: string): string => `lorebook:${code}`)]));
        const decision = buildStrategyDecision(intent, sections, budgets, mergedReasonCodes);
        if (this.chatStateManager) {
            await this.chatStateManager.updateAdaptiveMetrics({
                promptInjectionTokenRatio,
            });
            await this.chatStateManager.setLastStrategyDecision(decision);
            await this.chatStateManager.setLastPreGenerationDecision({
                ...preDecision,
                reasonCodes: mergedReasonCodes,
            });
            await this.chatStateManager.recomputeMemoryQuality();
        }
        if (opts?.includeDecisionMeta === true) {
            return {
                text: renderedText,
                sectionsUsed: decision.sectionsUsed,
                budgets: decision.budgets,
                intent: decision.intent,
                reasonCodes: decision.reasonCodes,
                preDecision: {
                    ...preDecision,
                    reasonCodes: mergedReasonCodes,
                },
            };
        }
        return renderedText;
    }

    /**
     * 功能：设置注入锚点策略。
     * @param opts 锚点策略补丁。
     * @returns 无返回值。
     */
    async setAnchorPolicy(opts: {
        allowSystem?: boolean;
        allowUser?: boolean;
        defaultInsert?: PromptAnchorMode;
        fallbackOrder?: PromptAnchorMode[];
        queryMode?: PromptQueryMode;
        renderStyle?: PromptRenderStyle;
        softPersonaMode?: PromptSoftPersonaMode;
        wrapTag?: string;
        settingOnlyMinScore?: number;
    }): Promise<void> {
        const normalizedPatch: Partial<PromptInjectionProfile> = {
            allowSystem: opts.allowSystem,
            allowUser: opts.allowUser,
            defaultInsert: opts.defaultInsert,
            fallbackOrder: Array.isArray(opts.fallbackOrder) ? opts.fallbackOrder.filter(Boolean) : undefined,
            queryMode: opts.queryMode,
            renderStyle: opts.renderStyle,
            softPersonaMode: opts.softPersonaMode,
            wrapTag: typeof opts.wrapTag === 'string' && opts.wrapTag.trim().length > 0 ? opts.wrapTag.trim() : undefined,
            settingOnlyMinScore: Number.isFinite(Number(opts.settingOnlyMinScore))
                ? Number(opts.settingOnlyMinScore)
                : undefined,
        };
        this.anchorPolicy = {
            ...this.anchorPolicy,
            ...(normalizedPatch ?? {}),
            fallbackOrder: Array.isArray(normalizedPatch.fallbackOrder) && normalizedPatch.fallbackOrder.length > 0
                ? normalizedPatch.fallbackOrder
                : this.anchorPolicy.fallbackOrder,
        };
        if (this.chatStateManager) {
            await this.chatStateManager.setPromptInjectionProfile(normalizedPatch);
        }
    }

    /**
     * 功能：读取当前锚点策略。
     * @returns 锚点策略。
     */
    getAnchorPolicy(): AnchorPolicy {
        return { ...this.anchorPolicy };
    }

    /**
     * 功能：回退构建默认策略。
     * @returns 默认策略。
     */
    private buildFallbackPolicy(): AdaptivePolicy {
        return {
            extractInterval: 12,
            extractWindowSize: 40,
            summaryEnabled: true,
            summaryMode: 'layered',
            entityResolutionLevel: 'medium',
            speakerTrackingLevel: 'medium',
            worldStateWeight: 0.5,
            vectorEnabled: true,
            vectorChunkThreshold: 240,
            rerankThreshold: 6,
            vectorMode: 'search_rerank',
            vectorMinFacts: 18,
            vectorMinSummaries: 8,
            vectorSearchStride: 1,
            rerankEnabled: true,
            vectorIdleDecayDays: 14,
            contextMaxTokensShare: 0.55,
            lorebookPolicyWeight: 0.55,
            groupLaneBudgetShare: 0.35,
            actorSalienceTopK: 3,
            profileRefreshInterval: 12,
            qualityRefreshInterval: 12,
            groupLaneEnabled: true,
        };
    }

    /**
     * 功能：把旧锚点值映射到新的锚点枚举。
     * 参数：
     *   value：旧值或新值。
     * 返回：
     *   PromptAnchorMode：归一化后的锚点模式。
     */
    /**
     * 功能：根据意图、画像和聊天配置解析最终生效的 Prompt 注入画像。
     * 参数：
     *   intent：当前注入意图。
     *   profile：当前聊天画像。
     *   lorebookDecision：世界书裁决。
     * 返回：
     *   Promise<PromptInjectionProfile>：最终生效的注入画像。
     */
    private async resolvePromptInjectionProfile(
        intent: InjectionIntent,
        profile: {
            chatType: 'solo' | 'group' | 'worldbook' | 'tool';
            stylePreference: 'story' | 'qa' | 'trpg' | 'info';
        } | null,
        lorebookDecision: LorebookGateDecision,
    ): Promise<PromptInjectionProfile> {
        const dynamicProfile: PromptInjectionProfile = {
            ...DEFAULT_PROMPT_INJECTION_PROFILE,
            renderStyle: profile?.stylePreference === 'qa' || profile?.chatType === 'tool'
                ? 'compact_kv'
                : profile?.chatType === 'worldbook'
                    ? 'markdown'
                    : profile?.stylePreference === 'story' || profile?.stylePreference === 'trpg'
                        ? 'xml'
                        : 'xml',
            softPersonaMode: profile?.stylePreference === 'story' || profile?.stylePreference === 'trpg'
                ? 'continuity_note'
                : 'hidden_context_summary',
            defaultInsert: intent === 'setting_qa'
                ? 'after_lorebook'
                : intent === 'roleplay'
                    ? 'after_author_note'
                    : intent === 'tool_qa'
                        ? 'after_first_system'
                        : 'after_last_system',
            fallbackOrder: intent === 'setting_qa'
                ? ['after_lorebook', 'after_last_system', 'top']
                : intent === 'roleplay'
                    ? ['after_author_note', 'after_persona', 'after_last_system', 'top']
                    : ['after_last_system', 'top'],
            queryMode: lorebookDecision.mode === 'summary_only' && intent === 'setting_qa'
                ? 'setting_only'
                : 'always',
        };
        const persistedProfile = this.chatStateManager
            ? await this.chatStateManager.getPromptInjectionProfile()
            : DEFAULT_PROMPT_INJECTION_PROFILE;
        return {
            ...dynamicProfile,
            ...(persistedProfile ?? DEFAULT_PROMPT_INJECTION_PROFILE),
            defaultInsert: persistedProfile?.defaultInsert ?? dynamicProfile.defaultInsert,
            fallbackOrder: Array.isArray(persistedProfile?.fallbackOrder) && persistedProfile.fallbackOrder.length > 0
                ? persistedProfile.fallbackOrder.map((item: PromptAnchorMode): PromptAnchorMode => item)
                : dynamicProfile.fallbackOrder,
        };
    }

    /**
     * 功能：构建生成前 gate 决策。
     * 参数：
     *   intent：当前注入意图。
     *   sections：本轮区段。
     *   budgets：区段预算。
     *   promptProfile：注入画像。
     *   lorebookDecision：世界书裁决。
     *   policy：当前自适应策略。
     *   text：原始注入文本。
     * 返回：
     *   PreGenerationGateDecision：生成前决策。
     */
    private buildPreGenerationDecision(
        intent: InjectionIntent,
        sections: InjectionSectionName[],
        budgets: Partial<Record<InjectionSectionName, number>>,
        promptProfile: PromptInjectionProfile,
        lorebookDecision: LorebookGateDecision,
        policy: AdaptivePolicy,
        text: string,
    ): PreGenerationGateDecision {
        const baseReasonCodes: string[] = [];
        const isSettingOnly = promptProfile.queryMode === 'setting_only' || promptProfile.defaultInsert === 'setting_query_only';
        const shouldInject = text.trim().length > 0 && (!isSettingOnly || intent === 'setting_qa');
        if (isSettingOnly) {
            baseReasonCodes.push('setting_only_mode');
        }
        if (!shouldInject) {
            baseReasonCodes.push('pre_gate_skip');
        }
        if (lorebookDecision.mode === 'block') {
            baseReasonCodes.push('lorebook_block');
        }
        return {
            shouldInject,
            intent,
            sectionsUsed: sections,
            budgets,
            lorebookMode: lorebookDecision.mode,
            anchorMode: promptProfile.defaultInsert,
            fallbackOrder: [...promptProfile.fallbackOrder],
            queryMode: promptProfile.queryMode,
            renderStyle: promptProfile.renderStyle,
            softPersonaMode: promptProfile.softPersonaMode,
            shouldTrimPrompt: this.estimateTokens(text) > Math.max(64, Math.floor(policy.contextMaxTokensShare * 1000)),
            reasonCodes: baseReasonCodes,
            generatedAt: Date.now(),
        };
    }

    /**
     * 功能：按不同注入风格渲染最终注入文本。
     * 参数：
     *   rawText：原始注入文本。
     *   promptProfile：注入画像。
     *   intent：当前意图。
     * 返回：
     *   string：最终渲染后的注入文本。
     */
    private renderInjectedContext(
        rawText: string,
        promptProfile: PromptInjectionProfile,
        intent: InjectionIntent,
    ): string {
        const body = rawText.trim();
        if (!body) {
            return '';
        }
        const lead = this.buildSoftLead(promptProfile.softPersonaMode, intent);
        if (promptProfile.renderStyle === 'markdown') {
            return [`## ${lead}`, body].filter(Boolean).join('\n\n');
        }
        if (promptProfile.renderStyle === 'comment') {
            return `/* ${lead}\n${body}\n*/`;
        }
        if (promptProfile.renderStyle === 'compact_kv') {
            const compactBody = body
                .split('\n')
                .map((line: string): string => line.replace(/^\s*[-*#]+\s*/, '').trim())
                .filter(Boolean)
                .join(' | ');
            return `${lead}: ${compactBody}`;
        }
        if (promptProfile.renderStyle === 'minimal_bullets') {
            const bulletBody = body
                .split('\n')
                .map((line: string): string => line.trim())
                .filter(Boolean)
                .map((line: string): string => line.startsWith('-') ? line : `- ${line}`);
            return [`${lead}:`, ...bulletBody].join('\n');
        }
        return `\n<${promptProfile.wrapTag}>\n<MODE>${lead}</MODE>\n${body}\n</${promptProfile.wrapTag}>\n`;
    }

    /**
     * 功能：为软注入模式生成自然语言标题。
     * 参数：
     *   mode：软注入模式。
     *   intent：当前意图。
     * 返回：
     *   string：展示标题。
     */
    private buildSoftLead(mode: PromptSoftPersonaMode, intent: InjectionIntent): string {
        if (mode === 'scene_note') {
            return '场景注记';
        }
        if (mode === 'character_anchor') {
            return '角色锚点';
        }
        if (mode === 'hidden_context_summary') {
            return intent === 'tool_qa' ? '隐藏工作上下文' : '隐藏上下文摘要';
        }
        return '连续性注记';
    }

    /**
     * 功能：决定本轮注入意图。
     * @param opts 构建参数。
     * @param fallbackStyle 回退风格。
     * @param recentEvents 最近事件。
     * @returns 注入意图。
     */
    private resolveIntent(
        opts: BuildContextOptions | undefined,
        profile: {
            chatType: 'solo' | 'group' | 'worldbook' | 'tool';
            stylePreference: 'story' | 'qa' | 'trpg' | 'info';
            memoryStrength: 'low' | 'medium' | 'high';
            extractStrategy: 'facts_only' | 'facts_relations' | 'facts_relations_world';
            summaryStrategy: 'short' | 'layered' | 'timeline';
            vectorStrategy: {
                enabled: boolean;
                chunkThreshold: number;
                rerankThreshold: number;
                activationFacts: number;
                activationSummaries: number;
                idleDecayDays: number;
                lowPrecisionSearchStride: number;
            };
            deletionStrategy: 'soft_delete' | 'immediate_purge';
        } | null,
        recentEvents: Array<EventEnvelope<unknown>>,
    ): InjectionIntent {
        if (opts?.intentHint && opts.intentHint !== 'auto') {
            return opts.intentHint;
        }
        const query = String(opts?.query ?? '').trim();
        const inferred = decideInjectionIntent({
            query,
            events: recentEvents,
            profile: profile ?? {
                chatType: 'solo',
                stylePreference: 'story',
                memoryStrength: 'medium',
                extractStrategy: 'facts_relations',
                summaryStrategy: 'layered',
                vectorStrategy: {
                    enabled: true,
                    chunkThreshold: 240,
                    rerankThreshold: 6,
                    activationFacts: 18,
                    activationSummaries: 8,
                    idleDecayDays: 14,
                    lowPrecisionSearchStride: 3,
                },
                deletionStrategy: 'soft_delete',
            },
        });
        return inferred === 'auto' ? (profile?.stylePreference === 'qa' ? 'tool_qa' : 'story_continue') : inferred;
    }

    /**
     * 功能：确定本轮区段顺序。
     * @param intent 注入意图。
     * @param preferSummary 是否偏好摘要。
     * @returns 区段数组。
     */
    private resolveSectionOrder(intent: InjectionIntent, preferSummary: boolean): InjectionSectionName[] {
        const sections = resolveIntentSections(intent);
        if (!preferSummary && sections.includes('SUMMARY')) {
            return sections.filter((section: InjectionSectionName): boolean => section !== 'SUMMARY').concat(['EVENTS']);
        }
        return sections;
    }

    /**
     * 功能：根据意图、模板预算和外部覆盖计算区段预算。
     * @param maxTokens 总预算。
     * @param sections 区段数组。
     * @param policy 自适应策略。
     * @param intent 注入意图。
     * @param override 外部覆盖预算。
     * @returns 预算映射。
     */
    private async resolveSectionBudgets(
        maxTokens: number,
        sections: InjectionSectionName[],
        policy: AdaptivePolicy,
        intent: InjectionIntent,
        override?: Partial<Record<InjectionSectionName, number>>,
    ): Promise<Partial<Record<InjectionSectionName, number>>> {
        const templateBudgets = await this.readTemplateBudgets();
        const intentBudgets = buildIntentBudgets(intent, sections, maxTokens, policy);
        const result: Partial<Record<InjectionSectionName, number>> = {};
        sections.forEach((section: InjectionSectionName): void => {
            const preferred = Number(override?.[section] ?? 0)
                || Number(templateBudgets[section] ?? 0)
                || Number(intentBudgets[section] ?? 0);
            result[section] = Math.max(24, Math.floor(preferred || Math.floor(maxTokens / Math.max(sections.length, 1))));
        });
        return result;
    }

    /**
     * 功能：读取当前模板中的注入预算。
     * @returns 模板预算映射。
     */
    private async readTemplateBudgets(): Promise<Partial<Record<InjectionSectionName, number>>> {
        try {
            const stxMemory = (window as any)?.STX?.memory;
            if (!stxMemory?.template?.getActive) {
                return {};
            }
            const template = await stxMemory.template.getActive();
            const layout = template?.injectionLayout || {};
            const eventsMaxItems = Number(layout?.EVENTS?.maxItems ?? 0);
            return {
                WORLD_STATE: Number(layout?.WORLD_STATE?.maxTokens ?? 0) || undefined,
                FACTS: Number(layout?.FACTS?.maxTokens ?? 0) || undefined,
                SUMMARY: Number(layout?.SUMMARY?.maxTokens ?? 0) || undefined,
                EVENTS: eventsMaxItems > 0 ? eventsMaxItems * 80 : undefined,
            };
        } catch {
            return {};
        }
    }

    /**
     * 功能：按区段类型构建文本。
     * @param section 区段名。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @param recentEvents 最近事件。
     * @returns 区段文本。
     */
    private async buildSectionText(
        section: InjectionSectionName,
        tokenBudget: number,
        keywords: string[],
        recentEvents: Array<EventEnvelope<unknown>>,
        logicalView: LogicalChatView | null,
        policy: AdaptivePolicy,
        lorebookDecision: LorebookGateDecision,
        lorebookEntries: LorebookEntryCandidate[],
        groupMemory: GroupMemoryState | null,
    ): Promise<string> {
        if (section === 'WORLD_STATE') {
            return this.buildWorldStateSectionV2(tokenBudget, keywords, policy, lorebookDecision, lorebookEntries);
        }
        if (section === 'FACTS') {
            return this.buildFactsSection(tokenBudget, keywords);
        }
        if (section === 'EVENTS') {
            return this.buildEventsSection(tokenBudget, recentEvents, logicalView);
        }
        if (section === 'SUMMARY') {
            return this.buildSummarySection(tokenBudget, keywords);
        }
        if (section === 'CHARACTER_FACTS') {
            return this.buildCharacterFactsSection(tokenBudget, keywords, groupMemory, policy);
        }
        if (section === 'RELATIONSHIPS') {
            return this.buildRelationshipsSection(tokenBudget, keywords);
        }
        if (section === 'LAST_SCENE') {
            return this.buildLastSceneSection(tokenBudget, groupMemory);
        }
        if (section === 'SHORT_SUMMARY') {
            return this.buildShortSummarySection(tokenBudget);
        }
        return '';
    }

    /**
     * 功能：构建世界状态区段。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @returns 区段文本。
     */
    private async buildWorldStateSection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const states = await this.stateManager.query('');
        const ranked = Object.entries(states)
            .map(([path, value]): { path: string; value: unknown; score: number } => ({
                path,
                value,
                score: this.countKeywordHit(`${path} ${this.stringifyValue(value)}`.toLowerCase(), keywords),
            }))
            .sort((left, right): number => right.score - left.score);
        const lines: string[] = [];
        for (const item of ranked) {
            const line = `- ${item.path}: ${this.stringifyValue(item.value)}`;
            if (!this.canAppend(lines, line, tokenBudget, 20)) {
                break;
            }
            lines.push(line);
        }
        return lines.length > 0 ? `【世界状态】\n${lines.join('\n')}` : '';
    }

    /**
     * 功能：构建事实区段。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @returns 区段文本。
     */
    private async buildFactsSection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const facts = await this.factsManager.query({ limit: 120 });
        const filteredFacts = this.chatStateManager
            ? await Promise.all(
                facts.map(async (fact: any): Promise<any | null> => {
                    const factKey = String(fact.factKey ?? '').trim();
                    if (factKey && await this.chatStateManager!.isFactArchived(factKey)) {
                        return null;
                    }
                    return fact;
                }),
            ).then((items: Array<any | null>): any[] => items.filter((item: any | null): item is any => item != null))
            : facts;
        const lines = filteredFacts
            .map((fact: any): { line: string; score: number } => {
                const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
                const line = `- ${entityPart}${fact.type}${fact.path ? `.${fact.path}` : ''}: ${this.stringifyValue(fact.value)}`;
                const score = this.countKeywordHit(line.toLowerCase(), keywords) * 3 + Number(fact.confidence ?? 0);
                return { line, score };
            })
            .sort((left, right): number => right.score - left.score);
        return this.assembleSection('【事实】', lines.map((item): string => item.line), tokenBudget, 24);
    }

    /**
     * 功能：构建最近事件区段。
     * @param tokenBudget 预算。
     * @param recentEvents 最近事件。
     * @returns 区段文本。
     */
    /**
     * 功能：构建包含 lorebook 裁决结果的世界状态区段。
     * @param tokenBudget token 预算。
     * @param keywords 关键词。
     * @param policy 自适应策略。
     * @param lorebookDecision lorebook 裁决结果。
     * @param lorebookEntries 当前激活世界书条目。
     * @returns 区段文本。
     */
    private async buildWorldStateSectionV2(
        tokenBudget: number,
        keywords: string[],
        policy: AdaptivePolicy,
        lorebookDecision: LorebookGateDecision,
        lorebookEntries: LorebookEntryCandidate[],
    ): Promise<string> {
        const base = await this.buildWorldStateSection(tokenBudget, keywords);
        const lorebookBudget = Math.max(80, Math.floor(tokenBudget * policy.lorebookPolicyWeight * 0.6));
        const lorebookText = buildLorebookSnippet(lorebookDecision, lorebookEntries, lorebookBudget);
        if (!base && !lorebookText) {
            return '';
        }
        if (!base) {
            return lorebookText;
        }
        if (!lorebookText) {
            return base;
        }
        return this.trimToBudget(`${base}\n${lorebookText}`, tokenBudget);
    }

    private async buildEventsSection(
        tokenBudget: number,
        recentEvents?: Array<EventEnvelope<unknown>>,
        logicalView?: LogicalChatView | null,
    ): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const lines = logicalView
            ? logicalView.visibleMessages
                .slice(Math.max(0, logicalView.visibleMessages.length - 12))
                .map((node): string => {
                    const time = new Date(node.updatedAt || node.createdAt || Date.now()).toLocaleTimeString();
                    return `- [${time}] chat.message.${node.role}: ${node.text}`;
                })
            : (Array.isArray(recentEvents) && recentEvents.length > 0
                ? recentEvents
                : await this.eventsManager.query({ limit: 24 }))
                .slice(0, 12)
                .map((event: EventEnvelope<unknown>): string => {
                    const time = new Date(event.ts).toLocaleTimeString();
                    return `- [${time}] ${event.type}: ${this.readEventPayloadText(event.payload)}`;
                });
        return this.assembleSection('【最近事件】', lines, tokenBudget, 16);
    }

    /**
     * 功能：构建摘要区段。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @returns 区段文本。
     */
    private async buildSummarySection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const summaries = await this.loadRecentSummaries();
        const lines = summaries
            .map((summary: any): { line: string; score: number } => {
                const line = `- [${summary.level}] ${summary.title ? `${summary.title}: ` : ''}${summary.content}`;
                const score = this.countKeywordHit(line.toLowerCase(), keywords) * 2 + (summary.level === 'arc' ? 2 : summary.level === 'scene' ? 1 : 0);
                return { line, score };
            })
            .sort((left, right): number => right.score - left.score);
        return this.assembleSection('【摘要】', lines.map((item): string => item.line), tokenBudget, 20);
    }

    /**
     * 功能：构建角色事实区段。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @returns 区段文本。
     */
    private async buildCharacterFactsSection(
        tokenBudget: number,
        keywords: string[],
        groupMemory: GroupMemoryState | null,
        policy: AdaptivePolicy,
    ): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const facts = await this.factsManager.query({ limit: 120 });
        const filtered = facts.filter((fact: any): boolean => {
            const entityKind = String(fact.entity?.kind ?? '').toLowerCase();
            const path = String(fact.path ?? '').toLowerCase();
            return (
                /character|persona|npc|player|role|人物|角色/.test(entityKind)
                || /persona|profile|trait|identity|name|status|人设|性格|身份|名字/.test(path)
            );
        });
        const lines = filtered
            .map((fact: any): { line: string; score: number } => {
                const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
                const line = `- ${entityPart}${fact.path || fact.type}: ${this.stringifyValue(fact.value)}`;
                const score = this.countKeywordHit(line.toLowerCase(), keywords) * 2 + Number(fact.confidence ?? 0);
                return { line, score };
            })
            .sort((left, right): number => right.score - left.score);
        const laneLines = (groupMemory?.actorSalience ?? [])
            .sort((left, right): number => right.score - left.score)
            .slice(0, Math.max(1, Math.min(8, Number(policy.actorSalienceTopK ?? 3))))
            .map((salience) => {
                const lane = (groupMemory?.lanes ?? []).find((item) => item.actorKey === salience.actorKey);
                if (!lane) {
                    return '';
                }
                const goal = lane.recentGoal ? `, 目标=${lane.recentGoal}` : '';
                const emotion = lane.lastEmotion ? `, 情绪=${lane.lastEmotion}` : '';
                return `- [lane:${lane.displayName}] 风格=${lane.lastStyle || 'unknown'}${emotion}${goal}`;
            })
            .filter(Boolean);
        const laneBudget = Math.max(48, Math.floor(tokenBudget * policy.groupLaneBudgetShare));
        const laneText = this.assembleSection('【群聊车道】', laneLines, laneBudget, 16);
        const baseText = this.assembleSection('【角色事实】', lines.map((item): string => item.line), tokenBudget, 20);
        if (!baseText && !laneText) {
            return '';
        }
        if (!baseText) {
            return laneText;
        }
        if (!laneText) {
            return baseText;
        }
        return this.trimToBudget(`${baseText}\n${laneText}`, tokenBudget);
    }

    /**
     * 功能：构建关系区段。
     * @param tokenBudget 预算。
     * @param keywords 关键词。
     * @returns 区段文本。
     */
    private async buildRelationshipsSection(tokenBudget: number, keywords: string[]): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const facts = await this.factsManager.query({ limit: 120 });
        const filtered = facts.filter((fact: any): boolean => {
            const typeText = String(fact.type ?? '').toLowerCase();
            const pathText = String(fact.path ?? '').toLowerCase();
            return /relationship|relation|bond|ally|enemy|friend|关系|阵营|同伴|敌对/.test(`${typeText} ${pathText}`);
        });
        const lines = filtered
            .map((fact: any): { line: string; score: number } => {
                const entityPart = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}] ` : '';
                const line = `- ${entityPart}${fact.path || fact.type}: ${this.stringifyValue(fact.value)}`;
                const score = this.countKeywordHit(line.toLowerCase(), keywords) * 2 + Number(fact.confidence ?? 0);
                return { line, score };
            })
            .sort((left, right): number => right.score - left.score);
        return this.assembleSection('【关系】', lines.map((item): string => item.line), tokenBudget, 20);
    }

    /**
     * 功能：构建最近场景区段。
     * @param tokenBudget 预算。
     * @returns 区段文本。
     */
    private async buildLastSceneSection(
        tokenBudget: number,
        groupMemory: GroupMemoryState | null,
    ): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const sceneSummaries = await this.summariesManager.query({ level: 'scene', limit: 4 });
        const messageSummaries = await this.summariesManager.query({ level: 'message', limit: 4 });
        const merged = [...sceneSummaries, ...messageSummaries]
            .sort((left: any, right: any): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
            .slice(0, 4)
            .map((summary: any): string => `- ${summary.title ? `${summary.title}: ` : ''}${summary.content}`);
        const sceneHints: string[] = [];
        if (groupMemory?.sharedScene?.currentScene) {
            sceneHints.push(`- 当前场景: ${groupMemory.sharedScene.currentScene}`);
        }
        if (groupMemory?.sharedScene?.currentConflict) {
            sceneHints.push(`- 当前冲突: ${groupMemory.sharedScene.currentConflict}`);
        }
        if (Array.isArray(groupMemory?.sharedScene?.pendingEvents) && groupMemory.sharedScene.pendingEvents.length > 0) {
            sceneHints.push(`- 未完成事件: ${groupMemory.sharedScene.pendingEvents.slice(-3).join('；')}`);
        }
        const sceneHintText = this.assembleSection('【群聊场景】', sceneHints, Math.max(64, Math.floor(tokenBudget * 0.45)), 16);
        const base = this.assembleSection('【最近场景】', merged, tokenBudget, 20);
        if (!sceneHintText) {
            return base;
        }
        if (!base) {
            return sceneHintText;
        }
        return this.trimToBudget(`${sceneHintText}\n${base}`, tokenBudget);
    }

    /**
     * 功能：构建短摘要区段。
     * @param tokenBudget 预算。
     * @returns 区段文本。
     */
    private async buildShortSummarySection(tokenBudget: number): Promise<string> {
        if (tokenBudget <= 0) {
            return '';
        }
        const summaries = await this.loadRecentSummaries();
        const lines = summaries
            .sort((left: any, right: any): number => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0))
            .slice(0, 3)
            .map((summary: any): string => `- ${summary.title ? `${summary.title}: ` : ''}${summary.content}`);
        return this.assembleSection('【短摘要】', lines, tokenBudget, 18);
    }

    /**
     * 功能：加载最近摘要。
     * @returns 摘要列表。
     */
    private async loadRecentSummaries(): Promise<any[]> {
        const [arc, scene, message] = await Promise.all([
            this.summariesManager.query({ level: 'arc', limit: 8 }),
            this.summariesManager.query({ level: 'scene', limit: 10 }),
            this.summariesManager.query({ level: 'message', limit: 10 }),
        ]);
        const summaries = [...arc, ...scene, ...message];
        if (!this.chatStateManager) {
            return summaries;
        }
        const filtered = await Promise.all(
            summaries.map(async (summary: any): Promise<any | null> => {
                const summaryId = String(summary.summaryId ?? '').trim();
                if (summaryId && await this.chatStateManager!.isSummaryArchived(summaryId)) {
                    return null;
                }
                return summary;
            }),
        );
        return filtered.filter((item: any | null): item is any => item != null);
    }

    /**
     * 功能：根据预算拼装区段文本。
     * @param title 区段标题。
     * @param lines 行列表。
     * @param tokenBudget 预算。
     * @param headerReserve 标题预留。
     * @returns 区段文本。
     */
    private assembleSection(title: string, lines: string[], tokenBudget: number, headerReserve: number): string {
        const kept: string[] = [];
        for (const line of lines) {
            if (!this.canAppend(kept, line, tokenBudget, headerReserve)) {
                break;
            }
            kept.push(line);
        }
        return kept.length > 0 ? `${title}\n${kept.join('\n')}` : '';
    }

    /**
     * 功能：提取查询关键词。
     * @param query 查询文本。
     * @returns 关键词数组。
     */
    private extractKeywords(query: string): string[] {
        const normalized = String(query ?? '').toLowerCase().trim();
        if (!normalized) {
            return [];
        }
        return Array.from(
            new Set(
                normalized
                    .split(/[\s,，。！？；:：()\[\]{}"'`~!@#$%^&*+=<>/\\|-]+/)
                    .map((item: string): string => item.trim())
                    .filter((item: string): boolean => item.length >= 2),
            ),
        ).slice(0, 12);
    }

    /**
     * 功能：计算关键词命中数。
     * @param text 目标文本。
     * @param keywords 关键词数组。
     * @returns 命中数。
     */
    private countKeywordHit(text: string, keywords: string[]): number {
        if (keywords.length === 0) {
            return 0;
        }
        return keywords.reduce((count: number, keyword: string): number => {
            return count + (text.includes(keyword) ? 1 : 0);
        }, 0);
    }

    /**
     * 功能：判断当前行是否还能加入区段。
     * @param lines 已保留行。
     * @param line 待加入行。
     * @param tokenBudget 预算。
     * @param headerReserve 标题预留。
     * @returns 是否允许加入。
     */
    private canAppend(lines: string[], line: string, tokenBudget: number, headerReserve: number): boolean {
        const draft = lines.concat([line]).join('\n');
        const token = this.estimateTokens(draft) + headerReserve;
        return token <= tokenBudget;
    }

    /**
     * 功能：按预算裁剪最终文本。
     * @param text 原始文本。
     * @param maxTokens 总预算。
     * @returns 裁剪后的文本。
     */
    private trimToBudget(text: string, maxTokens: number): string {
        if (!text.trim()) {
            return '';
        }
        if (this.estimateTokens(text) <= maxTokens) {
            return text;
        }
        const lines = text.split('\n');
        const kept: string[] = [];
        for (const line of lines) {
            const draft = kept.concat([line]).join('\n');
            if (this.estimateTokens(draft) > maxTokens - 6) {
                break;
            }
            kept.push(line);
        }
        return `${kept.join('\n')}\n...（已按预算裁剪）`;
    }

    /**
     * 功能：估算文本 token 数。
     * @param text 文本内容。
     * @returns 估算 token 数。
     */
    private estimateTokens(text: string): number {
        if (!text) {
            return 0;
        }
        const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
        const latinWordCount = (text.match(/[A-Za-z0-9_]+/g) || []).length;
        const punctuationCount = (text.match(/[^\u4e00-\u9fffA-Za-z0-9_\s]/g) || []).length;
        return Math.max(1, Math.ceil(cjkCount * 1.15 + latinWordCount * 1.35 + punctuationCount * 0.25));
    }

    /**
     * 功能：将任意值转为可读字符串。
     * @param value 任意值。
     * @returns 字符串。
     */
    private stringifyValue(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }
        if (value == null) {
            return '';
        }
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    /**
     * 功能：读取事件 payload 文本。
     * @param payload 事件负载。
     * @returns 事件文本。
     */
    private readEventPayloadText(payload: unknown): string {
        if (typeof payload === 'string') {
            return payload;
        }
        if (payload && typeof payload === 'object') {
            const text = (payload as { text?: unknown; content?: unknown }).text;
            const content = (payload as { text?: unknown; content?: unknown }).content;
            if (typeof text === 'string') {
                return text;
            }
            if (typeof content === 'string') {
                return content;
            }
        }
        return this.stringifyValue(payload);
    }

    /**
     * 功能：构建决策原因代码。
     * @param intent 意图。
     * @param chatType 聊天类型。
     * @param policy 自适应策略。
     * @param sections 区段数组。
     * @returns 原因代码列表。
     */
    private buildReasonCodes(
        intent: InjectionIntent,
        chatType: string | undefined,
        policy: AdaptivePolicy,
        sections: InjectionSectionName[],
        lorebookDecision: LorebookGateDecision,
    ): string[] {
        const codes = [`intent:${intent}`];
        if (chatType) {
            codes.push(`chat_type:${chatType}`);
        }
        if (!policy.summaryEnabled) {
            codes.push('summary_disabled');
        }
        if (!policy.vectorEnabled) {
            codes.push('vector_disabled');
        }
        codes.push(`lorebook_mode:${lorebookDecision.mode}`);
        codes.push(`sections:${sections.join(',')}`);
        return codes;
    }
}
