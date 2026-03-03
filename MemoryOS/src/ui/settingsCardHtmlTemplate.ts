import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import {
  renderSharedCheckbox,
  renderSharedCheckboxWithLabel,
} from '../../../_Components/sharedCheckbox';

export function buildSettingsCardHtmlTemplate(
  ids: MemoryOSSettingsIds
): string {
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
          <input id="${ids.searchId}" class="text_pole flex1 stx-ui-search" placeholder="搜索设置" type="search" data-tip="按关键词快速筛选设置项。" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" type="button" class="stx-ui-tab is-active" data-tip="切换到主设置面板。">
            <i class="fa-solid fa-gear"></i>
            <span>主设置</span>
          </button>
          <button id="${ids.tabAiId}" type="button" class="stx-ui-tab" data-tip="切换到 AI 规则面板。">
            <i class="fa-solid fa-microchip"></i>
            <span>AI 规则</span>
          </button>
          <button id="${ids.tabDbId}" type="button" class="stx-ui-tab" data-tip="切换到数据管理面板。">
            <i class="fa-solid fa-database"></i>
            <span>数据管理</span>
          </button>
          <button id="${ids.tabTemplateId}" type="button" class="stx-ui-tab" data-tip="切换到世界模板面板。">
            <i class="fa-solid fa-table-columns"></i>
            <span>世界模板</span>
          </button>
          <button id="${ids.tabAuditId}" type="button" class="stx-ui-tab" data-tip="切换到审计回滚面板。">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>审计回滚</span>
          </button>
          <button id="${ids.tabAboutId}" type="button" class="stx-ui-tab" data-tip="切换到关于面板。">
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
              ${renderSharedCheckbox({
                id: ids.enabledId,
                dataTip: 'MemoryOS 总开关。关闭后将停止记录与处理记忆。',
              })}
            </div>
          </label>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="ai mode rule extraction">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">
                启用 AI 模式
                <i id="${ids.aiModeStatusLightId}" class="fa-solid fa-circle-question" style="color: #666; font-size: 11px; margin-left: 6px;" title="通信中..."></i>
              </div>
              <div class="stx-ui-item-desc">开启后用 AI 抽取事实。关闭后只用规则模式。</div>
            </div>
            <div class="stx-ui-inline">
              ${renderSharedCheckbox({
                id: ids.aiModeEnabledId,
                dataTip: '启用 AI 抽取模式。关闭时仅使用规则模式处理记忆。',
              })}
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
              <input id="${ids.contextMaxTokensId}" class="stx-ui-input" type="number" min="500" max="8000" step="100" data-tip="限制每次注入给 AI 的上下文长度，过大可能影响性能。" />
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

          <div class="stx-ui-divider">
            <i class="fa-solid fa-screwdriver-wrench"></i>
            <span>数据维护</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="manual actions db export clear">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">维护操作</div>
              <div class="stx-ui-item-desc">这里是手动维护功能。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.dbCompactBtnId}" type="button" class="stx-ui-btn" data-tip="立即执行一次数据压缩。">立即压缩</button>
              <button id="${ids.recordEditorBtnId}" type="button" class="stx-ui-btn" data-tip="打开记录编辑器，手动查看和修改记录。">
                <i class="fa-solid fa-pen-to-square"></i>&nbsp;记录编辑
              </button>
              <button id="${ids.dbExportBtnId}" type="button" class="stx-ui-btn secondary" data-tip="导出当前聊天的记忆数据包。">导出记忆包</button>
              <button id="${ids.dbImportBtnId}" type="button" class="stx-ui-btn secondary" data-tip="导入记忆包到当前聊天。">导入记忆包</button>
              <button id="${ids.dbClearBtnId}" type="button" class="stx-ui-btn secondary" style="color:#ff8787; border-color: rgba(255,135,135,0.3);" data-tip="清空当前聊天下的全部记忆数据。">清空当前聊天数据</button>
            </div>
          </div>
          <div id="${ids.dbCompactionDividerId}" class="stx-ui-divider">
            <i class="fa-solid fa-box-archive"></i>
            <span>数据压缩与清理</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="auto compaction archive" data-stx-db-group="compaction">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">自动压缩事件</div>
              <div class="stx-ui-item-desc">开启后，事件多了会自动压缩。</div>
            </div>
            <div class="stx-ui-inline">
              ${renderSharedCheckbox({
                id: ids.autoCompactionId,
                dataTip: '开启后，事件数量达到阈值时自动执行压缩。',
              })}
            </div>
          </label>
          
          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="threshold limit events" data-stx-db-group="compaction">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">事件流压缩阈值</div>
              <div class="stx-ui-item-desc">事件达到这个数量时开始压缩。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.compactionThresholdId}" class="stx-ui-input" type="number" min="500" max="20000" step="500" data-tip="设置触发自动压缩的事件数量阈值。" />
            </div>
          </div>
          
          <div class="stx-ui-divider">
            <i class="fa-solid fa-satellite-dish"></i>
            <span>通讯诊断</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="bus inspector connection test ping hello">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">通信自检</div>
              <div class="stx-ui-item-desc">用于检查 MemoryOS 和 LLMHub 是否连通。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.testPingBtnId}" type="button" class="stx-ui-btn secondary" data-tip="发送 Ping 测试，检查通信链路是否可达。">发送连通测试</button>
              <button id="${ids.testHelloBtnId}" type="button" class="stx-ui-btn secondary" style="border-color: rgba(140, 235, 140, 0.4);" data-tip="向 LLMHub 发送握手请求，检查服务响应。">向 LLMHub 打招呼</button>
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
            <div id="${ids.templateListId}" style="width: 100%; font-size: 12px; color: var(--SmartThemeBodyColor, #ccc); background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: monospace;" data-tip="展示当前聊天绑定模板与 Schema 信息。">
              正在加载...
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.templateRefreshBtnId}" type="button" class="stx-ui-btn" data-tip="刷新模板列表并同步显示当前绑定状态。">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新模板列表
              </button>
              <button id="${ids.templateForceRebuildBtnId}" type="button" class="stx-ui-btn secondary" data-tip="从世界书重新构建模板结构。">
                <i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;强制重建模板 (从世界书)
              </button>
            </div>
            <div style="display:flex; gap:8px; align-items:center; width:100%;">
              <select id="${ids.templateActiveSelectId}" class="stx-ui-input" style="flex:1; padding: 4px 8px; font-size: 12px;" data-tip="选择要激活的模板。">
                <option value="">选择要激活的模板...</option>
              </select>
              <label style="display:flex; align-items:center; gap:6px; font-size:12px; white-space:nowrap;">
                ${renderSharedCheckbox({ id: ids.templateLockId, dataTip: '锁定后保持当前模板，避免被自动切换。' })}
                锁定模板
              </label>
              <button id="${ids.templateSetActiveBtnId}" type="button" class="stx-ui-btn" data-tip="应用当前选择的模板。">应用</button>
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
              <button id="${ids.wiPreviewBtnId}" type="button" class="stx-ui-btn secondary" data-tip="预览即将写回世界书的内容。">
                <i class="fa-solid fa-eye"></i>&nbsp;预览写回内容
              </button>
              <button id="${ids.wiWritebackBtnId}" type="button" class="stx-ui-btn" data-tip="将事实与摘要一起写回世界书。">
                <i class="fa-solid fa-upload"></i>&nbsp;写回全部
              </button>
              <button id="${ids.wiWriteSummaryBtnId}" type="button" class="stx-ui-btn secondary" data-tip="仅写回摘要到世界书。">
                <i class="fa-solid fa-file-lines"></i>&nbsp;只写摘要
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
              <select id="${ids.logicTableEntitySelectId}" class="stx-ui-input" style="flex: 1; padding: 4px 8px; font-size: 12px;" data-tip="选择要查看和编辑的实体类型。">
                <option value="">选择实体类型...</option>
              </select>
              <button id="${ids.logicTableRefreshBtnId}" type="button" class="stx-ui-btn" style="padding: 4px 10px; font-size: 12px;" data-tip="刷新当前实体类型的逻辑表数据。">
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
              <button id="${ids.auditCreateSnapshotBtnId}" type="button" class="stx-ui-btn" data-tip="创建当前状态快照，便于后续回滚。">
                <i class="fa-solid fa-camera"></i>&nbsp;创建快照
              </button>
              <button id="${ids.auditRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新审计与快照列表。">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新审计记录
              </button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 4px;">
            <div class="stx-ui-item-title" style="font-size: 13px;">历史记录（快照可回滚，其他仅查看）</div>
            <div id="${ids.auditListId}"
              style="width: 100%; font-size: 12px; color: var(--SmartThemeBodyColor, #ccc);
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
            <div class="stx-ui-item-title">更新日志</div>
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

