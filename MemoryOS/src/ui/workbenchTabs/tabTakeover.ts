import { escapeHtml } from '../editorShared';
import { buildTakeoverPreviewMarkup } from '../takeoverPreviewMarkup';
import { resolveTakeoverFieldVisibility } from '../takeoverFormShared';
import { resolveTakeoverWorkbenchText } from '../workbenchLocale';
import {
    escapeAttr,
    formatTimestamp,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';
import type { MemoryTakeoverConsolidationResult } from '../../types';
import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';

/**
 * 功能：渲染旧聊天接管视图。
 * @param snapshot 工作台快照
 * @param state 当前状态
 * @returns HTML 片段
 */
export function buildTakeoverViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const progress = snapshot.takeoverProgress;
    const plan = progress?.plan ?? null;
    const currentBatch = progress?.currentBatch ?? null;
    const latestBatch = progress?.latestBatchResult ?? null;
    const activeSnapshot = progress?.activeSnapshot ?? null;
    const consolidation = progress?.consolidation ?? null;
    const completedCount = plan?.completedBatchIds.length ?? 0;
    const failedCount = plan?.failedBatchIds.length ?? 0;
    const isolatedCount = plan?.isolatedBatchIds.length ?? 0;
    const totalCount = plan?.totalBatches ?? 0;
    const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const visibility = resolveTakeoverFieldVisibility(state.takeoverMode);

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'takeover' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">旧聊天接管</div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <select class="stx-memory-workbench__select" id="stx-memory-takeover-mode" style="width: 160px;">
                        <option value="full"${state.takeoverMode === 'full' ? ' selected' : ''}>全部楼层</option>
                        <option value="recent"${state.takeoverMode === 'recent' ? ' selected' : ''}>最近 N 层</option>
                        <option value="custom_range"${state.takeoverMode === 'custom_range' ? ' selected' : ''}>自定义区间</option>
                    </select>
                    ${visibility.showRecentFloors ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-recent-floors" type="number" min="1" placeholder="最近层数" value="${escapeAttr(state.takeoverRecentFloors)}" style="width: 120px;">
                    ` : ''}
                    ${visibility.showCustomRange ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-range-start" type="number" min="1" placeholder="起始楼层" value="${escapeAttr(state.takeoverRangeStart)}" style="width: 110px;">
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-range-end" type="number" min="1" placeholder="结束楼层" value="${escapeAttr(state.takeoverRangeEnd)}" style="width: 110px;">
                    ` : ''}
                    <input class="stx-memory-workbench__input" id="stx-memory-takeover-batch-size" type="number" min="1" placeholder="每批楼层数" value="${escapeAttr(state.takeoverBatchSize)}" style="width: 120px;">
                    <div class="stx-memory-workbench__checkbox-row">
                        ${buildSharedBoxCheckbox({
                            id: 'stx-memory-takeover-use-active-snapshot',
                            appearance: 'check',
                            inputAttributes: {
                                checked: state.takeoverUseActiveSnapshot,
                            },
                        })}
                        <label for="stx-memory-takeover-use-active-snapshot">使用最近快照</label>
                    </div>
                    ${state.takeoverUseActiveSnapshot ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-active-snapshot-floors" type="number" min="1" placeholder="快照层数" value="${escapeAttr(state.takeoverActiveSnapshotFloors)}" style="width: 120px;">
                    ` : ''}
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-preview-calc"${state.takeoverPreviewLoading ? ' disabled' : ''}>
                        <i class="fa-solid fa-calculator"></i> ${state.takeoverPreviewLoading ? '计算中…' : '计算预估'}
                    </button>
                    <button id="stx-memory-takeover-start-button" class="stx-memory-workbench__button" data-action="takeover-start"${state.takeoverPreviewLoading ? ' disabled' : ''}>
                        <i class="fa-solid fa-play"></i> 开始接管
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-pause">
                        <i class="fa-solid fa-pause"></i> 暂停
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-resume">
                        <i class="fa-solid fa-forward"></i> 继续
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-consolidate">
                        <i class="fa-solid fa-layer-group"></i> 立即整合
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-abort" style="border-color:rgba(239,68,68,0.35); color:var(--mw-warn);">
                        <i class="fa-solid fa-stop"></i> 终止
                    </button>
                </div>
            </div>

            <div class="stx-memory-workbench__card">
                <details class="stx-memory-workbench__details"${state.takeoverPreviewExpanded ? ' open' : ''}>
                    <summary>批次 Token 预估</summary>
                    <div id="stx-memory-takeover-preview-panel">${buildTakeoverPreviewMarkup({
                        estimate: state.takeoverPreview,
                        loading: state.takeoverPreviewLoading,
                        emptyText: '点击“计算预估”后，这里会显示每一轮的 token 预估。',
                    })}</div>
                </details>
            </div>

            <div class="stx-memory-workbench__diagnostics">
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">任务状态</div>
                    ${state.takeoverProgressLoading && !plan ? '<div class="stx-memory-workbench__empty">正在加载旧聊天处理进度...</div>' : plan ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>状态</span><strong>${escapeHtml(plan.status)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>模式</span><strong>${escapeHtml(plan.mode)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>楼层范围</span><strong>${escapeHtml(`${plan.range.startFloor} - ${plan.range.endFloor}`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>总批次数</span><strong>${escapeHtml(String(totalCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>已完成批次</span><strong>${escapeHtml(String(completedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>失败批次</span><strong>${escapeHtml(String(failedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>隔离批次</span><strong>${escapeHtml(String(isolatedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>当前进度</span><strong>${escapeHtml(`${progressPercent}%`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>最近检查点</span><strong>${escapeHtml(formatTimestamp(plan.lastCheckpointAt))}</strong></div>
                            ${plan.lastError ? `<div class="stx-memory-workbench__info-row"><span>最近错误</span><strong>${escapeHtml(plan.lastError)}</strong></div>` : ''}
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前聊天还没有接管任务。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">当前批次</div>
                    ${state.takeoverProgressLoading && !currentBatch ? '<div class="stx-memory-workbench__empty">正在加载当前批次...</div>' : currentBatch ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>批次 ID</span><strong>${escapeHtml(currentBatch.batchId)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>类型</span><strong>${escapeHtml(currentBatch.category)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>范围</span><strong>${escapeHtml(`${currentBatch.range.startFloor} - ${currentBatch.range.endFloor}`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>状态</span><strong>${escapeHtml(currentBatch.status)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>准入</span><strong>${escapeHtml(currentBatch.admissionState ?? 'pending')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>开始时间</span><strong>${escapeHtml(formatTimestamp(currentBatch.startedAt))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>结束时间</span><strong>${escapeHtml(formatTimestamp(currentBatch.finishedAt))}</strong></div>
                            ${Array.isArray(currentBatch.validationErrors) && currentBatch.validationErrors.length > 0 ? `<div class="stx-memory-workbench__detail-block">${escapeHtml(currentBatch.validationErrors.join('；'))}</div>` : ''}
                            ${currentBatch.error ? `<div class="stx-memory-workbench__detail-block">${escapeHtml(currentBatch.error)}</div>` : ''}
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">当前没有运行中的批次。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最近活跃快照</div>
                    ${state.takeoverProgressLoading && !activeSnapshot ? '<div class="stx-memory-workbench__empty">正在加载最近快照...</div>' : activeSnapshot ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>当前场景</span><strong>${escapeHtml(activeSnapshot.currentScene || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>当前位置</span><strong>${escapeHtml(activeSnapshot.currentLocation || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>时间线索</span><strong>${escapeHtml(activeSnapshot.currentTimeHint || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>活跃目标</span><strong>${escapeHtml(activeSnapshot.activeGoals.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>未结线索</span><strong>${escapeHtml(activeSnapshot.openThreads.join('、') || '暂无')}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(activeSnapshot.recentDigest || '暂无最近摘要')}</div>
                    ` : '<div class="stx-memory-workbench__empty">最近活跃快照尚未生成。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">最新批次摘要</div>
                    ${state.takeoverProgressLoading && !latestBatch ? '<div class="stx-memory-workbench__empty">正在加载批次摘要...</div>' : latestBatch ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>批次</span><strong>${escapeHtml(latestBatch.batchId)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>准入结果</span><strong>${escapeHtml(latestBatch.isolated ? 'isolated' : (latestBatch.repairedOnce ? 'repaired' : (latestBatch.validated ? 'validated' : 'pending')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>章节标签</span><strong>${escapeHtml(latestBatch.chapterTags.join('、') || '暂无')}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>开放线索</span><strong>${escapeHtml(latestBatch.openThreads.join('、') || '暂无')}</strong></div>
                        </div>
                        ${Array.isArray(latestBatch.validationErrors) && latestBatch.validationErrors.length > 0 ? `<div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(latestBatch.validationErrors.join('；'))}</div>` : ''}
                        <div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(latestBatch.summary || '暂无批次摘要')}</div>
                    ` : '<div class="stx-memory-workbench__empty">还没有生成批次摘要。</div>'}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">整合预览</div>
                    ${state.takeoverProgressLoading && !consolidation ? '<div class="stx-memory-workbench__empty">正在加载整合结果...</div>' : consolidation ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>长期事实</span><strong>${escapeHtml(String(consolidation.longTermFacts.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>关系状态</span><strong>${escapeHtml(String(consolidation.relationState.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>任务状态</span><strong>${escapeHtml(String(consolidation.taskState.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>世界状态</span><strong>${escapeHtml(String(Object.keys(consolidation.worldState ?? {}).length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>章节索引</span><strong>${escapeHtml(String(consolidation.chapterDigestIndex.length))}</strong></div>
                        </div>
                    ` : '<div class="stx-memory-workbench__empty">最终整合结果尚未生成。</div>'}
                </div>

                ${buildTakeoverApplyDiagnosticsMarkup(consolidation)}

                ${buildTakeoverPipelineDiagnosticsMarkup(consolidation)}

                ${buildTakeoverConflictResolutionMarkup(consolidation)}
            </div>
        </section>
    `;
}

/**
 * 功能：渲染接管统一落盘诊断。
 * @param consolidation 接管整合结果
 * @returns HTML 片段
 */
function buildTakeoverApplyDiagnosticsMarkup(
    consolidation: MemoryTakeoverConsolidationResult | null,
): string {
    const diagnostics = consolidation?.applyDiagnostics;
    if (!diagnostics) {
        return `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('apply_diagnostics'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_apply_diagnostics'))}</div>
            </div>
        `;
    }
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('apply_diagnostics'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('mutation_source'))}</span><strong>${escapeHtml('旧聊天接管')}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('total_mutations'))}</span><strong>${escapeHtml(String(diagnostics.counts.input ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('noop_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.noop ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('add_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.add ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('update_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.update ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('merge_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.merge ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('invalidate_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.invalidate ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('delete_count'))}</span><strong>${escapeHtml(String(diagnostics.counts.delete ?? 0))}</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染接管冲突裁决统计摘要。
 * @param consolidation 接管整合结果
 * @returns HTML 片段
 */
function buildTakeoverPipelineDiagnosticsMarkup(
    consolidation: MemoryTakeoverConsolidationResult | null,
): string {
    const diagnostics = consolidation?.pipelineDiagnostics;
    if (!diagnostics) {
        return '';
    }
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('conflict_resolution'))}</div>
            <div class="stx-memory-workbench__info-list">
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('conflict_bucket_count'))}</span><strong>${escapeHtml(String(diagnostics.conflictBucketCount ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('rule_resolved_count'))}</span><strong>${escapeHtml(String(diagnostics.ruleResolvedConflictCount ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('llm_resolved_count'))}</span><strong>${escapeHtml(String(diagnostics.llmResolvedConflictCount ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('batched_request_count'))}</span><strong>${escapeHtml(String(diagnostics.batchedRequestCount ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('avg_buckets_per_request'))}</span><strong>${escapeHtml(String(diagnostics.avgBucketsPerRequest ?? 0))}</strong></div>
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('skipped_by_rule_count'))}</span><strong>${escapeHtml(String(diagnostics.skippedByRuleCount ?? 0))}</strong></div>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染接管冲突裁决详情。
 * @param consolidation 接管整合结果
 * @returns HTML 片段
 */
function buildTakeoverConflictResolutionMarkup(
    consolidation: MemoryTakeoverConsolidationResult | null,
): string {
    const conflictResolutions = consolidation?.conflictResolutions ?? [];
    if (conflictResolutions.length <= 0) {
        return `
            <div class="stx-memory-workbench__card">
                <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('conflict_resolution'))}</div>
                <div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_conflict_resolution'))}</div>
            </div>
        `;
    }
    return `
        <div class="stx-memory-workbench__card">
            <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('conflict_resolution'))}</div>
            <div class="stx-memory-workbench__stack" style="max-height: 460px; overflow-y: auto; padding-right: 4px;">
                ${conflictResolutions.slice(0, 8).map((patch) => `
                    <article class="stx-memory-workbench__card">
                        <div class="stx-memory-workbench__split-head">
                            <div class="stx-memory-workbench__panel-title">${escapeHtml(`${patch.domain} / ${patch.bucketId}`)}</div>
                            <span class="stx-memory-workbench__badge">${escapeHtml(String(patch.resolutions.length))} 条</span>
                        </div>
                        <div class="stx-memory-workbench__stack">
                            ${patch.resolutions.map((resolution) => `
                                <div class="stx-memory-workbench__card">
                                    <div class="stx-memory-workbench__info-list">
                                        <div class="stx-memory-workbench__info-row"><span>动作</span><strong>${escapeHtml(String(resolution.action ?? '').trim() || 'unknown')}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('selected_primary'))}</span><strong>${escapeHtml(String(resolution.selectedPrimaryKey ?? resolution.primaryKey ?? '').trim() || '暂无')}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('selection_reason'))}</span><strong>${escapeHtml(String(resolution.selectionReason ?? '').trim() || '暂无')}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('applied_fields'))}</span><strong>${escapeHtml((resolution.appliedFieldNames ?? []).join('、') || '无')}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('resolver_source'))}</span><strong>${escapeHtml(resolveTakeoverWorkbenchText(String(resolution.resolverSource ?? 'deterministic_fallback').trim()))}</strong></div>
                                    </div>
                                    <details class="stx-memory-workbench__details">
                                        <summary>${escapeHtml(resolveTakeoverWorkbenchText('selected_snapshot'))}</summary>
                                        <pre>${escapeHtml(JSON.stringify(resolution.selectedSnapshot ?? {}, null, 2))}</pre>
                                    </details>
                                </div>
                            `).join('')}
                        </div>
                    </article>
                `).join('')}
            </div>
        </div>
    `;
}
