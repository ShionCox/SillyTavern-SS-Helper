/**
 * SS-Helper 统一 Toast 管理器
 * 封装原生 SillyTavern 的 toastr 弹窗，规范化通知并带有插件来源信息。
 */
export class Toast {
    private pluginName: string;

    /**
     * @param pluginName 当前调用的插件系统名称，例如 'MemoryOS'
     */
    constructor(pluginName: string) {
        this.pluginName = pluginName;
    }

    /**
     * 构建带有前缀的统一标题
     */
    private getTitle(title?: string): string {
        const prefix = `[${this.pluginName}]`;
        return title ? `${prefix} ${title}` : prefix;
    }

    /**
     * 内部核心展示方法，处理 toastr 调用
     */
    private show(
        type: 'success' | 'info' | 'warning' | 'error',
        message: string,
        title?: string,
        options?: any
    ) {
        const fullTitle = this.getTitle(title);

        // 兼容处理：如果没有注入原生的 toastr，则回退到 console.log
        if (typeof window !== 'undefined' && window.toastr && typeof window.toastr[type] === 'function') {
            window.toastr[type](message, fullTitle, options);
        } else {
            console.log(`[Toast ${type.toUpperCase()}] ${fullTitle} - ${message}`);
        }
    }

    /** 显示成功提示 */
    public success(message: string, title?: string, options?: any) {
        this.show('success', message, title, options);
    }

    /** 显示一般信息提示 */
    public info(message: string, title?: string, options?: any) {
        this.show('info', message, title, options);
    }

    /** 显示警告提示 */
    public warning(message: string, title?: string, options?: any) {
        this.show('warning', message, title, options);
    }

    /** 显示错误提示 */
    public error(message: string, title?: string, options?: any) {
        this.show('error', message, title, options);
    }
}
