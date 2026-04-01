import { escapeHtml } from './editorShared';
import type { MemoryTakeoverPreviewBatchEstimate, MemoryTakeoverPreviewEstimate } from '../types';

/**
 * 功能：渲染接管 token 预估区域。
 * @param input 渲染输入。
 * @returns HTML 片段。
 */
export function buildTakeoverPreviewMarkup(input: {
    estimate: MemoryTakeoverPreviewEstimate | null;
    loading?: boolean;
    emptyText?: string;
}): string {
    if (input.loading) {
        return `
            <div class="stx-memory-takeover-preview">
                <div class="stx-memory-takeover-preview__loading">
                    <span class="stx-memory-takeover-preview__spinner" aria-hidden="true"></span>
                    <span>正在计算批次 token 预估...</span>
                </div>
            </div>
        `;
    }
    if (!input.estimate) {
        return `
            <div class="stx-memory-takeover-preview">
                <div class="stx-memory-takeover-preview__empty">${escapeHtml(input.emptyText || '填写范围后会在这里显示每一轮的 token 预估。')}</div>
            </div>
        `;
    }
    if (input.estimate.validationError) {
        return `
            <div class="stx-memory-takeover-preview">
                <div class="stx-memory-takeover-preview__warning">${escapeHtml(input.estimate.validationError)}</div>
            </div>
        `;
    }
    const warningBlock = input.estimate.overflowWarnings.length > 0
        ? `
            <div class="stx-memory-takeover-preview__warning">
                ${input.estimate.overflowWarnings.map((item: string): string => `<div>${escapeHtml(item)}</div>`).join('')}
            </div>
        `
        : '';
    const snapshotHint: string = input.estimate.useActiveSnapshot
        ? `当前使用最近快照，快照层数 ${input.estimate.activeSnapshotFloors} 层。`
        : '当前不使用最近快照，只按批次处理所选范围。';
    const snapshotCoverAll: boolean = Boolean(
        input.estimate.useActiveSnapshot
        && input.estimate.range
        && input.estimate.activeWindow
        && input.estimate.range.startFloor === input.estimate.activeWindow.startFloor
        && input.estimate.range.endFloor === input.estimate.activeWindow.endFloor,
    );
    return `
        <div class="stx-memory-takeover-preview">
            <div class="stx-memory-takeover-preview__summary">
                <span>总批次数：<strong>${escapeHtml(String(input.estimate.totalBatches))}</strong></span>
                <span>批大小：<strong>${escapeHtml(String(input.estimate.batchSize))}</strong></span>
                <span>预警阈值：<strong>${escapeHtml(formatTokenCount(input.estimate.threshold))}</strong></span>
            </div>
            ${input.estimate.coverageSummary ? `<div class="stx-memory-takeover-preview__empty">${escapeHtml(input.estimate.coverageSummary)}</div>` : ''}
            <div class="stx-memory-takeover-preview__empty">${escapeHtml(snapshotHint)}</div>
            ${snapshotCoverAll ? '<div class="stx-memory-takeover-preview__empty">当前快照范围已覆盖全部所选楼层，这次只会处理这一轮快照。</div>' : ''}
            ${warningBlock}
            <div class="stx-memory-takeover-preview__list">
                ${input.estimate.batches.map((item: MemoryTakeoverPreviewBatchEstimate): string => `
                    <div class="stx-memory-takeover-preview__item${item.overWarningThreshold ? ' is-overflow' : ''}">
                        <div class="stx-memory-takeover-preview__item-head">
                            <strong>${escapeHtml(item.label)}</strong>
                            <span>${escapeHtml(`${item.range.startFloor}-${item.range.endFloor} 层`)}</span>
                        </div>
                        <div class="stx-memory-takeover-preview__item-meta">
                            <span>消息 ${escapeHtml(String(item.messageCount))} 条</span>
                            <span>预计 ${escapeHtml(formatTokenCount(item.estimatedPromptTokens))}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * 功能：格式化 token 数字。
 * @param value token 数量。
 * @returns 格式化后的文本。
 */
function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('zh-CN').format(Math.max(0, Math.trunc(Number(value) || 0)));
}
