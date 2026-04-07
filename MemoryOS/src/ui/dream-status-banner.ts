import type { DreamUiPhase, DreamUiStateSnapshot } from './dream-ui-state-service';

const BANNER_STYLE_ID = 'stx-memory-dream-status-banner-style';

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：phase 展示文案。
 */
const PHASE_TEXT: Record<DreamUiPhase, string> = {
    queued: '梦境排队中',
    running: '梦境运行中',
    recalling: '正在回溯记忆',
    generating: '正在生成梦境结果',
    post_processing: '正在整理维护提案',
    waiting_approval: '等待你审核',
    auto_applying: '正在自动应用低风险维护',
    completed: '梦境已完成',
    failed: '梦境执行失败',
    rolled_back: '梦境已回滚',
};

/**
 * 功能：execution mode 展示文案。
 */
function resolveExecutionModeLabel(mode?: string): string {
    if (mode === 'manual_review') return '手动审批模式';
    if (mode === 'silent') return '静默模式';
    return '';
}

/**
 * 功能：run profile 展示文案。
 */
function resolveRunProfileLabel(profile?: string): string {
    if (profile === 'auto_light') return '自动轻梦境';
    if (profile === 'auto_review') return '自动待审批梦境';
    if (profile === 'manual_deep') return '手动深梦境';
    return '';
}

/**
 * 功能：trigger reason 展示文案。
 */
function resolveTriggerLabel(trigger?: string): string {
    if (trigger === 'manual') return '手动';
    if (trigger === 'generation_ended') return '回复结束';
    if (trigger === 'idle') return '空闲触发';
    return '';
}

function ensureBannerStyle(): void {
    if (document.getElementById(BANNER_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = BANNER_STYLE_ID;
    style.textContent = `
        .stx-dream-banner { display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding:10px 14px; border-radius:12px; border:1px solid rgba(255,255,255,.08); background:rgba(255,255,255,.03); font-size:12px; line-height:1.5; }
        .stx-dream-banner.is-running { border-color:rgba(100,181,246,.25); background:rgba(100,181,246,.06); }
        .stx-dream-banner.is-pending { border-color:rgba(255,152,0,.25); background:rgba(255,152,0,.06); }
        .stx-dream-banner.is-completed { border-color:rgba(76,175,80,.2); background:rgba(76,175,80,.04); }
        .stx-dream-banner.is-failed { border-color:rgba(244,67,54,.25); background:rgba(244,67,54,.06); }
        .stx-dream-banner__icon { font-size:14px; opacity:.8; }
        .stx-dream-banner__text { flex:1; min-width:120px; }
        .stx-dream-banner__main { font-weight:600; }
        .stx-dream-banner__sub { opacity:.7; margin-top:2px; }
        .stx-dream-banner__actions { display:flex; gap:6px; flex-shrink:0; }
        .stx-dream-banner__btn { border:1px solid rgba(255,255,255,.14); border-radius:8px; padding:4px 10px; background:rgba(255,255,255,.06); color:inherit; cursor:pointer; font-size:11px; transition:background .15s; }
        .stx-dream-banner__btn:hover { background:rgba(255,255,255,.14); }
        .stx-dream-banner--hidden { display:none !important; }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：根据 snapshot 构建 Dream Status Banner 的 HTML 标记。
 * 用于嵌入到 Workbench 头部概览区。
 */
export function buildDreamStatusBannerMarkup(snapshot: DreamUiStateSnapshot): string {
    ensureBannerStyle();
    const parts: string[] = [];

    // 当前活跃任务
    if (snapshot.activeTask.exists && snapshot.activeTask.phase && snapshot.activeTask.phase !== 'completed') {
        const phase = snapshot.activeTask.phase;
        const phaseText = PHASE_TEXT[phase] || '梦境运行中';
        const modeLabel = resolveExecutionModeLabel(snapshot.activeTask.executionMode);
        const profileLabel = resolveRunProfileLabel(snapshot.activeTask.runProfile);
        const triggerLabel = resolveTriggerLabel(snapshot.activeTask.triggerReason);
        const subParts = [triggerLabel, modeLabel, profileLabel].filter(Boolean).join(' · ');
        const startTimeText = snapshot.activeTask.startedAt
            ? new Date(snapshot.activeTask.startedAt).toLocaleTimeString('zh-CN')
            : '';
        const colorClass = phase === 'waiting_approval' ? 'is-pending' : 'is-running';
        const icon = phase === 'waiting_approval' ? 'fa-solid fa-bell' : 'fa-solid fa-spinner fa-spin';
        parts.push(`
            <div class="stx-dream-banner ${colorClass}">
                <span class="stx-dream-banner__icon"><i class="${icon}"></i></span>
                <div class="stx-dream-banner__text">
                    <div class="stx-dream-banner__main">${escapeHtml(phaseText)}</div>
                    <div class="stx-dream-banner__sub">${escapeHtml(subParts)}${startTimeText ? ` · 开始于 ${escapeHtml(startTimeText)}` : ''}</div>
                </div>
            </div>
        `);
    }

    // 待审批入口
    if (snapshot.inbox.pendingApprovalCount > 0) {
        const count = snapshot.inbox.pendingApprovalCount;
        const text = count === 1 ? '1 条梦境结果待审核' : `${count} 条梦境结果待审核`;
        parts.push(`
            <div class="stx-dream-banner is-pending">
                <span class="stx-dream-banner__icon"><i class="fa-solid fa-inbox"></i></span>
                <div class="stx-dream-banner__text">
                    <div class="stx-dream-banner__main">${escapeHtml(text)}</div>
                    <div class="stx-dream-banner__sub">点击进入审核以查看梦境提案详情</div>
                </div>
                <div class="stx-dream-banner__actions">
                    <button type="button" class="stx-dream-banner__btn" data-action="dream-open-pending-review">打开审核</button>
                </div>
            </div>
        `);
    }

    // 最近完成（10 分钟内）
    if (snapshot.latestCompleted) {
        const age = Date.now() - (snapshot.latestCompleted.completedAt ?? 0);
        if (age < 10 * 60 * 1000) {
            const summary = snapshot.latestCompleted.summaryText || '梦境已完成';
            const profileLabel = resolveRunProfileLabel(snapshot.latestCompleted.runProfile);
            parts.push(`
                <div class="stx-dream-banner is-completed">
                    <span class="stx-dream-banner__icon"><i class="fa-solid fa-check-circle"></i></span>
                    <div class="stx-dream-banner__text">
                        <div class="stx-dream-banner__main">${escapeHtml(summary)}</div>
                        <div class="stx-dream-banner__sub">${escapeHtml(profileLabel)}${snapshot.latestCompleted.completedAt ? ` · ${new Date(snapshot.latestCompleted.completedAt).toLocaleTimeString('zh-CN')}` : ''}</div>
                    </div>
                </div>
            `);
        }
    }

    // 最近失败（10 分钟内）
    if (snapshot.latestFailed) {
        const age = Date.now() - (snapshot.latestFailed.failedAt ?? 0);
        if (age < 10 * 60 * 1000) {
            const reason = snapshot.latestFailed.reason || '未知原因';
            parts.push(`
                <div class="stx-dream-banner is-failed">
                    <span class="stx-dream-banner__icon"><i class="fa-solid fa-exclamation-triangle"></i></span>
                    <div class="stx-dream-banner__text">
                        <div class="stx-dream-banner__main">梦境执行失败</div>
                        <div class="stx-dream-banner__sub">${escapeHtml(reason)}</div>
                    </div>
                </div>
            `);
        }
    }

    if (parts.length === 0) return '';
    return `<div class="stx-dream-banner-group" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">${parts.join('')}</div>`;
}
