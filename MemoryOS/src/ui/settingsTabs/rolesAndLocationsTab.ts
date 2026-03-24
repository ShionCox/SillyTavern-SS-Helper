import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

/**
 * 功能：构建“角色与地点”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildRolesAndLocationsTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelRecentId}" class="stx-ui-panel" hidden>
        <div id="${ids.recentLifecycleId}"></div>
        <div class="stx-ui-experience-grid">
          <section class="stx-ui-experience-card">
            <div class="stx-ui-experience-card-head">
              <h3>角色侧</h3>
              <p>按角色浏览身份、关系、地点和活跃时间。</p>
            </div>
            <div id="${ids.recentEventsId}"></div>
          </section>
          <section class="stx-ui-experience-card">
            <div class="stx-ui-experience-card-head">
              <h3>地点侧</h3>
              <p>按地点浏览类型、相关角色和最近事件。</p>
            </div>
            <div id="${ids.recentSummariesId}"></div>
          </section>
        </div>
      </div>
    `.trim();
}

