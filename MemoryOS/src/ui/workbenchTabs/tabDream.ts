import { formatTimestamp, truncateText, type WorkbenchSnapshot, type WorkbenchState } from './shared';
import { escapeHtml } from '../editorShared';
import {
    resolveDreamWorkbenchText,
    formatDreamWorkbenchText,
    resolveDreamProposalTypeLabel,
    resolveDreamMutationTypeLabel,
    localizeDreamDisplayText,
    resolveDreamMaintenanceDisplay,
} from '../workbenchLocale';
import { escapeAttr } from './shared';
import type { DreamMaintenanceProposalRecord, DreamQualityReport, DreamSchedulerStateRecord, DreamSessionRecord } from '../../services/dream-types';
import {
    isDreamMaintenancePending,
    resolveDreamMaintenanceEffectiveStatus,
} from '../../services/dream-maintenance-state';
import { readMemoryOSSettings } from '../../settings/store';
import type { ActorMemoryProfile, MemoryEntry } from '../../types';

export function resolveDreamTriggerReasonLabel(triggerReason: string | null | undefined): string {
    if (triggerReason === 'generation_ended') {
        return '回复结束';
    }
    if (triggerReason === 'idle') {
        return '空闲触发';
    }
    if (triggerReason === 'manual') {
        return '手动';
    }
    return resolveDreamWorkbenchText('unknown_trigger') !== 'unknown_trigger' ? resolveDreamWorkbenchText('unknown_trigger') : '未知';
}

export function resolveDreamMaintenanceStatusLabel(status: string | null | undefined): string {
    if (status === 'pending') {
        return '待处理';
    }
    if (status === 'applied') {
        return '已应用';
    }
    if (status === 'rejected') {
        return '已拒绝';
    }
    if (status === 'rolled_back') {
        return '已回滚';
    }
    return resolveDreamWorkbenchText(status || '') !== status ? resolveDreamWorkbenchText(status || '') : '未知';
}

export function statusBadgeClass(status: string): string {
    if (status === 'approved') return 'stx-memory-workbench__badge stx-memory-dream-workbench__status-badge is-success';
    if (status === 'rejected') return 'stx-memory-workbench__badge stx-memory-dream-workbench__status-badge is-warn';
    if (status === 'rolled_back') return 'stx-memory-workbench__badge stx-memory-dream-workbench__status-badge is-warn';
    if (status === 'pending' || status === 'generated' || status === 'queued') return 'stx-memory-workbench__badge stx-memory-dream-workbench__status-badge is-warn';
    return 'stx-memory-workbench__badge stx-memory-dream-workbench__status-badge';
}

function renderDreamMetaId(value: string | null | undefined, extraClass = ''): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '-';
    }
    const className = extraClass ? `stx-memory-workbench__truncate-id ${extraClass}` : 'stx-memory-workbench__truncate-id';
    return `<span class="${className}" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`;
}

function renderDreamKeyMeta(label: string, value: string | null | undefined): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    return `<div class="stx-memory-dream-workbench__secondary">${escapeHtml(label)}：${renderDreamMetaId(text, 'stx-memory-dream-workbench__inline-id')}</div>`;
}

function renderDreamStackedMetaId(label: string, value: string | null | undefined): string {
    const text = String(value ?? '').trim();
    if (!text) {
        return '';
    }
    const shortened = truncateText(text, 36);
    return `
        <div class="stx-memory-dream-workbench__meta-id-row">
            <span class="stx-memory-dream-workbench__secondary">${escapeHtml(label)}：</span>
            <span class="stx-memory-workbench__truncate-id stx-memory-dream-workbench__full-id" title="${escapeAttr(text)}">${escapeHtml(shortened)}</span>
        </div>
    `;
}

function toRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

function buildDreamEntryTitleMap(entries: MemoryEntry[]): Map<string, string> {
    const titleMap = new Map<string, string>();
    entries.forEach((entry: MemoryEntry): void => {
        const entryId = String(entry?.entryId ?? '').trim();
        const title = String(entry?.title ?? '').trim();
        if (!entryId || !title) {
            return;
        }
        titleMap.set(entryId, title);
    });
    return titleMap;
}

function buildDreamActorNameMap(actors: ActorMemoryProfile[]): Map<string, string> {
    const actorMap = new Map<string, string>();
    actors.forEach((actor: ActorMemoryProfile): void => {
        const actorKey = String(actor?.actorKey ?? '').trim();
        const displayName = String(actor?.displayName ?? '').trim();
        if (!actorKey || !displayName) {
            return;
        }
        actorMap.set(actorKey, displayName);
    });
    return actorMap;
}

function renderDreamLabelBadges(values: string[], limit = 5): string {
    const normalized = values.map((item: string): string => String(item ?? '').trim()).filter(Boolean);
    if (normalized.length <= 0) {
        return '';
    }
    const visible = normalized.slice(0, limit).map((item: string): string => {
        return `<span class="stx-memory-workbench__badge stx-memory-dream-workbench__stacked-badge" title="${escapeAttr(item)}">${escapeHtml(item)}</span>`;
    }).join('');
    const more = normalized.length > limit ? `<span class="stx-memory-workbench__badge">+${String(normalized.length - limit)}</span>` : '';
    return `${visible}${more}`;
}

function resolveDreamEntryLabels(entryIds: string[], entryTitleMap: Map<string, string>): string[] {
    return entryIds
        .map((entryId: string): string => String(entryId ?? '').trim())
        .filter(Boolean)
        .map((entryId: string): string => entryTitleMap.get(entryId) || entryId);
}

function resolveDreamActorLabels(actorKeys: unknown, actorNameMap: Map<string, string>): string[] {
    if (!Array.isArray(actorKeys)) {
        return [];
    }
    return actorKeys
        .map((actorKey: unknown): string => String(actorKey ?? '').trim())
        .filter(Boolean)
        .map((actorKey: string): string => actorNameMap.get(actorKey) || actorKey);
}

function countPendingMaintenanceForSession(session: DreamSessionRecord): number {
    return session.maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
        return isDreamMaintenancePending(proposal, session);
    }).length;
}

function canRollbackDreamSession(session: DreamSessionRecord): boolean {
    const status = String(session.meta?.status ?? '').trim();
    return Boolean(session.rollback) && (status === 'approved' || status === 'rolled_back');
}

function shouldDisplayDreamSession(session: DreamSessionRecord): boolean {
    const status = String(session.meta?.status ?? '').trim();
    if (status !== 'failed') {
        return true;
    }
    return Boolean(
        session.output
        || session.rollback
        || session.approval
        || session.qualityReport
        || session.maintenanceProposals.length > 0,
    );
}

export function buildDreamViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const isDetail = state.dreamSubView === 'workbench';
    const headMarkup = `
        <div class="stx-memory-workbench__view-head">
            <div>
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveDreamWorkbenchText('section_title'))}</div>
                <div class="stx-memory-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('section_desc'))}</div>
            </div>
            <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                <div class="stx-memory-workbench__checkbox-group" style="gap:2px; font-weight:700; background:rgba(0,0,0,0.4); border-radius:10px; border:1px solid rgba(255,255,255,0.06); padding:2px;">
                    <button type="button" class="stx-memory-workbench__ghost-btn ${!isDetail ? 'is-active' : ''}" data-action="set-dream-subview" data-subview="overview" style="padding:4px 12px;">总览概貌</button>
                    <button type="button" class="stx-memory-workbench__ghost-btn ${isDetail ? 'is-active' : ''}" data-action="set-dream-subview" data-subview="workbench" style="padding:4px 12px;">独立控制台</button>
                </div>
            </div>
        </div>
    `;

    return headMarkup + (isDetail ? buildDreamDetailWorkbenchMarkup(snapshot, state) : buildDreamOverviewMarkup(snapshot, state));
}

function buildDreamOverviewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const { sessions, maintenanceProposals, qualityReports, schedulerState } = snapshot.dreamSnapshot;
    const entryTitleMap = buildDreamEntryTitleMap(snapshot.entries);
    const actorNameMap = buildDreamActorNameMap(snapshot.actors);
    const latestSession = sessions[0];
    const latestSessionHighlight = latestSession?.output?.highlights.join('；') || latestSession?.output?.narrative.slice(0, 150) || resolveDreamWorkbenchText('no_recent_activity');
    const latestQualityReport = qualityReports[0];

    const sessionMap = new Map(sessions.map((session: DreamSessionRecord): [string, DreamSessionRecord] => {
        return [String(session.meta?.dreamId ?? ''), session];
    }).filter(([dreamId]: [string, DreamSessionRecord]): boolean => Boolean(dreamId)));
    const pendingMaintenance = maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
        return isDreamMaintenancePending(proposal, sessionMap.get(proposal.dreamId));
    });
    const queuedSessionCount = sessions.filter((s) => s.meta?.status === 'queued').length;
    const runningSessionCount = sessions.filter((s) => s.meta?.status === 'generated').length;

    let schedulerReasonText = resolveDreamWorkbenchText('unknown_reason');
    if (schedulerState?.lastDecision) {
        if (schedulerState.lastDecision.shouldTrigger) {
            schedulerReasonText = resolveDreamWorkbenchText('eligible');
        } else if (schedulerState.lastDecision.blockedBy && schedulerState.lastDecision.blockedBy.length > 0) {
            schedulerReasonText = schedulerState.lastDecision.blockedBy.join('、');
        }
    }
    let schedulerBlockedText = resolveDreamWorkbenchText('no_block');
    if (schedulerState?.lastDecision && !schedulerState.lastDecision.shouldTrigger && schedulerState.lastDecision.blockedBy && schedulerState.lastDecision.blockedBy.length > 0) {
        schedulerBlockedText = schedulerState.lastDecision.blockedBy.join('、');
    }

    const recentSessionMarkup = sessions.slice(0, 5).map((session, index, arr) => `
        <article class="stx-memory-dream__session-card stx-memory-dream__compact-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                <div class="stx-memory-workbench__panel-title stx-memory-workbench__truncate-line">
                    ${escapeHtml(resolveDreamWorkbenchText('dream_record'))} - ${escapeHtml(resolveDreamTriggerReasonLabel(session.meta?.triggerReason))}
                    <div class="stx-memory-workbench__meta stx-memory-workbench__truncate-id" title="${escapeHtml(session.meta?.dreamId || '')}" style="margin-top:2px;">${escapeHtml(session.meta?.dreamId || '')}</div>
                </div>
                <span class="stx-memory-workbench__badge ${session.meta?.status === 'approved' ? 'is-success' : session.meta?.status === 'rolled_back' ? 'is-warn' : ''}">${escapeHtml(resolveDreamWorkbenchText(session.meta?.status || ''))}</span>
            </div>
            <div class="stx-memory-workbench__info-list stx-memory-workbench__info-list--compact" style="margin-bottom:8px;">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('quality_score'))}</span><strong>${escapeHtml(session.qualityReport?.qualityScore ? session.qualityReport.qualityScore.toFixed(2) : resolveDreamWorkbenchText('no_data'))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('maintenance_applied'))}</span><strong>${escapeHtml(String(session.maintenanceProposals.filter((p) => p.status === 'applied').length))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('maintenance_pending'))}</span><strong>${escapeHtml(String(countPendingMaintenanceForSession(session)))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('time_label'))}</span><strong>${escapeHtml(formatTimestamp(session.meta?.createdAt))}</strong></div>
            </div>
            <div class="stx-memory-workbench__meta stx-memory-workbench__truncate-line" style="--lines:3;">${escapeHtml(session.output?.highlights.join('；') || session.output?.narrative.slice(0, 150) || resolveDreamWorkbenchText('no_recent_activity'))}</div>
            ${index < arr.length - 1 ? '<hr class="stx-memory-dream__divider">' : ''}
        </article>
    `).join('');

    const pendingMaintenanceMarkup = pendingMaintenance.slice(0, 5).map((proposal, index, arr) => `
        <article class="stx-memory-dream__queue-card stx-memory-dream__compact-card">
            ${((): string => {
                const payload = toRecord(proposal.payload);
                const display = resolveDreamMaintenanceDisplay({
                    proposalType: proposal.proposalType,
                    preview: proposal.preview,
                    reason: proposal.reason,
                    payload: {
                        ...payload,
                        primaryEntryLabel: entryTitleMap.get(String(payload.primaryEntryId ?? '').trim()) || '',
                        entryLabel: entryTitleMap.get(String(payload.entryId ?? '').trim()) || '',
                        relationLabel: localizeDreamDisplayText(proposal.preview),
                    },
                    sourceEntryLabels: resolveDreamEntryLabels(proposal.sourceEntryIds, entryTitleMap),
                    actorLabels: resolveDreamActorLabels(payload.participants, actorNameMap),
                });
                const impactMarkup = display.impactItems.length > 0
                    ? renderDreamLabelBadges(display.impactItems, 3)
                    : (display.impactText ? `<span class="stx-memory-workbench__meta">${escapeHtml(truncateText(display.impactText, 72))}</span>` : '');
                return `
            <div class="stx-memory-dream-workbench__card-head stx-memory-dream-workbench__card-head--compact">
                <div class="stx-memory-dream-workbench__title-block stx-memory-dream-workbench__title-block--fixed">
                    <div class="stx-memory-workbench__panel-title stx-memory-dream-workbench__title-clamp-2" title="${escapeHtml(display.title)}">${escapeHtml(display.title)}</div>
                </div>
                <span class="stx-memory-workbench__badge ${proposal.status === 'pending' ? 'is-warn' : ''}" style="flex-shrink:0;">${escapeHtml(resolveDreamMaintenanceStatusLabel(proposal.status))}</span>
            </div>
            <div class="stx-memory-dream-workbench__hint stx-memory-dream-workbench__hint--summary">${escapeHtml(display.summary)}</div>
            ${impactMarkup ? `<div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid" style="margin-bottom:8px;"><span class="stx-memory-dream-workbench__secondary">${escapeHtml(display.impactLabel)}：</span>${impactMarkup}</div>` : ''}
            <div class="stx-memory-dream-workbench__meta" style="margin-top:8px;">批准后：${escapeHtml(display.resultHint)}</div>
            <div class="stx-memory-dream-workbench__card-footer">
                <div class="stx-memory-dream-workbench__card-footer-meta">
                    <div class="stx-memory-dream-workbench__secondary">维护类型：${escapeHtml(resolveDreamProposalTypeLabel(proposal.proposalType))} / 系统判断：${escapeHtml(proposal.confidence.toFixed(2))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(formatTimestamp(proposal.createdAt))}</div>
                    ${renderDreamStackedMetaId(resolveDreamWorkbenchText('proposal_key_label'), proposal.proposalId)}
                    ${renderDreamStackedMetaId(resolveDreamWorkbenchText('dream_short'), proposal.dreamId)}
                </div>
                <div class="stx-memory-dream-workbench__action-row stx-memory-dream-workbench__action-row--bottom">
                    <button type="button" class="stx-memory-workbench__button" data-action="dream-workbench-approve-maintenance" data-proposal-id="${escapeAttr(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('approve_apply'))}</button>
                    <button type="button" class="stx-memory-workbench__ghost-btn stx-btn-danger" data-action="dream-workbench-reject-maintenance" data-proposal-id="${escapeAttr(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('reject'))}</button>
                    <button type="button" class="stx-memory-workbench__ghost-btn" data-action="set-dream-subview" data-subview="workbench" data-dream-target-tab="maintenance">${escapeHtml(resolveDreamWorkbenchText('open_maintenance_tab'))}</button>
                </div>
            </div>`;
            })()}
            ${index < arr.length - 1 ? '<hr class="stx-memory-dream__divider">' : ''}
        </article>
    `).join('');

    return `
        <div class="stx-memory-dream" style="margin-top:14px;">
            <div class="stx-memory-workbench__card stx-memory-dream__hero">
                    <div class="stx-memory-workbench__split-head">
                        <div>
                            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveDreamWorkbenchText('ops_overview'))}</div>
                            <div class="stx-memory-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('ops_overview_desc'))}</div>
                        </div>
                        <div class="stx-memory-workbench__badge-row">
                            <span class="stx-memory-workbench__badge">${escapeHtml(schedulerState?.active ? resolveDreamWorkbenchText('runtime_busy') : resolveDreamWorkbenchText('runtime_idle'))}</span>
                            <span class="stx-memory-workbench__badge">${escapeHtml(latestSession?.output?.promptInfo?.stylePreset || resolveDreamWorkbenchText('style_unrecorded'))}</span>
                        </div>
                    </div>
                    <div class="stx-memory-dream__metric-strip">
                        <article class="stx-memory-dream__metric-card">
                            <span>${escapeHtml(resolveDreamWorkbenchText('session_metric'))}</span>
                            <strong>${escapeHtml(String(sessions.length))}</strong>
                            <small>${escapeHtml(resolveDreamWorkbenchText('recent_12_sessions'))}</small>
                        </article>
                        <article class="stx-memory-dream__metric-card">
                            <span>${escapeHtml(resolveDreamWorkbenchText('pending_maintenance_metric'))}</span>
                            <strong>${escapeHtml(String(pendingMaintenance.length))}</strong>
                            <small>${escapeHtml(resolveDreamWorkbenchText('waiting_review_or_auto_apply'))}</small>
                        </article>
                        <article class="stx-memory-dream__metric-card">
                            <span>${escapeHtml(resolveDreamWorkbenchText('active_scheduler_metric'))}</span>
                            <strong>${escapeHtml(String(schedulerState?.queuedJobCount ?? 0))}</strong>
                            <small>${escapeHtml(formatDreamWorkbenchText('queue_running_summary', { queued: queuedSessionCount, running: runningSessionCount }))}</small>
                        </article>
                        <article class="stx-memory-dream__metric-card">
                            <span>${escapeHtml(resolveDreamWorkbenchText('quality_report_metric'))}</span>
                            <strong>${escapeHtml(String(snapshot.dreamSnapshot.qualityReports.length))}</strong>
                            <small>${escapeHtml(resolveDreamWorkbenchText('quality_score_latest'))} ${escapeHtml(latestQualityReport ? latestQualityReport.qualityScore.toFixed(2) : resolveDreamWorkbenchText('no_data'))}</small>
                        </article>
                    </div>
                    <div class="stx-memory-workbench__info-list stx-memory-workbench__info-list--triple">
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('latest_trigger'))}</span><strong>${escapeHtml(resolveDreamTriggerReasonLabel(schedulerState?.lastTriggerSource))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('last_completed'))}</span><strong>${escapeHtml(formatTimestamp(schedulerState?.lastCompletedAt))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('blocked_reason'))}</span><strong>${escapeHtml(schedulerBlockedText)}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('prompt_version'))}</span><strong>${escapeHtml(latestSession?.output?.promptInfo?.promptVersion || '未记录')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('latest_session'))}</span><strong>${escapeHtml(resolveDreamWorkbenchText(latestSession?.meta?.status || '') === (latestSession?.meta?.status || '') ? (latestSession?.meta?.status || resolveDreamWorkbenchText('no_data')) : resolveDreamWorkbenchText(latestSession?.meta?.status || ''))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('dream_echo'))}</span><strong>${escapeHtml(truncateText(latestSessionHighlight, 56))}</strong></div>
                    </div>
                </div>
                <div class="stx-memory-dream__grid">
                    <div class="stx-memory-workbench__stack">
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__split-head">
                                <div>
                                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveDreamWorkbenchText('recent_sessions_title'))}</div>
                                    <div class="stx-memory-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('recent_sessions_desc'))}</div>
                                </div>
                                <span class="stx-memory-workbench__badge">${escapeHtml(String(sessions.length))} ${escapeHtml(resolveDreamWorkbenchText('item_count_suffix'))}</span>
                            </div>
                            <div class="stx-memory-dream__list">
                                ${recentSessionMarkup || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveDreamWorkbenchText('no_dream_session'))}</div>`}
                            </div>
                        </div>
                    </div>
                    <div class="stx-memory-workbench__stack">
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__split-head">
                                <div>
                                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveDreamWorkbenchText('maintenance_queue_title'))}</div>
                                    <div class="stx-memory-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('maintenance_queue_desc'))}</div>
                                </div>
                                <span class="stx-memory-workbench__badge">${escapeHtml(String(pendingMaintenance.length))} ${escapeHtml(resolveDreamWorkbenchText('maintenance_pending'))}</span>
                            </div>
                            <div class="stx-memory-dream__list">
                                ${pendingMaintenanceMarkup || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveDreamWorkbenchText('no_pending_maintenance'))}</div>`}
                            </div>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveDreamWorkbenchText('scheduler_quality_title'))}</div>
                            <div class="stx-memory-workbench__info-list">
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('scheduler_status'))}</span><strong>${escapeHtml(schedulerState?.active ? resolveDreamWorkbenchText('runtime_busy') : resolveDreamWorkbenchText('runtime_idle'))}</strong></div>
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('recent_eligibility'))}</span><strong>${escapeHtml(schedulerReasonText)}</strong></div>
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('daily_count'))}</span><strong>${escapeHtml(String(schedulerState?.dailyRunCount ?? 0))}</strong></div>
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('last_triggered'))}</span><strong>${escapeHtml(formatTimestamp(schedulerState?.lastTriggeredAt))}</strong></div>
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('latest_quality_warning'))}</span><strong>${escapeHtml(latestQualityReport?.warnings?.[0] || resolveDreamWorkbenchText('no_data'))}</strong></div>
                                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveDreamWorkbenchText('forced_review'))}</span><strong>${escapeHtml(String(latestQualityReport?.forcedReviewMutationIds.length ?? 0))} ${escapeHtml(resolveDreamWorkbenchText('item_count_suffix'))}</strong></div>
                            </div>
                            <div class="stx-memory-workbench__badge-row">
                                ${(latestQualityReport?.warnings ?? []).slice(0, 4).map((warning) => `<span class="stx-memory-workbench__badge is-warn">${escapeHtml(truncateText(warning, 40))}</span>`).join('') || `<span class="stx-memory-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('no_block_warning'))}</span>`}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
    `;
}

function buildDreamDetailWorkbenchMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const { sessions, maintenanceProposals: proposals, qualityReports: reports, schedulerState } = snapshot.dreamSnapshot;
    const visibleSessions = sessions.filter((session: DreamSessionRecord): boolean => shouldDisplayDreamSession(session));
    const entryTitleMap = buildDreamEntryTitleMap(snapshot.entries);
    const actorNameMap = buildDreamActorNameMap(snapshot.actors);
    const activeTab = state.dreamWorkbenchTab || 'session';
    const sessionMap = new Map(visibleSessions.map((session: DreamSessionRecord): [string, DreamSessionRecord] => {
        return [String(session.meta?.dreamId ?? ''), session];
    }).filter(([dreamId]: [string, DreamSessionRecord]): boolean => Boolean(dreamId)));
    
const approvedSessions = visibleSessions.filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved').length;
                    const pendingSessions = visibleSessions.filter((item: DreamSessionRecord): boolean => item.approval?.status === 'pending').length;
                    const pendingMaintenance = proposals.filter((item: DreamMaintenanceProposalRecord): boolean => {
                        return isDreamMaintenancePending(item, sessionMap.get(item.dreamId));
                    }).length;
                    const appliedMaintenance = proposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'applied').length;
                    const rolledBackSessions = visibleSessions.filter((item: DreamSessionRecord): boolean => item.meta?.status === 'rolled_back').length;

                    const tabSessionActive = activeTab === 'session' ? ' is-active' : '';
                    const tabDiagnosticsActive = activeTab === 'diagnostics' ? ' is-active' : '';
                    const tabMaintenanceActive = activeTab === 'maintenance' ? ' is-active' : '';
                    const tabAppliedActive = activeTab === 'applied' ? ' is-active' : '';
                    const tabRollbackActive = activeTab === 'rollback' ? ' is-active' : '';

                    return `
                        <div class="stx-memory-dream-workbench">
                            <div class="stx-memory-dream-workbench__toolbar">
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('pipeline_title'))}</div>
                                <div style="display:flex;gap:8px;">
                                    <button type="button" class="stx-memory-workbench__ghost-btn" data-action="dream-workbench-refresh">${escapeHtml(resolveDreamWorkbenchText('refresh'))}</button>
                                    <button type="button" class="stx-memory-workbench__ghost-btn stx-btn-danger" data-action="dream-workbench-clear-all">${escapeHtml(resolveDreamWorkbenchText('clear_all_dream_records'))}</button>
                                    <button type="button" class="stx-memory-workbench__button" data-action="dream-workbench-manual-dream">${escapeHtml(resolveDreamWorkbenchText('manual_dream'))}</button>
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__summary">
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('session_count'))}</div><div class="stx-memory-dream-workbench__title">${String(sessions.length)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('approved_count'))}</div><div class="stx-memory-dream-workbench__title">${String(approvedSessions)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('pending_review_count'))}</div><div class="stx-memory-dream-workbench__title">${String(pendingSessions)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('maintenance_pending_count'))}</div><div class="stx-memory-dream-workbench__title">${String(pendingMaintenance)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('maintenance_applied_count'))}</div><div class="stx-memory-dream-workbench__title">${String(appliedMaintenance)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('scheduler_short'))}</div><div class="stx-memory-dream-workbench__title">${schedulerState?.active ? escapeHtml(resolveDreamWorkbenchText('runtime_busy')) : escapeHtml(schedulerState?.lastDecision?.blockedBy?.[0] || resolveDreamWorkbenchText('runtime_idle'))}</div></div>
                            </div>
                            <div class="stx-memory-dream-workbench__tabs">
                                <button type="button" class="stx-memory-dream-workbench__tab${tabSessionActive}" data-action="set-dream-workbench-tab" data-tab="session">${escapeHtml(resolveDreamWorkbenchText('session_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabDiagnosticsActive}" data-action="set-dream-workbench-tab" data-tab="diagnostics">${escapeHtml(resolveDreamWorkbenchText('diagnostics_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabMaintenanceActive}" data-action="set-dream-workbench-tab" data-tab="maintenance">${escapeHtml(resolveDreamWorkbenchText('maintenance_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabAppliedActive}" data-action="set-dream-workbench-tab" data-tab="applied">${escapeHtml(resolveDreamWorkbenchText('applied_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabRollbackActive}" data-action="set-dream-workbench-tab" data-tab="rollback">${escapeHtml(resolveDreamWorkbenchText('rollback_tab'))}</button>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabSessionActive}" data-dream-workbench-panel="session">
                                <div class="stx-memory-dream-workbench__list">${visibleSessions.map((session: DreamSessionRecord): string => renderSessionCard(session)).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_dream_session'))}</div>`}</div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabDiagnosticsActive}" data-dream-workbench-panel="diagnostics">
                                <div class="stx-memory-dream-workbench__card">
                                    <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('scheduler_status'))}</div>
                                    ${renderSchedulerInfo(schedulerState)}
                                </div>
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('quality_report_metric'))}</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${reports.map((report: DreamQualityReport): string => renderQualityCard(report)).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_quality_report'))}</div>`}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabMaintenanceActive}" data-dream-workbench-panel="maintenance">
                                <div class="stx-memory-dream-workbench__list">
                                    ${proposals.map((proposal: DreamMaintenanceProposalRecord): string => renderMaintenanceCard(proposal, sessionMap.get(proposal.dreamId), entryTitleMap, actorNameMap)).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_maintenance_proposal'))}</div>`}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabAppliedActive}" data-dream-workbench-panel="applied">
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('applied_dream_changes'))} (${String(approvedSessions)})</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${visibleSessions
                                        .filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved' && item.rollback != null)
                                        .map((session: DreamSessionRecord): string => {
                                            const m = session.meta!;
                                            const snapshot = session.rollback!;
                                            const beforeIds = new Set(snapshot.before.entries.map((e) => e.entryId));
                                            const afterIds = new Set((snapshot.after?.entries ?? []).map((e) => e.entryId));
                                            const createdIds = [...afterIds].filter((id) => !beforeIds.has(id));
                                            const patchedIds = [...afterIds].filter((id) => beforeIds.has(id));
                                            const relBefore = snapshot.before.relationships.length;
                                            const relAfter = (snapshot.after?.relationships ?? []).length;
                                            const entryDiffRows = (snapshot.after?.entries ?? [])
                                                .map((afterEntry) => {
                                                    const beforeEntry = snapshot.before.entries.find((e) => e.entryId === afterEntry.entryId);
                                                    if (!beforeEntry) {
                                                    return `<div class="stx-memory-dream-workbench__mutation-row">
                                                            <span style="color:#81c784;">+${escapeHtml(resolveDreamWorkbenchText('created_entry_short'))}</span>
                                                            <span style="flex:1">${escapeHtml(afterEntry.title)}</span>
                                                            <span style="opacity:.6">${escapeHtml(afterEntry.entryType)}</span>
                                                        </div>`;
                                                    }
                                                    const changes: string[] = [];
                                                    if (beforeEntry.summary !== afterEntry.summary) changes.push(resolveDreamWorkbenchText('change_fields_summary'));
                                                    if (beforeEntry.detail !== afterEntry.detail) changes.push(resolveDreamWorkbenchText('change_fields_detail'));
                                                    if (JSON.stringify(beforeEntry.tags) !== JSON.stringify(afterEntry.tags)) changes.push(resolveDreamWorkbenchText('change_fields_tags'));
                                                    if (JSON.stringify(beforeEntry.detailPayload) !== JSON.stringify(afterEntry.detailPayload)) changes.push(resolveDreamWorkbenchText('change_fields_detail_payload'));
                                                    if (changes.length <= 0) return '';
                                                    return `<div class="stx-memory-dream-workbench__mutation-row">
                                                        <span style="color:#64b5f6;">~${escapeHtml(resolveDreamWorkbenchText('updated_entry_short'))}</span>
                                                        <span style="flex:1">${escapeHtml(afterEntry.title)}</span>
                                                        <span style="opacity:.6">${escapeHtml(changes.join(', '))}</span>
                                                    </div>`;
                                                }).filter(Boolean).join('');
                                            const relDiffRows = (snapshot.after?.relationships ?? [])
                                                .map((afterRel) => {
                                                    const beforeRel = snapshot.before.relationships.find((r) => r.relationshipId === afterRel.relationshipId);
                                                    if (!beforeRel) return '';
                                                    const changes: string[] = [];
                                                    if (beforeRel.trust !== afterRel.trust) changes.push(`trust ${beforeRel.trust}→${afterRel.trust}`);
                                                    if (beforeRel.affection !== afterRel.affection) changes.push(`affection ${beforeRel.affection}→${afterRel.affection}`);
                                                    if (beforeRel.tension !== afterRel.tension) changes.push(`tension ${beforeRel.tension}→${afterRel.tension}`);
                                                    if (beforeRel.summary !== afterRel.summary) changes.push(resolveDreamWorkbenchText('change_fields_summary'));
                                                    if (changes.length <= 0) return '';
                                                    return `<div class="stx-memory-dream-workbench__mutation-row">
                                                        <span style="color:#ffb74d;">~${escapeHtml(resolveDreamWorkbenchText('relationship_changed_short'))}</span>
                                                        <span style="flex:1">${escapeHtml(afterRel.relationTag || afterRel.relationshipId)}</span>
                                                        <span style="opacity:.6">${escapeHtml(changes.join(', '))}</span>
                                                    </div>`;
                                                }).filter(Boolean).join('');
                                            return `<article class="stx-memory-dream-workbench__card stx-memory-dream-workbench__card--applied">
                                                <div class="stx-memory-dream-workbench__card-head">
                                                    <div class="stx-memory-dream-workbench__title-block">
                                                        <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('applied_dream_changes'))}</div>
                                                        ${renderDreamKeyMeta(resolveDreamWorkbenchText('id_label'), m.dreamId)}
                                                    </div>
                                                    <span class="${statusBadgeClass('approved')}">${escapeHtml(resolveDreamWorkbenchText('applied_status'))}</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                                                    ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerReasonLabel(m.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(new Date(m.createdAt).toLocaleString('zh-CN'))}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('added_entries'))}：${String(createdIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('modified_entries'))}：${String(patchedIds.length)}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('relationship_changes'))}：${String(relBefore)}→${String(relAfter)}
                                                </div>
                                                ${entryDiffRows || relDiffRows ? `<div style="margin-top:8px;">${entryDiffRows}${relDiffRows}</div>` : `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_change_record'))}</div>`}
                                            </article>`;
                                        }).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_applied_changes'))}</div>`}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabRollbackActive}" data-dream-workbench-panel="rollback">
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('rollbackable_sessions'))} (${String(approvedSessions + rolledBackSessions)})</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${visibleSessions
                                        .filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved' || item.meta?.status === 'rolled_back')
                                        .map((session: DreamSessionRecord): string => {
                                            const m = session.meta;
                                            const isRolledBack = m?.status === 'rolled_back';
                                            return `<article class="stx-memory-dream-workbench__card stx-memory-dream-workbench__card--rollback">
                                                <div class="stx-memory-dream-workbench__card-head">
                                                    <div class="stx-memory-dream-workbench__title-block">
                                                        <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('rollbackable_sessions'))}</div>
                                                        ${renderDreamKeyMeta(resolveDreamWorkbenchText('id_label'), m?.dreamId || '')}
                                                    </div>
                                                    <span class="${statusBadgeClass(m?.status || '')}">${escapeHtml(resolveDreamWorkbenchText(m?.status || '') === (m?.status || '') ? (m?.status || '') : resolveDreamWorkbenchText(m?.status || ''))}</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                                                    ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerReasonLabel(m?.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(m ? new Date(m.createdAt).toLocaleString('zh-CN') : '-')}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('affected_entries'))}：${String(session.rollbackMetadata?.affectedEntryIds?.length ?? 0)}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('affected_relationships'))}：${String(session.rollbackMetadata?.affectedRelationshipIds?.length ?? 0)}
                                                </div>
                                                ${!isRolledBack
                                                    ? `<div class="stx-memory-dream-workbench__action-row"><button type="button" class="stx-memory-workbench__ghost-btn stx-btn-danger" data-action="dream-workbench-rollback" data-dream-id="${escapeHtml(m?.dreamId || '')}">${escapeHtml(resolveDreamWorkbenchText('perform_rollback'))}</button></div>`
                                                    : `<div class="stx-memory-dream-workbench__meta" style="margin-top:4px;">${escapeHtml(resolveDreamWorkbenchText('rollback_at'))}：${escapeHtml(session.rollbackMetadata?.rolledBackAt ? new Date(session.rollbackMetadata.rolledBackAt).toLocaleString('zh-CN') : '-')}</div>`
                                                }
                                            </article>`;
                                        }).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_rollback_session'))}</div>`}
                                </div>
                            </div>
                        </div>
                    `;

                    

}

function renderSessionCard(session: DreamSessionRecord): string {
    const meta = session.meta;
    const output = session.output;
    const quality = session.qualityReport;
    const approval = session.approval;
    const promptInfo = output?.promptInfo;
    const applyResult = session.rollbackMetadata?.applyResult;
    const pendingMaintenance = countPendingMaintenanceForSession(session);
    const appliedMaintenance = session.maintenanceProposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'applied').length;
    const status = meta?.status || 'unknown';
    const canRollback = canRollbackDreamSession(session);
    const explainCoveredCount = (output?.proposedMutations ?? []).filter((mutation) => {
        return mutation.explain && mutation.explain.sourceEntryIds.length > 0 && mutation.explain.explanationSteps.length > 0;
    }).length;
    const mutationHtml = (output?.proposedMutations ?? []).map((m) => {
        const approved = approval?.approvedMutationIds?.includes(m.mutationId);
        const icon = approved ? '✓' : (approval?.rejectedMutationIds?.includes(m.mutationId) ? '✗' : '○');
        return `<div class="stx-memory-dream-workbench__mutation-row">
            <span>${icon}</span>
            <span class="stx-memory-dream-workbench__badge">${escapeHtml(resolveDreamMutationTypeLabel(m.mutationType))}</span>
            <span class="stx-memory-dream-workbench__mutation-preview" title="${escapeHtml(m.preview)}">${escapeHtml(m.preview.slice(0, 80))}</span>
            <span style="opacity:.6">置信度 ${Number(m.confidence).toFixed(2)}</span>
            ${status === 'approved' ? `<button type="button" class="stx-memory-workbench__ghost-btn stx-btn-danger" data-action="dream-workbench-rollback-mutation" data-dream-id="${escapeHtml(meta?.dreamId || '')}" data-mutation-id="${escapeHtml(m.mutationId)}" style="padding:4px 8px;font-size:11px;">回滚</button>` : ''}
        </div>`;
    }).join('');
    return `
        <article class="stx-memory-dream-workbench__card stx-memory-dream-workbench__card--session">
            <div class="stx-memory-dream-workbench__card-head">
                <div class="stx-memory-dream-workbench__title-block">
                    <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('dream_record'))}</div>
                    ${renderDreamKeyMeta(resolveDreamWorkbenchText('id_label'), meta?.dreamId)}
                </div>
                <span class="${statusBadgeClass(status)}">${escapeHtml(resolveDreamWorkbenchText(status) === status ? status : resolveDreamWorkbenchText(status))}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerReasonLabel(meta?.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(meta ? new Date(meta.createdAt).toLocaleString('zh-CN') : '-')}
            </div>
            <div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                ${escapeHtml(resolveDreamWorkbenchText('quality_score'))}：${quality ? Number(quality.qualityScore).toFixed(2) : resolveDreamWorkbenchText('unevaluated')}
                ${quality && quality.warnings.length > 0 ? ` / ${escapeHtml(resolveDreamWorkbenchText('warning_label'))}：${escapeHtml(quality.warnings.slice(0, 3).join('、'))}` : ''}
                / ${escapeHtml(resolveDreamWorkbenchText('maintenance_applied'))}：${String(appliedMaintenance)} / ${escapeHtml(resolveDreamWorkbenchText('maintenance_pending'))}：${String(pendingMaintenance)}
            </div>
            <div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                ${escapeHtml(resolveDreamWorkbenchText('prompt_version'))}：${escapeHtml(promptInfo?.promptVersion || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('style_label'))}：${escapeHtml(promptInfo?.stylePreset || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('schema_label'))}：${escapeHtml(promptInfo?.schemaVersion || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('narrative_length'))}：${String(output?.narrative.length ?? 0)}
                / ${escapeHtml(resolveDreamWorkbenchText('mutation_count'))}：${String(output?.proposedMutations.length ?? 0)}
                / ${escapeHtml(resolveDreamWorkbenchText('explain_coverage'))}：${String(explainCoveredCount)}/${String(output?.proposedMutations.length ?? 0)}
            </div>
            ${applyResult ? `<div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid">
                ${escapeHtml(resolveDreamWorkbenchText('unified_apply'))}：${escapeHtml(resolveDreamWorkbenchText('entry_applied'))} ${String(applyResult.appliedEntryMutationIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('relationship_applied'))} ${String(applyResult.appliedRelationshipMutationIds.length)}
                / ${escapeHtml(resolveDreamWorkbenchText('entry_created'))} ${String(applyResult.createdEntryIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('entry_updated'))} ${String(applyResult.updatedEntryIds.length)}
                / ${escapeHtml(resolveDreamWorkbenchText('relationship_created'))} ${String(applyResult.createdRelationshipIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('relationship_updated'))} ${String(applyResult.updatedRelationshipIds.length)}
            </div>` : ''}
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(output?.highlights.join('；') || output?.narrative.slice(0, 120) || resolveDreamWorkbenchText('no_output_summary'))}</div>
            ${mutationHtml ? `<div style="margin-top:8px;"><div class="stx-memory-dream-workbench__meta" style="margin-bottom:4px;">${escapeHtml(resolveDreamWorkbenchText('mutations_title'))} (${String((output?.proposedMutations ?? []).length)})：</div>${mutationHtml}</div>` : ''}
            <div class="stx-memory-dream-workbench__action-row">
                ${canRollback && status !== 'rolled_back'
                    ? `<button type="button" class="stx-memory-workbench__ghost-btn" data-action="dream-workbench-rollback" data-dream-id="${escapeHtml(meta?.dreamId || '')}">${escapeHtml(resolveDreamWorkbenchText('rollback_whole_dream'))}</button>`
                    : status === 'rolled_back'
                        ? `<span class="stx-memory-workbench__badge stx-memory-dream-workbench__status-badge">${escapeHtml(resolveDreamWorkbenchText('rolled_back'))}</span>`
                        : ''}
            </div>
        </article>
    `;
}

function renderMaintenanceCard(
    proposal: DreamMaintenanceProposalRecord,
    session: DreamSessionRecord | undefined,
    entryTitleMap: Map<string, string>,
    actorNameMap: Map<string, string>,
): string {
    const effectiveStatus = resolveDreamMaintenanceEffectiveStatus(proposal, session);
    const statusClass = statusBadgeClass(effectiveStatus);
    const isPending = effectiveStatus === 'pending';
    const payload = toRecord(proposal.payload);
    const display = resolveDreamMaintenanceDisplay({
        proposalType: proposal.proposalType,
        preview: proposal.preview,
        reason: proposal.reason,
        payload: {
            ...payload,
            primaryEntryLabel: entryTitleMap.get(String(payload.primaryEntryId ?? '').trim()) || '',
            entryLabel: entryTitleMap.get(String(payload.entryId ?? '').trim()) || '',
            relationLabel: localizeDreamDisplayText(proposal.preview),
        },
        sourceEntryLabels: resolveDreamEntryLabels(proposal.sourceEntryIds, entryTitleMap),
        actorLabels: resolveDreamActorLabels(payload.participants, actorNameMap),
    });
    const impactMarkup = display.impactItems.length > 0
        ? renderDreamLabelBadges(display.impactItems, 5)
        : (display.impactText ? `<span class="stx-memory-dream-workbench__hint">${escapeHtml(display.impactText)}</span>` : '');
    return `
        <article class="stx-memory-dream-workbench__card stx-memory-dream-workbench__card--maintenance">
            <div class="stx-memory-dream-workbench__card-head">
                <div class="stx-memory-dream-workbench__title-block">
                    <div class="stx-memory-dream-workbench__title stx-memory-dream-workbench__title--truncate" title="${escapeHtml(display.title)}">${escapeHtml(display.title)}</div>
                    <div class="stx-memory-dream-workbench__hint">${escapeHtml(display.summary)}</div>
                </div>
                <span class="${statusClass}">${escapeHtml(resolveDreamWorkbenchText(effectiveStatus) === effectiveStatus ? effectiveStatus : resolveDreamWorkbenchText(effectiveStatus))}</span>
            </div>
            ${impactMarkup ? `<div class="stx-memory-dream-workbench__meta stx-memory-dream-workbench__meta-grid"><span class="stx-memory-dream-workbench__secondary">${escapeHtml(display.impactLabel)}：</span>${impactMarkup}</div>` : ''}
            <div class="stx-memory-dream-workbench__meta">批准后：${escapeHtml(display.resultHint)}</div>
            <div class="stx-memory-dream-workbench__card-footer">
                <div class="stx-memory-dream-workbench__card-footer-meta">
                    <div class="stx-memory-dream-workbench__secondary">
                        维护类型：${escapeHtml(resolveDreamProposalTypeLabel(proposal.proposalType))}
                        / 系统判断：${escapeHtml(Number(proposal.confidence).toFixed(2))}
                        / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(formatTimestamp(proposal.createdAt))}
                    </div>
                    ${renderDreamStackedMetaId(resolveDreamWorkbenchText('proposal_key_label'), proposal.proposalId)}
                    ${renderDreamStackedMetaId(resolveDreamWorkbenchText('dream_short'), proposal.dreamId)}
                </div>
                ${isPending ? `<div class="stx-memory-dream-workbench__action-row stx-memory-dream-workbench__action-row--bottom">
                    <button type="button" class="stx-memory-workbench__button" data-action="dream-workbench-approve-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('approve_apply'))}</button>
                    <button type="button" class="stx-memory-workbench__ghost-btn stx-btn-danger" data-action="dream-workbench-reject-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('reject'))}</button>
                </div>` : ''}
            </div>
        </article>
    `;
}

function renderQualityCard(report: DreamQualityReport): string {
    const needReview = report.blockedMutationIds.length > 0 || report.forcedReviewMutationIds.length > 0;
    return `
        <article class="stx-memory-dream-workbench__card stx-memory-dream-workbench__card--quality">
            <div class="stx-memory-dream-workbench__card-head">
                <div class="stx-memory-dream-workbench__title-block">
                    <div class="stx-memory-dream-workbench__title">质量报告</div>
                    ${renderDreamKeyMeta(resolveDreamWorkbenchText('id_label'), report.dreamId)}
                </div>
                <span class="${statusBadgeClass(needReview ? 'pending' : 'approved')}">${needReview ? '需复核' : '通过'}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('quality_score'))}：${Number(report.qualityScore).toFixed(2)} / ${escapeHtml(resolveDreamWorkbenchText('blocked_short'))}=${String(report.blockedMutationIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('forced_review_short'))}=${String(report.forcedReviewMutationIds.length)}</div>
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(report.warnings.join('；') || resolveDreamWorkbenchText('extra_warning_none'))}</div>
        </article>
    `;
}

function renderSchedulerInfo(schedulerState: DreamSchedulerStateRecord | null): string {
    const settings = readMemoryOSSettings();
    if (!schedulerState) {
        return `<div class="stx-memory-dream-workbench__scheduler-info"><span>${escapeHtml(resolveDreamWorkbenchText('scheduler_uninitialized'))}</span></div>`;
    }
    const lastTriggered = schedulerState.lastTriggeredAt ? new Date(schedulerState.lastTriggeredAt).toLocaleString('zh-CN') : resolveDreamWorkbenchText('never');
    const lastCompleted = schedulerState.lastCompletedAt ? new Date(schedulerState.lastCompletedAt).toLocaleString('zh-CN') : resolveDreamWorkbenchText('never');
    return `<div class="stx-memory-dream-workbench__scheduler-info">
        <div><span>${escapeHtml(resolveDreamWorkbenchText('status_label'))}：</span><strong>${schedulerState.active ? escapeHtml(resolveDreamWorkbenchText('runtime_busy')) : escapeHtml(resolveDreamWorkbenchText('runtime_idle'))}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('today_executed'))}：</span><strong>${String(schedulerState.dailyRunCount)} / ${String(settings.dreamSchedulerDailyMaxRuns)}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('cooldown_minutes'))}：</span><strong>${String(settings.dreamSchedulerCooldownMinutes)} ${escapeHtml(resolveDreamWorkbenchText('minute_unit'))}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('last_triggered'))}：</span><strong>${lastTriggered}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('last_completed'))}：</span><strong>${lastCompleted}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('trigger_source'))}：</span><strong>${escapeHtml(schedulerState.lastTriggerSource || '-')}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('generation_ended_label'))}：</span><strong>${settings.dreamSchedulerAllowGenerationEndedTrigger ? '✓' : '✗'}</strong></div>
        <div><span>${escapeHtml(resolveDreamWorkbenchText('idle_trigger_label'))}（${String(settings.dreamSchedulerIdleMinutes)}${escapeHtml(resolveDreamWorkbenchText('minute_unit'))}）：</span><strong>${settings.dreamSchedulerAllowIdleTrigger ? '✓' : '✗'}</strong></div>
        ${schedulerState.lastDecision?.blockedBy?.length ? `<div><span>${escapeHtml(resolveDreamWorkbenchText('blocked_reason'))}：</span><strong>${escapeHtml(schedulerState.lastDecision.blockedBy.join('、'))}</strong></div>` : ''}
    </div>`;
}
