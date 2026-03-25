import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { escapeHtml } from '../editorShared';
import { getHealthSnapshot, onHealthChange, refreshHealthSnapshot } from '../../llm/ai-health-center';
import type { MemoryAiHealthSnapshot, MemoryAiTaskId } from '../../llm/ai-health-types';
import { runAiSelfTests, runSingleSelfTest } from '../../llm/ai-self-test';
import type { AiSelfTestResult } from '../../llm/ai-self-test';
import type { RoutePreviewSnapshot } from '../../../../SDK/stx';
import { toast } from '../../runtime/runtime-services';

interface AboutDiagnosticsTabBindOptions {
    ids: MemoryOSSettingsIds;
}

type SupportedSelfTestTaskId =
    | 'memory.ingest'
    | 'world.template.build'
    | 'memory.vector.embed'
    | 'memory.search.rerank';

interface SelfTestTaskDefinition {
    taskId: SupportedSelfTestTaskId;
    label: string;
    description: string;
}

interface AiSelfTestViewState {
    pendingTaskId: SupportedSelfTestTaskId | 'all' | null;
    results: Partial<Record<SupportedSelfTestTaskId, AiSelfTestResult>>;
    lastRunAt: number | null;
}

const TASK_LABELS: Record<MemoryAiTaskId, string> = {
    'memory.coldstart.summarize': '冷启动摘要',
    'memory.ingest': '统一记忆处理',
    'world.template.build': '模板构建',
    'memory.vector.embed': '向量嵌入',
    'memory.search.rerank': '召回重排',
};

const SELF_TEST_TASKS: SelfTestTaskDefinition[] = [
    {
        taskId: 'memory.ingest',
        label: '统一记忆处理',
        description: '验证生成模型能否完成结构化记忆抽取。',
    },
    {
        taskId: 'world.template.build',
        label: '模板构建',
        description: '验证生成模型能否返回模板构建所需的结构化结果。',
    },
    {
        taskId: 'memory.vector.embed',
        label: '向量嵌入',
        description: '验证向量模型是否能正常返回 embedding。',
    },
    {
        taskId: 'memory.search.rerank',
        label: '召回重排',
        description: '验证 rerank 模型是否能正常完成候选重排。',
    },
];

const aiSelfTestState: AiSelfTestViewState = {
    pendingTaskId: null,
    results: {},
    lastRunAt: null,
};

/**
 * 功能：构建“关于与诊断”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildAboutDiagnosticsTabPanel(ids: MemoryOSSettingsIds): string {
    const selfTestButtons: string = SELF_TEST_TASKS.map((task: SelfTestTaskDefinition): string => `
      <button
        type="button"
        class="stx-ui-btn secondary"
        data-memory-ai-self-test-task="${task.taskId}"
        title="${escapeHtml(task.description)}"
      >
        <i class="fa-solid fa-flask-vial"></i>&nbsp;测试${escapeHtml(task.label)}
      </button>
    `).join('');

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
        <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai self test model diagnostics generation embedding rerank">
          <div id="${ids.aiSelfTestPanelId}" style="width:100%;display:flex;flex-direction:column;gap:10px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">模型功能自测</div>
              <div class="stx-ui-item-desc">直接测试当前生成、向量、重排链路是否可用，不写入聊天数据，只返回诊断结果。</div>
            </div>
            <div id="${ids.aiSelfTestSummaryId}" style="width:100%;font-size:12px;color:var(--ss-theme-text,#ccc);background:rgba(0,0,0,0.2);border-radius:6px;padding:10px;">尚未执行自测。</div>
            <div class="stx-ui-actions" style="gap:8px;flex-wrap:wrap;">
              <button id="${ids.aiSelfTestRunAllBtnId}" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-vial-circle-check"></i>&nbsp;测试全部
              </button>
              ${selfTestButtons}
            </div>
            <div id="${ids.aiSelfTestResultId}" style="width:100%;display:flex;flex-direction:column;gap:8px;"></div>
          </div>
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
    return `${route.resourceLabel || route.resourceId || '未分配资源'} / ${route.model || '未设置模型'}`;
}

/**
 * 功能：格式化时间戳。
 * @param value 时间戳。
 * @returns 本地时间文本。
 */
function formatLocalTime(value: number | null): string {
    if (!value) {
        return '未执行';
    }
    return new Date(value).toLocaleTimeString();
}

/**
 * 功能：格式化耗时文本。
 * @param durationMs 耗时毫秒。
 * @returns 耗时文本。
 */
function formatDuration(durationMs: number): string {
    return `${Math.max(0, Math.round(durationMs))}ms`;
}

/**
 * 功能：判断结果是否属于阻塞状态。
 * @param result 自测结果。
 * @returns 是否阻塞。
 */
function isBlockedResult(result: AiSelfTestResult): boolean {
    return !result.ok && Boolean(result.blockedReason);
}

/**
 * 功能：构建自测结果状态标签。
 * @param taskId 任务 ID。
 * @returns 状态文本。
 */
function buildSelfTestStatus(taskId: SupportedSelfTestTaskId): string {
    if (aiSelfTestState.pendingTaskId === 'all' || aiSelfTestState.pendingTaskId === taskId) {
        return '测试中';
    }
    const result = aiSelfTestState.results[taskId];
    if (!result) {
        return '未测试';
    }
    if (result.ok) {
        return '成功';
    }
    if (isBlockedResult(result)) {
        return '阻塞';
    }
    return '失败';
}

/**
 * 功能：返回状态对应的颜色。
 * @param status 状态文本。
 * @returns 颜色值。
 */
function getSelfTestStatusColor(status: string): string {
    switch (status) {
        case '成功':
            return '#34d399';
        case '失败':
            return '#f87171';
        case '阻塞':
            return '#fbbf24';
        case '测试中':
            return '#60a5fa';
        default:
            return 'var(--ss-theme-text,#ccc)';
    }
}

/**
 * 功能：构建结果附加说明。
 * @param result 自测结果。
 * @returns 附加说明数组。
 */
function buildSelfTestMetaLines(result: AiSelfTestResult): string[] {
    const lines: string[] = [];
    if (result.resourceLabel || result.resourceId) {
        lines.push(`资源：${result.resourceLabel || result.resourceId}`);
    }
    if (result.model) {
        lines.push(`模型：${result.model}`);
    }
    if (result.resolvedBy) {
        lines.push(`路由来源：${result.resolvedBy}`);
    }
    if (result.detail) {
        lines.push(`说明：${result.detail}`);
    }
    if (result.error) {
        lines.push(`错误：${result.error}`);
    }
    if (result.blockedReason && result.blockedReason !== result.error) {
        lines.push(`阻塞原因：${result.blockedReason}`);
    }
    return lines;
}

/**
 * 功能：渲染单项自测结果。
 * @param task 任务定义。
 * @returns HTML 文本。
 */
function renderSingleSelfTestResult(task: SelfTestTaskDefinition): string {
    const result = aiSelfTestState.results[task.taskId];
    const status = buildSelfTestStatus(task.taskId);
    const color = getSelfTestStatusColor(status);
    const metaLines = result ? buildSelfTestMetaLines(result) : [];
    const previewHtml = result?.responsePreview
        ? `
            <details style="margin-top:8px;">
              <summary style="cursor:pointer;">查看返回预览</summary>
              <pre style="margin-top:8px;white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,0.18);padding:8px;border-radius:6px;">${escapeHtml(result.responsePreview)}</pre>
            </details>
          `
        : '';
    return `
      <div style="border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:10px;background:rgba(0,0,0,0.12);">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <strong>${escapeHtml(task.label)}</strong>
            <span style="font-size:12px;opacity:0.82;">${escapeHtml(task.description)}</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;align-items:center;">
            <span style="color:${color};font-weight:600;">${escapeHtml(status)}</span>
            <span>耗时：${escapeHtml(result ? formatDuration(result.durationMs) : '--')}</span>
          </div>
        </div>
        ${metaLines.length > 0 ? `<div style="margin-top:8px;font-size:12px;display:flex;flex-direction:column;gap:4px;">${metaLines.map((line: string): string => `<span>${escapeHtml(line)}</span>`).join('')}</div>` : ''}
        ${previewHtml}
      </div>
    `;
}

/**
 * 功能：渲染模型功能自测区域。
 * @param ids 控件 ID 集合。
 * @returns 无返回值。
 */
function renderAiSelfTestPanel(ids: MemoryOSSettingsIds): void {
    const summaryEl = document.getElementById(ids.aiSelfTestSummaryId);
    const resultEl = document.getElementById(ids.aiSelfTestResultId);
    const runAllBtn = document.getElementById(ids.aiSelfTestRunAllBtnId) as HTMLButtonElement | null;
    const panelEl = document.getElementById(ids.aiSelfTestPanelId);
    const isRunning = aiSelfTestState.pendingTaskId !== null;
    const pendingTaskId = aiSelfTestState.pendingTaskId;
    const resultList = SELF_TEST_TASKS.map((task: SelfTestTaskDefinition): AiSelfTestResult | null => aiSelfTestState.results[task.taskId] || null).filter(Boolean) as AiSelfTestResult[];
    const successCount = resultList.filter((item: AiSelfTestResult): boolean => item.ok).length;
    const blockedCount = resultList.filter((item: AiSelfTestResult): boolean => isBlockedResult(item)).length;
    const failedCount = resultList.filter((item: AiSelfTestResult): boolean => !item.ok && !isBlockedResult(item)).length;

    if (summaryEl) {
        if (pendingTaskId) {
            summaryEl.innerHTML = `正在执行模型功能自测：${pendingTaskId === 'all' ? '全部任务' : escapeHtml(TASK_LABELS[pendingTaskId])}。`;
        } else if (resultList.length === 0) {
            summaryEl.innerHTML = '尚未执行自测。支持直接测试统一记忆处理、模板构建、向量嵌入与召回重排。';
        } else {
            summaryEl.innerHTML = [
                `最近执行：${escapeHtml(formatLocalTime(aiSelfTestState.lastRunAt))}`,
                `成功 ${successCount} 项`,
                `阻塞 ${blockedCount} 项`,
                `失败 ${failedCount} 项`,
            ].join(' ｜ ');
        }
    }

    if (runAllBtn) {
        runAllBtn.disabled = isRunning;
        runAllBtn.innerHTML = isRunning && aiSelfTestState.pendingTaskId === 'all'
            ? '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp;正在测试全部'
            : '<i class="fa-solid fa-vial-circle-check"></i>&nbsp;测试全部';
    }

    if (panelEl) {
        panelEl.querySelectorAll<HTMLButtonElement>('[data-memory-ai-self-test-task]').forEach((button: HTMLButtonElement): void => {
            const taskId = button.dataset.memoryAiSelfTestTask as SupportedSelfTestTaskId | undefined;
            const isTaskRunning = taskId ? aiSelfTestState.pendingTaskId === taskId : false;
            button.disabled = isRunning;
            if (taskId) {
                button.innerHTML = isTaskRunning
                    ? '<i class="fa-solid fa-spinner fa-spin"></i>&nbsp;测试中'
                    : `<i class="fa-solid fa-flask-vial"></i>&nbsp;测试${escapeHtml(TASK_LABELS[taskId])}`;
            }
        });
    }

    if (resultEl) {
        resultEl.innerHTML = SELF_TEST_TASKS.map((task: SelfTestTaskDefinition): string => renderSingleSelfTestResult(task)).join('');
    }
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
        recentTasksEl.innerHTML = Object.keys(snapshot.tasks).map((taskId: string): string => {
            const key = taskId as MemoryAiTaskId;
            const task = snapshot.tasks[key];
            return `${TASK_LABELS[key]}：${task.state}${task.lastRecord ? ` (${new Date(task.lastRecord.ts).toLocaleTimeString()} / ${task.lastRecord.durationMs}ms)` : ''}`;
        }).join('<br>');
    }
    renderAiSelfTestPanel(ids);
}

/**
 * 功能：执行单项模型功能自测。
 * @param ids 控件 ID 集合。
 * @param taskId 任务 ID。
 * @returns 无返回值。
 */
async function executeSingleSelfTest(ids: MemoryOSSettingsIds, taskId: SupportedSelfTestTaskId): Promise<void> {
    if (aiSelfTestState.pendingTaskId) {
        toast.info('当前已有模型功能自测正在执行，请稍候。');
        return;
    }
    aiSelfTestState.pendingTaskId = taskId;
    renderAiSelfTestPanel(ids);
    try {
        const result = await runSingleSelfTest(taskId);
        aiSelfTestState.results[taskId] = result;
        aiSelfTestState.lastRunAt = Date.now();
        await refreshAiDiagnostics(ids, true);
        toast[result.ok ? 'success' : isBlockedResult(result) ? 'warning' : 'error'](
            result.ok
                ? `${TASK_LABELS[taskId]}测试成功`
                : `${TASK_LABELS[taskId]}测试失败：${result.error || result.blockedReason || '未知原因'}`,
        );
    } catch (error: unknown) {
        aiSelfTestState.results[taskId] = {
            taskId,
            ok: false,
            durationMs: 0,
            error: String((error as Error)?.message || error),
            responsePreview: '',
        };
        aiSelfTestState.lastRunAt = Date.now();
        toast.error(`${TASK_LABELS[taskId]}测试异常：${String((error as Error)?.message || error)}`);
    } finally {
        aiSelfTestState.pendingTaskId = null;
        renderAiSelfTestPanel(ids);
    }
}

/**
 * 功能：执行全部模型功能自测。
 * @param ids 控件 ID 集合。
 * @returns 无返回值。
 */
async function executeAllSelfTests(ids: MemoryOSSettingsIds): Promise<void> {
    if (aiSelfTestState.pendingTaskId) {
        toast.info('当前已有模型功能自测正在执行，请稍候。');
        return;
    }
    aiSelfTestState.pendingTaskId = 'all';
    renderAiSelfTestPanel(ids);
    try {
        const results = await runAiSelfTests();
        results.forEach((result: AiSelfTestResult): void => {
            const taskId = result.taskId as SupportedSelfTestTaskId;
            aiSelfTestState.results[taskId] = result;
        });
        aiSelfTestState.lastRunAt = Date.now();
        await refreshAiDiagnostics(ids, true);
        const successCount = results.filter((item: AiSelfTestResult): boolean => item.ok).length;
        const blockedCount = results.filter((item: AiSelfTestResult): boolean => isBlockedResult(item)).length;
        const failedCount = results.length - successCount - blockedCount;
        if (failedCount > 0) {
            toast.warning(`模型功能自测完成：成功 ${successCount} 项，阻塞 ${blockedCount} 项，失败 ${failedCount} 项。`);
        } else {
            toast.success(`模型功能自测完成：成功 ${successCount} 项，阻塞 ${blockedCount} 项。`);
        }
    } catch (error: unknown) {
        aiSelfTestState.lastRunAt = Date.now();
        toast.error(`模型功能自测异常：${String((error as Error)?.message || error)}`);
    } finally {
        aiSelfTestState.pendingTaskId = null;
        renderAiSelfTestPanel(ids);
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
    document.getElementById(ids.aiSelfTestRunAllBtnId)?.addEventListener('click', (): void => {
        void executeAllSelfTests(ids);
    });
    document.getElementById(ids.aiSelfTestPanelId)?.addEventListener('click', (event: Event): void => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest<HTMLButtonElement>('[data-memory-ai-self-test-task]');
        const taskId = button?.dataset.memoryAiSelfTestTask as SupportedSelfTestTaskId | undefined;
        if (!taskId) {
            return;
        }
        void executeSingleSelfTest(ids, taskId);
    });
    document.getElementById(ids.tabAboutId)?.addEventListener('click', (): void => {
        void refreshAiDiagnostics(ids, true);
    });
    renderAiSelfTestPanel(ids);
    void refreshAiDiagnostics(ids, true);
    onHealthChange((): void => {
        void refreshAiDiagnostics(ids, false);
    });
}
