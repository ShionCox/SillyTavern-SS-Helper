export type LogLevel = 'DEBUG' | 'INFO' | 'SUCCESS' | 'WARN' | 'ERROR';

export interface LoggerOptions {
    /** 控制是否在非调试模式下静默 info 和 debug 级别的输出 */
    quiet?: boolean;
}

/**
 * SS-Helper 统一日志管理器
 * 规范控制台 Console 的打印输出格式，并增加色彩以便于在浏览器开发者工具中快速定位
 */
export class Logger {
    private static readonly SYSTEM_NAME = 'SS-Helper';
    private pluginName: string;
    private isQuiet: boolean;

    /**
     * @param pluginName 当前初始化的插件系统名称，例如 'MemoryOS'
     * @param options 设置对象
     */
    constructor(pluginName: string, options: LoggerOptions = {}) {
        this.pluginName = pluginName;
        this.isQuiet = options.quiet ?? false;
    }

    /**
     * 构建带有级别指示的标准化统一前缀
     */
    private getPrefix(level: LogLevel): string {
        return `[${Logger.SYSTEM_NAME}]-[${this.pluginName}]-[${level}]`;
    }

    /**
     * 内部核心输出函数
     */
    private print(level: LogLevel, color: string, ...args: any[]) {
        const prefix = this.getPrefix(level);
        // 使用 %c 让前缀带有 CSS 颜色区分，视觉更清晰，随后接上真实对象让浏览器能展开结构
        console.log(
            `%c${prefix}`,
            `color: #fff; background: ${color}; padding: 2px 5px; border-radius: 4px; font-weight: 600; font-size: 11px;`,
            ...args
        );
    }

    /** 灰色：调试追踪记录，细粒度信息 */
    public debug(...args: any[]) {
        if (!this.isQuiet) this.print('DEBUG', '#6b7280', ...args);
    }

    /** 蓝色：常规流转信息 */
    public info(...args: any[]) {
        if (!this.isQuiet) this.print('INFO', '#3b82f6', ...args);
    }

    /** 绿色：任务成功结果 */
    public success(...args: any[]) {
        this.print('SUCCESS', '#10b981', ...args);
    }

    /** 橙黄：警告、未按预期但不影响流程 */
    public warn(...args: any[]) {
        this.print('WARN', '#f59e0b', ...args);
    }

    /** 红色：致命错误、异常拦截 */
    public error(...args: any[]) {
        // Error级别另外调用 console.error 以抛出详细调用栈
        const prefix = this.getPrefix('ERROR');
        console.error(
            `%c${prefix}`,
            `color: #fff; background: #ef4444; padding: 2px 5px; border-radius: 4px; font-weight: 600; font-size: 11px;`,
            ...args
        );
    }

    /**
     * 动态修改静默状态
     */
    public setQuiet(quiet: boolean) {
        this.isQuiet = quiet;
    }
}
