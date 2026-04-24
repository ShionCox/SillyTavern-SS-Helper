import { buildSharedBoxCheckbox } from '../../../../_Components/sharedBoxCheckbox';
import { escapeHtml } from '../editorShared';
import type { WorkbenchSnapshot, WorkbenchState } from './shared';
import { escapeAttr } from './shared';

const MODE_LABELS: Record<string, string> = {
    xml: 'XML 标签',
    delimiter: '分隔符',
    regex: '正则',
    markdown: 'Markdown',
    json: 'JSON',
};

const SCOPE_LABELS: Array<{ key: string; label: string }> = [
    { key: 'summary', label: '自动总结' },
    { key: 'takeover', label: '旧聊天接管' },
    { key: 'dreamRecall', label: '梦境召回' },
    { key: 'vectorIndex', label: '向量索引' },
    { key: 'promptInjection', label: 'Prompt 注入' },
];

export function buildMemoryFilterViewMarkup(snapshot: WorkbenchSnapshot, state: WorkbenchState): string {
    const legacyState = state as unknown as Record<string, unknown>;
    const legacySnapshot = snapshot as unknown as {
        memoryFilterSnapshot?: {
            loaded: boolean;
            availableFloors: Array<{ floor: number; role: string; charCount: number }>;
            settings?: {
                scope?: Record<string, boolean>;
                unknownPolicy?: string;
            };
        };
    };
    const loaded = legacySnapshot.memoryFilterSnapshot?.loaded === true;
    const enabled = legacyState.memoryFilterEnabled === true;
    const mode = String(legacyState.memoryFilterMode ?? 'xml');
    const rules = Array.isArray(legacyState.memoryFilterRules) ? legacyState.memoryFilterRules as Array<Record<string, unknown>> : [];
    const memoryRules = rules.filter((rule) => normalizeChannel(rule.channel) === 'memory' || normalizeChannel(rule.channel) === 'primary');
    const contextRules = rules.filter((rule) => normalizeChannel(rule.channel) === 'context' || normalizeChannel(rule.channel) === 'hint');
    const excludedRules = rules.filter((rule) => normalizeChannel(rule.channel) === 'excluded');
    const memoryText = String(legacyState.memoryFilterMemoryPreview ?? '').trim();
    const contextText = String(legacyState.memoryFilterContextPreview ?? '').trim();
    const excludedText = String(legacyState.memoryFilterExcludedPreview ?? '').trim();
    const finalText = [memoryText, contextText ? `仅作参考：\n${contextText}` : ''].filter(Boolean).join('\n\n');
    const availableFloors = legacySnapshot.memoryFilterSnapshot?.availableFloors ?? [];
    const scope = legacySnapshot.memoryFilterSnapshot?.settings?.scope ?? {};
    const unknownPolicy = String(legacyState.memoryFilterUnknownPolicy ?? legacySnapshot.memoryFilterSnapshot?.settings?.unknownPolicy ?? 'memory');

    return `
        <section class="stx-memory-workbench__view stx-memory-filter"${state.currentView !== 'memory-filter' ? ' hidden' : ''}>
            <input id="stx-memory-filter-mode" type="hidden" value="${escapeAttr(mode)}">
            <input id="stx-memory-filter-cleanup-trim" type="checkbox" hidden${legacyState.memoryFilterCleanupTrimWhitespace !== false ? ' checked' : ''}>
            <input id="stx-memory-filter-cleanup-strip-wrapper" type="checkbox" hidden${legacyState.memoryFilterCleanupStripWrapper !== false ? ' checked' : ''}>
            <input id="stx-memory-filter-cleanup-drop-empty" type="checkbox" hidden${legacyState.memoryFilterCleanupDropEmptyBlocks !== false ? ' checked' : ''}>
            <input id="stx-memory-filter-min-length" type="hidden" value="${escapeAttr(legacyState.memoryFilterCleanupMinBlockLength ?? '0')}">
            <input id="stx-memory-filter-max-length" type="hidden" value="${escapeAttr(legacyState.memoryFilterCleanupMaxBlockLength ?? '1200')}">
            <div class="stx-memory-filter__header">
                <div>
                    <div class="stx-memory-workbench__section-title">记忆过滤器</div>
                    <p>控制 MemoryOS 在生成记忆前读取哪些内容。</p>
                </div>
                <label class="stx-memory-filter__switch">
                    ${buildSharedBoxCheckbox({
                        id: 'stx-memory-filter-enabled',
                        inputAttributes: { checked: enabled },
                    })}
                    <span>${enabled ? '已开启' : '已关闭'}</span>
                </label>
            </div>

            ${loaded ? '' : `<div class="stx-memory-workbench__empty">进入本页后将按需加载记忆过滤配置与聊天楼层。</div>`}

            <div class="stx-memory-filter__settings-row">
                <div class="stx-memory-filter__scope">
                    ${SCOPE_LABELS.map((item) => `
                        <label class="stx-memory-filter__scope-pill${scope[item.key] === false ? '' : ' is-on'}">
                            <input id="stx-memory-filter-scope-${escapeAttr(item.key)}" type="checkbox"${scope[item.key] === false ? '' : ' checked'}>
                            <span>${escapeHtml(item.label)}</span>
                        </label>
                    `).join('')}
                </div>
                <label class="stx-memory-filter__unknown">
                    <span>未知标签策略</span>
                    <select class="stx-memory-workbench__select" id="stx-memory-filter-unknown-policy">
                        <option value="memory"${unknownPolicy === 'memory' ? ' selected' : ''}>进入记忆</option>
                        <option value="context"${unknownPolicy === 'context' ? ' selected' : ''}>仅作参考</option>
                        <option value="excluded"${unknownPolicy === 'excluded' ? ' selected' : ''}>完全排除</option>
                    </select>
                </label>
            </div>

            <div class="stx-memory-filter__testbar">
                <select class="stx-memory-workbench__select" id="stx-memory-filter-preview-source-mode">
                    <option value="content"${legacyState.memoryFilterPreviewSourceMode === 'raw_visible_text' ? '' : ' selected'}>楼层内容</option>
                    <option value="raw_visible_text"${legacyState.memoryFilterPreviewSourceMode === 'raw_visible_text' ? ' selected' : ''}>可见文本</option>
                </select>
                <input class="stx-memory-workbench__input" id="stx-memory-filter-start-floor" type="number" min="1" placeholder="起始楼层" value="${escapeAttr(legacyState.memoryFilterStartFloor ?? '')}">
                <input class="stx-memory-workbench__input" id="stx-memory-filter-end-floor" type="number" min="1" placeholder="结束楼层" value="${escapeAttr(legacyState.memoryFilterEndFloor ?? '')}">
                <input class="stx-memory-workbench__input" id="stx-memory-filter-selected-floor" type="number" min="1" placeholder="测试楼层" value="${escapeAttr(legacyState.memoryFilterSelectedFloor ?? '')}">
                <button class="stx-memory-workbench__ghost-btn" data-action="memory-filter-preview-floor">测试过滤</button>
                <button class="stx-memory-workbench__ghost-btn" data-action="memory-filter-preview-range">范围预览</button>
                <button class="stx-memory-workbench__ghost-btn" data-action="memory-filter-refresh-preview">刷新</button>
            </div>

            <div class="stx-memory-filter__toolbar">
                ${Object.entries(MODE_LABELS).filter(([key]) => key !== 'jsonpath').map(([key, label]) => `
                    <button class="stx-memory-filter__mode${mode === key || (mode === 'jsonpath' && key === 'json') ? ' is-active' : ''}" data-action="memory-filter-set-mode" data-mode="${escapeAttr(key)}">${escapeHtml(label)}</button>
                `).join('')}
            </div>

            <div class="stx-memory-filter__grid">
                ${buildRuleColumn('进入记忆', memoryRules)}
                ${buildRuleColumn('仅作参考', contextRules)}
                ${buildRuleColumn('完全排除', excludedRules)}
            </div>

            <div class="stx-memory-filter__preview-grid">
                ${buildPreviewColumn('进入记忆', memoryText)}
                ${buildPreviewColumn('仅作参考', contextText)}
                ${buildPreviewColumn('完全排除', excludedText)}
            </div>

            <div class="stx-memory-filter__final">
                <div class="stx-memory-workbench__section-title">最终送模预览</div>
                <div class="stx-memory-filter__source-line">
                    ${availableFloors.length > 0 ? `可用楼层 ${escapeHtml(String(availableFloors[0]!.floor))}-${escapeHtml(String(availableFloors[availableFloors.length - 1]!.floor))}` : '暂无楼层快照'}
                </div>
                <pre>${escapeHtml(finalText || '点击测试过滤后，这里会显示 MemoryOS 最终读取的内容。')}</pre>
            </div>
        </section>
    `;
}

function buildRuleColumn(title: string, rules: Array<Record<string, unknown>>): string {
    return `
        <section class="stx-memory-filter__panel">
            <strong>${escapeHtml(title)}</strong>
            <div class="stx-memory-filter__rule-list">
                ${rules.length > 0 ? rules.map((rule) => `<span>${escapeHtml(String(rule.name ?? rule.label ?? rule.tagName ?? rule.id ?? '规则'))}</span>`).join('') : '<span>暂无规则</span>'}
            </div>
        </section>
    `;
}

function buildPreviewColumn(title: string, text: string): string {
    return `
        <section class="stx-memory-filter__panel">
            <strong>${escapeHtml(title)}</strong>
            <pre>${escapeHtml(text || '暂无内容')}</pre>
        </section>
    `;
}

function normalizeChannel(value: unknown): string {
    const channel = String(value ?? '').trim();
    if (channel === 'primary') return 'memory';
    if (channel === 'hint') return 'context';
    return channel;
}
