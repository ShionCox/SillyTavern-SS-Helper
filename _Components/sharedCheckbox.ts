import sharedCheckboxCssText from "./sharedCheckbox.css?inline";

type SharedCheckboxAttributeValue = string | number | boolean | null | undefined;

export interface SharedCheckboxCardOptions {
  id: string;
  title?: string;
  description?: string;
  checkedLabel?: string;
  uncheckedLabel?: string;
  containerClassName?: string;
  inputClassName?: string;
  bodyClassName?: string;
  copyClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  controlClassName?: string;
  attributes?: Record<string, SharedCheckboxAttributeValue>;
  inputAttributes?: Record<string, SharedCheckboxAttributeValue>;
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

function buildAttributes(attributes?: Record<string, SharedCheckboxAttributeValue>): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (value == null || value === false) return [];
      if (value === true) return [` ${key}`];
      return [` ${key}="${escapeAttr(String(value))}"`];
    })
    .join("");
}

export function buildSharedCheckboxCard(options: SharedCheckboxCardOptions): string {
  const checkedLabel = escapeHtml(options.checkedLabel ?? "开启");
  const uncheckedLabel = escapeHtml(options.uncheckedLabel ?? "关闭");

  return `
    <label
      class="${escapeAttr(joinClassNames("stx-shared-checkbox-card", options.containerClassName))}"
      data-ui="shared-checkbox"${buildAttributes(options.attributes)}
    >
      <input
        id="${escapeAttr(options.id)}"
        class="${escapeAttr(joinClassNames("stx-shared-checkbox-input", options.inputClassName))}"
        type="checkbox"${buildAttributes(options.inputAttributes)}
      />
      <span class="${escapeAttr(joinClassNames("stx-shared-checkbox-body", options.bodyClassName))}">
        <span class="${escapeAttr(joinClassNames("stx-shared-checkbox-copy", options.copyClassName))}">
          ${options.title
            ? `<span class="${escapeAttr(joinClassNames("stx-shared-checkbox-title", options.titleClassName))}">
                ${escapeHtml(options.title)}
              </span>`
            : ""}
          ${options.description
            ? `
          <span class="${escapeAttr(
            joinClassNames("stx-shared-checkbox-description", options.descriptionClassName)
          )}">
            ${escapeHtml(options.description)}
          </span>`
            : ""}
        </span>
        <span
          class="${escapeAttr(joinClassNames("stx-shared-checkbox-control", options.controlClassName))}"
          data-tooltip-anchor="shared-checkbox-control"
          aria-hidden="true"
        >
          <span class="stx-shared-checkbox-box">
            <svg class="stx-shared-checkbox-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3.5 8.5L6.6 11.4L12.5 4.8" />
            </svg>
          </span>
          <span class="stx-shared-checkbox-state">
            <span class="stx-shared-checkbox-state-label is-off">${uncheckedLabel}</span>
            <span class="stx-shared-checkbox-state-label is-on">${checkedLabel}</span>
          </span>
        </span>
      </span>
    </label>
  `;
}

export function buildSharedCheckboxStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return sharedCheckboxCssText.split("_SCOPE_").join(scope);
}
