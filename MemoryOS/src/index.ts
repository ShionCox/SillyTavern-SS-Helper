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
export { EventBus } from './bus/bus';

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
import { STXBus, MemorySDK, LLMSDK, STXRegistry, PluginManifest } from '../../SDK/stx';
import { EventBus } from './bus/bus';
import { MemorySDKImpl } from './sdk/memory-sdk';
import { buildChatKey } from './utils/chat-namespace';

const logger = new Logger('记忆引擎');

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
        this.bindHostEvents();
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
        // 尝试从 SillyTavern 获取上下文
        let ctx: any = null;
        try {
            ctx = (window as any).SillyTavern?.getContext?.();
        } catch (e) {
            logger.warn('当前不在 SillyTavern 环境或核心尚未加载，放弃绑定钩子。');
            return;
        }

        if (!ctx || !ctx.eventSource) {
            logger.warn('无法获取 SillyTavern eventSource');
            return;
        }

        const eventSource = ctx.eventSource;
        const types = ctx.event_types || {};

        // ======= 前置防呆：统一获取开关设定 =======
        const isPluginEnabled = () => {
            if (!ctx?.extensionSettings) return false;
            const settings = ctx.extensionSettings['stx_memory_os'];
            return settings ? settings.enabled === true : false;
        };
        const isAiModeEnabled = () => {
            if (!ctx?.extensionSettings) return false;
            const settings = ctx.extensionSettings['stx_memory_os'];
            return settings ? settings.aiMode === true : false;
        };

        // 绑定聊天切换事件：初始化/切换数据库表空间
        const onChangeConfig = async () => {
            if (!isPluginEnabled()) return;

            const characters = ctx.characters || [];
            const chatId = ctx.chatId || '';
            const groupId = ctx.groupId || '';
            let characterId = '';

            // 简单取当前角色或组别
            if (!groupId && characters.length > 0 && ctx.characterId !== undefined) {
                characterId = characters[ctx.characterId]?.avatar || 'unknown';
            }

            // 构造强隔离 namespace
            const chatKey = buildChatKey({ chatId, groupId, characterId });
            logger.info(`会话信道已切换，当前分配 ChatKey: ${chatKey}`);

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
        };

        eventSource.on(types.CHAT_CHANGED || 'chat_changed', onChangeConfig);
        eventSource.on(types.CHAT_STARTED || 'chat_started', onChangeConfig);
        eventSource.on(types.CHAT_NEW || 'chat_new', onChangeConfig);

        // 绑定消息接收与发送事件
        eventSource.on(types.MESSAGE_RECEIVED || 'message_received', (msgId: any) => {
            if (!isPluginEnabled()) return;
            // 将文本流落入数据库的 events 表
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = Array.isArray(ctx.chat) ? ctx.chat.find((m: any) => m._id === msgId) || ctx.chat[ctx.chat.length - 1] : null;
                const text = messageObj ? (messageObj.mes || '') : '';
                logger.info('监听到新回复进入，准备记录记忆事件...');
                memory.events.append('chat.message.received', { text, msgId }, { sourcePlugin: 'sillytavern-core' });
            }
        });

        eventSource.on(types.USER_MESSAGE_RENDERED || 'user_message_rendered', (msgId: any) => {
            if (!isPluginEnabled()) return;
            const memory = (window as any).STX.memory;
            if (memory) {
                const messageObj = Array.isArray(ctx.chat) ? ctx.chat.find((m: any) => m._id === msgId) || ctx.chat[ctx.chat.length - 1] : null;
                const text = messageObj ? (messageObj.mes || '') : '';
                logger.info('监听到用户发言，准备记录记忆事件...');
                memory.events.append('chat.message.sent', { text, msgId }, { sourcePlugin: 'sillytavern-core' });
            }
        });

        // 绑定世代结束事件（有时候 MESSAGE_RECEIVED 获取不到完整更新）
        eventSource.on(types.GENERATION_ENDED || 'generation_ended', () => {
            if (!isPluginEnabled()) return;
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

        // 拦截最终大模型的发送包裹，写入由 Builder 构造出的记忆内容
        eventSource.on(types.CHAT_COMPLETION_PROMPT_READY || 'chat_completion_prompt_ready', async (payload: any) => {
            if (!isPluginEnabled()) return;
            const memory = (window as any).STX?.memory;
            if (!memory || !payload || !Array.isArray(payload.chat)) return;

            try {
                logger.info('触发大模型注入栈，正在向 Prompt 内附加短期事件池与摘要...');
                // 默认策略选取 "EVENTS" 最近动态事件和 "SUMMARY" 旧时摘要，可根据 UI 配置动态传参
                const injectedContext = await memory.injection.buildContext({
                    maxTokens: 800,
                    sections: ["WORLD_STATE", "FACTS", "EVENTS", "SUMMARY"]
                });

                if (injectedContext.trim().length === 0) return;

                const wrapperString = `\n<MEMORY_OS_CONTEXT>\n${injectedContext}\n</MEMORY_OS_CONTEXT>\n`;
                const policy = memory.injection.getAnchorPolicy?.() || { defaultInsert: 'top' };
                const insertTop = policy.defaultInsert === 'top';

                // 将内容隐式推送到最顶级的系统级信息或首条内
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
