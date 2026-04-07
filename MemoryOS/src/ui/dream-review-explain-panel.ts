import type { DreamMutationExplain } from '../services/dream-types';

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function truncateText(value: string, maxLength: number = 20): string {
    const text = String(value ?? '').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function badgeList(values: string[]): string {
    return values
        .map(
            (value: string): string =>
                `<span class="stx-memory-dream-review__badge" title="${escapeAttr(value)}">${escapeHtml(truncateText(value, 14))}</span>`,
        )
        .join('');
}

/**
 * 功能：渲染梦境提案的可解释面板。
 * 特性：紧凑布局，关键信息截断并带 tooltip
 */
export function renderDreamReviewExplainPanel(explain?: DreamMutationExplain | null): string {
    if (!explain) {
        return `<div class="stx-memory-dream-review__explain"><div class="stx-memory-dream-review__hint">无 explain 诊断。</div></div>`;
    }

    const sourceWaveDisplay = truncateText(explain.sourceWave, 16);
    const sourceWaveTooltip = sourceWaveDisplay === explain.sourceWave ? '' : ` title="${escapeAttr(explain.sourceWave)}"`;

    const sourceEntryIds = explain.sourceEntryIds.slice(0, 5);
    const sourceEntriesDisplay = sourceEntryIds.join('、') || '无';
    const sourceEntriesDisplay_trunc = truncateText(sourceEntriesDisplay, 32);
    const sourceEntriesTooltip =
        sourceEntriesDisplay_trunc === sourceEntriesDisplay ? '' : ` title="${escapeAttr(sourceEntriesDisplay)}"`;

    const confidenceBreakdown = explain.confidenceBreakdown;
    const confStr = `r=${Number(confidenceBreakdown.retrieval ?? 0).toFixed(2)} a=${Number(confidenceBreakdown.activation ?? 0).toFixed(2)} n=${Number(confidenceBreakdown.novelty ?? 0).toFixed(2)} p=${Number(confidenceBreakdown.repetitionPenalty ?? 0).toFixed(2)} f=${Number(confidenceBreakdown.final ?? 0).toFixed(2)}`;

    return `
        <div class="stx-memory-dream-review__explain">
            <div class="stx-memory-dream-review__meta"><span style="font-weight:700;">波</span>：<span${sourceWaveTooltip}>${escapeHtml(sourceWaveDisplay)}</span></div>
            <div class="stx-memory-dream-review__meta"><span style="font-weight:700;">源</span>：<span${sourceEntriesTooltip}>${escapeHtml(sourceEntriesDisplay_trunc)}</span></div>
            <div class="stx-memory-dream-review__badges" style="margin-top:4px;">
                ${badgeList(explain.sourceNodeKeys.slice(0, 6))}
            </div>
            <div class="stx-memory-dream-review__badges" style="margin-top:2px;">
                ${badgeList(explain.bridgeNodeKeys.slice(0, 6))}
            </div>
            <div class="stx-memory-dream-review__list" style="margin-top:4px;">
                ${explain.explanationSteps
                    .slice(0, 3)
                    .map((step: string): string => `<div class="stx-memory-dream-review__hint">• ${escapeHtml(truncateText(step, 48))}</div>`)
                    .join('')}
            </div>
            <div class="stx-memory-dream-review__meta" style="margin-top:4px;font-size:9px;" title="${escapeAttr(confStr)}">信：${confStr}</div>
        </div>
    `;
}