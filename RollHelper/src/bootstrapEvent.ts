import { initializeEventRuntimeEvent } from "./runtime/initializerEvent";
import { ensureSdkSharedRuntimeStyles } from "../../SDK/runtime-styles";
import { ensureTailwindRuntimeStyles } from "../../SDK/tailwind";

/**
 * 功能：启动事件插件运行时，并在初始化前挂载共享样式资源。
 * @returns void：无返回值
 */
export function bootstrapEvent(): void {
  const globalRef = globalThis as any;
  globalRef.__stDiceRollerEventLoaded = true;
  ensureSdkSharedRuntimeStyles();
  ensureTailwindRuntimeStyles();
  initializeEventRuntimeEvent();
}
