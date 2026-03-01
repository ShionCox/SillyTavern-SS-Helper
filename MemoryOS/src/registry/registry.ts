import type { STXRegistry, PluginManifest } from '../../../SDK/stx';

/** 当前 SDK 版本号 */
export const STX_VERSION = '1.0.0';

/**
 * 插件注册表 —— 管理所有已注册插件的清单与能力声明
 * 支持版本协商：不满足 requiresSDK 的插件将被降级
 */
export class PluginRegistry implements STXRegistry {
    private plugins: Map<string, PluginManifest> = new Map();
    /** 因版本不满足被降级的插件（只可 emit events） */
    private degradedPlugins: Set<string> = new Set();

    /**
     * 注册一个插件（含版本协商）
     */
    register(manifest: PluginManifest): { ok: boolean; degraded: boolean; reason?: string } {
        // 版本协商校验
        let degraded = false;
        let reason: string | undefined;

        if (manifest.requiresSDK) {
            if (!this.satisfiesVersion(manifest.requiresSDK, STX_VERSION)) {
                reason = `插件 "${manifest.pluginId}" 要求 SDK ${manifest.requiresSDK}，当前 ${STX_VERSION}，已降级（仅允许 emit events）`;
                console.warn('[STXRegistry]', reason);
                this.degradedPlugins.add(manifest.pluginId);
                degraded = true;
            }
        }

        if (this.plugins.has(manifest.pluginId)) {
            console.warn(`[STXRegistry] 插件 "${manifest.pluginId}" 已注册，将覆盖`);
        }
        this.plugins.set(manifest.pluginId, manifest);
        console.log(`[STXRegistry] 已注册插件: ${manifest.name} v${manifest.version}${degraded ? ' (降级)' : ''}`);
        return { ok: true, degraded, reason };
    }

    /**
     * 获取指定插件的清单
     */
    getManifest(pluginId: string): PluginManifest | undefined {
        return this.plugins.get(pluginId);
    }

    /**
     * 获取所有已注册插件
     */
    getAllPlugins(): PluginManifest[] {
        return Array.from(this.plugins.values());
    }

    /**
     * 检查指定插件是否声明了某项能力
     */
    hasCapability(pluginId: string, capabilityType: 'events' | 'memory' | 'llm', capability: string): boolean {
        const manifest = this.plugins.get(pluginId);
        if (!manifest) return false;

        // 降级插件只能使用 events 能力
        if (this.degradedPlugins.has(pluginId) && capabilityType !== 'events') {
            return false;
        }

        const caps = manifest.capabilities[capabilityType];
        return caps ? caps.includes(capability) : false;
    }

    /**
     * 检查一个插件是否处于降级状态
     */
    isDegraded(pluginId: string): boolean {
        return this.degradedPlugins.has(pluginId);
    }

    /**
     * 获取当前 SDK 版本号
     */
    getVersion(): string {
        return STX_VERSION;
    }

    /**
     * 获取已注册插件数量
     */
    getRegisteredCount(): number {
        return this.plugins.size;
    }

    /**
     * 完整 semver 数值比较
     * 支持格式：^1.0.0（主版本一致，次版本和补丁 >= required）
     *           ~1.2.0（主+次版本一致，补丁 >= required）
     *           1.2.3  （精确匹配）
     */
    private satisfiesVersion(required: string, current: string): boolean {
        const caret = required.startsWith('^');
        const tilde = required.startsWith('~');
        const cleanReq = required.replace(/^[\^~]/, '');

        const parseSemver = (v: string): [number, number, number] => {
            const parts = v.split('.').map(Number);
            return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
        };

        const [reqMajor, reqMinor, reqPatch] = parseSemver(cleanReq);
        const [curMajor, curMinor, curPatch] = parseSemver(current);

        if (caret) {
            // ^ 模式：主版本必须一致，当前次+补丁版本 >= required
            if (curMajor !== reqMajor) return false;
            if (curMinor !== reqMinor) return curMinor > reqMinor;
            return curPatch >= reqPatch;
        }
        if (tilde) {
            // ~ 模式：主+次版本一致，当前补丁版本 >= required
            if (curMajor !== reqMajor || curMinor !== reqMinor) return false;
            return curPatch >= reqPatch;
        }
        // 精确匹配
        return curMajor === reqMajor && curMinor === reqMinor && curPatch === reqPatch;
    }
}

