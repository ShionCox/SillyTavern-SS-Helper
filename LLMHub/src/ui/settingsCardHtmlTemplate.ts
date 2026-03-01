import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';

export function buildSettingsCardHtmlTemplate(
  ids: LLMHubSettingsIds
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
          <button id="${ids.tabRouterId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-route"></i>
            <span>路由配置</span>
          </button>
          <button id="${ids.tabVaultId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-key"></i>
            <span>凭据金库</span>
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

          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable llm hub switch">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启接 LLM Hub</div>
              <div class="stx-ui-item-desc">总开关，控制是否接管请求代理。关闭后系统将直接调用 ST 原生发送层。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.enabledId}" type="checkbox" />
            </div>
          </label>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-sliders"></i>
            <span>默认参数策略 (Profile)</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile temperature param">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认 Profile</div>
              <div class="stx-ui-item-desc">当插件请求未指定特定 Profile 时，默认使用的参数集合（影响温度、惩罚项等）。</div>
            </div>
            <div class="stx-ui-row">
              <select id="${ids.globalProfileId}" class="stx-ui-select">
                <option value="balanced">均衡 (Balanced)</option>
                <option value="precise">精确/逻辑 (Precise)</option>
                <option value="creative">创造/发散 (Creative)</option>
                <option value="economy">经济/单轮 (Economy)</option>
              </select>
            </div>
          </div>
        </div>

        <div id="${ids.panelRouterId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-network-wired"></i>
            <span>全局后备路由</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default provider router fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认 Provider</div>
              <div class="stx-ui-item-desc">未能命中明确路由策略时的全局 Fallback 后端。</div>
            </div>
            <div class="stx-ui-row">
              <select id="${ids.defaultProviderId}" class="stx-ui-select">
                <!-- 动态填充 -->
                <option value="openai">OpenAI API</option>
                <option value="claude">Anthropic Claude</option>
                <option value="st-native">ST 原生前端代理 *</option>
              </select>
            </div>
          </div>
          
          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default model deploy fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认处理模型 (Model)</div>
              <div class="stx-ui-item-desc">用于后备请求的默认大语言模型名称。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.defaultModelId}" class="stx-ui-input" type="text" placeholder="如 gpt-4o-mini" />
            </div>
          </div>
          
          <div class="stx-ui-tip">
            详细的「Task 优先级路由表」目前由配置数据层接管，本面板仅设置兜底默认值。
          </div>
        </div>

        <div id="${ids.panelVaultId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-vault"></i>
            <span>凭据金库 (Vault)</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="vault credential add api key">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">更新服务密钥</div>
              <div class="stx-ui-item-desc">在此处录入 API Key 以存入内部加密缓存，不会被日志打印。</div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" style="flex-direction: column; align-items: stretch;" data-stx-ui-search="vault credential update">
            <div class="stx-ui-row" style="margin-bottom:8px; justify-content: flex-start;">
              <span class="stx-ui-field-label" style="width: 80px;">服务标识</span>
              <select id="${ids.vaultAddServiceId}" class="stx-ui-select" style="min-width: 140px;">
                <option value="openai">openai</option>
                <option value="claude">claude</option>
                <option value="gemini">gemini</option>
                <option value="groq">groq</option>
              </select>
            </div>
            <div class="stx-ui-row" style="margin-bottom:12px; justify-content: flex-start;">
              <span class="stx-ui-field-label" style="width: 80px;">API Key</span>
              <input id="${ids.vaultApiKeyId}" class="stx-ui-input vault-key-input" type="password" placeholder="sk-..." style="flex:1;" />
            </div>
            <div class="stx-ui-actions" style="justify-content: flex-end;">
              <button id="${ids.vaultSaveBtnId}" type="button" class="stx-ui-btn">加密存入</button>
            </div>
          </div>
          
          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="vault erase all keys">
             <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">清空金库</div>
              <div class="stx-ui-item-desc">清除浏览器本地存储的所有后台调用密钥。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultClearBtnId}" type="button" class="stx-ui-btn secondary" style="color:#ff8787; border-color: rgba(255,135,135,0.3);">清除全部密钥</button>
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
            LLM Hub 提供统一的并发控制、熔断限流和 Provider 兜底降级方案，是各插件的共享智能大脑。
          </div>
        </div>
      </div>
    </div>
  `;
}
