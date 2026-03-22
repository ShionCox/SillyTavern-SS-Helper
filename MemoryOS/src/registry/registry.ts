import type { PluginManifest, RegistryChangeEvent, STXRegistry } from '../../../SDK/stx';
import { logger } from '../index';

/** 当前 SDK 版本号 */
export const STX_VERSION: string = '1.0.0';

/**
 * 功能：注册中心事件监听器类型。
 * @param event 注册中心变更事件。
 * @returns 无返回值。
 */
type RegistryChangeHandler = (event: RegistryChangeEvent) => void;

/**
 * 功能：插件注册中心，提供注册、枚举、查询与变更通知。
 */
export class PluginRegistry implements STXRegistry {
    private plugins: Map<string, PluginManifest> = new Map();
    private degradedPlugins: Set<string> = new Set();
    private changeHandlers: Set<RegistryChangeHandler> = new Set();

    /**
     * 功能：注册插件清单并返回注册结果。
     * @param manifest 插件清单。
     * @returns 注册结果，包含是否降级与原因。
     */
    register(manifest: PluginManifest): { ok: boolean; degraded: boolean; reason?: string } {
        let degraded: boolean = false;
        let reason: string | undefined;

        if (manifest.requiresSDK && !this.satisfiesVersion(manifest.requiresSDK, STX_VERSION)) {
            degraded = true;
            reason = `插件 "${manifest.pluginId}" 要求 SDK ${manifest.requiresSDK}，当前 ${STX_VERSION}，已降级。`;
            this.degradedPlugins.add(manifest.pluginId);
        } else {
            this.degradedPlugins.delete(manifest.pluginId);
        }

        const action: 'add' | 'update' = this.plugins.has(manifest.pluginId) ? 'update' : 'add';
        const normalizedManifest: PluginManifest = {
            ...manifest,
            declaredAt: manifest.declaredAt ?? Date.now(),
        };
        this.plugins.set(manifest.pluginId, normalizedManifest);

        this.emitChanged({
            pluginId: manifest.pluginId,
            action,
            manifest: normalizedManifest,
            degraded,
            reason,
            ts: Date.now(),
        });

        return { ok: true, degraded, reason };
    }

    /**
     * 功能：列出所有已注册插件清单。
     * @returns 清单数组。
     */
    list(): PluginManifest[] {
        return Array.from(this.plugins.values());
    }

    /**
     * 功能：按 pluginId 查询清单。
     * @param pluginId 插件唯一标识。
     * @returns 命中返回清单，否则返回 undefined。
     */
    get(pluginId: string): PluginManifest | undefined {
        return this.plugins.get(pluginId);
    }

    /**
     * 功能：订阅注册中心变更事件。
     * @param handler 变更回调。
     * @returns 取消订阅函数。
     */
    onChanged(handler: RegistryChangeHandler): () => void {
        this.changeHandlers.add(handler);
        return (): void => {
            this.changeHandlers.delete(handler);
        };
    }

    /**
     * 功能：兼容旧接口，按 pluginId 获取清单。
     * @param pluginId 插件唯一标识。
     * @returns 命中返回清单，否则返回 undefined。
     */
    /**
     * 功能：兼容旧接口，列出全部插件。
     * @returns 清单数组。
     */
    /**
     * 功能：判断插件是否声明某项能力。
     * @param pluginId 插件唯一标识。
     * @param capabilityType 能力类别。
     * @param capability 能力名称。
     * @returns 是否具备能力。
     */
    hasCapability(pluginId: string, capabilityType: 'events' | 'memory' | 'llm', capability: string): boolean {
        const manifest: PluginManifest | undefined = this.plugins.get(pluginId);
        if (!manifest) return false;

        if (this.degradedPlugins.has(pluginId) && capabilityType !== 'events') {
            return false;
        }

        const capabilities: string[] | undefined = manifest.capabilities[capabilityType];
        return Array.isArray(capabilities) ? capabilities.includes(capability) : false;
    }

    /**
     * 功能：判断插件是否处于降级状态。
     * @param pluginId 插件唯一标识。
     * @returns 是否降级。
     */
    isDegraded(pluginId: string): boolean {
        return this.degradedPlugins.has(pluginId);
    }

    /**
     * 功能：返回当前 SDK 版本号。
     * @returns SDK 版本号。
     */
    getVersion(): string {
        return STX_VERSION;
    }

    /**
     * 功能：返回已注册插件数量。
     * @returns 插件数量。
     */
    getRegisteredCount(): number {
        return this.plugins.size;
    }

    /**
     * 功能：触发注册中心变更通知。
     * @param event 变更事件。
     * @returns 无返回值。
     */
    private emitChanged(event: RegistryChangeEvent): void {
        for (const handler of this.changeHandlers) {
            try {
                handler(event);
            } catch (error) {
                logger.warn('[STXRegistry] changed handler 执行失败', error);
            }
        }
    }

    /**
     * 功能：校验 semver 约束是否满足。
     * @param required 约束版本，支持 ^、~、精确版本。
     * @param current 当前版本。
     * @returns 是否满足。
     */
    private satisfiesVersion(required: string, current: string): boolean {
        const caret: boolean = required.startsWith('^');
        const tilde: boolean = required.startsWith('~');
        const cleanReq: string = required.replace(/^[\^~]/, '');

        const parseSemver = (value: string): [number, number, number] => {
            const parts: number[] = value.split('.').map(Number);
            return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
        };

        const [reqMajor, reqMinor, reqPatch] = parseSemver(cleanReq);
        const [curMajor, curMinor, curPatch] = parseSemver(current);

        if (caret) {
            if (curMajor !== reqMajor) return false;
            if (curMinor !== reqMinor) return curMinor > reqMinor;
            return curPatch >= reqPatch;
        }

        if (tilde) {
            if (curMajor !== reqMajor || curMinor !== reqMinor) return false;
            return curPatch >= reqPatch;
        }

        return curMajor === reqMajor && curMinor === reqMinor && curPatch === reqPatch;
    }
}
