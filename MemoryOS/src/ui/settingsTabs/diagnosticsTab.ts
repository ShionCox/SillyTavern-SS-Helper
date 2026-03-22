import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

/**
 * 功能：构建“诊断”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildDiagnosticsTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelInjectionId}" class="stx-ui-panel" hidden>
        <div class="stx-ui-experience-grid">
          <section class="stx-ui-experience-card">
            <div class="stx-ui-experience-card-head">
              <h3>数据分层诊断</h3>
              <p>核对 facts、state、summary、template、seed 与 logical view 的存在情况。</p>
            </div>
            <div id="${ids.injectionOverviewId}"></div>
          </section>
          <section class="stx-ui-experience-card">
            <div class="stx-ui-experience-card-head">
              <h3>问题列表</h3>
              <p>聚合维护洞察、健康标签和结构风险提示。</p>
            </div>
            <div id="${ids.injectionSectionsId}"></div>
          </section>
          <section class="stx-ui-experience-card">
            <div class="stx-ui-experience-card-head">
              <h3>修复动作</h3>
              <p>优先提供当前已有的 rebuild、refresh 和查看动作。</p>
            </div>
            <div id="${ids.injectionPostId}"></div>
          </section>
          <section class="stx-ui-experience-card stx-ui-experience-card-wide stx-ui-experience-card-reason">
            <div class="stx-ui-experience-card-head">
              <h3>诊断说明</h3>
              <p>解释为什么会空、为什么建议修复，以及下一步维护入口。</p>
            </div>
            <div id="${ids.injectionReasonId}"></div>
          </section>
        </div>
      </div>
    `.trim();
}

/**
 * 功能：绑定“诊断”页签事件。
 * @returns 无返回值。
 */
export function bindDiagnosticsTab(): void {
}
