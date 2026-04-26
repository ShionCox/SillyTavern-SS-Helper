import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { logger, toast } from '../runtime/runtime-services';
import { readMemoryOSSettings } from '../settings/store';
import { hasMemoryLlmRuntime } from '../memory-summary';
import type { MemorySDKImpl } from '../sdk/memory-sdk';
import type {
    DreamMaintenanceProposalRecord,
    DreamQualityReport,
    DreamSchedulerStateRecord,
    DreamSessionRecord,
} from '../services/dream-types';
import {
    isDreamMaintenancePending,
    resolveDreamMaintenanceEffectiveStatus,
} from '../services/dream-maintenance-state';
import { formatDreamWorkbenchText, resolveDreamWorkbenchText } from './workbenchLocale';

/**
 * 功能：检查梦境工作台是否可执行 LLM 任务。
 * @returns 是否可以继续执行。
 */
function ensureDreamWorkbenchLlmRuntime(): boolean {
    if (hasMemoryLlmRuntime()) {
        return true;
    }
    toast.warning('MemoryOS 需要 LLMHub 才能执行梦境任务，请先启用或配置 LLMHub。');
    return false;
}

const DREAM_WORKBENCH_ID = 'stx-memory-dream-workbench';
const DREAM_WORKBENCH_STYLE_ID = 'stx-memory-dream-workbench-style';

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureDreamWorkbenchStyle(): void {
    if (document.getElementById(DREAM_WORKBENCH_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = DREAM_WORKBENCH_STYLE_ID;
    style.textContent = `
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench { display:flex; flex-direction:column; gap:14px; min-width:min(1280px,100%); height:min(86vh,1100px); overflow:hidden; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__toolbar,
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__summary { display:flex; gap:10px; flex-wrap:wrap; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__toolbar { justify-content:space-between; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__summary-card,
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__card { border:1px solid rgba(255,255,255,.12); border-radius:14px; background:rgba(255,255,255,.03); padding:12px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__summary-card { min-width:180px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__grid { display:grid; grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr); gap:12px; min-height:0; flex:1; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__panel { border:1px solid rgba(255,255,255,.12); border-radius:14px; padding:12px; min-height:0; overflow:auto; background:rgba(0,0,0,.18); }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__list { display:flex; flex-direction:column; gap:10px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__title { font-size:14px; font-weight:700; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__meta, #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__hint { font-size:12px; line-height:1.6; opacity:.82; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__badge { display:inline-flex; border-radius:999px; padding:2px 8px; background:rgba(255,255,255,.08); font-size:11px; margin-right:6px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__badge--approved { background:rgba(76,175,80,.22); color:#81c784; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__badge--rejected { background:rgba(244,67,54,.22); color:#e57373; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__badge--pending { background:rgba(255,152,0,.22); color:#ffb74d; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__badge--rolled_back { background:rgba(158,158,158,.22); color:#bdbdbd; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__tabs { display:flex; gap:0; border-bottom:1px solid rgba(255,255,255,.12); }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__tab { background:none; border:none; border-bottom:2px solid transparent; color:inherit; padding:8px 16px; cursor:pointer; opacity:.7; transition:.15s; font-size:13px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__tab.is-active { opacity:1; border-bottom-color:rgba(100,181,246,.8); }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__tab-panel { display:none; flex:1; min-height:0; overflow:auto; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__tab-panel.is-active { display:flex; flex-direction:column; gap:10px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__scheduler-info { display:flex; gap:10px; flex-wrap:wrap; padding:10px 0; font-size:12px; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__scheduler-info span { opacity:.7; }
        #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__mutation-row { display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,.06); font-size:12px; }
        #${DREAM_WORKBENCH_ID} button { border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:8px 12px; background:rgba(255,255,255,.06); color:inherit; cursor:pointer; }
        #${DREAM_WORKBENCH_ID} button:hover { background:rgba(255,255,255,.12); }
        #${DREAM_WORKBENCH_ID} button.stx-btn-danger { border-color:rgba(244,67,54,.3); background:rgba(244,67,54,.1); }
        #${DREAM_WORKBENCH_ID} button.stx-btn-danger:hover { background:rgba(244,67,54,.2); }
        @media (max-width: 980px) { #${DREAM_WORKBENCH_ID} .stx-memory-dream-workbench__grid { grid-template-columns:minmax(0,1fr); } }
    `;
    document.head.appendChild(style);
}

function getActiveMemorySdk(): MemorySDKImpl | null {
    return ((window as unknown as { STX?: { memory?: MemorySDKImpl } })?.STX?.memory) ?? null;
}

function statusBadgeClass(status: string): string {
    if (status === 'approved') return 'stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--approved';
    if (status === 'rejected') return 'stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--rejected';
    if (status === 'rolled_back') return 'stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--rolled_back';
    if (status === 'pending' || status === 'generated' || status === 'queued') return 'stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--pending';
    return 'stx-memory-dream-workbench__badge';
}

function resolveDreamTriggerLabel(triggerReason: string | null | undefined): string {
    if (triggerReason === 'generation_ended') {
        return '回复结束';
    }
    if (triggerReason === 'idle') {
        return '空闲触发';
    }
    if (triggerReason === 'manual') {
        return '手动';
    }
    return resolveDreamWorkbenchText('unknown_trigger');
}

function countPendingMaintenanceForSession(session: DreamSessionRecord): number {
    return session.maintenanceProposals.filter((proposal: DreamMaintenanceProposalRecord): boolean => {
        return isDreamMaintenancePending(proposal, session);
    }).length;
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
    const explainCoveredCount = (output?.proposedMutations ?? []).filter((mutation) => {
        return mutation.explain && mutation.explain.sourceEntryIds.length > 0 && mutation.explain.explanationSteps.length > 0;
    }).length;
    const mutationHtml = (output?.proposedMutations ?? []).map((m) => {
        const approved = approval?.approvedMutationIds?.includes(m.mutationId);
        const icon = approved ? '✓' : (approval?.rejectedMutationIds?.includes(m.mutationId) ? '✗' : '○');
        return `<div class="stx-memory-dream-workbench__mutation-row">
            <span>${icon}</span>
            <span class="stx-memory-dream-workbench__badge">${escapeHtml(m.mutationType)}</span>
            <span style="flex:1">${escapeHtml(m.preview.slice(0, 80))}</span>
            <span style="opacity:.6">置信度 ${Number(m.confidence).toFixed(2)}</span>
            ${status === 'approved' ? `<button type="button" data-dream-workbench-action="rollback-mutation" data-dream-id="${escapeHtml(meta?.dreamId || '')}" data-mutation-id="${escapeHtml(m.mutationId)}" style="padding:4px 8px;font-size:11px;">回滚</button>` : ''}
        </div>`;
    }).join('');
    return `
        <article class="stx-memory-dream-workbench__card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div class="stx-memory-dream-workbench__title">${escapeHtml(meta?.dreamId || resolveDreamWorkbenchText('unknown_dream'))}</div>
                <span class="${statusBadgeClass(status)}">${escapeHtml(resolveDreamWorkbenchText(status) === status ? status : resolveDreamWorkbenchText(status))}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta">
                ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerLabel(meta?.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(meta ? new Date(meta.createdAt).toLocaleString('zh-CN') : '-')}
            </div>
            <div class="stx-memory-dream-workbench__meta">
                ${escapeHtml(resolveDreamWorkbenchText('quality_score'))}：${quality ? Number(quality.qualityScore).toFixed(2) : resolveDreamWorkbenchText('unevaluated')}
                ${quality && quality.warnings.length > 0 ? ` / ${escapeHtml(resolveDreamWorkbenchText('warning_label'))}：${escapeHtml(quality.warnings.slice(0, 3).join('、'))}` : ''}
                / ${escapeHtml(resolveDreamWorkbenchText('maintenance_applied'))}：${String(appliedMaintenance)} / ${escapeHtml(resolveDreamWorkbenchText('maintenance_pending'))}：${String(pendingMaintenance)}
            </div>
            <div class="stx-memory-dream-workbench__meta">
                ${escapeHtml(resolveDreamWorkbenchText('prompt_version'))}：${escapeHtml(promptInfo?.promptVersion || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('style_label'))}：${escapeHtml(promptInfo?.stylePreset || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('schema_label'))}：${escapeHtml(promptInfo?.schemaVersion || '未记录')}
                / ${escapeHtml(resolveDreamWorkbenchText('narrative_length'))}：${String(output?.narrative.length ?? 0)}
                / ${escapeHtml(resolveDreamWorkbenchText('mutation_count'))}：${String(output?.proposedMutations.length ?? 0)}
                / ${escapeHtml(resolveDreamWorkbenchText('explain_coverage'))}：${String(explainCoveredCount)}/${String(output?.proposedMutations.length ?? 0)}
            </div>
            ${applyResult ? `<div class="stx-memory-dream-workbench__meta">
                ${escapeHtml(resolveDreamWorkbenchText('unified_apply'))}：${escapeHtml(resolveDreamWorkbenchText('entry_applied'))} ${String(applyResult.appliedEntryMutationIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('relationship_applied'))} ${String(applyResult.appliedRelationshipMutationIds.length)}
                / ${escapeHtml(resolveDreamWorkbenchText('entry_created'))} ${String(applyResult.createdEntryIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('entry_updated'))} ${String(applyResult.updatedEntryIds.length)}
                / ${escapeHtml(resolveDreamWorkbenchText('relationship_created'))} ${String(applyResult.createdRelationshipIds.length)} / ${escapeHtml(resolveDreamWorkbenchText('relationship_updated'))} ${String(applyResult.updatedRelationshipIds.length)}
            </div>` : ''}
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(output?.highlights.join('；') || output?.narrative.slice(0, 120) || resolveDreamWorkbenchText('no_output_summary'))}</div>
            ${mutationHtml ? `<div style="margin-top:8px;"><div class="stx-memory-dream-workbench__meta" style="margin-bottom:4px;">${escapeHtml(resolveDreamWorkbenchText('mutations_title'))} (${String((output?.proposedMutations ?? []).length)})：</div>${mutationHtml}</div>` : ''}
            <div style="margin-top:10px;display:flex;gap:8px;">
                ${status !== 'rolled_back' ? `<button type="button" data-dream-workbench-action="rollback" data-dream-id="${escapeHtml(meta?.dreamId || '')}">${escapeHtml(resolveDreamWorkbenchText('rollback_whole_dream'))}</button>` : `<span class="stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--rolled_back">${escapeHtml(resolveDreamWorkbenchText('rolled_back'))}</span>`}
            </div>
        </article>
    `;
}

function renderMaintenanceCard(proposal: DreamMaintenanceProposalRecord, session?: DreamSessionRecord): string {
    const effectiveStatus = resolveDreamMaintenanceEffectiveStatus(proposal, session);
    const statusClass = statusBadgeClass(effectiveStatus);
    const isPending = effectiveStatus === 'pending';
    return `
        <article class="stx-memory-dream-workbench__card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div class="stx-memory-dream-workbench__title">${escapeHtml(proposal.preview)}</div>
                <span class="${statusClass}">${escapeHtml(resolveDreamWorkbenchText(effectiveStatus) === effectiveStatus ? effectiveStatus : resolveDreamWorkbenchText(effectiveStatus))}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta">
                ${escapeHtml(resolveDreamWorkbenchText('maintenance_type'))}：<span class="stx-memory-dream-workbench__badge">${escapeHtml(proposal.proposalType)}</span>
                ${escapeHtml(resolveDreamWorkbenchText('confidence'))}：${Number(proposal.confidence).toFixed(2)}
                / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(new Date(proposal.createdAt).toLocaleString('zh-CN'))}
                / ${escapeHtml(resolveDreamWorkbenchText('dream_short'))}：${escapeHtml(proposal.dreamId.split(':').pop() || proposal.dreamId).slice(0, 12)}
            </div>
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(proposal.reason)}</div>
            ${proposal.sourceEntryIds.length > 0 ? `<div class="stx-memory-dream-workbench__meta">${escapeHtml(resolveDreamWorkbenchText('involved_entries'))}：${escapeHtml(proposal.sourceEntryIds.slice(0, 5).join('、'))}${proposal.sourceEntryIds.length > 5 ? ` +${String(proposal.sourceEntryIds.length - 5)}` : ''}</div>` : ''}
            ${isPending ? `<div style="margin-top:8px;display:flex;gap:8px;">
                <button type="button" data-dream-workbench-action="approve-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('approve_apply'))}</button>
                <button type="button" class="stx-btn-danger" data-dream-workbench-action="reject-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">${escapeHtml(resolveDreamWorkbenchText('reject'))}</button>
            </div>` : ''}
        </article>
    `;
}

function renderQualityCard(report: DreamQualityReport): string {
    return `
        <article class="stx-memory-dream-workbench__card">
            <div class="stx-memory-dream-workbench__title">${escapeHtml(report.dreamId)}</div>
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

/**
 * 功能：打开第三阶段 Dream Workbench。
 */
export function openDreamWorkbench(): void {
    ensureDreamWorkbenchStyle();
    openSharedDialog({
        id: DREAM_WORKBENCH_ID,
        size: 'fullscreen',
        chrome: { title: resolveDreamWorkbenchText('workbench_title') },
        bodyHtml: '<div data-dream-workbench-root="true"></div>',
        onMount: (instance: SharedDialogInstance): void => {
            const root = instance.content.querySelector('[data-dream-workbench-root="true"]') as HTMLElement | null;
            if (!root) {
                return;
            }
            const memory = getActiveMemorySdk();
            if (!memory) {
                root.innerHTML = `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('not_connected_memory'))}</div>`;
                return;
            }
            let activeTab = 'session';
            const render = async (): Promise<void> => {
                try {
                    const [sessions, proposals, reports, schedulerState] = await Promise.all([
                        memory.unifiedMemory.diagnostics.listDreamSessions(16),
                        memory.unifiedMemory.diagnostics.listDreamMaintenanceProposals(24),
                        memory.unifiedMemory.diagnostics.listDreamQualityReports(16),
                        memory.unifiedMemory.diagnostics.getDreamSchedulerState(),
                    ]);
                    const sessionMap = new Map(sessions.map((session: DreamSessionRecord): [string, DreamSessionRecord] => {
                        return [String(session.meta?.dreamId ?? ''), session];
                    }).filter(([dreamId]: [string, DreamSessionRecord]): boolean => Boolean(dreamId)));
                    const approvedSessions = sessions.filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved').length;
                    const pendingSessions = sessions.filter((item: DreamSessionRecord): boolean => item.approval?.status === 'pending').length;
                    const pendingMaintenance = proposals.filter((item: DreamMaintenanceProposalRecord): boolean => {
                        return isDreamMaintenancePending(item, sessionMap.get(item.dreamId));
                    }).length;
                    const appliedMaintenance = proposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'applied').length;
                    const rolledBackSessions = sessions.filter((item: DreamSessionRecord): boolean => item.meta?.status === 'rolled_back').length;

                    const tabSessionActive = activeTab === 'session' ? ' is-active' : '';
                    const tabDiagnosticsActive = activeTab === 'diagnostics' ? ' is-active' : '';
                    const tabMaintenanceActive = activeTab === 'maintenance' ? ' is-active' : '';
                    const tabAppliedActive = activeTab === 'applied' ? ' is-active' : '';
                    const tabRollbackActive = activeTab === 'rollback' ? ' is-active' : '';

                    root.innerHTML = `
                        <div class="stx-memory-dream-workbench">
                            <div class="stx-memory-dream-workbench__toolbar">
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('pipeline_title'))}</div>
                                <div style="display:flex;gap:8px;">
                                    <button type="button" data-dream-workbench-action="refresh">${escapeHtml(resolveDreamWorkbenchText('refresh'))}</button>
                                    <button type="button" class="stx-btn-danger" data-dream-workbench-action="clear-all">${escapeHtml(resolveDreamWorkbenchText('clear_all_dream_records'))}</button>
                                    <button type="button" data-dream-workbench-action="manual-dream">${escapeHtml(resolveDreamWorkbenchText('manual_dream'))}</button>
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
                                <button type="button" class="stx-memory-dream-workbench__tab${tabSessionActive}" data-dream-workbench-tab="session">${escapeHtml(resolveDreamWorkbenchText('session_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabDiagnosticsActive}" data-dream-workbench-tab="diagnostics">${escapeHtml(resolveDreamWorkbenchText('diagnostics_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabMaintenanceActive}" data-dream-workbench-tab="maintenance">${escapeHtml(resolveDreamWorkbenchText('maintenance_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabAppliedActive}" data-dream-workbench-tab="applied">${escapeHtml(resolveDreamWorkbenchText('applied_tab'))}</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabRollbackActive}" data-dream-workbench-tab="rollback">${escapeHtml(resolveDreamWorkbenchText('rollback_tab'))}</button>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabSessionActive}" data-dream-workbench-panel="session">
                                <div class="stx-memory-dream-workbench__list">${sessions.map((session: DreamSessionRecord): string => renderSessionCard(session)).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_dream_session'))}</div>`}</div>
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
                                    ${proposals.map((proposal: DreamMaintenanceProposalRecord): string => renderMaintenanceCard(proposal, sessionMap.get(proposal.dreamId))).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_maintenance_proposal'))}</div>`}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabAppliedActive}" data-dream-workbench-panel="applied">
                                <div class="stx-memory-dream-workbench__title">${escapeHtml(resolveDreamWorkbenchText('applied_dream_changes'))} (${String(approvedSessions)})</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${sessions
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
                                            return `<article class="stx-memory-dream-workbench__card">
                                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                                    <div class="stx-memory-dream-workbench__title">${escapeHtml(m.dreamId)}</div>
                                                    <span class="${statusBadgeClass('approved')}">${escapeHtml(resolveDreamWorkbenchText('applied_status'))}</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta">
                                                    ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerLabel(m.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(new Date(m.createdAt).toLocaleString('zh-CN'))}
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
                                    ${sessions
                                        .filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved' || item.meta?.status === 'rolled_back')
                                        .map((session: DreamSessionRecord): string => {
                                            const m = session.meta;
                                            const isRolledBack = m?.status === 'rolled_back';
                                            return `<article class="stx-memory-dream-workbench__card">
                                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                                    <div class="stx-memory-dream-workbench__title">${escapeHtml(m?.dreamId || '')}</div>
                                                    <span class="${statusBadgeClass(m?.status || '')}">${escapeHtml(resolveDreamWorkbenchText(m?.status || '') === (m?.status || '') ? (m?.status || '') : resolveDreamWorkbenchText(m?.status || ''))}</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta">
                                                    ${escapeHtml(resolveDreamWorkbenchText('trigger_reason'))}：${escapeHtml(resolveDreamTriggerLabel(m?.triggerReason))} / ${escapeHtml(resolveDreamWorkbenchText('time_label'))}：${escapeHtml(m ? new Date(m.createdAt).toLocaleString('zh-CN') : '-')}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('affected_entries'))}：${String(session.rollbackMetadata?.affectedEntryIds?.length ?? 0)}
                                                    / ${escapeHtml(resolveDreamWorkbenchText('affected_relationships'))}：${String(session.rollbackMetadata?.affectedRelationshipIds?.length ?? 0)}
                                                </div>
                                                ${!isRolledBack
                                                    ? `<div style="margin-top:8px;"><button type="button" class="stx-btn-danger" data-dream-workbench-action="rollback" data-dream-id="${escapeHtml(m?.dreamId || '')}">${escapeHtml(resolveDreamWorkbenchText('perform_rollback'))}</button></div>`
                                                    : `<div class="stx-memory-dream-workbench__meta" style="margin-top:4px;">${escapeHtml(resolveDreamWorkbenchText('rollback_at'))}：${escapeHtml(session.rollbackMetadata?.rolledBackAt ? new Date(session.rollbackMetadata.rolledBackAt).toLocaleString('zh-CN') : '-')}</div>`
                                                }
                                            </article>`;
                                        }).join('') || `<div class="stx-memory-dream-workbench__hint">${escapeHtml(resolveDreamWorkbenchText('no_rollback_session'))}</div>`}
                                </div>
                            </div>
                        </div>
                    `;

                    root.querySelectorAll('[data-dream-workbench-tab]').forEach((tab: Element): void => {
                        tab.addEventListener('click', (): void => {
                            activeTab = String((tab as HTMLElement).getAttribute('data-dream-workbench-tab') ?? 'session');
                            void render();
                        });
                    });
                    root.querySelector('[data-dream-workbench-action="refresh"]')?.addEventListener('click', (): void => {
                        void render();
                    });
                    root.querySelector('[data-dream-workbench-action="manual-dream"]')?.addEventListener('click', (): void => {
                        if (!ensureDreamWorkbenchLlmRuntime()) {
                            return;
                        }
                        void memory.chatState.startDreamSession('manual').then(() => render());
                    });
                    /**
                     * 功能：清理当前聊天的全部梦境系统记录并刷新工作台。
                     * @returns 异步完成。
                     */
                    const clearAllDreamRecordsForWorkbench = async (): Promise<void> => {
                        const confirmed = window.confirm(resolveDreamWorkbenchText('clear_all_dream_records_confirm'));
                        if (!confirmed) {
                            return;
                        }
                        try {
                            const deletedCount = await memory.unifiedMemory.diagnostics.clearAllDreamRecords();
                            toast.success(formatDreamWorkbenchText('clear_all_dream_records_success', { count: deletedCount }));
                            await render();
                        } catch (error) {
                            toast.error(formatDreamWorkbenchText('clear_all_dream_records_failed', {
                                reason: String((error as Error)?.message ?? error),
                            }));
                        }
                    };
                    /**
                     * 功能：响应清理全部梦境信息按钮点击。
                     * @returns 无返回值。
                     */
                    const handleClearAllDreamRecordsClick = (): void => {
                        void clearAllDreamRecordsForWorkbench();
                    };
                    root.querySelector('[data-dream-workbench-action="clear-all"]')?.addEventListener('click', handleClearAllDreamRecordsClick);
                    root.querySelectorAll('[data-dream-workbench-action="rollback"]').forEach((button: Element): void => {
                        button.addEventListener('click', (): void => {
                            const dreamId = String((button as HTMLElement).getAttribute('data-dream-id') ?? '').trim();
                            if (!dreamId) {
                                return;
                            }
                            void memory.chatState.rollbackDreamSession(dreamId).then((result) => {
                                if (!result.ok) {
                                    toast.error(formatDreamWorkbenchText('rollback_failed', { reason: result.reasonCode || resolveDreamWorkbenchText('unknown_reason') }));
                                    return;
                                }
                                toast.success(resolveDreamWorkbenchText('rollback_success'));
                                void render();
                            });
                        });
                    });
                    root.querySelectorAll('[data-dream-workbench-action="rollback-mutation"]').forEach((button: Element): void => {
                        button.addEventListener('click', (): void => {
                            const dreamId = String((button as HTMLElement).getAttribute('data-dream-id') ?? '').trim();
                            const mutationId = String((button as HTMLElement).getAttribute('data-mutation-id') ?? '').trim();
                            if (!dreamId || !mutationId) {
                                return;
                            }
                            void memory.chatState.rollbackDreamMutation(dreamId, mutationId).then((result: { ok: boolean; reasonCode?: string }) => {
                                if (!result.ok) {
                                    toast.error(formatDreamWorkbenchText('mutation_rollback_failed', { reason: result.reasonCode || resolveDreamWorkbenchText('unknown_reason') }));
                                    return;
                                }
                                toast.success(resolveDreamWorkbenchText('mutation_rollback_success'));
                                void render();
                            });
                        });
                    });
                    root.querySelectorAll('[data-dream-workbench-action="approve-maintenance"]').forEach((button: Element): void => {
                        button.addEventListener('click', (): void => {
                            const proposalId = String((button as HTMLElement).getAttribute('data-proposal-id') ?? '').trim();
                            if (!proposalId) {
                                return;
                            }
                            void memory.chatState.applyDreamMaintenanceProposal(proposalId).then((result: { ok: boolean; reasonCode?: string }) => {
                                if (!result.ok) {
                                    toast.error(formatDreamWorkbenchText('maintenance_apply_failed', { reason: result.reasonCode || resolveDreamWorkbenchText('unknown_reason') }));
                                    return;
                                }
                                toast.success(resolveDreamWorkbenchText('maintenance_apply_success'));
                                void render();
                            });
                        });
                    });
                    root.querySelectorAll('[data-dream-workbench-action="reject-maintenance"]').forEach((button: Element): void => {
                        button.addEventListener('click', (): void => {
                            const proposalId = String((button as HTMLElement).getAttribute('data-proposal-id') ?? '').trim();
                            if (!proposalId) {
                                return;
                            }
                            void memory.chatState.rejectDreamMaintenanceProposal(proposalId).then((result: { ok: boolean; reasonCode?: string }) => {
                                if (!result.ok) {
                                    toast.error(formatDreamWorkbenchText('maintenance_reject_failed', { reason: result.reasonCode || resolveDreamWorkbenchText('unknown_reason') }));
                                    return;
                                }
                                toast.info(resolveDreamWorkbenchText('maintenance_reject_success'));
                                void render();
                            });
                        });
                    });
                } catch (error) {
                    logger.error(resolveDreamWorkbenchText('apply_failed_title'), error);
                    root.innerHTML = `<div class="stx-memory-dream-workbench__hint">${escapeHtml(formatDreamWorkbenchText('load_failed_message', { message: String((error as Error)?.message ?? error) }))}</div>`;
                }
            };
            void render();
        },
    });
}
