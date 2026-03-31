/**
 * LLMHub 统一入口
 * 四层架构：注册中心 → 路由解析器 → 请求编排器 → 展示控制器
 * 导出公共模块并初始化运行时实例。
 */

// Provider 类型与实现
export type {
    LLMProvider,
    LLMProviderCapabilities,
    LLMRequest,
    LLMResponse,
    EmbedRequest,
    EmbedResponse,
    RerankRequest,
    RerankResponse,
    ProviderConnectionResult,
    ProviderModelListResult,
    ProviderModelInfo,
} from './providers/types';
export { OpenAIProvider } from './providers/openai-provider';
export { ClaudeProvider } from './providers/claude-provider';
export { GeminiProvider } from './providers/gemini-provider';
export { TavernProvider } from './providers/tavern-provider';
export { CustomRerankProvider } from './providers/custom-rerank-provider';

// 路由层
export { TaskRouter, BUILTIN_TAVERN_RESOURCE_ID } from './router/router';

// 注册中心
export { ConsumerRegistry } from './registry/consumer-registry';

// 编排器
export { RequestOrchestrator } from './orchestrator/orchestrator';

// 展示控制器
export { DisplayController } from './display/display-controller';

// 预算与熔断
export { BudgetManager } from './budget/budget-manager';
export type { BudgetConfig } from './budget/budget-manager';

// Profile 配置
export { ProfileManager, BUILTIN_PROFILES } from './profile/profile-manager';
export type { LLMProfile } from './profile/profile-manager';

// 凭据管理
export { VaultManager } from './vault/vault-manager';

// Schema 校验与错误码
export { validateZodSchema, parseJsonOutput } from './schema/validator';
export type { ValidationResult } from './schema/validator';
export { ReasonCode, inferReasonCode } from './schema/error-codes';
export type { LLMError } from './schema/error-codes';

// 核心类型（全量导出）
export type {
    LLMCapability,
    CapabilityKind,
    ApiType,
    ResourceType,
    ResourceSource,
    ResourceConfig,
    LLMRunMeta,
    LLMRunResult,
    LLMTaskLifecycleStage,
    LLMTaskLifecycleEvent,
    LLMTaskLifecycleHandler,
    DisplayMode,
    TaskDescriptor,
    RouteBinding,
    ConsumerRegistration,
    ConsumerPersistentSnapshot,
    ConsumerSessionSnapshot,
    ConsumerSnapshot,
    StaleBindingSnapshot,
    RequestScope,
    RequestEnqueueOptions,
    RequestState,
    LLMOverlaySpec,
    LLMSafeRichContent,
    OverlayPatch,
    OverlayAction,
    RouteResolveArgs,
    RouteResolveResult,
    AssignmentEntry,
    MaxTokensMode,
    AdaptiveMaxTokensConfig,
    GlobalMaxTokensControl,
    GlobalAssignments,
    PluginAssignment,
    TaskAssignment,
    LLMHubStatusSnapshot,
    LLMInspectApi,
    ResourceStatusSnapshot,
    RoutePreviewSnapshot,
    SilentPermissionGrant,
    LLMHubSettings,
    RunTaskArgs,
    EmbedArgs,
    RerankArgs,
    LLMRequestLogEntry,
    LLMRequestLogQueryOptions,
    LLMRequestLogRequestSnapshot,
    LLMRequestLogResponseSnapshot,
} from './schema/types';

// UI 层
export { renderSettingsUi as renderLLMHubSettings } from './ui/index';
import { renderSettingsUi } from './ui/index';
import { startLLMHubRuntime } from './runtime-entry';

import { respond } from '../../SDK/bus/rpc';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';
import {
    deleteSdkPluginChatState,
    patchSdkChatShared,
    readSdkPluginChatState,
    writeSdkPluginChatState,
} from '../../SDK/db';
import { buildSdkChatKeyEvent } from '../../SDK/tavern';
import { TaskRouter, BUILTIN_TAVERN_RESOURCE_ID } from './router/router';
import { BudgetManager, type BudgetConfig } from './budget/budget-manager';
import { LLMSDKImpl } from './sdk/llm-sdk';
import { OpenAIProvider } from './providers/openai-provider';
import { ClaudeProvider } from './providers/claude-provider';
import { GeminiProvider } from './providers/gemini-provider';
import { TavernProvider } from './providers/tavern-provider';
import { CustomRerankProvider } from './providers/custom-rerank-provider';
import { VaultManager } from './vault/vault-manager';
import { ConsumerRegistry } from './registry/consumer-registry';
import { RequestOrchestrator } from './orchestrator/orchestrator';
import { DisplayController } from './display/display-controller';
import type { PluginManifest } from '../../SDK/stx';
import type {
    LLMCapability,
    LLMHubSettings,
    LLMHubStatusSnapshot,
    LLMInspectApi,
    ApiType,
    ResourceConfig,
    ResourceStatusSnapshot,
    ResourceType,
    RoutePreviewSnapshot,
    RouteResolveArgs,
    GlobalAssignments,
    PluginAssignment,
    TaskAssignment,
    RequestRecord,
    LLMRequestLogRequestSnapshot,
    LLMRequestLogResponseSnapshot,
    LLMRequestLogEntry,
    LLMRequestLogQueryOptions,
} from './schema/types';
import { RequestLogService } from './log/requestLogService';
import manifestJson from '../manifest.json';

const LLMHUB_OVERLAY_ROOT_ID = 'stx-llmhub-overlay-root';
const LLMHUB_OVERLAY_STYLE_ID = 'stx-llmhub-overlay-style';

export const logger = new Logger('AI 调度中枢');
export const toast = new Toast('AI 调度中枢');
export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

type MemoryOsBridgeRuntime = {
    refreshLlmBridgeRegistration?: (reason?: string) => string | void;
};

const LLMHUB_MANIFEST: PluginManifest = {
    pluginId: 'stx_llmhub',
    name: 'LLMHub',
    displayName: manifestJson.display_name || 'SS-Helper [AI 调度中枢]',
    version: manifestJson.version || '1.0.0',
    capabilities: {
        events: ['plugin:request:ping', 'plugin:request:hello'],
        memory: [],
        llm: ['runTask', 'embed', 'rerank', 'route', 'registerConsumer', 'waitForOverlayClose'],
    },
    scopes: ['llm', 'router', 'budget', 'registry', 'orchestrator', 'display'],
    requiresSDK: '^1.0.0',
    source: 'manifest_json',
};

/** 资源类型 → 能力映射 */
function resourceTypeToCapabilities(type: ResourceType): LLMCapability[] {
    switch (type) {
        case 'generation': return ['chat', 'json', 'tools', 'vision', 'reasoning'];
        case 'embedding': return ['embeddings'];
        case 'rerank': return ['rerank'];
    }
}

function normalizeResourceCapabilities(cfg: ResourceConfig): LLMCapability[] {
    const baseCapabilities = resourceTypeToCapabilities(cfg.type);
    const declaredCapabilities = Array.isArray(cfg.capabilities) ? cfg.capabilities : [];
    const nextCapabilities = new Set<LLMCapability>(baseCapabilities);

    if (cfg.type === 'generation' && cfg.source === 'custom' && declaredCapabilities.includes('rerank')) {
        nextCapabilities.add('rerank');
    }

    return Array.from(nextCapabilities);
}

/**
 * LLMHub Runtime — 四层架构
 */
class LLMHub {
    public registry: ConsumerRegistry;
    public router: TaskRouter;
    public orchestrator: RequestOrchestrator;
    public displayController: DisplayController;
    public budgetManager: BudgetManager;
    public sdk: LLMSDKImpl;
    public vault: VaultManager;
    public requestLogService: RequestLogService;
    private managedResourceIds: Set<string>;

    constructor() {
        logger.info('AI 调度中枢核心引擎初始化（四层架构）...');

        this.registry = new ConsumerRegistry();
        this.router = new TaskRouter();
        this.router.setRegistry(this.registry);

        this.budgetManager = new BudgetManager();
        this.vault = new VaultManager();
        this.requestLogService = new RequestLogService();
        this.managedResourceIds = new Set<string>();

        this.orchestrator = new RequestOrchestrator();
        this.displayController = new DisplayController();

        this.sdk = new LLMSDKImpl(
            this.router,
            this.budgetManager,
            this.orchestrator,
            this.displayController,
            this.registry,
        );
        this.sdk.setSettingsResolver(() => this.readSettings());
        this.sdk.inspect = this.buildInspectApi();
        this.orchestrator.setArchiveCallback((record) => {
            logger.info('[RequestLog][ArchiveTrigger]', {
                requestId: record.requestId,
                consumer: record.consumer,
                taskId: record.taskId,
                state: record.state,
                chatKey: record.chatKey,
                reasonCode: record.debug?.reasonCode,
                finishedAt: record.finishedAt,
            });
            void this.requestLogService.archiveRecord(record).catch((error: unknown) => {
                logger.error('[RequestLog][ArchivePersistFailed]', {
                    requestId: record.requestId,
                    consumer: record.consumer,
                    taskId: record.taskId,
                    state: record.state,
                    chatKey: record.chatKey,
                    error: String((error as Error)?.message || error),
                });
            });
        });

        this.bindOverlayRenderer();

        this.registry.setResourceCapabilityQuery((resourceId) => {
            return this.router.getProviderCapabilities(resourceId);
        });

        this.pruneLegacyConsumerSnapshots();
        this.restoreFromStorage();
        this.registerBuiltinTavernResource();
        this.registerToSTX();
        this.setupDefaultProvider().catch((error: unknown) => {
            logger.warn('初始化默认资源失败，后续将等待设置页注入配置。', error);
        });

        logger.success('AI 调度中枢四层架构初始化完成。');
    }

    private bindOverlayRenderer(): void {
        if (typeof document === 'undefined') {
            return;
        }

        const ensureRoot = (): HTMLElement => {
            let root = document.getElementById(LLMHUB_OVERLAY_ROOT_ID) as HTMLElement | null;
            if (!root) {
                root = document.createElement('div');
                root.id = LLMHUB_OVERLAY_ROOT_ID;
                document.body.appendChild(root);
            }
            return root;
        };

        const ensureStyle = (): void => {
            if (document.getElementById(LLMHUB_OVERLAY_STYLE_ID)) {
                return;
            }
            const styleEl = document.createElement('style');
            styleEl.id = LLMHUB_OVERLAY_STYLE_ID;
            styleEl.textContent = `
                #${LLMHUB_OVERLAY_ROOT_ID} {
                    position: fixed;
                    inset: 0;
                    z-index: 99999;
                    pointer-events: none;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay {
                    position: absolute;
                    pointer-events: auto;
                    box-sizing: border-box;
                    color: var(--SmartThemeBodyColor, #f5f5f5);
                    font-family: inherit;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--fullscreen {
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    background: rgba(8, 10, 16, 0.72);
                    backdrop-filter: blur(12px);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--compact {
                    right: 20px;
                    bottom: 20px;
                    width: min(360px, calc(100vw - 24px));
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-card {
                    width: min(880px, 100%);
                    max-height: min(82vh, 900px);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    border-radius: 18px;
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    background: linear-gradient(180deg, rgba(27, 31, 42, 0.96), rgba(16, 18, 28, 0.96));
                    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.35);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--compact .stx-llmhub-overlay-card {
                    width: 100%;
                    max-height: 220px;
                    border-radius: 14px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--compact .stx-llmhub-overlay-head {
                    padding: 14px 16px 12px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--compact .stx-llmhub-overlay-title {
                    font-size: 15px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--compact .stx-llmhub-overlay-body {
                    padding: 0 16px 16px;
                    overflow: hidden;
                    gap: 10px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-compact-note {
                    margin: 0;
                    padding: 10px 12px;
                    border-radius: 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    font-size: 12px;
                    line-height: 1.6;
                    opacity: 0.88;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-compact-countdown {
                    position: relative;
                    width: 100%;
                    height: 6px;
                    overflow: hidden;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.08);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-compact-countdown-fill {
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    background: linear-gradient(90deg, rgba(88, 211, 106, 0.96), rgba(125, 230, 141, 0.96));
                    transform-origin: left center;
                    transition: width 180ms linear, opacity 180ms linear;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-status--error ~ .stx-llmhub-overlay-body .stx-llmhub-overlay-compact-countdown-fill {
                    background: linear-gradient(90deg, rgba(255, 120, 120, 0.96), rgba(255, 154, 154, 0.96));
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-head {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 12px;
                    padding: 16px 18px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-title-wrap {
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-title {
                    font-size: 16px;
                    font-weight: 700;
                    line-height: 1.35;
                    word-break: break-word;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-meta {
                    font-size: 12px;
                    opacity: 0.72;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 10px;
                    border-radius: 999px;
                    font-size: 12px;
                    font-weight: 700;
                    white-space: nowrap;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-status--loading {
                    background: rgba(197, 160, 89, 0.18);
                    color: #e7c46f;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-status--done {
                    background: rgba(88, 211, 106, 0.18);
                    color: #7de68d;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-status--error {
                    background: rgba(255, 120, 120, 0.18);
                    color: #ff9a9a;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-close {
                    border: 0;
                    border-radius: 10px;
                    padding: 8px 10px;
                    cursor: pointer;
                    color: inherit;
                    background: rgba(255, 255, 255, 0.08);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-body {
                    padding: 18px;
                    overflow: auto;
                    display: flex;
                    flex-direction: column;
                    gap: 14px;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-content {
                    margin: 0;
                    padding: 14px;
                    border-radius: 14px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    font-size: 13px;
                    line-height: 1.65;
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-loading-bar {
                    position: relative;
                    width: 100%;
                    height: 6px;
                    overflow: hidden;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.08);
                }

                #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-loading-bar::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    width: 38%;
                    border-radius: inherit;
                    background: linear-gradient(90deg, rgba(197,160,89,0.2), rgba(197,160,89,0.95), rgba(197,160,89,0.2));
                    animation: stx-llmhub-overlay-loading 1.2s ease-in-out infinite;
                }

                @keyframes stx-llmhub-overlay-loading {
                    0% { transform: translateX(-120%); }
                    100% { transform: translateX(280%); }
                }

                @media (max-width: 640px) {
                    #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay--fullscreen {
                        padding: 12px;
                    }
                    #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-head,
                    #${LLMHUB_OVERLAY_ROOT_ID} .stx-llmhub-overlay-body {
                        padding: 14px;
                    }
                }
            `;
            document.head.appendChild(styleEl);
        };

        const escapeHtml = (value: string): string => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const formatBody = (body: string): string => escapeHtml(body || '');
        const renderContent = (content?: { type: 'text' | 'markdown' | 'html'; body: string }): string => {
            if (!content) {
                return '<pre class="stx-llmhub-overlay-content">暂无内容</pre>';
            }
            if (content.type === 'html') {
                return `<div class="stx-llmhub-overlay-content">${content.body}</div>`;
            }
            return `<pre class="stx-llmhub-overlay-content">${formatBody(content.body)}</pre>`;
        };

        const statusLabelMap: Record<string, string> = {
            loading: '处理中',
            streaming: '生成中',
            done: '已完成',
            error: '出错了',
        };
        let compactCountdownRenderTimer: ReturnType<typeof setInterval> | null = null;

        const resolveAutoCloseSeconds = (spec: { autoCloseMs?: number; autoCloseAt?: number }): number => {
            const autoCloseAt = Number(spec.autoCloseAt ?? 0);
            if (autoCloseAt > 0) {
                return Math.max(1, Math.ceil((autoCloseAt - Date.now()) / 1000));
            }
            return Math.max(1, Math.ceil((Number(spec.autoCloseMs ?? 0) || 0) / 1000));
        };

        const resolveAutoCloseProgressPercent = (spec: { autoCloseMs?: number; autoCloseAt?: number }): number => {
            const totalMs = Math.max(0, Math.trunc(Number(spec.autoCloseMs ?? 0) || 0));
            if (totalMs <= 0) {
                return 0;
            }
            const autoCloseAt = Number(spec.autoCloseAt ?? 0);
            if (autoCloseAt <= 0) {
                return 100;
            }
            const remainingMs = Math.max(0, autoCloseAt - Date.now());
            return Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
        };

        const buildCompactNote = (spec: { status?: string; autoClose?: boolean; autoCloseMs?: number; autoCloseAt?: number }): string => {
            const status = spec.status || 'done';
            if (status === 'loading' || status === 'streaming') {
                return '任务正在执行，请稍候。';
            }
            const autoCloseSeconds = resolveAutoCloseSeconds(spec);
            if (status === 'error') {
                return `任务执行失败，提示将在 ${autoCloseSeconds} 秒后自动关闭。`;
            }
            return `任务已完成，提示将在 ${autoCloseSeconds} 秒后自动关闭。`;
        };

        const syncCompactCountdownTimer = (): void => {
            const overlays = this.displayController.listActiveOverlays();
            const shouldTick = overlays.some((spec) => {
                return spec.displayMode === 'compact'
                    && spec.autoClose === true
                    && typeof spec.autoCloseAt === 'number'
                    && spec.autoCloseAt > Date.now();
            });
            if (shouldTick) {
                if (!compactCountdownRenderTimer) {
                    compactCountdownRenderTimer = setInterval((): void => {
                        renderAll();
                    }, 250);
                }
                return;
            }
            if (compactCountdownRenderTimer) {
                clearInterval(compactCountdownRenderTimer);
                compactCountdownRenderTimer = null;
            }
        };

        const renderAll = (): void => {
            ensureStyle();
            const root = ensureRoot();
            const overlays = this.displayController.listActiveOverlays();
            if (overlays.length === 0) {
                root.innerHTML = '';
                syncCompactCountdownTimer();
                return;
            }

            root.innerHTML = overlays.map((spec) => {
                const modeClass = spec.displayMode === 'compact' ? 'stx-llmhub-overlay--compact' : 'stx-llmhub-overlay--fullscreen';
                const status = spec.status || 'done';
                const progressPercent = resolveAutoCloseProgressPercent(spec);
                const countdownBar = spec.displayMode === 'compact' && spec.autoClose && typeof spec.autoCloseMs === 'number' && spec.autoCloseMs > 0
                    ? `<div class="stx-llmhub-overlay-compact-countdown"><div class="stx-llmhub-overlay-compact-countdown-fill" style="width:${progressPercent.toFixed(2)}%; opacity:${progressPercent > 0 ? '1' : '0.72'};"></div></div>`
                    : '';
                const compactBody = `
                    <p class="stx-llmhub-overlay-compact-note">${escapeHtml(buildCompactNote(spec))}</p>
                    ${countdownBar}
                `;
                return `
                    <section class="stx-llmhub-overlay ${modeClass}" data-llmhub-overlay-id="${escapeHtml(spec.requestId)}">
                        <div class="stx-llmhub-overlay-card">
                            <header class="stx-llmhub-overlay-head">
                                <div class="stx-llmhub-overlay-title-wrap">
                                    <div class="stx-llmhub-overlay-title">${escapeHtml(spec.title || 'LLM 任务')}</div>
                                    <div class="stx-llmhub-overlay-meta">请求 ID：${escapeHtml(spec.requestId)}</div>
                                </div>
                                <div class="stx-llmhub-overlay-status stx-llmhub-overlay-status--${escapeHtml(status)}">${escapeHtml(statusLabelMap[status] || status)}</div>
                                <button type="button" class="stx-llmhub-overlay-close" data-llmhub-overlay-close="${escapeHtml(spec.requestId)}" aria-label="关闭">关闭</button>
                            </header>
                            <div class="stx-llmhub-overlay-body">
                                ${status === 'loading' || status === 'streaming' ? '<div class="stx-llmhub-overlay-loading-bar"></div>' : ''}
                                ${spec.displayMode === 'compact' ? compactBody : renderContent(spec.content)}
                            </div>
                        </div>
                    </section>
                `;
            }).join('');
            syncCompactCountdownTimer();
        };

        this.displayController.setRenderCallback(() => {
            renderAll();
        });
        this.displayController.setCloseCallback(() => {
            renderAll();
        });

        document.addEventListener('click', (event: MouseEvent): void => {
            const target = event.target as HTMLElement | null;
            const closeButton = target?.closest<HTMLElement>('[data-llmhub-overlay-close]');
            if (!closeButton) return;
            const requestId = String(closeButton.getAttribute('data-llmhub-overlay-close') || '').trim();
            if (!requestId) return;
            this.displayController.closeOverlay(requestId, 'user_close');
        });
    }

    /** 注册内置酒馆资源（运行时常驻，不写入持久层） */
    private registerBuiltinTavernResource(): void {
        const tavernProvider = new TavernProvider({ id: BUILTIN_TAVERN_RESOURCE_ID });
        this.router.registerProvider(
            tavernProvider,
            'generation',
            ['chat', 'json'],
            undefined,
        );
        logger.info('内置酒馆生成资源已注册。');
    }

    private restoreFromStorage(): void {
        const settings = this.readSettings();

        if (settings.silentPermissions) {
            this.displayController.restoreSilentPermissions(settings.silentPermissions);
        }
        if (settings.globalAssignments) {
            this.router.applyGlobalAssignments(settings.globalAssignments);
        }
        if (settings.pluginAssignments) {
            this.router.applyPluginAssignments(settings.pluginAssignments);
        }
        if (settings.taskAssignments) {
            this.router.applyTaskAssignments(settings.taskAssignments);
        }
    }

    /**
     * 功能：清理历史遗留的消费者注册快照，避免旧注册值覆盖当前运行时注册。
     *
     * 参数：
     *   无
     *
     * 返回：
     *   void：无返回值
     */
    private pruneLegacyConsumerSnapshots(): void {
        const settings = this.readSettings() as LLMHubSettings & { consumerSnapshots?: unknown };
        if (!Object.prototype.hasOwnProperty.call(settings, 'consumerSnapshots')) {
            return;
        }
        const nextSettings = { ...settings } as LLMHubSettings & { consumerSnapshots?: unknown };
        delete nextSettings.consumerSnapshots;
        this.writeSettings(nextSettings);
        logger.info('[注册中心] 已移除历史 consumerSnapshots 持久化快照。');
    }

    public async applySettingsFromContext(): Promise<void> {
        const settings = this.readSettings();

        if (settings.globalProfile) {
            try {
                this.sdk.setGlobalProfile(settings.globalProfile);
            } catch (error) {
                logger.warn(`非法 profile "${settings.globalProfile}"，保持默认配置。`, error);
            }
        }

        const enabledResources = (settings.resources || []).filter((cfg: ResourceConfig) => cfg.enabled !== false);
        const nextResourceIds = new Set<string>(enabledResources.map((cfg: ResourceConfig) => cfg.id));

        // 移除不再存在的资源（但保留内置酒馆）
        for (const resourceId of this.managedResourceIds) {
            if (!nextResourceIds.has(resourceId)) {
                this.router.removeProvider(resourceId);
            }
        }

        for (const cfg of enabledResources) {
            await this.upsertResource(cfg);
        }
        this.managedResourceIds = nextResourceIds;

        this.router.applyGlobalAssignments(settings.globalAssignments || {});
        this.router.applyPluginAssignments(settings.pluginAssignments || []);
        this.router.applyTaskAssignments(settings.taskAssignments || []);

        if (settings.budgets) {
            for (const [consumer, config] of Object.entries(settings.budgets)) {
                this.budgetManager.setConfig(consumer, config);
            }
        }

        if (settings.silentPermissions) {
            this.displayController.restoreSilentPermissions(settings.silentPermissions);
        }

        this.updateSharedSignals();
        this.persistChatSnapshot();
    }

    public async saveCredential(resourceId: string, apiKey: string): Promise<void> {
        await this.vault.setCredential(resourceId, apiKey);
        const settings = this.readSettings();
        const cfg = settings.resources?.find((item: ResourceConfig) => item.id === resourceId);
        if (!cfg) return;
        await this.upsertResource(cfg);
    }

    public async removeCredential(resourceId: string): Promise<void> {
        await this.vault.removeCredential(resourceId);
    }

    public async clearAllCredentials(): Promise<void> {
        const resourceIds = await this.vault.listResourceIds();
        for (const resourceId of resourceIds) {
            await this.vault.removeCredential(resourceId);
        }
    }

    public setBudgetConfig(consumer: string, config: BudgetConfig): void {
        this.budgetManager.setConfig(consumer, config);
        const settings = this.readSettings();
        const budgets = settings.budgets || {};
        budgets[consumer] = config;
        this.writeSettings({ ...settings, budgets });
    }

    public removeBudgetConfig(consumer: string): void {
        this.budgetManager.removeConfig(consumer);
        const settings = this.readSettings();
        const budgets = { ...(settings.budgets || {}) };
        delete budgets[consumer];
        this.writeSettings({ ...settings, budgets });
    }

    public async listRequestLogs(opts?: LLMRequestLogQueryOptions): Promise<LLMRequestLogEntry[]> {
        return this.requestLogService.listLogs(opts);
    }

    public async clearRequestLogs(): Promise<number> {
        return this.requestLogService.clearLogs();
    }

    private buildInspectApi(): LLMInspectApi {
        return {
            getStatusSnapshot: (): Promise<LLMHubStatusSnapshot> => this.getStatusSnapshot(),
            previewRoute: (args: RouteResolveArgs): Promise<RoutePreviewSnapshot> => this.previewRoute(args),
        };
    }

    public async getStatusSnapshot(): Promise<LLMHubStatusSnapshot> {
        const settings = this.readSettings();

        const builtinTavern: ResourceStatusSnapshot = {
            resourceId: BUILTIN_TAVERN_RESOURCE_ID,
            resourceLabel: '酒馆直连（内置）',
            resourceType: 'generation',
            source: 'tavern',
            enabled: true,
            credentialConfigured: true,
            builtin: true,
        };

        const userResources = await Promise.all((settings.resources || []).map(
            async (cfg: ResourceConfig): Promise<ResourceStatusSnapshot> => ({
                resourceId: cfg.id,
                resourceLabel: cfg.label || cfg.id,
                resourceType: cfg.type,
                source: cfg.source,
                enabled: cfg.enabled !== false,
                baseUrl: cfg.baseUrl,
                model: cfg.model,
                credentialConfigured: cfg.source === 'tavern' ? true : await this.vault.hasCredential(cfg.id),
                builtin: false,
            }),
        ));

        const resources = [builtinTavern, ...userResources];

        const generation = await this.previewRoute({
            consumer: 'stx_llmhub',
            taskKind: 'generation',
            requiredCapabilities: ['chat', 'json'],
        });
        const embedding = await this.previewRoute({
            consumer: 'stx_llmhub',
            taskKind: 'embedding',
            requiredCapabilities: ['embeddings'],
        });
        const rerank = await this.previewRoute({
            consumer: 'stx_llmhub',
            taskKind: 'rerank',
            requiredCapabilities: ['rerank'],
        });

        return {
            resources,
            globalProfile: settings.globalProfile,
            globalAssignments: settings.globalAssignments || {},
            pluginAssignments: settings.pluginAssignments || [],
            taskAssignments: settings.taskAssignments || [],
            readiness: {
                generation: generation.available,
                embedding: embedding.available,
                rerank: rerank.available,
            },
        };
    }

    public async previewRoute(args: RouteResolveArgs): Promise<RoutePreviewSnapshot> {
        const settings = this.readSettings();
        const requiredCapabilities = args.requiredCapabilities || [];

        if (settings.enabled === false) {
            return {
                consumer: args.consumer,
                taskKind: args.taskKind,
                taskId: args.taskId,
                requiredCapabilities,
                available: false,
                blockedReason: 'LLMHub 未启用',
            };
        }

        try {
            const resolved = this.router.resolveRoute(args);
            const isBuiltin = resolved.resourceId === BUILTIN_TAVERN_RESOURCE_ID;
            const userResource = (settings.resources || []).find((item: ResourceConfig) => item.id === resolved.resourceId);

            let resourceLabel: string;
            let resourceType: ResourceType;
            let source: 'tavern' | 'custom';
            let blockedReason = '';

            if (isBuiltin) {
                resourceLabel = '酒馆直连（内置）';
                resourceType = 'generation';
                source = 'tavern';
            } else if (userResource) {
                resourceLabel = userResource.label || userResource.id;
                resourceType = userResource.type;
                source = userResource.source;

                if (userResource.enabled === false) {
                    blockedReason = `资源 ${resourceLabel} 已停用`;
                } else if (userResource.source !== 'tavern' && !(await this.vault.hasCredential(resolved.resourceId))) {
                    blockedReason = `资源 ${resourceLabel} 未配置 API Key`;
                }
            } else {
                resourceLabel = resolved.resourceId;
                resourceType = args.taskKind as ResourceType;
                source = 'custom';
                blockedReason = `未找到资源：${resolved.resourceId}`;
            }

            return {
                consumer: args.consumer,
                taskKind: args.taskKind,
                taskId: args.taskId,
                requiredCapabilities,
                available: blockedReason.length === 0,
                resourceId: resolved.resourceId,
                resourceLabel,
                resourceType,
                source,
                model: resolved.model || (userResource?.model),
                resolvedBy: resolved.resolvedBy,
                blockedReason: blockedReason || undefined,
            };
        } catch (error: unknown) {
            return {
                consumer: args.consumer,
                taskKind: args.taskKind,
                taskId: args.taskId,
                requiredCapabilities,
                available: false,
                blockedReason: String((error as Error)?.message || error),
            };
        }
    }

    private async setupDefaultProvider(): Promise<void> {
        await this.applySettingsFromContext();
    }

    private async upsertResource(cfg: ResourceConfig): Promise<void> {
        const capabilities = normalizeResourceCapabilities(cfg);
        const defaultModel = cfg.model || undefined;
        const apiType: ApiType = cfg.type === 'generation'
            ? cfg.apiType === 'deepseek'
                ? 'deepseek'
                : cfg.apiType === 'gemini'
                    ? 'gemini'
                    : cfg.apiType === 'claude'
                        ? 'claude'
                        : cfg.apiType === 'generic'
                            ? 'generic'
                            : 'openai'
            : 'openai';

        if (cfg.source === 'tavern') {
            const provider = new TavernProvider({ id: cfg.id });
            this.router.registerProvider(provider, cfg.type, capabilities, defaultModel);
            logger.info(`资源已刷新 (tavern): ${cfg.id}`);
            return;
        }

        const apiKey = (await this.vault.getCredential(cfg.id)) || '';

        if (cfg.type === 'rerank') {
            const provider = new CustomRerankProvider({
                id: cfg.id,
                apiKey,
                baseUrl: cfg.baseUrl || '',
                model: cfg.model,
                rerankPath: cfg.rerankPath,
                customParams: cfg.customParams,
            });
            this.router.registerProvider(provider, 'rerank', ['rerank'], defaultModel);
            logger.info(`资源已刷新 (rerank): ${cfg.id}`);
            return;
        }

        if (cfg.type === 'generation' && apiType === 'claude') {
            const provider = new ClaudeProvider({
                id: cfg.id,
                apiKey,
                baseUrl: cfg.baseUrl || 'https://api.anthropic.com/v1',
                model: cfg.model,
                customParams: cfg.customParams,
            });
            this.router.registerProvider(provider, 'generation', capabilities, defaultModel);
            logger.info(`资源已刷新 (claude): ${cfg.id}, model=${cfg.model}`);
            return;
        }

        if (cfg.type === 'generation' && apiType === 'gemini') {
            const provider = new GeminiProvider({
                id: cfg.id,
                apiKey,
                baseUrl: cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
                model: cfg.model,
                customParams: cfg.customParams,
            });
            this.router.registerProvider(provider, cfg.type, capabilities, defaultModel);
            logger.info(`资源已刷新 (gemini): ${cfg.id}, type=${cfg.type}, model=${cfg.model}`);
            return;
        }

        // 其余 generation / embedding 走 OpenAI 兼容层
        const provider = new OpenAIProvider({
            id: cfg.id,
            apiKey,
            baseUrl: cfg.baseUrl || 'https://api.openai.com/v1',
            model: cfg.model,
            apiType,
            enableRerank: capabilities.includes('rerank'),
            customParams: cfg.customParams,
        });
        this.router.registerProvider(provider, cfg.type, capabilities, defaultModel);
        logger.info(`资源已刷新: ${cfg.id}, type=${cfg.type}, apiType=${cfg.type === 'generation' ? apiType : 'n/a'}, model=${cfg.model}`);
    }

    private notifyMemoryOsBridgeReady(): void {
        const memoryOsPlugin = (window as any).MemoryOSPlugin as MemoryOsBridgeRuntime | undefined;
        if (!memoryOsPlugin || typeof memoryOsPlugin.refreshLlmBridgeRegistration !== 'function') {
            return;
        }
        try {
            const status = memoryOsPlugin.refreshLlmBridgeRegistration('LLMHub 挂载后主动通知');
            logger.info(`[LLMHub桥接] 已主动通知 MemoryOS 重试注册 consumer，结果: ${String(status || 'unknown')}`);
        } catch (error: unknown) {
            logger.warn('[LLMHub桥接] 主动通知 MemoryOS 补注册失败。', error);
        }
    }

    private registerToSTX(): void {
        const globalSTX = (window as any).STX;
        if (globalSTX) {
            globalSTX.llm = this.sdk;
            globalSTX.registry?.register?.(LLMHUB_MANIFEST);
            this.notifyMemoryOsBridgeReady();
            logger.success('成功将 LLMSDK 挂载到 STX 全局底座。');

            if (globalSTX.bus) {
                this.setupMicroserviceEndpoints(globalSTX.bus);
            }
        } else {
            logger.warn('未检测到 STX 全局底座，可能是 MemoryOS 未启动或加载顺序滞后。');
            setTimeout((): void => this.registerToSTX(), 1000);
        }
    }

    private setupMicroserviceEndpoints(_bus: any): void {
        respond('plugin:request:ping', 'stx_llmhub', async (): Promise<Record<string, unknown>> => {
            const settings = this.readSettings();
            return {
                alive: true,
                isEnabled: settings.enabled === true,
                version: manifestJson.version || '1.0.0',
                capabilities: ['rpc', 'llm', 'chat', 'completion', 'registry', 'orchestrator'],
            };
        });

        respond('plugin:request:hello', 'stx_llmhub', async (payload: unknown, rawReq: any): Promise<Record<string, unknown>> => {
            logger.info(`[RPC] 收到来自 ${rawReq.from} 的 Hello 问候`, payload);
            return { replyMsg: `您好 ${rawReq.from}，LLMHub 通信正常。` };
        });

        logger.info('已在 STXBus 挂载 [ping]/[hello] 端点。');

        setTimeout((): void => {
            const settings = this.readSettings();
            (window as any).STX?.bus?.emit('plugin:broadcast:state_changed', {
                v: 1,
                type: 'broadcast',
                topic: 'plugin:broadcast:state_changed',
                from: 'stx_llmhub',
                ts: Date.now(),
                data: { isEnabled: settings.enabled === true },
            });
        }, 300);
    }

    private readSettings(): LLMHubSettings {
        try {
            const stContext = (window as any).SillyTavern?.getContext?.() || {};
            return (stContext.extensionSettings?.['stx_llmhub'] || {}) as LLMHubSettings;
        } catch {
            return {};
        }
    }

    private writeSettings(settings: LLMHubSettings): void {
        const stContext = (window as any).SillyTavern?.getContext?.() || {};
        if (!stContext.extensionSettings) {
            stContext.extensionSettings = {};
        }
        stContext.extensionSettings['stx_llmhub'] = settings;
        stContext.saveSettingsDebounced?.();
    }

    private updateSharedSignals(): void {
        const chatKey = buildSdkChatKeyEvent();
        if (!chatKey) return;

        const settings = this.readSettings();
        void this.previewRoute({
            consumer: 'stx_llmhub',
            taskKind: 'generation',
            requiredCapabilities: ['chat', 'json'],
        }).then((preview: RoutePreviewSnapshot) => {
            void patchSdkChatShared(chatKey, {
                signals: {
                    stx_llmhub: {
                        currentResource: preview.resourceId || '(none)',
                        currentModel: preview.model || '(none)',
                        profile: settings.globalProfile || 'balanced',
                    },
                },
            });
        });
    }

    private persistChatSnapshot(): void {
        const chatKey = buildSdkChatKeyEvent();
        if (!chatKey) return;

        const settings = this.readSettings();
        void this.previewRoute({
            consumer: 'stx_llmhub',
            taskKind: 'generation',
            requiredCapabilities: ['chat', 'json'],
        }).then(async (preview: RoutePreviewSnapshot) => {
            const existing = await readSdkPluginChatState('stx_llmhub', chatKey);
            const looksLikeLegacyNestedState = typeof existing?.state?.state === 'object'
                || typeof existing?.state?.summary === 'object';

            if (looksLikeLegacyNestedState) {
                await deleteSdkPluginChatState('stx_llmhub', chatKey);
            }

            await writeSdkPluginChatState(
                'stx_llmhub',
                chatKey,
                {
                    routeSnapshot: {
                        globalAssignments: settings.globalAssignments || {},
                        pluginAssignments: settings.pluginAssignments || [],
                        taskAssignments: settings.taskAssignments || [],
                    },
                    budgetSnapshot: settings.budgets || {},
                    profile: settings.globalProfile || 'balanced',
                },
                {
                    schemaVersion: 2,
                    summary: {
                        resource: preview.resourceId || '(none)',
                        model: preview.model || '(none)',
                    },
                },
            );
        });
    }
}

startLLMHubRuntime({
    runtimeFactory: (): LLMHub => new LLMHub(),
    renderUi: (): Promise<void> => renderSettingsUi(),
    onRenderUiError: (error: unknown): void => {
        logger.error('UI 渲染失败', error);
    },
});
