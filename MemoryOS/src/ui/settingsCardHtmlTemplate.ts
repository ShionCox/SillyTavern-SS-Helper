import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';
import { buildSharedSelectField } from '../../../_Components/sharedSelect';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import {
  renderSharedCheckbox,
  renderSharedCheckboxWithLabel,
} from '../../../_Components/sharedCheckbox';

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
              ${renderSharedCheckbox({
                id: ids.recordFilterEnabledId,
                dataTip: '启用记录过滤后，仅保留可读有效文本入库。',
              })}
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
                <select id="${ids.recordFilterLevelId}" class="stx-ui-input" data-tip="设置整体过滤强度：轻度、平衡或严格。">
                  <option value="light">轻度</option>
                  <option value="balanced">平衡</option>
                  <option value="strict">严格</option>
                </select>
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">JSON 提取</span>
                <select id="${ids.recordFilterJsonModeId}" class="stx-ui-input" data-tip="设置 JSON 文本提取模式。">
                  <option value="off">关闭</option>
                  <option value="smart">智能提取</option>
                  <option value="all_strings">全部字符串</option>
                </select>
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">纯代码处理</span>
                <select id="${ids.recordFilterPureCodePolicyId}" class="stx-ui-input" data-tip="设置纯代码消息的处理方式：丢弃、占位或保留原文。">
                  <option value="drop">丢弃</option>
                  <option value="placeholder">写入占位</option>
                  <option value="keep">保留原文</option>
                </select>
              </label>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter type html xml json markdown codeblock">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">过滤类型（可多选）</div>
              <div class="stx-ui-item-desc">按需过滤 HTML / XML / JSON / 代码块 / Markdown。</div>
            </div>
            <div class="stx-ui-actions stx-ui-checkbox-group" style="flex-wrap:wrap;">
              ${renderSharedCheckboxWithLabel({ id: ids.recordFilterTypeHtmlId, label: 'HTML', labelClassName: 'stx-ui-inline', dataTip: '过滤 HTML 标签内容。' })}
              ${renderSharedCheckboxWithLabel({ id: ids.recordFilterTypeXmlId, label: 'XML', labelClassName: 'stx-ui-inline', dataTip: '过滤 XML 标签内容。' })}
              ${renderSharedCheckboxWithLabel({ id: ids.recordFilterTypeJsonId, label: 'JSON', labelClassName: 'stx-ui-inline', dataTip: '过滤或提取 JSON 结构文本。' })}
              ${renderSharedCheckboxWithLabel({ id: ids.recordFilterTypeCodeblockId, label: '代码块', labelClassName: 'stx-ui-inline', dataTip: '过滤 Markdown 围栏代码块。' })}
              ${renderSharedCheckboxWithLabel({ id: ids.recordFilterTypeMarkdownId, label: 'Markdown', labelClassName: 'stx-ui-inline', dataTip: '过滤 Markdown 噪声格式。' })}
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
                <input id="${ids.recordFilterJsonKeysId}" class="stx-ui-input" type="text" placeholder="content,text,message" data-tip="smart 模式下仅提取这些键名对应的文本，逗号分隔。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">占位文本</span>
                <input id="${ids.recordFilterPlaceholderId}" class="stx-ui-input" type="text" placeholder="[代码内容已过滤]" data-tip="当策略为占位时写入的提示文本。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">最大保存字符</span>
                <input id="${ids.recordFilterMaxTextLengthId}" class="stx-ui-input" type="number" min="200" max="20000" step="100" data-tip="单条记录允许保存的最大字符数。" />
              </label>
              <label>
                <span style="display:block; font-size:12px; margin-bottom:4px;">最小有效字符</span>
                <input id="${ids.recordFilterMinEffectiveCharsId}" class="stx-ui-input" type="number" min="1" max="200" step="1" data-tip="小于该有效字符数的文本会被判定为无效内容。" />
              </label>
            </div>
            <label
              class="stx-ui-inline"
              style="margin-top:8px;"
            >
              ${renderSharedCheckbox({
                id: ids.recordFilterCustomCodeblockEnabledId,
                dataTip: '开启后，不再清除全部代码块；仅清理下方填写标签的代码块。默认建议至少保留 rolljson。',
              })}
              启用自定义代码块过滤（仅清理指定标签）
            </label>
            <label
              style="display:block; width:100%; margin-top:8px;"
            >
              <span style="display:block; font-size:12px; margin-bottom:4px;">代码块标签（逗号分隔）</span>
              <textarea
                id="${ids.recordFilterCustomCodeblockTagsId}"
                class="stx-ui-input stx-ui-codeblock-tags"
                rows="3"
                placeholder="rolljson&#10;json"
                data-tip="填写后只会清理这些标签的代码块；未匹配标签的代码块会保留。"
              ></textarea>
            </label>
            <label class="stx-ui-inline" style="margin-top:8px;">
              ${renderSharedCheckbox({
                id: ids.recordFilterCustomRegexEnabledId,
                dataTip: '开启后按规则清理自定义正则命中的文本片段。',
              })}
              启用自定义正则清理
            </label>
            <textarea id="${ids.recordFilterCustomRegexRulesId}" class="stx-ui-input" rows="4" placeholder="/\\[OOC\\][^\\n]*/g" style="width:100%; margin-top:8px;" data-tip="每行一条规则；支持 /pattern/flags 或普通文本匹配。"></textarea>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="record filter preview">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">过滤预览</div>
              <div class="stx-ui-item-desc">输入原文，仅预览不过库。</div>
            </div>
            <textarea id="${ids.recordFilterPreviewInputId}" class="stx-ui-input" rows="4" placeholder="在这里测试过滤效果..." style="width:100%;" data-tip="输入测试文本，点击预览查看过滤结果。"></textarea>
            <div class="stx-ui-actions">
              <button id="${ids.recordFilterPreviewBtnId}" type="button" class="stx-ui-btn secondary" data-tip="执行一次过滤预览，不会写入数据库。">预览过滤结果</button>
            </div>
            <pre id="${ids.recordFilterPreviewOutputId}" style="width:100%; white-space:pre-wrap; word-break:break-word; font-size:12px; background:rgba(0,0,0,0.2); border-radius:6px; padding:8px; margin:0;" data-tip="显示预览结果与命中规则。"></pre>
          </div>
        </div>

        <div id="${ids.panelDbId}" class="stx-ui-panel" hidden>

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
                     max-height: 360px; overflow-y: auto; font-family: monospace;"
              data-tip="显示历史审计记录；快照项可一键回滚。">
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

