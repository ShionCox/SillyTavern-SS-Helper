/**
 * 通用主题系统 —— 全局状态、订阅、广播、初始化。
 */

import type { ThemeId, ThemeListener, ThemeState } from "./types";
import { writeTokensToElement, clearTokensFromElement } from "./tokens";
import { getThemeTokens } from "./presets";
import { readPersistedThemeId, persistThemeId, normalizeThemeId } from "./storage";

interface ThemeKernelState {
  initialized: boolean;
  state: ThemeState;
  listeners: Set<ThemeListener>;
  hosts: Set<HTMLElement>;
}

function getKernel(): ThemeKernelState {
  const g = globalThis as typeof globalThis & { __ssThemeKernelV2?: ThemeKernelState };
  if (g.__ssThemeKernelV2) return g.__ssThemeKernelV2;
  const created: ThemeKernelState = {
    initialized: false,
    state: { themeId: "default" },
    listeners: new Set(),
    hosts: new Set(),
  };
  g.__ssThemeKernelV2 = created;
  return created;
}

function applyThemeToHost(el: HTMLElement, themeId: ThemeId): void {
  el.setAttribute("data-ss-theme", themeId);
  writeTokensToElement(el, getThemeTokens(themeId));
}

function broadcastTheme(state: ThemeState): void {
  const kernel = getKernel();
  // 同步所有宿主
  for (const host of Array.from(kernel.hosts)) {
    if (!host.isConnected) {
      kernel.hosts.delete(host);
      continue;
    }
    applyThemeToHost(host, state.themeId);
  }
  // 通知所有监听器
  for (const listener of kernel.listeners) {
    listener(state);
  }
}

/** 初始化主题内核，仅首次调用生效。返回当前主题状态。 */
export function initThemeKernel(): ThemeState {
  const kernel = getKernel();
  if (kernel.initialized) return kernel.state;
  kernel.state = { themeId: readPersistedThemeId() };
  kernel.initialized = true;
  return kernel.state;
}

/** 读取当前主题状态 */
export function getTheme(): ThemeState {
  return initThemeKernel();
}

/** 设置主题，同步更新所有宿主并持久化 */
export function setTheme(themeIdOrRaw: string): ThemeState {
  const kernel = getKernel();
  initThemeKernel();
  const next: ThemeId = normalizeThemeId(themeIdOrRaw);
  if (next === kernel.state.themeId) return kernel.state;
  kernel.state = { themeId: next };
  persistThemeId(next);
  broadcastTheme(kernel.state);
  return kernel.state;
}

/** 订阅主题变化，返回取消订阅函数 */
export function subscribeTheme(listener: ThemeListener): () => void {
  const kernel = getKernel();
  kernel.listeners.add(listener);
  return () => { kernel.listeners.delete(listener); };
}

/**
 * 把指定宿主节点注册为主题宿主，并立即应用当前主题。
 * 后续 `setTheme` 时会自动同步。
 */
export function mountThemeHost(el: HTMLElement): void {
  const kernel = getKernel();
  const state = initThemeKernel();
  kernel.hosts.add(el);
  applyThemeToHost(el, state.themeId);
}

/** 取消宿主注册并清除主题令牌 */
export function unmountThemeHost(el: HTMLElement): void {
  const kernel = getKernel();
  kernel.hosts.delete(el);
  el.removeAttribute("data-ss-theme");
  clearTokensFromElement(el);
}
