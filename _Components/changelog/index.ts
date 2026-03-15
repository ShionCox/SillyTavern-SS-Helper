import changelogCssText from "./changelog.css?inline";

export type ChangelogCategoryType = "added" | "fixed" | "improved" | "changed" | "docs" | "other";

export interface ChangelogLegacyEntry {
  version?: string;
  date?: string;
  changes?: string[];
}

export interface ChangelogSection {
  type: ChangelogCategoryType | string;
  title?: string;
  items: string[];
}

export interface ChangelogEntry {
  version?: string;
  date?: string;
  sections?: ChangelogSection[];
  changes?: string[];
}

export interface BuildChangelogOptions {
  emptyText?: string;
  containerClassName?: string;
}

interface NormalizedChangelogSection {
  type: ChangelogCategoryType;
  title: string;
  items: string[];
  badgeText: string;
  iconClassName: string;
  className: string;
}

interface NormalizedChangelogEntry {
  version: string;
  date: string;
  sections: NormalizedChangelogSection[];
}

interface ChangelogCategoryMeta {
  label: string;
  iconClassName: string;
  className: string;
}

const CHANGELOG_CATEGORY_META: Record<ChangelogCategoryType, ChangelogCategoryMeta> = {
  added: {
    label: "新增",
    iconClassName: "fa-solid fa-sparkles",
    className: "is-added",
  },
  fixed: {
    label: "修复",
    iconClassName: "fa-solid fa-bug",
    className: "is-fixed",
  },
  improved: {
    label: "优化",
    iconClassName: "fa-solid fa-wand-magic-sparkles",
    className: "is-improved",
  },
  changed: {
    label: "调整",
    iconClassName: "fa-solid fa-sliders",
    className: "is-changed",
  },
  docs: {
    label: "文档",
    iconClassName: "fa-solid fa-book-open",
    className: "is-docs",
  },
  other: {
    label: "更新",
    iconClassName: "fa-solid fa-layer-group",
    className: "is-other",
  },
};

/**
 * 功能：转义 HTML 文本内容，避免字符串直接进入模板。
 * @param input 原始文本
 * @returns 转义后的安全文本
 */
function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 功能：转义 HTML 属性值。
 * @param input 原始属性值
 * @returns 可安全放入属性中的文本
 */
function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

/**
 * 功能：拼接类名字符串，并自动过滤空值。
 * @param parts 类名片段列表
 * @returns 合并后的类名字符串
 */
function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * 功能：过滤并清洗日志条目列表中的空文本。
 * @param items 原始条目列表
 * @returns 去空后的条目列表
 */
function sanitizeItems(items: string[] | undefined): string[] {
  return Array.isArray(items)
    ? items.map((item: string): string => String(item ?? "").trim()).filter((item: string): boolean => item.length > 0)
    : [];
}

/**
 * 功能：把任意分类名归一化为组件支持的固定分类。
 * @param rawType 原始分类值
 * @returns 归一化后的分类键
 */
function normalizeCategoryType(rawType: string | undefined): ChangelogCategoryType {
  const value = String(rawType ?? "").trim().toLowerCase();
  if (value === "added" || value === "fixed" || value === "improved" || value === "changed" || value === "docs") {
    return value;
  }
  return "other";
}

/**
 * 功能：获取分类对应的展示元信息。
 * @param type 归一化后的分类键
 * @returns 分类标签、图标和样式类
 */
function getCategoryMeta(type: ChangelogCategoryType): ChangelogCategoryMeta {
  return CHANGELOG_CATEGORY_META[type] ?? CHANGELOG_CATEGORY_META.other;
}

/**
 * 功能：把单个日志分组归一化为可渲染结构。
 * @param section 原始分组数据
 * @returns 归一化后的日志分组；无有效条目时返回空值
 */
function normalizeSection(section: ChangelogSection): NormalizedChangelogSection | null {
  const items = sanitizeItems(section.items);
  if (items.length === 0) return null;
  const type = normalizeCategoryType(section.type);
  const meta = getCategoryMeta(type);
  return {
    type,
    title: String(section.title ?? "").trim() || meta.label,
    items,
    badgeText: meta.label,
    iconClassName: meta.iconClassName,
    className: meta.className,
  };
}

/**
 * 功能：把单条更新日志归一化为统一结构，同时兼容旧版 changes 列表。
 * @param entry 原始日志条目
 * @returns 归一化后的日志条目；无有效内容时返回空值
 */
function normalizeEntry(entry: ChangelogEntry | ChangelogLegacyEntry): NormalizedChangelogEntry | null {
  const version = String(entry.version ?? "").trim();
  const date = String(entry.date ?? "").trim();
  const sectionsSource: ChangelogSection[] = Array.isArray((entry as ChangelogEntry).sections)
    ? (entry as ChangelogEntry).sections ?? []
    : [{ type: "other", title: "更新", items: sanitizeItems(entry.changes) }];
  const sections = sectionsSource
    .map((section: ChangelogSection): NormalizedChangelogSection | null => normalizeSection(section))
    .filter((section: NormalizedChangelogSection | null): section is NormalizedChangelogSection => section !== null);
  if (!version && !date && sections.length === 0) return null;
  return {
    version: version || "未命名版本",
    date,
    sections,
  };
}

/**
 * 功能：归一化更新日志列表，统一处理新旧数据格式。
 * @param entries 原始更新日志列表
 * @returns 可直接渲染的归一化日志列表
 */
export function normalizeChangelogEntries(entries: Array<ChangelogEntry | ChangelogLegacyEntry>): NormalizedChangelogEntry[] {
  return Array.isArray(entries)
    ? entries
        .map((entry: ChangelogEntry | ChangelogLegacyEntry): NormalizedChangelogEntry | null => normalizeEntry(entry))
        .filter((entry: NormalizedChangelogEntry | null): entry is NormalizedChangelogEntry => entry !== null)
    : [];
}

/**
 * 功能：构建更新日志组件 HTML，支持分类分组和旧格式兼容。
 * @param entries 原始更新日志列表
 * @param options 构建选项
 * @returns 更新日志组件 HTML
 */
export function buildChangelogHtml(
  entries: Array<ChangelogEntry | ChangelogLegacyEntry>,
  options?: BuildChangelogOptions
): string {
  const normalizedEntries = normalizeChangelogEntries(entries);
  const rootClassName = joinClassNames("stx-changelog", options?.containerClassName);
  if (normalizedEntries.length === 0) {
    return `<div class="${escapeAttr(rootClassName)} stx-changelog-empty">${escapeHtml(options?.emptyText ?? "暂无更新记录")}</div>`;
  }

  const entryHtml = normalizedEntries
    .map((entry: NormalizedChangelogEntry): string => {
      const sectionsHtml = entry.sections
        .map((section: NormalizedChangelogSection): string => {
          const itemsHtml = section.items
            .map((item: string): string => `<li class="stx-changelog-section-item">${escapeHtml(item)}</li>`)
            .join("");
          const shouldShowTitle = section.title !== section.badgeText;
          return `
            <section class="stx-changelog-section ${escapeAttr(section.className)}">
              <div class="stx-changelog-section-head">
                <span class="stx-changelog-section-badge">
                  <i class="${escapeAttr(section.iconClassName)}" aria-hidden="true"></i>
                  <span>${escapeHtml(section.badgeText)}</span>
                </span>
                ${shouldShowTitle ? `<span class="stx-changelog-section-title">${escapeHtml(section.title)}</span>` : ""}
              </div>
              <ul class="stx-changelog-section-list">${itemsHtml}</ul>
            </section>
          `;
        })
        .join("");

      return `
        <article class="stx-changelog-entry">
          <header class="stx-changelog-entry-head">
            <div class="stx-changelog-entry-version">
              <i class="fa-solid fa-code-branch" aria-hidden="true"></i>
              <span class="stx-changelog-entry-version-text">${escapeHtml(entry.version)}</span>
            </div>
            ${entry.date ? `<span class="stx-changelog-entry-date">${escapeHtml(entry.date)}</span>` : ""}
          </header>
          <div class="stx-changelog-sections">${sectionsHtml}</div>
        </article>
      `;
    })
    .join("");

  return `<div class="${escapeAttr(rootClassName)}" data-ui="shared-changelog">${entryHtml}</div>`;
}

/**
 * 功能：构建更新日志组件样式，并按作用域替换选择器。
 * @param scopeSelector 作用域选择器
 * @returns 更新日志组件样式文本
 */
export function buildChangelogStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return changelogCssText.split("_SCOPE_").join(scope);
}
