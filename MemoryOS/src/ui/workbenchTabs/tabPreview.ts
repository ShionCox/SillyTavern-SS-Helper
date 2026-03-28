import { escapeHtml } from '../editorShared';
import {
    escapeAttr,
    formatDisplayValue,
    formatTimestamp,
    stringifyData,
    truncateText,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';

/**
 * 功能：构建诊断中心视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @returns 页面 HTML。
 */
export function buildPreviewViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const summaryCards = snapshot.summaries.map((summary): string => `
        <article class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__split-head">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(summary.title || '未命名总结')}</div>
                <span class="stx-memory-workbench__badge">${escapeHtml(formatTimestamp(summary.updatedAt))}</span>
            </div>
            <div class="stx-memory-workbench__detail-block">${escapeHtml(summary.content || '暂无内容')}</div>
            <div class="stx-memory-workbench__meta">涉及角色：${escapeHtml(summary.actorKeys.length > 0 ? summary.actorKeys.join('、') : '暂无')}</div>
        </article>
    `).join('');

    const mutationCards = snapshot.mutationHistory.map((history): string => `
        <article class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__split-head">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(history.action)}</div>
                <span class="stx-memory-workbench__badge">${escapeHtml(formatTimestamp(history.ts))}</span>
            </div>
            <div class="stx-memory-workbench__detail-block">${escapeHtml(buildHistorySummary(history.action, history.payload))}</div>
            <details class="stx-memory-workbench__details">
                <summary>查看原始 payload</summary>
                <pre>${escapeHtml(stringifyData(history.payload))}</pre>
            </details>
        </article>
    `).join('');

    const previewDiagnostics = snapshot.preview?.diagnostics ?? null;
    const currentRoute = previewDiagnostics?.contextRoute ?? null;
    const currentMatchedRules = currentRoute?.matchedRules ?? [];
    const currentReasons = currentRoute?.reasons?.map((item): string => item.detail).filter(Boolean) ?? [];
    const currentTraceRecords = previewDiagnostics?.traceRecords ?? [];
    const latestTraceRecords = snapshot.recallExplanation?.traceRecords ?? [];

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'preview' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">诊断中心</div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <input class="stx-memory-workbench__input" id="stx-memory-preview-query" placeholder="模拟环境探测输入" style="width:280px;" value="${escapeAttr(state.previewQuery)}">
                    <button class="stx-memory-workbench__button" data-action="refresh-preview"><i class="fa-solid fa-satellite-dish"></i> 刷新诊断</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="capture-summary"><i class="fa-solid fa-camera"></i> 强制快照归档</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="export-chat-database"><i class="fa-solid fa-file-export"></i> 导出当前聊天记忆库</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="clear-chat-database" style="border-color:rgba(239,68,68,0.4); color:var(--mw-warn);">
                        <i class="fa-solid fa-trash-can"></i> 清空当前聊天记忆库
                    </button>
                </div>
            </div>
            <div class="stx-memory-workbench__diagnostics">
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">提示词注入总览</div>
                    <div class="stx-memory-workbench__info-list">
                        <div class="stx-memory-workbench__info-row"><span>查询文本</span><strong>${escapeHtml(snapshot.preview?.query || '未提供')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>生成时间</span><strong>${escapeHtml(formatTimestamp(snapshot.preview?.generatedAt))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>命中角色数</span><strong>${escapeHtml(String(snapshot.preview?.matchedActorKeys.length ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>命中条目数</span><strong>${escapeHtml(String(snapshot.preview?.matchedEntryIds.length ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入视角</span><strong>${escapeHtml(previewDiagnostics?.injectionActorKey || '暂无')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入条目</span><strong>${escapeHtml(String(previewDiagnostics?.injectedCount ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>估算字数</span><strong>${escapeHtml(String(previewDiagnostics?.estimatedChars ?? 0))}</strong></div>
                    </div>
                    <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">systemText</div>
                            <pre>${escapeHtml(snapshot.preview?.systemText || '暂无 systemText')}</pre>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">roleText</div>
                            <pre>${escapeHtml(snapshot.preview?.roleText || '当前渲染链路未单独输出 roleText')}</pre>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">finalText</div>
                            <pre>${escapeHtml(snapshot.preview?.finalText || '暂无 finalText')}</pre>
                        </div>
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">当前检索判定</div>
                    ${previewDiagnostics ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>检索器</span><strong>${escapeHtml(previewDiagnostics.providerId || 'none')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>规则包</span><strong>${escapeHtml(previewDiagnostics.rulePackMode || 'hybrid')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>情境排序</span><strong>${escapeHtml(currentRoute?.facets.join(' > ') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>置信度</span><strong>${escapeHtml(String(currentRoute?.confidence ?? '暂无'))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>系统前缀</span><strong>${escapeHtml(currentRoute?.systemEventPrefix || '无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>子查询</span><strong>${escapeHtml(currentRoute?.subQueries?.join(' ｜ ') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>角色锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.actorKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>地点锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.locationKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>关系锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.relationKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>世界锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.worldKeys.join('、') || '暂无')}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">命中规则</div>
                                ${buildMatchedRulesMarkup(currentMatchedRules)}
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">判定原因</div>
                                ${buildReasonListMarkup(currentReasons)}
                            </div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前还没有可用的检索诊断。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">当前召回 Trace</div>
                    ${buildTraceMarkup(currentTraceRecords, '当前预览还没有 trace 记录。')}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近真实注入</div>
                    ${snapshot.recallExplanation ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>记录来源</span><strong>${escapeHtml(snapshot.recallExplanation.source || 'unified_memory')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>生成时间</span><strong>${escapeHtml(formatTimestamp(snapshot.recallExplanation.generatedAt))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>查询文本</span><strong>${escapeHtml(snapshot.recallExplanation.query || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>检索器</span><strong>${escapeHtml(snapshot.recallExplanation.retrievalProviderId || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>规则包</span><strong>${escapeHtml(snapshot.recallExplanation.retrievalRulePack || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>matchedActorKeys</span><strong>${escapeHtml(snapshot.recallExplanation.matchedActorKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>matchedEntryIds</span><strong>${escapeHtml(snapshot.recallExplanation.matchedEntryIds.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>reasonCodes</span><strong>${escapeHtml(snapshot.recallExplanation.reasonCodes.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>子查询</span><strong>${escapeHtml(snapshot.recallExplanation.subQueries?.join(' ｜ ') || '暂无')}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">最近命中规则</div>
                                ${buildMatchedRulesMarkup(snapshot.recallExplanation.matchedRules ?? [])}
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">最近判定原因</div>
                                ${buildReasonListMarkup(snapshot.recallExplanation.routeReasons ?? [])}
                            </div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前聊天还没有最近一次注入命中说明，这里不会伪造诊断结果。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近注入 Trace</div>
                    ${buildTraceMarkup(latestTraceRecords, '当前还没有最近一次真实注入的 trace。')}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">世界画像</div>
                    ${snapshot.worldProfileBinding ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>主画像</span><strong>${escapeHtml(snapshot.worldProfileBinding.primaryProfile)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>次画像</span><strong>${escapeHtml(snapshot.worldProfileBinding.secondaryProfiles.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>置信度</span><strong>${escapeHtml(String(snapshot.worldProfileBinding.confidence))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>reasonCodes</span><strong>${escapeHtml(snapshot.worldProfileBinding.reasonCodes.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>创建时间</span><strong>${escapeHtml(formatTimestamp(snapshot.worldProfileBinding.createdAt))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>更新时间</span><strong>${escapeHtml(formatTimestamp(snapshot.worldProfileBinding.updatedAt))}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__card" style="margin-top:12px;">
                            <div class="stx-memory-workbench__mini-title">detectedFrom 样本</div>
                            <div class="stx-memory-workbench__stack">
                                ${(snapshot.worldProfileBinding.detectedFrom ?? []).slice(0, 4).map((item: string): string => `<div class="stx-memory-workbench__detail-block">${escapeHtml(truncateText(item, 140))}</div>`).join('') || '<div class="stx-memory-workbench__empty">暂无来源样本。</div>'}
                            </div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前聊天还没有世界画像绑定。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近总结</div>
                    <div class="stx-memory-workbench__stack">
                        ${summaryCards || '<div class="stx-memory-workbench__empty">当前还没有 summary_snapshots 数据。</div>'}
                    </div>
                </div>
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">变更时间线</div>
                    <div class="stx-memory-workbench__stack">
                        ${mutationCards || '<div class="stx-memory-workbench__empty">当前还没有 memory_mutation_history 数据。</div>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：构建命中规则展示。
 * @param rules 规则列表。
 * @returns HTML。
 */
function buildMatchedRulesMarkup(rules: Array<{ pack: string; label: string; matchedText: string[] }>): string {
    if (!Array.isArray(rules) || rules.length <= 0) {
        return '<div class="stx-memory-workbench__empty">暂无命中规则。</div>';
    }
    return rules.map((rule): string => `
        <div class="stx-memory-workbench__detail-block">
            <strong>${escapeHtml(rule.label || '未命名规则')}</strong>
            <div class="stx-memory-workbench__meta">规则包：${escapeHtml(rule.pack || 'unknown')} ｜ 命中文本：${escapeHtml(rule.matchedText.join('、') || '暂无')}</div>
        </div>
    `).join('');
}

/**
 * 功能：构建原因列表展示。
 * @param reasons 原因列表。
 * @returns HTML。
 */
function buildReasonListMarkup(reasons: string[]): string {
    if (!Array.isArray(reasons) || reasons.length <= 0) {
        return '<div class="stx-memory-workbench__empty">暂无判定原因。</div>';
    }
    return reasons.map((reason: string): string => `<div class="stx-memory-workbench__detail-block">${escapeHtml(reason)}</div>`).join('');
}

/**
 * 功能：构建 trace 展示。
 * @param records trace 记录。
 * @param emptyText 空状态文案。
 * @returns HTML。
 */
function buildTraceMarkup(
    records: Array<{ ts: number; level: string; stage: string; title: string; message: string }>,
    emptyText: string,
): string {
    if (!Array.isArray(records) || records.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(emptyText)}</div>`;
    }
    return records.map((record): string => `
        <div class="stx-memory-workbench__detail-block">
            <strong>${escapeHtml(record.title || '未命名日志')}</strong>
            <div>${escapeHtml(record.message || '暂无内容')}</div>
            <div class="stx-memory-workbench__meta">${escapeHtml(formatTimestamp(record.ts))} ｜ ${escapeHtml(record.stage || 'unknown')} ｜ ${escapeHtml(record.level || 'info')}</div>
        </div>
    `).join('');
}

/**
 * 功能：把变更记录整理成一句中文摘要。
 * @param action 动作名。
 * @param payload 变更 payload。
 * @returns 摘要文本。
 */
function buildHistorySummary(action: string, payload: Record<string, unknown>): string {
    const fields: string[] = [];
    const fieldMap: Array<{ key: string; label: string }> = [
        { key: 'reasonCode', label: '原因' },
        { key: 'summaryId', label: '总结' },
        { key: 'actorKey', label: '角色' },
        { key: 'worldProfile', label: '世界画像' },
        { key: 'primaryProfile', label: '主画像' },
        { key: 'candidateCount', label: '候选数' },
        { key: 'matchedEntryCount', label: '命中数' },
        { key: 'messageCount', label: '消息数' },
        { key: 'actionCount', label: '动作数' },
    ];
    fieldMap.forEach((field): void => {
        const value = payload[field.key];
        const text = formatDisplayValue(value);
        if (text !== '暂无') {
            fields.push(`${field.label}：${text}`);
        }
    });
    if (fields.length > 0) {
        return fields.join('；');
    }
    return `动作 ${action} 已记录，但没有额外的可读摘要字段。`;
}
