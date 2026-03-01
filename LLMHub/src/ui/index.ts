import { buildSettingsCardStylesTemplate } from './settingsCardStylesTemplate';
import { buildSettingsCardHtmlTemplate } from './settingsCardHtmlTemplate';
import type { LLMHubSettingsIds } from './settingsCardTemplateTypes';
import manifestJson from '../../manifest.json';
import changelogData from '../../changelog.json';

// UI 组件的唯一命名空间
const NAMESPACE = 'stx-llmhub';

// 解析生成更新日志 HTML
const generateChangelogHtml = () => {
    if (!Array.isArray(changelogData) || changelogData.length === 0) return '暂无更新记录';

    return changelogData.map(log => `
      <strong>${log.version}</strong>
      <ul>
        ${(log.changes || []).map((c: string) => `<li>${c}</li>`).join('')}
      </ul>
    `).join('');
};

const IDS: LLMHubSettingsIds = {
    cardId: `${NAMESPACE}-card`,
    drawerToggleId: `${NAMESPACE}-drawer-toggle`,
    drawerContentId: `${NAMESPACE}-drawer-content`,
    drawerIconId: `${NAMESPACE}-drawer-icon`,
    displayName: manifestJson.display_name || 'LLM Hub',
    badgeId: `${NAMESPACE}-badge`,
    badgeText: `v${manifestJson.version || '1.0.0'}`,
    changelogHtml: generateChangelogHtml(),
    authorText: manifestJson.author || 'Memory OS Team',
    emailText: (manifestJson as any).email || '',
    githubText: (manifestJson as any).homePage ? (manifestJson as any).homePage.replace(/^https?:\/\//i, '') : 'GitHub',
    githubUrl: (manifestJson as any).homePage || '#',
    searchId: `${NAMESPACE}-search`,

    tabMainId: `${NAMESPACE}-tab-main`,
    tabRouterId: `${NAMESPACE}-tab-router`,
    tabVaultId: `${NAMESPACE}-tab-vault`,
    tabAboutId: `${NAMESPACE}-tab-about`,

    panelMainId: `${NAMESPACE}-panel-main`,
    panelRouterId: `${NAMESPACE}-panel-router`,
    panelVaultId: `${NAMESPACE}-panel-vault`,
    panelAboutId: `${NAMESPACE}-panel-about`,

    enabledId: `${NAMESPACE}-enabled`,
    globalProfileId: `${NAMESPACE}-global-profile`,

    defaultProviderId: `${NAMESPACE}-default-provider`,
    defaultModelId: `${NAMESPACE}-default-model`,

    vaultAddServiceId: `${NAMESPACE}-vault-service`,
    vaultApiKeyId: `${NAMESPACE}-vault-api-key`,
    vaultSaveBtnId: `${NAMESPACE}-vault-save-btn`,
    vaultClearBtnId: `${NAMESPACE}-vault-clear-btn`,
};

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
 * 在设定的拓展面板 (Extensions) 中渲染 LLMHub 设置卡片
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
            container.appendChild(cardWrapper);
        }

        // 3. 绑定内部交互逻辑
        bindUiEvents();
    } catch (error) {
        console.error(`[LLMHub] UI 渲染失败:`, error);
    }
}

/**
 * 绑定设置卡片的交互事件
 */
function bindUiEvents() {
    // 3.1 抽屉展开/折叠 (移除手动监听，交由 SillyTavern 核心的 .inline-drawer-toggle 自动处理)

    // 3.2 标签页切换
    const tabs = [
        { tabId: IDS.tabMainId, panelId: IDS.panelMainId },
        { tabId: IDS.tabRouterId, panelId: IDS.panelRouterId },
        { tabId: IDS.tabVaultId, panelId: IDS.panelVaultId },
        { tabId: IDS.tabAboutId, panelId: IDS.panelAboutId },
    ];

    tabs.forEach(({ tabId, panelId }) => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) return;

        tabEl.addEventListener('click', () => {
            tabs.forEach(t => {
                const tEl = document.getElementById(t.tabId);
                const pEl = document.getElementById(t.panelId);
                if (tEl) tEl.classList.remove('is-active');
                if (pEl) pEl.setAttribute('hidden', 'true');
            });

            const targetPanel = document.getElementById(panelId);
            tabEl.classList.add('is-active');
            if (targetPanel) {
                targetPanel.removeAttribute('hidden');
            }
        });
    });

    // 3.3 搜索过滤
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

    // 3.4 绑定 Vault 保存行为 (示例逻辑脱敏挂载)
    const vaultSaveBtn = document.getElementById(IDS.vaultSaveBtnId);
    const vaultServiceSelect = document.getElementById(IDS.vaultAddServiceId) as HTMLSelectElement;
    const vaultKeyInput = document.getElementById(IDS.vaultApiKeyId) as HTMLInputElement;

    if (vaultSaveBtn && vaultServiceSelect && vaultKeyInput) {
        vaultSaveBtn.addEventListener('click', async () => {
            const provider = vaultServiceSelect.value;
            const key = vaultKeyInput.value.trim();

            if (!key) {
                alert('API Key 不能为空');
                return;
            }

            try {
                // 调用 Vault 模块存储，具体实现可挂靠在 VaultManager 实例上
                // await vaultManager.putCredential(provider, key);
                alert(`已安全保存 ${provider} 凭据`);
                vaultKeyInput.value = ''; // 清空输入框
            } catch (e) {
                console.error('Vault 保存失败:', e);
                alert('保存失败，请检查控制台日志');
            }
        });
    }

    // ==== 持久化各项开关与下拉框状态 ====
    const stContext = (window as any).SillyTavern?.getContext?.() || {};

    const bindToggle = (toggleId: string, settingKey: string, onToggleCallback?: (val: boolean) => void) => {
        const toggleEl = document.getElementById(toggleId) as HTMLInputElement;
        if (!toggleEl) return;

        if (stContext.extensionSettings) {
            const extSet = stContext.extensionSettings['stx_llmhub'] || {};
            toggleEl.checked = extSet[settingKey] === true;
        }

        toggleEl.addEventListener('change', () => {
            const checked = toggleEl.checked;
            if (stContext.extensionSettings) {
                if (!stContext.extensionSettings['stx_llmhub']) {
                    stContext.extensionSettings['stx_llmhub'] = {};
                }
                stContext.extensionSettings['stx_llmhub'][settingKey] = checked;
                stContext.saveSettingsDebounced?.();
            }
            if (onToggleCallback) onToggleCallback(checked);
        });
    };

    // 绑定 LLM Hub 总开关
    bindToggle(IDS.enabledId, 'enabled');
    // 绑定 全局配置覆盖
    bindToggle(IDS.globalProfileId, 'globalProfile');
}
