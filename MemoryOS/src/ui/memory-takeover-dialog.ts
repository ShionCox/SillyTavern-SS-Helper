import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import type { MemoryTakeoverCreateInput } from '../types';

const MEMORY_TAKEOVER_DIALOG_ID = 'stx-memory-takeover-dialog';
const MEMORY_TAKEOVER_DIALOG_STYLE_ID = 'stx-memory-takeover-dialog-style';

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
 * @param value 原始文本。
 * @returns 转义结果。
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
        #${MEMORY_TAKEOVER_DIALOG_ID} .stx-memory-takeover-dialog {
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-width: min(720px, 100%);
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
    `;
    document.head.appendChild(style);
}

/**
 * 功能：打开旧聊天接管配置弹窗。
 * @param input 弹窗输入。
 * @returns 用户选择结果。
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
            chrome: {
                title: '旧聊天接管',
                description: '为已有大量历史楼层的聊天创建接管任务。',
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
                        <div class="stx-memory-takeover-dialog__card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-start-floor">起始楼层</label>
                            <input id="stx-memory-takeover-start-floor" class="stx-memory-takeover-dialog__input" type="number" min="1" placeholder="例如 1">
                        </div>
                        <div class="stx-memory-takeover-dialog__card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-end-floor">结束楼层 / 最近层数</label>
                            <input id="stx-memory-takeover-end-floor" class="stx-memory-takeover-dialog__input" type="number" min="1" value="${escapeHtml(String(input.defaultRecentFloors))}">
                        </div>
                        <div class="stx-memory-takeover-dialog__card">
                            <label class="stx-memory-takeover-dialog__label" for="stx-memory-takeover-batch-size">每批楼层数</label>
                            <input id="stx-memory-takeover-batch-size" class="stx-memory-takeover-dialog__input" type="number" min="1" value="${escapeHtml(String(input.defaultBatchSize))}">
                        </div>
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
                confirmButton?.addEventListener('click', (): void => {
                    const modeSelect = root.querySelector('#stx-memory-takeover-mode') as HTMLSelectElement | null;
                    const startFloorInput = root.querySelector('#stx-memory-takeover-start-floor') as HTMLInputElement | null;
                    const endFloorInput = root.querySelector('#stx-memory-takeover-end-floor') as HTMLInputElement | null;
                    const batchSizeInput = root.querySelector('#stx-memory-takeover-batch-size') as HTMLInputElement | null;
                    const resumeExistingInput = root.querySelector('#stx-memory-takeover-resume-existing') as HTMLInputElement | null;
                    const prioritizeRecentInput = root.querySelector('#stx-memory-takeover-prioritize-recent') as HTMLInputElement | null;
                    const autoContinueInput = root.querySelector('#stx-memory-takeover-auto-continue') as HTMLInputElement | null;
                    const autoConsolidateInput = root.querySelector('#stx-memory-takeover-auto-consolidate') as HTMLInputElement | null;
                    const pauseOnErrorInput = root.querySelector('#stx-memory-takeover-pause-on-error') as HTMLInputElement | null;
                    const mode = String(modeSelect?.value ?? 'full').trim() as MemoryTakeoverCreateInput['mode'];
                    const startFloor = Math.max(0, Number(startFloorInput?.value ?? 0) || 0);
                    const endFloor = Math.max(0, Number(endFloorInput?.value ?? 0) || 0);
                    const batchSize = Math.max(0, Number(batchSizeInput?.value ?? 0) || 0);
                    finish({
                        confirmed: true,
                        resumeExisting: resumeExistingInput?.checked === true && Boolean(input.recoverableTakeoverId),
                        config: {
                            mode,
                            startFloor: mode === 'custom_range' && startFloor > 0 ? startFloor : undefined,
                            endFloor: mode === 'custom_range' && endFloor > 0 ? endFloor : undefined,
                            recentFloors: mode === 'recent' && endFloor > 0 ? endFloor : undefined,
                            batchSize: batchSize > 0 ? batchSize : undefined,
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
