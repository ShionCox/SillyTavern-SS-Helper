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

// 路由器
export { TaskRouter } from './router/router';
export type { RoutePolicy } from './router/router';

// 预算与熔断
export { BudgetManager } from './budget/budget-manager';
export type { BudgetConfig } from './budget/budget-manager';

// Profile 配置层
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

export const logger = new Logger('AI 调度中枢');
export const toast = new Toast('AI 调度中枢');
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

    constructor() {
        logger.info('AI 调度中枢核心引擎初始化...');
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
     * 从设置中刷新完整运行时配置。
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
     * 保存指定服务凭据，并立即刷新 Provider。
     */
    public async saveCredential(providerId: string, apiKey: string): Promise<void> {
        await this.vault.setCredential(providerId, apiKey);
        const settings = this.readSettings();
        const model = settings.defaultModel || this.defaultModel;
        const baseUrl = settings.defaultBaseUrl || this.resolveBaseUrl(providerId);
        await this.upsertProvider(providerId, model, baseUrl);
    }

    /**
     * 清理全部凭据。
     */
    public async clearAllCredentials(): Promise<void> {
        const providerIds = await this.vault.listProviderIds();
        for (const providerId of providerIds) {
            await this.vault.removeCredential(providerId);
        }
    }

    /**
     * 设置默认 provider/model/baseUrl，并立即生效。
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
     * 写入路由策略。
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
     * 写入预算配置。
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
     * 删除单个 consumer 的预算配置。
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

    private async setupDefaultProvider(): Promise<void> {
        await this.upsertProvider(this.defaultProvider, this.defaultModel, this.defaultBaseUrl);
        this.router.setDefault(this.defaultProvider);
        await this.applySettingsFromContext();
    }

    /**
     * 注册或覆盖一个 OpenAI 兼容 Provider。
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

    private resolveBaseUrl(providerId: string): string {
        const map: Record<string, string> = {
            openai: 'https://api.openai.com/v1',
            claude: 'https://api.anthropic.com/v1',
            gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
            groq: 'https://api.groq.com/openai/v1',
        };
        return map[providerId] || 'https://api.openai.com/v1';
    }

    private registerToSTX(): void {
        const globalSTX = (window as any).STX;
        if (globalSTX) {
            globalSTX.llm = this.sdk;
            logger.success('成功将 LLMSDK 挂载至 STX 全局底座。');

            if (globalSTX.bus) {
                this.setupMicroserviceEndpoints(globalSTX.bus);
            }
        } else {
            logger.warn('未检测到 STX 全局底座！可能是 MemoryOS 未启动或加载顺序滞后。');
            setTimeout(() => this.registerToSTX(), 1000);
        }
    }

    private setupMicroserviceEndpoints(bus: any): void {
        respond('plugin:request:ping', 'stx_llmhub', async () => {
            const settings = this.readSettings();
            return {
                alive: true,
                isEnabled: settings.enabled === true,
                version: '1.0.0',
                capabilities: ['rpc', 'llm', 'chat', 'completion'],
            };
        });

        respond('plugin:request:hello', 'stx_llmhub', async (payload, rawReq) => {
            logger.info(`[RPC] 收到来自 ${rawReq.from} 的 Hello 问候`, payload);
            return {
                replyMsg: `您好，${rawReq.from}，LLMHub 通信正常。`,
            };
        });

        logger.info('已在 STXBus 挂载 [ping]/[hello] 端点。');

        setTimeout(() => {
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
            return;
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
