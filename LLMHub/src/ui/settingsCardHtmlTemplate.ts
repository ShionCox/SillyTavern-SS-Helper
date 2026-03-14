import { buildSharedSelectField } from '../../../_Components/sharedSelect';
import { buildSharedInputField } from '../../../_Components/sharedInput';
import { buildSharedButton } from '../../../_Components/sharedButton';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';

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

    // ── Provider 来源选择 ──
    const providerSourceSelect = buildSharedSelectField({
        id: ids.providerSourceId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择 LLM 来源：直连酒馆 或 自定义服务。' },
        options: [
            { value: 'tavern', label: '直连酒馆（Tavern）' },
            { value: 'custom', label: '自定义服务（OpenAI 兼容）' },
        ],
    });

    const customBaseUrlInput = buildSharedInputField({
        id: ids.customBaseUrlId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'https://api.openai.com/v1', 'data-tip': '服务接入点地址。' },
    });

    const customModelInput = buildSharedInputField({
        id: ids.customModelInputId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'gpt-4o-mini', 'data-tip': '手动填写模型名。' },
    });

    const testConnectionBtn = buildSharedButton({
        id: ids.testConnectionBtnId,
        label: '测试连接',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-plug',
        attributes: { 'data-tip': '发送最小请求验证连接。' },
    });

    const fetchModelsBtn = buildSharedButton({
        id: ids.fetchModelsBtnId,
        label: '获取模型列表',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-list',
        attributes: { 'data-tip': '从服务端拉取可用模型。' },
    });

    const modelListSelect = buildSharedSelectField({
        id: ids.modelListSelectId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '从列表选择模型。' },
        options: [{ value: '', label: '（请先获取模型列表）' }],
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
              <div class="stx-ui-item-desc">关闭后所有 AI 请求将停止处理。</div>
            </div>
            <div class="stx-ui-inline">
              ${buildSharedCheckboxCard({
                  id: ids.enabledId,
                  title: '',
                  containerClassName: 'stx-ui-inline-checkbox is-control-only',
                  inputAttributes: {
                      'data-tip': 'LLMHub 总开关。',
                      'aria-label': '启用 LLMHub',
                  },
              })}
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile default profile">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认参数档</div>
              <div class="stx-ui-item-desc">平衡（通用场景）；精确（低温度，适合数据提取）；创意（高温度，适合叙事生成）；省钱（低 token，快速返回）。</div>
            </div>
            <div class="stx-ui-row">
              ${globalProfileSelect}
            </div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-plug"></i>
            <span>LLM 来源</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="provider source tavern custom">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">LLM 来源</div>
              <div class="stx-ui-item-desc">选择使用酒馆自带的模型，还是接入你自己的 AI 服务。</div>
            </div>
            <div class="stx-ui-row">
              ${providerSourceSelect}
            </div>
          </div>

          <div id="${ids.testResultId}" class="stx-ui-result-area" style="display:none;"></div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-provider-tavern-section" data-stx-ui-search="tavern detect test connection model">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">酒馆直连</div>
              <div class="stx-ui-item-desc">测试酒馆当前连接的模型是否正常工作。</div>
            </div>
            <div class="stx-ui-actions">
              ${testConnectionBtn}
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack stx-ui-provider-custom-section" data-stx-ui-search="custom base url endpoint model api key" style="display:none;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">自定义服务配置</div>
              <div class="stx-ui-item-desc">填写你的 AI 服务地址和模型，密钥请在下方「凭据金库」中配置。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.customBaseUrlId}">Base URL</label>
                ${customBaseUrlInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.customModelInputId}">模型名（手动）</label>
                ${customModelInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label">从列表选择</label>
                ${modelListSelect}
                <span id="${ids.modelListStatusId}" class="stx-ui-field-hint"></span>
              </div>
            </div>
            <div class="stx-ui-actions">
              ${testConnectionBtn.replace(ids.testConnectionBtnId, ids.testConnectionBtnId + '_custom')}
              ${fetchModelsBtn}
            </div>
          </div>
        </div>

        <div id="${ids.panelRouterId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default provider model route">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认服务商</div>
              <div class="stx-ui-item-desc">未匹配到路由规则的请求将交给此服务商处理。</div>
            </div>
            <div class="stx-ui-row">
              ${defaultProviderSelect}
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="default model deploy fallback">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">默认模型</div>
              <div class="stx-ui-item-desc">默认服务商实际调用的模型名称。</div>
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
              <div class="stx-ui-item-desc">为指定插件的特定任务设置专属的服务商和参数档。</div>
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
              <div class="stx-ui-item-desc">为每个在线插件指定默认使用的 AI 服务商。</div>
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
              <div class="stx-ui-item-desc">为指定插件设置请求频率和费用上限，防止过度消耗。</div>
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
              <div class="stx-ui-item-desc">密钥加密存储在本地浏览器中，不会上传到任何服务器。</div>
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
              <div class="stx-ui-item-desc">永久清除本地存储的所有 API 密钥，此操作不可撤销。</div>
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
