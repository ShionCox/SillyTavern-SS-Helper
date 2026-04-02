import { escapeHtml } from '../editorShared';
import { resolveRetrievalProviderLabel } from '../workbenchLocale';
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
                        <div class="stx-memory-workbench__section-title">向量实验室</div>
                        <div class="stx-vector-lab__hero-subtitle">浏览向量资产、测试召回链路、执行索引维护。</div>
                    </div>
                </div>
                <div class="stx-memory-workbench__card">
                    <div class="stx-memory-workbench__empty">${state.vectorTabLoading ? '正在加载向量运行时、文档与索引信息...' : '进入本页后将按需加载向量文档、索引和召回统计。'}</div>
                </div>
            </section>
        `;
    }
    const sourceKindOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.map((doc) => doc.sourceKind)))],
        state.vectorSourceKindFilter,
        (value: string): string => value === 'all' ? '全部来源' : resolveSourceKindLabel(value),
    );
    const statusOptions = buildSelectOptions(
        ['all', 'ready', 'pending', 'failed'],
        state.vectorStatusFilter,
        (value: string): string => value === 'all' ? '全部状态' : resolveStatusLabel(value),
    );
    const schemaOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.map((doc) => String(doc.schemaId ?? '').trim()).filter(Boolean)))],
        state.vectorSchemaFilter,
        (value: string): string => value === 'all' ? '全部结构' : value,
    );
    const actorOptions = buildSelectOptions(
        ['all', ...Array.from(new Set(vectorSnapshot.documents.flatMap((doc) => doc.actorKeys ?? []).filter(Boolean)))],
        state.vectorActorFilter,
        (value: string): string => value === 'all' ? '全部角色' : value,
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
                    <div class="stx-memory-workbench__section-title">向量实验室</div>
                    <div class="stx-vector-lab__hero-subtitle">浏览向量资产、测试召回链路、执行索引维护。</div>
                </div>
                <div class="stx-memory-workbench__toolbar stx-memory-workbench__toolbar--wrap">
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-refresh"><i class="fa-solid fa-rotate"></i> 刷新</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-rebuild-documents"><i class="fa-solid fa-layer-group"></i> 重建文档</button>
                    <button class="stx-memory-workbench__button" data-action="vector-rebuild-embeddings"><i class="fa-solid fa-wave-square"></i> 重建索引</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-clear-data" style="border-color:rgba(239,68,68,0.42); color:var(--mw-warn);">
                        <i class="fa-solid fa-trash-can"></i> 清空向量数据
                    </button>
                </div>
            </div>

            <div class="stx-vector-lab__overview">
                ${buildOverviewCard('运行时', vectorSnapshot.runtimeReady ? '已就绪' : '未就绪', vectorSnapshot.runtimeReady ? '可执行向量链路' : '尚未初始化向量运行时', vectorSnapshot.runtimeReady ? 'ok' : 'warn')}
                ${buildOverviewCard('Embedding', vectorSnapshot.embeddingAvailable ? '可用' : '不可用', vectorSnapshot.embeddingAvailable ? (vectorSnapshot.embeddingModel || '已连接编码服务') : (vectorSnapshot.embeddingUnavailableReason || '当前无法编码'), vectorSnapshot.embeddingAvailable ? 'ok' : 'warn')}
                ${buildOverviewCard('Store', vectorSnapshot.vectorStoreAvailable ? '可用' : '不可用', vectorSnapshot.vectorStoreAvailable ? '向量索引读写正常' : (vectorSnapshot.vectorStoreUnavailableReason || '当前无法访问存储'), vectorSnapshot.vectorStoreAvailable ? 'ok' : 'warn')}
                ${buildOverviewCard('当前模式', resolveModeLabel(vectorSnapshot.retrievalMode), `策略路由 ${vectorSnapshot.vectorEnableStrategyRouting ? '开启' : '关闭'} / 重排 ${vectorSnapshot.vectorEnableRerank ? '开启' : '关闭'}`, 'accent')}
                ${buildOverviewCard('文档总数', String(vectorSnapshot.documentCount), `Ready ${vectorSnapshot.readyCount} / Pending ${vectorSnapshot.pendingCount} / Failed ${vectorSnapshot.failedCount}`, 'accent')}
                ${buildOverviewCard('索引记录', String(vectorSnapshot.indexCount), `召回统计 ${vectorSnapshot.recallStatCount} 条`, 'accent')}
            </div>

            <div class="stx-vector-lab__layout">
                <aside class="stx-vector-lab__rail">
                    <div class="stx-memory-workbench__card stx-vector-lab__panel">
                        <div class="stx-memory-workbench__panel-title">向量文档</div>
                        <div class="stx-vector-lab__panel-body">
                            <div class="stx-vector-lab__filters">
                                <input id="stx-vector-text-filter" class="stx-memory-workbench__input" placeholder="搜索标题、来源、文本" value="${escapeAttr(state.vectorTextFilter)}">
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
                                        <div class="stx-vector-lab__doc-meta">${escapeHtml(truncateText(doc.compareKey || '无 compareKey', 42) || '无 compareKey')}</div>
                                        <div class="stx-vector-lab__doc-foot">
                                            <span>${escapeHtml(String(doc.embeddingDim ?? 0))} 维</span>
                                            <span>${escapeHtml(formatTimestamp(doc.updatedAt))}</span>
                                        </div>
                                    </button>
                                `).join('') || '<div class="stx-memory-workbench__empty">当前过滤条件下没有向量文档。</div>'}
                            </div>
                        </div>
                    </div>
                </aside>

                <div class="stx-vector-lab__content">
                    <div class="stx-memory-workbench__card stx-vector-lab__panel">
                        <div class="stx-vector-lab__detail-head">
                            <div>
                                <div class="stx-memory-workbench__panel-title">文档详情</div>
                                <div class="stx-vector-lab__detail-subtitle">${selectedDoc ? escapeHtml(selectedDoc.vectorDocId) : '请选择一条向量文档查看详情'}</div>
                            </div>
                            ${selectedDoc ? `
                                <div class="stx-memory-workbench__toolbar">
                                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-reindex-doc" data-vector-doc-id="${escapeAttr(selectedDoc.vectorDocId)}">重新索引</button>
                                    <button class="stx-memory-workbench__ghost-btn" data-action="vector-remove-doc" data-vector-doc-id="${escapeAttr(selectedDoc.vectorDocId)}" style="border-color:rgba(239,68,68,0.42); color:var(--mw-warn);">删除文档</button>
                                </div>
                            ` : ''}
                        </div>
                        <div class="stx-vector-lab__panel-body stx-vector-lab__panel-body--scroll">
                            ${selectedDoc ? `
                                <div class="stx-vector-lab__detail-grid">
                                    <div class="stx-vector-lab__detail-card">
                                        <div class="stx-vector-lab__detail-title">基本信息</div>
                                        ${buildInfoRow('来源类型', resolveSourceKindLabel(selectedDoc.sourceKind))}
                                        ${buildInfoRow('来源 ID', selectedDoc.sourceId)}
                                        ${buildInfoRow('结构 ID', selectedDoc.schemaId || '暂无')}
                                        ${buildInfoRow('CompareKey', selectedDoc.compareKey || '暂无')}
                                        ${buildInfoRow('更新时间', formatTimestamp(selectedDoc.updatedAt))}
                                    </div>
                                    <div class="stx-vector-lab__detail-card">
                                        <div class="stx-vector-lab__detail-title">向量状态</div>
                                        ${buildInfoRow('Embedding 状态', resolveStatusLabel(selectedDoc.embeddingStatus))}
                                        ${buildInfoRow('模型', selectedDoc.embeddingModel || '暂无')}
                                        ${buildInfoRow('版本', selectedDoc.embeddingVersion || '暂无')}
                                        ${buildInfoRow('维度', String(selectedDoc.embeddingDim ?? 0))}
                                        ${buildInfoRow('索引写入', hasIndex ? '已写入' : '未写入')}
                                        ${buildInfoRow('最近召回', recallStat ? `${recallStat.recallCount} 次` : '暂无')}
                                        ${buildInfoRow('最近模式', recallStat?.lastRecallMode || '暂无')}
                                        ${buildInfoRow('最近时间', formatTimestamp(recallStat?.lastRecalledAt))}
                                        ${selectedDoc.lastError ? buildInfoRow('错误信息', selectedDoc.lastError) : ''}
                                    </div>
                                </div>
                                <div class="stx-vector-lab__detail-grid">
                                    <div class="stx-vector-lab__detail-card">
                                        <div class="stx-vector-lab__detail-title">结构标签</div>
                                        ${buildTagBlock('角色', selectedDoc.actorKeys)}
                                        ${buildTagBlock('关系', selectedDoc.relationKeys)}
                                        ${buildTagBlock('世界', selectedDoc.worldKeys)}
                                        ${buildTagBlock('地点', selectedDoc.locationKey ? [selectedDoc.locationKey] : [])}
                                    </div>
                                    <div class="stx-vector-lab__detail-card">
                                        <div class="stx-vector-lab__detail-title">文本内容</div>
                                        <div class="stx-vector-lab__detail-text">
                                            <strong>${escapeHtml(selectedDoc.title || '未命名文档')}</strong>
                                            <div>${escapeHtml(selectedDoc.text || '暂无文本内容')}</div>
                                        </div>
                                    </div>
                                </div>
                            ` : '<div class="stx-memory-workbench__empty">左侧选择一条向量文档后，这里会显示索引与文本详情。</div>'}
                        </div>
                    </div>

                    <div class="stx-memory-workbench__card stx-vector-lab__panel">
                        <div class="stx-vector-lab__detail-head">
                            <div>
                                <div class="stx-memory-workbench__panel-title">召回测试台</div>
                                <div class="stx-vector-lab__detail-subtitle">手动验证 lexical / vector / hybrid 三种模式下的最终链路。</div>
                            </div>
                            <button class="stx-memory-workbench__button" data-action="vector-run-test"${state.vectorTestRunning ? ' disabled' : ''}>
                                <i class="fa-solid fa-play"></i> ${state.vectorTestRunning ? '测试中…' : '开始测试'}
                            </button>
                        </div>
                        <div class="stx-vector-lab__panel-body">
                            <div class="stx-vector-lab__test-grid">
                                <div class="stx-vector-lab__test-form">
                                    <textarea id="stx-vector-query" class="stx-memory-workbench__textarea" placeholder="输入要测试的查询文本">${escapeHtml(state.vectorQuery)}</textarea>
                                    <div class="stx-vector-lab__filter-grid">
                                        <select id="stx-vector-mode" class="stx-memory-workbench__select">
                                            <option value="lexical_only"${state.vectorMode === 'lexical_only' ? ' selected' : ''}>仅词法</option>
                                            <option value="vector_only"${state.vectorMode === 'vector_only' ? ' selected' : ''}>仅向量</option>
                                            <option value="hybrid"${state.vectorMode === 'hybrid' ? ' selected' : ''}>混合模式</option>
                                        </select>
                                        <input id="stx-vector-topk" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorTopKTest)}" placeholder="TopK">
                                        <input id="stx-vector-deep-window" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorDeepWindowTest)}" placeholder="DeepWindow">
                                        <input id="stx-vector-final-topk" class="stx-memory-workbench__input" type="number" min="1" value="${escapeAttr(state.vectorFinalTopKTest)}" placeholder="FinalTopK">
                                    </div>
                                    <div class="stx-vector-lab__switches">
                                        ${buildSwitch('stx-vector-enable-routing', '策略路由', state.vectorEnableStrategyRoutingTest)}
                                        ${buildSwitch('stx-vector-enable-rerank', '规则重排', state.vectorEnableRerankTest)}
                                        ${buildSwitch('stx-vector-enable-llmhub-rerank', 'LLMHub 重排', state.vectorEnableLLMHubRerankTest)}
                                        ${buildSwitch('stx-vector-enable-graph-expansion', '图扩展', state.vectorEnableGraphExpansionTest)}
                                    </div>
                                </div>
                                <div class="stx-vector-lab__test-result">
                                    ${state.vectorTestRunning || testProgress ? `
                                        <div class="stx-vector-lab__progress-card${state.vectorTestRunning ? ' is-running' : ''}${testProgress?.stage === 'failed' ? ' is-failed' : ''}">
                                            <div class="stx-vector-lab__progress-head">
                                                <span>当前步骤</span>
                                                <strong>${escapeHtml(testProgress?.title || (state.vectorTestRunning ? '测试进行中' : '最近步骤'))}</strong>
                                            </div>
                                            <div class="stx-vector-lab__progress-message">${escapeHtml(testProgress?.message || '正在执行召回测试。')}</div>
                                            ${typeof testProgress?.progress === 'number' ? `
                                                <div class="stx-vector-lab__progress-bar">
                                                    <span style="width:${escapeAttr(String(Math.max(0, Math.min(100, Math.round(testProgress.progress * 100)))))}%"></span>
                                                </div>
                                            ` : ''}
                                        </div>
                                    ` : ''}
                                    ${testResult ? `
                                        <div class="stx-vector-lab__result-block">
                                            <div class="stx-vector-lab__detail-title">链路诊断</div>
                                            <div class="stx-vector-lab__result-grid">
                                                ${buildMetricChip('最终链路', resolveRetrievalProviderLabel(testResult.diagnostics.finalProviderId || testResult.providerId))}
                                                ${buildMetricChip('基线种子', resolveRetrievalProviderLabel(testResult.diagnostics.seedProviderId || 'none'))}
                                                ${buildMetricChip('策略路由', resolveStrategyRouteLabel(testResult.diagnostics.strategyDecision?.route))}
                                                ${buildMetricChip('向量命中', String(testResult.diagnostics.vectorHitCount ?? 0))}
                                                ${buildMetricChip('执行融合', testResult.diagnostics.mergeUsed ? '是' : '否')}
                                                ${buildMetricChip('执行重排', testResult.diagnostics.rerankUsed ? '是' : '否')}
                                                ${buildMetricChip('重排来源', resolveRerankSourceLabel(testResult.diagnostics.rerankSource))}
                                                ${buildMetricChip('结果数量', String(testResult.items.length))}
                                            </div>
                                            <div class="stx-vector-lab__reason-row">
                                                <span>原因码</span>
                                                <strong>${escapeHtml((testResult.diagnostics.rerankReasonCodes ?? []).join('、') || '暂无')}</strong>
                                            </div>
                                        </div>
                                        <div class="stx-vector-lab__result-block">
                                            <div class="stx-vector-lab__detail-title">最终结果</div>
                                            <div class="stx-vector-lab__result-list">
                                                ${testResult.items.map((item, index) => {
                                                    const sourceLabel = testResult.diagnostics.resultSourceLabels.find((label) => label.candidateId === item.candidate.candidateId)?.source ?? 'lexical';
                                                    return `
                                                        <article class="stx-vector-lab__result-item">
                                                            <div class="stx-vector-lab__result-head">
                                                                <strong>#${index + 1} ${escapeHtml(item.candidate.title || item.candidate.entryId)}</strong>
                                                                <span>${escapeHtml(resolveResultSourceLabel(sourceLabel))}</span>
                                                            </div>
                                                            <div class="stx-vector-lab__result-meta">${escapeHtml(item.candidate.schemaId)} / ${escapeHtml(item.candidate.entryId)}</div>
                                                            <div class="stx-vector-lab__result-summary">${escapeHtml(truncateText(item.candidate.summary || '暂无摘要', 180) || '暂无摘要')}</div>
                                                            <div class="stx-vector-lab__result-meta">得分 ${escapeHtml(Number(item.score ?? 0).toFixed(4))}</div>
                                                        </article>
                                                    `;
                                                }).join('') || '<div class="stx-memory-workbench__empty">本次测试没有命中任何结果。</div>'}
                                            </div>
                                        </div>
                                    ` : '<div class="stx-memory-workbench__empty">填写查询文本后执行测试，这里会展示最终链路、重排信息和结果列表。</div>'}
                                </div>
                            </div>
                        </div>
                    </div>
            </div>
        </section>
    `;
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
                    : '<span class="stx-vector-lab__tag is-empty">暂无</span>'}
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
            <strong>${escapeHtml(value || '暂无')}</strong>
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
        entry: '条目',
        relationship: '关系',
        actor: '角色',
        summary: '总结',
    };
    return mapping[String(value ?? '').trim()] || '未知来源';
}

/**
 * 功能：解析 embedding 状态标签。
 * @param value 状态值。
 * @returns 中文标签。
 */
function resolveStatusLabel(value: string): string {
    const mapping: Record<string, string> = {
        ready: '已就绪',
        pending: '待编码',
        processing: '处理中',
        failed: '失败',
    };
    return mapping[String(value ?? '').trim()] || '未知状态';
}

/**
 * 功能：解析检索模式标签。
 * @param value 模式值。
 * @returns 中文标签。
 */
function resolveModeLabel(value: string): string {
    const mapping: Record<string, string> = {
        lexical_only: '仅词法',
        vector_only: '仅向量',
        hybrid: '混合模式',
    };
    return mapping[String(value ?? '').trim()] || '未知模式';
}

/**
 * 功能：解析策略路由标签。
 * @param value 路由值。
 * @returns 中文标签。
 */
function resolveStrategyRouteLabel(value?: string): string {
    if (value === 'deep_vector') {
        return '深路径';
    }
    if (value === 'fast_vector') {
        return '快路径';
    }
    return '暂无';
}

/**
 * 功能：解析重排来源标签。
 * @param value 来源值。
 * @returns 中文标签。
 */
function resolveRerankSourceLabel(value?: 'none' | 'rule' | 'llmhub'): string {
    if (value === 'llmhub') {
        return 'LLMHub';
    }
    if (value === 'rule') {
        return '规则重排';
    }
    return '无';
}

/**
 * 功能：解析结果来源标签。
 * @param value 来源值。
 * @returns 中文标签。
 */
function resolveResultSourceLabel(value: string): string {
    const mapping: Record<string, string> = {
        lexical: '词法',
        vector: '向量',
        graph_expansion: '图扩展',
        coverage_supplement: '补召回',
    };
    return mapping[String(value ?? '').trim()] || '未知来源';
}
