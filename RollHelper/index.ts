import { broadcast } from "../SDK/bus/broadcast";
import { respond } from "../SDK/bus/rpc";
import { Logger } from "../SDK/logger";
import type { PluginManifest } from "../SDK/stx";
import manifestJson from "./manifest.json";
import { bootstrapEvent } from "./src/bootstrapEvent";

const ROLLHELPER_NAMESPACE = "stx_rollhelper";

type RollHelperPingPayload = {
  alive: boolean;
  version: string;
  isEnabled: boolean;
  capabilities: string[];
};

const ROLLHELPER_MANIFEST: PluginManifest = {
  pluginId: ROLLHELPER_NAMESPACE,
  name: "RollHelper",
  displayName: manifestJson.display_name || "SS-Helper [骰子助手]",
  version: manifestJson.version || "1.0.0",
  capabilities: {
    events: ["plugin:request:ping", "plugin:broadcast:state_changed"],
    memory: [],
    llm: [],
  },
  scopes: ["chat", "roll", "status"],
  requiresSDK: "^1.0.0",
  source: "manifest_json",
};

export const logger = new Logger("骰子助手");

/**
 * 功能：构建 RollHelper 对外暴露的存活探针响应。
 * @param 无。
 * @returns RollHelperPingPayload：当前插件的在线状态与能力列表。
 */
function buildPingPayload(): RollHelperPingPayload {
  return {
    alive: true,
    version: manifestJson.version || "1.0.0",
    isEnabled: true,
    capabilities: ["roll", "event", "bus", "ui"],
  };
}

/**
 * 功能：向 STX 全局注册当前插件的 manifest。
 * @param 无。
 * @returns void：注册完成后结束。
 */
function registerRollHelperManifest(): void {
  const globalSTX = window.STX;
  globalSTX?.registry?.register?.(ROLLHELPER_MANIFEST);
}

/**
 * 功能：注册 RollHelper 的基础 RPC 与广播端点。
 * @param 无。
 * @returns void：注册完成后结束。
 */
function setupEndpoints(): void {
  respond(
    "plugin:request:ping",
    ROLLHELPER_NAMESPACE,
    async (): Promise<RollHelperPingPayload> => buildPingPayload(),
  );

  broadcast(
    "plugin:broadcast:state_changed",
    {
      pluginId: ROLLHELPER_NAMESPACE,
      isEnabled: true,
    },
    ROLLHELPER_NAMESPACE,
  );
}

logger.info("骰子助手组件已加载");
registerRollHelperManifest();
setupEndpoints();
bootstrapEvent();
