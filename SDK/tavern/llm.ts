import { getSillyTavernContextEvent } from "./context";

/**
 * 功能：统一描述酒馆 LLM 返回结果。
 */
export interface TavernChatResult {
  ok: boolean;
  content: string;
  message?: string;
  errorCode?: string;
  detail?: string;
  latencyMs?: number;
  compatTrace?: TavernCompatAttempt[];
  finalAttemptStage?: TavernCompatStage;
  finalRequestBody?: Record<string, unknown>;
}

/**
 * 功能：描述 Tavern 结构化请求兼容降级所处的阶段。
 * 参数：无。
 * 返回：无。
 */
export type TavernCompatStage =
  | "standard"
  | "structured_schema"
  | "structured_json_object"
  | "prompt_json_only"
  | "minimal_prompt_json_only";

/**
 * 功能：记录一次 Tavern 兼容降级尝试的调试信息。
 * 参数：无。
 * 返回：无。
 */
export interface TavernCompatAttempt {
  stage: TavernCompatStage;
  removedFields: string[];
  requestBodySummary: {
    model: string;
    source: string;
    maxTokens: number;
    hasJsonSchema: boolean;
    responseFormat: string | null;
    fieldKeys: string[];
  };
  httpStatus?: number;
  backendMessage?: string;
  errorCode?: string;
  detail?: string;
  succeeded: boolean;
}

/**
 * 功能：统一描述酒馆连接检测结果。
 */
export interface TavernConnectionResult {
  ok: boolean;
  message: string;
  errorCode?: string;
  detail?: string;
  model?: string;
  latencyMs?: number;
}

/**
 * 功能：描述酒馆纯净发送所使用的消息结构。
 */
export interface TavernRawMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 功能：描述酒馆后端可识别的 JSON Schema 包装结构。
 */
export interface TavernRawJsonSchema {
  name?: string;
  description?: string;
  strict?: boolean;
  value?: object;
}

/**
 * 功能：描述酒馆纯净发送时可覆盖的请求选项。
 */
export interface TavernRawRequestOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  jsonSchema?: object | TavernRawJsonSchema;
}

/**
 * 功能：描述酒馆 LLM 能力可用性。
 */
export interface TavernLlmAvailability {
  available: boolean;
  hasContext: boolean;
  hasGenerateApi: boolean;
  hasGenerateRawApi: boolean;
  model: string;
  message: string;
}

/**
 * 功能：描述酒馆连接信息面板中的单条展示项。
 */
export interface TavernConnectionInfoItem {
  label: string;
  value: string;
}

/**
 * 功能：描述当前酒馆 Chat Completion 连接快照。
 */
export interface TavernConnectionSnapshot {
  available: boolean;
  message: string;
  mainApi: string;
  chatCompletionSource: string;
  model: string;
  items: TavernConnectionInfoItem[];
}

type TavernQuietGenerate = (prompt: string, opts?: Record<string, unknown>) => Promise<unknown>;
type TavernRawGenerate = (...args: unknown[]) => Promise<unknown>;

interface TavernResolvedChatCompletionSettings {
  mainApi: string;
  chatCompletionSource: string;
  model: string;
  settings: Record<string, unknown>;
}

interface TavernResolvedJsonSchema {
  name: string;
  description?: string;
  strict?: boolean;
  value: object;
}

interface TavernRequestBodyBuildResult {
  body: Record<string, unknown>;
  removedFields: string[];
}

interface TavernSingleAttemptResult {
  ok: boolean;
  content: string;
  message?: string;
  errorCode?: string;
  detail?: string;
  latencyMs: number;
  httpStatus?: number;
  backendMessage?: string;
}

const CHAT_COMPLETION_MODEL_KEY_BY_SOURCE: Record<string, string> = {
  openai: "openai_model",
  claude: "claude_model",
  openrouter: "openrouter_model",
  ai21: "ai21_model",
  makersuite: "google_model",
  vertexai: "vertexai_model",
  mistralai: "mistralai_model",
  custom: "custom_model",
  cohere: "cohere_model",
  perplexity: "perplexity_model",
  groq: "groq_model",
  electronhub: "electronhub_model",
  chutes: "chutes_model",
  nanogpt: "nanogpt_model",
  deepseek: "deepseek_model",
  aimlapi: "aimlapi_model",
  xai: "xai_model",
  pollinations: "pollinations_model",
  moonshot: "moonshot_model",
  fireworks: "fireworks_model",
  cometapi: "cometapi_model",
  azure_openai: "azure_openai_model",
  zai: "zai_model",
  siliconflow: "siliconflow_model",
};

const CHAT_COMPLETION_MODEL_SELECTOR_BY_SOURCE: Record<string, string[]> = {
  openai: ["#model_openai_select"],
  claude: ["#model_claude_select"],
  openrouter: ["#model_openrouter_select"],
  ai21: ["#model_ai21_select"],
  makersuite: ["#model_google_select"],
  vertexai: ["#model_vertexai_select"],
  mistralai: ["#model_mistralai_select"],
  custom: ["#custom_model_id", "#model_custom_select"],
  cohere: ["#model_cohere_select"],
  perplexity: ["#model_perplexity_select"],
  groq: ["#model_groq_select"],
  electronhub: ["#model_electronhub_select"],
  chutes: ["#model_chutes_select"],
  nanogpt: ["#model_nanogpt_select"],
  deepseek: ["#model_deepseek_select"],
  aimlapi: ["#model_aimlapi_select"],
  xai: ["#model_xai_select"],
  pollinations: ["#model_pollinations_select"],
  moonshot: ["#model_moonshot_select"],
  fireworks: ["#model_fireworks_select"],
  cometapi: ["#model_cometapi_select"],
  azure_openai: ["#azure_openai_model"],
  zai: ["#model_zai_select"],
  siliconflow: ["#model_siliconflow_select"],
};

const CHAT_COMPLETION_SOURCE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  claude: "Claude",
  openrouter: "OpenRouter",
  ai21: "AI21",
  makersuite: "Google AI Studio",
  vertexai: "Vertex AI",
  mistralai: "Mistral",
  custom: "自定义兼容接口",
  cohere: "Cohere",
  perplexity: "Perplexity",
  groq: "Groq",
  electronhub: "ElectronHub",
  chutes: "Chutes",
  nanogpt: "NanoGPT",
  deepseek: "DeepSeek",
  aimlapi: "AIMLAPI",
  xai: "xAI",
  pollinations: "Pollinations",
  moonshot: "Moonshot",
  fireworks: "Fireworks",
  cometapi: "CometAPI",
  azure_openai: "Azure OpenAI",
  zai: "智谱 ZAI",
  siliconflow: "SiliconFlow",
};

const TAVERN_MINIMAL_STAGE_REMOVED_FIELDS: string[] = [
  "json_schema",
  "response_format",
  "include_reasoning",
  "reasoning_effort",
  "verbosity",
  "enable_web_search",
  "top_k",
  "top_a",
  "min_p",
  "repetition_penalty",
  "use_fallback",
  "provider",
  "quantizations",
  "allow_fallbacks",
  "middleout",
  "use_sysprompt",
  "seed",
];

const TAVERN_MINIMAL_STAGE_KEEP_FIELDS: Set<string> = new Set([
  "type",
  "messages",
  "model",
  "temperature",
  "max_tokens",
  "stream",
  "chat_completion_source",
  "reverse_proxy",
  "proxy_password",
  "azure_base_url",
  "azure_deployment_name",
  "azure_api_version",
  "vertexai_auth_mode",
  "vertexai_region",
  "vertexai_express_project_id",
  "zai_endpoint",
  "custom_url",
  "custom_include_body",
  "custom_exclude_body",
  "custom_include_headers",
]);

/**
 * 功能：读取酒馆静默生成接口。
 * 返回：
 *   TavernQuietGenerate | null：静默生成函数或空值。
 */
function getGlobalGenerate(): TavernQuietGenerate | null {
  const globalRef = globalThis as Record<string, unknown>;
  if (typeof globalRef.generateQuietPrompt === "function") {
    return globalRef.generateQuietPrompt as TavernQuietGenerate;
  }
  if (typeof globalRef.Generate === "function") {
    return globalRef.Generate as TavernQuietGenerate;
  }
  const context = getSillyTavernContextEvent() as Record<string, unknown> | null;
  if (context && typeof context.generateQuietPrompt === "function") {
    return context.generateQuietPrompt as TavernQuietGenerate;
  }
  return null;
}

/**
 * 功能：读取酒馆 `generateRaw` 接口，仅用于能力信息展示。
 * 返回：
 *   TavernRawGenerate | null：raw 生成函数或空值。
 */
function getGlobalGenerateRaw(): TavernRawGenerate | null {
  const globalRef = globalThis as Record<string, unknown>;
  if (typeof globalRef.generateRaw === "function") {
    return globalRef.generateRaw as TavernRawGenerate;
  }
  const context = getSillyTavernContextEvent() as Record<string, unknown> | null;
  if (context && typeof context.generateRaw === "function") {
    return context.generateRaw as TavernRawGenerate;
  }
  return null;
}

/**
 * 功能：读取当前酒馆主接口名称。
 * 返回：
 *   string：主接口标识。
 */
function readMainApi(): string {
  const globalRef = globalThis as Record<string, unknown>;
  const directMainApi = extractMainApiValue(globalRef.main_api);
  if (directMainApi) {
    return directMainApi;
  }

  const context = getSillyTavernContextEvent();
  const contextMainApi = extractMainApiValue(context?.mainApi);
  if (contextMainApi) {
    return contextMainApi;
  }

  if (typeof document !== "undefined") {
    const mainApiSelect = document.getElementById("main_api");
    const domMainApi = extractMainApiValue(mainApiSelect);
    if (domMainApi) {
      return domMainApi;
    }
  }

  return "";
}

/**
 * 功能：从多种宿主对象中提取主接口值。
 * 参数：
 *   source (unknown)：可能是字符串、带 value 的 DOM 节点或其他宿主对象。
 * 返回：
 *   string：解析出的主接口标识；失败时返回空字符串。
 */
function extractMainApiValue(source: unknown): string {
  const direct = normalizeString(source);
  if (direct && direct !== "[object HTMLSelectElement]") {
    return direct;
  }

  if (source && typeof source === "object" && "value" in (source as Record<string, unknown>)) {
    const valueText = normalizeString((source as { value?: unknown }).value);
    if (valueText) {
      return valueText;
    }
  }

  return "";
}

/**
 * 功能：从页面控件读取当前 Chat Completion 来源。
 * 返回：
 *   string：当前来源；未找到时返回空字符串。
 */
function readChatCompletionSourceFromDom(): string {
  if (typeof document === "undefined") {
    return "";
  }

  const sourceSelect = document.getElementById("chat_completion_source");
  return extractMainApiValue(sourceSelect);
}

/**
 * 功能：从页面控件读取当前 Chat Completion 模型。
 * 参数：
 *   source (string)：当前来源。
 * 返回：
 *   string：当前模型；未找到时返回空字符串。
 */
function readChatCompletionModelFromDom(source: string): string {
  if (typeof document === "undefined") {
    return "";
  }

  const selectors = CHAT_COMPLETION_MODEL_SELECTOR_BY_SOURCE[source] ?? [];
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const modelValue = extractMainApiValue(element);
    if (modelValue) {
      return modelValue;
    }
  }

  return "";
}

/**
 * 功能：读取当前 chat-completion 设置与模型。
 * 返回：
 *   TavernResolvedChatCompletionSettings：解析后的设置快照。
 */
function resolveChatCompletionSettings(): TavernResolvedChatCompletionSettings {
  const globalRef = globalThis as Record<string, unknown>;
  const context = getSillyTavernContextEvent();
  const settingsRaw = globalRef.oai_settings ?? context?.chatCompletionSettings;
  const settings =
    settingsRaw && typeof settingsRaw === "object" && !Array.isArray(settingsRaw)
      ? (settingsRaw as Record<string, unknown>)
      : {};
  const mainApi = readMainApi();
  const chatCompletionSource =
    normalizeString(settings.chat_completion_source) ||
    readChatCompletionSourceFromDom() ||
    "openai";
  const modelKey = CHAT_COMPLETION_MODEL_KEY_BY_SOURCE[chatCompletionSource] ?? "openai_model";
  const model = normalizeString(settings[modelKey]) || readChatCompletionModelFromDom(chatCompletionSource);

  return {
    mainApi,
    chatCompletionSource,
    model,
    settings,
  };
}

/**
 * 功能：获取 Chat Completion 来源的友好显示名称。
 * 参数：
 *   source (string)：酒馆当前使用的来源标识。
 * 返回：
 *   string：适合展示给用户的来源名称。
 */
function getChatCompletionSourceLabel(source: string): string {
  return CHAT_COMPLETION_SOURCE_LABELS[source] || source || "未设置";
}

/**
 * 功能：把任意设置值格式化为适合展示的文本。
 * 参数：
 *   value (unknown)：原始设置值。
 *   fallback (string)：值为空时使用的后备文案。
 * 返回：
 *   string：格式化后的展示文本。
 */
function formatDisplayValue(value: unknown, fallback = "未设置"): string {
  if (typeof value === "boolean") {
    return value ? "开启" : "关闭";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  const text = normalizeString(value);
  return text || fallback;
}

/**
 * 功能：向连接信息列表中追加一条展示项。
 * 参数：
 *   items (TavernConnectionInfoItem[])：目标展示项数组。
 *   label (string)：展示标签。
 *   value (unknown)：原始值。
 *   fallback (string)：值为空时使用的后备文案。
 * 返回：
 *   void：无返回值。
 */
function pushConnectionInfoItem(
  items: TavernConnectionInfoItem[],
  label: string,
  value: unknown,
  fallback = "未设置"
): void {
  items.push({
    label,
    value: formatDisplayValue(value, fallback),
  });
}

/**
 * 功能：解析当前来源对应的接口地址展示文案。
 * 参数：
 *   source (string)：酒馆当前使用的来源标识。
 *   settings (Record<string, unknown>)：当前 Chat Completion 设置。
 * 返回：
 *   TavernConnectionInfoItem：接口地址展示项。
 */
function resolveEndpointInfo(
  source: string,
  settings: Record<string, unknown>
): TavernConnectionInfoItem {
  const reverseProxy = normalizeString(settings.reverse_proxy);
  if (reverseProxy) {
    return { label: "接口地址", value: reverseProxy };
  }

  if (source === "custom") {
    return {
      label: "接口地址",
      value: formatDisplayValue(settings.custom_url, "未设置自定义地址"),
    };
  }

  if (source === "azure_openai") {
    return {
      label: "Azure 地址",
      value: formatDisplayValue(settings.azure_base_url, "未设置 Azure Base URL"),
    };
  }

  if (source === "zai") {
    return {
      label: "接口地址",
      value: formatDisplayValue(settings.zai_endpoint, "未设置 ZAI 端点"),
    };
  }

  return {
    label: "接口地址",
    value: "未设置自定义地址，使用酒馆当前来源默认链路",
  };
}

/**
 * 功能：构建用于设置面板展示的酒馆连接信息项。
 * 参数：
 *   resolved (TavernResolvedChatCompletionSettings)：解析后的连接配置。
 * 返回：
 *   TavernConnectionInfoItem[]：可直接渲染的展示项列表。
 */
function buildTavernConnectionInfoItems(
  resolved: TavernResolvedChatCompletionSettings
): TavernConnectionInfoItem[] {
  const settings = resolved.settings;
  const items: TavernConnectionInfoItem[] = [];
  const endpointInfo = resolveEndpointInfo(resolved.chatCompletionSource, settings);

  pushConnectionInfoItem(items, "主接口", resolved.mainApi, "未读取到");
  pushConnectionInfoItem(
    items,
    "来源",
    resolved.chatCompletionSource
      ? `${getChatCompletionSourceLabel(resolved.chatCompletionSource)} (${resolved.chatCompletionSource})`
      : "",
    "未读取到"
  );
  pushConnectionInfoItem(items, "模型", resolved.model, "未选择");
  items.push(endpointInfo);
  pushConnectionInfoItem(items, "最大输出", settings.openai_max_tokens, "未设置");
  pushConnectionInfoItem(items, "温度", settings.temp_openai, "未设置");
  pushConnectionInfoItem(items, "Top P", settings.top_p_openai, "未设置");

  if ("top_k_openai" in settings) {
    pushConnectionInfoItem(items, "Top K", settings.top_k_openai, "未设置");
  }

  if (resolved.chatCompletionSource === "azure_openai") {
    pushConnectionInfoItem(items, "部署名", settings.azure_deployment_name, "未设置");
    pushConnectionInfoItem(items, "API 版本", settings.azure_api_version, "未设置");
  }

  if (resolved.chatCompletionSource === "vertexai") {
    pushConnectionInfoItem(items, "区域", settings.vertexai_region, "未设置");
    pushConnectionInfoItem(items, "项目 ID", settings.vertexai_express_project_id, "未设置");
  }

  if ("reasoning_effort" in settings) {
    pushConnectionInfoItem(items, "推理强度", settings.reasoning_effort, "未设置");
  }

  if ("verbosity" in settings) {
    pushConnectionInfoItem(items, "输出详略", settings.verbosity, "未设置");
  }

  return items;
}

/**
 * 功能：读取当前酒馆已选择的模型名称。
 * 返回：
 *   string：当前模型名称，未知时返回空字符串。
 */
function readCurrentModel(): string {
  try {
    const resolved = resolveChatCompletionSettings();
    if (resolved.model) {
      return resolved.model;
    }

    const globalRef = globalThis as Record<string, unknown>;
    const modelName = normalizeString(globalRef.model_name ?? globalRef.online_status);
    if (modelName) {
      return modelName;
    }

    return resolved.mainApi ? `(${resolved.mainApi})` : "";
  } catch {
    return "";
  }
}

/**
 * 功能：从宿主上下文中读取请求头。
 * 返回：
 *   Record<string, string>：请求头对象。
 */
function getRequestHeaders(): Record<string, string> {
  const context = getSillyTavernContextEvent();
  if (context && typeof context.getRequestHeaders === "function") {
    const headers = context.getRequestHeaders();
    if (headers && typeof headers === "object") {
      return headers;
    }
  }
  return {
    "Content-Type": "application/json",
  };
}

/**
 * 功能：规范化字符串值。
 * 参数：
 *   value (unknown)：待规范化的值。
 * 返回：
 *   string：去空白后的字符串；无效时返回空字符串。
 */
function normalizeString(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text || text === "undefined" || text === "null") {
    return "";
  }
  return text;
}

/**
 * 功能：把未知值转换为布尔值。
 * 参数：
 *   value (unknown)：待转换的值。
 * 返回：
 *   boolean：转换结果。
 */
function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = normalizeString(value).toLowerCase();
  return text === "true" || text === "1" || text === "yes" || text === "on";
}

/**
 * 功能：把未知值转换为有限数字。
 * 参数：
 *   value (unknown)：待转换的值。
 *   fallback (number)：转换失败时使用的默认值。
 * 返回：
 *   number：解析后的数字。
 */
function normalizeNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

/**
 * 功能：在值有效时写入对象字段。
 * 参数：
 *   target (Record<string, unknown>)：目标对象。
 *   key (string)：字段名。
 *   value (unknown)：待写入值。
 * 返回：
 *   void：无返回值。
 */
function assignIfPresent(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value === "string" && !value.trim()) {
    return;
  }
  if (Array.isArray(value) && value.length === 0) {
    return;
  }
  target[key] = value;
}

/**
 * 功能：解析后端错误信息。
 * 参数：
 *   result (unknown)：后端返回体。
 * 返回：
 *   string：错误文本；未找到时返回空字符串。
 */
function extractErrorText(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const record = result as Record<string, unknown>;
  const directMessage = normalizeString(record.message);
  const error = record.error;

  if (typeof error === "string") {
    return normalizeString(error);
  }

  if (error && typeof error === "object") {
    const errorRecord = error as Record<string, unknown>;
    const nestedMessage = normalizeString(errorRecord.message);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  if (record.error === true && directMessage) {
    return directMessage;
  }

  return "";
}

/**
 * 功能：把返回值统一提取为文本。
 * 参数：
 *   result (unknown)：原始返回值。
 * 返回：
 *   string：提取后的文本内容。
 */
function extractResultText(result: unknown): string {
  if (typeof result === "string") {
    return result.trim();
  }

  if (!result || typeof result !== "object") {
    return String(result ?? "").trim();
  }

  const resultRecord = result as Record<string, unknown>;
  const directCandidates: unknown[] = [
    resultRecord.content,
    resultRecord.text,
    resultRecord.message,
    resultRecord.response,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  const choices = resultRecord.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === "object") {
      const firstChoiceRecord = firstChoice as Record<string, unknown>;
      const message = firstChoiceRecord.message;
      if (message && typeof message === "object") {
        const messageRecord = message as Record<string, unknown>;
        if (typeof messageRecord.content === "string" && messageRecord.content.trim()) {
          return messageRecord.content.trim();
        }
      }
      if (typeof firstChoiceRecord.text === "string" && firstChoiceRecord.text.trim()) {
        return firstChoiceRecord.text.trim();
      }
    }
  }

  return String(result ?? "").trim();
}

/**
 * 功能：规范化 raw 消息列表，确保角色与正文可直接发送。
 * 参数：
 *   messages (TavernRawMessage[])：待发送的消息列表。
 * 返回：
 *   TavernRawMessage[]：规范化后的消息列表。
 */
function normalizeRawMessages(messages: TavernRawMessage[]): TavernRawMessage[] {
  return messages
    .filter((message: TavernRawMessage): boolean => {
      return message !== null && typeof message === "object";
    })
    .map((message: TavernRawMessage): TavernRawMessage => ({
      role: message.role,
      content: typeof message.content === "string" ? message.content : String(message.content ?? ""),
    }))
    .filter((message: TavernRawMessage): boolean => {
      return message.role === "system" || message.role === "user" || message.role === "assistant";
    });
}

/**
 * 功能：把传入的 JSON 模式选项转换为酒馆后端可识别的结构。
 * 参数：
 *   options (TavernRawRequestOptions | undefined)：发送选项。
 * 返回：
 *   TavernResolvedJsonSchema | undefined：规范化后的 Schema。
 */
function resolveJsonSchema(options?: TavernRawRequestOptions): TavernResolvedJsonSchema | undefined {
  const rawSchema = options?.jsonSchema;
  if (rawSchema && typeof rawSchema === "object" && !Array.isArray(rawSchema)) {
    const schemaRecord = rawSchema as Record<string, unknown>;
    const schemaValue = schemaRecord.value;
    if (schemaValue && typeof schemaValue === "object" && !Array.isArray(schemaValue)) {
      return {
        name: normalizeString(schemaRecord.name) || "llmhub_response",
        description: normalizeString(schemaRecord.description) || "LLMHub JSON 输出",
        strict: schemaRecord.strict !== false,
        value: schemaValue as object,
      };
    }

    return {
      name: "llmhub_response",
      description: "LLMHub JSON 输出",
      strict: true,
      value: rawSchema as object,
    };
  }

  return undefined;
}

/**
 * 功能：判断传入 schema 是否满足 OpenAI 严格 json_schema 响应格式要求。
 * 参数：
 *   schema (unknown)：待检查的 schema。
 * 返回：
 *   boolean：兼容时返回 true，否则返回 false。
 */
function isStrictJsonSchemaCompatible(schema: unknown): boolean {
  return checkStrictJsonSchemaNode(schema, 0);
}

/**
 * 功能：递归检查 schema 节点是否显式声明 additionalProperties=false。
 * 参数：
 *   node (unknown)：当前 schema 节点。
 *   depth (number)：当前递归深度。
 * 返回：
 *   boolean：节点兼容时返回 true，否则返回 false。
 */
function checkStrictJsonSchemaNode(node: unknown, depth: number): boolean {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return true;
  }
  if (depth >= 12) {
    return true;
  }

  const record = node as Record<string, unknown>;
  if (record.type === "object") {
    if (!("additionalProperties" in record) || record.additionalProperties !== false) {
      return false;
    }
  }

  if (record.properties && typeof record.properties === "object" && !Array.isArray(record.properties)) {
    for (const child of Object.values(record.properties as Record<string, unknown>)) {
      if (!checkStrictJsonSchemaNode(child, depth + 1)) {
        return false;
      }
    }
  }

  if (record.items !== undefined && !checkStrictJsonSchemaNode(record.items, depth + 1)) {
    return false;
  }

  const compositeKeys = ["anyOf", "oneOf", "allOf", "prefixItems"];
  for (const key of compositeKeys) {
    if (record[key] !== undefined) {
      return false;
    }
  }

  if (record.additionalProperties && typeof record.additionalProperties === "object" && !Array.isArray(record.additionalProperties)) {
    return checkStrictJsonSchemaNode(record.additionalProperties, depth + 1);
  }

  return true;
}

/**
 * 功能：构造纯净 chat-completion 后端请求体。
 * 参数：
 *   messages (TavernRawMessage[])：待发送消息。
 *   options (TavernRawRequestOptions | undefined)：发送选项。
 * 返回：
 *   Record<string, unknown>：请求体对象。
 */
function buildChatCompletionRequestBody(
  messages: TavernRawMessage[],
  options: TavernRawRequestOptions | undefined,
  stage: TavernCompatStage
): TavernRequestBodyBuildResult {
  const resolved = resolveChatCompletionSettings();
  const settings = resolved.settings;
  const source = resolved.chatCompletionSource;
  const body: Record<string, unknown> = {
    type: "quiet",
    messages,
    model: resolved.model,
    temperature: normalizeNumber(options?.temperature, normalizeNumber(settings.temp_openai, 1)),
    frequency_penalty: normalizeNumber(settings.freq_pen_openai, 0),
    presence_penalty: normalizeNumber(settings.pres_pen_openai, 0),
    top_p: normalizeNumber(settings.top_p_openai, 1),
    max_tokens: normalizeNumber(options?.maxTokens, normalizeNumber(settings.openai_max_tokens, 300)),
    stream: false,
    chat_completion_source: resolved.chatCompletionSource,
    include_reasoning: normalizeBoolean(settings.show_thoughts),
  };

  assignIfPresent(body, "reasoning_effort", normalizeString(settings.reasoning_effort));
  assignIfPresent(body, "verbosity", normalizeString(settings.verbosity));
  assignIfPresent(body, "reverse_proxy", normalizeString(settings.reverse_proxy));
  assignIfPresent(body, "proxy_password", normalizeString(settings.proxy_password));

  if (["claude", "openrouter", "makersuite", "vertexai", "cohere", "perplexity", "electronhub", "chutes", "zai", "nanogpt"].includes(source)) {
    assignIfPresent(body, "top_k", normalizeNumber(settings.top_k_openai, 0));
  }

  if (["claude", "makersuite", "vertexai"].includes(source) && "use_sysprompt" in settings) {
    body.use_sysprompt = normalizeBoolean(settings.use_sysprompt);
  }
  if ("enable_web_search" in settings) {
    body.enable_web_search = normalizeBoolean(settings.enable_web_search);
  }

  if (["openrouter", "chutes", "nanogpt"].includes(source)) {
    assignIfPresent(body, "min_p", normalizeNumber(settings.min_p_openai, 0));
    assignIfPresent(body, "repetition_penalty", normalizeNumber(settings.repetition_penalty_openai, 1));
  }

  if (["openrouter", "nanogpt"].includes(source)) {
    assignIfPresent(body, "top_a", normalizeNumber(settings.top_a_openai, 0));
  }

  if (source === "openrouter") {
    assignIfPresent(body, "use_fallback", settings.openrouter_use_fallback);
    assignIfPresent(body, "provider", settings.openrouter_providers);
    assignIfPresent(body, "quantizations", settings.openrouter_quantizations);
    assignIfPresent(body, "allow_fallbacks", settings.openrouter_allow_fallbacks);
    assignIfPresent(body, "middleout", settings.openrouter_middleout);
  }

  if (source === "azure_openai") {
    assignIfPresent(body, "azure_base_url", normalizeString(settings.azure_base_url));
    assignIfPresent(body, "azure_deployment_name", normalizeString(settings.azure_deployment_name));
    assignIfPresent(body, "azure_api_version", normalizeString(settings.azure_api_version));
  }

  if (source === "vertexai") {
    assignIfPresent(body, "vertexai_auth_mode", normalizeString(settings.vertexai_auth_mode));
    assignIfPresent(body, "vertexai_region", normalizeString(settings.vertexai_region));
    assignIfPresent(body, "vertexai_express_project_id", normalizeString(settings.vertexai_express_project_id));
  }

  if (source === "zai") {
    assignIfPresent(body, "zai_endpoint", normalizeString(settings.zai_endpoint));
  }

  if (source === "custom") {
    assignIfPresent(body, "custom_url", normalizeString(settings.custom_url));
    assignIfPresent(body, "custom_include_body", normalizeString(settings.custom_include_body));
    assignIfPresent(body, "custom_exclude_body", normalizeString(settings.custom_exclude_body));
    assignIfPresent(body, "custom_include_headers", normalizeString(settings.custom_include_headers));
  }

  const seed = Number(settings.seed);
  if (Number.isInteger(seed) && seed >= 0) {
    body.seed = seed;
  }

  const jsonSchema = resolveJsonSchema(options);
  const canUseStrictJsonSchema = jsonSchema ? isStrictJsonSchemaCompatible(jsonSchema.value) : false;
  if (stage === "structured_schema" && jsonSchema && canUseStrictJsonSchema) {
    body.json_schema = jsonSchema;
  } else if ((stage === "structured_schema" || stage === "structured_json_object") && options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  if (stage !== "minimal_prompt_json_only") {
    return { body, removedFields: [] };
  }

  const minimalBody: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (TAVERN_MINIMAL_STAGE_KEEP_FIELDS.has(key)) {
      minimalBody[key] = body[key];
    }
  }
  return {
    body: minimalBody,
    removedFields: TAVERN_MINIMAL_STAGE_REMOVED_FIELDS.slice(),
  };
}

/**
 * 功能：判断当前请求是否属于结构化输出请求。
 * @param options 纯净发送选项。
 * @returns 是否需要启用结构化兼容降级链。
 */
function isStructuredRequest(options?: TavernRawRequestOptions): boolean {
  return Boolean(options?.jsonMode || resolveJsonSchema(options));
}

/**
 * 功能：根据请求形态生成需要尝试的兼容阶段列表。
 * @param options 纯净发送选项。
 * @returns 兼容阶段列表。
 */
function resolveCompatStages(options?: TavernRawRequestOptions): TavernCompatStage[] {
  const hasSchema = Boolean(resolveJsonSchema(options));
  const wantsJson = Boolean(options?.jsonMode);
  if (!hasSchema && !wantsJson) {
    return ["standard"];
  }
  const stages: TavernCompatStage[] = [];
  if (hasSchema) {
    stages.push("structured_schema");
  }
  if (wantsJson || hasSchema) {
    stages.push("structured_json_object", "prompt_json_only", "minimal_prompt_json_only");
  }
  return stages;
}

/**
 * 功能：构建调试用的请求体摘要，避免日志里重复展开完整消息内容。
 * @param body 请求体。
 * @returns 精简后的请求摘要。
 */
function buildRequestBodySummary(body: Record<string, unknown>): TavernCompatAttempt["requestBodySummary"] {
  const responseFormat = body.response_format;
  const responseType = responseFormat && typeof responseFormat === "object"
    ? normalizeString((responseFormat as { type?: unknown }).type) || "object"
    : null;
  return {
    model: normalizeString(body.model),
    source: normalizeString(body.chat_completion_source),
    maxTokens: normalizeNumber(body.max_tokens, 0),
    hasJsonSchema: Boolean(body.json_schema),
    responseFormat: responseType,
    fieldKeys: Object.keys(body).sort(),
  };
}

/**
 * 功能：复制最终请求体，供请求日志显示最终真正发送的内容。
 * @param body 请求体。
 * @returns 可安全写入日志的对象副本。
 */
function cloneRequestBody(body: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
  } catch {
    return { ...body };
  }
}

/**
 * 功能：判断失败是否属于结构化输出兼容问题，从而决定是否进入下一层降级。
 * @param result 单次尝试结果。
 * @returns 是否应该继续降级重试。
 */
function shouldRetryCompatAttempt(result: TavernSingleAttemptResult): boolean {
  const text = `${result.message || ""}\n${result.detail || ""}\n${result.backendMessage || ""}`.toLowerCase();
  return result.httpStatus === 400
    || text.includes("bad request")
    || text.includes("response_format")
    || text.includes("json_schema");
}

/**
 * 功能：执行单次 Tavern 纯净请求，不负责降级链决策。
 * @param requestBody 当前阶段的请求体。
 * @returns 单次请求结果。
 */
async function executeTavernChatCompletionAttempt(
  requestBody: Record<string, unknown>
): Promise<TavernSingleAttemptResult> {
  const start = Date.now();
  try {
    const response = await fetch("/api/backends/chat-completions/generate", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const rawText = await response.text().catch((): string => "");
      const parsed = tryParseJson(rawText);
      const backendMessage = extractErrorText(parsed);
      const detail = typeof parsed === "string" ? parsed : rawText;
      return {
        ok: false,
        content: "",
        message: backendMessage
          ? `酒馆纯净请求失败：${backendMessage}`
          : `酒馆纯净请求失败 (${response.status})`,
        errorCode: "CHAT_COMPLETION_HTTP_ERROR",
        detail,
        latencyMs: Date.now() - start,
        httpStatus: response.status,
        backendMessage,
      };
    }

    const contentType = normalizeString(response.headers.get("content-type"));
    const payload: unknown = contentType.includes("application/json") ? await response.json() : await response.text();
    const backendError = extractErrorText(payload);
    if (backendError) {
      return {
        ok: false,
        content: "",
        message: `酒馆纯净请求失败：${backendError}`,
        errorCode: "CHAT_COMPLETION_ERROR",
        detail: backendError,
        latencyMs: Date.now() - start,
        backendMessage: backendError,
      };
    }

    const content = extractResultText(payload);
    if (!content) {
      // @ts-ignore 旧逻辑已废弃，仅保留历史代码占位。
      return {
        ok: false,
        content: "",
        message: "酒馆返回空响应",
        errorCode: "EMPTY_RESPONSE",
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      content,
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      content: "",
      message: `酒馆纯净请求失败：${message}`,
      errorCode: "CHAT_COMPLETION_FETCH_ERROR",
      detail: message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * 功能：安全解析 JSON 文本。
 * 参数：
 *   raw (string)：原始文本。
 * 返回：
 *   unknown：解析结果；失败时返回原文本。
 */
function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * 功能：通过酒馆 chat-completion 后端执行真正纯净的消息发送。
 * 参数：
 *   messages (TavernRawMessage[])：待发送消息。
 *   options (TavernRawRequestOptions | undefined)：发送选项。
 * 返回：
 *   Promise<TavernChatResult>：请求结果。
 */
async function runTavernDirectChatCompletion(
  messages: TavernRawMessage[],
  options?: TavernRawRequestOptions
): Promise<any> {
  const start = Date.now();
  const resolved = resolveChatCompletionSettings();

  if (resolved.mainApi !== "openai") {
    return {
      ok: false,
      content: "",
      message: `当前酒馆主接口为 ${resolved.mainApi || "unknown"}，纯净直连目前仅支持 Chat Completion`,
      errorCode: "UNSUPPORTED_MAIN_API",
      latencyMs: Date.now() - start,
    };
  }

  if (!resolved.chatCompletionSource) {
    return {
      ok: false,
      content: "",
      message: "未读取到 Chat Completion 来源配置",
      errorCode: "NO_CHAT_COMPLETION_SOURCE",
      latencyMs: Date.now() - start,
    };
  }

  if (!resolved.model) {
    return {
      ok: false,
      content: "",
      message: "当前未选择 Chat Completion 模型",
      errorCode: "NO_MODEL",
      latencyMs: Date.now() - start,
    };
  }

  try {
    const compatStages = resolveCompatStages(options);
    const compatTrace: TavernCompatAttempt[] = [];
    let lastResult: TavernSingleAttemptResult | null = null;
    let lastStage: TavernCompatStage = compatStages[compatStages.length - 1] ?? "standard";
    let lastRequestBody: Record<string, unknown> | undefined;

    for (let index = 0; index < compatStages.length; index += 1) {
      const stage = compatStages[index];
      const requestBuild = buildChatCompletionRequestBody(messages, options, stage);
      const requestBody = requestBuild.body;
      lastStage = stage;
      lastRequestBody = cloneRequestBody(requestBody);

      const attemptResult = await executeTavernChatCompletionAttempt(requestBody);
      compatTrace.push({
        stage,
        removedFields: requestBuild.removedFields,
        requestBodySummary: buildRequestBodySummary(requestBody),
        httpStatus: attemptResult.httpStatus,
        backendMessage: attemptResult.backendMessage,
        errorCode: attemptResult.errorCode,
        detail: attemptResult.detail,
        succeeded: attemptResult.ok,
      });

      if (attemptResult.ok) {
        return {
          ok: true,
          content: attemptResult.content,
          latencyMs: Date.now() - start,
          compatTrace,
          finalAttemptStage: stage,
          finalRequestBody: lastRequestBody,
        };
      }

      lastResult = attemptResult;
      const canRetry = isStructuredRequest(options)
        && index < compatStages.length - 1
        && shouldRetryCompatAttempt(attemptResult);
      if (!canRetry) {
        break;
      }
    }

    return {
      ok: false,
      content: "",
      message: lastResult?.message ?? "酒馆纯净请求失败",
      errorCode: lastResult?.errorCode,
      detail: lastResult?.detail,
      latencyMs: Date.now() - start,
      compatTrace,
      finalAttemptStage: lastStage,
      finalRequestBody: lastRequestBody,
    };
    const requestBody = buildChatCompletionRequestBody(messages, options, "standard").body;
    const response = await fetch("/api/backends/chat-completions/generate", {
      method: "POST",
      headers: getRequestHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const rawText = await response.text().catch((): string => "");
      const parsed = tryParseJson(rawText);
      const backendMessage = extractErrorText(parsed);
      const detail = typeof parsed === "string" ? parsed : rawText;
      return {
        ok: false,
        content: "",
        message: backendMessage
          ? `酒馆纯净请求失败：${backendMessage}`
          : `酒馆纯净请求失败 (${response.status})`,
        errorCode: "CHAT_COMPLETION_HTTP_ERROR",
        detail,
        latencyMs: Date.now() - start,
      };
    }

    const contentType = normalizeString(response.headers.get("content-type"));
    const payload: unknown = contentType.includes("application/json") ? await response.json() : await response.text();
    const backendError = extractErrorText(payload);
    if (backendError) {
      return {
        ok: false,
        content: "",
        message: `酒馆纯净请求失败：${backendError}`,
        errorCode: "CHAT_COMPLETION_ERROR",
        detail: backendError,
        latencyMs: Date.now() - start,
      };
    }

    const content = extractResultText(payload);
    if (!content) {
      return {
        ok: false,
        content: "",
        message: "酒馆返回空响应",
        errorCode: "EMPTY_RESPONSE",
        latencyMs: Date.now() - start,
      };
    }

    return {
      ok: true,
      content,
      latencyMs: Date.now() - start,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      content: "",
      message: `酒馆纯净请求失败：${message}`,
      errorCode: "CHAT_COMPLETION_FETCH_ERROR",
      detail: message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * 功能：构造酒馆可用性失败时的错误码。
 * 参数：
 *   availability (TavernLlmAvailability)：当前可用性快照。
 * 返回：
 *   string：错误码。
 */
function getAvailabilityErrorCode(availability: TavernLlmAvailability): string {
  if (!availability.hasContext) {
    return "NO_CONTEXT";
  }
  if (readMainApi() !== "openai") {
    return "UNSUPPORTED_MAIN_API";
  }
  if (!availability.model) {
    return "NO_MODEL";
  }
  return "UNAVAILABLE";
}

/**
 * 功能：检测酒馆 LLM 是否具备真正纯净发送能力。
 * 返回：
 *   TavernLlmAvailability：可用性结果。
 */
export function getTavernLlmAvailability(): TavernLlmAvailability {
  const context = getSillyTavernContextEvent();
  const hasContext = context !== null;
  const hasGenerateApi = getGlobalGenerate() !== null;
  const hasGenerateRawApi = getGlobalGenerateRaw() !== null;
  const resolved = resolveChatCompletionSettings();
  const model = readCurrentModel();
  const available = hasContext && resolved.mainApi === "openai" && Boolean(resolved.chatCompletionSource) && Boolean(model);

  let message: string;
  if (!hasContext) {
    message = "未检测到酒馆上下文";
  } else if (resolved.mainApi !== "openai") {
    message = `当前酒馆主接口为 ${resolved.mainApi || "unknown"}，纯净直连目前仅支持 Chat Completion`;
  } else if (!resolved.chatCompletionSource) {
    message = "未读取到 Chat Completion 来源配置";
  } else if (!model) {
    message = "当前未选择 Chat Completion 模型";
  } else {
    message = "酒馆 LLM 可用于纯净直连发送";
  }

  return {
    available,
    hasContext,
    hasGenerateApi,
    hasGenerateRawApi,
    model,
    message,
  };
}

/**
 * 功能：读取当前酒馆 Chat Completion 连接快照，供设置面板展示。
 * 返回：
 *   TavernConnectionSnapshot：当前连接信息与展示项列表。
 */
export function getTavernConnectionSnapshot(): TavernConnectionSnapshot {
  const availability = getTavernLlmAvailability();
  const resolved = resolveChatCompletionSettings();

  return {
    available: availability.available,
    message: availability.message,
    mainApi: resolved.mainApi,
    chatCompletionSource: resolved.chatCompletionSource,
    model: resolved.model,
    items: buildTavernConnectionInfoItems(resolved),
  };
}

/**
 * 功能：读取酒馆当前模型名称。
 * 返回：
 *   string：当前模型名称。
 */
export function getTavernCurrentModel(): string {
  return readCurrentModel();
}

/**
 * 功能：通过酒馆静默生成执行请求，但会沿用宿主当前聊天上下文。
 * 参数：
 *   prompt (string)：待发送的纯文本提示词。
 * 返回：
 *   Promise<TavernChatResult>：请求结果。
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
    const content = extractResultText(result);
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
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      content: "",
      message: `酒馆静默请求失败：${message}`,
      errorCode: "GENERATE_ERROR",
      detail: message,
      latencyMs: Date.now() - start,
    };
  }
}

/**
 * 功能：通过酒馆后端纯净发送消息数组，不带当前聊天上下文，也不触发 prompt 注入流水线。
 * 参数：
 *   messages (TavernRawMessage[])：待发送的消息列表。
 *   options (TavernRawRequestOptions | undefined)：附加发送选项。
 * 返回：
 *   Promise<TavernChatResult>：请求结果。
 */
export async function runTavernRawMessages(
  messages: TavernRawMessage[],
  options?: TavernRawRequestOptions
): Promise<TavernChatResult> {
  const start = Date.now();
  const normalizedMessages = normalizeRawMessages(messages);
  if (normalizedMessages.length === 0) {
    return {
      ok: false,
      content: "",
      message: "待发送消息为空",
      errorCode: "EMPTY_MESSAGES",
      latencyMs: Date.now() - start,
    };
  }

  return runTavernDirectChatCompletion(normalizedMessages, options);
}

/**
 * 功能：把单个 prompt 作为 user 消息发送到酒馆纯净通道。
 * 参数：
 *   prompt (string)：待发送的文本提示词。
 * 返回：
 *   Promise<TavernChatResult>：请求结果。
 */
export async function runTavernRawPrompt(prompt: string): Promise<TavernChatResult> {
  return runTavernRawMessages([{ role: "user", content: prompt }]);
}

/**
 * 功能：测试酒馆 LLM 纯净直连能力。
 * 返回：
 *   Promise<TavernConnectionResult>：连接检测结果。
 */
export async function testTavernLlmConnection(): Promise<TavernConnectionResult> {
  const availability = getTavernLlmAvailability();
  if (!availability.available) {
    return {
      ok: false,
      message: availability.message,
      errorCode: getAvailabilityErrorCode(availability),
      model: availability.model || undefined,
      latencyMs: 0,
    };
  }

  const result = await runTavernRawMessages(
    [{ role: "user", content: "Reply with exactly: OK" }],
    {
      temperature: 0,
      maxTokens: 16,
    }
  );

  return {
    ok: result.ok,
    message: result.ok ? "酒馆纯净连接检测成功" : result.message || "检测失败",
    errorCode: result.ok ? undefined : result.errorCode,
    detail: result.detail,
    model: availability.model || undefined,
    latencyMs: result.latencyMs,
  };
}
