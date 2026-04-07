import { openSharedDialog } from '../../../_Components/sharedDialog';
import type { ColdStartCandidate } from '../memory-bootstrap';
import type { SharedDialogInstance } from '../../../_Components/sharedDialog';

const MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID = 'stx-memory-bootstrap-review-dialog';
const MEMORY_BOOTSTRAP_REVIEW_STYLE_ID = 'stx-memory-bootstrap-review-style';

/**
 * 功能：定义冷启动候选确认结果。
 */
export interface MemoryBootstrapReviewResult {
    confirmed: boolean;
    selectedCandidateIds: string[];
}

/**
 * 功能：确保候选确认弹窗样式只注入一次。
 */
function ensureMemoryBootstrapReviewStyle(): void {
    if (document.getElementById(MEMORY_BOOTSTRAP_REVIEW_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = MEMORY_BOOTSTRAP_REVIEW_STYLE_ID;
    style.textContent = `
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review {
            display: flex;
            flex-direction: column;
            gap: 12px;
            min-width: min(920px, 100%);
            height: min(78vh, 920px);
            overflow: hidden;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__lead {
            margin: 0;
            font-size: 13px;
            line-height: 1.7;
            opacity: 0.88;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__toolbar {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__toolbar button,
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__actions button {
            border: 1px solid rgba(255,255,255,0.14);
            border-radius: 10px;
            padding: 8px 12px;
            background: rgba(255,255,255,0.06);
            color: inherit;
            cursor: pointer;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow: auto;
            min-height: 0;
            padding-right: 6px;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__card {
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.15));
            border-radius: 12px;
            padding: 12px;
            background: rgba(0,0,0,0.14);
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__card.is-low-confidence {
            border-color: rgba(255,200,50,0.55);
            background: rgba(255,200,50,0.06);
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__card.is-high-confidence {
            border-color: rgba(80,200,120,0.45);
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__confidence-badge {
            display: inline-block;
            border-radius: 999px;
            padding: 1px 8px;
            font-size: 11px;
            font-weight: 600;
            line-height: 1.6;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__confidence-badge.is-low {
            background: rgba(255,200,50,0.18);
            color: #e6c030;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__confidence-badge.is-medium {
            background: rgba(255,255,255,0.08);
            color: inherit;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__confidence-badge.is-high {
            background: rgba(80,200,120,0.18);
            color: #50c878;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__head {
            display: flex;
            align-items: flex-start;
            gap: 10px;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__body {
            margin-left: 28px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__title {
            font-size: 13px;
            font-weight: 700;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__meta,
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__reason,
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__summary {
            font-size: 12px;
            line-height: 1.6;
            opacity: 0.82;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__tag {
            border-radius: 999px;
            background: rgba(255,255,255,0.08);
            padding: 2px 8px;
            font-size: 11px;
        }
        #${MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID} .stx-memory-bootstrap-review__actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：转义 HTML。
 * @param value 原始文本。
 * @returns 转义文本。
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
 * 功能：按类型分组渲染候选卡片。
 * @param candidates 候选列表。
 * @returns HTML 文本。
 */
function buildCandidateCards(candidates: ColdStartCandidate[]): string {
    return candidates.map((candidate: ColdStartCandidate, index: number): string => {
        const sourceRefs = candidate.sourceRefs
            .map((ref): string => `${ref.sourceType}:${ref.sourceId}`)
            .slice(0, 3)
            .join('、');
        const entityTags = candidate.entityKeys.slice(0, 8)
            .map((item: string): string => `<span class="stx-memory-bootstrap-review__tag">${escapeHtml(item)}</span>`)
            .join('');
        const confidenceValue = candidate.confidence;
        const confidenceLevel = confidenceValue < 0.5 ? 'low' : confidenceValue >= 0.75 ? 'high' : 'medium';
        const cardClass = confidenceLevel === 'low'
            ? 'stx-memory-bootstrap-review__card is-low-confidence'
            : confidenceLevel === 'high'
                ? 'stx-memory-bootstrap-review__card is-high-confidence'
                : 'stx-memory-bootstrap-review__card';
        const confidenceBadge = `<span class="stx-memory-bootstrap-review__confidence-badge is-${confidenceLevel}">${confidenceValue.toFixed(2)}</span>`;
        return `
            <article class="${cardClass}">
                <div class="stx-memory-bootstrap-review__head">
                    <input type="checkbox" data-cold-start-candidate="${escapeHtml(candidate.id)}" ${index < 24 ? 'checked' : ''} />
                    <div style="flex:1; min-width:0;">
                        <div class="stx-memory-bootstrap-review__title">${escapeHtml(candidate.title)}</div>
                        <div class="stx-memory-bootstrap-review__meta">类型：${escapeHtml(candidate.type)} / entryType：${escapeHtml(candidate.entryType)} / 置信度：${confidenceBadge}</div>
                    </div>
                </div>
                <div class="stx-memory-bootstrap-review__body">
                    <div class="stx-memory-bootstrap-review__summary">${escapeHtml(candidate.summary)}</div>
                    <div class="stx-memory-bootstrap-review__reason">原因：${escapeHtml(candidate.reason)}</div>
                    <div class="stx-memory-bootstrap-review__meta">来源：${escapeHtml(sourceRefs || '未标注')}</div>
                    <div class="stx-memory-bootstrap-review__tags">${entityTags || '<span class="stx-memory-bootstrap-review__tag">无实体键</span>'}</div>
                </div>
            </article>
        `;
    }).join('');
}

/**
 * 功能：打开冷启动候选确认弹窗。
 * @param candidates 候选列表。
 * @returns 用户确认结果。
 */
export async function openMemoryBootstrapReviewDialog(candidates: ColdStartCandidate[]): Promise<MemoryBootstrapReviewResult> {
    ensureMemoryBootstrapReviewStyle();
    const normalizedCandidates = Array.isArray(candidates) ? candidates : [];
    if (normalizedCandidates.length <= 0) {
        return {
            confirmed: false,
            selectedCandidateIds: [],
        };
    }
    return new Promise<MemoryBootstrapReviewResult>((resolve): void => {
        let settled = false;
        const finish = (result: MemoryBootstrapReviewResult): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };
        const dialog = openSharedDialog({
            id: MEMORY_BOOTSTRAP_REVIEW_DIALOG_ID,
            bodyHtml: `
                <div class="stx-memory-bootstrap-review">
                    <p class="stx-memory-bootstrap-review__lead">以下是基于角色卡、世界书和开场上下文生成的冷启动候选。请保留真正适合进入长期记忆的内容，再执行入库。</p>
                    <div class="stx-memory-bootstrap-review__toolbar">
                        <button type="button" data-review-select-all="true">全选</button>
                        <button type="button" data-review-clear-all="true">全部取消</button>
                    </div>
                    <div class="stx-memory-bootstrap-review__list">${buildCandidateCards(normalizedCandidates)}</div>
                    <div class="stx-memory-bootstrap-review__actions">
                        <button type="button" data-review-cancel="true">返回</button>
                        <button type="button" data-review-confirm="true">确认写入长期记忆</button>
                    </div>
                </div>
            `,
            chrome: {
                title: '确认冷启动候选',
            },
            onMount: (instance: SharedDialogInstance): void => {
                const root = instance.content;
                const getCandidateInputs = (selector: string): HTMLInputElement[] => Array.from(
                    root.querySelectorAll(selector),
                ).filter((item: Element): item is HTMLInputElement => item instanceof HTMLInputElement);
                const getSelected = (): string[] => getCandidateInputs('input[data-cold-start-candidate]:checked')
                    .map((item: HTMLInputElement): string => String(item.dataset.coldStartCandidate ?? '').trim())
                    .filter((item: string): boolean => Boolean(item));
                root.querySelector('[data-review-select-all="true"]')?.addEventListener('click', (): void => {
                    getCandidateInputs('input[data-cold-start-candidate]').forEach((item: HTMLInputElement): void => {
                        item.checked = true;
                    });
                });
                root.querySelector('[data-review-clear-all="true"]')?.addEventListener('click', (): void => {
                    getCandidateInputs('input[data-cold-start-candidate]').forEach((item: HTMLInputElement): void => {
                        item.checked = false;
                    });
                });
                root.querySelector('[data-review-cancel="true"]')?.addEventListener('click', (): void => {
                    instance.close();
                    finish({ confirmed: false, selectedCandidateIds: [] });
                });
                root.querySelector('[data-review-confirm="true"]')?.addEventListener('click', (): void => {
                    instance.close();
                    finish({ confirmed: true, selectedCandidateIds: getSelected() });
                });
            },
            onClose: (): void => {
                finish({ confirmed: false, selectedCandidateIds: [] });
            },
        });
        void dialog;
    });
}
