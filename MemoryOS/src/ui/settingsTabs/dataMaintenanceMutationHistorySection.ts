import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { escapeHtml } from '../editorShared';

interface DataMaintenanceMutationHistorySectionOptions {
    ids: MemoryOSSettingsIds;
}

/**
 * 功能：绑定数据维护页中的变更历史区块。
 * @param options 绑定参数。
 * @returns 返回历史区块刷新函数。
 */
export function bindDataMaintenanceMutationHistorySection(
    options: DataMaintenanceMutationHistorySectionOptions,
): { refreshMutationHistoryList: () => Promise<void> } {
    /**
     * 功能：刷新变更历史列表。
     * @returns 无返回值。
     */
    const refreshMutationHistoryList = async (): Promise<void> => {
        const listEl = document.getElementById(options.ids.mutationHistoryListId);
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    chatState?: {
                        getMutationHistory?: (options: { limit: number }) => Promise<Array<{
                            ts: number;
                            action: string;
                            targetKind: string;
                            title: string;
                            source: string;
                            targetRecordKey?: string;
                        }>>;
                    };
                };
            };
        }).STX?.memory;
        if (!listEl) {
            return;
        }
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
            listEl.innerHTML = records.map((record) => `
              <div class="stx-ui-audit-row">
                <span class="stx-ui-audit-main">
                  <b class="stx-ui-audit-action">[${escapeHtml(record.action)}]</b>
                  <span class="stx-ui-audit-time">${escapeHtml(new Date(record.ts).toLocaleString())}</span>
                  <span>${escapeHtml(record.targetKind)}</span>
                  <span>${escapeHtml(record.title)}</span>
                  <span>${escapeHtml(record.source)}</span>
                </span>
                <span class="stx-ui-audit-note">${escapeHtml(record.targetRecordKey ?? '')}</span>
              </div>
            `).join('');
        } catch (error) {
            listEl.textContent = `加载失败：${String(error)}`;
        }
    };

    document.getElementById(options.ids.mutationHistoryRefreshBtnId)?.addEventListener('click', (): void => {
        void refreshMutationHistoryList();
    });

    document.getElementById(options.ids.tabDbId)?.addEventListener('click', (): void => {
        void refreshMutationHistoryList();
    });

    return {
        refreshMutationHistoryList,
    };
}
