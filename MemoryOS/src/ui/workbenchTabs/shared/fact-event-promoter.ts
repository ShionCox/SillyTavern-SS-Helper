import { buildEventCompareKey } from '../../../core/compare-key';
import type { MemoryTakeoverBatchResult, MemoryTakeoverStableFact } from '../../../types';
import type { MemoryGraphMode, WorkbenchMemoryGraphField, WorkbenchMemoryGraphSection } from './memoryGraphTypes';
import { resolveDisplayLabel, stripComparePrefix, type DisplayLabelResolverContext } from './display-label-resolver';
import { normalizeMemoryCardTitle } from './memory-title-normalizer';

/**
 * 功能：定义升格后的事件节点载荷。
 */
export interface PromotedMemoryEvent {
    key: string;
    compareKey: string;
    label: string;
    summary: string;
    status?: string;
    importance: number;
    sourceBatchIds: string[];
    reasonCodes: string[];
    bindings: Record<string, string[]>;
    sections: WorkbenchMemoryGraphSection[];
    rawData: Record<string, unknown>;
}

/**
 * 功能：把稳定事实中真正值得进图的事件升格为事件节点。
 * @param facts 稳定事实列表。
 * @param options 升格上下文。
 * @returns 升格后的事件列表。
 */
export function promoteFactsToEvents(
    facts: MemoryTakeoverStableFact[],
    options: {
        batchResults: MemoryTakeoverBatchResult[];
        labelContext: DisplayLabelResolverContext;
    },
): PromotedMemoryEvent[] {
    const updateCountMap = buildEventUpdateCountMap(options.batchResults);
    const result: PromotedMemoryEvent[] = [];
    const seen = new Set<string>();
    for (const fact of facts) {
        if (String(fact.type ?? '').trim().toLowerCase() !== 'event') {
            continue;
        }
        const bindings = normalizeBindings(fact.bindings);
        const signalCount = countEventSignals(fact, bindings, updateCountMap.get(String(fact.compareKey ?? '').trim()) ?? 0);
        if (signalCount < 2) {
            continue;
        }
        const compareKey = String(fact.compareKey ?? '').trim() || buildEventCompareKey(
            String(fact.title ?? '').trim() || `${String(fact.subject ?? '').trim()} ${String(fact.predicate ?? '').trim()}`.trim(),
            {
                qualifier: String(fact.status ?? fact.value ?? '').trim(),
                aliases: thisEventAliases(fact),
            },
        );
        if (seen.has(compareKey)) {
            continue;
        }
        seen.add(compareKey);
        const label = normalizeMemoryCardTitle(
            String(fact.title ?? '').trim() || `${String(fact.subject ?? '').trim()} · ${String(fact.predicate ?? '').trim()}`,
            {
                mode: 'semantic',
                context: options.labelContext,
                typeHint: 'event',
                fallbackRef: compareKey,
            },
        );
        const summary = String(fact.summary ?? '').trim() || `${String(fact.subject ?? '').trim()}${String(fact.predicate ?? '').trim()}${String(fact.value ?? '').trim()}`;
        result.push({
            key: compareKey,
            compareKey,
            label,
            summary,
            status: String(fact.status ?? '').trim() || undefined,
            importance: Math.max(Number(fact.importance ?? 0), Number(fact.confidence ?? 0), 0.55),
            sourceBatchIds: findFactSourceBatchIds(compareKey, options.batchResults),
            reasonCodes: Array.isArray(fact.reasonCodes) ? fact.reasonCodes.map((item) => String(item ?? '').trim()).filter(Boolean) : [],
            bindings,
            sections: buildEventSections(fact, summary, bindings, signalCount, options.labelContext),
            rawData: fact as unknown as Record<string, unknown>,
        });
    }
    return result;
}

/**
 * 功能：统计事件是否满足升格条件。
 * @param fact 稳定事实。
 * @param bindings 绑定信息。
 * @param updateCount 后续更新次数。
 * @returns 命中的条件数量。
 */
function countEventSignals(
    fact: MemoryTakeoverStableFact,
    bindings: Record<string, string[]>,
    updateCount: number,
): number {
    let signals = 0;
    if ((bindings.actors?.length ?? 0) > 0) {
        signals += 1;
    }
    if ((bindings.locations?.length ?? 0) > 0 || (bindings.cities?.length ?? 0) > 0) {
        signals += 1;
    }
    if (String(fact.status ?? '').trim()) {
        signals += 1;
    }
    if ((bindings.tasks?.length ?? 0) > 0) {
        signals += 1;
    }
    const totalBindings = Object.values(bindings).reduce((sum: number, items: string[]): number => sum + items.length, 0);
    if (totalBindings >= 2) {
        signals += 1;
    }
    if (updateCount > 1) {
        signals += 1;
    }
    return signals;
}

/**
 * 功能：构建事件详情区块。
 * @param fact 稳定事实。
 * @param summary 语义摘要。
 * @param bindings 绑定信息。
 * @param signalCount 命中信号数。
 * @returns 详情区块列表。
 */
function buildEventSections(
    fact: MemoryTakeoverStableFact,
    summary: string,
    bindings: Record<string, string[]>,
    signalCount: number,
    labelContext: DisplayLabelResolverContext,
): WorkbenchMemoryGraphSection[] {
    const sections: WorkbenchMemoryGraphSection[] = [
        {
            title: '事件摘要',
            fields: [
                { label: '摘要', value: summary },
                { label: '状态', value: String(fact.status ?? '').trim() || 'active' },
                { label: '重要度', value: String(Number(fact.importance ?? fact.confidence ?? 0).toFixed(2)) },
                { label: '升格信号', value: String(signalCount) },
            ],
        },
        {
            title: '原始事实',
            fields: [
                { label: 'subject', value: String(fact.subject ?? '').trim() || '暂无' },
                { label: 'predicate', value: String(fact.predicate ?? '').trim() || '暂无' },
                { label: 'value', value: String(fact.value ?? '').trim() || '暂无' },
                { label: 'compareKey', value: String(fact.compareKey ?? '').trim() || '暂无' },
            ],
            visibleInModes: ['debug'] as MemoryGraphMode[],
        },
        {
            title: '绑定关系',
            fields: buildBindingFields(bindings, labelContext),
        },
    ];
    return sections.filter((section: WorkbenchMemoryGraphSection): boolean => section.fields.length > 0);
}

/**
 * 功能：构建事件绑定详情字段。
 * @param bindings 绑定信息。
 * @param labelContext 显示名上下文。
 * @returns 字段列表。
 */
function buildBindingFields(
    bindings: Record<string, string[]>,
    labelContext: DisplayLabelResolverContext,
): WorkbenchMemoryGraphSection['fields'] {
    return Object.entries(bindings)
        .filter(([, items]: [string, string[]]): boolean => items.length > 0)
        .flatMap(([key, items]: [string, string[]]) => {
            const rawValue = items.join('、');
            const semanticValue = items
                .map((item: string): string => resolveDisplayLabel(item, {
                    mode: 'semantic',
                    context: labelContext,
                    fallbackLabel: stripComparePrefix(item) || item,
                }))
                .join('、');
            return [
                { label: key, value: semanticValue, visibleInModes: ['semantic'] as MemoryGraphMode[] },
                { label: `${key}(raw)`, value: rawValue, visibleInModes: ['debug'] as MemoryGraphMode[] },
            ];
        }) as WorkbenchMemoryGraphField[];
}

/**
 * 功能：构建事件更新次数索引。
 * @param batchResults 批次结果列表。
 * @returns compareKey 到更新次数映射。
 */
function buildEventUpdateCountMap(batchResults: MemoryTakeoverBatchResult[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const batch of batchResults) {
        for (const fact of batch.stableFacts ?? []) {
            if (String(fact.type ?? '').trim().toLowerCase() !== 'event') {
                continue;
            }
            const compareKey = String(fact.compareKey ?? '').trim();
            if (!compareKey) {
                continue;
            }
            result.set(compareKey, (result.get(compareKey) ?? 0) + 1);
        }
    }
    return result;
}

/**
 * 功能：查找事实命中的来源批次。
 * @param compareKey 事件 compareKey。
 * @param batchResults 批次结果列表。
 * @returns 来源批次列表。
 */
function findFactSourceBatchIds(compareKey: string, batchResults: MemoryTakeoverBatchResult[]): string[] {
    const batchIds: string[] = [];
    for (const batch of batchResults) {
        const matched = (batch.stableFacts ?? []).some((fact: MemoryTakeoverStableFact): boolean => {
            return String(fact.compareKey ?? '').trim() === compareKey;
        });
        if (matched) {
            batchIds.push(batch.batchId);
        }
    }
    return batchIds;
}

/**
 * 功能：把未知绑定值归一化为稳定绑定对象。
 * @param value 原始绑定值。
 * @returns 归一化后的绑定对象。
 */
function normalizeBindings(value: unknown): Record<string, string[]> {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
    return {
        actors: normalizeStringArray(source.actors),
        organizations: normalizeStringArray(source.organizations),
        cities: normalizeStringArray(source.cities),
        locations: normalizeStringArray(source.locations),
        nations: normalizeStringArray(source.nations),
        tasks: normalizeStringArray(source.tasks),
        events: normalizeStringArray(source.events),
    };
}

/**
 * 功能：把未知值归一化为字符串数组。
 * @param value 原始值。
 * @returns 字符串数组。
 */
function normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item: unknown): string => String(item ?? '').trim())
        .filter(Boolean);
}

/**
 * 功能：提取事件可用于构建 compareKey 的别名列表。
 * @param fact 旧聊天接管稳定事实。
 * @returns 去重后的别名列表。
 */
function thisEventAliases(fact: MemoryTakeoverStableFact): string[] {
    return Array.from(new Set([
        String(fact.title ?? '').trim(),
        String(fact.subject ?? '').trim(),
        `${String(fact.subject ?? '').trim()} ${String(fact.predicate ?? '').trim()}`.trim(),
        `${String(fact.subject ?? '').trim()}${String(fact.predicate ?? '').trim()}`.trim(),
    ].filter(Boolean)));
}
