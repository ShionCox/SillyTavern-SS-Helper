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
export { TavernProvider } from './providers/tavern-provider';

// 路由层
export { TaskRouter } from './router/router';

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
    LLMRunMeta,
    LLMRunResult,
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
    GlobalCapabilityDefault,
    PluginCapabilityDefault,
    TaskOverride,
    SilentPermissionGrant,
    LLMHubSettings,
    ProviderConfig,
    RunTaskArgs,
    EmbedArgs,
    RerankArgs,
} from './schema/types';

// UI 层
export { renderSettingsUi as renderLLMHubSettings } from './ui/index';
import { renderSettingsUi } from './ui/index';

import { respond } from '../../SDK/bus/rpc';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';
import { patchSdkChatShared, writeSdkPluginChatState } from '../../SDK/db';
import { buildSdkChatKeyEvent } from '../../SDK/tavern';
import { TaskRouter } from './router/router';
import { BudgetManager, type BudgetConfig } from './budget/budget-manager';
import { LLMSDKImpl } from './sdk/llm-sdk';
import { OpenAIProvider } from './providers/openai-provider';
import { TavernProvider } from './providers/tavern-provider';
import { VaultManager } from './vault/vault-manager';
import { ConsumerRegistry } from './registry/consumer-registry';
import { RequestOrchestrator } from './orchestrator/orchestrator';
import { DisplayController } from './display/display-controller';
import type { PluginManifest } from '../../SDK/stx';
import type { LLMHubSettings, ProviderConfig } from './schema/types';
import manifestJson from '../manifest.json';

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

/**
 * LLMHub Runtime — 四层架构
 * 第一层：ConsumerRegistry（注册中心）
 * 第二层：TaskRouter（路由解析器）
 * 第三层：RequestOrchestrator（请求编排器）
 * 第四层：DisplayController（展示控制器）
 *
 * LLMSDKImpl 作为统一入口门面，整合四层。
 */
class LLMHub {
    // ─── 四层核心 ───
    public registry: ConsumerRegistry;
    public router: TaskRouter;
    public orchestrator: RequestOrchestrator;
    public displayController: DisplayController;

    // ─── 辅助层 ───
    public budgetManager: BudgetManager;
    public sdk: LLMSDKImpl;
    public vault: VaultManager;

    constructor() {
        logger.info('AI 调度中枢核心引擎初始化（四层架构）...');

        // 第一层：注册中心
        this.registry = new ConsumerRegistry();

        // 第二层：路由解析器
        this.router = new TaskRouter();
        this.router.setRegistry(this.registry);

        // 辅助层
        this.budgetManager = new BudgetManager();
        this.vault = new VaultManager();

        // 第三层：编排器
        this.orchestrator = new RequestOrchestrator();

        // 第四层：展示控制器
        this.displayController = new DisplayController();

        // 门面层
        this.sdk = new LLMSDKImpl(
            this.router,
            this.budgetManager,
            this.orchestrator,
            this.displayController,
            this.registry,
        );

        // 连接注册中心持久化
        this.registry.setPersistCallback((snapshots) => {
            const settings = this.readSettings();
            this.writeSettings({ ...settings, consumerSnapshots: snapshots });
        });

        // 连接 Provider 能力查询
        this.registry.setProviderCapabilityQuery((providerId) => {
            return this.router.getProviderCapabilities(providerId);
        });

        // 恢复持久数据
        this.restoreFromStorage();

        this.registerToSTX();
        this.setupDefaultProvider().catch((error: unknown) => {
            logger.warn('初始化默认 Provider 失败，后续将等待设置页注入配置。', error);
        });

        logger.success('AI 调度中枢四层架构初始化完成。');
    }

    /** 从持久存储恢复注册快照与 silent 权限 */
    private restoreFromStorage(): void {
        const settings = this.readSettings();
        if (settings.consumerSnapshots) {
            this.registry.restoreFromStorage(settings.consumerSnapshots);
        }
        if (settings.silentPermissions) {
            this.displayController.restoreSilentPermissions(settings.silentPermissions);
        }
        // 恢复分层路由设置
        if (settings.globalDefaults) {
            this.router.applyGlobalDefaults(settings.globalDefaults);
        }
        if (settings.pluginDefaults) {
            this.router.applyPluginDefaults(settings.pluginDefaults);
        }
        if (settings.taskOverrides) {
            this.router.applyTaskOverrides(settings.taskOverrides);
        }
    }

    public async applySettingsFromContext(): Promise<void> {
        const settings = this.readSettings();

        // ── 清除旧字段（硬切换，不迁移） ──
        const legacy = settings as Record<string, unknown>;
        const legacyKeys = ['defaultProvider', 'defaultModel', 'defaultBaseUrl', 'routePolicies'];
        const hadLegacy = legacyKeys.some(k => k in legacy);
        if (hadLegacy) {
            for (const k of legacyKeys) delete legacy[k];
            this.writeSettings(settings);
            logger.info('已清除旧版设置字段（defaultProvider/defaultModel/defaultBaseUrl/routePolicies）');
        }

        if (settings.globalProfile) {
            try {
                this.sdk.setGlobalProfile(settings.globalProfile);
            } catch (error) {
                logger.warn(`非法 profile "${settings.globalProfile}"，保持默认配置。`, error);
            }
        }

        // ── 多 Provider 配置条目 ──
        if (Array.isArray(settings.providers) && settings.providers.length > 0) {
            for (const cfg of settings.providers) {
                if (cfg.enabled === false) continue;
                const model = cfg.selectedModel || cfg.manualModel || cfg.model || '';
                const baseUrl = cfg.baseUrl || this.resolveBaseUrl(cfg.id);
                await this.upsertProvider(cfg.id, model, baseUrl, cfg.source, cfg.capabilities);
            }
        }

        // 分层路由设置
        if (settings.globalDefaults) {
            this.router.applyGlobalDefaults(settings.globalDefaults);
        }
        if (settings.pluginDefaults) {
            this.router.applyPluginDefaults(settings.pluginDefaults);
        }
        if (settings.taskOverrides) {
            this.router.applyTaskOverrides(settings.taskOverrides);
        }

        if (settings.budgets) {
            for (const [consumer, config] of Object.entries(settings.budgets)) {
                this.budgetManager.setConfig(consumer, config);
            }
        }

        // 恢复 silent 权限
        if (settings.silentPermissions) {
            this.displayController.restoreSilentPermissions(settings.silentPermissions);
        }

        this.updateSharedSignals();
        this.persistChatSnapshot();
    }

    public async saveCredential(providerId: string, apiKey: string): Promise<void> {
        await this.vault.setCredential(providerId, apiKey);
        const settings = this.readSettings();
        const cfg = settings.providers?.find(p => p.id === providerId);
        const model = cfg?.selectedModel || cfg?.manualModel || cfg?.model || '';
        const baseUrl = cfg?.baseUrl || this.resolveBaseUrl(providerId);
        await this.upsertProvider(providerId, model, baseUrl);
    }

    public async clearAllCredentials(): Promise<void> {
        const providerIds = await this.vault.listProviderIds();
        for (const providerId of providerIds) {
            await this.vault.removeCredential(providerId);
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

    private async setupDefaultProvider(): Promise<void> {
        await this.upsertProvider('tavern', '', '', 'tavern');
        await this.applySettingsFromContext();
    }

    private async upsertProvider(
        providerId: string,
        model: string,
        baseUrl: string,
        source: 'tavern' | 'custom' = 'custom',
        capabilities?: import('./schema/types').LLMCapability[],
    ): Promise<void> {
        if (source === 'tavern') {
            const provider = new TavernProvider({ id: providerId });
            this.router.registerProvider(provider, capabilities || ['chat', 'json']);
            logger.info(`Provider 已刷新 (tavern): ${providerId}`);
            return;
        }

        const apiKey = (await this.vault.getCredential(providerId)) || '';
        const provider = new OpenAIProvider({ id: providerId, apiKey, baseUrl, model });
        this.router.registerProvider(provider, capabilities || ['chat', 'json', 'tools', 'embeddings']);
        logger.info(`Provider 已刷新: ${providerId}, model=${model}, baseUrl=${baseUrl}`);
    }

    private resolveBaseUrl(providerId: string): string {
        const map: Record<string, string> = {
            openai: 'https://api.openai.com/v1',
            claude: 'https://api.anthropic.com/v1',
            gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
            groq: 'https://api.groq.com/openai/v1',
        };
        return map[providerId] || 'https://api.openai.com/v1';
    }

    /**
     * 功能：在 LLMHub 成功挂载到 STX 后主动通知 MemoryOS 补做 consumer 注册。
     * 返回：
     *   void：无返回值。
     */
    private notifyMemoryOsBridgeReady(): void {
        const memoryOsPlugin = (window as any).MemoryOSPlugin as MemoryOsBridgeRuntime | undefined;
        if (!memoryOsPlugin || typeof memoryOsPlugin.refreshLlmBridgeRegistration !== 'function') {
            logger.info('[LLMHub桥接] 未检测到 MemoryOS 的补注册链接，跳过主动通知。');
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

    private setupMicroserviceEndpoints(bus: any): void {
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
            bus.emit('plugin:broadcast:state_changed', {
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
        const genDefault = settings.globalDefaults?.find(d => d.capabilityKind === 'generation');
        void patchSdkChatShared(chatKey, {
            signals: {
                stx_llmhub: {
                    currentProvider: genDefault?.providerId || '(none)',
                    currentModel: genDefault?.model || '(none)',
                    profile: settings.globalProfile || 'balanced',
                },
            },
        });
    }

    private persistChatSnapshot(): void {
        const chatKey = buildSdkChatKeyEvent();
        if (!chatKey) return;

        const settings = this.readSettings();
        const genDefault = settings.globalDefaults?.find(d => d.capabilityKind === 'generation');
        void writeSdkPluginChatState('stx_llmhub', chatKey, {
            state: {
                routeSnapshot: {
                    globalDefaults: settings.globalDefaults || [],
                    pluginDefaults: settings.pluginDefaults || [],
                    taskOverrides: settings.taskOverrides || [],
                },
                budgetSnapshot: settings.budgets || {},
                profile: settings.globalProfile || 'balanced',
            },
            summary: {
                provider: genDefault?.providerId || '(none)',
                model: genDefault?.model || '(none)',
            },
        });
    }
}

// 挂载运行时
(window as any).LLMHubPlugin = new LLMHub();

// 自动初始化 UI
if (typeof document !== 'undefined') {
    renderSettingsUi().catch((error: unknown) => {
        logger.error('UI 渲染失败', error);
    });
}
