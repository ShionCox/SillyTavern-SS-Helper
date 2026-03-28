import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { logger, toast } from '../runtime/runtime-services';
import type { MemorySDKImpl } from '../sdk/memory-sdk';
import { escapeHtml } from './editorShared';
import type { UnifiedMemoryWorkbenchOpenOptions, UnifiedWorkbenchViewMode } from './unifiedMemoryWorkbenchTypes';
import type {
    ActorMemoryProfile,
    MemoryEntry,
    MemoryEntryType,
    RoleEntryMemory,
} from '../types';
import unifiedMemoryWorkbenchCssText from './unifiedMemoryWorkbench.css?inline';
import {
    type WorkbenchView,
    type ActorSubView,
    type WorkbenchState,
    type WorkbenchSnapshot,
    type WorkbenchActorGraph,
    type WorkbenchActorGraphLink,
    type WorkbenchGraphLinkType,
    escapeAttr,
    readInputValue,
    readCheckedValue,
    parseTagText,
    parseTypeFieldsJson,
    collectDetailPayload,
    mergeWorkbenchDetailPayload,
    createDraftEntry,
    resolveSelectedEntry,
    resolveSelectedType,
    resolveSelectedActor,
    buildDynamicFieldMarkup,
    isUserActorKey,
    toRecord,
    toStringArray,
    truncateText,
} from './workbenchTabs/shared';
import { buildEntriesViewMarkup } from './workbenchTabs/tabEntries';
import { buildTypesViewMarkup } from './workbenchTabs/tabTypes';
import { buildPreviewViewMarkup } from './workbenchTabs/tabPreview';
import { buildActorsViewMarkup } from './workbenchTabs/tabActors';
import { buildMemoryGraphViewMarkup } from './workbenchTabs/tabMemoryGraph';
import { mountRelationshipGraph } from './workbenchTabs/actorTabs/relationshipGraph';
import { mountMemoryGraph } from './workbenchTabs/memoryGraph';
import { buildMemoryGraph } from './workbenchTabs/shared/buildMemoryGraph';

const WORKBENCH_STYLE_ID = 'stx-memory-workbench-style';

/**
 * 功能：确保工作台样式只注入一次。
 * @returns 无返回值。
 */
function ensureWorkbenchStyle(): void {
    const existing = document.getElementById(WORKBENCH_STYLE_ID) as HTMLStyleElement | null;
    if (existing) {
        if (existing.textContent !== unifiedMemoryWorkbenchCssText) {
            existing.textContent = unifiedMemoryWorkbenchCssText;
        }
        return;
    }
    const style = document.createElement('style');
    style.id = WORKBENCH_STYLE_ID;
    style.textContent = unifiedMemoryWorkbenchCssText;
    document.head.appendChild(style);
}

/**
 * 功能：兼容旧入口视图名称。
 * @param initialView 打开时传入的旧视图。
 * @returns 工作台视图名。
 */
function resolveInitialWorkbenchView(initialView?: UnifiedWorkbenchViewMode): WorkbenchView {
    if (initialView === 'memory') {
        return 'actors';
    }
    if (initialView === 'diagnostics' || initialView === 'raw') {
        return 'preview';
    }
    if (initialView === 'world') {
        return 'entries';
    }
    return 'entries';
}

/**
 * 功能：读取当前聊天的 MemorySDK 实例。
 * @returns SDK 实例或空值。
 */
function getActiveMemorySdk(): MemorySDKImpl | null {
    const memory = (window as any)?.STX?.memory as MemorySDKImpl | null | undefined;
    return memory ?? null;
}

/**
 * 功能：构建工作台整体 HTML。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @returns 页面 HTML。
 */
function buildWorkbenchMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const typeMap = new Map(snapshot.entryTypes.map((item: MemoryEntryType): [string, MemoryEntryType] => [item.key, item]));
    const filteredEntries = snapshot.entries.filter((entry: MemoryEntry): boolean => {
        const query = state.entryQuery.toLowerCase();
        if (!query) {
            return true;
        }
        return [entry.title, entry.summary, entry.detail, entry.entryType, entry.category, ...(entry.tags ?? [])]
            .join(' ')
            .toLowerCase()
            .includes(query);
    });
    const selectedEntry = resolveSelectedEntry(snapshot, state);
    const selectedEntryType = typeMap.get(selectedEntry?.entryType ?? '') ?? resolveSelectedType(snapshot, state);
    const entryDraft = selectedEntry ?? createDraftEntry(selectedEntryType);
    const selectedType = resolveSelectedType(snapshot, state);
    const selectedActor = resolveSelectedActor(snapshot, state);
    const selectedActorMemories = snapshot.roleMemories.filter((item: RoleEntryMemory): boolean => item.actorKey === selectedActor?.actorKey);
    const entryOptions = snapshot.entries.map((entry: MemoryEntry): string => {
        return `<option value="${escapeAttr(entry.entryId)}"${state.bindEntryId === entry.entryId ? ' selected' : ''}>${escapeHtml(entry.title)}</option>`;
    }).join('');
    const dynamicFields = buildDynamicFieldMarkup(selectedEntryType, entryDraft.detailPayload);

    return `
        <div class="stx-memory-workbench">
            <header class="stx-memory-workbench__header">
                <div class="stx-memory-workbench__brand">
                    <i class="fa-solid fa-microchip"></i> MemoryOS 记忆工作台
                </div>
                <nav class="stx-memory-workbench__nav">
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'entries' ? ' is-active' : ''}" data-workbench-view="entries">
                        条目中心
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'types' ? ' is-active' : ''}" data-workbench-view="types">
                        类型工坊
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'actors' ? ' is-active' : ''}" data-workbench-view="actors">
                        角色档案
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'preview' ? ' is-active' : ''}" data-workbench-view="preview">
                        诊断中心
                    </button>
                    <button class="stx-memory-workbench__nav-btn${state.currentView === 'memory-graph' ? ' is-active' : ''}" data-workbench-view="memory-graph">
                        可视化记忆
                    </button>
                </nav>
                <div class="stx-memory-workbench__stats">
                    <span title="当前聊天中的记忆条目数量">条目 <strong>${snapshot.entries.length}</strong></span>
                    <span title="当前聊天可用的条目类型数量">类型 <strong>${snapshot.entryTypes.length}</strong></span>
                    <span title="角色与条目之间的真实绑定数量">绑定 <strong>${snapshot.roleMemories.length}</strong></span>
                </div>
            </header>
            <main class="stx-memory-workbench__main">
                ${buildEntriesViewMarkup(filteredEntries, snapshot, state, typeMap, entryDraft, selectedEntry, selectedEntryType, dynamicFields)}
                ${buildTypesViewMarkup(snapshot, state, selectedType)}
                ${buildActorsViewMarkup(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                ${buildPreviewViewMarkup(snapshot, state)}
                ${buildMemoryGraphViewMarkup(snapshot, state, snapshot.memoryGraph, {
                    selectedGraphNodeId: state.selectedGraphNodeId,
                    memoryGraphQuery: state.memoryGraphQuery,
                    memoryGraphFilterType: state.memoryGraphFilterType,
                    graphMode: (state.memoryGraphMode as any) || 'compact',
                })}
            </main>
        </div>
    `;
}

/**
 * 功能：打开统一记忆工作台。
 * @param options 打开参数。
 * @returns 无返回值。
 */
export function openUnifiedMemoryWorkbench(options: UnifiedMemoryWorkbenchOpenOptions = {}): void {
    ensureWorkbenchStyle();
    openSharedDialog({
        id: 'stx-memory-unified-workbench',
        size: 'fullscreen',
        layout: 'bare',
        chrome: false,
        bodyHtml: '<div id="stx-memory-workbench-root"></div>',
        onMount: (instance: SharedDialogInstance): void => {
            void mountWorkbench(instance, options).catch((error: unknown): void => {
                logger.error('挂载 MemoryOS 工作台失败', error);
                toast.error(`工作台加载失败：${String((error as Error)?.message ?? error)}`);
            });
        },
    });
}

/**
 * 功能：挂载统一记忆工作台。
 * @param instance 对话框实例。
 * @param options 打开参数。
 * @returns 异步挂载结果。
 */
async function mountWorkbench(instance: SharedDialogInstance, options: UnifiedMemoryWorkbenchOpenOptions): Promise<void> {
    const memory = getActiveMemorySdk();
    if (!memory) {
        instance.content.innerHTML = '<div class="stx-memory-workbench__empty">当前未连接到记忆主链，无法打开工作台。</div>';
        return;
    }

    const root = instance.content.querySelector('#stx-memory-workbench-root') as HTMLElement | null;
    if (!root) {
        return;
    }

    const state: WorkbenchState = {
        currentView: resolveInitialWorkbenchView(options.initialView),
        currentActorTab: 'attributes',
        selectedEntryId: '',
        selectedTypeKey: '',
        selectedActorKey: '',
        entryQuery: '',
        previewQuery: '',
        bindEntryId: '',
        actorQuery: '',
        actorSortOrder: 'stat-desc',
        actorTagFilter: '',
        selectedGraphNodeId: '',
        memoryGraphQuery: '',
        memoryGraphFilterType: '',
        memoryGraphMode: 'compact',
    };

    /**
     * 功能：读取工作台所需快照。
     * @returns 工作台快照。
     */
    const loadSnapshot = async (): Promise<WorkbenchSnapshot> => {
        const [
            entryTypes,
            entries,
            actors,
            roleMemories,
            summaries,
            preview,
            worldProfileBinding,
            mutationHistory,
            recallExplanation,
        ] = await Promise.all([
            memory.unifiedMemory.entryTypes.list(),
            memory.unifiedMemory.entries.list({ query: state.entryQuery }),
            memory.unifiedMemory.actors.list(),
            memory.unifiedMemory.roleMemory.list(),
            memory.unifiedMemory.summaries.list(8),
            memory.unifiedMemory.prompts.preview({ query: state.previewQuery }),
            memory.unifiedMemory.diagnostics.getWorldProfileBinding(),
            memory.unifiedMemory.diagnostics.listMutationHistory(16),
            memory.chatState.getLatestRecallExplanation(),
        ]);

        return {
            entryTypes,
            entries,
            actors,
            roleMemories,
            summaries,
            preview,
            worldProfileBinding,
            mutationHistory,
            recallExplanation: normalizeRecallExplanation(recallExplanation),
            actorGraph: buildActorGraph(actors, entries),
            memoryGraph: buildMemoryGraph(entries, roleMemories, actors),
        };
    };

    /**
     * 功能：保证当前选择始终有效。
     * @param snapshot 当前快照。
     * @returns 无返回值。
     */
    const normalizeSelection = (snapshot: WorkbenchSnapshot): void => {
        if (!state.selectedEntryId && snapshot.entries.length > 0) {
            state.selectedEntryId = snapshot.entries[0]!.entryId;
        }
        if (state.selectedEntryId && !snapshot.entries.some((entry: MemoryEntry): boolean => entry.entryId === state.selectedEntryId)) {
            state.selectedEntryId = snapshot.entries[0]?.entryId ?? '';
        }
        if (!state.selectedTypeKey && snapshot.entryTypes.length > 0) {
            state.selectedTypeKey = snapshot.entryTypes[0]!.key;
        }
        if (state.selectedTypeKey && !snapshot.entryTypes.some((item: MemoryEntryType): boolean => item.key === state.selectedTypeKey)) {
            state.selectedTypeKey = snapshot.entryTypes[0]?.key ?? '';
        }
        if (!state.selectedActorKey && snapshot.actors.length > 0) {
            state.selectedActorKey = snapshot.actors[0]!.actorKey;
        }
        if (state.selectedActorKey && !snapshot.actors.some((item: ActorMemoryProfile): boolean => item.actorKey === state.selectedActorKey)) {
            state.selectedActorKey = snapshot.actors[0]?.actorKey ?? '';
        }
        if (!state.bindEntryId && snapshot.entries.length > 0) {
            state.bindEntryId = snapshot.entries[0]!.entryId;
        }
        if (state.bindEntryId && !snapshot.entries.some((entry: MemoryEntry): boolean => entry.entryId === state.bindEntryId)) {
            state.bindEntryId = snapshot.entries[0]?.entryId ?? '';
        }
    };

    /**
     * 功能：处理工作台动作。
     * @param action 动作名。
     * @param snapshot 当前快照。
     * @param button 触发按钮。
     * @returns 异步处理结果。
     */
    const handleAction = async (action: string, snapshot: WorkbenchSnapshot, button: HTMLElement): Promise<void> => {
        try {
            if (action === 'create-entry') {
                const fallbackType = snapshot.entryTypes.find((item: MemoryEntryType): boolean => item.key === 'other') ?? snapshot.entryTypes[0];
                state.selectedEntryId = '';
                state.selectedTypeKey = fallbackType?.key ?? state.selectedTypeKey;
                await render();
                return;
            }
            if (action === 'save-entry') {
                const entryTypeKey = readInputValue(root, '#stx-memory-entry-type') || state.selectedTypeKey || 'other';
                const type = snapshot.entryTypes.find((item: MemoryEntryType): boolean => item.key === entryTypeKey);
                const existingEntry = snapshot.entries.find((entry: MemoryEntry): boolean => entry.entryId === String(button.dataset.entryId ?? '').trim());
                const saved = await memory.unifiedMemory.entries.save({
                    entryId: String(button.dataset.entryId ?? '').trim() || undefined,
                    title: readInputValue(root, '#stx-memory-entry-title'),
                    entryType: entryTypeKey,
                    category: readInputValue(root, '#stx-memory-entry-category') || type?.category || '其他',
                    tags: parseTagText(readInputValue(root, '#stx-memory-entry-tags')),
                    summary: readInputValue(root, '#stx-memory-entry-summary'),
                    detail: readInputValue(root, '#stx-memory-entry-detail'),
                    detailPayload: mergeWorkbenchDetailPayload(existingEntry?.detailPayload, collectDetailPayload(root)),
                });
                state.selectedEntryId = saved.entryId;
                toast.success('条目已保存。');
                await render();
                return;
            }
            if (action === 'delete-entry') {
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!entryId) {
                    return;
                }
                await memory.unifiedMemory.entries.remove(entryId);
                state.selectedEntryId = '';
                toast.success('条目已删除。');
                await render();
                return;
            }
            if (action === 'create-type') {
                state.selectedTypeKey = '';
                await render();
                return;
            }
            if (action === 'save-type') {
                const savedType = await memory.unifiedMemory.entryTypes.save({
                    key: readInputValue(root, '#stx-memory-type-key'),
                    label: readInputValue(root, '#stx-memory-type-label'),
                    category: readInputValue(root, '#stx-memory-type-category') as MemoryEntryType['category'],
                    description: readInputValue(root, '#stx-memory-type-description'),
                    icon: readInputValue(root, '#stx-memory-type-icon'),
                    accentColor: readInputValue(root, '#stx-memory-type-color'),
                    injectToSystem: readCheckedValue(root, '#stx-memory-type-system'),
                    bindableToRole: readCheckedValue(root, '#stx-memory-type-bindable'),
                    fields: parseTypeFieldsJson(readInputValue(root, '#stx-memory-type-fields')),
                });
                state.selectedTypeKey = savedType.key;
                toast.success('类型已保存。');
                await render();
                return;
            }
            if (action === 'delete-type') {
                const typeKey = String(button.dataset.typeKey ?? '').trim();
                if (!typeKey) {
                    return;
                }
                await memory.unifiedMemory.entryTypes.remove(typeKey);
                state.selectedTypeKey = '';
                toast.success('类型已删除。');
                await render();
                return;
            }
            if (action === 'create-actor') {
                state.selectedActorKey = '';
                state.currentActorTab = 'attributes';
                await render();
                return;
            }
            if (action === 'save-actor') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key');
                const displayName = readInputValue(root, '#stx-memory-actor-label');
                const isUserActor = isUserActorKey(actorKey);
                const memoryStat = Number(readInputValue(root, '#stx-memory-actor-stat') || 60);
                const actor = await memory.unifiedMemory.actors.ensure(
                    isUserActor
                        ? { actorKey, displayName }
                        : { actorKey, displayName, memoryStat },
                );
                if (!isUserActor) {
                    await memory.unifiedMemory.actors.setMemoryStat(actor.actorKey, memoryStat);
                }
                state.selectedActorKey = actor.actorKey;
                toast.success('角色资料已保存。');
                await render();
                return;
            }
            if (action === 'bind-entry') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key') || state.selectedActorKey;
                const entryId = String((root.querySelector('#stx-memory-bind-entry') as HTMLSelectElement | null)?.value ?? state.bindEntryId).trim();
                if (!actorKey || !entryId) {
                    toast.info('请先选择角色和条目。');
                    return;
                }
                await memory.unifiedMemory.roleMemory.bind(actorKey, entryId);
                toast.success('条目已绑定到角色。');
                await render();
                return;
            }
            if (action === 'unbind-entry') {
                const actorKey = state.selectedActorKey;
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!actorKey || !entryId) {
                    return;
                }
                await memory.unifiedMemory.roleMemory.unbind(actorKey, entryId);
                toast.success('角色绑定已解除。');
                await render();
                return;
            }
            if (action === 'refresh-preview') {
                state.previewQuery = readInputValue(root, '#stx-memory-preview-query');
                await render();
                return;
            }
            if (action === 'capture-summary') {
                await memory.postGeneration.scheduleRoundProcessing('unified_memory_workbench', { force: true });
                toast.success('已触发强制快照归档。');
                await render();
            }
            if (action === 'export-chat-database') {
                const databaseSnapshot = await memory.chatState.exportCurrentChatDatabaseSnapshotForTest();
                const fileName = buildChatDatabaseExportFileName(memory.getChatKey());
                downloadJsonFile(fileName, databaseSnapshot);
                toast.success('当前聊天记忆库已导出。');
                return;
            }
            if (action === 'clear-chat-database') {
                const confirmed = window.confirm('确定要删除当前聊天数据库吗？此操作会清空当前聊天的记忆条目、角色绑定、总结、世界画像和历史记录，且无法恢复。');
                if (!confirmed) {
                    return;
                }
                await memory.chatState.clearCurrentChatData();
                state.selectedEntryId = '';
                state.selectedTypeKey = '';
                state.selectedActorKey = '';
                state.bindEntryId = '';
                toast.success('当前聊天数据库已删除。');
                await render();
                return;
            }
            if (action === 'graph-jump-entry') {
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (entryId) {
                    state.selectedEntryId = entryId;
                    state.currentView = 'entries';
                    await render();
                }
                return;
            }
        } catch (error) {
            logger.error(`工作台动作执行失败: ${action}`, error);
            toast.error(`操作失败：${String((error as Error)?.message ?? error)}`);
        }
    };

    /**
     * 功能：绑定工作台事件。
     * @param snapshot 当前快照。
     * @returns 无返回值。
     */
    const bindEvents = (snapshot: WorkbenchSnapshot): void => {
        root.querySelectorAll<HTMLElement>('[data-workbench-view]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.currentView = String(button.dataset.workbenchView ?? 'entries') as WorkbenchView;
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-actor-tab]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.currentActorTab = String(button.dataset.actorTab ?? 'attributes') as ActorSubView;
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-entry]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedEntryId = String(button.dataset.selectEntry ?? '').trim();
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-type]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedTypeKey = String(button.dataset.selectType ?? '').trim();
                void render();
            });
        });

        root.querySelectorAll<HTMLElement>('[data-select-actor]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.selectedActorKey = String(button.dataset.selectActor ?? '').trim();
                void render();
            });
        });

        const entryQueryInput = root.querySelector('#stx-memory-entry-query') as HTMLInputElement | null;
        entryQueryInput?.addEventListener('input', (): void => {
            state.entryQuery = String(entryQueryInput.value ?? '').trim();
            void render();
        });

        const previewQueryInput = root.querySelector('#stx-memory-preview-query') as HTMLInputElement | null;
        previewQueryInput?.addEventListener('input', (): void => {
            state.previewQuery = String(previewQueryInput.value ?? '').trim();
        });

        const actorQueryInput = root.querySelector('#stx-memory-actor-query') as HTMLInputElement | null;
        actorQueryInput?.addEventListener('input', (): void => {
            state.actorQuery = String(actorQueryInput.value ?? '').trim();
            void render();
        });

        const actorSortSelect = root.querySelector('#stx-memory-actor-sort') as HTMLSelectElement | null;
        actorSortSelect?.addEventListener('change', (): void => {
            state.actorSortOrder = String(actorSortSelect.value ?? '') as WorkbenchState['actorSortOrder'];
            void render();
        });

        const actorTagSelect = root.querySelector('#stx-memory-actor-tag-filter') as HTMLSelectElement | null;
        actorTagSelect?.addEventListener('change', (): void => {
            state.actorTagFilter = String(actorTagSelect.value ?? '').trim();
            void render();
        });

        const bindEntrySelect = root.querySelector('#stx-memory-bind-entry') as HTMLSelectElement | null;
        bindEntrySelect?.addEventListener('change', (): void => {
            state.bindEntryId = String(bindEntrySelect.value ?? '').trim();
        });

        root.querySelectorAll<HTMLElement>('[data-action]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                void handleAction(String(button.dataset.action ?? '').trim(), snapshot, button);
            });
        });
    };

    /**
     * 功能：重新渲染整个工作台。
     * @returns 无返回值。
     */
    const render = async (): Promise<void> => {
        const snapshot = await loadSnapshot();
        normalizeSelection(snapshot);
        root.innerHTML = buildWorkbenchMarkup(snapshot, state);
        bindEvents(snapshot);

        if (state.currentView === 'actors' && state.currentActorTab === 'relationships') {
            const container = root.querySelector('#stx-rpg-graph-container') as HTMLElement | null;
            if (container) {
                mountRelationshipGraph(container, snapshot.actorGraph, {
                    selectedNodeId: state.selectedActorKey,
                    onSelectNode: (nodeId: string): void => {
                        if (nodeId !== state.selectedActorKey) {
                            state.selectedActorKey = nodeId;
                            void render();
                        }
                    },
                });
            }
        }

        if (state.currentView === 'memory-graph') {
            const graphContainer = root.querySelector('#stx-memory-graph-container') as HTMLElement | null;
            if (graphContainer) {
                mountMemoryGraph(graphContainer, snapshot.memoryGraph, {
                    selectedNodeId: state.selectedGraphNodeId,
                    filterType: state.memoryGraphFilterType || undefined,
                    searchQuery: state.memoryGraphQuery || undefined,
                    graphMode: (state.memoryGraphMode as any) || 'compact',
                    onSelectNode: (nodeId: string, entryId: string): void => {
                        state.selectedGraphNodeId = nodeId;
                        state.selectedEntryId = entryId;
                        void render();
                    },
                });
            }

            const graphFilterType = root.querySelector('#stx-memory-graph-filter-type') as HTMLSelectElement | null;
            graphFilterType?.addEventListener('change', (): void => {
                state.memoryGraphFilterType = String(graphFilterType.value ?? '').trim();
                void render();
            });

            const graphQuery = root.querySelector('#stx-memory-graph-query') as HTMLInputElement | null;
            let graphQueryTimer: ReturnType<typeof setTimeout> | null = null;
            graphQuery?.addEventListener('input', (): void => {
                if (graphQueryTimer) clearTimeout(graphQueryTimer);
                graphQueryTimer = setTimeout((): void => {
                    state.memoryGraphQuery = String(graphQuery.value ?? '').trim();
                    void render();
                }, 300);
            });

            // 图谱模式切换
            root.querySelectorAll<HTMLElement>('[data-action="graph-set-mode"]').forEach(btn => {
                btn.addEventListener('click', (): void => {
                    const mode = btn.dataset.mode ?? 'compact';
                    state.memoryGraphMode = mode;
                    void render();
                });
            });

            // 关联节点点击事件
            root.querySelectorAll<HTMLElement>('[data-action="graph-select-node"]').forEach(btn => {
                btn.addEventListener('click', (): void => {
                    const nodeId = btn.dataset.nodeId ?? '';
                    const entryId = btn.dataset.entryId ?? '';
                    if (nodeId) {
                        state.selectedGraphNodeId = nodeId;
                        state.selectedEntryId = entryId;
                        void render();
                    }
                });
            });
        }
    };

    await render();
}

/**
 * 功能：归一化命中说明对象。
 * @param value 原始对象。
 * @returns 命中说明或空值。
 */
function normalizeRecallExplanation(value: Record<string, unknown> | null): WorkbenchSnapshot['recallExplanation'] {
    if (!value || typeof value !== 'object') {
        return null;
    }
    return {
        generatedAt: Number(value.generatedAt ?? 0) || undefined,
        query: String(value.query ?? '').trim() || undefined,
        matchedActorKeys: toStringArray(value.matchedActorKeys),
        matchedEntryIds: toStringArray(value.matchedEntryIds),
        reasonCodes: toStringArray(value.reasonCodes),
        source: String(value.source ?? '').trim() || undefined,
    };
}

/**
 * 功能：根据真实条目构建角色关系图。
 * @param actors 角色列表。
 * @param entries 条目列表。
 * @returns 真实图数据。
 */
function buildActorGraph(actors: ActorMemoryProfile[], entries: MemoryEntry[]): WorkbenchActorGraph {
    const nodes = actors.map((actor: ActorMemoryProfile, index: number): WorkbenchActorGraph['nodes'][number] => {
        const angle = actors.length <= 1 ? 0 : (index / actors.length) * Math.PI * 2;
        const radius = actors.length <= 1 ? 0 : 220;
        return {
            id: actor.actorKey,
            label: actor.displayName || actor.actorKey,
            memoryStat: actor.memoryStat,
            x: Math.round(Math.cos(angle) * radius),
            y: Math.round(Math.sin(angle) * radius),
            relationCount: 0,
        };
    });
    const actorKeySet = new Set(nodes.map((node): string => node.id));
    const nodeMap = new Map(nodes.map((node): [string, WorkbenchActorGraph['nodes'][number]] => [node.id, node]));
    const links: WorkbenchActorGraphLink[] = [];

    entries
        .filter((entry: MemoryEntry): boolean => entry.entryType === 'relationship')
        .forEach((entry: MemoryEntry): void => {
            const relation = resolveRelationshipEdge(entry, actorKeySet);
            if (!relation) {
                return;
            }
            const sourceNode = nodeMap.get(relation.sourceActorKey);
            const targetNode = nodeMap.get(relation.targetActorKey);
            if (!sourceNode || !targetNode) {
                return;
            }
            sourceNode.relationCount += 1;
            targetNode.relationCount += 1;
            links.push({
                id: `graph-link:${entry.entryId}`,
                source: relation.sourceActorKey,
                target: relation.targetActorKey,
                entryId: entry.entryId,
                label: truncateText(relation.label || entry.summary || entry.title || '关系', 24),
                summary: relation.summary || entry.summary || entry.detail || '',
                type: relation.type,
                updatedAt: entry.updatedAt,
            });
        });

    return { nodes, links };
}

/**
 * 功能：从 relationship 条目中解析真实边。
 * @param entry 关系条目。
 * @param actorKeySet 真实角色键集合。
 * @returns 边信息或空值。
 */
function resolveRelationshipEdge(
    entry: MemoryEntry,
    actorKeySet: Set<string>,
): {
    sourceActorKey: string;
    targetActorKey: string;
    label: string;
    summary: string;
    type: WorkbenchGraphLinkType;
} | null {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const sourceActorKey = normalizeActorKeyCandidate(payload.sourceActorKey ?? fields.sourceActorKey);
    const targetActorKey = normalizeActorKeyCandidate(payload.targetActorKey ?? fields.targetActorKey);
    const titlePair = parseActorKeysFromTitle(entry.title, actorKeySet);
    const resolvedSource = sourceActorKey || titlePair?.sourceActorKey || '';
    const resolvedTarget = targetActorKey || titlePair?.targetActorKey || '';
    if (!resolvedSource || !resolvedTarget || resolvedSource === resolvedTarget) {
        return null;
    }
    if (!actorKeySet.has(resolvedSource) || !actorKeySet.has(resolvedTarget)) {
        return null;
    }
    return {
        sourceActorKey: resolvedSource,
        targetActorKey: resolvedTarget,
        label: String(fields.relationTag ?? payload.state ?? fields.state ?? entry.summary ?? '').trim(),
        summary: String(payload.state ?? fields.state ?? entry.summary ?? '').trim(),
        type: resolveRelationshipTone(entry),
    };
}

/**
 * 功能：从标题里提取冷启动写入的角色键。
 * @param title 条目标题。
 * @param actorKeySet 角色键集合。
 * @returns 解析结果或空值。
 */
function parseActorKeysFromTitle(
    title: string,
    actorKeySet: Set<string>,
): { sourceActorKey: string; targetActorKey: string } | null {
    const normalized = String(title ?? '').trim();
    const match = normalized.match(/^([a-z0-9_-]+)\s*(?:->|=>|→)\s*([a-z0-9_-]+)$/i);
    if (!match) {
        return null;
    }
    const sourceActorKey = normalizeActorKeyCandidate(match[1]);
    const targetActorKey = normalizeActorKeyCandidate(match[2]);
    if (!sourceActorKey || !targetActorKey) {
        return null;
    }
    if (!actorKeySet.has(sourceActorKey) || !actorKeySet.has(targetActorKey)) {
        return null;
    }
    return { sourceActorKey, targetActorKey };
}

/**
 * 功能：根据关系信号估算图边颜色。
 * @param entry 关系条目。
 * @returns 图边类型。
 */
function resolveRelationshipTone(entry: MemoryEntry): WorkbenchGraphLinkType {
    const payload = toRecord(entry.detailPayload);
    const fields = toRecord(payload.fields);
    const relationTag = String(fields.relationTag ?? '').trim();
    if (relationTag === '亲人' || relationTag === '家人' || relationTag === '亲属') {
        return 'family';
    }
    if (relationTag === '盟友' || relationTag === '朋友' || relationTag === '友好' || relationTag === '同伴') {
        return 'ally';
    }
    if (relationTag === '宿敌' || relationTag === '敌人' || relationTag === '仇人' || relationTag === '敌对') {
        return 'enemy';
    }
    if (relationTag === '陌生人' || relationTag === '路人' || relationTag === '未定' || relationTag === '中立') {
        return 'neutral';
    }
    const trust = Number(payload.trust ?? 0);
    const affection = Number(payload.affection ?? 0);
    const tension = Number(payload.tension ?? 0);
    if (Number.isFinite(tension) && tension >= Math.max(trust, affection) && tension >= 0.6) {
        return 'enemy';
    }
    if ((Number.isFinite(trust) && trust >= 0.7) || (Number.isFinite(affection) && affection >= 0.7)) {
        return 'ally';
    }
    return 'neutral';
}

/**
 * 功能：归一化候选角色键。
 * @param value 原始值。
 * @returns 角色键。
 */
function normalizeActorKeyCandidate(value: unknown): string {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

/**
 * 功能：构建聊天记忆库导出文件名。
 * @param chatKey 当前聊天键。
 * @returns 可下载的文件名。
 */
function buildChatDatabaseExportFileName(chatKey: string): string {
    const normalizedChatKey = String(chatKey ?? '')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
        .replace(/\s+/g, '_')
        .slice(0, 96) || 'memory_chat';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `memory-chat-database-${normalizedChatKey}-${timestamp}.json`;
}

/**
 * 功能：把 JSON 数据触发为浏览器下载。
 * @param fileName 文件名。
 * @param data JSON 数据。
 * @returns 无返回值。
 */
function downloadJsonFile(fileName: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout((): void => {
        URL.revokeObjectURL(objectUrl);
    }, 0);
}
