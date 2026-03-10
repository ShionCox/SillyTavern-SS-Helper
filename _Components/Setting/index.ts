type SettingPageAttributeValue = string | number | boolean | null | undefined;

export interface SettingPageTemplateSchema {
  drawerToggleId: string;
  drawerContentId: string;
  drawerIconId: string;
  title: string;
  badgeId?: string;
  badgeText?: string;
  shellClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
  titleClassName?: string;
  badgeClassName?: string;
  contentHtml: string;
  attributes?: Record<string, SettingPageAttributeValue>;
}

export interface HydrateSettingPageOptions {
  onHydrated?: (root: HTMLElement) => void;
}

function escapeHtml(input: string): string {
  return String(input ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replace(/`/g, "&#96;");
}

function joinClassNames(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function buildAttributes(attributes?: Record<string, SettingPageAttributeValue>): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (value == null || value === false) return [];
      if (value === true) return [` ${key}`];
      return [` ${key}="${escapeAttr(String(value))}"`];
    })
    .join("");
}

export function buildSettingPageTemplate(schema: SettingPageTemplateSchema): string {
  const title = escapeHtml(schema.title);
  const badgeHtml =
    schema.badgeId && schema.badgeText != null
      ? `<span id="${escapeAttr(schema.badgeId)}" class="${escapeAttr(
          joinClassNames("stx-setting-badge", schema.badgeClassName)
        )}">${escapeHtml(String(schema.badgeText))}</span>`
      : "";
  return `
    <div class="${escapeAttr(joinClassNames("inline-drawer", "stx-setting-shell", schema.shellClassName))}"${buildAttributes(
      schema.attributes
    )}>
      <div class="${escapeAttr(
        joinClassNames("inline-drawer-toggle", "inline-drawer-header", "stx-setting-head", schema.headerClassName)
      )}" id="${escapeAttr(schema.drawerToggleId)}">
        <div class="${escapeAttr(joinClassNames("stx-setting-head-title", schema.titleClassName))}">
          <span>${title}</span>
          ${badgeHtml}
        </div>
        <div
          id="${escapeAttr(schema.drawerIconId)}"
          class="inline-drawer-icon fa-solid fa-circle-chevron-down down interactable"
          tabindex="0"
          role="button"
        ></div>
      </div>

      <div class="${escapeAttr(
        joinClassNames("inline-drawer-content", "stx-setting-content", schema.contentClassName)
      )}" id="${escapeAttr(schema.drawerContentId)}" style="display:none;">
        ${schema.contentHtml}
      </div>
    </div>
  `;
}

export function buildSettingPageStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return `
    ${scope} .stx-setting-shell {
      width: 100%;
    }

    ${scope} .stx-setting-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      cursor: pointer;
      user-select: none;
    }

    ${scope} .stx-setting-head-title {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      font-weight: 700;
    }

    ${scope} .stx-setting-badge {
      font-size: 11px;
      line-height: 1;
      font-weight: 700;
      letter-spacing: 0.3px;
    }

    ${scope} .stx-setting-content {
      display: block;
    }
  `;
}

export function hydrateSettingPage(root: HTMLElement, options?: HydrateSettingPageOptions): void {
  if (!(root instanceof HTMLElement)) return;
  root.classList.add("stx-setting-hydrated");
  options?.onHydrated?.(root);
}
