/**
 * LLMHub 统一入口
 * 导出所有公共模块，供外部引用
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

// SDK 门面层
// UI 层
export { renderSettingsUi as renderLLMHubSettings } from './ui/index';
import { renderSettingsUi } from './ui/index';
import { Logger } from '../../SDK/logger';
import { TaskRouter } from './router/router';
import { BudgetManager } from './budget/budget-manager';
import { LLMSDKImpl } from './sdk/llm-sdk';
import { OpenAIProvider } from './providers/openai-provider';

const logger = new Logger('LLMHub');

class LLMHub {
    public router: TaskRouter;
    public budgetManager: BudgetManager;
    public sdk: LLMSDKImpl;

    constructor() {
        logger.info('LLM Hub 核心引擎初始化...');

        // 1. 初始化中间件管理器
        this.router = new TaskRouter();
        this.budgetManager = new BudgetManager();
        this.sdk = new LLMSDKImpl(this.router, this.budgetManager);

        // 2. 预置一个基于 OpenAI 兼容协议的基础 Provider（后续参数可由 UI Settings 取出）
        const defaultProvider = new OpenAIProvider({
            id: 'default-openai',
            apiKey: 'sk-placeholder',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini'
        });

        this.router.registerProvider(defaultProvider);
        this.router.setDefault('default-openai');

        // 3. 尝试向全局的 STX 总线注册 LLM 服务
        this.registerToSTX();
    }

    private registerToSTX() {
        const globalSTX = (window as any).STX;
        if (globalSTX) {
            globalSTX.llm = this.sdk;
            logger.success('成功将 LLMSDK 挂载至 STX 全局底座。');
        } else {
            logger.warn('未检测到 STX 全局底座！可能是 MemoryOS 未启动或加载顺序滞后。');
            setTimeout(() => this.registerToSTX(), 1000);
        }
    }
}

// 模拟插件环境挂载
(window as any).LLMHubPlugin = new LLMHub();

// 自动初始化 UI 挂载
if (typeof document !== 'undefined') {
    renderSettingsUi().catch(err => {
        logger.error('UI rendering failed:', err);
    });
}
