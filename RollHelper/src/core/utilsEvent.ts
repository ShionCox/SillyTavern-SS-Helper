export function formatModifier(mod: number): string {
  if (mod === 0) return "0";
  return mod > 0 ? `+${mod}` : `${mod}`;
}

export function formatEventModifierBreakdownEvent(
  baseModifier: number,
  skillModifier: number,
  finalModifier: number
): string {
  return `${formatModifier(baseModifier)} + skill ${formatModifier(skillModifier)} = ${formatModifier(finalModifier)}`;
}

export function createIdEvent(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function simpleHashEvent(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function escapeHtmlEvent(input: string | undefined | null): string {
  if (input == null) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeAttrEvent(input: string): string {
  return escapeHtmlEvent(input).replace(/`/g, "&#96;");
}

export function normalizeBlankLinesEvent(input: string): string {
  return input.replace(/\n{3,}/g, "\n\n").trim();
}

