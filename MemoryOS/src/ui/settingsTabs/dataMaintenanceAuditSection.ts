import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { escapeHtml } from '../editorShared';

interface DataMaintenanceAuditSectionOptions {
    ids: MemoryOSSettingsIds;
}

/**
 * 功能：绑定数据维护页中的审计区块。
 * @param options 绑定参数。
 * @returns 返回审计区块刷新函数。
 */
export function bindDataMaintenanceAuditSection(
    options: DataMaintenanceAuditSectionOptions,
): { refreshAuditList: () => Promise<void> } {
    /**
     * 功能：刷新审计列表。
     * @returns 无返回值。
     */
    const refreshAuditList = async (): Promise<void> => {
        const listEl = document.getElementById(options.ids.auditListId);
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    audit?: {
                        list?: (options: { limit: number }) => Promise<Array<{
                            auditId: string;
                            action: string;
                            ts: number;
                            after?: { note?: string };
                        }>>;
                    };
                };
            };
        }).STX?.memory;
        if (!listEl) {
            return;
        }
        if (!memory?.audit?.list) {
            listEl.textContent = 'Memory OS 尚未就绪。';
            return;
        }
        listEl.textContent = '加载中...';
        try {
            const records = await memory.audit.list({ limit: 50 });
            if (records.length === 0) {
                listEl.textContent = '暂无审计记录。';
                return;
            }
            listEl.innerHTML = records.map((record) => `
              <div class="stx-ui-audit-row">
                <span class="stx-ui-audit-main">
                  <b class="stx-ui-audit-action${record.action === 'snapshot' ? ' is-snapshot' : ''}">[${escapeHtml(record.action)}]</b>
                  <span class="stx-ui-audit-time">${escapeHtml(new Date(record.ts).toLocaleString())}</span>
                  <span>${escapeHtml(String(record.after?.note || ''))}</span>
                </span>
              </div>
            `).join('');
        } catch (error) {
            listEl.textContent = `加载失败：${String(error)}`;
        }
    };

    document.getElementById(options.ids.auditRefreshBtnId)?.addEventListener('click', (): void => {
        void refreshAuditList();
    });

    document.getElementById(options.ids.auditCreateSnapshotBtnId)?.addEventListener('click', async (): Promise<void> => {
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    audit?: {
                        createSnapshot?: (note?: string) => Promise<string>;
                    };
                };
            };
        }).STX?.memory;
        if (!memory?.audit?.createSnapshot) {
            alert('Memory OS 尚未就绪。');
            return;
        }
        const note = prompt('为这个快照添加备注（可留空）：') ?? undefined;
        try {
            const snapshotId = await memory.audit.createSnapshot(note);
            alert(`快照已创建。\nID: ${snapshotId}`);
            await refreshAuditList();
        } catch (error) {
            alert(`创建快照失败：${String(error)}`);
        }
    });

    document.getElementById(options.ids.tabDbId)?.addEventListener('click', (): void => {
        void refreshAuditList();
    });

    return {
        refreshAuditList,
    };
}
