import { initializeEventRuntimeEvent } from "./runtime/initializerEvent";

export function bootstrapEvent(): void {
  const globalRef = globalThis as any;
  if (globalRef.__stDiceRollerEventLoaded) return;
  globalRef.__stDiceRollerEventLoaded = true;
  initializeEventRuntimeEvent();
}
