import type { LLMProvider } from '../providers/types';
import type {
    RouteResolveArgs,
    RouteResolveResult,
    LLMCapability,
    CapabilityKind,
    GlobalCapabilityDefault,
    PluginCapabilityDefault,
    TaskOverride,
    TaskDescriptor,
    RouteBinding,
} from '../schema/types';
import type { ConsumerRegistry } from '../registry/consumer-registry';

/**
 * 能力感知任务路由器
 *
 * 路由优先级：
 *   routeHint → 用户任务级覆盖 → 插件注册任务推荐 → 插件能力默认 → 全局能力默认 → fallback
 *
 * 所有合法性判断统一基于 LLMCapability，不写 Provider 名字级特判。
 */
export class TaskRouter {
    private providers: Map<string, LLMProvider> = new Map();
    /** Provider 声明的能力 */
    private providerCapabilities: Map<string, LLMCapability[]> = new Map();

    // 新版分层设置
    private globalDefaults: Map<CapabilityKind, GlobalCapabilityDefault> = new Map();
    private pluginDefaults: Map<string, PluginCapabilityDefault> = new Map(); // key: `${pluginId}::${capabilityKind}`
    private taskOverrides: Map<string, TaskOverride> = new Map(); // key: `${pluginId}::${taskId}`

    /** 外部注入注册中心引用 */
    private registry: ConsumerRegistry | null = null;

    setRegistry(registry: ConsumerRegistry): void {
        this.registry = registry;
    }

    // ─── Provider 管理 ───

    registerProvider(provider: LLMProvider, capabilities?: LLMCapability[]): void {
        this.providers.set(provider.id, provider);
        if (capabilities) {
            this.providerCapabilities.set(provider.id, capabilities);
        } else {
            // 从 provider.capabilities 推断
            const caps: LLMCapability[] = [];
            if (provider.capabilities.chat) caps.push('chat');
            if (provider.capabilities.json) caps.push('json');
            if (provider.capabilities.tools) caps.push('tools');
            if (provider.capabilities.embeddings) caps.push('embeddings');
            if (provider.capabilities.rerank) caps.push('rerank');
            this.providerCapabilities.set(provider.id, caps);
        }
    }

    removeProvider(providerId: string): void {
        this.providers.delete(providerId);
        this.providerCapabilities.delete(providerId);
    }

    // ─── 分层设置管理 ───

    setGlobalDefault(def: GlobalCapabilityDefault): void {
        this.globalDefaults.set(def.capabilityKind, def);
    }

    setPluginDefault(def: PluginCapabilityDefault): void {
        this.pluginDefaults.set(`${def.pluginId}::${def.capabilityKind}`, def);
    }

    setTaskOverride(override: TaskOverride): void {
        this.taskOverrides.set(`${override.pluginId}::${override.taskId}`, override);
    }

    removeTaskOverride(pluginId: string, taskId: string): void {
        this.taskOverrides.delete(`${pluginId}::${taskId}`);
    }

    applyGlobalDefaults(defaults: GlobalCapabilityDefault[]): void {
        this.globalDefaults.clear();
        for (const d of defaults) this.globalDefaults.set(d.capabilityKind, d);
    }

    applyPluginDefaults(defaults: PluginCapabilityDefault[]): void {
        this.pluginDefaults.clear();
        for (const d of defaults) this.pluginDefaults.set(`${d.pluginId}::${d.capabilityKind}`, d);
    }

    applyTaskOverrides(overrides: TaskOverride[]): void {
        this.taskOverrides.clear();
        for (const o of overrides) this.taskOverrides.set(`${o.pluginId}::${o.taskId}`, o);
    }

    // ─── 新版统一解析入口 ───

    /**
     * 统一路由解析。
     * 优先级：routeHint → 用户任务级覆盖 → 插件注册任务推荐 → 插件能力默认 → 全局能力默认 → fallback
     */
    resolveRoute(args: RouteResolveArgs): RouteResolveResult {
        const { consumer, taskKind, taskId, requiredCapabilities, routeHint } = args;

        // 1. routeHint
        if (routeHint?.providerId) {
            if (this.providerSatisfies(routeHint.providerId, requiredCapabilities)) {
                return {
                    providerId: routeHint.providerId,
                    model: routeHint.model,
                    profileId: routeHint.profileId,
                    resolvedBy: 'route_hint',
                };
            }
        }

        // 2. 用户任务级覆盖
        if (taskId) {
            const override = this.taskOverrides.get(`${consumer}::${taskId}`);
            if (override?.providerId && !override.isStale) {
                if (this.providerSatisfies(override.providerId, requiredCapabilities)) {
                    return {
                        providerId: override.providerId,
                        model: override.model,
                        profileId: override.profileId,
                        fallbackProviderId: override.fallbackProviderId,
                        resolvedBy: 'user_task_override',
                    };
                }
            }
        }

        // 3. 插件注册任务推荐
        if (taskId && this.registry) {
            const taskDesc = this.registry.getTaskDescriptor(consumer, taskId);
            if (taskDesc?.recommendedRoute?.providerId) {
                if (this.providerSatisfies(taskDesc.recommendedRoute.providerId, requiredCapabilities)) {
                    return {
                        providerId: taskDesc.recommendedRoute.providerId,
                        profileId: taskDesc.recommendedRoute.profileId,
                        resolvedBy: 'plugin_task_recommend',
                    };
                }
            }
        }

        // 4. 插件能力默认
        const pluginDefault = this.pluginDefaults.get(`${consumer}::${taskKind}`);
        if (pluginDefault?.providerId) {
            if (this.providerSatisfies(pluginDefault.providerId, requiredCapabilities)) {
                return {
                    providerId: pluginDefault.providerId,
                    model: pluginDefault.model,
                    profileId: pluginDefault.profileId,
                    fallbackProviderId: pluginDefault.fallbackProviderId,
                    resolvedBy: 'user_plugin_default',
                };
            }
        }

        // 5. 全局能力默认
        const globalDefault = this.globalDefaults.get(taskKind);
        if (globalDefault?.providerId) {
            if (this.providerSatisfies(globalDefault.providerId, requiredCapabilities)) {
                return {
                    providerId: globalDefault.providerId,
                    model: globalDefault.model,
                    profileId: globalDefault.profileId,
                    fallbackProviderId: globalDefault.fallbackProviderId,
                    resolvedBy: 'user_global_default',
                };
            }
        }

        // 6. 终极 fallback: 任意一个满足能力要求的 Provider
        for (const [pid] of this.providers) {
            if (this.providerSatisfies(pid, requiredCapabilities)) {
                return { providerId: pid, resolvedBy: 'fallback' };
            }
        }

        throw new Error(`[TaskRouter] 无法为 consumer="${consumer}" taskKind="${taskKind}" 找到可用 Provider`);
    }

    // ─── 能力查询 ───

    getProviderCapabilities(providerId: string): LLMCapability[] {
        return this.providerCapabilities.get(providerId) || [];
    }

    /** 列出满足指定能力要求的所有 Provider */
    listProvidersWithCapabilities(required?: LLMCapability[]): LLMProvider[] {
        if (!required || required.length === 0) {
            return Array.from(this.providers.values());
        }
        return Array.from(this.providers.values()).filter(p =>
            this.providerSatisfies(p.id, required)
        );
    }

    getAllProviders(): LLMProvider[] {
        return Array.from(this.providers.values());
    }

    getProvider(providerId: string): LLMProvider | undefined {
        return this.providers.get(providerId);
    }

    // ─── 设置页查询 ───

    getGlobalDefault(kind: CapabilityKind): GlobalCapabilityDefault | undefined {
        return this.globalDefaults.get(kind);
    }

    getPluginDefault(pluginId: string, kind: CapabilityKind): PluginCapabilityDefault | undefined {
        return this.pluginDefaults.get(`${pluginId}::${kind}`);
    }

    getTaskOverride(pluginId: string, taskId: string): TaskOverride | undefined {
        return this.taskOverrides.get(`${pluginId}::${taskId}`);
    }

    listTaskOverrides(): TaskOverride[] {
        return Array.from(this.taskOverrides.values());
    }

    // ─── 内部方法 ───

    private providerSatisfies(providerId: string, required?: LLMCapability[]): boolean {
        if (!required || required.length === 0) return true;
        const caps = this.providerCapabilities.get(providerId);
        if (!caps) return false;
        return required.every(c => caps.includes(c));
    }
}
