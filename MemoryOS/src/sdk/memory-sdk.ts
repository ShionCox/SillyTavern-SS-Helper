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
import { ChatStateManager } from '../core/chat-state-manager';
import { TurnTracker } from '../core/turn-tracker';
import { RowResolver } from '../core/row-resolver';
import { RowOperationsManager } from '../core/row-operations';
import { PromptTrimmer } from '../core/prompt-trimmer';
import { db } from '../db/db';
import { buildDisplayTables } from '../template/table-derivation';
import type { TemplateTableDef } from '../template/types';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    AutoSchemaPolicy,
    ChatProfile,
    MaintenanceAdvice,
    MemoryQualityScorecard,
    RetentionPolicy,
    StrategyDecision,
    SummaryPolicyOverride,
    VectorLifecycleState,
    RowRefResolution,
    RowSeedData,
    LogicTableQueryOpts,
    LogicTableRow,
} from '../types';

/**
 * MemorySDK 门面层 —— 将所有管理器按规范接口统一暴露
 * v2: 增加聊天级状态、楼层跟踪、行操作、schemaContext 等新能力
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
    private chatStateManager: ChatStateManager;
    private turnTrackerManager: TurnTracker;
    private rowResolver: RowResolver;
    private rowOperations: RowOperationsManager;
    private promptTrimmer: PromptTrimmer;

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
        this.chatStateManager = new ChatStateManager(chatKey);
        this.turnTrackerManager = new TurnTracker(this.chatStateManager);
        this.extractManager = new ExtractManager(
            chatKey,
            this.eventsManager,
            this.templateManager,
            this.turnTrackerManager,
            this.chatStateManager,
        );
        this.injectionManager = new InjectionManager(
            chatKey,
            this.eventsManager,
            this.factsManager,
            this.stateManager,
            this.summariesManager,
            this.chatStateManager,
        );
        this.proposalManager = new ProposalManager(chatKey, this.chatStateManager);
        this.hybridSearch = new HybridSearchManager(
            chatKey,
            this.eventsManager,
            this.factsManager,
            this.summariesManager,
            this.chatStateManager,
        );
        this.compactionManager = new CompactionManager(chatKey);
        this.worldInfoWriter = new WorldInfoWriter(chatKey);
        this.rowResolver = new RowResolver(this.chatStateManager, this.factsManager);
        this.rowOperations = new RowOperationsManager(chatKey, this.chatStateManager, this.factsManager, this.auditManager);
        this.promptTrimmer = new PromptTrimmer(chatKey, this.templateManager, this.chatStateManager, this.factsManager);
    }

    /**
     * 初始化当前聊天分区（确保 meta 存在）
     * 应在切换聊天时调用一次
     */
    async init(): Promise<void> {
        await this.metaManager.ensureInit();
        await this.chatStateManager.load();
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

    /**
     * 功能：返回当前聊天可展示的逻辑表定义。
     * @returns 兼容旧模板回退后的表定义列表
     */
    private async listDisplayTables(): Promise<TemplateTableDef[]> {
        const activeTemplate = await this.templateManager.getActiveTemplate();
        const template = activeTemplate || (await this.templateManager.listByChatKey()).slice(-1)[0] || null;
        if (!template) {
            return [];
        }
        const facts = await db.facts
            .where('[chatKey+updatedAt]')
            .between([this.chatKey_, 0], [this.chatKey_, Infinity])
            .toArray();
        return buildDisplayTables(template.entities || {}, template.tables || [], facts);
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
        getEffective: () => {
            return this.templateManager.getActiveTemplate().then(async (template) => {
                if (template) {
                    return template;
                }
                const templates = await this.templateManager.listByChatKey();
                return templates[templates.length - 1] ?? null;
            });
        },
        listByChatKey: () => {
            return this.templateManager.listByChatKey();
        },
        listTables: async () => {
            return this.listDisplayTables();
        },
        listRevisions: async () => {
            const all = await this.templateManager.listByChatKey();
            return all.filter(t => t.templateFamilyId);
        },
        rollbackRevision: async (templateId: string) => {
            await this.templateManager.setActiveTemplate(templateId);
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
        writeback: (mode: 'facts' | 'summaries' | 'all' = 'all') => {
            return this.worldInfoWriter.writebackToST(mode);
        },
        preview: () => {
            return this.worldInfoWriter.previewWriteback();
        },
        getLogicTable: async (entityType: string, opts?: LogicTableQueryOpts) => {
            const facts = await this.factsManager.query({
                type: entityType,
                limit: opts?.limit ?? 200,
            });
            if (opts?.includeTombstones) return facts;
            // 过滤 tombstone 行
            const tombstones = await this.chatStateManager.getRowTombstones();
            return facts.filter(f => !tombstones[entityType]?.[f.entity?.id ?? '']);
        },
        updateFact: (factKey: string | undefined, type: string, entity: { kind: string; id: string }, path: string, value: any) => {
            return this.factsManager.upsert({ factKey, type, entity, path, value, confidence: 1.0, provenance: { extractor: 'manual' } });
        },
    };

    // ─── v2 新增：聊天级状态管理 ───

    chatState = {
        getChatProfile: (): Promise<ChatProfile> => {
            return this.chatStateManager.getChatProfile();
        },
        setChatProfileOverride: (override: Partial<ChatProfile>): Promise<void> => {
            return this.chatStateManager.setChatProfileOverride(override);
        },
        getAdaptiveMetrics: (): Promise<AdaptiveMetrics> => {
            return this.chatStateManager.getAdaptiveMetrics();
        },
        getAdaptivePolicy: (): Promise<AdaptivePolicy> => {
            return this.chatStateManager.getAdaptivePolicy();
        },
        getVectorLifecycle: (): Promise<VectorLifecycleState> => {
            return this.chatStateManager.getVectorLifecycle();
        },
        getIngestHealth: () => {
            return this.chatStateManager.getIngestHealth();
        },
        getRetrievalHealth: () => {
            return this.chatStateManager.getRetrievalHealth();
        },
        getExtractHealth: () => {
            return this.chatStateManager.getExtractHealth();
        },
        getMemoryQuality: (): Promise<MemoryQualityScorecard> => {
            return this.chatStateManager.getMemoryQuality();
        },
        recomputeMemoryQuality: (): Promise<MemoryQualityScorecard> => {
            return this.chatStateManager.recomputeMemoryQuality();
        },
        getMaintenanceAdvice: (): Promise<MaintenanceAdvice[]> => {
            return this.chatStateManager.getMaintenanceAdvice();
        },
        recomputeAdaptivePolicy: (): Promise<AdaptivePolicy> => {
            return this.chatStateManager.recomputeAdaptivePolicy();
        },
        getRetentionPolicy: (): Promise<RetentionPolicy> => {
            return this.chatStateManager.getRetentionPolicy();
        },
        setRetentionPolicyOverride: (override: Partial<RetentionPolicy>): Promise<void> => {
            return this.chatStateManager.setRetentionPolicyOverride(override);
        },
        getLastStrategyDecision: (): Promise<StrategyDecision | null> => {
            return this.chatStateManager.getLastStrategyDecision();
        },
        getSummaryPolicy: () => {
            return this.chatStateManager.getSummaryPolicy();
        },
        setSummaryPolicyOverride: (override: Partial<SummaryPolicyOverride>) => {
            return this.chatStateManager.setSummaryPolicyOverride(override);
        },
        getAutoSchemaPolicy: () => {
            return this.chatStateManager.getAutoSchemaPolicy();
        },
        setAutoSchemaPolicy: (policy: Partial<AutoSchemaPolicy>) => {
            return this.chatStateManager.setAutoSchemaPolicy(policy);
        },
        flush: () => {
            return this.chatStateManager.flush();
        },
        destroy: () => {
            return this.chatStateManager.destroy();
        },
    };

    // ─── v2 新增：楼层跟踪器 ───

    turnTracker = {
        tryCountTurn: (input: {
            eventType: string;
            messageId?: string;
            textContent: string;
            isSystemMessage: boolean;
            ingestHint: 'normal' | 'bootstrap' | 'backfill';
        }) => {
            return this.turnTrackerManager.tryCountTurn(input);
        },
        getAssistantTurnCount: () => {
            return this.turnTrackerManager.getAssistantTurnCount();
        },
        invalidateCache: () => {
            this.turnTrackerManager.invalidateCache();
        },
    };

    // ─── v2 新增：行操作 ───

    rows = {
        resolve: (tableKey: string, input: string): Promise<RowRefResolution> => {
            return this.rowResolver.resolveRowRef(tableKey, input);
        },
        resolveMany: (tableKey: string, inputs: string[]): Promise<RowRefResolution[]> => {
            return this.rowResolver.resolveRowRefs(tableKey, inputs);
        },
        create: (tableKey: string, rowId: string, seed?: RowSeedData) => {
            return this.rowOperations.createRow(tableKey, rowId, seed);
        },
        merge: (tableKey: string, fromRowId: string, toRowId: string) => {
            return this.rowOperations.mergeRows(tableKey, fromRowId, toRowId);
        },
        delete: (tableKey: string, rowId: string) => {
            return this.rowOperations.deleteRow(tableKey, rowId);
        },
        restore: (tableKey: string, rowId: string) => {
            return this.rowOperations.restoreRow(tableKey, rowId);
        },
        listTableRows: (tableKey: string, opts?: LogicTableQueryOpts): Promise<LogicTableRow[]> => {
            return this.rowOperations.listTableRows(tableKey, opts);
        },
        updateCell: (tableKey: string, rowId: string, fieldKey: string, value: unknown): Promise<string> => {
            return this.rowOperations.updateCell(tableKey, rowId, fieldKey, value);
        },
        setAlias: (tableKey: string, alias: string, canonicalRowId: string) => {
            return this.chatStateManager.setRowAlias(tableKey, alias, canonicalRowId);
        },
    };

    // ─── v2 新增：schemaContext 与 Prompt 裁剪 ───

    schemaContext = {
        build: (mode: 'extract' | 'summarize', windowKeywords?: string[]) => {
            return this.promptTrimmer.buildSchemaContext(mode, windowKeywords);
        },
    };
}
