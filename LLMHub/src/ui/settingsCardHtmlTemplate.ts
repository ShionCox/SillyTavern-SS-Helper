import { buildSharedSelectField } from '../../../_Components/sharedSelect';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import { renderSharedCheckbox } from '../../../_Components/sharedCheckbox';

/**
 * 功能：构建 LLMHub 设置面板 HTML。
 * @param ids DOM 节点 ID 映射。
 * @returns 设置面板 HTML 字符串。
 */
export function buildSettingsCardHtmlTemplate(ids: LLMHubSettingsIds): string {
    const globalProfileSelect = buildSharedSelectField({
        id: ids.globalProfileId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '默认参数档。' },
        options: [
            { value: 'balanced', label: '平衡（balanced）' },
            { value: 'precise', label: '精确（precise）' },
            { value: 'creative', label: '创意（creative）' },
            { value: 'economy', label: '省钱（economy）' },
        ],
    });

    const defaultProviderSelect = buildSharedSelectField({
        id: ids.defaultProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '未命中规则时使用的服务商。' },
        options: [
            { value: 'openai', label: 'openai' },
            { value: 'claude', label: 'claude' },
            { value: 'gemini', label: 'gemini' },
            { value: 'groq', label: 'groq' },
        ],
    });

    const routeProviderSelect = buildSharedSelectField({
        id: ids.routeProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择主服务商。' },
        options: [
            { value: 'openai', label: 'openai' },
            { value: 'claude', label: 'claude' },
            { value: 'gemini', label: 'gemini' },
            { value: 'groq', label: 'groq' },
        ],
    });

    const routeProfileSelect = buildSharedSelectField({
        id: ids.routeProfileId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择参数档。' },
        options: [
            { value: '', label: '（不指定）' },
            { value: 'balanced', label: '平衡（balanced）' },
            { value: 'precise', label: '精确（precise）' },
            { value: 'creative', label: '创意（creative）' },
            { value: 'economy', label: '省钱（economy）' },
        ],
    });

    const routeFallbackSelect = buildSharedSelectField({
        id: ids.routeFallbackProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择备用服务商。' },
        options: [
            { value: '', label: '（不指定）' },
            { value: 'openai', label: 'openai' },
            { value: 'claude', label: 'claude' },
            { value: 'gemini', label: 'gemini' },
            { value: 'groq', label: 'groq' },
        ],
    });

    const vaultServiceSelect = buildSharedSelectField({
        id: ids.vaultAddServiceId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择要保存密钥的服务。' },
        options: [
            { value: 'openai', label: 'openai' },
            { value: 'claude', label: 'claude' },
            { value: 'gemini', label: 'gemini' },
            { value: 'groq', label: 'groq' },
        ],
    });

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
          <label class="stx-ui-item stx-ui-search-item" data-stx-ui-search="enable llm hub switch">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">启用 LLMHub</div>
              <div class="stx-ui-item-desc">总开关。关闭后不再分发 AI 请求。</div>
            </div>
            <div class="stx-ui-inline">
              <input id="${ids.enabledId}" data-tip="LLMHub 总开关。" type="checkbox" />
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile default profile">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认参数档</div>
              <div class="stx-ui-item-desc">任务没指定 profile 时使用它。</div>
            </div>
            <div class="stx-ui-row">
              ${globalProfileSelect}
            </div>
          </div>
        </div>

        <div id="${ids.panelRouterId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="default provider model route">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认服务商</div>
              <div class="stx-ui-item-desc">没命中规则时用它。</div>
            </div>
            <div class="stx-ui-row">
              ${defaultProviderSelect}
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
                ${routeProviderSelect}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeProfileId}">参数档</label>
                ${routeProfileSelect}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.routeFallbackProviderId}">备用服务商</label>
                ${routeFallbackSelect}
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
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="vault credential api key">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">服务凭据</div>
              <div class="stx-ui-item-desc">密钥仅保存到本地加密区。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.vaultAddServiceId}">服务标识</label>
                ${vaultServiceSelect}
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
