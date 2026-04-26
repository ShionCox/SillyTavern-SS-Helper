import { renderSettingsUi } from './ui/index';
import { logger } from './runtime/runtime-services';
import { MemoryOS } from './runtime/runtime-app';
import { ensureSdkSharedRuntimeStyles } from '../../SDK/runtime-styles';

const RUNTIME_KEY = '__SS_HELPER_MEMORY_OS_RUNTIME__';

type MemoryOSRuntimeState = {
    started: boolean;
    app: MemoryOS;
    startedAt: number;
};

type MemoryOSRuntimeWindow = Window & typeof globalThis & {
    MemoryOSPlugin?: MemoryOS;
    __SS_HELPER_MEMORY_OS_RUNTIME__?: MemoryOSRuntimeState;
};

/**
 * 功能：启动 MemoryOS 运行时入口，负责插件挂载与 UI 启动副作用，并防止重复启动。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   无返回值。
 */
export function startMemoryOSRuntime(): void {
    if (typeof window === 'undefined') {
        return;
    }

    const runtimeWindow = window as MemoryOSRuntimeWindow;
    if (runtimeWindow[RUNTIME_KEY]?.started) {
        logger.warn('[MemoryOS] 运行时已经启动，已跳过重复挂载。');
        return;
    }

    const app = new MemoryOS();
    runtimeWindow.MemoryOSPlugin = app;
    runtimeWindow[RUNTIME_KEY] = {
        started: true,
        app,
        startedAt: Date.now(),
    };

    if (typeof document !== 'undefined') {
        ensureSdkSharedRuntimeStyles();
        renderSettingsUi().catch((err: unknown) => {
            logger.error('UI 渲染失败:', err);
        });
    }
}

/**
 * 功能：停止 MemoryOS 运行时并清理全局挂载状态。
 *
 * 参数：
 *   无。
 *
 * 返回：
 *   无返回值。
 */
export function stopMemoryOSRuntime(): void {
    if (typeof window === 'undefined') {
        return;
    }
    const runtimeWindow = window as MemoryOSRuntimeWindow;
    runtimeWindow[RUNTIME_KEY]?.app.destroy();
    runtimeWindow.MemoryOSPlugin = undefined;
    runtimeWindow[RUNTIME_KEY] = undefined;
}
