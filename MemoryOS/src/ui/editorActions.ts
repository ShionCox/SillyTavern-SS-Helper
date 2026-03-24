import type { RecordEditorOpenOptions } from './recordEditor/types';

interface EditorActionToastLike {
    success(message: string): void;
    info(message: string): void;
}

export interface EditorActionExecutorOptions {
    dialogIdPrefix: string;
    formatCandidateKindLabel: (kind: string) => string;
    openRecordEditor: (options?: RecordEditorOpenOptions) => void | Promise<void>;
    openDiagnostics: () => void | Promise<void>;
    refreshExperiencePanels: () => Promise<void>;
    toast: EditorActionToastLike;
}

/**
 * 功能：创建 settings 页面使用的记录编辑器动作执行器。
 * @param options 依赖项。
 * @returns 动作执行函数。
 */
export function createEditorActionExecutor(options: EditorActionExecutorOptions): (action: string, triggerButton?: HTMLElement | null) => Promise<void> {
    const showHiddenRowsEntry = async (): Promise<void> => {
        await options.openDiagnostics();
        options.toast.info('已打开系统诊断，可继续查看隐藏项、别名、重定向和候选修复状态。');
    };

    return async (action: string, triggerButton?: HTMLElement | null): Promise<void> => {
        const memory = (window as Window & { STX?: { memory?: unknown } }).STX?.memory as unknown as {
            editor?: {
                refreshSemanticSeed?: () => Promise<unknown>;
                rebuildChatView?: () => Promise<unknown>;
                refreshCanonSnapshot?: () => Promise<unknown>;
            };
        } | undefined;
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
                await options.openDiagnostics();
                options.toast.info('已打开系统诊断，可继续查看当前主链来源和修复建议。');
                return;
            }
            if (action === 'view-hidden-rows') {
                await showHiddenRowsEntry();
                return;
            }
            if (action === 'open-record-editor') {
                await options.openRecordEditor();
                return;
            }
            if (action === 'open-diagnostics') {
                await options.openDiagnostics();
            }
        } catch (error) {
            alert(`操作失败：${String(error)}`);
        } finally {
            triggerButton?.removeAttribute('disabled');
        }
    };
}
