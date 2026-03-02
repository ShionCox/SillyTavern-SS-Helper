import { db } from '../db/db';
import { logger, toast } from '../index';

type TableName = 'events' | 'facts' | 'summaries' | 'world_state' | 'audit';

export async function openRecordEditor() {
    // 1. 创建遮罩
    const overlay = document.createElement('div');
    overlay.className = 'stx-record-editor-overlay ui-widget';

    // 2. 创建主面板
    const panel = document.createElement('div');
    panel.className = 'stx-record-editor';

    // 添加挂载时的入场渐变
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.2s ease-in-out';
    setTimeout(() => overlay.style.opacity = '1', 10);

    // 3. 构建 HTML 结构
    panel.innerHTML = `
        <div class="stx-re-header">
            <div class="stx-re-title">
                <i class="fa-solid fa-database"></i>
                <span>MemoryOS 记录编辑器</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <button class="stx-re-btn delete" id="stx-re-btn-clear-db" style="border-color:#f44336; color:#f44336; background:rgba(244,67,54,0.1);"><i class="fa-solid fa-radiation"></i> 一键清空数据库</button>
                <div class="stx-re-close" id="stx-re-close-btn" title="关闭 (Esc)">
                    <i class="fa-solid fa-xmark"></i>
                </div>
            </div>
        </div>
        <div class="stx-re-body">
            <!-- 左侧边栏：会话列表 -->
            <div class="stx-re-sidebar">
                <div class="stx-re-sidebar-title">
                    <i class="fa-regular fa-comments"></i> 会话列表 (Chats)
                </div>
                <div class="stx-re-sidebar-list" id="stx-re-chat-list">
                    <div class="stx-re-chat-item is-active" data-chat-key="">
                        <div class="stx-re-chat-name">全局记录 (All)</div>
                        <div class="stx-re-chat-sys">Database Root</div>
                    </div>
                    <!-- 动态加载的会话项目 -->
                </div>
            </div>
            <!-- 右侧主体：数据区 -->
            <div class="stx-re-main">
                <div class="stx-re-tabs">
                    <div class="stx-re-tab is-active" data-table="events">事件流 (Events)</div>
                    <div class="stx-re-tab" data-table="facts">事实表 (Facts)</div>
                    <div class="stx-re-tab" data-table="summaries">摘要集 (Summaries)</div>
                    <div class="stx-re-tab" data-table="world_state">世界状态 (State)</div>
                    <div class="stx-re-tab" data-table="audit">审计日志 (Audit)</div>
                </div>
                <div class="stx-re-content" id="stx-re-content-area">
                    <div class="stx-re-empty">正在加载数据...</div>
                </div>
                <!-- 新增：浮动底部操作栏 -->
                <div class="stx-re-footer">
                    <div class="stx-re-footer-left">
                         <button class="stx-re-btn delete" id="stx-re-btn-batch-del" style="display:none">批量删除选中</button>
                    </div>
                    <div class="stx-re-footer-right">
                         <div class="stx-re-pending-msg" id="stx-re-pending-msg"><i class="fa-solid fa-triangle-exclamation"></i> 有未保存的修改</div>
                         <button class="stx-re-btn save" id="stx-re-btn-save" disabled>保存修改</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const contentArea = panel.querySelector('#stx-re-content-area') as HTMLElement;
    const closeBtn = panel.querySelector('#stx-re-close-btn');
    const tabs = panel.querySelectorAll('.stx-re-tab');
    const chatListContainer = panel.querySelector('#stx-re-chat-list') as HTMLElement;
    const btnSave = panel.querySelector('#stx-re-btn-save') as HTMLButtonElement;
    const btnBatchDel = panel.querySelector('#stx-re-btn-batch-del') as HTMLButtonElement;
    const pendingMsg = panel.querySelector('#stx-re-pending-msg') as HTMLElement;
    const btnClearDb = panel.querySelector('#stx-re-btn-clear-db') as HTMLButtonElement;

    if (btnClearDb) {
        btnClearDb.addEventListener('click', async () => {
            if (confirm('警告：此操作将清空所有记忆数据（事件、事实、摘要、状态等），这是不可逆转的危险操作！您确定要继续吗？')) {
                try {
                    await db.transaction('rw', [db.events, db.facts, db.summaries, db.world_state, db.audit], async () => {
                        await db.events.clear();
                        await db.facts.clear();
                        await db.summaries.clear();
                        await db.world_state.clear();
                        await db.audit.clear();
                    });
                    toast.success('整个数据库所有内容已清空完毕！', '系统清理');
                    pendingChanges.deletes.clear();
                    pendingChanges.updates.clear();
                    currentChatKey = ''; // 重置为全局
                    loadChatKeys().then(() => renderTable(currentTable));
                } catch (err) {
                    logger.error('Failed to clear entire database', err);
                    toast.error('清空操作失败: ' + err);
                }
            }
        });
    }

    let currentTable: TableName = 'events';
    let currentChatKey: string = ''; // 默认为空代表不限制，即 'All'

    // 离线状态池
    const pendingChanges = {
        deletes: new Set<string>(), // 格式: `${tableName}::${id}`
        updates: new Map<string, { id: string, tableName: TableName, payload: any }>() // key: `${tableName}::${id}`
    };

    // 事件翻译
    const translateEventType = (type: string) => {
        const typeMap: Record<string, string> = {
            'chat.message.sent': '↑ 发送',
            'chat.message.received': '↓ 接收',
            'chat.generation.ended': '生成结束',
            'chat.started': '会话开始',
            'chat.message.swipe': '↔ 滑动',
            'character.card_updated': '卡片更新',
            'world.state_updated': '系统更新'
        };
        return typeMap[type] || type;
    };

    const updateFooterState = () => {
        const hasChanges = pendingChanges.deletes.size > 0 || pendingChanges.updates.size > 0;
        btnSave.disabled = !hasChanges;
        if (hasChanges) pendingMsg.classList.add('visible');
        else pendingMsg.classList.remove('visible');
    };

    // 获取并渲染会话列表
    async function loadChatKeys() {
        try {
            // 获取所有元数据拿到活跃的 chatKey，也从 events 提取以防漏掉
            const metaKeys = await db.meta.toCollection().primaryKeys();
            const eventKeys = await db.events.orderBy('chatKey').uniqueKeys();
            const allKeys = Array.from(new Set([...metaKeys, ...eventKeys])) as string[];

            // 整合 ST 上下文来解析名字
            const ctx = (window as any).SillyTavern?.getContext?.() || {};
            const characters = ctx.characters || [];
            const groups = ctx.groups || [];

            let htmlArr = [];
            for (const key of allKeys) {
                if (!key) continue;
                let displayName = key;
                let sysName = key;
                let avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-user"></i></div>`;
                let timeStr = '';

                // 获取此 ChatKey 的最早交互时间
                try {
                    const firstEv = await db.events.where('chatKey').equals(key).first();
                    if (firstEv && firstEv.ts) {
                        const d = new Date(firstEv.ts);
                        timeStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                    }
                } catch (e) { }

                // 解析群组
                if (key.startsWith('Group_')) {
                    const match = key.match(/Group_([^_]+)/);
                    if (match && match[1]) {
                        const groupId = match[1];
                        const grp = groups.find((g: any) => g.id === groupId);
                        if (grp) {
                            displayName = `[群组] ${grp.name}`;
                            avatarHtml = `<div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-users"></i></div>`;
                        }
                    }
                } else {
                    // 解析单人角色
                    // 例如: 'default_Seraphina.png_Seraphina - 2026-03-02@13h29m26s900ms'
                    // 如果存在字符可以遍历查找。或者直接遍历 characters
                    let matchedChar = null;
                    for (const char of characters) {
                        const avatarName = char.avatar;
                        // 如果 chatKey 以这个 avatarName 开头并且随后跟着下划线
                        if (avatarName && key.startsWith(avatarName + '_')) {
                            matchedChar = char;
                            break;
                        }
                    }

                    if (matchedChar) {
                        displayName = matchedChar.name;
                        // 头像展示：在 ST 中，如果存在 /characters/ 头像可直接用
                        avatarHtml = `<img class="stx-re-chat-avatar" src="/characters/${matchedChar.avatar}" alt="${matchedChar.name}" onerror="this.outerHTML='<div class=\\'stx-re-chat-avatar-icon\\'><i class=\\'fa-solid fa-user\\'></i></div>'">`;
                    } else {
                        // 降级处理，尝试去掉末尾的时间戳
                        const lastDashIdx = key.lastIndexOf(' - ');
                        if (lastDashIdx !== -1) {
                            const withoutDate = key.substring(0, lastDashIdx);
                            const parts = withoutDate.split('_');
                            if (parts.length > 1) {
                                displayName = parts[parts.length - 1]; // 一般下划线之后就是原角色名
                            }
                        }
                    }
                }

                htmlArr.push(`
                    <div class="stx-re-chat-item" data-chat-key="${key}" title="${sysName}">
                        ${avatarHtml}
                        <div class="stx-re-chat-info">
                            <div class="stx-re-chat-name">${displayName}</div>
                            <div class="stx-re-chat-sys">${sysName}</div>
                        </div>
                        ${timeStr ? `<div class="stx-re-chat-time">${timeStr}</div>` : ''}
                    </div>
                `);
            }

            // 追加到 "全部" 按钮后
            const allBtnHtml = `
                <div class="stx-re-chat-item is-active" data-chat-key="">
                    <div class="stx-re-chat-avatar-icon"><i class="fa-solid fa-globe"></i></div>
                    <div class="stx-re-chat-info">
                        <div class="stx-re-chat-name">全局记录 (All)</div>
                        <div class="stx-re-chat-sys">Database Root</div>
                    </div>
                </div>
            `;
            chatListContainer.innerHTML = allBtnHtml + htmlArr.join('');

            // 绑定侧边栏点击事件
            const chatItems = chatListContainer.querySelectorAll('.stx-re-chat-item');
            chatItems.forEach(item => {
                item.addEventListener('click', () => {
                    chatItems.forEach(i => i.classList.remove('is-active'));
                    item.classList.add('is-active');
                    currentChatKey = item.getAttribute('data-chat-key') || '';
                    renderTable(currentTable);
                });

                // 右键删除逻辑
                (item as HTMLElement).addEventListener('contextmenu', (e: MouseEvent) => {
                    e.preventDefault();
                    document.querySelectorAll('.stx-re-ctx-menu').forEach(m => m.remove());
                    // 移除其他的高亮
                    document.querySelectorAll('.is-context-target').forEach(el => el.classList.remove('is-context-target'));

                    const chatKey = item.getAttribute('data-chat-key');
                    if (!chatKey) return; // 'All' 不允许右键清空

                    item.classList.add('is-context-target');

                    const menu = document.createElement('div');
                    menu.className = 'stx-re-ctx-menu';
                    menu.style.left = `${e.clientX}px`;
                    menu.style.top = `${e.clientY}px`;
                    menu.innerHTML = `<div class="stx-re-ctx-menu-item"><i class="fa-solid fa-trash-can"></i> 删除此会话全部记忆</div>`;

                    menu.addEventListener('click', async () => {
                        menu.remove();
                        item.classList.remove('is-context-target');
                        if (confirm('警告：此操作直接清空数据库中该会话的所有事件、事实、摘要和状态记录，并且不可逆转！确定执行吗？')) {
                            try {
                                await db.transaction('rw', [db.events, db.facts, db.summaries, db.world_state], async () => {
                                    await db.events.where('chatKey').equals(chatKey).delete();
                                    await db.facts.where('chatKey').equals(chatKey).delete();
                                    await db.summaries.where('chatKey').equals(chatKey).delete();
                                    await db.world_state.where('chatKey').equals(chatKey).delete();
                                });
                                toast.success('已清空该会话所有记忆数据');
                                if (currentChatKey === chatKey) currentChatKey = '';
                                loadChatKeys().then(() => renderTable(currentTable));
                            } catch (err) {
                                logger.error('Failed to clear chat memory', err);
                                toast.error('清空操作失败: ' + err);
                            }
                        }
                    });

                    document.body.appendChild(menu);

                    const dismiss = (ce: Event) => {
                        if (!menu.contains(ce.target as Node)) {
                            menu.remove();
                            item.classList.remove('is-context-target');
                            document.removeEventListener('pointerdown', dismiss, { capture: true });
                            document.removeEventListener('contextmenu', dismiss, { capture: true });
                        }
                    };
                    setTimeout(() => {
                        document.addEventListener('pointerdown', dismiss, { capture: true });
                        document.addEventListener('contextmenu', dismiss, { capture: true });
                    }, 0);
                });
            });

        } catch (e) {
            logger.error('Failed to load chat keys', e);
        }
    }

    // 初始化：加载左侧列表和右侧全部数据
    loadChatKeys().then(() => renderTable(currentTable));

    // 关闭逻辑
    const close = () => {
        if (btnSave.disabled === false) {
            if (!confirm('您有未保存的更改，退出将丢失它们，确定要退出吗？')) return;
        }
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.remove();
            document.removeEventListener('keydown', onEsc);
        }, 200);
    };

    const onEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') close();
    };

    closeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
    });

    panel.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            e.stopPropagation();
            close();
        }
    });

    document.addEventListener('keydown', onEsc);

    // 注册底部全局保护动作
    btnSave.addEventListener('click', async () => {
        try {
            await db.transaction('rw', [db.events, db.facts, db.summaries, db.world_state, db.audit], async () => {
                for (const pendingKey of pendingChanges.deletes) {
                    const [tName, id] = pendingKey.split('::');
                    if (tName && id) await (db as any)[tName].delete(id);
                }
                for (const updateInfo of pendingChanges.updates.values()) {
                    const { id, tableName, payload } = updateInfo;
                    const item = await (db as any)[tableName].get(id);
                    if (item) {
                        if (tableName === 'facts' || tableName === 'world_state') {
                            await (db as any)[tableName].put({ ...item, value: payload, updatedAt: Date.now() });
                        } else if (tableName === 'summaries') {
                            await (db as any)[tableName].put({ ...item, content: payload });
                        } else if (tableName === 'events') {
                            await (db as any)[tableName].put({ ...item, payload: payload });
                        } else if (tableName === 'audit') {
                            await (db as any)[tableName].put({ ...item, after: payload });
                        }
                    }
                }
            });
            pendingChanges.deletes.clear();
            pendingChanges.updates.clear();
            updateFooterState();
            toast.success('所有更改已成功写入数据库', '保存成功');
            renderTable(currentTable);
        } catch (e) {
            logger.error('Failed to save changes', e);
            toast.error('保存过程中遭遇异常', '保存失败');
        }
    });

    // 辅助函数判断全选逻辑
    const updateBatchBtnAndCheckbox = () => {
        const rowCbs = contentArea.querySelectorAll('.stx-re-select-row:not(:disabled)') as NodeListOf<HTMLInputElement>;
        const checkedCount = Array.from(rowCbs).filter(cb => cb.checked).length;
        const allChecked = rowCbs.length > 0 && checkedCount === rowCbs.length;

        const masterCb = contentArea.querySelector('.stx-re-select-all') as HTMLInputElement;
        if (masterCb) masterCb.checked = allChecked;

        if (checkedCount > 0) {
            btnBatchDel.style.display = 'block';
            btnBatchDel.textContent = `批量删除选中 (${checkedCount})`;
        } else {
            btnBatchDel.style.display = 'none';
        }
    };

    btnBatchDel.addEventListener('click', () => {
        const rowCbs = contentArea.querySelectorAll('.stx-re-select-row:checked') as NodeListOf<HTMLInputElement>;
        let count = 0;
        rowCbs.forEach(cb => {
            const id = cb.getAttribute('data-id');
            if (id) {
                pendingChanges.deletes.add(`${currentTable}::${id}`);
                pendingChanges.updates.delete(`${currentTable}::${id}`);
                count++;
            }
        });
        toast.info(`已标记 ${count} 条记录准备删除，请点击保存生效`, '批量删除');
        updateFooterState();
        renderTable(currentTable);
    });

    // 当前排序状态
    let currentSort = { col: '', asc: false };

    // 切换 Tab 逻辑
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('is-active'));
            tab.classList.add('is-active');
            currentTable = tab.getAttribute('data-table') as TableName;

            // 更换表的时候，重置排序和隐藏批量按钮
            currentSort = { col: '', asc: false };
            btnBatchDel.style.display = 'none';
            renderTable(currentTable);
        });
    });

    // 渲染 KV 列表 Helper
    const renderValueHtml = (val: any, isEditing: boolean) => {
        let titleAttr = '';
        if (typeof val === 'object' && val !== null && !isEditing) {
            try { titleAttr = `title="${JSON.stringify(val, null, 2).replace(/"/g, '&quot;')}"`; } catch (e) { }
        }

        if (typeof val !== 'object' || val === null) {
            if (isEditing) return `<div contenteditable="true" class="stx-re-kv-input" data-key="__primitive__">${String(val).replace(/</g, '&lt;')}</div>`;
            return `<div style="word-break: break-all;" ${titleAttr}>${String(val).replace(/</g, '&lt;')}</div>`;
        }
        let html = `<div class="stx-re-kv" ${titleAttr}>`;
        for (const [k, v] of Object.entries(val)) {
            let vStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
            if (isEditing) {
                html += `<div class="stx-re-kv-row"><div class="stx-re-kv-key">${k}:</div><div contenteditable="true" class="stx-re-kv-input" data-key="${k}">${vStr.replace(/</g, '&lt;')}</div></div>`;
            } else {
                html += `<div class="stx-re-kv-row"><div class="stx-re-kv-key">${k}:</div><div class="stx-re-kv-val">${vStr.replace(/</g, '&lt;')}</div></div>`;
            }
        }
        html += '</div>';
        return html;
    };

    // 渲染表格
    async function renderTable(tableName: TableName) {
        contentArea.innerHTML = '<div class="stx-re-empty">加载中...</div>';

        try {
            let data: any[] = [];

            // 带有过滤条件的查询
            const getFiltered = async (table: any, needsReverse = false, limit = 0) => {
                let query = currentChatKey ? table.where('chatKey').equals(currentChatKey) : table.toCollection();
                if (needsReverse) query = query.reverse();
                if (limit > 0) query = query.limit(limit);
                return await query.toArray();
            };

            switch (tableName) {
                case 'events': data = await getFiltered(db.events, true, 1000); break;
                case 'facts': data = await getFiltered(db.facts); break;
                case 'summaries': data = await getFiltered(db.summaries); break;
                case 'world_state': data = await getFiltered(db.world_state); break;
                case 'audit': data = await getFiltered(db.audit, true, 500); break;
            }

            if (data.length === 0) {
                contentArea.innerHTML = '<div class="stx-re-empty">暂无数据记录。</div>';
                return;
            }

            // 应用当前排序 (UI 排序)
            let sortCol = currentSort.col;
            if (!sortCol) {
                if (tableName === 'events' || tableName === 'audit') sortCol = 'ts';
                else if (tableName === 'world_state') sortCol = 'updatedAt';
                else if (tableName === 'summaries') sortCol = 'level';
                else sortCol = 'factKey';
            }

            data.sort((a, b) => {
                let valA = a[sortCol];
                let valB = b[sortCol];
                if (valA === undefined) return 1;
                if (valB === undefined) return -1;
                if (valA < valB) return currentSort.asc ? -1 : 1;
                if (valA > valB) return currentSort.asc ? 1 : -1;
                return 0;
            });

            const tableEl = document.createElement('table');
            tableEl.className = 'stx-re-table';

            const masterCheckStr = `<input type="checkbox" class="stx-re-checkbox stx-re-select-all" title="全选当页">`;

            // Helper for sortable th
            const th = (label: string, col: string, style = '') => {
                const isActive = sortCol === col;
                const icon = isActive ? (currentSort.asc ? '<i class="fa-solid fa-sort-up"></i>' : '<i class="fa-solid fa-sort-down"></i>') : '<i class="fa-solid fa-sort"></i>';
                return `<th class="stx-re-th-sortable ${isActive ? 'active' : ''}" data-col="${col}" style="position: relative; ${style}">${label} ${icon}<div class="stx-re-resizer"></div></th>`;
            };

            // 构建表头和行
            let thead = '';
            let rowsHtml = '';

            data.forEach(r => {
                let id = '';
                switch (tableName) {
                    case 'events': id = r.eventId; break;
                    case 'facts': id = r.factKey; break;
                    case 'summaries': id = r.summaryId; break;
                    case 'world_state': id = r.stateKey; break;
                    case 'audit': id = r.auditId; break;
                }

                const pendingKey = `${tableName}::${id}`;
                const isPendingDel = pendingChanges.deletes.has(pendingKey);
                const pendingUpd = pendingChanges.updates.get(pendingKey);

                const rowClass = isPendingDel ? 'stx-re-row pending-delete' : (pendingUpd ? 'stx-re-row pending-update' : 'stx-re-row');
                const cbStatus = isPendingDel ? 'disabled' : '';

                if (tableName === 'events') {
                    if (!thead) thead = `<tr><th style="width:30px; text-align:center">${masterCheckStr}</th>${th('类型 / ID / 发送方', 'type')}${th('时间 (Ts)', 'ts')}${th('内容 (Payload)', 'payload')}<th>操作</th></tr>`;
                    let val = pendingUpd ? pendingUpd.payload : r.payload;
                    let senderInfo = '';
                    if (r.type === 'chat.message.sent' || r.type === 'chat.message.received' || r.type === 'chat.message.swipe') {
                        let isUser = !!val?.isUser || val?.name === 'You' || val?.name === 'User';
                        let isSystem = val?.role === 'system' || val?.isSystem || val?.name === 'System' || val?.name === '系统';

                        let senderType = 'AI';
                        let badgeColor = '#10b981'; // Green for AI

                        if (isSystem) {
                            senderType = '系统';
                            badgeColor = '#8b5cf6'; // Purple representing System
                        } else if (isUser || r.type === 'chat.message.sent') {
                            senderType = '用户';
                            badgeColor = '#3b82f6'; // Blue representing User
                        }

                        const senderName = val?.name || '未知';
                        senderInfo = `<div style="margin-top:4px; font-size:11px; display:flex; align-items:center; gap:4px;"><span style="background:${badgeColor}; color:#fff; padding:1px 4px; border-radius:3px; font-weight:600;">${senderType}</span> <span style="color:#b0bfd8; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;" title="${senderName}">${senderName}</span></div>`;
                    }

                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${id}" ${cbStatus}></td>
                            <td><div style="font-weight:700">${translateEventType(r.type)}</div><div class="stx-re-json" style="font-size:10px">${r.eventId}</div>${senderInfo}</td>
                            <td>${new Date(r.ts).toLocaleString()}</td>
                            <td><div class="stx-re-value editable" data-id="${id}" data-type="object">${renderValueHtml(val, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${id}">编辑</button><button class="stx-re-btn delete" data-id="${id}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'facts') {
                    if (!thead) thead = `<tr><th style="width:30px; text-align:center">${masterCheckStr}</th>${th('事实 Key', 'factKey')}${th('实体', 'entity')}${th('路径', 'path')}${th('数据值 (Value)', 'value')}<th>操作</th></tr>`;
                    let val = pendingUpd ? pendingUpd.payload : r.value;
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${id}" ${cbStatus}></td>
                            <td><div class="stx-re-json" style="width:120px; overflow:hidden; text-overflow:ellipsis" title="${r.factKey}">${r.factKey}</div></td>
                            <td>${r.entity ? `[${r.entity.kind}:${r.entity.id}]` : '-'}</td>
                            <td>${r.path || '-'}</td>
                            <td><div class="stx-re-value editable" data-id="${id}" data-type="object">${renderValueHtml(val, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${id}">编辑</button><button class="stx-re-btn delete" data-id="${id}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'summaries') {
                    if (!thead) thead = `<tr><th style="width:30px; text-align:center">${masterCheckStr}</th>${th('层级 / 标题', 'level')}${th('关键词', 'keywords')}${th('摘要内容', 'content')}<th>操作</th></tr>`;
                    let val = pendingUpd ? pendingUpd.payload : r.content;
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${id}" ${cbStatus}></td>
                            <td><div style="font-weight:700">${r.level}</div><div>${r.title || ''}</div></td>
                            <td>${(r.keywords || []).join(', ')}</td>
                            <td><div class="stx-re-value editable" data-id="${id}" data-type="string">${renderValueHtml(val, false)}</div></td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${id}">编辑</button><button class="stx-re-btn delete" data-id="${id}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'world_state') {
                    if (!thead) thead = `<tr><th style="width:30px; text-align:center">${masterCheckStr}</th>${th('路径 / Key', 'path')}${th('数据 (Value)', 'value')}${th('更新时间', 'updatedAt')}<th>操作</th></tr>`;
                    let val = pendingUpd ? pendingUpd.payload : r.value;
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${id}" ${cbStatus}></td>
                            <td><div style="font-weight:700">${r.path}</div><div class="stx-re-json">${r.stateKey}</div></td>
                            <td><div class="stx-re-value editable" data-id="${id}" data-type="object">${renderValueHtml(val, false)}</div></td>
                            <td>${new Date(r.updatedAt).toLocaleString()}</td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${id}">编辑</button><button class="stx-re-btn delete" data-id="${id}">删除</button></div></td>
                        </tr>
                    `;
                } else if (tableName === 'audit') {
                    if (!thead) thead = `<tr><th style="width:30px; text-align:center">${masterCheckStr}</th>${th('动作', 'action')}${th('发起者', 'actor')}${th('变更 (After)', 'after')}${th('时间', 'ts')}<th>操作</th></tr>`;
                    let val = pendingUpd ? pendingUpd.payload : r.after;
                    rowsHtml += `
                        <tr class="${rowClass}">
                            <td class="stx-re-checkbox-td"><input type="checkbox" class="stx-re-checkbox stx-re-select-row" data-id="${id}" ${cbStatus}></td>
                            <td><b style="color:#7ca5f5">${r.action}</b></td>
                            <td>${r.actor?.pluginId || 'system'} (${r.actor?.mode || ''})</td>
                            <td><div class="stx-re-value editable" data-id="${id}" data-type="object">${renderValueHtml(val || {}, false)}</div></td>
                            <td>${new Date(r.ts).toLocaleString()}</td>
                            <td><div class="stx-re-actions"><button class="stx-re-btn edit" data-id="${id}">编辑</button><button class="stx-re-btn delete" data-id="${id}">删除</button></div></td>
                        </tr>
                    `;
                }
            });

            tableEl.innerHTML = `<thead>${thead}</thead><tbody>${rowsHtml}</tbody>`;
            contentArea.innerHTML = '';
            contentArea.appendChild(tableEl);

            // 绑定表头排序
            tableEl.querySelectorAll('.stx-re-th-sortable').forEach(thEl => {
                thEl.addEventListener('click', (e) => {
                    if ((e.target as HTMLElement).classList.contains('stx-re-resizer')) return;
                    const col = thEl.getAttribute('data-col');
                    if (!col) return;
                    if (currentSort.col === col) {
                        currentSort.asc = !currentSort.asc;
                    } else {
                        currentSort.col = col;
                        currentSort.asc = false; // 默认降序
                    }
                    renderTable(tableName);
                });
            });

            // 绑定列宽拖拽
            tableEl.querySelectorAll('.stx-re-resizer').forEach(resizer => {
                resizer.addEventListener('mousedown', function (e: Event) {
                    const mouseEvent = e as MouseEvent;
                    mouseEvent.preventDefault();
                    mouseEvent.stopPropagation();
                    const thEl = resizer.parentElement as HTMLElement;

                    // 获取当前所有表头计算出的初始宽度，并固化为内联样式（防止拖动时表格乱抖）
                    const table = thEl.closest('table');
                    if (table) {
                        const ths = table.querySelectorAll('th');
                        ths.forEach(t => {
                            if (!t.style.width) t.style.width = t.offsetWidth + 'px';
                        });
                        table.style.tableLayout = 'fixed';
                    }

                    const startX = mouseEvent.pageX;
                    const startWidth = thEl.offsetWidth;
                    resizer.classList.add('is-resizing');

                    const onMouseMove = (moveEvent: MouseEvent) => {
                        const newWidth = Math.max(50, startWidth + (moveEvent.pageX - startX));
                        thEl.style.width = newWidth + 'px';
                    };

                    const onMouseUp = () => {
                        resizer.classList.remove('is-resizing');
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });

            // 绑定多选框交互
            const masterCb = tableEl.querySelector('.stx-re-select-all') as HTMLInputElement;
            if (masterCb) {
                masterCb.addEventListener('change', () => {
                    tableEl.querySelectorAll('.stx-re-select-row:not(:disabled)').forEach(cb => {
                        (cb as HTMLInputElement).checked = masterCb.checked;
                    });
                    updateBatchBtnAndCheckbox();
                });
            }

            tableEl.querySelectorAll('.stx-re-select-row').forEach(cb => {
                cb.addEventListener('change', updateBatchBtnAndCheckbox);
            });

            // 绑定数据右键复制原始 JSON 菜单
            tableEl.querySelectorAll('.stx-re-value').forEach((valEl) => {
                (valEl as HTMLElement).addEventListener('contextmenu', (e: MouseEvent) => {
                    e.preventDefault();
                    document.querySelectorAll('.stx-re-ctx-menu').forEach(m => m.remove());

                    const id = valEl.getAttribute('data-id');
                    if (!id) return;

                    const originData = data.find(r => {
                        let rId = '';
                        switch (tableName) { case 'events': rId = r.eventId; break; case 'facts': rId = r.factKey; break; case 'summaries': rId = r.summaryId; break; case 'world_state': rId = r.stateKey; break; case 'audit': rId = r.auditId; break; }
                        return rId === id;
                    });
                    if (!originData) return;

                    let rawVal = null;
                    if (tableName === 'summaries') rawVal = originData.content;
                    else if (tableName === 'events') rawVal = originData.payload;
                    else if (tableName === 'audit') rawVal = originData.after;
                    else rawVal = originData.value;

                    const menu = document.createElement('div');
                    menu.className = 'stx-re-ctx-menu';
                    menu.style.left = `${e.clientX}px`;
                    menu.style.top = `${e.clientY}px`;
                    menu.innerHTML = `<div class="stx-re-ctx-menu-item"><i class="fa-solid fa-copy"></i> 复制为格式化 JSON</div>`;

                    menu.addEventListener('click', async () => {
                        menu.remove();
                        const toCopy = typeof rawVal === 'object' ? JSON.stringify(rawVal, null, 2) : String(rawVal);
                        navigator.clipboard.writeText(toCopy).then(() => {
                            toast.success('已复制到剪贴板');
                        }).catch(() => {
                            toast.error('复制失败');
                        });
                    });

                    document.body.appendChild(menu);

                    // 在事件循环下一帧绑定防止立即触发
                    setTimeout(() => {
                        const dismiss = (ce: Event) => {
                            if (!menu.contains(ce.target as Node)) {
                                menu.remove();
                                document.removeEventListener('pointerdown', dismiss, { capture: true });
                                document.removeEventListener('contextmenu', dismiss, { capture: true });
                            }
                        };
                        document.addEventListener('pointerdown', dismiss, { capture: true });
                        document.addEventListener('contextmenu', dismiss, { capture: true });
                    }, 0);
                });
            });

            // 绑定删除按钮
            tableEl.querySelectorAll('.stx-re-btn.delete').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;

                    pendingChanges.deletes.add(`${tableName}::${id}`);
                    pendingChanges.updates.delete(`${tableName}::${id}`);
                    toast.info('已加入待删除队列，请点击保存生效', '待删除');
                    updateFooterState();
                    renderTable(tableName);
                });
            });

            // 绑定编辑逻辑（替换原有的单纯 contentEditable 为表单）
            tableEl.querySelectorAll('.stx-re-btn.edit').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    if (!id) return;

                    const editableDiv = btn.closest('tr')?.querySelector('.editable') as HTMLElement;
                    if (!editableDiv) return;

                    // 如果当前已经是编辑态，则执行保存逻辑
                    if (editableDiv.classList.contains('is-editing')) {
                        let newValue: any;
                        const dataType = editableDiv.getAttribute('data-type');

                        if (dataType === 'object') {
                            const inputs = editableDiv.querySelectorAll('.stx-re-kv-input') as NodeListOf<HTMLElement>;
                            if (inputs.length === 1 && inputs[0].getAttribute('data-key') === '__primitive__') {
                                // 原始是基本类型
                                let v = inputs[0].textContent || inputs[0].innerText || '';
                                try { if (v === 'true') newValue = true; else if (v === 'false') newValue = false; else if (!isNaN(Number(v)) && v !== '') newValue = Number(v); else newValue = v; } catch (e) { newValue = v; }
                            } else {
                                newValue = {};
                                inputs.forEach(input => {
                                    const k = input.getAttribute('data-key');
                                    let v: any = input.textContent || input.innerText || '';
                                    try { if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(Number(v)) && v !== '') v = Number(v); else if (v.startsWith('{') || v.startsWith('[')) v = JSON.parse(v); } catch (e) { }
                                    if (k) newValue[k] = v;
                                });
                            }
                        } else {
                            // string primitive like summaries
                            const input = editableDiv.querySelector('.stx-re-kv-input') as HTMLElement;
                            newValue = input ? (input.textContent || input.innerText || '') : '';
                        }

                        pendingChanges.updates.set(`${tableName}::${id}`, {
                            id, tableName, payload: newValue
                        });
                        toast.info('当前行已加入待更新队列', '行已保存');
                        updateFooterState();

                        // 移除编辑态，恢复展示态
                        editableDiv.classList.remove('is-editing');
                        editableDiv.innerHTML = renderValueHtml(newValue, false);
                        editableDiv.style.background = '';
                        editableDiv.style.padding = '0';
                        editableDiv.style.borderRadius = '0';

                        const btnEl = btn as HTMLButtonElement;
                        btnEl.textContent = '编辑';
                        btnEl.style.color = '';
                        btnEl.style.borderColor = '';

                        return;
                    }

                    // 否则，切换为编辑态
                    const currentData = pendingChanges.updates.get(`${tableName}::${id}`)?.payload ?? data.find(r => {
                        let rId = '';
                        switch (tableName) { case 'events': rId = r.eventId; break; case 'facts': rId = r.factKey; break; case 'summaries': rId = r.summaryId; break; case 'world_state': rId = r.stateKey; break; case 'audit': rId = r.auditId; break; }
                        return rId === id;
                    })?.[(() => {
                        if (tableName === 'summaries') return 'content';
                        if (tableName === 'events') return 'payload';
                        if (tableName === 'audit') return 'after';
                        return 'value';
                    })()];

                    editableDiv.classList.add('is-editing');
                    editableDiv.innerHTML = renderValueHtml(currentData, true);
                    editableDiv.style.background = 'rgba(197, 160, 89, 0.1)';
                    editableDiv.style.padding = '4px';
                    editableDiv.style.borderRadius = '4px';

                    const btnEl = btn as HTMLButtonElement;
                    btnEl.textContent = '保存';
                    btnEl.style.color = '#c5a059';
                    btnEl.style.borderColor = '#c5a059';
                });
            });

            // 双击可直接激活编辑
            tableEl.querySelectorAll('.editable').forEach(cell => {
                cell.addEventListener('dblclick', () => {
                    const editBtn = cell.closest('tr')?.querySelector('.stx-re-btn.edit') as HTMLButtonElement;
                    if (editBtn && !cell.classList.contains('is-editing')) editBtn.click();
                });
            });

        } catch (error) {
            logger.error(`Render records failed:`, error);
            contentArea.innerHTML = `<div class="stx-re-empty" style="color:#ff8787">加载失败: ${error}</div>`;
        }
    }

    // 初始渲染
    renderTable(currentTable);
    updateBatchBtnAndCheckbox();
}
