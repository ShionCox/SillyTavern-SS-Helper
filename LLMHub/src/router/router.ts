import type { LLMProvider } from '../providers/types';

/**
 * 路由策略配置
 */
export interface RoutePolicy {
    consumer: string;   // pluginId
    task: string;       // 任务名称
    providerId: string; // 指定使用的 provider
    profileId?: string; // 可选的参数组合
    fallbackProviderId?: string; // 备用 provider
}

/**
 * 任务路由器 —— 根据 consumer + task 解析到合适的 LLMProvider
 * 路由优先级：
 *   1. consumer + task 精确匹配
 *   2. task 默认
 *   3. 全局 default
 */
export class TaskRouter {
    private providers: Map<string, LLMProvider> = new Map();
    private policies: RoutePolicy[] = [];
    private defaultProviderId: string | null = null;

    /**
     * 注册一个 Provider
     */
    registerProvider(provider: LLMProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * 移除一个 Provider
     */
    removeProvider(providerId: string): void {
        this.providers.delete(providerId);
    }

    /**
     * 添加路由策略
     */
    addPolicy(policy: RoutePolicy): void {
        const existingIndex = this.policies.findIndex(
            p => p.consumer === policy.consumer && p.task === policy.task
        );
        if (existingIndex >= 0) {
            this.policies.splice(existingIndex, 1, policy);
            return;
        }
        this.policies.push(policy);
    }

    /**
     * 批量替换路由策略
     */
    setPolicies(policies: RoutePolicy[]): void {
        this.policies = [...policies];
    }

    /**
     * 清空全部策略
     */
    clearPolicies(): void {
        this.policies = [];
    }

    /**
     * 设置全局默认 Provider
     */
    setDefault(providerId: string): void {
        this.defaultProviderId = providerId;
    }

    /**
     * 解析路由：根据 consumer + task 匹配到 Provider
     * @returns [主 provider, 备用 provider | null]
     */
    resolve(consumer: string, task: string): {
        primary: LLMProvider;
        fallback: LLMProvider | null;
        profileId?: string;
    };
    resolve(
        consumer: string,
        task: string,
        opts: { providerId?: string }
    ): {
        primary: LLMProvider;
        fallback: LLMProvider | null;
        profileId?: string;
    };
    resolve(
        consumer: string,
        task: string,
        opts?: { providerId?: string }
    ): {
        primary: LLMProvider;
        fallback: LLMProvider | null;
        profileId?: string;
    } {
        // 1. 精确匹配 consumer + task
        let matched = this.policies.find(
            p => p.consumer === consumer && p.task === task
        );

        // 2. 仅匹配 task（任意 consumer）
        if (!matched) {
            matched = this.policies.find(
                p => p.consumer === '*' && p.task === task
            );
        }

        // 3. routeHint 优先，其次策略匹配，再其次全局默认
        const primaryId = opts?.providerId || matched?.providerId || this.defaultProviderId;
        if (!primaryId) {
            throw new Error(`[TaskRouter] 无法为 consumer="${consumer}" task="${task}" 找到可用的 Provider`);
        }

        const primary = this.providers.get(primaryId);
        if (!primary) {
            throw new Error(`[TaskRouter] Provider ID "${primaryId}" 未注册`);
        }

        let fallback: LLMProvider | null = null;
        if (matched?.fallbackProviderId) {
            fallback = this.providers.get(matched.fallbackProviderId) ?? null;
        }

        return { primary, fallback, profileId: matched?.profileId };
    }

    /**
     * 获取所有已注册的 Provider
     */
    getAllProviders(): LLMProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * 按 providerId 获取 provider 实例
     */
    getProvider(providerId: string): LLMProvider | undefined {
        return this.providers.get(providerId);
    }
}
