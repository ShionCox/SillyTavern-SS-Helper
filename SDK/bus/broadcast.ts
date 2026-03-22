import { STX_PROTOCOL_VERSION, BroadcastEnvelope } from './protocol';
import { Logger } from '../logger';

const logger = new Logger('STXBus-Broadcast', { quiet: true });

/**
 * 广域分发 (Broadcast)
 * 用于像状态机变更等不需要回执、也无所谓听众数量的数据发布场景。
 * 
 * @param topic 频段（如 'plugin:broadcast:state_changed'）
 * @param data 承载数据
 * @param from 来源 namespace
 */
export function broadcast<T>(topic: string, data: T, from: string): void {
    const globalBus = (window as any).STX?.bus;
    if (!globalBus) {
        logger.warn(`[Broadcast] 尝试发出 ${topic}，但 STX.bus 未挂载。`);
        return;
    }

    const envelope: BroadcastEnvelope<T> = {
        v: STX_PROTOCOL_VERSION,
        type: 'broadcast',
        topic,
        from,
        ts: Date.now(),
        data
    };

    logger.info(`[Broadcast -> ${topic}] 发送广播, from: ${from}`);
    // 直接分发
    globalBus.emit(topic, envelope);
}

/**
 * 广域订阅 (Subscribe)
 * 允许从大量广播中，基于特定的来源进行防抖或者过滤。
 * 
 * @returns 剥离该监听器的函数 dispose()
 */
export function subscribe<T>(
    topic: string,
    handler: (data: T, envelope: BroadcastEnvelope<T>) => void,
    options?: { from?: string } // 可选对数据源进行筛选
): () => void {
    const globalBus = (window as any).STX?.bus;
    if (!globalBus) return () => { };

    const wrappedHandler = (evtArg: any) => {
        // 兼容解包下层 EventBus 的 { payload: ... } 结构
        const rawEnv = evtArg?.payload ?? evtArg;
        // 安全拦截非标准封包
        if (!rawEnv || rawEnv.v !== STX_PROTOCOL_VERSION || rawEnv.type !== 'broadcast') {
            return;
        }

        const env = rawEnv as BroadcastEnvelope<T>;

        // from 鉴权筛选
        if (options?.from && env.from !== options.from) {
            return; // 忽略非指定发送方的状态
        }

        logger.info(`[Subscribe <- ${topic}] 收到广播消息, from: ${env.from}`);
        handler(env.data, env);
    };

    return globalBus.on(topic, wrappedHandler);
}
