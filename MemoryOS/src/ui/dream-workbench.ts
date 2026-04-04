import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { logger, toast } from '../runtime/runtime-services';
import { readMemoryOSSettings } from '../settings/store';
import type { MemorySDKImpl } from '../sdk/memory-sdk';
import type {
    DreamMaintenanceProposalRecord,
    DreamQualityReport,
    DreamSchedulerStateRecord,
    DreamSessionRecord,
} from '../services/dream-types';

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

function renderSessionCard(session: DreamSessionRecord): string {
    const meta = session.meta;
    const output = session.output;
    const quality = session.qualityReport;
    const approval = session.approval;
    const pendingMaintenance = session.maintenanceProposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'pending').length;
    const appliedMaintenance = session.maintenanceProposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'applied').length;
    const status = meta?.status || 'unknown';
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
                <div class="stx-memory-dream-workbench__title">${escapeHtml(meta?.dreamId || '未知 dream')}</div>
                <span class="${statusBadgeClass(status)}">${escapeHtml(status)}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta">
                触发：${escapeHtml(meta?.triggerReason || 'unknown')} / 时间：${escapeHtml(meta ? new Date(meta.createdAt).toLocaleString('zh-CN') : '-')}
            </div>
            <div class="stx-memory-dream-workbench__meta">
                质量分：${quality ? Number(quality.qualityScore).toFixed(2) : '未评估'}
                ${quality && quality.warnings.length > 0 ? ` / 警告：${escapeHtml(quality.warnings.slice(0, 3).join('、'))}` : ''}
                / maintenance 已应用：${String(appliedMaintenance)} / 待处理：${String(pendingMaintenance)}
            </div>
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(output?.highlights.join('；') || output?.narrative.slice(0, 120) || '无梦境输出摘要')}</div>
            ${mutationHtml ? `<div style="margin-top:8px;"><div class="stx-memory-dream-workbench__meta" style="margin-bottom:4px;">Mutations (${String((output?.proposedMutations ?? []).length)})：</div>${mutationHtml}</div>` : ''}
            <div style="margin-top:10px;display:flex;gap:8px;">
                ${status !== 'rolled_back' ? `<button type="button" data-dream-workbench-action="rollback" data-dream-id="${escapeHtml(meta?.dreamId || '')}">回滚整个 dream</button>` : '<span class="stx-memory-dream-workbench__badge stx-memory-dream-workbench__badge--rolled_back">已回滚</span>'}
            </div>
        </article>
    `;
}

function renderMaintenanceCard(proposal: DreamMaintenanceProposalRecord): string {
    const statusClass = statusBadgeClass(proposal.status);
    const isPending = proposal.status === 'pending';
    return `
        <article class="stx-memory-dream-workbench__card">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <div class="stx-memory-dream-workbench__title">${escapeHtml(proposal.preview)}</div>
                <span class="${statusClass}">${escapeHtml(proposal.status)}</span>
            </div>
            <div class="stx-memory-dream-workbench__meta">
                类型：<span class="stx-memory-dream-workbench__badge">${escapeHtml(proposal.proposalType)}</span>
                置信度：${Number(proposal.confidence).toFixed(2)}
                / dream：${escapeHtml(proposal.dreamId.split(':').pop() || proposal.dreamId).slice(0, 12)}
            </div>
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(proposal.reason)}</div>
            ${proposal.sourceEntryIds.length > 0 ? `<div class="stx-memory-dream-workbench__meta">涉及条目：${escapeHtml(proposal.sourceEntryIds.slice(0, 5).join('、'))}${proposal.sourceEntryIds.length > 5 ? ` +${String(proposal.sourceEntryIds.length - 5)}` : ''}</div>` : ''}
            ${isPending ? `<div style="margin-top:8px;display:flex;gap:8px;">
                <button type="button" data-dream-workbench-action="approve-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">批准应用</button>
                <button type="button" class="stx-btn-danger" data-dream-workbench-action="reject-maintenance" data-proposal-id="${escapeHtml(proposal.proposalId)}">拒绝</button>
            </div>` : ''}
        </article>
    `;
}

function renderQualityCard(report: DreamQualityReport): string {
    return `
        <article class="stx-memory-dream-workbench__card">
            <div class="stx-memory-dream-workbench__title">${escapeHtml(report.dreamId)}</div>
            <div class="stx-memory-dream-workbench__meta">质量分：${Number(report.qualityScore).toFixed(2)} / blocked=${String(report.blockedMutationIds.length)} / forcedReview=${String(report.forcedReviewMutationIds.length)}</div>
            <div class="stx-memory-dream-workbench__hint">${escapeHtml(report.warnings.join('；') || '无额外警告')}</div>
        </article>
    `;
}

function renderSchedulerInfo(schedulerState: DreamSchedulerStateRecord | null): string {
    const settings = readMemoryOSSettings();
    if (!schedulerState) {
        return `<div class="stx-memory-dream-workbench__scheduler-info"><span>调度器尚未初始化</span></div>`;
    }
    const lastTriggered = schedulerState.lastTriggeredAt ? new Date(schedulerState.lastTriggeredAt).toLocaleString('zh-CN') : '从未';
    const lastCompleted = schedulerState.lastCompletedAt ? new Date(schedulerState.lastCompletedAt).toLocaleString('zh-CN') : '从未';
    return `<div class="stx-memory-dream-workbench__scheduler-info">
        <div><span>状态：</span><strong>${schedulerState.active ? '运行中' : '空闲'}</strong></div>
        <div><span>今日已执行：</span><strong>${String(schedulerState.dailyRunCount)} / ${String(settings.dreamSchedulerDailyMaxRuns)}</strong></div>
        <div><span>冷却时间：</span><strong>${String(settings.dreamSchedulerCooldownMinutes)} 分钟</strong></div>
        <div><span>上次触发：</span><strong>${lastTriggered}</strong></div>
        <div><span>上次完成：</span><strong>${lastCompleted}</strong></div>
        <div><span>触发源：</span><strong>${escapeHtml(schedulerState.lastTriggerSource || '-')}</strong></div>
        <div><span>generation_ended：</span><strong>${settings.dreamSchedulerAllowGenerationEndedTrigger ? '✓' : '✗'}</strong></div>
        <div><span>idle 触发（${String(settings.dreamSchedulerIdleMinutes)}分钟）：</span><strong>${settings.dreamSchedulerAllowIdleTrigger ? '✓' : '✗'}</strong></div>
        ${schedulerState.lastDecision?.blockedBy?.length ? `<div><span>阻塞原因：</span><strong>${escapeHtml(schedulerState.lastDecision.blockedBy.join('、'))}</strong></div>` : ''}
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
        chrome: { title: 'Dream Workbench' },
        bodyHtml: '<div data-dream-workbench-root="true"></div>',
        onMount: (instance: SharedDialogInstance): void => {
            const root = instance.content.querySelector('[data-dream-workbench-root="true"]') as HTMLElement | null;
            if (!root) {
                return;
            }
            const memory = getActiveMemorySdk();
            if (!memory) {
                root.innerHTML = '<div class="stx-memory-dream-workbench__hint">当前聊天未连接记忆主链，无法打开 Dream Workbench。</div>';
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
                    const approvedSessions = sessions.filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved').length;
                    const pendingSessions = sessions.filter((item: DreamSessionRecord): boolean => item.approval?.status === 'pending').length;
                    const pendingMaintenance = proposals.filter((item: DreamMaintenanceProposalRecord): boolean => item.status === 'pending').length;
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
                                <div class="stx-memory-dream-workbench__title">Dream Maintenance Pipeline v3</div>
                                <div style="display:flex;gap:8px;">
                                    <button type="button" data-dream-workbench-action="refresh">刷新</button>
                                    <button type="button" data-dream-workbench-action="manual-dream">手动做梦</button>
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__summary">
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">session</div><div class="stx-memory-dream-workbench__title">${String(sessions.length)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">已批准</div><div class="stx-memory-dream-workbench__title">${String(approvedSessions)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">待审批</div><div class="stx-memory-dream-workbench__title">${String(pendingSessions)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">maintenance 待处理</div><div class="stx-memory-dream-workbench__title">${String(pendingMaintenance)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">maintenance 已应用</div><div class="stx-memory-dream-workbench__title">${String(appliedMaintenance)}</div></div>
                                <div class="stx-memory-dream-workbench__summary-card"><div class="stx-memory-dream-workbench__meta">scheduler</div><div class="stx-memory-dream-workbench__title">${schedulerState?.active ? '运行中' : (schedulerState?.lastDecision?.blockedBy?.[0] || '空闲')}</div></div>
                            </div>
                            <div class="stx-memory-dream-workbench__tabs">
                                <button type="button" class="stx-memory-dream-workbench__tab${tabSessionActive}" data-dream-workbench-tab="session">Session</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabDiagnosticsActive}" data-dream-workbench-tab="diagnostics">Diagnostics</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabMaintenanceActive}" data-dream-workbench-tab="maintenance">Maintenance</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabAppliedActive}" data-dream-workbench-tab="applied">Applied Changes</button>
                                <button type="button" class="stx-memory-dream-workbench__tab${tabRollbackActive}" data-dream-workbench-tab="rollback">Rollback</button>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabSessionActive}" data-dream-workbench-panel="session">
                                <div class="stx-memory-dream-workbench__list">${sessions.map((session: DreamSessionRecord): string => renderSessionCard(session)).join('') || '<div class="stx-memory-dream-workbench__hint">暂无 dream session。</div>'}</div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabDiagnosticsActive}" data-dream-workbench-panel="diagnostics">
                                <div class="stx-memory-dream-workbench__card">
                                    <div class="stx-memory-dream-workbench__title">调度器状态</div>
                                    ${renderSchedulerInfo(schedulerState)}
                                </div>
                                <div class="stx-memory-dream-workbench__title">质量报告</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${reports.map((report: DreamQualityReport): string => renderQualityCard(report)).join('') || '<div class="stx-memory-dream-workbench__hint">暂无质量报告。</div>'}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabMaintenanceActive}" data-dream-workbench-panel="maintenance">
                                <div class="stx-memory-dream-workbench__list">
                                    ${proposals.map((proposal: DreamMaintenanceProposalRecord): string => renderMaintenanceCard(proposal)).join('') || '<div class="stx-memory-dream-workbench__hint">暂无 maintenance proposal。</div>'}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabAppliedActive}" data-dream-workbench-panel="applied">
                                <div class="stx-memory-dream-workbench__title">已应用的 Dream 变更 (${String(approvedSessions)})</div>
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
                                                            <span style="color:#81c784;">+新增</span>
                                                            <span style="flex:1">${escapeHtml(afterEntry.title)}</span>
                                                            <span style="opacity:.6">${escapeHtml(afterEntry.entryType)}</span>
                                                        </div>`;
                                                    }
                                                    const changes: string[] = [];
                                                    if (beforeEntry.summary !== afterEntry.summary) changes.push('summary');
                                                    if (beforeEntry.detail !== afterEntry.detail) changes.push('detail');
                                                    if (JSON.stringify(beforeEntry.tags) !== JSON.stringify(afterEntry.tags)) changes.push('tags');
                                                    if (JSON.stringify(beforeEntry.detailPayload) !== JSON.stringify(afterEntry.detailPayload)) changes.push('detailPayload');
                                                    if (changes.length <= 0) return '';
                                                    return `<div class="stx-memory-dream-workbench__mutation-row">
                                                        <span style="color:#64b5f6;">~修改</span>
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
                                                    if (beforeRel.summary !== afterRel.summary) changes.push('summary');
                                                    if (changes.length <= 0) return '';
                                                    return `<div class="stx-memory-dream-workbench__mutation-row">
                                                        <span style="color:#ffb74d;">~关系</span>
                                                        <span style="flex:1">${escapeHtml(afterRel.relationTag || afterRel.relationshipId)}</span>
                                                        <span style="opacity:.6">${escapeHtml(changes.join(', '))}</span>
                                                    </div>`;
                                                }).filter(Boolean).join('');
                                            return `<article class="stx-memory-dream-workbench__card">
                                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                                    <div class="stx-memory-dream-workbench__title">${escapeHtml(m.dreamId)}</div>
                                                    <span class="${statusBadgeClass('approved')}">approved</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta">
                                                    触发：${escapeHtml(m.triggerReason || '-')} / 时间：${escapeHtml(new Date(m.createdAt).toLocaleString('zh-CN'))}
                                                    / 新增条目：${String(createdIds.length)} / 修改条目：${String(patchedIds.length)}
                                                    / 关系变更：${String(relBefore)}→${String(relAfter)}
                                                </div>
                                                ${entryDiffRows || relDiffRows ? `<div style="margin-top:8px;">${entryDiffRows}${relDiffRows}</div>` : '<div class="stx-memory-dream-workbench__hint">无条目或关系变更记录。</div>'}
                                            </article>`;
                                        }).join('') || '<div class="stx-memory-dream-workbench__hint">暂无已应用的 dream 变更。</div>'}
                                </div>
                            </div>
                            <div class="stx-memory-dream-workbench__tab-panel${tabRollbackActive}" data-dream-workbench-panel="rollback">
                                <div class="stx-memory-dream-workbench__title">可回滚的 Dream Session (${String(approvedSessions + rolledBackSessions)})</div>
                                <div class="stx-memory-dream-workbench__list">
                                    ${sessions
                                        .filter((item: DreamSessionRecord): boolean => item.meta?.status === 'approved' || item.meta?.status === 'rolled_back')
                                        .map((session: DreamSessionRecord): string => {
                                            const m = session.meta;
                                            const isRolledBack = m?.status === 'rolled_back';
                                            return `<article class="stx-memory-dream-workbench__card">
                                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                                    <div class="stx-memory-dream-workbench__title">${escapeHtml(m?.dreamId || '')}</div>
                                                    <span class="${statusBadgeClass(m?.status || '')}">${escapeHtml(m?.status || '')}</span>
                                                </div>
                                                <div class="stx-memory-dream-workbench__meta">
                                                    触发：${escapeHtml(m?.triggerReason || '-')} / 时间：${escapeHtml(m ? new Date(m.createdAt).toLocaleString('zh-CN') : '-')}
                                                    / 涉及条目：${String(session.rollbackMetadata?.affectedEntryIds?.length ?? 0)}
                                                    / 涉及关系：${String(session.rollbackMetadata?.affectedRelationshipIds?.length ?? 0)}
                                                </div>
                                                ${!isRolledBack
                                                    ? `<div style="margin-top:8px;"><button type="button" class="stx-btn-danger" data-dream-workbench-action="rollback" data-dream-id="${escapeHtml(m?.dreamId || '')}">执行回滚</button></div>`
                                                    : `<div class="stx-memory-dream-workbench__meta" style="margin-top:4px;">已于 ${escapeHtml(session.rollbackMetadata?.rolledBackAt ? new Date(session.rollbackMetadata.rolledBackAt).toLocaleString('zh-CN') : '-')} 回滚</div>`
                                                }
                                            </article>`;
                                        }).join('') || '<div class="stx-memory-dream-workbench__hint">暂无可回滚的 dream session。</div>'}
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
                        void memory.chatState.startDreamSession('manual').then(() => render());
                    });
                    root.querySelectorAll('[data-dream-workbench-action="rollback"]').forEach((button: Element): void => {
                        button.addEventListener('click', (): void => {
                            const dreamId = String((button as HTMLElement).getAttribute('data-dream-id') ?? '').trim();
                            if (!dreamId) {
                                return;
                            }
                            void memory.chatState.rollbackDreamSession(dreamId).then((result) => {
                                if (!result.ok) {
                                    toast.error(`梦境回滚失败：${result.reasonCode || 'unknown'}`);
                                    return;
                                }
                                toast.success('已回滚该次 dream 影响。');
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
                                    toast.error(`单条 mutation 回滚失败：${result.reasonCode || 'unknown'}`);
                                    return;
                                }
                                toast.success('已回滚该条 mutation。');
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
                                    toast.error(`维护提案应用失败：${result.reasonCode || 'unknown'}`);
                                    return;
                                }
                                toast.success('维护提案已应用。');
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
                                    toast.error(`维护提案拒绝失败：${result.reasonCode || 'unknown'}`);
                                    return;
                                }
                                toast.info('维护提案已拒绝。');
                                void render();
                            });
                        });
                    });
                } catch (error) {
                    logger.error('加载 Dream Workbench 失败', error);
                    root.innerHTML = `<div class="stx-memory-dream-workbench__hint">Dream Workbench 加载失败：${escapeHtml(String((error as Error)?.message ?? error))}</div>`;
                }
            };
            void render();
        },
    });
}
