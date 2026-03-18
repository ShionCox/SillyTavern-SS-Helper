import type { EditorHealthSnapshot } from '../../../SDK/stx';

interface EditorActionToastLike {
    success(message: string): void;
    info(message: string): void;
}

export interface EditorActionExecutorOptions {
    dialogIdPrefix: string;
    formatCandidateKindLabel: (kind: string) => string;
    openRecordEditor: () => void;
    openDiagnostics: () => void;
    refreshExperiencePanels: () => Promise<void>;
    toast: EditorActionToastLike;
}

/**
 * 功能：创建 settings 页使用的编辑器动作执行器。
 * @param options 依赖项。
 * @returns 动作执行函数。
 */
export function createEditorActionExecutor(options: EditorActionExecutorOptions): (action: string, triggerButton?: HTMLElement | null) => Promise<void> {
    const showHiddenRowsEntry = async (): Promise<void> => {
        const memory = (window as any).STX?.memory;
        if (!memory?.editor?.getEditorHealth) {
            options.openRecordEditor();
            return;
        }
        const health = await memory.editor.getEditorHealth() as EditorHealthSnapshot;
        options.openRecordEditor();
        options.toast.info(`已打开记录编辑器，可进一步查看 alias ${health.dataLayers.aliasCount} / redirect ${health.dataLayers.redirectCount} / tombstone ${health.dataLayers.tombstoneCount}。`);
    };

    return async (action: string, triggerButton?: HTMLElement | null): Promise<void> => {
        const memory = (window as any).STX?.memory;
        if (!memory) {
            alert('Memory OS 尚未就绪。');
            return;
        }
        triggerButton?.setAttribute('disabled', 'true');
        try {
            if (action === 'refresh-seed') {
                if (!memory.editor?.refreshSemanticSeed) {
                    alert('当前版本未提供 semantic seed 刷新入口。');
                    return;
                }
                await memory.editor.refreshSemanticSeed();
                await options.refreshExperiencePanels();
                options.toast.success('semantic seed 已刷新');
                return;
            }
            if (action === 'rebuild-chat-view') {
                if (!memory.editor?.rebuildChatView) {
                    alert('当前版本未提供 logical chat view 重建入口。');
                    return;
                }
                await memory.editor.rebuildChatView();
                await options.refreshExperiencePanels();
                options.toast.success('logical chat view 已重建');
                return;
            }
            if (action === 'refresh-canon') {
                if (!memory.editor?.refreshCanonSnapshot) {
                    alert('当前版本未提供总览快照刷新入口。');
                    return;
                }
                await memory.editor.refreshCanonSnapshot();
                await options.refreshExperiencePanels();
                options.toast.success('总览快照已刷新');
                return;
            }
            if (action === 'review-structured-sources') {
                options.openRecordEditor();
                options.toast.info('已打开记录编辑器，请从逻辑维护与诊断页查看当前主链来源。');
                return;
            }
            if (action === 'view-hidden-rows') {
                await showHiddenRowsEntry();
                return;
            }
            if (action === 'open-record-editor') {
                options.openRecordEditor();
                return;
            }
            if (action === 'open-diagnostics') {
                options.openDiagnostics();
            }
        } catch (error) {
            alert('操作失败：' + String(error));
        } finally {
            triggerButton?.removeAttribute('disabled');
        }
    };
}
