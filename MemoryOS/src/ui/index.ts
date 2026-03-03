import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { MemoryOSSettingsIds } from './settingsCardTemplateTypes';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';
import { request, subscribe, broadcast, logger, toast } from '../index';
import { openRecordEditor } from './recordEditor';
import { ensureSharedTooltip, applyTooltipCatalog, hydrateSettingsTooltips } from '../../../SDK/sharedTooltip';
import { buildSettingsTooltipCatalog } from './settingsTooltipCatalog';


// UI 组件的唯一命名空间
const NAMESPACE = 'stx-memoryos';

// 解析生成更新日志 HTML
const generateChangelogHtml = () => {
    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';

    return changelogData.map(log => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px;">
            <span style="font-weight: bold; color: var(--SmartThemeQuoteTextColor, #fff); font-size: 13px;">${log.version}</span>
            ${log.date ? `<span style="font-size: 11px; opacity: 0.6;">${log.date}</span>` : ''}
        </div>
        <ul style="margin: 0; padding-left: 20px; font-size: 12px; opacity: 0.85;">
          ${log.changes.map((c: string) => `<li style="margin-bottom: 4px; line-height: 1.4;">${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
};

const IDS: MemoryOSSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'Memory OS',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabMainId: `${NAMESPACE}-tab-main`,
    tabAiId: `${NAMESPACE}-tab-ai`,
    tabDbId: `${NAMESPACE}-tab-db`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelAiId: `${NAMESPACE}-panel-ai`,
    panelDbId: `${NAMESPACE}-panel-db`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    aiModeEnabledId: `${NAMESPACE}-ai-mode`,
    aiModeStatusLightId: `${NAMESPACE}-ai-mode-status-light`,
    testPingBtnId: `${NAMESPACE}-test-ping-btn`,
    testHelloBtnId: `${NAMESPACE}-test-hello-btn`,
    autoCompactionId: `${NAMESPACE}-auto-compaction`,
    compactionThresholdId: `${NAMESPACE}-compaction-threshold`,
    contextMaxTokensId: `${NAMESPACE}-context-max-tokens`,

    dbCompactBtnId: `${NAMESPACE}-db-compact-btn`,
    dbExportBtnId: `${NAMESPACE}-db-export-btn`,
    dbImportBtnId: `${NAMESPACE}-db-import-btn`,
    dbClearBtnId: `${NAMESPACE}-db-clear-btn`,
    // 世界模板
    tabTemplateId: `${NAMESPACE}-tab-template`,
    panelTemplateId: `${NAMESPACE}-panel-template`,
    templateListId: `${NAMESPACE}-template-list`,
    templateRefreshBtnId: `${NAMESPACE}-template-refresh`,
    templateForceRebuildBtnId: `${NAMESPACE}-template-force-rebuild`,
    templateActiveSelectId: `${NAMESPACE}-template-active-select`,
    templateSetActiveBtnId: `${NAMESPACE}-template-active-apply`,
    templateLockId: `${NAMESPACE}-template-lock`,
    // 审计面板
    tabAuditId: `${NAMESPACE}-tab-audit`,
    panelAuditId: `${NAMESPACE}-panel-audit`,
    auditListId: `${NAMESPACE}-audit-list`,
    auditCreateSnapshotBtnId: `${NAMESPACE}-audit-snapshot`,
    auditRefreshBtnId: `${NAMESPACE}-audit-refresh`,
    // 世界书写回
    wiPreviewId: `${NAMESPACE}-wi-preview`,
    wiPreviewBtnId: `${NAMESPACE}-wi-preview-btn`,
    wiWritebackBtnId: `${NAMESPACE}-wi-writeback`,
    wiWriteSummaryBtnId: `${NAMESPACE}-wi-write-summary`,
    // 逻辑表可编辑
    logicTableEntitySelectId: `${NAMESPACE}-logic-table-entity`,
    logicTableRefreshBtnId: `${NAMESPACE}-logic-table-refresh`,
    logicTableContainerId: `${NAMESPACE}-logic-table-container`,
    recordEditorBtnId: `${NAMESPACE}-record-editor-btn`,
};

/**
 * 功能：为 MemoryOS 设置面板应用 tooltip 目录并执行兜底补齐。
 * 参数：无。
 * 返回：void。
 */
function applySettingsTooltips(): void {
    const cardRoot = document.getElementById(IDS.cardId);
    if (!cardRoot) return;
    ensureSharedTooltip();
    const catalog = buildSettingsTooltipCatalog(IDS);
    applyTooltipCatalog(cardRoot, catalog);
    hydrateSettingsTooltips({ root: cardRoot });
}

/**
 * 等待元素出现在 DOM 中
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver((mutations, obs) => {
            const el = document.querySelector(selector);
            if (el) {
                obs.disconnect();
                resolve(el);
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for ${selector}`));
        }, timeout);
    });
}

/**
 * 在设定的拓展面板 (Extensions) 中渲染 MemoryOS 设置卡片
 */
export async function renderSettingsUi() {
    try {
        // SillyTavern 插件设置面板通常挂载在 #extensions_settings
        const container = await waitForElement('#extensions_settings');

        // 1. 注入 CSS
        if (!document.getElementById(`${IDS.cardId}-styles`)) {
            const styleEl = document.createElement('style');
            styleEl.id = `${IDS.cardId}-styles`;
            styleEl.innerHTML = buildSettingsCardStylesTemplate(IDS.cardId);
            document.head.appendChild(styleEl);
        }

        // 2. 注入 HTML 卡片
        let cardWrapper = document.getElementById(IDS.cardId);
        if (!cardWrapper) {
            cardWrapper = document.createElement('div');
            cardWrapper.id = IDS.cardId;
            cardWrapper.innerHTML = buildSettingsCardHtmlTemplate(IDS);

            // 寻找或创建专用的容器
            let ssContainer = document.getElementById('ss-helper-plugins-container');
            if (!ssContainer) {
                ssContainer = document.createElement('div');
                ssContainer.id = 'ss-helper-plugins-container';
                ssContainer.className = 'ss-helper-plugins-container';
                container.prepend(ssContainer);
            }
            ssContainer.appendChild(cardWrapper);
        }

        // 3. 绑定内部交互逻辑 (展开、切换 Tab)
        bindUiEvents();
        applySettingsTooltips();
    } catch (error) {
        console.error(`[MemoryOS] UI 渲染失败:`, error);
    }
}

/**
 * 绑定设置卡片的交互事件
 */
function bindUiEvents() {
    const refreshSettingsTooltips = (): void => {
        applySettingsTooltips();
    };

    // 3.1 抽屉展开/折叠 (移除手动监听，交由 SillyTavern 核心的 .inline-drawer-toggle 自动处理)

    // 3.2 标签页切换
    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabAiId, panelId: IDS.panelAiId },
        { tabId: IDS.tabDbId, panelId: IDS.panelDbId },
        { tabId: IDS.tabTemplateId, panelId: IDS.panelTemplateId },
        { tabId: IDS.tabAuditId, panelId: IDS.panelAuditId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;

        tabEl.addEventListener('click', () => {
            // 隐藏所有面板，移除所有 tab 的 active 态
            tabs.forEach(t => {
                const tEl = document.getElementById(t.tabId);
                const pEl = document.getElementById(t.panelId);
                if (tEl) tEl.classList.remove('is-active');
                if (pEl) pEl.setAttribute('hidden', 'true');
            });

            // 激活当前点选的面板
            const targetPanel = document.getElementById(panelId);
            tabEl.classList.add('is-active');
            if (targetPanel) {
                targetPanel.removeAttribute('hidden');
            }
        });
    });

    // 3.3 搜索过滤 (简单文本匹配)
    const searchInput = document.getElementById(IDS.searchId) as HTMLInputElement;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = (e.target as HTMLInputElement).value.toLowerCase().trim();
            const searchableItems = document.querySelectorAll(`[data-stx-ui-search]`);

            searchableItems.forEach(el => {
                const keywords = el.getAttribute('data-stx-ui-search') || '';
                if (!term || keywords.toLowerCase().includes(term)) {
                    el.classList.remove('is-hidden-by-search');
                } else {
                    el.classList.add('is-hidden-by-search');
                }
            });
        });
    }

    // ==== 在此处可继续添加针对具体配置项的 change 监听与保存逻辑 ====

    const stContext = (window as any).SillyTavern?.getContext?.() || {};

    // 辅助防呆并初始化开关绑定持久化
    const bindToggle = (toggleId: string, settingKey: string, onToggleCallback?: (val: boolean) => void) => {
        const toggleEl = document.getElementById(toggleId) as HTMLInputElement;
        if (!toggleEl) return;

        // 初始化读取状态
        if (stContext.extensionSettings) {
            const extSet = stContext.extensionSettings['stx_memory_os'] || {};
            toggleEl.checked = extSet[settingKey] === true;
        }

        toggleEl.addEventListener('change', () => {
            const checked = toggleEl.checked;
            if (stContext.extensionSettings) {
                if (!stContext.extensionSettings['stx_memory_os']) {
                    stContext.extensionSettings['stx_memory_os'] = {};
                }
                stContext.extensionSettings['stx_memory_os'][settingKey] = checked;
                stContext.saveSettingsDebounced?.();
            }
            if (onToggleCallback) onToggleCallback(checked);
        });
    };

    // 绑定总开关
    bindToggle(IDS.enabledId, 'enabled', (val) => {
        broadcast(
            'plugin:broadcast:state_changed',
            {
                pluginId: 'stx_memory_os',
                isEnabled: !!val,
            },
            'stx_memory_os'
        );
    });

    // ==========================================
    // ==== [P0-4] 微服务通讯三态连接灯与逻辑接管 ====
    // ==========================================
    const aiToggleEl = document.getElementById(IDS.aiModeEnabledId) as HTMLInputElement;
    const aiLightEl = document.getElementById(IDS.aiModeStatusLightId);

    // 初始化 UI 开关
    if (aiToggleEl && stContext.extensionSettings) {
        const extSet = stContext.extensionSettings['stx_memory_os'] || {};
        aiToggleEl.checked = extSet['aiMode'] === true;
    }

    // 更新界面状态灯（提供绿Connected / 红Disconnected 变换）
    const updateLinkStatus = (alive: boolean, isEnabled: boolean) => {
        if (!aiLightEl || !aiToggleEl) return;
        if (alive && isEnabled) {
            aiLightEl.className = 'fa-solid fa-link';
            aiLightEl.style.color = '#8ceb8c'; // 绿灯运行
            aiLightEl.setAttribute('data-tip', 'LLMHub 通信正常。');
            aiLightEl.removeAttribute('title');
            aiToggleEl.disabled = false;
        } else {
            aiLightEl.className = 'fa-solid fa-link-slash';
            aiLightEl.style.color = '#ff8787'; // 红灯断锁
            aiLightEl.setAttribute(
                'data-tip',
                alive
                    ? 'LLMHub 已关闭，AI 模式不可用。'
                    : '未检测到 LLMHub，AI 模式不可用。'
            );
            aiLightEl.removeAttribute('title');
            aiToggleEl.checked = false;
            aiToggleEl.disabled = true; // 强力闭锁
            const extSet = stContext.extensionSettings?.['stx_memory_os'] || {};
            extSet['aiMode'] = false; // 联动存表
        }
    };

    // 1. 初始化时主动侦测 Ping (跨插件加载可能存在异步时差，必须重试补偿)
    const checkLLMHubStatus = (retries = 5) => {
        request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub', timeoutMs: 2000 })
            .then(res => updateLinkStatus(res.alive, res.isEnabled))
            .catch(e => {
                if (retries > 0) {
                    logger.warn(`[Network] LLMHub 仍未接管通讯总线 (${e.message})，等候重试... 剩余次数: ${retries}`);
                    setTimeout(() => checkLLMHubStatus(retries - 1), 2500);
                } else {
                    logger.error('[Network] 彻底放弃探寻 LLMHub 实例', e);
                    updateLinkStatus(false, false);
                }
            });
    };
    checkLLMHubStatus();

    // 2. 长程订阅广播：如果探测途中对方开关发生变化，实时追随打断操作！
    // P0-5 防漏回收：我们将其绑定在内部单例生命周期（由于暂且没有显式销毁，跟随页面生存）
    const unsub = subscribe('plugin:broadcast:state_changed', (data: any) => {
        // 如果开关开启，我们假定活着；如果是关闭那也直接设死
        updateLinkStatus(true, !!data?.isEnabled);
    }, { from: 'stx_llmhub' });

    // 3. 用户主观点击操作反馈
    if (aiToggleEl) {
        aiToggleEl.addEventListener('change', (e) => {
            if (aiToggleEl.disabled) {
                e.preventDefault();
                aiToggleEl.checked = false;
                toast.warning('微服务桥接失败：LLMHub 尚未启用或运行异常，无法使用 AI 集成功能。');
                return;
            }

            if (stContext.extensionSettings) {
                if (!stContext.extensionSettings['stx_memory_os']) stContext.extensionSettings['stx_memory_os'] = {};
                stContext.extensionSettings['stx_memory_os']['aiMode'] = aiToggleEl.checked;
                stContext.saveSettingsDebounced?.();
            }
        });
    }

    // ==========================================
    // ==== [P2-3] 微服务通讯自检台 (Bus Inspector) ====
    // ==========================================
    const pingBtn = document.getElementById(IDS.testPingBtnId);
    if (pingBtn) {
        pingBtn.addEventListener('click', async () => {
            pingBtn.textContent = '探测中...';
            try {
                const res = await request('plugin:request:ping', {}, 'stx_memory_os', { to: 'stx_llmhub' });
                toast.success('网络 Ping 通成功！耗时及详情已打印至控制台。');
                logger.info('[Bus Inspector Ping]', res);
            } catch (e: any) {
                toast.error('网络探测不通，错误详情看控制台。');
                logger.error('[Bus Inspector Error]', e);
            } finally {
                pingBtn.textContent = '发送 Ping 测试';
            }
        });
    }

    const helloBtn = document.getElementById(IDS.testHelloBtnId);
    if (helloBtn) {
        helloBtn.addEventListener('click', async () => {
            helloBtn.textContent = '呼叫中...';
            try {
                const res = await request('plugin:request:hello', { testPayload: 'From MemoryOS Inspector' }, 'stx_memory_os', { to: 'stx_llmhub' });
                toast.success('双向握手完成 (Hello OK)。详情见控制台。');
                logger.success('[Bus Inspector Hello Reply]', res);
            } catch (e: any) {
                toast.error('请求 LLM 枢纽被拒绝或超时，详见控制台。');
                logger.error('[Bus Inspector Error]', e);
            } finally {
                helloBtn.textContent = '向 LLMHub Hello';
            }
        });
    }

    let autoCompactionTimer: ReturnType<typeof setInterval> | null = null;
    const applyAutoCompactionScheduler = (enabled: boolean): void => {
        if (autoCompactionTimer) {
            clearInterval(autoCompactionTimer);
            autoCompactionTimer = null;
        }
        if (!enabled) {
            return;
        }
        autoCompactionTimer = setInterval(async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.compaction?.needsCompaction || !memory?.compaction?.compact) {
                return;
            }
            try {
                const check = await memory.compaction.needsCompaction();
                if (check?.needed) {
                    await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
                }
            } catch (error) {
                logger.warn('自动压缩任务执行失败', error);
            }
        }, 60_000);
    };

    bindToggle(IDS.autoCompactionId, 'autoCompaction', (enabled) => {
        applyAutoCompactionScheduler(enabled);
    });
    const autoCompactionEnabled = stContext.extensionSettings?.['stx_memory_os']?.autoCompaction === true;
    applyAutoCompactionScheduler(autoCompactionEnabled);

    setTimeout(() => {
        const enabled = stContext.extensionSettings?.['stx_memory_os']?.enabled === true;
        broadcast(
            'plugin:broadcast:state_changed',
            {
                pluginId: 'stx_memory_os',
                isEnabled: enabled,
            },
            'stx_memory_os'
        );
    }, 300);

    // ===== 世界模板面板交互 =====
    const refreshTemplatesUI = async (): Promise<void> => {
        const listEl = document.getElementById(IDS.templateListId);
        const activeSelectEl = document.getElementById(IDS.templateActiveSelectId) as HTMLSelectElement | null;
        const lockEl = document.getElementById(IDS.templateLockId) as HTMLInputElement | null;
        if (!listEl) return;
        const memory = (window as any).STX?.memory;
        if (!memory?.template?.listByChatKey) {
            listEl.textContent = '暂无可用模板，请先启动会话并开启 AI 模式。';
            return;
        }
        try {
            const [templates, binding, activeTemplateId] = await Promise.all([
                memory.template.listByChatKey(),
                memory.template.getBinding?.(),
                memory.getActiveTemplateId?.(),
            ]);

            if (activeSelectEl) {
                activeSelectEl.innerHTML = '<option value="">选择要激活的模板...</option>';
                for (const template of templates) {
                    const option = document.createElement('option');
                    option.value = template.templateId;
                    option.textContent = `${template.name} (${template.worldType})`;
                    activeSelectEl.appendChild(option);
                }
                if (activeTemplateId) {
                    activeSelectEl.value = activeTemplateId;
                }
            }
            if (lockEl) {
                lockEl.checked = binding?.isLocked === true;
            }

            if (templates.length === 0) {
                listEl.textContent = '未找到绑定模板。';
                return;
            }

            listEl.textContent = templates.map((template: any) => {
                const isActive = activeTemplateId && template.templateId === activeTemplateId;
                const mark = isActive ? '★' : ' ';
                const hash = template.worldInfoRef?.hash || '(无 hash)';
                return `${mark}[模板] ${template.name} (${template.worldType})\n实体表: ${Object.keys(template.entities || {}).join(', ')}\nFactTypes: ${(template.factTypes || []).map((item: any) => item.type).join(', ') || '(空)'}\nHash: ${hash}\nID: ${template.templateId}`;
            }).join('\n\n');
            refreshSettingsTooltips();
        } catch (e) {
            listEl.textContent = '读取模板失败: ' + String(e);
            refreshSettingsTooltips();
        }
    };

    // 点击世界模板 Tab 时自动刺新
    const templateTabEl = document.getElementById(IDS.tabTemplateId);
    if (templateTabEl) {
        templateTabEl.addEventListener('click', refreshTemplatesUI);
    }

    // 手动刷新按鈕
    const refreshBtn = document.getElementById(IDS.templateRefreshBtnId);
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshTemplatesUI);
    }

    // 强制重建按钮：直接调用 template.rebuildFromWorldInfo()
    const forceRebuildBtn = document.getElementById(IDS.templateForceRebuildBtnId);
    if (forceRebuildBtn) {
        forceRebuildBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.template?.rebuildFromWorldInfo) {
                alert('请先启动 Memory OS');
                return;
            }
            if (!confirm('将强制读取世界书并重建模板，确定吗？')) return;
            try {
                const templateId = await memory.template.rebuildFromWorldInfo();
                await refreshTemplatesUI();
                alert(templateId ? `重建成功，当前模板: ${templateId}` : '未生成新模板，请检查世界书或 LLM 配置');
            } catch (error) {
                alert('重建失败：' + String(error));
            }
        });
    }

    const templateSetActiveBtn = document.getElementById(IDS.templateSetActiveBtnId);
    if (templateSetActiveBtn) {
        templateSetActiveBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            const activeSelectEl = document.getElementById(IDS.templateActiveSelectId) as HTMLSelectElement | null;
            const lockEl = document.getElementById(IDS.templateLockId) as HTMLInputElement | null;
            if (!memory?.template?.setActive || !activeSelectEl) {
                alert('模板管理器未就绪。');
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
                await refreshTemplatesUI();
                alert('模板切换成功。');
            } catch (error) {
                alert('模板切换失败：' + String(error));
            }
        });
    }

    // ===== 数据库操作按钮联通 =====

    // 立即压缩：调用 compaction.compact() 并显示压缩结果
    const dbCompactBtn = document.getElementById(IDS.dbCompactBtnId);
    if (dbCompactBtn) {
        dbCompactBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.compaction) {
                alert('Memory OS 尚未就绪，请刷新后重试。');
                return;
            }
            dbCompactBtn.setAttribute('disabled', 'true');
            dbCompactBtn.textContent = '正在压缩...';
            try {
                // 先检查是否真的需要压缩
                const check = await memory.compaction.needsCompaction();
                if (!check.needed && check.eventCount !== undefined && check.eventCount < 100) {
                    alert(`当前事件数量仅 ${check.eventCount} 条，无需压缩。`);
                    return;
                }
                const result = await memory.compaction.compact({ windowSize: 1000, archiveProcessed: true });
                alert(`压缩完成！\n生成摘要：${result.summariesCreated} 条\n归档事件：${result.eventsArchived} 条`);
            } catch (e) {
                alert('压缩失败：' + String(e));
            } finally {
                dbCompactBtn.removeAttribute('disabled');
                dbCompactBtn.textContent = '立即压缩';
            }
        });
    }

    // 导出记忆包：把核心数据序列化成 JSON 并触发下载
    const dbExportBtn = document.getElementById(IDS.dbExportBtnId);
    if (dbExportBtn) {
        dbExportBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            try {
                const chatKey = memory.getChatKey?.() ?? 'unknown';
                const [events, facts, summaries] = await Promise.all([
                    memory.events?.query({ limit: 5000 }) ?? [],
                    memory.facts?.query({ limit: 5000 }) ?? [],
                    memory.summaries?.query({ limit: 1000 }) ?? [],
                ]);
                const exportData = {
                    exportedAt: new Date().toISOString(),
                    chatKey,
                    events,
                    facts,
                    summaries,
                };
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `memory_os_export_${chatKey}_${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            } catch (e) {
                alert('导出失败：' + String(e));
            }
        });
    }

    const dbImportBtn = document.getElementById(IDS.dbImportBtnId);
    if (dbImportBtn) {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/json,.json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        dbImportBtn.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async () => {
            const memory = (window as any).STX?.memory;
            const file = fileInput.files?.[0];
            if (!memory || !file) {
                return;
            }

            try {
                const text = await file.text();
                const payload = JSON.parse(text);
                const currentChatKey = memory.getChatKey?.();
                if (!currentChatKey) {
                    throw new Error('当前 chatKey 不可用');
                }

                const importedChatKey = String(payload.chatKey || '');
                if (importedChatKey && importedChatKey !== currentChatKey) {
                    const shouldContinue = confirm(`导入包属于 [${importedChatKey}]，当前聊天是 [${currentChatKey}]。\n确定继续并映射到当前聊天吗？`);
                    if (!shouldContinue) {
                        return;
                    }
                }

                const { db } = await import('../db/db');
                const events = Array.isArray(payload.events) ? payload.events : [];
                const facts = Array.isArray(payload.facts) ? payload.facts : [];
                const summaries = Array.isArray(payload.summaries) ? payload.summaries : [];

                await db.transaction('rw', [db.events, db.facts, db.summaries, db.meta], async () => {
                    if (events.length > 0) {
                        await db.events.bulkPut(events.map((event: any) => ({
                            ...event,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (facts.length > 0) {
                        await db.facts.bulkPut(facts.map((fact: any) => ({
                            ...fact,
                            chatKey: currentChatKey,
                        })));
                    }
                    if (summaries.length > 0) {
                        await db.summaries.bulkPut(summaries.map((summary: any) => ({
                            ...summary,
                            chatKey: currentChatKey,
                        })));
                    }
                    await db.meta.put({
                        chatKey: currentChatKey,
                        schemaVersion: 1,
                    });
                });

                alert(`导入完成：events=${events.length}, facts=${facts.length}, summaries=${summaries.length}`);
            } catch (error) {
                alert('导入失败：' + String(error));
            } finally {
                fileInput.value = '';
            }
        });
    }

    // 清空当前聊天数据：通过 db 直接清理
    const dbClearBtn = document.getElementById(IDS.dbClearBtnId);
    if (dbClearBtn) {
        dbClearBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory) {
                alert('Memory OS 尚未就绪。');
                return;
            }
            const chatKey = memory.getChatKey?.() ?? '(未知)';
            if (!confirm(`确定要清空 [${chatKey}] 的所有记忆数据吗？\n此操作不可撤销！`)) return;
            try {
                // 通过 IndexedDB 的 db 单例直接按 chatKey 批量删除
                const { db } = await import('../db/db');
                await Promise.all([
                    db.events.where('chatKey').equals(chatKey).delete(),
                    db.facts.where('chatKey').equals(chatKey).delete(),
                    db.world_state.where('chatKey').equals(chatKey).delete(),
                    db.summaries.where('chatKey').equals(chatKey).delete(),
                    db.audit.where('chatKey').equals(chatKey).delete(),
                    db.templates.where('[chatKey+createdAt]').between([chatKey, 0], [chatKey, Infinity]).delete(),
                    db.meta.delete(chatKey),
                ]);
                alert(`已清空 [${chatKey}] 的所有记忆数据。`);
            } catch (e) {
                alert('清空失败：' + String(e));
            }
        });
    }

    // 记录编辑器按钮绑定
    const recordEditorBtn = document.getElementById(IDS.recordEditorBtnId);
    if (recordEditorBtn) {
        recordEditorBtn.addEventListener('click', () => {
            openRecordEditor();
        });
    }

    // ===== 审计历史 & 快照回滚面板 =====

    /** 渲染审计列表到 #auditList 容器 */
    const renderAuditList = async () => {
        const listEl = document.getElementById(IDS.auditListId);
        if (!listEl) return;
        const memory = (window as any).STX?.memory;
        if (!memory?.audit) {
            listEl.textContent = 'Memory OS 尚未就绪。';
            return;
        }
        listEl.textContent = '加载中...';
        try {
            const records = await memory.audit.list({ limit: 50 });
            if (records.length === 0) {
                listEl.textContent = '暂无审计记录。';
                return;
            }
            listEl.innerHTML = '';
            for (const r of records) {
                const isSnapshot = r.action === 'snapshot';
                const time = new Date(r.ts).toLocaleString();
                const note = r.after?.note ? ` — ${r.after.note}` : '';
                const row = document.createElement('div');
                row.style.cssText = 'padding: 6px 8px; border-radius: 4px; margin-bottom: 4px; background: rgba(255,255,255,0.05); display: flex; align-items: center; gap: 8px;';
                row.innerHTML = `
                    <span style="flex: 1; font-size: 11px;">
                        <b style="color: ${isSnapshot ? '#7ca5f5' : '#ccc'}">[${r.action}]</b>
                        <span style="color:#aaa">${time}</span>
                        <span>${note}</span>
                    </span>
                    ${isSnapshot ? `<button data-snapshot-id="${r.auditId}" data-tip="回滚到这个快照。" style="font-size: 11px; padding: 2px 8px; background: rgba(124,165,245,0.2); border: 1px solid #7ca5f5; border-radius: 4px; color: #7ca5f5; cursor: pointer;">回滚</button>` : ''}
                `;
                // 绑定回滚按钮
                if (isSnapshot) {
                    const rollbackBtn = row.querySelector<HTMLButtonElement>(`[data-snapshot-id="${r.auditId}"]`);
                    rollbackBtn?.addEventListener('click', async () => {
                        if (!confirm(`确定回滚到快照 [${time}] 的状态吗？\n当前 facts/state/summaries 将被覆盖！`)) return;
                        rollbackBtn.disabled = true;
                        rollbackBtn.textContent = '回滚中...';
                        try {
                            await memory.audit.rollbackToSnapshot(r.auditId);
                            alert(`✅ 已成功回滚到 [${time}] 的状态。`);
                            await renderAuditList();
                        } catch (e) {
                            alert('回滚失败：' + String(e));
                            rollbackBtn.disabled = false;
                            rollbackBtn.textContent = '回滚';
                        }
                    });
                }
                listEl.appendChild(row);
            }
            refreshSettingsTooltips();
        } catch (e) {
            listEl.textContent = '加载失败：' + String(e);
            refreshSettingsTooltips();
        }
    };

    // 创建快照按钮
    const auditSnapshotBtn = document.getElementById(IDS.auditCreateSnapshotBtnId);
    if (auditSnapshotBtn) {
        auditSnapshotBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.audit) { alert('Memory OS 尚未就绪。'); return; }
            const note = prompt('为这个快照添加备注（可留空）：') ?? undefined;
            auditSnapshotBtn.setAttribute('disabled', 'true');
            try {
                const snapshotId = await memory.audit.createSnapshot(note);
                alert(`✅ 快照已创建！\nID: ${snapshotId}`);
                await renderAuditList();
            } catch (e) {
                alert('创建快照失败：' + String(e));
            } finally {
                auditSnapshotBtn.removeAttribute('disabled');
            }
        });
    }

    // 刷新审计记录按钮
    const auditRefreshBtn = document.getElementById(IDS.auditRefreshBtnId);
    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', renderAuditList);
    }

    // 切换到审计 Tab 时自动刷新
    const auditTabBtn = document.getElementById(IDS.tabAuditId);
    if (auditTabBtn) {
        auditTabBtn.addEventListener('click', renderAuditList);
    }

    // ===== 世界书写回 =====

    const wiPreviewEl = document.getElementById(IDS.wiPreviewId);

    const wiPreviewBtn = document.getElementById(IDS.wiPreviewBtnId);
    if (wiPreviewBtn) {
        wiPreviewBtn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) { alert('Memory OS 尚未就绪。'); return; }
            if (!wiPreviewEl) return;
            wiPreviewEl.textContent = '预览中...';
            try {
                const items = await memory.worldInfo.preview();
                if (items.length === 0) { wiPreviewEl.textContent = '暂无可写回的内容（facts/summaries 为空）。'; return; }
                wiPreviewEl.textContent = items.map((i: any) => `[${i.entry}] 关键词: ${i.keywords.join(', ')} | ${i.contentLength} 字`).join('\n');
            } catch (e) { wiPreviewEl.textContent = '预览失败：' + String(e); }
        });
    }

    const bindWriteback = (btnId: string, mode: 'all' | 'summaries') => {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        btn.addEventListener('click', async () => {
            const memory = (window as any).STX?.memory;
            if (!memory?.worldInfo) { alert('Memory OS 尚未就绪。'); return; }
            if (!confirm(`确定将 ${mode === 'all' ? '事实+摘要' : '摘要'} 写回到 SillyTavern WorldInfo？\n已有旧条目将被替换。`)) return;
            btn.setAttribute('disabled', 'true');
            try {
                const result = await memory.worldInfo.writeback(mode);
                alert(`✅ 写回完成！\n世界书名: ${result.bookName}\n成功写入: ${result.written} 条`);
                if (wiPreviewEl) wiPreviewEl.textContent = '';
            } catch (e) { alert('写回失败：' + String(e)); }
            finally { btn.removeAttribute('disabled'); }
        });
    };

    bindWriteback(IDS.wiWritebackBtnId, 'all');
    bindWriteback(IDS.wiWriteSummaryBtnId, 'summaries');

    // ===== 逻辑表可编辑 =====

    const logicTableSelect = document.getElementById(IDS.logicTableEntitySelectId) as HTMLSelectElement;
    const logicTableContainer = document.getElementById(IDS.logicTableContainerId);

    /** 从当前激活模板的 entities 中构建实体类型列表 */
    const populateEntityTypes = async () => {
        const memory = (window as any).STX?.memory;
        if (!memory?.template || !logicTableSelect) return;
        const activeTemplate = await memory.template.getActive?.();
        const templates = await memory.template.listByChatKey();
        const fallbackTemplate = Array.isArray(templates) && templates.length > 0
            ? templates[templates.length - 1]
            : null;
        const targetTemplate = activeTemplate || fallbackTemplate;
        if (!targetTemplate) return;
        const entities = targetTemplate.entities || {};
        const prevVal = logicTableSelect.value;
        // 清空并填充新 options
        logicTableSelect.innerHTML = '<option value="">选择实体类型...</option>';
        for (const entityType of Object.keys(entities)) {
            const opt = document.createElement('option');
            opt.value = entityType;
            opt.textContent = entityType;
            logicTableSelect.appendChild(opt);
        }
        if (prevVal) logicTableSelect.value = prevVal;
    };

    /** 渲染逻辑表内容（按选中的实体类型加载 facts） */
    const renderLogicTable = async (entityType: string) => {
        if (!logicTableContainer) return;
        if (!entityType) { logicTableContainer.innerHTML = '<span style="color:#aaa">请选择实体类型查看。</span>'; return; }
        const memory = (window as any).STX?.memory;
        if (!memory?.worldInfo) { logicTableContainer.textContent = 'Memory OS 尚未就绪。'; return; }
        logicTableContainer.textContent = '加载中...';
        try {
            const facts = await memory.worldInfo.getLogicTable(entityType);
            if (!facts?.length) {
                logicTableContainer.innerHTML = `<span style="color:#aaa">暂无 ${entityType} 类型的事实记录。</span>`;
                return;
            }
            logicTableContainer.innerHTML = '';
            for (const fact of facts) {
                const row = document.createElement('div');
                row.style.cssText = 'display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; margin-bottom: 3px; background: rgba(255,255,255,0.04);';

                const entityLabel = fact.entity ? `[${fact.entity.kind}:${fact.entity.id}]` : '';
                const valueStr = typeof fact.value === 'object' ? JSON.stringify(fact.value) : String(fact.value);

                row.innerHTML = `
                    <span style="color:#7ca5f5; font-size: 11px; white-space: nowrap;">${entityLabel}</span>
                    <span style="color:#aaa; font-size: 11px; flex: 0 0 auto;">${fact.path || '(无路径)'}：</span>
                    <span class="stx-logic-value" contenteditable="false"
                        data-fact-key="${fact.factKey}" data-type="${fact.type}"
                        data-entity-kind="${fact.entity?.kind ?? ''}" data-entity-id="${fact.entity?.id ?? ''}"
                        data-path="${fact.path ?? ''}"
                        data-tip="双击可编辑。"
                        style="flex: 1; font-size: 11px; border-radius: 3px; padding: 1px 4px; cursor: default;"
                        >${valueStr}</span>
                `;
                // 双击转为编辑模式
                const valueEl = row.querySelector<HTMLElement>('.stx-logic-value');
                if (valueEl) {
                    valueEl.addEventListener('dblclick', () => {
                        valueEl.contentEditable = 'true';
                        valueEl.style.background = 'rgba(124,165,245,0.15)';
                        valueEl.style.outline = '1px solid #7ca5f5';
                        valueEl.style.cursor = 'text';
                        valueEl.focus();
                    });
                    valueEl.addEventListener('blur', async () => {
                        if (valueEl.contentEditable !== 'true') return;
                        valueEl.contentEditable = 'false';
                        valueEl.style.background = '';
                        valueEl.style.outline = '';
                        valueEl.style.cursor = 'default';
                        const newValueStr = valueEl.textContent?.trim() ?? '';
                        let newValue: any;
                        try { newValue = JSON.parse(newValueStr); } catch { newValue = newValueStr; }
                        try {
                            await memory.worldInfo.updateFact(
                                valueEl.dataset.factKey || undefined,
                                valueEl.dataset.type ?? entityType,
                                { kind: valueEl.dataset.entityKind ?? '', id: valueEl.dataset.entityId ?? '' },
                                valueEl.dataset.path ?? '',
                                newValue
                            );
                            valueEl.style.background = 'rgba(80,200,120,0.1)';
                            setTimeout(() => { valueEl.style.background = ''; }, 800);
                        } catch { valueEl.style.background = 'rgba(255,100,100,0.15)'; }
                    });
                }
                logicTableContainer.appendChild(row);
            }
            refreshSettingsTooltips();
        } catch (e) {
            logicTableContainer.textContent = '加载失败：' + String(e);
            refreshSettingsTooltips();
        }
    };

    if (logicTableSelect) {
        logicTableSelect.addEventListener('change', () => renderLogicTable(logicTableSelect.value));
    }

    const logicTableRefreshBtn = document.getElementById(IDS.logicTableRefreshBtnId);
    if (logicTableRefreshBtn) {
        logicTableRefreshBtn.addEventListener('click', async () => {
            await populateEntityTypes();
            if (logicTableSelect?.value) await renderLogicTable(logicTableSelect.value);
        });
    }

    // 世界模板 Tab 激活时刷新实体类型列表
    const templateTabBtn = document.getElementById(IDS.tabTemplateId);
    if (templateTabBtn) {
        templateTabBtn.addEventListener('click', populateEntityTypes);
    }

    refreshSettingsTooltips();
}
