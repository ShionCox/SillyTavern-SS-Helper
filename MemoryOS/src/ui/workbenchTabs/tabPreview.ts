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

type PreviewTraceRecord = {
    ts: number;
    level: string;
    stage: string;
    title: string;
    message: string;
};

type EntryUpdateRecord = {
    key: string;
    ts: number;
    status: 'success' | 'failed';
    mode: string;
    title: string;
    entryType: string;
    entryId: string;
    sourceLabel: string;
    actorKeys: string[];
    actionTags: string[];
    detailText: string;
    payload: Record<string, unknown>;
    failureReason?: string;
};

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
    const entryUpdateCards = buildEntryUpdateCards(snapshot);

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'preview' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">诊断中心</div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <input class="stx-memory-workbench__input" id="stx-memory-preview-query" placeholder="模拟检索输入" style="width:280px;" value="${escapeAttr(state.previewQuery)}">
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
                        <div class="stx-memory-workbench__info-row"><span>命中词条数</span><strong>${escapeHtml(String(snapshot.preview?.matchedEntryIds.length ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入视角</span><strong>${escapeHtml(previewDiagnostics?.injectionActorKey || '暂无')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入词条</span><strong>${escapeHtml(String(previewDiagnostics?.injectedCount ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>估算字符数</span><strong>${escapeHtml(String(previewDiagnostics?.estimatedChars ?? 0))}</strong></div>
                    </div>
                    <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">systemText</div>
                            <pre style="max-height: 200px; overflow-y: auto; padding-right: 4px;">${escapeHtml(snapshot.preview?.systemText || '暂无 systemText')}</pre>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">roleText</div>
                            <pre style="max-height: 100px; overflow-y: auto; padding-right: 4px;">${escapeHtml(snapshot.preview?.roleText || '当前链路没有单独输出 roleText')}</pre>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">finalText</div>
                            <pre style="max-height: 200px; overflow-y: auto; padding-right: 4px;">${escapeHtml(snapshot.preview?.finalText || '暂无 finalText')}</pre>
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
                            <div class="stx-memory-workbench__info-row"><span>子查询</span><strong>${escapeHtml(currentRoute?.subQueries?.join(' / ') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>角色锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.actorKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>地点锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.locationKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>关系锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.relationKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>世界锚点</span><strong>${escapeHtml(currentRoute?.entityAnchors.worldKeys.join('、') || '暂无')}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">命中规则</div>
                                <div style="max-height: 150px; overflow-y: auto; padding-right: 4px;">
                                    ${buildMatchedRulesMarkup(currentMatchedRules)}
                                </div>
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">判定原因</div>
                                <div style="max-height: 150px; overflow-y: auto; padding-right: 4px;">
                                    ${buildReasonListMarkup(currentReasons)}
                                </div>
                            </div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前还没有可用的检索诊断。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">当前召回 Trace</div>
                    <div style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
                        ${buildTraceMarkup(currentTraceRecords, '当前预览还没有 trace 记录。')}
                    </div>
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
                            <div class="stx-memory-workbench__info-row"><span>命中角色</span><strong>${escapeHtml(snapshot.recallExplanation.matchedActorKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>命中词条</span><strong style="max-height:80px; overflow-y:auto; display:inline-block; text-align:left;">${escapeHtml(snapshot.recallExplanation.matchedEntryIds.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>原因码</span><strong style="max-height:80px; overflow-y:auto; display:inline-block; text-align:left;">${escapeHtml(snapshot.recallExplanation.reasonCodes.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>子查询</span><strong>${escapeHtml(snapshot.recallExplanation.subQueries?.join(' / ') || '暂无')}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">最近命中规则</div>
                                <div style="max-height: 150px; overflow-y: auto; padding-right: 4px;">
                                    ${buildMatchedRulesMarkup(snapshot.recallExplanation.matchedRules ?? [])}
                                </div>
                            </div>
                            <div class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__mini-title">最近判定原因</div>
                                <div style="max-height: 150px; overflow-y: auto; padding-right: 4px;">
                                    ${buildReasonListMarkup(snapshot.recallExplanation.routeReasons ?? [])}
                                </div>
                            </div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前聊天还没有最近一次真实注入说明。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近注入 Trace</div>
                    <div style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
                        ${buildTraceMarkup(latestTraceRecords, '当前还没有最近一次真实注入的 trace。')}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">世界画像</div>
                    ${snapshot.worldProfileBinding ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>主画像</span><strong>${escapeHtml(snapshot.worldProfileBinding.primaryProfile)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>次画像</span><strong>${escapeHtml(snapshot.worldProfileBinding.secondaryProfiles.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>置信度</span><strong>${escapeHtml(String(snapshot.worldProfileBinding.confidence))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>原因码</span><strong>${escapeHtml(snapshot.worldProfileBinding.reasonCodes.join('、') || '暂无')}</strong></div>
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
                    <div class="stx-memory-workbench__stack" style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
                        ${summaryCards || '<div class="stx-memory-workbench__empty">当前还没有 summary snapshots 数据。</div>'}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">词条更新记录</div>
                    <div class="stx-memory-workbench__stack" style="max-height: 460px; overflow-y: auto; padding-right: 4px;">
                        ${entryUpdateCards || '<div class="stx-memory-workbench__empty">当前还没有可展示的词条更新记录。</div>'}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">原始变更时间线</div>
                    <div class="stx-memory-workbench__stack" style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
                        ${mutationCards || '<div class="stx-memory-workbench__empty">当前还没有 memory mutation history 数据。</div>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：构建统一的词条更新记录卡片。
 * @param snapshot 工作台快照。
 * @returns 卡片 HTML。
 */
function buildEntryUpdateCards(snapshot: WorkbenchSnapshot): string {
    const entryById = new Map(snapshot.entries.map((entry): [string, typeof entry] => [entry.entryId, entry]));
    const historyBySummaryId = new Map<string, Array<{ action: string; payload: Record<string, unknown>; ts: number }>>();

    snapshot.mutationHistory.forEach((history): void => {
        const summaryId = String(history.payload.summaryId ?? '').trim();
        if (!summaryId) {
            return;
        }
        const bucket = historyBySummaryId.get(summaryId) ?? [];
        bucket.push({ action: history.action, payload: history.payload, ts: history.ts });
        historyBySummaryId.set(summaryId, bucket);
    });

    const successRecords: EntryUpdateRecord[] = snapshot.summaries.flatMap((summary) => {
        const relatedHistory = historyBySummaryId.get(summary.summaryId) ?? [];
        const actionTags = Array.from(new Set(
            relatedHistory
                .map((item): string => String(item.action ?? '').trim())
                .filter(Boolean),
        ));
        return (summary.entryUpserts ?? []).map((upsert, index): EntryUpdateRecord => {
            const currentEntry = upsert.entryId ? entryById.get(upsert.entryId) : undefined;
            return {
                key: `summary:${summary.summaryId}:${upsert.entryId ?? index}`,
                ts: summary.updatedAt,
                status: 'success',
                mode: upsert.entryId ? '更新成功' : '新增成功',
                title: String(upsert.title ?? currentEntry?.title ?? '未命名词条').trim() || '未命名词条',
                entryType: String(upsert.entryType ?? currentEntry?.entryType ?? 'other').trim() || 'other',
                entryId: String(upsert.entryId ?? currentEntry?.entryId ?? '').trim(),
                sourceLabel: String(summary.title ?? '').trim() || '结构化总结',
                actorKeys: summary.actorKeys ?? [],
                actionTags,
                detailText: String(upsert.summary ?? currentEntry?.summary ?? currentEntry?.detail ?? '').trim(),
                payload: normalizeRecord(upsert.detailPayload ?? currentEntry?.detailPayload),
            };
        });
    });

    const linkedEntryIds = new Set(successRecords.map((record): string => record.entryId).filter(Boolean));

    const directRecords: EntryUpdateRecord[] = snapshot.entries
        .filter((entry): boolean => !linkedEntryIds.has(entry.entryId))
        .filter((entry): boolean => !Array.isArray(entry.sourceSummaryIds) || entry.sourceSummaryIds.length <= 0)
        .sort((left, right): number => right.updatedAt - left.updatedAt)
        .slice(0, 6)
        .map((entry): EntryUpdateRecord => ({
            key: `direct:${entry.entryId}`,
            ts: entry.updatedAt,
            status: 'success',
            mode: '直接变更',
            title: entry.title,
            entryType: entry.entryType,
            entryId: entry.entryId,
            sourceLabel: '工作台直接编辑',
            actorKeys: [],
            actionTags: [],
            detailText: String(entry.summary ?? entry.detail ?? '').trim(),
            payload: normalizeRecord(entry.detailPayload),
        }));

    const failedRecords: EntryUpdateRecord[] = snapshot.mutationHistory
        .filter((history): boolean => history.action === 'summary_failed')
        .map((history, index): EntryUpdateRecord => ({
            key: `failed:${history.historyId}:${index}`,
            ts: history.ts,
            status: 'failed',
            mode: '更新失败',
            title: resolveFailureTitle(history.payload),
            entryType: String(history.payload.targetKind ?? history.payload.schemaId ?? 'unknown').trim() || 'unknown',
            entryId: String(history.payload.recordId ?? history.payload.entryId ?? '').trim(),
            sourceLabel: '总结链路失败',
            actorKeys: [],
            actionTags: ['summary_failed'],
            detailText: buildFailureDetail(history.payload),
            payload: normalizeRecord(history.payload),
            failureReason: String(history.payload.reasonCode ?? '').trim() || 'unknown',
        }));

    return [...failedRecords, ...successRecords, ...directRecords]
        .sort((left, right): number => right.ts - left.ts)
        .slice(0, 18)
        .map(renderEntryUpdateCard)
        .join('');
}

/**
 * 功能：渲染单条词条更新记录。
 * @param record 更新记录。
 * @returns 卡片 HTML。
 */
function renderEntryUpdateCard(record: EntryUpdateRecord): string {
    const borderColor = record.status === 'failed' ? 'var(--mw-warn)' : 'var(--mw-accent-cyan)';
    const badgeStyle = record.status === 'failed'
        ? 'background: rgba(239,68,68,0.12); color: var(--mw-warn);'
        : '';
    const actorLabel = record.actorKeys.length > 0 ? record.actorKeys.join('、') : '暂无';
    const actionLabel = record.actionTags.length > 0 ? record.actionTags.join(' / ') : '未记录';
    return `
        <article class="stx-memory-workbench__card" style="border-left: 2px solid ${borderColor}; position:relative; padding: 10px;">
            <div class="stx-memory-workbench__split-head" style="align-items:flex-start; gap:12px;">
                <div style="min-width:0; flex:1;">
                    <div class="stx-memory-workbench__panel-title" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span>${escapeHtml(record.title)}</span>
                        <span class="stx-memory-workbench__badge" style="${badgeStyle}">${escapeHtml(record.mode)}</span>
                    </div>
                    <div class="stx-memory-workbench__meta" style="margin-top:4px;">
                        类型：${escapeHtml(record.entryType || 'unknown')}
                        ${record.entryId ? ` · 词条 ID：${escapeHtml(record.entryId)}` : ''}
                    </div>
                </div>
                <span class="stx-memory-workbench__badge" style="flex-shrink:0;">${escapeHtml(formatTimestamp(record.ts))}</span>
            </div>
            <div class="stx-memory-workbench__detail-block" style="margin-top:8px;">
                ${escapeHtml(record.detailText || '暂无摘要')}
            </div>
            <div class="stx-memory-workbench__info-list" style="margin-top:8px;">
                <div class="stx-memory-workbench__info-row"><span>来源</span><strong>${escapeHtml(record.sourceLabel)}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>涉及角色</span><strong>${escapeHtml(actorLabel)}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>关联动作</span><strong>${escapeHtml(actionLabel)}</strong></div>
                ${record.failureReason ? `<div class="stx-memory-workbench__info-row"><span>失败原因</span><strong style="color:var(--mw-warn);">${escapeHtml(record.failureReason)}</strong></div>` : ''}
            </div>
            <details class="stx-memory-workbench__details" style="margin-top:8px;">
                <summary>查看结构化内容</summary>
                <pre>${escapeHtml(stringifyData(record.payload))}</pre>
            </details>
        </article>
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
            <div class="stx-memory-workbench__meta">规则包：${escapeHtml(rule.pack || 'unknown')} · 命中文本：${escapeHtml(rule.matchedText.join('、') || '暂无')}</div>
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
function buildTraceMarkup(records: PreviewTraceRecord[], emptyText: string): string {
    if (!Array.isArray(records) || records.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(emptyText)}</div>`;
    }
    return `
        <div style="display: flex; flex-direction: column; gap: 8px; font-family: 'Fira Code', monospace; font-size: 11px;">
            ${records.map((record): string => {
                const isError = record.level === 'error';
                const isWarn = record.level === 'warn';
                const color = isError ? 'var(--mw-warn)' : isWarn ? 'var(--mw-accent)' : 'var(--mw-accent-cyan)';
                const bgColor = isError ? 'rgba(239,68,68,0.05)' : isWarn ? 'rgba(196,160,98,0.05)' : 'rgba(56,189,248,0.05)';
                const borderColor = isError ? 'rgba(239,68,68,0.2)' : isWarn ? 'rgba(196,160,98,0.2)' : 'rgba(56,189,248,0.2)';
                return `
                <div style="border-left: 2px solid ${color}; padding: 6px 10px; background: ${bgColor}; border-radius: 0 4px 4px 0; border-top: 1px solid transparent; border-right: 1px solid transparent; border-bottom: 1px solid transparent; transition: border-color 0.2s;" onmouseover="this.style.borderColor='${borderColor}'" onmouseout="this.style.borderColor='transparent'">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                        <strong style="color: ${color}; font-size: 12px;">[${escapeHtml(record.stage || 'unknown')}] ${escapeHtml(record.title || '未命名日志')}</strong>
                        <span style="color: var(--mw-muted); font-size: 10px; flex-shrink: 0;">${escapeHtml(formatTimestamp(record.ts))}</span>
                    </div>
                    ${record.message ? `<div style="color: var(--mw-text); white-space: pre-wrap; word-break: break-all; opacity: 0.9;">${escapeHtml(record.message)}</div>` : ''}
                </div>
                `;
            }).join('')}
        </div>
    `;
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
        const text = formatDisplayValue(payload[field.key]);
        if (text !== '暂无') {
            fields.push(`${field.label}：${text}`);
        }
    });
    if (fields.length > 0) {
        return fields.join('；');
    }
    return `动作 ${action} 已记录，但没有额外可读摘要。`;
}

/**
 * 功能：归一化对象。
 * @param value 原始值。
 * @returns 安全对象。
 */
function normalizeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value as Record<string, unknown>;
}

/**
 * 功能：解析失败卡片标题。
 * @param payload 失败 payload。
 * @returns 标题文本。
 */
function resolveFailureTitle(payload: Record<string, unknown>): string {
    const reasonCode = String(payload.reasonCode ?? '').trim();
    if (reasonCode) {
        return `总结失败：${reasonCode}`;
    }
    return '结构化记忆更新失败';
}

/**
 * 功能：构建失败详情摘要。
 * @param payload 失败 payload。
 * @returns 摘要文本。
 */
function buildFailureDetail(payload: Record<string, unknown>): string {
    const validationErrors = Array.isArray(payload.validationErrors)
        ? payload.validationErrors.map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
        : [];
    if (validationErrors.length > 0) {
        return `校验失败：${validationErrors.join('；')}`;
    }
    const reasonCode = String(payload.reasonCode ?? '').trim();
    const worldProfile = String(payload.worldProfile ?? '').trim();
    if (reasonCode && worldProfile) {
        return `原因码：${reasonCode}；世界画像：${worldProfile}`;
    }
    if (reasonCode) {
        return `原因码：${reasonCode}`;
    }
    return '本次总结链路失败，详情请展开查看结构化内容。';
}
