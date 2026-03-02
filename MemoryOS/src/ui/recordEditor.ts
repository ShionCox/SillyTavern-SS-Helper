import type { DBAudit, DBEvent, DBFact, DBSummary, DBWorldState } from '../db/db';

type TableName = 'events' | 'facts' | 'summaries' | 'world_state' | 'audit';

const TABLES: { key: TableName; label: string }[] = [
    { key: 'events', label: 'events' },
    { key: 'facts', label: 'facts' },
    { key: 'summaries', label: 'summaries' },
    { key: 'world_state', label: 'world_state' },
    { key: 'audit', label: 'audit' },
];

const PRIMARY_KEY: Record<TableName, string> = {
    events: 'eventId',
    facts: 'factKey',
    summaries: 'summaryId',
    world_state: 'stateKey',
    audit: 'auditId',
};

function summarize(data: unknown, maxLen = 80): string {
    let text = '';
    if (typeof data === 'string') {
        text = data;
    } else {
        try {
            text = JSON.stringify(data);
        } catch {
            text = String(data);
        }
    }
    return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

function formatTs(ts?: number): string {
    if (!ts || Number.isNaN(ts)) return '-';
    return new Date(ts).toLocaleString();
}

function escapeHtml(text: unknown): string {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function encodeEditValue(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value ?? '');
    }
}

function decodeEditValue(raw: string, previousValue: unknown): unknown {
    if (typeof previousValue === 'string') return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

export async function openRecordEditor() {
    const existing = document.querySelector('.stx-record-editor-overlay');
    if (existing) {
        existing.remove();
    }

    const overlay = document.createElement('div');
    overlay.className = 'stx-record-editor-overlay';

    const panel = document.createElement('div');
    panel.className = 'stx-record-editor';

    panel.innerHTML = `
      <div class="stx-re-header">
        <h3><i class="fa-solid fa-pen-to-square"></i>&nbsp;MemoryOS 记录编辑器</h3>
        <button type="button" class="stx-ui-btn secondary stx-re-close"><i class="fa-solid fa-xmark"></i>&nbsp;关闭</button>
      </div>
      <div class="stx-re-tabs"></div>
      <div class="stx-re-table"></div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const tabBar = panel.querySelector('.stx-re-tabs') as HTMLDivElement;
    const tableWrap = panel.querySelector('.stx-re-table') as HTMLDivElement;

    let activeTable: TableName = 'events';

    const close = () => overlay.remove();

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
    });

    panel.querySelector('.stx-re-close')?.addEventListener('click', close);

    document.addEventListener('keydown', function onEsc(e) {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', onEsc);
        }
    });

    const { db } = await import('../db/db');

    const renderRows = async (tableName: TableName) => {
        tableWrap.innerHTML = '<div class="stx-re-empty">加载中...</div>';
        const rows = await db[tableName].toArray();

        if (!rows.length) {
            tableWrap.innerHTML = `<div class="stx-re-empty">${tableName} 暂无记录。</div>`;
            return;
        }

        const container = document.createElement('div');
        container.className = 'stx-re-list';

        rows.forEach((record) => {
            const row = document.createElement('div');
            row.className = 'stx-re-row';

            const pkField = PRIMARY_KEY[tableName] as string;
            const pk = (record as any)[pkField];

            const buildContent = () => {
                switch (tableName) {
                    case 'events':
                        return `
                          <span><b>Key:</b> ${pk}</span>
                          <span><b>type:</b> ${(record as DBEvent).type ?? '-'}</span>
                          <span><b>ts:</b> ${formatTs((record as DBEvent).ts)}</span>
                          <span><b>payload:</b> ${summarize((record as DBEvent).payload)}</span>
                        `;
                    case 'facts':
                        return `
                          <span><b>Key:</b> ${pk}</span>
                          <span><b>entity:</b> ${summarize((record as DBFact).entity, 60)}</span>
                          <span><b>path:</b> ${(record as DBFact).path ?? '-'}</span>
                          <span><b>value:</b> ${summarize((record as DBFact).value)}</span>
                          <span><b>confidence:</b> ${(record as DBFact).confidence ?? '-'}</span>
                          <span><b>updatedAt:</b> ${formatTs((record as DBFact).updatedAt)}</span>
                        `;
                    case 'summaries':
                        return `
                          <span><b>Key:</b> ${pk}</span>
                          <span><b>level:</b> ${(record as DBSummary).level ?? '-'}</span>
                          <span><b>title:</b> ${(record as DBSummary).title ?? '-'}</span>
                          <span><b>content:</b> ${summarize((record as DBSummary).content)}</span>
                          <span><b>createdAt:</b> ${formatTs((record as DBSummary).createdAt)}</span>
                        `;
                    case 'world_state':
                        return `
                          <span><b>Key:</b> ${pk}</span>
                          <span><b>path:</b> ${(record as DBWorldState).path ?? '-'}</span>
                          <span><b>value:</b> ${summarize((record as DBWorldState).value)}</span>
                          <span><b>updatedAt:</b> ${formatTs((record as DBWorldState).updatedAt)}</span>
                        `;
                    case 'audit':
                        return `
                          <span><b>Key:</b> ${pk}</span>
                          <span><b>action:</b> ${(record as DBAudit).action ?? '-'}</span>
                          <span><b>ts:</b> ${formatTs((record as DBAudit).ts)}</span>
                          <span><b>actor:</b> ${summarize((record as DBAudit).actor, 60)}</span>
                          <span><b>before/after:</b> ${summarize({ before: (record as DBAudit).before, after: (record as DBAudit).after })}</span>
                        `;
                }
            };

            const valueField = 'value' in (record as any)
                ? 'value'
                : 'payload' in (record as any)
                    ? 'payload'
                    : 'content' in (record as any)
                        ? 'content'
                        : 'after' in (record as any)
                            ? 'after'
                            : null;
            const value = valueField ? (record as any)[valueField] : undefined;

            row.innerHTML = `
              <div class="stx-re-row-meta">${buildContent()}</div>
              <div class="stx-re-row-actions">
                <textarea class="stx-re-edit-input" rows="2" disabled>${escapeHtml(encodeEditValue(value))}</textarea>
                <button type="button" class="stx-ui-btn secondary stx-re-edit-btn">编辑</button>
                <button type="button" class="stx-ui-btn secondary stx-re-del-btn">删除</button>
              </div>
            `;

            const input = row.querySelector('.stx-re-edit-input') as HTMLTextAreaElement;
            const editBtn = row.querySelector('.stx-re-edit-btn') as HTMLButtonElement;
            const delBtn = row.querySelector('.stx-re-del-btn') as HTMLButtonElement;

            const saveValue = async () => {
                const next = valueField ? decodeEditValue(input.value, (record as any)[valueField]) : input.value;
                const cloned = { ...record } as any;
                if (valueField) {
                    cloned[valueField] = next;
                }
                await (db[tableName] as any).put(cloned);
                input.disabled = true;
                row.classList.remove('is-editing');
            };

            editBtn.addEventListener('click', async () => {
                if (input.disabled) {
                    row.classList.add('is-editing');
                    input.disabled = false;
                    input.focus();
                    input.select();
                    editBtn.textContent = '保存';
                } else {
                    await saveValue();
                    editBtn.textContent = '编辑';
                }
            });

            input.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !input.disabled) {
                    await saveValue();
                    editBtn.textContent = '编辑';
                }
            });

            input.addEventListener('blur', async () => {
                if (!input.disabled) {
                    await saveValue();
                    editBtn.textContent = '编辑';
                }
            });

            delBtn.addEventListener('click', async () => {
                if (!confirm(`确认删除记录 ${pk} ?`)) return;
                await (db[tableName] as any).delete(pk);
                row.remove();
                if (!container.children.length) {
                    tableWrap.innerHTML = `<div class="stx-re-empty">${tableName} 暂无记录。</div>`;
                }
            });

            container.appendChild(row);
        });

        tableWrap.innerHTML = '';
        tableWrap.appendChild(container);
    };

    const renderTabs = () => {
        tabBar.innerHTML = '';
        TABLES.forEach(({ key, label }) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `stx-ui-btn secondary stx-re-tab ${activeTable === key ? 'is-active' : ''}`;
            btn.textContent = label;
            btn.addEventListener('click', async () => {
                activeTable = key;
                renderTabs();
                await renderRows(key);
            });
            tabBar.appendChild(btn);
        });
    };

    renderTabs();
    await renderRows(activeTable);
}
