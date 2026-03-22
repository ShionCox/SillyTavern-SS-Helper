interface SharedWorldStateSectionTableRenderContext {
    buildTipAttr: (text: string) => string;
}

export interface SharedWorldStateSectionTypeTab {
    key: string;
    label: string;
    count: number;
    active: boolean;
}

export interface SharedWorldStateSectionColumn<T> {
    label: string;
    tip: string;
    width?: string;
    cellClassName?: string;
    render: (item: T) => string;
}

export interface SharedWorldStateSectionTableOptions<T> {
    sectionKey: string;
    title: string;
    description: string;
    iconClass: string;
    badgeText: string;
    badgeTip: string;
    rows: T[];
    rowKey: (item: T, index: number) => string;
    rowAttributes?: (item: T, index: number) => Record<string, string | number | boolean | null | undefined>;
    columns: SharedWorldStateSectionColumn<T>[];
    tableLimit?: number;
    typeTabs?: SharedWorldStateSectionTypeTab[];
    open?: boolean;
}

function escapeHtml(input: string): string {
    return String(input ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：把表格行属性对象转换为 HTML 属性字符串。
 * @param attributes 行属性对象。
 * @returns 可直接拼接到标签上的属性字符串。
 */
function buildAttributeHtml(
    attributes: Record<string, string | number | boolean | null | undefined> | null | undefined,
): string {
    if (!attributes) {
        return '';
    }
    return Object.entries(attributes)
        .map(([key, value]: [string, string | number | boolean | null | undefined]): string => {
            if (value == null || value === false) {
                return '';
            }
            if (value === true) {
                return ` ${escapeHtml(key)}`;
            }
            return ` ${escapeHtml(key)}="${escapeHtml(String(value))}"`;
        })
        .join('');
}

/**
 * 功能：渲染世界状态分区表格。
 * @param options 分区表格配置。
 * @param context 渲染上下文。
 * @returns 分区 HTML；无数据时返回空字符串。
 */
export function renderSharedWorldStateSectionTable<T>(
    options: SharedWorldStateSectionTableOptions<T>,
    context: SharedWorldStateSectionTableRenderContext,
): string {
    if (options.rows.length <= 0) {
        return '';
    }

    const headerHtml = options.columns.map((column: SharedWorldStateSectionColumn<T>, index: number): string => {
        const widthAttr = column.width ? ` style="width:${escapeHtml(column.width)};"` : '';
        const firstColumnPrefix = index === 0
            ? `<span class="stx-re-world-section-colhead-badge" aria-hidden="true"><em>${escapeHtml(options.badgeText)}</em></span>`
            : '';
        const sectionTitleAttr = index === 0 ? ` class="stx-re-world-section-colhead" data-world-section-title="${escapeHtml(options.title)}"` : '';
        return `<th${sectionTitleAttr}${widthAttr}${context.buildTipAttr(column.tip)}><span class="stx-re-world-section-colhead-content">${firstColumnPrefix}<span>${escapeHtml(column.label)}</span></span></th>`;
    }).join('');

    const bodyHtml = options.rows.map((item: T, index: number): string => {
        const cellsHtml = options.columns.map((column: SharedWorldStateSectionColumn<T>): string => `<td class="${escapeHtml(column.cellClassName || '')}">${column.render(item)}</td>`).join('');
        const extraAttributes = buildAttributeHtml(options.rowAttributes?.(item, index));
        return `<tr class="stx-re-row" data-world-row-key="${escapeHtml(options.rowKey(item, index))}"${extraAttributes}>${cellsHtml}</tr>`;
    }).join('');

    const tableLimit = Number.isFinite(options.tableLimit) && Number(options.tableLimit) > 0
        ? Math.floor(Number(options.tableLimit))
        : 10;

    const typeTabsHtml = Array.isArray(options.typeTabs) && options.typeTabs.length > 1
        ? `
            <div class="stx-re-world-section-tabs">
                <div class="stx-re-world-section-tab-list">
                    ${options.typeTabs.map((tab: SharedWorldStateSectionTypeTab): string => `
                        <button
                            type="button"
                            class="stx-re-btn stx-re-world-section-tab${tab.active ? ' is-active' : ''}"
                            data-world-section-type-tab
                            data-world-section-key="${escapeHtml(options.sectionKey)}"
                            data-world-section-type="${escapeHtml(tab.key)}"
                            ${context.buildTipAttr(`切换到 ${tab.label} 分类，当前共有 ${tab.count} 条。`)}
                        >
                            <span class="stx-re-world-section-tab-label">${escapeHtml(tab.label)}</span>
                            <span class="stx-re-world-section-tab-badge">${escapeHtml(String(tab.count))}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `
        : '';

    return `
        <details class="stx-re-world-section stx-re-world-section-collapsible" data-world-section-key="${escapeHtml(options.sectionKey)}" id="stx-re-world-section-${escapeHtml(options.sectionKey)}"${options.open ? ' open' : ''}>
            <summary class="stx-re-world-section-summary"${context.buildTipAttr(`点击展开或收起 ${options.title} 分区。`)}>
                <div class="stx-re-world-section-head">
                    <div>
                        <div class="stx-re-world-section-title"><span>${escapeHtml(options.title)}</span></div>
                        <div class="stx-re-world-section-sub">${escapeHtml(options.description)}</div>
                    </div>
                    <div class="stx-re-world-section-head-side">
                        <div class="stx-re-rpg-badge"${context.buildTipAttr(options.badgeTip)}>${escapeHtml(options.badgeText)}</div>
                        <div class="stx-re-world-section-toggle"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i><span>展开 / 收起</span></div>
                    </div>
                </div>
            </summary>
            <div class="stx-re-world-section-body">
                ${typeTabsHtml}
                <div class="stx-re-world-table-wrap" data-world-table-limit="${escapeHtml(String(tableLimit))}">
                    <table class="stx-re-table stx-re-world-table stx-re-world-table-compact">
                        <thead><tr>${headerHtml}</tr></thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
            </div>
        </details>
    `;
}
