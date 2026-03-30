import { escapeHtml } from '../../editorShared';
import { resolveActorWorkbenchText } from '../../workbenchLocale';
import { type WorkbenchSnapshot, type WorkbenchState } from '../shared';
import type { ActorMemoryProfile } from '../../../types';

/**
 * 功能：构建角色关系页签内容。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @param selectedActor 当前选中角色。
 * @returns 关系页签 HTML。
 */
export function buildActorRelationshipsMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState, selectedActor: ActorMemoryProfile | null): string {
    const isHidden = state.currentActorTab !== 'relationships';
    return '<div class="stx-memory-workbench__actor-tab" ' + (isHidden ? 'style="display:none;"' : '') + ' style="padding:0; gap:0;">' +
        '<div class="stx-rpg-rel-header">' +
            `<div class="stx-memory-workbench__panel-title">${escapeHtml(resolveActorWorkbenchText('social_links'))}</div>` +
            '<div class="stx-memory-workbench__toolbar">' +
                `<button class="stx-memory-workbench__ghost-btn is-active"><i class="fa-solid fa-diagram-project"></i> ${escapeHtml(resolveActorWorkbenchText('topology_graph'))}</button>` +
                `<button class="stx-memory-workbench__ghost-btn"><i class="fa-solid fa-flag"></i> ${escapeHtml(resolveActorWorkbenchText('faction_panel'))}</button>` +
            '</div>' +
        '</div>' +
        '<div id="stx-rpg-graph-container" style="flex:1; width:100%; min-height:400px; position:relative; background:rgba(0,0,0,0.4); box-shadow: inset 0 0 60px rgba(0,0,0,0.8); overflow:hidden;">' +
            '<div style="position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:var(--mw-muted); font-size:12px;">' +
                `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(resolveActorWorkbenchText('topology_initializing'))}` +
            '</div>' +
        '</div>' +
    '</div>';
}
