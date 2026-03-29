/**
 * 功能：等待浏览器先完成一帧绘制，再继续执行重计算任务。
 * @returns 绘制完成后的异步结果
 */
export async function waitForUiPaint(): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
        requestAnimationFrame((): void => {
            window.setTimeout((): void => resolve(), 0);
        });
    });
}
