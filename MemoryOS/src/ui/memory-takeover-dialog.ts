import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import type { MemoryTakeoverCreateInput, MemoryTakeoverPreviewEstimate } from '../types';
import { buildTakeoverPreviewMarkup } from './takeoverPreviewMarkup';
import {
    normalizeTakeoverMode,
    parseTakeoverFormDraft,
    resolveTakeoverFieldVisibility,
    type MemoryTakeoverFormDraft,
} from './takeoverFormShared';
import { waitForUiPaint } from './uiAsync';

const MEMORY_TAKEOVER_DIALOG_ID = 'stx-memory-takeover-dialog';
const MEMORY_TAKEOVER_DIALOG_STYLE_ID = 'stx-memory-takeover-dialog-style';
const MEMORY_TAKEOVER_PREVIEW_DEBOUNCE_MS = 280;

/**
 * 功能：定义旧聊天接管弹窗返回结果。
 */
export interface MemoryTakeoverDialogResult {
    confirmed: boolean;
    resumeExisting: boolean;
    config?: MemoryTakeoverCreateInput;
}

/**
 * 功能：转义 HTML 文本。
 * @param value 原始文本
 * @returns 转义结果
 */
function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：确保接管弹窗样式只注入一次。
 */
function ensureMemoryTakeoverDialogStyle(): void {
    const existing = document.getElementById(MEMORY_TAKEOVER_DIALOG_STYLE_ID) as HTMLStyleElement | null;
    if (existing) {
        return;
    }
    const style = document.createElement('style');
    style.id = MEMORY_TAKEOVER_DIALOG_STYLE_ID;
    style.textContent = `
        #${MEMORY_TAKEOVER_DIALOG_ID}.stx-memory-takeover-dialog-root .stx-shared-dialog-backdrop {
            background:
                radial-gradient(circle at top, rgba(255,255,255,0.04), transparent 38%),
                linear-gradient(180deg, rgba(5, 8, 14, 0.78), rgba(5, 8, 14, 0.88)),
                rgba(3, 5, 9, 0.84);
            backdrop-filter: blur(22px) saturate(112%);
            -webkit-backdrop-filter: blur(22px) saturate(112%);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-shared-dialog-surface.stx-memory-takeover-dialog-surface {
            background:
                radial-gradient(circle at top left, rgba(196,160,98,0.08), transparent 34%),
                linear-gradient(180deg, rgba(14, 18, 28, 0.88), rgba(8, 12, 20, 0.82));
            border-color: rgba(196,160,98,0.24);
            box-shadow: 0 28px 80px rgba(0,0,0,0.58);
            backdrop-filter: blur(18px) saturate(112%);
            -webkit-backdrop-filter: blur(18px) saturate(112%);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog {
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-width: min(760px, 100%);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__lead {
            margin: 0;
            font-size: 14px;
            line-height: 1.7;
            opacity: 0.88;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 10px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__card {
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 12px;
            background: rgba(255,255,255,0.04);
            padding: 12px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__card[hidden] {
            display: none !important;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__label {
            display: block;
            margin-bottom: 6px;
            font-size: 12px;
            opacity: 0.78;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__input,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__select {
            width: 100%;
            min-height: 34px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.16);
            background: rgba(0,0,0,0.22);
            color: inherit;
            padding: 0 10px;
            box-sizing: border-box;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__checkbox {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__preview {
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 12px;
            background: rgba(255,255,255,0.03);
            padding: 12px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__preview-title {
            font-size: 13px;
            font-weight: 700;
            margin-bottom: 10px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            flex-wrap: wrap;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__button {
            min-height: 36px;
            border-radius: 999px;
            border: 1px solid rgba(255,255,255,0.16);
            padding: 0 16px;
            background: rgba(255,255,255,0.06);
            color: inherit;
            cursor: pointer;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog__button--primary {
            background: rgba(6,182,212,0.18);
            border-color: rgba(6,182,212,0.32);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__summary,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__item-head,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__item-meta {
            display: flex;
            gap: 10px;
            flex-wrap: wrap;
            justify-content: space-between;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 260px;
            overflow-y: auto;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__item {
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 10px;
            background: rgba(255,255,255,0.03);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__item.is-overflow,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__warning {
            border-color: rgba(239,68,68,0.35);
            background: rgba(239,68,68,0.08);
            color: #fecaca;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__warning,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__empty,
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__loading {
            border-radius: 10px;
            padding: 10px;
            font-size: 12px;
            line-height: 1.7;
            background: rgba(255,255,255,0.03);
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__loading {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-preview__spinner {
            width: 16px;
            height: 16px;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,0.2);
            border-top-color: rgba(6,182,212,0.9);
            animation: stx-memory-takeover-spin 0.8s linear infinite;
            flex: 0 0 auto;
        }
        @keyframes stx-memory-takeover-spin {
            to {
                transform: rotate(360deg);
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：打开旧聊天接管配置弹窗。
 * @param input 弹窗输入
 * @returns 用户选择结果
 */
export async function openMemoryTakeoverDialog(input: {
    totalFloorCount: number;
    recoverableTakeoverId?: string;
    defaultBatchSize: number;
    defaultRecentFloors: number;
    defaultPrioritizeRecent: boolean;
    defaultAutoContinue: boolean;
    defaultAutoConsolidate: boolean;
    defaultPauseOnError: boolean;
    previewEstimate?: (config?: MemoryTakeoverCreateInput) => Promise<MemoryTakeoverPreviewEstimate>;
}): Promise<MemoryTakeoverDialogResult> {
    ensureMemoryTakeoverDialogStyle();
    return new Promise<MemoryTakeoverDialogResult>((resolve: (result: MemoryTakeoverDialogResult) => void): void => {
        let settled = false;

        const finish = (result: MemoryTakeoverDialogResult, instance?: SharedDialogInstance): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
            if (instance) {
                void instance.close('api');
            }
        };

        openSharedDialog({
            id: MEMORY_TAKEOVER_DIALOG_ID,
            size: 'lg',
            rootClassName: 'stx-memory-takeover-dialog-root',
            surfaceClassName: 'stx-memory-takeover-dialog-surface',
            chrome: {
                title: '旧聊天接管',
                description: '为已经有大量历史楼层的聊天创建接管任务。',
                iconClassName: 'fa-solid fa-tower-cell',
            },
            bodyHtml: `
                <div class="stx-memory-takeover-dialog">
                    <p class="stx-memory-takeover-dialog__lead">
                        当前聊天共有 <strong>${escapeHtml(String(input.totalFloorCount))}</strong> 层历史消息。
                        ${input.recoverableTakeoverId ? `检测到可恢复任务：<code>${escapeHtml(input.recoverableTakeoverId)}</code>` : '当前没有可恢复的接管任务。'}
                    </p>
                    <div class="stx-memory-takeover-dialog__grid">
                        <div class="stx-memory-takeover-dialog__card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-mode">范围模式</label>
                            <select id="stx-memory-takeover-mode" class="stx-memory-takeover-dialog__select">
                                <option value="full">全部楼层</option>
                                <option value="recent">最近 N 层</option>
                                <option value="custom_range">自定义区间</option>
                            </select>
                        </div>
                        <div class="stx-memory-takeover-dialog__card" data-role="recent-floors-card" hidden>
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-recent-floors">最近层数</label>
                            <input id="stx-memory-takeover-recent-floors" class="stx-memory-takeover-dialog__input" type="number" min="1" value="${escapeHtml(String(input.defaultRecentFloors))}">
                        </div>
                        <div class="stx-memory-takeover-dialog__card" data-role="custom-range-start-card" hidden>
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-start-floor">起始楼层</label>
                            <input id="stx-memory-takeover-start-floor" class="stx-memory-takeover-dialog__input" type="number" min="1" placeholder="例如 1">
                        </div>
                        <div class="stx-memory-takeover-dialog__card" data-role="custom-range-end-card" hidden>
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-end-floor">结束楼层</label>
                            <input id="stx-memory-takeover-end-floor" class="stx-memory-takeover-dialog__input" type="number" min="1" placeholder="例如 120">
                        </div>
                        <div class="stx-memory-takeover-dialog__card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-batch-size">每批楼层数</label>
                            <input id="stx-memory-takeover-batch-size" class="stx-memory-takeover-dialog__input" type="number" min="1" value="${escapeHtml(String(input.defaultBatchSize))}">
                        </div>
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-use-active-snapshot" type="checkbox" checked>
                            使用最近快照
                        </label>
                        <div class="stx-memory-takeover-dialog__card" data-role="active-snapshot-floors-card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-active-snapshot-floors">快照层数</label>
                            <input id="stx-memory-takeover-active-snapshot-floors" class="stx-memory-takeover-dialog__input" type="number" min="1" value="${escapeHtml(String(input.defaultRecentFloors))}">
                        </div>
                    </div>
                    <div class="stx-memory-takeover-dialog__preview">
                        <div class="stx-memory-takeover-dialog__preview-title">批次 Token 预估</div>
                        <div id="stx-memory-takeover-preview-container">${buildTakeoverPreviewMarkup({ estimate: null })}</div>
                    </div>
                    <div class="stx-memory-takeover-dialog__grid">
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-resume-existing" type="checkbox"${input.recoverableTakeoverId ? ' checked' : ''}${input.recoverableTakeoverId ? '' : ' disabled'}>
                            优先恢复已有任务
                        </label>
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-prioritize-recent" type="checkbox"${input.defaultPrioritizeRecent ? ' checked' : ''}>
                            优先处理最近区间
                        </label>
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-auto-continue" type="checkbox"${input.defaultAutoContinue ? ' checked' : ''}>
                            自动继续
                        </label>
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-auto-consolidate" type="checkbox"${input.defaultAutoConsolidate ? ' checked' : ''}>
                            完成后自动整合
                        </label>
                        <label class="stx-memory-takeover-dialog__card stx-memory-takeover-dialog__checkbox">
                            <input id="stx-memory-takeover-pause-on-error" type="checkbox"${input.defaultPauseOnError ? ' checked' : ''}>
                            失败自动暂停
                        </label>
                    </div>
                    <div class="stx-memory-takeover-dialog__actions">
                        <button type="button" class="stx-memory-takeover-dialog__button" data-memory-takeover-cancel="true">取消</button>
                        <button type="button" class="stx-memory-takeover-dialog__button stx-memory-takeover-dialog__button--primary" data-memory-takeover-confirm="true">开始接管</button>
                    </div>
                </div>
            `,
            onMount: (instance: SharedDialogInstance): void => {
                const root = instance.content;
                const confirmButton = root.querySelector('[data-memory-takeover-confirm="true"]') as HTMLButtonElement | null;
                const cancelButton = root.querySelector('[data-memory-takeover-cancel="true"]') as HTMLButtonElement | null;
                const modeSelect = root.querySelector('#stx-memory-takeover-mode') as HTMLSelectElement | null;
                const startFloorInput = root.querySelector('#stx-memory-takeover-start-floor') as HTMLInputElement | null;
                const endFloorInput = root.querySelector('#stx-memory-takeover-end-floor') as HTMLInputElement | null;
                const recentFloorsInput = root.querySelector('#stx-memory-takeover-recent-floors') as HTMLInputElement | null;
                const batchSizeInput = root.querySelector('#stx-memory-takeover-batch-size') as HTMLInputElement | null;
                const useActiveSnapshotInput = root.querySelector('#stx-memory-takeover-use-active-snapshot') as HTMLInputElement | null;
                const activeSnapshotFloorsInput = root.querySelector('#stx-memory-takeover-active-snapshot-floors') as HTMLInputElement | null;
                const resumeExistingInput = root.querySelector('#stx-memory-takeover-resume-existing') as HTMLInputElement | null;
                const prioritizeRecentInput = root.querySelector('#stx-memory-takeover-prioritize-recent') as HTMLInputElement | null;
                const autoContinueInput = root.querySelector('#stx-memory-takeover-auto-continue') as HTMLInputElement | null;
                const autoConsolidateInput = root.querySelector('#stx-memory-takeover-auto-consolidate') as HTMLInputElement | null;
                const pauseOnErrorInput = root.querySelector('#stx-memory-takeover-pause-on-error') as HTMLInputElement | null;
                const previewContainer = root.querySelector('#stx-memory-takeover-preview-container') as HTMLElement | null;
                const recentFloorsCard = root.querySelector('[data-role="recent-floors-card"]') as HTMLElement | null;
                const customRangeStartCard = root.querySelector('[data-role="custom-range-start-card"]') as HTMLElement | null;
                const customRangeEndCard = root.querySelector('[data-role="custom-range-end-card"]') as HTMLElement | null;
                const activeSnapshotFloorsCard = root.querySelector('[data-role="active-snapshot-floors-card"]') as HTMLElement | null;
                let previewSequence = 0;
                let previewLoading = false;
                let previewDebounceTimer: ReturnType<typeof setTimeout> | null = null;

                /**
                 * 功能：读取当前表单草稿。
                 * @returns 表单草稿
                 */
                const readDraft = (): MemoryTakeoverFormDraft => {
                    return {
                        mode: normalizeTakeoverMode(String(modeSelect?.value ?? 'full')),
                        startFloor: String(startFloorInput?.value ?? '').trim(),
                        endFloor: String(endFloorInput?.value ?? '').trim(),
                        recentFloors: String(recentFloorsInput?.value ?? '').trim(),
                        batchSize: String(batchSizeInput?.value ?? '').trim(),
                        useActiveSnapshot: useActiveSnapshotInput?.checked === true,
                        activeSnapshotFloors: String(activeSnapshotFloorsInput?.value ?? '').trim(),
                    };
                };

                /**
                 * 功能：刷新模式显隐。
                 */
                const syncVisibility = (): void => {
                    const draft = readDraft();
                    const visibility = resolveTakeoverFieldVisibility(draft.mode);
                    if (recentFloorsCard) {
                        recentFloorsCard.hidden = !visibility.showRecentFloors;
                    }
                    if (customRangeStartCard) {
                        customRangeStartCard.hidden = !visibility.showCustomRange;
                    }
                    if (customRangeEndCard) {
                        customRangeEndCard.hidden = !visibility.showCustomRange;
                    }
                    if (activeSnapshotFloorsCard) {
                        activeSnapshotFloorsCard.hidden = !(visibility.showActiveSnapshotFloors && useActiveSnapshotInput?.checked === true);
                    }
                };

                /**
                 * 功能：刷新 token 预估展示。
                 */
                const refreshPreview = async (): Promise<void> => {
                    if (!previewContainer) {
                        return;
                    }
                    const draft = readDraft();
                    const parsed = parseTakeoverFormDraft(draft);
                    const currentSequence = ++previewSequence;
                    if (parsed.validationError) {
                        previewContainer.innerHTML = buildTakeoverPreviewMarkup({
                            estimate: {
                                mode: parsed.config.mode ?? 'full',
                                totalFloors: input.totalFloorCount,
                                range: null,
                                activeWindow: null,
                                batchSize: Math.max(0, Number(parsed.config.batchSize ?? 0) || 0),
                                useActiveSnapshot: parsed.config.useActiveSnapshot !== false,
                                activeSnapshotFloors: Math.max(0, Number(parsed.config.activeSnapshotFloors ?? 0) || 0),
                                threshold: 100000,
                                totalBatches: 0,
                                batches: [],
                                hasOverflow: false,
                                overflowWarnings: [],
                                validationError: parsed.validationError,
                            },
                        });
                        return;
                    }
                    if (!input.previewEstimate) {
                        previewContainer.innerHTML = buildTakeoverPreviewMarkup({
                            estimate: null,
                            emptyText: '当前环境未接入 token 预估能力。',
                        });
                        return;
                    }
                    previewLoading = true;
                    if (confirmButton) {
                        confirmButton.disabled = true;
                    }
                    previewContainer.innerHTML = buildTakeoverPreviewMarkup({ estimate: null, loading: true });
                    await waitForUiPaint();
                    try {
                        const estimate = await input.previewEstimate(parsed.config);
                        if (currentSequence !== previewSequence) {
                            return;
                        }
                        previewContainer.innerHTML = buildTakeoverPreviewMarkup({ estimate });
                    } catch (error) {
                        if (currentSequence !== previewSequence) {
                            return;
                        }
                        previewContainer.innerHTML = buildTakeoverPreviewMarkup({
                            estimate: {
                                mode: parsed.config.mode ?? 'full',
                                totalFloors: input.totalFloorCount,
                                range: null,
                                activeWindow: null,
                                batchSize: Math.max(0, Number(parsed.config.batchSize ?? 0) || 0),
                                useActiveSnapshot: parsed.config.useActiveSnapshot !== false,
                                activeSnapshotFloors: Math.max(0, Number(parsed.config.activeSnapshotFloors ?? 0) || 0),
                                threshold: 100000,
                                totalBatches: 0,
                                batches: [],
                                hasOverflow: false,
                                overflowWarnings: [],
                                validationError: `Token 预估失败：${String((error as Error)?.message ?? error)}`,
                            },
                        });
                    } finally {
                        if (currentSequence === previewSequence) {
                            previewLoading = false;
                            if (confirmButton) {
                                confirmButton.disabled = false;
                            }
                        }
                    }
                };

                const bindPreviewInput = (element: HTMLInputElement | HTMLSelectElement | null): void => {
                    element?.addEventListener('input', (): void => {
                        syncVisibility();
                        if (previewDebounceTimer) {
                            clearTimeout(previewDebounceTimer);
                        }
                        previewDebounceTimer = setTimeout((): void => {
                            previewDebounceTimer = null;
                            void refreshPreview();
                        }, MEMORY_TAKEOVER_PREVIEW_DEBOUNCE_MS);
                    });
                    element?.addEventListener('change', (): void => {
                        syncVisibility();
                        if (previewDebounceTimer) {
                            clearTimeout(previewDebounceTimer);
                            previewDebounceTimer = null;
                        }
                        void refreshPreview();
                    });
                };

                bindPreviewInput(modeSelect);
                bindPreviewInput(startFloorInput);
                bindPreviewInput(endFloorInput);
                bindPreviewInput(recentFloorsInput);
                bindPreviewInput(batchSizeInput);
                bindPreviewInput(useActiveSnapshotInput);
                bindPreviewInput(activeSnapshotFloorsInput);
                syncVisibility();
                void refreshPreview();

                confirmButton?.addEventListener('click', (): void => {
                    if (previewLoading) {
                        return;
                    }
                    const parsed = parseTakeoverFormDraft(readDraft());
                    if (parsed.validationError) {
                        previewContainer!.innerHTML = buildTakeoverPreviewMarkup({
                            estimate: {
                                mode: parsed.config.mode ?? 'full',
                                totalFloors: input.totalFloorCount,
                                range: null,
                                activeWindow: null,
                                batchSize: Math.max(0, Number(parsed.config.batchSize ?? 0) || 0),
                                useActiveSnapshot: parsed.config.useActiveSnapshot !== false,
                                activeSnapshotFloors: Math.max(0, Number(parsed.config.activeSnapshotFloors ?? 0) || 0),
                                threshold: 100000,
                                totalBatches: 0,
                                batches: [],
                                hasOverflow: false,
                                overflowWarnings: [],
                                validationError: parsed.validationError,
                            },
                        });
                        return;
                    }
                    finish({
                        confirmed: true,
                        resumeExisting: resumeExistingInput?.checked === true && Boolean(input.recoverableTakeoverId),
                        config: {
                            ...parsed.config,
                            prioritizeRecent: prioritizeRecentInput?.checked === true,
                            autoContinue: autoContinueInput?.checked === true,
                            autoConsolidate: autoConsolidateInput?.checked === true,
                            pauseOnError: pauseOnErrorInput?.checked === true,
                        },
                    }, instance);
                });
                cancelButton?.addEventListener('click', (): void => {
                    finish({ confirmed: false, resumeExisting: false }, instance);
                });
            },
            onClose: (): void => {
                finish({ confirmed: false, resumeExisting: false });
            },
        });
    });
}
