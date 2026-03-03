/**
 * LLMHub 统一入口
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
} from './providers/types';
export { OpenAIProvider } from './providers/openai-provider';

// 路由层
export { TaskRouter } from './router/router';
export type { RoutePolicy } from './router/router';

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

// UI 层
export { renderSettingsUi as renderLLMHubSettings } from './ui/index';
import { renderSettingsUi } from './ui/index';

import { respond } from '../../SDK/bus/rpc';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';
import { TaskRouter, type RoutePolicy } from './router/router';
import { BudgetManager, type BudgetConfig } from './budget/budget-manager';
import { LLMSDKImpl } from './sdk/llm-sdk';
import { OpenAIProvider } from './providers/openai-provider';
import { VaultManager } from './vault/vault-manager';
import type { PluginManifest } from '../../SDK/stx';
import { ensureSharedUnoStyles } from '../../SDK/sharedUno';
import manifestJson from '../manifest.json';

export const logger = new Logger('AI 调度中枢');
export const toast = new Toast('AI 调度中枢');
ensureSharedUnoStyles();
export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

type LLMHubSettings = {
    enabled?: boolean;
    globalProfile?: string;
    defaultProvider?: string;
    defaultModel?: string;
    defaultBaseUrl?: string;
    routePolicies?: RoutePolicy[];
    budgets?: Record<string, BudgetConfig>;
};

const LLMHUB_MANIFEST: PluginManifest = {
    pluginId: 'stx_llmhub',
    name: 'LLMHub',
    displayName: manifestJson.display_name || 'SS-Helper [AI 调度中枢]',
    version: manifestJson.version || '1.0.0',
    capabilities: {
        events: ['plugin:request:ping', 'plugin:request:hello'],
        memory: [],
        llm: ['runTask', 'embed', 'rerank', 'route'],
    },
    scopes: ['llm', 'router', 'budget'],
    requiresSDK: '^1.0.0',
    source: 'manifest_json',
};

/**
 * LLMHub Runtime
 * 提供 UI 可调用的配置写入能力，确保设置项不是占位逻辑。
 */
class LLMHub {
    public router: TaskRouter;
    public budgetManager: BudgetManager;
    public sdk: LLMSDKImpl;
    public vault: VaultManager;

    private defaultProvider: string = 'openai';
    private defaultModel: string = 'gpt-4o-mini';
    private defaultBaseUrl: string = 'https://api.openai.com/v1';

    /**
     * 功能：初始化 LLMHub 运行时并完成基础挂载。
     * 参数：
     *   无
     * 返回：
     *   无
     */
    constructor() {
        logger.info('AI 调度中枢核心引擎初始化完成。');
        this.router = new TaskRouter();
        this.budgetManager = new BudgetManager();
        this.sdk = new LLMSDKImpl(this.router, this.budgetManager);
        this.vault = new VaultManager();

        this.registerToSTX();
        this.setupDefaultProvider().catch((error: unknown) => {
            logger.warn('初始化默认 Provider 失败，后续将等待设置页注入配置。', error);
        });
    }

    /**
     * 功能：从设置中刷新完整运行时配置。
     * 参数：
     *   无
     * 返回：
     *   Promise<void>
     */
    public async applySettingsFromContext(): Promise<void> {
        const settings = this.readSettings();

        if (settings.globalProfile) {
            try {
                this.sdk.setGlobalProfile(settings.globalProfile);
            } catch (error) {
                logger.warn(`非法 profile "${settings.globalProfile}"，保持默认配置。`, error);
            }
        }

        const providerId = settings.defaultProvider || this.defaultProvider;
        const model = settings.defaultModel || this.defaultModel;
        const baseUrl = settings.defaultBaseUrl || this.resolveBaseUrl(providerId);
        await this.upsertProvider(providerId, model, baseUrl);
        this.router.setDefault(providerId);

        if (Array.isArray(settings.routePolicies)) {
            this.router.setPolicies(settings.routePolicies);
        }

        if (settings.budgets) {
            for (const [consumer, config] of Object.entries(settings.budgets)) {
                this.budgetManager.setConfig(consumer, config);
            }
        }
    }

    /**
     * 功能：保存指定服务凭据，并立即刷新 Provider。
     * 参数：
     *   providerId: 服务提供方 ID
     *   apiKey: 凭据内容
     * 返回：
     *   Promise<void>
     */
    public async saveCredential(providerId: string, apiKey: string): Promise<void> {
        await this.vault.setCredential(providerId, apiKey);
        const settings = this.readSettings();
        const model = settings.defaultModel || this.defaultModel;
        const baseUrl = settings.defaultBaseUrl || this.resolveBaseUrl(providerId);
        await this.upsertProvider(providerId, model, baseUrl);
    }

    /**
     * 功能：清理全部凭据。
     * 参数：
     *   无
     * 返回：
     *   Promise<void>
     */
    public async clearAllCredentials(): Promise<void> {
        const providerIds = await this.vault.listProviderIds();
        for (const providerId of providerIds) {
            await this.vault.removeCredential(providerId);
        }
    }

    /**
     * 功能：设置默认 provider/model/baseUrl，并立即生效。
     * 参数：
     *   providerId: 默认 Provider ID
     *   model: 默认模型名
     *   baseUrl: 可选基础地址
     * 返回：
     *   Promise<void>
     */
    public async setDefaultRoute(providerId: string, model: string, baseUrl?: string): Promise<void> {
        const finalBaseUrl = (baseUrl || '').trim() || this.resolveBaseUrl(providerId);
        await this.upsertProvider(providerId, model, finalBaseUrl);
        this.router.setDefault(providerId);

        const settings = this.readSettings();
        this.writeSettings({
            ...settings,
            defaultProvider: providerId,
            defaultModel: model,
            defaultBaseUrl: finalBaseUrl,
        });
    }

    /**
     * 功能：写入路由策略。
     * 参数：
     *   policies: 路由策略列表
     * 返回：
     *   void
     */
    public setRoutePolicies(policies: RoutePolicy[]): void {
        this.router.setPolicies(policies);
        const settings = this.readSettings();
        this.writeSettings({
            ...settings,
            routePolicies: policies,
        });
    }

    /**
     * 功能：写入预算配置。
     * 参数：
     *   consumer: 使用方标识
     *   config: 预算配置
     * 返回：
     *   void
     */
    public setBudgetConfig(consumer: string, config: BudgetConfig): void {
        this.budgetManager.setConfig(consumer, config);
        const settings = this.readSettings();
        const budgets = settings.budgets || {};
        budgets[consumer] = config;
        this.writeSettings({
            ...settings,
            budgets,
        });
    }

    /**
     * 功能：删除单个 consumer 的预算配置。
     * 参数：
     *   consumer: 使用方标识
     * 返回：
     *   void
     */
    public removeBudgetConfig(consumer: string): void {
        this.budgetManager.removeConfig(consumer);
        const settings = this.readSettings();
        const budgets = { ...(settings.budgets || {}) };
        delete budgets[consumer];
        this.writeSettings({
            ...settings,
            budgets,
        });
    }

    /**
     * 功能：设置默认 Provider 并应用当前设置。
     * 参数：
     *   无
     * 返回：
     *   Promise<void>
     */
    private async setupDefaultProvider(): Promise<void> {
        await this.upsertProvider(this.defaultProvider, this.defaultModel, this.defaultBaseUrl);
        this.router.setDefault(this.defaultProvider);
        await this.applySettingsFromContext();
    }

    /**
     * 功能：注册或覆盖一个 OpenAI 兼容 Provider。
     * 参数：
     *   providerId: Provider ID
     *   model: 模型名
     *   baseUrl: 接口基础地址
     * 返回：
     *   Promise<void>
     */
    private async upsertProvider(providerId: string, model: string, baseUrl: string): Promise<void> {
        const apiKey = (await this.vault.getCredential(providerId)) || '';
        const provider = new OpenAIProvider({
            id: providerId,
            apiKey,
            baseUrl,
            model,
        });
        this.router.registerProvider(provider);
        logger.info(`Provider 已刷新: ${providerId}, model=${model}, baseUrl=${baseUrl}`);
    }

    /**
     * 功能：根据 Provider ID 解析默认 Base URL。
     * 参数：
     *   providerId: Provider ID
     * 返回：
     *   默认 Base URL
     */
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
     * 功能：将 SDK 挂载到 STX 全局对象并注册微服务端点。
     * 参数：
     *   无
     * 返回：
     *   void
     */
    private registerToSTX(): void {
        const globalSTX = (window as any).STX;
        if (globalSTX) {
            globalSTX.llm = this.sdk;
            globalSTX.registry?.register?.(LLMHUB_MANIFEST);
            logger.success('成功将 LLMSDK 挂载到 STX 全局底座。');

            if (globalSTX.bus) {
                this.setupMicroserviceEndpoints(globalSTX.bus);
            }
        } else {
            logger.warn('未检测到 STX 全局底座，可能是 MemoryOS 未启动或加载顺序滞后。');
            setTimeout((): void => this.registerToSTX(), 1000);
        }
    }

    /**
     * 功能：注册 RPC 端点并广播状态。
     * 参数：
     *   bus: STX 事件总线
     * 返回：
     *   void
     */
    private setupMicroserviceEndpoints(bus: any): void {
        respond('plugin:request:ping', 'stx_llmhub', async (): Promise<Record<string, unknown>> => {
            const settings = this.readSettings();
            return {
                alive: true,
                isEnabled: settings.enabled === true,
                version: '1.0.0',
                capabilities: ['rpc', 'llm', 'chat', 'completion'],
            };
        });

        respond('plugin:request:hello', 'stx_llmhub', async (payload: unknown, rawReq: any): Promise<Record<string, unknown>> => {
            logger.info(`[RPC] 收到来自 ${rawReq.from} 的 Hello 问候`, payload);
            return {
                replyMsg: `您好 ${rawReq.from}，LLMHub 通信正常。`,
            };
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

    /**
     * 功能：读取 LLMHub 配置。
     * 参数：
     *   无
     * 返回：
     *   LLMHubSettings
     */
    private readSettings(): LLMHubSettings {
        try {
            const stContext = (window as any).SillyTavern?.getContext?.() || {};
            return (stContext.extensionSettings?.['stx_llmhub'] || {}) as LLMHubSettings;
        } catch {
            return {};
        }
    }

    /**
     * 功能：写入 LLMHub 配置并触发保存。
     * 参数：
     *   settings: 待写入配置
     * 返回：
     *   void
     */
    private writeSettings(settings: LLMHubSettings): void {
        const stContext = (window as any).SillyTavern?.getContext?.() || {};
        if (!stContext.extensionSettings) {
            stContext.extensionSettings = {};
        }
        stContext.extensionSettings['stx_llmhub'] = settings;
        stContext.saveSettingsDebounced?.();
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