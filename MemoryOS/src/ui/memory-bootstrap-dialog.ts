import { buildSharedBoxCheckbox, buildSharedBoxCheckboxStyles } from '../../../_Components/sharedBoxCheckbox';
import { openSharedDialog, type SharedDialogInstance } from '../../../_Components/sharedDialog';
import {
    listTavernActiveWorldbooksEvent,
    listTavernAvailableWorldbooksEvent,
    loadTavernWorldbookEntriesEvent,
    resolveTavernCharacterWorldbookBindingEvent,
    type SdkTavernResolvedWorldbookEntryEvent,
} from '../../../SDK/tavern';

const MEMORY_BOOTSTRAP_DIALOG_ID: string = 'stx-memory-bootstrap-dialog';
const MEMORY_BOOTSTRAP_DIALOG_STYLE_ID: string = 'stx-memory-bootstrap-dialog-style';
const MEMORY_BOOTSTRAP_CONFIRM_SELECTOR: string = '[data-memory-bootstrap-confirm="true"]';
const MEMORY_BOOTSTRAP_CANCEL_SELECTOR: string = '[data-memory-bootstrap-cancel="true"]';
const MEMORY_BOOTSTRAP_SUPPRESS_SELECTOR: string = '[data-memory-bootstrap-suppress="true"]';
const MEMORY_BOOTSTRAP_BOOK_SELECTOR: string = '[data-memory-bootstrap-book]';
const MEMORY_BOOTSTRAP_ENTRY_SELECTOR: string = '[data-memory-bootstrap-entry]';
const MEMORY_BOOTSTRAP_EXPAND_SELECTOR: string = '[data-memory-bootstrap-expand]';
const MEMORY_BOOTSTRAP_BOOKS_ROOT_ID: string = 'stx-memory-bootstrap-books';
const MEMORY_BOOTSTRAP_ENTRIES_ROOT_ID: string = 'stx-memory-bootstrap-entries';
const MEMORY_BOOTSTRAP_SUMMARY_ID: string = 'stx-memory-bootstrap-summary';
const MEMORY_BOOTSTRAP_BOOKS_SELECT_ALL_SELECTOR: string = '[data-memory-bootstrap-books-select-all]';
const MEMORY_BOOTSTRAP_BOOKS_CLEAR_ALL_SELECTOR: string = '[data-memory-bootstrap-books-clear-all]';
const MEMORY_BOOTSTRAP_ENTRIES_SELECT_ALL_SELECTOR: string = '[data-memory-bootstrap-entries-select-all]';
const MEMORY_BOOTSTRAP_ENTRIES_CLEAR_ALL_SELECTOR: string = '[data-memory-bootstrap-entries-clear-all]';

/**
 * 功能：定义冷启动世界书条目选项。
 */
interface MemoryBootstrapEntryOption {
    key: string;
    book: string;
    entryId: string;
    title: string;
    keywords: string[];
    contentPreview: string;
    contentFull: string;
}

/**
 * 功能：定义冷启动世界书选项。
 */
interface MemoryBootstrapBookOption {
    name: string;
    sourceTags: string[];
    entries: MemoryBootstrapEntryOption[];
}

/**
 * 功能：定义冷启动选择弹窗的数据载荷。
 */
interface MemoryBootstrapDialogData {
    books: MemoryBootstrapBookOption[];
    initialSelectedBooks: string[];
    initialSelectedEntryKeys: string[];
}

/**
 * 功能：定义冷启动弹窗返回结果。
 */
export interface MemoryBootstrapDialogResult {
    confirmed: boolean;
    suppressForChat: boolean;
    selectedWorldbooks: string[];
    selectedEntries: Array<{
        book: string;
        entryId: string;
    }>;
}

/**
 * 功能：构建世界书条目的唯一键。
 * @param book 世界书名。
 * @param entryId 条目 ID。
 * @returns 唯一键。
 */
function buildEntryKey(book: string, entryId: string): string {
    return `${String(book ?? '').trim()}::${String(entryId ?? '').trim()}`;
}

/**
 * 功能：对字符串数组去重并去空。
 * @param values 原始数组。
 * @returns 归一化数组。
 */
function dedupeStrings(values: string[]): string[] {
    const result: string[] = [];
    for (const value of values) {
        const normalized = String(value ?? '').trim();
        if (!normalized || result.includes(normalized)) {
            continue;
        }
        result.push(normalized);
    }
    return result;
}

/**
 * 功能：裁剪文本预览长度。
 * @param value 原始文本。
 * @param maxLength 最大长度。
 * @returns 裁剪后的文本。
 */
function truncateText(value: string, maxLength: number): string {
    const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return '';
    }
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

/**
 * 功能：转义 HTML 文本。
 * @param value 原始文本。
 * @returns 转义结果。
 */
function escapeHtml(value: string): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 功能：转义属性文本。
 * @param value 原始文本。
 * @returns 转义结果。
 */
function escapeAttr(value: string): string {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

/**
 * 功能：把任意文本转为安全的 DOM ID 片段。
 * @param value 原始文本。
 * @returns 安全片段。
 */
function toSafeDomIdFragment(value: string): string {
    const rawValue = String(value ?? '').trim();
    const normalized = rawValue.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (normalized) {
        return normalized;
    }
    const unicodeFallback = Array.from(rawValue)
        .map((char): string => {
            const codePoint = char.codePointAt(0);
            return typeof codePoint === 'number' ? codePoint.toString(16) : '0';
        })
        .join('-');
    return unicodeFallback || 'item';
}

/**
 * 功能：为弹窗中的复选框生成稳定且唯一的 DOM ID。
 * @param scope 当前复选框所属区域。
 * @param value 当前复选框关联的业务值。
 * @param index 当前复选框在区域内的顺序索引。
 * @returns 可安全用于 `label for` 绑定的唯一 ID。
 */
function buildMemoryBootstrapCheckboxId(scope: 'book' | 'entry', value: string, index: number): string {
    const normalizedIndex = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
    return `stx-memory-bootstrap-${scope}-${normalizedIndex}-${toSafeDomIdFragment(value)}`;
}

/**
 * 功能：确保冷启动确认框样式只注入一次。
 * @returns 无返回值。
 */
function ensureMemoryBootstrapDialogStyle(): void {
    const existingStyle = document.getElementById(MEMORY_BOOTSTRAP_DIALOG_STYLE_ID) as HTMLStyleElement | null;
    if (existingStyle) {
        return;
    }
    const style = document.createElement('style');
    style.id = MEMORY_BOOTSTRAP_DIALOG_STYLE_ID;
    style.textContent = `
        ${buildSharedBoxCheckboxStyles(`#${MEMORY_BOOTSTRAP_DIALOG_ID}`)}

        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog {
            display: flex;
            flex-direction: column;
            gap: 14px;
            min-width: min(860px, 100%);
            height: min(78vh, 900px);
            max-height: min(78vh, 900px);
            min-height: 0;
            overflow: hidden;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__lead {
            margin: 0;
            font-size: 14px;
            line-height: 1.7;
            color: inherit;
            opacity: 0.92;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__grid {
            display: grid;
            grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
            gap: 12px;
            align-items: stretch;
            flex: 1 1 auto;
            min-height: 0;
            overflow: hidden;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__panel {
            display: flex;
            flex-direction: column;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.16));
            border-radius: 12px;
            padding: 12px 14px;
            background: rgba(0, 0, 0, 0.16);
            min-height: 0;
            height: 100%;
            box-sizing: border-box;
            overflow: hidden;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__title {
            margin: 0 0 10px;
            font-size: 13px;
            font-weight: 700;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__summary {
            margin: 0;
            font-size: 12px;
            line-height: 1.6;
            opacity: 0.78;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            margin-bottom: 10px;
            flex-wrap: wrap;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__toolbar-actions {
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__toolbar-button {
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            min-height: 28px;
            padding: 0 12px;
            background: rgba(255, 255, 255, 0.05);
            color: inherit;
            cursor: pointer;
            font-size: 12px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__toolbar-button:hover {
            opacity: 0.94;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-list,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-groups {
            display: flex;
            flex-direction: column;
            gap: 10px;
            flex: 1 1 auto;
            min-height: 0;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-list {
            overflow: auto;
            padding-right: 2px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-groups {
            padding-right: 2px;
            overflow: auto;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-item,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-item {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.03);
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-item {
            flex: 0 0 auto;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-row,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-row {
            display: grid;
            grid-template-columns: 18px minmax(0, 1fr);
            gap: 10px;
            align-items: start;
            padding: 10px 12px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-main,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-main {
            min-width: 0;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-name,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-name {
            font-size: 13px;
            font-weight: 700;
            line-height: 1.5;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-meta,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-meta,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__empty {
            margin-top: 4px;
            font-size: 12px;
            line-height: 1.6;
            opacity: 0.74;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__book-label,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-label {
            display: block;
            cursor: pointer;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group {
            display: flex;
            flex-direction: column;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.02);
            flex: 0 0 auto;
            min-height: 120px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group.is-fill {
            flex: 0 0 auto;
            min-height: 100%;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group-header {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 10px;
            align-items: center;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group-title {
            font-size: 13px;
            font-weight: 700;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group-meta {
            margin-top: 4px;
            font-size: 12px;
            opacity: 0.72;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__expand {
            border: 1px solid rgba(255, 255, 255, 0.14);
            border-radius: 999px;
            min-height: 30px;
            padding: 0 12px;
            background: rgba(255, 255, 255, 0.06);
            color: inherit;
            cursor: pointer;
            font-size: 12px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group-body {
            display: none;
            flex-direction: column;
            gap: 8px;
            padding: 10px 12px 12px;
            max-height: 360px;
            min-height: 0;
            overflow: auto;
            box-sizing: border-box;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group.is-expanded .stx-memory-bootstrap-dialog__entry-group-body {
            display: flex;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-group.is-fill .stx-memory-bootstrap-dialog__entry-group-body {
            flex: 1 1 auto;
            min-height: 0;
            max-height: none;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-main {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-content {
            max-height: 180px;
            overflow: auto;
            padding-right: 4px;
            border-radius: 8px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__entry-content-text {
            margin: 0;
            font-size: 12px;
            line-height: 1.7;
            opacity: 0.78;
            white-space: pre-wrap;
            word-break: break-word;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 6px;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__tag {
            padding: 2px 7px;
            border-radius: 999px;
            background: rgba(197, 160, 89, 0.18);
            font-size: 11px;
            line-height: 1.4;
            opacity: 0.86;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__hint {
            margin: 0;
            font-size: 12px;
            line-height: 1.6;
            opacity: 0.72;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            flex-wrap: wrap;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__button {
            border: 1px solid var(--SmartThemeBorderColor, rgba(255, 255, 255, 0.2));
            border-radius: 10px;
            min-height: 38px;
            padding: 0 16px;
            color: inherit;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.08);
            transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease;
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__button:hover,
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__expand:hover {
            opacity: 0.94;
            transform: translateY(-1px);
        }
        #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__button--primary {
            background: linear-gradient(135deg, rgba(197, 160, 89, 0.92), rgba(157, 117, 42, 0.92));
            border-color: rgba(210, 176, 105, 0.92);
            color: #1f1608;
            font-weight: 700;
        }
        @media (max-width: 960px) {
            #${MEMORY_BOOTSTRAP_DIALOG_ID} .stx-memory-bootstrap-dialog__grid {
                grid-template-columns: minmax(0, 1fr);
            }
        }
    `;
    document.head.appendChild(style);
}

/**
 * 功能：加载冷启动世界书与条目数据。
 * @returns 弹窗所需的数据对象。
 */
async function loadMemoryBootstrapDialogData(): Promise<MemoryBootstrapDialogData> {
    const worldbookBinding = resolveTavernCharacterWorldbookBindingEvent(32);
    const activeWorldbooks = listTavernActiveWorldbooksEvent(64);
    const availableWorldbooks = listTavernAvailableWorldbooksEvent(64);
    const allBooks = dedupeStrings([
        ...activeWorldbooks,
        ...worldbookBinding.allBooks,
        ...availableWorldbooks,
    ]);
    const loadedEntries = await loadTavernWorldbookEntriesEvent(allBooks);
    const bindingSet = new Set(worldbookBinding.allBooks);
    const activeSet = new Set(activeWorldbooks);
    const entryMap = new Map<string, MemoryBootstrapEntryOption[]>();
    loadedEntries.forEach((entry: SdkTavernResolvedWorldbookEntryEvent): void => {
        const book = String(entry.book ?? '').trim();
        if (!book) {
            return;
        }
        const normalizedContent = String(entry.content ?? '').trim();
        const normalizedEntry: MemoryBootstrapEntryOption = {
            key: buildEntryKey(book, String(entry.entryId ?? '').trim()),
            book,
            entryId: String(entry.entryId ?? '').trim(),
            title: String(entry.entry ?? '').trim() || `条目 ${String(entry.entryId ?? '').trim()}`,
            keywords: dedupeStrings((entry.keywords ?? []).map((item): string => String(item))),
            contentPreview: truncateText(normalizedContent, 120),
            contentFull: normalizedContent,
        };
        const bucket = entryMap.get(book) ?? [];
        bucket.push(normalizedEntry);
        entryMap.set(book, bucket);
    });

    const books: MemoryBootstrapBookOption[] = allBooks.map((bookName: string): MemoryBootstrapBookOption => {
        const sourceTags: string[] = [];
        if (activeSet.has(bookName)) {
            sourceTags.push('当前聊天已启用');
        }
        if (bindingSet.has(bookName)) {
            sourceTags.push('角色绑定');
        }
        if (sourceTags.length <= 0) {
            sourceTags.push('可用世界书');
        }
        return {
            name: bookName,
            sourceTags,
            entries: (entryMap.get(bookName) ?? []).sort((left, right): number => {
                return left.title.localeCompare(right.title, 'zh-CN');
            }),
        };
    });

    const initialSelectedBooks = activeWorldbooks.length > 0
        ? dedupeStrings(activeWorldbooks)
        : dedupeStrings(worldbookBinding.allBooks.slice(0, 1));

    return {
        books,
        initialSelectedBooks,
        initialSelectedEntryKeys: [],
    };
}

/**
 * 功能：构建冷启动确认框主体骨架。
 * @returns 对话框内容 HTML。
 */
function buildMemoryBootstrapDialogShellHtml(): string {
    return `
        <div class="stx-memory-bootstrap-dialog">
            <p class="stx-memory-bootstrap-dialog__lead">
                当前聊天还没有建立初始记忆。请先选择要参与冷启动的世界书和条目，再执行结构化初始化。
            </p>
            <div id="${MEMORY_BOOTSTRAP_SUMMARY_ID}" class="stx-memory-bootstrap-dialog__summary"></div>
            <div class="stx-memory-bootstrap-dialog__grid">
                <section class="stx-memory-bootstrap-dialog__panel">
                    <div class="stx-memory-bootstrap-dialog__toolbar">
                        <p class="stx-memory-bootstrap-dialog__title">步骤 1：选择世界书</p>
                        <div class="stx-memory-bootstrap-dialog__toolbar-actions">
                            <button type="button" class="stx-memory-bootstrap-dialog__toolbar-button" data-memory-bootstrap-books-select-all="true">全选</button>
                            <button type="button" class="stx-memory-bootstrap-dialog__toolbar-button" data-memory-bootstrap-books-clear-all="true">取消全选</button>
                        </div>
                    </div>
                    <div id="${MEMORY_BOOTSTRAP_BOOKS_ROOT_ID}" class="stx-memory-bootstrap-dialog__book-list"></div>
                </section>
                <section class="stx-memory-bootstrap-dialog__panel">
                    <div class="stx-memory-bootstrap-dialog__toolbar">
                        <p class="stx-memory-bootstrap-dialog__title">步骤 2：展开并选择条目</p>
                        <div class="stx-memory-bootstrap-dialog__toolbar-actions">
                            <button type="button" class="stx-memory-bootstrap-dialog__toolbar-button" data-memory-bootstrap-entries-select-all="true">全选可见条目</button>
                            <button type="button" class="stx-memory-bootstrap-dialog__toolbar-button" data-memory-bootstrap-entries-clear-all="true">取消全选</button>
                        </div>
                    </div>
                    <div id="${MEMORY_BOOTSTRAP_ENTRIES_ROOT_ID}" class="stx-memory-bootstrap-dialog__entry-groups"></div>
                </section>
            </div>
            <p class="stx-memory-bootstrap-dialog__hint">
                默认只会按当前聊天的世界书状态初始化，不再自动把全部条目勾上。你可以按需展开查看并勾选。
            </p>
            <div class="stx-memory-bootstrap-dialog__actions">
                <button type="button" class="stx-memory-bootstrap-dialog__button" data-memory-bootstrap-cancel="true">暂不执行</button>
                <button type="button" class="stx-memory-bootstrap-dialog__button" data-memory-bootstrap-suppress="true">本聊天不再显示冷启动</button>
                <button type="button" class="stx-memory-bootstrap-dialog__button stx-memory-bootstrap-dialog__button--primary" data-memory-bootstrap-confirm="true">按当前选择执行冷启动</button>
            </div>
        </div>
    `;
}

/**
 * 功能：渲染世界书列表。
 * @param container 容器节点。
 * @param books 世界书选项。
 * @param selectedBooks 已选世界书集合。
 * @returns 无返回值。
 */
function renderBookList(
    container: HTMLElement,
    books: MemoryBootstrapBookOption[],
    selectedBooks: Set<string>,
): void {
    if (books.length <= 0) {
        container.innerHTML = '<div class="stx-memory-bootstrap-dialog__empty">当前没有可读取的世界书，冷启动将仅使用角色卡与聊天上下文。</div>';
        return;
    }
    container.innerHTML = books.map((book, bookIndex): string => {
        const checkboxId = buildMemoryBootstrapCheckboxId('book', book.name, bookIndex);
        const tags = book.sourceTags.map((tag): string => `<span class="stx-memory-bootstrap-dialog__tag">${escapeHtml(tag)}</span>`).join('');
        return `
            <div class="stx-memory-bootstrap-dialog__book-item">
                <div class="stx-memory-bootstrap-dialog__book-row">
                    ${buildSharedBoxCheckbox({
                        id: checkboxId,
                        appearance: 'check',
                        containerClassName: 'stx-memory-bootstrap-dialog__checkbox',
                        inputAttributes: {
                            'data-memory-bootstrap-book': book.name,
                            checked: selectedBooks.has(book.name),
                        },
                    })}
                    <label for="${checkboxId}" class="stx-memory-bootstrap-dialog__book-label">
                        <div class="stx-memory-bootstrap-dialog__book-main">
                            <div class="stx-memory-bootstrap-dialog__book-name">${escapeHtml(book.name)}</div>
                            <div class="stx-memory-bootstrap-dialog__book-meta">共 ${book.entries.length} 个可选条目</div>
                            <div class="stx-memory-bootstrap-dialog__tags">${tags}</div>
                        </div>
                    </label>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 功能：渲染条目列表。
 * @param container 容器节点。
 * @param books 世界书选项。
 * @param selectedBooks 已选世界书集合。
 * @param selectedEntryKeys 已选条目集合。
 * @param expandedBooks 已展开世界书集合。
 * @returns 无返回值。
 */
function renderEntryGroups(
    container: HTMLElement,
    books: MemoryBootstrapBookOption[],
    selectedBooks: Set<string>,
    selectedEntryKeys: Set<string>,
    expandedBooks: Set<string>,
): void {
    const visibleBooks = books.filter((book): boolean => selectedBooks.has(book.name));
    if (visibleBooks.length <= 0) {
        container.innerHTML = '<div class="stx-memory-bootstrap-dialog__empty">先在左侧勾选世界书，再按需展开对应条目进行选择。</div>';
        return;
    }
    container.innerHTML = visibleBooks.map((book): string => {
        const isExpanded = expandedBooks.has(book.name);
        if (book.entries.length <= 0) {
            return `
                <section class="stx-memory-bootstrap-dialog__entry-group">
                    <div class="stx-memory-bootstrap-dialog__entry-group-header">
                        <div>
                            <div class="stx-memory-bootstrap-dialog__entry-group-title">${escapeHtml(book.name)}</div>
                            <div class="stx-memory-bootstrap-dialog__entry-group-meta">暂无可解析条目</div>
                        </div>
                    </div>
                    <div class="stx-memory-bootstrap-dialog__entry-group-body" style="display:flex">
                        <div class="stx-memory-bootstrap-dialog__empty">这个世界书当前没有可用于冷启动的有效条目。</div>
                    </div>
                </section>
            `;
        }
        const bodyHtml = book.entries.map((entry, entryIndex): string => {
            const checkboxId = buildMemoryBootstrapCheckboxId('entry', entry.key, entryIndex);
            const keywordText = entry.keywords.length > 0 ? `关键词：${entry.keywords.join('、')}` : '未提供关键词';
            return `
                <div class="stx-memory-bootstrap-dialog__entry-item">
                    <div class="stx-memory-bootstrap-dialog__entry-row">
                        ${buildSharedBoxCheckbox({
                            id: checkboxId,
                            appearance: 'check',
                            containerClassName: 'stx-memory-bootstrap-dialog__checkbox',
                            inputAttributes: {
                                'data-memory-bootstrap-entry': entry.key,
                                checked: selectedEntryKeys.has(entry.key),
                            },
                        })}
                        <label for="${checkboxId}" class="stx-memory-bootstrap-dialog__entry-label">
                            <div class="stx-memory-bootstrap-dialog__entry-main">
                                <div class="stx-memory-bootstrap-dialog__entry-name">${escapeHtml(entry.title)}</div>
                                <div class="stx-memory-bootstrap-dialog__entry-meta">${escapeHtml(keywordText)}</div>
                                <div class="stx-memory-bootstrap-dialog__entry-meta">${escapeHtml(entry.contentPreview || '条目正文为空')}</div>
                                <div class="stx-memory-bootstrap-dialog__entry-content">
                                    <p class="stx-memory-bootstrap-dialog__entry-content-text">${escapeHtml(entry.contentFull || '条目正文为空')}</p>
                                </div>
                            </div>
                        </label>
                    </div>
                </div>
            `;
        }).join('');
        return `
            <section class="stx-memory-bootstrap-dialog__entry-group${isExpanded ? ' is-expanded' : ''}${isExpanded ? ' is-fill' : ''}">
                <div class="stx-memory-bootstrap-dialog__entry-group-header">
                    <div>
                        <div class="stx-memory-bootstrap-dialog__entry-group-title">${escapeHtml(book.name)}</div>
                        <div class="stx-memory-bootstrap-dialog__entry-group-meta">已选 ${book.entries.filter((entry): boolean => selectedEntryKeys.has(entry.key)).length} / ${book.entries.length}</div>
                    </div>
                    <button
                        type="button"
                        class="stx-memory-bootstrap-dialog__expand"
                        data-memory-bootstrap-expand="${escapeAttr(book.name)}"
                    >${isExpanded ? '收起条目' : '展开查看全部'}</button>
                </div>
                <div class="stx-memory-bootstrap-dialog__entry-group-body">
                    ${bodyHtml}
                </div>
            </section>
        `;
    }).join('');
}

/**
 * 功能：更新顶部摘要文字。
 * @param container 摘要容器。
 * @param books 世界书选项。
 * @param selectedBooks 已选世界书集合。
 * @param selectedEntryKeys 已选条目集合。
 * @returns 无返回值。
 */
function renderSelectionSummary(
    container: HTMLElement,
    books: MemoryBootstrapBookOption[],
    selectedBooks: Set<string>,
    selectedEntryKeys: Set<string>,
): void {
    const selectedBookCount = books.filter((book): boolean => selectedBooks.has(book.name)).length;
    const selectedEntryCount = books
        .filter((book): boolean => selectedBooks.has(book.name))
        .flatMap((book): MemoryBootstrapEntryOption[] => book.entries)
        .filter((entry): boolean => selectedEntryKeys.has(entry.key))
        .length;
    container.textContent = `当前已选择 ${selectedBookCount} 本世界书，${selectedEntryCount} 个条目。`;
}

/**
 * 功能：打开冷启动配置框并返回世界书选择结果。
 * @returns 用户最终的冷启动配置结果。
 */
export async function openMemoryBootstrapDialog(): Promise<MemoryBootstrapDialogResult> {
    ensureMemoryBootstrapDialogStyle();
    const dialogData = await loadMemoryBootstrapDialogData();
    return new Promise<MemoryBootstrapDialogResult>((resolve: (value: MemoryBootstrapDialogResult) => void): void => {
        let settled = false;
        let confirmed = false;
        let suppressForChat = false;
        const selectedBooks = new Set<string>(dialogData.initialSelectedBooks);
        const selectedEntryKeys = new Set<string>(dialogData.initialSelectedEntryKeys);
        const expandedBooks = new Set<string>();

        /**
         * 功能：按当前状态重新渲染弹窗内容。
         * @param instance 对话框实例。
         * @returns 无返回值。
         */
        const rerender = (instance: SharedDialogInstance): void => {
            const booksRoot = instance.content.querySelector(`#${MEMORY_BOOTSTRAP_BOOKS_ROOT_ID}`) as HTMLElement | null;
            const entriesRoot = instance.content.querySelector(`#${MEMORY_BOOTSTRAP_ENTRIES_ROOT_ID}`) as HTMLElement | null;
            const summaryRoot = instance.content.querySelector(`#${MEMORY_BOOTSTRAP_SUMMARY_ID}`) as HTMLElement | null;
            if (!booksRoot || !entriesRoot || !summaryRoot) {
                return;
            }
            const booksScrollTop = booksRoot.scrollTop;
            const entriesScrollTop = entriesRoot.scrollTop;
            renderBookList(booksRoot, dialogData.books, selectedBooks);
            renderEntryGroups(entriesRoot, dialogData.books, selectedBooks, selectedEntryKeys, expandedBooks);
            renderSelectionSummary(summaryRoot, dialogData.books, selectedBooks, selectedEntryKeys);
            booksRoot.scrollTop = booksScrollTop;
            entriesRoot.scrollTop = entriesScrollTop;

            booksRoot.querySelectorAll<HTMLInputElement>(MEMORY_BOOTSTRAP_BOOK_SELECTOR).forEach((input): void => {
                input.addEventListener('change', (): void => {
                    const bookName = String(input.dataset.memoryBootstrapBook ?? '').trim();
                    if (!bookName) {
                        return;
                    }
                    if (input.checked) {
                        selectedBooks.add(bookName);
                    } else {
                        selectedBooks.delete(bookName);
                        expandedBooks.delete(bookName);
                        dialogData.books
                            .find((item): boolean => item.name === bookName)
                            ?.entries.forEach((entry): void => {
                                selectedEntryKeys.delete(entry.key);
                            });
                    }
                    rerender(instance);
                });
            });

            entriesRoot.querySelectorAll<HTMLInputElement>(MEMORY_BOOTSTRAP_ENTRY_SELECTOR).forEach((input): void => {
                input.addEventListener('change', (): void => {
                    const entryKey = String(input.dataset.memoryBootstrapEntry ?? '').trim();
                    if (!entryKey) {
                        return;
                    }
                    if (input.checked) {
                        selectedEntryKeys.add(entryKey);
                    } else {
                        selectedEntryKeys.delete(entryKey);
                    }
                    renderSelectionSummary(summaryRoot, dialogData.books, selectedBooks, selectedEntryKeys);
                });
            });

            entriesRoot.querySelectorAll<HTMLButtonElement>(MEMORY_BOOTSTRAP_EXPAND_SELECTOR).forEach((button): void => {
                button.addEventListener('click', (): void => {
                    const bookName = String(button.dataset.memoryBootstrapExpand ?? '').trim();
                    if (!bookName) {
                        return;
                    }
                    if (expandedBooks.has(bookName)) {
                        expandedBooks.delete(bookName);
                    } else {
                        expandedBooks.add(bookName);
                    }
                    rerender(instance);
                });
            });

            instance.content.querySelectorAll<HTMLButtonElement>(MEMORY_BOOTSTRAP_BOOKS_SELECT_ALL_SELECTOR).forEach((button): void => {
                button.addEventListener('click', (): void => {
                    dialogData.books.forEach((book): void => {
                        selectedBooks.add(book.name);
                    });
                    rerender(instance);
                });
            });

            instance.content.querySelectorAll<HTMLButtonElement>(MEMORY_BOOTSTRAP_BOOKS_CLEAR_ALL_SELECTOR).forEach((button): void => {
                button.addEventListener('click', (): void => {
                    selectedBooks.clear();
                    selectedEntryKeys.clear();
                    expandedBooks.clear();
                    rerender(instance);
                });
            });

            instance.content.querySelectorAll<HTMLButtonElement>(MEMORY_BOOTSTRAP_ENTRIES_SELECT_ALL_SELECTOR).forEach((button): void => {
                button.addEventListener('click', (): void => {
                    dialogData.books
                        .filter((book): boolean => selectedBooks.has(book.name))
                        .forEach((book): void => {
                            book.entries.forEach((entry): void => {
                                selectedEntryKeys.add(entry.key);
                            });
                        });
                    rerender(instance);
                });
            });

            instance.content.querySelectorAll<HTMLButtonElement>(MEMORY_BOOTSTRAP_ENTRIES_CLEAR_ALL_SELECTOR).forEach((button): void => {
                button.addEventListener('click', (): void => {
                    dialogData.books
                        .filter((book): boolean => selectedBooks.has(book.name))
                        .forEach((book): void => {
                            book.entries.forEach((entry): void => {
                                selectedEntryKeys.delete(entry.key);
                            });
                        });
                    rerender(instance);
                });
            });
        };

        /**
         * 功能：结束确认流程并返回最终结果。
         * @returns 无返回值。
         */
        const settle = (): void => {
            if (settled) {
                return;
            }
            settled = true;
            const selectedEntries = dialogData.books
                .filter((book): boolean => selectedBooks.has(book.name))
                .flatMap((book): Array<{ book: string; entryId: string }> => {
                    return book.entries
                        .filter((entry): boolean => selectedEntryKeys.has(entry.key))
                        .map((entry) => ({
                            book: entry.book,
                            entryId: entry.entryId,
                        }));
                });
            resolve({
                confirmed,
                suppressForChat,
                selectedWorldbooks: dialogData.books
                    .map((book): string => book.name)
                    .filter((bookName): boolean => selectedBooks.has(bookName)),
                selectedEntries,
            });
        };

        openSharedDialog({
            id: MEMORY_BOOTSTRAP_DIALOG_ID,
            size: 'xl',
            layout: 'panel',
            bodyHtml: buildMemoryBootstrapDialogShellHtml(),
            chrome: {
                eyebrow: 'MemoryOS 冷启动',
                title: '为当前聊天建立初始记忆',
                description: '先选择需要参与冷启动的世界书与条目，再执行初始化。',
                iconClassName: 'fa-solid fa-snowflake',
                showCloseButton: true,
                closeButtonLabel: '关闭冷启动配置框',
            },
            ariaLabel: '冷启动配置框',
            initialFocusSelector: MEMORY_BOOTSTRAP_CONFIRM_SELECTOR,
            onMount: (instance: SharedDialogInstance): void => {
                rerender(instance);
                const confirmButton = instance.content.querySelector(MEMORY_BOOTSTRAP_CONFIRM_SELECTOR) as HTMLButtonElement | null;
                const cancelButton = instance.content.querySelector(MEMORY_BOOTSTRAP_CANCEL_SELECTOR) as HTMLButtonElement | null;
                const suppressButton = instance.content.querySelector(MEMORY_BOOTSTRAP_SUPPRESS_SELECTOR) as HTMLButtonElement | null;
                confirmButton?.addEventListener('click', (): void => {
                    confirmed = true;
                    void instance.close('button');
                });
                cancelButton?.addEventListener('click', (): void => {
                    confirmed = false;
                    void instance.close('button');
                });
                suppressButton?.addEventListener('click', (): void => {
                    confirmed = false;
                    suppressForChat = true;
                    void instance.close('button');
                });
            },
            onAfterClose: (): void => {
                settle();
            },
        });
    });
}
