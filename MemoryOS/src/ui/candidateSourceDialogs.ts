import { openSharedDialog } from '../../../_Components/sharedDialog';
import { formatSourceRefMeta, normalizeSourceRefRecord, escapeHtml } from './editorShared';

interface DetailDialogOptions {
    dialogId: string;
    title: string;
    content: string;
    description?: string;
}

/**
 * 功能：打开设置页使用的明细对话框。
 * @param options 对话框参数。
 * @returns 无返回值。
 */
export function showEditorDetailDialog(options: DetailDialogOptions): void {
    openSharedDialog({
        id: options.dialogId,
        size: 'lg',
        ariaLabel: options.title,
        chrome: {
            title: options.title,
            description: options.description || '这里展示当前条目的来源详情或候选内容。',
        },
        bodyHtml: `<pre style="margin:0; white-space:pre-wrap; word-break:break-word; font-family:Consolas, 'Courier New', monospace; font-size:12px; line-height:1.6; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 12px;">${escapeHtml(options.content)}</pre>`,
        closeOnBackdrop: true,
        closeOnEscape: true,
    });
}

/**
 * 功能：展示快照来源详情。
 * @param payload 编码后的来源详情。
 * @param dialogIdPrefix 对话框 ID 前缀。
 * @returns 无返回值。
 */
export function showSnapshotSourceDetails(payload: string, dialogIdPrefix: string): void {
    if (!payload) {
        alert('当前条目没有可用的来源详情。');
        return;
    }
    try {
        const parsed = JSON.parse(decodeURIComponent(payload)) as {
            value?: string;
            confidence?: number;
            updatedAt?: number | null;
            sourceKinds?: string[];
            sourceRefs?: Array<Record<string, unknown>>;
        };
        const lines: string[] = [];
        if (parsed.value) {
            lines.push(`当前值: ${String(parsed.value)}`);
        }
        if (typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)) {
            lines.push(`置信度: ${Math.round(parsed.confidence * 100)}%`);
        }
        if (typeof parsed.updatedAt === 'number' && Number.isFinite(parsed.updatedAt) && parsed.updatedAt > 0) {
            lines.push(`更新时间: ${new Date(parsed.updatedAt).toLocaleString()}`);
        }
        if (Array.isArray(parsed.sourceKinds) && parsed.sourceKinds.length > 0) {
            lines.push(`来源类型: ${parsed.sourceKinds.join(' / ')}`);
        }
        if (Array.isArray(parsed.sourceRefs) && parsed.sourceRefs.length > 0) {
            lines.push('来源记录:');
            parsed.sourceRefs.slice(0, 6).forEach((ref, index): void => {
                const normalizedRef = normalizeSourceRefRecord(ref);
                if (!normalizedRef) {
                    return;
                }
                lines.push(`${index + 1}. ${formatSourceRefMeta(normalizedRef)}`);
                if (normalizedRef.note) {
                    lines.push(`   说明: ${normalizedRef.note}`);
                }
            });
        }
        showEditorDetailDialog({
            dialogId: `${dialogIdPrefix}-detail-dialog`,
            title: '来源详情',
            content: lines.join('\n') || '当前条目没有可用的来源详情。',
        });
    } catch {
        alert('来源详情解析失败。');
    }
}

