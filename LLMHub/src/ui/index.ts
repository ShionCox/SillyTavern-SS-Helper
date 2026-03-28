import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import type { BudgetConfig } from '../budget/budget-manager';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { buildSharedSelectField, hydrateSharedSelects, refreshSharedSelectOptions, syncSharedSelects } from '../../../_Components/sharedSelect';
import { buildSharedCheckboxCard } from '../../../_Components/sharedCheckbox';
import { showSharedContextMenu } from '../../../_Components/sharedContextMenu';
import { ensureSharedTooltip } from '../../../_Components/sharedTooltip';
import { logger } from '../index';
import { mountThemeHost, unmountThemeHost, initThemeKernel, subscribeTheme } from '../../../SDK/theme';
import { getTavernConnectionSnapshot } from '../../../SDK/tavern';
import type { TavernConnectionInfoItem, TavernConnectionSnapshot } from '../../../SDK/tavern';
import { discoverConsumers } from '../discovery/consumer-discovery';
import type { DiscoveredConsumer } from '../discovery/consumer-discovery';
import type {
    LLMHubSettings,
    ResourceConfig,
    ResourceCustomParams,
    ResourceType,
    ResourceSource,
    ApiType,
    CapabilityKind,
    GlobalMaxTokensControl,
    GlobalAssignments,
    MaxTokensMode,
    PluginAssignment,
    TaskAssignment,
    ConsumerSnapshot,
    TaskDescriptor,
    LLMCapability,
    SilentPermissionGrant,
    LLMRequestLogEntry,
    LLMRequestLogQueryOptions,
    RequestState,
} from '../schema/types';

let LLMHUB_THEME_BINDING_READY = false;
let LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE: (() => void) | null = null;
let LLMHUB_CONSUMER_DISCOVERY_SEQ = 0;

type ProviderLite = { id: string };

type ResourceOption = {
    id: string;
    label: string;
    capabilities: LLMCapability[];
    enabled: boolean;
};

type LLMHubRuntime = {
    saveCredential?: (resourceId: string, apiKey: string) => Promise<void>;
    removeCredential?: (resourceId: string) => Promise<void>;
    clearAllCredentials?: () => Promise<void>;
    applySettingsFromContext?: () => Promise<void>;
    getStatusSnapshot?: () => Promise<import('../schema/types').LLMHubStatusSnapshot>;
    previewRoute?: (args: import('../schema/types').RouteResolveArgs) => Promise<import('../schema/types').RoutePreviewSnapshot>;
    setBudgetConfig?: (consumer: string, config: BudgetConfig) => void;
    removeBudgetConfig?: (consumer: string) => void;
    listRequestLogs?: (opts?: LLMRequestLogQueryOptions) => Promise<LLMRequestLogEntry[]>;
    clearRequestLogs?: () => Promise<number>;
    registry?: {
        listConsumerRegistrations?: () => ConsumerSnapshot[];
        subscribe?: (listener: () => void) => (() => void);
    };
    router?: {
        getAllProviders?: () => ProviderLite[];
        getProvider?: (id: string) => ProviderWithTest | null | undefined;
        getProviderCapabilities?: (resourceId: string) => LLMCapability[];
        listProvidersWithCapabilities?: (required?: LLMCapability[]) => ProviderLite[];
        getResourceType?: (resourceId: string) => ResourceType | undefined;
        applyGlobalAssignments?: (assignments: GlobalAssignments) => void;
        applyPluginAssignments?: (assignments: PluginAssignment[]) => void;
        applyTaskAssignments?: (assignments: TaskAssignment[]) => void;
    };
    orchestrator?: {
        getQueueSnapshot?: () => {
            pending: Array<{ requestId: string; consumer: string; taskId: string; taskDescription?: string; queuedAt: number }>;
            active: { requestId: string; consumer: string; taskId: string; taskDescription?: string; state: string } | null;
        };
    };
    displayController?: {
        exportSilentPermissions?: () => SilentPermissionGrant[];
        grantSilentPermission?: (pluginId: string, taskId: string) => void;
        revokeSilentPermission?: (pluginId: string, taskId: string) => void;
    };
    sdk?: {
        setGlobalProfile?: (profile: string) => void;
    };
};

type ProviderWithTest = ProviderLite & {
    testConnection?: () => Promise<{ ok: boolean; message: string; errorCode?: string; detail?: string; model?: string; latencyMs?: number }>;
    listModels?: () => Promise<{ ok: boolean; models: { id: string; label?: string }[]; message: string; errorCode?: string; detail?: string }>;
    embed?: (req: { texts: string[]; model?: string }) => Promise<{ embeddings: number[][] }>;
    rerank?: (req: { query: string; docs: string[]; topK?: number; model?: string }) => Promise<{ results: Array<{ index: number; score: number; doc: string }> }>;
};

type ResourceCustomParamValueType = 'string' | 'number' | 'boolean' | 'null' | 'json';

type ResourceCustomParamRow = {
    key: string;
    type: ResourceCustomParamValueType;
    value: string;
};

type UiTestResult = {
    ok: boolean;
    message: string;
    detail?: string;
    detailHtml?: string;
    latencyMs?: number;
};

const NAMESPACE = 'stx-llmhub';
const PROFILE_LABELS: Record<string, string> = {
    balanced: '平衡',
    precise: '精准',
    creative: '创意',
    economy: '经济',
};

const KIND_LABELS: Record<string, string> = {
    generation: '生成',
    embedding: '向量化',
    rerank: '重排序',
};

const STATE_LABELS: Record<string, string> = {
    queued: '排队中',
    running: '执行中',
    result_ready: '结果就绪',
    overlay_waiting: '等待关闭',
    completed: '已完成',
    failed: '已失败',
    cancelled: '已取消',
};

function getProfileLabel(profileId: string): string {
    return PROFILE_LABELS[profileId] || profileId;
}

function getKindLabel(kind: string): string {
    return KIND_LABELS[kind] || kind;
}

function getStateBadgeClass(state: string): string {
    if (state === 'running' || state === 'result_ready' || state === 'overlay_waiting') return 'is-running';
    if (state === 'queued') return 'is-queued';
    if (state === 'completed') return 'is-completed';
    if (state === 'failed') return 'is-failed';
    if (state === 'cancelled') return 'is-cancelled';
    return '';
}

function escapeHtml(value: string): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stringifyDebugValue(value: unknown): string {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

function stringifyRawLogValue(value: unknown): string {
    return stringifyDebugValue(value);
}

function buildRequestLogOutboundPreview(entry: LLMRequestLogEntry): string {
    const outbound = entry.request?.providerRequest
        ?? (entry.taskKind === 'embedding'
            ? {
                texts: Array.isArray(entry.request?.embeddingTexts) ? entry.request.embeddingTexts : [],
                model: entry.response?.meta?.model,
            }
            : entry.taskKind === 'rerank'
                ? {
                    query: entry.request?.rerankQuery,
                    docs: Array.isArray(entry.request?.rerankDocs) ? entry.request.rerankDocs : [],
                    topK: entry.request?.rerankTopK,
                    model: entry.response?.meta?.model,
                }
                : entry.request?.generationInput);

    if (outbound == null) {
        return '无原始发送内容';
    }
    return stringifyRawLogValue(outbound);
}

function buildRequestLogInboundPreview(entry: LLMRequestLogEntry): string {
    const inbound = entry.response?.providerResponse
        ?? entry.response?.rawResponseText
        ?? entry.response?.finalError;
    if (inbound == null || inbound === '') {
        return '无原始返回内容';
    }
    return stringifyRawLogValue(inbound);
}

async function writeClipboardText(value: string): Promise<boolean> {
    const text = String(value || '');
    if (!text) return false;

    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fallback below
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
}

function resourceTypeToCapabilities(type: ResourceType): LLMCapability[] {
    switch (type) {
        case 'generation':
            return ['chat', 'json', 'tools', 'vision', 'reasoning'];
        case 'embedding':
            return ['embeddings'];
        case 'rerank':
            return ['rerank'];
        default:
            return ['chat'];
    }
}

function normalizeCustomParams(value: unknown): ResourceCustomParams | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const entries = Object.entries(value).filter(([key]: [string, unknown]) => String(key || '').trim().length > 0);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
}

function normalizeResourceCapabilities(config: ResourceConfig): LLMCapability[] {
    const baseCapabilities = resourceTypeToCapabilities(config.type);
    const declaredCapabilities = Array.isArray(config.capabilities) ? config.capabilities : [];
    const nextCapabilities = new Set<LLMCapability>(baseCapabilities);

    if (config.type === 'generation' && config.source === 'custom' && declaredCapabilities.includes('rerank')) {
        nextCapabilities.add('rerank');
    }

    return Array.from(nextCapabilities);
}

function inferCustomParamType(value: unknown): ResourceCustomParamValueType {
    if (value === null) return 'null';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'object') return 'json';
    return 'string';
}

function serializeCustomParamValue(value: unknown, type: ResourceCustomParamValueType): string {
    if (type === 'null') return 'null';
    if (type === 'json') return JSON.stringify(value);
    return String(value ?? '');
}

function buildCustomParamRows(params?: ResourceCustomParams): ResourceCustomParamRow[] {
    if (!params) return [];
    return Object.entries(params).map(([key, value]: [string, unknown]) => {
        const type = inferCustomParamType(value);
        return {
            key,
            type,
            value: serializeCustomParamValue(value, type),
        };
    });
}

function escapeHtmlAttribute(value: string): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function buildResourceSharedSelectHtml(
    selectId: string,
    selected: string,
    resourceOptions: ResourceOption[],
    selectDataAttributes: Record<string, string>,
): string {
    return buildSharedSelectField({
        id: selectId,
        value: selected,
        containerClassName: 'stx-shared-select-fluid',
        selectClassName: 'stx-ui-input stx-ui-input-full',
        triggerClassName: 'stx-ui-input-full',
        selectAttributes: selectDataAttributes,
        options: [
            { value: '', label: '（不指定）' },
            ...resourceOptions.map((option: ResourceOption) => ({
                value: option.id,
                label: option.label,
            })),
        ],
    });
}

function formatResourceOptionLabel(resourceId: string, label?: string): string {
    const nextLabel = String(label || '').trim();
    if (!nextLabel || nextLabel === resourceId) {
        return resourceId;
    }
    return `${nextLabel}（${resourceId}）`;
}

function normalizeResourceConfigForUi(config: ResourceConfig): ResourceConfig {
    const normalizedApiType: ApiType | undefined = config.source === 'custom' && config.type === 'generation'
        ? config.apiType === 'deepseek'
            ? 'deepseek'
            : config.apiType === 'gemini'
                ? 'gemini'
                : config.apiType === 'claude'
                    ? 'claude'
                    : config.apiType === 'generic'
                        ? 'generic'
                        : 'openai'
        : undefined;

    const normalizedBase: ResourceConfig = {
        id: String(config.id || '').trim(),
        type: (config.type || 'generation') as ResourceType,
        source: config.source === 'tavern' ? 'tavern' : 'custom',
        apiType: normalizedApiType,
        label: String(config.label || config.id || '').trim() || String(config.id || ''),
        baseUrl: config.source === 'custom' ? String(config.baseUrl || '').trim() || undefined : undefined,
        model: String(config.model || '').trim() || undefined,
        enabled: config.enabled !== false,
        rerankPath: config.type === 'rerank' ? String(config.rerankPath || '').trim() || undefined : undefined,
        customParams: normalizeCustomParams(config.customParams),
    };

    return {
        ...normalizedBase,
        capabilities: normalizeResourceCapabilities(normalizedBase),
    };
}

function buildResourceOption(config: ResourceConfig): ResourceOption {
    const normalized = normalizeResourceConfigForUi(config);
    return {
        id: normalized.id,
        label: formatResourceOptionLabel(normalized.id, normalized.label),
        capabilities: normalizeResourceCapabilities(normalized),
        enabled: normalized.enabled !== false,
    };
}

function buildResourceListToggleHtml(resource: ResourceConfig): string {
    const resourceLabel = resource.label || resource.id;
    return buildSharedCheckboxCard({
        id: `${NAMESPACE}-resource-toggle-${resource.id}`,
        title: '',
        checkedLabel: '启用',
        uncheckedLabel: '停用',
        containerClassName: 'stx-ui-list-toggle is-control-only',
        copyClassName: 'stx-ui-list-toggle-copy',
        controlClassName: 'stx-ui-list-toggle-control',
        inputAttributes: {
            'data-resource-toggle': 'true',
            'data-resource-id': resource.id,
            'data-tip': `${resource.enabled === false ? '启用' : '停用'}资源 ${resourceLabel}`,
            'aria-label': `${resource.enabled === false ? '启用' : '停用'}资源 ${resourceLabel}`,
            checked: resource.enabled !== false,
        },
    });
}

function getApiTypeLabel(apiType?: ApiType): string {
    switch (apiType) {
        case 'deepseek': return 'deepseek';
        case 'gemini': return 'gemini';
        case 'claude': return 'claude';
        case 'generic': return 'generic';
        default: return 'openai';
    }
}

function formatTimestamp(ts: number): string {
    if (!ts) return '-';
    const d = new Date(ts);
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function formatDateTime(ts?: number): string {
    if (!ts) return '-';
    const d = new Date(ts);
    return [
        d.getFullYear(),
        `${d.getMonth() + 1}`.padStart(2, '0'),
        `${d.getDate()}`.padStart(2, '0'),
    ].join('-') + ` ${formatTimestamp(ts)}`;
}

function formatLatency(latencyMs?: number): string {
    if (!Number.isFinite(latencyMs) || latencyMs == null || latencyMs < 0) {
        return '-';
    }
    if (latencyMs < 1000) {
        return `${Math.round(latencyMs)}ms`;
    }
    return `${(latencyMs / 1000).toFixed(latencyMs >= 10_000 ? 1 : 2)}s`;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
    return Math.max(1, Math.round(numeric));
}

function normalizeGlobalMaxTokensControl(value: unknown): GlobalMaxTokensControl {
    const raw = (value && typeof value === 'object') ? (value as GlobalMaxTokensControl) : {};
    const mode = raw.mode === 'manual' || raw.mode === 'adaptive' ? raw.mode : 'inherit';
    const manualValue = sanitizePositiveInteger(raw.manualValue);
    return {
        mode,
        manualValue,
        adaptive: raw.adaptive && typeof raw.adaptive === 'object'
            ? {
                min: sanitizePositiveInteger(raw.adaptive.min),
                max: sanitizePositiveInteger(raw.adaptive.max),
                charDivisor: sanitizePositiveInteger(raw.adaptive.charDivisor),
                schemaCharDivisor: sanitizePositiveInteger(raw.adaptive.schemaCharDivisor),
                messageBonus: sanitizePositiveInteger(raw.adaptive.messageBonus),
            }
            : undefined,
    };
}

function buildRequestLogSearchText(entry: LLMRequestLogEntry): string {
    return [
        entry.sourcePluginId,
        entry.sessionId,
        formatRequestLogChatKey(entry.chatKey),
        entry.chatKey,
        entry.consumer,
        entry.taskId,
        entry.taskDescription,
        entry.requestId,
        entry.response?.meta?.resourceId,
        entry.response?.meta?.model,
        entry.response?.reasonCode,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function formatRequestLogChatKey(chatKey?: string): string {
    const normalized = String(chatKey || '').trim();
    if (!normalized) {
        return '未附带聊天上下文';
    }
    return normalized;
}

function formatTaskDisplayLabel(taskId?: string, taskDescription?: string): string {
    const descriptionText = String(taskDescription || '').trim();
    if (descriptionText) {
        return descriptionText;
    }
    return String(taskId || '').trim();
}

function getTavernInfoStatusClass(snapshot: TavernConnectionSnapshot): string {
    return snapshot.available ? 'is-ok' : 'is-warning';
}

function buildTavernInfoItemsHtml(items: TavernConnectionInfoItem[]): string {
    if (!items.length) {
        return '<div class="stx-ui-tavern-info-empty">暂未读取到酒馆连接信息</div>';
    }

    return items
        .map((item: TavernConnectionInfoItem) => `
            <div class="stx-ui-tavern-info-row">
                <span class="stx-ui-tavern-info-label">${escapeHtml(item.label)}</span>
                <span class="stx-ui-tavern-info-value">${escapeHtml(item.value)}</span>
            </div>
        `)
        .join('');
}

function formatDiscoveredConsumerSummary(consumers: DiscoveredConsumer[]): string {
    if (consumers.length === 0) return '';
    const names = consumers.slice(0, 3).map((consumer: DiscoveredConsumer) => consumer.displayName || consumer.pluginId);
    const summary = names.join('、');
    return consumers.length <= 3 ? summary : `${summary} 等 ${consumers.length} 个插件`;
}

function buildPluginAssignmentsEmptyStateHtml(consumers: DiscoveredConsumer[]): string {
    const onlineConsumers = consumers.filter((consumer: DiscoveredConsumer) => consumer.alive === true);
    const memoryOsConsumer = onlineConsumers.find((consumer: DiscoveredConsumer) => consumer.pluginId === 'stx_memory_os');

    if (memoryOsConsumer) {
        return '<div class="stx-ui-list-empty">已检测到 MemoryOS 在线，但它尚未向 LLMHub 注册任务。请稍候片刻，或检查 MemoryLlmBridge 注册日志。</div>';
    }

    if (onlineConsumers.length > 0) {
        const summary = escapeHtml(formatDiscoveredConsumerSummary(onlineConsumers));
        return `<div class="stx-ui-list-empty">已检测到 ${summary} 在线，但它们尚未向 LLMHub 注册任务。</div>`;
    }

    return '<div class="stx-ui-list-empty">暂无已注册插件</div>';
}

function generateChangelogHtml(): string {
    if (!Array.isArray(changelogData) || changelogData.length === 0) {
        return '暂无更新记录';
    }
    return changelogData
        .map((log: { version: string; date?: string; changes?: string[] }) => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
          <span style="font-weight: bold; color: var(--ss-theme-accent-contrast, #fff); font-size: 13px;">${log.version}</span>
          ${log.date ? `<span style="font-size: 11px; opacity: 0.6;">${log.date}</span>` : ''}
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; opacity: 0.85;">
          ${(log.changes || []).map((change: string) => `<li style="margin-bottom: 4px; line-height: 1.4;">${change}</li>`).join('')}
        </ul>
      </div>
    `)
        .join('');
}

const IDS: LLMHubSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'LLM Hub',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabBasicId: `${NAMESPACE}-tab-basic`,
    tabResourceId: `${NAMESPACE}-tab-resource`,
    tabAssignId: `${NAMESPACE}-tab-assign`,
    tabOrchId: `${NAMESPACE}-tab-orch`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelBasicId: `${NAMESPACE}-panel-basic`,
    panelResourceId: `${NAMESPACE}-panel-resource`,
    panelAssignId: `${NAMESPACE}-panel-assign`,
    panelOrchId: `${NAMESPACE}-panel-orch`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    globalProfileId: `${NAMESPACE}-global-profile`,
    globalMaxTokensModeId: `${NAMESPACE}-global-max-tokens-mode`,
    globalMaxTokensManualId: `${NAMESPACE}-global-max-tokens-manual`,

    resourceListId: `${NAMESPACE}-resource-list`,
    resourceNewBtnId: `${NAMESPACE}-resource-new-btn`,
    resourceEditorId: `${NAMESPACE}-resource-editor`,
    resourceIdInputId: `${NAMESPACE}-resource-id`,
    resourceLabelInputId: `${NAMESPACE}-resource-label`,
    resourceTypeSelectId: `${NAMESPACE}-resource-type`,
    resourceSourceSelectId: `${NAMESPACE}-resource-source`,
    resourceApiTypeSelectId: `${NAMESPACE}-resource-api-type`,
    resourceEnabledId: `${NAMESPACE}-resource-enabled`,
    resourceBaseUrlId: `${NAMESPACE}-resource-base-url`,
    resourceApiKeyId: `${NAMESPACE}-resource-api-key`,
    resourceApiKeySaveBtnId: `${NAMESPACE}-resource-api-key-save`,
    resourceDefaultModelId: `${NAMESPACE}-resource-default-model`,
    resourceRerankPathId: `${NAMESPACE}-resource-rerank-path`,
    resourceCustomParamsId: `${NAMESPACE}-resource-custom-params`,
    resourceCustomParamsListId: `${NAMESPACE}-resource-custom-params-list`,
    resourceCustomParamsAddBtnId: `${NAMESPACE}-resource-custom-params-add-btn`,
    resourceCustomParamsSyncBtnId: `${NAMESPACE}-resource-custom-params-sync-btn`,
    rerankTestPanelId: `${NAMESPACE}-rerank-test-panel`,
    rerankTestQueryId: `${NAMESPACE}-rerank-test-query`,
    rerankTestDocsId: `${NAMESPACE}-rerank-test-docs`,
    rerankTestTopKId: `${NAMESPACE}-rerank-test-topk`,
    testConnectionBtnId: `${NAMESPACE}-test-connection-btn`,
    testRerankBtnId: `${NAMESPACE}-test-rerank-btn`,
    testResultId: `${NAMESPACE}-test-result`,
    fetchModelsBtnId: `${NAMESPACE}-fetch-models-btn`,
    modelListSelectId: `${NAMESPACE}-model-list-select`,
    modelListStatusId: `${NAMESPACE}-model-list-status`,
    resourceCapChatId: `${NAMESPACE}-cap-chat`,
    resourceCapJsonId: `${NAMESPACE}-cap-json`,
    resourceCapToolsId: `${NAMESPACE}-cap-tools`,
    resourceCapEmbId: `${NAMESPACE}-cap-emb`,
    resourceCapRerankId: `${NAMESPACE}-cap-rerank`,
    resourceCapVisionId: `${NAMESPACE}-cap-vision`,
    resourceCapReasoningId: `${NAMESPACE}-cap-reasoning`,
    resourceSaveBtnId: `${NAMESPACE}-resource-save-btn`,
    resourceDeleteBtnId: `${NAMESPACE}-resource-delete-btn`,
    tavernInfoId: `${NAMESPACE}-tavern-info`,
    tavernInfoStatusId: `${NAMESPACE}-tavern-info-status`,
    tavernInfoListId: `${NAMESPACE}-tavern-info-list`,

    subTabGlobalAssignId: `${NAMESPACE}-sub-tab-global-assign`,
    subTabPluginAssignId: `${NAMESPACE}-sub-tab-plugin-assign`,
    subTabTaskAssignId: `${NAMESPACE}-sub-tab-task-assign`,
    subPanelGlobalAssignId: `${NAMESPACE}-sub-panel-global-assign`,
    subPanelPluginAssignId: `${NAMESPACE}-sub-panel-plugin-assign`,
    subPanelTaskAssignId: `${NAMESPACE}-sub-panel-task-assign`,

    globalAssignGenResourceId: `${NAMESPACE}-gassign-gen-resource`,
    globalAssignGenModelId: `${NAMESPACE}-gassign-gen-model`,
    globalAssignEmbResourceId: `${NAMESPACE}-gassign-emb-resource`,
    globalAssignEmbModelId: `${NAMESPACE}-gassign-emb-model`,
    globalAssignRerankResourceId: `${NAMESPACE}-gassign-rerank-resource`,
    globalAssignRerankModelId: `${NAMESPACE}-gassign-rerank-model`,
    globalAssignSaveBtnId: `${NAMESPACE}-gassign-save-btn`,

    pluginAssignListId: `${NAMESPACE}-plugin-assign-list`,
    pluginAssignRefreshBtnId: `${NAMESPACE}-plugin-assign-refresh`,

    taskAssignListId: `${NAMESPACE}-task-assign-list`,
    taskAssignRefreshBtnId: `${NAMESPACE}-task-assign-refresh`,

    budgetConsumerId: `${NAMESPACE}-budget-consumer`,
    budgetMaxRpmId: `${NAMESPACE}-budget-max-rpm`,
    budgetMaxTokensId: `${NAMESPACE}-budget-max-tokens`,
    budgetMaxLatencyId: `${NAMESPACE}-budget-max-latency`,
    budgetMaxCostId: `${NAMESPACE}-budget-max-cost`,
    budgetSaveBtnId: `${NAMESPACE}-budget-save-btn`,
    budgetResetBtnId: `${NAMESPACE}-budget-reset-btn`,
    budgetListId: `${NAMESPACE}-budget-list`,

    queueSnapshotListId: `${NAMESPACE}-queue-snapshot-list`,
    queueRefreshBtnId: `${NAMESPACE}-queue-refresh-btn`,
    silentPermissionsListId: `${NAMESPACE}-silent-permissions-list`,
    requestLogOpenBtnId: `${NAMESPACE}-request-log-open-btn`,
    requestLogModalId: `${NAMESPACE}-request-log-modal`,
    requestLogModalCloseId: `${NAMESPACE}-request-log-modal-close`,
    requestLogChatKeyId: `${NAMESPACE}-request-log-chat-key`,
    requestLogCountId: `${NAMESPACE}-request-log-count`,
    requestLogSearchId: `${NAMESPACE}-request-log-search`,
    requestLogStateFilterId: `${NAMESPACE}-request-log-state`,
    requestLogSourceFilterId: `${NAMESPACE}-request-log-source`,
    requestLogRefreshBtnId: `${NAMESPACE}-request-log-refresh-btn`,
    requestLogClearBtnId: `${NAMESPACE}-request-log-clear-btn`,
    requestLogListId: `${NAMESPACE}-request-log-list`,
    requestLogDetailId: `${NAMESPACE}-request-log-detail`,
};

function getRuntime(): LLMHubRuntime | null {
    return ((window as any).LLMHubPlugin || null) as LLMHubRuntime | null;
}

function ensureThemeBinding(): void {
    if (LLMHUB_THEME_BINDING_READY) return;
    LLMHUB_THEME_BINDING_READY = true;
    subscribeTheme((): void => {
        const cardRoot = document.getElementById(IDS.cardId);
        if (cardRoot) unmountThemeHost(cardRoot);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (!contentRoot) return;
        mountThemeHost(contentRoot);
    });
}

function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) {
            resolve(el);
            return;
        }
        const observer = new MutationObserver((_, obs) => {
            const target = document.querySelector(selector);
            if (target) {
                obs.disconnect();
                resolve(target);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

export async function renderSettingsUi(): Promise<void> {
    try {
        initThemeKernel();
        const container = await waitForElement('#extensions_settings');

        const styleId = `${IDS.cardId}-styles`;
        const nextStyleText = buildSettingsCardStylesTemplate(IDS.cardId);
        const existingStyleEl = document.getElementById(styleId) as HTMLStyleElement | null;
        if (existingStyleEl) {
            if (existingStyleEl.innerHTML !== nextStyleText) existingStyleEl.innerHTML = nextStyleText;
        } else {
            const styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML = nextStyleText;
            document.head.appendChild(styleEl);
        }

        let ssContainer = document.getElementById('ss-helper-plugins-container');
        if (!ssContainer) {
            ssContainer = document.createElement('div');
            ssContainer.id = 'ss-helper-plugins-container';
            ssContainer.className = 'ss-helper-plugins-container';
            container.prepend(ssContainer);
        }

        let cardWrapper = document.getElementById(IDS.cardId);
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);
            ssContainer.appendChild(cardWrapper);
        }
        hydrateSharedSelects(cardWrapper);

        unmountThemeHost(cardWrapper);
        const contentRoot = document.getElementById(IDS.drawerContentId);
        if (contentRoot) mountThemeHost(contentRoot);
        ensureThemeBinding();

        bindUiEvents();
        ensureSharedTooltip();
    } catch (error) {
        logger.error('UI 渲染失败:', error);
    }
}

function bindUiEvents(): void {
    const runtime = getRuntime();
    const cardRoot = document.getElementById(IDS.cardId);

    const getStContext = (): any => (window as any).SillyTavern?.getContext?.() || null;

    const ensureSettings = (): LLMHubSettings => {
        const ctx = getStContext();
        if (!ctx) return {};
        if (!ctx.extensionSettings) ctx.extensionSettings = {};
        if (!ctx.extensionSettings.stx_llmhub) ctx.extensionSettings.stx_llmhub = {};
        return ctx.extensionSettings.stx_llmhub as LLMHubSettings;
    };

    const saveSettings = (): void => {
        getStContext()?.saveSettingsDebounced?.();
    };

    const tabs = [
        { tabId: IDS.tabBasicId, panelId: IDS.panelBasicId },
        { tabId: IDS.tabResourceId, panelId: IDS.panelResourceId },
        { tabId: IDS.tabAssignId, panelId: IDS.panelAssignId },
        { tabId: IDS.tabOrchId, panelId: IDS.panelOrchId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;
        tabEl.addEventListener('click', () => {
            tabs.forEach(({ tabId: tId, panelId: pId }) => {
                document.getElementById(tId)?.classList.remove('is-active');
                document.getElementById(pId)?.setAttribute('hidden', 'true');
            });
            tabEl.classList.add('is-active');
            document.getElementById(panelId)?.removeAttribute('hidden');

            if (panelId === IDS.panelBasicId) renderTavernConnectionInfo();
            if (panelId === IDS.panelAssignId) renderPluginAssignments();
            if (panelId === IDS.panelOrchId) {
                renderQueueSnapshot();
                renderSilentPermissions();
            }
        });
    });

    const subTabs = [
        { tabId: IDS.subTabGlobalAssignId, panelId: IDS.subPanelGlobalAssignId },
        { tabId: IDS.subTabPluginAssignId, panelId: IDS.subPanelPluginAssignId },
        { tabId: IDS.subTabTaskAssignId, panelId: IDS.subPanelTaskAssignId },
    ];

    subTabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;
        tabEl.addEventListener('click', () => {
            subTabs.forEach(({ tabId: tId, panelId: pId }) => {
                document.getElementById(tId)?.classList.remove('is-active');
                document.getElementById(pId)?.setAttribute('hidden', 'true');
            });
            tabEl.classList.add('is-active');
            document.getElementById(panelId)?.removeAttribute('hidden');

            if (panelId === IDS.subPanelPluginAssignId) renderPluginAssignments();
            if (panelId === IDS.subPanelTaskAssignId) renderTaskAssignments();
        });
    });

    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement | null;
    if (searchInput) {
        searchInput.addEventListener('input', (evt: Event) => {
            const term = ((evt.target as HTMLInputElement).value || '').toLowerCase().trim();
            const searchableItems = document.querySelectorAll('[data-stx-ui-search]');
            searchableItems.forEach((el: Element) => {
                const keywords = (el.getAttribute('data-stx-ui-search') || '').toLowerCase();
                if (!term || keywords.includes(term)) el.classList.remove('is-hidden-by-search');
                else el.classList.add('is-hidden-by-search');
            });
        });
    }

    const enabledEl = document.getElementById(IDS.enabledId) as HTMLInputElement | null;
    if (enabledEl) {
        enabledEl.checked = ensureSettings().enabled === true;
        cardRoot?.classList.toggle('is-card-disabled', !enabledEl.checked);
        enabledEl.addEventListener('change', () => {
            const settings = ensureSettings();
            settings.enabled = enabledEl.checked;
            cardRoot?.classList.toggle('is-card-disabled', !enabledEl.checked);
            saveSettings();
            (window as any).STX?.bus?.emit('plugin:broadcast:state_changed', {
                v: 1,
                type: 'broadcast',
                topic: 'plugin:broadcast:state_changed',
                from: 'stx_llmhub',
                ts: Date.now(),
                data: { isEnabled: enabledEl.checked },
            });
        });
    }

    const profileEl = document.getElementById(IDS.globalProfileId) as HTMLSelectElement | null;
    if (profileEl) {
        profileEl.value = ensureSettings().globalProfile || 'balanced';
        syncSharedSelects(cardRoot || document.body);
        profileEl.addEventListener('change', () => {
            try {
                runtime?.sdk?.setGlobalProfile?.(profileEl.value);
                const current = ensureSettings();
                current.globalProfile = profileEl.value;
                saveSettings();
            } catch (error) {
                logger.error('设置全局 Profile 失败:', error);
            }
        });
    }

    const globalMaxTokensModeEl = document.getElementById(IDS.globalMaxTokensModeId) as HTMLSelectElement | null;
    const globalMaxTokensManualEl = document.getElementById(IDS.globalMaxTokensManualId) as HTMLInputElement | null;

    const syncGlobalMaxTokensUi = (): void => {
        const control = normalizeGlobalMaxTokensControl(ensureSettings().maxTokensControl);
        if (globalMaxTokensModeEl) globalMaxTokensModeEl.value = control.mode || 'inherit';
        if (globalMaxTokensManualEl) {
            globalMaxTokensManualEl.value = control.manualValue ? String(control.manualValue) : '';
            globalMaxTokensManualEl.disabled = control.mode !== 'manual';
            globalMaxTokensManualEl.placeholder = control.mode === 'manual'
                ? '例如 1600'
                : '仅手动模式可编辑';
        }
        syncSharedSelects(cardRoot || document.body);
    };

    const persistGlobalMaxTokensControl = (): void => {
        const settings = ensureSettings();
        const mode = (globalMaxTokensModeEl?.value || 'inherit') as MaxTokensMode;
        const manualValue = sanitizePositiveInteger(globalMaxTokensManualEl?.value);
        settings.maxTokensControl = {
            ...normalizeGlobalMaxTokensControl(settings.maxTokensControl),
            mode,
            manualValue,
        };
        saveSettings();
        void runtime?.applySettingsFromContext?.();
        syncGlobalMaxTokensUi();
    };

    syncGlobalMaxTokensUi();
    globalMaxTokensModeEl?.addEventListener('change', persistGlobalMaxTokensControl);
    globalMaxTokensManualEl?.addEventListener('change', persistGlobalMaxTokensControl);
    globalMaxTokensManualEl?.addEventListener('blur', persistGlobalMaxTokensControl);

    const resourceEditorEl = document.getElementById(IDS.resourceEditorId) as HTMLElement | null;
    const resourceTypeSelectEl = document.getElementById(IDS.resourceTypeSelectId) as HTMLSelectElement | null;
    const resourceSourceSelectEl = document.getElementById(IDS.resourceSourceSelectId) as HTMLSelectElement | null;
    const resourceApiTypeSelectEl = document.getElementById(IDS.resourceApiTypeSelectId) as HTMLSelectElement | null;
    const resourceBaseUrlEl = document.getElementById(IDS.resourceBaseUrlId) as HTMLInputElement | null;
    const resourceApiKeyEl = document.getElementById(IDS.resourceApiKeyId) as HTMLInputElement | null;
    const resourceApiKeySaveBtn = document.getElementById(IDS.resourceApiKeySaveBtnId) as HTMLButtonElement | null;
    const resourceDefaultModelEl = document.getElementById(IDS.resourceDefaultModelId) as HTMLInputElement | null;
    const resourceRerankPathEl = document.getElementById(IDS.resourceRerankPathId) as HTMLInputElement | null;
    const resourceCustomParamsEl = document.getElementById(IDS.resourceCustomParamsId) as HTMLTextAreaElement | null;
    const resourceCustomParamsListEl = document.getElementById(IDS.resourceCustomParamsListId) as HTMLElement | null;
    const resourceCustomParamsAddBtn = document.getElementById(IDS.resourceCustomParamsAddBtnId) as HTMLButtonElement | null;
    const resourceCustomParamsSyncBtn = document.getElementById(IDS.resourceCustomParamsSyncBtnId) as HTMLButtonElement | null;
    const rerankTestPanelEl = document.getElementById(IDS.rerankTestPanelId) as HTMLElement | null;
    const rerankTestQueryEl = document.getElementById(IDS.rerankTestQueryId) as HTMLInputElement | null;
    const rerankTestDocsEl = document.getElementById(IDS.rerankTestDocsId) as HTMLTextAreaElement | null;
    const rerankTestTopKEl = document.getElementById(IDS.rerankTestTopKId) as HTMLInputElement | null;
    const resourceIdInputEl = document.getElementById(IDS.resourceIdInputId) as HTMLInputElement | null;
    const resourceLabelInputEl = document.getElementById(IDS.resourceLabelInputId) as HTMLInputElement | null;
    const resourceEnabledEl = document.getElementById(IDS.resourceEnabledId) as HTMLInputElement | null;
    const resourceListEl = document.getElementById(IDS.resourceListId) as HTMLElement | null;
    const resourceNewBtn = document.getElementById(IDS.resourceNewBtnId) as HTMLButtonElement | null;
    const resourceSaveBtn = document.getElementById(IDS.resourceSaveBtnId) as HTMLButtonElement | null;
    const resourceDeleteBtn = document.getElementById(IDS.resourceDeleteBtnId) as HTMLButtonElement | null;
    const testConnectionBtn = document.getElementById(IDS.testConnectionBtnId) as HTMLButtonElement | null;
    const testRerankBtn = document.getElementById(IDS.testRerankBtnId) as HTMLButtonElement | null;
    const fetchModelsBtn = document.getElementById(IDS.fetchModelsBtnId) as HTMLButtonElement | null;
    const testResultEl = document.getElementById(IDS.testResultId) as HTMLElement | null;
    const tavernInfoStatusEl = document.getElementById(IDS.tavernInfoStatusId) as HTMLElement | null;
    const tavernInfoListEl = document.getElementById(IDS.tavernInfoListId) as HTMLElement | null;
    const modelListSelectEl = document.getElementById(IDS.modelListSelectId) as HTMLSelectElement | null;
    const modelListStatusEl = document.getElementById(IDS.modelListStatusId) as HTMLElement | null;

    const globalAssignGenModelEl = document.getElementById(IDS.globalAssignGenModelId) as HTMLInputElement | null;
    const globalAssignEmbModelEl = document.getElementById(IDS.globalAssignEmbModelId) as HTMLInputElement | null;
    const globalAssignRerankModelEl = document.getElementById(IDS.globalAssignRerankModelId) as HTMLInputElement | null;

    [globalAssignGenModelEl, globalAssignEmbModelEl, globalAssignRerankModelEl].forEach((el: HTMLInputElement | null) => {
        if (!el) return;
        el.disabled = true;
        el.value = '';
        el.placeholder = '当前版本未启用模型覆盖';
    });

    const resourceBaseUrlField = resourceBaseUrlEl?.closest('.stx-ui-field') as HTMLElement | null;
    const resourceApiTypeField = resourceApiTypeSelectEl?.closest('.stx-ui-field') as HTMLElement | null;
    const resourceRerankPathField = resourceRerankPathEl?.closest('.stx-ui-field') as HTMLElement | null;
    const resourceCapRerankEl = document.getElementById(IDS.resourceCapRerankId) as HTMLInputElement | null;

    let editingResourceId = '';

    const showResourceEditor = (): void => {
        if (resourceEditorEl) resourceEditorEl.style.display = '';
    };

    const hideResourceEditor = (): void => {
        if (resourceEditorEl) resourceEditorEl.style.display = 'none';
    };

    const renderTavernConnectionInfo = (): void => {
        if (!tavernInfoStatusEl || !tavernInfoListEl) return;
        const snapshot = getTavernConnectionSnapshot();
        tavernInfoStatusEl.className = `stx-ui-tavern-info-status ${getTavernInfoStatusClass(snapshot)}`;
        tavernInfoStatusEl.textContent = snapshot.message;
        tavernInfoListEl.innerHTML = buildTavernInfoItemsHtml(snapshot.items);
    };

    const buildRerankResultDetailHtml = (results: Array<{ index: number; score: number; doc: string }>): string => {
        if (!Array.isArray(results) || results.length === 0) return '';
        const items = results.map((item: { index: number; score: number; doc: string }, rank: number) => `
            <div class="stx-ui-rerank-result-item">
              <div class="stx-ui-rerank-result-head">
                <span class="stx-ui-rerank-result-rank">#${rank + 1}</span>
                <span class="stx-ui-rerank-result-index">文档 ${item.index}</span>
                <span class="stx-ui-rerank-result-score">score=${item.score.toFixed(4)}</span>
              </div>
              <div class="stx-ui-rerank-result-doc">${escapeHtml(item.doc)}</div>
            </div>
        `).join('');

        return `<div class="stx-ui-rerank-result-list">${items}</div>`;
    };

    const showTestResult = (result: UiTestResult): void => {
        if (!testResultEl) return;
        const cls = result.ok ? 'stx-ui-result-ok' : 'stx-ui-result-error';
        const latency = result.latencyMs != null ? ` (${result.latencyMs}ms)` : '';
        const detail = result.detailHtml
            ? `<div class="stx-ui-result-detail is-rich">${result.detailHtml}</div>`
            : result.detail
                ? `<div class="stx-ui-result-detail">${escapeHtml(result.detail)}</div>`
                : '';
        testResultEl.className = `stx-ui-result-area ${cls}`;
        testResultEl.innerHTML = `<div class="stx-ui-result-msg">${escapeHtml(result.message)}${latency}</div>${detail}`;
        testResultEl.style.display = '';
    };

    const renderCustomParamRows = (params?: ResourceCustomParams): void => {
        if (!resourceCustomParamsListEl) return;
        const rows = buildCustomParamRows(params);
        if (rows.length === 0) {
            resourceCustomParamsListEl.innerHTML = '<div class="stx-ui-param-empty">暂无参数项。可点击“添加参数”，也可直接编辑下方 JSON。</div>';
            return;
        }
        resourceCustomParamsListEl.innerHTML = rows.map((row: ResourceCustomParamRow, index: number) => `
            <div class="stx-ui-param-row" data-param-row="${index}">
              <input
                type="text"
                class="stx-ui-input stx-ui-input-full"
                data-param-key
                placeholder="参数名，如 top_p"
                value="${escapeHtmlAttribute(row.key)}"
              />
                            ${buildSharedSelectField({
                                    id: `${NAMESPACE}-param-type-${index}`,
                                    value: row.type,
                                    containerClassName: 'stx-shared-select-fluid',
                                    selectClassName: 'stx-ui-input stx-ui-input-full',
                                    triggerClassName: 'stx-ui-input-full stx-shared-select-trigger-compact',
                                    selectAttributes: { 'data-param-type': 'true' },
                                    options: [
                                            { value: 'string', label: '字符串' },
                                            { value: 'number', label: '数字' },
                                            { value: 'boolean', label: '布尔' },
                                            { value: 'null', label: 'null' },
                                            { value: 'json', label: 'JSON' },
                                    ],
                            })}
              <input
                type="text"
                class="stx-ui-input stx-ui-input-full"
                data-param-value
                placeholder="参数值"
                value="${escapeHtmlAttribute(row.value)}"
              />
              <button type="button" class="stx-ui-btn secondary stx-ui-param-remove" data-param-remove="${index}">删除</button>
            </div>
        `).join('');
                hydrateSharedSelects(resourceCustomParamsListEl);
                syncSharedSelects(cardRoot || document.body);
    };

    const parseCustomParamValue = (type: ResourceCustomParamValueType, value: string): unknown => {
        const text = String(value || '').trim();
        switch (type) {
            case 'string':
                return value;
            case 'number': {
                const parsed = Number(text);
                if (!Number.isFinite(parsed)) throw new Error('数字参数必须是有效数字');
                return parsed;
            }
            case 'boolean':
                if (/^(true|1)$/i.test(text)) return true;
                if (/^(false|0)$/i.test(text)) return false;
                throw new Error('布尔参数仅支持 true / false / 1 / 0');
            case 'null':
                return null;
            case 'json':
                return JSON.parse(text || 'null');
            default:
                return value;
        }
    };

    const collectCustomParamsFromRows = (): ResourceCustomParams | undefined => {
        if (!resourceCustomParamsListEl) return undefined;
        const rowEls = Array.from(resourceCustomParamsListEl.querySelectorAll<HTMLElement>('[data-param-row]'));
        if (rowEls.length === 0) return undefined;

        const entries: Array<[string, unknown]> = [];
        for (const rowEl of rowEls) {
            const key = String(rowEl.querySelector<HTMLInputElement>('[data-param-key]')?.value || '').trim();
            const type = (rowEl.querySelector<HTMLSelectElement>('[data-param-type]')?.value || 'string') as ResourceCustomParamValueType;
            const value = String(rowEl.querySelector<HTMLInputElement>('[data-param-value]')?.value || '');
            if (!key) continue;
            entries.push([key, parseCustomParamValue(type, value)]);
        }

        return entries.length > 0 ? Object.fromEntries(entries) : undefined;
    };

    const syncCustomParamsTextareaFromRows = (showError = true): boolean => {
        if (!resourceCustomParamsEl) return true;
        try {
            const params = collectCustomParamsFromRows();
            resourceCustomParamsEl.value = params ? JSON.stringify(params, null, 2) : '';
            return true;
        } catch (error: unknown) {
            if (showError) {
                alert(`参数项校验失败：${error instanceof Error ? error.message : String(error)}`);
            }
            return false;
        }
    };

    const syncCustomParamRowsFromTextarea = (showError = true): boolean => {
        const text = String(resourceCustomParamsEl?.value || '').trim();
        if (!text) {
            renderCustomParamRows();
            return true;
        }
        try {
            const parsed = JSON.parse(text);
            const params = normalizeCustomParams(parsed);
            if (!params) {
                throw new Error('自定义参数必须是 JSON 对象');
            }
            renderCustomParamRows(params);
            return true;
        } catch (error: unknown) {
            if (showError) {
                alert(`JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
            }
            return false;
        }
    };

    const refreshRerankTestButtonState = (): void => {
        if (!testRerankBtn) return;
        const source = (resourceSourceSelectEl?.value || 'custom') as ResourceSource;
        const type = (resourceTypeSelectEl?.value || 'generation') as ResourceType;
        const rerankEnabled = type === 'rerank' || (type === 'generation' && source === 'custom' && resourceCapRerankEl?.checked === true);
        testRerankBtn.style.display = rerankEnabled ? '' : 'none';
        testRerankBtn.disabled = !rerankEnabled;
        if (rerankTestPanelEl) {
            rerankTestPanelEl.style.display = rerankEnabled ? '' : 'none';
        }
    };

    const ensureRerankTestDefaults = (): void => {
        if (rerankTestQueryEl && !rerankTestQueryEl.value.trim()) {
            rerankTestQueryEl.value = 'health check';
        }
        if (rerankTestDocsEl && !rerankTestDocsEl.value.trim()) {
            rerankTestDocsEl.value = ['health check document', 'fallback document', 'unrelated sample'].join('\n');
        }
        if (rerankTestTopKEl && !rerankTestTopKEl.value.trim()) {
            rerankTestTopKEl.value = '2';
        }
    };

    const getRerankTestPayload = (): { query: string; docs: string[]; topK?: number } | null => {
        const query = String(rerankTestQueryEl?.value || '').trim();
        const docs = String(rerankTestDocsEl?.value || '')
            .split(/\r?\n/)
            .map((item: string) => item.trim())
            .filter(Boolean);
        const rawTopK = String(rerankTestTopKEl?.value || '').trim();
        const topK = rawTopK ? Number(rawTopK) : undefined;

        if (!query) {
            alert('请先填写重排测试 Query。');
            return null;
        }
        if (docs.length < 2) {
            alert('请至少提供两条候选文档用于重排测试。');
            return null;
        }
        if (topK != null && (!Number.isFinite(topK) || topK <= 0)) {
            alert('Top K 必须是大于 0 的整数。');
            return null;
        }

        return {
            query,
            docs,
            topK: topK != null ? Math.min(Math.max(1, Math.floor(topK)), docs.length) : undefined,
        };
    };

    const getSavedResources = (): ResourceConfig[] => {
        return (ensureSettings().resources || [])
            .map((config: ResourceConfig) => normalizeResourceConfigForUi(config))
            .filter((config: ResourceConfig) => Boolean(config.id));
    };

    const getSavedResourceOptions = (requiredCapabilities: LLMCapability[] = [], includeDisabled = false): ResourceOption[] => {
        return getSavedResources()
            .map((config: ResourceConfig) => buildResourceOption(config))
            .filter((option: ResourceOption) => includeDisabled || option.enabled)
            .filter((option: ResourceOption) => requiredCapabilities.every((cap: LLMCapability) => option.capabilities.includes(cap)));
    };

    const resetModelListSelect = (): void => {
        if (!modelListSelectEl) return;
        modelListSelectEl.innerHTML = '<option value="">（请先获取模型列表）</option>';
        if (modelListStatusEl) modelListStatusEl.textContent = '';
        refreshSharedSelectOptions(cardRoot || document.body);
    };

    const syncResourceEditorState = (): void => {
        const source = (resourceSourceSelectEl?.value || 'custom') as ResourceSource;
        const type = (resourceTypeSelectEl?.value || 'generation') as ResourceType;
        const apiType = (resourceApiTypeSelectEl?.value || 'openai') as ApiType;
        const capabilities = resourceTypeToCapabilities(type);
        const canToggleRerank = type === 'generation' && source === 'custom';
        const showApiType = source === 'custom' && type === 'generation';

        if (resourceApiTypeSelectEl) {
            resourceApiTypeSelectEl.disabled = !showApiType;
            if (!showApiType) {
                resourceApiTypeSelectEl.value = 'openai';
            }
        }
        if (resourceApiTypeField) {
            resourceApiTypeField.style.display = showApiType ? '' : 'none';
        }

        if (resourceBaseUrlEl) {
            resourceBaseUrlEl.disabled = source === 'tavern';
            resourceBaseUrlEl.placeholder = source === 'tavern'
                ? '酒馆直连无需填写'
                : type !== 'generation'
                    ? 'https://api.openai.com/v1'
                : apiType === 'gemini'
                    ? 'https://generativelanguage.googleapis.com/v1beta'
                    : apiType === 'claude'
                        ? 'https://api.anthropic.com/v1'
                        : apiType === 'deepseek'
                            ? 'https://api.deepseek.com/v1'
                            : apiType === 'generic'
                                ? '请填写你的通用 OpenAI / 代理兼容地址'
                        : 'https://api.openai.com/v1';
            if (source === 'tavern') resourceBaseUrlEl.value = '';
        }

        if (resourceBaseUrlField) resourceBaseUrlField.style.display = '';
        if (resourceRerankPathField) resourceRerankPathField.style.display = type === 'rerank' ? '' : 'none';
        if (type !== 'rerank' && resourceRerankPathEl) resourceRerankPathEl.value = '';

        const checkboxMap: Array<[string, LLMCapability]> = [
            [IDS.resourceCapChatId, 'chat'],
            [IDS.resourceCapJsonId, 'json'],
            [IDS.resourceCapToolsId, 'tools'],
            [IDS.resourceCapEmbId, 'embeddings'],
            [IDS.resourceCapRerankId, 'rerank'],
            [IDS.resourceCapVisionId, 'vision'],
            [IDS.resourceCapReasoningId, 'reasoning'],
        ];
        checkboxMap.forEach(([checkboxId, cap]: [string, LLMCapability]) => {
            const el = document.getElementById(checkboxId) as HTMLInputElement | null;
            if (!el) return;
            if (cap === 'rerank' && canToggleRerank) {
                el.checked = el.checked === true;
                el.disabled = false;
                return;
            }
            el.checked = capabilities.includes(cap);
            el.disabled = true;
        });

        refreshRerankTestButtonState();
        if (testResultEl) testResultEl.style.display = 'none';
        syncSharedSelects(cardRoot || document.body);
    };

    const loadResourceIntoEditor = (resource: ResourceConfig | null, reveal = true): void => {
        editingResourceId = resource?.id || '';
        if (resourceIdInputEl) {
            resourceIdInputEl.value = resource?.id || '';
            resourceIdInputEl.disabled = !!resource;
        }
        if (resourceLabelInputEl) resourceLabelInputEl.value = resource?.label || '';
        if (resourceTypeSelectEl) resourceTypeSelectEl.value = resource?.type || 'generation';
        if (resourceSourceSelectEl) resourceSourceSelectEl.value = resource?.source || 'custom';
        if (resourceApiTypeSelectEl) resourceApiTypeSelectEl.value = getApiTypeLabel(resource?.apiType);
        if (resourceBaseUrlEl) resourceBaseUrlEl.value = resource?.source === 'custom' ? (resource.baseUrl || '') : '';
        if (resourceDefaultModelEl) resourceDefaultModelEl.value = resource?.model || '';
        if (resourceRerankPathEl) resourceRerankPathEl.value = resource?.rerankPath || '';
        if (resourceCustomParamsEl) {
            resourceCustomParamsEl.value = resource?.customParams ? JSON.stringify(resource.customParams, null, 2) : '';
        }
        renderCustomParamRows(resource?.customParams);
        ensureRerankTestDefaults();
        if (resourceEnabledEl) resourceEnabledEl.checked = resource ? resource.enabled !== false : true;
        if (resourceCapRerankEl) {
            resourceCapRerankEl.checked = Boolean(resource?.capabilities?.includes('rerank') && resource.type === 'generation' && resource.source === 'custom');
        }
        if (resourceApiKeyEl) resourceApiKeyEl.value = '';
        if (resourceDeleteBtn) resourceDeleteBtn.disabled = !resource;
        resetModelListSelect();
        syncResourceEditorState();
        if (reveal) showResourceEditor();
        else hideResourceEditor();
    };

    const renderResourceList = (): void => {
        if (!resourceListEl) return;
        const resources = getSavedResources();
        if (resources.length === 0) {
            resourceListEl.innerHTML = '<div class="stx-ui-list-empty">暂无已保存资源，请先新建一条资源配置。</div>';
            return;
        }
        resourceListEl.innerHTML = resources
            .map((resource: ResourceConfig) => `
                            <div
                                class="stx-ui-list-item stx-ui-resource-row${editingResourceId === resource.id ? ' is-active' : ''}"
                                data-resource-id="${escapeHtml(resource.id)}"
                                title="左击编辑，右键菜单可删除"
                            >
                                <button
                                    type="button"
                                    class="stx-ui-list-main"
                                    data-resource-open="${escapeHtml(resource.id)}"
                                >
                                    <div class="stx-ui-list-icon">
                                        <i class="${resource.source === 'tavern' ? 'fa-solid fa-beer-mug-empty' : 'fa-solid fa-server'}"></i>
                                    </div>
                                    <div class="stx-ui-list-content">
                                        <div class="stx-ui-list-title">
                                            ${escapeHtml(resource.label || resource.id)}
                                            <span class="stx-ui-list-tag ${resource.type}">${escapeHtml(getKindLabel(resource.type))}</span>
                                        </div>
                                        <div class="stx-ui-list-meta">ID=${escapeHtml(resource.id)} · 来源=${escapeHtml(resource.source)}${resource.source === 'custom' && resource.type === 'generation' ? `/${escapeHtml(getApiTypeLabel(resource.apiType))}` : ''} · ${resource.enabled === false ? '停用' : '启用'}</div>
                                    </div>
                                </button>
                                <div class="stx-ui-list-side">
                                    ${buildResourceListToggleHtml(resource)}
                                </div>
                            </div>
            `)
            .join('');
    };

    const readEditingResource = (): ResourceConfig | null => {
        if (!syncCustomParamsTextareaFromRows()) {
            return null;
        }
        const id = String(resourceIdInputEl?.value || '').trim();
        const label = String(resourceLabelInputEl?.value || '').trim();
        const type = (resourceTypeSelectEl?.value || 'generation') as ResourceType;
        const source = (resourceSourceSelectEl?.value || 'custom') as ResourceSource;
        const apiType = (resourceApiTypeSelectEl?.value || 'openai') as ApiType;
        const baseUrl = String(resourceBaseUrlEl?.value || '').trim();
        const model = String(resourceDefaultModelEl?.value || '').trim();
        const rerankPath = String(resourceRerankPathEl?.value || '').trim();
        const customParamsText = String(resourceCustomParamsEl?.value || '').trim();
        const canToggleRerank = type === 'generation' && source === 'custom';

        let customParams: ResourceCustomParams | undefined;
        if (customParamsText) {
            try {
                const parsed = JSON.parse(customParamsText);
                customParams = normalizeCustomParams(parsed);
                if (!customParams) {
                    alert('自定义参数必须是 JSON 对象，例如 {"top_p":0.9}。');
                    return null;
                }
            } catch (error: unknown) {
                alert(`自定义参数 JSON 解析失败：${error instanceof Error ? error.message : String(error)}`);
                return null;
            }
        }

        if (!id) {
            alert('请先填写资源 ID。');
            return null;
        }
        if (!label) {
            alert('请先填写资源显示名称。');
            return null;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            alert('资源 ID 只支持字母、数字、下划线和短横线。');
            return null;
        }
        if (source === 'custom' && !baseUrl) {
            alert('自定义资源必须填写 Base URL。');
            return null;
        }

        return normalizeResourceConfigForUi({
            id,
            label,
            type,
            source,
            apiType: source === 'custom' && type === 'generation' ? apiType : undefined,
            baseUrl: source === 'custom' ? baseUrl : undefined,
            model: model || undefined,
            enabled: resourceEnabledEl?.checked !== false,
            rerankPath: type === 'rerank' ? rerankPath || undefined : undefined,
            capabilities: canToggleRerank && resourceCapRerankEl?.checked ? ['rerank'] : undefined,
            customParams,
        });
    };

    const saveEditingResource = async (): Promise<ResourceConfig | null> => {
        const resource = readEditingResource();
        if (!resource) return null;
        const settings = ensureSettings();
        const resources = getSavedResources().filter((item: ResourceConfig) => item.id !== resource.id);
        resources.push(resource);
        settings.resources = resources;
        saveSettings();
        await runtime?.applySettingsFromContext?.();
        editingResourceId = resource.id;
        if (resourceIdInputEl) resourceIdInputEl.disabled = true;
        renderResourceList();
        refreshAllResourceSelects();
        return resource;
    };

    const collectResourceReferences = (resourceId: string): string[] => {
        const settings = ensureSettings();
        const references: string[] = [];
        if (settings.globalAssignments?.generation?.resourceId === resourceId) references.push('全局分配 / 生成');
        if (settings.globalAssignments?.embedding?.resourceId === resourceId) references.push('全局分配 / 向量化');
        if (settings.globalAssignments?.rerank?.resourceId === resourceId) references.push('全局分配 / 重排序');
        (settings.pluginAssignments || []).forEach((item: PluginAssignment) => {
            if (item.generation?.resourceId === resourceId) references.push(`插件分配 / ${item.pluginId} / 生成`);
            if (item.embedding?.resourceId === resourceId) references.push(`插件分配 / ${item.pluginId} / 向量化`);
            if (item.rerank?.resourceId === resourceId) references.push(`插件分配 / ${item.pluginId} / 重排序`);
        });
        (settings.taskAssignments || []).forEach((item: TaskAssignment) => {
            if (item.resourceId === resourceId) references.push(`任务分配 / ${item.pluginId} / ${item.taskId}`);
        });
        return references;
    };

    const syncResourceListItemState = (resourceId: string, enabled: boolean): void => {
        const rowEl = resourceListEl?.querySelector<HTMLElement>(`[data-resource-id="${resourceId}"]`) || null;
        if (!rowEl) return;

        const metaEl = rowEl.querySelector<HTMLElement>('.stx-ui-list-meta');
        if (metaEl) {
            metaEl.textContent = metaEl.textContent?.replace(/(启用|停用)$/, enabled ? '启用' : '停用') || metaEl.textContent || '';
        }

        const toggleEl = rowEl.querySelector<HTMLInputElement>('[data-resource-toggle]');
        if (toggleEl) {
            toggleEl.checked = enabled;
            const resource = getSavedResources().find((item: ResourceConfig) => item.id === resourceId) || null;
            const resourceLabel = resource?.label || resourceId;
            toggleEl.dataset.tip = `${enabled ? '停用' : '启用'}资源 ${resourceLabel}`;
            toggleEl.setAttribute('aria-label', `${enabled ? '停用' : '启用'}资源 ${resourceLabel}`);
        }
    };

    const updateResourceEnabled = async (resourceId: string, enabled: boolean): Promise<void> => {
        const settings = ensureSettings();
        const resources = getSavedResources();
        const target = resources.find((item: ResourceConfig) => item.id === resourceId) || null;
        if (!target) return;

        settings.resources = resources.map((item: ResourceConfig) => (
            item.id === resourceId ? { ...item, enabled } : item
        ));

        saveSettings();
        await runtime?.applySettingsFromContext?.();

        if (editingResourceId === resourceId && resourceEnabledEl) {
            resourceEnabledEl.checked = enabled;
        }

        syncResourceListItemState(resourceId, enabled);
        refreshAllResourceSelects();
        restoreGlobalAssignmentsToUI();
        renderPluginAssignments();
        renderTaskAssignments();
        showTestResult({ ok: true, message: `${enabled ? '已启用' : '已停用'}资源 ${target.label || target.id}` });
    };

    const deleteResource = async (resourceId: string): Promise<void> => {
        const references = collectResourceReferences(resourceId);
        const referenceText = references.length > 0
            ? `\n\n以下设置项正在使用该资源：\n- ${references.join('\n- ')}\n\n删除后这些分配会自动改成未分配。`
            : '';
        if (!confirm(`确定删除资源“${resourceId}”吗？${referenceText}`)) {
            return;
        }

        const settings = ensureSettings();
        settings.resources = getSavedResources().filter((item: ResourceConfig) => item.id !== resourceId);

        const nextGlobalAssignments: GlobalAssignments = { ...(settings.globalAssignments || {}) };
        if (nextGlobalAssignments.generation?.resourceId === resourceId) delete nextGlobalAssignments.generation;
        if (nextGlobalAssignments.embedding?.resourceId === resourceId) delete nextGlobalAssignments.embedding;
        if (nextGlobalAssignments.rerank?.resourceId === resourceId) delete nextGlobalAssignments.rerank;
        settings.globalAssignments = nextGlobalAssignments;

        settings.pluginAssignments = (settings.pluginAssignments || [])
            .map((item: PluginAssignment) => {
                const next: PluginAssignment = { pluginId: item.pluginId };
                if (item.generation && item.generation.resourceId !== resourceId) next.generation = item.generation;
                if (item.embedding && item.embedding.resourceId !== resourceId) next.embedding = item.embedding;
                if (item.rerank && item.rerank.resourceId !== resourceId) next.rerank = item.rerank;
                return next;
            })
            .filter((item: PluginAssignment) => Boolean(item.generation || item.embedding || item.rerank));

        settings.taskAssignments = (settings.taskAssignments || []).filter((item: TaskAssignment) => item.resourceId !== resourceId);

        saveSettings();
        await runtime?.removeCredential?.(resourceId);
        await runtime?.applySettingsFromContext?.();
        editingResourceId = editingResourceId === resourceId ? '' : editingResourceId;
        if (!editingResourceId) {
            loadResourceIntoEditor(null, false);
        }
        renderResourceList();
        refreshAllResourceSelects();
        restoreGlobalAssignmentsToUI();
        renderPluginAssignments();
        renderTaskAssignments();
        showTestResult({ ok: true, message: `已删除资源 ${resourceId}` });
    };

    resourceTypeSelectEl?.addEventListener('change', syncResourceEditorState);
    resourceSourceSelectEl?.addEventListener('change', syncResourceEditorState);
    resourceApiTypeSelectEl?.addEventListener('change', syncResourceEditorState);
    resourceCapRerankEl?.addEventListener('change', refreshRerankTestButtonState);

    resourceCustomParamsAddBtn?.addEventListener('click', () => {
        const params = collectCustomParamsFromRows() || {};
        let seed = 'custom_param';
        let index = Object.keys(params).length + 1;
        while (Object.prototype.hasOwnProperty.call(params, seed)) {
            seed = `custom_param_${index++}`;
        }
        params[seed] = '';
        renderCustomParamRows(params);
        void syncCustomParamsTextareaFromRows(false);
    });

    resourceCustomParamsSyncBtn?.addEventListener('click', () => {
        if (syncCustomParamRowsFromTextarea()) {
            showTestResult({ ok: true, message: '已根据 JSON 刷新参数项' });
        }
    });

    resourceCustomParamsListEl?.addEventListener('input', () => {
        void syncCustomParamsTextareaFromRows(false);
    });

    resourceCustomParamsListEl?.addEventListener('change', () => {
        void syncCustomParamsTextareaFromRows(false);
    });

    resourceCustomParamsListEl?.addEventListener('click', (event: Event) => {
        const removeBtn = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-param-remove]');
        if (!removeBtn) return;
        const rowEl = removeBtn.closest<HTMLElement>('[data-param-row]');
        rowEl?.remove();
        if (!resourceCustomParamsListEl?.querySelector('[data-param-row]')) {
            renderCustomParamRows();
        }
        void syncCustomParamsTextareaFromRows(false);
    });

    resourceCustomParamsEl?.addEventListener('blur', () => {
        void syncCustomParamRowsFromTextarea(false);
    });

    resourceNewBtn?.addEventListener('click', () => {
        loadResourceIntoEditor(null, true);
        renderResourceList();
    });

    resourceListEl?.addEventListener('click', (event: Event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-resource-open]');
        const resourceId = String(target?.dataset.resourceOpen || '').trim();
        if (!resourceId) return;

        if (editingResourceId === resourceId) {
            loadResourceIntoEditor(null, false);
            editingResourceId = '';
        } else {
            const resource = getSavedResources().find((item: ResourceConfig) => item.id === resourceId) || null;
            loadResourceIntoEditor(resource, true);
        }
        renderResourceList();
    });

    resourceListEl?.addEventListener('change', async (event: Event) => {
        const target = (event.target as HTMLElement).closest<HTMLInputElement>('[data-resource-toggle]');
        if (!target) return;
        const resourceId = String(target.dataset.resourceId || '').trim();
        if (!resourceId) return;
        await updateResourceEnabled(resourceId, target.checked);
    });

    resourceListEl?.addEventListener('contextmenu', async (event: Event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-resource-id]');
        if (!target) return;
        const mouseEvent = event as MouseEvent;
        mouseEvent.preventDefault();
        const resourceId = String(target.dataset.resourceId || '').trim();
        if (!resourceId) return;

        target.classList.add('is-context-open');
        showSharedContextMenu({
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
            items: [
                {
                    id: 'delete-resource',
                    label: '删除资源',
                    iconClassName: 'fa-solid fa-trash-can',
                    danger: true,
                    onSelect: async () => {
                        await deleteResource(resourceId);
                    },
                },
            ],
            onClose: () => {
                target.classList.remove('is-context-open');
            },
        });
    });

    resourceApiKeySaveBtn?.addEventListener('click', async () => {
        const resourceId = editingResourceId || String(resourceIdInputEl?.value || '').trim();
        if (!resourceId) {
            alert('请先选择或填写资源 ID。');
            return;
        }
        const apiKey = String(resourceApiKeyEl?.value || '').trim();
        if (!apiKey) {
            alert('API Key 不能为空');
            return;
        }
        try {
            if (!runtime?.saveCredential) throw new Error('LLMHub Runtime 未就绪');
            await runtime.saveCredential(resourceId, apiKey);
            if (resourceApiKeyEl) resourceApiKeyEl.value = '';
            showTestResult({ ok: true, message: `已保存 ${resourceId} 的凭据` });
        } catch (error) {
            logger.error('保存凭据失败:', error);
            alert('保存凭据失败，请查看控制台');
        }
    });

    testConnectionBtn?.addEventListener('click', async () => {
        testConnectionBtn.disabled = true;
        testConnectionBtn.textContent = '测试中…';
        try {
            const resource = await saveEditingResource();
            if (!resource) return;
            const runtimeProvider = (runtime?.router?.getProvider?.(resource.id) as ProviderWithTest | null | undefined) || null;

            if (resource.type === 'embedding' && runtimeProvider?.embed) {
                const start = Date.now();
                const result = await runtimeProvider.embed({
                    texts: ['connection health check'],
                    model: resource.model || undefined,
                });
                const first = Array.isArray(result?.embeddings) ? result.embeddings[0] : null;
                const dim = Array.isArray(first) ? first.length : 0;
                if (dim > 0) {
                    showTestResult({ ok: true, message: `连接成功（向量维度 ${dim}）`, latencyMs: Date.now() - start });
                } else {
                    showTestResult({ ok: false, message: '连接失败：Embedding 返回为空或格式异常' });
                }
                return;
            }

            if (resource.type === 'rerank' && runtimeProvider?.rerank) {
                const start = Date.now();
                const result = await runtimeProvider.rerank({
                    query: 'health check',
                    docs: ['health check document', 'fallback document'],
                    topK: 1,
                    model: resource.model || undefined,
                });
                const first = Array.isArray(result?.results) ? result.results[0] : null;
                if (first && Number.isFinite(first.index) && Number.isFinite(first.score)) {
                    showTestResult({
                        ok: true,
                        message: `连接成功（返回 ${result.results.length} 条重排结果）`,
                        detailHtml: buildRerankResultDetailHtml(result.results),
                        latencyMs: Date.now() - start,
                    });
                } else {
                    showTestResult({ ok: false, message: '连接失败：Rerank 返回为空或格式异常' });
                }
                return;
            }

            if (!runtimeProvider?.testConnection) {
                showTestResult({ ok: false, message: '当前资源不支持连接测试' });
                return;
            }
            const result = await runtimeProvider.testConnection();
            showTestResult(result);
        } catch (error: unknown) {
            showTestResult({ ok: false, message: `测试异常：${error instanceof Error ? error.message : String(error)}` });
        } finally {
            renderTavernConnectionInfo();
            testConnectionBtn.disabled = false;
            testConnectionBtn.textContent = '测试连接';
        }
    });

    testRerankBtn?.addEventListener('click', async () => {
        testRerankBtn.disabled = true;
        testRerankBtn.textContent = '测试中…';
        try {
            const resource = await saveEditingResource();
            if (!resource) return;
            const testPayload = getRerankTestPayload();
            if (!testPayload) return;
            const runtimeProvider = (runtime?.router?.getProvider?.(resource.id) as ProviderWithTest | null | undefined) || null;
            if (!runtimeProvider?.rerank) {
                showTestResult({ ok: false, message: '当前资源不支持重排测试' });
                return;
            }

            const start = Date.now();
            const result = await runtimeProvider.rerank({
                query: testPayload.query,
                docs: testPayload.docs,
                topK: testPayload.topK,
                model: resource.model || undefined,
            });
            const summary = (result.results || [])
                .slice(0, 2)
                .map((item: { index: number; score: number; doc: string }) => `#${item.index}=${item.score.toFixed(3)}：${item.doc.slice(0, 24)}`)
                .join('，');
            const modeLabel = resource.type === 'generation' ? 'LLM 重排模式' : '专用重排接口';

            if (Array.isArray(result.results) && result.results.length > 0) {
                showTestResult({
                    ok: true,
                    message: `${modeLabel}测试成功（返回 ${result.results.length} 条结果）`,
                    detail: summary,
                    detailHtml: buildRerankResultDetailHtml(result.results),
                    latencyMs: Date.now() - start,
                });
            } else {
                showTestResult({ ok: false, message: `${modeLabel}测试失败：返回为空或格式异常` });
            }
        } catch (error: unknown) {
            showTestResult({ ok: false, message: `重排测试异常：${error instanceof Error ? error.message : String(error)}` });
        } finally {
            testRerankBtn.disabled = false;
            testRerankBtn.textContent = '测试重排';
            refreshRerankTestButtonState();
        }
    });

    fetchModelsBtn?.addEventListener('click', async () => {
        fetchModelsBtn.disabled = true;
        fetchModelsBtn.textContent = '获取中…';
        if (modelListStatusEl) modelListStatusEl.textContent = '';
        try {
            const resource = await saveEditingResource();
            if (!resource) return;
            const runtimeProvider = (runtime?.router?.getProvider?.(resource.id) as ProviderWithTest | null | undefined) || null;
            if (!runtimeProvider?.listModels) {
                if (modelListStatusEl) modelListStatusEl.textContent = '当前资源不支持获取模型列表';
                return;
            }
            const result = await runtimeProvider.listModels();
            if (!result.ok) {
                if (modelListStatusEl) modelListStatusEl.textContent = `获取失败：${result.message}`;
                return;
            }
            if (modelListSelectEl) {
                modelListSelectEl.innerHTML = ['<option value="">（请选择模型）</option>']
                    .concat(result.models.map((model: { id: string; label?: string }) => `<option value="${escapeHtml(model.id)}">${escapeHtml(model.label || model.id)}</option>`))
                    .join('');
                refreshSharedSelectOptions(cardRoot || document.body);
            }
            if (modelListStatusEl) modelListStatusEl.textContent = `已获取 ${result.models.length} 个模型`;
        } catch (error: unknown) {
            if (modelListStatusEl) modelListStatusEl.textContent = `获取异常：${error instanceof Error ? error.message : String(error)}`;
        } finally {
            fetchModelsBtn.disabled = false;
            fetchModelsBtn.textContent = '获取模型列表';
        }
    });

    modelListSelectEl?.addEventListener('change', () => {
        if (resourceDefaultModelEl && modelListSelectEl.value) {
            resourceDefaultModelEl.value = modelListSelectEl.value;
        }
    });

    resourceSaveBtn?.addEventListener('click', async () => {
        const resource = await saveEditingResource();
        if (!resource) return;
        renderResourceList();
        refreshAllResourceSelects();
        restoreGlobalAssignmentsToUI();
        renderPluginAssignments();
        renderTaskAssignments();
        showTestResult({ ok: true, message: `已保存资源 ${resource.label || resource.id}` });
    });

    resourceDeleteBtn?.addEventListener('click', async () => {
        const resourceId = editingResourceId || String(resourceIdInputEl?.value || '').trim();
        if (!resourceId) {
            alert('请先选择要删除的资源。');
            return;
        }
        await deleteResource(resourceId);
    });

    const populateResourceSelect = (
        selectEl: HTMLSelectElement | null,
        options: ResourceOption[],
        allowEmpty: boolean,
        currentValue?: string,
        emptyLabel = '（自动选择）',
    ): void => {
        if (!selectEl) return;
        const prev = currentValue ?? selectEl.value;
        selectEl.innerHTML = '';
        if (allowEmpty) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = emptyLabel;
            selectEl.appendChild(opt);
        }
        options.forEach((option: ResourceOption) => {
            const opt = document.createElement('option');
            opt.value = option.id;
            opt.textContent = option.label;
            selectEl.appendChild(opt);
        });
        if (Array.from(selectEl.options).some((o: HTMLOptionElement) => o.value === prev)) {
            selectEl.value = prev;
        }
    };

    const refreshAllResourceSelects = (): void => {
        populateResourceSelect(document.getElementById(IDS.globalAssignGenResourceId) as HTMLSelectElement | null, getSavedResourceOptions(['chat']), true);
        populateResourceSelect(document.getElementById(IDS.globalAssignEmbResourceId) as HTMLSelectElement | null, getSavedResourceOptions(['embeddings']), true);
        populateResourceSelect(document.getElementById(IDS.globalAssignRerankResourceId) as HTMLSelectElement | null, getSavedResourceOptions(['rerank']), true);
        refreshSharedSelectOptions(cardRoot || document.body);
    };

    const restoreGlobalAssignmentsToUI = (): void => {
        const settings = ensureSettings();
        const assignments = settings.globalAssignments || {};
        const genEl = document.getElementById(IDS.globalAssignGenResourceId) as HTMLSelectElement | null;
        const embEl = document.getElementById(IDS.globalAssignEmbResourceId) as HTMLSelectElement | null;
        const rerankEl = document.getElementById(IDS.globalAssignRerankResourceId) as HTMLSelectElement | null;
        if (genEl) genEl.value = assignments.generation?.resourceId || '';
        if (embEl) embEl.value = assignments.embedding?.resourceId || '';
        if (rerankEl) rerankEl.value = assignments.rerank?.resourceId || '';
        [globalAssignGenModelEl, globalAssignEmbModelEl, globalAssignRerankModelEl].forEach((el: HTMLInputElement | null) => {
            if (el) el.value = '';
        });
        syncSharedSelects(cardRoot || document.body);
    };

    document.getElementById(IDS.globalAssignSaveBtnId)?.addEventListener('click', () => {
        const generation = (document.getElementById(IDS.globalAssignGenResourceId) as HTMLSelectElement | null)?.value || '';
        const embedding = (document.getElementById(IDS.globalAssignEmbResourceId) as HTMLSelectElement | null)?.value || '';
        const rerank = (document.getElementById(IDS.globalAssignRerankResourceId) as HTMLSelectElement | null)?.value || '';

        const assignments: GlobalAssignments = {};
        if (generation) assignments.generation = { resourceId: generation };
        if (embedding) assignments.embedding = { resourceId: embedding };
        if (rerank) assignments.rerank = { resourceId: rerank };

        const settings = ensureSettings();
        settings.globalAssignments = assignments;
        saveSettings();
        runtime?.router?.applyGlobalAssignments?.(assignments);
        runtime?.applySettingsFromContext?.().catch(() => {});
    });

    const renderPluginAssignments = (): void => {
        const listEl = document.getElementById(IDS.pluginAssignListId);
        if (!listEl) return;
        const renderSeq = ++LLMHUB_CONSUMER_DISCOVERY_SEQ;

        const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
        if (registrations.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">正在检查已在线但尚未注册任务的插件…</div>';
            void discoverConsumers({
                fromNamespace: 'stx_llmhub',
                onlineOnly: true,
                excludePluginIds: ['stx_llmhub'],
            })
                .then((consumers: DiscoveredConsumer[]): void => {
                    if (renderSeq !== LLMHUB_CONSUMER_DISCOVERY_SEQ || !listEl.isConnected) return;
                    listEl.innerHTML = buildPluginAssignmentsEmptyStateHtml(consumers);
                })
                .catch((): void => {
                    if (renderSeq !== LLMHUB_CONSUMER_DISCOVERY_SEQ || !listEl.isConnected) return;
                    listEl.innerHTML = '<div class="stx-ui-list-empty">暂无已注册插件</div>';
                });
            return;
        }

        const settings = ensureSettings();
        const existingAssignments = settings.pluginAssignments || [];
        const kinds: CapabilityKind[] = ['generation', 'embedding', 'rerank'];

        listEl.innerHTML = registrations
            .map((snap: ConsumerSnapshot) => {
                const pluginId = snap.pluginId;
                const displayName = snap.displayName || pluginId;
                const isOnline = snap.session?.online ?? false;
                const lastSeen = snap.session?.seenAt ? formatTimestamp(snap.session.seenAt) : '-';
                const declaredKinds = new Set<CapabilityKind>();
                (snap.tasks || []).forEach((task: TaskDescriptor) => declaredKinds.add(task.taskKind));
                const relevantKinds = kinds.filter((kind: CapabilityKind) => declaredKinds.has(kind));
                if (relevantKinds.length === 0) relevantKinds.push('generation');

                const existing = existingAssignments.find((item: PluginAssignment) => item.pluginId === pluginId);
                const kindRows = relevantKinds.map((kind: CapabilityKind) => {
                    const requiredCaps = new Set<LLMCapability>();
                    (snap.tasks || [])
                        .filter((task: TaskDescriptor) => task.taskKind === kind)
                        .forEach((task: TaskDescriptor) => (task.requiredCapabilities || []).forEach((cap: LLMCapability) => requiredCaps.add(cap)));

                    const selected = kind === 'generation'
                        ? existing?.generation?.resourceId || ''
                        : kind === 'embedding'
                            ? existing?.embedding?.resourceId || ''
                            : existing?.rerank?.resourceId || '';

                    const selectId = `stx-llmhub-plugin-assign-${pluginId}-${kind}`.replace(/[^a-zA-Z0-9_-]/g, '-');
                    const selectHtml = buildResourceSharedSelectHtml(selectId, selected, getSavedResourceOptions(Array.from(requiredCaps)), {
                        'data-plugin-assign-resource': pluginId,
                        'data-plugin-assign-kind': kind,
                    });

                    return `
                      <div class="stx-ui-field">
                        <label class="stx-ui-field-label">${getKindLabel(kind)} 资源</label>
                        ${selectHtml}
                      </div>`;
                }).join('');

                return `
                  <div class="stx-ui-list-item stx-ui-consumer-map-row" data-plugin-row="${escapeHtml(pluginId)}">
                    <div class="stx-ui-consumer-map-head">
                      <div class="stx-ui-consumer-map-head-main">
                        <div class="stx-ui-list-title">
                          <span class="stx-ui-online-dot ${isOnline ? 'is-online' : 'is-offline'}"></span>
                          ${escapeHtml(displayName)} <span class="stx-ui-list-meta">(${escapeHtml(pluginId)})</span>
                        </div>
                      </div>
                      <div class="stx-ui-list-meta">最后活跃 ${lastSeen}</div>
                    </div>
                    <div class="stx-ui-consumer-map-form">${kindRows}</div>
                    <div class="stx-ui-consumer-map-actions">
                      <button class="stx-ui-btn" type="button" data-plugin-assign-save="${escapeHtml(pluginId)}">保存</button>
                      <button class="stx-ui-btn secondary" type="button" data-plugin-assign-delete="${escapeHtml(pluginId)}">清除</button>
                    </div>
                  </div>`;
            })
            .join('');

        hydrateSharedSelects(listEl);
        ensureSharedTooltip();
    };

    document.getElementById(IDS.pluginAssignListId)?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const saveBtn = target.closest<HTMLButtonElement>('button[data-plugin-assign-save]');
        const deleteBtn = target.closest<HTMLButtonElement>('button[data-plugin-assign-delete]');
        const pluginId = String(saveBtn?.dataset.pluginAssignSave || deleteBtn?.dataset.pluginAssignDelete || '').trim();
        if (!pluginId) return;

        const settings = ensureSettings();
        let assignments = (settings.pluginAssignments || []).filter((item: PluginAssignment) => item.pluginId !== pluginId);

        if (saveBtn) {
            const row = document.querySelector(`[data-plugin-row="${pluginId}"]`);
            if (!row) return;
            const next: PluginAssignment = { pluginId };
            const selects = row.querySelectorAll<HTMLSelectElement>('select[data-plugin-assign-resource]');
            selects.forEach((sel: HTMLSelectElement) => {
                const kind = sel.dataset.pluginAssignKind as CapabilityKind;
                const resourceId = sel.value.trim();
                if (!resourceId) return;
                if (kind === 'generation') next.generation = { resourceId };
                if (kind === 'embedding') next.embedding = { resourceId };
                if (kind === 'rerank') next.rerank = { resourceId };
            });
            if (next.generation || next.embedding || next.rerank) assignments.push(next);
        }

        settings.pluginAssignments = assignments;
        saveSettings();
        runtime?.router?.applyPluginAssignments?.(assignments);
    });

    document.getElementById(IDS.pluginAssignRefreshBtnId)?.addEventListener('click', renderPluginAssignments);

    const renderTaskAssignments = (): void => {
        const listEl = document.getElementById(IDS.taskAssignListId);
        if (!listEl) return;

        const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
        const allTasks: Array<{ pluginId: string; displayName: string; task: TaskDescriptor; isOnline: boolean }> = [];
        for (const snap of registrations) {
            for (const task of (snap.tasks || [])) {
                allTasks.push({
                    pluginId: snap.pluginId,
                    displayName: snap.displayName || snap.pluginId,
                    task,
                    isOnline: snap.session?.online ?? false,
                });
            }
        }

        if (allTasks.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">暂无已注册任务</div>';
            return;
        }

        const settings = ensureSettings();
        const existingAssignments = settings.taskAssignments || [];

        listEl.innerHTML = allTasks
            .map(({ pluginId, displayName, task, isOnline }) => {
                const existing = existingAssignments.find((item: TaskAssignment) => item.pluginId === pluginId && item.taskId === task.taskId);
                const isStale = existing?.isStale === true;
                const staleHtml = isStale
                    ? `<span class="stx-ui-stale-indicator"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(existing?.staleReason || '绑定失效')}</span>`
                    : '';
                const key = `${pluginId}::${task.taskId}`;
                const selectId = `stx-llmhub-task-assign-${pluginId}-${task.taskId}`.replace(/[^a-zA-Z0-9_-]/g, '-');
                const selectHtml = buildResourceSharedSelectHtml(selectId, existing?.resourceId || '', getSavedResourceOptions(task.requiredCapabilities || []), {
                    'data-task-assign-resource': key,
                });

                return `
                  <div class="stx-ui-list-item stx-ui-consumer-map-row" data-task-row="${escapeHtml(key)}">
                    <div class="stx-ui-consumer-map-head">
                      <div class="stx-ui-consumer-map-head-main">
                        <div class="stx-ui-list-title">
                          <span class="stx-ui-online-dot ${isOnline ? 'is-online' : 'is-offline'}"></span>
                          ${escapeHtml(displayName)} / ${escapeHtml(formatTaskDisplayLabel(task.taskId, task.description))}
                        </div>
                                                ${task.description ? `<div class="stx-ui-list-meta">${escapeHtml(task.description)}</div>` : ''}
                        <div class="stx-ui-list-meta">
                          类型=${getKindLabel(task.taskKind)}
                          ${task.requiredCapabilities?.length ? `，需要=[${task.requiredCapabilities.join(',')}]` : ''}
                          ${task.backgroundEligible ? '，可静默' : ''}
                        </div>
                        ${staleHtml}
                      </div>
                    </div>
                    <div class="stx-ui-consumer-map-form">
                      <div class="stx-ui-field">
                        <label class="stx-ui-field-label">资源</label>
                        ${selectHtml}
                      </div>
                                            <div class="stx-ui-field">
                                                <label class="stx-ui-field-label">任务 max_tokens 覆盖</label>
                                                <input
                                                    class="stx-ui-input stx-ui-input-full"
                                                    type="number"
                                                    min="1"
                                                    step="1"
                                                    placeholder="留空则不覆盖"
                                                    value="${escapeHtml(String(existing?.maxTokens || ''))}"
                                                    data-task-assign-max-tokens="${escapeHtml(key)}"
                                                />
                                            </div>
                    </div>
                    <div class="stx-ui-consumer-map-actions">
                      <button class="stx-ui-btn" type="button" data-task-assign-save="${escapeHtml(key)}" data-task-kind="${task.taskKind}">保存</button>
                      <button class="stx-ui-btn secondary" type="button" data-task-assign-delete="${escapeHtml(key)}">清除</button>
                    </div>
                  </div>`;
            })
            .join('');

        hydrateSharedSelects(listEl);
        ensureSharedTooltip();
    };

    document.getElementById(IDS.taskAssignListId)?.addEventListener('click', (evt: Event) => {
        const target = evt.target as HTMLElement;
        const saveBtn = target.closest<HTMLButtonElement>('button[data-task-assign-save]');
        const deleteBtn = target.closest<HTMLButtonElement>('button[data-task-assign-delete]');
        const key = String(saveBtn?.dataset.taskAssignSave || deleteBtn?.dataset.taskAssignDelete || '').trim();
        if (!key) return;

        const [pluginId, taskId] = key.split('::');
        if (!pluginId || !taskId) return;

        const settings = ensureSettings();
        let assignments = (settings.taskAssignments || []).filter((item: TaskAssignment) => !(item.pluginId === pluginId && item.taskId === taskId));

        if (saveBtn) {
            const resourceEl = document.querySelector<HTMLSelectElement>(`select[data-task-assign-resource="${key}"]`);
            const resourceId = resourceEl?.value.trim() || '';
            const maxTokensEl = document.querySelector<HTMLInputElement>(`input[data-task-assign-max-tokens="${key}"]`);
            const maxTokens = sanitizePositiveInteger(maxTokensEl?.value);
            const taskKind = (saveBtn.dataset.taskKind || 'generation') as CapabilityKind;

            if (resourceId) {
                const registrations = runtime?.registry?.listConsumerRegistrations?.() || [];
                let taskDesc: TaskDescriptor | undefined;
                for (const snap of registrations) {
                    taskDesc = snap.tasks?.find((task: TaskDescriptor) => task.taskId === taskId);
                    if (taskDesc) break;
                }

                if (taskDesc?.requiredCapabilities?.length) {
                    const resource = getSavedResources().find((item: ResourceConfig) => item.id === resourceId);
                    const resourceCaps = resource ? normalizeResourceCapabilities(resource) : [];
                    const missing = taskDesc.requiredCapabilities.filter((cap: LLMCapability) => !resourceCaps.includes(cap));
                    if (missing.length > 0) {
                        alert(`资源 "${resourceId}" 缺少所需能力: ${missing.join(', ')}。无法保存。`);
                        return;
                    }
                }
            }

            if (resourceId || maxTokens) {
                assignments.push({
                    pluginId,
                    taskId,
                    taskKind,
                    resourceId: resourceId || undefined,
                    maxTokens,
                    isStale: false,
                });
            }
        }

        settings.taskAssignments = assignments;
        saveSettings();
        runtime?.router?.applyTaskAssignments?.(assignments);
    });

    document.getElementById(IDS.taskAssignRefreshBtnId)?.addEventListener('click', renderTaskAssignments);

    const renderConsumerDrivenViews = (): void => {
        renderPluginAssignments();
        renderTaskAssignments();
    };

    LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE?.();
    LLMHUB_REGISTRY_SUBSCRIPTION_DISPOSE = runtime?.registry?.subscribe?.((): void => {
        renderConsumerDrivenViews();
    }) || null;

    const budgetConsumerEl = document.getElementById(IDS.budgetConsumerId) as HTMLInputElement | null;
    const budgetMaxRpmEl = document.getElementById(IDS.budgetMaxRpmId) as HTMLInputElement | null;
    const budgetMaxTokensEl = document.getElementById(IDS.budgetMaxTokensId) as HTMLInputElement | null;
    const budgetMaxLatencyEl = document.getElementById(IDS.budgetMaxLatencyId) as HTMLInputElement | null;
    const budgetMaxCostEl = document.getElementById(IDS.budgetMaxCostId) as HTMLInputElement | null;
    const budgetSaveBtn = document.getElementById(IDS.budgetSaveBtnId);
    const budgetResetBtn = document.getElementById(IDS.budgetResetBtnId);
    const budgetListEl = document.getElementById(IDS.budgetListId);

    const parseOptionalNumber = (value: string): number | undefined => {
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) return undefined;
        return parsed;
    };

    const renderBudgets = (): void => {
        if (!budgetListEl) return;
        const budgets = ensureSettings().budgets || {};
        const entries = Object.entries(budgets);
        if (entries.length === 0) {
            budgetListEl.innerHTML = '<div class="stx-ui-list-empty">暂无预算规则</div>';
            return;
        }
        budgetListEl.innerHTML = entries
            .map(([consumer, config]: [string, BudgetConfig]) => `
            <div class="stx-ui-list-item">
              <div>
                <div class="stx-ui-list-title">${escapeHtml(consumer)}</div>
                <div class="stx-ui-list-meta">
                  maxRPM=${config.maxRPM ?? '-'}, maxTokens=${config.maxTokens ?? '-'}, maxLatencyMs=${config.maxLatencyMs ?? '-'}, maxCost=${config.maxCost ?? '-'}
                </div>
              </div>
              <button class="stx-ui-btn secondary" type="button" data-budget-consumer="${escapeHtml(consumer)}">删除</button>
            </div>`)
            .join('');
    };

    const clearBudgetForm = (): void => {
        if (budgetConsumerEl) budgetConsumerEl.value = '';
        if (budgetMaxRpmEl) budgetMaxRpmEl.value = '';
        if (budgetMaxTokensEl) budgetMaxTokensEl.value = '';
        if (budgetMaxLatencyEl) budgetMaxLatencyEl.value = '';
        if (budgetMaxCostEl) budgetMaxCostEl.value = '';
    };

    budgetSaveBtn?.addEventListener('click', () => {
        const consumer = (budgetConsumerEl?.value || '').trim();
        if (!consumer) {
            alert('请填写预算的调用方');
            return;
        }
        const config: BudgetConfig = {};
        const maxRPM = parseOptionalNumber(budgetMaxRpmEl?.value || '');
        const maxTokens = parseOptionalNumber(budgetMaxTokensEl?.value || '');
        const maxLatencyMs = parseOptionalNumber(budgetMaxLatencyEl?.value || '');
        const maxCost = parseOptionalNumber(budgetMaxCostEl?.value || '');
        if (maxRPM !== undefined) config.maxRPM = maxRPM;
        if (maxTokens !== undefined) config.maxTokens = maxTokens;
        if (maxLatencyMs !== undefined) config.maxLatencyMs = maxLatencyMs;
        if (maxCost !== undefined) config.maxCost = maxCost;
        runtime?.setBudgetConfig?.(consumer, config);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        budgets[consumer] = config;
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
        clearBudgetForm();
    });

    budgetResetBtn?.addEventListener('click', clearBudgetForm);

    budgetListEl?.addEventListener('click', (evt: Event) => {
        const button = (evt.target as HTMLElement).closest<HTMLButtonElement>('button[data-budget-consumer]');
        if (!button) return;
        const consumer = String(button.dataset.budgetConsumer || '').trim();
        if (!consumer) return;
        runtime?.removeBudgetConfig?.(consumer);
        const current = ensureSettings();
        const budgets = { ...(current.budgets || {}) };
        delete budgets[consumer];
        current.budgets = budgets;
        saveSettings();
        renderBudgets();
    });

    const renderQueueSnapshot = (): void => {
        const listEl = document.getElementById(IDS.queueSnapshotListId);
        if (!listEl) return;
        const snapshot = runtime?.orchestrator?.getQueueSnapshot?.();
        if (!snapshot) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">编排器未就绪</div>';
            return;
        }

        const items: string[] = [];
        if (snapshot.active) {
            const active = snapshot.active;
            items.push(`
              <div class="stx-ui-list-item">
                <div>
                  <div class="stx-ui-list-title">${escapeHtml(active.consumer)} / ${escapeHtml(formatTaskDisplayLabel(active.taskId, active.taskDescription))}</div>
                  <div class="stx-ui-list-meta">ID: ${escapeHtml(active.requestId.slice(0, 8))}...</div>
                </div>
                <span class="stx-ui-state-badge ${getStateBadgeClass(active.state)}">${STATE_LABELS[active.state] || active.state}</span>
              </div>`);
        }

        for (const pending of snapshot.pending) {
            items.push(`
              <div class="stx-ui-list-item">
                <div>
                  <div class="stx-ui-list-title">${escapeHtml(pending.consumer)} / ${escapeHtml(formatTaskDisplayLabel(pending.taskId, pending.taskDescription))}</div>
                  <div class="stx-ui-list-meta">ID: ${escapeHtml(pending.requestId.slice(0, 8))}... | 入队 ${formatTimestamp(pending.queuedAt)}</div>
                </div>
                <span class="stx-ui-state-badge is-queued">排队中</span>
              </div>`);
        }

        listEl.innerHTML = items.length > 0 ? items.join('') : '<div class="stx-ui-list-empty">队列为空</div>';
    };

    const requestLogModal = document.getElementById(IDS.requestLogModalId) as HTMLDialogElement | null;
    const requestLogSearchInput = document.getElementById(IDS.requestLogSearchId) as HTMLInputElement | null;
    const requestLogStateInput = document.getElementById(IDS.requestLogStateFilterId) as HTMLSelectElement | null;
    const requestLogSourceInput = document.getElementById(IDS.requestLogSourceFilterId) as HTMLSelectElement | null;
    const requestLogListEl = document.getElementById(IDS.requestLogListId);
    const requestLogDetailEl = document.getElementById(IDS.requestLogDetailId);
    const requestLogChatKeyEl = document.getElementById(IDS.requestLogChatKeyId);
    const requestLogCountEl = document.getElementById(IDS.requestLogCountId);
    const requestLogClearBtn = document.getElementById(IDS.requestLogClearBtnId) as HTMLButtonElement | null;
    const requestLogOpenBtn = document.getElementById(IDS.requestLogOpenBtnId) as HTMLButtonElement | null;
    const requestLogCloseBtn = document.getElementById(IDS.requestLogModalCloseId) as HTMLButtonElement | null;
    const requestLogRefreshBtn = document.getElementById(IDS.requestLogRefreshBtnId) as HTMLButtonElement | null;
    let requestLogAllEntries: LLMRequestLogEntry[] = [];
    let requestLogFilteredEntries: LLMRequestLogEntry[] = [];
    let requestLogSelectedId = '';
    let requestLogCopyFeedbackTimer: number | null = null;

    const syncRequestLogSourceOptions = (): void => {
        if (!requestLogSourceInput) return;
        const currentValue = String(requestLogSourceInput.value || 'all').trim() || 'all';
        const sourcePluginIds = Array.from(new Set(
            requestLogAllEntries
                .map((entry: LLMRequestLogEntry): string => String(entry.sourcePluginId || '').trim())
                .filter(Boolean),
        )).sort((left: string, right: string): number => left.localeCompare(right, 'zh-CN'));

        requestLogSourceInput.innerHTML = [
            '<option value="all">全部来源插件</option>',
            ...sourcePluginIds.map((sourcePluginId: string): string => `<option value="${escapeHtml(sourcePluginId)}">${escapeHtml(sourcePluginId)}</option>`),
        ].join('');

        requestLogSourceInput.value = sourcePluginIds.includes(currentValue) ? currentValue : 'all';
    };

    const buildRequestLogPreviewSectionHtml = (title: string, value: string, copyKind: 'outbound' | 'inbound'): string => `
        <section class="stx-ui-log-section">
          <div class="stx-ui-log-section-head">
            <div class="stx-ui-log-section-title">${escapeHtml(title)}</div>
            <button type="button" class="stx-ui-log-copy-btn" data-log-copy-kind="${escapeHtml(copyKind)}">快速复制</button>
          </div>
          <pre class="stx-ui-log-pre stx-ui-log-pre-raw">${escapeHtml(value)}</pre>
        </section>
    `;

    const buildRequestLogSummarySectionHtml = (entry: LLMRequestLogEntry): string => {
        const model = String(entry.response?.meta?.model || '-').trim() || '-';
        const resourceId = String(entry.response?.meta?.resourceId || '-').trim() || '-';
        return `
        <section class="stx-ui-log-section">
          <div class="stx-ui-log-section-head">
            <div class="stx-ui-log-section-title">请求概览</div>
          </div>
          <pre class="stx-ui-log-pre">${escapeHtml([
                `请求ID：${entry.requestId}`,
                `来源插件：${entry.sourcePluginId}`,
                `任务：${formatTaskDisplayLabel(entry.taskId, entry.taskDescription)}`,
                `状态：${STATE_LABELS[entry.state] || entry.state}`,
                `资源：${resourceId}`,
                `模型：${model}`,
                `发出时间：${formatDateTime(entry.queuedAt)}`,
                `返回时间：${formatDateTime(entry.finishedAt)}`,
                `请求耗时：${formatLatency(entry.latencyMs)}`,
            ].join('\n'))}</pre>
        </section>
    `;
    };

    const renderRequestLogDetail = (entry: LLMRequestLogEntry | null): void => {
        if (!requestLogDetailEl) return;
        if (!entry) {
            requestLogDetailEl.innerHTML = '<div class="stx-ui-list-empty">暂无可显示的日志详情</div>';
            return;
        }

        requestLogDetailEl.innerHTML = [
            buildRequestLogSummarySectionHtml(entry),
            buildRequestLogPreviewSectionHtml('原始发送内容', buildRequestLogOutboundPreview(entry), 'outbound'),
            buildRequestLogPreviewSectionHtml('原始返回内容', buildRequestLogInboundPreview(entry), 'inbound'),
        ].join('');
    };

    const renderRequestLogList = (): void => {
        if (!requestLogListEl) return;
        if (!requestLogFilteredEntries.length) {
            requestLogListEl.innerHTML = '<div class="stx-ui-list-empty">当前筛选条件下没有日志</div>';
            renderRequestLogDetail(null);
            return;
        }

        requestLogListEl.innerHTML = requestLogFilteredEntries.map((entry) => `
          <button type="button" class="stx-ui-log-list-item${entry.logId === requestLogSelectedId ? ' is-active' : ''}" data-log-id="${escapeHtml(entry.logId)}">
            <div class="stx-ui-log-list-head">
                            <div class="stx-ui-log-list-title">${escapeHtml(entry.sourcePluginId)} / ${escapeHtml(formatTaskDisplayLabel(entry.taskId, entry.taskDescription))}</div>
              <span class="stx-ui-state-badge ${getStateBadgeClass(entry.state)}">${STATE_LABELS[entry.state] || entry.state}</span>
            </div>
                        ${entry.taskDescription ? `<div class="stx-ui-log-list-subtitle">${escapeHtml(entry.taskDescription)}</div>` : ''}
            <div class="stx-ui-log-list-timeline">
                                                        <span>${entry.finishedAt ? `发出 ${escapeHtml(formatTimestamp(entry.queuedAt))} · 返回 ${escapeHtml(formatTimestamp(entry.finishedAt))} · 耗时 ${escapeHtml(formatLatency(entry.latencyMs))}` : `发出 ${escapeHtml(formatTimestamp(entry.queuedAt))} · 等待返回`}</span>
            </div>
          </button>
        `).join('');

        const selected = requestLogFilteredEntries.find((entry) => entry.logId === requestLogSelectedId) || requestLogFilteredEntries[0];
        requestLogSelectedId = selected.logId;
        renderRequestLogDetail(selected);
    };

    const applyRequestLogFilters = (): void => {
        const search = String(requestLogSearchInput?.value || '').trim().toLowerCase();
        const state = (String(requestLogStateInput?.value || 'all').trim() || 'all') as RequestState | 'all';
        const sourcePluginId = String(requestLogSourceInput?.value || 'all').trim() || 'all';

        requestLogFilteredEntries = requestLogAllEntries.filter((entry) => {
            if (state !== 'all' && entry.state !== state) return false;
            if (sourcePluginId !== 'all' && entry.sourcePluginId !== sourcePluginId) return false;
            if (!search) return true;
            return buildRequestLogSearchText(entry).includes(search);
        });

        if (requestLogCountEl) {
            requestLogCountEl.textContent = `共 ${requestLogFilteredEntries.length} 条`;
        }
        renderRequestLogList();
        if (requestLogClearBtn) {
            requestLogClearBtn.disabled = requestLogAllEntries.length <= 0;
        }
    };

    const refreshRequestLogModal = async (): Promise<void> => {
        const entries = await runtime?.listRequestLogs?.({ order: 'desc', limit: 500 });
        requestLogAllEntries = Array.isArray(entries) ? entries : [];
        requestLogFilteredEntries = requestLogAllEntries.slice();
        requestLogSelectedId = requestLogAllEntries[0]?.logId || '';
        syncRequestLogSourceOptions();
        logger.info('[RequestLogUI][Refresh]', {
            source: 'listRequestLogs',
            count: requestLogAllEntries.length,
            sample: requestLogAllEntries.slice(0, 5).map((entry: LLMRequestLogEntry) => ({
                requestId: entry.requestId,
                sourcePluginId: entry.sourcePluginId,
                taskId: entry.taskId,
                state: entry.state,
                chatKey: entry.chatKey,
            })),
        });
        if (requestLogChatKeyEl) {
            requestLogChatKeyEl.textContent = '范围：全部插件请求日志';
        }
        applyRequestLogFilters();
    };

    const closeRequestLogModal = (): void => {
        if (!requestLogModal) return;
        if (requestLogModal.open) {
            try {
                requestLogModal.close();
            } catch {
                requestLogModal.removeAttribute('open');
            }
        }
    };

    const openRequestLogModal = async (): Promise<void> => {
        if (!requestLogModal) return;
        if (!requestLogModal.open) {
            try {
                requestLogModal.showModal();
            } catch {
                requestLogModal.setAttribute('open', '');
            }
        }
        await refreshRequestLogModal();
    };

    requestLogOpenBtn?.addEventListener('click', () => {
        void openRequestLogModal();
    });
    requestLogCloseBtn?.addEventListener('click', closeRequestLogModal);
    requestLogModal?.addEventListener('cancel', (event: Event) => {
        event.preventDefault();
        closeRequestLogModal();
    });
    requestLogModal?.addEventListener('click', (event: Event) => {
        const target = event.target as HTMLElement | null;
        if (event.target === requestLogModal || target?.dataset.logModalRole === 'backdrop') {
            closeRequestLogModal();
        }
    });

    requestLogSearchInput?.addEventListener('input', applyRequestLogFilters);
    requestLogStateInput?.addEventListener('change', applyRequestLogFilters);
    requestLogSourceInput?.addEventListener('change', applyRequestLogFilters);
    requestLogRefreshBtn?.addEventListener('click', () => {
        void refreshRequestLogModal();
    });
    requestLogClearBtn?.addEventListener('click', async () => {
        if (requestLogAllEntries.length <= 0) return;
        if (!confirm('确定清空全部请求日志吗？此操作不可撤销。')) return;
        await runtime?.clearRequestLogs?.();
        await refreshRequestLogModal();
    });
    requestLogDetailEl?.addEventListener('click', async (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-log-copy-kind]');
        if (!button) return;

        const selectedEntry = requestLogFilteredEntries.find((entry: LLMRequestLogEntry) => entry.logId === requestLogSelectedId)
            || requestLogAllEntries.find((entry: LLMRequestLogEntry) => entry.logId === requestLogSelectedId)
            || null;
        if (!selectedEntry) return;

        const copyKind = String(button.dataset.logCopyKind || '').trim();
        const text = copyKind === 'outbound'
            ? buildRequestLogOutboundPreview(selectedEntry)
            : buildRequestLogInboundPreview(selectedEntry);
        const ok = await writeClipboardText(text);

        if (requestLogCopyFeedbackTimer) {
            window.clearTimeout(requestLogCopyFeedbackTimer);
            requestLogCopyFeedbackTimer = null;
        }

        const originalText = button.textContent || '快速复制';
        button.textContent = ok ? '已复制' : '复制失败';
        button.classList.toggle('is-copied', ok);
        requestLogCopyFeedbackTimer = window.setTimeout((): void => {
            button.textContent = originalText;
            button.classList.remove('is-copied');
            requestLogCopyFeedbackTimer = null;
        }, 1200);
    });
    requestLogListEl?.addEventListener('click', (event: Event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>('[data-log-id]');
        const logId = String(target?.dataset.logId || '').trim();
        if (!logId) return;
        requestLogSelectedId = logId;
        renderRequestLogList();
    });

    const renderSilentPermissions = (): void => {
        const listEl = document.getElementById(IDS.silentPermissionsListId);
        if (!listEl) return;

        const permissions = runtime?.displayController?.exportSilentPermissions?.() || [];
        if (permissions.length === 0) {
            listEl.innerHTML = '<div class="stx-ui-list-empty">暂无静默权限授权</div>';
            return;
        }

        listEl.innerHTML = permissions.map((permission) => `
          <div class="stx-ui-list-item">
            <div>
              <div class="stx-ui-list-title">${escapeHtml(permission.pluginId)} / ${escapeHtml(formatTaskDisplayLabel(permission.taskId))}</div>
              <div class="stx-ui-list-meta">授权于 ${formatTimestamp(permission.grantedAt)}</div>
            </div>
            <button class="stx-ui-btn secondary" type="button" data-silent-revoke="${escapeHtml(permission.pluginId)}::${escapeHtml(permission.taskId)}">撤销</button>
          </div>`).join('');
    };

    document.getElementById(IDS.silentPermissionsListId)?.addEventListener('click', (evt: Event) => {
        const button = (evt.target as HTMLElement).closest<HTMLButtonElement>('button[data-silent-revoke]');
        if (!button) return;
        const key = String(button.dataset.silentRevoke || '').trim();
        const [pluginId, taskId] = key.split('::');
        if (!pluginId || !taskId) return;
        runtime?.displayController?.revokeSilentPermission?.(pluginId, taskId);
        const settings = ensureSettings();
        settings.silentPermissions = runtime?.displayController?.exportSilentPermissions?.() || [];
        saveSettings();
        renderSilentPermissions();
    });

    document.getElementById(IDS.queueRefreshBtnId)?.addEventListener('click', () => {
        renderQueueSnapshot();
        renderSilentPermissions();
    });

    const resources = getSavedResources();
    loadResourceIntoEditor(null, false);
    renderCustomParamRows();
    renderTavernConnectionInfo();
    renderResourceList();
    refreshAllResourceSelects();
    restoreGlobalAssignmentsToUI();
    renderConsumerDrivenViews();
    renderBudgets();
}
