import { buildSharedButton, buildSharedButtonStyles } from '../../../_Components/sharedButton';
import { buildSharedBoxCheckbox, buildSharedBoxCheckboxStyles } from '../../../_Components/sharedBoxCheckbox';
import { openSharedDialog } from '../../../_Components/sharedDialog';
import { buildSharedInputField, buildSharedInputStyles } from '../../../_Components/sharedInput';
import {
  getTavernWorldbookCapabilitiesEvent,
  listTavernActiveWorldbooksEvent,
  listTavernAvailableWorldbooksEvent,
  loadTavernWorldbookEntriesEvent,
  resolveTavernCharacterWorldbookBindingEvent,
  type SdkTavernCharacterWorldbookBindingEvent,
  type SdkTavernResolvedWorldbookEntryEvent,
  type SdkTavernWorldbookCapabilitiesEvent,
} from '../../../SDK/tavern';
import { buildThemeVars, initThemeKernel } from '../../../SDK/theme';
import type { ColdStartLorebookEntrySelection, ColdStartLorebookSelection } from '../types';

const OVERLAY_ID = 'stx-memory-worldbook-init-overlay';
const STYLE_ID = 'stx-memory-worldbook-init-overlay-style';
const SUMMARY_TITLE_ID = 'stx-memory-worldbook-init-summary-title';
const SUMMARY_COPY_ID = 'stx-memory-worldbook-init-summary-copy';
const SUMMARY_META_ID = 'stx-memory-worldbook-init-summary-meta';
const SOURCE_SWITCH_ID = 'stx-memory-worldbook-init-source-switch';
const SOURCE_META_ID = 'stx-memory-worldbook-init-source-meta';
const SEARCH_INPUT_ID = 'stx-memory-worldbook-init-search-input';
const CANDIDATE_LIST_ID = 'stx-memory-worldbook-init-candidate-list';
const SELECTION_PREVIEW_ID = 'stx-memory-worldbook-init-selection-preview';
const MANUAL_INPUT_ID = 'stx-memory-worldbook-init-manual-input';
const CONFIRM_BUTTON_ID = 'stx-memory-worldbook-init-confirm';
const CANCEL_BUTTON_ID = 'stx-memory-worldbook-init-cancel';
const SKIP_BUTTON_ID = 'stx-memory-worldbook-init-skip';

const CANDIDATE_NAME_LIMIT = 48;
const RESULT_BOOK_LIMIT = 32;
const RESULT_ENTRY_LIMIT = 256;
const ENTRY_BATCH_SIZE = 24;
const EMPTY_LOREBOOK_SELECTION: ColdStartLorebookSelection = { books: [], entries: [] };

type WorldbookSourceMode = 'all' | 'character';

interface LoadedWorldbookModel {
  entries: SdkTavernResolvedWorldbookEntryEvent[];
}

interface WorldbookPanelState {
  sourceMode: WorldbookSourceMode;
  searchText: string;
  availableNames: string[];
  activeNames: string[];
  characterBinding: SdkTavernCharacterWorldbookBindingEvent;
  capabilities: SdkTavernWorldbookCapabilitiesEvent;
  selectedBooks: Set<string>;
  selectedEntries: Map<string, ColdStartLorebookEntrySelection>;
  initialSelectedBooks: Set<string>;
  expandedBooks: Set<string>;
  expandedEntries: Set<string>;
  loadingBooks: Set<string>;
  loadedBooks: Map<string, LoadedWorldbookModel>;
  visibleEntryCounts: Map<string, number>;
  checkboxAnimations: Map<string, 'check-in' | 'check-out'>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateText(value: unknown, limit: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function truncatePreviewText(value: unknown, limit: number): string {
  const source = formatDisplayText(value);
  if (!source) {
    return '';
  }

  if (source.length <= limit) {
    return source;
  }

  return `${source.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function formatDisplayText(value: unknown): string {
  let source = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();

  if (!source) {
    return '';
  }

  if (!source.includes('\n')) {
    source = source
      .replace(/>\s*(#|[A-Za-z_])/g, '>\n$1')
      .replace(/\s+(#\s+)/g, '\n$1')
      .replace(/\s+(-\s+name:\s+)/g, '\n$1')
      .replace(/\s+([A-Za-z_][\w-]{2,}:\s+)/g, '\n$1');
  }

  return source.replace(/\n{3,}/g, '\n\n').trim();
}

function buildUniqueNames(values: Iterable<unknown>, limit: number): string[] {
  const uniqueNames = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized || uniqueNames.has(normalized)) {
      continue;
    }
    uniqueNames.add(normalized);
    if (uniqueNames.size >= limit) {
      break;
    }
  }
  return Array.from(uniqueNames);
}

function buildEntryKey(book: string, entryId: string): string {
  return `${normalizeText(book)}::${normalizeText(entryId)}`;
}

function buildBookCheckboxAnimationKey(book: string): string {
  return `book::${normalizeText(book)}`;
}

function buildEntryCheckboxAnimationKey(book: string, entryId: string): string {
  return `entry::${buildEntryKey(book, entryId)}`;
}

function splitManualNames(value: string): string[] {
  return buildUniqueNames(
    String(value ?? '')
      .split(/[\n,，;；]/g)
      .map((item: string): string => normalizeText(item))
      .filter(Boolean),
    RESULT_BOOK_LIMIT,
  );
}

function toEntrySelection(entry: SdkTavernResolvedWorldbookEntryEvent): ColdStartLorebookEntrySelection {
  return {
    book: normalizeText(entry.book),
    entryId: normalizeText(entry.entryId),
    entry: normalizeText(entry.entry) || '未命名条目',
    keywords: Array.from(new Set(entry.keywords.map((keyword: string): string => normalizeText(keyword)).filter(Boolean))).slice(0, 12),
  };
}

function normalizeSelection(selection?: ColdStartLorebookSelection): ColdStartLorebookSelection {
  const books = buildUniqueNames(selection?.books ?? [], RESULT_BOOK_LIMIT);
  const entries = new Map<string, ColdStartLorebookEntrySelection>();
  for (const item of selection?.entries ?? []) {
    const book = normalizeText(item.book);
    const entryId = normalizeText(item.entryId);
    if (!book || !entryId) {
      continue;
    }
    entries.set(buildEntryKey(book, entryId), {
      book,
      entryId,
      entry: normalizeText(item.entry) || '未命名条目',
      keywords: Array.from(new Set((item.keywords ?? []).map((keyword) => normalizeText(keyword)).filter(Boolean))).slice(0, 12),
    });
    if (entries.size >= RESULT_ENTRY_LIMIT) {
      break;
    }
  }
  return {
    books,
    entries: Array.from(entries.values()),
  };
}

function collectHostSelectedWorldbookNames(): string[] {
  return buildUniqueNames(listTavernActiveWorldbooksEvent(CANDIDATE_NAME_LIMIT), CANDIDATE_NAME_LIMIT);
}

function collectHostWorldbookNames(initialBooks: string[]): string[] {
  return buildUniqueNames(
    [...initialBooks, ...listTavernAvailableWorldbooksEvent(CANDIDATE_NAME_LIMIT)],
    CANDIDATE_NAME_LIMIT,
  );
}

function getSourceNames(state: WorldbookPanelState): string[] {
  return state.sourceMode === 'character' ? state.characterBinding.allBooks : state.availableNames;
}

function describeCharacterBindingSource(source: SdkTavernCharacterWorldbookBindingEvent['source']): string {
  if (source === 'character_extensions') {
    return '角色卡扩展字段';
  }
  if (source === 'host_world_info') {
    return '宿主世界书设置';
  }
  if (source === 'dom_selectors') {
    return '宿主界面解析';
  }
  return '未解析到绑定来源';
}

function buildBookTags(name: string, state: WorldbookPanelState): string[] {
  const tags: string[] = [];
  if (name === state.characterBinding.mainBook) {
    tags.push('角色主书');
  } else if (state.characterBinding.extraBooks.includes(name)) {
    tags.push('角色补充');
  }
  if (state.activeNames.includes(name)) {
    tags.push('宿主已激活');
  }
  if (state.initialSelectedBooks.has(name)) {
    tags.push('默认选择');
  }
  return tags;
}

function buildBookMeta(name: string, state: WorldbookPanelState): string {
  if (name === state.characterBinding.mainBook) {
    return '当前角色卡主世界书。';
  }
  if (state.characterBinding.extraBooks.includes(name)) {
    return '当前角色卡额外绑定世界书。';
  }
  if (state.activeNames.includes(name)) {
    return '宿主当前已激活，可直接整本载入。';
  }
  return '可整本载入，也可展开后只勾选部分条目。';
}

function matchesSearch(name: string, state: WorldbookPanelState): boolean {
  const query = normalizeText(state.searchText).toLowerCase();
  if (!query) {
    return true;
  }
  if (name.toLowerCase().includes(query)) {
    return true;
  }
  const loaded = state.loadedBooks.get(name);
  if (!loaded) {
    return false;
  }
  return loaded.entries.some((entry: SdkTavernResolvedWorldbookEntryEvent): boolean => {
    const haystack = [entry.entry, entry.keywords.join(' '), truncateText(entry.content, 180)].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function getVisibleBooks(state: WorldbookPanelState): string[] {
  return getSourceNames(state).filter((name: string): boolean => matchesSearch(name, state));
}

function buildSelectionResult(state: WorldbookPanelState, overlay: HTMLElement): ColdStartLorebookSelection {
  const manualInput = overlay.querySelector<HTMLTextAreaElement>(`#${MANUAL_INPUT_ID}`);
  const manualBooks = splitManualNames(manualInput?.value ?? '');
  const books = buildUniqueNames([...state.selectedBooks, ...manualBooks], RESULT_BOOK_LIMIT);
  const entries = Array.from(state.selectedEntries.values())
    .filter((item: ColdStartLorebookEntrySelection): boolean => !books.includes(item.book))
    .slice(0, RESULT_ENTRY_LIMIT);
  return {
    books,
    entries,
  };
}

function countSelectedEntriesForBook(bookName: string, state: WorldbookPanelState): number {
  let count = 0;
  for (const item of state.selectedEntries.values()) {
    if (item.book === bookName) {
      count += 1;
    }
  }
  return count;
}

function getCheckboxAnimationState(animationKey: string, state: WorldbookPanelState): 'check-in' | 'check-out' | undefined {
  return state.checkboxAnimations.get(animationKey);
}

function buildSelectionSummary(state: WorldbookPanelState, overlay: HTMLElement): { title: string; copy: string; meta: string } {
  const selection = buildSelectionResult(state, overlay);
  const bookCount = selection.books.length;
  const entryCount = selection.entries.length;
  const manualInput = overlay.querySelector<HTMLTextAreaElement>(`#${MANUAL_INPUT_ID}`);
  const manualCount = splitManualNames(manualInput?.value ?? '').length;

  if (bookCount === 0 && entryCount === 0) {
    return {
      title: '先选整本，或展开后只选关键条目',
      copy: '默认所有书卡都保持紧凑折叠。你可以从宿主全部世界书里挑整本，也可以只展开一本后勾选少量关键条目。',
      meta: '建议优先选 1 到 3 本整书，或 3 到 12 条最关键条目。',
    };
  }

  const previewBooks = selection.books.slice(0, 3).join('、');
  const previewEntries = selection.entries.slice(0, 3).map((item: ColdStartLorebookEntrySelection): string => `${item.book}/${item.entry}`).join('、');
  const parts: string[] = [];
  if (bookCount > 0) {
    parts.push(`整本 ${bookCount} 本`);
  }
  if (entryCount > 0) {
    parts.push(`单条 ${entryCount} 条`);
  }
  if (manualCount > 0) {
    parts.push(`手动补充 ${manualCount} 本`);
  }

  return {
    title: `当前已选择 ${parts.join('，')}`,
    copy: [previewBooks ? `整本：${previewBooks}` : '', previewEntries ? `条目：${previewEntries}` : ''].filter(Boolean).join(' · '),
    meta: '确认后，冷启动会按你当前选择真实读取世界书内容，而不是只记录书名。',
  };
}

function buildSourceMeta(state: WorldbookPanelState): string {
  if (state.sourceMode === 'character') {
    if (state.characterBinding.allBooks.length === 0) {
      return '当前角色没有解析到绑定世界书。你可以切回“宿主全部世界书”，或在右侧手动补充书名。';
    }
    const mainLabel = state.characterBinding.mainBook ? `主书：${state.characterBinding.mainBook}` : '没有主书';
    return `${mainLabel}，额外 ${state.characterBinding.extraBooks.length} 本，来源：${describeCharacterBindingSource(state.characterBinding.source)}。`;
  }
  return `宿主共读取到 ${state.availableNames.length} 本候选世界书，其中当前已激活 ${state.activeNames.length} 本。`;
}

function buildSourceSwitchMarkup(state: WorldbookPanelState): string {
  return [
    buildSharedButton({
      label: `宿主全部世界书 (${state.availableNames.length})`,
      variant: 'secondary',
      iconClassName: 'fa-solid fa-books',
      className: `stx-memory-worldbook-init-source${state.sourceMode === 'all' ? ' is-active' : ''}`,
      attributes: {
        'data-worldbook-source': 'all',
        'aria-pressed': state.sourceMode === 'all',
      },
    }),
    buildSharedButton({
      label: `角色卡世界书 (${state.characterBinding.allBooks.length})`,
      variant: 'secondary',
      iconClassName: 'fa-solid fa-id-card',
      className: `stx-memory-worldbook-init-source${state.sourceMode === 'character' ? ' is-active' : ''}`,
      attributes: {
        'data-worldbook-source': 'character',
        'aria-pressed': state.sourceMode === 'character',
      },
    }),
  ].join('');
}

function buildEntrySelectionPreview(entry: ColdStartLorebookEntrySelection): string {
  const keywordText = entry.keywords.slice(0, 3).join(' / ');
  return `
    <div class="stx-memory-worldbook-init-picked-item is-entry">
      <div class="stx-memory-worldbook-init-picked-title">${escapeHtml(`${entry.book} / ${entry.entry}`)}</div>
      ${keywordText ? `<div class="stx-memory-worldbook-init-picked-meta">${escapeHtml(keywordText)}</div>` : ''}
    </div>
  `;
}

function buildSelectionPreviewMarkup(state: WorldbookPanelState, overlay: HTMLElement): string {
  const selection = buildSelectionResult(state, overlay);
  if (selection.books.length === 0 && selection.entries.length === 0) {
    return '<div class="stx-memory-worldbook-init-empty">当前还没有任何载入项。先勾整本，或展开后勾单条。</div>';
  }
  return `
    <div class="stx-memory-worldbook-init-picked-list">
      ${selection.books.map((name: string): string => `
        <div class="stx-memory-worldbook-init-picked-item">
          <div class="stx-memory-worldbook-init-picked-title">${escapeHtml(name)}</div>
          <div class="stx-memory-worldbook-init-picked-meta">整本载入</div>
        </div>
      `).join('')}
      ${selection.entries.slice(0, 12).map(buildEntrySelectionPreview).join('')}
      ${selection.entries.length > 12 ? `<div class="stx-memory-worldbook-init-picked-overflow">另有 ${selection.entries.length - 12} 条单条选择已折叠显示。</div>` : ''}
    </div>
  `;
}

function buildEntryMarkup(bookName: string, entry: SdkTavernResolvedWorldbookEntryEvent, state: WorldbookPanelState): string {
  const key = buildEntryKey(entry.book, entry.entryId);
  const selected = state.selectedEntries.has(key);
  const expanded = state.expandedEntries.has(key);
  const bookSelected = state.selectedBooks.has(bookName);
  const keywords = entry.keywords.slice(0, 5);
  const preview = truncatePreviewText(entry.content, 160);
  const formattedContent = formatDisplayText(entry.content);
  const animationState = getCheckboxAnimationState(buildEntryCheckboxAnimationKey(entry.book, entry.entryId), state);

  return `
    <article class="stx-memory-worldbook-init-entry${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}">
      <div class="stx-memory-worldbook-init-entry-head">
        ${buildSharedBoxCheckbox({
          id: `stx-memory-worldbook-entry-${key}`,
          appearance: 'check',
          containerClassName: 'stx-memory-worldbook-init-check',
          attributes: {
            'data-anim-state': animationState,
          },
          inputAttributes: {
            'data-worldbook-entry-book': entry.book,
            'data-worldbook-entry-id': entry.entryId,
            checked: selected,
            disabled: bookSelected,
          },
        })}
        <button type="button" class="stx-memory-worldbook-init-entry-toggle" data-worldbook-entry-expand="${escapeAttr(key)}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="stx-memory-worldbook-init-entry-title-row">
            <span class="stx-memory-worldbook-init-entry-title">${escapeHtml(normalizeText(entry.entry) || '未命名条目')}</span>
            <span class="stx-memory-worldbook-init-entry-chevron"><i class="fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i></span>
          </span>
          ${expanded ? '' : `<span class="stx-memory-worldbook-init-entry-submeta">${escapeHtml(bookSelected ? '整本已选中，当前条目会自动一并载入。' : preview || '暂无正文摘要。')}</span>`}
          ${keywords.length > 0 ? `<span class="stx-memory-worldbook-init-entry-tags">${keywords.map((keyword: string): string => `<span class="stx-memory-worldbook-init-entry-tag">${escapeHtml(keyword)}</span>`).join('')}</span>` : ''}
        </button>
      </div>
      ${expanded ? `
        <div class="stx-memory-worldbook-init-entry-body">
          ${keywords.length > 0 ? `<div class="stx-memory-worldbook-init-entry-detail-line"><strong>关键词</strong><span>${escapeHtml(keywords.join(' / '))}</span></div>` : ''}
          <div class="stx-memory-worldbook-init-entry-detail-content">${escapeHtml(formattedContent || '暂无条目正文。')}</div>
        </div>
      ` : ''}
    </article>
  `;
}

function buildBookBodyMarkup(name: string, state: WorldbookPanelState): string {
  if (state.loadingBooks.has(name)) {
    return '<div class="stx-memory-worldbook-init-book-placeholder">正在读取这本世界书的条目列表…</div>';
  }
  const loaded = state.loadedBooks.get(name);
  if (!loaded) {
    return '<div class="stx-memory-worldbook-init-book-placeholder">展开后会在这里列出条目。条目默认只显示标题和摘要，点击后再展开正文细节。</div>';
  }
  if (loaded.entries.length === 0) {
    return state.capabilities.canLoadWorldbook
      ? '<div class="stx-memory-worldbook-init-book-placeholder">这本世界书没有可读取的有效条目。</div>'
      : '<div class="stx-memory-worldbook-init-book-placeholder">宿主当前没有开放世界书条目读取能力。</div>';
  }
  const visibleEntryCount = Math.min(
    Math.max(state.visibleEntryCounts.get(name) ?? ENTRY_BATCH_SIZE, ENTRY_BATCH_SIZE),
    loaded.entries.length,
  );
  const visibleEntries = loaded.entries.slice(0, visibleEntryCount);
  const remainingEntryCount = loaded.entries.length - visibleEntryCount;
  return `
    <div class="stx-memory-worldbook-init-book-body-head">
      <span>共 ${loaded.entries.length} 条。${state.selectedBooks.has(name) ? '当前整本已选。' : '可在下方逐条勾选。'}</span>
      <span>默认先显示前 ${visibleEntryCount} 条，避免一次性堆满。点击条目可展开正文，底部可继续加载更多。</span>
    </div>
    <div class="stx-memory-worldbook-init-entry-list">
      ${visibleEntries.map((entry: SdkTavernResolvedWorldbookEntryEvent): string => buildEntryMarkup(name, entry, state)).join('')}
      ${remainingEntryCount > 0 ? `
        <button type="button" class="stx-memory-worldbook-init-entry-more" data-worldbook-entry-more="${escapeAttr(name)}">
          继续显示 ${Math.min(ENTRY_BATCH_SIZE, remainingEntryCount)} 条，剩余 ${remainingEntryCount} 条
        </button>
      ` : ''}
    </div>
  `;
}

function buildBookCardMarkup(name: string, index: number, state: WorldbookPanelState): string {
  const expanded = state.expandedBooks.has(name);
  const selected = state.selectedBooks.has(name);
  const loaded = state.loadedBooks.get(name);
  const tags = buildBookTags(name, state);
  const selectedEntryCount = countSelectedEntriesForBook(name, state);
  const isPartiallySelected = selectedEntryCount > 0 && !selected;
  const partialTotalCount = loaded?.entries.length ?? selectedEntryCount;
  const partialPercent = partialTotalCount > 0
    ? Math.max(10, Math.min(100, Math.round((selectedEntryCount / partialTotalCount) * 100)))
    : 0;
  const animationState = getCheckboxAnimationState(buildBookCheckboxAnimationKey(name), state);
  const entryCountText = state.loadingBooks.has(name)
    ? '正在读取条目'
    : loaded
      ? `${loaded.entries.length} 条条目`
      : '未展开';

  return `
    <article class="stx-memory-worldbook-init-book${selected ? ' is-selected' : ''}${expanded ? ' is-expanded' : ''}${isPartiallySelected ? ' is-partial' : ''}">
      <div class="stx-memory-worldbook-init-book-head">
        ${buildSharedBoxCheckbox({
          id: `stx-memory-worldbook-book-${index}`,
          appearance: 'check',
          containerClassName: 'stx-memory-worldbook-init-check',
          attributes: {
            'data-anim-state': animationState,
          },
          inputAttributes: {
            'data-worldbook-book': name,
            checked: selected,
          },
        })}
        <button type="button" class="stx-memory-worldbook-init-book-main" data-worldbook-book-expand="${escapeAttr(name)}" aria-expanded="${expanded ? 'true' : 'false'}">
          <span class="stx-memory-worldbook-init-book-topline">
            <span class="stx-memory-worldbook-init-book-title">${escapeHtml(name)}</span>
            <span class="stx-memory-worldbook-init-book-metrics">
              <span class="stx-memory-worldbook-init-book-metric">${escapeHtml(entryCountText)}</span>
              ${selectedEntryCount > 0 && !selected ? `<span class="stx-memory-worldbook-init-book-metric is-accent">已选 ${selectedEntryCount} 条</span>` : ''}
              <span class="stx-memory-worldbook-init-book-chevron"><i class="fa-solid ${expanded ? 'fa-chevron-up' : 'fa-chevron-down'}"></i></span>
            </span>
          </span>
          <span class="stx-memory-worldbook-init-book-meta">${escapeHtml(buildBookMeta(name, state))}</span>
          ${tags.length > 0 ? `<span class="stx-memory-worldbook-init-book-tags">${tags.map((tag: string): string => `<span class="stx-memory-worldbook-init-book-tag">${escapeHtml(tag)}</span>`).join('')}</span>` : ''}
          ${isPartiallySelected ? `
            <span class="stx-memory-worldbook-init-book-partial" aria-label="当前已选择 ${selectedEntryCount} 条条目">
              <span class="stx-memory-worldbook-init-book-partial-track" aria-hidden="true">
                <span class="stx-memory-worldbook-init-book-partial-fill" style="width:${partialPercent}%"></span>
              </span>
              <span class="stx-memory-worldbook-init-book-partial-text">已选择部分条目 ${selectedEntryCount}${loaded ? ` / ${loaded.entries.length}` : ''}</span>
            </span>
          ` : ''}
        </button>
      </div>
      ${expanded ? `<div class="stx-memory-worldbook-init-book-body">${buildBookBodyMarkup(name, state)}</div>` : ''}
    </article>
  `;
}

function buildCandidateListMarkup(state: WorldbookPanelState): string {
  const visibleBooks = getVisibleBooks(state);
  if (getSourceNames(state).length === 0) {
    return state.sourceMode === 'character'
      ? '<div class="stx-memory-worldbook-init-empty">当前角色还没有绑定世界书。你可以切回宿主全部列表，或者在右侧手动补充书名。</div>'
      : '<div class="stx-memory-worldbook-init-empty">当前没有从宿主读取到可用世界书列表。</div>';
  }
  if (visibleBooks.length === 0) {
    return '<div class="stx-memory-worldbook-init-empty">没有匹配当前筛选条件的世界书。你可以清空搜索，或切换来源。</div>';
  }
  return `<div class="stx-memory-worldbook-init-book-list">${visibleBooks.map((name: string, index: number): string => buildBookCardMarkup(name, index, state)).join('')}</div>`;
}

function ensureWorldbookInitStyles(): void {
  const styleText = `
    ${buildThemeVars('.stx-memory-worldbook-init-overlay')}
    ${buildSharedBoxCheckboxStyles('.stx-memory-worldbook-init-overlay')}
    ${buildSharedButtonStyles('.stx-memory-worldbook-init-overlay')}
    ${buildSharedInputStyles('.stx-memory-worldbook-init-overlay')}

    .stx-memory-worldbook-init-overlay {
      padding: 18px;
      color: var(--ss-theme-text, #ececec);
      background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.06), transparent 40%),
        color-mix(in srgb, var(--ss-theme-backdrop, rgba(10, 10, 12, 0.86)) 36%, transparent);
      backdrop-filter: blur(14px) saturate(116%);
      -webkit-backdrop-filter: blur(14px) saturate(116%);
    }

    .stx-memory-worldbook-init-overlay .stx-shared-dialog-backdrop {
      background:
        radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%),
        color-mix(in srgb, var(--ss-theme-backdrop, rgba(10, 10, 12, 0.82)) 56%, transparent) !important;
      backdrop-filter: blur(16px) saturate(120%) !important;
      -webkit-backdrop-filter: blur(16px) saturate(120%) !important;
    }

    .stx-memory-worldbook-init-overlay .stx-shared-dialog-surface.stx-memory-worldbook-init-dialog,
    .stx-memory-worldbook-init-overlay .stx-shared-dialog-surface.stx-memory-worldbook-init-dialog[data-stx-dialog-layout="bare"] {
      width: min(1120px, 100%);
      max-height: min(92vh, 980px);
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      border-radius: 24px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.16)) 92%, transparent);
      background:
        radial-gradient(circle at top left, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 11%, transparent) 0%, transparent 34%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-panel-bg, rgba(18, 18, 22, 0.96)) 100%, black 0%), color-mix(in srgb, var(--ss-theme-surface-2, rgba(11, 11, 15, 0.96)) 100%, black 0%));
      box-shadow: var(--ss-theme-panel-shadow, 0 26px 70px rgba(0, 0, 0, 0.72));
    }

    .stx-memory-worldbook-init-head {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 18px 22px 14px;
      border-bottom: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 90%, transparent);
    }

    .stx-memory-worldbook-init-eyebrow {
      font-size: 11px;
      line-height: 1.2;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 60%, transparent);
    }

    .stx-memory-worldbook-init-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 26px;
      line-height: 1.12;
      font-weight: 900;
      min-width: 0;
    }

    .stx-memory-worldbook-init-title i {
      color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 86%, white 14%);
    }

    .stx-memory-worldbook-init-copy {
      font-size: 13px;
      line-height: 1.58;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 76%, transparent);
      max-width: 78ch;
    }

    .stx-memory-worldbook-init-body {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px 22px 20px;
      overflow: auto;
      overflow-x: hidden;
    }

    .stx-memory-worldbook-init-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 14px;
      align-items: center;
      padding: 14px 16px;
      border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 14%, transparent), transparent 42%),
        color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.05)) 100%, transparent);
    }

    .stx-memory-worldbook-init-summary-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stx-memory-worldbook-init-summary strong {
      font-size: 14px;
      line-height: 1.45;
      color: var(--ss-theme-text, #fff);
    }

    .stx-memory-worldbook-init-summary span {
      font-size: 12px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 76%, transparent);
    }

    .stx-memory-worldbook-init-summary-meta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.04)) 100%, transparent);
      font-size: 11px;
      line-height: 1.4;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 80%, transparent);
      text-align: center;
    }

    .stx-memory-worldbook-init-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
      gap: 12px;
      align-items: stretch;
    }

    .stx-memory-worldbook-init-toolbar-card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.05)) 100%, transparent);
    }

    .stx-memory-worldbook-init-label {
      font-size: 12px;
      line-height: 1.45;
      font-weight: 800;
      color: var(--ss-theme-text, #fff);
    }

    .stx-memory-worldbook-init-note {
      font-size: 12px;
      line-height: 1.52;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 72%, transparent);
    }

    .stx-memory-worldbook-init-source-switch {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }

    .stx-memory-worldbook-init-source-switch .stx-shared-button {
      flex: 1 1 220px;
      justify-content: center;
      min-width: 0;
    }

    .stx-memory-worldbook-init-source.is-active {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 54%, transparent) !important;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent) !important;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 20%, transparent) inset;
      color: var(--ss-theme-text, #fff) !important;
    }

    .stx-memory-worldbook-init-search {
      width: 100%;
      min-height: 40px;
    }

    .stx-memory-worldbook-init-stage {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
      gap: 14px;
      align-items: start;
      min-height: 0;
    }

    .stx-memory-worldbook-init-list-panel,
    .stx-memory-worldbook-init-sidepanel {
      min-width: 0;
      border-radius: 18px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.04)) 100%, transparent);
    }

    .stx-memory-worldbook-init-list-panel {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    .stx-memory-worldbook-init-sidepanel {
      position: sticky;
      top: 0;
      align-self: start;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .stx-memory-worldbook-init-book-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-worldbook-init-book {
      border-radius: 16px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      background: linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent));
      overflow: hidden;
    }

    .stx-memory-worldbook-init-book.is-selected {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 48%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent) inset;
    }

    .stx-memory-worldbook-init-book.is-partial {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 30%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent) inset;
    }

    .stx-memory-worldbook-init-book.is-expanded {
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 10%, transparent), transparent 32%),
        linear-gradient(180deg, color-mix(in srgb, var(--ss-theme-surface-2, rgba(255,255,255,0.06)) 100%, transparent), color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent));
    }

    .stx-memory-worldbook-init-book-head,
    .stx-memory-worldbook-init-entry-head {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-worldbook-init-book-head {
      padding: 12px;
    }

    .stx-memory-worldbook-init-check {
      margin-top: 2px;
      flex: 0 0 auto;
      --stx-box-checkbox-size: 18px;
      --stx-box-checkbox-radius: 6px;
      --stx-box-checkbox-border: color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.22)) 92%, transparent);
      --stx-box-checkbox-bg: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.04)) 100%, transparent);
      --stx-box-checkbox-hover-border: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 72%, #fff 10%);
      --stx-box-checkbox-focus-ring: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
      --stx-box-checkbox-checked-border: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 62%, transparent);
      --stx-box-checkbox-checked-bg: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
      --stx-box-checkbox-indicator: var(--ss-theme-text, #fff);
    }

    .stx-memory-worldbook-init-book-main:focus-visible,
    .stx-memory-worldbook-init-entry-toggle:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 54%, transparent);
      outline-offset: 2px;
    }

    .stx-memory-worldbook-init-book-main,
    .stx-memory-worldbook-init-entry-toggle {
      width: 100%;
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      line-height: inherit;
      white-space: normal;
      appearance: none;
      -webkit-appearance: none;
      text-align: left;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .stx-memory-worldbook-init-book-topline,
    .stx-memory-worldbook-init-entry-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      min-width: 0;
    }

    .stx-memory-worldbook-init-book-title,
    .stx-memory-worldbook-init-entry-title {
      min-width: 0;
      flex: 1 1 220px;
      font-size: 14px;
      line-height: 1.38;
      font-weight: 800;
      color: var(--ss-theme-text, #fff);
      word-break: break-word;
    }

    .stx-memory-worldbook-init-entry-title {
      font-size: 13px;
    }

    .stx-memory-worldbook-init-entry-toggle {
      flex: 1 1 auto;
    }

    .stx-memory-worldbook-init-book-metrics {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      flex: 0 1 auto;
      max-width: 100%;
      flex-wrap: wrap;
      gap: 6px;
    }

    .stx-memory-worldbook-init-book-metric {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.04)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      font-size: 10px;
      line-height: 1.35;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 76%, transparent);
    }

    .stx-memory-worldbook-init-book-metric.is-accent {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 30%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 92%, transparent);
    }

    .stx-memory-worldbook-init-book-chevron,
    .stx-memory-worldbook-init-entry-chevron {
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 58%, transparent);
      font-size: 12px;
      flex: 0 0 auto;
    }

    .stx-memory-worldbook-init-book-meta,
    .stx-memory-worldbook-init-entry-submeta,
    .stx-memory-worldbook-init-book-body-head,
    .stx-memory-worldbook-init-picked-meta,
    .stx-memory-worldbook-init-picked-overflow {
      font-size: 12px;
      line-height: 1.55;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 72%, transparent);
      word-break: break-word;
    }

    .stx-memory-worldbook-init-entry-submeta {
      white-space: pre-wrap;
      display: block;
      max-height: 9.6em;
      overflow: auto;
      padding-right: 4px;
    }

    .stx-memory-worldbook-init-book-tags,
    .stx-memory-worldbook-init-entry-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .stx-memory-worldbook-init-book-partial {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding-top: 2px;
    }

    .stx-memory-worldbook-init-book-partial-track {
      position: relative;
      display: block;
      width: 100%;
      height: 6px;
      border-radius: 999px;
      overflow: hidden;
      background: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.05)) 100%, transparent);
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
    }

    .stx-memory-worldbook-init-book-partial-fill {
      display: block;
      height: 100%;
      min-width: 12px;
      border-radius: inherit;
      background: linear-gradient(90deg, color-mix(in srgb, var(--ss-theme-accent, #c5a059) 72%, transparent), color-mix(in srgb, var(--ss-theme-accent, #c5a059) 28%, white 16%));
    }

    .stx-memory-worldbook-init-book-partial-text {
      font-size: 11px;
      line-height: 1.45;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 74%, transparent);
    }

    .stx-memory-worldbook-init-book-tag,
    .stx-memory-worldbook-init-entry-tag {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 24%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
      font-size: 10px;
      line-height: 1.35;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 86%, transparent);
    }

    .stx-memory-worldbook-init-book-body {
      padding: 0 12px 12px 42px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .stx-memory-worldbook-init-book-body-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 4px;
      padding: 0 0 2px;
    }

    .stx-memory-worldbook-init-book-body-head > span:last-child {
      font-size: 11px;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 62%, transparent);
    }

    .stx-memory-worldbook-init-entry-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 2px;
    }

    .stx-memory-worldbook-init-entry {
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.03)) 100%, transparent);
      overflow: hidden;
    }

    .stx-memory-worldbook-init-entry.is-selected {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 38%, transparent);
    }

    .stx-memory-worldbook-init-entry-head {
      padding: 10px;
    }

    .stx-memory-worldbook-init-entry-more {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 38px;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px dashed color-mix(in srgb, var(--ss-theme-accent, #c5a059) 32%, transparent);
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 8%, transparent);
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 88%, transparent);
      font: inherit;
      font-size: 12px;
      line-height: 1.45;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;
    }

    .stx-memory-worldbook-init-entry-more:hover {
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 12%, transparent);
    }

    .stx-memory-worldbook-init-entry-more:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--ss-theme-accent, #c5a059) 54%, transparent);
      outline-offset: 2px;
    }

    .stx-memory-worldbook-init-entry-body {
      padding: 0 10px 10px 38px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stx-memory-worldbook-init-entry-detail-line {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      font-size: 11px;
      line-height: 1.5;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 74%, transparent);
    }

    .stx-memory-worldbook-init-entry-detail-line strong {
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 90%, transparent);
      font-weight: 700;
    }

    .stx-memory-worldbook-init-entry-detail-content {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.1)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent);
      font-size: 12px;
      line-height: 1.65;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 82%, transparent);
      max-height: min(320px, 42vh);
      overflow: auto;
      padding-right: 8px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .stx-memory-worldbook-init-book-placeholder,
    .stx-memory-worldbook-init-empty {
      padding: 12px;
      border-radius: 12px;
      border: 1px dashed color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.14)) 90%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-3, rgba(255,255,255,0.03)) 100%, transparent);
      font-size: 12px;
      line-height: 1.6;
      color: color-mix(in srgb, var(--ss-theme-text, #fff) 74%, transparent);
    }

    .stx-memory-worldbook-init-picked-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .stx-memory-worldbook-init-picked-item {
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid color-mix(in srgb, var(--ss-theme-border, rgba(255,255,255,0.12)) 92%, transparent);
      background: color-mix(in srgb, var(--ss-theme-surface-1, rgba(255,255,255,0.03)) 100%, transparent);
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .stx-memory-worldbook-init-picked-item.is-entry {
      border-color: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 18%, transparent);
    }

    .stx-memory-worldbook-init-picked-title {
      font-size: 12px;
      line-height: 1.45;
      font-weight: 700;
      color: var(--ss-theme-text, #fff);
      word-break: break-word;
    }

    .stx-memory-worldbook-init-manual {
      min-height: 112px;
      resize: vertical;
      width: 100%;
    }

    .stx-memory-worldbook-init-foot {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 10px;
      padding: 0 22px 22px;
    }

    .stx-memory-worldbook-init-entry-list::-webkit-scrollbar,
    .stx-memory-worldbook-init-picked-list::-webkit-scrollbar,
    .stx-memory-worldbook-init-entry-detail-content::-webkit-scrollbar,
    .stx-memory-worldbook-init-entry-submeta::-webkit-scrollbar,
    .stx-memory-worldbook-init-sidepanel::-webkit-scrollbar,
    .stx-memory-worldbook-init-body::-webkit-scrollbar {
      width: 10px;
    }

    .stx-memory-worldbook-init-entry-list::-webkit-scrollbar-thumb,
    .stx-memory-worldbook-init-picked-list::-webkit-scrollbar-thumb,
    .stx-memory-worldbook-init-entry-detail-content::-webkit-scrollbar-thumb,
    .stx-memory-worldbook-init-entry-submeta::-webkit-scrollbar-thumb,
    .stx-memory-worldbook-init-sidepanel::-webkit-scrollbar-thumb,
    .stx-memory-worldbook-init-body::-webkit-scrollbar-thumb {
      border-radius: 999px;
      background: color-mix(in srgb, var(--ss-theme-accent, #c5a059) 42%, transparent);
    }

    @media (max-width: 1180px) {
      .stx-memory-worldbook-init-stage,
      .stx-memory-worldbook-init-summary {
        grid-template-columns: 1fr;
      }

      .stx-memory-worldbook-init-sidepanel {
        position: static;
      }
    }

    @media (max-width: 980px) {
      .stx-memory-worldbook-init-toolbar {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 760px) {
      .stx-memory-worldbook-init-overlay {
        padding: 12px;
      }

      .stx-memory-worldbook-init-head,
      .stx-memory-worldbook-init-body,
      .stx-memory-worldbook-init-foot {
        padding-left: 14px;
        padding-right: 14px;
      }

      .stx-memory-worldbook-init-title {
        font-size: 22px;
      }

      .stx-memory-worldbook-init-foot {
        flex-direction: column-reverse;
        align-items: stretch;
      }

      .stx-memory-worldbook-init-foot .stx-shared-button,
      .stx-memory-worldbook-init-source-switch .stx-shared-button {
        width: 100%;
      }

      .stx-memory-worldbook-init-book-body {
        padding-left: 12px;
      }

      .stx-memory-worldbook-init-entry-body {
        padding-left: 10px;
      }

      .stx-memory-worldbook-init-book-body-head {
        flex-direction: column;
      }

      .stx-memory-worldbook-init-book-metrics {
        justify-content: flex-start;
      }
    }
  `;

  const existing = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (existing) {
    if (existing.textContent !== styleText) {
      existing.textContent = styleText;
    }
    return;
  }

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = styleText;
  document.head.appendChild(style);
}

function buildDialogContentMarkup(manualDefault: string): string {
  return `
    <div class="stx-memory-worldbook-init-head">
      <div class="stx-memory-worldbook-init-eyebrow">冷启动初始化</div>
      <div class="stx-memory-worldbook-init-title">
        <i class="fa-solid fa-books" aria-hidden="true"></i>
        <span>选择要带入初始化分析的世界书</span>
      </div>
      <div class="stx-memory-worldbook-init-copy">现在支持两层粒度：你可以直接勾整本世界书，也可以先展开某一本，再只勾选关键条目。条目默认保持折叠，只有你点开时才显示正文细节。</div>
    </div>
    <div class="stx-memory-worldbook-init-body">
      <section class="stx-memory-worldbook-init-summary">
        <div class="stx-memory-worldbook-init-summary-main">
          <strong id="${SUMMARY_TITLE_ID}">先选整本，或展开后只选关键条目</strong>
          <span id="${SUMMARY_COPY_ID}">默认所有书卡和条目都保持紧凑折叠。</span>
        </div>
        <div id="${SUMMARY_META_ID}" class="stx-memory-worldbook-init-summary-meta">确认后会真实读取所选条目</div>
      </section>

      <section class="stx-memory-worldbook-init-toolbar">
        <div class="stx-memory-worldbook-init-toolbar-card">
          <div class="stx-memory-worldbook-init-label">来源切换</div>
          <div class="stx-memory-worldbook-init-note">可在宿主全部世界书和当前角色卡绑定世界书之间切换。</div>
          <div id="${SOURCE_SWITCH_ID}" class="stx-memory-worldbook-init-source-switch"></div>
          <div id="${SOURCE_META_ID}" class="stx-memory-worldbook-init-note"></div>
        </div>
        <div class="stx-memory-worldbook-init-toolbar-card">
          <div class="stx-memory-worldbook-init-label">快速筛选</div>
          <div class="stx-memory-worldbook-init-note">按书名筛选；如果某本已经展开并读取过，也会匹配条目标题和关键词。</div>
          ${buildSharedInputField({
            id: SEARCH_INPUT_ID,
            type: 'search',
            value: '',
            className: 'stx-memory-worldbook-init-search',
            attributes: {
              placeholder: '搜索世界书或已加载条目',
            },
          })}
        </div>
      </section>

      <section class="stx-memory-worldbook-init-stage">
        <div class="stx-memory-worldbook-init-list-panel">
          <div class="stx-memory-worldbook-init-label">候选世界书</div>
          <div class="stx-memory-worldbook-init-note">勾选左侧复选框表示整本载入。点击书卡后展开条目列表，再勾选单条。单条选择只在未勾整本时生效。</div>
          <div id="${CANDIDATE_LIST_ID}"></div>
        </div>

        <aside class="stx-memory-worldbook-init-sidepanel">
          <div>
            <div class="stx-memory-worldbook-init-label">当前载入结果</div>
            <div class="stx-memory-worldbook-init-note">这里会实时汇总整本选择、单条选择和手动补充的书名。</div>
          </div>
          <div id="${SELECTION_PREVIEW_ID}"></div>

          <div>
            <div class="stx-memory-worldbook-init-label">手动补充书名</div>
            <div class="stx-memory-worldbook-init-note">宿主列表里没有的书，可以直接在这里补充。返回时仍按整本处理。</div>
          </div>
          ${buildSharedInputField({
            id: MANUAL_INPUT_ID,
            tag: 'textarea',
            value: manualDefault,
            className: 'stx-memory-worldbook-init-manual',
            attributes: {
              placeholder: '例如：主设定总览\n城市百科\n阵营补充设定',
              rows: 6,
            },
          })}
          <div class="stx-memory-worldbook-init-note">如果你只想手动补整本书名，不需要在左侧展开条目。</div>
        </aside>
      </section>
    </div>

    <div class="stx-memory-worldbook-init-foot">
      ${buildSharedButton({
        id: CANCEL_BUTTON_ID,
        label: '关闭',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-xmark',
      })}
      ${buildSharedButton({
        id: SKIP_BUTTON_ID,
        label: '跳过世界书初始化',
        variant: 'secondary',
        iconClassName: 'fa-solid fa-forward',
      })}
      ${buildSharedButton({
        id: CONFIRM_BUTTON_ID,
        label: '按当前选择开始初始化',
        iconClassName: 'fa-solid fa-wand-magic-sparkles',
      })}
    </div>
  `;
}

function renderSourceSection(overlay: HTMLElement, state: WorldbookPanelState): void {
  const sourceSwitch = overlay.querySelector<HTMLElement>(`#${SOURCE_SWITCH_ID}`);
  const sourceMeta = overlay.querySelector<HTMLElement>(`#${SOURCE_META_ID}`);
  if (sourceSwitch) {
    sourceSwitch.innerHTML = buildSourceSwitchMarkup(state);
  }
  if (sourceMeta) {
    sourceMeta.textContent = buildSourceMeta(state);
  }
}

function renderSelectionSummary(overlay: HTMLElement, state: WorldbookPanelState): void {
  const title = overlay.querySelector<HTMLElement>(`#${SUMMARY_TITLE_ID}`);
  const copy = overlay.querySelector<HTMLElement>(`#${SUMMARY_COPY_ID}`);
  const meta = overlay.querySelector<HTMLElement>(`#${SUMMARY_META_ID}`);
  const summary = buildSelectionSummary(state, overlay);
  if (title) {
    title.textContent = summary.title;
  }
  if (copy) {
    copy.textContent = summary.copy;
  }
  if (meta) {
    meta.textContent = summary.meta;
  }
}

function renderSelectionPreview(overlay: HTMLElement, state: WorldbookPanelState): void {
  const container = overlay.querySelector<HTMLElement>(`#${SELECTION_PREVIEW_ID}`);
  if (!container) {
    return;
  }
  container.innerHTML = buildSelectionPreviewMarkup(state, overlay);
}

function renderCandidateList(overlay: HTMLElement, state: WorldbookPanelState): void {
  const container = overlay.querySelector<HTMLElement>(`#${CANDIDATE_LIST_ID}`);
  if (!container) {
    return;
  }
  container.innerHTML = buildCandidateListMarkup(state);
  overlay.querySelectorAll<HTMLInputElement>('input[data-worldbook-book]').forEach((input: HTMLInputElement): void => {
    const bookName = normalizeText(input.dataset.worldbookBook);
    const isPartiallySelected = !!bookName && !state.selectedBooks.has(bookName) && countSelectedEntriesForBook(bookName, state) > 0;
    input.indeterminate = isPartiallySelected;
    input.setAttribute('aria-checked', isPartiallySelected ? 'mixed' : input.checked ? 'true' : 'false');
  });
}

function renderPanel(overlay: HTMLElement, state: WorldbookPanelState): void {
  renderSourceSection(overlay, state);
  renderSelectionSummary(overlay, state);
  renderSelectionPreview(overlay, state);
  renderCandidateList(overlay, state);
}

async function ensureBookLoaded(name: string, overlay: HTMLElement, state: WorldbookPanelState): Promise<void> {
  const normalizedName = normalizeText(name);
  if (!normalizedName || state.loadedBooks.has(normalizedName) || state.loadingBooks.has(normalizedName)) {
    return;
  }

  state.loadingBooks.add(normalizedName);
  renderCandidateList(overlay, state);
  try {
    const entries = await loadTavernWorldbookEntriesEvent([normalizedName]);
    state.loadedBooks.set(normalizedName, {
      entries,
    });
    for (const entry of entries) {
      const key = buildEntryKey(entry.book, entry.entryId);
      if (state.selectedEntries.has(key)) {
        state.selectedEntries.set(key, toEntrySelection(entry));
      }
    }
  } finally {
    state.loadingBooks.delete(normalizedName);
    renderPanel(overlay, state);
  }
}

function removeSelectedEntriesForBook(bookName: string, state: WorldbookPanelState): void {
  Array.from(state.selectedEntries.keys()).forEach((key: string): void => {
    if (key.startsWith(`${bookName}::`)) {
      state.selectedEntries.delete(key);
    }
  });
}

export async function openWorldbookInitPanel(options?: { initialSelection?: ColdStartLorebookSelection }): Promise<ColdStartLorebookSelection | null> {
  initThemeKernel();
  ensureWorldbookInitStyles();

  const normalizedInitial = normalizeSelection(options?.initialSelection);
  const activeNames = collectHostSelectedWorldbookNames();
  const preferredBooks = normalizedInitial.books.length > 0 ? normalizedInitial.books : activeNames;
  const availableNames = collectHostWorldbookNames(preferredBooks);
  const characterBinding = resolveTavernCharacterWorldbookBindingEvent(CANDIDATE_NAME_LIMIT);
  const discoveredNames = buildUniqueNames([...availableNames, ...characterBinding.allBooks], CANDIDATE_NAME_LIMIT * 2);
  const selectedBooks = new Set<string>(preferredBooks.filter((name: string): boolean => discoveredNames.includes(name)));
  const manualDefault = normalizedInitial.books.filter((name: string): boolean => !discoveredNames.includes(name)).join('\n');
  const selectedEntries = new Map<string, ColdStartLorebookEntrySelection>(
    normalizedInitial.entries.map((entry: ColdStartLorebookEntrySelection): [string, ColdStartLorebookEntrySelection] => [
      buildEntryKey(entry.book, entry.entryId),
      entry,
    ]),
  );

  const state: WorldbookPanelState = {
    sourceMode: characterBinding.allBooks.length > 0 ? 'character' : 'all',
    searchText: '',
    availableNames,
    activeNames,
    characterBinding,
    capabilities: getTavernWorldbookCapabilitiesEvent(),
    selectedBooks,
    selectedEntries,
    initialSelectedBooks: new Set(selectedBooks),
    expandedBooks: new Set<string>(),
    expandedEntries: new Set<string>(),
    loadingBooks: new Set<string>(),
    loadedBooks: new Map<string, LoadedWorldbookModel>(),
    visibleEntryCounts: new Map<string, number>(),
    checkboxAnimations: new Map<string, 'check-in' | 'check-out'>(),
  };

  return new Promise<ColdStartLorebookSelection | null>((resolve) => {
    let nextResult: ColdStartLorebookSelection | null = null;
    const animationTimers = new Map<string, number>();

    const dialog = openSharedDialog({
      id: OVERLAY_ID,
      layout: 'bare',
      rootClassName: 'stx-memory-worldbook-init-overlay ui-widget',
      surfaceClassName: 'stx-memory-worldbook-init-dialog',
      bodyHtml: buildDialogContentMarkup(manualDefault),
      chrome: false,
      closeOnBackdrop: true,
      closeOnEscape: true,
      initialFocusSelector: `#${SEARCH_INPUT_ID}, #${MANUAL_INPUT_ID}, #${CONFIRM_BUTTON_ID}`,
      onAfterClose: (): void => {
        animationTimers.forEach((timerId: number): void => {
          window.clearTimeout(timerId);
        });
        animationTimers.clear();
        resolve(nextResult);
      },
    });

    const overlay = dialog.root;
    const confirmButton = overlay.querySelector<HTMLButtonElement>(`#${CONFIRM_BUTTON_ID}`);
    const cancelButton = overlay.querySelector<HTMLButtonElement>(`#${CANCEL_BUTTON_ID}`);
    const skipButton = overlay.querySelector<HTMLButtonElement>(`#${SKIP_BUTTON_ID}`);
    const searchInput = overlay.querySelector<HTMLInputElement>(`#${SEARCH_INPUT_ID}`);
    const manualInput = overlay.querySelector<HTMLTextAreaElement>(`#${MANUAL_INPUT_ID}`);

    const syncConfirmState = (): void => {
      const selection = buildSelectionResult(state, overlay);
      if (confirmButton) {
        confirmButton.disabled = selection.books.length === 0 && selection.entries.length === 0;
      }
      renderSelectionSummary(overlay, state);
      renderSelectionPreview(overlay, state);
    };

    const queueCheckboxAnimation = (animationKey: string, animationState: 'check-in' | 'check-out'): void => {
      state.checkboxAnimations.set(animationKey, animationState);
      const existingTimer = animationTimers.get(animationKey);
      if (typeof existingTimer === 'number') {
        window.clearTimeout(existingTimer);
      }
      const timerId = window.setTimeout((): void => {
        animationTimers.delete(animationKey);
        if (state.checkboxAnimations.get(animationKey) === animationState) {
          state.checkboxAnimations.delete(animationKey);
          renderCandidateList(overlay, state);
        }
      }, 240);
      animationTimers.set(animationKey, timerId);
    };

    const closeOverlay = (result: ColdStartLorebookSelection | null): void => {
      nextResult = result;
      void dialog.close(result ? 'button' : 'api');
    };

    overlay.addEventListener('click', (event: MouseEvent): void => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (!target) {
        return;
      }

      const sourceButton = target.closest<HTMLElement>('[data-worldbook-source]');
      const nextSource = normalizeText(sourceButton?.getAttribute('data-worldbook-source')) as WorldbookSourceMode;
      if (nextSource === 'all' || nextSource === 'character') {
        if (state.sourceMode !== nextSource) {
          state.sourceMode = nextSource;
          renderPanel(overlay, state);
        }
        return;
      }

      const bookExpandButton = target.closest<HTMLElement>('[data-worldbook-book-expand]');
      const expandBookName = normalizeText(bookExpandButton?.getAttribute('data-worldbook-book-expand'));
      if (expandBookName) {
        if (state.expandedBooks.has(expandBookName)) {
          state.expandedBooks.delete(expandBookName);
          renderCandidateList(overlay, state);
          return;
        }
        state.expandedBooks.add(expandBookName);
        if (!state.visibleEntryCounts.has(expandBookName)) {
          state.visibleEntryCounts.set(expandBookName, ENTRY_BATCH_SIZE);
        }
        renderCandidateList(overlay, state);
        void ensureBookLoaded(expandBookName, overlay, state);
        return;
      }

      const entryMoreButton = target.closest<HTMLElement>('[data-worldbook-entry-more]');
      const entryMoreBookName = normalizeText(entryMoreButton?.getAttribute('data-worldbook-entry-more'));
      if (entryMoreBookName) {
        const loaded = state.loadedBooks.get(entryMoreBookName);
        const current = state.visibleEntryCounts.get(entryMoreBookName) ?? ENTRY_BATCH_SIZE;
        const nextCount = loaded ? Math.min(current + ENTRY_BATCH_SIZE, loaded.entries.length) : current + ENTRY_BATCH_SIZE;
        state.visibleEntryCounts.set(entryMoreBookName, nextCount);
        renderCandidateList(overlay, state);
        return;
      }

      const entryExpandButton = target.closest<HTMLElement>('[data-worldbook-entry-expand]');
      const entryExpandKey = normalizeText(entryExpandButton?.getAttribute('data-worldbook-entry-expand'));
      if (entryExpandKey) {
        if (state.expandedEntries.has(entryExpandKey)) {
          state.expandedEntries.delete(entryExpandKey);
        } else {
          state.expandedEntries.add(entryExpandKey);
        }
        renderCandidateList(overlay, state);
      }
    });

    overlay.addEventListener('change', (event: Event): void => {
      const checkbox = event.target instanceof HTMLInputElement ? event.target : null;
      if (!checkbox) {
        return;
      }

      const bookName = normalizeText(checkbox.dataset.worldbookBook);
      if (bookName) {
        queueCheckboxAnimation(buildBookCheckboxAnimationKey(bookName), checkbox.checked ? 'check-in' : 'check-out');
        if (checkbox.checked) {
          state.selectedBooks.add(bookName);
          removeSelectedEntriesForBook(bookName, state);
        } else {
          state.selectedBooks.delete(bookName);
        }
        renderPanel(overlay, state);
        syncConfirmState();
        return;
      }

      const entryBook = normalizeText(checkbox.dataset.worldbookEntryBook);
      const entryId = normalizeText(checkbox.dataset.worldbookEntryId);
      if (!entryBook || !entryId) {
        return;
      }
      const key = buildEntryKey(entryBook, entryId);
      queueCheckboxAnimation(buildEntryCheckboxAnimationKey(entryBook, entryId), checkbox.checked ? 'check-in' : 'check-out');
      if (checkbox.checked) {
        const loaded = state.loadedBooks.get(entryBook);
        const entry = loaded?.entries.find((item: SdkTavernResolvedWorldbookEntryEvent): boolean => buildEntryKey(item.book, item.entryId) === key);
        if (entry) {
          state.selectedEntries.set(key, toEntrySelection(entry));
        }
      } else {
        state.selectedEntries.delete(key);
      }
      renderPanel(overlay, state);
      syncConfirmState();
    });

    searchInput?.addEventListener('input', (): void => {
      state.searchText = searchInput.value;
      renderCandidateList(overlay, state);
    });

    manualInput?.addEventListener('input', syncConfirmState);

    cancelButton?.addEventListener('click', (): void => {
      closeOverlay(null);
    });
    skipButton?.addEventListener('click', (): void => {
      closeOverlay(EMPTY_LOREBOOK_SELECTION);
    });
    confirmButton?.addEventListener('click', (): void => {
      const selection = buildSelectionResult(state, overlay);
      if (selection.books.length === 0 && selection.entries.length === 0) {
        syncConfirmState();
        manualInput?.focus();
        return;
      }
      closeOverlay(selection);
    });

    renderPanel(overlay, state);
    syncConfirmState();
    (searchInput ?? manualInput ?? confirmButton ?? skipButton ?? cancelButton)?.focus();
  });
}