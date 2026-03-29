import { appendMemoryTakeoverLog } from '../db/db';

/**
 * 功能：写入接管日志。
 * @param input 日志输入。
 * @returns 异步完成。
 */
export async function appendTakeoverDiagnostics(input: {
    chatKey: string;
    takeoverId: string;
    level: 'info' | 'warn' | 'error';
    stage: string;
    message: string;
    detail?: Record<string, unknown>;
}): Promise<void> {
    await appendMemoryTakeoverLog(input.chatKey, {
        takeoverId: input.takeoverId,
        level: input.level,
        stage: input.stage,
        message: input.message,
        detail: input.detail,
        ts: Date.now(),
    });
}
