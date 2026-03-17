import { openSharedDialog } from '../../../_Components/sharedDialog';
import type { EditorHealthSnapshot, MemoryCandidate, MemoryCandidateBufferSnapshot } from '../../../SDK/stx';
import { formatSourceRefMeta, normalizeSourceRefRecord, escapeHtml } from './editorShared';

interface DetailDialogOptions {
    dialogId: string;
    title: string;
    content: string;
    description?: string;
}

interface ShowCandidateSourcesOptions {
    dialogIdPrefix: string;
    formatCandidateKindLabel: (kind: string) => string;
    filterKind?: 'fact' | 'summary' | 'state' | 'relationship';
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

/**
 * 功能：展示当前聊天的候选来源入口说明。
 * @param options 展示参数。
 * @returns Promise<void>
 */
export async function showCandidateSources(options: ShowCandidateSourcesOptions): Promise<void> {
    const memory = (window as any).STX?.memory;
    if (!memory?.editor?.getEditorHealth || !memory?.chatState?.getCandidateBufferSnapshot) {
        alert('当前版本未提供候选来源诊断。');
        return;
    }
    const [health, snapshot] = await Promise.all([
        memory.editor.getEditorHealth() as Promise<EditorHealthSnapshot>,
        memory.chatState.getCandidateBufferSnapshot() as Promise<MemoryCandidateBufferSnapshot>,
    ]);
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const filteredItems = options.filterKind ? items.filter((item: MemoryCandidate): boolean => item.kind === options.filterKind) : items;
    const lines = filteredItems.slice(0, 8).map((item: MemoryCandidate, index: number): string => {
        const targetLayer = String(item.encoding?.targetLayer ?? 'unknown');
        const accepted = item.encoding?.accepted ? 'accepted' : 'rejected';
        return `${index + 1}. [${options.formatCandidateKindLabel(item.kind)} / ${accepted} / ${targetLayer}] ${String(item.summary ?? '').trim() || '(无摘要)'}`;
    });
    showEditorDetailDialog({
        dialogId: `${options.dialogIdPrefix}-detail-dialog`,
        title: options.filterKind === 'state' ? 'world_state 候选' : '候选来源',
        content: [
            options.filterKind === 'state' ? 'world_state 候选：' : '候选来源分布：',
            `facts: ${health.dataLayers.factsCount}`,
            `world_state: ${health.dataLayers.worldStateCount}`,
            `summary: ${health.dataLayers.summaryCount}`,
            `semantic seed: ${health.dataLayers.hasSemanticSeed ? '已存在' : '缺失'}`,
            `group memory: ${health.dataLayers.hasGroupMemory ? '已存在' : '缺失'}`,
            `logical chat view: ${health.dataLayers.hasLogicalChatView ? '已存在' : '缺失'}`,
            `candidate buffer: total=${snapshot.total}, accepted=${snapshot.accepted}, rejected=${snapshot.rejected}`,
            '',
            ...(lines.length > 0 ? lines : [options.filterKind === 'state' ? '当前没有 world_state 候选，可先刷新总览或检查 state 层写入。' : '当前没有候选缓冲区条目。']),
            '',
            '建议优先检查：semantic seed、world_state、group memory，以及被 redirect / tombstone 隐藏的逻辑行。',
        ].join('\n'),
    });
}
