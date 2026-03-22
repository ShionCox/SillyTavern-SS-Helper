import {
    STX_PROTOCOL_VERSION, RpcErrorCode,
    RpcRequestEnvelope, RpcResponseEnvelope
} from './protocol';
import { checkPermission } from './registry';
import { Logger } from '../logger';

const logger = new Logger('STXBus-RPC', { quiet: true });

/**
 * 微服务级 RPC 通信底座 (STX RPC Client & Server Utils)
 * 包含：请求幂等、超限丢包、Promise 强制退出以及越权白名单防守
 */

// ======= P2-1 去重与监控缓存区 =======
// 简易版的请求 ID 去重表 (存活 TTL 内收到的同样请求视为重发即刻抛弃)
const RECENT_REQUESTS = new Set<string>();
const DEDUPE_TTL_MS = 5000;

function isDubplicate(reqId: string): boolean {
    if (RECENT_REQUESTS.has(reqId)) return true;
    RECENT_REQUESTS.add(reqId);
    setTimeout(() => RECENT_REQUESTS.delete(reqId), DEDUPE_TTL_MS);
    return false;
}

// 记录所有活跃流以防御堆栈溢出
export const ACTIVE_PENDING_RPCS = new Map<string, { ts: number }>();
const MAX_CONCURRENT_RPCS = 100;

export interface RpcRequestOptions {
    to?: string;            // 指定接收方的 namespace
    timeoutMs?: number;     // 默认 5000ms
    retries?: number;       // P2 增强，单点自动重试机制（暂留可供后续实操扩展）
    retryDelayMs?: number;
    signal?: AbortSignal;   // DOM 标准中止器
}

/**
 * 在 STXBus 之上发起异步的微服务远端调用。
 * 此为“消费者”（Client-Side） API。
 */
export async function request<Req = any, Res = any>(
    topic: string,
    data: Req,
    fromNamespace: string,
    options: RpcRequestOptions = {}
): Promise<Res> {
    const globalBus = (window as any).STX?.bus;
    if (!globalBus) {
        throw new Error('STX.bus has not been initialized yet.');
    }

    // P0-5: 超量拦截，防止由于各种未解 bug 或死循环导致内存耗尽
    if (ACTIVE_PENDING_RPCS.size >= MAX_CONCURRENT_RPCS) {
        throw new Error(`[RPC Guard] Active requests exceeded ${MAX_CONCURRENT_RPCS}. Request dropped.`);
    }

    const reqId = crypto.randomUUID();
    const timeout = options.timeoutMs ?? 5000;
    const responseChannel = `plugin:response:${reqId}`; // P0: 强制约束 Response 返回路线

    // 组装标准 Request 包裹
    const envelope: RpcRequestEnvelope<Req> = {
        v: STX_PROTOCOL_VERSION,
        type: 'rpc:req',
        reqId,
        topic,
        from: fromNamespace,
        to: options.to,
        ts: Date.now(),
        ttlMs: timeout,
        data
    };

    ACTIVE_PENDING_RPCS.set(reqId, { ts: envelope.ts });

    return new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        let unbind: () => void = () => { };

        const cleanup = () => {
            clearTimeout(timer);
            unbind(); // 解除挂在 STX.bus 上的 once / on 监听门
            ACTIVE_PENDING_RPCS.delete(reqId);

            if (options.signal) {
                options.signal.removeEventListener('abort', handleAbort);
            }
        };

        const handleAbort = () => {
            cleanup();
            reject(new Error(`RPC_ABORT: Request ${reqId} was manually aborted.`));
        };

        if (options.signal) {
            if (options.signal.aborted) return handleAbort();
            options.signal.addEventListener('abort', handleAbort);
        }

        // P0-2 强烈要求：先绑监听、后 emit 广播。防止服务端处理异常过快（同步情况）造成回执在监听前就溜过去了。
        unbind = globalBus.once(responseChannel, (evtArg: any) => {
            // 兼容解包一层 EventBus 强加的 EventEnvelope 外壳
            const rawRes = evtArg?.payload ?? evtArg;
            if (!rawRes || rawRes.type !== 'rpc:res') return; // 非法回执略过（其实不会发生因为 reqId 固定）

            const res = rawRes as RpcResponseEnvelope<Res>;
            cleanup(); // 必须清空所有泄漏风险残留！

            // 统一记录所有收到的响应
            logger.info(`[Response <- ${topic}] 收到回执, from: ${res.from}, reqId: ${reqId}, 耗时: ${Date.now() - envelope.ts}ms`);

            if (res.ok) {
                resolve(res.data as Res);
            } else {
                reject(new Error(`[RPC Error] ${res.error?.code}: ${res.error?.message}`));
            }
        });

        // 定时器设防（服务端无响应或者丢包的处理）
        timer = setTimeout(() => {
            cleanup();
            logger.warn(`[Timeout] 请求发往 ${topic} 在 ${timeout}ms 后超时无响应, reqId: ${reqId}`);
            reject(new Error(`[${RpcErrorCode.TIMEOUT}] The request ${reqId} towards ${topic} timed out after ${timeout}ms.`));
        }, timeout);

        logger.info(`[Request -> ${topic}] 发起调用, to: ${options.to || 'ALL'}, reqId: ${reqId}`);
        // 正式抛射入总线，等待被服务节点猎取
        globalBus.emit(topic, envelope);
    });
}

/**
 * 开放一个微服务端点用于接收某个主题的处理。
 * 此为“服务端/提供者”（Server-Side） API。
 * 
 * @returns Dispose 解绑函数
 */
export function respond<Req = any, Res = any>(
    topic: string,
    myNamespace: string,
    handler: (data: Req, env: RpcRequestEnvelope<Req>) => Promise<Res> | Res
): () => void {
    const globalBus = (window as any).STX?.bus;
    if (!globalBus) return () => { };

    // 服务端需要防范同步和并发异常溢出，我们给原始的 topic 绑上处理口子。
    const internalHandler = async (evtArg: any) => {
        // 兼容解包下层 EventBus 的 { payload: ... } 结构
        const rawReq = evtArg?.payload ?? evtArg;
        if (!rawReq || rawReq.type !== 'rpc:req') return;
        const req = rawReq as RpcRequestEnvelope<Req>;

        // 基础路由守卫 P0-3: 虽然你发了，也虽然我在这条高速上，但如果不是专门找我的，那我就装死。
        if (req.to && req.to !== myNamespace) return;

        // P2-2 安全校验防御
        if (!checkPermission(topic, req.from)) {
            return sendError(req.reqId, req.from, myNamespace, {
                code: RpcErrorCode.PERMISSION_DENIED,
                message: `Namespace ${req.from} is strictly NOT allowed to invoke ${topic}.`
            });
        }

        // P2-1 幂等保护缓存
        if (isDubplicate(req.reqId)) {
            logger.warn(`[RPC Idempotency] 拦截到重复的并发调用，已屏蔽执行, reqId: ${req.reqId}`);
            return;
        }

        try {
            logger.info(`[Handler <- ${topic}] 开始接管业务请求, from: ${req.from}, reqId: ${req.reqId}`);
            // 直接交付业务处理者
            const rsData = await handler(req.data, req);

            // 发还顺利的成功回执
            const resEnv: RpcResponseEnvelope<Res> = {
                v: STX_PROTOCOL_VERSION,
                type: 'rpc:res',
                reqId: req.reqId,
                topic: `plugin:response:${req.reqId}`,
                from: myNamespace,
                to: req.from,
                ts: Date.now(),
                ok: true,
                data: rsData
            };

            logger.info(`[Response -> ${resEnv.topic}] 业务就绪下发回执, to: ${req.from}, reqId: ${req.reqId}`);
            globalBus.emit(resEnv.topic, resEnv);
        } catch (e: any) {
            logger.error(`[Handler Error] 微服务提供方内部发生崩溃抛错, topic: ${topic}, reqId: ${req.reqId}`, e);
            // 业务甚至内部语法爆炸。P0: 截获！绝对不能 let it throw and vanish
            sendError(req.reqId, req.from, myNamespace, {
                code: RpcErrorCode.HANDLER_ERROR,
                message: e?.message || 'Unknown internal service exception occurred.'
            });
        }
    };

    return globalBus.on(topic, internalHandler);
}

// ============== 内部工具方法 ============== //
function sendError(reqId: string, toTarget: string, fromMe: string, errData: any) {
    const globalBus = (window as any).STX?.bus;
    if (!globalBus) return;

    const resEnv: RpcResponseEnvelope<any> = {
        v: STX_PROTOCOL_VERSION,
        type: 'rpc:res',
        reqId,
        topic: `plugin:response:${reqId}`,
        from: fromMe,
        to: toTarget,
        ts: Date.now(),
        ok: false,
        error: errData
    };
    globalBus.emit(resEnv.topic, resEnv);
}
