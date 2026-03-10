import { initializeEventRuntimeEvent } from "./runtime/initializerEvent";

export function bootstrapEvent(): void {
  const globalRef = globalThis as any;
  globalRef.__stDiceRollerEventLoaded = true;
  initializeEventRuntimeEvent();
}
