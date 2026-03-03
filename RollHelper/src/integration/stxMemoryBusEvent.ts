import { request } from "../../../SDK/bus/rpc";
import { subscribe } from "../../../SDK/bus/broadcast";

export const MEMORY_PLUGIN_NAMESPACE_Event = "stx_memory_os";
const ROLLHELPER_NAMESPACE_Event = "stx_rollhelper";

export interface MemoryPluginProbeResultEvent {
  available: boolean;
  enabled: boolean;
  pluginId: string;
  version: string;
  capabilities: string[];
}

export interface MemoryChatKeysResultEvent {
  chatKeys: string[];
  updatedAt: number | null;
}

export async function probeMemoryPluginEvent(timeoutMs = 1200): Promise<MemoryPluginProbeResultEvent> {
  try {
    const result = (await request(
      "plugin:request:ping",
      {},
      ROLLHELPER_NAMESPACE_Event,
      {
        to: MEMORY_PLUGIN_NAMESPACE_Event,
        timeoutMs,
      }
    )) as any;

    return {
      available: Boolean(result?.alive),
      enabled: Boolean(result?.isEnabled),
      pluginId: String(result?.pluginId ?? MEMORY_PLUGIN_NAMESPACE_Event),
      version: String(result?.version ?? ""),
      capabilities: Array.isArray(result?.capabilities)
        ? result.capabilities.map((item: unknown) => String(item))
        : [],
    };
  } catch {
    return {
      available: false,
      enabled: false,
      pluginId: MEMORY_PLUGIN_NAMESPACE_Event,
      version: "",
      capabilities: [],
    };
  }
}

export async function fetchMemoryChatKeysEvent(timeoutMs = 1200): Promise<MemoryChatKeysResultEvent> {
  try {
    const result = (await request(
      "plugin:request:memory_chat_keys",
      {},
      ROLLHELPER_NAMESPACE_Event,
      {
        to: MEMORY_PLUGIN_NAMESPACE_Event,
        timeoutMs,
      }
    )) as any;

    const chatKeys = Array.isArray(result?.chatKeys)
      ? result.chatKeys.map((item: unknown) => String(item ?? "").trim()).filter(Boolean)
      : [];
    return {
      chatKeys: Array.from(new Set(chatKeys)),
      updatedAt: Number.isFinite(Number(result?.updatedAt)) ? Number(result.updatedAt) : null,
    };
  } catch {
    return {
      chatKeys: [],
      updatedAt: null,
    };
  }
}

export function subscribeMemoryPluginStateEvent(
  handler: (payload: { enabled: boolean; pluginId: string }) => void
): () => void {
  try {
    return subscribe(
      "plugin:broadcast:state_changed",
      (data: any) => {
        const pluginId = String(data?.pluginId ?? "");
        if (pluginId && pluginId !== MEMORY_PLUGIN_NAMESPACE_Event) return;
        handler({
          enabled: Boolean(data?.isEnabled),
          pluginId: pluginId || MEMORY_PLUGIN_NAMESPACE_Event,
        });
      },
      { from: MEMORY_PLUGIN_NAMESPACE_Event }
    );
  } catch {
    return () => { };
  }
}
