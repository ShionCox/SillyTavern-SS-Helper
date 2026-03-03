import { Logger } from "../SDK/logger";
import { respond } from "../SDK/bus/rpc";
import { broadcast } from "../SDK/bus/broadcast";
import type { PluginManifest } from "../SDK/stx";
import { ensureSharedUnoStyles } from "../SDK/sharedUno";
import manifestJson from "./manifest.json";
import { bootstrapEvent } from "./src/bootstrapEvent";

export const logger = new Logger("骰子助手");
logger.info("骰子助手组件已加载");
ensureSharedUnoStyles();

const ROLLHELPER_MANIFEST: PluginManifest = {
    pluginId: "stx_rollhelper",
    name: "RollHelper",
    displayName: manifestJson.display_name || "SS-Helper [骰子助手]",
    version: manifestJson.version || "1.0.0",
    capabilities: {
        events: ["plugin:request:ping", "ping", "state_changed", "roll", "event"],
        memory: [],
        llm: [],
    },
    scopes: ["roll", "event", "ui"],
    requiresSDK: "^1.0.0",
    source: "manifest_json",
};

/**
 * 功能：注册 RollHelper 插件信息到 STX 插件系统。
 * 说明：由于 STX 插件系统可能尚未完全初始化，我们采用轮询方式尝试注册，直到成功为止。
 */
function registerRollHelperManifest(): void {
    const stx = (window as any).STX;
    if (stx?.registry?.register) {
        stx.registry.register(ROLLHELPER_MANIFEST);
        return;
    }
    setTimeout((): void => {
        registerRollHelperManifest();
    }, 1000);
}

function buildPingPayload(): {
    alive: boolean;
    version: string;
    isEnabled: boolean;
    capabilities: string[];
} {
    return {
        alive: true,
        version: manifestJson.version || "1.0.0",
        isEnabled: true,
        capabilities: ["roll", "event", "bus", "ui"],
    };
}

respond("plugin:request:ping", "stx_rollhelper", async (): Promise<{
    alive: boolean;
    version: string;
    isEnabled: boolean;
    capabilities: string[];
}> => buildPingPayload());

respond("ping", "stx_rollhelper", async (): Promise<{
    alive: boolean;
    version: string;
    isEnabled: boolean;
    capabilities: string[];
}> => buildPingPayload());

broadcast(
    "state_changed",
    {
        namespace: "stx_rollhelper",
        isEnabled: true,
    },
    "stx_rollhelper"
);

registerRollHelperManifest();
bootstrapEvent();


