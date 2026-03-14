import type { MemorySDK } from '../../../SDK/stx';
import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { AuditManager } from '../core/audit-manager';
import { MetaManager } from '../core/meta-manager';
import { ExtractManager } from '../core/extract-manager';
import { InjectionManager } from '../injection/injection-manager';
import { TemplateManager } from '../template/template-manager';
import { ProposalManager } from '../proposal/proposal-manager';
import { HybridSearchManager } from '../vector/hybrid-search';
import { CompactionManager } from '../core/compaction-manager';
import { WorldInfoWriter } from '../template/worldinfo-writer';

/**
 * MemorySDK 门面层 —— 将所有管理器按规范接口统一暴露
 * 实现 SDK/stx.d.ts 中定义的 MemorySDK 接口
 * 每个 chatKey 对应一个独立的实例（聊天隔离）
 */
export class MemorySDKImpl implements MemorySDK {
    private chatKey_: string;
    private eventsManager: EventsManager;
    private factsManager: FactsManager;
    private stateManager: StateManager;
    private summariesManager: SummariesManager;
    private auditManager: AuditManager;
    private metaManager: MetaManager;
    private extractManager: ExtractManager;
    private injectionManager: InjectionManager;
    private templateManager: TemplateManager;
    private proposalManager: ProposalManager;
    private hybridSearch: HybridSearchManager;
    private compactionManager: CompactionManager;
    private worldInfoWriter: WorldInfoWriter;

    constructor(chatKey: string) {
        this.chatKey_ = chatKey;
        this.eventsManager = new EventsManager(chatKey);
        this.factsManager = new FactsManager(chatKey);
        this.stateManager = new StateManager(chatKey);
        this.summariesManager = new SummariesManager(chatKey);
        this.auditManager = new AuditManager(chatKey);
        this.metaManager = new MetaManager(chatKey);
        this.templateManager = new TemplateManager(chatKey);
        this.templateManager.installSillyTavernHooks();
        this.extractManager = new ExtractManager(
            chatKey,
            this.eventsManager,
            this.templateManager
        );
        this.injectionManager = new InjectionManager(
            chatKey,
            this.eventsManager,
            this.factsManager,
            this.stateManager,
            this.summariesManager
        );
        this.proposalManager = new ProposalManager(chatKey);
        this.hybridSearch = new HybridSearchManager(
            chatKey,
            this.eventsManager,
            this.factsManager,
            this.summariesManager
        );
        this.compactionManager = new CompactionManager(chatKey);
        this.worldInfoWriter = new WorldInfoWriter(chatKey);
    }

    /**
     * 初始化当前聊天分区（确保 meta 存在）
     * 应在切换聊天时调用一次
     */
    async init(): Promise<void> {
        await this.metaManager.ensureInit();
    }

    // --- MemorySDK 接口实现 ---

    getChatKey(): string {
        return this.chatKey_;
    }

    async getActiveTemplateId(): Promise<string | null> {
        return this.metaManager.getActiveTemplateId();
    }

    async setActiveTemplateId(templateId: string): Promise<void> {
        await this.metaManager.setActiveTemplateId(templateId);
    }

    // 事件流
    events = {
        append: <T>(type: string, payload: T, meta?: { sourceMessageId?: string; sourcePlugin?: string }) => {
            return this.eventsManager.append(type, payload, meta);
        },
        query: (opts: { type?: string; sinceTs?: number; limit?: number }) => {
            return this.eventsManager.query(opts);
        },
    };

    // 事实
    facts = {
        upsert: (fact: {
            factKey?: string;
            type: string;
            entity?: { kind: string; id: string };
            path?: string;
            value: any;
            confidence?: number;
            provenance?: any;
        }) => {
            return this.factsManager.upsert(fact);
        },
        get: (factKey: string) => {
            return this.factsManager.get(factKey);
        },
        query: (opts: { type?: string; entity?: { kind: string; id: string }; pathPrefix?: string; limit?: number }) => {
            return this.factsManager.query(opts);
        },
        remove: (factKey: string) => {
            return this.factsManager.remove(factKey);
        },
    };

    // 世界状态
    state = {
        get: (path: string) => {
            return this.stateManager.get(path);
        },
        set: (path: string, value: any, meta?: { sourceEventId?: string }) => {
            return this.stateManager.set(path, value, meta);
        },
        patch: (patches: Array<{ op: "add" | "replace" | "remove"; path: string; value?: any }>, meta?: any) => {
            return this.stateManager.patch(patches, meta);
        },
        query: (prefix: string) => {
            return this.stateManager.query(prefix);
        },
    };

    // 摘要
    summaries = {
        upsert: (summary: { level: "message" | "scene" | "arc"; messageId?: string; title?: string; content: string; keywords?: string[] }) => {
            return this.summariesManager.upsert(summary);
        },
        query: (opts: { level?: string; sinceTs?: number; limit?: number }) => {
            return this.summariesManager.query(opts);
        },
    };

    // 注入控制
    injection = {
        buildContext: (opts?: { maxTokens?: number; sections?: Array<"WORLD_STATE" | "FACTS" | "EVENTS" | "SUMMARY">; query?: string; sectionBudgets?: Partial<Record<"WORLD_STATE" | "FACTS" | "EVENTS" | "SUMMARY", number>>; preferSummary?: boolean }) => {
            return this.injectionManager.buildContext(opts);
        },
        setAnchorPolicy: (opts: { allowSystem?: boolean; allowUser?: boolean; defaultInsert?: "top" | "beforeStart" | "customAnchor" }) => {
            return this.injectionManager.setAnchorPolicy(opts);
        },
    };

    // 审计/回滚
    audit = {
        list: (opts?: { sinceTs?: number; limit?: number }) => {
            return this.auditManager.list(opts);
        },
        rollbackToSnapshot: (snapshotId: string) => {
            return this.auditManager.rollbackToSnapshot(snapshotId);
        },
        createSnapshot: (note?: string) => {
            return this.auditManager.createSnapshot(note);
        },
    };

    // 提取机制触发钩子
    extract = {
        kickOffExtraction: () => {
            return this.extractManager.kickOffExtraction();
        }
    };

    // 提议制写入网关（四道闸门）
    proposal = {
        /** AI 任务提议入口：经过 schema / diff / 权限 / 审计 四道闸门后才会真正落盘 */
        processProposal: (envelope: any, consumerPluginId: string) => {
            return this.proposalManager.processProposal(envelope, consumerPluginId);
        },
        /** 外部插件直接提交结构化写入请求的接口 */
        requestWrite: (request: any) => {
            return this.proposalManager.processWriteRequest(request);
        },
        /** 授权某个插件可以提交 fact/state 写入 */
        grantPermission: (pluginId: string) => {
            this.proposalManager.grantPermission(pluginId);
        },
        /** 撤销某个插件的写入权限 */
        revokePermission: (pluginId: string) => {
            this.proposalManager.revokePermission(pluginId);
        }
    };

    // 模板管理 (TemplateOS/WorldInfo)
    template = {
        getById: (templateId: string) => {
            return this.templateManager.getById(templateId);
        },
        getActive: () => {
            return this.templateManager.getActiveTemplate();
        },
        listByChatKey: () => {
            return this.templateManager.listByChatKey();
        },
        setActive: (templateId: string, opts?: { lock?: boolean }) => {
            return this.templateManager.setActiveTemplate(templateId, opts);
        },
        setLock: (locked: boolean) => {
            return this.templateManager.setTemplateLock(locked);
        },
        getBinding: () => {
            return this.templateManager.getBinding();
        },
        rebuildFromWorldInfo: () => {
            return this.templateManager.forceRebuildFromWorldInfo();
        },
        destroy: () => {
            this.templateManager.destroy();
        }
    };

    // 向量层与混合检索 (Milestone 6)
    vector = {
        /**
         * 三路混合检索（向量 + 关键词 + 最近事件），并发执行，任意一路失败静默降级
         */
        search: (query: string, options?: { maxVectorResults?: number; maxKeywordResults?: number; maxEventResults?: number }) => {
            return this.hybridSearch.search(query, options);
        },
        /**
         * 为一段文本建立向量索引（异步，不阻塞主流程）
         */
        indexText: (text: string, bookId?: string) => {
            return this.hybridSearch.indexText(text, bookId);
        },
        /**
         * 将混合检索结果格式化为可注入 Prompt 的字符串
         */
        formatForPrompt: (results: any[]) => {
            return this.hybridSearch.formatForPrompt(results);
        },
    };

    // Compaction（事件流压缩）
    compaction = {
        /**
         * 检查当前聊天是否需要执行压缩
         */
        needsCompaction: () => {
            return this.compactionManager.needsCompaction();
        },
        /**
         * 执行 RULE 模式压缩（聚合旧事件 → scene summary，软归档已处理事件）
         */
        compact: (opts?: { windowSize?: number; archiveProcessed?: boolean }) => {
            return this.compactionManager.compactRuleMode(opts);
        },
        /**
         * 从事件流回放重建 world_state（RULE 模式核心能力）
         */
        replayToState: (opts?: { sinceTs?: number }) => {
            return this.compactionManager.replayToState(opts);
        },
    };

    // 世界书写回（World Info Write-back）
    worldInfo = {
        /**
         * 将稳定事实/摘要写回 SillyTavern 的 WorldInfo，使 ST 原生引擎可以注入
         * @param mode 'facts' | 'summaries' | 'all'
         */
        writeback: (mode: 'facts' | 'summaries' | 'all' = 'all') => {
            return this.worldInfoWriter.writebackToST(mode);
        },
        /**
         * 预览将会写回的条目（不实际写入）
         */
        preview: () => {
            return this.worldInfoWriter.previewWriteback();
        },
        /**
         * 读取当前 chatKey 下所有逻辑表实体（按 template 的 entities 分组的 facts）
         * 可用于逻辑表 UI 可编辑展示
         */
        getLogicTable: async (entityType: string) => {
            const facts = await this.factsManager.query({
                type: entityType,
                limit: 200,
            });
            return facts;
        },
        /**
         * 写一条 fact（逻辑表编辑时直接调用）
         */
        updateFact: (factKey: string | undefined, type: string, entity: { kind: string; id: string }, path: string, value: any) => {
            return this.factsManager.upsert({ factKey, type, entity, path, value, confidence: 1.0, provenance: { extractor: 'manual' } });
        },
    };
}
