import { Logger } from "../SDK/logger";
import { respond } from "../SDK/bus/rpc";
import { broadcast } from "../SDK/bus/broadcast";
import { bootstrapEvent } from "./src/bootstrapEvent";

export const logger = new Logger("骰子助手");
logger.info("骰子助手组件已载入环境");

// 初始化心跳
respond('ping', 'stx_rollhelper', async (payload, env) => {
    return {
        alive: true,
        version: '1.0.0', // 可以后续通过 manifest 读取
        isEnabled: true, // RollHelper 默认长亮
        capabilities: ['roll', 'event', 'bus', 'ui']
    };
});

// 主动广播上线
broadcast('state_changed', {
    namespace: 'stx_rollhelper',
    isEnabled: true
}, 'stx_rollhelper');

bootstrapEvent();
