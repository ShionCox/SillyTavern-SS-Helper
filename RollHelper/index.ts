import { Logger } from "../SDK/logger";
import { respond } from "../SDK/bus/rpc";
import { broadcast } from "../SDK/bus/broadcast";
import { bootstrapEvent } from "./src/bootstrapEvent";

export const logger = new Logger("骰子助手");
logger.info("骰子助手组件已载入环境");

respond('ping', 'stx_rollhelper', async () => {
    return {
        alive: true,
        version: '1.0.0',
        isEnabled: true,
        capabilities: ['roll', 'event', 'bus', 'ui']
    };
});

broadcast('state_changed', {
    namespace: 'stx_rollhelper',
    isEnabled: true
}, 'stx_rollhelper');

bootstrapEvent();
