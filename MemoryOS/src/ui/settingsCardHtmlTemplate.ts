import { buildSharedCheckboxCard } from "../../../_Components/sharedCheckbox";
import { buildSharedSelectField } from "../../../_Components/sharedSelect";
import type { MemoryOSSettingsIds } from "./settingsCardTemplateTypes";

/**
 * 功能：构建只显示开关控件的紧凑复选框。
 * @param id 控件 ID。
 * @param title 无障碍标题。
 * @param dataTip 提示文本。
 * @returns 复选框 HTML。
 */
function buildControlOnlyCheckbox(
  id: string,
  title: string,
  dataTip: string,
): string {
  return buildSharedCheckboxCard({
    id,
    title,
    containerClassName: "stx-ui-inline-checkbox is-control-only",
    inputAttributes: {
      "data-tip": dataTip,
      "aria-label": title,
    },
  });
}

/**
 * 功能：构建带标题的紧凑复选框。
 * @param id 控件 ID。
 * @param title 标题文本。
 * @param dataTip 提示文本。
 * @returns 复选框 HTML。
 */
function buildCompactCheckbox(
  id: string,
  title: string,
  dataTip: string,
): string {
  return buildSharedCheckboxCard({
    id,
    title,
    containerClassName: "stx-ui-inline-checkbox is-compact",
    inputAttributes: {
      "data-tip": dataTip,
      "aria-label": title,
    },
  });
}

/**
 * 功能：构建紧凑型共享选择框。
 * @param id 控件 ID。
 * @param dataTip 提示文本。
 * @param options 下拉选项列表。
 * @returns 共享选择框 HTML。
 */
function buildCompactSharedSelect(
  id: string,
  dataTip: string,
  options: Array<{ value: string; label: string; disabled?: boolean }>,
): string {
  return buildSharedSelectField({
    id,
    containerClassName: "stx-ui-shared-select stx-ui-shared-select-inline",
    selectClassName: "stx-ui-input",
    triggerClassName: "stx-ui-input-full",
    triggerAttributes: {
      "data-tip": dataTip,
    },
    options,
  });
}

/**
 * 功能：构建 MemoryOS 设置面板 HTML。
 * 参数：
 *   ids：所有 DOM 元素 ID 映射。
 * 返回：
 *   string：可直接挂载的 HTML 字符串。
 */
export function buildSettingsCardHtmlTemplate(
  ids: MemoryOSSettingsIds,
): string {
  const memoryEnabledCheckbox = buildSharedCheckboxCard({
    id: ids.enabledId,
    title: "启用 Memory OS",
    containerClassName: "stx-ui-inline-checkbox is-control-only",
    inputAttributes: {
      "data-tip": "MemoryOS 总开关。",
      "aria-label": "启用 Memory OS",
    },
  });

  const aiModeCheckbox = buildSharedCheckboxCard({
    id: ids.aiModeEnabledId,
    title: "启用 AI 模式",
    containerClassName: "stx-ui-inline-checkbox is-control-only",
    inputAttributes: {
      "data-tip": "开启后使用 AI 抽取事实。",
      "aria-label": "启用 AI 模式",
    },
  });

  const autoCompactionCheckbox = buildSharedCheckboxCard({
    id: ids.autoCompactionId,
    title: "自动压缩历史事件",
    containerClassName: "stx-ui-inline-checkbox is-control-only",
    inputAttributes: {
      "data-tip": "自动压缩历史事件。",
      "aria-label": "自动压缩历史事件",
    },
  });

  const templateActiveSelect = buildSharedSelectField({
    id: ids.templateActiveSelectId,
    containerClassName: "stx-ui-shared-select stx-ui-shared-select-inline",
    selectClassName: "stx-ui-input",
    triggerClassName: "stx-ui-input-full",
    triggerAttributes: { "data-tip": "选择要启用的模板。" },
    options: [{ value: "", label: "选择要激活的模板..." }],
  });

  const logicTableEntitySelect = buildSharedSelectField({
    id: ids.logicTableEntitySelectId,
    containerClassName: "stx-ui-shared-select stx-ui-shared-select-inline",
    selectClassName: "stx-ui-input",
    triggerClassName: "stx-ui-input-full",
    triggerAttributes: { "data-tip": "选择要查看的实体类型。" },
    options: [{ value: "", label: "选择实体类型..." }],
  });

  const aiSelfTestSelect = buildCompactSharedSelect(
    ids.aiSelfTestSelectId,
    "选择要运行的单项自测。",
    [
      { value: "memory.summarize", label: "摘要" },
      { value: "memory.extract", label: "抽取" },
      { value: "world.template.build", label: "模板构建" },
      { value: "memory.vector.embed", label: "向量化" },
      { value: "memory.search.rerank", label: "重排" },
    ],
  );

  const taskSurfaceModeOptions: Array<{ value: string; label: string }> = [
    { value: "fullscreen_blocking", label: "全屏阻塞" },
    { value: "toast_blocking", label: "Toast 阻塞" },
    { value: "toast_background", label: "Toast 后台" },
  ];

  const taskSurfaceBlockingDefaultSelect = buildCompactSharedSelect(
    ids.taskSurfaceBlockingDefaultId,
    "设置阻塞任务的默认显示方式。",
    taskSurfaceModeOptions.filter(
      (option: { value: string }): boolean =>
        option.value !== "toast_background",
    ),
  );

  /**
   * 功能：构建任务显示模式下拉框。
   * @param id 控件 ID。
   * @returns 下拉框 HTML。
   */
  const buildTaskSurfaceModeSelect = (id: string): string =>
    buildCompactSharedSelect(
      id,
      "设置该任务的显示方式。",
      taskSurfaceModeOptions,
    );

  const taskSurfaceSummarizeSelect = buildTaskSurfaceModeSelect(
    ids.taskSurfaceSummarizeModeId,
  );
  const taskSurfaceExtractSelect = buildTaskSurfaceModeSelect(
    ids.taskSurfaceExtractModeId,
  );
  const taskSurfaceTemplateBuildSelect = buildTaskSurfaceModeSelect(
    ids.taskSurfaceTemplateBuildModeId,
  );
  const taskSurfaceVectorEmbedSelect = buildTaskSurfaceModeSelect(
    ids.taskSurfaceVectorEmbedModeId,
  );
  const taskSurfaceSearchRerankSelect = buildTaskSurfaceModeSelect(
    ids.taskSurfaceSearchRerankModeId,
  );

  const recordFilterLevelSelect = buildCompactSharedSelect(
    ids.recordFilterLevelId,
    "设置整体过滤强度：轻度、平衡或严格。",
    [
      { value: "light", label: "轻度" },
      { value: "balanced", label: "平衡" },
      { value: "strict", label: "严格" },
    ],
  );

  const recordFilterJsonModeSelect = buildCompactSharedSelect(
    ids.recordFilterJsonModeId,
    "设置 JSON 文本提取模式。",
    [
      { value: "off", label: "关闭" },
      { value: "smart", label: "智能提取" },
      { value: "all_strings", label: "全部字符串" },
    ],
  );

  const recordFilterPureCodePolicySelect = buildCompactSharedSelect(
    ids.recordFilterPureCodePolicyId,
    "设置纯代码消息的处理方式：丢弃、占位或保留原文。",
    [
      { value: "drop", label: "丢弃" },
      { value: "placeholder", label: "写入占位" },
      { value: "keep", label: "保留原文" },
    ],
  );

  const templateLockCheckbox = buildSharedCheckboxCard({
    id: ids.templateLockId,
    title: "锁定模板",
    checkedLabel: "锁定",
    uncheckedLabel: "未锁",
    containerClassName: "stx-ui-inline-checkbox is-compact",
    inputAttributes: {
      "data-tip": "锁定当前模板。",
      "aria-label": "锁定模板",
    },
  });

  const recordFilterEnabledCheckbox = buildControlOnlyCheckbox(
    ids.recordFilterEnabledId,
    "启用记录过滤",
    "启用记录过滤后，仅保留可读有效文本入库。",
  );

  const recordFilterTypeHtmlCheckbox = buildCompactCheckbox(
    ids.recordFilterTypeHtmlId,
    "HTML",
    "过滤 HTML 标签内容。",
  );

  const recordFilterTypeXmlCheckbox = buildCompactCheckbox(
    ids.recordFilterTypeXmlId,
    "XML",
    "过滤 XML 标签内容。",
  );

  const recordFilterTypeJsonCheckbox = buildCompactCheckbox(
    ids.recordFilterTypeJsonId,
    "JSON",
    "过滤或提取结构化 JSON 文本。",
  );

  const recordFilterTypeCodeblockCheckbox = buildCompactCheckbox(
    ids.recordFilterTypeCodeblockId,
    "代码块",
    "过滤 Markdown 围栏代码块。",
  );

  const recordFilterTypeMarkdownCheckbox = buildCompactCheckbox(
    ids.recordFilterTypeMarkdownId,
    "Markdown",
    "过滤 Markdown 噪声格式。",
  );

  const recordFilterCustomCodeblockCheckbox = buildCompactCheckbox(
    ids.recordFilterCustomCodeblockEnabledId,
    "启用自定义代码块过滤（仅清理指定标签）",
    "开启后，不再清除全部代码块；仅清理下方填写标签的代码块。默认建议至少保留 rolljson。",
  );

  const recordFilterCustomRegexCheckbox = buildCompactCheckbox(
    ids.recordFilterCustomRegexEnabledId,
    "启用自定义正则清理",
    "开启后按规则清理自定义正则命中的文本片段。",
  );

  return `
    <div class="inline-drawer stx-ui-shell">
      <div class="inline-drawer-toggle inline-drawer-header stx-ui-head" id="${ids.drawerToggleId}">
        <div class="stx-ui-head-title">
          <span style="margin-bottom: 2px;">${ids.displayName}</span>
          <span id="${ids.badgeId}" class="stx-ui-head-badge">${ids.badgeText}</span>
        </div>
        <div id="${ids.drawerIconId}" class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable" tabindex="0" role="button"></div>
      </div>

      <div class="inline-drawer-content stx-ui-content" id="${ids.drawerContentId}" style="display:none;">
        <div class="stx-ui-mode-bar">
          <div class="stx-ui-mode-copy">
            <span class="stx-ui-mode-kicker">MemoryOS</span>
            <div class="stx-ui-mode-title">记忆视图</div>
          </div>
          <div class="stx-ui-mode-switch">
            <button id="${ids.modeBasicId}" type="button" class="stx-ui-mode-chip is-active">
              <i class="fa-solid fa-sparkles"></i>
              <span>普通模式</span>
            </button>
            <button id="${ids.modeAdvancedId}" type="button" class="stx-ui-mode-chip">
              <i class="fa-solid fa-sliders"></i>
              <span>高级模式</span>
            </button>
          </div>
          <button id="${ids.experienceRefreshBtnId}" type="button" class="stx-ui-btn secondary stx-ui-refresh-btn">
            <i class="fa-solid fa-rotate"></i>&nbsp;刷新
          </button>
        </div>

        <div class="stx-ui-tabs stx-ui-tabs-primary">
          <button id="${ids.tabRoleId}" data-stx-mode="basic" data-tip="查看角色当前记住了什么。" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-brain"></i>
            <span>角色记忆</span>
          </button>
          <button id="${ids.tabRecentId}" data-stx-mode="basic" data-tip="查看最近沉淀的事件与摘要。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-clock"></i>
            <span>近期事件</span>
          </button>
          <button id="${ids.tabRelationId}" data-stx-mode="basic" data-tip="查看关系状态与当前场景。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-people-arrows"></i>
            <span>关系与状态</span>
          </button>
          <button id="${ids.tabInjectionId}" data-stx-mode="basic" data-tip="查看本轮注入与写回判定。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
            <span>本轮注入</span>
          </button>
        </div>

        <div id="${ids.panelRoleId}" class="stx-ui-panel">
          <div class="stx-ui-experience-shell">
            <div class="stx-ui-actions stx-ui-experience-actions">
              <button id="${ids.experienceRecordEditorBtnId}" type="button" class="stx-ui-btn" data-tip="打开记录编辑器，手动修正记忆。">
                <i class="fa-solid fa-pen-to-square"></i>&nbsp;手动修正记忆
              </button>
              <button id="${ids.experienceSnapshotBtnId}" type="button" class="stx-ui-btn secondary" data-tip="创建快照，方便回滚当前记忆状态。">
                <i class="fa-solid fa-camera"></i>&nbsp;创建快照
              </button>
              <button id="${ids.experienceAdvancedBtnId}" type="button" class="stx-ui-btn secondary" data-tip="切换到高级工具。">
                <i class="fa-solid fa-sliders"></i>&nbsp;进入高级工具
              </button>
            </div>
            <div id="${ids.roleOverviewMetaId}"></div>
            <div id="${ids.rolePersonaBadgesId}"></div>
            <div class="stx-ui-experience-grid">
              <section class="stx-ui-experience-card">
                <div class="stx-ui-experience-card-head">
                  <h3>长期记住的事实</h3>
                  <p>更稳定、会长期影响回复的记忆。</p>
                </div>
                <div id="${ids.rolePrimaryFactsId}"></div>
              </section>
              <section class="stx-ui-experience-card">
                <div class="stx-ui-experience-card-head">
                  <h3>近期沉淀的记忆</h3>
                  <p>最近几轮刚写入、还在活跃使用的内容。</p>
                </div>
                <div id="${ids.roleRecentMemoryId}"></div>
              </section>
              <section class="stx-ui-experience-card">
                <div class="stx-ui-experience-card-head">
                  <h3>遗忘趋势</h3>
                  <p>当前更可能被压缩、淡化或需要维护的记忆提示。</p>
                </div>
                <div id="${ids.roleBlurMemoryId}"></div>
              </section>
            </div>
          </div>
        </div>

        <div id="${ids.panelRecentId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-experience-grid">
            <section class="stx-ui-experience-card" style="grid-column-start: span 2;">
              <div class="stx-ui-experience-card-head">
                <h3>最近事件</h3>
                <p>按时间查看刚刚入库的消息事件与结构变化。</p>
              </div>
              <div id="${ids.recentEventsId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>最近摘要</h3>
                <p>系统已经压缩出的剧情段落与上下文总结。</p>
              </div>
              <div id="${ids.recentSummariesId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>聊天生命周期</h3>
                <p>当前阶段、结构变动与质量提示。</p>
              </div>
              <div id="${ids.recentLifecycleId}"></div>
            </section>
          </div>
        </div>

        <div id="${ids.panelRelationId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-experience-grid">
            <section class="stx-ui-experience-card stx-ui-experience-card-wide">
              <div class="stx-ui-experience-card-head">
                <h3>关系总览</h3>
                <p>聚焦关系变化、场景推进和当前主导角色。</p>
              </div>
              <div id="${ids.relationOverviewId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>角色分支</h3>
                <p>群聊时按角色展示最近关系、目标和情绪。</p>
              </div>
              <div id="${ids.relationLanesId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>世界与场景状态</h3>
                <p>当前会影响记忆和回复的状态缓存。</p>
              </div>
              <div id="${ids.relationStateId}"></div>
            </section>
          </div>
        </div>

        <div id="${ids.panelInjectionId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-experience-grid">
            <section class="stx-ui-experience-card stx-ui-experience-card-wide">
              <div class="stx-ui-experience-card-head">
                <h3>本轮注入概览</h3>
                <p>为什么注入、怎么注入、这轮更偏向哪种记忆。</p>
              </div>
              <div id="${ids.injectionOverviewId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>注入区段</h3>
                <p>当前实际用到的记忆区段与预算。</p>
              </div>
              <div id="${ids.injectionSectionsId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>生成后判定</h3>
                <p>本轮更偏长期写入、短期处理还是摘要重建。</p>
              </div>
              <div id="${ids.injectionPostId}"></div>
            </section>
            <section class="stx-ui-experience-card stx-ui-experience-card-wide stx-ui-experience-card-reason">
              <div class="stx-ui-experience-card-head">
                <h3>为什么会这样选</h3>
                <p>当前版本可解释的原因码、世界书决策与生成后判定。</p>
              </div>
              <div id="${ids.injectionReasonId}"></div>
            </section>
          </div>
        </div>

        <div id="${ids.panelAdvancedToolsId}" class="stx-ui-panel stx-ui-advanced-panel" hidden>
          <div class="stx-ui-advanced-head">
            <div class="stx-ui-advanced-head-title">高级工具</div>
            <div class="stx-ui-advanced-head-search">
              <input id="${ids.searchId}" data-tip="按关键词筛选设置项。" class="text_pole flex1 stx-ui-search" placeholder="搜索工具" type="search" />
            </div>
          </div>

          <div class="stx-ui-tabs stx-ui-tabs-secondary">
            <button id="${ids.tabMainId}" data-tip="查看主设置。" type="button" class="stx-ui-tab is-active">
              <i class="fa-solid fa-power-off"></i>
              <span>运行控制</span>
            </button>
            <button id="${ids.tabAiId}" data-tip="查看 AI 规则。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-microchip"></i>
              <span>记忆策略</span>
            </button>
            <button id="${ids.tabDbId}" data-tip="查看数据管理。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-database"></i>
              <span>数据维护</span>
            </button>
            <button id="${ids.tabAboutId}" data-tip="查看插件信息。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-circle-info"></i>
              <span>诊断关于</span>
            </button>
          </div>

          <div id="${ids.panelMainId}" class="stx-ui-panel stx-ui-advanced-subpanel">
          <div class="stx-ui-divider">
            <i class="fa-solid fa-power-off"></i>
            <span>基础开关</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable memory os switch">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用 Memory OS</div>
              <div class="stx-ui-item-desc">总开关。关闭后不再记录记忆。</div>
            </div>
            <div class="stx-ui-inline">
              ${memoryEnabledCheckbox}
            </div>
          </label>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="ai mode rule extraction">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">
                启用 AI 模式
                <i id="${ids.aiModeStatusLightId}" data-tip="显示与 LLMHub 的连接状态。" class="fa-solid fa-circle-question" style="color: #666; font-size: 11px; margin-left: 6px;" title="通信中..."></i>
              </div>
              <div class="stx-ui-item-desc">开启后用 AI 抽取事实。关闭后只用规则模式。</div>
            </div>
            <div class="stx-ui-inline">
              ${aiModeCheckbox}
            </div>
          </label>
        </div>

          <div id="${ids.panelAiId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-bars-staggered"></i>
            <span>上下文规则</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="max tokens context injection">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">上下文最大 Token 限制</div>
              <div class="stx-ui-item-desc">限制每次注入给 AI 的记忆长度。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.contextMaxTokensId}" data-tip="限制注入给 AI 的记忆长度。" class="text_pole stx-ui-input" type="number" min="500" max="8000" step="100" />
            </div>
          </div>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-layer-group"></i>
            <span>任务显示</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="task surface llm queue overlay toast composer">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局表现</div>
              <div class="stx-ui-item-desc">设置后台任务是否显示右下角任务卡、阻塞任务默认呈现方式、结束后停留秒数，以及阻塞时是否锁定发送区。</div>
            </div>
            <div class="stx-ui-row stx-ui-grid-form">
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">阻塞默认显示</span>
                ${taskSurfaceBlockingDefaultSelect}
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">结束后停留（秒）</span>
                <input id="${ids.taskSurfaceAutoCloseSecondsId}" class="text_pole stx-ui-input" type="number" min="0" max="30" step="1" data-tip="右下角任务卡在任务完成或失败后会继续停留几秒再自动关闭，默认 3 秒。填 0 表示立即关闭。" />
              </label>
              <div class="stx-ui-field stx-ui-inline-toggle-field">
                <span class="stx-ui-field-label">后台任务显示卡片</span>
                ${buildCompactCheckbox(ids.taskSurfaceBackgroundToastId, "启用", "启用后，后台任务会在右下角任务卡中显示状态。")}
              </div>
              <div class="stx-ui-field stx-ui-inline-toggle-field">
                <span class="stx-ui-field-label">阻塞时锁定发送</span>
                ${buildCompactCheckbox(ids.taskSurfaceDisableComposerId, "启用", "启用后，阻塞任务执行期间会暂时禁用发送按钮与输入框。")}
              </div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="task surface summarize extract template embed rerank">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">任务预设</div>
              <div class="stx-ui-item-desc">每种任务都可以单独选择全屏阻塞、Toast 阻塞或 Toast 后台。</div>
            </div>
            <div class="stx-ui-form-grid stx-ui-task-surface-grid">
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">摘要生成</span>
                ${taskSurfaceSummarizeSelect}
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">结构提取</span>
                ${taskSurfaceExtractSelect}
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">模板构建</span>
                ${taskSurfaceTemplateBuildSelect}
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">向量处理</span>
                ${taskSurfaceVectorEmbedSelect}
              </label>
              <label class="stx-ui-field">
                <span class="stx-ui-field-label">召回重排</span>
                ${taskSurfaceSearchRerankSelect}
              </label>
            </div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-filter"></i>
            <span>记录过滤</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="record filter enable">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用记录过滤</div>
              <div class="stx-ui-item-desc">只保存可读的有效内容。</div>
            </div>
            <div class="stx-ui-inline">
              ${recordFilterEnabledCheckbox}
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter level json mode pure code policy">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">过滤策略</div>
              <div class="stx-ui-item-desc">设置过滤强度、JSON 提取与纯代码处理策略。</div>
            </div>
            <div class="stx-ui-row stx-ui-grid-form">
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">过滤强度</span>
                ${recordFilterLevelSelect}
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">JSON 提取</span>
                ${recordFilterJsonModeSelect}
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">纯代码处理</span>
                ${recordFilterPureCodePolicySelect}
              </label>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter type html xml json markdown codeblock">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">过滤类型（可多选）</div>
              <div class="stx-ui-item-desc">按需过滤 HTML / XML / JSON / 代码块 / Markdown。</div>
            </div>
            <div class="stx-ui-actions stx-ui-checkbox-group" style="flex-wrap:wrap;">
              ${recordFilterTypeHtmlCheckbox}
              ${recordFilterTypeXmlCheckbox}
              ${recordFilterTypeJsonCheckbox}
              ${recordFilterTypeCodeblockCheckbox}
              ${recordFilterTypeMarkdownCheckbox}
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter json keys placeholder length min chars regex custom codeblock">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">详细配置</div>
              <div class="stx-ui-item-desc">提取键、占位文本、长度限制与自定义正则。</div>
            </div>
            <div class="stx-ui-row stx-ui-grid-form">
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">JSON 提取键（逗号分隔）</span>
                <input id="${ids.recordFilterJsonKeysId}" class="text_pole stx-ui-input" type="text" placeholder="content,text,message" data-tip="smart 模式下仅提取这些键名对应的文本，逗号分隔。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">占位文本</span>
                <input id="${ids.recordFilterPlaceholderId}" class="text_pole stx-ui-input" type="text" placeholder="[代码内容已过滤]" data-tip="当策略为占位时写入的提示文本。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">最大保存字符</span>
                <input id="${ids.recordFilterMaxTextLengthId}" class="text_pole stx-ui-input" type="number" min="200" max="20000" step="100" data-tip="单条记录允许保存的最大字符数。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">最小有效字符</span>
                <input id="${ids.recordFilterMinEffectiveCharsId}" class="text_pole stx-ui-input" type="number" min="1" max="200" step="1" data-tip="小于该有效字符数的文本会被判定为无效内容。" />
              </label>
            </div>
            <div class="stx-ui-inline" style="margin-top:8px;">
              ${recordFilterCustomCodeblockCheckbox}
            </div>
            <label
              style="display:block; width:100%; margin-top:8px;"
            >
              <span style="display:block; font-size:12px; margin-bottom:4px;">代码块标签（逗号分隔）</span>
              <textarea
                id="${ids.recordFilterCustomCodeblockTagsId}"
                class="text_pole stx-ui-input stx-ui-codeblock-tags"
                rows="3"
                placeholder="rolljson&#10;json"
                data-tip="填写后只会清理这些标签的代码块；未匹配标签的代码块会保留。"
              ></textarea>
            </label>
            <div class="stx-ui-inline" style="margin-top:8px;">
              ${recordFilterCustomRegexCheckbox}
            </div>
            <textarea id="${ids.recordFilterCustomRegexRulesId}" class="text_pole stx-ui-input" rows="4" placeholder="/\\[OOC\\][^\\n]*/g" style="width:100%; margin-top:8px;" data-tip="每行一条规则；支持 /pattern/flags 或普通文本匹配。"></textarea>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter preview">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">过滤预览</div>
              <div class="stx-ui-item-desc">输入原文，仅预览不过库。</div>
            </div>
            <textarea id="${ids.recordFilterPreviewInputId}" class="text_pole stx-ui-input" rows="4" placeholder="在这里测试过滤效果..." style="width:100%;" data-tip="输入测试文本，点击预览查看过滤结果。"></textarea>
            <div class="stx-ui-actions">
              <button id="${ids.recordFilterPreviewBtnId}" type="button" class="stx-ui-btn secondary" data-tip="执行一次过滤预览，不会写入数据库。">预览过滤结果</button>
            </div>
            <pre id="${ids.recordFilterPreviewOutputId}" style="width:100%; white-space:pre-wrap; word-break:break-word; font-size:12px; background:rgba(0,0,0,0.2); border-radius:6px; padding:8px; margin:0;" data-tip="显示预览结果与命中规则。"></pre>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="ai test moved about">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">测试中心已迁移</div>
              <div class="stx-ui-item-desc">AI 诊断、自测、当前模型与返回结果现在统一放在「关于」页，方便集中查看。</div>
            </div>
          </div>
        </div>

          <div id="${ids.panelDbId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="auto compaction archive">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">自动事务压缩（Auto Compaction）</div>
              <div class="stx-ui-item-desc">开启后，事件多了会自动压缩。</div>
            </div>
            <div class="stx-ui-inline">
              ${autoCompactionCheckbox}
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="threshold limit events">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">事件流压缩阈值</div>
              <div class="stx-ui-item-desc">事件达到这个数量时开始压缩。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.compactionThresholdId}" data-tip="达到这个数量后开始压缩。" class="text_pole stx-ui-input" type="number" min="500" max="20000" step="500" />
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="manual actions db export clear">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">维护操作</div>
              <div class="stx-ui-item-desc">这里是手动维护功能。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.dbCompactBtnId}" data-tip="立即执行一次压缩。" type="button" class="stx-ui-btn">立即压缩</button>
              <button id="${ids.recordEditorBtnId}" data-tip="打开记录编辑器。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-pen-to-square"></i>&nbsp;记录编辑
              </button>
              <button id="${ids.dbExportBtnId}" data-tip="导出当前聊天记忆。" type="button" class="stx-ui-btn secondary">导出记忆包</button>
              <button id="${ids.dbImportBtnId}" data-tip="导入记忆到当前聊天。" type="button" class="stx-ui-btn secondary">导入记忆包</button>
              <button id="${ids.dbClearBtnId}" data-tip="清空当前聊天记忆。" type="button" class="stx-ui-btn secondary" style="color:#ff8787; border-color: rgba(255,135,135,0.3);">清空当前聊天数据</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="bus inspector connection test ping hello">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">微服务通讯自测（Bus Inspector）</div>
              <div class="stx-ui-item-desc">用于检查 MemoryOS 和 LLMHub 是否连通。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.testPingBtnId}" data-tip="测试连通性（Ping）。" type="button" class="stx-ui-btn secondary">发送 Ping 测试</button>
              <button id="${ids.testHelloBtnId}" data-tip="测试握手（Hello）。" type="button" class="stx-ui-btn secondary" style="border-color: rgba(140, 235, 140, 0.4);">向 LLMHub Hello</button>
            </div>
          </div>
        </div>

          <div id="${ids.panelTuningId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
          <div class="stx-ui-experience-grid">
            <section class="stx-ui-experience-card" data-stx-ui-search="memory tuning migration backfill">
              <div class="stx-ui-experience-card-head">
                <h3>迁移状态</h3>
                <p>这里显示当前迁移阶段、镜像准备情况和最近一次回填时间。</p>
              </div>
              <div id="${ids.tuningMigrationStatusId}"></div>
              <div class="stx-ui-actions">
                <button id="${ids.tuningRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="重新读取当前迁移状态与调参值。">
                  <i class="fa-solid fa-rotate"></i>&nbsp;刷新当前参数
                </button>
                <button id="${ids.tuningBackfillBtnId}" type="button" class="stx-ui-btn" data-tip="执行一次迁移回填，并在完成后刷新状态。">
                  <i class="fa-solid fa-database"></i>&nbsp;执行迁移回填
                </button>
              </div>
            </section>
            <section class="stx-ui-experience-card stx-ui-experience-card-wide" data-stx-ui-search="memory tuning profile threshold relationship emotion recency continuity distortion retention">
              <div class="stx-ui-experience-card-head">
                <h3>调参设置</h3>
                <p>这里用于调整候选阈值、召回偏置和保留数量。修改后需要手动保存。</p>
              </div>
              <div class="stx-ui-form-grid stx-ui-memory-tuning-grid">
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">候选阈值偏置</span>
                  <input id="${ids.tuningCandidateAcceptThresholdBiasId}" class="text_pole stx-ui-input" type="number" min="-0.2" max="0.2" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">关系召回权重</span>
                  <input id="${ids.tuningRecallRelationshipBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">情绪召回权重</span>
                  <input id="${ids.tuningRecallEmotionBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">最近性权重</span>
                  <input id="${ids.tuningRecallRecencyBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">连续性权重</span>
                  <input id="${ids.tuningRecallContinuityBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">扭曲保护权重</span>
                  <input id="${ids.tuningDistortionProtectionBiasId}" class="text_pole stx-ui-input" type="number" min="0" max="1" step="0.01" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">候选保留上限</span>
                  <input id="${ids.tuningCandidateRetentionLimitId}" class="text_pole stx-ui-input" type="number" min="24" max="240" step="1" />
                </label>
                <label class="stx-ui-field">
                  <span class="stx-ui-field-label">召回日志上限</span>
                  <input id="${ids.tuningRecallRetentionLimitId}" class="text_pole stx-ui-input" type="number" min="40" max="320" step="1" />
                </label>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.tuningResetBtnId}" type="button" class="stx-ui-btn secondary" data-tip="把表单值恢复到默认调参画像。">
                  <i class="fa-solid fa-rotate-left"></i>&nbsp;恢复默认值
                </button>
                <button id="${ids.tuningSaveBtnId}" type="button" class="stx-ui-btn" data-tip="保存当前调参设置。">
                  <i class="fa-solid fa-floppy-disk"></i>&nbsp;保存参数
                </button>
              </div>
            </section>
          </div>
        </div>

          <div id="${ids.panelTemplateId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-table-columns"></i>
            <span>世界模板</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-item-stack stx-ui-template-panel">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前绑定的世界 Schema</div>
              <div class="stx-ui-item-desc">这里显示当前聊天使用的模板结构。</div>
            </div>
            <div id="${ids.templateListId}" class="stx-ui-code-surface stx-ui-template-list">
              正在加载...
            </div>
            <div class="stx-ui-actions stx-ui-template-toolbar">
              <button id="${ids.templateRefreshBtnId}" data-tip="刷新模板列表。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新模板列表
              </button>
              <button id="${ids.templateForceRebuildBtnId}" data-tip="从世界书重建模板。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;强制重建模板（从世界书）
              </button>
            </div>
            <div class="stx-ui-template-activate-row">
              <div class="stx-ui-template-select-wrap">
                ${templateActiveSelect}
              </div>
              <div class="stx-ui-template-lock">
                ${templateLockCheckbox}
              </div>
              <button id="${ids.templateSetActiveBtnId}" data-tip="应用当前选择的模板。" type="button" class="stx-ui-btn stx-ui-template-apply-btn">应用</button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">写回到世界书
                <span style="font-size: 10px; color: #aaa; font-weight: normal; margin-left: 6px;">（把事实和摘要转成世界书条目）</span>
              </div>
              <div class="stx-ui-item-desc">把记忆写回世界书，后续可直接注入。</div>
            </div>
            <div id="${ids.wiPreviewId}" style="width: 100%; font-size: 11px; color: #aaa; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; max-height: 100px; overflow-y: auto; font-family: monospace;" data-tip="显示写回世界书前的预览内容。"></div>
            <div class="stx-ui-actions">
              <button id="${ids.wiPreviewBtnId}" data-tip="预览写回内容。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-eye"></i>&nbsp;预览写回内容
              </button>
              <button id="${ids.wiWritebackBtnId}" data-tip="写回事实和摘要到世界书。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-upload"></i>&nbsp;写回到世界书（全部）
              </button>
              <button id="${ids.wiWriteSummaryBtnId}" data-tip="只写回摘要到世界书。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-file-lines"></i>&nbsp;仅写回摘要
              </button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 8px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">逻辑表（可编辑）
                <span style="font-size: 10px; color: #aaa; font-weight: normal; margin-left: 6px;">（双击内容进入编辑）</span>
              </div>
              <div class="stx-ui-item-desc">可直接编辑事实，改完会立刻保存。</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <label style="font-size: 12px; white-space: nowrap;">实体类型：</label>
              ${logicTableEntitySelect}
              <button id="${ids.logicTableRefreshBtnId}" data-tip="刷新当前逻辑表。" type="button" class="stx-ui-btn" style="padding: 4px 10px; font-size: 12px;">
                <i class="fa-solid fa-rotate"></i>
              </button>
            </div>
            <div id="${ids.logicTableContainerId}"
              style="width: 100%; font-size: 12px; background: rgba(0,0,0,0.15); border-radius: 6px; padding: 6px; max-height: 320px; overflow-y: auto;"
              data-tip="显示逻辑表；支持双击单元格编辑。">
              <span style="color: #aaa;">请选择实体类型查看。</span>
            </div>
          </div>
        </div>

          <div id="${ids.panelAuditId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>审计历史 &amp; 快照回滚</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 12px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">快照操作</div>
              <div class="stx-ui-item-desc">先保存一个快照，之后可一键回滚。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.auditCreateSnapshotBtnId}" data-tip="创建一个回滚快照。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-camera"></i>&nbsp;创建快照
              </button>
              <button id="${ids.auditRefreshBtnId}" data-tip="刷新审计记录。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新审计记录
              </button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 4px;">
            <div class="stx-ui-item-title" style="font-size: 13px;">历史记录（快照可回滚，其它仅查看）</div>
            <div id="${ids.auditListId}"
              style="width: 100%; font-size: 12px; color: var(--ss-theme-text, #ccc);
                     background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px;
                     max-height: 360px; overflow-y: auto; font-family: monospace;"
              data-tip="显示历史审计记录；快照项可一键回滚。">
              正在加载审计记录...
            </div>
          </div>
        </div>

        </div>

        <div id="${ids.panelAboutId}" class="stx-ui-panel stx-ui-advanced-subpanel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于插件</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="about version author email github" style="margin-bottom: 12px; align-items: flex-start;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">${ids.displayName}</div>
              <div class="stx-ui-item-desc stx-ui-about-meta">
                <span class="stx-ui-about-meta-item">
                  <i class="fa-solid fa-tag"></i>
                  <span>版本：${ids.badgeText}</span>
                </span>
                <span class="stx-ui-about-meta-item">
                  <i class="fa-solid fa-user"></i>
                  <span>作者：${ids.authorText}</span>
                </span>
                <span class="stx-ui-about-meta-item">
                  <i class="fa-solid fa-envelope"></i>
                  <span>邮箱：<a href="mailto:${ids.emailText}">${ids.emailText}</a></span>
                </span>
                <span class="stx-ui-about-meta-item">
                  <i class="fa-brands fa-github"></i>
                  <span>GitHub：<a href="${ids.githubUrl}" target="_blank" rel="noopener">${ids.githubText}</a></span>
                </span>
              </div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" style="flex-direction: column; align-items: flex-start; margin-bottom: 12px;" data-stx-ui-search="changelog updates history">
            <div class="stx-ui-item-title">更新日志（Changelog）</div>
            <div class="stx-ui-changelog">
              ${ids.changelogHtml}
            </div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-stethoscope"></i>
            <span>测试中心</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai diagnosis overview capabilities status">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">AI 总览</div>
              <div class="stx-ui-item-desc">显示 LLMHub 挂载、consumer 注册、能力状态和当前诊断结果。</div>
            </div>
            <div id="${ids.aiDiagOverviewId}" style="width:100%; font-size:12px; color:var(--ss-theme-text, #ccc); background:rgba(0,0,0,0.2); border-radius:6px; padding:10px;">
              正在加载诊断信息...
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route preview model provider generation embedding rerank">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前测试路由</div>
              <div class="stx-ui-item-desc">显示生成、向量、重排三类任务当前实际会命中的资源、模型和可用状态。</div>
            </div>
            <div id="${ids.aiRoutePreviewId}" style="width:100%; font-size:12px; color:var(--ss-theme-text, #ccc); background:rgba(0,0,0,0.2); border-radius:6px; padding:10px;">
              正在读取当前路由...
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai capabilities chat json embeddings rerank">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">能力状态</div>
              <div class="stx-ui-item-desc">分别显示 chat、json、embeddings、rerank 的可用/缺失/降级状态。</div>
            </div>
            <div id="${ids.aiDiagCapabilitiesId}" style="width:100%; font-size:12px; display:flex; flex-wrap:wrap; gap:8px;">
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai recent tasks history status">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">最近任务</div>
              <div class="stx-ui-item-desc">显示五类任务最近一次执行时间、结果与失败原因。</div>
            </div>
            <div id="${ids.aiDiagRecentTasksId}" style="width:100%; font-size:12px; color:var(--ss-theme-text, #ccc); background:rgba(0,0,0,0.2); border-radius:6px; padding:10px; max-height:240px; overflow-y:auto; font-family:monospace; white-space:pre-wrap;">
              暂无任务记录
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.aiDiagRefreshBtnId}" data-tip="刷新 AI 诊断信息。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新诊断
              </button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="ai self test single all result preview">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">任务自测</div>
              <div class="stx-ui-item-desc">支持选择单项测试或运行全部测试，并展示命中的资源、模型、结果预览与失败原因。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label">测试项目</label>
                ${aiSelfTestSelect}
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.aiSelfTestRunBtnId}" data-tip="运行当前选中的单项测试。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-vial-circle-check"></i>&nbsp;运行所选测试
              </button>
              <button id="${ids.aiSelfTestAllBtnId}" data-tip="运行全部五项 AI 自测。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-vial"></i>&nbsp;运行全部自测
              </button>
            </div>
            <div id="${ids.aiSelfTestResultsId}" style="width:100%; color:var(--ss-theme-text, #ccc); background:rgba(0,0,0,0.2); border-radius:6px; padding:6px; max-height:240px; overflow-y:auto; margin-bottom:8px;">
              <div style="opacity:0.6; padding:4px; font-size:12px;">点击上方按钮运行自测</div>
            </div>
            <div id="${ids.aiSelfTestDetailId}" style="width:100%; color:var(--ss-theme-text, #ccc); background:rgba(0,0,0,0.2); border-radius:6px; padding:6px; max-height:260px; overflow-y:auto;">
              <div style="opacity:0.6; padding:4px; font-size:12px;">这里会显示最近一次测试的详细返回内容</div>
            </div>
          </div>

          <div class="stx-ui-tip">
            Memory OS 负责记忆记录、压缩和回写。
          </div>
        </div>
      </div>
    </div>
  `;
}
