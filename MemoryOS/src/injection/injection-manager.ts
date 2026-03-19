import type { EventEnvelope } from '../../../SDK/stx';
import { ChatStateManager } from '../core/chat-state-manager';
import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import {
    buildIntentBudgets,
    buildStrategyDecision,
    collectAdaptiveMetricsFromEvents,
    decideInjectionIntent,
    resolveIntentSections,
} from '../core/chat-strategy-engine';
import {
    evaluateLorebookRelevance,
    loadActiveWorldInfoEntriesFromHost,
    type LorebookEntryCandidate,
} from '../core/lorebook-relevance-gate';
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
    RecallCandidate,
    RecallLogEntry,
    RecallPlan,
    StrategyDecision,
} from '../types';
import {
    DEFAULT_PROMPT_INJECTION_PROFILE,
} from '../types';
import { collectRecallCandidates } from '../recall/recall-assembler';
import { planRecall } from '../recall/recall-planner';
import { cutRecallCandidatesByBudget, rankRecallCandidates } from '../recall/recall-ranker';
import { buildPreparedRecallContext } from './recall-context-builder';
import { buildSectionText, renderInjectedContext } from './prompt-memory-renderer';
import { buildLatestRecallExplanationSnapshot, buildRecallLogEntries } from './recall-log-mapper';
import { buildViewpointPolicyInput } from './viewpoint-policy';

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
 * 功能：根据聊天画像和意图构建注入管理器。
 * 参数：
 *   chatKey：当前聊天键。
 *   eventsManager：事件管理器。
 *   factsManager：事实管理器。
 *   stateManager：世界状态管理器。
 *   summariesManager：摘要管理器。
 *   chatStateManager：聊天状态管理器。
 * 返回：注入管理器实例。
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
     * 功能：构建本轮决策的原因码。
     * 参数：
     *   intent：当前注入意图。
     *   chatType：当前聊天类型。
     *   policy：自适应策略。
     *   sections：本轮区段。
     *   lorebookDecision：世界书裁决结果。
     * 返回：原因码列表。
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

    /**
     * 功能：设置注入锚点策略。
     * 参数：
     *   opts：锚点策略补丁。
     * 返回：无返回值。
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
     * 参数：无。
     * 返回：当前锚点策略。
     */
    getAnchorPolicy(): AnchorPolicy {
        return { ...this.anchorPolicy };
    }

    /**
     * 功能：返回默认自适应策略。
     * 参数：无。
     * 返回：默认自适应策略。
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
            profileRefreshInterval: 6,
            qualityRefreshInterval: 12,
            groupLaneEnabled: true,
        };
    }

    /**
     * 功能：把旧锚点映射到新的锚点枚举。
     * 参数：
     *   value：旧值或新值。
     * 返回：归一化后的锚点模式。
     */
    private mapLegacyAnchorMode(value: string): PromptAnchorMode {
        if (value === 'setting_query_only') {
            return 'setting_query_only';
        }
        if (value === 'after_lorebook' || value === 'after_author_note' || value === 'after_persona' || value === 'after_first_system' || value === 'after_last_system' || value === 'top' || value === 'before_start' || value === 'custom_anchor') {
            return value;
        }
        return 'after_last_system';
    }

    /**
     * 功能：根据意图、画像和世界书裁决构建最终注入画像。
     * 参数：
     *   intent：当前注入意图。
     *   profile：当前聊天画像。
     *   lorebookDecision：世界书裁决。
     * 返回：最终生效的注入画像。
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
                ? persistedProfile.fallbackOrder.map((item: PromptAnchorMode): PromptAnchorMode => this.mapLegacyAnchorMode(item))
                : dynamicProfile.fallbackOrder,
        };
    }

    /**
     * 功能：决定本轮注入意图。
     * 参数：
     *   opts：构建参数。
     *   profile：当前聊天画像。
     *   recentEvents：近期事件。
     * 返回：本轮意图。
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
     * 功能：决定本轮区段顺序。
     * 参数：
     *   intent：当前意图。
     *   preferSummary：是否优先摘要。
     * 返回：区段顺序。
     */
    private resolveSectionOrder(intent: InjectionIntent, preferSummary: boolean): InjectionSectionName[] {
        const sections = resolveIntentSections(intent);
        if (!preferSummary && sections.includes('SUMMARY')) {
            return sections.filter((section: InjectionSectionName): boolean => section !== 'SUMMARY').concat(['EVENTS']);
        }
        return sections;
    }

    /**
     * 功能：根据意图、模板和覆盖值解析区段预算。
     * 参数：
     *   maxTokens：总预算。
     *   sections：区段列表。
     *   policy：自适应策略。
     *   intent：当前意图。
     *   override：外部覆盖预算。
     * 返回：区段预算映射。
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
     * 功能：读取模板里的区段预算。
     * 参数：无。
     * 返回：模板预算映射。
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
     * 功能：构建生成前的门控决策。
     * 参数：
     *   intent：当前意图。
     *   sections：本轮区段。
     *   budgets：本轮预算。
     *   promptProfile：注入画像。
     *   lorebookDecision：世界书裁决。
     *   policy：自适应策略。
     *   text：当前文本。
     * 返回：生成前门控决策。
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
     * 功能：构建本轮注入上下文。
     * 参数：
     *   opts：构建参数。
     * 返回：纯文本或带元信息的决策结果。
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
            await this.chatStateManager.setLatestRecallExplanation(
                await buildLatestRecallExplanationSnapshot({
                    generatedAt: skippedDecision.generatedAt,
                    query: String(opts?.query ?? ''),
                    sectionsUsed: [],
                    reasonCodes: skippedDecision.reasonCodes,
                    recallEntries: [],
                }),
            );
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
        const recallContext = await buildPreparedRecallContext(this.chatStateManager, String(opts?.query ?? ''));
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
        const viewpointInput = buildViewpointPolicyInput(recallContext, logicalView, groupMemory);
        const recallPlan: RecallPlan = planRecall({
            intent,
            sections,
            sectionBudgets: budgets,
            maxTokens,
            policy,
            lorebookDecision,
            ...viewpointInput,
        });
        const collectedCandidates: RecallCandidate[] = await collectRecallCandidates({
            chatKey: this.chatKey,
            plan: recallPlan,
            query: String(opts?.query ?? ''),
            recentEvents,
            logicalView,
            groupMemory,
            policy,
            lorebookDecision,
            lorebookEntries,
            factsManager: this.factsManager,
            stateManager: this.stateManager,
            summariesManager: this.summariesManager,
            chatStateManager: this.chatStateManager,
            lifecycleIndex: recallContext.lifecycleMap,
            activeActorKey: recallContext.activeActorKey,
            personaProfiles: recallContext.personaProfiles,
            personaProfile: recallContext.personaProfile,
            tuningProfile: recallContext.tuningProfile,
            relationships: recallContext.relationships,
            fallbackRelationshipWeight: recallContext.fallbackRelationshipWeight,
        });
        const rankedCandidates: RecallCandidate[] = rankRecallCandidates({
            candidates: collectedCandidates,
            plan: recallPlan,
            recentVisibleMessages: logicalView?.visibleMessages.map((item) => item.text) ?? [],
            worldStateText,
            lorebookConflictDetected: lorebookDecision.conflictDetected,
        });
        const finalizedCandidates: RecallCandidate[] = cutRecallCandidatesByBudget({
            candidates: rankedCandidates,
            plan: recallPlan,
            estimateTokens: (value: string): number => this.estimateTokens(value),
        });
        const selectedCandidates: RecallCandidate[] = finalizedCandidates.filter((candidate: RecallCandidate): boolean => candidate.selected);
        const recallEntries: RecallLogEntry[] = buildRecallLogEntries(
            finalizedCandidates,
            String(opts?.query ?? ''),
            Date.now(),
        );
        const sectionTexts: Partial<Record<InjectionSectionName, string>> = {};

        for (const section of sections) {
            sectionTexts[section] = buildSectionText(
                section,
                selectedCandidates.filter((candidate: RecallCandidate): boolean => candidate.sectionHint === section),
                budgets[section] ?? 0,
                promptProfile,
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
                await this.chatStateManager.setLatestRecallExplanation(
                    await buildLatestRecallExplanationSnapshot({
                        generatedAt: preDecision.generatedAt,
                        query: String(opts?.query ?? ''),
                        sectionsUsed: sections,
                        reasonCodes: preDecision.reasonCodes,
                        recallEntries: [],
                    }),
                );
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

        const renderedText = renderInjectedContext(text, promptProfile, intent);
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
            await this.chatStateManager.recordRecallLog(recallEntries);
            await this.chatStateManager.setLatestRecallExplanation(
                await buildLatestRecallExplanationSnapshot({
                    generatedAt: preDecision.generatedAt,
                    query: String(opts?.query ?? ''),
                    sectionsUsed: sections,
                    reasonCodes: mergedReasonCodes,
                    recallEntries,
                }),
            );
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
     * 功能：按预算裁剪最终文本。
     * 参数：
     *   text：原始文本。
     *   maxTokens：总预算。
     * 返回：裁剪后的文本。
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
     * 参数：
     *   text：文本内容。
     * 返回：估算 token 数。
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
     * 功能：把任意值转成可读字符串。
     * 参数：
     *   value：任意值。
     * 返回：字符串。
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
}
