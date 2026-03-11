import tailwindCssText from "./tailwind.css?inline";

const TAILWIND_STYLE_ID = "stx-tailwind-runtime-style";
const TAILWIND_SCOPE_CLASS = "stx-tw";
const CUSTOM_CLASS_PREFIX = "custom-";
const CUSTOM_CLASS_SELECTOR_PATTERN = /\.(?=[A-Za-z_\\])((?:\\.|[A-Za-z0-9_%@/\-[\]:])+)/g;

function buildCustomPrefixedTailwindCss(cssText: string): string {
  return cssText.replace(CUSTOM_CLASS_SELECTOR_PATTERN, (match, className: string) => {
    if (className.startsWith(CUSTOM_CLASS_PREFIX)) {
      return match;
    }
    return `.${CUSTOM_CLASS_PREFIX}${className}`;
  });
}

const tailwindRuntimeCssText = `${tailwindCssText}\n${buildCustomPrefixedTailwindCss(tailwindCssText)}`;

export interface ApplyTailwindScopeOptions {
  className?: string;
}

export function ensureTailwindRuntimeStyles(): HTMLStyleElement {
  const existing = document.getElementById(TAILWIND_STYLE_ID);
  if (existing instanceof HTMLStyleElement) {
    if (existing.textContent !== tailwindRuntimeCssText) {
      existing.textContent = tailwindRuntimeCssText;
    }
    return existing;
  }

  const style = document.createElement("style");
  style.id = TAILWIND_STYLE_ID;
  style.textContent = tailwindRuntimeCssText;
  document.head.appendChild(style);
  return style;
}

export function applyTailwindScopeToNode(
  root: HTMLElement,
  options?: ApplyTailwindScopeOptions
): HTMLElement {
  ensureTailwindRuntimeStyles();
  root.classList.add(options?.className?.trim() || TAILWIND_SCOPE_CLASS);
  return root;
}
