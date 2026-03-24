import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { escapeHtml } from '../editorShared';
import { getHealthSnapshot, onHealthChange, refreshHealthSnapshot } from '../../llm/ai-health-center';
import type { MemoryAiHealthSnapshot, MemoryAiTaskId } from '../../llm/ai-health-types';
import type { RoutePreviewSnapshot } from '../../../../SDK/stx';
import { toast } from '../../index';

interface AboutDiagnosticsTabBindOptions {
    ids: MemoryOSSettingsIds;
}

const TASK_LABELS: Record<MemoryAiTaskId, string> = {
    'memory.coldstart.summarize': '冷启动摘要',
    'memory.ingest': '统一记忆处理',
    'world.template.build': '模板构建',
    'memory.vector.embed': '向量嵌入',
    'memory.search.rerank': '召回重排',
};

/**
 * 功能：构建“关于与诊断”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildAboutDiagnosticsTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelAboutId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
        <div class="stx-ui-divider"><i class="fa-solid fa-circle-info"></i><span>关于插件</span><div class="stx-ui-divider-line"></div></div>
        <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="about version author email github" style="margin-bottom:12px;align-items:flex-start;">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">${ids.displayName}</div>
            <div class="stx-ui-item-desc stx-ui-about-meta">
              <span class="stx-ui-about-meta-item"><i class="fa-solid fa-tag"></i><span>版本：${ids.badgeText}</span></span>
              <span class="stx-ui-about-meta-item"><i class="fa-solid fa-user"></i><span>作者：${ids.authorText}</span></span>
              <span class="stx-ui-about-meta-item"><i class="fa-solid fa-envelope"></i><span>邮箱：<a href="mailto:${ids.emailText}">${ids.emailText}</a></span></span>
              <span class="stx-ui-about-meta-item"><i class="fa-brands fa-github"></i><span>GitHub：<a href="${ids.githubUrl}" target="_blank" rel="noopener">${ids.githubText}</a></span></span>
            </div>
          </div>
        </div>
        <div class="stx-ui-item stx-ui-search-item" style="flex-direction:column;align-items:flex-start;margin-bottom:12px;" data-stx-ui-search="changelog updates history">
          <div class="stx-ui-item-title">更新日志（Changelog）</div>
          <div class="stx-ui-changelog">${ids.changelogHtml}</div>
        </div>
        <div class="stx-ui-divider"><i class="fa-solid fa-stethoscope"></i><span>AI 诊断</span><div class="stx-ui-divider-line"></div></div>
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai diagnosis overview capabilities status">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">AI 总览</div>
            <div class="stx-ui-item-desc">显示 LLMHub 挂载、consumer 注册、能力状态和当前诊断结果。</div>
          </div>
          <div id="${ids.aiDiagOverviewId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">正在加载诊断信息...</div>
        </div>
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route preview model provider generation embedding rerank">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">当前测试路由</div>
            <div class="stx-ui-item-desc">显示生成、向量、重排三类任务当前会命中的资源与模型。</div>
          </div>
          <div id="${ids.aiRoutePreviewId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">正在读取当前路由...</div>
        </div>
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai capabilities chat json embeddings rerank">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">能力状态</div>
            <div class="stx-ui-item-desc">分别显示 chat、json、embeddings、rerank 的可用状态。</div>
          </div>
          <div id="${ids.aiDiagCapabilitiesId}" style="width:100%;display:flex;flex-wrap:wrap;gap:8px;"></div>
        </div>
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai recent tasks history status">
          <div class="stx-ui-item-main">
            <div class="stx-ui-item-title">最近任务</div>
            <div class="stx-ui-item-desc">显示最近任务执行记录与错误原因。</div>
          </div>
          <div id="${ids.aiDiagRecentTasksId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;max-height:240px;overflow-y:auto;font-family:monospace;white-space:pre-wrap;">暂无任务记录</div>
          <div class="stx-ui-actions">
            <button id="${ids.aiDiagRefreshBtnId}" type="button" class="stx-ui-btn secondary"><i class="fa-solid fa-rotate"></i>&nbsp;刷新诊断</button>
          </div>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：格式化路由预览文字。
 * @param route 路由快照。
 * @returns 展示文本。
 */
function formatRoutePreview(route: RoutePreviewSnapshot | null): string {
    if (!route) {
        return '当前没有可用路由。';
    }
    return `${route.resourceLabel || route.resourceId || '未分配'} 路 ${route.model || '未设模型'}`;
}

/**
 * 功能：渲染路由预览。
 * @param ids 控件 ID 集合。
 * @param snapshot 健康快照。
 * @returns 无返回值。
 */
function renderAiRoutePreview(ids: MemoryOSSettingsIds, snapshot: MemoryAiHealthSnapshot): void {
    const host = document.getElementById(ids.aiRoutePreviewId);
    if (!host) {
        return;
    }
    host.innerHTML = [
        `生成：${escapeHtml(formatRoutePreview(snapshot.routeOverview.generation))}`,
        `向量：${escapeHtml(formatRoutePreview(snapshot.routeOverview.embedding))}`,
        `重排：${escapeHtml(formatRoutePreview(snapshot.routeOverview.rerank))}`,
    ].join('<br>');
}

/**
 * 功能：刷新 AI 诊断面板。
 * @param ids 控件 ID 集合。
 * @param forceRefresh 是否先主动刷新。
 * @returns 无返回值。
 */
async function refreshAiDiagnostics(ids: MemoryOSSettingsIds, forceRefresh: boolean): Promise<void> {
    if (forceRefresh) {
        await refreshHealthSnapshot();
    }
    const snapshot = getHealthSnapshot();
    const overviewEl = document.getElementById(ids.aiDiagOverviewId);
    const capabilitiesEl = document.getElementById(ids.aiDiagCapabilitiesId);
    const recentTasksEl = document.getElementById(ids.aiDiagRecentTasksId);
    if (overviewEl) {
        overviewEl.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:8px;">
            <strong>${escapeHtml(snapshot.diagnosisText)}</strong>
            <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;opacity:0.85;">
              <span>LLMHub 挂载：${snapshot.llmHubMounted ? '是' : '否'}</span>
              <span>Consumer 注册：${snapshot.consumerRegistered ? '已注册' : '未注册'}</span>
              <span>AI 模式：${snapshot.aiModeEnabled ? '启用' : '关闭'}</span>
            </div>
          </div>
        `;
    }
    renderAiRoutePreview(ids, snapshot);
    if (capabilitiesEl) {
        capabilitiesEl.innerHTML = snapshot.capabilities.map((item) => `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:4px;background:rgba(0,0,0,0.2);font-size:12px;">${escapeHtml(item.capability)}：${escapeHtml(item.state)}</span>`).join('');
    }
    if (recentTasksEl) {
        recentTasksEl.innerHTML = Object.keys(snapshot.tasks).map((taskId) => {
            const key = taskId as MemoryAiTaskId;
            const task = snapshot.tasks[key];
            return `${TASK_LABELS[key]}：${task.state}${task.lastRecord ? ` (${new Date(task.lastRecord.ts).toLocaleTimeString()} / ${task.lastRecord.durationMs}ms)` : ''}`;
        }).join('<br>');
    }
}

/**
 * 功能：绑定“关于与诊断”页签事件。
 * @param options 绑定参数。
 * @returns 无返回值。
 */
export function bindAboutDiagnosticsTab(options: AboutDiagnosticsTabBindOptions): void {
    const { ids } = options;
    document.getElementById(ids.aiDiagRefreshBtnId)?.addEventListener('click', async (): Promise<void> => {
        await refreshAiDiagnostics(ids, true);
        toast.success('诊断信息已刷新。');
    });
    document.getElementById(ids.tabAboutId)?.addEventListener('click', (): void => {
        void refreshAiDiagnostics(ids, true);
    });
    void refreshAiDiagnostics(ids, true);
    onHealthChange((): void => {
        void refreshAiDiagnostics(ids, false);
    });
}
