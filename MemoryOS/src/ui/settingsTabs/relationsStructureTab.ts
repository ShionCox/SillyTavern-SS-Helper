import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

/**
 * 功能：构建“关系与结构”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildRelationsStructureTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelRelationId}" class="stx-ui-panel" hidden>
        <div id="${ids.relationOverviewId}"></div>
        <div class="stx-ui-experience-grid">
          <section class="stx-ui-experience-card stx-ui-experience-card-wide">
            <div class="stx-ui-experience-card-head">
              <h3>结构状态说明</h3>
              <p>解释稳定结构化层的当前状态；就算表暂时为空，也会继续提示数据可能停留在哪一层。</p>
            </div>
            <div id="${ids.relationLanesId}"></div>
          </section>
          <section class="stx-ui-experience-card stx-ui-experience-card-wide">
            <div class="stx-ui-experience-card-head">
              <h3>系统诊断入口</h3>
              <p>关系和结构问题统一从系统诊断进入，集中查看风险、候选修复、别名整理和隐藏项状态。</p>
            </div>
            <div class="stx-ui-actions">
              <button data-stx-editor-action="open-diagnostics" type="button" class="stx-ui-btn secondary">
                <i class="fa-solid fa-stethoscope"></i>&nbsp;查看诊断
              </button>
            </div>
          </section>
          <section class="stx-ui-experience-card stx-ui-experience-card-wide">
            <div class="stx-ui-experience-card-head">
              <h3>关系风险与空态解释</h3>
              <p>继续说明 alias / redirect / tombstone 风险，以及为什么当前看起来像“没有数据”。</p>
            </div>
            <div id="${ids.relationStateId}"></div>
          </section>
        </div>
      </div>
    `.trim();
}
