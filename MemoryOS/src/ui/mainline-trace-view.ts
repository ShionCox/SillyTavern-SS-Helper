import type { MemoryMainlineTraceEntry, MemoryMainlineTraceSnapshot } from '../types';

function escapeHtml(input: unknown): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：把时间戳格式化为相对时间文案。
 * @param ts 时间戳。
 * @returns 相对时间字符串。
 */
export function formatRelativeTime(ts: number): string {
    const value = Number(ts ?? 0);
    if (!Number.isFinite(value) || value <= 0) {
        return '刚刚';
    }
    const diffSeconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
    if (diffSeconds < 60) {
        return `${diffSeconds} 秒前`;
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
        return `${diffMinutes} 分钟前`;
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
        return `${diffHours} 小时前`;
    }
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} 天前`;
}

/**
 * 功能：格式化主链 trace 的简短状态。
 * @param traceSnapshot 主链 trace 快照。
 * @returns 适合展示在诊断页上的一句状态文本。
 */
export function formatMainlineTraceStatus(traceSnapshot: MemoryMainlineTraceSnapshot | null | undefined): string {
    const normalized = traceSnapshot ?? null;
    const lastSuccess = normalized?.lastSuccessTrace
        ?? normalized?.lastPromptInjectionTrace
        ?? normalized?.lastRecallTrace
        ?? normalized?.lastTrustedWriteTrace
        ?? normalized?.lastAppendTrace
        ?? normalized?.lastIngestTrace
        ?? null;
    if (!normalized || ((!Array.isArray(normalized.recentTraces) || normalized.recentTraces.length === 0) && !lastSuccess)) {
        return '主链 trace 尚未产生';
    }
    if (!lastSuccess) {
        return `${normalized.recentTraces.length} 条 trace 已记录`;
    }
    return `最近成功：${lastSuccess.label} · ${formatRelativeTime(lastSuccess.ts)}`;
}

/**
 * 功能：把主链 trace 证据压成适合 AI Health 面板的 HTML。
 * @param traceSnapshot 主链 trace 快照。
 * @returns 证据面板 HTML。
 */
export function buildMainlineTraceEvidenceMarkup(traceSnapshot: MemoryMainlineTraceSnapshot | null | undefined): string {
    const normalized = traceSnapshot ?? null;
    if (!normalized) {
        return '<span class="stx-memory-chat-strategy-empty">暂无主链执行证据</span>';
    }

    const rows: Array<{ label: string; trace: MemoryMainlineTraceEntry | null }> = [
        {
            label: '消息入口',
            trace: normalized.lastIngestTrace ?? null,
        },
        {
            label: '事件 append',
            trace: normalized.lastAppendTrace ?? null,
        },
        {
            label: 'trusted write',
            trace: normalized.lastTrustedWriteTrace ?? null,
        },
        {
            label: 'recall 构建',
            trace: normalized.lastRecallTrace ?? null,
        },
        {
            label: 'prompt 注入',
            trace: normalized.lastPromptInjectionTrace ?? null,
        },
    ];

    const promptDetail = normalized.lastPromptInjectionTrace?.detail && typeof normalized.lastPromptInjectionTrace.detail === 'object'
        ? normalized.lastPromptInjectionTrace.detail as Record<string, unknown>
        : null;
    const promptBits = [
        promptDetail && Number(promptDetail.insertedLength ?? 0) > 0 ? `注入 ${Number(promptDetail.insertedLength)} 字符` : '',
        promptDetail && Number(promptDetail.promptLength ?? 0) > 0 ? `原文 ${Number(promptDetail.promptLength)} 字符` : '',
        promptDetail && Number(promptDetail.insertIndex ?? -1) >= 0 ? `插入位 ${Number(promptDetail.insertIndex)}` : '',
    ].filter(Boolean);

    return `
      <div class="stx-memory-chat-strategy-quality-list">
        ${rows.map((row): string => {
            const trace = row.trace;
            const detail = trace?.detail && typeof trace.detail === 'object' ? trace.detail as Record<string, unknown> : null;
            const extraBits = [
                trace?.sourceMessageId ? `msg:${trace.sourceMessageId}` : '',
                trace?.requestId ? `req:${trace.requestId}` : '',
                detail?.reasonCodes && Array.isArray(detail.reasonCodes) ? `${(detail.reasonCodes as unknown[]).length} 条原因` : '',
            ].filter(Boolean);
            return `
              <div class="stx-memory-chat-strategy-quality-advice-item">
                <strong>${escapeHtml(row.label)}</strong>
                <span>${trace ? `${escapeHtml(trace.label)} · ${escapeHtml(formatRelativeTime(trace.ts))}` : '暂无记录'}</span>
                <small>${escapeHtml(extraBits.join(' · ') || '等待主链写入')}</small>
              </div>
            `.trim();
        }).join('')}
        <div class="stx-memory-chat-strategy-quality-advice-item">
          <strong>最近一轮注入</strong>
          <span>${escapeHtml(promptBits.join(' · ') || '暂无注入详情')}</span>
          <small>${escapeHtml(formatMainlineTraceStatus(normalized))}</small>
        </div>
      </div>
    `.trim();
}
