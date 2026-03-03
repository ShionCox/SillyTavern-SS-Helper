/**
 * STXBus Topic Registry 插件注册中心与白名单
 * 用于规范所有流通的主题名称和使用权限，抵御越权。
 */

export type TopicType = 'broadcast' | 'rpc';

export interface TopicDefinition {
    id: string;             // 例如: plugin:request:ping
    type: TopicType;
    owner: string;          // 核心控制人或模块 namespace
    allowlist?: string[];   // 调用白名单，未定义或 ['*'] 视为全员开放可用
    description: string;
}

// 中心化注册登记表
export const TOPIC_REGISTRY: Record<string, TopicDefinition> = {
    // 1. 全局单向广播
    'plugin:broadcast:state_changed': {
        id: 'plugin:broadcast:state_changed',
        type: 'broadcast',
        owner: 'system',
        description: '通用状态更新广播。所有插件均可发出其自身的 enabled 等运行状态改变信息。',
        allowlist: ['*']
    },

    // 2. 基础微服务 RPC
    'plugin:request:ping': {
        id: 'plugin:request:ping',
        type: 'rpc',
        owner: 'system',
        description: '服务活性测试。用于确认对象服务是否 Alive 及拉取其 capabilities。',
        allowlist: ['*']
    },

    'plugin:request:memory_append_outcome': {
        id: 'plugin:request:memory_append_outcome',
        type: 'rpc',
        owner: 'stx_memory_os',
        description: '向 MemoryOS 写入外部结果/走向文本（如骰子结算结果）。',
        allowlist: ['*']
    },

    'plugin:request:hello': {
        id: 'plugin:request:hello',
        type: 'rpc',
        owner: 'stx_llmhub',
        description: '双向测例: LLMHub 专供问候接口。',
        allowlist: ['stx_memory_os', 'stx_template'] // 仅限这几个可以调
    }
};

/**
 * 校验 RPC 请求方的合法性 (P2-2)
 */
export function checkPermission(topicId: string, fromNamespace: string): boolean {
    const def = TOPIC_REGISTRY[topicId];
    if (!def) return true; // 如果是未做硬性约束的新鲜开发路由，暂且放行

    if (!def.allowlist || def.allowlist.length === 0 || def.allowlist.includes('*')) {
        return true;
    }

    return def.allowlist.includes(fromNamespace);
}
