import type { DreamMutationExplain } from '../services/dream-types';

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function badgeList(values: string[]): string {
    return values.map((value: string): string => `<span class="stx-memory-dream-review__badge">${escapeHtml(value)}</span>`).join('');
}

/**
 * 功能：渲染梦境提案的可解释面板。
 */
export function renderDreamReviewExplainPanel(explain?: DreamMutationExplain | null): string {
    if (!explain) {
        return `<div class="stx-memory-dream-review__explain"><div class="stx-memory-dream-review__hint">当前提案没有 explain 诊断。</div></div>`;
    }
    return `
        <div class="stx-memory-dream-review__explain">
            <div class="stx-memory-dream-review__meta">来源波段：${escapeHtml(explain.sourceWave)}</div>
            <div class="stx-memory-dream-review__meta">来源条目：${escapeHtml(explain.sourceEntryIds.join('、') || '无')}</div>
            <div class="stx-memory-dream-review__badges">${badgeList(explain.sourceNodeKeys.slice(0, 8))}</div>
            <div class="stx-memory-dream-review__badges">${badgeList(explain.bridgeNodeKeys.slice(0, 8))}</div>
            <div class="stx-memory-dream-review__list">
                ${explain.explanationSteps.map((step: string): string => `<div class="stx-memory-dream-review__hint">- ${escapeHtml(step)}</div>`).join('')}
            </div>
            <div class="stx-memory-dream-review__meta">
                置信拆解：retrieval=${Number(explain.confidenceBreakdown.retrieval ?? 0).toFixed(2)} /
                activation=${Number(explain.confidenceBreakdown.activation ?? 0).toFixed(2)} /
                novelty=${Number(explain.confidenceBreakdown.novelty ?? 0).toFixed(2)} /
                repetition=${Number(explain.confidenceBreakdown.repetitionPenalty ?? 0).toFixed(2)} /
                final=${Number(explain.confidenceBreakdown.final ?? 0).toFixed(2)}
            </div>
        </div>
    `;
}
