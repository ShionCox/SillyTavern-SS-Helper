import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';

/**
 * 功能：构建 LLMHub 设置面板 HTML。
 * 参数：
 *   ids：所有 DOM 元素 ID 映射。
 * 返回：
 *   string：可直接挂载的 HTML 字符串。
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
          <input id="${ids.searchId}" data-tip="按关键词筛选设置项。" class="text_pole flex1 stx-ui-search" placeholder="搜索设置项" type="search" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" data-tip="查看基础设置。" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>基础设置</span>
          </button>
          <button id="${ids.tabRouterId}" data-tip="查看路由和预算。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-route"></i>
            <span>路由与预算</span>
          </button>
          <button id="${ids.tabVaultId}" data-tip="查看密钥管理。" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-key"></i>
            <span>凭据金库</span>
          </button>
          <button id="${ids.tabAboutId}" data-tip="查看插件信息。" type="button" class="stx-ui-tab">
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
              <div class="stx-ui-item-title">启用 LLMHub</div>
              <div class="stx-ui-item-desc">总开关。关闭后不再接管任务。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.enabledId}" data-tip="LLMHub 总开关。" type="checkbox" />
            </div>
          </label>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-sliders"></i>
            <span>默认参数策略</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile temperature param">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认参数档</div>
              <div class="stx-ui-item-desc">任务没指定 profile 时用它。</div>
            </div>
            <div class="stx-ui-row">
              <select id="${ids.globalProfileId}" data-tip="默认参数档。" class="stx-ui-select">
                <option value="balanced">平衡（balanced）</option>
                <option value="precise">精确（precise）</option>
                <option value="creative">创意（creative）</option>
                <option value="economy">省钱（economy）</option>
              </select>
            </div>
          </div>
        </div>

        <div id="${ids.panelRouterId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-network-wired"></i>
            <span>全局兜底路由</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default provider router fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认服务商</div>
              <div class="stx-ui-item-desc">没命中规则时用它。</div>
            </div>
            <div class="stx-ui-row">
              <select id="${ids.defaultProviderId}" data-tip="未命中规则时使用的服务商。" class="stx-ui-select">
                <option value="openai">openai</option>
                <option value="claude">claude</option>
                <option value="gemini">gemini</option>
                <option value="groq">groq</option>
              </select>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default model deploy fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认模型</div>
              <div class="stx-ui-item-desc">默认服务商使用的模型名。</div>
            </div>
            <div class="stx-ui-row">
              <input id="${ids.defaultModelId}" data-tip="默认模型名。" class="stx-ui-input" type="text" placeholder="例如 gpt-4o-mini" />
            </div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-route"></i>
            <span>任务路由规则</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route policy task provider profile fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">新增或更新路由规则</div>
              <div class="stx-ui-item-desc">按 consumer + task 覆盖保存。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeConsumerId}">调用方</label>
                <input id="${ids.routeConsumerId}" data-tip="填写调用方标识。" class="stx-ui-input stx-ui-input-full" type="text" placeholder="memory_os" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeTaskId}">任务名</label>
                <input id="${ids.routeTaskId}" data-tip="填写任务名。" class="stx-ui-input stx-ui-input-full" type="text" placeholder="memory.summarize" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeProviderId}">服务商</label>
                <select id="${ids.routeProviderId}" data-tip="选择主服务商。" class="stx-ui-select stx-ui-input-full">
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="gemini">gemini</option>
                  <option value="groq">groq</option>
                </select>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeProfileId}">参数档</label>
                <select id="${ids.routeProfileId}" data-tip="选择参数档。" class="stx-ui-select stx-ui-input-full">
                  <option value="">（不指定）</option>
                  <option value="balanced">平衡（balanced）</option>
                  <option value="precise">精确（precise）</option>
                  <option value="creative">创意（creative）</option>
                  <option value="economy">省钱（economy）</option>
                </select>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeFallbackProviderId}">备用服务商</label>
                <select id="${ids.routeFallbackProviderId}" data-tip="选择备用服务商。" class="stx-ui-select stx-ui-input-full">
                  <option value="">（不指定）</option>
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="gemini">gemini</option>
                  <option value="groq">groq</option>
                </select>
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.routeSaveBtnId}" data-tip="保存路由规则。" type="button" class="stx-ui-btn">保存规则</button>
              <button id="${ids.routeResetBtnId}" data-tip="清空路由表单。" type="button" class="stx-ui-btn secondary">清空表单</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="route policy list delete">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前路由规则</div>
            </div>
            <div id="${ids.routeListId}" data-tip="当前路由规则列表。" class="stx-ui-list"></div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-gauge-high"></i>
            <span>预算规则</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="budget rpm tokens latency cost">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">新增或更新预算</div>
              <div class="stx-ui-item-desc">按 consumer 设置限流和成本上限。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetConsumerId}">调用方</label>
                <input id="${ids.budgetConsumerId}" data-tip="填写预算对应的调用方。" class="stx-ui-input stx-ui-input-full" type="text" placeholder="memory_os" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxRpmId}">每分钟请求上限（maxRPM）</label>
                <input id="${ids.budgetMaxRpmId}" data-tip="每分钟请求上限。" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxTokensId}">令牌上限（maxTokens）</label>
                <input id="${ids.budgetMaxTokensId}" data-tip="令牌上限。" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxLatencyId}">延迟上限（maxLatencyMs）</label>
                <input id="${ids.budgetMaxLatencyId}" data-tip="最大延迟上限。" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxCostId}">成本上限（maxCost）</label>
                <input id="${ids.budgetMaxCostId}" data-tip="成本上限。" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="0.01" />
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.budgetSaveBtnId}" data-tip="保存预算。" type="button" class="stx-ui-btn">保存预算</button>
              <button id="${ids.budgetResetBtnId}" data-tip="清空预算表单。" type="button" class="stx-ui-btn secondary">清空表单</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="budget list delete">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前预算规则</div>
            </div>
            <div id="${ids.budgetListId}" data-tip="当前预算列表。" class="stx-ui-list"></div>
          </div>
        </div>

        <div id="${ids.panelVaultId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-vault"></i>
            <span>凭据金库</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="vault credential add api key">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">更新服务密钥</div>
              <div class="stx-ui-item-desc">密钥只存本地加密，不会写日志。</div>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="vault credential update">
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.vaultAddServiceId}">服务标识</label>
                <select id="${ids.vaultAddServiceId}" data-tip="选择要保存密钥的服务。" class="stx-ui-select stx-ui-input-full">
                  <option value="openai">openai</option>
                  <option value="claude">claude</option>
                  <option value="gemini">gemini</option>
                  <option value="groq">groq</option>
                </select>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.vaultApiKeyId}">密钥（API Key）</label>
                <input id="${ids.vaultApiKeyId}" data-tip="输入服务密钥。" class="stx-ui-input vault-key-input stx-ui-input-full" type="password" placeholder="sk-..." />
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultSaveBtnId}" data-tip="加密保存密钥。" type="button" class="stx-ui-btn">加密存入</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="vault erase all keys">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">清空金库</div>
              <div class="stx-ui-item-desc">删除本地保存的全部密钥。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultClearBtnId}" data-tip="清空所有本地密钥。" type="button" class="stx-ui-btn secondary stx-ui-btn-danger">清除全部密钥</button>
            </div>
          </div>
        </div>

        <div id="${ids.panelAboutId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-divider">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于插件</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="about version author email github">
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
