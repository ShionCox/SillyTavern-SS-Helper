import { escapeHtml } from '../editorShared';
import { getWorldProfileById } from '../../memory-world-profile';
import {
    resolveEntryActionTypeLabel,
    resolveEntryTypeLabel,
    resolveFailureReasonLabel,
    resolvePreviewWorkbenchText,
    resolvePromptStatsLabel,
    resolveNarrativeStyleLabel,
    resolveNarrativeStyleSourceLabel,
    resolveMutationActionLabel,
    resolveMutationSummaryFieldValue,
    resolvePromptBlockTitle,
    resolveRecallReasonCodeLabel,
    resolveRecallSourceLabel,
    resolveRetrievalProviderLabel,
    resolveRetrievalRulePackLabel,
    resolveSummaryFailureStageLabel,
    resolveSummaryPlannerFieldLabel,
    resolveSummaryStageLabel,
    resolveTraceEmptyText,
    resolveTraceLevelLabel,
    resolveTracePanelTitle,
    resolveTraceStageLabel,
    resolveWorldIdentifierList,
    resolveWorldProfileLabel,
    resolveWorldReasonCodeLabel,
    resolveWorldSubTypeLabel,
    resolveWorldTypeLabel,
} from '../workbenchLocale';
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
    detailText: string;
    payload: Record<string, unknown>;
    actionType?: string;
    changedFields?: Array<{
        label: string;
        beforeText: string;
        afterText: string;
    }>;
    beforeSnapshot?: Record<string, unknown> | null;
    afterSnapshot?: Record<string, unknown> | null;
    rawAuditRecord?: Record<string, unknown> | null;
    failureReason?: string;
};

/**
 * 功能：构建诊断中心预览视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @returns 页面 HTML。
 */
export function buildPreviewViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const entryUpdateCards = buildEntryUpdateCards(snapshot);
    const previewDiagnostics = snapshot.preview?.diagnostics ?? null;
    const currentTraceRecords = previewDiagnostics?.traceRecords ?? [];
    const latestTraceRecords = snapshot.recallExplanation?.traceRecords ?? [];
    const promptSizeStats = buildPromptSizeStatsMarkup(snapshot);
    const actionDistribution = buildActionDistributionMarkup(snapshot);
    const summaryStageDetails = buildSummaryStageDetailsMarkup(snapshot);

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'preview' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">诊断中心</div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <input class="stx-memory-workbench__input" id="stx-memory-preview-query" placeholder="模拟检索输入" style="width:280px;" value="${escapeAttr(state.previewQuery)}">
                    <button class="stx-memory-workbench__button" data-action="refresh-preview"><i class="fa-solid fa-satellite-dish"></i> 刷新诊断</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="capture-summary"><i class="fa-solid fa-camera"></i> 强制生成总结</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="export-chat-database"><i class="fa-solid fa-file-export"></i> 导出当前聊天记忆库</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="clear-chat-database" style="border-color:rgba(239,68,68,0.4); color:var(--mw-warn);">
                        <i class="fa-solid fa-trash-can"></i> 清空当前聊天记忆库
                    </button>
                </div>
            </div>
            <div class="stx-memory-workbench__diagnostics">
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolvePreviewWorkbenchText('basic_info'))}</div>
                    ${buildWorldProfilePanelMarkup(snapshot)}
                </div>
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolvePreviewWorkbenchText('prompt_overview'))}</div>
                    <div class="stx-memory-workbench__info-list">
                        <div class="stx-memory-workbench__info-row"><span>查询文本</span><strong>${escapeHtml(snapshot.preview?.query || '未提供')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>生成时间</span><strong>${escapeHtml(formatTimestamp(snapshot.preview?.generatedAt))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>命中角色数</span><strong>${escapeHtml(String(snapshot.preview?.matchedActorKeys.length ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>命中词条数</span><strong>${escapeHtml(String(snapshot.preview?.matchedEntryIds.length ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入视角</span><strong>${escapeHtml(previewDiagnostics?.injectionActorKey || '暂无')}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>注入词条</span><strong>${escapeHtml(String(previewDiagnostics?.injectedCount ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>估算字符数</span><strong>${escapeHtml(String(previewDiagnostics?.estimatedChars ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>清晰记忆</span><strong>${escapeHtml(String(previewDiagnostics?.retentionStageCounts?.clear ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>模糊记忆</span><strong>${escapeHtml(String(previewDiagnostics?.retentionStageCounts?.blur ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>失真记忆</span><strong>${escapeHtml(String(previewDiagnostics?.retentionStageCounts?.distorted ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('compare_key_schema_version'))}</span><strong>${escapeHtml(String(previewDiagnostics?.compareKeySchemaVersion ?? 'v2'))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('indexed_match_count'))}</span><strong>${escapeHtml(String(previewDiagnostics?.matchModeCounts?.indexed_match ?? 0))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('fallback_match_count'))}</span><strong>${escapeHtml(String(previewDiagnostics?.matchModeCounts?.fallback_match ?? 0))}</strong></div>
                    </div>
                    <div class="stx-memory-workbench__stack" style="margin-top:12px;">
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">${escapeHtml(resolvePromptBlockTitle('systemText'))}</div>
                            <pre style="max-height: 180px; overflow-y: auto; padding-right: 4px;">${escapeHtml(snapshot.preview?.systemText || '暂无系统注入文本')}</pre>
                        </div>
                        <div class="stx-memory-workbench__card">
                            <div class="stx-memory-workbench__mini-title">${escapeHtml(resolvePromptBlockTitle('finalText'))}</div>
                            <pre style="max-height: 180px; overflow-y: auto; padding-right: 4px;">${escapeHtml(snapshot.preview?.finalText || '暂无最终注入文本')}</pre>
                        </div>
                    </div>
                </div>

                ${promptSizeStats}

                ${actionDistribution}

                ${summaryStageDetails}

                ${buildMutationApplyDiagnosticsMarkup(snapshot)}

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">词条更新记录</div>
                    <div class="stx-memory-workbench__stack" style="max-height: 900px; overflow-y: auto; padding-right: 4px;">
                        ${entryUpdateCards || '<div class="stx-memory-workbench__empty">当前还没有可展示的词条更新记录。</div>'}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTracePanelTitle('currentRecall'))}</div>
                    <div style="max-height: 360px; overflow-y: auto; padding-right: 4px;">
                        ${buildTraceMarkup(currentTraceRecords, resolveTraceEmptyText('currentRecall'))}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolvePreviewWorkbenchText('latest_injection_reason'))}</div>
                    ${snapshot.recallExplanation ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>记录来源</span><strong>${escapeHtml(resolveRecallSourceLabel(snapshot.recallExplanation.source || 'unified_memory'))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>生成时间</span><strong>${escapeHtml(formatTimestamp(snapshot.recallExplanation.generatedAt))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>查询文本</span><strong>${escapeHtml(snapshot.recallExplanation.query || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>检索器</span><strong>${escapeHtml(resolveRetrievalProviderLabel(snapshot.recallExplanation.retrievalProviderId || ''))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>规则包</span><strong>${escapeHtml(resolveRetrievalRulePackLabel(snapshot.recallExplanation.retrievalRulePack || ''))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('compare_key_schema_version'))}</span><strong>${escapeHtml(snapshot.recallExplanation.compareKeySchemaVersion || 'v2')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>命中角色</span><strong>${escapeHtml(snapshot.recallExplanation.matchedActorKeys.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>命中词条</span><strong style="max-height:80px; overflow-y:auto; display:inline-block; text-align:left;">${escapeHtml(snapshot.recallExplanation.matchedEntryIds.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('indexed_match_count'))}</span><strong>${escapeHtml(String(snapshot.recallExplanation.matchModeCounts?.indexed_match ?? 0))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('fallback_match_count'))}</span><strong>${escapeHtml(String(snapshot.recallExplanation.matchModeCounts?.fallback_match ?? 0))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>原因码</span><strong style="max-height:80px; overflow-y:auto; display:inline-block; text-align:left;">${escapeHtml(resolveWorldIdentifierList(snapshot.recallExplanation.reasonCodes, resolveRecallReasonCodeLabel))}</strong></div>
                        </div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolvePreviewWorkbenchText('no_latest_injection_reason'))}</div>`}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTracePanelTitle('latestInjection'))}</div>
                    <div style="max-height: 360px; overflow-y: auto; padding-right: 4px;">
                        ${buildTraceMarkup(latestTraceRecords, resolveTraceEmptyText('latestInjection'))}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近总结</div>
                    <div class="stx-memory-workbench__stack" style="max-height: 360px; overflow-y: auto; padding-right: 4px;">
                        ${snapshot.summaries.map((summary): string => `
                            <article class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__split-head">
                                    <div class="stx-memory-workbench__panel-title">${escapeHtml(summary.title || '未命名总结')}</div>
                                    <span class="stx-memory-workbench__badge">${escapeHtml(formatTimestamp(summary.updatedAt))}</span>
                                </div>
                                <div class="stx-memory-workbench__detail-block">${escapeHtml(summary.content || '暂无内容')}</div>
                            </article>
                        `).join('') || '<div class="stx-memory-workbench__empty">当前还没有总结快照数据。</div>'}
                    </div>
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">原始变更时间线</div>
                    <div class="stx-memory-workbench__stack" style="max-height: 360px; overflow-y: auto; padding-right: 4px;">
                        ${snapshot.mutationHistory.map((history): string => `
                            <article class="stx-memory-workbench__card">
                                <div class="stx-memory-workbench__split-head">
                                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveMutationActionLabel(history.action))}</div>
                                    <span class="stx-memory-workbench__badge">${escapeHtml(formatTimestamp(history.ts))}</span>
                                </div>
                                <div class="stx-memory-workbench__detail-block">${escapeHtml(buildHistorySummary(history.action, history.payload))}</div>
                                <details class="stx-memory-workbench__details">
                                    <summary>查看原始数据</summary>
                                    <pre>${escapeHtml(stringifyData(history.payload))}</pre>
                                </details>
                            </article>
                        `).join('') || '<div class="stx-memory-workbench__empty">当前还没有变更时间线数据。</div>'}
                    </div>
                </div>
            </div>
        </section>
    `;
}

/**
 * 功能：构建提示词体积统计卡片。
 * @param snapshot 工作台快照。
 * @returns HTML 片段。
 */
/**
 * 功能：渲染当前聊天的基础画像信息。
 * @param snapshot 工作台快照。
 * @returns 基础信息模块 HTML。
 */
function buildWorldProfilePanelMarkup(snapshot: WorkbenchSnapshot): string {
    const binding = snapshot.worldProfileBinding;
    if (!binding) {
        return '<div class="stx-memory-workbench__empty">当前聊天还没有识别出稳定的世界画像。</div>';
    }
    const primaryProfile = getWorldProfileById(binding.primaryProfile);
    const primaryProfileLabel = resolveWorldProfileLabel(binding.primaryProfile);
    const secondaryProfileText = resolveWorldIdentifierList(binding.secondaryProfiles, resolveWorldProfileLabel);
    const worldType = resolveWorldTypeLabel(binding.primaryProfile);
    const subTypeText = primaryProfile?.subGenres?.length
        ? resolveWorldIdentifierList(primaryProfile.subGenres, resolveWorldSubTypeLabel)
        : '暂无';
    const reasonCodeText = resolveWorldIdentifierList(binding.reasonCodes, resolveWorldReasonCodeLabel);

    return `
        <div class="stx-memory-workbench__info-list">
            <div class="stx-memory-workbench__info-row"><span>当前聊天画像</span><strong>${escapeHtml(primaryProfile?.displayName || primaryProfileLabel)}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>当前世界类型</span><strong>${escapeHtml(worldType)}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>细分类型</span><strong>${escapeHtml(subTypeText)}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>辅助画像</span><strong>${escapeHtml(secondaryProfileText)}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>识别置信度</span><strong>${escapeHtml(String(binding.confidence))}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>识别依据</span><strong>${escapeHtml(reasonCodeText)}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>创建时间</span><strong>${escapeHtml(formatTimestamp(binding.createdAt))}</strong></div>
            <div class="stx-memory-workbench__info-row"><span>更新时间</span><strong>${escapeHtml(formatTimestamp(binding.updatedAt))}</strong></div>
        </div>
        <div class="stx-memory-workbench__card" style="margin-top:12px;">
            <div class="stx-memory-workbench__mini-title">识别来源样本</div>
            <div class="stx-memory-workbench__stack">
                ${(binding.detectedFrom ?? []).slice(0, 4).map((item: string): string => `<div class="stx-memory-workbench__detail-block">${escapeHtml(truncateText(item, 140))}</div>`).join('') || '<div class="stx-memory-workbench__empty">暂无来源样本。</div>'}
            </div>
        </div>
    `;
}

function buildPromptSizeStatsMarkup(snapshot: WorkbenchSnapshot): string {
    const systemTextLen = (snapshot.preview?.systemText || '').length;
    const roleTextLen = (snapshot.preview?.roleText || '').length;
    const finalTextLen = (snapshot.preview?.finalText || '').length;
    const totalPreviewLen = systemTextLen + roleTextLen + finalTextLen;

    const plannerPayload = snapshot.mutationHistory.find((h) => h.action === 'summary_planner_resolved')?.payload;
    const candidatePayload = snapshot.mutationHistory.find((h) => h.action === 'candidate_records_resolved')?.payload;
    const typeSchemaPayload = snapshot.mutationHistory.find((h) => h.action === 'type_schemas_resolved')?.payload;

    const candidateCount = Number(candidatePayload?.candidateCount ?? 0);
    const schemaCount = Array.isArray(typeSchemaPayload?.schemaIds) ? (typeSchemaPayload as Record<string, unknown>).schemaIds as string[] : [];

    if (totalPreviewLen <= 0 && candidateCount <= 0) {
        return '';
    }

    return `
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">提示词体积统计</div>
                    <div class="stx-memory-workbench__info-list">
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptBlockTitle('systemText'))}字符数</span><strong>${escapeHtml(String(systemTextLen))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptBlockTitle('roleText'))}字符数</span><strong>${escapeHtml(String(roleTextLen))}</strong></div>
                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptBlockTitle('finalText'))}字符数</span><strong>${escapeHtml(String(finalTextLen))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptStatsLabel('preview_total_chars'))}</span><strong>${escapeHtml(String(totalPreviewLen))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>候选记录数</span><strong>${escapeHtml(String(candidateCount))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptStatsLabel('active_schema_count'))}</span><strong>${escapeHtml(String(schemaCount.length))}</strong></div>
                ${schemaCount.length > 0 ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePromptStatsLabel('schema_list'))}</span><strong>${escapeHtml(schemaCount.join('、'))}</strong></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * 功能：渲染最近一次摘要的统一落盘诊断摘要。
 * @param snapshot 工作台快照
 * @returns HTML 片段
 */
function buildMutationApplyDiagnosticsMarkup(snapshot: WorkbenchSnapshot): string {
    const latestSummary = [...(snapshot.summaries ?? [])]
        .sort((left, right): number => Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0))[0];
    const diagnostics = latestSummary?.mutationApplyDiagnostics;
    if (!diagnostics) {
        return `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolvePreviewWorkbenchText('apply_diagnostics'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolvePreviewWorkbenchText('no_apply_diagnostics'))}</div>
            </div>
        `;
    }
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolvePreviewWorkbenchText('apply_diagnostics'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('mutation_source'))}</span><strong>${escapeHtml(latestSummary?.title || '结构化回合总结')}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('total_mutations'))}</span><strong>${escapeHtml(String(diagnostics.counts.input ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('noop_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.noop ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('add_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.add ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('update_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.update ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('merge_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.merge ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('invalidate_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.invalidate ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolvePreviewWorkbenchText('delete_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.delete ?? 0))}</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：构建动作分布统计卡片。
 * @param snapshot 工作台快照。
 * @returns HTML 片段。
 */
function buildActionDistributionMarkup(snapshot: WorkbenchSnapshot): string {
    const actionCounts: Record<string, number> = {};
    const validatedRecords = snapshot.mutationHistory.filter((h) => h.action === 'mutation_validated');
    const appliedRecords = snapshot.mutationHistory.filter((h) => h.action === 'mutation_applied');
    const failedRecords = snapshot.mutationHistory.filter((h) => h.action === 'summary_failed');

    for (const audit of snapshot.entryAuditRecords ?? []) {
        const actionType = String(audit.actionType ?? '').trim() || 'UNKNOWN';
        actionCounts[actionType] = (actionCounts[actionType] || 0) + 1;
    }

    const totalActions = Object.values(actionCounts).reduce((sum, count) => sum + count, 0);
    if (totalActions <= 0 && failedRecords.length <= 0) {
        return '';
    }

    const actionColorMap: Record<string, string> = {
        ADD: '#2dd4bf',
        UPDATE: '#38bdf8',
        MERGE: '#a78bfa',
        INVALIDATE: '#f59e0b',
        DELETE: '#ef4444',
        NOOP: '#64748b',
    };

    const actionBars = Object.entries(actionCounts)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([action, count]) => {
            const color = actionColorMap[action] || '#94a3b8';
            const actionLabel = resolveEntryActionTypeLabel(action);
            return `
                <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; min-width: 0;">
                    <span style="width: 80px; min-width: 0; color: ${color}; font-weight: 600; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(actionLabel)}</span>
                    <div style="flex: 1; min-width: 0; height: 16px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden;">
                        <div style="height: 100%; width: ${totalActions > 0 ? Math.round((count / totalActions) * 100) : 0}%; background: ${color}; border-radius: 4px; opacity: 0.7;"></div>
                    </div>
                    <span style="color: var(--mw-text); min-width: 24px; text-align: right; white-space: normal; word-break: break-word;">${escapeHtml(String(count))}</span>
                </div>`;
        }).join('');

    const failedSummary = failedRecords.length > 0
        ? `<div style="margin-top: 10px; padding: 8px 10px; background: rgba(239,68,68,0.1); border-left: 3px solid var(--mw-warn); border-radius: 0 4px 4px 0; font-size: 12px; color: var(--mw-warn); white-space: normal; word-break: break-word; overflow-wrap: anywhere;">
            共 ${escapeHtml(String(failedRecords.length))} 次总结链路失败${failedRecords.map((r) => {
                const reason = String(r.payload.reasonCode ?? '').trim();
                return reason ? `（${escapeHtml(reason)}）` : '';
            }).join('')}
           </div>`
        : '';

    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">动作统计</div>
            <div style="display: flex; flex-direction: column; gap: 6px; padding: 4px 0; min-width: 0;">
                ${actionBars || '<div class="stx-memory-workbench__empty">暂无动作记录。</div>'}
            </div>
            ${failedSummary}
        </div>
    `;
}

/**
 * 功能：构建总结阶段详情卡片。
 * @param snapshot 工作台快照。
 * @returns HTML 片段。
 */
function buildSummaryStageDetailsMarkup(snapshot: WorkbenchSnapshot): string {
    const plannerRecord = snapshot.mutationHistory.find((h) => h.action === 'summary_planner_resolved');
    const validatedRecord = snapshot.mutationHistory.find((h) => h.action === 'mutation_validated');
    const appliedRecord = snapshot.mutationHistory.find((h) => h.action === 'mutation_applied');
    const failedRecords = snapshot.mutationHistory.filter((h) => h.action === 'summary_failed');

    if (!plannerRecord && !validatedRecord && failedRecords.length <= 0) {
        return '';
    }

    const plannerSection = plannerRecord ? `
        <div style="padding: 8px 10px; background: rgba(196,160,98,0.08); border-left: 3px solid #c4a062; border-radius: 0 4px 4px 0;">
            <div style="font-size: 12px; font-weight: 600; color: #c4a062; margin-bottom: 4px;">${escapeHtml(resolveSummaryStageLabel('planner'))}</div>
            <div style="font-size: 12px; color: var(--mw-text); line-height: 1.6; min-width: 0; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">
                <div>${escapeHtml(resolveSummaryPlannerFieldLabel('shouldUpdate'))}：<strong>${escapeHtml(String(plannerRecord.payload.shouldUpdate ?? '-'))}</strong></div>
                <div>${escapeHtml(resolveSummaryPlannerFieldLabel('focusTypes'))}：<strong>${escapeHtml(Array.isArray(plannerRecord.payload.focusTypes) ? (plannerRecord.payload.focusTypes as string[]).join('、') : '-')}</strong></div>
                <div>${escapeHtml(resolveSummaryPlannerFieldLabel('entities'))}：<strong>${escapeHtml(Array.isArray(plannerRecord.payload.entities) ? (plannerRecord.payload.entities as string[]).join('、') : '-')}</strong></div>
                <div>${escapeHtml(resolveSummaryPlannerFieldLabel('topics'))}：<strong>${escapeHtml(Array.isArray(plannerRecord.payload.topics) ? (plannerRecord.payload.topics as string[]).join('、') : '-')}</strong></div>
                ${buildNarrativeStyleDebugMarkup(plannerRecord.payload.narrativeStyle)}
            </div>
        </div>
    ` : '';

    const validatedSection = validatedRecord ? `
        <div style="padding: 8px 10px; background: rgba(167,139,250,0.08); border-left: 3px solid #a78bfa; border-radius: 0 4px 4px 0;">
            <div style="font-size: 12px; font-weight: 600; color: #a78bfa; margin-bottom: 4px;">${escapeHtml(resolveSummaryStageLabel('mutation'))}</div>
            <div style="font-size: 12px; color: var(--mw-text); line-height: 1.6;">
                <div>动作数：<strong>${escapeHtml(String(validatedRecord.payload.actionCount ?? 0))}</strong></div>
                ${validatedRecord.payload.plannerNoop ? '<div style="color: var(--mw-muted);">规划阶段判定无需更新</div>' : ''}
            </div>
        </div>
    ` : '';

    const appliedSection = appliedRecord ? `
        <div style="padding: 8px 10px; background: rgba(45,212,191,0.08); border-left: 3px solid #2dd4bf; border-radius: 0 4px 4px 0;">
            <div style="font-size: 12px; font-weight: 600; color: #2dd4bf; margin-bottom: 4px;">${escapeHtml(resolveSummaryStageLabel('apply'))}</div>
            <div style="font-size: 12px; color: var(--mw-text); line-height: 1.6;">
                <div>总结ID：<strong style="font-family:'Fira Code',monospace; font-size:11px;">${escapeHtml(String(appliedRecord.payload.summaryId ?? '-'))}</strong></div>
                <div>动作数：<strong>${escapeHtml(String(appliedRecord.payload.actionCount ?? 0))}</strong></div>
            </div>
        </div>
    ` : '';

    const failedSection = failedRecords.map((record) => {
        const reasonCode = String(record.payload.reasonCode ?? '').trim();
        const validationErrors = Array.isArray(record.payload.validationErrors)
            ? (record.payload.validationErrors as string[]).map((e: string) => String(e ?? '').trim()).filter(Boolean)
            : [];
        const isSchemaFail = reasonCode.startsWith('validation_failed');
        const stageLabel = isSchemaFail ? '结构校验失败' : '总结链路失败';

        return `
        <div style="padding: 8px 10px; background: rgba(239,68,68,0.08); border-left: 3px solid var(--mw-warn); border-radius: 0 4px 4px 0;">
            <div style="font-size: 12px; font-weight: 600; color: var(--mw-warn); margin-bottom: 4px;">${escapeHtml(stageLabel)}</div>
            <div style="font-size: 12px; color: var(--mw-text); line-height: 1.6;">
                <div>原因：<strong>${escapeHtml(resolveFailureReasonLabel(reasonCode || 'unknown'))}</strong></div>
                <div>失败阶段：<strong>${escapeHtml(resolveSummaryFailureStageLabel(reasonCode))}</strong></div>
                ${validationErrors.length > 0 ? `<div>校验错误：<strong>${escapeHtml(validationErrors.join('；'))}</strong></div>` : ''}
            </div>
        </div>
    `;
    }).join('');

    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">总结阶段详情</div>
            <div class="stx-memory-workbench__stack" style="gap: 8px;">
                ${plannerSection}
                ${validatedSection}
                ${appliedSection}
                ${failedSection}
                ${!plannerSection && !validatedSection && !appliedSection && !failedSection ? '<div class="stx-memory-workbench__empty">当前还没有总结阶段信息。</div>' : ''}
            </div>
        </div>
    `;
}

/**
 * 功能：构建统一的词条更新记录卡片。
 * @param snapshot 工作台快照。
 * @returns 卡片 HTML。
 */
/**
 * 功能：渲染当前轮次叙事风格调试信息。
 * @param value 叙事风格 payload。
 * @returns HTML 片段。
 */
function buildNarrativeStyleDebugMarkup(value: unknown): string {
    const payload = normalizeRecord(value);
    const primaryStyle = String(payload.primaryStyle ?? '').trim();
    const secondaryStyles = Array.isArray(payload.secondaryStyles)
        ? (payload.secondaryStyles as unknown[]).map((item: unknown): string => String(item ?? '').trim()).filter(Boolean)
        : [];
    const source = String(payload.source ?? '').trim();
    const isStable = payload.isStable === true;
    if (!primaryStyle && secondaryStyles.length <= 0 && !source) {
        return '';
    }
    return `
        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(255,255,255,0.12);">
            <div>当前风格：<strong>${escapeHtml(resolveNarrativeStyleLabel(primaryStyle || ''))}</strong></div>
            <div>次风格：<strong>${escapeHtml(secondaryStyles.length > 0 ? secondaryStyles.map((item: string): string => resolveNarrativeStyleLabel(item)).join('、') : '暂无')}</strong></div>
            <div>来源：<strong>${escapeHtml(resolveNarrativeStyleSourceLabel(source || ''))}</strong></div>
            <div>稳定状态：<strong>${escapeHtml(isStable ? '已稳定' : '待观察')}</strong></div>
        </div>
    `;
}

function buildEntryUpdateCards(snapshot: WorkbenchSnapshot): string {
    const successRecords: EntryUpdateRecord[] = (snapshot.entryAuditRecords ?? []).map((audit): EntryUpdateRecord => ({
        key: `audit:${audit.auditId}`,
        ts: audit.ts,
        status: 'success',
        mode: resolveAuditMode(audit.actionType),
        title: String(audit.entryTitle ?? '未命名词条').trim() || '未命名词条',
        entryType: String(audit.entryType ?? 'other').trim() || 'other',
        entryId: String(audit.entryId ?? '').trim(),
        sourceLabel: String(audit.sourceLabel ?? '').trim()
            || (String(audit.summaryId ?? '').trim() ? '结构化回合总结' : '工作台直接编辑'),
        detailText: resolveAuditDetailText(audit as unknown as Record<string, unknown>),
        payload: {
            actionType: audit.actionType,
            summaryId: audit.summaryId,
            reasonCodes: audit.reasonCodes ?? [],
        },
        actionType: audit.actionType,
        changedFields: (audit.changedFields ?? []).map((item) => ({
            label: item.label,
            beforeText: formatAuditFieldValue(item.before),
            afterText: formatAuditFieldValue(item.after),
        })),
        beforeSnapshot: audit.beforeEntry ? normalizeRecord(audit.beforeEntry as unknown) : null,
        afterSnapshot: audit.afterEntry ? normalizeRecord(audit.afterEntry as unknown) : null,
        rawAuditRecord: normalizeRecord(audit as unknown),
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
            detailText: buildFailureDetail(history.payload),
            payload: normalizeRecord(history.payload),
            actionType: 'summary_failed',
            failureReason: resolveFailureReasonLabel(String(history.payload.reasonCode ?? '').trim() || 'unknown'),
        }));

    return [...failedRecords, ...successRecords]
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
    const isFailed = record.status === 'failed';
    const typeColor = isFailed ? 'var(--mw-warn)' : 'var(--mw-accent-cyan)';
    const typeBg = isFailed ? 'rgba(239, 68, 68, 0.15)' : 'rgba(6, 182, 212, 0.12)';
    
    // 生成唯一随机ID规避闭包捕获与ID重复
    const diffId = 'diff_' + Math.random().toString(36).slice(2, 9);
    const sourceId = 'src_' + Math.random().toString(36).slice(2, 9);
    
    const changedFieldsCount = (record.changedFields ?? []).length;
    const changedFieldsMarkup = changedFieldsCount > 0
        ? `
            <style>#${diffId}:checked ~ .content-${diffId} { display: flex !important; }</style>
            <div style="margin-top: 10px;">
                <input type="checkbox" id="${diffId}" style="display:none;" />
                <label for="${diffId}" style="cursor: pointer; user-select: none; font-size: 12px; background: rgba(255,255,255,0.08); border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); padding: 8px 10px; font-weight: 600; color: var(--mw-text); display: flex; align-items: center; gap: 6px; transition: background 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                    <span style="opacity: 0.8;">共发生 </span><span style="color: ${typeColor}; font-size: 13px;">${changedFieldsCount}</span><span style="opacity: 0.8;"> 个字段变更 (点击展开对比) ▼</span>
                </label>
                <div class="content-${diffId}" style="display: none; flex-direction: column; gap: 8px; margin-top: 8px;">
                    ${(record.changedFields ?? []).map((field) => `
                        <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; overflow: hidden; display: flex; flex-direction: column;">
                            <div style="padding: 6px 10px; background: rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.08); color: var(--mw-text); font-weight: 600; font-family: monospace; font-size: 11px;">
                                字段: ${escapeHtml(field.label)}
                            </div>
                            <div style="display: flex; flex-direction: column; font-size: 11px;">
                                <div style="display: flex; border-bottom: 1px dashed rgba(255,255,255,0.08);">
                                    <div style="width: 28px; text-align: center; padding: 6px 0; background: rgba(239, 68, 68, 0.15); color: var(--mw-warn); font-weight: 600; flex-shrink: 0; user-select: none; font-size: 14px;">-</div>
                                    <div style="padding: 6px 10px; color: #aaa; flex: 1; word-wrap: break-word; white-space: pre-wrap; font-family: 'Fira Code', monospace; line-height: 1.5; text-decoration: line-through;">${escapeHtml(field.beforeText || '无内容')}</div>
                                </div>
                                <div style="display: flex;">
                                    <div style="width: 28px; text-align: center; padding: 6px 0; background: rgba(6, 182, 212, 0.15); color: var(--mw-accent-cyan); font-weight: 600; flex-shrink: 0; user-select: none; font-size: 14px;">+</div>
                                    <div style="padding: 6px 10px; color: #fff; flex: 1; word-wrap: break-word; white-space: pre-wrap; font-family: 'Fira Code', monospace; line-height: 1.5;">${escapeHtml(field.afterText || '无内容')}</div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `
        : '';
    
    return `
        <article data-entry-update-key="${escapeAttr(record.key)}" style="flex-shrink: 0; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; margin-bottom: 12px; overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(0,0,0,0.2); border-bottom: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                    <span style="background: ${typeBg}; color: ${typeColor}; padding: 3px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; white-space: nowrap; border: 1px solid ${typeBg};">${escapeHtml(record.mode)}</span>
                    <span style="font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${escapeAttr(record.title)}">${escapeHtml(record.title)}</span>
                    ${record.entryId ? `<span style="font-size: 11px; color: rgba(255,255,255,0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;" title="${escapeAttr(record.entryId)}">${escapeHtml(record.entryId)}</span>` : ''}
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.5); white-space: nowrap; padding-left: 12px; flex-shrink: 0;">
                    ${escapeHtml(formatTimestamp(record.ts))}
                </div>
            </div>
            
            <div style="padding: 10px 12px;">
                <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: rgba(255,255,255,0.6); margin-bottom: ${(record.detailText || changedFieldsMarkup) ? '10px' : '0'}; min-width: 0;">
                    <div style="display: flex; gap: 4px; align-items: center;"><span>类型：</span><span style="color:#ddd;">${escapeHtml(resolveEntryTypeLabel(record.entryType || 'unknown'))}</span></div>
                    <div style="display: flex; gap: 4px; align-items: center;"><span>来源:</span><span style="color:#ddd;">${escapeHtml(record.sourceLabel)}</span></div>
                    <div style="display: flex; gap: 4px; align-items: center;"><span>动作：</span><strong style="color:#ddd;">${escapeHtml(resolveEntryActionTypeLabel(record.actionType || ''))}</strong></div>
                    ${record.failureReason ? `<div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start; color: var(--mw-warn); flex: 1 1 100%; min-width: 0;"><span>失败原因:</span><strong style="display:block; width:100%; white-space: normal; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(record.failureReason)}</strong></div>` : ''}
                </div>

                ${record.detailText ? `
                <div style="font-size: 12px; color: #ddd; line-height: 1.6; padding: 8px 10px; background: rgba(0,0,0,0.25); border-left: 3px solid ${typeColor}; border-radius: 0 4px 4px 0; word-wrap: break-word; white-space: pre-wrap; font-weight: 500;">${escapeHtml(record.detailText)}</div>
                ` : ''}

                ${changedFieldsMarkup}

                <style>#${sourceId}:checked ~ .content-${sourceId} { display: flex !important; }</style>
                <div style="margin-top: 12px;">
                    <input type="checkbox" id="${sourceId}" style="display:none;" />
                    <label for="${sourceId}" style="cursor: pointer; user-select: none; display: inline-block; padding: 2px 4px; border-radius: 4px; font-size: 11px; color: var(--mw-accent-cyan); border: 1px solid rgba(6, 182, 212, 0.2); background: rgba(6, 182, 212, 0.05);">查看源数据 ▼</label>
                    <div class="content-${sourceId}" style="display: none; flex-direction: column; gap: 10px; margin-top: 8px;">
                        <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                            ${record.beforeSnapshot ? `
                            <div style="flex: 1; min-width: 200px;">
                                <div style="color: rgba(255,255,255,0.7); margin-bottom: 4px; font-size: 11px; font-weight:600;">更新前</div>
                                <pre style="max-height: 120px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; font-size: 11px; margin: 0; border: 1px solid rgba(255,255,255,0.1); font-family: 'Fira Code', monospace; color: #bbb;">${escapeHtml(stringifyData(record.beforeSnapshot))}</pre>
                            </div>
                            ` : ''}
                            ${record.afterSnapshot ? `
                            <div style="flex: 1; min-width: 200px;">
                                <div style="color: rgba(255,255,255,0.7); margin-bottom: 4px; font-size: 11px; font-weight:600;">更新后</div>
                                <pre style="max-height: 120px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; font-size: 11px; margin: 0; border: 1px solid rgba(255,255,255,0.1); font-family: 'Fira Code', monospace; color: #ddd;">${escapeHtml(stringifyData(record.afterSnapshot))}</pre>
                            </div>
                            ` : ''}
                        </div>
                        <div style="margin-top: ${(record.beforeSnapshot || record.afterSnapshot) ? '4px' : '0'};">
                            <div style="color: rgba(255,255,255,0.7); margin-bottom: 4px; font-size: 11px; font-weight:600;">原始记录</div>
                            <pre style="max-height: 120px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.4); border-radius: 4px; font-size: 11px; margin: 0; border: 1px solid rgba(255,255,255,0.1); font-family: 'Fira Code', monospace; color: #bbb;">${escapeHtml(stringifyData(record.rawAuditRecord ?? record.payload))}</pre>
                        </div>
                    </div>
                </div>
            </div>
        </article>
    `;
}

/**
 * 功能：构建 trace 列表展示。
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
                const stageLabel = resolveTraceStageLabel(record.stage || '');
                const levelLabel = resolveTraceLevelLabel(record.level || '');
                return `
                    <div style="border-left: 2px solid ${color}; padding: 6px 10px; background: ${bgColor}; border-radius: 0 4px 4px 0;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
                            <strong style="color: ${color}; font-size: 12px;">[${escapeHtml(stageLabel)}] ${escapeHtml(record.title || '未命名日志')}</strong>
                            <span style="color: var(--mw-muted); font-size: 10px; flex-shrink: 0;">${escapeHtml(formatTimestamp(record.ts))}</span>
                        </div>
                        <div style="font-size: 10px; color: var(--mw-muted); margin-bottom: ${record.message ? '4px' : '0'};">级别：${escapeHtml(levelLabel)}</div>
                        ${record.message ? `<div style="color: var(--mw-text); white-space: pre-wrap; word-break: break-all; opacity: 0.9;">${escapeHtml(record.message)}</div>` : ''}
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

/**
 * 功能：把变更记录整理成一段中文摘要。
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
        const rawText = formatDisplayValue(payload[field.key]);
        const text = rawText !== '暂无'
            ? resolveMutationSummaryFieldValue(field.key, payload[field.key]) || rawText
            : rawText;
        if (text !== '暂无') {
            fields.push(`${field.label}：${text}`);
        }
    });
    return fields.length > 0 ? fields.join('；') : `${resolveMutationActionLabel(action)}已记录，但没有额外可读摘要。`;
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
    return reasonCode ? `总结失败：${resolveFailureReasonLabel(reasonCode)}` : '结构化记忆更新失败';
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
    if (reasonCode) {
        return `原因：${resolveFailureReasonLabel(reasonCode)}`;
    }
    return '本次总结链路失败，详情请展开查看原始记录。';
}

/**
 * 功能：将动作类型转换为中文标签。
 * @param actionType 动作类型。
 * @returns 中文模式名。
 */
function resolveAuditMode(actionType: string): string {
    const mapping: Record<string, string> = {
        ADD: '新增成功',
        UPDATE: '更新成功',
        MERGE: '合并成功',
        INVALIDATE: '失效成功',
        DELETE: '删除成功',
    };
    return mapping[String(actionType ?? '').trim()] || '更新成功';
}

/**
 * 功能：生成审计卡片摘要。
 * @param audit 审计记录。
 * @returns 摘要文本。
 */
function resolveAuditDetailText(audit: Record<string, unknown>): string {
    const changedFields = Array.isArray(audit.changedFields) ? audit.changedFields : [];
    if (changedFields.length > 0) {
        // 当发生字段变更时，UI中已有独立的结构化折叠视图展示(changedFieldsMarkup)，为避免冗余纯文本输出，这里直接返回空。
        return '';
    }
    const afterEntry = normalizeRecord(audit.afterEntry);
    const beforeEntry = normalizeRecord(audit.beforeEntry);
    const summary = String(afterEntry.summary ?? beforeEntry.summary ?? '').trim();
    const detail = String(afterEntry.detail ?? beforeEntry.detail ?? '').trim();
    return summary || detail || '本次记录没有可直接显示的摘要。';
}

/**
 * 功能：格式化审计字段值。
 * @param value 字段值。
 * @returns 展示文本。
 */
function formatAuditFieldValue(value: unknown): string {
    if (value === undefined || value === null || value === '') {
        return '空';
    }
    if (typeof value === 'string') {
        return truncateText(value, 80);
    }
    return truncateText(formatDisplayValue(value), 80);
}
