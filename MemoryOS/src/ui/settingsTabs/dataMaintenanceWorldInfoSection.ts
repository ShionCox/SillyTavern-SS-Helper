import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';

interface DataMaintenanceWorldInfoSectionOptions {
    ids: MemoryOSSettingsIds;
}

/**
 * 功能：绑定数据维护页中的 WorldInfo 区块。
 * @param options 绑定参数。
 * @returns 无返回值。
 */
export function bindDataMaintenanceWorldInfoSection(options: DataMaintenanceWorldInfoSectionOptions): void {
    const wiPreviewEl = document.getElementById(options.ids.wiPreviewId);

    document.getElementById(options.ids.wiPreviewBtnId)?.addEventListener('click', async (): Promise<void> => {
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    worldInfo?: {
                        preview?: () => Promise<Array<{ entry: string; keywords: string[]; contentLength: number }>>;
                    };
                };
            };
        }).STX?.memory;
        if (!memory?.worldInfo?.preview) {
            alert('Memory OS 尚未就绪。');
            return;
        }
        if (!wiPreviewEl) {
            return;
        }
        wiPreviewEl.textContent = '预览中...';
        try {
            const items = await memory.worldInfo.preview();
            if (items.length === 0) {
                wiPreviewEl.textContent = '暂无可写回的内容（facts / summaries 为空）。';
                return;
            }
            wiPreviewEl.textContent = items.map((item) => `[${item.entry}] 关键词：${item.keywords.join(', ')} | ${item.contentLength} 字`).join('\n');
        } catch (error) {
            wiPreviewEl.textContent = `预览失败：${String(error)}`;
        }
    });

    const bindWriteback = (buttonId: string, mode: 'all' | 'summaries'): void => {
        document.getElementById(buttonId)?.addEventListener('click', async (): Promise<void> => {
            const button = document.getElementById(buttonId) as HTMLButtonElement | null;
            const memory = (window as Window & {
                STX?: {
                    memory?: {
                        worldInfo?: {
                            writeback?: (mode: 'all' | 'summaries') => Promise<{ bookName: string; written: number }>;
                        };
                    };
                };
            }).STX?.memory;
            if (!memory?.worldInfo?.writeback) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            if (!confirm(`确定将${mode === 'all' ? '事实 + 摘要' : '摘要'}写回到 SillyTavern WorldInfo 吗？\n已有同名条目将被更新。`)) {
                return;
            }
            button?.setAttribute('disabled', 'true');
            try {
                const result = await memory.worldInfo.writeback(mode);
                alert(`写回完成。\n世界书名：${result.bookName}\n成功写入：${result.written} 条`);
                if (wiPreviewEl) {
                    wiPreviewEl.textContent = '';
                }
            } catch (error) {
                alert(`写回失败：${String(error)}`);
            } finally {
                button?.removeAttribute('disabled');
            }
        });
    };

    bindWriteback(options.ids.wiWritebackBtnId, 'all');
    bindWriteback(options.ids.wiWriteSummaryBtnId, 'summaries');
}
