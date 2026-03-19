import type {
    CanonSnapshot,
    DerivedRowCandidate,
    EditorExperienceSnapshot,
    EditorHealthSnapshot,
    LogicTableRepairMode,
    LogicTableSummary,
    LogicTableViewModel,
    MemorySDK,
} from '../../../SDK/stx';
import { Logger } from '../../../SDK/logger';
import { getTavernContextSnapshotEvent, isStableTavernRoleKeyEvent, parseAnyTavernChatRefEvent } from '../../../SDK/tavern';
import { EventsManager } from '../core/events-manager';
import { FactsManager } from '../core/facts-manager';
import { StateManager } from '../core/state-manager';
import { SummariesManager } from '../core/summaries-manager';
import { AuditManager } from '../core/audit-manager';
import { MetaManager } from '../core/meta-manager';
import { ExtractManager } from '../core/extract-manager';
import { InjectionManager } from '../injection/injection-manager';
import { TemplateManager } from '../template/template-manager';
import { ProposalManager, buildStableProposalSummaryId } from '../proposal/proposal-manager';
import { HybridSearchManager } from '../vector/hybrid-search';
import { CompactionManager } from '../core/compaction-manager';
import { WorldInfoWriter } from '../template/worldinfo-writer';
import { ChatStateManager } from '../core/chat-state-manager';
import { TurnTracker } from '../core/turn-tracker';
import { RowResolver } from '../core/row-resolver';
import { RowOperationsManager } from '../core/row-operations';
import { PromptTrimmer } from '../core/prompt-trimmer';
import { ChatViewManager } from '../core/chat-view-manager';
import { collectChatSemanticSeedWithAi } from '../core/chat-semantic-bootstrap';
import { inferStructuredSeedWorldStateEntries } from '../core/world-state-seed';
import { db, restoreArchivedMemoryChat } from '../db/db';
import manifestJson from '../../manifest.json';
import { ChatLifecycleManager } from '../core/chat-lifecycle-manager';
import { MEMORY_OS_PLUGIN_ID } from '../constants/pluginIdentity';
import { ensureSdkChatDocument } from '../../../SDK/db';
import { buildDisplayTables } from '../template/table-derivation';
import { MemoryEditorFacade } from './editor-facade';
import { LogicTableFacade } from './logic-table-facade';
import { openWorldbookInitPanel } from '../ui/index';
import type { TemplateTableDef } from '../template/types';
import type {
    AdaptiveMetrics,
    AdaptivePolicy,
    AutoSchemaPolicy,
    ChatSemanticSeed,
    ChatProfile,
    ColdStartLorebookSelection,
    EffectivePresetBundle,
    GroupMemoryState,
    InjectionIntent,
    InjectionSectionName,
    LorebookGateDecision,
    MaintenanceActionType,
    MaintenanceAdvice,
    MaintenanceExecutionResult,
    MaintenanceInsight,
    ChatLifecycleState,
    MemoryLifecycleState,
    MemoryQualityScorecard,
    MemoryTuningProfile,
    MemoryMutationHistoryAction,
    MemoryMutationTargetKind,
    OwnedMemoryState,
    PersonaMemoryProfile,
    PostGenerationGateDecision,
    PreGenerationGateDecision,
    PromptInjectionProfile,
    RecallLogEntry,
    RelationshipState,
    RetentionPolicy,
    StructuredWorldStateEntry,
    SimpleMemoryPersona,
    SummaryPolicyOverride,
    StrategyDecision,
    UserFacingChatPreset,
    VectorLifecycleState,
    WorldStateGroupingResult,
    RowRefResolution,
    RowSeedData,
    LogicTableQueryOpts,
    LogicTableRow,
    LogicalChatView,
} from '../types';
import type {
    ProposalResult,
    WriteRequest,
} from '../proposal/types';
import type { LatestRecallExplanation as SDKLatestRecallExplanation } from '../../../SDK/stx';

const logger = new Logger('MemorySDK');
const COLD_START_BOOTSTRAP_TASKS = new Map<string, Promise<void>>();
const COLD_START_WORLD_SELECTION_TASKS = new Map<string, Promise<ColdStartLorebookSelection | null>>();
const EMPTY_COLD_START_LOREBOOK_SELECTION: ColdStartLorebookSelection = { books: [], entries: [] };

function hasColdStartLorebookSelection(selection: ColdStartLorebookSelection | null | undefined): boolean {
    if (!selection) {
        return false;
    }
    return selection.books.length > 0 || selection.entries.length > 0;
}

function resolveStoredColdStartLorebookSelection(
    selection: ColdStartLorebookSelection,
    skipped: boolean,
): ColdStartLorebookSelection | undefined {
    if (skipped) {
        return EMPTY_COLD_START_LOREBOOK_SELECTION;
    }
    return hasColdStartLorebookSelection(selection) ? selection : undefined;
}

/**
 * 功能：构建长期记忆结构化写入时使用的稳定 factKey。
 * @param chatKey 当前聊天键。
 * @param type 事实类型。
 * @param entity 绑定实体。
 * @param path 路径。
 * @returns 稳定 factKey。
 */
function buildStableFactKey(
    chatKey: string,
    type: string,
    entity?: { kind: string; id: string },
    path?: string,
): string {
    const entityPart = entity ? `${String(entity.kind ?? '').trim()}:${String(entity.id ?? '').trim()}` : '_';
    const pathPart = String(path ?? '_').trim() || '_';
    return `${String(chatKey ?? '').trim()}::${String(type ?? '').trim()}::${entityPart}::${pathPart}`;
}

/**
 * 功能：构建统一写请求时使用的来源描述。
 * @returns 写请求来源。
 */
function buildMemoryWriteSource(): { pluginId: string; version: string } {
    return {
        pluginId: MEMORY_OS_PLUGIN_ID,
        version: String(manifestJson.version ?? '1.0.0').trim() || '1.0.0',
    };
}

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
    private chatViewManager: ChatViewManager;
    private editorFacade: MemoryEditorFacade;
    private logicTableFacade: LogicTableFacade;
    private coldStartPromptPrimeTask: Promise<boolean> | null = null;
    private coldStartExtractPrimeTask: Promise<boolean> | null = null;

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
        const writeGateway = {
            requestWrite: (request: WriteRequest): Promise<ProposalResult> => this.proposalManager.processWriteRequest(request),
        };
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
        this.rowOperations = new RowOperationsManager(chatKey, this.chatStateManager, this.factsManager, this.auditManager, writeGateway);
        this.promptTrimmer = new PromptTrimmer(chatKey, this.templateManager, this.chatStateManager, this.factsManager);
        this.chatViewManager = new ChatViewManager(chatKey);
        this.editorFacade = new MemoryEditorFacade(chatKey, this.templateManager, this.chatStateManager);
        this.logicTableFacade = new LogicTableFacade(chatKey, this.templateManager, this.chatStateManager, this.rowOperations);
    }

    /**
     * 功能：向 proposal 主链发起一次受信任的结构化写请求。
     * @param proposal 写入提议。
     * @param reason 写入原因。
     * @returns 写请求执行结果。
     */
    private async requestTrustedWrite(
        proposal: WriteRequest['proposal'],
        reason: string,
    ): Promise<ProposalResult> {
        return this.proposalManager.processWriteRequest({
            source: buildMemoryWriteSource(),
            chatKey: this.chatKey_,
            proposal,
            reason,
        });
    }

    /**
     * 初始化当前聊天分区（确保 meta 存在）
     * 应在切换聊天时调用一次
     */
    async init(): Promise<void> {
        await this.metaManager.ensureInit();
        await this.ensureChatDocumentReady();
        await this.chatStateManager.load();
        await this.bootstrapSemanticSeedIfNeeded();
    }

    /**
     * 功能：确保当前聊天已经建立统一 chat_document 主文档。
     * @returns Promise<void>
     */
    private async ensureChatDocumentReady(): Promise<void> {
        const scope = getTavernContextSnapshotEvent();
        const ref = parseAnyTavernChatRefEvent(this.chatKey_, {
            tavernInstanceId: String(scope?.tavernInstanceId ?? '').trim() || undefined,
            scopeType: scope?.scopeType,
            scopeId: String(scope?.scopeId ?? '').trim() || undefined,
        });
        if (!String(ref.chatId ?? '').trim() || String(ref.chatId ?? '').trim() === 'fallback_chat') {
            return;
        }
        await ensureSdkChatDocument(this.chatKey_, ref, {
            displayName: String(scope?.displayName ?? '').trim(),
            avatarUrl: String(scope?.avatarUrl ?? '').trim(),
            roleKey: String(scope?.roleKey ?? '').trim(),
            scopeType: ref.scopeType,
            scopeId: String(ref.scopeId ?? '').trim(),
        });
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
        return buildDisplayTables(template.tables || [], facts);
    }

    /**
        * 功能：收集并保存冷启动 seed，并立即落盘 starter facts/state，避免新聊天重复提示初始化。
     * @returns Promise<void>
     */
    private async bootstrapSemanticSeedIfNeeded(): Promise<void> {
        const existingTask = COLD_START_BOOTSTRAP_TASKS.get(this.chatKey_);
        if (existingTask) {
            return existingTask;
        }
        const task = this.performBootstrapSemanticSeedIfNeeded()
            .finally((): void => {
                if (COLD_START_BOOTSTRAP_TASKS.get(this.chatKey_) === task) {
                    COLD_START_BOOTSTRAP_TASKS.delete(this.chatKey_);
                }
            });
        COLD_START_BOOTSTRAP_TASKS.set(this.chatKey_, task);
        return task;
    }

    private async performBootstrapSemanticSeedIfNeeded(): Promise<void> {
        const presetBundle = await this.chatStateManager.getEffectivePresetBundle();
        if (presetBundle.autoBootstrapSemanticSeed === false) {
            return;
        }
        const [existingSeed, currentFingerprint] = await Promise.all([
            this.chatStateManager.getSemanticSeed(),
            this.chatStateManager.getColdStartFingerprint(),
        ]);
        if (existingSeed || currentFingerprint) {
            return;
        }
        const [savedSelection, skipped] = await Promise.all([
            this.chatStateManager.getColdStartLorebookSelection(),
            this.chatStateManager.isColdStartLorebookSelectionSkipped(),
        ]);
        const selectedLorebooks = skipped
            ? EMPTY_COLD_START_LOREBOOK_SELECTION
            : await this.resolveColdStartLorebookSelection(savedSelection);
        if (selectedLorebooks === null) {
            return;
        }
        if (hasColdStartLorebookSelection(selectedLorebooks)) {
            await this.chatStateManager.setColdStartLorebookSelection(selectedLorebooks);
        } else {
            await this.chatStateManager.setColdStartLorebookSelectionSkipped(true);
        }
        await this.chatStateManager.flush();
        const bootstrap = await collectChatSemanticSeedWithAi(this.chatKey_, selectedLorebooks, {
            forceAi: true,
            taskDescription: '正在分析冷启动资料并填写初始化结果。',
            taskPresentation: {
                surfaceMode: 'fullscreen_blocking',
                showToast: false,
                disableComposer: true,
                title: '冷启动资料分析',
                subtitle: 'AI 正在整理角色卡、世界书和上下文资料',
                description: `正在分析 ${selectedLorebooks.books.length} 本整书与 ${selectedLorebooks.entries.length} 条条目，并填写冷启动初始化结果。`,
                queueLabel: '冷启动资料分析',
                dedupeVisualKey: `cold-start-ai:${this.chatKey_}`,
            },
        });
        if (!bootstrap.seed) {
            logger.warn('[ColdStart][BootstrapNoSeed]', {
                chatKey: this.chatKey_,
                bindingFingerprint: bootstrap.bindingFingerprint,
                fingerprint: bootstrap.fingerprint,
                selectedBookCount: selectedLorebooks.books.length,
                selectedEntryCount: selectedLorebooks.entries.length,
            });
            return;
        }
        const seed = bootstrap.seed;
        if (bootstrap.bindingFingerprint) {
            await this.chatStateManager.setCharacterBindingFingerprint(bootstrap.bindingFingerprint);
        }
        await this.chatStateManager.saveSemanticSeed(seed, bootstrap.fingerprint);
        await this.persistSemanticSeed(seed, bootstrap.fingerprint, 'bootstrap_init');
        await this.chatStateManager.markColdStartStage('prompt_primed', bootstrap.fingerprint, { primedAt: Date.now() });
        await this.chatStateManager.flush();
    }

    private async resolveColdStartLorebookSelection(defaultSelection: ColdStartLorebookSelection): Promise<ColdStartLorebookSelection | null> {
        const existingTask = COLD_START_WORLD_SELECTION_TASKS.get(this.chatKey_);
        if (existingTask) {
            return existingTask;
        }
        const task = openWorldbookInitPanel({ initialSelection: defaultSelection })
            .finally((): void => {
                if (COLD_START_WORLD_SELECTION_TASKS.get(this.chatKey_) === task) {
                    COLD_START_WORLD_SELECTION_TASKS.delete(this.chatKey_);
                }
            });
        COLD_START_WORLD_SELECTION_TASKS.set(this.chatKey_, task);
        return task;
    }

    /**
     * 功能：把 seed 做轻量落地（prompt-prime 阶段），仅写 starter facts/state。
     * @param seed 语义种子。
     * @param fingerprint 种子指纹。
     * @param reason 触发来源。
     */
    private async persistSemanticSeed(seed: ChatSemanticSeed, fingerprint: string, reason: string = 'prompt_prime'): Promise<void> {
        const roleKey = String(seed.identitySeed?.roleKey ?? '').trim();
        const semanticCharacterId = String((seed.characterCore as Record<string, unknown> | undefined)?.characterId ?? '').trim();
        if (!isStableTavernRoleKeyEvent(roleKey, { characterId: semanticCharacterId })) {
            return;
        }
        const roleEntity = { kind: 'character', id: roleKey };
        const provenance = {
            extractor: 'semantic_seed_bootstrap',
            provider: 'stx_memory_os',
            fingerprint,
            source: {
                kind: 'cold_start',
                reason,
                viewHash: '',
                snapshotHash: '',
                messageIds: [],
                mutationKinds: [],
                repairGeneration: 0,
                ts: Date.now(),
            },
            ts: Date.now(),
        };
        await this.requestTrustedWrite({
            facts: [
                {
                    factKey: buildStableFactKey(this.chatKey_, 'semantic.identity', roleEntity, 'profile'),
                    targetRecordKey: buildStableFactKey(this.chatKey_, 'semantic.identity', roleEntity, 'profile'),
                    action: 'auto',
                    type: 'semantic.identity',
                    entity: roleEntity,
                    path: 'profile',
                    value: {
                        displayName: seed.identitySeed.displayName,
                        aliases: seed.identitySeed.aliases,
                        identity: seed.identitySeed.identity,
                        catchphrases: seed.identitySeed.catchphrases,
                        relationshipAnchors: seed.identitySeed.relationshipAnchors,
                        roleSummary: String(seed.aiSummary?.roleSummary ?? '').trim(),
                    },
                    confidence: 0.9,
                    provenance,
                },
                {
                    factKey: buildStableFactKey(this.chatKey_, 'semantic.style', roleEntity, 'mode'),
                    targetRecordKey: buildStableFactKey(this.chatKey_, 'semantic.style', roleEntity, 'mode'),
                    action: 'auto',
                    type: 'semantic.style',
                    entity: roleEntity,
                    path: 'mode',
                    value: {
                        mode: seed.styleSeed.mode,
                        cues: seed.styleSeed.cues,
                        presetStyle: seed.presetStyle,
                        aiStyleCues: seed.aiSummary?.styleCues ?? [],
                    },
                    confidence: 0.8,
                    provenance,
                },
            ],
            patches: [
                { op: 'replace', path: '/semantic/world/locations', value: seed.worldSeed.locations },
                { op: 'replace', path: '/semantic/world/rules', value: seed.worldSeed.rules },
                { op: 'replace', path: '/semantic/world/hardConstraints', value: seed.worldSeed.hardConstraints },
                { op: 'replace', path: '/semantic/world/entities', value: seed.worldSeed.entities },
                { op: 'replace', path: '/semantic/world/overview', value: String(seed.aiSummary?.worldSummary ?? '').trim() },
                { op: 'replace', path: '/semantic/meta/activeLorebooks', value: seed.activeLorebooks },
                { op: 'replace', path: '/semantic/meta/groupMembers', value: seed.groupMembers },
            ],
        }, `semantic_seed:${reason}`);
        const structuredSeedEntries = inferStructuredSeedWorldStateEntries(seed);
        for (const entry of structuredSeedEntries) {
            await this.requestTrustedWrite({
                patches: [{ op: 'replace', path: entry.path, value: entry.value }],
            }, `semantic_seed:structured:${reason}`);
        }
    }

    private async primeColdStartPrompt(reason: string): Promise<boolean> {
        return this.runColdStartPrimeTask('prompt', async (): Promise<boolean> => {
            if (await this.chatStateManager.isChatArchived()) {
                return false;
            }
            const [seed, fingerprint, stage] = await Promise.all([
                this.chatStateManager.getSemanticSeed(),
                this.chatStateManager.getColdStartFingerprint(),
                this.chatStateManager.getColdStartStage(),
            ]);
            if (!seed || !fingerprint) {
                return false;
            }
            if (stage === 'prompt_primed' || stage === 'extract_primed') {
                return false;
            }
            await this.persistSemanticSeed(seed, fingerprint, reason || 'prompt_prime');
            await this.chatStateManager.markColdStartStage('prompt_primed', fingerprint, { primedAt: Date.now() });
            return true;
        });
    }

    private async primeColdStartExtract(reason: string): Promise<boolean> {
        return this.runColdStartPrimeTask('extract', async (): Promise<boolean> => {
            if (await this.chatStateManager.isChatArchived()) {
                logger.info(`Cold-start extract 跳过：聊天已归档，reason=${reason}, chatKey=${this.chatKey_}`);
                return false;
            }
            const [seed, fingerprint, stage] = await Promise.all([
                this.chatStateManager.getSemanticSeed(),
                this.chatStateManager.getColdStartFingerprint(),
                this.chatStateManager.getColdStartStage(),
            ]);
            if (!seed || !fingerprint) {
                logger.info(`Cold-start extract 跳过：seed 或 fingerprint 缺失，reason=${reason}, chatKey=${this.chatKey_}, hasSeed=${Boolean(seed)}, hasFingerprint=${Boolean(fingerprint)}`);
                return false;
            }
            if (stage === 'extract_primed') {
                logger.info(`Cold-start extract 跳过：当前已是 extract_primed，reason=${reason}, chatKey=${this.chatKey_}, fingerprint=${fingerprint}`);
                return false;
            }
            if (stage === 'seeded') {
                logger.info(`Cold-start extract 前置触发 prompt prime，reason=${reason}, chatKey=${this.chatKey_}, fingerprint=${fingerprint}`);
                await this.primeColdStartPrompt('auto_prompt_prime_before_extract');
            }

            const summaryLines = [
                String(seed.aiSummary?.roleSummary ?? '').trim(),
                ...seed.identitySeed.identity.slice(0, 4),
                String(seed.aiSummary?.worldSummary ?? '').trim(),
                ...seed.worldSeed.rules.slice(0, 4),
                ...seed.worldSeed.hardConstraints.slice(0, 3),
            ].map((item: string): string => String(item ?? '').trim()).filter(Boolean);
            if (summaryLines.length > 0) {
                const summaryText = summaryLines.join('\n');
                logger.info(`Cold-start extract 准备写入索引，reason=${reason}, chatKey=${this.chatKey_}, fingerprint=${fingerprint}, summaryLines=${summaryLines.length}, summaryLen=${summaryText.length}`);
                const summaryId = buildStableProposalSummaryId({
                    chatKey: this.chatKey_,
                    consumerPluginId: MEMORY_OS_PLUGIN_ID,
                    level: 'scene',
                    title: 'Cold-start prime',
                    content: summaryText,
                    visibleMessageIds: [],
                    viewHash: '',
                    ordinal: 0,
                });
                const writeResult = await this.requestTrustedWrite({
                    summaries: [{
                        summaryId,
                        targetRecordKey: summaryId,
                        action: 'auto',
                        level: 'scene',
                        title: 'Cold-start prime',
                        content: summaryText,
                        source: {
                            extractor: 'cold_start',
                            provider: 'stx_memory_os',
                            provenance: {
                                extractor: 'cold_start',
                                provider: 'stx_memory_os',
                                fingerprint,
                                source: {
                                    kind: 'cold_start',
                                    reason,
                                    viewHash: '',
                                    snapshotHash: '',
                                    messageIds: [],
                                    mutationKinds: [],
                                    repairGeneration: 0,
                                    ts: Date.now(),
                                },
                            },
                        },
                    }],
                }, `cold_start_extract:${reason}`);
                if (this.chatStateManager) {
                    const candidate = await this.chatStateManager.buildMemoryCandidate({
                        candidateId: writeResult.applied.summaryIds[0] ?? summaryId,
                        kind: 'summary',
                        source: 'cold_start',
                        summary: `Cold-start prime ${summaryText}`.trim(),
                        payload: {
                            level: 'scene',
                            title: 'Cold-start prime',
                            content: summaryText,
                            source: {
                                extractor: 'cold_start',
                                provider: 'stx_memory_os',
                                provenance: {
                                    extractor: 'cold_start',
                                    provider: 'stx_memory_os',
                                    fingerprint,
                                },
                            },
                        },
                        extractedAt: Date.now(),
                    });
                    await this.chatStateManager.applyEncodingToRecord(writeResult.applied.summaryIds[0] ?? summaryId, 'summary', candidate.encoding);
                }
            }
            logger.info(`Cold-start extract 完成，reason=${reason}, chatKey=${this.chatKey_}, fingerprint=${fingerprint}`);
            await this.chatStateManager.markColdStartStage('extract_primed', fingerprint, { primedAt: Date.now() });
            return true;
        });
    }

    /**
     * 功能：为冷启动提示或提取阶段提供单飞门闩，避免并发事件重复执行。
     * @param kind 冷启动阶段类型。
     * @param task 实际执行任务。
     * @returns 当前阶段的执行结果。
     */
    private async runColdStartPrimeTask(kind: 'prompt' | 'extract', task: () => Promise<boolean>): Promise<boolean> {
        const currentTask = kind === 'prompt' ? this.coldStartPromptPrimeTask : this.coldStartExtractPrimeTask;
        if (currentTask) {
            return currentTask;
        }

        const nextTask: Promise<boolean> = task().finally((): void => {
            if (kind === 'prompt') {
                this.coldStartPromptPrimeTask = null;
                return;
            }
            this.coldStartExtractPrimeTask = null;
        });

        if (kind === 'prompt') {
            this.coldStartPromptPrimeTask = nextTask;
        } else {
            this.coldStartExtractPrimeTask = nextTask;
        }

        return nextTask;
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
        upsert: async (fact: {
            factKey?: string;
            type: string;
            entity?: { kind: string; id: string };
            path?: string;
            value: any;
            confidence?: number;
            provenance?: any;
        }) => {
            const factKey = String(fact.factKey ?? '').trim() || buildStableFactKey(this.chatKey_, fact.type, fact.entity, fact.path);
            await this.requestTrustedWrite({
                facts: [{
                    factKey,
                    targetRecordKey: factKey,
                    action: fact.factKey ? 'update' : 'auto',
                    type: fact.type,
                    entity: fact.entity,
                    path: fact.path,
                    value: fact.value,
                    confidence: fact.confidence,
                    provenance: fact.provenance,
                }],
            }, 'sdk.facts.upsert');
            if (this.chatStateManager) {
                const candidate = await this.chatStateManager.buildMemoryCandidate({
                    candidateId: factKey,
                    kind: 'fact',
                    source: 'memory_sdk',
                    summary: `${String(fact.type ?? '').trim()} ${String(fact.path ?? '').trim()} ${JSON.stringify(fact.value ?? '')}`.trim(),
                    payload: {
                        type: fact.type,
                        entity: fact.entity,
                        path: fact.path,
                        value: fact.value,
                        confidence: fact.confidence,
                        provenance: fact.provenance,
                    },
                    extractedAt: Date.now(),
                });
                await this.chatStateManager.applyEncodingToRecord(factKey, 'fact', candidate.encoding);
            }
            return factKey;
        },
        get: (factKey: string) => {
            return this.factsManager.get(factKey);
        },
        query: (opts: { type?: string; entity?: { kind: string; id: string }; pathPrefix?: string; limit?: number }) => {
            return this.factsManager.query(opts);
        },
        remove: async (factKey: string) => {
            const existing = await this.factsManager.get(factKey);
            if (!existing) {
                return;
            }
            await this.requestTrustedWrite({
                facts: [{
                    factKey,
                    targetRecordKey: factKey,
                    action: 'delete',
                    type: existing.type,
                    entity: existing.entity,
                    path: existing.path,
                    value: existing.value,
                    confidence: existing.confidence,
                    provenance: existing.provenance,
                }],
            }, 'sdk.facts.remove');
        },
    };

    // 世界状态
    state = {
        get: (path: string) => {
            return this.stateManager.get(path);
        },
        set: (path: string, value: any, meta?: { sourceEventId?: string }) => {
            void meta;
            return this.requestTrustedWrite({
                patches: [{ op: 'replace', path, value }],
            }, 'sdk.state.set').then((): void => undefined);
        },
        patch: (patches: Array<{ op: "add" | "replace" | "remove"; path: string; value?: any }>, meta?: any) => {
            void meta;
            return this.requestTrustedWrite({
                patches,
            }, 'sdk.state.patch').then((): void => undefined);
        },
        query: (prefix: string) => {
            return this.stateManager.query(prefix);
        },
        queryStructured: (prefix?: string): Promise<StructuredWorldStateEntry[]> => {
            return this.stateManager.queryStructured(prefix);
        },
        queryGrouped: (prefix?: string): Promise<WorldStateGroupingResult> => {
            return this.stateManager.queryGrouped(prefix);
        },
    };

    // 摘要
    summaries = {
        upsert: async (summary: { level: "message" | "scene" | "arc"; messageId?: string; title?: string; content: string; keywords?: string[] }) => {
            const summaryId = buildStableProposalSummaryId({
                chatKey: this.chatKey_,
                consumerPluginId: MEMORY_OS_PLUGIN_ID,
                level: summary.level,
                title: summary.title,
                content: summary.content,
                keywords: summary.keywords,
                visibleMessageIds: summary.messageId ? [summary.messageId] : [],
                viewHash: '',
                ordinal: 0,
            });
            await this.requestTrustedWrite({
                summaries: [{
                    summaryId,
                    targetRecordKey: summaryId,
                    action: 'auto',
                    level: summary.level,
                    messageId: summary.messageId,
                    title: summary.title,
                    content: summary.content,
                    keywords: summary.keywords,
                }],
            }, 'sdk.summaries.upsert');
            if (this.chatStateManager) {
                const candidate = await this.chatStateManager.buildMemoryCandidate({
                    candidateId: summaryId,
                    kind: 'summary',
                    source: 'memory_sdk',
                    summary: `${String(summary.title ?? '').trim()} ${String(summary.content ?? '').trim()}`.trim(),
                    payload: {
                        level: summary.level,
                        messageId: summary.messageId,
                        title: summary.title,
                        content: summary.content,
                        keywords: summary.keywords,
                    },
                    extractedAt: Date.now(),
                });
                await this.chatStateManager.applyEncodingToRecord(summaryId, 'summary', candidate.encoding);
            }
            return summaryId;
        },
        query: (opts: { level?: string; sinceTs?: number; limit?: number }) => {
            return this.summariesManager.query(opts);
        },
    };

    // 注入控制
    injection = {
        buildContext: (opts?: {
            maxTokens?: number;
            sections?: InjectionSectionName[];
            query?: string;
            sectionBudgets?: Partial<Record<InjectionSectionName, number>>;
            preferSummary?: boolean;
            intentHint?: InjectionIntent;
            includeDecisionMeta?: boolean;
        }) => {
            return this.injectionManager.buildContext(opts);
        },
        setPromptInjectionProfile: (opts: {
            queryMode?: 'always' | 'setting_only';
            settingOnlyMinScore?: number;
        }) => {
            return this.injectionManager.setPromptInjectionProfile(opts);
        },
        getPromptInjectionProfile: (): PromptInjectionProfile => {
            return this.injectionManager.getPromptInjectionProfile();
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
        /**
         * @deprecated 仅保留给旧世界书/事实表兼容调用；计划在 v0.8 移除。
         * 新编辑器请改用 logicTable.* / rows.*。
         */
        getLogicTable: async (entityType: string, opts?: LogicTableQueryOpts) => {
            const rows = await this.rowOperations.listTableRows(entityType, opts);
            return rows.map((row: LogicTableRow) => ({
                factKey: row.factKeys?.['__primary__'] || row.factKeys?.[Object.keys(row.factKeys || {})[0] || ''] || undefined,
                type: row.tableKey,
                entity: { kind: row.tableKey, id: row.rowId },
                path: '',
                value: row.values,
                tombstoned: row.tombstoned,
                redirectedTo: row.redirectedTo,
                aliases: row.aliases,
                updatedAt: row.updatedAt,
                _legacyRow: row,
            }));
        },
        updateFact: (factKey: string | undefined, type: string, entity: { kind: string; id: string }, path: string, value: any) => {
            return this.facts.upsert({ factKey, type, entity, path, value, confidence: 1.0, provenance: { extractor: 'manual' } });
        },
    };

    logicTable = {
        listLogicTables: (): Promise<LogicTableSummary[]> => {
            return this.logicTableFacade.listLogicTables();
        },
        getLogicTableView: (tableKey: string): Promise<LogicTableViewModel> => {
            return this.logicTableFacade.getLogicTableView(tableKey);
        },
        listBackfillCandidates: (tableKey: string): Promise<DerivedRowCandidate[]> => {
            return this.logicTableFacade.listBackfillCandidates(tableKey);
        },
        promoteDerivedRow: async (tableKey: string, candidateId: string): Promise<void> => {
            await this.logicTableFacade.promoteDerivedRow(tableKey, candidateId);
        },
        mergeRows: async (tableKey: string, sourceRowId: string, targetRowId: string): Promise<void> => {
            const result = await this.rowOperations.mergeRows(tableKey, sourceRowId, targetRowId);
            if (!result.success) {
                throw new Error(result.error || '行合并失败');
            }
        },
        restoreRow: async (tableKey: string, rowId: string): Promise<void> => {
            await this.rowOperations.restoreRow(tableKey, rowId);
        },
        tombstoneRow: async (tableKey: string, rowId: string): Promise<void> => {
            await this.rowOperations.deleteRow(tableKey, rowId);
        },
        setAlias: async (tableKey: string, rowId: string, alias: string): Promise<void> => {
            await this.chatStateManager.setRowAlias(tableKey, alias, rowId);
        },
        updateCell: async (tableKey: string, rowId: string, columnKey: string, value: unknown): Promise<void> => {
            await this.rowOperations.updateCell(tableKey, rowId, columnKey, value);
        },
        repairTable: async (_tableKey: string, mode: LogicTableRepairMode): Promise<void> => {
            if (mode === 'rebuild_candidates') {
                await this.editor.refreshSemanticSeed();
                return;
            }
            await this.chatStateManager.runMaintenanceAction('schema_cleanup');
        },
    };

    editor = {
        getCanonSnapshot: (): Promise<CanonSnapshot> => {
            return this.editorFacade.getCanonSnapshot();
        },
        getEditorHealth: (): Promise<EditorHealthSnapshot> => {
            return this.editorFacade.getEditorHealth();
        },
        getExperienceSnapshot: (): Promise<EditorExperienceSnapshot> => {
            return this.editorFacade.getExperienceSnapshot();
        },
        refreshCanonSnapshot: (): Promise<CanonSnapshot> => {
            return this.editorFacade.getCanonSnapshot();
        },
        rebuildChatView: async (): Promise<LogicalChatView> => {
            const context = (window as any)?.SillyTavern?.getContext?.();
            const previous = await this.chatStateManager.getLogicalChatView();
            const rebuildResult = this.chatViewManager.rebuildFromChat(context?.chat, previous);
            await this.chatStateManager.setLogicalChatView(rebuildResult.view, 'sdk.editor.rebuild');
            await this.turnTrackerManager.rebuildFromLogicalView(rebuildResult.view);
            return rebuildResult.view;
        },
        refreshSemanticSeed: async (): Promise<CanonSnapshot> => {
            const [savedSelection, skipped] = await Promise.all([
                this.chatStateManager.getColdStartLorebookSelection(),
                this.chatStateManager.isColdStartLorebookSelectionSkipped(),
            ]);
            const bootstrap = await collectChatSemanticSeedWithAi(
                this.chatKey_,
                resolveStoredColdStartLorebookSelection(savedSelection, skipped),
            );
            if (bootstrap.seed) {
                if (bootstrap.bindingFingerprint) {
                    await this.chatStateManager.setCharacterBindingFingerprint(bootstrap.bindingFingerprint);
                }
                await this.chatStateManager.saveSemanticSeed(bootstrap.seed, bootstrap.fingerprint);
                await this.persistSemanticSeed(bootstrap.seed, bootstrap.fingerprint, 'editor_refresh');
            }
            return this.editorFacade.getCanonSnapshot();
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
        getSummaryPolicyOverride: () => {
            return this.chatStateManager.getSummaryPolicyOverride();
        },
        setSummaryPolicyOverride: (override: SummaryPolicyOverride) => {
            return this.chatStateManager.setSummaryPolicyOverride(override);
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
        getMaintenanceInsights: (): Promise<MaintenanceInsight[]> => {
            return this.chatStateManager.getMaintenanceInsights();
        },
        getLifecycleState: (): Promise<ChatLifecycleState> => {
            return this.chatStateManager.getLifecycleState();
        },
        runMaintenanceAction: (action: MaintenanceActionType): Promise<MaintenanceExecutionResult> => {
            return this.chatStateManager.runMaintenanceAction(action);
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
        getAutoSchemaPolicy: () => {
            return this.chatStateManager.getAutoSchemaPolicy();
        },
        setAutoSchemaPolicy: (policy: Partial<AutoSchemaPolicy>) => {
            return this.chatStateManager.setAutoSchemaPolicy(policy);
        },
        setCharacterBindingFingerprint: (fingerprint: string): Promise<void> => {
            return this.chatStateManager.setCharacterBindingFingerprint(fingerprint);
        },
        bootstrapSemanticSeed: async (): Promise<void> => {
            await this.bootstrapSemanticSeedIfNeeded();
        },
        getSemanticSeed: (): Promise<ChatSemanticSeed | null> => {
            return this.chatStateManager.getSemanticSeed();
        },
        getPersonaMemoryProfile: (): Promise<PersonaMemoryProfile | null> => {
            return this.chatStateManager.getPersonaMemoryProfile();
        },
        getPersonaMemoryProfiles: (): Promise<Record<string, PersonaMemoryProfile>> => {
            return this.chatStateManager.getPersonaMemoryProfiles();
        },
        getPersonaMemoryProfileForActor: (actorKey: string): Promise<PersonaMemoryProfile | null> => {
            return this.chatStateManager.getPersonaMemoryProfileForActor(actorKey);
        },
        getActiveActorKey: (): Promise<string | null> => {
            return this.chatStateManager.getActiveActorKey();
        },
        setActiveActorKey: (actorKey: string | null): Promise<string | null> => {
            return this.chatStateManager.setActiveActorKey(actorKey);
        },
        getSimpleMemoryPersona: (): Promise<SimpleMemoryPersona | null> => {
            return this.chatStateManager.getSimpleMemoryPersona();
        },
        recomputePersonaMemoryProfile: (): Promise<PersonaMemoryProfile> => {
            return this.chatStateManager.recomputePersonaMemoryProfile();
        },
        recomputePersonaMemoryProfiles: (): Promise<Record<string, PersonaMemoryProfile>> => {
            return this.chatStateManager.recomputePersonaMemoryProfiles();
        },
        getRecallLog: (limit?: number): Promise<RecallLogEntry[]> => {
            return this.chatStateManager.getRecallLog(limit);
        },
        getLatestRecallExplanation: (): Promise<SDKLatestRecallExplanation | null> => {
            return this.chatStateManager.getLatestRecallExplanation() as Promise<SDKLatestRecallExplanation | null>;
        },
        getMemoryLifecycleSummary: (limit?: number): Promise<MemoryLifecycleState[]> => {
            return this.chatStateManager.getMemoryLifecycleSummary(limit);
        },
        getOwnedMemoryStates: (limit?: number): Promise<OwnedMemoryState[]> => {
            return this.chatStateManager.getOwnedMemoryStates(limit);
        },
        updateOwnedMemoryState: (recordKey: string, patch: Partial<Pick<OwnedMemoryState, 'ownerActorKey' | 'memoryType' | 'memorySubtype' | 'sourceScope' | 'importance' | 'forgotten' | 'forgottenReasonCodes'>>): Promise<OwnedMemoryState | null> => {
            return this.chatStateManager.updateOwnedMemoryState(recordKey, patch);
        },
        recomputeOwnedMemoryState: (recordKey: string): Promise<OwnedMemoryState | null> => {
            return this.chatStateManager.recomputeOwnedMemoryState(recordKey);
        },
        getRelationshipState: (): Promise<RelationshipState[]> => {
            return this.chatStateManager.getRelationshipState();
        },
        recomputeRelationshipState: (): Promise<RelationshipState[]> => {
            return this.chatStateManager.recomputeRelationshipState();
        },
        getMemoryTuningProfile: (): Promise<MemoryTuningProfile> => {
            return this.chatStateManager.getMemoryTuningProfile();
        },
        setMemoryTuningProfile: (profile: Partial<MemoryTuningProfile>): Promise<MemoryTuningProfile> => {
            return this.chatStateManager.setMemoryTuningProfile(profile);
        },
        getMutationHistory: (opts?: { limit?: number; recordKey?: string; targetKind?: MemoryMutationTargetKind; action?: MemoryMutationHistoryAction }) => {
            return this.chatStateManager.getMutationHistory(opts);
        },
        getColdStartStage: () => {
            return this.chatStateManager.getColdStartStage();
        },
        primeColdStartPrompt: async (reason: string = 'chat_completion_prompt_ready'): Promise<boolean> => {
            return this.primeColdStartPrompt(reason);
        },
        primeColdStartExtract: async (reason: string = 'generation_ended'): Promise<boolean> => {
            return this.primeColdStartExtract(reason);
        },
        getLorebookDecision: (): Promise<LorebookGateDecision | null> => {
            return this.chatStateManager.getLorebookDecision();
        },
        getGroupMemory: (): Promise<GroupMemoryState | null> => {
            return this.chatStateManager.getGroupMemory();
        },
        getPromptInjectionProfile: (): Promise<PromptInjectionProfile> => {
            return this.chatStateManager.getPromptInjectionProfile();
        },
        setPromptInjectionProfile: (profile: Partial<PromptInjectionProfile>): Promise<void> => {
            return this.chatStateManager.setPromptInjectionProfile(profile);
        },
        getEffectivePresetBundle: (): Promise<EffectivePresetBundle> => {
            return this.chatStateManager.getEffectivePresetBundle();
        },
        saveGlobalPreset: (preset: UserFacingChatPreset): Promise<void> => {
            return this.chatStateManager.saveGlobalPreset(preset);
        },
        saveRolePreset: (preset: UserFacingChatPreset): Promise<void> => {
            return this.chatStateManager.saveRolePreset(preset);
        },
        clearRolePreset: (): Promise<void> => {
            return this.chatStateManager.clearRolePreset();
        },
        getUserFacingPreset: (): Promise<UserFacingChatPreset | null> => {
            return this.chatStateManager.getUserFacingPreset();
        },
        setUserFacingPreset: (preset: UserFacingChatPreset | null): Promise<void> => {
            return this.chatStateManager.setUserFacingPreset(preset);
        },
        getLastPreGenerationDecision: (): Promise<PreGenerationGateDecision | null> => {
            return this.chatStateManager.getLastPreGenerationDecision();
        },
        getLastPostGenerationDecision: (): Promise<PostGenerationGateDecision | null> => {
            return this.chatStateManager.getLastPostGenerationDecision();
        },
        getLogicalChatView: () => {
            return this.chatStateManager.getLogicalChatView();
        },
        rebuildLogicalChatView: async (): Promise<LogicalChatView> => {
            const context = (window as any)?.SillyTavern?.getContext?.();
            const previous = await this.chatStateManager.getLogicalChatView();
            const rebuildResult = this.chatViewManager.rebuildFromChat(context?.chat, previous);
            await this.chatStateManager.setLogicalChatView(rebuildResult.view, 'sdk.rebuild');
            await this.turnTrackerManager.rebuildFromLogicalView(rebuildResult.view);
            return rebuildResult.view;
        },
        archiveChat: async (): Promise<void> => {
            await this.chatStateManager.setRetentionPolicyOverride({
                deletionStrategy: 'soft_delete',
            });
            await this.chatStateManager.flush();
            const lifecycle = new ChatLifecycleManager();
            await lifecycle.applyChatDeletionLifecycle(this.chatKey_, 'soft_delete');
        },
        restoreArchivedChat: async (): Promise<void> => {
            await this.chatStateManager.restoreArchivedMemoryChat();
            await restoreArchivedMemoryChat(this.chatKey_);
        },
        purgeChat: async (options?: { includeAudit?: boolean }): Promise<void> => {
            await this.chatStateManager.setRetentionPolicyOverride({
                deletionStrategy: 'immediate_purge',
            });
            await this.chatStateManager.flush();
            const lifecycle = new ChatLifecycleManager();
            await lifecycle.applyChatDeletionLifecycle(this.chatKey_, 'immediate_purge');
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
        getActiveAssistantTurnCount: () => {
            return this.turnTrackerManager.getActiveAssistantTurnCount();
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
