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
    // ─── 基础 Panel ─────────────────────
    const globalProfileSelect = buildSharedSelectField({
        id: ids.globalProfileId,
        containerClassName: 'stx-shared-select-fluid',
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

        const globalMaxTokensModeSelect = buildSharedSelectField({
          id: ids.globalMaxTokensModeId,
          containerClassName: 'stx-shared-select-fluid',
          selectClassName: 'stx-ui-select',
          triggerClassName: 'stx-ui-input-full',
          triggerAttributes: { 'data-tip': '控制 generation 请求的 max_tokens 取值策略' },
          options: [
            { value: 'inherit', label: '继承默认链路' },
            { value: 'manual', label: '全局手动覆盖' },
            { value: 'adaptive', label: '自适应估算' },
          ],
        });

        const globalMaxTokensManualInput = buildSharedInputField({
          id: ids.globalMaxTokensManualId,
          type: 'number',
          className: 'stx-ui-input stx-ui-input-full',
          attributes: { min: '1', step: '1', placeholder: '例如 1600', 'data-tip': '当选择“全局手动覆盖”时，所有 generation 请求都以此值为准' },
        });

    // ─── 资源 Panel ─────────────────────
    const resourceNewBtn = buildSharedButton({
        id: ids.resourceNewBtnId,
        label: '新建资源',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-plus',
        attributes: { 'data-tip': '创建一条新的 API 资源配置' },
    });

    const resourceIdInput = buildSharedInputField({
        id: ids.resourceIdInputId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'openai-main', 'data-tip': '资源唯一标识，建议只使用字母、数字、下划线和短横线' },
    });

    const resourceLabelInput = buildSharedInputField({
        id: ids.resourceLabelInputId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: '主力生成服务', 'data-tip': '用于分配下拉和测试中心展示的名称' },
    });

    const resourceTypeSelect = buildSharedSelectField({
        id: ids.resourceTypeSelectId,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '资源类型决定该资源可参与的分配范围' },
        options: [
            { value: 'generation', label: '生成（generation）' },
            { value: 'embedding', label: '向量（embedding）' },
            { value: 'rerank', label: '重排（rerank）' },
        ],
    });

    const resourceSourceSelect = buildSharedSelectField({
        id: ids.resourceSourceSelectId,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '选择资源来源' },
        options: [
        { value: 'custom', label: '自定义服务' },
            { value: 'tavern', label: '酒馆代理（Tavern）' },
        ],
    });

        const resourceApiTypeSelect = buildSharedSelectField({
          id: ids.resourceApiTypeSelectId,
          containerClassName: 'stx-shared-select-fluid',
          selectClassName: 'stx-ui-select',
          triggerClassName: 'stx-ui-input-full',
          triggerAttributes: { 'data-tip': '选择自定义 API 的协议类型；默认使用 OpenAI 兼容模式' },
          options: [
            { value: 'openai', label: 'OpenAI（默认）' },
            { value: 'deepseek', label: 'DeepSeek' },
            { value: 'gemini', label: 'Gemini（原生）' },
            { value: 'claude', label: 'Claude（原生）' },
            { value: 'generic', label: 'Generic（通用 system 模式）' },
          ],
        });

    const resourceBaseUrlInput = buildSharedInputField({
        id: ids.resourceBaseUrlId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'https://api.openai.com/v1', 'data-tip': '服务接入点地址' },
    });

    const resourceApiKeyInput = buildSharedInputField({
        id: ids.resourceApiKeyId,
        type: 'password',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'sk-...', 'data-tip': '随保存资源一起加密保存到本地浏览器中' },
    });

    const resourceDefaultModelInput = buildSharedInputField({
        id: ids.resourceDefaultModelId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: 'gpt-4o-mini', 'data-tip': '该资源的默认模型名称' },
    });

    const resourceRerankPathInput = buildSharedInputField({
        id: ids.resourceRerankPathId,
        type: 'text',
        className: 'stx-ui-input stx-ui-input-full',
        attributes: { placeholder: '/rerank', 'data-tip': 'Rerank 接口路径（仅重排资源类型使用）' },
    });

    const resourceEnabledCheckbox = buildSharedCheckboxCard({
        id: ids.resourceEnabledId,
        title: '启用资源',
        checkedLabel: '已启用',
        uncheckedLabel: '已停用',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: {
            'data-tip': '停用后资源仍保留，但不会参与分配和路由',
            'aria-label': '启用资源',
        },
    });

    const capChat = buildSharedCheckboxCard({
      id: ids.resourceCapChatId,
      title: '', checkedLabel: 'chat', uncheckedLabel: 'chat',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'chat', 'data-tip': '支持聊天生成' },
    });
    const capJson = buildSharedCheckboxCard({
      id: ids.resourceCapJsonId,
      title: '', checkedLabel: 'json', uncheckedLabel: 'json',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'json', 'data-tip': '支持结构化 JSON 输出' },
    });
    const capTools = buildSharedCheckboxCard({
      id: ids.resourceCapToolsId,
      title: '', checkedLabel: 'tools', uncheckedLabel: 'tools',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'tools', 'data-tip': '支持工具调用' },
    });
    const capEmb = buildSharedCheckboxCard({
      id: ids.resourceCapEmbId,
      title: '', checkedLabel: 'embeddings', uncheckedLabel: 'embeddings',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'embeddings', 'data-tip': '支持向量化' },
    });
    const capRerank = buildSharedCheckboxCard({
      id: ids.resourceCapRerankId,
      title: '', checkedLabel: 'rerank', uncheckedLabel: 'rerank',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'rerank', 'data-tip': '支持重排' },
    });
    const capVision = buildSharedCheckboxCard({
      id: ids.resourceCapVisionId,
      title: '', checkedLabel: 'vision', uncheckedLabel: 'vision',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'vision', 'data-tip': '支持视觉输入' },
    });
    const capReasoning = buildSharedCheckboxCard({
      id: ids.resourceCapReasoningId,
      title: '', checkedLabel: 'reasoning', uncheckedLabel: 'reasoning',
        containerClassName: 'stx-ui-inline-checkbox is-compact',
        inputAttributes: { 'aria-label': 'reasoning', 'data-tip': '支持推理模式' },
    });

    const testConnectionBtn = buildSharedButton({
        id: ids.testConnectionBtnId,
        label: '测试连接',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-plug',
        attributes: { 'data-tip': '发送最小请求验证连接' },
    });

    const testRerankBtn = buildSharedButton({
      id: ids.testRerankBtnId,
      label: '测试重排',
      variant: 'secondary',
      iconClassName: 'fa-solid fa-arrow-down-wide-short',
      attributes: { 'data-tip': '验证当前资源的 rerank 行为；生成资源开启 rerank 后也可使用' },
    });

    const customParamsAddBtn = buildSharedButton({
      id: ids.resourceCustomParamsAddBtnId,
      label: '添加参数',
      variant: 'secondary',
      iconClassName: 'fa-solid fa-plus',
      attributes: { 'data-tip': '新增一行自定义参数' },
    });

    const customParamsSyncBtn = buildSharedButton({
      id: ids.resourceCustomParamsSyncBtnId,
      label: '从 JSON 刷新参数项',
      variant: 'secondary',
      iconClassName: 'fa-solid fa-arrows-rotate',
      attributes: { 'data-tip': '将下方 JSON 文本解析为参数项列表' },
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
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '从列表选择模型' },
        options: [{ value: '', label: '（请先获取模型列表）' }],
    });

    const resourceSaveBtn = buildSharedButton({
        id: ids.resourceSaveBtnId,
        label: '保存资源',
        iconClassName: 'fa-solid fa-floppy-disk',
        attributes: { 'data-tip': '保存当前资源配置并刷新路由' },
    });

    const resourceDeleteBtn = buildSharedButton({
        id: ids.resourceDeleteBtnId,
        label: '删除资源',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-trash',
        attributes: { 'data-tip': '删除当前资源' },
    });

    // ─── 分配 Panel ─────────────────────
    const genResourceSelect = buildSharedSelectField({
        id: ids.globalAssignGenResourceId,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '生成类默认资源' },
        options: [{ value: '', label: '（自动选择）' }],
    });

    const embResourceSelect = buildSharedSelectField({
        id: ids.globalAssignEmbResourceId,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '向量化默认资源' },
        options: [{ value: '', label: '（自动选择）' }],
    });

    const rerankResourceSelect = buildSharedSelectField({
        id: ids.globalAssignRerankResourceId,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-select stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        triggerAttributes: { 'data-tip': '重排序默认资源' },
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
          <button id="${ids.tabBasicId}" data-tip="查看基础设置" type="button" class="stx-ui-tab is-active">
            <i class="fa-solid fa-gear"></i>
            <span>基础</span>
          </button>
          <button id="${ids.tabResourceId}" data-tip="管理 API 资源" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-plug"></i>
            <span>资源</span>
          </button>
          <button id="${ids.tabAssignId}" data-tip="配置分配规则" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-route"></i>
            <span>分配</span>
          </button>
          <button id="${ids.tabOrchId}" data-tip="查看编排与队列" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-layer-group"></i>
            <span>编排</span>
          </button>
          <button id="${ids.tabAboutId}" data-tip="查看插件信息" type="button" class="stx-ui-tab">
            <i class="fa-solid fa-circle-info"></i>
            <span>关于</span>
          </button>
        </div>

        <!-- ═══ Panel: 基础设置 ═══ -->
        <div id="${ids.panelBasicId}" class="stx-ui-panel">
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

          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="max tokens token limit adaptive manual">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">全局 max_tokens 控制</div>
              <div class="stx-ui-item-desc">优先级：全局手动覆盖 &gt; 任务手动覆盖 &gt; 自适应估算 &gt; 原有 budget / profile 默认链路。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.globalMaxTokensModeId}">控制模式</label>
                ${globalMaxTokensModeSelect}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.globalMaxTokensManualId}">手动值</label>
                ${globalMaxTokensManualInput}
              </div>
            </div>
            <span class="stx-ui-field-hint">自适应模式会根据输入内容、消息数和 schema 大小估算输出上限；手动模式会直接覆盖任务和上游传入值。</span>
          </div>

          <div id="${ids.tavernInfoId}" class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="tavern api model source endpoint settings">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">当前酒馆连接信息</div>
              <div class="stx-ui-item-desc">只读展示酒馆当前 Chat Completion 的配置，便于确认实际使用的来源和模型。</div>
            </div>
            <div id="${ids.tavernInfoStatusId}" class="stx-ui-tavern-info-status"></div>
            <div id="${ids.tavernInfoListId}" class="stx-ui-tavern-info-list"></div>
          </div>
        </div>

        <!-- ═══ Panel: 资源管理 ═══ -->
        <div id="${ids.panelResourceId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="resource pool api list">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">API 资源池</div>
              <div class="stx-ui-item-desc">在这里保存多个大模型、向量和重排资源，分配页只能从已保存资源中选择。</div>
            </div>
            <div class="stx-ui-actions">
              ${resourceNewBtn}
            </div>
            <div id="${ids.resourceListId}" class="stx-ui-list"></div>
          </div>

          <div id="${ids.resourceEditorId}" class="stx-ui-item stx-ui-search-item stx-ui-item-stack" data-stx-ui-search="resource editor type source base url model capability" style="display:none;">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">资源编辑器</div>
              <div class="stx-ui-item-desc">配置来源、地址、默认模型、能力声明，并可直接测试连接与获取模型列表。</div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceIdInputId}">资源 ID</label>
                ${resourceIdInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceLabelInputId}">显示名称</label>
                ${resourceLabelInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceTypeSelectId}">资源类型</label>
                ${resourceTypeSelect}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceSourceSelectId}">资源来源</label>
                ${resourceSourceSelect}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceApiTypeSelectId}">API 类型</label>
                ${resourceApiTypeSelect}
                <span class="stx-ui-field-hint">仅生成资源使用该选项：OpenAI 走兼容接口；Gemini / Claude 走原生接口；DeepSeek 走 JSON mode；Generic 使用 system 提示兜底。</span>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceBaseUrlId}">Base URL</label>
                ${resourceBaseUrlInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceApiKeyId}">API Key</label>
                ${resourceApiKeyInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceDefaultModelId}">默认模型</label>
                ${resourceDefaultModelInput}
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label" for="${ids.resourceRerankPathId}">Rerank 路径</label>
                ${resourceRerankPathInput}
              </div>
              <div class="stx-ui-field" style="grid-column: 1 / -1;">
                <label class="stx-ui-field-label" for="${ids.resourceCustomParamsId}">自定义参数（JSON）</label>
                <div class="stx-ui-param-toolbar">
                  ${customParamsAddBtn}
                  ${customParamsSyncBtn}
                </div>
                <div id="${ids.resourceCustomParamsListId}" class="stx-ui-param-list"></div>
                <textarea
                  id="${ids.resourceCustomParamsId}"
                  class="stx-ui-textarea stx-ui-input-full"
                  rows="6"
                  placeholder='{"top_p":0.9,"frequency_penalty":0.2,"dimensions":1024}'
                  data-tip="仅支持 JSON 对象；会作为附加字段传给当前资源的请求体"
                ></textarea>
                <span class="stx-ui-field-hint">适合填写供应商扩展参数；核心字段（如 model、messages、input、documents）仍由系统负责。</span>
              </div>
              <div class="stx-ui-field">
                <label class="stx-ui-field-label">资源状态</label>
                <div class="stx-ui-inline">
                  ${resourceEnabledCheckbox}
                </div>
              </div>
            </div>
            <div class="stx-ui-field">
              <label class="stx-ui-field-label">能力声明</label>
              <div class="stx-ui-resource-cap-grid" >
                ${capChat}
                ${capJson}
                ${capTools}
                ${capEmb}
                ${capRerank}
                ${capVision}
                ${capReasoning}
              </div>
            </div>
            <div class="stx-ui-form-grid">
              <div class="stx-ui-field">
                <label class="stx-ui-field-label">从列表选择模型</label>
                ${modelListSelect}
                <span id="${ids.modelListStatusId}" class="stx-ui-field-hint"></span>
              </div>
            </div>
            <div id="${ids.rerankTestPanelId}" class="stx-ui-field stx-ui-rerank-test-panel" style="display:none;">
              <label class="stx-ui-field-label">重排测试输入</label>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field" style="grid-column: 1 / -1;">
                  <label class="stx-ui-field-label" for="${ids.rerankTestQueryId}">Query</label>
                  <input id="${ids.rerankTestQueryId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="例如：memory health check" data-tip="输入本次重排测试的查询语句" />
                </div>
                <div class="stx-ui-field" style="grid-column: 1 / -1;">
                  <label class="stx-ui-field-label" for="${ids.rerankTestDocsId}">候选文档（每行一条）</label>
                  <textarea id="${ids.rerankTestDocsId}" class="stx-ui-textarea stx-ui-input-full" rows="5" placeholder="第一条候选文档&#10;第二条候选文档&#10;第三条候选文档" data-tip="每行一条文档，测试时会按行拆分"></textarea>
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label" for="${ids.rerankTestTopKId}">Top K</label>
                  <input id="${ids.rerankTestTopKId}" class="stx-ui-input stx-ui-input-full" type="number" min="1" step="1" placeholder="默认返回全部" data-tip="限制返回的重排结果数量" />
                </div>
              </div>
              <span class="stx-ui-field-hint">支持专用 rerank 资源与启用了 rerank 的生成资源；文档按换行拆分。</span>
            </div>
            <div class="stx-ui-actions">
              ${resourceSaveBtn}
              ${resourceDeleteBtn}
              ${testConnectionBtn}
              ${testRerankBtn}
              ${fetchModelsBtn}
            </div>
            <div id="${ids.testResultId}" class="stx-ui-result-area" style="display:none;"></div>
          </div>
        </div>
        <!-- ═══ Panel: 分配设置（三视图） ═══ -->
        <div id="${ids.panelAssignId}" class="stx-ui-panel" hidden>
          <div class="stx-ui-sub-tabs">
            <button id="${ids.subTabGlobalAssignId}" type="button" class="stx-ui-sub-tab is-active">
              <i class="fa-solid fa-globe"></i> 全局分配
            </button>
            <button id="${ids.subTabPluginAssignId}" type="button" class="stx-ui-sub-tab">
              <i class="fa-solid fa-puzzle-piece"></i> 插件分配
            </button>
            <button id="${ids.subTabTaskAssignId}" type="button" class="stx-ui-sub-tab">
              <i class="fa-solid fa-crosshairs"></i> 任务分配
            </button>
          </div>

          <!-- View A: 全局分配 -->
          <div id="${ids.subPanelGlobalAssignId}" class="stx-ui-sub-panel">
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="generation default resource model">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">生成类（generation）</div>
                <div class="stx-ui-item-desc">chat / json / tools / vision / reasoning 等生成类任务的默认资源。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">资源</label>
                  ${genResourceSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型覆盖</label>
                  <input id="${ids.globalAssignGenModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="（使用资源默认模型）" data-tip="覆盖资源的默认模型" />
                </div>
              </div>
            </div>

            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="embedding default resource model">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">向量化（embedding）</div>
                <div class="stx-ui-item-desc">文本向量化任务的默认资源。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">资源</label>
                  ${embResourceSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型覆盖</label>
                  <input id="${ids.globalAssignEmbModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="（使用资源默认模型）" data-tip="覆盖资源的默认模型" />
                </div>
              </div>
            </div>

            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="rerank default resource model">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">重排序（rerank）</div>
                <div class="stx-ui-item-desc">搜索结果重排序任务的默认资源。</div>
              </div>
              <div class="stx-ui-form-grid">
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">资源</label>
                  ${rerankResourceSelect}
                </div>
                <div class="stx-ui-field">
                  <label class="stx-ui-field-label">模型覆盖</label>
                  <input id="${ids.globalAssignRerankModelId}" class="stx-ui-input stx-ui-input-full" type="text" placeholder="（使用资源默认模型）" data-tip="覆盖资源的默认模型" />
                </div>
              </div>
            </div>

            <div class="stx-ui-actions" style="justify-content:flex-end;">
              <button id="${ids.globalAssignSaveBtnId}" type="button" class="stx-ui-btn" data-tip="保存全局分配配置">保存全局分配</button>
            </div>
          </div>

          <!-- View B: 插件分配 -->
          <div id="${ids.subPanelPluginAssignId}" class="stx-ui-sub-panel" hidden>
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="plugin assignment resource mapping">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">插件分配映射</div>
                <div class="stx-ui-item-desc">为每个已注册插件指定推荐资源。候选资源已按类型过滤。</div>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.pluginAssignRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新插件列表">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
              </div>
            </div>
            <div id="${ids.pluginAssignListId}" class="stx-ui-list"></div>
          </div>

          <!-- View C: 任务分配 -->
          <div id="${ids.subPanelTaskAssignId}" class="stx-ui-sub-panel" hidden>
            <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="task assignment override binding">
              <div class="stx-ui-item-main">
                <div class="stx-ui-item-title">任务级分配</div>
                <div class="stx-ui-item-desc">为特定插件的特定任务设置专属资源。失效绑定会以警告标记。</div>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.taskAssignRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新任务列表">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
              </div>
            </div>
            <div id="${ids.taskAssignListId}" class="stx-ui-list"></div>
          </div>
        </div>
        <!-- ═══ Panel: 编排与展示 ═══ -->
        <div id="${ids.panelOrchId}" class="stx-ui-panel" hidden>
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

          <div class="stx-ui-divider">
            <i class="fa-solid fa-bars-staggered"></i>
            <span>请求队列</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-item-stack stx-ui-search-item" data-stx-ui-search="queue pending active running">
            <div class="stx-ui-item-main">
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <div class="stx-ui-item-title">当前请求队列</div>
                <div class="stx-ui-item-desc">显示编排器中排队和正在执行的请求。</div>
              </div>
              <div class="stx-ui-actions">
                <button id="${ids.queueRefreshBtnId}" type="button" class="stx-ui-btn secondary" data-tip="刷新队列状态">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
              </div>
            </div>
            <div id="${ids.queueSnapshotListId}" class="stx-ui-list"></div>
          </div>

          <div class="stx-ui-divider">
            <i class="fa-solid fa-clock-rotate-left"></i>
            <span>请求日志</span>
            <div class="stx-ui-divider-line"></div>
          </div>

          <div class="stx-ui-item stx-ui-search-item" data-stx-ui-search="history log request records manager">
            <div class="stx-ui-item-main">
              <div class="stx-ui-item-title">请求日志管理</div>
              <div class="stx-ui-item-desc">打开日志管理窗口，查看全部插件经由 LLMHub 发起的请求记录、来源插件与响应详情。</div>
            </div>
            <div class="stx-ui-actions">
              <button id="${ids.requestLogOpenBtnId}" type="button" class="stx-ui-btn secondary" data-tip="打开请求日志管理窗口">
                <i class="fa-solid fa-up-right-from-square"></i> 打开日志管理
              </button>
            </div>
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

    <dialog id="${ids.requestLogModalId}" class="stx-ui-log-modal">
      <div class="stx-ui-log-modal-backdrop" data-log-modal-role="backdrop"></div>
      <div class="stx-ui-log-modal-panel">
        <div class="stx-ui-log-modal-head">
          <div class="stx-ui-log-modal-title">
            <i class="fa-solid fa-file-lines"></i><span>请求日志管理</span>
          </div>
          <button id="${ids.requestLogModalCloseId}" type="button" class="stx-ui-btn secondary">关闭</button>
        </div>
        <div class="stx-ui-log-modal-body">
          <div class="stx-ui-log-layout">
            <aside class="stx-ui-log-sidebar">
              <div class="stx-ui-log-toolbar">
                <input id="${ids.requestLogSearchId}" class="stx-ui-input stx-ui-input-full" type="search" placeholder="搜索 plugin / consumer / taskKey / llmTaskId / requestId / model" />
                <div class="stx-ui-log-filter-row">
                  <select id="${ids.requestLogStateFilterId}" class="stx-ui-select">
                    <option value="all">全部状态</option>
                    <option value="completed">已完成</option>
                    <option value="failed">失败</option>
                    <option value="cancelled">已取消</option>
                  </select>
                  <select id="${ids.requestLogSourceFilterId}" class="stx-ui-select">
                    <option value="all">全部来源插件</option>
                  </select>
                </div>
              </div>
              <div class="stx-ui-log-meta">
                <span id="${ids.requestLogChatKeyId}" class="stx-ui-log-chatkey">范围：全部插件请求日志</span>
                <span id="${ids.requestLogCountId}" class="stx-ui-log-count">共 0 条</span>
              </div>
              <div id="${ids.requestLogListId}" class="stx-ui-log-list"></div>
            </aside>
            <section class="stx-ui-log-detail-wrap">
              <div class="stx-ui-log-actions">
                <button id="${ids.requestLogRefreshBtnId}" type="button" class="stx-ui-btn secondary">
                  <i class="fa-solid fa-rotate"></i> 刷新
                </button>
                <button id="${ids.requestLogClearBtnId}" type="button" class="stx-ui-btn secondary">清空全部日志</button>
              </div>
              <div id="${ids.requestLogDetailId}" class="stx-ui-log-detail"></div>
            </section>
          </div>
        </div>
      </div>
    </dialog>
  `;
}
