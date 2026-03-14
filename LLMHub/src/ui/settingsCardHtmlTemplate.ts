import { buildSharedSelectField } from '../../../_Components/sharedSelect';
import { buildSharedInputField } from '../../../_Components/sharedInput';
import { buildSharedButton } from '../../../_Components/sharedButton';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';

/**
 * 构建 LLMHub 设置面板 HTML。
 * @param ids DOM 节点 ID 映射表
 * @returns 设置面板 HTML 字符串
 */
export function buildSettingsCardHtmlTemplate(ids: LLMHubSettingsIds): string {
    const globalProfileSelect = buildSharedSelectField({
        id: ids.globalProfileId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '默认参数档案' },
        options: [
            { value: 'balanced', label: '平衡（balanced）' },
            { value: 'precise', label: '精确（precise）' },
            { value: 'creative', label: '创意（creative）' },
            { value: 'economy', label: '省钱（economy）' },
        ],
    });

    const providerSourceSelect = buildSharedSelectField({
        id: ids.providerSourceId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择 LLM 来源：直连酒馆或自定义服务' },
        options: [
            { value: 'tavern', label: '直连酒馆（Tavern）' },
            { value: 'custom', label: '自定义服务（OpenAI 兼容）' },
        ],
    });

    const customBaseUrlInput = buildSharedInputField({
        id: ids.customBaseUrlId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'https://api.openai.com/v1', 'data-tip': '服务接入点地址' },
    });

    const customModelInput = buildSharedInputField({
        id: ids.customModelInputId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'gpt-4o-mini', 'data-tip': '手动填写模型名称' },
    });

    const testConnectionBtn = buildSharedButton({
        id: ids.testConnectionBtnId,
        label: '测试连接',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-plug',
        attributes: { 'data-tip': '发送最小请求验证连接' },
    });

    const fetchModelsBtn = buildSharedButton({
        id: ids.fetchModelsBtnId,
        label: '获取模型列表',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-list',
        attributes: { 'data-tip': '从服务端拉取可用模型' },
    });

    const modelListSelect = buildSharedSelectField({
        id: ids.modelListSelectId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '从列表选择模型' },
        options: [{ value: '', label: '（请先获取模型列表）' }],
    });

    const vaultServiceSelect = buildSharedSelectField({
        id: ids.vaultAddServiceId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择要保存密钥的服务商' },
        options: [
            { value: 'openai', label: 'openai' },
            { value: 'claude', label: 'claude' },
            { value: 'gemini', label: 'gemini' },
            { value: 'groq', label: 'groq' },
        ],
    });

    // ─── View A: Global Capability Defaults ───
    const genProviderSelect = buildSharedSelectField({
        id: ids.globalDefGenProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '生成类默认服务商' },
        options: [{ value: '', label: '（自动选择）' }],
    });

    const genProfileSelect = buildSharedSelectField({
        id: ids.globalDefGenProfileId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '生成类默认参数档案' },
        options: [
            { value: '', label: '（不指定）' },
            { value: 'balanced', label: '平衡' },
            { value: 'precise', label: '精确' },
            { value: 'creative', label: '创意' },
            { value: 'economy', label: '省钱' },
        ],
    });

    const embProviderSelect = buildSharedSelectField({
        id: ids.globalDefEmbProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '向量化默认服务商' },
        options: [{ value: '', label: '（自动选择）' }],
    });

    const rerankProviderSelect = buildSharedSelectField({
        id: ids.globalDefRerankProviderId,
        containerClassName: 'stx-ui-shared-select',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '重排序默认服务商' },
        options: [{ value: '', label: '（自动选择）' }],
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
          <input id="${ids.searchId}" data-tip="按关键词筛选设置项" class="text_pole flex1 stx-ui-search" placeholder="搜索设置项" type="search" />
        </div>

        <div class="stx-ui-tabs">
          <button id="${ids.tabMainId}" data-tip="查看基础设置" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>基础</span>
          </button>
          <button id="${ids.tabRouteId}" data-tip="查看路由配置" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-route"></i>
            <span>路由</span>
          </button>
          <button id="${ids.tabQueueId}" data-tip="查看队列与展示" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-layer-group"></i>
            <span>编排</span>
          </button>
          <button id="${ids.tabVaultId}" data-tip="查看密钥管理" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-key"></i>
            <span>凭据</span>
          </button>
          <button id="${ids.tabAboutId}" data-tip="查看插件信息" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于</span>
          </button>
        </div>

        <!-- ═══ Panel: 基础设置 ═══ -->
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
                      'data-tip': 'LLMHub 总开关',
                      'aria-label': '启用 LLMHub',
                  },
              })}
            </div>
          </label>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="global profile default profile">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局默认参数档案</div>
              <div class="stx-ui-item-desc">平衡（通用场景）；精确（适合数据提取）；创意（适合叙事生成）；省钱（快速返回）。</div>
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

          <div id="${ids.tavernInfoId}" class="stx-ui-item stx-ui-search-item stx-ui-item-stack stx-ui-provider-tavern-section" data-stx-ui-search="tavern api model source endpoint settings">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前酒馆连接信息</div>
              <div class="stx-ui-item-desc">这里只展示酒馆当前 Chat Completion 的只读配置，便于确认实际使用的来源、模型和接口地址。</div>
            </div>
            <div id="${ids.tavernInfoStatusId}" class="stx-ui-tavern-info-status"></div>
            <div id="${ids.tavernInfoListId}" class="stx-ui-tavern-info-list"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack stx-ui-provider-custom-section" data-stx-ui-search="custom base url endpoint model api key" style="display:none;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">自定义服务配置</div>
              <div class="stx-ui-item-desc">填写你的 AI 服务地址和模型，密钥请在下方「凭据」中配置。</div>
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

        <!-- ═══ Panel: 路由设置（三视图） ═══ -->
        <div id="${ids.panelRouteId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-sub-tabs">
            <button id="${ids.subTabGlobalDefaultsId}" type="button" class="stx-ui-sub-tab is-active">
              <i class="fa-solid fa-globe"></i> 全局能力默认
            </button>
            <button id="${ids.subTabPluginDefaultsId}" type="button" class="stx-ui-sub-tab">
              <i class="fa-solid fa-puzzle-piece"></i> 插件默认
            </button>
            <button id="${ids.subTabTaskOverridesId}" type="button" class="stx-ui-sub-tab">
              <i class="fa-solid fa-crosshairs"></i> 任务覆盖
            </button>
          </div>

          <!-- View A: 全局能力默认 -->
          <div id="${ids.subPanelGlobalDefaultsId}" class="stx-ui-sub-panel">
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="generation default provider model profile">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">生成类（generation）</div>
                <div class="stx-ui-item-desc">chat / json / tools / vision / reasoning 等生成类任务的默认服务商。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">服务商</label>
                  ${genProviderSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型</label>
                  <input id="${ids.globalDefGenModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="gpt-4o-mini" data-tip="生成类默认模型名称" />
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">参数档案</label>
                  ${genProfileSelect}
                </div>
              </div>
            </div>

            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="embedding default provider model">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">向量化（embedding）</div>
                <div class="stx-ui-item-desc">文本向量化任务的默认服务商。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">服务商</label>
                  ${embProviderSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型</label>
                  <input id="${ids.globalDefEmbModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="text-embedding-3-small" data-tip="向量化默认模型名称" />
                </div>
              </div>
            </div>

            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="rerank default provider model">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">重排序（rerank）</div>
                <div class="stx-ui-item-desc">搜索结果重排序任务的默认服务商。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">服务商</label>
                  ${rerankProviderSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型</label>
                  <input id="${ids.globalDefRerankModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="" data-tip="重排序默认模型名称" />
                </div>
              </div>
            </div>

            <div class="stx-ui-actions" style="justify-content:flex-end;">
              <button id="${ids.globalDefSaveBtnId}" type="button" class="stx-ui-btn" data-tip="保存全局能力默认配置">保存全局设置</button>
            </div>
          </div>

          <!-- View B: 插件默认 -->
          <div id="${ids.subPanelPluginDefaultsId}" class="stx-ui-sub-panel" hidden>
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="plugin default mapping ai provider">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">插件默认映射</div>
                <div class="stx-ui-item-desc">为每个已注册插件指定默认 AI 服务商。候选服务商已按能力约束过滤。</div>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.pluginDefaultsRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新插件列表">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
              </div>
            </div>
            <div id="${ids.pluginDefaultsListId}" class="stx-ui-list"></div>
          </div>

          <!-- View C: 任务覆盖 -->
          <div id="${ids.subPanelTaskOverridesId}" class="stx-ui-sub-panel" hidden>
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="task override stale binding">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">任务级覆盖</div>
                <div class="stx-ui-item-desc">为特定插件的特定任务设置专属服务商。失效绑定会以警告标记。候选列表已按 requiredCapabilities 过滤。</div>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.taskOverridesRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新任务列表">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
              </div>
            </div>
            <div id="${ids.taskOverridesListId}" class="stx-ui-list"></div>
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
                <input id="${ids.budgetConsumerId}" data-tip="填写预算对应的调用方标识" class="stx-ui-input stx-ui-input-full" type="text" placeholder="stx_memory_os" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxRpmId}">每分钟请求上限</label>
                <input id="${ids.budgetMaxRpmId}" data-tip="每分钟请求上限" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxTokensId}">令牌上限</label>
                <input id="${ids.budgetMaxTokensId}" data-tip="令牌上限" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxLatencyId}">延迟上限（ms）</label>
                <input id="${ids.budgetMaxLatencyId}" data-tip="最大延迟上限" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="1" />
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.budgetMaxCostId}">成本上限</label>
                <input id="${ids.budgetMaxCostId}" data-tip="成本上限" class="stx-ui-input stx-ui-input-full" type="number" min="0" step="0.01" />
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.budgetSaveBtnId}" data-tip="保存预算规则" type="button" class="stx-ui-btn">保存预算</button>
              <button id="${ids.budgetResetBtnId}" data-tip="清空预算表单" type="button" class="stx-ui-btn secondary">清空表单</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="budget list delete">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前预算规则</div>
            </div>
            <div id="${ids.budgetListId}" data-tip="当前预算列表" class="stx-ui-list"></div>
          </div>
        </div>

        <!-- ═══ Panel: 编排与展示 ═══ -->
        <div id="${ids.panelQueueId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="queue pending active running">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前请求队列</div>
              <div class="stx-ui-item-desc">显示编排器中排队和正在执行的请求。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.queueRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新队列状态">
                <i class="fa-solid fa-rotate"></i> 刷新
              </button>
            </div>
            <div id="${ids.queueSnapshotListId}" class="stx-ui-list"></div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>最近请求记录</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="history recent cancel replace">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">最近处理记录</div>
              <div class="stx-ui-item-desc">包含已完成、已取消、被替代的请求。</div>
            </div>
            <div id="${ids.recentHistoryListId}" class="stx-ui-list"></div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-eye-slash"></i>
            <span>静默权限</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="silent permission background eligible">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">静默模式权限</div>
              <div class="stx-ui-item-desc">被授权静默执行的任务不会弹出展示覆层。平台内部插件默认拥有静默权限。</div>
            </div>
            <div id="${ids.silentPermissionsListId}" class="stx-ui-list"></div>
          </div>
        </div>

        <!-- ═══ Panel: 凭据金库 ═══ -->
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
                <input id="${ids.vaultApiKeyId}" data-tip="输入服务密钥" class="stx-ui-input vault-key-input stx-ui-input-full" type="password" placeholder="sk-..." />
              </div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultSaveBtnId}" data-tip="加密保存密钥" type="button" class="stx-ui-btn">加密存入</button>
            </div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="vault erase all keys">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">危险操作</div>
              <div class="stx-ui-item-desc">清空全部凭据。此操作不可恢复。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.vaultClearBtnId}" data-tip="清空全部密钥" type="button" class="stx-ui-btn stx-ui-btn-danger">清空全部</button>
            </div>
          </div>
        </div>

        <!-- ═══ Panel: 关于 ═══ -->
        <div id="${ids.panelAboutId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-item-stack" data-stx-ui-search="about author github version">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">插件信息</div>
            </div>
            <div class="stx-ui-about-meta">
              <span class="stx-ui-about-meta-item"><i class="fa-solid fa-user"></i> ${ids.authorText}</span>
              ${ids.emailText ? `<span class="stx-ui-about-meta-item"><i class="fa-solid fa-envelope"></i> ${ids.emailText}</span>` : ''}
              ${ids.githubUrl && ids.githubUrl !== '#' ? `<span class="stx-ui-about-meta-item"><i class="fa-brands fa-github"></i> <a href="${ids.githubUrl}" target="_blank" rel="noopener noreferrer">${ids.githubText}</a></span>` : ''}
            </div>
          </div>

          <div class="stx-ui-item stx-ui-item-stack" data-stx-ui-search="changelog update history">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">更新日志</div>
            </div>
            <div class="stx-ui-changelog">${ids.changelogHtml}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}
