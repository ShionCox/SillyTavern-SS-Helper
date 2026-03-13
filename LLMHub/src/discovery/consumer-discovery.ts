import { request } from '../../../SDK/bus/rpc';
import type { PluginManifest } from '../../../SDK/stx';

export interface DiscoveredConsumer {
    pluginId: string;
    displayName: string;
    version?: string;
    sources: Array<'registry' | 'settings' | 'ping'>;
    alive?: boolean;
    isEnabled?: boolean;
}

export interface DiscoverConsumersOptions {
    timeoutMs?: number;
    fromNamespace?: string;
    excludePluginIds?: string[];
    onlineOnly?: boolean;
}

type PingResult = {
    alive?: boolean;
    isEnabled?: boolean;
    pluginId?: string;
    version?: string;
};

/**
 * 功能：发现可用 consumer，合并注册中心、设置键和 ping 结果。
 * @param options 发现参数。
 * @returns 发现到的 consumer 列表。
 */
export async function discoverConsumers(options: DiscoverConsumersOptions = {}): Promise<DiscoveredConsumer[]> {
    const timeoutMs: number = options.timeoutMs ?? 1200;
    const fromNamespace: string = options.fromNamespace ?? 'stx_llmhub';
    const onlineOnly: boolean = options.onlineOnly === true;
    const excludedPluginIdSet: Set<string> = new Set(
        Array.isArray(options.excludePluginIds)
            ? options.excludePluginIds.map((pluginId: string) => String(pluginId || '').trim()).filter(Boolean)
            : []
    );
    const collector: Map<string, DiscoveredConsumer> = new Map();

    const upsert = (
        pluginId: string,
        source: 'registry' | 'settings' | 'ping',
        manifest?: PluginManifest
    ): void => {
        const normalizedId: string = String(pluginId || '').trim();
        if (!normalizedId) {
            return;
        }
        const current: DiscoveredConsumer | undefined = collector.get(normalizedId);
        const sources: Array<'registry' | 'settings' | 'ping'> = current?.sources || [];
        if (!sources.includes(source)) {
            sources.push(source);
        }
        collector.set(normalizedId, {
            pluginId: normalizedId,
            displayName: manifest?.displayName || manifest?.name || current?.displayName || normalizedId,
            version: manifest?.version || current?.version,
            sources,
            alive: current?.alive,
            isEnabled: current?.isEnabled,
        });
    };

    const registryItems: PluginManifest[] = readRegistryConsumers();
    registryItems.forEach((manifest: PluginManifest) => {
        upsert(manifest.pluginId, 'registry', manifest);
    });

    const settingsConsumers: string[] = readSettingsConsumers();
    settingsConsumers.forEach((pluginId: string) => {
        upsert(pluginId, 'settings');
    });

    upsert('stx_llmhub', 'settings');
    upsert('stx_memory_os', 'settings');

    const pluginIds: string[] = Array.from(collector.keys());
    await Promise.all(
        pluginIds.map(async (pluginId: string): Promise<void> => {
            const pingResult: PingResult | null = await pingConsumer(pluginId, fromNamespace, timeoutMs);
            if (!pingResult?.alive) {
                return;
            }
            upsert(pingResult.pluginId || pluginId, 'ping');
            const current: DiscoveredConsumer | undefined = collector.get(pingResult.pluginId || pluginId);
            if (!current) {
                return;
            }
            current.alive = true;
            current.isEnabled = pingResult.isEnabled;
            if (pingResult.version) {
                current.version = pingResult.version;
            }
            collector.set(current.pluginId, current);
        })
    );

    return Array.from(collector.values())
        .filter((item: DiscoveredConsumer) => {
            if (excludedPluginIdSet.has(item.pluginId)) {
                return false;
            }
            if (onlineOnly && item.alive !== true) {
                return false;
            }
            return true;
        })
        .sort((left: DiscoveredConsumer, right: DiscoveredConsumer) => {
        const leftAlive: number = left.alive ? 1 : 0;
        const rightAlive: number = right.alive ? 1 : 0;
        if (leftAlive !== rightAlive) {
            return rightAlive - leftAlive;
        }
        return left.pluginId.localeCompare(right.pluginId);
    });
}

/**
 * 功能：读取 STX 注册中心中的插件清单。
 * @returns 插件清单数组。
 */
function readRegistryConsumers(): PluginManifest[] {
    const stx = (window as any).STX;
    const listFn = stx?.registry?.list;
    if (typeof listFn !== 'function') {
        return [];
    }
    try {
        const list: unknown = listFn.call(stx.registry);
        return Array.isArray(list) ? (list as PluginManifest[]) : [];
    } catch {
        return [];
    }
}

/**
 * 功能：从 extensionSettings 枚举 stx_* consumer。
 * @returns consumer 标识数组。
 */
function readSettingsConsumers(): string[] {
    const ctx = (window as any).SillyTavern?.getContext?.() || {};
    const settings: Record<string, unknown> = (ctx.extensionSettings || {}) as Record<string, unknown>;
    return Object.keys(settings)
        .map((key: string) => key.trim())
        .filter((key: string) => key.startsWith('stx_'));
}

/**
 * 功能：对指定插件执行 ping 探测。
 * @param pluginId 目标插件。
 * @param fromNamespace 调用方插件。
 * @param timeoutMs 超时时间。
 * @returns 成功返回 ping 结果，失败返回 null。
 */
async function pingConsumer(pluginId: string, fromNamespace: string, timeoutMs: number): Promise<PingResult | null> {
    try {
        const result: PingResult = await request('plugin:request:ping', {}, fromNamespace, {
            to: pluginId,
            timeoutMs,
        });
        return result;
    } catch {
        return null;
    }
}
