import type { TemplateSettingsIds } from './settingsCardTemplateTypes';

export function buildSettingsCardHtmlTemplate(ids: TemplateSettingsIds): string {
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

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable module switch">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用模块</div>
              <div class="stx-ui-item-desc">在此处填入开关描述。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.enabledId}" type="checkbox" />
            </div>
          </label>
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
            请在此添加简短的功能指引说明。
          </div>
        </div>
      </div>
    </div>
  `;
}
