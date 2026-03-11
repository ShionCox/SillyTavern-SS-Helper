import { initializeEventRuntimeEvent } from "./runtime/initializerEvent";
import { ensureTailwindRuntimeStyles } from "../../SDK/tailwind";

export function bootstrapEvent(): void {
  const globalRef = globalThis as any;
  globalRef.__stDiceRollerEventLoaded = true;
  ensureTailwindRuntimeStyles();
  initializeEventRuntimeEvent();
}
