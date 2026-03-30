import { renderSettingsUi } from './ui/index';
import { logger } from './runtime/runtime-services';
import { MemoryOS } from './runtime/runtime-app';
import { ensureSdkSharedRuntimeStyles } from '../../SDK/runtime-styles';

/**
 * 功能：启动 MemoryOS 运行时入口，负责插件挂载与 UI 启动副作用。
 * 返回：无返回值。
 */
export function startMemoryOSRuntime(): void {
    // 模拟插件环境挂载
    if (typeof window !== 'undefined') {
        (window as any).MemoryOSPlugin = new MemoryOS();
    }

    // 自动初始化 UI 挂载
    if (typeof document !== 'undefined') {
        ensureSdkSharedRuntimeStyles();
        renderSettingsUi().catch((err: unknown) => {
            logger.error('UI 渲染失败:', err);
        });
    }
}
