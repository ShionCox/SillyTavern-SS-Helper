import { escapeHtml } from '../editorShared';
import { escapeAttr, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import type { ActorMemoryProfile, MemoryEntryType, RoleEntryMemory } from '../../types';

/**
 * 功能：构建角色视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前角色。
 * @param selectedActorMemories 角色记忆列表。
 * @param typeMap 类型映射。
 * @param entryOptions 条目选项。
 * @returns 视图 HTML。
 */
export function buildActorsViewMarkup(
    snapshot: WorkbenchSnapshot,
    state: WorkbenchState,
    selectedActor: ActorMemoryProfile | null,
    selectedActorMemories: RoleEntryMemory[],
    typeMap: Map<string, MemoryEntryType>,
    entryOptions: string,
): string {
    const memoryRows = selectedActorMemories.map((item: RoleEntryMemory): string => {
        const entry = snapshot.entries.find((row) => row.entryId === item.entryId);
        const typeLabel = typeMap.get(entry?.entryType ?? '')?.label || entry?.entryType || '类型';
        return `
            <div class="stx-memory-workbench__list-item">
                <h4>${escapeHtml(entry?.title ?? item.entryId)}</h4>
                <div class="stx-memory-workbench__meta">${escapeHtml(typeLabel)} | 记忆度 ${item.memoryPercent}%</div>
                <div class="stx-memory-workbench__badge-row">
                    <span class="stx-memory-workbench__badge">${item.forgotten ? '已遗忘' : '可回忆'}</span>
                </div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button is-danger" data-action="unbind-entry" data-entry-id="${escapeAttr(item.entryId)}">解除绑定</button>
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'actors' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">角色档案 / <span>ACTORS</span></div>
                <div class="stx-memory-workbench__toolbar">
                    <button class="stx-memory-workbench__button" data-action="create-actor">新建角色</button>
                </div>
            </div>
            <div class="stx-memory-workbench__grid">
                <div class="stx-memory-workbench__stack">
                    ${snapshot.actors.map((item: ActorMemoryProfile): string => `
                        <button class="stx-memory-workbench__list-item${item.actorKey === state.selectedActorKey ? ' is-active' : ''}" data-select-actor="${escapeAttr(item.actorKey)}">
                            <h4>${escapeHtml(item.displayName)}</h4>
                            <div class="stx-memory-workbench__meta">${escapeHtml(item.actorKey)}</div>
                            <div class="stx-memory-workbench__badge-row">
                                <span class="stx-memory-workbench__badge">记性 ${item.memoryStat}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>
                <div class="stx-memory-workbench__editor">
                    <label>角色键</label>
                    <input id="stx-memory-actor-key" value="${escapeAttr(selectedActor?.actorKey ?? '')}" placeholder="seraphina" />
                    <label>显示名</label>
                    <input id="stx-memory-actor-label" value="${escapeAttr(selectedActor?.displayName ?? '')}" placeholder="Seraphina" />
                    <label>记性(0-100)</label>
                    <input id="stx-memory-actor-stat" type="number" min="0" max="100" value="${escapeAttr(String(selectedActor?.memoryStat ?? 60))}" />
                    <div class="stx-memory-workbench__toolbar">
                        <button class="stx-memory-workbench__button" data-action="save-actor">保存角色</button>
                    </div>
                    <label style="margin-top:10px;">绑定条目</label>
                    <select id="stx-memory-bind-entry">${entryOptions}</select>
                    <div class="stx-memory-workbench__toolbar">
                        <button class="stx-memory-workbench__button" data-action="bind-entry">绑定到角色</button>
                    </div>
                    <div class="stx-memory-workbench__stack">
                        ${memoryRows || '<div class="stx-memory-workbench__empty">暂无绑定条目</div>'}
                    </div>

                    <div class="stx-rpg-rel-header" style="margin-top:20px; border-top:1px solid var(--mw-line-strong); padding-top:10px;">
                        <div class="stx-memory-workbench__panel-title">节点纠缠拓扑 / SOCIAL LINKS</div>
                        <div class="stx-memory-workbench__toolbar">
                            <button class="stx-memory-workbench__ghost-btn is-active"><i class="fa-solid fa-diagram-project"></i> 可视化拓扑图</button>
                            <button class="stx-memory-workbench__ghost-btn"><i class="fa-solid fa-flag"></i> 势力阵营面板</button>
                        </div>
                    </div>
                    <div id="stx-rpg-graph-container" style="width:100%; height:500px; position:relative; background:rgba(0,0,0,0.4); box-shadow: inset 0 0 60px rgba(0,0,0,0.8); overflow:hidden;">
                        <div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:var(--mw-muted); font-size:12px;">
                            <i class="fa-solid fa-spinner fa-spin"></i> 初始化拓朴引擎...
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}
