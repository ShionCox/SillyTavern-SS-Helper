import type {
  SdkTavernPromptMessageEvent,
  SdkTavernPromptInsertOptionsEvent,
  SdkTavernPromptTargetEvent,
} from "./types";
import { stripRuntimePlaceholderArtifactsEvent } from "./artifacts";

/**
 * 功能：定义酒馆聊天消息正文兼容抽取结果。
 */
export interface SdkTavernMessageTextExtractionEvent {
  text: string;
  textSource: string;
  isEmpty: boolean;
  normalizedShapeHint?: string;
}

/**
 * 功能：把任意输入规范化为字符串文本。
 * @param raw 原始输入值
 * @returns 规范化后的字符串
 */
function normalizePromptTextEvent(raw: unknown): string {
  return String(raw ?? "");
}

/**
 * 功能：统一读取消息角色字段，便于后续判定 user/system。
 * @param message 待判定的消息对象
 * @returns 归一化后的角色名
 */
function normalizePromptRoleEvent(message: SdkTavernPromptMessageEvent | null | undefined): string {
  if (!message || typeof message !== "object") return "";
  return String(message.role ?? "")
    .trim()
    .toLowerCase();
}

/**
 * 功能：把结构化 `content` 数组中的文本拼接成普通字符串。
 * @param contentArray 消息内容数组
 * @returns 拼接后的文本
 */
function getPromptArrayTextEvent(contentArray: unknown[]): string {
  const lines: string[] = [];
  for (const item of contentArray) {
    if (typeof item === "string") {
      lines.push(item);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const textValue = itemRecord.text ?? itemRecord.content ?? "";
    if (typeof textValue === "string" && textValue) {
      lines.push(textValue);
    }
  }
  return lines.join("\n");
}

/**
 * 功能：从未知字段中抽取可见正文。
 * @param value 待读取的值。
 * @param sourcePrefix 当前来源标记。
 * @returns 命中的抽取结果；未命中时返回 null。
 */
function extractTextFromUnknownRecordEvent(
  value: unknown,
  sourcePrefix: string
): SdkTavernMessageTextExtractionEvent | null {
  if (typeof value === "string") {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(value),
      textSource: sourcePrefix,
      isEmpty: value.trim().length === 0,
      normalizedShapeHint: "string",
    };
  }
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const textValue = record.text;
  if (typeof textValue === "string") {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(textValue),
      textSource: `${sourcePrefix}.text`,
      isEmpty: textValue.trim().length === 0,
      normalizedShapeHint: "object.text",
    };
  }

  const contentValue = record.content;
  if (typeof contentValue === "string") {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(contentValue),
      textSource: `${sourcePrefix}.content`,
      isEmpty: contentValue.trim().length === 0,
      normalizedShapeHint: "object.content",
    };
  }

  const messageValue = record.message;
  if (typeof messageValue === "string") {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(messageValue),
      textSource: `${sourcePrefix}.message`,
      isEmpty: messageValue.trim().length === 0,
      normalizedShapeHint: "object.message",
    };
  }

  const mesValue = record.mes;
  if (typeof mesValue === "string") {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(mesValue),
      textSource: `${sourcePrefix}.mes`,
      isEmpty: mesValue.trim().length === 0,
      normalizedShapeHint: "object.mes",
    };
  }

  if (mesValue && typeof mesValue === "object") {
    const nestedMesResult = extractTextFromUnknownRecordEvent(mesValue, `${sourcePrefix}.mes`);
    if (nestedMesResult) {
      return {
        ...nestedMesResult,
        normalizedShapeHint: nestedMesResult.normalizedShapeHint || "object.mes_object",
      };
    }
  }

  return null;
}

/**
 * 功能：构造统一的空抽取结果。
 * @param textSource 正文来源标记。
 * @param normalizedShapeHint 结构提示。
 * @returns 空抽取结果。
 */
function buildEmptyExtractionEvent(
  textSource: string,
  normalizedShapeHint?: string
): SdkTavernMessageTextExtractionEvent {
  return {
    text: "",
    textSource,
    isEmpty: true,
    normalizedShapeHint,
  };
}

/**
 * 功能：统一抽取酒馆聊天消息正文，并返回来源诊断信息。
 * @param message 任意聊天消息对象。
 * @returns 正文抽取结果。
 */
export function extractTavernMessageTextEvent(message: unknown): SdkTavernMessageTextExtractionEvent {
  if (!message || typeof message !== "object") {
    return buildEmptyExtractionEvent("message.invalid", "non_object");
  }

  const messageRecord = message as Record<string, unknown>;
  const swipeId = Number(messageRecord.swipe_id ?? messageRecord.swipeId);
  const swipes = messageRecord.swipes;
  if (Array.isArray(swipes) && Number.isFinite(swipeId) && swipeId >= 0 && swipeId < swipes.length) {
    const swipeResult = extractTextFromUnknownRecordEvent(swipes[swipeId], `swipes[${swipeId}]`);
    if (swipeResult) {
      return swipeResult;
    }
    return buildEmptyExtractionEvent(`swipes[${swipeId}]`, "unsupported_swipe_shape");
  }

  const mesResult = extractTextFromUnknownRecordEvent(messageRecord.mes, "mes");
  if (mesResult) {
    return mesResult;
  }

  const contentResult = extractTextFromUnknownRecordEvent(messageRecord.content, "content");
  if (contentResult) {
    return contentResult;
  }

  const textResult = extractTextFromUnknownRecordEvent(messageRecord.text, "text");
  if (textResult) {
    return textResult;
  }

  const messageResult = extractTextFromUnknownRecordEvent(messageRecord.message, "message");
  if (messageResult) {
    return messageResult;
  }

  const promptText = getTavernPromptMessageTextEvent(messageRecord as SdkTavernPromptMessageEvent);
  if (promptText.trim().length > 0) {
    return {
      text: stripRuntimePlaceholderArtifactsEvent(promptText),
      textSource: "prompt.content",
      isEmpty: false,
      normalizedShapeHint: Array.isArray(messageRecord.content)
        ? "prompt.content_array"
        : typeof messageRecord.content === "object" && messageRecord.content !== null
          ? "prompt.content_object"
          : "prompt.direct",
    };
  }

  return buildEmptyExtractionEvent("message.unsupported", "unsupported_message_shape");
}

/**
 * 功能：统一读取普通聊天消息文本，优先读取当前激活 swipe。
 * @param message 任意消息对象（SillyTavern 原始消息或兼容结构）
 * @returns 归一化后的消息文本
 */
export function getTavernMessageTextEvent(message: unknown): string {
  return extractTavernMessageTextEvent(message).text;
}

/**
 * 功能：按原有 `content` 结构构造新文本，避免把结构化消息写坏。
 * @param currentContent 当前 `content`
 * @param nextText 新文本
 * @returns 与原结构尽量一致的新 `content`
 */
function buildPromptContentLikeEvent(currentContent: unknown, nextText: string): unknown {
  if (typeof currentContent === "string") {
    return nextText;
  }
  if (Array.isArray(currentContent)) {
    const first = currentContent[0];
    if (typeof first === "string") {
      return [nextText];
    }
    if (first && typeof first === "object") {
      const firstRecord = first as Record<string, unknown>;
      if (typeof firstRecord.text === "string") {
        return [{ ...firstRecord, text: nextText }];
      }
      if (typeof firstRecord.content === "string") {
        return [{ ...firstRecord, content: nextText }];
      }
    }
    return [{ type: "text", text: nextText }];
  }
  if (currentContent && typeof currentContent === "object") {
    const contentRecord = currentContent as Record<string, unknown>;
    if (typeof contentRecord.text === "string") {
      return {
        ...contentRecord,
        text: nextText,
      };
    }
    if (typeof contentRecord.content === "string") {
      return {
        ...contentRecord,
        content: nextText,
      };
    }
    return {
      ...contentRecord,
      text: nextText,
    };
  }
  return nextText;
}

/**
 * 功能：根据参考消息推断新的 prompt 消息 `content` 结构。
 * @param template 参考消息
 * @returns 适合新消息使用的空内容结构
 */
function buildEmptyPromptContentLikeEvent(
  template: SdkTavernPromptMessageEvent | null | undefined
): unknown {
  return buildPromptContentLikeEvent(template?.content ?? "", "");
}

/**
 * 功能：按目标角色创建新的 prompt 消息，避免无意义地同时携带多份重复文本字段。
 * @param template 参考消息
 * @param role 目标角色。
 * @returns 新的 prompt 消息对象
 */
function buildPromptMessageLikeEvent(
  template: SdkTavernPromptMessageEvent | null | undefined,
  role: "system" | "user" | "assistant"
): SdkTavernPromptMessageEvent {
  const templateRecord =
    template && typeof template === "object"
      ? (template as Record<string, unknown>)
      : null;
  const message: SdkTavernPromptMessageEvent = {
    role,
  };
  if (role === "system") {
    message.is_system = true;
  }
  if (role === "user") {
    message.is_user = true;
  }

  const hasContentField = Boolean(templateRecord) && Object.prototype.hasOwnProperty.call(templateRecord, "content");
  const hasMesField = Boolean(templateRecord) && Object.prototype.hasOwnProperty.call(templateRecord, "mes");
  const hasTextField = Boolean(templateRecord) && Object.prototype.hasOwnProperty.call(templateRecord, "text");

  if (hasContentField || (!hasMesField && !hasTextField)) {
    message.content = buildEmptyPromptContentLikeEvent(template);
  }
  if (hasMesField) {
    message.mes = "";
  }
  if (hasTextField) {
    message.text = "";
  }

  return message;
}

/**
 * 功能：把文本同步写回消息对象常见字段。
 * @param target 目标消息对象
 * @param nextText 要写入的文本
 * @returns 无返回值
 */
function applyTextToPromptRecordEvent(target: Record<string, unknown>, nextText: string): void {
  const hasContentField = Object.prototype.hasOwnProperty.call(target, "content");
  const hasMesField = Object.prototype.hasOwnProperty.call(target, "mes");
  const hasTextField = Object.prototype.hasOwnProperty.call(target, "text");

  if (hasContentField) {
    target.content = buildPromptContentLikeEvent(target.content, nextText);
  }
  if (hasMesField) {
    target.mes = nextText;
  }
  if (hasTextField) {
    target.text = nextText;
  }
  if (!hasContentField && !hasMesField && !hasTextField) {
    target.content = nextText;
  }
}

/**
 * 功能：根据插入模式计算新 system 消息的插入索引。
 * @param chatLength 当前消息数组长度
 * @param options 插入选项
 * @returns 可安全使用的插入索引
 */
function resolvePromptInsertIndexEvent(
  chatLength: number,
  options?: SdkTavernPromptInsertOptionsEvent
): number {
  const insertMode = options?.insertMode ?? "before_index";
  if (insertMode === "append") {
    return Math.max(0, chatLength);
  }
  if (insertMode === "before_end_offset") {
    const offset = Math.max(0, Math.floor(Number(options?.offsetFromEnd) || 0));
    if (offset <= 0) return Math.max(0, chatLength);
    return Math.max(0, chatLength - offset);
  }
  const insertBeforeIndex = Math.floor(Number(options?.insertBeforeIndex) || 0);
  return Math.max(0, Math.min(insertBeforeIndex, chatLength));
}

/**
 * 功能：读取 prompt 消息中的可见文本。
 * @param message 待读取的消息
 * @returns 解析出的文本
 */
export function getTavernPromptMessageTextEvent(
  message: SdkTavernPromptMessageEvent | null | undefined
): string {
  if (!message || typeof message !== "object") return "";
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return getPromptArrayTextEvent(message.content);
  }
  if (message.content && typeof message.content === "object") {
    const contentRecord = message.content as Record<string, unknown>;
    if (typeof contentRecord.text === "string") {
      return contentRecord.text;
    }
  }
  if (typeof message.mes === "string") {
    return message.mes;
  }
  if (typeof message.text === "string") {
    return message.text;
  }
  return "";
}

/**
 * 功能：把文本写回 prompt 消息，并同步更新当前激活 swipe。
 * @param message 待写入的消息
 * @param text 新文本
 * @returns 无返回值
 */
export function setTavernPromptMessageTextEvent(
  message: SdkTavernPromptMessageEvent,
  text: string
): void {
  if (!message || typeof message !== "object") return;
  const nextText = normalizePromptTextEvent(text);
  applyTextToPromptRecordEvent(message as Record<string, unknown>, nextText);

  const swipeId = Number(message.swipe_id ?? message.swipeId);
  const swipes = message.swipes;
  if (!Array.isArray(swipes) || !Number.isFinite(swipeId) || swipeId < 0 || swipeId >= swipes.length) {
    return;
  }

  const activeSwipe = swipes[swipeId];
  if (typeof activeSwipe === "string") {
    swipes[swipeId] = nextText;
    return;
  }
  if (activeSwipe && typeof activeSwipe === "object") {
    applyTextToPromptRecordEvent(activeSwipe as Record<string, unknown>, nextText);
  }
}

/**
 * 功能：判断一条 prompt 消息是否为 user。
 * @param message 待判断的消息
 * @returns 是否为 user 消息
 */
export function isTavernPromptUserMessageEvent(
  message: SdkTavernPromptMessageEvent | null | undefined
): boolean {
  if (!message || typeof message !== "object") return false;
  if (message.is_user === true) return true;
  return normalizePromptRoleEvent(message) === "user";
}

/**
 * 功能：判断一条 prompt 消息是否为 system。
 * @param message 待判断的消息
 * @returns 是否为 system 消息
 */
export function isTavernPromptSystemMessageEvent(
  message: SdkTavernPromptMessageEvent | null | undefined
): boolean {
  if (!message || typeof message !== "object") return false;
  if (message.is_system === true) return true;
  return normalizePromptRoleEvent(message) === "system";
}

/**
 * 功能：查找第一条 system 消息的位置。
 * @param chat 消息数组
 * @returns 命中的索引，未找到时返回 -1
 */
export function findFirstTavernPromptSystemIndexEvent(
  chat: SdkTavernPromptMessageEvent[]
): number {
  if (!Array.isArray(chat)) return -1;
  for (let i = 0; i < chat.length; i += 1) {
    if (isTavernPromptSystemMessageEvent(chat[i])) return i;
  }
  return -1;
}

/**
 * 功能：查找最后一条 system 消息的位置。
 * @param chat 消息数组
 * @returns 命中的索引，未找到时返回 -1
 */
export function findLastTavernPromptSystemIndexEvent(
  chat: SdkTavernPromptMessageEvent[]
): number {
  if (!Array.isArray(chat)) return -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (isTavernPromptSystemMessageEvent(chat[i])) return i;
  }
  return -1;
}

/**
 * 功能：查找最后一条 user 消息的位置。
 * @param chat 消息数组
 * @returns 命中的索引，未找到时返回 -1
 */
export function findLastTavernPromptUserIndexEvent(
  chat: SdkTavernPromptMessageEvent[]
): number {
  if (!Array.isArray(chat)) return -1;
  for (let i = chat.length - 1; i >= 0; i -= 1) {
    if (isTavernPromptUserMessageEvent(chat[i])) return i;
  }
  return -1;
}

/**
 * 功能：列出 payload 中所有可写的 prompt 消息数组，并按引用去重。
 * @param payload Prompt Ready 事件 payload
 * @returns 可写目标数组列表
 */
export function listTavernPromptTargetsEvent(
  payload: unknown
): SdkTavernPromptTargetEvent[] {
  const targets: SdkTavernPromptTargetEvent[] = [];
  const seen = new Set<SdkTavernPromptMessageEvent[]>();

  /**
   * 功能：把一个候选数组加入结果列表。
   * @param path 当前命中的 payload 路径
   * @param value 候选值
   * @returns 无返回值
   */
  const pushTarget = (path: string, value: unknown): void => {
    if (!Array.isArray(value)) return;
    const messageList = value as SdkTavernPromptMessageEvent[];
    if (seen.has(messageList)) return;
    seen.add(messageList);
    targets.push({
      path,
      messages: messageList,
    });
  };

  if (Array.isArray(payload)) {
    pushTarget("payload", payload);
    return targets;
  }
  if (!payload || typeof payload !== "object") return targets;

  const payloadRecord = payload as Record<string, unknown>;
  const promptRecord =
    payloadRecord.prompt && typeof payloadRecord.prompt === "object"
      ? (payloadRecord.prompt as Record<string, unknown>)
      : null;
  const dataRecord =
    payloadRecord.data && typeof payloadRecord.data === "object"
      ? (payloadRecord.data as Record<string, unknown>)
      : null;
  const chatCompletionRecord =
    payloadRecord.chatCompletion && typeof payloadRecord.chatCompletion === "object"
      ? (payloadRecord.chatCompletion as Record<string, unknown>)
      : null;

  pushTarget("payload.chatCompletion.messages", chatCompletionRecord?.messages);
  pushTarget("payload.messages", payloadRecord.messages);
  pushTarget("payload.prompt.messages", promptRecord?.messages);
  pushTarget("payload.data.messages", dataRecord?.messages);
  pushTarget("payload.chat", payloadRecord.chat);
  pushTarget("payload.prompt.chat", promptRecord?.chat);
  pushTarget("payload.data.chat", dataRecord?.chat);
  pushTarget("payload.message_list", payloadRecord.message_list);
  return targets;
}

/**
 * 功能：提取 payload 中优先级最高的一组 prompt 消息数组。
 * @param payload Prompt Ready 事件 payload
 * @returns 命中的消息数组；未命中时返回 null
 */
export function extractTavernPromptMessagesEvent(
  payload: unknown
): SdkTavernPromptMessageEvent[] | null {
  const targets = listTavernPromptTargetsEvent(payload);
  return targets[0]?.messages ?? null;
}

/**
 * 功能：向 prompt 消息数组插入一条 system 消息，可直接模拟 Horae 的 push/splice 写法。
 * @param chat 目标消息数组
 * @param options 插入配置
 * @returns 新插入的 system 消息
 */
export function insertTavernPromptMessageEvent(
  chat: SdkTavernPromptMessageEvent[],
  options: SdkTavernPromptInsertOptionsEvent
): SdkTavernPromptMessageEvent {
  const message = buildPromptMessageLikeEvent(options?.template, options.role);
  if (options.text != null) {
    setTavernPromptMessageTextEvent(message, options.text);
  }
  const safeIndex = resolvePromptInsertIndexEvent(chat.length, options);
  chat.splice(safeIndex, 0, message);
  return message;
}

/**
 * 功能：向 prompt 消息数组中插入一条 system 消息。
 * @param chat 目标消息数组
 * @param options 插入配置
 * @returns 新插入的 system 消息
 */
export function insertTavernPromptSystemMessageEvent(
  chat: SdkTavernPromptMessageEvent[],
  options: SdkTavernPromptInsertOptionsEvent
): SdkTavernPromptMessageEvent {
  return insertTavernPromptMessageEvent(chat, {
    ...options,
    role: "system",
  });
}
