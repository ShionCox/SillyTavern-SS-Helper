import type { SourceRef } from '../../../SDK/stx';

/**
 * 功能：转义 HTML 文本。
 * @param input 原始输入。
 * @returns 安全文本。
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
 * 功能：解析宽松值。
 * @param value 输入文本。
 * @returns 解析后的值。
 */
export function parseLooseValue(value: string): unknown {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;
    if (!Number.isNaN(Number(trimmed))) return Number(trimmed);
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
            return JSON.parse(trimmed);
        } catch {
            return trimmed;
        }
    }
    return trimmed;
}

/**
 * 功能：标准化查找键。
 * @param value 原始值。
 * @returns 标准化文本。
 */
export function normalizeLookup(value: unknown): string {
    return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * 功能：格式化时间标签。
 * @param value 时间戳值。
 * @param emptyLabel 空值文案。
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
 * 功能：格式化来源类型标签。
 * @param kind 来源类型。
 * @returns 展示标签。
 */
export function formatSourceKindLabel(kind: SourceRef['kind']): string {
    if (kind === 'semantic_seed') return '初始化设定';
    if (kind === 'group_memory') return '群聊记忆';
    if (kind === 'summary') return '摘要';
    if (kind === 'manual') return '手动整理';
    return '统一条目';
}

/**
 * 功能：标准化来源引用对象。
 * @param ref 原始对象。
 * @returns 来源对象。
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
 * 功能：格式化来源元信息。
 * @param sourceRef 来源对象。
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
    return parts.join(' | ');
}
