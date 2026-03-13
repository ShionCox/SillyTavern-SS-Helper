import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';
import { buildSharedSelectField } from '../../../_Components/sharedSelect';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';

/**
 * 功能：构建 MemoryOS 设置面板 HTML。
 * 参数：
 *   ids：所有 DOM 元素 ID 映射。
 * 返回：
 *   string：可直接挂载的 HTML 字符串。
 */
export function buildSettingsCardHtmlTemplate(ids: MemoryOSSettingsIds): string {
  const memoryEnabledCheckbox = buildSharedCheckboxCard({
    id: ids.enabledId,
    title: '启用 Memory OS',
    containerClassName: 'stx-ui-inline-checkbox is-control-only',
    inputAttributes: {
      'data-tip': 'MemoryOS 总开关。',
      'aria-label': '启用 Memory OS',
    },
  });

  const aiModeCheckbox = buildSharedCheckboxCard({
    id: ids.aiModeEnabledId,
    title: '启用 AI 模式',
    containerClassName: 'stx-ui-inline-checkbox is-control-only',
    inputAttributes: {
      'data-tip': '开启后使用 AI 抽取事实。',
      'aria-label': '启用 AI 模式',
    },
  });

  const autoCompactionCheckbox = buildSharedCheckboxCard({
    id: ids.autoCompactionId,
    title: '自动压缩历史事件',
    containerClassName: 'stx-ui-inline-checkbox is-control-only',
    inputAttributes: {
      'data-tip': '自动压缩历史事件。',
      'aria-label': '自动压缩历史事件',
    },
  });

  const templateActiveSelect = buildSharedSelectField({
    id: ids.templateActiveSelectId,
    containerClassName: 'stx-ui-shared-select stx-ui-shared-select-inline',
    selectClassName: 'stx-ui-input',
    triggerClassName: 'stx-ui-input-full',
    triggerAttributes: { 'data-tip': '选择要启用的模板。' },
    options: [{ value: '', label: '选择要激活的模板...' }],
  });

  const logicTableEntitySelect = buildSharedSelectField({
    id: ids.logicTableEntitySelectId,
    containerClassName: 'stx-ui-shared-select stx-ui-shared-select-inline',
    selectClassName: 'stx-ui-input',
    triggerClassName: 'stx-ui-input-full',
    triggerAttributes: { 'data-tip': '选择要查看的实体类型。' },
    options: [{ value: '', label: '选择实体类型...' }],
  });

  const templateLockCheckbox = buildSharedCheckboxCard({
    id: ids.templateLockId,
    title: '锁定模板',
    checkedLabel: '锁定',
    uncheckedLabel: '未锁',
    containerClassName: 'stx-ui-inline-checkbox is-compact',
    inputAttributes: {
      'data-tip': '锁定当前模板。',
      'aria-label': '锁定模板',
    },
  });

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
        <div class="stx-ui-filters flex-container">
          <input id="${ids.searchId}" data-tip="按关键词筛选设置项。" class="text_pole flex1 stx-ui-search" placeholder="搜索设置" type="search" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" data-tip="查看主设置。" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>主设置</span>
          </button>
          <button id="${ids.tabAiId}" data-tip="查看 AI 规则。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-microchip"></i>
            <span>AI 规则</span>
          </button>
          <button id="${ids.tabDbId}" data-tip="查看数据管理。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-database"></i>
            <span>数据管理</span>
          </button>
          <button id="${ids.tabTemplateId}" data-tip="查看世界模板。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-table-columns"></i>
            <span>世界模板</span>
          </button>
          <button id="${ids.tabAuditId}" data-tip="查看审计与回滚。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>审计回滚</span>
          </button>
          <button id="${ids.tabAboutId}" data-tip="查看插件信息。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于</span>
          </button>
        </div>

        <div id="${ids.panelMainId}" class="stx-ui-panel">
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

        <div id="${ids.panelAiId}" class="stx-ui-panel" hidden>
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
              <input id="${ids.contextMaxTokensId}" data-tip="限制注入给 AI 的记忆长度。" class="stx-ui-input" type="number" min="500" max="8000" step="100" />
            </div>
          </div>
        </div>

        <div id="${ids.panelDbId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-box-archive"></i>
            <span>数据压缩与清理</span>
            <div class="stx-ui-divider-line"></div>
          </div>

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
              <input id="${ids.compactionThresholdId}" data-tip="达到这个数量后开始压缩。" class="stx-ui-input" type="number" min="500" max="20000" step="500" />
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="manual actions db export clear">
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

        <div id="${ids.panelTemplateId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-table-columns"></i>
            <span>世界模板</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 12px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前绑定的世界 Schema</div>
              <div class="stx-ui-item-desc">这里显示当前聊天使用的模板结构。</div>
            </div>
            <div id="${ids.templateListId}" style="width: 100%; font-size: 12px; color: var(--ss-theme-text, #ccc); background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: monospace;">
              正在加载...
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.templateRefreshBtnId}" data-tip="刷新模板列表。" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新模板列表
              </button>
              <button id="${ids.templateForceRebuildBtnId}" data-tip="从世界书重建模板。" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;强制重建模板（从世界书）
              </button>
            </div>
            <div style="display:flex; gap:8px; align-items:center; width:100%;">
              ${templateActiveSelect}
              ${templateLockCheckbox}
              <button id="${ids.templateSetActiveBtnId}" data-tip="应用当前选择的模板。" type="button" class="stx-ui-btn">应用</button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">写回到 SillyTavern WorldInfo
                <span style="font-size: 10px; color: #aaa; font-weight: normal; margin-left: 6px;">（将稳定事实和摘要导入为世界书条目）</span>
              </div>
              <div class="stx-ui-item-desc">把记忆写回世界书，后续可直接注入。</div>
            </div>
            <div id="${ids.wiPreviewId}" style="width: 100%; font-size: 11px; color: #aaa; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; max-height: 100px; overflow-y: auto; font-family: monospace;"></div>
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
              style="width: 100%; font-size: 12px; background: rgba(0,0,0,0.15); border-radius: 6px; padding: 6px; max-height: 320px; overflow-y: auto;">
              <span style="color: #aaa;">请选择实体类型查看。</span>
            </div>
          </div>
        </div>

        <div id="${ids.panelAuditId}" class="stx-ui-panel" hidden>
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
                     max-height: 360px; overflow-y: auto; font-family: monospace;">
              正在加载审计记录...
            </div>
          </div>
        </div>

        <div id="${ids.panelAboutId}" class="stx-ui-panel" hidden>
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

          <div class="stx-ui-tip">
            Memory OS 负责记忆记录、压缩和回写。
          </div>
        </div>
      </div>
    </div>
  `;
}
