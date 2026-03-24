import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

/**
 * 功能：构建“诊断”页签面板。
 * @param ids 控件 ID 集合。
 * @returns 面板 HTML。
 */
export function buildDiagnosticsTabPanel(ids: MemoryOSSettingsIds): string {
    return `
      <div id="${ids.panelInjectionId}" class="stx-ui-panel" hidden>
        <div class="stx-ui-diagnostics-shell">
          <section class="stx-ui-diagnostics-hero">
            <div class="stx-ui-diagnostics-hero-copy">
              <span class="stx-ui-diagnostics-kicker">MemoryOS 诊断台</span>
              <h3>系统诊断控制台</h3>
              <p>把注入决策、结构健康、修复动作和解释快照收敛到同一页，避免在多个入口之间来回跳转。</p>
            </div>
            <div class="stx-ui-diagnostics-hero-signal" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </section>
          <div class="stx-ui-diagnostics-grid">
            <section class="stx-ui-experience-card stx-ui-diagnostics-card stx-ui-diagnostics-card-overview">
              <div class="stx-ui-experience-card-head stx-ui-diagnostics-card-head">
                <span class="stx-ui-diagnostics-card-index">01</span>
                <div>
                  <h3>诊断总览</h3>
                  <p>集中展示注入结果、数据层状态和当前轮次的关键指标。</p>
                </div>
              </div>
              <div id="${ids.injectionOverviewId}"></div>
            </section>
            <section class="stx-ui-experience-card stx-ui-diagnostics-card stx-ui-diagnostics-card-actions">
              <div class="stx-ui-experience-card-head stx-ui-diagnostics-card-head">
                <span class="stx-ui-diagnostics-card-index">02</span>
                <div>
                  <h3>调度动作</h3>
                  <p>把高频修复和排查动作整理成一个操作面板。</p>
                </div>
              </div>
              <div id="${ids.injectionPostId}"></div>
            </section>
            <section class="stx-ui-experience-card stx-ui-diagnostics-card stx-ui-diagnostics-card-issues">
              <div class="stx-ui-experience-card-head stx-ui-diagnostics-card-head">
                <span class="stx-ui-diagnostics-card-index">03</span>
                <div>
                  <h3>风险列表</h3>
                  <p>优先暴露需要立即处理的结构问题和维护提示。</p>
                </div>
              </div>
              <div id="${ids.injectionSectionsId}"></div>
            </section>
            <section class="stx-ui-experience-card stx-ui-diagnostics-card stx-ui-diagnostics-card-reason">
              <div class="stx-ui-experience-card-head stx-ui-diagnostics-card-head">
                <span class="stx-ui-diagnostics-card-index">04</span>
                <div>
                  <h3>解释快照</h3>
                  <p>保留本轮命中、冲突压制和未入选候选的诊断证据。</p>
                </div>
              </div>
              <div id="${ids.injectionReasonId}"></div>
            </section>
          </div>
        </div>
      </div>
    `.trim();
}

