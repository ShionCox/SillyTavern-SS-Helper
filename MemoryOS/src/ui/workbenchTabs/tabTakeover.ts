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
import { sanitizeWorkbenchDisplayText } from './shared/workbench-text';
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
                <div class="stx-memory-workbench__section-title">${escapeHtml(resolveTakeoverWorkbenchText('section_title'))}</div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <select class="stx-memory-workbench__select" id="stx-memory-takeover-mode" style="width: 160px;">
                        <option value="full"${state.takeoverMode === 'full' ? ' selected' : ''}>${escapeHtml(resolveTakeoverWorkbenchText('mode_full'))}</option>
                        <option value="recent"${state.takeoverMode === 'recent' ? ' selected' : ''}>${escapeHtml(resolveTakeoverWorkbenchText('mode_recent'))}</option>
                        <option value="custom_range"${state.takeoverMode === 'custom_range' ? ' selected' : ''}>${escapeHtml(resolveTakeoverWorkbenchText('mode_custom_range'))}</option>
                    </select>
                    ${visibility.showRecentFloors ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-recent-floors" type="number" min="1" placeholder="${escapeAttr(resolveTakeoverWorkbenchText('recent_floors'))}" value="${escapeAttr(state.takeoverRecentFloors)}" style="width: 120px;">
                    ` : ''}
                    ${visibility.showCustomRange ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-range-start" type="number" min="1" placeholder="${escapeAttr(resolveTakeoverWorkbenchText('range_start'))}" value="${escapeAttr(state.takeoverRangeStart)}" style="width: 110px;">
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-range-end" type="number" min="1" placeholder="${escapeAttr(resolveTakeoverWorkbenchText('range_end'))}" value="${escapeAttr(state.takeoverRangeEnd)}" style="width: 110px;">
                    ` : ''}
                    <input class="stx-memory-workbench__input" id="stx-memory-takeover-batch-size" type="number" min="1" placeholder="${escapeAttr(resolveTakeoverWorkbenchText('batch_size'))}" value="${escapeAttr(state.takeoverBatchSize)}" style="width: 120px;">
                    <div class="stx-memory-workbench__checkbox-row">
                        ${buildSharedBoxCheckbox({
                            id: 'stx-memory-takeover-use-active-snapshot',
                            appearance: 'check',
                            inputAttributes: {
                                checked: state.takeoverUseActiveSnapshot,
                            },
                        })}
                        <label for="stx-memory-takeover-use-active-snapshot">${escapeHtml(resolveTakeoverWorkbenchText('use_active_snapshot'))}</label>
                    </div>
                    ${state.takeoverUseActiveSnapshot ? `
                        <input class="stx-memory-workbench__input" id="stx-memory-takeover-active-snapshot-floors" type="number" min="1" placeholder="${escapeAttr(resolveTakeoverWorkbenchText('active_snapshot_floors'))}" value="${escapeAttr(state.takeoverActiveSnapshotFloors)}" style="width: 120px;">
                    ` : ''}
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-preview-calc"${state.takeoverPreviewLoading ? ' disabled' : ''}>
                        <i class="fa-solid fa-calculator"></i> ${escapeHtml(state.takeoverPreviewLoading ? resolveTakeoverWorkbenchText('calculating') : resolveTakeoverWorkbenchText('calculate_estimate'))}
                    </button>
                    <button id="stx-memory-takeover-start-button" class="stx-memory-workbench__button" data-action="takeover-start"${state.takeoverPreviewLoading ? ' disabled' : ''}>
                        <i class="fa-solid fa-play"></i> ${escapeHtml(resolveTakeoverWorkbenchText('start_takeover'))}
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-pause">
                        <i class="fa-solid fa-pause"></i> ${escapeHtml(resolveTakeoverWorkbenchText('pause'))}
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-resume">
                        <i class="fa-solid fa-forward"></i> ${escapeHtml(resolveTakeoverWorkbenchText('resume'))}
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-consolidate">
                        <i class="fa-solid fa-layer-group"></i> ${escapeHtml(resolveTakeoverWorkbenchText('consolidate_now'))}
                    </button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="takeover-abort" style="border-color:rgba(239,68,68,0.35); color:var(--mw-warn);">
                        <i class="fa-solid fa-stop"></i> ${escapeHtml(resolveTakeoverWorkbenchText('abort'))}
                    </button>
                </div>
            </div>

            <div class="stx-memory-workbench__card">
                <details class="stx-memory-workbench__details"${state.takeoverPreviewExpanded ? ' open' : ''}>
                    <summary>${escapeHtml(resolveTakeoverWorkbenchText('batch_token_estimate'))}</summary>
                    <div id="stx-memory-takeover-preview-panel">${buildTakeoverPreviewMarkup({
                        estimate: state.takeoverPreview,
                        loading: state.takeoverPreviewLoading,
                        emptyText: resolveTakeoverWorkbenchText('batch_token_estimate_empty'),
                    })}</div>
                </details>
            </div>

            <div class="stx-memory-workbench__diagnostics">
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('task_status'))}</div>
                    ${state.takeoverProgressLoading && !plan ? `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('loading_progress'))}</div>` : plan ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('status'))}</span><strong>${escapeHtml(plan.status)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('mode'))}</span><strong>${escapeHtml(plan.mode)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('floor_range'))}</span><strong>${escapeHtml(`${plan.range.startFloor} - ${plan.range.endFloor}`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('total_batches'))}</span><strong>${escapeHtml(String(totalCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('completed_batches'))}</span><strong>${escapeHtml(String(completedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('failed_batches'))}</span><strong>${escapeHtml(String(failedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('isolated_batches'))}</span><strong>${escapeHtml(String(isolatedCount))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('progress'))}</span><strong>${escapeHtml(`${progressPercent}%`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('last_checkpoint'))}</span><strong>${escapeHtml(formatTimestamp(plan.lastCheckpointAt))}</strong></div>
                            ${plan.lastError ? `<div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('last_error'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(plan.lastError))}</strong></div>` : ''}
                        </div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_task'))}</div>`}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('current_batch'))}</div>
                    ${state.takeoverProgressLoading && !currentBatch ? `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('loading_current_batch'))}</div>` : currentBatch ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('batch_id'))}</span><strong>${escapeHtml(currentBatch.batchId)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('category'))}</span><strong>${escapeHtml(currentBatch.category)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('range'))}</span><strong>${escapeHtml(`${currentBatch.range.startFloor} - ${currentBatch.range.endFloor}`)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('status'))}</span><strong>${escapeHtml(currentBatch.status)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('admission'))}</span><strong>${escapeHtml(resolveTakeoverWorkbenchText(String(currentBatch.admissionState ?? 'pending').trim()))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('started_at'))}</span><strong>${escapeHtml(formatTimestamp(currentBatch.startedAt))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('finished_at'))}</span><strong>${escapeHtml(formatTimestamp(currentBatch.finishedAt))}</strong></div>
                            ${Array.isArray(currentBatch.validationErrors) && currentBatch.validationErrors.length > 0 ? `<div class="stx-memory-workbench__detail-block">${escapeHtml(sanitizeWorkbenchDisplayText(currentBatch.validationErrors.join('；')))}</div>` : ''}
                            ${currentBatch.error ? `<div class="stx-memory-workbench__detail-block">${escapeHtml(sanitizeWorkbenchDisplayText(currentBatch.error))}</div>` : ''}
                        </div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_current_batch'))}</div>`}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('active_snapshot'))}</div>
                    ${state.takeoverProgressLoading && !activeSnapshot ? `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('loading_active_snapshot'))}</div>` : activeSnapshot ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('current_scene'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.currentScene, resolveTakeoverWorkbenchText('none')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('current_location'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.currentLocation, resolveTakeoverWorkbenchText('none')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('time_hint'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.currentTimeHint, resolveTakeoverWorkbenchText('none')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('active_goals'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.activeGoals.join('、'), resolveTakeoverWorkbenchText('none')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('open_threads'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.openThreads.join('、'), resolveTakeoverWorkbenchText('none')))}</strong></div>
                        </div>
                        <div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(sanitizeWorkbenchDisplayText(activeSnapshot.recentDigest, resolveTakeoverWorkbenchText('no_recent_digest')))}</div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_active_snapshot'))}</div>`}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('latest_batch_summary'))}</div>
                    ${state.takeoverProgressLoading && !latestBatch ? `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('loading_latest_batch'))}</div>` : latestBatch ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('batch'))}</span><strong>${escapeHtml(latestBatch.batchId)}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('admission_result'))}</span><strong>${escapeHtml(latestBatch.isolated ? resolveTakeoverWorkbenchText('isolated') : (latestBatch.repairedOnce ? resolveTakeoverWorkbenchText('repaired') : (latestBatch.validated ? resolveTakeoverWorkbenchText('validated') : resolveTakeoverWorkbenchText('pending'))))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('chapter_tags'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(latestBatch.chapterTags.join('、'), resolveTakeoverWorkbenchText('none')))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('open_clues'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(latestBatch.openThreads.join('、'), resolveTakeoverWorkbenchText('none')))}</strong></div>
                        </div>
                        ${Array.isArray(latestBatch.validationErrors) && latestBatch.validationErrors.length > 0 ? `<div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(sanitizeWorkbenchDisplayText(latestBatch.validationErrors.join('；')))}</div>` : ''}
                        <div class="stx-memory-workbench__detail-block" style="margin-top:12px;">${escapeHtml(sanitizeWorkbenchDisplayText(latestBatch.summary, resolveTakeoverWorkbenchText('latest_batch_empty')))}</div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_latest_batch'))}</div>`}
                </div>

                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveTakeoverWorkbenchText('consolidation_preview'))}</div>
                    ${state.takeoverProgressLoading && !consolidation ? `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('loading_consolidation'))}</div>` : consolidation ? `
                        <div class="stx-memory-workbench__info-list">
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('long_term_facts'))}</span><strong>${escapeHtml(String(consolidation.longTermFacts.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('relation_state'))}</span><strong>${escapeHtml(String(consolidation.relationState.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('task_state'))}</span><strong>${escapeHtml(String(consolidation.taskState.length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('world_state'))}</span><strong>${escapeHtml(String(Object.keys(consolidation.worldState ?? {}).length))}</strong></div>
                            <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('chapter_index'))}</span><strong>${escapeHtml(String(consolidation.chapterDigestIndex.length))}</strong></div>
                        </div>
                    ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveTakeoverWorkbenchText('no_consolidation'))}</div>`}
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
                <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('mutation_source'))}</span><strong>${escapeHtml(resolveTakeoverWorkbenchText('old_chat_takeover'))}</strong></div>
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
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('action'))}</span><strong>${escapeHtml(String(resolution.action ?? '').trim() || resolveTakeoverWorkbenchText('unknown'))}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('selected_primary'))}</span><strong>${escapeHtml(String(resolution.selectedPrimaryKey ?? resolution.primaryKey ?? '').trim() || resolveTakeoverWorkbenchText('none'))}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('selection_reason'))}</span><strong>${escapeHtml(sanitizeWorkbenchDisplayText(String(resolution.selectionReason ?? '').trim(), resolveTakeoverWorkbenchText('none')))}</strong></div>
                                        <div class="stx-memory-workbench__info-row"><span>${escapeHtml(resolveTakeoverWorkbenchText('applied_fields'))}</span><strong>${escapeHtml((resolution.appliedFieldNames ?? []).join('、') || resolveTakeoverWorkbenchText('none'))}</strong></div>
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
