import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import { escapeHtml } from './editorShared';

interface SettingsMutationHistoryPanelOptions {
    ids: MemoryOSSettingsIds;
    refreshExperiencePanels: () => Promise<void>;
    refreshTemplatePanelState: () => Promise<void>;
}

/**
 * 功能：绑定设置页中的长期记忆变更历史面板。
 * @param options 绑定所需依赖。
 * @returns void。
 */
export function bindSettingsMutationHistoryPanel(options: SettingsMutationHistoryPanelOptions): void {
    /**
     * 功能：渲染设置页里的长期记忆变更历史列表。
     * @returns void。
     */
    const renderMutationHistoryList = async (): Promise<void> => {
        const listEl = document.getElementById(options.ids.mutationHistoryListId);
        if (!listEl) {
            return;
        }
        const memory = (window as any).STX?.memory;
        if (!memory?.chatState?.getMutationHistory) {
            listEl.textContent = 'Memory OS 尚未就绪。';
            return;
        }
        listEl.textContent = '加载中...';
        try {
            const records = await memory.chatState.getMutationHistory({ limit: 50 });
            if (records.length === 0) {
                listEl.textContent = '暂无长期记忆变更历史。';
                return;
            }
            listEl.innerHTML = '';
            for (const record of records) {
                const time = new Date(record.ts).toLocaleString();
                const row = document.createElement('div');
                row.className = 'stx-ui-audit-row';
                row.innerHTML = `
                    <span class="stx-ui-audit-main">
                        <b class="stx-ui-audit-action">[${escapeHtml(record.action)}]</b>
                        <span class="stx-ui-audit-time">${escapeHtml(time)}</span>
                        <span>${escapeHtml(record.targetKind)}</span>
                        <span>${escapeHtml(record.title)}</span>
                        <span>${escapeHtml(record.source)}</span>
                    </span>
                    <span class="stx-ui-audit-note">${escapeHtml(record.targetRecordKey ?? '')}</span>
                `;
                listEl.appendChild(row);
            }
        } catch (error) {
            listEl.textContent = `加载失败: ${String(error)}`;
        }
    };

    const refreshBtn = document.getElementById(options.ids.mutationHistoryRefreshBtnId);
    if (refreshBtn) {
        refreshBtn.addEventListener('click', (): void => {
            void renderMutationHistoryList();
            void options.refreshExperiencePanels();
        });
    }

    const auditTabBtn = document.getElementById(options.ids.tabDbId);
    if (auditTabBtn) {
        auditTabBtn.addEventListener('click', (): void => {
            void renderMutationHistoryList();
            void options.refreshExperiencePanels();
            void options.refreshTemplatePanelState();
        });
    }

    void renderMutationHistoryList();
}
