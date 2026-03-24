import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

/**
 * 功能：构建“总览”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildOverviewTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelRoleId}" class="stx-ui-panel">
        <div class="stx-ui-experience-shell">
          <div class="stx-ui-actions stx-ui-experience-actions">
            <button id="${ids.experienceRecordEditorBtnId}" type="button" class="stx-ui-btn" data-tip="打开记录编辑器，直接查看 facts、state、summary 与事件。">
              <i class="fa-solid fa-pen-to-square"></i>&nbsp;打开记录编辑器
            </button>
            <button id="${ids.experienceSnapshotBtnId}" type="button" class="stx-ui-btn secondary" data-tip="立即重建当前聊天的逻辑视图。">
              <i class="fa-solid fa-rotate"></i>&nbsp;重建 Chat View
            </button>
            <button data-stx-editor-action="refresh-seed" type="button" class="stx-ui-btn secondary" data-tip="重新提取并刷新 semantic seed。">
              <i class="fa-solid fa-seedling"></i>&nbsp;刷新 Seed
            </button>
          </div>
          <div id="${ids.roleOverviewMetaId}" style="display:flex;flex-direction:column;gap:10px;"></div>
          <div class="stx-ui-experience-grid">
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>角色概览</h3>
                <p>主要角色、别名、身份摘要和最近活跃情况。</p>
              </div>
              <div id="${ids.rolePersonaBadgesId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>当前场景</h3>
                <p>当前场景、冲突、待处理事件和参与者。</p>
              </div>
              <div id="${ids.rolePrimaryFactsId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>聊天上下文</h3>
                <p>可见消息、最近变化与是否建议重建视图。</p>
              </div>
              <div id="${ids.roleRecentMemoryId}"></div>
            </section>
            <section class="stx-ui-experience-card">
              <div class="stx-ui-experience-card-head">
                <h3>健康度</h3>
                <p>孤儿事实、草稿修订、问题标签与建议动作。</p>
              </div>
              <div id="${ids.roleBlurMemoryId}"></div>
            </section>
          </div>
        </div>
      </div>
    `.trim();
}

