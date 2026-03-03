import type { STXBus, EventEnvelope } from '../stx';

export class EventBus implements STXBus {
    private handlers: Map<string, Array<(evt: EventEnvelope<any>) => void>> = new Map();

    /**
     * 触发一个事件，将按顺序同步调用监听器
     * @param type 事件类型
     * @param payload 事件载荷
     * @param opts 额外选项比如 ChatKey 隔离分区
     */
    emit<T>(type: string, payload: T, opts?: { chatKey?: string }): void {
        const eventHandlers = this.handlers.get(type) || [];
        const ts = Date.now();

        // 构造标准的 EventEnvelope
        const envelope: EventEnvelope<T> = {
            id: crypto.randomUUID(),
            ts,
            chatKey: opts?.chatKey || 'global',
            source: { pluginId: 'memory_os', version: '1.0.0' }, // 默认标识总线来源，真实流转中应记录触发源
            type,
            payload
        };

        eventHandlers.forEach(handler => {
            try {
                handler(envelope);
            } catch (err) {
                console.error(`[STXBus] Error in handler for event type: ${type}`, err);
            }
        });
    }

    /**
     * 订阅事件
     * @param type 事件类型
     * @param handler 处理函数
     * @returns 卸载函数的句柄
     */
    on<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void {
        const eventHandlers = this.handlers.get(type) || [];
        eventHandlers.push(handler as (evt: EventEnvelope<any>) => void);
        this.handlers.set(type, eventHandlers);

        // 返回解除绑定的函数
        return () => this.off(type, handler);
    }

    /**
     * 单次事件监听
     * @param type 事件类型
     * @param handler 处理函数
     * @returns 卸载函数的句柄
     */
    once<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void {
        const onceHandler = (evt: EventEnvelope<T>) => {
            this.off(type, onceHandler);
            handler(evt);
        };
        return this.on(type, onceHandler);
    }

    /**
     * 卸载指定的事件监听
     * @param type 事件类型
     * @param handler 将被卸载的句柄
     */
    off(type: string, handler: Function): void {
        const eventHandlers = this.handlers.get(type);
        if (eventHandlers) {
            this.handlers.set(
                type,
                eventHandlers.filter(h => h !== handler)
            );
        }
    }
}
