import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import { renderSharedCheckbox } from '../../../_Components/sharedCheckbox';

/**
 * 功能：构建 LLMHub 设置面板 HTML。
 * @param ids DOM 节点 ID 映射。
 * @returns 设置面板 HTML 字符串。
 */
export function buildSettingsCardHtmlTemplate(ids: LLMHubSettingsIds): string {
    return `
    <div class="inline-drawer stx-ui-shell">
      <div class="inline-drawer-toggle inline-drawer-header stx-ui-head" id="${ids.drawerToggleId}">
        <div class="stx-ui-head-title">
          <span>${ids.displayName}</span>
          <span id="${ids.badgeId}" class="stx-ui-head-badge">${ids.badgeText}</span>
        </div>
        <div id="${ids.drawerIconId}" class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable" tabindex="0" role="button"></div>
      </div>

      <div class="inline-drawer-content stx-ui-content" id="${ids.drawerContentId}" style="display:none;">
        <div class="stx-ui-filters flex-container">
          <input id="${ids.searchId}" class="text_pole flex1 stx-ui-search" placeholder="搜索设置项" type="search" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>基础设置</span>
          </button>
          <button id="${ids.tabRouterId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-route"></i>
            <span>路由与预算</span>
          </button>
          <button id="${ids.tabConsumerMapId}" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-diagram-project"></i>
            <span>插件映射</span>
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
          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable llm hub switch">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用 LLMHub</div>
              <div class="stx-ui-item-desc">总开关。关闭后不再分发 AI 请求。</div>
            </div>
            <div class="stx-ui-inline">
              ${renderSharedCheckbox({ id: ids.enabledId })}
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile default profile">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认参数档</div>
              <div class="stx-ui-item-desc">任务未指定参数档时使用。</div>
            </div>
            <div class="stx-ui-row">
              <select id="${ids.globalProfileId}" class="stx-ui-select">
                <option value="balanced">平衡</option>
                <option value="precise">精准</option>
                <option value="creative">创意</option>
                <option value="economy">经济</option>
              </select>
            </div>
          </div>
        </div>

        <div id="${ids.panelRouterId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="default provider model route">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">常用默认路由</div>
              <div class="stx-ui-item-desc">平时只改这里：默认服务商和默认模型。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.defaultProviderId}">默认服务商</label>
                <select id="${ids.defaultProviderId}" class="stx-ui-select stx-ui-input-full"></select>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.defaultModelId}">默认模型</label>
                <input id="${ids.defaultModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="例如 gpt-4o-mini" />
              </div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack stx-ui-advanced">
            <button id="${ids.routerAdvancedToggleId}" class="stx-ui-advanced-toggle" type="button" aria-expanded="false">
              <span class="stx-ui-advanced-title">高级规则</span>
              <span class="stx-ui-advanced-subtitle">路由规则与预算规则</span>
              <i class="fa-solid fa-chevron-down"></i>
            </button>
            <div id="${ids.routerAdvancedBodyId}" class="stx-ui-advanced-body" hidden>
              <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route policy task provider profile fallback">
                <div class="stx-ui-item-main">
                  <div class="stx-ui-item-title">任务路由规则</div>
                  <div class="stx-ui-item-desc">按“调用方 + 任务”保存，重复会覆盖。</div>
                </div>
                <div class="stx-ui-form-grid">
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.routeConsumerId}">调用方</label>
                    <input id="${ids.routeConsumerId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="stx_memory_os" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.routeTaskId}">任务</label>
                    <input id="${ids.routeTaskId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="memory.summarize" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.routeProviderId}">主服务商</label>
                    <select id="${ids.routeProviderId}" class="stx-ui-select stx-ui-input-full"></select>
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.routeProfileId}">参数档</label>
                    <select id="${ids.routeProfileId}" class="stx-ui-select stx-ui-input-full">
                      <option value="">(不指定)</option>
                      <option value="balanced">平衡</option>
                      <option value="precise">精准</option>
                      <option value="creative">创意</option>
                      <option value="economy">经济</option>
                    </select>
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.routeFallbackProviderId}">备用服务商</label>
                    <select id="${ids.routeFallbackProviderId}" class="stx-ui-select stx-ui-input-full"></select>
                  </div>
                </div>
                <div class="stx-ui-actions">
                  <button id="${ids.routeSaveBtnId}" type="button" class="stx-ui-btn">保存规则</button>
                  <button id="${ids.routeResetBtnId}" type="button" class="stx-ui-btn secondary">清空表单</button>
                </div>
              </div>

              <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route list">
                <div class="stx-ui-item-main">
                  <div class="stx-ui-item-title">当前路由规则</div>
                </div>
                <div id="${ids.routeListId}" class="stx-ui-list"></div>
              </div>

              <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="budget rpm tokens latency cost">
                <div class="stx-ui-item-main">
                  <div class="stx-ui-item-title">预算规则</div>
                  <div class="stx-ui-item-desc">按调用方设置请求频率、用量和成本上限。</div>
                </div>
                <div class="stx-ui-form-grid">
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.budgetConsumerId}">调用方</label>
                    <input id="${ids.budgetConsumerId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="stx_memory_os" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.budgetMaxRpmId}">每分钟请求上限</label>
                    <input id="${ids.budgetMaxRpmId}" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.budgetMaxTokensId}">单次 Token 上限</label>
                    <input id="${ids.budgetMaxTokensId}" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.budgetMaxLatencyId}">最大延迟(毫秒)</label>
                    <input id="${ids.budgetMaxLatencyId}" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
                  </div>
                  <div class="stx-ui-field">
                    <label class="stx-ui-field-label" for="${ids.budgetMaxCostId}">单次成本上限</label>
                    <input id="${ids.budgetMaxCostId}" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="0.01" />
                  </div>
                </div>
                <div class="stx-ui-actions">
                  <button id="${ids.budgetSaveBtnId}" type="button" class="stx-ui-btn">保存预算</button>
                  <button id="${ids.budgetResetBtnId}" type="button" class="stx-ui-btn secondary">清空表单</button>
                </div>
              </div>

              <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="budget list">
                <div class="stx-ui-item-main">
                  <div class="stx-ui-item-title">当前预算规则</div>
                </div>
                <div id="${ids.budgetListId}" class="stx-ui-list"></div>
              </div>
            </div>
          </div>
        </div>

        <div id="${ids.panelConsumerMapId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="consumer mapping discover plugin default ai">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">插件默认 AI 映射</div>
              <div class="stx-ui-item-desc">只显示在线插件。这里给插件设置默认 AI。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.consumerMapRefreshBtnId}" type="button" class="stx-ui-btn secondary">重新检测在线插件</button>
            </div>
            <div data-consumer-map-list="1" class="stx-ui-list"></div>
          </div>
        </div>

        <div id="${ids.panelVaultId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="vault credential api key">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">服务凭据</div>
              <div class="stx-ui-item-desc">密钥仅保存到本地加密区。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.vaultAddServiceId}">服务商</label>
                <select id="${ids.vaultAddServiceId}" class="stx-ui-select stx-ui-input-full">
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="gemini">gemini</option>
                  <option value="groq">groq</option>
                </select>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.vaultApiKeyId}">接口密钥</label>
                <input id="${ids.vaultApiKeyId}" class="stx-ui-input vault-key-input stx-ui-input-full" type="password" placeholder="sk-..." />
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultSaveBtnId}" type="button" class="stx-ui-btn">加密保存</button>
              <button id="${ids.vaultClearBtnId}" type="button" class="stx-ui-btn secondary stx-ui-btn-danger">清空全部密钥</button>
            </div>
          </div>
        </div>

        <div id="${ids.panelAboutId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="about version author email github changelog">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">${ids.displayName}</div>
              <div class="stx-ui-item-desc stx-ui-about-meta">
                <span class="stx-ui-about-meta-item"><i class="fa-solid fa-tag"></i><span>版本：${ids.badgeText}</span></span>
                <span class="stx-ui-about-meta-item"><i class="fa-solid fa-user"></i><span>作者：${ids.authorText}</span></span>
                <span class="stx-ui-about-meta-item"><i class="fa-solid fa-envelope"></i><span>邮箱：<a href="mailto:${ids.emailText}">${ids.emailText}</a></span></span>
                <span class="stx-ui-about-meta-item"><i class="fa-brands fa-github"></i><span>GitHub：<a href="${ids.githubUrl}" target="_blank" rel="noopener">${ids.githubText}</a></span></span>
              </div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="changelog updates history">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">更新日志</div>
            </div>
            <div class="stx-ui-changelog">
              ${ids.changelogHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
