import { escapeHtml } from '../editorShared';
import { resolveRetrievalProviderLabel, resolveVectorWorkbenchText } from '../workbenchLocale';
import {
    escapeAttr,
    formatDisplayValue,
    formatTimestamp,
    truncateText,
    type WorkbenchSnapshot,
    type WorkbenchState,
} from './shared';
import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';

/**
 * 功能：构建向量实验室视图。
 * @param snapshot 工作台快照。
 * @param state 当前状态。
 * @returns 页面 HTML。
 */
export function buildVectorsViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const vectorSnapshot = snapshot.vectorSnapshot;
    if (!vectorSnapshot.loaded) {
        return `
            <section class="stx-memory-workbench__view"${state.currentView !== 'vectors' ? ' hidden' : ''}>
                <div class="stx-memory-workbench__view-head stx-vector-lab__hero">
                    <div class="stx-vector-lab__hero-copy">
                        <div class="stx-memory-workbench__section-title">${escapeHtml(resolveVectorWorkbenchText('section_title'))}</div>
                        <div class="stx-vector-lab__hero-subtitle">${escapeHtml(resolveVectorWorkbenchText('hero_subtitle'))}</div>
                    </div>
                </div>
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__empty">${escapeHtml(state.vectorTabLoading ? resolveVectorWorkbenchText('loading_placeholder') : resolveVectorWorkbenchText('lazy_placeholder'))}</div>
                </div>
            </section>
        `;
    }
    const sourceKindOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.map((doc) => doc.sourceKind)))],
        state.vectorSourceKindFilter,
        (value: string): string => value === 'all' ? resolveVectorWorkbenchText('all_sources') : resolveSourceKindLabel(value),
    );
    const statusOptions = buildSelectOptions(
        ['all', 'ready', 'pending', 'failed'],
        state.vectorStatusFilter,
        (value: string): string => value === 'all' ? resolveVectorWorkbenchText('all_statuses') : resolveStatusLabel(value),
    );
    const schemaOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.map((doc) => String(doc.schemaId ?? '').trim()).filter(Boolean)))],
        state.vectorSchemaFilter,
        (value: string): string => value === 'all' ? resolveVectorWorkbenchText('all_schemas') : value,
    );
    const actorOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.flatMap((doc) => doc.actorKeys ?? []).filter(Boolean)))],
        state.vectorActorFilter,
        (value: string): string => value === 'all' ? resolveVectorWorkbenchText('all_actors') : value,
    );
    const filteredDocuments = vectorSnapshot.documents.filter((doc) => {
        if (state.vectorSourceKindFilter && state.vectorSourceKindFilter !== 'all' && doc.sourceKind !== state.vectorSourceKindFilter) {
            return false;
        }
        if (state.vectorStatusFilter && state.vectorStatusFilter !== 'all' && doc.embeddingStatus !== state.vectorStatusFilter) {
            return false;
        }
        if (state.vectorSchemaFilter && state.vectorSchemaFilter !== 'all' && String(doc.schemaId ?? '').trim() !== state.vectorSchemaFilter) {
            return false;
        }
        if (state.vectorActorFilter && state.vectorActorFilter !== 'all' && !(doc.actorKeys ?? []).includes(state.vectorActorFilter)) {
            return false;
        }
        const query = String(state.vectorTextFilter ?? '').trim().toLowerCase();
        if (!query) {
            return true;
        }
        return [
            doc.vectorDocId,
            doc.sourceId,
            doc.title,
            doc.text,
            doc.compareKey,
            ...(doc.actorKeys ?? []),
            ...(doc.worldKeys ?? []),
        ].join(' ').toLowerCase().includes(query);
    });
    const selectedDoc = filteredDocuments.find((doc) => doc.vectorDocId === state.vectorSelectedDocId)
        ?? vectorSnapshot.documents.find((doc) => doc.vectorDocId === state.vectorSelectedDocId)
        ?? filteredDocuments[0]
        ?? null;
    const recallStat = selectedDoc
        ? vectorSnapshot.recallStats.find((item) => item.vectorDocId === selectedDoc.vectorDocId) ?? null
        : null;
    const hasIndex = selectedDoc
        ? vectorSnapshot.indexRecords.some((item) => item.vectorDocId === selectedDoc.vectorDocId)
        : false;
    const testResult = state.vectorTestResult;
    const testProgress = state.vectorTestProgress;

    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'vectors' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head stx-vector-lab__hero">
                <div class="stx-vector-lab__hero-copy">
                    <div class="stx-memory-workbench__section-title">${escapeHtml(resolveVectorWorkbenchText('section_title'))}</div>
                    <div class="stx-vector-lab__hero-subtitle">${escapeHtml(resolveVectorWorkbenchText('hero_subtitle'))}</div>
                </div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-refresh"><i class="fa-solid fa-rotate"></i> ${escapeHtml(resolveVectorWorkbenchText('refresh'))}</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-rebuild-documents"><i class="fa-solid fa-layer-group"></i> ${escapeHtml(resolveVectorWorkbenchText('rebuild_documents'))}</button>
                    <button class="stx-memory-workbench__button" data-action="vector-rebuild-embeddings"><i class="fa-solid fa-wave-square"></i> ${escapeHtml(resolveVectorWorkbenchText('rebuild_embeddings'))}</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-clear-data" style="border-color:rgba(239,68,68,0.42); color:var(--mw-warn);">
                        <i class="fa-solid fa-trash-can"></i> ${escapeHtml(resolveVectorWorkbenchText('clear_vector_data'))}
                    </button>
                </div>
            </div>

            <div class="stx-vector-lab__overview">
                ${buildOverviewCard(resolveVectorWorkbenchText('runtime'), vectorSnapshot.runtimeReady ? resolveVectorWorkbenchText('runtime_ready') : resolveVectorWorkbenchText('runtime_not_ready'), vectorSnapshot.runtimeReady ? resolveVectorWorkbenchText('runtime_ready_detail') : resolveVectorWorkbenchText('runtime_not_ready_detail'), vectorSnapshot.runtimeReady ? 'ok' : 'warn')}
                ${buildOverviewCard(resolveVectorWorkbenchText('embedding'), vectorSnapshot.embeddingAvailable ? resolveVectorWorkbenchText('available') : resolveVectorWorkbenchText('unavailable'), vectorSnapshot.embeddingAvailable ? (vectorSnapshot.embeddingModel || resolveVectorWorkbenchText('embedding_connected')) : (vectorSnapshot.embeddingUnavailableReason || resolveVectorWorkbenchText('embedding_unavailable')), vectorSnapshot.embeddingAvailable ? 'ok' : 'warn')}
                ${buildOverviewCard(resolveVectorWorkbenchText('store'), vectorSnapshot.vectorStoreAvailable ? resolveVectorWorkbenchText('available') : resolveVectorWorkbenchText('unavailable'), vectorSnapshot.vectorStoreAvailable ? resolveVectorWorkbenchText('store_ready_detail') : (vectorSnapshot.vectorStoreUnavailableReason || resolveVectorWorkbenchText('store_unavailable')), vectorSnapshot.vectorStoreAvailable ? 'ok' : 'warn')}
                ${buildOverviewCard(resolveVectorWorkbenchText('current_mode'), resolveModeLabel(vectorSnapshot.retrievalMode), `${resolveVectorWorkbenchText('strategy_route')} ${vectorSnapshot.vectorEnableStrategyRouting ? resolveVectorWorkbenchText('strategy_route_on') : resolveVectorWorkbenchText('strategy_route_off')} / ${resolveVectorWorkbenchText('rerank_used')} ${vectorSnapshot.vectorEnableRerank ? resolveVectorWorkbenchText('rerank_on') : resolveVectorWorkbenchText('rerank_off')}`, 'accent')}
                ${buildOverviewCard(resolveVectorWorkbenchText('document_count'), String(vectorSnapshot.documentCount), `${resolveVectorWorkbenchText('ready_count')} ${vectorSnapshot.readyCount} / ${resolveVectorWorkbenchText('pending_count')} ${vectorSnapshot.pendingCount} / ${resolveVectorWorkbenchText('failed_count')} ${vectorSnapshot.failedCount}`, 'accent')}
                ${buildOverviewCard(resolveVectorWorkbenchText('index_count'), String(vectorSnapshot.indexCount), `${resolveVectorWorkbenchText('recall_stat_count')} ${vectorSnapshot.recallStatCount} ${resolveVectorWorkbenchText('item_count_unit')}`, 'accent')}
            </div>

            <div class="stx-vector-lab__layout">
                <aside class="stx-vector-lab__rail">
                    <div class="stx-memory-workbench__card stx-vector-lab__panel">
                        <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveVectorWorkbenchText('vector_documents'))}</div>
                        <div class="stx-vector-lab__panel-body">
                            <div class="stx-vector-lab__filters">
                                <input id="stx-vector-text-filter" class="stx-memory-workbench__input" placeholder="${escapeAttr(resolveVectorWorkbenchText('search_doc_placeholder'))}" value="${escapeAttr(state.vectorTextFilter)}">
                                <div class="stx-vector-lab__filter-grid">
                                    <select id="stx-vector-source-filter" class="stx-memory-workbench__select">${sourceKindOptions}</select>
                                    <select id="stx-vector-status-filter" class="stx-memory-workbench__select">${statusOptions}</select>
                                    <select id="stx-vector-schema-filter" class="stx-memory-workbench__select">${schemaOptions}</select>
                                    <select id="stx-vector-actor-filter" class="stx-memory-workbench__select">${actorOptions}</select>
                                </div>
                            </div>
                            <div class="stx-vector-lab__doc-list" data-vector-doc-list-scroll="true">
                                ${filteredDocuments.map((doc) => `
                                    <button class="stx-vector-lab__doc-item${selectedDoc?.vectorDocId === doc.vectorDocId ? ' is-active' : ''}" data-select-vector-doc="${escapeAttr(doc.vectorDocId)}">
                                        <div class="stx-vector-lab__doc-head">
                                            <strong>${escapeHtml(truncateText(doc.title || doc.vectorDocId, 28) || doc.vectorDocId)}</strong>
                                            <span class="stx-vector-lab__status is-${escapeAttr(doc.embeddingStatus)}">${escapeHtml(resolveStatusLabel(doc.embeddingStatus))}</span>
                                        </div>
                                        <div class="stx-vector-lab__doc-meta">${escapeHtml(resolveSourceKindLabel(doc.sourceKind))} / ${escapeHtml(doc.sourceId)}</div>
                                        <div class="stx-vector-lab__doc-meta">${escapeHtml(truncateText(doc.compareKey || resolveVectorWorkbenchText('empty_value'), 42) || resolveVectorWorkbenchText('empty_value'))}</div>
                                        <div class="stx-vector-lab__doc-foot">
                                            <span>${escapeHtml(String(doc.embeddingDim ?? 0))} ${escapeHtml(resolveVectorWorkbenchText('dimension'))}</span>
                                            <span>${escapeHtml(formatTimestamp(doc.updatedAt))}</span>
                                        </div>
                                    </button>
                                `).join('') || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('no_filtered_documents'))}</div>`}
                            </div>
                        </div>
                    </div>
                </aside>

                <div class="stx-vector-lab__content">
                    <div class="stx-memory-workbench__card stx-vector-lab__panel stx-vector-lab__panel--tabs">
                        <div class="stx-vector-lab__tabbar">
                            <button
                                class="stx-vector-lab__tab${state.vectorRightTab === 'detail' ? ' is-active' : ''}"
                                data-vector-right-tab="detail"
                                type="button"
                            >
                                ${escapeHtml(resolveVectorWorkbenchText('document_detail'))}
                            </button>
                            <button
                                class="stx-vector-lab__tab${state.vectorRightTab === 'test' ? ' is-active' : ''}"
                                data-vector-right-tab="test"
                                type="button"
                            >
                                ${escapeHtml(resolveVectorWorkbenchText('retrieval_testbench'))}
                            </button>
                        </div>
                        <div class="stx-vector-lab__tabpanel"${state.vectorRightTab !== 'detail' ? ' hidden' : ''}>
                            <div class="stx-vector-lab__detail-head">
                                <div>
                                    <div class="stx-memory-workbench__panel-title">${escapeHtml(resolveVectorWorkbenchText('document_detail'))}</div>
                                    <div class="stx-vector-lab__detail-subtitle">${selectedDoc ? escapeHtml(selectedDoc.vectorDocId) : escapeHtml(resolveVectorWorkbenchText('select_document_hint'))}</div>
                                </div>
                                ${selectedDoc ? `
                                    <div class="stx-memory-workbench__toolbar">
                                        <button class="stx-memory-workbench__ghost-btn" data-action="vector-reindex-doc" data-vector-doc-id="${escapeAttr(selectedDoc.vectorDocId)}">${escapeHtml(resolveVectorWorkbenchText('reindex_document'))}</button>
                                        <button class="stx-memory-workbench__ghost-btn" data-action="vector-remove-doc" data-vector-doc-id="${escapeAttr(selectedDoc.vectorDocId)}" style="border-color:rgba(239,68,68,0.42); color:var(--mw-warn);">${escapeHtml(resolveVectorWorkbenchText('remove_document'))}</button>
                                    </div>
                                ` : ''}
                            </div>
                            <div class="stx-vector-lab__panel-body stx-vector-lab__panel-body--scroll">
                                ${selectedDoc ? `
                                    <div class="stx-vector-lab__detail-grid">
                                        <div class="stx-vector-lab__detail-card">
                                            <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('basic_info'))}</div>
                                            ${buildInfoRow(resolveVectorWorkbenchText('source_type'), resolveSourceKindLabel(selectedDoc.sourceKind))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('source_id'), selectedDoc.sourceId)}
                                            ${buildInfoRow(resolveVectorWorkbenchText('schema_id'), selectedDoc.schemaId || resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('compare_key'), selectedDoc.compareKey || resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('updated_at'), formatTimestamp(selectedDoc.updatedAt))}
                                        </div>
                                        <div class="stx-vector-lab__detail-card">
                                            <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('vector_status'))}</div>
                                            ${buildInfoRow(resolveVectorWorkbenchText('embedding_status'), resolveStatusLabel(selectedDoc.embeddingStatus))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('model'), selectedDoc.embeddingModel || resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('version'), selectedDoc.embeddingVersion || resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('dimension'), String(selectedDoc.embeddingDim ?? 0))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('index_written'), hasIndex ? resolveVectorWorkbenchText('indexed') : resolveVectorWorkbenchText('not_indexed'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('recent_recall'), recallStat ? `${recallStat.recallCount} ${resolveVectorWorkbenchText('recall_count_suffix')}` : resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('recent_mode'), recallStat?.lastRecallMode || resolveVectorWorkbenchText('empty_value'))}
                                            ${buildInfoRow(resolveVectorWorkbenchText('recent_time'), formatTimestamp(recallStat?.lastRecalledAt))}
                                            ${selectedDoc.lastError ? buildInfoRow(resolveVectorWorkbenchText('error_message'), selectedDoc.lastError) : ''}
                                        </div>
                                    </div>
                                    <div class="stx-vector-lab__detail-grid">
                                        <div class="stx-vector-lab__detail-card">
                                            <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('structure_tags'))}</div>
                                            ${buildTagBlock(resolveVectorWorkbenchText('source_actor'), selectedDoc.actorKeys)}
                                            ${buildTagBlock(resolveVectorWorkbenchText('source_relationship'), selectedDoc.relationKeys)}
                                            ${buildTagBlock(resolveVectorWorkbenchText('world_tag'), selectedDoc.worldKeys)}
                                            ${buildTagBlock(resolveVectorWorkbenchText('location_tag'), selectedDoc.locationKey ? [selectedDoc.locationKey] : [])}
                                        </div>
                                        <div class="stx-vector-lab__detail-card">
                                            <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('text_content'))}</div>
                                            <div class="stx-vector-lab__detail-text">
                                                <strong>${escapeHtml(selectedDoc.title || resolveVectorWorkbenchText('untitled_document'))}</strong>
                                                <div>${escapeHtml(selectedDoc.text || resolveVectorWorkbenchText('no_text_content'))}</div>
                                            </div>
                                        </div>
                                    </div>
                                ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('select_document_empty'))}</div>`}
                            </div>
                        </div>
                        <div class="stx-vector-lab__tabpanel"${state.vectorRightTab !== 'test' ? ' hidden' : ''}>
                            <div class="stx-vector-lab__panel-body">
                            <div class="stx-vector-lab__testbench">
                                <section class="stx-vector-lab__testbench-controls">
                                    <div class="stx-vector-lab__control-card stx-vector-lab__control-card--query">
                                        <div class="stx-vector-lab__control-head">
                                            <div class="stx-vector-lab__control-title">${escapeHtml(resolveVectorWorkbenchText('test_query_card'))}</div>
                                            <button class="stx-memory-workbench__button stx-vector-lab__run-btn" data-action="vector-run-test"${state.vectorTestRunning ? ' disabled' : ''}>
                                                <i class="fa-solid fa-play"></i> ${escapeHtml(state.vectorTestRunning ? resolveVectorWorkbenchText('testing') : resolveVectorWorkbenchText('start_test'))}
                                            </button>
                                        </div>
                                        <textarea id="stx-vector-query" class="stx-memory-workbench__textarea" placeholder="${escapeAttr(resolveVectorWorkbenchText('query_placeholder'))}">${escapeHtml(state.vectorQuery)}</textarea>
                                        <div class="stx-vector-lab__test-controls">
                                            <select id="stx-vector-mode" class="stx-memory-workbench__select">
                                                <option value="lexical_only"${state.vectorMode === 'lexical_only' ? ' selected' : ''}>${escapeHtml(resolveVectorWorkbenchText('lexical_only'))}</option>
                                                <option value="vector_only"${state.vectorMode === 'vector_only' ? ' selected' : ''}>${escapeHtml(resolveVectorWorkbenchText('vector_only'))}</option>
                                                <option value="hybrid"${state.vectorMode === 'hybrid' ? ' selected' : ''}>${escapeHtml(resolveVectorWorkbenchText('hybrid_mode'))}</option>
                                            </select>
                                            <input id="stx-vector-topk" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorTopKTest)}" placeholder="${escapeAttr(resolveVectorWorkbenchText('topk_placeholder'))}">
                                            <input id="stx-vector-deep-window" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorDeepWindowTest)}" placeholder="${escapeAttr(resolveVectorWorkbenchText('deep_window_placeholder'))}">
                                            <input id="stx-vector-final-topk" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorFinalTopKTest)}" placeholder="${escapeAttr(resolveVectorWorkbenchText('final_topk_placeholder'))}">
                                        </div>
                                    </div>

                                    <div class="stx-vector-lab__control-card">
                                        <div class="stx-vector-lab__control-title">${escapeHtml(resolveVectorWorkbenchText('test_switch_card'))}</div>
                                        <div class="stx-vector-lab__switches stx-vector-lab__switches--compact">
                                            ${buildSwitch('stx-vector-enable-routing', resolveVectorWorkbenchText('enable_strategy_routing'), state.vectorEnableStrategyRoutingTest)}
                                            ${buildSwitch('stx-vector-enable-rerank', resolveVectorWorkbenchText('enable_rule_rerank'), state.vectorEnableRerankTest)}
                                            ${buildSwitch('stx-vector-enable-llmhub-rerank', resolveVectorWorkbenchText('enable_llmhub_rerank'), state.vectorEnableLLMHubRerankTest)}
                                            ${buildSwitch('stx-vector-enable-graph-expansion', resolveVectorWorkbenchText('enable_graph_expansion'), state.vectorEnableGraphExpansionTest)}
                                        </div>
                                    </div>

                                    <div class="stx-vector-lab__control-card">
                                        <div class="stx-vector-lab__control-title">${escapeHtml(resolveVectorWorkbenchText('test_snapshot_card'))}</div>
                                        ${testResult ? `
                                            <div class="stx-vector-lab__snapshot-list">
                                                ${buildCompactInfoRow(resolveVectorWorkbenchText('generated_at'), formatTimestamp(testResult.generatedAt))}
                                                ${buildCompactInfoRow(resolveVectorWorkbenchText('current_mode'), resolveModeLabel(testResult.retrievalMode))}
                                                ${buildCompactInfoRow(resolveVectorWorkbenchText('final_provider'), resolveRetrievalProviderLabel(testResult.providerId))}
                                                ${buildCompactInfoRow(resolveVectorWorkbenchText('result_count'), String(testResult.items.length))}
                                            </div>
                                        ` : `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('test_snapshot_empty'))}</div>`}
                                    </div>
                                </section>

                                <section class="stx-vector-lab__testbench-stage">
                                    ${state.vectorTestRunning || testProgress ? `
                                        <div class="stx-vector-lab__progress-card stx-vector-lab__progress-card--hero${state.vectorTestRunning ? ' is-running' : ''}${testProgress?.stage === 'failed' ? ' is-failed' : ''}">
                                            <div class="stx-vector-lab__progress-head">
                                                <span>${escapeHtml(resolveVectorWorkbenchText('current_step'))}</span>
                                                <strong>${escapeHtml(testProgress?.title || (state.vectorTestRunning ? resolveVectorWorkbenchText('test_running') : resolveVectorWorkbenchText('latest_step')))}</strong>
                                            </div>
                                            <div class="stx-vector-lab__progress-message">${escapeHtml(testProgress?.message || resolveVectorWorkbenchText('test_running_message'))}</div>
                                            ${typeof testProgress?.progress === 'number' ? `
                                                <div class="stx-vector-lab__progress-bar">
                                                    <span style="width:${escapeAttr(String(Math.max(0, Math.min(100, Math.round(testProgress.progress * 100)))))}%"></span>
                                                </div>
                                            ` : ''}
                                        </div>
                                    ` : ''}
                                    ${testResult ? `
                                        <div class="stx-vector-lab__result-block stx-vector-lab__result-block--overview">
                                            <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('result_overview'))}</div>
                                            <div class="stx-vector-lab__compact-metrics-scroll">
                                                <div class="stx-vector-lab__compact-metrics">
                                                    ${buildMetricChip(resolveVectorWorkbenchText('final_provider'), resolveRetrievalProviderLabel(testResult.diagnostics.finalProviderId || testResult.providerId))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('seed_provider'), resolveRetrievalProviderLabel(testResult.diagnostics.seedProviderId || 'none'))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('strategy_route'), resolveStrategyRouteLabel(testResult.diagnostics.strategyDecision?.route))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('vector_hit_count'), String(testResult.diagnostics.vectorHitCount ?? 0))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('merge_used'), testResult.diagnostics.mergeUsed ? resolveVectorWorkbenchText('yes') : resolveVectorWorkbenchText('no'))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('rerank_used'), testResult.diagnostics.rerankUsed ? resolveVectorWorkbenchText('yes') : resolveVectorWorkbenchText('no'))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('rerank_source'), resolveRerankSourceLabel(testResult.diagnostics.rerankSource))}
                                                    ${buildMetricChip(resolveVectorWorkbenchText('result_count'), String(testResult.items.length))}
                                                </div>
                                            </div>
                                            <div class="stx-vector-lab__reason-row stx-vector-lab__reason-row--panel">
                                                <span>${escapeHtml(resolveVectorWorkbenchText('reason_codes'))}</span>
                                                <strong>${escapeHtml((testResult.diagnostics.rerankReasonCodes ?? []).join('、') || resolveVectorWorkbenchText('empty_value'))}</strong>
                                            </div>
                                        </div>
                                        <div class="stx-vector-lab__testbench-grid">
                                            <div class="stx-vector-lab__result-block">
                                                <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('vector_top_hits'))}</div>
                                                ${buildRankingStageList(
                                                    testResult.diagnostics.vectorTopHits?.map((item) => ({
                                                        rank: item.rank,
                                                        title: item.sourceId,
                                                        score: item.score,
                                                        source: 'vector',
                                                    })) ?? [],
                                                    true,
                                                )}
                                            </div>
                                            <div class="stx-vector-lab__result-block">
                                                <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('merged_ranking'))}</div>
                                                ${buildRankingStageList(testResult.diagnostics.mergedRanking ?? [], true)}
                                            </div>
                                            <div class="stx-vector-lab__result-block">
                                                <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('reranked_ranking'))}</div>
                                                ${buildRankingStageList(testResult.diagnostics.rerankedRanking ?? [], true)}
                                            </div>
                                        </div>
                                        <div class="stx-vector-lab__testbench-grid stx-vector-lab__testbench-grid--wide">
                                            <div class="stx-vector-lab__result-block">
                                                <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('ranking_changes'))}</div>
                                                ${buildRankingChangeList(testResult.diagnostics.rankingChanges ?? [])}
                                            </div>
                                            <div class="stx-vector-lab__result-block">
                                                <div class="stx-vector-lab__detail-title">${escapeHtml(resolveVectorWorkbenchText('final_results'))}</div>
                                                <div class="stx-vector-lab__result-list stx-vector-lab__result-list--final">
                                                    ${testResult.items.map((item, index) => {
                                                        const sourceLabel = testResult.diagnostics.resultSourceLabels.find((label) => label.candidateId === item.candidate.candidateId)?.source ?? 'lexical';
                                                        return `
                                                            <article class="stx-vector-lab__result-item stx-vector-lab__result-item--compact">
                                                                <div class="stx-vector-lab__result-head">
                                                                    <strong>#${index + 1} ${escapeHtml(item.candidate.title || item.candidate.entryId)}</strong>
                                                                    <span>${escapeHtml(resolveResultSourceLabel(sourceLabel))}</span>
                                                                </div>
                                                                <div class="stx-vector-lab__result-meta">${escapeHtml(item.candidate.schemaId)} / ${escapeHtml(item.candidate.entryId)}</div>
                                                                <div class="stx-vector-lab__result-summary">${escapeHtml(truncateText(item.candidate.summary || resolveVectorWorkbenchText('empty_value'), 180) || resolveVectorWorkbenchText('empty_value'))}</div>
                                                                <div class="stx-vector-lab__result-meta">${escapeHtml(resolveVectorWorkbenchText('score_prefix'))} ${escapeHtml(Number(item.score ?? 0).toFixed(4))}</div>
                                                            </article>
                                                        `;
                                                    }).join('') || `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('no_result_hits'))}</div>`}
                                                </div>
                                            </div>
                                        </div>
                                    ` : `<div class="stx-memory-workbench__empty stx-vector-lab__stage-empty">${escapeHtml(resolveVectorWorkbenchText('test_result_empty'))}</div>`}
                                </section>
                            </div>
                        </div>
                        </div>
                    </div>
            </div>
        </section>
    `;
}

/**
 * 功能：渲染单个排序阶段列表。
 * @param items 排序列表。
 * @param compact 是否使用紧凑显示。
 * @returns HTML。
 */
function buildRankingStageList(
    items: Array<{ rank: number; title: string; score: number; source?: string }>,
    compact: boolean = false,
): string {
    if (!Array.isArray(items) || items.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('no_ranking_data'))}</div>`;
    }
    return `
        <div class="stx-vector-lab__result-list"${compact ? ' ' : ''}>
            ${items.map((item) => `
                <article class="stx-vector-lab__result-item">
                    <div class="stx-vector-lab__result-head">
                        <strong>#${escapeHtml(String(item.rank))} ${escapeHtml(truncateText(item.title || resolveVectorWorkbenchText('untitled_candidate'), 26) || resolveVectorWorkbenchText('untitled_candidate'))}</strong>
                        ${item.source ? `<span>${escapeHtml(resolveResultSourceLabel(item.source))}</span>` : ''}
                    </div>
                    <div class="stx-vector-lab__result-meta">${escapeHtml(resolveVectorWorkbenchText('score_prefix'))} ${escapeHtml(Number(item.score ?? 0).toFixed(4))}</div>
                </article>
            `).join('')}
        </div>
    `;
}

/**
 * 功能：渲染排序变化说明列表。
 * @param items 变化列表。
 * @returns HTML。
 */
function buildRankingChangeList(items: Array<{
    title: string;
    source: string;
    lexicalRank?: number;
    mergedRank?: number;
    rerankedRank?: number;
    finalRank?: number;
    changeReason: string;
}>): string {
    if (!Array.isArray(items) || items.length <= 0) {
        return `<div class="stx-memory-workbench__empty">${escapeHtml(resolveVectorWorkbenchText('no_ranking_changes'))}</div>`;
    }
    return `
        <div class="stx-vector-lab__result-list" style="max-height:320px;">
            ${items.map((item) => `
                <article class="stx-vector-lab__result-item">
                    <div class="stx-vector-lab__result-head">
                        <strong>${escapeHtml(truncateText(item.title || resolveVectorWorkbenchText('untitled_candidate'), 30) || resolveVectorWorkbenchText('untitled_candidate'))}</strong>
                        <span>${escapeHtml(resolveResultSourceLabel(item.source))}</span>
                    </div>
                    <div class="stx-vector-lab__result-meta">
                        ${escapeHtml(resolveVectorWorkbenchText('rank_lexical'))} ${escapeHtml(formatRankValue(item.lexicalRank))}
                        / ${escapeHtml(resolveVectorWorkbenchText('rank_merged'))} ${escapeHtml(formatRankValue(item.mergedRank))}
                        / ${escapeHtml(resolveVectorWorkbenchText('rank_reranked'))} ${escapeHtml(formatRankValue(item.rerankedRank))}
                        / ${escapeHtml(resolveVectorWorkbenchText('rank_final'))} ${escapeHtml(formatRankValue(item.finalRank))}
                    </div>
                    <div class="stx-vector-lab__result-summary">${escapeHtml(item.changeReason || resolveVectorWorkbenchText('no_explanation'))}</div>
                </article>
            `).join('')}
        </div>
    `;
}

/**
 * 功能：格式化排名值。
 * @param value 排名。
 * @returns 展示文本。
 */
function formatRankValue(value?: number): string {
    return Number.isFinite(value) ? `#${value}` : resolveVectorWorkbenchText('rank_not_listed');
}

/**
 * 功能：构建概览统计卡片。
 * @param label 标签。
 * @param value 值。
 * @param detail 说明。
 * @param tone 色调。
 * @returns HTML。
 */
function buildOverviewCard(label: string, value: string, detail: string, tone: 'ok' | 'warn' | 'accent'): string {
    return `
        <article class="stx-vector-lab__overview-card is-${tone}">
            <div class="stx-vector-lab__overview-label">${escapeHtml(label)}</div>
            <div class="stx-vector-lab__overview-value">${escapeHtml(value)}</div>
            <div class="stx-vector-lab__overview-detail">${escapeHtml(detail)}</div>
        </article>
    `;
}

/**
 * 功能：构建紧凑型键值信息行。
 * @param label 标签。
 * @param value 值。
 * @returns HTML。
 */
function buildCompactInfoRow(label: string, value: string): string {
    return `
        <div class="stx-vector-lab__compact-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || resolveVectorWorkbenchText('empty_value'))}</strong>
        </div>
    `;
}

/**
 * 功能：构建详情信息行。
 * @param label 标签。
 * @param value 值。
 * @returns HTML。
 */
function buildInfoRow(label: string, value: string): string {
    return `<div class="stx-vector-lab__info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(formatDisplayValue(value))}</strong></div>`;
}

/**
 * 功能：构建标签块。
 * @param label 标签。
 * @param values 值列表。
 * @returns HTML。
 */
function buildTagBlock(label: string, values: string[]): string {
    return `
        <div class="stx-vector-lab__tag-block">
            <div class="stx-vector-lab__tag-label">${escapeHtml(label)}</div>
            <div class="stx-vector-lab__tag-row">
                ${(values ?? []).length > 0
                    ? (values ?? []).map((value: string): string => `<span class="stx-vector-lab__tag">${escapeHtml(value)}</span>`).join('')
                    : `<span class="stx-vector-lab__tag is-empty">${escapeHtml(resolveVectorWorkbenchText('empty_value'))}</span>`}
            </div>
        </div>
    `;
}

/**
 * 功能：构建测试面板开关项。
 * @param id 元素 ID。
 * @param label 标签。
 * @param checked 是否勾选。
 * @returns HTML。
 */
function buildSwitch(id: string, label: string, checked: boolean): string {
    return `
        <div class="stx-vector-lab__switch">
            ${buildSharedBoxCheckbox({
                id,
                appearance: 'check',
                inputAttributes: {
                    checked,
                },
            })}
            <label for="${escapeAttr(id)}">${escapeHtml(label)}</label>
        </div>
    `;
}

/**
 * 功能：构建测试结果摘要芯片。
 * @param label 标签。
 * @param value 值。
 * @returns HTML。
 */
function buildMetricChip(label: string, value: string): string {
    return `
        <div class="stx-vector-lab__metric-chip">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value || resolveVectorWorkbenchText('empty_value'))}</strong>
        </div>
    `;
}

/**
 * 功能：构建下拉选项列表。
 * @param values 候选值。
 * @param selected 当前值。
 * @param labelResolver 标签解析器。
 * @returns HTML。
 */
function buildSelectOptions(values: string[], selected: string, labelResolver: (value: string) => string): string {
    return values.map((value: string): string => {
        const isSelected = value === selected || (!selected && value === 'all');
        return `<option value="${escapeAttr(value)}"${isSelected ? ' selected' : ''}>${escapeHtml(labelResolver(value))}</option>`;
    }).join('');
}

/**
 * 功能：解析来源类型标签。
 * @param value 来源类型。
 * @returns 中文标签。
 */
function resolveSourceKindLabel(value: string): string {
    const mapping: Record<string, string> = {
        entry: resolveVectorWorkbenchText('source_entry'),
        relationship: resolveVectorWorkbenchText('source_relationship'),
        actor: resolveVectorWorkbenchText('source_actor'),
        summary: resolveVectorWorkbenchText('source_summary'),
    };
    return mapping[String(value ?? '').trim()] || resolveVectorWorkbenchText('source_unknown');
}

/**
 * 功能：解析 embedding 状态标签。
 * @param value 状态值。
 * @returns 中文标签。
 */
function resolveStatusLabel(value: string): string {
    const mapping: Record<string, string> = {
        ready: resolveVectorWorkbenchText('status_ready'),
        pending: resolveVectorWorkbenchText('status_pending'),
        processing: resolveVectorWorkbenchText('status_processing'),
        failed: resolveVectorWorkbenchText('status_failed'),
    };
    return mapping[String(value ?? '').trim()] || resolveVectorWorkbenchText('status_unknown');
}

/**
 * 功能：解析检索模式标签。
 * @param value 模式值。
 * @returns 中文标签。
 */
function resolveModeLabel(value: string): string {
    const mapping: Record<string, string> = {
        lexical_only: resolveVectorWorkbenchText('lexical_only'),
        vector_only: resolveVectorWorkbenchText('vector_only'),
        hybrid: resolveVectorWorkbenchText('hybrid_mode'),
    };
    return mapping[String(value ?? '').trim()] || resolveVectorWorkbenchText('mode_unknown');
}

/**
 * 功能：解析策略路由标签。
 * @param value 路由值。
 * @returns 中文标签。
 */
function resolveStrategyRouteLabel(value?: string): string {
    if (value === 'deep_vector') {
        return resolveVectorWorkbenchText('route_deep_vector');
    }
    if (value === 'fast_vector') {
        return resolveVectorWorkbenchText('route_fast_vector');
    }
    return resolveVectorWorkbenchText('route_none');
}

/**
 * 功能：解析重排来源标签。
 * @param value 来源值。
 * @returns 中文标签。
 */
function resolveRerankSourceLabel(value?: 'none' | 'rule' | 'llmhub'): string {
    if (value === 'llmhub') {
        return resolveVectorWorkbenchText('rerank_source_llmhub');
    }
    if (value === 'rule') {
        return resolveVectorWorkbenchText('rerank_source_rule');
    }
    return resolveVectorWorkbenchText('rerank_source_none');
}

/**
 * 功能：解析结果来源标签。
 * @param value 来源值。
 * @returns 中文标签。
 */
function resolveResultSourceLabel(value: string): string {
    const mapping: Record<string, string> = {
        lexical: resolveVectorWorkbenchText('result_source_lexical'),
        vector: resolveVectorWorkbenchText('result_source_vector'),
        graph_expansion: resolveVectorWorkbenchText('result_source_graph_expansion'),
        coverage_supplement: resolveVectorWorkbenchText('result_source_coverage_supplement'),
    };
    return mapping[String(value ?? '').trim()] || resolveVectorWorkbenchText('source_unknown');
}
