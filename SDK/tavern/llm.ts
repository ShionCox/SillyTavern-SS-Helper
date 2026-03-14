import { getSillyTavernContextEvent } from "./context";

// ── 公共类型 ──

export interface TavernChatResult {
  ok: boolean;
  content: string;
  message?: string;
  errorCode?: string;
  detail?: string;
  latencyMs?: number;
}

export interface TavernConnectionResult {
  ok: boolean;
  message: string;
  errorCode?: string;
  detail?: string;
  model?: string;
  latencyMs?: number;
}

export interface TavernLlmAvailability {
  available: boolean;
  hasContext: boolean;
  hasGenerateApi: boolean;
  model: string;
  message: string;
}

// ── 内部工具 ──

function getGlobalGenerate(): ((prompt: string, opts?: Record<string, unknown>) => Promise<string>) | null {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.generateQuietPrompt === "function") return g.generateQuietPrompt as any;
  if (typeof g.Generate === "function") return g.Generate as any;
  const ctx = getSillyTavernContextEvent() as Record<string, unknown> | null;
  if (ctx && typeof ctx.generateQuietPrompt === "function") return ctx.generateQuietPrompt as any;
  return null;
}

function readCurrentModel(): string {
  try {
    const g = globalThis as Record<string, unknown>;
    // SillyTavern 在全局 main_api 和 model_* 字段暴露当前模型
    const mainApi = String(g.main_api ?? "");
    const oaiModel = String((g as any).oai_settings?.openai_model ?? "");
    const modelName = String(g.model_name ?? g.online_status ?? "");
    if (oaiModel) return oaiModel;
    if (modelName && modelName !== "undefined") return modelName;
    if (mainApi) return `(${mainApi})`;
    return "";
  } catch {
    return "";
  }
}

// ── 公共 API ──

/**
 * 检测酒馆 LLM 可用性（同步，不发请求）。
 */
export function getTavernLlmAvailability(): TavernLlmAvailability {
  const ctx = getSillyTavernContextEvent();
  const hasContext = ctx !== null;
  const hasGenerateApi = getGlobalGenerate() !== null;
  const model = readCurrentModel();
  const available = hasContext && hasGenerateApi;

  let message: string;
  if (!hasContext) {
    message = "未检测到酒馆上下文";
  } else if (!hasGenerateApi) {
    message = "当前酒馆版本不支持静默生成 API";
  } else if (!model) {
    message = "当前未选择模型";
  } else {
    message = "酒馆 LLM 可用";
  }

  return { available, hasContext, hasGenerateApi, model, message };
}

/**
 * 获取酒馆当前模型名。
 */
export function getTavernCurrentModel(): string {
  return readCurrentModel();
}

/**
 * 通过酒馆静默生成执行聊天请求，不写入聊天记录。
 */
export async function runTavernQuietPrompt(prompt: string): Promise<TavernChatResult> {
  const start = Date.now();
  const generate = getGlobalGenerate();
  if (!generate) {
    return {
      ok: false,
      content: "",
      message: "酒馆静默生成 API 不可用",
      errorCode: "NO_GENERATE_API",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const result = await generate(prompt, {
      quietPrompt: true,
      skipWIAN: true,
      force_name2: true,
    });
    const content = String(result ?? "").trim();
    if (!content) {
      return {
        ok: false,
        content: "",
        message: "酒馆返回空响应",
        errorCode: "EMPTY_RESPONSE",
        latencyMs: Date.now() - start,
      };
    }
    return { ok: true, content, latencyMs: Date.now() - start };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      content: "",
      message: `酒馆静默请求失败：${msg}`,
      errorCode: "GENERATE_ERROR",
      detail: msg,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * 发送原始 prompt 到酒馆（同 runTavernQuietPrompt，别名保留用于语义区分）。
 */
export async function runTavernRawPrompt(prompt: string): Promise<TavernChatResult> {
  return runTavernQuietPrompt(prompt);
}

/**
 * 测试酒馆 LLM 连接：发送最小静默请求。
 */
export async function testTavernLlmConnection(): Promise<TavernConnectionResult> {
  const availability = getTavernLlmAvailability();
  if (!availability.available) {
    return {
      ok: false,
      message: availability.message,
      errorCode: "UNAVAILABLE",
      model: availability.model || undefined,
      latencyMs: 0,
    };
  }

  const result = await runTavernQuietPrompt("Reply with exactly: OK");
  return {
    ok: result.ok,
    message: result.ok ? "酒馆接口检测成功" : (result.message || "检测失败"),
    errorCode: result.ok ? undefined : result.errorCode,
    detail: result.detail,
    model: availability.model || undefined,
    latencyMs: result.latencyMs,
  };
}
