import type { TestbedRunLogEntry } from './parity';

/**
 * 功能：定义 testbed 日志记录器接口。
 */
export interface TestbedLogger {
    section: (title: string) => void;
    info: (message: string, details?: Record<string, unknown>) => void;
    warn: (message: string, details?: Record<string, unknown>) => void;
    error: (message: string, details?: Record<string, unknown>) => void;
    dump: (label: string, value: unknown) => void;
    clear: () => void;
    getEntries: () => TestbedRunLogEntry[];
}

/**
 * 功能：构建 testbed 专用中文日志记录器。
 * @param render 输出渲染函数。
 * @returns 日志记录器实例。
 */
export function createTestbedLogger(render: (text: string) => void): TestbedLogger {
    const entries: TestbedRunLogEntry[] = [];
    let currentSection = '初始化';

    /**
     * 功能：格式化单条日志。
     * @param entry 日志条目。
     * @returns 文本行。
     */
    const formatEntry = (entry: TestbedRunLogEntry): string => {
        const time = new Date(entry.ts).toLocaleTimeString('zh-CN', { hour12: false });
        const levelLabel = entry.level === 'info' ? '信息' : (entry.level === 'warn' ? '警告' : '错误');
        const detailsText = entry.details ? ` | ${JSON.stringify(entry.details, null, 2)}` : '';
        return `[${time}] [${levelLabel}] [${entry.section}] ${entry.message}${detailsText}`;
    };

    /**
     * 功能：触发日志文本重渲染。
     * @returns 无返回值。
     */
    const flush = (): void => {
        render(entries.map(formatEntry).join('\n'));
    };

    /**
     * 功能：写入日志条目。
     * @param level 日志级别。
     * @param message 日志消息。
     * @param details 结构化详情。
     * @returns 无返回值。
     */
    const push = (
        level: TestbedRunLogEntry['level'],
        message: string,
        details?: Record<string, unknown>,
    ): void => {
        entries.push({
            ts: Date.now(),
            level,
            section: currentSection,
            message: String(message ?? '').trim(),
            details,
        });
        flush();
    };

    return {
        section: (title: string): void => {
            currentSection = String(title ?? '').trim() || '未命名阶段';
            push('info', `进入阶段：${currentSection}`);
        },
        info: (message: string, details?: Record<string, unknown>): void => {
            push('info', message, details);
        },
        warn: (message: string, details?: Record<string, unknown>): void => {
            push('warn', message, details);
        },
        error: (message: string, details?: Record<string, unknown>): void => {
            push('error', message, details);
        },
        dump: (label: string, value: unknown): void => {
            const detailRecord: Record<string, unknown> = {
                内容: value as unknown,
            };
            push('info', `${String(label ?? '对象快照')}：`, detailRecord);
        },
        clear: (): void => {
            entries.length = 0;
            currentSection = '初始化';
            render('');
        },
        getEntries: (): TestbedRunLogEntry[] => {
            return entries.map((item: TestbedRunLogEntry): TestbedRunLogEntry => ({ ...item }));
        },
    };
}
