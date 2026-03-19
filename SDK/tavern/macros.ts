import { getSillyTavernContextEvent } from "./context";
import { getCurrentTavernCounterpartNameEvent, getCurrentTavernUserNameEvent } from "./user";

type TavernMacroSubstitutor = (
  content: string,
  scope?: {
    name1Override?: string | null;
    name2Override?: string | null;
    groupOverride?: string | null;
    dynamicMacros?: Record<string, string> | null;
    original?: string | null;
  },
) => string;

const TAVERN_MACRO_PATTERN = /(\{\{[^{}]+\}\}|<(?:USER|BOT|CHAR|CHARIFNOTGROUP|GROUP)>)/i;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function getGlobalSubstituteParams(): TavernMacroSubstitutor | null {
  const globalRef = globalThis as Record<string, unknown> & {
    substituteParams?: unknown;
    SillyTavern?: Record<string, unknown> & {
      substituteParams?: unknown;
    };
  };
  const candidates = [
    globalRef.substituteParams,
    globalRef.SillyTavern?.substituteParams,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "function") {
      return candidate as TavernMacroSubstitutor;
    }
  }
  return null;
}

/**
 * 检查一段文本里是否包含 SillyTavern 官方宏或兼容占位符。
 * 这个检测只负责判断是否值得进入官方宏引擎，不负责解析结果。
 * @param value 待检测的文本
 * @returns 命中官方宏或常见占位符时返回 `true`
 */
export function hasTavernMacroEvent(value: unknown): boolean {
  return TAVERN_MACRO_PATTERN.test(String(value ?? ""));
}

/**
 * 使用 SillyTavern 官方宏引擎预展开文本中的官方宏。
 * 这个函数优先复用宿主提供的 `substituteParams`，从而兼容 ST 内置宏和用户自定义宏；
 * 如果宿主暂时不可用，则退回到最小可用的本地替换逻辑。
 * @param value 待展开的文本
 * @param options 宏替换时使用的显式覆盖项
 * @returns 展开后的文本
 */
export function substituteTavernMacrosEvent(
  value: unknown,
  options?: {
    userNameOverride?: string | null;
    charNameOverride?: string | null;
    groupNameOverride?: string | null;
    dynamicMacros?: Record<string, string> | null;
  },
): string {
  const content = String(value ?? "");
  if (!content || !hasTavernMacroEvent(content)) {
    return content;
  }

  const context = getSillyTavernContextEvent();
  const userName = normalizeText(options?.userNameOverride ?? getCurrentTavernUserNameEvent(context, ""));
  const charName = normalizeText(options?.charNameOverride ?? getCurrentTavernCounterpartNameEvent(context));
  const groupName = normalizeText(options?.groupNameOverride ?? "");
  const dynamicMacros = options?.dynamicMacros ?? null;
  const substituteParams = getGlobalSubstituteParams();

  if (substituteParams) {
    try {
      return String(substituteParams(content, {
        name1Override: userName || null,
        name2Override: charName || null,
        groupOverride: groupName || null,
        dynamicMacros,
        original: content,
      }));
    } catch {
      // 如果宿主宏引擎暂时不可用，继续走本地兜底，避免上层流程中断。
    }
  }

  return content
    .replace(/\{\{\s*user\s*\}\}/gi, userName)
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/<USER>/gi, userName)
    .replace(/<(?:BOT|CHAR|CHARIFNOTGROUP)>/gi, charName)
    .replace(/<GROUP>/gi, groupName);
}

/**
 * 在命中官方宏时再执行预展开，避免无意义地触发宿主宏引擎。
 * @param value 待处理的文本
 * @param options 宏替换时使用的显式覆盖项
 * @returns 若文本包含宏则返回展开结果，否则返回原文本
 */
export function substituteTavernMacrosIfPresentEvent(
  value: unknown,
  options?: {
    userNameOverride?: string | null;
    charNameOverride?: string | null;
    groupNameOverride?: string | null;
    dynamicMacros?: Record<string, string> | null;
  },
): string {
  const content = String(value ?? "");
  if (!hasTavernMacroEvent(content)) {
    return content;
  }
  return substituteTavernMacrosEvent(content, options);
}

/**
 * 预展开世界书条目中的官方宏，并保留原始条目便于排查。
 * @param entry 世界书原始条目
 * @returns 展开后的世界书条目
 */
export function substituteTavernWorldbookEntryMacrosEvent<T extends {
  key?: string[];
  keysecondary?: string[];
  comment?: string;
  content?: string;
}>(entry: T): T {
  return {
    ...entry,
    key: Array.isArray(entry.key)
      ? entry.key.map((item) => substituteTavernMacrosIfPresentEvent(item)).filter(Boolean)
      : entry.key,
    keysecondary: Array.isArray(entry.keysecondary)
      ? entry.keysecondary.map((item) => substituteTavernMacrosIfPresentEvent(item)).filter(Boolean)
      : entry.keysecondary,
    comment: substituteTavernMacrosIfPresentEvent(entry.comment ?? ""),
    content: substituteTavernMacrosIfPresentEvent(entry.content ?? ""),
  };
}
