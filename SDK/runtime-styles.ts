import { ensureFontAwesomeRuntimeStyles } from "./fontawesome";

/**
 * 功能：统一挂载 SDK 维护的共享运行时样式资源。
 * @param doc 目标文档对象，默认使用当前页面文档
 * @returns void：无返回值
 */
export function ensureSdkSharedRuntimeStyles(doc?: Document): void {
  ensureFontAwesomeRuntimeStyles(doc);
}
