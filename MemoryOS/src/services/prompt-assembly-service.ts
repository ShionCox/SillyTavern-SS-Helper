import type { SdkTavernPromptMessageEvent } from '../../../SDK/tavern';
import { isStrictActorKey, normalizeStrictActorKeySyntax } from '../core/actor-key';
import { buildRelationshipCompareKey } from '../core/compare-key';
import { CompareKeyService } from '../core/compare-key-service';
import { getMemoryTrace, recordMemoryDebug } from '../core/debug/memory-retrieval-logger';
import { buildActorVisibleMemoryContext, renderMemoryContextXmlMarkdown } from '../memory-injection';
import { computeRetentionState } from '../memory-retention';
import { RetrievalOrchestrator, type RetrievalCandidate } from '../memory-retrieval';
import { detectWorldProfile, resolveWorldProfile } from '../memory-world-profile';
import { EntryRepository } from '../repository/entry-repository';
import { readMemoryOSSettings } from '../settings/store';
import type { ActorMemoryProfile, MemoryEntry, PromptAssemblyRoleEntry, PromptAssemblySnapshot, RoleEntryMemory, StructuredBindings } from '../types';
import type { MemoryCompareKeyIndexRecord } from '../db/db';

const promptRetrievalOrchestrator = new RetrievalOrchestrator();

/**
 * 功能：统一承接 Prompt 检索、记忆保留阶段计算与注入文本组装。
 */
export class PromptAssemblyService {
    private readonly chatKey: string;
    private readonly repository: EntryRepository;
    private readonly compareKeyService: CompareKeyService;

    constructor(chatKey: string, repository: EntryRepository, compareKeyService?: CompareKeyService) {
        this.chatKey = String(chatKey ?? '').trim();
        this.repository = repository;
        this.compareKeyService = compareKeyService ?? new CompareKeyService();
    }

    /**
     * 功能：构建统一 Prompt 注入快照。
     * @param input 组装输入
     * @returns Prompt 快照
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

        const [typeMap, entries, actorProfiles, worldBinding, roleMemories, compareKeyIndex] = await Promise.all([
            this.repository.listEntryTypes().then((items) => new Map(items.map((item): [string, typeof item] => [item.key, item]))),
            this.repository.listEntries(),
            this.repository.listActorProfiles(),
            this.repository.getWorldProfileBinding(),
            this.repository.listRoleMemories(),
            this.repository.listCompareKeyIndexRecords(),
        ]);

        const retrievalCandidates = this.buildPromptRetrievalCandidates(entries, roleMemories, actorProfiles, compareKeyIndex);
        const retrievalQueryText = query || promptText || '当前对话';
        const retrievalResult = await promptRetrievalOrchestrator.retrieve({
            query: retrievalQueryText,
            enableEmbedding: settings.enableEmbedding === true,
            chatKey: this.chatKey,
            rulePackMode: settings.retrievalRulePack,
            budget: {
                maxCandidates: 18,
                maxChars: Math.max(2600, Number(input.maxTokens ?? settings.contextMaxTokens) * 4),
            },
        }, retrievalCandidates, {
            actorProfiles: actorProfiles.map((profile: ActorMemoryProfile) => ({
                actorKey: profile.actorKey,
                displayName: profile.displayName,
                aliases: [],
            })),
        });

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
        const roleEntries = this.buildRoleEntries(roleMemories, matchedActorKeys, matchedEntryIdSet, entryMap, actorMap);

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
                matchModeCounts: this.buildPromptMatchModeCounts(selectedEntries, compareKeyIndex),
                compareKeySchemaVersion: 'v2',
            },
        };

        await this.repository.appendMutationHistory({
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
     * 功能：构建角色可见记忆列表。
     * @param roleMemories 角色记忆记录
     * @param matchedActorKeys 命中的角色键
     * @param matchedEntryIdSet 命中的条目集合
     * @param entryMap 条目映射
     * @param actorMap 角色映射
     * @returns 角色记忆条目
     */
    private buildRoleEntries(
        roleMemories: RoleEntryMemory[],
        matchedActorKeys: string[],
        matchedEntryIdSet: Set<string>,
        entryMap: Map<string, MemoryEntry>,
        actorMap: Map<string, ActorMemoryProfile>,
    ): PromptAssemblyRoleEntry[] {
        const roleEntries: PromptAssemblyRoleEntry[] = [];
        for (const row of roleMemories) {
            if (!matchedActorKeys.includes(row.actorKey) || !matchedEntryIdSet.has(row.entryId)) {
                continue;
            }
            const entry = entryMap.get(row.entryId);
            if (!entry) {
                continue;
            }
            const payload = this.toRecord(entry.detailPayload);
            const bindings = this.normalizeStructuredBindings(payload.bindings);
            const bindingCount = this.countBindings(bindings);
            const retention = computeRetentionState({
                memoryPercent: row.memoryPercent,
                importance: this.resolveEntryImportance(entry),
                rehearsalCount: this.resolveRehearsalCount(row),
                recencyHours: this.resolveRecencyHours(entry.updatedAt),
                actorMemoryStat: actorMap.get(row.actorKey)?.memoryStat ?? row.memoryPercent,
                relationSensitivity: this.resolveRelationSensitivity(entry),
            });
            roleEntries.push({
                actorKey: row.actorKey,
                actorLabel: actorMap.get(row.actorKey)?.displayName || row.actorKey,
                entryId: entry.entryId,
                title: entry.title,
                entryType: entry.entryType,
                memoryPercent: row.memoryPercent,
                forgotten: false,
                renderedText: this.renderRoleEntryText(entry, retention.stage, retention.distortionTemplateId),
                retentionStage: retention.stage,
                retentionReasonCodes: retention.reasonCodes,
                renderMode: retention.stage,
                distortionTemplateId: retention.distortionTemplateId,
                bindings,
                bindingDiagnostics: {
                    resolvedCount: bindingCount,
                    unresolvedCount: 0,
                    fallbackCount: 0,
                },
            });
        }
        return roleEntries;
    }

    /**
     * 功能：统计本次提示词召回使用的匹配模式分布。
     * @param selectedEntries 已选中的条目
     * @param compareKeyIndex compareKey 索引
     * @returns 匹配模式统计
     */
    private buildPromptMatchModeCounts(
        selectedEntries: MemoryEntry[],
        compareKeyIndex: MemoryCompareKeyIndexRecord[],
    ): Record<string, number> {
        const indexedEntryIds = new Set(
            compareKeyIndex
                .map((record: MemoryCompareKeyIndexRecord): string => String(record.entryId ?? '').trim())
                .filter(Boolean),
        );
        const counts: Record<string, number> = {
            indexed_match: 0,
            fallback_match: 0,
            binding_expanded: 0,
        };
        for (const entry of selectedEntries) {
            const payload = this.toRecord(entry.detailPayload);
            const bindings = this.normalizeStructuredBindings(payload.bindings);
            if (this.countBindings(bindings) > 0) {
                counts.binding_expanded += 1;
            }
            if (indexedEntryIds.has(entry.entryId)) {
                counts.indexed_match += 1;
                continue;
            }
            counts.fallback_match += 1;
        }
        return counts;
    }

    /**
     * 功能：收集角色画像别名。
     * @param entries 条目列表
     * @param actorKey 角色键
     * @returns 别名列表
     */
    private collectActorProfileAliases(): string[] {
        return [];
    }

    /**
     * 功能：构建 Prompt 检索候选。
     * @param entries 条目列表
     * @param roleRows 角色记忆列表
     * @param actorProfiles 角色资料列表
     * @param compareKeyIndex compareKey 索引
     * @returns 检索候选
     */
    private buildPromptRetrievalCandidates(
        entries: MemoryEntry[],
        roleRows: RoleEntryMemory[],
        actorProfiles: ActorMemoryProfile[],
        compareKeyIndex: MemoryCompareKeyIndexRecord[],
    ): RetrievalCandidate[] {
        const boundActorMap = new Map<string, string[]>();
        const memoryPercentMap = new Map<string, number>();
        roleRows.forEach((row: RoleEntryMemory): void => {
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
        const indexMap = new Map(compareKeyIndex.map((item): [string, MemoryCompareKeyIndexRecord] => [item.entryId, item]));

        return entries.map((entry: MemoryEntry): RetrievalCandidate => {
            const payload = this.toRecord(entry.detailPayload);
            const fields = this.toRecord(payload.fields);
            const bindings = this.normalizeStructuredBindings(payload.bindings ?? fields.bindings);
            const sourceActorKey = this.normalizeActorKey(payload.sourceActorKey ?? fields.sourceActorKey);
            const targetActorKey = this.normalizeActorKey(payload.targetActorKey ?? fields.targetActorKey);
            const participantNames = this.normalizeLooseStringArray(payload.participants ?? fields.participants);
            const boundActorKeys = boundActorMap.get(entry.entryId) ?? [];
            const actorKeys = Array.from(new Set([
                ...boundActorKeys,
                ...bindings.actors,
                ...[sourceActorKey, targetActorKey].filter(Boolean),
            ]));
            const participantActorKeys = participantNames
                .map((name: string): string => actorKeyByDisplayName.get(name) ?? '')
                .filter(Boolean);
            const relationKeys = Array.from(new Set([
                ...this.normalizeLooseStringArray(payload.relationKeys ?? fields.relationKeys),
                ...(sourceActorKey && targetActorKey ? [buildRelationshipCompareKey(
                    sourceActorKey,
                    targetActorKey,
                    this.normalizeText(fields.relationTag ?? payload.relationTag),
                )] : []),
                ...this.normalizeLooseStringArray(fields.relationTag ?? payload.relationTag),
            ]));
            const locationKey = this.normalizeText(payload.locationKey ?? fields.locationKey ?? payload.location ?? fields.location);
            const worldKeys = Array.from(new Set([
                ...this.normalizeLooseStringArray(payload.worldKeys ?? fields.worldKeys),
                ...bindings.organizations,
                ...bindings.cities,
                ...bindings.locations,
                ...bindings.nations,
                ...(entry.entryType.startsWith('world_') ? [entry.title] : []),
            ]));
            const aliasTexts = Array.from(new Set([
                ...actorKeys.map((actorKey: string): string => actorDisplayNameMap.get(actorKey) ?? ''),
                ...participantNames,
                ...this.normalizeLooseStringArray(payload.aliases ?? fields.aliases),
                ...this.expandBindingAliasTexts(bindings),
                ...entry.tags,
                ...(indexMap.get(entry.entryId)?.matchKeys ?? []),
            ])).filter(Boolean);
            const resolvedCompareKey = indexMap.get(entry.entryId)?.compareKey || this.compareKeyService.buildIndexRecord(entry).compareKey;
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
                relationKeys: Array.from(new Set([
                    ...relationKeys,
                    ...bindings.tasks,
                    ...bindings.events,
                ])),
                participantActorKeys: Array.from(new Set([...participantActorKeys, ...boundActorKeys])),
                locationKey: locationKey || bindings.locations[0] || bindings.cities[0] || undefined,
                worldKeys,
                compareKey: resolvedCompareKey,
                injectToSystem: entry.entryType.startsWith('world_') || entry.entryType === 'scene_shared_state' || entry.entryType === 'location',
                aliasTexts,
            };
        });
    }

    /**
     * 功能：解析命中的角色键。
     * @param anchorActorKeys 上下文锚点角色键
     * @param candidates 检索候选
     * @param actorProfiles 角色资料列表
     * @returns 角色键列表
     */
    private resolvePromptMatchedActorKeys(anchorActorKeys: string[], candidates: RetrievalCandidate[], actorProfiles: ActorMemoryProfile[]): string[] {
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
     * 功能：估算条目重要度。
     * @param entry 记忆条目
     * @returns 重要度
     */
    private resolveEntryImportance(entry: MemoryEntry): number {
        if (entry.entryType.startsWith('world_')) {
            return 88;
        }
        if (entry.entryType === 'task') {
            return 82;
        }
        if (entry.entryType === 'event') {
            return 74;
        }
        return 60;
    }

    /**
     * 功能：估算复述次数。
     * @param row 角色记忆记录
     * @returns 复述次数
     */
    private resolveRehearsalCount(row: RoleEntryMemory): number {
        let count = 0;
        if (row.lastRefreshSummaryId) count += 1;
        if (row.lastMentionSummaryId) count += 1;
        return count;
    }

    /**
     * 功能：计算距今小时数。
     * @param updatedAt 更新时间
     * @returns 小时数
     */
    private resolveRecencyHours(updatedAt: number): number {
        const ageMs = Math.max(0, Date.now() - Number(updatedAt || 0));
        return Number((ageMs / (1000 * 60 * 60)).toFixed(2));
    }

    /**
     * 功能：估算关系敏感度。
     * @param entry 记忆条目
     * @returns 敏感度
     */
    private resolveRelationSensitivity(entry: MemoryEntry): number {
        if (entry.entryType === 'event') {
            return 72;
        }
        return 48;
    }

    /**
     * 功能：按保留阶段渲染角色记忆文本。
     * @param entry 记忆条目
     * @param stage 保留阶段
     * @param distortionTemplateId 失真模板标识
     * @returns 渲染文本
     */
    private renderRoleEntryText(entry: MemoryEntry, stage: 'clear' | 'blur' | 'distorted', distortionTemplateId?: string): string {
        const baseSummary = entry.summary || entry.detail || '暂无详情';
        if (stage === 'clear') {
            return `${entry.title}：${baseSummary}`;
        }
        if (stage === 'blur') {
            const shortened = baseSummary.length > 24 ? `${baseSummary.slice(0, 24)}……` : `${baseSummary}（细节已模糊）`;
            return `${entry.title}：${shortened}`;
        }
        return `${entry.title}：${this.renderDistortedSummary(entry, distortionTemplateId)}`;
    }

    /**
     * 功能：按模板渲染失真文本。
     * @param entry 记忆条目
     * @param distortionTemplateId 失真模板标识
     * @returns 失真文本
     */
    private renderDistortedSummary(entry: MemoryEntry, distortionTemplateId?: string): string {
        const summary = entry.summary || entry.detail || entry.title;
        if (distortionTemplateId === 'relationship_attitude_shift') {
            return '她记不清细节，只觉得这段关系大概已经变了味道。';
        }
        if (distortionTemplateId === 'critical_fact_fragmented') {
            return `她只记得其中一部分，好像和“${entry.title}”有关，但顺序已经错乱。`;
        }
        return `她只模糊记得：${summary.slice(0, Math.min(summary.length, 18))}……`;
    }

    /**
     * 功能：标准化松散字符串数组。
     * @param value 原始值
     * @returns 字符串数组
     */
    private normalizeLooseStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean);
        }
        const text = this.normalizeText(value);
        if (!text) {
            return [];
        }
        return text.split(/[,，、\n]+/).map((item: string): string => this.normalizeText(item)).filter(Boolean);
    }

    /**
     * 功能：按预算裁剪文本。
     * @param text 原始文本
     * @param maxTokens 最大 token 预算
     * @returns 裁剪结果
     */
    /**
     * 功能：把任意绑定对象归一化为统一结构。
     * @param value 原始绑定值
     * @returns 归一化后的结构化绑定
     */
    private normalizeStructuredBindings(value: unknown): StructuredBindings {
        const source = this.toRecord(value);
        return {
            actors: this.normalizeLooseStringArray(source.actors),
            organizations: this.normalizeLooseStringArray(source.organizations),
            cities: this.normalizeLooseStringArray(source.cities),
            locations: this.normalizeLooseStringArray(source.locations),
            nations: this.normalizeLooseStringArray(source.nations),
            tasks: this.normalizeLooseStringArray(source.tasks),
            events: this.normalizeLooseStringArray(source.events),
        };
    }

    /**
     * 功能：统计绑定对象中已经解析出的引用数量。
     * @param bindings 结构化绑定
     * @returns 引用数量
     */
    private countBindings(bindings: StructuredBindings): number {
        return Object.values(bindings).reduce((total: number, items: string[]): number => total + items.length, 0);
    }

    /**
     * 功能：把绑定引用展开为可参与检索的别名文本。
     * @param bindings 结构化绑定
     * @returns 别名文本列表
     */
    private expandBindingAliasTexts(bindings: StructuredBindings): string[] {
        return Array.from(new Set(
            Object.values(bindings)
                .flatMap((items: string[]): string[] => items)
                .map((item: string): string => this.normalizeText(item))
                .filter(Boolean),
        ));
    }

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
     * 功能：读取提示消息文本。
     * @param message 提示消息
     * @returns 文本内容
     */
    private readPromptText(message: SdkTavernPromptMessageEvent): string {
        const record = message as Record<string, unknown>;
        return this.normalizeText(record.content ?? record.mes ?? record.text ?? '');
    }

    /**
     * 功能：安全转换对象。
     * @param value 原始值
     * @returns 对象
     */
    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：标准化文本。
     * @param value 原始值
     * @returns 文本
     */
    private normalizeText(value: unknown): string {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }

    /**
     * 功能：标准化角色键。
     * @param value 原始值
     * @returns 角色键
     */
    private normalizeActorKey(value: unknown): string {
        const normalizedValue = normalizeStrictActorKeySyntax(value);
        return isStrictActorKey(normalizedValue) ? normalizedValue : '';
    }
}
