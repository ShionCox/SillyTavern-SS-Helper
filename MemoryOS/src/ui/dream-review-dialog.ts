import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import { renderDreamReviewExplainPanel } from './dream-review-explain-panel';
import type {
    DreamMutationProposal,
    DreamReviewDecision,
    DreamSessionDiagnosticsRecord,
    DreamSessionGraphSnapshotRecord,
    DreamSessionOutputRecord,
    DreamSessionRecallRecord,
} from '../services/dream-types';

const DREAM_REVIEW_DIALOG_ID = 'stx-memory-dream-review-dialog';
const DREAM_REVIEW_STYLE_ID = 'stx-memory-dream-review-style';

function ensureDreamReviewStyle(): void {
    if (document.getElementById(DREAM_REVIEW_STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = DREAM_REVIEW_STYLE_ID;
    style.textContent = `
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review { display:flex; flex-direction:column; gap:14px; min-width:min(1180px,100%); height:min(84vh,1040px); overflow:hidden; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary,
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid { display:grid; gap:12px; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__summary { grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid { grid-template-columns:minmax(0,1fr) minmax(0,1fr); min-height:0; flex:1; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel { border:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.16)); border-radius:14px; padding:14px; background:rgba(0,0,0,.18); min-height:0; overflow:auto; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__source-card, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__diag-card { border:1px solid rgba(255,255,255,.12); border-radius:12px; padding:12px; background:rgba(255,255,255,.03); }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-label, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__meta, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__hint, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload { font-size:12px; line-height:1.65; opacity:.84; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__metric-value, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__panel-title, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-title { font-size:14px; font-weight:700; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__narrative { white-space:pre-wrap; line-height:1.8; font-size:13px; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__list, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__sources { display:flex; flex-direction:column; gap:10px; margin-top:10px; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation.is-selected { border-color:rgba(98,193,135,.55); background:rgba(98,193,135,.08); }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__mutation-head { display:flex; gap:10px; align-items:flex-start; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badges, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlights { display:flex; flex-wrap:wrap; gap:6px; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__badge, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__highlight { border-radius:999px; padding:2px 8px; background:rgba(255,255,255,.08); font-size:11px; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button, #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__toolbar button { border:1px solid rgba(255,255,255,.14); border-radius:10px; padding:8px 12px; background:rgba(255,255,255,.06); color:inherit; cursor:pointer; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__actions button[data-action="approve"] { background:rgba(98,193,135,.14); border-color:rgba(98,193,135,.36); }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__payload { margin:0; white-space:pre-wrap; word-break:break-word; }
        #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__explain { margin-top:10px; padding-top:10px; border-top:1px dashed rgba(255,255,255,.12); }
        @media (max-width: 980px) { #${DREAM_REVIEW_DIALOG_ID} .stx-memory-dream-review__grid { grid-template-columns:minmax(0,1fr); } }
    `;
    document.head.appendChild(style);
}

function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderSourceCards(title: string, hits: DreamSessionRecallRecord['recentHits']): string {
    if (hits.length <= 0) {
        return `<div class="stx-memory-dream-review__source-card"><div class="stx-memory-dream-review__meta">${escapeHtml(title)} 暂无命中。</div></div>`;
    }
    return hits.map((hit) => `
        <article class="stx-memory-dream-review__source-card">
            <div class="stx-memory-dream-review__mutation-title">${escapeHtml(hit.title || '未命名条目')}</div>
            <div class="stx-memory-dream-review__meta">entryId：${escapeHtml(hit.entryId)} / 分数：${Number(hit.score ?? 0).toFixed(2)}</div>
            <div class="stx-memory-dream-review__hint">${escapeHtml(hit.summary || '无摘要')}</div>
            <div class="stx-memory-dream-review__badges">
                <span class="stx-memory-dream-review__badge">${escapeHtml(title)}</span>
                ${hit.tags.slice(0, 6).map((tag: string): string => `<span class="stx-memory-dream-review__badge">${escapeHtml(tag)}</span>`).join('')}
            </div>
        </article>
    `).join('');
}

function renderDiagnosticsCard(diagnostics?: DreamSessionDiagnosticsRecord | null, graphSnapshot?: DreamSessionGraphSnapshotRecord | null): string {
    if (!diagnostics) {
        return `<div class="stx-memory-dream-review__diag-card"><div class="stx-memory-dream-review__hint">当前会话未保存 diagnostics。</div></div>`;
    }
    return `
        <div class="stx-memory-dream-review__diag-card">
            <div class="stx-memory-dream-review__mutation-title">融合诊断</div>
            <div class="stx-memory-dream-review__meta">最终选择 ${diagnostics.fusionResult.diagnostics.finalSelectedCount} 条 / 去重丢弃 ${diagnostics.fusionResult.diagnostics.duplicateDropped} 条</div>
            <div class="stx-memory-dream-review__meta">新颖度提升 ${diagnostics.fusionResult.diagnostics.boostedByNovelty} 条 / 激活提升 ${diagnostics.fusionResult.diagnostics.boostedByActivation} 条</div>
            <div class="stx-memory-dream-review__hint">桥接节点：${escapeHtml(diagnostics.fusionResult.bridgeNodeKeys.join('、') || '无')}</div>
            ${diagnostics.waveOutputs.map((wave) => `
                <div class="stx-memory-dream-review__explain">
                    <div class="stx-memory-dream-review__meta">${escapeHtml(wave.waveType)} 波段</div>
                    <div class="stx-memory-dream-review__hint">seed：${escapeHtml(wave.seedEntryIds.join('、') || '无')}</div>
                    <div class="stx-memory-dream-review__hint">activated：${escapeHtml(wave.activatedNodeKeys.slice(0, 8).join('、') || '无')}</div>
                    <div class="stx-memory-dream-review__hint">${escapeHtml(wave.diagnostics.baseReason.join(' / ') || '无')}</div>
                </div>
            `).join('')}
            <div class="stx-memory-dream-review__explain">
                <div class="stx-memory-dream-review__meta">图快照</div>
                <div class="stx-memory-dream-review__hint">节点 ${String(graphSnapshot?.activatedNodes.length ?? 0)} / 边 ${String(graphSnapshot?.activatedEdges.length ?? 0)}</div>
            </div>
        </div>
    `;
}

function renderMutationCard(mutation: DreamMutationProposal, checked: boolean): string {
    return `
        <article class="stx-memory-dream-review__mutation${checked ? ' is-selected' : ''}" data-mutation-card="${escapeHtml(mutation.mutationId)}">
            <div class="stx-memory-dream-review__mutation-head">
                <input type="checkbox" data-dream-mutation="${escapeHtml(mutation.mutationId)}" ${checked ? 'checked' : ''}>
                <div style="flex:1;min-width:0;">
                    <div class="stx-memory-dream-review__mutation-title">${escapeHtml(mutation.preview || mutation.mutationType)}</div>
                    <div class="stx-memory-dream-review__meta">类型：${escapeHtml(mutation.mutationType)} / 置信度：${Number(mutation.confidence ?? 0).toFixed(2)} / 来源波段：${escapeHtml(mutation.sourceWave)}</div>
                </div>
            </div>
            <div class="stx-memory-dream-review__list">
                <div class="stx-memory-dream-review__hint">${escapeHtml(mutation.reason || '无理由说明')}</div>
                <div class="stx-memory-dream-review__meta">来源条目：${escapeHtml(mutation.sourceEntryIds.join('、') || '未标注')}</div>
                <pre class="stx-memory-dream-review__payload">${escapeHtml(JSON.stringify(mutation.payload, null, 2))}</pre>
                ${renderDreamReviewExplainPanel(mutation.explain)}
            </div>
        </article>
    `;
}

/**
 * 功能：打开 dream 审批弹窗。
 */
export async function openDreamReviewDialog(input: {
    meta: { dreamId: string; triggerReason: string; createdAt: number };
    recall: DreamSessionRecallRecord;
    output: DreamSessionOutputRecord;
    diagnostics?: DreamSessionDiagnosticsRecord | null;
    graphSnapshot?: DreamSessionGraphSnapshotRecord | null;
}): Promise<DreamReviewDecision> {
    ensureDreamReviewStyle();
    return new Promise<DreamReviewDecision>((resolve): void => {
        let settled = false;
        const finish = (result: DreamReviewDecision): void => {
            if (settled) {
                return;
            }
            settled = true;
            resolve(result);
        };
        const defaultSelected = new Set(
            input.output.proposedMutations
                .filter((mutation: DreamMutationProposal): boolean => mutation.confidence >= 0.65)
                .map((mutation: DreamMutationProposal): string => mutation.mutationId),
        );
        openSharedDialog({
            id: DREAM_REVIEW_DIALOG_ID,
            chrome: { title: '梦境审批' },
            bodyHtml: `
                <div class="stx-memory-dream-review">
                    <div class="stx-memory-dream-review__summary">
                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">dreamId</div><div class="stx-memory-dream-review__metric-value">${escapeHtml(input.meta.dreamId)}</div></div>
                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">触发原因</div><div class="stx-memory-dream-review__metric-value">${escapeHtml(input.meta.triggerReason)}</div></div>
                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">创建时间</div><div class="stx-memory-dream-review__metric-value">${escapeHtml(new Date(input.meta.createdAt).toLocaleString('zh-CN'))}</div></div>
                        <div class="stx-memory-dream-review__metric"><div class="stx-memory-dream-review__metric-label">融合召回</div><div class="stx-memory-dream-review__metric-value">${String(input.recall.fusedHits.length)}</div></div>
                    </div>
                    <div class="stx-memory-dream-review__grid">
                        <section class="stx-memory-dream-review__panel">
                            <div class="stx-memory-dream-review__panel-title">梦境叙事</div>
                            <div class="stx-memory-dream-review__narrative">${escapeHtml(input.output.narrative || '本轮未生成梦境叙事。')}</div>
                            <div class="stx-memory-dream-review__list">
                                <div class="stx-memory-dream-review__panel-title">梦境发现</div>
                                <div class="stx-memory-dream-review__highlights">
                                    ${(input.output.highlights.length > 0 ? input.output.highlights : ['本轮没有新增发现']).map((item: string): string => `<span class="stx-memory-dream-review__highlight">${escapeHtml(item)}</span>`).join('')}
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__list">
                                <div class="stx-memory-dream-review__panel-title">来源记忆</div>
                                <div class="stx-memory-dream-review__sources">
                                    ${renderSourceCards('recent', input.recall.recentHits)}
                                    ${renderSourceCards('mid', input.recall.midHits)}
                                    ${renderSourceCards('deep', input.recall.deepHits)}
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__list">
                                <div class="stx-memory-dream-review__panel-title">诊断面板</div>
                                ${renderDiagnosticsCard(input.diagnostics, input.graphSnapshot)}
                            </div>
                        </section>
                        <section class="stx-memory-dream-review__panel">
                            <div class="stx-memory-dream-review__toolbar">
                                <div class="stx-memory-dream-review__panel-title">记忆提案</div>
                                <div>
                                    <button type="button" data-select-all="true">全选</button>
                                    <button type="button" data-clear-all="true">全部取消</button>
                                </div>
                            </div>
                            <div class="stx-memory-dream-review__list">
                                ${input.output.proposedMutations.map((mutation: DreamMutationProposal): string => renderMutationCard(mutation, defaultSelected.has(mutation.mutationId))).join('')}
                            </div>
                        </section>
                    </div>
                    <div class="stx-memory-dream-review__actions">
                        <button type="button" data-action="defer">稍后处理</button>
                        <button type="button" data-action="reject">全部拒绝</button>
                        <button type="button" data-action="approve">应用所选</button>
                    </div>
                </div>
            `,
            onMount: (instance: SharedDialogInstance): void => {
                const root = instance.content;
                const mutationInputs = (): HTMLInputElement[] => Array.from(root.querySelectorAll('input[data-dream-mutation]'))
                    .filter((item: Element): item is HTMLInputElement => item instanceof HTMLInputElement);
                const syncCards = (): void => {
                    mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                        const mutationId = String(inputEl.dataset.dreamMutation ?? '').trim();
                        root.querySelector(`[data-mutation-card="${mutationId}"]`)?.classList.toggle('is-selected', inputEl.checked);
                    });
                };
                const readSelection = (): { approved: string[]; rejected: string[] } => {
                    const approved = mutationInputs()
                        .filter((item: HTMLInputElement): boolean => item.checked)
                        .map((item: HTMLInputElement): string => String(item.dataset.dreamMutation ?? '').trim())
                        .filter(Boolean);
                    const approvedSet = new Set(approved);
                    const rejected = input.output.proposedMutations
                        .map((item: DreamMutationProposal): string => item.mutationId)
                        .filter((mutationId: string): boolean => !approvedSet.has(mutationId));
                    return { approved, rejected };
                };
                mutationInputs().forEach((inputEl: HTMLInputElement): void => {
                    inputEl.addEventListener('change', syncCards);
                });
                root.querySelector('[data-select-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = true;
                    });
                    syncCards();
                });
                root.querySelector('[data-clear-all="true"]')?.addEventListener('click', (): void => {
                    mutationInputs().forEach((item: HTMLInputElement): void => {
                        item.checked = false;
                    });
                    syncCards();
                });
                root.querySelector('[data-action="defer"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({ decision: 'deferred', approvedMutationIds: selection.approved, rejectedMutationIds: selection.rejected });
                });
                root.querySelector('[data-action="reject"]')?.addEventListener('click', (): void => {
                    instance.close();
                    finish({
                        decision: 'rejected',
                        approvedMutationIds: [],
                        rejectedMutationIds: input.output.proposedMutations.map((item: DreamMutationProposal): string => item.mutationId),
                    });
                });
                root.querySelector('[data-action="approve"]')?.addEventListener('click', (): void => {
                    instance.close();
                    const selection = readSelection();
                    finish({
                        decision: selection.approved.length > 0 ? 'approved' : 'deferred',
                        approvedMutationIds: selection.approved,
                        rejectedMutationIds: selection.rejected,
                    });
                });
                syncCards();
            },
            onClose: (): void => {
                finish({ decision: 'deferred', approvedMutationIds: [], rejectedMutationIds: [] });
            },
        });
    });
}
