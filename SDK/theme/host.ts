/**
 * 通用主题系统 —— 宿主节点挂载/卸载/刷新。
 * 这里是对 kernel 中 mountThemeHost / unmountThemeHost 的直通再导出，
 * 同时提供 `refreshThemeHost` 用于手动刷新单个宿主令牌。
 */

import { getTheme, mountThemeHost as kernelMount, unmountThemeHost as kernelUnmount } from "./kernel";
import { writeTokensToElement } from "./tokens";
import { getThemeTokens } from "./presets";

export function mountThemeHost(el: HTMLElement): void {
  kernelMount(el);
}

export function unmountThemeHost(el: HTMLElement): void {
  kernelUnmount(el);
}

export function refreshThemeHost(el: HTMLElement): void {
  const { themeId } = getTheme();
  el.setAttribute("data-ss-theme", themeId);
  writeTokensToElement(el, getThemeTokens(themeId));
}
