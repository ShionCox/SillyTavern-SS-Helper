import { ensureSdkSharedRuntimeStyles } from '../../SDK/runtime-styles';

export interface StartLLMHubRuntimeOptions {
    runtimeFactory: () => unknown;
    renderUi: () => Promise<void>;
    onRenderUiError: (error: unknown) => void;
}

/**
 * 功能：启动 LLMHub 运行时，并在界面初始化前挂载共享图标样式。
 * @param options 运行时启动所需的工厂方法与 UI 挂载回调
 * @returns void：无返回值
 */
export function startLLMHubRuntime(options: StartLLMHubRuntimeOptions): void {
    if (typeof document !== 'undefined') {
        ensureSdkSharedRuntimeStyles();
    }

    (window as any).LLMHubPlugin = options.runtimeFactory();

    if (typeof document !== 'undefined') {
        options.renderUi().catch((error: unknown) => {
            options.onRenderUiError(error);
        });
    }
}
