import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';

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
          <input id="${ids.searchId}" class="text_pole flex1 stx-ui-search" placeholder="搜索设置" type="search" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>主设置</span>
          </button>
          <button id="${ids.tabAiId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-microchip"></i>
            <span>AI 规则</span>
          </button>
          <button id="${ids.tabDbId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-database"></i>
            <span>数据管理</span>
          </button>
          <button id="${ids.tabTemplateId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-table-columns"></i>
            <span>世界模板</span>
          </button>
          <button id="${ids.tabAuditId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>审计回滚</span>
          </button>
          <button id="${ids.tabAboutId}" type="button" class="stx-ui-tab">
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
              <div class="stx-ui-item-desc">总开关，控制记忆收集、状态追踪和自动化提议。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.enabledId}" type="checkbox" />
            </div>
          </label>

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="ai mode rule extraction">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用 AI 模式</div>
              <div class="stx-ui-item-desc">开启后将使用大模型分析事件并进行事实抽取，关闭则仅使用基础 Rule 模式（快速压缩）。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.aiModeEnabledId}" type="checkbox" />
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
              <div class="stx-ui-item-desc">每次对话时，注入到 Prompt 里的世界状态和事实的最大总长度。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.contextMaxTokensId}" class="stx-ui-input" type="number" min="500" max="8000" step="100" />
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
              <div class="stx-ui-item-title">自动事务压缩 (Auto Compaction)</div>
              <div class="stx-ui-item-desc">当事件流长到一定程度时，自动聚合并归档早期事件。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.autoCompactionId}" type="checkbox" />
            </div>
          </label>
          
          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="threshold limit events">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">事件流压缩阈值</div>
              <div class="stx-ui-item-desc">当事件流达到多少条时触发软归档与摘要生成。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.compactionThresholdId}" class="stx-ui-input" type="number" min="500" max="20000" step="500" />
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="manual actions db export clear">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">维护操作</div>
              <div class="stx-ui-item-desc">手动执行数据库运维。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.dbCompactBtnId}" type="button" class="stx-ui-btn">立即压缩</button>
              <button id="${ids.dbExportBtnId}" type="button" class="stx-ui-btn secondary">导出记忆包</button>
              <button id="${ids.dbClearBtnId}" type="button" class="stx-ui-btn secondary" style="color:#ff8787; border-color: rgba(255,135,135,0.3);">清空当前聊天数据</button>
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
              <div class="stx-ui-item-desc">根据当前聊天已激活的世界书，由 AI 分析生成的逻辑表结构。</div>
            </div>
            <div id="${ids.templateListId}" style="width: 100%; font-size: 12px; color: var(--SmartThemeBodyColor, #ccc); background: rgba(0,0,0,0.2); border-radius: 6px; padding: 10px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; font-family: monospace;">
              正在加载...
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.templateRefreshBtnId}" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新模板列表
              </button>
              <button id="${ids.templateForceRebuildBtnId}" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;强制重建模板 (从世界书)
              </button>
            </div>
          </div>

          <!-- 世界书写回区块 -->
          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 10px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">写回到 SillyTavern WorldInfo
                <span style="font-size: 10px; color: #aaa; font-weight: normal; margin-left: 6px;">（将稳定事实和摘要导入为世界书条目）</span>
              </div>
              <div class="stx-ui-item-desc">写回后 ST 原生世界书引擎可直接进行自动注入，用户也可在 ST 界面手编。</div>
            </div>
            <div id="${ids.wiPreviewId}" style="width: 100%; font-size: 11px; color: #aaa; background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; max-height: 100px; overflow-y: auto; font-family: monospace;"></div>
            <div class="stx-ui-actions">
              <button id="${ids.wiPreviewBtnId}" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-eye"></i>&nbsp;预览写回内容
              </button>
              <button id="${ids.wiWritebackBtnId}" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-upload"></i>&nbsp;写回到世界书（全部）
              </button>
              <button id="${ids.wiWriteSummaryBtnId}" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-file-lines"></i>&nbsp;仅写回摘要
              </button>
            </div>
          </div>

          <!-- 逻辑表可编辑区块 -->
          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 8px;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">逻辑表（可编辑）
                <span style="font-size: 10px; color: #aaa; font-weight: normal; margin-left: 6px;">（双击内容进入编辑）</span>
              </div>
              <div class="stx-ui-item-desc">根据当前模板生成的实体表，所有条目均可直接内联编辑并实时写入 facts。</div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; width: 100%;">
              <label style="font-size: 12px; white-space: nowrap;">实体类型：</label>
              <select id="${ids.logicTableEntitySelectId}" class="stx-ui-input" style="flex: 1; padding: 4px 8px; font-size: 12px;">
                <option value="">选择实体类型...</option>
              </select>
              <button id="${ids.logicTableRefreshBtnId}" type="button" class="stx-ui-btn" style="padding: 4px 10px; font-size: 12px;">
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
              <div class="stx-ui-item-desc">创建当前所有事实/摘要/世界状态的快照，稍后可以从历史列表里点击"回滚"恢复到该时刻。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.auditCreateSnapshotBtnId}" type="button" class="stx-ui-btn">
                <i class="fa-solid fa-camera"></i>&nbsp;创建快照
              </button>
              <button id="${ids.auditRefreshBtnId}" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-rotate"></i>&nbsp;刷新审计记录
              </button>
            </div>
          </div>

          <div class="stx-ui-item" style="flex-direction: column; align-items: flex-start; gap: 6px; margin-top: 4px;">
            <div class="stx-ui-item-title" style="font-size: 13px;">历史记录（快照可回滚，其他仅查看）</div>
            <div id="${ids.auditListId}"
              style="width: 100%; font-size: 12px; color: var(--SmartThemeBodyColor, #ccc);
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
            <div class="stx-ui-item-title">更新日志 (Changelog)</div>
            <div class="stx-ui-changelog">
              ${ids.changelogHtml}
            </div>
          </div>
          
          <div class="stx-ui-tip">
            Memory OS 是智能状态管理中心。通过事件总线处理行为，将状态聚合反馈给 AI。
          </div>
        </div>
      </div>
    </div>
  `;
}
