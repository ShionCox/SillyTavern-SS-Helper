/**
 * STXBus 微服务通信层 - 协议定义与错误码规范
 * 提供标准的 EventEnvelope 类型、RPC 信封结构和全局常量约束。
 */

// 协议版本升级标识
export const STX_PROTOCOL_VERSION = 1;

// 标准化错误码定义
export enum RpcErrorCode {
    TIMEOUT = 'RPC_TIMEOUT',
    NO_HANDLER = 'RPC_NO_HANDLER',
    HANDLER_ERROR = 'RPC_HANDLER_ERROR',
    BAD_REQUEST = 'RPC_BAD_REQUEST',
    PERMISSION_DENIED = 'RPC_PERMISSION_DENIED'
}

// ============== 信封定义 (Envelope) ==============

/**
 * 单向全局广播信封
 * @example { v: 1, type: 'broadcast', topic: 'plugin:broadcast:state_changed', from: 'stx_llmhub', ts: 1729000000000, data: { isEnabled: true } }
 */
export interface BroadcastEnvelope<T = any> {
    v: number;               // 协议版本 (STX_PROTOCOL_VERSION)
    type: 'broadcast';       // 强类型标识
    topic: string;           // 广播的主题名称
    from: string;            // 发件插件环境标识 (namespace)
    ts: number;              // 触发时间戳
    data: T;                 // 实体数据 (不得超过限制或包含循环引用)
}

/**
 * RPC 请求发送信封
 */
export interface RpcRequestEnvelope<T = any> {
    v: number;               // 协议版本
    type: 'rpc:req';
    reqId: string;           // 全局唯一请求标识 (UUID)
    topic: string;           // 请求主题 (如 'plugin:request:ping')
    from: string;            // 请求方 namespace
    to?: string;             // 定向路由目标 namespace (单服务限定)
    ts: number;              // 请求建立时间
    ttlMs: number;           // 存活时间/超时阈值
    data: T;                 // 请求载荷
}

/**
 * RPC 响应接收信封（带异常包装机制）
 */
export interface RpcResponseEnvelope<T = any> {
    v: number;
    type: 'rpc:res';
    reqId: string;           // 对应 Request 里的 reqId
    topic: string;           // 回执主题 (如 'plugin:response:{reqId}')
    from: string;            // 真实处理该请求的服务器 namespace
    to?: string;             // 回包目标 (原始发件人 namespace)
    ts: number;              // 响应生成时间
    ok: boolean;             // 状态 (true: 成功, false: 框架/业务抛错了)
    data?: T;                // 成功时的回执内容
    error?: {                // 失败时的错误信息
        code: string;        // 来自 RpcErrorCode
        message: string;
        details?: any;
    };
}
