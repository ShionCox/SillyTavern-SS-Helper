import type { MemoryGraphMode, WorkbenchMemoryGraphEdge, WorkbenchMemoryGraphSection } from './memoryGraphTypes';

/**
 * 功能：定义图边账本输入。
 */
export interface MemoryGraphEdgeLedgerInput {
    id: string;
    source: string;
    target: string;
    relationType: string;
    label: string;
    semanticLabel?: string;
    debugSummary?: string;
    confidence?: number;
    status?: 'active' | 'inactive';
    visibleInModes?: MemoryGraphMode[];
    sourceKinds?: string[];
    sourceRefs?: string[];
    sourceBatchIds?: string[];
    reasonCodes?: string[];
    sections?: WorkbenchMemoryGraphSection[];
    rawData?: Record<string, unknown>;
}

/**
 * 功能：定义图边账本。
 */
export interface MemoryGraphEdgeLedger {
    append(edge: MemoryGraphEdgeLedgerInput): void;
    toEdges(): WorkbenchMemoryGraphEdge[];
}

/**
 * 功能：创建可去重聚合的图边账本。
 * @returns 图边账本实例。
 */
export function createGraphEdgeLedger(): MemoryGraphEdgeLedger {
    const edgeMap = new Map<string, WorkbenchMemoryGraphEdge>();
    return {
        append(edge: MemoryGraphEdgeLedgerInput): void {
            if (!edge.source || !edge.target || edge.source === edge.target) {
                return;
            }
            const confidence = clamp(Number(edge.confidence ?? 0.7), 0.12, 1);
            const next: WorkbenchMemoryGraphEdge = {
                id: edge.id,
                source: edge.source,
                target: edge.target,
                relationType: edge.relationType,
                label: edge.label,
                semanticLabel: edge.semanticLabel || edge.label,
                debugSummary: edge.debugSummary,
                confidence,
                weight: confidence,
                strengthLevel: confidence >= 0.78 ? 'strong' : confidence >= 0.48 ? 'normal' : 'weak',
                status: edge.status ?? 'active',
                visibleInModes: edge.visibleInModes ?? ['semantic', 'debug'],
                sourceKinds: dedupeStrings(edge.sourceKinds ?? []),
                sourceRefs: dedupeStrings(edge.sourceRefs ?? []),
                sourceBatchIds: dedupeStrings(edge.sourceBatchIds ?? []),
                reasonCodes: dedupeStrings(edge.reasonCodes ?? []),
                sections: edge.sections ?? [],
                rawData: edge.rawData ?? {},
            };
            const existing = edgeMap.get(next.id);
            if (!existing) {
                edgeMap.set(next.id, next);
                return;
            }
            edgeMap.set(next.id, {
                ...existing,
                label: existing.label || next.label,
                semanticLabel: existing.semanticLabel || next.semanticLabel,
                debugSummary: [existing.debugSummary, next.debugSummary].filter(Boolean).join(' | ') || undefined,
                confidence: Math.max(existing.confidence, next.confidence),
                weight: Math.max(existing.weight, next.weight),
                strengthLevel: resolveStrengthLevel(Math.max(existing.confidence, next.confidence)),
                sourceKinds: dedupeStrings([...existing.sourceKinds, ...next.sourceKinds]),
                sourceRefs: dedupeStrings([...existing.sourceRefs, ...next.sourceRefs]),
                sourceBatchIds: dedupeStrings([...existing.sourceBatchIds, ...next.sourceBatchIds]),
                reasonCodes: dedupeStrings([...existing.reasonCodes, ...next.reasonCodes]),
                visibleInModes: dedupeModes([...existing.visibleInModes, ...next.visibleInModes]),
                sections: [...existing.sections, ...next.sections],
                rawData: { ...existing.rawData, ...next.rawData },
            });
        },
        toEdges(): WorkbenchMemoryGraphEdge[] {
            return [...edgeMap.values()];
        },
    };
}

/**
 * 功能：按置信度解析边强度。
 * @param confidence 置信度。
 * @returns 强度等级。
 */
function resolveStrengthLevel(confidence: number): WorkbenchMemoryGraphEdge['strengthLevel'] {
    if (confidence >= 0.78) {
        return 'strong';
    }
    if (confidence >= 0.48) {
        return 'normal';
    }
    return 'weak';
}

/**
 * 功能：限制数值范围。
 * @param value 原始值。
 * @param min 最小值。
 * @param max 最大值。
 * @returns 裁剪后的数值。
 */
function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

/**
 * 功能：对字符串数组做去重。
 * @param values 原始数组。
 * @returns 去重结果。
 */
function dedupeStrings(values: string[]): string[] {
    return [...new Set(values.map((item: string): string => String(item ?? '').trim()).filter(Boolean))];
}

/**
 * 功能：对模式数组做去重。
 * @param values 原始数组。
 * @returns 去重后的模式数组。
 */
function dedupeModes(values: MemoryGraphMode[]): MemoryGraphMode[] {
    return [...new Set(values)];
}
