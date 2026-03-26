import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import { buildDiagnosticsTabPanel } from './settingsTabs/diagnosticsTab';
import { buildOverviewTabPanel } from './settingsTabs/overviewTab';
import { buildRelationsStructureTabPanel } from './settingsTabs/relationsStructureTab';
import { buildRolesAndLocationsTabPanel } from './settingsTabs/rolesAndLocationsTab';
import { buildAboutDiagnosticsTabPanel } from './settingsTabs/aboutDiagnosticsTab';
import { buildDataMaintenanceTabPanel } from './settingsTabs/dataMaintenanceTab';
import { buildMemoryStrategyTabPanel } from './settingsTabs/memoryStrategyTab';
import { buildInjectionPromptTabPanel } from './settingsTabs/injectionPromptTab';
import { buildRuntimeControlTabPanel } from './settingsTabs/runtimeControlTab';

/**
 * 功能：构建 MemoryOS 设置面板 HTML。
 * @param ids 控件 ID 集合。
 * @returns 整体面板 HTML。
 */
export function buildSettingsCardHtmlTemplate(ids: MemoryOSSettingsIds): string {
    return `
      <div class="inline-drawer stx-ui-shell">
        <div class="inline-drawer-toggle inline-drawer-header stx-ui-head" id="${ids.drawerToggleId}">
          <div class="stx-ui-head-title">
            <span style="margin-bottom:2px;">${ids.displayName}</span>
            <span id="${ids.badgeId}" class="stx-ui-head-badge">${ids.badgeText}</span>
          </div>
          <div id="${ids.drawerIconId}" class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable" tabindex="0" role="button"></div>
        </div>

        <div class="inline-drawer-content stx-ui-content" id="${ids.drawerContentId}" style="display:none;">
          <div class="stx-ui-mode-bar">
            <div class="stx-ui-mode-copy">
              <span class="stx-ui-mode-kicker">MemoryOS</span>
              <div class="stx-ui-mode-title">设置总览</div>
            </div>
            <button id="${ids.experienceRefreshBtnId}" type="button" class="stx-ui-btn secondary stx-ui-refresh-btn">
              <i class="fa-solid fa-rotate"></i>&nbsp;刷新
            </button>
          </div>

          <div class="stx-ui-tabs stx-ui-tabs-primary">
            <button id="${ids.tabRoleId}" data-tip="查看当前聊天的整体总览、场景和健康度。" type="button" class="stx-ui-tab is-active">
              <i class="fa-solid fa-compass"></i>
              <span>总览</span>
            </button>
            <button id="${ids.tabRecentId}" data-tip="按角色和地点浏览当前聊天实体。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-map-location-dot"></i>
              <span>角色与地点</span>
            </button>
            <button id="${ids.tabRelationId}" data-tip="查看关系与结构状态、空态解释及系统诊断入口。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-table-cells-large"></i>
              <span>关系与结构</span>
            </button>
            <button id="${ids.tabInjectionId}" data-tip="查看数据分层诊断、问题列表和修复动作。" type="button" class="stx-ui-tab">
              <i class="fa-solid fa-stethoscope"></i>
              <span>诊断</span>
            </button>
          </div>

          ${buildOverviewTabPanel(ids)}
          ${buildRolesAndLocationsTabPanel(ids)}
          ${buildRelationsStructureTabPanel(ids)}
          ${buildDiagnosticsTabPanel(ids)}

          <div id="${ids.panelAdvancedToolsId}" class="stx-ui-panel stx-ui-advanced-panel">
            <div class="stx-ui-advanced-head">
              <div class="stx-ui-advanced-head-title">高级工具</div>
              <div class="stx-ui-advanced-head-search">
                <input id="${ids.searchId}" data-tip="按关键词过滤设置项。" class="text_pole flex1 stx-ui-search" placeholder="搜索工具" type="search" />
              </div>
            </div>

            <div class="stx-ui-tabs stx-ui-tabs-secondary">
              <button id="${ids.tabMainId}" data-tip="查看主控制项。" type="button" class="stx-ui-tab is-active">
                <i class="fa-solid fa-power-off"></i>
                <span>运行控制</span>
              </button>
              <button id="${ids.tabAiId}" data-tip="查看聊天策略和调参。" type="button" class="stx-ui-tab">
                <i class="fa-solid fa-microchip"></i>
                <span>记忆策略</span>
              </button>
              <button id="${ids.tabPromptId}" data-tip="配置每轮默认注入的基础信息内容。" type="button" class="stx-ui-tab">
                <i class="fa-solid fa-file-lines"></i>
                <span>注入提示词</span>
              </button>
              <button id="${ids.tabDbId}" data-tip="查看数据库、模板和维护操作。" type="button" class="stx-ui-tab">
                <i class="fa-solid fa-database"></i>
                <span>数据维护</span>
              </button>
              <button id="${ids.tabAboutId}" data-tip="查看插件信息和 AI 诊断。" type="button" class="stx-ui-tab">
                <i class="fa-solid fa-circle-info"></i>
                <span>关于与诊断</span>
              </button>
            </div>

            ${buildRuntimeControlTabPanel(ids)}
            ${buildMemoryStrategyTabPanel(ids)}
            ${buildInjectionPromptTabPanel(ids)}
            ${buildDataMaintenanceTabPanel(ids)}
            ${buildAboutDiagnosticsTabPanel(ids)}
          </div>
        </div>
      </div>
    `.trim();
}
