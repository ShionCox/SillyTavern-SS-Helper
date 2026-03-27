import { escapeHtml } from '../editorShared';
import { escapeAttr, formatTimestamp, summarizeDetailPayload, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import type { ActorMemoryProfile, MemoryEntry, MemoryEntryType, RoleEntryMemory, SummarySnapshot } from '../../types';

/**
 * 功能：构建角色页签子视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 子视图 HTML。
 */
function buildActorSubView(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    if (state.currentActorTab === 'attributes') {
        return buildActorAttributesMarkup(selectedActor);
    }
    if (state.currentActorTab === 'memory') {
        return buildActorMemoryMarkup(snapshot, selectedActor, selectedActorMemories, typeMap, entryOptions);
    }
    if (state.currentActorTab === 'items') {
        return buildActorItemsMarkup();
    }
    return buildActorRelationshipsMarkup(snapshot, selectedActor, selectedActorMemories, typeMap);
}

/**
 * 功能：构建角色基础资料页。
 * @param selectedActor 当前角色。
 * @returns 页面 HTML。
 */
function buildActorAttributesMarkup(selectedActor: ActorMemoryProfile | null): string {
    return `
        <div class="stx-memory-workbench__form-grid">
            <div class="stx-memory-workbench__field-stack">
                <label>角色键</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-key" value="${escapeAttr(selectedActor?.actorKey ?? '')}" placeholder="例如：seraphina" />
            </div>
            <div class="stx-memory-workbench__field-stack">
                <label>显示名</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-label" value="${escapeAttr(selectedActor?.displayName ?? '')}" placeholder="例如：塞拉菲娜" />
            </div>
            <div class="stx-memory-workbench__field-stack">
                <label>记忆稳定度（0-100）</label>
                <input class="stx-memory-workbench__input" id="stx-memory-actor-stat" type="number" min="0" max="100" value="${escapeAttr(String(selectedActor?.memoryStat ?? 60))}" />
            </div>
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">当前档案</div>
                <div class="stx-memory-workbench__info-list">
                    <div class="stx-memory-workbench__info-row"><span>角色键</span><strong>${escapeHtml(selectedActor?.actorKey ?? '未创建')}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>显示名</span><strong>${escapeHtml(selectedActor?.displayName ?? '未命名')}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>记忆稳定度</span><strong>${escapeHtml(String(selectedActor?.memoryStat ?? 60))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>创建时间</span><strong>${escapeHtml(formatTimestamp(selectedActor?.createdAt))}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>更新时间</span><strong>${escapeHtml(formatTimestamp(selectedActor?.updatedAt))}</strong></div>
                </div>
            </div>
        </div>
        <div class="stx-memory-workbench__toolbar" style="margin-top:16px;">
            <button class="stx-memory-workbench__button" data-action="save-actor"><i class="fa-solid fa-floppy-disk"></i> 保存角色资料</button>
        </div>
    `;
}

/**
 * 功能：构建角色深层记忆页。
 * @param snapshot 工作台快照。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 页面 HTML。
 */
function buildActorMemoryMarkup(
    snapshot: WorkbenchSnapshot,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    const memoryRows = selectedActorMemories.map((item: RoleEntryMemory): string => {
        const entry = snapshot.entries.find((row: MemoryEntry): boolean => row.entryId === item.entryId);
        const typeLabel = typeMap.get(entry?.entryType ?? '')?.label || entry?.entryType || '未分类';
        return `
            <article class="stx-memory-workbench__card" style="padding: 12px;">
                <div class="stx-memory-workbench__split-head" style="margin-bottom: 8px;">
                    <div>
                        <div class="stx-memory-workbench__panel-title" style="margin-bottom: 2px;">${escapeHtml(entry?.title ?? item.entryId)}</div>
                        <div class="stx-memory-workbench__meta">${escapeHtml(typeLabel)} · 信号 ${escapeHtml(String(item.memoryPercent))}% · ${item.forgotten ? '已遗忘' : '活跃'}</div>
                    </div>
                    <div class="stx-memory-workbench__toolbar">
                        <button class="stx-memory-workbench__ghost-btn" style="padding: 4px 8px; font-size: 11px;" data-action="unbind-entry" data-entry-id="${escapeAttr(item.entryId)}">
                            <i class="fa-solid fa-link-slash"></i> 解绑
                        </button>
                    </div>
                </div>
                <div class="stx-memory-workbench__detail-block" style="margin-bottom: 8px;">${escapeHtml(entry?.summary || entry?.detail || '暂无正文')}</div>
                <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid var(--mw-line);">
                    <span style="color: var(--mw-muted);">结构化事实：</span>
                    <span style="color: var(--mw-accent-cyan); font-family: monospace; line-height: 1.4;">${escapeHtml(summarizeDetailPayload(entry?.detailPayload))}</span>
                </div>
            </article>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__form-grid" style="align-items:flex-end;">
            <div class="stx-memory-workbench__field-stack">
                <label>绑定新条目</label>
                <select class="stx-memory-workbench__select" id="stx-memory-bind-entry">${entryOptions}</select>
            </div>
            <div class="stx-memory-workbench__toolbar" style="margin-bottom:2px;">
                <button class="stx-memory-workbench__button" data-action="bind-entry"><i class="fa-solid fa-link"></i> 绑定到当前角色</button>
            </div>
        </div>
        <div class="stx-memory-workbench__section-title" style="margin-top:16px;">深层记忆</div>
        <div class="stx-memory-workbench__meta">当前角色：${escapeHtml(selectedActor?.displayName ?? '未选择角色')}，共 ${selectedActorMemories.length} 条真实绑定。</div>
        <div class="stx-memory-workbench__stack" style="margin-top:8px;">
            ${memoryRows || '<div class="stx-memory-workbench__empty">当前角色还没有任何真实绑定记忆。</div>'}
        </div>
    `;
}

/**
 * 功能：构建装备终端空态页。
 * @returns 页面 HTML。
 */
function buildActorItemsMarkup(): string {
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">装备终端</div>
            <div class="stx-memory-workbench__detail-block">
                当前聊天尚未接入真实的 item / equipment 主链，因此这里仅展示只读说明，不再渲染演示背包或伪装备栏。
            </div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>接入状态</span><strong>未接入主链</strong></div>
                <div class="stx-memory-workbench__info-row"><span>当前策略</span><strong>只读空态</strong></div>
                <div class="stx-memory-workbench__info-row"><span>后续条件</span><strong>等待真实物品系统完成</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：构建真实关系拓扑页。
 * @param snapshot 工作台快照。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @returns 页面 HTML。
 */
function buildActorRelationshipsMarkup(
    snapshot: WorkbenchSnapshot,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
): string {
    const actorKey = selectedActor?.actorKey ?? '';
    const graphLinks = snapshot.actorGraph.links.filter((link): boolean => link.source === actorKey || link.target === actorKey);
    const graphNode = snapshot.actorGraph.nodes.find((node): boolean => node.id === actorKey) ?? null;
    const relatedEntries = graphLinks.map((link): MemoryEntry | null => {
        return snapshot.entries.find((entry: MemoryEntry): boolean => entry.entryId === link.entryId) ?? null;
    }).filter(Boolean) as MemoryEntry[];
    const summaryRows = snapshot.summaries.filter((summary: SummarySnapshot): boolean => summary.actorKeys.includes(actorKey)).slice(0, 4);
    const memoryIndex = new Map(selectedActorMemories.map((item: RoleEntryMemory): [string, RoleEntryMemory] => [item.entryId, item]));

    const relationList = relatedEntries.map((entry: MemoryEntry): string => {
        const memoryRow = memoryIndex.get(entry.entryId);
        const typeLabel = typeMap.get(entry.entryType)?.label || entry.entryType || '未分类';
        return `
            <article class="stx-memory-workbench__card" style="padding: 12px;">
                <div class="stx-memory-workbench__panel-title" style="margin-bottom: 4px;">${escapeHtml(entry.title)}</div>
                <div class="stx-memory-workbench__meta" style="margin-bottom: 8px;">${escapeHtml(typeLabel)} · 信号 ${escapeHtml(memoryRow ? `${memoryRow.memoryPercent}%` : '未绑定')}</div>
                <div class="stx-memory-workbench__detail-block" style="margin-bottom: 8px;">${escapeHtml(entry.summary || entry.detail || '暂无内容')}</div>
                <div style="font-size: 11px; display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px dashed var(--mw-line);">
                    <span style="color: var(--mw-muted);">结构化事实：</span>
                    <span style="color: var(--mw-accent-cyan); font-family: monospace; word-break: break-all; white-space: pre-wrap; line-height: 1.4;">${escapeHtml(summarizeDetailPayload(entry.detailPayload))}</span>
                </div>
            </article>
        `;
    }).join('');

    const summaryList = summaryRows.map((summary: SummarySnapshot): string => {
        return `
            <article class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(summary.title || '未命名总结')}</div>
                <div class="stx-memory-workbench__meta">更新时间 ${escapeHtml(formatTimestamp(summary.updatedAt))}</div>
                <div class="stx-memory-workbench__detail-block">${escapeHtml(summary.content || '暂无内容')}</div>
            </article>
        `;
    }).join('');

    return `
        <div class="stx-workbench-topology" style="position: relative; width: 100%; height: 600px; display: flex; overflow: hidden; border: 1px solid var(--mw-line);">
            <div class="stx-workbench-topology__graph" style="position: absolute; inset: 0; width: 100%; height: 100%;">
                <div id="stx-rpg-graph-container" class="stx-workbench-topology__graph-canvas" style="width: 100%; height: 100%; background: var(--mw-bg);">
                    <div class="stx-memory-workbench__empty">关系图加载中…</div>
                </div>
            </div>

            <div class="stx-rpg-rel-header" style="position: absolute; right: 16px; top: 16px; background: rgba(17, 19, 24, 0.7); backdrop-filter: blur(4px); border: 1px solid var(--mw-line); padding: 8px 16px; border-radius: 6px; z-index: 10; text-align: right; pointer-events: none;">
                <div class="stx-memory-workbench__panel-title">节点纠缠拓扑</div>
                <div class="stx-memory-workbench__meta">可拖拽与滚轮缩放</div>
            </div>

            <aside class="stx-workbench-topology__panel" style="position: absolute; left: 16px; top: 16px; bottom: 16px; width: 280px; background: rgba(17, 19, 24, 0.9); backdrop-filter: blur(8px); border: 1px solid var(--mw-line-strong); box-shadow: 4px 0 24px rgba(0,0,0,0.5); z-index: 10; display: flex; flex-direction: column; overflow-y: auto;">
                <div class="stx-memory-workbench__card" style="border: none; border-bottom: 1px solid var(--mw-line); border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">角色属性</div>
                    <div class="stx-memory-workbench__info-list">
                        <div class="stx-memory-workbench__info-row"><span>角色键</span><strong>${escapeHtml(selectedActor?.actorKey ?? '未选择')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>显示名</span><strong>${escapeHtml(selectedActor?.displayName ?? '未命名')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>记忆稳定度</span><strong>${escapeHtml(String(selectedActor?.memoryStat ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>真实关系边数</span><strong>${escapeHtml(String(graphNode?.relationCount ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>记忆绑定数</span><strong>${escapeHtml(String(selectedActorMemories.length))}</strong></div>
                    </div>
                </div>
                <div class="stx-memory-workbench__card" style="border: none; border-bottom: 1px solid var(--mw-line); border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">关联条目</div>
                    <div class="stx-memory-workbench__stack">
                        ${relationList || '<div class="stx-memory-workbench__empty" style="font-size:11px;">无直接关联条目</div>'}
                    </div>
                </div>
                <div class="stx-memory-workbench__card" style="border: none; border-radius: 0;">
                    <div class="stx-memory-workbench__panel-title">最近命中总结</div>
                    <div class="stx-memory-workbench__stack">
                        ${summaryList || '<div class="stx-memory-workbench__empty" style="font-size:11px;">无命中总结</div>'}
                    </div>
                </div>
            </aside>
        </div>
    `;
}

/**
 * 功能：构建角色页整体视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 当前角色记忆绑定。
 * @param typeMap 类型映射。
 * @param entryOptions 绑定下拉选项。
 * @returns 页面 HTML。
 */
export function buildActorsViewMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'actors' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">角色档案</div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-actor"><i class="fa-solid fa-plus"></i> 新建角色</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack">
                    <div class="stx-memory-workbench__list">
                        ${snapshot.actors.length > 0 ? snapshot.actors.map((item: ActorMemoryProfile): string => `
                            <button class="stx-memory-workbench__list-item${item.actorKey === state.selectedActorKey ? ' is-active' : ''}" data-select-actor="${escapeAttr(item.actorKey)}">
                                <h4>${escapeHtml(item.displayName || item.actorKey)}</h4>
                                <div class="stx-memory-workbench__meta">${escapeHtml(item.actorKey)}</div>
                                <div class="stx-memory-workbench__badge-row" style="margin-top:2px;">
                                    <span class="stx-memory-workbench__badge">记忆稳定度 ${item.memoryStat}</span>
                                    <span class="stx-memory-workbench__badge">${snapshot.actorGraph.links.filter((link): boolean => link.source === item.actorKey || link.target === item.actorKey).length} 条真实关系</span>
                                </div>
                            </button>
                        `).join('') : '<div class="stx-memory-workbench__empty">当前聊天还没有任何角色档案。</div>'}
                    </div>
                </div>
                <div class="stx-memory-workbench__editor" style="padding:0; overflow:hidden; display:flex; flex-direction:column;">
                    <div class="stx-memory-workbench__sub-nav">
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'attributes' ? ' is-active' : ''}" data-actor-tab="attributes">
                            基础资料
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'memory' ? ' is-active' : ''}" data-actor-tab="memory">
                            深层记忆
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'items' ? ' is-active' : ''}" data-actor-tab="items">
                            装备终端
                        </button>
                        <button class="stx-memory-workbench__sub-nav-btn${state.currentActorTab === 'relationships' ? ' is-active' : ''}" data-actor-tab="relationships">
                            拓扑节点
                        </button>
                    </div>
                    <div class="stx-memory-workbench__sub-view-container" style="padding:16px; overflow-y:auto;">
                        ${buildActorSubView(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                    </div>
                </div>
            </div>
        </section>
    `;
}
