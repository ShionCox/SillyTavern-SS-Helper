/**
 * MemoryOS 统一入口
 * 导出所有公共模块，供外部引用
 */

// 数据库层
export { MemoryOSDatabase, db } from './db/db';
export type {
    DBEvent, DBFact, DBWorldState, DBSummary, DBTemplate, DBAudit, DBMeta,
    DBWorldInfoCache, DBTemplateBinding,
    DBVectorChunk, DBVectorEmbedding, DBVectorMeta,
} from './db/db';

// 事件总线
export { EventBus } from '../../SDK/bus/bus';

// 核心管理器
export { EventsManager } from './core/events-manager';
export { FactsManager } from './core/facts-manager';
export { StateManager } from './core/state-manager';
export { SummariesManager } from './core/summaries-manager';
export { AuditManager } from './core/audit-manager';
export { MetaManager } from './core/meta-manager';
export { CompactionManager } from './core/compaction-manager';

// 注入管理器
export { InjectionManager } from './injection/injection-manager';

// 编排胶水层
export { Orchestrator } from './orchestrator/orchestrator';

// SDK 门面层
export { MemorySDKImpl } from './sdk/memory-sdk';

// 工具函数
export { buildChatKey } from './utils/chat-namespace';
export type { ChatNamespaceInput } from './utils/chat-namespace';
export { buildScopePrefix, buildScopedKey, validateScopeAccess } from './utils/scope-manager';
export type { ScopeLevel, ScopeContext } from './utils/scope-manager';

// 世界模板系统
export { TemplateManager } from './template/template-manager';
export { TemplateBuilder } from './template/template-builder';
export { WorldInfoReader } from './template/worldinfo-reader';
export { WorldInfoWriter } from './template/worldinfo-writer';
export type {
    WorldTemplate, TemplateEntity, TemplateFactType,
    ExtractPolicies, InjectionLayout,
    WorldInfoEntry, WorldContextBundle,
} from './template/types';

// 提议制与闸门验证
export { GateValidator } from './proposal/gate-validator';
export { ProposalManager } from './proposal/proposal-manager';
export type {
    ProposalEnvelope, ProposalResult, WriteRequest,
    FactProposal, PatchProposal, SummaryProposal, GateResult,
} from './proposal/types';

// 插件注册表
// UI 层
import { renderSettingsUi } from './ui/index';
import { Logger } from '../../SDK/logger';
import { Toast } from '../../SDK/toast';
import { respond } from '../../SDK/bus/rpc';
import { broadcast } from '../../SDK/bus/broadcast';
import { STXBus, MemorySDK, LLMSDK, STXRegistry, PluginManifest } from '../../SDK/stx';
import { EventBus } from '../../SDK/bus/bus';
import { MemorySDKImpl } from './sdk/memory-sdk';
import { buildChatKey } from './utils/chat-namespace';
import { db } from './db/db';
export { request, respond } from '../../SDK/bus/rpc';
export { broadcast, subscribe } from '../../SDK/bus/broadcast';

export const logger = new Logger('记忆引擎');
export const toast = new Toast('记忆引擎');

class STXRegistryImpl implements STXRegistry {
    register(manifest: PluginManifest): void {
        logger.info(`收到插件注册请求: ${manifest.pluginId}@${manifest.version}`);
        // 可以将注册信息保存到列表中
    }
}

class MemoryOS {
    private stxBus: EventBus;
    private registry: STXRegistryImpl;

    constructor() {
        logger.info('记忆引擎初始化完成');
        this.stxBus = new EventBus();
        this.registry = new STXRegistryImpl();

        this.initGlobalSTX();
        this.setupPluginBusEndpoints();
        this.bindHostEvents();
    }

    private setupPluginBusEndpoints() {
        const getEnabledFlag = () => {
            try {
                const ctx = (window as any).SillyTavern?.getContext?.() || {};
                return ctx?.extensionSettings?.['stx_memory_os']?.enabled === true;
            } catch {
                return false;
            }
        };

        respond('plugin:request:ping', 'stx_memory_os', async () => {
            return {
                alive: true,
                isEnabled: getEnabledFlag(),
                pluginId: 'stx_memory_os',
                version: '1.0.0',
                capabilities: ['memory', 'chat_index', 'rpc', 'ui'],
            };
        });

        respond('plugin:request:memory_chat_keys', 'stx_memory_os', async () => {
            try {
                const [metaKeys, eventKeys] = await Promise.all([
                    db.meta.toCollection().primaryKeys(),
                    db.events.orderBy('chatKey').uniqueKeys(),
                ]);
                const chatKeys = Array.from(
                    new Set(
                        [...metaKeys, ...eventKeys]
                            .map((item) => String(item ?? '').trim())
                            .filter(Boolean)
                    )
                );
                return {
                    chatKeys,
                    updatedAt: Date.now(),
                };
            } catch (error) {
                logger.warn('memory_chat_keys query failed', error);
                return {
                    chatKeys: [],
                    updatedAt: Date.now(),
                };
            }
        });

        setTimeout(() => {
            broadcast(
                'plugin:broadcast:state_changed',
                {
                    pluginId: 'stx_memory_os',
                    isEnabled: getEnabledFlag(),
                },
                'stx_memory_os'
            );
        }, 250);
    }

    private initGlobalSTX() {
        // 创建全局的 STX 互通底座
        (window as any).STX = {
            version: '1.0.0',
            bus: this.stxBus,
            registry: this.registry,
            memory: null, // 将在首次打开聊天时按 Namespace 赋值
            llm: null     // 预留给 LLMHub 注册
        };
        logger.success('STX 全局事件总线及插件中心已挂载');
    }

    private bindHostEvents() {
        const getCtx = () => {
            try {
                return (window as any).SillyTavern?.getContext?.();
            } catch (e) {
                return null;
            }
        };

        const initCtx = getCtx();
        if (!initCtx || !initCtx.eventSource) {
            logger.warn('无法获取 SillyTavern eventSource');
            return;
        }

        const eventSource = initCtx.eventSource;
        const types = initCtx.event_types || {};

        // ======= 前置防呆：统一获取开关设定 =======
        const isPluginEnabled = () => {
            const ctx = getCtx();
            if (!ctx?.extensionSettings) return false;
            const settings = ctx.extensionSettings['stx_memory_os'];
            return settings ? settings.enabled === true : false;
        };
        const isAiModeEnabled = () => {
            const ctx = getCtx();
            if (!ctx?.extensionSettings) return false;
            const settings = ctx.extensionSettings['stx_memory_os'];
            return settings ? settings.aiMode === true : false;
        };

        // 用 Set 追踪已记录的消息 ID，切换聊天时重置，防止重复事件写入两条记录
        const processedMsgIds = new Set<any>();

        // 绑定聊天切换事件：初始化/切换数据库表空间
        const onChangeConfig = async () => {
            const ctx = getCtx();

            // 无论是否启用，切换时都清空消息去重 Set
            processedMsgIds.clear();

            // 先打印切换通知，帮助排查事件是否正常触发
            const chatId = ctx?.chatId || '(未知)';
            logger.info(`检测到聊天切换，chatId: ${chatId}`);

            if (!isPluginEnabled()) {
                logger.info('插件当前未启用，跳过记忆库初始化');
                return;
            }

            if (!ctx) return;

            const characters = ctx.characters || [];
            const groupId = ctx.groupId || '';
            let characterId = '';

            // 简单取当前角色或组别
            if (!groupId && characters.length > 0 && ctx.characterId !== undefined) {
                characterId = characters[ctx.characterId]?.avatar || 'unknown';
            }

            // 构造强隔离 namespace
            const chatKey = buildChatKey({ chatId, groupId, characterId });
            logger.info(`已切换记忆，ChatKey: ${chatKey}`);

            // 初始化 SDK 实例
            const sdkInstance = new MemorySDKImpl(chatKey);
            await sdkInstance.init(); // 触发底层的 dexie 库初始化表

            // 卸载老实例拥有的监听器资源
            if ((window as any).STX.memory) {
                try {
                    (window as any).STX.memory.template.destroy();
                } catch (e) {
                    // Ignore missing or destroyed
                }
            }

            (window as any).STX.memory = sdkInstance;
            logger.success(`当前会话 ${chatKey} 数据库存储系统已就绪！`);
            toast.success(`数据库已就绪`);
        };

        eventSource.on(types.CHAT_CHANGED || 'chat_changed', onChangeConfig);
        eventSource.on(types.CHAT_STARTED || 'chat_started', onChangeConfig);
        eventSource.on(types.CHAT_NEW || 'chat_new', onChangeConfig);


        // 绑定消息接收与发送事件
        eventSource.on(types.MESSAGE_RECEIVED || 'message_received', (msgId: any) => {
            if (!isPluginEnabled()) return;
            if (processedMsgIds.has(msgId)) {
                logger.info(`MESSAGE_RECEIVED 重复触发已跳过，msgId: ${msgId}`);
                return;
            }
            processedMsgIds.add(msgId);
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = Array.isArray(ctx.chat) ? ctx.chat.find((m: any) => m._id === msgId) || ctx.chat[ctx.chat.length - 1] : null;
                const text = messageObj ? (messageObj.mes || '') : '';
                logger.info(`监听到新回复进入，msgId: ${msgId}，准备记录记忆事件...`);
                memory.events.append('chat.message.received', { text, msgId }, { sourcePlugin: 'sillytavern-core' });
            }
        });

        eventSource.on(types.USER_MESSAGE_RENDERED || 'user_message_rendered', (msgId: any) => {
            if (!isPluginEnabled()) return;
            if (processedMsgIds.has(msgId)) {
                logger.info(`USER_MESSAGE_RENDERED 重复触发已跳过，msgId: ${msgId}`);
                return;
            }
            processedMsgIds.add(msgId);
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = Array.isArray(ctx.chat) ? ctx.chat.find((m: any) => m._id === msgId) || ctx.chat[ctx.chat.length - 1] : null;
                const text = messageObj ? (messageObj.mes || '') : '';
                logger.info(`监听到用户发言，msgId: ${msgId}，准备记录记忆事件...`);
                memory.events.append('chat.message.sent', { text, msgId }, { sourcePlugin: 'sillytavern-core' });
            }
        });


        // 绑定世代结束事件（有时候 MESSAGE_RECEIVED 获取不到完整更新）
        eventSource.on(types.GENERATION_ENDED || 'generation_ended', () => {
            if (!isPluginEnabled()) return;
            const ctx = getCtx();
            if (!ctx) return;
            const memory = (window as any).STX.memory;
            if (memory && Array.isArray(ctx.chat) && ctx.chat.length > 0) {
                // 尝试触发一次持久化扫描或者状态记录
                memory.events.append('chat.generation.ended', {
                    lastMsgId: ctx.chat[ctx.chat.length - 1]?._id || ''
                }, { sourcePlugin: 'sillytavern-core' });

                // 🌟若启用了 AI 模式，这里是触发总结与压缩的绝佳锚点
                if (isAiModeEnabled()) {
                    logger.info('AI 增强模式已开启，尝试挂起闲置记忆池压缩任务...');
                    // 分发到 LLM Hub 的提取服务去
                    memory.extract.kickOffExtraction().catch((e: Error) => {
                        logger.error('记忆提取与压缩后台任务失败:', e);
                    });
                }
            }
        });

        // 时间戳节流去重：500ms 内的重复事件才跳过，不影响多次独立生成
        let lastPromptReadyTs = 0;

        // 拦截最终大模型的发送包裹，写入由 Builder 构造出的记忆内容
        eventSource.on(types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', async (payload: any) => {
            if (!isPluginEnabled()) return;
            const memory = (window as any).STX?.memory;
            if (!memory || !payload || !Array.isArray(payload.chat)) {
                logger.warn(`PROMPT_READY 跳过：memory=${!!memory}, payload=${!!payload}, chatArray=${Array.isArray(payload?.chat)}`);
                return;
            }

            // 节流去重：500ms 内重复触发只处理一次
            const now = Date.now();
            if (now - lastPromptReadyTs < 500) {
                logger.info('检测到 PROMPT_READY 重复触发（节流），已跳过');
                return;
            }
            lastPromptReadyTs = now;

            try {
                logger.info('触发大模型注入栈，正在向 Prompt 内附加短期事件池与摘要...');
                const injectedContext = await memory.injection.buildContext({
                    maxTokens: 800,
                    sections: ["WORLD_STATE", "FACTS", "EVENTS", "SUMMARY"]
                });

                logger.info(`buildContext 返回内容长度: ${injectedContext?.length ?? 0}`);

                if (!injectedContext || injectedContext.trim().length === 0) {
                    logger.warn('记忆上下文为空，跳过注入（数据库可能尚无内容）');
                    return;
                }

                const wrapperString = `\n<MEMORY_OS_CONTEXT>\n${injectedContext}\n</MEMORY_OS_CONTEXT>\n`;
                const policy = memory.injection.getAnchorPolicy?.() || { defaultInsert: 'top' };
                const insertTop = policy.defaultInsert === 'top';

                if (insertTop && payload.chat.length > 0) {
                    payload.chat[0].content = payload.chat[0].content + wrapperString;
                    logger.success('记忆注入完毕，附着于 System Prompt。');
                } else {
                    payload.chat.push({ role: 'system', content: wrapperString });
                    logger.success('记忆注入完毕，已作为底置 System 元素推入。');
                }

            } catch (error) {
                logger.error('Prompt Context 构建或注入失败:', error);
            }
        });
    }
}

// 模拟插件环境挂载
(window as any).MemoryOSPlugin = new MemoryOS();

// 自动初始化 UI 挂载
if (typeof document !== 'undefined') {
    renderSettingsUi().catch(err => {
        logger.error('UI rendering failed:', err);
    });
}
