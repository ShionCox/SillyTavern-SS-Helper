import type { MemoryOSSettingsIds } from '../settingsCardTemplateTypes';
import { escapeHtml } from '../editorShared';

interface DataMaintenanceTemplateSectionOptions {
    ids: MemoryOSSettingsIds;
    cardId: string;
    refreshSharedSelectOptions: (root: HTMLElement) => void;
}

/**
 * 功能：绑定数据维护页中的模板区块。
 * @param options 绑定参数。
 * @returns 返回模板区块刷新函数。
 */
export function bindDataMaintenanceTemplateSection(
    options: DataMaintenanceTemplateSectionOptions,
): { refreshTemplatePanelState: () => Promise<void> } {
    /**
     * 功能：刷新模板区块内容。
     * @returns 无返回值。
     */
    const refreshTemplatePanelState = async (): Promise<void> => {
        const listEl = document.getElementById(options.ids.templateListId);
        const activeSelectEl = document.getElementById(options.ids.templateActiveSelectId) as HTMLSelectElement | null;
        const lockEl = document.getElementById(options.ids.templateLockId) as HTMLInputElement | null;
        if (!listEl) {
            return;
        }
        listEl.textContent = '正在加载...';
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    template?: {
                        listByChatKey?: () => Promise<Array<{
                            templateId: string;
                            name: string;
                            worldType: string;
                            tables?: Array<{ key?: string }>;
                            factTypes?: Array<{ type?: string }>;
                            worldInfoRef?: { hash?: string };
                            templateFamilyId?: string;
                        }>>;
                        getBinding?: () => Promise<{ activeTemplateId?: string; isLocked?: boolean } | null>;
                        getActive?: () => Promise<{ templateId?: string } | null>;
                        rebuildFromWorldInfo?: () => Promise<string | null>;
                        setActive?: (templateId: string, options?: { lock?: boolean }) => Promise<void>;
                        setLock?: (locked: boolean) => Promise<void>;
                    };
                };
            };
        }).STX?.memory;
        if (!memory?.template?.listByChatKey) {
            listEl.textContent = '暂无可用模板，请先启用会话并打开 AI 模式。';
            return;
        }
        try {
            const [templates, binding, activeTemplate] = await Promise.all([
                memory.template.listByChatKey().catch(() => []),
                memory.template.getBinding?.().catch(() => null) ?? Promise.resolve(null),
                memory.template.getActive?.().catch(() => null) ?? Promise.resolve(null),
            ]);
            const activeTemplateId = String(activeTemplate?.templateId || binding?.activeTemplateId || '').trim();

            if (activeSelectEl) {
                activeSelectEl.innerHTML = '<option value="">选择要激活的模板...</option>';
                templates.forEach((template): void => {
                    const option = document.createElement('option');
                    option.value = template.templateId;
                    option.textContent = `${template.name} (${template.worldType})`;
                    activeSelectEl.appendChild(option);
                });
                if (activeTemplateId) {
                    activeSelectEl.value = activeTemplateId;
                }
            }
            options.refreshSharedSelectOptions(document.getElementById(options.cardId) || document.body);
            if (lockEl) {
                lockEl.checked = binding?.isLocked === true;
            }

            if (templates.length === 0) {
                listEl.textContent = '未找到绑定模板。';
                return;
            }

            listEl.innerHTML = templates.map((template) => {
                const isActive = Boolean(activeTemplateId && template.templateId === activeTemplateId);
                const tableNames = (template.tables || []).map((item) => String(item?.key || '').trim()).filter(Boolean);
                const factTypes = (template.factTypes || []).map((item) => String(item?.type || '').trim()).filter(Boolean);
                const hash = String(template.worldInfoRef?.hash || '').trim() || '未记录';
                const familyId = String(template.templateFamilyId || '').trim();
                return `
                    <article class="stx-ui-template-record${isActive ? ' is-active' : ''}">
                        <div class="stx-ui-template-record-head">
                            <div class="stx-ui-template-record-title">
                                <div class="stx-ui-template-record-name">${escapeHtml(template.name || '未命名模板')}</div>
                                <div class="stx-ui-template-record-meta">${escapeHtml(template.worldType || 'unknown')} · ID ${escapeHtml(template.templateId || 'unknown')}</div>
                            </div>
                            ${isActive ? '<span class="stx-ui-template-record-badge">当前启用</span>' : ''}
                        </div>
                        <div class="stx-ui-template-record-grid">
                            <div class="stx-ui-template-record-cell">
                                <strong>逻辑表</strong>
                                <span>${escapeHtml(tableNames.join('、') || '暂无')}</span>
                            </div>
                            <div class="stx-ui-template-record-cell">
                                <strong>Fact Types</strong>
                                <span>${escapeHtml(factTypes.join('、') || '暂无')}</span>
                            </div>
                            <div class="stx-ui-template-record-cell">
                                <strong>Hash</strong>
                                <span>${escapeHtml(hash)}</span>
                            </div>
                            <div class="stx-ui-template-record-cell">
                                <strong>Family</strong>
                                <span>${escapeHtml(familyId || '未归组')}</span>
                            </div>
                        </div>
                    </article>
                `;
            }).join('');
        } catch (error) {
            listEl.textContent = `读取模板失败：${String(error)}`;
        }
    };

    document.getElementById(options.ids.templateRefreshBtnId)?.addEventListener('click', (): void => {
        void refreshTemplatePanelState();
    });

    document.getElementById(options.ids.templateForceRebuildBtnId)?.addEventListener('click', async (): Promise<void> => {
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    template?: {
                        rebuildFromWorldInfo?: () => Promise<string | null>;
                    };
                };
            };
        }).STX?.memory;
        if (!memory?.template?.rebuildFromWorldInfo) {
            alert('请先启动 Memory OS');
            return;
        }
        if (!confirm('将强制读取世界书并重建模板，确定吗？')) {
            return;
        }
        try {
            const templateId = await memory.template.rebuildFromWorldInfo();
            await refreshTemplatePanelState();
            alert(templateId ? `重建成功，当前模板：${templateId}` : '未生成新模板，请检查世界书或 LLM 配置。');
        } catch (error) {
            alert(`重建失败：${String(error)}`);
        }
    });

    document.getElementById(options.ids.templateSetActiveBtnId)?.addEventListener('click', async (): Promise<void> => {
        const memory = (window as Window & {
            STX?: {
                memory?: {
                    template?: {
                        setActive?: (templateId: string, options?: { lock?: boolean }) => Promise<void>;
                        setLock?: (locked: boolean) => Promise<void>;
                    };
                };
            };
        }).STX?.memory;
        const activeSelectEl = document.getElementById(options.ids.templateActiveSelectId) as HTMLSelectElement | null;
        const lockEl = document.getElementById(options.ids.templateLockId) as HTMLInputElement | null;
        if (!memory?.template?.setActive || !activeSelectEl) {
            alert('模板管理器尚未就绪。');
            return;
        }
        const templateId = activeSelectEl.value;
        if (!templateId) {
            alert('请先选择一个模板。');
            return;
        }
        try {
            await memory.template.setActive(templateId, { lock: lockEl?.checked === true });
            if (memory.template.setLock && lockEl) {
                await memory.template.setLock(lockEl.checked);
            }
            await refreshTemplatePanelState();
            alert('模板切换成功。');
        } catch (error) {
            alert(`模板切换失败：${String(error)}`);
        }
    });

    document.getElementById(options.ids.tabDbId)?.addEventListener('click', (): void => {
        void refreshTemplatePanelState();
    });

    return {
        refreshTemplatePanelState,
    };
}
