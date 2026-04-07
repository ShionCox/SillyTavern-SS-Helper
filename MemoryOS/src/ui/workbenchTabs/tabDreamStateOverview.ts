import { escapeHtml } from '../editorShared';
import { resolveDreamWorkbenchText } from '../workbenchLocale';
import { formatTimestamp, truncateText, escapeAttr, type WorkbenchSnapshot } from './shared';
import type { DreamSessionRecord } from '../../services/dream-types';
import type { DreamUiStateSnapshot } from '../dream-ui-state-service';

/**
 * 功能：运行态映射文案。
 */
function resolvePhaseLabel(status?: string, schedulerActive?: boolean): string {
    if (status === 'waiting_approval') return resolveDreamWorkbenchText('pending');
    if (status === 'running') return resolveDreamWorkbenchText('phase_running');
    if (status === 'queued') return resolveDreamWorkbenchText('phase_queued');
    if (status === 'generated') return resolveDreamWorkbenchText('phase_completed');
    if (status === 'approved') return resolveDreamWorkbenchText('phase_completed');
    if (status === 'failed') return resolveDreamWorkbenchText('phase_failed');
    if (status === 'rolled_back') return resolveDreamWorkbenchText('phase_rolled_back');
    if (schedulerActive) return resolveDreamWorkbenchText('phase_running');
    return resolveDreamWorkbenchText('runtime_status_idle_hint');
}

function resolveExecutionModeLabel(mode?: string): string {
    if (mode === 'manual_review') return resolveDreamWorkbenchText('mode_manual_review');
    if (mode === 'silent') return resolveDreamWorkbenchText('mode_silent');
    return '';
}

function resolveUiState(snapshot: WorkbenchSnapshot): DreamUiStateSnapshot | null {
    return snapshot.dreamSnapshot.uiState;
}

function resolveRunProfileLabel(profile?: string): string {
    if (profile === 'auto_light') return resolveDreamWorkbenchText('profile_auto_light');
    if (profile === 'auto_review') return resolveDreamWorkbenchText('profile_auto_review');
    if (profile === 'manual_deep') return resolveDreamWorkbenchText('profile_manual_deep');
    return '';
}

function resolveTriggerLabel(trigger?: string): string {
    if (trigger === 'manual') return '手动';
    if (trigger === 'generation_ended') return '回复结束';
    if (trigger === 'idle') return '空闲触发';
    return '';
}

/**
 * 功能：构建「当前梦境状态」区域标记。
 */
export function buildDreamRuntimeStatusMarkup(snapshot: WorkbenchSnapshot): string {
    const uiState = resolveUiState(snapshot);
    const activeTask = uiState?.activeTask;
    const isActive = Boolean(activeTask?.exists && activeTask.phase && activeTask.phase !== 'completed');

    if (!isActive) return '';

    const phaseText = resolvePhaseLabel(activeTask?.phase);
    const triggerLabel = resolveTriggerLabel(activeTask?.triggerReason);
    const modeLabel = resolveExecutionModeLabel(activeTask?.executionMode);
    const profileLabel = resolveRunProfileLabel(activeTask?.runProfile);
    const startTime = activeTask?.startedAt ? formatTimestamp(activeTask.startedAt) : '';

    return `
        <div class="stx-memory-workbench__card stx-memory-dream__runtime-status" style="border-left:3px solid rgba(100,181,246,.5); margin-bottom:12px;">
            <div class="stx-memory-workbench__split-head">
                <div>
                    <div class="stx-memory-workbench__panel-title">
                        <i class="fa-solid fa-spinner fa-spin" style="margin-right:6px; opacity:.7;"></i>
                        ${escapeHtml(resolveDreamWorkbenchText('runtime_status_title'))}
                    </div>
                </div>
                <span class="stx-memory-workbench__badge">${escapeHtml(phaseText)}</span>
            </div>
            <div class="stx-memory-workbench__info-list stx-memory-workbench__info-list--compact" style="margin-top:8px;">
                ${triggerLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_trigger_label'))}</span><strong>${escapeHtml(triggerLabel)}</strong></div>` : ''}
                ${modeLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_mode_label'))}</span><strong>${escapeHtml(modeLabel)}</strong></div>` : ''}
                ${profileLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_profile_label'))}</span><strong>${escapeHtml(profileLabel)}</strong></div>` : ''}
                ${startTime ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_started_at_label'))}</span><strong>${escapeHtml(startTime)}</strong></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * 功能：构建「待审批梦境」入口区域标记。
 */
export function buildDreamPendingInboxMarkup(snapshot: WorkbenchSnapshot): string {
    const uiState = resolveUiState(snapshot);
    const sessionMap = new Map(snapshot.dreamSnapshot.sessions.map((session: DreamSessionRecord): [string, DreamSessionRecord] => {
        return [String(session.meta?.dreamId ?? '').trim(), session];
    }).filter(([dreamId]: [string, DreamSessionRecord]): boolean => Boolean(dreamId)));
    const pendingSessions = (uiState?.inbox.pendingDreamIds ?? [])
        .map((dreamId: string): DreamSessionRecord | undefined => sessionMap.get(dreamId))
        .filter((session: DreamSessionRecord | undefined): session is DreamSessionRecord => Boolean(session));
    if (pendingSessions.length === 0) return '';

    const cards = pendingSessions.slice(0, 5).map((session) => {
        const meta = session.meta;
        const output = session.output;
        const highlightsCount = output?.highlights.length ?? 0;
        const mutationsCount = output?.proposedMutations.length ?? 0;
        const maintenanceCount = session.maintenanceProposals.filter((p) => p.status === 'pending').length;
        const triggerLabel = resolveTriggerLabel(meta?.triggerReason);
        const modeLabel = resolveExecutionModeLabel(meta?.executionMode);
        const profileLabel = resolveRunProfileLabel(meta?.runProfile);
        const dreamIdShort = String(meta?.dreamId ?? '').split(':').pop()?.slice(0, 12) || '';

        return `
            <article class="stx-memory-dream__session-card stx-memory-dream__compact-card" style="border-left:3px solid rgba(255,152,0,.4);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                    <div class="stx-memory-workbench__panel-title stx-memory-workbench__truncate-line">
                        ${escapeHtml(resolveDreamWorkbenchText('pending_inbox_title'))}
                        <div class="stx-memory-workbench__meta stx-memory-workbench__truncate-id" title="${escapeAttr(meta?.dreamId || '')}" style="margin-top:2px;">${escapeHtml(dreamIdShort)}</div>
                    </div>
                    <span class="stx-memory-workbench__badge is-warn">${escapeHtml(resolveDreamWorkbenchText('pending'))}</span>
                </div>
                <div class="stx-memory-workbench__info-list stx-memory-workbench__info-list--compact" style="margin-bottom:6px;">
                    ${triggerLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}</span><strong>${escapeHtml(triggerLabel)}</strong></div>` : ''}
                    ${modeLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_mode_label'))}</span><strong>${escapeHtml(modeLabel)}</strong></div>` : ''}
                    ${profileLabel ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('runtime_profile_label'))}</span><strong>${escapeHtml(profileLabel)}</strong></div>` : ''}
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('pending_highlights_count'))}</span><strong>${highlightsCount}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('pending_mutations_count'))}</span><strong>${mutationsCount}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('pending_maintenance_count'))}</span><strong>${maintenanceCount}</strong></div>
                    <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('time_label'))}</span><strong>${escapeHtml(formatTimestamp(meta?.createdAt))}</strong></div>
                </div>
                <div class="stx-memory-dream-workbench__action-row" style="display:flex;gap:6px;margin-top:8px;">
                    <button type="button" class="stx-memory-workbench__button" data-action="dream-open-pending-review" data-dream-id="${escapeAttr(meta?.dreamId || '')}">${escapeHtml(resolveDreamWorkbenchText('pending_open_review'))}</button>
                    <button type="button" class="stx-memory-workbench__ghost-btn" data-action="set-dream-subview" data-subview="workbench" data-dream-target-tab="session">${escapeHtml(resolveDreamWorkbenchText('view_detail'))}</button>
                </div>
            </article>
        `;
    }).join('');

    return `
        <div class="stx-memory-workbench__card" style="border-left:3px solid rgba(255,152,0,.4); margin-bottom:12px;">
            <div class="stx-memory-workbench__split-head">
                <div>
                    <div class="stx-memory-workbench__panel-title">
                        <i class="fa-solid fa-inbox" style="margin-right:6px; opacity:.7;"></i>
                        ${escapeHtml(resolveDreamWorkbenchText('pending_inbox_title'))}
                    </div>
                    <div class="stx-memory-workbench__meta">点击进入审核以查看梦境提案详情</div>
                </div>
                <span class="stx-memory-workbench__badge is-warn">${uiState?.inbox.pendingApprovalCount ?? pendingSessions.length} ${escapeHtml(resolveDreamWorkbenchText('pending'))}</span>
            </div>
            <div class="stx-memory-dream__list" style="margin-top:10px;">
                ${cards}
            </div>
        </div>
    `;
}

/**
 * 功能：构建「最近梦境结果」概览区标记（最近完成/失败/回滚）。
 */
export function buildDreamRecentResultsMarkup(snapshot: WorkbenchSnapshot): string {
    const uiState = resolveUiState(snapshot);
    const latestCompleted = uiState?.latestCompleted;
    const latestFailed = uiState?.latestFailed;
    const latestRolledBack = uiState?.latestRolledBack;

    if (!latestCompleted && !latestFailed && !latestRolledBack) return '';

    const items: string[] = [];

    if (latestCompleted) {
        const summaryText = latestCompleted.summaryText || resolveDreamWorkbenchText('silent_completed');
        const profileLabel = resolveRunProfileLabel(latestCompleted.runProfile);
        items.push(`
            <div class="stx-memory-workbench__info-row" style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
                <span><i class="fa-solid fa-check-circle" style="color:#81c784; margin-right:6px;"></i>${escapeHtml(resolveDreamWorkbenchText('recent_completed'))}</span>
                <strong>${escapeHtml(summaryText)}${profileLabel ? ` (${escapeHtml(profileLabel)})` : ''} · ${escapeHtml(formatTimestamp(latestCompleted.completedAt))}</strong>
            </div>
        `);
    }

    if (latestFailed) {
        const reason = latestFailed.reason || resolveDreamWorkbenchText('unknown_reason');
        items.push(`
            <div class="stx-memory-workbench__info-row" style="padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06);">
                <span><i class="fa-solid fa-exclamation-triangle" style="color:#e57373; margin-right:6px;"></i>${escapeHtml(resolveDreamWorkbenchText('recent_failed'))}</span>
                <strong>${escapeHtml(truncateText(reason, 60))} · ${escapeHtml(formatTimestamp(latestFailed.failedAt))}</strong>
            </div>
        `);
    }

    if (latestRolledBack) {
        items.push(`
            <div class="stx-memory-workbench__info-row" style="padding:6px 0;">
                <span><i class="fa-solid fa-undo" style="color:#bdbdbd; margin-right:6px;"></i>${escapeHtml(resolveDreamWorkbenchText('recent_rolled_back'))}</span>
                <strong>${escapeHtml(formatTimestamp(latestRolledBack.rolledBackAt))}</strong>
            </div>
        `);
    }

    return `
        <div class="stx-memory-workbench__card" style="margin-bottom:12px;">
            <div class="stx-memory-workbench__panel-title" style="margin-bottom:8px;">
                <i class="fa-solid fa-history" style="margin-right:6px; opacity:.7;"></i>
                ${escapeHtml(resolveDreamWorkbenchText('recent_results_title'))}
            </div>
            <div class="stx-memory-workbench__info-list">
                ${items.join('')}
            </div>
        </div>
    `;
}
