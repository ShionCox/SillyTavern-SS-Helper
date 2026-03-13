import type { STXBus, EventEnvelope } from '../stx';

export class EventBus implements STXBus {
    private handlers: Map<string, Array<(evt: EventEnvelope<unknown>) => void>> = new Map();

    /**
     * 功能：触发一个事件，并同步通知对应事件类型的所有监听器。
     * @param type 事件类型。
     * @param payload 事件数据。
     * @param opts 可选参数，当前仅支持 chatKey。
     * @returns 无返回值。
     */
    emit<T>(type: string, payload: T, opts?: { chatKey?: string }): void {
        const eventHandlers = this.handlers.get(type) || [];
        const ts = Date.now();

        const envelope: EventEnvelope<T> = {
            id: crypto.randomUUID(),
            ts,
            chatKey: opts?.chatKey || 'global',
            source: { pluginId: 'stx_memory_os', version: '1.0.0' },
            type,
            payload,
        };

        eventHandlers.forEach((handler) => {
            try {
                handler(envelope as EventEnvelope<unknown>);
            } catch (err) {
                console.error(`[STXBus] Error in handler for event type: ${type}`, err);
            }
        });
    }

    /**
     * 功能：订阅指定事件类型。
     * @param type 事件类型。
     * @param handler 事件处理函数。
     * @returns 取消订阅函数。
     */
    on<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void {
        const eventHandlers = this.handlers.get(type) || [];
        eventHandlers.push(handler as (evt: EventEnvelope<unknown>) => void);
        this.handlers.set(type, eventHandlers);
        return () => this.off(type, handler);
    }

    /**
     * 功能：只订阅一次指定事件类型。
     * @param type 事件类型。
     * @param handler 事件处理函数。
     * @returns 取消订阅函数。
     */
    once<T>(type: string, handler: (evt: EventEnvelope<T>) => void): () => void {
        const onceHandler = (evt: EventEnvelope<T>): void => {
            this.off(type, onceHandler);
            handler(evt);
        };
        return this.on(type, onceHandler);
    }

    /**
     * 功能：取消指定事件类型的监听器。
     * @param type 事件类型。
     * @param handler 事件处理函数。
     * @returns 无返回值。
     */
    off(type: string, handler: Function): void {
        const eventHandlers = this.handlers.get(type);
        if (!eventHandlers) {
            return;
        }
        this.handlers.set(
            type,
            eventHandlers.filter((item) => item !== handler)
        );
    }
}
