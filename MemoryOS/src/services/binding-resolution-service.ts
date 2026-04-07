import type { MemoryCompareKeyIndexRecord } from '../db/db';
import { isStrictActorKey, normalizeStrictActorKeySyntax } from '../core/actor-key';
import { CompareKeyService } from '../core/compare-key-service';
import type {
    ActorMemoryProfile,
    BindingMatchMode,
    BindingResolutionDecision,
    MemoryEntry,
    ResolvedBindings,
    StructuredBindings,
} from '../types';

type BindingKey = keyof StructuredBindings;

interface BindingReferenceCandidate {
    bindingKey: BindingKey;
    ref: string;
    label: string;
    aliases: string[];
    sourceKind: 'actor' | 'entry' | 'batch';
}

/**
 * 功能：统一处理结构化卡片的绑定解析、校验与补全。
 */
export class BindingResolutionService {
    private readonly compareKeyService: CompareKeyService;

    constructor(compareKeyService?: CompareKeyService) {
        this.compareKeyService = compareKeyService ?? new CompareKeyService();
    }

    /**
     * 功能：解析单条 mutation 对应的结构化绑定。
     * @param input 绑定解析输入。
     * @returns 解析后的绑定结果与诊断信息。
     */
    public resolveForMutation(input: {
        bindings?: Partial<StructuredBindings> | Record<string, unknown>;
        actorBindings?: string[];
        title?: string;
        summary?: string;
        detail?: string;
        detailPayload?: Record<string, unknown>;
        compareKey?: string;
        entityKey?: string;
        targetKind?: string;
        actorProfiles: ActorMemoryProfile[];
        existingEntries: MemoryEntry[];
        compareKeyRecords: MemoryCompareKeyIndexRecord[];
        batchCandidates?: Array<{
            bindingKey: BindingKey;
            ref: string;
            label: string;
            aliases?: string[];
        }>;
    }): ResolvedBindings {
        const normalizedBindings = this.normalizeBindings(input.bindings);
        normalizedBindings.actors = this.dedupeStrings([
            ...normalizedBindings.actors,
            ...(Array.isArray(input.actorBindings) ? input.actorBindings : []),
        ]);
        const candidates = this.buildReferenceCandidates(
            input.actorProfiles,
            input.existingEntries,
            input.compareKeyRecords,
            input.batchCandidates ?? [],
        );
        const decisions: BindingResolutionDecision[] = [];
        const output = this.createEmptyBindings();
        const searchTexts = this.collectSearchTexts(input);

        (Object.keys(output) as BindingKey[]).forEach((bindingKey: BindingKey): void => {
            const explicitItems = normalizedBindings[bindingKey] ?? [];
            for (const rawValue of explicitItems) {
                const decision = this.resolveSingleBinding(rawValue, bindingKey, candidates);
                decisions.push(decision);
                if (decision.resolvedRef) {
                    output[bindingKey].push(decision.resolvedRef);
                }
            }
            const inferred = this.inferBindingsFromText(bindingKey, output[bindingKey], searchTexts, candidates);
            inferred.forEach((decision: BindingResolutionDecision): void => {
                decisions.push(decision);
                if (decision.resolvedRef) {
                    output[bindingKey].push(decision.resolvedRef);
                }
            });
            output[bindingKey] = this.dedupeStrings(output[bindingKey]);
        });

        const resolvedCount = decisions.filter((item: BindingResolutionDecision): boolean => Boolean(item.resolvedRef)).length;
        const unresolvedCount = decisions.filter((item: BindingResolutionDecision): boolean => item.matchMode === 'unresolved').length;
        const fallbackCount = decisions.filter((item: BindingResolutionDecision): boolean => item.matchMode === 'batch_reuse' || item.matchMode === 'rule_inferred').length;
        return {
            bindings: output,
            decisions,
            resolvedCount,
            unresolvedCount,
            fallbackCount,
        };
    }

    /**
     * 功能：创建空绑定对象。
     * @returns 空绑定对象。
     */
    public createEmptyBindings(): StructuredBindings {
        return {
            actors: [],
            organizations: [],
            cities: [],
            locations: [],
            nations: [],
            tasks: [],
            events: [],
        };
    }

    /**
     * 功能：归一化原始绑定输入。
     * @param value 原始绑定输入。
     * @returns 规范化后的绑定对象。
     */
    public normalizeBindings(value: unknown): StructuredBindings {
        const record = this.toRecord(value);
        return {
            actors: this.toStringArray(record.actors),
            organizations: this.toStringArray(record.organizations),
            cities: this.toStringArray(record.cities),
            locations: this.toStringArray(record.locations),
            nations: this.toStringArray(record.nations),
            tasks: this.toStringArray(record.tasks),
            events: this.toStringArray(record.events),
        };
    }

    /**
     * 功能：构建绑定候选引用表。
     * @param actorProfiles 角色资料列表。
     * @param existingEntries 已有条目列表。
     * @param compareKeyRecords compareKey 索引。
     * @param batchCandidates 批次候选引用。
     * @returns 候选引用列表。
     */
    private buildReferenceCandidates(
        actorProfiles: ActorMemoryProfile[],
        existingEntries: MemoryEntry[],
        compareKeyRecords: MemoryCompareKeyIndexRecord[],
        batchCandidates: Array<{
            bindingKey: BindingKey;
            ref: string;
            label: string;
            aliases?: string[];
        }>,
    ): BindingReferenceCandidate[] {
        const result: BindingReferenceCandidate[] = [];
        const seen = new Set<string>();
        const appendCandidate = (candidate: BindingReferenceCandidate): void => {
            const key = `${candidate.bindingKey}::${candidate.ref}`;
            if (!candidate.ref || !candidate.label || seen.has(key)) {
                return;
            }
            seen.add(key);
            result.push({
                ...candidate,
                aliases: this.dedupeStrings(candidate.aliases),
            });
        };

        actorProfiles.forEach((profile: ActorMemoryProfile): void => {
            appendCandidate({
                bindingKey: 'actors',
                ref: profile.actorKey,
                label: profile.displayName,
                aliases: [],
                sourceKind: 'actor',
            });
        });

        compareKeyRecords.forEach((record: MemoryCompareKeyIndexRecord): void => {
            const bindingKey = this.resolveBindingKeyFromEntryType(record.entryType);
            if (!bindingKey) {
                return;
            }
            appendCandidate({
                bindingKey,
                ref: record.entityKey || record.compareKey,
                label: record.title || record.canonicalName,
                aliases: [
                    record.canonicalName,
                    ...(record.matchKeys ?? []),
                    ...(record.legacyCompareKeys ?? []),
                    record.compareKey,
                    record.entityKey,
                ],
                sourceKind: 'entry',
            });
        });

        batchCandidates.forEach((candidate) => {
            appendCandidate({
                bindingKey: candidate.bindingKey,
                ref: candidate.ref,
                label: candidate.label,
                aliases: candidate.aliases ?? [],
                sourceKind: 'batch',
            });
        });
        return result;
    }

    /**
     * 功能：解析单个绑定值。
     * @param rawValue 原始绑定值。
     * @param bindingKey 绑定分类。
     * @param candidates 候选引用列表。
     * @returns 单条解析决策。
     */
    private resolveSingleBinding(
        rawValue: string,
        bindingKey: BindingKey,
        candidates: BindingReferenceCandidate[],
    ): BindingResolutionDecision {
        const normalizedRawValue = this.normalizeText(rawValue);
        if (!normalizedRawValue) {
            return {
                bindingKey,
                rawValue: '',
                matchMode: 'unresolved',
                sourceKind: 'fallback',
            };
        }
        const sameTypeCandidates = candidates.filter((item: BindingReferenceCandidate): boolean => item.bindingKey === bindingKey);

        const entityKeyMatched = sameTypeCandidates.find((item: BindingReferenceCandidate): boolean => item.ref === normalizedRawValue);
        if (entityKeyMatched) {
            return this.buildDecision(bindingKey, normalizedRawValue, entityKeyMatched, 'entity_key', entityKeyMatched.sourceKind === 'batch' ? 'fallback' : 'explicit');
        }

        const compareKeyMatched = sameTypeCandidates.find((item: BindingReferenceCandidate): boolean => {
            return normalizedRawValue.startsWith('ck:')
                && item.aliases.some((alias: string): boolean => this.compareKeyService.isExactMatch(alias, normalizedRawValue));
        });
        if (compareKeyMatched) {
            return this.buildDecision(bindingKey, normalizedRawValue, compareKeyMatched, 'compare_key', compareKeyMatched.sourceKind === 'batch' ? 'fallback' : 'explicit');
        }

        const matchKeyMatched = sameTypeCandidates.find((item: BindingReferenceCandidate): boolean => {
            return normalizedRawValue.startsWith('mk:')
                && item.aliases.some((alias: string): boolean => this.compareKeyService.isExactMatch(alias, normalizedRawValue));
        });
        if (matchKeyMatched) {
            return this.buildDecision(bindingKey, normalizedRawValue, matchKeyMatched, 'match_key', matchKeyMatched.sourceKind === 'batch' ? 'fallback' : 'explicit');
        }

        const aliasMatched = sameTypeCandidates.find((item: BindingReferenceCandidate): boolean => {
            return this.matchByAlias(item, normalizedRawValue);
        });
        if (aliasMatched) {
            return this.buildDecision(
                bindingKey,
                normalizedRawValue,
                aliasMatched,
                aliasMatched.sourceKind === 'batch' ? 'batch_reuse' : 'alias_exact',
                aliasMatched.sourceKind === 'batch' ? 'fallback' : 'explicit',
            );
        }

        return {
            bindingKey,
            rawValue: normalizedRawValue,
            matchMode: 'unresolved',
            sourceKind: 'fallback',
        };
    }

    /**
     * 功能：从文本中做保守的规则推断绑定。
     * @param bindingKey 绑定分类。
     * @param existingRefs 当前已命中的引用。
     * @param searchTexts 可搜索文本列表。
     * @param candidates 候选引用列表。
     * @returns 推断出的绑定决策列表。
     */
    private inferBindingsFromText(
        bindingKey: BindingKey,
        existingRefs: string[],
        searchTexts: string[],
        candidates: BindingReferenceCandidate[],
    ): BindingResolutionDecision[] {
        if (searchTexts.length <= 0) {
            return [];
        }
        const existingRefSet = new Set(existingRefs);
        const joinedText = searchTexts.join('\n');
        return candidates
            .filter((item: BindingReferenceCandidate): boolean => item.bindingKey === bindingKey)
            .filter((item: BindingReferenceCandidate): boolean => !existingRefSet.has(item.ref))
            .filter((item: BindingReferenceCandidate): boolean => this.containsAlias(joinedText, item))
            .map((item: BindingReferenceCandidate): BindingResolutionDecision => ({
                bindingKey,
                rawValue: item.label,
                resolvedRef: item.ref,
                resolvedLabel: item.label,
                matchMode: item.sourceKind === 'batch' ? 'batch_reuse' : 'rule_inferred',
                sourceKind: item.sourceKind === 'batch' ? 'fallback' : 'rule',
            }));
    }

    /**
     * 功能：收集用于规则推断的文本列表。
     * @param input 解析输入。
     * @returns 文本列表。
     */
    private collectSearchTexts(input: {
        title?: string;
        summary?: string;
        detail?: string;
        detailPayload?: Record<string, unknown>;
        compareKey?: string;
        entityKey?: string;
    }): string[] {
        const payload = this.toRecord(input.detailPayload);
        const fields = this.toRecord(payload.fields);
        const values = [
            input.title,
            input.summary,
            input.detail,
            input.compareKey,
            input.entityKey,
            payload.title,
            payload.summary,
            payload.detail,
            payload.subject,
            payload.predicate,
            payload.value,
            fields.objective,
            fields.goal,
            fields.state,
            fields.status,
            fields.location,
            fields.city,
            fields.nation,
            fields.organization,
            fields.parentLocation,
            fields.parentOrganization,
        ];
        return this.dedupeStrings(values.map((item: unknown): string => this.normalizeText(item)).filter(Boolean));
    }

    /**
     * 功能：根据条目类型映射绑定分类。
     * @param entryType 条目类型。
     * @returns 绑定分类。
     */
    private resolveBindingKeyFromEntryType(entryType: string): BindingKey | null {
        const normalizedType = this.normalizeText(entryType).toLowerCase();
        if (normalizedType === 'organization') return 'organizations';
        if (normalizedType === 'city') return 'cities';
        if (normalizedType === 'nation') return 'nations';
        if (normalizedType === 'location') return 'locations';
        if (normalizedType === 'task') return 'tasks';
        if (normalizedType === 'event') return 'events';
        return null;
    }

    /**
     * 功能：判断候选是否通过别名精确命中。
     * @param candidate 候选引用。
     * @param rawValue 原始值。
     * @returns 是否命中。
     */
    private matchByAlias(candidate: BindingReferenceCandidate, rawValue: string): boolean {
        const lookupValue = this.normalizeLookup(rawValue);
        if (!lookupValue) {
            return false;
        }
        const names = [
            candidate.ref,
            candidate.label,
            ...candidate.aliases,
        ];
        return names.some((item: string): boolean => this.normalizeLookup(item) === lookupValue);
    }

    /**
     * 功能：判断文本是否包含候选别名。
     * @param text 全量文本。
     * @param candidate 候选引用。
     * @returns 是否包含。
     */
    private containsAlias(text: string, candidate: BindingReferenceCandidate): boolean {
        const lookupText = this.normalizeLookup(text);
        if (!lookupText) {
            return false;
        }
        const names = [
            candidate.label,
            ...candidate.aliases,
        ]
            .map((item: string): string => this.normalizeLookup(item))
            .filter((item: string): boolean => item.length >= 2 && !item.startsWith('ck:') && !item.startsWith('mk:') && !item.startsWith('entity:'));
        return names.some((item: string): boolean => lookupText.includes(item));
    }

    /**
     * 功能：构建单条解析决策。
     * @param bindingKey 绑定分类。
     * @param rawValue 原始值。
     * @param candidate 命中的候选。
     * @param matchMode 命中模式。
     * @param sourceKind 来源类别。
     * @returns 解析决策。
     */
    private buildDecision(
        bindingKey: BindingKey,
        rawValue: string,
        candidate: BindingReferenceCandidate,
        matchMode: BindingMatchMode,
        sourceKind: 'explicit' | 'fallback' | 'rule',
    ): BindingResolutionDecision {
        return {
            bindingKey,
            rawValue,
            resolvedRef: candidate.ref,
            resolvedLabel: candidate.label,
            matchMode,
            sourceKind,
        };
    }

    /**
     * 功能：安全转换对象。
     * @param value 原始值。
     * @returns 对象结果。
     */
    private toRecord(value: unknown): Record<string, unknown> {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return {};
        }
        return value as Record<string, unknown>;
    }

    /**
     * 功能：把未知值转换为字符串数组。
     * @param value 原始值。
     * @returns 字符串数组。
     */
    private toStringArray(value: unknown): string[] {
        if (Array.isArray(value)) {
            return this.dedupeStrings(value.map((item: unknown): string => this.normalizeText(item)).filter(Boolean));
        }
        const text = this.normalizeText(value);
        if (!text) {
            return [];
        }
        return this.dedupeStrings(text.split(/[,，、\n]+/).map((item: string): string => this.normalizeText(item)).filter(Boolean));
    }

    /**
     * 功能：对字符串数组做去重。
     * @param values 原始值列表。
     * @returns 去重结果。
     */
    private dedupeStrings(values: string[]): string[] {
        return [...new Set(values.map((item: string): string => this.normalizeText(item)).filter(Boolean))];
    }

    /**
     * 功能：归一化检索文本。
     * @param value 原始值。
     * @returns 归一化结果。
     */
    private normalizeLookup(value: unknown): string {
        return this.normalizeText(value)
            .toLowerCase()
            .replace(/\s+/g, '')
            .replace(/[^\p{L}\p{N}:_-]+/gu, '');
    }

    /**
     * 功能：归一化角色键。
     * @param value 原始值。
     * @returns 角色键。
     */
    private normalizeActorKey(value: unknown): string {
        const normalizedValue = normalizeStrictActorKeySyntax(value);
        return isStrictActorKey(normalizedValue) ? normalizedValue : '';
    }

    /**
     * 功能：归一化文本。
     * @param value 原始值。
     * @returns 归一化结果。
     */
    private normalizeText(value: unknown): string {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
    }
}
