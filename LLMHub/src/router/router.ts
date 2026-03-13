import type { LLMProvider } from '../providers/types';

/**
 * 功能：路由策略配置。
 */
export interface RoutePolicy {
    consumer: string;
    task: string;
    providerId: string;
    profileId?: string;
    fallbackProviderId?: string;
}

/**
 * 功能：任务路由器，按 consumer + task 解析 Provider。
 */
export class TaskRouter {
    private providers: Map<string, LLMProvider> = new Map();
    private policies: RoutePolicy[] = [];
    private defaultProviderId: string | null = null;

    /**
     * 功能：注册 Provider。
     * @param provider Provider 实例。
     * @returns 无返回值。
     */
    registerProvider(provider: LLMProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * 功能：移除 Provider。
     * @param providerId Provider 标识。
     * @returns 无返回值。
     */
    removeProvider(providerId: string): void {
        this.providers.delete(providerId);
    }

    /**
     * 功能：新增或覆盖路由策略。
     * @param policy 路由策略。
     * @returns 无返回值。
     */
    addPolicy(policy: RoutePolicy): void {
        const existingIndex: number = this.policies.findIndex(
            (item: RoutePolicy) => item.consumer === policy.consumer && item.task === policy.task
        );
        if (existingIndex >= 0) {
            this.policies.splice(existingIndex, 1, policy);
            return;
        }
        this.policies.push(policy);
    }

    /**
     * 功能：批量替换路由策略。
     * @param policies 路由策略数组。
     * @returns 无返回值。
     */
    setPolicies(policies: RoutePolicy[]): void {
        this.policies = [...policies];
    }

    /**
     * 功能：清空路由策略。
     * @returns 无返回值。
     */
    clearPolicies(): void {
        this.policies = [];
    }

    /**
     * 功能：设置全局默认 Provider。
     * @param providerId Provider 标识。
     * @returns 无返回值。
     */
    setDefault(providerId: string): void {
        this.defaultProviderId = providerId;
    }

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
    /**
     * 功能：解析路由，优先级为 routeHint > consumer+task > consumer+* > *+task > default。
     * @param consumer 调用方标识。
     * @param task 任务标识。
     * @param opts 可选路由提示。
     * @returns 主 Provider、备 Provider 与 profile 信息。
     */
    resolve(
        consumer: string,
        task: string,
        opts?: { providerId?: string }
    ): {
        primary: LLMProvider;
        fallback: LLMProvider | null;
        profileId?: string;
    } {
        const matched: RoutePolicy | undefined = this.findMatchedPolicy(consumer, task);
        const primaryId: string | null = opts?.providerId || matched?.providerId || this.defaultProviderId;
        if (!primaryId) {
            throw new Error(`[TaskRouter] 无法为 consumer="${consumer}" task="${task}" 找到可用 Provider`);
        }

        const primary: LLMProvider | undefined = this.providers.get(primaryId);
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
     * 功能：获取全部 Provider。
     * @returns Provider 列表。
     */
    getAllProviders(): LLMProvider[] {
        return Array.from(this.providers.values());
    }

    /**
     * 功能：按 providerId 获取 Provider。
     * @param providerId Provider 标识。
     * @returns Provider 或 undefined。
     */
    getProvider(providerId: string): LLMProvider | undefined {
        return this.providers.get(providerId);
    }

    /**
     * 功能：按优先级查找策略。
     * @param consumer 调用方标识。
     * @param task 任务标识。
     * @returns 命中的策略或 undefined。
     */
    private findMatchedPolicy(consumer: string, task: string): RoutePolicy | undefined {
        return (
            this.findPolicy([consumer], task) ||
            this.findPolicy([consumer], '*') ||
            this.policies.find((policy: RoutePolicy) => policy.consumer === '*' && policy.task === task)
        );
    }

    /**
     * 功能：在候选 consumer 列表中查找 task 命中的策略。
     * @param consumers consumer 候选列表。
     * @param task 任务标识。
     * @returns 命中的策略或 undefined。
     */
    private findPolicy(consumers: string[], task: string): RoutePolicy | undefined {
        if (!consumers.length) {
            return undefined;
        }
        const consumerSet: Set<string> = new Set(consumers);
        return this.policies.find(
            (policy: RoutePolicy) => consumerSet.has(policy.consumer) && policy.task === task
        );
    }
}
