import sharedBoxCheckboxCssText from "./sharedBoxCheckbox.css?inline";

type SharedBoxCheckboxAttributeValue = string | number | boolean | null | undefined;

export interface SharedBoxCheckboxOptions {
  id: string;
  containerClassName?: string;
  inputClassName?: string;
  controlClassName?: string;
  indicatorClassName?: string;
  attributes?: Record<string, SharedBoxCheckboxAttributeValue>;
  inputAttributes?: Record<string, SharedBoxCheckboxAttributeValue>;
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

function buildAttributes(attributes?: Record<string, SharedBoxCheckboxAttributeValue>): string {
  if (!attributes) return "";
  return Object.entries(attributes)
    .flatMap(([key, value]) => {
      if (value == null || value === false) return [];
      if (value === true) return [` ${key}`];
      return [` ${key}="${escapeAttr(String(value))}"`];
    })
    .join("");
}

export function buildSharedBoxCheckbox(options: SharedBoxCheckboxOptions): string {
  return `
    <label
      class="${escapeAttr(joinClassNames("stx-shared-box-checkbox", options.containerClassName))}"
      data-ui="shared-box-checkbox"${buildAttributes(options.attributes)}
    >
      <input
        id="${escapeAttr(options.id)}"
        class="${escapeAttr(joinClassNames("stx-shared-box-checkbox-input", options.inputClassName))}"
        type="checkbox"${buildAttributes(options.inputAttributes)}
      />
      <span
        class="${escapeAttr(joinClassNames("stx-shared-box-checkbox-control", options.controlClassName))}"
        aria-hidden="true"
      >
        <span
          class="${escapeAttr(joinClassNames("stx-shared-box-checkbox-indicator", options.indicatorClassName))}"
        ></span>
      </span>
    </label>
  `;
}

export function buildSharedBoxCheckboxStyles(scopeSelector: string): string {
  const scope = scopeSelector.trim() || ":root";
  return sharedBoxCheckboxCssText.replaceAll("_SCOPE_", scope);
}
