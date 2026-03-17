import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import { escapeHtml } from './editorShared';

interface SettingsAuditPanelOptions {
    ids: MemoryOSSettingsIds;
    refreshExperiencePanels: () => Promise<void>;
    refreshTemplatePanelState: () => Promise<void>;
}

/**
 * 功能：绑定设置页中的审计历史与快照回滚面板。
 * @param options 绑定所需依赖。
 * @returns 无返回值。
 */
export function bindSettingsAuditPanel(options: SettingsAuditPanelOptions): void {
    const renderAuditList = async (): Promise<void> => {
        const listEl = document.getElementById(options.ids.auditListId);
        if (!listEl) return;
        const memory = (window as any).STX?.memory;
        if (!memory?.audit) {
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
            listEl.innerHTML = '';
            for (const record of records) {
                const isSnapshot = record.action === 'snapshot';
                const time = new Date(record.ts).toLocaleString();
                const note = String(record.after?.note ?? '').trim();
                const row = document.createElement('div');
                row.className = 'stx-ui-audit-row';
                row.innerHTML = `
                    <span class="stx-ui-audit-main">
                        <b class="stx-ui-audit-action${isSnapshot ? ' is-snapshot' : ''}">[${escapeHtml(record.action)}]</b>
                        <span class="stx-ui-audit-time">${escapeHtml(time)}</span>
                        <span>${note ? `— ${escapeHtml(note)}` : ''}</span>
                    </span>
                    ${isSnapshot ? `<button class="stx-ui-audit-rollback" data-snapshot-id="${escapeHtml(record.auditId)}" data-tip="回滚到这个快照。">回滚</button>` : ''}
                `;
                if (isSnapshot) {
                    const rollbackBtn = row.querySelector<HTMLButtonElement>(`[data-snapshot-id="${record.auditId}"]`);
                    rollbackBtn?.addEventListener('click', async (): Promise<void> => {
                        if (!confirm(`确定回滚到快照 [${time}] 的状态吗？\n当前 facts/state/summaries 将被覆盖！`)) return;
                        rollbackBtn.disabled = true;
                        rollbackBtn.textContent = '回滚中...';
                        try {
                            await memory.audit.rollbackToSnapshot(record.auditId);
                            alert(`✅ 已成功回滚到 [${time}] 的状态。`);
                            await renderAuditList();
                        } catch (error) {
                            alert('回滚失败：' + String(error));
                            rollbackBtn.disabled = false;
                            rollbackBtn.textContent = '回滚';
                        }
                    });
                }
                listEl.appendChild(row);
            }
        } catch (error) {
            listEl.textContent = '加载失败：' + String(error);
        }
    };

    const createAuditSnapshot = async (triggerButton: HTMLElement | null): Promise<void> => {
        const memory = (window as any).STX?.memory;
        if (!memory?.audit) {
            alert('Memory OS 尚未就绪。');
            return;
        }
        const note = prompt('为这个快照添加备注（可留空）：') ?? undefined;
        triggerButton?.setAttribute('disabled', 'true');
        try {
            const snapshotId = await memory.audit.createSnapshot(note);
            alert(`✅ 快照已创建！\nID: ${snapshotId}`);
            await renderAuditList();
            await options.refreshExperiencePanels();
        } catch (error) {
            alert('创建快照失败：' + String(error));
        } finally {
            triggerButton?.removeAttribute('disabled');
        }
    };

    const auditSnapshotBtn = document.getElementById(options.ids.auditCreateSnapshotBtnId);
    if (auditSnapshotBtn) {
        auditSnapshotBtn.addEventListener('click', async (): Promise<void> => {
            await createAuditSnapshot(auditSnapshotBtn as HTMLElement);
        });
    }

    const auditRefreshBtn = document.getElementById(options.ids.auditRefreshBtnId);
    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', (): void => {
            void renderAuditList();
        });
    }

    const auditTabBtn = document.getElementById(options.ids.tabDbId);
    if (auditTabBtn) {
        auditTabBtn.addEventListener('click', (): void => {
            void renderAuditList();
            void options.refreshTemplatePanelState();
        });
    }
}
