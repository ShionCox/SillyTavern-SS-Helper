import { escapeHtml } from '../editorShared';
import { escapeAttr, type WorkbenchSnapshot, type WorkbenchState } from './shared';

/**
 * 构建提示词预览视图。
 */
export function buildPreviewViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    return `
        <section class="stx-memory-workbench__view"${state.currentView !== 'preview' ? ' hidden' : ''}>
            <div class="stx-memory-workbench__view-head">
                <div class="stx-memory-workbench__section-title">网络缓存检视 / <span>CACHE INSPECT</span></div>
                <div class="stx-memory-workbench__toolbar">
                    <input class="stx-memory-workbench__input" id="stx-memory-preview-query" placeholder="模拟环境探测输入..." style="width:280px;" value="${escapeAttr(state.previewQuery)}">
                    <button class="stx-memory-workbench__button" data-action="refresh-preview"><i class="fa-solid fa-satellite-dish"></i> 解析探测</button>
                    <button class="stx-memory-workbench__ghost-btn" data-action="capture-summary"><i class="fa-solid fa-camera"></i> 强力快照归档</button>
                </div>
            </div>
            <div class="stx-memory-workbench__preview-grid">
                <div class="stx-memory-workbench__preview-box">
                    <div class="stx-memory-workbench__panel-title">SYSTEM INJECT Layer</div>
                    <div class="stx-memory-workbench__muted" style="margin-bottom:8px;">被动锁定在系统环境的核心常驻参数</div>
                    <pre>${escapeHtml(snapshot.preview?.systemText || '[  NO CARRIER  ]')}</pre>
                </div>
                <div class="stx-memory-workbench__preview-box">
                    <div class="stx-memory-workbench__panel-title">ACTOR RETRIEVAL Layer</div>
                    <div class="stx-memory-workbench__muted" style="margin-bottom:8px;">子进程角色在当前上下文中存留的非挥发核心</div>
                    <pre>${escapeHtml(snapshot.preview?.roleText || '[  NO ANOMALY DETECTED  ]')}</pre>
                </div>
                <div class="stx-memory-workbench__preview-box">
                    <div class="stx-memory-workbench__panel-title">FINAL PAYLOAD</div>
                    <div class="stx-memory-workbench__muted" style="margin-bottom:8px;">合并封装并将交付到引擎的总纲</div>
                    <pre>${escapeHtml(snapshot.preview?.finalText || '[  NULL POINTER EXCEPTION  ]')}</pre>
                </div>
            </div>
        </section>
    `;
}
