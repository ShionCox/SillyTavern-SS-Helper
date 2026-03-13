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

respond('ping', 'stx_rollhelper', async () => {
    return {
        alive: true,
        version: '1.0.0',
        isEnabled: true,
        capabilities: ['roll', 'event', 'bus', 'ui']
    };
}

broadcast('state_changed', {
    namespace: 'stx_rollhelper',
    isEnabled: true
}, 'stx_rollhelper');

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


