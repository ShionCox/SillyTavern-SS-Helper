/**
 * 功能：统一定义读侧消费的公共语义投影。
 */

export type MemorySemanticKind = 'event' | 'state' | 'task_progress';
export type MemoryVisibilityScope = 'global_shared' | 'scene_shared' | 'actor_visible' | 'internal_only';

export interface MemorySemanticProjection {
    semanticKind: MemorySemanticKind;
    visibilityScope: MemoryVisibilityScope;
    isCharacterVisible: boolean;
    isOngoing?: boolean;
    currentState?: string;
    finalOutcome?: string;
    goalOrObjective?: string;
    sourceEntryType: string;
}

interface SemanticProjectionInput {
    entryType?: unknown;
    ongoing?: unknown;
    detailPayload?: unknown;
}

/**
 * 功能：把多种事件/状态/任务类条目投影为统一公共语义。
 * @param input 语义投影输入。
 * @returns 统一语义；非目标类型返回 undefined。
 */
export function projectMemorySemanticRecord(input: SemanticProjectionInput): MemorySemanticProjection | undefined {
    const sourceEntryType = normalizeText(input.entryType);
    const semanticKind = resolveSemanticKind(sourceEntryType);
    const visibilityScope = resolveVisibilityScope(sourceEntryType);
    if (!semanticKind || !visibilityScope) {
        return undefined;
    }
    const payload = toRecord(input.detailPayload);
    const fields = toRecord(payload.fields);
    const projection: MemorySemanticProjection = {
        semanticKind,
        visibilityScope,
        isCharacterVisible: visibilityScope !== 'internal_only',
        sourceEntryType,
    };
    if (input.ongoing !== undefined) {
        projection.isOngoing = Boolean(input.ongoing);
    }
    const currentState = firstMeaningfulText(
        fields.state,
        fields.status,
        fields.lifecycle,
        payload.state,
        payload.status,
    );
    if (currentState) {
        projection.currentState = currentState;
    }
    const finalOutcome = firstMeaningfulText(
        fields.outcome,
        fields.result,
        payload.outcome,
        payload.result,
        fields.resolution,
        payload.resolution,
    );
    if (finalOutcome) {
        projection.finalOutcome = finalOutcome;
    }
    const goalOrObjective = firstMeaningfulText(
        fields.objective,
        payload.objective,
        fields.goal,
        payload.goal,
    );
    if (goalOrObjective) {
        projection.goalOrObjective = goalOrObjective;
    }
    return projection;
}

/**
 * 功能：为提示词/UI 生成简短的公共语义标签。
 * @param semantic 公共语义投影。
 * @returns 紧凑标签文本。
 */
export function buildMemorySemanticTag(semantic?: MemorySemanticProjection): string {
    if (!semantic) {
        return '';
    }
    const parts: string[] = [
        `语义：${resolveSemanticKindLabel(semantic.semanticKind)}`,
        `可见：${resolveVisibilityScopeLabel(semantic.visibilityScope)}`,
    ];
    if (semantic.isOngoing !== undefined) {
        parts.push(`进行中：${semantic.isOngoing ? '是' : '否'}`);
    }
    if (semantic.currentState) {
        parts.push(`状态：${semantic.currentState}`);
    }
    if (semantic.finalOutcome) {
        parts.push(`结果：${semantic.finalOutcome}`);
    }
    if (semantic.goalOrObjective) {
        parts.push(`目标：${semantic.goalOrObjective}`);
    }
    return `[${parts.join('｜')}]`;
}

/**
 * 功能：解析语义类型中文标签。
 * @param kind 语义类型。
 * @returns 中文标签。
 */
export function resolveSemanticKindLabel(kind: MemorySemanticKind): string {
    switch (kind) {
        case 'state': return '状态';
        case 'task_progress': return '任务推进';
        default: return '事件';
    }
}

/**
 * 功能：解析可见级别中文标签。
 * @param scope 可见级别。
 * @returns 中文标签。
 */
export function resolveVisibilityScopeLabel(scope: MemoryVisibilityScope): string {
    switch (scope) {
        case 'global_shared': return '全局共享';
        case 'scene_shared': return '场景共享';
        case 'internal_only': return '内部可见';
        default: return '角色可见';
    }
}

function resolveSemanticKind(entryType: string): MemorySemanticKind | undefined {
    switch (entryType) {
        case 'event':
        case 'actor_visible_event':
            return 'event';
        case 'world_global_state':
        case 'scene_shared_state':
            return 'state';
        case 'task':
            return 'task_progress';
        default:
            return undefined;
    }
}

function resolveVisibilityScope(entryType: string): MemoryVisibilityScope | undefined {
    switch (entryType) {
        case 'world_global_state':
            return 'global_shared';
        case 'scene_shared_state':
            return 'scene_shared';
        case 'event':
        case 'actor_visible_event':
        case 'task':
            return 'actor_visible';
        default:
            return undefined;
    }
}

function firstMeaningfulText(...values: unknown[]): string {
    for (const value of values) {
        const normalized = normalizeText(value);
        if (normalized) {
            return normalized;
        }
    }
    return '';
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function normalizeText(value: unknown): string {
    return String(value ?? '').trim();
}
