/// <reference path="./global.d.ts" />
/**
 * 模块边界：聚合事件运行时各分域导出，并控制初始化顺序。
 * 不承载具体业务组装逻辑。
 */

import { initEventRuntimeSettingsEvent } from "./eventRuntime.settings";

// 先注册设置域回调，再暴露其他能力，保证运行时初始化顺序稳定。
initEventRuntimeSettingsEvent();

export * from "./eventRuntime.settings";
export * from "./eventRuntime.round";
export * from "./eventRuntime.render";
export * from "./eventRuntime.hooks";
