import type { SourceRef } from '../../../SDK/stx';

/**
 * 功能：转义 HTML，避免动态文本直接插入页面。
 * @param input 原始文本。
 * @returns 转义后的安全文本。
 */
export function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：尝试把输入文本解析为 JSON、数字或布尔值。
 * @param value 输入文本。
 * @returns 解析后的值。
 */
export function parseLooseValue(value: string): unknown {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed === 'true') {
        return true;
    }
    if (trimmed === 'false') {
        return false;
    }
    if (trimmed === 'null') {
        return null;
    }
    if (!Number.isNaN(Number(trimmed))) {
        return Number(trimmed);
    }
    if (
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
        || (trimmed.startsWith('[') && trimmed.endsWith(']'))
        || (trimmed.startsWith('"') && trimmed.endsWith('"'))
    ) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

/**
 * 功能：把任意值归一化为便于查找/比对的键。
 * @param value 原始值。
 * @returns 归一化后的查找键。
 */
export function normalizeLookup(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 功能：格式化时间戳展示。
 * @param value 原始时间值。
 * @param emptyLabel 空值时的兜底文本。
 * @returns 展示文本。
 */
export function formatTimeLabel(value: unknown, emptyLabel: string = '暂无'): string {
    const timestamp = Number(value ?? 0);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return emptyLabel;
    }
    return new Date(timestamp).toLocaleString();
}

/**
 * 功能：把来源类型转换为中文标签。
 * @param kind 来源类型。
 * @returns 中文标签。
 */
export function formatSourceKindLabel(kind: SourceRef['kind']): string {
    if (kind === 'fact') {
        return '事实层';
    }
    if (kind === 'world_state') {
        return '世界状态';
    }
    if (kind === 'semantic_seed') {
        return '初始设定';
    }
    if (kind === 'group_memory') {
        return '群聊记忆';
    }
    if (kind === 'summary') {
        return '摘要';
    }
    if (kind === 'manual') {
        return '手动整理';
    }
    return '系统推导';
}

/**
 * 功能：把来源引用整理成统一结构。
 * @param ref 原始来源对象。
 * @returns 规范化后的来源；无法识别时返回 null。
 */
export function normalizeSourceRefRecord(ref: Record<string, unknown>): SourceRef | null {
    const kind = String(ref.kind ?? '').trim();
    if (!kind) {
        return null;
    }
    const label = String(ref.label ?? '').trim() || '未命名来源';
    const recordId = String(ref.recordId ?? '').trim() || undefined;
    const path = String(ref.path ?? '').trim() || undefined;
    const note = String(ref.note ?? '').trim() || undefined;
    const tsValue = Number(ref.ts ?? 0);
    return {
        kind: kind as SourceRef['kind'],
        label,
        recordId,
        path,
        note,
        ts: Number.isFinite(tsValue) && tsValue > 0 ? tsValue : undefined,
    };
}

/**
 * 功能：格式化来源引用的元信息文本。
 * @param sourceRef 来源引用。
 * @returns 展示文本。
 */
export function formatSourceRefMeta(sourceRef: SourceRef): string {
    const parts: string[] = [formatSourceKindLabel(sourceRef.kind), String(sourceRef.label ?? '').trim() || '未命名来源'];
    if (sourceRef.recordId) {
        parts.push(`记录 ${sourceRef.recordId}`);
    }
    if (sourceRef.path) {
        parts.push(`路径 ${sourceRef.path}`);
    }
    if (sourceRef.ts) {
        parts.push(`时间 ${formatTimeLabel(sourceRef.ts)}`);
    }
    return parts.join(' · ');
}
