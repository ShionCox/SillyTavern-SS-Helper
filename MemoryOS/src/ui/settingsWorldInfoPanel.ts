import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';

interface SettingsWorldInfoPanelOptions {
    ids: MemoryOSSettingsIds;
}

/**
 * 功能：绑定设置页中的 WorldInfo 预览与写回面板。
 * @param options 绑定所需依赖。
 * @returns 无返回值。
 */
export function bindSettingsWorldInfoPanel(options: SettingsWorldInfoPanelOptions): void {
    const wiPreviewEl = document.getElementById(options.ids.wiPreviewId);

    const wiPreviewBtn = document.getElementById(options.ids.wiPreviewBtnId);
    if (wiPreviewBtn) {
        wiPreviewBtn.addEventListener('click', async (): Promise<void> => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            if (!wiPreviewEl) return;
            wiPreviewEl.textContent = '预览中...';
            try {
                const items = await memory.worldInfo.preview();
                if (items.length === 0) {
                    wiPreviewEl.textContent = '暂无可写回的内容（facts/summaries 为空）。';
                    return;
                }
                wiPreviewEl.textContent = items.map((item: any) => `[${item.entry}] 关键词: ${item.keywords.join(', ')} | ${item.contentLength} 字`).join('\n');
            } catch (error) {
                wiPreviewEl.textContent = '预览失败：' + String(error);
            }
        });
    }

    const bindWriteback = (btnId: string, mode: 'all' | 'summaries'): void => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async (): Promise<void> => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            if (!confirm(`确定将 ${mode === 'all' ? '事实+摘要' : '摘要'} 写回到 SillyTavern WorldInfo？\n已有旧条目将被替换。`)) return;
            btn.setAttribute('disabled', 'true');
            try {
                const result = await memory.worldInfo.writeback(mode);
                alert(`✅ 写回完成！\n世界书名: ${result.bookName}\n成功写入: ${result.written} 条`);
                if (wiPreviewEl) {
                    wiPreviewEl.textContent = '';
                }
            } catch (error) {
                alert('写回失败：' + String(error));
            } finally {
                btn.removeAttribute('disabled');
            }
        });
    };

    bindWriteback(options.ids.wiWritebackBtnId, 'all');
    bindWriteback(options.ids.wiWriteSummaryBtnId, 'summaries');
}
