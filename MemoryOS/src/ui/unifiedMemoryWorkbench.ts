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

// 引入抽象模块
import {
    type WorkbenchView,
    type ActorSubView,
    type WorkbenchState,
    type WorkbenchSnapshot,
    escapeAttr,
    readInputValue,
    readCheckedValue,
    parseTagText,
    parseTypeFieldsJson,
    collectDetailPayload,
    createDraftEntry,
    resolveSelectedEntry,
    resolveSelectedType,
    resolveSelectedActor,
    buildDynamicFieldMarkup
} from './workbenchTabs/shared';

import { buildEntriesViewMarkup } from './workbenchTabs/tabEntries';
import { buildTypesViewMarkup } from './workbenchTabs/tabTypes';
import { buildPreviewViewMarkup } from './workbenchTabs/tabPreview';
import { buildActorsViewMarkup } from './workbenchTabs/tabActors';
import { mountRelationshipGraph, type GraphData } from './workbenchTabs/actorTabs/relationshipGraph';

const WORKBENCH_STYLE_ID = 'stx-memory-workbench-style';

/**
 * 功能：确保统一记忆工作台样式只被注入一次。
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
 * 功能：将旧视图别名映射为统一记忆工作台的视图。
 * @param initialView 打开时传入的旧视图。
 * @returns 新工作台视图。
 */
function resolveInitialWorkbenchView(initialView?: UnifiedWorkbenchViewMode): WorkbenchView {
    if (initialView === 'memory') return 'actors';
    if (initialView === 'diagnostics' || initialView === 'raw') return 'preview';
    if (initialView === 'world') return 'entries';
    return 'entries';
}

/**
 * 功能：读取当前聊天的 MemorySDK 实例。
 * @returns MemorySDK；不存在时返回 null。
 */
function getActiveMemorySdk(): MemorySDKImpl | null {
    const memory = (window as any)?.STX?.memory as MemorySDKImpl | null | undefined;
    return memory ?? null;
}

/**
 * 功能：构建统一记忆工作台主体 HTML。
 * @param snapshot 工作台快照。
 * @param state 工作台状态。
 * @returns 页面 HTML。
 */
function buildWorkbenchMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const typeMap = new Map(snapshot.entryTypes.map((item: MemoryEntryType): [string, MemoryEntryType] => [item.key, item]));
    const filteredEntries = snapshot.entries.filter((entry: MemoryEntry): boolean => {
        const query = state.entryQuery.toLowerCase();
        if (!query) return true;
        return [entry.title, entry.summary, entry.detail, entry.entryType, entry.category, ...(entry.tags ?? [])]
            .join(' ').toLowerCase().includes(query);
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
                    <i class="fa-solid fa-microchip"></i> MEMORY·OS
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
                        提示词快照
                    </button>
                </nav>
                <div class="stx-memory-workbench__stats">
                    <span title="环境总计字典数量">TOTAL ENTRIES <strong>${snapshot.entries.length}</strong></span>
                    <span title="系统可识别类别数">CORE TYPES <strong>${snapshot.entryTypes.length}</strong></span>
                    <span title="动态活跃链接">ACTIVE LINKS <strong>${snapshot.roleMemories.length}</strong></span>
                </div>
            </header>
            <main class="stx-memory-workbench__main">
                ${buildEntriesViewMarkup(filteredEntries, snapshot, state, typeMap, entryDraft, selectedEntry, selectedEntryType, dynamicFields)}
                ${buildTypesViewMarkup(snapshot, state, selectedType)}
                ${buildActorsViewMarkup(snapshot, state, selectedActor, selectedActorMemories, typeMap, entryOptions)}
                ${buildPreviewViewMarkup(snapshot, state)}
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
                logger.error('挂载 MemoryOS 终端失败', error);
                toast.error(`环境遭遇系统级故障：${String(error)}`);
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
        instance.content.innerHTML = '<div class="stx-memory-workbench__empty">[FATAL ERROR] 内核离线，无法建立连接通道。</div>';
        return;
    }

    const root = instance.content.querySelector('#stx-memory-workbench-root') as HTMLElement | null;
    if (!root) {
        return;
    }

    const state: WorkbenchState = {
        currentView: resolveInitialWorkbenchView(options.initialView),
        currentActorTab: 'items',
        selectedEntryId: '',
        selectedTypeKey: '',
        selectedActorKey: '',
        entryQuery: '',
        previewQuery: '',
        bindEntryId: '',
    };

    /**
     * 功能：读取工作台所需的全部数据。
     * @returns 工作台快照。
     */
    const loadSnapshot = async (): Promise<WorkbenchSnapshot> => {
        const [entryTypes, entries, actors, roleMemories, summaries, preview] = await Promise.all([
            memory.unifiedMemory.entryTypes.list(),
            memory.unifiedMemory.entries.list({ query: state.entryQuery }),
            memory.unifiedMemory.actors.list(),
            memory.unifiedMemory.roleMemory.list(),
            memory.unifiedMemory.summaries.list(8),
            memory.unifiedMemory.prompts.preview({ query: state.previewQuery }),
        ]);
        return {
            entryTypes,
            entries,
            actors,
            roleMemories,
            summaries,
            preview,
        };
    };

    /**
     * 功能：确保当前选择状态始终有效。
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
                const saved = await memory.unifiedMemory.entries.save({
                    entryId: String((button.dataset.entryId ?? '')).trim() || undefined,
                    title: readInputValue(root, '#stx-memory-entry-title'),
                    entryType: entryTypeKey,
                    category: readInputValue(root, '#stx-memory-entry-category') || type?.category || '其他',
                    tags: parseTagText(readInputValue(root, '#stx-memory-entry-tags')),
                    summary: readInputValue(root, '#stx-memory-entry-summary'),
                    detail: readInputValue(root, '#stx-memory-entry-detail'),
                    detailPayload: collectDetailPayload(root),
                });
                state.selectedEntryId = saved.entryId;
                toast.success('存储块已覆写');
                await render();
                return;
            }
            if (action === 'delete-entry') {
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!entryId) return;
                await memory.unifiedMemory.entries.remove(entryId);
                state.selectedEntryId = '';
                toast.success('扇区已销毁');
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
                toast.success('架构矩阵已保存');
                await render();
                return;
            }
            if (action === 'delete-type') {
                const typeKey = String(button.dataset.typeKey ?? '').trim();
                if (!typeKey) return;
                await memory.unifiedMemory.entryTypes.remove(typeKey);
                state.selectedTypeKey = '';
                toast.success('架构已被系统抹除');
                await render();
                return;
            }
            if (action === 'create-actor') {
                state.selectedActorKey = '';
                await render();
                return;
            }
            if (action === 'save-actor') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key');
                const displayName = readInputValue(root, '#stx-memory-actor-label');
                const memoryStat = Number(readInputValue(root, '#stx-memory-actor-stat') || 60);
                const actor = await memory.unifiedMemory.actors.ensure({ actorKey, displayName, memoryStat });
                await memory.unifiedMemory.actors.setMemoryStat(actor.actorKey, memoryStat);
                state.selectedActorKey = actor.actorKey;
                toast.success('节点数据已同步');
                await render();
                return;
            }
            if (action === 'bind-entry') {
                const actorKey = readInputValue(root, '#stx-memory-actor-key') || state.selectedActorKey;
                const entryId = String((root.querySelector('#stx-memory-bind-entry') as HTMLSelectElement | null)?.value ?? state.bindEntryId).trim();
                if (!actorKey || !entryId) {
                    toast.info('无法建立链接：无有效标靶');
                    return;
                }
                await memory.unifiedMemory.roleMemory.bind(actorKey, entryId);
                toast.success('强链接已确立');
                await render();
                return;
            }
            if (action === 'unbind-entry') {
                const actorKey = state.selectedActorKey;
                const entryId = String(button.dataset.entryId ?? '').trim();
                if (!actorKey || !entryId) return;
                await memory.unifiedMemory.roleMemory.unbind(actorKey, entryId);
                toast.success('链接由于主动切断而终止');
                await render();
                return;
            }
            if (action === 'refresh-preview') {
                state.previewQuery = readInputValue(root, '#stx-memory-preview-query');
                await render();
                return;
            }
            if (action === 'capture-summary') {
                await memory.postGeneration.scheduleRoundProcessing('unified_memory_workbench');
                toast.success('已强转储快照归档');
                await render();
            }
        } catch (error) {
            logger.error(`终端发生异常指令: ${action}`, error);
            toast.error(`环境故障：${String((error as Error)?.message ?? error)}`);
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

        // 绑定次级子页签路由 (Actors Nav)
        root.querySelectorAll<HTMLElement>('[data-actor-tab]').forEach((button: HTMLElement): void => {
            button.addEventListener('click', (): void => {
                state.currentActorTab = String(button.dataset.actorTab ?? 'items') as ActorSubView;
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

        if (state.currentView === 'actors') {
            const container = root.querySelector('#stx-rpg-graph-container') as HTMLElement | null;
            if (container) {
                const nodes = snapshot.actors.map((actor, i) => ({
                    id: actor.actorKey,
                    label: actor.displayName || '未知载体',
                    x: Math.cos((i / Math.max(1, snapshot.actors.length)) * Math.PI * 2) * 200,
                    y: Math.sin((i / Math.max(1, snapshot.actors.length)) * Math.PI * 2) * 200,
                    icon: 'fa-user-secret'
                }));
                const links: any[] = [];
                if (nodes.length > 1) {
                    for (let i = 0; i < nodes.length; i++) {
                        const targets = [ (i+1)%nodes.length, (i+2)%nodes.length ];
                        targets.forEach(t => {
                           if (i !== t) {
                               const typeMap = ['ally', 'enemy', 'neutral', 'family'];
                               const type = typeMap[(i+t)%4];
                               const labels: Record<string,string> = {ally:'同源互信', enemy:'致命阻断', neutral:'信息交换', family:'血统重合'};
                               links.push({
                                   source: nodes[i].id,
                                   target: nodes[t].id,
                                   label: labels[type] || '未知连接',
                                   type
                               });
                           }
                        });
                    }
                }
                mountRelationshipGraph(container, { nodes, links });
            }
        }
    };

    await render();
}
